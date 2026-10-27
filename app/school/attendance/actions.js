'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { MARK_IDS, STAFF_MARK_IDS, safeDate } from '@/lib/attendance-options'
import { dateLabel } from '@/lib/operations-options'
import {
  PHONE_COLUMNS,
  autoSend,
  recipientsFrom,
  schoolName,
} from '@/lib/whatsapp/auto-send'

// Authority is RLS. attendance and staff_attendance carry the standard tenant
// policy set, so a caller without attendance.write gets an error or a zero-row
// write rather than a silent success. What follows is input shaping.

const PATHS = ['', '/staff', '/reports', '/history']

function revalidateAll() {
  for (const p of PATHS) revalidatePath(`/school/attendance${p}`)
}

function pgMessage(error, subject = 'attendance') {
  if (error.code === '42501') return `You do not have permission to record ${subject}.`
  if (error.code === '23503') return 'A linked record no longer exists. Reload and try again.'
  if (error.code === '23514') return 'One of those marks is not a valid status.'
  return error.message
}

async function ctx() {
  const supabase = await createClient()
  const [{ data: schoolId }, { data: auth }] = await Promise.all([
    supabase.rpc('current_school_id'),
    supabase.auth.getUser(),
  ])
  return { supabase, schoolId, userId: auth?.user?.id ?? null }
}

const text = (v) => {
  const s = String(v ?? '').trim()
  return s === '' ? null : s
}
const ok = (message) => ({ ok: message, at: Date.now() })

/* =================================================== student attendance */

export async function saveAttendance(_prev, formData) {
  const date = safeDate(text(formData.get('date')))
  const classId = text(formData.get('class_id'))
  const sectionId = text(formData.get('section_id'))

  if (!classId) return { error: 'Choose a class.' }
  if (!sectionId) return { error: 'Choose a section.' }

  // Ids and marks post as two parallel lists, so index i of one belongs to
  // index i of the other. The sheet renders them as a pair per row, which is
  // what keeps them aligned.
  const ids = formData.getAll('student_id').map(String)
  const marks = formData.getAll('mark').map(String)

  if (ids.length === 0) return { error: 'No students to save.' }
  if (ids.length !== marks.length) return { error: 'The register did not submit cleanly. Reload and try again.' }

  const bad = marks.find((m) => !MARK_IDS.includes(m))
  if (bad) return { error: `"${bad}" is not a valid attendance mark.` }

  const { supabase, schoolId, userId } = await ctx()
  if (!schoolId) return { error: 'No active school.' }

  const { data: session } = await supabase
    .from('sessions')
    .select('id')
    .eq('school_id', schoolId)
    .eq('is_current', true)
    .maybeSingle()

  // class_id and section_id are stamped on every row. Reading them back off
  // the student later would report last March under this year's class the
  // moment anyone is promoted.
  const rows = ids.map((studentId, i) => ({
    school_id: schoolId,
    student_id: studentId,
    date,
    status: marks[i],
    class_id: classId,
    section_id: sectionId,
    session_id: session?.id ?? null,
    recorded_by: userId,
  }))

  // One statement for the whole register. Re-marking a day updates in place
  // rather than erroring on the (school, student, date) key.
  const { error } = await supabase
    .from('attendance')
    .upsert(rows, { onConflict: 'school_id,student_id,date' })

  if (error) return { error: pgMessage(error) }

  // ------------------------------------------------------ absence alerts
  //
  // AFTER the register is safely written, never before: a parent must not
  // be told their child was absent by a save that then failed.
  //
  // Nothing here can fail the register. autoSend() swallows its own
  // errors, and every gate -- is WhatsApp on, is the phone linked, is this
  // event wanted, is there a template -- lives in the database, because
  // the teacher saving this holds attendance.write and not whatsapp.write.
  const absentIds = ids.filter((_, i) => marks[i] === 'absent')
  let notified = 0

  if (absentIds.length) {
    const { data: students } = await supabase
      .from('students')
      .select(`id, first_name, last_name, ${PHONE_COLUMNS}, classes:current_class_id(name)`)
      .eq('school_id', schoolId)
      .in('id', absentIds)

    const school = await schoolName(supabase, schoolId)

    const result = await autoSend(
      supabase,
      'absence',
      recipientsFrom(students, (s) => ({
        student_name: [s.first_name, s.last_name].filter(Boolean).join(' '),
        class_name: s.classes?.name ?? '',
        date: dateLabel(date),
        attendance_status: 'Absent',
        school_name: school,
      }))
    )
    notified = result.queued
  }

  revalidateAll()
  return ok(
    `Attendance saved for ${rows.length} student${rows.length === 1 ? '' : 's'}.` +
      (notified ? ` ${notified} parent${notified === 1 ? '' : 's'} notified on WhatsApp.` : '')
  )
}

/* ===================================================== staff attendance */

export async function saveStaffAttendance(_prev, formData) {
  const date = safeDate(text(formData.get('date')))

  const ids = formData.getAll('staff_id').map(String)
  const marks = formData.getAll('mark').map(String)
  const checkIns = formData.getAll('check_in').map(String)
  const checkOuts = formData.getAll('check_out').map(String)

  if (ids.length === 0) return { error: 'No staff to save.' }
  if (ids.length !== marks.length) {
    return { error: 'The register did not submit cleanly. Reload and try again.' }
  }

  const bad = marks.find((m) => !STAFF_MARK_IDS.includes(m))
  if (bad) return { error: `"${bad}" is not a valid attendance mark.` }

  const { supabase, schoolId, userId } = await ctx()
  if (!schoolId) return { error: 'No active school.' }

  const rows = ids.map((staffId, i) => ({
    school_id: schoolId,
    staff_id: staffId,
    date,
    status: marks[i],
    // Absent means nobody clocked in, whatever the boxes happen to hold.
    check_in: marks[i] === 'absent' ? null : text(checkIns[i]),
    check_out: marks[i] === 'absent' ? null : text(checkOuts[i]),
    recorded_by: userId,
  }))

  const { error } = await supabase
    .from('staff_attendance')
    .upsert(rows, { onConflict: 'school_id,staff_id,date' })

  if (error) return { error: pgMessage(error, 'staff attendance') }

  revalidateAll()
  return ok(`Attendance saved for ${rows.length} staff member${rows.length === 1 ? '' : 's'}.`)
}
