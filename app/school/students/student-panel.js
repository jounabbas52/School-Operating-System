'use client'

import { useActionState, useState } from 'react'
import SidePanel from '@/components/side-panel'
import { Select } from '@/components/combobox'
import { Spinner } from '@/components/spinner'
import { useCloseOnSuccess } from '@/components/use-close-on-success'
import ImageUpload from '@/components/image-upload'
import { PHOTOS } from '@/lib/storage'
import { saveStudent } from './actions'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const BLOOD = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']

function SaveButton({ editing, pending }) {
  return (
    <button type="submit" form="student-form" disabled={pending} className="btn btn-primary">
      {pending ? (
        <>
          <Spinner /> Saving…
        </>
      ) : editing ? (
        'Save changes'
      ) : (
        'Save admission'
      )}
    </button>
  )
}

function Field({ label, children, required, hint, span = 1 }) {
  return (
    <div style={{ gridColumn: `span ${span} / span ${span}` }}>
      <span className="label">
        {label}
        {required && <span style={{ color: 'var(--red)' }}> *</span>}
      </span>
      {children}
      {hint && (
        <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
          {hint}
        </p>
      )}
    </div>
  )
}

function SectionHead({ children, tone = 'var(--brand-ink)' }) {
  return (
    <p
      className="mb-3 mt-1 text-[0.68rem] font-bold uppercase tracking-wider"
      style={{ color: tone }}
    >
      {children}
    </p>
  )
}

export default function StudentPanel({
  row,
  classes,
  sections,
  nextSerial,
  schoolId,
  photoUrl,
  trigger,
}) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState(saveStudent, {})
  useCloseOnSuccess(state, () => setOpen(false))

  // Section list is filtered by the chosen class, so a section from another
  // class can never be submitted.
  const [classId, setClassId] = useState(row?.current_class_id ?? '')
  const editing = Boolean(row)

  const forClass = sections.filter((s) => s.class_id === classId)
  const fullName = row ? [row.first_name, row.last_name].filter(Boolean).join(' ') : ''

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={trigger.className}>
        {trigger.label}
      </button>

      <SidePanel
        open={open}
        busy={pending}
        onClose={() => setOpen(false)}
        width="max-w-3xl"
        title={editing ? `Edit ${fullName}` : 'Register new student'}
        description="Fill in the student details"
        footer={
          <>
            <button type="button" onClick={() => setOpen(false)} disabled={pending} className="btn btn-ghost">
              Cancel
            </button>
            <SaveButton pending={pending} editing={editing} />
          </>
        }
      >
        <form id="student-form" action={formAction} className="flex flex-col gap-6">
          {editing && <input type="hidden" name="id" value={row.id} />}
          {/* The class combobox writes here; the visible one only drives the
              section filter. */}
          <input type="hidden" name="current_class_id" value={classId} />

          {/* ---------------------------------------------- academic data */}
          <section>
            <SectionHead>Academic data</SectionHead>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Serial number" required>
                <input
                  name="serial_number"
                  type="number"
                  required
                  defaultValue={row?.serial_number ?? nextSerial}
                  className="field"
                />
              </Field>

              <Field label="Family number" hint="Siblings share one number.">
                <input
                  name="family_number"
                  defaultValue={row?.family_number ?? ''}
                  placeholder="FAM-001"
                  className="field"
                />
              </Field>

              <Field label="Admission number">
                <input
                  name="admission_number"
                  defaultValue={row?.admission_number ?? ''}
                  placeholder="STU-048"
                  className="field"
                />
              </Field>

              <Field label="Class" required>
                <Select
                  name="class_picker"
                  searchable
                  required
                  defaultValue={classId}
                  placeholder="Select class…"
                  options={classes}
                  onChangeValue={setClassId}
                />
              </Field>

              <Field label="Section" required>
                <Select
                  name="current_section_id"
                  required
                  defaultValue={row?.current_section_id ?? ''}
                  placeholder={classId ? 'Select section…' : 'Select class first'}
                  emptyLabel="That class has no sections yet."
                  options={forClass}
                />
              </Field>

              <Field label="Admission date">
                <input
                  name="admission_date"
                  type="date"
                  defaultValue={row?.admission_date ?? new Date().toISOString().slice(0, 10)}
                  className="field"
                />
              </Field>

              <Field label="Roll number">
                <input name="roll_number" defaultValue={row?.roll_number ?? ''} className="field" />
              </Field>

              <Field label="Fee plan">
                <Select
                  name="fee_plan"
                  defaultValue={row?.fee_plan ?? 'monthly'}
                  options={[
                    { id: 'monthly', label: 'Monthly' },
                    { id: 'quarterly', label: 'Quarterly' },
                    { id: 'half_yearly', label: 'Half yearly' },
                    { id: 'annual', label: 'Annual' },
                  ]}
                />
              </Field>

              <Field label="Fee amount (Rs.)" hint="Blank uses the class fee.">
                <input
                  name="base_fee"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={row?.base_fee ?? ''}
                  className="field"
                />
              </Field>

              <Field label="Starting month">
                <Select
                  name="starting_month"
                  defaultValue={String(row?.starting_month ?? new Date().getMonth() + 1)}
                  options={MONTHS.map((m, i) => ({ id: String(i + 1), label: m }))}
                />
              </Field>

              <Field label="Discount type">
                <Select
                  name="discount_type"
                  defaultValue={row?.discount_type ?? 'amount'}
                  options={[
                    { id: 'amount', label: 'Fixed amount (Rs.)' },
                    { id: 'percent', label: 'Percentage (%)' },
                  ]}
                />
              </Field>

              <Field label="Discount">
                <input
                  name="discount_value"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={row?.discount_value ?? ''}
                  placeholder="0.00"
                  className="field"
                />
              </Field>

              <Field label="Discount note" span={3}>
                <input
                  name="discount_note"
                  defaultValue={row?.discount_note ?? ''}
                  placeholder="Sibling discount, staff child…"
                  className="field"
                />
              </Field>
            </div>
          </section>

          {/* ------------------------------------ student & father details */}
          <section>
            <SectionHead tone="var(--blue-ink)">Student &amp; father information</SectionHead>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Student name" required>
                <input
                  name="first_name"
                  required
                  defaultValue={fullName}
                  placeholder="Muhammad Ahad Khan"
                  className="field"
                />
              </Field>

              <Field label="Father name" required>
                <input
                  name="father_name"
                  required
                  defaultValue={row?.father_name ?? ''}
                  className="field"
                />
              </Field>

              <Field label="Father mobile">
                <input name="father_mobile" defaultValue={row?.father_mobile ?? ''} className="field" />
              </Field>

              <Field label="Father WhatsApp">
                <input
                  name="father_whatsapp"
                  defaultValue={row?.father_whatsapp ?? ''}
                  className="field"
                />
              </Field>

              <Field label="Father email">
                <input
                  name="father_email"
                  type="email"
                  defaultValue={row?.father_email ?? ''}
                  className="field"
                />
              </Field>

              <Field label="Father CNIC">
                <input
                  name="father_cnic"
                  defaultValue={row?.father_cnic ?? ''}
                  placeholder="xxxxx-xxxxxxx-x"
                  className="field"
                />
              </Field>

              <Field label="Father occupation">
                <input
                  name="father_occupation"
                  defaultValue={row?.father_occupation ?? ''}
                  className="field"
                />
              </Field>

              <Field label="Father annual income">
                <input
                  name="father_annual_income"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={row?.father_annual_income ?? ''}
                  placeholder="0.00"
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
                  defaultValue={row?.gender ?? 'male'}
                  options={[
                    { id: 'male', label: 'Male' },
                    { id: 'female', label: 'Female' },
                    { id: 'other', label: 'Other' },
                  ]}
                />
              </Field>

              <Field label="Student CNIC / B-Form">
                <input
                  name="student_cnic"
                  defaultValue={row?.student_cnic ?? ''}
                  placeholder="xxxxx-xxxxxxx-x"
                  className="field"
                />
              </Field>

              <Field label="Student mobile">
                <input
                  name="student_mobile"
                  defaultValue={row?.student_mobile ?? ''}
                  className="field"
                />
              </Field>

              <Field label="Blood group">
                <Select
                  name="blood_group"
                  defaultValue={row?.blood_group ?? ''}
                  placeholder="—"
                  options={BLOOD.map((b) => ({ id: b, label: b }))}
                />
              </Field>

              <Field label="Caste / race">
                <input name="caste" defaultValue={row?.caste ?? ''} className="field" />
              </Field>

              <Field label="Birth place">
                <input name="birth_place" defaultValue={row?.birth_place ?? ''} className="field" />
              </Field>

              <Field label="City">
                <input name="city" defaultValue={row?.city ?? ''} className="field" />
              </Field>

              <Field label="State / province">
                <input name="state" defaultValue={row?.state ?? ''} className="field" />
              </Field>

              <Field label="Postal code">
                <input name="postal_code" defaultValue={row?.postal_code ?? ''} className="field" />
              </Field>

              <Field label="Current address" span={3}>
                <input
                  name="current_address"
                  defaultValue={row?.current_address ?? ''}
                  className="field"
                />
              </Field>

              {/* Private bucket: the preview arrives as a signed URL from the
                  server, and a fresh one is generated on upload. */}
              <ImageUpload
                name="photo_url"
                bucket={PHOTOS}
                folder={schoolId}
                isPublic={false}
                label="Student photo"
                hint="Stored privately — never served by public link."
                defaultPath={row?.photo_url ?? ''}
                defaultPreview={photoUrl ?? null}
              />
            </div>
          </section>

          {state?.error && (
            <p
              className="rounded-lg px-3 py-2 text-sm"
              style={{ background: 'var(--red-soft)', color: 'var(--red-ink)' }}
            >
              {state.error}
            </p>
          )}
        </form>
      </SidePanel>
    </>
  )
}
