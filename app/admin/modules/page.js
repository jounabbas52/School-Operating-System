import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { StatCard, StatRow } from '@/components/ui'
import RefreshButton from '@/components/refresh-button'

export const metadata = { title: 'Modules & Plans · Platform console' }

const CATEGORY_LABEL = {
  platform: 'Platform',
  academic: 'Academic',
  finance: 'Finance',
  hr: 'HR',
  operations: 'Operations',
  general: 'General',
}

const CATEGORY_ORDER = ['platform', 'academic', 'finance', 'hr', 'operations', 'general']

function money(value, currency = 'PKR') {
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  if (n === 0) return 'Free'
  return `${currency} ${Math.round(n).toLocaleString('en-PK')}`
}

export default async function ModulesAndPlansPage() {
  const supabase = await createClient()

  const [
    { data: modules },
    { data: plans },
    { data: planModules },
    { data: schoolModules },
    { count: schoolCount },
  ] = await Promise.all([
    supabase
      .from('modules')
      .select('code, name, category, is_core, description, sort_order')
      .order('sort_order'),
    supabase
      .from('plans')
      .select('id, code, name, description, price, currency, billing_interval, is_public, sort_order')
      .order('sort_order'),
    supabase.from('plan_modules').select('plan_id, module_code'),
    supabase.from('school_modules').select('module_code, is_enabled'),
    supabase.from('schools').select('*', { count: 'exact', head: true }),
  ])

  const allModules = modules ?? []
  const allPlans = plans ?? []
  const tenants = schoolCount ?? 0

  // How many tenants actually have each module switched on. This is the one
  // number that tells you whether a module earns its place in the catalogue.
  const adoption = new Map()
  for (const row of schoolModules ?? []) {
    if (!row.is_enabled) continue
    adoption.set(row.module_code, (adoption.get(row.module_code) ?? 0) + 1)
  }

  const modulesInPlan = new Map()
  for (const row of planModules ?? []) {
    modulesInPlan.set(row.plan_id, [...(modulesInPlan.get(row.plan_id) ?? []), row.module_code])
  }

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

  const coreCount = allModules.filter((m) => m.is_core).length

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight" style={{ color: 'var(--ink)' }}>
            Modules &amp; Plans
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
            The catalogue every tenant is provisioned from. Read-only — the rows live in{' '}
            <code className="font-mono text-xs">modules</code> and{' '}
            <code className="font-mono text-xs">plans</code>.
          </p>
        </div>
        <RefreshButton />
      </div>

      <StatRow>
        <StatCard label="Modules" value={allModules.length} sub="in the catalogue" tone="brand" icon="▦" />
        <StatCard label="Core" value={coreCount} sub="always on, never billed" tone="blue" icon="▣" />
        <StatCard label="Plans" value={allPlans.length} sub="available to assign" tone="green" icon="▥" />
        <StatCard label="Tenants" value={tenants} sub="schools provisioned" tone="amber" icon="◉" />
      </StatRow>

      {/* ----------------------------------------------------------- plans */}
      <div>
        <p
          className="mb-2.5 text-[0.68rem] font-bold uppercase tracking-wider"
          style={{ color: 'var(--muted)' }}
        >
          Plans
        </p>

        {!allPlans.length ? (
          <div className="card px-6 py-12 text-center" style={{ borderStyle: 'dashed' }}>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              No plans defined. Seed them in the SQL editor.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {allPlans.map((plan) => {
              const included = modulesInPlan.get(plan.id) ?? []
              // Core modules come on regardless of plan, so counting them as
              // something the plan "includes" would overstate every tier.
              const billable = included.filter(
                (code) => !allModules.find((m) => m.code === code)?.is_core
              )

              return (
                <div key={plan.id} className="card flex flex-col gap-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                        {plan.name}
                      </p>
                      <code className="font-mono text-[0.65rem]" style={{ color: 'var(--muted-2)' }}>
                        {plan.code}
                      </code>
                    </div>
                    {!plan.is_public && <span className="pill pill-muted">Private</span>}
                  </div>

                  <div>
                    <p
                      className="text-lg font-semibold tabular-nums"
                      style={{ color: 'var(--brand-ink)' }}
                    >
                      {money(plan.price, plan.currency)}
                    </p>
                    {Number(plan.price) > 0 && (
                      <p className="text-[0.65rem]" style={{ color: 'var(--muted)' }}>
                        per {plan.billing_interval}
                      </p>
                    )}
                  </div>

                  {plan.description && (
                    <p className="text-xs" style={{ color: 'var(--muted)' }}>
                      {plan.description}
                    </p>
                  )}

                  <div
                    className="mt-auto border-t pt-3"
                    style={{ borderColor: 'var(--border-soft)' }}
                  >
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs" style={{ color: 'var(--muted)' }}>
                        Modules included
                      </span>
                      <span
                        className="text-sm font-semibold tabular-nums"
                        style={{ color: 'var(--ink)' }}
                      >
                        {billable.length}
                      </span>
                    </div>
                    <div
                      className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full"
                      style={{ background: 'var(--border-soft)' }}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${
                            allModules.length - coreCount > 0
                              ? Math.round(
                                  (billable.length / (allModules.length - coreCount)) * 100
                                )
                              : 0
                          }%`,
                          background: 'var(--brand)',
                        }}
                      />
                    </div>
                    <p className="mt-1 text-[0.62rem]" style={{ color: 'var(--muted-2)' }}>
                      plus {coreCount} core, always on
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* --------------------------------------------------------- modules */}
      <div className="card overflow-hidden">
        <div
          className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4"
          style={{ borderColor: 'var(--border)' }}
        >
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
              Module catalogue
            </p>
            <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
              Adoption is how many of the {tenants} tenant{tenants === 1 ? '' : 's'} have each one
              switched on.
            </p>
          </div>
          <span className="pill pill-brand">{allModules.length} modules</span>
        </div>

        {groups.map((group) => (
          <section key={group.key}>
            <div
              className="px-5 py-2"
              style={{
                background: 'var(--card-alt)',
                borderBottom: '1px solid var(--border-soft)',
              }}
            >
              <p
                className="text-[0.62rem] font-bold uppercase tracking-wider"
                style={{ color: 'var(--muted)' }}
              >
                {group.label}
                <span className="ml-1.5 font-medium opacity-70">{group.modules.length}</span>
              </p>
            </div>

            {group.modules.map((module) => {
              const used = module.is_core ? tenants : adoption.get(module.code) ?? 0
              const pct = tenants ? Math.round((used / tenants) * 100) : 0

              return (
                <div
                  key={module.code}
                  className="flex flex-wrap items-center justify-between gap-4 px-5 py-3.5"
                  style={{ borderBottom: '1px solid var(--border-soft)' }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                        {module.name}
                      </span>
                      <code className="font-mono text-[0.65rem]" style={{ color: 'var(--muted-2)' }}>
                        {module.code}
                      </code>
                      {module.is_core && <span className="pill pill-muted">core</span>}
                    </div>
                    <p className="mt-0.5 text-xs" style={{ color: 'var(--muted)' }}>
                      {module.description}
                    </p>
                  </div>

                  <div className="flex w-40 shrink-0 items-center gap-2.5">
                    <div
                      className="h-1.5 flex-1 overflow-hidden rounded-full"
                      style={{ background: 'var(--border-soft)' }}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${pct}%`,
                          background: module.is_core ? 'var(--muted-2)' : 'var(--brand)',
                        }}
                      />
                    </div>
                    <span
                      className="w-14 shrink-0 text-right text-xs tabular-nums"
                      style={{ color: 'var(--muted)' }}
                    >
                      {used}/{tenants}
                    </span>
                  </div>
                </div>
              )
            })}
          </section>
        ))}
      </div>

      <p className="text-xs" style={{ color: 'var(--muted)' }}>
        To switch a module on for one school, open it from{' '}
        <Link href="/admin" style={{ color: 'var(--brand-ink)' }}>
          Schools
        </Link>
        . Editing the catalogue itself is a SQL-editor job — these rows are shared by every tenant.
      </p>
    </div>
  )
}
