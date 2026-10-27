import Link from 'next/link'
import { getSchoolContext } from '@/lib/school-context'
import { StatCard, StatRow } from '@/components/stats'
import ExportButtons from '@/components/export-buttons'
import RefreshButton from '@/components/refresh-button'
import ConfirmButton from '@/components/confirm'
import { signedPhotoUrls, STAFF_PHOTOS } from '@/lib/storage'
import {
  STAFF_STATUS_LABEL as STATUS_LABEL,
  STAFF_STATUS_TONE as STATUS_TONE,
  money,
  staffName as fullName,
} from '@/lib/staff-options'
import { deleteTeacher } from './actions'
import TeacherPanel from './teacher-panel'

export const metadata = { title: 'Teacher Management' }

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

export default async function TeachersPage({ searchParams }) {
  const params = await searchParams
  const q = (params?.q ?? '').trim()
  const subjectFilter = params?.subject ?? ''
  const statusFilter = params?.status ?? ''

  const { schoolId, permissions, supabase } = await getSchoolContext()
  const canWrite = permissions.has('staff.write')

  const [{ data: subjects }, { data: designations }, { data: nextNumber }] = await Promise.all([
    supabase
      .from('subjects')
      .select('id, name')
      .eq('school_id', schoolId)
      .eq('is_deleted', false)
      .order('name'),
    supabase
      .from('salary_structures')
      .select('id, name, basic_salary')
      .eq('school_id', schoolId)
      .eq('is_deleted', false)
      .eq('status', 'active')
      .order('name'),
    supabase.rpc('next_staff_number', { p_school: schoolId, p_prefix: 'TCH' }),
  ])

  const subjectOptions = (subjects ?? []).map((s) => ({ id: s.id, label: s.name }))
  const designationOptions = (designations ?? []).map((d) => ({
    id: d.id,
    label: d.name,
    basic_salary: d.basic_salary,
  }))

  let query = supabase
    .from('staff')
    .select(
      'id, staff_number, first_name, last_name, subject_id, qualification, salary_structure_id, designation, department, employment_type, monthly_salary, hire_date, phone, work_phone, emergency_contact, work_email, cnic, gender, date_of_birth, blood_group, experience_years, address, notes, status, photo_url, signature_url, stamp_url'
    )
    .eq('school_id', schoolId)
    .eq('is_deleted', false)
    .eq('staff_type', 'teaching')

  if (subjectFilter) query = query.eq('subject_id', subjectFilter)
  if (statusFilter) query = query.eq('status', statusFilter)
  if (q) {
    // The four things an office actually has to hand when looking someone up.
    query = query.or(
      `first_name.ilike.%${q}%,last_name.ilike.%${q}%,staff_number.ilike.%${q}%,work_email.ilike.%${q}%`
    )
  }

  const { data: teachers, error } = await query.order('first_name')

  // One batched call rather than one per row -- signing serially is a visible
  // stall on a full staff list.
  // Photographs, signatures and stamps all live in the same private bucket,
  // so one call signs the lot -- three separate batches would be three round
  // trips for the same list of rows.
  const photoUrls = await signedPhotoUrls(
    supabase,
    (teachers ?? []).flatMap((t) => [t.photo_url, t.signature_url, t.stamp_url]),
    3600,
    STAFF_PHOTOS
  )

  const subjectById = new Map((subjects ?? []).map((s) => [s.id, s.name]))

  const rows = teachers ?? []
  const activeCount = rows.filter((t) => t.status === 'active').length
  const subjectsCovered = new Set(rows.map((t) => t.subject_id).filter(Boolean)).size

  // Averaged over teachers who actually have a figure on file, so one blank
  // record does not drag the number down.
  const paid = rows.map((t) => Number(t.monthly_salary)).filter((n) => Number.isFinite(n) && n > 0)
  const avgSalary = paid.length ? paid.reduce((a, b) => a + b, 0) / paid.length : 0

  const exportRows = rows.map((t, i) => ({
    n: i + 1,
    staff_number: t.staff_number ?? '',
    name: fullName(t),
    subject: subjectById.get(t.subject_id) ?? '',
    designation: t.designation ?? '',
    qualification: t.qualification ?? '',
    contact: t.phone ?? '',
    email: t.work_email ?? '',
    hire_date: t.hire_date ?? '',
    salary: t.monthly_salary ?? '',
    status: STATUS_LABEL[t.status] ?? t.status,
  }))

  const filtered = Boolean(q || subjectFilter || statusFilter)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>
            Teacher Management
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
            {rows.length} total teacher{rows.length === 1 ? '' : 's'} · {activeCount} active
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <RefreshButton />
          <ExportButtons
            rows={exportRows}
            columns={[
              { key: 'n', label: '#' },
              { key: 'staff_number', label: 'Teacher ID' },
              { key: 'name', label: 'Name' },
              { key: 'subject', label: 'Subject' },
              { key: 'designation', label: 'Designation' },
              { key: 'qualification', label: 'Qualification' },
              { key: 'contact', label: 'Contact' },
              { key: 'email', label: 'Email' },
              { key: 'hire_date', label: 'Joined' },
              { key: 'salary', label: 'Salary (Rs.)' },
              { key: 'status', label: 'Status' },
            ]}
            filename="teachers"
            title="Teacher Management"
            subtitle={`${rows.length} teachers · ${activeCount} active`}
          />
          {canWrite && subjectOptions.length > 0 && (
            <TeacherPanel
              subjects={subjectOptions}
              designations={designationOptions}
              nextStaffNumber={nextNumber ?? 'TCH-001'}
              schoolId={schoolId}
              trigger={{ label: '+ Add Teacher', className: 'btn btn-primary' }}
            />
          )}
        </div>
      </div>

      <StatRow>
        <StatCard label="Total teachers" value={rows.length} tone="brand" />
        <StatCard label="Active" value={activeCount} tone="green" />
        <StatCard label="Subjects covered" value={subjectsCovered} tone="amber" />
        <StatCard
          label="Avg. salary"
          value={money(avgSalary)}
          sub={paid.length ? `across ${paid.length} on payroll` : 'no salaries on file'}
          tone="blue"
        />
      </StatRow>

      {/* --------------------------------------------------------- filters */}
      <form className="card flex flex-wrap items-center gap-2 p-3">
        <select
          name="subject"
          defaultValue={subjectFilter}
          className="field w-auto min-w-44"
          aria-label="Filter by subject"
        >
          <option value="">All subjects</option>
          {subjectOptions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>

        <select
          name="status"
          defaultValue={statusFilter}
          className="field w-auto min-w-36"
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>

        <input
          name="q"
          defaultValue={q}
          placeholder="Search by name, teacher ID or email…"
          className="field min-w-56 flex-1"
        />

        <button className="btn btn-primary">Search</button>
        {filtered && (
          <Link href="/school/teachers" className="btn btn-ghost">
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

      {!rows.length ? (
        <div className="card px-6 py-16 text-center" style={{ borderStyle: 'dashed' }}>
          <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            {filtered ? 'No teachers match those filters' : 'No teachers found'}
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm" style={{ color: 'var(--muted)' }}>
            {filtered
              ? 'Try adjusting your filters, or add a new teacher.'
              : subjectOptions.length
                ? 'Use Add Teacher to register the first one.'
                : 'Create subjects first — a teacher is hired against a specialization.'}
          </p>
          {!subjectOptions.length && (
            <Link href="/school/academics/subjects" className="btn btn-primary mt-4">
              Go to Subjects
            </Link>
          )}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table min-w-[62rem]">
            <thead>
              <tr>
                <th>Teacher ID</th>
                <th>Name</th>
                <th>Subject</th>
                <th>Contact</th>
                <th>Joined</th>
                <th className="text-right">Salary</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id}>
                  <td>
                    <span className="pill pill-muted font-mono">{t.staff_number ?? '—'}</span>
                  </td>
                  <td>
                    <div className="flex items-center gap-2.5">
                      <Avatar name={fullName(t)} />
                      <div className="min-w-0">
                        <span className="font-medium" style={{ color: 'var(--ink)' }}>
                          {fullName(t)}
                        </span>
                        <span className="block text-xs" style={{ color: 'var(--muted)' }}>
                          {t.designation ?? t.qualification ?? '—'}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="pill pill-brand">
                      {subjectById.get(t.subject_id) ?? '—'}
                    </span>
                  </td>
                  <td>
                    <span style={{ color: 'var(--ink-2)' }}>{t.phone ?? '—'}</span>
                    <span className="block text-xs" style={{ color: 'var(--muted)' }}>
                      {t.work_email ?? '—'}
                    </span>
                  </td>
                  <td className="tabular-nums">{t.hire_date ?? '—'}</td>
                  <td className="text-right tabular-nums">{money(t.monthly_salary)}</td>
                  <td>
                    <span className={`pill ${STATUS_TONE[t.status] ?? 'pill-muted'}`}>
                      {t.status === 'active' ? '● ' : ''}
                      {STATUS_LABEL[t.status] ?? t.status}
                    </span>
                  </td>
                  <td>
                    <div className="flex items-center justify-end gap-1.5">
                      {canWrite ? (
                        <>
                          <TeacherPanel
                            row={t}
                            subjects={subjectOptions}
                            designations={designationOptions}
                            nextStaffNumber={nextNumber ?? 'TCH-001'}
                            schoolId={schoolId}
                            photoUrl={photoUrls.get(t.photo_url) ?? null}
                            signatureUrl={photoUrls.get(t.signature_url) ?? null}
                            stampUrl={photoUrls.get(t.stamp_url) ?? null}
                            trigger={{ label: 'Edit', className: 'btn btn-ghost !px-2.5 !py-1' }}
                          />
                          <form action={deleteTeacher}>
                            <input type="hidden" name="id" value={t.id} />
                            <ConfirmButton
                              className="btn btn-danger !px-2.5 !py-1"
                              title={`Remove ${fullName(t)}?`}
                              message="Marked inactive rather than erased — their attendance, payroll and salary history stay intact."
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
