'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Spinner } from '@/components/spinner'
import { useToast } from '@/components/toast'
import { gradeFor, gradeTone, percent } from '@/lib/exam-options'
import { saveTestMarks } from '../../actions'

function SaveButton({ count }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending || count === 0} className="btn btn-primary">
      {pending ? (
        <>
          <Spinner /> Saving…
        </>
      ) : (
        `Save ${count} mark${count === 1 ? '' : 's'}`
      )}
    </button>
  )
}

// The exam sheet's sibling. A test has exactly one subject, so the subject is
// fixed rather than picked, and the paper total comes off the test record.
export default function TestMarksSheet({
  testId,
  subjectId,
  subjectName,
  maxMarks,
  passPercent,
  students,
  existing,
}) {
  const [state, formAction] = useActionState(saveTestMarks, {})
  const [values, setValues] = useState(() =>
    Object.fromEntries(students.map((s) => [s.id, existing[s.id] ?? '']))
  )
  const { success } = useToast()
  const [seen, setSeen] = useState(null)

  if (state?.ok && state.at !== seen) {
    setSeen(state.at)
    queueMicrotask(() => success(state.ok))
  }

  const filled = students.filter((s) => String(values[s.id] ?? '').trim() !== '').length

  return (
    <form action={formAction} className="card overflow-hidden">
      <input type="hidden" name="test_id" value={testId} />
      <input type="hidden" name="subject_id" value={subjectId ?? ''} />
      <input type="hidden" name="max_marks" value={maxMarks} />
      <input type="hidden" name="pass_percent" value={passPercent} />

      <div
        className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3"
        style={{ borderColor: 'var(--border)', background: 'var(--card-alt)' }}
      >
        <div>
          <p
            className="text-[0.68rem] font-bold uppercase tracking-wider"
            style={{ color: 'var(--brand-ink)' }}
          >
            Enter Marks · {subjectName}
          </p>
          <p className="mt-0.5 text-xs" style={{ color: 'var(--muted)' }}>
            out of {maxMarks} · {filled} of {students.length} entered
          </p>
        </div>
        <SaveButton count={filled} />
      </div>

      <div className="max-h-[28rem] overflow-y-auto">
        <table className="table min-w-[36rem]">
          <thead>
            <tr>
              <th>Roll no.</th>
              <th>Student</th>
              <th className="text-right">Marks</th>
              <th className="text-right">%</th>
              <th>Grade</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => {
              const raw = String(values[s.id] ?? '').trim()
              const n = raw === '' ? null : Number(raw)
              const pct = n === null ? null : percent(n, maxMarks)
              const grade = n === null ? null : gradeFor(n, maxMarks, passPercent)
              const invalid = n !== null && (!Number.isFinite(n) || n < 0 || n > maxMarks)

              return (
                <tr key={s.id}>
                  <td>
                    <span className="pill pill-muted font-mono">{s.roll ?? '—'}</span>
                  </td>
                  <td>
                    <span className="font-medium" style={{ color: 'var(--ink)' }}>
                      {s.name}
                    </span>
                    <input type="hidden" name="student_id" value={s.id} />
                  </td>
                  <td className="text-right">
                    <input
                      name="marks_obtained"
                      inputMode="decimal"
                      value={values[s.id] ?? ''}
                      onChange={(event) =>
                        setValues((current) => ({ ...current, [s.id]: event.target.value }))
                      }
                      aria-label={`Marks for ${s.name}`}
                      aria-invalid={invalid || undefined}
                      placeholder="—"
                      className="field w-24 text-right tabular-nums"
                      style={invalid ? { borderColor: 'var(--red)', color: 'var(--red)' } : undefined}
                    />
                  </td>
                  <td className="text-right tabular-nums">{pct === null ? '—' : `${pct}%`}</td>
                  <td>{grade ? <span className={`pill ${gradeTone(grade)}`}>{grade}</span> : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {state?.error && (
        <div className="px-4 py-3">
          <p
            className="rounded-lg px-3 py-2 text-sm"
            style={{ background: 'var(--red-soft)', color: 'var(--red)' }}
          >
            {state.error}
          </p>
        </div>
      )}
    </form>
  )
}
