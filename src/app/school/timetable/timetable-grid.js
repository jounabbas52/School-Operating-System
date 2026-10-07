'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import SidePanel from '@/components/side-panel'
import { Select } from '@/components/combobox'
import { Spinner } from '@/components/spinner'
import { useCloseOnSuccess } from '@/components/use-close-on-success'
import { DAY_LABEL, clock, timeRange } from '@/lib/timetable'
import { saveSlot } from './actions'

function SaveButton({ assigned }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" form="slot-form" disabled={pending} className="btn btn-primary">
      {pending ? (
        <>
          <Spinner /> Saving…
        </>
      ) : assigned ? (
        'Save slot'
      ) : (
        'Assign subject'
      )}
    </button>
  )
}

function Field({ label, children, required, hint }) {
  return (
    <div>
      <span className="label">
        {label}
        {required && <span style={{ color: 'var(--red)' }}> *</span>}
      </span>
      {children}
      {hint && (
        <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
          {hint}
        </p>
      )}
    </div>
  )
}

// Colour is derived from the subject id, not stored, so a grid full of
// lessons reads as blocks of subject rather than a wall of identical cards.
const SUBJECT_TONES = [
  { bg: 'var(--brand-soft)', ink: 'var(--brand-ink)', edge: 'var(--brand)' },
  { bg: 'var(--blue-soft)', ink: 'var(--blue-ink)', edge: 'var(--blue)' },
  { bg: 'var(--green-soft)', ink: 'var(--green-ink)', edge: 'var(--green)' },
  { bg: 'var(--amber-soft)', ink: 'var(--amber-ink)', edge: 'var(--amber)' },
  { bg: 'var(--red-soft)', ink: 'var(--red-ink)', edge: 'var(--red)' },
]

function toneFor(id) {
  let hash = 0
  for (let i = 0; i < String(id).length; i++) hash = (hash * 31 + String(id).charCodeAt(i)) >>> 0
  return SUBJECT_TONES[hash % SUBJECT_TONES.length]
}

export default function TimetableGrid({
  days,
  columns,
  periodsByDay,
  entries,
  subjects,
  teachers,
  classId,
  sectionId,
  canWrite,
}) {
  const [open, setOpen] = useState(null)
  const [state, formAction] = useActionState(saveSlot, {})
  useCloseOnSuccess(state, () => setOpen(null))

  const entry = open ? entries[open.id] : null
  const [subjectId, setSubjectId] = useState('')

  function openCell(period) {
    setSubjectId(entries[period.id]?.subject_id ?? '')
    setOpen(period)
  }

  return (
    <>
      <div className="card overflow-x-auto">
        <table className="table min-w-[64rem]">
          <thead>
            <tr>
              <th style={{ minWidth: '7rem' }}>Day</th>
              {columns.map((col) => (
                <th key={col.sort_order} style={{ minWidth: '9rem' }}>
                  <span className="block">{col.name}</span>
                  <span className="block text-[0.62rem] font-normal opacity-80">
                    {timeRange(col.start_time, col.end_time)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map((day) => {
              const slots = periodsByDay[day] ?? {}
              return (
                <tr key={day}>
                  <td>
                    <div className="flex items-center gap-2">
                      <span
                        className="size-1.5 shrink-0 rounded-full"
                        style={{ background: 'var(--brand)' }}
                        aria-hidden="true"
                      />
                      <span className="font-medium" style={{ color: 'var(--ink)' }}>
                        {DAY_LABEL[day]}
                      </span>
                    </div>
                  </td>

                  {columns.map((col) => {
                    const period = slots[col.sort_order]

                    // This day is shorter than the longest one -- Friday
                    // against a full Monday. An empty cell, not a slot.
                    if (!period) {
                      return (
                        <td key={col.sort_order}>
                          <span className="text-xs" style={{ color: 'var(--muted-2)' }}>
                            —
                          </span>
                        </td>
                      )
                    }

                    if (period.kind === 'break') {
                      return (
                        <td key={col.sort_order}>
                          <div
                            className="rounded-lg px-2 py-2 text-center text-xs font-medium"
                            style={{
                              background: 'var(--amber-soft)',
                              color: 'var(--amber-ink)',
                              border: '1px solid var(--amber)',
                            }}
                          >
                            {period.name}
                          </div>
                        </td>
                      )
                    }

                    const cell = entries[period.id]
                    const tone = cell ? toneFor(cell.subject_id) : null

                    return (
                      <td key={col.sort_order}>
                        <button
                          type="button"
                          disabled={!canWrite}
                          onClick={() => openCell(period)}
                          className="w-full rounded-lg px-2 py-2 text-left text-xs transition disabled:cursor-default"
                          style={
                            cell
                              ? {
                                  background: tone.bg,
                                  color: tone.ink,
                                  border: `1px solid ${tone.edge}`,
                                }
                              : {
                                  background: 'transparent',
                                  color: 'var(--muted-2)',
                                  border: '1px dashed var(--border)',
                                }
                          }
                        >
                          {cell ? (
                            <>
                              <span className="block font-semibold">{cell.subject_name}</span>
                              <span className="block truncate opacity-80">
                                {cell.teacher_name ?? 'No teacher'}
                              </span>
                              {cell.room_number && (
                                <span className="block opacity-70">Room {cell.room_number}</span>
                              )}
                            </>
                          ) : (
                            <>
                              <span className="block text-center text-sm leading-none">+</span>
                              <span className="mt-1 block text-center text-[0.6rem]">
                                {clock(period.start_time)}
                              </span>
                            </>
                          )}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <SidePanel
        open={Boolean(open)}
        onClose={() => setOpen(null)}
        width="max-w-md"
        icon="🕘"
        title={open ? `${DAY_LABEL[open.day_of_week]} · ${open.name}` : ''}
        description={open ? timeRange(open.start_time, open.end_time) : ''}
        footer={
          <>
            <button type="button" onClick={() => setOpen(null)} className="btn btn-ghost">
              Cancel
            </button>
            <SaveButton assigned={Boolean(entry)} />
          </>
        }
      >
        {open && (
          <form id="slot-form" action={formAction} className="flex flex-col gap-4">
            <input type="hidden" name="period_id" value={open.id} />
            <input type="hidden" name="class_id" value={classId} />
            <input type="hidden" name="section_id" value={sectionId} />

            <Field
              label="Subject"
              hint="Clearing the subject empties the slot — there is no lesson without one."
            >
              <Select
                name="subject_id"
                searchable
                defaultValue={subjectId}
                placeholder="Select subject…"
                emptyLabel="No subjects yet — add them under System Setup."
                options={[{ id: '', label: '— Clear this slot —' }, ...subjects]}
                onChangeValue={setSubjectId}
              />
            </Field>

            <Field label="Teacher">
              <Select
                name="teacher_id"
                searchable
                defaultValue={entry?.teacher_id ?? ''}
                placeholder="Select teacher…"
                emptyLabel="No teaching staff yet."
                options={[{ id: '', label: '— None —' }, ...teachers]}
              />
            </Field>

            <Field label="Room">
              <input
                name="room_number"
                defaultValue={entry?.room_number ?? ''}
                placeholder="e.g. 204"
                className="field"
              />
            </Field>

            {state?.error && (
              <p
                className="rounded-lg px-3 py-2 text-sm"
                style={{ background: 'var(--red-soft)', color: 'var(--red-ink)' }}
              >
                {state.error}
              </p>
            )}
          </form>
        )}
      </SidePanel>
    </>
  )
}
