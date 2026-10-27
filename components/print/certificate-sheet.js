// Plain module on purpose -- no 'use client'.
//
// A CERTIFICATE
//
// Four layouts, because a certificate is handed to somebody and the school
// decides how it should look -- and because the five KINDS are not all the
// same document. A character certificate is an award and wants a frame; a
// school leaving certificate is a record that a board office will file, and
// wants a reference number and a letterhead. Printing both from one layout
// was the old behaviour and it made the leaving certificate look like a prize.
//
//   classic   double rule frame, centred crest, serif body. The default, and
//             what most schools mean by "a certificate".
//   ornate    corner flourishes and a heavier frame. Award-style.
//   modern    an accent spine instead of a frame, sans-serif, left aligned.
//   formal    the school's letterhead with a Ref. No. and a date line, body
//             set as correspondence. For anything an office will file.
//
// All four take the same data and the same settings. The template changes the
// furniture, never the facts: the student's particulars, the body text, the
// serial number, the signatures and the seal are present in every one.

import { FONT_CSS, printDate } from '@/lib/documents'
import { DocHeader, FieldTable, SignatureLine, Stamp, Watermark } from './document-sheet'

const PAPER = {
  a4: { w: '210mm', h: '297mm' },
  letter: { w: '216mm', h: '279mm' },
  legal: { w: '216mm', h: '356mm' },
}

export default function CertificateSheet({ cert, settings, doc, printedAt }) {
  const s = settings ?? {}
  const template = s.template && TEMPLATES[s.template] ? s.template : 'classic'
  const landscape = s.orientation === 'landscape'
  const size = PAPER[s.paper_size] ?? PAPER.a4
  const accent = s.accent_color || doc?.accent || '#1e3a8a'
  const Body = TEMPLATES[template]

  return (
    <div
      // doc-sheet-flex is what lets the signature row sit on the bottom edge
      // of the paper instead of directly under a short body: the sheet
      // becomes a column, the certificate inside it grows to fill, and
      // margin-top:auto on the signatures pushes them down.
      className="doc doc-sheet doc-sheet-flex"
      style={{
        '--doc-accent': accent,
        width: landscape ? size.h : size.w,
        minHeight: landscape ? size.w : size.h,
        padding: template === 'formal' ? '14mm' : '8mm',
        fontFamily: FONT_CSS[s.font_family] ?? FONT_CSS.serif,
      }}
    >
      <Watermark url={doc?.watermarkUrl ?? cert.backgroundUrl} opacity={0.07} />
      <Body cert={cert} s={s} doc={doc} accent={accent} printedAt={printedAt} />
    </div>
  )
}

/* ------------------------------------------------------------ shared parts */

function Masthead({ cert, s, doc, compactCrest = '18mm' }) {
  const name = s.school_name || doc?.name || 'School'
  const logo = cert.logoUrl ?? doc?.logoUrl
  const lines = [
    [s.school_address || doc?.address, doc?.city].filter(Boolean).join(', '),
    [s.contact_number || doc?.phone, s.email || doc?.email].filter(Boolean).join('  ·  '),
  ].filter(Boolean)

  return (
    <div style={{ textAlign: 'center' }}>
      {logo ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={logo}
          alt=""
          style={{ height: compactCrest, objectFit: 'contain', margin: '0 auto 2mm' }}
        />
      ) : null}
      <p className="doc-name">{name}</p>
      {doc?.tagline && <p className="doc-tagline">{doc.tagline}</p>}
      {lines.map((l) => (
        <p key={l} className="doc-contact">
          {l}
        </p>
      ))}
      {doc?.registration && <p className="doc-reg">{doc.registration}</p>}
    </div>
  )
}

function TitleBlock({ cert, centred = true }) {
  return (
    <div style={{ textAlign: centred ? 'center' : 'left' }}>
      <p className="doc-cert-kicker">Certificate</p>
      <p className="doc-cert-title">{cert.title}</p>
      <div className="doc-cert-flourish">
        <span />
        <b />
        <span />
      </div>
    </div>
  )
}

function Serial({ cert, s }) {
  if (s.show_serial === false) return null
  return (
    <div className="doc-cert-serial">
      <span>
        Serial No: <strong>{cert.serial ?? '—'}</strong>
      </span>
      <span>
        Date of issue: <strong>{printDate(cert.issueDate)}</strong>
      </span>
    </div>
  )
}

function Particulars({ cert, s }) {
  const f = s.fields ?? {}
  const rows = [
    f.student_name !== false && ['Student name', cert.student.name],
    f.father_name !== false && ["Father's name", cert.student.fatherName],
    f.class !== false && ['Class', cert.student.className],
    f.roll_number !== false && ['Roll number', cert.student.rollNumber],
    ['Admission number', cert.student.admissionNumber],
    f.admission_date !== false && ['Date of admission', printDate(cert.student.admissionDate)],
    f.issue_date !== false && ['Date of issue', printDate(cert.issueDate)],
  ].filter(Boolean)

  if (!rows.length) return null
  return (
    <div style={{ marginTop: '4mm' }}>
      <FieldTable rows={rows} cols={2} dense />
    </div>
  )
}

function Photo({ cert, s }) {
  if (!s.show_photo || !cert.student.photoUrl) return null
  return (
    <span className="doc-cert-photo-slot">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={cert.student.photoUrl} alt="" className="doc-cert-photo" />
    </span>
  )
}

function Signatures({ s, doc }) {
  // The certificate's own signature beats the shared one -- a school that
  // uploaded a head's signature for certificates specifically meant it for
  // these. The document settings fill in whatever it did not.
  const principalSig = s.principalSignatureUrl ?? doc?.principal?.signatureUrl
  const signatorySig = s.signatorySignatureUrl ?? doc?.accountant?.signatureUrl
  const seal = s.show_seal === false ? null : (s.sealUrl ?? doc?.schoolStampUrl)

  return (
    <SignatureRowWithSeal
      seal={seal}
      signatures={[
        {
          name: s.signatory_name,
          label: s.signatory_label ?? 'Authorized Signatory',
          signatureUrl: signatorySig,
        },
        {
          name: s.principal_name || doc?.principal?.name,
          label: s.principal_label ?? doc?.principal?.label ?? 'Principal',
          signatureUrl: principalSig,
          stampUrl: s.stampUrl ?? doc?.principalStampUrl,
        },
      ].filter((x) => x.name || x.signatureUrl || x.label)}
    />
  )
}

// SignatureRow puts the seal between the signatures; a certificate wants it
// centred under the body with the signatures to either side, which is the
// same arrangement with wider gaps.
function SignatureRowWithSeal({ signatures, seal }) {
  return (
    <div className="doc-sign-row" style={{ marginTop: 'auto', paddingTop: '10mm' }}>
      {signatures.map((sig, i) => (
        <SignatureLine key={`${sig.label}-${i}`} width="52mm" {...sig} />
      ))}
      {seal && (
        <span className="doc-seal-slot" aria-hidden="true">
          <Stamp url={seal} size="26mm" rotate={-6} opacity={0.9} />
        </span>
      )}
    </div>
  )
}

function Footer({ s, doc, printedAt }) {
  const note = s.footer_note ?? doc?.footerNote
  if (!note && !printedAt) return null
  return (
    <footer className="doc-foot">
      <span className="doc-foot-left">{note}</span>
      <span className="doc-foot-right">
        {doc?.showPrintTime && printedAt && (
          <span className="doc-foot-time">Printed {printedAt}</span>
        )}
      </span>
    </footer>
  )
}

/* ------------------------------------------------------------- the layouts */

function Classic({ cert, s, doc, printedAt }) {
  const border = s.border_style ?? 'double'
  return (
    <div className="doc-cert">
      <div className={`doc-cert-frame doc-cert-frame-${border}`} style={{ position: 'relative' }}>
        <Photo cert={cert} s={s} />
        <Masthead cert={cert} s={s} doc={doc} />
        <div className="doc-rule" />
        <div style={{ marginTop: '5mm' }}>
          <TitleBlock cert={cert} />
        </div>
        <p className="doc-cert-body doc-cert-serif">{cert.body}</p>
        <Particulars cert={cert} s={s} />
        <Serial cert={cert} s={s} />
        <Signatures s={s} doc={doc} />
        <Footer s={s} doc={doc} printedAt={printedAt} />
      </div>
    </div>
  )
}

function Ornate({ cert, s, doc, printedAt }) {
  return (
    <div className="doc-cert">
      <div
        className="doc-cert-frame doc-cert-frame-solid doc-cert-ornate"
        style={{ position: 'relative' }}
      >
        {/* Two of the four corner brackets come from ::before and ::after on
            the frame; these are the other two. Four pseudo-elements would
            need a nested wrapper for no gain. */}
        <span className="doc-cert-corner doc-cert-corner-tr" aria-hidden="true" />
        <span className="doc-cert-corner doc-cert-corner-bl" aria-hidden="true" />

        <Photo cert={cert} s={s} />
        <Masthead cert={cert} s={s} doc={doc} compactCrest="22mm" />
        <div style={{ marginTop: '6mm' }}>
          <TitleBlock cert={cert} />
        </div>
        <p
          className="doc-cert-body doc-cert-serif doc-cert-body-centred"
          style={{ fontSize: '11.5pt' }}
        >
          {cert.body}
        </p>
        <Particulars cert={cert} s={s} />
        <Serial cert={cert} s={s} />
        <Signatures s={s} doc={doc} />
        <Footer s={s} doc={doc} printedAt={printedAt} />
      </div>
    </div>
  )
}

function Modern({ cert, s, doc, printedAt }) {
  return (
    <div className="doc-cert" style={{ position: 'relative' }}>
      <span className="doc-cert-spine" aria-hidden="true" />
      <div
        className="doc-cert-frame doc-cert-frame-none doc-cert-modern"
        style={{ position: 'relative' }}
      >
        <Photo cert={cert} s={s} />
        <div style={{ textAlign: 'left' }}>
          <Masthead cert={cert} s={s} doc={doc} compactCrest="15mm" />
        </div>
        <div style={{ marginTop: '6mm' }}>
          <TitleBlock cert={cert} centred={false} />
        </div>
        <p
          className="doc-cert-body"
          style={{ fontFamily: FONT_CSS.sans, fontSize: '10.5pt', lineHeight: 1.9 }}
        >
          {cert.body}
        </p>
        <Particulars cert={cert} s={s} />
        <Serial cert={cert} s={s} />
        <Signatures s={s} doc={doc} />
        <Footer s={s} doc={doc} printedAt={printedAt} />
      </div>
    </div>
  )
}

function Formal({ cert, s, doc, printedAt }) {
  // The real letterhead, not a frame -- and the title as a plain underlined
  // heading, because this is a letter from the school rather than an award.
  const effective = {
    ...doc,
    name: s.school_name || doc?.name,
    address: s.school_address || doc?.address,
    phone: s.contact_number || doc?.phone,
    email: s.email || doc?.email,
    logoUrl: cert.logoUrl ?? doc?.logoUrl,
    headerStyle: 'classic',
  }

  return (
    <div className="doc-cert" style={{ position: 'relative' }}>
      <Photo cert={cert} s={s} />
      <DocHeader
        doc={effective}
        meta={[
          ['Ref. No', cert.serial ?? '—'],
          ['Dated', printDate(cert.issueDate)],
        ]}
      />

      <p
        style={{
          marginTop: '8mm',
          textAlign: 'center',
          fontSize: '13pt',
          fontWeight: 700,
          letterSpacing: '0.06em',
          textDecoration: 'underline',
          textUnderlineOffset: '2mm',
        }}
      >
        {cert.title}
      </p>

      <p className="doc-cert-body doc-cert-serif" style={{ marginTop: '8mm', lineHeight: 2.1 }}>
        {cert.body}
      </p>

      <Particulars cert={cert} s={s} />
      <Signatures s={s} doc={doc} />
      <Footer s={s} doc={doc} printedAt={printedAt} />
    </div>
  )
}

const TEMPLATES = { classic: Classic, ornate: Ornate, modern: Modern, formal: Formal }
