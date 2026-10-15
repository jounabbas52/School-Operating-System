import { createClient } from '@supabase/supabase-js'

// The endpoint a thumb device (or the agent driving one) posts to.
//
// Deliberately NOT using @/lib/supabase/server: that client reads the session
// cookie, and a gate device has no session. This one is a bare anon client
// with no cookie handling at all, which is the honest description of the
// caller -- an unauthenticated machine holding a device token.
//
// The token is checked inside ingest_attendance_punches(), by the database,
// against a bcrypt hash. Nothing here decides whether the caller is allowed;
// this route only shapes the request and the reply.
//
// POST /api/attendance/punches
// {
//   "serial": "ZK01",
//   "token":  "…",
//   "punches": [
//     { "user_id": "17", "at": "2026-10-15T07:48:12+05:00",
//       "id": "ZK01:17:1760500092", "direction": "auto" }
//   ]
// }

// One press is a few hundred bytes; this is a week of a large school's gate
// traffic in a single call, and a sane ceiling on a request from an
// unauthenticated caller.
const MAX_PUNCHES = 5000

function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

export async function POST(request) {
  let payload
  try {
    payload = await request.json()
  } catch {
    return json({ error: 'Body must be JSON.' }, 400)
  }

  const serial = String(payload?.serial ?? '').trim()
  const token = String(payload?.token ?? '').trim()
  const punches = payload?.punches

  if (!serial || !token) return json({ error: 'serial and token are required.' }, 400)
  if (!Array.isArray(punches)) return json({ error: 'punches must be an array.' }, 400)
  if (punches.length === 0) return json({ accepted: 0, duplicates: 0 })
  if (punches.length > MAX_PUNCHES) {
    return json({ error: `Send at most ${MAX_PUNCHES} punches per request.` }, 413)
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )

  const { data, error } = await supabase.rpc('ingest_attendance_punches', {
    p_serial: serial,
    p_token: token,
    p_punches: punches,
  })

  if (error) {
    // 28000 is the invalid-authorization class the function raises for both a
    // bad serial and a bad token.
    if (error.code === '28000') return json({ error: 'Unknown device or bad token.' }, 401)
    return json({ error: error.message }, 400)
  }

  const row = Array.isArray(data) ? data[0] : data

  // `duplicates` is the number the agent should care about: it is how it
  // learns a retry landed on punches already stored, rather than guessing.
  return json({
    accepted: Number(row?.accepted) || 0,
    duplicates: Number(row?.duplicates) || 0,
  })
}

// A liveness probe for the agent, so somebody standing at the gate can tell
// whether the URL is reachable without sending a fake punch.
export async function GET() {
  return json({ ok: true, endpoint: 'attendance/punches', max_punches: MAX_PUNCHES })
}
