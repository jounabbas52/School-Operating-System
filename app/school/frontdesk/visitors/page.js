import Link from 'next/link'
import { getSchoolContext } from '@/lib/school-context'
import ExportButtons from '@/components/export-buttons'
import SubmitButton from '@/components/submit-button'
import RefreshButton from '@/components/refresh-button'
import ConfirmButton from '@/components/confirm'
import { dateLabel, duration, timeLabel, todayKey } from '@/lib/operations-options'
import { checkOutVisitor, deleteVisitor } from '../actions'
import VisitorPanel from './visitor-panel'

export const metadata = { title: 'Visitor Log' }

function Tile({ label, value, tone, icon }) {
  const TONES = {
    dark: 'linear-gradient(135deg, #1e2739 0%, #2d3850 100%)',
    amber: 'linear-gradient(135deg, #d97706 0%, #f59e0b 100%)',
    green: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
    brand: 'var(--brand-grad)',
  }
  return (
    <div
      className="flex items-start justify-between gap-3 rounded-xl p-4 text-white"
      style={{ background: TONES[tone] ?? TONES.dark }}
    >
      <div>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
        <p className="mt-0.5 text-xs opacity-85">{label}</p>
      </div>
      <span
        className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/20 text-sm"
        aria-hidden="true"
      >
        {icon}
      </span>
    </div>
  )
}

export default async function VisitorsPage({ searchParams }) {
  const params = await searchParams
  const q = (params?.q ?? '').trim()
  // The log opens on today, which is the day the gate is actually working.
  const date = params?.date ?? todayKey()

  const { schoolId, permissions, supabase } = await getSchoolContext()
  const canWrite = permissions.has('frontdesk.write')

  const [{ data: visitorRows, error }, { data: staff }] = await Promise.all([
    supabase
      .from('visitors')
      .select(
        'id, badge_no, name, phone, cnic, purpose, whom_to_meet, visit_date, in_time, out_time, notes'
      )
      .eq('school_id', schoolId)
      .eq('is_deleted', false)
      .eq('visit_date', date)
      .order('in_time', { ascending: false }),
    supabase
      .from('staff')
      .select('id, first_name, last_name, designation')
      .eq('school_id', schoolId)
      .eq('is_deleted', false)
      .eq('status', 'active')
      .order('first_name'),
  ])

  const allVisitors = visitorRows ?? []

  const staffOptions = (staff ?? []).map((s) => ({
    id: [s.first_name, s.last_name].filter(Boolean).join(' '),
    label: `${[s.first_name, s.last_name].filter(Boolean).join(' ')}${
      s.designation ? ` · ${s.designation}` : ''
    }`,
  }))

  const needle = q.toLowerCase()
  const visitors = allVisitors.filter((v) => {
    if (!needle) return true
    return [v.name, v.purpose, v.whom_to_meet, v.badge_no, v.phone]
      .filter(Boolean)
      .some((x) => String(x).toLowerCase().includes(needle))
  })

  const inside = allVisitors.filter((v) => !v.out_time).length
  const checkedOut = allVisitors.length - inside

  const exportRows = visitors.map((v, i) => ({
    n: i + 1,
    badge: v.badge_no ?? '',
    name: v.name ?? '',
    phone: v.phone ?? '',
    purpose: v.purpose ?? '',
    meeting: v.whom_to_meet ?? '',
    in: v.in_time ? timeLabel(v.in_time) : '',
    out: v.out_time ? timeLabel(v.out_time) : '',
    duration: duration(v.in_time, v.out_time),
    status: v.out_time ? 'Checked out' : 'Inside',
  }))

  const isToday = date === todayKey()

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>
            Visitor Log
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
            Track and manage daily visitor check-ins
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <RefreshButton />
          <ExportButtons
            rows={exportRows}
            columns={[
              { key: 'n', label: '#' },
              { key: 'badge', label: 'Badge' },
              { key: 'name', label: 'Visitor' },
              { key: 'phone', label: 'Phone' },
              { key: 'purpose', label: 'Purpose' },
              { key: 'meeting', label: 'Whom to meet' },
              { key: 'in', label: 'In' },
              { key: 'out', label: 'Out' },
              { key: 'duration', label: 'Duration' },
              { key: 'status', label: 'Status' },
            ]}
            filename={`visitors-${date}`}
            title="Visitor Log"
            subtitle={dateLabel(date)}
          />
          {canWrite && (
            <VisitorPanel
              staff={staffOptions}
              date={date}
              trigger={{ label: '+ Check In Visitor', className: 'btn btn-primary' }}
            />
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Total Today" value={allVisitors.length} tone="dark" icon="◉" />
        <Tile label="Inside Now" value={inside} tone="amber" icon="▣" />
        <Tile label="Checked Out" value={checkedOut} tone="green" icon="✓" />
        <Tile label="Showing" value={visitors.length} tone="brand" icon="⌕" />
      </div>

      {/* --------------------------------------------------------- filters */}
      <form className="card flex flex-wrap items-center gap-3 p-3">
        <div className="flex items-center gap-2">
          <label className="label !mb-0" htmlFor="vis-date">
            Filter by Date
          </label>
          <input
            id="vis-date"
            name="date"
            type="date"
            defaultValue={date}
            className="field w-auto"
          />
        </div>

        <span
          className="pill"
          style={{
            background: isToday ? 'var(--brand-soft)' : 'var(--card-alt)',
            color: isToday ? 'var(--brand-ink)' : 'var(--muted)',
          }}
        >
          {isToday ? '● Today · ' : ''}
          {dateLabel(date)}
        </span>

        <input
          name="q"
          defaultValue={q}
          placeholder="Search name, purpose, host…"
          className="field ml-auto min-w-52 max-w-xs"
        />
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

      <div className="card overflow-hidden">
        <div
          className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3"
          style={{ borderColor: 'var(--border)' }}
        >
          <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
            Visitor Records <span className="pill pill-muted ml-1">{visitors.length}</span>
          </p>
          <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--muted)' }}>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ background: 'var(--amber)' }} />
              {inside} inside
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ background: 'var(--green)' }} />
              {checkedOut} checked out
            </span>
          </div>
        </div>

        {!visitors.length ? (
          <div className="px-6 py-16 text-center">
            <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
              No visitors {isToday ? 'yet today' : `on ${dateLabel(date)}`}
            </p>
            <p className="mx-auto mt-1 max-w-sm text-sm" style={{ color: 'var(--muted)' }}>
              {q ? 'Nothing matches that search.' : 'Check a visitor in to start the day’s log.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table min-w-[66rem]">
              <thead>
                <tr>
                  <th>Badge</th>
                  <th>Visitor</th>
                  <th>Phone</th>
                  <th>Purpose</th>
                  <th>Whom to Meet</th>
                  <th>In</th>
                  <th>Out</th>
                  <th>Duration</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visitors.map((v) => (
                  <tr key={v.id}>
                    <td>
                      <span className="pill pill-muted font-mono">{v.badge_no ?? '—'}</span>
                    </td>
                    <td>
                      <span className="font-medium" style={{ color: 'var(--ink)' }}>
                        {v.name ?? '—'}
                      </span>
                      {v.cnic && (
                        <span className="block text-xs" style={{ color: 'var(--muted)' }}>
                          {v.cnic}
                        </span>
                      )}
                    </td>
                    <td>{v.phone ?? '—'}</td>
                    <td>
                      <span className="block max-w-48 truncate" style={{ color: 'var(--ink-2)' }}>
                        {v.purpose ?? '—'}
                      </span>
                    </td>
                    <td>{v.whom_to_meet ?? '—'}</td>
                    <td className="tabular-nums">{timeLabel(v.in_time)}</td>
                    <td className="tabular-nums">{v.out_time ? timeLabel(v.out_time) : '—'}</td>
                    <td className="tabular-nums">{duration(v.in_time, v.out_time)}</td>
                    <td>
                      {v.out_time ? (
                        <span className="pill pill-green">Checked out</span>
                      ) : (
                        <span className="pill pill-amber">● Inside</span>
                      )}
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-1.5">
                        {canWrite ? (
                          <>
                            {!v.out_time && (
                              <form action={checkOutVisitor}>
                                <input type="hidden" name="id" value={v.id} />
                                <SubmitButton pendingLabel="Checking out…" className="btn btn-primary !px-2.5 !py-1">
                                  Check out
                                </SubmitButton>
                              </form>
                            )}
                            <form action={deleteVisitor}>
                              <input type="hidden" name="id" value={v.id} />
                              <ConfirmButton
                                className="btn btn-danger !px-2.5 !py-1"
                                title={`Remove ${v.name ?? 'this entry'}?`}
                                message="The badge number is not reissued — the gap is the record that something was removed."
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
    </div>
  )
}
