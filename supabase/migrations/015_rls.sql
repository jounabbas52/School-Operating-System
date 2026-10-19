-- ============================================================================
-- 015_rls.sql -- EVERY ROW LEVEL SECURITY OBJECT IN ONE FILE
-- ============================================================================
-- Consolidated from schema.sql AND every numbered migration. The standard set
-- covers 56 tenant tables: schema.sql declares 38 of them and the later
-- migrations add the rest, which is why reading schema.sql alone gives an
-- incomplete picture of what is actually protected.
--
-- Safe to re-run. Every CREATE POLICY sits in a block that swallows
-- duplicate_object, the functions are CREATE OR REPLACE, and a table this
-- database does not have is skipped with a notice rather than aborting the
-- run. Running this file is also how you repair a policy someone dropped
-- from the dashboard.
--
-- ORDER MATTERS. The helper functions must exist before any policy that calls
-- them, and apply_tenant_rls() before the table list. Run top to bottom.
--
-- THE MODEL IN ONE PARAGRAPH
--   Every tenant table carries school_id. A caller is either platform staff
--   (a platform_admins row, no school) or a member of exactly one school.
--   Platform staff read across all schools; everyone else is clamped to
--   current_school_id() AND must hold the permission the policy names. The
--   permission is itself gated by the module that owns it, so a school
--   without the library module cannot read books however its roles are set.
--
--   Policies are PERMISSIVE and therefore OR-ed together. Two SELECT policies
--   on one table widen access; they never narrow it. That is why profiles has
--   a self policy and a colleagues policy rather than one combined rule.
--
-- WHY THIS MATTERS: the Supabase anon key ships in the browser. Without RLS,
-- school_id is a convention the app honours rather than a boundary the
-- database enforces, and any signed-in user could read every school's data
-- straight from PostgREST.
-- ============================================================================


-- ============================================================================
-- 0. PRE-FLIGHT -- which of these tables is this database missing?
-- ============================================================================
-- Run this first. Anything it returns is a table the app expects and this
-- database does not have, so the schema is half-applied and the migration
-- that creates it still needs to run. The rest of the file completes either
-- way -- missing tables are skipped -- but their rows do not exist to be
-- protected yet either.
SELECT t AS missing_table
FROM unnest(ARRAY[
  'academic_years',
  'admission_inquiries',
  'attendance',
  'book_copies',
  'book_loans',
  'books',
  'certificate_settings',
  'certificates_issued',
  'class_subjects',
  'classes',
  'complaints',
  'contacts_directory',
  'datesheet_configurations',
  'datesheet_groups',
  'datesheets',
  'exam_slips',
  'exam_subjects',
  'exams',
  'expenses',
  'fee_challan_items',
  'fee_challans',
  'fee_items',
  'fee_payments',
  'fee_policies',
  'grade_levels',
  'id_card_settings',
  'inquiries',
  'marks',
  'passengers',
  'payroll_holidays',
  'payroll_items',
  'payroll_runs',
  'payroll_settings',
  'periods',
  'report_templates',
  'reports',
  'salary_payments',
  'salary_structures',
  'section_subjects',
  'sections',
  'sessions',
  'staff',
  'staff_attendance',
  'staff_documents',
  'staff_salaries',
  'student_enrollments',
  'students',
  'subjects',
  'terms',
  'test_marks',
  'tests',
  'timetable_entries',
  'timetable_settings',
  'transport_routes',
  'vehicles',
  'visitors'
]) AS t
WHERE to_regclass('public.' || quote_ident(t)) IS NULL
ORDER BY t;


-- ============================================================================
-- 1. HELPER FUNCTIONS -- the predicates every policy is built from
-- ============================================================================
-- All are SECURITY DEFINER: they read platform_admins, profiles and roles,
-- which the caller usually cannot read directly. Without DEFINER a policy
-- would need the caller to already hold the access it is deciding. All are
-- STABLE, so Postgres evaluates them once per statement, not once per row.

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public, auth
AS $$
  SELECT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid());
$$;

-- The caller's school, or NULL if they are platform staff, deleted,
-- suspended, or their school has been switched off.
CREATE OR REPLACE FUNCTION public.current_school_id()
RETURNS uuid
LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public, auth
AS $$
  SELECT p.school_id
  FROM public.profiles p
  JOIN public.schools s ON s.id = p.school_id
  WHERE p.id = auth.uid()
    AND p.status = 'active'
    AND p.is_deleted = false
    AND s.is_suspended = false
    AND s.status = 'active';
$$;

-- Is a module live for this school right now?
CREATE OR REPLACE FUNCTION public.school_has_module(p_school uuid, p_module text)
RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE((SELECT m.is_core FROM public.modules m WHERE m.code = p_module), false)
  OR EXISTS (
    SELECT 1 FROM public.school_modules sm
    WHERE sm.school_id = p_school
      AND sm.module_code = p_module
      AND sm.is_enabled
      AND (sm.expires_at IS NULL OR sm.expires_at > now())
  );
$$;

-- THE workhorse, used by every policy in this file.
--
-- Answers: does the caller hold this permission through one of their roles,
-- AND is the module that owns it switched on for their school? The module is
-- the text before the first dot, so 'library.write' is gated by the 'library'
-- module. An unrecognised permission code yields false -- it fails closed.
CREATE OR REPLACE FUNCTION public.has_permission(p_perm text)
RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.profile_roles pr ON pr.profile_id = p.id
    JOIN public.roles r ON r.id = pr.role_id
    WHERE p.id = auth.uid()
      AND p.status = 'active'
      AND p.is_deleted = false
      AND r.permissions ? p_perm
      AND public.school_has_module(p.school_id, split_part(p_perm, '.', 1))
  );
$$;

-- Every module the caller's school may use. The app calls this once at login
-- and renders the sidebar from the result.
CREATE OR REPLACE FUNCTION public.school_enabled_modules(p_school uuid DEFAULT NULL)
RETURNS TABLE (code text, name text, category text, icon text, sort_order integer)
LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public
AS $$
  SELECT m.code, m.name, m.category, m.icon, m.sort_order
  FROM public.modules m
  WHERE public.school_has_module(COALESCE(p_school, public.current_school_id()), m.code)
  ORDER BY m.sort_order;
$$;

GRANT EXECUTE ON FUNCTION
  public.is_platform_admin(), public.current_school_id(),
  public.school_has_module(uuid, text), public.has_permission(text),
  public.school_enabled_modules(uuid)
  TO authenticated;


-- ============================================================================
-- 2. THE POLICY FACTORY
-- ============================================================================
-- 56 tenant tables need the same four policies with two permission codes
-- swapped. By hand that is 224 near-identical policies and a guarantee that
-- one of them is subtly wrong.
--
-- Note the asymmetry: SELECT lets platform admins through, INSERT/UPDATE/
-- DELETE do not. Support staff should be able to diagnose a school's data
-- without being able to silently rewrite it.

CREATE OR REPLACE FUNCTION public.apply_tenant_rls(p_table text, p_read text, p_write text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- A table named in the list but absent from this database aborts the whole
  -- run, which is how one missing table turns into zero policies for every
  -- table after it. Skip loudly instead: section 0 lists what was skipped,
  -- and 7b proves nothing was left unprotected.
  IF to_regclass('public.' || quote_ident(p_table)) IS NULL THEN
    RAISE NOTICE 'SKIPPED %: table does not exist in this database', p_table;
    RETURN;
  END IF;

  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', p_table);

  BEGIN
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
         USING (public.is_platform_admin()
                OR (school_id = public.current_school_id()
                    AND public.has_permission(%L)))',
      p_table || '_select', p_table, p_read);
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
         WITH CHECK (school_id = public.current_school_id()
                     AND public.has_permission(%L))',
      p_table || '_insert', p_table, p_write);
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
         USING (school_id = public.current_school_id() AND public.has_permission(%L))
         WITH CHECK (school_id = public.current_school_id() AND public.has_permission(%L))',
      p_table || '_update', p_table, p_write, p_write);
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated
         USING (school_id = public.current_school_id() AND public.has_permission(%L))',
      p_table || '_delete', p_table, p_write);
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END;
$$;


-- ============================================================================
-- 3. ENABLE RLS
-- ============================================================================
-- A table with policies but RLS disabled is wide open -- the policies simply
-- never run. These are the tables with hand-written policies below;
-- apply_tenant_rls() enables RLS itself for everything in section 5.

ALTER TABLE public.modules         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plans           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_modules    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schools         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_modules  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_roles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_requests  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs      ENABLE ROW LEVEL SECURITY;


-- ============================================================================
-- 4. HAND-WRITTEN POLICIES
-- ============================================================================
-- Tables that do not fit the standard set: catalogues everyone reads, rows
-- you may see because they are yours, and the module gate a school must not
-- be able to open for itself.

-- Catalogues: any signed-in user may read, only platform staff may write.
DO $$ BEGIN
  CREATE POLICY modules_read ON public.modules FOR SELECT TO authenticated USING (true);
  CREATE POLICY modules_write ON public.modules FOR ALL TO authenticated
    USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

  CREATE POLICY plans_read ON public.plans FOR SELECT TO authenticated
    USING (is_public OR public.is_platform_admin());
  CREATE POLICY plans_write ON public.plans FOR ALL TO authenticated
    USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

  CREATE POLICY plan_modules_read ON public.plan_modules FOR SELECT TO authenticated USING (true);
  CREATE POLICY plan_modules_write ON public.plan_modules FOR ALL TO authenticated
    USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

  CREATE POLICY platform_admins_all ON public.platform_admins FOR ALL TO authenticated
    USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Schools: a member sees only their own; only the super admin creates one.
DO $$ BEGIN
  CREATE POLICY schools_select ON public.schools FOR SELECT TO authenticated
    USING (public.is_platform_admin() OR id = public.current_school_id());
  CREATE POLICY schools_update ON public.schools FOR UPDATE TO authenticated
    USING (public.is_platform_admin()
           OR (id = public.current_school_id() AND public.has_permission('core.settings.write')))
    WITH CHECK (public.is_platform_admin()
           OR (id = public.current_school_id() AND public.has_permission('core.settings.write')));
  CREATE POLICY schools_insert ON public.schools FOR INSERT TO authenticated
    WITH CHECK (public.is_platform_admin());
  CREATE POLICY schools_delete ON public.schools FOR DELETE TO authenticated
    USING (public.is_platform_admin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- The module gate: a school may READ what it has been given, only the super
-- admin may CHANGE it. This is what stops a school switching itself on.
DO $$ BEGIN
  CREATE POLICY school_modules_select ON public.school_modules FOR SELECT TO authenticated
    USING (public.is_platform_admin() OR school_id = public.current_school_id());
  CREATE POLICY school_modules_write ON public.school_modules FOR ALL TO authenticated
    USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Roles: system templates are visible to everyone, school roles only to that
-- school, and a school can never edit a system template.
DO $$ BEGIN
  CREATE POLICY roles_select ON public.roles FOR SELECT TO authenticated
    USING (school_id IS NULL OR school_id = public.current_school_id()
           OR public.is_platform_admin());
  CREATE POLICY roles_write ON public.roles FOR ALL TO authenticated
    USING (school_id = public.current_school_id() AND is_system = false
           AND public.has_permission('users.roles.write'))
    WITH CHECK (school_id = public.current_school_id() AND is_system = false
           AND public.has_permission('users.roles.write'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Profiles: yourself always; colleagues only if you may manage users.
DO $$ BEGIN
  CREATE POLICY profiles_select_self ON public.profiles FOR SELECT TO authenticated
    USING (id = auth.uid() OR public.is_platform_admin());
  CREATE POLICY profiles_select_school ON public.profiles FOR SELECT TO authenticated
    USING (school_id = public.current_school_id() AND public.has_permission('users.read'));
  CREATE POLICY profiles_update_self ON public.profiles FOR UPDATE TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid() AND status = 'active' AND is_deleted = false);
  CREATE POLICY profiles_manage ON public.profiles FOR ALL TO authenticated
    USING (public.is_platform_admin()
           OR (school_id = public.current_school_id() AND public.has_permission('users.write')))
    WITH CHECK (public.is_platform_admin()
           OR (school_id = public.current_school_id() AND public.has_permission('users.write')));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY profile_roles_select ON public.profile_roles FOR SELECT TO authenticated
    USING (profile_id = auth.uid()
           OR (school_id = public.current_school_id() AND public.has_permission('users.read')));
  CREATE POLICY profile_roles_write ON public.profile_roles FOR ALL TO authenticated
    USING (school_id = public.current_school_id() AND public.has_permission('users.roles.write'))
    WITH CHECK (school_id = public.current_school_id() AND public.has_permission('users.roles.write'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Settings are read by everyone in the school -- the app needs them to render
-- at all -- but written only with the settings permission.
DO $$ BEGIN
  CREATE POLICY settings_select ON public.settings FOR SELECT TO authenticated
    USING (public.is_platform_admin() OR school_id = public.current_school_id());
  CREATE POLICY settings_write ON public.settings FOR ALL TO authenticated
    USING (school_id = public.current_school_id() AND public.has_permission('core.settings.write'))
    WITH CHECK (school_id = public.current_school_id() AND public.has_permission('core.settings.write'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Notifications: yours, or the school's broadcasts.
DO $$ BEGIN
  CREATE POLICY notifications_select ON public.notifications FOR SELECT TO authenticated
    USING (school_id = public.current_school_id()
           AND (target_profile_id IS NULL OR target_profile_id = auth.uid()
                OR public.has_permission('notifications.write')));
  CREATE POLICY notifications_update_own ON public.notifications FOR UPDATE TO authenticated
    USING (target_profile_id = auth.uid()) WITH CHECK (target_profile_id = auth.uid());
  CREATE POLICY notifications_write ON public.notifications FOR ALL TO authenticated
    USING (school_id = public.current_school_id() AND public.has_permission('notifications.write'))
    WITH CHECK (school_id = public.current_school_id() AND public.has_permission('notifications.write'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Leave: anyone may file and see their own; approvers need the permission.
DO $$ BEGIN
  CREATE POLICY leave_select ON public.leave_requests FOR SELECT TO authenticated
    USING (school_id = public.current_school_id()
           AND (profile_id = auth.uid() OR public.has_permission('hr.read')));
  CREATE POLICY leave_insert_own ON public.leave_requests FOR INSERT TO authenticated
    WITH CHECK (school_id = public.current_school_id() AND profile_id = auth.uid());
  CREATE POLICY leave_manage ON public.leave_requests FOR ALL TO authenticated
    USING (school_id = public.current_school_id() AND public.has_permission('hr.write'))
    WITH CHECK (school_id = public.current_school_id() AND public.has_permission('hr.write'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Audit log is read-only to everyone. Only the SECURITY DEFINER trigger writes.
DO $$ BEGIN
  CREATE POLICY audit_logs_select ON public.audit_logs FOR SELECT TO authenticated
    USING (public.is_platform_admin()
           OR (school_id = public.current_school_id() AND public.has_permission('core.audit.read')));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================================
-- 5. THE STANDARD SET -- 56 TENANT TABLES
-- ============================================================================
-- read permission, then write permission. A table missing from this list has
-- NO policies at all, and with RLS enabled that means nobody can read it.
--
-- This merges schema.sql's list with the apply_tenant_rls() calls scattered
-- through the numbered migrations, so nothing is protected in one file and
-- forgotten in the other.

SELECT public.apply_tenant_rls(t[1], t[2], t[3])
FROM (VALUES
  (ARRAY['academic_years',          'academics.read', 'academics.write']),
  (ARRAY['admission_inquiries',     'admissions.read','admissions.write']),
  (ARRAY['attendance',              'attendance.read','attendance.write']),
  (ARRAY['book_copies',             'library.read',   'library.write']),
  (ARRAY['book_loans',              'library.read',   'library.write']),
  (ARRAY['books',                   'library.read',   'library.write']),
  (ARRAY['certificate_settings',    'students.read',  'core.settings.write']),
  (ARRAY['certificates_issued',     'students.read',  'students.write']),
  (ARRAY['class_subjects',          'academics.read', 'academics.write']),
  (ARRAY['classes',                 'academics.read', 'academics.write']),
  (ARRAY['complaints',              'frontdesk.read', 'frontdesk.write']),
  (ARRAY['contacts_directory',      'frontdesk.read', 'frontdesk.write']),
  (ARRAY['datesheet_configurations','exams.read',     'exams.write']),
  (ARRAY['datesheet_groups',        'exams.read',     'exams.write']),
  (ARRAY['datesheets',              'exams.read',     'exams.write']),
  (ARRAY['exam_slips',              'exams.read',     'exams.write']),
  (ARRAY['exam_subjects',           'exams.read',     'exams.write']),
  (ARRAY['exams',                   'exams.read',     'exams.write']),
  (ARRAY['expenses',                'accounts.read',  'accounts.write']),
  (ARRAY['fee_challan_items',       'fees.read',      'fees.write']),
  (ARRAY['fee_challans',            'fees.read',      'fees.write']),
  (ARRAY['fee_items',               'fees.read',      'fees.write']),
  (ARRAY['fee_payments',            'fees.read',      'fees.write']),
  (ARRAY['fee_policies',            'fees.read',      'fees.write']),
  (ARRAY['grade_levels',            'academics.read', 'academics.write']),
  (ARRAY['id_card_settings',        'students.read',  'core.settings.write']),
  (ARRAY['inquiries',               'frontdesk.read', 'frontdesk.write']),
  (ARRAY['marks',                   'exams.read',     'exams.write']),
  (ARRAY['passengers',              'transport.read', 'transport.write']),
  (ARRAY['payroll_holidays',        'payroll.read',   'payroll.write']),
  (ARRAY['payroll_items',           'payroll.read',   'payroll.write']),
  (ARRAY['payroll_runs',            'payroll.read',   'payroll.write']),
  (ARRAY['payroll_settings',        'payroll.read',   'payroll.write']),
  (ARRAY['periods',                 'academics.read', 'academics.write']),
  (ARRAY['report_templates',        'reports.read',   'reports.write']),
  (ARRAY['reports',                 'reports.read',   'reports.write']),
  (ARRAY['salary_payments',         'accounts.read',  'accounts.write']),
  (ARRAY['salary_structures',       'staff.read',     'staff.write']),
  (ARRAY['section_subjects',        'academics.read', 'academics.write']),
  (ARRAY['sections',                'academics.read', 'academics.write']),
  (ARRAY['sessions',                'academics.read', 'academics.write']),
  (ARRAY['staff',                   'staff.read',     'staff.write']),
  (ARRAY['staff_attendance',        'attendance.read','attendance.write']),
  (ARRAY['staff_documents',         'staff.read',     'staff.write']),
  (ARRAY['staff_salaries',          'payroll.read',   'payroll.write']),
  (ARRAY['student_enrollments',     'students.read',  'students.write']),
  (ARRAY['students',                'students.read',  'students.write']),
  (ARRAY['subjects',                'academics.read', 'academics.write']),
  (ARRAY['terms',                   'academics.read', 'academics.write']),
  (ARRAY['test_marks',              'tests.read',     'tests.write']),
  (ARRAY['tests',                   'tests.read',     'tests.write']),
  (ARRAY['timetable_entries',       'academics.read', 'academics.write']),
  (ARRAY['timetable_settings',      'academics.read', 'academics.write']),
  (ARRAY['transport_routes',        'transport.read', 'transport.write']),
  (ARRAY['vehicles',                'transport.read', 'transport.write']),
  (ARRAY['visitors',                'frontdesk.read', 'frontdesk.write'])
) AS v(t);


-- ============================================================================
-- 6. STORAGE
-- ============================================================================
-- storage.objects is one table for every bucket, so the policies switch on
-- bucket_id and read the first path segment as the school id:
--     school-assets/{school_id}/logo.png
--     student-photos/{school_id}/{student_id}.jpg
--     staff-photos/{school_id}/{staff_id}.jpg
--
-- student-photos and staff-photos are PRIVATE buckets on purpose. A public
-- bucket serves files to anyone holding the URL, with no login and no RLS --
-- right for a school crest, badly wrong for a photograph of a child.
--
-- If this section errors: storage.objects is owned by supabase_storage_admin
-- and some projects refuse policy creation from the SQL editor. Create the
-- same policies from Dashboard > Storage > Policies instead.

-- ---- school-assets and student-photos (from 004_storage.sql) --------------

DO $do$
BEGIN
  -- ---- school-assets: world-readable, written only by the owning school ----
  EXECUTE $p$
    CREATE POLICY "school assets read" ON storage.objects FOR SELECT TO public
      USING (bucket_id = 'school-assets')$p$;

  EXECUTE $p$
    CREATE POLICY "school assets insert" ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'school-assets'
        AND (storage.foldername(name))[1]::uuid = public.current_school_id()
        AND public.has_permission('core.settings.write')
      )$p$;

  EXECUTE $p$
    CREATE POLICY "school assets update" ON storage.objects FOR UPDATE TO authenticated
      USING (
        bucket_id = 'school-assets'
        AND (storage.foldername(name))[1]::uuid = public.current_school_id()
        AND public.has_permission('core.settings.write')
      )$p$;

  EXECUTE $p$
    CREATE POLICY "school assets delete" ON storage.objects FOR DELETE TO authenticated
      USING (
        bucket_id = 'school-assets'
        AND (storage.foldername(name))[1]::uuid = public.current_school_id()
        AND public.has_permission('core.settings.write')
      )$p$;

  -- ---- student-photos: private, and only to that school's staff ----
  EXECUTE $p$
    CREATE POLICY "student photos read" ON storage.objects FOR SELECT TO authenticated
      USING (
        bucket_id = 'student-photos'
        AND (storage.foldername(name))[1]::uuid = public.current_school_id()
        AND public.has_permission('students.read')
      )$p$;

  EXECUTE $p$
    CREATE POLICY "student photos insert" ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'student-photos'
        AND (storage.foldername(name))[1]::uuid = public.current_school_id()
        AND public.has_permission('students.write')
      )$p$;

  EXECUTE $p$
    CREATE POLICY "student photos update" ON storage.objects FOR UPDATE TO authenticated
      USING (
        bucket_id = 'student-photos'
        AND (storage.foldername(name))[1]::uuid = public.current_school_id()
        AND public.has_permission('students.write')
      )$p$;

  EXECUTE $p$
    CREATE POLICY "student photos delete" ON storage.objects FOR DELETE TO authenticated
      USING (
        bucket_id = 'student-photos'
        AND (storage.foldername(name))[1]::uuid = public.current_school_id()
        AND public.has_permission('students.write')
      )$p$;

  RAISE NOTICE 'storage policies created';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Could not create storage.objects policies (owned by supabase_storage_admin). Create them from Dashboard > Storage > Policies using the same expressions.';
  WHEN duplicate_object THEN
    RAISE NOTICE 'storage policies already exist -- skipped.';
END;
$do$;


-- ---- staff-photos (from 005_teachers.sql) ---------------------------------

DO $do$
BEGIN
  EXECUTE $p$
    CREATE POLICY "staff photos read" ON storage.objects FOR SELECT TO authenticated
      USING (
        bucket_id = 'staff-photos'
        AND (storage.foldername(name))[1]::uuid = public.current_school_id()
        AND public.has_permission('staff.read')
      )$p$;

  EXECUTE $p$
    CREATE POLICY "staff photos insert" ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'staff-photos'
        AND (storage.foldername(name))[1]::uuid = public.current_school_id()
        AND public.has_permission('staff.write')
      )$p$;

  EXECUTE $p$
    CREATE POLICY "staff photos update" ON storage.objects FOR UPDATE TO authenticated
      USING (
        bucket_id = 'staff-photos'
        AND (storage.foldername(name))[1]::uuid = public.current_school_id()
        AND public.has_permission('staff.write')
      )$p$;

  EXECUTE $p$
    CREATE POLICY "staff photos delete" ON storage.objects FOR DELETE TO authenticated
      USING (
        bucket_id = 'staff-photos'
        AND (storage.foldername(name))[1]::uuid = public.current_school_id()
        AND public.has_permission('staff.write')
      )$p$;

  RAISE NOTICE 'staff-photos storage policies created';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Could not create storage.objects policies (owned by supabase_storage_admin). Create them from Dashboard > Storage > Policies using the same expressions.';
  WHEN duplicate_object THEN
    RAISE NOTICE 'staff-photos storage policies already exist -- skipped.';
END;
$do$;


-- ============================================================================
-- 7. VERIFY -- run after the file, or any time you suspect a gap
-- ============================================================================

-- 7a. Every policy now live.
SELECT schemaname, tablename, policyname, cmd, roles::text,
       qual       AS using_expression,
       with_check AS with_check_expression
FROM pg_policies
WHERE schemaname IN ('public', 'storage')
ORDER BY schemaname, tablename, cmd, policyname;

-- 7b. THE DANGEROUS GAP. A table with RLS DISABLED is readable by everyone
-- holding the anon key; a table with RLS on and no policy is readable by
-- nobody. This must come back EMPTY.
SELECT c.relname AS table_name,
       c.relrowsecurity AS rls_enabled,
       count(p.polname) AS policies,
       CASE
         WHEN NOT c.relrowsecurity THEN 'RLS OFF -- WIDE OPEN'
         WHEN count(p.polname) = 0  THEN 'RLS on, no policy -- nobody can read'
       END AS problem
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE n.nspname = 'public' AND c.relkind = 'r'
GROUP BY c.relname, c.relrowsecurity
HAVING NOT c.relrowsecurity OR count(p.polname) = 0
ORDER BY c.relname;

-- 7c. Policies per table. The standard set is 4; fewer means a CREATE POLICY
-- was swallowed by the duplicate_object handler after a partial earlier run.
SELECT tablename, count(*) AS policies
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY count(*), tablename;

-- 7d. The helpers must exist, be SECURITY DEFINER, and be executable by
-- authenticated. A policy calling a function the caller cannot execute fails
-- closed, which presents exactly as "my data disappeared".
SELECT p.proname,
       p.prosecdef AS security_definer,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_may_call
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('is_platform_admin', 'current_school_id',
                    'school_has_module', 'has_permission', 'school_enabled_modules')
ORDER BY p.proname;

-- 7e. Who currently holds platform access.
SELECT pa.user_id, pa.email, pa.role, pa.created_at
FROM public.platform_admins pa
ORDER BY pa.created_at;
