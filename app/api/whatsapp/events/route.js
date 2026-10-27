import { createClient } from '@supabase/supabase-js'

// Where whatsapp-gateway reports back: delivery receipts, parents' replies,
// and session state changes.
//
// Deliberately NOT using @/lib/supabase/server: that client reads the
// session cookie, and the gateway is a machine with no session. This is a
// bare anon client -- the honest description of the caller.
//
// Nothing here decides whether the caller is allowed. The platform token
// does, and it is checked by the DATABASE inside whatsapp_ingest_events(),
// against a bcrypt hash -- the same pattern the punches route uses for gate
// devices. Checking it here as well would be theatre; the RPC is granted to
// anon and is reachable with or without this route.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request) {
  const token = process.env.WHATSAPP_INGEST_TOKEN
  if (!token) {
    console.error('[whatsapp] WHATSAPP_INGEST_TOKEN is not set')
    return Response.json({ error: 'Not configured' }, { status: 500 })
  }

  // Cheap rejection before touching the database. The real check is in the
  // RPC; this just stops obvious noise.
  const auth = request.headers.get('authorization') ?? ''
  if (auth !== `Bearer ${token}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let payload
  try {
    payload = await request.json()
  } catch {
    return Response.json({ error: 'Body must be JSON.' }, { status: 400 })
  }

  // The gateway posts one event at a time, but the RPC takes an array so a
  // future batch needs no second code path.
  const events = Array.isArray(payload) ? payload : [payload]

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )

  const { data, error } = await supabase.rpc('whatsapp_ingest_events', {
    p_token: token,
    p_events: events,
  })

  if (error) {
    console.error('[whatsapp] ingest failed:', error.message)
    return Response.json({ error: error.message }, { status: 502 })
  }

  const row = Array.isArray(data) ? data[0] : data

  return Response.json({
    received: events.length,
    receipts: row?.receipts ?? 0,
    inbound: row?.inbound ?? 0,
    sessions: row?.sessions ?? 0,
  })
}
