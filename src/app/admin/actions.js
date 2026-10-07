'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

// Every action here calls a SECURITY DEFINER RPC that re-checks
// is_platform_admin() in the database. The UI guard in layout.js decides what
// to render; these RPCs decide what is allowed. Never rely on the former.

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}

export async function provisionSchool(_prevState, formData) {
  const schoolName = String(formData.get('school_name') || '').trim()
  const slug = String(formData.get('slug') || '').trim().toLowerCase()
  const planCode = String(formData.get('plan_code') || 'basic')
  const isDemo = formData.get('is_demo') === 'on'

  if (!schoolName) return { error: 'Enter a school name.' }
  if (!/^[a-z0-9-]{2,40}$/.test(slug)) {
    return { error: 'Slug must be 2-40 characters: lowercase letters, numbers or hyphens.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('provision_school', {
    p_school_name: schoolName,
    p_slug: slug,
    p_plan_code: planCode,
    p_is_demo: isDemo,
  })

  if (error) {
    if (error.code === '23505') return { error: `The slug "${slug}" is already taken.` }
    return { error: error.message }
  }

  revalidatePath('/admin')
  redirect(`/admin/schools/${data}`)
}

export async function toggleModule(formData) {
  const schoolId = String(formData.get('school_id'))
  const moduleCode = String(formData.get('module_code'))
  const enable = formData.get('enable') === 'true'

  const supabase = await createClient()
  const { error } = await supabase.rpc('set_school_module', {
    p_school: schoolId,
    p_module: moduleCode,
    p_enabled: enable,
    p_expires: null,
  })

  if (error) throw new Error(error.message)

  revalidatePath(`/admin/schools/${schoolId}`)
}

export async function applyPlan(formData) {
  const schoolId = String(formData.get('school_id'))
  const planCode = String(formData.get('plan_code'))

  const supabase = await createClient()
  const { error } = await supabase.rpc('apply_plan_to_school', {
    p_school: schoolId,
    p_plan_code: planCode,
  })

  if (error) throw new Error(error.message)

  revalidatePath(`/admin/schools/${schoolId}`)
}

export async function setSuspended(formData) {
  const schoolId = String(formData.get('school_id'))
  const suspend = formData.get('suspend') === 'true'
  const reason = String(formData.get('reason') || '').trim() || null

  const supabase = await createClient()
  // Direct update rather than an RPC: the schools_update policy already
  // restricts this to platform admins and the school's own settings writer.
  const { error } = await supabase
    .from('schools')
    .update({
      is_suspended: suspend,
      suspended_reason: suspend ? reason : null,
    })
    .eq('id', schoolId)

  if (error) throw new Error(error.message)

  revalidatePath(`/admin/schools/${schoolId}`)
  revalidatePath('/admin')
}

