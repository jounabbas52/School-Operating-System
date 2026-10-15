// Plain module on purpose -- no 'use client'.
//
// The audit trail is written by a database trigger (audit_row in schema.sql),
// which knows nothing about the app. It stores the whole row before and after,
// the table name, and 'insert' / 'update' / 'delete'. That is the right thing
// for the database to store and the wrong thing to put on a screen.
//
// Everything here turns that raw diff into a sentence: which module was
// touched, which record, and what actually changed.

/* ================================================================= modules */

// target_table -> the module a person would say it belongs to. The group is
// what the Module filter offers; the label is what the row shows.
export const AUDIT_MODULES = [
  { table: 'students', label: 'Students', group: 'Students' },
  { table: 'profiles', label: 'Users', group: 'Users' },
  { table: 'profile_roles', label: 'User roles', group: 'Users' },
  { table: 'roles', label: 'Roles', group: 'Users' },
  { table: 'staff', label: 'Staff', group: 'Staff' },
  { table: 'staff_salaries', label: 'Staff salaries', group: 'Payroll' },
  { table: 'payroll_runs', label: 'Payroll runs', group: 'Payroll' },
  { table: 'expenses', label: 'Expenses', group: 'Payroll' },
  { table: 'marks', label: 'Exam marks', group: 'Examination' },
  { table: 'exams', label: 'Exams', group: 'Examination' },
  { table: 'datesheet_groups', label: 'Date sheets', group: 'Examination' },
  { table: 'fee_challans', label: 'Fee challans', group: 'Fees' },
  { table: 'fee_payments', label: 'Fee payments', group: 'Fees' },
  { table: 'fee_policies', label: 'Fee policies', group: 'Fees' },
  { table: 'classes', label: 'Classes', group: 'System Setup' },
  { table: 'sections', label: 'Sections', group: 'System Setup' },
  { table: 'subjects', label: 'Subjects', group: 'System Setup' },
  { table: 'periods', label: 'Periods', group: 'Timetable' },
  { table: 'timetable_entries', label: 'Timetable', group: 'Timetable' },
  { table: 'book_loans', label: 'Book loans', group: 'Library' },
  { table: 'passengers', label: 'Transport students', group: 'Transport' },
  { table: 'complaints', label: 'Complaints', group: 'Front Desk' },
  { table: 'school_modules', label: 'School modules', group: 'Platform' },
]

export const MODULE_LABEL = Object.fromEntries(AUDIT_MODULES.map((m) => [m.table, m.label]))

// The filter dropdown. Tables are grouped, so "Payroll" catches runs, salaries
// and expenses in one choice rather than three.
export const MODULE_GROUPS = [...new Set(AUDIT_MODULES.map((m) => m.group))].sort()

export function tablesInGroup(group) {
  return AUDIT_MODULES.filter((m) => m.group === group).map((m) => m.table)
}

/* ================================================================= actions */

// The trigger writes lower(TG_OP). 'insert' reads as Create to anyone who did
// not write the trigger.
export const ACTIONS = [
  { id: 'insert', label: 'Create', tone: 'pill-green' },
  { id: 'update', label: 'Update', tone: 'pill-blue' },
  { id: 'delete', label: 'Delete', tone: 'pill-red' },
]

export const ACTION_LABEL = Object.fromEntries(ACTIONS.map((a) => [a.id, a.label]))
export const ACTION_TONE = Object.fromEntries(ACTIONS.map((a) => [a.id, a.tone]))
export const ACTION_IDS = ACTIONS.map((a) => a.id)

/* ================================================================= records */

// A human handle for the row that was touched, in preference order. A school
// admin recognises "CLS-020" or "Ahmed Khan"; nobody recognises a uuid.
const NAME_KEYS = [
  'challan_number',
  'receipt_no',
  'voucher_no',
  'admission_number',
  'staff_number',
  'route_code',
  'book_code',
  'badge_no',
  'name',
  'title',
  'test_name',
  'report_name',
  'subject',
  'registration_no',
  'full_name',
  'display_name',
  'key',
]

export function recordLabel(entry) {
  const row = entry?.after ?? entry?.before ?? {}

  for (const key of NAME_KEYS) {
    const value = row[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }

  // A person's row usually has the name split in two.
  const person = [row.first_name, row.last_name].filter(Boolean).join(' ')
  if (person) return person

  // Last resort: the first segment of the uuid. Short enough to read, long
  // enough to match against a URL.
  const id = entry?.target_id
  return id ? String(id).split('-')[0] : '—'
}

/* ================================================================= changes */

// Columns nobody wants to read a diff of. updated_at changes on every single
// update; the audit columns are the audit trail describing itself.
const NOISE = new Set([
  'updated_at',
  'created_at',
  'updated_by',
  'created_by',
  'deleted_by',
  'deleted_at',
  'user_id',
  'school_id',
  'id',
])

function display(value) {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'yes' : 'no'
  if (Array.isArray(value)) return value.length ? value.join(', ') : '—'
  if (typeof value === 'object') return JSON.stringify(value)
  const s = String(value)
  // A long free-text field would push the table sideways; the full value is
  // still in the row's `before`/`after` for anyone who needs it.
  return s.length > 60 ? `${s.slice(0, 57)}…` : s
}

// Which fields actually moved. Comparison is on the JSON form so an array or a
// jsonb object does not read as "changed" every time it is rewritten
// identically.
export function changedFields(entry) {
  if (entry?.action !== 'update') return []
  const before = entry.before ?? {}
  const after = entry.after ?? {}

  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((k) => !NOISE.has(k))
    .filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]))

  return keys.map((key) => ({
    field: key.replace(/_/g, ' '),
    from: display(before[key]),
    to: display(after[key]),
  }))
}

// The one-line description the DETAILS column leads with.
export function summarise(entry) {
  const what = MODULE_LABEL[entry?.target_table] ?? entry?.target_table ?? 'record'
  const noun = what.replace(/s$/, '').toLowerCase()
  const label = recordLabel(entry)

  if (entry?.action === 'insert') return `Created ${noun} ${label}`
  if (entry?.action === 'delete') return `Deleted ${noun} ${label}`

  // A soft delete arrives as an update, and reading "Updated student X" when
  // somebody removed them is the one case where the diff actively misleads.
  if (entry?.before?.is_deleted === false && entry?.after?.is_deleted === true) {
    return `Removed ${noun} ${label}`
  }
  if (entry?.before?.is_deleted === true && entry?.after?.is_deleted === false) {
    return `Restored ${noun} ${label}`
  }

  const changes = changedFields(entry)
  if (changes.length === 1) return `Changed ${changes[0].field} on ${noun} ${label}`
  if (changes.length > 1) return `Updated ${changes.length} fields on ${noun} ${label}`
  return `Updated ${noun} ${label}`
}

/* =============================================================== utilities */

export function stamp(value) {
  if (!value) return '—'
  const ms = Date.parse(value)
  if (!Number.isFinite(ms)) return '—'
  return new Date(ms).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

export const actorName = (p) => p?.full_name || p?.email || 'System'
