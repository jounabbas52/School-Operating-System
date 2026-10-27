'use client'

import { useActionState, useState } from 'react'
import SidePanel from '@/components/side-panel'
import { Select } from '@/components/combobox'
import { PanelButton, PanelCancel } from '@/components/submit-button'
import { useCloseOnSuccess } from '@/components/use-close-on-success'
import { saveApplication } from './actions'

// Taking an application: the questions you can answer while somebody is on
// the phone, and no more than that.
//
// Only the name is required. An application arrives half-finished by nature
// -- a parent rings up with a name and a class in mind -- and a form that
// refuses to save without a date of birth just moves the record into
// somebody's notebook, where the school cannot see it.
//
// The full student record is written at enrolment, from the student form.

function Field({ label, children, required, hint, span = 1 }) {
  return (
    <div style={{ gridColumn: `span ${span} / span ${span}` }}>
      <span className="label">
        {label}
        {required && <span style={{ color: 'var(--red)' }}> *</span>}
      </span>
      {children}
      {hint && (
        <p className="mt-1 text-[0.68rem]" style={{ color: 'var(--muted-2)' }}>
          {hint}
        </p>
      )}
    </div>
  )
}

// Controlled when `open` is passed (the row menu opens it), self-managed with
// a trigger button otherwise (the New application button).
export default function ApplicationPanel({ row, classes, trigger, open: openProp, onClose }) {
  const [openSelf, setOpenSelf] = useState(false)
  const controlled = openProp !== undefined
  const open = controlled ? openProp : openSelf
  const close = () => (controlled ? onClose?.() : setOpenSelf(false))

  const [state, formAction, pending] = useActionState(saveApplication, {})
  useCloseOnSuccess(state, close)

  const editing = Boolean(row?.id)

  const t = trigger ?? { label: 'Edit', className: 'btn btn-ghost !px-2.5 !py-1 text-xs' }

  return (
    <>
      {!controlled && (
        <button type="button" onClick={() => setOpenSelf(true)} className={t.className}>
          {t.label}
        </button>
      )}

      <SidePanel
        open={open}
        onClose={close}
        title={editing ? `Application ${row.application_no ?? ''}`.trim() : 'New application'}
        description={
          editing ? row.applicant_name : 'Only the name is needed to start the record'
        }
        icon="✎"
        variant="modal"
        width="max-w-3xl"
        footer={
          <>
            <PanelCancel onClick={close} pending={pending} />
            <PanelButton form="application-form" pending={pending}>
              {editing ? 'Save changes' : 'Take application'}
            </PanelButton>
          </>
        }
      >
        <form id="application-form" action={formAction} className="flex flex-col gap-4">
          {editing && <input type="hidden" name="id" value={row.id} />}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Applicant name" required>
              <input
                name="applicant_name"
                required
                defaultValue={row?.applicant_name ?? ''}
                placeholder="e.g. Ahmed Raza"
                className="field"
              />
            </Field>

            <Field label="Father's name">
              <input
                name="father_name"
                defaultValue={row?.father_name ?? ''}
                className="field"
              />
            </Field>

            <Field label="Phone">
              <input
                name="applicant_phone"
                defaultValue={row?.applicant_phone ?? ''}
                placeholder="03001234567"
                className="field"
              />
            </Field>

            <Field label="Email">
              <input
                name="applicant_email"
                type="email"
                defaultValue={row?.applicant_email ?? ''}
                className="field"
              />
            </Field>

            <Field label="Date of birth">
              <input
                name="date_of_birth"
                type="date"
                defaultValue={row?.date_of_birth ?? ''}
                className="field"
              />
            </Field>

            <Field label="Gender">
              <Select
                name="gender"
                defaultValue={row?.gender ?? ''}
                placeholder="— not said —"
                searchable={false}
                options={[
                  { id: 'male', label: 'Male' },
                  { id: 'female', label: 'Female' },
                  { id: 'other', label: 'Other' },
                ]}
              />
            </Field>

            <Field label="Applying for class" hint="Can be decided later">
              <Select
                name="class_id"
                defaultValue={row?.class_id ?? ''}
                placeholder="— undecided —"
                options={classes}
              />
            </Field>

            <Field label="Date of application">
              <input
                name="inquiry_date"
                type="date"
                defaultValue={row?.inquiry_date ?? new Date().toISOString().slice(0, 10)}
                className="field"
              />
            </Field>

            <Field label="Previous school" span={2}>
              <input
                name="previous_school"
                defaultValue={row?.previous_school ?? ''}
                className="field"
              />
            </Field>

            <Field label="Address" span={2}>
              <input name="address" defaultValue={row?.address ?? ''} className="field" />
            </Field>

            <Field label="Notes" span={2} hint="Anything said on the call worth keeping">
              <textarea name="notes" rows={3} defaultValue={row?.notes ?? ''} className="field" />
            </Field>
          </div>

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
