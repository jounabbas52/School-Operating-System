-- ============================================================================
-- 026_SIMPLE_ACCESS.sql -- the access system, and the only one
-- ============================================================================
-- Paste the whole file into the SQL editor and Run. Idempotent, and it stands
-- on its own: whatever did or did not finish before it, this leaves a working
-- system behind.
--
-- ONE RULE
--
--     a person is given a list of PAGES, and on each page
--     they may VIEW, EDIT, DELETE -- any, all or none of the three
--
--     page                       view   edit   delete
--     Attendance > Students       [x]    [x]    [ ]
--     Attendance > Staff          [ ]    [ ]    [ ]   <- does not exist for them
--     Students > Active           [x]    [ ]    [ ]   <- can look, cannot touch
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
-- Section 5 gives any school with no administrator back to its oldest
-- account -- the one it was set up with -- with every page switched on.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Every page the app has
-- ----------------------------------------------------------------------------
-- Generated from NAV in app/school/nav-items.js, so a page cannot exist in
-- the menu and not here. `page` is the route, the only name a page reliably
-- has. has_crud is false for the two screens that are not CRUD at all: the
-- dashboard and the audit trail, which can only be looked at, and settings,
-- which is its own editor and has nothing to delete.
CREATE TABLE IF NOT EXISTS public.page_catalog (
  page        text PRIMARY KEY,
  section     text NOT NULL,
  label       text NOT NULL,
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
ALTER TABLE public.page_catalog ADD COLUMN IF NOT EXISTS has_edit   boolean NOT NULL DEFAULT true;
ALTER TABLE public.page_catalog ADD COLUMN IF NOT EXISTS has_delete boolean NOT NULL DEFAULT true;
ALTER TABLE public.page_catalog DROP COLUMN IF EXISTS has_crud;

INSERT INTO public.page_catalog (page, section, label, group_label, sort_order, has_edit, has_delete) VALUES
  ('/school', 'dashboard', 'Dashboard', 'Dashboard', 10, false, false),
  ('/school/academics/sessions', 'academics', 'Sessions', 'System Setup', 30, true, true),
  ('/school/academics/classes', 'academics', 'Classes', 'System Setup', 40, true, true),
  ('/school/academics/sections', 'academics', 'Sections', 'System Setup', 50, true, true),
  ('/school/academics/grade-levels', 'academics', 'Grade Levels', 'System Setup', 60, true, true),
  ('/school/academics/subjects', 'academics', 'Subjects', 'System Setup', 70, true, true),
  ('/school/students', 'students', 'Active Students', 'Students', 80, true, true),
  ('/school/students/register', 'students', 'Admission Register', 'Students', 90, true, true),
  ('/school/students/promotion', 'students', 'Promotion', 'Students', 100, true, true),
  ('/school/students/old', 'students', 'Old Students', 'Students', 110, true, true),
  ('/school/students/reports', 'students', 'Student Reports', 'Students', 120, true, true),
  ('/school/students/certificates', 'students', 'Certificates', 'Students', 130, true, true),
  ('/school/students/id-cards', 'students', 'ID Cards', 'Students', 140, true, true),
  ('/school/teachers', 'staff', 'Teachers', 'Teachers', 150, true, true),
  ('/school/hr', 'staff', 'All Staff', 'HR / Staff', 160, true, true),
  ('/school/hr/leave', 'hr', 'Leave Management', 'HR / Staff', 170, true, true),
  ('/school/hr/documents', 'staff', 'Staff Documents', 'HR / Staff', 180, true, true),
  ('/school/attendance', 'attendance', 'Student Attendance', 'Attendance', 190, true, true),
  ('/school/attendance/staff', 'attendance', 'Staff Attendance', 'Attendance', 200, true, true),
  ('/school/attendance/biometric', 'attendance', 'Thumb Attendance', 'Attendance', 210, true, true),
  ('/school/attendance/reports', 'attendance', 'Reports', 'Attendance', 220, true, true),
  ('/school/timetable', 'academics', 'Timetable', 'Timetable', 230, true, true),
  ('/school/datesheet', 'exams', 'Date Sheet', 'Date Sheet', 240, true, true),
  ('/school/exams', 'exams', 'All Exams', 'Examination', 250, true, true),
  ('/school/exams/results', 'exams', 'Exam Results', 'Examination', 260, true, true),
  ('/school/exams/tests', 'tests', 'Tests', 'Examination', 270, true, true),
  ('/school/exams/tests/results', 'tests', 'Test Results', 'Examination', 280, true, true),
  ('/school/fees', 'fees', 'Fee Overview', 'Fee', 290, true, true),
  ('/school/fees/student', 'fees', 'Student Fee Search', 'Fee', 300, true, true),
  ('/school/fees/collect', 'fees', 'Collect Fee', 'Fee', 310, true, true),
  ('/school/fees/challans', 'fees', 'View Challans', 'Fee', 320, true, true),
  ('/school/fees/challans/create', 'fees', 'Create Challan', 'Fee', 330, true, true),
  ('/school/fees/policy', 'fees', 'Fee Policy', 'Fee', 340, true, true),
  ('/school/fees/reports', 'fees', 'Reports', 'Fee', 350, true, true),
  ('/school/payroll', 'payroll', 'Salary Structures', 'Payroll', 360, true, true),
  ('/school/payroll/salaries', 'payroll', 'Staff Salaries', 'Payroll', 370, true, true),
  ('/school/payroll/run', 'payroll', 'Payroll Run', 'Payroll', 380, true, true),
  ('/school/payroll/slips', 'payroll', 'Salary Slips', 'Payroll', 390, true, true),
  ('/school/payroll/reports', 'payroll', 'Reports', 'Payroll', 400, true, true),
  ('/school/payroll/expenses', 'accounts', 'Other Expenses', 'Payroll', 410, true, true),
  ('/school/payroll/settings', 'payroll', 'Payroll Settings', 'Payroll', 420, true, true),
  ('/school/transport', 'transport', 'Overview', 'Transport', 430, true, true),
  ('/school/transport/routes', 'transport', 'Routes', 'Transport', 440, true, true),
  ('/school/transport/vehicles', 'transport', 'Vehicles', 'Transport', 450, true, true),
  ('/school/transport/students', 'transport', 'Students', 'Transport', 460, true, true),
  ('/school/library', 'library', 'Books', 'Library', 470, true, true),
  ('/school/library/issue-return', 'library', 'Issue / Return', 'Library', 480, true, true),
  ('/school/frontdesk', 'frontdesk', 'Inquiries', 'Front Desk', 490, true, true),
  ('/school/frontdesk/visitors', 'frontdesk', 'Visitors', 'Front Desk', 500, true, true),
  ('/school/frontdesk/complaints', 'frontdesk', 'Complaints', 'Front Desk', 510, true, true),
  ('/school/frontdesk/phonebook', 'frontdesk', 'Phone Book', 'Front Desk', 520, true, true),
  ('/school/admissions', 'admissions', 'Admissions', 'Admissions', 530, true, true),
  ('/school/reports', 'reports', 'Reports', 'Reports', 540, true, true),
  ('/school/settings', 'settings', 'Settings', 'Settings', 550, true, false),
  ('/school/users', 'users', 'Users & Access', 'Users & Access', 560, true, true),
  ('/school/audit', 'audit', 'Audit Logs', 'Audit Logs', 570, false, false)
ON CONFLICT (page) DO UPDATE
  SET section = EXCLUDED.section, label = EXCLUDED.label,
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
ALTER TABLE public.permission_map DROP CONSTRAINT IF EXISTS permission_map_verb_check;
ALTER TABLE public.permission_map ADD CONSTRAINT permission_map_verb_check
  CHECK (verb IN ('view', 'edit', 'delete'));

DO $$
BEGIN
  -- Readable by anybody signed in: it is a catalogue, not data.
  CREATE POLICY permission_map_select ON public.permission_map
    FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;

-- An older shape stored 'write' and a scope. Both go.
DELETE FROM public.permission_map WHERE code LIKE '%.own';
UPDATE public.permission_map SET verb = 'edit' WHERE verb = 'write';
ALTER TABLE public.permission_map DROP COLUMN IF EXISTS scope;

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
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.permission_map m ON m.code = p_perm
    JOIN public.user_page_access a
      ON a.profile_id = p.id
     AND a.school_id  = p.school_id
     AND a.section    = m.section
    WHERE p.id = auth.uid()
      AND p.status = 'active'
      AND p.is_deleted = false
      -- what the school bought, still gated on the module in the code
      AND public.school_has_module(p.school_id, split_part(p_perm, '.', 1))
      AND CASE m.verb
            WHEN 'view'   THEN a.can_view
            WHEN 'edit'   THEN a.can_edit
            WHEN 'delete' THEN a.can_delete
          END
  );
$$;

-- The teacher-scoped rules are what the `.own` codes were for. Nothing hands
-- those out now, so the policies would never grant anything -- but a policy
-- that can never be true is a trap for the next reader, so they go.
DROP FUNCTION IF EXISTS public.my_sections() CASCADE;
DROP FUNCTION IF EXISTS public.my_subjects() CASCADE;
DROP FUNCTION IF EXISTS public.my_taught_sections() CASCADE;


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

  UPDATE public.profiles
     SET status = 'active', is_deleted = false, updated_at = now()
   WHERE id = v_id;

  SELECT count(*) INTO v_count FROM public.user_page_access WHERE profile_id = v_id;
  RETURN format('%s now has all %s pages', p_email, v_count);
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.seed_full_access(text) FROM PUBLIC, anon, authenticated;

-- Every school keeps an administrator. Only schools where nobody can manage
-- users: one that already has a working administrator is left alone.
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
       SELECT 1
         FROM public.user_page_access a
         JOIN public.profiles p ON p.id = a.profile_id
        WHERE a.school_id = s.id
          AND a.section   = 'users'
          AND a.can_edit
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

    PERFORM public.seed_full_access(v_email);
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
    INSERT INTO public.profiles (id, school_id, full_name, email, status)
    VALUES (v_id, v_school, NULLIF(trim(p_full_name), ''), v_email, 'active');
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
       count(*) FILTER (WHERE a.can_view)   AS can_view,
       count(*) FILTER (WHERE a.can_edit)   AS can_edit,
       count(*) FILTER (WHERE a.can_delete) AS can_delete,
       CASE
         WHEN count(*) FILTER (WHERE a.section = 'users' AND a.can_edit) > 0
           THEN 'administrator'
         WHEN count(*) FILTER (WHERE a.can_view) = 0 THEN 'no access yet'
         ELSE 'staff'
       END AS kind
  FROM public.profiles p
  LEFT JOIN public.user_page_access a ON a.profile_id = p.id
 WHERE p.school_id IS NOT NULL AND p.is_deleted = false
 GROUP BY p.email, p.created_at
 ORDER BY p.created_at;
