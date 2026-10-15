'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import SidePanel from '@/components/side-panel'
import { Select } from '@/components/combobox'
import { Spinner } from '@/components/spinner'
import { useCloseOnSuccess } from '@/components/use-close-on-success'
import ImageUpload from '@/components/image-upload'
import { ASSETS, publicUrl } from '@/lib/storage'
import { saveCertificateSettings } from '../actions'

const PLACEHOLDERS = [
  'student_name',
  'father_name',
  'class',
  'roll_number',
  'admission_no',
  'admission_date',
  'issue_date',
  'school_name',
]

const FIELDS = [
  { key: 'student_name', label: 'Student name' },
  { key: 'father_name', label: 'Father name' },
  { key: 'class', label: 'Class / grade' },
  { key: 'roll_number', label: 'Roll number' },
  { key: 'admission_date', label: 'Admission date' },
  { key: 'issue_date', label: 'Issue date' },
]

function SaveButton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" form="cert-settings" disabled={pending} className="btn btn-primary">
      {pending ? (
        <>
          <Spinner /> Saving…
        </>
      ) : (
        'Save settings'
      )}
    </button>
  )
}

export default function CertificateSettingsPanel({ settings, schoolName, schoolId }) {
  const [open, setOpen] = useState(false)
  const [state, formAction] = useActionState(saveCertificateSettings, {})
  useCloseOnSuccess(state, () => setOpen(false))

  const [body, setBody] = useState(settings?.body_text ?? '')
  const [title, setTitle] = useState(settings?.title ?? 'School Certificate')
  const [name, setName] = useState(settings?.school_name ?? schoolName ?? '')

  const fields = settings?.fields ?? {}

  // Insert at the caret rather than appending, so a placeholder can be
  // dropped into the middle of a sentence.
  function insert(token) {
    const el = document.getElementById('cert-body')
    const marker = `{${token}}`
    if (!el) {
      setBody((b) => b + marker)
      return
    }
    const start = el.selectionStart ?? body.length
    const end = el.selectionEnd ?? body.length
    const next = body.slice(0, start) + marker + body.slice(end)
    setBody(next)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(start + marker.length, start + marker.length)
    })
  }

  const preview = body
    .replaceAll('{student_name}', 'Ahmed Ali Khan')
    .replaceAll('{father_name}', 'Muhammad Ali')
    .replaceAll('{class}', 'Class 5 - A')
    .replaceAll('{roll_number}', 'R-24')
    .replaceAll('{admission_no}', 'STU-001')
    .replaceAll('{admission_date}', '12 Apr 2024')
    .replaceAll('{issue_date}', new Date().toLocaleDateString('en-GB'))
    .replaceAll('{school_name}', name || 'Your School')

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn btn-ghost w-full">
        Certificate settings
      </button>

      <SidePanel
        open={open}
        onClose={() => setOpen(false)}
        width="max-w-2xl"
        title="Certificate settings"
        description="Configure school details and the certificate template"
        footer={
          <>
            <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost">
              Cancel
            </button>
            <SaveButton />
          </>
        }
      >
        <div className="grid gap-5 lg:grid-cols-[1fr_15rem]">
          <form id="cert-settings" action={formAction} className="flex flex-col gap-5">
            {/* ------------------------------------------- school details */}
            <section>
              <p
                className="mb-3 text-[0.68rem] font-bold uppercase tracking-wider"
                style={{ color: 'var(--brand-ink)' }}
              >
                School information
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <span className="label">School name</span>
                  <input
                    name="school_name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="field"
                  />
                </div>
                <div className="sm:col-span-2">
                  <span className="label">Address</span>
                  <input
                    name="school_address"
                    defaultValue={settings?.school_address ?? ''}
                    placeholder="Full address"
                    className="field"
                  />
                </div>
                <div>
                  <span className="label">Contact number</span>
                  <input
                    name="contact_number"
                    defaultValue={settings?.contact_number ?? ''}
                    placeholder="+92 300 0000000"
                    className="field"
                  />
                </div>
                <div>
                  <span className="label">Email</span>
                  <input
                    name="email"
                    type="email"
                    defaultValue={settings?.email ?? ''}
                    placeholder="school@example.com"
                    className="field"
                  />
                </div>
                <ImageUpload
                  name="logo_url"
                  bucket={ASSETS}
                  folder={schoolId}
                  label="School logo"
                  hint="PNG or JPG, max 2MB."
                  defaultPath={settings?.logo_url ?? ''}
                  defaultPreview={publicUrl(settings?.logo_url)}
                />
                <ImageUpload
                  name="background_url"
                  bucket={ASSETS}
                  folder={schoolId}
                  label="Background image"
                  hint="Shown as a watermark behind the text."
                  defaultPath={settings?.background_url ?? ''}
                  defaultPreview={publicUrl(settings?.background_url)}
                />
              </div>
            </section>

            {/* --------------------------------------------- title, layout */}
            <section>
              <p
                className="mb-3 text-[0.68rem] font-bold uppercase tracking-wider"
                style={{ color: 'var(--blue-ink)' }}
              >
                Title &amp; layout
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <span className="label">Certificate title</span>
                  <input
                    name="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="field"
                  />
                </div>
                <div>
                  <span className="label">Page orientation</span>
                  <Select
                    name="orientation"
                    defaultValue={settings?.orientation ?? 'portrait'}
                    options={[
                      { id: 'portrait', label: 'Portrait' },
                      { id: 'landscape', label: 'Landscape' },
                    ]}
                  />
                </div>
              </div>
            </section>

            {/* ------------------------------------------- printed fields */}
            <section>
              <p
                className="mb-1 text-[0.68rem] font-bold uppercase tracking-wider"
                style={{ color: 'var(--green-ink)' }}
              >
                Student information fields
              </p>
              <p className="mb-3 text-xs" style={{ color: 'var(--muted)' }}>
                Which fields appear on the certificate.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {FIELDS.map((f) => (
                  <label
                    key={f.key}
                    className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <span className="text-sm" style={{ color: 'var(--ink)' }}>
                      {f.label}
                    </span>
                    <span className="switch">
                      <input
                        type="checkbox"
                        name={`field_${f.key}`}
                        defaultChecked={fields[f.key] ?? true}
                      />
                    </span>
                  </label>
                ))}
              </div>
            </section>

            {/* ------------------------------------------------- body text */}
            <section>
              <p
                className="mb-1 text-[0.68rem] font-bold uppercase tracking-wider"
                style={{ color: 'var(--amber-ink)' }}
              >
                Certificate message
              </p>
              <p className="mb-2 text-xs" style={{ color: 'var(--muted)' }}>
                Click a placeholder to insert it at the cursor.
              </p>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {PLACEHOLDERS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => insert(p)}
                    className="chip font-mono !text-[0.68rem]"
                  >
                    {`{${p}}`}
                  </button>
                ))}
              </div>
              <textarea
                id="cert-body"
                name="body_text"
                rows={5}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="field resize-y"
              />
              <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                Placeholders are replaced with the selected student&rsquo;s real data at print time.
              </p>
            </section>

            {/* -------------------------------------------------- signatures */}
            <section>
              <p
                className="mb-3 text-[0.68rem] font-bold uppercase tracking-wider"
                style={{ color: 'var(--red-ink)' }}
              >
                Signatures
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-2 rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
                  <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                    Principal / head
                  </p>
                  <input
                    name="principal_name"
                    defaultValue={settings?.principal_name ?? ''}
                    placeholder="Full name"
                    className="field"
                  />
                  <input
                    name="principal_label"
                    defaultValue={settings?.principal_label ?? 'Principal'}
                    className="field"
                  />
                  <ImageUpload
                    name="principal_signature_url"
                    bucket={ASSETS}
                    folder={schoolId}
                    label="Signature image"
                    hint="Transparent PNG preferred."
                    defaultPath={settings?.principal_signature_url ?? ''}
                    defaultPreview={publicUrl(settings?.principal_signature_url)}
                  />
                </div>
                <div className="flex flex-col gap-2 rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
                  <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                    Authorised signatory
                  </p>
                  <input
                    name="signatory_name"
                    defaultValue={settings?.signatory_name ?? ''}
                    placeholder="Full name"
                    className="field"
                  />
                  <input
                    name="signatory_label"
                    defaultValue={settings?.signatory_label ?? 'Authorized Signatory'}
                    className="field"
                  />
                </div>
              </div>
              <div className="mt-3">
                <ImageUpload
                  name="signatory_signature_url"
                  bucket={ASSETS}
                  folder={schoolId}
                  label="Authorised signatory signature"
                  hint="Transparent PNG preferred."
                  defaultPath={settings?.signatory_signature_url ?? ''}
                  defaultPreview={publicUrl(settings?.signatory_signature_url)}
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

          {/* ------------------------------------------------ live preview */}
          <aside className="hidden lg:block">
            <p
              className="mb-2 text-[0.66rem] font-bold uppercase tracking-wider"
              style={{ color: 'var(--muted)' }}
            >
              Live preview
            </p>
            <div className="card sticky top-0 p-3 text-center">
              <p className="text-[0.7rem] font-semibold" style={{ color: 'var(--ink)' }}>
                {name || 'Your School'}
              </p>
              <p className="pill pill-brand mx-auto mt-2 !text-[0.55rem]">{title}</p>
              <p
                className="mt-2 text-left text-[0.6rem] leading-relaxed"
                style={{ color: 'var(--ink-2)' }}
              >
                {preview || 'Your certificate text appears here.'}
              </p>
              <div
                className="mt-3 flex justify-between border-t pt-2 text-[0.55rem]"
                style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
              >
                <span>Issue date</span>
                <span>{settings?.principal_label ?? 'Principal'}</span>
              </div>
            </div>
            <p className="mt-2 text-[0.65rem]" style={{ color: 'var(--muted)' }}>
              Scaled preview with sample data.
            </p>
          </aside>
        </div>
      </SidePanel>
    </>
  )
}
