import Link from 'next/link'
import { getSchoolContext } from '@/lib/school-context'
import ExportButtons from '@/components/export-buttons'
import RefreshButton from '@/components/refresh-button'
import ConfirmButton from '@/components/confirm'
import {
  ADMISSION_STATE_LABEL,
  ADMISSION_STATE_TONE,
  INQUIRY_STATUSES,
  INQUIRY_STATUS_LABEL,
  INQUIRY_STATUS_TONE,
  dateLabel,
} from '@/lib/operations-options'
import { deleteInquiry } from './actions'
import InquiryPanel from './inquiry-panel'

export const metadata = { title: 'Inquiries' }

// The four coloured tiles from the design. Unlike StatCard these carry the
// tone on the card itself, which is what the front desk screens do.
function Tile({ label, value, tone, icon }) {
  const TONES = {
    dark: { bg: 'linear-gradient(135deg, #1e2739 0%, #2d3850 100%)', fg: '#fff' },
    amber: { bg: 'linear-gradient(135deg, #d97706 0%, #f59e0b 100%)', fg: '#fff' },
    blue: { bg: 'linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)', fg: '#fff' },
    green: { bg: 'linear-gradient(135deg, #059669 0%, #10b981 100%)', fg: '#fff' },
    brand: { bg: 'var(--brand-grad)', fg: '#fff' },
  }
  const t = TONES[tone] ?? TONES.dark
  return (
    <div
      className="flex items-start justify-between gap-3 rounded-xl p-4"
      style={{ background: t.bg, color: t.fg }}
    >
      <div>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
        <p className="mt-0.5 text-xs opacity-85">{label}</p>
      </div>
      <span
        className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/20 text-sm"
        aria-hidden="true"
      >
        {icon}
      </span>
    </div>
  )
}

export default async function InquiriesPage({ searchParams }) {
  const params = await searchParams
  const q = (params?.q ?? '').trim()
  const statusFilter = params?.status ?? ''

  const { schoolId, permissions, supabase } = await getSchoolContext()
  const canWrite = permissions.has('frontdesk.write')

  const [{ data: inquiryRows, error }, { data: classes }] = await Promise.all([
    supabase
      .from('inquiries')
      .select(
        'id, name, contact_phone, contact_email, purpose, message, inquiry_date, class_id, internal_notes, admission_status, status'
      )
      .eq('school_id', schoolId)
      .eq('is_deleted', false)
      .order('inquiry_date', { ascending: false })
      .limit(500),
    supabase
      .from('classes')
      .select('id, name, grade_levels(name, ordinal)')
      .eq('school_id', schoolId)
      .eq('is_deleted', false),
  ])

  const classOptions = (classes ?? [])
    .sort((a, b) => (a.grade_levels?.ordinal ?? 999) - (b.grade_levels?.ordinal ?? 999))
    .map((c) => ({ id: c.id, label: c.grade_levels?.name ?? c.name }))
  const classById = new Map(classOptions.map((c) => [c.id, c.label]))

  const allInquiries = inquiryRows ?? []

  // 'open' is the legacy default the column shipped with; it reads as Pending
  // on this screen so old rows do not fall out of every filter.
  const normalised = (s) => (s === 'open' ? 'pending' : s === 'closed' ? 'resolved' : s)

  const needle = q.toLowerCase()
  const inquiries = allInquiries.filter((i) => {
    if (statusFilter && normalised(i.status) !== statusFilter) return false
    if (!needle) return true
    return [i.name, i.purpose ?? i.message, i.contact_phone, i.contact_email]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(needle))
  })

  const countOf = (status) =>
    allInquiries.filter((i) => normalised(i.status) === status).length

  const exportRows = inquiries.map((i, n) => ({
    n: n + 1,
    name: i.name ?? '',
    phone: i.contact_phone ?? '',
    email: i.contact_email ?? '',
    purpose: i.purpose ?? i.message ?? '',
    klass: classById.get(i.class_id) ?? '',
    date: i.inquiry_date ?? '',
    status: INQUIRY_STATUS_LABEL[normalised(i.status)] ?? i.status,
    admission: ADMISSION_STATE_LABEL[i.admission_status] ?? '',
  }))

  const filtered = Boolean(q || statusFilter)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>
            Inquiries
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
            Track and manage front-desk visitor inquiries
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <RefreshButton />
          <ExportButtons
            rows={exportRows}
            columns={[
              { key: 'n', label: 'Sr.' },
              { key: 'name', label: 'Visitor' },
              { key: 'phone', label: 'Phone' },
              { key: 'email', label: 'Email' },
              { key: 'purpose', label: 'Purpose' },
              { key: 'klass', label: 'Class of interest' },
              { key: 'date', label: 'Date' },
              { key: 'status', label: 'Status' },
              { key: 'admission', label: 'Admission' },
            ]}
            filename="inquiries"
            title="Front Desk Inquiries"
          />
          {canWrite && (
            <InquiryPanel
              classes={classOptions}
              trigger={{ label: '+ Add Inquiry', className: 'btn btn-primary' }}
            />
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Total Inquiries" value={allInquiries.length} tone="dark" icon="▤" />
        <Tile label="Pending" value={countOf('pending')} tone="amber" icon="◷" />
        <Tile label="Follow-up" value={countOf('followup')} tone="blue" icon="⟳" />
        <Tile label="Resolved" value={countOf('resolved')} tone="green" icon="✓" />
      </div>

      {/* --------------------------------------------------------- filters */}
      <form className="card flex flex-wrap items-center gap-2 p-3">
        <div className="flex flex-wrap items-center gap-1">
          <Link
            href="/school/frontdesk"
            className={`tab !px-2.5 !py-1 ${!statusFilter ? 'tab-on' : ''}`}
          >
            All
          </Link>
          {INQUIRY_STATUSES.map((s) => (
            <Link
              key={s.id}
              href={`/school/frontdesk?status=${s.id}`}
              className={`tab !px-2.5 !py-1 ${statusFilter === s.id ? 'tab-on' : ''}`}
            >
              {s.label}
            </Link>
          ))}
        </div>

        <input
          name="q"
          defaultValue={q}
          placeholder="Search name, purpose, phone…"
          className="field ml-auto min-w-52 max-w-xs"
        />
        {statusFilter && <input type="hidden" name="status" value={statusFilter} />}
        <button className="btn btn-primary">Search</button>
        {filtered && (
          <Link href="/school/frontdesk" className="btn btn-ghost">
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

      <div className="card overflow-hidden">
        <div
          className="flex items-center justify-between border-b px-4 py-3"
          style={{ borderColor: 'var(--border)' }}
        >
          <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
            All Inquiries{' '}
            <span className="pill pill-muted ml-1">{inquiries.length}</span>
          </p>
          <span className="text-xs" style={{ color: 'var(--muted)' }}>
            Showing {inquiries.length} records
          </span>
        </div>

        {!inquiries.length ? (
          <div className="px-6 py-16 text-center">
            <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
              No inquiries found
            </p>
            <p className="mx-auto mt-1 max-w-sm text-sm" style={{ color: 'var(--muted)' }}>
              {filtered ? 'Try adjusting your filters.' : 'Click "Add Inquiry" to record the first one.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table min-w-[62rem]">
              <thead>
                <tr>
                  <th>Sr</th>
                  <th>Visitor</th>
                  <th>Phone</th>
                  <th>Purpose</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Admission</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {inquiries.map((i, n) => (
                  <tr key={i.id}>
                    <td className="tabular-nums" style={{ color: 'var(--muted)' }}>
                      {n + 1}
                    </td>
                    <td>
                      <span className="font-medium" style={{ color: 'var(--ink)' }}>
                        {i.name ?? '—'}
                      </span>
                      {i.class_id && (
                        <span className="block text-xs" style={{ color: 'var(--muted)' }}>
                          interested in {classById.get(i.class_id)}
                        </span>
                      )}
                    </td>
                    <td>
                      {i.contact_phone ?? '—'}
                      {i.contact_email && (
                        <span className="block text-xs" style={{ color: 'var(--muted)' }}>
                          {i.contact_email}
                        </span>
                      )}
                    </td>
                    <td>
                      <span className="block max-w-56 truncate" style={{ color: 'var(--ink-2)' }}>
                        {i.purpose ?? i.message ?? '—'}
                      </span>
                    </td>
                    <td className="tabular-nums">{dateLabel(i.inquiry_date)}</td>
                    <td>
                      <span
                        className={`pill ${INQUIRY_STATUS_TONE[normalised(i.status)] ?? 'pill-muted'}`}
                      >
                        {INQUIRY_STATUS_LABEL[normalised(i.status)] ?? i.status}
                      </span>
                    </td>
                    <td>
                      {i.admission_status && i.admission_status !== 'none' ? (
                        <span className={`pill ${ADMISSION_STATE_TONE[i.admission_status]}`}>
                          {ADMISSION_STATE_LABEL[i.admission_status]}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-1.5">
                        {canWrite ? (
                          <>
                            <InquiryPanel
                              row={i}
                              classes={classOptions}
                              trigger={{ label: 'Edit', className: 'btn btn-ghost !px-2.5 !py-1' }}
                            />
                            <form action={deleteInquiry}>
                              <input type="hidden" name="id" value={i.id} />
                              <ConfirmButton
                                className="btn btn-danger !px-2.5 !py-1"
                                title={`Remove ${i.name ?? 'this inquiry'}?`}
                                message="The record leaves the inquiry log."
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
    </div>
  )
}
