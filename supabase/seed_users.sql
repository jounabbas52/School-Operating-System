-- ============================================================================
-- SEED USERS -- ONE PASTE, RUN THE WHOLE THING
-- ============================================================================
-- Select all of this file, paste into the Supabase SQL editor, press Run.
-- Do not run parts of it: the calls at the bottom depend on the functions
-- defined at the top.
--
-- Safe to run more than once. Existing emails and schools are reused.
--
-- Edit the emails and passwords in section 5 before running.
--
-- WHY THESE HELPERS EXIST
--   provision_school() and assign_user_to_school() in schema.sql both begin
--   with an is_platform_admin() check. In the SQL editor auth.uid() is NULL,
--   so those guards always fail -- correctly, since there is no logged-in
--   user to check. The seed_* functions below do the same work without the
--   guard, and section 6 deletes them again.
--
--   create_user_account writes to auth.users and auth.identities, which
--   belong to Supabase Auth rather than to your schema. That is unsupported
--   but widely used. The supported alternative is
--   Dashboard > Authentication > Users > Add user, with "Auto Confirm User"
--   ticked, followed only by section 5's role wiring.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Create the auth account
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_user_account(
  p_email     text,
  p_password  text,
  p_full_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $fn$
DECLARE
  v_id    uuid;
  v_email text := lower(trim(p_email));
  v_has_provider_id boolean;
BEGIN
  IF v_email IS NULL OR v_email = '' THEN
    RAISE EXCEPTION 'email is required';
  END IF;
  -- 6 is Supabase Auth's own default minimum.
  IF p_password IS NULL OR length(p_password) < 6 THEN
    RAISE EXCEPTION 'password must be at least 6 characters';
  END IF;

  SELECT id INTO v_id FROM auth.users WHERE lower(email) = v_email;
  IF v_id IS NOT NULL THEN
    RAISE NOTICE 'user % already exists (%)', v_email, v_id;
    RETURN v_id;
  END IF;

  v_id := gen_random_uuid();

  -- email_confirmed_at is set because this project has mailer_autoconfirm
  -- off; without it the account could never sign in.
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
    INSERT INTO auth.identities (
      user_id, provider_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    ) VALUES (
      v_id, v_id::text,
      jsonb_build_object('sub', v_id::text, 'email', v_email,
                         'email_verified', true, 'phone_verified', false),
      'email', now(), now(), now()
    );
  ELSE
    INSERT INTO auth.identities (
      id, user_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    ) VALUES (
      v_id::text, v_id,
      jsonb_build_object('sub', v_id::text, 'email', v_email,
                         'email_verified', true, 'phone_verified', false),
      'email', now(), now(), now()
    );
  END IF;

  UPDATE public.profiles
     SET full_name = COALESCE(p_full_name, full_name), email = v_email
   WHERE id = v_id;

  RAISE NOTICE 'created % (%)', v_email, v_id;
  RETURN v_id;
END;
$fn$;


-- ----------------------------------------------------------------------------
-- 1b. Reset the password of an account that already exists
-- ----------------------------------------------------------------------------
-- create_user_account is idempotent: it returns an existing account rather
-- than failing, which also means it does NOT change that account's password.
-- If you seeded an email that had already been created some other way, its
-- old password still applies -- use this to set a known one.
CREATE OR REPLACE FUNCTION public.set_user_password(
  p_email    text,
  p_password text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $fn$
DECLARE
  v_id    uuid;
  v_email text := lower(trim(p_email));
BEGIN
  IF p_password IS NULL OR length(p_password) < 6 THEN
    RAISE EXCEPTION 'password must be at least 6 characters';
  END IF;

  SELECT id INTO v_id FROM auth.users WHERE lower(email) = v_email;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'no account for %', v_email;
  END IF;

  UPDATE auth.users
     SET encrypted_password = crypt(p_password, gen_salt('bf')),
         email_confirmed_at = COALESCE(email_confirmed_at, now()),
         updated_at         = now()
   WHERE id = v_id;

  -- An account made through a route that never created an identity row
  -- cannot sign in with a password, however valid the hash is.
  IF NOT EXISTS (
    SELECT 1 FROM auth.identities WHERE user_id = v_id AND provider = 'email'
  ) THEN
    INSERT INTO auth.identities (
      user_id, provider_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    ) VALUES (
      v_id, v_id::text,
      jsonb_build_object('sub', v_id::text, 'email', v_email,
                         'email_verified', true, 'phone_verified', false),
      'email', now(), now(), now()
    );
    RAISE NOTICE 'added missing email identity for %', v_email;
  END IF;

  RAISE NOTICE 'password reset for % (%)', v_email, v_id;
  RETURN v_id;
END;
$fn$;


-- ----------------------------------------------------------------------------
-- 2. Account + platform (super admin) access
-- ----------------------------------------------------------------------------
-- p_role is text and cast below. A bare 'owner' literal against an enum
-- parameter arrives as "unknown", and failed overload resolution reports
-- "function does not exist" rather than a type error.
CREATE OR REPLACE FUNCTION public.seed_platform_user(
  p_email     text,
  p_password  text,
  p_full_name text DEFAULT NULL,
  p_role      text DEFAULT 'owner'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $fn$
DECLARE
  v_id uuid;
BEGIN
  v_id := public.create_user_account(p_email, p_password, p_full_name);

  INSERT INTO public.platform_admins (user_id, role, email)
  VALUES (v_id, p_role::public.platform_role, lower(trim(p_email)))
  ON CONFLICT (user_id) DO UPDATE
    SET role = EXCLUDED.role, email = EXCLUDED.email;

  RAISE NOTICE 'platform % -> %', p_role, p_email;
  RETURN v_id;
END;
$fn$;


-- ----------------------------------------------------------------------------
-- 3. A school, without the is_platform_admin() guard
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seed_school(
  p_school_name text,
  p_slug        text,
  p_plan_code   text DEFAULT 'complete',
  p_is_demo     boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_school uuid;
  v_plan   uuid;
BEGIN
  SELECT id INTO v_plan FROM public.plans WHERE code = p_plan_code;
  IF v_plan IS NULL THEN
    RAISE EXCEPTION 'unknown plan "%" -- did schema.sql finish?', p_plan_code;
  END IF;

  SELECT id INTO v_school FROM public.schools WHERE slug = p_slug;

  IF v_school IS NULL THEN
    INSERT INTO public.schools (school_name, slug, short_code, plan_id, is_demo)
    VALUES (p_school_name, p_slug, upper(left(p_slug, 8)), v_plan, p_is_demo)
    RETURNING id INTO v_school;
    RAISE NOTICE 'school % created (%)', p_school_name, v_school;
  ELSE
    RAISE NOTICE 'school "%" already exists (%)', p_slug, v_school;
  END IF;

  -- Switch on everything the plan includes.
  INSERT INTO public.school_modules (school_id, module_code)
  SELECT v_school, pm.module_code
  FROM public.plan_modules pm WHERE pm.plan_id = v_plan
  ON CONFLICT (school_id, module_code) DO UPDATE SET is_enabled = true;

  RETURN v_school;
END;
$fn$;


-- ----------------------------------------------------------------------------
-- 4. Account + a role at one school
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seed_school_user(
  p_email       text,
  p_password    text,
  p_full_name   text,
  p_school_slug text,
  p_role_name   text DEFAULT 'admin'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $fn$
DECLARE
  v_id     uuid;
  v_school uuid;
  v_role   bigint;
BEGIN
  SELECT id INTO v_school FROM public.schools WHERE slug = p_school_slug;
  IF v_school IS NULL THEN
    RAISE EXCEPTION 'no school with slug "%"', p_school_slug;
  END IF;

  -- Prefer a role the school defined itself over the shared system template.
  SELECT id INTO v_role
  FROM public.roles
  WHERE name = p_role_name AND (school_id = v_school OR school_id IS NULL)
  ORDER BY school_id NULLS LAST
  LIMIT 1;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'no role named "%"', p_role_name;
  END IF;

  v_id := public.create_user_account(p_email, p_password, p_full_name);

  UPDATE public.profiles
     SET school_id = v_school, status = 'active', updated_at = now()
   WHERE id = v_id;

  INSERT INTO public.profile_roles (school_id, profile_id, role_id)
  VALUES (v_school, v_id, v_role)
  ON CONFLICT (school_id, profile_id, role_id) DO NOTHING;

  RAISE NOTICE '% -> %/%', p_email, p_school_slug, p_role_name;
  RETURN v_id;
END;
$fn$;


-- Postgres grants EXECUTE to PUBLIC by default. Without these revokes any
-- signed-in user could call seed_platform_user() and make themselves owner
-- of the whole platform.
REVOKE EXECUTE ON FUNCTION public.create_user_account(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_user_password(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_platform_user(text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_school(text, text, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_school_user(text, text, text, text, text) FROM PUBLIC, anon, authenticated;


-- ============================================================================
-- 5. THE ACTUAL SEED -- edit the values, then it runs
-- ============================================================================
DO $seed$
BEGIN
  -- You. This account can provision schools, disable modules, suspend
  -- tenants and read across every school, so it is the most valuable
  -- credential in the system.
  --
  -- Set a real password in both calls below before running this, and do not
  -- commit the one you actually use -- this file is tracked, so anything
  -- written here ends up in the repository history permanently.
  PERFORM public.seed_platform_user(
    'jounabs52@gmail.com', 'CHANGE_ME_BEFORE_RUNNING', 'Owner', 'owner');

  -- seed_platform_user leaves an existing account's password alone, so force
  -- it to a known value. Comment this out if the account already has a
  -- password you want to keep.
  PERFORM public.set_user_password('jounabs52@gmail.com', 'CHANGE_ME_BEFORE_RUNNING');

  -- A school on the "complete" plan (every module switched on).
  PERFORM public.seed_school('Stars High School', 'demo', 'complete', true);

  -- Its staff. Roles: admin, principal, teacher, accountant,
  -- librarian, receptionist.
  PERFORM public.seed_school_user(
    'admin@demo.test',    'admin123',    'Demo Admin',      'demo', 'admin');
  PERFORM public.seed_school_user(
    'teacher@demo.test',  'teacher123',  'Demo Teacher',    'demo', 'teacher');
  PERFORM public.seed_school_user(
    'accounts@demo.test', 'accounts123', 'Demo Accountant', 'demo', 'accountant');
END
$seed$;


-- ============================================================================
-- 6. RESULT
-- ============================================================================
SELECT
  p.email,
  p.full_name,
  p.status,
  COALESCE(s.school_name, '— platform —') AS school,
  COALESCE(r.display_name, pa.role::text) AS role
FROM public.profiles p
LEFT JOIN public.schools s        ON s.id = p.school_id
LEFT JOIN public.profile_roles pr ON pr.profile_id = p.id
LEFT JOIN public.roles r          ON r.id = pr.role_id
LEFT JOIN public.platform_admins pa ON pa.user_id = p.id
ORDER BY pa.role IS NULL, p.created_at;


-- ============================================================================
-- 7. CLEAN UP -- run this once the users above exist
-- ============================================================================
-- A function that mints platform owners should not stay installed.
--
-- DROP FUNCTION IF EXISTS public.seed_school_user(text, text, text, text, text);
-- DROP FUNCTION IF EXISTS public.seed_school(text, text, text, boolean);
-- DROP FUNCTION IF EXISTS public.seed_platform_user(text, text, text, text);
-- DROP FUNCTION IF EXISTS public.set_user_password(text, text);
-- DROP FUNCTION IF EXISTS public.create_user_account(text, text, text);
