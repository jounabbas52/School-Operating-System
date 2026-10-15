import Link from 'next/link'
import { getSchoolContext } from '@/lib/school-context'
import { StatCard, StatRow } from '@/components/stats'
import RefreshButton from '@/components/refresh-button'
import { SESSION_MONTH_ORDER, MONTHS, dateLabel, money } from '@/lib/fee-options'

export const metadata = { title: 'Fee Overview' }

// The quick-action tiles, as on the design.
const ACTIONS = [
  { href: '/school/fees/collect', label: 'Collect Fee', icon: '▤', tone: 'brand' },
  { href: '/school/fees/challans/create', label: 'Create Challan', icon: '▦', tone: 'green' },
  { href: '/school/fees/reports', label: 'View Reports', icon: '▥', tone: 'blue' },
  { href: '/school/fees/policy', label: 'Fee Policy', icon: '▧', tone: 'amber' },
]

const TONE_VAR = {
  brand: { fg: 'var(--brand)', bg: 'var(--brand-soft)' },
  green: { fg: 'var(--green)', bg: 'var(--green-soft)' },
  blue: { fg: 'var(--blue)', bg: 'var(--blue-soft)' },
  amber: { fg: 'var(--amber)', bg: 'var(--amber-soft)' },
}

export default async function FeeOverviewPage() {
  const { schoolId, supabase } = await getSchoolContext()

  const now = new Date()
  const year = now.getFullYear()

  // Everything on this screen is an AGGREGATE, and aggregates are counted in
  // the database -- see 015_report_functions.sql. Selecting every challan and
  // every payment to sum them here worked on a demo and would have shipped
  // six figures of rows to render four tiles on a real school.
  //
  // The chart spans an academic year, so it needs both calendar years: July
  // to December from this one, January to June from the next.
  const [
    { data: totalsRows },
    { data: thisYearRows },
    { data: nextYearRows },
    { data: classRowsRaw },
    { data: recentPayments },
    { data: classes },
    { data: session },
  ] = await Promise.all([
    supabase.rpc('fee_totals', { p_school: schoolId }),
    supabase.rpc('fee_monthly_collection', { p_school: schoolId, p_year: year }),
    supabase.rpc('fee_monthly_collection', { p_school: schoolId, p_year: year + 1 }),
    supabase.rpc('fee_class_summary', { p_school: schoolId }),
    // The only row-level read left, and it is capped at what the panel shows.
    supabase
      .from('fee_payments')
      .select('id, amount_paid, paid_at, receipt_no')
      .eq('school_id', schoolId)
      .eq('is_deleted', false)
      .order('paid_at', { ascending: false })
      .limit(6),
    supabase
      .from('classes')
      .select('id, name, grade_levels(name, ordinal)')
      .eq('school_id', schoolId)
      .eq('is_deleted', false),
    supabase
      .from('sessions')
      .select('name')
      .eq('school_id', schoolId)
      .eq('is_current', true)
      .maybeSingle(),
  ])

  // The function returns a single row; Supabase hands back an array.
  const totals = totalsRows?.[0] ?? {}
  const paid = recentPayments ?? []

  const classOptions = (classes ?? [])
    .sort((a, b) => (a.grade_levels?.ordinal ?? 999) - (b.grade_levels?.ordinal ?? 999))
    .map((c) => ({ id: c.id, label: c.grade_levels?.name ?? c.name }))
  const classById = new Map(classOptions.map((c) => [c.id, c.label]))

  const billed = Number(totals.billed) || 0
  const collected = Number(totals.collected) || 0
  const pending = Math.max(0, billed - collected)

  const challanCount = Number(totals.challans) || 0
  const paidCount = Number(totals.paid_count) || 0
  const unpaidCount = challanCount - paidCount
  const overdueCount = Number(totals.overdue_count) || 0

  const collectionRate = billed > 0 ? Math.round((collected / billed) * 100) : 0

  // Payments are summed by the month they were RECEIVED, not the month they
  // were billed for. A July fee paid in September belongs to September's
  // collection, which is the question this chart answers.
  const monthTotal = (rows, month) =>
    Number(rows?.find((r) => Number(r.month) === month)?.collected) || 0

  // The academic year runs July to June, so the chart does too.
  const chart = SESSION_MONTH_ORDER.map((m) => ({
    month: m,
    short: MONTHS.find((x) => x.id === m)?.short ?? '',
    value: m >= 7 ? monthTotal(thisYearRows, m) : monthTotal(nextYearRows, m),
  }))

  const peak = Math.max(1, ...chart.map((c) => c.value))
  const ytd = chart.reduce((sum, c) => sum + c.value, 0)

  // Class-wise progress: billed against collected, per class.
  const byClass = new Map(
    (classRowsRaw ?? []).map((r) => [
      r.class_id ?? 'none',
      {
        billed: Number(r.billed) || 0,
        collected: Number(r.collected) || 0,
        count: Number(r.challans) || 0,
      },
    ])
  )

  const classRows = [...byClass.entries()]
    .map(([id, v]) => ({
      id,
      label: classById.get(id) ?? 'Unassigned',
      ...v,
      rate: v.billed > 0 ? Math.round((v.collected / v.billed) * 100) : 0,
    }))
    .sort((a, b) => b.billed - a.billed)

  const recent = paid.slice(0, 6)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>
            Fee Overview
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
            {session?.name ? `Academic Year ${session.name}` : 'No active session'} ·{' '}
            {challanCount} challan{challanCount === 1 ? '' : 's'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <RefreshButton />
          <Link href="/school/fees/collect" className="btn btn-primary">
            Collect Fee
          </Link>
        </div>
      </div>

      <StatRow>
        <StatCard
          label="Total collected"
          value={money(collected)}
          sub={`${collectionRate}% rate · this academic year`}
          tone="brand"
          icon="▲"
        />
        <StatCard
          label="Pending fees"
          value={money(pending)}
          sub={`${overdueCount} overdue · ${unpaidCount} challans`}
          tone="amber"
          icon="◷"
        />
        <StatCard
          label="Challans paid"
          value={paidCount}
          sub={challanCount ? `${Math.round((paidCount / challanCount) * 100)}% of total` : '0% of total'}
          tone="green"
          icon="✓"
        />
        <StatCard
          label="Challans unpaid"
          value={unpaidCount}
          sub={`${overdueCount} overdue`}
          tone="red"
          icon="!"
        />
      </StatRow>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* ------------------------------------------- monthly collection */}
        <div className="card p-4 lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                Monthly Fee Collection
              </p>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                {session?.name ? `Academic Year ${session.name}` : `Year ${year}`}
              </p>
            </div>
            <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--muted)' }}>
              <span className="size-2 rounded-full" style={{ background: 'var(--brand)' }} />
              Collected
            </span>
          </div>

          <div className="mt-5 flex h-48 items-end gap-1.5">
            {chart.map((c) => (
              <div key={c.month} className="flex flex-1 flex-col items-center gap-1.5">
                <div className="flex w-full flex-1 items-end">
                  <div
                    className="w-full rounded-t"
                    style={{
                      // A floor of 2px so an empty month is still a readable
                      // column rather than a gap in the axis.
                      height: `${Math.max(2, (c.value / peak) * 100)}%`,
                      background: c.value > 0 ? 'var(--brand)' : 'var(--border-soft)',
                    }}
                    title={`${c.short}: ${money(c.value)}`}
                  />
                </div>
                <span className="text-[0.62rem]" style={{ color: 'var(--muted)' }}>
                  {c.short}
                </span>
              </div>
            ))}
          </div>

          <div
            className="mt-4 flex items-center justify-between border-t pt-3 text-xs"
            style={{ borderColor: 'var(--border-soft)' }}
          >
            <span style={{ color: 'var(--muted)' }}>
              YTD Total:{' '}
              <span className="font-semibold" style={{ color: 'var(--brand-ink)' }}>
                {money(ytd)}
              </span>
            </span>
            <Link href="/school/fees/reports" style={{ color: 'var(--brand-ink)' }}>
              View full report →
            </Link>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {/* --------------------------------------------- quick actions */}
          <div className="card p-4">
            <p className="mb-3 text-sm font-semibold" style={{ color: 'var(--ink)' }}>
              Quick Actions
            </p>
            <div className="grid grid-cols-2 gap-2">
              {ACTIONS.map((a) => {
                const tone = TONE_VAR[a.tone]
                return (
                  <Link
                    key={a.href}
                    href={a.href}
                    className="flex flex-col items-center gap-2 rounded-xl px-3 py-4 text-center transition"
                    style={{ background: 'var(--card-alt)', border: '1px solid var(--border-soft)' }}
                  >
                    <span
                      className="flex size-9 items-center justify-center rounded-lg text-sm"
                      style={{ background: tone.bg, color: tone.fg }}
                      aria-hidden="true"
                    >
                      {a.icon}
                    </span>
                    <span className="text-xs font-medium" style={{ color: 'var(--ink-2)' }}>
                      {a.label}
                    </span>
                  </Link>
                )
              })}
            </div>
          </div>

          {/* ------------------------------------------- recent activity */}
          <div className="card flex-1 p-4">
            <p className="mb-3 text-sm font-semibold" style={{ color: 'var(--ink)' }}>
              Recent Activity
            </p>
            {!recent.length ? (
              <p className="py-6 text-center text-sm" style={{ color: 'var(--muted)' }}>
                No recent activity.
              </p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {recent.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 text-xs">
                    <div className="min-w-0">
                      <p className="truncate font-medium" style={{ color: 'var(--ink)' }}>
                        {p.receipt_no ?? 'Payment'}
                      </p>
                      <p style={{ color: 'var(--muted)' }}>
                        {p.paid_at ? dateLabel(p.paid_at.slice(0, 10)) : '—'}
                      </p>
                    </div>
                    <span className="shrink-0 font-semibold tabular-nums" style={{ color: 'var(--green)' }}>
                      {money(p.amount_paid)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* ------------------------------------------------ class breakdown */}
      <div className="card overflow-hidden">
        <div
          className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3"
          style={{ borderColor: 'var(--border)', background: 'var(--card-alt)' }}
        >
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
              Fee Collection by Class
            </p>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              Current period progress
            </p>
          </div>
          <Link href="/school/fees/collect" className="btn btn-primary">
            Collect Fee
          </Link>
        </div>

        {!classRows.length ? (
          <p className="px-6 py-14 text-center text-sm" style={{ color: 'var(--muted)' }}>
            No challans have been generated yet.{' '}
            <Link href="/school/fees/challans/create" style={{ color: 'var(--brand-ink)' }}>
              Create the first one
            </Link>
            .
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table min-w-[46rem]">
              <thead>
                <tr>
                  <th>Class</th>
                  <th className="text-right">Challans</th>
                  <th className="text-right">Billed</th>
                  <th className="text-right">Collected</th>
                  <th className="text-right">Pending</th>
                  <th>Progress</th>
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
                    <td className="text-right tabular-nums">{c.count}</td>
                    <td className="text-right tabular-nums">{money(c.billed)}</td>
                    <td className="text-right tabular-nums" style={{ color: 'var(--green)' }}>
                      {money(c.collected)}
                    </td>
                    <td className="text-right tabular-nums" style={{ color: 'var(--amber)' }}>
                      {money(c.billed - c.collected)}
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
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
    </div>
  )
}
