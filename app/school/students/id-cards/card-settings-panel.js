'use client'

import { useCallback, useActionState, useState } from 'react'
import SidePanel from '@/components/side-panel'
import { Select } from '@/components/combobox'
import { Spinner } from '@/components/spinner'
import { useCloseOnSuccess } from '@/components/use-close-on-success'
import ImageUpload from '@/components/image-upload'
import { IdCardBack, IdCardFront } from '@/components/print/id-card'
import { ASSETS, publicUrl } from '@/lib/storage'
import { CARD_TEMPLATES } from '@/lib/documents'
import { saveIdCardSettings } from '../actions'

// Front fields. The card is 54mm wide; eight rows is already more than fits
// comfortably, which is why most of these default on and the rest default off
// rather than everything being available at once.
const FRONT_FIELDS = [
  { key: 'photo', label: 'Photograph' },
  { key: 'student_name', label: 'Student name' },
  { key: 'father_name', label: 'Father name' },
  { key: 'roll_number', label: 'Roll number' },
  { key: 'class', label: 'Class' },
  { key: 'section', label: 'Section' },
  { key: 'admission_number', label: 'Admission number' },
  { key: 'gender', label: 'Gender' },
  { key: 'date_of_birth', label: 'Date of birth' },
  { key: 'address', label: 'Address' },
  { key: 'status', label: 'Status' },
]

// Rows that cost space without earning it on a 54mm card, so they start off.
const FRONT_OFF_BY_DEFAULT = ['date_of_birth', 'address', 'status']

// Back fields. A different list on purpose: this side is what somebody who
// FOUND the card needs, not what identifies the holder.
const BACK_FIELDS = [
  { key: 'date_of_birth', label: 'Date of birth' },
  { key: 'blood_group', label: 'Blood group' },
  { key: 'guardian_phone', label: 'Guardian phone' },
  { key: 'emergency_phone', label: 'Emergency phone' },
  { key: 'session', label: 'Session' },
  { key: 'address', label: 'Home address' },
]

const DEFAULT_BACK_NOTE =
  'This card is the property of the school and must be carried on the premises at all times. If found, please return it to the school office.'

const SAMPLE = {
  id: 'sample00',
  name: 'Ahmed Ali Khan',
  fatherName: 'Muhammad Ali Khan',
  admissionNumber: 'STU-0014',
  rollNumber: '24',
  className: 'Class 8',
  sectionName: 'A',
  gender: 'male',
  status: 'active',
  dateOfBirth: '2012-03-03',
  bloodGroup: 'B+',
  guardianPhone: '+92 300 1234567',
  emergencyPhone: '+92 321 7654321',
  address: 'House 14, Street 7, Model Town',
  session: '2026-27',
  photoUrl: null,
}

// READING THE WHOLE FORM, RATHER THAN CONTROLLING EVERY INPUT.
//
// The preview used to follow six values -- template, four colours and the
// school name -- because those were the six held in React state. Every other
// control was a defaultValue or a defaultChecked, so turning off "Barcode",
// or "Blood group", or typing a new signature caption, changed what printed
// but nothing the panel showed. The preview quietly stopped being a preview.
//
// Thirty useState hooks would fix that and would be thirty things to keep in
// step with the form. One FormData read on change does the same job and
// cannot drift: whatever the form will POST is exactly what gets drawn.
//
// The field lists are needed rather than just iterating the FormData because
// of checkboxes: an unchecked box is ABSENT from FormData, not false, so an
// off switch would otherwise read as "not set" and fall through to the saved
// value -- which is the very bug this is here to fix.
function readForm(form) {
  const data = new FormData(form)
  const text = (name) => {
    const value = data.get(name)
    return typeof value === 'string' ? value : ''
  }
  const on = (name) => data.get(name) !== null

  return {
    fields: Object.fromEntries(FRONT_FIELDS.map((f) => [f.key, on(`field_${f.key}`)])),
    back_fields: Object.fromEntries(BACK_FIELDS.map((f) => [f.key, on(`back_${f.key}`)])),
    show_barcode: on('show_barcode'),
    show_signature: on('show_signature'),
    show_stamp: on('show_stamp'),
    show_back: on('show_back'),
    accent_color: text('accent_color'),
    header_from: text('header_from'),
    header_to: text('header_to'),
    text_color: text('text_color'),
    border_color: text('border_color'),
    back_note: text('back_note'),
    valid_until: text('valid_until'),
    school_name: text('school_name'),
    school_address: text('school_address'),
    school_phone: text('school_phone'),
    school_email: text('school_email'),
    principal_label: text('principal_label'),
    signatory_label: text('signatory_label'),
  }
}

function Section({ tone, title, hint, children }) {
  return (
    <section>
      <p className="mb-1 text-[0.68rem] font-bold uppercase tracking-wider" style={{ color: tone }}>
        {title}
      </p>
      {hint && (
        <p className="mb-3 text-xs" style={{ color: 'var(--muted)' }}>
          {hint}
        </p>
      )}
      {children}
    </section>
  )
}

function Toggle({ name, label, defaultChecked }) {
  return (
    <label
      className="flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5"
      style={{ borderColor: 'var(--border)' }}
    >
      <span className="text-xs" style={{ color: 'var(--ink)' }}>
        {label}
      </span>
      <span className="switch">
        <input type="checkbox" name={name} defaultChecked={defaultChecked} />
      </span>
    </label>
  )
}

function Colour({ name, label, value, onChange }) {
  return (
    <div>
      <span className="label">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="size-9 shrink-0 cursor-pointer rounded border"
          style={{ borderColor: 'var(--border)' }}
          aria-label={label}
        />
        <input
          name={name}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="field font-mono"
        />
      </div>
    </div>
  )
}

export default function CardSettingsPanel({ settings, schoolName, schoolId, doc }) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState(saveIdCardSettings, {})
  useCloseOnSuccess(state, () => setOpen(false))

  const s = settings ?? {}

  // Everything the form will POST, re-read on every change. Null until the
  // form mounts, which is why the preview below still falls back to `s`.
  const [live, setLive] = useState(null)

  // The controls that are NOT native form inputs, and so never fire a change
  // event the form can hear: the template buttons write a hidden input, the
  // Select emits one, and ImageUpload puts a storage path in one. Each has a
  // callback instead, and this is what those callbacks write to.
  const [template, setTemplate] = useState(s.template ?? 'classic')
  const [orientation, setOrientation] = useState(s.orientation ?? 'vertical')
  const [borderStyle, setBorderStyle] = useState(s.border_style ?? 'solid')
  const [logo, setLogo] = useState(s.logo_url ?? '')
  const [background, setBackground] = useState(s.background_url ?? '')
  const [principalSig, setPrincipalSig] = useState(s.principal_signature_url ?? '')
  const [signatorySig, setSignatorySig] = useState(s.signatory_signature_url ?? '')
  const [stamp, setStamp] = useState(s.stamp_url ?? '')

  // Colours stay in state because the swatch and the hex box are two inputs
  // sharing one value. readForm picks them up as well, and they agree.
  const [accent, setAccent] = useState(s.accent_color ?? s.header_to ?? '#7c3aed')
  const [from, setFrom] = useState(s.header_from ?? '#3b0764')
  const [to, setTo] = useState(s.header_to ?? '#7c3aed')
  const [textColor, setTextColor] = useState(s.text_color ?? '#1e293b')
  const [borderColor, setBorderColor] = useState(s.border_color ?? '#e2e8f0')

  // Sweep once the moment the form exists, so the preview is in step before
  // anything is touched. A callback ref rather than an effect because the
  // form unmounts with the modal and this has to run again on every reopen.
  const formRef = useCallback((node) => {
    if (node) setLive(readForm(node))
  }, [])

  // An empty box means "fall back to Documents & Branding", which is how
  // page.js resolves these for the real sheet -- so a blank field must
  // preview the fallback rather than a blank card.
  const fallback = (typed, saved, fromDoc) => (live ? typed : (saved ?? '')) || fromDoc

  const preview = {
    ...s,
    ...(live ?? {}),
    template,
    orientation,
    border_style: borderStyle,
    accent_color: accent,
    header_from: from,
    header_to: to,
    text_color: textColor,
    border_color: borderColor,
    school_name: fallback(live?.school_name, s.school_name ?? schoolName, doc?.name),
    school_address: fallback(live?.school_address, s.school_address, doc?.address),
    school_phone: fallback(live?.school_phone, s.school_phone, doc?.phone),
    school_email: fallback(live?.school_email, s.school_email, doc?.email),
    principal_label: fallback(
      live?.principal_label,
      s.principal_label,
      doc?.principal?.label ?? 'Principal'
    ),
    back_note: live ? live.back_note : s.back_note ?? DEFAULT_BACK_NOTE,
    logoUrl: publicUrl(logo) ?? doc?.logoUrl,
    backgroundUrl: publicUrl(background),
    principalSignatureUrl: publicUrl(principalSig) ?? doc?.principal?.signatureUrl,
    signatorySignatureUrl: publicUrl(signatorySig),
    stampUrl: publicUrl(stamp) ?? doc?.schoolStampUrl,
  }

  const showBack = preview.show_back !== false

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn btn-ghost">
        Card design settings
      </button>

      <SidePanel
        open={open}
        busy={pending}
        onClose={() => setOpen(false)}
        // Centred, not a drawer. This form is two columns with a live card
        // beside them, and in a right-hand drawer the preview column was
        // narrower than the card it had to show -- which is where the
        // sideways scrollbar came from.
        variant="modal"
        width="max-w-7xl"
        maxHeight="92dvh"
        title="ID card design"
        description="Template, colours, which fields print on each side, signature and stamp"
        footer={
          <>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={pending}
              className="btn btn-ghost"
            >
              Cancel
            </button>
            <button type="submit" form="card-settings" disabled={pending} className="btn btn-primary">
              {pending ? (
                <>
                  <Spinner /> Saving…
                </>
              ) : (
                'Save settings'
              )}
            </button>
          </>
        }
      >
        {/* minmax(0, 1fr), not 1fr: a bare 1fr will not go below the form's
            min-content width, so one wide row inside pushed the whole dialog
            wider than the screen instead of wrapping. */}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <form
            ref={formRef}
            id="card-settings"
            action={formAction}
            onChange={(e) => setLive(readForm(e.currentTarget))}
            className="flex min-w-0 flex-col gap-5"
          >
            {/* -------------------------------------------------- template */}
            <Section tone="var(--brand-ink)" title="Template">
              <input type="hidden" name="template" value={template} />
              <div className="grid gap-2 sm:grid-cols-2">
                {CARD_TEMPLATES.map((t) => {
                  const on = template === t.id
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTemplate(t.id)}
                      className="rounded-xl border px-3 py-2 text-left transition"
                      style={{
                        borderColor: on ? 'var(--brand)' : 'var(--border)',
                        background: on ? 'var(--brand-soft)' : 'var(--card)',
                      }}
                    >
                      <span
                        className="block text-sm font-medium"
                        style={{ color: on ? 'var(--brand-ink)' : 'var(--ink)' }}
                      >
                        {t.label}
                      </span>
                      <span className="block text-xs" style={{ color: 'var(--muted)' }}>
                        {t.hint}
                      </span>
                    </button>
                  )
                })}
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <span className="label">Orientation</span>
                  <Select
                    name="orientation"
                    defaultValue={orientation}
                    onChangeValue={setOrientation}
                    options={[
                      { id: 'vertical', label: 'Portrait (54 × 85.6 mm)' },
                      { id: 'horizontal', label: 'Landscape (85.6 × 54 mm)' },
                    ]}
                  />
                </div>
                <Colour name="accent_color" label="Accent" value={accent} onChange={setAccent} />
                <Colour
                  name="header_from"
                  label="Header gradient from"
                  value={from}
                  onChange={setFrom}
                />
                <Colour name="header_to" label="Header gradient to" value={to} onChange={setTo} />
                <Colour name="text_color" label="Text" value={textColor} onChange={setTextColor} />
                <Colour
                  name="border_color"
                  label="Border"
                  value={borderColor}
                  onChange={setBorderColor}
                />
                <div>
                  <span className="label">Border style</span>
                  <Select
                    name="border_style"
                    defaultValue={borderStyle}
                    onChangeValue={setBorderStyle}
                    options={[
                      { id: 'solid', label: 'Solid' },
                      { id: 'dashed', label: 'Dashed' },
                      { id: 'dotted', label: 'Dotted' },
                      { id: 'none', label: 'None' },
                    ]}
                  />
                </div>
                <div>
                  <span className="label">Typeface</span>
                  <Select
                    name="font_style"
                    defaultValue={s.font_style ?? 'sans'}
                    options={[
                      { id: 'sans', label: 'Sans' },
                      { id: 'serif', label: 'Serif' },
                      { id: 'mono', label: 'Monospace' },
                    ]}
                  />
                </div>
              </div>

              {/* Carried so the saved width and height survive, without
                  offering them as a choice: the card is CR80 now, and a
                  pixel size is only honoured where a school had already
                  changed it deliberately. See dims() in the card component. */}
              <input type="hidden" name="card_width" value={s.card_width ?? 208} />
              <input type="hidden" name="card_height" value={s.card_height ?? 340} />
              <input type="hidden" name="font_size" value={s.font_size ?? 10} />
              <input type="hidden" name="text_align" value={s.text_align ?? 'center'} />
            </Section>

            {/* ------------------------------------------------ front side */}
            <Section
              tone="var(--blue-ink)"
              title="Front of the card"
              hint="A card is 54mm wide. Six or seven rows is what reads at arm's length."
            >
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {FRONT_FIELDS.map((f) => (
                  <Toggle
                    key={f.key}
                    name={`field_${f.key}`}
                    label={f.label}
                    defaultChecked={s.fields?.[f.key] ?? !FRONT_OFF_BY_DEFAULT.includes(f.key)}
                  />
                ))}
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                <Toggle name="show_barcode" label="Barcode" defaultChecked={s.show_barcode ?? true} />
                <Toggle
                  name="show_signature"
                  label="Signature line"
                  defaultChecked={s.show_signature ?? true}
                />
                <Toggle name="show_stamp" label="Stamp" defaultChecked={s.show_stamp ?? false} />
              </div>
            </Section>

            {/* ------------------------------------------------- back side */}
            <Section
              tone="var(--green-ink)"
              title="Back of the card"
              hint="What somebody who found the card needs. Printed as a second card in the sheet, so a duplex printer gets two faces."
            >
              <label
                className="mb-3 flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
                style={{ borderColor: 'var(--border)' }}
              >
                <span className="text-sm" style={{ color: 'var(--ink)' }}>
                  Print a back side
                </span>
                <span className="switch">
                  <input type="checkbox" name="show_back" defaultChecked={s.show_back ?? true} />
                </span>
              </label>

              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {BACK_FIELDS.map((f) => (
                  <Toggle
                    key={f.key}
                    name={`back_${f.key}`}
                    label={f.label}
                    defaultChecked={s.back_fields?.[f.key] ?? true}
                  />
                ))}
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <span className="label">Terms printed on the back</span>
                  <textarea
                    name="back_note"
                    rows={3}
                    defaultValue={s.back_note ?? DEFAULT_BACK_NOTE}
                    className="field resize-y"
                  />
                </div>
                <div>
                  <span className="label">Valid until</span>
                  <input
                    type="date"
                    name="valid_until"
                    defaultValue={s.valid_until ?? ''}
                    className="field"
                  />
                </div>
              </div>
            </Section>

            {/* --------------------------------------------- school block */}
            <Section
              tone="var(--amber-ink)"
              title="School details"
              hint="Left blank, each falls back to Documents & Branding in School Settings."
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <span className="label">School name</span>
                  <input
                    name="school_name"
                    defaultValue={s.school_name ?? schoolName ?? ''}
                    placeholder={doc?.name ?? ''}
                    className="field"
                  />
                </div>
                <div className="sm:col-span-2">
                  <span className="label">Address</span>
                  <input
                    name="school_address"
                    defaultValue={s.school_address ?? ''}
                    placeholder={doc?.address ?? ''}
                    className="field"
                  />
                </div>
                <div>
                  <span className="label">Phone</span>
                  <input
                    name="school_phone"
                    defaultValue={s.school_phone ?? ''}
                    placeholder={doc?.phone ?? ''}
                    className="field"
                  />
                </div>
                <div>
                  <span className="label">Email</span>
                  <input
                    name="school_email"
                    type="email"
                    defaultValue={s.school_email ?? ''}
                    placeholder={doc?.email ?? ''}
                    className="field"
                  />
                </div>
                <ImageUpload
                  name="logo_url"
                  bucket={ASSETS}
                  folder={schoolId}
                  label="Crest / logo"
                  hint="PNG or JPG, max 2MB."
                  defaultPath={s.logo_url ?? ''}
                  defaultPreview={publicUrl(s.logo_url)}
                  onUploaded={setLogo}
                />
                <ImageUpload
                  name="background_url"
                  bucket={ASSETS}
                  folder={schoolId}
                  label="Background"
                  hint="Printed at 10% behind the card."
                  defaultPath={s.background_url ?? ''}
                  defaultPreview={publicUrl(s.background_url)}
                  onUploaded={setBackground}
                />
              </div>
            </Section>

            {/* ---------------------------------- signature and the stamp */}
            <Section
              tone="var(--red-ink)"
              title="Signature and stamp"
              hint="Transparent PNGs. An unsigned card is not an identity document."
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <span className="label">Signature caption</span>
                  <input
                    name="principal_label"
                    defaultValue={s.principal_label ?? 'Principal'}
                    className="field"
                  />
                </div>
                <div>
                  <span className="label">Second caption</span>
                  <input
                    name="signatory_label"
                    defaultValue={s.signatory_label ?? 'Authorized Signatory'}
                    className="field"
                  />
                </div>
                <ImageUpload
                  name="principal_signature_url"
                  bucket={ASSETS}
                  folder={schoolId}
                  label="Principal's signature"
                  hint="Falls back to the one in Documents."
                  defaultPath={s.principal_signature_url ?? ''}
                  defaultPreview={publicUrl(s.principal_signature_url)}
                  onUploaded={setPrincipalSig}
                />
                <ImageUpload
                  name="stamp_url"
                  bucket={ASSETS}
                  folder={schoolId}
                  label="Stamp / seal"
                  hint="Falls back to the school stamp in Documents."
                  defaultPath={s.stamp_url ?? ''}
                  defaultPreview={publicUrl(s.stamp_url)}
                  onUploaded={setStamp}
                />
                <ImageUpload
                  name="signatory_signature_url"
                  bucket={ASSETS}
                  folder={schoolId}
                  label="Second signature"
                  hint="Optional."
                  defaultPath={s.signatory_signature_url ?? ''}
                  defaultPreview={publicUrl(s.signatory_signature_url)}
                  onUploaded={setSignatorySig}
                />
              </div>
            </Section>

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
          <aside className="min-w-0">
            <div className="sticky top-0">
              <p
                className="mb-2 text-[0.66rem] font-bold uppercase tracking-wider"
                style={{ color: 'var(--muted)' }}
              >
                Actual size
              </p>
              {/* overflow-x-auto HERE rather than on the dialog: a landscape
                  card is 85.6mm against a 22rem column, so a school's custom
                  pixel size that is wider still scrolls inside this box
                  instead of dragging a sideways scrollbar onto the panel. */}
              <div className="flex flex-col items-center gap-3 overflow-x-auto">
                <IdCardFront student={SAMPLE} settings={preview} sample />
                {showBack && <IdCardBack student={SAMPLE} settings={preview} sample />}
              </div>
              <p className="mt-2 text-[0.65rem]" style={{ color: 'var(--muted)' }}>
                Shown at print size with sample data — this is the same component the sheet uses,
                and it redraws for every switch above.
              </p>
            </div>
          </aside>
        </div>
      </SidePanel>
    </>
  )
}
