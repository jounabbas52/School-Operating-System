'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Spinner } from '@/components/spinner'
import SidePanel from '@/components/side-panel'
import { useCloseOnSuccess } from '@/components/use-close-on-success'
import Combobox, { Select } from '@/components/combobox'
import { PASSENGER_STATUSES } from '@/lib/operations-options'
import { savePassenger } from '../actions'

function SaveButton({ editing }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" form="passenger-form" disabled={pending} className="btn btn-primary">
      {pending ? (
        <>
          <Spinner /> Saving…
        </>
      ) : editing ? (
        'Save changes'
      ) : (
        'Add Student'
      )}
    </button>
  )
}

export default function PassengerPanel({
  row,
  studentLabel,
  routes,
  vehicles,
  students,
  trigger,
}) {
  const [open, setOpen] = useState(false)
  const [state, formAction] = useActionState(savePassenger, {})
  useCloseOnSuccess(state, () => setOpen(false))

  const editing = Boolean(row)

  // The stop list belongs to the route, so picking a route is what makes the
  // stop field usable at all.
  const [routeId, setRouteId] = useState(row?.route_id ?? '')
  const [fee, setFee] = useState(row?.monthly_fee ?? '')
  const [feeKey, setFeeKey] = useState(0)

  const route = routes.find((r) => String(r.id) === String(routeId))
  const stopOptions = (route?.stops ?? []).map((s) => ({ id: s, label: s }))

  function chooseRoute(id) {
    setRouteId(id)
    const picked = routes.find((r) => String(r.id) === String(id))
    // The route's fare is the default, not a lock: a sibling discount is typed
    // over it.
    if (picked?.fare > 0 && !String(fee).trim()) {
      setFee(String(picked.fare))
      setFeeKey((k) => k + 1)
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={trigger.className}>
        {trigger.label}
      </button>

      <SidePanel
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Edit ${studentLabel}` : 'Add Transport Student'}
        description="Register a student for transport service"
        icon="◉"
        footer={
          <>
            <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost">
              Cancel
            </button>
            <SaveButton editing={editing} />
          </>
        }
      >
        <form id="passenger-form" action={formAction} className="flex flex-col gap-4">
          {editing && (
            <>
              <input type="hidden" name="id" value={row.id} />
              <input type="hidden" name="student_id" value={row.student_id} />
            </>
          )}

          {editing ? (
            <div>
              <span className="label">Student</span>
              <p
                className="rounded-lg px-3 py-2.5 text-sm"
                style={{ background: 'var(--card-alt)', color: 'var(--ink)' }}
              >
                {studentLabel}
              </p>
            </div>
          ) : (
            <div>
              <label className="label" htmlFor="ps-student">
                Student *
              </label>
              <Combobox
                id="ps-student"
                name="student_id"
                required
                placeholder="Search student name or ID…"
                options={students}
                emptyLabel="Every active student is already enrolled."
              />
              <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                Only students not already on a route are listed.
              </p>
            </div>
          )}

          <div>
            <label className="label" htmlFor="ps-route">
              Route
            </label>
            <Combobox
              id="ps-route"
              name="route_id"
              defaultValue={row?.route_id ?? ''}
              placeholder="Select route…"
              options={routes.map((r) => ({ id: r.id, label: r.label }))}
              onChangeValue={chooseRoute}
              emptyLabel="No routes yet."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="ps-pickup">
                Pickup Stop
              </label>
              {stopOptions.length ? (
                <Select
                  id="ps-pickup"
                  name="pickup_point"
                  key={`pickup-${routeId}`}
                  defaultValue={row?.pickup_point ?? ''}
                  placeholder="Select stop…"
                  options={stopOptions}
                />
              ) : (
                <input
                  id="ps-pickup"
                  name="pickup_point"
                  defaultValue={row?.pickup_point ?? ''}
                  placeholder={routeId ? 'This route has no stops yet' : 'Select route first'}
                  className="field"
                />
              )}
            </div>
            <div>
              <label className="label" htmlFor="ps-drop">
                Drop Stop
              </label>
              {stopOptions.length ? (
                <Select
                  id="ps-drop"
                  name="drop_point"
                  key={`drop-${routeId}`}
                  defaultValue={row?.drop_point ?? ''}
                  placeholder="Same as pickup"
                  options={stopOptions}
                />
              ) : (
                <input
                  id="ps-drop"
                  name="drop_point"
                  defaultValue={row?.drop_point ?? ''}
                  placeholder="Same as pickup"
                  className="field"
                />
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="ps-fee">
                Monthly Fee (Rs)
              </label>
              <input
                id="ps-fee"
                name="monthly_fee"
                type="number"
                min="0"
                key={`fee-${feeKey}`}
                defaultValue={fee}
                onChange={(e) => setFee(e.target.value)}
                placeholder="0"
                className="field"
              />
            </div>
            <div>
              <label className="label" htmlFor="ps-status">
                Status
              </label>
              <Select
                id="ps-status"
                name="status"
                defaultValue={row?.status ?? 'active'}
                options={PASSENGER_STATUSES.map((s) => ({ id: s.id, label: s.label }))}
              />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="ps-vehicle">
              Vehicle <span style={{ color: 'var(--muted-2)' }}>(optional)</span>
            </label>
            <Select
              id="ps-vehicle"
              name="vehicle_id"
              defaultValue={row?.vehicle_id ?? ''}
              placeholder="Whatever runs the route"
              options={vehicles}
              emptyLabel="No vehicles registered."
            />
          </div>

          <div>
            <label className="label" htmlFor="ps-notes">
              Notes
            </label>
            <textarea
              id="ps-notes"
              name="notes"
              rows={2}
              defaultValue={row?.notes ?? ''}
              className="field resize-none"
            />
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
