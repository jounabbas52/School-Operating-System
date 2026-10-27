import Link from 'next/link'
import { getSchoolContext } from '@/lib/school-context'
import { StatCard, StatRow } from '@/components/stats'
import ExportButtons from '@/components/export-buttons'
import RefreshButton from '@/components/refresh-button'
import ConfirmButton from '@/components/confirm'
import {
  CHALLAN_STATUSES,
  CHALLAN_STATUS_LABEL,
  CHALLAN_STATUS_TONE,
  FEE_TYPE_LABEL,
  MONTHS,
  dateLabel,
  effectiveStatus,
  money,
  monthKey,
  monthLabel,
  remaining,
  studentName,
} from '@/lib/fee-options'
import { cancelChallan } from '../actions'
import { feePayers } from '../payers'
import PaymentPanel from './payment-panel'
import BatchPanel from './batch-panel'

export const metadata = { title: 'Collect Fee' }

export default async function CollectFeePage({ searchParams }) {
  const params = await searchParams
  const now = new Date()

  // The screen opens on the current month, because that is the month the
  // counter is collecting. "All" is one click away.
  const year = Number(params?.year) || now.getFullYear()
  const monthParam = params?.month ?? String(now.getMonth() + 1)
  const month = monthParam === 'all' ? 'all' : Number(monthParam) || now.getMonth() + 1

  const q = (params?.q ?? '').trim()
  const classFilter = params?.class ?? ''
  const statusFilter = params?.status ?? ''

  const { schoolId, permissions, supabase } = await getSchoolContext()
  const canWrite = permissions.has('fees.write')

  const [{ data: classes }, { data: sections }] = await Promise.all([
    supabase
      .from('classes')
      .select('id, name, grade_levels(name, ordinal)')
      .eq('school_id', schoolId)
      .eq('is_deleted', false),
    supabase.from('sections').select('id, name').eq('school_id', schoolId).eq('is_deleted', false),
  ])

  const classOptions = (classes ?? [])
    .sort((a, b) => (a.grade_levels?.ordinal ?? 999) - (b.grade_levels?.ordinal ?? 999))
    .map((c) => ({ id: c.id, label: c.grade_levels?.name ?? c.name }))
  const classById = new Map(classOptions.map((c) => [c.id, c.label]))
  const sectionById = new Map((sections ?? []).map((s) => [s.id, s.name]))

  let query = supabase
    .from('fee_challans')
    .select(
      'id, challan_number, student_id, class_id, section_id, fee_type, amount, late_fee, discount, net_amount, total_amount, paid_amount, due_date, period_month, status, description, students(first_name, last_name, admission_number, father_name)'
    )
    .eq('school_id', schoolId)
    .eq('is_deleted', false)

  if (month !== 'all') query = query.eq('period_month', monthKey(year, month))
  if (classFilter) query = query.eq('class_id', classFilter)

  const { data: challanRows, error } = await query.order('due_date', {
    ascending: true,
    nullsFirst: false,
  })

  const withStatus = (challanRows ?? []).map((c) => ({ ...c, state: effectiveStatus(c, now) }))

  // Searching across the student's name needs the joined row, so this filter
  // runs here rather than as a PostgREST `or` against a foreign table.
  const needle = q.toLowerCase()
  const challans = withStatus.filter((c) => {
    if (statusFilter && c.state !== statusFilter) return false
    if (!needle) return true
    return [
      c.challan_number,
      studentName(c.students),
      c.students?.admission_number,
      c.students?.father_name,
    ]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(needle))
  })

  const countOf = (state) => withStatus.filter((c) => c.state === state).length
  const pendingAmount = withStatus
    .filter((c) => c.state !== 'paid' && c.state !== 'cancelled')
    .reduce((sum, c) => sum + remaining(c), 0)

  // Not filtered by the month on screen: a counter looking at October must
  // still be able to take money for June, which is the arrears case.
  const payers = await feePayers(supabase, schoolId)

  const exportRows = challans.map((c, i) => ({
    n: i + 1,
    challan: c.challan_number ?? '',
    student: studentName(c.students),
    klass: classById.get(c.class_id) ?? '',
    type: FEE_TYPE_LABEL[c.fee_type] ?? c.fee_type,
    net: Number(c.net_amount ?? c.total_amount ?? c.amount) || 0,
    paid: Number(c.paid_amount) || 0,
    due: remaining(c),
    due_date: c.due_date ?? '',
    status: CHALLAN_STATUS_LABEL[c.state] ?? c.state,
  }))

  const periodLabel = month === 'all' ? `All of ${year}` : monthLabel(monthKey(year, month))
  const years = [year - 1, year, year + 1]

  // Every link on the period strip keeps the other filters, so switching month
  // does not silently clear a class filter the user set a moment ago.
  const keep = (next) => {
    const sp = new URLSearchParams()
    sp.set('year', String(next.year ?? year))
    sp.set('month', String(next.month ?? month))
    if (classFilter) sp.set('class', classFilter)
    if (statusFilter) sp.set('status', statusFilter)
    if (q) sp.set('q', q)
    return `/school/fees/collect?${sp.toString()}`
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>
            Collect Fee
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
            {periodLabel} · {withStatus.length} challan{withStatus.length === 1 ? '' : 's'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <RefreshButton />
          <ExportButtons
            rows={exportRows}
            columns={[
              { key: 'n', label: '#' },
              { key: 'challan', label: 'Challan no.' },
              { key: 'student', label: 'Student' },
              { key: 'klass', label: 'Class' },
              { key: 'type', label: 'Fee type' },
              { key: 'net', label: 'Net amount' },
              { key: 'paid', label: 'Paid' },
              { key: 'due', label: 'Remaining' },
              { key: 'due_date', label: 'Due date' },
              { key: 'status', label: 'Status' },
            ]}
            filename="fee-collection"
            title="Fee Collection"
            subtitle={periodLabel}
          />
          {canWrite && (
            <>
              {payers.length > 0 && (
                <PaymentPanel
                  students={payers}
                  trigger={{ label: 'Collect Fee', className: 'btn btn-blue' }}
                />
              )}
              <BatchPanel
                classes={classOptions}
                defaultYear={year}
                defaultMonth={month === 'all' ? now.getMonth() + 1 : month}
                trigger={{ label: '+ Generate Challans', className: 'btn btn-primary' }}
              />
            </>
          )}
        </div>
      </div>

      {/* --------------------------------------------------- period strip */}
      <div className="card flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="flex flex-wrap items-center gap-1">
          <span
            className="mr-1 text-[0.68rem] font-bold uppercase tracking-wider"
            style={{ color: 'var(--muted)' }}
          >
            Period:
          </span>
          {MONTHS.map((m) => (
            <Link
              key={m.id}
              href={keep({ month: m.id })}
              className={`tab !px-2.5 !py-1 ${month === m.id ? 'tab-on' : ''}`}
            >
              {m.short}
            </Link>
          ))}
          <Link
            href={keep({ month: 'all' })}
            className={`tab !px-2.5 !py-1 ${month === 'all' ? 'tab-on' : ''}`}
          >
            All
          </Link>
        </div>

        <div className="flex items-center gap-1">
          {years.map((y) => (
            <Link
              key={y}
              href={keep({ year: y })}
              className={`tab !px-2.5 !py-1 ${year === y ? 'tab-on' : ''}`}
            >
              {y}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Total challans" value={withStatus.length} tone="brand" icon="▤" />
        <StatCard label="Paid" value={countOf('paid')} tone="green" icon="✓" />
        <StatCard label="Partial" value={countOf('partial')} tone="blue" icon="◐" />
        <StatCard
          label="Unpaid / overdue"
          value={countOf('open') + countOf('overdue')}
          sub={`${countOf('overdue')} overdue`}
          tone="amber"
          icon="◷"
        />
        <StatCard label="Pending amount" value={money(pendingAmount)} tone="red" icon="₨" />
      </div>

      {/* --------------------------------------------------------- filters */}
      <form className="card flex flex-wrap items-center gap-2 p-3">
        <input type="hidden" name="year" value={year} />
        <input type="hidden" name="month" value={month} />

        <input
          name="q"
          defaultValue={q}
          placeholder="Search student, admission no, challan no…"
          className="field min-w-56 flex-1"
        />

        <select
          name="class"
          defaultValue={classFilter}
          className="field w-auto min-w-36"
          aria-label="Filter by class"
        >
          <option value="">All Classes</option>
          {classOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>

        <select
          name="status"
          defaultValue={statusFilter}
          className="field w-auto min-w-32"
          aria-label="Filter by status"
        >
          <option value="">All Status</option>
          {CHALLAN_STATUSES.filter((s) => s.id !== 'pending').map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>

        <button className="btn btn-primary">Search</button>
        {(q || classFilter || statusFilter) && (
          <Link href={keep({})} className="btn btn-ghost">
            Clear
          </Link>
        )}

        <span className="ml-auto text-xs" style={{ color: 'var(--muted)' }}>
          {challans.length} challan{challans.length === 1 ? '' : 's'}
        </span>
      </form>

      {error && (
        <p
          className="rounded-lg px-3 py-2 text-sm"
          style={{ background: 'var(--red-soft)', color: 'var(--red-ink)' }}
        >
          {error.message}
        </p>
      )}

      {!challans.length ? (
        <div className="card px-6 py-16 text-center" style={{ borderStyle: 'dashed' }}>
          <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            No challans found
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm" style={{ color: 'var(--muted)' }}>
            {q || classFilter || statusFilter
              ? 'Try adjusting your filters.'
              : 'Generate challans for this month to get started.'}
          </p>
          {canWrite && !q && !classFilter && !statusFilter && (
            <div className="mt-4 flex justify-center">
              <BatchPanel
                classes={classOptions}
                defaultYear={year}
                defaultMonth={month === 'all' ? now.getMonth() + 1 : month}
                trigger={{ label: '+ Generate Challans', className: 'btn btn-primary' }}
              />
            </div>
          )}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table min-w-[66rem]">
            <thead>
              <tr>
                <th>Challan no.</th>
                <th>Student</th>
                <th>Class</th>
                <th>Fee type</th>
                <th className="text-right">Net amount</th>
                <th className="text-right">Paid</th>
                <th className="text-right">Remaining</th>
                <th>Due date</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {challans.map((c) => (
                <tr key={c.id}>
                  <td>
                    <span className="pill pill-muted font-mono">{c.challan_number ?? '—'}</span>
                  </td>
                  <td>
                    <span className="font-medium" style={{ color: 'var(--ink)' }}>
                      {studentName(c.students) || '—'}
                    </span>
                    <span className="block text-xs" style={{ color: 'var(--muted)' }}>
                      {c.students?.admission_number ?? '—'}
                    </span>
                  </td>
                  <td>
                    {classById.get(c.class_id) ?? '—'}
                    {c.section_id ? ` – ${sectionById.get(c.section_id) ?? ''}` : ''}
                  </td>
                  <td>
                    <span className="pill pill-brand">
                      {FEE_TYPE_LABEL[c.fee_type] ?? c.fee_type}
                    </span>
                  </td>
                  <td className="text-right tabular-nums">
                    {money(c.net_amount ?? c.total_amount ?? c.amount)}
                    {Number(c.late_fee) > 0 && (
                      <span className="block text-[0.65rem]" style={{ color: 'var(--amber)' }}>
                        incl. {money(c.late_fee)} late fee
                      </span>
                    )}
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
                  <td>
                    <div className="flex items-center justify-end gap-1.5">
                      <Link
                        href={`/school/fees/student?student=${c.student_id}`}
                        className="btn btn-ghost !px-2.5 !py-1"
                      >
                        Ledger
                      </Link>
                      {canWrite && c.state !== 'paid' && c.state !== 'cancelled' && (
                        <>
                          <PaymentPanel
                            students={payers}
                            studentId={c.student_id}
                            trigger={{
                              label: 'Collect',
                              className: 'btn btn-primary !px-2.5 !py-1',
                            }}
                          />
                          <form action={cancelChallan}>
                            <input type="hidden" name="id" value={c.id} />
                            <ConfirmButton
                              className="btn btn-danger !px-2.5 !py-1"
                              title="Cancel this challan?"
                              message="It stops counting toward billed and pending totals. Payments already recorded stay on file."
                              confirmLabel="Cancel challan"
                            >
                              Cancel
                            </ConfirmButton>
                          </form>
                        </>
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
