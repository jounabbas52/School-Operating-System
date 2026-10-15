import Link from 'next/link'
import { getSchoolContext } from '@/lib/school-context'
import { StatCard, StatRow } from '@/components/stats'
import ExportButtons from '@/components/export-buttons'
import RefreshButton from '@/components/refresh-button'
import ConfirmButton from '@/components/confirm'
import {
  PAYMENT_MODE_LABEL,
  STAFF_STATUS_LABEL,
  STAFF_STATUS_TONE,
  STAFF_TYPES,
  STAFF_TYPE_LABEL,
  money,
  staffName,
} from '@/lib/staff-options'
import { deleteStaff } from './actions'
import StaffPanel from './staff-panel'

export const metadata = { title: 'All Staff' }

const TABS = [{ id: '', label: 'All' }, ...STAFF_TYPES]

function Avatar({ name }) {
  const letters = (name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()
  return (
    <span
      className="flex size-8 shrink-0 items-center justify-center rounded-full text-[0.65rem] font-bold text-white"
      style={{ background: 'var(--brand-grad)' }}
      aria-hidden="true"
    >
      {letters}
    </span>
  )
}

export default async function AllStaffPage({ searchParams }) {
  const params = await searchParams
  const q = (params?.q ?? '').trim()
  const type = STAFF_TYPES.some((t) => t.id === params?.type) ? params.type : ''

  const { schoolId, permissions, supabase } = await getSchoolContext()
  const canWrite = permissions.has('staff.write')

  // The prefix follows the tab, so adding an administrator from the
  // Administration tab does not hand them a TCH- number.
  const prefix = type === 'admin' ? 'ADM' : type === 'support' ? 'SUP' : 'TCH'

  let query = supabase
    .from('staff')
    .select(
      'id, staff_number, first_name, last_name, staff_type, designation, department, employment_type, hire_date, monthly_salary, phone, work_email, cnic, address, payment_mode, bank_name, account_title, account_number, status'
    )
    .eq('school_id', schoolId)
    .eq('is_deleted', false)

  if (type) query = query.eq('staff_type', type)
  if (q) {
    query = query.or(
      `first_name.ilike.%${q}%,last_name.ilike.%${q}%,staff_number.ilike.%${q}%,designation.ilike.%${q}%,work_email.ilike.%${q}%`
    )
  }

  const [{ data: staff, error }, { data: nextNumber }, { count: totalAll }] = await Promise.all([
    query.order('first_name'),
    supabase.rpc('next_staff_number', { p_school: schoolId, p_prefix: prefix }),
    supabase
      .from('staff')
      .select('id', { count: 'exact', head: true })
      .eq('school_id', schoolId)
      .eq('is_deleted', false),
  ])

  const rows = staff ?? []
  const activeCount = rows.filter((s) => s.status === 'active').length
  const onLeaveCount = rows.filter((s) => s.status === 'on_leave').length
  // Everything that is neither working nor temporarily away: resigned,
  // terminated, suspended, inactive. One number the office actually asks for.
  const inactiveCount = rows.length - activeCount - onLeaveCount

  const exportRows = rows.map((s, i) => ({
    n: i + 1,
    staff_number: s.staff_number ?? '',
    name: staffName(s),
    designation: s.designation ?? '',
    type: STAFF_TYPE_LABEL[s.staff_type] ?? s.staff_type ?? '',
    department: s.department ?? '',
    phone: s.phone ?? '',
    email: s.work_email ?? '',
    hire_date: s.hire_date ?? '',
    salary: s.monthly_salary ?? '',
    payment_mode: PAYMENT_MODE_LABEL[s.payment_mode] ?? s.payment_mode ?? '',
    bank: [s.bank_name, s.account_number].filter(Boolean).join(' · '),
    status: STAFF_STATUS_LABEL[s.status] ?? s.status,
  }))

  const tabHref = (id) => {
    const search = new URLSearchParams()
    if (id) search.set('type', id)
    if (q) search.set('q', q)
    const string = search.toString()
    return string ? `/school/hr?${string}` : '/school/hr'
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>
            Staff
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
            {rows.length} staff member{rows.length === 1 ? '' : 's'}
            {type ? ` in ${STAFF_TYPE_LABEL[type]}` : ''} · {activeCount} active
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <RefreshButton />
          <ExportButtons
            rows={exportRows}
            columns={[
              { key: 'n', label: '#' },
              { key: 'staff_number', label: 'Staff ID' },
              { key: 'name', label: 'Staff member' },
              { key: 'designation', label: 'Designation' },
              { key: 'type', label: 'Type' },
              { key: 'department', label: 'Department' },
              { key: 'phone', label: 'Phone' },
              { key: 'email', label: 'Email' },
              { key: 'hire_date', label: 'Joined' },
              { key: 'salary', label: 'Salary (Rs.)' },
              { key: 'payment_mode', label: 'Paid by' },
              { key: 'bank', label: 'Bank account' },
              { key: 'status', label: 'Status' },
            ]}
            filename={type ? `staff-${type}` : 'staff'}
            title="Staff"
            subtitle={type ? STAFF_TYPE_LABEL[type] : 'All staff'}
          />
          {canWrite && (
            <StaffPanel
              nextStaffNumber={nextNumber ?? `${prefix}-001`}
              defaultType={type || 'teaching'}
              trigger={{ label: '+ Add Staff', className: 'btn btn-primary' }}
            />
          )}
        </div>
      </div>

      <StatRow>
        <StatCard label="Total staff" value={totalAll ?? rows.length} tone="brand" />
        <StatCard label="Active" value={activeCount} tone="green" />
        <StatCard label="On leave" value={onLeaveCount} tone="amber" />
        <StatCard label="Inactive" value={inactiveCount} tone="red" />
      </StatRow>

      {/* ---------------------------------------------------- tabs + search */}
      <div className="card flex flex-wrap items-center gap-2 p-3">
        <div className="flex flex-wrap items-center gap-1">
          {TABS.map((tab) => (
            <Link
              key={tab.id || 'all'}
              href={tabHref(tab.id)}
              className={`tab ${type === tab.id ? 'tab-on' : ''}`}
            >
              {tab.label}
            </Link>
          ))}
        </div>

        <form className="flex flex-1 flex-wrap items-center gap-2">
          {type && <input type="hidden" name="type" value={type} />}
          <input
            name="q"
            defaultValue={q}
            placeholder="Search staff by name, ID or designation…"
            className="field min-w-56 flex-1"
          />
          <button className="btn btn-primary">Search</button>
          {(q || type) && (
            <Link href="/school/hr" className="btn btn-ghost">
              Clear
            </Link>
          )}
        </form>
      </div>

      {error && (
        <p
          className="rounded-lg px-3 py-2 text-sm"
          style={{ background: 'var(--red-soft)', color: 'var(--red-ink)' }}
        >
          {error.message}
        </p>
      )}

      {!rows.length ? (
        <div className="card px-6 py-16 text-center" style={{ borderStyle: 'dashed' }}>
          <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            No staff found
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm" style={{ color: 'var(--muted)' }}>
            {q || type
              ? 'Try adjusting your filters, or add a new staff member.'
              : 'Add the first staff member to start the register.'}
          </p>
          {canWrite && (
            <div className="mt-4 flex justify-center">
              <StaffPanel
                nextStaffNumber={nextNumber ?? `${prefix}-001`}
                defaultType={type || 'teaching'}
                trigger={{ label: '+ Add First Staff Member', className: 'btn btn-primary' }}
              />
            </div>
          )}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table min-w-[64rem]">
            <thead>
              <tr>
                <th>Staff member</th>
                <th>Designation</th>
                <th>Department</th>
                <th>Contact</th>
                <th>Joined</th>
                <th className="text-right">Salary</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td>
                    <div className="flex items-center gap-2.5">
                      <Avatar name={staffName(s)} />
                      <div className="min-w-0">
                        <span className="font-medium" style={{ color: 'var(--ink)' }}>
                          {staffName(s)}
                        </span>
                        <span className="block font-mono text-xs" style={{ color: 'var(--muted)' }}>
                          {s.staff_number ?? '—'}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td>{s.designation ?? '—'}</td>
                  <td>
                    <span className="pill pill-brand">
                      {s.department ?? STAFF_TYPE_LABEL[s.staff_type] ?? '—'}
                    </span>
                  </td>
                  <td>
                    <span style={{ color: 'var(--ink-2)' }}>{s.phone ?? '—'}</span>
                    <span className="block text-xs" style={{ color: 'var(--muted)' }}>
                      {s.work_email ?? '—'}
                    </span>
                  </td>
                  <td className="tabular-nums">{s.hire_date ?? '—'}</td>
                  <td className="text-right tabular-nums">
                    {money(s.monthly_salary)}
                    <span className="block text-xs" style={{ color: 'var(--muted)' }}>
                      {PAYMENT_MODE_LABEL[s.payment_mode] ?? '—'}
                    </span>
                  </td>
                  <td>
                    <span className={`pill ${STAFF_STATUS_TONE[s.status] ?? 'pill-muted'}`}>
                      {s.status === 'active' ? '● ' : ''}
                      {STAFF_STATUS_LABEL[s.status] ?? s.status}
                    </span>
                  </td>
                  <td>
                    <div className="flex items-center justify-end gap-1.5">
                      {canWrite ? (
                        <>
                          <StaffPanel
                            row={s}
                            nextStaffNumber={nextNumber ?? `${prefix}-001`}
                            trigger={{ label: 'Edit', className: 'btn btn-ghost !px-2.5 !py-1' }}
                          />
                          <form action={deleteStaff}>
                            <input type="hidden" name="id" value={s.id} />
                            <ConfirmButton
                              className="btn btn-danger !px-2.5 !py-1"
                              title={`Remove ${staffName(s)}?`}
                              message="Marked inactive rather than erased — their attendance, leave, documents and payroll history stay intact."
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
