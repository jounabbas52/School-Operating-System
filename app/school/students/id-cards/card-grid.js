'use client'

import IdCard from './id-card'

// The grid and the print button both live here so the button can call
// window.print() without the page itself becoming a client component. They
// are separate named exports: a static property hung off the default export
// does not survive the server/client boundary.
export default function CardGrid({ cards, settings }) {
  return (
    <div className="print-grid grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {cards.map((card) => (
        <div key={card.id} className="flex justify-center">
          <IdCard student={card} settings={settings} />
        </div>
      ))}
    </div>
  )
}

export function PrintButton({ count }) {
  return (
    <button
      type="button"
      disabled={count === 0}
      onClick={() => window.print()}
      className="btn btn-primary"
      title={count ? `Print ${count} card${count === 1 ? '' : 's'}` : 'Nothing to print'}
    >
      Print all
    </button>
  )
}
