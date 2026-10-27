import http from 'node:http'
import { connect, list, logout, sendText, shutdown, status } from './sessions.js'

// The HTTP face of the gateway. Deliberately tiny and deliberately dumb:
// it holds sockets and moves text. It has no database credentials and knows
// nothing about students, fees or schools beyond an opaque id.
//
// That split is the point. If this process is ever compromised, what leaks
// is the ability to send WhatsApp messages -- not the school's records.
//
// AUTHENTICATION is the same platform token the school app's dispatcher
// holds, checked on every route. Bind it to localhost unless the app runs on
// a different machine; this must never face the public internet.

const PORT = Number(process.env.PORT ?? 8088)
const HOST = process.env.HOST ?? '127.0.0.1'
const TOKEN = process.env.WHATSAPP_INGEST_TOKEN
const APP_URL = process.env.APP_URL ?? 'http://localhost:3000'

if (!TOKEN) {
  console.error('WHATSAPP_INGEST_TOKEN is not set — refusing to start.')
  process.exit(1)
}

const json = (res, status_, body) => {
  const payload = JSON.stringify(body)
  res.writeHead(status_, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
  })
  res.end(payload)
}

async function readJson(req) {
  const chunks = []
  for await (const c of req) chunks.push(c)
  if (!chunks.length) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    return null
  }
}

// Push an inbound message or a delivery receipt back to the school app,
// which owns the database. Fire and forget: a send must never be held up,
// and must never fail, because a receipt could not be filed.
async function postEvent(event) {
  try {
    await fetch(`${APP_URL}/api/whatsapp/events`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(8000),
    })
  } catch (err) {
    // Logged, not thrown. The app being down for a minute costs a delivery
    // receipt; it must not cost the session.
    console.warn(`[gateway] could not deliver ${event.type} event:`, err?.message ?? err)
  }
}

const onEvent = (event) => {
  postEvent(event)
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`)
  const parts = url.pathname.split('/').filter(Boolean)

  if (url.pathname === '/health') return json(res, 200, { ok: true, sessions: list() })

  const auth = req.headers.authorization ?? ''
  if (auth !== `Bearer ${TOKEN}`) return json(res, 401, { error: 'Unauthorized' })

  // /sessions/:schoolId[/action]
  if (parts[0] !== 'sessions' || !parts[1]) return json(res, 404, { error: 'Not found' })

  const schoolId = parts[1]
  const action = parts[2] ?? ''

  try {
    if (req.method === 'GET' && !action) {
      return json(res, 200, status(schoolId))
    }

    if (req.method === 'POST' && action === 'connect') {
      // Does not wait for the QR: opening the socket and the code arriving
      // are separate events. The screen polls GET for it a moment later.
      connect(schoolId, { onEvent }).catch((err) =>
        console.error(`[gateway] connect ${schoolId} failed:`, err?.message ?? err)
      )
      return json(res, 202, { status: 'connecting' })
    }

    if (req.method === 'POST' && action === 'logout') {
      await logout(schoolId)
      return json(res, 200, { status: 'disconnected' })
    }

    if (req.method === 'POST' && action === 'send') {
      const body = await readJson(req)
      if (!body) return json(res, 400, { error: 'Body must be JSON.' })

      const { to, text } = body
      if (!to || !text) return json(res, 400, { error: 'to and text are required.' })

      const result = await sendText(schoolId, to, text)
      return json(res, result.ok ? 200 : 502, result)
    }

    return json(res, 404, { error: 'Not found' })
  } catch (err) {
    console.error('[gateway]', err)
    return json(res, 500, { error: String(err?.message ?? err) })
  }
})

server.listen(PORT, HOST, () => {
  console.log(`[gateway] listening on http://${HOST}:${PORT}`)
  console.log(`[gateway] school app at ${APP_URL}`)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    console.log('\n[gateway] closing sockets…')
    await shutdown()
    server.close(() => process.exit(0))
    // Credentials are on disk, so a restart reconnects without a new scan.
    setTimeout(() => process.exit(0), 3000).unref()
  })
}
