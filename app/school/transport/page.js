import Link from 'next/link'
import { getSchoolContext } from '@/lib/school-context'
import { StatCard, StatRow } from '@/components/stats'
import RefreshButton from '@/components/refresh-button'
import {
  ROUTE_STATUS_LABEL,
  ROUTE_STATUS_TONE,
  hasExpiryAlert,
  money,
} from '@/lib/operations-options'

export const metadata = { title: 'Transport Overview' }

const CARDS = [
  {
    href: '/school/transport/routes',
    title: 'Routes',
    sub: 'Manage bus routes and stops',
    key: 'routes',
    grad: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
  },
  {
    href: '/school/transport/vehicles',
    title: 'Fleet Management',
    sub: 'Vehicles, drivers & documents',
    key: 'vehicles',
    grad: 'linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)',
  },
  {
    href: '/school/transport/students',
    title: 'Transport Students',
    sub: 'Assign students to routes',
    key: 'students',
    grad: 'var(--brand-grad)',
  },
]

function Bar({ label, value, total, colour }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-20 shrink-0 text-xs" style={{ color: 'var(--muted)' }}>
        {label}
      </span>
      <div
        className="h-1.5 flex-1 overflow-hidden rounded-full"
        style={{ background: 'var(--border-soft)' }}
      >
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: colour }} />
      </div>
      <span
        className="w-7 shrink-0 text-right text-xs font-semibold tabular-nums"
        style={{ color: 'var(--ink)' }}
      >
        {value}
      </span>
    </div>
  )
}

export default async function TransportOverviewPage() {
  const { schoolId, supabase } = await getSchoolContext()

  const [{ data: routes }, { data: vehicles }, { data: passengers }] = await Promise.all([
    supabase
      .from('transport_routes')
      .select('id, route_code, name, area, stops, driver_name, vehicle_id, status')
      .eq('school_id', schoolId)
      .eq('is_deleted', false)
      .order('route_code', { nullsFirst: false }),
    supabase
      .from('vehicles')
      .select('id, registration_no, status, fitness_expiry, insurance_expiry, capacity, route_id')
      .eq('school_id', schoolId)
      .eq('is_deleted', false),
    supabase
      .from('passengers')
      .select('id, route_id, status, monthly_fee')
      .eq('school_id', schoolId)
      .eq('is_deleted', false),
  ])

  const allRoutes = routes ?? []
  const allVehicles = vehicles ?? []
  const allPassengers = passengers ?? []

  const now = new Date()
  const alerts = allVehicles.filter((v) => hasExpiryAlert(v, now)).length

  const activeRoutes = allRoutes.filter((r) => r.status === 'active')
  const activeVehicles = allVehicles.filter((v) => v.status === 'active')
  const activePassengers = allPassengers.filter((p) => p.status === 'active')

  const monthlyCollection = activePassengers.reduce(
    (sum, p) => sum + (Number(p.monthly_fee) || 0),
    0
  )

  const riderCount = new Map()
  for (const p of allPassengers) {
    if (p.status !== 'active' || !p.route_id) continue
    riderCount.set(p.route_id, (riderCount.get(p.route_id) ?? 0) + 1)
  }

  const vehicleById = new Map(allVehicles.map((v) => [v.id, v.registration_no]))

  const counts = {
    routes: allRoutes.length,
    vehicles: allVehicles.length,
    students: allPassengers.length,
  }

  const vehicleStates = [
    { label: 'Active', value: activeVehicles.length, colour: 'var(--green)' },
    {
      label: 'In Repair',
      value: allVehicles.filter((v) => v.status === 'in_repair').length,
      colour: 'var(--amber)',
    },
    {
      label: 'Inactive',
      value: allVehicles.filter((v) => v.status === 'inactive').length,
      colour: 'var(--muted-2)',
    },
    { label: 'Expiry Alerts', value: alerts, colour: 'var(--red)' },
  ]

  const studentStates = [
    { label: 'Active', value: activePassengers.length, colour: 'var(--green)' },
    {
      label: 'Inactive',
      value: allPassengers.filter((p) => p.status === 'inactive').length,
      colour: 'var(--muted-2)',
    },
    {
      label: 'Suspended',
      value: allPassengers.filter((p) => p.status === 'suspended').length,
      colour: 'var(--red)',
    },
  ]

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>
            Transport Overview
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
            Real-time snapshot of your school&rsquo;s transport system
          </p>
        </div>
        <RefreshButton />
      </div>

      <StatRow>
        <StatCard
          label="Total routes"
          value={allRoutes.length}
          sub={`${activeRoutes.length} active`}
          tone="brand"
          icon="⇄"
        />
        <StatCard
          label="Fleet vehicles"
          value={allVehicles.length}
          sub={`${activeVehicles.length} on road`}
          tone="blue"
          icon="▤"
        />
        <StatCard
          label="Transport students"
          value={allPassengers.length}
          sub={`${activePassengers.length} active`}
          tone="green"
          icon="◉"
        />
        <StatCard
          label="Expiry alerts"
          value={alerts}
          sub="fitness / insurance"
          tone={alerts > 0 ? 'red' : 'amber'}
          icon="!"
        />
      </StatRow>

      {/* ------------------------------------------------------ entry cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        {CARDS.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="relative flex flex-col gap-3 overflow-hidden rounded-xl p-5 text-white transition"
            style={{ background: c.grad }}
          >
            <div className="flex items-start justify-between gap-2">
              <span
                className="flex size-10 items-center justify-center rounded-xl bg-white/20 text-base"
                aria-hidden="true"
              >
                ▦
              </span>
              <span className="text-lg" aria-hidden="true">
                →
              </span>
            </div>
            <div>
              <p className="text-base font-semibold">{c.title}</p>
              <p className="mt-0.5 text-xs text-white/80">{c.sub}</p>
            </div>
            <span className="w-fit rounded-full bg-white/20 px-2.5 py-1 text-[0.68rem] font-semibold">
              {counts[c.key]} {c.key}
            </span>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        {/* ------------------------------------------------- active routes */}
        <div className="card overflow-hidden">
          <div
            className="flex items-center justify-between border-b px-4 py-3"
            style={{ borderColor: 'var(--border)' }}
          >
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                Active Routes
              </p>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                {activeRoutes.length} route{activeRoutes.length === 1 ? '' : 's'} currently running
              </p>
            </div>
            <Link href="/school/transport/routes" className="text-xs" style={{ color: 'var(--brand-ink)' }}>
              View All →
            </Link>
          </div>

          {!activeRoutes.length ? (
            <div className="px-6 py-14 text-center">
              <p className="text-sm" style={{ color: 'var(--muted)' }}>
                No active routes
              </p>
              <Link
                href="/school/transport/routes"
                className="mt-2 inline-block text-sm"
                style={{ color: 'var(--brand-ink)' }}
              >
                Add a route →
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="table min-w-[42rem]">
                <thead>
                  <tr>
                    <th>Route</th>
                    <th>Area</th>
                    <th className="text-right">Stops</th>
                    <th>Driver</th>
                    <th className="text-right">Students</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {activeRoutes.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <span className="font-medium" style={{ color: 'var(--ink)' }}>
                          {r.name}
                        </span>
                        <span className="block text-xs" style={{ color: 'var(--muted)' }}>
                          {r.route_code ?? '—'}
                          {r.vehicle_id ? ` · ${vehicleById.get(r.vehicle_id) ?? ''}` : ''}
                        </span>
                      </td>
                      <td>{r.area ?? '—'}</td>
                      <td className="text-right tabular-nums">{r.stops?.length ?? 0}</td>
                      <td>{r.driver_name ?? '—'}</td>
                      <td className="text-right tabular-nums">{riderCount.get(r.id) ?? 0}</td>
                      <td>
                        <span className={`pill ${ROUTE_STATUS_TONE[r.status] ?? 'pill-muted'}`}>
                          {ROUTE_STATUS_LABEL[r.status] ?? r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4">
          {/* ----------------------------------------------- fleet status */}
          <div className="card p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                Fleet Status
              </p>
              <Link
                href="/school/transport/vehicles"
                className="text-xs"
                style={{ color: 'var(--brand-ink)' }}
              >
                All →
              </Link>
            </div>
            <div className="flex flex-col gap-2.5">
              {vehicleStates.map((s) => (
                <Bar
                  key={s.label}
                  label={s.label}
                  value={s.value}
                  total={allVehicles.length}
                  colour={s.colour}
                />
              ))}
            </div>
          </div>

          {/* -------------------------------------------- student breakdown */}
          <div className="card p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                Student Breakdown
              </p>
              <Link
                href="/school/transport/students"
                className="text-xs"
                style={{ color: 'var(--brand-ink)' }}
              >
                All →
              </Link>
            </div>
            <div className="flex flex-col gap-2.5">
              {studentStates.map((s) => (
                <Bar
                  key={s.label}
                  label={s.label}
                  value={s.value}
                  total={allPassengers.length}
                  colour={s.colour}
                />
              ))}
            </div>
            <div
              className="mt-3 flex items-baseline justify-between border-t pt-3"
              style={{ borderColor: 'var(--border-soft)' }}
            >
              <span className="text-xs" style={{ color: 'var(--muted)' }}>
                Monthly collection
              </span>
              <span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--green)' }}>
                {money(monthlyCollection)}
              </span>
            </div>
          </div>

          {/* ------------------------------------------------ quick actions */}
          <div className="card overflow-hidden">
            <div className="panel-head px-4 py-3">
              <p className="text-sm font-semibold text-white">Quick Actions</p>
            </div>
            <div className="flex flex-col gap-1.5 p-3">
              {[
                ['Add New Route', '/school/transport/routes'],
                ['Register Vehicle', '/school/transport/vehicles'],
                ['Enroll Student', '/school/transport/students'],
              ].map(([label, href]) => (
                <Link
                  key={href}
                  href={href}
                  className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm transition"
                  style={{ background: 'var(--card-alt)', color: 'var(--ink-2)' }}
                >
                  {label}
                  <span aria-hidden="true">→</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
