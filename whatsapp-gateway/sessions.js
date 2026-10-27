import { rm } from 'node:fs/promises'
import path from 'node:path'
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys'
import QRCode from 'qrcode'
import pino from 'pino'

// One linked WhatsApp session per school, and the lifecycle around it.
//
// WHY THIS IS A RESIDENT PROCESS AND NOT AN API ROUTE
//
// A scanned session is a WebSocket that WhatsApp expects to stay open. It is
// not a request/response credential like an SMTP login -- there is no way to
// "reconnect per send" without re-handshaking the whole Signal session, and
// doing that repeatedly is exactly what gets a number flagged. So the socket
// lives here, in a process that stays up, and the school app talks to it over
// HTTP.
//
// WHAT SURVIVES A RESTART
//
// The scan is one-time. Baileys writes the Signal keys and the device
// credentials into AUTH_DIR/<school-id>/ and reloads them on boot, so a
// restart reconnects silently. Deleting that folder is the same as tapping
// "Log out" on the phone -- the next connect shows a fresh QR.

const logger = pino({ level: process.env.BAILEYS_LOG_LEVEL ?? 'silent' })

const AUTH_DIR = process.env.AUTH_DIR ?? './auth'

// WhatsApp bans numbers for burst behaviour far more readily than for volume.
// Every send on a session goes through one queue with a gap and jitter
// between them, so 400 fee reminders leave as a trickle rather than a flood.
const MIN_GAP_MS = Number(process.env.SEND_GAP_MS ?? 3000)
const JITTER_MS = Number(process.env.SEND_JITTER_MS ?? 2000)

// A socket that drops is retried with a widening gap. Hammering reconnect is
// itself a ban signal.
const RECONNECT_BASE_MS = 2000
const RECONNECT_MAX_MS = 60_000

const sessions = new Map()

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** '0300-1234567' or '+923001234567' -> '923001234567@s.whatsapp.net' */
export function toJid(phone) {
  const digits = String(phone ?? '').replace(/\D/g, '')
  return digits ? `${digits}@s.whatsapp.net` : null
}

function blank(schoolId) {
  return {
    schoolId,
    sock: null,
    // disconnected | qr | connecting | connected | logged_out
    status: 'disconnected',
    qr: null,
    qrAt: null,
    number: null,
    lastError: null,
    connectedAt: null,
    attempt: 0,
    // Serialises sends. Every sendText() chains onto this promise, which is
    // what actually enforces the gap -- a for-loop in the caller would not.
    chain: Promise.resolve(),
    closing: false,
  }
}

function get(schoolId) {
  if (!sessions.has(schoolId)) sessions.set(schoolId, blank(schoolId))
  return sessions.get(schoolId)
}

/**
 * Open (or re-open) a school's session.
 *
 * Safe to call when one is already live: it returns the existing session
 * rather than opening a second socket. Two sockets on one set of credentials
 * make WhatsApp kick BOTH, which looks exactly like a ban and is the single
 * easiest way to break this.
 */
export async function connect(schoolId, { onEvent } = {}) {
  const session = get(schoolId)

  if (session.sock && (session.status === 'connected' || session.status === 'connecting')) {
    return session
  }

  session.closing = false
  session.status = 'connecting'
  session.lastError = null

  const folder = path.join(AUTH_DIR, schoolId)
  const { state, saveCreds } = await useMultiFileAuthState(folder)
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    logger,
    auth: {
      creds: state.creds,
      // The signal key store is hit on every message; uncached it re-reads
      // files from disk each time.
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    // What the school sees under Linked Devices on their phone. Naming it
    // honestly matters -- somebody will eventually look at that list and
    // decide whether to revoke it.
    browser: ['School OS', 'Chrome', '1.0.0'],
    // Do NOT announce the linked device as online. Marking online suppresses
    // push notifications on the school's own handset, and the office still
    // needs to see messages arrive on the phone.
    markOnlineOnConnect: false,
    generateHighQualityLinkPreview: false,
    syncFullHistory: false,
  })

  session.sock = sock

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      // Baileys hands over the raw pairing string; the browser needs an
      // image. Rendering it here keeps the school app free of a QR library.
      session.qr = await QRCode.toDataURL(qr, { margin: 1, width: 320 })
      session.qrAt = Date.now()
      session.status = 'qr'
      onEvent?.({ type: 'status', schoolId, status: 'qr' })
    }

    if (connection === 'open') {
      session.status = 'connected'
      session.qr = null
      session.qrAt = null
      session.attempt = 0
      session.connectedAt = Date.now()
      session.number = sock.user?.id ? sock.user.id.split(':')[0].split('@')[0] : null
      onEvent?.({ type: 'status', schoolId, status: 'connected', number: session.number })
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode
      session.sock = null

      // 401 is the phone saying "I unlinked this device". Reconnecting is
      // pointless and the stored keys are now junk -- wipe them so the next
      // connect produces a fresh QR instead of failing in a loop.
      if (code === DisconnectReason.loggedOut) {
        session.status = 'logged_out'
        session.qr = null
        session.number = null
        session.lastError = 'The phone unlinked this device.'
        await rm(path.join(AUTH_DIR, schoolId), { recursive: true, force: true })
        onEvent?.({ type: 'status', schoolId, status: 'logged_out' })
        return
      }

      // An explicit logout() or shutdown. Leave it closed.
      if (session.closing) {
        session.status = 'disconnected'
        return
      }

      // 515 is Baileys' own "restart required" immediately after pairing --
      // normal, and the reconnect below is what completes the link.
      session.status = 'connecting'
      session.lastError = lastDisconnect?.error?.message ?? `closed (${code ?? 'unknown'})`
      session.attempt += 1

      const wait = Math.min(RECONNECT_BASE_MS * 2 ** (session.attempt - 1), RECONNECT_MAX_MS)
      onEvent?.({ type: 'status', schoolId, status: 'connecting' })

      await sleep(wait)
      if (!session.closing) connect(schoolId, { onEvent }).catch(() => {})
    }
  })

  // ------------------------------------------------------------- inbound
  sock.ev.on('messages.upsert', ({ messages, type }) => {
    // 'append' is history being back-filled. Only 'notify' is a message
    // arriving now; treating history as new would replay months of chat
    // into the log on every reconnect.
    if (type !== 'notify') return

    for (const m of messages) {
      if (m.key?.fromMe) continue
      const jid = m.key?.remoteJid ?? ''
      // Groups and broadcasts are not parents replying to a notice.
      if (!jid.endsWith('@s.whatsapp.net')) continue

      const text =
        m.message?.conversation ??
        m.message?.extendedTextMessage?.text ??
        m.message?.imageMessage?.caption ??
        null

      onEvent?.({
        type: 'inbound',
        schoolId,
        waMessageId: m.key.id,
        from: `+${jid.split('@')[0]}`,
        text: text ?? `[${Object.keys(m.message ?? { unknown: 1 })[0]}]`,
        name: m.pushName ?? null,
        at: Number(m.messageTimestamp ?? Math.floor(Date.now() / 1000)),
      })
    }
  })

  // ------------------------------------------- delivery and read receipts
  // Baileys reports these as a numeric enum on the message, not as named
  // events: 2 = server ack, 3 = delivered to the handset, 4/5 = read.
  sock.ev.on('messages.update', (updates) => {
    for (const u of updates) {
      const status = u.update?.status
      if (status == null) continue

      const named = status >= 4 ? 'read' : status === 3 ? 'delivered' : status === 2 ? 'sent' : null
      if (!named) continue

      onEvent?.({
        type: 'status',
        schoolId,
        waMessageId: u.key?.id,
        messageStatus: named,
        at: Math.floor(Date.now() / 1000),
      })
    }
  })

  return session
}

/** What the connection screen polls. Never includes credentials. */
export function status(schoolId) {
  const s = sessions.get(schoolId)
  if (!s) return { status: 'disconnected', qr: null, number: null, lastError: null }

  // A QR is only valid for about 60 seconds before WhatsApp rotates it.
  // Serving a stale one gives the school a code that silently never works.
  const fresh = s.qr && Date.now() - s.qrAt < 60_000

  return {
    status: s.status,
    qr: fresh ? s.qr : null,
    number: s.number,
    lastError: s.lastError,
    connectedAt: s.connectedAt,
  }
}

/** Unlink. Wipes the stored keys, so the next connect needs a fresh scan. */
export async function logout(schoolId) {
  const s = sessions.get(schoolId)
  s && (s.closing = true)

  try {
    // Tell the phone, so the device disappears from its Linked Devices list
    // rather than lingering as a dead entry.
    await s?.sock?.logout()
  } catch {
    // Already gone, or the socket was never open. The wipe below is what
    // actually matters.
  }

  try {
    s?.sock?.end?.()
  } catch {}

  await rm(path.join(AUTH_DIR, schoolId), { recursive: true, force: true })
  sessions.set(schoolId, blank(schoolId))
}

/**
 * Send one text message.
 *
 * Every call for a school queues behind the previous one with a randomised
 * gap. The caller does not have to know that -- it just awaits, and the
 * pacing happens here where the session is.
 */
export function sendText(schoolId, phone, text) {
  const session = get(schoolId)

  const run = async () => {
    if (!session.sock || session.status !== 'connected') {
      return { ok: false, retryable: true, error: `session is ${session.status}` }
    }

    const jid = toJid(phone)
    if (!jid) return { ok: false, retryable: false, error: 'not a phone number' }

    try {
      // Is this number even on WhatsApp? Asking first turns a silent
      // non-delivery into an honest failure the office can act on, and
      // avoids sending into the void -- which is itself a spam signal.
      const [probe] = await session.sock.onWhatsApp(jid)
      if (!probe?.exists) {
        return { ok: false, retryable: false, error: 'not registered on WhatsApp' }
      }

      const sent = await session.sock.sendMessage(probe.jid, { text })

      await sleep(MIN_GAP_MS + Math.random() * JITTER_MS)

      return { ok: true, waMessageId: sent?.key?.id ?? null }
    } catch (err) {
      return {
        ok: false,
        // A socket that died mid-send deserves a retry; a malformed message
        // does not. Anything we cannot classify is treated as retryable,
        // because a parent not told is worse than a duplicate.
        retryable: true,
        error: String(err?.message ?? err).slice(0, 400),
      }
    }
  }

  // Chain, and keep the chain alive even when one send throws.
  const result = session.chain.then(run, run)
  session.chain = result.then(
    () => undefined,
    () => undefined
  )
  return result
}

export function list() {
  return [...sessions.values()].map((s) => ({
    schoolId: s.schoolId,
    status: s.status,
    number: s.number,
  }))
}

/** Close every socket cleanly on shutdown, without wiping credentials. */
export async function shutdown() {
  for (const s of sessions.values()) {
    s.closing = true
    try {
      s.sock?.end?.()
    } catch {}
  }
}
