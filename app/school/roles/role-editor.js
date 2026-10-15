'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Spinner } from '@/components/spinner'
import { saveRole } from '../actions'
import { PERMISSION_GROUPS } from '@/lib/permissions'

function SubmitButton({ label }) {
  const { pending } = useFormStatus()
  return (
    <button
      disabled={pending}
      className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:opacity-60"
    >
      {pending ? (
        <>
          <Spinner /> Saving…
        </>
      ) : (
        label
      )}
    </button>
  )
}

// `role` absent = create. Present = edit that role.
export default function RoleEditor({ role, enabledModules }) {
  const [open, setOpen] = useState(false)
  const [state, formAction] = useActionState(saveRole, {})

  const enabled = new Set(enabledModules)
  const groups = PERMISSION_GROUPS.filter((group) => enabled.has(group.module))
  const granted = new Set(role?.permissions ?? [])

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className={
          role
            ? 'text-xs font-medium text-emerald-700 underline-offset-4 hover:underline dark:text-emerald-400'
            : 'self-start rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800'
        }
      >
        {role ? 'Edit' : 'New role'}
      </button>
    )
  }

  return (
    <form
      action={formAction}
      className="flex w-full flex-col gap-4 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"
    >
      {role && <input type="hidden" name="role_id" value={role.id} />}

      <div className="flex items-start justify-between gap-4">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          {role ? `Edit ${role.display_name || role.name}` : 'New role'}
        </h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-zinc-500 underline-offset-4 hover:underline dark:text-zinc-400"
        >
          Cancel
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Display name</span>
          <input
            name="display_name"
            required
            defaultValue={role?.display_name ?? ''}
            placeholder="Head of Science"
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Internal name
          </span>
          <input
            name="name"
            required
            defaultValue={role?.name ?? ''}
            placeholder="head_of_science"
            pattern="[a-z0-9_]{2,40}"
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Description</span>
        <input
          name="description"
          defaultValue={role?.description ?? ''}
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
        />
      </label>

      <fieldset className="flex flex-col gap-4">
        <legend className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Permissions
        </legend>

        {groups.map((group) => (
          <div key={group.module} className="flex flex-col gap-2">
            <span className="font-mono text-[0.68rem] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              {group.label}
            </span>
            <div className="grid gap-2 sm:grid-cols-2">
              {group.permissions.map((permission) => (
                <label
                  key={permission.code}
                  className="flex items-start gap-2 rounded-md border border-zinc-200 px-3 py-2 dark:border-zinc-800"
                >
                  <input
                    type="checkbox"
                    name="permissions"
                    value={permission.code}
                    defaultChecked={granted.has(permission.code)}
                    className="mt-0.5 size-4 shrink-0 rounded border-zinc-300 accent-emerald-700 dark:border-zinc-700"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm text-zinc-800 dark:text-zinc-200">
                      {permission.label}
                    </span>
                    <code className="font-mono text-[0.65rem] text-zinc-400">
                      {permission.code}
                    </code>
                    {permission.dangerous && (
                      <span className="ml-1.5 rounded bg-amber-100 px-1 py-0.5 font-mono text-[0.6rem] uppercase tracking-wider text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                        sensitive
                      </span>
                    )}
                  </span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </fieldset>

      {state?.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
          {state.ok}
        </p>
      )}

      <SubmitButton label={role ? 'Save role' : 'Create role'} />
    </form>
  )
}
