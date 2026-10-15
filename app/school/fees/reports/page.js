import Link from 'next/link'
import { getSchoolContext } from '@/lib/school-context'
import ExportButtons from '@/components/export-buttons'
import RefreshButton from '@/components/refresh-button'
import {
  CHALLAN_STATUS_LABEL,
  CHALLAN_STATUS_TONE,
  FEE_TYPE_LABEL,
  MONTHS,
  dateLabel,
  effectiveStatus,
  money,
  remaining,
  studentName,
} from '@/lib/fee-options'
import { todayKey } from '@/lib/operations-options'

export const metadata = { title: 'Fee Reports' }

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'paid', label: 'Paid' },
  { id: 'unpaid', label: 'Unpaid / Partial' },
  { id: 'overdue', label: 'Overdue' },
]

export default async function FeeReportsPage({ searchParams }) {
  const params = await searchParams
  const now = new Date()
  const year = Number(params?.year) || now.getFullYear()
  const tab = TABS.some((t) => t.id === params?.tab) ? params.tab : 'overview'
  const sessionFilter = params?.session ?? ''

  const { schoolId, supabase } = await getSchoolContext()

  // The headline figures and both charts are AGGREGATES, counted in the
  // database -- see 015_report_functions.sql. This page used to select every
  // challan and every payment the school had ever recorded and add them up in
  // a loop, which is a six-figure transfer by year three.
  //
  // The drill-down tabs still read rows, because they show rows -- but only
  // the tab being viewed, and capped.
  const [
    { data: totalsRows },
    { data: monthRows },
    { data: typeCollectionRows },
    { data: classSummaryRows },
    { data: classes },
    { data: sessions },
  ] = await Promise.all([
    supabase.rpc('fee_totals', { p_school: schoolId }),
    supabase.rpc('fee_monthly_collection', { p_school: schoolId, p_year: year }),
    supabase.rpc('fee_type_collection', { p_school: schoolId }),
    supabase.rpc('fee_class_summary', { p_school: schoolId }),
    supabase
      .from('classes')
      .select('id, name, grade_levels(name, ordinal)')
      .eq('school_id', schoolId)
      .eq('is_deleted', false),
    supabase
      .from('sessions')
      .select('id, name')
      .eq('school_id', schoolId)
      .eq('is_deleted', false)
      .order('start_date', { ascending: false }),
  ])

  const classOptions = (classes ?? [])
    .sort((a, b) => (a.grade_levels?.ordinal ?? 999) - (b.grade_levels?.ordinal ?? 999))
    .map((c) => ({ id: c.id, label: c.grade_levels?.name ?? c.name }))
  const classById = new Map(classOptions.map((c) => [c.id, c.label]))

  const totals = totalsRows?.[0] ?? {}
  const billed = Number(totals.billed) || 0
  const collected = Number(totals.collected) || 0
  const overdueCount = Number(totals.overdue_count) || 0

  // Revenue is counted on the date money arrived, not the month it was billed
  // for -- that is what "revenue this month" means to an accountant.
  const collectedInMonth = new Map(
    (monthRows ?? []).map((r) => [Number(r.month), Number(r.collected) || 0])
  )
  const monthly = MONTHS.map((m) => ({ ...m, total: collectedInMonth.get(m.id) ?? 0 }))

  const ytd = monthly.reduce((sum, m) => sum + m.total, 0)
  const peakMonth = monthly.reduce((best, m) => (m.total > best.total ? m : best), monthly[0])
  const thisMonth = monthly[now.getMonth()]?.total ?? 0
  const peakValue = Math.max(1, ...monthly.map((m) => m.total))

  // Collection split by what the money was for. Payments do not carry a fee
  // type, so the function attributes each to the type of the challan it paid.
  const typeRows = (typeCollectionRows ?? [])
    .map((r) => ({ type: r.fee_type, total: Number(r.collected) || 0 }))
    .sort((a, b) => b.total - a.total)
  const typeTotal = typeRows.reduce((sum, t) => sum + t.total, 0)

  const classRows = (classSummaryRows ?? [])
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

  const challanCount = Number(totals.challans) || 0
  const paidCount = Number(totals.paid_count) || 0
  const partialCount = Number(totals.partial_count) || 0
  const unpaidCount = Number(totals.unpaid_count) || 0

  // Outstanding on everything overdue. Derived from the totals rather than
  // summed per row, so it does not need the rows.
  const overdueAmount = Math.max(0, billed - collected)

  // The drill-down. Only the tab being viewed is fetched, and only the newest
  // 200 -- a year of unpaid challans is a list nobody scrolls, and the CSV
  // export beside it is the right tool for the whole set.
  const LIST_CAP = 200
  let listed = []
  let listedTotal = 0

  if (tab !== 'overview') {
    let listQuery = supabase
      .from('fee_challans')
      .select(
        'id, challan_number, student_id, class_id, fee_type, amount, late_fee, net_amount, total_amount, paid_amount, due_date, period_month, status, students(first_name, last_name, admission_number)',
        { count: 'exact' }
      )
      .eq('school_id', schoolId)
      .eq('is_deleted', false)
      .neq('status', 'cancelled')

    // The stored status is written by a trigger on payment, so 'overdue' is
    // asked for by date rather than by status -- a challan that lapsed
    // overnight has not been rewritten yet.
    if (tab === 'paid') listQuery = listQuery.eq('status', 'paid')
    else if (tab === 'unpaid') listQuery = listQuery.in('status', ['open', 'partial', 'overdue'])
    else if (tab === 'overdue') {
      listQuery = listQuery
        .in('status', ['open', 'partial', 'overdue'])
        .lt('due_date', todayKey())
    }

    const { data: listRows, count } = await listQuery
      .order('due_date', { ascending: false, nullsFirst: false })
      .limit(LIST_CAP)

    listed = (listRows ?? []).map((c) => ({ ...c, state: effectiveStatus(c, now) }))
    listedTotal = count ?? listed.length
  }

  const countOf = (state) =>
    state === 'paid'
      ? paidCount
      : state === 'partial'
        ? partialCount
        : state === 'open'
          ? unpaidCount
          : state === 'overdue'
            ? overdueCount
            : 0

  const exportRows = (tab === 'overview' ? classRows : listed).map((r, i) =>
    tab === 'overview'
      ? {
          n: i + 1,
          klass: r.label,
          paid: r.paid,
          unpaid: r.unpaid,
          overdue: r.overdue,
          billed: r.billed,
          collected: r.collected,
          rate: `${r.rate}%`,
        }
      : {
          n: i + 1,
          challan: r.challan_number ?? '',
          student: studentName(r.students),
          klass: classById.get(r.class_id) ?? '',
          type: FEE_TYPE_LABEL[r.fee_type] ?? r.fee_type,
          net: Number(r.net_amount ?? r.total_amount ?? r.amount) || 0,
          paid: Number(r.paid_amount) || 0,
          due: remaining(r),
          due_date: r.due_date ?? '',
          status: CHALLAN_STATUS_LABEL[r.state] ?? r.state,
        }
  )

  const keep = (next) => {
    const sp = new URLSearchParams()
    sp.set('year', String(next.year ?? year))
    sp.set('tab', next.tab ?? tab)
    if (sessionFilter) sp.set('session', sessionFilter)
    return `/school/fees/reports?${sp.toString()}`
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>
            Reports &amp; Analytics
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
            Financial overview · {year}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <RefreshButton />
          <form className="flex items-center gap-2">
            <input type="hidden" name="tab" value={tab} />
            <select
              name="session"
              defaultValue={sessionFilter}
              className="field w-auto min-w-36"
              aria-label="Filter by session"
            >
              <option value="">All Sessions</option>
              {(sessions ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <select name="year" defaultValue={year} className="field w-auto" aria-label="Year">
              {[year - 1, year, year + 1].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <button className="btn btn-ghost">Apply</button>
          </form>
          <ExportButtons
            rows={exportRows}
            columns={
              tab === 'overview'
                ? [
                    { key: 'n', label: '#' },
                    { key: 'klass', label: 'Class' },
                    { key: 'paid', label: 'Paid' },
                    { key: 'unpaid', label: 'Unpaid' },
                    { key: 'overdue', label: 'Overdue' },
                    { key: 'billed', label: 'Billed' },
                    { key: 'collected', label: 'Collected' },
                    { key: 'rate', label: 'Collection rate' },
                  ]
                : [
                    { key: 'n', label: '#' },
                    { key: 'challan', label: 'Challan no.' },
                    { key: 'student', label: 'Student' },
                    { key: 'klass', label: 'Class' },
                    { key: 'type', label: 'Fee type' },
                    { key: 'net', label: 'Net' },
                    { key: 'paid', label: 'Paid' },
                    { key: 'due', label: 'Remaining' },
                    { key: 'due_date', label: 'Due date' },
                    { key: 'status', label: 'Status' },
                  ]
            }
            filename={`fee-report-${tab}-${year}`}
            title={`Fee Report — ${TABS.find((t) => t.id === tab)?.label}`}
            subtitle={String(year)}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Total revenue (YTD)', value: money(ytd), tone: 'var(--ink)' },
          { label: 'This month', value: money(thisMonth), tone: 'var(--brand-ink)' },
          {
            label: 'Collection rate',
            value: billed > 0 ? `${Math.round((collected / billed) * 100)}%` : '0%',
            tone: 'var(--green)',
          },
          { label: 'Overdue amount', value: money(overdueAmount), tone: 'var(--red)' },
        ].map((s) => (
          <div key={s.label} className="card p-4">
            <p
              className="text-[0.68rem] font-bold uppercase tracking-wider"
              style={{ color: 'var(--muted)' }}
            >
              {s.label}
            </p>
            <p className="mt-1.5 text-xl font-semibold tabular-nums" style={{ color: s.tone }}>
              {s.value}
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        {/* ------------------------------------------------ revenue trend */}
        <div className="card p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                Monthly Revenue Trend
              </p>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                Actual payments collected · {year}
              </p>
            </div>
            <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--muted)' }}>
              <span className="h-0.5 w-4 rounded" style={{ background: 'var(--brand)' }} />
              Revenue
            </span>
          </div>

          <div className="mt-5 flex h-44 items-end gap-1.5">
            {monthly.map((m) => (
              <div key={m.id} className="flex flex-1 flex-col items-center gap-1.5">
                <div className="flex w-full flex-1 items-end">
                  <div
                    className="w-full rounded-t"
                    style={{
                      height: `${Math.max(2, (m.total / peakValue) * 100)}%`,
                      background: m.total > 0 ? 'var(--brand)' : 'var(--border-soft)',
                    }}
                    title={`${m.label}: ${money(m.total)}`}
                  />
                </div>
                <span className="text-[0.62rem]" style={{ color: 'var(--muted)' }}>
                  {m.short}
                </span>
              </div>
            ))}
          </div>

          <div
            className="mt-4 grid grid-cols-3 gap-2 border-t pt-3 text-center"
            style={{ borderColor: 'var(--border-soft)' }}
          >
            {[
              ['Peak Month', peakMonth?.total > 0 ? peakMonth.short : '—'],
              ['YTD Total', money(ytd)],
              ['This Month', money(thisMonth)],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="text-[0.62rem]" style={{ color: 'var(--muted)' }}>
                  {label}
                </p>
                <p className="mt-0.5 text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                  {value}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* ------------------------------------------- collection by type */}
        <div className="card p-4">
          <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
            Collection by Fee Type
          </p>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            All-time payment breakdown
          </p>

          {!typeRows.length ? (
            <p className="py-14 text-center text-sm" style={{ color: 'var(--muted)' }}>
              No payment data yet.
            </p>
          ) : (
            <ul className="mt-4 flex flex-col gap-3">
              {typeRows.map((t) => {
                const share = typeTotal > 0 ? Math.round((t.total / typeTotal) * 100) : 0
                return (
                  <li key={t.type}>
                    <div className="flex items-baseline justify-between text-xs">
                      <span style={{ color: 'var(--ink-2)' }}>
                        {FEE_TYPE_LABEL[t.type] ?? t.type}
                      </span>
                      <span className="font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>
                        {money(t.total)}
                      </span>
                    </div>
                    <div
                      className="mt-1 h-1.5 w-full overflow-hidden rounded-full"
                      style={{ background: 'var(--border-soft)' }}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${share}%`, background: 'var(--brand)' }}
                      />
                    </div>
                    <p className="mt-0.5 text-[0.62rem]" style={{ color: 'var(--muted)' }}>
                      {share}% of collection
                    </p>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------ tabs */}
      <div className="card overflow-hidden">
        <div
          className="flex flex-wrap items-center gap-1 border-b px-3 pt-2"
          style={{ borderColor: 'var(--border)' }}
        >
          {TABS.map((t) => (
            <Link
              key={t.id}
              href={keep({ tab: t.id })}
              className={`tab-underline ${tab === t.id ? 'tab-underline-on' : ''}`}
            >
              {t.label}
            </Link>
          ))}
        </div>

        {tab === 'overview' ? (
          <div className="p-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[
                { label: 'Total challans', value: challanCount, sub: 'All time' },
                { label: 'Paid', value: countOf('paid'), sub: 'Fully paid' },
                { label: 'Partial payments', value: countOf('partial'), sub: 'Partially paid' },
                { label: 'Unpaid', value: countOf('open'), sub: 'Not yet paid' },
                { label: 'Overdue', value: countOf('overdue'), sub: 'Past due date' },
                {
                  label: 'Collection rate',
                  value: billed > 0 ? `${Math.round((collected / billed) * 100)}%` : '—',
                  sub: 'Of total billed',
                },
              ].map((s) => (
                <div
                  key={s.label}
                  className="rounded-xl p-4"
                  style={{ background: 'var(--card-alt)', border: '1px solid var(--border-soft)' }}
                >
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>
                    {s.label}
                  </p>
                  <p
                    className="mt-1 text-xl font-semibold tabular-nums"
                    style={{ color: 'var(--ink)' }}
                  >
                    {s.value}
                  </p>
                  <p className="text-[0.65rem]" style={{ color: 'var(--muted-2)' }}>
                    {s.sub}
                  </p>
                </div>
              ))}
            </div>

            {!classRows.length ? (
              <p className="py-12 text-center text-sm" style={{ color: 'var(--muted)' }}>
                No challan data yet. Generate monthly challans to see class-wise reports.
              </p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="table min-w-[48rem]">
                  <thead>
                    <tr>
                      <th>Class</th>
                      <th className="text-right">Paid</th>
                      <th className="text-right">Unpaid</th>
                      <th className="text-right">Overdue</th>
                      <th className="text-right">Billed</th>
                      <th className="text-right">Collected</th>
                      <th>Collection rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {classRows.map((c) => (
                      <tr key={c.id}>
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
                        <td className="text-right tabular-nums">{money(c.billed)}</td>
                        <td className="text-right tabular-nums">{money(c.collected)}</td>
                        <td>
                          <div className="flex items-center gap-2">
                            <div
                              className="h-1.5 w-24 overflow-hidden rounded-full"
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
                            <span className="text-xs tabular-nums" style={{ color: 'var(--muted)' }}>
                              {c.rate}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : !listed.length ? (
          <p className="px-6 py-14 text-center text-sm" style={{ color: 'var(--muted)' }}>
            Nothing in this category.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table min-w-[56rem]">
              <thead>
                <tr>
                  <th>Challan no.</th>
                  <th>Student</th>
                  <th>Class</th>
                  <th>Fee type</th>
                  <th className="text-right">Net</th>
                  <th className="text-right">Paid</th>
                  <th className="text-right">Remaining</th>
                  <th>Due date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {listed.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <span className="pill pill-muted font-mono">{c.challan_number ?? '—'}</span>
                    </td>
                    <td>
                      <span className="font-medium" style={{ color: 'var(--ink)' }}>
                        {studentName(c.students) || '—'}
                      </span>
                    </td>
                    <td>{classById.get(c.class_id) ?? '—'}</td>
                    <td>{FEE_TYPE_LABEL[c.fee_type] ?? c.fee_type}</td>
                    <td className="text-right tabular-nums">
                      {money(c.net_amount ?? c.total_amount ?? c.amount)}
                    </td>
                    <td className="text-right tabular-nums" style={{ color: 'var(--green)' }}>
                      {money(c.paid_amount)}
                    </td>
                    <td className="text-right tabular-nums">
                      {remaining(c) > 0 ? (
                        <span style={{ color: 'var(--red)' }}>{money(remaining(c))}</span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="tabular-nums">{dateLabel(c.due_date)}</td>
                    <td>
                      <span className={`pill ${CHALLAN_STATUS_TONE[c.state] ?? 'pill-muted'}`}>
                        {CHALLAN_STATUS_LABEL[c.state] ?? c.state}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Capped on purpose. Saying so beats a list that quietly stops. */}
            {listedTotal > listed.length && (
              <p
                className="border-t px-4 py-3 text-xs"
                style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
              >
                Showing the {listed.length} most recent of {listedTotal}. Use Export CSV above for
                the full set, or the filters on{' '}
                <Link href="/school/fees/challans" style={{ color: 'var(--brand-ink)' }}>
                  View Challans
                </Link>{' '}
                to narrow it.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
