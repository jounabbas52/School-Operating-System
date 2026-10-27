// The school app's side of the conversation with whatsapp-gateway.
//
// Server-only: it holds the platform token. Importing this from a client
// component would ship that token to the browser, and the token is the only
// thing standing between the internet and the school's WhatsApp session.
//
// The gateway is the authority on session state -- it is the process holding
// the socket. whatsapp_settings.session_status is a MIRROR of it, kept
// up to date by the events the gateway pushes, so that a page can render and
// the dispatcher can make decisions without a round trip. When the two
// disagree, the gateway is right.

const BASE = process.env.WHATSAPP_GATEWAY_URL ?? 'http://127.0.0.1:8088'
const TOKEN = process.env.WHATSAPP_INGEST_TOKEN

// Connecting and sending are quick; the gateway never blocks on the phone.
const TIMEOUT_MS = 15_000

async function call(path, { method = 'GET', body } = {}) {
  if (!TOKEN) {
    return { ok: false, error: 'WHATSAPP_INGEST_TOKEN is not set on the server.' }
  }

  let response
  let text

  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    text = await response.text()
  } catch (err) {
    // The commonest failure by far, and worth naming precisely: the gateway
    // process is simply not running. "fetch failed" sends somebody hunting
    // through the database for an hour.
    const cause = err?.name === 'TimeoutError' ? 'did not respond' : 'is not reachable'
    return {
      ok: false,
      error: `The WhatsApp gateway at ${BASE} ${cause}. Is it running (npm start in whatsapp-gateway)?`,
    }
  }

  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    parsed = {}
  }

  if (!response.ok) {
    return { ok: false, error: parsed?.error ?? `Gateway returned ${response.status}.` }
  }

  return { ok: true, ...parsed }
}

/** Current session state and, while pairing, the QR as a data URL. */
export function sessionStatus(schoolId) {
  return call(`/sessions/${schoolId}`)
}

/** Open the socket and start producing QR codes. Returns immediately. */
export function connectSession(schoolId) {
  return call(`/sessions/${schoolId}/connect`, { method: 'POST' })
}

/** Unlink, and wipe the stored keys so the next connect needs a fresh scan. */
export function logoutSession(schoolId) {
  return call(`/sessions/${schoolId}/logout`, { method: 'POST' })
}

/**
 * Send one message. The gateway paces these itself, so this call can block
 * for several seconds -- that delay is the ban protection working, not a
 * problem to tune away.
 */
export function sendMessage(schoolId, to, text) {
  return call(`/sessions/${schoolId}/send`, { method: 'POST', body: { to, text } })
}

export { BASE as GATEWAY_URL }
