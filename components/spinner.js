// Loading indicators.

// Inline — sits inside a button next to its label.
export function Spinner({ className = '' }) {
  return <span className={`spinner ${className}`} role="status" aria-label="Loading" />
}

// Centred ring, used for whole-screen and whole-card waits.
export function PageLoader({ label = 'Loading…', className = 'min-h-[60vh]' }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-4 ${className}`}>
      <span
        className="spinner-page"
        style={{ color: 'var(--brand)' }}
        role="status"
        aria-label={label}
      />
      <p className="text-sm" style={{ color: 'var(--muted)' }}>
        {label}
      </p>
    </div>
  )
}

// Same ring, sized for a card or a table body rather than the page.
export function BlockLoader({ label = 'Loading…' }) {
  return <PageLoader label={label} className="py-16" />
}
