'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import SidePanel from '@/components/side-panel'
import { Select } from '@/components/combobox'
import { Spinner } from '@/components/spinner'
import { useCloseOnSuccess } from '@/components/use-close-on-success'
import {
  EMPLOYMENT_TYPES,
  PAYMENT_MODES,
  STAFF_STATUS_OPTIONS,
  STAFF_TYPES,
  staffName,
} from '@/lib/staff-options'
import { saveStaff } from './actions'

function SaveButton({ editing }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" form="staff-form" disabled={pending} className="btn btn-primary">
      {pending ? (
        <>
          <Spinner /> Saving…
        </>
      ) : editing ? (
        'Save changes'
      ) : (
        'Add staff'
      )}
    </button>
  )
}

function Field({ label, children, required, hint, span = 1 }) {
  return (
    <div style={{ gridColumn: `span ${span} / span ${span}` }}>
      <span className="label">
        {label}
        {required && <span style={{ color: 'var(--red)' }}> *</span>}
      </span>
      {children}
      {hint && (
        <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
          {hint}
        </p>
      )}
    </div>
  )
}

function SectionHead({ children, tone = 'var(--brand-ink)' }) {
  return (
    <p
      className="mb-3 mt-1 text-[0.68rem] font-bold uppercase tracking-wider"
      style={{ color: tone }}
    >
      {children}
    </p>
  )
}

export default function StaffPanel({ row, nextStaffNumber, defaultType = 'teaching', trigger }) {
  const [open, setOpen] = useState(false)
  const [state, formAction] = useActionState(saveStaff, {})
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
        width="max-w-2xl"
        title={editing ? `Edit ${staffName(row)}` : 'Add new staff member'}
        description="Fill in the details below"
        footer={
          <>
            <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost">
              Cancel
            </button>
            <SaveButton editing={editing} />
          </>
        }
      >
        <form id="staff-form" action={formAction} className="flex flex-col gap-6">
          {editing && <input type="hidden" name="id" value={row.id} />}

          {/* ------------------------------------------------ the employee */}
          <section>
            <SectionHead>Employee</SectionHead>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Full name" required>
                <input
                  name="full_name"
                  required
                  defaultValue={editing ? staffName(row) : ''}
                  placeholder="Full name"
                  className="field"
                />
              </Field>

              <Field label="Designation" required>
                <input
                  name="designation"
                  required
                  defaultValue={row?.designation ?? ''}
                  placeholder="Senior Teacher, Accountant…"
                  className="field"
                />
              </Field>

              <Field label="Staff ID" hint="Prefilled with the next free number.">
                <input
                  name="staff_number"
                  defaultValue={row?.staff_number ?? nextStaffNumber}
                  placeholder="TCH-001"
                  className="field"
                />
              </Field>

              <Field label="Staff type" hint="Drives the tabs on this screen.">
                <Select
                  name="staff_type"
                  defaultValue={row?.staff_type ?? defaultType}
                  options={STAFF_TYPES}
                />
              </Field>

              <Field label="Department">
                <input
                  name="department"
                  defaultValue={row?.department ?? ''}
                  placeholder="Science, Primary, Accounts…"
                  className="field"
                />
              </Field>

              <Field label="Status">
                <Select
                  name="status"
                  defaultValue={row?.status ?? 'active'}
                  options={STAFF_STATUS_OPTIONS}
                />
              </Field>

              <Field label="Phone">
                <input
                  name="phone"
                  defaultValue={row?.phone ?? ''}
                  placeholder="03xx-xxxxxxx"
                  className="field"
                />
              </Field>

              <Field label="Email">
                <input
                  name="work_email"
                  type="email"
                  defaultValue={row?.work_email ?? ''}
                  placeholder="name@school.edu"
                  className="field"
                />
              </Field>

              <Field label="Joining date">
                <input
                  name="hire_date"
                  type="date"
                  defaultValue={row?.hire_date ?? new Date().toISOString().slice(0, 10)}
                  className="field"
                />
              </Field>

              <Field
                label="Salary (Rs.)"
                hint="Reference figure only. Payroll pays the package set on the designation."
              >
                <input
                  name="monthly_salary"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={row?.monthly_salary ?? ''}
                  placeholder="e.g. 45000"
                  className="field"
                />
              </Field>

              <Field label="Employment type">
                <Select
                  name="employment_type"
                  defaultValue={row?.employment_type ?? 'permanent'}
                  options={EMPLOYMENT_TYPES}
                />
              </Field>

              <Field label="CNIC">
                <input
                  name="cnic"
                  defaultValue={row?.cnic ?? ''}
                  placeholder="00000-0000000-0"
                  className="field"
                />
              </Field>

              <Field label="Address" span={2}>
                <input
                  name="address"
                  defaultValue={row?.address ?? ''}
                  placeholder="Street, City, State, ZIP"
                  className="field"
                />
              </Field>
            </div>
          </section>

          {/* ------------------------------------------------ how they're paid */}
          <section>
            <SectionHead tone="var(--blue-ink)">Salary payment details</SectionHead>
            <p className="-mt-2 mb-3 text-xs" style={{ color: 'var(--muted)' }}>
              Used to build the monthly bank transfer sheet.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {/* Rendered whatever the mode. Hiding them on 'cash' would drop
                  the inputs from the form, and the action would then read them
                  as blank and wipe an account someone had already entered. */}
              <Field label="Payment mode">
                <Select
                  name="payment_mode"
                  defaultValue={row?.payment_mode ?? 'bank_transfer'}
                  options={PAYMENT_MODES}
                />
              </Field>

              <Field label="Bank name">
                <input
                  name="bank_name"
                  defaultValue={row?.bank_name ?? ''}
                  placeholder="e.g. Meezan Bank"
                  className="field"
                />
              </Field>

              <Field label="Account title">
                <input
                  name="account_title"
                  defaultValue={row?.account_title ?? ''}
                  placeholder="Name exactly as on the account"
                  className="field"
                />
              </Field>

              <Field label="Account no / IBAN">
                <input
                  name="account_number"
                  defaultValue={row?.account_number ?? ''}
                  placeholder="PK00XXXX0000000000000000"
                  className="field font-mono"
                />
              </Field>
            </div>
          </section>

          {state?.error && (
            <p
              className="rounded-lg px-3 py-2 text-sm"
              style={{ background: 'var(--red-soft)', color: 'var(--red-ink)' }}
            >
              {state.error}
            </p>
          )}
        </form>
      </SidePanel>
    </>
  )
}
