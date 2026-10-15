import { getSchoolContext } from '@/lib/school-context'
import ExportButtons from '@/components/export-buttons'
import RefreshButton from '@/components/refresh-button'
import { MONTHS } from '@/lib/fee-options'
import { money } from '@/lib/payroll-options'

export const metadata = { title: 'Payroll Reports' }

export default async function PayrollReportsPage({ searchParams }) {
  const params = await searchParams
  const year = Number(params?.year) || new Date().getFullYear()

  const { schoolId, supabase } = await getSchoolContext()

  const from = `${year}-01-01`
  const to = `${year}-12-31`

  const [{ data: runs }, { data: expenses }, { data: payments }] = await Promise.all([
    supabase
      .from('payroll_runs')
      .select('id, run_month, status, working_days')
      .eq('school_id', schoolId)
      .eq('is_deleted', false)
      .gte('run_month', from)
      .lte('run_month', to),
    supabase
      .from('expenses')
      .select('id, amount, expense_date, status, category')
      .eq('school_id', schoolId)
      .eq('is_deleted', false)
      .gte('expense_date', from)
      .lte('expense_date', to),
    supabase
      .from('fee_payments')
      .select('amount_paid, paid_at')
      .eq('school_id', schoolId)
      .eq('is_deleted', false),
  ])

  const runIds = (runs ?? []).map((r) => r.id)

  let items = []
  if (runIds.length) {
    const { data } = await supabase
      .from('payroll_items')
      .select(
        'id, payroll_run_id, gross_amount, net_amount, deduction_amount, eobi_amount, pf_amount, tax_amount, status'
      )
      .eq('school_id', schoolId)
      .eq('is_deleted', false)
      .in('payroll_run_id', runIds)
    items = data ?? []
  }

  const runById = new Map((runs ?? []).map((r) => [r.id, r]))

  const grossTotal = items.reduce((sum, i) => sum + (Number(i.gross_amount) || 0), 0)
  const netTotal = items.reduce((sum, i) => sum + (Number(i.net_amount) || 0), 0)
  const disbursed = items
    .filter((i) => i.status === 'paid')
    .reduce((sum, i) => sum + (Number(i.net_amount) || 0), 0)
  const stillPayable = netTotal - disbursed

  const eobiTotal = items.reduce((sum, i) => sum + (Number(i.eobi_amount) || 0), 0)
  const pfTotal = items.reduce((sum, i) => sum + (Number(i.pf_amount) || 0), 0)
  const taxTotal = items.reduce((sum, i) => sum + (Number(i.tax_amount) || 0), 0)

  // Fee income is counted on the date it arrived, matching the Fee reports.
  const feeByMonth = new Map()
  for (const p of payments ?? []) {
    if (!p.paid_at) continue
    const d = new Date(p.paid_at)
    if (d.getFullYear() !== year) continue
    const m = d.getMonth() + 1
    feeByMonth.set(m, (feeByMonth.get(m) ?? 0) + (Number(p.amount_paid) || 0))
  }

  const expenseByMonth = new Map()
  for (const e of expenses ?? []) {
    if (e.status === 'rejected') continue
    const m = Number(String(e.expense_date).slice(5, 7))
    expenseByMonth.set(m, (expenseByMonth.get(m) ?? 0) + (Number(e.amount) || 0))
  }

  const salaryByMonth = new Map()
  for (const i of items) {
    const run = runById.get(i.payroll_run_id)
    if (!run) continue
    const m = Number(String(run.run_month).slice(5, 7))
    salaryByMonth.set(m, (salaryByMonth.get(m) ?? 0) + (Number(i.net_amount) || 0))
  }

  const monthly = MONTHS.map((m) => ({
    ...m,
    salaries: salaryByMonth.get(m.id) ?? 0,
    expenses: expenseByMonth.get(m.id) ?? 0,
    fees: feeByMonth.get(m.id) ?? 0,
  }))

  const peak = Math.max(
    1,
    ...monthly.map((m) => Math.max(m.salaries + m.expenses, m.fees))
  )

  const feeIncome = monthly.reduce((sum, m) => sum + m.fees, 0)
  const expenseTotal = monthly.reduce((sum, m) => sum + m.expenses, 0)
  const outflow = netTotal + expenseTotal
  const cover = outflow > 0 ? Math.round((feeIncome / outflow) * 100) : 0
  const shortfall = Math.max(0, outflow - feeIncome)

  const exportRows = monthly.map((m, i) => ({
    n: i + 1,
    month: m.label,
    salaries: m.salaries,
    expenses: m.expenses,
    outflow: m.salaries + m.expenses,
    fees: m.fees,
    net: m.fees - (m.salaries + m.expenses),
  }))

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>
            Payroll Reports
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
            Salary cost, statutory liabilities and cash-flow cover for {year}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <RefreshButton />
          <form className="flex items-center gap-2">
            <select name="year" defaultValue={year} className="field w-auto" aria-label="Year">
              {[year - 1, year, year + 1].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <button className="btn btn-ghost">Go</button>
          </form>
          <ExportButtons
            rows={exportRows}
            columns={[
              { key: 'n', label: '#' },
              { key: 'month', label: 'Month' },
              { key: 'salaries', label: 'Salaries' },
              { key: 'expenses', label: 'Other expenses' },
              { key: 'outflow', label: 'Total outflow' },
              { key: 'fees', label: 'Fee income' },
              { key: 'net', label: 'Net' },
            ]}
            filename={`payroll-report-${year}`}
            title={`Payroll Report — ${year}`}
          />
        </div>
      </div>

      {/* --------------------------------------------------- cover headline */}
      <div className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p
              className="text-[0.68rem] font-bold uppercase tracking-wider"
              style={{ color: 'var(--muted)' }}
            >
              Does the fee income cover the outflow?
            </p>
            <p className="mt-1.5 text-sm" style={{ color: 'var(--ink-2)' }}>
              Fees collected <strong>{money(feeIncome)}</strong> · salaries{' '}
              <strong>{money(netTotal)}</strong> · other expenses{' '}
              <strong>{money(expenseTotal)}</strong>
            </p>
          </div>
          <div className="text-right">
            <p
              className="text-2xl font-semibold tabular-nums"
              style={{ color: cover >= 100 ? 'var(--green)' : 'var(--red)' }}
            >
              {cover}%
            </p>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              {shortfall > 0 ? `Shortfall ${money(shortfall)}` : 'Fully covered'}
            </p>
          </div>
        </div>

        <div
          className="mt-4 h-2 w-full overflow-hidden rounded-full"
          style={{ background: 'var(--border-soft)' }}
        >
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.min(100, cover)}%`,
              background: cover >= 100 ? 'var(--green)' : cover >= 70 ? 'var(--amber)' : 'var(--red)',
            }}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Gross payroll', value: money(grossTotal), sub: `${items.length} salary entries`, tone: 'var(--ink)' },
          { label: 'Net payroll', value: money(netTotal), sub: 'After all deductions', tone: 'var(--brand-ink)' },
          { label: 'Disbursed', value: money(disbursed), sub: 'Marked paid', tone: 'var(--green)' },
          { label: 'Still payable', value: money(stillPayable), sub: 'Approved but unpaid', tone: 'var(--amber)' },
        ].map((s) => (
          <div key={s.label} className="card p-4">
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              {s.label}
            </p>
            <p className="mt-1 text-xl font-semibold tabular-nums" style={{ color: s.tone }}>
              {s.value}
            </p>
            <p className="text-[0.65rem]" style={{ color: 'var(--muted-2)' }}>
              {s.sub}
            </p>
          </div>
        ))}
      </div>

      {/* ---------------------------------------------------- month by month */}
      <div className="card p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
              Month by month
            </p>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              Salary + expenses against fee collection
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs" style={{ color: 'var(--muted)' }}>
            {[
              ['Salaries', 'var(--brand)'],
              ['Other expenses', 'var(--muted-2)'],
              ['Fee income', 'var(--green)'],
            ].map(([label, colour]) => (
              <span key={label} className="flex items-center gap-1.5">
                <span className="size-2 rounded-full" style={{ background: colour }} />
                {label}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-5 flex h-48 items-end gap-2">
          {monthly.map((m) => (
            <div key={m.id} className="flex flex-1 flex-col items-center gap-1.5">
              <div className="flex w-full flex-1 items-end gap-0.5">
                {/* Outflow stacks salaries over expenses; fee income sits
                    beside it, so "did we cover it" is one glance. */}
                <div className="flex h-full flex-1 flex-col justify-end">
                  <div
                    style={{
                      height: `${(m.expenses / peak) * 100}%`,
                      background: 'var(--muted-2)',
                    }}
                    title={`Expenses: ${money(m.expenses)}`}
                  />
                  <div
                    className="rounded-b"
                    style={{
                      height: `${(m.salaries / peak) * 100}%`,
                      background: 'var(--brand)',
                    }}
                    title={`Salaries: ${money(m.salaries)}`}
                  />
                </div>
                <div className="flex h-full flex-1 items-end">
                  <div
                    className="w-full rounded-t"
                    style={{
                      height: `${Math.max(1, (m.fees / peak) * 100)}%`,
                      background: 'var(--green)',
                    }}
                    title={`Fee income: ${money(m.fees)}`}
                  />
                </div>
              </div>
              <span className="text-[0.62rem]" style={{ color: 'var(--muted)' }}>
                {m.short}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        {/* ------------------------------------------------- statutory */}
        <div className="card p-4">
          <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
            Statutory liabilities
          </p>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            Deducted from staff this year
          </p>

          <dl className="mt-4 flex flex-col gap-3 text-sm">
            {[
              ['EOBI', eobiTotal],
              ['Provident fund', pfTotal],
              ['Income tax withheld', taxTotal],
            ].map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between gap-3">
                <dt style={{ color: 'var(--muted)' }}>{label}</dt>
                <dd className="font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>
                  {money(value)}
                </dd>
              </div>
            ))}
            <div
              className="flex items-baseline justify-between gap-3 border-t pt-2"
              style={{ borderColor: 'var(--border)' }}
            >
              <dt className="font-semibold" style={{ color: 'var(--ink)' }}>
                Total
              </dt>
              <dd className="font-semibold tabular-nums" style={{ color: 'var(--brand-ink)' }}>
                {money(eobiTotal + pfTotal + taxTotal)}
              </dd>
            </div>
          </dl>
        </div>

        {/* --------------------------------------------------- run table */}
        <div className="card overflow-hidden">
          <div
            className="border-b px-4 py-3"
            style={{ borderColor: 'var(--border)', background: 'var(--card-alt)' }}
          >
            <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
              Monthly breakdown
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="table min-w-[40rem]">
              <thead>
                <tr>
                  <th>Month</th>
                  <th className="text-right">Salaries</th>
                  <th className="text-right">Expenses</th>
                  <th className="text-right">Outflow</th>
                  <th className="text-right">Fee income</th>
                  <th className="text-right">Net</th>
                </tr>
              </thead>
              <tbody>
                {monthly.map((m) => {
                  const out = m.salaries + m.expenses
                  const net = m.fees - out
                  return (
                    <tr key={m.id}>
                      <td>
                        <span className="font-medium" style={{ color: 'var(--ink)' }}>
                          {m.label}
                        </span>
                      </td>
                      <td className="text-right tabular-nums">{money(m.salaries)}</td>
                      <td className="text-right tabular-nums">{money(m.expenses)}</td>
                      <td className="text-right tabular-nums">{money(out)}</td>
                      <td className="text-right tabular-nums" style={{ color: 'var(--green)' }}>
                        {money(m.fees)}
                      </td>
                      <td
                        className="text-right tabular-nums font-semibold"
                        style={{ color: net >= 0 ? 'var(--green)' : 'var(--red)' }}
                      >
                        {net >= 0 ? money(net) : `- ${money(Math.abs(net))}`}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {!runs?.length && (
        <p className="text-center text-sm" style={{ color: 'var(--muted)' }}>
          No payroll has been generated for {year} yet — the salary columns above are empty by
          definition, not by error.
        </p>
      )}
    </div>
  )
}
