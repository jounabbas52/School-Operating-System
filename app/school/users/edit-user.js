'use client'

import { useActionState, useState } from 'react'
import SidePanel from '@/components/side-panel'
import { PanelButton, PanelCancel } from '@/components/submit-button'
import { useCloseOnSuccess } from '@/components/use-close-on-success'
import { updateUser } from '../actions'

// The details of a login -- who they are and whether they may sign in.
//
// Not here: their access (that is the guard button next to this one) and
// their password (that is on their own page, because setting one is a
// different kind of act from correcting a phone number).
export default function EditUser({ person, open, onClose }) {
  const [state, formAction, pending] = useActionState(updateUser, {})
  const [status, setStatus] = useState(person.status ?? 'active')
  useCloseOnSuccess(state, onClose)

  return (
    <SidePanel
      open={open}
      onClose={onClose}
      title={`Edit ${person.full_name || person.email}`}
      description="Their details, not their access"
      icon="✎"
      variant="modal"
      width="max-w-lg"
      footer={
        <>
          <PanelCancel onClick={onClose} pending={pending} />
          <PanelButton form="edit-user-form" pending={pending}>
            Save
          </PanelButton>
        </>
      }
    >
      <form id="edit-user-form" action={formAction} className="flex flex-col gap-3">
        <input type="hidden" name="profile_id" value={person.id} />

        <div>
          <label className="label" htmlFor="eu-name">
            Full name *
          </label>
          <input
            id="eu-name"
            name="full_name"
            required
            defaultValue={person.full_name ?? ''}
            className="field"
          />
        </div>

        <div>
          <label className="label" htmlFor="eu-phone">
            Phone
          </label>
          <input
            id="eu-phone"
            name="phone"
            defaultValue={person.phone ?? ''}
            placeholder="03001234567"
            className="field"
          />
        </div>

        <div>
          <label className="label">Email</label>
          <p
            className="rounded-lg px-3 py-2 text-sm"
            style={{ background: 'var(--card-alt)', color: 'var(--muted)' }}
          >
            {person.email}
          </p>
          <p className="mt-1 text-xs" style={{ color: 'var(--muted-2)' }}>
            The email is the account itself, so it cannot be changed here. Create a new login if
            somebody needs a different one.
          </p>
        </div>

        {/* A suspended login keeps everything -- their sheet, their records,
            their history -- and simply cannot sign in. */}
        <label className="flex cursor-pointer items-center gap-2.5">
          <input
            type="checkbox"
            name="active"
            checked={status === 'active'}
            onChange={(e) => setStatus(e.target.checked ? 'active' : 'suspended')}
            className="size-4 cursor-pointer rounded"
            style={{ accentColor: 'var(--brand)' }}
          />
          <span className="text-sm" style={{ color: 'var(--ink-2)' }}>
            Active — may sign in
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
  )
}
