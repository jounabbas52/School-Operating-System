'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { BOOK_CATEGORY_IDS, FINE_PER_DAY, daysOverdue } from '@/lib/operations-options'

// Authority is RLS. books and book_loans carry the standard tenant policy set
// against library.read / library.write. What follows is input shaping.

const PATHS = ['/school/library', '/school/library/issue-return']

function revalidateAll() {
  for (const p of PATHS) revalidatePath(p)
  revalidatePath('/school')
}

function pgMessage(error, subject = 'book') {
  if (error.code === '23505') {
    if (error.message.includes('isbn')) return 'A book with that ISBN already exists.'
    if (error.message.includes('book_code')) return 'That book ID is already used.'
    return `That ${subject} already exists.`
  }
  if (error.code === '42501') return `You do not have permission to change ${subject}s.`
  if (error.code === '23503') return 'A linked record no longer exists. Reload and try again.'
  return error.message
}

async function ctx() {
  const supabase = await createClient()
  const { data: schoolId } = await supabase.rpc('current_school_id')
  return { supabase, schoolId }
}

const text = (v) => {
  const s = String(v ?? '').trim()
  return s === '' ? null : s
}
const num = (v) => {
  const s = String(v ?? '').trim()
  if (s === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}
const ok = (message) => ({ ok: message, at: Date.now() })

/* =================================================================== books */

export async function saveBook(_prev, formData) {
  const id = text(formData.get('id'))
  const title = text(formData.get('title'))

  if (!title) return { error: 'Enter the book title.' }

  const copies = num(formData.get('total_copies')) ?? 1
  if (copies < 1) return { error: 'A book needs at least one copy.' }

  const category = text(formData.get('category')) ?? 'general'
  if (!BOOK_CATEGORY_IDS.includes(category)) return { error: 'Unknown category.' }

  const { supabase, schoolId } = await ctx()
  if (!schoolId) return { error: 'No active school.' }

  // Reducing the copy count below what is currently out on loan would make
  // available_copies negative, which reads as a catalogue error rather than
  // what it is: somebody mistyped.
  if (id) {
    const { count } = await supabase
      .from('book_loans')
      .select('id', { count: 'exact', head: true })
      .eq('school_id', schoolId)
      .eq('book_id', id)
      .eq('is_deleted', false)
      .is('returned_at', null)

    if ((count ?? 0) > copies) {
      return {
        error: `${count} ${count === 1 ? 'copy is' : 'copies are'} currently on loan — the total cannot be lower than that.`,
      }
    }
  }

  const author = text(formData.get('author'))

  const payload = {
    school_id: schoolId,
    title,
    author,
    // `authors` is the column schema.sql shipped; kept in step so nothing
    // written before this screen existed starts disagreeing with it.
    authors: author,
    isbn: text(formData.get('isbn')),
    publisher: text(formData.get('publisher')),
    category,
    total_copies: copies,
    location: text(formData.get('location')),
    status: 'active',
  }

  if (id) {
    const { error } = await supabase.from('books').update(payload).eq('id', id)
    if (error) return { error: pgMessage(error) }
  } else {
    const { data: code } = await supabase.rpc('next_book_code', {
      p_school: schoolId,
      p_prefix: 'BK',
    })

    const { error } = await supabase.from('books').insert({ ...payload, book_code: code })
    if (error) return { error: pgMessage(error) }
  }

  revalidateAll()
  return ok(id ? `${title} updated.` : `${title} added.`)
}

export async function deleteBook(formData) {
  const id = String(formData.get('id'))
  const { supabase } = await ctx()

  // Soft delete: loan history points here and outlives the physical book.
  const { error } = await supabase
    .from('books')
    .update({ is_deleted: true, deleted_at: new Date().toISOString(), status: 'archived' })
    .eq('id', id)

  if (error) throw new Error(pgMessage(error))
  revalidateAll()
}

/* =================================================================== loans */

export async function issueBook(_prev, formData) {
  const bookId = text(formData.get('book_id'))
  const studentId = text(formData.get('student_id'))
  const dueDate = text(formData.get('due_at'))

  if (!bookId) return { error: 'Choose a book.' }
  if (!studentId) return { error: 'Choose a student.' }
  if (!dueDate) return { error: 'Choose a due date.' }

  const { supabase, schoolId } = await ctx()
  if (!schoolId) return { error: 'No active school.' }

  const [{ data: book }, { count: onLoan }] = await Promise.all([
    supabase.from('books').select('id, title, total_copies').eq('id', bookId).maybeSingle(),
    supabase
      .from('book_loans')
      .select('id', { count: 'exact', head: true })
      .eq('school_id', schoolId)
      .eq('book_id', bookId)
      .eq('is_deleted', false)
      .is('returned_at', null),
  ])

  if (!book) return { error: 'That book no longer exists.' }

  // Availability is counted, not stored -- see the book_availability view in
  // 012. Checking it here is what stops the library lending its eleventh copy
  // of a ten-copy title.
  if ((onLoan ?? 0) >= (Number(book.total_copies) || 0)) {
    return { error: `Every copy of "${book.title}" is already on loan.` }
  }

  // One unreturned copy per borrower per title: a second issue is nearly
  // always the clerk not seeing the first.
  const { data: existing } = await supabase
    .from('book_loans')
    .select('id')
    .eq('school_id', schoolId)
    .eq('book_id', bookId)
    .eq('student_id', studentId)
    .eq('is_deleted', false)
    .is('returned_at', null)
    .maybeSingle()

  if (existing) return { error: 'That student already has this book out.' }

  const issuedAt = text(formData.get('loaned_at'))

  const { error } = await supabase.from('book_loans').insert({
    school_id: schoolId,
    book_id: bookId,
    student_id: studentId,
    loaned_at: issuedAt ? `${issuedAt}T00:00:00Z` : new Date().toISOString(),
    due_at: `${dueDate}T23:59:59Z`,
    status: 'issued',
    fine_amount: 0,
    notes: text(formData.get('notes')),
  })

  if (error) return { error: pgMessage(error, 'loan') }

  revalidateAll()
  return ok(`"${book.title}" issued.`)
}

export async function returnBook(formData) {
  const id = String(formData.get('id'))
  const { supabase } = await ctx()

  const { data: loan } = await supabase
    .from('book_loans')
    .select('id, due_at, returned_at, fine_amount')
    .eq('id', id)
    .maybeSingle()

  if (!loan) throw new Error('That loan no longer exists.')
  if (loan.returned_at) throw new Error('That book has already been returned.')

  // The fine is computed at the moment of return and STORED. Leaving it
  // derived would grow the fine on a settled loan every day afterwards.
  const overdue = daysOverdue(loan)
  const fine = Number(loan.fine_amount) > 0 ? Number(loan.fine_amount) : overdue * FINE_PER_DAY

  const { error } = await supabase
    .from('book_loans')
    .update({
      returned_at: new Date().toISOString(),
      status: 'returned',
      fine_amount: fine,
    })
    .eq('id', id)

  if (error) throw new Error(pgMessage(error, 'loan'))
  revalidateAll()
}

export async function markLost(formData) {
  const id = String(formData.get('id'))
  const { supabase } = await ctx()

  const { error } = await supabase.from('book_loans').update({ status: 'lost' }).eq('id', id)
  if (error) throw new Error(pgMessage(error, 'loan'))
  revalidateAll()
}

export async function waiveFine(formData) {
  const id = String(formData.get('id'))
  const { supabase } = await ctx()

  // Written as an explicit zero, not a null: fineFor() treats a stored figure
  // as final, so zero is how a waiver survives the next page load.
  const { error } = await supabase.from('book_loans').update({ fine_amount: 0 }).eq('id', id)
  if (error) throw new Error(pgMessage(error, 'loan'))
  revalidateAll()
}

export async function deleteLoan(formData) {
  const id = String(formData.get('id'))
  const { supabase } = await ctx()

  const { error } = await supabase
    .from('book_loans')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw new Error(pgMessage(error, 'loan'))
  revalidateAll()
}
