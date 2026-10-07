import Link from 'next/link'
import { getSchoolContext } from '@/lib/school-context'
import { StatCard, StatRow } from '@/components/stats'
import ExportButtons from '@/components/export-buttons'
import { monthRange, rateBand, today } from '@/lib/attendance-options'

export const metadata = { title: 'Attendance History' }

export default async function AttendanceHistoryPage({ searchParams }) {
  const params = await searchParams
  const sessionFilter = params?.session ?? ''
  const classFilter = params?.class ?? ''
  const sectionFilter = params?.section ?? ''
  const month = /^\d{4}-\d{2}$/.test(params?.month ?? '') ? params.month : ''

  const { schoolId, supabase } = await getSchoolContext()

  const [{ data: sessions }, { data: classes }, { data: sections }] = await Promise.all([
    supabase
      .from('sessions')
      .select('id, name, start_date, end_date, is_current')
      .eq('school_id', schoolId)
      .eq('is_deleted', false)
      .order('start_date', { ascending: false }),
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
  ])

  const chosenSession = (sessions ?? []).find((s) => s.id === sessionFilter)

  // The window narrows from the outside in: session first, then month inside
  // it. With neither, the whole register is fair game -- this is the history
  // screen, so an unbounded look-back is the point.
  const monthWindow = month ? monthRange(month) : null
  const from = monthWindow?.from ?? chosenSession?.start_date ?? '1900-01-01'
  const to = monthWindow?.to ?? chosenSession?.end_date ?? today()

  const classOptions = (classes ?? [])
    .filter((c) => !sessionFilter || c.session_id === sessionFilter)
    .sort((a, b) => (a.grade_levels?.ordinal ?? 999) - (b.grade_levels?.ordinal ?? 999))
    .map((c) => ({ id: c.id, label: c.grade_levels?.name ?? c.name }))

  const sectionOptions = (sections ?? []).filter((s) => s.class_id === classFilter)
  const classById = new Map(
    (classes ?? []).map((c) => [c.id, c.grade_levels?.name ?? c.name])
  )
  const sectionById = new Map((sections ?? []).map((s) => [s.id, s.name]))

  const { data: perDay, error } = await supabase.rpc('attendance_daily_summary', {
    p_from: from,
    p_to: to,
    p_class: classFilter || null,
    p_section: sectionFilter || null,
  })

  const rows = (perDay ?? []).map((day) => {
    const total = Number(day.total)
    const present = Number(day.present)
    const late = Number(day.late)
    return {
      date: day.date,
      klass:
        [classById.get(day.class_id), sectionById.get(day.section_id)].filter(Boolean).join(' · ') ||
        '—',
      total,
      present,
      absent: Number(day.absent),
      late,
      leave: Number(day.leave_count),
      rate: total ? Math.round(((present + late) / total) * 100) : 0,
    }
  })

  const totals = rows.reduce(
    (acc, r) => ({
      total: acc.total + r.total,
      present: acc.present + r.present,
      absent: acc.absent + r.absent,
      late: acc.late + r.late,
    }),
    { total: 0, present: 0, absent: 0, late: 0 }
  )
  const avgRate = totals.total
    ? Math.round(((totals.present + totals.late) / totals.total) * 100)
    : 0

  // A "session" here is a register that was taken: one class, one day.
  const sessionCount = rows.length

  // Twelve months back from today, which is as far as a school ever scrolls.
  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const d = new Date()
    d.setUTCDate(1)
    d.setUTCMonth(d.getUTCMonth() - i)
    const value = d.toISOString().slice(0, 7)
    return {
      value,
      label: d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
    }
  })

  const filtered = Boolean(sessionFilter || classFilter || sectionFilter || month)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>
            Attendance History
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
            View and filter past attendance records · {from} → {to}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link href="/school/attendance/reports" className="btn btn-ghost">
            Back to reports
          </Link>
          <ExportButtons
            rows={rows}
            columns={[
              { key: 'date', label: 'Date' },
              { key: 'klass', label: 'Class' },
              { key: 'total', label: 'Total' },
              { key: 'present', label: 'Present' },
              { key: 'absent', label: 'Absent' },
              { key: 'late', label: 'Late' },
              { key: 'leave', label: 'Leave' },
              { key: 'rate', label: 'Rate %' },
            ]}
            filename="attendance-history"
            title="Attendance History"
            subtitle={`${from} → ${to}`}
          />
        </div>
      </div>

      <StatRow>
        <StatCard label="Registers taken" value={sessionCount} tone="brand" />
        <StatCard label="Avg rate" value={`${avgRate}%`} tone="green" />
        <StatCard label="Total present" value={totals.present} tone="blue" />
        <StatCard label="Total absent" value={totals.absent} tone="red" />
      </StatRow>

      {/* --------------------------------------------------------- filters */}
      <form className="card grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <span className="label">Session</span>
          <select name="session" defaultValue={sessionFilter} className="field" aria-label="Session">
            <option value="">All sessions</option>
            {(sessions ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.is_current ? `${s.name} (active)` : s.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <span className="label">Class</span>
          <select name="class" defaultValue={classFilter} className="field" aria-label="Class">
            <option value="">All classes</option>
            {classOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <span className="label">Section</span>
          <select
            name="section"
            defaultValue={sectionFilter}
            className="field"
            aria-label="Section"
            disabled={!classFilter}
          >
            <option value="">{classFilter ? 'All sections' : 'Choose a class first'}</option>
            {sectionOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <span className="label">Month</span>
          <select name="month" defaultValue={month} className="field" aria-label="Month">
            <option value="">All months</option>
            {monthOptions.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-end gap-2">
          <button className="btn btn-primary flex-1">Apply</button>
          {filtered && (
            <Link href="/school/attendance/history" className="btn btn-ghost">
              Clear
            </Link>
          )}
        </div>
      </form>

      {error && (
        <p
          className="rounded-lg px-3 py-2 text-sm"
          style={{ background: 'var(--red-soft)', color: 'var(--red-ink)' }}
        >
          {error.message}
        </p>
      )}

      {!rows.length ? (
        <div className="card px-6 py-16 text-center" style={{ borderStyle: 'dashed' }}>
          <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            No records found
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm" style={{ color: 'var(--muted)' }}>
            {filtered
              ? 'Nothing was marked in that window. Try widening the filters.'
              : 'No attendance has been marked yet.'}
          </p>
          <Link href="/school/attendance" className="btn btn-primary mt-4">
            Mark attendance
          </Link>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table min-w-[52rem]">
            <thead>
              <tr>
                <th>Date</th>
                <th>Class</th>
                <th className="text-right">Total</th>
                <th className="text-right">Present</th>
                <th className="text-right">Absent</th>
                <th className="text-right">Late</th>
                <th className="text-right">Leave</th>
                <th>Rate</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.date}-${r.klass}`}>
                  <td className="tabular-nums">{r.date}</td>
                  <td>
                    <span className="pill pill-brand">{r.klass}</span>
                  </td>
                  <td className="text-right tabular-nums">{r.total}</td>
                  <td className="text-right tabular-nums" style={{ color: 'var(--green-ink)' }}>
                    {r.present}
                  </td>
                  <td className="text-right tabular-nums" style={{ color: 'var(--red-ink)' }}>
                    {r.absent}
                  </td>
                  <td className="text-right tabular-nums" style={{ color: 'var(--amber-ink)' }}>
                    {r.late}
                  </td>
                  <td className="text-right tabular-nums" style={{ color: 'var(--blue-ink)' }}>
                    {r.leave}
                  </td>
                  <td>
                    <span className={`pill ${rateBand(r.rate).pill}`}>{r.rate}%</span>
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
