'use client'

import { useState } from 'react'
import { useToast } from './toast'

// Close a slide-over once its server action reports success, and raise a
// toast saying what happened.
//
// The obvious version is a useEffect that calls setOpen(false) when state.ok
// appears, but setting state inside an effect triggers a second render pass
// every time. Adjusting state during render is the pattern React documents
// for exactly this.
//
// The comparison is on `at`, a timestamp the action stamps on every success,
// not on the message. Saving the same record twice produces the same message
// and would otherwise look like nothing had happened.
export function useCloseOnSuccess(state, close) {
  const [seen, setSeen] = useState(null)
  const { success } = useToast()

  if (state?.ok && state.at !== seen) {
    setSeen(state.at)
    close()
    // Queued rather than called during render: firing another component's
    // setState mid-render would warn.
    queueMicrotask(() => success(state.ok))
  }
}
