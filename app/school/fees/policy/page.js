import Link from 'next/link'
import { getSchoolContext } from '@/lib/school-context'
import { StatCard, StatRow } from '@/components/stats'
import SubmitButton from '@/components/submit-button'
import ExportButtons from '@/components/export-buttons'
import RefreshButton from '@/components/refresh-button'
import ConfirmButton from '@/components/confirm'
import { MONTHS, POLICY_COMPONENTS, money } from '@/lib/fee-options'
import { deletePolicy, togglePolicy } from '../actions'
import PolicyPanel from './policy-panel'

export const metadata = { title: 'Fee Policy' }

// The months a component bills, as twelve tiny chips. Cheaper to scan than
// "Jan, Feb, Mar, Apr, May, Jun, Jul, Aug, Sep, Oct, Nov, Dec".
function MonthChips({ months }) {
  const set = new Set(months ?? [])
  if (set.size === 0) {
    return (
      <span className="text-xs" style={{ color: 'var(--muted-2)' }}>
        never
      </span>
    )
  }
  if (set.size === 12) {
    return <span className="pill pill-brand">every month</span>
  }
  return (
    <div className="flex flex-wrap gap-0.5">
      {MONTHS.map((m) => (
        <span
          key={m.id}
          className="rounded px-1 py-0.5 text-[0.58rem] font-semibold"
          style={{
            background: set.has(m.id) ? 'var(--brand)' : 'var(--card-alt)',
            color: set.has(m.id) ? '#fff' : 'var(--muted-2)',
          }}
          title={m.label}
        >
          {m.short}
        </span>
      ))}
    </div>
  )
}

export default async function FeePolicyPage({ searchParams }) {
  const params = await searchParams
  const q = (params?.q ?? '').trim()
  const statusFilter = params?.status ?? ''

  const { schoolId, permissions, supabase } = await getSchoolContext()
  const canWrite = permissions.has('fees.write')

  const [{ data: classes }, { data: sessions }] = await Promise.all([
    supabase
      .from('classes')
      .select('id, name, grade_levels(name, ordinal)')
      .eq('school_id', schoolId)
      .eq('is_deleted', false),
    supabase
      .from('sessions')
      .select('id, name, is_current')
      .eq('school_id', schoolId)
      .eq('is_deleted', false)
      .order('start_date', { ascending: false }),
  ])

  const classOptions = (classes ?? [])
    .sort((a, b) => (a.grade_levels?.ordinal ?? 999) - (b.grade_levels?.ordinal ?? 999))
    .map((c) => ({ id: c.id, label: c.grade_levels?.name ?? c.name }))
  const sessionOptions = (sessions ?? []).map((s) => ({
    id: s.id,
    label: s.name,
    is_current: s.is_current,
  }))
  const classById = new Map(classOptions.map((c) => [c.id, c.label]))

  let query = supabase
    .from('fee_policies')
    .select('*')
    .eq('school_id', schoolId)
    .eq('is_deleted', false)

  if (statusFilter) query = query.eq('status', statusFilter)

  const { data: policyRows, error } = await query.order('created_at', { ascending: false })

  const allPolicies = policyRows ?? []

  const needle = q.toLowerCase()
  const policies = allPolicies.filter((p) => {
    if (!needle) return true
    return [p.name, classById.get(p.class_id)]
      .filter(Boolean)
      .some((v) => v.toLowerCase().includes(needle))
  })

  const totalOf = (p) =>
    POLICY_COMPONENTS.reduce((sum, c) => sum + (Number(p[c.amount]) || 0), 0)

  const activeCount = allPolicies.filter((p) => p.status === 'active').length
  const tuitions = allPolicies.map((p) => Number(p.tuition_fee) || 0).filter((n) => n > 0)
  const avgTuition = tuitions.length ? tuitions.reduce((a, b) => a + b, 0) / tuitions.length : 0

  const exportRows = policies.map((p, i) => ({
    n: i + 1,
    name: p.name,
    klass: classById.get(p.class_id) ?? 'All classes',
    tuition: Number(p.tuition_fee) || 0,
    admission: Number(p.admission_fee) || 0,
    exam: Number(p.exam_fee) || 0,
    transport: Number(p.transport_fee) || 0,
    other: Number(p.other_fee) || 0,
    total: totalOf(p),
    status: p.status === 'active' ? 'Active' : 'Inactive',
  }))

  const filtered = Boolean(q || statusFilter)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>
            Fee Policies
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
            Define and manage fee structures for each class
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <RefreshButton />
          <ExportButtons
            rows={exportRows}
            columns={[
              { key: 'n', label: '#' },
              { key: 'name', label: 'Policy' },
              { key: 'klass', label: 'Class' },
              { key: 'tuition', label: 'Tuition' },
              { key: 'admission', label: 'Admission' },
              { key: 'exam', label: 'Exam' },
              { key: 'transport', label: 'Transport' },
              { key: 'other', label: 'Other' },
              { key: 'total', label: 'Total' },
              { key: 'status', label: 'Status' },
            ]}
            filename="fee-policies"
            title="Fee Policies"
          />
          {canWrite && (
            <PolicyPanel
              classes={classOptions}
              sessions={sessionOptions}
              trigger={{ label: '+ Add Policy', className: 'btn btn-primary' }}
            />
          )}
        </div>
      </div>

      <StatRow>
        <StatCard label="Total policies" value={allPolicies.length} tone="brand" icon="▤" />
        <StatCard label="Active" value={activeCount} tone="green" icon="✓" />
        <StatCard
          label="Inactive"
          value={allPolicies.length - activeCount}
          tone="blue"
          icon="◌"
        />
        <StatCard
          label="Avg tuition fee"
          value={money(avgTuition)}
          sub={tuitions.length ? `across ${tuitions.length} policies` : 'none set'}
          tone="amber"
          icon="₨"
        />
      </StatRow>

      {/* --------------------------------------------------------- filters */}
      <form className="card flex flex-wrap items-center gap-2 p-3">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search by policy name or class…"
          className="field min-w-56 flex-1"
        />
        <select
          name="status"
          defaultValue={statusFilter}
          className="field w-auto min-w-32"
          aria-label="Filter by status"
        >
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <button className="btn btn-primary">Search</button>
        {filtered && (
          <Link href="/school/fees/policy" className="btn btn-ghost">
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

      {!policies.length ? (
        <div className="card px-6 py-16 text-center" style={{ borderStyle: 'dashed' }}>
          <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            No policies found
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm" style={{ color: 'var(--muted)' }}>
            {filtered
              ? 'Try adjusting your filters.'
              : 'A fee policy is what Monthly Batch bills from — set one up per class.'}
          </p>
          {!filtered && !classOptions.length && (
            <Link href="/school/academics/classes" className="btn btn-primary mt-4">
              Go to Classes
            </Link>
          )}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table min-w-[68rem]">
            <thead>
              <tr>
                <th>Policy name</th>
                <th>Class</th>
                <th className="text-right">Tuition fee</th>
                <th className="text-right">Admission fee</th>
                <th className="text-right">Exam fee</th>
                <th className="text-right">Transport</th>
                <th className="text-right">Total</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {policies.map((p) => (
                <tr key={p.id}>
                  <td>
                    <span className="font-medium" style={{ color: 'var(--ink)' }}>
                      {p.name}
                    </span>
                    <span className="mt-1 block">
                      <MonthChips months={p.tuition_months} />
                    </span>
                  </td>
                  <td>
                    <span className="pill pill-brand">
                      {classById.get(p.class_id) ?? 'All classes'}
                    </span>
                  </td>
                  <td className="text-right tabular-nums">{money(p.tuition_fee)}</td>
                  <td className="text-right tabular-nums">{money(p.admission_fee)}</td>
                  <td className="text-right tabular-nums">{money(p.exam_fee)}</td>
                  <td className="text-right tabular-nums">{money(p.transport_fee)}</td>
                  <td className="text-right tabular-nums font-semibold" style={{ color: 'var(--ink)' }}>
                    {money(totalOf(p))}
                  </td>
                  <td>
                    <span className={`pill ${p.status === 'active' ? 'pill-green' : 'pill-muted'}`}>
                      {p.status === 'active' ? '● Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <div className="flex items-center justify-end gap-1.5">
                      {canWrite ? (
                        <>
                          <form action={togglePolicy}>
                            <input type="hidden" name="id" value={p.id} />
                            <input
                              type="hidden"
                              name="status"
                              value={p.status === 'active' ? 'inactive' : 'active'}
                            />
                            <SubmitButton className="btn btn-ghost !px-2.5 !py-1">
                              {p.status === 'active' ? 'Deactivate' : 'Activate'}
                            </SubmitButton>
                          </form>
                          <PolicyPanel
                            row={p}
                            classes={classOptions}
                            sessions={sessionOptions}
                            trigger={{ label: 'Edit', className: 'btn btn-ghost !px-2.5 !py-1' }}
                          />
                          <form action={deletePolicy}>
                            <input type="hidden" name="id" value={p.id} />
                            <ConfirmButton
                              className="btn btn-danger !px-2.5 !py-1"
                              title={`Remove ${p.name}?`}
                              message="Challans already raised from it keep their figures — a policy is read once, at generation."
                              confirmLabel="Remove"
                            >
                              Delete
                            </ConfirmButton>
                          </form>
                        </>
                      ) : (
                        <span className="text-xs" style={{ color: 'var(--muted-2)' }}>
                          read only
                        </span>
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
