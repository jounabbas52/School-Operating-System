'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { buildSchedule, buildDay, normaliseSettings, toMinutes } from '@/lib/timetable'

// Authority is RLS. periods, timetable_entries and timetable_settings all
// carry the standard tenant policy set, so a caller without academics.write
// gets an error or a zero-row write rather than a silent success. What follows
// is input shaping.

function revalidateAll() {
  revalidatePath('/school/timetable')
  revalidatePath('/school/timetable/periods')
}

function pgMessage(error, subject = 'period') {
  if (error.code === '23505') {
    if (error.message.includes('sort_order')) {
      return 'That slot number is already taken on that day. Renumber it or delete the existing one.'
    }
    return `That ${subject} already exists.`
  }
  if (error.code === '42501') return `You do not have permission to change the timetable.`
  if (error.code === '23503') return 'A linked record no longer exists. Reload and try again.'
  if (error.code === '23514') return 'The end time has to be after the start time.'
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
const int = (v, fallback = null) => {
  const n = Math.trunc(Number(String(v ?? '').trim()))
  return Number.isFinite(n) ? n : fallback
}
const ok = (message) => ({ ok: message, at: Date.now() })

/* ============================================================== one slot */

export async function saveSlot(_prev, formData) {
  const periodId = text(formData.get('period_id'))
  const sectionId = text(formData.get('section_id'))
  const classId = text(formData.get('class_id'))
  const subjectId = text(formData.get('subject_id'))
  const teacherId = text(formData.get('teacher_id'))

  if (!periodId || !sectionId || !classId) return { error: 'That slot is no longer on the grid.' }

  const { supabase, schoolId } = await ctx()
  if (!schoolId) return { error: 'No active school.' }

  // Clearing the subject clears the slot. There is no such thing as a lesson
  // with a teacher and no subject.
  if (!subjectId) {
    const { error } = await supabase
      .from('timetable_entries')
      .delete()
      .eq('school_id', schoolId)
      .eq('section_id', sectionId)
      .eq('period_id', periodId)

    if (error) return { error: pgMessage(error, 'lesson') }
    revalidateAll()
    return ok('Slot cleared.')
  }

  // One teacher cannot be in two rooms at once. The comparison is on the
  // clock, not the period id: another class's Period 4 may be this class's
  // Period 3 to the minute.
  if (teacherId) {
    const { data: slot } = await supabase
      .from('periods')
      .select('day_of_week, start_time, end_time')
      .eq('id', periodId)
      .maybeSingle()

    if (slot) {
      const { data: booked } = await supabase
        .from('timetable_entries')
        .select('section_id, sections(name), subjects(name), periods!inner(day_of_week, start_time, end_time)')
        .eq('school_id', schoolId)
        .eq('teacher_id', teacherId)
        .eq('is_deleted', false)
        .neq('section_id', sectionId)
        .eq('periods.day_of_week', slot.day_of_week)
        // Half-open comparison, so a lesson ending at 8:45 does not collide
        // with one starting at 8:45.
        .lt('periods.start_time', slot.end_time)
        .gt('periods.end_time', slot.start_time)

      if (booked?.length) {
        const clash = booked[0]
        return {
          error: `That teacher is already taking ${clash.subjects?.name ?? 'a lesson'} for section ${
            clash.sections?.name ?? '—'
          } at the same time.`,
        }
      }
    }
  }

  const { error } = await supabase.from('timetable_entries').upsert(
    {
      school_id: schoolId,
      class_id: classId,
      section_id: sectionId,
      period_id: periodId,
      subject_id: subjectId,
      teacher_id: teacherId,
      room_number: text(formData.get('room_number')),
    },
    { onConflict: 'school_id,section_id,period_id' }
  )

  if (error) return { error: pgMessage(error, 'lesson') }

  revalidateAll()
  return ok('Slot saved.')
}

/* =========================================================== one period */

export async function savePeriod(_prev, formData) {
  const id = text(formData.get('id'))
  const classId = text(formData.get('class_id'))
  const day = int(formData.get('day_of_week'))
  const name = text(formData.get('name'))
  const kind = text(formData.get('kind')) ?? 'regular'
  const start = text(formData.get('start_time'))
  const end = text(formData.get('end_time'))

  if (!classId) return { error: 'Choose a class.' }
  if (!day || day < 1 || day > 7) return { error: 'Choose a day.' }
  if (!name) return { error: 'Enter a period name.' }
  if (!['regular', 'break'].includes(kind)) return { error: 'Unknown period type.' }
  if (!start || !end) return { error: 'Enter a start and end time.' }
  if (toMinutes(end) <= toMinutes(start)) return { error: 'The end time has to be after the start time.' }

  const { supabase, schoolId } = await ctx()
  if (!schoolId) return { error: 'No active school.' }

  let sortOrder = int(formData.get('sort_order'))

  // Unnumbered new periods go on the end of that day, which is where someone
  // adding "one more period" means to put it.
  if (!sortOrder) {
    const { data: last } = await supabase
      .from('periods')
      .select('sort_order')
      .eq('school_id', schoolId)
      .eq('class_id', classId)
      .eq('day_of_week', day)
      .eq('is_deleted', false)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle()

    sortOrder = (last?.sort_order ?? 0) + 1
  }

  const payload = {
    school_id: schoolId,
    class_id: classId,
    day_of_week: day,
    name,
    kind,
    start_time: start,
    end_time: end,
    sort_order: sortOrder,
  }

  if (id) {
    const { error } = await supabase.from('periods').update(payload).eq('id', id)
    if (error) return { error: pgMessage(error) }
  } else {
    const { error } = await supabase.from('periods').insert(payload)
    if (error) return { error: pgMessage(error) }
  }

  revalidateAll()
  return ok(id ? `${name} updated.` : `${name} added.`)
}

export async function deletePeriod(formData) {
  const id = String(formData.get('id'))
  const { supabase } = await ctx()

  // Hard delete, unlike a student or an employee. A period holds no history
  // of its own, and the lessons in it go with it by cascade -- leaving a
  // soft-deleted row behind would keep its slot number occupied and block the
  // replacement.
  const { error } = await supabase.from('periods').delete().eq('id', id)
  if (error) throw new Error(pgMessage(error))
  revalidateAll()
}

/* ======================================================= bulk generation */

export async function generatePeriods(_prev, formData) {
  const classId = text(formData.get('class_id'))
  if (!classId) return { error: 'Choose a class.' }

  const settings = normaliseSettings({
    start_time: text(formData.get('start_time')) ?? '08:00',
    periods_per_day: int(formData.get('periods_per_day'), 7),
    period_minutes: int(formData.get('period_minutes'), 45),
    short_break_after: formData.get('short_break') === 'on' ? int(formData.get('short_break_after'), 0) : 0,
    short_break_minutes: int(formData.get('short_break_minutes'), 0),
    lunch_after: formData.get('lunch_break') === 'on' ? int(formData.get('lunch_after'), 0) : 0,
    lunch_minutes: int(formData.get('lunch_minutes'), 0),
    days: formData.getAll('days').map(Number),
  })

  if (!settings.days.length) return { error: 'Pick at least one day.' }

  const rows = buildSchedule(settings)
  if (!rows.length) return { error: 'That produces no periods. Check the period count.' }

  const { supabase, schoolId } = await ctx()
  if (!schoolId) return { error: 'No active school.' }

  // Generating replaces that class's schedule for the chosen days. Merging
  // instead would leave yesterday's longer day hanging off the end of a
  // shorter new one, which reads as a bug rather than a leftover.
  const { error: clearError } = await supabase
    .from('periods')
    .delete()
    .eq('school_id', schoolId)
    .eq('class_id', classId)
    .in('day_of_week', settings.days)

  if (clearError) return { error: pgMessage(clearError) }

  const { error } = await supabase
    .from('periods')
    .insert(rows.map((r) => ({ ...r, school_id: schoolId, class_id: classId })))

  if (error) return { error: pgMessage(error) }

  await supabase
    .from('timetable_settings')
    .upsert({ school_id: schoolId, class_id: classId, ...settings }, { onConflict: 'school_id,class_id' })

  revalidateAll()
  return ok(`${rows.length} periods created across ${settings.days.length} day${settings.days.length === 1 ? '' : 's'}.`)
}

// Change Timing: keep the shape of the day, move the clock. Same generator,
// so the times land exactly where the dialog's live timeline said they would.
export async function updateTiming(_prev, formData) {
  const classId = text(formData.get('class_id'))
  if (!classId) return { error: 'Choose a class.' }

  const { supabase, schoolId } = await ctx()
  if (!schoolId) return { error: 'No active school.' }

  const { data: existing } = await supabase
    .from('periods')
    .select('day_of_week')
    .eq('school_id', schoolId)
    .eq('class_id', classId)
    .eq('is_deleted', false)

  const days = [...new Set((existing ?? []).map((p) => p.day_of_week))].sort((a, b) => a - b)
  if (!days.length) return { error: 'That class has no periods yet. Use Add Bulk Periods first.' }

  const settings = normaliseSettings({
    start_time: text(formData.get('start_time')) ?? '08:00',
    periods_per_day: int(formData.get('periods_per_day'), 7),
    period_minutes: int(formData.get('period_minutes'), 45),
    short_break_after: int(formData.get('short_break_after'), 0),
    short_break_minutes: int(formData.get('short_break_minutes'), 0),
    lunch_after: int(formData.get('lunch_after'), 0),
    lunch_minutes: int(formData.get('lunch_minutes'), 0),
    days,
  })

  const day = buildDay(settings)
  const rows = days.flatMap((d) => day.map((slot) => ({ ...slot, day_of_week: d })))

  const { error: clearError } = await supabase
    .from('periods')
    .delete()
    .eq('school_id', schoolId)
    .eq('class_id', classId)

  if (clearError) return { error: pgMessage(clearError) }

  const { error } = await supabase
    .from('periods')
    .insert(rows.map((r) => ({ ...r, school_id: schoolId, class_id: classId })))

  if (error) return { error: pgMessage(error) }

  await supabase
    .from('timetable_settings')
    .upsert({ school_id: schoolId, class_id: classId, ...settings }, { onConflict: 'school_id,class_id' })

  revalidateAll()
  return ok('Timing updated. Assigned lessons were cleared with the old slots.')
}

export async function deletePeriods(formData) {
  const classId = String(formData.get('class_id'))
  const day = int(formData.get('day_of_week'))

  const { supabase, schoolId } = await ctx()
  if (!schoolId) throw new Error('No active school.')

  let query = supabase.from('periods').delete().eq('school_id', schoolId).eq('class_id', classId)
  if (day) query = query.eq('day_of_week', day)

  const { error } = await query
  if (error) throw new Error(pgMessage(error))
  revalidateAll()
}
