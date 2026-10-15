'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

const ICONS = {
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  layers: 'M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 17l9 5 9-5',
  users: 'M17 20v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9.5 8a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM22 20v-2a4 4 0 00-3-3.87',
  user: 'M19 20v-2a4 4 0 00-4-4H9a4 4 0 00-4 4v2M12 10a4 4 0 100-8 4 4 0 000 8z',
  check: 'M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11',
  clipboard: 'M9 4h6v3H9zM7 4H5v16h14V4h-2M9 12h6M9 16h4',
  award: 'M12 15a6 6 0 100-12 6 6 0 000 12zM8.5 13.5L7 22l5-3 5 3-1.5-8.5',
  rupee: 'M6 3h12M6 8h12M15 3c0 5-3 5-9 5l9 8',
  wallet: 'M3 7h16a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7zM3 7l2-3h12M17 13h.01',
  bus: 'M4 6h16v9H4zM4 15v3h3v-3M17 15v3h3v-3M4 10h16M8 6v4M16 6v4',
  book: 'M4 4h11a3 3 0 013 3v13H7a3 3 0 01-3-3V4zM4 17a3 3 0 013-3h11',
  phone: 'M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3 19.5 19.5 0 01-6-6A19.8 19.8 0 012 4.2 2 2 0 014 2h3a2 2 0 012 1.7c.1.9.4 1.8.7 2.6a2 2 0 01-.5 2.1L8.1 9.6a16 16 0 006 6l1.2-1.1a2 2 0 012.1-.5c.8.3 1.7.6 2.6.7A2 2 0 0122 16.9z',
  inbox: 'M22 12h-6l-2 3h-4l-2-3H2M5.5 5h13l3.5 7v6a2 2 0 01-2 2H4a2 2 0 01-2-2v-6L5.5 5z',
  chart: 'M3 3v18h18M7 15v3M12 9v9M17 5v13',
  shield: 'M12 2l8 4v6c0 5-3.4 8.7-8 10-4.6-1.3-8-5-8-10V6l8-4z',
  cog: 'M12 15.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.5v.2a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.6 1.7 1.7 0 00-1.9.4l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1A1.7 1.7 0 004.7 9a1.7 1.7 0 00-.4-1.9l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.9.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.9V9a1.7 1.7 0 001.5 1h.2a2 2 0 110 4h-.1a1.7 1.7 0 00-1.6 1z',
  activity: 'M22 12h-4l-3 9L9 3l-3 9H2',
}

function Icon({ name }) {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d={ICONS[name] ?? ICONS.grid} />
    </svg>
  )
}

function matches(pathname, href) {
  if (href === '/school') return pathname === '/school'
  return pathname === href || pathname.startsWith(href + '/')
}

// Only the most specific matching link is active. Active Students lives at
// /school/students and every sibling hangs off that same path, so a plain
// prefix test lit Active Students up alongside Certificates, Promotion and the
// rest. Longest match wins, which still keeps Active Students selected on a
// student detail page under /school/students/<id>.
function activeHref(items, pathname) {
  let best = null
  for (const item of items) {
    for (const entry of item.children ?? [item]) {
      if (!entry.href || !matches(pathname, entry.href)) continue
      if (!best || entry.href.length > best.length) best = entry.href
    }
  }
  return best
}

// Which group, if any, owns the current page.
function groupFor(items, current) {
  const match = items.find((item) => item.children?.some((child) => child.href === current))
  return match ? [match.label] : []
}

export default function Nav({ items }) {
  const pathname = usePathname()
  const current = activeHref(items, pathname)
  const [openGroups, setOpenGroups] = useState(() => groupFor(items, current))
  const [lastPath, setLastPath] = useState(pathname)

  // Re-sync when the route changes. The initial state ran once on mount, so
  // navigating from Classes to Dashboard left System Setup hanging open with
  // nothing in it selected. Adjusting state during render is React's
  // documented pattern for deriving from a prop change -- an effect here
  // would render the stale list first and then correct it.
  if (pathname !== lastPath) {
    setLastPath(pathname)
    setOpenGroups(groupFor(items, current))
  }

  // Accordion: opening one group closes the others, so the sidebar cannot
  // grow past the fold with several expanded at once.
  function toggle(label) {
    setOpenGroups((groups) => (groups.includes(label) ? [] : [label]))
  }

  return (
    <nav className="flex flex-col gap-0.5 px-3 pb-6">
      {items.map((item) => {
        if (item.children) {
          const open = openGroups.includes(item.label)
          const groupActive = item.children.some((child) => child.href === current)

          return (
            <div key={item.label}>
              <button
                type="button"
                onClick={() => toggle(item.label)}
                aria-expanded={open}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[0.82rem] transition hover:bg-[var(--side-hover)] hover:text-[var(--side-strong)] ${
                  groupActive ? 'text-[var(--side-strong)]' : 'text-[var(--side-text)]'
                }`}
              >
                <Icon name={item.icon} />
                <span className="flex-1 text-left">{item.label}</span>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  className={`transition-transform ${open ? 'rotate-90' : ''}`}
                  aria-hidden="true"
                >
                  <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {open && (
                <div
                  className="mb-1 ml-[1.7rem] flex flex-col gap-0.5 pl-3"
                  style={{ borderLeft: '1px solid var(--side-border)' }}
                >
                  {item.children.map((child) => {
                    const on = child.href === current
                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        style={on ? { background: 'var(--brand-700)' } : undefined}
                        className={`rounded-md px-2.5 py-1.5 text-[0.8rem] transition ${
                          on
                            ? 'font-medium text-white'
                            : 'text-[var(--side-dim)] hover:bg-[var(--side-hover)] hover:text-[var(--side-strong)]'
                        }`}
                      >
                        {child.label}
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          )
        }

        const active = item.href === current

        // Enabled for the school but no screen yet: shown, not linked, so the
        // sidebar stays honest about what the school is paying for.
        if (!item.built) {
          return (
            <span
              key={item.label}
              title="Enabled for your school — screen not built yet"
              style={{ color: 'var(--side-dim)' }}
              className="flex cursor-default items-center gap-2.5 rounded-lg px-3 py-2 text-[0.82rem]"
            >
              <Icon name={item.icon} />
              <span className="flex-1">{item.label}</span>
              <span
                className="size-1.5 rounded-full"
                style={{ background: 'var(--side-border)' }}
              />
            </span>
          )
        }

        return (
          <Link
            key={item.href}
            href={item.href}
            style={active ? { background: 'var(--brand-grad)' } : undefined}
            className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[0.82rem] transition hover:bg-[var(--side-hover)] hover:text-[var(--side-strong)] ${
              active ? 'font-medium text-white' : 'text-[var(--side-text)]'
            }`}
          >
            <Icon name={item.icon} />
            <span className="flex-1">{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
