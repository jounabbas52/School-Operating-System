import { createClient } from '@supabase/supabase-js'

// The monthly billing run, for a scheduler to call.
//
// Point any cron at this once a day:
//
//   curl -X POST https://<host>/api/cron/fees \
//        -H "Authorization: Bearer $FEE_CRON_TOKEN"
//
// Daily, not monthly, and that is on purpose. Each school names its own
// billing day in Settings -> Fee & Finance, and the database decides whether
// today is that day. One schedule entry serves every school, and changing a
// school's billing day does not mean editing a cron.
//
// WHY THIS ROUTE DECIDES NOTHING
//
// Like the WhatsApp dispatcher and the biometric gates, the caller here is a
// machine with no session, so auth.uid() is null and current_school_id()
// answers nothing. The token is the authorisation and the DATABASE checks it,
// against a bcrypt hash, inside run_fee_generation(). This route holds no
// privilege of its own: it reads a header, passes the string through, and
// returns what it is told. It could be replaced by curl without weakening
// anything, which is the test of whether a check is real or theatre.
//
// Nothing happens for a school that has not switched automation on. That is
// the shipped default -- see the header of migration 031 for why something
// that writes bills for every family in a school does not default to on.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function run(request) {
  const token =
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    request.headers.get('x-fee-cron-token') ??
    ''

  if (!token) {
    return Response.json({ error: 'Missing token' }, { status: 401 })
  }

  // A bare anon client, which is the honest description of the caller: no
  // session, no service role, no privilege beyond the token it presents.
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )

  // An explicit date is allowed so a missed day can be made up by hand. The
  // one-month-one-bill rule means re-running a day that already ran raises
  // nothing, so this is safe to retry.
  const url = new URL(request.url)
  const on = url.searchParams.get('on')

  const { data, error } = await supabase.rpc('run_fee_generation', {
    p_token: token,
    p_on: on || null,
  })

  if (error) {
    // 42501 is the database refusing the token. Anything else is a fault.
    const refused = error.code === '42501'
    if (!refused) console.error('[fee-cron]', error)
    return Response.json(
      { error: refused ? 'Not authorised' : 'Generation failed' },
      { status: refused ? 401 : 500 }
    )
  }

  const schools = data?.schools ?? []
  const made = schools.reduce((sum, s) => sum + (Number(s.made) || 0), 0)
  const failures = schools.filter((s) => s.error)

  if (failures.length) console.error('[fee-cron] schools that failed', failures)

  return Response.json({
    on: data?.on ?? null,
    schools: schools.length,
    vouchers: made,
    failed: failures.length,
  })
}

export async function POST(request) {
  return run(request)
}

// Some schedulers can only issue a GET. The run is idempotent, so this is
// not the usual objection to a GET that changes state: calling it twice on
// the same day raises nothing the second time.
export async function GET(request) {
  return run(request)
}
