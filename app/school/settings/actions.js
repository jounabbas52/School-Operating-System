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

  const perMonth = num(formData.get('late_fee_per_month')) ?? 0
  if (perMonth < 0) return { error: 'The late fee cannot be negative.' }

  const cap = num(formData.get('late_fee_cap')) ?? 0
  if (cap < 0) return { error: 'The late fee cap cannot be negative.' }

  const genDay = num(formData.get('auto_generate_day')) ?? 1
  if (genDay < 1 || genDay > 28) {
    return { error: 'Choose a billing day between 1 and 28.' }
  }

  const dueDay = num(formData.get('due_day')) ?? 10
  if (dueDay < 1 || dueDay > 28) return { error: 'Choose a due day between 1 and 28.' }

  const mode = text(formData.get('late_fee_mode')) ?? 'per_day'
  if (!['per_day', 'per_month'].includes(mode)) return { error: 'Unknown late fee mode.' }

  // Switching to a mode with no figure in it silently stops charging fines,
  // and the person who switched would have no way to know.
  if (mode === 'per_day' && perDay <= 0) {
    return { error: 'Set a late fee per day, or choose the per month mode.' }
  }
  if (mode === 'per_month' && perMonth <= 0) {
    return { error: 'Set a late fee per month, or choose the per day mode.' }
  }

  return saveBlock(
    'fees',
    {
      currency_code: text(formData.get('currency_code')) ?? 'PKR',
      currency_symbol: text(formData.get('currency_symbol')) ?? 'Rs',
      fee_frequency: text(formData.get('fee_frequency')) ?? 'monthly',
      challan_validity: num(formData.get('challan_validity')) ?? 30,
      // These are what applyLateFees() in the fee actions reads. Two modes,
      // because schools genuinely do both: so much per day past the grace
      // period, or a flat charge for each month a bill stays unpaid. The cap
      // matters on arrears -- an uncapped daily fine on a bill from last
      // January comes to more than the fee itself.
      late_fee_enabled: bool(formData.get('late_fee_enabled')),
      auto_mark_overdue: bool(formData.get('auto_mark_overdue')),
      grace_days: grace,
      late_fee_mode: mode,
      late_fee_per_day: perDay,
      late_fee_per_month: perMonth,
      late_fee_cap: cap,
      // The unattended monthly run. Stored as strings because
      // run_fee_generation() reads them out of the settings JSON with ->>.
      // Off unless somebody switches it on: it writes bills for every family
      // in the school, so it is not something to inherit by default.
      auto_generate_enabled: bool(formData.get('auto_generate_enabled')) ? 'true' : 'false',
      auto_generate_day: String(genDay),
      due_day: String(dueDay),
      fine_per_absence: num(formData.get('fine_per_absence')) ?? 0,
    },
    'Fee settings saved.'
  )
}

export async function saveNotificationSettings(_prev, formData) {
  const { supabase, schoolId } = await ctx()
  if (!schoolId) return { error: 'No active school.' }

  // THE WHATSAPP SWITCHES DO NOT LIVE IN THIS BLOCK.
  //
  // They are written straight to whatsapp_settings.auto_send, which is
  // what the dispatcher and whatsapp_auto_enqueue() actually read. Keeping
  // a second copy here would give the school two switches for the same
  // thing, and the day they disagreed the screen would be lying about
  // whether parents were being messaged.
  //
  // whatsapp_set_auto_send() accepts core.settings.write as well as
  // whatsapp.write, which is what lets this page own them at all -- RLS on
  // whatsapp_settings would otherwise refuse the administrator editing
  // Notifications.
  const { error: waError } = await supabase.rpc('whatsapp_set_auto_send', {
    p_flags: {
      absence: bool(formData.get('wa_absence')),
      fee_due: bool(formData.get('wa_fee_due')),
      fee_received: bool(formData.get('wa_fee_received')),
      result: bool(formData.get('wa_result')),
      admission: bool(formData.get('wa_admission')),
    },
  })

  // Reported rather than swallowed: unlike an automatic send, this IS the
  // thing the user just asked for, and a switch that silently did not save
  // is how a school believes parents are being told when they are not.
  if (waError && waError.code !== '42501') {
    return { error: `Notification settings saved, but WhatsApp: ${waError.message}` }
  }

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

/* ====================================================== printed documents */

/**
 * The letterhead, the stamps, the signatures and the bank block.
 *
 * A third store, and deliberately not one of the two above: these fields are
 * neither school identity (they are about PAPER -- a watermark, a copy label,
 * a fine figure) nor behavioural toggles. They are a template, with its own
 * table and its own NOT NULL defaults, and putting a watermark path into a
 * jsonb blob would mean no column to hang a default off and no way for
 * 032_documents.sql to seed a school's existing logo into it.
 *
 * Every print screen reads it through loadDocument() in lib/documents.js.
 */
export async function saveDocumentSettings(_prev, formData) {
  const { supabase, schoolId } = await ctx()
  if (!schoolId) return { error: 'No active school.' }

  const fine = num(formData.get('challan_fine_amount')) ?? 0
  if (fine < 0) return { error: 'The late-payment charge cannot be negative.' }

  // The copy labels arrive as one line of comma-separated text, because what
  // they are CALLED differs by school and how MANY there are differs too.
  // Empty means fall back to the three defaults rather than printing a sheet
  // with no copies on it at all.
  const copies = String(formData.get('challan_copies') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4)

  const headerStyle = text(formData.get('header_style')) ?? 'classic'
  const paper = text(formData.get('paper_size')) ?? 'a4'

  const { error } = await supabase.from('document_settings').upsert(
    {
      school_id: schoolId,

      school_name: text(formData.get('school_name')),
      tagline: text(formData.get('tagline')),
      address: text(formData.get('address')),
      city: text(formData.get('city')),
      phone: text(formData.get('phone')),
      phone_alt: text(formData.get('phone_alt')),
      email: text(formData.get('email')),
      website: text(formData.get('website')),
      registration_no: text(formData.get('registration_no')),

      logo_url: text(formData.get('logo_url')),
      watermark_url: text(formData.get('watermark_url')),
      school_stamp_url: text(formData.get('school_stamp_url')),
      principal_stamp_url: text(formData.get('principal_stamp_url')),

      principal_name: text(formData.get('principal_name')),
      principal_label: text(formData.get('principal_label')) ?? 'Principal',
      principal_signature_url: text(formData.get('principal_signature_url')),
      accountant_name: text(formData.get('accountant_name')),
      accountant_label: text(formData.get('accountant_label')) ?? 'Accountant',
      accountant_signature_url: text(formData.get('accountant_signature_url')),

      bank_name: text(formData.get('bank_name')),
      bank_branch: text(formData.get('bank_branch')),
      bank_account_title: text(formData.get('bank_account_title')),
      bank_account_number: text(formData.get('bank_account_number')),
      bank_iban: text(formData.get('bank_iban')),
      bank_note: text(formData.get('bank_note')),

      challan_title: text(formData.get('challan_title')) ?? 'FEE CHALLAN',
      challan_copies: copies.length ? copies : ['Bank Copy', 'School Copy', 'Student Copy'],
      challan_instructions: String(formData.get('challan_instructions') ?? '').trim(),
      challan_show_barcode: bool(formData.get('challan_show_barcode')),
      challan_show_bank: bool(formData.get('challan_show_bank')),
      challan_show_fine: bool(formData.get('challan_show_fine')),
      challan_fine_amount: fine,

      accent_color: text(formData.get('accent_color')) ?? '#1e3a8a',
      // Checked here rather than trusted: the columns carry CHECK
      // constraints, and a hand-built request would come back as a raw
      // 23514 the user cannot act on.
      header_style: ['classic', 'banner', 'minimal'].includes(headerStyle)
        ? headerStyle
        : 'classic',
      paper_size: ['a4', 'letter', 'legal'].includes(paper) ? paper : 'a4',
      footer_note: String(formData.get('footer_note') ?? '').trim(),
      show_print_time: bool(formData.get('show_print_time')),
    },
    { onConflict: 'school_id' }
  )

  if (error) return { error: pgMessage(error) }

  // Every print route reads this, and they live all over the app -- fees,
  // payroll, students. 'layout' so the whole subtree drops its cache rather
  // than listing nine paths that will be ten tomorrow.
  revalidatePath('/school', 'layout')
  revalidatePath('/school/settings')
  return ok('Document settings saved.')
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
