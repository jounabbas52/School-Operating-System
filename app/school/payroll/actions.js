'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  DEFAULT_SETTINGS,
  EXPENSE_CATEGORY_IDS,
  EXPENSE_STATUS_IDS,
  ITEM_STATUS_IDS,
  computePay,
  grossOf,
} from '@/lib/payroll-options'
import { PAYMENT_MODES } from '@/lib/staff-options'

// Authority is RLS. salary_structures and staff_salaries, payroll_runs and
// payroll_items are gated on payroll.*; expenses on accounts.*, which is where
// schema.sql put it. What follows is input shaping and the one write path that
// actually computes money.
//
// The rule that shapes this file: a generated month is a SNAPSHOT. Changing a
// salary in April must not alter what March paid, so the generator copies
// every figure onto the payroll item and nothing recomputes a month that has
// already been built.

const PATHS = [
  '/school/payroll',
  '/school/payroll/salaries',
  '/school/payroll/run',
  '/school/payroll/slips',
  '/school/payroll/reports',
  '/school/payroll/expenses',
  '/school/payroll/settings',
]

function revalidateAll() {
  for (const p of PATHS) revalidatePath(p)
  revalidatePath('/school')
}

function pgMessage(error, subject = 'record') {
  if (error.code === '23505') {
    if (error.message.includes('salary_structures')) return 'That designation already exists.'
    if (error.message.includes('staff_salaries')) return 'That employee already has a package.'
    if (error.message.includes('payroll_runs')) return 'Payroll for that month already exists.'
    if (error.message.includes('voucher')) return 'That voucher number is already used.'
    if (error.message.includes('holiday')) return 'That date is already a holiday.'
    return `That ${subject} already exists.`
  }
  if (error.code === '42501') return `You do not have permission to change ${subject}s.`
  if (error.code === '23503') return 'A linked record no longer exists. Reload and try again.'
  if (error.code === '23514') return 'Some values are out of range. Check the amounts and dates.'
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
const money = (v) => num(v) ?? 0
const bool = (v) => v === 'on' || v === 'true' || v === true
const ok = (message) => ({ ok: message, at: Date.now() })

const MODE_IDS = PAYMENT_MODES.map((m) => m.id)

/* ===================================================== salary structures */

export async function saveStructure(_prev, formData) {
  const id = text(formData.get('id'))
  const name = text(formData.get('name'))

  if (!name) return { error: 'Enter a designation.' }

  const basic = money(formData.get('basic_salary'))
  if (basic < 0) return { error: 'Basic salary cannot be negative.' }

  const { supabase, schoolId } = await ctx()
  if (!schoolId) return { error: 'No active school.' }

  const payload = {
    school_id: schoolId,
    name,
    grade: text(formData.get('grade')),
    basic_salary: basic,
    house_allowance: money(formData.get('house_allowance')),
    medical_allowance: money(formData.get('medical_allowance')),
    conveyance_allowance: money(formData.get('conveyance_allowance')),
    special_allowance: money(formData.get('special_allowance')),
    total_deductions: money(formData.get('total_deductions')),
    description: text(formData.get('description')),
    status: text(formData.get('status')) ?? 'active',
  }

  if (id) {
    const { error } = await supabase.from('salary_structures').update(payload).eq('id', id)
    if (error) return { error: pgMessage(error, 'structure') }
  } else {
    const { error } = await supabase.from('salary_structures').insert(payload)
    if (error) return { error: pgMessage(error, 'structure') }
  }

  revalidateAll()
  return ok(id ? `${name} updated.` : `${name} created.`)
}

export async function deleteStructure(formData) {
  const id = String(formData.get('id'))
  const { supabase } = await ctx()

  // Soft delete: staff rows name this structure, and the teacher screen reads
  // the designation off it.
  const { error } = await supabase
    .from('salary_structures')
    .update({ is_deleted: true, deleted_at: new Date().toISOString(), status: 'inactive' })
    .eq('id', id)

  if (error) throw new Error(pgMessage(error, 'structure'))
  revalidateAll()
}

/* ========================================================= staff salaries */

export async function saveStaffSalary(_prev, formData) {
  const id = text(formData.get('id'))
  const staffId = text(formData.get('staff_id'))

  if (!staffId) return { error: 'Choose an employee.' }

  const basic = money(formData.get('basic_salary'))
  if (basic <= 0) return { error: 'Enter a basic salary greater than zero.' }

  const mode = text(formData.get('payment_mode')) ?? 'bank_transfer'
  if (!MODE_IDS.includes(mode)) return { error: 'Unknown payment mode.' }

  const { supabase, schoolId } = await ctx()
  if (!schoolId) return { error: 'No active school.' }

  const payload = {
    school_id: schoolId,
    staff_id: staffId,
    structure_id: text(formData.get('structure_id')),
    basic_salary: basic,
    house_allowance: money(formData.get('house_allowance')),
    medical_allowance: money(formData.get('medical_allowance')),
    conveyance_allowance: money(formData.get('conveyance_allowance')),
    special_allowance: money(formData.get('special_allowance')),
    other_allowances: money(formData.get('other_allowances')),
    other_deductions: money(formData.get('other_deductions')),
    eobi_applicable: bool(formData.get('eobi_applicable')),
    pf_applicable: bool(formData.get('pf_applicable')),
    tax_annual: money(formData.get('tax_annual')),
    bank_name: text(formData.get('bank_name')),
    account_no: text(formData.get('account_no')),
    payment_mode: mode,
    effective_from: text(formData.get('effective_from')) ?? new Date().toISOString().slice(0, 10),
    notes: text(formData.get('notes')),
    status: 'active',
  }

  // One package per employee, so an edit and a first-time assignment are the
  // same write.
  const { error } = await supabase
    .from('staff_salaries')
    .upsert(payload, { onConflict: 'school_id,staff_id' })

  if (error) return { error: pgMessage(error, 'salary') }

  // staff.monthly_salary is what the teacher and HR directories print. Kept in
  // step here rather than joined, so those screens stay one query.
  await supabase
    .from('staff')
    .update({ monthly_salary: grossOf(payload) })
    .eq('id', staffId)

  revalidateAll()
  return ok(id ? 'Package updated.' : 'Package assigned.')
}

export async function deleteStaffSalary(formData) {
  const id = String(formData.get('id'))
  const { supabase } = await ctx()

  const { error } = await supabase
    .from('staff_salaries')
    .update({ is_deleted: true, deleted_at: new Date().toISOString(), status: 'inactive' })
    .eq('id', id)

  if (error) throw new Error(pgMessage(error, 'salary'))
  revalidateAll()
}

// Copy a template's amounts onto several employees at once. A template is not
// a link: the figures are COPIED, so raising one person's pay afterwards does
// not raise everyone on that grade.
export async function applyTemplate(_prev, formData) {
  const structureId = text(formData.get('structure_id'))
  const staffIds = formData.getAll('staff_id').map(String).filter(Boolean)
  const effectiveFrom =
    text(formData.get('effective_from')) ?? new Date().toISOString().slice(0, 10)

  if (!structureId) return { error: 'Choose a template.' }
  if (!staffIds.length) return { error: 'Select at least one employee.' }

  const { supabase, schoolId } = await ctx()
  if (!schoolId) return { error: 'No active school.' }

  const { data: structure } = await supabase
    .from('salary_structures')
    .select('*')
    .eq('id', structureId)
    .maybeSingle()

  if (!structure) return { error: 'That template no longer exists.' }

  const rows = staffIds.map((staffId) => ({
    school_id: schoolId,
    staff_id: staffId,
    structure_id: structure.id,
    basic_salary: Number(structure.basic_salary) || 0,
    house_allowance: Number(structure.house_allowance) || 0,
    medical_allowance: Number(structure.medical_allowance) || 0,
    conveyance_allowance: Number(structure.conveyance_allowance) || 0,
    special_allowance: Number(structure.special_allowance) || 0,
    other_allowances: 0,
    other_deductions: Number(structure.total_deductions) || 0,
    effective_from: effectiveFrom,
    status: 'active',
  }))

  const { error } = await supabase
    .from('staff_salaries')
    .upsert(rows, { onConflict: 'school_id,staff_id' })

  if (error) return { error: pgMessage(error, 'salary') }

  const gross = grossOf(rows[0])
  await supabase
    .from('staff')
    .update({ monthly_salary: gross, designation: structure.name })
    .in('id', staffIds)

  revalidateAll()
  return ok(`${structure.name} applied to ${staffIds.length} employee${staffIds.length === 1 ? '' : 's'}.`)
}

/* ============================================================ payroll run */

// Build one month's payroll.
//
// Everything is computed here and STORED. The screens never recompute a
// generated month: that is what makes a payslip reprintable in December and
// what makes "why was March different" answerable.
export async function generatePayroll(_prev, formData) {
  const runMonthValue = text(formData.get('run_month'))
  if (!runMonthValue) return { error: 'Choose a month.' }

  const { supabase, schoolId } = await ctx()
  if (!schoolId) return { error: 'No active school.' }

  const [{ data: settingsRow }, { data: workingDays }, { data: staff }] = await Promise.all([
    supabase.from('payroll_settings').select('*').eq('school_id', schoolId).maybeSingle(),
    supabase.rpc('payroll_working_days', { p_school: schoolId, p_month: runMonthValue }),
    supabase
      .from('staff')
      .select('id, first_name, last_name, staff_number, designation, status')
      .eq('school_id', schoolId)
      .eq('is_deleted', false)
      .eq('status', 'active'),
  ])

  const settings = settingsRow ?? DEFAULT_SETTINGS
  const days = Number(workingDays) || 0

  if (!staff?.length) return { error: 'There are no active staff to pay.' }

  const { data: packages } = await supabase
    .from('staff_salaries')
    .select('*')
    .eq('school_id', schoolId)
    .eq('is_deleted', false)

  const packageByStaff = new Map((packages ?? []).map((p) => [p.staff_id, p]))

  // Attendance for the month, counted once rather than per employee.
  const monthStart = runMonthValue
  const d = new Date(`${runMonthValue}T00:00:00Z`)
  const monthEnd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))
    .toISOString()
    .slice(0, 10)

  const { data: attendance } = await supabase
    .from('staff_attendance')
    .select('staff_id, status, is_paid_leave')
    .eq('school_id', schoolId)
    .eq('is_deleted', false)
    .gte('date', monthStart)
    .lte('date', monthEnd)

  const tally = new Map()
  for (const a of attendance ?? []) {
    const row = tally.get(a.staff_id) ?? { absent_days: 0, half_days: 0, late_marks: 0 }
    if (a.status === 'absent') row.absent_days += 1
    else if (a.status === 'late') row.late_marks += 1
    else if (a.status === 'half_day') row.half_days += 1
    // Paid leave costs nothing; unpaid leave is an absence by another name.
    // The flag defaults to true, so a school that never marks leave unpaid
    // never has a day docked for it.
    else if ((a.status === 'leave' || a.status === 'short_leave') && a.is_paid_leave === false) {
      row.absent_days += 1
    }
    tally.set(a.staff_id, row)
  }

  // The run row first: the items reference it.
  const { data: run, error: runError } = await supabase
    .from('payroll_runs')
    .upsert(
      {
        school_id: schoolId,
        run_month: runMonthValue,
        status: 'draft',
        working_days: days,
        generated_at: new Date().toISOString(),
      },
      { onConflict: 'school_id,run_month' }
    )
    .select('id, status')
    .single()

  if (runError) return { error: pgMessage(runError, 'payroll run') }

  // An approved or paid month is frozen. Regenerating it would rewrite
  // figures someone has already signed off.
  if (run.status === 'paid') {
    return { error: 'That month is already paid and cannot be regenerated.' }
  }

  const rows = []
  const skipped = []

  for (const s of staff) {
    const pkg = packageByStaff.get(s.id)
    if (!pkg) {
      skipped.push([s.first_name, s.last_name].filter(Boolean).join(' '))
      continue
    }

    const pay = computePay({
      pkg,
      settings,
      workingDays: days,
      attendance: tally.get(s.id) ?? {},
    })

    rows.push({
      school_id: schoolId,
      payroll_run_id: run.id,
      staff_id: s.id,
      ...pay,
      payment_mode: pkg.payment_mode ?? settings.default_payment_mode,
      status: 'draft',
    })
  }

  if (!rows.length) {
    return {
      error: 'Nobody has a salary package yet. Assign packages under Staff Salaries first.',
    }
  }

  const { error } = await supabase
    .from('payroll_items')
    .upsert(rows, { onConflict: 'school_id,payroll_run_id,staff_id' })

  if (error) return { error: pgMessage(error, 'payroll item') }

  revalidateAll()
  return ok(
    `Payroll generated for ${rows.length} employee${rows.length === 1 ? '' : 's'}` +
      (skipped.length ? ` · ${skipped.length} skipped with no package` : '') +
      '.'
  )
}

export async function approvePayroll(formData) {
  const id = String(formData.get('id'))
  const { supabase } = await ctx()

  // 'finalized' is the enum's word for what the screens call Approved -- see
  // 011_payroll.sql.
  const { error } = await supabase
    .from('payroll_runs')
    .update({ status: 'finalized', approved_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw new Error(pgMessage(error, 'payroll run'))

  await supabase
    .from('payroll_items')
    .update({ status: 'approved' })
    .eq('payroll_run_id', id)
    .eq('status', 'draft')

  revalidateAll()
}

export async function markPayrollPaid(formData) {
  const id = String(formData.get('id'))
  const { supabase, schoolId } = await ctx()

  const { data: run } = await supabase
    .from('payroll_runs')
    .select('id, status')
    .eq('id', id)
    .maybeSingle()

  if (!run) throw new Error('That payroll run no longer exists.')
  // Approval is what freezes the amounts and creates the audit trail; paying
  // an unapproved draft would skip it.
  if (run.status === 'draft') throw new Error('Approve the payroll before marking it paid.')

  const paidAt = new Date().toISOString()

  const { error } = await supabase
    .from('payroll_runs')
    .update({ status: 'paid', paid_at: paidAt })
    .eq('id', id)

  if (error) throw new Error(pgMessage(error, 'payroll run'))

  const { data: items } = await supabase
    .from('payroll_items')
    .select('id, staff_id, net_amount, payment_mode')
    .eq('payroll_run_id', id)
    .neq('status', 'hold')

  await supabase
    .from('payroll_items')
    .update({ status: 'paid', paid_at: paidAt })
    .eq('payroll_run_id', id)
    .neq('status', 'hold')

  // Salary payments are the accounts-side record of money leaving. Written
  // here so the Reports screen can answer "what did we actually disburse"
  // without reading payroll internals.
  if (items?.length) {
    await supabase.from('salary_payments').insert(
      items.map((i) => ({
        school_id: schoolId,
        staff_id: i.staff_id,
        payroll_run_id: id,
        amount: i.net_amount,
        paid_at: paidAt,
        method: i.payment_mode === 'bank_transfer' ? 'bank_transfer' : i.payment_mode ?? 'cash',
      }))
    )
  }

  revalidateAll()
}

export async function setItemStatus(formData) {
  const id = String(formData.get('id'))
  const status = String(formData.get('status'))
  if (!ITEM_STATUS_IDS.includes(status)) throw new Error('Unknown status.')

  const { supabase } = await ctx()
  const { error } = await supabase.from('payroll_items').update({ status }).eq('id', id)
  if (error) throw new Error(pgMessage(error, 'payroll item'))
  revalidateAll()
}

// An adjustment to one person's month: a bonus, a deduction, a correction.
// Only on a draft -- an approved figure is the point of approving.
export async function adjustItem(_prev, formData) {
  const id = text(formData.get('id'))
  if (!id) return { error: 'No payroll row chosen.' }

  const { supabase } = await ctx()

  const { data: item } = await supabase
    .from('payroll_items')
    .select('id, gross_amount, deduction_amount, status')
    .eq('id', id)
    .maybeSingle()

  if (!item) return { error: 'That payroll row no longer exists.' }
  if (item.status === 'paid') return { error: 'That row is already paid.' }

  const bonus = money(formData.get('bonus'))
  const extraDeduction = money(formData.get('extra_deduction'))

  const gross = (Number(item.gross_amount) || 0) + bonus
  const deductions = (Number(item.deduction_amount) || 0) + extraDeduction

  const { error } = await supabase
    .from('payroll_items')
    .update({
      gross_amount: gross,
      deduction_amount: deductions,
      net_amount: Math.max(0, gross - deductions),
      remarks: text(formData.get('remarks')),
    })
    .eq('id', id)

  if (error) return { error: pgMessage(error, 'payroll item') }

  revalidateAll()
  return ok('Adjustment saved.')
}

/* =============================================================== settings */

export async function savePayrollSettings(_prev, formData) {
  const { supabase, schoolId } = await ctx()
  if (!schoolId) return { error: 'No active school.' }

  const mode = text(formData.get('working_days_mode')) ?? 'calendar'
  if (!['calendar', 'fixed'].includes(mode)) return { error: 'Unknown working-days mode.' }

  const deductFrom = text(formData.get('deduct_from')) ?? 'gross'
  if (!['gross', 'basic'].includes(deductFrom)) return { error: 'Unknown deduction base.' }

  const paymentMode = text(formData.get('default_payment_mode')) ?? 'bank_transfer'
  if (!MODE_IDS.includes(paymentMode)) return { error: 'Unknown payment mode.' }

  const weeklyOffs = formData
    .getAll('weekly_offs')
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 7)

  // Seven days off is a school that never opens, and would make every
  // per-day rate a division by zero.
  if (weeklyOffs.length >= 7) return { error: 'The school cannot be closed every day.' }

  const cutoff = num(formData.get('cutoff_day')) ?? 25
  if (cutoff < 1 || cutoff > 31) return { error: 'The cut-off day must be between 1 and 31.' }

  const payload = {
    school_id: schoolId,
    working_days_mode: mode,
    fixed_working_days: num(formData.get('fixed_working_days')) ?? 26,
    weekly_offs: [...new Set(weeklyOffs)],
    deduct_absences: bool(formData.get('deduct_absences')),
    deduct_from: deductFrom,
    half_day_fraction: num(formData.get('half_day_fraction')) ?? 0.5,
    late_marks_per_day: num(formData.get('late_marks_per_day')) ?? 3,
    eobi_enabled: bool(formData.get('eobi_enabled')),
    eobi_amount: money(formData.get('eobi_amount')),
    pf_enabled: bool(formData.get('pf_enabled')),
    pf_percent: money(formData.get('pf_percent')),
    tax_enabled: bool(formData.get('tax_enabled')),
    default_payment_mode: paymentMode,
    cutoff_day: cutoff,
  }

  const { error } = await supabase
    .from('payroll_settings')
    .upsert(payload, { onConflict: 'school_id' })

  if (error) return { error: pgMessage(error, 'setting') }

  revalidateAll()
  return ok('Payroll settings saved.')
}

export async function addHoliday(_prev, formData) {
  const date = text(formData.get('holiday_date'))
  const name = text(formData.get('name'))

  if (!date) return { error: 'Choose a date.' }
  if (!name) return { error: 'Name the holiday.' }

  const { supabase, schoolId } = await ctx()
  if (!schoolId) return { error: 'No active school.' }

  const { error } = await supabase
    .from('payroll_holidays')
    .insert({ school_id: schoolId, holiday_date: date, name })

  if (error) return { error: pgMessage(error, 'holiday') }

  revalidateAll()
  return ok(`${name} added.`)
}

export async function deleteHoliday(formData) {
  const id = String(formData.get('id'))
  const { supabase } = await ctx()

  // A hard delete: the table is a short list of dates with nothing pointing
  // at it, and a soft-deleted holiday would still have to be filtered out of
  // the working-day count.
  const { error } = await supabase.from('payroll_holidays').delete().eq('id', id)
  if (error) throw new Error(pgMessage(error, 'holiday'))
  revalidateAll()
}

/* =============================================================== expenses */

export async function saveExpense(_prev, formData) {
  const id = text(formData.get('id'))
  const title = text(formData.get('title'))
  const amount = money(formData.get('amount'))

  if (!title) return { error: 'Enter a title.' }
  if (amount <= 0) return { error: 'Enter an amount greater than zero.' }

  const category = text(formData.get('category')) ?? 'misc'
  if (!EXPENSE_CATEGORY_IDS.includes(category)) return { error: 'Unknown category.' }

  const mode = text(formData.get('payment_method')) ?? 'cash'
  if (!MODE_IDS.includes(mode)) return { error: 'Unknown payment mode.' }

  const { supabase, schoolId } = await ctx()
  if (!schoolId) return { error: 'No active school.' }

  const payload = {
    school_id: schoolId,
    title,
    category,
    amount,
    expense_date: text(formData.get('expense_date')) ?? new Date().toISOString().slice(0, 10),
    vendor: text(formData.get('vendor')),
    paid_to: text(formData.get('paid_to')),
    bill_no: text(formData.get('bill_no')),
    payment_method: mode,
    description: text(formData.get('description')),
  }

  if (id) {
    const { error } = await supabase.from('expenses').update(payload).eq('id', id)
    if (error) return { error: pgMessage(error, 'expense') }
  } else {
    const { data: voucher } = await supabase.rpc('next_voucher_number', {
      p_school: schoolId,
      p_prefix: 'EXP',
    })

    // Everything starts Pending: the approval trail is the point of the
    // screen, and an expense that recorded itself as approved would have none.
    const { error } = await supabase
      .from('expenses')
      .insert({ ...payload, voucher_no: voucher, status: 'pending' })
    if (error) return { error: pgMessage(error, 'expense') }
  }

  revalidateAll()
  return ok(id ? `${title} updated.` : `${title} recorded.`)
}

export async function setExpenseStatus(formData) {
  const id = String(formData.get('id'))
  const status = String(formData.get('status'))
  if (!EXPENSE_STATUS_IDS.includes(status)) throw new Error('Unknown status.')

  const { supabase } = await ctx()

  const patch = { status }
  const now = new Date().toISOString()
  if (status === 'approved') patch.approved_at = now
  if (status === 'paid') patch.paid_at = now

  const { error } = await supabase.from('expenses').update(patch).eq('id', id)
  if (error) throw new Error(pgMessage(error, 'expense'))
  revalidateAll()
}

export async function deleteExpense(formData) {
  const id = String(formData.get('id'))
  const { supabase } = await ctx()

  const { error } = await supabase
    .from('expenses')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw new Error(pgMessage(error, 'expense'))
  revalidateAll()
}
