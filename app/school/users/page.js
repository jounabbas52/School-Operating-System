import RefreshButton from '@/components/refresh-button'
import { getSchoolContext } from '@/lib/school-context'
import { accessTree } from '@/lib/access'
import NewUser from './new-user'
import RowActions from './row-actions'

export const metadata = { title: 'Users & Access' }

// Who may sign in, and what each of them may do.
//
// There are no roles. Every row is one person with their own sheet, and the
// guard button at the end of the row is where that sheet is set -- page by
// page, with view / create / edit / delete on each.
//
// The administrator is simply somebody whose sheet has everything ticked.
// Staff are created with nothing ticked, and are opened up a page at a time.

function Stat({ n, label, tone }) {
  return (
    <div className="card flex items-center gap-3 p-4">
      <span
        className="flex size-10 shrink-0 items-center justify-center rounded-xl text-sm font-semibold"
        style={{ background: tone.bg, color: tone.ink }}
        aria-hidden="true"
      >
        {tone.icon}
      </span>
      <span>
        <span className="block text-lg font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>
          {n}
        </span>
        <span className="block text-xs" style={{ color: 'var(--muted)' }}>
          {label}
        </span>
      </span>
    </div>
  )
}

export default async function UsersPage() {
  const { schoolId, modules, permissions, profile: me, supabase } = await getSchoolContext()

  const canWrite = permissions.has('users.write')

  const [{ data: people, error }, { data: access, error: accessError }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, email, phone, status, last_login, created_at')
      .eq('school_id', schoolId)
      .order('created_at'),
    // Everybody's list in one read, split per person below -- one query
    // rather than one per row.
    supabase
      .from('user_page_access')
      .select('profile_id, page, section, can_view, can_edit, can_delete')
      .eq('school_id', schoolId),
  ])

  // The guard's tree, narrowed to what this school actually has. A page for a
  // module nobody bought would be a box that grants nothing.
  const tree = accessTree(modules.map((m) => m.code))
  const totalPermissions = tree.reduce(
    (n, g) => n + g.pages.reduce((m, p) => m + p.actions.length, 0),
    0
  )

  const sheets = new Map()
  for (const row of access ?? []) {
    const list = sheets.get(row.profile_id) ?? []
    list.push(row)
    sheets.set(row.profile_id, list)
  }

  const rows = people ?? []
  const activeCount = rows.filter((p) => p.status === 'active').length

  const stamp = (value) =>
    value
      ? new Date(value).toLocaleString('en-GB', {
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })
      : '—'

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>
            Users &amp; Access
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
            Manage staff accounts and what each of them may do. Access is per person — the{' '}
            <strong>Access</strong> button on a row opens that one person&rsquo;s sheet.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <RefreshButton />
          {canWrite && <NewUser />}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          n={rows.length}
          label="Total users"
          tone={{ bg: 'var(--brand-soft)', ink: 'var(--brand-ink)', icon: '👥' }}
        />
        <Stat
          n={activeCount}
          label="Active"
          tone={{ bg: 'var(--green-soft)', ink: 'var(--green-ink)', icon: '✓' }}
        />
        <Stat
          n={rows.length - activeCount}
          label="Suspended"
          tone={{ bg: 'var(--red-soft)', ink: 'var(--red-ink)', icon: '⃠' }}
        />
      </div>

      {/* An unreadable access table is not "nobody has access" -- it is the
          screen being unable to answer, and a blank Access column on every
          row would be a confident lie. */}
      {accessError && (
        <p
          className="rounded-lg px-3 py-2 text-sm"
          style={{ background: 'var(--amber-soft)', color: 'var(--amber-ink)' }}
        >
          <strong>Access sheets could not be read.</strong> {accessError.message} — run{' '}
          <code className="font-mono text-[0.72rem]">supabase/migrations/025_page_access.sql</code>{' '}
          in the SQL editor. Until then the Access column below is blank for everybody because of
          this, not because nobody has access.
        </p>
      )}

      {error && (
        <p
          className="rounded-lg px-3 py-2 text-sm"
          style={{ background: 'var(--red-soft)', color: 'var(--red-ink)' }}
        >
          {error.message}
        </p>
      )}

      <div className="card overflow-x-auto">
        <table className="table min-w-[46rem]">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Status</th>
              <th>Last sign-in</th>
              <th>Access</th>
              <th className="!text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((person) => {
              const isMe = person.id === me?.id
              const sheet = sheets.get(person.id) ?? []
              const granted = sheet.reduce(
                (n, r) =>
                  n +
                  (r.can_view ? 1 : 0) +
                  (r.can_edit ? 1 : 0) +
                  (r.can_delete ? 1 : 0),
                0
              )
              const visible = sheet.filter((r) => r.can_view).length
              const everything = totalPermissions > 0 && granted >= totalPermissions

              return (
                <tr key={person.id}>
                  <td style={{ color: 'var(--ink)' }}>
                    {person.full_name || '—'}
                    {isMe && (
                      <span className="ml-2 text-xs" style={{ color: 'var(--muted-2)' }}>
                        you
                      </span>
                    )}
                  </td>
                  <td style={{ color: 'var(--muted)' }}>{person.email}</td>
                  <td style={{ color: 'var(--muted)' }}>{person.phone || '—'}</td>

                  <td>
                    <span
                      className={`pill ${person.status === 'active' ? 'pill-green' : 'pill-red'}`}
                    >
                      {person.status}
                    </span>
                  </td>

                  <td style={{ color: 'var(--muted)' }}>{stamp(person.last_login)}</td>

                  {/* What they hold, in one glance. "Everything" is what an
                      administrator looks like; zero is what a new account
                      looks like until somebody opens the guard. */}
                  <td>
                    {everything ? (
                      <span className="pill pill-brand">everything</span>
                    ) : granted ? (
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm tabular-nums" style={{ color: 'var(--ink-2)' }}>
                          {granted}/{totalPermissions}
                        </span>
                        <span className="text-[0.65rem]" style={{ color: 'var(--muted-2)' }}>
                          {visible} page{visible === 1 ? '' : 's'}
                        </span>
                      </span>
                    ) : (
                      <span className="pill pill-muted">nothing yet</span>
                    )}
                  </td>

                  <td>
                    <RowActions
                      person={person}
                      tree={tree}
                      rows={sheet}
                      canWrite={canWrite}
                      isMe={isMe}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-1.5 text-xs" style={{ color: 'var(--muted)' }}>
        <p>
          <strong>Access</strong> opens one person&rsquo;s sheet: every page in the app, with See,
          Create, Edit and Delete on each. A page they are not given never appears in their sidebar,
          and the database refuses the rows as well — so it cannot be reached by typing the address
          in by hand either. A page they can see but not edit opens exactly as it does for you, with
          nothing on it that changes anything.
        </p>
        <p>
          New accounts are created with <strong>no access at all</strong>. That is deliberate: an
          account that can reach nothing is harmless, and defaults are what people forget to change.
        </p>
      </div>
    </div>
  )
}
