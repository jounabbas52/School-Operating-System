'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// The console's own nav. Two destinations today, but it sits in the header as
// a real tab strip rather than a lone title, because the header is where a
// person looks to answer "where am I and where else can I go" -- and the old
// one answered neither.
const ITEMS = [
  { href: '/admin', label: 'Schools', exact: true },
  { href: '/admin/modules', label: 'Modules & Plans' },
]

export default function AdminNav() {
  const pathname = usePathname()

  const isActive = (item) =>
    item.exact
      ? pathname === item.href || pathname.startsWith('/admin/schools')
      : pathname === item.href || pathname.startsWith(`${item.href}/`)

  return (
    <nav className="flex items-center gap-1">
      {ITEMS.map((item) => {
        const on = isActive(item)
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={on ? 'page' : undefined}
            className="rounded-lg px-3 py-1.5 text-[0.8rem] font-medium transition"
            style={{
              background: on ? 'rgb(255 255 255 / 0.1)' : 'transparent',
              color: on ? '#fff' : 'var(--side-text)',
            }}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
