'use client'

import { useActionState, useState } from 'react'
import SidePanel from '@/components/side-panel'
import { PanelButton, PanelCancel } from '@/components/submit-button'
import { createUser } from '../actions'

// Creating a login, from inside the app.
//
// It starts closed: the account exists, it can sign in, and it can reach
// nothing at all until somebody opens its Access sheet. An account that can
// reach nothing is harmless; one created wide open is not, and defaults are
// what people forget to change.
export default function NewUser() {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState(createUser, {})
  const [reveal, setReveal] = useState(false)

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn btn-primary">
        + New user
      </button>

      <SidePanel
        open={open}
        onClose={() => setOpen(false)}
        title="New user"
        description="An email, a password, and nothing else until you say so"
        icon="✚"
        variant="modal"
        width="max-w-xl"
        footer={
          <>
            <PanelCancel onClick={() => setOpen(false)} pending={pending} />
            <PanelButton form="new-user-form" pending={pending} pendingLabel="Creating…">
              Create user
            </PanelButton>
          </>
        }
      >
        <form id="new-user-form" action={formAction} className="flex flex-col gap-3">
          <div>
            <label className="label" htmlFor="nu-name">
              Full name *
            </label>
            <input id="nu-name" name="full_name" required placeholder="e.g. Sara Ahmed" className="field" />
          </div>

          <div>
            <label className="label" htmlFor="nu-email">
              Email they sign in with *
            </label>
            <input
              id="nu-email"
              name="email"
              type="email"
              required
              autoComplete="off"
              placeholder="sara@school.test"
              className="field"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="nu-password">
                Password *
              </label>
              <input
                id="nu-password"
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
              <label className="label" htmlFor="nu-confirm">
                Repeat it *
              </label>
              <input
                id="nu-confirm"
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

          <label
            className="flex cursor-pointer items-center gap-2 text-xs"
            style={{ color: 'var(--muted)' }}
          >
            <input
              type="checkbox"
              checked={reveal}
              onChange={(e) => setReveal(e.target.checked)}
              className="size-3.5 cursor-pointer rounded"
              style={{ accentColor: 'var(--brand)' }}
            />
            Show what I am typing — you will need to read it back to them
          </label>

          <p
            className="rounded-lg px-3 py-2 text-xs"
            style={{ background: 'var(--blue-soft)', color: 'var(--blue-ink)' }}
          >
            They are created with <strong>no access to anything</strong>. Open their row afterwards
            and tick the sections they may see, add to, or delete from — their sheet is theirs
            alone, and nothing is shared with anybody else.
          </p>

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
        </form>
      </SidePanel>
    </>
  )
}
