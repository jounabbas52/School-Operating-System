import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ToastProvider } from '@/components/toast'
import ThemeMenu from '@/components/theme-menu'
import PlatformMark from '@/components/platform-mark'
import { signOut } from './actions'
import AdminNav from './nav'

export const metadata = {
  title: 'Platform console',
}

// The platform role, as a sentence rather than an enum. 'read_only' told
// nobody what they could actually do.
const ROLE_LABEL = {
  owner: 'Owner',
  super_admin: 'Super Admin',
  support: 'Support',
  billing: 'Billing',
  read_only: 'Read only',
}

function initials(email) {
  const handle = (email ?? '?').split('@')[0]
  const parts = handle.split(/[._-]+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return handle.slice(0, 2).toUpperCase()
}

export default async function AdminLayout({ children }) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // The RLS policy on platform_admins only returns rows to platform admins,
  // so an empty result IS the answer. This is checked here rather than read
  // from the JWT claim because a claim can be up to an hour stale.
  const { data: admin } = await supabase
    .from('platform_admins')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!admin) {
    return (
      <div
        className="flex min-h-dvh items-center justify-center px-4"
        style={{ background: 'var(--app)' }}
      >
        <div className="card auth-rise w-full max-w-md p-8 text-center">
          <div className="mx-auto w-fit">
            <PlatformMark size={48} />
          </div>
          <h1 className="mt-5 text-base font-semibold" style={{ color: 'var(--ink)' }}>
            No platform access
          </h1>
          <p className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>
            You are signed in as{' '}
            <span className="font-medium" style={{ color: 'var(--ink-2)' }}>
              {user.email}
            </span>
            , but this account is not in{' '}
            <code
              className="rounded px-1.5 py-0.5 font-mono text-xs"
              style={{ background: 'var(--card-alt)', color: 'var(--brand-ink)' }}
            >
              platform_admins
            </code>
            . Add it in the SQL editor, then reload.
          </p>
          <div className="mt-6 flex items-center justify-center gap-2">
            <Link href="/school" className="btn btn-ghost">
              Go to school panel
            </Link>
            <form action={signOut}>
              <button className="btn btn-primary">Sign out</button>
            </form>
          </div>
        </div>
      </div>
    )
  }

  return (
    <ToastProvider>
      <div className="min-h-dvh" style={{ background: 'var(--app)' }}>
        {/* The header keeps the sidebar's dark palette in both themes, exactly
            as the school panel's does, so the two consoles read as one
            product rather than two. */}
        <header className="sticky top-0 z-30" style={{ background: 'var(--side)' }}>
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-3">
            <div className="flex items-center gap-3">
              <Link href="/admin" className="flex items-center gap-3">
                <PlatformMark size={36} radius="0.7rem" glow={false} />
                <span className="min-w-0">
                  <span className="block text-[0.9rem] font-semibold leading-tight text-white">
                    School OS
                  </span>
                  <span
                    className="block text-[0.6rem] font-semibold uppercase tracking-[0.18em]"
                    style={{ color: 'var(--side-dim)' }}
                  >
                    Platform Console
                  </span>
                </span>
              </Link>
            </div>

            <AdminNav />

            <div className="flex items-center gap-2">
              <span
                className="hidden rounded-full px-2.5 py-1 text-[0.62rem] font-semibold uppercase tracking-wider sm:inline-flex"
                style={{
                  background: 'rgb(255 255 255 / 0.06)',
                  border: '1px solid rgb(255 255 255 / 0.1)',
                  color: '#c4b5fd',
                }}
              >
                {ROLE_LABEL[admin.role] ?? admin.role}
              </span>

              <ThemeMenu tone="invert" />

              <div className="flex items-center gap-2 pl-1">
                <span
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg text-[0.65rem] font-semibold text-white"
                  style={{ background: 'var(--brand-grad)' }}
                  aria-hidden="true"
                >
                  {initials(user.email)}
                </span>
                <span className="hidden min-w-0 lg:block">
                  <span className="block truncate text-[0.76rem] font-medium text-white">
                    {user.email}
                  </span>
                  <form action={signOut}>
                    <button
                      className="text-[0.68rem] transition hover:text-white"
                      style={{ color: 'var(--side-dim)' }}
                    >
                      Sign out
                    </button>
                  </form>
                </span>
              </div>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-6 py-7">{children}</main>
      </div>
    </ToastProvider>
  )
}
