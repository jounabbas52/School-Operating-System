'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  PASSENGER_STATUS_IDS,
  ROUTE_STATUS_IDS,
  VEHICLE_STATUS_IDS,
  VEHICLE_TYPE_IDS,
} from '@/lib/operations-options'

// Authority is RLS. transport_routes, vehicles and passengers all carry the
// standard tenant policy set against transport.read / transport.write. What
// follows is input shaping.

const PATHS = [
  '/school/transport',
  '/school/transport/routes',
  '/school/transport/vehicles',
  '/school/transport/students',
]

function revalidateAll() {
  for (const p of PATHS) revalidatePath(p)
  revalidatePath('/school')
}

function pgMessage(error, subject = 'record') {
  if (error.code === '23505') {
    if (error.message.includes('registration')) return 'That registration number is already used.'
    if (error.message.includes('route_code')) return 'That route code is already used.'
    if (error.message.includes('passengers_one_active')) {
      return 'That student already has an active transport assignment.'
    }
    if (error.message.includes('name')) return 'A route with that name already exists.'
    return `That ${subject} already exists.`
  }
  if (error.code === '42501') return `You do not have permission to change ${subject}s.`
  if (error.code === '23503') return 'A linked record no longer exists. Reload and try again.'
  if (error.code === '23514') return 'Some values are out of range. Check the dates and numbers.'
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

/* ================================================================== routes */

export async function saveRoute(_prev, formData) {
  const id = text(formData.get('id'))
  const name = text(formData.get('name'))

  if (!name) return { error: 'Enter a route name.' }

  const status = text(formData.get('status')) ?? 'active'
  if (!ROUTE_STATUS_IDS.includes(status)) return { error: 'Unknown status.' }

  const { supabase, schoolId } = await ctx()
  if (!schoolId) return { error: 'No active school.' }

  // Stops arrive as one input per stop, in the order they were added. Stored
  // as a jsonb array because that order is the route -- a separate table would
  // need a sort column and a second write to maintain it.
  const stops = formData
    .getAll('stop')
    .map((s) => String(s).trim())
    .filter(Boolean)

  const payload = {
    school_id: schoolId,
    name,
    area: text(formData.get('area')),
    driver_name: text(formData.get('driver_name')),
    driver_phone: text(formData.get('driver_phone')),
    start_point: stops[0] ?? null,
    end_point: stops.length > 1 ? stops[stops.length - 1] : null,
    stops,
    fare: num(formData.get('fare')),
    status,
  }

  if (id) {
    const { error } = await supabase.from('transport_routes').update(payload).eq('id', id)
    if (error) return { error: pgMessage(error, 'route') }
  } else {
    const { data: code } = await supabase.rpc('next_route_code', {
      p_school: schoolId,
      p_prefix: 'RT',
    })

    const { error } = await supabase
      .from('transport_routes')
      .insert({ ...payload, route_code: code })
    if (error) return { error: pgMessage(error, 'route') }
  }

  revalidateAll()
  return ok(id ? `${name} updated.` : `${name} created.`)
}

export async function deleteRoute(formData) {
  const id = String(formData.get('id'))
  const { supabase } = await ctx()

  // Soft delete: passengers and vehicles point here, and a hard delete would
  // orphan a student's pickup arrangement mid-term.
  const { error } = await supabase
    .from('transport_routes')
    .update({ is_deleted: true, deleted_at: new Date().toISOString(), status: 'inactive' })
    .eq('id', id)

  if (error) throw new Error(pgMessage(error, 'route'))
  revalidateAll()
}

/* ================================================================ vehicles */

export async function saveVehicle(_prev, formData) {
  const id = text(formData.get('id'))
  const registration = text(formData.get('registration_no'))

  if (!registration) return { error: 'Enter a registration number.' }

  const type = text(formData.get('vehicle_type')) ?? 'bus'
  if (!VEHICLE_TYPE_IDS.includes(type)) return { error: 'Unknown vehicle type.' }

  const status = text(formData.get('status')) ?? 'active'
  if (!VEHICLE_STATUS_IDS.includes(status)) return { error: 'Unknown status.' }

  const { supabase, schoolId } = await ctx()
  if (!schoolId) return { error: 'No active school.' }

  const payload = {
    school_id: schoolId,
    registration_no: registration.toUpperCase(),
    vehicle_type: type,
    model: text(formData.get('model')),
    capacity: num(formData.get('capacity')),
    driver_name: text(formData.get('driver_name')),
    driver_phone: text(formData.get('driver_phone')),
    route_id: text(formData.get('route_id')),
    fitness_expiry: text(formData.get('fitness_expiry')),
    insurance_expiry: text(formData.get('insurance_expiry')),
    status,
    notes: text(formData.get('notes')),
  }

  if (id) {
    const { error } = await supabase.from('vehicles').update(payload).eq('id', id)
    if (error) return { error: pgMessage(error, 'vehicle') }
  } else {
    const { error } = await supabase.from('vehicles').insert(payload)
    if (error) return { error: pgMessage(error, 'vehicle') }
  }

  revalidateAll()
  return ok(id ? `${payload.registration_no} updated.` : `${payload.registration_no} added.`)
}

export async function deleteVehicle(formData) {
  const id = String(formData.get('id'))
  const { supabase } = await ctx()

  const { error } = await supabase
    .from('vehicles')
    .update({ is_deleted: true, deleted_at: new Date().toISOString(), status: 'inactive' })
    .eq('id', id)

  if (error) throw new Error(pgMessage(error, 'vehicle'))
  revalidateAll()
}

/* ============================================================== passengers */

export async function savePassenger(_prev, formData) {
  const id = text(formData.get('id'))
  const studentId = text(formData.get('student_id'))

  if (!studentId) return { error: 'Choose a student.' }

  const status = text(formData.get('status')) ?? 'active'
  if (!PASSENGER_STATUS_IDS.includes(status)) return { error: 'Unknown status.' }

  const fee = num(formData.get('monthly_fee')) ?? 0
  if (fee < 0) return { error: 'The monthly fee cannot be negative.' }

  const { supabase, schoolId } = await ctx()
  if (!schoolId) return { error: 'No active school.' }

  const routeId = text(formData.get('route_id'))

  const payload = {
    school_id: schoolId,
    student_id: studentId,
    route_id: routeId,
    vehicle_id: text(formData.get('vehicle_id')),
    pickup_point: text(formData.get('pickup_point')),
    drop_point: text(formData.get('drop_point')),
    monthly_fee: fee,
    notes: text(formData.get('notes')),
    status,
  }

  if (id) {
    const { error } = await supabase.from('passengers').update(payload).eq('id', id)
    if (error) return { error: pgMessage(error, 'transport student') }
  } else {
    const { error } = await supabase.from('passengers').insert(payload)
    if (error) return { error: pgMessage(error, 'transport student') }
  }

  revalidateAll()
  return ok(id ? 'Transport details updated.' : 'Student registered for transport.')
}

export async function deletePassenger(formData) {
  const id = String(formData.get('id'))
  const { supabase } = await ctx()

  // Status goes inactive alongside the soft delete so the partial unique index
  // on (school_id, student_id) WHERE status = 'active' releases, and the
  // student can be enrolled on another route.
  const { error } = await supabase
    .from('passengers')
    .update({ is_deleted: true, deleted_at: new Date().toISOString(), status: 'inactive' })
    .eq('id', id)

  if (error) throw new Error(pgMessage(error, 'transport student'))
  revalidateAll()
}

export async function setPassengerStatus(formData) {
  const id = String(formData.get('id'))
  const status = String(formData.get('status'))
  if (!PASSENGER_STATUS_IDS.includes(status)) throw new Error('Unknown status.')

  const { supabase } = await ctx()
  const { error } = await supabase.from('passengers').update({ status }).eq('id', id)
  if (error) throw new Error(pgMessage(error, 'transport student'))
  revalidateAll()
}
