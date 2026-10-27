'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// Authority is RLS. staff carries the standard tenant policy set, so a caller
// without staff.write gets an error or a zero-row update rather than a silent
// success. What follows is input shaping.

function revalidateAll() {
  revalidatePath('/school/teachers')
  // Class subjects name a teacher, so a rename or a removal shows up there.
  revalidatePath('/school/academics/subjects')
  revalidatePath('/school')
}

function pgMessage(error, subject = 'teacher') {
  if (error.code === '23505') {
    if (error.message.includes('staff_number')) return 'That teacher ID is already used.'
    if (error.message.includes('name')) return 'That designation already exists.'
    return `That ${subject} already exists.`
  }
  if (error.code === '42501') return `You do not have permission to change ${subject}s.`
  if (error.code === '23503') return 'A linked record no longer exists. Reload and try again.'
  return error.message
}

async function ctx() {
  const supabase = await createClient()
  const { data: schoolId } = await supabase.rpc('current_school_id')
  return { supabase, schoolId }
}

const text = (v) => {
  const s = String(v ?? '').trim()
  return s === '' ? null : s
}
const num = (v) => {
  const s = String(v ?? '').trim()
  if (s === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}
const ok = (message) => ({ ok: message, at: Date.now() })

const STATUSES = [
  'active',
  'inactive',
  'suspended',
  'on_leave',
  'resigned',
  'terminated',
]

/* ============================================================ save teacher */

export async function saveTeacher(_prev, formData) {
  const id = text(formData.get('id'))
  const name = text(formData.get('full_name'))
  const subjectId = text(formData.get('subject_id'))
  const phone = text(formData.get('phone'))
  const email = text(formData.get('work_email'))
  const hireDate = text(formData.get('hire_date'))
  const salary = num(formData.get('monthly_salary'))

  if (!name) return { error: 'Enter the teacher name.' }
  if (!subjectId) return { error: 'Choose a subject specialization.' }
  if (!phone) return { error: 'Enter a phone number.' }
  if (!email) return { error: 'Enter an email address.' }
  if (!hireDate) return { error: 'Choose a joining date.' }
  if (salary === null) return { error: 'Enter a monthly salary.' }
  if (salary < 0) return { error: 'Monthly salary cannot be negative.' }

  const status = text(formData.get('status')) ?? 'active'
  if (!STATUSES.includes(status)) return { error: 'Unknown status.' }

  const { supabase, schoolId } = await ctx()
  if (!schoolId) return { error: 'No active school.' }

  // "Add designation" in the combobox: create the salary structure first, then
  // carry on as if it had been picked. Keeping it in one action means a failed
  // teacher insert cannot leave an orphan pay grade behind a closed panel.
  let salaryStructureId = text(formData.get('salary_structure_id'))
  // staff.designation is the printable title -- payslips and the directory
  // read it without joining. It is kept in step with the chosen structure
  // rather than typed separately, so the two can never disagree.
  let designation = null
  const newDesignation = text(formData.get('new_designation'))

  if (!salaryStructureId && newDesignation) {
    const { data: existing } = await supabase
      .from('salary_structures')
      .select('id')
      .eq('school_id', schoolId)
      .eq('is_deleted', false)
      .ilike('name', newDesignation)
      .maybeSingle()

    if (existing) {
      salaryStructureId = existing.id
    } else {
      const { data, error } = await supabase
        .from('salary_structures')
        .insert({ school_id: schoolId, name: newDesignation, basic_salary: salary })
        .select('id')
        .single()
      if (error) return { error: pgMessage(error, 'designation') }
      salaryStructureId = data.id
    }
    designation = newDesignation
  } else if (salaryStructureId) {
    const { data } = await supabase
      .from('salary_structures')
      .select('name')
      .eq('id', salaryStructureId)
      .maybeSingle()
    designation = data?.name ?? null
  }

  // The name arrives as one field, as on the form. Split on the last space so
  // "Muhammad Ahad Khan" keeps "Muhammad Ahad" together as the given name.
  const parts = name.split(/\s+/)
  const last = parts.length > 1 ? parts.pop() : null
  const first = parts.join(' ')

  const payload = {
    school_id: schoolId,
    staff_type: 'teaching',
    first_name: first,
    last_name: last,
    staff_number: text(formData.get('staff_number')),
    subject_id: subjectId,
    qualification: text(formData.get('qualification')),
    salary_structure_id: salaryStructureId,
    designation,
    department: text(formData.get('department')),
    employment_type: text(formData.get('employment_type')) ?? 'full_time',
    monthly_salary: salary,
    hire_date: hireDate,
    phone,
    work_phone: text(formData.get('work_phone')),
    emergency_contact: text(formData.get('emergency_contact')),
    work_email: email,
    cnic: text(formData.get('cnic')),
    gender: text(formData.get('gender')),
    date_of_birth: text(formData.get('date_of_birth')),
    blood_group: text(formData.get('blood_group')),
    experience_years: num(formData.get('experience_years')),
    address: text(formData.get('address')),
    notes: text(formData.get('notes')),
    status,
    photo_url: text(formData.get('photo_url')),
    // Used on anything this teacher signs -- a date sheet, a result card.
    signature_url: text(formData.get('signature_url')),
    stamp_url: text(formData.get('stamp_url')),
  }

  if (id) {
    const { error } = await supabase.from('staff').update(payload).eq('id', id)
    if (error) return { error: pgMessage(error) }
  } else {
    const { error } = await supabase.from('staff').insert(payload)
    if (error) return { error: pgMessage(error) }
  }

  revalidateAll()
  return ok(id ? `${name} updated.` : `${name} added.`)
}

export async function deleteTeacher(formData) {
  const id = String(formData.get('id'))
  const { supabase } = await ctx()

  // Soft delete. Attendance, payroll items and salary payments all point at
  // this row; a hard delete would take the school's pay records with it.
  const { error } = await supabase
    .from('staff')
    .update({ is_deleted: true, deleted_at: new Date().toISOString(), status: 'inactive' })
    .eq('id', id)

  if (error) throw new Error(pgMessage(error))
  revalidateAll()
}

export async function setTeacherStatus(formData) {
  const id = String(formData.get('id'))
  const status = String(formData.get('status'))

  if (!STATUSES.includes(status)) throw new Error('Unknown status.')

  const { supabase } = await ctx()
  const { error } = await supabase.from('staff').update({ status }).eq('id', id)
  if (error) throw new Error(pgMessage(error))
  revalidateAll()
}
