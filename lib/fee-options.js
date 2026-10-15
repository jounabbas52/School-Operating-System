// Plain module on purpose -- no 'use client'.
//
// The fee vocabulary. Seven screens read these: Overview, Student Search,
// Collect, Challans, Create Challan, Policy and Reports.

/* ------------------------------------------------------------ fee types */
// What a challan is FOR. Separate from fee_items, which is the school's price
// list -- a challan can be raised for something that never made the list.
export const FEE_TYPES = [
  { id: 'monthly', label: 'Monthly Fee' },
  { id: 'admission', label: 'Admission Fee' },
  { id: 'exam', label: 'Exam Fee' },
  { id: 'transport', label: 'Transport Fee' },
  { id: 'annual', label: 'Annual Charges' },
  { id: 'fine', label: 'Fine' },
  { id: 'other', label: 'Other' },
]

export const FEE_TYPE_LABEL = Object.fromEntries(FEE_TYPES.map((t) => [t.id, t.label]))
export const FEE_TYPE_IDS = FEE_TYPES.map((t) => t.id)

/* -------------------------------------------------------- challan status */
// Mirrors the challan_status enum in schema.sql. 'open' is what the database
// calls an unpaid challan; the screens call it Unpaid, because "open" reads
// as a state someone has to close rather than a bill someone has to pay.
export const CHALLAN_STATUSES = [
  { id: 'open', label: 'Unpaid', tone: 'pill-amber' },
  { id: 'partial', label: 'Partial', tone: 'pill-blue' },
  { id: 'paid', label: 'Paid', tone: 'pill-green' },
  { id: 'overdue', label: 'Overdue', tone: 'pill-red' },
  { id: 'cancelled', label: 'Cancelled', tone: 'pill-muted' },
  { id: 'pending', label: 'Pending', tone: 'pill-muted' },
]

export const CHALLAN_STATUS_LABEL = Object.fromEntries(CHALLAN_STATUSES.map((s) => [s.id, s.label]))
export const CHALLAN_STATUS_TONE = Object.fromEntries(CHALLAN_STATUSES.map((s) => [s.id, s.tone]))
export const CHALLAN_STATUS_IDS = CHALLAN_STATUSES.map((s) => s.id)

/* -------------------------------------------------------- payment method */
// The payment_method enum, as the collection form offers it.
export const FEE_METHODS = [
  { id: 'cash', label: 'Cash' },
  { id: 'bank_transfer', label: 'Bank transfer' },
  { id: 'cheque', label: 'Cheque' },
  { id: 'card', label: 'Card' },
  { id: 'online', label: 'Online' },
]

export const FEE_METHOD_LABEL = Object.fromEntries(FEE_METHODS.map((m) => [m.id, m.label]))
export const FEE_METHOD_IDS = FEE_METHODS.map((m) => m.id)

/* ---------------------------------------------------------------- months */
// 1-12, as fee_policies stores them.
export const MONTHS = [
  { id: 1, short: 'Jan', label: 'January' },
  { id: 2, short: 'Feb', label: 'February' },
  { id: 3, short: 'Mar', label: 'March' },
  { id: 4, short: 'Apr', label: 'April' },
  { id: 5, short: 'May', label: 'May' },
  { id: 6, short: 'Jun', label: 'June' },
  { id: 7, short: 'Jul', label: 'July' },
  { id: 8, short: 'Aug', label: 'August' },
  { id: 9, short: 'Sep', label: 'September' },
  { id: 10, short: 'Oct', label: 'October' },
  { id: 11, short: 'Nov', label: 'November' },
  { id: 12, short: 'Dec', label: 'December' },
]

export const ALL_MONTHS = MONTHS.map((m) => m.id)

// The academic year as a school reads it: July first, not January.
export const SESSION_MONTH_ORDER = [7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6]

/* -------------------------------------------------------- the components */
// One definition of the four policy components, so the form, the preview and
// the generator cannot disagree about what a policy contains.
export const POLICY_COMPONENTS = [
  { key: 'tuition', label: 'Tuition Fee', amount: 'tuition_fee', months: 'tuition_months', feeType: 'monthly', required: true },
  { key: 'admission', label: 'Admission Fee', amount: 'admission_fee', months: 'admission_months', feeType: 'admission' },
  { key: 'exam', label: 'Exam Fee', amount: 'exam_fee', months: 'exam_months', feeType: 'exam' },
  { key: 'transport', label: 'Transport Fee', amount: 'transport_fee', months: 'transport_months', feeType: 'transport' },
  { key: 'other', label: 'Other Charges', amount: 'other_fee', months: 'other_months', feeType: 'other' },
]

/* -------------------------------------------------------------- utilities */

// Rs 45,000 -- whole rupees, matching the staff screens.
export function money(value) {
  if (value === null || value === undefined || value === '') return 'Rs 0'
  const n = Number(value)
  return Number.isFinite(n) ? `Rs ${Math.round(n).toLocaleString('en-PK')}` : 'Rs 0'
}

export function plain(value) {
  const n = Number(value)
  return Number.isFinite(n) ? Math.round(n).toLocaleString('en-PK') : '0'
}

// What a policy bills in one month, as [{ feeType, label, amount }].
export function componentsForMonth(policy, month) {
  if (!policy) return []
  return POLICY_COMPONENTS.flatMap((c) => {
    const amount = Number(policy[c.amount]) || 0
    const months = policy[c.months] ?? []
    if (amount <= 0 || !months.includes(month)) return []
    return [{ feeType: c.feeType, label: c.label, amount }]
  })
}

// The challan's own status is written by a trigger, but a challan that fell
// past its due date between page loads should not still read "Unpaid".
export function effectiveStatus(challan, today = new Date()) {
  if (!challan) return 'open'
  if (challan.status === 'paid' || challan.status === 'cancelled') return challan.status
  const paid = Number(challan.paid_amount) || 0
  const net = Number(challan.net_amount ?? challan.total_amount ?? challan.amount) || 0
  if (net > 0 && paid >= net) return 'paid'
  if (challan.due_date && Date.parse(`${challan.due_date}T23:59:59Z`) < today.getTime()) return 'overdue'
  if (paid > 0) return 'partial'
  return 'open'
}

export function remaining(challan) {
  const net = Number(challan?.net_amount ?? challan?.total_amount ?? challan?.amount) || 0
  const paid = Number(challan?.paid_amount) || 0
  return Math.max(0, net - paid)
}

// The first of the month, which is how fee_challans.period_month is stored.
export function monthKey(year, month) {
  return `${year}-${String(month).padStart(2, '0')}-01`
}

export function monthLabel(date) {
  if (!date) return '—'
  const ms = Date.parse(`${date}T00:00:00Z`)
  if (!Number.isFinite(ms)) return String(date)
  return new Date(ms).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export function dateLabel(date) {
  if (!date) return '—'
  const ms = Date.parse(`${date}T00:00:00Z`)
  if (!Number.isFinite(ms)) return String(date)
  return new Date(ms).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export const studentName = (s) => [s?.first_name, s?.last_name].filter(Boolean).join(' ')
