// Plain module on purpose -- no 'use client'.
//
// THE LETTERHEAD, ONCE
//
// A school's printed paper is not five unrelated designs. A fee challan, a
// receipt, a salary slip, a payment voucher, a certificate, an ID card and
// every report carry the same masthead, the same accent rule, the same stamps
// and the same footer, because they all come from the same office. Before
// this module each screen built its own from whatever it happened to have in
// scope -- which is why the salary slip printed no logo at all and the ID
// card and the certificate could disagree about the school's own phone
// number.
//
// `loadDocument()` reads document_settings once and returns the shape below.
// Everything in components/print/ takes that shape and nothing else, so a
// field added here reaches every sheet.
//
// Images are object PATHS in the database (see lib/storage.js). They are
// turned into public URLs here, at the edge of the data layer, so no print
// component ever has to know which bucket anything lives in.

import { publicUrl } from '@/lib/storage'

/* ========================================================== the shape ==== */

// What a sheet gets when the school has saved nothing at all. Every print
// screen still renders -- with the school's own name, pulled from the schools
// row -- rather than showing a page of blanks.
export const DOCUMENT_DEFAULTS = {
  principalLabel: 'Principal',
  accountantLabel: 'Accountant',
  accent: '#1e3a8a',
  headerStyle: 'classic',
  paper: 'a4',
  footerNote: 'This is a computer generated document. For queries contact the school office.',
  showPrintTime: true,
  challanTitle: 'FEE CHALLAN',
  challanCopies: ['Bank Copy', 'School Copy', 'Student Copy'],
  challanInstructions:
    'Fee is payable on or before the due date. A fine applies after the due date. Keep the student copy as proof of payment.',
}

export const HEADER_STYLES = [
  { id: 'classic', label: 'Classic', hint: 'Logo left, name centred, rule under' },
  { id: 'banner', label: 'Banner', hint: 'Solid accent bar with the name reversed out' },
  { id: 'minimal', label: 'Minimal', hint: 'One line, no logo block' },
]

export const PAPER_SIZES = [
  { id: 'a4', label: 'A4 (210 × 297 mm)' },
  { id: 'letter', label: 'Letter (8.5 × 11 in)' },
  { id: 'legal', label: 'Legal (8.5 × 14 in)' },
]

/**
 * document_settings + the schools row, flattened into what a sheet prints.
 *
 * Takes the already-fetched rows rather than a client, so a page that loads
 * several things in one Promise.all does not pay for a second round trip.
 * `school` is the row getSchoolContext() already has.
 */
export function toDocument(row, school) {
  const r = row ?? {}
  const s = school ?? {}
  const pick = (a, b) => (a ?? '') !== '' ? a : (b ?? null)

  return {
    name: pick(r.school_name, s.school_name) || 'School',
    tagline: r.tagline || null,
    address: pick(r.address, s.address),
    city: pick(r.city, s.city),
    phone: pick(r.phone, s.phone),
    phoneAlt: r.phone_alt || null,
    email: pick(r.email, s.email),
    website: pick(r.website, s.website),
    registration: pick(r.registration_no, s.affiliation),

    logoUrl: publicUrl(pick(r.logo_url, s.logo_url)),
    watermarkUrl: publicUrl(r.watermark_url),
    schoolStampUrl: publicUrl(r.school_stamp_url),
    principalStampUrl: publicUrl(r.principal_stamp_url),

    principal: {
      name: pick(r.principal_name, s.principal_name),
      label: r.principal_label || DOCUMENT_DEFAULTS.principalLabel,
      signatureUrl: publicUrl(r.principal_signature_url),
    },
    accountant: {
      name: r.accountant_name || null,
      label: r.accountant_label || DOCUMENT_DEFAULTS.accountantLabel,
      signatureUrl: publicUrl(r.accountant_signature_url),
    },

    bank: {
      name: r.bank_name || null,
      branch: r.bank_branch || null,
      title: r.bank_account_title || null,
      number: r.bank_account_number || null,
      iban: r.bank_iban || null,
      note: r.bank_note || null,
      // Nothing to print if the school never filled the block in -- the
      // challan drops the whole panel rather than printing six empty labels.
      filled: Boolean(r.bank_name || r.bank_account_number || r.bank_iban),
    },

    challan: {
      title: r.challan_title || DOCUMENT_DEFAULTS.challanTitle,
      copies: Array.isArray(r.challan_copies) && r.challan_copies.length
        ? r.challan_copies.map(String)
        : DOCUMENT_DEFAULTS.challanCopies,
      instructions: r.challan_instructions ?? DOCUMENT_DEFAULTS.challanInstructions,
      showBarcode: r.challan_show_barcode ?? true,
      showBank: r.challan_show_bank ?? true,
      showFine: r.challan_show_fine ?? true,
      fineAmount: Number(r.challan_fine_amount) || 0,
    },

    accent: r.accent_color || DOCUMENT_DEFAULTS.accent,
    headerStyle: r.header_style || DOCUMENT_DEFAULTS.headerStyle,
    paper: r.paper_size || DOCUMENT_DEFAULTS.paper,
    footerNote: r.footer_note ?? DOCUMENT_DEFAULTS.footerNote,
    showPrintTime: r.show_print_time ?? true,
  }
}

/**
 * One round trip, for a page that has nothing yet.
 *
 * The SELECT is open to every member of the school (see 032_documents.sql), so
 * this never fails for want of a permission -- a missing row just means the
 * school has not opened the Documents tab, and the schools row fills in.
 */
export async function loadDocument(supabase, schoolId, school) {
  const { data } = await supabase
    .from('document_settings')
    .select('*')
    .eq('school_id', schoolId)
    .maybeSingle()
  return toDocument(data, school)
}

/* ====================================================== amount in words == */

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen',
  'Eighteen', 'Nineteen',
]
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function under1000(n) {
  if (n === 0) return ''
  if (n < 20) return ONES[n]
  if (n < 100) return `${TENS[Math.floor(n / 10)]}${n % 10 ? ' ' + ONES[n % 10] : ''}`
  return `${ONES[Math.floor(n / 100)]} Hundred${n % 100 ? ' ' + under1000(n % 100) : ''}`
}

/**
 * "Rupees Twenty Five Thousand Four Hundred Only".
 *
 * A challan is a financial instrument: the figure in words is what settles a
 * dispute when the digits are smudged or altered, which is exactly why every
 * real challan carries one. Grouped the way it is read here -- crore, lakh,
 * thousand -- not in millions.
 *
 * Paisa is deliberately dropped. School fees are whole rupees everywhere else
 * in this app (see money() in lib/fee-options.js) and a slip reading "Fifty
 * Paisa Only" would be the bug, not the feature.
 */
export function amountInWords(value, currency = 'Rupees') {
  const n = Math.round(Math.abs(Number(value) || 0))
  if (n === 0) return `${currency} Zero Only`

  const crore = Math.floor(n / 10000000)
  const lakh = Math.floor((n % 10000000) / 100000)
  const thousand = Math.floor((n % 100000) / 1000)
  const rest = n % 1000

  const parts = [
    crore && `${under1000(crore)} Crore`,
    lakh && `${under1000(lakh)} Lakh`,
    thousand && `${under1000(thousand)} Thousand`,
    rest && under1000(rest),
  ].filter(Boolean)

  return `${currency} ${parts.join(' ')} Only`
}

/* ============================================================= formats === */

// Print dates are their own thing. The app's formatDate() follows the
// school's chosen order for screens; a printed document wants the unambiguous
// long form, because "03/04/2026" on a challan a parent keeps for a year is
// two different dates depending on who reads it.
export function printDate(value) {
  if (!value) return '—'
  const ms = typeof value === 'string' && value.length <= 10
    ? Date.parse(`${value}T00:00:00Z`)
    : Date.parse(value)
  if (!Number.isFinite(ms)) return String(value)
  return new Date(ms).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export function printDateTime(value = new Date()) {
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

/* ======================================================= certificates ==== */

export const CERTIFICATE_KINDS = [
  {
    id: 'bonafide',
    label: 'Bonafide',
    title: 'BONAFIDE CERTIFICATE',
    hint: 'Confirms the student is on the roll',
    body:
      'This is to certify that {student_name}, son/daughter of {father_name}, bearing Admission No. {admission_no}, is a bonafide student of this institution and is studying in {class} during the current academic session. His/her date of birth as recorded in the school register is {date_of_birth}.\n\nThis certificate is issued on {issue_date} on request for official purposes.',
  },
  {
    id: 'character',
    label: 'Character',
    title: 'CHARACTER CERTIFICATE',
    hint: 'Certifies conduct and moral character',
    body:
      'This is to certify that {student_name}, son/daughter of {father_name}, was a student of this institution in {class} bearing Admission No. {admission_no}.\n\nTo the best of our knowledge he/she bore a good moral character throughout his/her stay at this institution, and nothing adverse was ever reported against him/her.\n\nWe wish him/her every success in future.',
  },
  {
    id: 'school_leaving',
    label: 'School Leaving',
    title: 'SCHOOL LEAVING CERTIFICATE',
    hint: 'Issued when a student leaves the school',
    body:
      'This is to certify that {student_name}, son/daughter of {father_name}, Admission No. {admission_no}, was admitted to this institution on {admission_date} and remained on the rolls until {leaving_date}, when he/she left after completing studies in {class}.\n\nHis/her date of birth as entered in the admission register is {date_of_birth}. All dues payable to the institution have been cleared.\n\nHe/she is hereby permitted to seek admission elsewhere.',
  },
  {
    id: 'result',
    label: 'Result',
    title: 'RESULT CERTIFICATE',
    hint: 'Summarises academic performance',
    body:
      'This is to certify that {student_name}, son/daughter of {father_name}, Roll No. {roll_number}, appeared in the examination held at this institution as a student of {class}.\n\nThe result as recorded in the school register is stated below and is issued on {issue_date} on request.',
  },
  {
    id: 'migration',
    label: 'Migration',
    title: 'MIGRATION CERTIFICATE',
    hint: 'Required to transfer to another institution',
    body:
      'This is to certify that {student_name}, son/daughter of {father_name}, Admission No. {admission_no}, has been permitted to migrate from this institution after completing {class}.\n\nThis institution has no objection to his/her admission to any other recognised school, college or board. No dues are outstanding against him/her.',
  },
]

export const CERTIFICATE_KIND_IDS = CERTIFICATE_KINDS.map((k) => k.id)

// Every token the body text understands, with the sample the settings preview
// substitutes. Kept together so the chip list, the preview and the real
// substitution can never drift apart.
export const CERTIFICATE_TOKENS = [
  { token: 'student_name', sample: 'Ahmed Ali Khan' },
  { token: 'father_name', sample: 'Muhammad Ali Khan' },
  { token: 'mother_name', sample: 'Fatima Bibi' },
  { token: 'class', sample: 'Class 8 - A' },
  { token: 'roll_number', sample: '24' },
  { token: 'admission_no', sample: 'STU-0014' },
  { token: 'admission_date', sample: '12 Apr 2022' },
  { token: 'date_of_birth', sample: '03 Mar 2012' },
  { token: 'leaving_date', sample: '30 Jun 2026' },
  { token: 'issue_date', sample: printDate(new Date().toISOString().slice(0, 10)) },
  { token: 'school_name', sample: 'Stars High School' },
  { token: 'serial_no', sample: 'CERT-0007' },
]

export const CERTIFICATE_TEMPLATES = [
  {
    id: 'classic',
    label: 'Classic',
    hint: 'Double rule border, centred crest, serif body',
  },
  {
    id: 'ornate',
    label: 'Ornate',
    hint: 'Corner flourishes and a guilloche frame — award-style',
  },
  {
    id: 'modern',
    label: 'Modern',
    hint: 'Accent side band, sans-serif, no frame',
  },
  {
    id: 'formal',
    label: 'Formal',
    hint: 'Letterhead and a reference line — reads as official correspondence',
  },
]

export const CERTIFICATE_TEMPLATE_IDS = CERTIFICATE_TEMPLATES.map((t) => t.id)

export const BORDER_STYLES = [
  { id: 'double', label: 'Double rule' },
  { id: 'solid', label: 'Single rule' },
  { id: 'dashed', label: 'Dashed' },
  { id: 'none', label: 'No border' },
]

export const FONT_FAMILIES = [
  { id: 'serif', label: 'Serif (Georgia)', css: 'Georgia, "Times New Roman", serif' },
  { id: 'sans', label: 'Sans (system)', css: 'system-ui, -apple-system, "Segoe UI", sans-serif' },
  { id: 'mono', label: 'Monospace', css: 'ui-monospace, "Courier New", monospace' },
]

export const FONT_CSS = Object.fromEntries(FONT_FAMILIES.map((f) => [f.id, f.css]))

/**
 * The body text for one kind, with the school's override winning.
 *
 * `bodies` is keyed by kind. A school that has written nothing gets the
 * wording above -- which is the real point of the per-kind default: a leaving
 * certificate that says "is enrolled in" is worse than useless.
 */
export function certificateBody(settings, kind) {
  const own = settings?.bodies?.[kind]
  if (own && String(own).trim()) return String(own)
  // body_text is the single pre-032 column. Honour it only while there are no
  // per-kind bodies at all, otherwise a school that wrote one kind would get
  // the old text on the other four.
  const legacy = settings?.body_text
  const hasAny = settings?.bodies && Object.keys(settings.bodies).length > 0
  if (!hasAny && legacy && String(legacy).trim()) return String(legacy)
  return CERTIFICATE_KINDS.find((k) => k.id === kind)?.body ?? ''
}

export function certificateTitle(settings, kind) {
  const own = settings?.titles?.[kind]
  if (own && String(own).trim()) return String(own)
  return CERTIFICATE_KINDS.find((k) => k.id === kind)?.title ?? 'CERTIFICATE'
}

/**
 * Token substitution for a certificate body.
 *
 * Runs on the client so the preview follows the issue-date picker without a
 * round trip, and on the server for the print route. Same function both
 * sides, so what was previewed is what prints.
 */
export function fillTokens(text, values) {
  let out = String(text ?? '')
  for (const [key, value] of Object.entries(values ?? {})) {
    out = out.replaceAll(`{${key}}`, value == null || value === '' ? '—' : String(value))
  }
  // Anything the caller did not supply would otherwise print as a literal
  // "{mother_name}" on a certificate going to a board office.
  return out.replace(/\{[a-z_]+\}/g, '—')
}

/* =========================================================== id cards ==== */

export const CARD_TEMPLATES = [
  { id: 'classic', label: 'Classic', hint: 'Gradient header, photo over the band' },
  { id: 'modern', label: 'Modern', hint: 'Photo left, details right, accent spine' },
  { id: 'band', label: 'Band', hint: 'Thin accent strip, white body, large photo' },
  { id: 'minimal', label: 'Minimal', hint: 'No colour fill — cheapest to print' },
]

export const CARD_TEMPLATE_IDS = CARD_TEMPLATES.map((t) => t.id)

// A real card is CR80: 85.6 × 54 mm, the size of a bank card, because that is
// what fits a lanyard holder and a card printer. The pixel defaults in
// id_card_settings predate that and are kept as an override for schools that
// print onto A4 and cut by hand.
export const CR80 = { width: 54, height: 85.6 } // mm, portrait

/* ============================================================= vouchers == */

export const VOUCHER_KINDS = [
  { id: 'payment', label: 'Payment Voucher', hint: 'Money paid out' },
  { id: 'receipt', label: 'Receipt Voucher', hint: 'Money taken in' },
]
