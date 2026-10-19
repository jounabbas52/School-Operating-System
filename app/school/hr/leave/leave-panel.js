'use client'

import { useActionState, useState } from 'react'
import SidePanel from '@/components/side-panel'
import { Select } from '@/components/combobox'
import { Spinner } from '@/components/spinner'
import { useCloseOnSuccess } from '@/components/use-close-on-success'
import { LEAVE_STATUSES, LEAVE_TYPES, leaveDays } from '@/lib/staff-options'
import { saveLeave } from '../actions'

function SaveButton({ editing, pending }) {
  return (
    <button type="submit" form="leave-form" disabled={pending} className="btn btn-primary">
      {pending ? (
        <>
          <Spinner /> Saving…
        </>
      ) : editing ? (
        'Save changes'
      ) : (
        'Submit leave'
      )}
    </button>
  )
}

function Field({ label, children, required, hint, span = 1 }) {
  return (
    <div style={{ gridColumn: `span ${span} / span ${span}` }}>
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

function Group({ title, children }) {
  return (
    <fieldset
      className="rounded-xl border p-4"
      style={{ borderColor: 'var(--border)', background: 'var(--card-alt)' }}
    >
      <legend
        className="px-1 text-[0.68rem] font-bold uppercase tracking-wider"
        style={{ color: 'var(--brand-ink)' }}
      >
        {title}
      </legend>
      {children}
    </fieldset>
  )
}

// Read-only mirror of what the chosen staff member already is. Not an input:
// nobody should be able to file leave for Ali under Sana's staff ID.
function Derived({ label, value }) {
  return (
    <div>
      <span className="label">{label}</span>
      <p
        className="field flex items-center"
        style={{ background: 'var(--card-alt)', color: value ? 'var(--ink-2)' : 'var(--muted-2)' }}
      >
        {value || 'Auto-filled'}
      </p>
    </div>
  )
}

export default function LeavePanel({ row, staff, trigger }) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState(saveLeave, {})
  useCloseOnSuccess(state, () => setOpen(false))

  const editing = Boolean(row)

  const [staffId, setStaffId] = useState(row?.staff_id ?? '')
  const [from, setFrom] = useState(row?.from_date ?? '')
  const [to, setTo] = useState(row?.to_date ?? '')

  const chosen = staff.find((s) => s.id === staffId)
  const days = leaveDays(from, to)

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={trigger.className}>
        {trigger.label}
      </button>

      <SidePanel
        open={open}
        busy={pending}
        onClose={() => setOpen(false)}
        width="max-w-xl"
        icon="🗓"
        title={editing ? 'Edit leave application' : 'New leave application'}
        description="Fill in the details to apply leave"
        footer={
          <>
            <button type="button" onClick={() => setOpen(false)} disabled={pending} className="btn btn-ghost">
              Cancel
            </button>
            <SaveButton pending={pending} editing={editing} />
          </>
        }
      >
        <form id="leave-form" action={formAction} className="flex flex-col gap-4">
          {editing && <input type="hidden" name="id" value={row.id} />}

          <Group title="Staff information">
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <Field label="Staff name" required>
                <Select
                  name="staff_id"
                  searchable
                  required
                  defaultValue={staffId}
                  placeholder="Search staff by name…"
                  emptyLabel="No staff yet — add them under All Staff."
                  options={staff}
                  onChangeValue={setStaffId}
                />
              </Field>

              <Derived label="Staff ID" value={chosen?.staff_number} />

              <div className="sm:col-span-2">
                <Derived label="Designation" value={chosen?.designation} />
              </div>
            </div>
          </Group>

          <Group title="Leave details">
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <Field label="Leave type" required>
                <Select
                  name="leave_type"
                  required
                  defaultValue={row?.leave_type ?? 'annual'}
                  options={LEAVE_TYPES}
                />
              </Field>

              <Field label="Status">
                <Select
                  name="status"
                  defaultValue={row?.status ?? 'pending'}
                  options={LEAVE_STATUSES}
                />
              </Field>

              <Field label="From date" required>
                <input
                  name="from_date"
                  type="date"
                  required
                  value={from}
                  onChange={(event) => setFrom(event.target.value)}
                  className="field"
                />
              </Field>

              <Field
                label="To date"
                required
                hint={
                  days === null
                    ? from && to
                      ? 'The end date falls before the start date.'
                      : undefined
                    : `${days} day${days === 1 ? '' : 's'}, inclusive.`
                }
              >
                <input
                  name="to_date"
                  type="date"
                  required
                  min={from || undefined}
                  value={to}
                  onChange={(event) => setTo(event.target.value)}
                  className="field"
                />
              </Field>
            </div>
          </Group>

          <div>
            <span className="label">Reason / notes</span>
            <textarea
              name="reason"
              rows={3}
              defaultValue={row?.reason ?? ''}
              placeholder="Briefly describe the reason for leave…"
              className="field"
            />
          </div>

          {state?.error && (
            <p
              className="rounded-lg px-3 py-2 text-sm"
              style={{ background: 'var(--red-soft)', color: 'var(--red-ink)' }}
            >
              {state.error}
            </p>
          )}
        </form>
      </SidePanel>
    </>
  )
}
