import Link from 'next/link'
import { getSchoolContext } from '@/lib/school-context'
import { StatCard, StatRow } from '@/components/stats'
import ExportButtons from '@/components/export-buttons'
import RefreshButton from '@/components/refresh-button'
import ConfirmButton from '@/components/confirm'
import {
  EXPIRY_TONE,
  VEHICLE_STATUS_LABEL,
  VEHICLE_STATUS_TONE,
  VEHICLE_TYPE_LABEL,
  dateLabel,
  expiryState,
  hasExpiryAlert,
} from '@/lib/operations-options'
import { deleteVehicle } from '../actions'
import VehiclePanel from './vehicle-panel'

export const metadata = { title: 'Fleet Management' }

// Fitness and insurance are the only two numbers here that can make a van
// illegal to drive, so they get a tone rather than a date alone.
function ExpiryCell({ date }) {
  const state = expiryState(date)
  if (!state) {
    return (
      <span className="text-xs" style={{ color: 'var(--muted-2)' }}>
        —
      </span>
    )
  }
  return (
    <span className={`pill ${EXPIRY_TONE[state]}`} title={date}>
      {state === 'expired' ? 'Expired' : dateLabel(date)}
    </span>
  )
}

export default async function VehiclesPage({ searchParams }) {
  const params = await searchParams
  const q = (params?.q ?? '').trim()
  const filter = params?.filter ?? ''

  const { schoolId, permissions, supabase } = await getSchoolContext()
  const canWrite = permissions.has('transport.write')

  const [{ data: vehicleRows, error }, { data: routes }] = await Promise.all([
    supabase
      .from('vehicles')
      .select(
        'id, registration_no, vehicle_type, model, capacity, driver_name, driver_phone, route_id, fitness_expiry, insurance_expiry, status, notes'
      )
      .eq('school_id', schoolId)
      .eq('is_deleted', false)
      .order('registration_no'),
    supabase
      .from('transport_routes')
      .select('id, name, route_code')
      .eq('school_id', schoolId)
      .eq('is_deleted', false),
  ])

  const allVehicles = vehicleRows ?? []
  const routeOptions = (routes ?? []).map((r) => ({
    id: r.id,
    label: r.route_code ? `${r.route_code} · ${r.name}` : r.name,
  }))
  const routeById = new Map(routeOptions.map((r) => [r.id, r.label]))

  const now = new Date()
  const needle = q.toLowerCase()

  const vehicles = allVehicles.filter((v) => {
    if (filter === 'fitness_expired') {
      if (expiryState(v.fitness_expiry, now) !== 'expired') return false
    } else if (filter && v.status !== filter) return false

    if (!needle) return true
    return [v.registration_no, v.model, v.driver_name, routeById.get(v.route_id)]
      .filter(Boolean)
      .some((x) => String(x).toLowerCase().includes(needle))
  })

  const countOf = (status) => allVehicles.filter((v) => v.status === status).length
  const alerts = allVehicles.filter((v) => hasExpiryAlert(v, now)).length
  const totalSeats = allVehicles.reduce((sum, v) => sum + (Number(v.capacity) || 0), 0)

  const exportRows = vehicles.map((v, i) => ({
    n: i + 1,
    reg: v.registration_no,
    type: VEHICLE_TYPE_LABEL[v.vehicle_type] ?? v.vehicle_type,
    model: v.model ?? '',
    capacity: v.capacity ?? '',
    driver: v.driver_name ?? '',
    phone: v.driver_phone ?? '',
    route: routeById.get(v.route_id) ?? '',
    fitness: v.fitness_expiry ?? '',
    insurance: v.insurance_expiry ?? '',
    status: VEHICLE_STATUS_LABEL[v.status] ?? v.status,
  }))

  const TABS = [
    { id: '', label: 'All' },
    { id: 'active', label: 'Active' },
    { id: 'in_repair', label: 'In Repair' },
    { id: 'inactive', label: 'Inactive' },
    { id: 'fitness_expired', label: 'Fitness Expired' },
  ]

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>
            Fleet Management
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
            {allVehicles.length} vehicle{allVehicles.length === 1 ? '' : 's'} ·{' '}
            {countOf('active')} active · {totalSeats} total seats
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <RefreshButton />
          <ExportButtons
            rows={exportRows}
            columns={[
              { key: 'n', label: '#' },
              { key: 'reg', label: 'Registration' },
              { key: 'type', label: 'Type' },
              { key: 'model', label: 'Model' },
              { key: 'capacity', label: 'Capacity' },
              { key: 'driver', label: 'Driver' },
              { key: 'phone', label: 'Phone' },
              { key: 'route', label: 'Route' },
              { key: 'fitness', label: 'Fitness expiry' },
              { key: 'insurance', label: 'Insurance expiry' },
              { key: 'status', label: 'Status' },
            ]}
            filename="fleet"
            title="Fleet Management"
          />
          {canWrite && (
            <VehiclePanel
              routes={routeOptions}
              trigger={{ label: '+ Add Vehicle', className: 'btn btn-primary' }}
            />
          )}
        </div>
      </div>

      <StatRow>
        <StatCard label="Total fleet" value={allVehicles.length} tone="brand" icon="▤" />
        <StatCard label="Active" value={countOf('active')} tone="green" icon="✓" />
        <StatCard label="In repair" value={countOf('in_repair')} tone="amber" icon="⚒" />
        <StatCard
          label="Expiry alerts"
          value={alerts}
          sub="fitness / insurance"
          tone={alerts > 0 ? 'red' : 'blue'}
          icon="!"
        />
      </StatRow>

      {/* --------------------------------------------------------- filters */}
      <form className="card flex flex-wrap items-center gap-2 p-3">
        <div className="flex flex-wrap items-center gap-1">
          {TABS.map((t) => (
            <Link
              key={t.id || 'all'}
              href={t.id ? `/school/transport/vehicles?filter=${t.id}` : '/school/transport/vehicles'}
              className={`tab !px-2.5 !py-1 ${filter === t.id ? 'tab-on' : ''}`}
            >
              {t.label}
            </Link>
          ))}
        </div>

        <input
          name="q"
          defaultValue={q}
          placeholder="Search reg no, driver, route…"
          className="field ml-auto min-w-52 max-w-xs"
        />
        {filter && <input type="hidden" name="filter" value={filter} />}
        <button className="btn btn-primary">Search</button>
      </form>

      {error && (
        <p
          className="rounded-lg px-3 py-2 text-sm"
          style={{ background: 'var(--red-soft)', color: 'var(--red-ink)' }}
        >
          {error.message}
        </p>
      )}

      {!vehicles.length ? (
        <div className="card px-6 py-16 text-center" style={{ borderStyle: 'dashed' }}>
          <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            No vehicles found
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm" style={{ color: 'var(--muted)' }}>
            {q || filter
              ? 'Try adjusting your filters.'
              : 'Click "Add Vehicle" to register the first vehicle.'}
          </p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table min-w-[64rem]">
            <thead>
              <tr>
                <th>#</th>
                <th>Vehicle</th>
                <th>Driver</th>
                <th>Route</th>
                <th className="text-right">Capacity</th>
                <th>Fitness</th>
                <th>Insurance</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {vehicles.map((v, i) => (
                <tr key={v.id}>
                  <td className="tabular-nums" style={{ color: 'var(--muted)' }}>
                    {i + 1}
                  </td>
                  <td>
                    <span className="font-medium font-mono" style={{ color: 'var(--ink)' }}>
                      {v.registration_no}
                    </span>
                    <span className="block text-xs" style={{ color: 'var(--muted)' }}>
                      {VEHICLE_TYPE_LABEL[v.vehicle_type] ?? v.vehicle_type}
                      {v.model ? ` · ${v.model}` : ''}
                    </span>
                  </td>
                  <td>
                    {v.driver_name ?? '—'}
                    {v.driver_phone && (
                      <span className="block text-xs" style={{ color: 'var(--muted)' }}>
                        {v.driver_phone}
                      </span>
                    )}
                  </td>
                  <td>
                    {v.route_id ? (
                      <span className="pill pill-brand">{routeById.get(v.route_id) ?? '—'}</span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="text-right tabular-nums">{v.capacity ?? '—'}</td>
                  <td>
                    <ExpiryCell date={v.fitness_expiry} />
                  </td>
                  <td>
                    <ExpiryCell date={v.insurance_expiry} />
                  </td>
                  <td>
                    <span className={`pill ${VEHICLE_STATUS_TONE[v.status] ?? 'pill-muted'}`}>
                      {VEHICLE_STATUS_LABEL[v.status] ?? v.status}
                    </span>
                  </td>
                  <td>
                    <div className="flex items-center justify-end gap-1.5">
                      {canWrite ? (
                        <>
                          <VehiclePanel
                            row={v}
                            routes={routeOptions}
                            trigger={{ label: 'Edit', className: 'btn btn-ghost !px-2.5 !py-1' }}
                          />
                          <form action={deleteVehicle}>
                            <input type="hidden" name="id" value={v.id} />
                            <ConfirmButton
                              className="btn btn-danger !px-2.5 !py-1"
                              title={`Remove ${v.registration_no}?`}
                              message="Routes it was assigned to keep running — they simply have no vehicle until one is assigned."
                              confirmLabel="Remove"
                            >
                              Delete
                            </ConfirmButton>
                          </form>
                        </>
                      ) : (
                        <span className="text-xs" style={{ color: 'var(--muted-2)' }}>
                          read only
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
