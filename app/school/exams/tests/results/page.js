import Link from 'next/link'
import { getSchoolContext } from '@/lib/school-context'
import { StatCard, StatRow } from '@/components/stats'
import ExportButtons from '@/components/export-buttons'
import RefreshButton from '@/components/refresh-button'
import { dateLabel, gradeFor, gradeTone, percent } from '@/lib/exam-options'
import TestMarksSheet from './test-marks-sheet'

export const metadata = { title: 'Test Results' }

export default async function TestResultsPage({ searchParams }) {
  const params = await searchParams
  const testId = params?.test ?? ''

  const { schoolId, permissions, supabase } = await getSchoolContext()
  const canWrite = permissions.has('tests.write')

  const { data: academicSetting } = await supabase
    .from('settings')
    .select('value')
    .eq('school_id', schoolId)
    .eq('key', 'academic')
    .maybeSingle()

  const passPercent = Number(academicSetting?.value?.pass_marks) || 33

  const [{ data: tests }, { data: subjects }] = await Promise.all([
    supabase
      .from('tests')
      .select('id, test_name, class_id, subject_id, test_date, max_marks, pass_marks, status')
      .eq('school_id', schoolId)
      .eq('is_deleted', false)
      .order('test_date', { ascending: false, nullsFirst: false }),
    supabase
      .from('subjects')
      .select('id, name')
      .eq('school_id', schoolId)
      .eq('is_deleted', false),
  ])

  const subjectById = new Map((subjects ?? []).map((s) => [s.id, s.name]))
  const allTests = tests ?? []
  const test = allTests.find((t) => t.id === testId) ?? null

  let students = []
  let marks = []
  if (test) {
    const [{ data: studentRows }, { data: markRows }] = await Promise.all([
      supabase
        .from('students')
        .select('id, first_name, last_name, roll_number')
        .eq('school_id', schoolId)
        .eq('is_deleted', false)
        .eq('status', 'active')
        .eq('current_class_id', test.class_id)
        .order('roll_number', { nullsFirst: false }),
      supabase
        .from('test_marks')
        .select('id, student_id, marks_obtained, max_marks, grade')
        .eq('school_id', schoolId)
        .eq('is_deleted', false)
        .eq('test_id', test.id),
    ])
    students = studentRows ?? []
    marks = markRows ?? []
  }

  const studentName = (s) => [s.first_name, s.last_name].filter(Boolean).join(' ')
  const markByStudent = new Map(marks.map((m) => [m.student_id, m]))

  const maxMarks = Number(test?.max_marks) || 50
  // The test may carry its own pass mark; the school-wide percentage is the
  // fallback, not the override.
  const testPassPercent = test?.pass_marks
    ? Math.round((Number(test.pass_marks) / maxMarks) * 100)
    : passPercent

  const results = students
    .map((s) => {
      const m = markByStudent.get(s.id)
      const obtained = m ? Number(m.marks_obtained) : null
      const pct = obtained === null ? null : percent(obtained, maxMarks)
      return {
        id: s.id,
        name: studentName(s),
        roll: s.roll_number,
        obtained,
        percent: pct,
        grade: obtained === null ? null : gradeFor(obtained, maxMarks, testPassPercent),
      }
    })
    .sort((a, b) => (b.percent ?? -1) - (a.percent ?? -1))

  const marked = results.filter((r) => r.percent !== null)
  const passed = marked.filter((r) => r.percent >= testPassPercent).length
  const avg = marked.length
    ? Math.round((marked.reduce((sum, r) => sum + r.percent, 0) / marked.length) * 10) / 10
    : 0
  const highest = marked.length ? Math.max(...marked.map((r) => r.obtained)) : null

  const exportRows = results.map((r, i) => ({
    n: i + 1,
    roll: r.roll ?? '',
    name: r.name,
    obtained: r.obtained ?? '',
    max: maxMarks,
    percent: r.percent === null ? '' : `${r.percent}%`,
    grade: r.grade ?? '',
    result: r.percent === null ? 'Not marked' : r.percent >= testPassPercent ? 'Pass' : 'Fail',
  }))

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/school/exams/tests"
            aria-label="Back to Tests"
            className="btn btn-ghost !px-2.5"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <h1 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>
              Test Results
            </h1>
            <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
              {test ? test.test_name : 'Select a test to view results'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <RefreshButton />
          {test && (
            <ExportButtons
              rows={exportRows}
              columns={[
                { key: 'n', label: 'Position' },
                { key: 'roll', label: 'Roll no.' },
                { key: 'name', label: 'Student' },
                { key: 'obtained', label: 'Obtained' },
                { key: 'max', label: 'Total' },
                { key: 'percent', label: '%' },
                { key: 'grade', label: 'Grade' },
                { key: 'result', label: 'Result' },
              ]}
              filename={`test-results-${test.test_name.toLowerCase().replace(/\s+/g, '-')}`}
              title={`${test.test_name} — Results`}
            />
          )}
        </div>
      </div>

      {/* ------------------------------------------------------- test picker */}
      <form className="card flex flex-wrap items-center gap-2 p-3">
        <select name="test" defaultValue={testId} className="field flex-1" aria-label="Select test">
          <option value="">— Select a test —</option>
          {allTests.map((t) => (
            <option key={t.id} value={t.id}>
              {t.test_name} · {subjectById.get(t.subject_id) ?? '—'} · {dateLabel(t.test_date)}
            </option>
          ))}
        </select>
        <button className="btn btn-primary">View</button>
      </form>

      {!test ? (
        <div className="card px-6 py-16 text-center" style={{ borderStyle: 'dashed' }}>
          <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            Select a test above to view results
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm" style={{ color: 'var(--muted)' }}>
            {allTests.length
              ? 'Pick a test to see its marks and enter new ones.'
              : 'No tests have been created yet.'}
          </p>
          {!allTests.length && (
            <Link href="/school/exams/tests" className="btn btn-primary mt-4">
              Go to Tests
            </Link>
          )}
        </div>
      ) : (
        <>
          <StatRow>
            <StatCard label="Students" value={results.length} tone="brand" icon="◉" />
            <StatCard
              label="Marked"
              value={marked.length}
              sub={`${results.length - marked.length} still blank`}
              tone="blue"
              icon="✎"
            />
            <StatCard
              label="Pass rate"
              value={marked.length ? `${Math.round((passed / marked.length) * 100)}%` : '—'}
              sub={`pass mark ${testPassPercent}%`}
              tone="green"
              icon="✓"
            />
            <StatCard
              label="Average"
              value={`${avg}%`}
              sub={highest === null ? 'no marks yet' : `highest ${highest}/${maxMarks}`}
              tone="amber"
              icon="◎"
            />
          </StatRow>

          {canWrite && students.length > 0 && (
            <TestMarksSheet
              testId={test.id}
              subjectId={test.subject_id}
              subjectName={subjectById.get(test.subject_id) ?? 'Subject'}
              maxMarks={maxMarks}
              passPercent={testPassPercent}
              students={students.map((s) => ({
                id: s.id,
                name: studentName(s),
                roll: s.roll_number,
              }))}
              existing={Object.fromEntries(marks.map((m) => [m.student_id, m.marks_obtained]))}
            />
          )}

          {!results.length ? (
            <div className="card px-6 py-16 text-center" style={{ borderStyle: 'dashed' }}>
              <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                No students in this class
              </p>
              <p className="mx-auto mt-1 max-w-sm text-sm" style={{ color: 'var(--muted)' }}>
                This test is set for a class that has no active students.
              </p>
            </div>
          ) : (
            <div className="card overflow-x-auto">
              <table className="table min-w-[44rem]">
                <thead>
                  <tr>
                    <th>Position</th>
                    <th>Roll no.</th>
                    <th>Student</th>
                    <th className="text-right">Obtained</th>
                    <th className="text-right">Total</th>
                    <th className="text-right">%</th>
                    <th>Grade</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, i) => (
                    <tr key={r.id}>
                      <td className="tabular-nums" style={{ color: 'var(--muted)' }}>
                        {r.percent === null ? '—' : i + 1}
                      </td>
                      <td>
                        <span className="pill pill-muted font-mono">{r.roll ?? '—'}</span>
                      </td>
                      <td>
                        <span className="font-medium" style={{ color: 'var(--ink)' }}>
                          {r.name}
                        </span>
                      </td>
                      <td className="text-right tabular-nums">{r.obtained ?? '—'}</td>
                      <td className="text-right tabular-nums">{maxMarks}</td>
                      <td className="text-right tabular-nums">
                        {r.percent === null ? '—' : `${r.percent}%`}
                      </td>
                      <td>
                        {r.grade ? (
                          <span className={`pill ${gradeTone(r.grade)}`}>{r.grade}</span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        {r.percent === null ? (
                          <span className="pill pill-muted">Not marked</span>
                        ) : r.percent >= testPassPercent ? (
                          <span className="pill pill-green">Pass</span>
                        ) : (
                          <span className="pill pill-red">Fail</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
