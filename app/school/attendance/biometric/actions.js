'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { safeDate } from '@/lib/attendance-options'

// Authority is RLS. biometric_devices, biometric_enrollments,
// attendance_punches and attendance_settings all carry the standard tenant
// policy set against attendance.read / attendance.write.
//
// Two functions here are the exception and say so: rotate_device_token and
// resolve_attendance_punches are RPCs that re-check permission inside the
// database, because one writes a credential and the other writes the
// register.

const PATHS = ['', '/staff', '/reports', '/history', '/biometric']

function revalidateAll() {
  for (const p of PATHS) revalidatePath(`/school/attendance${p}`)
}

function pgMessage(error, subject = 'device') {
  if (error.code === '23505') {
    if (error.message.includes('serial')) return 'That serial is already registered.'
    if (error.message.includes('device_user')) {
      return 'That device ID is already mapped to somebody else.'
    }
    if (error.message.includes('one_student') || error.message.includes('one_staff')) {
      return 'That person already has an active enrolment.'
    }
    return `That ${subject} already exists.`
  }
  if (error.code === '42501') return `You do not have permission to change ${subject}s.`
  if (error.code === '23503') return 'A linked record no longer exists. Reload and try again.'
  if (error.code === '23514') return 'Some values are out of range.'
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
const bool = (v) => v === 'on' || v === 'true' || v === true
const ok = (message, extra = {}) => ({ ok: message, at: Date.now(), ...extra })

const KINDS = ['zkteco', 'essl', 'usb_bridge', 'mobile', 'other']

/* ================================================================ devices */

export async function saveDevice(_prev, formData) {
  const id = text(formData.get('id'))
  const name = text(formData.get('name'))
  const serial = text(formData.get('serial'))

  if (!name) return { error: 'Name the device.' }
  if (!serial) return { error: 'Enter the device serial.' }

  const kind = text(formData.get('kind')) ?? 'zkteco'
  if (!KINDS.includes(kind)) return { error: 'Unknown device type.' }

  const { supabase, schoolId } = await ctx()
  if (!schoolId) return { error: 'No active school.' }

  const payload = {
    school_id: schoolId,
    name,
    serial,
    location: text(formData.get('location')),
    kind,
    notes: text(formData.get('notes')),
    status: text(formData.get('status')) ?? 'active',
  }

  if (id) {
    const { error } = await supabase.from('biometric_devices').update(payload).eq('id', id)
    if (error) return { error: pgMessage(error) }
    revalidateAll()
    return ok(`${name} updated.`)
  }

  // token_hash is NOT NULL, so a device cannot exist without one. A throwaway
  // is written here and immediately replaced by rotate_device_token, which is
  // the only path that produces a token anybody is told about.
  const { data: created, error } = await supabase
    .from('biometric_devices')
    .insert({ ...payload, token_hash: 'pending' })
    .select('id')
    .single()

  if (error) return { error: pgMessage(error) }

  const { data: token, error: tokenError } = await supabase.rpc('rotate_device_token', {
    p_device: created.id,
  })

  if (tokenError) return { error: pgMessage(tokenError) }

  revalidateAll()
  // The plaintext goes back exactly once. It is not stored anywhere, so if
  // the operator loses it the only remedy is to rotate.
  return ok(`${name} registered.`, { token, deviceId: created.id, serial })
}

export async function rotateToken(_prev, formData) {
  const id = text(formData.get('id'))
  if (!id) return { error: 'No device chosen.' }

  const { supabase } = await ctx()

  const { data: token, error } = await supabase.rpc('rotate_device_token', { p_device: id })
  if (error) return { error: pgMessage(error) }

  revalidateAll()
  return ok('New token issued. The old one stopped working immediately.', { token })
}

export async function deleteDevice(formData) {
  const id = String(formData.get('id'))
  const { supabase } = await ctx()

  // Soft delete, and inactive: punches already recorded point at this row,
  // and the ingest function only accepts active, undeleted devices — so this
  // revokes the token as a side effect.
  const { error } = await supabase
    .from('biometric_devices')
    .update({ is_deleted: true, deleted_at: new Date().toISOString(), status: 'inactive' })
    .eq('id', id)

  if (error) throw new Error(pgMessage(error))
  revalidateAll()
}

/* ============================================================ enrolments */

export async function saveEnrollment(_prev, formData) {
  const id = text(formData.get('id'))
  const personType = text(formData.get('person_type')) ?? 'student'
  const deviceUserId = text(formData.get('device_user_id'))

  if (!['student', 'staff'].includes(personType)) return { error: 'Unknown person type.' }
  if (!deviceUserId) return { error: 'Enter the ID this person is enrolled under on the device.' }

  const studentId = text(formData.get('student_id'))
  const staffId = text(formData.get('staff_id'))

  if (personType === 'student' && !studentId) return { error: 'Choose a student.' }
  if (personType === 'staff' && !staffId) return { error: 'Choose a staff member.' }

  const { supabase, schoolId } = await ctx()
  if (!schoolId) return { error: 'No active school.' }

  const payload = {
    school_id: schoolId,
    person_type: personType,
    // The CHECK constraint requires exactly one side to be set, so the other
    // is explicitly nulled rather than left at whatever it was.
    student_id: personType === 'student' ? studentId : null,
    staff_id: personType === 'staff' ? staffId : null,
    device_user_id: deviceUserId,
    finger_label: text(formData.get('finger_label')),
    notes: text(formData.get('notes')),
    status: 'active',
  }

  if (id) {
    const { error } = await supabase.from('biometric_enrollments').update(payload).eq('id', id)
    if (error) return { error: pgMessage(error, 'enrolment') }
  } else {
    const { error } = await supabase.from('biometric_enrollments').insert(payload)
    if (error) return { error: pgMessage(error, 'enrolment') }
  }

  revalidateAll()
  return ok(id ? 'Enrolment updated.' : `Device ID ${deviceUserId} mapped.`)
}

export async function deleteEnrollment(formData) {
  const id = String(formData.get('id'))
  const { supabase } = await ctx()

  const { error } = await supabase
    .from('biometric_enrollments')
    .update({ is_deleted: true, deleted_at: new Date().toISOString(), status: 'inactive' })
    .eq('id', id)

  if (error) throw new Error(pgMessage(error, 'enrolment'))
  revalidateAll()
}

/* ============================================================== resolving */

// Turn a day's raw punches into register rows. Safe to re-run: the function
// upserts, and refuses to touch anything a human typed by hand.
export async function resolveDay(_prev, formData) {
  const date = safeDate(text(formData.get('date')))

  const { supabase, schoolId } = await ctx()
  if (!schoolId) return { error: 'No active school.' }

  const { data, error } = await supabase.rpc('resolve_attendance_punches', {
    p_school: schoolId,
    p_date: date,
  })

  if (error) return { error: pgMessage(error, 'attendance') }

  const row = Array.isArray(data) ? data[0] : data
  const students = Number(row?.students_marked) || 0
  const staff = Number(row?.staff_marked) || 0
  const unknown = Number(row?.unknown_punches) || 0

  revalidateAll()

  if (!students && !staff) {
    return ok(
      unknown
        ? `Nothing to mark — ${unknown} punch${unknown === 1 ? '' : 'es'} came from unenrolled device IDs.`
        : 'No punches to resolve for that day.'
    )
  }

  return ok(
    `${students} student${students === 1 ? '' : 's'} and ${staff} staff marked` +
      (unknown ? ` · ${unknown} punch${unknown === 1 ? '' : 'es'} from unknown device IDs` : '') +
      '.'
  )
}

/* =============================================================== settings */

export async function saveAttendanceSettings(_prev, formData) {
  const { supabase, schoolId } = await ctx()
  if (!schoolId) return { error: 'No active school.' }

  const late = text(formData.get('late_after'))
  const half = text(formData.get('half_day_after'))

  if (!late || !half) return { error: 'Both time thresholds are required.' }
  // A half-day cut-off before the late cut-off would make every late arrival a
  // half day, which is the opposite of what the school means.
  if (half <= late) return { error: 'The half-day cut-off must be later than the late cut-off.' }

  const gap = num(formData.get('min_punch_gap_minutes')) ?? 5
  if (gap < 0 || gap > 120) return { error: 'The debounce gap must be between 0 and 120 minutes.' }

  const payload = {
    school_id: schoolId,
    late_after: late,
    half_day_after: half,
    auto_absent: bool(formData.get('auto_absent')),
    min_punch_gap_minutes: gap,
    min_session_minutes: num(formData.get('min_session_minutes')) ?? 60,
  }

  const { error } = await supabase
    .from('attendance_settings')
    .upsert(payload, { onConflict: 'school_id' })

  if (error) return { error: pgMessage(error, 'setting') }

  revalidateAll()
  return ok('Attendance rules saved.')
}
