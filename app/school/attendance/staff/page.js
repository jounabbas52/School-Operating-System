import Link from 'next/link'
import { getSchoolContext } from '@/lib/school-context'
import ExportButtons from '@/components/export-buttons'
import RefreshButton from '@/components/refresh-button'
import { SHIFTS, SHIFT_LABEL, STAFF_MARK_LABEL, safeDate } from '@/lib/attendance-options'
import { STAFF_TYPES, STAFF_TYPE_LABEL, staffName } from '@/lib/staff-options'
import StaffSheet from './staff-sheet'

export const metadata = { title: 'Staff Attendance' }

export default async function StaffAttendancePage({ searchParams }) {
  const params = await searchParams
  const date = safeDate(params?.date)
  const typeFilter = STAFF_TYPES.some((t) => t.id === params?.type) ? params.type : ''
  const shiftFilter = SHIFTS.some((s) => s.id === params?.shift) ? params.shift : ''
  const loaded = params?.load === '1'

  const { schoolId, permissions, supabase } = await getSchoolContext()
  const canWrite = permissions.has('attendance.write')

  let staff = []
  let existing = {}
  let error = null

  if (loaded) {
    let query = supabase
      .from('staff')
      .select('id, staff_number, first_name, last_name, designation, staff_type, shift')
      .eq('school_id', schoolId)
      .eq('is_deleted', false)
      // Someone who has resigned or is on long leave is not on today's
      // register. Marking them would be a payroll problem, not a typo.
      .in('status', ['active', 'on_leave'])

    if (typeFilter) query = query.eq('staff_type', typeFilter)
    // 'both' covers either shift, so it always belongs in a shift's register.
    if (shiftFilter) query = query.in('shift', [shiftFilter, 'both'])

    const [{ data: roster, error: rosterError }, { data: marked }] = await Promise.all([
      query.order('first_name'),
      supabase
        .from('staff_attendance')
        .select('staff_id, status, check_in, check_out')
        .eq('school_id', schoolId)
        .eq('is_deleted', false)
        .eq('date', date),
    ])

    error = rosterError
    staff = (roster ?? []).map((s) => ({
      id: s.id,
      name: staffName(s),
      staff_number: s.staff_number,
      designation: s.designation,
      staff_type: s.staff_type,
      shift: s.shift,
    }))

    existing = Object.fromEntries(
      (marked ?? []).map((m) => [
        m.staff_id,
        {
          status: m.status,
          // Postgres hands back HH:MM:SS; <input type="time"> wants HH:MM.
          check_in: (m.check_in ?? '').slice(0, 5),
          check_out: (m.check_out ?? '').slice(0, 5),
        },
      ])
    )
  }

  const alreadyMarked = staff.filter((s) => existing[s.id]).length

  const exportRows = staff.map((s, i) => ({
    n: i + 1,
    staff_number: s.staff_number ?? '',
    name: s.name,
    designation: s.designation ?? '',
    type: STAFF_TYPE_LABEL[s.staff_type] ?? '',
    shift: SHIFT_LABEL[s.shift] ?? '',
    date,
    check_in: existing[s.id]?.check_in ?? '',
    check_out: existing[s.id]?.check_out ?? '',
    status: STAFF_MARK_LABEL[existing[s.id]?.status] ?? 'Not marked',
  }))

  const heading = new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>
            Staff Attendance
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
            {heading}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <RefreshButton />
          <ExportButtons
            rows={exportRows}
            columns={[
              { key: 'n', label: '#' },
              { key: 'staff_number', label: 'Staff ID' },
              { key: 'name', label: 'Staff member' },
              { key: 'designation', label: 'Designation' },
              { key: 'type', label: 'Type' },
              { key: 'shift', label: 'Shift' },
              { key: 'date', label: 'Date' },
              { key: 'check_in', label: 'Check in' },
              { key: 'check_out', label: 'Check out' },
              { key: 'status', label: 'Status' },
            ]}
            filename={`staff-attendance-${date}`}
            title="Staff Attendance"
            subtitle={date}
          />
          <Link href="/school/attendance/reports" className="btn btn-ghost">
            Reports
          </Link>
        </div>
      </div>

      {/* ---------------------------------------------------- fetch controls */}
      <div className="card p-4">
        <p
          className="mb-3 text-[0.68rem] font-bold uppercase tracking-wider"
          style={{ color: 'var(--brand-ink)' }}
        >
          Fetch staff for attendance
        </p>

        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input type="hidden" name="load" value="1" />

          <div>
            <span className="label">Department</span>
            <select name="type" defaultValue={typeFilter} className="field" aria-label="Department">
              <option value="">All departments</option>
              {STAFF_TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <span className="label">Shift</span>
            <select name="shift" defaultValue={shiftFilter} className="field" aria-label="Shift">
              <option value="">All shifts</option>
              {SHIFTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <span className="label">Date</span>
            <input name="date" type="date" defaultValue={date} className="field" />
          </div>

          <div className="flex items-end gap-2">
            <button className="btn btn-primary flex-1">Load</button>
            {loaded && (
              <Link href="/school/attendance/staff" className="btn btn-ghost">
                Clear
              </Link>
            )}
          </div>
        </form>

        {loaded && (
          <p className="mt-3 text-xs" style={{ color: 'var(--muted)' }}>
            Loaded <strong style={{ color: 'var(--ink)' }}>{staff.length} staff</strong> for{' '}
            {typeFilter ? STAFF_TYPE_LABEL[typeFilter] : 'all departments'} ·{' '}
            {shiftFilter ? SHIFT_LABEL[shiftFilter] : 'all shifts'} on {date}
            {alreadyMarked > 0 && ` — ${alreadyMarked} already marked, showing what was saved.`}
          </p>
        )}
      </div>

      {error && (
        <p
          className="rounded-lg px-3 py-2 text-sm"
          style={{ background: 'var(--red-soft)', color: 'var(--red-ink)' }}
        >
          {error.message}
        </p>
      )}

      {!loaded ? (
        <div className="card px-6 py-16 text-center" style={{ borderStyle: 'dashed' }}>
          <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            Select filters &amp; load staff
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm" style={{ color: 'var(--muted)' }}>
            Choose department, shift and date, then press Load.
          </p>
        </div>
      ) : !staff.length ? (
        <div className="card px-6 py-16 text-center" style={{ borderStyle: 'dashed' }}>
          <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            No staff match those filters
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm" style={{ color: 'var(--muted)' }}>
            Only active staff appear on a register. Add them under Teachers & Staff, or widen the filters.
          </p>
          <Link href="/school/hr" className="btn btn-primary mt-4">
            Go to All Staff
          </Link>
        </div>
      ) : (
        <StaffSheet
          staff={staff}
          date={date}
          existing={existing}
          canWrite={canWrite}
          defaultCheckIn="08:00"
        />
      )}
    </div>
  )
}
