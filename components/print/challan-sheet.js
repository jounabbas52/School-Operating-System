// Plain module on purpose -- no 'use client'.
//
// A FEE CHALLAN, THE WAY A FEE CHALLAN IS
//
// Not a styled invoice. The form a parent is handed every month and carries to
// a bank counter has a fixed anatomy, and every part of it is there because
// somebody downstream needs it:
//
//   three copies on one sheet   the bank keeps one, the school files one, the
//                               parent keeps one as proof of payment. Cut
//                               along the dashed rules.
//   the months it covers        one line per month, because a voucher can
//                               span five of them and a parent paying it has
//                               to see which five.
//   arrears and advance         what was owed before this bill, and any
//                               advance spent against it -- the two figures
//                               that are argued about at the counter.
//   payable before / after      the whole reason a challan has a due date.
//                               Two figures, printed side by side, so nobody
//                               has to work out the fine at the counter.
//   the amount in words         what settles an argument when a digit has
//                               been altered.
//   the bank block              account title and number, on the slip itself,
//                               because the teller will not look it up.
//   the barcode                 the challan number, scannable, so collection
//                               is a scan rather than a typed search.
//   a stamp and a signature     an unsigned slip is not accepted anywhere.
//
// Every figure is read off the stored challan and nothing is recomputed here.
// A challan reprinted in December has to show what December's challan showed;
// a formula re-run against today's fee policy would not.

import Barcode from '@/components/barcode'
import { money } from '@/lib/fee-options'
import { amountInWords, printDate } from '@/lib/documents'
import { AmountTable, DocHeader, FieldTable, SignatureLine, Watermark } from './document-sheet'

const PAPER = {
  a4: { short: '210mm', long: '297mm' },
  letter: { short: '216mm', long: '279mm' },
  legal: { short: '216mm', long: '356mm' },
}

/**
 * Three copies go side by side on a landscape sheet; one or two go stacked on
 * a portrait one.
 *
 * Not a style choice -- arithmetic. A copy of this form is about 120mm of
 * content once the masthead, the two tables, the figure in words, the bank
 * panel and the signature line are all on it. Three of those stacked down an
 * A4 need 360mm and the paper has 285mm, so the third copy was being silently
 * clipped by the sheet's own overflow -- the worst possible failure, because
 * the preview looked fine and the bank copy came out of the printer with its
 * signature line missing.
 *
 * Turned on its side, three copies get a 95mm column and 198mm of height
 * each, which is the three-strip challan every bank counter in the country
 * already handles. Two copies or one fit portrait comfortably, so they stay
 * that way -- a receipt-style voucher reads better across the page.
 */
export function challanLandscape(doc, copies) {
  const labels = copies ?? doc?.challan?.copies ?? []
  return (labels.length || 3) >= 3
}

export default function ChallanSheet({ challan, doc, copies, printedAt }) {
  const labels = copies ?? doc?.challan?.copies ?? ['Bank Copy', 'School Copy', 'Student Copy']
  const paper = PAPER[doc?.paper] ?? PAPER.a4
  const landscape = challanLandscape(doc, labels)

  const width = landscape ? paper.long : paper.short
  const height = landscape ? paper.short : paper.long

  return (
    <div
      className="doc doc-sheet"
      style={{
        '--doc-accent': doc?.accent ?? '#1e3a8a',
        width,
        minHeight: height,
        padding: '6mm',
      }}
    >
      <div
        className={`doc-copies${landscape ? ' doc-copies-across' : ''}`}
        style={{
          // Equal fractions of the printable area, across or down. minmax(0,
          // 1fr) rather than 1fr: a long particulars table in one copy would
          // otherwise stretch its own track and squeeze the others, and three
          // copies of the same challan that are not the same size look like
          // three different challans.
          ...(landscape
            ? {
                gridTemplateColumns: `repeat(${labels.length}, minmax(0, 1fr))`,
                minHeight: `calc(${height} - 12mm)`,
              }
            : {
                gridTemplateRows: `repeat(${labels.length}, minmax(0, 1fr))`,
                minHeight: `calc(${height} - 12mm)`,
              }),
        }}
      >
        {labels.map((label, i) => (
          <ChallanCopy
            key={`${label}-${i}`}
            label={label}
            challan={challan}
            doc={doc}
            printedAt={printedAt}
            last={i === labels.length - 1}
            stacked={landscape}
          />
        ))}
      </div>
    </div>
  )
}

function ChallanCopy({ label, challan, doc, printedAt, last, stacked }) {
  const c = challan
  const fine = Number(doc?.challan?.fineAmount) || 0
  const showFine = (doc?.challan?.showFine ?? true) && c.remaining > 0

  const lines = c.lines.map((l) => ({
    label: l.label,
    note: l.note,
    amount: money(l.amount),
  }))

  // Arrears and advance are the two figures a parent argues about at the
  // counter, so they are printed as their own lines rather than folded into a
  // total. "Arrears brought forward" is what was owed before this bill, which
  // is why it sits above the total and not inside it.
  const arrears = Number(c.previousBalance) || 0
  const creditApplied = Number(c.creditApplied) || 0
  // payable is written at issue time. A challan raised before this module
  // existed has no such figure, and then the net amount is the bill.
  const payableNow = Number(c.payable) > 0 ? Number(c.payable) : c.net + Math.max(arrears, 0)

  const totals = [
    Number(c.discount) > 0 && { label: 'Less: discount', amount: `(${money(c.discount)})` },
    Number(c.lateFee) > 0 && { label: 'Add: late fee', amount: money(c.lateFee) },
    { label: 'This bill', amount: money(c.net) },
    arrears > 0 && { label: 'Arrears brought forward', amount: money(arrears) },
    arrears < 0 && {
      label: 'Advance brought forward',
      amount: `(${money(Math.abs(arrears))})`,
    },
    creditApplied > 0 && {
      label: 'Less: advance applied',
      amount: `(${money(creditApplied)})`,
    },
    { label: 'Total payable', amount: money(payableNow), strong: true },
    Number(c.paid) > 0 && { label: 'Already paid', amount: money(c.paid) },
    Number(c.paid) > 0 && { label: 'Balance due', amount: money(c.remaining) },
  ].filter(Boolean)

  return (
    <div className="doc-copy">
      <Watermark url={doc?.watermarkUrl} opacity={0.05} />
      <span className="doc-copy-tag">{label}</span>

      {/* A settled challan can still be reprinted, and nothing on the page
          would otherwise say so. */}
      {c.status === 'paid' && <span className="doc-overprint">PAID</span>}
      {c.status === 'cancelled' && (
        <span className="doc-overprint doc-overprint-red">CANCELLED</span>
      )}

      <DocHeader
        doc={doc}
        title={doc?.challan?.title ?? 'FEE CHALLAN'}
        compact
        meta={[
          ['Challan No', c.number ?? '—'],
          ['Issued', printDate(c.issuedDate)],
          ['Due date', printDate(c.dueDate)],
        ]}
      />

      {/* Student first, money second -- a parent checks the name before the
          figure. Side by side on a full-width band; stacked in a 95mm strip,
          where two columns would put three words per line in each. */}
      <div
        style={{
          display: 'flex',
          flexDirection: stacked ? 'column' : 'row',
          gap: stacked ? '2mm' : '3mm',
          alignItems: 'stretch',
        }}
      >
        <div style={{ flex: stacked ? '0 0 auto' : '1 1 52%', minWidth: 0 }}>
          <FieldTable
            dense
            cols={stacked ? 1 : 2}
            rows={[
              ['Student', c.student.name],
              ['Adm No', c.student.admissionNumber],
              ["Father's name", c.student.fatherName],
              ['Roll No', c.student.rollNumber],
              ['Class', c.student.className],
              ['Section', c.student.sectionName],
              ['Fee for', c.periodLabel],
              ['Fee type', c.feeTypeLabel],
            ]}
          />
          {c.description && <p className="doc-note">{c.description}</p>}
        </div>

        <div style={{ flex: stacked ? '0 0 auto' : '1 1 48%', minWidth: 0 }}>
          <AmountTable lines={lines} totals={totals} head={['Particulars', 'Amount (Rs)']} />
        </div>
      </div>

      {/* The two figures that are the point of a due date. Printed as a pair
          so nobody computes a fine by hand at a counter. */}
      {showFine && fine > 0 && (
        <div
          className="doc-bank"
          style={{
            display: 'flex',
            flexDirection: stacked ? 'column' : 'row',
            gap: stacked ? '0.6mm' : '6mm',
          }}
        >
          <span className="doc-bank-item" style={{ justifyContent: 'space-between' }}>
            <span className="doc-bank-key">On or before {printDate(c.dueDate)}</span>
            <span className="doc-bank-val">{money(c.remaining)}</span>
          </span>
          <span className="doc-bank-item" style={{ justifyContent: 'space-between' }}>
            <span className="doc-bank-key">After due date</span>
            <span className="doc-bank-val">{money(c.remaining + fine)}</span>
          </span>
        </div>
      )}

      <div className="doc-words">
        <span className="doc-words-key">Amount in words </span>
        <span className="doc-words-val">
          {amountInWords(c.remaining > 0 ? c.remaining : payableNow)}
        </span>
      </div>

      {doc?.challan?.showBank && doc?.bank?.filled && (
        <div className="doc-bank">
          <p className="doc-bank-title">Deposit at</p>
          {/* Two columns across a full band; one down a 95mm strip, where an
              IBAN in half the width wraps onto three lines. */}
          <div
            className="doc-bank-grid"
            style={stacked ? { gridTemplateColumns: 'minmax(0, 1fr)' } : undefined}
          >
            {[
              ['Bank', [doc.bank.name, doc.bank.branch].filter(Boolean).join(' — ')],
              ['Account title', doc.bank.title],
              ['Account no', doc.bank.number],
              ['IBAN', doc.bank.iban],
            ]
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <span key={k} className="doc-bank-item">
                  <span className="doc-bank-key">{k}:</span>
                  <span className="doc-bank-val">{v}</span>
                </span>
              ))}
          </div>
          {doc.bank.note && <p className="doc-note">{doc.bank.note}</p>}
        </div>
      )}

      {/* The instructions, the barcode and the signature. marginTop:auto
          pins the block to the bottom edge of its track, so the signature
          line on all three copies sits at the same height -- which is what
          makes a sheet of three look like one form rather than three. */}
      <div
        style={{
          display: 'flex',
          flexDirection: stacked ? 'column' : 'row',
          alignItems: stacked ? 'stretch' : 'flex-end',
          justifyContent: 'space-between',
          gap: '2mm',
          marginTop: 'auto',
          paddingTop: '2mm',
        }}
      >
        <div style={{ flex: stacked ? '0 0 auto' : 1, minWidth: 0 }}>
          {doc?.challan?.instructions && (
            <p className="doc-note">{doc.challan.instructions}</p>
          )}
          {doc?.footerNote && last && <p className="doc-note">{doc.footerNote}</p>}
          {doc?.showPrintTime && printedAt && (
            <p className="doc-note">Printed {printedAt}</p>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: '2mm',
          }}
        >
          {doc?.challan?.showBarcode && c.number ? (
            <div style={{ flexShrink: 0 }}>
              <Barcode value={c.number} height={20} />
            </div>
          ) : (
            <span />
          )}

          <SignatureLine
            width="34mm"
            name={doc?.accountant?.name}
            label={doc?.accountant?.label ?? 'Accountant'}
            signatureUrl={doc?.accountant?.signatureUrl}
            stampUrl={doc?.schoolStampUrl}
          />
        </div>
      </div>

      {!last && <span className="doc-cut-note">cut here</span>}
    </div>
  )
}
