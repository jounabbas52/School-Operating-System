import Link from 'next/link'
import { getSchoolContext } from '@/lib/school-context'
import { StatCard, StatRow } from '@/components/stats'
import ExportButtons from '@/components/export-buttons'
import RefreshButton from '@/components/refresh-button'
import {
  EXAM_STATUS_LABEL,
  GRADE_SCALE,
  dateLabel,
  gradeFor,
  gradeTone,
  percent,
} from '@/lib/exam-options'
import MarksSheet from './marks-sheet'

export const metadata = { title: 'Exam Results' }

export default async function ExamResultsPage({ searchParams }) {
  const params = await searchParams
  const examId = params?.exam ?? ''
  const subjectId = params?.subject ?? ''
  const sessionFilter = params?.session ?? ''

  const { schoolId, permissions, supabase } = await getSchoolContext()
  const canWrite = permissions.has('exams.write')

  // The school's pass mark, so a 38% is not graded D in a school that passes
  // at 40. Settings is a key/value table; a missing row means the default.
  const { data: academicSetting } = await supabase
    .from('settings')
    .select('value')
    .eq('school_id', schoolId)
    .eq('key', 'academic')
    .maybeSingle()

  const passPercent = Number(academicSetting?.value?.pass_marks) || 33

  const [{ data: sessions }, { data: exams }, { data: subjects }] = await Promise.all([
    supabase
      .from('sessions')
      .select('id, name')
      .eq('school_id', schoolId)
      .eq('is_deleted', false)
      .order('start_date', { ascending: false }),
    supabase
      .from('exams')
      .select('id, name, class_id, session_id, start_date, end_date, status, results_published_at')
      .eq('school_id', schoolId)
      .eq('is_deleted', false)
      .order('start_date', { ascending: false, nullsFirst: false }),
    supabase
      .from('subjects')
      .select('id, name')
      .eq('school_id', schoolId)
      .eq('is_deleted', false)
      .order('name'),
  ])

  const sessionOptions = (sessions ?? []).map((s) => ({ id: s.id, label: s.name }))
  const subjectOptions = (subjects ?? []).map((s) => ({ id: s.id, label: s.name }))
  const subjectById = new Map(subjectOptions.map((s) => [s.id, s.label]))

  // Results are a completed exam's business. An exam still running has
  // half-entered marks, and a ranked list of those is actively misleading.
  const completed = (exams ?? []).filter(
    (e) => e.status === 'completed' && (!sessionFilter || e.session_id === sessionFilter)
  )

  const exam = completed.find((e) => e.id === examId) ?? null

  // Nothing further to fetch until an exam is chosen.
  let students = []
  let marks = []
  if (exam) {
    const [{ data: studentRows }, { data: markRows }] = await Promise.all([
      supabase
        .from('students')
        .select('id, first_name, last_name, roll_number, current_class_id')
        .eq('school_id', schoolId)
        .eq('is_deleted', false)
        .eq('status', 'active')
        .eq('current_class_id', exam.class_id)
        .order('roll_number', { nullsFirst: false }),
      supabase
        .from('marks')
        .select('id, student_id, subject_id, marks_obtained, max_marks, grade')
        .eq('school_id', schoolId)
        .eq('is_deleted', false)
        .eq('exam_id', exam.id),
    ])
    students = studentRows ?? []
    marks = markRows ?? []
  }

  const studentName = (s) => [s.first_name, s.last_name].filter(Boolean).join(' ')

  // One student's totals across every subject marked for this exam.
  const byStudent = new Map()
  for (const m of marks) {
    const row = byStudent.get(m.student_id) ?? { obtained: 0, max: 0, subjects: 0 }
    row.obtained += Number(m.marks_obtained) || 0
    row.max += Number(m.max_marks) || 0
    row.subjects += 1
    byStudent.set(m.student_id, row)
  }

  const results = students
    .map((s) => {
      const totals = byStudent.get(s.id) ?? { obtained: 0, max: 0, subjects: 0 }
      const pct = totals.max > 0 ? percent(totals.obtained, totals.max) : null
      return {
        id: s.id,
        name: studentName(s),
        roll: s.roll_number,
        obtained: totals.obtained,
        max: totals.max,
        subjects: totals.subjects,
        percent: pct,
        grade: totals.max > 0 ? gradeFor(totals.obtained, totals.max, passPercent) : null,
      }
    })
    // Unmarked students sort last rather than first -- a zero they never sat
    // is not a rank.
    .sort((a, b) => (b.percent ?? -1) - (a.percent ?? -1))

  const marked = results.filter((r) => r.percent !== null)
  const passed = marked.filter((r) => r.percent >= passPercent).length
  const avgScore = marked.length
    ? Math.round((marked.reduce((sum, r) => sum + r.percent, 0) / marked.length) * 10) / 10
    : 0

  // The marks sheet works one subject at a time, which is how a paper is
  // actually marked.
  const sheetSubject = subjectId || subjectOptions[0]?.id || ''
  const sheetMarks = marks.filter((m) => m.subject_id === sheetSubject)
  const sheetMaxMarks =
    sheetMarks.find((m) => Number(m.max_marks) > 0)?.max_marks ?? 100

  const exportRows = results.map((r, i) => ({
    n: i + 1,
    roll: r.roll ?? '',
    name: r.name,
    subjects: r.subjects,
    obtained: r.obtained,
    max: r.max,
    percent: r.percent === null ? '' : `${r.percent}%`,
    grade: r.grade ?? '',
    result: r.percent === null ? 'Not marked' : r.percent >= passPercent ? 'Pass' : 'Fail',
  }))

  const gradeCounts = GRADE_SCALE.map((g) => ({
    ...g,
    count: marked.filter((r) => r.grade === g.grade).length,
  }))

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>
            Exam Results
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
            View and analyse student performance across examinations.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <RefreshButton />
          {exam && (
            <ExportButtons
              rows={exportRows}
              columns={[
                { key: 'n', label: 'Position' },
                { key: 'roll', label: 'Roll no.' },
                { key: 'name', label: 'Student' },
                { key: 'subjects', label: 'Subjects' },
                { key: 'obtained', label: 'Obtained' },
                { key: 'max', label: 'Total' },
                { key: 'percent', label: '%' },
                { key: 'grade', label: 'Grade' },
                { key: 'result', label: 'Result' },
              ]}
              filename={`results-${exam.name.toLowerCase().replace(/\s+/g, '-')}`}
              title={`${exam.name} — Results`}
              subtitle={`${marked.length} of ${results.length} students marked`}
            />
          )}
          <Link href="/school/exams" className="btn btn-ghost">
            All Exams
          </Link>
        </div>
      </div>

      {/* ------------------------------------------------------- exam picker */}
      <form className="card flex flex-wrap items-center gap-3 p-4">
        <div className="flex min-w-56 flex-1 flex-col gap-1.5">
          <span className="label !mb-0">Select Examination</span>
          {completed.length ? (
            <select name="exam" defaultValue={examId} className="field" aria-label="Examination">
              <option value="">— Choose a completed exam —</option>
              {completed.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} · {dateLabel(e.start_date)}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-sm" style={{ color: 'var(--brand-ink)' }}>
              No completed exams available yet.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="label !mb-0">Session</span>
          <select
            name="session"
            defaultValue={sessionFilter}
            className="field w-auto min-w-36"
            aria-label="Filter by session"
          >
            <option value="">All Sessions</option>
            {sessionOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        {exam && subjectOptions.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="label !mb-0">Marks sheet subject</span>
            <select
              name="subject"
              defaultValue={sheetSubject}
              className="field w-auto min-w-40"
              aria-label="Marks sheet subject"
            >
              {subjectOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <button className="btn btn-primary self-end">Apply</button>
        {(examId || sessionFilter) && (
          <Link href="/school/exams/results" className="btn btn-ghost self-end">
            Clear
          </Link>
        )}
      </form>

      {!exam ? (
        <div className="card px-6 py-16 text-center" style={{ borderStyle: 'dashed' }}>
          <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            {completed.length ? 'Select an examination above' : 'No completed exams available yet'}
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm" style={{ color: 'var(--muted)' }}>
            {completed.length
              ? 'Pick an exam to see its results and enter marks.'
              : 'An exam shows up here once its status is set to Completed.'}
          </p>
          {!completed.length && (
            <Link href="/school/exams" className="btn btn-primary mt-4">
              Go to Examinations
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
              sub={`${passed} of ${marked.length} passed`}
              tone="green"
              icon="✓"
            />
            <StatCard label="Average score" value={`${avgScore}%`} tone="amber" icon="◎" />
          </StatRow>

          {/* ------------------------------------------- grade distribution */}
          <div className="card p-4">
            <p
              className="mb-3 text-[0.68rem] font-bold uppercase tracking-wider"
              style={{ color: 'var(--brand-ink)' }}
            >
              Grade Distribution
            </p>
            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {gradeCounts.map((g) => (
                <div
                  key={g.grade}
                  className="rounded-xl px-3 py-3 text-center"
                  style={{ background: 'var(--card-alt)', border: '1px solid var(--border-soft)' }}
                >
                  <p className="text-lg font-semibold" style={{ color: g.colour }}>
                    {g.grade}
                  </p>
                  <p className="text-sm font-medium tabular-nums" style={{ color: 'var(--ink)' }}>
                    {g.count}
                  </p>
                  <p className="text-[0.65rem]" style={{ color: 'var(--muted)' }}>
                    {marked.length ? Math.round((g.count / marked.length) * 100) : 0}% of total
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* ------------------------------------------------- marks entry */}
          {canWrite && subjectOptions.length > 0 && students.length > 0 && (
            <MarksSheet
              examId={exam.id}
              subjectId={sheetSubject}
              subjectName={subjectById.get(sheetSubject) ?? 'Subject'}
              maxMarks={sheetMaxMarks}
              passPercent={passPercent}
              students={students.map((s) => ({
                id: s.id,
                name: studentName(s),
                roll: s.roll_number,
              }))}
              existing={Object.fromEntries(sheetMarks.map((m) => [m.student_id, m.marks_obtained]))}
            />
          )}

          {/* ----------------------------------------------------- results */}
          {!results.length ? (
            <div className="card px-6 py-16 text-center" style={{ borderStyle: 'dashed' }}>
              <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                No students in this class
              </p>
              <p className="mx-auto mt-1 max-w-sm text-sm" style={{ color: 'var(--muted)' }}>
                This exam is announced for a class that has no active students.
              </p>
            </div>
          ) : (
            <div className="card overflow-x-auto">
              <table className="table min-w-[52rem]">
                <thead>
                  <tr>
                    <th>Position</th>
                    <th>Roll no.</th>
                    <th>Student</th>
                    <th className="text-right">Subjects</th>
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
                      <td className="text-right tabular-nums">{r.subjects}</td>
                      <td className="text-right tabular-nums">{r.obtained || '—'}</td>
                      <td className="text-right tabular-nums">{r.max || '—'}</td>
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
                        ) : r.percent >= passPercent ? (
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

          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            {exam.name} · {EXAM_STATUS_LABEL[exam.status] ?? exam.status} · pass mark {passPercent}%
            {exam.results_published_at ? ' · results published' : ' · results not published'}
          </p>
        </>
      )}
    </div>
  )
}
