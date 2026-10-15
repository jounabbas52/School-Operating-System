import Link from 'next/link'
import { getSchoolContext } from '@/lib/school-context'
import { StatCard, StatRow } from '@/components/stats'
import RefreshButton from '@/components/refresh-button'
import ConfirmButton from '@/components/confirm'
import { safeDate } from '@/lib/attendance-options'
import { studentName, staffName, timeLabel, dateLabel } from '@/lib/operations-options'
import { deleteDevice, deleteEnrollment } from './actions'
import DevicePanel from './device-panel'
import EnrollPanel from './enroll-panel'
import ResolveBar from './resolve-bar'
import RulesPanel from './rules-panel'

export const metadata = { title: 'Thumb Attendance' }

const TABS = [
  { id: 'devices', label: 'Devices' },
  { id: 'enrolment', label: 'Enrolment' },
  { id: 'punches', label: 'Punch log' },
]

const KIND_LABEL = {
  zkteco: 'ZKTeco',
  essl: 'eSSL',
  usb_bridge: 'USB scanner',
  mobile: 'Mobile',
  other: 'Other',
}

const RESOLUTION_TONE = {
  pending: 'pill-amber',
  matched: 'pill-green',
  unknown_user: 'pill-red',
  debounced: 'pill-muted',
}

const RESOLUTION_LABEL = {
  pending: 'Pending',
  matched: 'Matched',
  unknown_user: 'Unknown ID',
  debounced: 'Debounced',
}

// A device that has checked in this recently is treated as alive. Module
// scope, not inline in the component: reading the clock during render is
// impure, and the lint rule that says so is right — this is the one place the
// current time enters the page.
const LIVE_WINDOW_MS = 15 * 60000

function isLive(lastSeen) {
  if (!lastSeen) return false
  const ms = Date.parse(lastSeen)
  return Number.isFinite(ms) && Date.now() - ms < LIVE_WINDOW_MS
}

// "3 minutes ago" beats a timestamp for a device heartbeat — the question is
// always "is it alive right now", not "when exactly".
function ago(value) {
  if (!value) return 'never'
  const ms = Date.now() - Date.parse(value)
  if (!Number.isFinite(ms)) return 'never'
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export default async function BiometricPage({ searchParams }) {
  const params = await searchParams
  const tab = TABS.some((t) => t.id === params?.tab) ? params.tab : 'devices'
  const date = safeDate(params?.date)
  const q = (params?.q ?? '').trim()

  const { schoolId, permissions, supabase } = await getSchoolContext()
  const canWrite = permissions.has('attendance.write')

  const [
    { data: devices, error },
    { data: enrollments },
    { data: punches },
    { data: settings },
    { data: students },
    { data: staff },
  ] = await Promise.all([
    supabase
      .from('biometric_devices')
      .select('id, name, serial, location, kind, status, last_seen_at, last_punch_at, notes')
      .eq('school_id', schoolId)
      .eq('is_deleted', false)
      .order('name'),
    supabase
      .from('biometric_enrollments')
      .select(
        'id, person_type, student_id, staff_id, device_user_id, finger_label, status, enrolled_at, students(first_name, last_name, admission_number), staff(first_name, last_name, staff_number)'
      )
      .eq('school_id', schoolId)
      .eq('is_deleted', false)
      .order('device_user_id'),
    supabase
      .from('attendance_punches')
      .select('id, device_id, device_user_id, punched_at, direction, resolution, client_punch_id')
      .eq('school_id', schoolId)
      .eq('punch_date', date)
      .order('punched_at', { ascending: false })
      .limit(500),
    supabase.from('attendance_settings').select('*').eq('school_id', schoolId).maybeSingle(),
    supabase
      .from('students')
      .select('id, first_name, last_name, admission_number')
      .eq('school_id', schoolId)
      .eq('is_deleted', false)
      .eq('status', 'active')
      .order('first_name'),
    supabase
      .from('staff')
      .select('id, first_name, last_name, staff_number')
      .eq('school_id', schoolId)
      .eq('is_deleted', false)
      .eq('status', 'active')
      .order('first_name'),
  ])

  const allDevices = devices ?? []
  const allEnrollments = enrollments ?? []
  const dayPunches = punches ?? []

  const deviceById = new Map(allDevices.map((d) => [d.id, d.name]))

  // Which device IDs have no person behind them. This is the number that
  // actually breaks a school's register, so it gets a tile.
  const mappedIds = new Set(allEnrollments.map((e) => e.device_user_id))
  const unknownIds = [...new Set(dayPunches.map((p) => p.device_user_id))].filter(
    (id) => !mappedIds.has(id)
  )

  const studentOptions = (students ?? []).map((s) => ({
    id: s.id,
    label: `${studentName(s)}${s.admission_number ? ` · ${s.admission_number}` : ''}`,
  }))
  const staffOptions = (staff ?? []).map((s) => ({
    id: s.id,
    label: `${staffName(s)}${s.staff_number ? ` · ${s.staff_number}` : ''}`,
  }))

  const needle = q.toLowerCase()
  const visibleEnrollments = allEnrollments.filter((e) => {
    if (!needle) return true
    const who = e.person_type === 'student' ? studentName(e.students) : staffName(e.staff)
    return [who, e.device_user_id].filter(Boolean).some((v) =>
      String(v).toLowerCase().includes(needle)
    )
  })

  const online = allDevices.filter((d) => isLive(d.last_seen_at)).length

  const studentsEnrolled = allEnrollments.filter((e) => e.person_type === 'student').length
  const staffEnrolled = allEnrollments.length - studentsEnrolled

  const keep = (next) => {
    const sp = new URLSearchParams()
    sp.set('tab', next.tab ?? tab)
    sp.set('date', next.date ?? date)
    if (q && (next.tab ?? tab) === 'enrolment') sp.set('q', q)
    return `/school/attendance/biometric?${sp.toString()}`
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>
            Thumb Attendance
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
            Fingerprint devices, who they map to, and the raw punches they send
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <RefreshButton />
          <RulesPanel
            settings={settings}
            canWrite={canWrite}
            trigger={{ label: 'Rules', className: 'btn btn-ghost' }}
          />
          {canWrite && (
            <DevicePanel trigger={{ label: '+ Add Device', className: 'btn btn-primary' }} />
          )}
        </div>
      </div>

      <StatRow>
        <StatCard
          label="Devices"
          value={allDevices.length}
          sub={`${online} seen in the last 15 min`}
          tone="brand"
          icon="▤"
        />
        <StatCard
          label="Enrolled"
          value={allEnrollments.length}
          sub={`${studentsEnrolled} students · ${staffEnrolled} staff`}
          tone="blue"
          icon="◉"
        />
        <StatCard
          label="Punches today"
          value={dayPunches.length}
          sub={dateLabel(date)}
          tone="green"
          icon="✓"
        />
        <StatCard
          label="Unknown IDs"
          value={unknownIds.length}
          sub={unknownIds.length ? 'enrol these to fix' : 'every punch maps to someone'}
          tone={unknownIds.length ? 'red' : 'amber'}
          icon="!"
        />
      </StatRow>

      {/* A gate that sent nothing is the failure nobody notices until the
          register is blank at the end of the week. */}
      {allDevices.length > 0 && online === 0 && (
        <p
          className="rounded-xl px-4 py-3 text-sm"
          style={{ background: 'var(--amber-soft)', color: 'var(--amber-ink)' }}
        >
          No device has checked in for over 15 minutes. If the gate is running, the agent has
          probably lost its connection — punches are held on the device and will arrive when it
          reconnects.
        </p>
      )}

      <ResolveBar date={date} canWrite={canWrite} punchCount={dayPunches.length} />

      {/* ------------------------------------------------------------ tabs */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1">
          {TABS.map((t) => (
            <Link key={t.id} href={keep({ tab: t.id })} className={`tab ${tab === t.id ? 'tab-on' : ''}`}>
              {t.label}
            </Link>
          ))}
        </div>
        <Link href="/school/attendance" className="btn btn-ghost">
          Manual register
        </Link>
      </div>

      {error && (
        <p
          className="rounded-lg px-3 py-2 text-sm"
          style={{ background: 'var(--red-soft)', color: 'var(--red-ink)' }}
        >
          {error.message}
        </p>
      )}

      {/* --------------------------------------------------------- devices */}
      {tab === 'devices' &&
        (!allDevices.length ? (
          <div className="card px-6 py-16 text-center" style={{ borderStyle: 'dashed' }}>
            <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
              No devices registered
            </p>
            <p className="mx-auto mt-1 max-w-md text-sm" style={{ color: 'var(--muted)' }}>
              Register your gate device to get a token. The agent on the school PC uses that token
              to post punches — nothing else can.
            </p>
          </div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="table min-w-[56rem]">
              <thead>
                <tr>
                  <th>Device</th>
                  <th>Serial</th>
                  <th>Type</th>
                  <th>Location</th>
                  <th>Last seen</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {allDevices.map((d) => {
                  const live = isLive(d.last_seen_at)
                  return (
                    <tr key={d.id}>
                      <td>
                        <span className="font-medium" style={{ color: 'var(--ink)' }}>
                          {d.name}
                        </span>
                        {d.notes && (
                          <span className="block text-xs" style={{ color: 'var(--muted)' }}>
                            {d.notes}
                          </span>
                        )}
                      </td>
                      <td>
                        <span className="pill pill-muted font-mono">{d.serial}</span>
                      </td>
                      <td>{KIND_LABEL[d.kind] ?? d.kind}</td>
                      <td>{d.location ?? '—'}</td>
                      <td>
                        <span style={{ color: live ? 'var(--green)' : 'var(--muted)' }}>
                          {ago(d.last_seen_at)}
                        </span>
                        {d.last_punch_at && (
                          <span className="block text-xs" style={{ color: 'var(--muted)' }}>
                            last punch {ago(d.last_punch_at)}
                          </span>
                        )}
                      </td>
                      <td>
                        <span
                          className={`pill ${d.status === 'active' ? 'pill-green' : 'pill-muted'}`}
                        >
                          {d.status === 'active' ? '● Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>
                        <div className="flex items-center justify-end gap-1.5">
                          {canWrite ? (
                            <>
                              <DevicePanel
                                row={d}
                                trigger={{
                                  label: 'Edit',
                                  className: 'btn btn-ghost !px-2.5 !py-1',
                                }}
                              />
                              <form action={deleteDevice}>
                                <input type="hidden" name="id" value={d.id} />
                                <ConfirmButton
                                  className="btn btn-danger !px-2.5 !py-1"
                                  title={`Remove ${d.name}?`}
                                  message="Its token stops working immediately and the agent will be refused. Punches already recorded stay on file."
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
                  )
                })}
              </tbody>
            </table>
          </div>
        ))}

      {/* ------------------------------------------------------- enrolment */}
      {tab === 'enrolment' && (
        <>
          <form className="card flex flex-wrap items-center gap-2 p-3">
            <input type="hidden" name="tab" value="enrolment" />
            <input type="hidden" name="date" value={date} />
            <input
              name="q"
              defaultValue={q}
              placeholder="Search person or device ID…"
              className="field min-w-52 flex-1"
            />
            <button className="btn btn-primary">Search</button>
            {q && (
              <Link href={keep({ tab: 'enrolment' })} className="btn btn-ghost">
                Clear
              </Link>
            )}
            {canWrite && (
              <div className="ml-auto">
                <EnrollPanel
                  students={studentOptions}
                  staff={staffOptions}
                  trigger={{ label: '+ Enrol Person', className: 'btn btn-primary' }}
                />
              </div>
            )}
          </form>

          {unknownIds.length > 0 && (
            <div
              className="rounded-xl px-4 py-3"
              style={{ background: 'var(--red-soft)', border: '1px solid transparent' }}
            >
              <p className="text-sm font-medium" style={{ color: 'var(--red-ink)' }}>
                {unknownIds.length} device ID{unknownIds.length === 1 ? '' : 's'} punched today with
                nobody behind {unknownIds.length === 1 ? 'it' : 'them'}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {unknownIds.slice(0, 20).map((id) => (
                  <span key={id} className="pill pill-red font-mono">
                    {id}
                  </span>
                ))}
              </div>
              <p className="mt-2 text-xs" style={{ color: 'var(--red-ink)' }}>
                Those presses are recorded but mark nobody. Enrol each ID against a person, then
                re-run Resolve for the day.
              </p>
            </div>
          )}

          {!visibleEnrollments.length ? (
            <div className="card px-6 py-16 text-center" style={{ borderStyle: 'dashed' }}>
              <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                {allEnrollments.length ? 'Nobody matches that search' : 'Nobody enrolled yet'}
              </p>
              <p className="mx-auto mt-1 max-w-md text-sm" style={{ color: 'var(--muted)' }}>
                The fingerprint itself stays on the device. This only records which device ID
                belongs to which person — that mapping is what turns a press into a register mark.
              </p>
            </div>
          ) : (
            <div className="card overflow-x-auto">
              <table className="table min-w-[48rem]">
                <thead>
                  <tr>
                    <th>Device ID</th>
                    <th>Person</th>
                    <th>Type</th>
                    <th>Finger</th>
                    <th>Enrolled</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleEnrollments.map((e) => (
                    <tr key={e.id}>
                      <td>
                        <span className="pill pill-brand font-mono">{e.device_user_id}</span>
                      </td>
                      <td>
                        <span className="font-medium" style={{ color: 'var(--ink)' }}>
                          {e.person_type === 'student'
                            ? studentName(e.students) || '—'
                            : staffName(e.staff) || '—'}
                        </span>
                        <span className="block text-xs" style={{ color: 'var(--muted)' }}>
                          {e.person_type === 'student'
                            ? e.students?.admission_number ?? '—'
                            : e.staff?.staff_number ?? '—'}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`pill ${e.person_type === 'student' ? 'pill-blue' : 'pill-amber'}`}
                        >
                          {e.person_type === 'student' ? 'Student' : 'Staff'}
                        </span>
                      </td>
                      <td>{e.finger_label ?? '—'}</td>
                      <td className="tabular-nums">
                        {e.enrolled_at ? dateLabel(e.enrolled_at.slice(0, 10)) : '—'}
                      </td>
                      <td>
                        <div className="flex items-center justify-end gap-1.5">
                          {canWrite ? (
                            <>
                              <EnrollPanel
                                row={e}
                                students={studentOptions}
                                staff={staffOptions}
                                trigger={{
                                  label: 'Edit',
                                  className: 'btn btn-ghost !px-2.5 !py-1',
                                }}
                              />
                              <form action={deleteEnrollment}>
                                <input type="hidden" name="id" value={e.id} />
                                <ConfirmButton
                                  className="btn btn-danger !px-2.5 !py-1"
                                  title="Remove this enrolment?"
                                  message="Their punches stop mapping to anybody from the next resolve. Register rows already written stay."
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
        </>
      )}

      {/* --------------------------------------------------------- punches */}
      {tab === 'punches' && (
        <>
          <form className="card flex flex-wrap items-center gap-3 p-3">
            <input type="hidden" name="tab" value="punches" />
            <div className="flex items-center gap-2">
              <label className="label !mb-0" htmlFor="punch-date">
                Date
              </label>
              <input
                id="punch-date"
                name="date"
                type="date"
                defaultValue={date}
                className="field w-auto"
              />
            </div>
            <button className="btn btn-primary">View</button>
            <span className="ml-auto text-xs" style={{ color: 'var(--muted)' }}>
              {dayPunches.length} punch{dayPunches.length === 1 ? '' : 'es'} · newest first, capped
              at 500
            </span>
          </form>

          {!dayPunches.length ? (
            <div className="card px-6 py-16 text-center" style={{ borderStyle: 'dashed' }}>
              <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                No punches on {dateLabel(date)}
              </p>
              <p className="mx-auto mt-1 max-w-md text-sm" style={{ color: 'var(--muted)' }}>
                Either nobody pressed, or the agent has not synced yet. Punches are held on the
                device until it reaches the server, so a late sync fills this in retrospectively.
              </p>
            </div>
          ) : (
            <div className="card overflow-x-auto">
              <table className="table min-w-[48rem]">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Device ID</th>
                    <th>Person</th>
                    <th>Device</th>
                    <th>Direction</th>
                    <th>Resolution</th>
                  </tr>
                </thead>
                <tbody>
                  {dayPunches.map((p) => {
                    const match = allEnrollments.find(
                      (e) => e.device_user_id === p.device_user_id
                    )
                    return (
                      <tr key={p.id}>
                        <td className="tabular-nums">{timeLabel(p.punched_at)}</td>
                        <td>
                          <span className="pill pill-muted font-mono">{p.device_user_id}</span>
                        </td>
                        <td>
                          {match ? (
                            <span style={{ color: 'var(--ink)' }}>
                              {match.person_type === 'student'
                                ? studentName(match.students)
                                : staffName(match.staff)}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--red)' }}>not enrolled</span>
                          )}
                        </td>
                        <td>{deviceById.get(p.device_id) ?? '—'}</td>
                        <td>
                          <span className="pill pill-muted">{p.direction}</span>
                        </td>
                        <td>
                          <span className={`pill ${RESOLUTION_TONE[p.resolution] ?? 'pill-muted'}`}>
                            {RESOLUTION_LABEL[p.resolution] ?? p.resolution}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <p className="text-xs" style={{ color: 'var(--muted)' }}>
        Fingerprint templates never leave the device — only the ID it was enrolled under is stored
        here. Resolving never overwrites a mark somebody typed by hand.
      </p>
    </div>
  )
}
