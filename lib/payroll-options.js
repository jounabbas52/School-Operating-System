// Plain module on purpose -- no 'use client'.
//
// The payroll vocabulary, plus the one piece of arithmetic every payroll
// screen has to agree on: what an employee is owed for a month.

/* --------------------------------------------------------------- the run */
// payroll_runs.status is the payroll_status enum
// (draft / finalized / paid / cancelled). The database word is 'finalized';
// the screens say Approved, because that is what the act is called when a
// principal signs off a salary sheet.
export const RUN_STAGES = [
  { id: 'draft', label: 'Draft', tone: 'pill-amber' },
  { id: 'finalized', label: 'Approved', tone: 'pill-blue' },
  { id: 'paid', label: 'Paid', tone: 'pill-green' },
  { id: 'cancelled', label: 'Cancelled', tone: 'pill-muted' },
]

export const RUN_STAGE_LABEL = Object.fromEntries(RUN_STAGES.map((s) => [s.id, s.label]))
export const RUN_STAGE_TONE = Object.fromEntries(RUN_STAGES.map((s) => [s.id, s.tone]))

/* ------------------------------------------------------ one person's row */
export const ITEM_STATUSES = [
  { id: 'draft', label: 'Draft', tone: 'pill-amber' },
  { id: 'approved', label: 'Approved', tone: 'pill-blue' },
  { id: 'paid', label: 'Paid', tone: 'pill-green' },
  { id: 'hold', label: 'Hold', tone: 'pill-red' },
]

export const ITEM_STATUS_LABEL = Object.fromEntries(ITEM_STATUSES.map((s) => [s.id, s.label]))
export const ITEM_STATUS_TONE = Object.fromEntries(ITEM_STATUSES.map((s) => [s.id, s.tone]))
export const ITEM_STATUS_IDS = ITEM_STATUSES.map((s) => s.id)

/* ------------------------------------------------------------- expenses */
export const EXPENSE_CATEGORIES = [
  { id: 'utility', label: 'Utility' },
  { id: 'maintenance', label: 'Maintenance' },
  { id: 'stationery', label: 'Stationery' },
  { id: 'transport', label: 'Transport' },
  { id: 'rent', label: 'Rent' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'misc', label: 'Miscellaneous' },
]

export const EXPENSE_CATEGORY_LABEL = Object.fromEntries(
  EXPENSE_CATEGORIES.map((c) => [c.id, c.label])
)
export const EXPENSE_CATEGORY_IDS = EXPENSE_CATEGORIES.map((c) => c.id)

export const EXPENSE_STATUSES = [
  { id: 'pending', label: 'Pending', tone: 'pill-amber' },
  { id: 'approved', label: 'Approved', tone: 'pill-blue' },
  { id: 'paid', label: 'Paid', tone: 'pill-green' },
  { id: 'rejected', label: 'Rejected', tone: 'pill-red' },
]

export const EXPENSE_STATUS_LABEL = Object.fromEntries(EXPENSE_STATUSES.map((s) => [s.id, s.label]))
export const EXPENSE_STATUS_TONE = Object.fromEntries(EXPENSE_STATUSES.map((s) => [s.id, s.tone]))
export const EXPENSE_STATUS_IDS = EXPENSE_STATUSES.map((s) => s.id)

/* ------------------------------------------------------------- settings */
export const WORKING_DAY_MODES = [
  { id: 'calendar', label: 'Calendar — month days minus weekly offs and holidays' },
  { id: 'fixed', label: 'Fixed — the same number of days every month' },
]

export const DEDUCT_FROM = [
  { id: 'gross', label: 'Gross salary' },
  { id: 'basic', label: 'Basic salary' },
]

// ISO day numbers, matching periods.day_of_week and payroll_settings.weekly_offs.
export const WEEK_DAYS = [
  { id: 7, short: 'Sun', label: 'Sunday' },
  { id: 1, short: 'Mon', label: 'Monday' },
  { id: 2, short: 'Tue', label: 'Tuesday' },
  { id: 3, short: 'Wed', label: 'Wednesday' },
  { id: 4, short: 'Thu', label: 'Thursday' },
  { id: 5, short: 'Fri', label: 'Friday' },
  { id: 6, short: 'Sat', label: 'Saturday' },
]

// What the app assumes before anyone opens Payroll Settings. Mirrors the
// column defaults in 011_payroll.sql -- the two must not drift, or a school
// that never saved settings would be paid on different rules than one that
// saved the defaults unchanged.
export const DEFAULT_SETTINGS = {
  working_days_mode: 'calendar',
  fixed_working_days: 26,
  weekly_offs: [7],
  deduct_absences: true,
  deduct_from: 'gross',
  half_day_fraction: 0.5,
  late_marks_per_day: 3,
  eobi_enabled: false,
  eobi_amount: 0,
  pf_enabled: false,
  pf_percent: 0,
  tax_enabled: false,
  default_payment_mode: 'bank_transfer',
  cutoff_day: 25,
}

/* ------------------------------------------------- the one piece of maths */

// Gross for a package: basic plus every allowance.
export function grossOf(pkg) {
  if (!pkg) return 0
  return (
    (Number(pkg.basic_salary) || 0) +
    (Number(pkg.house_allowance) || 0) +
    (Number(pkg.medical_allowance) || 0) +
    (Number(pkg.conveyance_allowance) || 0) +
    (Number(pkg.special_allowance) || 0) +
    (Number(pkg.other_allowances) || 0)
  )
}

export function allowancesOf(pkg) {
  return grossOf(pkg) - (Number(pkg?.basic_salary) || 0)
}

// What one employee is owed for one month.
//
// Kept here, not in the server action, because the Payroll Run screen shows
// the same figures before anything is written and a second implementation
// would be a second answer. The generator calls this and stores the result;
// nothing recomputes a month that has already been generated.
export function computePay({ pkg, settings = DEFAULT_SETTINGS, workingDays, attendance = {} }) {
  const basic = Number(pkg?.basic_salary) || 0
  const gross = grossOf(pkg)
  const days = Number(workingDays) || 0

  const absent = Number(attendance.absent_days) || 0
  const half = Number(attendance.half_days) || 0
  const late = Number(attendance.late_marks) || 0

  // Paid leave costs nothing. Whether a leave is paid is decided per day on
  // the staff attendance screen (staff_attendance.is_paid_leave), so by the
  // time it reaches here an unpaid one is already counted as an absence.
  const lateDays =
    settings.late_marks_per_day > 0 ? Math.floor(late / settings.late_marks_per_day) : 0

  const lostDays =
    settings.deduct_absences === false
      ? 0
      : absent + half * (Number(settings.half_day_fraction) || 0) + lateDays

  const base = settings.deduct_from === 'basic' ? basic : gross
  const perDay = days > 0 ? base / days : 0
  const absenceAmount = Math.round(perDay * lostDays)

  const eobi = settings.eobi_enabled && pkg?.eobi_applicable ? Number(settings.eobi_amount) || 0 : 0
  const pf =
    settings.pf_enabled && pkg?.pf_applicable
      ? Math.round((basic * (Number(settings.pf_percent) || 0)) / 100)
      : 0
  // tax_annual is the year's liability; a month carries a twelfth of it.
  const tax = settings.tax_enabled ? Math.round((Number(pkg?.tax_annual) || 0) / 12) : 0

  const other = Number(pkg?.other_deductions) || 0
  const deductions = absenceAmount + eobi + pf + tax + other

  return {
    basic_salary: basic,
    allowances: gross - basic,
    gross_amount: gross,
    working_days: days,
    present_days: Math.max(0, days - absent - half),
    absent_days: absent,
    half_days: half,
    late_marks: late,
    absence_amount: absenceAmount,
    eobi_amount: eobi,
    pf_amount: pf,
    tax_amount: tax,
    deduction_amount: deductions,
    net_amount: Math.max(0, gross - deductions),
  }
}

/* -------------------------------------------------------------- utilities */

export function money(value) {
  if (value === null || value === undefined || value === '') return 'Rs 0'
  const n = Number(value)
  return Number.isFinite(n) ? `Rs ${Math.round(n).toLocaleString('en-PK')}` : 'Rs 0'
}

// payroll_runs.run_month is a date; always the first of the month.
export function runMonth(year, month) {
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
  const ms = Date.parse(date.length <= 10 ? `${date}T00:00:00Z` : date)
  if (!Number.isFinite(ms)) return String(date)
  return new Date(ms).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/* ------------------------------------------------------------- the payslip */

/**
 * A payroll_items row, flattened into what a printed salary slip shows.
 *
 * Here rather than in the screen that prints it because two screens do: the
 * one-employee view under Salary Slips and the bulk print of a whole run. A
 * slip whose figures depend on which route rendered it would be a slip nobody
 * could rely on.
 *
 * Nothing is computed. computePay() above is for GENERATING a run; by the
 * time there is a row to print, the numbers are history.
 */
export function toPayslip(item, { period, staff } = {}) {
  const s = staff ?? item?.staff ?? {}
  const bank = [s.bank_name, s.account_number].filter(Boolean).join(' · ')

  return {
    id: item.id,
    // Not a stored column: a payroll item has no slip number of its own, and
    // inventing one that is not in the database would mean two reprints of
    // the same slip carrying different numbers. The staff number and the
    // period together already identify it uniquely, which is what a slip
    // number is for.
    slipNo: s.staff_number && period ? `${s.staff_number}/${String(period).slice(0, 7)}` : null,
    periodLabel: period ? monthLabel(period) : '—',
    statusLabel: ITEM_STATUS_LABEL[item.status] ?? item.status ?? '—',

    name: [s.first_name, s.last_name].filter(Boolean).join(' ') || '—',
    staffNumber: s.staff_number,
    designation: s.designation,
    department: s.department,
    paymentMode: (item.payment_mode ?? s.payment_mode ?? '').replace('_', ' ') || null,
    bankLine: bank || null,

    workingDays: item.working_days ?? '—',
    presentDays: item.present_days ?? '—',
    absentDays: item.absent_days ?? 0,
    halfDays: item.half_days ?? 0,
    leaveDays: item.leave_days ?? 0,
    lateMarks: item.late_marks ?? 0,

    basic: item.basic_salary,
    allowances: item.allowances,
    gross: item.gross_amount,
    absence: item.absence_amount,
    eobi: item.eobi_amount,
    pf: item.pf_amount,
    tax: item.tax_amount,
    deductions: item.deduction_amount,
    net: item.net_amount,
    remarks: item.remarks,
  }
}
