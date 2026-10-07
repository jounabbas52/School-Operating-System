'use client'

import { useEffect, useRef } from 'react'

// Real Code 128 barcode, drawn client-side into an SVG.
//
// It has to be a genuine barcode, not a decorative stripe pattern: these get
// printed onto ID cards and scanned at a library desk or a gate. A fake one
// looks right and fails silently at the only moment it matters.
export default function Barcode({ value, height = 34, showText = true }) {
  const ref = useRef(null)

  useEffect(() => {
    if (!ref.current || !value) return
    let cancelled = false

    import('jsbarcode').then(({ default: JsBarcode }) => {
      if (cancelled || !ref.current) return
      try {
        JsBarcode(ref.current, String(value), {
          format: 'CODE128',
          width: 1.4,
          height,
          displayValue: showText,
          fontSize: 9,
          margin: 0,
          lineColor: '#111827',
          background: 'transparent',
        })
      } catch {
        // An unencodable value should not take the card down with it.
      }
    })

    return () => {
      cancelled = true
    }
  }, [value, height, showText])

  if (!value) return null
  return <svg ref={ref} className="max-w-full" role="img" aria-label={`Barcode ${value}`} />
}
