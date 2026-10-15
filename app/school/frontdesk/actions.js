'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  ADMISSION_STATE_IDS,
  COMPLAINT_CATEGORY_IDS,
  COMPLAINT_STATUS_IDS,
  CONTACT_CATEGORY_IDS,
  INQUIRY_STATUS_IDS,
  PRIORITY_IDS,
} from '@/lib/operations-options'

// Authority is RLS. inquiries, visitors, complaints and contacts_directory all
// carry the standard tenant policy set against frontdesk.read /
// frontdesk.write. What follows is input shaping.

const PATHS = [
  '/school/frontdesk',
  '/school/frontdesk/visitors',
  '/school/frontdesk/complaints',
  '/school/frontdesk/phonebook',
]

function revalidateAll() {
  for (const p of PATHS) revalidatePath(p)
  revalidatePath('/school')
}

function pgMessage(error, subject = 'record') {
  if (error.code === '23505') return `That ${subject} already exists.`
  if (error.code === '42501') return `You do not have permission to change ${subject}s.`
  if (error.code === '23503') return 'A linked record no longer exists. Reload and try again.'
  if (error.code === '23514') return 'Some values are out of range. Check the dates and fields.'
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
const ok = (message) => ({ ok: message, at: Date.now() })

/* =============================================================== inquiries */

export async function saveInquiry(_prev, formData) {
  const id = text(formData.get('id'))
  const name = text(formData.get('name'))
  const purpose = text(formData.get('purpose'))

  if (!name) return { error: 'Enter the visitor name.' }
  if (!purpose) return { error: 'Describe the purpose of the inquiry.' }

  const status = text(formData.get('status')) ?? 'pending'
  if (!INQUIRY_STATUS_IDS.includes(status)) return { error: 'Unknown status.' }

  const admissionStatus = text(formData.get('admission_status')) ?? 'none'
  if (!ADMISSION_STATE_IDS.includes(admissionStatus)) {
    return { error: 'Unknown admission status.' }
  }

  const { supabase, schoolId } = await ctx()
  if (!schoolId) return { error: 'No active school.' }

  const payload = {
    school_id: schoolId,
    name,
    contact_phone: text(formData.get('contact_phone')),
    contact_email: text(formData.get('contact_email')),
    purpose,
    // `message` is the column schema.sql shipped for a web lead; the counter
    // log writes the same text so nothing reading the old column goes blank.
    message: purpose,
    inquiry_date: text(formData.get('inquiry_date')) ?? new Date().toISOString().slice(0, 10),
    class_id: text(formData.get('class_id')),
    internal_notes: text(formData.get('internal_notes')),
    admission_status: admissionStatus,
    status,
  }

  if (id) {
    const { error } = await supabase.from('inquiries').update(payload).eq('id', id)
    if (error) return { error: pgMessage(error, 'inquiry') }
  } else {
    const { error } = await supabase.from('inquiries').insert(payload)
    if (error) return { error: pgMessage(error, 'inquiry') }
  }

  revalidateAll()
  return ok(id ? 'Inquiry updated.' : 'Inquiry recorded.')
}

export async function setInquiryStatus(formData) {
  const id = String(formData.get('id'))
  const status = String(formData.get('status'))
  if (!INQUIRY_STATUS_IDS.includes(status)) throw new Error('Unknown status.')

  const { supabase } = await ctx()
  const { error } = await supabase.from('inquiries').update({ status }).eq('id', id)
  if (error) throw new Error(pgMessage(error, 'inquiry'))
  revalidateAll()
}

export async function deleteInquiry(formData) {
  const id = String(formData.get('id'))
  const { supabase } = await ctx()

  const { error } = await supabase
    .from('inquiries')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw new Error(pgMessage(error, 'inquiry'))
  revalidateAll()
}

/* ================================================================ visitors */

export async function checkInVisitor(_prev, formData) {
  const name = text(formData.get('name'))
  const purpose = text(formData.get('purpose'))

  if (!name) return { error: 'Enter the visitor name.' }
  if (!purpose) return { error: 'State the purpose of the visit.' }

  const { supabase, schoolId } = await ctx()
  if (!schoolId) return { error: 'No active school.' }

  const visitDate = text(formData.get('visit_date')) ?? new Date().toISOString().slice(0, 10)
  const checkInTime = text(formData.get('check_in'))

  const { data: badge } = await supabase.rpc('next_visitor_badge', { p_school: schoolId })

  const { error } = await supabase.from('visitors').insert({
    school_id: schoolId,
    name,
    phone: text(formData.get('phone')),
    cnic: text(formData.get('cnic')),
    purpose,
    // The host combobox lets a name be typed as well as picked -- most
    // visitors ask for someone who may have no login at all -- so the typed
    // value is the fallback when nothing was selected from the list.
    whom_to_meet:
      text(formData.get('whom_to_meet')) ?? text(formData.get('whom_to_meet_new')),
    visit_date: visitDate,
    // The time field is a bare HH:MM; pairing it with the chosen date is what
    // makes a visitor logged after midnight stay on the right day's sheet.
    in_time: checkInTime ? `${visitDate}T${checkInTime}:00` : new Date().toISOString(),
    badge_no: badge,
    notes: text(formData.get('notes')),
  })

  if (error) return { error: pgMessage(error, 'visitor') }

  revalidateAll()
  return ok(`${name} checked in · badge ${badge}.`)
}

export async function checkOutVisitor(formData) {
  const id = String(formData.get('id'))
  const { supabase } = await ctx()

  const { error } = await supabase
    .from('visitors')
    .update({ out_time: new Date().toISOString() })
    .eq('id', id)

  if (error) throw new Error(pgMessage(error, 'visitor'))
  revalidateAll()
}

export async function deleteVisitor(formData) {
  const id = String(formData.get('id'))
  const { supabase } = await ctx()

  const { error } = await supabase
    .from('visitors')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw new Error(pgMessage(error, 'visitor'))
  revalidateAll()
}

/* ============================================================== complaints */

export async function saveComplaint(_prev, formData) {
  const id = text(formData.get('id'))
  const complainant = text(formData.get('complainant'))
  const subject = text(formData.get('subject'))

  if (!complainant) return { error: 'Enter the complainant name.' }
  if (!subject) return { error: 'Enter a subject.' }

  const status = text(formData.get('status')) ?? 'pending'
  if (!COMPLAINT_STATUS_IDS.includes(status)) return { error: 'Unknown status.' }

  const category = text(formData.get('category')) ?? 'general'
  if (!COMPLAINT_CATEGORY_IDS.includes(category)) return { error: 'Unknown category.' }

  const priority = text(formData.get('priority')) ?? 'medium'
  if (!PRIORITY_IDS.includes(priority)) return { error: 'Unknown priority.' }

  const { supabase, schoolId } = await ctx()
  if (!schoolId) return { error: 'No active school.' }

  const payload = {
    school_id: schoolId,
    complainant,
    relation: text(formData.get('relation')),
    student_id: text(formData.get('student_id')),
    subject,
    description: text(formData.get('description')),
    category,
    priority,
    complaint_date: text(formData.get('complaint_date')) ?? new Date().toISOString().slice(0, 10),
    phone: text(formData.get('phone')),
    resolution: text(formData.get('resolution')),
    status,
  }

  // Resolving stamps the time; reopening clears it, so the pair never claims
  // a complaint was resolved on a date it is still open.
  if (status === 'resolved' || status === 'closed') {
    payload.resolved_at = new Date().toISOString()
  } else {
    payload.resolved_at = null
  }

  if (id) {
    const { error } = await supabase.from('complaints').update(payload).eq('id', id)
    if (error) return { error: pgMessage(error, 'complaint') }
  } else {
    const { error } = await supabase.from('complaints').insert(payload)
    if (error) return { error: pgMessage(error, 'complaint') }
  }

  revalidateAll()
  return ok(id ? 'Complaint updated.' : 'Complaint recorded.')
}

export async function setComplaintStatus(formData) {
  const id = String(formData.get('id'))
  const status = String(formData.get('status'))
  if (!COMPLAINT_STATUS_IDS.includes(status)) throw new Error('Unknown status.')

  const { supabase } = await ctx()

  const patch = { status }
  patch.resolved_at =
    status === 'resolved' || status === 'closed' ? new Date().toISOString() : null

  const { error } = await supabase.from('complaints').update(patch).eq('id', id)
  if (error) throw new Error(pgMessage(error, 'complaint'))
  revalidateAll()
}

export async function deleteComplaint(formData) {
  const id = String(formData.get('id'))
  const { supabase } = await ctx()

  const { error } = await supabase
    .from('complaints')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw new Error(pgMessage(error, 'complaint'))
  revalidateAll()
}

/* ============================================================== phone book */

export async function saveContact(_prev, formData) {
  const id = text(formData.get('id'))
  const name = text(formData.get('name'))
  const phone = text(formData.get('phone'))

  if (!name) return { error: 'Enter a name.' }
  if (!phone) return { error: 'Enter a phone number.' }

  const category = text(formData.get('category')) ?? 'other'
  if (!CONTACT_CATEGORY_IDS.includes(category)) return { error: 'Unknown category.' }

  const { supabase, schoolId } = await ctx()
  if (!schoolId) return { error: 'No active school.' }

  const payload = {
    school_id: schoolId,
    name,
    phone,
    email: text(formData.get('email')),
    designation: text(formData.get('designation')),
    department: text(formData.get('department')),
    extension: text(formData.get('extension')),
    category,
    // `type` is the column schema.sql shipped; kept in step with category so
    // anything reading the old column still works.
    type: category,
    notes: text(formData.get('notes')),
  }

  if (id) {
    const { error } = await supabase.from('contacts_directory').update(payload).eq('id', id)
    if (error) return { error: pgMessage(error, 'contact') }
  } else {
    const { error } = await supabase.from('contacts_directory').insert(payload)
    if (error) return { error: pgMessage(error, 'contact') }
  }

  revalidateAll()
  return ok(id ? `${name} updated.` : `${name} added.`)
}

export async function deleteContact(formData) {
  const id = String(formData.get('id'))
  const { supabase } = await ctx()

  const { error } = await supabase
    .from('contacts_directory')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw new Error(pgMessage(error, 'contact'))
  revalidateAll()
}
