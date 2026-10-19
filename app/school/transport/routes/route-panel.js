'use client'

import { useActionState, useState } from 'react'
import { Spinner } from '@/components/spinner'
import SidePanel from '@/components/side-panel'
import { useCloseOnSuccess } from '@/components/use-close-on-success'
import { Select } from '@/components/combobox'
import { ROUTE_STATUSES } from '@/lib/operations-options'
import { saveRoute } from '../actions'

function SaveButton({ editing, pending }) {
  return (
    <button type="submit" form="route-form" disabled={pending} className="btn btn-primary">
      {pending ? (
        <>
          <Spinner /> Saving…
        </>
      ) : editing ? (
        'Save changes'
      ) : (
        'Create Route'
      )}
    </button>
  )
}

// The stops list is ORDERED -- that order is the route. Each stop emits its
// own hidden input, so the server reads them with getAll() in the order they
// appear, with no JSON blob to parse.
function Stops({ initial }) {
  const [stops, setStops] = useState(initial ?? [])
  const [draft, setDraft] = useState('')

  function add() {
    const value = draft.trim()
    if (!value) return
    setStops((current) => [...current, value])
    setDraft('')
  }

  function remove(index) {
    setStops((current) => current.filter((_, i) => i !== index))
  }

  function move(index, delta) {
    setStops((current) => {
      const next = [...current]
      const target = index + delta
      if (target < 0 || target >= next.length) return current
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="label !mb-0">Route Stops</span>
        <span className="text-xs" style={{ color: 'var(--muted)' }}>
          {stops.length} added
        </span>
      </div>

      {stops.length > 0 && (
        <ul className="mb-2 flex flex-col gap-1.5">
          {stops.map((stop, i) => (
            <li key={`${stop}-${i}`} className="flex items-center gap-2">
              <input type="hidden" name="stop" value={stop} />
              <span
                className="flex size-6 shrink-0 items-center justify-center rounded-full text-[0.65rem] font-bold"
                style={{ background: 'var(--brand-soft)', color: 'var(--brand-ink)' }}
                aria-hidden="true"
              >
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm" style={{ color: 'var(--ink)' }}>
                {stop}
              </span>
              <button
                type="button"
                onClick={() => move(i, -1)}
                disabled={i === 0}
                aria-label={`Move ${stop} up`}
                className="btn btn-ghost !px-2 !py-1"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => move(i, 1)}
                disabled={i === stops.length - 1}
                aria-label={`Move ${stop} down`}
                className="btn btn-ghost !px-2 !py-1"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => remove(i)}
                aria-label={`Remove ${stop}`}
                className="btn btn-danger !px-2 !py-1"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter adds a stop rather than submitting the whole form, which
            // is what it would otherwise do inside a form with one text field.
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
          placeholder="Stop name, press Enter"
          aria-label="New stop"
          className="field flex-1"
        />
        <button type="button" onClick={add} className="btn btn-ghost">
          + Add
        </button>
      </div>

      {!stops.length && (
        <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
          No stops added yet. The first and last become the route&rsquo;s start and end points.
        </p>
      )}
    </div>
  )
}

export default function RoutePanel({ row, vehicles, trigger }) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState(saveRoute, {})
  useCloseOnSuccess(state, () => setOpen(false))

  const editing = Boolean(row)

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={trigger.className}>
        {trigger.label}
      </button>

      <SidePanel
        open={open}
        busy={pending}
        onClose={() => setOpen(false)}
        title={editing ? `Edit ${row.name}` : 'Add New Route'}
        description="Create a new transport route"
        icon="⇄"
        footer={
          <>
            <button type="button" onClick={() => setOpen(false)} disabled={pending} className="btn btn-ghost">
              Cancel
            </button>
            <SaveButton pending={pending} editing={editing} />
          </>
        }
      >
        <form id="route-form" action={formAction} className="flex flex-col gap-4">
          {editing && <input type="hidden" name="id" value={row.id} />}

          <div>
            <label className="label" htmlFor="rt-name">
              Route Name *
            </label>
            <input
              id="rt-name"
              name="name"
              required
              defaultValue={row?.name ?? ''}
              placeholder="e.g. North Campus Route"
              className="field"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="rt-area">
                Area / Coverage
              </label>
              <input
                id="rt-area"
                name="area"
                defaultValue={row?.area ?? ''}
                placeholder="e.g. Model Town"
                className="field"
              />
            </div>
            <div>
              <label className="label" htmlFor="rt-vehicle">
                Assigned Vehicle
              </label>
              <Select
                id="rt-vehicle"
                name="vehicle_id"
                defaultValue={row?.vehicle_id ?? ''}
                placeholder="Bus No. / Reg. No."
                options={vehicles}
                emptyLabel="No vehicles registered yet."
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="rt-driver">
                Driver Name
              </label>
              <input
                id="rt-driver"
                name="driver_name"
                defaultValue={row?.driver_name ?? ''}
                placeholder="Full name"
                className="field"
              />
            </div>
            <div>
              <label className="label" htmlFor="rt-phone">
                Driver Phone
              </label>
              <input
                id="rt-phone"
                name="driver_phone"
                defaultValue={row?.driver_phone ?? ''}
                placeholder="03XX-XXXXXXX"
                className="field"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="rt-fare">
                Default monthly fare
              </label>
              <input
                id="rt-fare"
                name="fare"
                type="number"
                min="0"
                defaultValue={row?.fare ?? ''}
                placeholder="Rs 0"
                className="field"
              />
              <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                A student&rsquo;s own fee overrides this.
              </p>
            </div>
            <div>
              <label className="label" htmlFor="rt-status">
                Status
              </label>
              <Select
                id="rt-status"
                name="status"
                defaultValue={row?.status ?? 'active'}
                options={ROUTE_STATUSES.map((s) => ({ id: s.id, label: s.label }))}
              />
            </div>
          </div>

          <div className="border-t pt-4" style={{ borderColor: 'var(--border)' }}>
            <Stops initial={row?.stops ?? []} />
          </div>

          {state?.error && (
            <p
              className="rounded-lg px-3 py-2 text-sm"
              style={{ background: 'var(--red-soft)', color: 'var(--red)' }}
            >
              {state.error}
            </p>
          )}
        </form>
      </SidePanel>
    </>
  )
}
