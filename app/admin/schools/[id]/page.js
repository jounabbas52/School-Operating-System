import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { StatCard, StatRow } from '@/components/ui'
import RefreshButton from '@/components/refresh-button'
import ConfirmButton from '@/components/confirm'
import { Select } from '@/components/combobox'
import { toggleModule, applyPlan, setSuspended } from '../../actions'

// The category a module belongs to, as the catalogue spells it, mapped to
// something an operator reads. Grouping matters here: nineteen modules in one
// flat grid is a wall, and the question being asked is almost always about a
// whole area ("do they have finance?").
const CATEGORY_LABEL = {
  platform: 'Platform',
  academic: 'Academic',
  finance: 'Finance',
  hr: 'HR',
  operations: 'Operations',
  general: 'General',
}

const CATEGORY_ORDER = ['platform', 'academic', 'finance', 'hr', 'operations', 'general']

function initials(name) {
  return (name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()
}

function since(value) {
  if (!value) return '—'
  const ms = Date.parse(value)
  if (!Number.isFinite(ms)) return '—'
  return new Date(ms).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export async function generateMetadata({ params }) {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase
    .from('schools')
    .select('school_name')
    .eq('id', id)
    .maybeSingle()
  return { title: `${data?.school_name ?? 'School'} · Platform console` }
}

export default async function SchoolDetail({ params }) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: school }, { data: modules }, { data: enabled }, { data: plans }, { data: people }] =
    await Promise.all([
      supabase
        .from('schools')
        .select(
          'id, school_name, slug, is_suspended, suspended_reason, is_demo, created_at, plans(code, name)'
        )
        .eq('id', id)
        .maybeSingle(),
      supabase
        .from('modules')
        .select('code, name, category, is_core, description')
        .order('sort_order'),
      supabase
        .from('school_modules')
        .select('module_code, is_enabled, expires_at')
        .eq('school_id', id),
      supabase.from('plans').select('code, name').order('sort_order'),
      supabase
        .from('profiles')
        .select('id, full_name, email, status, profile_roles(roles(name, display_name))')
        .eq('school_id', id)
        .order('created_at'),
    ])

  if (!school) notFound()

  const enabledMap = new Map((enabled ?? []).map((row) => [row.module_code, row]))
  const isLive = (m) => m.is_core || Boolean(enabledMap.get(m.code)?.is_enabled)

  const allModules = modules ?? []
  const liveCount = allModules.filter(isLive).length

  // Group once, render in a fixed order so the page does not reshuffle when
  // the catalogue gains a module.
  const byCategory = new Map()
  for (const m of allModules) {
    const key = m.category ?? 'general'
    byCategory.set(key, [...(byCategory.get(key) ?? []), m])
  }
  const groups = CATEGORY_ORDER.filter((c) => byCategory.has(c)).map((c) => ({
    key: c,
    label: CATEGORY_LABEL[c] ?? c,
    modules: byCategory.get(c),
  }))

  const staffCount = (people ?? []).length
  const activeStaff = (people ?? []).filter((p) => p.status === 'active').length

  return (
    <div className="flex flex-col gap-5">
      {/* ------------------------------------------------------------ head */}
      <div>
        <Link
          href="/admin"
          className="flex w-fit items-center gap-1.5 text-sm"
          style={{ color: 'var(--brand-ink)' }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          All schools
        </Link>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              className="flex size-12 shrink-0 items-center justify-center rounded-2xl text-base font-bold text-white"
              style={{ background: 'var(--brand-grad)' }}
              aria-hidden="true"
            >
              {initials(school.school_name)}
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1
                  className="text-xl font-semibold tracking-tight"
                  style={{ color: 'var(--ink)' }}
                >
                  {school.school_name}
                </h1>
                {school.is_suspended ? (
                  <span className="pill pill-red">Suspended</span>
                ) : (
                  <span className="pill pill-green">● Active</span>
                )}
                {school.is_demo && <span className="pill pill-muted">Demo</span>}
              </div>
              <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
                <span className="font-mono">{school.slug ?? '—'}</span> · created{' '}
                {since(school.created_at)}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <RefreshButton />
            <form action={applyPlan} className="flex items-center gap-2">
              <input type="hidden" name="school_id" value={school.id} />
              <Select
                name="plan_code"
                className="w-40"
                defaultValue={school.plans?.code ?? plans?.[0]?.code}
                options={(plans ?? []).map((p) => ({ id: p.code, label: p.name }))}
                emptyLabel="No plans defined."
              />
              <button className="btn btn-ghost">Apply plan</button>
            </form>
          </div>
        </div>
      </div>

      {school.is_suspended && (
        <div
          className="flex items-start gap-3 rounded-xl px-4 py-3"
          style={{ background: 'var(--red-soft)', border: '1px solid transparent' }}
        >
          <span className="mt-0.5 shrink-0" style={{ color: 'var(--red)' }} aria-hidden="true">
            ⚠
          </span>
          <p className="text-sm" style={{ color: 'var(--red-ink)' }}>
            This school is suspended. Every one of its users is locked out —{' '}
            <code className="font-mono text-xs">current_school_id()</code> returns null for them, so
            all their data is unreachable, not merely hidden.
            {school.suspended_reason && (
              <>
                {' '}
                Reason: <strong>{school.suspended_reason}</strong>
              </>
            )}
          </p>
        </div>
      )}

      <StatRow>
        <StatCard
          label="Modules live"
          value={liveCount}
          sub={`of ${allModules.length} in the catalogue`}
          tone="brand"
          icon="▦"
        />
        <StatCard label="Plan" value={school.plans?.name ?? 'None'} sub="applied" tone="blue" icon="▣" />
        <StatCard
          label="Users"
          value={staffCount}
          sub={`${activeStaff} active`}
          tone="green"
          icon="◉"
        />
        <StatCard
          label="Status"
          value={school.is_suspended ? 'Suspended' : 'Active'}
          sub={school.is_demo ? 'demo tenant' : 'live tenant'}
          tone={school.is_suspended ? 'red' : 'green'}
          icon={school.is_suspended ? '!' : '✓'}
        />
      </StatRow>

      {/* --------------------------------------------------------- modules */}
      <div className="card overflow-hidden">
        <div
          className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4"
          style={{ borderColor: 'var(--border)' }}
        >
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
              Modules
            </p>
            <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
              Switching one off makes its data unreachable, not just hidden — RLS reads this.
            </p>
          </div>
          <span className="pill pill-brand">
            {liveCount} / {allModules.length} on
          </span>
        </div>

        <div className="flex flex-col">
          {groups.map((group) => (
            <section key={group.key}>
              <div
                className="px-5 py-2"
                style={{ background: 'var(--card-alt)', borderBottom: '1px solid var(--border-soft)' }}
              >
                <p
                  className="text-[0.62rem] font-bold uppercase tracking-wider"
                  style={{ color: 'var(--muted)' }}
                >
                  {group.label}
                  <span className="ml-1.5 font-medium opacity-70">
                    {group.modules.filter(isLive).length}/{group.modules.length}
                  </span>
                </p>
              </div>

              <div className="grid sm:grid-cols-2">
                {group.modules.map((module) => {
                  const on = isLive(module)
                  return (
                    <div
                      key={module.code}
                      className="flex items-start justify-between gap-4 px-5 py-3.5"
                      style={{ borderBottom: '1px solid var(--border-soft)' }}
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className="text-sm font-medium"
                            style={{ color: on ? 'var(--ink)' : 'var(--muted)' }}
                          >
                            {module.name}
                          </span>
                          {module.is_core && <span className="pill pill-muted">core</span>}
                        </div>
                        <p className="mt-0.5 text-xs" style={{ color: 'var(--muted)' }}>
                          {module.description}
                        </p>
                        <code
                          className="mt-1 block font-mono text-[0.62rem]"
                          style={{ color: 'var(--muted-2)' }}
                        >
                          {module.code}
                        </code>
                      </div>

                      {module.is_core ? (
                        <span
                          className="shrink-0 text-xs"
                          style={{ color: 'var(--muted-2)' }}
                          title="Core modules cannot be switched off"
                        >
                          always on
                        </span>
                      ) : (
                        <form action={toggleModule} className="shrink-0">
                          <input type="hidden" name="school_id" value={school.id} />
                          <input type="hidden" name="module_code" value={module.code} />
                          <input type="hidden" name="enable" value={on ? 'false' : 'true'} />
                          {/* A switch, not a button labelled On/Off — the
                              control should show the state, not the verb. */}
                          <button
                            role="switch"
                            aria-checked={on}
                            aria-label={`${module.name} ${on ? 'on' : 'off'}`}
                            className="relative inline-flex h-5 w-9 items-center rounded-full transition"
                            style={{ background: on ? 'var(--brand)' : 'var(--border)' }}
                          >
                            <span
                              className="absolute size-3.5 rounded-full bg-white transition-all"
                              style={{ left: on ? 'calc(100% - 1.125rem)' : '0.185rem' }}
                            />
                          </button>
                        </form>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      </div>

      {/* ----------------------------------------------------------- users */}
      <div className="card overflow-hidden">
        <div
          className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4"
          style={{ borderColor: 'var(--border)' }}
        >
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
              Users
            </p>
            <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
              Accounts are created in the SQL editor. They appear here once assigned to this school.
            </p>
          </div>
          <span className="pill pill-muted">{staffCount}</span>
        </div>

        {people?.length ? (
          <div className="overflow-x-auto">
            <table className="table min-w-[32rem]">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Roles</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {people.map((person) => (
                  <tr key={person.id}>
                    <td>
                      <span className="font-medium" style={{ color: 'var(--ink)' }}>
                        {person.full_name || '—'}
                      </span>
                    </td>
                    <td>{person.email}</td>
                    <td>
                      {person.profile_roles?.length ? (
                        <div className="flex flex-wrap gap-1">
                          {person.profile_roles
                            .map((pr) => pr.roles?.display_name)
                            .filter(Boolean)
                            .map((r) => (
                              <span key={r} className="pill pill-brand">
                                {r}
                              </span>
                            ))}
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <span
                        className={`pill ${
                          person.status === 'active'
                            ? 'pill-green'
                            : person.status === 'suspended'
                              ? 'pill-red'
                              : 'pill-muted'
                        }`}
                      >
                        {person.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-6 py-12 text-center text-sm" style={{ color: 'var(--muted)' }}>
            Nobody is attached to this school yet.
          </p>
        )}
      </div>

      {/* ------------------------------------------------------ danger zone */}
      <div
        className="card overflow-hidden"
        style={{ borderColor: school.is_suspended ? 'var(--border)' : 'var(--red)' }}
      >
        <div
          className="border-b px-5 py-4"
          style={{
            borderColor: 'var(--border)',
            background: school.is_suspended ? 'var(--card-alt)' : 'var(--red-soft)',
          }}
        >
          <p
            className="text-sm font-semibold"
            style={{ color: school.is_suspended ? 'var(--ink)' : 'var(--red-ink)' }}
          >
            {school.is_suspended ? 'Restore access' : 'Suspend school'}
          </p>
          <p
            className="mt-0.5 text-sm"
            style={{ color: school.is_suspended ? 'var(--muted)' : 'var(--red-ink)' }}
          >
            {school.is_suspended
              ? 'Users can sign in again the moment this is lifted. Nothing was deleted while it was off.'
              : 'Every user is locked out immediately and all of the school’s data becomes unreachable.'}
          </p>
        </div>

        <form action={setSuspended} className="flex flex-wrap items-end gap-3 p-5">
          <input type="hidden" name="school_id" value={school.id} />
          <input type="hidden" name="suspend" value={school.is_suspended ? 'false' : 'true'} />

          {!school.is_suspended && (
            <div className="min-w-56 flex-1">
              <label className="label" htmlFor="sus-reason">
                Reason <span style={{ color: 'var(--muted-2)' }}>· for your records, not theirs</span>
              </label>
              <input id="sus-reason" name="reason" placeholder="Non-payment" className="field" />
            </div>
          )}

          <ConfirmButton
            className={school.is_suspended ? 'btn btn-primary' : 'btn btn-danger'}
            title={
              school.is_suspended
                ? `Restore ${school.school_name}?`
                : `Suspend ${school.school_name}?`
            }
            message={
              school.is_suspended
                ? 'Their users will be able to sign in again immediately.'
                : 'Every user is locked out at once and the school’s data becomes unreachable until this is lifted. Nothing is deleted.'
            }
            confirmLabel={school.is_suspended ? 'Restore access' : 'Suspend'}
            danger={!school.is_suspended}
          >
            {school.is_suspended ? 'Restore access' : 'Suspend school'}
          </ConfirmButton>
        </form>
      </div>
    </div>
  )
}
