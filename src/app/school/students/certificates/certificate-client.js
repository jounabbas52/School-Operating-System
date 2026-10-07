'use client'

import { useState } from 'react'

const KINDS = [
  { id: 'bonafide', label: 'Bonafide', hint: 'Confirms student enrollment' },
  { id: 'character', label: 'Character', hint: 'Certifies good moral character' },
  { id: 'school_leaving', label: 'School Leaving', hint: 'Issued when a student leaves' },
  { id: 'result', label: 'Result', hint: 'Summarises academic performance' },
  { id: 'migration', label: 'Migration', hint: 'Required for institution transfer' },
]

const fmt = (d) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

export default function CertificateClient({ students, settings, schoolName, settingsPanel }) {
  const [kind, setKind] = useState('bonafide')
  const [studentId, setStudentId] = useState('')
  const [query, setQuery] = useState('')
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10))

  const student = students.find((s) => s.id === studentId) ?? null
  const fields = settings?.fields ?? {}

  const matches = query.trim()
    ? students
        .filter((s) =>
          [s.name, s.admission_number, s.father_name]
            .filter(Boolean)
            .some((v) => v.toLowerCase().includes(query.trim().toLowerCase()))
        )
        .slice(0, 8)
    : []

  // Placeholders are substituted here rather than server-side so the preview
  // updates as the issue date changes without a round trip.
  const body = (settings?.body_text ?? '')
    .replaceAll('{student_name}', student?.name ?? '—')
    .replaceAll('{father_name}', student?.father_name ?? '—')
    .replaceAll('{class}', student?.klass ?? '—')
    .replaceAll('{roll_number}', student?.roll_number ?? '—')
    .replaceAll('{admission_no}', student?.admission_number ?? '—')
    .replaceAll('{admission_date}', fmt(student?.admission_date))
    .replaceAll('{issue_date}', fmt(issueDate))
    .replaceAll('{school_name}', settings?.school_name || schoolName || '')

  const activeKind = KINDS.find((k) => k.id === kind)

  return (
    <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
      {/* ------------------------------------------------------- controls */}
      <div className="no-print flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          {KINDS.map((k) => {
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
              {matches.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setStudentId(s.id)
                      setQuery('')
                    }}
                    className="option"
                  >
                    {s.name}
                    <span className="ml-2 font-mono text-[0.65rem]" style={{ color: 'var(--muted)' }}>
                      {s.admission_number}
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

        <div className="card flex flex-col gap-3 p-4">
          <div>
            <span className="label">Issue date</span>
            <input
              type="date"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
              className="field"
            />
          </div>
          <button
            type="button"
            disabled={!student}
            onClick={() => window.print()}
            className="btn btn-primary"
            title={student ? 'Opens the browser print dialog' : 'Select a student first'}
          >
            Print certificate
          </button>
          {settingsPanel}
        </div>
      </div>

      {/* -------------------------------------------------------- preview */}
      <div className="print-area">
        {!student ? (
          <div className="card flex min-h-[24rem] flex-col items-center justify-center gap-2 px-6 text-center">
            <span
              className="flex size-12 items-center justify-center rounded-full"
              style={{ background: 'var(--card-alt)', color: 'var(--muted-2)' }}
              aria-hidden="true"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <circle cx="12" cy="8" r="3.5" />
                <path d="M5 20a7 7 0 0114 0" strokeLinecap="round" />
              </svg>
            </span>
            <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
              No student selected
            </p>
            <p className="max-w-xs text-sm" style={{ color: 'var(--muted)' }}>
              Search and pick a student on the left to preview the certificate.
            </p>
          </div>
        ) : (
          // Always white with dark ink: this sheet is going to a printer, so
          // it does not follow the app theme.
          <div
            className="print-sheet card relative mx-auto flex flex-col overflow-hidden p-10"
            style={{
              background: '#fff',
              color: '#111827',
              aspectRatio: settings?.orientation === 'landscape' ? '297 / 210' : '210 / 297',
              maxWidth: settings?.orientation === 'landscape' ? '52rem' : '38rem',
            }}
          >
            {settings?.backgroundUrl && (
              // Watermark: behind the text, and low enough contrast that the
              // certificate stays readable when printed.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={settings.backgroundUrl}
                alt=""
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 size-full object-contain opacity-10"
              />
            )}

            <div className="relative text-center">
              {settings?.logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={settings.logoUrl}
                  alt=""
                  className="mx-auto mb-3 h-14 object-contain"
                />
              )}
              <h2 className="text-lg font-bold">{settings?.school_name || schoolName}</h2>
              {settings?.school_address && (
                <p className="text-[0.7rem] text-slate-500">{settings.school_address}</p>
              )}
              <div className="mx-auto my-4 h-px w-24 bg-slate-300" />
              <p className="inline-block rounded-full bg-slate-100 px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-wider text-slate-700">
                {settings?.title || 'School Certificate'} · {activeKind?.label}
              </p>
            </div>

            <p className="relative mt-8 text-center text-sm leading-loose">
              {body || 'Set the certificate message in settings.'}
            </p>

            <dl className="mx-auto mt-8 grid w-full max-w-sm grid-cols-2 gap-y-1.5 text-[0.72rem]">
              {fields.student_name !== false && (
                <>
                  <dt className="text-slate-500">Student</dt>
                  <dd className="text-right font-medium">{student.name}</dd>
                </>
              )}
              {fields.father_name !== false && (
                <>
                  <dt className="text-slate-500">Father</dt>
                  <dd className="text-right font-medium">{student.father_name ?? '—'}</dd>
                </>
              )}
              {fields.class !== false && (
                <>
                  <dt className="text-slate-500">Class</dt>
                  <dd className="text-right font-medium">{student.klass}</dd>
                </>
              )}
              {fields.roll_number !== false && (
                <>
                  <dt className="text-slate-500">Roll number</dt>
                  <dd className="text-right font-medium">{student.roll_number ?? '—'}</dd>
                </>
              )}
              {fields.admission_date !== false && (
                <>
                  <dt className="text-slate-500">Admitted</dt>
                  <dd className="text-right font-medium">{fmt(student.admission_date)}</dd>
                </>
              )}
            </dl>

            <div className="relative mt-auto flex items-end justify-between pt-10 text-[0.7rem]">
              {fields.issue_date !== false ? (
                <div>
                  <p className="text-slate-500">Issue date</p>
                  <p className="font-medium">{fmt(issueDate)}</p>
                </div>
              ) : (
                <span />
              )}
              <div className="text-right">
                {settings?.principalSignatureUrl && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={settings.principalSignatureUrl}
                    alt=""
                    className="mb-0.5 ml-auto h-10 object-contain"
                  />
                )}
                <p className="mb-1 border-t border-slate-400 pt-1 font-medium">
                  {settings?.principal_name || '      '}
                </p>
                <p className="text-slate-500">{settings?.principal_label ?? 'Principal'}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
