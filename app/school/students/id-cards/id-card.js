'use client'

import Barcode from '@/components/barcode'

// One printed card. Kept dumb: every colour, size and toggle comes from
// `settings` so the live preview in the settings panel and the real card on
// the grid are literally the same component.
export default function IdCard({ student, settings, sample = false }) {
  const s = settings ?? {}
  const f = s.fields ?? {}
  const horizontal = s.orientation === 'horizontal'

  const initials = (student.name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()

  const rows = [
    f.roll_number !== false && ['Roll no', student.roll_number],
    f.class !== false && ['Class', student.klass],
    f.section !== false && ['Section', student.section],
    f.admission_number !== false && ['Adm no', student.admission_number],
    f.date_of_birth === true && ['DOB', student.date_of_birth],
    f.gender !== false && ['Gender', student.gender],
    f.status === true && ['Status', student.status],
    f.address === true && ['Address', student.address],
  ].filter(Boolean)

  const fontFamily =
    s.font_style === 'serif' ? 'Georgia, serif' : s.font_style === 'mono' ? 'ui-monospace, monospace' : undefined

  return (
    <div
      className="print-sheet overflow-hidden rounded-xl"
      style={{
        width: horizontal ? (s.card_height ?? 340) : (s.card_width ?? 208),
        background: s.backgroundUrl
          ? `linear-gradient(rgb(255 255 255 / 0.86), rgb(255 255 255 / 0.86)), url(${s.backgroundUrl}) center/cover`
          : '#fff',
        border: `1px ${s.border_style ?? 'solid'} ${s.border_color ?? '#e2e8f0'}`,
        color: s.text_color ?? '#1e293b',
        fontSize: `${s.font_size ?? 10}px`,
        fontFamily,
        textAlign: s.text_align ?? 'center',
      }}
    >
      {/* header */}
      <div
        className="px-3 py-2.5"
        style={{
          background: `linear-gradient(135deg, ${s.header_from ?? '#3b0764'}, ${s.header_to ?? '#7c3aed'})`,
        }}
      >
        <div className="flex items-center gap-2 text-left">
          {s.logoUrl ? (
            // Not next/image: the host is the Supabase project URL, which
            // would need remotePatterns, and signed URLs expire anyway.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={s.logoUrl}
              alt=""
              className="size-6 shrink-0 rounded bg-white/20 object-contain"
            />
          ) : (
            <span
              className="flex size-6 shrink-0 items-center justify-center rounded bg-white/20 text-[0.6rem] font-bold text-white"
              aria-hidden="true"
            >
              {(s.school_name || 'S')[0]}
            </span>
          )}
          <span className="min-w-0">
            <span className="block truncate text-[0.62rem] font-semibold text-white">
              {s.school_name || 'School name'}
            </span>
            <span className="block text-[0.52rem] text-white/70">Student ID Card</span>
          </span>
        </div>

        {f.photo !== false && (
          <div className="mt-2 flex justify-center">
            {student.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={student.photoUrl}
                alt={student.name}
                className="size-14 rounded-full border-2 border-white/40 object-cover"
              />
            ) : (
              <span
                className="flex size-14 items-center justify-center rounded-full bg-white/25 text-base font-bold text-white"
                aria-hidden="true"
              >
                {initials}
              </span>
            )}
          </div>
        )}

        {f.student_name !== false && (
          <p className="mt-1.5 text-center text-[0.75rem] font-semibold text-white">
            {student.name}
          </p>
        )}
        {f.father_name !== false && student.father_name && (
          <p className="text-center text-[0.58rem] text-white/70">{student.father_name}</p>
        )}
      </div>

      {/* details */}
      <div className="px-3 py-2.5">
        {student.admission_number && (
          <p className="mb-2 text-center">
            <span
              className="inline-block rounded-full px-2 py-0.5 font-mono text-[0.55rem] font-semibold"
              style={{ background: '#f1f5f9', color: '#475569' }}
            >
              {student.admission_number}
            </span>
          </p>
        )}

        <dl className="flex flex-col gap-1 text-left">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between gap-2">
              <dt style={{ color: '#94a3b8' }}>{label}</dt>
              <dd className="truncate font-medium">{value || '—'}</dd>
            </div>
          ))}
        </dl>

        {(s.show_barcode ?? true) && (
          <div className="mt-2.5 flex justify-center">
            <Barcode value={student.admission_number || student.id?.slice(0, 8)} height={28} />
          </div>
        )}
      </div>

      {(s.school_address || s.school_phone || s.school_email) && (
        <div
          className="px-3 pb-2.5 text-center text-[0.5rem] leading-snug"
          style={{ color: '#7c3aed' }}
        >
          {s.school_address && <p>{s.school_address}</p>}
          {s.school_phone && <p>{s.school_phone}</p>}
          {s.school_email && <p>{s.school_email}</p>}
        </div>
      )}

      {sample && (
        <p className="pb-1.5 text-center text-[0.5rem]" style={{ color: '#94a3b8' }}>
          sample data
        </p>
      )}
    </div>
  )
}
