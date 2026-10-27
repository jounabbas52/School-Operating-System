import Link from 'next/link'
import RefreshButton from '@/components/refresh-button'
import { getSchoolContext } from '@/lib/school-context'
import StudentPanel from '../students/student-panel'
import ApplicationPanel from './application-panel'
import RowActions from './row-actions'
import { STATUS_LABEL } from './pipeline'

export const metadata = { title: 'Admissions' }

// ADMISSIONS -- two ways in, and they are different on purpose.
//
//   The pipeline   somebody asks about a place, the school decides, and the
//                  accepted ones become pupils. Applied -> review ->
//                  accepted -> enrolled, with rejected off to the side.
//
//   Direct entry   a child who is simply joining. No pipeline, no decision
//                  to record: the student form, same as Students uses.
//
// The second exists because most admissions in a small school are not a
// process -- a parent arrives, the child starts on Monday -- and a screen
// that forces those through four states would be worked around within a week.
//
// What the pipeline will NOT do is write half a student. The pupil record is
// created at enrolment and not before, which is why the Enrol button opens
// the student form rather than flipping a status.

const TABS = [
  { id: 'open', label: 'Open', match: ['applied', 'review'] },
  { id: 'applied', label: 'Applied', match: ['applied'] },
  { id: 'review', label: 'In review', match: ['review'] },
  { id: 'accepted', label: 'Accepted', match: ['accepted'] },
  { id: 'enrolled', label: 'Enrolled', match: ['enrolled'] },
  { id: 'rejected', label: 'Rejected', match: ['rejected'] },
  { id: 'all', label: 'All', match: null },
]

const TONE = {
  applied: 'pill-blue',
  review: 'pill-amber',
  accepted: 'pill-brand',
  enrolled: 'pill-green',
  rejected: 'pill-red',
}

function Stat({ n, label, tone, hint }) {
  return (
    <div className="card flex items-center gap-3 p-4">
      <span
        className="flex size-10 shrink-0 items-center justify-center rounded-xl text-sm font-semibold"
        style={{ background: tone.bg, color: tone.ink }}
        aria-hidden="true"
      >
        {tone.icon}
      </span>
      <span className="min-w-0">
        <span className="block text-lg font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>
          {n}
        </span>
        <span className="block text-xs" style={{ color: 'var(--muted)' }}>
          {label}
        </span>
        {hint && (
          <span className="block text-[0.65rem]" style={{ color: 'var(--muted-2)' }}>
            {hint}
          </span>
        )}
      </span>
    </div>
  )
}

const stamp = (value) =>
  value
    ? new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—'

export default async function AdmissionsPage({ searchParams }) {
  const params = await searchParams
  const tabId = TABS.some((t) => t.id === params?.tab) ? params.tab : 'open'
  const tab = TABS.find((t) => t.id === tabId)

  const { schoolId, permissions, supabase } = await getSchoolContext()

  if (!permissions.has('admissions.read')) {
    return (
      <div className="flex flex-col gap-5">
        <h1 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>
          Admissions
        </h1>
        <div className="card px-6 py-16 text-center" style={{ borderStyle: 'dashed' }}>
          <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            Not available to you
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm" style={{ color: 'var(--muted)' }}>
            Admissions needs <strong>View</strong> on this page in your access list.
          </p>
          <Link href="/school" className="btn btn-ghost mt-4">
            Back to dashboard
          </Link>
        </div>
      </div>
    )
  }

  const canWrite = permissions.has('admissions.write')
  const canAdmit = permissions.has('students.write')

  const [{ data: applications, error }, { data: classes }, { data: sections }, { data: last }] =
    await Promise.all([
      supabase
        .from('admission_inquiries')
        .select(
          'id, application_no, applicant_name, father_name, applicant_phone, applicant_email, date_of_birth, gender, previous_school, address, class_id, section_id, inquiry_date, status, notes, student_id, decided_on, decision_note'
        )
        .eq('school_id', schoolId)
        .eq('is_deleted', false)
        .order('inquiry_date', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase
        .from('classes')
        .select('id, name, grade_levels(name)')
        .eq('school_id', schoolId)
        .eq('is_deleted', false)
        .order('name'),
      supabase
        .from('sections')
        .select('id, name, class_id')
        .eq('school_id', schoolId)
        .eq('is_deleted', false)
        .order('name'),
      // The student form wants the next serial, the same way Students gives
      // it. Read here so both doors open the same form in the same state.
      supabase
        .from('students')
        .select('serial_number')
        .eq('school_id', schoolId)
        .order('serial_number', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

  const rows = applications ?? []
  const visible = tab.match ? rows.filter((r) => tab.match.includes(r.status)) : rows

  const count = (status) => rows.filter((r) => r.status === status).length

  const classOptions = (classes ?? []).map((c) => ({
    id: c.id,
    label: c.grade_levels?.name ? `${c.grade_levels.name} — ${c.name}` : c.name,
  }))
  const sectionOptions = (sections ?? []).map((s) => ({
    id: s.id,
    label: s.name,
    class_id: s.class_id,
  }))
  const classLabel = Object.fromEntries(classOptions.map((c) => [c.id, c.label]))

  const nextSerial = (last?.serial_number ?? 0) + 1

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>
            Admissions
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
            Applications from first enquiry to enrolled pupil — and a direct door for a child who
            is simply joining.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <RefreshButton />
          {canAdmit && classOptions.length > 0 && (
            <StudentPanel
              classes={classOptions}
              sections={sectionOptions}
              nextSerial={nextSerial}
              schoolId={schoolId}
              trigger={{ label: 'Admit a student directly', className: 'btn btn-ghost' }}
            />
          )}
          {canWrite && (
            <ApplicationPanel
              classes={classOptions}
              trigger={{ label: '+ New application', className: 'btn btn-primary' }}
            />
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          n={count('applied') + count('review')}
          label="Open applications"
          hint="Waiting on the school"
          tone={{ bg: 'var(--blue-soft)', ink: 'var(--blue-ink)', icon: '◷' }}
        />
        <Stat
          n={count('review')}
          label="In review"
          tone={{ bg: 'var(--amber-soft)', ink: 'var(--amber-ink)', icon: '◎' }}
        />
        <Stat
          n={count('accepted')}
          label="Accepted"
          hint="Not yet enrolled"
          tone={{ bg: 'var(--brand-soft)', ink: 'var(--brand-ink)', icon: '✓' }}
        />
        <Stat
          n={count('enrolled')}
          label="Enrolled"
          hint="Now pupils"
          tone={{ bg: 'var(--green-soft)', ink: 'var(--green-ink)', icon: '🎓' }}
        />
      </div>

      {error && (
        <p
          className="rounded-lg px-3 py-2 text-sm"
          style={{ background: 'var(--red-soft)', color: 'var(--red-ink)' }}
        >
          {error.message}
        </p>
      )}

      {classOptions.length === 0 && (
        <p
          className="rounded-lg px-3 py-2 text-sm"
          style={{ background: 'var(--amber-soft)', color: 'var(--amber-ink)' }}
        >
          There are no classes yet, so nobody can be enrolled into one. Create them under{' '}
          <Link href="/school/academics/classes" style={{ color: 'var(--amber-ink)' }}>
            <strong>Academic Setup → Classes</strong>
          </Link>{' '}
          first. Applications can still be taken in the meantime.
        </p>
      )}

      {/* ------------------------------------------------------------- tabs */}
      <div className="flex flex-wrap items-center gap-1.5">
        {TABS.map((t) => {
          const n = t.match ? rows.filter((r) => t.match.includes(r.status)).length : rows.length
          return (
            <Link
              key={t.id}
              href={t.id === 'open' ? '/school/admissions' : `/school/admissions?tab=${t.id}`}
              className={`tab ${t.id === tabId ? 'tab-on' : ''}`}
            >
              {t.label}
              <span className="ml-1.5 tabular-nums" style={{ opacity: 0.7 }}>
                {n}
              </span>
            </Link>
          )
        })}
      </div>

      {/* ----------------------------------------------------------- the list */}
      {!visible.length ? (
        <div className="card px-6 py-14 text-center" style={{ borderStyle: 'dashed' }}>
          <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            {rows.length ? `Nothing ${tab.label.toLowerCase()}` : 'No applications yet'}
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm" style={{ color: 'var(--muted)' }}>
            {rows.length
              ? 'Every application is in another column. The tabs above count them.'
              : 'Take one with New application when somebody enquires — a name is enough to start. A child who is simply joining can skip all of this: admit them directly.'}
          </p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table min-w-[52rem]">
            <thead>
              <tr>
                <th>Application</th>
                <th>Applicant</th>
                <th>Contact</th>
                <th>Class</th>
                <th>Applied</th>
                <th>Status</th>
                <th className="!text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.id}>
                  <td>
                    <code className="font-mono text-[0.72rem]" style={{ color: 'var(--muted)' }}>
                      {row.application_no ?? '—'}
                    </code>
                  </td>

                  <td style={{ color: 'var(--ink)' }}>
                    {row.applicant_name}
                    {row.father_name && (
                      <span className="block text-[0.68rem]" style={{ color: 'var(--muted-2)' }}>
                        c/o {row.father_name}
                      </span>
                    )}
                  </td>

                  <td style={{ color: 'var(--muted)' }}>
                    {row.applicant_phone || row.applicant_email || '—'}
                  </td>

                  <td style={{ color: 'var(--muted)' }}>
                    {row.class_id ? (classLabel[row.class_id] ?? '—') : 'undecided'}
                  </td>

                  <td style={{ color: 'var(--muted)' }}>{stamp(row.inquiry_date)}</td>

                  <td>
                    <span className={`pill ${TONE[row.status] ?? 'pill-muted'}`}>
                      {STATUS_LABEL[row.status] ?? row.status}
                    </span>
                    {row.decision_note && (
                      <span
                        className="block max-w-[14rem] truncate text-[0.65rem]"
                        style={{ color: 'var(--muted-2)' }}
                        title={row.decision_note}
                      >
                        {row.decision_note}
                      </span>
                    )}
                  </td>

                  <td>
                    <RowActions
                      row={row}
                      classes={classOptions}
                      sections={sectionOptions}
                      nextSerial={nextSerial}
                      schoolId={schoolId}
                      canWrite={canWrite && (row.status !== 'accepted' || canAdmit)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-col gap-1.5 text-xs" style={{ color: 'var(--muted)' }}>
        <p>
          <strong>Enrolling writes the student record.</strong> An accepted applicant becomes a
          pupil through the same form Students uses, filled in with what the application already
          knows. Until then no student exists — which is what keeps &ldquo;how many pupils do we
          have&rdquo; answerable.
        </p>
        <p>
          <strong>Rejecting keeps the record</strong>, with the reason against it, so the school can
          answer when the family asks or applies again. Discard is for duplicates and mistakes.
        </p>
      </div>
    </div>
  )
}
