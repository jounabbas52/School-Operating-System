// Server components. The page furniture every screen shares, so a change to
// the look happens here rather than in fifteen files.

const TONES = {
  brand: { fg: 'var(--brand)', bg: 'var(--brand-soft)', ink: 'var(--brand-ink)' },
  blue: { fg: 'var(--blue)', bg: 'var(--blue-soft)', ink: 'var(--blue-ink)' },
  green: { fg: 'var(--green)', bg: 'var(--green-soft)', ink: 'var(--green-ink)' },
  amber: { fg: 'var(--amber)', bg: 'var(--amber-soft)', ink: 'var(--amber-ink)' },
  red: { fg: 'var(--red)', bg: 'var(--red-soft)', ink: 'var(--red-ink)' },
}

/* ------------------------------------------------------------- page header */
export function PageHeader({ icon, title, subtitle, actions }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-center gap-3">
        {icon && (
          <span
            className="flex size-10 shrink-0 items-center justify-center rounded-xl text-base"
            style={{ background: 'var(--brand-grad)', color: '#fff' }}
            aria-hidden="true"
          >
            {icon}
          </span>
        )}
        <div>
          <h1 className="text-xl font-semibold tracking-tight" style={{ color: 'var(--ink)' }}>
            {title}
          </h1>
          {subtitle && (
            <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/* -------------------------------------------------------------- stat cards */
// The number carries the tone colour, not the card. A wall of tinted cards
// competes for attention; a wall of white cards with one red number does not.
export function StatCard({ label, value, sub, tone = 'brand', icon }) {
  const t = TONES[tone] ?? TONES.brand
  return (
    <div className="card flex items-start justify-between gap-3 p-4">
      <div className="min-w-0">
        <p className="text-xs font-medium" style={{ color: 'var(--muted)' }}>
          {label}
        </p>
        <p
          className="mt-1 text-xl font-semibold tabular-nums"
          style={{ color: t.fg }}
        >
          {value}
        </p>
        {sub && (
          <p className="mt-0.5 text-xs" style={{ color: 'var(--muted-2)' }}>
            {sub}
          </p>
        )}
      </div>
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-lg text-sm"
        style={{ background: t.bg, color: t.fg }}
        aria-hidden="true"
      >
        {icon ?? label[0]}
      </span>
    </div>
  )
}

export function StatRow({ children }) {
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
}

/* -------------------------------------------------------------- filter bar */
export function FilterBar({ children }) {
  return (
    <div className="card flex flex-wrap items-center gap-2 p-3">{children}</div>
  )
}

/* ------------------------------------------------------------- empty state */
export function EmptyState({ icon, title, description, action }) {
  return (
    <div className="card flex flex-col items-center gap-2 px-6 py-16 text-center">
      {icon && (
        <span className="text-3xl opacity-40" aria-hidden="true">
          {icon}
        </span>
      )}
      <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
        {title}
      </p>
      {description && (
        <p className="max-w-sm text-sm" style={{ color: 'var(--muted)' }}>
          {description}
        </p>
      )}
      {action}
    </div>
  )
}

/* ---------------------------------------------------------------- fill bar */
export function FillBar({ enrolled, capacity }) {
  const cap = Number(capacity) || 0
  const count = Number(enrolled) || 0
  const pct = cap > 0 ? Math.min(100, Math.round((count / cap) * 100)) : 0
  // Amber past 90%, red at capacity -- an over-subscribed section should be
  // visible without reading the numbers.
  const colour = pct >= 100 ? 'var(--red)' : pct >= 90 ? 'var(--amber)' : 'var(--green)'

  return (
    <div className="min-w-[7rem]">
      <div className="flex items-baseline gap-1 text-xs">
        <span className="font-medium tabular-nums" style={{ color: 'var(--ink)' }}>
          {count}
        </span>
        <span style={{ color: 'var(--muted-2)' }}>/ {cap || '—'}</span>
      </div>
      <div
        className="mt-1 h-1.5 w-full overflow-hidden rounded-full"
        style={{ background: 'var(--border-soft)' }}
      >
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: colour }} />
      </div>
      <p className="mt-0.5 text-[0.65rem]" style={{ color: 'var(--muted)' }}>
        {pct}% full
      </p>
    </div>
  )
}

/* --------------------------------------------------------- session banner */
export function SessionBanner({ session, action }) {
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3"
      style={{ background: 'var(--brand-soft)', border: '1px solid transparent' }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="size-2 rounded-full" style={{ background: 'var(--brand)' }} />
        <span className="text-sm font-semibold" style={{ color: 'var(--brand-ink)' }}>
          {session ? `Active Session: ${session.name}` : 'No active session'}
        </span>
        {session && (
          <span className="text-xs" style={{ color: 'var(--muted)' }}>
            {session.start_date} → {session.end_date}
          </span>
        )}
      </div>
      {action}
    </div>
  )
}
