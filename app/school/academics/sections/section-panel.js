'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Spinner } from '@/components/spinner'
import SidePanel from '@/components/side-panel'
import { useCloseOnSuccess } from '@/components/use-close-on-success'
import { Select } from '@/components/combobox'
import { saveSection } from '../actions'

function SaveButton({ editing }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" form="section-form" disabled={pending} className="btn btn-primary">
      {pending ? (
        <>
          <Spinner /> Saving…
        </>
      ) : (
        editing ? 'Save changes' : 'Create section'
      )}
    </button>
  )
}

export default function SectionPanel({
  row,
  classes,
  subjects,
  assignedSubjects = [],
  defaultClassId,
  trigger,
}) {
  const [open, setOpen] = useState(false)
  const [state, formAction] = useActionState(saveSection, {})
  useCloseOnSuccess(state, () => setOpen(false))

  const editing = Boolean(row)
  const chosen = new Set(assignedSubjects)

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={trigger.className}>
        {trigger.label}
      </button>

      <SidePanel
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Edit section ${row.name}` : 'Add new section'}
        description="Create a section for a class"
        footer={
          <>
            <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost">
              Cancel
            </button>
            <SaveButton editing={editing} />
          </>
        }
      >
        <form id="section-form" action={formAction} className="flex flex-col gap-4">
          {editing && <input type="hidden" name="id" value={row.id} />}

          <div>
            <label className="label" htmlFor="sec-class">
              Class *
            </label>
            <Select
              id="sec-class"
              name="class_id"
              required
              searchable
              defaultValue={row?.class_id ?? defaultClassId ?? ''}
              placeholder="Select a class…"
              options={classes}
            />
          </div>

          <div>
            <label className="label" htmlFor="sec-name">
              Section name *
            </label>
            <input
              id="sec-name"
              name="name"
              required
              maxLength={12}
              defaultValue={row?.name ?? ''}
              placeholder="A, B, C, Blue, Red…"
              className="field"
            />
            <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
              Saved in uppercase, so &ldquo;a&rdquo; and &ldquo;A&rdquo; cannot both exist.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="sec-capacity">
                Student capacity
              </label>
              <input
                id="sec-capacity"
                name="capacity"
                type="number"
                min="1"
                defaultValue={row?.capacity ?? 35}
                className="field"
              />
            </div>
            <div>
              <label className="label" htmlFor="sec-room">
                Room
              </label>
              <input
                id="sec-room"
                name="room_number"
                defaultValue={row?.room_number ?? ''}
                placeholder="204"
                className="field"
              />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="sec-status">
              Status
            </label>
            <Select id="sec-status" name="status" defaultValue={row?.status ?? 'active'} options={[{ id: 'active', label: 'Active' }, { id: 'inactive', label: 'Inactive' }]} />
          </div>

          <div>
            <span className="label">Subjects</span>
            <p className="mb-2 text-xs" style={{ color: 'var(--muted)' }}>
              Taught in this section. Two sections of the same class can differ.
            </p>

            {subjects.length === 0 ? (
              <p
                className="rounded-lg px-3 py-2 text-sm"
                style={{ background: 'var(--card-alt)', color: 'var(--muted)' }}
              >
                No subjects defined yet — add them on the Subjects screen.
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {subjects.map((subject) => (
                  <label
                    key={subject.id}
                    className="flex items-center gap-2.5 rounded-lg border px-3 py-2"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <input
                      type="checkbox"
                      name="subject_ids"
                      value={subject.id}
                      defaultChecked={chosen.has(subject.id)}
                      className="size-4 shrink-0 rounded"
                      style={{ accentColor: 'var(--blue-600)' }}
                    />
                    <span className="min-w-0 flex-1 text-sm" style={{ color: 'var(--ink)' }}>
                      {subject.name}
                    </span>
                    {subject.code && (
                      <span className="font-mono text-[0.65rem]" style={{ color: 'var(--muted-2)' }}>
                        {subject.code}
                      </span>
                    )}
                  </label>
                ))}
              </div>
            )}
          </div>

          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            A class teacher can be assigned once the Teachers module is built.
          </p>

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
