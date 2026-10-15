// The permission catalogue.
//
// roles.permissions is a jsonb array of these codes, with no foreign key
// behind it -- that is the trade-off of storing permissions as jsonb rather
// than in a table. A typo like "libary.read" grants nothing and raises no
// error, so this list is the single source of truth for the role editor.
// Keep it in step with the seed block at the bottom of supabase/schema.sql.
//
// The text before the first dot is the module code. That is not cosmetic:
// has_permission() splits on it to decide whether the owning module is
// switched on for the school.

export const PERMISSION_GROUPS = [
  {
    module: 'core',
    label: 'Core',
    permissions: [
      { code: 'core.settings.write', label: 'Edit school settings and branding' },
      { code: 'core.audit.read', label: 'View the audit trail', dangerous: true },
    ],
  },
  {
    module: 'users',
    label: 'Users & Roles',
    permissions: [
      { code: 'users.read', label: 'View users' },
      { code: 'users.write', label: 'Add, edit and suspend users', dangerous: true },
      { code: 'users.roles.write', label: 'Create and edit roles', dangerous: true },
    ],
  },
  {
    module: 'students',
    label: 'Students',
    permissions: [
      { code: 'students.read', label: 'View all students' },
      { code: 'students.write', label: 'Create and edit students' },
    ],
  },
  {
    module: 'staff',
    label: 'Staff',
    permissions: [
      { code: 'staff.read', label: 'View staff directory' },
      { code: 'staff.write', label: 'Create and edit staff' },
    ],
  },
  {
    module: 'academics',
    label: 'Classes & Subjects',
    permissions: [
      { code: 'academics.read', label: 'View academic structure' },
      { code: 'academics.write', label: 'Edit classes, sections, subjects' },
    ],
  },
  {
    module: 'attendance',
    label: 'Attendance',
    permissions: [
      { code: 'attendance.read', label: 'View all attendance' },
      { code: 'attendance.write', label: 'Record and amend attendance' },
    ],
  },
  {
    module: 'tests',
    label: 'Tests',
    permissions: [
      { code: 'tests.read', label: 'View tests and marks' },
      { code: 'tests.write', label: 'Create tests and enter marks' },
    ],
  },
  {
    module: 'exams',
    label: 'Exams & Results',
    permissions: [
      { code: 'exams.read', label: 'View exams and marks' },
      { code: 'exams.write', label: 'Create exams and enter marks' },
      { code: 'exams.publish', label: 'Publish results', dangerous: true },
    ],
  },
  {
    module: 'fees',
    label: 'Fees',
    permissions: [
      { code: 'fees.read', label: 'View challans and payments' },
      { code: 'fees.write', label: 'Issue challans and record payments', dangerous: true },
    ],
  },
  {
    module: 'accounts',
    label: 'Accounts',
    permissions: [
      { code: 'accounts.read', label: 'View expenses and salary payments' },
      { code: 'accounts.write', label: 'Record expenses and salary payments', dangerous: true },
    ],
  },
  {
    module: 'payroll',
    label: 'Payroll',
    permissions: [
      { code: 'payroll.read', label: 'View payroll', dangerous: true },
      { code: 'payroll.write', label: 'Run payroll', dangerous: true },
    ],
  },
  {
    module: 'library',
    label: 'Library',
    permissions: [
      { code: 'library.read', label: 'View catalogue and loans' },
      { code: 'library.write', label: 'Manage catalogue and issue loans' },
    ],
  },
  {
    module: 'transport',
    label: 'Transport',
    permissions: [
      { code: 'transport.read', label: 'View routes and passengers' },
      { code: 'transport.write', label: 'Manage transport' },
    ],
  },
  {
    module: 'frontdesk',
    label: 'Front Desk',
    permissions: [
      { code: 'frontdesk.read', label: 'View visitors, inquiries, contacts' },
      { code: 'frontdesk.write', label: 'Manage front desk records' },
    ],
  },
  {
    module: 'admissions',
    label: 'Admissions',
    permissions: [
      { code: 'admissions.read', label: 'View applications' },
      { code: 'admissions.write', label: 'Process applications' },
    ],
  },
  {
    module: 'hr',
    label: 'Leave Management',
    permissions: [
      { code: 'hr.read', label: 'View all leave requests' },
      { code: 'hr.write', label: 'Approve and reject leave' },
    ],
  },
  {
    module: 'notifications',
    label: 'Notifications',
    permissions: [
      { code: 'notifications.read', label: 'Receive notifications' },
      { code: 'notifications.write', label: 'Send notifications' },
    ],
  },
  {
    module: 'reports',
    label: 'Reports',
    permissions: [
      { code: 'reports.read', label: 'View reports' },
      { code: 'reports.write', label: 'Manage report templates' },
    ],
  },
]

export const ALL_PERMISSION_CODES = new Set(
  PERMISSION_GROUPS.flatMap((group) => group.permissions.map((p) => p.code))
)

export function moduleOf(code) {
  return code.split('.')[0]
}
