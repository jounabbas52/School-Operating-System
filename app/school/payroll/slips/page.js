import Link from 'next/link'
import { getSchoolContext } from '@/lib/school-context'
import RefreshButton from '@/components/refresh-button'
import { staffName } from '@/lib/staff-options'
import { MONTHS } from '@/lib/fee-options'
import {
  RUN_STAGE_LABEL,
  money,
  monthLabel,
  runMonth,
  toPayslip,
} from '@/lib/payroll-options'
import { loadDocument, printDateTime } from '@/lib/documents'
import SlipView from './slip-view'

export const metadata = { title: 'Salary Slips' }

export default async function SalarySlipsPage({ searchParams }) {
  const params = await searchParams
  const now = new Date()
  const year = Number(params?.year) || now.getFullYear()
  const month = Number(params?.month) || now.getMonth() + 1
  const staffId = params?.staff ?? ''

  const { schoolId, school, supabase } = await getSchoolContext()
  const period = runMonth(year, month)

  const { data: run } = await supabase
    .from('payroll_runs')
    .select('id, run_month, status, working_days, paid_at, approved_at')
    .eq('school_id', schoolId)
    .eq('run_month', period)
    .maybeSingle()

  let items = []
  if (run) {
    const { data } = await supabase
      .from('payroll_items')
      .select(
        'id, staff_id, basic_salary, allowances, gross_amount, working_days, present_days, absent_days, half_days, leave_days, late_marks, absence_amount, eobi_amount, pf_amount, tax_amount, deduction_amount, net_amount, payment_mode, status, remarks, staff(first_name, last_name, staff_number, designation, department, payment_mode, bank_name, account_number)'
      )
      .eq('school_id', schoolId)
      .eq('payroll_run_id', run.id)
      .eq('is_deleted', false)
    items = (data ?? []).sort((a, b) => staffName(a.staff).localeCompare(staffName(b.staff)))
  }

  // The letterhead. Loaded unconditionally rather than inside the `if (run)`
  // branch so the empty state still renders without a second code path.
  const doc = await loadDocument(supabase, schoolId, school)

  const selected = items.find((i) => i.staff_id === staffId) ?? items[0] ?? null

  const keep = (next) => {
    const sp = new URLSearchParams()
    sp.set('year', String(next.year ?? year))
    sp.set('month', String(next.month ?? month))
    if (next.staff ?? staffId) sp.set('staff', next.staff ?? staffId)
    return `/school/payroll/slips?${sp.toString()}`
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>
            Salary Slips
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
            {monthLabel(period)}
            {run ? ` · run is ${RUN_STAGE_LABEL[run.status] ?? run.status}` : ' · not generated'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <RefreshButton />
          <form className="flex items-center gap-2">
            {staffId && <input type="hidden" name="staff" value={staffId} />}
            <select name="month" defaultValue={month} className="field w-auto" aria-label="Month">
              {MONTHS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
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
            <button className="btn btn-ghost">Go</button>
          </form>
          {items.length > 0 && (
            <Link
              href={`/school/payroll/slips/print?year=${year}&month=${month}`}
              className="btn btn-ghost"
            >
              Print all {items.length}
            </Link>
          )}
          <Link href={`/school/payroll/run?year=${year}&month=${month}`} className="btn btn-ghost">
            Payroll Run
          </Link>
        </div>
      </div>

      {!run || !items.length ? (
        <div className="card px-6 py-16 text-center" style={{ borderStyle: 'dashed' }}>
          <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            No slip to show
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm" style={{ color: 'var(--muted)' }}>
            Generate payroll for {monthLabel(period)} first — a slip is a view of a payroll row, not
            a separate record.
          </p>
          <Link
            href={`/school/payroll/run?year=${year}&month=${month}`}
            className="btn btn-primary mt-4"
          >
            Go to Payroll Run
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
          {/* --------------------------------------------------- employee list */}
          <div className="card overflow-hidden lg:sticky lg:top-20 lg:self-start">
            <div
              className="border-b px-3 py-2.5"
              style={{ borderColor: 'var(--border)', background: 'var(--card-alt)' }}
            >
              <p className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>
                {items.length} employee{items.length === 1 ? '' : 's'}
              </p>
            </div>

            <div className="max-h-[32rem] overflow-y-auto">
              {items.map((i) => {
                const on = selected?.id === i.id
                return (
                  <Link
                    key={i.id}
                    href={keep({ staff: i.staff_id })}
                    className="flex items-center justify-between gap-2 px-3 py-2.5 transition"
                    style={{
                      background: on ? 'var(--brand-soft)' : 'transparent',
                      borderBottom: '1px solid var(--border-soft)',
                      borderLeft: `3px solid ${on ? 'var(--brand)' : 'transparent'}`,
                    }}
                  >
                    <span className="min-w-0">
                      <span
                        className="block truncate text-sm font-medium"
                        style={{ color: on ? 'var(--brand-ink)' : 'var(--ink)' }}
                      >
                        {staffName(i.staff)}
                      </span>
                      <span className="block truncate text-xs" style={{ color: 'var(--muted)' }}>
                        {i.staff?.staff_number ?? '—'}
                      </span>
                    </span>
                    <span
                      className="shrink-0 text-xs font-semibold tabular-nums"
                      style={{ color: 'var(--green)' }}
                    >
                      {money(i.net_amount)}
                    </span>
                  </Link>
                )
              })}
            </div>
          </div>

          {/* --------------------------------------------------------- the slip */}
          {selected && (
            <SlipView
              slip={toPayslip(selected, { period })}
              doc={doc}
              printedAt={printDateTime()}
            />
          )}
        </div>
      )}
    </div>
  )
}
