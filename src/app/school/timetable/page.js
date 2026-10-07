import Link from 'next/link'
import { getSchoolContext } from '@/lib/school-context'
import { StatCard, StatRow } from '@/components/stats'
import ExportButtons from '@/components/export-buttons'
import { DAY_LABEL, gridColumns, timeRange } from '@/lib/timetable'
import { staffName } from '@/lib/staff-options'
import TimetableGrid from './timetable-grid'

export const metadata = { title: 'Timetable' }

export default async function TimetablePage({ searchParams }) {
  const params = await searchParams
  const classFilter = params?.class ?? ''
  const sectionFilter = params?.section ?? ''

  const { schoolId, permissions, supabase } = await getSchoolContext()
  const canWrite = permissions.has('academics.write')

  const { data: active } = await supabase
    .from('sessions')
    .select('id, name')
    .eq('school_id', schoolId)
    .eq('is_current', true)
    .maybeSingle()

  const [{ data: classes }, { data: sections }, { data: subjects }, { data: staff }] =
    await Promise.all([
      supabase
        .from('classes')
        .select('id, name, session_id, grade_levels(name, ordinal)')
        .eq('school_id', schoolId)
        .eq('is_deleted', false),
      supabase
        .from('sections')
        .select('id, name, class_id')
        .eq('school_id', schoolId)
        .eq('is_deleted', false)
        .order('name'),
      supabase
        .from('subjects')
        .select('id, name')
        .eq('school_id', schoolId)
        .eq('is_deleted', false)
        .order('name'),
      supabase
        .from('staff')
        .select('id, first_name, last_name, staff_number')
        .eq('school_id', schoolId)
        .eq('is_deleted', false)
        .eq('staff_type', 'teaching')
        .in('status', ['active', 'on_leave'])
        .order('first_name'),
    ])

  const thisSession = (classes ?? [])
    .filter((c) => !active || c.session_id === active.id)
    .sort((a, b) => (a.grade_levels?.ordinal ?? 999) - (b.grade_levels?.ordinal ?? 999))

  const classOptions = thisSession.map((c) => ({ id: c.id, label: c.grade_levels?.name ?? c.name }))

  // Default to the first class and its first section, so the grid is on screen
  // rather than behind two dropdowns nobody has touched yet.
  const classId = classFilter || classOptions[0]?.id || ''
  const sectionOptions = (sections ?? []).filter((s) => s.class_id === classId)
  const sectionId = sectionOptions.some((s) => s.id === sectionFilter)
    ? sectionFilter
    : (sectionOptions[0]?.id ?? '')

  const className = classOptions.find((c) => c.id === classId)?.label ?? null
  const sectionName = sectionOptions.find((s) => s.id === sectionId)?.name ?? null

  let periods = []
  let entries = {}
  let error = null

  if (classId) {
    const [{ data: slots, error: slotError }, { data: rows }] = await Promise.all([
      supabase
        .from('periods')
        .select('id, day_of_week, name, kind, start_time, end_time, sort_order')
        .eq('school_id', schoolId)
        .eq('class_id', classId)
        .eq('is_deleted', false)
        .order('day_of_week')
        .order('sort_order'),
      sectionId
        ? supabase
            .from('timetable_entries')
            .select('period_id, subject_id, teacher_id, room_number, subjects(name), staff(first_name, last_name)')
            .eq('school_id', schoolId)
            .eq('section_id', sectionId)
            .eq('is_deleted', false)
        : Promise.resolve({ data: [] }),
    ])

    error = slotError
    periods = slots ?? []
    entries = Object.fromEntries(
      (rows ?? []).map((r) => [
        r.period_id,
        {
          subject_id: r.subject_id,
          subject_name: r.subjects?.name ?? 'Subject',
          teacher_id: r.teacher_id,
          teacher_name: r.staff ? staffName(r.staff) : null,
          room_number: r.room_number,
        },
      ])
    )
  }

  const columns = gridColumns(periods)
  const days = [...new Set(periods.map((p) => p.day_of_week))].sort((a, b) => a - b)

  // Slots by day, then by position, which is how the grid indexes its cells.
  const periodsByDay = {}
  for (const p of periods) {
    periodsByDay[p.day_of_week] ??= {}
    periodsByDay[p.day_of_week][p.sort_order] = p
  }

  // Breaks are not slots to fill, so they are out of both the denominator and
  // the fill rate. A 100% timetable should not need a lesson at lunch.
  const teachable = periods.filter((p) => p.kind === 'regular')
  const filled = teachable.filter((p) => entries[p.id]).length
  const fillRate = teachable.length ? Math.round((filled / teachable.length) * 100) : 0
  const uniqueSubjects = new Set(
    teachable.map((p) => entries[p.id]?.subject_id).filter(Boolean)
  ).size

  const exportRows = teachable.map((p) => ({
    day: DAY_LABEL[p.day_of_week],
    period: p.name,
    time: timeRange(p.start_time, p.end_time),
    subject: entries[p.id]?.subject_name ?? '',
    teacher: entries[p.id]?.teacher_name ?? '',
    room: entries[p.id]?.room_number ?? '',
  }))

  const label = [className, sectionName].filter(Boolean).join(' — ')

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>
            Timetable
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
            {label || 'No class selected'}
            {active ? ` · ${active.name}` : ''}
          </p>
        </div>

        <ExportButtons
          rows={exportRows}
          columns={[
            { key: 'day', label: 'Day' },
            { key: 'period', label: 'Period' },
            { key: 'time', label: 'Time' },
            { key: 'subject', label: 'Subject' },
            { key: 'teacher', label: 'Teacher' },
            { key: 'room', label: 'Room' },
          ]}
          filename={`timetable-${(label || 'class').toLowerCase().replace(/\W+/g, '-')}`}
          title="Timetable"
          subtitle={label}
        />
      </div>

      {/* ------------------------------------------------------------ tabs */}
      <div className="flex flex-wrap items-center gap-1">
        <span className="tab tab-on">Timetable</span>
        <Link href="/school/timetable/periods" className="tab">
          Periods
        </Link>
      </div>

      <StatRow>
        <StatCard label="Periods filled" value={filled} tone="brand" />
        <StatCard label="Total slots" value={teachable.length} sub="breaks excluded" tone="blue" />
        <StatCard label="Unique subjects" value={uniqueSubjects} tone="green" />
        <StatCard label="Fill rate" value={`${fillRate}%`} tone="amber" />
      </StatRow>

      {/* --------------------------------------------------------- pickers */}
      <form className="card flex flex-wrap items-end gap-3 p-3">
        <div className="min-w-44">
          <span className="label">Class</span>
          <select name="class" defaultValue={classId} className="field" aria-label="Class">
            {classOptions.length === 0 && <option value="">No classes yet</option>}
            {classOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <div className="min-w-36">
          <span className="label">Section</span>
          <select name="section" defaultValue={sectionId} className="field" aria-label="Section">
            {sectionOptions.length === 0 && <option value="">No sections</option>}
            {sectionOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <button className="btn btn-primary">Show</button>

        <p className="ml-auto text-xs" style={{ color: 'var(--muted)' }}>
          {canWrite ? 'Click any cell to assign a subject.' : 'Read only.'}
        </p>
      </form>

      {/* ------------------------------------------------------- progress */}
      {teachable.length > 0 && (
        <div className="card flex flex-wrap items-center gap-3 p-3">
          <span className="text-xs font-semibold" style={{ color: 'var(--brand-ink)' }}>
            Schedule progress
          </span>
          <div
            className="h-2 min-w-40 flex-1 overflow-hidden rounded-full"
            style={{ background: 'var(--border-soft)' }}
          >
            <div
              className="h-full rounded-full"
              style={{ width: `${fillRate}%`, background: 'var(--brand-grad)' }}
            />
          </div>
          <span className="text-xs font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>
            {fillRate}%
          </span>
          <span className="text-xs tabular-nums" style={{ color: 'var(--muted)' }}>
            {filled}/{teachable.length} filled
          </span>
        </div>
      )}

      {error && (
        <p
          className="rounded-lg px-3 py-2 text-sm"
          style={{ background: 'var(--red-soft)', color: 'var(--red-ink)' }}
        >
          {error.message}
        </p>
      )}

      {!classOptions.length ? (
        <Empty
          title="No classes yet"
          body="A timetable is built for one class at a time. Create classes and sections first."
          href="/school/academics/classes"
          cta="Go to Classes"
        />
      ) : !sectionOptions.length ? (
        <Empty
          title={`${className} has no sections`}
          body="Lessons are assigned per section, so the grid needs at least one."
          href="/school/academics/sections"
          cta="Go to Sections"
        />
      ) : !periods.length ? (
        <Empty
          title={`No periods set up for ${className}`}
          body="Build the bell schedule first — the grid draws its columns from it."
          href={`/school/timetable/periods?class=${classId}`}
          cta="Set up periods"
        />
      ) : (
        <TimetableGrid
          days={days}
          columns={columns}
          periodsByDay={periodsByDay}
          entries={entries}
          subjects={(subjects ?? []).map((s) => ({ id: s.id, label: s.name }))}
          teachers={(staff ?? []).map((s) => ({
            id: s.id,
            label: `${staffName(s)}${s.staff_number ? ` · ${s.staff_number}` : ''}`,
          }))}
          classId={classId}
          sectionId={sectionId}
          canWrite={canWrite}
        />
      )}
    </div>
  )
}

function Empty({ title, body, href, cta }) {
  return (
    <div className="card px-6 py-16 text-center" style={{ borderStyle: 'dashed' }}>
      <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
        {title}
      </p>
      <p className="mx-auto mt-1 max-w-sm text-sm" style={{ color: 'var(--muted)' }}>
        {body}
      </p>
      <Link href={href} className="btn btn-primary mt-4">
        {cta}
      </Link>
    </div>
  )
}
