import RefreshButton from '@/components/refresh-button'
import { getSchoolContext } from '@/lib/school-context'
import { accessFrom, accessTree } from '@/lib/access'
import NewUser from './new-user'
import RowActions from './row-actions'

export const metadata = { title: 'Users & Access' }

// Who may sign in, and roughly what each of them may do. The detail is one
// click away, on their own access page.
//
// There are no roles. Two switches decide everything: a MODULE is on or off
// for this person, and inside a module that is on, each PAGE carries view,
// edit and delete.
//
// The administrator is simply somebody with everything switched on. Staff are
// created with nothing, and are opened up a module at a time.

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

  const [{ data: people, error }, { data: access, error: accessError }, { data: moduleRows }] =
    await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, email, phone, status, last_login, created_at, is_school_admin')
      .eq('school_id', schoolId)
      .order('created_at'),
    // Everybody's list in one read, split per person below -- one query
    // rather than one per row.
    supabase
      .from('user_page_access')
      .select('profile_id, page, section, can_view, can_edit, can_delete')
      .eq('school_id', schoolId),
    // Rule 1, for the summary: a page under a switched-off module is not
    // access, so counting it here would overstate what somebody has.
    supabase.from('user_module_access').select('profile_id, module, enabled').eq('school_id', schoolId),
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

  const modulesByPerson = new Map()
  for (const row of moduleRows ?? []) {
    const list = modulesByPerson.get(row.profile_id) ?? []
    list.push(row)
    modulesByPerson.set(row.profile_id, list)
  }

  // What this person can ACTUALLY reach, both rules applied -- the same
  // function the sidebar is built from, so the number in the table and the
  // menu they see cannot disagree.
  const summary = (id) => {
    const { pages } = accessFrom(sheets.get(id) ?? [], modulesByPerson.get(id) ?? [])
    let granted = 0
    for (const row of pages.values()) {
      granted += (row.view ? 1 : 0) + (row.edit ? 1 : 0) + (row.delete ? 1 : 0)
    }
    return {
      granted,
      visible: [...pages.values()].filter((p) => p.view).length,
      modules: (modulesByPerson.get(id) ?? []).filter((m) => m.enabled).length,
    }
  }

  // ADMINISTRATORS ARE NOT LISTED HERE.
  //
  // This screen is the list of people whose access is being decided, and an
  // administrator's is not: they have everything, always, with nothing to
  // configure. Showing them in a table of access levels only invites somebody
  // to try setting one.
  const everyone = people ?? []
  const admins = everyone.filter((p) => p.is_school_admin)
  const rows = everyone.filter((p) => !p.is_school_admin)
  const activeStaff = rows.filter((p) => p.status === 'active').length
  const awaiting = rows.filter((p) => summary(p.id).visible === 0).length

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
          label={`User ${rows.length === 1 ? 'account' : 'accounts'}`}
          tone={{ bg: 'var(--brand-soft)', ink: 'var(--brand-ink)', icon: '👥' }}
        />
        <Stat
          n={activeStaff}
          label="Active"
          tone={{ bg: 'var(--green-soft)', ink: 'var(--green-ink)', icon: '✓' }}
        />
        {/* The number that actually needs acting on: accounts that exist and
            can reach nothing yet. */}
        <Stat
          n={awaiting}
          label="Waiting for access"
          tone={{ bg: 'var(--amber-soft)', ink: 'var(--amber-ink)', icon: '⧗' }}
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
          <code className="font-mono text-[0.72rem]">supabase/migrations/026_simple_access.sql</code>{' '}
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
              const { granted, visible, modules: liveModules } = summary(person.id)
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
                          {visible} page{visible === 1 ? '' : 's'} · {liveModules} module
                          {liveModules === 1 ? '' : 's'}
                        </span>
                      </span>
                    ) : (
                      <span className="pill pill-muted">nothing yet</span>
                    )}
                  </td>

                  <td>
                    <RowActions person={person} canWrite={canWrite} isMe={isMe} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-1.5 text-xs" style={{ color: 'var(--muted)' }}>
        <p>
          <strong>Access</strong> opens one person&rsquo;s own page, with the whole menu on it.
          Each group has a switch: off, and that part of the app is not in their sidebar at all.
          Inside a group that is on, every page carries View, Edit and Delete. A page they were not
          given cannot be reached by typing the address in by hand either — the database refuses the
          rows as well. A page they can view but not edit opens exactly as it does for you, with
          nothing on it that changes anything.
        </p>
        <p>
          New accounts are created with <strong>no access at all</strong>. That is deliberate: an
          account that can reach nothing is harmless, and defaults are what people forget to change.
        </p>
        <p>
          <strong>Administrators</strong> are not on this system. They have every page of every
          module, always, and no list to configure — they are the people who write everybody
          else&rsquo;s. Appointing one is deliberately not a button here: it is{' '}
          <code className="font-mono text-[0.72rem]">
            SELECT make_school_admin(&apos;their@email&apos;);
          </code>{' '}
          in the SQL editor.
        </p>
      </div>
    </div>
  )
}
