import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { signOut } from './actions'

export const metadata = {
  title: 'Platform console',
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
      <div className="flex min-h-dvh items-center justify-center bg-zinc-50 px-4 dark:bg-zinc-950">
        <div className="max-w-md text-center">
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            No platform access
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            You are signed in as {user.email}, but this account is not in{' '}
            <code className="rounded bg-zinc-200 px-1 py-0.5 text-xs dark:bg-zinc-800">
              platform_admins
            </code>
            . Add it in the SQL editor, then reload.
          </p>
          <form action={signOut} className="mt-6">
            <button className="text-sm font-medium text-emerald-700 underline underline-offset-4 dark:text-emerald-400">
              Sign out
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-baseline gap-3">
            <Link
              href="/admin"
              className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
            >
              Platform console
            </Link>
            <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-mono text-[0.65rem] uppercase tracking-wider text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
              {admin.role}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">{user.email}</span>
            <form action={signOut}>
              <button className="text-xs font-medium text-zinc-600 underline underline-offset-4 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  )
}
