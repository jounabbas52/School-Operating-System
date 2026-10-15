// Plain module on purpose -- no 'use client'.
//
// Transport, Library and Front Desk share this file rather than having three
// of their own. Each is small, and all three are the same shape: a handful of
// status ladders and a date helper.

/* ============================================================== TRANSPORT */

export const ROUTE_STATUSES = [
  { id: 'active', label: 'Active', tone: 'pill-green' },
  { id: 'inactive', label: 'Inactive', tone: 'pill-muted' },
  { id: 'suspended', label: 'Suspended', tone: 'pill-amber' },
]

export const ROUTE_STATUS_LABEL = Object.fromEntries(ROUTE_STATUSES.map((s) => [s.id, s.label]))
export const ROUTE_STATUS_TONE = Object.fromEntries(ROUTE_STATUSES.map((s) => [s.id, s.tone]))
export const ROUTE_STATUS_IDS = ROUTE_STATUSES.map((s) => s.id)

export const VEHICLE_TYPES = [
  { id: 'bus', label: 'Bus' },
  { id: 'van', label: 'Van' },
  { id: 'coaster', label: 'Coaster' },
  { id: 'car', label: 'Car' },
  { id: 'other', label: 'Other' },
]

export const VEHICLE_TYPE_LABEL = Object.fromEntries(VEHICLE_TYPES.map((t) => [t.id, t.label]))
export const VEHICLE_TYPE_IDS = VEHICLE_TYPES.map((t) => t.id)

export const VEHICLE_STATUSES = [
  { id: 'active', label: 'Active', tone: 'pill-green' },
  { id: 'in_repair', label: 'In repair', tone: 'pill-amber' },
  { id: 'inactive', label: 'Inactive', tone: 'pill-muted' },
]

export const VEHICLE_STATUS_LABEL = Object.fromEntries(VEHICLE_STATUSES.map((s) => [s.id, s.label]))
export const VEHICLE_STATUS_TONE = Object.fromEntries(VEHICLE_STATUSES.map((s) => [s.id, s.tone]))
export const VEHICLE_STATUS_IDS = VEHICLE_STATUSES.map((s) => s.id)

export const PASSENGER_STATUSES = ROUTE_STATUSES
export const PASSENGER_STATUS_LABEL = ROUTE_STATUS_LABEL
export const PASSENGER_STATUS_TONE = ROUTE_STATUS_TONE
export const PASSENGER_STATUS_IDS = ROUTE_STATUS_IDS

// A vehicle within this many days of a fitness or insurance expiry is an
// alert, not a problem -- the fleet screen counts both as one number.
export const EXPIRY_WARNING_DAYS = 30

// 'expired' | 'expiring' | 'ok' | null when there is no date on file.
export function expiryState(date, today = new Date()) {
  if (!date) return null
  const days = Math.ceil((Date.parse(`${date}T00:00:00Z`) - today.getTime()) / 86400000)
  if (!Number.isFinite(days)) return null
  if (days < 0) return 'expired'
  if (days <= EXPIRY_WARNING_DAYS) return 'expiring'
  return 'ok'
}

export const EXPIRY_TONE = {
  expired: 'pill-red',
  expiring: 'pill-amber',
  ok: 'pill-green',
}

// A vehicle counts toward the alert tile if either document is expired or
// close to it.
export function hasExpiryAlert(vehicle, today = new Date()) {
  return ['fitness_expiry', 'insurance_expiry'].some((key) => {
    const state = expiryState(vehicle?.[key], today)
    return state === 'expired' || state === 'expiring'
  })
}

/* ================================================================ LIBRARY */

export const BOOK_CATEGORIES = [
  { id: 'textbook', label: 'Textbook' },
  { id: 'reference', label: 'Reference' },
  { id: 'fiction', label: 'Fiction' },
  { id: 'non_fiction', label: 'Non-Fiction' },
  { id: 'science', label: 'Science' },
  { id: 'mathematics', label: 'Mathematics' },
  { id: 'islamic', label: 'Islamic' },
  { id: 'general', label: 'General' },
]

export const BOOK_CATEGORY_LABEL = Object.fromEntries(BOOK_CATEGORIES.map((c) => [c.id, c.label]))
export const BOOK_CATEGORY_IDS = BOOK_CATEGORIES.map((c) => c.id)

export const LOAN_STATUSES = [
  { id: 'issued', label: 'Issued', tone: 'pill-blue' },
  { id: 'returned', label: 'Returned', tone: 'pill-green' },
  { id: 'overdue', label: 'Overdue', tone: 'pill-red' },
  { id: 'lost', label: 'Lost', tone: 'pill-muted' },
]

export const LOAN_STATUS_LABEL = Object.fromEntries(LOAN_STATUSES.map((s) => [s.id, s.label]))
export const LOAN_STATUS_TONE = Object.fromEntries(LOAN_STATUSES.map((s) => [s.id, s.tone]))
export const LOAN_STATUS_IDS = LOAN_STATUSES.map((s) => s.id)

// What a borrower is fined per day once a loan runs past its due date.
export const FINE_PER_DAY = 5

// Derived, never stored as a status: a loan issued on Monday is overdue on
// Friday without anyone touching the row, and a stored 'issued' would still
// read as fine.
export function loanState(loan, today = new Date()) {
  if (!loan) return 'issued'
  if (loan.status === 'lost') return 'lost'
  if (loan.returned_at) return 'returned'
  if (loan.due_at && Date.parse(loan.due_at) < today.getTime()) return 'overdue'
  return 'issued'
}

export function daysOverdue(loan, today = new Date()) {
  if (!loan?.due_at || loan.returned_at) return 0
  const days = Math.floor((today.getTime() - Date.parse(loan.due_at)) / 86400000)
  return days > 0 ? days : 0
}

export function fineFor(loan, today = new Date()) {
  // A fine already recorded on the row wins: it may have been waived or
  // settled at a figure the formula does not know about.
  if (loan?.fine_amount !== null && loan?.fine_amount !== undefined && Number(loan.fine_amount) > 0) {
    return Number(loan.fine_amount)
  }
  return daysOverdue(loan, today) * FINE_PER_DAY
}

/* ============================================================= FRONT DESK */

export const INQUIRY_STATUSES = [
  { id: 'pending', label: 'Pending', tone: 'pill-amber' },
  { id: 'followup', label: 'Follow-up', tone: 'pill-blue' },
  { id: 'resolved', label: 'Resolved', tone: 'pill-green' },
]

export const INQUIRY_STATUS_LABEL = Object.fromEntries(INQUIRY_STATUSES.map((s) => [s.id, s.label]))
export const INQUIRY_STATUS_TONE = Object.fromEntries(INQUIRY_STATUSES.map((s) => [s.id, s.tone]))
// 'open' and 'closed' are the legacy values the column shipped with; they are
// accepted on write so old rows survive a save.
export const INQUIRY_STATUS_IDS = ['open', 'pending', 'followup', 'resolved', 'closed']

export const ADMISSION_STATES = [
  { id: 'none', label: '—', tone: 'pill-muted' },
  { id: 'applied', label: 'Applied', tone: 'pill-blue' },
  { id: 'admitted', label: 'Admitted', tone: 'pill-green' },
  { id: 'declined', label: 'Declined', tone: 'pill-red' },
]

export const ADMISSION_STATE_LABEL = Object.fromEntries(ADMISSION_STATES.map((s) => [s.id, s.label]))
export const ADMISSION_STATE_TONE = Object.fromEntries(ADMISSION_STATES.map((s) => [s.id, s.tone]))
export const ADMISSION_STATE_IDS = ADMISSION_STATES.map((s) => s.id)

export const COMPLAINT_STATUSES = [
  { id: 'pending', label: 'Pending', tone: 'pill-amber' },
  { id: 'in_progress', label: 'In Progress', tone: 'pill-blue' },
  { id: 'resolved', label: 'Resolved', tone: 'pill-green' },
  { id: 'closed', label: 'Closed', tone: 'pill-muted' },
]

export const COMPLAINT_STATUS_LABEL = Object.fromEntries(
  COMPLAINT_STATUSES.map((s) => [s.id, s.label])
)
export const COMPLAINT_STATUS_TONE = Object.fromEntries(
  COMPLAINT_STATUSES.map((s) => [s.id, s.tone])
)
export const COMPLAINT_STATUS_IDS = COMPLAINT_STATUSES.map((s) => s.id)

export const COMPLAINT_CATEGORIES = [
  { id: 'general', label: 'General' },
  { id: 'academic', label: 'Academic' },
  { id: 'discipline', label: 'Discipline' },
  { id: 'transport', label: 'Transport' },
  { id: 'fee', label: 'Fee' },
  { id: 'facility', label: 'Facility' },
  { id: 'staff', label: 'Staff' },
]

export const COMPLAINT_CATEGORY_LABEL = Object.fromEntries(
  COMPLAINT_CATEGORIES.map((c) => [c.id, c.label])
)
export const COMPLAINT_CATEGORY_IDS = COMPLAINT_CATEGORIES.map((c) => c.id)

export const PRIORITIES = [
  { id: 'low', label: 'Low', tone: 'pill-muted' },
  { id: 'medium', label: 'Medium', tone: 'pill-blue' },
  { id: 'high', label: 'High', tone: 'pill-amber' },
  { id: 'urgent', label: 'Urgent', tone: 'pill-red' },
]

export const PRIORITY_LABEL = Object.fromEntries(PRIORITIES.map((p) => [p.id, p.label]))
export const PRIORITY_TONE = Object.fromEntries(PRIORITIES.map((p) => [p.id, p.tone]))
export const PRIORITY_IDS = PRIORITIES.map((p) => p.id)

export const CONTACT_CATEGORIES = [
  { id: 'staff', label: 'Staff' },
  { id: 'management', label: 'Management' },
  { id: 'emergency', label: 'Emergency' },
  { id: 'vendor', label: 'Vendor' },
  { id: 'other', label: 'Other' },
]

export const CONTACT_CATEGORY_LABEL = Object.fromEntries(
  CONTACT_CATEGORIES.map((c) => [c.id, c.label])
)
export const CONTACT_CATEGORY_IDS = CONTACT_CATEGORIES.map((c) => c.id)

/* =============================================================== UTILITIES */

export function money(value) {
  if (value === null || value === undefined || value === '') return 'Rs 0'
  const n = Number(value)
  return Number.isFinite(n) ? `Rs ${Math.round(n).toLocaleString('en-PK')}` : 'Rs 0'
}

export function dateLabel(date) {
  if (!date) return '—'
  const ms = Date.parse(String(date).length <= 10 ? `${date}T00:00:00Z` : date)
  if (!Number.isFinite(ms)) return String(date)
  return new Date(ms).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export function timeLabel(stamp) {
  if (!stamp) return '—'
  const ms = Date.parse(stamp)
  if (!Number.isFinite(ms)) return '—'
  return new Date(ms).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

// "1h 25m" between check-in and check-out, or since check-in when still in.
export function duration(from, to) {
  if (!from) return '—'
  const start = Date.parse(from)
  const end = to ? Date.parse(to) : Date.now()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return '—'
  const mins = Math.floor((end - start) / 60000)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export const studentName = (s) => [s?.first_name, s?.last_name].filter(Boolean).join(' ')
export const staffName = (s) => [s?.first_name, s?.last_name].filter(Boolean).join(' ')

// The local date as YYYY-MM-DD. toISOString() would shift a Karachi evening
// back to the previous day.
export function todayKey(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
