import Link from 'next/link'
import { getSchoolContext } from '@/lib/school-context'
import ExportButtons from '@/components/export-buttons'
import { MARK_LABEL, safeDate } from '@/lib/attendance-options'
import AttendanceSheet from './attendance-sheet'

export const metadata = { title: 'Student Attendance' }

const fullName = (s) => [s.first_name, s.last_name].filter(Boolean).join(' ')

export default async function StudentAttendancePage({ searchParams }) {
  const params = await searchParams
  const date = safeDate(params?.date)
  const classFilter = params?.class ?? ''
  const sectionFilter = params?.section ?? ''

  const { schoolId, permissions, supabase } = await getSchoolContext()
  const canWrite = permissions.has('attendance.write')

  const { data: active } = await supabase
    .from('sessions')
    .select('id, name')
    .eq('school_id', schoolId)
    .eq('is_current', true)
    .maybeSingle()

  const [{ data: classes }, { data: sections }] = await Promise.all([
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
  ])

  const thisSession = (classes ?? [])
    .filter((c) => !active || c.session_id === active.id)
    .sort((a, b) => (a.grade_levels?.ordinal ?? 999) - (b.grade_levels?.ordinal ?? 999))

  const classOptions = thisSession.map((c) => ({ id: c.id, label: c.grade_levels?.name ?? c.name }))
  const sectionOptions = (sections ?? []).filter((s) => s.class_id === classFilter)

  const className = classOptions.find((c) => c.id === classFilter)?.label ?? null
  const sectionName = sectionOptions.find((s) => s.id === sectionFilter)?.name ?? null

  // Nothing is fetched until a class AND section are chosen: a register is
  // marked one section at a time, and loading the whole school would be a
  // list nobody can act on.
  const loaded = Boolean(classFilter && sectionFilter)

  let students = []
  let existing = {}
  let error = null

  if (loaded) {
    const [{ data: roster, error: rosterError }, { data: marked }] = await Promise.all([
      supabase
        .from('students')
        .select('id, first_name, last_name, father_name, admission_number, roll_number')
        .eq('school_id', schoolId)
        .eq('is_deleted', false)
        .eq('status', 'active')
        .eq('current_class_id', classFilter)
        .eq('current_section_id', sectionFilter)
        .order('roll_number', { nullsFirst: false }),
      supabase
        .from('attendance')
        .select('student_id, status')
        .eq('school_id', schoolId)
        .eq('is_deleted', false)
        .eq('date', date)
        .eq('class_id', classFilter)
        .eq('section_id', sectionFilter),
    ])

    error = rosterError
    students = (roster ?? []).map((s) => ({
      id: s.id,
      name: fullName(s),
      father_name: s.father_name,
      admission_number: s.admission_number,
      roll_number: s.roll_number,
    }))
    existing = Object.fromEntries((marked ?? []).map((m) => [m.student_id, m.status]))
  }

  const alreadyMarked = Object.keys(existing).length

  const exportRows = students.map((s, i) => ({
    n: i + 1,
    name: s.name,
    father_name: s.father_name ?? '',
    admission_number: s.admission_number ?? '',
    roll_number: s.roll_number ?? '',
    klass: [className, sectionName].filter(Boolean).join(' · '),
    date,
    status: MARK_LABEL[existing[s.id]] ?? 'Not marked',
  }))

  const heading = new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>
            Student Attendance
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
            {heading}
            {active ? ` · ${active.name}` : ' · no active session'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ExportButtons
            rows={exportRows}
            columns={[
              { key: 'n', label: '#' },
              { key: 'name', label: 'Student' },
              { key: 'father_name', label: 'Father name' },
              { key: 'admission_number', label: 'Adm. no' },
              { key: 'roll_number', label: 'Roll' },
              { key: 'klass', label: 'Class' },
              { key: 'date', label: 'Date' },
              { key: 'status', label: 'Status' },
            ]}
            filename={`attendance-${date}`}
            title="Student Attendance"
            subtitle={[className, sectionName, date].filter(Boolean).join(' · ')}
          />
          <Link href="/school/attendance/reports" className="btn btn-ghost">
            Reports
          </Link>
        </div>
      </div>

      {/* ---------------------------------------------------- fetch controls */}
      <div className="card p-4">
        <p className="mb-3 text-[0.68rem] font-bold uppercase tracking-wider" style={{ color: 'var(--brand-ink)' }}>
          Fetch students for attendance
        </p>

        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <span className="label">Class</span>
            {/* Native selects here, not the combobox: changing the class has to
                reload the page to fetch that class's sections, so this stays a
                plain GET form. */}
            <select name="class" defaultValue={classFilter} className="field" aria-label="Class">
              <option value="">Select class…</option>
              {classOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <span className="label">Section</span>
            <select
              name="section"
              defaultValue={sectionFilter}
              className="field"
              aria-label="Section"
              disabled={!classFilter}
            >
              <option value="">{classFilter ? 'Select section…' : 'Choose a class first'}</option>
              {sectionOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <span className="label">Date</span>
            <input name="date" type="date" defaultValue={date} className="field" />
          </div>

          <div className="flex items-end gap-2">
            <button className="btn btn-primary flex-1">Load</button>
            {loaded && (
              <Link href="/school/attendance" className="btn btn-ghost">
                Clear
              </Link>
            )}
          </div>
        </form>

        {loaded && (
          <p className="mt-3 text-xs" style={{ color: 'var(--muted)' }}>
            Loaded <strong style={{ color: 'var(--ink)' }}>{students.length} students</strong> for{' '}
            {className} · Section {sectionName} on {date}
            {alreadyMarked > 0 && ` — ${alreadyMarked} already marked, showing what was saved.`}
          </p>
        )}
      </div>

      {error && (
        <p
          className="rounded-lg px-3 py-2 text-sm"
          style={{ background: 'var(--red-soft)', color: 'var(--red-ink)' }}
        >
          {error.message}
        </p>
      )}

      {!loaded ? (
        <div className="card px-6 py-16 text-center" style={{ borderStyle: 'dashed' }}>
          <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            Select filters &amp; load students
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm" style={{ color: 'var(--muted)' }}>
            {classOptions.length
              ? 'Choose class, section and date, then press Load.'
              : 'Create classes and sections first — a register is marked one section at a time.'}
          </p>
          {!classOptions.length && (
            <Link href="/school/academics/classes" className="btn btn-primary mt-4">
              Go to Classes
            </Link>
          )}
        </div>
      ) : !students.length ? (
        <div className="card px-6 py-16 text-center" style={{ borderStyle: 'dashed' }}>
          <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            No active students in {className} · Section {sectionName}
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm" style={{ color: 'var(--muted)' }}>
            Admit students into this section, or pick another one.
          </p>
          <Link href="/school/students" className="btn btn-primary mt-4">
            Go to Students
          </Link>
        </div>
      ) : (
        <AttendanceSheet
          students={students}
          date={date}
          classId={classFilter}
          sectionId={sectionFilter}
          existing={existing}
          canWrite={canWrite}
        />
      )}
    </div>
  )
}
