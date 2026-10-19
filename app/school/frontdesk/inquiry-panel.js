'use client'

import { useActionState, useState } from 'react'
import { Spinner } from '@/components/spinner'
import SidePanel from '@/components/side-panel'
import { useCloseOnSuccess } from '@/components/use-close-on-success'
import Combobox, { Select } from '@/components/combobox'
import { ADMISSION_STATES, INQUIRY_STATUSES } from '@/lib/operations-options'
import { saveInquiry } from './actions'

function SaveButton({ editing, pending }) {
  return (
    <button type="submit" form="inquiry-form" disabled={pending} className="btn btn-primary">
      {pending ? (
        <>
          <Spinner /> Saving…
        </>
      ) : editing ? (
        'Save changes'
      ) : (
        'Save Inquiry'
      )}
    </button>
  )
}

export default function InquiryPanel({ row, classes, trigger }) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState(saveInquiry, {})
  useCloseOnSuccess(state, () => setOpen(false))

  const editing = Boolean(row)
  // 'open' and 'closed' are the legacy values the column shipped with.
  const currentStatus =
    row?.status === 'open' ? 'pending' : row?.status === 'closed' ? 'resolved' : row?.status

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={trigger.className}>
        {trigger.label}
      </button>

      <SidePanel
        open={open}
        busy={pending}
        onClose={() => setOpen(false)}
        title={editing ? `Edit inquiry — ${row.name ?? ''}` : 'New Inquiry'}
        description="Record a new front-desk inquiry"
        icon="▤"
        footer={
          <>
            <button type="button" onClick={() => setOpen(false)} disabled={pending} className="btn btn-ghost">
              Cancel
            </button>
            <SaveButton pending={pending} editing={editing} />
          </>
        }
      >
        <form id="inquiry-form" action={formAction} className="flex flex-col gap-4">
          {editing && <input type="hidden" name="id" value={row.id} />}

          <p
            className="text-[0.68rem] font-bold uppercase tracking-wider"
            style={{ color: 'var(--brand-ink)' }}
          >
            Visitor Information
          </p>

          <div>
            <label className="label" htmlFor="iq-name">
              Full Name *
            </label>
            <input
              id="iq-name"
              name="name"
              required
              defaultValue={row?.name ?? ''}
              placeholder="e.g. Muhammad Ali"
              className="field"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="iq-phone">
                Phone Number
              </label>
              <input
                id="iq-phone"
                name="contact_phone"
                defaultValue={row?.contact_phone ?? ''}
                placeholder="0300-0000000"
                className="field"
              />
            </div>
            <div>
              <label className="label" htmlFor="iq-date">
                Date *
              </label>
              <input
                id="iq-date"
                name="inquiry_date"
                type="date"
                required
                defaultValue={row?.inquiry_date ?? new Date().toISOString().slice(0, 10)}
                className="field"
              />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="iq-email">
              Email
            </label>
            <input
              id="iq-email"
              name="contact_email"
              type="email"
              defaultValue={row?.contact_email ?? ''}
              className="field"
            />
          </div>

          <p
            className="border-t pt-4 text-[0.68rem] font-bold uppercase tracking-wider"
            style={{ color: 'var(--brand-ink)', borderColor: 'var(--border)' }}
          >
            Inquiry Details
          </p>

          <div>
            <label className="label" htmlFor="iq-purpose">
              Purpose / Subject *
            </label>
            <textarea
              id="iq-purpose"
              name="purpose"
              rows={3}
              required
              defaultValue={row?.purpose ?? row?.message ?? ''}
              placeholder="Describe the purpose of the inquiry…"
              className="field resize-none"
            />
          </div>

          <div>
            <label className="label" htmlFor="iq-class">
              Class of interest
            </label>
            <Combobox
              id="iq-class"
              name="class_id"
              defaultValue={row?.class_id ?? ''}
              placeholder="—"
              options={classes}
              emptyLabel="No classes yet."
            />
          </div>

          <div>
            <span className="label">Status</span>
            <div className="grid grid-cols-3 gap-2">
              {INQUIRY_STATUSES.map((s) => (
                <label key={s.id} className="segment">
                  <input
                    type="radio"
                    name="status"
                    value={s.id}
                    defaultChecked={(currentStatus ?? 'pending') === s.id}
                    className="sr-only"
                  />
                  {s.label}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="label" htmlFor="iq-admission">
              Admission outcome
            </label>
            <Select
              id="iq-admission"
              name="admission_status"
              defaultValue={row?.admission_status ?? 'none'}
              options={ADMISSION_STATES.map((s) => ({
                id: s.id,
                label: s.id === 'none' ? 'Not applicable' : s.label,
              }))}
            />
          </div>

          <div>
            <label className="label" htmlFor="iq-notes">
              Internal Notes
            </label>
            <textarea
              id="iq-notes"
              name="internal_notes"
              rows={2}
              defaultValue={row?.internal_notes ?? ''}
              placeholder="Any additional notes…"
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
