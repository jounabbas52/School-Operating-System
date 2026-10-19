'use client'

import { useActionState, useState } from 'react'
import { Spinner } from '@/components/spinner'
import SidePanel from '@/components/side-panel'
import { useCloseOnSuccess } from '@/components/use-close-on-success'
import Combobox from '@/components/combobox'
import { checkInVisitor } from '../actions'

function CheckInButton({ pending }) {
  return (
    <button type="submit" form="visitor-form" disabled={pending} className="btn btn-primary">
      {pending ? (
        <>
          <Spinner /> Checking in…
        </>
      ) : (
        'Check In Visitor'
      )}
    </button>
  )
}

export default function VisitorPanel({ staff, date, trigger }) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState(checkInVisitor, {})
  useCloseOnSuccess(state, () => setOpen(false))

  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const timeNow = `${pad(now.getHours())}:${pad(now.getMinutes())}`

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={trigger.className}>
        {trigger.label}
      </button>

      <SidePanel
        open={open}
        busy={pending}
        onClose={() => setOpen(false)}
        title="Visitor Check-In"
        description="Register a visitor for today"
        icon="◉"
        footer={
          <>
            <button type="button" onClick={() => setOpen(false)} disabled={pending} className="btn btn-ghost">
              Cancel
            </button>
            <CheckInButton pending={pending} />
          </>
        }
      >
        <form id="visitor-form" action={formAction} className="flex flex-col gap-4">
          <p
            className="text-[0.68rem] font-bold uppercase tracking-wider"
            style={{ color: 'var(--brand-ink)' }}
          >
            Visitor Information
          </p>

          <div>
            <label className="label" htmlFor="vs-name">
              Full Name *
            </label>
            <input
              id="vs-name"
              name="name"
              required
              placeholder="e.g. Ahmad Raza"
              className="field"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="vs-phone">
                Phone Number
              </label>
              <input id="vs-phone" name="phone" placeholder="0300-0000000" className="field" />
            </div>
            <div>
              <label className="label" htmlFor="vs-meet">
                Whom to Meet
              </label>
              {/* A free-typed name is allowed: most visitors ask for someone
                  who may have no login at all. */}
              <Combobox
                id="vs-meet"
                name="whom_to_meet"
                createName="whom_to_meet_new"
                placeholder="Search staff or type a name…"
                createLabel="Use"
                options={staff}
                emptyLabel="No staff on file."
              />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="vs-cnic">
              CNIC
            </label>
            <input id="vs-cnic" name="cnic" placeholder="00000-0000000-0" className="field" />
          </div>

          <div>
            <label className="label" htmlFor="vs-purpose">
              Purpose / Reason *
            </label>
            <textarea
              id="vs-purpose"
              name="purpose"
              rows={3}
              required
              placeholder="State the purpose of visit…"
              className="field resize-none"
            />
          </div>

          <p
            className="border-t pt-4 text-[0.68rem] font-bold uppercase tracking-wider"
            style={{ color: 'var(--brand-ink)', borderColor: 'var(--border)' }}
          >
            Visit Details
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="vs-time">
                Check-In Time
              </label>
              <input
                id="vs-time"
                name="check_in"
                type="time"
                defaultValue={timeNow}
                className="field"
              />
            </div>
            <div>
              <label className="label" htmlFor="vs-date">
                Date
              </label>
              <input id="vs-date" name="visit_date" type="date" defaultValue={date} className="field" />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="vs-notes">
              Notes
            </label>
            <textarea id="vs-notes" name="notes" rows={2} className="field resize-none" />
          </div>

          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            A badge number is issued automatically and restarts each day.
          </p>

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
