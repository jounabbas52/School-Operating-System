'use client'

import { useActionState, useState } from 'react'
import { Spinner } from '@/components/spinner'
import SidePanel from '@/components/side-panel'
import { useCloseOnSuccess } from '@/components/use-close-on-success'
import { Select } from '@/components/combobox'
import { money } from '@/lib/payroll-options'
import { saveStructure } from './actions'

function SaveButton({ editing, pending }) {
  return (
    <button type="submit" form="structure-form" disabled={pending} className="btn btn-primary">
      {pending ? (
        <>
          <Spinner /> Saving…
        </>
      ) : editing ? (
        'Save changes'
      ) : (
        'Create Structure'
      )}
    </button>
  )
}

const ALLOWANCES = [
  { name: 'basic_salary', label: 'Basic Salary' },
  { name: 'house_allowance', label: 'House Allowance' },
  { name: 'medical_allowance', label: 'Medical Allowance' },
  { name: 'conveyance_allowance', label: 'Conveyance Allowance' },
  { name: 'special_allowance', label: 'Special Allowance' },
]

export default function StructurePanel({ row, trigger }) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState(saveStructure, {})
  useCloseOnSuccess(state, () => setOpen(false))

  // A live gross/net footer, because the whole point of the form is the
  // number at the bottom and adding five fields in your head is how a grade
  // gets set wrong.
  const [amounts, setAmounts] = useState(() => ({
    basic_salary: Number(row?.basic_salary) || 0,
    house_allowance: Number(row?.house_allowance) || 0,
    medical_allowance: Number(row?.medical_allowance) || 0,
    conveyance_allowance: Number(row?.conveyance_allowance) || 0,
    special_allowance: Number(row?.special_allowance) || 0,
    total_deductions: Number(row?.total_deductions) || 0,
  }))

  const set = (name, value) =>
    setAmounts((current) => ({ ...current, [name]: Number(value) || 0 }))

  const gross = ALLOWANCES.reduce((sum, a) => sum + (amounts[a.name] || 0), 0)
  const net = Math.max(0, gross - amounts.total_deductions)

  const editing = Boolean(row)

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={trigger.className}>
        {trigger.label}
      </button>

      <SidePanel
        open={open}
        busy={pending}
        onClose={() => setOpen(false)}
        title={editing ? `Edit ${row.name}` : 'New Salary Structure'}
        description="Define allowances & deductions for a designation"
        icon="₨"
        footer={
          <>
            <button type="button" onClick={() => setOpen(false)} disabled={pending} className="btn btn-ghost">
              Cancel
            </button>
            <SaveButton pending={pending} editing={editing} />
          </>
        }
      >
        <form id="structure-form" action={formAction} className="flex flex-col gap-4">
          {editing && <input type="hidden" name="id" value={row.id} />}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="st-name">
                Designation *
              </label>
              <input
                id="st-name"
                name="name"
                required
                defaultValue={row?.name ?? ''}
                placeholder="e.g. Senior Teacher"
                className="field"
              />
            </div>
            <div>
              <label className="label" htmlFor="st-grade">
                Grade / Scale
              </label>
              <input
                id="st-grade"
                name="grade"
                defaultValue={row?.grade ?? ''}
                placeholder="e.g. BPS-17"
                className="field"
              />
            </div>
          </div>

          <div>
            <p
              className="mb-2 text-[0.68rem] font-bold uppercase tracking-wider"
              style={{ color: 'var(--brand-ink)' }}
            >
              Allowances
            </p>
            <div className="grid grid-cols-2 gap-3">
              {ALLOWANCES.map((a) => (
                <div key={a.name}>
                  <label className="label" htmlFor={`st-${a.name}`}>
                    {a.label}
                  </label>
                  <input
                    id={`st-${a.name}`}
                    name={a.name}
                    type="number"
                    min="0"
                    defaultValue={row?.[a.name] ?? ''}
                    onChange={(e) => set(a.name, e.target.value)}
                    placeholder="Rs 0"
                    className="field"
                  />
                </div>
              ))}
              <div>
                <label className="label" htmlFor="st-deductions">
                  Deductions
                </label>
                <input
                  id="st-deductions"
                  name="total_deductions"
                  type="number"
                  min="0"
                  defaultValue={row?.total_deductions ?? ''}
                  onChange={(e) => set('total_deductions', e.target.value)}
                  placeholder="Rs 0"
                  className="field"
                />
              </div>
            </div>
          </div>

          <div
            className="grid grid-cols-3 gap-2 rounded-xl px-4 py-3 text-center"
            style={{ background: 'var(--card-alt)', border: '1px solid var(--border-soft)' }}
          >
            <div>
              <p className="text-[0.65rem]" style={{ color: 'var(--muted)' }}>
                Gross Salary
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
                - {money(amounts.total_deductions)}
              </p>
            </div>
            <div>
              <p className="text-[0.65rem]" style={{ color: 'var(--muted)' }}>
                Net Salary
              </p>
              <p
                className="mt-0.5 text-sm font-semibold tabular-nums"
                style={{ color: 'var(--green)' }}
              >
                {money(net)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="st-status">
                Status
              </label>
              <Select
                id="st-status"
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
            <label className="label" htmlFor="st-description">
              Description
            </label>
            <textarea
              id="st-description"
              name="description"
              rows={2}
              defaultValue={row?.description ?? ''}
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
