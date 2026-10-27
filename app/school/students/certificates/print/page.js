import Link from 'next/link'
import { getSchoolContext } from '@/lib/school-context'
import { publicUrl, signedPhotoUrl } from '@/lib/storage'
import {
  CERTIFICATE_KINDS,
  certificateBody,
  certificateTitle,
  fillTokens,
  loadDocument,
  printDate,
  printDateTime,
} from '@/lib/documents'
import CertificateSheet from '@/components/print/certificate-sheet'
import { AutoPrint, CloseButton, PaperRule, PrintButton } from '@/components/print/print-now'

export const metadata = { title: 'Print Certificate' }

const KIND_LABEL = Object.fromEntries(CERTIFICATE_KINDS.map((k) => [k.id, k.label]))

// ?issued=<certificates_issued uuid>
//
// Rendered from the SNAPSHOT, not from the student record.
//
// This is the whole reason issuing writes a snapshot. A leaving certificate
// reprinted two years later must say what it said when it was signed -- the
// class the student was in then, the wording the school used then, the serial
// it was given then. Re-running the template against a live student record
// would quietly reissue a different document under the same serial number,
// and the copy in the board office would no longer match the copy in the file.
//
// The snapshot is only the TEXT. The letterhead, the stamps and the
// signatures come from today's settings on purpose: a school that changes
// principal reprints with the current principal's name, which is correct --
// the signature attests to the record, not to the day it was typed.
export default async function PrintCertificatePage({ searchParams }) {
  const params = await searchParams
  const issuedId = params?.issued ?? ''
  const auto = params?.auto === '1'

  const { schoolId, school, supabase } = await getSchoolContext()

  const [{ data: issued }, { data: settings }, doc] = await Promise.all([
    issuedId
      ? supabase
          .from('certificates_issued')
          .select(
            'id, kind, issued_on, serial_no, snapshot, students(first_name, last_name, father_name, mother_name, admission_number, roll_number, admission_date, date_of_birth, left_on, photo_url)'
          )
          .eq('school_id', schoolId)
          .eq('id', issuedId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('certificate_settings').select('*').eq('school_id', schoolId).maybeSingle(),
    loadDocument(supabase, schoolId, school),
  ])

  if (!issued) {
    return (
      <div className="card px-6 py-16 text-center" style={{ borderStyle: 'dashed' }}>
        <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
          Certificate not found
        </p>
        <p className="mx-auto mt-1 max-w-sm text-sm" style={{ color: 'var(--muted)' }}>
          It may have been removed, or it belongs to another school.
        </p>
        <Link href="/school/students/certificates" className="btn btn-primary mt-4">
          Back to certificates
        </Link>
      </div>
    )
  }

  const snap = issued.snapshot ?? {}
  const st = issued.students ?? {}
  const name = [st.first_name, st.last_name].filter(Boolean).join(' ')

  // A row written before snapshots existed has no body. Rather than printing
  // a blank sheet, the template is run against the record as it stands and
  // the page says so.
  const reconstructed = !snap.body
  const body = snap.body
    ? snap.body
    : fillTokens(certificateBody(settings, issued.kind), {
        student_name: name,
        father_name: st.father_name,
        mother_name: st.mother_name,
        class: snap.student?.class,
        roll_number: st.roll_number,
        admission_no: st.admission_number,
        admission_date: printDate(st.admission_date),
        date_of_birth: printDate(st.date_of_birth),
        leaving_date: printDate(st.left_on ?? issued.issued_on),
        issue_date: printDate(issued.issued_on),
        school_name: settings?.school_name ?? doc.name,
        serial_no: issued.serial_no,
      })

  const photoUrl = settings?.show_photo ? await signedPhotoUrl(supabase, st.photo_url) : null

  const cert = {
    kind: issued.kind,
    title: snap.title ?? certificateTitle(settings, issued.kind),
    body,
    serial: issued.serial_no ?? snap.serial_no,
    issueDate: issued.issued_on,
    logoUrl: publicUrl(settings?.logo_url),
    backgroundUrl: publicUrl(settings?.background_url),
    student: {
      name: snap.student?.name ?? name,
      fatherName: snap.student?.father_name ?? st.father_name,
      className: snap.student?.class ?? '—',
      rollNumber: snap.student?.roll_number ?? st.roll_number,
      admissionNumber: snap.student?.admission_number ?? st.admission_number,
      admissionDate: snap.student?.admission_date ?? st.admission_date,
      photoUrl,
    },
  }

  const effectiveSettings = settings && {
    ...settings,
    principalSignatureUrl: publicUrl(settings.principal_signature_url),
    signatorySignatureUrl: publicUrl(settings.signatory_signature_url),
    sealUrl: publicUrl(settings.seal_url),
    stampUrl: publicUrl(settings.stamp_url),
  }

  return (
    <div className="flex flex-col gap-4">
      <PaperRule
        paper={settings?.paper_size ?? 'a4'}
        landscape={settings?.orientation === 'landscape'}
      />

      <div className="no-print flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>
            {KIND_LABEL[issued.kind] ?? issued.kind} certificate
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
            {cert.student.name} · serial {cert.serial ?? '—'} · issued{' '}
            {printDate(issued.issued_on)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CloseButton label="Back" />
          <PrintButton label="Print" />
        </div>
      </div>

      {reconstructed && (
        <p
          className="no-print rounded-lg px-3 py-2 text-sm"
          style={{ background: 'var(--amber-soft)', color: 'var(--amber-ink)' }}
        >
          This certificate was recorded before the wording was being saved with it, so the text
          below is the current template applied to the student&rsquo;s current record — not
          necessarily what was handed over at the time.
        </p>
      )}

      <div className="doc-preview">
        <CertificateSheet
          cert={cert}
          settings={effectiveSettings ?? {}}
          doc={doc}
          printedAt={printDateTime()}
        />
      </div>

      <AutoPrint enabled={auto} />
    </div>
  )
}
