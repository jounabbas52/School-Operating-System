'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'

// Toast stack. Mounted once per layout; anything below can call useToast().

const ToastContext = createContext(null)

const VARIANTS = {
  success: { accent: 'var(--green)', tint: 'var(--green-soft)', ink: 'var(--green-ink)' },
  error: { accent: 'var(--red)', tint: 'var(--red-soft)', ink: 'var(--red-ink)' },
  info: { accent: 'var(--brand)', tint: 'var(--brand-soft)', ink: 'var(--brand-ink)' },
}

const GLYPHS = {
  success: 'M20 6L9 17l-5-5',
  error: 'M12 8v5M12 16.5v.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z',
  info: 'M12 16v-4M12 8h.01',
}

let nextId = 0

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((t) => t.id !== id))
  }, [])

  const toast = useCallback((message, options = {}) => {
    const id = ++nextId
    setToasts((current) => [
      // Cap the stack: ten toasts sliding up the screen is worse than none.
      ...current.slice(-3),
      { id, message, variant: options.variant ?? 'success', detail: options.detail },
    ])
    return id
  }, [])

  const api = useMemo(
    () => ({
      toast,
      success: (m, o) => toast(m, { ...o, variant: 'success' }),
      error: (m, o) => toast(m, { ...o, variant: 'error' }),
      info: (m, o) => toast(m, { ...o, variant: 'info' }),
      dismiss,
    }),
    [toast, dismiss]
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toasts={toasts} dismiss={dismiss} />
    </ToastContext.Provider>
  )
}

function ToastViewport({ toasts, dismiss }) {
  if (typeof document === 'undefined' || toasts.length === 0) return null

  return createPortal(
    <div
      // aria-live so a screen reader announces the message without the toast
      // stealing focus from whatever the user is doing.
      aria-live="polite"
      aria-atomic="false"
      // Top right, seated below the topbar rather than over it: the topbar's
      // right end holds the theme, notification and user controls, and a toast
      // landing on top of them covers the thing someone is reaching for.
      //
      // flex-col-reverse so the newest toast is the one nearest the top edge.
      // toast() appends, so plain flex-col would put the newest at the bottom
      // of the stack and push older ones toward the eye.
      className="pointer-events-none fixed right-5 top-[4.25rem] z-[100] flex w-[min(22rem,calc(100vw-2.5rem))] flex-col-reverse gap-2"
    >
      {toasts.map((t) => (
        <Toast key={t.id} {...t} onDismiss={() => dismiss(t.id)} />
      ))}
    </div>,
    document.body
  )
}

function Toast({ message, detail, variant, onDismiss }) {
  const v = VARIANTS[variant] ?? VARIANTS.info

  useEffect(() => {
    const timer = setTimeout(onDismiss, variant === 'error' ? 7000 : 4000)
    return () => clearTimeout(timer)
  }, [onDismiss, variant])

  return (
    <div
      role="status"
      className="toast pointer-events-auto flex items-start gap-2.5 rounded-xl px-3.5 py-3"
      style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderLeft: `3px solid ${v.accent}`,
        boxShadow: 'var(--shadow)',
      }}
    >
      <span
        className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full"
        style={{ background: v.tint, color: v.ink }}
        aria-hidden="true"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          {variant === 'info' && <circle cx="12" cy="12" r="9" />}
          <path d={GLYPHS[variant] ?? GLYPHS.info} />
        </svg>
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
          {message}
        </p>
        {detail && (
          <p className="mt-0.5 text-xs" style={{ color: 'var(--muted)' }}>
            {detail}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="-mr-1 -mt-0.5 shrink-0 rounded p-1"
        style={{ color: 'var(--muted-2)' }}
      >
        <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M5 5l10 10M15 5L5 15" />
        </svg>
      </button>
    </div>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    // A no-op keeps a component usable outside a provider rather than
    // crashing the page over a notification.
    return { toast: () => {}, success: () => {}, error: () => {}, info: () => {}, dismiss: () => {} }
  }
  return ctx
}
