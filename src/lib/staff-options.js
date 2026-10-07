// Plain module on purpose -- no 'use client'.
//
// The staff vocabulary, in one place. Teachers and HR / Staff are two views of
// the same table, and the moment "On leave" was spelled differently in two
// panels the two screens started disagreeing about the same employee. Server
// pages and client panels both import from here.

/* ------------------------------------------------------------- staff type */
// The three tabs on All Staff. staff.department is a free-text sub-team
// ("Science", "Accounts") and is a different, narrower thing.
export const STAFF_TYPES = [
  { id: 'teaching', label: 'Teaching' },
  { id: 'admin', label: 'Administration' },
  { id: 'support', label: 'Support' },
]

export const STAFF_TYPE_LABEL = Object.fromEntries(STAFF_TYPES.map((t) => [t.id, t.label]))

/* ----------------------------------------------------------------- status */
export const STAFF_STATUSES = [
  { id: 'active', label: 'Active', tone: 'pill-green' },
  { id: 'on_leave', label: 'On leave', tone: 'pill-amber' },
  { id: 'inactive', label: 'Inactive', tone: 'pill-muted' },
  { id: 'suspended', label: 'Suspended', tone: 'pill-amber' },
  { id: 'pending', label: 'Pending', tone: 'pill-blue' },
  { id: 'resigned', label: 'Resigned', tone: 'pill-red' },
  { id: 'terminated', label: 'Terminated', tone: 'pill-red' },
]

// Pending is set by the invite flow, never chosen on a form.
export const STAFF_STATUS_OPTIONS = STAFF_STATUSES.filter((s) => s.id !== 'pending')

export const STAFF_STATUS_LABEL = Object.fromEntries(STAFF_STATUSES.map((s) => [s.id, s.label]))
export const STAFF_STATUS_TONE = Object.fromEntries(STAFF_STATUSES.map((s) => [s.id, s.tone]))

export const STAFF_STATUS_IDS = STAFF_STATUSES.map((s) => s.id)

/* -------------------------------------------------------- employment type */
export const EMPLOYMENT_TYPES = [
  { id: 'permanent', label: 'Permanent' },
  { id: 'contract', label: 'Contract' },
  { id: 'probation', label: 'Probation' },
  { id: 'part_time', label: 'Part time' },
  { id: 'visiting', label: 'Visiting' },
]

/* ------------------------------------------------------------ pay by what */
export const PAYMENT_MODES = [
  { id: 'bank_transfer', label: 'Bank transfer' },
  { id: 'cash', label: 'Cash' },
  { id: 'cheque', label: 'Cheque' },
  { id: 'online', label: 'Online' },
]

export const PAYMENT_MODE_LABEL = Object.fromEntries(PAYMENT_MODES.map((m) => [m.id, m.label]))

/* ------------------------------------------------------------ leave types */
export const LEAVE_TYPES = [
  { id: 'annual', label: 'Annual' },
  { id: 'sick', label: 'Sick' },
  { id: 'casual', label: 'Casual' },
  { id: 'unpaid', label: 'Unpaid' },
  { id: 'maternity', label: 'Maternity' },
  { id: 'paternity', label: 'Paternity' },
  { id: 'other', label: 'Other' },
]

export const LEAVE_TYPE_LABEL = Object.fromEntries(LEAVE_TYPES.map((t) => [t.id, t.label]))
export const LEAVE_TYPE_IDS = LEAVE_TYPES.map((t) => t.id)

export const LEAVE_STATUSES = [
  { id: 'pending', label: 'Pending', tone: 'pill-amber' },
  { id: 'approved', label: 'Approved', tone: 'pill-green' },
  { id: 'rejected', label: 'Rejected', tone: 'pill-red' },
  { id: 'cancelled', label: 'Cancelled', tone: 'pill-muted' },
]

export const LEAVE_STATUS_LABEL = Object.fromEntries(LEAVE_STATUSES.map((s) => [s.id, s.label]))
export const LEAVE_STATUS_TONE = Object.fromEntries(LEAVE_STATUSES.map((s) => [s.id, s.tone]))
export const LEAVE_STATUS_IDS = LEAVE_STATUSES.map((s) => s.id)

/* --------------------------------------------------------- document types */
export const DOC_TYPES = [
  { id: 'cnic', label: 'CNIC' },
  { id: 'degree', label: 'Degree' },
  { id: 'certificate', label: 'Certificate' },
  { id: 'contract', label: 'Contract' },
  { id: 'other', label: 'Other' },
]

export const DOC_TYPE_LABEL = Object.fromEntries(DOC_TYPES.map((t) => [t.id, t.label]))
export const DOC_TYPE_IDS = DOC_TYPES.map((t) => t.id)

export const DOC_STATUSES = [
  { id: 'valid', label: 'Valid', tone: 'pill-green' },
  { id: 'expiring_soon', label: 'Expiring soon', tone: 'pill-amber' },
  { id: 'expired', label: 'Expired', tone: 'pill-red' },
]

export const DOC_STATUS_LABEL = Object.fromEntries(DOC_STATUSES.map((s) => [s.id, s.label]))
export const DOC_STATUS_TONE = Object.fromEntries(DOC_STATUSES.map((s) => [s.id, s.tone]))
export const DOC_STATUS_IDS = DOC_STATUSES.map((s) => s.id)

// A document within this many days of expiry counts as expiring soon.
export const EXPIRY_WARNING_DAYS = 60

/* -------------------------------------------------------------- utilities */

export const staffName = (s) => [s?.first_name, s?.last_name].filter(Boolean).join(' ')

// Rs 45,000 -- no decimals, because school salaries are whole rupees and the
// column has to stay narrow enough to sit beside seven others.
export function money(value) {
  if (value === null || value === undefined || value === '') return '—'
  const n = Number(value)
  return Number.isFinite(n) ? `Rs ${Math.round(n).toLocaleString('en-PK')}` : '—'
}

// Inclusive: a leave from the 3rd to the 3rd is one day, not zero.
export function leaveDays(from, to) {
  if (!from || !to) return null
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)
  if (!Number.isFinite(ms) || ms < 0) return null
  return Math.round(ms / 86400000) + 1
}

// A stored "expiring soon" rots into a lie three months later, so a document
// that HAS an expiry date is read from that date. The stored column is the
// answer only for documents that never expire, like a degree.
export function documentStatus(row, today = new Date()) {
  if (!row?.expiry_date) return row?.status ?? 'valid'
  const days = Math.ceil((Date.parse(`${row.expiry_date}T00:00:00Z`) - today.getTime()) / 86400000)
  if (!Number.isFinite(days)) return row.status ?? 'valid'
  if (days < 0) return 'expired'
  if (days <= EXPIRY_WARNING_DAYS) return 'expiring_soon'
  return 'valid'
}
