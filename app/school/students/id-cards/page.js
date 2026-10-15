import RefreshButton from '@/components/refresh-button'
import Link from 'next/link'
import { getSchoolContext } from '@/lib/school-context'
import { StatCard, StatRow } from '@/components/ui'
import { publicUrl, signedPhotoUrls } from '@/lib/storage'
import CardSettingsPanel from './card-settings-panel'
import CardGrid, { PrintButton } from './card-grid'

export const metadata = { title: 'ID Cards' }

export default async function IdCardsPage({ searchParams }) {
  const params = await searchParams
  const q = (params?.q ?? '').trim()
  const classFilter = params?.class ?? ''

  const { schoolId, school, supabase } = await getSchoolContext()

  const [{ data: classes }, { data: sections }, { data: settings }] = await Promise.all([
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
  ])

  let query = supabase
    .from('students')
    .select(
      'id, first_name, last_name, father_name, admission_number, roll_number, gender, status, date_of_birth, current_address, current_class_id, current_section_id, photo_url'
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

  const classById = new Map((classes ?? []).map((c) => [c.id, c.grade_levels?.name ?? c.name]))
  const sectionById = new Map((sections ?? []).map((s) => [s.id, s.name]))

  const cards = (students ?? []).map((s) => ({
    id: s.id,
    name: [s.first_name, s.last_name].filter(Boolean).join(' '),
    father_name: s.father_name,
    admission_number: s.admission_number,
    roll_number: s.roll_number,
    klass: classById.get(s.current_class_id) ?? '—',
    section: sectionById.get(s.current_section_id) ?? '—',
    gender: s.gender,
    status: s.status,
    date_of_birth: s.date_of_birth,
    address: s.current_address,
    photoUrl: photoUrls.get(s.photo_url) ?? null,
  }))

  const classOptions = (classes ?? []).sort(
    (a, b) => (a.grade_levels?.ordinal ?? 999) - (b.grade_levels?.ordinal ?? 999)
  )

  // The card component needs a school name even before settings are saved.
  const effective = {
    ...(settings ?? {}),
    school_name: settings?.school_name || school?.school_name,
    logoUrl: publicUrl(settings?.logo_url),
    backgroundUrl: publicUrl(settings?.background_url),
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
            One template for the whole school. Printing uses your browser&rsquo;s print dialog.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <RefreshButton />
          <CardSettingsPanel
            settings={settings}
            schoolName={school?.school_name}
            schoolId={schoolId}
          />
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
            value={cards.filter((c) => !c.admission_number).length}
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

      {cards.some((c) => !c.admission_number) && (
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
