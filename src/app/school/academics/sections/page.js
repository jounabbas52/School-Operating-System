import Link from 'next/link'
import { getSchoolContext } from '@/lib/school-context'
import { StatCard, StatRow, FillBar } from '@/components/stats'
import { deleteSection } from '../actions'
import SectionPanel from './section-panel'
import ConfirmButton from '@/components/confirm'
import ExportButtons from '@/components/export-buttons'

export const metadata = { title: 'Section Management' }

export default async function SectionsPage() {
  const { schoolId, permissions, supabase } = await getSchoolContext()
  const canWrite = permissions.has('academics.write')

  const { data: active } = await supabase
    .from('sessions')
    .select('id, name')
    .eq('school_id', schoolId)
    .eq('is_current', true)
    .maybeSingle()

  const [{ data: classes }, { data: sections, error }, { data: subjects }, { data: links }, { data: students }] =
    await Promise.all([
      supabase
        .from('classes')
        .select('id, name, session_id, grade_levels(name, short_name, ordinal)')
        .eq('school_id', schoolId)
        .eq('is_deleted', false),
      supabase
        .from('sections')
        .select('id, name, class_id, room_number, capacity, status')
        .eq('school_id', schoolId)
        .eq('is_deleted', false)
        .order('name'),
      supabase
        .from('subjects')
        .select('id, name, code')
        .eq('school_id', schoolId)
        .eq('is_deleted', false)
        .eq('status', 'active')
        .order('name'),
      supabase
        .from('section_subjects')
        .select('section_id, subject_id, subjects(name)')
        .eq('school_id', schoolId),
      supabase
        .from('students')
        .select('current_section_id')
        .eq('school_id', schoolId)
        .eq('is_deleted', false),
    ])

  const thisSession = (classes ?? [])
    .filter((c) => !active || c.session_id === active.id)
    .sort((a, b) => (a.grade_levels?.ordinal ?? 999) - (b.grade_levels?.ordinal ?? 999))

  const classIds = new Set(thisSession.map((c) => c.id))
  const rows = (sections ?? []).filter((s) => classIds.has(s.class_id))

  const byClass = new Map()
  for (const s of rows) {
    if (!byClass.has(s.class_id)) byClass.set(s.class_id, [])
    byClass.get(s.class_id).push(s)
  }

  const subjectsOf = new Map()
  for (const l of links ?? []) {
    if (!subjectsOf.has(l.section_id)) subjectsOf.set(l.section_id, [])
    subjectsOf.get(l.section_id).push(l)
  }

  const enrolledOf = new Map()
  for (const s of students ?? []) {
    enrolledOf.set(s.current_section_id, (enrolledOf.get(s.current_section_id) ?? 0) + 1)
  }

  const totalCapacity = rows.reduce((n, s) => n + (s.capacity ?? 0), 0)
  const totalEnrolled = rows.reduce((n, s) => n + (enrolledOf.get(s.id) ?? 0), 0)

  const classOptions = thisSession.map((c) => ({
    id: c.id,
    label: c.grade_levels?.name ?? c.name,
  }))

  // Flattened across every class, so one export covers the whole session
  // rather than one file per class group.
  const exportRows = thisSession.flatMap((klass) => {
    const label = klass.grade_levels?.name ?? klass.name
    return (byClass.get(klass.id) ?? []).map((s) => {
      const enrolled = enrolledOf.get(s.id) ?? 0
      return {
        klass: label,
        section: `${label}-${s.name}`,
        subjects: (subjectsOf.get(s.id) ?? []).map((x) => x.subjects?.name).filter(Boolean).join(', '),
        room: s.room_number ?? '',
        enrolled,
        capacity: s.capacity ?? '',
        fill: s.capacity ? `${Math.round((enrolled / s.capacity) * 100)}%` : '—',
        status: s.status === 'active' ? 'Active' : 'Inactive',
      }
    })
  })

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>
            Section Management
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
            {active ? `Sections in ${active.name}` : 'No active session'} — students are enrolled
            into these.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ExportButtons
            rows={exportRows}
            columns={[
              { key: 'klass', label: 'Class' },
              { key: 'section', label: 'Section' },
              { key: 'subjects', label: 'Subjects' },
              { key: 'room', label: 'Room' },
              { key: 'enrolled', label: 'Enrolled' },
              { key: 'capacity', label: 'Capacity' },
              { key: 'fill', label: 'Fill rate' },
              { key: 'status', label: 'Status' },
            ]}
            filename="sections"
            title="Section Management"
            subtitle={active?.name}
          />
          {canWrite && classOptions.length > 0 && (
            <SectionPanel
              classes={classOptions}
              subjects={subjects ?? []}
              trigger={{ label: '+ Add Section', className: 'btn btn-primary' }}
            />
          )}
        </div>
      </div>

      <StatRow>
        <StatCard label="Total sections" value={rows.length} tone="blue" />
        <StatCard
          label="Active sections"
          value={rows.filter((s) => s.status === 'active').length}
          tone="green"
        />
        <StatCard label="Total capacity" value={totalCapacity} tone="navy" />
        <StatCard label="Enrolled" value={totalEnrolled} tone="amber" />
      </StatRow>

      {error && (
        <p
          className="rounded-lg px-3 py-2 text-sm"
          style={{ background: 'var(--red-soft)', color: 'var(--red)' }}
        >
          {error.message}
        </p>
      )}

      {classOptions.length === 0 ? (
        <div className="card px-6 py-14 text-center">
          <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            No classes in this session
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm" style={{ color: 'var(--muted)' }}>
            A section belongs to a class, so create the classes first.
          </p>
          <Link href="/school/academics/classes" className="btn btn-primary mt-4">
            Go to Classes
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {thisSession.map((klass) => {
            const mine = byClass.get(klass.id) ?? []
            const capacity = mine.reduce((n, s) => n + (s.capacity ?? 0), 0)
            const enrolled = mine.reduce((n, s) => n + (enrolledOf.get(s.id) ?? 0), 0)
            const label = klass.grade_levels?.name ?? klass.name

            return (
              <div key={klass.id} className="card overflow-hidden">
                <div
                  className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2.5"
                  style={{ borderColor: 'var(--border)', background: 'var(--card-alt)' }}
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className="flex size-7 items-center justify-center rounded-full text-[0.62rem] font-bold text-white"
                      style={{ background: 'var(--blue-600)' }}
                      aria-hidden="true"
                    >
                      {klass.grade_levels?.short_name ?? label.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                      {label}
                    </span>
                    <span className="pill pill-muted">
                      {mine.length} section{mine.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs tabular-nums" style={{ color: 'var(--muted)' }}>
                      {enrolled} / {capacity} enrolled
                    </span>
                    {canWrite && (
                      <SectionPanel
                        classes={classOptions}
                        subjects={subjects ?? []}
                        defaultClassId={klass.id}
                        trigger={{ label: '+ Add', className: 'btn btn-ghost !px-2.5 !py-1' }}
                      />
                    )}
                  </div>
                </div>

                {mine.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm" style={{ color: 'var(--muted)' }}>
                    No sections in {label} yet.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="table min-w-[48rem]">
                      <thead>
                        <tr>
                          <th>Section</th>
                          <th>Subjects</th>
                          <th>Room</th>
                          <th>Fill rate</th>
                          <th>Status</th>
                          <th className="text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {mine.map((row) => {
                          const mySubjects = subjectsOf.get(row.id) ?? []
                          return (
                            <tr key={row.id}>
                              <td>
                                <div className="flex items-center gap-2">
                                  <span
                                    className="flex size-6 items-center justify-center rounded-full text-[0.6rem] font-bold text-white"
                                    style={{ background: 'var(--brand)' }}
                                    aria-hidden="true"
                                  >
                                    {row.name.slice(0, 2)}
                                  </span>
                                  <span className="font-medium" style={{ color: 'var(--ink)' }}>
                                    {label}-{row.name}
                                  </span>
                                </div>
                              </td>
                              <td>
                                {mySubjects.length === 0 ? (
                                  <span className="text-xs italic" style={{ color: 'var(--muted-2)' }}>
                                    None
                                  </span>
                                ) : (
                                  <div className="flex flex-wrap gap-1">
                                    {mySubjects.slice(0, 3).map((s) => (
                                      <span key={s.subject_id} className="pill pill-muted">
                                        {s.subjects?.name}
                                      </span>
                                    ))}
                                    {mySubjects.length > 3 && (
                                      <span className="pill pill-blue">
                                        +{mySubjects.length - 3}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </td>
                              <td>{row.room_number || '—'}</td>
                              <td>
                                <FillBar
                                  enrolled={enrolledOf.get(row.id) ?? 0}
                                  capacity={row.capacity}
                                />
                              </td>
                              <td>
                                <span
                                  className={
                                    row.status === 'active' ? 'pill pill-green' : 'pill pill-muted'
                                  }
                                >
                                  {row.status === 'active' ? '● Active' : 'Inactive'}
                                </span>
                              </td>
                              <td>
                                <div className="flex items-center justify-end gap-1.5">
                                  {canWrite && (
                                    <>
                                      <SectionPanel
                                        row={row}
                                        classes={classOptions}
                                        subjects={subjects ?? []}
                                        assignedSubjects={mySubjects.map((s) => s.subject_id)}
                                        trigger={{
                                          label: 'Edit',
                                          className: 'btn btn-ghost !px-2.5 !py-1',
                                        }}
                                      />
                                      <form action={deleteSection}>
                                        <input type="hidden" name="id" value={row.id} />
                                        <ConfirmButton
                                          className="btn btn-danger !px-2.5 !py-1"
                                          title={`Delete section ${label}-${row.name}?`}
                                          message="Enrolled students must be moved to another section first."
                                        >
                                          Delete
                                        </ConfirmButton>
                                      </form>
                                    </>
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
          })}
        </div>
      )}
    </div>
  )
}
