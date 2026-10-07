'use client'

import { useState } from 'react'

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
      downloadBlob(new Blob([toCsv(columns, rows)], { type: 'text/csv;charset=utf-8;' }), `${base}.csv`)
    } finally {
      setBusy(null)
    }
  }

  async function exportPdf() {
    setBusy('pdf')
    try {
      const [{ jsPDF }, { default: autoTable }] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
      ])

      // Landscape once there are enough columns that portrait would squeeze
      // them into unreadable slivers.
      const doc = new jsPDF({
        orientation: columns.length > 5 ? 'landscape' : 'portrait',
        unit: 'pt',
        format: 'a4',
      })

      doc.setFontSize(14)
      doc.setTextColor(15, 23, 42)
      doc.text(title, 40, 40)

      doc.setFontSize(9)
      doc.setTextColor(100, 116, 139)
      const meta = [subtitle, `${rows.length} record${rows.length === 1 ? '' : 's'}`, stamp()]
        .filter(Boolean)
        .join('  ·  ')
      doc.text(meta, 40, 56)

      autoTable(doc, {
        startY: 72,
        head: [columns.map((c) => c.label)],
        body: rows.map((row) => columns.map((c) => cellText(c, row))),
        styles: { fontSize: 8, cellPadding: 5, lineColor: [228, 232, 242], lineWidth: 0.5 },
        headStyles: { fillColor: [23, 57, 143], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [249, 250, 253] },
        margin: { left: 40, right: 40 },
      })

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
