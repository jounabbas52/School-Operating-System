'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { FEE_METHOD_IDS, FEE_TYPE_IDS, POLICY_COMPONENTS } from '@/lib/fee-options'
import { dateLabel } from '@/lib/operations-options'
import {
  PHONE_COLUMNS,
  autoSend,
  recipientsFrom,
  schoolName,
} from '@/lib/whatsapp/auto-send'

// Authority is RLS. fee_policies, fee_challans, fee_challan_items,
// fee_payments and fee_payment_allocations all carry the standard tenant
// policy set against fees.read / fees.write, so a caller without the
// permission gets an error or a zero-row update rather than a silent success.
//
// Money arithmetic is not done here either, and that is the point of this
// file's shape. Raising a bill and taking a payment each touch several tables
// -- a challan and its lines, a payment and its allocations and the ledger --
// and a half-finished one of those is a wrong balance on a parent's receipt.
// So each is a single database function called once: generate_fee_vouchers,
// raise_fee_voucher, raise_manual_voucher, generate_class_vouchers,
// collect_fee. They either happen or they do not. What is left here is
// reading the form, naming the mistakes in it, and saying what happened.

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
const rupees = (n) => `Rs ${Math.round(Number(n) || 0).toLocaleString('en-PK')}`

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

// One typed-in bill: a fine, a trip, a class whose policy is not set up yet.
// raise_manual_voucher() mints the number, writes the header and its line
// together, stamps the balance the family was already carrying, and spends any
// credit they had -- in one transaction. Doing that over four round trips from
// here is what used to leave half-written bills behind when a step failed.
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

  const lateFee = money(formData.get('late_fee'))
  const discount = money(formData.get('discount'))
  const description = text(formData.get('description'))
  const period = text(formData.get('period_month'))

  if (id) {
    // An edit writes the line, not the header total: fee_challan_from_items()
    // sums the lines into the header, so setting amount here as well would
    // give one figure two authors and let them drift apart.
    const { data: items } = await supabase
      .from('fee_challan_items')
      .select('id')
      .eq('challan_id', id)
      .eq('is_deleted', false)

    const single = items?.length === 1

    if (single) {
      const line = { amount }
      if (description) line.description = description
      const { error } = await supabase.from('fee_challan_items').update(line).eq('id', items[0].id)
      if (error) return { error: pgMessage(error) }
    }

    const header = { fee_type: feeType, late_fee: lateFee, discount, due_date: dueDate, description }
    // A challan with no lines predates this module, or carries several lines
    // that no single-amount form can speak for. In the first case the header
    // still holds its own figure and has to be written here.
    if (!items?.length) header.amount = amount

    const { error } = await supabase.from('fee_challans').update(header).eq('id', id)
    if (error) return { error: pgMessage(error) }

    revalidateAll()
    return ok(items?.length > 1 ? 'Challan details updated. Line amounts were left alone.' : 'Challan updated.')
  }

  const { data: challanId, error } = await supabase.rpc('raise_manual_voucher', {
    p_student: studentId,
    p_period: period,
    p_fee_type: feeType,
    p_amount: amount,
    p_due_date: dueDate,
    p_description: description,
    p_late_fee: lateFee,
    p_discount: discount,
  })

  if (error) return { error: pgMessage(error) }
  if (!challanId) {
    return { error: 'That student already has a challan for this month and fee type.' }
  }

  revalidateAll()
  return ok('Challan generated.')
}

// A whole class, one press, for schools that bill each student's own fee
// figure rather than a class policy.
export async function generateClassChallans(_prev, formData) {
  const classId = text(formData.get('class_id'))
  const feeType = text(formData.get('fee_type')) ?? 'monthly'
  const dueDate = text(formData.get('due_date'))

  if (!classId) return { error: 'Choose a class.' }
  if (!dueDate) return { error: 'Choose a due date.' }
  if (!FEE_TYPE_IDS.includes(feeType)) return { error: 'Unknown fee type.' }

  const { supabase, schoolId } = await ctx()
  if (!schoolId) return { error: 'No active school.' }

  const { data, error } = await supabase.rpc('generate_class_vouchers', {
    p_class: classId,
    p_section: text(formData.get('section_id')),
    p_period: text(formData.get('period_month')),
    p_fee_type: feeType,
    p_due_date: dueDate,
    p_fallback: money(formData.get('amount')),
    p_description: text(formData.get('description')),
  })

  if (error) return { error: pgMessage(error) }

  const made = Number(data?.made) || 0
  const already = Number(data?.already) || 0
  const skipped = Number(data?.skipped) || 0

  if (!made && !already && skipped) {
    return { error: 'Nobody in that class has a fee on file. Set fees on the students first.' }
  }
  if (!made && !already && !skipped) {
    return { error: 'No active students match that class and section.' }
  }

  revalidateAll()
  return ok(
    `${made} challan${made === 1 ? '' : 's'} generated` +
      (already > 0 ? ` · ${already} already existed` : '') +
      (skipped > 0 ? ` · ${skipped} skipped with no fee on file` : '') +
      '.'
  )
}

// The monthly run. Every active student, billed from their class's policy and
// their own fee plan: a quarterly student gets one voucher covering three
// months in the month their quarter starts, and nothing in the other two.
export async function generateMonthlyBatch(_prev, formData) {
  const year = num(formData.get('year'))
  const month = num(formData.get('month'))
  const dueDate = text(formData.get('due_date'))

  if (!year || !month) return { error: 'Choose a month.' }
  if (month < 1 || month > 12) return { error: 'Choose a valid month.' }
  if (!dueDate) return { error: 'Choose a due date.' }

  const { supabase, schoolId } = await ctx()
  if (!schoolId) return { error: 'No active school.' }

  const { data, error } = await supabase.rpc('generate_fee_vouchers', {
    p_year: year,
    p_month: month,
    p_due_date: dueDate,
  })

  if (error) return { error: pgMessage(error) }

  const made = Number(data?.made) || 0
  const skipped = Number(data?.skipped) || 0

  if (!made && !skipped) {
    return { error: 'No active fee policy bills anything in that month. Check Fees → Fee Policy.' }
  }

  revalidateAll()
  return ok(
    `${made} voucher${made === 1 ? '' : 's'} generated for ${data?.period ?? 'that month'}` +
      (skipped > 0 ? ` · ${skipped} already billed or not due this month` : '') +
      '.'
  )
}

// Bill several months ahead on one voucher, for a family paying in advance.
// One number, one due date, one piece of paper -- not five challans the parent
// carries to the bank five times.
export async function billAhead(_prev, formData) {
  const studentId = text(formData.get('student_id'))
  const from = text(formData.get('from_month'))
  const months = num(formData.get('months')) ?? 1
  const dueDate = text(formData.get('due_date'))

  if (!studentId) return { error: 'Choose a student.' }
  if (!from) return { error: 'Choose the month to start from.' }
  if (months < 1 || months > 24) return { error: 'Choose between 1 and 24 months.' }

  const { supabase, schoolId } = await ctx()
  if (!schoolId) return { error: 'No active school.' }

  const { data: challanId, error } = await supabase.rpc('raise_fee_voucher', {
    p_student: studentId,
    p_from: from,
    p_months: months,
    p_due_date: dueDate,
    p_note: text(formData.get('note')),
  })

  if (error) return { error: pgMessage(error) }
  if (!challanId) {
    return {
      error: 'Every month in that range is already billed, or the class has no active fee policy.',
    }
  }

  revalidateAll()
  return ok(`Voucher raised for ${months} month${months === 1 ? '' : 's'} from ${from.slice(0, 7)}.`)
}

export async function deleteChallan(formData) {
  const id = String(formData.get('id'))
  const { supabase } = await ctx()

  // Soft delete. Payments point here; a hard delete would take receipts with
  // it. The ledger trigger removes the charge entry, so the balance drops.
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

// One payment, any number of bills. The cashier types what the parent handed
// over; collect_fee() spreads it across the open challans oldest first, and
// whatever is left over stays on the account as credit against the next bill.
// That is the whole answer to "he wants to pay three pendings and two months
// ahead, together": it is one amount and one receipt.
//
// A split posts matching split_challan / split_amount pairs to override the
// oldest-first order -- the cashier deciding which bills this money clears.
export async function collectFee(_prev, formData) {
  const studentId = text(formData.get('student_id'))
  const amount = money(formData.get('amount'))
  const method = text(formData.get('method')) ?? 'cash'

  if (!studentId) return { error: 'Choose a student.' }
  if (amount <= 0) return { error: 'Enter an amount greater than zero.' }
  if (!FEE_METHOD_IDS.includes(method)) return { error: 'Unknown payment method.' }

  const { supabase, schoolId } = await ctx()
  if (!schoolId) return { error: 'No active school.' }

  const challanIds = formData.getAll('split_challan').map((v) => String(v))
  const splitAmounts = formData.getAll('split_amount').map((v) => money(v))

  let splits = null
  if (challanIds.length) {
    splits = challanIds
      .map((challan_id, i) => ({ challan_id, amount: splitAmounts[i] ?? 0 }))
      .filter((s) => s.challan_id && s.amount > 0)

    const allocated = splits.reduce((sum, s) => sum + s.amount, 0)
    // Allocating more than was handed over would show bills as paid with
    // money nobody gave. Less is allowed: the remainder becomes credit.
    if (allocated - amount > 0.005) {
      return {
        error: `You have split ${rupees(allocated)} of a ${rupees(amount)} payment. Reduce the split or raise the amount.`,
      }
    }
    if (!splits.length) splits = null
  }

  const { data, error } = await supabase.rpc('collect_fee', {
    p_student: studentId,
    p_amount: amount,
    p_method: method,
    p_reference: text(formData.get('reference')),
    p_paid_at: text(formData.get('paid_at')) ?? new Date().toISOString(),
    p_notes: text(formData.get('notes')),
    p_splits: splits,
  })

  if (error) return { error: pgMessage(error, 'payment') }

  const cleared = Number(data?.challans) || 0
  const credit = Number(data?.credit) || 0

  // ------------------------------------------------------- the receipt
  //
  // AFTER the money is recorded, never before. A parent told "payment
  // received" for a transaction that then failed is the worst possible
  // version of this feature.
  //
  // Nothing here can fail the payment: autoSend() swallows its own errors,
  // and whether a message goes at all is decided in the database, because
  // the clerk on the counter holds fees.write and not whatsapp.write.
  const { data: student } = await supabase
    .from('students')
    .select(`id, first_name, last_name, ${PHONE_COLUMNS}`)
    .eq('school_id', schoolId)
    .eq('id', studentId)
    .maybeSingle()

  const school = await schoolName(supabase, schoolId)

  const sent = await autoSend(
    supabase,
    'fee_received',
    recipientsFrom(student ? [student] : [], (s) => ({
      student_name: [s.first_name, s.last_name].filter(Boolean).join(' '),
      amount: rupees(amount),
      date: dateLabel(new Date().toISOString().slice(0, 10)),
      challan_number: data?.receipt_no ?? '',
      school_name: school,
    }))
  )

  revalidateAll()
  return {
    ...ok(
      `${rupees(amount)} received · receipt ${data?.receipt_no}` +
        (cleared ? ` · ${cleared} challan${cleared === 1 ? '' : 's'} settled` : '') +
        (credit > 0 ? ` · ${rupees(credit)} held as advance` : '') +
        '.' +
        (sent.queued ? ' Receipt sent on WhatsApp.' : '')
    ),
    receipt: data?.receipt_no ?? null,
  }
}

// Kept under its old name so any screen still posting a single challan keeps
// working: a payment against one bill is just a split with one line.
export async function recordPayment(_prev, formData) {
  const challanId = text(formData.get('challan_id'))
  if (!challanId) return collectFee(_prev, formData)

  const amount = money(formData.get('amount_paid')) || money(formData.get('amount'))
  const { supabase } = await ctx()

  const { data: challan } = await supabase
    .from('fee_challans')
    .select('student_id, status')
    .eq('id', challanId)
    .maybeSingle()

  if (!challan) return { error: 'That challan no longer exists.' }
  if (challan.status === 'cancelled') return { error: 'That challan has been cancelled.' }

  const forwarded = new FormData()
  forwarded.set('student_id', challan.student_id)
  forwarded.set('amount', String(amount))
  for (const key of ['method', 'reference', 'notes', 'paid_at']) {
    const v = formData.get(key)
    if (v != null) forwarded.set(key, v)
  }
  forwarded.append('split_challan', challanId)
  forwarded.append('split_amount', String(amount))

  return collectFee(_prev, forwarded)
}

export async function deletePayment(formData) {
  const id = String(formData.get('id'))
  const { supabase } = await ctx()

  // A hard delete, unusually: the allocation rows cascade, and the recalc and
  // ledger triggers fire on DELETE, so every challan this money touched
  // corrects itself. A soft delete would leave those challans believing they
  // had been paid.
  const { error } = await supabase.from('fee_payments').delete().eq('id', id)
  if (error) throw new Error(pgMessage(error, 'payment'))
  revalidateAll()
}

/* ------------------------------------------------------------ late fees */

// Stamp the configured late fee onto everything overdue. Run from the
// collection screen rather than on a schedule, so a school that waives fines
// never accidentally charges one.
//
// Two modes, because schools genuinely do both: per day past a grace period,
// or a flat charge for each month the bill stays unpaid. Either can be capped,
// which matters on a five-month arrear -- an uncapped daily fine on a bill
// from last January is larger than the fee itself.
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

  const mode = config.late_fee_mode === 'per_month' ? 'per_month' : 'per_day'
  const perDay = Number(config.late_fee_per_day) || 0
  const perMonth = Number(config.late_fee_per_month) || 0
  const grace = Number(config.grace_days) || 0
  const cap = Number(config.late_fee_cap) || 0

  if (mode === 'per_day' && perDay <= 0) {
    return { error: 'No late fee per day is configured under Settings → Fee & Finance.' }
  }
  if (mode === 'per_month' && perMonth <= 0) {
    return { error: 'No late fee per month is configured under Settings → Fee & Finance.' }
  }

  let query = supabase
    .from('fee_challans')
    .select('id, due_date, late_fee, paid_amount, net_amount, amount')
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

    const due = Date.parse(`${c.due_date}T23:59:59Z`)
    const overdueDays = Math.floor((today - due) / 86400000)

    let fee = 0
    if (mode === 'per_day') {
      const chargeable = overdueDays - grace
      if (chargeable <= 0) continue
      fee = chargeable * perDay
    } else {
      // Whole months late, counted from the due date. One day past the due
      // date is one month's fine -- that is what a flat monthly charge means.
      const months = Math.floor((overdueDays - grace) / 30) + (overdueDays - grace > 0 ? 1 : 0)
      if (months <= 0) continue
      fee = months * perMonth
    }

    if (cap > 0) fee = Math.min(fee, cap)
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
