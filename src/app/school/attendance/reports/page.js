import Link from 'next/link'
import { getSchoolContext } from '@/lib/school-context'
import { StatCard, StatRow } from '@/components/stats'
import ExportButtons from '@/components/export-buttons'
import {
  MARK_LABEL,
  attendanceRate,
  monthRange,
  rateBand,
  safeDate,
  today,
} from '@/lib/attendance-options'

export const metadata = { title: 'Attendance Reports' }

const fullName = (s) => [s.first_name, s.last_name].filter(Boolean).join(' ')

const TABS = [
  { id: 'summary', label: 'Class Summary' },
  { id: 'student', label: 'Student Report' },
  { id: 'daily', label: 'Daily Log' },
]

export default async function AttendanceReportsPage({ searchParams }) {
  const params = await searchParams
  const tab = TABS.some((t) => t.id === params?.tab) ? params.tab : 'summary'
  const classFilter = params?.class ?? ''
  const sectionFilter = params?.section ?? ''
  const q = (params?.q ?? '').trim()

  // Default window is the current month, which is what a school asks for
  // unless it says otherwise.
  const month = /^\d{4}-\d{2}$/.test(params?.month ?? '') ? params.month : today().slice(0, 7)
  const range = monthRange(month) ?? { from: `${month}-01`, to: `${month}-31` }
  const from = safeDate(params?.from ?? range.from)
  const to = safeDate(params?.to ?? range.to)

  const { schoolId, supabase } = await getSchoolContext()

  const { data: active } = await supabase
    .from('sessions')
    .select('id, name')
    .eq('school_id', schoolId)
    .eq('is_current', true)
    .maybeSingle()

  const [{ data: classes }, { data: sections }, { count: totalStudents }, { count: totalStaff }] =
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
        .from('students')
        .select('id', { count: 'exact', head: true })
        .eq('school_id', schoolId)
        .eq('is_deleted', false)
        .eq('status', 'active'),
      supabase
        .from('staff')
        .select('id', { count: 'exact', head: true })
        .eq('school_id', schoolId)
        .eq('is_deleted', false)
        .eq('status', 'active'),
    ])

  const thisSession = (classes ?? [])
    .filter((c) => !active || c.session_id === active.id)
    .sort((a, b) => (a.grade_levels?.ordinal ?? 999) - (b.grade_levels?.ordinal ?? 999))

  const classOptions = thisSession.map((c) => ({ id: c.id, label: c.grade_levels?.name ?? c.name }))
  const sectionOptions = (sections ?? []).filter((s) => s.class_id === classFilter)
  const classById = new Map(classOptions.map((c) => [c.id, c.label]))
  const sectionById = new Map((sections ?? []).map((s) => [s.id, s.name]))

  const className = classById.get(classFilter) ?? null
  const sectionName = sectionById.get(sectionFilter) ?? null

  // Counting happens in Postgres. Pulling a term of marks into the browser to
  // tally them there falls over on a year of data for a full school.
  const [{ data: perStudent }, { data: perDay }, { data: todayMarks }] = await Promise.all([
    supabase.rpc('attendance_student_summary', {
      p_from: from,
      p_to: to,
      p_class: classFilter || null,
      p_section: sectionFilter || null,
    }),
    supabase.rpc('attendance_daily_summary', {
      p_from: from,
      p_to: to,
      p_class: classFilter || null,
      p_section: sectionFilter || null,
    }),
    supabase
      .from('attendance')
      .select('status')
      .eq('school_id', schoolId)
      .eq('is_deleted', false)
      .eq('date', today()),
  ])

  const summaryById = new Map((perStudent ?? []).map((r) => [r.student_id, r]))

  // The roster the report is written against: who is enrolled now, whether or
  // not they have a single mark in the window.
  let rosterQuery = supabase
    .from('students')
    .select('id, first_name, last_name, admission_number, current_class_id, current_section_id')
    .eq('school_id', schoolId)
    .eq('is_deleted', false)
    .eq('status', 'active')

  if (classFilter) rosterQuery = rosterQuery.eq('current_class_id', classFilter)
  if (sectionFilter) rosterQuery = rosterQuery.eq('current_section_id', sectionFilter)
  if (q) {
    rosterQuery = rosterQuery.or(
      `first_name.ilike.%${q}%,last_name.ilike.%${q}%,admission_number.ilike.%${q}%`
    )
  }

  const { data: roster, error } = await rosterQuery.order('first_name')

  const students = (roster ?? []).map((s) => {
    const row = summaryById.get(s.id) ?? {}
    const present = Number(row.present ?? 0)
    const absent = Number(row.absent ?? 0)
    const late = Number(row.late ?? 0)
    const leave = Number(row.leave_count ?? 0)
    const marked = Number(row.marked ?? 0)
    return {
      id: s.id,
      name: fullName(s),
      admission_number: s.admission_number,
      klass:
        [classById.get(s.current_class_id), sectionById.get(s.current_section_id)]
          .filter(Boolean)
          .join(' · ') || '—',
      present,
      absent,
      late,
      leave,
      marked,
      rate: attendanceRate({ present, late, marked }),
    }
  })

  // Whole-window average, weighted by marks rather than by student -- a child
  // who joined in week three should not swing the school's figure.
  const totalMarked = students.reduce((sum, s) => sum + s.marked, 0)
  const totalTurnedUp = students.reduce((sum, s) => sum + s.present + s.late, 0)
  const avgRate = totalMarked ? Math.round((totalTurnedUp / totalMarked) * 100) : 0

  const presentToday = (todayMarks ?? []).filter((m) => ['present', 'late'].includes(m.status)).length
  const absentToday = (todayMarks ?? []).filter((m) => m.status === 'absent').length

  // Class Summary rolls the daily rows up per class + section.
  const summaryRows = []
  const byClass = new Map()
  for (const day of perDay ?? []) {
    const key = `${day.class_id}|${day.section_id}`
    const entry = byClass.get(key) ?? {
      class_id: day.class_id,
      section_id: day.section_id,
      days: 0,
      total: 0,
      present: 0,
      absent: 0,
      late: 0,
      leave: 0,
    }
    entry.days += 1
    entry.total += Number(day.total)
    entry.present += Number(day.present)
    entry.absent += Number(day.absent)
    entry.late += Number(day.late)
    entry.leave += Number(day.leave_count)
    byClass.set(key, entry)
  }
  for (const entry of byClass.values()) {
    summaryRows.push({
      klass:
        [classById.get(entry.class_id), sectionById.get(entry.section_id)]
          .filter(Boolean)
          .join(' · ') || '—',
      days: entry.days,
      total: entry.total,
      present: entry.present,
      absent: entry.absent,
      late: entry.late,
      leave: entry.leave,
      rate: entry.total ? Math.round(((entry.present + entry.late) / entry.total) * 100) : 0,
    })
  }
  summaryRows.sort((a, b) => a.klass.localeCompare(b.klass))

  const dailyRows = (perDay ?? []).map((day) => ({
    date: day.date,
    klass:
      [classById.get(day.class_id), sectionById.get(day.section_id)].filter(Boolean).join(' · ') ||
      '—',
    total: Number(day.total),
    present: Number(day.present),
    absent: Number(day.absent),
    late: Number(day.late),
    leave: Number(day.leave_count),
    rate: day.total
      ? Math.round(((Number(day.present) + Number(day.late)) / Number(day.total)) * 100)
      : 0,
  }))

  const exports = {
    summary: {
      rows: summaryRows,
      columns: [
        { key: 'klass', label: 'Class' },
        { key: 'days', label: 'Days marked' },
        { key: 'total', label: 'Marks' },
        { key: 'present', label: 'Present' },
        { key: 'absent', label: 'Absent' },
        { key: 'late', label: 'Late' },
        { key: 'leave', label: 'Leave' },
        { key: 'rate', label: 'Rate %' },
      ],
      filename: 'attendance-class-summary',
    },
    student: {
      rows: students.map((s, i) => ({ ...s, n: i + 1 })),
      columns: [
        { key: 'n', label: '#' },
        { key: 'name', label: 'Student' },
        { key: 'admission_number', label: 'Adm. no' },
        { key: 'klass', label: 'Class' },
        { key: 'present', label: 'Present' },
        { key: 'absent', label: 'Absent' },
        { key: 'late', label: 'Late' },
        { key: 'leave', label: 'Leave' },
        { key: 'marked', label: 'Days marked' },
        { key: 'rate', label: 'Rate %' },
      ],
      filename: 'attendance-student-report',
    },
    daily: {
      rows: dailyRows,
      columns: [
        { key: 'date', label: 'Date' },
        { key: 'klass', label: 'Class' },
        { key: 'total', label: 'Total' },
        { key: 'present', label: 'Present' },
        { key: 'absent', label: 'Absent' },
        { key: 'late', label: 'Late' },
        { key: 'leave', label: 'Leave' },
        { key: 'rate', label: 'Rate %' },
      ],
      filename: 'attendance-daily-log',
    },
  }[tab]

  const link = (patch) => {
    const search = new URLSearchParams()
    const next = { tab, class: classFilter, section: sectionFilter, q, month, ...patch }
    for (const [key, value] of Object.entries(next)) {
      if (value) search.set(key, value)
    }
    return `/school/attendance/reports?${search.toString()}`
  }

  const windowLabel = `${from} → ${to}`

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>
            Attendance Reports
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
            {windowLabel}
            {className ? ` · ${className}` : ''}
            {sectionName ? ` · Section ${sectionName}` : ''}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link href="/school/attendance/history" className="btn btn-ghost">
            Full history view
          </Link>
          <ExportButtons
            rows={exports.rows}
            columns={exports.columns}
            filename={exports.filename}
            title={`Attendance — ${TABS.find((t) => t.id === tab).label}`}
            subtitle={windowLabel}
          />
        </div>
      </div>

      <StatRow>
        <StatCard label="Total students" value={totalStudents ?? 0} tone="brand" />
        <StatCard label="Total staff" value={totalStaff ?? 0} tone="blue" />
        <StatCard
          label="Avg attendance"
          value={`${avgRate}%`}
          sub={totalMarked ? `${totalMarked} marks in window` : 'nothing marked yet'}
          tone="green"
        />
        <StatCard label="Present today" value={presentToday} tone="green" />
        <StatCard label="Absent today" value={absentToday} tone="red" />
      </StatRow>

      {/* --------------------------------------------------------- filters */}
      <form className="card grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-5">
        <input type="hidden" name="tab" value={tab} />

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
          <span className="label">From</span>
          <input name="from" type="date" defaultValue={from} className="field" />
        </div>

        <div>
          <span className="label">To</span>
          <input name="to" type="date" defaultValue={to} className="field" />
        </div>

        <div>
          <span className="label">Search student</span>
          <div className="flex gap-2">
            <input
              name="q"
              defaultValue={q}
              placeholder="Name or admission no…"
              className="field flex-1"
            />
            <button className="btn btn-primary">Go</button>
          </div>
        </div>
      </form>

      {(q || classFilter || sectionFilter) && (
        <div>
          <Link href="/school/attendance/reports" className="btn btn-ghost">
            Clear filters
          </Link>
        </div>
      )}

      {/* ------------------------------------------------------------- tabs */}
      <div className="flex flex-wrap items-center gap-1 border-b" style={{ borderColor: 'var(--border)' }}>
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={link({ tab: t.id })}
            className={`tab-underline ${tab === t.id ? 'tab-underline-on' : ''}`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {error && (
        <p
          className="rounded-lg px-3 py-2 text-sm"
          style={{ background: 'var(--red-soft)', color: 'var(--red-ink)' }}
        >
          {error.message}
        </p>
      )}

      {/* -------------------------------------------------- class summary */}
      {tab === 'summary' &&
        (!summaryRows.length ? (
          <Empty window={windowLabel} />
        ) : (
          <div className="card overflow-x-auto">
            <table className="table min-w-[52rem]">
              <thead>
                <tr>
                  <th>Class</th>
                  <th className="text-right">Days marked</th>
                  <th className="text-right">Present</th>
                  <th className="text-right">Absent</th>
                  <th className="text-right">Late</th>
                  <th className="text-right">Leave</th>
                  <th>Attendance %</th>
                </tr>
              </thead>
              <tbody>
                {summaryRows.map((r) => (
                  <tr key={r.klass}>
                    <td>
                      <span className="pill pill-brand">{r.klass}</span>
                    </td>
                    <td className="text-right tabular-nums">{r.days}</td>
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
                      <RateBar percent={r.rate} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

      {/* -------------------------------------------------- student report */}
      {tab === 'student' &&
        (!students.length ? (
          <Empty window={windowLabel} />
        ) : (
          <div className="card overflow-x-auto">
            <p className="px-4 pt-3 text-xs" style={{ color: 'var(--muted)' }}>
              {students.length} student{students.length === 1 ? '' : 's'}
              {className ? ` in ${className}` : ''}
              {sectionName ? ` · Section ${sectionName}` : ''} — based on marks between {from} and{' '}
              {to}.
            </p>
            <table className="table mt-2 min-w-[56rem]">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Student</th>
                  <th>Class</th>
                  <th className="text-right">Present</th>
                  <th className="text-right">Absent</th>
                  <th className="text-right">Late</th>
                  <th className="text-right">Leave</th>
                  <th>Attendance %</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s, i) => (
                  <tr key={s.id}>
                    <td className="tabular-nums" style={{ color: 'var(--muted)' }}>
                      {i + 1}
                    </td>
                    <td>
                      <span className="font-medium" style={{ color: 'var(--ink)' }}>
                        {s.name}
                      </span>
                      <span className="block font-mono text-xs" style={{ color: 'var(--muted)' }}>
                        {s.admission_number ?? '—'}
                      </span>
                    </td>
                    <td>{s.klass}</td>
                    <td className="text-right tabular-nums" style={{ color: 'var(--green-ink)' }}>
                      {s.present}
                    </td>
                    <td className="text-right tabular-nums" style={{ color: 'var(--red-ink)' }}>
                      {s.absent}
                    </td>
                    <td className="text-right tabular-nums" style={{ color: 'var(--amber-ink)' }}>
                      {s.late}
                    </td>
                    <td className="text-right tabular-nums" style={{ color: 'var(--blue-ink)' }}>
                      {s.leave}
                    </td>
                    <td>
                      {s.marked ? (
                        <RateBar percent={s.rate} />
                      ) : (
                        <span className="text-xs" style={{ color: 'var(--muted-2)' }}>
                          no marks yet
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

      {/* ------------------------------------------------------- daily log */}
      {tab === 'daily' &&
        (!dailyRows.length ? (
          <Empty window={windowLabel} />
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
                {dailyRows.map((d) => (
                  <tr key={`${d.date}-${d.klass}`}>
                    <td className="tabular-nums">{d.date}</td>
                    <td>
                      <span className="pill pill-brand">{d.klass}</span>
                    </td>
                    <td className="text-right tabular-nums">{d.total}</td>
                    <td className="text-right tabular-nums" style={{ color: 'var(--green-ink)' }}>
                      {d.present}
                    </td>
                    <td className="text-right tabular-nums" style={{ color: 'var(--red-ink)' }}>
                      {d.absent}
                    </td>
                    <td className="text-right tabular-nums" style={{ color: 'var(--amber-ink)' }}>
                      {d.late}
                    </td>
                    <td className="text-right tabular-nums" style={{ color: 'var(--blue-ink)' }}>
                      {d.leave}
                    </td>
                    <td>
                      <span className={`pill ${rateBand(d.rate).pill}`}>{d.rate}%</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

      {/* A legend, because the register's five marks collapse into four
          columns here and "Leave" quietly absorbs short leave. */}
      <p className="text-xs" style={{ color: 'var(--muted-2)' }}>
        Leave counts {MARK_LABEL.leave.toLowerCase()}, {MARK_LABEL.short_leave.toLowerCase()} and{' '}
        {MARK_LABEL.excused.toLowerCase()} marks together. Attendance % counts present and late as
        turned up.
      </p>
    </div>
  )
}

function Empty({ window: label }) {
  return (
    <div className="card px-6 py-16 text-center" style={{ borderStyle: 'dashed' }}>
      <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
        No attendance records found
      </p>
      <p className="mx-auto mt-1 max-w-sm text-sm" style={{ color: 'var(--muted)' }}>
        Nothing was marked between {label}. Mark a register, or widen the date range.
      </p>
      <Link href="/school/attendance" className="btn btn-primary mt-4">
        Mark attendance
      </Link>
    </div>
  )
}

function RateBar({ percent }) {
  const band = rateBand(percent)
  return (
    <div className="flex min-w-[8rem] items-center gap-2">
      <div
        className="h-1.5 w-16 overflow-hidden rounded-full"
        style={{ background: 'var(--border-soft)' }}
      >
        <div className="h-full rounded-full" style={{ width: `${percent}%`, background: band.colour }} />
      </div>
      <span className="text-xs font-medium tabular-nums" style={{ color: 'var(--ink-2)' }}>
        {percent}%
      </span>
      <span className={`pill ${band.pill}`}>{band.label}</span>
    </div>
  )
}
