import { getSchoolContext } from '@/lib/school-context'
import { activateSession } from '../actions'
import SessionPanel from './session-panel'
import ExportButtons from '@/components/export-buttons'

export const metadata = { title: 'Academic Sessions' }

const fmt = (d) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

export default async function SessionsPage() {
  const { schoolId, permissions, supabase } = await getSchoolContext()
  const canWrite = permissions.has('academics.write')

  const [{ data: sessions, error }, { data: classes }] = await Promise.all([
    supabase
      .from('sessions')
      .select('id, name, start_date, end_date, is_current, status')
      .eq('school_id', schoolId)
      .eq('is_deleted', false)
      .order('start_date', { ascending: false }),
    supabase
      .from('classes')
      .select('session_id')
      .eq('school_id', schoolId)
      .eq('is_deleted', false),
  ])

  const classCount = new Map()
  for (const row of classes ?? []) {
    classCount.set(row.session_id, (classCount.get(row.session_id) ?? 0) + 1)
  }

  const exportRows = (sessions ?? []).map((s) => ({
    name: s.name,
    start_date: fmt(s.start_date),
    end_date: fmt(s.end_date),
    classes: classCount.get(s.id) ?? 0,
    status: s.is_current ? 'Active' : 'Inactive',
  }))

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>
            Academic Sessions
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
            Manage school years — classes and students are linked to the active session
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ExportButtons
            rows={exportRows}
            columns={[
              { key: 'name', label: 'Session' },
              { key: 'start_date', label: 'Start date' },
              { key: 'end_date', label: 'End date' },
              { key: 'classes', label: 'Classes' },
              { key: 'status', label: 'Status' },
            ]}
            filename="sessions"
            title="Academic Sessions"
          />
          {canWrite && (
            <SessionPanel
              isFirst={!sessions?.length}
              trigger={{ label: '+ New Session', className: 'btn btn-primary' }}
            />
          )}
        </div>
      </div>

      <div
        className="flex gap-3 rounded-xl px-4 py-3"
        style={{ background: 'var(--brand-soft)', border: '1px solid var(--brand-soft)' }}
      >
        <span className="text-base leading-none" aria-hidden="true">⚡</span>
        <p className="text-sm" style={{ color: 'var(--ink)' }}>
          <strong>How sessions work:</strong> One session is <strong>Active</strong> at a time. All
          new classes and student admissions are automatically attached to it. At year-end, create
          the next session, promote students, then set it as active.
        </p>
      </div>

      {error && (
        <p className="rounded-lg px-3 py-2 text-sm"
          style={{ background: 'var(--red-soft)', color: 'var(--red)' }}>
          {error.message}
        </p>
      )}

      {!sessions?.length ? (
        <div className="card px-6 py-14 text-center" style={{ borderStyle: 'dashed' }}>
          <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            No sessions yet
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm" style={{ color: 'var(--muted)' }}>
            Create one for the current school year. Classes cannot exist without a session to
            belong to.
          </p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table min-w-[44rem]">
            <thead>
              <tr>
                <th>Session</th>
                <th>Start date</th>
                <th>End date</th>
                <th>Classes</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((row) => (
                <tr key={row.id}>
                  <td>
                    <div className="flex items-center gap-2.5">
                      <span
                        className="flex size-8 items-center justify-center rounded-lg text-xs font-semibold text-white"
                        style={{ background: row.is_current ? 'var(--green)' : 'var(--brand)' }}
                        aria-hidden="true"
                      >
                        {row.name.slice(2, 4)}
                      </span>
                      <span className="font-medium" style={{ color: 'var(--ink)' }}>
                        {row.name}
                      </span>
                    </div>
                  </td>
                  <td>{fmt(row.start_date)}</td>
                  <td>{fmt(row.end_date)}</td>
                  <td className="tabular-nums">{classCount.get(row.id) ?? 0}</td>
                  <td>
                    {row.is_current ? (
                      <span className="pill pill-green">● Active</span>
                    ) : (
                      <span className="pill pill-muted">Inactive</span>
                    )}
                  </td>
                  <td>
                    <div className="flex items-center justify-end gap-1.5">
                      {canWrite && (
                        <>
                          {!row.is_current && (
                            <form action={activateSession}>
                              <input type="hidden" name="id" value={row.id} />
                              <button className="btn btn-ghost !px-2.5 !py-1">Set active</button>
                            </form>
                          )}
                          <SessionPanel
                            row={row}
                            trigger={{ label: 'Edit', className: 'btn btn-ghost !px-2.5 !py-1' }}
                          />
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs" style={{ color: 'var(--muted)' }}>
        Sessions are never deleted — last year&rsquo;s results and fee history point at them.
      </p>
    </div>
  )
}
