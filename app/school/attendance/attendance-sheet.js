'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Spinner } from '@/components/spinner'
import { useToast } from '@/components/toast'
import { MARKS, TONE } from '@/lib/attendance-options'
import { saveAttendance } from './actions'

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

function Avatar({ name, tone }) {
  const letters = (name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()
  return (
    <span
      className="flex size-8 shrink-0 items-center justify-center rounded-full text-[0.65rem] font-bold text-white"
      style={{ background: tone }}
      aria-hidden="true"
    >
      {letters}
    </span>
  )
}

// Stable per-student colour, so the same child keeps the same chip every day
// and the eye can track down a long register.
const AVATAR_TONES = [
  'var(--brand-grad)',
  'linear-gradient(135deg,#0f766e,#14b8a6)',
  'linear-gradient(135deg,#1d4ed8,#3b82f6)',
  'linear-gradient(135deg,#9f1239,#f43f5e)',
  'linear-gradient(135deg,#b45309,#f59e0b)',
  'linear-gradient(135deg,#4338ca,#818cf8)',
]

function MarkButton({ mark, on, onClick }) {
  const t = TONE[mark.tone]
  return (
    <button
      type="button"
      onClick={onClick}
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
}

export default function AttendanceSheet({ students, date, classId, sectionId, existing, canWrite }) {
  const [state, formAction] = useActionState(saveAttendance, {})
  const { success, error } = useToast()

  // Everyone starts Present, or on whatever was already recorded for the day.
  // Present is the common case; the exceptions are what a teacher clicks.
  const [marks, setMarks] = useState(() =>
    Object.fromEntries(students.map((s) => [s.id, existing[s.id] ?? 'present']))
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
    ? students.filter((s) =>
        [s.name, s.admission_number, s.roll_number, s.father_name]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(needle))
      )
    : students

  const counts = {
    present: students.filter((s) => marks[s.id] === 'present').length,
    absent: students.filter((s) => marks[s.id] === 'absent').length,
    late: students.filter((s) => marks[s.id] === 'late').length,
    leave: students.filter((s) => ['leave', 'short_leave', 'excused'].includes(marks[s.id])).length,
  }

  function setMark(id, value) {
    setMarks((current) => ({ ...current, [id]: value }))
    setDirty(true)
  }

  // Mark All applies to what is on screen. Searching for "Ahmad" and pressing
  // Absent should not mark the other four hundred children absent.
  function markAll(value) {
    setMarks((current) => {
      const next = { ...current }
      for (const s of visible) next[s.id] = value
      return next
    })
    setDirty(true)
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="class_id" value={classId} />
      <input type="hidden" name="section_id" value={sectionId} />

      {/* --------------------------------------------- search and mark all */}
      <div className="card flex flex-wrap items-center gap-3 p-3">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name, ADM or roll no…"
          className="field min-w-56 flex-1"
          aria-label="Search the register"
        />
        {canWrite && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium" style={{ color: 'var(--muted)' }}>
              Mark all{needle ? ' shown' : ''}:
            </span>
            {MARKS.map((mark) => (
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

      {/* ------------------------------------------------------ live counts */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { label: 'Total', value: students.length, tone: 'brand' },
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

      {/* ----------------------------------------------------------- roster */}
      <div className="card overflow-x-auto">
        <table className="table min-w-[58rem]">
          <thead>
            <tr>
              <th>#</th>
              <th>Student</th>
              <th>Father name</th>
              <th>Adm. no</th>
              <th>Roll</th>
              <th>Attendance status</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((s, i) => (
              <tr key={s.id}>
                <td className="tabular-nums" style={{ color: 'var(--muted)' }}>
                  {i + 1}
                </td>
                <td>
                  <div className="flex items-center gap-2.5">
                    <Avatar name={s.name} tone={AVATAR_TONES[i % AVATAR_TONES.length]} />
                    <span className="font-medium" style={{ color: 'var(--ink)' }}>
                      {s.name}
                    </span>
                  </div>
                </td>
                <td>{s.father_name ?? '—'}</td>
                <td>
                  <span className="pill pill-muted font-mono">{s.admission_number ?? '—'}</span>
                </td>
                <td className="tabular-nums">{s.roll_number ?? '—'}</td>
                <td>
                  <div className="flex flex-wrap gap-1">
                    {MARKS.map((mark) => (
                      <MarkButton
                        key={mark.id}
                        mark={mark}
                        on={marks[s.id] === mark.id}
                        onClick={() => canWrite && setMark(s.id, mark.id)}
                      />
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Every student posts, not just the visible ones -- a search filters
          the view, never the register being saved. Rendered outside the table
          so filtering cannot drop anyone from the submission. */}
      {students.map((s) => (
        <div key={s.id} hidden>
          <input type="hidden" name="student_id" value={s.id} />
          <input type="hidden" name="mark" value={marks[s.id] ?? 'present'} />
        </div>
      ))}

      {!visible.length && (
        <p className="py-6 text-center text-sm" style={{ color: 'var(--muted)' }}>
          No student matches “{query}”.
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
