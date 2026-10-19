-- ============================================================================
-- 022_PERSON_ACCESS.sql -- run after 021_seed_users.sql
-- ============================================================================
-- Paste the whole file into the SQL editor and Run. Idempotent.
--
-- WHAT THIS DOES
--
-- Access stops being role-only. A role is still the starting point -- it is
-- how you say "a teacher" once instead of forty times -- but on top of it
-- each PERSON may now carry their own exceptions:
--
--   grant   this one person gets a permission their role does not have
--   revoke  this one person loses a permission their role does have
--
-- So "Sara is a Teacher, but she also keeps the library" is one extra row,
-- not a second role nobody else will ever hold. And "Imran is an Accountant,
-- but must not see payroll" is one row as well, rather than a cut-down copy
-- of the Accountant role that then has to be maintained in parallel forever.
--
-- WHY IT HAS TO BE IN THE DATABASE
--
-- has_permission() is what every RLS policy calls. A per-person layer that
-- lived only in the app would change which buttons render and nothing about
-- which rows the database hands out -- which is not access control, it is
-- decoration. So the override is read inside has_permission() itself, and
-- every policy in the schema picks it up with no further change.
--
-- PRECEDENCE
--
--   revoke  beats everything. A revoked code is denied even if the role
--           grants it, because the narrower, more deliberate statement should
--           win over the broad one.
--   grant   adds to whatever the role gives.
--   module  gate still applies to both. A permission for a module the school
--           does not have grants nothing, however it was given.
--
-- ALSO HERE
--
--   admin_set_password()  lets a school admin set a staff password from the
--                         app, instead of the Supabase dashboard.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. The exceptions table
-- ----------------------------------------------------------------------------
-- One row per person per permission code. UNIQUE on (school_id, profile_id,
-- code) means a code is either granted or revoked for somebody, never both,
-- so there is no precedence puzzle to resolve at read time.
CREATE TABLE IF NOT EXISTS public.profile_permissions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  code       text NOT NULL,
  effect     text NOT NULL DEFAULT 'grant' CHECK (effect IN ('grant', 'revoke')),
  note       text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, profile_id, code)
);

CREATE INDEX IF NOT EXISTS idx_profile_permissions_person
  ON public.profile_permissions (school_id, profile_id);

-- Reading somebody's exceptions is reading their access, so it rides with
-- users.read. Writing them is handing out permissions, which is exactly what
-- editing a role is, so it rides with users.roles.write.
SELECT public.apply_tenant_rls('profile_permissions', 'users.read', 'users.roles.write');

SELECT public.add_touch_trigger('profile_permissions');
SELECT public.add_audit_trigger('profile_permissions');

-- One addition on top of the standard policies: everybody may read their OWN
-- rows. Without this a teacher could hold an extra permission and their own
-- sidebar would not know about it -- the app builds that menu from what it
-- can read, and users.read is precisely what a teacher does not have.
DO $$
BEGIN
  CREATE POLICY profile_permissions_select_own ON public.profile_permissions
    FOR SELECT TO authenticated
    USING (profile_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;


-- ----------------------------------------------------------------------------
-- 2. has_permission(), with the person layer
-- ----------------------------------------------------------------------------
-- Same signature, same callers, same SECURITY DEFINER reasoning as before:
-- it is called from inside policies, so it must not re-enter their RLS.
--
-- Reading profile_permissions here with the definer's rights is safe for the
-- same reason the rest of the file is: the lookup is pinned to auth.uid() and
-- takes no parameter that could widen it.
CREATE OR REPLACE FUNCTION public.has_permission(p_perm text)
RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.status = 'active'
      AND p.is_deleted = false
      AND public.school_has_module(p.school_id, split_part(p_perm, '.', 1))
      -- revoke wins, and is checked first for exactly that reason
      AND NOT EXISTS (
        SELECT 1 FROM public.profile_permissions pp
         WHERE pp.profile_id = p.id
           AND pp.school_id  = p.school_id
           AND pp.code       = p_perm
           AND pp.effect     = 'revoke'
      )
      AND (
        EXISTS (
          SELECT 1
          FROM public.profile_roles pr
          JOIN public.roles r ON r.id = pr.role_id
          WHERE pr.profile_id = p.id
            AND r.permissions ? p_perm
        )
        OR EXISTS (
          SELECT 1 FROM public.profile_permissions pp
           WHERE pp.profile_id = p.id
             AND pp.school_id  = p.school_id
             AND pp.code       = p_perm
             AND pp.effect     = 'grant'
        )
      )
  );
$$;


-- ----------------------------------------------------------------------------
-- 3. Setting somebody's password from the app
-- ----------------------------------------------------------------------------
-- auth.users is Supabase Auth's table, not yours, and the anon key cannot
-- touch it. This is the supported-enough middle ground: a definer function
-- that writes the same bcrypt hash GoTrue would write, behind the same
-- permission the rest of user management uses.
--
-- What it still cannot do is SHOW a password. There is nothing to show -- the
-- column holds a one-way hash.
--
-- Note: existing sessions survive a password change. Supabase does not
-- invalidate refresh tokens on a password write, so somebody already signed
-- in stays signed in until their session expires.
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


-- ============================================================================
-- 4. RESULT
-- ============================================================================
SELECT p.email,
       COALESCE(r.display_name, '— no role —') AS role,
       count(pp.id) FILTER (WHERE pp.effect = 'grant')  AS extra_permissions,
       count(pp.id) FILTER (WHERE pp.effect = 'revoke') AS removed_permissions
  FROM public.profiles p
  LEFT JOIN public.profile_roles pr       ON pr.profile_id = p.id
  LEFT JOIN public.roles r                ON r.id = pr.role_id
  LEFT JOIN public.profile_permissions pp ON pp.profile_id = p.id
 WHERE p.school_id IS NOT NULL
 GROUP BY p.email, r.display_name
 ORDER BY p.email;
