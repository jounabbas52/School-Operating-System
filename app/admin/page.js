import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { StatCard, StatRow } from '@/components/ui'
import RefreshButton from '@/components/refresh-button'
import NewSchoolPanel from './new-school-panel'

export const metadata = { title: 'Schools · Platform console' }

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

export default async function AdminHome({ searchParams }) {
  const params = await searchParams
  const q = (params?.q ?? '').trim()
  const statusFilter = params?.status ?? ''

  const supabase = await createClient()

  const [{ data: schools, error }, { data: plans }, { data: moduleRows }, { count: moduleTotal }] =
    await Promise.all([
      supabase
        .from('schools')
        .select('id, school_name, slug, is_suspended, is_demo, created_at, plans(code, name)')
        .order('created_at', { ascending: false }),
      supabase.from('plans').select('code, name').order('sort_order'),
      supabase.from('school_modules').select('school_id, is_enabled'),
      supabase.from('modules').select('*', { count: 'exact', head: true }),
    ])

  // Counting in JS rather than SQL keeps this to one round trip per table
  // instead of one per school.
  const enabledCount = new Map()
  for (const row of moduleRows ?? []) {
    if (row.is_enabled) enabledCount.set(row.school_id, (enabledCount.get(row.school_id) ?? 0) + 1)
  }

  const all = schools ?? []
  const needle = q.toLowerCase()

  const rows = all.filter((s) => {
    if (statusFilter === 'active' && s.is_suspended) return false
    if (statusFilter === 'suspended' && !s.is_suspended) return false
    if (statusFilter === 'demo' && !s.is_demo) return false
    if (!needle) return true
    return [s.school_name, s.slug].filter(Boolean).some((v) => v.toLowerCase().includes(needle))
  })

  const live = all.filter((s) => !s.is_suspended).length
  const suspended = all.length - live
  const demo = all.filter((s) => s.is_demo).length

  const TABS = [
    { id: '', label: 'All', count: all.length },
    { id: 'active', label: 'Active', count: live },
    { id: 'suspended', label: 'Suspended', count: suspended },
    { id: 'demo', label: 'Demo', count: demo },
  ]

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight" style={{ color: 'var(--ink)' }}>
            Schools
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
            {all.length} tenant{all.length === 1 ? '' : 's'} on the platform. Open one to switch its
            modules on or off.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <RefreshButton />
          <NewSchoolPanel
            plans={plans ?? []}
            trigger={{ label: '+ Add School', className: 'btn btn-primary' }}
          />
        </div>
      </div>

      <StatRow>
        <StatCard label="Total schools" value={all.length} sub="on the platform" tone="brand" icon="▦" />
        <StatCard label="Active" value={live} sub="users can sign in" tone="green" icon="✓" />
        <StatCard
          label="Suspended"
          value={suspended}
          sub={suspended ? 'locked out entirely' : 'none locked out'}
          tone={suspended ? 'red' : 'blue'}
          icon="!"
        />
        <StatCard
          label="Demo tenants"
          value={demo}
          sub="safe to reset"
          tone="amber"
          icon="◌"
        />
      </StatRow>

      {/* --------------------------------------------------------- filters */}
      <form className="card flex flex-wrap items-center gap-2 p-3">
        <div className="flex flex-wrap items-center gap-1">
          {TABS.map((t) => (
            <Link
              key={t.id || 'all'}
              href={t.id ? `/admin?status=${t.id}` : '/admin'}
              className={`tab !px-2.5 !py-1 ${statusFilter === t.id ? 'tab-on' : ''}`}
            >
              {t.label}
              <span className="ml-1.5 tabular-nums opacity-70">{t.count}</span>
            </Link>
          ))}
        </div>

        <input
          name="q"
          defaultValue={q}
          placeholder="Search by name or slug…"
          className="field ml-auto min-w-52 max-w-xs"
        />
        {statusFilter && <input type="hidden" name="status" value={statusFilter} />}
        <button className="btn btn-primary">Search</button>
        {(q || statusFilter) && (
          <Link href="/admin" className="btn btn-ghost">
            Clear
          </Link>
        )}
      </form>

      {error && (
        <p
          className="rounded-lg px-3 py-2 text-sm"
          style={{ background: 'var(--red-soft)', color: 'var(--red-ink)' }}
        >
          {error.message}
        </p>
      )}

      {!rows.length ? (
        <div className="card px-6 py-16 text-center" style={{ borderStyle: 'dashed' }}>
          <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            {all.length ? 'No schools match those filters' : 'No schools yet'}
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm" style={{ color: 'var(--muted)' }}>
            {all.length
              ? 'Try a different search or filter.'
              : 'Create the first tenant — it goes live the moment its plan is applied.'}
          </p>
          {!all.length && (
            <div className="mt-4 flex justify-center">
              <NewSchoolPanel
                plans={plans ?? []}
                trigger={{ label: '+ Add School', className: 'btn btn-primary' }}
              />
            </div>
          )}
        </div>
      ) : (
        /* A card grid rather than a table. A tenant is a THING an operator
           opens, not a row they scan across -- and the status, plan and module
           count are what they are deciding on. */
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((school) => {
            const modules = enabledCount.get(school.id) ?? 0
            const pct = moduleTotal ? Math.round((modules / moduleTotal) * 100) : 0

            return (
              <Link
                key={school.id}
                href={`/admin/schools/${school.id}`}
                className="card flex flex-col gap-3 p-4 transition"
                style={{
                  // A suspended tenant is the one thing on this screen that
                  // must be visible without reading.
                  borderColor: school.is_suspended ? 'var(--red)' : undefined,
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      className="flex size-9 shrink-0 items-center justify-center rounded-xl text-[0.7rem] font-bold text-white"
                      style={{ background: 'var(--brand-grad)' }}
                      aria-hidden="true"
                    >
                      {initials(school.school_name)}
                    </span>
                    <div className="min-w-0">
                      <p
                        className="truncate text-sm font-semibold"
                        style={{ color: 'var(--ink)' }}
                      >
                        {school.school_name}
                      </p>
                      <p className="truncate font-mono text-xs" style={{ color: 'var(--muted)' }}>
                        {school.slug ?? '—'}
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {school.is_suspended ? (
                      <span className="pill pill-red">Suspended</span>
                    ) : (
                      <span className="pill pill-green">● Active</span>
                    )}
                    {school.is_demo && <span className="pill pill-muted">Demo</span>}
                  </div>
                </div>

                <div
                  className="flex items-center justify-between gap-3 border-t pt-3"
                  style={{ borderColor: 'var(--border-soft)' }}
                >
                  <div>
                    <p className="text-[0.62rem] uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
                      Plan
                    </p>
                    <p className="mt-0.5 text-xs font-medium" style={{ color: 'var(--ink-2)' }}>
                      {school.plans?.name ?? 'None'}
                    </p>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p
                        className="text-[0.62rem] uppercase tracking-wider"
                        style={{ color: 'var(--muted)' }}
                      >
                        Modules
                      </p>
                      <p className="text-xs font-medium tabular-nums" style={{ color: 'var(--ink-2)' }}>
                        {modules}
                        {moduleTotal ? ` / ${moduleTotal}` : ''}
                      </p>
                    </div>
                    <div
                      className="mt-1 h-1.5 w-full overflow-hidden rounded-full"
                      style={{ background: 'var(--border-soft)' }}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct}%`, background: 'var(--brand)' }}
                      />
                    </div>
                  </div>
                </div>

                <p className="text-[0.65rem]" style={{ color: 'var(--muted-2)' }}>
                  Created {since(school.created_at)}
                </p>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
