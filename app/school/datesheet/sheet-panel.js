'use client'

import { useActionState, useState } from 'react'
import { Spinner } from '@/components/spinner'
import SidePanel from '@/components/side-panel'
import { useCloseOnSuccess } from '@/components/use-close-on-success'
import Combobox, { Select } from '@/components/combobox'
import { SHEET_STATUSES } from '@/lib/exam-options'
import { saveSheet } from './actions'

function SaveButton({ editing, pending }) {
  return (
    <button type="submit" form="sheet-form" disabled={pending} className="btn btn-primary">
      {pending ? (
        <>
          <Spinner /> Saving…
        </>
      ) : editing ? (
        'Save changes'
      ) : (
        'Create Date Sheet'
      )}
    </button>
  )
}

export default function SheetPanel({ row, classes, exams, sessions, trigger }) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState(saveSheet, {})
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
        busy={pending}
        onClose={() => setOpen(false)}
        title={editing ? `Edit ${row.name}` : 'Create New Date Sheet'}
        description="The printable page the scheduled papers appear on"
        icon="▦"
        footer={
          <>
            <button type="button" onClick={() => setOpen(false)} disabled={pending} className="btn btn-ghost">
              Cancel
            </button>
            <SaveButton pending={pending} editing={editing} />
          </>
        }
      >
        <form id="sheet-form" action={formAction} className="flex flex-col gap-4">
          {editing && <input type="hidden" name="id" value={row.id} />}

          <div>
            <label className="label" htmlFor="sheet-name">
              Date sheet name *
            </label>
            <input
              id="sheet-name"
              name="name"
              required
              defaultValue={row?.name ?? ''}
              placeholder="e.g. Mid Term 2026 — Class 10"
              className="field"
            />
          </div>

          <div>
            <label className="label" htmlFor="sheet-exam-name">
              Exam heading
            </label>
            <input
              id="sheet-exam-name"
              name="exam_name"
              defaultValue={row?.exam_name ?? ''}
              placeholder="Printed at the top of the sheet"
              className="field"
            />
            <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
              Left blank, the date sheet name is used.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="sheet-class">
                Class
              </label>
              <Combobox
                id="sheet-class"
                name="class_id"
                defaultValue={row?.class_id ?? ''}
                placeholder="All classes"
                options={classes}
                emptyLabel="No classes yet."
              />
            </div>
            <div>
              <label className="label" htmlFor="sheet-exam">
                Linked exam
              </label>
              <Select
                id="sheet-exam"
                name="exam_id"
                defaultValue={row?.exam_id ?? ''}
                placeholder="—"
                options={exams}
                emptyLabel="No exams yet."
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="sheet-start">
                Starts
              </label>
              <input
                id="sheet-start"
                name="start_date"
                type="date"
                defaultValue={row?.start_date ?? ''}
                className="field"
              />
            </div>
            <div>
              <label className="label" htmlFor="sheet-end">
                Ends
              </label>
              <input
                id="sheet-end"
                name="end_date"
                type="date"
                defaultValue={row?.end_date ?? ''}
                className="field"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="sheet-session">
                Session
              </label>
              <Select
                id="sheet-session"
                name="session_id"
                defaultValue={row?.session_id ?? currentSession ?? ''}
                placeholder="—"
                options={sessions}
                emptyLabel="No sessions yet."
              />
            </div>
            <div>
              <label className="label" htmlFor="sheet-status">
                Status
              </label>
              <Select
                id="sheet-status"
                name="status"
                defaultValue={row?.status ?? 'draft'}
                options={SHEET_STATUSES.map((s) => ({ id: s.id, label: s.label }))}
              />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="sheet-instructions">
              Instructions
            </label>
            <textarea
              id="sheet-instructions"
              name="instructions"
              rows={3}
              defaultValue={row?.instructions ?? ''}
              placeholder="Printed under the table — e.g. Bring your own stationery."
              className="field resize-none"
            />
          </div>

          <div>
            <label className="label" htmlFor="sheet-notes">
              Internal notes
            </label>
            <textarea
              id="sheet-notes"
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
