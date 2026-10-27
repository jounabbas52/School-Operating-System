import Link from 'next/link'
import { getSchoolContext } from '@/lib/school-context'
import { StatCard, StatRow } from '@/components/stats'
import ExportButtons from '@/components/export-buttons'
import RefreshButton from '@/components/refresh-button'
import ConfirmButton from '@/components/confirm'
import { EXAM_STATUSES, EXAM_STATUS_LABEL, EXAM_STATUS_TONE, dateLabel } from '@/lib/exam-options'
import { deleteExam } from './actions'
import ExamPanel from './exam-panel'

export const metadata = { title: 'Examination' }

export default async function ExamsPage({ searchParams }) {
  const params = await searchParams
  const q = (params?.q ?? '').trim()
  const classFilter = params?.class ?? ''
  const sessionFilter = params?.session ?? ''
  const statusFilter = params?.status ?? ''

  const { schoolId, permissions, supabase } = await getSchoolContext()
  const canWrite = permissions.has('exams.write')

  const [{ data: classes }, { data: sessions }] = await Promise.all([
    supabase
      .from('classes')
      .select('id, name, grade_levels(name, ordinal)')
      .eq('school_id', schoolId)
      .eq('is_deleted', false),
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
  const sessionOptions = (sessions ?? []).map((s) => ({
    id: s.id,
    label: s.name,
    is_current: s.is_current,
  }))

  const classById = new Map(classOptions.map((c) => [c.id, c.label]))
  const sessionById = new Map(sessionOptions.map((s) => [s.id, s.label]))

  let query = supabase
    .from('exams')
    .select(
      'id, name, class_id, session_id, start_date, end_date, description, status, results_published_at'
    )
    .eq('school_id', schoolId)
    .eq('is_deleted', false)

  if (classFilter) query = query.eq('class_id', classFilter)
  if (sessionFilter) query = query.eq('session_id', sessionFilter)
  if (statusFilter) query = query.eq('status', statusFilter)
  if (q) query = query.or(`name.ilike.%${q}%,description.ilike.%${q}%`)

  const { data: examRows, error } = await query.order('start_date', {
    ascending: false,
    nullsFirst: false,
  })

  const exams = examRows ?? []

  // The tiles count every exam the school has, not the filtered view -- a
  // stat that moves when you pick a filter is not a stat.
  const { data: allForStats } = await supabase
    .from('exams')
    .select('status')
    .eq('school_id', schoolId)
    .eq('is_deleted', false)

  const all = allForStats ?? []
  const countOf = (status) => all.filter((e) => e.status === status).length

  const exportRows = exams.map((e, i) => ({
    n: i + 1,
    name: e.name,
    klass: classById.get(e.class_id) ?? '',
    session: sessionById.get(e.session_id) ?? '',
    start: e.start_date ?? '',
    end: e.end_date ?? '',
    status: EXAM_STATUS_LABEL[e.status] ?? e.status,
    published: e.results_published_at ? 'Yes' : 'No',
  }))

  const filtered = Boolean(q || classFilter || sessionFilter || statusFilter)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>
            Examinations
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
            {all.length} exam{all.length === 1 ? '' : 's'} · {countOf('completed')} completed ·{' '}
            {countOf('upcoming')} upcoming
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <RefreshButton />
          <ExportButtons
            rows={exportRows}
            columns={[
              { key: 'n', label: 'Sr.' },
              { key: 'name', label: 'Exam' },
              { key: 'klass', label: 'Class' },
              { key: 'session', label: 'Session' },
              { key: 'start', label: 'Starts' },
              { key: 'end', label: 'Ends' },
              { key: 'status', label: 'Status' },
              { key: 'published', label: 'Results published' },
            ]}
            filename="examinations"
            title="Examinations"
          />
          <Link href="/school/exams/results" className="btn btn-ghost">
            View Results
          </Link>
          {canWrite && classOptions.length > 0 && (
            <ExamPanel
              classes={classOptions}
              sessions={sessionOptions}
              trigger={{ label: '+ Create Exam', className: 'btn btn-primary' }}
            />
          )}
        </div>
      </div>

      <StatRow>
        <StatCard label="Total exams" value={all.length} tone="brand" icon="▣" />
        <StatCard label="Upcoming" value={countOf('upcoming')} tone="blue" icon="▤" />
        <StatCard label="Ongoing" value={countOf('ongoing')} tone="amber" icon="◐" />
        <StatCard label="Completed" value={countOf('completed')} tone="green" icon="✓" />
      </StatRow>

      {/* --------------------------------------------------------- filters */}
      <form className="card flex flex-wrap items-center gap-2 p-3">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search exams…"
          className="field min-w-52 flex-1"
        />

        <select
          name="class"
          defaultValue={classFilter}
          className="field w-auto min-w-36"
          aria-label="Filter by class"
        >
          <option value="">All classes</option>
          {classOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>

        <select
          name="session"
          defaultValue={sessionFilter}
          className="field w-auto min-w-36"
          aria-label="Filter by session"
        >
          <option value="">All sessions</option>
          {sessionOptions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>

        <select
          name="status"
          defaultValue={statusFilter}
          className="field w-auto min-w-32"
          aria-label="Filter by status"
        >
          <option value="">All status</option>
          {EXAM_STATUSES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>

        <button className="btn btn-primary">Search</button>
        {filtered && (
          <Link href="/school/exams" className="btn btn-ghost">
            Clear
          </Link>
        )}
      </form>

      {error && (
        <p
          className="rounded-lg px-3 py-2 text-sm"
          style={{ background: 'var(--red-soft)', color: 'var(--red-ink)' }}
        >
          {error.message}
        </p>
      )}

      {!exams.length ? (
        <div className="card px-6 py-16 text-center" style={{ borderStyle: 'dashed' }}>
          <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            No exams found
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm" style={{ color: 'var(--muted)' }}>
            {filtered
              ? 'Try adjusting your search or filters, or create a new exam.'
              : classOptions.length
                ? 'Use Create Exam to announce the first one.'
                : 'Create classes first — an exam is announced for a class.'}
          </p>
          {!classOptions.length && (
            <Link href="/school/academics/classes" className="btn btn-primary mt-4">
              Go to Classes
            </Link>
          )}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table min-w-[56rem]">
            <thead>
              <tr>
                <th>#</th>
                <th>Exam</th>
                <th>Class</th>
                <th>Session</th>
                <th>Starts</th>
                <th>Ends</th>
                <th>Status</th>
                <th>Results</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {exams.map((e, i) => (
                <tr key={e.id}>
                  <td className="tabular-nums" style={{ color: 'var(--muted)' }}>
                    {i + 1}
                  </td>
                  <td>
                    <span className="font-medium" style={{ color: 'var(--ink)' }}>
                      {e.name}
                    </span>
                    {e.description && (
                      <span className="block max-w-xs truncate text-xs" style={{ color: 'var(--muted)' }}>
                        {e.description}
                      </span>
                    )}
                  </td>
                  <td>
                    <span className="pill pill-brand">{classById.get(e.class_id) ?? '—'}</span>
                  </td>
                  <td>{sessionById.get(e.session_id) ?? '—'}</td>
                  <td className="tabular-nums">{dateLabel(e.start_date)}</td>
                  <td className="tabular-nums">{dateLabel(e.end_date)}</td>
                  <td>
                    <span className={`pill ${EXAM_STATUS_TONE[e.status] ?? 'pill-muted'}`}>
                      {EXAM_STATUS_LABEL[e.status] ?? e.status}
                    </span>
                  </td>
                  <td>
                    {e.results_published_at ? (
                      <span className="pill pill-green">Published</span>
                    ) : (
                      <span className="pill pill-muted">Unpublished</span>
                    )}
                  </td>
                  <td>
                    <div className="flex items-center justify-end gap-1.5">
                      <Link
                        href={`/school/exams/results?exam=${e.id}`}
                        className="btn btn-ghost !px-2.5 !py-1"
                      >
                        Results
                      </Link>
                      {canWrite ? (
                        <>
                          <ExamPanel
                            row={e}
                            classes={classOptions}
                            sessions={sessionOptions}
                            trigger={{ label: 'Edit', className: 'btn btn-ghost !px-2.5 !py-1' }}
                          />
                          <form action={deleteExam}>
                            <input type="hidden" name="id" value={e.id} />
                            <ConfirmButton
                              className="btn btn-danger !px-2.5 !py-1"
                              title={`Remove ${e.name}?`}
                              message="Marks already entered against this exam stay on file but stop appearing in results."
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
