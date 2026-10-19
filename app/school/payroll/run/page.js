import Link from 'next/link'
import { getSchoolContext } from '@/lib/school-context'
import { StatCard, StatRow } from '@/components/stats'
import SubmitButton from '@/components/submit-button'
import ExportButtons from '@/components/export-buttons'
import RefreshButton from '@/components/refresh-button'
import ConfirmButton from '@/components/confirm'
import { staffName } from '@/lib/staff-options'
import {
  ITEM_STATUSES,
  ITEM_STATUS_LABEL,
  ITEM_STATUS_TONE,
  RUN_STAGE_LABEL,
  RUN_STAGE_TONE,
  money,
  monthLabel,
  runMonth,
} from '@/lib/payroll-options'
import { MONTHS } from '@/lib/fee-options'
import { approvePayroll, markPayrollPaid, setItemStatus } from '../actions'
import GeneratePanel from './generate-panel'
import AdjustPanel from './adjust-panel'

export const metadata = { title: 'Payroll Run' }

export default async function PayrollRunPage({ searchParams }) {
  const params = await searchParams
  const now = new Date()
  const year = Number(params?.year) || now.getFullYear()
  const month = Number(params?.month) || now.getMonth() + 1
  const q = (params?.q ?? '').trim()
  const statusFilter = params?.status ?? ''

  const { schoolId, permissions, supabase } = await getSchoolContext()
  const canWrite = permissions.has('payroll.write')

  const period = runMonth(year, month)

  const { data: run } = await supabase
    .from('payroll_runs')
    .select('id, run_month, status, working_days, generated_at, approved_at, paid_at, notes')
    .eq('school_id', schoolId)
    .eq('run_month', period)
    .maybeSingle()

  let items = []
  if (run) {
    const { data } = await supabase
      .from('payroll_items')
      .select(
        'id, staff_id, basic_salary, allowances, gross_amount, working_days, present_days, absent_days, leave_days, half_days, late_marks, deduction_amount, absence_amount, eobi_amount, pf_amount, tax_amount, net_amount, payment_mode, status, remarks, staff(first_name, last_name, staff_number, designation, department)'
      )
      .eq('school_id', schoolId)
      .eq('payroll_run_id', run.id)
      .eq('is_deleted', false)
    items = data ?? []
  }

  // Staff with a package but no row in this run -- normally someone hired
  // after the month was generated.
  const [{ data: activeStaff }, { data: packages }] = await Promise.all([
    supabase
      .from('staff')
      .select('id')
      .eq('school_id', schoolId)
      .eq('is_deleted', false)
      .eq('status', 'active'),
    supabase
      .from('staff_salaries')
      .select('staff_id')
      .eq('school_id', schoolId)
      .eq('is_deleted', false),
  ])

  const packaged = new Set((packages ?? []).map((p) => p.staff_id))
  const inRun = new Set(items.map((i) => i.staff_id))
  const missing = (activeStaff ?? []).filter((s) => packaged.has(s.id) && !inRun.has(s.id)).length

  const needle = q.toLowerCase()
  const rows = items
    .filter((i) => {
      if (statusFilter && i.status !== statusFilter) return false
      if (!needle) return true
      return [staffName(i.staff), i.staff?.staff_number, i.staff?.designation]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle))
    })
    .sort((a, b) => staffName(a.staff).localeCompare(staffName(b.staff)))

  const gross = items.reduce((sum, i) => sum + (Number(i.gross_amount) || 0), 0)
  const deductions = items.reduce((sum, i) => sum + (Number(i.deduction_amount) || 0), 0)
  const net = items.reduce((sum, i) => sum + (Number(i.net_amount) || 0), 0)
  const paidTotal = items
    .filter((i) => i.status === 'paid')
    .reduce((sum, i) => sum + (Number(i.net_amount) || 0), 0)

  const countOf = (status) => items.filter((i) => i.status === status).length

  const exportRows = rows.map((i, n) => ({
    n: n + 1,
    staff_number: i.staff?.staff_number ?? '',
    name: staffName(i.staff),
    designation: i.staff?.designation ?? '',
    basic: Number(i.basic_salary) || 0,
    allowances: Number(i.allowances) || 0,
    gross: Number(i.gross_amount) || 0,
    working: i.working_days ?? '',
    present: i.present_days ?? '',
    absent: i.absent_days ?? 0,
    deductions: Number(i.deduction_amount) || 0,
    net: Number(i.net_amount) || 0,
    mode: i.payment_mode ?? '',
    status: ITEM_STATUS_LABEL[i.status] ?? i.status,
  }))

  const keep = (next) => {
    const sp = new URLSearchParams()
    sp.set('year', String(next.year ?? year))
    sp.set('month', String(next.month ?? month))
    if (statusFilter) sp.set('status', statusFilter)
    if (q) sp.set('q', q)
    return `/school/payroll/run?${sp.toString()}`
  }

  const stage = run?.status ?? null
  const STAGES = ['draft', 'finalized', 'paid']

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>
            Payroll Run
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
            Generate, adjust, approve and disburse the month&rsquo;s salaries
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <RefreshButton />
          <form className="flex items-center gap-2">
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
        </div>
      </div>

      {/* ------------------------------------------------------- run header */}
      <div className="card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold" style={{ color: 'var(--ink)' }}>
                {monthLabel(period)}
              </h2>
              {run ? (
                <span className={`pill ${RUN_STAGE_TONE[run.status] ?? 'pill-muted'}`}>
                  ● {RUN_STAGE_LABEL[run.status] ?? run.status}
                </span>
              ) : (
                <span className="pill pill-muted">Not generated</span>
              )}
            </div>
            <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
              {run
                ? `${items.length} staff · ${run.working_days ?? '—'} working days`
                : 'Generate this month to snapshot every active employee’s salary and attendance.'}
            </p>
          </div>

          {canWrite && (
            <div className="flex flex-wrap items-center gap-2">
              {run && missing > 0 && (
                <GeneratePanel
                  year={year}
                  month={month}
                  missing={missing}
                  trigger={{ label: 'Add missing staff', className: 'btn btn-primary' }}
                />
              )}
              {run && run.status === 'draft' && (
                <GeneratePanel
                  year={year}
                  month={month}
                  regenerate
                  trigger={{ label: 'Refresh from attendance', className: 'btn btn-ghost' }}
                />
              )}
              {!run && (
                <GeneratePanel
                  year={year}
                  month={month}
                  trigger={{ label: '⚡ Generate Payroll', className: 'btn btn-primary' }}
                />
              )}
              {run?.status === 'draft' && items.length > 0 && (
                <form action={approvePayroll}>
                  <input type="hidden" name="id" value={run.id} />
                  <ConfirmButton
                    className="btn btn-blue"
                    title={`Approve ${monthLabel(period)} payroll?`}
                    message="Approval freezes the amounts and creates the audit trail. Adjustments after this need the row put back on hold."
                    confirmLabel="Approve"
                    danger={false}
                  >
                    Approve
                  </ConfirmButton>
                </form>
              )}
              {run?.status === 'finalized' && (
                <form action={markPayrollPaid}>
                  <input type="hidden" name="id" value={run.id} />
                  <ConfirmButton
                    className="btn btn-primary"
                    title={`Mark ${monthLabel(period)} as paid?`}
                    message={`${money(net)} is recorded as disbursed, and a salary payment is written for every employee not on hold.`}
                    confirmLabel="Mark paid"
                    danger={false}
                  >
                    Mark Paid
                  </ConfirmButton>
                </form>
              )}
              {run && (
                <Link href={`/school/payroll/slips?year=${year}&month=${month}`} className="btn btn-ghost">
                  Salary Slips
                </Link>
              )}
            </div>
          )}
        </div>

        {/* The three-step rail. */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {STAGES.map((s, i) => {
            const reached = stage ? STAGES.indexOf(stage) >= i : false
            return (
              <div key={s} className="flex items-center gap-2">
                <span
                  className="rounded-full px-2.5 py-1 text-[0.68rem] font-semibold"
                  style={{
                    background: reached ? 'var(--brand)' : 'var(--card-alt)',
                    color: reached ? '#fff' : 'var(--muted)',
                    border: reached ? 'none' : '1px solid var(--border)',
                  }}
                >
                  {RUN_STAGE_LABEL[s]}
                </span>
                {i < STAGES.length - 1 && (
                  <span
                    className="h-px w-8"
                    style={{ background: 'var(--border)' }}
                    aria-hidden="true"
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>

      <StatRow>
        <StatCard
          label="Employees"
          value={items.length}
          sub={run ? `${run.working_days ?? '—'} working days` : '— working days'}
          tone="brand"
          icon="◉"
        />
        <StatCard
          label="Gross"
          value={money(gross)}
          sub={`− ${money(deductions)} deductions`}
          tone="blue"
          icon="₨"
        />
        <StatCard label="Net payable" value={money(net)} sub="After all deductions" tone="green" icon="▲" />
        <StatCard
          label="Paid"
          value={money(paidTotal)}
          sub={countOf('hold') ? `${countOf('hold')} on hold` : '—'}
          tone="amber"
          icon="✓"
        />
      </StatRow>

      {/* --------------------------------------------------------- filters */}
      <form className="card flex flex-wrap items-center gap-2 p-3">
        <input type="hidden" name="year" value={year} />
        <input type="hidden" name="month" value={month} />

        <input
          name="q"
          defaultValue={q}
          placeholder="Search employee…"
          className="field min-w-56 flex-1"
        />

        <div className="flex flex-wrap items-center gap-1">
          <Link href={keep({})} className={`tab !px-2.5 !py-1 ${!statusFilter ? 'tab-on' : ''}`}>
            All
          </Link>
          {ITEM_STATUSES.map((s) => (
            <Link
              key={s.id}
              href={`${keep({})}&status=${s.id}`}
              className={`tab !px-2.5 !py-1 ${statusFilter === s.id ? 'tab-on' : ''}`}
            >
              {s.label}
            </Link>
          ))}
        </div>

        <button className="btn btn-primary">Search</button>

        <span className="ml-auto text-xs" style={{ color: 'var(--muted)' }}>
          {rows.length} of {items.length}
        </span>
      </form>

      {!run || !items.length ? (
        <div className="card px-6 py-16 text-center" style={{ borderStyle: 'dashed' }}>
          <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            No payroll generated for this month
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm" style={{ color: 'var(--muted)' }}>
            {run
              ? 'The run exists but has no rows — nobody had a salary package when it was generated.'
              : 'Click "Generate Payroll" above to build it.'}
          </p>
          <Link href="/school/payroll/salaries" className="btn btn-ghost mt-4">
            Staff Salaries
          </Link>
        </div>
      ) : (
        <>
          <ExportButtons
            rows={exportRows}
            columns={[
              { key: 'n', label: '#' },
              { key: 'staff_number', label: 'Staff ID' },
              { key: 'name', label: 'Name' },
              { key: 'designation', label: 'Designation' },
              { key: 'basic', label: 'Basic' },
              { key: 'allowances', label: 'Allowances' },
              { key: 'gross', label: 'Gross' },
              { key: 'working', label: 'Working days' },
              { key: 'present', label: 'Present' },
              { key: 'absent', label: 'Absent' },
              { key: 'deductions', label: 'Deductions' },
              { key: 'net', label: 'Net' },
              { key: 'mode', label: 'Mode' },
              { key: 'status', label: 'Status' },
            ]}
            filename={`payroll-${year}-${String(month).padStart(2, '0')}`}
            title={`Payroll — ${monthLabel(period)}`}
            subtitle={`${items.length} employees · net ${money(net)}`}
          />

          <div className="card overflow-x-auto">
            <table className="table min-w-[72rem]">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th className="text-right">Basic</th>
                  <th className="text-right">Allowances</th>
                  <th className="text-right">Gross</th>
                  <th>Attendance</th>
                  <th className="text-right">Deductions</th>
                  <th className="text-right">Net</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <span className="font-medium" style={{ color: 'var(--ink)' }}>
                        {staffName(i.staff)}
                      </span>
                      <span className="block text-xs" style={{ color: 'var(--muted)' }}>
                        {i.staff?.staff_number ?? '—'} · {i.staff?.designation ?? '—'}
                      </span>
                    </td>
                    <td className="text-right tabular-nums">{money(i.basic_salary)}</td>
                    <td className="text-right tabular-nums">{money(i.allowances)}</td>
                    <td className="text-right tabular-nums">{money(i.gross_amount)}</td>
                    <td>
                      <span className="text-xs tabular-nums" style={{ color: 'var(--ink-2)' }}>
                        {i.present_days ?? '—'} / {i.working_days ?? '—'}
                      </span>
                      <span className="block text-[0.65rem]" style={{ color: 'var(--muted)' }}>
                        {Number(i.absent_days) > 0 && `${i.absent_days} absent `}
                        {Number(i.half_days) > 0 && `${i.half_days} half `}
                        {Number(i.late_marks) > 0 && `${i.late_marks} late`}
                        {!Number(i.absent_days) && !Number(i.half_days) && !Number(i.late_marks) && 'full'}
                      </span>
                    </td>
                    <td className="text-right tabular-nums" style={{ color: 'var(--red)' }}>
                      {Number(i.deduction_amount) > 0 ? `- ${money(i.deduction_amount)}` : '—'}
                    </td>
                    <td
                      className="text-right tabular-nums font-semibold"
                      style={{ color: 'var(--green)' }}
                    >
                      {money(i.net_amount)}
                    </td>
                    <td>
                      <span className={`pill ${ITEM_STATUS_TONE[i.status] ?? 'pill-muted'}`}>
                        {ITEM_STATUS_LABEL[i.status] ?? i.status}
                      </span>
                      {i.remarks && (
                        <span className="block max-w-32 truncate text-[0.65rem]" style={{ color: 'var(--muted)' }}>
                          {i.remarks}
                        </span>
                      )}
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-1.5">
                        {canWrite && i.status !== 'paid' && (
                          <>
                            <AdjustPanel
                              row={{ ...i, name: staffName(i.staff) }}
                              trigger={{
                                label: 'Adjust',
                                className: 'btn btn-ghost !px-2.5 !py-1',
                              }}
                            />
                            <form action={setItemStatus}>
                              <input type="hidden" name="id" value={i.id} />
                              <input
                                type="hidden"
                                name="status"
                                value={i.status === 'hold' ? 'draft' : 'hold'}
                              />
                              <SubmitButton className="btn btn-ghost !px-2.5 !py-1">
                                {i.status === 'hold' ? 'Release' : 'Hold'}
                              </SubmitButton>
                            </form>
                          </>
                        )}
                        {i.status === 'paid' && (
                          <span className="text-xs" style={{ color: 'var(--muted-2)' }}>
                            paid
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
