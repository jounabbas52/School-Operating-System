import Link from 'next/link'
import { getSchoolContext } from '@/lib/school-context'
import ExportButtons from '@/components/export-buttons'
import SubmitButton from '@/components/submit-button'
import RefreshButton from '@/components/refresh-button'
import ConfirmButton from '@/components/confirm'
import {
  COMPLAINT_CATEGORY_LABEL,
  COMPLAINT_STATUSES,
  COMPLAINT_STATUS_LABEL,
  COMPLAINT_STATUS_TONE,
  PRIORITY_LABEL,
  PRIORITY_TONE,
  dateLabel,
  studentName,
} from '@/lib/operations-options'
import { deleteComplaint, setComplaintStatus } from '../actions'
import ComplaintPanel from './complaint-panel'

export const metadata = { title: 'Complaints' }

function Tile({ label, value, tone }) {
  const TONES = {
    dark: 'linear-gradient(135deg, #1e2739 0%, #2d3850 100%)',
    amber: 'linear-gradient(135deg, #d97706 0%, #f59e0b 100%)',
    blue: 'linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)',
    green: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
  }
  return (
    <div className="rounded-xl p-4 text-white" style={{ background: TONES[tone] ?? TONES.dark }}>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs opacity-85">{label}</p>
    </div>
  )
}

export default async function ComplaintsPage({ searchParams }) {
  const params = await searchParams
  const q = (params?.q ?? '').trim()
  const statusFilter = params?.status ?? ''

  const { schoolId, permissions, supabase } = await getSchoolContext()
  const canWrite = permissions.has('frontdesk.write')

  const [{ data: complaintRows, error }, { data: students }] = await Promise.all([
    supabase
      .from('complaints')
      .select(
        'id, complainant, relation, student_id, subject, description, category, priority, complaint_date, status, resolution, phone, students(first_name, last_name, admission_number)'
      )
      .eq('school_id', schoolId)
      .eq('is_deleted', false)
      .order('complaint_date', { ascending: false })
      .limit(500),
    supabase
      .from('students')
      .select('id, first_name, last_name, admission_number')
      .eq('school_id', schoolId)
      .eq('is_deleted', false)
      .eq('status', 'active')
      .order('first_name'),
  ])

  const allComplaints = complaintRows ?? []

  const studentOptions = (students ?? []).map((s) => ({
    id: s.id,
    label: `${studentName(s)}${s.admission_number ? ` · ${s.admission_number}` : ''}`,
  }))

  const needle = q.toLowerCase()
  const complaints = allComplaints.filter((c) => {
    if (statusFilter && c.status !== statusFilter) return false
    if (!needle) return true
    return [c.complainant, c.subject, studentName(c.students), c.description]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(needle))
  })

  const countOf = (status) => allComplaints.filter((c) => c.status === status).length

  const exportRows = complaints.map((c, i) => ({
    n: i + 1,
    complainant: c.complainant,
    relation: c.relation ?? '',
    student: studentName(c.students),
    subject: c.subject,
    category: COMPLAINT_CATEGORY_LABEL[c.category] ?? c.category,
    priority: PRIORITY_LABEL[c.priority] ?? c.priority,
    date: c.complaint_date ?? '',
    status: COMPLAINT_STATUS_LABEL[c.status] ?? c.status,
  }))

  const filtered = Boolean(q || statusFilter)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>
            Complaints
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
            {allComplaints.length} recorded · {countOf('pending')} pending
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <RefreshButton />
          <ExportButtons
            rows={exportRows}
            columns={[
              { key: 'n', label: 'Sr' },
              { key: 'complainant', label: 'Complainant' },
              { key: 'relation', label: 'Relation' },
              { key: 'student', label: 'Student' },
              { key: 'subject', label: 'Subject' },
              { key: 'category', label: 'Category' },
              { key: 'priority', label: 'Priority' },
              { key: 'date', label: 'Date' },
              { key: 'status', label: 'Status' },
            ]}
            filename="complaints"
            title="Complaints"
          />
          {canWrite && (
            <ComplaintPanel
              students={studentOptions}
              trigger={{ label: '+ Add Complaint', className: 'btn btn-primary' }}
            />
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Total" value={allComplaints.length} tone="dark" />
        <Tile label="Pending" value={countOf('pending')} tone="amber" />
        <Tile label="In Progress" value={countOf('in_progress')} tone="blue" />
        <Tile label="Resolved" value={countOf('resolved') + countOf('closed')} tone="green" />
      </div>

      {/* --------------------------------------------------------- filters */}
      <form className="card flex flex-wrap items-center gap-2 p-3">
        <div className="flex flex-wrap items-center gap-1">
          <Link
            href="/school/frontdesk/complaints"
            className={`tab !px-2.5 !py-1 ${!statusFilter ? 'tab-on' : ''}`}
          >
            All
          </Link>
          {COMPLAINT_STATUSES.map((s) => (
            <Link
              key={s.id}
              href={`/school/frontdesk/complaints?status=${s.id}`}
              className={`tab !px-2.5 !py-1 ${statusFilter === s.id ? 'tab-on' : ''}`}
            >
              {s.label}
            </Link>
          ))}
        </div>

        <input
          name="q"
          defaultValue={q}
          placeholder="Search complainant or subject…"
          className="field ml-auto min-w-52 max-w-xs"
        />
        {statusFilter && <input type="hidden" name="status" value={statusFilter} />}
        <button className="btn btn-primary">Search</button>
      </form>

      {error && (
        <p
          className="rounded-lg px-3 py-2 text-sm"
          style={{ background: 'var(--red-soft)', color: 'var(--red-ink)' }}
        >
          {error.message}
        </p>
      )}

      {!complaints.length ? (
        <div className="card px-6 py-16 text-center" style={{ borderStyle: 'dashed' }}>
          <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            No complaints found.
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm" style={{ color: 'var(--muted)' }}>
            {filtered ? 'Try adjusting your filters.' : 'Click "Add Complaint" to record one.'}
          </p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table min-w-[68rem]">
            <thead>
              <tr>
                <th>Sr</th>
                <th>Complainant</th>
                <th>Relation</th>
                <th>Student</th>
                <th>Subject</th>
                <th>Category</th>
                <th>Priority</th>
                <th>Date</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {complaints.map((c, i) => (
                <tr key={c.id}>
                  <td className="tabular-nums" style={{ color: 'var(--muted)' }}>
                    {i + 1}
                  </td>
                  <td>
                    <span className="font-medium" style={{ color: 'var(--ink)' }}>
                      {c.complainant}
                    </span>
                    {c.phone && (
                      <span className="block text-xs" style={{ color: 'var(--muted)' }}>
                        {c.phone}
                      </span>
                    )}
                  </td>
                  <td>{c.relation ?? '—'}</td>
                  <td>{studentName(c.students) || '—'}</td>
                  <td>
                    <span className="block max-w-56 truncate" style={{ color: 'var(--ink-2)' }}>
                      {c.subject}
                    </span>
                  </td>
                  <td>
                    <span className="pill pill-brand">
                      {COMPLAINT_CATEGORY_LABEL[c.category] ?? c.category}
                    </span>
                  </td>
                  <td>
                    <span className={`pill ${PRIORITY_TONE[c.priority] ?? 'pill-muted'}`}>
                      {PRIORITY_LABEL[c.priority] ?? c.priority}
                    </span>
                  </td>
                  <td className="tabular-nums">{dateLabel(c.complaint_date)}</td>
                  <td>
                    <span className={`pill ${COMPLAINT_STATUS_TONE[c.status] ?? 'pill-muted'}`}>
                      {COMPLAINT_STATUS_LABEL[c.status] ?? c.status}
                    </span>
                  </td>
                  <td>
                    <div className="flex items-center justify-end gap-1.5">
                      {canWrite ? (
                        <>
                          {c.status === 'pending' && (
                            <form action={setComplaintStatus}>
                              <input type="hidden" name="id" value={c.id} />
                              <input type="hidden" name="status" value="in_progress" />
                              <SubmitButton pendingLabel="Starting…" className="btn btn-blue !px-2.5 !py-1">
                                Start
                              </SubmitButton>
                            </form>
                          )}
                          {(c.status === 'pending' || c.status === 'in_progress') && (
                            <form action={setComplaintStatus}>
                              <input type="hidden" name="id" value={c.id} />
                              <input type="hidden" name="status" value="resolved" />
                              <SubmitButton pendingLabel="Resolving…" className="btn btn-primary !px-2.5 !py-1">
                                Resolve
                              </SubmitButton>
                            </form>
                          )}
                          <ComplaintPanel
                            row={c}
                            students={studentOptions}
                            trigger={{ label: 'Edit', className: 'btn btn-ghost !px-2.5 !py-1' }}
                          />
                          <form action={deleteComplaint}>
                            <input type="hidden" name="id" value={c.id} />
                            <ConfirmButton
                              className="btn btn-danger !px-2.5 !py-1"
                              title={`Remove this complaint?`}
                              message="It leaves the complaints log entirely."
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
