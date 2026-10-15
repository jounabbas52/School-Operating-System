'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { PALETTES } from '@/lib/appearance'

// Authority is RLS. schools carries a policy requiring core.settings.write,
// and the settings table carries the same -- so a caller without it gets an
// error rather than a silent success. What follows is input shaping.
//
// Two stores, on purpose:
//   - schools   holds the identity fields that get PRINTED (name, address,
//               principal). A missing key there would render as a blank line
//               on a hundred ID cards before anyone noticed.
//   - settings  holds the behavioural blocks as jsonb, one row per key, where
//               a new toggle should not need a migration.

function revalidateAll() {
  revalidatePath('/school/settings')
  // 'layout', not the default 'page': the appearance block is read by the
  // school layout itself (palette, sidebar style, the date in the top bar),
  // so every nested route renders it. Revalidating only /school would leave
  // the old accent colour cached on every other screen.
  revalidatePath('/school', 'layout')
  // The fee screens read settings.fees for late-fee rules, and the result
  // screens read settings.academic for the pass mark.
  revalidatePath('/school/fees/collect')
  revalidatePath('/school/exams/results')
}

function pgMessage(error) {
  if (error.code === '42501') return 'You do not have permission to change school settings.'
  if (error.code === '23505') return 'That value is already in use.'
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
const ok = (message) => ({ ok: message, at: Date.now() })

const SCHOOL_TYPES = ['private', 'public', 'trust', 'ngo', 'other']
const SIDEBAR_STYLES = ['dark', 'light']
const DATE_FORMATS = ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD']

/* ============================================================ school info */

export async function saveSchoolInfo(_prev, formData) {
  const name = text(formData.get('school_name'))
  if (!name) return { error: 'Enter the school name.' }

  const type = text(formData.get('school_type')) ?? 'private'
  if (!SCHOOL_TYPES.includes(type)) return { error: 'Unknown school type.' }

  const established = num(formData.get('established_year'))
  const thisYear = new Date().getFullYear()
  if (established !== null && (established < 1800 || established > thisYear)) {
    return { error: `The established year must be between 1800 and ${thisYear}.` }
  }

  const { supabase, schoolId } = await ctx()
  if (!schoolId) return { error: 'No active school.' }

  const { error } = await supabase
    .from('schools')
    .update({
      school_name: name,
      short_code: text(formData.get('short_code')),
      school_type: type,
      affiliation: text(formData.get('affiliation')),
      established_year: established,
      principal_name: text(formData.get('principal_name')),
      address: text(formData.get('address')),
      city: text(formData.get('city')),
      province: text(formData.get('province')),
      phone: text(formData.get('phone')),
      email: text(formData.get('email')),
      website: text(formData.get('website')),
    })
    .eq('id', schoolId)

  if (error) return { error: pgMessage(error) }

  revalidateAll()
  return ok('School information saved.')
}

/* ------------------------------------------------------- the jsonb blocks */

// One row per block, keyed. upsert on (school_id, key) so saving twice is an
// update rather than a duplicate-key error.
async function saveBlock(key, value, message) {
  const { supabase, schoolId } = await ctx()
  if (!schoolId) return { error: 'No active school.' }

  const { error } = await supabase
    .from('settings')
    .upsert({ school_id: schoolId, key, value }, { onConflict: 'school_id,key' })

  if (error) return { error: pgMessage(error) }

  revalidateAll()
  return ok(message)
}

export async function saveAcademicSettings(_prev, formData) {
  const passMarks = num(formData.get('pass_marks')) ?? 33
  if (passMarks < 0 || passMarks > 100) {
    return { error: 'Pass marks must be a percentage between 0 and 100.' }
  }

  const periods = num(formData.get('periods_per_day')) ?? 7
  if (periods < 1 || periods > 20) return { error: 'Periods per day must be between 1 and 20.' }

  return saveBlock(
    'academic',
    {
      academic_year: text(formData.get('academic_year')),
      working_days_per_week: num(formData.get('working_days_per_week')) ?? 5,
      session_start_month: num(formData.get('session_start_month')),
      session_end_month: num(formData.get('session_end_month')),
      school_start_time: text(formData.get('school_start_time')),
      school_end_time: text(formData.get('school_end_time')),
      periods_per_day: periods,
      period_duration: num(formData.get('period_duration')) ?? 45,
      // Read by the exam and test result screens to decide pass or fail.
      pass_marks: passMarks,
      grade_scale: text(formData.get('grade_scale')) ?? 'percentage',
    },
    'Academic settings saved.'
  )
}

export async function saveFeeSettings(_prev, formData) {
  const grace = num(formData.get('grace_period')) ?? 10
  if (grace < 0) return { error: 'The grace period cannot be negative.' }

  const perDay = num(formData.get('late_fee_per_day')) ?? 0
  if (perDay < 0) return { error: 'The late fee cannot be negative.' }

  return saveBlock(
    'fees',
    {
      currency_code: text(formData.get('currency_code')) ?? 'PKR',
      currency_symbol: text(formData.get('currency_symbol')) ?? 'Rs',
      fee_frequency: text(formData.get('fee_frequency')) ?? 'monthly',
      challan_validity: num(formData.get('challan_validity')) ?? 30,
      // These three are what applyLateFees() in the fee actions reads.
      late_fee_enabled: bool(formData.get('late_fee_enabled')),
      auto_mark_overdue: bool(formData.get('auto_mark_overdue')),
      grace_days: grace,
      late_fee_per_day: perDay,
      fine_per_absence: num(formData.get('fine_per_absence')) ?? 0,
    },
    'Fee settings saved.'
  )
}

export async function saveNotificationSettings(_prev, formData) {
  return saveBlock(
    'notifications',
    {
      email_fee_reminders: bool(formData.get('email_fee_reminders')),
      email_low_attendance: bool(formData.get('email_low_attendance')),
      email_exam_results: bool(formData.get('email_exam_results')),
      sms_fee_alerts: bool(formData.get('sms_fee_alerts')),
      sms_attendance_alerts: bool(formData.get('sms_attendance_alerts')),
      sms_exam_alerts: bool(formData.get('sms_exam_alerts')),
      in_app_all: bool(formData.get('in_app_all')),
    },
    'Notification settings saved.'
  )
}

export async function saveAppearanceSettings(_prev, formData) {
  return saveBlock(
    'appearance',
    {
      color_theme: PALETTES[text(formData.get('color_theme'))] ? text(formData.get('color_theme')) : 'violet',
      sidebar_style: SIDEBAR_STYLES.includes(text(formData.get('sidebar_style')))
        ? text(formData.get('sidebar_style'))
        : 'dark',
      // Pinned, not read from the form: the field renders as static text now,
      // so a posted language could only have come from a hand-built request.
      language: 'en',
      date_format: DATE_FORMATS.includes(text(formData.get('date_format')))
        ? text(formData.get('date_format'))
        : 'DD/MM/YYYY',
      timezone: text(formData.get('timezone')) ?? 'Asia/Karachi',
    },
    'Appearance settings saved.'
  )
}
