// Plain module on purpose -- no 'use client'.
//
// The examination vocabulary. Exams, Tests, Date Sheets and Slips are four
// screens over the same few ideas; spelling "Ongoing" differently in two of
// them is how the filters start disagreeing with the badges.

/* ----------------------------------------------------------------- status */
// Shared by exams and tests -- the two screens filter identically and a
// second, near-identical list would drift.
export const EXAM_STATUSES = [
  { id: 'upcoming', label: 'Upcoming', tone: 'pill-blue', dot: 'var(--blue)' },
  { id: 'ongoing', label: 'Ongoing', tone: 'pill-amber', dot: 'var(--amber)' },
  { id: 'completed', label: 'Completed', tone: 'pill-green', dot: 'var(--green)' },
  { id: 'cancelled', label: 'Cancelled', tone: 'pill-muted', dot: 'var(--muted-2)' },
]

export const EXAM_STATUS_LABEL = Object.fromEntries(EXAM_STATUSES.map((s) => [s.id, s.label]))
export const EXAM_STATUS_TONE = Object.fromEntries(EXAM_STATUSES.map((s) => [s.id, s.tone]))
export const EXAM_STATUS_IDS = EXAM_STATUSES.map((s) => s.id)

// Cancelled is reached by cancelling, not by picking it out of a list on the
// create form.
export const EXAM_STATUS_OPTIONS = EXAM_STATUSES.filter((s) => s.id !== 'cancelled')

/* ------------------------------------------------------------ test types */
export const TEST_TYPES = [
  { id: 'class_test', label: 'Class test' },
  { id: 'quiz', label: 'Quiz' },
  { id: 'assignment', label: 'Assignment' },
  { id: 'mock', label: 'Mock' },
  { id: 'exam', label: 'Exam' },
]

export const TEST_TYPE_LABEL = Object.fromEntries(TEST_TYPES.map((t) => [t.id, t.label]))
export const TEST_TYPE_IDS = TEST_TYPES.map((t) => t.id)

/* ------------------------------------------------------- date sheet state */
export const SHEET_STATUSES = [
  { id: 'draft', label: 'Draft', tone: 'pill-amber' },
  { id: 'published', label: 'Published', tone: 'pill-green' },
  { id: 'archived', label: 'Archived', tone: 'pill-muted' },
]

export const SHEET_STATUS_LABEL = Object.fromEntries(SHEET_STATUSES.map((s) => [s.id, s.label]))
export const SHEET_STATUS_TONE = Object.fromEntries(SHEET_STATUSES.map((s) => [s.id, s.tone]))
export const SHEET_STATUS_IDS = SHEET_STATUSES.map((s) => s.id)

/* ---------------------------------------------------------------- grading */
// The ladder every result screen reads. Thresholds are percentages, highest
// first, so the first row a score clears is its grade.
export const GRADE_SCALE = [
  { grade: 'A+', min: 80, tone: 'pill-green', colour: 'var(--green)' },
  { grade: 'A', min: 70, tone: 'pill-green', colour: 'var(--green)' },
  { grade: 'B', min: 60, tone: 'pill-blue', colour: 'var(--blue)' },
  { grade: 'C', min: 50, tone: 'pill-brand', colour: 'var(--brand)' },
  { grade: 'D', min: 33, tone: 'pill-amber', colour: 'var(--amber)' },
  { grade: 'F', min: 0, tone: 'pill-red', colour: 'var(--red)' },
]

// p_pass is the school's configured pass mark, so a school at 40% does not
// get a D printed on a fail.
export function gradeFor(obtained, max, pass = 33) {
  const o = Number(obtained)
  const m = Number(max)
  if (!Number.isFinite(o) || !Number.isFinite(m) || m <= 0) return null
  const pct = (o / m) * 100
  if (pct < pass) return 'F'
  return GRADE_SCALE.find((g) => pct >= g.min)?.grade ?? 'F'
}

export function gradeTone(grade) {
  return GRADE_SCALE.find((g) => g.grade === grade)?.tone ?? 'pill-muted'
}

export function percent(obtained, max) {
  const o = Number(obtained)
  const m = Number(max)
  if (!Number.isFinite(o) || !Number.isFinite(m) || m <= 0) return null
  return Math.round((o / m) * 1000) / 10
}

/* -------------------------------------------------------------- utilities */

// The weekday a paper falls on. Stored on the row rather than derived at
// render time -- see 009_examinations.sql -- but this is what fills it in.
export function dayFromDate(date) {
  if (!date) return ''
  const ms = Date.parse(`${date}T00:00:00Z`)
  if (!Number.isFinite(ms)) return ''
  return new Date(ms).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' })
}

// 14:30 -> 2:30 PM. The database stores time without a zone, and toLocale on
// a bare time string is a parse error, so this is done by hand.
export function clock(time) {
  if (!time) return '—'
  const [h, m] = String(time).split(':')
  const hour = Number(h)
  if (!Number.isFinite(hour)) return String(time)
  const suffix = hour >= 12 ? 'PM' : 'AM'
  const twelve = hour % 12 === 0 ? 12 : hour % 12
  return `${twelve}:${m ?? '00'} ${suffix}`
}

export function dateLabel(date) {
  if (!date) return '—'
  const ms = Date.parse(`${date}T00:00:00Z`)
  if (!Number.isFinite(ms)) return String(date)
  return new Date(ms).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}
