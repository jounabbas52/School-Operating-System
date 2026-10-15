import Link from 'next/link'
import { getSchoolContext } from '@/lib/school-context'
import { StatCard, StatRow } from '@/components/stats'
import ExportButtons from '@/components/export-buttons'
import RefreshButton from '@/components/refresh-button'
import ConfirmButton from '@/components/confirm'
import {
  PASSENGER_STATUS_LABEL,
  PASSENGER_STATUS_TONE,
  money,
  studentName,
} from '@/lib/operations-options'
import { deletePassenger } from '../actions'
import PassengerPanel from './passenger-panel'

export const metadata = { title: 'Transport Students' }

export default async function TransportStudentsPage({ searchParams }) {
  const params = await searchParams
  const q = (params?.q ?? '').trim()
  const statusFilter = params?.status ?? ''

  const { schoolId, permissions, supabase } = await getSchoolContext()
  const canWrite = permissions.has('transport.write')

  const [{ data: passengerRows, error }, { data: routes }, { data: vehicles }, { data: classes }] =
    await Promise.all([
      supabase
        .from('passengers')
        .select(
          'id, student_id, route_id, vehicle_id, pickup_point, drop_point, monthly_fee, status, notes, students(first_name, last_name, admission_number, current_class_id)'
        )
        .eq('school_id', schoolId)
        .eq('is_deleted', false),
      supabase
        .from('transport_routes')
        .select('id, name, route_code, stops, fare')
        .eq('school_id', schoolId)
        .eq('is_deleted', false),
      supabase
        .from('vehicles')
        .select('id, registration_no')
        .eq('school_id', schoolId)
        .eq('is_deleted', false),
      supabase
        .from('classes')
        .select('id, name, grade_levels(name, ordinal)')
        .eq('school_id', schoolId)
        .eq('is_deleted', false),
    ])

  const allPassengers = passengerRows ?? []

  const routeOptions = (routes ?? []).map((r) => ({
    id: r.id,
    label: r.route_code ? `${r.route_code} · ${r.name}` : r.name,
    stops: r.stops ?? [],
    fare: r.fare,
  }))
  const routeById = new Map(routeOptions.map((r) => [r.id, r.label]))
  const vehicleOptions = (vehicles ?? []).map((v) => ({ id: v.id, label: v.registration_no }))
  const classById = new Map(
    (classes ?? []).map((c) => [c.id, c.grade_levels?.name ?? c.name])
  )

  const needle = q.toLowerCase()
  const passengers = allPassengers.filter((p) => {
    if (statusFilter && p.status !== statusFilter) return false
    if (!needle) return true
    return [
      studentName(p.students),
      p.students?.admission_number,
      classById.get(p.students?.current_class_id),
      routeById.get(p.route_id),
      p.pickup_point,
    ]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(needle))
  })

  // Students not yet on transport, for the enrol dialog. Loading only the
  // unenrolled keeps the combobox short and stops a double enrolment, which
  // the partial unique index would reject anyway.
  const enrolled = new Set(
    allPassengers.filter((p) => p.status === 'active').map((p) => p.student_id)
  )

  const { data: students } = await supabase
    .from('students')
    .select('id, first_name, last_name, admission_number, current_class_id')
    .eq('school_id', schoolId)
    .eq('is_deleted', false)
    .eq('status', 'active')
    .order('first_name')

  const studentOptions = (students ?? [])
    .filter((s) => !enrolled.has(s.id))
    .map((s) => ({
      id: s.id,
      label: `${studentName(s)}${s.admission_number ? ` · ${s.admission_number}` : ''}`,
      class_id: s.current_class_id,
    }))

  const activeCount = allPassengers.filter((p) => p.status === 'active').length
  const monthlyCollection = allPassengers
    .filter((p) => p.status === 'active')
    .reduce((sum, p) => sum + (Number(p.monthly_fee) || 0), 0)

  const exportRows = passengers.map((p, i) => ({
    n: i + 1,
    student: studentName(p.students),
    admission: p.students?.admission_number ?? '',
    klass: classById.get(p.students?.current_class_id) ?? '',
    route: routeById.get(p.route_id) ?? '',
    pickup: p.pickup_point ?? '',
    drop: p.drop_point ?? '',
    fee: Number(p.monthly_fee) || 0,
    status: PASSENGER_STATUS_LABEL[p.status] ?? p.status,
  }))

  const TABS = [
    { id: '', label: 'All' },
    { id: 'active', label: 'Active' },
    { id: 'inactive', label: 'Inactive' },
    { id: 'suspended', label: 'Suspended' },
  ]

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>
            Transport Students
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
            {allPassengers.length} registered · {activeCount} active
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <RefreshButton />
          <ExportButtons
            rows={exportRows}
            columns={[
              { key: 'n', label: '#' },
              { key: 'student', label: 'Student' },
              { key: 'admission', label: 'Admission no.' },
              { key: 'klass', label: 'Class' },
              { key: 'route', label: 'Route' },
              { key: 'pickup', label: 'Pickup stop' },
              { key: 'drop', label: 'Drop stop' },
              { key: 'fee', label: 'Monthly fee' },
              { key: 'status', label: 'Status' },
            ]}
            filename="transport-students"
            title="Transport Students"
          />
          {canWrite && routeOptions.length > 0 && (
            <PassengerPanel
              routes={routeOptions}
              vehicles={vehicleOptions}
              students={studentOptions}
              trigger={{ label: '+ Add Student', className: 'btn btn-primary' }}
            />
          )}
        </div>
      </div>

      <StatRow>
        <StatCard label="Total" value={allPassengers.length} tone="brand" icon="◉" />
        <StatCard label="Active" value={activeCount} tone="green" icon="✓" />
        <StatCard
          label="Inactive"
          value={allPassengers.filter((p) => p.status !== 'active').length}
          tone="red"
          icon="◌"
        />
        <StatCard
          label="Monthly collection"
          value={money(monthlyCollection)}
          sub="from active riders"
          tone="amber"
          icon="₨"
        />
      </StatRow>

      {/* --------------------------------------------------------- filters */}
      <form className="card flex flex-wrap items-center gap-2 p-3">
        <div className="flex flex-wrap items-center gap-1">
          {TABS.map((t) => (
            <Link
              key={t.id || 'all'}
              href={t.id ? `/school/transport/students?status=${t.id}` : '/school/transport/students'}
              className={`tab !px-2.5 !py-1 ${statusFilter === t.id ? 'tab-on' : ''}`}
            >
              {t.label}
            </Link>
          ))}
        </div>

        <input
          name="q"
          defaultValue={q}
          placeholder="Search student, class, route…"
          className="field ml-auto min-w-52 max-w-xs"
        />
        {statusFilter && <input type="hidden" name="status" value={statusFilter} />}
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

      {!passengers.length ? (
        <div className="card px-6 py-16 text-center" style={{ borderStyle: 'dashed' }}>
          <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            No students found
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm" style={{ color: 'var(--muted)' }}>
            {q || statusFilter
              ? 'Try adjusting your filters.'
              : routeOptions.length
                ? 'Click "Add Student" to register the first transport student.'
                : 'Create a route first — a student is enrolled onto one.'}
          </p>
          {!routeOptions.length && (
            <Link href="/school/transport/routes" className="btn btn-primary mt-4">
              Go to Routes
            </Link>
          )}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table min-w-[58rem]">
            <thead>
              <tr>
                <th>#</th>
                <th>Student</th>
                <th>Class</th>
                <th>Route</th>
                <th>Pickup Stop</th>
                <th className="text-right">Monthly Fee</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {passengers.map((p, i) => (
                <tr key={p.id}>
                  <td className="tabular-nums" style={{ color: 'var(--muted)' }}>
                    {i + 1}
                  </td>
                  <td>
                    <span className="font-medium" style={{ color: 'var(--ink)' }}>
                      {studentName(p.students) || '—'}
                    </span>
                    <span className="block text-xs" style={{ color: 'var(--muted)' }}>
                      {p.students?.admission_number ?? '—'}
                    </span>
                  </td>
                  <td>{classById.get(p.students?.current_class_id) ?? '—'}</td>
                  <td>
                    {p.route_id ? (
                      <span className="pill pill-brand">{routeById.get(p.route_id) ?? '—'}</span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    {p.pickup_point ?? '—'}
                    {p.drop_point && p.drop_point !== p.pickup_point && (
                      <span className="block text-xs" style={{ color: 'var(--muted)' }}>
                        drop: {p.drop_point}
                      </span>
                    )}
                  </td>
                  <td className="text-right tabular-nums">{money(p.monthly_fee)}</td>
                  <td>
                    <span className={`pill ${PASSENGER_STATUS_TONE[p.status] ?? 'pill-muted'}`}>
                      {PASSENGER_STATUS_LABEL[p.status] ?? p.status}
                    </span>
                  </td>
                  <td>
                    <div className="flex items-center justify-end gap-1.5">
                      {canWrite ? (
                        <>
                          <PassengerPanel
                            row={p}
                            studentLabel={studentName(p.students)}
                            routes={routeOptions}
                            vehicles={vehicleOptions}
                            students={studentOptions}
                            trigger={{ label: 'Edit', className: 'btn btn-ghost !px-2.5 !py-1' }}
                          />
                          <form action={deletePassenger}>
                            <input type="hidden" name="id" value={p.id} />
                            <ConfirmButton
                              className="btn btn-danger !px-2.5 !py-1"
                              title={`Remove ${studentName(p.students)} from transport?`}
                              message="They can be enrolled onto another route afterwards."
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
