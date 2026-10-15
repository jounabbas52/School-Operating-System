'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// Authority is RLS. Every table here carries the standard tenant policy set,
// so a caller without academics.write gets an error or a zero-row update
// rather than a silent success. What follows is input shaping and turning
// Postgres error codes into sentences a school admin can act on.

const BASE = '/school/academics'
const PATHS = ['sessions', 'classes', 'sections', 'grade-levels', 'subjects']

function revalidateAll() {
  for (const p of PATHS) revalidatePath(`${BASE}/${p}`)
  revalidatePath('/school')
}

function pgMessage(error, subject) {
  if (error.code === '23505') return `That ${subject} already exists.`
  if (error.code === '42501') return `You do not have permission to change ${subject}s.`
  if (error.code === '23503') return 'A linked record no longer exists. Reload and try again.'
  if (error.code === '23514') return 'Some values are out of range. Check the dates and numbers.'
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

/* ================================================================= sessions */

export async function saveSession(_prev, formData) {
  const id = text(formData.get('id'))
  const name = text(formData.get('name'))
  const startDate = text(formData.get('start_date'))
  const endDate = text(formData.get('end_date'))
  const makeActive = formData.get('is_current') === 'on'

  if (!name) return { error: 'Enter a session name, for example 2026-2027.' }
  if (!startDate || !endDate) return { error: 'Both start and end dates are required.' }
  if (endDate <= startDate) return { error: 'The end date must be after the start date.' }

  const { supabase, schoolId } = await ctx()
  if (!schoolId) return { error: 'No active school.' }

  // sessions_one_current is a partial unique index, so two active sessions
  // would be rejected by the database. Stand the old one down first.
  if (makeActive) {
    const { error } = await supabase
      .from('sessions')
      .update({ is_current: false })
      .eq('school_id', schoolId)
      .eq('is_current', true)
    if (error) return { error: pgMessage(error, 'session') }
  }

  const payload = {
    school_id: schoolId,
    name,
    start_date: startDate,
    end_date: endDate,
    is_current: makeActive,
    status: makeActive ? 'active' : 'inactive',
  }

  const { error } = id
    ? await supabase.from('sessions').update(payload).eq('id', id)
    : await supabase.from('sessions').insert(payload)

  if (error) return { error: pgMessage(error, 'session') }

  revalidateAll()
  return ok(id ? `${name} updated.` : `${name} created.`)
}

export async function activateSession(formData) {
  const id = String(formData.get('id'))
  const { supabase, schoolId } = await ctx()

  await supabase
    .from('sessions')
    .update({ is_current: false })
    .eq('school_id', schoolId)
    .eq('is_current', true)

  const { error } = await supabase
    .from('sessions')
    .update({ is_current: true, status: 'active' })
    .eq('id', id)

  if (error) throw new Error(pgMessage(error, 'session'))
  revalidateAll()
}

/* ============================================================= grade levels */

export async function saveGradeLevel(_prev, formData) {
  const id = text(formData.get('id'))
  const name = text(formData.get('name'))

  if (!name) return { error: 'Enter a grade level name.' }

  const { supabase, schoolId } = await ctx()
  if (!schoolId) return { error: 'No active school.' }

  let ordinal = num(formData.get('ordinal'))
  if (ordinal == null && !id) {
    // Append to the end rather than colliding with an existing position.
    const { data: last } = await supabase
      .from('grade_levels')
      .select('ordinal')
      .eq('school_id', schoolId)
      .eq('is_deleted', false)
      .order('ordinal', { ascending: false })
      .limit(1)
      .maybeSingle()
    ordinal = (last?.ordinal ?? 0) + 1
  }

  const payload = {
    school_id: schoolId,
    name,
    short_name: text(formData.get('short_name')) ?? name.slice(0, 2).toUpperCase(),
    stage: text(formData.get('stage')),
    ...(ordinal != null ? { ordinal } : {}),
  }

  const { error } = id
    ? await supabase.from('grade_levels').update(payload).eq('id', id)
    : await supabase.from('grade_levels').insert(payload)

  if (error) return { error: pgMessage(error, 'grade level') }

  revalidateAll()
  return ok(id ? `${name} updated.` : `${name} added.`)
}

// Swap this level's ordinal with its neighbour, so Up/Down reorders the list
// without renumbering everything.
export async function moveGradeLevel(formData) {
  const id = String(formData.get('id'))
  const direction = String(formData.get('direction'))
  const { supabase, schoolId } = await ctx()

  const { data: current } = await supabase
    .from('grade_levels')
    .select('id, ordinal')
    .eq('id', id)
    .maybeSingle()
  if (!current) return

  const { data: neighbour } = await supabase
    .from('grade_levels')
    .select('id, ordinal')
    .eq('school_id', schoolId)
    .eq('is_deleted', false)
    .order('ordinal', { ascending: direction !== 'up' })
    .filter('ordinal', direction === 'up' ? 'lt' : 'gt', current.ordinal)
    .limit(1)
    .maybeSingle()

  if (!neighbour) return

  await supabase.from('grade_levels').update({ ordinal: neighbour.ordinal }).eq('id', current.id)
  await supabase.from('grade_levels').update({ ordinal: current.ordinal }).eq('id', neighbour.id)

  revalidateAll()
}

export async function deleteGradeLevel(formData) {
  const id = String(formData.get('id'))
  const { supabase } = await ctx()

  // A grade level with classes cannot go: those classes hold enrolled
  // students and their history.
  const { count } = await supabase
    .from('classes')
    .select('*', { count: 'exact', head: true })
    .eq('grade_level_id', id)
    .eq('is_deleted', false)

  if (count) {
    throw new Error(`That grade level still has ${count} class(es). Remove them first.`)
  }

  const { error } = await supabase
    .from('grade_levels')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw new Error(pgMessage(error, 'grade level'))
  revalidateAll()
}

/* ================================================================== classes */

export async function saveClass(_prev, formData) {
  const id = text(formData.get('id'))
  let gradeLevelId = text(formData.get('grade_level_id'))
  const newGradeName = text(formData.get('new_grade_level'))
  const sessionId = text(formData.get('session_id'))

  if (!gradeLevelId && !newGradeName) return { error: 'Choose or type a class / grade level.' }
  if (!sessionId) return { error: 'Choose a session.' }

  const { supabase, schoolId } = await ctx()
  if (!schoolId) return { error: 'No active school.' }

  // "Add New Class" in the combobox: create the grade level first, then carry
  // on as if it had been picked. Keeping it in one action means a failed class
  // insert cannot leave an orphan grade level behind a closed panel.
  if (!gradeLevelId && newGradeName) {
    const { data: existing } = await supabase
      .from('grade_levels')
      .select('id')
      .eq('school_id', schoolId)
      .eq('is_deleted', false)
      .ilike('name', newGradeName)
      .maybeSingle()

    if (existing) {
      gradeLevelId = existing.id
    } else {
      const { data: last } = await supabase
        .from('grade_levels')
        .select('ordinal')
        .eq('school_id', schoolId)
        .eq('is_deleted', false)
        .order('ordinal', { ascending: false })
        .limit(1)
        .maybeSingle()

      const { data: created, error: gradeError } = await supabase
        .from('grade_levels')
        .insert({
          school_id: schoolId,
          name: newGradeName,
          short_name: newGradeName.slice(0, 2).toUpperCase(),
          ordinal: (last?.ordinal ?? 0) + 1,
        })
        .select('id')
        .single()

      if (gradeError) return { error: pgMessage(gradeError, 'grade level') }
      gradeLevelId = created.id
    }
  }

  const { data: grade } = await supabase
    .from('grade_levels')
    .select('name')
    .eq('id', gradeLevelId)
    .maybeSingle()

  if (!grade) return { error: 'That grade level no longer exists.' }

  const capacity = num(formData.get('capacity')) ?? 35

  const payload = {
    school_id: schoolId,
    grade_level_id: gradeLevelId,
    session_id: sessionId,
    name: grade.name, // the class is named for its grade level
    capacity,
    grading_system: text(formData.get('grading_system')) ?? 'percentage',
    standard_fee: num(formData.get('standard_fee')),
    status: text(formData.get('status')) ?? 'active',
    start_time: text(formData.get('start_time')),
    periods_per_day: num(formData.get('periods_per_day')),
    period_minutes: num(formData.get('period_minutes')),
    break_after_period: num(formData.get('break_after_period')),
    break_minutes: num(formData.get('break_minutes')),
  }

  let classId = id

  if (id) {
    const { error } = await supabase.from('classes').update(payload).eq('id', id)
    if (error) return { error: pgMessage(error, 'class') }
  } else {
    // Human-readable class code, CLS-001 upward per school.
    const { count } = await supabase
      .from('classes')
      .select('*', { count: 'exact', head: true })
      .eq('school_id', schoolId)
    payload.code = `CLS-${String((count ?? 0) + 1).padStart(3, '0')}`

    const { data, error } = await supabase.from('classes').insert(payload).select('id').single()
    if (error) {
      if (error.code === '23505') {
        return { error: `${grade.name} already exists in this session.` }
      }
      return { error: pgMessage(error, 'class') }
    }
    classId = data.id
  }

  // Rows from the "+ Add Section" builder. The two lists come back in the
  // same order the inputs appear, so index i of one pairs with index i of the
  // other.
  const sectionNames = formData.getAll('section_name').map((n) => String(n).trim().toUpperCase())
  const sectionCaps = formData.getAll('section_capacity').map((c) => num(c))

  const wanted = sectionNames
    .map((name, i) => ({ name, capacity: sectionCaps[i] ?? capacity }))
    .filter((s) => s.name)

  if (wanted.length) {
    // Two rows both called "A" would hit the unique index and fail the whole
    // insert, so collapse duplicates before sending them.
    const seen = new Set()
    const unique = wanted.filter((s) => (seen.has(s.name) ? false : seen.add(s.name)))

    const { data: existing } = await supabase
      .from('sections')
      .select('name')
      .eq('class_id', classId)
      .eq('is_deleted', false)
    const have = new Set((existing ?? []).map((s) => s.name))

    const fresh = unique.filter((s) => !have.has(s.name))
    if (fresh.length) {
      const { error } = await supabase.from('sections').insert(
        fresh.map((s) => ({
          school_id: schoolId,
          class_id: classId,
          name: s.name,
          capacity: s.capacity,
          status: 'active',
        }))
      )
      if (error) return { error: pgMessage(error, 'section') }
    }
  }

  revalidateAll()
  return ok(id ? `${grade.name} updated.` : `${grade.name} created.`)
}

export async function deleteClass(formData) {
  const id = String(formData.get('id'))
  const { supabase } = await ctx()

  const { count } = await supabase
    .from('students')
    .select('*', { count: 'exact', head: true })
    .eq('current_class_id', id)
    .eq('is_deleted', false)

  if (count) {
    throw new Error(`${count} student(s) are still in this class. Move them first.`)
  }

  const { error } = await supabase
    .from('classes')
    .update({ is_deleted: true, deleted_at: new Date().toISOString(), status: 'inactive' })
    .eq('id', id)

  if (error) throw new Error(pgMessage(error, 'class'))
  revalidateAll()
}

/* ================================================================= sections */

export async function saveSection(_prev, formData) {
  const id = text(formData.get('id'))
  const classId = text(formData.get('class_id'))
  const rawName = text(formData.get('name'))
  const subjectIds = formData.getAll('subject_ids').map(String)

  if (!classId) return { error: 'Choose a class.' }
  if (!rawName) return { error: 'Enter a section name.' }

  // Stored uppercase so "a" and "A" cannot both exist in one class.
  const name = rawName.toUpperCase()

  const { supabase, schoolId } = await ctx()
  if (!schoolId) return { error: 'No active school.' }

  const payload = {
    school_id: schoolId,
    class_id: classId,
    name,
    capacity: num(formData.get('capacity')) ?? 35,
    room_number: text(formData.get('room_number')),
    class_teacher_id: text(formData.get('class_teacher_id')),
    status: text(formData.get('status')) ?? 'active',
  }

  let sectionId = id
  if (id) {
    const { error } = await supabase.from('sections').update(payload).eq('id', id)
    if (error) return { error: pgMessage(error, 'section') }
  } else {
    const { data, error } = await supabase.from('sections').insert(payload).select('id').single()
    if (error) {
      if (error.code === '23505') return { error: `Section ${name} already exists in this class.` }
      return { error: pgMessage(error, 'section') }
    }
    sectionId = data.id
  }

  // Reconcile the section's subjects against what was ticked.
  const { data: current } = await supabase
    .from('section_subjects')
    .select('id, subject_id')
    .eq('section_id', sectionId)

  const have = new Set((current ?? []).map((r) => r.subject_id))
  const want = new Set(subjectIds)

  const toAdd = subjectIds.filter((s) => !have.has(s))
  const toDrop = (current ?? []).filter((r) => !want.has(r.subject_id))

  if (toAdd.length) {
    const { error } = await supabase.from('section_subjects').insert(
      toAdd.map((subjectId) => ({ school_id: schoolId, section_id: sectionId, subject_id: subjectId }))
    )
    if (error) return { error: pgMessage(error, 'subject') }
  }
  if (toDrop.length) {
    // Hard delete: UNIQUE (school_id, section_id, subject_id) means a
    // soft-deleted row would block the subject from being re-added.
    const { error } = await supabase
      .from('section_subjects')
      .delete()
      .in('id', toDrop.map((r) => r.id))
    if (error) return { error: pgMessage(error, 'subject') }
  }

  revalidateAll()
  return ok(id ? `Section ${name} updated.` : `Section ${name} created.`)
}

export async function deleteSection(formData) {
  const id = String(formData.get('id'))
  const { supabase } = await ctx()

  const { count } = await supabase
    .from('students')
    .select('*', { count: 'exact', head: true })
    .eq('current_section_id', id)
    .eq('is_deleted', false)

  if (count) {
    throw new Error(`${count} student(s) are still in this section. Move them first.`)
  }

  const { error } = await supabase
    .from('sections')
    .update({ is_deleted: true, deleted_at: new Date().toISOString(), status: 'inactive' })
    .eq('id', id)

  if (error) throw new Error(pgMessage(error, 'section'))
  revalidateAll()
}

/* ================================================================= subjects */

export async function saveSubject(_prev, formData) {
  const id = text(formData.get('id'))
  const name = text(formData.get('name'))

  if (!name) return { error: 'Enter a subject name.' }

  const { supabase, schoolId } = await ctx()
  if (!schoolId) return { error: 'No active school.' }

  const payload = {
    school_id: schoolId,
    name,
    code: text(formData.get('code')),
    category: text(formData.get('category')),
    default_marks: num(formData.get('default_marks')),
    description: text(formData.get('description')),
    status: text(formData.get('status')) ?? 'active',
  }

  const { error } = id
    ? await supabase.from('subjects').update(payload).eq('id', id)
    : await supabase.from('subjects').insert(payload)

  if (error) return { error: pgMessage(error, 'subject') }

  revalidateAll()
  return ok(id ? `${name} updated.` : `${name} added.`)
}

export async function deleteSubject(formData) {
  const id = String(formData.get('id'))
  const { supabase } = await ctx()

  const { error } = await supabase
    .from('subjects')
    .update({ is_deleted: true, deleted_at: new Date().toISOString(), status: 'inactive' })
    .eq('id', id)

  if (error) throw new Error(pgMessage(error, 'subject'))
  revalidateAll()
}
