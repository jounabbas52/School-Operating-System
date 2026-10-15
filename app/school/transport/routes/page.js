import Link from 'next/link'
import { getSchoolContext } from '@/lib/school-context'
import { StatCard, StatRow } from '@/components/stats'
import ExportButtons from '@/components/export-buttons'
import RefreshButton from '@/components/refresh-button'
import ConfirmButton from '@/components/confirm'
import { ROUTE_STATUS_LABEL, ROUTE_STATUS_TONE, money } from '@/lib/operations-options'
import { deleteRoute } from '../actions'
import RoutePanel from './route-panel'

export const metadata = { title: 'Transport Routes' }

export default async function RoutesPage({ searchParams }) {
  const params = await searchParams
  const q = (params?.q ?? '').trim()
  const statusFilter = params?.status ?? ''

  const { schoolId, permissions, supabase } = await getSchoolContext()
  const canWrite = permissions.has('transport.write')

  const [{ data: routeRows, error }, { data: vehicles }, { data: passengers }] = await Promise.all([
    supabase
      .from('transport_routes')
      .select(
        'id, route_code, name, area, stops, start_point, end_point, fare, driver_name, driver_phone, vehicle_id, status'
      )
      .eq('school_id', schoolId)
      .eq('is_deleted', false)
      .order('route_code', { nullsFirst: false }),
    supabase
      .from('vehicles')
      .select('id, registration_no')
      .eq('school_id', schoolId)
      .eq('is_deleted', false),
    supabase
      .from('passengers')
      .select('route_id, status')
      .eq('school_id', schoolId)
      .eq('is_deleted', false),
  ])

  const allRoutes = routeRows ?? []
  const vehicleById = new Map((vehicles ?? []).map((v) => [v.id, v.registration_no]))

  const riderCount = new Map()
  for (const p of passengers ?? []) {
    if (p.status !== 'active' || !p.route_id) continue
    riderCount.set(p.route_id, (riderCount.get(p.route_id) ?? 0) + 1)
  }

  const needle = q.toLowerCase()
  const routes = allRoutes.filter((r) => {
    if (statusFilter && r.status !== statusFilter) return false
    if (!needle) return true
    return [r.route_code, r.name, r.area, r.driver_name]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(needle))
  })

  const activeCount = allRoutes.filter((r) => r.status === 'active').length
  const totalStudents = [...riderCount.values()].reduce((a, b) => a + b, 0)

  const exportRows = routes.map((r, i) => ({
    n: i + 1,
    code: r.route_code ?? '',
    name: r.name,
    area: r.area ?? '',
    stops: r.stops?.length ?? 0,
    vehicle: vehicleById.get(r.vehicle_id) ?? '',
    driver: r.driver_name ?? '',
    phone: r.driver_phone ?? '',
    students: riderCount.get(r.id) ?? 0,
    fare: Number(r.fare) || 0,
    status: ROUTE_STATUS_LABEL[r.status] ?? r.status,
  }))

  const vehicleOptions = (vehicles ?? []).map((v) => ({ id: v.id, label: v.registration_no }))
  const filtered = Boolean(q || statusFilter)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>
            Transport Routes
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
            Manage all bus and van routes for students
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <RefreshButton />
          <ExportButtons
            rows={exportRows}
            columns={[
              { key: 'n', label: '#' },
              { key: 'code', label: 'Route ID' },
              { key: 'name', label: 'Name' },
              { key: 'area', label: 'Area' },
              { key: 'stops', label: 'Stops' },
              { key: 'vehicle', label: 'Vehicle' },
              { key: 'driver', label: 'Driver' },
              { key: 'phone', label: 'Driver phone' },
              { key: 'students', label: 'Students' },
              { key: 'fare', label: 'Fare' },
              { key: 'status', label: 'Status' },
            ]}
            filename="transport-routes"
            title="Transport Routes"
          />
          {canWrite && (
            <RoutePanel
              vehicles={vehicleOptions}
              trigger={{ label: '+ Add Route', className: 'btn btn-primary' }}
            />
          )}
        </div>
      </div>

      <StatRow>
        <StatCard label="Total routes" value={allRoutes.length} sub="all routes" tone="brand" icon="⇄" />
        <StatCard label="Active routes" value={activeCount} sub="running now" tone="green" icon="✓" />
        <StatCard
          label="Inactive routes"
          value={allRoutes.length - activeCount}
          sub="paused or suspended"
          tone="blue"
          icon="◌"
        />
        <StatCard
          label="Total students"
          value={totalStudents}
          sub="enrolled in transport"
          tone="amber"
          icon="◉"
        />
      </StatRow>

      {/* --------------------------------------------------------- filters */}
      <form className="card flex flex-wrap items-center gap-2 p-3">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search by ID, name, area, driver…"
          className="field min-w-56 flex-1"
        />

        <div className="flex flex-wrap items-center gap-1">
          <Link
            href="/school/transport/routes"
            className={`tab !px-2.5 !py-1 ${!statusFilter ? 'tab-on' : ''}`}
          >
            All
          </Link>
          <Link
            href="/school/transport/routes?status=active"
            className={`tab !px-2.5 !py-1 ${statusFilter === 'active' ? 'tab-on' : ''}`}
          >
            Active {activeCount}
          </Link>
          <Link
            href="/school/transport/routes?status=inactive"
            className={`tab !px-2.5 !py-1 ${statusFilter === 'inactive' ? 'tab-on' : ''}`}
          >
            Inactive {allRoutes.filter((r) => r.status === 'inactive').length}
          </Link>
        </div>

        <button className="btn btn-primary">Search</button>
        {filtered && (
          <Link href="/school/transport/routes" className="btn btn-ghost">
            Clear
          </Link>
        )}
      </form>

      {error && (
        <p
          className="rounded-lg px-3 py-2 text-sm"
          style={{ background: 'var(--red-soft)', color: 'var(--red-ink)' }}
        >
          {error.message}
        </p>
      )}

      {!routes.length ? (
        <div className="card px-6 py-16 text-center" style={{ borderStyle: 'dashed' }}>
          <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            No routes found
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm" style={{ color: 'var(--muted)' }}>
            {filtered ? 'Try adjusting your filters.' : 'Click "Add Route" to create your first route.'}
          </p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table min-w-[62rem]">
            <thead>
              <tr>
                <th>Route ID</th>
                <th>Name &amp; Area</th>
                <th className="text-right">Stops</th>
                <th>Vehicle</th>
                <th>Driver</th>
                <th className="text-right">Students</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {routes.map((r) => (
                <tr key={r.id}>
                  <td>
                    <span className="pill pill-muted font-mono">{r.route_code ?? '—'}</span>
                  </td>
                  <td>
                    <span className="font-medium" style={{ color: 'var(--ink)' }}>
                      {r.name}
                    </span>
                    <span className="block text-xs" style={{ color: 'var(--muted)' }}>
                      {r.area ?? '—'}
                    </span>
                  </td>
                  <td className="text-right tabular-nums">
                    {r.stops?.length ?? 0}
                    {r.stops?.length > 0 && (
                      <span
                        className="block max-w-36 truncate text-[0.65rem]"
                        style={{ color: 'var(--muted)' }}
                        title={r.stops.join(' → ')}
                      >
                        {r.stops[0]} → {r.stops[r.stops.length - 1]}
                      </span>
                    )}
                  </td>
                  <td>
                    {r.vehicle_id ? (
                      <span className="pill pill-blue font-mono">
                        {vehicleById.get(r.vehicle_id) ?? '—'}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    {r.driver_name ?? '—'}
                    {r.driver_phone && (
                      <span className="block text-xs" style={{ color: 'var(--muted)' }}>
                        {r.driver_phone}
                      </span>
                    )}
                  </td>
                  <td className="text-right tabular-nums">
                    {riderCount.get(r.id) ?? 0}
                    {Number(r.fare) > 0 && (
                      <span className="block text-[0.65rem]" style={{ color: 'var(--muted)' }}>
                        {money(r.fare)}/mo
                      </span>
                    )}
                  </td>
                  <td>
                    <span className={`pill ${ROUTE_STATUS_TONE[r.status] ?? 'pill-muted'}`}>
                      {ROUTE_STATUS_LABEL[r.status] ?? r.status}
                    </span>
                  </td>
                  <td>
                    <div className="flex items-center justify-end gap-1.5">
                      {canWrite ? (
                        <>
                          <RoutePanel
                            row={r}
                            vehicles={vehicleOptions}
                            trigger={{ label: 'Edit', className: 'btn btn-ghost !px-2.5 !py-1' }}
                          />
                          <form action={deleteRoute}>
                            <input type="hidden" name="id" value={r.id} />
                            <ConfirmButton
                              className="btn btn-danger !px-2.5 !py-1"
                              title={`Remove ${r.name}?`}
                              message="Students assigned to it keep their records but lose their route. Reassign them first if the route is still running."
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
