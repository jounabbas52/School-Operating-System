// Plain module on purpose -- no 'use client'.
//
// The schedule generator lives here because BOTH sides need it: the bulk
// dialog draws a live preview in the browser, and the server action writes the
// rows. Two implementations would drift, and the first symptom would be a
// preview that quietly lied about what was saved.

// ISO day numbering, so day_of_week matches EXTRACT(isodow) in Postgres.
export const DAYS = [
  { id: 1, label: 'Monday', short: 'Mon' },
  { id: 2, label: 'Tuesday', short: 'Tue' },
  { id: 3, label: 'Wednesday', short: 'Wed' },
  { id: 4, label: 'Thursday', short: 'Thu' },
  { id: 5, label: 'Friday', short: 'Fri' },
  { id: 6, label: 'Saturday', short: 'Sat' },
  { id: 7, label: 'Sunday', short: 'Sun' },
]

export const DAY_LABEL = Object.fromEntries(DAYS.map((d) => [d.id, d.label]))
export const DAY_SHORT = Object.fromEntries(DAYS.map((d) => [d.id, d.short]))

export const WORKING_DAYS = [1, 2, 3, 4, 5, 6]

export const PERIOD_KINDS = [
  { id: 'regular', label: 'Regular' },
  { id: 'break', label: 'Break' },
]

/* --------------------------------------------------------------- clock */

// 'HH:MM' or 'HH:MM:SS' -> minutes since midnight. Postgres hands back the
// seconds form; an <input type="time"> only ever sends the short one.
export function toMinutes(value) {
  if (typeof value !== 'string') return null
  const match = /^(\d{1,2}):(\d{2})/.exec(value)
  if (!match) return null
  const h = Number(match[1])
  const m = Number(match[2])
  if (h > 23 || m > 59) return null
  return h * 60 + m
}

export function toTime(minutes) {
  // Wraps at midnight rather than producing 25:30, which Postgres would take
  // but nobody can read.
  const total = ((Math.round(minutes) % 1440) + 1440) % 1440
  const h = Math.floor(total / 60)
  const m = total % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// 08:00 -> 8:00 AM. Used everywhere a time is shown rather than edited.
export function clock(value) {
  const minutes = toMinutes(value)
  if (minutes === null) return '—'
  const h24 = Math.floor(minutes / 60)
  const m = minutes % 60
  const suffix = h24 < 12 ? 'AM' : 'PM'
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`
}

export const timeRange = (start, end) => `${clock(start)} – ${clock(end)}`

/* ------------------------------------------------------------ generator */

export const DEFAULT_SETTINGS = {
  start_time: '08:00',
  periods_per_day: 7,
  period_minutes: 45,
  short_break_after: 3,
  short_break_minutes: 10,
  lunch_after: 5,
  lunch_minutes: 30,
  days: [1, 2, 3, 4, 5],
}

const clampInt = (value, min, max, fallback) => {
  const n = Math.trunc(Number(value))
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

// Bring anything -- a form payload, a stored row, a half-typed dialog -- to a
// settings object the generator can run on without further checking.
export function normaliseSettings(input = {}) {
  const periods = clampInt(input.periods_per_day, 1, 20, DEFAULT_SETTINGS.periods_per_day)
  return {
    start_time: toMinutes(input.start_time) === null ? DEFAULT_SETTINGS.start_time : input.start_time.slice(0, 5),
    periods_per_day: periods,
    period_minutes: clampInt(input.period_minutes, 5, 240, DEFAULT_SETTINGS.period_minutes),
    // 0 means "no break". Anything past the last period would never fire, so
    // it is folded to 0 rather than silently kept.
    short_break_after: clampInt(input.short_break_after, 0, periods, 0),
    short_break_minutes: clampInt(input.short_break_minutes, 0, 180, 0),
    lunch_after: clampInt(input.lunch_after, 0, periods, 0),
    lunch_minutes: clampInt(input.lunch_minutes, 0, 180, 0),
    days: Array.isArray(input.days)
      ? [...new Set(input.days.map(Number).filter((d) => d >= 1 && d <= 7))].sort((a, b) => a - b)
      : DEFAULT_SETTINGS.days,
  }
}

// One day's slots, breaks included, in the order they are rung.
export function buildDay(input) {
  const s = normaliseSettings(input)
  const slots = []
  let cursor = toMinutes(s.start_time)
  let order = 1

  const push = (name, kind, minutes) => {
    if (minutes <= 0) return
    slots.push({
      name,
      kind,
      start_time: toTime(cursor),
      end_time: toTime(cursor + minutes),
      sort_order: order,
    })
    cursor += minutes
    order += 1
  }

  for (let n = 1; n <= s.periods_per_day; n++) {
    push(`Period ${n}`, 'regular', s.period_minutes)
    // Both breaks can land after the same period; the short one rings first,
    // which is the order a school reads them in.
    if (s.short_break_after === n) push('Break', 'break', s.short_break_minutes)
    if (s.lunch_after === n) push('Lunch Break', 'break', s.lunch_minutes)
  }

  return slots
}

// Every row the generator would write: one day's shape, repeated.
export function buildSchedule(input) {
  const s = normaliseSettings(input)
  const day = buildDay(s)
  return s.days.flatMap((dayOfWeek) => day.map((slot) => ({ ...slot, day_of_week: dayOfWeek })))
}

/* ---------------------------------------------------------------- grid */

// Columns for the timetable grid. Periods are stored per day, so a Friday
// that finishes early has fewer rows than a Monday. The grid is drawn from
// the union of slot positions, labelled from the first day that actually has
// that slot -- a column can then be blank on Friday without shifting Monday's
// lessons one cell to the left.
export function gridColumns(periods) {
  const bySlot = new Map()
  for (const p of periods) {
    const existing = bySlot.get(p.sort_order)
    if (!existing || p.day_of_week < existing.day_of_week) bySlot.set(p.sort_order, p)
  }
  return [...bySlot.values()]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((p) => ({
      sort_order: p.sort_order,
      name: p.name,
      kind: p.kind,
      start_time: p.start_time,
      end_time: p.end_time,
    }))
}
