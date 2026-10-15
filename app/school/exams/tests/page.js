import Link from 'next/link'
import { getSchoolContext } from '@/lib/school-context'
import { StatCard, StatRow } from '@/components/stats'
import ExportButtons from '@/components/export-buttons'
import RefreshButton from '@/components/refresh-button'
import ConfirmButton from '@/components/confirm'
import {
  EXAM_STATUSES,
  EXAM_STATUS_LABEL,
  EXAM_STATUS_TONE,
  TEST_TYPE_LABEL,
  dateLabel,
} from '@/lib/exam-options'
import { deleteTest } from '../actions'
import TestPanel from './test-panel'

export const metadata = { title: 'Tests' }

export default async function TestsPage({ searchParams }) {
  const params = await searchParams
  const q = (params?.q ?? '').trim()
  const statusFilter = params?.status ?? ''

  const { schoolId, permissions, supabase } = await getSchoolContext()
  const canWrite = permissions.has('tests.write')

  const [{ data: classes }, { data: subjects }, { data: sessions }] = await Promise.all([
    supabase
      .from('classes')
      .select('id, name, grade_levels(name, ordinal)')
      .eq('school_id', schoolId)
      .eq('is_deleted', false),
    supabase
      .from('subjects')
      .select('id, name')
      .eq('school_id', schoolId)
      .eq('is_deleted', false)
      .order('name'),
    supabase
      .from('sessions')
      .select('id, name, is_current')
      .eq('school_id', schoolId)
      .eq('is_deleted', false)
      .order('start_date', { ascending: false }),
  ])

  const classOptions = (classes ?? [])
    .sort((a, b) => (a.grade_levels?.ordinal ?? 999) - (b.grade_levels?.ordinal ?? 999))
    .map((c) => ({ id: c.id, label: c.grade_levels?.name ?? c.name }))
  const subjectOptions = (subjects ?? []).map((s) => ({ id: s.id, label: s.name }))
  const sessionOptions = (sessions ?? []).map((s) => ({
    id: s.id,
    label: s.name,
    is_current: s.is_current,
  }))

  const classById = new Map(classOptions.map((c) => [c.id, c.label]))
  const subjectById = new Map(subjectOptions.map((s) => [s.id, s.label]))
  const sessionById = new Map(sessionOptions.map((s) => [s.id, s.label]))

  let query = supabase
    .from('tests')
    .select(
      'id, test_name, test_type, class_id, section_id, subject_id, session_id, test_date, max_marks, pass_marks, description, status'
    )
    .eq('school_id', schoolId)
    .eq('is_deleted', false)

  if (statusFilter) query = query.eq('status', statusFilter)

  const { data: testRows, error } = await query.order('test_date', {
    ascending: false,
    nullsFirst: false,
  })

  const allTests = testRows ?? []

  // The class and subject names being searched live in other tables, so this
  // filter runs in memory rather than as three joined queries.
  const needle = q.toLowerCase()
  const tests = allTests.filter((t) => {
    if (!needle) return true
    return [t.test_name, classById.get(t.class_id), subjectById.get(t.subject_id)]
      .filter(Boolean)
      .some((v) => v.toLowerCase().includes(needle))
  })

  const countOf = (status) => allTests.filter((t) => t.status === status).length

  const exportRows = tests.map((t, i) => ({
    n: i + 1,
    name: t.test_name,
    klass: classById.get(t.class_id) ?? '',
    subject: subjectById.get(t.subject_id) ?? '',
    marks: t.max_marks ?? '',
    date: t.test_date ?? '',
    session: sessionById.get(t.session_id) ?? '',
    status: EXAM_STATUS_LABEL[t.status] ?? t.status,
  }))

  const filtered = Boolean(q || statusFilter)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>
            Tests
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
            Quick test &amp; quiz management · {allTests.length} total
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <RefreshButton />
          <ExportButtons
            rows={exportRows}
            columns={[
              { key: 'n', label: '#' },
              { key: 'name', label: 'Test name' },
              { key: 'klass', label: 'Class' },
              { key: 'subject', label: 'Subject' },
              { key: 'marks', label: 'Total marks' },
              { key: 'date', label: 'Date' },
              { key: 'session', label: 'Session' },
              { key: 'status', label: 'Status' },
            ]}
            filename="tests"
            title="Tests"
          />
        </div>
      </div>

      <StatRow>
        <StatCard label="Total tests" value={allTests.length} tone="brand" icon="▤" />
        <StatCard label="Upcoming" value={countOf('upcoming')} tone="blue" icon="▣" />
        <StatCard label="Ongoing" value={countOf('ongoing')} tone="amber" icon="◐" />
        <StatCard label="Completed" value={countOf('completed')} tone="green" icon="✓" />
      </StatRow>

      {/* --------------------------------------------------------- filters */}
      <form className="card flex flex-wrap items-center gap-2 p-3">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search test, subject, class…"
          className="field min-w-56 flex-1"
        />

        <select
          name="status"
          defaultValue={statusFilter}
          className="field w-auto min-w-32"
          aria-label="Filter by status"
        >
          <option value="">All Status</option>
          {EXAM_STATUSES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>

        <button className="btn btn-primary">Search</button>
        {filtered && (
          <Link href="/school/exams/tests" className="btn btn-ghost">
            Clear
          </Link>
        )}

        <div className="ml-auto flex items-center gap-2">
          <Link href="/school/exams/tests/results" className="btn btn-blue">
            Test Results
          </Link>
          {canWrite && classOptions.length > 0 && subjectOptions.length > 0 && (
            <TestPanel
              classes={classOptions}
              subjects={subjectOptions}
              sessions={sessionOptions}
              trigger={{ label: '+ Create Test', className: 'btn btn-primary' }}
            />
          )}
        </div>
      </form>

      {error && (
        <p
          className="rounded-lg px-3 py-2 text-sm"
          style={{ background: 'var(--red-soft)', color: 'var(--red-ink)' }}
        >
          {error.message}
        </p>
      )}

      {!tests.length ? (
        <div className="card px-6 py-16 text-center" style={{ borderStyle: 'dashed' }}>
          <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            No tests found
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm" style={{ color: 'var(--muted)' }}>
            {filtered
              ? 'Try adjusting your search, or create a new test.'
              : classOptions.length && subjectOptions.length
                ? 'Click "Create Test" to add one.'
                : 'Create classes and subjects first — a test is set for one of each.'}
          </p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table min-w-[56rem]">
            <thead>
              <tr>
                <th>#</th>
                <th>Test name</th>
                <th>Class</th>
                <th>Subject</th>
                <th className="text-right">Total marks</th>
                <th>Date</th>
                <th>Session</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tests.map((t, i) => (
                <tr key={t.id}>
                  <td className="tabular-nums" style={{ color: 'var(--muted)' }}>
                    {i + 1}
                  </td>
                  <td>
                    <span className="font-medium" style={{ color: 'var(--ink)' }}>
                      {t.test_name}
                    </span>
                    <span className="block text-xs" style={{ color: 'var(--muted)' }}>
                      {TEST_TYPE_LABEL[t.test_type] ?? t.test_type}
                    </span>
                  </td>
                  <td>{classById.get(t.class_id) ?? '—'}</td>
                  <td>
                    <span className="pill pill-brand">{subjectById.get(t.subject_id) ?? '—'}</span>
                  </td>
                  <td className="text-right tabular-nums">{t.max_marks ?? '—'}</td>
                  <td className="tabular-nums">{dateLabel(t.test_date)}</td>
                  <td>{sessionById.get(t.session_id) ?? '—'}</td>
                  <td>
                    <span className={`pill ${EXAM_STATUS_TONE[t.status] ?? 'pill-muted'}`}>
                      {EXAM_STATUS_LABEL[t.status] ?? t.status}
                    </span>
                  </td>
                  <td>
                    <div className="flex items-center justify-end gap-1.5">
                      <Link
                        href={`/school/exams/tests/results?test=${t.id}`}
                        className="btn btn-ghost !px-2.5 !py-1"
                      >
                        Marks
                      </Link>
                      {canWrite ? (
                        <>
                          <TestPanel
                            row={t}
                            classes={classOptions}
                            subjects={subjectOptions}
                            sessions={sessionOptions}
                            trigger={{ label: 'Edit', className: 'btn btn-ghost !px-2.5 !py-1' }}
                          />
                          <form action={deleteTest}>
                            <input type="hidden" name="id" value={t.id} />
                            <ConfirmButton
                              className="btn btn-danger !px-2.5 !py-1"
                              title={`Remove ${t.test_name}?`}
                              message="Marks entered against this test stay on file but stop appearing in results."
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
