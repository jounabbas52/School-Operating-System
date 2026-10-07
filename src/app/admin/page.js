import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import NewSchoolForm from './new-school-form'

export default async function AdminHome() {
  const supabase = await createClient()

  const [{ data: schools, error }, { data: plans }, { data: moduleRows }] = await Promise.all([
    supabase
      .from('schools')
      .select('id, school_name, slug, is_suspended, is_demo, created_at, plans(code, name)')
      .order('created_at', { ascending: false }),
    supabase.from('plans').select('code, name').order('sort_order'),
    supabase.from('school_modules').select('school_id, is_enabled'),
  ])

  // Counting in JS rather than SQL keeps this to one round trip per table
  // instead of one per school.
  const enabledCount = new Map()
  for (const row of moduleRows ?? []) {
    if (row.is_enabled) enabledCount.set(row.school_id, (enabledCount.get(row.school_id) ?? 0) + 1)
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Schools
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {schools?.length ?? 0} on the platform. Open one to switch its modules on or off.
          </p>
        </div>
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
          {error.message}
        </p>
      )}

      {schools?.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-300 px-6 py-10 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          No schools yet. Create the first one below.
        </p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table min-w-[36rem]">
            <thead>
              <tr>
                <th>School</th>
                <th>Slug</th>
                <th>Plan</th>
                <th>Modules</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {schools?.map((school) => (
                <tr key={school.id}>
                  <td>
                    <Link
                      href={`/admin/schools/${school.id}`}
                      className="font-medium text-emerald-700 underline-offset-4 hover:underline dark:text-emerald-400"
                    >
                      {school.school_name}
                    </Link>
                  </td>
                  <td className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                    {school.slug}
                  </td>
                  <td className="text-zinc-600 dark:text-zinc-300">
                    {school.plans?.name ?? '—'}
                  </td>
                  <td className="tabular-nums text-zinc-600 dark:text-zinc-300">
                    {enabledCount.get(school.id) ?? 0}
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1.5">
                      {school.is_suspended ? (
                        <span className="rounded bg-red-100 px-1.5 py-0.5 font-mono text-[0.65rem] uppercase tracking-wider text-red-800 dark:bg-red-950 dark:text-red-300">
                          suspended
                        </span>
                      ) : (
                        <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-mono text-[0.65rem] uppercase tracking-wider text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                          active
                        </span>
                      )}
                      {school.is_demo && (
                        <span className="rounded bg-zinc-200 px-1.5 py-0.5 font-mono text-[0.65rem] uppercase tracking-wider text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                          demo
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <NewSchoolForm plans={plans ?? []} />
    </div>
  )
}
