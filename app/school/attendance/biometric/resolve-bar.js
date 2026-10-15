'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Spinner } from '@/components/spinner'
import { useToast } from '@/components/toast'
import { resolveDay } from './actions'

function ResolveButton({ disabled }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending || disabled} className="btn btn-primary">
      {pending ? (
        <>
          <Spinner /> Resolving…
        </>
      ) : (
        'Resolve into register'
      )}
    </button>
  )
}

// The step that turns the raw punch log into register rows.
//
// It is a button rather than something automatic on purpose. A device can sync
// days late, a thumb can be enrolled after the fact, and the office sometimes
// needs to correct a mark by hand — so the moment of writing the register
// should be a decision somebody makes and can repeat, not a side effect of
// data arriving.
export default function ResolveBar({ date, canWrite, punchCount }) {
  const [state, formAction] = useActionState(resolveDay, {})
  const { success } = useToast()
  const [seen, setSeen] = useState(null)

  if (state?.ok && state.at !== seen) {
    setSeen(state.at)
    queueMicrotask(() => success(state.ok))
  }

  return (
    <form
      action={formAction}
      className="card flex flex-wrap items-center justify-between gap-3 p-4"
    >
      <input type="hidden" name="date" value={date} />

      <div className="min-w-0">
        <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
          Resolve {date}
        </p>
        <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
          {punchCount
            ? `Reads the day's ${punchCount} punch${punchCount === 1 ? '' : 'es'} and writes present, late or half-day. Safe to run again — anything typed by hand is left alone.`
            : 'No punches recorded for this day yet.'}
        </p>
        {state?.error && (
          <p className="mt-2 text-sm" style={{ color: 'var(--red)' }}>
            {state.error}
          </p>
        )}
      </div>

      {canWrite ? (
        <ResolveButton disabled={!punchCount} />
      ) : (
        <span className="text-xs" style={{ color: 'var(--muted-2)' }}>
          read only
        </span>
      )}
    </form>
  )
}
