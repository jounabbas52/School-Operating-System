import Link from 'next/link'
import { getSchoolContext } from '@/lib/school-context'
import { StatCard, StatRow } from '@/components/stats'
import ExportButtons from '@/components/export-buttons'
import RefreshButton from '@/components/refresh-button'
import ConfirmButton from '@/components/confirm'
import { dateLabel } from '@/lib/exam-options'
import { deleteSlip } from '../actions'
import SlipPanel from './slip-panel'

export const metadata = { title: 'Exam Slips' }

export default async function SlipsPage({ searchParams }) {
  const params = await searchParams
  const q = (params?.q ?? '').trim()
  const sheetFilter = params?.sheet ?? ''

  const { schoolId, permissions, supabase } = await getSchoolContext()
  const canWrite = permissions.has('exams.write')

  const [{ data: sheets }, { data: classes }] = await Promise.all([
    supabase
      .from('datesheet_groups')
      .select('id, name, class_id')
      .eq('school_id', schoolId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false }),
    supabase
      .from('classes')
      .select('id, name, grade_levels(name, ordinal)')
      .eq('school_id', schoolId)
      .eq('is_deleted', false),
  ])

  const classOptions = (classes ?? [])
    .sort((a, b) => (a.grade_levels?.ordinal ?? 999) - (b.grade_levels?.ordinal ?? 999))
    .map((c) => ({ id: c.id, label: c.grade_levels?.name ?? c.name }))
  const sheetOptions = (sheets ?? []).map((s) => ({ id: s.id, label: s.name }))

  const classById = new Map(classOptions.map((c) => [c.id, c.label]))
  const sheetById = new Map(sheetOptions.map((s) => [s.id, s.label]))

  let query = supabase
    .from('exam_slips')
    .select(
      'id, group_id, student_id, student_name, class_id, roll_number, room_number, show_room, show_time, show_signature, issued_at'
    )
    .eq('school_id', schoolId)
    .eq('is_deleted', false)

  if (sheetFilter) query = query.eq('group_id', sheetFilter)

  const { data: slipRows, error } = await query.order('issued_at', { ascending: false })

  const allSlips = slipRows ?? []

  const needle = q.toLowerCase()
  const slips = allSlips.filter((s) => {
    if (!needle) return true
    return [s.student_name, s.roll_number, classById.get(s.class_id)]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(needle))
  })

  // Students for the generate dialog. Only active ones: an admit card for a
  // student who left is a card nobody collects.
  const { data: students } = await supabase
    .from('students')
    .select('id, first_name, last_name, roll_number, current_class_id')
    .eq('school_id', schoolId)
    .eq('is_deleted', false)
    .eq('status', 'active')
    .order('first_name')

  const studentOptions = (students ?? []).map((s) => ({
    id: s.id,
    label: [s.first_name, s.last_name].filter(Boolean).join(' '),
    class_id: s.current_class_id,
    roll_number: s.roll_number,
  }))

  const classesCovered = new Set(allSlips.map((s) => s.class_id).filter(Boolean)).size

  const exportRows = slips.map((s, i) => ({
    n: i + 1,
    student: s.student_name ?? '',
    klass: classById.get(s.class_id) ?? '',
    roll: s.roll_number ?? '',
    sheet: sheetById.get(s.group_id) ?? '',
    room: s.room_number ?? '',
    issued: s.issued_at ? dateLabel(s.issued_at.slice(0, 10)) : '',
  }))

  const filtered = Boolean(q || sheetFilter)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/school/datesheet"
            aria-label="Back to Date Sheet"
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
              Exam Slips
            </h1>
            <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
              Admit cards &amp; roll number slips
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <RefreshButton />
          <ExportButtons
            rows={exportRows}
            columns={[
              { key: 'n', label: '#' },
              { key: 'student', label: 'Student' },
              { key: 'klass', label: 'Class' },
              { key: 'roll', label: 'Roll no.' },
              { key: 'sheet', label: 'Date sheet' },
              { key: 'room', label: 'Room' },
              { key: 'issued', label: 'Issued' },
            ]}
            filename="exam-slips"
            title="Exam Slips"
            subtitle={sheetFilter ? sheetById.get(sheetFilter) : 'All date sheets'}
          />
        </div>
      </div>

      <StatRow>
        <StatCard label="Total slips" value={allSlips.length} tone="brand" icon="▤" />
        <StatCard label="Date sheets" value={sheetOptions.length} tone="blue" icon="▦" />
        <StatCard label="Classes" value={classesCovered} tone="green" icon="◉" />
      </StatRow>

      {/* --------------------------------------------------------- filters */}
      <form className="card flex flex-wrap items-center gap-2 p-3">
        <select
          name="sheet"
          defaultValue={sheetFilter}
          className="field w-auto min-w-48"
          aria-label="Filter by date sheet"
        >
          <option value="">All date sheets</option>
          {sheetOptions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>

        <input
          name="q"
          defaultValue={q}
          placeholder="Search student, roll no, class…"
          className="field min-w-56 flex-1"
        />

        <button className="btn btn-primary">Search</button>
        {filtered && (
          <Link href="/school/datesheet/slips" className="btn btn-ghost">
            Clear
          </Link>
        )}

        {canWrite && sheetOptions.length > 0 && (
          <div className="ml-auto">
            <SlipPanel
              sheets={sheetOptions}
              classes={classOptions}
              students={studentOptions}
              trigger={{ label: '+ Generate New Slip', className: 'btn btn-primary' }}
            />
          </div>
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

      {!slips.length ? (
        <div className="card px-6 py-16 text-center" style={{ borderStyle: 'dashed' }}>
          <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            No slips found
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm" style={{ color: 'var(--muted)' }}>
            {filtered
              ? 'Try adjusting your filters, or generate a new slip.'
              : sheetOptions.length
                ? 'Click "Generate New Slip" to create one.'
                : 'Create a date sheet first — a slip is printed against one.'}
          </p>
          {!sheetOptions.length && (
            <Link href="/school/datesheet?tab=sheets" className="btn btn-primary mt-4">
              Go to Date Sheets
            </Link>
          )}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table min-w-[52rem]">
            <thead>
              <tr>
                <th>#</th>
                <th>Student</th>
                <th>Class</th>
                <th>Roll no.</th>
                <th>Date sheet</th>
                <th>Shows</th>
                <th className="text-right">Options</th>
              </tr>
            </thead>
            <tbody>
              {slips.map((s, i) => (
                <tr key={s.id}>
                  <td className="tabular-nums" style={{ color: 'var(--muted)' }}>
                    {i + 1}
                  </td>
                  <td>
                    <span className="font-medium" style={{ color: 'var(--ink)' }}>
                      {s.student_name ?? '—'}
                    </span>
                  </td>
                  <td>{classById.get(s.class_id) ?? '—'}</td>
                  <td>
                    <span className="pill pill-muted font-mono">{s.roll_number ?? '—'}</span>
                  </td>
                  <td>{sheetById.get(s.group_id) ?? '—'}</td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {s.show_room && <span className="pill pill-brand">Room</span>}
                      {s.show_time && <span className="pill pill-blue">Time</span>}
                      {s.show_signature && <span className="pill pill-green">Signature</span>}
                      {!s.show_room && !s.show_time && !s.show_signature && (
                        <span className="text-xs" style={{ color: 'var(--muted-2)' }}>
                          —
                        </span>
                      )}
                    </div>
                  </td>
                  <td>
                    <div className="flex items-center justify-end gap-1.5">
                      {canWrite ? (
                        <>
                          <SlipPanel
                            row={s}
                            sheets={sheetOptions}
                            classes={classOptions}
                            students={studentOptions}
                            trigger={{ label: 'Edit', className: 'btn btn-ghost !px-2.5 !py-1' }}
                          />
                          <form action={deleteSlip}>
                            <input type="hidden" name="id" value={s.id} />
                            <ConfirmButton
                              className="btn btn-danger !px-2.5 !py-1"
                              title={`Remove ${s.student_name ?? 'this'} slip?`}
                              message="The card can be generated again at any time."
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
