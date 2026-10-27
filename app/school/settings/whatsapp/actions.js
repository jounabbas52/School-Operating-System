'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { studentPhone, dedupeByPhone, toE164, isMobile } from '@/lib/whatsapp/phone'
import {
  connectSession,
  logoutSession,
  sendMessage,
  sessionStatus,
} from '@/lib/whatsapp/gateway'
import { checkCredentials, listTemplates, sendTemplate } from '@/lib/whatsapp/cloud-api'
import {
  AUTO_SEND_KEYS,
  renderTemplate,
  unknownVariables,
  usedVariables,
} from '@/lib/whatsapp-options'

// Authority is RLS. whatsapp_settings, whatsapp_templates, whatsapp_contacts
// and whatsapp_messages all carry the standard tenant policy set against
// whatsapp.read / whatsapp.write.
//
// QUEUEING IS THE EXCEPTION, deliberately: nothing here INSERTs into
// whatsapp_messages. Every send goes through the whatsapp_enqueue() RPC,
// which re-checks permission and applies the opt-out rule inside the
// database. A rule enforced in a server action only holds until somebody
// writes the next server action.

// One screen now, so one path to revalidate. WhatsApp used to be three
// pages under a Communication section; it is a single tabbed screen inside
// Settings.
const BASE = '/school/settings/whatsapp'

function revalidateAll() {
  revalidatePath(BASE)
}

function pgMessage(error, subject = 'setting') {
  if (error.code === '23505') {
    if (error.message.includes('templates_name')) {
      return 'A template with that name already exists.'
    }
    return `That ${subject} already exists.`
  }
  if (error.code === '42501') return `You do not have permission to change ${subject}s.`
  if (error.code === '23503') return 'A linked record no longer exists. Reload and try again.'
  if (error.code === '22023') return error.message
  if (error.code === '28000') return 'The gateway token is wrong. Check WHATSAPP_INGEST_TOKEN.'
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

// SELECT on whatsapp_settings.api_access_token is revoked from the
// authenticated role, so a plain .select('api_access_token') does not come
// back null -- it fails the request outright. This RPC is the only door,
// and it re-checks whatsapp.write inside the database.
//
// The result stays in the server action. It must never be returned to the
// browser, put in a prop, or logged.
async function apiCredentials(supabase) {
  const { data, error } = await supabase.rpc('whatsapp_api_credentials')
  if (error) return { error: pgMessage(error, 'connection') }
  const row = Array.isArray(data) ? data[0] : data
  return { credentials: row ?? null }
}
const ok = (message, extra = {}) => ({ ok: message, at: Date.now(), ...extra })

/* ============================================================== the phone */

/**
 * Poll the gateway for session state and the QR image.
 *
 * Called on a timer by the connection panel, so it is deliberately cheap and
 * never writes. The gateway pushes authoritative state changes to
 * /api/whatsapp/events; this is only what the open screen needs right now.
 */
export async function readSession() {
  const { schoolId } = await ctx()
  if (!schoolId) return { error: 'No school in context. Sign in again.' }

  const result = await sessionStatus(schoolId)
  if (!result.ok) return { error: result.error }

  return {
    status: result.status ?? 'disconnected',
    qr: result.qr ?? null,
    number: result.number ?? null,
    lastError: result.lastError ?? null,
  }
}

/** Open the socket. The QR arrives a moment later, via readSession(). */
export async function startSession() {
  const { supabase, schoolId } = await ctx()
  if (!schoolId) return { error: 'No school in context. Sign in again.' }

  // Permission is checked by RLS on the write below. Doing it before the
  // gateway call means somebody who may not manage WhatsApp cannot make
  // this school's socket reconnect.
  const { error: rowError } = await supabase
    .from('whatsapp_settings')
    .upsert({ school_id: schoolId, session_status: 'connecting' }, { onConflict: 'school_id' })

  if (rowError) return { error: pgMessage(rowError, 'connection') }

  const result = await connectSession(schoolId)
  if (!result.ok) return { error: result.error }

  revalidateAll()
  return ok('Connecting — the QR code will appear in a moment.')
}

/** Unlink the phone. The next connect needs a fresh scan. */
export async function endSession() {
  const { supabase, schoolId } = await ctx()
  if (!schoolId) return { error: 'No school in context. Sign in again.' }

  const result = await logoutSession(schoolId)
  if (!result.ok) return { error: result.error }

  // Switched off as well as unlinked. Leaving it enabled would let the
  // office keep queueing messages into a session that no longer exists.
  await supabase
    .from('whatsapp_settings')
    .upsert(
      {
        school_id: schoolId,
        session_status: 'disconnected',
        linked_number: null,
        is_enabled: false,
      },
      { onConflict: 'school_id' }
    )

  revalidateAll()
  return ok('Phone unlinked. Anything still queued will wait until you reconnect.')
}

/* ================================================================ settings */

export async function saveSettings(_prev, formData) {
  const { supabase, schoolId } = await ctx()
  if (!schoolId) return { error: 'No school in context. Sign in again.' }

  const isEnabled = bool(formData.get('is_enabled'))

  // Switching on with no phone linked would queue messages the dispatcher
  // silently skips forever -- the queue grows, nothing sends, and no screen
  // says why.
  if (isEnabled) {
    const { data: current } = await supabase
      .from('whatsapp_settings')
      .select('session_status')
      .eq('school_id', schoolId)
      .maybeSingle()

    if (current?.session_status !== 'connected') {
      return { error: 'Link the school phone before switching WhatsApp on.' }
    }
  }

  const cap = num(formData.get('daily_cap')) ?? 500

  // Auto-send arrives as one checkbox per event. Absent means off, so the
  // object is built from the known key list rather than from what the form
  // happened to post -- otherwise unchecking the last box would leave the
  // previous value in place instead of clearing it.
  const autoSend = Object.fromEntries(
    AUTO_SEND_KEYS.map((key) => [key, bool(formData.get(`auto_${key}`))])
  )

  const minDelay = Math.max(0, num(formData.get('send_delay_min')) ?? 3)
  const maxDelay = Math.max(minDelay, num(formData.get('send_delay_max')) ?? 8)

  const { error } = await supabase.from('whatsapp_settings').upsert(
    {
      school_id: schoolId,
      is_enabled: isEnabled,
      daily_cap: Math.max(1, cap),
      quiet_from: text(formData.get('quiet_from')) ?? '21:00',
      quiet_until: text(formData.get('quiet_until')) ?? '07:30',
      auto_send: autoSend,
      send_delay_min: minDelay,
      send_delay_max: maxDelay,
      api_enabled: bool(formData.get('api_enabled')),
      api_fallback: bool(formData.get('api_fallback')),
    },
    { onConflict: 'school_id' }
  )

  if (error) return { error: pgMessage(error, 'setting') }

  revalidateAll()
  return ok(isEnabled ? 'Settings saved. WhatsApp is on.' : 'Settings saved. Sending is off.')
}

/* ==================================================== official Cloud API */

/**
 * Save the Meta credentials and immediately prove they work.
 *
 * Checking is the point. Credentials that are merely stored look identical
 * to credentials that are wrong, and the difference only shows up the first
 * time a parent should have been messaged and was not.
 */
export async function saveApiCredentials(_prev, formData) {
  const { supabase, schoolId } = await ctx()
  if (!schoolId) return { error: 'No school in context. Sign in again.' }

  const phoneNumberId = text(formData.get('phone_number_id'))
  const token = text(formData.get('api_access_token'))

  const row = {
    school_id: schoolId,
    waba_id: text(formData.get('waba_id')),
    phone_number_id: phoneNumberId,
    meta_app_id: text(formData.get('meta_app_id')),
  }

  // An empty token field means "leave it alone", not "clear it". A clerk
  // fixing a typo in the WABA id must not wipe the credential by not
  // retyping it -- the field renders blank because it cannot be read back.
  if (token) row.api_access_token = token

  let effectiveToken = token
  if (!effectiveToken) {
    // Nothing new typed, so check the one already on file. This read is the
    // single place the token is pulled back out, and it goes no further
    // than this server action.
    const { credentials } = await apiCredentials(supabase)
    effectiveToken = credentials?.access_token ?? null
  }

  const check =
    phoneNumberId && effectiveToken
      ? await checkCredentials({ phoneNumberId, token: effectiveToken })
      : { ok: false, error: 'Phone number ID and access token are both needed.' }

  row.api_status = check.ok ? 'ok' : 'error'
  row.api_error = check.ok ? null : check.error
  row.api_checked_at = new Date().toISOString()

  const { error } = await supabase
    .from('whatsapp_settings')
    .upsert(row, { onConflict: 'school_id' })

  if (error) return { error: pgMessage(error, 'connection') }

  revalidateAll()

  if (!check.ok) return { error: `Saved, but Meta refused them: ${check.error}` }

  return ok(
    `Saved and verified — ${check.name ?? 'WhatsApp'} on ${check.number ?? 'that number'}` +
      (check.quality ? ` · quality ${check.quality}` : '')
  )
}

/**
 * Pull each template's review verdict from Meta.
 *
 * Meta is the authority on approval; meta_status here is only ever a cached
 * copy. A template whose wording was edited at Meta silently drops back to
 * pending, and this is how the school finds out before a send fails.
 */
export async function syncMetaTemplates() {
  const { supabase, schoolId } = await ctx()
  if (!schoolId) return { error: 'No school in context. Sign in again.' }

  const { credentials, error: credError } = await apiCredentials(supabase)
  if (credError) return { error: credError }

  if (!credentials?.waba_id || !credentials?.access_token) {
    return { error: 'Save the WABA ID and access token first.' }
  }

  const result = await listTemplates({
    wabaId: credentials.waba_id,
    token: credentials.access_token,
  })

  if (!result.ok) return { error: result.error }

  const byName = new Map(result.templates.map((t) => [t.name, t]))

  const { data: mine } = await supabase
    .from('whatsapp_templates')
    .select('id, meta_name')
    .eq('school_id', schoolId)
    .eq('is_deleted', false)
    .not('meta_name', 'is', null)

  let matched = 0
  for (const row of mine ?? []) {
    const found = byName.get(row.meta_name)
    await supabase
      .from('whatsapp_templates')
      .update({ meta_status: found ? found.status : 'none' })
      .eq('id', row.id)
    if (found) matched += 1
  }

  revalidateAll()
  return ok(
    `${result.templates.length} template${result.templates.length === 1 ? '' : 's'} at Meta · ` +
      `${matched} matched here`
  )
}

/**
 * Send one message through the API only, even before it is switched on.
 *
 * Deliberately does NOT fall back to the linked phone: the whole question
 * this button answers is whether the API route works, and a message that
 * quietly arrived by the other road would answer it wrongly.
 */
export async function sendApiTest(_prev, formData) {
  const { supabase, schoolId } = await ctx()
  if (!schoolId) return { error: 'No school in context. Sign in again.' }

  const phone = toE164(formData.get('phone'))
  if (!phone) return { error: `"${formData.get('phone')}" is not a phone number this can dial.` }

  const templateName = text(formData.get('meta_name')) ?? 'hello_world'
  const language = text(formData.get('meta_lang')) ?? 'en_US'

  const { credentials, error: credError } = await apiCredentials(supabase)
  if (credError) return { error: credError }

  if (!credentials?.phone_number_id || !credentials?.access_token) {
    return { error: 'Save your Meta details first.' }
  }

  const result = await sendTemplate({
    phoneNumberId: credentials.phone_number_id,
    token: credentials.access_token,
    to: phone,
    name: templateName,
    language,
  })

  if (!result.ok) return { error: `Meta refused it: ${result.error}` }

  return ok(`Sent "${templateName}" to ${phone} through the API.`)
}

/* ========================================================= templates */

export async function saveTemplate(_prev, formData) {
  const { supabase, schoolId } = await ctx()
  if (!schoolId) return { error: 'No school in context. Sign in again.' }

  const id = text(formData.get('id'))
  const name = text(formData.get('name'))
  const body = text(formData.get('body'))

  if (!name) return { error: 'Give this message a name.' }
  if (!body) return { error: 'Write the message.' }

  // A placeholder we cannot fill goes out to a parent as a literal
  // "{studnt_name}". Catching the typo here is the difference between a
  // caught mistake and four hundred embarrassing messages.
  const unknown = unknownVariables(body)
  if (unknown.length) {
    return {
      error:
        `${unknown.map((u) => `{${u}}`).join(', ')} ` +
        `${unknown.length === 1 ? 'is not a field' : 'are not fields'} this system can fill. ` +
        'Use the chips above the box, or remove the braces.',
    }
  }

  const row = {
    school_id: schoolId,
    name,
    body,
    // Stored for reference; the body is the source of truth and is
    // re-parsed wherever the list is actually needed.
    variables: usedVariables(body),
    event: text(formData.get('event')) ?? 'custom',
    is_active: bool(formData.get('is_active')),
    meta_name: text(formData.get('meta_name')),
    meta_lang: text(formData.get('meta_lang')) ?? 'en',
  }

  const { error } = id
    ? await supabase.from('whatsapp_templates').update(row).eq('id', id)
    : await supabase.from('whatsapp_templates').insert(row)

  if (error) return { error: pgMessage(error, 'template') }

  revalidateAll()
  return ok(id ? 'Template updated.' : 'Template added.')
}

export async function deleteTemplate(formData) {
  const { supabase } = await ctx()
  const id = text(formData.get('id'))
  if (!id) return

  // Soft delete. whatsapp_messages rows point here and the log must keep
  // reading correctly years later.
  await supabase.from('whatsapp_templates').update({ is_deleted: true }).eq('id', id)
  revalidateAll()
}

/* ================================================================ sending */

// Turn students into recipients, and say who was dropped and why.
//
// The unreachable list is returned, not swallowed. "412 queued" with no
// mention of the 23 students whose father_whatsapp is a landline is a report
// that lies by omission, and those 23 parents are the ones who later say
// they were never told.
function buildRecipients(students, bodyFor) {
  const recipients = []
  const unreachable = []

  for (const s of students) {
    const { phone, field } = studentPhone(s)
    if (!phone) {
      unreachable.push({
        id: s.id,
        name: [s.first_name, s.last_name].filter(Boolean).join(' '),
        admission_number: s.admission_number,
        reason: field ? `${field.replace(/_/g, ' ')} is not a usable mobile` : 'no number on file',
      })
      continue
    }
    recipients.push({ phone, student_id: s.id, body: bodyFor(s) })
  }

  return { recipients, unreachable }
}

async function loadStudents(supabase, schoolId, { classId, sectionId }) {
  let query = supabase
    .from('students')
    .select(
      'id, first_name, last_name, admission_number, father_whatsapp, whatsapp_number, ' +
        'father_mobile, guardian_phone, student_mobile'
    )
    .eq('school_id', schoolId)
    .eq('is_deleted', false)
    .eq('status', 'active')

  if (sectionId) query = query.eq('current_section_id', sectionId)
  else if (classId) query = query.eq('current_class_id', classId)

  return query
}

/**
 * Queue a message to a class, a section, or the whole school.
 *
 * Deduped by phone: one father with three children gets ONE message. That is
 * both a third of the sends and the difference between a notice and
 * something a parent reports as spam -- which on this channel is what costs
 * the number.
 *
 * Per-student personalisation is deliberately NOT offered here. A message
 * naming each child is an absence alert, and those are queued by the
 * attendance screen with a body built per student; mixing the two would
 * make the dedupe above silently wrong.
 */
export async function queueAnnouncement(_prev, formData) {
  const { supabase, schoolId } = await ctx()
  if (!schoolId) return { error: 'No school in context. Sign in again.' }

  const templateId = text(formData.get('template_id'))
  const typed = text(formData.get('body'))

  let body = typed
  let name = null

  if (templateId) {
    const { data: tpl } = await supabase
      .from('whatsapp_templates')
      .select('id, name, body, variables')
      .eq('id', templateId)
      .eq('school_id', schoolId)
      .maybeSingle()

    if (!tpl) return { error: 'That template no longer exists.' }

    // Named values, posted as one form field per merge field the body uses
    // (var_student_name, var_date …). Reading them off the body rather than
    // trusting the form means a stale field left over from a previously
    // selected template cannot leak into this message.
    const values = {}
    for (const key of usedVariables(tpl.body)) {
      values[key] = text(formData.get(`var_${key}`)) ?? ''
    }

    body = renderTemplate(tpl.body, values)
    name = tpl.name
  }

  if (!body) return { error: 'Choose a template or write one.' }

  // An unfilled blank goes out to every parent as a literal "{student_name}".
  // Checked after rendering, so it catches both an empty input and a merge
  // field the sender never saw because the form did not offer it.
  const leftover = usedVariables(body)
  if (leftover.length) {
    return {
      error: `Still empty: ${leftover.map((k) => `{${k}}`).join(', ')}. Fill every blank first.`,
    }
  }

  const { data: students, error: readError } = await loadStudents(supabase, schoolId, {
    classId: text(formData.get('class_id')),
    sectionId: text(formData.get('section_id')),
  })

  if (readError) return { error: pgMessage(readError, 'student') }
  if (!students?.length) return { error: 'Nobody matches that class or section.' }

  const { recipients, unreachable } = buildRecipients(students, () => body)
  const deduped = dedupeByPhone(recipients)

  if (!deduped.length) {
    return { error: `None of those ${students.length} students has a usable mobile number.` }
  }

  const { data, error } = await supabase.rpc('whatsapp_enqueue', {
    p_recipients: deduped,
    p_body: body,
    p_template: templateId,
    p_source: 'announcement',
  })

  if (error) return { error: pgMessage(error, 'message') }

  const row = Array.isArray(data) ? data[0] : data

  revalidateAll()
  return ok(summarise(row, { families: deduped.length, unreachable: unreachable.length, name }), {
    unreachable: unreachable.slice(0, 50),
  })
}

function summarise(row, { families, unreachable }) {
  const parts = [`${row?.queued ?? 0} queued`]
  if (families) parts.push(`${families} famil${families === 1 ? 'y' : 'ies'}`)
  if (row?.skipped_optout) parts.push(`${row.skipped_optout} opted out`)
  if (unreachable) parts.push(`${unreachable} with no usable number`)
  return parts.join(' · ')
}

/**
 * One message to one typed-in number, sent immediately.
 *
 * The smoke test, and it bypasses the queue on purpose: a test that reports
 * "queued" has told you nothing about whether the link actually works, which
 * is the entire question it exists to answer.
 */
export async function sendTest(_prev, formData) {
  const { supabase, schoolId } = await ctx()
  if (!schoolId) return { error: 'No school in context. Sign in again.' }

  const raw = formData.get('phone')
  const phone = toE164(raw)
  if (!phone) return { error: `"${raw}" is not a phone number this can dial.` }
  if (!isMobile(phone)) return { error: `${phone} looks like a landline, not a mobile.` }

  const body = text(formData.get('body'))
  if (!body) return { error: 'Write something to send.' }

  // Still logged, because an untracked send is a message nobody can account
  // for later. Queued and then drained in the same breath.
  const { data, error } = await supabase.rpc('whatsapp_enqueue', {
    p_recipients: [{ phone, body }],
    p_body: body,
    p_template: null,
    p_source: 'test',
  })

  if (error) return { error: pgMessage(error, 'message') }

  const row = Array.isArray(data) ? data[0] : data
  if (!row?.queued) {
    return { error: 'Nothing queued — that number has opted out of messages from this school.' }
  }

  const drained = await dispatch()

  revalidateAll()
  if (drained.error) return { error: `Queued for ${phone}, but: ${drained.error}` }
  if (drained.failed) {
    return { error: `WhatsApp refused the message. Check the log for the reason.` }
  }
  return ok(`Sent to ${phone}. Watch the log for the delivery receipt.`)
}

/* ============================================================= dispatcher */

// Calls our own endpoint rather than duplicating the send loop, so there is
// exactly one place that talks to the gateway and exactly one place that
// decides what a failure means.
async function dispatch() {
  const token = process.env.WHATSAPP_INGEST_TOKEN
  if (!token) return { error: 'WHATSAPP_INGEST_TOKEN is not set on the server.' }

  const base =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

  try {
    const response = await fetch(`${base}/api/whatsapp/dispatch`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) return { error: body?.error ?? `Dispatcher returned ${response.status}.` }
    return body
  } catch (err) {
    return { error: String(err?.message ?? err) }
  }
}

export async function dispatchNow() {
  const result = await dispatch()
  revalidateAll()
  if (result.error) return { error: result.error }
  return ok(
    result.claimed
      ? `${result.sent} sent, ${result.failed} failed, out of ${result.claimed} claimed.`
      : 'Nothing was waiting in the queue.'
  )
}

/* ================================================================ opt-out */

export async function setOptOut(formData) {
  const { supabase, schoolId } = await ctx()
  const phone = text(formData.get('phone'))
  const optOut = bool(formData.get('opted_out'))
  if (!phone || !schoolId) return

  await supabase.from('whatsapp_contacts').upsert(
    {
      school_id: schoolId,
      phone,
      opted_out: optOut,
      opted_out_at: optOut ? new Date().toISOString() : null,
      opted_in_at: optOut ? null : new Date().toISOString(),
      opt_out_reason: optOut ? 'set by the office' : null,
    },
    { onConflict: 'school_id,phone' }
  )

  revalidateAll()
}
