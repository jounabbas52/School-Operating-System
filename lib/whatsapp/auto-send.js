import { studentPhone } from './phone'

// Fire-and-forget automatic messages: the receipt after a payment, the
// alert after a register is marked absent.
//
// THE RULE THIS FILE EXISTS TO ENFORCE
//
// A WhatsApp failure must NEVER fail the thing that triggered it. The fee
// was taken; the register was saved. If the gateway is down, the template
// is missing, or the parent opted out, that is a message not sent -- not a
// payment reversed and not a red error over a register the clerk just
// spent five minutes filling in.
//
// So every function here swallows its errors and returns a count. Callers
// are expected to ignore the result or fold it into a success message, and
// nothing here is ever awaited in a way that can reject.
//
// WHAT IT DOES NOT DO
//
// It does not decide whether sending is switched on, and it does not render
// the message. Both happen inside whatsapp_auto_enqueue() in the database,
// because the people who trigger these -- a fee clerk, a class teacher --
// do not hold whatsapp.write, and a rule enforced out here would be a rule
// they could be made to bypass. See 033_whatsapp_auto_send.sql.

/**
 * Queue one automatic message per recipient.
 *
 * @param supabase   a server client for the CURRENT user -- the RPC pins
 *                   itself to their school
 * @param event      absence | fee_due | fee_received | result | admission
 * @param recipients [{ phone, student_id?, variables: { key: value } }]
 * @returns          { queued, skipped } -- zeroes if WhatsApp is off
 */
export async function autoSend(supabase, event, recipients) {
  if (!recipients?.length) return { queued: 0, skipped: 0 }

  try {
    const { data, error } = await supabase.rpc('whatsapp_auto_enqueue', {
      p_event: event,
      p_recipients: recipients,
    })

    if (error) {
      // Logged, never surfaced. The caller's own operation succeeded.
      console.warn(`[whatsapp] auto-send ${event} failed:`, error.message)
      return { queued: 0, skipped: 0 }
    }

    const row = Array.isArray(data) ? data[0] : data
    return { queued: row?.queued ?? 0, skipped: row?.skipped ?? 0 }
  } catch (err) {
    console.warn(`[whatsapp] auto-send ${event} threw:`, err?.message ?? err)
    return { queued: 0, skipped: 0 }
  }
}

// The columns studentPhone() needs. Exported so a caller's existing SELECT
// can be widened to cover it without guessing the list.
export const PHONE_COLUMNS =
  'father_whatsapp, whatsapp_number, father_mobile, guardian_phone, student_mobile'

/**
 * Turn student rows into recipients, dropping anybody unreachable.
 *
 * `variablesFor` receives the student row and returns the merge values for
 * that one message -- which is what makes these per-student rather than a
 * broadcast: "Ali was absent", not "a child was absent".
 */
export function recipientsFrom(students, variablesFor) {
  const out = []

  for (const s of students ?? []) {
    const { phone } = studentPhone(s)
    // No usable mobile is not an error here. The Messages tab shows who
    // could not be reached; a register save is the wrong moment to raise it.
    if (!phone) continue

    out.push({
      phone,
      student_id: s.id,
      variables: variablesFor(s),
    })
  }

  return out
}

/** The school's own name, for the {school_name} field. */
export async function schoolName(supabase, schoolId) {
  const { data } = await supabase
    .from('schools')
    .select('school_name')
    .eq('id', schoolId)
    .maybeSingle()
  return data?.school_name ?? ''
}
