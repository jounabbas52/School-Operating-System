'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { ALL_PERMISSION_CODES } from '@/lib/permissions'

// These actions do not check permissions themselves. RLS does: the policies
// on profiles, profile_roles and roles all require the relevant permission,
// so an unauthorised call comes back as an error or an empty update rather
// than succeeding. The checks below are for input validity, not authority.


export async function setUserRole(formData) {
  const profileId = String(formData.get('profile_id'))
  const roleId = Number(formData.get('role_id'))

  const supabase = await createClient()
  const { data: schoolId } = await supabase.rpc('current_school_id')
  if (!schoolId) throw new Error('No active school.')

  // One role at a time from this screen: clear then set. profile_roles can
  // hold several, but a single-select UI that left stale rows behind would
  // silently keep granting the old permissions.
  const { error: clearError } = await supabase
    .from('profile_roles')
    .delete()
    .eq('profile_id', profileId)
    .eq('school_id', schoolId)

  if (clearError) throw new Error(clearError.message)

  const { error } = await supabase
    .from('profile_roles')
    .insert({ school_id: schoolId, profile_id: profileId, role_id: roleId })

  if (error) throw new Error(error.message)

  revalidatePath('/school/users')
}

export async function setUserStatus(formData) {
  const profileId = String(formData.get('profile_id'))
  const status = String(formData.get('status'))

  if (!['active', 'suspended', 'inactive'].includes(status)) {
    throw new Error('Unknown status.')
  }

  const supabase = await createClient()
  const { error } = await supabase.from('profiles').update({ status }).eq('id', profileId)

  if (error) throw new Error(error.message)

  revalidatePath('/school/users')
}

export async function removeUser(formData) {
  const profileId = String(formData.get('profile_id'))

  const supabase = await createClient()
  const { data: schoolId } = await supabase.rpc('current_school_id')

  // Detach rather than delete: their auth account and any records they
  // created stay intact, they simply lose access. Deleting the profile would
  // cascade into audit history.
  const { error } = await supabase
    .from('profile_roles')
    .delete()
    .eq('profile_id', profileId)
    .eq('school_id', schoolId)

  if (error) throw new Error(error.message)

  const { error: detachError } = await supabase
    .from('profiles')
    .update({ school_id: null, status: 'inactive' })
    .eq('id', profileId)

  if (detachError) throw new Error(detachError.message)

  revalidatePath('/school/users')
}

export async function saveRole(_prevState, formData) {
  const roleId = formData.get('role_id') ? Number(formData.get('role_id')) : null
  const name = String(formData.get('name') || '').trim().toLowerCase()
  const displayName = String(formData.get('display_name') || '').trim()
  const description = String(formData.get('description') || '').trim() || null
  const permissions = formData.getAll('permissions').map(String)

  if (!/^[a-z0-9_]{2,40}$/.test(name)) {
    return { error: 'Internal name must be 2-40 characters: lowercase letters, numbers, underscore.' }
  }
  if (!displayName) return { error: 'Enter a display name.' }

  // Guard against a code that is not in the catalogue. It would fail closed
  // anyway -- has_permission() would never match it -- but silently, which is
  // worse than an error here.
  const unknown = permissions.filter((code) => !ALL_PERMISSION_CODES.has(code))
  if (unknown.length) return { error: `Unknown permission: ${unknown.join(', ')}` }

  const supabase = await createClient()
  const { data: schoolId } = await supabase.rpc('current_school_id')
  if (!schoolId) return { error: 'No active school.' }

  const payload = {
    school_id: schoolId,
    name,
    display_name: displayName,
    description,
    permissions,
    is_system: false,
  }

  const { error } = roleId
    ? await supabase.from('roles').update(payload).eq('id', roleId)
    : await supabase.from('roles').insert(payload)

  if (error) {
    if (error.code === '23505') return { error: `A role named "${name}" already exists.` }
    return { error: error.message }
  }

  revalidatePath('/school/roles')
  revalidatePath('/school/users')
  return { ok: roleId ? 'Role updated.' : 'Role created.' }
}

export async function deleteRole(formData) {
  const roleId = Number(formData.get('role_id'))

  const supabase = await createClient()

  const { count } = await supabase
    .from('profile_roles')
    .select('*', { count: 'exact', head: true })
    .eq('role_id', roleId)

  if (count) {
    throw new Error(`That role is still assigned to ${count} user(s). Move them first.`)
  }

  const { error } = await supabase.from('roles').delete().eq('id', roleId)
  if (error) throw new Error(error.message)

  revalidatePath('/school/roles')
}
