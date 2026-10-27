import { createClient } from '@supabase/supabase-js'
import { sendMessage } from '@/lib/whatsapp/gateway'

// The drain. Takes queued messages and hands them to the gateway.
//
// WHY THIS IS NOT A SERVER ACTION
//
// The gateway paces sends at one every few seconds to protect the number,
// so 400 fee reminders is twenty-odd minutes of trickle. That cannot happen
// inside a request. The UI only ever writes rows; this endpoint, driven by
// cron, is the only thing that sends.
//
// Run it every couple of minutes. Overlapping runs are safe:
// whatsapp_claim_batch() flips rows to 'sending' under SKIP LOCKED, so two
// dispatchers never pick up the same message -- which on this channel
// matters doubly, because a parent receiving everything twice is what gets
// a number reported.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Small batches on purpose. At roughly 3-5 seconds a message, 15 is about a
// minute of work -- comfortably inside any timeout, and the rest simply
// goes out on the next run. There is no prize for draining it all at once.
const BATCH = 15
const BUDGET_MS = 90_000

async function drain() {
  const token = process.env.WHATSAPP_INGEST_TOKEN
  if (!token) {
    console.error('[whatsapp] WHATSAPP_INGEST_TOKEN is not set')
    return Response.json({ error: 'Not configured' }, { status: 500 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )

  // Claiming moves 'queued' -> 'sending'. From here every claimed row MUST
  // be reported back, or it sits in 'sending' forever: invisible to the
  // next claim and never retried. That is why no path below skips
  // whatsapp_record_send().
  const { data: batch, error } = await supabase.rpc('whatsapp_claim_batch', {
    p_token: token,
    p_limit: BATCH,
  })

  if (error) {
    console.error('[whatsapp] claim failed:', error.message)
    return Response.json({ error: error.message }, { status: 502 })
  }

  const messages = batch ?? []
  if (!messages.length) return Response.json({ claimed: 0, sent: 0, failed: 0 })

  const started = Date.now()
  let sent = 0
  let failed = 0
  let requeued = 0

  for (const m of messages) {
    const report = (ok, extra) =>
      supabase.rpc('whatsapp_record_send', {
        p_token: token,
        p_id: m.id,
        p_ok: ok,
        p_wa_id: extra.waMessageId ?? null,
        p_error: extra.error ?? null,
        p_retryable: extra.retryable ?? true,
      })

    // Out of time. Hand the rest straight back to 'queued' rather than
    // leaving them stranded in 'sending' when the function is killed.
    if (Date.now() - started > BUDGET_MS) {
      await report(false, {
        error: 'Dispatcher ran out of time; requeued for the next run.',
        retryable: true,
      })
      requeued += 1
      continue
    }

    const result = await sendMessage(m.school_id, m.to_phone, m.body)

    const { error: recordError } = await report(result.ok, {
      waMessageId: result.waMessageId,
      error: result.error,
      // The gateway distinguishes "the socket died" from "this number is
      // not on WhatsApp". Only the first deserves another two attempts.
      retryable: result.retryable !== false,
    })

    if (recordError) {
      // The message may well have gone; we just failed to write it down.
      // Log loudly -- this is the one case that can produce a duplicate on
      // the next run, and whoever reads the logs needs to know why.
      console.error(`[whatsapp] sent ${m.id} but could not record it:`, recordError.message)
    }

    if (result.ok) sent += 1
    else failed += 1
  }

  return Response.json({ claimed: messages.length, sent, failed, requeued })
}

function authorized(request) {
  const header = request.headers.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  return Boolean(token) && token === process.env.WHATSAPP_INGEST_TOKEN
}

const unauthorized = () => Response.json({ error: 'Unauthorized' }, { status: 401 })

// Cron issues a GET; the app's "Send now" button posts. Same token, same
// work, so both land here.
export async function GET(request) {
  if (!authorized(request)) return unauthorized()
  return drain()
}

export async function POST(request) {
  if (!authorized(request)) return unauthorized()
  return drain()
}
