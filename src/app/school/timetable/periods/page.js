import Link from 'next/link'
import { getSchoolContext } from '@/lib/school-context'
import ExportButtons from '@/components/export-buttons'
import ConfirmButton from '@/components/confirm'
import { DAY_LABEL, clock } from '@/lib/timetable'
import { deletePeriod, deletePeriods } from '../actions'
import { BulkPeriodsPanel, SinglePeriodPanel, TimingPanel } from './period-panels'

export const metadata = { title: 'Periods' }

export default async function PeriodsPage({ searchParams }) {
  const params = await searchParams
  const classFilter = params?.class ?? ''
  const q = (params?.q ?? '').trim()

  const { schoolId, permissions, supabase } = await getSchoolContext()
  const canWrite = permissions.has('academics.write')

  const { data: active } = await supabase
    .from('sessions')
    .select('id')
    .eq('school_id', schoolId)
    .eq('is_current', true)
    .maybeSingle()

  const [{ data: classes }, { data: settings }] = await Promise.all([
    supabase
      .from('classes')
      .select('id, name, session_id, grade_levels(name, ordinal)')
      .eq('school_id', schoolId)
      .eq('is_deleted', false),
    supabase
      .from('timetable_settings')
      .select('class_id, start_time, period_minutes, periods_per_day, short_break_after, short_break_minutes, lunch_after, lunch_minutes, days')
      .eq('school_id', schoolId),
  ])

  const thisSession = (classes ?? [])
    .filter((c) => !active || c.session_id === active.id)
    .sort((a, b) => (a.grade_levels?.ordinal ?? 999) - (b.grade_levels?.ordinal ?? 999))

  const classOptions = thisSession.map((c) => ({ id: c.id, label: c.grade_levels?.name ?? c.name }))
  const classById = new Map(classOptions.map((c) => [c.id, c.label]))

  // The dialogs open on whatever this class last generated with, so nobody
  // retypes a bell schedule they already set.
  const settingsFor = (id) => (settings ?? []).find((s) => s.class_id === id) ?? null

  let query = supabase
    .from('periods')
    .select('id, class_id, day_of_week, name, kind, start_time, end_time, sort_order')
    .eq('school_id', schoolId)
    .eq('is_deleted', false)

  if (classFilter) query = query.eq('class_id', classFilter)

  const { data: allPeriods, error } = await query
    .order('class_id')
    .order('day_of_week')
    .order('sort_order')

  const needle = q.toLowerCase()
  const periods = (allPeriods ?? []).filter((p) => {
    if (!needle) return true
    return (
      p.name.toLowerCase().includes(needle) ||
      (classById.get(p.class_id) ?? '').toLowerCase().includes(needle) ||
      DAY_LABEL[p.day_of_week].toLowerCase().includes(needle)
    )
  })

  const exportRows = periods.map((p, i) => ({
    n: i + 1,
    klass: classById.get(p.class_id) ?? '—',
    day: DAY_LABEL[p.day_of_week],
    name: p.name,
    start: clock(p.start_time),
    end: clock(p.end_time),
    kind: p.kind === 'break' ? 'Break' : 'Regular',
  }))

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>
            Timetable
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
            The bell schedule the grid draws its columns from.
          </p>
        </div>

        <ExportButtons
          rows={exportRows}
          columns={[
            { key: 'n', label: 'Sr.' },
            { key: 'klass', label: 'Class' },
            { key: 'day', label: 'Day' },
            { key: 'name', label: 'Name' },
            { key: 'start', label: 'Start time' },
            { key: 'end', label: 'End time' },
            { key: 'kind', label: 'Type' },
          ]}
          filename="periods"
          title="Periods"
          subtitle={classFilter ? classById.get(classFilter) : 'All classes'}
        />
      </div>

      {/* ------------------------------------------------------------ tabs */}
      <div className="flex flex-wrap items-center gap-1">
        <Link href="/school/timetable" className="tab">
          Timetable
        </Link>
        <span className="tab tab-on">Periods</span>
      </div>

      {/* --------------------------------------------------------- toolbar */}
      <div className="card flex flex-col gap-3 p-4">
        <p className="text-[0.68rem] font-bold uppercase tracking-wider" style={{ color: 'var(--brand-ink)' }}>
          Periods
        </p>

        {canWrite && (
          <div className="flex flex-wrap items-center gap-2">
            <SinglePeriodPanel
              classes={classOptions}
              trigger={{ label: '+ Add Single Period', className: 'btn btn-ghost' }}
            />
            <BulkPeriodsPanel
              classes={classOptions}
              defaults={settingsFor(classFilter)}
              trigger={{ label: '+ Add Bulk Periods', className: 'btn btn-ghost' }}
            />
            <TimingPanel
              classes={classOptions}
              classId={classFilter}
              defaults={settingsFor(classFilter)}
              trigger={{ label: 'Change Timing', className: 'btn btn-ghost' }}
            />
            {classFilter && periods.length > 0 && (
              <form action={deletePeriods}>
                <input type="hidden" name="class_id" value={classFilter} />
                <ConfirmButton
                  className="btn btn-danger"
                  title={`Delete every period for ${classById.get(classFilter)}?`}
                  message="The whole bell schedule goes, and every lesson assigned to it. Nothing else is touched."
                  confirmLabel="Delete periods"
                >
                  Delete Periods
                </ConfirmButton>
              </form>
            )}
          </div>
        )}

        <form className="flex flex-wrap items-center gap-2">
          <select
            name="class"
            defaultValue={classFilter}
            className="field w-auto min-w-44"
            aria-label="Filter by class"
          >
            <option value="">All classes</option>
            {classOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>

          <input
            name="q"
            defaultValue={q}
            placeholder="Search periods…"
            className="field min-w-56 flex-1"
          />
          <button className="btn btn-primary">Search</button>
          {(q || classFilter) && (
            <Link href="/school/timetable/periods" className="btn btn-ghost">
              Clear
            </Link>
          )}
        </form>

        <p className="text-xs" style={{ color: 'var(--muted)' }}>
          There {periods.length === 1 ? 'is' : 'are'}{' '}
          <strong style={{ color: 'var(--ink)' }}>{periods.length}</strong> period
          {periods.length === 1 ? '' : 's'} registered
          {classFilter ? ` for ${classById.get(classFilter)}` : ' in the system'}.
        </p>
      </div>

      {error && (
        <p
          className="rounded-lg px-3 py-2 text-sm"
          style={{ background: 'var(--red-soft)', color: 'var(--red-ink)' }}
        >
          {error.message}
        </p>
      )}

      {!periods.length ? (
        <div className="card px-6 py-16 text-center" style={{ borderStyle: 'dashed' }}>
          <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            {q || classFilter ? 'No periods match those filters' : 'No periods yet'}
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm" style={{ color: 'var(--muted)' }}>
            {classOptions.length
              ? 'Add Bulk Periods builds a whole week from a start time, a period length and two break rules.'
              : 'Create classes first — a bell schedule belongs to a class.'}
          </p>
          {!classOptions.length && (
            <Link href="/school/academics/classes" className="btn btn-primary mt-4">
              Go to Classes
            </Link>
          )}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table min-w-[54rem]">
            <thead>
              <tr>
                <th>Sr.</th>
                <th>Class</th>
                <th>Day</th>
                <th>Name</th>
                <th>Start time</th>
                <th>End time</th>
                <th>Type</th>
                <th className="text-right">Options</th>
              </tr>
            </thead>
            <tbody>
              {periods.map((p, i) => (
                <tr key={p.id}>
                  <td className="tabular-nums" style={{ color: 'var(--muted)' }}>
                    {i + 1}
                  </td>
                  <td>
                    <span className="font-medium" style={{ color: 'var(--ink)' }}>
                      {classById.get(p.class_id) ?? '—'}
                    </span>
                  </td>
                  <td>{DAY_LABEL[p.day_of_week]}</td>
                  <td>{p.name}</td>
                  <td className="tabular-nums">{clock(p.start_time)}</td>
                  <td className="tabular-nums">{clock(p.end_time)}</td>
                  <td>
                    <span className={`pill ${p.kind === 'break' ? 'pill-amber' : 'pill-blue'}`}>
                      {p.kind === 'break' ? 'Break' : 'Regular'}
                    </span>
                  </td>
                  <td>
                    <div className="flex items-center justify-end gap-1.5">
                      {canWrite ? (
                        <>
                          <SinglePeriodPanel
                            row={p}
                            classes={classOptions}
                            trigger={{ label: 'Edit', className: 'btn btn-ghost !px-2.5 !py-1' }}
                          />
                          <form action={deletePeriod}>
                            <input type="hidden" name="id" value={p.id} />
                            <ConfirmButton
                              className="btn btn-danger !px-2.5 !py-1"
                              title={`Delete ${p.name}?`}
                              message={`${DAY_LABEL[p.day_of_week]}, ${clock(p.start_time)} — any lesson assigned to this slot goes with it.`}
                              confirmLabel="Delete"
                            >
                              Delete
                            </ConfirmButton>
                          </form>
                        </>
                      ) : (
                        <span className="text-xs" style={{ color: 'var(--muted-2)' }}>
                          read only
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
