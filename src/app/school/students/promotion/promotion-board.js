'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Spinner } from '@/components/spinner'
import { useToast } from '@/components/toast'
import { applyPromotion } from '../actions'

const ACTIONS = [
  { id: 'promoted', label: 'Promoted', tone: 'green' },
  { id: 'retained', label: 'Retained', tone: 'amber' },
  { id: 'graduated', label: 'Graduate', tone: 'blue' },
  { id: 'transferred', label: 'Transfer', tone: 'red' },
]

const TONE = {
  green: { on: 'var(--green-soft)', ink: 'var(--green-ink)', edge: 'var(--green)' },
  amber: { on: 'var(--amber-soft)', ink: 'var(--amber-ink)', edge: 'var(--amber)' },
  blue: { on: 'var(--blue-soft)', ink: 'var(--blue-ink)', edge: 'var(--blue)' },
  red: { on: 'var(--red-soft)', ink: 'var(--red-ink)', edge: 'var(--red)' },
}

function ApplyButton({ count }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending || count === 0} className="btn btn-primary">
      {pending ? (
        <>
          <Spinner /> Applying…
        </>
      ) : (
        `Apply promotion${count ? ` (${count})` : ''}`
      )}
    </button>
  )
}

export default function PromotionBoard({ students, fromSession, toSession, toClass, toSection }) {
  const [state, formAction] = useActionState(applyPromotion, {})
  const { success, error } = useToast()

  // Everyone starts selected and set to Promoted -- that is the common case,
  // and the exceptions are what the teacher actually clicks.
  const [rows, setRows] = useState(() =>
    Object.fromEntries(students.map((s) => [s.id, { on: true, action: 'promoted' }]))
  )
  const [seen, setSeen] = useState(null)
  const [query, setQuery] = useState('')

  if (state?.ok && state.at !== seen) {
    setSeen(state.at)
    queueMicrotask(() => success(state.ok))
  }
  if (state?.error && state.at !== seen) {
    setSeen(state.at ?? state.error)
    queueMicrotask(() => error(state.error))
  }

  const selected = students.filter((s) => rows[s.id]?.on)
  const counts = ACTIONS.reduce((acc, a) => {
    acc[a.id] = selected.filter((s) => rows[s.id]?.action === a.id).length
    return acc
  }, {})

  const visible = query.trim()
    ? students.filter((s) =>
        [s.name, s.admission_number, s.father_name]
          .filter(Boolean)
          .some((v) => v.toLowerCase().includes(query.trim().toLowerCase()))
      )
    : students

  const allOn = visible.length > 0 && visible.every((s) => rows[s.id]?.on)

  function toggleAll() {
    setRows((current) => {
      const next = { ...current }
      for (const s of visible) next[s.id] = { ...next[s.id], on: !allOn }
      return next
    })
  }

  function setRow(id, patch) {
    setRows((current) => ({ ...current, [id]: { ...current[id], ...patch } }))
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="from_session" value={fromSession} />
      <input type="hidden" name="to_session" value={toSession} />
      <input type="hidden" name="to_class" value={toClass ?? ''} />
      <input type="hidden" name="to_section" value={toSection ?? ''} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="card p-4">
          <p className="text-xl font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>
            {students.length}
          </p>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            Total students
          </p>
        </div>
        {ACTIONS.map((a) => (
          <div
            key={a.id}
            className="card p-4"
            style={{ background: TONE[a.tone].on, borderColor: TONE[a.tone].edge }}
          >
            <p className="text-xl font-semibold tabular-nums" style={{ color: TONE[a.tone].ink }}>
              {counts[a.id]}
            </p>
            <p className="text-xs" style={{ color: TONE[a.tone].ink }}>
              {a.label}
            </p>
          </div>
        ))}
      </div>

      <div className="card overflow-hidden">
        <div
          className="flex flex-wrap items-center justify-between gap-3 border-b p-3"
          style={{ borderColor: 'var(--border)' }}
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search students…"
            className="field max-w-xs"
          />
          <div className="flex items-center gap-3">
            <span className="text-xs" style={{ color: 'var(--muted)' }}>
              {selected.length} selected
            </span>
            <ApplyButton count={selected.length} />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="table min-w-[46rem]">
            <thead>
              <tr>
                <th style={{ width: '2.5rem' }}>
                  <input
                    type="checkbox"
                    checked={allOn}
                    onChange={toggleAll}
                    aria-label="Select all"
                    className="size-4"
                    style={{ accentColor: 'var(--brand)' }}
                  />
                </th>
                <th>Student</th>
                <th>ID</th>
                <th>Father name</th>
                <th>Section</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((s) => {
                const row = rows[s.id] ?? { on: false, action: 'promoted' }
                return (
                  <tr key={s.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={row.on}
                        onChange={() => setRow(s.id, { on: !row.on })}
                        aria-label={`Include ${s.name}`}
                        className="size-4"
                        style={{ accentColor: 'var(--brand)' }}
                      />
                      {/* Only checked rows post, so the action list on the
                          server lines up index-for-index with the ids. */}
                      {row.on && (
                        <>
                          <input type="hidden" name="student_id" value={s.id} />
                          <input type="hidden" name="student_action" value={row.action} />
                        </>
                      )}
                    </td>
                    <td>
                      <span className="font-medium" style={{ color: 'var(--ink)' }}>
                        {s.name}
                      </span>
                    </td>
                    <td>
                      <span className="pill pill-muted font-mono">{s.admission_number ?? '—'}</span>
                    </td>
                    <td>{s.father_name ?? '—'}</td>
                    <td>{s.section ?? '—'}</td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {ACTIONS.map((a) => {
                          const on = row.action === a.id
                          return (
                            <button
                              key={a.id}
                              type="button"
                              disabled={!row.on}
                              onClick={() => setRow(s.id, { action: a.id })}
                              className="rounded-md px-2 py-1 text-xs font-medium transition disabled:opacity-40"
                              style={{
                                background: on ? TONE[a.tone].on : 'transparent',
                                color: on ? TONE[a.tone].ink : 'var(--muted)',
                                border: `1px solid ${on ? TONE[a.tone].edge : 'var(--border)'}`,
                              }}
                            >
                              {a.label}
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
      </div>

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
