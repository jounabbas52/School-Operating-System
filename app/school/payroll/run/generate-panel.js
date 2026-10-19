'use client'

import { useActionState, useState } from 'react'
import { Spinner } from '@/components/spinner'
import SidePanel from '@/components/side-panel'
import { useCloseOnSuccess } from '@/components/use-close-on-success'
import { monthLabel, runMonth } from '@/lib/payroll-options'
import { generatePayroll } from '../actions'

function RunButton({ label, pending }) {
  return (
    <button type="submit" form="generate-form" disabled={pending} className="btn btn-primary">
      {pending ? (
        <>
          <Spinner /> Generating…
        </>
      ) : (
        label
      )}
    </button>
  )
}

// Build or rebuild one month.
//
// Generating is safe to repeat while the run is a draft: each employee's row
// is upserted, so a staff member added mid-month gets picked up and the rest
// are recomputed from the same attendance. Once the month is approved or paid,
// the action refuses — that is what approval is for.
export default function GeneratePanel({ year, month, missing, regenerate, trigger }) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState(generatePayroll, {})
  useCloseOnSuccess(state, () => setOpen(false))

  const period = runMonth(year, month)

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={trigger.className}>
        {trigger.label}
      </button>

      <SidePanel
        open={open}
        busy={pending}
        onClose={() => setOpen(false)}
        title={regenerate ? 'Refresh from attendance' : 'Generate Payroll'}
        description={monthLabel(period)}
        icon="⚡"
        footer={
          <>
            <button type="button" onClick={() => setOpen(false)} disabled={pending} className="btn btn-ghost">
              Cancel
            </button>
            <RunButton pending={pending} label={regenerate ? 'Refresh' : 'Generate'} />
          </>
        }
      >
        <form id="generate-form" action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="run_month" value={period} />

          <div
            className="rounded-xl px-4 py-3"
            style={{ background: 'var(--brand-soft)', border: '1px solid transparent' }}
          >
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              Period
            </p>
            <p className="mt-0.5 text-lg font-semibold" style={{ color: 'var(--brand-ink)' }}>
              {monthLabel(period)}
            </p>
          </div>

          {missing > 0 && (
            <p
              className="rounded-lg px-3 py-2 text-sm"
              style={{ background: 'var(--amber-soft)', color: 'var(--amber-ink)' }}
            >
              {missing} employee{missing === 1 ? '' : 's'} with a salary package {missing === 1 ? 'is' : 'are'}{' '}
              not in this run yet — usually someone hired after it was generated.
            </p>
          )}

          <div
            className="rounded-xl px-4 py-3 text-xs"
            style={{ background: 'var(--card-alt)', border: '1px solid var(--border-soft)' }}
          >
            <p className="font-semibold" style={{ color: 'var(--ink-2)' }}>
              What this does
            </p>
            <ul className="mt-1.5 flex flex-col gap-1" style={{ color: 'var(--muted)' }}>
              <li>
                Every active employee with a salary package gets a row. Anyone without one is
                skipped and named in the result.
              </li>
              <li>
                Working days come from Payroll Settings — the calendar month less weekly offs and
                holidays, or a fixed figure.
              </li>
              <li>
                Absences, half days and late marks are read off the staff register for the month.
                Paid leave costs nothing.
              </li>
              <li>
                Every figure is <strong>snapshotted</strong> onto the row. Changing a salary next
                month will not alter what this month paid.
              </li>
            </ul>
          </div>

          {regenerate && (
            <p
              className="rounded-lg px-3 py-2 text-sm"
              style={{ background: 'var(--amber-soft)', color: 'var(--amber-ink)' }}
            >
              Any manual adjustments made to draft rows are recalculated away. Approved and paid
              months cannot be regenerated at all.
            </p>
          )}

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
