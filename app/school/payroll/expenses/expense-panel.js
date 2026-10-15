'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Spinner } from '@/components/spinner'
import SidePanel from '@/components/side-panel'
import { useCloseOnSuccess } from '@/components/use-close-on-success'
import { Select } from '@/components/combobox'
import { PAYMENT_MODES } from '@/lib/staff-options'
import { EXPENSE_CATEGORIES } from '@/lib/payroll-options'
import { saveExpense } from '../actions'

function SaveButton({ editing }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" form="expense-form" disabled={pending} className="btn btn-primary">
      {pending ? (
        <>
          <Spinner /> Saving…
        </>
      ) : editing ? (
        'Save changes'
      ) : (
        'Record Expense'
      )}
    </button>
  )
}

export default function ExpensePanel({ row, trigger }) {
  const [open, setOpen] = useState(false)
  const [state, formAction] = useActionState(saveExpense, {})
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
        title={editing ? `Edit ${row.title}` : 'New Expense'}
        description={
          editing ? 'Voucher details' : 'Recorded as Pending until it is approved'
        }
        icon="▤"
        footer={
          <>
            <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost">
              Cancel
            </button>
            <SaveButton editing={editing} />
          </>
        }
      >
        <form id="expense-form" action={formAction} className="flex flex-col gap-4">
          {editing && <input type="hidden" name="id" value={row.id} />}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="exp-title">
                Title *
              </label>
              <input
                id="exp-title"
                name="title"
                required
                defaultValue={row?.title ?? ''}
                placeholder="e.g. Electricity bill — August"
                className="field"
              />
            </div>
            <div>
              <label className="label" htmlFor="exp-category">
                Category
              </label>
              <Select
                id="exp-category"
                name="category"
                defaultValue={row?.category ?? 'utility'}
                options={EXPENSE_CATEGORIES}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="exp-amount">
                Amount *
              </label>
              <input
                id="exp-amount"
                name="amount"
                type="number"
                min="1"
                required
                defaultValue={row?.amount ?? ''}
                placeholder="Rs 0"
                className="field"
              />
            </div>
            <div>
              <label className="label" htmlFor="exp-date">
                Expense date
              </label>
              <input
                id="exp-date"
                name="expense_date"
                type="date"
                defaultValue={row?.expense_date ?? new Date().toISOString().slice(0, 10)}
                className="field"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="exp-vendor">
                Vendor / supplier
              </label>
              <input
                id="exp-vendor"
                name="vendor"
                defaultValue={row?.vendor ?? ''}
                placeholder="e.g. K-Electric"
                className="field"
              />
            </div>
            <div>
              <label className="label" htmlFor="exp-paid-to">
                Paid to
              </label>
              <input
                id="exp-paid-to"
                name="paid_to"
                defaultValue={row?.paid_to ?? ''}
                placeholder="e.g. Accounts Officer"
                className="field"
              />
              <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                Person who actually received or handled the money
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="exp-bill">
                Bill / invoice no.
              </label>
              <input
                id="exp-bill"
                name="bill_no"
                defaultValue={row?.bill_no ?? ''}
                placeholder="e.g. INV-88213"
                className="field"
              />
              <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                Keep the physical bill against this number
              </p>
            </div>
            <div>
              <label className="label" htmlFor="exp-mode">
                Payment mode
              </label>
              <Select
                id="exp-mode"
                name="payment_method"
                defaultValue={row?.payment_method ?? 'cash'}
                options={PAYMENT_MODES}
              />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="exp-description">
              Description
            </label>
            <textarea
              id="exp-description"
              name="description"
              rows={3}
              defaultValue={row?.description ?? ''}
              placeholder="Any detail worth keeping on the record"
              className="field resize-none"
            />
          </div>

          {!editing && (
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              A voucher number is issued automatically. The expense starts as Pending and has to be
              approved before it can be marked paid.
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
