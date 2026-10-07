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
      // History hangs off Reports rather than the sidebar -- it is the same
      // data one zoom level out, not a fourth place to look.
      { label: 'Reports', href: '/school/attendance/reports', built: true },
    ],
  },
  // Periods is an in-page tab, not a sidebar entry -- it is the same screen's
  // setup half rather than a second destination.
  { label: 'Timetable', href: '/school/timetable', module: 'academics', icon: 'grid', built: true },
  { label: 'Tests', href: '/school/tests', module: 'tests', icon: 'clipboard', built: false },
  { label: 'Examination', href: '/school/exams', module: 'exams', icon: 'award', built: false },
  { label: 'Fee', href: '/school/fees', module: 'fees', icon: 'rupee', built: false },
  { label: 'Accounts', href: '/school/accounts', module: 'accounts', icon: 'wallet', built: false },
  { label: 'Payroll', href: '/school/payroll', module: 'payroll', icon: 'wallet', built: false },
  { label: 'Transport', href: '/school/transport', module: 'transport', icon: 'bus', built: false },
  { label: 'Library', href: '/school/library', module: 'library', icon: 'book', built: false },
  { label: 'Front Desk', href: '/school/frontdesk', module: 'frontdesk', icon: 'phone', built: false },
  { label: 'Admissions', href: '/school/admissions', module: 'admissions', icon: 'inbox', built: false },
  { label: 'Reports', href: '/school/reports', module: 'reports', icon: 'chart', built: false },
  {
    label: 'Users',
    module: 'users',
    icon: 'shield',
    children: [
      { label: 'Users', href: '/school/users', built: true, permission: 'users.read' },
      { label: 'Roles', href: '/school/roles', built: true, permission: 'users.roles.write' },
    ],
  },
]
