'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Spinner } from '@/components/spinner'
import SidePanel from '@/components/side-panel'
import { useCloseOnSuccess } from '@/components/use-close-on-success'
import Combobox, { Select } from '@/components/combobox'
import { EXAM_STATUS_OPTIONS, TEST_TYPES } from '@/lib/exam-options'
import { saveTest } from '../actions'

function SaveButton({ editing }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" form="test-form" disabled={pending} className="btn btn-primary">
      {pending ? (
        <>
          <Spinner /> Saving…
        </>
      ) : editing ? (
        'Save changes'
      ) : (
        'Create Test'
      )}
    </button>
  )
}

export default function TestPanel({ row, classes, subjects, sessions, trigger }) {
  const [open, setOpen] = useState(false)
  const [state, formAction] = useActionState(saveTest, {})
  useCloseOnSuccess(state, () => setOpen(false))

  const editing = Boolean(row)
  const currentSession = sessions.find((s) => s.is_current)?.id

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={trigger.className}>
        {trigger.label}
      </button>

      <SidePanel
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Edit ${row.test_name}` : 'Create New Test'}
        description="Quick test / quiz management"
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
        <form id="test-form" action={formAction} className="flex flex-col gap-4">
          {editing && <input type="hidden" name="id" value={row.id} />}

          <div>
            <label className="label" htmlFor="test-name">
              Test Name *
            </label>
            <input
              id="test-name"
              name="test_name"
              required
              defaultValue={row?.test_name ?? ''}
              placeholder="e.g. Chapter 3 Quiz"
              className="field"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="test-class">
                Class *
              </label>
              <Combobox
                id="test-class"
                name="class_id"
                required
                defaultValue={row?.class_id ?? ''}
                placeholder="Select class…"
                options={classes}
                emptyLabel="No classes yet."
              />
            </div>
            <div>
              <label className="label" htmlFor="test-subject">
                Subject *
              </label>
              <Combobox
                id="test-subject"
                name="subject_id"
                required
                defaultValue={row?.subject_id ?? ''}
                placeholder="e.g. Mathematics"
                options={subjects}
                emptyLabel="No subjects yet."
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="test-max">
                Total Marks
              </label>
              <input
                id="test-max"
                name="max_marks"
                type="number"
                min="1"
                defaultValue={row?.max_marks ?? 50}
                className="field"
              />
            </div>
            <div>
              <label className="label" htmlFor="test-date">
                Date
              </label>
              <input
                id="test-date"
                name="test_date"
                type="date"
                defaultValue={row?.test_date ?? ''}
                className="field"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="test-session">
                Academic Year
              </label>
              <Select
                id="test-session"
                name="session_id"
                defaultValue={row?.session_id ?? currentSession ?? ''}
                placeholder="e.g. 2025–2026"
                options={sessions}
                emptyLabel="No sessions yet."
              />
            </div>
            <div>
              <label className="label" htmlFor="test-status">
                Status
              </label>
              <Select
                id="test-status"
                name="status"
                defaultValue={row?.status ?? 'upcoming'}
                options={EXAM_STATUS_OPTIONS.map((s) => ({ id: s.id, label: s.label }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="test-type">
                Type
              </label>
              <Select
                id="test-type"
                name="test_type"
                defaultValue={row?.test_type ?? 'class_test'}
                options={TEST_TYPES}
              />
            </div>
            <div>
              <label className="label" htmlFor="test-pass">
                Pass marks
              </label>
              <input
                id="test-pass"
                name="pass_marks"
                type="number"
                min="0"
                defaultValue={row?.pass_marks ?? ''}
                placeholder="Optional"
                className="field"
              />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="test-description">
              Description
            </label>
            <textarea
              id="test-description"
              name="description"
              rows={3}
              defaultValue={row?.description ?? ''}
              placeholder="Optional notes…"
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
