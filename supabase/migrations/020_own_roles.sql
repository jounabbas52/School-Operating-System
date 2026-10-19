-- ============================================================================
-- 020_OWN_ROLES.sql -- run after 019_teacher_panel.sql
-- ============================================================================
-- Paste the whole file into the SQL editor and Run. Idempotent.
--
-- WHAT THIS DOES
--
-- Removes the shared role templates entirely. After this, every role belongs
-- to exactly one school, and every school admin owns, edits and deletes their
-- own set. Nothing is shared across tenants any more.
--
-- WHY IT IS A MIGRATION AND NOT A DELETE
--
-- profile_roles.role_id is ON DELETE CASCADE. Running
--
--     DELETE FROM roles WHERE school_id IS NULL;
--
-- would therefore not just remove the templates -- it would silently delete
-- every assignment pointing at them. Every user holding a shared role would
-- be left with no role at all, which means has_permission() returns false for
-- everything and they are locked out of their own school. Including whoever
-- ran the statement.
--
-- And seed_users.sql's create_school_user() picks
--     WHERE name = p_role_name AND (school_id = v_school OR school_id IS NULL)
-- preferring the school's own and falling back to the shared one. Since no
-- school had its own, essentially every existing user is on a shared role
-- right now.
--
-- So the order matters:
--
--   1. give each school its own copy of the roles it is actually using
--   2. repoint every assignment at the copy
--   3. only then delete the shared rows
--
-- Step 2 is what makes step 3 harmless.
--
-- ONE DELIBERATE EXCEPTION
--
-- provision_school() creates no roles today, so a brand-new school would have
-- zero. That is unusable rather than clean: creating a role needs
-- users.roles.write, which needs a role, so a school with none can never
-- bootstrap through the UI -- only through the SQL editor.
--
-- So provisioning now seeds ONE role, "Administrator", owned by the school
-- and fully editable or deletable like any other. Everything else is left for
-- the admin to build, which is the point.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Give every school its own copy of the roles it uses
-- ----------------------------------------------------------------------------
-- Only roles a school actually has somebody assigned to. Copying all six
-- templates into every school would hand them a pile of roles they never
-- asked for, which is the opposite of the intent.
--
-- UNIQUE is (school_id, name), and the copies land under a real school_id, so
-- they keep their original names without colliding.
INSERT INTO public.roles (school_id, name, display_name, description, permissions, is_system)
SELECT DISTINCT
       pr.school_id,
       r.name,
       r.display_name,
       r.description,
       r.permissions,
       false
  FROM public.profile_roles pr
  JOIN public.roles r ON r.id = pr.role_id
 WHERE r.school_id IS NULL
ON CONFLICT (school_id, name) DO NOTHING;


-- ----------------------------------------------------------------------------
-- 2. Repoint every assignment at the school's own copy
-- ----------------------------------------------------------------------------
-- Matched on name within the school. This is what disarms the cascade in
-- step 3: once no profile_roles row references a shared role, deleting them
-- takes nothing with it.
UPDATE public.profile_roles pr
   SET role_id = own.id
  FROM public.roles shared, public.roles own
 WHERE pr.role_id = shared.id
   AND shared.school_id IS NULL
   AND own.school_id = pr.school_id
   AND own.name = shared.name;


-- ----------------------------------------------------------------------------
-- 3. A school with users but somehow still no roles
-- ----------------------------------------------------------------------------
-- Belt and braces for a school whose assignments did not resolve above, and
-- for schools provisioned before this migration that have no users yet. They
-- would otherwise be left unable to bootstrap.
INSERT INTO public.roles (school_id, name, display_name, description, permissions, is_system)
SELECT s.id,
       'admin',
       'Administrator',
       'Full control of this school. Edit or delete it like any other role.',
       '["core.settings.write","core.audit.read","users.read","users.write","users.roles.write",
         "students.read","students.write","staff.read","staff.write",
         "academics.read","academics.write","attendance.read","attendance.write",
         "tests.read","tests.write","exams.read","exams.write","exams.publish",
         "fees.read","fees.write","accounts.read","accounts.write",
         "payroll.read","payroll.write","library.read","library.write",
         "transport.read","transport.write","frontdesk.read","frontdesk.write",
         "admissions.read","admissions.write","hr.read","hr.write",
         "notifications.read","notifications.write","reports.read","reports.write"]'::jsonb,
       false
  FROM public.schools s
 WHERE NOT EXISTS (SELECT 1 FROM public.roles r WHERE r.school_id = s.id)
ON CONFLICT (school_id, name) DO NOTHING;


-- ----------------------------------------------------------------------------
-- 4. Now the shared rows are safe to remove
-- ----------------------------------------------------------------------------
-- Guarded rather than trusted. If anything still points at a shared role the
-- cascade would strip that user, so refuse loudly instead of doing damage.
DO $cleanup$
DECLARE
  v_orphans integer;
BEGIN
  SELECT count(*) INTO v_orphans
    FROM public.profile_roles pr
    JOIN public.roles r ON r.id = pr.role_id
   WHERE r.school_id IS NULL;

  IF v_orphans > 0 THEN
    RAISE EXCEPTION
      '% assignment(s) still point at a shared role. Refusing to delete -- '
      'those users would lose every permission. Check roles with school_id IS NULL.',
      v_orphans;
  END IF;

  DELETE FROM public.roles WHERE school_id IS NULL;
END
$cleanup$;

-- The partial unique index that kept shared names unique has nothing left to
-- guard, and keeping it would silently permit exactly one shared role to be
-- recreated later.
DROP INDEX IF EXISTS public.roles_system_name_key;


-- ----------------------------------------------------------------------------
-- 5. Stop treating is_system as a lock
-- ----------------------------------------------------------------------------
-- roles_write excluded is_system rows, which was the thing making templates
-- read-only. With no shared roles left, a school must be able to edit every
-- role it owns.
--
-- roles_select no longer needs the "school_id IS NULL" branch either -- there
-- is nothing with a null school_id to read.
DO $policies$
BEGIN
  DROP POLICY IF EXISTS roles_select ON public.roles;
  CREATE POLICY roles_select ON public.roles FOR SELECT TO authenticated
    USING (school_id = public.current_school_id() OR public.is_platform_admin());

  DROP POLICY IF EXISTS roles_write ON public.roles;
  CREATE POLICY roles_write ON public.roles FOR ALL TO authenticated
    USING (school_id = public.current_school_id()
           AND public.has_permission('users.roles.write'))
    WITH CHECK (school_id = public.current_school_id()
           AND public.has_permission('users.roles.write'));
END
$policies$;

-- Kept as a column rather than dropped: it is referenced by seed files and
-- reads as a harmless false everywhere now. Nothing sets it true again.
ALTER TABLE public.roles ALTER COLUMN is_system SET DEFAULT false;
UPDATE public.roles SET is_system = false WHERE is_system = true;


-- ----------------------------------------------------------------------------
-- 6. New schools get their own Administrator
-- ----------------------------------------------------------------------------
-- Without this a school provisioned after today would have no roles and no
-- way to make one.
CREATE OR REPLACE FUNCTION public.provision_school(
  p_school_name text,
  p_slug        text,
  p_plan_code   text DEFAULT 'basic',
  p_is_demo     boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_school uuid;
  v_plan   uuid;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'only platform admins may provision schools'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT id INTO v_plan FROM public.plans WHERE code = p_plan_code;
  IF v_plan IS NULL THEN
    RAISE EXCEPTION 'unknown plan %', p_plan_code;
  END IF;

  INSERT INTO public.schools (school_name, slug, short_code, plan_id, is_demo, created_by)
  VALUES (p_school_name, p_slug, upper(left(p_slug, 8)), v_plan, p_is_demo, auth.uid())
  RETURNING id INTO v_school;

  INSERT INTO public.school_modules (school_id, module_code, enabled_by)
  SELECT v_school, pm.module_code, auth.uid()
  FROM public.plan_modules pm WHERE pm.plan_id = v_plan
  ON CONFLICT DO NOTHING;

  -- One role, so the first account has something to hold. The school owns it
  -- outright and may rename, re-permission or delete it.
  INSERT INTO public.roles (school_id, name, display_name, description, permissions, is_system)
  VALUES (
    v_school,
    'admin',
    'Administrator',
    'Full control of this school. Edit or delete it like any other role.',
    '["core.settings.write","core.audit.read","users.read","users.write","users.roles.write",
      "students.read","students.write","staff.read","staff.write",
      "academics.read","academics.write","attendance.read","attendance.write",
      "tests.read","tests.write","exams.read","exams.write","exams.publish",
      "fees.read","fees.write","accounts.read","accounts.write",
      "payroll.read","payroll.write","library.read","library.write",
      "transport.read","transport.write","frontdesk.read","frontdesk.write",
      "admissions.read","admissions.write","hr.read","hr.write",
      "notifications.read","notifications.write","reports.read","reports.write"]'::jsonb,
    false
  )
  ON CONFLICT (school_id, name) DO NOTHING;

  RETURN v_school;
END;
$$;


-- ----------------------------------------------------------------------------
-- 7. create_school_user() must stop looking for shared roles
-- ----------------------------------------------------------------------------
-- It preferred the school's own and fell back to a shared one. The fallback
-- can now only ever find nothing, so it is removed and the error says what to
-- actually do about it.
CREATE OR REPLACE FUNCTION public.create_school_user(
  p_email        text,
  p_password     text,
  p_full_name    text,
  p_school_slug  text,
  p_role_name    text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, auth, extensions
AS $$
DECLARE
  v_school uuid;
  v_role   bigint;
  v_id     uuid;
BEGIN
  SELECT id INTO v_school FROM public.schools WHERE slug = p_school_slug;
  IF v_school IS NULL THEN
    RAISE EXCEPTION 'no school with slug "%"', p_school_slug;
  END IF;

  SELECT id INTO v_role
    FROM public.roles
   WHERE name = p_role_name AND school_id = v_school;

  IF v_role IS NULL THEN
    RAISE EXCEPTION
      'school "%" has no role named "%". Roles are per-school now -- create it '
      'under Users > Roles first.', p_school_slug, p_role_name;
  END IF;

  v_id := public.create_user_account(p_email, p_password, p_full_name);

  UPDATE public.profiles
     SET school_id = v_school, status = 'active', updated_at = now()
   WHERE id = v_id;

  INSERT INTO public.profile_roles (school_id, profile_id, role_id)
  VALUES (v_school, v_id, v_role)
  ON CONFLICT (school_id, profile_id, role_id) DO NOTHING;

  RETURN v_id;
END;
$$;


DO $report$
DECLARE
  v_schools integer;
  v_roles   integer;
  v_shared  integer;
BEGIN
  SELECT count(*) INTO v_schools FROM public.schools;
  SELECT count(*) INTO v_roles   FROM public.roles;
  SELECT count(*) INTO v_shared  FROM public.roles WHERE school_id IS NULL;

  RAISE NOTICE '----------------------------------------------------------';
  RAISE NOTICE 'Roles are now per-school.';
  RAISE NOTICE '  schools: %', v_schools;
  RAISE NOTICE '  roles:   % (all owned by a school)', v_roles;
  RAISE NOTICE '  shared:  %  <- must be 0', v_shared;
  RAISE NOTICE '';
  RAISE NOTICE '  Every assignment was repointed at its school''s own copy';
  RAISE NOTICE '  BEFORE the shared rows were deleted, so nobody lost a role.';
  RAISE NOTICE '----------------------------------------------------------';
END
$report$;
