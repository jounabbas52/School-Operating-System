'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import Menu, { MenuDivider, MenuItem } from './menu'
import ThemeMenu from './theme-menu'

function Icon({ d, size = 17, children }) {
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
      {children}
      {d && <path d={d} />}
    </svg>
  )
}

export function initials(name, email) {
  const source = (name || email || '?').trim()
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return source.slice(0, 2).toUpperCase()
}

/* ------------------------------------------------------------------ search */
// Submits to the students screen. That screen does not exist yet, so the
// button is disabled and says so rather than sending anyone to a 404 -- it
// switches on when the Students module is built.
export function TopSearch({ enabled = false }) {
  const router = useRouter()
  const inputRef = useRef(null)
  const [value, setValue] = useState('')

  useEffect(() => {
    function onKey(event) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        inputRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  function onSubmit(event) {
    event.preventDefault()
    const q = value.trim()
    if (!enabled || !q) return
    router.push(`/school/students?q=${encodeURIComponent(q)}`)
  }

  return (
    <form onSubmit={onSubmit} className="relative hidden max-w-sm flex-1 md:block">
      <span
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
        style={{ color: 'var(--muted-2)' }}
      >
        <Icon size={15}>
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" />
        </Icon>
      </span>

      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={enabled ? 'Search students, teachers…' : 'Search — available once Students is built'}
        aria-label="Search"
        className="field !rounded-full !pl-9 !pr-16"
        style={{ background: 'var(--card-alt)' }}
      />

      <kbd
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded px-1.5 py-0.5 font-mono text-[0.62rem]"
        style={{ background: 'var(--card)', color: 'var(--muted-2)', border: '1px solid var(--border)' }}
      >
        Ctrl K
      </kbd>
    </form>
  )
}

/* ----------------------------------------------------------- notifications */
export function Notifications({ items = [] }) {
  const unread = items.filter((n) => !n.read_at).length

  return (
    <Menu
      label="Notifications"
      width={288}
      button={
        <span className="icon-btn relative" title="Notifications">
          <Icon>
            <path d="M18 8a6 6 0 10-12 0c0 7-3 8-3 8h18s-3-1-3-8" />
            <path d="M13.7 21a2 2 0 01-3.4 0" />
          </Icon>
          {unread > 0 && (
            <span
              className="absolute right-1.5 top-1.5 flex min-w-[1rem] items-center justify-center rounded-full px-1 text-[0.58rem] font-bold text-white"
              style={{ background: 'var(--red)' }}
            >
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </span>
      }
    >
      {() => (
        <div>
          <div className="px-3 py-2.5" style={{ borderBottom: '1px solid var(--border)' }}>
            <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
              Notifications
            </p>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              {unread ? `${unread} unread` : 'Nothing new'}
            </p>
          </div>

          {items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm" style={{ color: 'var(--muted)' }}>
              No notifications yet.
            </p>
          ) : (
            <ul className="max-h-72 overflow-y-auto py-1">
              {items.slice(0, 8).map((n) => (
                <li key={n.id} className="px-3 py-2" style={{ borderTop: '1px solid var(--border-soft)' }}>
                  <p className="text-sm" style={{ color: 'var(--ink)' }}>
                    {n.title}
                  </p>
                  {n.body && (
                    <p className="text-xs" style={{ color: 'var(--muted)' }}>
                      {n.body}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Menu>
  )
}

/* --------------------------------------------------------------- user menu */
export function UserMenu({ name, email, role, signOutAction, settingsHref }) {
  return (
    <Menu
      label="Account"
      width={248}
      button={
        <span className="flex items-center gap-2 rounded-lg px-1.5 py-1 transition hover:bg-[var(--card-hover)]">
          <span
            className="flex size-8 items-center justify-center rounded-full text-[0.7rem] font-semibold text-white"
            style={{ background: 'var(--brand-grad)' }}
            aria-hidden="true"
          >
            {initials(name, email)}
          </span>
          <span className="hidden text-left sm:block">
            <span className="block text-[0.78rem] font-semibold leading-tight" style={{ color: 'var(--ink)' }}>
              {name || email}
            </span>
            <span className="block text-[0.66rem]" style={{ color: 'var(--muted)' }}>
              {role}
            </span>
          </span>
          <Icon d="M6 9l6 6 6-6" size={13} />
        </span>
      }
    >
      {({ close }) => (
        <div className="py-1">
          <div className="px-3 pb-2.5 pt-1.5" style={{ borderBottom: '1px solid var(--border)' }}>
            <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
              {name || 'Account'}
            </p>
            <p className="truncate text-xs" style={{ color: 'var(--muted)' }}>
              {email}
            </p>
          </div>

          <div className="pt-1">
            <MenuItem
              as={Link}
              href={settingsHref ?? '#'}
              onClick={close}
              icon={
                <Icon size={15}>
                  <circle cx="12" cy="8" r="3.5" />
                  <path d="M5 20a7 7 0 0114 0" />
                </Icon>
              }
            >
              Profile
            </MenuItem>

            <MenuItem
              as={Link}
              href={settingsHref ?? '#'}
              onClick={close}
              icon={
                <Icon size={15}>
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-1.8-.3 1.6 1.6 0 00-1 1.5V21a2 2 0 11-4 0v-.1A1.6 1.6 0 008 19.4a1.6 1.6 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1H2a2 2 0 110-4h.1A1.6 1.6 0 003.6 8a1.6 1.6 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 001.8.3H8a1.6 1.6 0 001-1.5V2a2 2 0 114 0v.1a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8V8a1.6 1.6 0 001.5 1H22a2 2 0 110 4h-.1a1.6 1.6 0 00-1.5 1z" />
                </Icon>
              }
            >
              Settings
            </MenuItem>
          </div>

          <MenuDivider />

          <form action={signOutAction}>
            <button type="submit" role="menuitem" className="menu-item" style={{ color: 'var(--red)' }}>
              <span aria-hidden="true">
                <Icon size={15}>
                  <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
                </Icon>
              </span>
              <span className="flex-1 text-left">Logout</span>
            </button>
          </form>
        </div>
      )}
    </Menu>
  )
}

export { ThemeMenu }
