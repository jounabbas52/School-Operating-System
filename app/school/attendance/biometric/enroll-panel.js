'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Spinner } from '@/components/spinner'
import SidePanel from '@/components/side-panel'
import { useCloseOnSuccess } from '@/components/use-close-on-success'
import Combobox from '@/components/combobox'
import { saveEnrollment } from './actions'

const FINGERS = [
  'Right thumb',
  'Right index',
  'Left thumb',
  'Left index',
  'Other',
]

function SaveButton({ editing }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" form="enroll-form" disabled={pending} className="btn btn-primary">
      {pending ? (
        <>
          <Spinner /> Saving…
        </>
      ) : editing ? (
        'Save changes'
      ) : (
        'Enrol person'
      )}
    </button>
  )
}

// Maps a device ID to a person.
//
// Worth being precise about what this does NOT do: it does not capture a
// fingerprint. The thumb is enrolled on the hardware, which assigns it a
// number; this records which person that number is. The template itself never
// comes near the app, which is exactly why this is the safe place to keep the
// mapping.
export default function EnrollPanel({ row, students, staff, trigger }) {
  const [open, setOpen] = useState(false)
  const [state, formAction] = useActionState(saveEnrollment, {})
  useCloseOnSuccess(state, () => setOpen(false))

  const [personType, setPersonType] = useState(row?.person_type ?? 'student')
  const editing = Boolean(row)

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={trigger.className}>
        {trigger.label}
      </button>

      <SidePanel
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Edit enrolment' : 'Enrol a person'}
        description="Map a device ID to a student or staff member"
        icon="◉"
        footer={
          <>
            <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost">
              Cancel
            </button>
            <SaveButton editing={editing} />
          </>
        }
      >
        <form id="enroll-form" action={formAction} className="flex flex-col gap-4">
          {editing && <input type="hidden" name="id" value={row.id} />}
          <input type="hidden" name="person_type" value={personType} />

          <div>
            <span className="label">Who is this?</span>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'student', label: 'Student' },
                { id: 'staff', label: 'Staff' },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setPersonType(t.id)}
                  className="rounded-lg px-3 py-2.5 text-sm font-medium transition"
                  style={{
                    background: personType === t.id ? 'var(--brand-soft)' : 'var(--card)',
                    border: `1px solid ${personType === t.id ? 'var(--brand)' : 'var(--border)'}`,
                    color: personType === t.id ? 'var(--brand-ink)' : 'var(--ink-2)',
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Both comboboxes stay mounted so switching type does not lose a
              selection, but only the active one submits a value. */}
          <div style={{ display: personType === 'student' ? 'block' : 'none' }}>
            <label className="label" htmlFor="en-student">
              Student *
            </label>
            <Combobox
              id="en-student"
              name={personType === 'student' ? 'student_id' : 'student_id_unused'}
              defaultValue={row?.student_id ?? ''}
              placeholder="Search student name or admission no…"
              options={students}
              emptyLabel="No active students."
            />
          </div>

          <div style={{ display: personType === 'staff' ? 'block' : 'none' }}>
            <label className="label" htmlFor="en-staff">
              Staff member *
            </label>
            <Combobox
              id="en-staff"
              name={personType === 'staff' ? 'staff_id' : 'staff_id_unused'}
              defaultValue={row?.staff_id ?? ''}
              placeholder="Search staff name or ID…"
              options={staff}
              emptyLabel="No active staff."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="en-device-id">
                Device ID *
              </label>
              <input
                id="en-device-id"
                name="device_user_id"
                required
                defaultValue={row?.device_user_id ?? ''}
                placeholder="e.g. 17"
                className="field font-mono"
              />
            </div>
            <div>
              <label className="label" htmlFor="en-finger">
                Finger
              </label>
              <select
                id="en-finger"
                name="finger_label"
                defaultValue={row?.finger_label ?? 'Right thumb'}
                className="field"
              >
                {FINGERS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <p
            className="rounded-lg px-3 py-2 text-xs"
            style={{ background: 'var(--card-alt)', color: 'var(--muted)' }}
          >
            The <strong>Device ID</strong> is the number the fingerprint reader assigned when the
            thumb was enrolled on it — read it off the device, not from this app. Enter it exactly,
            including any leading zero: <span className="font-mono">007</span> and{' '}
            <span className="font-mono">7</span> are different people to the hardware.
          </p>

          <div>
            <label className="label" htmlFor="en-notes">
              Notes
            </label>
            <textarea
              id="en-notes"
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
