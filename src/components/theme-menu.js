'use client'

import { useSyncExternalStore } from 'react'
import Menu, { MenuItem } from './menu'

// Light / Dark / System as a dropdown.
//
// "system" deliberately stamps NOTHING on <html> so prefers-color-scheme stays
// in charge. Only an explicit choice writes data-theme.
//
// localStorage is an external store, so it is read through
// useSyncExternalStore rather than an effect that calls setState -- the effect
// version re-renders twice on mount and trips react-hooks/set-state-in-effect.
const OPTIONS = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'system', label: 'System' },
]

const PATHS = {
  system: 'M4 5h16v10H4zM8 19h8M12 15v4',
  light:
    'M12 4v2M12 18v2M4 12H2M22 12h-2M6.3 6.3L4.9 4.9M19.1 19.1l-1.4-1.4M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4',
  dark: 'M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z',
}

function Glyph({ name, size = 16 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {name === 'light' && <circle cx="12" cy="12" r="4" />}
      <path d={PATHS[name]} />
    </svg>
  )
}

let listeners = []
const subscribe = (cb) => {
  listeners.push(cb)
  return () => {
    listeners = listeners.filter((l) => l !== cb)
  }
}
const emit = () => listeners.forEach((l) => l())

function getSnapshot() {
  try {
    const stored = localStorage.getItem('theme')
    return OPTIONS.some((o) => o.id === stored) ? stored : 'system'
  } catch {
    // Private windows and blocked site data both throw on access.
    return 'system'
  }
}

// The server cannot know the stored choice, so it renders the neutral one and
// React swaps after hydration.
const getServerSnapshot = () => 'system'

export default function ThemeMenu() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  function choose(next) {
    const root = document.documentElement
    if (next === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', next)
    try {
      localStorage.setItem('theme', next)
    } catch {
      // Not remembering the choice is survivable; the page still switches.
    }
    emit()
  }

  return (
    <Menu
      label="Theme"
      width={172}
      button={
        <span className="icon-btn" title={`Theme: ${theme}`}>
          <Glyph name={theme} size={17} />
        </span>
      }
    >
      {({ close }) => (
        <div className="py-1">
          <p
            className="px-3 py-1.5 text-[0.66rem] font-semibold uppercase tracking-wider"
            style={{ color: 'var(--muted-2)' }}
          >
            Theme
          </p>
          {OPTIONS.map((option) => (
            <MenuItem
              key={option.id}
              aria-checked={theme === option.id}
              icon={<Glyph name={option.id} />}
              onClick={() => {
                choose(option.id)
                close()
              }}
            >
              {option.label}
            </MenuItem>
          ))}
        </div>
      )}
    </Menu>
  )
}
