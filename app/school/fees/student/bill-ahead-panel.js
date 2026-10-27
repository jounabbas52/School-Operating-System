'use client'

import { useActionState, useState } from 'react'
import { Spinner } from '@/components/spinner'
import SidePanel from '@/components/side-panel'
import { useCloseOnSuccess } from '@/components/use-close-on-success'
import { money } from '@/lib/fee-options'
import { billAhead } from '../actions'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// Bill several months on one voucher.
//
// A family paying for the rest of the year should get one piece of paper with
// one number on it, not five challans to carry to the bank five times. The
// months come from the class's fee policy, so a voucher spanning January to
// May is the five real monthly bills listed on one page -- which is also why
// those months cannot then be billed again by the monthly run.
export default function BillAheadPanel({ studentId, monthlyFee, trigger }) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState(billAhead, {})
  useCloseOnSuccess(state, () => setOpen(false))

  const now = new Date()
  // Next month, not this one: this month is normally billed already.
  const start = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const [from, setFrom] = useState(
    `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-01`
  )
  const [months, setMonths] = useState(3)

  const fee = Number(monthlyFee) || 0
  const fromDate = new Date(`${from}T00:00:00Z`)
  const lastMonth = new Date(
    Date.UTC(fromDate.getUTCFullYear(), fromDate.getUTCMonth() + months - 1, 1)
  )

  const span =
    months === 1
      ? `${MONTH_NAMES[fromDate.getUTCMonth()]} ${fromDate.getUTCFullYear()}`
      : `${MONTH_NAMES[fromDate.getUTCMonth()]} ${fromDate.getUTCFullYear()} – ${MONTH_NAMES[lastMonth.getUTCMonth()]} ${lastMonth.getUTCFullYear()}`

  const monthOptions = []
  for (let i = -1; i < 14; i += 1) {
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth() + i, 1))
    monthOptions.push({
      value: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`,
      label: `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`,
    })
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={trigger.className}>
        {trigger.label}
      </button>

      <SidePanel
        open={open}
        busy={pending}
        onClose={() => setOpen(false)}
        title="Bill Months Ahead"
        description="One voucher covering several months"
        icon="⌸"
        footer={
          <>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={pending}
              className="btn btn-ghost"
            >
              Cancel
            </button>
            <button type="submit" form="ahead-form" disabled={pending} className="btn btn-primary">
              {pending ? (
                <>
                  <Spinner /> Raising…
                </>
              ) : (
                'Raise Voucher'
              )}
            </button>
          </>
        }
      >
        <form id="ahead-form" action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="student_id" value={studentId} />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="ahead-from">
                Starting month *
              </label>
              <select
                id="ahead-from"
                name="from_month"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="field"
              >
                {monthOptions.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="ahead-months">
                Number of months *
              </label>
              <input
                id="ahead-months"
                name="months"
                type="number"
                min="1"
                max="24"
                step="1"
                value={months}
                onChange={(e) => setMonths(Number(e.target.value) || 1)}
                className="field"
              />
            </div>
          </div>

          <div className="rounded-xl px-4 py-3" style={{ background: 'var(--brand-soft)' }}>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              One voucher covering
            </p>
            <p className="mt-0.5 text-sm font-semibold" style={{ color: 'var(--brand-ink)' }}>
              {span}
            </p>
            {fee > 0 && (
              <p className="mt-1.5 text-xs" style={{ color: 'var(--muted)' }}>
                Roughly {money(fee * months)} at the current monthly fee. The exact figure comes
                from the class fee policy, and anything already billed is left out.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="ahead-due">
                Due date
              </label>
              <input id="ahead-due" name="due_date" type="date" className="field" />
              <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                Left blank, the 10th of the starting month is used.
              </p>
            </div>
            <div>
              <label className="label" htmlFor="ahead-note">
                Note
              </label>
              <input
                id="ahead-note"
                name="note"
                placeholder="Advance payment"
                className="field"
              />
            </div>
          </div>

          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            Any advance the family already holds comes off this voucher automatically.
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
