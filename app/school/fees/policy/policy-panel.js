'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Spinner } from '@/components/spinner'
import SidePanel from '@/components/side-panel'
import { useCloseOnSuccess } from '@/components/use-close-on-success'
import Combobox, { Select } from '@/components/combobox'
import { ALL_MONTHS, MONTHS, POLICY_COMPONENTS, money } from '@/lib/fee-options'
import { savePolicy } from '../actions'

function SaveButton({ editing }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" form="policy-form" disabled={pending} className="btn btn-primary">
      {pending ? (
        <>
          <Spinner /> Saving…
        </>
      ) : editing ? (
        'Save changes'
      ) : (
        '✓ Create Policy'
      )}
    </button>
  )
}

// One fee component: an amount, and the months it is charged in.
//
// The months are checkboxes rendered as chips, so the whole year is visible at
// once and "March and September" takes two clicks rather than a multi-select.
function Component({ component, policy, onAmountChange }) {
  const [months, setMonths] = useState(() => {
    if (policy) return new Set(policy[component.months] ?? [])
    // Tuition is monthly almost everywhere; the rest are occasional, and
    // pre-ticking twelve months for an admission fee invites an expensive
    // mistake.
    return new Set(component.key === 'tuition' ? ALL_MONTHS : [])
  })

  function toggle(id) {
    setMonths((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allOn = months.size === 12

  return (
    <div
      className="rounded-xl p-3.5"
      style={{ background: 'var(--card-alt)', border: '1px solid var(--border-soft)' }}
    >
      <label className="label" htmlFor={`pol-${component.key}`}>
        {component.label} {component.required && '*'}
      </label>
      <input
        id={`pol-${component.key}`}
        name={component.amount}
        type="number"
        min="0"
        required={component.required}
        defaultValue={policy?.[component.amount] ?? ''}
        onChange={(e) => onAmountChange?.(component.key, e.target.value)}
        placeholder="Rs 0"
        className="field"
      />

      <div className="mt-2.5 flex items-center justify-between">
        <span
          className="text-[0.62rem] font-bold uppercase tracking-wider"
          style={{ color: 'var(--muted)' }}
        >
          Applies in
        </span>
        <button
          type="button"
          onClick={() => setMonths(allOn ? new Set() : new Set(ALL_MONTHS))}
          className="text-[0.65rem] font-medium"
          style={{ color: 'var(--brand-ink)' }}
        >
          {allOn ? 'Clear all' : 'Select all'}
        </button>
      </div>

      <div className="mt-1.5 flex flex-wrap gap-1">
        {MONTHS.map((m) => {
          const on = months.has(m.id)
          return (
            <label
              key={m.id}
              className="cursor-pointer rounded px-1.5 py-1 text-[0.62rem] font-semibold transition"
              style={{
                background: on ? 'var(--brand)' : 'var(--card)',
                color: on ? '#fff' : 'var(--muted)',
                border: `1px solid ${on ? 'var(--brand)' : 'var(--border)'}`,
              }}
              title={m.label}
            >
              <input
                type="checkbox"
                name={component.months}
                value={m.id}
                checked={on}
                onChange={() => toggle(m.id)}
                className="sr-only"
              />
              {m.short}
            </label>
          )
        })}
      </div>
    </div>
  )
}

export default function PolicyPanel({ row, classes, sessions, trigger }) {
  const [open, setOpen] = useState(false)
  const [state, formAction] = useActionState(savePolicy, {})
  useCloseOnSuccess(state, () => setOpen(false))

  // A running total so a clerk can see what a full month costs without adding
  // five fields up in their head.
  const [amounts, setAmounts] = useState(() =>
    Object.fromEntries(POLICY_COMPONENTS.map((c) => [c.key, Number(row?.[c.amount]) || 0]))
  )

  const editing = Boolean(row)
  const currentSession = sessions.find((s) => s.is_current)?.id
  const total = Object.values(amounts).reduce((sum, n) => sum + (Number(n) || 0), 0)

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={trigger.className}>
        {trigger.label}
      </button>

      <SidePanel
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Edit ${row.name}` : 'Add Fee Policy'}
        description="Define a new fee structure for a class"
        icon="▧"
        width="max-w-2xl"
        footer={
          <>
            <span className="mr-auto text-sm" style={{ color: 'var(--muted)' }}>
              Full month total:{' '}
              <span className="font-semibold tabular-nums" style={{ color: 'var(--brand-ink)' }}>
                {money(total)}
              </span>
            </span>
            <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost">
              Cancel
            </button>
            <SaveButton editing={editing} />
          </>
        }
      >
        <form id="policy-form" action={formAction} className="flex flex-col gap-4">
          {editing && <input type="hidden" name="id" value={row.id} />}

          <div>
            <label className="label" htmlFor="pol-name">
              Policy Name *
            </label>
            <input
              id="pol-name"
              name="name"
              required
              defaultValue={row?.name ?? ''}
              placeholder="e.g. Standard Class 5 Policy"
              className="field"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="pol-class">
                Class
              </label>
              <Combobox
                id="pol-class"
                name="class_id"
                defaultValue={row?.class_id ?? ''}
                placeholder="Search class…"
                options={classes}
                emptyLabel="No classes yet."
              />
              <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                Only one active policy per class.
              </p>
            </div>
            <div>
              <label className="label" htmlFor="pol-status">
                Status
              </label>
              <Select
                id="pol-status"
                name="status"
                defaultValue={row?.status ?? 'active'}
                options={[
                  { id: 'active', label: 'Active' },
                  { id: 'inactive', label: 'Inactive' },
                ]}
              />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="pol-session">
              Session
            </label>
            <Select
              id="pol-session"
              name="session_id"
              defaultValue={row?.session_id ?? currentSession ?? ''}
              placeholder="—"
              options={sessions}
              emptyLabel="No sessions yet."
            />
          </div>

          <div
            className="border-t pt-4"
            style={{ borderColor: 'var(--border)' }}
          >
            <p
              className="mb-3 text-[0.68rem] font-bold uppercase tracking-wider"
              style={{ color: 'var(--brand-ink)' }}
            >
              Fee Structure
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              {POLICY_COMPONENTS.map((c) => (
                <Component
                  key={c.key}
                  component={c}
                  policy={row}
                  onAmountChange={(key, value) =>
                    setAmounts((current) => ({ ...current, [key]: value }))
                  }
                />
              ))}
            </div>
          </div>

          <div>
            <label className="label" htmlFor="pol-notes">
              Notes
            </label>
            <textarea
              id="pol-notes"
              name="notes"
              rows={2}
              defaultValue={row?.notes ?? ''}
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
