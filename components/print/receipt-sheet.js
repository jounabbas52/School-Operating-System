// Plain module on purpose -- no 'use client'.
//
// A FEE RECEIPT
//
// The challan is the demand; this is the proof. A parent who paid in cash at
// the office window has nothing else, so the sheet has to carry the four
// things a receipt is challenged on: who paid, how much (in figures AND in
// words), what it was for, and who took it. One receipt can settle several
// challans -- a parent clearing three overdue months and two ahead hands over
// one sum -- so the particulars are a list, not a single bill. Plus the
// balance left on the
// challan, because "I paid that already" is the single most common question
// at a school fee counter and the answer belongs on the paper the parent is
// holding.
//
// Two copies: one for the file, one for the payer. The figures come off the
// stored payment row, never recomputed -- a receipt reprinted after a later
// instalment must still show what that instalment showed.

import { money } from '@/lib/fee-options'
import { amountInWords, printDate } from '@/lib/documents'
import { AmountTable, DocHeader, FieldTable, OfficeUseBox, SignatureLine, Watermark } from './document-sheet'

export default function ReceiptSheet({ receipt, doc, copies = ['Office Copy', 'Payer Copy'], printedAt }) {
  return (
    <div
      className="doc doc-sheet"
      style={{
        '--doc-accent': doc?.accent ?? '#1e3a8a',
        width: '210mm',
        minHeight: '297mm',
        padding: '6mm',
      }}
    >
      <div
        className="doc-copies"
        style={{
          gridTemplateRows: `repeat(${copies.length}, minmax(0, 1fr))`,
          minHeight: 'calc(297mm - 12mm)',
        }}
      >
        {copies.map((label, i) => (
          <ReceiptCopy
            key={`${label}-${i}`}
            label={label}
            receipt={receipt}
            doc={doc}
            printedAt={printedAt}
            last={i === copies.length - 1}
          />
        ))}
      </div>
    </div>
  )
}

function ReceiptCopy({ label, receipt, doc, printedAt, last }) {
  const r = receipt

  return (
    <div className="doc-copy">
      <Watermark url={doc?.watermarkUrl} opacity={0.05} />
      <span className="doc-copy-tag">{label}</span>

      <DocHeader
        doc={doc}
        title="FEE RECEIPT"
        compact
        meta={[
          ['Receipt No', r.receiptNo ?? '—'],
          ['Date', printDate(r.paidAt)],
        ]}
      />

      {/* The sentence a receipt is, written out. Everything below it is the
          same facts in a table -- but this line is what a parent reads, and
          what a court would. */}
      <p style={{ marginTop: '3mm', fontSize: '9.5pt', lineHeight: 1.8 }}>
        Received with thanks from <strong>{r.payerName}</strong>
        {r.student.fatherName ? <> (father/guardian: <strong>{r.student.fatherName}</strong>)</> : null}
        {' '}the sum of <strong>{money(r.amount)}</strong> by{' '}
        <strong>{r.methodLabel}</strong>
        {r.reference ? <> (ref. <strong>{r.reference}</strong>)</> : null} on account of{' '}
        <strong>{r.onAccountOf}</strong>.
      </p>

      <div className="doc-words">
        <span className="doc-words-key">Rupees </span>
        <span className="doc-words-val">{amountInWords(r.amount)}</span>
      </div>

      <div style={{ display: 'flex', gap: '3mm', alignItems: 'flex-start', marginTop: '2mm' }}>
        <div style={{ flex: '1 1 56%', minWidth: 0 }}>
          <FieldTable
            dense
            cols={2}
            rows={[
              ['Student', r.student.name],
              ['Adm No', r.student.admissionNumber],
              ['Class', r.student.className],
              ['Roll No', r.student.rollNumber],
              ['Challan No', r.challanNumber ?? `${r.settled.length} challans`],
              ['Fee period', r.periodLabel],
            ]}
          />
          {r.notes && <p className="doc-note">{r.notes}</p>}
        </div>

        <div style={{ flex: '1 1 44%', minWidth: 0 }}>
          {/* One line per bill this money cleared. A parent who paid five
              months at once needs to see the five months on the receipt, or
              the receipt does not prove what they paid for. */}
          <AmountTable
            head={['Settled by this payment', 'Amount (Rs)']}
            lines={[
              ...r.settled.map((a) => ({
                label: a.challanNumber,
                note: a.periodLabel,
                amount: money(a.amount),
              })),
              r.heldAsAdvance > 0 && {
                label: 'Held as advance',
                note: 'against future challans',
                amount: money(r.heldAsAdvance),
              },
            ].filter(Boolean)}
            totals={[
              { label: 'This payment', amount: money(r.amount), strong: true },
              r.balanceAfter != null && {
                label: r.balanceAfter > 0 ? 'Balance remaining' : 'Advance in hand',
                amount: money(Math.abs(r.balanceAfter)),
              },
            ].filter(Boolean)}
          />
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: '4mm',
          marginTop: '3mm',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* The sentence that tells a parent whether they still owe
              anything -- which is the first thing they look for, and the
              figure of record is the ledger balance as at this receipt. */}
          {r.balanceAfter == null ? null : r.balanceAfter > 0 ? (
            <p className="doc-note">
              {money(r.balanceAfter)} remains payable on this account.
            </p>
          ) : r.balanceAfter < 0 ? (
            <p className="doc-note">
              Nothing outstanding. {money(Math.abs(r.balanceAfter))} is held in advance and comes
              off the next challan.
            </p>
          ) : (
            <p className="doc-note">This account is settled in full. No balance outstanding.</p>
          )}
          {doc?.footerNote && <p className="doc-note">{doc.footerNote}</p>}
          {doc?.showPrintTime && printedAt && <p className="doc-note">Printed {printedAt}</p>}
        </div>

        <SignatureLine
          width="42mm"
          name={r.receivedByName ?? doc?.accountant?.name}
          label={doc?.accountant?.label ?? 'Received by'}
          signatureUrl={doc?.accountant?.signatureUrl}
          stampUrl={doc?.schoolStampUrl}
        />
      </div>

      {/* Only on the copy that goes in the file -- the payer's copy has no
          office to fill it in. */}
      {label.toLowerCase().includes('office') && (
        <OfficeUseBox rows={['Posted to ledger', 'Cashier', 'Date']} />
      )}

      {!last && <span className="doc-cut-note">cut here</span>}
    </div>
  )
}
