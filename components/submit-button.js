'use client'

import { useFormStatus } from 'react-dom'
import { Spinner } from './spinner'

// Submit buttons that cannot be pressed twice.
//
// THE BUG THIS EXISTS TO FIX
//
// Every slide-over in the app put its save button in SidePanel's `footer`
// prop, which renders as a SIBLING of `children` -- and the <form> lives
// inside children. useFormStatus() only reports on a PARENT form, so in all
// of those panels `pending` was permanently false: the spinner never showed,
// the button never disabled, and a double-click submitted twice.
//
// Hence two components, because there are two situations and only one of them
// can use useFormStatus:
//
//   PanelButton   the button is OUTSIDE its form (a panel footer). Pending has
//                 to be handed in, from useActionState's third value.
//   SubmitButton  the button is INSIDE its form (an inline action form).
//                 useFormStatus works, so it reads its own state.

/* ------------------------------------------- inside the form: self-aware */

// For <form action={serverAction}><SubmitButton>Save</SubmitButton></form>.
// Disabling while pending IS the double-submit guard: React flips pending in
// the same commit that starts the action, and a disabled button fires no
// click.
//
// pendingLabel={null} keeps the children and only disables. That is for
// buttons whose label IS their shape -- a toggle switch, an arrow, a status
// pill -- where swapping in a spinner and a word would resize the row.
export default function SubmitButton({
  children,
  pendingLabel = 'Saving…',
  className = 'btn btn-primary',
  disabled,
  style,
  ...rest
}) {
  const { pending } = useFormStatus()
  const showSpinner = pending && pendingLabel !== null

  return (
    <button
      type="submit"
      disabled={pending || disabled}
      aria-busy={pending || undefined}
      className={className}
      // A silent button needs some sign it was heard, and dimming is the one
      // that does not change its size.
      style={pending && !showSpinner ? { ...style, opacity: 0.55 } : style}
      {...rest}
    >
      {showSpinner ? (
        <>
          <Spinner /> {pendingLabel}
        </>
      ) : (
        children
      )}
    </button>
  )
}

/* ---------------------------------------- outside the form: pending given */

// For a SidePanel footer. `pending` comes from the panel's
// `const [state, action, pending] = useActionState(...)`, which is accurate
// wherever the button happens to be rendered.
export function PanelButton({
  children,
  pending,
  pendingLabel = 'Saving…',
  className = 'btn btn-primary',
  form,
  disabled,
  ...rest
}) {
  return (
    <button
      type="submit"
      form={form}
      disabled={pending || disabled}
      aria-busy={pending || undefined}
      className={className}
      {...rest}
    >
      {pending ? (
        <>
          <Spinner /> {pendingLabel}
        </>
      ) : (
        children
      )}
    </button>
  )
}

// Cancel, disabled while a save is in flight.
//
// Closing mid-save would unmount the panel while its action is still running:
// the write still lands, but useCloseOnSuccess never fires, so no toast and
// no refreshed list -- the user is left believing it failed.
export function PanelCancel({ onClick, pending, children = 'Cancel' }) {
  return (
    <button type="button" onClick={onClick} disabled={pending} className="btn btn-ghost">
      {children}
    </button>
  )
}
