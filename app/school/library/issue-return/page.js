import Link from 'next/link'
import { getSchoolContext } from '@/lib/school-context'
import { StatCard, StatRow } from '@/components/stats'
import SubmitButton from '@/components/submit-button'
import ExportButtons from '@/components/export-buttons'
import RefreshButton from '@/components/refresh-button'
import ConfirmButton from '@/components/confirm'
import {
  LOAN_STATUS_LABEL,
  LOAN_STATUS_TONE,
  dateLabel,
  daysOverdue,
  fineFor,
  loanState,
  money,
  studentName,
} from '@/lib/operations-options'
import { deleteLoan, markLost, returnBook, waiveFine } from '../actions'
import IssuePanel from './issue-panel'

export const metadata = { title: 'Issue / Return' }

export default async function IssueReturnPage({ searchParams }) {
  const params = await searchParams
  const q = (params?.q ?? '').trim()
  const filter = params?.filter ?? ''

  const { schoolId, permissions, supabase } = await getSchoolContext()
  const canWrite = permissions.has('library.write')

  const [{ data: loanRows, error }, { data: books }, { data: students }] = await Promise.all([
    supabase
      .from('book_loans')
      .select(
        'id, book_id, student_id, loaned_at, due_at, returned_at, fine_amount, status, notes, books(title, book_code, author), students(first_name, last_name, admission_number, current_class_id)'
      )
      .eq('school_id', schoolId)
      .eq('is_deleted', false)
      .order('loaned_at', { ascending: false })
      .limit(500),
    supabase
      .from('books')
      .select('id, title, book_code, total_copies')
      .eq('school_id', schoolId)
      .eq('is_deleted', false)
      .order('title'),
    supabase
      .from('students')
      .select('id, first_name, last_name, admission_number, current_class_id')
      .eq('school_id', schoolId)
      .eq('is_deleted', false)
      .eq('status', 'active')
      .order('first_name'),
  ])

  const { data: classes } = await supabase
    .from('classes')
    .select('id, name, grade_levels(name, ordinal)')
    .eq('school_id', schoolId)
    .eq('is_deleted', false)

  const classById = new Map(
    (classes ?? []).map((c) => [c.id, c.grade_levels?.name ?? c.name])
  )

  const now = new Date()
  const allLoans = (loanRows ?? []).map((l) => ({
    ...l,
    state: loanState(l, now),
    fine: fineFor(l, now),
    overdueDays: daysOverdue(l, now),
  }))

  const needle = q.toLowerCase()
  const loans = allLoans.filter((l) => {
    if (filter && l.state !== filter) return false
    if (!needle) return true
    return [l.books?.title, l.books?.book_code, studentName(l.students), l.students?.admission_number]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(needle))
  })

  const countOf = (state) => allLoans.filter((l) => l.state === state).length
  const totalFine = allLoans.reduce((sum, l) => sum + l.fine, 0)

  // Availability for the issue dialog, counted from open loans.
  const onLoan = new Map()
  for (const l of allLoans) {
    if (l.returned_at || !l.book_id) continue
    onLoan.set(l.book_id, (onLoan.get(l.book_id) ?? 0) + 1)
  }

  const bookOptions = (books ?? []).map((b) => {
    const available = Math.max(0, (Number(b.total_copies) || 0) - (onLoan.get(b.id) ?? 0))
    return {
      id: b.id,
      label: `${b.title}${b.book_code ? ` · ${b.book_code}` : ''} — ${available} available`,
      available,
    }
  })

  const studentOptions = (students ?? []).map((s) => ({
    id: s.id,
    label: `${studentName(s)}${s.admission_number ? ` · ${s.admission_number}` : ''}`,
  }))

  const exportRows = loans.map((l, i) => ({
    n: i + 1,
    book: l.books?.title ?? '',
    code: l.books?.book_code ?? '',
    student: studentName(l.students),
    klass: classById.get(l.students?.current_class_id) ?? '',
    issued: l.loaned_at ? l.loaned_at.slice(0, 10) : '',
    due: l.due_at ? l.due_at.slice(0, 10) : '',
    returned: l.returned_at ? l.returned_at.slice(0, 10) : '',
    fine: l.fine,
    status: LOAN_STATUS_LABEL[l.state] ?? l.state,
  }))

  const TABS = [
    { id: '', label: 'All' },
    { id: 'issued', label: 'Issued' },
    { id: 'overdue', label: 'Overdue' },
    { id: 'returned', label: 'Returned' },
  ]

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>
            Issue / Return
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
            {allLoans.length} total record{allLoans.length === 1 ? '' : 's'} ·{' '}
            {countOf('issued') + countOf('overdue')} currently issued
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <RefreshButton />
          <ExportButtons
            rows={exportRows}
            columns={[
              { key: 'n', label: '#' },
              { key: 'book', label: 'Book' },
              { key: 'code', label: 'Book ID' },
              { key: 'student', label: 'Student' },
              { key: 'klass', label: 'Class' },
              { key: 'issued', label: 'Issued' },
              { key: 'due', label: 'Due date' },
              { key: 'returned', label: 'Returned' },
              { key: 'fine', label: 'Fine' },
              { key: 'status', label: 'Status' },
            ]}
            filename="library-loans"
            title="Library — Issue / Return"
          />
          {canWrite && bookOptions.length > 0 && (
            <IssuePanel
              books={bookOptions}
              students={studentOptions}
              trigger={{ label: '+ Issue Book', className: 'btn btn-primary' }}
            />
          )}
        </div>
      </div>

      <StatRow>
        <StatCard label="Issued" value={countOf('issued')} tone="blue" icon="▤" />
        <StatCard
          label="Overdue"
          value={countOf('overdue')}
          sub={countOf('overdue') ? 'past due date' : 'nothing late'}
          tone="red"
          icon="!"
        />
        <StatCard label="Returned" value={countOf('returned')} tone="green" icon="✓" />
        <StatCard label="Total fine" value={money(totalFine)} tone="amber" icon="₨" />
      </StatRow>

      {/* --------------------------------------------------------- filters */}
      <form className="card flex flex-wrap items-center gap-2 p-3">
        <div className="flex flex-wrap items-center gap-1">
          {TABS.map((t) => (
            <Link
              key={t.id || 'all'}
              href={
                t.id ? `/school/library/issue-return?filter=${t.id}` : '/school/library/issue-return'
              }
              className={`tab !px-2.5 !py-1 ${filter === t.id ? 'tab-on' : ''}`}
            >
              {t.label}
            </Link>
          ))}
        </div>

        <input
          name="q"
          defaultValue={q}
          placeholder="Search book, student…"
          className="field ml-auto min-w-52 max-w-xs"
        />
        {filter && <input type="hidden" name="filter" value={filter} />}
        <button className="btn btn-primary">Search</button>
      </form>

      {error && (
        <p
          className="rounded-lg px-3 py-2 text-sm"
          style={{ background: 'var(--red-soft)', color: 'var(--red-ink)' }}
        >
          {error.message}
        </p>
      )}

      {!loans.length ? (
        <div className="card px-6 py-16 text-center" style={{ borderStyle: 'dashed' }}>
          <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            No records found
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm" style={{ color: 'var(--muted)' }}>
            {q || filter
              ? 'Try adjusting your filters.'
              : bookOptions.length
                ? 'Click "Issue Book" to create the first record.'
                : 'Add books to the catalogue first.'}
          </p>
          {!bookOptions.length && (
            <Link href="/school/library" className="btn btn-primary mt-4">
              Go to Books
            </Link>
          )}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table min-w-[66rem]">
            <thead>
              <tr>
                <th>#</th>
                <th>Book</th>
                <th>Student</th>
                <th>Class</th>
                <th>Issued</th>
                <th>Due Date</th>
                <th>Returned</th>
                <th className="text-right">Fine</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loans.map((l, i) => (
                <tr key={l.id}>
                  <td className="tabular-nums" style={{ color: 'var(--muted)' }}>
                    {i + 1}
                  </td>
                  <td>
                    <span className="font-medium" style={{ color: 'var(--ink)' }}>
                      {l.books?.title ?? '—'}
                    </span>
                    <span className="block text-xs" style={{ color: 'var(--muted)' }}>
                      {l.books?.book_code ?? '—'}
                    </span>
                  </td>
                  <td>
                    <span className="font-medium" style={{ color: 'var(--ink)' }}>
                      {studentName(l.students) || '—'}
                    </span>
                    <span className="block text-xs" style={{ color: 'var(--muted)' }}>
                      {l.students?.admission_number ?? '—'}
                    </span>
                  </td>
                  <td>{classById.get(l.students?.current_class_id) ?? '—'}</td>
                  <td className="tabular-nums">
                    {l.loaned_at ? dateLabel(l.loaned_at.slice(0, 10)) : '—'}
                  </td>
                  <td className="tabular-nums">
                    {l.due_at ? dateLabel(l.due_at.slice(0, 10)) : '—'}
                    {l.state === 'overdue' && (
                      <span className="block text-[0.65rem]" style={{ color: 'var(--red)' }}>
                        {l.overdueDays} day{l.overdueDays === 1 ? '' : 's'} late
                      </span>
                    )}
                  </td>
                  <td className="tabular-nums">
                    {l.returned_at ? dateLabel(l.returned_at.slice(0, 10)) : '—'}
                  </td>
                  <td className="text-right tabular-nums">
                    {l.fine > 0 ? (
                      <span style={{ color: 'var(--red)' }}>{money(l.fine)}</span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    <span className={`pill ${LOAN_STATUS_TONE[l.state] ?? 'pill-muted'}`}>
                      {LOAN_STATUS_LABEL[l.state] ?? l.state}
                    </span>
                  </td>
                  <td>
                    <div className="flex items-center justify-end gap-1.5">
                      {canWrite ? (
                        <>
                          {!l.returned_at && l.state !== 'lost' && (
                            <>
                              <form action={returnBook}>
                                <input type="hidden" name="id" value={l.id} />
                                <SubmitButton pendingLabel="Returning…" className="btn btn-primary !px-2.5 !py-1">
                                  Return
                                </SubmitButton>
                              </form>
                              {l.fine > 0 && (
                                <form action={waiveFine}>
                                  <input type="hidden" name="id" value={l.id} />
                                  <ConfirmButton
                                    className="btn btn-ghost !px-2.5 !py-1"
                                    title="Waive this fine?"
                                    message="The fine is set to zero and stays there — it will not recalculate tomorrow."
                                    confirmLabel="Waive"
                                    danger={false}
                                  >
                                    Waive
                                  </ConfirmButton>
                                </form>
                              )}
                              <form action={markLost}>
                                <input type="hidden" name="id" value={l.id} />
                                <ConfirmButton
                                  className="btn btn-danger !px-2.5 !py-1"
                                  title="Mark this book lost?"
                                  message="The copy stops counting as available. The loan stays on the borrower's record."
                                  confirmLabel="Mark lost"
                                >
                                  Lost
                                </ConfirmButton>
                              </form>
                            </>
                          )}
                          {(l.returned_at || l.state === 'lost') && (
                            <form action={deleteLoan}>
                              <input type="hidden" name="id" value={l.id} />
                              <ConfirmButton
                                className="btn btn-danger !px-2.5 !py-1"
                                title="Remove this record?"
                                message="The loan disappears from the history. The book's availability is unaffected."
                                confirmLabel="Remove"
                              >
                                Delete
                              </ConfirmButton>
                            </form>
                          )}
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
