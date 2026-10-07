import { getSchoolContext } from '@/lib/school-context'
import { moveGradeLevel, deleteGradeLevel } from '../actions'
import GradeLevelPanel from './grade-level-panel'
import ConfirmButton from '@/components/confirm'
import ExportButtons from '@/components/export-buttons'

export const metadata = { title: 'Grade Levels' }

export default async function GradeLevelsPage() {
  const { schoolId, permissions, supabase } = await getSchoolContext()
  const canWrite = permissions.has('academics.write')

  const [{ data: levels, error }, { data: session }] = await Promise.all([
    supabase
      .from('grade_levels')
      .select('id, name, short_name, ordinal, stage')
      .eq('school_id', schoolId)
      .eq('is_deleted', false)
      .order('ordinal'),
    supabase
      .from('sessions')
      .select('id, name')
      .eq('school_id', schoolId)
      .eq('is_current', true)
      .maybeSingle(),
  ])

  // Classes in the ACTIVE session only -- a level with no class this year can
  // still be deleted, one with a class cannot.
  const { data: classes } = session
    ? await supabase
        .from('classes')
        .select('grade_level_id')
        .eq('school_id', schoolId)
        .eq('session_id', session.id)
        .eq('is_deleted', false)
    : { data: [] }

  const classCount = new Map()
  for (const row of classes ?? []) {
    classCount.set(row.grade_level_id, (classCount.get(row.grade_level_id) ?? 0) + 1)
  }

  const exportRows = (levels ?? []).map((row, index) => ({
    order: index + 1,
    name: row.name,
    short_name: row.short_name ?? '',
    stage: row.stage ?? '',
    classes: classCount.get(row.id) ?? 0,
  }))

  return (
    <div className="flex flex-col gap-5">
      <div
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl px-5 py-4"
        style={{ background: 'var(--side)' }}
      >
        <div>
          <h1 className="text-base font-semibold text-white">Grade Levels</h1>
          <p className="mt-0.5 text-sm text-slate-300">
            Permanent academic levels — reused every session (Nursery, Prep, 1st …)
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ExportButtons
            rows={exportRows}
            columns={[
              { key: 'order', label: 'Order' },
              { key: 'name', label: 'Grade level' },
              { key: 'short_name', label: 'Short' },
              { key: 'stage', label: 'Stage' },
              { key: 'classes', label: 'Classes (active session)' },
            ]}
            filename="grade-levels"
            title="Grade Levels"
            subtitle={session?.name}
          />
          {canWrite && (
            <GradeLevelPanel trigger={{ label: '+ Add Grade Level', className: 'btn btn-primary' }} />
          )}
        </div>
      </div>

      <div
        className="rounded-xl px-4 py-3"
        style={{ background: 'var(--brand-soft)', border: '1px solid var(--brand-soft)' }}
      >
        <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
          How grade levels work
        </p>
        <ul
          className="mt-1.5 flex list-disc flex-col gap-1 pl-4 text-sm"
          style={{ color: 'var(--ink-2)' }}
        >
          <li>
            Grade levels are <strong>permanent</strong> — &ldquo;1st&rdquo; is 1st every year,
            forever.
          </li>
          <li>
            Each session you create <strong>classes</strong> that belong to a grade level.
          </li>
          <li>
            Students are enrolled in a class, which gives them both the grade level and the session.
          </li>
          <li>Use the arrows to set display order — Nursery first, then Prep, then 1st.</li>
        </ul>
      </div>

      {error && (
        <p className="rounded-lg px-3 py-2 text-sm"
          style={{ background: 'var(--red-soft)', color: 'var(--red)' }}>
          {error.message}
        </p>
      )}

      <div className="card overflow-hidden">
        <div
          className="flex items-baseline justify-between gap-3 border-b px-4 py-3"
          style={{ borderColor: 'var(--border)' }}
        >
          <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
            All grade levels
          </p>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            {levels?.length ?? 0} defined
            {session ? ` · classes shown for ${session.name}` : ' · no active session'}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="table min-w-[44rem]">
            <thead>
              <tr>
                <th>Order</th>
                <th>Grade level name</th>
                <th>Classes (active session)</th>
                <th>Reorder</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {levels?.map((row, index) => {
                const used = classCount.get(row.id) ?? 0
                return (
                  <tr key={row.id}>
                    <td>
                      <span
                        className="flex size-6 items-center justify-center rounded-md text-xs font-semibold tabular-nums"
                        style={{ background: 'var(--card-alt)', color: 'var(--muted)' }}
                      >
                        {index + 1}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <span
                          className="flex size-7 items-center justify-center rounded-full text-[0.62rem] font-bold text-white"
                          style={{ background: 'var(--blue-600)' }}
                          aria-hidden="true"
                        >
                          {row.short_name ?? row.name.slice(0, 2).toUpperCase()}
                        </span>
                        <span className="font-medium" style={{ color: 'var(--ink)' }}>
                          {row.name}
                        </span>
                      </div>
                    </td>
                    <td>
                      {used ? (
                        <span className="pill pill-green">
                          {used} class{used === 1 ? '' : 'es'}
                        </span>
                      ) : (
                        <span className="text-xs italic" style={{ color: 'var(--muted-2)' }}>
                          No classes this session
                        </span>
                      )}
                    </td>
                    <td>
                      {canWrite && (
                        <div className="flex gap-1">
                          {['up', 'down'].map((direction) => (
                            <form action={moveGradeLevel} key={direction}>
                              <input type="hidden" name="id" value={row.id} />
                              <input type="hidden" name="direction" value={direction} />
                              <button
                                aria-label={`Move ${row.name} ${direction}`}
                                disabled={direction === 'up' ? index === 0 : index === levels.length - 1}
                                className="btn btn-ghost !px-2 !py-1 disabled:opacity-30"
                              >
                                {direction === 'up' ? '↑' : '↓'}
                              </button>
                            </form>
                          ))}
                        </div>
                      )}
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-1.5">
                        {canWrite && (
                          <>
                            <GradeLevelPanel
                              row={row}
                              trigger={{ label: 'Edit', className: 'btn btn-ghost !px-2.5 !py-1' }}
                            />
                            <form action={deleteGradeLevel}>
                              <input type="hidden" name="id" value={row.id} />
                              <ConfirmButton
                                disabled={used > 0}
                                buttonTitle={used > 0 ? 'Has classes in the active session' : undefined}
                                className="btn btn-danger !px-2.5 !py-1 disabled:opacity-35"
                                title={`Delete ${row.name}?`}
                                message="Permanent grade levels are reused every session — removing one affects future years too."
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
      </div>
    </div>
  )
}
