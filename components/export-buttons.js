'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ASSETS } from '@/lib/storage'

// Download PDF + Export CSV, on every list screen.
//
// Takes the rows the page is already showing, so exports respect whatever
// filtering and sorting the user is looking at rather than dumping the table.
//
// `columns` is [{ key, label, format? }]. format(value, row) returns a string.
//
// This is a client component, so `format` is only usable from another client
// component -- a function cannot cross the server/client boundary. From a
// server page, format the value into the row instead.
// jsPDF is imported inside the click handler, so ~400KB of PDF library never
// reaches anyone who does not press the button.
//
// THE LETTERHEAD
//
// Every report this produces now carries the school's name, crest and contact
// line, because a sheet of figures with no masthead is not something an office
// can file, hand to a parent, or send to a board. It is fetched here, on the
// click, rather than passed down as a prop: this component is used on
// something like twenty screens, and threading one more prop through all of
// them -- and through the server pages that render them -- to put the same
// four lines on top of every PDF is a lot of edits for one letterhead.
//
// document_settings is readable by any member of the school (see
// 032_documents.sql), so the browser client can ask for it directly, and a
// failure just prints the plain report it always did.

function cellText(column, row) {
  const raw = row[column.key]
  const value = column.format ? column.format(raw, row) : raw
  if (value === null || value === undefined) return ''
  return String(value)
}

function stamp() {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

function printedAtLabel() {
  return new Date().toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function toCsv(columns, rows) {
  const escape = (value) => {
    let s = String(value ?? '')
    // A leading =, +, - or @ makes Excel and Sheets evaluate the cell as a
    // formula. Prefix with an apostrophe so a student name like "-Ali" stays
    // text instead of becoming a spreadsheet expression.
    if (/^[=+\-@]/.test(s)) s = `'${s}`
    return `"${s.replaceAll('"', '""')}"`
  }

  const lines = [columns.map((c) => escape(c.label)).join(',')]
  for (const row of rows) {
    lines.push(columns.map((c) => escape(cellText(c, row))).join(','))
  }
  // BOM so Excel opens UTF-8 correctly -- without it, Urdu and accented names
  // arrive as mojibake.
  return '﻿' + lines.join('\r\n')
}

/* ------------------------------------------------------------- letterhead */

// #1e3a8a -> [30, 58, 138]. jsPDF wants channels, and a bad hex must not take
// the export down with it.
function rgb(hex, fallback = [30, 58, 138]) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? '').trim())
  if (!m) return fallback
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

// jsPDF cannot take a URL -- it needs the bytes. Public bucket, so a plain
// fetch is enough, and any failure (offline, a deleted object, a CORS policy
// somebody changed) just means a report without a crest.
async function loadLogo(path) {
  if (!path) return null
  const url = path.startsWith('http')
    ? path
    : `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${ASSETS}/${path}`

  try {
    const response = await fetch(url)
    if (!response.ok) return null
    const blob = await response.blob()
    const format = blob.type.includes('png') ? 'PNG' : blob.type.includes('webp') ? 'WEBP' : 'JPEG'
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
    return { dataUrl, format }
  } catch {
    return null
  }
}

async function loadLetterhead() {
  try {
    const supabase = createClient()
    const { data } = await supabase
      .from('document_settings')
      .select(
        'school_name, tagline, address, city, phone, phone_alt, email, website, registration_no, logo_url, accent_color, footer_note, show_print_time'
      )
      .maybeSingle()
    if (!data) return null
    return { ...data, logo: await loadLogo(data.logo_url) }
  } catch {
    return null
  }
}

/**
 * Draws the masthead and returns the y to start the table at.
 *
 * Mirrors DocHeader in components/print/document-sheet.js -- crest left, name
 * centred, contact line under, accent rule -- but in jsPDF primitives,
 * because this path produces a PDF directly rather than printing a DOM.
 */
function drawHeader(doc, head, { title, subtitle, pageWidth, margin }) {
  const accent = rgb(head?.accent_color)
  let y = margin

  if (head) {
    const centreX = pageWidth / 2

    if (head.logo) {
      try {
        doc.addImage(head.logo.dataUrl, head.logo.format, margin, y, 42, 42)
      } catch {
        // An unsupported image must not cost the user their report.
      }
    }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(15)
    doc.setTextColor(...accent)
    doc.text(String(head.school_name ?? '').toUpperCase(), centreX, y + 14, { align: 'center' })

    doc.setFont('helvetica', 'normal')
    let line = y + 26

    if (head.tagline) {
      doc.setFontSize(7.5)
      doc.setTextColor(55, 65, 81)
      doc.text(head.tagline, centreX, line, { align: 'center' })
      line += 9
    }

    const contact = [
      [head.address, head.city].filter(Boolean).join(', '),
      [head.phone, head.phone_alt].filter(Boolean).join(' · '),
      head.email,
      head.website,
    ]
      .filter(Boolean)
      .join('   ·   ')

    if (contact) {
      doc.setFontSize(7.5)
      doc.setTextColor(107, 114, 128)
      doc.text(contact, centreX, line, { align: 'center' })
      line += 9
    }

    if (head.registration_no) {
      doc.setFontSize(7)
      doc.setTextColor(55, 65, 81)
      doc.text(String(head.registration_no).toUpperCase(), centreX, line, { align: 'center' })
      line += 9
    }

    // The double rule: one heavy accent line with a hair line under it.
    y = Math.max(line + 4, margin + 48)
    doc.setFillColor(...accent)
    doc.rect(margin, y, pageWidth - margin * 2, 2.4, 'F')
    doc.rect(margin, y + 3.6, pageWidth - margin * 2, 0.6, 'F')
    y += 16
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(17, 24, 39)
  doc.text(title, margin, y + 8)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(107, 114, 128)
  if (subtitle) doc.text(subtitle, margin, y + 20)

  return y + (subtitle ? 30 : 20)
}

function drawFooter(doc, head, { pageWidth, pageHeight, margin, printed }) {
  const pages = doc.getNumberOfPages()
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(156, 163, 175)

    const note = head?.footer_note ?? ''
    if (note) doc.text(note, margin, pageHeight - margin + 10)

    const right = [
      head?.show_print_time === false ? null : `Printed ${printed}`,
      `Page ${page} of ${pages}`,
    ]
      .filter(Boolean)
      .join('   ·   ')

    doc.text(right, pageWidth - margin, pageHeight - margin + 10, { align: 'right' })
  }
}

export default function ExportButtons({
  rows = [],
  columns = [],
  filename = 'export',
  title = 'Report',
  subtitle,
}) {
  const [busy, setBusy] = useState(null)
  const disabled = rows.length === 0
  const base = `${filename}-${stamp()}`

  function exportCsv() {
    setBusy('csv')
    try {
      downloadBlob(
        new Blob([toCsv(columns, rows)], { type: 'text/csv;charset=utf-8;' }),
        `${base}.csv`
      )
    } finally {
      setBusy(null)
    }
  }

  async function exportPdf() {
    setBusy('pdf')
    try {
      const [{ jsPDF }, { default: autoTable }, head] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
        loadLetterhead(),
      ])

      // Landscape once there are enough columns that portrait would squeeze
      // them into unreadable slivers.
      const doc = new jsPDF({
        orientation: columns.length > 5 ? 'landscape' : 'portrait',
        unit: 'pt',
        format: 'a4',
      })

      const pageWidth = doc.internal.pageSize.getWidth()
      const pageHeight = doc.internal.pageSize.getHeight()
      const margin = 40
      const printed = printedAtLabel()

      const meta = [subtitle, `${rows.length} record${rows.length === 1 ? '' : 's'}`, stamp()]
        .filter(Boolean)
        .join('  ·  ')

      const startY = drawHeader(doc, head, { title, subtitle: meta, pageWidth, margin })
      const accent = rgb(head?.accent_color)

      autoTable(doc, {
        startY,
        head: [columns.map((c) => c.label)],
        body: rows.map((row) => columns.map((c) => cellText(c, row))),
        styles: { fontSize: 8, cellPadding: 5, lineColor: [228, 232, 242], lineWidth: 0.5 },
        headStyles: { fillColor: accent, textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [249, 250, 253] },
        margin: { left: margin, right: margin, top: margin, bottom: margin + 20 },
      })

      drawFooter(doc, head, { pageWidth, pageHeight, margin, printed })

      doc.save(`${base}.pdf`)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={exportPdf}
        disabled={disabled || busy !== null}
        title={disabled ? 'Nothing to export' : `Download ${rows.length} rows as PDF`}
        className="btn btn-ghost"
      >
        {busy === 'pdf' ? 'Preparing…' : 'Download PDF'}
      </button>
      <button
        type="button"
        onClick={exportCsv}
        disabled={disabled || busy !== null}
        title={disabled ? 'Nothing to export' : `Export ${rows.length} rows as CSV`}
        className="btn btn-blue"
      >
        {busy === 'csv' ? 'Preparing…' : 'Export CSV'}
      </button>
    </div>
  )
}
