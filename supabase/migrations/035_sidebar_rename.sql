-- ============================================================================
-- 031_SIDEBAR_RENAME.sql -- run after 030_admissions.sql
-- ============================================================================
-- Paste the whole file into the SQL editor and Run. Idempotent.
--
-- WHAT THIS IS FOR
--
-- The sidebar was reordered and several entries renamed. Some of those names
-- are not labels at all -- they are keys this database joins on.
--
-- lib/access.js turns a sidebar GROUP's label into a slug: "System Setup"
-- becomes 'system-setup'. That slug is what page_catalog.module stores, and
-- has_permission() joins user_module_access on exactly that string:
--
--     JOIN public.page_catalog pc ON pc.page = a.page
--     JOIN public.user_module_access ma ON ma.module = pc.module AND ma.enabled
--
-- So renaming "System Setup" to "Academic Setup" in the sidebar, with nothing
-- done here, leaves every user_module_access row pointing at a group that no
-- longer exists. The join finds nothing, has_permission() returns false, and
-- every page under that group goes dark -- silently, with no error anywhere,
-- for the people who had been granted it.
--
-- This file does the two halves of that rename the database owns:
--
--   1. repoint user_module_access from the old slugs to the new ones
--   2. rewrite page_catalog -- labels, groups and sidebar order
--
-- WHY A NEW FILE RATHER THAN AN EDIT TO 026
--
-- 026_simple_access.sql has already been applied here. Its seed was updated in
-- place as well, which is what a school created from scratch now gets; this
-- file is what brings a database that already ran it to the same state. Both
-- end up identical, and running either twice changes nothing.
--
-- TWO GROUPS MERGE INTO ONE
--
-- Teachers was a top-level entry beside a group called "HR / Staff" that did
-- not contain it. Both now live under "Teachers & Staff", so 'teachers' and
-- 'hr-staff' both map to 'teachers-staff'. Somebody holding both rows would
-- collide on (school_id, profile_id, module), so the merge is an aggregate --
-- enabled wins, because losing access is the damaging direction.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Repoint what people were granted
-- ----------------------------------------------------------------------------
-- The map holds only the groups whose label changed. A slug that still matches
-- is deliberately absent: it must not be touched.
--
-- The new rows are inserted before the old ones are deleted, so if this run
-- fails somewhere in between it leaves the old grants standing rather than
-- nobody with anything.
INSERT INTO public.user_module_access (school_id, profile_id, module, enabled)
SELECT u.school_id, u.profile_id, r.new_slug, bool_or(u.enabled)
  FROM public.user_module_access u
  JOIN (VALUES
          ('system-setup', 'academic-setup'),   -- "System Setup" -> "Academic Setup"
          ('hr-staff',     'teachers-staff'),   -- "HR / Staff"   -> "Teachers & Staff"
          ('teachers',     'teachers-staff'),   -- the former top-level entry, now a child
          ('fee',          'fees'),             -- "Fee"          -> "Fees"
          ('settings',     'school-settings'),  -- "Settings"     -> "School Settings"
          ('whatsapp',     'communication')     -- the group is the channel-neutral one
       ) AS r(old_slug, new_slug) ON r.old_slug = u.module
 GROUP BY u.school_id, u.profile_id, r.new_slug
ON CONFLICT (school_id, profile_id, module) DO UPDATE
  SET enabled = user_module_access.enabled OR EXCLUDED.enabled;

DELETE FROM public.user_module_access
 WHERE module IN ('system-setup', 'hr-staff', 'teachers', 'fee', 'settings', 'whatsapp');


-- ----------------------------------------------------------------------------
-- 2. The page that was never on the sidebar
-- ----------------------------------------------------------------------------
-- Roll No. Slips (/school/datesheet/slips) was a real screen reachable only by
-- a button on the Date Sheet page, so nobody ever had a row for it. Anyone who
-- could open the date sheet could already open the slips -- this writes down
-- what was already true rather than granting anything new.
INSERT INTO public.user_page_access
  (school_id, profile_id, page, section, can_view, can_edit, can_delete)
SELECT a.school_id, a.profile_id, '/school/datesheet/slips', a.section,
       a.can_view, a.can_edit, a.can_delete
  FROM public.user_page_access a
 WHERE a.page = '/school/datesheet'
ON CONFLICT (school_id, profile_id, page) DO NOTHING;


-- ----------------------------------------------------------------------------
-- 3. The catalog itself
-- ----------------------------------------------------------------------------
-- Generated from app/school/nav-items.js, the one list the sidebar renders
-- from, and identical to the seed now in 026_simple_access.sql. `page` is the
-- primary key, so this is a straight upsert; `section` is untouched by the
-- rename and is restated only to keep the two blocks byte-identical.
INSERT INTO public.page_catalog (page, section, module, label, group_label, sort_order, has_edit, has_delete) VALUES
  ('/school', 'dashboard', 'dashboard', 'Dashboard', 'Dashboard', 10, false, false),
  ('/school/students', 'students', 'students', 'Current Students', 'Students', 20, true, true),
  ('/school/students/register', 'students', 'students', 'Admission Register', 'Students', 30, true, true),
  ('/school/students/promotion', 'students', 'students', 'Promotions', 'Students', 40, true, true),
  ('/school/students/old', 'students', 'students', 'Former Students', 'Students', 50, true, true),
  ('/school/students/id-cards', 'students', 'students', 'ID Cards', 'Students', 60, true, true),
  ('/school/students/certificates', 'students', 'students', 'Certificates', 'Students', 70, true, true),
  ('/school/students/reports', 'students', 'students', 'Reports', 'Students', 80, true, true),
  ('/school/attendance', 'attendance', 'attendance', 'Student Attendance', 'Attendance', 90, true, true),
  ('/school/attendance/staff', 'attendance', 'attendance', 'Staff Attendance', 'Attendance', 100, true, true),
  ('/school/attendance/biometric', 'attendance', 'attendance', 'Thumb Attendance', 'Attendance', 110, true, true),
  ('/school/attendance/reports', 'attendance', 'attendance', 'Reports', 'Attendance', 120, true, true),
  ('/school/fees', 'fees', 'fees', 'Overview', 'Fees', 130, true, true),
  ('/school/fees/collect', 'fees', 'fees', 'Collect Fee', 'Fees', 140, true, true),
  ('/school/fees/student', 'fees', 'fees', 'Student Ledger', 'Fees', 150, true, true),
  ('/school/fees/challans', 'fees', 'fees', 'Challans', 'Fees', 160, true, true),
  ('/school/fees/challans/create', 'fees', 'fees', 'Create Challan', 'Fees', 170, true, true),
  ('/school/fees/policy', 'fees', 'fees', 'Fee Policy', 'Fees', 180, true, true),
  ('/school/fees/reports', 'fees', 'fees', 'Reports', 'Fees', 190, true, true),
  ('/school/timetable', 'academics', 'timetable', 'Timetable', 'Timetable', 200, true, true),
  ('/school/datesheet', 'exams', 'date-sheet', 'Exam Schedule', 'Date Sheet', 210, true, true),
  ('/school/datesheet/slips', 'exams', 'date-sheet', 'Roll No. Slips', 'Date Sheet', 220, true, true),
  ('/school/exams', 'exams', 'examination', 'Exams', 'Examination', 230, true, true),
  ('/school/exams/results', 'exams', 'examination', 'Exam Results', 'Examination', 240, true, true),
  ('/school/exams/tests', 'tests', 'examination', 'Tests', 'Examination', 250, true, true),
  ('/school/exams/tests/results', 'tests', 'examination', 'Test Results', 'Examination', 260, true, true),
  ('/school/teachers', 'staff', 'teachers-staff', 'Teachers', 'Teachers & Staff', 270, true, true),
  ('/school/hr', 'staff', 'teachers-staff', 'All Staff', 'Teachers & Staff', 280, true, true),
  ('/school/hr/leave', 'hr', 'teachers-staff', 'Leave Requests', 'Teachers & Staff', 290, true, true),
  ('/school/hr/documents', 'staff', 'teachers-staff', 'Documents', 'Teachers & Staff', 300, true, true),
  ('/school/payroll', 'payroll', 'payroll', 'Salary Structures', 'Payroll', 310, true, true),
  ('/school/payroll/salaries', 'payroll', 'payroll', 'Staff Salaries', 'Payroll', 320, true, true),
  ('/school/payroll/run', 'payroll', 'payroll', 'Monthly Run', 'Payroll', 330, true, true),
  ('/school/payroll/slips', 'payroll', 'payroll', 'Salary Slips', 'Payroll', 340, true, true),
  ('/school/payroll/expenses', 'accounts', 'payroll', 'Expenses', 'Payroll', 350, true, true),
  ('/school/payroll/reports', 'payroll', 'payroll', 'Reports', 'Payroll', 360, true, true),
  ('/school/payroll/settings', 'payroll', 'payroll', 'Payroll Settings', 'Payroll', 370, true, true),
  ('/school/transport', 'transport', 'transport', 'Overview', 'Transport', 380, true, true),
  ('/school/transport/routes', 'transport', 'transport', 'Routes', 'Transport', 390, true, true),
  ('/school/transport/vehicles', 'transport', 'transport', 'Vehicles', 'Transport', 400, true, true),
  ('/school/transport/students', 'transport', 'transport', 'Students', 'Transport', 410, true, true),
  ('/school/library', 'library', 'library', 'Books', 'Library', 420, true, true),
  ('/school/library/issue-return', 'library', 'library', 'Issue / Return', 'Library', 430, true, true),
  ('/school/frontdesk', 'frontdesk', 'front-desk', 'Inquiries', 'Front Desk', 440, true, true),
  ('/school/frontdesk/visitors', 'frontdesk', 'front-desk', 'Visitors', 'Front Desk', 450, true, true),
  ('/school/frontdesk/complaints', 'frontdesk', 'front-desk', 'Complaints', 'Front Desk', 460, true, true),
  ('/school/frontdesk/phonebook', 'frontdesk', 'front-desk', 'Phone Book', 'Front Desk', 470, true, true),
  ('/school/admissions', 'admissions', 'admissions', 'Admissions', 'Admissions', 510, true, true),
  ('/school/reports', 'reports', 'reports', 'Reports', 'Reports', 520, true, true),
  ('/school/academics/sessions', 'academics', 'academic-setup', 'Sessions', 'Academic Setup', 530, true, true),
  ('/school/academics/grade-levels', 'academics', 'academic-setup', 'Grade Levels', 'Academic Setup', 540, true, true),
  ('/school/academics/classes', 'academics', 'academic-setup', 'Classes', 'Academic Setup', 550, true, true),
  ('/school/academics/sections', 'academics', 'academic-setup', 'Sections', 'Academic Setup', 560, true, true),
  ('/school/academics/subjects', 'academics', 'academic-setup', 'Subjects', 'Academic Setup', 570, true, true),
  ('/school/settings', 'settings', 'school-settings', 'School Settings', 'School Settings', 580, true, false),
  -- WhatsApp lives inside School Settings, not in a Communication section.
  -- 032_whatsapp_in_settings.sql is what MOVES an existing database; this
  -- row is so a fresh one never creates the old routes in the first place.
  ('/school/settings/whatsapp', 'whatsapp', 'school-settings', 'WhatsApp', 'School Settings', 585, true, true),
  ('/school/users', 'users', 'users-access', 'Users & Access', 'Users & Access', 590, true, true),
  ('/school/audit', 'audit', 'audit-logs', 'Audit Logs', 'Audit Logs', 600, false, false)
ON CONFLICT (page) DO UPDATE
  SET section = EXCLUDED.section, module = EXCLUDED.module, label = EXCLUDED.label,
      group_label = EXCLUDED.group_label, sort_order = EXCLUDED.sort_order,
      has_edit = EXCLUDED.has_edit, has_delete = EXCLUDED.has_delete;


-- ----------------------------------------------------------------------------
-- 4. Refuse to finish quietly if a grant was left behind
-- ----------------------------------------------------------------------------
-- Rule 1 of has_permission() is an INNER join from page_catalog.module to
-- user_module_access.module. A row left pointing at a slug that is no longer
-- in the catalog raises no error anywhere -- it is simply a person whose pages
-- have stopped opening, with nothing in the UI to say why. That is the one
-- outcome worth failing on.
--
-- The SQL editor runs a script as a single transaction, so this raising undoes
-- everything above it. If you are running the file some other way, check that
-- for yourself rather than assuming.
DO $$
DECLARE
  v_orphans integer;
  v_names   text;
BEGIN
  SELECT count(*), string_agg(DISTINCT module, ', ')
    INTO v_orphans, v_names
    FROM public.user_module_access u
   WHERE NOT EXISTS (SELECT 1 FROM public.page_catalog pc WHERE pc.module = u.module);

  IF v_orphans > 0 THEN
    RAISE EXCEPTION
      'Stopping: % user_module_access row(s) point at sidebar group(s) that are not in page_catalog (%). Add the missing old -> new pair to the VALUES list in section 1 and run this again.',
      v_orphans, v_names;
  END IF;

  RAISE NOTICE 'Sidebar rename applied: % pages in the catalog, no orphaned module grants.',
    (SELECT count(*) FROM public.page_catalog);
END
$$;
