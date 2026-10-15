'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { dayFromDate } from '@/lib/exam-options'

// Authority is RLS. datesheets, datesheet_groups and exam_slips all carry the
// standard tenant policy set against exams.read / exams.write, so a caller
// without the permission gets an error or a zero-row update rather than a
// silent success. What follows is input shaping.

const BASE = '/school/datesheet'

function revalidateAll() {
  revalidatePath(BASE)
  revalidatePath(`${BASE}/slips`)
  revalidatePath('/school/exams')
  revalidatePath('/school')
}

function pgMessage(error, subject = 'entry') {
  if (error.code === '23505') {
    if (error.message.includes('name')) return 'A date sheet with that name already exists.'
    if (error.message.includes('student')) return 'That student already has a slip for this date sheet.'
    return `That ${subject} already exists.`
  }
  if (error.code === '42501') return `You do not have permission to change ${subject}s.`
  if (error.code === '23503') return 'A linked record no longer exists. Reload and try again.'
  if (error.code === '23514') return 'Some values are out of range. Check the dates and times.'
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
const bool = (v) => v === 'on' || v === 'true' || v === true
const ok = (message) => ({ ok: message, at: Date.now() })

/* ========================================================== schedule entry */

export async function saveEntry(_prev, formData) {
  const id = text(formData.get('id'))
  const examName = text(formData.get('exam_name'))
  const subjectId = text(formData.get('subject_id'))
  const examDate = text(formData.get('exam_date'))

  if (!examName) return { error: 'Enter the exam name.' }
  if (!subjectId) return { error: 'Choose a subject.' }

  const { supabase, schoolId } = await ctx()
  if (!schoolId) return { error: 'No active school.' }

  // The weekday is written from the date rather than typed. The form shows it
  // read-only for the same reason -- two people should not be able to file a
  // paper on "Monday the 14th" when the 14th is a Wednesday.
  const payload = {
    school_id: schoolId,
    group_id: text(formData.get('group_id')),
    exam_id: text(formData.get('exam_id')),
    exam_name: examName,
    subject_id: subjectId,
    class_id: text(formData.get('class_id')),
    section_id: text(formData.get('section_id')),
    exam_date: examDate,
    day_label: examDate ? dayFromDate(examDate) : null,
    start_time: text(formData.get('start_time')),
    duration: text(formData.get('duration')),
    venue: text(formData.get('venue')),
  }

  if (id) {
    const { error } = await supabase.from('datesheets').update(payload).eq('id', id)
    if (error) return { error: pgMessage(error) }
  } else {
    const { error } = await supabase.from('datesheets').insert(payload)
    if (error) return { error: pgMessage(error) }
  }

  revalidateAll()
  return ok(id ? 'Entry updated.' : 'Entry added.')
}

export async function deleteEntry(formData) {
  const id = String(formData.get('id'))
  const { supabase } = await ctx()

  const { error } = await supabase
    .from('datesheets')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw new Error(pgMessage(error))
  revalidateAll()
}

/* ============================================================== date sheet */

export async function saveSheet(_prev, formData) {
  const id = text(formData.get('id'))
  const name = text(formData.get('name'))

  if (!name) return { error: 'Enter a name for the date sheet.' }

  const { supabase, schoolId } = await ctx()
  if (!schoolId) return { error: 'No active school.' }

  const payload = {
    school_id: schoolId,
    name,
    exam_id: text(formData.get('exam_id')),
    exam_name: text(formData.get('exam_name')) ?? name,
    class_id: text(formData.get('class_id')),
    session_id: text(formData.get('session_id')),
    start_date: text(formData.get('start_date')),
    end_date: text(formData.get('end_date')),
    instructions: text(formData.get('instructions')),
    status: text(formData.get('status')) ?? 'draft',
    notes: text(formData.get('notes')),
  }

  if (id) {
    const { error } = await supabase.from('datesheet_groups').update(payload).eq('id', id)
    if (error) return { error: pgMessage(error, 'date sheet') }
  } else {
    const { error } = await supabase.from('datesheet_groups').insert(payload)
    if (error) return { error: pgMessage(error, 'date sheet') }
  }

  revalidateAll()
  return ok(id ? `${name} updated.` : `${name} created.`)
}

export async function deleteSheet(formData) {
  const id = String(formData.get('id'))
  const { supabase } = await ctx()

  // Soft delete. The papers on the sheet and any slips printed from it point
  // here; a hard delete would take the admit cards with it.
  const { error } = await supabase
    .from('datesheet_groups')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw new Error(pgMessage(error, 'date sheet'))
  revalidateAll()
}

/* =================================================================== slips */

export async function saveSlip(_prev, formData) {
  const id = text(formData.get('id'))
  const groupId = text(formData.get('group_id'))
  const studentId = text(formData.get('student_id'))

  if (!groupId) return { error: 'Choose a date sheet.' }
  if (!studentId) return { error: 'Choose a student.' }

  const { supabase, schoolId } = await ctx()
  if (!schoolId) return { error: 'No active school.' }

  // The student's name and class are COPIED onto the slip, not joined. An
  // admit card reprinted after a promotion has to show the class the student
  // sat the exam in.
  const { data: student } = await supabase
    .from('students')
    .select('first_name, last_name, roll_number, current_class_id, current_section_id')
    .eq('id', studentId)
    .maybeSingle()

  if (!student) return { error: 'That student no longer exists.' }

  const payload = {
    school_id: schoolId,
    group_id: groupId,
    student_id: studentId,
    student_name: [student.first_name, student.last_name].filter(Boolean).join(' '),
    class_id: text(formData.get('class_id')) ?? student.current_class_id,
    section_id: student.current_section_id,
    roll_number: text(formData.get('roll_number')) ?? student.roll_number,
    room_number: text(formData.get('room_number')),
    show_room: bool(formData.get('show_room')),
    show_time: bool(formData.get('show_time')),
    show_signature: bool(formData.get('show_signature')),
  }

  if (id) {
    const { error } = await supabase.from('exam_slips').update(payload).eq('id', id)
    if (error) return { error: pgMessage(error, 'slip') }
  } else {
    const { error } = await supabase.from('exam_slips').insert(payload)
    if (error) return { error: pgMessage(error, 'slip') }
  }

  revalidateAll()
  return ok(id ? 'Slip updated.' : `Slip generated for ${payload.student_name}.`)
}

export async function deleteSlip(formData) {
  const id = String(formData.get('id'))
  const { supabase } = await ctx()

  const { error } = await supabase
    .from('exam_slips')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw new Error(pgMessage(error, 'slip'))
  revalidateAll()
}

// Every active student in a class, in one press. The office prints a whole
// class's admit cards at once; doing it one student at a time is forty
// dialogs.
export async function generateClassSlips(_prev, formData) {
  const groupId = text(formData.get('group_id'))
  const classId = text(formData.get('class_id'))

  if (!groupId) return { error: 'Choose a date sheet.' }
  if (!classId) return { error: 'Choose a class.' }

  const { supabase, schoolId } = await ctx()
  if (!schoolId) return { error: 'No active school.' }

  const { data: students, error: readError } = await supabase
    .from('students')
    .select('id, first_name, last_name, roll_number, current_class_id, current_section_id')
    .eq('school_id', schoolId)
    .eq('is_deleted', false)
    .eq('status', 'active')
    .eq('current_class_id', classId)

  if (readError) return { error: pgMessage(readError, 'slip') }
  if (!students?.length) return { error: 'That class has no active students.' }

  const rows = students.map((s) => ({
    school_id: schoolId,
    group_id: groupId,
    student_id: s.id,
    student_name: [s.first_name, s.last_name].filter(Boolean).join(' '),
    class_id: s.current_class_id,
    section_id: s.current_section_id,
    roll_number: s.roll_number,
    show_room: bool(formData.get('show_room')),
    show_time: bool(formData.get('show_time')),
    show_signature: bool(formData.get('show_signature')),
  }))

  // Pressing Generate twice must not double the drawer. The unique index on
  // (school_id, group_id, student_id) is what makes this safe.
  const { error } = await supabase
    .from('exam_slips')
    .upsert(rows, { onConflict: 'school_id,group_id,student_id' })

  if (error) return { error: pgMessage(error, 'slip') }

  revalidateAll()
  return ok(`${rows.length} slip${rows.length === 1 ? '' : 's'} generated.`)
}
