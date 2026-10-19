-- ============================================================================
-- 025_PAGE_ACCESS.sql -- the access system, start to finish
-- ============================================================================
-- Paste the whole file into the SQL editor and Run. Idempotent, and it stands
-- on its own: if 022, 023 or 024 never finished -- the SQL editor runs a file
-- in one transaction, so one error anywhere rolls the whole thing back -- this
-- builds everything it needs and leaves a working system behind either way.
--
-- WHAT THIS DOES
--
-- Access is now page by page, not section by section. Every person has a
-- sheet that looks like the sidebar, one line per screen:
--
--     page                      view   create   edit   delete
--     Students > Active          [x]     [ ]     [ ]     [ ]
--     Students > Old Students    [x]     [ ]     [ ]     [ ]
--     Fees > Collect Fee         [ ]     [ ]     [ ]     [ ]
--
-- A page without `view` never appears in their menu. A page WITH view and
-- nothing else opens exactly as it does for the administrator -- same list,
-- same records -- with no Add, no Edit and no Delete, and the database
-- refusing those writes underneath.
--
-- WHAT IS PER PAGE AND WHAT IS SHARED
--
-- view is per page. create / edit / delete roll up to the SECTION, because
-- that is the unit every RLS policy in this schema speaks in: the policy on
-- `students` asks "may this person write students", not "may they write on
-- the Old Students screen". The editor shows them on each page and marks them
-- shared, rather than pretending to a precision the database cannot keep.
--
-- So has_permission() answers from the rollup:
--
--     students.read    any page in the students section with view
--     students.write   any page in the students section with create or edit
--     students.delete  any page in the students section with delete
--
-- NOBODY IS LOCKED OUT
--
-- Section 3 expands whatever people already had into page rows, and section 6
-- gives any school left without an administrator back to its oldest account --
-- the one it was set up with. Only then does section 7 drop what is finished
-- with.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Every page the app has
-- ----------------------------------------------------------------------------
-- Generated from NAV in app/school/nav-items.js -- the same list the sidebar
-- is drawn from, so a page cannot exist in one and not the other. `page` is
-- the route, which is the only name a page reliably has.
CREATE TABLE IF NOT EXISTS public.page_catalog (
  page        text PRIMARY KEY,
  section     text NOT NULL,
  label       text NOT NULL,
  group_label text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  -- false for screens that are their own editor (Settings) or read-only by
  -- nature (the audit trail): they offer view, and at most edit.
  has_crud    boolean NOT NULL DEFAULT true
);

ALTER TABLE public.page_catalog ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE POLICY page_catalog_select ON public.page_catalog
    FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;

INSERT INTO public.page_catalog (page, section, label, group_label, sort_order, has_crud) VALUES
  ('/school', 'dashboard', 'Dashboard', 'Dashboard', 10, false),
  ('/teacher', 'attendance', 'Teacher Panel', 'Teacher Panel', 20, true),
  ('/school/academics/sessions', 'academics', 'Sessions', 'System Setup', 30, true),
  ('/school/academics/classes', 'academics', 'Classes', 'System Setup', 40, true),
  ('/school/academics/sections', 'academics', 'Sections', 'System Setup', 50, true),
  ('/school/academics/grade-levels', 'academics', 'Grade Levels', 'System Setup', 60, true),
  ('/school/academics/subjects', 'academics', 'Subjects', 'System Setup', 70, true),
  ('/school/students', 'students', 'Active Students', 'Students', 80, true),
  ('/school/students/register', 'students', 'Admission Register', 'Students', 90, true),
  ('/school/students/promotion', 'students', 'Promotion', 'Students', 100, true),
  ('/school/students/old', 'students', 'Old Students', 'Students', 110, true),
  ('/school/students/reports', 'students', 'Student Reports', 'Students', 120, true),
  ('/school/students/certificates', 'students', 'Certificates', 'Students', 130, true),
  ('/school/students/id-cards', 'students', 'ID Cards', 'Students', 140, true),
  ('/school/teachers', 'staff', 'Teachers', 'Teachers', 150, true),
  ('/school/hr', 'staff', 'All Staff', 'HR / Staff', 160, true),
  ('/school/hr/leave', 'hr', 'Leave Management', 'HR / Staff', 170, true),
  ('/school/hr/documents', 'staff', 'Staff Documents', 'HR / Staff', 180, true),
  ('/school/attendance', 'attendance', 'Student Attendance', 'Attendance', 190, true),
  ('/school/attendance/staff', 'attendance', 'Staff Attendance', 'Attendance', 200, true),
  ('/school/attendance/biometric', 'attendance', 'Thumb Attendance', 'Attendance', 210, true),
  ('/school/attendance/reports', 'attendance', 'Reports', 'Attendance', 220, true),
  ('/school/timetable', 'academics', 'Timetable', 'Timetable', 230, true),
  ('/school/datesheet', 'exams', 'Date Sheet', 'Date Sheet', 240, true),
  ('/school/exams', 'exams', 'All Exams', 'Examination', 250, true),
  ('/school/exams/results', 'exams', 'Exam Results', 'Examination', 260, true),
  ('/school/exams/tests', 'tests', 'Tests', 'Examination', 270, true),
  ('/school/exams/tests/results', 'tests', 'Test Results', 'Examination', 280, true),
  ('/school/fees', 'fees', 'Fee Overview', 'Fee', 290, true),
  ('/school/fees/student', 'fees', 'Student Fee Search', 'Fee', 300, true),
  ('/school/fees/collect', 'fees', 'Collect Fee', 'Fee', 310, true),
  ('/school/fees/challans', 'fees', 'View Challans', 'Fee', 320, true),
  ('/school/fees/challans/create', 'fees', 'Create Challan', 'Fee', 330, true),
  ('/school/fees/policy', 'fees', 'Fee Policy', 'Fee', 340, true),
  ('/school/fees/reports', 'fees', 'Reports', 'Fee', 350, true),
  ('/school/payroll', 'payroll', 'Salary Structures', 'Payroll', 360, true),
  ('/school/payroll/salaries', 'payroll', 'Staff Salaries', 'Payroll', 370, true),
  ('/school/payroll/run', 'payroll', 'Payroll Run', 'Payroll', 380, true),
  ('/school/payroll/slips', 'payroll', 'Salary Slips', 'Payroll', 390, true),
  ('/school/payroll/reports', 'payroll', 'Reports', 'Payroll', 400, true),
  ('/school/payroll/expenses', 'accounts', 'Other Expenses', 'Payroll', 410, true),
  ('/school/payroll/settings', 'payroll', 'Payroll Settings', 'Payroll', 420, true),
  ('/school/transport', 'transport', 'Overview', 'Transport', 430, true),
  ('/school/transport/routes', 'transport', 'Routes', 'Transport', 440, true),
  ('/school/transport/vehicles', 'transport', 'Vehicles', 'Transport', 450, true),
  ('/school/transport/students', 'transport', 'Students', 'Transport', 460, true),
  ('/school/library', 'library', 'Books', 'Library', 470, true),
  ('/school/library/issue-return', 'library', 'Issue / Return', 'Library', 480, true),
  ('/school/frontdesk', 'frontdesk', 'Inquiries', 'Front Desk', 490, true),
  ('/school/frontdesk/visitors', 'frontdesk', 'Visitors', 'Front Desk', 500, true),
  ('/school/frontdesk/complaints', 'frontdesk', 'Complaints', 'Front Desk', 510, true),
  ('/school/frontdesk/phonebook', 'frontdesk', 'Phone Book', 'Front Desk', 520, true),
  ('/school/admissions', 'admissions', 'Admissions', 'Admissions', 530, true),
  ('/school/reports', 'reports', 'Reports', 'Reports', 540, true),
  ('/school/settings', 'settings', 'Settings', 'Settings', 550, false),
  ('/school/users', 'users', 'Users & Access', 'Users & Access', 560, true),
  ('/school/audit', 'audit', 'Audit Logs', 'Audit Logs', 570, false)
ON CONFLICT (page) DO UPDATE
  SET section = EXCLUDED.section, label = EXCLUDED.label,
      group_label = EXCLUDED.group_label, sort_order = EXCLUDED.sort_order,
      has_crud = EXCLUDED.has_crud;


-- ----------------------------------------------------------------------------
-- 1b. The code -> (section, verb) map
-- ----------------------------------------------------------------------------
-- Repeated from 023 so this file stands on its own: if 023 never finished --
-- the SQL editor runs a file in one transaction, so one error rolls the whole
-- thing back -- nothing below would have anything to join against.
--
-- It is the translation layer that lets a hundred existing RLS policies keep
-- their wording: they ask has_permission('students.write'), and this says
-- which section and which verb that means.
CREATE TABLE IF NOT EXISTS public.permission_map (
  code    text PRIMARY KEY,
  section text NOT NULL,
  verb    text NOT NULL CHECK (verb IN ('view', 'write', 'delete')),
  scope   text NOT NULL DEFAULT 'all' CHECK (scope IN ('all', 'own'))
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

INSERT INTO public.permission_map (code, section, verb, scope) VALUES
  ('students.read', 'students', 'view', 'all'),
  ('students.read.own', 'students', 'view', 'own'),
  ('students.write', 'students', 'write', 'all'),
  ('students.delete', 'students', 'delete', 'all'),
  ('admissions.read', 'admissions', 'view', 'all'),
  ('admissions.write', 'admissions', 'write', 'all'),
  ('admissions.delete', 'admissions', 'delete', 'all'),
  ('academics.read', 'academics', 'view', 'all'),
  ('academics.write', 'academics', 'write', 'all'),
  ('academics.delete', 'academics', 'delete', 'all'),
  ('attendance.read', 'attendance', 'view', 'all'),
  ('attendance.read.own', 'attendance', 'view', 'own'),
  ('attendance.write', 'attendance', 'write', 'all'),
  ('attendance.write.own', 'attendance', 'write', 'own'),
  ('attendance.delete', 'attendance', 'delete', 'all'),
  ('tests.read', 'tests', 'view', 'all'),
  ('tests.read.own', 'tests', 'view', 'own'),
  ('tests.write', 'tests', 'write', 'all'),
  ('tests.write.own', 'tests', 'write', 'own'),
  ('tests.delete', 'tests', 'delete', 'all'),
  ('exams.read', 'exams', 'view', 'all'),
  ('exams.read.own', 'exams', 'view', 'own'),
  ('exams.write', 'exams', 'write', 'all'),
  ('exams.publish', 'exams', 'write', 'all'),
  ('exams.write.own', 'exams', 'write', 'own'),
  ('exams.delete', 'exams', 'delete', 'all'),
  ('fees.read', 'fees', 'view', 'all'),
  ('fees.write', 'fees', 'write', 'all'),
  ('fees.delete', 'fees', 'delete', 'all'),
  ('accounts.read', 'accounts', 'view', 'all'),
  ('accounts.write', 'accounts', 'write', 'all'),
  ('accounts.delete', 'accounts', 'delete', 'all'),
  ('payroll.read', 'payroll', 'view', 'all'),
  ('payroll.write', 'payroll', 'write', 'all'),
  ('payroll.delete', 'payroll', 'delete', 'all'),
  ('staff.read', 'staff', 'view', 'all'),
  ('staff.write', 'staff', 'write', 'all'),
  ('staff.delete', 'staff', 'delete', 'all'),
  ('hr.read', 'hr', 'view', 'all'),
  ('hr.write', 'hr', 'write', 'all'),
  ('hr.delete', 'hr', 'delete', 'all'),
  ('library.read', 'library', 'view', 'all'),
  ('library.write', 'library', 'write', 'all'),
  ('library.delete', 'library', 'delete', 'all'),
  ('transport.read', 'transport', 'view', 'all'),
  ('transport.write', 'transport', 'write', 'all'),
  ('transport.delete', 'transport', 'delete', 'all'),
  ('frontdesk.read', 'frontdesk', 'view', 'all'),
  ('frontdesk.write', 'frontdesk', 'write', 'all'),
  ('frontdesk.delete', 'frontdesk', 'delete', 'all'),
  ('notifications.read', 'notifications', 'view', 'all'),
  ('notifications.write', 'notifications', 'write', 'all'),
  ('notifications.delete', 'notifications', 'delete', 'all'),
  ('reports.read', 'reports', 'view', 'all'),
  ('reports.write', 'reports', 'write', 'all'),
  ('reports.delete', 'reports', 'delete', 'all'),
  ('users.read', 'users', 'view', 'all'),
  ('users.write', 'users', 'write', 'all'),
  ('users.delete', 'users', 'delete', 'all'),
  ('core.settings.write', 'settings', 'write', 'all'),
  ('core.audit.read', 'audit', 'view', 'all')
ON CONFLICT (code) DO UPDATE
  SET section = EXCLUDED.section, verb = EXCLUDED.verb, scope = EXCLUDED.scope;




-- ----------------------------------------------------------------------------
-- 2. One row per person per page
-- ----------------------------------------------------------------------------
-- No row means no access to that page. A missing row and an all-false row say
-- the same thing, so there is no third state to reason about, and a page
-- added to the app later is closed to everybody until somebody opens it.
CREATE TABLE IF NOT EXISTS public.user_page_access (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  page       text NOT NULL,
  -- Denormalised from page_catalog on purpose: has_permission() is called
  -- several times per request from inside policies, and a join it does not
  -- have to make is a join it does not have to make.
  section    text NOT NULL,
  can_view   boolean NOT NULL DEFAULT false,
  can_create boolean NOT NULL DEFAULT false,
  can_edit   boolean NOT NULL DEFAULT false,
  can_delete boolean NOT NULL DEFAULT false,
  -- 'own' confines somebody to the sections they teach. It is what makes a
  -- teacher a teacher now that there are no roles.
  scope      text NOT NULL DEFAULT 'all' CHECK (scope IN ('all', 'own')),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, profile_id, page)
);

CREATE INDEX IF NOT EXISTS idx_user_page_access_person
  ON public.user_page_access (school_id, profile_id);
CREATE INDEX IF NOT EXISTS idx_user_page_access_lookup
  ON public.user_page_access (profile_id, section);

SELECT public.apply_tenant_rls('user_page_access', 'users.read', 'users.write');
SELECT public.add_touch_trigger('user_page_access');
SELECT public.add_audit_trigger('user_page_access');

-- Everybody may read their OWN sheet: the sidebar is built from it, and a
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
-- 3. Expand what people already have
-- ----------------------------------------------------------------------------
-- 023 stored one row per SECTION. Each of those becomes one row per page in
-- that section, carrying the same flags. Somebody who could see Students sees
-- all seven student screens, which is what they could see before -- narrowing
-- it is now a decision somebody makes, not something this file does for them.
DO $convert$
BEGIN
  IF to_regclass('public.user_access') IS NULL THEN
    RAISE NOTICE 'no user_access table -- nothing to expand';
    RETURN;
  END IF;

  INSERT INTO public.user_page_access
    (school_id, profile_id, page, section, can_view, can_create, can_edit, can_delete, scope)
  SELECT ua.school_id, ua.profile_id, pc.page, pc.section,
         ua.can_view OR ua.can_write,
         ua.can_write AND pc.has_crud,
         ua.can_write,
         ua.can_delete AND pc.has_crud,
         ua.scope
    FROM public.user_access ua
    JOIN public.page_catalog pc ON pc.section = ua.section
  ON CONFLICT (school_id, profile_id, page) DO NOTHING;

  RAISE NOTICE 'expanded % section rows into % page rows',
    (SELECT count(*) FROM public.user_access),
    (SELECT count(*) FROM public.user_page_access);
END
$convert$;


-- ----------------------------------------------------------------------------
-- 4. has_permission(), rolled up from the pages
-- ----------------------------------------------------------------------------
-- Same signature, same callers, same SECURITY DEFINER reasoning: it is called
-- from inside policies and must not re-enter their RLS.
CREATE OR REPLACE FUNCTION public.has_permission(p_perm text)
RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.permission_map m ON m.code = p_perm
    JOIN public.user_page_access ua
      ON ua.profile_id = p.id
     AND ua.school_id  = p.school_id
     AND ua.section    = m.section
    WHERE p.id = auth.uid()
      AND p.status = 'active'
      AND p.is_deleted = false
      -- what the school bought, still gated on the module in the code
      AND public.school_has_module(p.school_id, split_part(p_perm, '.', 1))
      -- a wide code needs wide access; a narrow one is satisfied by either
      AND (m.scope = 'own' OR ua.scope = 'all')
      AND CASE m.verb
            WHEN 'view'   THEN ua.can_view
            WHEN 'write'  THEN ua.can_create OR ua.can_edit
            WHEN 'delete' THEN ua.can_delete
          END
  );
$$;


-- ----------------------------------------------------------------------------
-- 5. Opening somebody up completely
-- ----------------------------------------------------------------------------
-- The administrator's sheet: every page, every action. Used by the button on
-- the user screen, and by the bootstrap below.
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

  -- A platform admin provisioning a school has no school of their own, so
  -- they come through the first branch instead.
  IF NOT (public.is_platform_admin()
          OR (v_school = public.current_school_id() AND public.has_permission('users.write'))) THEN
    RAISE EXCEPTION 'not allowed to manage users for this school'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO public.user_page_access
    (school_id, profile_id, page, section, can_view, can_create, can_edit, can_delete, scope)
  SELECT v_school, p_profile, pc.page, pc.section,
         true, pc.has_crud, pc.has_crud OR pc.section = 'settings', pc.has_crud, 'all'
    FROM public.page_catalog pc
  ON CONFLICT (school_id, profile_id, page) DO UPDATE
    SET can_view = true, can_create = EXCLUDED.can_create, can_edit = EXCLUDED.can_edit,
        can_delete = EXCLUDED.can_delete, scope = 'all', updated_at = now();
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.grant_full_access(uuid) TO authenticated;

-- The SQL-editor version: no guard, because sitting at the SQL editor is the
-- guard. auth.uid() is NULL here, so the checks above could never pass.
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
    (school_id, profile_id, page, section, can_view, can_create, can_edit, can_delete, scope)
  SELECT v_school, v_id, pc.page, pc.section,
         true, pc.has_crud, true, pc.has_crud, 'all'
    FROM public.page_catalog pc
  ON CONFLICT (school_id, profile_id, page) DO UPDATE
    SET can_view = true, can_create = EXCLUDED.can_create, can_edit = true,
        can_delete = EXCLUDED.can_delete, scope = 'all', updated_at = now();

  UPDATE public.profiles
     SET status = 'active', is_deleted = false, updated_at = now()
   WHERE id = v_id;

  SELECT count(*) INTO v_count FROM public.user_page_access WHERE profile_id = v_id;
  RETURN format('%s now has all %s pages', p_email, v_count);
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.seed_full_access(text) FROM PUBLIC, anon, authenticated;


-- ----------------------------------------------------------------------------
-- 5b. Creating a login, and setting a password
-- ----------------------------------------------------------------------------
-- Both repeated from the earlier files for the same reason as the map above:
-- the Add User button and the password form on a person's page call these,
-- and this file is the one that has to leave a working system behind.
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

  -- Somebody in MY school only. Without this check the parameter is a way to
  -- set any password on the platform.
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.id = p_profile AND p.school_id = v_school AND p.is_deleted = false
  ) THEN
    RAISE EXCEPTION 'That user is not in this school.';
  END IF;

  -- A platform admin is above a school admin, so a school admin may not
  -- take their account.
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

  -- The trail would otherwise be silent about the single most sensitive
  -- thing on the screen. The password itself is not recorded, obviously.
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
-- 5c. Point the DELETE policies at the delete box
-- ----------------------------------------------------------------------------
-- apply_tenant_rls() wrote INSERT, UPDATE and DELETE policies that all ask
-- for `<module>.write`. That is why there was no way to say "may edit, may
-- not delete" before. This walks the standard policies and repoints the
-- DELETE one at `<module>.delete`.
--
-- Only policies whose body is EXACTLY the shape apply_tenant_rls produces are
-- touched. The teacher-scoped policies from 017 and 018 carry extra
-- conditions, do not match, and are left alone -- which is what we want: a
-- teacher's limits come from their own rules, not from this box.
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
    -- the generated shape, and nothing else
    -- `public.` is optional because whether pg_get_expr() prints the schema
    -- depends on the search_path this file happens to be run with.
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
-- 6. Every school keeps an administrator
-- ----------------------------------------------------------------------------
-- An administrator must never end up with nothing. Staff start closed and are
-- opened a page at a time -- that is the whole point -- but the person who
-- hands out that access has to be able to reach the screen where they do it.
--
-- There is no row saying "this one is the admin", so the rule is: if a school
-- has NOBODY who can manage users, its oldest account -- the one the school
-- was set up with -- becomes its administrator. A school that already has a
-- working administrator is left completely alone.
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
         FROM public.user_page_access ua
         JOIN public.profiles p ON p.id = ua.profile_id
        WHERE ua.school_id = s.id
          AND ua.section   = 'users'
          AND (ua.can_create OR ua.can_edit)
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
-- 7. What the old system left behind
-- ----------------------------------------------------------------------------
-- user_access held one row per SECTION and was expanded in section 3.
-- The role tables were dropped by 023; if that file never finished they are
-- still sitting there, read by nothing -- has_permission() stopped looking at
-- them in section 4 above. Guarded, so this works whichever way round it is
-- run.
DROP TABLE IF EXISTS public.user_access CASCADE;
DROP TABLE IF EXISTS public.profile_permissions CASCADE;
DROP TABLE IF EXISTS public.profile_roles CASCADE;
DROP TABLE IF EXISTS public.roles CASCADE;
DROP FUNCTION IF EXISTS public.seed_school_user(text, text, text, text, text);


-- ============================================================================
-- 8. RESULT -- who can open what
-- ============================================================================
-- The administrator should show every page. Staff show only what they have
-- been given, which for a brand-new account is nothing at all -- that is
-- correct, and the Access button on their row is where it changes.
SELECT p.email,
       count(*) FILTER (WHERE ua.can_view)                        AS pages_visible,
       count(*) FILTER (WHERE ua.can_create OR ua.can_edit)       AS pages_writable,
       count(*) FILTER (WHERE ua.can_delete)                      AS pages_deletable,
       count(*) FILTER (WHERE ua.scope = 'own')                   AS own_classes_only,
       CASE
         WHEN count(*) FILTER (WHERE ua.section = 'users'
                                 AND (ua.can_create OR ua.can_edit)) > 0 THEN 'administrator'
         WHEN count(*) FILTER (WHERE ua.can_view) = 0             THEN 'no access yet'
         ELSE 'staff'
       END AS kind
  FROM public.profiles p
  LEFT JOIN public.user_page_access ua ON ua.profile_id = p.id
 WHERE p.school_id IS NOT NULL AND p.is_deleted = false
 GROUP BY p.email, p.created_at
 ORDER BY p.created_at;
