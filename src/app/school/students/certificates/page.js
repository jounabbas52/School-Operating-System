import { getSchoolContext } from '@/lib/school-context'
import { publicUrl } from '@/lib/storage'
import CertificateClient from './certificate-client'
import CertificateSettingsPanel from './certificate-settings-panel'

export const metadata = { title: 'Certificates' }

export default async function CertificatesPage() {
  const { schoolId, school, supabase } = await getSchoolContext()

  const [{ data: students }, { data: classes }, { data: sections }, { data: settings }] =
    await Promise.all([
      supabase
        .from('students')
        .select(
          'id, first_name, last_name, father_name, admission_number, roll_number, admission_date, current_class_id, current_section_id'
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
    ])

  const classById = new Map((classes ?? []).map((c) => [c.id, c.grade_levels?.name ?? c.name]))
  const sectionById = new Map((sections ?? []).map((s) => [s.id, s.name]))

  // Flattened here so the client component never has to join anything.
  const list = (students ?? []).map((s) => ({
    id: s.id,
    name: [s.first_name, s.last_name].filter(Boolean).join(' '),
    father_name: s.father_name,
    admission_number: s.admission_number,
    roll_number: s.roll_number,
    admission_date: s.admission_date,
    klass:
      [classById.get(s.current_class_id), sectionById.get(s.current_section_id)]
        .filter(Boolean)
        .join(' - ') || '—',
  }))

  return (
    <div className="flex flex-col gap-5">
      <div className="no-print">
        <h1 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>
          Certificates
        </h1>
        <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
          Pick a type and a student, then print. The template is shared across the school.
        </p>
      </div>

      <CertificateClient
        students={list}
        settings={
          settings && {
            ...settings,
            logoUrl: publicUrl(settings.logo_url),
            backgroundUrl: publicUrl(settings.background_url),
            principalSignatureUrl: publicUrl(settings.principal_signature_url),
            signatorySignatureUrl: publicUrl(settings.signatory_signature_url),
          }
        }
        schoolName={school?.school_name}
        settingsPanel={
          <CertificateSettingsPanel
            settings={settings}
            schoolName={school?.school_name}
            schoolId={schoolId}
          />
        }
      />
    </div>
  )
}
