import { createClient } from '@/lib/supabase/server'
import { DEFAULT_APPEARANCE } from '@/lib/appearance'
import { accessFrom, adminAccess } from '@/lib/access'

// Everything a school-side page needs about the caller, in one round trip
// each. The permission set here is for RENDERING only -- hiding a button the
// user cannot use. RLS is what actually stops them, so never treat this as
// the security boundary.
export async function getSchoolContext() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { user: null }

  // current_school_id() returns null for a suspended user, a soft-deleted
  // one, or a school the platform has switched off -- so reading school_id
  // through this RPC gives the same answer RLS will give.
  const [{ data: schoolId }, { data: profile }, { data: access }, { data: modules_ }] =
    await Promise.all([
      supabase.rpc('current_school_id'),
      supabase
        .from('profiles')
        .select('id, full_name, email, status, school_id, is_school_admin')
        .eq('id', user.id)
        .maybeSingle(),
      // This person's own access. There are no roles: these two lists ARE
      // their permissions. Both are readable by everybody for themselves,
      // precisely so the sidebar can be built from them.
      //
      // Rule 2, per page: view / edit / delete.
      supabase
        .from('user_page_access')
        .select('page, section, can_view, can_edit, can_delete')
        .eq('profile_id', user.id),
      // Rule 1, per module: the sidebar group, on or off.
      supabase.from('user_module_access').select('module, enabled').eq('profile_id', user.id),
    ])

  if (!schoolId) {
    return {
      user,
      profile,
      schoolId: null,
      school: null,
      permissions: new Set(),
      pages: new Map(),
      isAdmin: false,
      modules: [],
      appearance: DEFAULT_APPEARANCE,
    }
  }

  // The appearance block rides along here rather than being fetched per page:
  // the layout needs it on every render to emit the palette, and so does any
  // page formatting a date. One row, already inside a parallel batch.
  const [{ data: school }, { data: modules }, { data: appearanceRow }] = await Promise.all([
    supabase.from('schools').select('id, school_name, slug, logo_url').eq('id', schoolId).maybeSingle(),
    supabase.rpc('school_enabled_modules', { p_school: schoolId }),
    supabase
      .from('settings')
      .select('value')
      .eq('school_id', schoolId)
      .eq('key', 'appearance')
      .maybeSingle(),
  ])

  // A school that has never opened the Appearance tab has no row at all, and a
  // row saved before a field existed is missing that key -- so defaults fill
  // in per key, not just when the whole block is absent.
  const appearance = { ...DEFAULT_APPEARANCE, ...(appearanceRow?.value ?? {}) }

  // The two lists, turned into the two things the app asks for: what each
  // PAGE lets them do (the sidebar, and the Add / Save / Delete buttons on
  // the screen itself) and the flat code set every existing check speaks in.
  // A page under a switched-off module is dropped by accessFrom, exactly as
  // has_permission() drops it in the database -- so what is drawn and what is
  // allowed cannot drift apart.
  // THE ADMINISTRATOR IS OUTSIDE THE TWO RULES.
  //
  // Not "a user with every switch on" -- a user with no switches at all,
  // because they are the person who sets everybody else's. Their access does
  // not depend on a table that could be empty, stale, or not yet created, and
  // has_permission() short-circuits on the same flag in the database.
  //
  // This is also the belt and braces for the access system itself: the screen
  // that fixes a mistake can never be the screen the mistake took away.
  const isAdmin = Boolean(profile?.is_school_admin)

  const { pages, permissions } = isAdmin ? adminAccess() : accessFrom(access, modules_)

  return {
    user,
    profile,
    schoolId,
    school,
    permissions,
    pages,
    isAdmin,
    access: access ?? [],
    userModules: modules_ ?? [],
    modules: modules ?? [],
    appearance,
    supabase,
  }
}
