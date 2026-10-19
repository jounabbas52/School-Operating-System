'use client'

import { useActionState, useState } from 'react'
import { Spinner } from '@/components/spinner'
import SidePanel from '@/components/side-panel'
import { useCloseOnSuccess } from '@/components/use-close-on-success'
import Combobox, { Select } from '@/components/combobox'
import {
  COMPLAINT_CATEGORIES,
  COMPLAINT_STATUSES,
  PRIORITIES,
} from '@/lib/operations-options'
import { saveComplaint } from '../actions'

function SaveButton({ editing, pending }) {
  return (
    <button type="submit" form="complaint-form" disabled={pending} className="btn btn-primary">
      {pending ? (
        <>
          <Spinner /> Saving…
        </>
      ) : editing ? (
        'Save changes'
      ) : (
        'Save'
      )}
    </button>
  )
}

export default function ComplaintPanel({ row, students, trigger }) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState(saveComplaint, {})
  useCloseOnSuccess(state, () => setOpen(false))

  const [status, setStatus] = useState(row?.status ?? 'pending')
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
        title={editing ? 'Edit Complaint' : 'New Complaint'}
        description="Logged with a priority and an owner"
        icon="▤"
        width="max-w-lg"
        footer={
          <>
            <button type="button" onClick={() => setOpen(false)} disabled={pending} className="btn btn-ghost">
              Cancel
            </button>
            <SaveButton pending={pending} editing={editing} />
          </>
        }
      >
        <form id="complaint-form" action={formAction} className="flex flex-col gap-4">
          {editing && <input type="hidden" name="id" value={row.id} />}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="cp-name">
                Complainant *
              </label>
              <input
                id="cp-name"
                name="complainant"
                required
                defaultValue={row?.complainant ?? ''}
                className="field"
              />
            </div>
            <div>
              <label className="label" htmlFor="cp-relation">
                Relation
              </label>
              <input
                id="cp-relation"
                name="relation"
                defaultValue={row?.relation ?? ''}
                placeholder="Parent / Student / Staff"
                className="field"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="cp-phone">
                Phone
              </label>
              <input
                id="cp-phone"
                name="phone"
                defaultValue={row?.phone ?? ''}
                placeholder="0300-0000000"
                className="field"
              />
            </div>
            <div>
              <label className="label" htmlFor="cp-date">
                Date
              </label>
              <input
                id="cp-date"
                name="complaint_date"
                type="date"
                defaultValue={row?.complaint_date ?? new Date().toISOString().slice(0, 10)}
                className="field"
              />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="cp-student">
              Related Student <span style={{ color: 'var(--muted-2)' }}>(optional)</span>
            </label>
            <Combobox
              id="cp-student"
              name="student_id"
              defaultValue={row?.student_id ?? ''}
              placeholder="Search student name or ID…"
              options={students}
              emptyLabel="No students on file."
            />
            <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
              Leave blank for a complaint about no particular student — the canteen, say.
            </p>
          </div>

          <div>
            <label className="label" htmlFor="cp-subject">
              Subject *
            </label>
            <input
              id="cp-subject"
              name="subject"
              required
              defaultValue={row?.subject ?? ''}
              className="field"
            />
          </div>

          <div>
            <label className="label" htmlFor="cp-description">
              Description
            </label>
            <textarea
              id="cp-description"
              name="description"
              rows={4}
              defaultValue={row?.description ?? ''}
              className="field resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="cp-category">
                Category
              </label>
              <Select
                id="cp-category"
                name="category"
                defaultValue={row?.category ?? 'general'}
                options={COMPLAINT_CATEGORIES}
              />
            </div>
            <div>
              <label className="label" htmlFor="cp-priority">
                Priority
              </label>
              <Select
                id="cp-priority"
                name="priority"
                defaultValue={row?.priority ?? 'medium'}
                options={PRIORITIES.map((p) => ({ id: p.id, label: p.label }))}
              />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="cp-status">
              Status
            </label>
            <Select
              id="cp-status"
              name="status"
              defaultValue={row?.status ?? 'pending'}
              options={COMPLAINT_STATUSES.map((s) => ({ id: s.id, label: s.label }))}
              onChangeValue={setStatus}
            />
          </div>

          {(status === 'resolved' || status === 'closed') && (
            <div>
              <label className="label" htmlFor="cp-resolution">
                Resolution
              </label>
              <textarea
                id="cp-resolution"
                name="resolution"
                rows={3}
                defaultValue={row?.resolution ?? ''}
                placeholder="What was actually done about it."
                className="field resize-none"
              />
            </div>
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
