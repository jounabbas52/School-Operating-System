import { getSchoolContext } from '@/lib/school-context'
import { setUserRole, setUserStatus, removeUser } from '../actions'
import { Select } from '@/components/combobox'

export default async function UsersPage() {
  const { schoolId, permissions, profile: me, supabase } = await getSchoolContext()

  const canWrite = permissions.has('users.write')
  const canAssignRoles = permissions.has('users.roles.write')

  const [{ data: people, error }, { data: roles }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, email, status, created_at, profile_roles(role_id, roles(id, display_name))')
      .eq('school_id', schoolId)
      .order('created_at'),
    supabase
      .from('roles')
      .select('id, name, display_name, is_system')
      .or(`school_id.is.null,school_id.eq.${schoolId}`)
      .order('is_system', { ascending: false })
      .order('name'),
  ])

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Users
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {people?.length ?? 0} in this school. A user&rsquo;s role decides what they can reach.
        </p>
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
          {error.message}
        </p>
      )}

      <div className="card overflow-x-auto">
        <table className="table min-w-[44rem]">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {people?.map((person) => {
              const currentRoleId = person.profile_roles?.[0]?.role_id ?? ''
              const isMe = person.id === me?.id
              return (
                <tr key={person.id}>
                  <td className="text-zinc-900 dark:text-zinc-100">
                    {person.full_name || '—'}
                    {isMe && <span className="ml-2 text-xs text-zinc-400">you</span>}
                  </td>
                  <td className="text-zinc-600 dark:text-zinc-300">{person.email}</td>

                  <td>
                    {canAssignRoles && !isMe ? (
                      <form action={setUserRole} className="flex items-center gap-2">
                        <input type="hidden" name="profile_id" value={person.id} />
                        <Select
                          name="role_id"
                          className="w-44"
                          defaultValue={currentRoleId}
                          placeholder="— none —"
                          options={(roles ?? []).map((r) => ({
                            id: r.id,
                            label: r.display_name || r.name,
                          }))}
                        />
                        <button className="rounded border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800">
                          Save
                        </button>
                      </form>
                    ) : (
                      <span className="text-zinc-600 dark:text-zinc-300">
                        {person.profile_roles?.[0]?.roles?.display_name ?? '—'}
                      </span>
                    )}
                  </td>

                  <td>
                    {canWrite && !isMe ? (
                      <form action={setUserStatus}>
                        <input type="hidden" name="profile_id" value={person.id} />
                        <input
                          type="hidden"
                          name="status"
                          value={person.status === 'active' ? 'suspended' : 'active'}
                        />
                        <button
                          className={
                            person.status === 'active'
                              ? 'rounded bg-emerald-100 px-1.5 py-0.5 font-mono text-[0.65rem] uppercase tracking-wider text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-950 dark:text-emerald-300'
                              : 'rounded bg-red-100 px-1.5 py-0.5 font-mono text-[0.65rem] uppercase tracking-wider text-red-800 hover:bg-red-200 dark:bg-red-950 dark:text-red-300'
                          }
                        >
                          {person.status}
                        </button>
                      </form>
                    ) : (
                      <span className="font-mono text-[0.65rem] uppercase tracking-wider text-zinc-500">
                        {person.status}
                      </span>
                    )}
                  </td>

                  <td className="text-right">
                    {canWrite && !isMe && (
                      <form action={removeUser}>
                        <input type="hidden" name="profile_id" value={person.id} />
                        <button className="text-xs text-zinc-500 underline-offset-4 hover:text-red-700 hover:underline dark:text-zinc-400 dark:hover:text-red-400">
                          Remove
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Removing detaches someone from the school and marks them inactive. Their account and
        anything they created stay intact. New accounts are created in the SQL editor.
      </p>
    </div>
  )
}
