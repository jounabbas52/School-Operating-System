'use client'

import { useEffect } from 'react'

// The print path is the browser's own dialog, not a generated PDF.
//
// jsPDF is still the right tool for a table dump (see components/export-
// buttons.js) because a 40-column report is a table and nothing else. A
// challan is not: it is a ruled form with a crest, a watermark, a barcode, a
// stamp impression and three copies on one page, and rebuilding that in
// drawing primitives means maintaining a second renderer that drifts from the
// one on screen. Printing the same DOM the preview shows means what the user
// approved is exactly what comes out, and Save-as-PDF in the dialog gives
// them a PDF anyway.

/**
 * @page cannot be set from an element's style attribute, so a sheet's paper
 * size has to arrive as a stylesheet. Each print route emits one of these,
 * which is also what zeroes the page margin -- the sheet carries its own
 * padding, and the 12mm default in globals.css would stack with it and push
 * a full-height A4 sheet onto two pages.
 */
export function PaperRule({ paper = 'a4', landscape = false }) {
  const size = paper === 'letter' ? 'letter' : paper === 'legal' ? 'legal' : 'A4'
  return (
    <style>{`@page { size: ${size}${landscape ? ' landscape' : ''}; margin: 0; }`}</style>
  )
}

export function PrintButton({
  label = 'Print',
  pendingLabel,
  className = 'btn btn-primary',
  disabled = false,
  title,
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => window.print()}
      className={className}
      title={title ?? (disabled ? 'Nothing to print' : 'Opens the browser print dialog')}
    >
      {pendingLabel ?? label}
    </button>
  )
}

/**
 * Opens the print dialog as soon as the sheet is on screen.
 *
 * For the route a "Print" button elsewhere links to: the user already asked
 * to print, so making them press a second button in a new tab is a step for
 * nothing.
 *
 * The rAF pair is not superstition. print() captures the document
 * synchronously, and on a sheet with a logo and a barcode the first frame has
 * neither -- Chrome will happily render a preview with blank image boxes.
 * Waiting for images to decode first is what makes the crest appear.
 */
export function AutoPrint({ enabled = true }) {
  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    const images = Array.from(document.images)
    const ready = Promise.all(
      images.map((img) =>
        img.complete
          ? Promise.resolve()
          : new Promise((resolve) => {
              img.addEventListener('load', resolve, { once: true })
              // A broken logo must not block the dialog for ever.
              img.addEventListener('error', resolve, { once: true })
            })
      )
    )

    // Barcodes are drawn by an effect in components/barcode.js that imports
    // jsbarcode dynamically, so they are not in document.images at all and
    // not finished when the images are. One extra beat covers them.
    const timer = setTimeout(() => {
      ready.then(() => {
        if (cancelled) return
        requestAnimationFrame(() => requestAnimationFrame(() => window.print()))
      })
    }, 350)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [enabled])

  return null
}

/** Back to the screen the print was launched from. */
export function CloseButton({ label = 'Close', className = 'btn btn-ghost' }) {
  return (
    <button type="button" onClick={() => window.history.back()} className={className}>
      {label}
    </button>
  )
}
