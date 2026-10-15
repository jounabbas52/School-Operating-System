'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  ALL_MONTHS,
  FEE_METHOD_IDS,
  FEE_TYPE_IDS,
  POLICY_COMPONENTS,
  componentsForMonth,
  monthKey,
} from '@/lib/fee-options'

// Authority is RLS. fee_policies, fee_challans and fee_payments all carry the
// standard tenant policy set against fees.read / fees.write, so a caller
// without the permission gets an error or a zero-row update rather than a
// silent success. What follows is input shaping and money arithmetic.
//
// One rule runs through this file: nothing recomputes a challan that has
// already been issued. A policy edited in March must not rewrite January's
// bill, so the generator reads the policy once, writes the figures onto the
// challan, and never looks back.

const PATHS = [
  '/school/fees',
  '/school/fees/student',
  '/school/fees/collect',
  '/school/fees/challans',
  '/school/fees/challans/create',
  '/school/fees/policy',
  '/school/fees/reports',
]

function revalidateAll() {
  for (const p of PATHS) revalidatePath(p)
  revalidatePath('/school/reports')
  revalidatePath('/school')
}

function pgMessage(error, subject = 'challan') {
  if (error.code === '23505') {
    if (error.message.includes('one_per_period')) {
      return 'That student already has a challan for this month and fee type.'
    }
    if (error.message.includes('one_active_per_class')) {
      return 'That class already has an active fee policy. Deactivate it first.'
    }
    if (error.message.includes('challan_number')) return 'That challan number is already used.'
    if (error.message.includes('receipt_no')) return 'That receipt number is already used.'
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
const ok = (message) => ({ ok: message, at: Date.now() })

// Checkbox groups post one value per checked box, so getAll is the whole read.
const monthList = (formData, name) => {
  const months = formData
    .getAll(name)
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 12)
  return [...new Set(months)].sort((a, b) => a - b)
}

/* ============================================================= fee policy */

export async function savePolicy(_prev, formData) {
  const id = text(formData.get('id'))
  const name = text(formData.get('name'))

  if (!name) return { error: 'Enter a policy name.' }

  const tuition = money(formData.get('tuition_fee'))
  if (tuition < 0) return { error: 'Tuition fee cannot be negative.' }

  const status = text(formData.get('status')) ?? 'active'
  if (!['active', 'inactive'].includes(status)) return { error: 'Unknown status.' }

  const { supabase, schoolId } = await ctx()
  if (!schoolId) return { error: 'No active school.' }

  const payload = {
    school_id: schoolId,
    name,
    class_id: text(formData.get('class_id')),
    session_id: text(formData.get('session_id')),
    notes: text(formData.get('notes')),
    status,
  }

  // One loop over the component definitions rather than five copy-pasted
  // blocks -- adding a sixth component should be a line in fee-options.js.
  for (const c of POLICY_COMPONENTS) {
    const amount = money(formData.get(c.amount))
    if (amount < 0) return { error: `${c.label} cannot be negative.` }
    payload[c.amount] = amount
    payload[c.months] = monthList(formData, c.months)
  }

  if (id) {
    const { error } = await supabase.from('fee_policies').update(payload).eq('id', id)
    if (error) return { error: pgMessage(error, 'policy') }
  } else {
    const { error } = await supabase.from('fee_policies').insert(payload)
    if (error) return { error: pgMessage(error, 'policy') }
  }

  revalidateAll()
  return ok(id ? `${name} updated.` : `${name} created.`)
}

export async function deletePolicy(formData) {
  const id = String(formData.get('id'))
  const { supabase } = await ctx()

  const { error } = await supabase
    .from('fee_policies')
    .update({ is_deleted: true, deleted_at: new Date().toISOString(), status: 'inactive' })
    .eq('id', id)

  if (error) throw new Error(pgMessage(error, 'policy'))
  revalidateAll()
}

export async function togglePolicy(formData) {
  const id = String(formData.get('id'))
  const status = String(formData.get('status')) === 'active' ? 'active' : 'inactive'

  const { supabase } = await ctx()
  const { error } = await supabase.from('fee_policies').update({ status }).eq('id', id)
  if (error) throw new Error(pgMessage(error, 'policy'))
  revalidateAll()
}

/* ================================================================ challan */

export async function saveChallan(_prev, formData) {
  const id = text(formData.get('id'))
  const studentId = text(formData.get('student_id'))
  const feeType = text(formData.get('fee_type')) ?? 'monthly'
  const amount = money(formData.get('amount'))
  const dueDate = text(formData.get('due_date'))

  if (!studentId) return { error: 'Choose a student.' }
  if (!FEE_TYPE_IDS.includes(feeType)) return { error: 'Unknown fee type.' }
  if (amount <= 0) return { error: 'Enter an amount greater than zero.' }
  if (!dueDate) return { error: 'Choose a due date.' }

  const { supabase, schoolId } = await ctx()
  if (!schoolId) return { error: 'No active school.' }

  const { data: student } = await supabase
    .from('students')
    .select('current_class_id, current_section_id')
    .eq('id', studentId)
    .maybeSingle()

  if (!student) return { error: 'That student no longer exists.' }

  const payload = {
    school_id: schoolId,
    student_id: studentId,
    // Copied off the student at issue time, not joined. A student promoted in
    // July must not drag last year's challans into their new class.
    class_id: student.current_class_id,
    section_id: student.current_section_id,
    fee_type: feeType,
    amount,
    late_fee: money(formData.get('late_fee')),
    discount: money(formData.get('discount')),
    due_date: dueDate,
    period_month: text(formData.get('period_month')),
    description: text(formData.get('description')),
  }

  if (id) {
    // net_amount and total_amount are written by the database trigger, so
    // they are deliberately absent here.
    const { error } = await supabase.from('fee_challans').update(payload).eq('id', id)
    if (error) return { error: pgMessage(error) }
  } else {
    const { data: challanNumber } = await supabase.rpc('next_challan_number', {
      p_school: schoolId,
      p_prefix: 'CH',
    })

    const { error } = await supabase
      .from('fee_challans')
      .insert({ ...payload, challan_number: challanNumber })
    if (error) return { error: pgMessage(error) }
  }

  revalidateAll()
  return ok(id ? 'Challan updated.' : 'Challan generated.')
}

// A whole class, one press. The fee comes from the student's own final_fee
// where they have one, so a sibling discount is honoured without anyone
// editing forty challans afterwards.
export async function generateClassChallans(_prev, formData) {
  const classId = text(formData.get('class_id'))
  const feeType = text(formData.get('fee_type')) ?? 'monthly'
  const dueDate = text(formData.get('due_date'))
  const periodMonth = text(formData.get('period_month'))
  const fallback = money(formData.get('amount'))

  if (!classId) return { error: 'Choose a class.' }
  if (!dueDate) return { error: 'Choose a due date.' }
  if (!FEE_TYPE_IDS.includes(feeType)) return { error: 'Unknown fee type.' }

  const { supabase, schoolId } = await ctx()
  if (!schoolId) return { error: 'No active school.' }

  const sectionId = text(formData.get('section_id'))

  let studentQuery = supabase
    .from('students')
    .select('id, first_name, last_name, final_fee, base_fee, current_class_id, current_section_id')
    .eq('school_id', schoolId)
    .eq('is_deleted', false)
    .eq('status', 'active')
    .eq('current_class_id', classId)

  if (sectionId) studentQuery = studentQuery.eq('current_section_id', sectionId)

  const { data: students, error: readError } = await studentQuery
  if (readError) return { error: pgMessage(readError) }
  if (!students?.length) return { error: 'No active students match that class and section.' }

  const rows = []
  const skipped = []

  for (const s of students) {
    const amount = Number(s.final_fee) || Number(s.base_fee) || fallback
    // A zero-rupee challan is noise in the collection list, not a bill.
    if (amount <= 0) {
      skipped.push([s.first_name, s.last_name].filter(Boolean).join(' '))
      continue
    }

    rows.push({
      school_id: schoolId,
      student_id: s.id,
      class_id: s.current_class_id,
      section_id: s.current_section_id,
      fee_type: feeType,
      amount,
      late_fee: 0,
      discount: 0,
      due_date: dueDate,
      period_month: periodMonth,
      description: text(formData.get('description')),
    })
  }

  if (!rows.length) {
    return { error: 'Nobody in that class has a fee on file. Set fees on the students first.' }
  }

  // Numbers are minted one at a time because next_challan_number() reads the
  // table's current maximum; issuing them in a single batch would hand every
  // row the same number and fail the unique constraint.
  for (const row of rows) {
    const { data: challanNumber } = await supabase.rpc('next_challan_number', {
      p_school: schoolId,
      p_prefix: 'CH',
    })
    row.challan_number = challanNumber
  }

  // ignoreDuplicates so re-running a month tops up the students who were
  // added since, rather than failing on the ones already billed.
  const { data: inserted, error } = await supabase
    .from('fee_challans')
    .upsert(rows, {
      onConflict: 'school_id,student_id,period_month,fee_type',
      ignoreDuplicates: true,
    })
    .select('id')

  if (error) return { error: pgMessage(error) }

  const made = inserted?.length ?? 0
  const already = rows.length - made

  revalidateAll()
  return ok(
    `${made} challan${made === 1 ? '' : 's'} generated` +
      (already > 0 ? ` · ${already} already existed` : '') +
      (skipped.length ? ` · ${skipped.length} skipped with no fee on file` : '') +
      '.'
  )
}

// Every student in the school, billed from their class's active policy. This
// is the Monthly Batch mode: the policy says what a class owes in a given
// month, so one press covers the school.
export async function generateMonthlyBatch(_prev, formData) {
  const year = num(formData.get('year'))
  const month = num(formData.get('month'))
  const dueDate = text(formData.get('due_date'))

  if (!year || !month) return { error: 'Choose a month.' }
  if (month < 1 || month > 12) return { error: 'Choose a valid month.' }
  if (!dueDate) return { error: 'Choose a due date.' }

  const { supabase, schoolId } = await ctx()
  if (!schoolId) return { error: 'No active school.' }

  const period = monthKey(year, month)

  const [{ data: policies }, { data: students }] = await Promise.all([
    supabase
      .from('fee_policies')
      .select('*')
      .eq('school_id', schoolId)
      .eq('is_deleted', false)
      .eq('status', 'active'),
    supabase
      .from('students')
      .select('id, final_fee, base_fee, current_class_id, current_section_id')
      .eq('school_id', schoolId)
      .eq('is_deleted', false)
      .eq('status', 'active'),
  ])

  if (!policies?.length) {
    return { error: 'No active fee policy. Set one up under Fees → Fee Policy first.' }
  }
  if (!students?.length) return { error: 'There are no active students to bill.' }

  const policyByClass = new Map(policies.filter((p) => p.class_id).map((p) => [p.class_id, p]))

  const rows = []
  for (const s of students) {
    const policy = policyByClass.get(s.current_class_id)
    if (!policy) continue

    for (const component of componentsForMonth(policy, month)) {
      // The student's own tuition figure wins over the policy's: that is
      // where a scholarship or a sibling discount lives.
      const amount =
        component.feeType === 'monthly'
          ? Number(s.final_fee) || Number(s.base_fee) || component.amount
          : component.amount

      if (amount <= 0) continue

      rows.push({
        school_id: schoolId,
        student_id: s.id,
        class_id: s.current_class_id,
        section_id: s.current_section_id,
        policy_id: policy.id,
        fee_type: component.feeType,
        amount,
        late_fee: 0,
        discount: 0,
        due_date: dueDate,
        period_month: period,
        description: component.label,
      })
    }
  }

  if (!rows.length) {
    return { error: 'No policy bills anything in that month. Check the policy month selections.' }
  }

  for (const row of rows) {
    const { data: challanNumber } = await supabase.rpc('next_challan_number', {
      p_school: schoolId,
      p_prefix: 'CH',
    })
    row.challan_number = challanNumber
  }

  const { data: inserted, error } = await supabase
    .from('fee_challans')
    .upsert(rows, {
      onConflict: 'school_id,student_id,period_month,fee_type',
      ignoreDuplicates: true,
    })
    .select('id')

  if (error) return { error: pgMessage(error) }

  const made = inserted?.length ?? 0
  const already = rows.length - made

  revalidateAll()
  return ok(
    `${made} challan${made === 1 ? '' : 's'} generated` +
      (already > 0 ? ` · ${already} already existed` : '') +
      '.'
  )
}

export async function deleteChallan(formData) {
  const id = String(formData.get('id'))
  const { supabase } = await ctx()

  // Soft delete. Payments point here; a hard delete would take receipts with
  // it.
  const { error } = await supabase
    .from('fee_challans')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw new Error(pgMessage(error))
  revalidateAll()
}

export async function cancelChallan(formData) {
  const id = String(formData.get('id'))
  const { supabase } = await ctx()

  const { error } = await supabase.from('fee_challans').update({ status: 'cancelled' }).eq('id', id)
  if (error) throw new Error(pgMessage(error))
  revalidateAll()
}

/* ================================================================ payment */

export async function recordPayment(_prev, formData) {
  const challanId = text(formData.get('challan_id'))
  const amount = money(formData.get('amount_paid'))
  const method = text(formData.get('method')) ?? 'cash'

  if (!challanId) return { error: 'Choose a challan.' }
  if (amount <= 0) return { error: 'Enter an amount greater than zero.' }
  if (!FEE_METHOD_IDS.includes(method)) return { error: 'Unknown payment method.' }

  const { supabase, schoolId } = await ctx()
  if (!schoolId) return { error: 'No active school.' }

  const { data: challan } = await supabase
    .from('fee_challans')
    .select('id, student_id, net_amount, total_amount, amount, paid_amount, status')
    .eq('id', challanId)
    .maybeSingle()

  if (!challan) return { error: 'That challan no longer exists.' }
  if (challan.status === 'cancelled') return { error: 'That challan has been cancelled.' }

  const net = Number(challan.net_amount ?? challan.total_amount ?? challan.amount) || 0
  const alreadyPaid = Number(challan.paid_amount) || 0
  const outstanding = net - alreadyPaid

  if (outstanding <= 0) return { error: 'That challan is already paid in full.' }
  // Overpayment is almost always a typo, and the challan trigger would happily
  // record it.
  if (amount > outstanding) {
    return { error: `That is more than the Rs ${Math.round(outstanding)} still outstanding.` }
  }

  const { data: receiptNo } = await supabase.rpc('next_receipt_number', {
    p_school: schoolId,
    p_prefix: 'RC',
  })

  // paid_amount and status on the challan are written by the recalc trigger
  // in schema.sql, not here -- two writers would drift.
  const { error } = await supabase.from('fee_payments').insert({
    school_id: schoolId,
    challan_id: challanId,
    student_id: challan.student_id,
    amount_paid: amount,
    method,
    reference: text(formData.get('reference')),
    receipt_no: receiptNo,
    notes: text(formData.get('notes')),
    paid_at: text(formData.get('paid_at')) ?? new Date().toISOString(),
  })

  if (error) return { error: pgMessage(error, 'payment') }

  revalidateAll()
  return ok(`Rs ${Math.round(amount).toLocaleString('en-PK')} received · receipt ${receiptNo}.`)
}

export async function deletePayment(formData) {
  const id = String(formData.get('id'))
  const { supabase } = await ctx()

  // A hard delete, unusually: the recalc trigger fires on DELETE, so the
  // challan's paid_amount corrects itself. A soft delete would leave the
  // challan believing it had been paid.
  const { error } = await supabase.from('fee_payments').delete().eq('id', id)
  if (error) throw new Error(pgMessage(error, 'payment'))
  revalidateAll()
}

/* ------------------------------------------------------------ late fees */

// Stamp the configured late fee onto everything overdue. Run from the
// collection screen rather than on a schedule, so a school that waives fines
// never accidentally charges one.
export async function applyLateFees(_prev, formData) {
  const period = text(formData.get('period_month'))

  const { supabase, schoolId } = await ctx()
  if (!schoolId) return { error: 'No active school.' }

  const { data: setting } = await supabase
    .from('settings')
    .select('value')
    .eq('school_id', schoolId)
    .eq('key', 'fees')
    .maybeSingle()

  const config = setting?.value ?? {}
  if (config.late_fee_enabled === false) {
    return { error: 'Late fees are switched off under Settings → Fee & Finance.' }
  }

  const perDay = Number(config.late_fee_per_day) || 0
  const grace = Number(config.grace_days) || 0
  if (perDay <= 0) return { error: 'No late fee per day is configured.' }

  let query = supabase
    .from('fee_challans')
    .select('id, due_date, late_fee, paid_amount, net_amount')
    .eq('school_id', schoolId)
    .eq('is_deleted', false)
    .in('status', ['open', 'partial', 'overdue'])

  if (period) query = query.eq('period_month', period)

  const { data: challans, error: readError } = await query
  if (readError) return { error: pgMessage(readError) }

  const today = Date.now()
  let touched = 0

  for (const c of challans ?? []) {
    if (!c.due_date) continue
    const overdueDays = Math.floor(
      (today - Date.parse(`${c.due_date}T23:59:59Z`)) / 86400000
    )
    const chargeable = overdueDays - grace
    if (chargeable <= 0) continue

    const fee = chargeable * perDay
    // Recomputed from the due date every run rather than added to, so running
    // this twice in one day does not double the fine.
    if (Number(c.late_fee) === fee) continue

    const { error } = await supabase.from('fee_challans').update({ late_fee: fee }).eq('id', c.id)
    if (!error) touched += 1
  }

  revalidateAll()
  return ok(
    touched
      ? `Late fee applied to ${touched} challan${touched === 1 ? '' : 's'}.`
      : 'Nothing is overdue past the grace period.'
  )
}
