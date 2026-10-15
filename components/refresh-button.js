'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Spinner } from './spinner'

// Re-fetch the current screen's server data without a full page load.
//
// Every list here is a server component reading Supabase, so the only way a
// user sees someone else's change is to navigate away and back. router.refresh()
// re-runs the server render and swaps the result in, keeping scroll position,
// open panels and form state.
//
// The transition is what makes the spinner honest: refresh() resolves when the
// request is sent, not when the new tree is painted, so a plain await would
// stop spinning a beat too early.
export default function RefreshButton({
  label = 'Refresh',
  className = 'btn btn-ghost',
  title = 'Reload this screen',
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  // Held for a moment after the transition ends so a fast refresh still reads
  // as something having happened, rather than a button that flickered.
  const [done, setDone] = useState(false)

  function refresh() {
    setDone(false)
    startTransition(() => {
      router.refresh()
      setDone(true)
    })
  }

  return (
    <button
      type="button"
      onClick={refresh}
      disabled={pending}
      title={title}
      aria-label={label}
      className={className}
    >
      {pending ? (
        <>
          <Spinner /> Refreshing…
        </>
      ) : (
        <>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className={done ? 'transition-transform duration-500' : ''}
          >
            <path d="M21 12a9 9 0 11-3-6.7M21 3v6h-6" />
          </svg>
          {label}
        </>
      )}
    </button>
  )
}
