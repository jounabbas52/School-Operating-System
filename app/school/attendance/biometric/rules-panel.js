'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Spinner } from '@/components/spinner'
import SidePanel from '@/components/side-panel'
import { useCloseOnSuccess } from '@/components/use-close-on-success'
import { saveAttendanceSettings } from './actions'

function SaveButton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" form="rules-form" disabled={pending} className="btn btn-primary">
      {pending ? (
        <>
          <Spinner /> Saving…
        </>
      ) : (
        'Save rules'
      )}
    </button>
  )
}

// What a punch MEANS. These four numbers decide whether 08:01 is late and
// whether a double-tap is two events, so they belong in front of the person
// who knows the school's bell — not buried in the resolver.
export default function RulesPanel({ settings, canWrite, trigger }) {
  const [open, setOpen] = useState(false)
  const [state, formAction] = useActionState(saveAttendanceSettings, {})
  useCloseOnSuccess(state, () => setOpen(false))

  const [late, setLate] = useState(settings?.late_after ?? '08:00')
  const [half, setHalf] = useState(settings?.half_day_after ?? '10:30')

  // Caught here as well as in the action, so the mistake is visible while
  // it is being made rather than after a submit.
  const orderWrong = Boolean(late && half && half <= late)

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={trigger.className}>
        {trigger.label}
      </button>

      <SidePanel
        open={open}
        onClose={() => setOpen(false)}
        title="Attendance rules"
        description="What the clock on a punch means"
        icon="◷"
        footer={
          <>
            <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost">
              Cancel
            </button>
            {canWrite && <SaveButton />}
          </>
        }
      >
        <form id="rules-form" action={formAction} className="flex flex-col gap-4">
          <fieldset disabled={!canWrite} className="contents">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="ru-late">
                  Late after
                </label>
                <input
                  id="ru-late"
                  name="late_after"
                  type="time"
                  value={late}
                  onChange={(e) => setLate(e.target.value)}
                  className="field"
                />
                <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                  A first punch after this is marked late.
                </p>
              </div>
              <div>
                <label className="label" htmlFor="ru-half">
                  Half day after
                </label>
                <input
                  id="ru-half"
                  name="half_day_after"
                  type="time"
                  value={half}
                  onChange={(e) => setHalf(e.target.value)}
                  className="field"
                />
                <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                  Arriving this late counts as half a day.
                </p>
              </div>
            </div>

            {orderWrong && (
              <p
                className="rounded-lg px-3 py-2 text-sm"
                style={{ background: 'var(--amber-soft)', color: 'var(--amber-ink)' }}
              >
                The half-day cut-off is earlier than the late cut-off, which would make every late
                arrival a half day.
              </p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="ru-gap">
                  Debounce gap <span style={{ color: 'var(--muted-2)' }}>· minutes</span>
                </label>
                <input
                  id="ru-gap"
                  name="min_punch_gap_minutes"
                  type="number"
                  min="0"
                  max="120"
                  defaultValue={settings?.min_punch_gap_minutes ?? 5}
                  className="field"
                />
                <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                  A thumb pressed twice inside this window is one arrival, not two.
                </p>
              </div>
              <div>
                <label className="label" htmlFor="ru-session">
                  Minimum stay <span style={{ color: 'var(--muted-2)' }}>· minutes</span>
                </label>
                <input
                  id="ru-session"
                  name="min_session_minutes"
                  type="number"
                  min="0"
                  defaultValue={settings?.min_session_minutes ?? 60}
                  className="field"
                />
                <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                  Below this, a second punch reads as a re-entry rather than leaving.
                </p>
              </div>
            </div>

            <label
              className="flex cursor-pointer items-start gap-2.5 rounded-xl p-3.5"
              style={{ background: 'var(--card-alt)', border: '1px solid var(--border-soft)' }}
            >
              <input
                type="checkbox"
                name="auto_absent"
                defaultChecked={settings?.auto_absent ?? false}
                className="mt-0.5 size-4 shrink-0 cursor-pointer rounded"
                style={{ accentColor: 'var(--brand)' }}
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium" style={{ color: 'var(--ink-2)' }}>
                  Mark unpunched people absent
                </span>
                <span className="block text-xs" style={{ color: 'var(--muted)' }}>
                  Off by default, and worth leaving off until the gate is proven. A device that was
                  unplugged all morning would otherwise mark the entire school absent — a far worse
                  outcome than a blank register somebody fills in.
                </span>
              </span>
            </label>

            {state?.error && (
              <p
                className="rounded-lg px-3 py-2 text-sm"
                style={{ background: 'var(--red-soft)', color: 'var(--red)' }}
              >
                {state.error}
              </p>
            )}

            {!canWrite && (
              <p className="text-sm" style={{ color: 'var(--muted)' }}>
                Read-only — changing these needs the Attendance write permission.
              </p>
            )}
          </fieldset>
        </form>
      </SidePanel>
    </>
  )
}
