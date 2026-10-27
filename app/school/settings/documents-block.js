'use client'

import { useActionState, useState } from 'react'
import { Spinner } from '@/components/spinner'
import { useToast } from '@/components/toast'
import { Select } from '@/components/combobox'
import ImageUpload from '@/components/image-upload'
import { DocHeader, SignatureRow } from '@/components/print/document-sheet'
import { ASSETS, publicUrl } from '@/lib/storage'
import { HEADER_STYLES, PAPER_SIZES, toDocument } from '@/lib/documents'
import { saveDocumentSettings } from './actions'

// DOCUMENTS & BRANDING
//
// The one screen that decides what every printed sheet in the app looks like:
// fee challans, receipts, salary slips, payment vouchers, certificates, ID
// cards and every report. Before this existed, each of those either carried
// its own copy of the school's name and logo or carried none at all -- which
// is why the salary slip printed without a letterhead and the challan could
// not be printed at all.
//
// Filling this in once is the whole point. Every other template falls back to
// it, so a school that uploads a crest here gets it on all of them.

const FORM = 'documents-form'

// Takes pending as a prop rather than reading useFormStatus(): the button
// sits in the footer card OUTSIDE the form it submits (via form="…"), and
// useFormStatus only reports for a form it is rendered inside -- there it
// would be permanently false and the spinner would never appear.
function SaveButton({ pending }) {
  return (
    <button type="submit" form={FORM} disabled={pending} className="btn btn-primary">
      {pending ? (
        <>
          <Spinner /> Saving…
        </>
      ) : (
        'Save Changes'
      )}
    </button>
  )
}

function Block({ icon, title, subtitle, children, cols = 2 }) {
  return (
    <div className="card overflow-hidden">
      <div className="panel-head flex items-center gap-3 px-5 py-3.5">
        <span
          className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/15 text-xs text-white"
          aria-hidden="true"
        >
          {icon}
        </span>
        <div>
          <p className="text-sm font-semibold text-white">{title}</p>
          {subtitle && <p className="text-xs text-white/75">{subtitle}</p>}
        </div>
      </div>
      <div
        className="grid gap-4 p-5"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {children}
      </div>
    </div>
  )
}

function Field({ label, hint, children, full }) {
  return (
    <div style={full ? { gridColumn: '1 / -1' } : undefined}>
      <span className="label">
        {label}
        {hint && (
          <span className="ml-1 font-normal" style={{ color: 'var(--muted-2)' }}>
            · {hint}
          </span>
        )}
      </span>
      {children}
    </div>
  )
}

function Switch({ name, label, hint, defaultChecked }) {
  return (
    <div
      className="flex items-center justify-between gap-4 py-3"
      style={{ borderBottom: '1px solid var(--border-soft)' }}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
          {label}
        </p>
        {hint && (
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            {hint}
          </p>
        )}
      </div>
      <label className="switch shrink-0">
        <input type="checkbox" name={name} defaultChecked={defaultChecked} />
      </label>
    </div>
  )
}

export default function DocumentsBlock({ row, school, schoolId, canWrite }) {
  const [state, formAction, pending] = useActionState(saveDocumentSettings, {})
  const { success } = useToast()
  const [seen, setSeen] = useState(null)
  if (state?.ok && state.at !== seen) {
    setSeen(state.at)
    queueMicrotask(() => success(state.ok))
  }

  const d = row ?? {}

  // Controlled only where the preview follows. The preview is the real
  // DocHeader -- the same component every sheet uses -- so what is shown here
  // is literally the masthead that will print.
  const [name, setName] = useState(d.school_name ?? school?.school_name ?? '')
  const [tagline, setTagline] = useState(d.tagline ?? '')
  const [address, setAddress] = useState(d.address ?? school?.address ?? '')
  const [city, setCity] = useState(d.city ?? school?.city ?? '')
  const [phone, setPhone] = useState(d.phone ?? school?.phone ?? '')
  const [email, setEmail] = useState(d.email ?? school?.email ?? '')
  const [registration, setRegistration] = useState(d.registration_no ?? school?.affiliation ?? '')
  const [accent, setAccent] = useState(d.accent_color ?? '#1e3a8a')
  const [headerStyle, setHeaderStyle] = useState(d.header_style ?? 'classic')

  // toDocument() so the preview goes through exactly the same normalisation
  // the print routes do -- including the fallbacks, so an empty field shows
  // what will actually be printed rather than nothing.
  const preview = toDocument(
    {
      ...d,
      school_name: name,
      tagline,
      address,
      city,
      phone,
      email,
      registration_no: registration,
      accent_color: accent,
      header_style: headerStyle,
    },
    school
  )

  return (
    <div className="flex flex-col gap-4">
      {/* ------------------------------------------------- what it prints */}
      <div className="card overflow-hidden p-5">
        <p
          className="mb-3 text-[0.68rem] font-bold uppercase tracking-wider"
          style={{ color: 'var(--muted)' }}
        >
          Preview — this masthead prints on every document
        </p>
        <div className="doc-preview">
          <div
            className="doc"
            style={{
              '--doc-accent': preview.accent,
              width: '190mm',
              padding: '4mm',
              marginInline: 'auto',
              border: '1px solid var(--border)',
              borderRadius: '4px',
            }}
          >
            <DocHeader
              doc={preview}
              title="FEE CHALLAN"
              meta={[
                ['Challan No', 'CH-2026-0001'],
                ['Due date', '10 Nov 2026'],
              ]}
            />
            <SignatureRow
              sealUrl={publicUrl(d.school_stamp_url)}
              signatures={[
                {
                  name: preview.accountant.name,
                  label: preview.accountant.label,
                  signatureUrl: preview.accountant.signatureUrl,
                },
                {
                  name: preview.principal.name,
                  label: preview.principal.label,
                  signatureUrl: preview.principal.signatureUrl,
                  stampUrl: publicUrl(d.principal_stamp_url),
                },
              ]}
            />
          </div>
        </div>
      </div>

      <form id={FORM} action={formAction} className="flex flex-col gap-4">
        {/* ----------------------------------------------------- masthead */}
        <Block icon="▣" title="Letterhead" subtitle="Printed at the top of every sheet">
          <Field label="School name as printed" full>
            <input
              name="school_name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={school?.school_name ?? ''}
              className="field"
              disabled={!canWrite}
            />
          </Field>
          <Field label="Tagline / motto" hint="optional" full>
            <input
              name="tagline"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder="Knowledge · Character · Service"
              className="field"
              disabled={!canWrite}
            />
          </Field>
          <Field label="Address" full>
            <input
              name="address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="field"
              disabled={!canWrite}
            />
          </Field>
          <Field label="City">
            <input
              name="city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="field"
              disabled={!canWrite}
            />
          </Field>
          <Field label="Phone">
            <input
              name="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="field"
              disabled={!canWrite}
            />
          </Field>
          <Field label="Second phone" hint="optional">
            <input
              name="phone_alt"
              defaultValue={d.phone_alt ?? ''}
              className="field"
              disabled={!canWrite}
            />
          </Field>
          <Field label="Email">
            <input
              name="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="field"
              disabled={!canWrite}
            />
          </Field>
          <Field label="Website">
            <input
              name="website"
              defaultValue={d.website ?? school?.website ?? ''}
              className="field"
              disabled={!canWrite}
            />
          </Field>
          <Field
            label="Registration / affiliation line"
            hint="e.g. Affiliated with BISE Lahore · Reg. 1234"
          >
            <input
              name="registration_no"
              value={registration}
              onChange={(e) => setRegistration(e.target.value)}
              className="field"
              disabled={!canWrite}
            />
          </Field>

          <ImageUpload
            name="logo_url"
            bucket={ASSETS}
            folder={schoolId}
            label="Crest / logo"
            hint="PNG or JPG, max 2MB. Prints at 19mm."
            defaultPath={d.logo_url ?? ''}
            defaultPreview={publicUrl(d.logo_url)}
          />
          <ImageUpload
            name="watermark_url"
            bucket={ASSETS}
            folder={schoolId}
            label="Watermark"
            hint="Printed at 5-7% behind the text."
            defaultPath={d.watermark_url ?? ''}
            defaultPreview={publicUrl(d.watermark_url)}
          />
        </Block>

        {/* -------------------------------------- stamps and signatures */}
        <Block
          icon="✦"
          title="Stamps & signatures"
          subtitle="The three marks a school document is not accepted without"
        >
          <ImageUpload
            name="school_stamp_url"
            bucket={ASSETS}
            folder={schoolId}
            label="Round school seal"
            hint="Transparent PNG. Prints between the signatures."
            defaultPath={d.school_stamp_url ?? ''}
            defaultPreview={publicUrl(d.school_stamp_url)}
          />
          <ImageUpload
            name="principal_stamp_url"
            bucket={ASSETS}
            folder={schoolId}
            label="Principal's rubber stamp"
            hint="Transparent PNG. Prints over the signature."
            defaultPath={d.principal_stamp_url ?? ''}
            defaultPreview={publicUrl(d.principal_stamp_url)}
          />

          <div
            className="flex flex-col gap-3 rounded-xl border p-4"
            style={{ borderColor: 'var(--border)' }}
          >
            <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
              Principal / head
            </p>
            <input
              name="principal_name"
              defaultValue={d.principal_name ?? school?.principal_name ?? ''}
              placeholder="Full name"
              className="field"
              disabled={!canWrite}
            />
            <input
              name="principal_label"
              defaultValue={d.principal_label ?? 'Principal'}
              placeholder="Caption under the line"
              className="field"
              disabled={!canWrite}
            />
            <ImageUpload
              name="principal_signature_url"
              bucket={ASSETS}
              folder={schoolId}
              label="Signature"
              hint="Transparent PNG, signed on white and cut out."
              defaultPath={d.principal_signature_url ?? ''}
              defaultPreview={publicUrl(d.principal_signature_url)}
            />
          </div>

          <div
            className="flex flex-col gap-3 rounded-xl border p-4"
            style={{ borderColor: 'var(--border)' }}
          >
            <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
              Accountant / cashier
            </p>
            <input
              name="accountant_name"
              defaultValue={d.accountant_name ?? ''}
              placeholder="Full name"
              className="field"
              disabled={!canWrite}
            />
            <input
              name="accountant_label"
              defaultValue={d.accountant_label ?? 'Accountant'}
              placeholder="Caption under the line"
              className="field"
              disabled={!canWrite}
            />
            <ImageUpload
              name="accountant_signature_url"
              bucket={ASSETS}
              folder={schoolId}
              label="Signature"
              hint="Signs challans, receipts and vouchers."
              defaultPath={d.accountant_signature_url ?? ''}
              defaultPreview={publicUrl(d.accountant_signature_url)}
            />
          </div>

          <p className="text-xs" style={{ gridColumn: '1 / -1', color: 'var(--muted)' }}>
            A teacher&rsquo;s own signature and stamp live on their staff record, under Staff —
            not here. These two are the school&rsquo;s.
          </p>
        </Block>

        {/* ----------------------------------------------- bank details */}
        <Block
          icon="₨"
          title="Bank account"
          subtitle="Printed on the fee challan, so a teller does not have to look it up"
        >
          <Field label="Bank name">
            <input
              name="bank_name"
              defaultValue={d.bank_name ?? ''}
              className="field"
              disabled={!canWrite}
            />
          </Field>
          <Field label="Branch">
            <input
              name="bank_branch"
              defaultValue={d.bank_branch ?? ''}
              className="field"
              disabled={!canWrite}
            />
          </Field>
          <Field label="Account title">
            <input
              name="bank_account_title"
              defaultValue={d.bank_account_title ?? ''}
              className="field"
              disabled={!canWrite}
            />
          </Field>
          <Field label="Account number">
            <input
              name="bank_account_number"
              defaultValue={d.bank_account_number ?? ''}
              className="field font-mono"
              disabled={!canWrite}
            />
          </Field>
          <Field label="IBAN" full>
            <input
              name="bank_iban"
              defaultValue={d.bank_iban ?? ''}
              className="field font-mono"
              disabled={!canWrite}
            />
          </Field>
          <Field label="Note to the depositor" hint="optional" full>
            <input
              name="bank_note"
              defaultValue={d.bank_note ?? ''}
              placeholder="Deposit at any branch. Online transfers accepted."
              className="field"
              disabled={!canWrite}
            />
          </Field>
        </Block>

        {/* --------------------------------------------- challan layout */}
        <Block icon="▤" title="Challan layout" subtitle="How the fee slip is printed">
          <Field label="Heading">
            <input
              name="challan_title"
              defaultValue={d.challan_title ?? 'FEE CHALLAN'}
              className="field"
              disabled={!canWrite}
            />
          </Field>
          <Field label="Copies" hint="comma separated, up to four">
            <input
              name="challan_copies"
              defaultValue={(Array.isArray(d.challan_copies) ? d.challan_copies : [
                'Bank Copy',
                'School Copy',
                'Student Copy',
              ]).join(', ')}
              className="field"
              disabled={!canWrite}
            />
          </Field>
          <Field
            label="Charge after the due date"
            hint="printed as a second payable figure, not charged automatically"
          >
            <input
              name="challan_fine_amount"
              type="number"
              min="0"
              step="1"
              defaultValue={d.challan_fine_amount ?? 0}
              className="field"
              disabled={!canWrite}
            />
          </Field>
          <Field label="Instructions to the parent" full>
            <textarea
              name="challan_instructions"
              rows={3}
              defaultValue={
                d.challan_instructions ??
                'Fee is payable on or before the due date. A fine applies after the due date. Keep the student copy as proof of payment.'
              }
              className="field resize-y"
              disabled={!canWrite}
            />
          </Field>
          <div style={{ gridColumn: '1 / -1' }}>
            <Switch
              name="challan_show_barcode"
              label="Barcode"
              hint="Encodes the challan number so collection is a scan, not a typed search."
              defaultChecked={d.challan_show_barcode ?? true}
            />
            <Switch
              name="challan_show_bank"
              label="Bank deposit panel"
              hint="Switched off for a school that only takes fees at its own counter."
              defaultChecked={d.challan_show_bank ?? true}
            />
            <Switch
              name="challan_show_fine"
              label="Payable-after-due-date figure"
              hint="Off for a school that charges no fine — two identical figures read as a mistake."
              defaultChecked={d.challan_show_fine ?? true}
            />
          </div>
        </Block>

        {/* ------------------------------------------------ shared look */}
        <Block icon="◐" title="Shared look" subtitle="Applies to every printed document">
          <Field label="Masthead style">
            <Select
              name="header_style"
              defaultValue={headerStyle}
              onChangeValue={setHeaderStyle}
              options={HEADER_STYLES.map((h) => ({ id: h.id, label: `${h.label} — ${h.hint}` }))}
            />
          </Field>
          <Field label="Paper size">
            <Select name="paper_size" defaultValue={d.paper_size ?? 'a4'} options={PAPER_SIZES} />
          </Field>
          <Field label="Accent colour" hint="rules, table heads, copy badges">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={accent}
                onChange={(e) => setAccent(e.target.value)}
                className="size-9 shrink-0 cursor-pointer rounded border"
                style={{ borderColor: 'var(--border)' }}
                aria-label="Accent colour"
                disabled={!canWrite}
              />
              <input
                name="accent_color"
                value={accent}
                onChange={(e) => setAccent(e.target.value)}
                className="field font-mono"
                disabled={!canWrite}
              />
            </div>
          </Field>
          <Field label="Footer note" full>
            <input
              name="footer_note"
              defaultValue={
                d.footer_note ??
                'This is a computer generated document. For queries contact the school office.'
              }
              className="field"
              disabled={!canWrite}
            />
          </Field>
          <div style={{ gridColumn: '1 / -1' }}>
            <Switch
              name="show_print_time"
              label="Print the date and time on every sheet"
              hint="Tells an office which of two copies of the same slip is the newer one."
              defaultChecked={d.show_print_time ?? true}
            />
          </div>
        </Block>

        {state?.error && (
          <p
            className="rounded-lg px-3 py-2 text-sm"
            style={{ background: 'var(--red-soft)', color: 'var(--red)' }}
          >
            {state.error}
          </p>
        )}
      </form>

      <div
        className="card flex flex-wrap items-center justify-between gap-3 px-5 py-3.5"
        style={{ background: 'var(--card-alt)' }}
      >
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          Every printed document in the app reads these.
        </p>
        {canWrite && <SaveButton pending={pending} />}
      </div>
    </div>
  )
}
