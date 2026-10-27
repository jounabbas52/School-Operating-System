'use client'

import PayslipSheet from '@/components/print/payslip-sheet'
import { PaperRule, PrintButton } from '@/components/print/print-now'

// The one-employee view. The sheet itself is the shared component, so this
// screen and the bulk print of a whole run cannot drift: what the office
// checks here is byte-for-byte what comes out of the printer there.
//
// Everything above the sheet carries .no-print, so pressing Print produces
// the slip and nothing else.
export default function SlipView({ slip, doc, printedAt }) {
  return (
    <div className="flex flex-col gap-3">
      <PaperRule paper={doc?.paper ?? 'a4'} />

      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          {slip.name} · {slip.periodLabel}
        </p>
        <PrintButton label="Print / Save PDF" className="btn btn-blue" />
      </div>

      <div className="doc-preview">
        <PayslipSheet slips={[slip]} doc={doc} printedAt={printedAt} />
      </div>
    </div>
  )
}
