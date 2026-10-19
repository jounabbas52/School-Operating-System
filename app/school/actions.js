'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { ACTION_COLUMN, PAGE_BY_KEY, actionsFor } from '@/lib/access'

// These actions do not check permissions themselves. RLS does: the policies
// on profiles and user_page_access all require the relevant permission, so an
// unauthorised call comes back as an error or an empty update rather than
// succeeding. The checks below are for input validity, not authority.


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
  revalidatePath('/school/users/[id]', 'page')
}

export async function removeUser(formData) {
  const profileId = String(formData.get('profile_id'))

  const supabase = await createClient()
  const { data: schoolId } = await supabase.rpc('current_school_id')

  // Detach rather than delete: their auth account and any records they
  // created stay intact, they simply lose access. Deleting the profile would
  // cascade into audit history.
  //
  // The access sheet goes with them. Leaving it behind would silently restore
  // every box the day somebody added them back.
  const { error } = await supabase
    .from('user_page_access')
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
  revalidatePath('/school/users/[id]', 'page')
}

// Link a login to a staff record -- or unlink it.
//
// Access decides what somebody may DO; this says who they ARE in HR. The two
// are separate on purpose: a login with full access and no staff record is a
// perfectly good office account, and a staff record with no login is a
// perfectly good employee.
//
// staff.profile_id carries UNIQUE (school_id, profile_id), so a login belongs
// to at most one staff record. Any previous link for this person is cleared
// first rather than relying on the constraint to reject the second one.
export async function linkStaffAccount(formData) {
  const profileId = String(formData.get('profile_id'))
  const staffId = String(formData.get('staff_id') || '')

  const supabase = await createClient()
  const { data: schoolId } = await supabase.rpc('current_school_id')
  if (!schoolId) throw new Error('No active school.')

  // Detach whatever this login was attached to. Doubles as the unlink path
  // when staff_id arrives empty.
  const { error: clearError } = await supabase
    .from('staff')
    .update({ profile_id: null })
    .eq('school_id', schoolId)
    .eq('profile_id', profileId)

  if (clearError) throw new Error(clearError.message)

  if (staffId) {
    const { error } = await supabase
      .from('staff')
      .update({ profile_id: profileId })
      .eq('id', staffId)
      .eq('school_id', schoolId)

    if (error) {
      if (error.code === '23505') {
        throw new Error('That staff record is already linked to another login.')
      }
      if (error.code === '42501') {
        throw new Error('You do not have permission to change staff records.')
      }
      throw new Error(error.message)
    }
  }

  revalidatePath('/school/users')
  revalidatePath('/school/users/[id]', 'page')
  revalidatePath('/school/hr')
  revalidatePath('/school/teachers')
}

// Set somebody's password. The hash is written by admin_set_password() in the
// database, because auth.users is Supabase Auth's table and this app's key
// cannot write to it directly. Nothing here can READ a password: the column
// holds a one-way hash and there is no plaintext anywhere to show.
export async function setUserPassword(_prevState, formData) {
  const profileId = String(formData.get('profile_id') || '')
  const password = String(formData.get('password') || '')
  const confirm = String(formData.get('confirm') || '')

  if (password.length < 8) return { error: 'Use at least 8 characters.' }
  if (password !== confirm) return { error: 'The two passwords do not match.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('admin_set_password', {
    p_profile: profileId,
    p_password: password,
  })

  if (error) return { error: error.message }

  return {
    ok: 'Password set. Tell them in person — it is not emailed, and it cannot be read back here.',
  }
}

// ============================================================================
// ACCESS -- a list of pages, and what they may do on each (026)
// ============================================================================

// Save one person's whole list in one go.
//
// The screen posts one line per switch that is on, and this replaces
// everything that person had. Pages with nothing on write no row at all: no
// row and an all-false row mean the same thing, and keeping the table down to
// what somebody can actually do makes it readable by hand.
export async function saveUserAccess(_prevState, formData) {
  const profileId = String(formData.get('profile_id') || '')
  if (!profileId) return { error: 'No user.' }

  const supabase = await createClient()
  const { data: schoolId } = await supabase.rpc('current_school_id')
  if (!schoolId) return { error: 'No active school.' }

  // Nobody edits their own list. Ticking your own boxes is not access
  // control, and unticking the wrong one locks the school out of its own
  // user screen with no way back except the SQL editor.
  const { data: me } = await supabase.auth.getUser()
  if (me?.user?.id === profileId) {
    return { error: 'You cannot change your own access. Ask another administrator.' }
  }

  // The screen posts one `action:page` per switch that is on. A page or an
  // action this app does not have is dropped rather than stored: an unknown
  // row would grant nothing and sit in the table forever.
  const wanted = new Map()
  for (const raw of formData.getAll('grant')) {
    const [action, ...rest] = String(raw).split(':')
    const key = rest.join(':')
    const page = PAGE_BY_KEY[key]
    if (!page || !actionsFor(page).includes(action)) continue

    const row = wanted.get(key) ?? {
      school_id: schoolId,
      profile_id: profileId,
      page: key,
      section: page.section,
      can_view: false,
      can_edit: false,
      can_delete: false,
    }
    row[ACTION_COLUMN[action]] = true
    wanted.set(key, row)
  }

  // Being able to change something you cannot open is not a state worth
  // storing: every editor is reached through its own list.
  for (const row of wanted.values()) {
    if (row.can_edit || row.can_delete) row.can_view = true
  }

  const rows = [...wanted.values()]

  // Replace rather than merge: a switch turned off has to actually
  // disappear, and a merge would quietly leave yesterday's access in place.
  const { error: clearError } = await supabase
    .from('user_page_access')
    .delete()
    .eq('school_id', schoolId)
    .eq('profile_id', profileId)

  if (clearError) {
    if (clearError.code === '42501') return { error: 'You do not have permission to change access.' }
    return { error: clearError.message }
  }

  if (rows.length) {
    const { error } = await supabase.from('user_page_access').insert(rows)
    if (error) {
      if (error.code === '42501') return { error: 'You do not have permission to change access.' }
      return { error: error.message }
    }
  }

  revalidatePath('/school/users')
  revalidatePath('/school/users/[id]', 'page')
  revalidatePath('/school', 'layout')

  const visible = rows.filter((r) => r.can_view).length
  return {
    ok: visible
      ? `Saved — they can open ${visible} page${visible === 1 ? '' : 's'}.`
      : 'Saved — they can open nothing.',
  }
}

// Create a sign-in account from inside the app.
//
// The account starts with an empty sheet: it exists, it can sign in, and it
// can reach nothing until somebody ticks a box. That order is deliberate --
// an account that can reach nothing is harmless, one created wide open is
// not.
export async function createUser(_prevState, formData) {
  const email = String(formData.get('email') || '').trim().toLowerCase()
  const fullName = String(formData.get('full_name') || '').trim()
  const password = String(formData.get('password') || '')
  const confirm = String(formData.get('confirm') || '')

  if (!email) return { error: 'Enter an email address.' }
  if (!fullName) return { error: 'Enter their name.' }
  if (password.length < 8) return { error: 'Use at least 8 characters for the password.' }
  if (password !== confirm) return { error: 'The two passwords do not match.' }

  const supabase = await createClient()
  const { data: profileId, error } = await supabase.rpc('create_school_user', {
    p_email: email,
    p_password: password,
    p_full_name: fullName,
  })

  if (error) return { error: error.message }

  revalidatePath('/school/users')
  return {
    ok: `${email} can now sign in. They can reach nothing yet — open their Access sheet and tick what they may do.`,
    profileId,
  }
}

// Open every section for one person, in one click.
//
// What an administrator needs, and what a second administrator needs to be
// given. Staff are the other way round -- they start closed and are opened a
// section at a time -- so this is deliberately a separate, explicit action
// rather than a default anybody could acquire by accident.
export async function grantFullAccess(formData) {
  const profileId = String(formData.get('profile_id') || '')
  if (!profileId) throw new Error('No user.')

  const supabase = await createClient()
  const { error } = await supabase.rpc('grant_full_access', { p_profile: profileId })

  if (error) throw new Error(error.message)

  revalidatePath('/school/users')
  revalidatePath('/school/users/[id]', 'page')
  revalidatePath('/school', 'layout')
}

// A login's details -- their name, their phone, whether they may sign in.
//
// Not their access and not their password: those are their own screens,
// because they are their own kind of decision.
export async function updateUser(_prevState, formData) {
  const profileId = String(formData.get('profile_id') || '')
  const fullName = String(formData.get('full_name') || '').trim()
  const phone = String(formData.get('phone') || '').trim() || null
  const active = formData.get('active') === 'on'

  if (!profileId) return { error: 'No user.' }
  if (!fullName) return { error: 'Enter their name.' }

  const supabase = await createClient()

  // Suspending yourself is the one change nobody should be able to make by
  // accident; everything else about your own row is fair game.
  const { data: me } = await supabase.auth.getUser()
  if (me?.user?.id === profileId && !active) {
    return { error: 'You cannot suspend your own login.' }
  }

  const { error } = await supabase
    .from('profiles')
    .update({ full_name: fullName, phone, status: active ? 'active' : 'suspended' })
    .eq('id', profileId)

  if (error) {
    if (error.code === '42501') return { error: 'You do not have permission to edit users.' }
    return { error: error.message }
  }

  revalidatePath('/school/users')
  revalidatePath('/school/users/[id]', 'page')
  return { ok: 'Saved.' }
}
