import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { toggleModule, applyPlan, setSuspended } from '../../actions'
import { Select } from '@/components/combobox'

export default async function SchoolDetail({ params }) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: school }, { data: modules }, { data: enabled }, { data: plans }, { data: people }] =
    await Promise.all([
      supabase
        .from('schools')
        .select('id, school_name, slug, is_suspended, suspended_reason, is_demo, created_at, plans(code, name)')
        .eq('id', id)
        .maybeSingle(),
      supabase.from('modules').select('code, name, category, is_core, description').order('sort_order'),
      supabase.from('school_modules').select('module_code, is_enabled, expires_at').eq('school_id', id),
      supabase.from('plans').select('code, name').order('sort_order'),
      supabase
        .from('profiles')
        .select('id, full_name, email, status, profile_roles(roles(name, display_name))')
        .eq('school_id', id)
        .order('created_at'),
    ])

  if (!school) notFound()

  const enabledMap = new Map((enabled ?? []).map((row) => [row.module_code, row]))
  const liveCount = (modules ?? []).filter(
    (m) => m.is_core || enabledMap.get(m.code)?.is_enabled
  ).length

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link
          href="/admin"
          className="text-xs text-zinc-500 underline-offset-4 hover:underline dark:text-zinc-400"
        >
          ← All schools
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            {school.school_name}
          </h1>
          <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">{school.slug}</span>
          {school.is_suspended && (
            <span className="rounded bg-red-100 px-1.5 py-0.5 font-mono text-[0.65rem] uppercase tracking-wider text-red-800 dark:bg-red-950 dark:text-red-300">
              suspended
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {liveCount} of {modules?.length ?? 0} modules live · plan {school.plans?.name ?? 'none'}
        </p>
      </div>

      {school.is_suspended && (
        <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
          This school is suspended. Every one of its users is locked out —{' '}
          <code className="font-mono text-xs">current_school_id()</code> returns null for them, so
          all their data is unreachable.
          {school.suspended_reason && <> Reason: {school.suspended_reason}</>}
        </p>
      )}

      {/* ---------------- modules ---------------- */}
      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Modules</h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Switching one off makes its data unreachable, not just hidden.
            </p>
          </div>
          <form action={applyPlan} className="flex items-center gap-2">
            <input type="hidden" name="school_id" value={school.id} />
            <Select
              name="plan_code"
              className="w-40"
              defaultValue={school.plans?.code ?? plans?.[0]?.code}
              options={(plans ?? []).map((p) => ({ id: p.code, label: p.name }))}
            />
            <button className="rounded-md border border-zinc-300 px-2.5 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800">
              Apply plan
            </button>
          </form>
        </div>

        <div className="grid gap-px overflow-hidden rounded-lg border border-zinc-200 bg-zinc-200 sm:grid-cols-2 dark:border-zinc-800 dark:bg-zinc-800">
          {modules?.map((module) => {
            const row = enabledMap.get(module.code)
            const isOn = module.is_core || Boolean(row?.is_enabled)
            return (
              <div
                key={module.code}
                className="flex items-start justify-between gap-4 bg-white p-4 dark:bg-zinc-900"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                      {module.name}
                    </span>
                    <code className="font-mono text-[0.65rem] text-zinc-400">{module.code}</code>
                    {module.is_core && (
                      <span className="rounded bg-zinc-200 px-1.5 py-0.5 font-mono text-[0.6rem] uppercase tracking-wider text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                        core
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                    {module.description}
                  </p>
                </div>

                {module.is_core ? (
                  <span className="shrink-0 text-xs text-zinc-400">always on</span>
                ) : (
                  <form action={toggleModule} className="shrink-0">
                    <input type="hidden" name="school_id" value={school.id} />
                    <input type="hidden" name="module_code" value={module.code} />
                    <input type="hidden" name="enable" value={isOn ? 'false' : 'true'} />
                    <button
                      className={
                        isOn
                          ? 'rounded-md bg-emerald-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-800'
                          : 'rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800'
                      }
                    >
                      {isOn ? 'On' : 'Off'}
                    </button>
                  </form>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* ---------------- people ---------------- */}
      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Users</h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Accounts are created in the SQL editor. They appear here once assigned to this school.
          </p>
        </div>

        {people?.length ? (
          <div className="card overflow-x-auto">
            <table className="table min-w-[28rem]">
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
                    <td className="text-zinc-900 dark:text-zinc-100">
                      {person.full_name || '—'}
                    </td>
                    <td className="text-zinc-600 dark:text-zinc-300">{person.email}</td>
                    <td className="text-zinc-600 dark:text-zinc-300">
                      {person.profile_roles?.map((pr) => pr.roles?.display_name).filter(Boolean).join(', ') || '—'}
                    </td>
                    <td className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                      {person.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-zinc-300 px-6 py-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
            Nobody yet.
          </p>
        )}
      </section>

      {/* ---------------- suspension ---------------- */}
      <section className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          {school.is_suspended ? 'Restore access' : 'Suspend school'}
        </h2>
        <form action={setSuspended} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="school_id" value={school.id} />
          <input type="hidden" name="suspend" value={school.is_suspended ? 'false' : 'true'} />
          {!school.is_suspended && (
            <label className="flex flex-1 flex-col gap-1.5">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Reason (shown to you, not to them)
              </span>
              <input
                name="reason"
                placeholder="Non-payment"
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </label>
          )}
          <button
            className={
              school.is_suspended
                ? 'rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-800'
                : 'rounded-md bg-red-700 px-3 py-2 text-sm font-medium text-white hover:bg-red-800'
            }
          >
            {school.is_suspended ? 'Restore access' : 'Suspend'}
          </button>
        </form>
      </section>
    </div>
  )
}
