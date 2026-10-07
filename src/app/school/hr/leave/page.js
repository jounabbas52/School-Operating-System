import Link from 'next/link'
import { getSchoolContext } from '@/lib/school-context'
import { StatCard, StatRow } from '@/components/stats'
import ExportButtons from '@/components/export-buttons'
import ConfirmButton from '@/components/confirm'
import {
  LEAVE_STATUSES,
  LEAVE_STATUS_LABEL,
  LEAVE_STATUS_TONE,
  LEAVE_TYPE_LABEL,
  staffName,
} from '@/lib/staff-options'
import { deleteLeave, setLeaveStatus } from '../actions'
import LeavePanel from './leave-panel'

export const metadata = { title: 'Leave Management' }

export default async function LeavePage({ searchParams }) {
  const params = await searchParams
  const q = (params?.q ?? '').trim()
  const status = LEAVE_STATUSES.some((s) => s.id === params?.status) ? params.status : ''

  const { schoolId, permissions, supabase } = await getSchoolContext()
  const canWrite = permissions.has('hr.write')

  const [{ data: staff }, { data: leaves, error }] = await Promise.all([
    supabase
      .from('staff')
      .select('id, staff_number, first_name, last_name, designation')
      .eq('school_id', schoolId)
      .eq('is_deleted', false)
      .order('first_name'),
    supabase
      .from('leave_requests')
      .select('id, staff_id, leave_type, from_date, to_date, days, reason, status, reviewed_at')
      .eq('school_id', schoolId)
      .eq('is_deleted', false)
      .not('staff_id', 'is', null)
      .order('from_date', { ascending: false }),
  ])

  const staffOptions = (staff ?? []).map((s) => ({
    id: s.id,
    label: staffName(s),
    staff_number: s.staff_number,
    designation: s.designation,
  }))
  const staffById = new Map(staffOptions.map((s) => [s.id, s]))

  const all = leaves ?? []

  // Counts sit on the tabs, so they are taken before the tab filter is applied
  // -- a tab that filtered its own count would always read the same number.
  const counts = {
    '': all.length,
    ...Object.fromEntries(
      LEAVE_STATUSES.map((s) => [s.id, all.filter((l) => l.status === s.id).length])
    ),
  }

  // The staff name is on another table, so searching it in Postgres would mean
  // an embedded filter. The list is one school's leave register, not a feed --
  // filtering the fetched rows is both simpler and exact.
  const needle = q.toLowerCase()
  const rows = all.filter((l) => {
    if (status && l.status !== status) return false
    if (!needle) return true
    const person = staffById.get(l.staff_id)
    return (
      (person?.label ?? '').toLowerCase().includes(needle) ||
      (person?.staff_number ?? '').toLowerCase().includes(needle) ||
      (LEAVE_TYPE_LABEL[l.leave_type] ?? '').toLowerCase().includes(needle)
    )
  })

  const exportRows = rows.map((l, i) => ({
    n: i + 1,
    name: staffById.get(l.staff_id)?.label ?? '—',
    staff_number: staffById.get(l.staff_id)?.staff_number ?? '',
    leave_type: LEAVE_TYPE_LABEL[l.leave_type] ?? l.leave_type,
    from_date: l.from_date ?? '',
    to_date: l.to_date ?? '',
    days: l.days ?? '',
    reason: l.reason ?? '',
    status: LEAVE_STATUS_LABEL[l.status] ?? l.status,
  }))

  const tabHref = (id) => {
    const search = new URLSearchParams()
    if (id) search.set('status', id)
    if (q) search.set('q', q)
    const string = search.toString()
    return string ? `/school/hr/leave?${string}` : '/school/hr/leave'
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>
            Leave Management
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
            {counts[''] } application{counts[''] === 1 ? '' : 's'} on file · {counts.pending} awaiting review
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ExportButtons
            rows={exportRows}
            columns={[
              { key: 'n', label: '#' },
              { key: 'name', label: 'Staff member' },
              { key: 'staff_number', label: 'Staff ID' },
              { key: 'leave_type', label: 'Leave type' },
              { key: 'from_date', label: 'From' },
              { key: 'to_date', label: 'To' },
              { key: 'days', label: 'Days' },
              { key: 'reason', label: 'Reason' },
              { key: 'status', label: 'Status' },
            ]}
            filename="leave-register"
            title="Leave Register"
            subtitle={status ? LEAVE_STATUS_LABEL[status] : 'All applications'}
          />
          {canWrite && staffOptions.length > 0 && (
            <LeavePanel
              staff={staffOptions}
              trigger={{ label: '+ Add Leave', className: 'btn btn-primary' }}
            />
          )}
        </div>
      </div>

      <StatRow>
        <StatCard label="Total leaves" value={counts['']} tone="brand" />
        <StatCard label="Pending review" value={counts.pending} tone="amber" />
        <StatCard label="Approved" value={counts.approved} tone="green" />
        <StatCard label="Rejected" value={counts.rejected} tone="red" />
      </StatRow>

      {/* ---------------------------------------------------- tabs + search */}
      <div className="card flex flex-wrap items-center gap-2 p-3">
        <div className="flex flex-wrap items-center gap-1">
          {[{ id: '', label: 'All' }, ...LEAVE_STATUSES].map((tab) => (
            <Link
              key={tab.id || 'all'}
              href={tabHref(tab.id)}
              className={`tab ${status === tab.id ? 'tab-on' : ''}`}
            >
              {tab.label}{' '}
              <span className="tabular-nums opacity-70">({counts[tab.id] ?? 0})</span>
            </Link>
          ))}
        </div>

        <form className="flex flex-1 flex-wrap items-center gap-2">
          {status && <input type="hidden" name="status" value={status} />}
          <input
            name="q"
            defaultValue={q}
            placeholder="Search staff, type…"
            className="field min-w-56 flex-1"
          />
          <button className="btn btn-primary">Search</button>
          {(q || status) && (
            <Link href="/school/hr/leave" className="btn btn-ghost">
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
            No leave records found
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm" style={{ color: 'var(--muted)' }}>
            {q || status
              ? 'Try adjusting your filters.'
              : staffOptions.length
                ? 'Use Add Leave to file the first application.'
                : 'Add staff first — a leave application is filed against an employee.'}
          </p>
          {!staffOptions.length && (
            <Link href="/school/hr" className="btn btn-primary mt-4">
              Go to All Staff
            </Link>
          )}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table min-w-[62rem]">
            <thead>
              <tr>
                <th>#</th>
                <th>Staff member</th>
                <th>Leave type</th>
                <th>From</th>
                <th>To</th>
                <th className="text-right">Days</th>
                <th>Reason</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l, i) => {
                const person = staffById.get(l.staff_id)
                return (
                  <tr key={l.id}>
                    <td className="tabular-nums" style={{ color: 'var(--muted)' }}>
                      {i + 1}
                    </td>
                    <td>
                      <span className="font-medium" style={{ color: 'var(--ink)' }}>
                        {person?.label ?? '—'}
                      </span>
                      <span className="block font-mono text-xs" style={{ color: 'var(--muted)' }}>
                        {person?.staff_number ?? '—'}
                      </span>
                    </td>
                    <td>
                      <span className="pill pill-brand">
                        {LEAVE_TYPE_LABEL[l.leave_type] ?? l.leave_type}
                      </span>
                    </td>
                    <td className="tabular-nums">{l.from_date ?? '—'}</td>
                    <td className="tabular-nums">{l.to_date ?? '—'}</td>
                    <td className="text-right tabular-nums">{l.days ?? '—'}</td>
                    <td>
                      <span
                        className="line-clamp-2 max-w-[16rem] text-xs"
                        style={{ color: 'var(--muted)' }}
                      >
                        {l.reason || '—'}
                      </span>
                    </td>
                    <td>
                      <span className={`pill ${LEAVE_STATUS_TONE[l.status] ?? 'pill-muted'}`}>
                        {LEAVE_STATUS_LABEL[l.status] ?? l.status}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-1.5">
                        {canWrite ? (
                          <>
                            {/* One click to decide, rather than opening the
                                panel to change a single field. */}
                            {l.status === 'pending' && (
                              <>
                                <form action={setLeaveStatus}>
                                  <input type="hidden" name="id" value={l.id} />
                                  <input type="hidden" name="status" value="approved" />
                                  <button className="btn btn-green !px-2.5 !py-1">Approve</button>
                                </form>
                                <form action={setLeaveStatus}>
                                  <input type="hidden" name="id" value={l.id} />
                                  <input type="hidden" name="status" value="rejected" />
                                  <button className="btn btn-danger !px-2.5 !py-1">Reject</button>
                                </form>
                              </>
                            )}
                            <LeavePanel
                              row={l}
                              staff={staffOptions}
                              trigger={{ label: 'Edit', className: 'btn btn-ghost !px-2.5 !py-1' }}
                            />
                            <form action={deleteLeave}>
                              <input type="hidden" name="id" value={l.id} />
                              <ConfirmButton
                                className="btn btn-danger !px-2.5 !py-1"
                                title="Delete this leave application?"
                                message={`${person?.label ?? 'This staff member'}'s ${
                                  LEAVE_TYPE_LABEL[l.leave_type] ?? 'leave'
                                } from ${l.from_date} to ${l.to_date} will be removed from the register.`}
                                confirmLabel="Delete"
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
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
