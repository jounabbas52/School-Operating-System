'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// Authority is RLS. students carries the standard tenant policy set, so a
// caller without students.write gets an error or a zero-row update rather
// than a silent success. What follows is input shaping.

const PATHS = ['', '/register', '/promotion', '/old', '/reports', '/certificates', '/id-cards']

function revalidateAll() {
  for (const p of PATHS) revalidatePath(`/school/students${p}`)
}

function pgMessage(error, subject = 'student') {
  if (error.code === '23505') {
    if (error.message.includes('admission_number')) return 'That admission number is already used.'
    if (error.message.includes('serial')) return 'That serial number is already used.'
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

/* ============================================================ save student */

export async function saveStudent(_prev, formData) {
  const id = text(formData.get('id'))
  const firstName = text(formData.get('first_name'))
  const fatherName = text(formData.get('father_name'))
  const classId = text(formData.get('current_class_id'))
  const sectionId = text(formData.get('current_section_id'))

  if (!firstName) return { error: 'Enter the student name.' }
  if (!fatherName) return { error: "Enter the father's name." }
  if (!classId) return { error: 'Choose a class.' }
  if (!sectionId) return { error: 'Choose a section.' }

  const { supabase, schoolId } = await ctx()
  if (!schoolId) return { error: 'No active school.' }

  const { data: session } = await supabase
    .from('sessions')
    .select('id')
    .eq('school_id', schoolId)
    .eq('is_current', true)
    .maybeSingle()

  // The name arrives as one field, as in the design. Split on the last space
  // so "Muhammad Ahad Khan" keeps "Muhammad Ahad" together as the given name.
  const parts = firstName.split(/\s+/)
  const last = parts.length > 1 ? parts.pop() : null
  const first = parts.join(' ')

  const payload = {
    school_id: schoolId,
    first_name: first,
    last_name: last,
    father_name: fatherName,
    admission_number: text(formData.get('admission_number')),
    family_number: text(formData.get('family_number')),
    serial_number: num(formData.get('serial_number')),
    roll_number: text(formData.get('roll_number')),
    admission_date: text(formData.get('admission_date')),
    current_class_id: classId,
    current_section_id: sectionId,
    date_of_birth: text(formData.get('date_of_birth')),
    gender: text(formData.get('gender')),
    birth_place: text(formData.get('birth_place')),
    caste: text(formData.get('caste')),
    blood_group: text(formData.get('blood_group')),
    student_cnic: text(formData.get('student_cnic')),
    student_mobile: text(formData.get('student_mobile')),
    father_mobile: text(formData.get('father_mobile')),
    father_whatsapp: text(formData.get('father_whatsapp')),
    father_email: text(formData.get('father_email')),
    father_cnic: text(formData.get('father_cnic')),
    father_occupation: text(formData.get('father_occupation')),
    father_annual_income: num(formData.get('father_annual_income')),
    city: text(formData.get('city')),
    state: text(formData.get('state')),
    postal_code: text(formData.get('postal_code')),
    current_address: text(formData.get('current_address')),
    fee_plan: text(formData.get('fee_plan')) ?? 'monthly',
    base_fee: num(formData.get('base_fee')),
    starting_month: num(formData.get('starting_month')),
    discount_type: text(formData.get('discount_type')),
    discount_value: num(formData.get('discount_value')),
    discount_note: text(formData.get('discount_note')),
    status: text(formData.get('status')) ?? 'active',
    photo_url: text(formData.get('photo_url')),
  }

  if (!id) payload.session_id = session?.id ?? null

  let studentId = id

  if (id) {
    const { error } = await supabase.from('students').update(payload).eq('id', id)
    if (error) return { error: pgMessage(error) }
  } else {
    const { data, error } = await supabase.from('students').insert(payload).select('id').single()
    if (error) return { error: pgMessage(error) }
    studentId = data.id
  }

  // Keep the enrolment row for the active session in step with the student's
  // current class. This is what Promotion and Old Students read from.
  if (session?.id) {
    const { error } = await supabase.from('student_enrollments').upsert(
      {
        school_id: schoolId,
        student_id: studentId,
        session_id: session.id,
        class_id: classId,
        section_id: sectionId,
        roll_number: payload.roll_number,
        status: 'active',
      },
      { onConflict: 'school_id,student_id,session_id' }
    )
    if (error) return { error: pgMessage(error, 'enrolment') }
  }

  revalidateAll()
  return ok(id ? `${firstName} updated.` : `${firstName} admitted.`)
}

export async function deleteStudent(formData) {
  const id = String(formData.get('id'))
  const { supabase } = await ctx()

  // Soft delete. A student's marks, attendance and fee history all point at
  // this row; a hard delete would take the school's records with it.
  const { error } = await supabase
    .from('students')
    .update({ is_deleted: true, deleted_at: new Date().toISOString(), status: 'inactive' })
    .eq('id', id)

  if (error) throw new Error(pgMessage(error))
  revalidateAll()
}

export async function setStudentStatus(formData) {
  const id = String(formData.get('id'))
  const status = String(formData.get('status'))

  if (!['active', 'inactive', 'suspended', 'graduated', 'transferred'].includes(status)) {
    throw new Error('Unknown status.')
  }

  const { supabase } = await ctx()
  const { error } = await supabase.from('students').update({ status }).eq('id', id)
  if (error) throw new Error(pgMessage(error))
  revalidateAll()
}

/* ============================================================== promotion */

export async function applyPromotion(_prev, formData) {
  const fromSession = text(formData.get('from_session'))
  const toSession = text(formData.get('to_session'))
  const toClass = text(formData.get('to_class'))
  const toSection = text(formData.get('to_section'))

  if (!fromSession) return { error: 'Choose the session to promote from.' }
  if (!toSession) return { error: 'Choose the session to promote into.' }
  if (fromSession === toSession) return { error: 'Pick two different sessions.' }

  const { supabase, schoolId } = await ctx()
  if (!schoolId) return { error: 'No active school.' }

  // Rows arrive as student_id + the action chosen for that student.
  const ids = formData.getAll('student_id').map(String)
  const actions = formData.getAll('student_action').map(String)

  if (ids.length === 0) return { error: 'Select at least one student.' }

  const promoted = []
  let retained = 0
  let graduated = 0
  let transferred = 0

  for (let i = 0; i < ids.length; i++) {
    const studentId = ids[i]
    const action = actions[i] ?? 'promoted'

    // Close out the outgoing year.
    const { error: closeError } = await supabase
      .from('student_enrollments')
      .update({
        status: action,
        ended_on: new Date().toISOString().slice(0, 10),
        promoted_to_class_id: action === 'promoted' ? toClass : null,
        promoted_to_section_id: action === 'promoted' ? toSection : null,
      })
      .eq('school_id', schoolId)
      .eq('student_id', studentId)
      .eq('session_id', fromSession)

    if (closeError) return { error: pgMessage(closeError, 'enrolment') }

    if (action === 'promoted') {
      promoted.push(studentId)
    } else if (action === 'graduated') {
      graduated++
      await supabase.from('students').update({ status: 'graduated' }).eq('id', studentId)
    } else if (action === 'transferred') {
      transferred++
      await supabase.from('students').update({ status: 'transferred' }).eq('id', studentId)
    } else {
      retained++
    }
  }

  // Promoted students get an enrolment row in the new session and their
  // current class moves with them.
  if (promoted.length && toClass) {
    const { error } = await supabase.from('student_enrollments').upsert(
      promoted.map((studentId) => ({
        school_id: schoolId,
        student_id: studentId,
        session_id: toSession,
        class_id: toClass,
        section_id: toSection,
        status: 'active',
      })),
      { onConflict: 'school_id,student_id,session_id' }
    )
    if (error) return { error: pgMessage(error, 'enrolment') }

    const { error: moveError } = await supabase
      .from('students')
      .update({ current_class_id: toClass, current_section_id: toSection, session_id: toSession })
      .in('id', promoted)

    if (moveError) return { error: pgMessage(moveError) }
  }

  revalidateAll()

  const parts = [
    promoted.length ? `${promoted.length} promoted` : null,
    retained ? `${retained} retained` : null,
    graduated ? `${graduated} graduated` : null,
    transferred ? `${transferred} transferred` : null,
  ].filter(Boolean)

  return ok(parts.join(', ') || 'Nothing changed.')
}

/* =============================================================== settings */

export async function saveCertificateSettings(_prev, formData) {
  const { supabase, schoolId } = await ctx()
  if (!schoolId) return { error: 'No active school.' }

  const fields = {}
  for (const key of [
    'student_name',
    'father_name',
    'class',
    'roll_number',
    'admission_date',
    'issue_date',
  ]) {
    fields[key] = formData.get(`field_${key}`) === 'on'
  }

  const payload = {
    school_id: schoolId,
    school_name: text(formData.get('school_name')),
    school_address: text(formData.get('school_address')),
    contact_number: text(formData.get('contact_number')),
    email: text(formData.get('email')),
    title: text(formData.get('title')) ?? 'School Certificate',
    orientation: text(formData.get('orientation')) ?? 'portrait',
    body_text: text(formData.get('body_text')) ?? '',
    principal_name: text(formData.get('principal_name')),
    principal_label: text(formData.get('principal_label')) ?? 'Principal',
    signatory_name: text(formData.get('signatory_name')),
    signatory_label: text(formData.get('signatory_label')) ?? 'Authorized Signatory',
    logo_url: text(formData.get('logo_url')),
    background_url: text(formData.get('background_url')),
    principal_signature_url: text(formData.get('principal_signature_url')),
    signatory_signature_url: text(formData.get('signatory_signature_url')),
    fields,
  }

  const { error } = await supabase
    .from('certificate_settings')
    .upsert(payload, { onConflict: 'school_id' })

  if (error) return { error: pgMessage(error, 'setting') }

  revalidateAll()
  return ok('Certificate settings saved.')
}

export async function saveIdCardSettings(_prev, formData) {
  const { supabase, schoolId } = await ctx()
  if (!schoolId) return { error: 'No active school.' }

  const fields = {}
  for (const key of [
    'photo',
    'student_name',
    'father_name',
    'roll_number',
    'class',
    'section',
    'date_of_birth',
    'admission_number',
    'address',
    'gender',
    'status',
  ]) {
    fields[key] = formData.get(`field_${key}`) === 'on'
  }

  const payload = {
    school_id: schoolId,
    school_name: text(formData.get('school_name')),
    school_email: text(formData.get('school_email')),
    school_phone: text(formData.get('school_phone')),
    school_address: text(formData.get('school_address')),
    orientation: text(formData.get('orientation')) ?? 'vertical',
    card_width: num(formData.get('card_width')) ?? 208,
    card_height: num(formData.get('card_height')) ?? 340,
    header_from: text(formData.get('header_from')) ?? '#3b0764',
    header_to: text(formData.get('header_to')) ?? '#7c3aed',
    border_style: text(formData.get('border_style')) ?? 'solid',
    border_color: text(formData.get('border_color')) ?? '#e2e8f0',
    font_size: num(formData.get('font_size')) ?? 10,
    font_style: text(formData.get('font_style')) ?? 'sans',
    text_align: text(formData.get('text_align')) ?? 'center',
    text_color: text(formData.get('text_color')) ?? '#1e293b',
    principal_label: text(formData.get('principal_label')) ?? 'Principal',
    signatory_label: text(formData.get('signatory_label')) ?? 'Authorized Signatory',
    show_barcode: formData.get('show_barcode') === 'on',
    show_qr: formData.get('show_qr') === 'on',
    logo_url: text(formData.get('logo_url')),
    background_url: text(formData.get('background_url')),
    principal_signature_url: text(formData.get('principal_signature_url')),
    signatory_signature_url: text(formData.get('signatory_signature_url')),
    fields,
  }

  const { error } = await supabase
    .from('id_card_settings')
    .upsert(payload, { onConflict: 'school_id' })

  if (error) return { error: pgMessage(error, 'setting') }

  revalidateAll()
  return ok('ID card settings saved.')
}
