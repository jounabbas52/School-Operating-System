import Link from 'next/link'
import { getSchoolContext } from '@/lib/school-context'
import { StatCard, StatRow, FillBar, SessionBanner } from '@/components/stats'
import { deleteClass } from '../actions'
import ClassPanel from './class-panel'
import ConfirmButton from '@/components/confirm'
import ExportButtons from '@/components/export-buttons'
import RefreshButton from '@/components/refresh-button'

export const metadata = { title: 'Classes' }

export default async function ClassesPage() {
  const { schoolId, permissions, supabase } = await getSchoolContext()
  const canWrite = permissions.has('academics.write')

  const { data: sessions } = await supabase
    .from('sessions')
    .select('id, name, start_date, end_date, is_current')
    .eq('school_id', schoolId)
    .eq('is_deleted', false)
    .order('start_date', { ascending: false })

  const active = sessions?.find((s) => s.is_current) ?? null

  const [{ data: gradeLevels }, { data: classes, error }, { data: sections }, { data: students }] =
    await Promise.all([
      supabase
        .from('grade_levels')
        .select('id, name, short_name, ordinal')
        .eq('school_id', schoolId)
        .eq('is_deleted', false)
        .order('ordinal'),
      supabase
        .from('classes')
        .select(
          'id, code, name, capacity, status, standard_fee, grade_level_id, session_id, grading_system, start_time, periods_per_day, period_minutes, break_after_period, break_minutes, grade_levels(name, short_name, ordinal), sessions(name)'
        )
        .eq('school_id', schoolId)
        .eq('is_deleted', false),
      supabase
        .from('sections')
        .select('id, class_id, capacity')
        .eq('school_id', schoolId)
        .eq('is_deleted', false),
      supabase
        .from('students')
        .select('current_class_id')
        .eq('school_id', schoolId)
        .eq('is_deleted', false),
    ])

  const sectionsOf = new Map()
  for (const s of sections ?? []) {
    if (!sectionsOf.has(s.class_id)) sectionsOf.set(s.class_id, [])
    sectionsOf.get(s.class_id).push(s)
  }
  const studentsOf = new Map()
  for (const s of students ?? []) {
    studentsOf.set(s.current_class_id, (studentsOf.get(s.current_class_id) ?? 0) + 1)
  }

  // Only the active session's classes are listed. Everything on this screen
  // is "this year", which is what the banner promises.
  const rows = (classes ?? [])
    .filter((c) => !active || c.session_id === active.id)
    .sort((a, b) => (a.grade_levels?.ordinal ?? 999) - (b.grade_levels?.ordinal ?? 999))

  const totalStudents = rows.reduce((sum, c) => sum + (studentsOf.get(c.id) ?? 0), 0)
  const totalCapacity = rows.reduce(
    (sum, c) => sum + (sectionsOf.get(c.id) ?? []).reduce((n, s) => n + (s.capacity ?? 0), 0),
    0
  )
  const fillRate = totalCapacity ? Math.round((totalStudents / totalCapacity) * 100) : 0

  const exportRows = rows.map((c) => {
    const capacity = (sectionsOf.get(c.id) ?? []).reduce((n, s) => n + (s.capacity ?? 0), 0)
    const enrolled = studentsOf.get(c.id) ?? 0
    return {
      code: c.code ?? '',
      name: c.grade_levels?.name ?? c.name,
      sections: (sectionsOf.get(c.id) ?? []).length,
      enrolled,
      capacity,
      fill: capacity ? `${Math.round((enrolled / capacity) * 100)}%` : '—',
      fee: c.standard_fee != null ? Number(c.standard_fee).toLocaleString() : '',
      session: c.sessions?.name ?? '',
      status: c.status === 'active' ? 'Active' : 'Inactive',
    }
  })

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>
            Classes
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
            One class per grade level per session. Sections live beneath them.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RefreshButton />
          <ExportButtons
            rows={exportRows}
            columns={[
              { key: 'code', label: 'Class ID' },
              { key: 'name', label: 'Class' },
              { key: 'sections', label: 'Sections' },
              { key: 'enrolled', label: 'Enrolled' },
              { key: 'capacity', label: 'Capacity' },
              { key: 'fill', label: 'Fill rate' },
              { key: 'fee', label: 'Standard fee' },
              { key: 'session', label: 'Session' },
              { key: 'status', label: 'Status' },
            ]}
            filename="classes"
            title="Classes"
            subtitle={active?.name}
          />
          {canWrite && active && gradeLevels?.length > 0 && (
            <ClassPanel
              gradeLevels={gradeLevels}
              sessions={sessions ?? []}
              activeSessionId={active.id}
              trigger={{ label: '+ Add New Class', className: 'btn btn-primary' }}
            />
          )}
        </div>
      </div>

      <SessionBanner
        session={active}
        action={
          <Link
            href="/school/academics/sessions"
            className="text-xs font-medium text-white underline underline-offset-4"
          >
            Manage sessions
          </Link>
        }
      />

      {!active && (
        <p
          className="rounded-lg px-3 py-2 text-sm"
          style={{ background: 'var(--amber-soft)', color: 'var(--amber)' }}
        >
          No session is active, so new classes have nothing to attach to. Set one active on the
          Sessions screen first.
        </p>
      )}

      <StatRow>
        <StatCard label="Total classes" value={rows.length} tone="blue" />
        <StatCard
          label="Active classes"
          value={rows.filter((c) => c.status === 'active').length}
          tone="green"
        />
        <StatCard label="Total students" value={totalStudents} tone="navy" />
        <StatCard label="Avg. fill rate" value={`${fillRate}%`} tone="amber" />
      </StatRow>

      {rows.length > 0 && (
        <div className="card p-4">
          <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
            Students by grade
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((row) => {
              const capacity = (sectionsOf.get(row.id) ?? []).reduce(
                (n, s) => n + (s.capacity ?? 0),
                0
              )
              return (
                <div key={row.id} className="flex items-center gap-2.5">
                  <span
                    className="pill pill-blue shrink-0"
                    style={{ minWidth: '4.5rem', justifyContent: 'center' }}
                  >
                    {row.grade_levels?.name ?? row.name}
                  </span>
                  <div className="min-w-0 flex-1">
                    <FillBar enrolled={studentsOf.get(row.id) ?? 0} capacity={capacity} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {error && (
        <p
          className="rounded-lg px-3 py-2 text-sm"
          style={{ background: 'var(--red-soft)', color: 'var(--red)' }}
        >
          {error.message}
        </p>
      )}

      {rows.length === 0 ? (
        <div className="card px-6 py-14 text-center" style={{ borderStyle: 'dashed' }}>
          <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            No classes in this session
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm" style={{ color: 'var(--muted)' }}>
            {gradeLevels?.length
              ? 'Add a class for each grade level you are running this year.'
              : 'Define your grade levels first — a class is a grade level in one session.'}
          </p>
          {!gradeLevels?.length && (
            <Link href="/school/academics/grade-levels" className="btn btn-primary mt-4">
              Go to Grade Levels
            </Link>
          )}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table min-w-[54rem]">
            <thead>
              <tr>
                <th>Class ID</th>
                <th>Class</th>
                <th>Sections</th>
                <th>Students</th>
                <th>Session</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const mySections = sectionsOf.get(row.id) ?? []
                const capacity = mySections.reduce((n, s) => n + (s.capacity ?? 0), 0)
                return (
                  <tr key={row.id}>
                    <td>
                      <span className="pill pill-muted font-mono">{row.code ?? '—'}</span>
                    </td>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <span
                          className="flex size-7 shrink-0 items-center justify-center rounded-full text-[0.62rem] font-bold text-white"
                          style={{ background: 'var(--blue-600)' }}
                          aria-hidden="true"
                        >
                          {row.grade_levels?.short_name ?? row.name.slice(0, 2).toUpperCase()}
                        </span>
                        <div>
                          <span className="font-medium" style={{ color: 'var(--ink)' }}>
                            {row.grade_levels?.name ?? row.name}
                          </span>
                          {row.standard_fee != null && (
                            <span className="block text-xs" style={{ color: 'var(--muted)' }}>
                              Rs. {Number(row.standard_fee).toLocaleString()}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="tabular-nums">{mySections.length}</td>
                    <td>
                      <FillBar enrolled={studentsOf.get(row.id) ?? 0} capacity={capacity} />
                    </td>
                    <td>{row.sessions?.name ?? '—'}</td>
                    <td>
                      <span
                        className={row.status === 'active' ? 'pill pill-green' : 'pill pill-muted'}
                      >
                        {row.status === 'active' ? '● Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-1.5">
                        {canWrite ? (
                          <>
                            <Link
                              href="/school/academics/sections"
                              className="btn btn-ghost !px-2.5 !py-1"
                            >
                              Sections
                            </Link>
                            <ClassPanel
                              row={row}
                              gradeLevels={gradeLevels ?? []}
                              sessions={sessions ?? []}
                              activeSessionId={active?.id}
                              trigger={{ label: 'Edit', className: 'btn btn-ghost !px-2.5 !py-1' }}
                            />
                            <form action={deleteClass}>
                              <input type="hidden" name="id" value={row.id} />
                              <ConfirmButton
                                className="btn btn-danger !px-2.5 !py-1"
                                title={`Delete ${row.grade_levels?.name ?? row.name}?`}
                                message="Its sections go with it. Enrolled students must be moved first."
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
