import Link from 'next/link'
import { notFound } from 'next/navigation'
import RefreshButton from '@/components/refresh-button'
import SubmitButton from '@/components/submit-button'
import ConfirmButton from '@/components/confirm'
import { Select } from '@/components/combobox'
import { getSchoolContext } from '@/lib/school-context'
import { ACTION_COLUMN, accessFrom, accessTree } from '@/lib/access'
import { ACTION_LABEL, ACTION_TONE, MODULE_LABEL, recordLabel, stamp, summarise } from '@/lib/audit'
import { NAV } from '../../nav-items'
import { setUserStatus, linkStaffAccount, removeUser, grantFullAccess } from '../../actions'
import AccessEditor from '../access-editor'
import PasswordForm from './password-form'

export const metadata = { title: 'User' }

// ONE PERSON, ONE FILE.
//
// What somebody may do is a list of pages with view / edit / delete on each,
// belonging to them and nobody else. This page is that list, plus everything
// else about them: the login, the password, their HR record, their documents
// and what they have been doing.
//
// A page they were not given does not exist for them -- no sidebar entry, no
// screen, and no rows either, because has_permission() reads the same list
// the switches write to.

const STATUS_PILL = { active: 'pill-green', suspended: 'pill-red', inactive: 'pill-muted' }

function initials(name, email) {
  const source = (name || email || '?').trim()
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return source.slice(0, 2).toUpperCase()
}

function Card({ title, note, action, children, wide }) {
  return (
    <section className={`card flex flex-col gap-3 p-4 ${wide ? 'lg:col-span-2' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2
            className="text-[0.68rem] font-bold uppercase tracking-wider"
            style={{ color: 'var(--muted)' }}
          >
            {title}
          </h2>
          {note && (
            <p className="mt-0.5 text-xs" style={{ color: 'var(--muted-2)' }}>
              {note}
            </p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

// A definition row. `mono` for ids and codes, which are read character by
// character rather than as words.
function Row({ label, children, mono }) {
  return (
    <div
      className="flex flex-wrap items-baseline justify-between gap-3 border-b py-1.5 last:border-b-0"
      style={{ borderColor: 'var(--border-soft)' }}
    >
      <span className="text-xs" style={{ color: 'var(--muted)' }}>
        {label}
      </span>
      <span
        className={`min-w-0 text-right text-sm ${mono ? 'font-mono text-[0.72rem]' : ''}`}
        style={{ color: 'var(--ink-2)' }}
      >
        {children ?? '—'}
      </span>
    </div>
  )
}

function Tick({ on, tone = 'var(--green-ink)' }) {
  return on ? (
    <span style={{ color: tone }} aria-label="yes">
      ✓
    </span>
  ) : (
    <span style={{ color: 'var(--muted-2)' }} aria-label="no">
      —
    </span>
  )
}

export default async function UserDetailPage({ params }) {
  const { id } = await params
  const { schoolId, modules, permissions, profile: me, supabase } = await getSchoolContext()

  if (!permissions.has('users.read')) {
    return (
      <div className="flex flex-col gap-5">
        <h1 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>
          User
        </h1>
        <div className="card px-6 py-16 text-center" style={{ borderStyle: 'dashed' }}>
          <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            Not available to you
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm" style={{ color: 'var(--muted)' }}>
            Viewing a user needs <strong>View</strong> on the Users &amp; Access page of your own
            list.
          </p>
          <Link href="/school" className="btn btn-ghost mt-4">
            Back to dashboard
          </Link>
        </div>
      </div>
    )
  }

  const canWrite = permissions.has('users.write')
  const canSeeAudit = permissions.has('core.audit.read')

  const [{ data: person }, { data: staffRows }, { data: activity }, { data: accessRows }] =
    await Promise.all([
      supabase
        .from('profiles')
        .select(
          'id, full_name, preferred_name, email, phone, address, gender, date_of_birth, avatar_url, status, last_login, created_at, updated_at, school_id'
        )
        .eq('id', id)
        .eq('school_id', schoolId)
        .maybeSingle(),
      supabase
        .from('staff')
        .select(
          'id, first_name, last_name, staff_number, designation, department, employment_type, hire_date, work_email, phone, work_phone, cnic, status, profile_id'
        )
        .eq('school_id', schoolId)
        .eq('is_deleted', false)
        .order('first_name'),
      canSeeAudit
        ? supabase
            .from('audit_logs')
            .select('id, action, target_table, target_id, before, after, created_at')
            .eq('school_id', schoolId)
            .eq('actor_profile_id', id)
            .order('created_at', { ascending: false })
            .limit(12)
        : Promise.resolve({ data: [] }),
      // Their sheet, page by page. This IS their permissions -- there is
      // nothing else.
      supabase
        .from('user_page_access')
        .select('page, section, can_view, can_edit, can_delete')
        .eq('school_id', schoolId)
        .eq('profile_id', id),
    ])

  // A profile from another school is not "forbidden" so much as not a thing
  // that exists from in here -- RLS has already filtered it away.
  if (!person) notFound()

  const staff = (staffRows ?? []).find((s) => s.profile_id === person.id) ?? null

  // Only staff nobody has claimed yet, plus whoever this person already is,
  // so the select cannot be used to steal a colleague's record.
  const linkable = (staffRows ?? []).filter((s) => !s.profile_id || s.profile_id === person.id)
  const canLinkStaff = permissions.has('staff.write') && (staffRows ?? []).length > 0
  const staffLabel = (s) =>
    `${[s.first_name, s.last_name].filter(Boolean).join(' ')}${
      s.staff_number ? ` · ${s.staff_number}` : ''
    }`

  // The personnel file hangs off the STAFF row, not the login, so it can only
  // be read once the link above is known.
  const { data: documents } = staff
    ? await supabase
        .from('staff_documents')
        .select('id, doc_type, doc_number, issue_date, expiry_date, status, notes')
        .eq('school_id', schoolId)
        .eq('staff_id', staff.id)
        .eq('is_deleted', false)
        .order('expiry_date', { nullsFirst: false })
    : { data: [] }

  const isMe = person.id === me?.id
  const sheet = accessRows ?? []
  const byPage = Object.fromEntries(sheet.map((r) => [r.page, r]))

  // The page list, narrowed to the modules this school has: a page for a
  // module nobody bought would be a line that means nothing however it reads.
  const enabledModules = new Set(modules.map((m) => m.code))
  const tree = accessTree(modules.map((m) => m.code))

  const allPages = tree.flatMap((g) => g.pages)
  const totalPermissions = allPages.reduce((n, p) => n + p.actions.length, 0)
  const grantedCount = allPages.reduce(
    (n, p) => n + p.actions.filter((a) => byPage[p.key]?.[ACTION_COLUMN[a]]).length,
    0
  )
  const open = allPages.filter((p) => byPage[p.key]?.can_view)

  const { permissions: granted } = accessFrom(sheet)

  // The sidebar this person sees, worked out exactly as the layout works it
  // out: module gate, then their own page rows.
  const reachable = NAV.filter((item) => enabledModules.has(item.module)).flatMap((item) =>
    item.children
      ? item.children
          .filter((c) => (!c.module || enabledModules.has(c.module)) && byPage[c.href]?.can_view)
          .map((c) => ({ ...c, group: item.label }))
      : item.href && (item.href === '/school' || byPage[item.href]?.can_view)
        ? [{ ...item, group: null }]
        : []
  )

  const name = person.full_name || person.email || 'User'

  return (
    <div className="flex flex-col gap-5">
      {/* ----------------------------------------------------------- header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="flex size-11 shrink-0 items-center justify-center rounded-xl text-sm font-semibold text-white"
            style={{ background: 'var(--brand-grad)' }}
            aria-hidden="true"
          >
            {initials(person.full_name, person.email)}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>
                {name}
              </h1>
              {isMe && <span className="pill pill-brand">you</span>}
              <span className={`pill ${STATUS_PILL[person.status] ?? 'pill-muted'}`}>
                {person.status}
              </span>
              <span className="pill pill-blue">
                {open.length} section{open.length === 1 ? '' : 's'}
              </span>
              {staff && <span className="pill pill-muted">staff linked</span>}
            </div>
            <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
              {person.email}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <RefreshButton />
          <Link href="/school/users" className="btn btn-ghost">
            All users
          </Link>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ---------------------------------------------------- access sheet */}
        <Card
          wide
          title="Access"
          note={`${grantedCount} of ${totalPermissions} granted · ${open.length} page${
            open.length === 1 ? '' : 's'
          } in their sidebar`}
          action={
            canWrite &&
            !isMe && (
              <span className="flex flex-wrap items-center gap-2">
                {/* An administrator needs everything; staff are opened one
                    page at a time. Making the first case one click keeps
                    anybody from ticking two hundred boxes and missing one. */}
                <form action={grantFullAccess}>
                  <input type="hidden" name="profile_id" value={person.id} />
                  <SubmitButton
                    pendingLabel="Opening…"
                    className="btn btn-ghost !px-2.5 !py-1 text-xs"
                  >
                    Give full access
                  </SubmitButton>
                </form>
                <AccessEditor
                  profileId={person.id}
                  personName={name}
                  tree={tree}
                  rows={sheet}
                  trigger={{
                    label: 'Manage access',
                    className: 'btn btn-primary !px-3 !py-1.5 text-xs',
                  }}
                />
              </span>
            )
          }
        >
          {isMe && (
            <p className="text-xs" style={{ color: 'var(--muted-2)' }}>
              This is your own sheet, so it is read-only here. Another administrator can change it —
              which is what stops anybody from quietly locking the school out of its own user screen.
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            {tree.map((group) => {
              const openHere = group.pages.filter((page) => byPage[page.key]?.can_view)
              return (
                <div
                  key={group.key}
                  className="rounded-xl p-3"
                  style={{
                    background: openHere.length ? 'var(--card-alt)' : 'transparent',
                    border: '1px solid var(--border-soft)',
                    opacity: openHere.length ? 1 : 0.5,
                  }}
                >
                  <div className="mb-1.5 flex items-baseline justify-between gap-2">
                    <p
                      className="text-[0.65rem] font-bold uppercase tracking-wider"
                      style={{ color: openHere.length ? 'var(--brand-ink)' : 'var(--muted)' }}
                    >
                      {group.label}
                    </p>
                    <span className="font-mono text-[0.62rem]" style={{ color: 'var(--muted-2)' }}>
                      {openHere.length}/{group.pages.length}
                    </span>
                  </div>

                  <ul className="flex flex-col gap-0.5">
                    {group.pages.map((page) => {
                      const row = byPage[page.key]
                      return (
                        <li
                          key={page.key}
                          className="flex items-center justify-between gap-2 text-sm"
                          style={{ color: row?.can_view ? 'var(--ink-2)' : 'var(--muted-2)' }}
                        >
                          <span className="min-w-0 truncate">{page.label}</span>
                          <span className="flex shrink-0 items-center gap-1.5 font-mono text-[0.62rem]">
                            <span title="View">
                              <Tick on={row?.can_view} />
                            </span>
                            {page.actions.includes('edit') && (
                              <span title="Edit">
                                <Tick on={row?.can_edit} tone="var(--amber)" />
                              </span>
                            )}
                            {page.actions.includes('delete') && (
                              <span title="Delete">
                                <Tick on={row?.can_delete} tone="var(--red-ink)" />
                              </span>
                            )}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )
            })}
          </div>

          <p className="text-xs" style={{ color: 'var(--muted-2)' }}>
            Three marks per page, in order: <strong>view · edit · delete</strong>. A page they can
            view but not edit opens exactly as it does for you — same screen, same records — with
            no Add, no Save and no Delete on it, and the database refusing those writes underneath.
            This list is {name}&rsquo;s alone; changing it changes nothing for anybody else.
          </p>
        </Card>

        {/* ---------------------------------------------------------- login */}
        <Card title="Login" note="The account this person signs in with.">
          <div className="flex flex-col">
            <Row label="Full name">{person.full_name}</Row>
            <Row label="Preferred name">{person.preferred_name}</Row>
            <Row label="Email">{person.email}</Row>
            <Row label="Phone">{person.phone}</Row>
            <Row label="Gender">{person.gender}</Row>
            <Row label="Date of birth">{person.date_of_birth}</Row>
            <Row label="Address">{person.address}</Row>
            <Row label="Status">
              <span className={`pill ${STATUS_PILL[person.status] ?? 'pill-muted'}`}>
                {person.status}
              </span>
            </Row>
            <Row label="Added">{stamp(person.created_at)}</Row>
            <Row label="Last changed">{stamp(person.updated_at)}</Row>
            {/* profiles.last_login is in the schema but nothing writes to it
                yet -- sign-in happens in the browser against Supabase Auth and
                never touches this table. Printing "never" would be a lie. */}
            <Row label="Last sign-in">
              {person.last_login ? (
                stamp(person.last_login)
              ) : (
                <span style={{ color: 'var(--muted-2)' }}>not recorded</span>
              )}
            </Row>
            <Row label="User ID" mono>
              {person.id}
            </Row>
          </div>

          {canWrite && !isMe && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <form action={setUserStatus}>
                <input type="hidden" name="profile_id" value={person.id} />
                <input
                  type="hidden"
                  name="status"
                  value={person.status === 'active' ? 'suspended' : 'active'}
                />
                <SubmitButton
                  className={person.status === 'active' ? 'btn btn-danger' : 'btn btn-green'}
                >
                  {person.status === 'active' ? 'Suspend this login' : 'Reactivate this login'}
                </SubmitButton>
              </form>

              {/* Detach, not destroy. Their auth account and everything they
                  created stay, so the audit trail still has an author and
                  nothing cascades away behind the delete. */}
              <form action={removeUser}>
                <input type="hidden" name="profile_id" value={person.id} />
                <ConfirmButton
                  className="btn btn-danger"
                  title={`Remove ${name} from this school?`}
                  message="Their access sheet is deleted and they lose everything immediately. The sign-in account, and everything they ever created, stays intact — so this can be undone by adding them back, and the audit trail keeps its author."
                  confirmLabel="Remove"
                >
                  Delete from school
                </ConfirmButton>
              </form>
            </div>
          )}
        </Card>

        {/* ------------------------------------------------------- password */}
        <Card title="Password" note="Set a new one. Nobody can read the old one.">
          {canWrite ? (
            <PasswordForm profileId={person.id} email={person.email} />
          ) : (
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              Setting a password needs <strong>Add &amp; edit</strong> on Users &amp; Access.
            </p>
          )}
          <p className="text-xs" style={{ color: 'var(--muted-2)' }}>
            Supabase Auth stores a bcrypt hash in{' '}
            <code className="font-mono text-[0.7rem]">auth.users</code>, not the password itself, so
            there is nothing to display — the hash does not reverse and this app&rsquo;s key cannot
            even read it. Setting one goes through{' '}
            <code className="font-mono text-[0.7rem]">admin_set_password()</code>, which checks your
            access, refuses anybody outside this school, refuses platform administrators, and writes
            a line to the audit trail.
          </p>
        </Card>

        {/* ---------------------------------------------------------- pages */}
        <Card
          title="Pages they can open"
          note="Built from the sheet above, exactly as the sidebar builds it."
        >
          {!reachable.length ? (
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              The dashboard only.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {reachable.map((item) => (
                <li
                  key={item.href}
                  className="flex flex-wrap items-baseline justify-between gap-2 border-b py-1 last:border-b-0"
                  style={{ borderColor: 'var(--border-soft)' }}
                >
                  <span className="text-sm" style={{ color: 'var(--ink-2)' }}>
                    {item.group && <span style={{ color: 'var(--muted-2)' }}>{item.group} / </span>}
                    {item.label}
                    {item.built === false && (
                      <span className="ml-1.5 pill pill-muted">not built</span>
                    )}
                  </span>
                  <code className="font-mono text-[0.65rem]" style={{ color: 'var(--muted-2)' }}>
                    {item.href}
                  </code>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* --------------------------------------------------- staff record */}
        <Card
          title="Staff record (HR)"
          note="Who this login is in HR. Separate from what they may do."
        >
          {staff ? (
            <div className="flex flex-col">
              <Row label="Name">{staffLabel(staff)}</Row>
              <Row label="Designation">{staff.designation}</Row>
              <Row label="Department">{staff.department}</Row>
              <Row label="Employment type">{staff.employment_type}</Row>
              <Row label="Hire date">{staff.hire_date}</Row>
              <Row label="Work email">{staff.work_email}</Row>
              <Row label="Phone">{staff.phone}</Row>
              <Row label="Work phone">{staff.work_phone}</Row>
              <Row label="CNIC">{staff.cnic}</Row>
              <Row label="Status">{staff.status}</Row>
              <Row label="Staff ID" mono>
                {staff.id}
              </Row>
            </div>
          ) : (
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              Not linked to any staff record, which is fine: access decides what somebody may
              DO, and this says who they ARE in HR. A login with no staff record is a perfectly
              good office account; linking one lets payroll, leave and the staff directory find
              them.
            </p>
          )}

          {canLinkStaff ? (
            <form action={linkStaffAccount} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="profile_id" value={person.id} />
              <Select
                name="staff_id"
                className="w-60"
                defaultValue={staff?.id ?? ''}
                placeholder="— not staff —"
                options={linkable.map((s) => ({ id: s.id, label: staffLabel(s) }))}
                emptyLabel="Every staff record is linked."
              />
              <SubmitButton pendingLabel="Linking…" className="btn btn-ghost !px-2.5 !py-1 text-xs">
                {staff ? 'Change link' : 'Link'}
              </SubmitButton>
              <Link href="/school/hr" className="text-xs" style={{ color: 'var(--brand-ink)' }}>
                HR / Staff
              </Link>
            </form>
          ) : (
            <p className="text-xs" style={{ color: 'var(--muted-2)' }}>
              {(staffRows ?? []).length
                ? 'Linking a login to a staff record needs Add & edit on HR / Staff.'
                : 'There are no staff records yet. Create one under HR / Staff, then link it here.'}
            </p>
          )}
        </Card>

        {/* ------------------------------------------------------ documents */}
        <Card
          title="Documents"
          note="Their personnel file — CNIC, degrees, contracts. Held against the staff record."
        >
          {!staff ? (
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              No staff record, so no personnel file.
            </p>
          ) : !documents?.length ? (
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              Nothing filed yet. Add documents under{' '}
              <Link href="/school/hr/documents" style={{ color: 'var(--brand-ink)' }}>
                HR / Documents
              </Link>
              .
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="table min-w-[28rem]">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Number</th>
                    <th>Issued</th>
                    <th>Expires</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((d) => (
                    <tr key={d.id}>
                      <td style={{ color: 'var(--ink-2)' }}>{d.doc_type}</td>
                      <td style={{ color: 'var(--muted)' }}>{d.doc_number || '—'}</td>
                      <td style={{ color: 'var(--muted)' }}>{d.issue_date || '—'}</td>
                      <td style={{ color: 'var(--muted)' }}>{d.expiry_date || '—'}</td>
                      <td>
                        <span
                          className={`pill ${
                            d.status === 'expired'
                              ? 'pill-red'
                              : d.status === 'expiring_soon'
                                ? 'pill-amber'
                                : 'pill-green'
                          }`}
                        >
                          {d.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* ------------------------------------------------------- activity */}
        <Card
          wide
          title="Recent activity"
          note="What this login has changed, newest first."
          action={
            canSeeAudit && (
              <Link
                href={`/school/audit?user=${person.id}`}
                className="text-xs font-medium"
                style={{ color: 'var(--brand-ink)' }}
              >
                Full trail
              </Link>
            )
          }
        >
          {!canSeeAudit ? (
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              Reading the audit trail needs <strong>See</strong> on the Audit Trail section of your
              own sheet.
            </p>
          ) : !activity?.length ? (
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              Nothing recorded. Either they have changed nothing, or everything they touched
              predates the audit triggers.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {activity.map((entry) => (
                <li
                  key={entry.id}
                  className="flex flex-col gap-0.5 border-b pb-1.5 last:border-b-0 last:pb-0"
                  style={{ borderColor: 'var(--border-soft)' }}
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className={`pill ${ACTION_TONE[entry.action] ?? 'pill-muted'}`}>
                      {ACTION_LABEL[entry.action] ?? entry.action}
                    </span>
                    <span className="text-sm" style={{ color: 'var(--ink-2)' }}>
                      {MODULE_LABEL[entry.target_table] ?? entry.target_table}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--muted-2)' }}>
                      {stamp(entry.created_at)}
                    </span>
                  </span>
                  <span className="text-xs" style={{ color: 'var(--muted)' }}>
                    {recordLabel(entry)} — {summarise(entry)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
