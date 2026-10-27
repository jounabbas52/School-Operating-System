import Link from 'next/link'
import RefreshButton from '@/components/refresh-button'
import { getSchoolContext } from '@/lib/school-context'
import { publicUrl, signedPhotoUrls } from '@/lib/storage'
import { CERTIFICATE_KINDS, loadDocument } from '@/lib/documents'
import CertificateClient from './certificate-client'
import CertificateSettingsPanel from './certificate-settings-panel'

export const metadata = { title: 'Certificates' }

const KIND_LABEL = Object.fromEntries(CERTIFICATE_KINDS.map((k) => [k.id, k.label]))

export default async function CertificatesPage() {
  const { schoolId, school, permissions, supabase } = await getSchoolContext()
  const canWrite = permissions.has('students.write')
  // The design panel writes certificate_settings and uploads to the
  // school-assets bucket, and BOTH are gated on core.settings.write in the
  // database (see 003_students.sql and 004_storage.sql). Offering it to
  // somebody with students.write alone would hand them a form that can only
  // fail -- the upload with a policy refusal, the save with a 42501.
  const canConfigure = permissions.has('core.settings.write')

  const [{ data: students }, { data: classes }, { data: sections }, { data: settings }, doc] =
    await Promise.all([
      supabase
        .from('students')
        .select(
          'id, first_name, last_name, father_name, mother_name, admission_number, roll_number, admission_date, date_of_birth, left_on, photo_url, current_class_id, current_section_id'
        )
        .eq('school_id', schoolId)
        .eq('is_deleted', false)
        .order('first_name'),
      supabase
        .from('classes')
        .select('id, name, grade_levels(name)')
        .eq('school_id', schoolId)
        .eq('is_deleted', false),
      supabase
        .from('sections')
        .select('id, name')
        .eq('school_id', schoolId)
        .eq('is_deleted', false),
      supabase.from('certificate_settings').select('*').eq('school_id', schoolId).maybeSingle(),
      loadDocument(supabase, schoolId, school),
    ])

  // Only when the template actually prints one. Signing a URL per student for
  // a school of nine hundred costs a round trip nobody asked for when the
  // photo is switched off, which is the default.
  const photoUrls = settings?.show_photo
    ? await signedPhotoUrls(
        supabase,
        (students ?? []).map((s) => s.photo_url)
      )
    : new Map()

  // The serial the next issue will take. Read here rather than in the action
  // so the screen can show it before anybody commits -- and minted again
  // inside the action, because between loading this page and pressing the
  // button somebody else may have issued one.
  const { data: nextSerial } = await supabase.rpc('next_certificate_serial', {
    p_school: schoolId,
    p_prefix: settings?.serial_prefix || 'CERT',
  })

  const { data: recentRows } = await supabase
    .from('certificates_issued')
    .select('id, kind, issued_on, serial_no, students(first_name, last_name)')
    .eq('school_id', schoolId)
    .eq('is_deleted', false)
    .order('issued_on', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(8)

  const classById = new Map((classes ?? []).map((c) => [c.id, c.grade_levels?.name ?? c.name]))
  const sectionById = new Map((sections ?? []).map((s) => [s.id, s.name]))

  // Flattened here so the client component never has to join anything.
  const list = (students ?? []).map((s) => ({
    id: s.id,
    name: [s.first_name, s.last_name].filter(Boolean).join(' '),
    father_name: s.father_name,
    mother_name: s.mother_name,
    admission_number: s.admission_number,
    roll_number: s.roll_number,
    admission_date: s.admission_date,
    date_of_birth: s.date_of_birth,
    left_on: s.left_on,
    photoUrl: photoUrls.get(s.photo_url) ?? null,
    klass:
      [classById.get(s.current_class_id), sectionById.get(s.current_section_id)]
        .filter(Boolean)
        .join(' - ') || '—',
  }))

  const recent = (recentRows ?? []).map((r) => ({
    id: r.id,
    serialNo: r.serial_no,
    issuedOn: r.issued_on,
    kindLabel: KIND_LABEL[r.kind] ?? r.kind,
    studentName: [r.students?.first_name, r.students?.last_name].filter(Boolean).join(' ') || '—',
  }))

  return (
    <div className="flex flex-col gap-5">
      <div className="no-print flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>
            Certificates
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
            Pick a kind and a student, then issue. Each kind has its own wording; the layout and
            the letterhead are shared.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/school/settings?section=documents" className="btn btn-ghost">
            Letterhead &amp; stamps
          </Link>
          <RefreshButton />
        </div>
      </div>

      {!canWrite && (
        <p
          className="no-print rounded-xl px-4 py-3 text-sm"
          style={{ background: 'var(--amber-soft)', color: 'var(--amber-ink)' }}
        >
          Read-only — issuing a certificate records it against the student and needs the{' '}
          <strong>Certificates: Edit</strong> permission. Preview and print still work.
        </p>
      )}

      <CertificateClient
        students={list}
        doc={doc}
        nextSerial={nextSerial ?? '—'}
        recent={recent}
        settings={
          settings && {
            ...settings,
            logoUrl: publicUrl(settings.logo_url),
            backgroundUrl: publicUrl(settings.background_url),
            principalSignatureUrl: publicUrl(settings.principal_signature_url),
            signatorySignatureUrl: publicUrl(settings.signatory_signature_url),
            sealUrl: publicUrl(settings.seal_url),
            stampUrl: publicUrl(settings.stamp_url),
          }
        }
        schoolName={school?.school_name}
        settingsPanel={
          canConfigure ? (
            <CertificateSettingsPanel
              settings={settings}
              schoolName={school?.school_name}
              schoolId={schoolId}
              doc={doc}
            />
          ) : null
        }
      />
    </div>
  )
}
