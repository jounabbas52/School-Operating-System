'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Spinner } from '@/components/spinner'
import SidePanel from '@/components/side-panel'
import { useCloseOnSuccess } from '@/components/use-close-on-success'
import Combobox, { Select } from '@/components/combobox'
import SectionRows from '@/components/section-rows'
import { saveClass } from '../actions'

function SaveButton({ editing }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" form="class-form" disabled={pending} className="btn btn-primary">
      {pending ? (
        <>
          <Spinner /> Saving…
        </>
      ) : (
        editing ? 'Save changes' : 'Create class'
      )}
    </button>
  )
}

export default function ClassPanel({ row, gradeLevels, sessions, activeSessionId, trigger }) {
  const [open, setOpen] = useState(false)
  const [state, formAction] = useActionState(saveClass, {})
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
        title={editing ? `Edit ${row.name}` : 'Add new class'}
        description="Class curriculum and settings"
        footer={
          <>
            <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost">
              Cancel
            </button>
            <SaveButton editing={editing} />
          </>
        }
      >
        <form id="class-form" action={formAction} className="flex flex-col gap-4">
          {editing && <input type="hidden" name="id" value={row.id} />}

          <div>
            <label className="label" htmlFor="c-grade">
              Class / grade level *
            </label>
            <Combobox
              options={gradeLevels.map((g) => ({ id: g.id, label: g.name }))}
              name="grade_level_id"
              createName="new_grade_level"
              defaultValue={row?.grade_level_id ?? ''}
              placeholder="Select or add class name…"
              createLabel="Add New Class"
              required
            />
            <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
              Type a name that does not exist yet to create the grade level as you go.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="c-session">
                Session *
              </label>
              <Select
                id="c-session"
                name="session_id"
                required
                defaultValue={row?.session_id ?? activeSessionId ?? ''}
                placeholder="Select session…"
                options={sessions.map((s) => ({
                  id: s.id,
                  label: s.is_current ? `${s.name} (active)` : s.name,
                }))}
              />
            </div>
            <div>
              <label className="label" htmlFor="c-capacity">
                Default section capacity
              </label>
              <input
                id="c-capacity"
                name="capacity"
                type="number"
                min="1"
                defaultValue={row?.capacity ?? 35}
                className="field"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="c-grading">
                Grading system
              </label>
              <Select
                id="c-grading"
                name="grading_system"
                defaultValue={row?.grading_system ?? 'percentage'}
                options={[
                  { id: 'percentage', label: 'Percentage' },
                  { id: 'grade', label: 'Letter grade' },
                  { id: 'gpa', label: 'GPA' },
                ]}
              />
            </div>
            <div>
              <label className="label" htmlFor="c-fee">
                Base fee (Rs.)
              </label>
              <input
                id="c-fee"
                name="standard_fee"
                type="number"
                min="0"
                step="0.01"
                defaultValue={row?.standard_fee ?? ''}
                placeholder="0.00"
                className="field"
              />
            </div>
          </div>

          <div>
            <span className="label">Status</span>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Inactive' },
              ].map((option) => (
                <label key={option.value} className="segment">
                  <input
                    type="radio"
                    name="status"
                    value={option.value}
                    className="sr-only"
                    defaultChecked={(row?.status ?? 'active') === option.value}
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </div>

          {!editing && <SectionRows defaultCapacity={row?.capacity ?? 35} />}

          <fieldset
            className="rounded-lg border p-3"
            style={{ borderColor: 'var(--border)', background: 'var(--card-alt)' }}
          >
            <legend
              className="px-1 text-[0.68rem] font-semibold uppercase tracking-wider"
              style={{ color: 'var(--brand-ink)' }}
            >
              Default class timing
            </legend>
            <p className="mb-3 text-xs" style={{ color: 'var(--muted)' }}>
              Applied when the timetable is generated. Editable per period later.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="c-start">
                  Start time
                </label>
                <input
                  id="c-start"
                  name="start_time"
                  type="time"
                  defaultValue={row?.start_time?.slice(0, 5) ?? '08:00'}
                  className="field"
                />
              </div>
              <div>
                <label className="label" htmlFor="c-periods">
                  Periods per day
                </label>
                <input
                  id="c-periods"
                  name="periods_per_day"
                  type="number"
                  min="1"
                  max="15"
                  defaultValue={row?.periods_per_day ?? 7}
                  className="field"
                />
              </div>
              <div>
                <label className="label" htmlFor="c-len">
                  Period (min)
                </label>
                <input
                  id="c-len"
                  name="period_minutes"
                  type="number"
                  min="5"
                  max="180"
                  defaultValue={row?.period_minutes ?? 45}
                  className="field"
                />
              </div>
              <div>
                <label className="label" htmlFor="c-breakafter">
                  Break after period
                </label>
                <input
                  id="c-breakafter"
                  name="break_after_period"
                  type="number"
                  min="0"
                  max="15"
                  defaultValue={row?.break_after_period ?? 3}
                  className="field"
                />
              </div>
              <div>
                <label className="label" htmlFor="c-breaklen">
                  Break (min)
                </label>
                <input
                  id="c-breaklen"
                  name="break_minutes"
                  type="number"
                  min="0"
                  max="120"
                  defaultValue={row?.break_minutes ?? 10}
                  className="field"
                />
              </div>
            </div>
          </fieldset>

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
