-- ============================================================================
-- 026_SIMPLE_ACCESS.sql -- the access system, and the only one
-- ============================================================================
-- Paste the whole file into the SQL editor and Run. Idempotent, and it stands
-- on its own: whatever did or did not finish before it, this leaves a working
-- system behind.
--
-- THE ADMINISTRATOR, THEN TWO RULES FOR EVERYBODY ELSE
--
-- The school administrator has everything, always, and has no access list
-- at all -- they are the person who writes everybody else's. The flag is
-- profiles.is_school_admin, and has_permission() short-circuits on it, so
-- it holds for rows as much as for menus. Section 0 sets it.
--
-- For every other account, two rules:
--
--   1. MODULE   a sidebar group is on or off for this person. Off, and the
--               whole group vanishes -- Students, its seven pages, all of
--               it -- however the page switches below happen to be set.
--
--   2. PAGE     inside a module that is on, each page carries VIEW, EDIT,
--               DELETE: any, all or none of the three.
--
--     module Students        [x] on
--       Active Students       [x] view  [x] edit  [ ] delete
--       Admission Register    [x] view  [ ] edit  [ ] delete
--       Promotion             [ ] view  [ ] edit  [ ] delete   <- not theirs
--
--     module Fee             [ ] off    <- Fee is not in their sidebar at all
--
-- The two are ANDed, and both are stored. Switching a module off hides
-- everything under it WITHOUT forgetting the page switches underneath, so
-- switching it back on returns the person to exactly where they were.
--
-- A page they were not given never appears in their sidebar and does not
-- open. A page with view and nothing else opens exactly as it does for the
-- administrator -- same screen, same records -- with no Add, no Save and no
-- Delete, and the database refusing those writes underneath.
--
-- GONE, DELIBERATELY
--
--   roles              every person's list is their own
--   scopes             no "own classes only", no teacher panel, no routing
--                      guesses -- there is one panel and it is /school
--   create vs edit     adding and changing are one switch, because the
--                      policies underneath cannot tell them apart
--
-- HOW IT REACHES THE ROWS
--
-- Every RLS policy already asks has_permission('students.write') and friends.
-- Those calls are untouched. permission_map turns a code into a section and a
-- verb, and the answer is yes when any page the person holds in that section
-- allows that verb.
--
-- NOBODY IS LOCKED OUT
--
-- Section 0 marks an administrator for every school, and section 5 is the
-- safety net for any school that somehow still has none. An administrator
-- needs no access rows, so there is nothing that can go stale and nothing
-- that can be switched off by mistake.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0. THE ADMINISTRATOR
-- ----------------------------------------------------------------------------
-- The school administrator is NOT a user with a very long list. They are the
-- person who hands out the lists, and they sit outside the two rules
-- entirely: every module, every page, always. There is nothing to configure
-- for them, and so no way to configure them into a corner.
--
-- That asymmetry is what makes the rest safe to use. An access system whose
-- own administrator can be locked out of the screen that fixes it has exactly
-- one failure mode, and it costs you the whole school. This project found it
-- twice before the flag existed.
--
-- WHO IS IT
--
-- Whoever the school was set up with: the oldest account. Plus anybody who
-- can already manage users under whatever system is in place right now, so
-- that running this never takes the keys off somebody who holds them.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_school_admin boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.is_school_admin IS
  'Full, unconditional access to their school. Set for the account a school is created with; everybody else is governed by user_module_access and user_page_access.';

-- The oldest account of every school.
UPDATE public.profiles p
   SET is_school_admin = true
 WHERE p.school_id IS NOT NULL
   AND p.is_deleted = false
   AND p.id = (
     SELECT q.id FROM public.profiles q
      WHERE q.school_id = p.school_id AND q.is_deleted = false
      ORDER BY q.created_at
      LIMIT 1
   );

-- ...and anybody who can manage users today, under whichever shape of the
-- access tables this database currently has.
DO $admins$
BEGIN
  IF to_regclass('public.user_page_access') IS NOT NULL THEN
    EXECUTE $q$
      UPDATE public.profiles p
         SET is_school_admin = true
       WHERE EXISTS (
         SELECT 1 FROM public.user_page_access a
          WHERE a.profile_id = p.id
            AND a.section = 'users'
            -- Read through jsonb so this works whichever shape the table is
            -- in: older ones had can_create, older ones still had can_write.
            AND (coalesce((to_jsonb(a) ->> 'can_edit')::boolean, false)
                 OR coalesce((to_jsonb(a) ->> 'can_create')::boolean, false)
                 OR coalesce((to_jsonb(a) ->> 'can_write')::boolean, false))
       )
    $q$;
  END IF;

  IF to_regclass('public.user_access') IS NOT NULL THEN
    EXECUTE $q$
      UPDATE public.profiles p
         SET is_school_admin = true
       WHERE EXISTS (
         SELECT 1 FROM public.user_access a
          WHERE a.profile_id = p.id AND a.section = 'users' AND a.can_write
       )
    $q$;
  END IF;
END
$admins$;

-- An administrator needs no rows in either access table: has_permission()
-- answers for them before it looks. Clearing them keeps the tables to what
-- they are for -- the staff whose access is actually being decided -- so that
-- reading one by hand tells you something true.
DO $clear$
BEGIN
  IF to_regclass('public.user_page_access') IS NOT NULL THEN
    DELETE FROM public.user_page_access a
     USING public.profiles p
     WHERE p.id = a.profile_id AND p.is_school_admin;
  END IF;

  IF to_regclass('public.user_module_access') IS NOT NULL THEN
    DELETE FROM public.user_module_access m
     USING public.profiles p
     WHERE p.id = m.profile_id AND p.is_school_admin;
  END IF;
END
$clear$;

-- Make somebody an administrator from the SQL editor. The app has no button
-- for this on purpose: handing over the keys to a whole school should take
-- more than a mis-click.
--
--     SELECT public.make_school_admin('admin@demo.test');
CREATE OR REPLACE FUNCTION public.make_school_admin(p_email text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.profiles WHERE lower(email) = lower(trim(p_email));
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'no account for %', p_email;
  END IF;

  UPDATE public.profiles
     SET is_school_admin = true, status = 'active', is_deleted = false, updated_at = now()
   WHERE id = v_id;

  -- Their switches are meaningless now, and leaving them would suggest
  -- otherwise to the next person who reads the table.
  DELETE FROM public.user_page_access WHERE profile_id = v_id;
  IF to_regclass('public.user_module_access') IS NOT NULL THEN
    DELETE FROM public.user_module_access WHERE profile_id = v_id;
  END IF;

  RETURN format('%s is now an administrator: full access, no access list', p_email);
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.make_school_admin(text) FROM PUBLIC, anon, authenticated;


-- ----------------------------------------------------------------------------
-- 1. Every page the app has
-- ----------------------------------------------------------------------------
-- Generated from NAV in app/school/nav-items.js, so a page cannot exist in
-- the menu and not here. `page` is the route, the only name a page reliably
-- has. has_edit / has_delete say which switches a page can offer at all: the
-- dashboard and the audit trail can only be looked at, and settings is its
-- own editor with nothing to delete.
CREATE TABLE IF NOT EXISTS public.page_catalog (
  page        text PRIMARY KEY,
  section     text NOT NULL,
  label       text NOT NULL,
  -- Which sidebar GROUP the page sits under. This is what rule 1 switches
  -- on and off: one row in user_module_access per module per person.
  module      text NOT NULL DEFAULT '',
  group_label text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  has_edit    boolean NOT NULL DEFAULT true,
  has_delete  boolean NOT NULL DEFAULT true
);

ALTER TABLE public.page_catalog ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE POLICY page_catalog_select ON public.page_catalog
    FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;

-- The teacher panel is gone, so its row goes with it.
DELETE FROM public.page_catalog WHERE page = '/teacher';

-- Older shapes of this table had one `has_crud` column.
ALTER TABLE public.page_catalog ADD COLUMN IF NOT EXISTS module     text NOT NULL DEFAULT '';
ALTER TABLE public.page_catalog ADD COLUMN IF NOT EXISTS has_edit   boolean NOT NULL DEFAULT true;
ALTER TABLE public.page_catalog ADD COLUMN IF NOT EXISTS has_delete boolean NOT NULL DEFAULT true;
ALTER TABLE public.page_catalog DROP COLUMN IF EXISTS has_crud;

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
  ('/school/communication/whatsapp', 'whatsapp', 'communication', 'WhatsApp', 'Communication', 480, true, true),
  ('/school/communication/whatsapp/templates', 'whatsapp', 'communication', 'Templates', 'Communication', 490, true, true),
  ('/school/communication/whatsapp/log', 'whatsapp', 'communication', 'Message Log', 'Communication', 500, false, false),
  ('/school/admissions', 'admissions', 'admissions', 'Admissions', 'Admissions', 510, true, true),
  ('/school/reports', 'reports', 'reports', 'Reports', 'Reports', 520, true, true),
  ('/school/academics/sessions', 'academics', 'academic-setup', 'Sessions', 'Academic Setup', 530, true, true),
  ('/school/academics/grade-levels', 'academics', 'academic-setup', 'Grade Levels', 'Academic Setup', 540, true, true),
  ('/school/academics/classes', 'academics', 'academic-setup', 'Classes', 'Academic Setup', 550, true, true),
  ('/school/academics/sections', 'academics', 'academic-setup', 'Sections', 'Academic Setup', 560, true, true),
  ('/school/academics/subjects', 'academics', 'academic-setup', 'Subjects', 'Academic Setup', 570, true, true),
  ('/school/settings', 'settings', 'school-settings', 'School Settings', 'School Settings', 580, true, false),
  ('/school/users', 'users', 'users-access', 'Users & Access', 'Users & Access', 590, true, true),
  ('/school/audit', 'audit', 'audit-logs', 'Audit Logs', 'Audit Logs', 600, false, false)
ON CONFLICT (page) DO UPDATE
  SET section = EXCLUDED.section, module = EXCLUDED.module, label = EXCLUDED.label,
      group_label = EXCLUDED.group_label, sort_order = EXCLUDED.sort_order,
      has_edit = EXCLUDED.has_edit, has_delete = EXCLUDED.has_delete;


-- ----------------------------------------------------------------------------
-- 2. The code -> (section, verb) map
-- ----------------------------------------------------------------------------
-- The translation layer that lets every existing policy keep its wording. A
-- code that is not in this table grants nothing, which is the right way
-- round: a typo fails closed.
--
-- The `.own` codes from the old teacher scoping are deleted below. Nothing
-- hands them out any more, so leaving them here would be a row that can never
-- be true -- and a reader would have to work that out for themselves.
CREATE TABLE IF NOT EXISTS public.permission_map (
  code    text PRIMARY KEY,
  section text NOT NULL,
  verb    text NOT NULL CHECK (verb IN ('view', 'edit', 'delete')),
  scope   text
);

ALTER TABLE public.permission_map ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Readable by anybody signed in: it is a catalogue, not data.
  CREATE POLICY permission_map_select ON public.permission_map
    FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;

-- NORMALISE THE DATA FIRST, THEN TIGHTEN THE CONSTRAINT.
--
-- In that order, and it matters: an earlier shape of this table stored
-- 'write' where this one stores 'edit', and adding the new CHECK before
-- converting those rows fails the whole migration on its own data --
--
--     check constraint "permission_map_verb_check" ... is violated by some row
--
-- So: drop the old rule, fix the rows it was describing, then state the new
-- rule over data that already satisfies it.
ALTER TABLE public.permission_map DROP CONSTRAINT IF EXISTS permission_map_verb_check;

-- The teacher-scoped codes are gone, so the rows that named them are too.
DELETE FROM public.permission_map WHERE code LIKE '%.own';

-- Adding and changing became one switch; 'write' is what it used to be called.
UPDATE public.permission_map SET verb = 'edit' WHERE verb = 'write';

-- Anything else is from a shape nobody remembers. It cannot satisfy the
-- constraint below and it grants nothing, so it goes rather than blocking
-- the migration.
DELETE FROM public.permission_map WHERE verb NOT IN ('view', 'edit', 'delete');

ALTER TABLE public.permission_map DROP COLUMN IF EXISTS scope;

ALTER TABLE public.permission_map ADD CONSTRAINT permission_map_verb_check
  CHECK (verb IN ('view', 'edit', 'delete'));

INSERT INTO public.permission_map (code, section, verb) VALUES
  ('students.read', 'students', 'view'),
  ('students.write', 'students', 'edit'),
  ('students.delete', 'students', 'delete'),
  ('admissions.read', 'admissions', 'view'),
  ('admissions.write', 'admissions', 'edit'),
  ('admissions.delete', 'admissions', 'delete'),
  ('academics.read', 'academics', 'view'),
  ('academics.write', 'academics', 'edit'),
  ('academics.delete', 'academics', 'delete'),
  ('attendance.read', 'attendance', 'view'),
  ('attendance.write', 'attendance', 'edit'),
  ('attendance.delete', 'attendance', 'delete'),
  ('tests.read', 'tests', 'view'),
  ('tests.write', 'tests', 'edit'),
  ('tests.delete', 'tests', 'delete'),
  ('exams.read', 'exams', 'view'),
  ('exams.write', 'exams', 'edit'),
  ('exams.publish', 'exams', 'edit'),
  ('exams.delete', 'exams', 'delete'),
  ('fees.read', 'fees', 'view'),
  ('fees.write', 'fees', 'edit'),
  ('fees.delete', 'fees', 'delete'),
  ('accounts.read', 'accounts', 'view'),
  ('accounts.write', 'accounts', 'edit'),
  ('accounts.delete', 'accounts', 'delete'),
  ('payroll.read', 'payroll', 'view'),
  ('payroll.write', 'payroll', 'edit'),
  ('payroll.delete', 'payroll', 'delete'),
  ('staff.read', 'staff', 'view'),
  ('staff.write', 'staff', 'edit'),
  ('staff.delete', 'staff', 'delete'),
  ('hr.read', 'hr', 'view'),
  ('hr.write', 'hr', 'edit'),
  ('hr.delete', 'hr', 'delete'),
  ('library.read', 'library', 'view'),
  ('library.write', 'library', 'edit'),
  ('library.delete', 'library', 'delete'),
  ('transport.read', 'transport', 'view'),
  ('transport.write', 'transport', 'edit'),
  ('transport.delete', 'transport', 'delete'),
  ('frontdesk.read', 'frontdesk', 'view'),
  ('frontdesk.write', 'frontdesk', 'edit'),
  ('frontdesk.delete', 'frontdesk', 'delete'),
  ('reports.read', 'reports', 'view'),
  ('reports.write', 'reports', 'edit'),
  ('reports.delete', 'reports', 'delete'),
  ('users.read', 'users', 'view'),
  ('users.write', 'users', 'edit'),
  ('users.delete', 'users', 'delete'),
  ('core.settings.write', 'settings', 'edit'),
  ('core.audit.read', 'audit', 'view')
ON CONFLICT (code) DO UPDATE
  SET section = EXCLUDED.section, verb = EXCLUDED.verb;


-- ----------------------------------------------------------------------------
-- 3. One row per person per page
-- ----------------------------------------------------------------------------
-- No row means no access to that page. A missing row and an all-false row say
-- the same thing, so there is no third state to reason about, and a page
-- added to the app later is closed to everybody until somebody opens it.
CREATE TABLE IF NOT EXISTS public.user_page_access (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  page       text NOT NULL,
  -- Denormalised from page_catalog on purpose: has_permission() runs several
  -- times per request from inside policies, and a join it does not have to
  -- make is a join it does not have to make.
  section    text NOT NULL,
  can_view   boolean NOT NULL DEFAULT false,
  can_edit   boolean NOT NULL DEFAULT false,
  can_delete boolean NOT NULL DEFAULT false,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, profile_id, page)
);

-- Fold the older shape in: adding and changing were two switches, and the
-- policies underneath could never tell them apart.
ALTER TABLE public.user_page_access ADD COLUMN IF NOT EXISTS can_edit boolean NOT NULL DEFAULT false;
UPDATE public.user_page_access SET can_edit = true
 WHERE can_edit = false
   AND EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'user_page_access'
                  AND column_name = 'can_create')
   AND (to_jsonb(user_page_access) ->> 'can_create')::boolean;
ALTER TABLE public.user_page_access DROP COLUMN IF EXISTS can_create;
ALTER TABLE public.user_page_access DROP COLUMN IF EXISTS scope;

DELETE FROM public.user_page_access WHERE page = '/teacher';

CREATE INDEX IF NOT EXISTS idx_user_page_access_person
  ON public.user_page_access (school_id, profile_id);
CREATE INDEX IF NOT EXISTS idx_user_page_access_lookup
  ON public.user_page_access (profile_id, section);

SELECT public.apply_tenant_rls('user_page_access', 'users.read', 'users.write');
SELECT public.add_touch_trigger('user_page_access');
SELECT public.add_audit_trigger('user_page_access');

-- Everybody may read their OWN list: the sidebar is built from it, and a
-- member of staff does not hold users.read.
DO $$
BEGIN
  CREATE POLICY user_page_access_select_own ON public.user_page_access
    FOR SELECT TO authenticated
    USING (profile_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;


-- ----------------------------------------------------------------------------
-- 3b. Rule 1 -- one row per person per module
-- ----------------------------------------------------------------------------
-- The sidebar group, on or off. No row is off, the same deny-by-default the
-- page list uses: a module added to the app later is closed to everybody
-- until somebody opens it.
--
-- Kept apart from the page rows on purpose. Switching Students off should
-- hide the whole group without destroying which of its seven pages the
-- person had, so that switching it back on puts them where they were rather
-- than at nothing.
CREATE TABLE IF NOT EXISTS public.user_module_access (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  module     text NOT NULL,
  enabled    boolean NOT NULL DEFAULT true,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, profile_id, module)
);

CREATE INDEX IF NOT EXISTS idx_user_module_access_person
  ON public.user_module_access (school_id, profile_id);

SELECT public.apply_tenant_rls('user_module_access', 'users.read', 'users.write');
SELECT public.add_touch_trigger('user_module_access');
SELECT public.add_audit_trigger('user_module_access');

-- Everybody may read their OWN modules, for the same reason as the pages:
-- the sidebar is built from them and a member of staff does not hold
-- users.read.
DO $$
BEGIN
  CREATE POLICY user_module_access_select_own ON public.user_module_access
    FOR SELECT TO authenticated
    USING (profile_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;

-- Everybody who already has pages keeps them: a module is switched on where
-- the person can see anything under it. Rule 1 arrives open rather than
-- closed for people who already had access, and closed for everybody else.
INSERT INTO public.user_module_access (school_id, profile_id, module, enabled)
SELECT DISTINCT a.school_id, a.profile_id, pc.module, true
  FROM public.user_page_access a
  JOIN public.page_catalog pc ON pc.page = a.page
 WHERE a.can_view OR a.can_edit OR a.can_delete
ON CONFLICT (school_id, profile_id, module) DO NOTHING;


-- ----------------------------------------------------------------------------
-- 4. has_permission()
-- ----------------------------------------------------------------------------
-- Same signature and same callers it has had since the first migration.
-- SECURITY DEFINER for the same reason too: it is called from inside policies
-- and must not re-enter their RLS. The lookup is pinned to auth.uid() and
-- takes no parameter that could widen it.
CREATE OR REPLACE FUNCTION public.has_permission(p_perm text)
RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public, auth
AS $$
  -- THE ADMINISTRATOR, answered before anything else is looked at. Their
  -- access does not depend on a table that could be empty, stale, or half
  -- migrated -- which is the entire point of the flag.
  --
  -- Still gated on the module: a school that was never sold Payroll has no
  -- payroll to administer.
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.is_school_admin
      AND p.status = 'active'
      AND p.is_deleted = false
      AND public.school_has_module(p.school_id, split_part(p_perm, '.', 1))
  )
  OR EXISTS (
    -- EVERYBODY ELSE: the two rules.
    SELECT 1
    FROM public.profiles p
    JOIN public.permission_map m ON m.code = p_perm
    JOIN public.user_page_access a
      ON a.profile_id = p.id
     AND a.school_id  = p.school_id
     AND a.section    = m.section
    -- RULE 1. The page only counts if its module is switched on. A missing
    -- row is off, so this is an inner join on purpose.
    JOIN public.page_catalog pc ON pc.page = a.page
    JOIN public.user_module_access ma
      ON ma.profile_id = p.id
     AND ma.school_id  = p.school_id
     AND ma.module     = pc.module
     AND ma.enabled
    WHERE p.id = auth.uid()
      AND p.status = 'active'
      AND p.is_deleted = false
      -- what the school bought, still gated on the module in the code
      AND public.school_has_module(p.school_id, split_part(p_perm, '.', 1))
      -- RULE 2. And the switch for this verb on that page.
      AND CASE m.verb
            WHEN 'view'   THEN a.can_view
            WHEN 'edit'   THEN a.can_edit
            WHEN 'delete' THEN a.can_delete
          END
  );
$$;

-- The teacher-scoped rules are what the `.own` codes were for, and nothing
-- hands those out any more. Ten policies on four tables still carry an
-- `OR has_permission('x.read.own') AND id IN (my_students())` branch that can
-- now never be true.
--
-- They are REWRITTEN rather than dropped, and the helper functions are
-- dropped afterwards WITHOUT cascade. That order matters enormously: a
-- `DROP FUNCTION ... CASCADE` here takes the policies with it, and a table
-- with RLS on and no SELECT policy is a table nobody can read -- the
-- attendance register would have gone dark for the whole school, silently,
-- with the migration reporting success.
--
-- Each one keeps exactly the shape apply_tenant_rls would have written for
-- it, minus the dead branch.
DO $teacher$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT tablename, policyname
      FROM pg_policies
     WHERE schemaname = 'public'
       AND (coalesce(qual, '') LIKE '%.own%' OR coalesce(with_check, '') LIKE '%.own%')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
    RAISE NOTICE 'rewriting %.%', r.tablename, r.policyname;
  END LOOP;
END
$teacher$;

-- attendance -----------------------------------------------------------------
DO $$
BEGIN
  CREATE POLICY attendance_select ON public.attendance FOR SELECT TO authenticated
    USING (public.is_platform_admin()
           OR (school_id = public.current_school_id()
               AND public.has_permission('attendance.read')));
  CREATE POLICY attendance_insert ON public.attendance FOR INSERT TO authenticated
    WITH CHECK (school_id = public.current_school_id()
                AND public.has_permission('attendance.write'));
  CREATE POLICY attendance_update ON public.attendance FOR UPDATE TO authenticated
    USING (school_id = public.current_school_id()
           AND public.has_permission('attendance.write'))
    WITH CHECK (school_id = public.current_school_id()
                AND public.has_permission('attendance.write'));
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;

-- marks ----------------------------------------------------------------------
DO $$
BEGIN
  CREATE POLICY marks_select ON public.marks FOR SELECT TO authenticated
    USING (public.is_platform_admin()
           OR (school_id = public.current_school_id()
               AND public.has_permission('exams.read')));
  CREATE POLICY marks_insert ON public.marks FOR INSERT TO authenticated
    WITH CHECK (school_id = public.current_school_id()
                AND public.has_permission('exams.write'));
  CREATE POLICY marks_update ON public.marks FOR UPDATE TO authenticated
    USING (school_id = public.current_school_id()
           AND public.has_permission('exams.write'))
    WITH CHECK (school_id = public.current_school_id()
                AND public.has_permission('exams.write'));
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;

-- test_marks -----------------------------------------------------------------
DO $$
BEGIN
  CREATE POLICY test_marks_select ON public.test_marks FOR SELECT TO authenticated
    USING (public.is_platform_admin()
           OR (school_id = public.current_school_id()
               AND public.has_permission('tests.read')));
  CREATE POLICY test_marks_insert ON public.test_marks FOR INSERT TO authenticated
    WITH CHECK (school_id = public.current_school_id()
                AND public.has_permission('tests.write'));
  CREATE POLICY test_marks_update ON public.test_marks FOR UPDATE TO authenticated
    USING (school_id = public.current_school_id()
           AND public.has_permission('tests.write'))
    WITH CHECK (school_id = public.current_school_id()
                AND public.has_permission('tests.write'));
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;

-- students -------------------------------------------------------------------
DO $$
BEGIN
  CREATE POLICY students_select ON public.students FOR SELECT TO authenticated
    USING (public.is_platform_admin()
           OR (school_id = public.current_school_id()
               AND public.has_permission('students.read')));
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;

-- Now that nothing references them. No CASCADE on purpose: if something
-- still depends on one of these, this should fail loudly rather than quietly
-- dropping whatever it was.
DROP FUNCTION IF EXISTS public.my_sections();
DROP FUNCTION IF EXISTS public.my_subjects();
DROP FUNCTION IF EXISTS public.my_taught_sections();
DROP FUNCTION IF EXISTS public.my_students();
DROP FUNCTION IF EXISTS public.my_student_subjects();

-- The tables this file just rewrote policies on MUST still be readable. A
-- table with RLS on and no SELECT policy is a table nobody can read, and the
-- way that is discovered is somebody opening an empty register months later.
--
-- Scoped to the four tables above, deliberately. An unrelated table in that
-- state is worth knowing about but is not this migration's business, and
-- failing the whole access system over it would be its own kind of damage.
DO $guard$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['attendance', 'marks', 'test_marks', 'students']
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_class c
       WHERE c.oid = ('public.' || v_table)::regclass
         AND c.relrowsecurity
         AND NOT EXISTS (
           SELECT 1 FROM pg_policy p
            WHERE p.polrelid = c.oid AND p.polcmd IN ('r', '*')
         )
    ) THEN
      RAISE EXCEPTION
        'public.% has row level security on and no SELECT policy -- the rewrite above missed it, and nobody could read the table',
        v_table;
    END IF;
  END LOOP;

  -- Everything else in that state: said out loud, not acted on.
  FOR v_table IN
    SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind = 'r'
       AND c.relrowsecurity
       AND NOT EXISTS (
         SELECT 1 FROM pg_policy p
          WHERE p.polrelid = c.oid AND p.polcmd IN ('r', '*')
       )
  LOOP
    RAISE WARNING
      'public.% has row level security on and no policies at all, so nobody can read it. Not caused by this file, but worth fixing.',
      v_table;
  END LOOP;
END
$guard$;


-- ----------------------------------------------------------------------------
-- 4b. Point the DELETE policies at the delete switch
-- ----------------------------------------------------------------------------
-- apply_tenant_rls() wrote INSERT, UPDATE and DELETE policies that all ask
-- for `<module>.write`. That is why "may edit, may not delete" could not be
-- said before. This repoints the DELETE one at `<module>.delete`.
--
-- Only policies whose body is EXACTLY the shape apply_tenant_rls produces are
-- touched; anything hand-written is left alone.
DO $$
DECLARE
  r      record;
  v_code text;
BEGIN
  FOR r IN
    SELECT pol.polname, cls.relname, pg_get_expr(pol.polqual, pol.polrelid) AS qual
      FROM pg_policy pol
      JOIN pg_class cls ON cls.oid = pol.polrelid
      JOIN pg_namespace ns ON ns.oid = cls.relnamespace
     WHERE ns.nspname = 'public'
       AND pol.polcmd = 'd'
       AND pol.polname = cls.relname || '_delete'
  LOOP
    -- `public.` is optional because whether pg_get_expr() prints the schema
    -- depends on the search_path this file happens to run with.
    IF r.qual ~ '^\(\(school_id = (public\.)?current_school_id\(\)\) AND (public\.)?has_permission\(''[a-z_]+\.write''::text\)\)$' THEN
      v_code := substring(r.qual from 'has_permission\(''([a-z_]+)\.write''') || '.delete';

      EXECUTE format('DROP POLICY %I ON public.%I', r.polname, r.relname);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated
           USING (school_id = public.current_school_id() AND public.has_permission(%L))',
        r.polname, r.relname, v_code);

      RAISE NOTICE 'delete policy on % now asks for %', r.relname, v_code;
    END IF;
  END LOOP;
END
$$;


-- ----------------------------------------------------------------------------
-- 5. Everything on, for one person
-- ----------------------------------------------------------------------------
-- The administrator's list. Used by the button on the user screen, and by the
-- bootstrap below.
CREATE OR REPLACE FUNCTION public.grant_full_access(p_profile uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, auth
AS $fn$
DECLARE
  v_school uuid;
BEGIN
  SELECT school_id INTO v_school FROM public.profiles WHERE id = p_profile;
  IF v_school IS NULL THEN
    RAISE EXCEPTION 'that user is not attached to a school';
  END IF;

  IF NOT (public.is_platform_admin()
          OR (v_school = public.current_school_id() AND public.has_permission('users.write'))) THEN
    RAISE EXCEPTION 'not allowed to manage users for this school'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO public.user_page_access
    (school_id, profile_id, page, section, can_view, can_edit, can_delete)
  SELECT v_school, p_profile, pc.page, pc.section, true, pc.has_edit, pc.has_delete
    FROM public.page_catalog pc
  ON CONFLICT (school_id, profile_id, page) DO UPDATE
    SET can_view = true, can_edit = EXCLUDED.can_edit, can_delete = EXCLUDED.can_delete,
        updated_at = now();

  INSERT INTO public.user_module_access (school_id, profile_id, module, enabled)
  SELECT DISTINCT v_school, p_profile, pc.module, true
    FROM public.page_catalog pc
  ON CONFLICT (school_id, profile_id, module) DO UPDATE
    SET enabled = true, updated_at = now();
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.grant_full_access(uuid) TO authenticated;

-- The SQL-editor version: no guard, because sitting at the SQL editor is the
-- guard. auth.uid() is NULL here, so the check above could never pass.
--
--     SELECT public.seed_full_access('admin@demo.test');
CREATE OR REPLACE FUNCTION public.seed_full_access(p_email text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_id     uuid;
  v_school uuid;
  v_count  integer;
BEGIN
  SELECT p.id, p.school_id INTO v_id, v_school
    FROM public.profiles p
   WHERE lower(p.email) = lower(trim(p_email));

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'no account for %', p_email;
  END IF;
  IF v_school IS NULL THEN
    RAISE EXCEPTION '% is not attached to a school', p_email;
  END IF;

  INSERT INTO public.user_page_access
    (school_id, profile_id, page, section, can_view, can_edit, can_delete)
  SELECT v_school, v_id, pc.page, pc.section, true, pc.has_edit, pc.has_delete
    FROM public.page_catalog pc
  ON CONFLICT (school_id, profile_id, page) DO UPDATE
    SET can_view = true, can_edit = EXCLUDED.can_edit, can_delete = EXCLUDED.can_delete,
        updated_at = now();

  INSERT INTO public.user_module_access (school_id, profile_id, module, enabled)
  SELECT DISTINCT v_school, v_id, pc.module, true
    FROM public.page_catalog pc
  ON CONFLICT (school_id, profile_id, module) DO UPDATE
    SET enabled = true, updated_at = now();

  UPDATE public.profiles
     SET status = 'active', is_deleted = false, updated_at = now()
   WHERE id = v_id;

  SELECT count(*) INTO v_count FROM public.user_page_access WHERE profile_id = v_id;
  RETURN format('%s now has all %s pages', p_email, v_count);
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.seed_full_access(text) FROM PUBLIC, anon, authenticated;

-- Every school keeps an administrator. Section 0 marked the oldest account
-- of each school; this is the safety net for a school that somehow ended up
-- with none -- and it MARKS rather than grants, because an administrator
-- holds no access rows at all.
DO $bootstrap$
DECLARE
  r       record;
  v_email text;
  v_fixed integer := 0;
BEGIN
  FOR r IN
    SELECT s.id, s.school_name
      FROM public.schools s
     WHERE NOT EXISTS (
       SELECT 1 FROM public.profiles p
        WHERE p.school_id = s.id
          AND p.is_school_admin
          AND p.status = 'active'
          AND p.is_deleted = false
     )
  LOOP
    SELECT p.email INTO v_email
      FROM public.profiles p
     WHERE p.school_id = r.id AND p.is_deleted = false
     ORDER BY p.created_at
     LIMIT 1;

    IF v_email IS NULL THEN
      RAISE NOTICE '% has no accounts at all', r.school_name;
      CONTINUE;
    END IF;

    PERFORM public.make_school_admin(v_email);
    v_fixed := v_fixed + 1;
    RAISE NOTICE '% -> administrator of %', v_email, r.school_name;
  END LOOP;

  IF v_fixed = 0 THEN
    RAISE NOTICE 'every school already had an administrator';
  END IF;
END
$bootstrap$;


-- ----------------------------------------------------------------------------
-- 6. Creating a login, and setting a password
-- ----------------------------------------------------------------------------
-- The Add User button and the password form call these.
DROP FUNCTION IF EXISTS public.create_school_user(text, text, text, text, text);
CREATE OR REPLACE FUNCTION public.create_school_user(
  p_email     text,
  p_password  text,
  p_full_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, auth, extensions
AS $fn$
DECLARE
  v_school uuid := public.current_school_id();
  v_email  text := lower(trim(p_email));
  v_id     uuid;
  v_has_provider_id boolean;
BEGIN
  IF v_school IS NULL THEN
    RAISE EXCEPTION 'No active school.';
  END IF;

  IF NOT public.has_permission('users.write') THEN
    RAISE EXCEPTION 'You do not have permission to add users.';
  END IF;

  IF v_email IS NULL OR v_email = '' OR v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RAISE EXCEPTION 'Enter a valid email address.';
  END IF;

  IF p_password IS NULL OR length(p_password) < 8 THEN
    RAISE EXCEPTION 'Password must be at least 8 characters.';
  END IF;

  SELECT id INTO v_id FROM auth.users WHERE lower(email) = v_email;

  IF v_id IS NOT NULL THEN
    -- The account exists -- on another school, or left over from before.
    -- Adopt it rather than failing, but never steal one that is in use.
    IF EXISTS (SELECT 1 FROM public.profiles p
                WHERE p.id = v_id AND p.school_id IS NOT NULL AND p.school_id <> v_school) THEN
      RAISE EXCEPTION 'That email already belongs to another school.';
    END IF;
  ELSE
    v_id := gen_random_uuid();

    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_id, 'authenticated', 'authenticated', v_email,
      crypt(p_password, gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', p_full_name),
      now(), now(), '', '', '', ''
    );

    -- Without a matching identity row GoTrue rejects the password login even
    -- though the user exists. Column layout differs between versions.
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'auth' AND table_name = 'identities'
         AND column_name = 'provider_id'
    ) INTO v_has_provider_id;

    IF v_has_provider_id THEN
      INSERT INTO auth.identities (user_id, provider_id, identity_data, provider,
                                   last_sign_in_at, created_at, updated_at)
      VALUES (v_id, v_id::text,
              jsonb_build_object('sub', v_id::text, 'email', v_email,
                                 'email_verified', true, 'phone_verified', false),
              'email', now(), now(), now());
    ELSE
      INSERT INTO auth.identities (id, user_id, identity_data, provider,
                                   last_sign_in_at, created_at, updated_at)
      VALUES (v_id::text, v_id,
              jsonb_build_object('sub', v_id::text, 'email', v_email,
                                 'email_verified', true, 'phone_verified', false),
              'email', now(), now(), now());
    END IF;
  END IF;

  -- The profile row is created by a trigger on auth.users; this fills in what
  -- the trigger cannot know.
  UPDATE public.profiles
     SET school_id  = v_school,
         full_name  = COALESCE(NULLIF(trim(p_full_name), ''), full_name),
         email      = v_email,
         status     = 'active',
         is_deleted = false,
         updated_at = now()
   WHERE id = v_id;

  IF NOT FOUND THEN
    INSERT INTO public.profiles (id, school_id, full_name, email, status, is_school_admin)
    VALUES (v_id, v_school, NULLIF(trim(p_full_name), ''), v_email, 'active', false);
  END IF;

  RETURN v_id;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.create_school_user(text, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.create_school_user(text, text, text) TO authenticated;


CREATE OR REPLACE FUNCTION public.admin_set_password(p_profile uuid, p_password text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, auth, extensions
AS $fn$
DECLARE
  v_school uuid := public.current_school_id();
BEGIN
  IF v_school IS NULL THEN
    RAISE EXCEPTION 'No active school.';
  END IF;

  IF NOT public.has_permission('users.write') THEN
    RAISE EXCEPTION 'You do not have permission to change passwords.';
  END IF;

  IF p_password IS NULL OR length(p_password) < 8 THEN
    RAISE EXCEPTION 'Password must be at least 8 characters.';
  END IF;

  -- Somebody in MY school only. Without this the parameter is a way to set
  -- any password on the platform.
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.id = p_profile AND p.school_id = v_school AND p.is_deleted = false
  ) THEN
    RAISE EXCEPTION 'That user is not in this school.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = p_profile) THEN
    RAISE EXCEPTION 'That account belongs to a platform administrator.';
  END IF;

  UPDATE auth.users
     SET encrypted_password = crypt(p_password, gen_salt('bf')),
         email_confirmed_at = COALESCE(email_confirmed_at, now()),
         updated_at         = now()
   WHERE id = p_profile;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No sign-in account exists for that user.';
  END IF;

  -- The trail would otherwise be silent about the most sensitive thing on the
  -- screen. The password itself is not recorded, obviously.
  INSERT INTO public.audit_logs
    (school_id, actor_profile_id, action, target_table, target_id, after)
  VALUES
    (v_school, auth.uid(), 'update', 'profiles', p_profile::text,
     jsonb_build_object('password_set_by_admin', true));
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.admin_set_password(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_set_password(uuid, text) TO authenticated;


-- ----------------------------------------------------------------------------
-- 7. What the older systems left behind
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS public.user_access CASCADE;
DROP TABLE IF EXISTS public.profile_permissions CASCADE;
DROP TABLE IF EXISTS public.profile_roles CASCADE;
DROP TABLE IF EXISTS public.roles CASCADE;
DROP FUNCTION IF EXISTS public.seed_school_user(text, text, text, text, text);


-- ============================================================================
-- 8. RESULT -- who can open what
-- ============================================================================
SELECT p.email,
       CASE WHEN p.is_school_admin THEN 'ADMINISTRATOR' ELSE '' END AS admin,
       (SELECT count(*) FROM public.user_module_access m
         WHERE m.profile_id = p.id AND m.enabled)   AS modules_on,
       count(*) FILTER (WHERE a.can_view)   AS can_view,
       count(*) FILTER (WHERE a.can_edit)   AS can_edit,
       count(*) FILTER (WHERE a.can_delete) AS can_delete,
       CASE
         WHEN p.is_school_admin THEN 'everything, always'
         WHEN count(*) FILTER (WHERE a.can_view) = 0 THEN 'no access yet'
         ELSE 'staff'
       END AS kind
  FROM public.profiles p
  LEFT JOIN public.user_page_access a ON a.profile_id = p.id
 WHERE p.school_id IS NOT NULL AND p.is_deleted = false
 -- Grouped by the PRIMARY KEY, not by the columns being shown. Postgres
 -- then knows every other p.* column is functionally dependent on it, which
 -- is what lets the correlated subquery above reference p.id at all --
 -- grouping by p.email instead leaves p.id ungrouped and the whole query is
 -- rejected.
 GROUP BY p.id
 ORDER BY p.is_school_admin DESC, p.created_at;
