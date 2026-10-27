import Link from 'next/link'
import { getSchoolContext } from '@/lib/school-context'
import RefreshButton from '@/components/refresh-button'
import SettingsTabs from './settings-tabs'

export const metadata = { title: 'Settings' }

const SECTIONS = [
  { id: 'school', label: 'School Info', sub: 'Name, address & contact', icon: '▣' },
  { id: 'academic', label: 'Academic', sub: 'Year, periods & grading', icon: '▦' },
  { id: 'fees', label: 'Fee & Finance', sub: 'Currency, late fee rules', icon: '₨' },
  // Everything the school puts on paper. Its own section rather than a corner
  // of School Info, because it is read by every print screen in the app --
  // challans, receipts, salary slips, vouchers, certificates, ID cards -- and
  // it is the one place to fill the letterhead in once.
  {
    id: 'documents',
    label: 'Documents',
    sub: 'Letterhead, stamps & bank',
    icon: '✍',
  },
  { id: 'notifications', label: 'Notifications', sub: 'Email, SMS & in-app', icon: '◉' },
  // Not a `section` like the others: WhatsApp is its own screen with its own
  // tabs and its own permission (whatsapp.write, not core.settings.write),
  // so the rail links out to it rather than rendering a block inline. `href`
  // is what marks the difference.
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    sub: 'Linked phone, auto-send & templates',
    icon: '✉',
    href: '/school/settings/whatsapp',
  },
  { id: 'appearance', label: 'Appearance', sub: 'Theme, language & format', icon: '◐' },
]

export default async function SettingsPage({ searchParams }) {
  const params = await searchParams
  // Entries carrying an href are links out, not tabs -- so they can never
  // be the selected section.
  const section = SECTIONS.some((s) => s.id === params?.section && !s.href)
    ? params.section
    : 'school'

  const { schoolId, permissions, supabase } = await getSchoolContext()
  const canWrite = permissions.has('core.settings.write')

  const [{ data: school }, { data: settingRows }, { data: waStatus }, { data: documents }] =
    await Promise.all([
    supabase
      .from('schools')
      .select(
        'id, school_name, short_code, school_type, affiliation, established_year, principal_name, address, city, province, phone, email, website, currency'
      )
      .eq('id', schoolId)
      .maybeSingle(),
    supabase.from('settings').select('key, value').eq('school_id', schoolId),
    // Through the RPC, not a table read: whatsapp_settings is gated on
    // whatsapp.read, and the person editing Notifications may only hold
    // core.settings.write. whatsapp_status() carries no credentials and no
    // message content, so it is safe to answer for either.
    supabase.rpc('whatsapp_status'),
    // The letterhead. Read as the raw row rather than through
    // loadDocument(), because the form edits the stored values and has to
    // show which ones are actually set -- a fallback filled in would look
    // saved and then not be.
    supabase.from('document_settings').select('*').eq('school_id', schoolId).maybeSingle(),
  ])

  // One keyed row per block; a missing row means the block has never been
  // saved and the form shows its defaults.
  const blocks = Object.fromEntries((settingRows ?? []).map((r) => [r.key, r.value ?? {}]))

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>
            Settings
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
            Manage your school configuration
          </p>
        </div>
        <RefreshButton />
      </div>

      {!canWrite && (
        <p
          className="rounded-xl px-4 py-3 text-sm"
          style={{ background: 'var(--amber-soft)', color: 'var(--amber-ink)' }}
        >
          Read-only — changing school settings needs the{' '}
          <strong>Edit school settings and branding</strong> permission.
        </p>
      )}

      {/* ------------------------------------------------------ data backup */}
      {canWrite && (
        <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-3">
            <span
              className="flex size-10 shrink-0 items-center justify-center rounded-xl text-base text-white"
              style={{ background: 'var(--brand-grad)' }}
              aria-hidden="true"
            >
              ▤
            </span>
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                Data Backup
              </p>
              <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
                Download a full JSON snapshot of your school&rsquo;s data. Read-only — for your own
                records.
              </p>
            </div>
          </div>

          {/* A plain link, not a button: the response carries
              Content-Disposition, so the browser downloads it without any
              client-side JavaScript involved. */}
          <a href="/school/settings/backup" className="btn btn-primary">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
            </svg>
            Download full backup (JSON)
          </a>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
        {/* --------------------------------------------------- section rail */}
        <nav className="card overflow-hidden lg:sticky lg:top-20 lg:self-start">
          <div
            className="px-4 py-3"
            style={{ background: 'var(--card-alt)', borderBottom: '1px solid var(--border)' }}
          >
            <p
              className="text-[0.68rem] font-bold uppercase tracking-wider"
              style={{ color: 'var(--muted)' }}
            >
              Configuration
            </p>
          </div>

          <div className="flex flex-col p-2">
            {SECTIONS.map((s) => {
              const on = section === s.id
              return (
                <Link
                  key={s.id}
                  href={
                    s.href ??
                    (s.id === 'school' ? '/school/settings' : `/school/settings?section=${s.id}`)
                  }
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 transition"
                  style={{
                    background: on ? 'var(--brand-soft)' : 'transparent',
                    color: on ? 'var(--brand-ink)' : 'var(--ink-2)',
                  }}
                >
                  <span
                    className="flex size-7 shrink-0 items-center justify-center rounded-md text-xs"
                    style={{
                      background: on ? 'var(--brand)' : 'var(--card-alt)',
                      color: on ? '#fff' : 'var(--muted)',
                    }}
                    aria-hidden="true"
                  >
                    {s.icon}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{s.label}</span>
                    <span className="block text-[0.65rem]" style={{ color: 'var(--muted)' }}>
                      {s.sub}
                    </span>
                  </span>
                </Link>
              )
            })}
          </div>
        </nav>

        <SettingsTabs
          section={section}
          school={school ?? {}}
          blocks={blocks}
          canWrite={canWrite}
          whatsapp={Array.isArray(waStatus) ? (waStatus[0] ?? null) : (waStatus ?? null)}
          documents={documents ?? null}
          schoolId={schoolId}
        />
      </div>
    </div>
  )
}
