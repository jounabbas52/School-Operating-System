import Link from 'next/link'
import { getSchoolContext } from '@/lib/school-context'
import ExportButtons from '@/components/export-buttons'
import RefreshButton from '@/components/refresh-button'
import {
  ACTIONS,
  ACTION_LABEL,
  ACTION_TONE,
  MODULE_GROUPS,
  MODULE_LABEL,
  actorName,
  changedFields,
  recordLabel,
  stamp,
  summarise,
  tablesInGroup,
} from '@/lib/audit'

export const metadata = { title: 'Audit Logs' }

// How many rows one page shows. The trail grows without bound, so this screen
// is always a window onto it rather than the whole thing.
const PAGE_SIZE = 50

export default async function AuditLogsPage({ searchParams }) {
  const params = await searchParams
  const moduleFilter = params?.module ?? ''
  const userFilter = params?.user ?? ''
  const actionFilter = params?.action ?? ''
  const from = params?.from ?? ''
  const to = params?.to ?? ''
  const page = Math.max(1, Number(params?.page) || 1)

  const { schoolId, permissions, supabase } = await getSchoolContext()

  // RLS already refuses these rows without core.audit.read, but a bare empty
  // table reads as "nothing ever happened" rather than "you cannot see this".
  if (!permissions.has('core.audit.read')) {
    return (
      <div className="flex flex-col gap-5">
        <h1 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>
          Audit Logs
        </h1>
        <div className="card px-6 py-16 text-center" style={{ borderStyle: 'dashed' }}>
          <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            Not available to your role
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm" style={{ color: 'var(--muted)' }}>
            Viewing the audit trail needs the <strong>View the audit trail</strong> permission.
          </p>
          <Link href="/school" className="btn btn-ghost mt-4">
            Back to dashboard
          </Link>
        </div>
      </div>
    )
  }

  let query = supabase
    .from('audit_logs')
    .select(
      'id, actor_profile_id, action, target_table, target_id, before, after, created_at, profiles(full_name, email)',
      { count: 'exact' }
    )
    .eq('school_id', schoolId)

  if (moduleFilter) query = query.in('target_table', tablesInGroup(moduleFilter))
  if (userFilter) query = query.eq('actor_profile_id', userFilter)
  if (actionFilter) query = query.eq('action', actionFilter)
  // created_at is a timestamptz; the To date is pushed to the end of its day
  // so "to the 14th" includes the 14th rather than stopping at midnight.
  if (from) query = query.gte('created_at', `${from}T00:00:00`)
  if (to) query = query.lte('created_at', `${to}T23:59:59`)

  const offset = (page - 1) * PAGE_SIZE

  const [{ data: logRows, count, error }, { data: users }] = await Promise.all([
    query.order('created_at', { ascending: false }).range(offset, offset + PAGE_SIZE - 1),
    supabase
      .from('profiles')
      .select('id, full_name, email')
      .eq('school_id', schoolId)
      .order('full_name'),
  ])

  const entries = logRows ?? []
  const total = count ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const exportRows = entries.map((e, i) => ({
    n: offset + i + 1,
    when: e.created_at ?? '',
    who: actorName(e.profiles),
    action: ACTION_LABEL[e.action] ?? e.action,
    module: MODULE_LABEL[e.target_table] ?? e.target_table ?? '',
    record: recordLabel(e),
    details: summarise(e),
  }))

  const filtered = Boolean(moduleFilter || userFilter || actionFilter || from || to)

  // Every link keeps the other filters; only the named one changes.
  const keep = (next) => {
    const sp = new URLSearchParams()
    const merged = { module: moduleFilter, user: userFilter, action: actionFilter, from, to, ...next }
    for (const [key, value] of Object.entries(merged)) {
      if (value) sp.set(key, String(value))
    }
    const qs = sp.toString()
    return qs ? `/school/audit?${qs}` : '/school/audit'
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>
            Audit Logs
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
            Who changed what, and when — across fees, marks, students and users
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <RefreshButton />
          <ExportButtons
            rows={exportRows}
            columns={[
              { key: 'n', label: '#' },
              { key: 'when', label: 'When' },
              { key: 'who', label: 'Who' },
              { key: 'action', label: 'Action' },
              { key: 'module', label: 'Module' },
              { key: 'record', label: 'Record' },
              { key: 'details', label: 'Details' },
            ]}
            filename="audit-logs"
            title="Audit Logs"
            subtitle={`${total} entr${total === 1 ? 'y' : 'ies'}`}
          />
          <span className="pill pill-muted">
            {total} entr{total === 1 ? 'y' : 'ies'}
          </span>
        </div>
      </div>

      {/* --------------------------------------------------------- filters */}
      <form className="card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <label className="label" htmlFor="au-module">
            Module
          </label>
          <select id="au-module" name="module" defaultValue={moduleFilter} className="field">
            <option value="">All modules</option>
            {MODULE_GROUPS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="au-user">
            User
          </label>
          <select id="au-user" name="user" defaultValue={userFilter} className="field">
            <option value="">All users</option>
            {(users ?? []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name || u.email}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="au-from">
            From
          </label>
          <input id="au-from" name="from" type="date" defaultValue={from} className="field" />
        </div>

        <div>
          <label className="label" htmlFor="au-to">
            To
          </label>
          <input id="au-to" name="to" type="date" defaultValue={to} className="field" />
        </div>

        <div className="flex items-end gap-2">
          <button className="btn btn-primary flex-1">Apply</button>
          {filtered ? (
            <Link href="/school/audit" className="btn btn-ghost flex-1">
              Clear filters
            </Link>
          ) : (
            <span
              className="btn btn-ghost flex-1 cursor-default"
              style={{ opacity: 0.5 }}
              aria-hidden="true"
            >
              Clear filters
            </span>
          )}
        </div>
      </form>

      {/* ----------------------------------------------------- action tabs */}
      <div className="flex flex-wrap items-center gap-1">
        <Link href={keep({ action: '' })} className={`tab ${!actionFilter ? 'tab-on' : ''}`}>
          All actions
        </Link>
        {ACTIONS.map((a) => (
          <Link
            key={a.id}
            href={keep({ action: a.id })}
            className={`tab ${actionFilter === a.id ? 'tab-on' : ''}`}
          >
            {a.label}
          </Link>
        ))}
      </div>

      {error && (
        <p
          className="rounded-lg px-3 py-2 text-sm"
          style={{ background: 'var(--red-soft)', color: 'var(--red-ink)' }}
        >
          {error.message}
        </p>
      )}

      {!entries.length ? (
        <div className="card px-6 py-16 text-center" style={{ borderStyle: 'dashed' }}>
          <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            No audit entries found
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm" style={{ color: 'var(--muted)' }}>
            {filtered
              ? 'Nothing matches those filters.'
              : 'The trail records changes to students, staff, marks, fees, payroll and users. It fills as people use the system.'}
          </p>
        </div>
      ) : (
        <>
          <div className="card overflow-x-auto">
            <table className="table min-w-[64rem]">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>Action</th>
                  <th>Module</th>
                  <th>Record</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => {
                  const changes = changedFields(e)
                  return (
                    <tr key={e.id}>
                      <td className="whitespace-nowrap tabular-nums">{stamp(e.created_at)}</td>
                      <td>
                        <span className="font-medium" style={{ color: 'var(--ink)' }}>
                          {actorName(e.profiles)}
                        </span>
                      </td>
                      <td>
                        <span className={`pill ${ACTION_TONE[e.action] ?? 'pill-muted'}`}>
                          {(ACTION_LABEL[e.action] ?? e.action).toUpperCase()}
                        </span>
                      </td>
                      <td>
                        <span style={{ color: 'var(--brand-ink)' }}>
                          {MODULE_LABEL[e.target_table] ?? e.target_table ?? '—'}
                        </span>
                      </td>
                      <td>
                        <span className="pill pill-muted font-mono">{recordLabel(e)}</span>
                      </td>
                      <td>
                        <span style={{ color: 'var(--ink-2)' }}>{summarise(e)}</span>
                        {/* The first few changed fields, as the old-value →
                            new-value pairs. More than three turns the row into
                            a wall; the count in the summary still says how
                            many there were. */}
                        {changes.length > 0 && (
                          <ul className="mt-1 flex flex-col gap-0.5">
                            {changes.slice(0, 3).map((c) => (
                              <li
                                key={c.field}
                                className="text-[0.68rem]"
                                style={{ color: 'var(--muted)' }}
                              >
                                <span className="font-medium">{c.field}:</span> {c.from} →{' '}
                                <span style={{ color: 'var(--ink-2)' }}>{c.to}</span>
                              </li>
                            ))}
                            {changes.length > 3 && (
                              <li className="text-[0.68rem]" style={{ color: 'var(--muted-2)' }}>
                                +{changes.length - 3} more
                              </li>
                            )}
                          </ul>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {pages > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm" style={{ color: 'var(--muted)' }}>
                Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
              </span>
              <div className="flex items-center gap-2">
                {page > 1 ? (
                  <Link href={keep({ page: page - 1 })} className="btn btn-ghost">
                    ← Previous
                  </Link>
                ) : (
                  <span className="btn btn-ghost" style={{ opacity: 0.5 }}>
                    ← Previous
                  </span>
                )}
                <span className="text-sm tabular-nums" style={{ color: 'var(--ink-2)' }}>
                  Page {page} of {pages}
                </span>
                {page < pages ? (
                  <Link href={keep({ page: page + 1 })} className="btn btn-ghost">
                    Next →
                  </Link>
                ) : (
                  <span className="btn btn-ghost" style={{ opacity: 0.5 }}>
                    Next →
                  </span>
                )}
              </div>
            </div>
          )}
        </>
      )}

      <p className="text-xs" style={{ color: 'var(--muted)' }}>
        The trail is written by the database itself and is read-only — nothing in the app can edit
        or remove an entry.
      </p>
    </div>
  )
}
