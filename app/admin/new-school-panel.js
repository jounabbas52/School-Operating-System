'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Spinner } from '@/components/spinner'
import SidePanel from '@/components/side-panel'
import { Select } from '@/components/combobox'
import { provisionSchool } from './actions'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" form="new-school-form" disabled={pending} className="btn btn-primary">
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

// Provisioning a tenant is a deliberate act, so it lives in a slide-over like
// every other create in the product rather than as a form permanently parked
// at the bottom of the list.
//
// There is no useCloseOnSuccess here: provisionSchool redirects to the new
// school on success, so the panel goes away with the page.
export default function NewSchoolPanel({ plans, trigger }) {
  const [open, setOpen] = useState(false)
  const [state, formAction] = useActionState(provisionSchool, {})

  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={trigger.className}>
        {trigger.label}
      </button>

      <SidePanel
        open={open}
        onClose={() => setOpen(false)}
        title="Add a school"
        description="Creates the tenant and switches on whatever its plan includes"
        icon="▦"
        footer={
          <>
            <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost">
              Cancel
            </button>
            <SubmitButton />
          </>
        }
      >
        <form id="new-school-form" action={formAction} className="flex flex-col gap-4">
          <div>
            <label className="label" htmlFor="ns-name">
              School name *
            </label>
            <input
              id="ns-name"
              name="school_name"
              required
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                // The slug follows the name until somebody edits it by hand,
                // after which it is theirs.
                if (!slugTouched) setSlug(slugify(e.target.value))
              }}
              placeholder="e.g. Beaconhouse Model School"
              className="field"
            />
          </div>

          <div>
            <label className="label" htmlFor="ns-slug">
              Slug *
            </label>
            <input
              id="ns-slug"
              name="slug"
              required
              value={slug}
              onChange={(e) => {
                setSlugTouched(true)
                setSlug(slugify(e.target.value))
              }}
              placeholder="beaconhouse-model"
              className="field font-mono"
            />
            <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
              Used for{' '}
              <span className="font-mono" style={{ color: 'var(--brand-ink)' }}>
                {slug || 'name'}.yourdomain.com
              </span>{' '}
              — lowercase letters, numbers and hyphens, 2–40 characters.
            </p>
          </div>

          <div>
            <label className="label" htmlFor="ns-plan">
              Plan
            </label>
            <Select
              id="ns-plan"
              name="plan_code"
              defaultValue={plans[0]?.code}
              options={plans.map((p) => ({ id: p.code, label: p.name }))}
              emptyLabel="No plans defined."
            />
            <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
              The plan decides which modules come on at creation. It can be changed afterwards.
            </p>
          </div>

          <label
            className="flex cursor-pointer items-start gap-2.5 rounded-xl p-3.5"
            style={{ background: 'var(--card-alt)', border: '1px solid var(--border-soft)' }}
          >
            <input
              type="checkbox"
              name="is_demo"
              className="mt-0.5 size-4 shrink-0 cursor-pointer rounded"
              style={{ accentColor: 'var(--brand)' }}
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium" style={{ color: 'var(--ink-2)' }}>
                Demo school
              </span>
              <span className="block text-xs" style={{ color: 'var(--muted)' }}>
                Marks the tenant as safe to reset. Nothing behaves differently — it is a flag for
                you, so a real school is never wiped by mistake.
              </span>
            </span>
          </label>

          {state?.error && (
            <p
              className="rounded-lg px-3 py-2 text-sm"
              style={{ background: 'var(--red-soft)', color: 'var(--red)' }}
            >
              {state.error}
            </p>
          )}
        </form>
      </SidePanel>
    </>
  )
}
