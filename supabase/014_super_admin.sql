-- ============================================================================
-- 014_SUPER_ADMIN.sql -- add one platform super admin
-- ============================================================================
-- Paste the whole file into the Supabase SQL editor and press Run.
--
-- Self-contained on purpose. seed_users.sql section 7 tells you to DROP its
-- helper functions once the first accounts exist, so this cannot assume
-- create_user_account() or seed_platform_user() are still installed. It does
-- the same work inline and leaves nothing behind.
--
-- Safe to run more than once. An existing account is reused and its password
-- reset to the value below, rather than erroring.
--
-- WHAT A PLATFORM ADMIN CAN DO
--   is_platform_admin() is a bare EXISTS against platform_admins, so ANY row
--   in that table grants the platform console -- the platform_role column
--   records intent, it does not currently restrict anything. This account
--   will read across every school, provision and suspend tenants, and toggle
--   module access. Treat it as root.
--
-- WHY auth.identities IS WRITTEN TOO
--   GoTrue rejects a password login when no identity row exists for the
--   provider, however valid the hash in auth.users is. Creating the user
--   alone produces an account that can never sign in.
--
-- THE SUPPORTED ALTERNATIVE
--   Writing to auth.users is unsupported (it belongs to Supabase Auth, not to
--   your schema) though widely used. If you would rather not: create the
--   account from Dashboard > Authentication > Users > Add user with "Auto
--   Confirm User" ticked, then run section 3 alone to grant it platform
--   access.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. The values
-- ----------------------------------------------------------------------------
-- Change the password here before running if this file has been shared.
DO $super$
DECLARE
  v_email    text := 'jounabs52@gmail.com';
  v_password text := 'Abc111272!';
  v_name     text := 'Joun Abbas';
  v_role     public.platform_role := 'super_admin';

  v_id       uuid;
  v_has_provider_id boolean;
BEGIN
  v_email := lower(trim(v_email));

  -- 6 is Supabase Auth's own floor; this one is well past it.
  IF length(v_password) < 6 THEN
    RAISE EXCEPTION 'password must be at least 6 characters';
  END IF;

  -- --------------------------------------------------------------------------
  -- 2. The auth account
  -- --------------------------------------------------------------------------
  SELECT id INTO v_id FROM auth.users WHERE lower(email) = v_email;

  IF v_id IS NULL THEN
    v_id := gen_random_uuid();

    -- email_confirmed_at is set explicitly: this project has
    -- mailer_autoconfirm off, and an unconfirmed account cannot sign in.
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_id, 'authenticated', 'authenticated', v_email,
      crypt(v_password, gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', v_name),
      now(), now(), '', '', '', ''
    );

    RAISE NOTICE 'created auth user % (%)', v_email, v_id;
  ELSE
    -- Already there: force the password to the value above rather than
    -- leaving whatever it had, which is the usual reason a re-run "works"
    -- but the new password does not.
    UPDATE auth.users
       SET encrypted_password = crypt(v_password, gen_salt('bf')),
           email_confirmed_at  = COALESCE(email_confirmed_at, now()),
           updated_at          = now()
     WHERE id = v_id;

    RAISE NOTICE 'auth user % already existed (%) -- password reset', v_email, v_id;
  END IF;

  -- The identity row. Column layout differs between GoTrue versions: newer
  -- ones have provider_id and a uuid id, older ones put the user id in id.
  IF NOT EXISTS (
    SELECT 1 FROM auth.identities WHERE user_id = v_id AND provider = 'email'
  ) THEN
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

    RAISE NOTICE 'email identity created';
  END IF;

  -- --------------------------------------------------------------------------
  -- 3. Profile and platform access
  -- --------------------------------------------------------------------------
  -- The on_auth_user_created trigger mirrors new auth users into profiles, so
  -- the row usually exists by now. This fills it in either way, and leaves
  -- school_id NULL -- that NULL is what marks someone as platform staff
  -- rather than a member of a school.
  INSERT INTO public.profiles (id, email, full_name, school_id, status)
  VALUES (v_id, v_email, v_name, NULL, 'active')
  ON CONFLICT (id) DO UPDATE
    SET email     = EXCLUDED.email,
        full_name = COALESCE(profiles.full_name, EXCLUDED.full_name),
        school_id = NULL,
        status    = 'active',
        is_deleted = false;

  INSERT INTO public.platform_admins (user_id, role, email)
  VALUES (v_id, v_role, v_email)
  ON CONFLICT (user_id) DO UPDATE
    SET role = EXCLUDED.role, email = EXCLUDED.email;

  RAISE NOTICE 'platform % granted to %', v_role, v_email;
END
$super$;


-- ============================================================================
-- 4. RESULT -- the new account should appear with role super_admin
-- ============================================================================
SELECT u.email,
       p.full_name,
       p.status,
       pa.role            AS platform_role,
       u.email_confirmed_at IS NOT NULL AS confirmed,
       EXISTS (
         SELECT 1 FROM auth.identities i
         WHERE i.user_id = u.id AND i.provider = 'email'
       )                  AS can_sign_in,
       p.school_id        AS school_id_should_be_null
FROM auth.users u
JOIN public.profiles p        ON p.id = u.id
JOIN public.platform_admins pa ON pa.user_id = u.id
WHERE lower(u.email) = 'jounabs52@gmail.com';


-- ============================================================================
-- 5. AFTERWARDS
-- ============================================================================
-- Sign in at /login. The root route reads platform_admins for your own
-- user_id and sends a match to /admin, so a successful sign-in landing on
-- /school instead means section 3 did not take.
--
-- Then change the password from the app or the dashboard, and remove the
-- literal from this file -- a working credential should not sit in the repo.
-- To revoke later:
--     DELETE FROM public.platform_admins WHERE email = 'jounabs52@gmail.com';
-- which drops console access while leaving the account able to sign in.
