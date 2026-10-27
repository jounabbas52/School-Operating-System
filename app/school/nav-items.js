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
//
// ---------------------------------------------------------------------------
// THE ORDER: how often somebody touches it, not how the schema was built
// ---------------------------------------------------------------------------
//
// Top of the list is what the office opens every single day -- the roll, the
// register, the fee counter. Below that, work that comes round each term: the
// timetable, the date sheet, exams, payroll. Then the services the school runs
// alongside teaching. Then reporting.
//
// Everything that is configured ONCE and then left alone sits at the bottom,
// together: Academic Setup, School Settings, Users & Access, Audit Logs.
// Sessions and Grade Levels used to be the second thing in the sidebar, above
// the screens people live in -- a year's worth of setup put in front of a
// clerk who just wanted to take money for a challan.
//
// ---------------------------------------------------------------------------
// THE NAMES
// ---------------------------------------------------------------------------
//
// A child is read directly beneath its group heading, so it does not repeat
// the group: "Fees > Overview", not "Fees > Fee Overview". The exception is a
// word that stops being unambiguous once it is flattened into the per-person
// access sheet, where no heading sits above it -- "Exam Results", "Test
// Results" and "Payroll Settings" keep their first word for that reason.
//
// ---------------------------------------------------------------------------
// RENAMING A GROUP IS NOT COSMETIC
// ---------------------------------------------------------------------------
//
// lib/access.js slugs a group's label into the key stored in
// page_catalog.module, and has_permission() joins user_module_access on
// exactly that value. Change a group label here and you must change the
// matching seed rows in supabase/migrations/026_simple_access.sql (and the
// latest sidebar migration), or everybody's module switch points at a group
// that no longer exists and every page under it goes dark.
export const NAV = [
  // No permission: the dashboard is the landing page for everybody who has a
  // school at all, and shows only what its own queries return.
  { label: 'Dashboard', href: '/school', module: 'core', icon: 'grid', built: true },

  /* ====================================================== every day ====== */

  {
    label: 'Students',
    module: 'students',
    icon: 'users',
    children: [
      // "Current" and "Former" rather than "Active" and "Old": the roll splits
      // on whether somebody still studies here, and "Old Students" reads like
      // a remark about their age.
      { label: 'Current Students', href: '/school/students', built: true, permission: 'students.read' },
      { label: 'Admission Register', href: '/school/students/register', built: true, permission: 'students.read' },
      { label: 'Promotions', href: '/school/students/promotion', built: true, permission: 'students.write' },
      { label: 'Former Students', href: '/school/students/old', built: true, permission: 'students.read' },
      { label: 'ID Cards', href: '/school/students/id-cards', built: true, permission: 'students.read' },
      { label: 'Certificates', href: '/school/students/certificates', built: true, permission: 'students.read' },
      { label: 'Reports', href: '/school/students/reports', built: true, permission: 'students.read' },
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
  {
    // Plural, like Students and Reports. Overview stays first so the group
    // opens the way Transport and Library do, with Collect Fee -- the counter's
    // screen, opened more than anything else here -- directly under it.
    label: 'Fees',
    module: 'fees',
    icon: 'rupee',
    children: [
      { label: 'Overview', href: '/school/fees', built: true, permission: 'fees.read' },
      { label: 'Collect Fee', href: '/school/fees/collect', built: true, permission: 'fees.read' },
      // One student's whole fee history, which is a ledger. It was called
      // "Student Fee Search", after the box you type into.
      { label: 'Student Ledger', href: '/school/fees/student', built: true, permission: 'fees.read' },
      { label: 'Challans', href: '/school/fees/challans', built: true, permission: 'fees.read' },
      { label: 'Create Challan', href: '/school/fees/challans/create', built: true, permission: 'fees.write' },
      { label: 'Fee Policy', href: '/school/fees/policy', built: true, permission: 'fees.read' },
      { label: 'Reports', href: '/school/fees/reports', built: true, permission: 'fees.read' },
    ],
  },

  /* ======================================================= each term ===== */

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
  // Date Sheet stays out of Examination, and above it. A date sheet is typed
  // up by the office, routinely before the exam record exists; buried under
  // Exams it was hidden from the people who write it.
  //
  // A group now, because the roll-number slips printed from that same date
  // sheet were a real screen reachable only by a button on another page --
  // which also meant nobody could be granted, or refused, that page on their
  // own access sheet.
  {
    label: 'Date Sheet',
    module: 'exams',
    icon: 'clipboard',
    children: [
      { label: 'Exam Schedule', href: '/school/datesheet', built: true, permission: 'exams.read' },
      { label: 'Roll No. Slips', href: '/school/datesheet/slips', built: true, permission: 'exams.read' },
    ],
  },
  {
    label: 'Examination',
    module: 'exams',
    icon: 'award',
    children: [
      { label: 'Exams', href: '/school/exams', built: true, permission: 'exams.read' },
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

  /* ========================================================== people ===== */

  // Teachers was a top-level entry of its own, sitting next to a group called
  // "HR / Staff" that did not contain it -- so the people a school manages most
  // were outside the place you go to manage people. First child here, and the
  // group keeps the word in its heading so it stays findable while collapsed.
  {
    label: 'Teachers & Staff',
    module: 'staff',
    icon: 'users',
    children: [
      { label: 'Teachers', href: '/school/teachers', built: true, permission: 'staff.read' },
      { label: 'All Staff', href: '/school/hr', built: true, permission: 'staff.read' },
      // Leave lives behind its own module: the 'hr' permissions are dead for a
      // school that has not bought Leave Management, so the link would open a
      // screen RLS refuses to fill.
      {
        label: 'Leave Requests',
        href: '/school/hr/leave',
        built: true,
        module: 'hr',
        permission: 'hr.read',
      },
      { label: 'Documents', href: '/school/hr/documents', built: true, permission: 'staff.read' },
    ],
  },
  {
    label: 'Payroll',
    module: 'payroll',
    icon: 'wallet',
    children: [
      { label: 'Salary Structures', href: '/school/payroll', built: true, permission: 'payroll.read' },
      { label: 'Staff Salaries', href: '/school/payroll/salaries', built: true, permission: 'payroll.read' },
      // "Payroll Run" stuttered under a heading already reading Payroll, and
      // the thing it names is the month's run.
      { label: 'Monthly Run', href: '/school/payroll/run', built: true, permission: 'payroll.read' },
      { label: 'Salary Slips', href: '/school/payroll/slips', built: true, permission: 'payroll.read' },
      // Expenses are gated on accounts.*, which is where schema.sql put the
      // table. The screen sits under Payroll; the permission does not move.
      {
        label: 'Expenses',
        href: '/school/payroll/expenses',
        built: true,
        module: 'accounts',
        permission: 'accounts.read',
      },
      { label: 'Reports', href: '/school/payroll/reports', built: true, permission: 'payroll.read' },
      { label: 'Payroll Settings', href: '/school/payroll/settings', built: true, permission: 'payroll.write' },
    ],
  },

  /* ======================================================== services ===== */

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
    built: true,
    permission: 'admissions.read',
  },

  /* ======================================================= reporting ===== */

  {
    label: 'Reports',
    href: '/school/reports',
    module: 'reports',
    icon: 'chart',
    built: true,
    permission: 'reports.read',
  },

  /* ===================================== set up once, then left alone ==== */

  {
    // Was "System Setup", which described nothing -- every screen in the app
    // is part of the system. This is the academic skeleton: the year, the
    // grades, the classes under them, the subjects taught.
    //
    // The children are in the order they have to be created: a class needs a
    // grade level, a section needs a class. Grade Levels used to come fourth,
    // after the two things that depend on it.
    label: 'Academic Setup',
    module: 'academics',
    icon: 'layers',
    children: [
      { label: 'Sessions', href: '/school/academics/sessions', built: true, permission: 'academics.write' },
      { label: 'Grade Levels', href: '/school/academics/grade-levels', built: true, permission: 'academics.write' },
      { label: 'Classes', href: '/school/academics/classes', built: true, permission: 'academics.write' },
      { label: 'Sections', href: '/school/academics/sections', built: true, permission: 'academics.write' },
      { label: 'Subjects', href: '/school/academics/subjects', built: true, permission: 'academics.write' },
    ],
  },
  {
    // "School" in front of it because Payroll has settings of its own, and on
    // a flat access sheet the two were the same word.
    //
    // A GROUP now, because WhatsApp lives inside Settings rather than in a
    // Communication section of its own. The child carries its own module
    // ('whatsapp', what the school bought) and its own permission, while the
    // GROUP label is what lib/access.js slugs into page_catalog.module --
    // so both pages sit under the one 'school-settings' switch.
    label: 'School Settings',
    module: 'core',
    icon: 'cog',
    children: [
      { label: 'School Settings', href: '/school/settings', built: true, permission: 'core.settings.write' },
      {
        label: 'WhatsApp',
        href: '/school/settings/whatsapp',
        built: true,
        module: 'whatsapp',
        permission: 'whatsapp.read',
      },
    ],
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
