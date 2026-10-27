'use client'

import { useActionState } from 'react'
import { Spinner } from '@/components/spinner'
import { dispatchNow } from './actions'

// "Send now" -- drain the queue without waiting for the cron run.
//
// Harmless to double-click: whatsapp_claim_batch() claims rows under SKIP
// LOCKED, so a second run picks up nothing the first one is already holding.
// That property is why this button can exist at all.
export default function DispatchButton({ queued }) {
  const [state, formAction, pending] = useActionState(dispatchNow, {})

  return (
    <form action={formAction} className="flex items-center gap-2">
      <button type="submit" disabled={pending} className="btn btn-ghost">
        {pending ? (
          <>
            <Spinner /> Sending…
          </>
        ) : queued ? (
          `Send ${queued} now`
        ) : (
          'Send now'
        )}
      </button>

      {state?.error && (
        <span className="text-xs" style={{ color: 'var(--red)' }}>
          {state.error}
        </span>
      )}
      {state?.ok && (
        <span className="text-xs" style={{ color: 'var(--green)' }}>
          {state.ok}
        </span>
      )}
    </form>
  )
}
