'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { EXAM_STATUS_IDS, TEST_TYPE_IDS, gradeFor } from '@/lib/exam-options'

// Authority is RLS. exams and marks are gated on exams.*, tests and test_marks
// on tests.*, so a caller holding one and not the other is stopped by the
// database rather than by this file. What follows is input shaping.

function revalidateAll() {
  revalidatePath('/school/exams')
  revalidatePath('/school/exams/results')
  revalidatePath('/school/exams/tests')
  revalidatePath('/school/exams/tests/results')
  revalidatePath('/school/datesheet')
  revalidatePath('/school/reports')
  revalidatePath('/school')
}

function pgMessage(error, subject = 'exam') {
  if (error.code === '23505') return `That ${subject} already exists.`
  if (error.code === '42501') return `You do not have permission to change ${subject}s.`
  if (error.code === '23503') return 'A linked record no longer exists. Reload and try again.'
  if (error.code === '23514') return 'Some values are out of range. Check the dates and marks.'
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

/* =================================================================== exams */

export async function saveExam(_prev, formData) {
  const id = text(formData.get('id'))
  const name = text(formData.get('name'))
  const classId = text(formData.get('class_id'))
  const startDate = text(formData.get('start_date'))
  const endDate = text(formData.get('end_date'))

  if (!name) return { error: 'Enter the exam name.' }
  if (!classId) return { error: 'Choose a class.' }
  if (!startDate) return { error: 'Choose a start date.' }
  if (!endDate) return { error: 'Choose an end date.' }
  if (endDate < startDate) return { error: 'The end date cannot fall before the start date.' }

  const status = text(formData.get('status')) ?? 'upcoming'
  if (!EXAM_STATUS_IDS.includes(status)) return { error: 'Unknown status.' }

  const { supabase, schoolId } = await ctx()
  if (!schoolId) return { error: 'No active school.' }

  const payload = {
    school_id: schoolId,
    name,
    class_id: classId,
    session_id: text(formData.get('session_id')),
    start_date: startDate,
    end_date: endDate,
    description: text(formData.get('description')),
    status,
  }

  if (id) {
    const { error } = await supabase.from('exams').update(payload).eq('id', id)
    if (error) return { error: pgMessage(error) }
  } else {
    const { error } = await supabase.from('exams').insert(payload)
    if (error) return { error: pgMessage(error) }
  }

  revalidateAll()
  return ok(id ? `${name} updated.` : `${name} created.`)
}

export async function deleteExam(formData) {
  const id = String(formData.get('id'))
  const { supabase } = await ctx()

  // Soft delete. Marks point here; a hard delete would take a year of results
  // with it.
  const { error } = await supabase
    .from('exams')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw new Error(pgMessage(error))
  revalidateAll()
}

export async function setExamStatus(formData) {
  const id = String(formData.get('id'))
  const status = String(formData.get('status'))
  if (!EXAM_STATUS_IDS.includes(status)) throw new Error('Unknown status.')

  const { supabase } = await ctx()
  const { error } = await supabase.from('exams').update({ status }).eq('id', id)
  if (error) throw new Error(pgMessage(error))
  revalidateAll()
}

// Publishing is its own action behind its own permission (exams.publish),
// because making results visible to parents is not the same act as editing a
// mark. RLS cannot express "this column needs a different permission", so the
// check is here and the permission is real.
export async function publishResults(formData) {
  const id = String(formData.get('id'))
  const publish = String(formData.get('publish')) === 'true'

  const supabase = await createClient()
  const { data: allowed } = await supabase.rpc('has_permission', { p_perm: 'exams.publish' })
  if (!allowed) throw new Error('You do not have permission to publish results.')

  const { error } = await supabase
    .from('exams')
    .update({ results_published_at: publish ? new Date().toISOString() : null })
    .eq('id', id)

  if (error) throw new Error(pgMessage(error))
  revalidateAll()
}

/* =================================================================== tests */

export async function saveTest(_prev, formData) {
  const id = text(formData.get('id'))
  const name = text(formData.get('test_name'))
  const classId = text(formData.get('class_id'))
  const subjectId = text(formData.get('subject_id'))

  if (!name) return { error: 'Enter the test name.' }
  if (!classId) return { error: 'Choose a class.' }
  if (!subjectId) return { error: 'Choose a subject.' }

  const maxMarks = num(formData.get('max_marks')) ?? 50
  if (maxMarks <= 0) return { error: 'Total marks must be greater than zero.' }

  const status = text(formData.get('status')) ?? 'upcoming'
  if (!EXAM_STATUS_IDS.includes(status)) return { error: 'Unknown status.' }

  const testType = text(formData.get('test_type')) ?? 'class_test'
  if (!TEST_TYPE_IDS.includes(testType)) return { error: 'Unknown test type.' }

  const { supabase, schoolId } = await ctx()
  if (!schoolId) return { error: 'No active school.' }

  const payload = {
    school_id: schoolId,
    test_name: name,
    test_type: testType,
    class_id: classId,
    section_id: text(formData.get('section_id')),
    subject_id: subjectId,
    session_id: text(formData.get('session_id')),
    test_date: text(formData.get('test_date')),
    max_marks: maxMarks,
    pass_marks: num(formData.get('pass_marks')),
    description: text(formData.get('description')),
    status,
  }

  if (id) {
    const { error } = await supabase.from('tests').update(payload).eq('id', id)
    if (error) return { error: pgMessage(error, 'test') }
  } else {
    const { error } = await supabase.from('tests').insert(payload)
    if (error) return { error: pgMessage(error, 'test') }
  }

  revalidateAll()
  return ok(id ? `${name} updated.` : `${name} created.`)
}

export async function deleteTest(formData) {
  const id = String(formData.get('id'))
  const { supabase } = await ctx()

  const { error } = await supabase
    .from('tests')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw new Error(pgMessage(error, 'test'))
  revalidateAll()
}

/* =================================================================== marks */

// One subject's marks for a whole class, from the grid.
//
// The rows arrive as parallel student_id / marks arrays, read with getAll()
// and zipped by index -- the same shape the section rows use elsewhere, and
// the reason there is no JSON blob to parse.
export async function saveExamMarks(_prev, formData) {
  const examId = text(formData.get('exam_id'))
  const subjectId = text(formData.get('subject_id'))

  if (!examId) return { error: 'Choose an exam.' }
  if (!subjectId) return { error: 'Choose a subject.' }

  const maxMarks = num(formData.get('max_marks')) ?? 100
  const passPercent = num(formData.get('pass_percent')) ?? 33

  const studentIds = formData.getAll('student_id').map(String)
  const marks = formData.getAll('marks_obtained').map(String)

  if (studentIds.length !== marks.length) {
    return { error: 'The sheet did not submit cleanly. Reload and try again.' }
  }

  const { supabase, schoolId } = await ctx()
  if (!schoolId) return { error: 'No active school.' }

  const rows = []
  for (let i = 0; i < studentIds.length; i += 1) {
    const raw = marks[i].trim()
    // A blank cell means "not marked yet", which is different from a zero.
    if (raw === '') continue

    const obtained = Number(raw)
    if (!Number.isFinite(obtained)) {
      return { error: `Row ${i + 1}: marks must be a number.` }
    }
    if (obtained < 0 || obtained > maxMarks) {
      return { error: `Row ${i + 1}: marks must be between 0 and ${maxMarks}.` }
    }

    rows.push({
      school_id: schoolId,
      exam_id: examId,
      student_id: studentIds[i],
      subject_id: subjectId,
      marks_obtained: obtained,
      max_marks: maxMarks,
      grade: gradeFor(obtained, maxMarks, passPercent),
      entered_at: new Date().toISOString(),
    })
  }

  if (!rows.length) return { error: 'Nothing to save — every cell is blank.' }

  const { error } = await supabase
    .from('marks')
    .upsert(rows, { onConflict: 'school_id,exam_id,student_id,subject_id' })

  if (error) return { error: pgMessage(error, 'mark') }

  revalidateAll()
  return ok(`${rows.length} mark${rows.length === 1 ? '' : 's'} saved.`)
}

export async function saveTestMarks(_prev, formData) {
  const testId = text(formData.get('test_id'))
  if (!testId) return { error: 'Choose a test.' }

  const subjectId = text(formData.get('subject_id'))
  const maxMarks = num(formData.get('max_marks')) ?? 50
  const passPercent = num(formData.get('pass_percent')) ?? 33

  const studentIds = formData.getAll('student_id').map(String)
  const marks = formData.getAll('marks_obtained').map(String)

  if (studentIds.length !== marks.length) {
    return { error: 'The sheet did not submit cleanly. Reload and try again.' }
  }

  const { supabase, schoolId } = await ctx()
  if (!schoolId) return { error: 'No active school.' }

  const rows = []
  for (let i = 0; i < studentIds.length; i += 1) {
    const raw = marks[i].trim()
    if (raw === '') continue

    const obtained = Number(raw)
    if (!Number.isFinite(obtained)) return { error: `Row ${i + 1}: marks must be a number.` }
    if (obtained < 0 || obtained > maxMarks) {
      return { error: `Row ${i + 1}: marks must be between 0 and ${maxMarks}.` }
    }

    rows.push({
      school_id: schoolId,
      test_id: testId,
      student_id: studentIds[i],
      subject_id: subjectId,
      marks_obtained: obtained,
      max_marks: maxMarks,
      grade: gradeFor(obtained, maxMarks, passPercent),
      entered_at: new Date().toISOString(),
    })
  }

  if (!rows.length) return { error: 'Nothing to save — every cell is blank.' }

  const { error } = await supabase
    .from('test_marks')
    .upsert(rows, { onConflict: 'school_id,test_id,student_id,subject_id' })

  if (error) return { error: pgMessage(error, 'mark') }

  revalidateAll()
  return ok(`${rows.length} mark${rows.length === 1 ? '' : 's'} saved.`)
}
