'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Spinner } from '@/components/spinner'
import SidePanel from '@/components/side-panel'
import { useCloseOnSuccess } from '@/components/use-close-on-success'
import { Select } from '@/components/combobox'
import { saveSubject } from '../actions'

const CATEGORIES = ['Core', 'Science', 'Languages', 'Social Studies', 'Arts', 'Islamiat', 'Optional']

function SaveButton({ editing }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" form="subject-form" disabled={pending} className="btn btn-primary">
      {pending ? (
        <>
          <Spinner /> Saving…
        </>
      ) : (
        editing ? 'Save changes' : 'Add subject'
      )}
    </button>
  )
}

export default function SubjectPanel({ row, trigger }) {
  const [open, setOpen] = useState(false)
  const [state, formAction] = useActionState(saveSubject, {})
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
        title={editing ? `Edit ${row.name}` : 'Add subject'}
        description="Subjects are defined once, then picked per section."
        footer={
          <>
            <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost">
              Cancel
            </button>
            <SaveButton editing={editing} />
          </>
        }
      >
        <form id="subject-form" action={formAction} className="flex flex-col gap-4">
          {editing && <input type="hidden" name="id" value={row.id} />}

          <div>
            <label className="label" htmlFor="sub-name">
              Subject name *
            </label>
            <input
              id="sub-name"
              name="name"
              required
              defaultValue={row?.name ?? ''}
              placeholder="Mathematics"
              className="field"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="sub-code">
                Code
              </label>
              <input
                id="sub-code"
                name="code"
                defaultValue={row?.code ?? ''}
                placeholder="MATH"
                className="field"
              />
            </div>
            <div>
              <label className="label" htmlFor="sub-marks">
                Default marks
              </label>
              <input
                id="sub-marks"
                name="default_marks"
                type="number"
                min="0"
                defaultValue={row?.default_marks ?? ''}
                placeholder="100"
                className="field"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="sub-category">
                Category
              </label>
              <Select
                id="sub-category"
                name="category"
                defaultValue={row?.category ?? ''}
                placeholder="—"
                options={CATEGORIES.map((c) => ({ id: c, label: c }))}
              />
            </div>
            <div>
              <label className="label" htmlFor="sub-status">
                Status
              </label>
              <Select id="sub-status" name="status" defaultValue={row?.status ?? 'active'} options={[{ id: 'active', label: 'Active' }, { id: 'inactive', label: 'Inactive' }]} />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="sub-description">
              Description
            </label>
            <textarea
              id="sub-description"
              name="description"
              rows={3}
              defaultValue={row?.description ?? ''}
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
