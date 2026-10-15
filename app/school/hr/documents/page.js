import Link from 'next/link'
import { getSchoolContext } from '@/lib/school-context'
import { StatCard, StatRow } from '@/components/stats'
import ExportButtons from '@/components/export-buttons'
import RefreshButton from '@/components/refresh-button'
import ConfirmButton from '@/components/confirm'
import {
  DOC_STATUS_LABEL,
  DOC_STATUS_TONE,
  DOC_TYPES,
  DOC_TYPE_LABEL,
  EXPIRY_WARNING_DAYS,
  documentStatus,
  staffName,
} from '@/lib/staff-options'
import { deleteDocument } from '../actions'
import DocumentPanel from './document-panel'

export const metadata = { title: 'Staff Documents' }

export default async function StaffDocumentsPage({ searchParams }) {
  const params = await searchParams
  const q = (params?.q ?? '').trim()
  const type = DOC_TYPES.some((t) => t.id === params?.type) ? params.type : ''

  const { schoolId, permissions, supabase } = await getSchoolContext()
  const canWrite = permissions.has('staff.write')

  const [{ data: staff }, { data: documents, error }] = await Promise.all([
    supabase
      .from('staff')
      .select('id, staff_number, first_name, last_name, designation')
      .eq('school_id', schoolId)
      .eq('is_deleted', false)
      .order('first_name'),
    supabase
      .from('staff_documents')
      .select('id, staff_id, doc_type, doc_number, issue_date, expiry_date, status, notes')
      .eq('school_id', schoolId)
      .eq('is_deleted', false)
      // Nulls last, so the things that can expire lead the register.
      .order('expiry_date', { ascending: true, nullsFirst: false }),
  ])

  const staffOptions = (staff ?? []).map((s) => ({
    id: s.id,
    label: `${staffName(s)}${s.staff_number ? ` · ${s.staff_number}` : ''}`,
    name: staffName(s),
    staff_number: s.staff_number,
    designation: s.designation,
  }))
  const staffById = new Map(staffOptions.map((s) => [s.id, s]))

  // Effective status is computed once, here, so the pills, the stat cards and
  // the export all agree on what "expiring soon" means today.
  const all = (documents ?? []).map((d) => ({ ...d, effective: documentStatus(d) }))

  const counts = {
    '': all.length,
    ...Object.fromEntries(DOC_TYPES.map((t) => [t.id, all.filter((d) => d.doc_type === t.id).length])),
  }

  const needle = q.toLowerCase()
  const rows = all.filter((d) => {
    if (type && d.doc_type !== type) return false
    if (!needle) return true
    const person = staffById.get(d.staff_id)
    return (
      (person?.name ?? '').toLowerCase().includes(needle) ||
      (person?.staff_number ?? '').toLowerCase().includes(needle) ||
      (d.doc_number ?? '').toLowerCase().includes(needle)
    )
  })

  const validCount = all.filter((d) => d.effective === 'valid').length
  const expiringCount = all.filter((d) => d.effective === 'expiring_soon').length
  const expiredCount = all.filter((d) => d.effective === 'expired').length

  const exportRows = rows.map((d, i) => ({
    n: i + 1,
    name: staffById.get(d.staff_id)?.name ?? '—',
    staff_number: staffById.get(d.staff_id)?.staff_number ?? '',
    doc_type: DOC_TYPE_LABEL[d.doc_type] ?? d.doc_type,
    doc_number: d.doc_number ?? '',
    issue_date: d.issue_date ?? '',
    expiry_date: d.expiry_date ?? '',
    status: DOC_STATUS_LABEL[d.effective] ?? d.effective,
    notes: d.notes ?? '',
  }))

  const tabHref = (id) => {
    const search = new URLSearchParams()
    if (id) search.set('type', id)
    if (q) search.set('q', q)
    const string = search.toString()
    return string ? `/school/hr/documents?${string}` : '/school/hr/documents'
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>
            Staff Documents
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
            {all.length} document{all.length === 1 ? '' : 's'} on file ·{' '}
            {expiringCount + expiredCount} need attention
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <RefreshButton />
          <ExportButtons
            rows={exportRows}
            columns={[
              { key: 'n', label: '#' },
              { key: 'name', label: 'Staff member' },
              { key: 'staff_number', label: 'Staff ID' },
              { key: 'doc_type', label: 'Doc type' },
              { key: 'doc_number', label: 'Doc number' },
              { key: 'issue_date', label: 'Issued' },
              { key: 'expiry_date', label: 'Expires' },
              { key: 'status', label: 'Status' },
              { key: 'notes', label: 'Notes' },
            ]}
            filename="staff-documents"
            title="Staff Documents"
            subtitle={type ? DOC_TYPE_LABEL[type] : 'All documents'}
          />
          {canWrite && staffOptions.length > 0 && (
            <DocumentPanel
              staff={staffOptions}
              trigger={{ label: '+ Add Document', className: 'btn btn-primary' }}
            />
          )}
        </div>
      </div>

      <StatRow>
        <StatCard label="Total documents" value={all.length} tone="brand" />
        <StatCard label="Valid" value={validCount} tone="green" />
        <StatCard
          label="Expiring soon"
          value={expiringCount}
          sub={`within ${EXPIRY_WARNING_DAYS} days`}
          tone="amber"
        />
        <StatCard label="Expired" value={expiredCount} tone="red" />
      </StatRow>

      {/* ---------------------------------------------------- tabs + search */}
      <div className="card flex flex-wrap items-center gap-2 p-3">
        <div className="flex flex-wrap items-center gap-1">
          {[{ id: '', label: 'All' }, ...DOC_TYPES].map((tab) => (
            <Link
              key={tab.id || 'all'}
              href={tabHref(tab.id)}
              className={`tab ${type === tab.id ? 'tab-on' : ''}`}
            >
              {tab.label} <span className="tabular-nums opacity-70">({counts[tab.id] ?? 0})</span>
            </Link>
          ))}
        </div>

        <form className="flex flex-1 flex-wrap items-center gap-2">
          {type && <input type="hidden" name="type" value={type} />}
          <input
            name="q"
            defaultValue={q}
            placeholder="Search staff, doc number…"
            className="field min-w-56 flex-1"
          />
          <button className="btn btn-primary">Search</button>
          {(q || type) && (
            <Link href="/school/hr/documents" className="btn btn-ghost">
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
            No documents found
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm" style={{ color: 'var(--muted)' }}>
            {q || type
              ? 'Try adjusting your filters.'
              : staffOptions.length
                ? 'Use Add Document to start the register.'
                : 'Add staff first — a document belongs to an employee.'}
          </p>
          {!staffOptions.length && (
            <Link href="/school/hr" className="btn btn-primary mt-4">
              Go to All Staff
            </Link>
          )}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table min-w-[60rem]">
            <thead>
              <tr>
                <th>#</th>
                <th>Staff member</th>
                <th>Doc type</th>
                <th>Doc number</th>
                <th>Issued</th>
                <th>Expires</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d, i) => {
                const person = staffById.get(d.staff_id)
                return (
                  <tr key={d.id}>
                    <td className="tabular-nums" style={{ color: 'var(--muted)' }}>
                      {i + 1}
                    </td>
                    <td>
                      <span className="font-medium" style={{ color: 'var(--ink)' }}>
                        {person?.name ?? '—'}
                      </span>
                      <span className="block font-mono text-xs" style={{ color: 'var(--muted)' }}>
                        {person?.staff_number ?? '—'}
                      </span>
                    </td>
                    <td>
                      <span className="pill pill-brand">
                        {DOC_TYPE_LABEL[d.doc_type] ?? d.doc_type}
                      </span>
                    </td>
                    <td className="font-mono text-xs">{d.doc_number ?? '—'}</td>
                    <td className="tabular-nums">{d.issue_date ?? '—'}</td>
                    <td className="tabular-nums">{d.expiry_date ?? 'No expiry'}</td>
                    <td>
                      <span className={`pill ${DOC_STATUS_TONE[d.effective] ?? 'pill-muted'}`}>
                        {DOC_STATUS_LABEL[d.effective] ?? d.effective}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-1.5">
                        {canWrite ? (
                          <>
                            <DocumentPanel
                              row={d}
                              staff={staffOptions}
                              trigger={{ label: 'Edit', className: 'btn btn-ghost !px-2.5 !py-1' }}
                            />
                            <form action={deleteDocument}>
                              <input type="hidden" name="id" value={d.id} />
                              <ConfirmButton
                                className="btn btn-danger !px-2.5 !py-1"
                                title="Delete this document?"
                                message={`${DOC_TYPE_LABEL[d.doc_type] ?? 'This document'} for ${
                                  person?.name ?? 'this staff member'
                                } will be removed from the register.`}
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
