-- ============================================================================
-- 024_ADMIN_ACCESS.sql -- run after 023_user_access.sql
-- ============================================================================
-- Paste the whole file into the SQL editor and Run. Idempotent, and safe to
-- run as many times as you like.
--
-- WHAT THIS IS FOR
--
-- An administrator must never end up with nothing. Staff start closed and are
-- opened up one section at a time -- that is the point of the new system --
-- but the person who hands out that access has to be able to reach the screen
-- where they do it.
--
-- This file:
--
--   1. refuses to run if 023 did not finish, and says so in plain words
--   2. gives every school's administrator a full sheet, if they lost it
--   3. leaves seed_full_access('email') installed, so you can open somebody
--      up completely from here whenever you need to
--
-- WHO COUNTS AS THE ADMINISTRATOR
--
-- There are no roles any more, so there is no row saying "this one is the
-- admin". The rule used here is: if a school has NOBODY who can manage users,
-- the oldest account in that school becomes its administrator. That is the
-- account that was created first -- the one the school was set up with.
--
-- A school that already has a working administrator is left completely alone.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Did 023 actually finish?
-- ----------------------------------------------------------------------------
-- The Supabase SQL editor runs a whole file in one transaction, so a failure
-- anywhere in 023 rolled back ALL of it -- including the tables. The symptom
-- in the app is every single person showing "nothing yet" and a sidebar with
-- only Dashboard on it, which is exactly what no access looks like.
DO $check$
BEGIN
  IF to_regclass('public.user_access') IS NULL THEN
    RAISE EXCEPTION
      '023_user_access.sql has not been run (or it failed and rolled back). Run that file first, and if it reports an error, send the error -- nothing here can work without the user_access table.';
  END IF;

  IF to_regclass('public.permission_map') IS NULL THEN
    RAISE EXCEPTION
      'permission_map is missing, so 023 did not finish. Run 023_user_access.sql again and read the error it gives.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.permission_map) THEN
    RAISE EXCEPTION
      'permission_map is empty, so 023 did not finish. Run 023_user_access.sql again.';
  END IF;
END
$check$;


-- ----------------------------------------------------------------------------
-- 2. Open somebody up completely, by email
-- ----------------------------------------------------------------------------
-- The app's grant_full_access() checks that the CALLER may manage users. In
-- the SQL editor there is no caller -- auth.uid() is NULL -- so that check can
-- never pass, which is correct of it and useless here. This is the editor's
-- version: no guard, because sitting at the SQL editor is the guard.
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
    RAISE EXCEPTION '% is not attached to a school -- platform staff do not use access sheets', p_email;
  END IF;

  INSERT INTO public.user_access
    (school_id, profile_id, section, can_view, can_write, can_delete, scope)
  SELECT v_school, v_id, m.section,
         true, true, true, 'all'
    FROM public.permission_map m
   WHERE m.scope = 'all'
   GROUP BY m.section
  ON CONFLICT (school_id, profile_id, section) DO UPDATE
    SET can_view = true, can_write = true, can_delete = true,
        scope = 'all', updated_at = now();

  SELECT count(*) INTO v_count FROM public.user_access WHERE profile_id = v_id;

  -- An administrator who cannot sign in is not an administrator.
  UPDATE public.profiles
     SET status = 'active', is_deleted = false, updated_at = now()
   WHERE id = v_id;

  RETURN format('%s now has all %s sections', p_email, v_count);
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.seed_full_access(text) FROM PUBLIC, anon, authenticated;


-- ----------------------------------------------------------------------------
-- 3. Every school gets its administrator back
-- ----------------------------------------------------------------------------
-- Only schools that currently have nobody able to manage users. If somebody
-- there can already reach Users & Access, this does nothing -- it will not
-- quietly hand a second person the keys.
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
         FROM public.user_access ua
         JOIN public.profiles p ON p.id = ua.profile_id
        WHERE ua.school_id = s.id
          AND ua.section   = 'users'
          AND ua.can_write
          AND p.status = 'active'
          AND p.is_deleted = false
     )
  LOOP
    -- The oldest account in the school: whoever it was set up with.
    SELECT p.email INTO v_email
      FROM public.profiles p
     WHERE p.school_id = r.id
       AND p.is_deleted = false
     ORDER BY p.created_at
     LIMIT 1;

    IF v_email IS NULL THEN
      RAISE NOTICE '% has no accounts at all -- nothing to restore', r.school_name;
      CONTINUE;
    END IF;

    PERFORM public.seed_full_access(v_email);
    v_fixed := v_fixed + 1;
    RAISE NOTICE '% -> administrator of %', v_email, r.school_name;
  END LOOP;

  IF v_fixed = 0 THEN
    RAISE NOTICE 'every school already had a working administrator -- nothing changed';
  END IF;
END
$bootstrap$;


-- ============================================================================
-- 4. RESULT -- who can open what
-- ============================================================================
-- The administrator should show every section. Staff should show only what
-- they have been given, which for a brand-new account is nothing at all --
-- that is correct, and the Access button on their row is where it changes.
SELECT p.email,
       s.school_name,
       count(*) FILTER (WHERE ua.can_view)       AS can_see,
       count(*) FILTER (WHERE ua.can_write)      AS can_edit,
       count(*) FILTER (WHERE ua.can_delete)     AS can_delete,
       count(*) FILTER (WHERE ua.scope = 'own')  AS own_only,
       CASE
         WHEN count(*) FILTER (WHERE ua.section = 'users' AND ua.can_write) > 0
           THEN 'administrator'
         WHEN count(*) FILTER (WHERE ua.can_view) = 0
           THEN 'no access yet'
         ELSE 'staff'
       END AS kind
  FROM public.profiles p
  JOIN public.schools s           ON s.id = p.school_id
  LEFT JOIN public.user_access ua ON ua.profile_id = p.id
 WHERE p.is_deleted = false
 GROUP BY p.email, s.school_name, p.created_at
 ORDER BY s.school_name, p.created_at;
