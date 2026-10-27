// Shared vocabulary for the WhatsApp screens. The id strings here MUST
// match the CHECK constraints in 028_whatsapp.sql, because the database is
// what rejects a bad one.
//
// No imports, on purpose: both server components and client components pull
// from this file, and lib/whatsapp/gateway.js (which holds the platform
// token) must never be reachable from a browser bundle.

// THE SAFE COLUMN LIST FOR whatsapp_settings.
//
// SELECT on whatsapp_settings.api_access_token is revoked from authenticated
// (028, section 7e), so `select('*')` does not omit the column -- it fails
// the entire query with a permission error. Every read of that table names
// its columns, and they all name these.
export const SETTINGS_COLUMNS =
  'id, school_id, session_status, linked_number, last_connected_at, is_enabled, ' +
  'daily_cap, quiet_from, quiet_until, last_error, last_sent_at, auto_send, ' +
  'send_delay_min, send_delay_max, api_enabled, api_fallback, waba_id, ' +
  'phone_number_id, meta_app_id, api_status, api_checked_at, api_error, updated_at'

export const MESSAGE_STATUSES = [
  // 'queued' and 'sending' are still in play. Everything below is history.
  { id: 'queued', label: 'Queued', tone: 'pill-muted' },
  { id: 'sending', label: 'Sending', tone: 'pill-amber' },
  // Handed to WhatsApp. NOT the same as delivered, and the UI must never
  // say "delivered" for this -- see the note at the foot of the log.
  { id: 'sent', label: 'Sent', tone: 'pill-blue' },
  { id: 'delivered', label: 'Delivered', tone: 'pill-green' },
  { id: 'read', label: 'Read', tone: 'pill-green' },
  { id: 'failed', label: 'Failed', tone: 'pill-red' },
  { id: 'cancelled', label: 'Cancelled', tone: 'pill-muted' },
  { id: 'received', label: 'Reply', tone: 'pill-brand' },
]

export const MESSAGE_STATUS_LABEL = Object.fromEntries(
  MESSAGE_STATUSES.map((s) => [s.id, s.label])
)
export const MESSAGE_STATUS_TONE = Object.fromEntries(
  MESSAGE_STATUSES.map((s) => [s.id, s.tone])
)

// The linked-device lifecycle, as the Connection tab shows it. Each one
// needs a different sentence, because each needs a different action from
// whoever is reading it.
export const SESSION_STATES = {
  disconnected: {
    label: 'Not connected',
    tone: 'pill-muted',
    help: 'No phone is linked. Press Connect to get a QR code.',
  },
  connecting: {
    label: 'Connecting…',
    tone: 'pill-amber',
    help: 'Opening the connection to WhatsApp…',
  },
  qr: {
    label: 'Scan QR Code',
    tone: 'pill-brand',
    help: 'Scan the code with the school phone. It expires after about a minute.',
  },
  connected: {
    label: 'Connected',
    tone: 'pill-green',
    help: 'The school phone is linked and messages can go out.',
  },
  logged_out: {
    label: 'Unlinked',
    tone: 'pill-red',
    help: 'The phone removed this device under Linked Devices. Scan again to reconnect.',
  },
}

/* ------------------------------------------------------------- variables */

// THE MERGE FIELDS, and the single source of truth for them.
//
// Named rather than positional ({student_name}, not {{1}}) because the
// template editor lets you click one in at the cursor: a chip that inserts
// "{{2}}" tells the writer nothing, and the body becomes unreadable the
// moment anybody reorders a sentence.
//
// `sample` is what the preview substitutes, so a school sees the sentence a
// parent will see rather than a row of braces.
export const TEMPLATE_VARIABLES = [
  { key: 'student_name', label: 'Student name', sample: 'Ali Raza' },
  { key: 'father_name', label: 'Father name', sample: 'Raza Ahmed' },
  { key: 'class_name', label: 'Class', sample: 'Class 6' },
  { key: 'section_name', label: 'Section', sample: 'B' },
  { key: 'roll_number', label: 'Roll number', sample: '21' },
  { key: 'admission_number', label: 'Admission no.', sample: 'ADM-1042' },
  { key: 'school_name', label: 'School name', sample: 'City Grammar School' },
  { key: 'date', label: 'Date', sample: '20 Oct 2026' },
  { key: 'time', label: 'Time', sample: '08:15 AM' },
  { key: 'month', label: 'Month', sample: 'October' },
  { key: 'attendance_status', label: 'Attendance status', sample: 'Absent' },
  { key: 'amount', label: 'Amount', sample: 'Rs 4,500' },
  { key: 'balance', label: 'Balance', sample: 'Rs 1,200' },
  { key: 'due_date', label: 'Due date', sample: '10 Nov 2026' },
  { key: 'challan_number', label: 'Challan no.', sample: 'CH-0091' },
  { key: 'exam_name', label: 'Exam name', sample: 'First Term' },
  { key: 'result_link', label: 'Result link', sample: 'https://…' },
]

export const VARIABLE_KEYS = TEMPLATE_VARIABLES.map((v) => v.key)

const SAMPLES = Object.fromEntries(TEMPLATE_VARIABLES.map((v) => [v.key, v.sample]))

/**
 * Fill {name} placeholders from an object.
 *
 * An unknown or unsupplied placeholder is LEFT AS IT IS rather than blanked,
 * so a half-filled preview visibly reads as unfinished instead of looking
 * like a sentence with a word missing -- and so a typo like {studnt_name}
 * shows up in the preview instead of silently vanishing from the message.
 */
export function renderTemplate(body, values = {}) {
  if (!body) return ''
  return String(body).replace(/\{([a-z0-9_]+)\}/gi, (match, key) => {
    const value = values[key]
    return value == null || value === '' ? match : String(value)
  })
}

/** Preview with the sample values, for the editor. */
export function previewTemplate(body) {
  return renderTemplate(body, SAMPLES)
}

/** Which merge fields a body actually uses, in order of first appearance. */
export function usedVariables(body) {
  if (!body) return []
  const seen = []
  for (const m of String(body).matchAll(/\{([a-z0-9_]+)\}/gi)) {
    if (!seen.includes(m[1])) seen.push(m[1])
  }
  return seen
}

/** Placeholders that are not merge fields we know how to fill. */
export function unknownVariables(body) {
  return usedVariables(body).filter((k) => !VARIABLE_KEYS.includes(k))
}

/* ------------------------------------------------------------- auto-send */

// The school events that can send a message on their own, and the template
// each one reaches for.
//
// `key` is stored in whatsapp_templates.event and in the auto_send jsonb on
// whatsapp_settings, so these strings are schema. Adding one here without
// adding a trigger that calls autoSend() gives a switch that does nothing,
// which is worse than no switch at all.
export const AUTO_SEND_EVENTS = [
  {
    key: 'absence',
    label: 'Student marked absent',
    hint: 'One message per absent child, after the register is saved.',
    icon: '✓',
  },
  {
    key: 'fee_due',
    label: 'Fee challan issued',
    hint: 'When a challan is created for a student.',
    icon: '₨',
  },
  {
    key: 'fee_received',
    label: 'Fee payment received',
    hint: 'A receipt, the moment the counter takes money.',
    icon: '✓',
  },
  {
    key: 'result',
    label: 'Result published',
    hint: 'When an exam result is marked published.',
    icon: '▦',
  },
  {
    key: 'admission',
    label: 'New admission',
    hint: 'A welcome message when a student is admitted.',
    icon: '◉',
  },
]

export const AUTO_SEND_KEYS = AUTO_SEND_EVENTS.map((e) => e.key)

export const EVENT_LABEL = Object.fromEntries(AUTO_SEND_EVENTS.map((e) => [e.key, e.label]))

// Templates are keyed by event; 'custom' is the catch-all for ones written
// for a particular announcement and reused by hand.
export const TEMPLATE_EVENTS = [
  ...AUTO_SEND_EVENTS.map((e) => ({ id: e.key, label: e.label })),
  { id: 'custom', label: 'Other / manual' },
]

/* ------------------------------------------------------------------ API */

// The official Cloud API sits ALONGSIDE the linked phone, it does not
// replace it. Meta must approve each template's wording before the API may
// send it, so a message only takes that route when its template is
// Approved; everything else -- campaigns, free text, anything unapproved --
// goes through the linked phone.
export const API_TEMPLATE_STATES = {
  none: { label: 'Linked phone only', tone: 'pill-muted' },
  pending: { label: 'In review', tone: 'pill-amber' },
  approved: { label: 'Approved', tone: 'pill-green' },
  rejected: { label: 'Rejected', tone: 'pill-red' },
  paused: { label: 'Paused by Meta', tone: 'pill-amber' },
}
