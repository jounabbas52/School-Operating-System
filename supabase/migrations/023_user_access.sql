-- ============================================================================
-- 023_USER_ACCESS.sql -- run after 022_person_access.sql (or straight after 021)
-- ============================================================================
-- Paste the whole file into the SQL editor and Run. Idempotent.
--
-- WHAT THIS DOES
--
-- Deletes the role system. Access is now per PERSON, nothing else.
--
-- Every member of staff gets their own sheet -- one row per section of the
-- app -- and on each row the admin ticks what that one person may do:
--
--     section      view   write   delete   scope
--     Students      [x]    [x]     [ ]     all
--     Fees          [ ]    [ ]     [ ]     all     <- cannot see Fees at all
--     Attendance    [x]    [x]     [ ]     own     <- only their own sections
--
-- A section with nothing ticked does not exist for that person: no sidebar
-- entry, no page, and no rows -- the database refuses them too, so there is
-- nothing to find by typing the URL in by hand either.
--
-- View without write is exactly what it sounds like: the Students screen
-- opens, the list is there, and every Save and Delete is refused by the
-- database, not merely hidden by the screen.
--
-- HOW IT WORKS WITHOUT REWRITING EVERY POLICY
--
-- Every RLS policy in this schema calls has_permission('students.write') and
-- friends. Those calls stay exactly as they are. What changes is where the
-- answer comes from: permission_map turns a code into (section, verb), and
-- has_permission() then reads that person's own row for that section.
--
--     students.read      -> section 'students', verb 'view'
--     students.write     -> section 'students', verb 'write'
--     students.delete    -> section 'students', verb 'delete'
--     students.read.own  -> section 'students', verb 'view', own-scope only
--
-- lib/access.js in the app holds the same list and does the same expansion
-- for rendering, which is why the sidebar and the database agree.
--
-- NOBODY IS LOCKED OUT
--
-- Section 3 converts every existing role assignment into these rows before
-- section 7 drops the role tables, whether or not 022 was ever run. Whoever can administer a school today can
-- still administer it when this finishes.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. One row per person per section
-- ----------------------------------------------------------------------------
-- No row means no access. That is deliberate: a missing row and an all-false
-- row mean the same thing, so there is no third state to reason about, and a
-- new section added to the app is closed to everybody until somebody opens
-- it rather than silently open to all.
CREATE TABLE IF NOT EXISTS public.user_access (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  section    text NOT NULL,
  can_view   boolean NOT NULL DEFAULT false,
  can_write  boolean NOT NULL DEFAULT false,
  can_delete boolean NOT NULL DEFAULT false,
  -- 'own' confines somebody to the sections they teach. It is what makes a
  -- teacher a teacher now that there is no role called Teacher.
  scope      text NOT NULL DEFAULT 'all' CHECK (scope IN ('all', 'own')),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, profile_id, section)
);

CREATE INDEX IF NOT EXISTS idx_user_access_person
  ON public.user_access (school_id, profile_id);

-- Reading somebody's sheet is reading their access; writing it is handing out
-- access. Both ride with the users section.
SELECT public.apply_tenant_rls('user_access', 'users.read', 'users.write');

SELECT public.add_touch_trigger('user_access');
SELECT public.add_audit_trigger('user_access');

-- Everybody may read their OWN sheet. Without this the app could not draw a
-- teacher's sidebar: it builds the menu from these rows, and users.read is
-- precisely what a teacher does not have.
DO $$
BEGIN
  CREATE POLICY user_access_select_own ON public.user_access
    FOR SELECT TO authenticated
    USING (profile_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;


-- ----------------------------------------------------------------------------
-- 2. The code -> (section, verb) map
-- ----------------------------------------------------------------------------
-- The translation layer that lets a hundred existing policies keep their
-- wording. A code that is not in this table grants nothing, which is the
-- right way round: a typo fails closed.
--
-- scope 'own' rows are the narrow siblings. A wide code (scope 'all') needs
-- a wide sheet; a narrow code is satisfied by either, so somebody with full
-- access also passes the teacher-scoped policies.
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
-- 3. Carry everybody across from their role
-- ----------------------------------------------------------------------------
-- Runs BEFORE has_permission() is replaced and long before the role tables
-- are dropped, so there is never a moment where somebody holds nothing.
--
-- can_delete follows can_write, because that is what the old codes meant: a
-- single `.write` covered insert, update and delete. Tightening it is now a
-- per-person decision rather than a silent change made on everyone's behalf.
--
-- 020's per-person exceptions are folded in at the same time: a granted code
-- opens its box, a revoked code closes it.
-- Wrapped in a block because 022's profile_permissions table may or may not
-- exist -- that migration is optional history now, and this one has to work
-- either way.
DO $convert$
DECLARE
  v_had_overrides boolean := to_regclass('public.profile_permissions') IS NOT NULL;
  v_where         text;
  v_people        integer;
BEGIN
  IF to_regclass('public.profile_roles') IS NULL THEN
    RAISE NOTICE 'no role tables -- nothing to carry over';
    RETURN;
  END IF;

  -- A code somebody had personally revoked in 022 is not carried over. When
  -- 022 was never run there is nothing to exclude, so the clause is TRUE.
  v_where := CASE WHEN v_had_overrides THEN
    'NOT EXISTS (SELECT 1 FROM public.profile_permissions pp
                  WHERE pp.profile_id = pr.profile_id
                    AND pp.school_id  = pr.school_id
                    AND pp.code       = m.code
                    AND pp.effect     = ''revoke'')'
  ELSE 'true' END;

  -- Their role, section by section.
  EXECUTE format($q$
    INSERT INTO public.user_access
      (school_id, profile_id, section, can_view, can_write, can_delete, scope)
    SELECT pr.school_id, pr.profile_id, m.section,
           bool_or(m.verb = 'view'),
           bool_or(m.verb = 'write'),
           bool_or(m.verb = 'write'),
           CASE WHEN bool_and(m.scope = 'own') THEN 'own' ELSE 'all' END
      FROM public.profile_roles pr
      JOIN public.roles r          ON r.id = pr.role_id
      JOIN public.permission_map m ON r.permissions ? m.code
     WHERE %s
     GROUP BY pr.school_id, pr.profile_id, m.section
    ON CONFLICT (school_id, profile_id, section) DO NOTHING
  $q$, v_where);

  -- ...and anything 022 granted to one person only, which by definition
  -- their role did not have.
  IF v_had_overrides THEN
    EXECUTE $q$
      INSERT INTO public.user_access
        (school_id, profile_id, section, can_view, can_write, can_delete, scope)
      SELECT pp.school_id, pp.profile_id, m.section,
             bool_or(m.verb = 'view'),
             bool_or(m.verb = 'write'),
             bool_or(m.verb = 'write'),
             'all'
        FROM public.profile_permissions pp
        JOIN public.permission_map m ON m.code = pp.code
       WHERE pp.effect = 'grant'
       GROUP BY pp.school_id, pp.profile_id, m.section
      ON CONFLICT (school_id, profile_id, section) DO UPDATE
        SET can_view   = public.user_access.can_view   OR EXCLUDED.can_view,
            can_write  = public.user_access.can_write  OR EXCLUDED.can_write,
            can_delete = public.user_access.can_delete OR EXCLUDED.can_delete
    $q$;
  END IF;

  SELECT count(DISTINCT profile_id) INTO v_people FROM public.user_access;
  RAISE NOTICE 'carried % people across from their roles', v_people;
END
$convert$;


-- ----------------------------------------------------------------------------
-- 4. has_permission(), reading one person's sheet
-- ----------------------------------------------------------------------------
-- Same signature and same callers as it has had since the first migration.
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
    JOIN public.user_access ua
      ON ua.profile_id = p.id
     AND ua.school_id  = p.school_id
     AND ua.section    = m.section
    WHERE p.id = auth.uid()
      AND p.status = 'active'
      AND p.is_deleted = false
      -- what the school bought, still gated on the module in the code
      AND public.school_has_module(p.school_id, split_part(p_perm, '.', 1))
      -- a wide code needs a wide sheet; a narrow one is satisfied by either
      AND (m.scope = 'own' OR ua.scope = 'all')
      AND CASE m.verb
            WHEN 'view'   THEN ua.can_view
            WHEN 'write'  THEN ua.can_write
            WHEN 'delete' THEN ua.can_delete
          END
  );
$$;


-- ----------------------------------------------------------------------------
-- 5. Point the DELETE policies at the delete box
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
-- 6. Creating a login, and opening everything for one person
-- ----------------------------------------------------------------------------

-- Full access to every section. What the first administrator of a school
-- needs, and the one-click starting point in the user screen.
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

  -- Platform admins provisioning a school have no school of their own, so
  -- they are allowed through on is_platform_admin() instead.
  IF NOT (public.is_platform_admin()
          OR (v_school = public.current_school_id() AND public.has_permission('users.write'))) THEN
    RAISE EXCEPTION 'not allowed to manage users for this school'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO public.user_access (school_id, profile_id, section, can_view, can_write, can_delete, scope)
  SELECT v_school, p_profile, m.section,
         bool_or(m.verb = 'view'), bool_or(m.verb = 'write'), bool_or(m.verb = 'delete'), 'all'
    FROM public.permission_map m
   WHERE m.scope = 'all'
   GROUP BY m.section
  ON CONFLICT (school_id, profile_id, section) DO UPDATE
    SET can_view = true, can_write = EXCLUDED.can_write, can_delete = EXCLUDED.can_delete,
        scope = 'all', updated_at = now();
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.grant_full_access(uuid) TO authenticated;

-- Create a sign-in account from inside the app, instead of the SQL editor.
-- The new person starts with NO access at all; the admin then ticks their
-- sheet. That order is on purpose -- an account that exists but can reach
-- nothing is harmless, one created with everything open is not.
--
-- Writes to auth.users and auth.identities, which belong to Supabase Auth.
-- Unsupported but widely used, and the same thing seed_users.sql has always
-- done; the alternative is the dashboard.
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

-- Provisioning no longer seeds a role, because there are none. The first
-- account attached to the school gets a full sheet instead.
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

  RETURN v_school;
END;
$$;

-- Attaching somebody to a school, role-free. p_full_access decides whether
-- they start able to run the place or able to do nothing yet.
DROP FUNCTION IF EXISTS public.assign_user_to_school(uuid, uuid, text);
CREATE OR REPLACE FUNCTION public.assign_user_to_school(
  p_user        uuid,
  p_school      uuid,
  p_full_access boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_platform_admin()
          OR (p_school = public.current_school_id() AND public.has_permission('users.write'))) THEN
    RAISE EXCEPTION 'not allowed to manage users for this school'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.profiles
     SET school_id = p_school, status = 'active', updated_at = now()
   WHERE id = p_user;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no profile for user % -- they must sign up first', p_user;
  END IF;

  IF p_full_access THEN
    PERFORM public.grant_full_access(p_user);
  END IF;
END;
$$;


-- ----------------------------------------------------------------------------
-- 7. The role system goes
-- ----------------------------------------------------------------------------
-- Everything above has already been carried over, and has_permission() no
-- longer reads any of these. CASCADE is needed because profile_roles
-- references roles.
DROP TABLE IF EXISTS public.profile_permissions CASCADE;  -- 022, folded into user_access
DROP TABLE IF EXISTS public.profile_roles CASCADE;
DROP TABLE IF EXISTS public.roles CASCADE;

-- The seed helper that minted role assignments. seed_users.sql defines its
-- own replacement.
DROP FUNCTION IF EXISTS public.seed_school_user(text, text, text, text, text);


-- ============================================================================
-- 8. RESULT -- who can do what now
-- ============================================================================
SELECT p.email,
       count(*) FILTER (WHERE ua.can_view)                   AS sections_visible,
       count(*) FILTER (WHERE ua.can_write)                  AS can_write,
       count(*) FILTER (WHERE ua.can_delete)                 AS can_delete,
       count(*) FILTER (WHERE ua.scope = 'own')              AS own_sections_only,
       string_agg(ua.section, ', ' ORDER BY ua.section)
         FILTER (WHERE ua.can_view)                          AS visible
  FROM public.profiles p
  LEFT JOIN public.user_access ua ON ua.profile_id = p.id
 WHERE p.school_id IS NOT NULL
 GROUP BY p.email
 ORDER BY p.email;
