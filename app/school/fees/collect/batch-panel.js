'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Spinner } from '@/components/spinner'
import SidePanel from '@/components/side-panel'
import { useCloseOnSuccess } from '@/components/use-close-on-success'
import Combobox, { Select } from '@/components/combobox'
import { FEE_TYPES, MONTHS, monthKey } from '@/lib/fee-options'
import { applyLateFees, generateClassChallans, generateMonthlyBatch } from '../actions'

function SubmitButton({ form, label }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" form={form} disabled={pending} className="btn btn-primary">
      {pending ? (
        <>
          <Spinner /> Working…
        </>
      ) : (
        label
      )}
    </button>
  )
}

// Three ways to raise challans in bulk, behind one button.
//
// Monthly Batch reads each class's fee policy and is the one a school uses
// every month. Per-class is the exception — a class whose policy has not been
// set up yet, or a one-off charge. Late fees is neither, but it belongs to the
// same "do a thing to many challans at once" job.
export default function BatchPanel({ classes, defaultYear, defaultMonth, trigger }) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState('monthly')

  const [monthly, monthlyAction] = useActionState(generateMonthlyBatch, {})
  const [perClass, perClassAction] = useActionState(generateClassChallans, {})
  const [late, lateAction] = useActionState(applyLateFees, {})

  const state = mode === 'monthly' ? monthly : mode === 'class' ? perClass : late
  useCloseOnSuccess(state, () => setOpen(false))

  const [year, setYear] = useState(defaultYear)
  const [month, setMonth] = useState(defaultMonth)

  // A due date a fortnight out is the usual house style, and it is the field
  // nobody wants to type twelve times a year.
  const defaultDue = `${year}-${String(month).padStart(2, '0')}-${String(
    new Date(year, month, 0).getDate()
  ).padStart(2, '0')}`

  const MODES = [
    { id: 'monthly', label: 'Monthly Batch', hint: 'Auto from policy' },
    { id: 'class', label: 'Entire Class', hint: 'Bulk by class' },
    { id: 'late', label: 'Late Fees', hint: 'Apply overdue fines' },
  ]

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={trigger.className}>
        {trigger.label}
      </button>

      <SidePanel
        open={open}
        onClose={() => setOpen(false)}
        title="Generate Challans"
        description="Raise bills for a month, a class, or apply late fees"
        icon="▦"
        footer={
          <>
            <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost">
              Cancel
            </button>
            <SubmitButton
              form={
                mode === 'monthly'
                  ? 'batch-monthly-form'
                  : mode === 'class'
                    ? 'batch-class-form'
                    : 'batch-late-form'
              }
              label={
                mode === 'monthly'
                  ? 'Generate for month'
                  : mode === 'class'
                    ? 'Generate for class'
                    : 'Apply late fees'
              }
            />
          </>
        }
      >
        <div className="mb-4 grid grid-cols-3 gap-2">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              className="flex flex-col items-start gap-0.5 rounded-lg px-3 py-2.5 text-left transition"
              style={{
                background: mode === m.id ? 'var(--brand-soft)' : 'var(--card)',
                border: `1px solid ${mode === m.id ? 'var(--brand)' : 'var(--border)'}`,
                color: mode === m.id ? 'var(--brand-ink)' : 'var(--ink-2)',
              }}
            >
              <span className="text-xs font-semibold">{m.label}</span>
              <span className="text-[0.65rem]" style={{ color: 'var(--muted)' }}>
                {m.hint}
              </span>
            </button>
          ))}
        </div>

        {/* ------------------------------------------------ monthly batch */}
        {mode === 'monthly' && (
          <form id="batch-monthly-form" action={monthlyAction} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="batch-month">
                  Month *
                </label>
                <select
                  id="batch-month"
                  name="month"
                  value={month}
                  onChange={(e) => setMonth(Number(e.target.value))}
                  className="field"
                >
                  {MONTHS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="batch-year">
                  Year *
                </label>
                <input
                  id="batch-year"
                  name="year"
                  type="number"
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  className="field"
                />
              </div>
            </div>

            <div>
              <label className="label" htmlFor="batch-due">
                Due date *
              </label>
              <input
                id="batch-due"
                name="due_date"
                type="date"
                required
                key={defaultDue}
                defaultValue={defaultDue}
                className="field"
              />
            </div>

            <div
              className="rounded-xl px-4 py-3 text-xs"
              style={{ background: 'var(--card-alt)', border: '1px solid var(--border-soft)' }}
            >
              <p className="font-semibold" style={{ color: 'var(--ink-2)' }}>
                What this does
              </p>
              <p className="mt-1" style={{ color: 'var(--muted)' }}>
                Every active student is billed from their class&rsquo;s active fee policy, for the
                components that policy charges in {MONTHS.find((m) => m.id === month)?.label}. A
                student with their own monthly fee on file is billed that figure instead of the
                policy&rsquo;s, so discounts are kept. Students already billed for this month are
                skipped.
              </p>
            </div>

            {monthly?.error && (
              <p
                className="rounded-lg px-3 py-2 text-sm"
                style={{ background: 'var(--red-soft)', color: 'var(--red)' }}
              >
                {monthly.error}
              </p>
            )}
          </form>
        )}

        {/* --------------------------------------------------- per class */}
        {mode === 'class' && (
          <form id="batch-class-form" action={perClassAction} className="flex flex-col gap-4">
            <input type="hidden" name="period_month" value={monthKey(year, month)} />

            <div>
              <label className="label" htmlFor="batch-class">
                Class *
              </label>
              <Combobox
                id="batch-class"
                name="class_id"
                required
                placeholder="Select class…"
                options={classes}
                emptyLabel="No classes yet."
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="batch-type">
                  Fee type *
                </label>
                <Select id="batch-type" name="fee_type" defaultValue="monthly" options={FEE_TYPES} />
              </div>
              <div>
                <label className="label" htmlFor="batch-amount">
                  Fallback amount
                </label>
                <input
                  id="batch-amount"
                  name="amount"
                  type="number"
                  min="0"
                  placeholder="Rs 0"
                  className="field"
                />
                <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                  Used only for students with no fee on file.
                </p>
              </div>
            </div>

            <div>
              <label className="label" htmlFor="batch-class-due">
                Due date *
              </label>
              <input
                id="batch-class-due"
                name="due_date"
                type="date"
                required
                key={`c-${defaultDue}`}
                defaultValue={defaultDue}
                className="field"
              />
            </div>

            <div>
              <label className="label" htmlFor="batch-desc">
                Description
              </label>
              <input
                id="batch-desc"
                name="description"
                placeholder="Printed on the challan"
                className="field"
              />
            </div>

            {perClass?.error && (
              <p
                className="rounded-lg px-3 py-2 text-sm"
                style={{ background: 'var(--red-soft)', color: 'var(--red)' }}
              >
                {perClass.error}
              </p>
            )}
          </form>
        )}

        {/* --------------------------------------------------- late fees */}
        {mode === 'late' && (
          <form id="batch-late-form" action={lateAction} className="flex flex-col gap-4">
            <div>
              <label className="label" htmlFor="late-period">
                Apply to
              </label>
              <select id="late-period" name="period_month" className="field">
                <option value="">Every overdue challan</option>
                <option value={monthKey(year, month)}>
                  {MONTHS.find((m) => m.id === month)?.label} {year} only
                </option>
              </select>
            </div>

            <div
              className="rounded-xl px-4 py-3 text-xs"
              style={{ background: 'var(--card-alt)', border: '1px solid var(--border-soft)' }}
            >
              <p className="font-semibold" style={{ color: 'var(--ink-2)' }}>
                What this does
              </p>
              <p className="mt-1" style={{ color: 'var(--muted)' }}>
                The fine is recomputed from each challan&rsquo;s due date using the grace period and
                per-day rate set under Settings → Fee &amp; Finance, so running it twice in one day
                does not charge twice. Challans still inside the grace period are untouched.
              </p>
            </div>

            {late?.error && (
              <p
                className="rounded-lg px-3 py-2 text-sm"
                style={{ background: 'var(--red-soft)', color: 'var(--red)' }}
              >
                {late.error}
              </p>
            )}
          </form>
        )}
      </SidePanel>
    </>
  )
}
