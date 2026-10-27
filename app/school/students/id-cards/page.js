import RefreshButton from '@/components/refresh-button'
import Link from 'next/link'
import { getSchoolContext } from '@/lib/school-context'
import { StatCard, StatRow } from '@/components/ui'
import { publicUrl, signedPhotoUrls } from '@/lib/storage'
import { loadDocument } from '@/lib/documents'
import CardSettingsPanel from './card-settings-panel'
import CardGrid, { PrintButton } from './card-grid'

export const metadata = { title: 'ID Cards' }

export default async function IdCardsPage({ searchParams }) {
  const params = await searchParams
  const q = (params?.q ?? '').trim()
  const classFilter = params?.class ?? ''

  const { schoolId, school, permissions, supabase } = await getSchoolContext()
  // The design panel writes id_card_settings and uploads to school-assets,
  // both gated on core.settings.write in the database -- see the same note on
  // the certificates page.
  const canConfigure = permissions.has('core.settings.write')

  const [{ data: classes }, { data: sections }, { data: settings }, { data: currentSession }] =
    await Promise.all([
      supabase
        .from('classes')
        .select('id, name, grade_levels(name, ordinal)')
        .eq('school_id', schoolId)
        .eq('is_deleted', false),
      supabase
        .from('sections')
        .select('id, name')
        .eq('school_id', schoolId)
        .eq('is_deleted', false),
      supabase.from('id_card_settings').select('*').eq('school_id', schoolId).maybeSingle(),
      // Printed on the back of the card, so a card found next July is
      // recognisably last year's.
      supabase
        .from('sessions')
        .select('name')
        .eq('school_id', schoolId)
        .eq('is_current', true)
        .eq('is_deleted', false)
        .maybeSingle(),
    ])

  let query = supabase
    .from('students')
    .select(
      'id, first_name, last_name, father_name, admission_number, roll_number, gender, status, date_of_birth, blood_group, guardian_phone, emergency_phone, current_address, current_class_id, current_section_id, photo_url'
    )
    .eq('school_id', schoolId)
    .eq('is_deleted', false)
    .eq('status', 'active')

  if (classFilter) query = query.eq('current_class_id', classFilter)
  if (q) {
    query = query.or(
      `first_name.ilike.%${q}%,last_name.ilike.%${q}%,admission_number.ilike.%${q}%`
    )
  }

  const { data: students, error } = await query.order('first_name')

  // Photos live in the private bucket, so each needs a signed URL. One
  // batched call for the whole sheet rather than one per card.
  const photoUrls = await signedPhotoUrls(
    supabase,
    (students ?? []).map((s) => s.photo_url)
  )

  const doc = await loadDocument(supabase, schoolId, school)

  const classById = new Map((classes ?? []).map((c) => [c.id, c.grade_levels?.name ?? c.name]))
  const sectionById = new Map((sections ?? []).map((s) => [s.id, s.name]))

  // camelCase, matching what components/print/id-card.js reads. The old
  // snake_case shape was the database row leaking into a print component,
  // which is also why the card could not show anything the query had not
  // already named exactly right.
  const cards = (students ?? []).map((s) => ({
    id: s.id,
    name: [s.first_name, s.last_name].filter(Boolean).join(' '),
    fatherName: s.father_name,
    admissionNumber: s.admission_number,
    rollNumber: s.roll_number,
    className: classById.get(s.current_class_id) ?? '—',
    sectionName: sectionById.get(s.current_section_id) ?? '—',
    gender: s.gender,
    status: s.status,
    dateOfBirth: s.date_of_birth,
    bloodGroup: s.blood_group,
    guardianPhone: s.guardian_phone,
    emergencyPhone: s.emergency_phone,
    address: s.current_address,
    session: currentSession?.name ?? null,
    photoUrl: photoUrls.get(s.photo_url) ?? null,
  }))

  const classOptions = (classes ?? []).sort(
    (a, b) => (a.grade_levels?.ordinal ?? 999) - (b.grade_levels?.ordinal ?? 999)
  )

  // The card component needs a school name even before settings are saved,
  // and the letterhead row is where the rest falls back to -- a school that
  // filled in Documents & Branding once should not have to retype its phone
  // number here to get it on the back of a card.
  const effective = {
    ...(settings ?? {}),
    school_name: settings?.school_name || doc.name,
    school_address: settings?.school_address || doc.address,
    school_phone: settings?.school_phone || doc.phone,
    school_email: settings?.school_email || doc.email,
    logoUrl: publicUrl(settings?.logo_url) ?? doc.logoUrl,
    backgroundUrl: publicUrl(settings?.background_url),
    principalSignatureUrl:
      publicUrl(settings?.principal_signature_url) ?? doc.principal.signatureUrl,
    signatorySignatureUrl: publicUrl(settings?.signatory_signature_url),
    stampUrl: publicUrl(settings?.stamp_url) ?? doc.schoolStampUrl,
    principal_label: settings?.principal_label || doc.principal.label,
  }

  const { count: totalActive } = await supabase
    .from('students')
    .select('*', { count: 'exact', head: true })
    .eq('school_id', schoolId)
    .eq('is_deleted', false)
    .eq('status', 'active')

  return (
    <div className="flex flex-col gap-5">
      <div className="no-print flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>
            ID Cards
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
            One template for the whole school, at card size (85.6 × 54 mm). Printing uses your
            browser&rsquo;s print dialog.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <RefreshButton />
          {canConfigure && (
            <CardSettingsPanel
              settings={settings}
              schoolName={school?.school_name}
              schoolId={schoolId}
              doc={doc}
            />
          )}
          <PrintButton count={cards.length} />
        </div>
      </div>

      <div className="no-print">
        <StatRow>
          <StatCard label="Active students" value={totalActive ?? 0} tone="brand" />
          <StatCard label="Showing" value={cards.length} tone="blue" />
          <StatCard label="Classes" value={classOptions.length} tone="green" />
          <StatCard
            label="Without admission no"
            value={cards.filter((c) => !c.admissionNumber).length}
            tone="amber"
          />
        </StatRow>
      </div>

      <form className="no-print card flex flex-wrap items-center gap-2 p-3">
        <select
          name="class"
          defaultValue={classFilter}
          className="field w-auto min-w-44"
          aria-label="Filter by class"
        >
          <option value="">All classes</option>
          {classOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.grade_levels?.name ?? c.name}
            </option>
          ))}
        </select>
        <input
          name="q"
          defaultValue={q}
          placeholder="Search by name or ID…"
          className="field min-w-52 flex-1"
        />
        <button className="btn btn-primary">Search</button>
        {(q || classFilter) && (
          <Link href="/school/students/id-cards" className="btn btn-ghost">
            Clear
          </Link>
        )}
      </form>

      {error && (
        <p
          className="rounded-lg px-3 py-2 text-sm"
          style={{ background: 'var(--red-soft)', color: 'var(--red-ink)' }}
        >
          {error.message}
        </p>
      )}

      {cards.length === 0 ? (
        <div className="card px-6 py-16 text-center" style={{ borderStyle: 'dashed' }}>
          <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            No cards to show
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm" style={{ color: 'var(--muted)' }}>
            Cards are generated from active students. Admit some first, or clear the filters.
          </p>
        </div>
      ) : (
        <CardGrid cards={cards} settings={effective} />
      )}

      {cards.some((c) => !c.admissionNumber) && (
        <p
          className="no-print rounded-lg px-3 py-2 text-sm"
          style={{ background: 'var(--amber-soft)', color: 'var(--amber-ink)' }}
        >
          Some students have no admission number, so their card prints without a barcode. The
          barcode encodes that number.
        </p>
      )}
    </div>
  )
}
