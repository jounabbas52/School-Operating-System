import Link from 'next/link'
import { getSchoolContext } from '@/lib/school-context'
import { StatCard, StatRow } from '@/components/stats'
import ExportButtons from '@/components/export-buttons'
import RefreshButton from '@/components/refresh-button'
import ConfirmButton from '@/components/confirm'
import {
  SHEET_STATUS_LABEL,
  SHEET_STATUS_TONE,
  clock,
  dateLabel,
} from '@/lib/exam-options'
import { deleteEntry, deleteSheet } from './actions'
import EntryPanel from './entry-panel'
import SheetPanel from './sheet-panel'

export const metadata = { title: 'Date Sheet' }

export default async function DateSheetPage({ searchParams }) {
  const params = await searchParams
  const tab = params?.tab === 'sheets' ? 'sheets' : 'schedule'
  const q = (params?.q ?? '').trim()
  const examFilter = params?.exam ?? ''

  const { schoolId, permissions, supabase } = await getSchoolContext()
  const canWrite = permissions.has('exams.write')

  const [{ data: classes }, { data: subjects }, { data: exams }, { data: sessions }] =
    await Promise.all([
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
        .from('exams')
        .select('id, name')
        .eq('school_id', schoolId)
        .eq('is_deleted', false)
        .order('start_date', { ascending: false }),
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
  const examOptions = (exams ?? []).map((e) => ({ id: e.id, label: e.name }))
  // is_current rides along so the create panel can default to the open
  // session without a second query.
  const sessionOptions = (sessions ?? []).map((s) => ({
    id: s.id,
    label: s.name,
    is_current: s.is_current,
  }))

  const classById = new Map(classOptions.map((c) => [c.id, c.label]))
  const subjectById = new Map(subjectOptions.map((s) => [s.id, s.label]))

  const [{ data: entryRows, error: entryError }, { data: sheetRows, error: sheetError }] =
    await Promise.all([
      supabase
        .from('datesheets')
        .select(
          'id, group_id, exam_id, exam_name, subject_id, class_id, section_id, exam_date, day_label, start_time, duration, venue'
        )
        .eq('school_id', schoolId)
        .eq('is_deleted', false)
        .order('exam_date', { ascending: true, nullsFirst: false })
        .order('start_time'),
      supabase
        .from('datesheet_groups')
        .select(
          'id, name, exam_id, exam_name, class_id, session_id, start_date, end_date, instructions, status, notes'
        )
        .eq('school_id', schoolId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false }),
    ])

  const allEntries = entryRows ?? []
  const sheets = sheetRows ?? []

  // Filtering happens here rather than in the query: the subject and class
  // names being searched live in two other tables, and three round trips to
  // search one small list is slower than filtering it in memory.
  const needle = q.toLowerCase()
  const entries = allEntries.filter((e) => {
    if (examFilter && e.exam_id !== examFilter) return false
    if (!needle) return true
    return [
      e.exam_name,
      subjectById.get(e.subject_id),
      classById.get(e.class_id),
      e.venue,
      e.day_label,
    ]
      .filter(Boolean)
      .some((v) => v.toLowerCase().includes(needle))
  })

  // The four tiles count the WHOLE screen, not the filtered view -- a stat
  // that moves when you type in the search box is not a stat.
  const examsScheduled = new Set(
    allEntries.map((e) => e.exam_id ?? e.exam_name).filter(Boolean)
  ).size
  const subjectsCovered = new Set(allEntries.map((e) => e.subject_id).filter(Boolean)).size

  const sheetById = new Map(sheets.map((s) => [s.id, s.name]))

  const entryExport = entries.map((e, i) => ({
    n: i + 1,
    exam: e.exam_name ?? '',
    subject: subjectById.get(e.subject_id) ?? '',
    klass: classById.get(e.class_id) ?? '',
    date: e.exam_date ?? '',
    day: e.day_label ?? '',
    time: e.start_time ? clock(e.start_time) : '',
    duration: e.duration ?? '',
    venue: e.venue ?? '',
  }))

  const sheetExport = sheets.map((s, i) => ({
    n: i + 1,
    name: s.name,
    exam: s.exam_name ?? '',
    klass: classById.get(s.class_id) ?? '',
    start: s.start_date ?? '',
    end: s.end_date ?? '',
    papers: allEntries.filter((e) => e.group_id === s.id).length,
    status: SHEET_STATUS_LABEL[s.status] ?? s.status,
  }))

  const filtered = Boolean(q || examFilter)
  const error = entryError ?? sheetError

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>
            Date Sheet
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
            {allEntries.length} scheduled paper{allEntries.length === 1 ? '' : 's'} ·{' '}
            {sheets.length} date sheet{sheets.length === 1 ? '' : 's'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <RefreshButton />
          <ExportButtons
            rows={tab === 'sheets' ? sheetExport : entryExport}
            columns={
              tab === 'sheets'
                ? [
                    { key: 'n', label: 'Sr.' },
                    { key: 'name', label: 'Date sheet' },
                    { key: 'exam', label: 'Exam' },
                    { key: 'klass', label: 'Class' },
                    { key: 'start', label: 'Starts' },
                    { key: 'end', label: 'Ends' },
                    { key: 'papers', label: 'Papers' },
                    { key: 'status', label: 'Status' },
                  ]
                : [
                    { key: 'n', label: '#' },
                    { key: 'exam', label: 'Exam' },
                    { key: 'subject', label: 'Subject' },
                    { key: 'klass', label: 'Class' },
                    { key: 'date', label: 'Date' },
                    { key: 'day', label: 'Day' },
                    { key: 'time', label: 'Time' },
                    { key: 'duration', label: 'Duration' },
                    { key: 'venue', label: 'Venue' },
                  ]
            }
            filename={tab === 'sheets' ? 'date-sheets' : 'exam-schedule'}
            title={tab === 'sheets' ? 'Date Sheets' : 'Exam Schedule'}
          />
        </div>
      </div>

      <StatRow>
        <StatCard label="Total entries" value={allEntries.length} tone="brand" icon="▤" />
        <StatCard label="Exams scheduled" value={examsScheduled} tone="blue" icon="▣" />
        <StatCard label="Subjects" value={subjectsCovered} tone="green" icon="✎" />
        <StatCard label="Date sheets" value={sheets.length} tone="amber" icon="▦" />
      </StatRow>

      {/* ------------------------------------------------------------ tabs */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1">
          <Link href="/school/datesheet" className={`tab ${tab === 'schedule' ? 'tab-on' : ''}`}>
            Exam Schedule
          </Link>
          <Link
            href="/school/datesheet?tab=sheets"
            className={`tab ${tab === 'sheets' ? 'tab-on' : ''}`}
          >
            Date Sheets
          </Link>
        </div>

        <Link href="/school/datesheet/slips" className="btn btn-ghost">
          Slips
        </Link>
      </div>

      {error && (
        <p
          className="rounded-lg px-3 py-2 text-sm"
          style={{ background: 'var(--red-soft)', color: 'var(--red-ink)' }}
        >
          {error.message}
        </p>
      )}

      {tab === 'schedule' ? (
        <>
          {/* ----------------------------------------------------- filters */}
          <form className="card flex flex-wrap items-center gap-2 p-3">
            <input
              name="q"
              defaultValue={q}
              placeholder="Search subject, class, venue…"
              className="field min-w-56 flex-1"
            />
            <select
              name="exam"
              defaultValue={examFilter}
              className="field w-auto min-w-44"
              aria-label="Filter by exam"
            >
              <option value="">All exams</option>
              {examOptions.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label}
                </option>
              ))}
            </select>
            <button className="btn btn-primary">Search</button>
            {filtered && (
              <Link href="/school/datesheet" className="btn btn-ghost">
                Clear
              </Link>
            )}
            {canWrite && subjectOptions.length > 0 && (
              <div className="ml-auto">
                <EntryPanel
                  classes={classOptions}
                  subjects={subjectOptions}
                  exams={examOptions}
                  sheets={sheets.map((s) => ({ id: s.id, label: s.name }))}
                  trigger={{ label: '+ Add Entry', className: 'btn btn-primary' }}
                />
              </div>
            )}
          </form>

          {!entries.length ? (
            <div className="card px-6 py-16 text-center" style={{ borderStyle: 'dashed' }}>
              <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                No exam entries found
              </p>
              <p className="mx-auto mt-1 max-w-sm text-sm" style={{ color: 'var(--muted)' }}>
                {filtered
                  ? 'Try adjusting your search, or add a new entry.'
                  : subjectOptions.length
                    ? 'Click "Add Entry" to schedule the first exam.'
                    : 'Create subjects first — a paper is scheduled against one.'}
              </p>
              {!subjectOptions.length && (
                <Link href="/school/academics/subjects" className="btn btn-primary mt-4">
                  Go to Subjects
                </Link>
              )}
            </div>
          ) : (
            <div className="card overflow-x-auto">
              <table className="table min-w-[64rem]">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Exam</th>
                    <th>Subject</th>
                    <th>Class</th>
                    <th>Date</th>
                    <th>Day</th>
                    <th>Time</th>
                    <th>Duration</th>
                    <th>Venue</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e, i) => (
                    <tr key={e.id}>
                      <td className="tabular-nums" style={{ color: 'var(--muted)' }}>
                        {i + 1}
                      </td>
                      <td>
                        <span className="font-medium" style={{ color: 'var(--ink)' }}>
                          {e.exam_name ?? '—'}
                        </span>
                        {e.group_id && (
                          <span className="block text-xs" style={{ color: 'var(--muted)' }}>
                            {sheetById.get(e.group_id) ?? '—'}
                          </span>
                        )}
                      </td>
                      <td>
                        <span className="pill pill-brand">
                          {subjectById.get(e.subject_id) ?? '—'}
                        </span>
                      </td>
                      <td>{classById.get(e.class_id) ?? '—'}</td>
                      <td className="tabular-nums">{dateLabel(e.exam_date)}</td>
                      <td>{e.day_label ?? '—'}</td>
                      <td className="tabular-nums">{clock(e.start_time)}</td>
                      <td>{e.duration ?? '—'}</td>
                      <td>{e.venue ?? '—'}</td>
                      <td>
                        <div className="flex items-center justify-end gap-1.5">
                          {canWrite ? (
                            <>
                              <EntryPanel
                                row={e}
                                classes={classOptions}
                                subjects={subjectOptions}
                                exams={examOptions}
                                sheets={sheets.map((s) => ({ id: s.id, label: s.name }))}
                                trigger={{
                                  label: 'Edit',
                                  className: 'btn btn-ghost !px-2.5 !py-1',
                                }}
                              />
                              <form action={deleteEntry}>
                                <input type="hidden" name="id" value={e.id} />
                                <ConfirmButton
                                  className="btn btn-danger !px-2.5 !py-1"
                                  title="Remove this entry?"
                                  message="The paper disappears from the schedule and from any date sheet it was printed on."
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
        </>
      ) : (
        <>
          <div className="card flex flex-wrap items-center justify-between gap-2 p-3">
            <span className="text-sm" style={{ color: 'var(--muted)' }}>
              {sheets.length} date sheet{sheets.length === 1 ? '' : 's'}
            </span>
            {canWrite && (
              <SheetPanel
                classes={classOptions}
                exams={examOptions}
                sessions={sessionOptions}
                trigger={{ label: '+ Create New Date Sheet', className: 'btn btn-primary' }}
              />
            )}
          </div>

          {!sheets.length ? (
            <div className="card px-6 py-16 text-center" style={{ borderStyle: 'dashed' }}>
              <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                No date sheets yet
              </p>
              <p className="mx-auto mt-1 max-w-sm text-sm" style={{ color: 'var(--muted)' }}>
                Click &ldquo;Create New Date Sheet&rdquo; to get started. A date sheet is the
                printable page the scheduled papers appear on.
              </p>
            </div>
          ) : (
            <div className="card overflow-x-auto">
              <table className="table min-w-[56rem]">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Date sheet</th>
                    <th>Exam</th>
                    <th>Class</th>
                    <th>Period</th>
                    <th className="text-right">Papers</th>
                    <th>Status</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sheets.map((s, i) => {
                    const papers = allEntries.filter((e) => e.group_id === s.id).length
                    return (
                      <tr key={s.id}>
                        <td className="tabular-nums" style={{ color: 'var(--muted)' }}>
                          {i + 1}
                        </td>
                        <td>
                          <span className="font-medium" style={{ color: 'var(--ink)' }}>
                            {s.name}
                          </span>
                          {s.notes && (
                            <span className="block text-xs" style={{ color: 'var(--muted)' }}>
                              {s.notes}
                            </span>
                          )}
                        </td>
                        <td>{s.exam_name ?? '—'}</td>
                        <td>{classById.get(s.class_id) ?? 'All classes'}</td>
                        <td className="tabular-nums text-xs">
                          {s.start_date || s.end_date
                            ? `${dateLabel(s.start_date)} → ${dateLabel(s.end_date)}`
                            : '—'}
                        </td>
                        <td className="text-right tabular-nums">{papers}</td>
                        <td>
                          <span className={`pill ${SHEET_STATUS_TONE[s.status] ?? 'pill-muted'}`}>
                            {SHEET_STATUS_LABEL[s.status] ?? s.status}
                          </span>
                        </td>
                        <td>
                          <div className="flex items-center justify-end gap-1.5">
                            {canWrite ? (
                              <>
                                <SheetPanel
                                  row={s}
                                  classes={classOptions}
                                  exams={examOptions}
                                  sessions={sessionOptions}
                                  trigger={{
                                    label: 'Edit',
                                    className: 'btn btn-ghost !px-2.5 !py-1',
                                  }}
                                />
                                <form action={deleteSheet}>
                                  <input type="hidden" name="id" value={s.id} />
                                  <ConfirmButton
                                    className="btn btn-danger !px-2.5 !py-1"
                                    title={`Remove ${s.name}?`}
                                    message="The papers scheduled on it stay in the exam schedule; only the sheet itself goes."
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
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
