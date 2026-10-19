'use client'

import { useActionState, useState } from 'react'
import { Spinner } from '@/components/spinner'
import SidePanel from '@/components/side-panel'
import { useCloseOnSuccess } from '@/components/use-close-on-success'
import { saveSession } from '../actions'

function SaveButton({ editing, pending }) {
  return (
    <button type="submit" form="session-form" disabled={pending} className="btn btn-primary">
      {pending ? (
        <>
          <Spinner /> Saving…
        </>
      ) : (
        editing ? 'Save changes' : 'Create session'
      )}
    </button>
  )
}

export default function SessionPanel({ row, isFirst, trigger }) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState(saveSession, {})
  useCloseOnSuccess(state, () => setOpen(false))

  const editing = Boolean(row)

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={trigger.className}>
        {trigger.label}
      </button>

      <SidePanel
        open={open}
        busy={pending}
        onClose={() => setOpen(false)}
        title={editing ? `Edit ${row.name}` : 'New session'}
        description="A session is one school year. Classes and admissions attach to the active one."
        footer={
          <>
            <button type="button" onClick={() => setOpen(false)} disabled={pending} className="btn btn-ghost">
              Cancel
            </button>
            <SaveButton pending={pending} editing={editing} />
          </>
        }
      >
        <form id="session-form" action={formAction} className="flex flex-col gap-4">
          {editing && <input type="hidden" name="id" value={row.id} />}

          <div>
            <label className="label" htmlFor="s-name">Session name</label>
            <input id="s-name" name="name" required defaultValue={row?.name ?? ''}
              placeholder="2026-2027" className="field" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="s-start">Start date</label>
              <input id="s-start" name="start_date" type="date" required
                defaultValue={row?.start_date ?? ''} className="field" />
            </div>
            <div>
              <label className="label" htmlFor="s-end">End date</label>
              <input id="s-end" name="end_date" type="date" required
                defaultValue={row?.end_date ?? ''} className="field" />
            </div>
          </div>

          <label
            className="flex items-start gap-2.5 rounded-lg border px-3 py-2.5"
            style={{ borderColor: 'var(--border)' }}
          >
            <input type="checkbox" name="is_current"
              defaultChecked={row?.is_current ?? isFirst}
              className="mt-0.5 size-4 shrink-0 rounded"
              style={{ accentColor: 'var(--blue-600)' }} />
            <span>
              <span className="block text-sm font-medium" style={{ color: 'var(--ink)' }}>
                Make this the active session
              </span>
              <span className="text-xs" style={{ color: 'var(--muted)' }}>
                Only one session is active at a time. Activating this one stands the current one down.
              </span>
            </span>
          </label>

          {state?.error && (
            <p className="rounded-lg px-3 py-2 text-sm"
              style={{ background: 'var(--red-soft)', color: 'var(--red)' }}>
              {state.error}
            </p>
          )}
        </form>
      </SidePanel>
    </>
  )
}
