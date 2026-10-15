import Link from 'next/link'
import { getSchoolContext } from '@/lib/school-context'
import { StatCard, StatRow } from '@/components/stats'
import ExportButtons from '@/components/export-buttons'
import RefreshButton from '@/components/refresh-button'
import ConfirmButton from '@/components/confirm'
import { BOOK_CATEGORIES, BOOK_CATEGORY_LABEL } from '@/lib/operations-options'
import { deleteBook } from './actions'
import BookPanel from './book-panel'

export const metadata = { title: 'Library — Books' }

export default async function BooksPage({ searchParams }) {
  const params = await searchParams
  const q = (params?.q ?? '').trim()
  const categoryFilter = params?.category ?? ''

  const { schoolId, permissions, supabase } = await getSchoolContext()
  const canWrite = permissions.has('library.write')

  let query = supabase
    .from('books')
    .select(
      'id, book_code, title, author, authors, isbn, publisher, category, total_copies, location, status'
    )
    .eq('school_id', schoolId)
    .eq('is_deleted', false)

  if (categoryFilter) query = query.eq('category', categoryFilter)
  if (q) query = query.or(`title.ilike.%${q}%,author.ilike.%${q}%,isbn.ilike.%${q}%`)

  const [{ data: bookRows, error }, { data: openLoans }] = await Promise.all([
    query.order('title'),
    // Availability is counted from open loans rather than stored on the book,
    // so it cannot drift out of step with the loan table.
    supabase
      .from('book_loans')
      .select('book_id')
      .eq('school_id', schoolId)
      .eq('is_deleted', false)
      .is('returned_at', null),
  ])

  const onLoan = new Map()
  for (const l of openLoans ?? []) {
    if (!l.book_id) continue
    onLoan.set(l.book_id, (onLoan.get(l.book_id) ?? 0) + 1)
  }

  const books = (bookRows ?? []).map((b) => {
    const total = Number(b.total_copies) || 0
    const issued = onLoan.get(b.id) ?? 0
    return { ...b, total, issued, available: Math.max(0, total - issued) }
  })

  const totalCopies = books.reduce((sum, b) => sum + b.total, 0)
  const issuedCopies = books.reduce((sum, b) => sum + b.issued, 0)

  const exportRows = books.map((b, i) => ({
    n: i + 1,
    code: b.book_code ?? '',
    title: b.title,
    author: b.author ?? b.authors ?? '',
    category: BOOK_CATEGORY_LABEL[b.category] ?? b.category ?? '',
    isbn: b.isbn ?? '',
    copies: b.total,
    available: b.available,
    location: b.location ?? '',
  }))

  const filtered = Boolean(q || categoryFilter)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>
            Library — Books
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
            {books.length} title{books.length === 1 ? '' : 's'} · {totalCopies} total copies
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <RefreshButton />
          <ExportButtons
            rows={exportRows}
            columns={[
              { key: 'n', label: '#' },
              { key: 'code', label: 'Book ID' },
              { key: 'title', label: 'Title' },
              { key: 'author', label: 'Author' },
              { key: 'category', label: 'Category' },
              { key: 'isbn', label: 'ISBN' },
              { key: 'copies', label: 'Copies' },
              { key: 'available', label: 'Available' },
              { key: 'location', label: 'Location' },
            ]}
            filename="library-books"
            title="Library Catalogue"
          />
          <Link href="/school/library/issue-return" className="btn btn-ghost">
            Issue / Return
          </Link>
          {canWrite && (
            <BookPanel trigger={{ label: '+ Add Book', className: 'btn btn-primary' }} />
          )}
        </div>
      </div>

      <StatRow>
        <StatCard label="Total books" value={books.length} tone="brand" icon="▤" />
        <StatCard label="Total copies" value={totalCopies} tone="blue" icon="▥" />
        <StatCard label="Available" value={totalCopies - issuedCopies} tone="green" icon="✓" />
        <StatCard label="Issued" value={issuedCopies} tone="amber" icon="▲" />
      </StatRow>

      {/* --------------------------------------------------------- filters */}
      <form className="card flex flex-wrap items-center gap-2 p-3">
        <div className="flex flex-wrap items-center gap-1">
          <Link
            href="/school/library"
            className={`tab !px-2.5 !py-1 ${!categoryFilter ? 'tab-on' : ''}`}
          >
            All
          </Link>
          {BOOK_CATEGORIES.map((c) => (
            <Link
              key={c.id}
              href={`/school/library?category=${c.id}`}
              className={`tab !px-2.5 !py-1 ${categoryFilter === c.id ? 'tab-on' : ''}`}
            >
              {c.label}
            </Link>
          ))}
        </div>

        <input
          name="q"
          defaultValue={q}
          placeholder="Search title, author, ISBN…"
          className="field ml-auto min-w-52 max-w-xs"
        />
        {categoryFilter && <input type="hidden" name="category" value={categoryFilter} />}
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

      {!books.length ? (
        <div className="card px-6 py-16 text-center" style={{ borderStyle: 'dashed' }}>
          <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            No books found
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm" style={{ color: 'var(--muted)' }}>
            {filtered ? 'Try adjusting your filters.' : 'Click "Add Book" to get started.'}
          </p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table min-w-[60rem]">
            <thead>
              <tr>
                <th>Book ID</th>
                <th>Title &amp; Author</th>
                <th>Category</th>
                <th>ISBN</th>
                <th className="text-right">Copies</th>
                <th className="text-right">Available</th>
                <th>Location</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {books.map((b) => (
                <tr key={b.id}>
                  <td>
                    <span className="pill pill-muted font-mono">{b.book_code ?? '—'}</span>
                  </td>
                  <td>
                    <span className="font-medium" style={{ color: 'var(--ink)' }}>
                      {b.title}
                    </span>
                    <span className="block text-xs" style={{ color: 'var(--muted)' }}>
                      {b.author ?? b.authors ?? '—'}
                      {b.publisher ? ` · ${b.publisher}` : ''}
                    </span>
                  </td>
                  <td>
                    <span className="pill pill-brand">
                      {BOOK_CATEGORY_LABEL[b.category] ?? b.category ?? '—'}
                    </span>
                  </td>
                  <td className="font-mono text-xs">{b.isbn ?? '—'}</td>
                  <td className="text-right tabular-nums">{b.total}</td>
                  <td className="text-right tabular-nums">
                    <span
                      className={`pill ${
                        b.available === 0 ? 'pill-red' : b.available <= 2 ? 'pill-amber' : 'pill-green'
                      }`}
                    >
                      {b.available}
                    </span>
                  </td>
                  <td>{b.location ?? '—'}</td>
                  <td>
                    <div className="flex items-center justify-end gap-1.5">
                      {canWrite ? (
                        <>
                          <BookPanel
                            row={b}
                            trigger={{ label: 'Edit', className: 'btn btn-ghost !px-2.5 !py-1' }}
                          />
                          <form action={deleteBook}>
                            <input type="hidden" name="id" value={b.id} />
                            <ConfirmButton
                              className="btn btn-danger !px-2.5 !py-1"
                              title={`Remove ${b.title}?`}
                              message="Loan history for this title stays on file — a record outlives the book."
                              confirmLabel="Remove"
                              disabled={b.issued > 0}
                              buttonTitle={
                                b.issued > 0 ? 'Copies are still out on loan' : undefined
                              }
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
