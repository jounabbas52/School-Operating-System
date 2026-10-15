import { getSchoolContext } from '@/lib/school-context'
import { StatCard, StatRow } from '@/components/ui'
import ExportButtons from '@/components/export-buttons'
import RefreshButton from '@/components/refresh-button'

export const metadata = { title: 'Student Reports' }

function Bar({ value, max, colour = 'var(--brand)' }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full"
      style={{ background: 'var(--border-soft)' }}
    >
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: colour }} />
    </div>
  )
}

export default async function StudentReportsPage() {
  const { schoolId, supabase } = await getSchoolContext()

  const [{ data: students }, { data: classes }] = await Promise.all([
    supabase
      .from('students')
      .select('id, gender, status, admission_date, current_class_id')
      .eq('school_id', schoolId)
      .eq('is_deleted', false),
    supabase
      .from('classes')
      .select('id, name, grade_levels(name, ordinal)')
      .eq('school_id', schoolId)
      .eq('is_deleted', false),
  ])

  const all = students ?? []
  const classList = (classes ?? []).sort(
    (a, b) => (a.grade_levels?.ordinal ?? 999) - (b.grade_levels?.ordinal ?? 999)
  )

  const totals = {
    total: all.length,
    active: all.filter((s) => s.status === 'active').length,
    inactive: all.filter((s) => s.status !== 'active').length,
    male: all.filter((s) => s.gender === 'male').length,
    female: all.filter((s) => s.gender === 'female').length,
  }

  // Class-wise enrolment
  const perClass = classList.map((c) => {
    const mine = all.filter((s) => s.current_class_id === c.id)
    return {
      id: c.id,
      label: c.grade_levels?.name ?? c.name,
      students: mine.length,
      active: mine.filter((s) => s.status === 'active').length,
      inactive: mine.filter((s) => s.status !== 'active').length,
      male: mine.filter((s) => s.gender === 'male').length,
      female: mine.filter((s) => s.gender === 'female').length,
    }
  })
  const maxClass = Math.max(1, ...perClass.map((c) => c.students))

  // Year-wise admissions
  const byYear = new Map()
  for (const s of all) {
    if (!s.admission_date) continue
    const y = new Date(s.admission_date).getFullYear()
    byYear.set(y, (byYear.get(y) ?? 0) + 1)
  }
  const years = [...byYear.entries()].sort((a, b) => a[0] - b[0])
  const maxYear = Math.max(1, ...years.map(([, n]) => n))

  const exportRows = perClass.map((c) => ({
    klass: c.label,
    students: c.students,
    active: c.active,
    inactive: c.inactive,
    male: c.male,
    female: c.female,
    ratio: c.students ? `${Math.round((c.male / c.students) * 100)}% M` : '—',
  }))

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>
            Student Reports
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
            Enrolment, admissions and gender split across the school.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <RefreshButton />
          <ExportButtons
            rows={exportRows}
            columns={[
              { key: 'klass', label: 'Class' },
              { key: 'students', label: 'Students' },
              { key: 'active', label: 'Active' },
              { key: 'inactive', label: 'Inactive' },
              { key: 'male', label: 'Male' },
              { key: 'female', label: 'Female' },
              { key: 'ratio', label: 'Gender ratio' },
            ]}
            filename="student-reports"
            title="Student Reports"
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Total students" value={totals.total} tone="brand" />
        <StatCard label="Active" value={totals.active} tone="green" />
        <StatCard label="Inactive" value={totals.inactive} tone="red" />
        <StatCard label="Male" value={totals.male} tone="blue" />
        <StatCard label="Female" value={totals.female} tone="amber" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ------------------------------------------ class-wise enrolment */}
        <div className="card overflow-hidden">
          <div className="border-b px-4 py-3" style={{ borderColor: 'var(--border)' }}>
            <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
              Class-wise enrolment
            </p>
          </div>
          {perClass.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm" style={{ color: 'var(--muted)' }}>
              No classes yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Class</th>
                    <th>Students</th>
                    <th>Active</th>
                    <th>Inactive</th>
                  </tr>
                </thead>
                <tbody>
                  {perClass.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <span className="font-medium" style={{ color: 'var(--ink)' }}>
                          {c.label}
                        </span>
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="w-24">
                            <Bar value={c.students} max={maxClass} />
                          </div>
                          <span className="tabular-nums">{c.students}</span>
                        </div>
                      </td>
                      <td>
                        <span className="pill pill-green">{c.active}</span>
                      </td>
                      <td>
                        <span className="pill pill-muted">{c.inactive}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* -------------------------------------------- year-wise admissions */}
        <div className="card overflow-hidden">
          <div className="border-b px-4 py-3" style={{ borderColor: 'var(--border)' }}>
            <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
              Year-wise admissions
            </p>
          </div>
          {years.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm" style={{ color: 'var(--muted)' }}>
              No admission dates recorded.
            </p>
          ) : (
            <div className="flex flex-col gap-2.5 p-4">
              {years.map(([year, n]) => (
                <div key={year} className="flex items-center gap-3">
                  <span
                    className="w-12 shrink-0 text-xs tabular-nums"
                    style={{ color: 'var(--muted)' }}
                  >
                    {year}
                  </span>
                  <div className="flex-1">
                    <Bar value={n} max={maxYear} />
                  </div>
                  <span
                    className="w-7 shrink-0 text-right text-xs font-medium tabular-nums"
                    style={{ color: 'var(--ink)' }}
                  >
                    {n}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* -------------------------------------------- gender distribution */}
      <div className="card overflow-hidden">
        <div className="border-b px-4 py-3" style={{ borderColor: 'var(--border)' }}>
          <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
            Gender distribution by class
          </p>
        </div>
        {perClass.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm" style={{ color: 'var(--muted)' }}>
            No classes yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table min-w-[40rem]">
              <thead>
                <tr>
                  <th>Class</th>
                  <th>Male</th>
                  <th>Female</th>
                  <th>Total</th>
                  <th>Gender ratio</th>
                </tr>
              </thead>
              <tbody>
                {perClass.map((c) => {
                  const total = c.male + c.female
                  const malePct = total ? Math.round((c.male / total) * 100) : 0
                  return (
                    <tr key={c.id}>
                      <td>
                        <span className="font-medium" style={{ color: 'var(--ink)' }}>
                          {c.label}
                        </span>
                      </td>
                      <td>
                        <span className="pill pill-blue">{c.male}</span>
                      </td>
                      <td>
                        <span className="pill pill-red">{c.female}</span>
                      </td>
                      <td className="tabular-nums">{c.students}</td>
                      <td>
                        <div className="min-w-[8rem]">
                          <div
                            className="flex h-1.5 w-full overflow-hidden rounded-full"
                            style={{ background: 'var(--border-soft)' }}
                          >
                            <div style={{ width: `${malePct}%`, background: 'var(--blue)' }} />
                            <div style={{ width: `${100 - malePct}%`, background: 'var(--red)' }} />
                          </div>
                          <p className="mt-0.5 text-[0.65rem]" style={{ color: 'var(--muted)' }}>
                            {total ? `${malePct}% M · ${100 - malePct}% F` : 'no data'}
                          </p>
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
    </div>
  )
}
