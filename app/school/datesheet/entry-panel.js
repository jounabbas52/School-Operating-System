'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Spinner } from '@/components/spinner'
import SidePanel from '@/components/side-panel'
import { useCloseOnSuccess } from '@/components/use-close-on-success'
import Combobox, { Select } from '@/components/combobox'
import { dayFromDate } from '@/lib/exam-options'
import { saveEntry } from './actions'

function SaveButton({ editing }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" form="entry-form" disabled={pending} className="btn btn-primary">
      {pending ? (
        <>
          <Spinner /> Saving…
        </>
      ) : editing ? (
        'Save changes'
      ) : (
        'Add Entry'
      )}
    </button>
  )
}

export default function EntryPanel({ row, classes, subjects, exams, sheets, trigger }) {
  const [open, setOpen] = useState(false)
  const [state, formAction] = useActionState(saveEntry, {})
  useCloseOnSuccess(state, () => setOpen(false))

  // The weekday follows the date instead of being typed. The server writes it
  // from the date too; this is only so the clerk can see it land.
  const [date, setDate] = useState(row?.exam_date ?? '')

  const editing = Boolean(row)

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={trigger.className}>
        {trigger.label}
      </button>

      <SidePanel
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Edit Date Sheet Entry' : 'Add Date Sheet Entry'}
        description="Fill in the exam schedule details"
        icon="▤"
        footer={
          <>
            <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost">
              Cancel
            </button>
            <SaveButton editing={editing} />
          </>
        }
      >
        <form id="entry-form" action={formAction} className="flex flex-col gap-4">
          {editing && <input type="hidden" name="id" value={row.id} />}

          <div>
            <label className="label" htmlFor="entry-exam-name">
              Exam Name *
            </label>
            <input
              id="entry-exam-name"
              name="exam_name"
              required
              defaultValue={row?.exam_name ?? ''}
              placeholder="e.g. Mid Term 2026"
              className="field"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="entry-subject">
                Subject *
              </label>
              <Combobox
                id="entry-subject"
                name="subject_id"
                required
                defaultValue={row?.subject_id ?? ''}
                placeholder="Search subject…"
                options={subjects}
                emptyLabel="No subjects yet."
              />
            </div>
            <div>
              <label className="label" htmlFor="entry-class">
                Class
              </label>
              <Combobox
                id="entry-class"
                name="class_id"
                defaultValue={row?.class_id ?? ''}
                placeholder="Search class…"
                options={classes}
                emptyLabel="No classes yet."
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="entry-date">
                Date
              </label>
              <input
                id="entry-date"
                name="exam_date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className="field"
              />
            </div>
            <div>
              <label className="label" htmlFor="entry-day">
                Day
              </label>
              <input
                id="entry-day"
                readOnly
                value={dayFromDate(date)}
                placeholder="Auto-filled from date"
                className="field"
                style={{ background: 'var(--card-alt)', color: 'var(--muted)' }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="entry-start">
                Start Time
              </label>
              <input
                id="entry-start"
                name="start_time"
                type="time"
                defaultValue={row?.start_time ?? ''}
                className="field"
              />
            </div>
            <div>
              <label className="label" htmlFor="entry-duration">
                Duration
              </label>
              <input
                id="entry-duration"
                name="duration"
                defaultValue={row?.duration ?? ''}
                placeholder="e.g. 3 hours"
                className="field"
              />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="entry-venue">
              Venue
            </label>
            <input
              id="entry-venue"
              name="venue"
              defaultValue={row?.venue ?? ''}
              placeholder="e.g. Main Hall, Room 101"
              className="field"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="entry-sheet">
                Date sheet
              </label>
              <Select
                id="entry-sheet"
                name="group_id"
                defaultValue={row?.group_id ?? ''}
                placeholder="Not on a sheet"
                options={sheets}
                emptyLabel="No date sheets yet."
              />
            </div>
            <div>
              <label className="label" htmlFor="entry-exam">
                Linked exam
              </label>
              <Select
                id="entry-exam"
                name="exam_id"
                defaultValue={row?.exam_id ?? ''}
                placeholder="—"
                options={exams}
                emptyLabel="No exams yet."
              />
            </div>
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
