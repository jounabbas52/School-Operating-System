'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Spinner } from '@/components/spinner'
import { useToast } from '@/components/toast'
import { STAFF_MARKS, TONE } from '@/lib/attendance-options'
import { saveStaffAttendance } from '../actions'

function SaveButton({ dirty }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="btn btn-primary">
      {pending ? (
        <>
          <Spinner /> Saving…
        </>
      ) : (
        `Save Attendance${dirty ? ' •' : ''}`
      )}
    </button>
  )
}

export default function StaffSheet({ staff, date, existing, canWrite, defaultCheckIn }) {
  const [state, formAction] = useActionState(saveStaffAttendance, {})
  const { success, error } = useToast()

  const [rows, setRows] = useState(() =>
    Object.fromEntries(
      staff.map((s) => [
        s.id,
        existing[s.id] ?? { status: 'present', check_in: defaultCheckIn, check_out: '' },
      ])
    )
  )
  const [dirty, setDirty] = useState(false)
  const [seen, setSeen] = useState(null)
  const [query, setQuery] = useState('')

  if (state?.ok && state.at !== seen) {
    setSeen(state.at)
    setDirty(false)
    queueMicrotask(() => success(state.ok))
  }
  if (state?.error && state.at !== seen) {
    setSeen(state.at ?? state.error)
    queueMicrotask(() => error(state.error))
  }

  const needle = query.trim().toLowerCase()
  const visible = needle
    ? staff.filter((s) =>
        [s.name, s.staff_number, s.designation]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(needle))
      )
    : staff

  const counts = {
    present: staff.filter((s) => rows[s.id]?.status === 'present').length,
    absent: staff.filter((s) => rows[s.id]?.status === 'absent').length,
    late: staff.filter((s) => rows[s.id]?.status === 'late').length,
    leave: staff.filter((s) => ['leave', 'short_leave', 'half_day', 'excused'].includes(rows[s.id]?.status))
      .length,
  }

  function setRow(id, patch) {
    setRows((current) => ({ ...current, [id]: { ...current[id], ...patch } }))
    setDirty(true)
  }

  function markAll(value) {
    setRows((current) => {
      const next = { ...current }
      for (const s of visible) next[s.id] = { ...next[s.id], status: value }
      return next
    })
    setDirty(true)
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="date" value={date} />

      <div className="card flex flex-wrap items-center gap-3 p-3">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name, staff ID or designation…"
          className="field min-w-56 flex-1"
          aria-label="Search the register"
        />
        {canWrite && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium" style={{ color: 'var(--muted)' }}>
              Mark all{needle ? ' shown' : ''}:
            </span>
            {STAFF_MARKS.map((mark) => (
              <button
                key={mark.id}
                type="button"
                onClick={() => markAll(mark.id)}
                className="rounded-md px-2.5 py-1 text-xs font-semibold text-white transition hover:brightness-110"
                style={{ background: TONE[mark.tone].edge }}
              >
                {mark.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { label: 'Total', value: staff.length, tone: 'brand' },
          { label: 'Present', value: counts.present, tone: 'green' },
          { label: 'Absent', value: counts.absent, tone: 'red' },
          { label: 'Late', value: counts.late, tone: 'amber' },
          { label: 'On leave', value: counts.leave, tone: 'blue' },
        ].map((card) => (
          <div key={card.label} className="card flex items-center justify-between gap-3 p-4">
            <div>
              <p className="text-xs font-medium" style={{ color: 'var(--muted)' }}>
                {card.label}
              </p>
              <p
                className="mt-1 text-xl font-semibold tabular-nums"
                style={{ color: TONE[card.tone].edge }}
              >
                {card.value}
              </p>
            </div>
            <span
              className="size-2.5 rounded-full"
              style={{ background: TONE[card.tone].edge }}
              aria-hidden="true"
            />
          </div>
        ))}
      </div>

      <div className="card overflow-x-auto">
        <table className="table min-w-[64rem]">
          <thead>
            <tr>
              <th>#</th>
              <th>Staff member</th>
              <th>Designation</th>
              <th>Check in</th>
              <th>Check out</th>
              <th>Attendance status</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((s, i) => {
              const row = rows[s.id] ?? { status: 'present', check_in: '', check_out: '' }
              const absent = row.status === 'absent'
              return (
                <tr key={s.id}>
                  <td className="tabular-nums" style={{ color: 'var(--muted)' }}>
                    {i + 1}
                  </td>
                  <td>
                    <span className="font-medium" style={{ color: 'var(--ink)' }}>
                      {s.name}
                    </span>
                    <span className="block font-mono text-xs" style={{ color: 'var(--muted)' }}>
                      {s.staff_number ?? '—'}
                    </span>
                  </td>
                  <td>{s.designation ?? '—'}</td>
                  <td>
                    {/* Disabled on absent, and the action nulls them anyway --
                        a clock-in for someone who never arrived is noise. */}
                    <input
                      type="time"
                      value={absent ? '' : (row.check_in ?? '')}
                      disabled={!canWrite || absent}
                      onChange={(event) => setRow(s.id, { check_in: event.target.value })}
                      className="field !w-28 !py-1 text-xs"
                      aria-label={`Check in for ${s.name}`}
                    />
                  </td>
                  <td>
                    <input
                      type="time"
                      value={absent ? '' : (row.check_out ?? '')}
                      disabled={!canWrite || absent}
                      onChange={(event) => setRow(s.id, { check_out: event.target.value })}
                      className="field !w-28 !py-1 text-xs"
                      aria-label={`Check out for ${s.name}`}
                    />
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {STAFF_MARKS.map((mark) => {
                        const on = row.status === mark.id
                        const t = TONE[mark.tone]
                        return (
                          <button
                            key={mark.id}
                            type="button"
                            onClick={() => canWrite && setRow(s.id, { status: mark.id })}
                            aria-pressed={on}
                            className="rounded-md px-2.5 py-1 text-xs font-medium transition"
                            style={{
                              background: on ? t.edge : 'transparent',
                              color: on ? '#fff' : 'var(--muted)',
                              border: `1px solid ${on ? t.edge : 'var(--border)'}`,
                            }}
                          >
                            {mark.label}
                          </button>
                        )
                      })}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Every row posts, not just the visible ones -- a search filters the
          view, never the register being saved. */}
      {staff.map((s) => {
        const row = rows[s.id] ?? { status: 'present', check_in: '', check_out: '' }
        return (
          <div key={s.id} hidden>
            <input type="hidden" name="staff_id" value={s.id} />
            <input type="hidden" name="mark" value={row.status} />
            <input type="hidden" name="check_in" value={row.check_in ?? ''} />
            <input type="hidden" name="check_out" value={row.check_out ?? ''} />
          </div>
        )
      })}

      {!visible.length && (
        <p className="py-6 text-center text-sm" style={{ color: 'var(--muted)' }}>
          No staff member matches “{query}”.
        </p>
      )}

      {canWrite && (
        <div className="flex items-center justify-end gap-3">
          <span className="text-xs" style={{ color: 'var(--muted)' }}>
            {dirty ? 'Unsaved changes' : 'All changes saved'}
          </span>
          <SaveButton dirty={dirty} />
        </div>
      )}

      {state?.error && (
        <p
          className="rounded-lg px-3 py-2 text-sm"
          style={{ background: 'var(--red-soft)', color: 'var(--red-ink)' }}
        >
          {state.error}
        </p>
      )}
    </form>
  )
}
