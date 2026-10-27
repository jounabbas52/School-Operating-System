'use client'

import { useActionState, useState } from 'react'
import { Spinner } from '@/components/spinner'
import SidePanel from '@/components/side-panel'
import { useCloseOnSuccess } from '@/components/use-close-on-success'
import Combobox, { Select } from '@/components/combobox'
import { FEE_METHODS, money } from '@/lib/fee-options'
import { collectFee } from '../actions'

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

// Spread an amount across bills, oldest first, the way the cashier would with
// cash on the counter: fill a bill, move to the next, and whatever is left
// over at the end stays with the family as advance.
//
// This is the same rule collect_fee() applies in the database. It is repeated
// here only to show the parent where their money is going before they hand it
// over -- the database remains the one that decides.
export function allocate(amount, bills) {
  let left = Math.max(0, Number(amount) || 0)
  const rows = []

  for (const bill of bills) {
    if (left <= 0) break
    const take = Math.min(left, bill.outstanding)
    if (take <= 0) continue
    rows.push({ ...bill, pay: take, clears: take >= bill.outstanding - 0.005 })
    left -= take
  }

  return { rows, credit: left }
}

// Collect fee from a student, not from a challan.
//
// The old screen asked which challan was being paid, which cannot describe
// what actually happens at the counter: a parent arrives with one sum of money
// to settle three overdue months and two ahead. So the student is chosen
// first, every bill they owe is listed, one amount is typed, and the split is
// shown before anything is saved. One payment, one receipt.
export default function PaymentPanel({ students, studentId, trigger }) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState(collectFee, {})
  useCloseOnSuccess(state, () => setOpen(false))

  const [chosen, setChosen] = useState(studentId ?? '')
  const [typed, setTyped] = useState('')
  const [manual, setManual] = useState(false)
  const [edited, setEdited] = useState({})

  const student = students.find((s) => String(s.id) === String(chosen))
  const bills = student?.bills ?? []

  // What the family owes today: the bills, less whatever they already have on
  // account. Suggesting the full bill total when they are Rs 7,000 in credit
  // would take money twice.
  const owed = bills.reduce((sum, b) => sum + b.outstanding, 0)
  const credit = student?.credit ?? 0
  const suggested = Math.max(0, Math.round(owed - credit))

  const amount = typed === '' ? suggested : Number(typed) || 0
  // Not memoised: bills comes from a ?? [] fallback, so it is a fresh array
  // on every render and a dependency on it would never hold. The split is a
  // walk down a handful of rows -- cheaper than the bookkeeping to cache it.
  const preview = allocate(amount, bills)

  const manualTotal = bills.reduce((sum, b) => sum + (Number(edited[b.id]) || 0), 0)
  const overSplit = manual && manualTotal - amount > 0.005

  const reset = (id) => {
    setChosen(id)
    setTyped('')
    setManual(false)
    setEdited({})
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
        title="Collect Fee"
        description="One payment, across every bill the family owes"
        icon="₨"
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
            <SaveButton pending={pending} />
          </>
        }
      >
        <form id="payment-form" action={formAction} className="flex flex-col gap-4">
          <div>
            <label className="label" htmlFor="pay-student">
              Student *
            </label>
            <Combobox
              id="pay-student"
              name="student_id"
              required
              defaultValue={chosen}
              placeholder="Search name or admission no.…"
              options={students}
              onChangeValue={reset}
              emptyLabel="Nobody owes anything."
            />
          </div>

          {student && (
            <>
              {/* ------------------------------------------ where they stand */}
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl px-3 py-2" style={{ background: 'var(--surface-2)' }}>
                  <p className="text-[0.68rem] uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
                    Bills open
                  </p>
                  <p className="mt-0.5 text-base font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>
                    {bills.length}
                  </p>
                </div>
                <div className="rounded-xl px-3 py-2" style={{ background: 'var(--surface-2)' }}>
                  <p className="text-[0.68rem] uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
                    Outstanding
                  </p>
                  <p className="mt-0.5 text-base font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>
                    {money(owed)}
                  </p>
                </div>
                <div
                  className="rounded-xl px-3 py-2"
                  style={{ background: credit > 0 ? 'var(--green-soft)' : 'var(--surface-2)' }}
                >
                  <p className="text-[0.68rem] uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
                    On account
                  </p>
                  <p
                    className="mt-0.5 text-base font-semibold tabular-nums"
                    style={{ color: credit > 0 ? 'var(--green)' : 'var(--ink)' }}
                  >
                    {money(credit)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="pay-amount">
                    Amount received *
                  </label>
                  <input
                    id="pay-amount"
                    name="amount"
                    type="number"
                    min="1"
                    step="1"
                    value={typed === '' ? suggested || '' : typed}
                    onChange={(e) => setTyped(e.target.value)}
                    className="field"
                  />
                  <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                    Type more than is owed to hold the rest as advance.
                  </p>
                </div>
                <div>
                  <label className="label" htmlFor="pay-method">
                    Method
                  </label>
                  <Select id="pay-method" name="method" defaultValue="cash" options={FEE_METHODS} />
                </div>
              </div>

              {/* ------------------------------------------- the split */}
              {bills.length > 0 && (
                <div className="rounded-xl" style={{ border: '1px solid var(--line)' }}>
                  <div
                    className="flex items-center justify-between px-3 py-2"
                    style={{ borderBottom: '1px solid var(--line)' }}
                  >
                    <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
                      {manual ? 'Choose what this clears' : 'This payment clears'}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        // Opening the editor seeds it with the oldest-first
                        // split, so the cashier adjusts a real answer rather
                        // than filling in empty boxes.
                        if (!manual) {
                          const seed = {}
                          for (const r of preview.rows) seed[r.id] = String(Math.round(r.pay))
                          setEdited(seed)
                        }
                        setManual(!manual)
                      }}
                      className="text-xs font-semibold"
                      style={{ color: 'var(--brand)' }}
                    >
                      {manual ? 'Use oldest first' : 'Change'}
                    </button>
                  </div>

                  <ul className="flex flex-col">
                    {bills.map((b) => {
                      const row = preview.rows.find((r) => r.id === b.id)
                      const pay = manual ? Number(edited[b.id]) || 0 : row?.pay ?? 0

                      return (
                        <li
                          key={b.id}
                          className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                          style={{ borderTop: '1px solid var(--line-soft, var(--line))' }}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate" style={{ color: 'var(--ink)' }}>
                              {b.label}
                            </span>
                            <span className="text-xs" style={{ color: 'var(--muted)' }}>
                              {money(b.outstanding)} due{b.dueLabel ? ` · due ${b.dueLabel}` : ''}
                            </span>
                          </span>

                          {manual ? (
                            <input
                              type="number"
                              min="0"
                              max={Math.round(b.outstanding)}
                              step="1"
                              value={edited[b.id] ?? ''}
                              onChange={(e) => setEdited({ ...edited, [b.id]: e.target.value })}
                              className="field !w-28 !py-1 text-right tabular-nums"
                              aria-label={`Amount against ${b.label}`}
                            />
                          ) : (
                            <span
                              className="tabular-nums"
                              style={{ color: pay > 0 ? 'var(--green)' : 'var(--muted)' }}
                            >
                              {pay > 0 ? money(pay) : '—'}
                            </span>
                          )}

                          {/* Posted either way: in oldest-first mode too, so
                              the saved allocation is exactly the split the
                              cashier was shown. */}
                          {pay > 0 && (
                            <>
                              <input type="hidden" name="split_challan" value={b.id} />
                              <input type="hidden" name="split_amount" value={Math.round(pay)} />
                            </>
                          )}
                        </li>
                      )
                    })}
                  </ul>

                  <div
                    className="flex items-center justify-between px-3 py-2 text-sm"
                    style={{ borderTop: '1px solid var(--line)' }}
                  >
                    <span style={{ color: 'var(--muted)' }}>
                      {manual ? 'Allocated' : 'Held as advance'}
                    </span>
                    <span className="font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>
                      {manual ? money(manualTotal) : money(preview.credit)}
                    </span>
                  </div>
                </div>
              )}

              {bills.length === 0 && (
                <p
                  className="rounded-lg px-3 py-2 text-sm"
                  style={{ background: 'var(--surface-2)', color: 'var(--muted)' }}
                >
                  Nothing is outstanding. Anything received now is held as advance and settles the
                  next challan automatically.
                </p>
              )}

              {overSplit && (
                <p
                  className="rounded-lg px-3 py-2 text-sm"
                  style={{ background: 'var(--red-soft)', color: 'var(--red)' }}
                >
                  You have split {money(manualTotal)} of a {money(amount)} payment. Reduce the split
                  or raise the amount received.
                </p>
              )}

              {!manual && preview.credit > 0 && bills.length > 0 && (
                <p className="text-xs" style={{ color: 'var(--muted)' }}>
                  {money(preview.credit)} stays on the account and comes off the next challan on its
                  own.
                </p>
              )}
            </>
          )}

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
