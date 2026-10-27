// Plain module on purpose -- no 'use client'.
//
// A PAYMENT VOUCHER
//
// Money leaving the school needs a piece of paper with three signatures on
// it: whoever prepared it, whoever approved it, and whoever took the cash.
// That is the entire reason this document exists -- an expense row in a
// database is a record, but a voucher is the authorisation, and an auditor
// asks for the voucher.
//
// So the signature block here is not decoration at the bottom of a page the
// way it is on a report. It is the point, and the amount in words above it is
// what stops the figure being altered between approval and payment.

import { money } from '@/lib/payroll-options'
import { amountInWords, printDate } from '@/lib/documents'
import {
  AmountTable,
  DocFooter,
  DocHeader,
  FieldTable,
  OfficeUseBox,
  SignatureLine,
  Watermark,
} from './document-sheet'

export default function VoucherSheet({
  voucher,
  doc,
  copies = ['Accounts Copy', 'Payee Copy'],
  printedAt,
}) {
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
          <VoucherCopy
            key={`${label}-${i}`}
            label={label}
            voucher={voucher}
            doc={doc}
            printedAt={printedAt}
            last={i === copies.length - 1}
          />
        ))}
      </div>
    </div>
  )
}

function VoucherCopy({ label, voucher, doc, printedAt, last }) {
  const v = voucher

  return (
    <div className="doc-copy">
      <Watermark url={doc?.watermarkUrl} opacity={0.05} />
      <span className="doc-copy-tag">{label}</span>

      {/* An unapproved voucher that has been printed anyway must say so, or
          it looks exactly like an approved one. */}
      {v.status && v.status !== 'paid' && v.status !== 'approved' && (
        <span className="doc-overprint doc-overprint-red">{String(v.status).toUpperCase()}</span>
      )}

      <DocHeader
        doc={doc}
        title={v.title ?? 'PAYMENT VOUCHER'}
        compact
        meta={[
          ['Voucher No', v.voucherNo ?? '—'],
          ['Date', printDate(v.date)],
        ]}
      />

      <FieldTable
        dense
        cols={2}
        rows={[
          ['Paid to', v.paidTo],
          ['Category', v.categoryLabel],
          ['Payment mode', v.methodLabel],
          ['Bill / invoice no', v.billNo],
          ['Vendor', v.vendor],
          ['Status', v.statusLabel],
        ]}
      />

      <AmountTable
        head={['Particulars', 'Amount (Rs)']}
        lines={v.lines.map((l) => ({ label: l.label, note: l.note, amount: money(l.amount) }))}
        // Two ruled blank lines. A voucher is filled in by hand as often as
        // it is generated -- a second item, a rounding adjustment -- and a
        // form with nowhere to write it gets written in the margin.
        filler={2}
        totals={[{ label: 'Total', amount: money(v.amount), strong: true }]}
      />

      <div className="doc-words">
        <span className="doc-words-key">Amount in words </span>
        <span className="doc-words-val">{amountInWords(v.amount)}</span>
      </div>

      {v.notes && (
        <p className="doc-note">
          <strong>Narration:</strong> {v.notes}
        </p>
      )}

      <div className="doc-sign-row" style={{ marginTop: '5mm' }}>
        <SignatureLine
          width="38mm"
          name={v.preparedByName ?? doc?.accountant?.name}
          label="Prepared by"
          signatureUrl={doc?.accountant?.signatureUrl}
        />
        <SignatureLine
          width="38mm"
          name={v.approvedByName ?? doc?.principal?.name}
          label="Approved by"
          signatureUrl={doc?.principal?.signatureUrl}
          stampUrl={doc?.principalStampUrl}
        />
        <SignatureLine width="38mm" name={v.paidTo} label="Received by" />
      </div>

      {label.toLowerCase().includes('accounts') && (
        <OfficeUseBox rows={['Cash book folio', 'Head of account', 'Cheque / ref no']} />
      )}

      <DocFooter doc={doc} printedAt={printedAt} />

      {!last && <span className="doc-cut-note">cut here</span>}
    </div>
  )
}
