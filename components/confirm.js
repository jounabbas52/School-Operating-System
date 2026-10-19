'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useFormStatus } from 'react-dom'
import { Spinner } from './spinner'

// A submit button that asks first.
//
// Deletes here are plain <form action={serverAction}> submits, so this cannot
// just be an onClick guard -- it renders a type="button" that opens the
// dialog, and only the dialog's confirm button actually submits the form.
// That way the destructive path is unreachable without an explicit second
// click, including by keyboard Enter on the row.

// The dialog is portalled to <body>, so it is outside the <form> in the DOM
// even though it is inside it in the React tree. A type="submit" there would
// do nothing -- HTML form submission follows the DOM. So this asks the form
// to submit itself instead.
//
// useFormStatus still works, because context flows through portals; only
// submission does not.
function ConfirmSubmit({ label, danger, formEl }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => formEl?.requestSubmit()}
      className={danger ? 'btn btn-danger-solid' : 'btn btn-primary'}
    >
      {pending ? (
        <>
          <Spinner /> Working…
        </>
      ) : (
        label
      )}
    </button>
  )
}

// Its own component for the same reason as ConfirmSubmit: useFormStatus has
// to be read inside the form's React tree, not by the dialog's parent.
function ConfirmCancel({ onClick }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="button"
      data-cancel
      onClick={onClick}
      disabled={pending}
      className="btn btn-ghost"
    >
      Cancel
    </button>
  )
}

export default function ConfirmButton({
  children,
  className = 'btn btn-danger',
  title = 'Are you sure?',
  message,
  confirmLabel = 'Delete',
  danger = true,
  disabled = false,
  buttonTitle,
}) {
  // The <form> is captured on open rather than read from the ref during
  // render: refs are not render-time values, and reading one there can leave
  // the dialog holding a stale node.
  const [formEl, setFormEl] = useState(null)
  const [open, setOpen] = useState(false)
  const triggerRef = useRef(null)
  const dialogRef = useRef(null)

  useEffect(() => {
    if (!open) return

    function onKey(event) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)

    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // Focus the safe action, not the destructive one -- a stray Enter should
    // cancel, not delete.
    dialogRef.current?.querySelector('[data-cancel]')?.focus()

    // Copied out of the ref so the cleanup restores focus to the node that
    // was actually mounted when the effect ran.
    const trigger = triggerRef.current

    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
      trigger?.focus()
    }
  }, [open])

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        title={buttonTitle}
        onClick={(event) => {
          setFormEl(event.currentTarget.form)
          setOpen(true)
        }}
        className={className}
      >
        {children}
      </button>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="fixed inset-0 z-[95] flex items-center justify-center p-4">
            <button
              type="button"
              aria-label="Cancel"
              onClick={() => setOpen(false)}
              className="panel-scrim absolute inset-0 cursor-default"
              style={{ background: 'rgb(8 12 22 / 0.45)' }}
            />

            <div
              ref={dialogRef}
              role="alertdialog"
              aria-modal="true"
              aria-label={title}
              className="confirm-sheet relative w-full max-w-sm rounded-xl p-5"
              style={{
                background: 'var(--card)',
                border: '1px solid var(--border)',
                boxShadow: 'var(--shadow)',
              }}
            >
              <div className="flex gap-3">
                <span
                  className="flex size-9 shrink-0 items-center justify-center rounded-full"
                  style={{
                    background: danger ? 'var(--red-soft)' : 'var(--brand-soft)',
                    color: danger ? 'var(--red)' : 'var(--brand-ink)',
                  }}
                  aria-hidden="true"
                >
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />
                  </svg>
                </span>

                <div className="min-w-0">
                  <h2 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                    {title}
                  </h2>
                  {message && (
                    <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
                      {message}
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-5 flex justify-end gap-2">
                <ConfirmCancel onClick={() => setOpen(false)} />
                <ConfirmSubmit label={confirmLabel} danger={danger} formEl={formEl} />
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  )
}
