// Turning what the office typed into what Meta accepts.
//
// WHY THIS FILE IS THE HARD PART
//
// students.father_whatsapp and friends are varchar(30) free text that has
// been typed by hand for years. A real export of one school looks like:
//
//   0300-1234567      03001234567     +92 300 1234567    92 300 1234567
//   0092-300-1234567  300 1234567     0300 1234567 (abbu)
//   042-35761234      0300-1234567 / 0321-9876543
//
// Meta accepts exactly one of those shapes: E.164, digits only, no spaces,
// no leading zero, country code included. Everything here exists to get
// from the left column to that, and -- just as importantly -- to return
// null rather than a guess when it cannot.
//
// A WRONG NUMBER IS WORSE THAN NO NUMBER. A plausible-looking normalisation
// of a typo sends a child's attendance record to a stranger, and the school
// never finds out. So every rule below is conservative: if the result is
// not a shape Pakistan actually issues, this returns null and the student
// shows up in the "unreachable" list where somebody can fix the record.

// Pakistan. Changing this is most of what another country would need.
const COUNTRY_CODE = '92'

// Mobile numbers are 10 digits after the country code and always start with
// 3 (03xx nationally). This is the check that rejects a landline typed into
// a WhatsApp field -- which is the single most common bad row.
const MOBILE_NSN = /^3\d{9}$/

// Landlines are 9-10 digits after the country code: a 2-4 digit area code
// plus a 6-8 digit subscriber number. Accepted by toE164 because a school's
// own number is a landline, but isMobile() tells them apart, and the parent
// contact screens only trust mobiles.
const LANDLINE_NSN = /^[2-9]\d{8,9}$/

// Somebody typed two numbers in one field. Take the first and let the rest
// go -- better than concatenating them into a 22-digit non-number.
const SEPARATORS = /[/,;&]| or /i

/**
 * Normalise one free-text phone number to E.164, or null.
 *
 * Deliberately NOT exported as a loose "clean up" helper: the null return is
 * the contract, and every caller must handle it.
 */
export function toE164(raw) {
  if (raw == null) return null

  // Only ever look at the first number in the field.
  let s = String(raw).split(SEPARATORS)[0]

  // Drop anything a human added for readability or as a note: dashes,
  // spaces, brackets, and trailing words like "(abbu)".
  s = s.replace(/[^\d+]/g, '')
  if (!s) return null

  // 00 is the international prefix dialled from Pakistan; + is the same
  // thing written down.
  if (s.startsWith('00')) s = `+${s.slice(2)}`

  let nsn

  if (s.startsWith('+')) {
    const digits = s.slice(1)
    // A + that is not ours is left alone -- an overseas parent is real, and
    // guessing a country code for them would be inventing data. We only
    // verify it is long enough to be a phone number at all.
    if (!digits.startsWith(COUNTRY_CODE)) {
      return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null
    }
    nsn = digits.slice(COUNTRY_CODE.length)
  } else if (s.startsWith(COUNTRY_CODE) && s.length > 11) {
    // '923001234567'. The length guard matters: '9230000000' is far more
    // likely a mistyped local number than a country code plus 8 digits.
    nsn = s.slice(COUNTRY_CODE.length)
  } else if (s.startsWith('0')) {
    // The national form, '03001234567'. The trunk 0 is dropped in E.164 --
    // leaving it in is the classic bug that makes every message fail.
    nsn = s.slice(1)
  } else {
    // Bare '3001234567', typed without the leading zero.
    nsn = s
  }

  if (!MOBILE_NSN.test(nsn) && !LANDLINE_NSN.test(nsn)) return null

  return `+${COUNTRY_CODE}${nsn}`
}

/** Is this an E.164 string that WhatsApp could plausibly reach? */
export function isValidE164(value) {
  return typeof value === 'string' && /^\+\d{8,15}$/.test(value)
}

/**
 * Mobiles only. WhatsApp on a landline is possible in theory and essentially
 * never true for a parent, so the send screens filter on this -- a queued
 * message to a landline is a wasted template charge and a failed delivery.
 */
export function isMobile(e164) {
  if (!isValidE164(e164)) return false
  const digits = e164.slice(1)
  if (!digits.startsWith(COUNTRY_CODE)) return true // can't judge another country
  return MOBILE_NSN.test(digits.slice(COUNTRY_CODE.length))
}

/** '+923001234567' -> '0300 1234567', for showing a clerk something familiar. */
export function phoneLabel(e164) {
  if (!isValidE164(e164)) return e164 ?? '—'
  const digits = e164.slice(1)
  if (!digits.startsWith(COUNTRY_CODE)) return e164
  const nsn = digits.slice(COUNTRY_CODE.length)
  if (!MOBILE_NSN.test(nsn)) return e164
  return `0${nsn.slice(0, 3)} ${nsn.slice(3)}`
}

// The order in which a student's contact fields are tried.
//
// father_whatsapp first because it is the only field that was ever ASKED as
// a WhatsApp number; the rest are phone numbers that may or may not have
// WhatsApp on them. guardian_phone is last because it is frequently the
// school's own office number on records where nothing else was known.
const STUDENT_FIELDS = [
  'father_whatsapp',
  'whatsapp_number',
  'father_mobile',
  'guardian_phone',
  'student_mobile',
]

/**
 * The best WhatsApp number for a student, and where it came from.
 *
 * Returns { phone, field } or { phone: null, field: null }. The field is
 * carried so the unreachable-students list can say "father_whatsapp is a
 * landline" instead of just "no number", which is the difference between a
 * clerk fixing it and ignoring it.
 */
export function studentPhone(student) {
  if (!student) return { phone: null, field: null }

  for (const field of STUDENT_FIELDS) {
    const e164 = toE164(student[field])
    if (e164 && isMobile(e164)) return { phone: e164, field }
  }

  // Nothing usable. Report the first field that HAD something in it, so the
  // message is about a bad number rather than a missing one.
  for (const field of STUDENT_FIELDS) {
    if (String(student[field] ?? '').trim()) return { phone: null, field }
  }

  return { phone: null, field: null }
}

/**
 * Collapse a list of recipients onto one message per NUMBER.
 *
 * Three siblings share a father. Sending him three identical "school closed
 * tomorrow" messages costs three times as much and reads as spam -- which
 * is a real risk to the number's quality rating, not just an annoyance.
 *
 * Per-student messages (an absence alert naming a child) must NOT use this:
 * those are genuinely three different messages. It is for announcements.
 */
export function dedupeByPhone(recipients) {
  const seen = new Map()
  for (const r of recipients) {
    if (!r?.phone) continue
    if (!seen.has(r.phone)) seen.set(r.phone, r)
  }
  return [...seen.values()]
}
