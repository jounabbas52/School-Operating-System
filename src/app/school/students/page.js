import Link from 'next/link'
import { getSchoolContext } from '@/lib/school-context'
import { StatCard, StatRow } from '@/components/stats'
import ExportButtons from '@/components/export-buttons'
import ConfirmButton from '@/components/confirm'
import { deleteStudent } from './actions'
import { signedPhotoUrls } from '@/lib/storage'
import StudentPanel from './student-panel'

export const metadata = { title: 'Active Students' }

const fullName = (s) => [s.first_name, s.last_name].filter(Boolean).join(' ')

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

export default async function StudentsPage({ searchParams }) {
  const params = await searchParams
  const q = (params?.q ?? '').trim()
  const classFilter = params?.class ?? ''

  const { schoolId, permissions, supabase } = await getSchoolContext()
  const canWrite = permissions.has('students.write')

  const { data: active } = await supabase
    .from('sessions')
    .select('id, name')
    .eq('school_id', schoolId)
    .eq('is_current', true)
    .maybeSingle()

  const [{ data: classes }, { data: sections }, { data: serial }] = await Promise.all([
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

  const thisSession = (classes ?? [])
    .filter((c) => !active || c.session_id === active.id)
    .sort((a, b) => (a.grade_levels?.ordinal ?? 999) - (b.grade_levels?.ordinal ?? 999))

  const classOptions = thisSession.map((c) => ({ id: c.id, label: c.grade_levels?.name ?? c.name }))
  const sectionOptions = (sections ?? []).map((s) => ({
    id: s.id,
    label: s.name,
    class_id: s.class_id,
  }))

  let query = supabase
    .from('students')
    .select(
      'id, serial_number, admission_number, first_name, last_name, father_name, father_mobile, gender, status, roll_number, admission_date, current_class_id, current_section_id, family_number, session_id, date_of_birth, blood_group, caste, birth_place, city, state, postal_code, current_address, student_cnic, student_mobile, father_whatsapp, father_email, father_cnic, father_occupation, father_annual_income, fee_plan, base_fee, starting_month, discount_type, discount_value, discount_note, photo_url'
    )
    .eq('school_id', schoolId)
    .eq('is_deleted', false)
    .eq('status', 'active')

  if (classFilter) query = query.eq('current_class_id', classFilter)
  if (q) {
    // Search across the three things a front desk actually has to hand.
    query = query.or(
      `first_name.ilike.%${q}%,last_name.ilike.%${q}%,father_name.ilike.%${q}%,admission_number.ilike.%${q}%`
    )
  }

  const { data: students, error } = await query.order('first_name')

  // One batched call rather than one per row -- signing serially is a
  // visible stall on a full class list.
  const photoUrls = await signedPhotoUrls(
    supabase,
    (students ?? []).map((s) => s.photo_url)
  )

  const classById = new Map(thisSession.map((c) => [c.id, c.grade_levels?.name ?? c.name]))
  const sectionById = new Map((sections ?? []).map((s) => [s.id, s.name]))

  const label = (s) =>
    [classById.get(s.current_class_id), sectionById.get(s.current_section_id)]
      .filter(Boolean)
      .join(' · ') || '—'

  const exportRows = (students ?? []).map((s, i) => ({
    n: i + 1,
    admission_number: s.admission_number ?? '',
    name: fullName(s),
    father_name: s.father_name ?? '',
    klass: label(s),
    roll_number: s.roll_number ?? '',
    contact: s.father_mobile ?? '',
    gender: s.gender ?? '',
    admission_date: s.admission_date ?? '',
  }))

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>
            Active Students
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
            {students?.length ?? 0} of {active?.name ?? 'no active session'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ExportButtons
            rows={exportRows}
            columns={[
              { key: 'n', label: '#' },
              { key: 'admission_number', label: 'Adm. no' },
              { key: 'name', label: 'Student' },
              { key: 'father_name', label: 'Father name' },
              { key: 'klass', label: 'Class' },
              { key: 'roll_number', label: 'Roll no' },
              { key: 'contact', label: 'Contact' },
              { key: 'gender', label: 'Gender' },
              { key: 'admission_date', label: 'Admitted' },
            ]}
            filename="active-students"
            title="Active Students"
            subtitle={active?.name}
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
        <StatCard label="Active students" value={students?.length ?? 0} tone="brand" />
        <StatCard
          label="Male"
          value={(students ?? []).filter((s) => s.gender === 'male').length}
          tone="blue"
        />
        <StatCard
          label="Female"
          value={(students ?? []).filter((s) => s.gender === 'female').length}
          tone="green"
        />
        <StatCard label="Classes running" value={thisSession.length} tone="amber" />
      </StatRow>

      {/* --------------------------------------------------------- filters */}
      <form className="card flex flex-wrap items-center gap-2 p-3">
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

        <input
          name="q"
          defaultValue={q}
          placeholder="Search by name, father or admission no…"
          className="field min-w-56 flex-1"
        />

        <button className="btn btn-primary">Search</button>
        {(q || classFilter) && (
          <Link href="/school/students" className="btn btn-ghost">
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
            {q || classFilter ? 'No students match those filters' : 'No students yet'}
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm" style={{ color: 'var(--muted)' }}>
            {classOptions.length
              ? 'Use New Admission to register the first one.'
              : 'Create classes and sections first — a student has to be enrolled into one.'}
          </p>
          {!classOptions.length && (
            <Link href="/school/academics/classes" className="btn btn-primary mt-4">
              Go to Classes
            </Link>
          )}
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
                <th>Adm. no</th>
                <th>Contact</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
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
                          {s.serial_number ? ` · Serial ${s.serial_number}` : ''}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td>{s.father_name ?? '—'}</td>
                  <td>
                    <span className="pill pill-brand">{label(s)}</span>
                  </td>
                  <td>
                    <span className="pill pill-muted font-mono">{s.admission_number ?? '—'}</span>
                  </td>
                  <td>{s.father_mobile ?? '—'}</td>
                  <td>
                    <span className="pill pill-green">● Active</span>
                  </td>
                  <td>
                    <div className="flex items-center justify-end gap-1.5">
                      {canWrite ? (
                        <>
                          <StudentPanel
                            row={s}
                            classes={classOptions}
                            sections={sectionOptions}
                            nextSerial={serial ?? 1}
                            schoolId={schoolId}
                            photoUrl={photoUrls.get(s.photo_url) ?? null}
                            trigger={{ label: 'Edit', className: 'btn btn-ghost !px-2.5 !py-1' }}
                          />
                          <form action={deleteStudent}>
                            <input type="hidden" name="id" value={s.id} />
                            <ConfirmButton
                              className="btn btn-danger !px-2.5 !py-1"
                              title={`Remove ${fullName(s)}?`}
                              message="Marked inactive rather than erased — their marks, attendance and fee history stay intact."
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
