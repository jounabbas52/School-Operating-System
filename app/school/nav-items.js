// Plain module on purpose -- no 'use client'.
//
// This list is read by the server layout (to filter it against the school's
// enabled modules) and by the client Nav component (to render it). Exporting
// it from the 'use client' file turned it into a client reference on the
// server, where NAV.filter is not a function.
//
// Every entry declares the module it belongs to. The server filters against
// school_enabled_modules() before this reaches the browser, so a link for a
// module the school does not have is never sent at all.
//
// `built: false` means the school has the module but the screen does not
// exist yet. Those render dimmed rather than hidden, so the sidebar stays
// honest about what the school is paying for.
export const NAV = [
  { label: 'Dashboard', href: '/school', module: 'core', icon: 'grid', built: true },
  {
    label: 'System Setup',
    module: 'academics',
    icon: 'layers',
    children: [
      { label: 'Sessions', href: '/school/academics/sessions', built: true },
      { label: 'Classes', href: '/school/academics/classes', built: true },
      { label: 'Sections', href: '/school/academics/sections', built: true },
      { label: 'Grade Levels', href: '/school/academics/grade-levels', built: true },
      { label: 'Subjects', href: '/school/academics/subjects', built: true },
    ],
  },
  {
    label: 'Students',
    module: 'students',
    icon: 'users',
    children: [
      { label: 'Active Students', href: '/school/students', built: true },
      { label: 'Admission Register', href: '/school/students/register', built: true },
      { label: 'Promotion', href: '/school/students/promotion', built: true },
      { label: 'Old Students', href: '/school/students/old', built: true },
      { label: 'Student Reports', href: '/school/students/reports', built: true },
      { label: 'Certificates', href: '/school/students/certificates', built: true },
      { label: 'ID Cards', href: '/school/students/id-cards', built: true },
    ],
  },
  { label: 'Teachers', href: '/school/teachers', module: 'staff', icon: 'user', built: true },
  {
    label: 'HR / Staff',
    module: 'staff',
    icon: 'users',
    children: [
      { label: 'All Staff', href: '/school/hr', built: true, permission: 'staff.read' },
      // Leave lives behind its own module: the 'hr' permissions are dead for a
      // school that has not bought Leave Management, so the link would open a
      // screen RLS refuses to fill.
      {
        label: 'Leave Management',
        href: '/school/hr/leave',
        built: true,
        module: 'hr',
        permission: 'hr.read',
      },
      { label: 'Staff Documents', href: '/school/hr/documents', built: true, permission: 'staff.read' },
    ],
  },
  {
    label: 'Attendance',
    module: 'attendance',
    icon: 'check',
    children: [
      { label: 'Student Attendance', href: '/school/attendance', built: true },
      { label: 'Staff Attendance', href: '/school/attendance/staff', built: true },
      // Thumb attendance covers students and staff from one set of devices,
      // so it sits beside both registers rather than inside either.
      { label: 'Thumb Attendance', href: '/school/attendance/biometric', built: true },
      // History hangs off Reports rather than the sidebar -- it is the same
      // data one zoom level out, not a fourth place to look.
      { label: 'Reports', href: '/school/attendance/reports', built: true },
    ],
  },
  // Periods is an in-page tab, not a sidebar entry -- it is the same screen's
  // setup half rather than a second destination.
  { label: 'Timetable', href: '/school/timetable', module: 'academics', icon: 'grid', built: true },
  // Date Sheet is its own destination rather than a child of Examination: a
  // date sheet is typed up by the office, routinely before the exam record
  // exists, and burying it under Exams hid it from the people who write it.
  { label: 'Date Sheet', href: '/school/datesheet', module: 'exams', icon: 'clipboard', built: true },
  {
    label: 'Examination',
    module: 'exams',
    icon: 'award',
    children: [
      { label: 'All Exams', href: '/school/exams', built: true },
      { label: 'Exam Results', href: '/school/exams/results', built: true },
      // Tests carry their own module. A school may buy Exams without Tests,
      // and has_permission('tests.read') is dead without it.
      { label: 'Tests', href: '/school/exams/tests', built: true, module: 'tests' },
      { label: 'Test Results', href: '/school/exams/tests/results', built: true, module: 'tests' },
    ],
  },
  {
    label: 'Fee',
    module: 'fees',
    icon: 'rupee',
    children: [
      { label: 'Fee Overview', href: '/school/fees', built: true },
      { label: 'Student Fee Search', href: '/school/fees/student', built: true },
      { label: 'Collect Fee', href: '/school/fees/collect', built: true },
      { label: 'View Challans', href: '/school/fees/challans', built: true },
      { label: 'Create Challan', href: '/school/fees/challans/create', built: true },
      { label: 'Fee Policy', href: '/school/fees/policy', built: true },
      { label: 'Reports', href: '/school/fees/reports', built: true },
    ],
  },
  {
    label: 'Payroll',
    module: 'payroll',
    icon: 'wallet',
    children: [
      { label: 'Salary Structures', href: '/school/payroll', built: true },
      { label: 'Staff Salaries', href: '/school/payroll/salaries', built: true },
      { label: 'Payroll Run', href: '/school/payroll/run', built: true },
      { label: 'Salary Slips', href: '/school/payroll/slips', built: true },
      { label: 'Reports', href: '/school/payroll/reports', built: true },
      // Expenses are gated on accounts.*, which is where schema.sql put the
      // table. The screen sits under Payroll; the permission does not move.
      {
        label: 'Other Expenses',
        href: '/school/payroll/expenses',
        built: true,
        module: 'accounts',
        permission: 'accounts.read',
      },
      { label: 'Payroll Settings', href: '/school/payroll/settings', built: true },
    ],
  },
  {
    label: 'Transport',
    module: 'transport',
    icon: 'bus',
    children: [
      { label: 'Overview', href: '/school/transport', built: true },
      { label: 'Routes', href: '/school/transport/routes', built: true },
      { label: 'Vehicles', href: '/school/transport/vehicles', built: true },
      { label: 'Students', href: '/school/transport/students', built: true },
    ],
  },
  {
    label: 'Library',
    module: 'library',
    icon: 'book',
    children: [
      { label: 'Books', href: '/school/library', built: true },
      { label: 'Issue / Return', href: '/school/library/issue-return', built: true },
    ],
  },
  {
    label: 'Front Desk',
    module: 'frontdesk',
    icon: 'phone',
    children: [
      { label: 'Inquiries', href: '/school/frontdesk', built: true },
      { label: 'Visitors', href: '/school/frontdesk/visitors', built: true },
      { label: 'Complaints', href: '/school/frontdesk/complaints', built: true },
      { label: 'Phone Book', href: '/school/frontdesk/phonebook', built: true },
    ],
  },
  { label: 'Admissions', href: '/school/admissions', module: 'admissions', icon: 'inbox', built: false },
  { label: 'Reports', href: '/school/reports', module: 'reports', icon: 'chart', built: true },
  { label: 'Settings', href: '/school/settings', module: 'core', icon: 'cog', built: true },
  {
    label: 'Users',
    module: 'users',
    icon: 'shield',
    children: [
      { label: 'Users', href: '/school/users', built: true, permission: 'users.read' },
      { label: 'Roles', href: '/school/roles', built: true, permission: 'users.roles.write' },
    ],
  },
  {
    label: 'Audit Logs',
    href: '/school/audit',
    module: 'core',
    icon: 'activity',
    built: true,
    permission: 'core.audit.read',
  },
]
