import { createClient } from '@/lib/supabase/server'
import { DEFAULT_APPEARANCE } from '@/lib/appearance'

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
  const [{ data: schoolId }, { data: profile }] = await Promise.all([
    supabase.rpc('current_school_id'),
    supabase
      .from('profiles')
      .select('id, full_name, email, status, school_id, profile_roles(roles(id, name, display_name, permissions))')
      .eq('id', user.id)
      .maybeSingle(),
  ])

  if (!schoolId) {
    return {
      user,
      profile,
      schoolId: null,
      school: null,
      permissions: new Set(),
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

  // A person may hold several roles; their permissions union.
  const permissions = new Set()
  for (const link of profile?.profile_roles ?? []) {
    for (const code of link.roles?.permissions ?? []) permissions.add(code)
  }

  return {
    user,
    profile,
    schoolId,
    school,
    permissions,
    modules: modules ?? [],
    appearance,
    supabase,
  }
}
