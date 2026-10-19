'use client'

import { useActionState, useState } from 'react'
import { Spinner } from '@/components/spinner'
import SidePanel from '@/components/side-panel'
import { useCloseOnSuccess } from '@/components/use-close-on-success'
import Combobox, { Select } from '@/components/combobox'
import { generateClassSlips, saveSlip } from '../actions'

function SaveButton({ label, form, pending }) {
  return (
    <button type="submit" form={form} disabled={pending} className="btn btn-primary">
      {pending ? (
        <>
          <Spinner /> Working…
        </>
      ) : (
        label
      )}
    </button>
  )
}

// A labelled checkbox row, matching the Slip Options block on the design.
function Toggle({ name, label, defaultChecked }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-sm" style={{ color: 'var(--ink-2)' }}>
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="size-4 cursor-pointer rounded"
        style={{ accentColor: 'var(--brand)' }}
      />
      {label}
    </label>
  )
}

export default function SlipPanel({ row, sheets, classes, students, trigger }) {
  const [open, setOpen] = useState(false)
  // Two modes behind one button. A school prints one replacement card and a
  // whole class's cards from the same place, and splitting them into two
  // sidebar entries would hide the one people use most.
  const [mode, setMode] = useState('single')

  const [single, singleAction, singlePending] = useActionState(saveSlip, {})
  const [bulk, bulkAction, bulkPending] = useActionState(generateClassSlips, {})

  const editing = Boolean(row)
  // Two actions behind one footer button, so the pending that matters is
  // whichever mode is showing.
  const pending = mode === 'bulk' ? bulkPending : singlePending
  const state = mode === 'bulk' ? bulk : single
  useCloseOnSuccess(state, () => setOpen(false))

  // Narrow the student list once a class is chosen -- a 900-name combobox is
  // not a list anybody scrolls.
  const [classId, setClassId] = useState(row?.class_id ?? '')
  const visibleStudents = classId ? students.filter((s) => s.class_id === classId) : students

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={trigger.className}>
        {trigger.label}
      </button>

      <SidePanel
        open={open}
        busy={pending}
        onClose={() => setOpen(false)}
        title={editing ? 'Edit Slip' : 'Generate New Slip'}
        description="Create an exam admit card"
        icon="▤"
        footer={
          <>
            <button type="button" onClick={() => setOpen(false)} disabled={pending} className="btn btn-ghost">
              Cancel
            </button>
            <SaveButton
              pending={pending}
              form={mode === 'bulk' ? 'slip-bulk-form' : 'slip-form'}
              label={
                editing ? 'Save changes' : mode === 'bulk' ? 'Generate for class' : 'Generate Slip'
              }
            />
          </>
        }
      >
        {!editing && (
          <div className="mb-4 flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => setMode('single')}
              className={`tab ${mode === 'single' ? 'tab-on' : ''}`}
            >
              One student
            </button>
            <button
              type="button"
              onClick={() => setMode('bulk')}
              className={`tab ${mode === 'bulk' ? 'tab-on' : ''}`}
            >
              Whole class
            </button>
          </div>
        )}

        {mode === 'single' || editing ? (
          <form id="slip-form" action={singleAction} className="flex flex-col gap-4">
            {editing && <input type="hidden" name="id" value={row.id} />}

            <div>
              <label className="label" htmlFor="slip-sheet">
                Date Sheet *
              </label>
              <Combobox
                id="slip-sheet"
                name="group_id"
                required
                defaultValue={row?.group_id ?? ''}
                placeholder="Select date sheet…"
                options={sheets}
                emptyLabel="No date sheets yet."
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="slip-class">
                  Class
                </label>
                <Combobox
                  id="slip-class"
                  name="class_id"
                  defaultValue={row?.class_id ?? ''}
                  placeholder="Select class…"
                  options={classes}
                  onChangeValue={setClassId}
                  emptyLabel="No classes yet."
                />
              </div>
              <div>
                <label className="label" htmlFor="slip-student">
                  Student *
                </label>
                <Combobox
                  id="slip-student"
                  name="student_id"
                  required
                  defaultValue={row?.student_id ?? ''}
                  placeholder="Enter student name…"
                  options={visibleStudents}
                  emptyLabel={classId ? 'No students in that class.' : 'No students yet.'}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="slip-roll">
                  Roll Number
                </label>
                <input
                  id="slip-roll"
                  name="roll_number"
                  defaultValue={row?.roll_number ?? ''}
                  placeholder="e.g. 001"
                  className="field"
                />
                <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                  Left blank, the student&rsquo;s own roll number is used.
                </p>
              </div>
              <div>
                <label className="label" htmlFor="slip-room">
                  Room Number
                </label>
                <input
                  id="slip-room"
                  name="room_number"
                  defaultValue={row?.room_number ?? ''}
                  placeholder="e.g. 101"
                  className="field"
                />
              </div>
            </div>

            <div
              className="rounded-xl p-3.5"
              style={{ background: 'var(--card-alt)', border: '1px solid var(--border-soft)' }}
            >
              <p
                className="mb-2.5 text-[0.68rem] font-bold uppercase tracking-wider"
                style={{ color: 'var(--brand-ink)' }}
              >
                Slip Options
              </p>
              <div className="flex flex-col gap-2.5">
                <Toggle name="show_room" label="Show Room Number" defaultChecked={row?.show_room ?? true} />
                <Toggle name="show_time" label="Show Exam Time" defaultChecked={row?.show_time ?? true} />
                <Toggle
                  name="show_signature"
                  label="Show Principal Signature"
                  defaultChecked={row?.show_signature ?? false}
                />
              </div>
            </div>

            {single?.error && (
              <p
                className="rounded-lg px-3 py-2 text-sm"
                style={{ background: 'var(--red-soft)', color: 'var(--red)' }}
              >
                {single.error}
              </p>
            )}
          </form>
        ) : (
          <form id="slip-bulk-form" action={bulkAction} className="flex flex-col gap-4">
            <div>
              <label className="label" htmlFor="bulk-sheet">
                Date Sheet *
              </label>
              <Combobox
                id="bulk-sheet"
                name="group_id"
                required
                placeholder="Select date sheet…"
                options={sheets}
                emptyLabel="No date sheets yet."
              />
            </div>

            <div>
              <label className="label" htmlFor="bulk-class">
                Class *
              </label>
              <Combobox
                id="bulk-class"
                name="class_id"
                required
                placeholder="Select class…"
                options={classes}
                onChangeValue={setClassId}
                emptyLabel="No classes yet."
              />
              <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                {classId
                  ? `${visibleStudents.length} active student${visibleStudents.length === 1 ? '' : 's'} in this class.`
                  : 'Every active student in the class gets a card.'}
              </p>
            </div>

            <div
              className="rounded-xl p-3.5"
              style={{ background: 'var(--card-alt)', border: '1px solid var(--border-soft)' }}
            >
              <p
                className="mb-2.5 text-[0.68rem] font-bold uppercase tracking-wider"
                style={{ color: 'var(--brand-ink)' }}
              >
                Slip Options
              </p>
              <div className="flex flex-col gap-2.5">
                <Toggle name="show_room" label="Show Room Number" defaultChecked />
                <Toggle name="show_time" label="Show Exam Time" defaultChecked />
                <Toggle name="show_signature" label="Show Principal Signature" />
              </div>
            </div>

            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              Generating twice does not duplicate cards — an existing slip for a student is
              updated rather than added again.
            </p>

            {bulk?.error && (
              <p
                className="rounded-lg px-3 py-2 text-sm"
                style={{ background: 'var(--red-soft)', color: 'var(--red)' }}
              >
                {bulk.error}
              </p>
            )}
          </form>
        )}
      </SidePanel>
    </>
  )
}
