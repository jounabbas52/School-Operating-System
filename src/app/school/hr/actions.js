'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  DOC_STATUS_IDS,
  DOC_TYPE_IDS,
  LEAVE_STATUS_IDS,
  LEAVE_TYPE_IDS,
  STAFF_STATUS_IDS,
  leaveDays,
} from '@/lib/staff-options'

// Authority is RLS. staff and staff_documents carry the standard tenant policy
// set; leave_requests carries the hand-written one from schema.sql (file your
// own, hr.read sees all, hr.write approves). What follows is input shaping.

const PATHS = ['', '/leave', '/documents']

function revalidateAll() {
  for (const p of PATHS) revalidatePath(`/school/hr${p}`)
  // Teachers is the same table filtered to staff_type = 'teaching'.
  revalidatePath('/school/teachers')
}

function pgMessage(error, subject = 'staff member') {
  if (error.code === '23505') {
    if (error.message.includes('staff_number')) return 'That staff ID is already used.'
    return `That ${subject} already exists.`
  }
  if (error.code === '42501') return `You do not have permission to change ${subject}s.`
  if (error.code === '23503') return 'A linked record no longer exists. Reload and try again.'
  if (error.code === '23514') return 'Those dates are the wrong way round.'
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

/* ============================================================== save staff */

export async function saveStaff(_prev, formData) {
  const id = text(formData.get('id'))
  const name = text(formData.get('full_name'))
  const designation = text(formData.get('designation'))

  if (!name) return { error: 'Enter the full name.' }
  if (!designation) return { error: 'Enter a designation.' }

  const staffType = text(formData.get('staff_type')) ?? 'teaching'
  if (!['teaching', 'admin', 'support'].includes(staffType)) {
    return { error: 'Unknown staff type.' }
  }

  const status = text(formData.get('status')) ?? 'active'
  if (!STAFF_STATUS_IDS.includes(status)) return { error: 'Unknown status.' }

  const paymentMode = text(formData.get('payment_mode')) ?? 'bank_transfer'
  if (!['bank_transfer', 'cash', 'cheque', 'online'].includes(paymentMode)) {
    return { error: 'Unknown payment mode.' }
  }

  const salary = num(formData.get('monthly_salary'))
  if (salary !== null && salary < 0) return { error: 'Salary cannot be negative.' }

  const { supabase, schoolId } = await ctx()
  if (!schoolId) return { error: 'No active school.' }

  // The name arrives as one field, as on the form. Split on the last space so
  // "Muhammad Ahad Khan" keeps "Muhammad Ahad" together as the given name.
  const parts = name.split(/\s+/)
  const last = parts.length > 1 ? parts.pop() : null
  const first = parts.join(' ')

  const payload = {
    school_id: schoolId,
    staff_type: staffType,
    first_name: first,
    last_name: last,
    staff_number: text(formData.get('staff_number')),
    designation,
    department: text(formData.get('department')),
    employment_type: text(formData.get('employment_type')) ?? 'permanent',
    hire_date: text(formData.get('hire_date')),
    monthly_salary: salary,
    phone: text(formData.get('phone')),
    work_email: text(formData.get('work_email')),
    cnic: text(formData.get('cnic')),
    address: text(formData.get('address')),
    payment_mode: paymentMode,
    bank_name: text(formData.get('bank_name')),
    account_title: text(formData.get('account_title')),
    account_number: text(formData.get('account_number')),
    status,
  }

  if (id) {
    const { error } = await supabase.from('staff').update(payload).eq('id', id)
    if (error) return { error: pgMessage(error) }
  } else {
    const { error } = await supabase.from('staff').insert(payload)
    if (error) return { error: pgMessage(error) }
  }

  revalidateAll()
  return ok(id ? `${name} updated.` : `${name} added.`)
}

export async function deleteStaff(formData) {
  const id = String(formData.get('id'))
  const { supabase } = await ctx()

  // Soft delete. Attendance, payroll items, salary payments, leave and
  // documents all point at this row; a hard delete would take the school's
  // employment records with it.
  const { error } = await supabase
    .from('staff')
    .update({ is_deleted: true, deleted_at: new Date().toISOString(), status: 'inactive' })
    .eq('id', id)

  if (error) throw new Error(pgMessage(error))
  revalidateAll()
}

/* ============================================================= leave */

export async function saveLeave(_prev, formData) {
  const id = text(formData.get('id'))
  const staffId = text(formData.get('staff_id'))
  const from = text(formData.get('from_date'))
  const to = text(formData.get('to_date'))
  const leaveType = text(formData.get('leave_type')) ?? 'annual'
  const status = text(formData.get('status')) ?? 'pending'

  if (!staffId) return { error: 'Choose a staff member.' }
  if (!from) return { error: 'Choose a start date.' }
  if (!to) return { error: 'Choose an end date.' }
  if (!LEAVE_TYPE_IDS.includes(leaveType)) return { error: 'Unknown leave type.' }
  if (!LEAVE_STATUS_IDS.includes(status)) return { error: 'Unknown status.' }

  const days = leaveDays(from, to)
  if (days === null) return { error: 'The end date falls before the start date.' }

  const { supabase, schoolId } = await ctx()
  if (!schoolId) return { error: 'No active school.' }

  const payload = {
    school_id: schoolId,
    staff_id: staffId,
    leave_type: leaveType,
    from_date: from,
    to_date: to,
    days,
    reason: text(formData.get('reason')),
    status,
  }

  // Who signed it off, stamped only when the decision is actually made -- a
  // row sitting at pending has not been reviewed by anyone.
  if (status === 'pending') {
    payload.reviewed_by = null
    payload.reviewed_at = null
  } else {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    payload.reviewed_by = user?.id ?? null
    payload.reviewed_at = new Date().toISOString()
  }

  if (id) {
    const { error } = await supabase.from('leave_requests').update(payload).eq('id', id)
    if (error) return { error: pgMessage(error, 'leave application') }
  } else {
    const { error } = await supabase.from('leave_requests').insert(payload)
    if (error) return { error: pgMessage(error, 'leave application') }
  }

  revalidateAll()
  return ok(id ? 'Leave application updated.' : `Leave filed for ${days} day${days === 1 ? '' : 's'}.`)
}

export async function setLeaveStatus(formData) {
  const id = String(formData.get('id'))
  const status = String(formData.get('status'))

  if (!LEAVE_STATUS_IDS.includes(status)) throw new Error('Unknown status.')

  const { supabase } = await ctx()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { error } = await supabase
    .from('leave_requests')
    .update({
      status,
      reviewed_by: status === 'pending' ? null : (user?.id ?? null),
      reviewed_at: status === 'pending' ? null : new Date().toISOString(),
    })
    .eq('id', id)

  if (error) throw new Error(pgMessage(error, 'leave application'))
  revalidateAll()
}

export async function deleteLeave(formData) {
  const id = String(formData.get('id'))
  const { supabase } = await ctx()

  const { error } = await supabase
    .from('leave_requests')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw new Error(pgMessage(error, 'leave application'))
  revalidateAll()
}

/* ========================================================= staff documents */

export async function saveDocument(_prev, formData) {
  const id = text(formData.get('id'))
  const staffId = text(formData.get('staff_id'))
  const docType = text(formData.get('doc_type')) ?? 'cnic'
  const status = text(formData.get('status')) ?? 'valid'
  const issue = text(formData.get('issue_date'))
  const expiry = text(formData.get('expiry_date'))

  if (!staffId) return { error: 'Choose a staff member.' }
  if (!DOC_TYPE_IDS.includes(docType)) return { error: 'Unknown document type.' }
  if (!DOC_STATUS_IDS.includes(status)) return { error: 'Unknown status.' }
  if (issue && expiry && expiry < issue) {
    return { error: 'The expiry date falls before the issue date.' }
  }

  const { supabase, schoolId } = await ctx()
  if (!schoolId) return { error: 'No active school.' }

  const payload = {
    school_id: schoolId,
    staff_id: staffId,
    doc_type: docType,
    doc_number: text(formData.get('doc_number')),
    issue_date: issue,
    expiry_date: expiry,
    // Only consulted when there is no expiry date -- see documentStatus().
    status,
    notes: text(formData.get('notes')),
  }

  if (id) {
    const { error } = await supabase.from('staff_documents').update(payload).eq('id', id)
    if (error) return { error: pgMessage(error, 'document') }
  } else {
    const { error } = await supabase.from('staff_documents').insert(payload)
    if (error) return { error: pgMessage(error, 'document') }
  }

  revalidateAll()
  return ok(id ? 'Document updated.' : 'Document added.')
}

export async function deleteDocument(formData) {
  const id = String(formData.get('id'))
  const { supabase } = await ctx()

  const { error } = await supabase
    .from('staff_documents')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw new Error(pgMessage(error, 'document'))
  revalidateAll()
}
