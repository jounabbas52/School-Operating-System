'use client'

import { useActionState, useState } from 'react'
import SidePanel from '@/components/side-panel'
import Combobox, { Select } from '@/components/combobox'
import { Spinner } from '@/components/spinner'
import { useCloseOnSuccess } from '@/components/use-close-on-success'
import ImageUpload from '@/components/image-upload'
import { STAFF_PHOTOS } from '@/lib/storage'
import { EMPLOYMENT_TYPES, STAFF_STATUS_OPTIONS } from '@/lib/staff-options'
import { saveTeacher } from './actions'

const BLOOD = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']

function SaveButton({ editing, pending }) {
  return (
    <button type="submit" form="teacher-form" disabled={pending} className="btn btn-primary">
      {pending ? (
        <>
          <Spinner /> Saving…
        </>
      ) : editing ? (
        'Save changes'
      ) : (
        'Save teacher'
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

export default function TeacherPanel({
  row,
  subjects,
  designations,
  nextStaffNumber,
  schoolId,
  photoUrl,
  signatureUrl,
  stampUrl,
  trigger,
}) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState(saveTeacher, {})
  useCloseOnSuccess(state, () => setOpen(false))

  const editing = Boolean(row)
  const fullName = row ? [row.first_name, row.last_name].filter(Boolean).join(' ') : ''

  // Picking a designation prefills the salary from its pay grade, but only
  // while the field is still untouched -- overwriting a figure someone typed
  // for this particular teacher would be worse than leaving it stale.
  const [salary, setSalary] = useState(row?.monthly_salary ?? '')
  const [salaryTouched, setSalaryTouched] = useState(Boolean(row?.monthly_salary))

  function onDesignation(id) {
    if (salaryTouched) return
    const basic = designations.find((d) => d.id === id)?.basic_salary
    if (basic !== null && basic !== undefined) setSalary(String(basic))
  }

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
        title={editing ? `Edit ${fullName}` : 'Add new teacher'}
        description="Fill in the details to register a new teacher"
        footer={
          <>
            <button type="button" onClick={() => setOpen(false)} disabled={pending} className="btn btn-ghost">
              Cancel
            </button>
            <SaveButton pending={pending} editing={editing} />
          </>
        }
      >
        <form id="teacher-form" action={formAction} className="flex flex-col gap-6">
          {editing && <input type="hidden" name="id" value={row.id} />}

          {/* ------------------------------------------------- employment */}
          <section>
            <SectionHead>Employment</SectionHead>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Teacher ID" hint="Prefilled with the next free number.">
                <input
                  name="staff_number"
                  defaultValue={row?.staff_number ?? nextStaffNumber}
                  placeholder="TCH-001"
                  className="field"
                />
              </Field>

              <Field label="Subject specialization" required>
                <Select
                  name="subject_id"
                  searchable
                  required
                  defaultValue={row?.subject_id ?? ''}
                  placeholder="Select subject…"
                  emptyLabel="No subjects yet — add them under System Setup."
                  options={subjects}
                />
              </Field>

              <Field label="Qualification">
                <input
                  name="qualification"
                  defaultValue={row?.qualification ?? ''}
                  placeholder="e.g. M.Sc. Mathematics"
                  className="field"
                />
              </Field>

              <Field
                label="Designation"
                span={2}
                hint="Type a title that does not exist yet to create the pay grade as you go."
              >
                <Combobox
                  name="salary_structure_id"
                  createName="new_designation"
                  defaultValue={row?.salary_structure_id ?? ''}
                  placeholder={
                    designations.length ? 'Select or add designation…' : 'No salary structures yet'
                  }
                  createLabel="Add designation"
                  emptyLabel="No salary structures yet."
                  options={designations}
                  onChangeValue={onDesignation}
                />
              </Field>

              <Field label="Employment type">
                <Select
                  name="employment_type"
                  defaultValue={row?.employment_type ?? 'permanent'}
                  options={EMPLOYMENT_TYPES}
                />
              </Field>

              <Field label="Joining date" required>
                <input
                  name="hire_date"
                  type="date"
                  required
                  defaultValue={row?.hire_date ?? new Date().toISOString().slice(0, 10)}
                  className="field"
                />
              </Field>

              <Field
                label="Monthly salary (Rs.)"
                required
                hint="Reference figure — the amount Payroll runs comes from the designation above."
              >
                <input
                  name="monthly_salary"
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={salary}
                  onChange={(event) => {
                    setSalary(event.target.value)
                    setSalaryTouched(true)
                  }}
                  placeholder="e.g. 45000"
                  className="field"
                />
              </Field>

              <Field label="Experience (years)">
                <input
                  name="experience_years"
                  type="number"
                  step="0.5"
                  min="0"
                  defaultValue={row?.experience_years ?? ''}
                  className="field"
                />
              </Field>

              <Field label="Department">
                <input
                  name="department"
                  defaultValue={row?.department ?? ''}
                  placeholder="Science, Primary…"
                  className="field"
                />
              </Field>

              <Field label="Status">
                <Select
                  name="status"
                  defaultValue={row?.status ?? 'active'}
                  options={STAFF_STATUS_OPTIONS}
                />
              </Field>
            </div>
          </section>

          {/* --------------------------------------- personal and contact */}
          <section>
            <SectionHead tone="var(--blue-ink)">Personal &amp; contact</SectionHead>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Teacher name" required span={2}>
                <input
                  name="full_name"
                  required
                  defaultValue={fullName}
                  placeholder="Full name"
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

              <Field label="Phone number" required>
                <input
                  name="phone"
                  required
                  defaultValue={row?.phone ?? ''}
                  placeholder="03xx-xxxxxxx"
                  className="field"
                />
              </Field>

              <Field label="Email address" required>
                <input
                  name="work_email"
                  type="email"
                  required
                  defaultValue={row?.work_email ?? ''}
                  placeholder="teacher@school.edu"
                  className="field"
                />
              </Field>

              <Field label="WhatsApp / alternate">
                <input name="work_phone" defaultValue={row?.work_phone ?? ''} className="field" />
              </Field>

              <Field label="Emergency contact">
                <input
                  name="emergency_contact"
                  defaultValue={row?.emergency_contact ?? ''}
                  className="field"
                />
              </Field>

              <Field label="CNIC">
                <input
                  name="cnic"
                  defaultValue={row?.cnic ?? ''}
                  placeholder="xxxxx-xxxxxxx-x"
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

              <Field label="Blood group">
                <Select
                  name="blood_group"
                  defaultValue={row?.blood_group ?? ''}
                  placeholder="—"
                  options={BLOOD.map((b) => ({ id: b, label: b }))}
                />
              </Field>

              <Field label="Address" span={3}>
                <input
                  name="address"
                  defaultValue={row?.address ?? ''}
                  placeholder="Street, City, State, ZIP"
                  className="field"
                />
              </Field>

              <Field label="Notes" span={3}>
                <input
                  name="notes"
                  defaultValue={row?.notes ?? ''}
                  placeholder="Anything the office should know"
                  className="field"
                />
              </Field>

              {/* Private bucket: the preview arrives as a signed URL from the
                  server, and a fresh one is generated on upload. */}
              <ImageUpload
                name="photo_url"
                bucket={STAFF_PHOTOS}
                folder={schoolId}
                isPublic={false}
                label="Teacher photo"
                hint="Stored privately — never served by public link."
                defaultPath={row?.photo_url ?? ''}
                defaultPreview={photoUrl ?? null}
              />

              {/* A teacher signs a date sheet, a result card and a leaving
                  certificate, and a class teacher's stamp goes on a report
                  card -- so these belong to the person, not to the school.
                  Same private bucket as the photograph on purpose: writing
                  to school-assets needs core.settings.write, which somebody
                  maintaining staff records has no reason to hold. */}
              <ImageUpload
                name="signature_url"
                bucket={STAFF_PHOTOS}
                folder={schoolId}
                isPublic={false}
                label="Signature"
                hint="Transparent PNG — signed on white paper and cut out."
                defaultPath={row?.signature_url ?? ''}
                defaultPreview={signatureUrl ?? null}
              />
              <ImageUpload
                name="stamp_url"
                bucket={STAFF_PHOTOS}
                folder={schoolId}
                isPublic={false}
                label="Personal stamp"
                hint="Optional — the rubber stamp, not the signature."
                defaultPath={row?.stamp_url ?? ''}
                defaultPreview={stampUrl ?? null}
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
