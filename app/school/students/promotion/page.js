import RefreshButton from '@/components/refresh-button'
import Link from 'next/link'
import { getSchoolContext } from '@/lib/school-context'
import PromotionBoard from './promotion-board'

export const metadata = { title: 'Student Promotion' }

const fullName = (s) => [s.first_name, s.last_name].filter(Boolean).join(' ')

export default async function PromotionPage({ searchParams }) {
  const params = await searchParams
  const { schoolId, permissions, supabase } = await getSchoolContext()
  const canWrite = permissions.has('students.write')

  const [{ data: sessions }, { data: classes }, { data: sections }] = await Promise.all([
    supabase
      .from('sessions')
      .select('id, name, is_current, start_date')
      .eq('school_id', schoolId)
      .eq('is_deleted', false)
      .order('start_date', { ascending: false }),
    supabase
      .from('classes')
      .select('id, name, session_id, grade_levels(name, ordinal)')
      .eq('school_id', schoolId)
      .eq('is_deleted', false),
    supabase
      .from('sections')
      .select('id, name, class_id')
      .eq('school_id', schoolId)
      .eq('is_deleted', false)
      .order('name'),
  ])

  const active = sessions?.find((s) => s.is_current) ?? null
  const fromSession = params?.from ?? active?.id ?? ''
  const toSession = params?.to ?? ''
  const fromClass = params?.from_class ?? ''
  const toClass = params?.to_class ?? ''
  const toSection = params?.to_section ?? ''

  const classLabel = (c) => c.grade_levels?.name ?? c.name
  const byOrdinal = (a, b) =>
    (a.grade_levels?.ordinal ?? 999) - (b.grade_levels?.ordinal ?? 999)

  const fromClasses = (classes ?? []).filter((c) => c.session_id === fromSession).sort(byOrdinal)
  const toClasses = (classes ?? []).filter((c) => c.session_id === toSession).sort(byOrdinal)
  const toSections = (sections ?? []).filter((s) => s.class_id === toClass)

  // Students are read from the enrolment row for the outgoing session, not
  // from students.current_class_id -- promoting last year's cohort must look
  // at where they sat THAT year.
  let students = []
  if (fromSession && fromClass) {
    const { data } = await supabase
      .from('student_enrollments')
      .select(
        'student_id, section_id, students(id, first_name, last_name, father_name, admission_number, status)'
      )
      .eq('school_id', schoolId)
      .eq('session_id', fromSession)
      .eq('class_id', fromClass)
      .eq('status', 'active')

    const sectionById = new Map((sections ?? []).map((s) => [s.id, s.name]))

    students = (data ?? [])
      .filter((r) => r.students && r.students.status === 'active')
      .map((r) => ({
        id: r.student_id,
        name: fullName(r.students),
        father_name: r.students.father_name,
        admission_number: r.students.admission_number,
        section: sectionById.get(r.section_id) ?? null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  const ready = fromSession && toSession && fromClass && toClass && fromSession !== toSession

  return (
    <div className="flex flex-col gap-5">
      <div
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl px-5 py-4"
        style={{ background: 'var(--brand-grad)' }}
      >
        <div>
          <h1 className="text-base font-semibold text-white">Student Promotion</h1>
          <p className="mt-0.5 text-sm text-white/80">
            Promote, retain, graduate or transfer students between sessions
          </p>
        </div>
        {/* On the gradient band, so the ghost styling would vanish into it. */}
        <RefreshButton className="btn border border-white/25 bg-white/15 text-white hover:bg-white/25" />
      </div>

      {/* --------------------------------------------------- session picker */}
      <form className="card flex flex-wrap items-end gap-3 p-4">
        <div>
          <span className="label">From session</span>
          <select name="from" defaultValue={fromSession} className="field w-auto min-w-40">
            <option value="">Select…</option>
            {sessions?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.is_current ? ' (active)' : ''}
              </option>
            ))}
          </select>
        </div>

        <span className="pb-2 text-lg" style={{ color: 'var(--muted-2)' }} aria-hidden="true">
          →
        </span>

        <div>
          <span className="label">To session</span>
          <select name="to" defaultValue={toSession} className="field w-auto min-w-40">
            <option value="">Select…</option>
            {sessions?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <span className="label">From class</span>
          <select name="from_class" defaultValue={fromClass} className="field w-auto min-w-44">
            <option value="">Select…</option>
            {fromClasses.map((c) => (
              <option key={c.id} value={c.id}>
                {classLabel(c)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <span className="label">To class</span>
          <select name="to_class" defaultValue={toClass} className="field w-auto min-w-44">
            <option value="">Select…</option>
            {toClasses.map((c) => (
              <option key={c.id} value={c.id}>
                {classLabel(c)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <span className="label">To section</span>
          <select name="to_section" defaultValue={toSection} className="field w-auto min-w-28">
            <option value="">—</option>
            {toSections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <button className="btn btn-primary">Load students</button>
      </form>

      {sessions && sessions.length < 2 && (
        <p
          className="rounded-lg px-3 py-2 text-sm"
          style={{ background: 'var(--amber-soft)', color: 'var(--amber-ink)' }}
        >
          Promotion moves students between two sessions, and only one exists.{' '}
          <Link href="/school/academics/sessions" className="underline underline-offset-4">
            Create next year&rsquo;s session
          </Link>{' '}
          first.
        </p>
      )}

      {!canWrite ? (
        <div className="card px-6 py-14 text-center">
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            You have read-only access to students, so promotion is unavailable.
          </p>
        </div>
      ) : !ready ? (
        <div className="card px-6 py-14 text-center" style={{ borderStyle: 'dashed' }}>
          <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            Choose both sessions and both classes
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm" style={{ color: 'var(--muted)' }}>
            Promotion reads each student&rsquo;s enrolment row for the outgoing session, so it needs
            to know which class they are leaving and which they are joining.
          </p>
        </div>
      ) : students.length === 0 ? (
        <div className="card px-6 py-14 text-center" style={{ borderStyle: 'dashed' }}>
          <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            No active students in that class for the selected session
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm" style={{ color: 'var(--muted)' }}>
            They may already have been promoted, or nobody was enrolled there that year.
          </p>
        </div>
      ) : (
        <PromotionBoard
          students={students}
          fromSession={fromSession}
          toSession={toSession}
          toClass={toClass}
          toSection={toSection}
        />
      )}

      <p className="text-xs" style={{ color: 'var(--muted)' }}>
        Applying closes the outgoing enrolment row with its outcome and, for promoted students,
        opens a new one in the target class. Nothing is deleted, so last year stays readable.
      </p>
    </div>
  )
}
