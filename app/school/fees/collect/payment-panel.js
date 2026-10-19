'use client'

import { useActionState, useState } from 'react'
import { Spinner } from '@/components/spinner'
import SidePanel from '@/components/side-panel'
import { useCloseOnSuccess } from '@/components/use-close-on-success'
import Combobox, { Select } from '@/components/combobox'
import { FEE_METHODS, money } from '@/lib/fee-options'
import { recordPayment } from '../actions'

function SaveButton({ pending }) {
  return (
    <button type="submit" form="payment-form" disabled={pending} className="btn btn-primary">
      {pending ? (
        <>
          <Spinner /> Recording…
        </>
      ) : (
        'Record Payment'
      )}
    </button>
  )
}

// Collect against a challan.
//
// The challan is picked first and the amount defaults to whatever is still
// outstanding on it, because the overwhelmingly common case is a parent
// paying the bill in full. Partial payments are typed over it.
export default function PaymentPanel({ challans, challanId, trigger }) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState(recordPayment, {})
  useCloseOnSuccess(state, () => setOpen(false))

  const [chosen, setChosen] = useState(challanId ?? challans[0]?.id ?? '')
  const challan = challans.find((c) => String(c.id) === String(chosen))
  const outstanding = challan?.outstanding ?? 0

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={trigger.className}>
        {trigger.label}
      </button>

      <SidePanel
        open={open}
        busy={pending}
        onClose={() => setOpen(false)}
        title="Collect Fee"
        description="Record a payment against a challan"
        icon="₨"
        footer={
          <>
            <button type="button" onClick={() => setOpen(false)} disabled={pending} className="btn btn-ghost">
              Cancel
            </button>
            <SaveButton pending={pending} />
          </>
        }
      >
        <form id="payment-form" action={formAction} className="flex flex-col gap-4">
          <div>
            <label className="label" htmlFor="pay-challan">
              Challan *
            </label>
            <Combobox
              id="pay-challan"
              name="challan_id"
              required
              defaultValue={chosen}
              placeholder="Search challan…"
              options={challans}
              onChangeValue={setChosen}
              emptyLabel="Nothing outstanding."
            />
          </div>

          {challan && (
            <div
              className="rounded-xl px-4 py-3"
              style={{ background: 'var(--brand-soft)', border: '1px solid transparent' }}
            >
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                Outstanding on this challan
              </p>
              <p
                className="mt-0.5 text-xl font-semibold tabular-nums"
                style={{ color: 'var(--brand-ink)' }}
              >
                {money(outstanding)}
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="pay-amount">
                Amount received *
              </label>
              <input
                id="pay-amount"
                name="amount_paid"
                type="number"
                min="1"
                max={outstanding || undefined}
                step="1"
                // Keyed on the challan so switching challans refills the
                // amount. defaultValue alone would keep the first figure.
                key={chosen}
                defaultValue={outstanding || ''}
                className="field"
              />
            </div>
            <div>
              <label className="label" htmlFor="pay-method">
                Method
              </label>
              <Select id="pay-method" name="method" defaultValue="cash" options={FEE_METHODS} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="pay-date">
                Payment date
              </label>
              <input id="pay-date" name="paid_at" type="date" className="field" />
              <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                Left blank, today is used.
              </p>
            </div>
            <div>
              <label className="label" htmlFor="pay-reference">
                Reference
              </label>
              <input
                id="pay-reference"
                name="reference"
                placeholder="Cheque / transaction no."
                className="field"
              />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="pay-notes">
              Notes
            </label>
            <textarea id="pay-notes" name="notes" rows={2} className="field resize-none" />
          </div>

          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            A receipt number is issued automatically when the payment is saved.
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
