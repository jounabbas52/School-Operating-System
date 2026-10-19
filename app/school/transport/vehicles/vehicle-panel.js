'use client'

import { useActionState, useState } from 'react'
import { Spinner } from '@/components/spinner'
import SidePanel from '@/components/side-panel'
import { useCloseOnSuccess } from '@/components/use-close-on-success'
import Combobox, { Select } from '@/components/combobox'
import { VEHICLE_STATUSES, VEHICLE_TYPES } from '@/lib/operations-options'
import { saveVehicle } from '../actions'

function SaveButton({ editing, pending }) {
  return (
    <button type="submit" form="vehicle-form" disabled={pending} className="btn btn-primary">
      {pending ? (
        <>
          <Spinner /> Saving…
        </>
      ) : editing ? (
        'Save changes'
      ) : (
        'Add Vehicle'
      )}
    </button>
  )
}

export default function VehiclePanel({ row, routes, trigger }) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState(saveVehicle, {})
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
        title={editing ? `Edit ${row.registration_no}` : 'Add Vehicle'}
        description="Register a new vehicle to the fleet"
        icon="▤"
        footer={
          <>
            <button type="button" onClick={() => setOpen(false)} disabled={pending} className="btn btn-ghost">
              Cancel
            </button>
            <SaveButton pending={pending} editing={editing} />
          </>
        }
      >
        <form id="vehicle-form" action={formAction} className="flex flex-col gap-4">
          {editing && <input type="hidden" name="id" value={row.id} />}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="vh-reg">
                Registration No. *
              </label>
              <input
                id="vh-reg"
                name="registration_no"
                required
                defaultValue={row?.registration_no ?? ''}
                placeholder="e.g. LZA-123"
                className="field uppercase"
              />
            </div>
            <div>
              <label className="label" htmlFor="vh-type">
                Vehicle Type
              </label>
              <Select
                id="vh-type"
                name="vehicle_type"
                defaultValue={row?.vehicle_type ?? 'bus'}
                options={VEHICLE_TYPES}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="vh-model">
                Model / Make
              </label>
              <input
                id="vh-model"
                name="model"
                defaultValue={row?.model ?? ''}
                placeholder="e.g. Toyota Hiace 2020"
                className="field"
              />
            </div>
            <div>
              <label className="label" htmlFor="vh-capacity">
                Seating Capacity
              </label>
              <input
                id="vh-capacity"
                name="capacity"
                type="number"
                min="1"
                defaultValue={row?.capacity ?? ''}
                placeholder="30"
                className="field"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="vh-driver">
                Driver Name
              </label>
              <input
                id="vh-driver"
                name="driver_name"
                defaultValue={row?.driver_name ?? ''}
                placeholder="Driver full name"
                className="field"
              />
            </div>
            <div>
              <label className="label" htmlFor="vh-phone">
                Driver Phone
              </label>
              <input
                id="vh-phone"
                name="driver_phone"
                defaultValue={row?.driver_phone ?? ''}
                placeholder="03xx-xxxxxxx"
                className="field"
              />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="vh-route">
              Assigned Route
            </label>
            <Combobox
              id="vh-route"
              name="route_id"
              defaultValue={row?.route_id ?? ''}
              placeholder="Search route…"
              options={routes}
              emptyLabel="No routes yet."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="vh-fitness">
                Fitness Expiry
              </label>
              <input
                id="vh-fitness"
                name="fitness_expiry"
                type="date"
                defaultValue={row?.fitness_expiry ?? ''}
                className="field"
              />
            </div>
            <div>
              <label className="label" htmlFor="vh-insurance">
                Insurance Expiry
              </label>
              <input
                id="vh-insurance"
                name="insurance_expiry"
                type="date"
                defaultValue={row?.insurance_expiry ?? ''}
                className="field"
              />
            </div>
          </div>

          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            A vehicle within 30 days of either expiry shows up as an alert on the fleet and
            overview screens.
          </p>

          <div>
            <label className="label" htmlFor="vh-status">
              Status
            </label>
            <Select
              id="vh-status"
              name="status"
              defaultValue={row?.status ?? 'active'}
              options={VEHICLE_STATUSES.map((s) => ({ id: s.id, label: s.label }))}
            />
          </div>

          <div>
            <label className="label" htmlFor="vh-notes">
              Notes
            </label>
            <textarea
              id="vh-notes"
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
