'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Spinner } from '@/components/spinner'
import SidePanel from '@/components/side-panel'
import { useCloseOnSuccess } from '@/components/use-close-on-success'
import { Select } from '@/components/combobox'
import { PAYMENT_MODES } from '@/lib/staff-options'
import { money } from '@/lib/payroll-options'
import { saveStaffSalary } from '../actions'

function SaveButton({ editing }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" form="salary-form" disabled={pending} className="btn btn-primary">
      {pending ? (
        <>
          <Spinner /> Saving…
        </>
      ) : editing ? (
        'Save changes'
      ) : (
        'Assign package'
      )}
    </button>
  )
}

const FIELDS = [
  { name: 'basic_salary', label: 'Basic Salary', required: true },
  { name: 'house_allowance', label: 'House Allowance' },
  { name: 'medical_allowance', label: 'Medical Allowance' },
  { name: 'conveyance_allowance', label: 'Conveyance Allowance' },
  { name: 'special_allowance', label: 'Special Allowance' },
  { name: 'other_allowances', label: 'Other Allowances' },
]

function Toggle({ name, label, hint, defaultChecked }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="mt-0.5 size-4 shrink-0 cursor-pointer rounded"
        style={{ accentColor: 'var(--brand)' }}
      />
      <span className="min-w-0">
        <span className="block text-sm" style={{ color: 'var(--ink-2)' }}>
          {label}
        </span>
        {hint && (
          <span className="block text-xs" style={{ color: 'var(--muted)' }}>
            {hint}
          </span>
        )}
      </span>
    </label>
  )
}

// One employee's actual package.
//
// Picking a template PRE-FILLS the fields and nothing more: the amounts are
// then this person's own, so a raise here does not reach anyone else on the
// same grade.
export default function SalaryPanel({ staffId, staffLabel, row, structures, trigger }) {
  const [open, setOpen] = useState(false)
  const [state, formAction] = useActionState(saveStaffSalary, {})
  useCloseOnSuccess(state, () => setOpen(false))

  const [amounts, setAmounts] = useState(() =>
    Object.fromEntries(FIELDS.map((f) => [f.name, Number(row?.[f.name]) || 0]))
  )
  const [deductions, setDeductions] = useState(Number(row?.other_deductions) || 0)
  // Bumped when a template is applied, to re-key the inputs so their
  // defaultValue is read again.
  const [fillKey, setFillKey] = useState(0)
  const [filled, setFilled] = useState(null)

  const gross = FIELDS.reduce((sum, f) => sum + (Number(amounts[f.name]) || 0), 0)
  const net = Math.max(0, gross - deductions)

  function applyTemplate(id) {
    const s = structures.find((x) => String(x.id) === String(id))
    if (!s) return
    setAmounts({
      basic_salary: Number(s.basic_salary) || 0,
      house_allowance: Number(s.house_allowance) || 0,
      medical_allowance: Number(s.medical_allowance) || 0,
      conveyance_allowance: Number(s.conveyance_allowance) || 0,
      special_allowance: Number(s.special_allowance) || 0,
      other_allowances: 0,
    })
    setDeductions(Number(s.total_deductions) || 0)
    setFillKey((k) => k + 1)
    setFilled(s.label)
  }

  const editing = Boolean(row)

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={trigger.className}>
        {trigger.label}
      </button>

      <SidePanel
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Edit ${staffLabel}` : `Assign salary — ${staffLabel}`}
        description="What payroll actually pays this employee"
        icon="₨"
        footer={
          <>
            <span className="mr-auto text-sm" style={{ color: 'var(--muted)' }}>
              Net:{' '}
              <span className="font-semibold tabular-nums" style={{ color: 'var(--green)' }}>
                {money(net)}
              </span>
            </span>
            <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost">
              Cancel
            </button>
            <SaveButton editing={editing} />
          </>
        }
      >
        <form id="salary-form" action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="staff_id" value={staffId} />
          {editing && <input type="hidden" name="id" value={row.id} />}

          <div>
            <label className="label" htmlFor="sal-structure">
              Copy from template
            </label>
            <Select
              id="sal-structure"
              name="structure_id"
              defaultValue={row?.structure_id ?? ''}
              placeholder="— choose a pay grade —"
              options={structures.map((s) => ({ id: s.id, label: s.label }))}
              onChangeValue={applyTemplate}
              emptyLabel="No templates yet."
            />
            <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
              {filled
                ? `Filled from ${filled}. Edit any figure below — this employee's amounts are their own.`
                : 'Optional. The amounts are copied, not linked.'}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {FIELDS.map((f) => (
              <div key={f.name}>
                <label className="label" htmlFor={`sal-${f.name}`}>
                  {f.label} {f.required && '*'}
                </label>
                <input
                  id={`sal-${f.name}`}
                  name={f.name}
                  type="number"
                  min="0"
                  required={f.required}
                  key={`${f.name}-${fillKey}`}
                  defaultValue={amounts[f.name] || ''}
                  onChange={(e) =>
                    setAmounts((current) => ({ ...current, [f.name]: Number(e.target.value) || 0 }))
                  }
                  placeholder="Rs 0"
                  className="field"
                />
              </div>
            ))}
            <div>
              <label className="label" htmlFor="sal-other-deductions">
                Other Deductions
              </label>
              <input
                id="sal-other-deductions"
                name="other_deductions"
                type="number"
                min="0"
                key={`ded-${fillKey}`}
                defaultValue={deductions || ''}
                onChange={(e) => setDeductions(Number(e.target.value) || 0)}
                placeholder="Rs 0"
                className="field"
              />
            </div>
          </div>

          <div
            className="grid grid-cols-3 gap-2 rounded-xl px-4 py-3 text-center"
            style={{ background: 'var(--card-alt)', border: '1px solid var(--border-soft)' }}
          >
            <div>
              <p className="text-[0.65rem]" style={{ color: 'var(--muted)' }}>
                Gross
              </p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>
                {money(gross)}
              </p>
            </div>
            <div>
              <p className="text-[0.65rem]" style={{ color: 'var(--muted)' }}>
                Deductions
              </p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums" style={{ color: 'var(--red)' }}>
                - {money(deductions)}
              </p>
            </div>
            <div>
              <p className="text-[0.65rem]" style={{ color: 'var(--muted)' }}>
                Net
              </p>
              <p
                className="mt-0.5 text-sm font-semibold tabular-nums"
                style={{ color: 'var(--green)' }}
              >
                {money(net)}
              </p>
            </div>
          </div>

          <div
            className="rounded-xl p-3.5"
            style={{ background: 'var(--card-alt)', border: '1px solid var(--border-soft)' }}
          >
            <p
              className="mb-2.5 text-[0.68rem] font-bold uppercase tracking-wider"
              style={{ color: 'var(--brand-ink)' }}
            >
              Statutory Deductions
            </p>
            <div className="flex flex-col gap-2.5">
              <Toggle
                name="eobi_applicable"
                label="EOBI applicable"
                hint="Only deducted if EOBI is switched on in Payroll Settings"
                defaultChecked={row?.eobi_applicable ?? false}
              />
              <Toggle
                name="pf_applicable"
                label="Provident fund applicable"
                hint="A percentage of basic, set in Payroll Settings"
                defaultChecked={row?.pf_applicable ?? false}
              />
              <div>
                <label className="label" htmlFor="sal-tax">
                  Annual tax liability
                </label>
                <input
                  id="sal-tax"
                  name="tax_annual"
                  type="number"
                  min="0"
                  defaultValue={row?.tax_annual ?? ''}
                  placeholder="Rs 0"
                  className="field"
                />
                <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                  A twelfth is deducted each month when tax withholding is on.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="sal-mode">
                Payment mode
              </label>
              <Select
                id="sal-mode"
                name="payment_mode"
                defaultValue={row?.payment_mode ?? 'bank_transfer'}
                options={PAYMENT_MODES}
              />
            </div>
            <div>
              <label className="label" htmlFor="sal-effective">
                Effective from
              </label>
              <input
                id="sal-effective"
                name="effective_from"
                type="date"
                defaultValue={row?.effective_from ?? ''}
                className="field"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="sal-bank">
                Bank name
              </label>
              <input
                id="sal-bank"
                name="bank_name"
                defaultValue={row?.bank_name ?? ''}
                className="field"
              />
            </div>
            <div>
              <label className="label" htmlFor="sal-account">
                Account number
              </label>
              <input
                id="sal-account"
                name="account_no"
                defaultValue={row?.account_no ?? ''}
                className="field"
              />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="sal-notes">
              Notes
            </label>
            <textarea
              id="sal-notes"
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
