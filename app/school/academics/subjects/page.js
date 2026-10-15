import { getSchoolContext } from '@/lib/school-context'
import { StatCard, StatRow } from '@/components/stats'
import { deleteSubject } from '../actions'
import SubjectPanel from './subject-panel'
import ConfirmButton from '@/components/confirm'
import ExportButtons from '@/components/export-buttons'
import RefreshButton from '@/components/refresh-button'

export const metadata = { title: 'Subjects' }

export default async function SubjectsPage() {
  const { schoolId, permissions, supabase } = await getSchoolContext()
  const canWrite = permissions.has('academics.write')

  const [{ data: subjects, error }, { data: links }] = await Promise.all([
    supabase
      .from('subjects')
      .select('id, name, code, category, default_marks, description, status')
      .eq('school_id', schoolId)
      .eq('is_deleted', false)
      .order('name'),
    supabase.from('section_subjects').select('subject_id').eq('school_id', schoolId),
  ])

  const usage = new Map()
  for (const row of links ?? []) {
    usage.set(row.subject_id, (usage.get(row.subject_id) ?? 0) + 1)
  }

  const activeCount = (subjects ?? []).filter((s) => s.status === 'active').length

  const exportRows = (subjects ?? []).map((row) => ({
    name: row.name,
    code: row.code ?? '',
    category: row.category ?? '',
    default_marks: row.default_marks ?? '',
    sections: usage.get(row.id) ?? 0,
    status: row.status === 'active' ? 'Active' : 'Inactive',
  }))

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>
            Subjects
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
            Master list for the whole school. Attach them to sections, not classes.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RefreshButton />
          <ExportButtons
            rows={exportRows}
            columns={[
              { key: 'name', label: 'Subject' },
              { key: 'code', label: 'Code' },
              { key: 'category', label: 'Category' },
              { key: 'default_marks', label: 'Default marks' },
              { key: 'sections', label: 'Sections' },
              { key: 'status', label: 'Status' },
            ]}
            filename="subjects"
            title="Subjects"
          />
          {canWrite && (
            <SubjectPanel trigger={{ label: '+ Add Subject', className: 'btn btn-primary' }} />
          )}
        </div>
      </div>

      <StatRow>
        <StatCard label="Total subjects" value={subjects?.length ?? 0} tone="blue" />
        <StatCard label="Active" value={activeCount} tone="green" />
        <StatCard
          label="Inactive"
          value={(subjects?.length ?? 0) - activeCount}
          tone="navy"
        />
        <StatCard
          label="Unassigned"
          value={(subjects ?? []).filter((s) => !usage.get(s.id)).length}
          tone="amber"
        />
      </StatRow>

      {error && (
        <p
          className="rounded-lg px-3 py-2 text-sm"
          style={{ background: 'var(--red-soft)', color: 'var(--red)' }}
        >
          {error.message}
        </p>
      )}

      {!subjects?.length ? (
        <div className="card px-6 py-16 text-center" style={{ borderStyle: 'dashed' }}>
          <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            No subjects yet — add your first one
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm" style={{ color: 'var(--muted)' }}>
            Define each subject once here, then tick it on the sections that teach it.
          </p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table min-w-[46rem]">
            <thead>
              <tr>
                <th>Subject name</th>
                <th>Code</th>
                <th>Category</th>
                <th>Default marks</th>
                <th>Sections</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {subjects.map((row) => (
                <tr key={row.id}>
                  <td>
                    <span className="font-medium" style={{ color: 'var(--ink)' }}>
                      {row.name}
                    </span>
                    {row.description && (
                      <span className="block text-xs" style={{ color: 'var(--muted)' }}>
                        {row.description}
                      </span>
                    )}
                  </td>
                  <td className="font-mono text-xs">{row.code || '—'}</td>
                  <td>
                    {row.category ? (
                      <span className="pill pill-blue">{row.category}</span>
                    ) : (
                      <span style={{ color: 'var(--muted-2)' }}>—</span>
                    )}
                  </td>
                  <td className="tabular-nums">{row.default_marks ?? '—'}</td>
                  <td>
                    {usage.get(row.id) ? (
                      <span className="pill pill-muted">{usage.get(row.id)}</span>
                    ) : (
                      <span className="pill pill-amber">unassigned</span>
                    )}
                  </td>
                  <td>
                    <span className={row.status === 'active' ? 'pill pill-green' : 'pill pill-muted'}>
                      {row.status === 'active' ? '● Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <div className="flex items-center justify-end gap-1.5">
                      {canWrite ? (
                        <>
                          <SubjectPanel
                            row={row}
                            trigger={{ label: 'Edit', className: 'btn btn-ghost !px-2.5 !py-1' }}
                          />
                          <form action={deleteSubject}>
                            <input type="hidden" name="id" value={row.id} />
                            <ConfirmButton
                              className="btn btn-danger !px-2.5 !py-1"
                              title={`Delete ${row.name}?`}
                              message="Sections currently teaching it will lose the link."
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
