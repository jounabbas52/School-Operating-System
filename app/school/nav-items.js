// Plain module on purpose -- no 'use client'.
//
// This list is read by the server layout (to filter it against the school's
// enabled modules) and by the client Nav component (to render it). Exporting
// it from the 'use client' file turned it into a client reference on the
// server, where NAV.filter is not a function.
//
// TWO GATES, AND BOTH MATTER
//
//   module      what the SCHOOL has bought
//   permission  what THIS PERSON may do
//
// Every entry must declare both. For a long time most declared only the
// module, which meant anybody who could sign in saw the entire sidebar --
// Fees, Payroll, Transport, the lot -- regardless of their role. The screens
// behind them were safe, because RLS refuses the rows, but a menu full of
// links that lead to empty tables is its own kind of broken: it tells a
// teacher the system is theirs to run and then denies it at every turn.
//
// If you add an entry, give it a permission. The read permission for its
// module is almost always the right one.
//
// `built: false` means the school has the module but the screen does not
// exist yet. Those render dimmed rather than hidden, so the sidebar stays
// honest about what the school is paying for.
export const NAV = [
  // No permission: the dashboard is the landing page for everybody who has a
  // school at all, and shows only what its own queries return.
  { label: 'Dashboard', href: '/school', module: 'core', icon: 'grid', built: true },


  {
    label: 'System Setup',
    module: 'academics',
    icon: 'layers',
    children: [
      { label: 'Sessions', href: '/school/academics/sessions', built: true, permission: 'academics.write' },
      { label: 'Classes', href: '/school/academics/classes', built: true, permission: 'academics.write' },
      { label: 'Sections', href: '/school/academics/sections', built: true, permission: 'academics.write' },
      { label: 'Grade Levels', href: '/school/academics/grade-levels', built: true, permission: 'academics.write' },
      { label: 'Subjects', href: '/school/academics/subjects', built: true, permission: 'academics.write' },
    ],
  },
  {
    label: 'Students',
    module: 'students',
    icon: 'users',
    children: [
      { label: 'Active Students', href: '/school/students', built: true, permission: 'students.read' },
      { label: 'Admission Register', href: '/school/students/register', built: true, permission: 'students.read' },
      { label: 'Promotion', href: '/school/students/promotion', built: true, permission: 'students.write' },
      { label: 'Old Students', href: '/school/students/old', built: true, permission: 'students.read' },
      { label: 'Student Reports', href: '/school/students/reports', built: true, permission: 'students.read' },
      { label: 'Certificates', href: '/school/students/certificates', built: true, permission: 'students.read' },
      { label: 'ID Cards', href: '/school/students/id-cards', built: true, permission: 'students.read' },
    ],
  },
  {
    label: 'Teachers',
    href: '/school/teachers',
    module: 'staff',
    icon: 'user',
    built: true,
    permission: 'staff.read',
  },
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
      // The WIDE permission on purpose. A teacher takes their register in
      // /teacher; these screens cover the whole school.
      { label: 'Student Attendance', href: '/school/attendance', built: true, permission: 'attendance.read' },
      { label: 'Staff Attendance', href: '/school/attendance/staff', built: true, permission: 'attendance.read' },
      { label: 'Thumb Attendance', href: '/school/attendance/biometric', built: true, permission: 'attendance.write' },
      // History hangs off Reports rather than the sidebar -- it is the same
      // data one zoom level out, not a fourth place to look.
      { label: 'Reports', href: '/school/attendance/reports', built: true, permission: 'attendance.read' },
    ],
  },
  // Periods is an in-page tab, not a sidebar entry -- it is the same screen's
  // setup half rather than a second destination.
  {
    label: 'Timetable',
    href: '/school/timetable',
    module: 'academics',
    icon: 'grid',
    built: true,
    permission: 'academics.write',
  },
  // Date Sheet is its own destination rather than a child of Examination: a
  // date sheet is typed up by the office, routinely before the exam record
  // exists, and burying it under Exams hid it from the people who write it.
  {
    label: 'Date Sheet',
    href: '/school/datesheet',
    module: 'exams',
    icon: 'clipboard',
    built: true,
    permission: 'exams.read',
  },
  {
    label: 'Examination',
    module: 'exams',
    icon: 'award',
    children: [
      { label: 'All Exams', href: '/school/exams', built: true, permission: 'exams.read' },
      { label: 'Exam Results', href: '/school/exams/results', built: true, permission: 'exams.read' },
      // Tests carry their own module. A school may buy Exams without Tests,
      // and has_permission('tests.read') is dead without it.
      { label: 'Tests', href: '/school/exams/tests', built: true, module: 'tests', permission: 'tests.read' },
      {
        label: 'Test Results',
        href: '/school/exams/tests/results',
        built: true,
        module: 'tests',
        permission: 'tests.read',
      },
    ],
  },
  {
    label: 'Fee',
    module: 'fees',
    icon: 'rupee',
    children: [
      { label: 'Fee Overview', href: '/school/fees', built: true, permission: 'fees.read' },
      { label: 'Student Fee Search', href: '/school/fees/student', built: true, permission: 'fees.read' },
      { label: 'Collect Fee', href: '/school/fees/collect', built: true, permission: 'fees.read' },
      { label: 'View Challans', href: '/school/fees/challans', built: true, permission: 'fees.read' },
      { label: 'Create Challan', href: '/school/fees/challans/create', built: true, permission: 'fees.write' },
      { label: 'Fee Policy', href: '/school/fees/policy', built: true, permission: 'fees.read' },
      { label: 'Reports', href: '/school/fees/reports', built: true, permission: 'fees.read' },
    ],
  },
  {
    label: 'Payroll',
    module: 'payroll',
    icon: 'wallet',
    children: [
      { label: 'Salary Structures', href: '/school/payroll', built: true, permission: 'payroll.read' },
      { label: 'Staff Salaries', href: '/school/payroll/salaries', built: true, permission: 'payroll.read' },
      { label: 'Payroll Run', href: '/school/payroll/run', built: true, permission: 'payroll.read' },
      { label: 'Salary Slips', href: '/school/payroll/slips', built: true, permission: 'payroll.read' },
      { label: 'Reports', href: '/school/payroll/reports', built: true, permission: 'payroll.read' },
      // Expenses are gated on accounts.*, which is where schema.sql put the
      // table. The screen sits under Payroll; the permission does not move.
      {
        label: 'Other Expenses',
        href: '/school/payroll/expenses',
        built: true,
        module: 'accounts',
        permission: 'accounts.read',
      },
      { label: 'Payroll Settings', href: '/school/payroll/settings', built: true, permission: 'payroll.write' },
    ],
  },
  {
    label: 'Transport',
    module: 'transport',
    icon: 'bus',
    children: [
      { label: 'Overview', href: '/school/transport', built: true, permission: 'transport.read' },
      { label: 'Routes', href: '/school/transport/routes', built: true, permission: 'transport.read' },
      { label: 'Vehicles', href: '/school/transport/vehicles', built: true, permission: 'transport.read' },
      { label: 'Students', href: '/school/transport/students', built: true, permission: 'transport.read' },
    ],
  },
  {
    label: 'Library',
    module: 'library',
    icon: 'book',
    children: [
      { label: 'Books', href: '/school/library', built: true, permission: 'library.read' },
      { label: 'Issue / Return', href: '/school/library/issue-return', built: true, permission: 'library.read' },
    ],
  },
  {
    label: 'Front Desk',
    module: 'frontdesk',
    icon: 'phone',
    children: [
      { label: 'Inquiries', href: '/school/frontdesk', built: true, permission: 'frontdesk.read' },
      { label: 'Visitors', href: '/school/frontdesk/visitors', built: true, permission: 'frontdesk.read' },
      { label: 'Complaints', href: '/school/frontdesk/complaints', built: true, permission: 'frontdesk.read' },
      { label: 'Phone Book', href: '/school/frontdesk/phonebook', built: true, permission: 'frontdesk.read' },
    ],
  },
  {
    label: 'Admissions',
    href: '/school/admissions',
    module: 'admissions',
    icon: 'inbox',
    built: false,
    permission: 'admissions.read',
  },
  {
    label: 'Reports',
    href: '/school/reports',
    module: 'reports',
    icon: 'chart',
    built: true,
    permission: 'reports.read',
  },
  {
    label: 'Settings',
    href: '/school/settings',
    module: 'core',
    icon: 'cog',
    built: true,
    permission: 'core.settings.write',
  },
  // One entry, not a group: there is no Roles screen any more. Access is set
  // per person, on that person's own page.
  {
    label: 'Users & Access',
    href: '/school/users',
    module: 'users',
    icon: 'shield',
    built: true,
    permission: 'users.read',
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
