import Link from 'next/link'
import { getSchoolContext } from '@/lib/school-context'
import ExportButtons from '@/components/export-buttons'
import RefreshButton from '@/components/refresh-button'
import {
  CHALLAN_STATUS_LABEL,
  CHALLAN_STATUS_TONE,
  FEE_METHOD_LABEL,
  FEE_TYPE_LABEL,
  dateLabel,
  effectiveStatus,
  money,
  monthLabel,
  remaining,
  studentName,
} from '@/lib/fee-options'
import PaymentPanel from '../collect/payment-panel'

export const metadata = { title: 'Student Fee Search' }

export default async function StudentFeeSearchPage({ searchParams }) {
  const params = await searchParams
  const q = (params?.q ?? '').trim()
  const studentId = params?.student ?? ''

  const { schoolId, permissions, supabase } = await getSchoolContext()
  const canWrite = permissions.has('fees.write')

  // Nothing is fetched until someone searches: this screen opens on a search
  // box, and loading nine hundred students to show an empty state is waste.
  let matches = []
  if (q && !studentId) {
    const { data } = await supabase
      .from('students')
      .select(
        'id, first_name, last_name, father_name, admission_number, roll_number, current_class_id, current_section_id'
      )
      .eq('school_id', schoolId)
      .eq('is_deleted', false)
      .or(
        `first_name.ilike.%${q}%,last_name.ilike.%${q}%,admission_number.ilike.%${q}%,father_name.ilike.%${q}%`
      )
      .order('first_name')
      .limit(25)
    matches = data ?? []
  }

  let student = null
  let challans = []
  let payments = []
  let policy = null

  if (studentId) {
    const { data } = await supabase
      .from('students')
      .select(
        'id, first_name, last_name, father_name, admission_number, roll_number, final_fee, base_fee, current_class_id, current_section_id'
      )
      .eq('id', studentId)
      .maybeSingle()
    student = data ?? null

    if (student) {
      const [{ data: challanRows }, { data: paymentRows }, { data: policyRow }] = await Promise.all([
        supabase
          .from('fee_challans')
          .select(
            'id, challan_number, fee_type, amount, late_fee, discount, net_amount, total_amount, paid_amount, due_date, period_month, status, description'
          )
          .eq('school_id', schoolId)
          .eq('is_deleted', false)
          .eq('student_id', student.id)
          .order('period_month', { ascending: false, nullsFirst: false })
          .order('due_date', { ascending: false }),
        supabase
          .from('fee_payments')
          .select('id, challan_id, amount_paid, paid_at, method, receipt_no, reference')
          .eq('school_id', schoolId)
          .eq('is_deleted', false)
          .eq('student_id', student.id)
          .order('paid_at', { ascending: false }),
        supabase
          .from('fee_policies')
          .select('id, name, tuition_fee')
          .eq('school_id', schoolId)
          .eq('is_deleted', false)
          .eq('status', 'active')
          .eq('class_id', student.current_class_id)
          .maybeSingle(),
      ])
      challans = challanRows ?? []
      payments = paymentRows ?? []
      policy = policyRow ?? null
    }
  }

  const [{ data: classes }, { data: sections }] = await Promise.all([
    supabase
      .from('classes')
      .select('id, name, grade_levels(name, ordinal)')
      .eq('school_id', schoolId)
      .eq('is_deleted', false),
    supabase.from('sections').select('id, name').eq('school_id', schoolId).eq('is_deleted', false),
  ])

  const classById = new Map(
    (classes ?? []).map((c) => [c.id, c.grade_levels?.name ?? c.name])
  )
  const sectionById = new Map((sections ?? []).map((s) => [s.id, s.name]))

  const now = new Date()
  const ledger = challans.map((c) => ({ ...c, state: effectiveStatus(c, now) }))

  const billed = ledger
    .filter((c) => c.state !== 'cancelled')
    .reduce((sum, c) => sum + (Number(c.net_amount ?? c.total_amount ?? c.amount) || 0), 0)
  const collected = ledger.reduce((sum, c) => sum + (Number(c.paid_amount) || 0), 0)
  const due = Math.max(0, billed - collected)

  const exportRows = ledger.map((c, i) => ({
    n: i + 1,
    challan: c.challan_number ?? '',
    period: c.period_month ? monthLabel(c.period_month) : '',
    type: FEE_TYPE_LABEL[c.fee_type] ?? c.fee_type,
    amount: Number(c.net_amount ?? c.total_amount ?? c.amount) || 0,
    paid: Number(c.paid_amount) || 0,
    due: remaining(c),
    due_date: c.due_date ?? '',
    status: CHALLAN_STATUS_LABEL[c.state] ?? c.state,
  }))

  const openChallans = ledger
    .filter((c) => c.state !== 'paid' && c.state !== 'cancelled')
    .map((c) => ({
      id: c.id,
      label: `${c.challan_number ?? 'Challan'} · ${FEE_TYPE_LABEL[c.fee_type] ?? c.fee_type} · ${money(remaining(c))} due`,
      outstanding: remaining(c),
    }))

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>
            Student Fee Search
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
            Search a student by name to view and manage their fee ledger.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RefreshButton />
          {student && (
            <ExportButtons
              rows={exportRows}
              columns={[
                { key: 'n', label: '#' },
                { key: 'challan', label: 'Challan no.' },
                { key: 'period', label: 'Period' },
                { key: 'type', label: 'Fee type' },
                { key: 'amount', label: 'Amount' },
                { key: 'paid', label: 'Paid' },
                { key: 'due', label: 'Due' },
                { key: 'due_date', label: 'Due date' },
                { key: 'status', label: 'Status' },
              ]}
              filename={`fee-ledger-${student.admission_number ?? student.id.slice(0, 8)}`}
              title={`Fee Ledger — ${studentName(student)}`}
            />
          )}
        </div>
      </div>

      {!student ? (
        <>
          <div className="card flex flex-col items-center gap-4 px-6 py-12 text-center">
            <span
              className="flex size-14 items-center justify-center rounded-2xl text-xl text-white"
              style={{ background: 'var(--brand-grad)' }}
              aria-hidden="true"
            >
              ⌕
            </span>
            <div>
              <p className="text-base font-semibold" style={{ color: 'var(--ink)' }}>
                Student Search &amp; Fee Management
              </p>
              <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
                Search a student by name to view and manage their fee ledger.
              </p>
            </div>

            <form className="flex w-full max-w-xl items-center gap-2">
              <input
                name="q"
                defaultValue={q}
                autoFocus
                placeholder="Search by student name, ID, or father's name…"
                className="field flex-1"
              />
              <button className="btn btn-primary">Search</button>
            </form>
          </div>

          {q && (
            <div className="card overflow-hidden">
              <div
                className="border-b px-4 py-3"
                style={{ borderColor: 'var(--border)', background: 'var(--card-alt)' }}
              >
                <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                  {matches.length} match{matches.length === 1 ? '' : 'es'} for “{q}”
                </p>
              </div>

              {!matches.length ? (
                <p className="px-6 py-12 text-center text-sm" style={{ color: 'var(--muted)' }}>
                  No students match that search.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="table min-w-[42rem]">
                    <thead>
                      <tr>
                        <th>Student</th>
                        <th>Father</th>
                        <th>Admission no.</th>
                        <th>Class</th>
                        <th className="text-right">Open</th>
                      </tr>
                    </thead>
                    <tbody>
                      {matches.map((s) => (
                        <tr key={s.id}>
                          <td>
                            <span className="font-medium" style={{ color: 'var(--ink)' }}>
                              {studentName(s)}
                            </span>
                          </td>
                          <td>{s.father_name ?? '—'}</td>
                          <td>
                            <span className="pill pill-muted font-mono">
                              {s.admission_number ?? '—'}
                            </span>
                          </td>
                          <td>
                            {classById.get(s.current_class_id) ?? '—'}
                            {s.current_section_id
                              ? ` – ${sectionById.get(s.current_section_id) ?? ''}`
                              : ''}
                          </td>
                          <td className="text-right">
                            <Link
                              href={`/school/fees/student?student=${s.id}`}
                              className="btn btn-ghost !px-2.5 !py-1"
                            >
                              View ledger
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          <Link
            href="/school/fees/student"
            className="flex w-fit items-center gap-1.5 text-sm"
            style={{ color: 'var(--brand-ink)' }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Back to search
          </Link>

          {/* ------------------------------------------------ student card */}
          <div className="card flex flex-wrap items-center gap-6 p-5">
            <span
              className="flex size-12 shrink-0 items-center justify-center rounded-xl text-base font-bold text-white"
              style={{ background: 'var(--brand-grad)' }}
              aria-hidden="true"
            >
              {(studentName(student)[0] ?? '?').toUpperCase()}
            </span>

            {[
              { label: 'Student Name', value: studentName(student) },
              { label: 'Father Name', value: student.father_name ?? '—' },
              {
                label: 'Class & Section',
                value:
                  (classById.get(student.current_class_id) ?? '—') +
                  (student.current_section_id
                    ? ` – ${sectionById.get(student.current_section_id) ?? ''}`
                    : ''),
              },
              { label: 'Roll Number', value: student.roll_number ?? '—' },
              { label: 'Monthly Fee', value: money(student.final_fee ?? student.base_fee) },
            ].map((f) => (
              <div key={f.label} className="min-w-28">
                <p className="text-xs" style={{ color: 'var(--muted)' }}>
                  {f.label}
                </p>
                <p className="mt-0.5 text-sm font-medium" style={{ color: 'var(--ink)' }}>
                  {f.value}
                </p>
              </div>
            ))}

            <div className="ml-auto flex items-center gap-2">
              {canWrite && openChallans.length > 0 && (
                <PaymentPanel
                  challans={openChallans}
                  trigger={{ label: 'Collect Fee', className: 'btn btn-primary' }}
                />
              )}
            </div>
          </div>

          {!policy && (
            <p
              className="rounded-xl px-4 py-3 text-sm"
              style={{ background: 'var(--amber-soft)', color: 'var(--amber-ink)' }}
            >
              No active Fee Policy found for{' '}
              {classById.get(student.current_class_id) ?? 'this class'}. Set one up under Fees →{' '}
              <Link href="/school/fees/policy" className="underline">
                Fee Policy
              </Link>{' '}
              before generating challans.
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { label: 'Total billed', value: money(billed), tone: 'var(--ink)' },
              { label: 'Total paid', value: money(collected), tone: 'var(--green)' },
              { label: 'Outstanding', value: money(due), tone: due > 0 ? 'var(--red)' : 'var(--muted)' },
            ].map((s) => (
              <div key={s.label} className="card p-4">
                <p className="text-xs" style={{ color: 'var(--muted)' }}>
                  {s.label}
                </p>
                <p className="mt-1 text-xl font-semibold tabular-nums" style={{ color: s.tone }}>
                  {s.value}
                </p>
              </div>
            ))}
          </div>

          {/* ---------------------------------------------------- ledger */}
          <div className="card overflow-hidden">
            <div
              className="flex items-center justify-between border-b px-4 py-3"
              style={{ borderColor: 'var(--border)', background: 'var(--card-alt)' }}
            >
              <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                Fee Ledger
              </p>
              <span className="text-xs" style={{ color: 'var(--muted)' }}>
                {ledger.length} period{ledger.length === 1 ? '' : 's'}
              </span>
            </div>

            {!ledger.length ? (
              <p className="px-6 py-14 text-center text-sm" style={{ color: 'var(--muted)' }}>
                No scheduled fee periods yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="table min-w-[52rem]">
                  <thead>
                    <tr>
                      <th>Challan no.</th>
                      <th>Period</th>
                      <th>Fee type</th>
                      <th className="text-right">Amount</th>
                      <th className="text-right">Paid</th>
                      <th className="text-right">Due</th>
                      <th>Due date</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <span className="pill pill-muted font-mono">
                            {c.challan_number ?? '—'}
                          </span>
                        </td>
                        <td>{c.period_month ? monthLabel(c.period_month) : '—'}</td>
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
              </div>
            )}
          </div>

          {/* ------------------------------------------- payment history */}
          <div className="card overflow-hidden">
            <div
              className="flex items-center justify-between border-b px-4 py-3"
              style={{ borderColor: 'var(--border)', background: 'var(--card-alt)' }}
            >
              <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                Payment History
              </p>
              <span className="text-xs" style={{ color: 'var(--muted)' }}>
                {payments.length} payment{payments.length === 1 ? '' : 's'}
              </span>
            </div>

            {!payments.length ? (
              <p className="px-6 py-14 text-center text-sm" style={{ color: 'var(--muted)' }}>
                No payments recorded yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="table min-w-[40rem]">
                  <thead>
                    <tr>
                      <th>Receipt no.</th>
                      <th>Date</th>
                      <th>Method</th>
                      <th>Reference</th>
                      <th className="text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <span className="pill pill-muted font-mono">{p.receipt_no ?? '—'}</span>
                        </td>
                        <td className="tabular-nums">
                          {p.paid_at ? dateLabel(p.paid_at.slice(0, 10)) : '—'}
                        </td>
                        <td>{FEE_METHOD_LABEL[p.method] ?? p.method}</td>
                        <td>{p.reference ?? '—'}</td>
                        <td className="text-right tabular-nums" style={{ color: 'var(--green)' }}>
                          {money(p.amount_paid)}
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
    </div>
  )
}
