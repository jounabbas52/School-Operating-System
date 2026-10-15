import Link from 'next/link'
import { getSchoolContext } from '@/lib/school-context'
import RefreshButton from '@/components/refresh-button'
import ExportButtons from '@/components/export-buttons'
import { GRADE_SCALE } from '@/lib/exam-options'
import { MONTHS, money } from '@/lib/fee-options'
import { todayKey } from '@/lib/operations-options'

export const metadata = { title: 'Reports' }

const TABS = [
  { id: 'overview', label: 'Overview', icon: '▦' },
  { id: 'students', label: 'Students', icon: '◉' },
  { id: 'attendance', label: 'Attendance', icon: '▤' },
  { id: 'fees', label: 'Fees', icon: '₨' },
  { id: 'exams', label: 'Examinations', icon: '▣' },
]

function Tile({ label, value, sub, tone = 'brand', icon }) {
  const TONES = {
    brand: { fg: 'var(--brand)', bg: 'var(--brand-soft)' },
    blue: { fg: 'var(--blue)', bg: 'var(--blue-soft)' },
    green: { fg: 'var(--green)', bg: 'var(--green-soft)' },
    amber: { fg: 'var(--amber)', bg: 'var(--amber-soft)' },
    red: { fg: 'var(--red)', bg: 'var(--red-soft)' },
  }
  const t = TONES[tone] ?? TONES.brand
  return (
    <div className="card flex items-start justify-between gap-3 p-4">
      <div className="min-w-0">
        <p className="text-xl font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>
          {value}
        </p>
        <p className="mt-0.5 text-xs font-medium" style={{ color: 'var(--muted)' }}>
          {label}
        </p>
        {sub && (
          <p className="text-[0.65rem]" style={{ color: 'var(--muted-2)' }}>
            {sub}
          </p>
        )}
      </div>
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-lg text-sm"
        style={{ background: t.bg, color: t.fg }}
        aria-hidden="true"
      >
        {icon}
      </span>
    </div>
  )
}

function Meter({ label, value, total, colour, display }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span style={{ color: 'var(--ink-2)' }}>{label}</span>
        <span className="font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>
          {display ?? `${value} (${pct}%)`}
        </span>
      </div>
      <div
        className="mt-1 h-1.5 w-full overflow-hidden rounded-full"
        style={{ background: 'var(--border-soft)' }}
      >
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: colour }} />
      </div>
    </div>
  )
}

export default async function ReportsPage({ searchParams }) {
  const params = await searchParams
  const tab = TABS.some((t) => t.id === params?.tab) ? params.tab : 'overview'

  const { schoolId, supabase } = await getSchoolContext()

  const today = todayKey()
  const year = new Date().getFullYear()

  const [
    { count: studentTotal },
    { data: studentClassRows },
    { data: staff },
    { data: classes },
    { data: feeTotalRows },
    { data: feeClassRows },
    { data: feeMonthRows },
    { data: markRows },
    { data: gradeRows },
    { data: attendanceRows },
  ] = await Promise.all([
    // Counted, not fetched. This page only ever showed the number.
    supabase
      .from('students')
      .select('*', { count: 'exact', head: true })
      .eq('school_id', schoolId)
      .eq('is_deleted', false),
    // Per-class totals and the gender split in one grouped query -- see
    // 015_report_functions.sql. `marks` in particular grows as
    // students x subjects x exams, and this page was pulling all of it to
    // compute an average.
    supabase.rpc('student_class_summary', { p_school: schoolId }),
    supabase
      .from('staff')
      .select('id, staff_type, status')
      .eq('school_id', schoolId)
      .eq('is_deleted', false)
      .eq('status', 'active'),
    supabase
      .from('classes')
      .select('id, name, grade_levels(name, ordinal)')
      .eq('school_id', schoolId)
      .eq('is_deleted', false),
    supabase.rpc('fee_totals', { p_school: schoolId }),
    supabase.rpc('fee_class_summary', { p_school: schoolId }),
    supabase.rpc('fee_monthly_collection', { p_school: schoolId, p_year: year }),
    supabase.rpc('exam_mark_summary', { p_school: schoolId, p_pass: 33 }),
    supabase.rpc('exam_grade_distribution', { p_school: schoolId, p_pass: 33 }),
    supabase.rpc('attendance_day_by_class', { p_school: schoolId, p_date: today }),
  ])

  const studentRows = (studentClassRows ?? []).map((r) => ({
    class_id: r.class_id,
    total: Number(r.total) || 0,
    male: Number(r.male) || 0,
    female: Number(r.female) || 0,
  }))

  const activeCount = studentRows.reduce((sum, r) => sum + r.total, 0)
  const male = studentRows.reduce((sum, r) => sum + r.male, 0)
  const female = studentRows.reduce((sum, r) => sum + r.female, 0)

  const teachers = (staff ?? []).filter((s) => s.staff_type === 'teaching').length
  const supportStaff = (staff ?? []).length - teachers

  const classOptions = (classes ?? [])
    .sort((a, b) => (a.grade_levels?.ordinal ?? 999) - (b.grade_levels?.ordinal ?? 999))
    .map((c) => ({ id: c.id, label: c.grade_levels?.name ?? c.name }))
  const classById = new Map(classOptions.map((c) => [c.id, c.label]))

  // ---------------------------------------------------------------- fees
  const feeTotals = feeTotalRows?.[0] ?? {}
  const billed = Number(feeTotals.billed) || 0
  const collected = Number(feeTotals.collected) || 0
  const challanCount = Number(feeTotals.challans) || 0
  const paidCount = Number(feeTotals.paid_count) || 0
  const overdueCount = Number(feeTotals.overdue_count) || 0
  const collectionRate = billed > 0 ? Math.round((collected / billed) * 100) : 0

  // ------------------------------------------------------------- exams
  const markTotals = markRows?.[0] ?? {}
  const marksRecorded = Number(markTotals.recorded) || 0
  const scoredCount = Number(markTotals.scored) || 0
  const avgScore = Number(markTotals.avg_percent) || 0
  const passed = Number(markTotals.pass_count) || 0
  const passRate = scoredCount ? Math.round((passed / scoredCount) * 100) : 0

  // The ladder's order and colours stay here; only the counting moved.
  const gradeByName = new Map((gradeRows ?? []).map((g) => [g.grade, Number(g.count) || 0]))
  const gradeCounts = GRADE_SCALE.map((g) => ({ ...g, count: gradeByName.get(g.grade) ?? 0 }))

  // -------------------------------------------------------- attendance
  const attendanceByClass = new Map(
    (attendanceRows ?? []).map((a) => [
      a.class_id ?? 'none',
      { present: Number(a.present) || 0, absent: Number(a.absent) || 0 },
    ])
  )

  const presentToday = [...attendanceByClass.values()].reduce((sum, v) => sum + v.present, 0)
  const absentToday = [...attendanceByClass.values()].reduce((sum, v) => sum + v.absent, 0)
  const markedToday = presentToday + absentToday
  const attendanceRate = markedToday ? Math.round((presentToday / markedToday) * 100) : 0

  // ---------------------------------------------------- class breakdown
  const classRows = studentRows
    .map((r) => ({
      id: r.class_id ?? 'none',
      label: classById.get(r.class_id) ?? 'Unassigned',
      total: r.total,
      male: r.male,
      female: r.female,
    }))
    .sort((a, b) => b.total - a.total)

  const feeRows = (feeClassRows ?? [])
    .map((r) => {
      const classBilled = Number(r.billed) || 0
      const classCollected = Number(r.collected) || 0
      return {
        id: r.class_id ?? 'none',
        label: classById.get(r.class_id) ?? 'Unassigned',
        billed: classBilled,
        collected: classCollected,
        paid: Number(r.paid_count) || 0,
        unpaid: Number(r.unpaid_count) || 0,
        overdue: Number(r.overdue_count) || 0,
        rate: classBilled > 0 ? Math.round((classCollected / classBilled) * 100) : 0,
      }
    })
    .sort((a, b) => b.billed - a.billed)

  // Monthly fee collection, counted on the date money ARRIVED — the same
  // basis as the Fee Overview chart and the Fee Reports trend, so the three
  // screens cannot disagree about what a month collected.
  const collectedInMonth = new Map(
    (feeMonthRows ?? []).map((r) => [Number(r.month), Number(r.collected) || 0])
  )
  const monthlyFees = MONTHS.map((m) => ({ ...m, collected: collectedInMonth.get(m.id) ?? 0 }))
  const feePeak = Math.max(1, ...monthlyFees.map((m) => m.collected))

  const exportRows =
    tab === 'students'
      ? classRows.map((c, i) => ({
          n: i + 1,
          klass: c.label,
          total: c.total,
          male: c.male,
          female: c.female,
        }))
      : tab === 'fees'
        ? feeRows.map((c, i) => ({
            n: i + 1,
            klass: c.label,
            paid: c.paid,
            unpaid: c.unpaid,
            overdue: c.overdue,
            billed: c.billed,
            collected: c.collected,
            rate: `${c.rate}%`,
          }))
        : []

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>
            Reports &amp; Analytics
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
            Last updated{' '}
            {new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {exportRows.length > 0 && (
            <ExportButtons
              rows={exportRows}
              columns={
                tab === 'students'
                  ? [
                      { key: 'n', label: '#' },
                      { key: 'klass', label: 'Class' },
                      { key: 'total', label: 'Total' },
                      { key: 'male', label: 'Male' },
                      { key: 'female', label: 'Female' },
                    ]
                  : [
                      { key: 'n', label: '#' },
                      { key: 'klass', label: 'Class' },
                      { key: 'paid', label: 'Paid' },
                      { key: 'unpaid', label: 'Unpaid' },
                      { key: 'overdue', label: 'Overdue' },
                      { key: 'billed', label: 'Billed' },
                      { key: 'collected', label: 'Collected' },
                      { key: 'rate', label: 'Collection rate' },
                    ]
              }
              filename={`report-${tab}`}
              title={`Report — ${TABS.find((t) => t.id === tab)?.label}`}
            />
          )}
          <RefreshButton className="btn btn-primary" />
        </div>
      </div>

      {/* ------------------------------------------------------------ tabs */}
      <div className="card flex flex-wrap items-center gap-1 p-2">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={t.id === 'overview' ? '/school/reports' : `/school/reports?tab=${t.id}`}
            className={`tab ${tab === t.id ? 'tab-on' : ''}`}
          >
            <span className="mr-1.5" aria-hidden="true">
              {t.icon}
            </span>
            {t.label}
          </Link>
        ))}
      </div>

      {/* -------------------------------------------------------- overview */}
      {tab === 'overview' && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Tile
              label="Total students"
              value={(studentTotal ?? 0)}
              sub={`${activeCount} active`}
              tone="brand"
              icon="◉"
            />
            <Tile label="Teachers" value={teachers} sub="on staff" tone="blue" icon="▣" />
            <Tile
              label="Staff members"
              value={supportStaff}
              sub="support & admin"
              tone="green"
              icon="▤"
            />
            <Tile
              label="Fee collected"
              value={money(collected)}
              sub={`${collectionRate}% collection rate`}
              tone="amber"
              icon="₨"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Tile
              label="Fee pending"
              value={money(Math.max(0, billed - collected))}
              sub="outstanding"
              tone="amber"
              icon="◷"
            />
            <Tile label="Avg exam score" value={`${avgScore}%`} sub="class average" tone="brand" icon="◎" />
            <Tile
              label="Pass rate"
              value={`${passRate}%`}
              sub="of exam records"
              tone="green"
              icon="✓"
            />
            <Tile
              label="Gender balance"
              value={`${male}M / ${female}F`}
              sub={
                activeCount
                  ? `${Math.round((male / activeCount) * 100)}% male`
                  : '—'
              }
              tone="red"
              icon="◐"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="card p-4">
              <p
                className="mb-3 text-[0.68rem] font-bold uppercase tracking-wider"
                style={{ color: 'var(--muted)' }}
              >
                Student Activity
              </p>
              <div className="flex flex-col gap-3">
                <Meter
                  label="Active Students"
                  value={activeCount}
                  total={(studentTotal ?? 0) || 1}
                  colour="var(--green)"
                />
                <Meter
                  label="Male Students"
                  value={male}
                  total={activeCount || 1}
                  colour="var(--blue)"
                />
                <Meter
                  label="Female Students"
                  value={female}
                  total={activeCount || 1}
                  colour="var(--brand)"
                />
              </div>
            </div>

            <div className="card p-4">
              <p
                className="mb-3 text-[0.68rem] font-bold uppercase tracking-wider"
                style={{ color: 'var(--muted)' }}
              >
                Fee Summary
              </p>
              <div className="flex flex-col gap-3">
                <Meter
                  label="Collection Rate"
                  value={collected}
                  total={billed || 1}
                  colour="var(--green)"
                  display={`${collectionRate}%`}
                />
                <Meter
                  label="Pending Amount"
                  value={Math.max(0, billed - collected)}
                  total={billed || 1}
                  colour="var(--amber)"
                  display={money(Math.max(0, billed - collected))}
                />
                <Meter
                  label="Total Fee Amount"
                  value={billed}
                  total={billed || 1}
                  colour="var(--brand)"
                  display={money(billed)}
                />
              </div>
            </div>

            <div className="card p-4">
              <p
                className="mb-3 text-[0.68rem] font-bold uppercase tracking-wider"
                style={{ color: 'var(--muted)' }}
              >
                Exam Performance
              </p>
              <div className="flex flex-col gap-3">
                <Meter
                  label="Pass Rate"
                  value={passed}
                  total={scoredCount || 1}
                  colour="var(--green)"
                  display={`${passRate}%`}
                />
                <Meter
                  label="Avg Score"
                  value={avgScore}
                  total={100}
                  colour="var(--blue)"
                  display={`${avgScore}%`}
                />
                <Meter
                  label="Fail Rate"
                  value={scoredCount - passed}
                  total={scoredCount || 1}
                  colour="var(--red)"
                  display={`${100 - passRate}%`}
                />
              </div>
            </div>
          </div>
        </>
      )}

      {/* -------------------------------------------------------- students */}
      {tab === 'students' && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Tile label="Total classes" value={classOptions.length} tone="brand" icon="▦" />
            <Tile label="Total students" value={activeCount} tone="blue" icon="◉" />
            <Tile
              label="Avg per class"
              value={
                classOptions.length ? Math.round(activeCount / classOptions.length) : 0
              }
              tone="green"
              icon="◎"
            />
          </div>

          <div className="card overflow-hidden">
            <div
              className="flex items-center justify-between border-b px-4 py-3"
              style={{ borderColor: 'var(--border)', background: 'var(--card-alt)' }}
            >
              <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                Class-wise Student Summary
              </p>
              <span className="text-xs" style={{ color: 'var(--muted)' }}>
                {classRows.length} class{classRows.length === 1 ? '' : 'es'}
              </span>
            </div>

            {!classRows.length ? (
              <p className="px-6 py-14 text-center text-sm" style={{ color: 'var(--muted)' }}>
                No students enrolled yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="table min-w-[48rem]">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Class</th>
                      <th className="text-right">Total</th>
                      <th className="text-right">Male</th>
                      <th className="text-right">Female</th>
                      <th>Distribution</th>
                      <th className="text-right">Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {classRows.map((c, i) => {
                      const share = activeCount
                        ? Math.round((c.total / activeCount) * 100)
                        : 0
                      return (
                        <tr key={c.id}>
                          <td className="tabular-nums" style={{ color: 'var(--muted)' }}>
                            {i + 1}
                          </td>
                          <td>
                            <span className="font-medium" style={{ color: 'var(--ink)' }}>
                              {c.label}
                            </span>
                          </td>
                          <td className="text-right tabular-nums" style={{ color: 'var(--brand)' }}>
                            {c.total}
                          </td>
                          <td className="text-right tabular-nums" style={{ color: 'var(--blue)' }}>
                            {c.male}
                          </td>
                          <td className="text-right tabular-nums" style={{ color: 'var(--red)' }}>
                            {c.female}
                          </td>
                          <td>
                            <div
                              className="h-1.5 w-28 overflow-hidden rounded-full"
                              style={{ background: 'var(--border-soft)' }}
                            >
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${share}%`, background: 'var(--brand)' }}
                              />
                            </div>
                          </td>
                          <td className="text-right">
                            <span className="pill pill-amber">{share}%</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ------------------------------------------------------ attendance */}
      {tab === 'attendance' && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Tile label="Total records" value={markedToday} sub="today" tone="brand" icon="▤" />
            <Tile label="Present today" value={presentToday} tone="green" icon="✓" />
            <Tile label="Absent today" value={absentToday} tone="red" icon="✕" />
            <Tile label="Overall rate" value={`${attendanceRate}%`} tone="blue" icon="◎" />
          </div>

          <div className="card overflow-hidden">
            <div
              className="flex items-center justify-between border-b px-4 py-3"
              style={{ borderColor: 'var(--border)', background: 'var(--card-alt)' }}
            >
              <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                Today&rsquo;s Attendance
              </p>
              <span className="text-xs" style={{ color: 'var(--muted)' }}>
                {new Date().toLocaleDateString('en-GB', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </span>
            </div>

            {!attendanceByClass.size ? (
              <div className="px-6 py-14 text-center">
                <p className="text-sm" style={{ color: 'var(--muted)' }}>
                  No attendance data for today
                </p>
                <Link
                  href="/school/attendance"
                  className="mt-2 inline-block text-sm"
                  style={{ color: 'var(--brand-ink)' }}
                >
                  Take attendance →
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="table min-w-[44rem]">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Class</th>
                      <th className="text-right">Present</th>
                      <th className="text-right">Absent</th>
                      <th className="text-right">Attendance Rate</th>
                      <th>Visual</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...attendanceByClass.entries()].map(([id, v], i) => {
                      const total = v.present + v.absent
                      const rate = total ? Math.round((v.present / total) * 100) : 0
                      return (
                        <tr key={id}>
                          <td className="tabular-nums" style={{ color: 'var(--muted)' }}>
                            {i + 1}
                          </td>
                          <td>
                            <span className="font-medium" style={{ color: 'var(--ink)' }}>
                              {classById.get(id) ?? 'Unassigned'}
                            </span>
                          </td>
                          <td className="text-right tabular-nums" style={{ color: 'var(--green)' }}>
                            {v.present}
                          </td>
                          <td className="text-right tabular-nums" style={{ color: 'var(--red)' }}>
                            {v.absent}
                          </td>
                          <td className="text-right tabular-nums">{rate}%</td>
                          <td>
                            <div
                              className="h-1.5 w-28 overflow-hidden rounded-full"
                              style={{ background: 'var(--border-soft)' }}
                            >
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${rate}%`,
                                  background:
                                    rate >= 90
                                      ? 'var(--green)'
                                      : rate >= 75
                                        ? 'var(--amber)'
                                        : 'var(--red)',
                                }}
                              />
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ------------------------------------------------------------ fees */}
      {tab === 'fees' && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Tile
              label="Paid challans"
              value={paidCount}
              sub={`${collectionRate}% rate`}
              tone="green"
              icon="✓"
            />
            <Tile
              label="Unpaid challans"
              value={challanCount - paidCount}
              tone="amber"
              icon="◷"
            />
            <Tile label="Overdue challans" value={overdueCount} tone="red" icon="!" />
            <Tile label="Total collected" value={money(collected)} tone="brand" icon="₨" />
          </div>

          <div className="card p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                Monthly Fee Collection
              </p>
              <span className="text-xs" style={{ color: 'var(--muted)' }}>
                {year}
              </span>
            </div>

            <div className="mt-5 flex h-40 items-end gap-1.5">
              {monthlyFees.map((m) => (
                <div key={m.id} className="flex flex-1 flex-col items-center gap-1.5">
                  <span className="text-[0.6rem]" style={{ color: 'var(--muted)' }}>
                    {m.collected > 0 ? money(m.collected).replace('Rs ', '') : '—'}
                  </span>
                  <div className="flex w-full flex-1 items-end">
                    <div
                      className="w-full rounded-t"
                      style={{
                        height: `${Math.max(2, (m.collected / feePeak) * 100)}%`,
                        background: m.collected > 0 ? 'var(--brand)' : 'var(--border-soft)',
                      }}
                      title={`${m.label}: ${money(m.collected)}`}
                    />
                  </div>
                  <span className="text-[0.62rem]" style={{ color: 'var(--muted)' }}>
                    {m.short}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="card overflow-hidden">
            <div
              className="flex items-center justify-between border-b px-4 py-3"
              style={{ borderColor: 'var(--border)', background: 'var(--card-alt)' }}
            >
              <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                Class-wise Fee Status
              </p>
              <span className="text-xs" style={{ color: 'var(--muted)' }}>
                {feeRows.length} class{feeRows.length === 1 ? '' : 'es'}
              </span>
            </div>

            {!feeRows.length ? (
              <p className="px-6 py-14 text-center text-sm" style={{ color: 'var(--muted)' }}>
                No fee data found.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="table min-w-[48rem]">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Class</th>
                      <th className="text-right">Paid</th>
                      <th className="text-right">Unpaid</th>
                      <th className="text-right">Overdue</th>
                      <th className="text-right">Collection Rate</th>
                      <th>Progress</th>
                    </tr>
                  </thead>
                  <tbody>
                    {feeRows.map((c, i) => (
                      <tr key={c.id}>
                        <td className="tabular-nums" style={{ color: 'var(--muted)' }}>
                          {i + 1}
                        </td>
                        <td>
                          <span className="font-medium" style={{ color: 'var(--ink)' }}>
                            {c.label}
                          </span>
                        </td>
                        <td className="text-right tabular-nums" style={{ color: 'var(--green)' }}>
                          {c.paid}
                        </td>
                        <td className="text-right tabular-nums">{c.unpaid}</td>
                        <td className="text-right tabular-nums" style={{ color: 'var(--red)' }}>
                          {c.overdue}
                        </td>
                        <td className="text-right tabular-nums">{c.rate}%</td>
                        <td>
                          <div
                            className="h-1.5 w-28 overflow-hidden rounded-full"
                            style={{ background: 'var(--border-soft)' }}
                          >
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${c.rate}%`,
                                background:
                                  c.rate >= 90
                                    ? 'var(--green)'
                                    : c.rate >= 50
                                      ? 'var(--amber)'
                                      : 'var(--red)',
                              }}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ----------------------------------------------------- examinations */}
      {tab === 'exams' && (
        <>
          <p
            className="text-[0.68rem] font-bold uppercase tracking-wider"
            style={{ color: 'var(--muted)' }}
          >
            Grade Distribution
          </p>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {gradeCounts.map((g) => (
              <div
                key={g.grade}
                className="card p-4 text-center"
                style={{ borderBottom: `2px solid ${g.colour}` }}
              >
                <p className="text-xl font-semibold" style={{ color: g.colour }}>
                  {g.grade}
                </p>
                <p className="mt-1 text-lg font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>
                  {g.count}
                </p>
                <p className="text-[0.65rem]" style={{ color: 'var(--muted)' }}>
                  {scoredCount ? Math.round((g.count / scoredCount) * 100) : 0}% of total
                </p>
              </div>
            ))}
          </div>

          {!scoredCount && (
            <p className="text-center text-sm" style={{ color: 'var(--muted)' }}>
              No examination data available.
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <Tile label="Marks recorded" value={marksRecorded} tone="brand" icon="▤" />
            <Tile label="Average score" value={`${avgScore}%`} tone="blue" icon="◎" />
            <Tile label="Pass rate" value={`${passRate}%`} tone="green" icon="✓" />
          </div>

          {!marksRecorded && (
            <div className="card px-6 py-14 text-center" style={{ borderStyle: 'dashed' }}>
              <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                No examination records found
              </p>
              <Link href="/school/exams/results" className="btn btn-primary mt-4">
                Enter exam marks
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  )
}
