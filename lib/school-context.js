import { createClient } from '@/lib/supabase/server'
import { DEFAULT_APPEARANCE } from '@/lib/appearance'
import { accessFrom } from '@/lib/access'

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
  const [{ data: schoolId }, { data: profile }, { data: access }] = await Promise.all([
    supabase.rpc('current_school_id'),
    supabase
      .from('profiles')
      .select('id, full_name, email, status, school_id')
      .eq('id', user.id)
      .maybeSingle(),
    // This person's own access sheet (021). There are no roles: these rows
    // ARE their permissions. Readable by everybody for themselves, precisely
    // so the sidebar can be built from it.
    supabase
      .from('user_page_access')
      .select('page, section, can_view, can_edit, can_delete')
      .eq('profile_id', user.id),
  ])

  if (!schoolId) {
    return {
      user,
      profile,
      schoolId: null,
      school: null,
      permissions: new Set(),
      pages: new Map(),
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

  // Their sheet, turned into the two things the app asks for: what each PAGE
  // lets them do (the sidebar, and the Add / Edit / Delete buttons on the
  // screen itself) and the flat code set every existing check speaks in.
  // has_permission() rolls the same rows up the same way in the database, so
  // what is drawn and what is allowed cannot drift apart.
  const { pages, permissions } = accessFrom(access)

  return {
    user,
    profile,
    schoolId,
    school,
    permissions,
    pages,
    access: access ?? [],
    modules: modules ?? [],
    appearance,
    supabase,
  }
}
