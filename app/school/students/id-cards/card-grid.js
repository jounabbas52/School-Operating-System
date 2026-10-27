'use client'

import IdCard from '@/components/print/id-card'
import { PaperRule, PrintButton as PrintNow } from '@/components/print/print-now'

// The grid and the print button both live here so the button can call
// window.print() without the page itself becoming a client component. They
// are separate named exports: a static property hung off the default export
// does not survive the server/client boundary.
//
// The grid is sized in card widths rather than a column count. At CR80 an A4
// takes two across and five down whatever the window is doing, and a
// responsive 2/3/4-column grid meant the printed sheet changed depending on
// how wide the browser happened to be when somebody pressed Print.
export default function CardGrid({ cards, settings }) {
  return (
    <>
      <PaperRule paper="a4" />
      <div className="doc-card-grid">
        {cards.map((card) => (
          <IdCard key={card.id} student={card} settings={settings} />
        ))}
      </div>
    </>
  )
}

export function PrintButton({ count }) {
  return (
    <PrintNow
      label="Print all"
      disabled={count === 0}
      title={count ? `Print ${count} card${count === 1 ? '' : 's'}` : 'Nothing to print'}
    />
  )
}
