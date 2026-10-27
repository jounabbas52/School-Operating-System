// Plain module on purpose -- no 'use client'.
//
// A SALARY SLIP
//
// The old slip was the app's own UI with a print stylesheet draped over it:
// theme variables, rounded cards, no letterhead, no signature, no stamp. It
// looked like a screenshot, which is a problem, because a salary slip is the
// document a bank asks for when the holder applies for a loan and the one an
// employee keeps as proof of income. It has to look issued.
//
// Two blocks fit one A4, so bulk-printing a payroll run of forty is twenty
// sheets rather than forty. Each block is self-contained -- masthead, figures
// and signatures -- because it will be cut out and handed over on its own.
//
// Every figure is read off the stored payroll item and nothing is recomputed:
// a slip reprinted in December has to show what December's slip showed, and a
// formula re-run against today's salary would not.

import { money } from '@/lib/payroll-options'
import { amountInWords } from '@/lib/documents'
import {
  AmountTable,
  DocFooter,
  DocHeader,
  FieldTable,
  SignatureLine,
  Watermark,
} from './document-sheet'

/** One A4 carrying up to two slips. */
export default function PayslipSheet({ slips = [], doc, printedAt }) {
  return (
    <div
      className="doc doc-sheet"
      style={{
        '--doc-accent': doc?.accent ?? '#1e3a8a',
        width: '210mm',
        minHeight: '297mm',
        padding: '8mm',
      }}
    >
      <div className="doc-copies" style={{ gridTemplateRows: `repeat(${slips.length}, auto)`, gap: '6mm' }}>
        {slips.map((slip, i) => (
          <PayslipBlock
            key={slip.id ?? i}
            slip={slip}
            doc={doc}
            printedAt={printedAt}
            last={i === slips.length - 1}
          />
        ))}
      </div>
    </div>
  )
}

export function PayslipBlock({ slip, doc, printedAt, last = true }) {
  const s = slip

  const earnings = [
    ['Basic salary', s.basic],
    ['Allowances', s.allowances],
  ]
    .filter(([, v]) => Number(v) > 0)
    .map(([label, v]) => ({ label, amount: money(v) }))

  const deductionLines = [
    ['Absence / late', s.absence],
    ['EOBI', s.eobi],
    ['Provident fund', s.pf],
    ['Income tax', s.tax],
  ].filter(([, v]) => Number(v) > 0)

  // Anything the itemised lines do not account for -- a manual adjustment,
  // most often. Shown rather than silently dropped, so gross minus deductions
  // always equals net on the page. An employee who adds the column up and
  // gets a different answer has a grievance, and they would be right.
  const itemised = deductionLines.reduce((sum, [, v]) => sum + (Number(v) || 0), 0)
  const other = (Number(s.deductions) || 0) - itemised
  if (other > 0.5) deductionLines.push(['Other deductions', other])

  const deductions = deductionLines.map(([label, v]) => ({ label, amount: money(v) }))

  return (
    <div className="doc-copy" style={{ border: '0.3mm solid var(--doc-line-soft)', borderRadius: '1mm' }}>
      <Watermark url={doc?.watermarkUrl} opacity={0.05} />

      <DocHeader
        doc={doc}
        title="SALARY SLIP"
        compact
        meta={[
          ['Period', s.periodLabel],
          ['Slip No', s.slipNo ?? '—'],
          ['Status', s.statusLabel],
        ]}
      />

      <FieldTable
        dense
        cols={3}
        rows={[
          ['Employee', s.name],
          ['Staff ID', s.staffNumber],
          ['Designation', s.designation],
          ['Department', s.department],
          ['Payment mode', s.paymentMode],
          ['Bank / account', s.bankLine],
        ]}
      />

      {/* Attendance is on the slip because it is WHY the net differs from the
          gross. A deduction with no day count beside it is the line every
          employee walks to the office about. */}
      <FieldTable
        dense
        cols={6}
        rows={[
          ['Working', s.workingDays],
          ['Present', s.presentDays],
          ['Absent', s.absentDays],
          ['Half days', s.halfDays],
          ['Leave', s.leaveDays],
          ['Late marks', s.lateMarks],
        ]}
      />

      <div style={{ display: 'flex', gap: '3mm', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <AmountTable
            head={['Earnings', 'Amount (Rs)']}
            lines={earnings}
            totals={[{ label: 'Gross', amount: money(s.gross) }]}
          />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <AmountTable
            head={['Deductions', 'Amount (Rs)']}
            lines={deductions.length ? deductions : [{ label: 'None this month', amount: money(0) }]}
            totals={[{ label: 'Total deductions', amount: money(s.deductions) }]}
          />
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '4mm',
          marginTop: '2.5mm',
          padding: '2mm 3mm',
          background: 'var(--doc-accent)',
          borderRadius: '1mm',
          color: '#fff',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: '7pt', letterSpacing: '0.1em', textTransform: 'uppercase', opacity: 0.85 }}>
            Net payable
          </p>
          <p style={{ fontSize: '7.5pt', fontStyle: 'italic', opacity: 0.9 }}>
            {amountInWords(s.net)}
          </p>
        </div>
        <p style={{ fontSize: '15pt', fontWeight: 800, whiteSpace: 'nowrap' }}>{money(s.net)}</p>
      </div>

      {s.remarks && (
        <p className="doc-note">
          <strong>Remarks:</strong> {s.remarks}
        </p>
      )}

      <div className="doc-sign-row" style={{ marginTop: '6mm' }}>
        <SignatureLine width="38mm" label="Employee signature" />
        <SignatureLine
          width="38mm"
          name={doc?.accountant?.name}
          label={doc?.accountant?.label ?? 'Accountant'}
          signatureUrl={doc?.accountant?.signatureUrl}
        />
        <SignatureLine
          width="38mm"
          name={doc?.principal?.name}
          label={doc?.principal?.label ?? 'Principal'}
          signatureUrl={doc?.principal?.signatureUrl}
          stampUrl={doc?.principalStampUrl ?? doc?.schoolStampUrl}
        />
      </div>

      <DocFooter doc={doc} printedAt={printedAt} />

      {!last && <span className="doc-cut-note">cut here</span>}
    </div>
  )
}
