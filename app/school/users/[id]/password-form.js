'use client'

import { useActionState, useState } from 'react'
import { PanelButton } from '@/components/submit-button'
import { setUserPassword } from '../../actions'

// Setting a password, not reading one.
//
// There is no "show current password" here and there cannot be: auth.users
// holds a bcrypt hash, which is one-way by design. The most an administrator
// can do -- the most anybody can do -- is replace it.
//
// The value is typed in the clear on purpose, with a reveal toggle: the admin
// has to be able to read it back to pass it on, since nothing emails it.
export default function PasswordForm({ profileId, email }) {
  const [state, formAction, pending] = useActionState(setUserPassword, {})
  const [reveal, setReveal] = useState(false)

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="profile_id" value={profileId} />

      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="pw-new">
            New password
          </label>
          <input
            id="pw-new"
            name="password"
            type={reveal ? 'text' : 'password'}
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="at least 8 characters"
            className="field"
          />
        </div>
        <div>
          <label className="label" htmlFor="pw-confirm">
            Repeat it
          </label>
          <input
            id="pw-confirm"
            name="confirm"
            type={reveal ? 'text' : 'password'}
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="the same again"
            className="field"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex cursor-pointer items-center gap-2 text-xs" style={{ color: 'var(--muted)' }}>
          <input
            type="checkbox"
            checked={reveal}
            onChange={(e) => setReveal(e.target.checked)}
            className="size-3.5 cursor-pointer rounded"
            style={{ accentColor: 'var(--brand)' }}
          />
          Show what I am typing
        </label>

        <PanelButton pending={pending} pendingLabel="Setting…" className="btn btn-primary">
          Set password
        </PanelButton>
      </div>

      {state?.error && (
        <p
          className="rounded-lg px-3 py-2 text-sm"
          style={{ background: 'var(--red-soft)', color: 'var(--red)' }}
        >
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p
          className="rounded-lg px-3 py-2 text-sm"
          style={{ background: 'var(--green-soft)', color: 'var(--green-ink)' }}
        >
          {state.ok}
        </p>
      )}

      <p className="text-xs" style={{ color: 'var(--muted-2)' }}>
        {email} can sign in with the new password immediately. Anyone already signed in as that
        account stays signed in until their session expires — Supabase does not drop existing
        sessions when a password changes.
      </p>
    </form>
  )
}
