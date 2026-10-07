import { getSchoolContext } from '@/lib/school-context'
import { deleteRole } from '../actions'
import RoleEditor from './role-editor'

export default async function RolesPage() {
  const { schoolId, modules, supabase } = await getSchoolContext()

  const [{ data: roles, error }, { data: assignments }] = await Promise.all([
    supabase
      .from('roles')
      .select('id, name, display_name, description, permissions, is_system, school_id')
      .or(`school_id.is.null,school_id.eq.${schoolId}`)
      .order('is_system', { ascending: false })
      .order('name'),
    supabase.from('profile_roles').select('role_id').eq('school_id', schoolId),
  ])

  const useCount = new Map()
  for (const row of assignments ?? []) {
    useCount.set(row.role_id, (useCount.get(row.role_id) ?? 0) + 1)
  }

  const enabledModules = new Set(modules.map((m) => m.code))

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Roles
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          A role is a set of permissions. Only permissions from modules your school has are shown —
          the rest would never grant anything.
        </p>
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
          {error.message}
        </p>
      )}

      <div className="flex flex-col gap-px overflow-hidden rounded-lg border border-zinc-200 bg-zinc-200 dark:border-zinc-800 dark:bg-zinc-800">
        {roles?.map((role) => (
          <div
            key={role.id}
            className="flex flex-wrap items-start justify-between gap-4 bg-white p-4 dark:bg-zinc-900"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                  {role.display_name || role.name}
                </span>
                <code className="font-mono text-[0.65rem] text-zinc-400">{role.name}</code>
                {role.is_system && (
                  <span className="rounded bg-zinc-200 px-1.5 py-0.5 font-mono text-[0.6rem] uppercase tracking-wider text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                    built in
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                {role.description || '—'}
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                {role.permissions?.length ?? 0} permissions · {useCount.get(role.id) ?? 0} users
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-3">
              {role.is_system ? (
                <span className="text-xs text-zinc-400">shared by every school</span>
              ) : (
                <>
                  <RoleEditor role={role} enabledModules={[...enabledModules]} />
                  <form action={deleteRole}>
                    <input type="hidden" name="role_id" value={role.id} />
                    <button className="text-xs text-zinc-500 underline-offset-4 hover:text-red-700 hover:underline dark:text-zinc-400 dark:hover:text-red-400">
                      Delete
                    </button>
                  </form>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      <RoleEditor enabledModules={[...enabledModules]} />
    </div>
  )
}
