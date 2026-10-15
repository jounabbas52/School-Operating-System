'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import SidePanel from '@/components/side-panel'
import { Select } from '@/components/combobox'
import { Spinner } from '@/components/spinner'
import { useCloseOnSuccess } from '@/components/use-close-on-success'
import { DOC_STATUSES, DOC_TYPES } from '@/lib/staff-options'
import { saveDocument } from '../actions'

function SaveButton({ editing }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" form="document-form" disabled={pending} className="btn btn-primary">
      {pending ? (
        <>
          <Spinner /> Saving…
        </>
      ) : editing ? (
        'Save changes'
      ) : (
        'Add document'
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

export default function DocumentPanel({ row, staff, trigger }) {
  const [open, setOpen] = useState(false)
  const [state, formAction] = useActionState(saveDocument, {})
  useCloseOnSuccess(state, () => setOpen(false))

  const editing = Boolean(row)

  const [staffId, setStaffId] = useState(row?.staff_id ?? '')
  const [expiry, setExpiry] = useState(row?.expiry_date ?? '')
  const chosen = staff.find((s) => s.id === staffId)

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={trigger.className}>
        {trigger.label}
      </button>

      <SidePanel
        open={open}
        onClose={() => setOpen(false)}
        width="max-w-xl"
        icon="📄"
        title={editing ? 'Edit staff document' : 'Add staff document'}
        description="Fill in the document information"
        footer={
          <>
            <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost">
              Cancel
            </button>
            <SaveButton editing={editing} />
          </>
        }
      >
        <form id="document-form" action={formAction} className="flex flex-col gap-4">
          {editing && <input type="hidden" name="id" value={row.id} />}

          <Group title="Staff information">
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <Field label="Staff name" required>
                <Select
                  name="staff_id"
                  searchable
                  required
                  defaultValue={staffId}
                  placeholder="Search staff by name or ID…"
                  emptyLabel="No staff yet — add them under All Staff."
                  options={staff}
                  onChangeValue={setStaffId}
                />
              </Field>

              <div>
                <span className="label">Staff ID</span>
                <p
                  className="field flex items-center"
                  style={{
                    background: 'var(--card-alt)',
                    color: chosen?.staff_number ? 'var(--ink-2)' : 'var(--muted-2)',
                  }}
                >
                  {chosen?.staff_number || 'Auto-filled'}
                </p>
              </div>
            </div>
          </Group>

          <Group title="Document details">
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <Field label="Document type" required>
                <Select
                  name="doc_type"
                  required
                  defaultValue={row?.doc_type ?? 'cnic'}
                  options={DOC_TYPES}
                />
              </Field>

              <Field label="Document number">
                <input
                  name="doc_number"
                  defaultValue={row?.doc_number ?? ''}
                  placeholder="e.g. 3420100000000"
                  className="field font-mono"
                />
              </Field>

              <Field label="Issue date">
                <input
                  name="issue_date"
                  type="date"
                  defaultValue={row?.issue_date ?? ''}
                  className="field"
                />
              </Field>

              <Field label="Expiry date">
                <input
                  name="expiry_date"
                  type="date"
                  value={expiry}
                  onChange={(event) => setExpiry(event.target.value)}
                  className="field"
                />
              </Field>

              <div className="sm:col-span-2">
                <span className="label">Status</span>
                <div className="grid grid-cols-3 gap-2">
                  {DOC_STATUSES.map((option) => (
                    <label key={option.id} className="segment">
                      <input
                        type="radio"
                        name="status"
                        value={option.id}
                        className="sr-only"
                        defaultChecked={(row?.status ?? 'valid') === option.id}
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
                <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                  {expiry
                    ? 'Ignored while an expiry date is set — the register reads the date, so the status can never go stale.'
                    : 'Used as-is, because this document has no expiry date.'}
                </p>
              </div>
            </div>
          </Group>

          <div>
            <span className="label">Notes</span>
            <textarea
              name="notes"
              rows={3}
              defaultValue={row?.notes ?? ''}
              placeholder="Any additional notes…"
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
