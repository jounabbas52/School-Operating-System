'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Spinner } from '@/components/spinner'
import SidePanel from '@/components/side-panel'
import { useCloseOnSuccess } from '@/components/use-close-on-success'
import Combobox, { Select } from '@/components/combobox'
import { EXAM_STATUS_OPTIONS } from '@/lib/exam-options'
import { saveExam } from './actions'

function SaveButton({ editing }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" form="exam-form" disabled={pending} className="btn btn-primary">
      {pending ? (
        <>
          <Spinner /> Saving…
        </>
      ) : editing ? (
        'Save changes'
      ) : (
        'Create Exam'
      )}
    </button>
  )
}

// The three-way status picker from the design: a radio group styled as cards,
// not a dropdown. Status is the one field someone changes without opening
// anything else, so it is worth the space.
function StatusPicker({ defaultValue }) {
  return (
    <div>
      <span className="label">Status</span>
      <div className="grid grid-cols-3 gap-2">
        {EXAM_STATUS_OPTIONS.map((s) => (
          <label key={s.id} className="segment">
            <input
              type="radio"
              name="status"
              value={s.id}
              defaultChecked={(defaultValue ?? 'upcoming') === s.id}
              className="sr-only"
            />
            <span className="size-2 rounded-full" style={{ background: s.dot }} aria-hidden="true" />
            {s.label}
          </label>
        ))}
      </div>
    </div>
  )
}

export default function ExamPanel({ row, classes, sessions, years, trigger }) {
  const [open, setOpen] = useState(false)
  const [state, formAction] = useActionState(saveExam, {})
  useCloseOnSuccess(state, () => setOpen(false))

  const editing = Boolean(row)
  const currentSession = sessions.find((s) => s.is_current)?.id
  const currentYear = years.find((y) => y.is_active)?.id

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={trigger.className}>
        {trigger.label}
      </button>

      <SidePanel
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Edit ${row.name}` : 'Create New Exam'}
        description="Fill in the exam information to create it"
        icon="▣"
        footer={
          <>
            <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost">
              Cancel
            </button>
            <SaveButton editing={editing} />
          </>
        }
      >
        <form id="exam-form" action={formAction} className="flex flex-col gap-4">
          {editing && <input type="hidden" name="id" value={row.id} />}

          <div>
            <label className="label" htmlFor="exam-name">
              Exam Name *
            </label>
            <input
              id="exam-name"
              name="name"
              required
              defaultValue={row?.name ?? ''}
              placeholder="e.g. Mid-Term Examination"
              className="field"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="exam-class">
                Class *
              </label>
              <Combobox
                id="exam-class"
                name="class_id"
                required
                defaultValue={row?.class_id ?? ''}
                placeholder="Search or select class…"
                options={classes}
                emptyLabel="No classes yet."
              />
            </div>
            <div>
              <label className="label" htmlFor="exam-year">
                Academic Year
              </label>
              <Combobox
                id="exam-year"
                name="academic_year_id"
                defaultValue={row?.academic_year_id ?? currentYear ?? ''}
                placeholder="Search or select year…"
                options={years}
                emptyLabel="No academic years yet."
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="exam-start">
                Start Date *
              </label>
              <input
                id="exam-start"
                name="start_date"
                type="date"
                required
                defaultValue={row?.start_date ?? ''}
                className="field"
              />
            </div>
            <div>
              <label className="label" htmlFor="exam-end">
                End Date *
              </label>
              <input
                id="exam-end"
                name="end_date"
                type="date"
                required
                defaultValue={row?.end_date ?? ''}
                className="field"
              />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="exam-session">
              Session
            </label>
            <Select
              id="exam-session"
              name="session_id"
              defaultValue={row?.session_id ?? currentSession ?? ''}
              placeholder="—"
              options={sessions}
              emptyLabel="No sessions yet."
            />
          </div>

          <div>
            <label className="label" htmlFor="exam-description">
              Description <span style={{ color: 'var(--muted-2)' }}>· Optional</span>
            </label>
            <textarea
              id="exam-description"
              name="description"
              rows={3}
              defaultValue={row?.description ?? ''}
              placeholder="Describe the topics, scope, or special instructions for this exam…"
              className="field resize-none"
            />
          </div>

          <StatusPicker defaultValue={row?.status} />

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
