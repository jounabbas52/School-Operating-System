'use client'

import { useActionState, useState } from 'react'
import { Spinner } from '@/components/spinner'
import SidePanel from '@/components/side-panel'
import { useCloseOnSuccess } from '@/components/use-close-on-success'
import { Select } from '@/components/combobox'
import { saveGradeLevel } from '../actions'

function SaveButton({ editing, pending }) {
  return (
    <button type="submit" form="grade-form" disabled={pending} className="btn btn-primary">
      {pending ? (
        <>
          <Spinner /> Saving…
        </>
      ) : (
        editing ? 'Save changes' : 'Add grade level'
      )}
    </button>
  )
}

export default function GradeLevelPanel({ row, trigger }) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState(saveGradeLevel, {})
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
        title={editing ? `Edit ${row.name}` : 'Add grade level'}
        description="Permanent — the same level is reused every session."
        footer={
          <>
            <button type="button" onClick={() => setOpen(false)} disabled={pending} className="btn btn-ghost">
              Cancel
            </button>
            <SaveButton pending={pending} editing={editing} />
          </>
        }
      >
        <form id="grade-form" action={formAction} className="flex flex-col gap-4">
          {editing && <input type="hidden" name="id" value={row.id} />}

          <div>
            <label className="label" htmlFor="g-name">Grade level name</label>
            <input id="g-name" name="name" required defaultValue={row?.name ?? ''}
              placeholder="Class 1" className="field" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="g-short">Short label</label>
              <input id="g-short" name="short_name" maxLength={4}
                defaultValue={row?.short_name ?? ''} placeholder="1S" className="field" />
              <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                Shown in the round badge.
              </p>
            </div>
            <div>
              <label className="label" htmlFor="g-stage">Stage</label>
              <Select
                id="g-stage"
                name="stage"
                defaultValue={row?.stage ?? ''}
                placeholder="—"
                options={[
                  { id: 'pre_primary', label: 'Pre-primary' },
                  { id: 'primary', label: 'Primary' },
                  { id: 'middle', label: 'Middle' },
                  { id: 'secondary', label: 'Secondary' },
                ]}
              />
            </div>
          </div>

          {editing && (
            <div>
              <label className="label" htmlFor="g-order">Display order</label>
              <input id="g-order" name="ordinal" type="number" defaultValue={row?.ordinal ?? ''}
                className="field" />
              <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                Or use the up and down arrows on the list.
              </p>
            </div>
          )}

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
