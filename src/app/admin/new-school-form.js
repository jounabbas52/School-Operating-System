'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Spinner } from '@/components/spinner'
import { Select } from '@/components/combobox'
import { provisionSchool } from './actions'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="self-start rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:opacity-60"
    >
      {pending ? (
        <>
          <Spinner /> Creating…
        </>
      ) : (
        'Create school'
      )}
    </button>
  )
}

// Slugs end up in a subdomain, so normalise as the name is typed rather than
// rejecting it after the fact.
function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

export default function NewSchoolForm({ plans }) {
  const [state, formAction] = useActionState(provisionSchool, {})
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
      <div>
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Add a school</h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Creates the school and switches on whatever its plan includes.
        </p>
      </div>

      <form action={formAction} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              School name
            </span>
            <input
              name="school_name"
              required
              onChange={(e) => {
                if (!slugTouched) setSlug(slugify(e.target.value))
              }}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Slug</span>
            <input
              name="slug"
              required
              value={slug}
              onChange={(e) => {
                setSlugTouched(true)
                setSlug(slugify(e.target.value))
              }}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-sm text-zinc-900 outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              Used for {slug || 'name'}.yourdomain.com
            </span>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Plan</span>
            <Select
              name="plan_code"
              defaultValue={plans[0]?.code}
              options={plans.map((p) => ({ id: p.code, label: p.name }))}
            />
          </label>

          <label className="flex items-center gap-2 self-end pb-2">
            <input
              type="checkbox"
              name="is_demo"
              className="size-4 rounded border-zinc-300 accent-emerald-700 dark:border-zinc-700"
            />
            <span className="text-sm text-zinc-700 dark:text-zinc-300">
              Demo school (safe to reset)
            </span>
          </label>
        </div>

        {state?.error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
            {state.error}
          </p>
        )}

        <SubmitButton />
      </form>
    </section>
  )
}
