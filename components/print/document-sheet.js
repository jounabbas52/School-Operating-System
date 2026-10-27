// Plain module on purpose -- no 'use client'.
//
// Every printed sheet in the app is built from these. They take the object
// lib/documents.js returns and nothing else, so the masthead on a fee challan
// is the same code as the masthead on a salary slip, and a school that
// uploads a logo gets it on both without either screen being touched.
//
// WHY NOTHING HERE USES THE THEME
//
// The rest of the app styles itself from CSS variables -- var(--ink),
// var(--card) -- which follow the viewer's light or dark preference. A sheet
// going to a printer must not. These components hardcode ink on white, in
// millimetres, because the output is paper: a dark-mode challan prints as a
// black rectangle, and a card sized in rem comes out of a card printer at the
// wrong size. The one colour that varies is the school's accent, passed in.
//
// The sizes are mm throughout for the same reason. 210mm is A4 whatever the
// browser's font settings are; 13rem is not.

import { Fragment } from 'react'

/* ------------------------------------------------------------------ paper */

// There is deliberately no generic <Sheet> wrapper here, and one was tried.
//
// Each document's paper box is its own: a challan turns the page sideways and
// splits it into three equal tracks, a payslip packs two blocks down a
// portrait page, a certificate has to be a flex column so its signatures land
// on the bottom edge. A single component covering all of that needed a prop
// per document and still could not express the challan's copy-count-driven
// orientation. Five explicit outer divs of four style properties each is less
// code than the wrapper that replaced them, and each one reads where it is
// used.
//
// What they DO share -- the .doc token scope, the millimetre sizes, the
// accent variable -- is in documents.css, which is where sharing belongs.

/**
 * The crest printed faint behind the body.
 *
 * 6% opacity, and `object-contain` so a wide logo is never cropped into an
 * unrecognisable smear. Absolute, with the sheet's own content stacked above
 * it -- a watermark that captures clicks would make a preview unselectable.
 */
export function Watermark({ url, opacity = 0.06 }) {
  if (!url) return null
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={url}
      alt=""
      aria-hidden="true"
      className="doc-watermark"
      style={{ opacity }}
    />
  )
}

/* ----------------------------------------------------------------- header */

function ContactLine({ doc }) {
  const bits = [
    [doc.address, doc.city].filter(Boolean).join(', '),
    [doc.phone, doc.phoneAlt].filter(Boolean).join(' · '),
    doc.email,
    doc.website,
  ].filter(Boolean)

  if (!bits.length) return null
  return <p className="doc-contact">{bits.join('  ·  ')}</p>
}

function Crest({ url, name, size = '18mm' }) {
  if (url) {
    return (
      /* Not next/image: the host is the Supabase project URL, which would
         need remotePatterns, and the sizes here are print millimetres that
         the image optimiser has no useful opinion about. */
      /* eslint-disable-next-line @next/next/no-img-element */
      <img src={url} alt="" className="doc-crest" style={{ width: size, height: size }} />
    )
  }
  // A school with no logo still needs the left column filled, or the centred
  // name sits off-centre.
  return (
    <span className="doc-crest doc-crest-blank" style={{ width: size, height: size }} aria-hidden="true">
      {(name || 'S').trim()[0].toUpperCase()}
    </span>
  )
}

/**
 * The masthead, in whichever of the three styles the school chose.
 *
 * `title` is the document's own name -- FEE CHALLAN, SALARY SLIP, PAYMENT
 * VOUCHER -- and prints in a bar under the school block. `meta` is the line
 * that belongs to this particular document: a challan number, a period, a
 * reference.
 */
export function DocHeader({ doc, title, subtitle, meta = [], compact = false }) {
  const style = doc?.headerStyle ?? 'classic'
  const name = doc?.name ?? 'School'

  if (style === 'banner') {
    return (
      <header className="doc-head">
        <div className="doc-banner">
          <Crest url={doc?.logoUrl} name={name} size={compact ? '12mm' : '16mm'} />
          <div className="doc-banner-text">
            <p className="doc-name doc-name-reverse">{name}</p>
            {doc?.tagline && <p className="doc-tagline doc-tagline-reverse">{doc.tagline}</p>}
            <ContactLine doc={{ ...doc, email: compact ? null : doc?.email }} />
          </div>
          {title && <span className="doc-title-chip">{title}</span>}
        </div>
        {(subtitle || meta.length > 0) && <MetaRow subtitle={subtitle} meta={meta} />}
      </header>
    )
  }

  if (style === 'minimal') {
    return (
      <header className="doc-head">
        <div className="doc-minimal">
          <p className="doc-name doc-name-sm">{name}</p>
          {title && <p className="doc-title doc-title-sm">{title}</p>}
        </div>
        <ContactLine doc={doc} />
        <div className="doc-rule-thin" />
        {(subtitle || meta.length > 0) && <MetaRow subtitle={subtitle} meta={meta} />}
      </header>
    )
  }

  // classic
  return (
    <header className="doc-head">
      <div className="doc-classic">
        <Crest url={doc?.logoUrl} name={name} size={compact ? '13mm' : '19mm'} />
        <div className="doc-classic-text">
          <p className={compact ? 'doc-name doc-name-sm' : 'doc-name'}>{name}</p>
          {doc?.tagline && <p className="doc-tagline">{doc.tagline}</p>}
          <ContactLine doc={doc} />
          {doc?.registration && <p className="doc-reg">{doc.registration}</p>}
        </div>
        {/* Balances the crest so the name block stays optically centred. An
            empty span, not a second logo: most schools have one crest. */}
        <span className="doc-crest-spacer" style={{ width: compact ? '13mm' : '19mm' }} aria-hidden="true" />
      </div>

      <div className="doc-rule" />

      {title && (
        <div className="doc-title-bar">
          <span className="doc-title">{title}</span>
        </div>
      )}
      {(subtitle || meta.length > 0) && <MetaRow subtitle={subtitle} meta={meta} />}
    </header>
  )
}

function MetaRow({ subtitle, meta }) {
  const pairs = meta.filter(Boolean)
  return (
    <div className="doc-meta-row">
      {subtitle && <span className="doc-subtitle">{subtitle}</span>}
      {pairs.length > 0 && (
        <span className="doc-meta">
          {pairs.map(([label, value], i) => (
            <span key={`${label}-${i}`} className="doc-meta-item">
              <span className="doc-meta-label">{label}</span>
              <strong className="doc-meta-value">{value ?? '—'}</strong>
            </span>
          ))}
        </span>
      )}
    </div>
  )
}

/* ------------------------------------------------------------ field grids */

/**
 * The block of printed particulars -- Student, Father, Class, Admission No.
 *
 * Rendered as a bordered table rather than a flex grid because that is what
 * survives a print: a parent fills the blank ones in by hand, and a ruled box
 * tells them where. `cols` is how many label/value pairs sit across.
 */
export function FieldTable({ rows = [], cols = 2, dense = false }) {
  const present = rows.filter(Boolean)
  if (!present.length) return null

  return (
    <table className={`doc-fields ${dense ? 'doc-fields-dense' : ''}`}>
      <tbody>
        {chunk(present, cols).map((group, i) => (
          <tr key={i}>
            {group.map(([label, value], j) => (
              // A label/value PAIR is the list item, and a pair is two cells
              // -- so the key belongs on a Fragment, not on either cell.
              <Fragment key={`${label}-${j}`}>
                <th scope="row">{label}</th>
                <td>{value == null || value === '' ? '—' : value}</td>
              </Fragment>
            ))}
            {/* A short last row would otherwise leave the table edge ragged. */}
            {group.length < cols &&
              Array.from({ length: cols - group.length }, (_, k) => (
                <Fragment key={`pad-${k}`}>
                  <th aria-hidden="true" />
                  <td aria-hidden="true" />
                </Fragment>
              ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function chunk(list, size) {
  const out = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

/**
 * The money table: particulars down the left, amounts right-aligned.
 *
 * `lines` is [{ label, amount, note? }]; `totals` is the same, printed bold
 * under a rule. Amounts arrive already formatted -- this component does no
 * arithmetic, deliberately, because the figure on a reprinted challan has to
 * be the figure that was billed, not a recomputation of today's fee.
 */
export function AmountTable({ lines = [], totals = [], head = ['Particulars', 'Amount'], filler = 0 }) {
  return (
    <table className="doc-amounts">
      <thead>
        <tr>
          <th>{head[0]}</th>
          <th className="doc-num">{head[1]}</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((line, i) => (
          <tr key={`${line.label}-${i}`}>
            <td>
              {line.label}
              {line.note && <span className="doc-line-note">{line.note}</span>}
            </td>
            <td className="doc-num">{line.amount}</td>
          </tr>
        ))}
        {/* Blank ruled rows, so a clerk can add a line by hand and the box
            still looks like the form it is. */}
        {Array.from({ length: filler }, (_, i) => (
          <tr key={`blank-${i}`} className="doc-blank-row">
            <td>&nbsp;</td>
            <td />
          </tr>
        ))}
      </tbody>
      {totals.length > 0 && (
        <tfoot>
          {totals.map((row, i) => (
            <tr key={`${row.label}-${i}`} className={row.strong ? 'doc-total-strong' : undefined}>
              <th scope="row">{row.label}</th>
              <td className="doc-num">{row.amount}</td>
            </tr>
          ))}
        </tfoot>
      )}
    </table>
  )
}

/* -------------------------------------------------------------- signatures */

/**
 * A stamp impression.
 *
 * Rotated a few degrees and set at 85% opacity on purpose: a rubber stamp
 * applied by hand is never square to the page, and a crisp upright PNG at
 * full opacity reads as a pasted graphic rather than an impression.
 */
export function Stamp({ url, size = '22mm', rotate = -8, opacity = 0.85, className = '' }) {
  if (!url) return null
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={url}
      alt=""
      aria-hidden="true"
      className={`doc-stamp ${className}`}
      style={{ width: size, height: size, transform: `rotate(${rotate}deg)`, opacity }}
    />
  )
}

/**
 * One signature: the image if there is one, then the rule, then the name and
 * the role beneath it.
 *
 * The rule prints whether or not an image was uploaded -- a school that signs
 * by hand needs the line, and a school with a scanned signature needs it
 * under the image anyway.
 */
export function SignatureLine({ name, label, signatureUrl, stampUrl, width = '46mm', align = 'center' }) {
  return (
    <div className="doc-sign" style={{ width, textAlign: align }}>
      <span className="doc-sign-art">
        {stampUrl && <Stamp url={stampUrl} size="20mm" className="doc-sign-stamp" />}
        {signatureUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={signatureUrl} alt="" className="doc-sign-img" />
        )}
      </span>
      <span className="doc-sign-rule" />
      {name && <span className="doc-sign-name">{name}</span>}
      <span className="doc-sign-label">{label}</span>
    </div>
  )
}

/**
 * The row of signatures along the bottom of a sheet.
 *
 * `signatures` is [{ name, label, signatureUrl, stampUrl }]. The school seal
 * sits in the middle, between them, which is where it goes on paper.
 */
export function SignatureRow({ signatures = [], sealUrl, sealSize = '24mm' }) {
  const present = signatures.filter(Boolean)
  if (!present.length && !sealUrl) return null

  return (
    <div className="doc-sign-row">
      {present.map((s, i) => (
        <SignatureLine key={`${s.label}-${i}`} {...s} />
      ))}
      {sealUrl && (
        <span className="doc-seal-slot" aria-hidden="true">
          <Stamp url={sealUrl} size={sealSize} rotate={-5} opacity={0.9} />
        </span>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ footer */

/**
 * The small print along the bottom edge.
 *
 * The print time is on by default and matters more than it looks: a parent
 * holding two copies of the same challan needs to know which one is current,
 * and an office reprinting a slip needs to know this is not the original.
 */
export function DocFooter({ doc, left, right, printedAt }) {
  const note = doc?.footerNote
  const showTime = doc?.showPrintTime ?? true
  if (!note && !left && !right && !showTime) return null

  return (
    <footer className="doc-foot">
      <span className="doc-foot-left">{left ?? note}</span>
      <span className="doc-foot-right">
        {right}
        {showTime && printedAt && <span className="doc-foot-time">Printed {printedAt}</span>}
      </span>
    </footer>
  )
}

/**
 * A ruled "for office use" strip -- the part of a form nobody fills in on a
 * screen. Printed on a challan and a voucher because the counter writes in
 * it: the cashier's initials, the scroll number, the date stamped by the bank.
 */
export function OfficeUseBox({ label = 'For office use only', rows = ['Received by', 'Date', 'Scroll / Ref no'] }) {
  return (
    <div className="doc-office">
      <p className="doc-office-label">{label}</p>
      <div className="doc-office-rows">
        {rows.map((r) => (
          <span key={r} className="doc-office-row">
            <span className="doc-office-key">{r}</span>
            <span className="doc-office-fill" />
          </span>
        ))}
      </div>
    </div>
  )
}

/** Forces whatever follows onto a new sheet. */
export function PageBreak() {
  return <div className="doc-break" aria-hidden="true" />
}
