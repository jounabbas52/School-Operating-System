'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Spinner } from '@/components/spinner'
import SidePanel from '@/components/side-panel'
import { useCloseOnSuccess } from '@/components/use-close-on-success'
import Combobox from '@/components/combobox'
import { issueBook } from '../actions'

function IssueButton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" form="issue-form" disabled={pending} className="btn btn-primary">
      {pending ? (
        <>
          <Spinner /> Issuing…
        </>
      ) : (
        'Issue Book'
      )}
    </button>
  )
}

// The usual loan period. A due date nobody has to type is a due date that
// actually gets set.
const DEFAULT_LOAN_DAYS = 14

export default function IssuePanel({ books, students, trigger }) {
  const [open, setOpen] = useState(false)
  const [state, formAction] = useActionState(issueBook, {})
  useCloseOnSuccess(state, () => setOpen(false))

  const [bookId, setBookId] = useState('')
  const book = books.find((b) => String(b.id) === String(bookId))

  const today = new Date()
  const due = new Date(today.getTime() + DEFAULT_LOAN_DAYS * 86400000)
  const pad = (n) => String(n).padStart(2, '0')
  const asKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={trigger.className}>
        {trigger.label}
      </button>

      <SidePanel
        open={open}
        onClose={() => setOpen(false)}
        title="Issue Book"
        description="Select book and student from the system"
        icon="▤"
        footer={
          <>
            <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost">
              Cancel
            </button>
            <IssueButton />
          </>
        }
      >
        <form id="issue-form" action={formAction} className="flex flex-col gap-4">
          <div>
            <label className="label" htmlFor="is-book">
              Book *
            </label>
            <Combobox
              id="is-book"
              name="book_id"
              required
              placeholder="Search book title or ID…"
              options={books}
              onChangeValue={setBookId}
              emptyLabel="No books in the catalogue."
            />
            {book && book.available === 0 && (
              <p className="mt-1 text-xs" style={{ color: 'var(--red)' }}>
                Every copy of this title is already on loan.
              </p>
            )}
          </div>

          <div>
            <label className="label" htmlFor="is-student">
              Student *
            </label>
            <Combobox
              id="is-student"
              name="student_id"
              required
              placeholder="Search student name or ID…"
              options={students}
              emptyLabel="No active students."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="is-issued">
                Issue Date
              </label>
              <input
                id="is-issued"
                name="loaned_at"
                type="date"
                defaultValue={asKey(today)}
                className="field"
              />
            </div>
            <div>
              <label className="label" htmlFor="is-due">
                Due Date *
              </label>
              <input
                id="is-due"
                name="due_at"
                type="date"
                required
                defaultValue={asKey(due)}
                className="field"
              />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="is-notes">
              Notes
            </label>
            <textarea id="is-notes" name="notes" rows={2} className="field resize-none" />
          </div>

          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            A loan past its due date becomes overdue on its own and starts accruing a fine — nobody
            has to mark it.
          </p>

          {state?.error && (
            <p
              className="rounded-lg px-3 py-2 text-sm"
              style={{ background: 'var(--red-soft)', color: 'var(--red)' }}
            >
              {state.error}
            </p>
          )}
        </form>
      </SidePanel>
    </>
  )
}
