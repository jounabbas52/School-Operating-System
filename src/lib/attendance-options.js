// Plain module on purpose -- no 'use client'.
//
// The attendance vocabulary, shared by the marking sheets (client) and the
// report screens (server). One list, so a mark rendered amber on the register
// cannot come back green in the report.

/* ------------------------------------------------------- student register */
export const MARKS = [
  { id: 'present', label: 'Present', tone: 'green' },
  { id: 'absent', label: 'Absent', tone: 'red' },
  { id: 'short_leave', label: 'Short Leave', tone: 'amber' },
  { id: 'leave', label: 'Leave', tone: 'blue' },
  { id: 'late', label: 'Late', tone: 'amber' },
]

// 'excused' is not offered on the form -- it only exists so marks written
// before the register was widened stay legal and keep rendering.
export const MARK_IDS = [...MARKS.map((m) => m.id), 'excused']

export const MARK_LABEL = {
  ...Object.fromEntries(MARKS.map((m) => [m.id, m.label])),
  excused: 'Excused',
}

/* --------------------------------------------------------- staff register */
export const STAFF_MARKS = [
  { id: 'present', label: 'Present', tone: 'green' },
  { id: 'absent', label: 'Absent', tone: 'red' },
  { id: 'half_day', label: 'Half Day', tone: 'amber' },
  { id: 'leave', label: 'Leave', tone: 'blue' },
  { id: 'late', label: 'Late', tone: 'amber' },
]

export const STAFF_MARK_IDS = [...STAFF_MARKS.map((m) => m.id), 'short_leave', 'excused']

export const STAFF_MARK_LABEL = {
  ...Object.fromEntries(STAFF_MARKS.map((m) => [m.id, m.label])),
  short_leave: 'Short Leave',
  excused: 'Excused',
}

/* -------------------------------------------------------------------- ink */
// The register is a wall of buttons, so the colour has to carry the meaning
// on its own. Same five tones the pills use elsewhere.
export const TONE = {
  green: { soft: 'var(--green-soft)', ink: 'var(--green-ink)', edge: 'var(--green)' },
  red: { soft: 'var(--red-soft)', ink: 'var(--red-ink)', edge: 'var(--red)' },
  amber: { soft: 'var(--amber-soft)', ink: 'var(--amber-ink)', edge: 'var(--amber)' },
  blue: { soft: 'var(--blue-soft)', ink: 'var(--blue-ink)', edge: 'var(--blue)' },
  brand: { soft: 'var(--brand-soft)', ink: 'var(--brand-ink)', edge: 'var(--brand)' },
}

export const MARK_PILL = {
  present: 'pill-green',
  absent: 'pill-red',
  late: 'pill-amber',
  short_leave: 'pill-amber',
  half_day: 'pill-amber',
  leave: 'pill-blue',
  excused: 'pill-muted',
}

/* ------------------------------------------------------------------ shift */
export const SHIFTS = [
  { id: 'morning', label: 'Morning' },
  { id: 'evening', label: 'Evening' },
  { id: 'both', label: 'Both' },
]

export const SHIFT_LABEL = Object.fromEntries(SHIFTS.map((s) => [s.id, s.label]))

/* -------------------------------------------------------------- utilities */

export const today = () => new Date().toISOString().slice(0, 10)

// A date that is a real calendar day, or today. Guards a hand-edited ?date=
// in the URL from reaching Postgres as garbage.
export function safeDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return today()
  return Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ? today() : value
}

// Present + late both count as "turned up". A school that marked a child late
// and then reported them absent for the month would be wrong.
export function attendanceRate({ present = 0, late = 0, marked = 0 }) {
  if (!marked) return 0
  return Math.round(((present + late) / marked) * 100)
}

export function rateBand(percent) {
  if (percent >= 90) return { label: 'High', pill: 'pill-green', colour: 'var(--green)' }
  if (percent >= 75) return { label: 'Fair', pill: 'pill-amber', colour: 'var(--amber)' }
  return { label: 'Low', pill: 'pill-red', colour: 'var(--red)' }
}

// The first and last day of a YYYY-MM month, for the month filters.
export function monthRange(month) {
  if (typeof month !== 'string' || !/^\d{4}-\d{2}$/.test(month)) return null
  const [year, m] = month.split('-').map(Number)
  const last = new Date(Date.UTC(year, m, 0)).getUTCDate()
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` }
}
