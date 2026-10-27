'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { NEXT, STATUS_LABEL } from './pipeline'

// Authority is RLS: admission_inquiries carries the standard tenant policy
// set, so a caller without admissions.write gets an error or a zero-row
// update rather than a silent success. What follows is input shaping and the
// one rule the pipeline has of its own.

// The pipeline itself lives in ./pipeline, which is a plain module: every
// export from a 'use server' file must be an async function, so a label map
// here would be a build error.

const text = (v) => {
  const s = String(v ?? '').trim()
  return s === '' ? null : s
}

function pgMessage(error) {
  if (error.code === '23505') return 'That application number is already used.'
  if (error.code === '42501') return 'You do not have permission to change admissions.'
  if (error.code === '23503') return 'A linked record no longer exists. Reload and try again.'
  if (error.code === '23514') {
    return 'Enrolled applications are created by admitting the student, not by setting a status.'
  }
  return error.message
}

async function ctx() {
  const supabase = await createClient()
  const { data: schoolId } = await supabase.rpc('current_school_id')
  return { supabase, schoolId }
}

function done() {
  revalidatePath('/school/admissions')
}

/* ======================================================= take an application */

export async function saveApplication(_prev, formData) {
  const id = text(formData.get('id'))
  const name = text(formData.get('applicant_name'))

  if (!name) return { error: "Enter the applicant's name." }

  const { supabase, schoolId } = await ctx()
  if (!schoolId) return { error: 'No active school.' }

  const payload = {
    school_id: schoolId,
    applicant_name: name,
    father_name: text(formData.get('father_name')),
    applicant_phone: text(formData.get('applicant_phone')),
    applicant_email: text(formData.get('applicant_email')),
    date_of_birth: text(formData.get('date_of_birth')),
    gender: text(formData.get('gender')),
    previous_school: text(formData.get('previous_school')),
    address: text(formData.get('address')),
    class_id: text(formData.get('class_id')),
    inquiry_date: text(formData.get('inquiry_date')),
    notes: text(formData.get('notes')),
  }

  if (id) {
    const { error } = await supabase
      .from('admission_inquiries')
      .update(payload)
      .eq('id', id)
      .eq('school_id', schoolId)

    if (error) return { error: pgMessage(error) }
    done()
    return { ok: `${name} updated.`, at: Date.now() }
  }

  // The number people quote on the phone exists from the first minute, not
  // from acceptance. Generated in the database so two clerks taking calls at
  // the same moment cannot be handed the same one.
  const { data: applicationNo, error: noError } = await supabase.rpc('next_application_no')
  if (noError) return { error: pgMessage(noError) }

  const { error } = await supabase.from('admission_inquiries').insert({
    ...payload,
    application_no: applicationNo,
    status: 'applied',
    inquiry_date: payload.inquiry_date ?? new Date().toISOString().slice(0, 10),
  })

  if (error) return { error: pgMessage(error) }

  done()
  return { ok: `${name} added as ${applicationNo}.`, at: Date.now() }
}

/* ============================================================ move it along */

export async function setApplicationStatus(formData) {
  const id = String(formData.get('id'))
  const status = String(formData.get('status'))
  const note = text(formData.get('decision_note'))

  const { supabase, schoolId } = await ctx()
  if (!schoolId) throw new Error('No active school.')

  const { data: current } = await supabase
    .from('admission_inquiries')
    .select('status, applicant_name')
    .eq('id', id)
    .eq('school_id', schoolId)
    .maybeSingle()

  if (!current) throw new Error('That application no longer exists.')

  // The pipeline is a small set of legal moves, checked here rather than
  // trusted from the form. A posted status is a string from the internet.
  if (!NEXT[current.status]?.includes(status)) {
    throw new Error(
      current.status === 'enrolled'
        ? 'That applicant is already a student. Their record lives under Students now.'
        : `An application cannot go from ${STATUS_LABEL[current.status]} to ${
            STATUS_LABEL[status] ?? status
          }.`
    )
  }

  const { data: me } = await supabase.auth.getUser()

  const { error } = await supabase
    .from('admission_inquiries')
    .update({
      status,
      decision_note: note,
      // A decision is dated and attributed; moving a record back to the queue
      // is not a decision, so it clears both.
      decided_on: ['accepted', 'rejected'].includes(status) ? new Date().toISOString() : null,
      decided_by: ['accepted', 'rejected'].includes(status) ? (me?.user?.id ?? null) : null,
    })
    .eq('id', id)
    .eq('school_id', schoolId)

  if (error) throw new Error(pgMessage(error))
  done()
}

/* ================================================================== discard */

export async function deleteApplication(formData) {
  const id = String(formData.get('id'))

  const { supabase, schoolId } = await ctx()
  if (!schoolId) throw new Error('No active school.')

  // Soft delete, like everything else here. An application that was refused
  // and then deleted is still a question the school was asked, and "we have
  // no record of that" is rarely the true answer.
  const { error } = await supabase
    .from('admission_inquiries')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('school_id', schoolId)
    .neq('status', 'enrolled')

  if (error) throw new Error(pgMessage(error))
  done()
}
