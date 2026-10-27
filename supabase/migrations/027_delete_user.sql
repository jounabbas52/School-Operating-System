-- ============================================================================
-- 027_DELETE_USER.sql -- run after 026_simple_access.sql
-- ============================================================================
-- Paste the whole file into the SQL editor and Run. Idempotent.
--
-- WHAT THIS FIXES
--
-- Deleting a user from the Users screen failed halfway. It cleared their
-- access and then tried to detach the profile by setting school_id = NULL,
-- which the profiles_manage policy refuses:
--
--     WITH CHECK (... school_id = current_school_id() ...)
--
-- NULL is not current_school_id(), so the update was rejected -- after the
-- access rows were already gone. The person stayed in the list with nothing
-- left, which is the worst of both outcomes.
--
-- Detaching was the wrong idea anyway. "Delete this user" should delete the
-- user: the account goes, the login stops working, and the row leaves the
-- table. That is what delete_school_user() below does.
--
-- WHAT SURVIVES A DELETION, AND WHY
--
--   audit trail      kept, with the author blanked. A record of what was done
--                    is worth more than the name attached to it, and deleting
--                    history to tidy a user list is how you lose both.
--   staff record     kept, unlinked. Somebody leaving the system is not
--                    somebody leaving the payroll; HR decides that.
--   student record   kept, unlinked, for the same reason.
--   leave requests   kept, unlinked -- see section 1, which had to be fixed
--                    for that to be true.
--   notifications    deleted. A message addressed to nobody is not a record.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. A leave request is an HR record, not a login
-- ----------------------------------------------------------------------------
-- leave_requests.profile_id cascades on delete, so deleting a login would
-- take that person's leave history with it. The table carries staff_id as
-- well -- the leave belongs to the EMPLOYEE -- so the login reference should
-- blank rather than destroy, exactly as staff and students already do.
DO $leave$
DECLARE
  v_name text;
BEGIN
  SELECT c.conname INTO v_name
    FROM pg_constraint c
   WHERE c.contype = 'f'
     AND c.conrelid = 'public.leave_requests'::regclass
     AND c.confrelid = 'public.profiles'::regclass
     AND c.confdeltype = 'c';

  IF v_name IS NULL THEN
    RAISE NOTICE 'leave_requests already blanks the profile instead of cascading';
    RETURN;
  END IF;

  EXECUTE format('ALTER TABLE public.leave_requests DROP CONSTRAINT %I', v_name);
  EXECUTE format(
    'ALTER TABLE public.leave_requests
       ADD CONSTRAINT %I FOREIGN KEY (profile_id)
       REFERENCES public.profiles(id) ON DELETE SET NULL',
    v_name);

  RAISE NOTICE 'leave_requests.profile_id now blanks on delete';
END
$leave$;


-- ----------------------------------------------------------------------------
-- 2. Delete a user, properly
-- ----------------------------------------------------------------------------
-- Deletes the sign-in account; everything keyed to it follows the rules
-- above. SECURITY DEFINER because auth.users belongs to Supabase Auth and
-- this app's key cannot touch it -- so the guards here are the only thing
-- standing between a parameter and somebody else's account. Each one is
-- deliberate:
--
--   users.write     you may manage users at all
--   same school     and only in yours
--   not yourself    the one deletion with no way back for the person doing it
--   not an admin    administrators are not removed through a user screen
--   not platform    a platform administrator is above a school entirely
CREATE OR REPLACE FUNCTION public.delete_school_user(p_profile uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, auth
AS $fn$
DECLARE
  v_school uuid := public.current_school_id();
  v_email  text;
  v_admin  boolean;
BEGIN
  IF v_school IS NULL THEN
    RAISE EXCEPTION 'No active school.';
  END IF;

  IF NOT public.has_permission('users.write') THEN
    RAISE EXCEPTION 'You do not have permission to delete users.';
  END IF;

  IF p_profile = auth.uid() THEN
    RAISE EXCEPTION 'You cannot delete your own account.';
  END IF;

  SELECT p.email, p.is_school_admin INTO v_email, v_admin
    FROM public.profiles p
   WHERE p.id = p_profile AND p.school_id = v_school;

  IF v_email IS NULL THEN
    RAISE EXCEPTION 'That user is not in this school.';
  END IF;

  IF v_admin THEN
    RAISE EXCEPTION 'That account is an administrator. Administrators are not deleted from the user screen.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = p_profile) THEN
    RAISE EXCEPTION 'That account belongs to a platform administrator.';
  END IF;

  -- Said plainly in the trail before the actor can no longer be named.
  INSERT INTO public.audit_logs
    (school_id, actor_profile_id, action, target_table, target_id, before)
  VALUES
    (v_school, auth.uid(), 'delete', 'profiles', p_profile::text,
     jsonb_build_object('email', v_email, 'deleted_by_admin', true));

  -- Their access first, explicitly. The foreign keys would cascade anyway;
  -- doing it here means the rows are gone even if somebody later loosens one.
  DELETE FROM public.user_page_access   WHERE profile_id = p_profile;
  DELETE FROM public.user_module_access WHERE profile_id = p_profile;

  -- And the account itself. public.profiles.id references auth.users with
  -- ON DELETE CASCADE, so this is what removes them from the user list.
  DELETE FROM auth.users WHERE id = p_profile;

  IF NOT FOUND THEN
    -- No auth row: a profile left behind by some older path. Remove it
    -- directly so the screen does not keep showing a login that cannot be
    -- signed into.
    DELETE FROM public.profiles WHERE id = p_profile;
  END IF;

  RETURN format('%s deleted', v_email);
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.delete_school_user(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.delete_school_user(uuid) TO authenticated;


-- ============================================================================
-- 3. RESULT
-- ============================================================================
SELECT c.conrelid::regclass::text AS references_profiles,
       CASE c.confdeltype
         WHEN 'c' THEN 'deleted with the user'
         WHEN 'n' THEN 'kept, link blanked'
         ELSE c.confdeltype::text
       END AS on_delete
  FROM pg_constraint c
 WHERE c.contype = 'f'
   AND c.confrelid = 'public.profiles'::regclass
 ORDER BY 1;
