'use client'

import { useActionState, useState } from 'react'
import { Spinner } from '@/components/spinner'
import { useToast } from '@/components/toast'
import { Select } from '@/components/combobox'
import { PAYMENT_MODES } from '@/lib/staff-options'
import { DEDUCT_FROM, WEEK_DAYS, WORKING_DAY_MODES } from '@/lib/payroll-options'
import { savePayrollSettings } from '../actions'

function SaveButton({ pending }) {
  return (
    <button type="submit" form="payroll-settings-form" disabled={pending} className="btn btn-primary">
      {pending ? (
        <>
          <Spinner /> Saving…
        </>
      ) : (
        'Save Settings'
      )}
    </button>
  )
}

function Toggle({ name, label, hint, defaultChecked, disabled }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        disabled={disabled}
        className="mt-0.5 size-4 shrink-0 cursor-pointer rounded"
        style={{ accentColor: 'var(--brand)' }}
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium" style={{ color: 'var(--ink-2)' }}>
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

function Card({ title, subtitle, children }) {
  return (
    <div className="card p-5">
      <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
        {title}
      </p>
      {subtitle && (
        <p className="mt-0.5 text-xs" style={{ color: 'var(--muted)' }}>
          {subtitle}
        </p>
      )}
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </div>
  )
}

export default function SettingsForm({ settings, canWrite }) {
  const [state, formAction, pending] = useActionState(savePayrollSettings, {})
  const { success } = useToast()
  const [seen, setSeen] = useState(null)

  if (state?.ok && state.at !== seen) {
    setSeen(state.at)
    queueMicrotask(() => success(state.ok))
  }

  const [mode, setMode] = useState(settings.working_days_mode ?? 'calendar')
  const [offs, setOffs] = useState(() => new Set(settings.weekly_offs ?? [7]))

  function toggleOff(id) {
    setOffs((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <form id="payroll-settings-form" action={formAction} className="flex flex-col gap-4">
      <div className="flex justify-end">{canWrite && <SaveButton pending={pending} />}</div>

      <fieldset disabled={!canWrite} className="contents">
        <div className="grid gap-4 lg:grid-cols-2">
          {/* ------------------------------------------------ working days */}
          <Card
            title="Working days"
            subtitle="The denominator for every per-day rate and absence deduction"
          >
            <div>
              <label className="label" htmlFor="ps-mode">
                How to count working days
              </label>
              <select
                id="ps-mode"
                name="working_days_mode"
                value={mode}
                onChange={(e) => setMode(e.target.value)}
                className="field"
              >
                {WORKING_DAY_MODES.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            {mode === 'fixed' ? (
              <div>
                <label className="label" htmlFor="ps-fixed">
                  Fixed working days
                </label>
                <input
                  id="ps-fixed"
                  name="fixed_working_days"
                  type="number"
                  min="1"
                  max="31"
                  defaultValue={settings.fixed_working_days ?? 26}
                  className="field"
                />
                <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                  The same denominator every month, whatever the calendar says.
                </p>
              </div>
            ) : (
              <div>
                <span className="label">Weekly off days</span>
                <div className="flex flex-wrap gap-1.5">
                  {WEEK_DAYS.map((d) => {
                    const on = offs.has(d.id)
                    return (
                      <label
                        key={d.id}
                        className="cursor-pointer rounded-lg px-2.5 py-1.5 text-xs font-semibold transition"
                        style={{
                          background: on ? 'var(--brand)' : 'var(--card)',
                          color: on ? '#fff' : 'var(--muted)',
                          border: `1px solid ${on ? 'var(--brand)' : 'var(--border)'}`,
                        }}
                      >
                        <input
                          type="checkbox"
                          name="weekly_offs"
                          value={d.id}
                          checked={on}
                          onChange={() => toggleOff(d.id)}
                          className="sr-only"
                        />
                        {d.short}
                      </label>
                    )
                  })}
                </div>
                <p className="mt-1.5 text-xs" style={{ color: 'var(--muted)' }}>
                  Days the school is closed every week. Holidays are excluded separately, below.
                </p>
              </div>
            )}
          </Card>

          {/* --------------------------------------------------- absences */}
          <Card title="Absence policy" subtitle="What an absence actually costs an employee">
            <Toggle
              name="deduct_absences"
              label="Deduct pay for absences"
              hint="Turn this off if the school never cuts salary for attendance."
              defaultChecked={settings.deduct_absences ?? true}
            />
            <div>
              <label className="label" htmlFor="ps-deduct-from">
                Deduct from
              </label>
              <Select
                id="ps-deduct-from"
                name="deduct_from"
                defaultValue={settings.deduct_from ?? 'gross'}
                options={DEDUCT_FROM}
              />
              <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                Gross is the common choice; deducting from basic only is more lenient.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="ps-half">
                  Half day costs
                </label>
                <input
                  id="ps-half"
                  name="half_day_fraction"
                  type="number"
                  min="0"
                  max="1"
                  step="0.1"
                  defaultValue={settings.half_day_fraction ?? 0.5}
                  className="field"
                />
                <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                  Fraction of a day
                </p>
              </div>
              <div>
                <label className="label" htmlFor="ps-late">
                  Late marks = 1 day
                </label>
                <input
                  id="ps-late"
                  name="late_marks_per_day"
                  type="number"
                  min="0"
                  defaultValue={settings.late_marks_per_day ?? 3}
                  className="field"
                />
                <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                  0 disables late deductions
                </p>
              </div>
            </div>

            <p
              className="rounded-lg px-3 py-2 text-xs"
              style={{ background: 'var(--card-alt)', color: 'var(--muted)' }}
            >
              Paid leave never costs anything. Whether a leave is paid is decided per day on the
              Staff Attendance screen.
            </p>
          </Card>

          {/* -------------------------------------------------- statutory */}
          <Card
            title="Statutory deductions"
            subtitle="Rates change with the budget — set what applies to this school, and only to staff you flag on Staff Salaries"
          >
            <Toggle
              name="eobi_enabled"
              label="EOBI"
              hint="Applied only to employees flagged EOBI-applicable"
              defaultChecked={settings.eobi_enabled ?? false}
            />
            <div>
              <label className="label" htmlFor="ps-eobi">
                EOBI amount per month
              </label>
              <input
                id="ps-eobi"
                name="eobi_amount"
                type="number"
                min="0"
                defaultValue={settings.eobi_amount ?? 0}
                placeholder="Rs 0"
                className="field"
              />
            </div>

            <Toggle
              name="pf_enabled"
              label="Provident fund"
              hint="Calculated as a percentage of basic salary"
              defaultChecked={settings.pf_enabled ?? false}
            />
            <div>
              <label className="label" htmlFor="ps-pf">
                Provident fund percent of basic
              </label>
              <input
                id="ps-pf"
                name="pf_percent"
                type="number"
                min="0"
                max="100"
                step="0.5"
                defaultValue={settings.pf_percent ?? 0}
                className="field"
              />
            </div>

            <Toggle
              name="tax_enabled"
              label="Income tax withholding"
              hint="Deducts a twelfth of the annual liability set on each employee's salary record"
              defaultChecked={settings.tax_enabled ?? false}
            />
          </Card>

          {/* ---------------------------------------------------- process */}
          <Card title="Process" subtitle="How the monthly run behaves">
            <div>
              <label className="label" htmlFor="ps-mode-default">
                Default payment mode
              </label>
              <Select
                id="ps-mode-default"
                name="default_payment_mode"
                defaultValue={settings.default_payment_mode ?? 'bank_transfer'}
                options={PAYMENT_MODES}
              />
            </div>

            <div>
              <label className="label" htmlFor="ps-cutoff">
                Attendance cut-off day
              </label>
              <input
                id="ps-cutoff"
                name="cutoff_day"
                type="number"
                min="1"
                max="31"
                defaultValue={settings.cutoff_day ?? 25}
                className="field"
              />
              <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                The day of the month payroll is normally prepared.
              </p>
            </div>

            <p
              className="rounded-lg px-3 py-2 text-xs"
              style={{ background: 'var(--card-alt)', color: 'var(--muted)' }}
            >
              Approval is always required before salaries can be paid. That step is what freezes the
              amounts and creates the audit trail.
            </p>
          </Card>
        </div>
      </fieldset>

      {state?.error && (
        <p
          className="rounded-lg px-3 py-2 text-sm"
          style={{ background: 'var(--red-soft)', color: 'var(--red)' }}
        >
          {state.error}
        </p>
      )}

      {!canWrite && (
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          Read-only — changing payroll settings needs the Payroll write permission.
        </p>
      )}
    </form>
  )
}
