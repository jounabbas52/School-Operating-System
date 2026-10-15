'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Spinner } from '@/components/spinner'
import SidePanel from '@/components/side-panel'
import { useCloseOnSuccess } from '@/components/use-close-on-success'
import { money } from '@/lib/payroll-options'
import { adjustItem } from '../actions'

function SaveButton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" form="adjust-form" disabled={pending} className="btn btn-primary">
      {pending ? (
        <>
          <Spinner /> Saving…
        </>
      ) : (
        'Save adjustment'
      )}
    </button>
  )
}

// A bonus or an extra deduction on one person's month.
//
// Deliberately additive rather than an edit of the computed figures: the
// generated numbers stay visible, and the adjustment is a line someone has to
// own with a remark.
export default function AdjustPanel({ row, trigger }) {
  const [open, setOpen] = useState(false)
  const [state, formAction] = useActionState(adjustItem, {})
  useCloseOnSuccess(state, () => setOpen(false))

  const [bonus, setBonus] = useState(0)
  const [deduction, setDeduction] = useState(0)

  const gross = Number(row.gross_amount) || 0
  const deductions = Number(row.deduction_amount) || 0
  const net = Math.max(0, gross + bonus - (deductions + deduction))

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={trigger.className}>
        {trigger.label}
      </button>

      <SidePanel
        open={open}
        onClose={() => setOpen(false)}
        title={`Adjust — ${row.name}`}
        description="A bonus or an extra deduction for this month only"
        icon="±"
        footer={
          <>
            <span className="mr-auto text-sm" style={{ color: 'var(--muted)' }}>
              New net:{' '}
              <span className="font-semibold tabular-nums" style={{ color: 'var(--green)' }}>
                {money(net)}
              </span>
            </span>
            <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost">
              Cancel
            </button>
            <SaveButton />
          </>
        }
      >
        <form id="adjust-form" action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="id" value={row.id} />

          <div
            className="grid grid-cols-3 gap-2 rounded-xl px-4 py-3 text-center"
            style={{ background: 'var(--card-alt)', border: '1px solid var(--border-soft)' }}
          >
            {[
              ['Current gross', money(gross), 'var(--ink)'],
              ['Current deductions', `- ${money(deductions)}`, 'var(--red)'],
              ['Current net', money(row.net_amount), 'var(--green)'],
            ].map(([label, value, colour]) => (
              <div key={label}>
                <p className="text-[0.65rem]" style={{ color: 'var(--muted)' }}>
                  {label}
                </p>
                <p className="mt-0.5 text-sm font-semibold tabular-nums" style={{ color: colour }}>
                  {value}
                </p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="adj-bonus">
                Bonus / addition
              </label>
              <input
                id="adj-bonus"
                name="bonus"
                type="number"
                min="0"
                value={bonus || ''}
                onChange={(e) => setBonus(Number(e.target.value) || 0)}
                placeholder="Rs 0"
                className="field"
              />
            </div>
            <div>
              <label className="label" htmlFor="adj-deduction">
                Extra deduction
              </label>
              <input
                id="adj-deduction"
                name="extra_deduction"
                type="number"
                min="0"
                value={deduction || ''}
                onChange={(e) => setDeduction(Number(e.target.value) || 0)}
                placeholder="Rs 0"
                className="field"
              />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="adj-remarks">
              Reason
            </label>
            <textarea
              id="adj-remarks"
              name="remarks"
              rows={3}
              defaultValue={row.remarks ?? ''}
              placeholder="Why this month differs — this is the record."
              className="field resize-none"
            />
          </div>

          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            Adjustments are added to the generated figures, not substituted for them. Refreshing the
            run from attendance recalculates them away.
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
