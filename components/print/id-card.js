// Plain module on purpose -- no 'use client'.
//
// A STUDENT ID CARD
//
// Sized in millimetres, not pixels. CR80 -- 85.6 × 54 mm, the size of a bank
// card -- is what fits a lanyard holder and what a card printer expects, and
// a card laid out in rem comes out of one at whatever size the browser felt
// like. The pixel width in id_card_settings predates this and is honoured
// only when a school has deliberately changed it, for printing onto A4 and
// cutting by hand.
//
// FRONT AND BACK
//
// The front identifies the holder: photo, name, class, admission number,
// barcode. The back is for somebody who FOUND the card -- blood group, a
// guardian's number, the school's address -- plus the line that makes it the
// school's property rather than the student's. They are two separate cards in
// the grid so a duplex printer gets two faces and a simplex printer gets two
// passes.
//
// Every colour, size and toggle comes from `settings`, so the live preview in
// the settings panel and the real card on the sheet are literally the same
// component.

import Barcode from '@/components/barcode'
import { CR80, printDate } from '@/lib/documents'

const TEMPLATES = ['classic', 'modern', 'band', 'minimal']

function initials(name) {
  return (name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()
}

function dims(s) {
  const horizontal = s.orientation === 'horizontal'
  // A school that has saved a custom pixel size meant it. Anything still on
  // the old defaults (208 × 340) gets real card millimetres instead.
  const custom =
    (s.card_width && s.card_width !== 208) || (s.card_height && s.card_height !== 340)

  if (custom) {
    return {
      width: `${horizontal ? s.card_height : s.card_width}px`,
      height: 'auto',
      horizontal,
    }
  }
  return {
    width: horizontal ? `${CR80.height}mm` : `${CR80.width}mm`,
    height: horizontal ? `${CR80.width}mm` : `${CR80.height}mm`,
    horizontal,
  }
}

function Shell({ s, children, style }) {
  const d = dims(s)
  return (
    <div
      className="doc-card"
      style={{
        '--doc-accent': s.accent_color || s.header_to || '#7c3aed',
        width: d.width,
        height: d.height,
        border: `0.3mm ${s.border_style ?? 'solid'} ${s.border_color ?? '#e2e8f0'}`,
        color: s.text_color ?? '#1e293b',
        display: 'flex',
        flexDirection: 'column',
        ...style,
      }}
    >
      {s.backgroundUrl && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={s.backgroundUrl} alt="" aria-hidden="true" className="doc-card-bg" />
      )}
      {children}
    </div>
  )
}

function Photo({ student, s, round = false }) {
  if (s.fields?.photo === false) return null
  const cls = `doc-card-photo${round ? ' doc-card-photo-round' : ''}`
  if (student.photoUrl) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img src={student.photoUrl} alt="" className={cls} />
    )
  }
  return (
    <span className={`${cls} doc-card-photo-blank`} aria-hidden="true">
      {initials(student.name)}
    </span>
  )
}

function Rows({ student, s }) {
  const f = s.fields ?? {}
  const rows = [
    f.roll_number !== false && ['Roll no', student.rollNumber],
    f.class !== false && ['Class', student.className],
    f.section !== false && ['Section', student.sectionName],
    f.admission_number !== false && ['Adm no', student.admissionNumber],
    f.date_of_birth === true && ['DOB', printDate(student.dateOfBirth)],
    f.gender !== false && ['Gender', student.gender],
    f.status === true && ['Status', student.status],
    f.address === true && ['Address', student.address],
  ].filter(Boolean)

  if (!rows.length) return null
  return (
    <dl className="doc-card-rows">
      {rows.map(([label, value]) => (
        <div key={label} className="doc-card-row">
          <dt>{label}</dt>
          <dd>{value || '—'}</dd>
        </div>
      ))}
    </dl>
  )
}

function SchoolLine({ s, kicker = 'Student Identity Card' }) {
  return (
    <>
      {s.logoUrl ? (
        /* Not next/image: the host is the Supabase project URL, which would
           need remotePatterns, and these are print millimetres the image
           optimiser has no useful opinion about. */
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={s.logoUrl} alt="" className="doc-card-logo" />
      ) : null}
      <span style={{ minWidth: 0 }}>
        <span className="doc-card-school">{s.school_name || 'School name'}</span>
        <span className="doc-card-kicker">{kicker}</span>
      </span>
    </>
  )
}

function Signature({ s }) {
  if (s.show_signature === false) return null
  if (!s.principalSignatureUrl && !s.principal_label) return null
  return (
    <span className="doc-card-sign">
      {s.principalSignatureUrl && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={s.principalSignatureUrl} alt="" />
      )}
      <span>{s.principal_label ?? 'Principal'}</span>
    </span>
  )
}

/* ------------------------------------------------------------------- front */

export function IdCardFront({ student, settings, sample = false }) {
  const s = settings ?? {}
  const template = TEMPLATES.includes(s.template) ? s.template : 'classic'
  const code = student.admissionNumber || student.id?.slice(0, 8)

  const barcode =
    (s.show_barcode ?? true) && code ? (
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <Barcode value={code} height={18} />
      </div>
    ) : null

  const footer = (
    <div className="doc-card-foot">
      {code ? <span className="doc-card-chip">{code}</span> : <span />}
      <Signature s={s} />
    </div>
  )

  if (template === 'modern') {
    return (
      <Shell s={s}>
        <div
          className="doc-card-head"
          style={{ background: 'var(--doc-accent)', padding: '1.5mm 2.5mm' }}
        >
          <SchoolLine s={s} />
        </div>
        <div style={{ display: 'flex', gap: '2mm', padding: '2mm 2.5mm', flex: 1, minHeight: 0 }}>
          <div style={{ flexShrink: 0, textAlign: 'center' }}>
            <Photo student={student} s={s} />
            {s.show_stamp && s.stampUrl && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={s.stampUrl} alt="" className="doc-card-stamp" />
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
            {s.fields?.student_name !== false && (
              <p className="doc-card-name">{student.name}</p>
            )}
            {s.fields?.father_name !== false && student.fatherName && (
              <p className="doc-card-sub">S/D of {student.fatherName}</p>
            )}
            <div style={{ marginTop: '1mm' }}>
              <Rows student={student} s={s} />
            </div>
          </div>
        </div>
        {barcode}
        {footer}
        {sample && <SampleTag />}
      </Shell>
    )
  }

  if (template === 'band') {
    return (
      <Shell s={s}>
        <span style={{ height: '2.2mm', background: 'var(--doc-accent)', flexShrink: 0 }} />
        <div
          className="doc-card-head"
          style={{ color: 'inherit', padding: '1.5mm 2.5mm 0', justifyContent: 'center' }}
        >
          <SchoolLine s={s} />
        </div>
        <div style={{ textAlign: 'center', padding: '1mm 2.5mm', flex: 1, minHeight: 0 }}>
          <Photo student={student} s={s} />
          {s.fields?.student_name !== false && (
            <p className="doc-card-name" style={{ marginTop: '1mm' }}>
              {student.name}
            </p>
          )}
          {s.fields?.father_name !== false && student.fatherName && (
            <p className="doc-card-sub">{student.fatherName}</p>
          )}
          <div style={{ marginTop: '1mm', textAlign: 'left' }}>
            <Rows student={student} s={s} />
          </div>
        </div>
        {barcode}
        {footer}
        {sample && <SampleTag />}
      </Shell>
    )
  }

  if (template === 'minimal') {
    // No colour fill anywhere: the cheapest card to print, and the one that
    // survives a monochrome laser printer intact.
    return (
      <Shell s={s} style={{ border: '0.3mm solid #334155' }}>
        <div
          className="doc-card-head"
          style={{ color: 'inherit', borderBottom: '0.3mm solid #334155' }}
        >
          <SchoolLine s={s} />
        </div>
        <div style={{ display: 'flex', gap: '2mm', padding: '2mm 2.5mm', flex: 1, minHeight: 0 }}>
          <Photo student={student} s={s} />
          <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
            {s.fields?.student_name !== false && (
              <p className="doc-card-name">{student.name}</p>
            )}
            {s.fields?.father_name !== false && student.fatherName && (
              <p className="doc-card-sub">{student.fatherName}</p>
            )}
            <div style={{ marginTop: '1mm' }}>
              <Rows student={student} s={s} />
            </div>
          </div>
        </div>
        {footer}
        {sample && <SampleTag />}
      </Shell>
    )
  }

  // classic
  return (
    <Shell s={s}>
      <div
        className="doc-card-head"
        style={{
          background: `linear-gradient(135deg, ${s.header_from ?? '#3b0764'}, ${
            s.header_to ?? s.accent_color ?? '#7c3aed'
          })`,
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1mm',
          paddingBottom: '1mm',
        }}
      >
        <span
          style={{ display: 'flex', alignItems: 'center', gap: '1.5mm', alignSelf: 'stretch' }}
        >
          <SchoolLine s={s} />
        </span>
        <Photo student={student} s={s} round />
        <span style={{ textAlign: 'center' }}>
          {s.fields?.student_name !== false && (
            <p className="doc-card-name" style={{ color: '#fff' }}>
              {student.name}
            </p>
          )}
          {s.fields?.father_name !== false && student.fatherName && (
            <p className="doc-card-sub" style={{ color: 'rgb(255 255 255 / 0.75)' }}>
              {student.fatherName}
            </p>
          )}
        </span>
      </div>

      <div style={{ padding: '1.5mm 2.5mm', flex: 1, minHeight: 0, textAlign: 'left' }}>
        <Rows student={student} s={s} />
      </div>

      {barcode}
      {footer}
      {s.show_stamp && s.stampUrl && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={s.stampUrl} alt="" className="doc-card-stamp" />
      )}
      {sample && <SampleTag />}
    </Shell>
  )
}

/* -------------------------------------------------------------------- back */

export function IdCardBack({ student, settings, sample = false }) {
  const s = settings ?? {}
  const b = s.back_fields ?? {}

  const rows = [
    b.date_of_birth !== false && ['Date of birth', printDate(student.dateOfBirth)],
    b.blood_group !== false && ['Blood group', student.bloodGroup],
    b.guardian_phone !== false && ['Guardian', student.guardianPhone],
    b.emergency_phone !== false && ['Emergency', student.emergencyPhone],
    b.session !== false && ['Session', student.session],
    b.address !== false && ['Address', student.address],
  ].filter(Boolean)

  return (
    <Shell s={s}>
      <span style={{ height: '2.2mm', background: 'var(--doc-accent)', flexShrink: 0 }} />

      <div style={{ padding: '2mm 2.5mm', flex: 1, minHeight: 0, textAlign: 'left' }}>
        <p
          style={{
            fontSize: '5.5pt',
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--doc-accent)',
            marginBottom: '1mm',
          }}
        >
          If found, please contact
        </p>
        <dl className="doc-card-rows">
          {rows.map(([label, value]) => (
            <div key={label} className="doc-card-row">
              <dt>{label}</dt>
              <dd>{value || '—'}</dd>
            </div>
          ))}
        </dl>

        {s.valid_until && (
          <p className="doc-card-sub" style={{ marginTop: '1mm' }}>
            Valid until <strong>{printDate(s.valid_until)}</strong>
          </p>
        )}
      </div>

      {s.back_note && <p className="doc-card-terms">{s.back_note}</p>}

      <div className="doc-card-strip">
        {[s.school_address, s.school_phone, s.school_email].filter(Boolean).join('  ·  ') ||
          s.school_name}
      </div>

      {sample && <SampleTag />}
    </Shell>
  )
}

function SampleTag() {
  return (
    <p
      style={{
        position: 'absolute',
        bottom: '0.5mm',
        width: '100%',
        textAlign: 'center',
        fontSize: '4.5pt',
        color: '#94a3b8',
      }}
    >
      sample data
    </p>
  )
}

/** Front then back, as a pair. */
export default function IdCard({ student, settings, sample = false }) {
  const s = settings ?? {}
  return (
    <>
      <IdCardFront student={student} settings={s} sample={sample} />
      {s.show_back !== false && <IdCardBack student={student} settings={s} sample={sample} />}
    </>
  )
}
