'use client'

import { useActionState, useCallback, useState } from 'react'
import SidePanel from '@/components/side-panel'
import { Select } from '@/components/combobox'
import { Spinner } from '@/components/spinner'
import { useCloseOnSuccess } from '@/components/use-close-on-success'
import ImageUpload from '@/components/image-upload'
import CertificateSheet from '@/components/print/certificate-sheet'
import { ASSETS, publicUrl } from '@/lib/storage'
import {
  BORDER_STYLES,
  CERTIFICATE_KINDS,
  CERTIFICATE_TEMPLATES,
  CERTIFICATE_TOKENS,
  FONT_FAMILIES,
  PAPER_SIZES,
  certificateBody,
  certificateTitle,
  fillTokens,
} from '@/lib/documents'
import { saveCertificateSettings } from '../actions'

const FIELDS = [
  { key: 'student_name', label: 'Student name' },
  { key: 'father_name', label: 'Father name' },
  { key: 'class', label: 'Class / grade' },
  { key: 'roll_number', label: 'Roll number' },
  { key: 'admission_date', label: 'Admission date' },
  { key: 'issue_date', label: 'Issue date' },
]

const SAMPLE = Object.fromEntries(CERTIFICATE_TOKENS.map((t) => [t.token, t.sample]))

// A stand-in head-and-shoulders, inline so the preview needs no network and
// no seeded file in storage. Without one, "Student photo" was a switch with
// nothing to show: the sheet draws the slot only when a photo exists, so
// toggling it on a sample student with photoUrl: null did nothing at all.
const SAMPLE_PHOTO =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 100">' +
      '<rect width="80" height="100" fill="#e2e8f0"/>' +
      '<circle cx="40" cy="38" r="17" fill="#94a3b8"/>' +
      '<path d="M8 100c0-19 14-31 32-31s32 12 32 31z" fill="#94a3b8"/>' +
      '</svg>'
  )

// Millimetres, matching PAPER in components/print/certificate-sheet.js --
// the preview box is sized from these so it crops nothing.
const PAPER_MM = { a4: [210, 297], letter: [216, 279], legal: [216, 356] }
const MM_PX = 96 / 25.4

// WHY THE WHOLE FORM IS READ RATHER THAN EACH INPUT CONTROLLED.
//
// The preview followed six values -- template, accent, border, typeface,
// orientation and the school name -- because those were the six held in
// React state. Everything else was a defaultValue or a defaultChecked, so
// switching off the serial number, or the seal, or a particulars row, or
// typing a principal's name, changed what printed and left the preview
// beside it showing the old sheet. A preview that ignores half the panel is
// worse than no preview: it actively says the wrong thing.
//
// One FormData read on change cannot drift from the form the way forty
// useState hooks would. The field list is still needed because an unchecked
// checkbox is ABSENT from FormData rather than false, and "absent" would
// fall through to the saved value instead of reading as off.
function readForm(form) {
  const data = new FormData(form)
  const text = (name) => {
    const value = data.get(name)
    return typeof value === 'string' ? value : ''
  }
  const on = (name) => data.get(name) !== null

  return {
    fields: Object.fromEntries(FIELDS.map((f) => [f.key, on(`field_${f.key}`)])),
    show_serial: on('show_serial'),
    show_seal: on('show_seal'),
    show_photo: on('show_photo'),
    serial_prefix: text('serial_prefix'),
    school_name: text('school_name'),
    school_address: text('school_address'),
    contact_number: text('contact_number'),
    email: text('email'),
    principal_name: text('principal_name'),
    principal_label: text('principal_label'),
    signatory_name: text('signatory_name'),
    signatory_label: text('signatory_label'),
    footer_note: text('footer_note'),
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
      className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
      style={{ borderColor: 'var(--border)' }}
    >
      <span className="text-sm" style={{ color: 'var(--ink)' }}>
        {label}
      </span>
      <span className="switch">
        <input type="checkbox" name={name} defaultChecked={defaultChecked} />
      </span>
    </label>
  )
}

export default function CertificateSettingsPanel({ settings, schoolName, schoolId, doc }) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState(saveCertificateSettings, {})
  useCloseOnSuccess(state, () => setOpen(false))

  const s = settings ?? {}

  // Everything the form will POST, re-read on every change. See readForm.
  const [live, setLive] = useState(null)

  // The controls that are NOT native inputs, and so fire no change event the
  // form can hear: the template buttons and each Select write a hidden
  // input, and ImageUpload puts a storage path in one. Those get callbacks,
  // and this is what the callbacks write to.
  const [template, setTemplate] = useState(s.template ?? 'classic')
  const [accent, setAccent] = useState(s.accent_color ?? '#1e3a8a')
  const [border, setBorder] = useState(s.border_style ?? 'double')
  const [font, setFont] = useState(s.font_family ?? 'serif')
  const [orientation, setOrientation] = useState(s.orientation ?? 'portrait')
  const [paper, setPaper] = useState(s.paper_size ?? 'a4')
  const [logo, setLogo] = useState(s.logo_url ?? '')
  const [background, setBackground] = useState(s.background_url ?? '')
  const [seal, setSeal] = useState(s.seal_url ?? '')
  const [stamp, setStamp] = useState(s.stamp_url ?? '')
  const [principalSig, setPrincipalSig] = useState(s.principal_signature_url ?? '')
  const [signatorySig, setSignatorySig] = useState(s.signatory_signature_url ?? '')
  const [activeKind, setActiveKind] = useState('bonafide')

  // Sweep once the form exists so the preview starts in step. A callback ref
  // rather than an effect because the form unmounts with the modal and this
  // has to run again on every reopen.
  const formRef = useCallback((node) => {
    if (node) setLive(readForm(node))
  }, [])

  // One body and one title per kind, seeded from whatever is saved -- or from
  // the built-in wording for that kind, which is the point: a school opening
  // this panel for the first time sees five sensible drafts rather than five
  // empty boxes.
  const [bodies, setBodies] = useState(() =>
    Object.fromEntries(CERTIFICATE_KINDS.map((k) => [k.id, certificateBody(s, k.id)]))
  )
  const [titles, setTitles] = useState(() =>
    Object.fromEntries(CERTIFICATE_KINDS.map((k) => [k.id, certificateTitle(s, k.id)]))
  )

  // Insert at the caret rather than appending, so a placeholder can be
  // dropped into the middle of a sentence.
  function insert(token) {
    const el = document.getElementById(`cert-body-${activeKind}`)
    const marker = `{${token}}`
    const current = bodies[activeKind] ?? ''
    if (!el) {
      setBodies((b) => ({ ...b, [activeKind]: current + marker }))
      return
    }
    const start = el.selectionStart ?? current.length
    const end = el.selectionEnd ?? current.length
    setBodies((b) => ({
      ...b,
      [activeKind]: current.slice(0, start) + marker + current.slice(end),
    }))
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(start + marker.length, start + marker.length)
    })
  }

  // The preview is the real sheet with sample data -- the same component the
  // certificate screen and the print route render. A scaled-down mock-up was
  // the old behaviour and it could not show what a template change did,
  // which is the one thing this panel exists to let somebody see.
  const previewSettings = {
    ...s,
    ...(live ?? {}),
    template,
    accent_color: accent,
    border_style: border,
    font_family: font,
    orientation,
    paper_size: paper,
    bodies,
    titles,
    logoUrl: publicUrl(logo),
    backgroundUrl: publicUrl(background),
    principalSignatureUrl: publicUrl(principalSig),
    signatorySignatureUrl: publicUrl(signatorySig),
    sealUrl: publicUrl(seal),
    stampUrl: publicUrl(stamp),
  }

  const serialPrefix = (live ? live.serial_prefix : s.serial_prefix) || 'CERT'

  const previewCert = {
    kind: activeKind,
    title: titles[activeKind] || certificateTitle(s, activeKind),
    body: fillTokens(bodies[activeKind] ?? '', SAMPLE),
    serial: `${serialPrefix}-${new Date().getFullYear()}-0001`,
    issueDate: new Date().toISOString().slice(0, 10),
    logoUrl: publicUrl(logo),
    backgroundUrl: publicUrl(background),
    student: {
      name: SAMPLE.student_name,
      fatherName: SAMPLE.father_name,
      className: SAMPLE.class,
      rollNumber: SAMPLE.roll_number,
      admissionNumber: SAMPLE.admission_no,
      admissionDate: '2022-04-12',
      photoUrl: SAMPLE_PHOTO,
    },
  }

  // The preview box, derived from the paper the school actually picked
  // rather than guessed at. The old box was a fixed 26 x 37rem, which is A4
  // portrait and nothing else -- Letter, Legal and landscape were all
  // cropped at the edge by a preview whose whole job is to show the edges.
  const landscape = orientation === 'landscape'
  const [paperW, paperH] = PAPER_MM[paper] ?? PAPER_MM.a4
  const sheetW = (landscape ? paperH : paperW) * MM_PX
  const sheetH = (landscape ? paperW : paperH) * MM_PX
  const previewRem = 26 // the column is 28rem; the rest is border and air
  const previewScale = (previewRem * 16) / sheetW

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn btn-ghost w-full">
        Certificate design settings
      </button>

      <SidePanel
        open={open}
        busy={pending}
        onClose={() => setOpen(false)}
        // Centred, not a drawer. The preview is a whole A4 sheet, and a
        // right-hand drawer could never give it a column wide enough to sit
        // in -- which is why it was hidden below xl and scrolled sideways
        // above it.
        variant="modal"
        width="max-w-[90rem]"
        maxHeight="92dvh"
        title="Certificate design"
        description="Template, colours, wording per certificate type, seals and signatures"
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
            <button type="submit" form="cert-settings" disabled={pending} className="btn btn-primary">
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
        {/* minmax(0, 1fr), not 1fr: a bare 1fr will not shrink below the
            form's min-content width, so one wide row pushed the dialog wider
            than the screen rather than wrapping inside it. */}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_28rem]">
          <form
            ref={formRef}
            id="cert-settings"
            action={formAction}
            onChange={(e) => setLive(readForm(e.currentTarget))}
            className="flex min-w-0 flex-col gap-5"
          >
            {/* ------------------------------------------------- template */}
            <Section
              tone="var(--brand-ink)"
              title="Template"
              hint="The furniture around the text. The facts printed are the same in all four."
            >
              <input type="hidden" name="template" value={template} />
              <div className="grid gap-2 sm:grid-cols-2">
                {CERTIFICATE_TEMPLATES.map((t) => {
                  const on = template === t.id
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTemplate(t.id)}
                      className="rounded-xl border px-3 py-2.5 text-left transition"
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
                  <span className="label">Accent colour</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={accent}
                      onChange={(e) => setAccent(e.target.value)}
                      className="size-9 shrink-0 cursor-pointer rounded border"
                      style={{ borderColor: 'var(--border)' }}
                      aria-label="Accent colour"
                    />
                    <input
                      name="accent_color"
                      value={accent}
                      onChange={(e) => setAccent(e.target.value)}
                      className="field font-mono"
                    />
                  </div>
                </div>
                <div>
                  <span className="label">Border</span>
                  <Select
                    name="border_style"
                    defaultValue={border}
                    onChangeValue={setBorder}
                    options={BORDER_STYLES.map((b) => ({ id: b.id, label: b.label }))}
                  />
                </div>
                <div>
                  <span className="label">Body typeface</span>
                  <Select
                    name="font_family"
                    defaultValue={font}
                    onChangeValue={setFont}
                    options={FONT_FAMILIES.map((f) => ({ id: f.id, label: f.label }))}
                  />
                </div>
                <div>
                  <span className="label">Paper</span>
                  <Select
                    name="paper_size"
                    defaultValue={paper}
                    onChangeValue={setPaper}
                    options={PAPER_SIZES}
                  />
                </div>
                <div>
                  <span className="label">Orientation</span>
                  <Select
                    name="orientation"
                    defaultValue={orientation}
                    onChangeValue={setOrientation}
                    options={[
                      { id: 'portrait', label: 'Portrait' },
                      { id: 'landscape', label: 'Landscape' },
                    ]}
                  />
                </div>
                <div>
                  <span className="label">Serial prefix</span>
                  <input
                    name="serial_prefix"
                    defaultValue={s.serial_prefix ?? 'CERT'}
                    className="field font-mono"
                  />
                </div>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <Toggle name="show_serial" label="Serial number" defaultChecked={s.show_serial ?? true} />
                <Toggle name="show_seal" label="School seal" defaultChecked={s.show_seal ?? true} />
                <Toggle
                  name="show_photo"
                  label="Student photo"
                  defaultChecked={s.show_photo ?? false}
                />
              </div>
            </Section>

            {/* --------------------------------------- wording per kind */}
            <Section
              tone="var(--amber-ink)"
              title="Wording, per certificate type"
              hint="Each type has its own text. A leaving certificate that says “is enrolled in” is the bug this replaces."
            >
              <div className="mb-3 flex flex-wrap gap-1.5">
                {CERTIFICATE_KINDS.map((k) => {
                  const on = activeKind === k.id
                  return (
                    <button
                      key={k.id}
                      type="button"
                      onClick={() => setActiveKind(k.id)}
                      className={`chip ${on ? '!border-transparent' : ''}`}
                      style={
                        on
                          ? { background: 'var(--brand)', color: '#fff' }
                          : undefined
                      }
                    >
                      {k.label}
                    </button>
                  )
                })}
              </div>

              {/* Every kind stays mounted. A hidden textarea still submits,
                  so switching tabs cannot lose what was typed in another --
                  and unmounting them would mean only the last kind opened
                  ever reached the server. */}
              {CERTIFICATE_KINDS.map((k) => (
                <div key={k.id} hidden={activeKind !== k.id}>
                  <span className="label">Heading</span>
                  <input
                    name={`title_${k.id}`}
                    value={titles[k.id] ?? ''}
                    onChange={(e) => setTitles((t) => ({ ...t, [k.id]: e.target.value }))}
                    className="field"
                  />

                  <div className="mt-3 mb-2 flex flex-wrap gap-1.5">
                    {CERTIFICATE_TOKENS.map((t) => (
                      <button
                        key={t.token}
                        type="button"
                        onClick={() => insert(t.token)}
                        className="chip font-mono !text-[0.68rem]"
                        title={`Inserts ${t.sample}`}
                      >
                        {`{${t.token}}`}
                      </button>
                    ))}
                  </div>

                  <textarea
                    id={`cert-body-${k.id}`}
                    name={`body_${k.id}`}
                    rows={7}
                    value={bodies[k.id] ?? ''}
                    onChange={(e) => setBodies((b) => ({ ...b, [k.id]: e.target.value }))}
                    className="field resize-y"
                  />
                  <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                    Blank lines become paragraph breaks. Placeholders are replaced with the
                    student&rsquo;s real data at issue time.
                  </p>
                </div>
              ))}

              {/* Kept so a school that only ever wrote one block of text
                  before this panel existed does not silently lose it. */}
              <input type="hidden" name="body_text" value={s.body_text ?? ''} />
            </Section>

            {/* ------------------------------------------- printed fields */}
            <Section
              tone="var(--green-ink)"
              title="Particulars table"
              hint="Which rows appear in the box under the body text."
            >
              <div className="grid gap-2 sm:grid-cols-3">
                {FIELDS.map((f) => (
                  <Toggle
                    key={f.key}
                    name={`field_${f.key}`}
                    label={f.label}
                    defaultChecked={s.fields?.[f.key] ?? true}
                  />
                ))}
              </div>
            </Section>

            {/* ------------------------------------------- school details */}
            <Section
              tone="var(--blue-ink)"
              title="Masthead"
              hint="Left blank, each falls back to Documents & Branding in School Settings — fill those in once and every printed sheet gets them."
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
                    placeholder={doc?.address ?? 'Full address'}
                    className="field"
                  />
                </div>
                <div>
                  <span className="label">Contact number</span>
                  <input
                    name="contact_number"
                    defaultValue={s.contact_number ?? ''}
                    placeholder={doc?.phone ?? '+92 300 0000000'}
                    className="field"
                  />
                </div>
                <div>
                  <span className="label">Email</span>
                  <input
                    name="email"
                    type="email"
                    defaultValue={s.email ?? ''}
                    placeholder={doc?.email ?? 'school@example.com'}
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
                  label="Watermark"
                  hint="Printed very faint behind the text."
                  defaultPath={s.background_url ?? ''}
                  defaultPreview={publicUrl(s.background_url)}
                  onUploaded={setBackground}
                />
              </div>
            </Section>

            {/* ------------------------------------- seals and signatures */}
            <Section
              tone="var(--red-ink)"
              title="Seal, stamp and signatures"
              hint="Transparent PNGs. The seal prints between the two signatures; the stamp prints over the principal's."
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <ImageUpload
                  name="seal_url"
                  bucket={ASSETS}
                  folder={schoolId}
                  label="Round school seal"
                  hint="Falls back to the school stamp in Documents."
                  defaultPath={s.seal_url ?? ''}
                  defaultPreview={publicUrl(s.seal_url)}
                  onUploaded={setSeal}
                />
                <ImageUpload
                  name="stamp_url"
                  bucket={ASSETS}
                  folder={schoolId}
                  label="Principal's stamp"
                  hint="The rubber stamp, not the signature."
                  defaultPath={s.stamp_url ?? ''}
                  defaultPreview={publicUrl(s.stamp_url)}
                  onUploaded={setStamp}
                />
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div
                  className="flex flex-col gap-2 rounded-lg border p-3"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                    Principal / head
                  </p>
                  <input
                    name="principal_name"
                    defaultValue={s.principal_name ?? ''}
                    placeholder={doc?.principal?.name ?? 'Full name'}
                    className="field"
                  />
                  <input
                    name="principal_label"
                    defaultValue={s.principal_label ?? 'Principal'}
                    className="field"
                  />
                  <ImageUpload
                    name="principal_signature_url"
                    bucket={ASSETS}
                    folder={schoolId}
                    label="Signature image"
                    hint="Transparent PNG preferred."
                    defaultPath={s.principal_signature_url ?? ''}
                    defaultPreview={publicUrl(s.principal_signature_url)}
                    onUploaded={setPrincipalSig}
                  />
                </div>
                <div
                  className="flex flex-col gap-2 rounded-lg border p-3"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                    Authorised signatory
                  </p>
                  <input
                    name="signatory_name"
                    defaultValue={s.signatory_name ?? ''}
                    placeholder="Full name"
                    className="field"
                  />
                  <input
                    name="signatory_label"
                    defaultValue={s.signatory_label ?? 'Authorized Signatory'}
                    className="field"
                  />
                  <ImageUpload
                    name="signatory_signature_url"
                    bucket={ASSETS}
                    folder={schoolId}
                    label="Signature image"
                    hint="Transparent PNG preferred."
                    defaultPath={s.signatory_signature_url ?? ''}
                    defaultPreview={publicUrl(s.signatory_signature_url)}
                    onUploaded={setSignatorySig}
                  />
                </div>
              </div>
            </Section>

            <Section tone="var(--muted)" title="Footer">
              <input
                name="footer_note"
                defaultValue={s.footer_note ?? ''}
                placeholder={doc?.footerNote ?? 'Small print along the bottom edge'}
                className="field"
              />
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
                {CERTIFICATE_KINDS.find((k) => k.id === activeKind)?.label} · sample data
              </p>
              <div
                className="overflow-hidden rounded-lg border"
                style={{ borderColor: 'var(--border)' }}
              >
                {/* The real sheet, scaled. transform:scale rather than
                    smaller fonts, so what is on screen is geometrically the
                    page -- a preview that re-flows is a preview that lies
                    about where the signatures land. */}
                <div
                  style={{
                    width: `${previewRem}rem`,
                    height: `${(sheetH * previewScale) / 16}rem`,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      transform: `scale(${previewScale})`,
                      transformOrigin: 'top left',
                      width: `${100 / previewScale}%`,
                    }}
                  >
                    <CertificateSheet cert={previewCert} settings={previewSettings} doc={doc} />
                  </div>
                </div>
              </div>
              <p className="mt-2 text-[0.65rem]" style={{ color: 'var(--muted)' }}>
                Sample data, and the same component the printed sheet uses — it redraws for every
                switch, colour and word above.
              </p>
            </div>
          </aside>
        </div>
      </SidePanel>
    </>
  )
}
