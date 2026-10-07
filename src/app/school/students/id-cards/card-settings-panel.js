'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import SidePanel from '@/components/side-panel'
import { Select } from '@/components/combobox'
import { Spinner } from '@/components/spinner'
import { useCloseOnSuccess } from '@/components/use-close-on-success'
import ImageUpload from '@/components/image-upload'
import { ASSETS, publicUrl } from '@/lib/storage'
import { saveIdCardSettings } from '../actions'
import IdCard from './id-card'

const TABS = [
  { id: 'school', label: 'School Info' },
  { id: 'layout', label: 'Card Layout' },
  { id: 'fields', label: 'Student Fields' },
  { id: 'design', label: 'Design' },
  { id: 'signatures', label: 'Signatures' },
  { id: 'code', label: 'Barcode / QR' },
]

const FIELDS = [
  ['photo', 'Student photo'],
  ['student_name', 'Student name'],
  ['father_name', 'Father name'],
  ['roll_number', 'Roll number'],
  ['class', 'Class / grade'],
  ['section', 'Section'],
  ['date_of_birth', 'Date of birth'],
  ['admission_number', 'Admission number'],
  ['address', 'Address'],
  ['gender', 'Gender'],
  ['status', 'Status'],
]

const PRESETS = [
  ['Purple', '#3b0764', '#7c3aed'],
  ['Blue', '#1e3a8a', '#3b82f6'],
  ['Teal', '#134e4a', '#14b8a6'],
  ['Rose', '#881337', '#f43f5e'],
  ['Amber', '#78350f', '#f59e0b'],
  ['Slate', '#0f172a', '#475569'],
]

const SAMPLE = {
  id: 'sample',
  name: 'Ahmad Khan',
  father_name: 'Muhammad Ali',
  admission_number: 'STU-001',
  roll_number: 'R-24',
  klass: 'Class 5',
  section: 'A',
  gender: 'Male',
  status: 'Active',
  date_of_birth: '2014-06-01',
  address: 'Springfield',
}

function SaveButton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" form="card-settings" disabled={pending} className="btn btn-primary">
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

function Toggle({ name, label, defaultChecked, onToggle }) {
  return (
    <label
      className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
      style={{ borderColor: 'var(--border)' }}
    >
      <span className="text-sm" style={{ color: 'var(--ink)' }}>
        {label}
      </span>
      <span className="switch">
        <input
          type="checkbox"
          name={name}
          defaultChecked={defaultChecked}
          onChange={(e) => onToggle?.(e.target.checked)}
        />
      </span>
    </label>
  )
}

export default function CardSettingsPanel({ settings, schoolName, schoolId }) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState('school')
  const [state, formAction] = useActionState(saveIdCardSettings, {})
  useCloseOnSuccess(state, () => setOpen(false))

  // Only the values the preview actually renders are mirrored into state.
  // Everything else stays uncontrolled, so the form does not re-render on
  // every keystroke in a field nobody is watching.
  const [live, setLive] = useState(() => ({
    school_name: settings?.school_name ?? schoolName ?? '',
    orientation: settings?.orientation ?? 'vertical',
    card_width: settings?.card_width ?? 208,
    card_height: settings?.card_height ?? 340,
    header_from: settings?.header_from ?? '#3b0764',
    header_to: settings?.header_to ?? '#7c3aed',
    border_color: settings?.border_color ?? '#e2e8f0',
    border_style: settings?.border_style ?? 'solid',
    font_size: settings?.font_size ?? 10,
    font_style: settings?.font_style ?? 'sans',
    text_align: settings?.text_align ?? 'center',
    text_color: settings?.text_color ?? '#1e293b',
    show_barcode: settings?.show_barcode ?? true,
    fields: settings?.fields ?? {},
    logoUrl: publicUrl(settings?.logo_url),
    backgroundUrl: publicUrl(settings?.background_url),
  }))

  const set = (patch) => setLive((v) => ({ ...v, ...patch }))

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn btn-ghost">
        Card settings
      </button>

      <SidePanel
        open={open}
        onClose={() => setOpen(false)}
        width="max-w-4xl"
        title="Card settings"
        description="Configure the ID card template for all students"
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
          <div>
            <div
              className="mb-4 flex gap-4 overflow-x-auto border-b"
              style={{ borderColor: 'var(--border)' }}
            >
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`tab-underline ${tab === t.id ? 'tab-underline-on' : ''}`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Every tab stays mounted and is hidden with CSS. Unmounting
                would drop the uncontrolled inputs' values the moment you
                switched tabs, and the form would submit blanks. */}
            <form id="card-settings" action={formAction} className="flex flex-col gap-4">
              <div hidden={tab !== 'school'} className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <span className="label">School name</span>
                  <input
                    name="school_name"
                    value={live.school_name}
                    onChange={(e) => set({ school_name: e.target.value })}
                    className="field"
                  />
                </div>
                <div>
                  <span className="label">School email</span>
                  <input name="school_email" defaultValue={settings?.school_email ?? ''} className="field" />
                </div>
                <div>
                  <span className="label">School phone</span>
                  <input name="school_phone" defaultValue={settings?.school_phone ?? ''} className="field" />
                </div>
                <div className="sm:col-span-2">
                  <span className="label">School address</span>
                  <input name="school_address" defaultValue={settings?.school_address ?? ''} className="field" />
                </div>
                <ImageUpload
                  name="logo_url"
                  bucket={ASSETS}
                  folder={schoolId}
                  label="School logo"
                  hint="Square PNG with a transparent background."
                  defaultPath={settings?.logo_url ?? ''}
                  defaultPreview={publicUrl(settings?.logo_url)}
                  onUploaded={(p) => set({ logoUrl: p ? publicUrl(p) : null })}
                />
                <ImageUpload
                  name="background_url"
                  bucket={ASSETS}
                  folder={schoolId}
                  label="Card background"
                  hint="A faint image keeps the text readable."
                  defaultPath={settings?.background_url ?? ''}
                  defaultPreview={publicUrl(settings?.background_url)}
                  onUploaded={(p) => set({ backgroundUrl: p ? publicUrl(p) : null })}
                />
              </div>

              <div hidden={tab !== 'layout'} className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <span className="label">Orientation</span>
                  <Select
                    name="orientation"
                    defaultValue={live.orientation}
                    onChangeValue={(v) => set({ orientation: v })}
                    options={[
                      { id: 'vertical', label: 'Vertical' },
                      { id: 'horizontal', label: 'Horizontal' },
                    ]}
                  />
                </div>
                <div>
                  <span className="label">Card width — {live.card_width}px</span>
                  <input
                    name="card_width"
                    type="range"
                    min="160"
                    max="320"
                    value={live.card_width}
                    onChange={(e) => set({ card_width: Number(e.target.value) })}
                    className="w-full"
                  />
                </div>
                <div>
                  <span className="label">Card height — {live.card_height}px</span>
                  <input
                    name="card_height"
                    type="range"
                    min="240"
                    max="460"
                    value={live.card_height}
                    onChange={(e) => set({ card_height: Number(e.target.value) })}
                    className="w-full"
                  />
                </div>
                <div>
                  <span className="label">Header gradient — start</span>
                  <input
                    name="header_from"
                    type="color"
                    value={live.header_from}
                    onChange={(e) => set({ header_from: e.target.value })}
                    className="field h-10 p-1"
                  />
                </div>
                <div>
                  <span className="label">Header gradient — end</span>
                  <input
                    name="header_to"
                    type="color"
                    value={live.header_to}
                    onChange={(e) => set({ header_to: e.target.value })}
                    className="field h-10 p-1"
                  />
                </div>
                <div className="sm:col-span-2">
                  <div
                    className="h-8 rounded-lg"
                    style={{
                      background: `linear-gradient(135deg, ${live.header_from}, ${live.header_to})`,
                    }}
                    aria-hidden="true"
                  />
                </div>
                <div>
                  <span className="label">Border style</span>
                  <Select
                    name="border_style"
                    defaultValue={live.border_style}
                    onChangeValue={(v) => set({ border_style: v })}
                    options={[
                      { id: 'solid', label: 'Solid' },
                      { id: 'dashed', label: 'Dashed' },
                      { id: 'none', label: 'None' },
                    ]}
                  />
                </div>
                <div>
                  <span className="label">Border colour</span>
                  <input
                    name="border_color"
                    type="color"
                    value={live.border_color}
                    onChange={(e) => set({ border_color: e.target.value })}
                    className="field h-10 p-1"
                  />
                </div>
              </div>

              <div hidden={tab !== 'fields'}>
                <p className="mb-3 text-xs" style={{ color: 'var(--muted)' }}>
                  Enabled fields are filled from each student&rsquo;s record when cards are printed.
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {FIELDS.map(([key, label]) => (
                    <Toggle
                      key={key}
                      name={`field_${key}`}
                      label={label}
                      defaultChecked={live.fields[key] ?? !['date_of_birth', 'address'].includes(key)}
                      onToggle={(on) => set({ fields: { ...live.fields, [key]: on } })}
                    />
                  ))}
                </div>
              </div>

              <div hidden={tab !== 'design'} className="grid gap-3 sm:grid-cols-2">
                <div>
                  <span className="label">Font size — {live.font_size}px</span>
                  <input
                    name="font_size"
                    type="range"
                    min="8"
                    max="13"
                    value={live.font_size}
                    onChange={(e) => set({ font_size: Number(e.target.value) })}
                    className="w-full"
                  />
                </div>
                <div>
                  <span className="label">Font style</span>
                  <Select
                    name="font_style"
                    defaultValue={live.font_style}
                    onChangeValue={(v) => set({ font_style: v })}
                    options={[
                      { id: 'sans', label: 'Sans-serif' },
                      { id: 'serif', label: 'Serif' },
                      { id: 'mono', label: 'Monospace' },
                    ]}
                  />
                </div>
                <div>
                  <span className="label">Text alignment</span>
                  <Select
                    name="text_align"
                    defaultValue={live.text_align}
                    onChangeValue={(v) => set({ text_align: v })}
                    options={[
                      { id: 'left', label: 'Left' },
                      { id: 'center', label: 'Center' },
                      { id: 'right', label: 'Right' },
                    ]}
                  />
                </div>
                <div>
                  <span className="label">Text colour</span>
                  <input
                    name="text_color"
                    type="color"
                    value={live.text_color}
                    onChange={(e) => set({ text_color: e.target.value })}
                    className="field h-10 p-1"
                  />
                </div>
                <div className="sm:col-span-2">
                  <span className="label">Quick presets</span>
                  <div className="flex flex-wrap gap-2">
                    {PRESETS.map(([label, from, to]) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => set({ header_from: from, header_to: to })}
                        className="chip"
                      >
                        <span
                          className="size-3 rounded-full"
                          style={{ background: to }}
                          aria-hidden="true"
                        />
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div hidden={tab !== 'signatures'} className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-2 rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
                  <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                    Principal
                  </p>
                  <input
                    name="principal_label"
                    defaultValue={settings?.principal_label ?? 'Principal'}
                    className="field"
                  />
                  <ImageUpload
                    name="principal_signature_url"
                    bucket={ASSETS}
                    folder={schoolId}
                    label="Signature"
                    defaultPath={settings?.principal_signature_url ?? ''}
                    defaultPreview={publicUrl(settings?.principal_signature_url)}
                  />
                </div>
                <div className="flex flex-col gap-2 rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
                  <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                    Authorised signatory
                  </p>
                  <input
                    name="signatory_label"
                    defaultValue={settings?.signatory_label ?? 'Authorized Signatory'}
                    className="field"
                  />
                </div>
                <div className="sm:col-span-2">
                  <ImageUpload
                    name="signatory_signature_url"
                    bucket={ASSETS}
                    folder={schoolId}
                    label="Authorised signatory signature"
                    defaultPath={settings?.signatory_signature_url ?? ''}
                    defaultPreview={publicUrl(settings?.signatory_signature_url)}
                  />
                </div>
              </div>

              <div hidden={tab !== 'code'} className="grid gap-3 sm:grid-cols-2">
                <Toggle
                  name="show_barcode"
                  label="Show barcode"
                  defaultChecked={live.show_barcode}
                  onToggle={(on) => set({ show_barcode: on })}
                />
                <Toggle name="show_qr" label="Show QR code" defaultChecked={settings?.show_qr ?? false} />
                <p
                  className="rounded-lg px-3 py-2 text-xs sm:col-span-2"
                  style={{ background: 'var(--amber-soft)', color: 'var(--amber-ink)' }}
                >
                  The barcode is generated from the admission number as Code 128 — no manual input.
                  QR rendering is not implemented yet, so that toggle stores the preference only.
                </p>
              </div>

              {state?.error && (
                <p
                  className="rounded-lg px-3 py-2 text-sm"
                  style={{ background: 'var(--red-soft)', color: 'var(--red-ink)' }}
                >
                  {state.error}
                </p>
              )}
            </form>
          </div>

          <aside className="hidden lg:block">
            <p
              className="mb-2 text-[0.66rem] font-bold uppercase tracking-wider"
              style={{ color: 'var(--muted)' }}
            >
              Live preview
            </p>
            <div className="sticky top-0">
              <IdCard student={SAMPLE} settings={live} sample />
            </div>
          </aside>
        </div>
      </SidePanel>
    </>
  )
}
