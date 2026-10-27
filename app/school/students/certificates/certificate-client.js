'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import CertificateSheet from '@/components/print/certificate-sheet'
import { PaperRule, PrintButton } from '@/components/print/print-now'
import { Spinner } from '@/components/spinner'
import {
  CERTIFICATE_KINDS,
  certificateBody,
  certificateTitle,
  fillTokens,
  printDate,
} from '@/lib/documents'
import { issueCertificate } from '../actions'

// Pick a kind, pick a student, see the actual sheet.
//
// The preview is the SAME component the print route renders, fed the same
// data, so there is no second layout to keep in step -- what is on screen is
// what comes out of the printer. Token substitution runs here rather than on
// the server so the body follows the issue-date picker without a round trip,
// and it is the same fillTokens() the print route uses.
//
// "Print" does not just open the dialog. It records the certificate in
// certificates_issued first, which is what mints the serial number printed on
// it -- a serial invented in the browser would be a different number on every
// reprint, and a certificate whose number changes is not a certificate.
export default function CertificateClient({
  students,
  settings,
  doc,
  schoolName,
  settingsPanel,
  nextSerial,
  recent = [],
}) {
  const [kind, setKind] = useState('bonafide')
  const [studentId, setStudentId] = useState('')
  const [query, setQuery] = useState('')
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10))
  const [state, formAction, pending] = useActionState(issueCertificate, {})

  const student = students.find((s) => s.id === studentId) ?? null
  const s = settings ?? {}

  const matches = query.trim()
    ? students
        .filter((row) =>
          [row.name, row.admission_number, row.father_name]
            .filter(Boolean)
            .some((v) => v.toLowerCase().includes(query.trim().toLowerCase()))
        )
        .slice(0, 8)
    : []

  const tokens = {
    student_name: student?.name,
    father_name: student?.father_name,
    mother_name: student?.mother_name,
    class: student?.klass,
    roll_number: student?.roll_number,
    admission_no: student?.admission_number,
    admission_date: printDate(student?.admission_date),
    date_of_birth: printDate(student?.date_of_birth),
    // A leaving certificate for somebody still on the roll has no leaving
    // date, and the issue date is the honest stand-in -- that IS the day the
    // school is certifying they left.
    leaving_date: printDate(student?.left_on ?? issueDate),
    issue_date: printDate(issueDate),
    school_name: s.school_name || schoolName || doc?.name,
    serial_no: nextSerial,
  }

  const cert = {
    kind,
    title: certificateTitle(s, kind),
    body: fillTokens(certificateBody(s, kind), tokens),
    serial: nextSerial,
    issueDate,
    logoUrl: s.logoUrl,
    backgroundUrl: s.backgroundUrl,
    student: {
      name: student?.name,
      fatherName: student?.father_name,
      className: student?.klass,
      rollNumber: student?.roll_number,
      admissionNumber: student?.admission_number,
      admissionDate: student?.admission_date,
      photoUrl: student?.photoUrl,
    },
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
      <PaperRule paper={s.paper_size ?? 'a4'} landscape={s.orientation === 'landscape'} />

      {/* ------------------------------------------------------- controls */}
      <div className="no-print flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          {CERTIFICATE_KINDS.map((k) => {
            const on = kind === k.id
            return (
              <button
                key={k.id}
                type="button"
                onClick={() => setKind(k.id)}
                className="flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition"
                style={{
                  borderColor: on ? 'var(--brand)' : 'var(--border)',
                  background: on ? 'var(--brand-soft)' : 'var(--card)',
                }}
              >
                <span
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
                  style={{ background: on ? 'var(--brand-grad)' : 'var(--muted-2)' }}
                  aria-hidden="true"
                >
                  {k.label[0]}
                </span>
                <span className="min-w-0">
                  <span
                    className="block text-sm font-medium"
                    style={{ color: on ? 'var(--brand-ink)' : 'var(--ink)' }}
                  >
                    {k.label}
                  </span>
                  <span className="block text-xs" style={{ color: 'var(--muted)' }}>
                    {k.hint}
                  </span>
                </span>
              </button>
            )
          })}
        </div>

        <div className="card p-4">
          <span className="label">Select student</span>
          <input
            value={student ? student.name : query}
            onChange={(e) => {
              setQuery(e.target.value)
              setStudentId('')
            }}
            placeholder="Search by name or ID…"
            className="field"
          />
          {matches.length > 0 && !student && (
            <ul className="popover mt-1 max-h-56 overflow-y-auto py-1">
              {matches.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setStudentId(row.id)
                      setQuery('')
                    }}
                    className="option"
                  >
                    {row.name}
                    <span
                      className="ml-2 font-mono text-[0.65rem]"
                      style={{ color: 'var(--muted)' }}
                    >
                      {row.admission_number}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {student && (
            <button
              type="button"
              onClick={() => setStudentId('')}
              className="mt-2 text-xs underline underline-offset-4"
              style={{ color: 'var(--muted)' }}
            >
              Choose someone else
            </button>
          )}
        </div>

        <form action={formAction} className="card flex flex-col gap-3 p-4">
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="student_id" value={studentId} />

          <div>
            <span className="label">Issue date</span>
            <input
              type="date"
              name="issue_date"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
              className="field"
            />
          </div>

          <div
            className="flex items-baseline justify-between rounded-lg px-3 py-2 text-xs"
            style={{ background: 'var(--card-alt)', color: 'var(--muted)' }}
          >
            <span>Serial on issue</span>
            <strong className="font-mono" style={{ color: 'var(--ink)' }}>
              {nextSerial}
            </strong>
          </div>

          <button type="submit" disabled={!student || pending} className="btn btn-primary">
            {pending ? (
              <>
                <Spinner /> Issuing…
              </>
            ) : (
              'Issue & print'
            )}
          </button>

          {/* Printing the preview without recording it. For a school that
              wants to see it on paper before committing a serial number. */}
          <PrintButton
            label="Print preview only"
            className="btn btn-ghost"
            disabled={!student}
            title={
              student
                ? 'Prints the sheet without recording an issue or using the serial'
                : 'Select a student first'
            }
          />

          {state?.error && (
            <p
              className="rounded-lg px-3 py-2 text-sm"
              style={{ background: 'var(--red-soft)', color: 'var(--red-ink)' }}
            >
              {state.error}
            </p>
          )}
        </form>

        {/* Outside the issue form on purpose: the settings panel carries a
            form of its own, and a form inside a form is invalid HTML -- the
            inner one is dropped by the parser and its Save button silently
            submits the outer one instead. */}
        {settingsPanel}

        {recent.length > 0 && (
          <div className="card overflow-hidden">
            <div
              className="border-b px-3 py-2"
              style={{ borderColor: 'var(--border)', background: 'var(--card-alt)' }}
            >
              <p className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>
                Recently issued
              </p>
            </div>
            <ul>
              {recent.map((r) => (
                <li key={r.id} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                  <Link
                    href={`/school/students/certificates/print?issued=${r.id}`}
                    className="flex items-center justify-between gap-2 px-3 py-2"
                  >
                    <span className="min-w-0">
                      <span
                        className="block truncate text-xs font-medium"
                        style={{ color: 'var(--ink)' }}
                      >
                        {r.studentName}
                      </span>
                      <span className="block text-[0.65rem]" style={{ color: 'var(--muted)' }}>
                        {r.kindLabel} · {printDate(r.issuedOn)}
                      </span>
                    </span>
                    <span className="font-mono text-[0.6rem]" style={{ color: 'var(--muted)' }}>
                      {r.serialNo ?? '—'}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* -------------------------------------------------------- preview */}
      <div>
        {!student ? (
          <div className="no-print card flex min-h-[24rem] flex-col items-center justify-center gap-2 px-6 text-center">
            <span
              className="flex size-12 items-center justify-center rounded-full"
              style={{ background: 'var(--card-alt)', color: 'var(--muted-2)' }}
              aria-hidden="true"
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
              >
                <circle cx="12" cy="8" r="3.5" />
                <path d="M5 20a7 7 0 0114 0" strokeLinecap="round" />
              </svg>
            </span>
            <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
              No student selected
            </p>
            <p className="max-w-xs text-sm" style={{ color: 'var(--muted)' }}>
              Search and pick a student on the left to see the certificate exactly as it will
              print.
            </p>
          </div>
        ) : (
          <div className="doc-preview">
            <CertificateSheet cert={cert} settings={s} doc={doc} />
          </div>
        )}
      </div>
    </div>
  )
}
