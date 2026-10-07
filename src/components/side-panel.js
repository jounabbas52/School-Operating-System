'use client'

import { useEffect, useRef } from 'react'

// Right-hand slide-over used for every create and edit in the app.
// Presentational only: the caller owns `open`, so a form can keep the panel
// open on a validation error and close it on success.
export default function SidePanel({
  open,
  onClose,
  title,
  description,
  icon,
  children,
  footer,
  // Admission-style forms need more than the default drawer width.
  width = 'max-w-md',
}) {
  const sheetRef = useRef(null)

  useEffect(() => {
    if (!open) return

    function onKeyDown(event) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)

    // Stop the page behind from scrolling while the panel is over it.
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // Move focus into the panel so keyboard users are not left behind on the
    // trigger button.
    const firstField = sheetRef.current?.querySelector(
      'input:not([type=hidden]), select, textarea'
    )
    firstField?.focus({ preventScroll: true })

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previous
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close panel"
        onClick={onClose}
        className="panel-scrim absolute inset-0 cursor-default bg-slate-900/25"
      />

      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`panel-sheet relative flex h-full w-full ${width} flex-col`}
        style={{ background: 'var(--card)' }}
      >
        {/* Dark blue header marks the panel as an editing surface. */}
        <div className="panel-head flex items-start justify-between gap-4 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/15 text-sm text-white"
              aria-hidden="true"
            >
              {icon ?? '✎'}
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-white">{title}</h2>
              {description && <p className="mt-0.5 text-xs text-white/75">{description}</p>}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-1 shrink-0 rounded-md p-1.5 text-white/80 transition hover:bg-white/15 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path
                d="M5 5l10 10M15 5L5 15"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>

        {footer && (
          <div
            className="flex items-center justify-end gap-2 border-t px-5 py-3"
            style={{ borderColor: 'var(--border)', background: 'var(--card-alt)' }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
