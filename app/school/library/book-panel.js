'use client'

import { useActionState, useState } from 'react'
import { Spinner } from '@/components/spinner'
import SidePanel from '@/components/side-panel'
import { useCloseOnSuccess } from '@/components/use-close-on-success'
import { Select } from '@/components/combobox'
import { BOOK_CATEGORIES } from '@/lib/operations-options'
import { saveBook } from './actions'

function SaveButton({ editing, pending }) {
  return (
    <button type="submit" form="book-form" disabled={pending} className="btn btn-primary">
      {pending ? (
        <>
          <Spinner /> Saving…
        </>
      ) : editing ? (
        'Save changes'
      ) : (
        'Add Book'
      )}
    </button>
  )
}

export default function BookPanel({ row, trigger }) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState(saveBook, {})
  useCloseOnSuccess(state, () => setOpen(false))

  const editing = Boolean(row)

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={trigger.className}>
        {trigger.label}
      </button>

      <SidePanel
        open={open}
        busy={pending}
        onClose={() => setOpen(false)}
        title={editing ? `Edit ${row.title}` : 'Add New Book'}
        description="Register a new book to the library"
        icon="▤"
        footer={
          <>
            <button type="button" onClick={() => setOpen(false)} disabled={pending} className="btn btn-ghost">
              Cancel
            </button>
            <SaveButton pending={pending} editing={editing} />
          </>
        }
      >
        <form id="book-form" action={formAction} className="flex flex-col gap-4">
          {editing && <input type="hidden" name="id" value={row.id} />}

          <div>
            <label className="label" htmlFor="bk-title">
              Book Title *
            </label>
            <input
              id="bk-title"
              name="title"
              required
              defaultValue={row?.title ?? ''}
              placeholder="e.g. Introduction to Physics"
              className="field"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="bk-author">
                Author
              </label>
              <input
                id="bk-author"
                name="author"
                defaultValue={row?.author ?? row?.authors ?? ''}
                placeholder="e.g. John Smith"
                className="field"
              />
            </div>
            <div>
              <label className="label" htmlFor="bk-category">
                Category
              </label>
              <Select
                id="bk-category"
                name="category"
                defaultValue={row?.category ?? 'general'}
                options={BOOK_CATEGORIES}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="bk-isbn">
                ISBN
              </label>
              <input
                id="bk-isbn"
                name="isbn"
                defaultValue={row?.isbn ?? ''}
                placeholder="e.g. 978-3-16-148410-0"
                className="field"
              />
              <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                Optional — most school stock has none.
              </p>
            </div>
            <div>
              <label className="label" htmlFor="bk-copies">
                Total Copies
              </label>
              <input
                id="bk-copies"
                name="total_copies"
                type="number"
                min="1"
                defaultValue={row?.total_copies ?? 1}
                className="field"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="bk-publisher">
                Publisher
              </label>
              <input
                id="bk-publisher"
                name="publisher"
                defaultValue={row?.publisher ?? ''}
                className="field"
              />
            </div>
            <div>
              <label className="label" htmlFor="bk-location">
                Location / Shelf
              </label>
              <input
                id="bk-location"
                name="location"
                defaultValue={row?.location ?? ''}
                placeholder="e.g. A-12, Shelf 3"
                className="field"
              />
            </div>
          </div>

          {editing && (
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              The total cannot be set below the number of copies currently on loan.
            </p>
          )}

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
