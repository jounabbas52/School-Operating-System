'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Spinner } from '@/components/spinner'
import SidePanel from '@/components/side-panel'
import { useCloseOnSuccess } from '@/components/use-close-on-success'
import { Select } from '@/components/combobox'
import { CONTACT_CATEGORIES } from '@/lib/operations-options'
import { saveContact } from '../actions'

function SaveButton({ editing }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" form="contact-form" disabled={pending} className="btn btn-primary">
      {pending ? (
        <>
          <Spinner /> Saving…
        </>
      ) : editing ? (
        'Save changes'
      ) : (
        'Save'
      )}
    </button>
  )
}

export default function ContactPanel({ row, trigger }) {
  const [open, setOpen] = useState(false)
  const [state, formAction] = useActionState(saveContact, {})
  useCloseOnSuccess(state, () => setOpen(false))

  const editing = Boolean(row)

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={trigger.className}>
        {trigger.label}
      </button>

      <SidePanel
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Edit ${row.name}` : 'New Contact'}
        description="A number the front desk needs to hand"
        icon="☎"
        footer={
          <>
            <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost">
              Cancel
            </button>
            <SaveButton editing={editing} />
          </>
        }
      >
        <form id="contact-form" action={formAction} className="flex flex-col gap-4">
          {editing && <input type="hidden" name="id" value={row.id} />}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="ct-name">
                Name *
              </label>
              <input
                id="ct-name"
                name="name"
                required
                defaultValue={row?.name ?? ''}
                className="field"
              />
            </div>
            <div>
              <label className="label" htmlFor="ct-designation">
                Designation
              </label>
              <input
                id="ct-designation"
                name="designation"
                defaultValue={row?.designation ?? ''}
                className="field"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="ct-department">
                Department
              </label>
              <input
                id="ct-department"
                name="department"
                defaultValue={row?.department ?? ''}
                className="field"
              />
            </div>
            <div>
              <label className="label" htmlFor="ct-phone">
                Phone *
              </label>
              <input
                id="ct-phone"
                name="phone"
                required
                defaultValue={row?.phone ?? ''}
                className="field"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="ct-extension">
                Extension
              </label>
              <input
                id="ct-extension"
                name="extension"
                defaultValue={row?.extension ?? ''}
                placeholder="e.g. 201"
                className="field"
              />
            </div>
            <div>
              <label className="label" htmlFor="ct-email">
                Email
              </label>
              <input
                id="ct-email"
                name="email"
                type="email"
                defaultValue={row?.email ?? ''}
                className="field"
              />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="ct-category">
              Category
            </label>
            <Select
              id="ct-category"
              name="category"
              defaultValue={row?.category ?? 'staff'}
              options={CONTACT_CATEGORIES}
            />
            <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
              Staff are already pulled live from HR — only add someone here if they are not in
              Staff yet.
            </p>
          </div>

          <div>
            <label className="label" htmlFor="ct-notes">
              Notes
            </label>
            <textarea
              id="ct-notes"
              name="notes"
              rows={2}
              defaultValue={row?.notes ?? ''}
              className="field resize-none"
            />
          </div>

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
