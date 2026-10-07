import Link from 'next/link'
import { getSchoolContext } from '@/lib/school-context'
import { StatCard, StatRow } from '@/components/ui'
import ExportButtons from '@/components/export-buttons'
import StudentPanel from '../student-panel'

export const metadata = { title: 'Admission Register' }

const fullName = (s) => [s.first_name, s.last_name].filter(Boolean).join(' ')

const fmt = (d) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

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

export default async function AdmissionRegisterPage({ searchParams }) {
  const params = await searchParams
  const q = (params?.q ?? '').trim()
  const classFilter = params?.class ?? ''

  const { schoolId, permissions, supabase } = await getSchoolContext()
  const canWrite = permissions.has('students.write')

  const [{ data: sessions }, { data: classes }, { data: sections }, { data: serial }] =
    await Promise.all([
      supabase
        .from('sessions')
        .select('id, name, is_current')
        .eq('school_id', schoolId)
        .eq('is_deleted', false),
      supabase
        .from('classes')
        .select('id, name, session_id, grade_levels(name, ordinal)')
        .eq('school_id', schoolId)
        .eq('is_deleted', false),
      supabase
        .from('sections')
        .select('id, name, class_id')
        .eq('school_id', schoolId)
        .eq('is_deleted', false)
        .order('name'),
      supabase.rpc('next_student_serial', { p_school: schoolId }),
    ])

  const active = sessions?.find((s) => s.is_current) ?? null

  // The register lists every admission ever, not just the current session --
  // that is the point of a register.
  let query = supabase
    .from('students')
    .select(
      'id, serial_number, admission_number, first_name, last_name, father_name, father_mobile, gender, status, roll_number, admission_date, current_class_id, current_section_id, family_number, session_id, date_of_birth, blood_group, caste, birth_place, city, state, postal_code, current_address, student_cnic, student_mobile, father_whatsapp, father_email, father_cnic, father_occupation, father_annual_income, fee_plan, base_fee, starting_month, discount_type, discount_value, discount_note'
    )
    .eq('school_id', schoolId)
    .eq('is_deleted', false)

  if (classFilter) query = query.eq('current_class_id', classFilter)
  if (q) {
    query = query.or(
      `first_name.ilike.%${q}%,last_name.ilike.%${q}%,father_name.ilike.%${q}%,admission_number.ilike.%${q}%`
    )
  }

  const { data: students, error } = await query.order('admission_date', { ascending: false })

  const classById = new Map(
    (classes ?? []).map((c) => [c.id, c.grade_levels?.name ?? c.name])
  )
  const sectionById = new Map((sections ?? []).map((s) => [s.id, s.name]))
  const sessionById = new Map((sessions ?? []).map((s) => [s.id, s.name]))

  const label = (s) =>
    [classById.get(s.current_class_id), sectionById.get(s.current_section_id)]
      .filter(Boolean)
      .join(' · ') || '—'

  const now = new Date()
  const thisMonth = (students ?? []).filter((s) => {
    if (!s.admission_date) return false
    const d = new Date(s.admission_date)
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  }).length
  const thisYear = (students ?? []).filter(
    (s) => s.admission_date && new Date(s.admission_date).getFullYear() === now.getFullYear()
  ).length

  const thisSessionClasses = (classes ?? [])
    .filter((c) => !active || c.session_id === active.id)
    .sort((a, b) => (a.grade_levels?.ordinal ?? 999) - (b.grade_levels?.ordinal ?? 999))

  const classOptions = thisSessionClasses.map((c) => ({
    id: c.id,
    label: c.grade_levels?.name ?? c.name,
  }))
  const sectionOptions = (sections ?? []).map((s) => ({
    id: s.id,
    label: s.name,
    class_id: s.class_id,
  }))

  const exportRows = (students ?? []).map((s, i) => ({
    n: i + 1,
    name: fullName(s),
    father_name: s.father_name ?? '',
    klass: label(s),
    admission_date: fmt(s.admission_date),
    session: sessionById.get(s.session_id) ?? '',
    status: s.status,
    id: s.admission_number ?? '',
  }))

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>
            Admission Register
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
            Every admission on record, newest first.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ExportButtons
            rows={exportRows}
            columns={[
              { key: 'n', label: '#' },
              { key: 'name', label: 'Student' },
              { key: 'father_name', label: 'Father name' },
              { key: 'klass', label: 'Class' },
              { key: 'admission_date', label: 'Adm. date' },
              { key: 'session', label: 'Session' },
              { key: 'status', label: 'Status' },
              { key: 'id', label: 'ID' },
            ]}
            filename="admission-register"
            title="Admission Register"
          />
          {canWrite && classOptions.length > 0 && (
            <StudentPanel
              classes={classOptions}
              sections={sectionOptions}
              nextSerial={serial ?? 1}
              schoolId={schoolId}
              trigger={{ label: '+ New Admission', className: 'btn btn-primary' }}
            />
          )}
        </div>
      </div>

      <StatRow>
        <StatCard label="Total students" value={students?.length ?? 0} tone="brand" />
        <StatCard label="This month" value={thisMonth} tone="blue" />
        <StatCard label="This year" value={thisYear} tone="green" />
        <StatCard
          label="Active"
          value={(students ?? []).filter((s) => s.status === 'active').length}
          tone="amber"
        />
      </StatRow>

      <form className="card flex flex-wrap items-center gap-2 p-3">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search student name, father, admission no…"
          className="field min-w-56 flex-1"
        />
        <select
          name="class"
          defaultValue={classFilter}
          className="field w-auto min-w-44"
          aria-label="Filter by class"
        >
          <option value="">All classes</option>
          {classOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <button className="btn btn-primary">Search</button>
        {(q || classFilter) && (
          <Link href="/school/students/register" className="btn btn-ghost">
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
        <div className="card px-6 py-16 text-center" style={{ borderStyle: 'dashed' }}>
          <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            No admissions recorded
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm" style={{ color: 'var(--muted)' }}>
            Every student you admit appears here permanently, including those who later leave.
          </p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table min-w-[56rem]">
            <thead>
              <tr>
                <th>#</th>
                <th>Student</th>
                <th>Father name</th>
                <th>Class</th>
                <th>Adm. date</th>
                <th>Session</th>
                <th>Status</th>
                <th>ID</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s, i) => (
                <tr key={s.id}>
                  <td className="tabular-nums" style={{ color: 'var(--muted)' }}>
                    {i + 1}
                  </td>
                  <td>
                    <div className="flex items-center gap-2.5">
                      <Avatar name={fullName(s)} />
                      <div className="min-w-0">
                        <span className="font-medium" style={{ color: 'var(--ink)' }}>
                          {fullName(s)}
                        </span>
                        <span className="block text-xs" style={{ color: 'var(--muted)' }}>
                          {s.gender ?? '—'}
                          {s.serial_number ? ` · Serial: ${s.serial_number}` : ''}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td>{s.father_name ?? '—'}</td>
                  <td>
                    <span className="pill pill-brand">{label(s)}</span>
                  </td>
                  <td>{fmt(s.admission_date)}</td>
                  <td>
                    <span className="pill pill-muted">{sessionById.get(s.session_id) ?? '—'}</span>
                  </td>
                  <td>
                    <span
                      className={
                        s.status === 'active'
                          ? 'pill pill-green'
                          : s.status === 'graduated'
                            ? 'pill pill-blue'
                            : 'pill pill-muted'
                      }
                    >
                      {s.status === 'active' ? '● Active' : s.status}
                    </span>
                  </td>
                  <td>
                    <span className="pill pill-muted font-mono">{s.admission_number ?? '—'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs" style={{ color: 'var(--muted)' }}>
        Bulk import from CSV is not built yet — it will land with the import mapping screen.
      </p>
    </div>
  )
}
