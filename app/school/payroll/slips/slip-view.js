'use client'

import { money } from '@/lib/payroll-options'

// One payslip, printable.
//
// Every figure is read off the stored payroll item and nothing is recomputed:
// a slip reprinted in December has to show what December's slip showed, and a
// formula re-run against today's salary would not.
export default function SlipView({
  schoolName,
  period,
  item,
  employee,
  statusLabel,
  statusTone,
}) {
  const earnings = [
    ['Basic salary', item.basic_salary],
    ['Allowances', item.allowances],
  ].filter(([, v]) => Number(v) > 0)

  const deductions = [
    ['Absence / late', item.absence_amount],
    ['EOBI', item.eobi_amount],
    ['Provident fund', item.pf_amount],
    ['Income tax', item.tax_amount],
  ].filter(([, v]) => Number(v) > 0)

  // Anything the itemised lines do not account for -- a manual adjustment,
  // most often. Shown rather than silently dropped, so gross minus deductions
  // always equals net on the page.
  const itemised = deductions.reduce((sum, [, v]) => sum + (Number(v) || 0), 0)
  const other = (Number(item.deduction_amount) || 0) - itemised
  if (other > 0) deductions.push(['Other deductions', other])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-end gap-2 no-print">
        <button type="button" onClick={() => window.print()} className="btn btn-blue">
          Print / Save PDF
        </button>
      </div>

      <div className="card print-sheet overflow-hidden">
        {/* ------------------------------------------------------- header */}
        <div className="panel-head px-6 py-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-base font-semibold text-white">{schoolName}</p>
              <p className="text-xs text-white/75">Salary Slip · {period}</p>
            </div>
            <span className="rounded-full bg-white/15 px-2.5 py-1 text-[0.68rem] font-semibold text-white">
              {statusLabel}
            </span>
          </div>
        </div>

        {/* ----------------------------------------------------- employee */}
        <div
          className="grid gap-4 border-b px-6 py-4 sm:grid-cols-4"
          style={{ borderColor: 'var(--border)', background: 'var(--card-alt)' }}
        >
          {[
            ['Employee', employee.name],
            ['Staff ID', employee.number ?? '—'],
            ['Designation', employee.designation ?? '—'],
            ['Department', employee.department ?? '—'],
          ].map(([label, value]) => (
            <div key={label}>
              <p className="text-[0.65rem]" style={{ color: 'var(--muted)' }}>
                {label}
              </p>
              <p className="mt-0.5 text-sm font-medium" style={{ color: 'var(--ink)' }}>
                {value}
              </p>
            </div>
          ))}
        </div>

        {/* --------------------------------------------------- attendance */}
        <div
          className="grid gap-4 border-b px-6 py-4 sm:grid-cols-5"
          style={{ borderColor: 'var(--border)' }}
        >
          {[
            ['Working days', item.working_days ?? '—'],
            ['Present', item.present_days ?? '—'],
            ['Absent', item.absent_days ?? 0],
            ['Half days', item.half_days ?? 0],
            ['Late marks', item.late_marks ?? 0],
          ].map(([label, value]) => (
            <div key={label}>
              <p className="text-[0.65rem]" style={{ color: 'var(--muted)' }}>
                {label}
              </p>
              <p
                className="mt-0.5 text-sm font-semibold tabular-nums"
                style={{ color: 'var(--ink)' }}
              >
                {value}
              </p>
            </div>
          ))}
        </div>

        {/* ---------------------------------------- earnings & deductions */}
        <div className="grid gap-0 sm:grid-cols-2">
          <div className="p-6" style={{ borderRight: '1px solid var(--border)' }}>
            <p
              className="mb-3 text-[0.68rem] font-bold uppercase tracking-wider"
              style={{ color: 'var(--green)' }}
            >
              Earnings
            </p>
            <dl className="flex flex-col gap-2 text-sm">
              {earnings.map(([label, value]) => (
                <div key={label} className="flex items-baseline justify-between gap-3">
                  <dt style={{ color: 'var(--muted)' }}>{label}</dt>
                  <dd className="tabular-nums" style={{ color: 'var(--ink)' }}>
                    {money(value)}
                  </dd>
                </div>
              ))}
              <div
                className="mt-1 flex items-baseline justify-between gap-3 border-t pt-2"
                style={{ borderColor: 'var(--border)' }}
              >
                <dt className="font-semibold" style={{ color: 'var(--ink)' }}>
                  Gross
                </dt>
                <dd className="font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>
                  {money(item.gross_amount)}
                </dd>
              </div>
            </dl>
          </div>

          <div className="p-6">
            <p
              className="mb-3 text-[0.68rem] font-bold uppercase tracking-wider"
              style={{ color: 'var(--red)' }}
            >
              Deductions
            </p>
            {!deductions.length ? (
              <p className="text-sm" style={{ color: 'var(--muted)' }}>
                None this month.
              </p>
            ) : (
              <dl className="flex flex-col gap-2 text-sm">
                {deductions.map(([label, value]) => (
                  <div key={label} className="flex items-baseline justify-between gap-3">
                    <dt style={{ color: 'var(--muted)' }}>{label}</dt>
                    <dd className="tabular-nums" style={{ color: 'var(--ink)' }}>
                      {money(value)}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            <div
              className="mt-3 flex items-baseline justify-between gap-3 border-t pt-2 text-sm"
              style={{ borderColor: 'var(--border)' }}
            >
              <span className="font-semibold" style={{ color: 'var(--ink)' }}>
                Total deductions
              </span>
              <span className="font-semibold tabular-nums" style={{ color: 'var(--red)' }}>
                {money(item.deduction_amount)}
              </span>
            </div>
          </div>
        </div>

        {/* ------------------------------------------------------- net pay */}
        <div
          className="flex flex-wrap items-center justify-between gap-3 px-6 py-5"
          style={{ background: 'var(--brand-soft)' }}
        >
          <div>
            <p
              className="text-[0.68rem] font-bold uppercase tracking-wider"
              style={{ color: 'var(--muted)' }}
            >
              Net Payable
            </p>
            {item.payment_mode && (
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                via {item.payment_mode.replace('_', ' ')}
              </p>
            )}
          </div>
          <p className="text-2xl font-semibold tabular-nums" style={{ color: 'var(--brand-ink)' }}>
            {money(item.net_amount)}
          </p>
        </div>

        {item.remarks && (
          <div className="px-6 py-3" style={{ borderTop: '1px solid var(--border)' }}>
            <p className="text-[0.65rem]" style={{ color: 'var(--muted)' }}>
              Remarks
            </p>
            <p className="mt-0.5 text-sm" style={{ color: 'var(--ink-2)' }}>
              {item.remarks}
            </p>
          </div>
        )}

        <div
          className="flex items-end justify-between gap-6 px-6 pb-6 pt-8"
          style={{ borderTop: '1px solid var(--border)' }}
        >
          {['Employee signature', 'Accounts officer', 'Principal'].map((label) => (
            <div key={label} className="flex-1 text-center">
              <div className="mb-1.5 border-t" style={{ borderColor: 'var(--border)' }} />
              <p className="text-[0.65rem]" style={{ color: 'var(--muted)' }}>
                {label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
