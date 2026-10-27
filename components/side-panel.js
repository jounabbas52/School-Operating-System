'use client'

import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

// The overlay used for every create and edit in the app.
//
// Two shapes, same chrome: `drawer` (default) slides in from the right,
// `modal` is a centred dialog for forms that read as one decision -- a grid of
// checkboxes and a Save, say, where a tall narrow column fights the content.
//
// Presentational only: the caller owns `open`, so a form can keep the overlay
// open on a validation error and close it on success.
//
// Portalled to <body>, like the confirm dialog and the combobox list. Rendered
// in place it sits inside whatever card the trigger lives in, and any ancestor
// that creates a containing block -- a transform, a filter, a `contain` -- then
// pulls the "fixed" overlay back into that card, so editing a role looks like
// the card expanded instead of a panel opening over the page.
export default function SidePanel({
  open,
  onClose,
  title,
  description,
  icon,
  children,
  footer,
  // True while the panel's action is in flight. Closing then would unmount the
  // form mid-save: the write still lands, but the success handler never runs,
  // so no toast and no refreshed list -- it reads as a failure. The footer
  // Cancel is disabled for the same reason, and Escape, the scrim and the X
  // are simply the other three ways out of the same door.
  busy = false,
  // Admission-style forms need more than the default drawer width.
  width = 'max-w-md',
  variant = 'drawer',
  // Modal only. The default suits a short form; a design panel with a live
  // preview beside it wants the screen, and capping it at 46rem on a 1080p
  // display puts the preview in a 300px porthole.
  maxHeight = 'min(90dvh, 46rem)',
}) {
  const sheetRef = useRef(null)

  useEffect(() => {
    if (!open) return

    function onKeyDown(event) {
      if (event.key === 'Escape' && !busy) onClose()
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
  }, [open, onClose, busy])

  if (!open || typeof document === 'undefined') return null

  const modal = variant === 'modal'

  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex ${
        modal ? 'items-center justify-center p-4' : 'justify-end'
      }`}
    >
      <button
        type="button"
        aria-label="Close panel"
        onClick={onClose}
        disabled={busy}
        className="panel-scrim absolute inset-0 cursor-default bg-slate-900/25"
      />

      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={
          modal
            ? `modal-sheet relative flex w-full ${width} flex-col overflow-hidden rounded-2xl`
            : `panel-sheet relative flex h-full w-full ${width} flex-col`
        }
        style={{
          background: 'var(--card)',
          ...(modal ? { border: '1px solid var(--border)', maxHeight } : null),
        }}
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
            disabled={busy}
            aria-label="Close"
            className="-mr-1 -mt-1 shrink-0 rounded-md p-1.5 text-white/80 transition hover:bg-white/15 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-40"
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

        <div className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-5 py-5">
          {children}
        </div>

        {footer && (
          <div
            className="flex items-center justify-end gap-2 border-t px-5 py-3"
            style={{ borderColor: 'var(--border)', background: 'var(--card-alt)' }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
