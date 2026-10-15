// The Appearance block from settings, turned into something the app can use.
//
// Saving these was always wired; reading them was not. The block lives in
// settings.value under key 'appearance' and is loaded once per request by
// getSchoolContext(), so everything below takes plain values rather than
// reaching for the database itself.

export const DEFAULT_APPEARANCE = {
  color_theme: 'violet',
  sidebar_style: 'dark',
  language: 'en',
  date_format: 'DD/MM/YYYY',
  timezone: 'Asia/Karachi',
}

/* ------------------------------------------------------------------ palette */

// Each palette carries a full light and dark set, hand-picked rather than
// derived. A single hue spun through a formula gives you a --brand-soft that
// is either invisible on white or glaring on near-black; the soft/ink pairs
// below are the ones that stay legible in both themes.
//
// --ring is not listed because globals.css builds it with color-mix() from
// --brand, so it follows whatever lands here.
export const PALETTES = {
  violet: {
    label: 'Violet',
    swatch: '#7c3aed',
    light: {
      brand: '#7c3aed',
      brand600: '#6d28d9',
      brand700: '#5b21b6',
      brandSoft: '#f1ebfe',
      brandInk: '#6d28d9',
      grad: 'linear-gradient(135deg, #7c3aed 0%, #6366f1 100%)',
    },
    dark: {
      brand: '#8b5cf6',
      brand600: '#7c3aed',
      brand700: '#6d28d9',
      brandSoft: '#241a45',
      brandInk: '#c4b5fd',
      grad: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
    },
  },
  blue: {
    label: 'Blue',
    swatch: '#2563eb',
    light: {
      brand: '#2563eb',
      brand600: '#1d4ed8',
      brand700: '#1e40af',
      brandSoft: '#e6eefc',
      brandInk: '#1d4ed8',
      grad: 'linear-gradient(135deg, #2563eb 0%, #0ea5e9 100%)',
    },
    dark: {
      brand: '#3b82f6',
      brand600: '#2563eb',
      brand700: '#1d4ed8',
      brandSoft: '#14243f',
      brandInk: '#93c5fd',
      grad: 'linear-gradient(135deg, #3b82f6 0%, #0ea5e9 100%)',
    },
  },
  emerald: {
    label: 'Emerald',
    swatch: '#059669',
    light: {
      brand: '#059669',
      brand600: '#047857',
      brand700: '#065f46',
      brandSoft: '#e3f7ef',
      brandInk: '#047857',
      grad: 'linear-gradient(135deg, #059669 0%, #14b8a6 100%)',
    },
    dark: {
      brand: '#10b981',
      brand600: '#059669',
      brand700: '#047857',
      brandSoft: '#0d2c26',
      brandInk: '#6ee7b7',
      grad: 'linear-gradient(135deg, #10b981 0%, #14b8a6 100%)',
    },
  },
  indigo: {
    label: 'Indigo',
    swatch: '#4f46e5',
    light: {
      brand: '#4f46e5',
      brand600: '#4338ca',
      brand700: '#3730a3',
      brandSoft: '#ebeafd',
      brandInk: '#4338ca',
      grad: 'linear-gradient(135deg, #4f46e5 0%, #818cf8 100%)',
    },
    dark: {
      brand: '#6366f1',
      brand600: '#4f46e5',
      brand700: '#4338ca',
      brandSoft: '#1e1b4b',
      brandInk: '#a5b4fc',
      grad: 'linear-gradient(135deg, #6366f1 0%, #818cf8 100%)',
    },
  },
}

const vars = (set) =>
  `--brand:${set.brand};--brand-600:${set.brand600};--brand-700:${set.brand700};` +
  `--brand-soft:${set.brandSoft};--brand-ink:${set.brandInk};--brand-grad:${set.grad};`

/**
 * The school's palette as a stylesheet, emitted by the school layout.
 *
 * A <style> block rather than a data-palette attribute on <html>, for two
 * reasons. Only the root layout can write attributes on <html>, and it has no
 * idea which school is being viewed. And the toast stack portals to
 * document.body, outside any wrapper a nested layout could put the attribute
 * on -- scoping to a wrapper would leave portalled UI on the old colour.
 *
 * The three selectors mirror globals.css exactly, because the theme has three
 * states: bare :root is light, and dark arrives either through the media
 * query or through an explicit data-theme. Miss one and the palette applies in
 * two states out of three. Specificity is identical to the rules being
 * overridden, so this wins purely on document order -- which holds because a
 * <style> in <body> always comes after the stylesheet in <head>.
 */
export function paletteCss(id) {
  const p = PALETTES[id] ?? PALETTES[DEFAULT_APPEARANCE.color_theme]
  return (
    `:root{${vars(p.light)}}` +
    `@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){${vars(p.dark)}}}` +
    `:root[data-theme="dark"]{${vars(p.dark)}}`
  )
}

/* --------------------------------------------------------------- formatting */

// An unknown zone makes Intl throw RangeError, which on a server component
// means the whole page 500s over a settings typo. Everything below falls back
// rather than throwing.
function safeZone(timeZone) {
  if (!timeZone) return undefined
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone }).format(new Date())
    return timeZone
  } catch {
    return undefined
  }
}

/**
 * "Wednesday, 14 October 2026" in the school's zone.
 *
 * The zone is the point. Rendered on a server in UTC, a school in Asia/Karachi
 * sees yesterday's date for the first five hours of every day -- the dashboard
 * greets staff with the wrong day before lunch. date_format does not apply
 * here: it describes a numeric order, and this is long form.
 */
export function formatLongDate(date, { timezone } = {}) {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: safeZone(timezone),
  }).format(date)
}

/**
 * A numeric date in the school's chosen order and zone.
 *
 * Built from formatToParts rather than a locale string: 'en-GB' would give
 * DD/MM and 'en-US' MM/DD, but YYYY-MM-DD belongs to neither, and picking a
 * locale per format means inheriting its separators too.
 *
 * Accepts a Date, an ISO string, or null -- list cells pass straight from the
 * database, where the column is frequently empty.
 */
export function formatDate(value, { format, timezone } = {}) {
  if (!value) return '—'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '—'

  const parts = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: safeZone(timezone),
  }).formatToParts(date)

  const at = (type) => parts.find((p) => p.type === type)?.value ?? ''
  const d = at('day')
  const m = at('month')
  const y = at('year')

  if (format === 'MM/DD/YYYY') return `${m}/${d}/${y}`
  if (format === 'YYYY-MM-DD') return `${y}-${m}-${d}`
  return `${d}/${m}/${y}`
}
