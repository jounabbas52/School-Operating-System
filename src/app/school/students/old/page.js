import Link from 'next/link'
import { getSchoolContext } from '@/lib/school-context'
import { StatCard, StatRow } from '@/components/ui'
import ExportButtons from '@/components/export-buttons'
import { setStudentStatus } from '../actions'

export const metadata = { title: 'Old Students' }

const fullName = (s) => [s.first_name, s.last_name].filter(Boolean).join(' ')
const fmt = (d) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const STATUS_PILL = {
  graduated: 'pill pill-blue',
  transferred: 'pill pill-amber',
  inactive: 'pill pill-muted',
  suspended: 'pill pill-red',
}

export default async function OldStudentsPage({ searchParams }) {
  const params = await searchParams
  const q = (params?.q ?? '').trim()
  const statusFilter = params?.status ?? ''
  const classFilter = params?.class ?? ''

  const { schoolId, permissions, supabase } = await getSchoolContext()
  const canWrite = permissions.has('students.write')

  const [{ data: classes }, { data: sections }] = await Promise.all([
    supabase
      .from('classes')
      .select('id, name, grade_levels(name, ordinal)')
      .eq('school_id', schoolId)
      .eq('is_deleted', false),
    supabase
      .from('sections')
      .select('id, name')
      .eq('school_id', schoolId)
      .eq('is_deleted', false),
  ])

  // Anyone who is not currently studying here.
  const LEFT = ['graduated', 'transferred', 'inactive', 'suspended']

  let query = supabase
    .from('students')
    .select(
      'id, first_name, last_name, father_name, admission_number, status, admission_date, left_on, current_class_id, current_section_id, father_mobile'
    )
    .eq('school_id', schoolId)
    .eq('is_deleted', false)
    .in('status', statusFilter ? [statusFilter] : LEFT)

  if (classFilter) query = query.eq('current_class_id', classFilter)
  if (q) {
    query = query.or(
      `first_name.ilike.%${q}%,last_name.ilike.%${q}%,father_name.ilike.%${q}%,admission_number.ilike.%${q}%`
    )
  }

  const { data: students, error } = await query.order('first_name')

  const classById = new Map(
    (classes ?? []).map((c) => [c.id, c.grade_levels?.name ?? c.name])
  )
  const sectionById = new Map((sections ?? []).map((s) => [s.id, s.name]))

  const label = (s) =>
    [classById.get(s.current_class_id), sectionById.get(s.current_section_id)]
      .filter(Boolean)
      .join(' · ') || '—'

  // Counts come from the unfiltered set, so the tiles do not change as you
  // narrow the table beneath them.
  const { data: allLeft } = await supabase
    .from('students')
    .select('status')
    .eq('school_id', schoolId)
    .eq('is_deleted', false)
    .in('status', LEFT)

  const count = (status) => (allLeft ?? []).filter((s) => s.status === status).length

  const classOptions = (classes ?? []).sort(
    (a, b) => (a.grade_levels?.ordinal ?? 999) - (b.grade_levels?.ordinal ?? 999)
  )

  const exportRows = (students ?? []).map((s) => ({
    name: fullName(s),
    father_name: s.father_name ?? '',
    klass: label(s),
    admission_number: s.admission_number ?? '',
    status: s.status,
    admitted: fmt(s.admission_date),
    left: fmt(s.left_on),
  }))

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>
            Old Students
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
            Graduated, transferred and inactive records — kept for certificates and history.
          </p>
        </div>

        <ExportButtons
          rows={exportRows}
          columns={[
            { key: 'name', label: 'Student' },
            { key: 'father_name', label: 'Father name' },
            { key: 'klass', label: 'Last class' },
            { key: 'admission_number', label: 'Adm. no' },
            { key: 'status', label: 'Status' },
            { key: 'admitted', label: 'Admitted' },
            { key: 'left', label: 'Left' },
          ]}
          filename="old-students"
          title="Old Students"
        />
      </div>

      <StatRow>
        <StatCard label="Graduated" value={count('graduated')} tone="blue" />
        <StatCard label="Transferred" value={count('transferred')} tone="amber" />
        <StatCard label="Inactive" value={count('inactive')} tone="brand" />
        <StatCard label="Suspended" value={count('suspended')} tone="red" />
      </StatRow>

      <form className="card flex flex-wrap items-center gap-2 p-3">
        <select
          name="status"
          defaultValue={statusFilter}
          className="field w-auto min-w-40"
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          {LEFT.map((s) => (
            <option key={s} value={s}>
              {s[0].toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>

        <select
          name="class"
          defaultValue={classFilter}
          className="field w-auto min-w-40"
          aria-label="Filter by class"
        >
          <option value="">All classes</option>
          {classOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.grade_levels?.name ?? c.name}
            </option>
          ))}
        </select>

        <input
          name="q"
          defaultValue={q}
          placeholder="Search by name or parent…"
          className="field min-w-52 flex-1"
        />
        <button className="btn btn-primary">Search</button>
        {(q || statusFilter || classFilter) && (
          <Link href="/school/students/old" className="btn btn-ghost">
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

      {!students?.length ? (
        <div className="card px-6 py-16 text-center">
          <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            No records found
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm" style={{ color: 'var(--muted)' }}>
            Students with inactive, graduated or transferred status appear here. Promotion is what
            usually puts them here.
          </p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table min-w-[52rem]">
            <thead>
              <tr>
                <th>Student</th>
                <th>Father name</th>
                <th>Last class</th>
                <th>Adm. no</th>
                <th>Admitted</th>
                <th>Status</th>
                {canWrite && <th className="text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.id}>
                  <td>
                    <span className="font-medium" style={{ color: 'var(--ink)' }}>
                      {fullName(s)}
                    </span>
                  </td>
                  <td>{s.father_name ?? '—'}</td>
                  <td>
                    <span className="pill pill-muted">{label(s)}</span>
                  </td>
                  <td>
                    <span className="pill pill-muted font-mono">{s.admission_number ?? '—'}</span>
                  </td>
                  <td>{fmt(s.admission_date)}</td>
                  <td>
                    <span className={STATUS_PILL[s.status] ?? 'pill pill-muted'}>{s.status}</span>
                  </td>
                  {canWrite && (
                    <td>
                      <div className="flex justify-end">
                        <form action={setStudentStatus}>
                          <input type="hidden" name="id" value={s.id} />
                          <input type="hidden" name="status" value="active" />
                          <button
                            className="btn btn-ghost !px-2.5 !py-1"
                            title="Return this student to the active roll"
                          >
                            Reactivate
                          </button>
                        </form>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
