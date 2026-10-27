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
  FEE_TYPES,
  FEE_TYPE_LABEL,
  dateLabel,
  effectiveStatus,
  money,
  monthLabel,
  remaining,
  studentName,
} from '@/lib/fee-options'
import { deleteChallan } from '../actions'
import { feePayers } from '../payers'
import PaymentPanel from '../collect/payment-panel'

export const metadata = { title: 'View Challans' }

export default async function ChallansPage({ searchParams }) {
  const params = await searchParams
  const q = (params?.q ?? '').trim()
  const classFilter = params?.class ?? ''
  const typeFilter = params?.type ?? ''
  const statusFilter = params?.status ?? ''

  const { schoolId, permissions, supabase } = await getSchoolContext()
  const payers = await feePayers(supabase, schoolId)
  const canWrite = permissions.has('fees.write')

  const { data: classes } = await supabase
    .from('classes')
    .select('id, name, grade_levels(name, ordinal)')
    .eq('school_id', schoolId)
    .eq('is_deleted', false)

  const classOptions = (classes ?? [])
    .sort((a, b) => (a.grade_levels?.ordinal ?? 999) - (b.grade_levels?.ordinal ?? 999))
    .map((c) => ({ id: c.id, label: c.grade_levels?.name ?? c.name }))
  const classById = new Map(classOptions.map((c) => [c.id, c.label]))

  let query = supabase
    .from('fee_challans')
    .select(
      'id, challan_number, student_id, class_id, fee_type, amount, late_fee, discount, net_amount, total_amount, paid_amount, due_date, issued_date, period_month, status, description, students(first_name, last_name, admission_number)'
    )
    .eq('school_id', schoolId)
    .eq('is_deleted', false)

  if (classFilter) query = query.eq('class_id', classFilter)
  if (typeFilter) query = query.eq('fee_type', typeFilter)

  // The whole challan history is a long list; the newest 500 is what a browser
  // can usefully render, and the filters above narrow it further.
  const { data: challanRows, error } = await query
    .order('issued_date', { ascending: false })
    .limit(500)

  const now = new Date()
  const withStatus = (challanRows ?? []).map((c) => ({ ...c, state: effectiveStatus(c, now) }))

  const needle = q.toLowerCase()
  const challans = withStatus.filter((c) => {
    if (statusFilter && c.state !== statusFilter) return false
    if (!needle) return true
    return [c.challan_number, studentName(c.students), c.students?.admission_number]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(needle))
  })

  const billed = challans
    .filter((c) => c.state !== 'cancelled')
    .reduce((sum, c) => sum + (Number(c.net_amount ?? c.total_amount ?? c.amount) || 0), 0)
  const collected = challans.reduce((sum, c) => sum + (Number(c.paid_amount) || 0), 0)
  const countOf = (state) => challans.filter((c) => c.state === state).length

  const exportRows = challans.map((c, i) => ({
    n: i + 1,
    challan: c.challan_number ?? '',
    student: studentName(c.students),
    klass: classById.get(c.class_id) ?? '',
    type: FEE_TYPE_LABEL[c.fee_type] ?? c.fee_type,
    period: c.period_month ? monthLabel(c.period_month) : '',
    amount: Number(c.amount) || 0,
    late: Number(c.late_fee) || 0,
    discount: Number(c.discount) || 0,
    net: Number(c.net_amount ?? c.total_amount ?? c.amount) || 0,
    paid: Number(c.paid_amount) || 0,
    due: remaining(c),
    issued: c.issued_date ?? '',
    due_date: c.due_date ?? '',
    status: CHALLAN_STATUS_LABEL[c.state] ?? c.state,
  }))

  const filtered = Boolean(q || classFilter || typeFilter || statusFilter)

  // "Print these" has to mean the rows on screen, which is why it carries the
  // filters rather than the ids: a class of forty would put forty UUIDs in
  // the URL, past what some proxies will forward. The free-text search is the
  // exception -- it is applied here in JS, not in the query -- so when
  // somebody has typed one, the ids are sent after all.
  const printParams = new URLSearchParams()
  if (q) {
    printParams.set('ids', challans.slice(0, 200).map((c) => c.id).join(','))
  } else {
    if (classFilter) printParams.set('class', classFilter)
    if (typeFilter) printParams.set('type', typeFilter)
    if (statusFilter) printParams.set('status', statusFilter)
  }
  const printHref = `/school/fees/challans/print?${printParams.toString()}`

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>
            View Challans
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
            Every challan raised · showing the latest {challans.length}
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
              { key: 'period', label: 'Period' },
              { key: 'amount', label: 'Amount' },
              { key: 'late', label: 'Late fee' },
              { key: 'discount', label: 'Discount' },
              { key: 'net', label: 'Net' },
              { key: 'paid', label: 'Paid' },
              { key: 'due', label: 'Remaining' },
              { key: 'issued', label: 'Issued' },
              { key: 'due_date', label: 'Due' },
              { key: 'status', label: 'Status' },
            ]}
            filename="challans"
            title="Fee Challans"
          />
          {challans.length > 0 && (
            <Link href={printHref} className="btn btn-ghost">
              Print {challans.length} challan{challans.length === 1 ? '' : 's'}
            </Link>
          )}
          {canWrite && (
            <Link href="/school/fees/challans/create" className="btn btn-primary">
              + Create Challan
            </Link>
          )}
        </div>
      </div>

      <StatRow>
        <StatCard label="Challans" value={challans.length} tone="brand" icon="▤" />
        <StatCard label="Billed" value={money(billed)} tone="blue" icon="₨" />
        <StatCard
          label="Collected"
          value={money(collected)}
          sub={billed > 0 ? `${Math.round((collected / billed) * 100)}% of billed` : '—'}
          tone="green"
          icon="✓"
        />
        <StatCard
          label="Outstanding"
          value={money(Math.max(0, billed - collected))}
          sub={`${countOf('overdue')} overdue`}
          tone="amber"
          icon="◷"
        />
      </StatRow>

      {/* --------------------------------------------------------- filters */}
      <form className="card flex flex-wrap items-center gap-2 p-3">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search challan no, student, admission no…"
          className="field min-w-56 flex-1"
        />

        <select
          name="class"
          defaultValue={classFilter}
          className="field w-auto min-w-36"
          aria-label="Filter by class"
        >
          <option value="">All classes</option>
          {classOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>

        <select
          name="type"
          defaultValue={typeFilter}
          className="field w-auto min-w-36"
          aria-label="Filter by fee type"
        >
          <option value="">All fee types</option>
          {FEE_TYPES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>

        <select
          name="status"
          defaultValue={statusFilter}
          className="field w-auto min-w-32"
          aria-label="Filter by status"
        >
          <option value="">All status</option>
          {CHALLAN_STATUSES.filter((s) => s.id !== 'pending').map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>

        <button className="btn btn-primary">Search</button>
        {filtered && (
          <Link href="/school/fees/challans" className="btn btn-ghost">
            Clear
          </Link>
        )}
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
            {filtered
              ? 'Try adjusting your filters.'
              : 'Use Create Challan to raise the first one.'}
          </p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table min-w-[68rem]">
            <thead>
              <tr>
                <th>Challan no.</th>
                <th>Student</th>
                <th>Class</th>
                <th>Fee type</th>
                <th>Period</th>
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
                  <td>{classById.get(c.class_id) ?? '—'}</td>
                  <td>
                    <span className="pill pill-brand">
                      {FEE_TYPE_LABEL[c.fee_type] ?? c.fee_type}
                    </span>
                  </td>
                  <td>{c.period_month ? monthLabel(c.period_month) : '—'}</td>
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
                  <td>
                    <div className="flex items-center justify-end gap-1.5">
                      <Link
                        href={`/school/fees/challans/print?id=${c.id}`}
                        className="btn btn-ghost !px-2.5 !py-1"
                        title={`Print ${c.challan_number ?? 'this challan'}`}
                      >
                        Print
                      </Link>
                      <Link
                        href={`/school/fees/student?student=${c.student_id}`}
                        className="btn btn-ghost !px-2.5 !py-1"
                      >
                        Ledger
                      </Link>
                      {canWrite && (
                        <>
                          {c.state !== 'paid' && c.state !== 'cancelled' && (
                            <PaymentPanel
                              students={payers}
                              studentId={c.student_id}
                              trigger={{
                                label: 'Collect',
                                className: 'btn btn-primary !px-2.5 !py-1',
                              }}
                            />
                          )}
                          <form action={deleteChallan}>
                            <input type="hidden" name="id" value={c.id} />
                            <ConfirmButton
                              className="btn btn-danger !px-2.5 !py-1"
                              title={`Remove challan ${c.challan_number ?? ''}?`}
                              message="Payments recorded against it stay on file, but the bill stops counting toward totals."
                              confirmLabel="Remove"
                            >
                              Delete
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
