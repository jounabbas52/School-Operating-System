import Link from 'next/link'
import { getSchoolContext } from '@/lib/school-context'
import RefreshButton from '@/components/refresh-button'
import ChallanForm from './challan-form'

export const metadata = { title: 'Create Challan' }

export default async function CreateChallanPage() {
  const { schoolId, school, permissions, supabase } = await getSchoolContext()
  const canWrite = permissions.has('fees.write')

  const [{ data: classes }, { data: sections }, { data: students }, { data: policies }] =
    await Promise.all([
      supabase
        .from('classes')
        .select('id, name, grade_levels(name, ordinal)')
        .eq('school_id', schoolId)
        .eq('is_deleted', false),
      supabase
        .from('sections')
        .select('id, name, class_id')
        .eq('school_id', schoolId)
        .eq('is_deleted', false),
      supabase
        .from('students')
        .select(
          'id, first_name, last_name, admission_number, final_fee, base_fee, current_class_id, current_section_id'
        )
        .eq('school_id', schoolId)
        .eq('is_deleted', false)
        .eq('status', 'active')
        .order('first_name'),
      supabase
        .from('fee_policies')
        .select('id, name, class_id, tuition_fee, admission_fee, exam_fee, transport_fee, other_fee')
        .eq('school_id', schoolId)
        .eq('is_deleted', false)
        .eq('status', 'active'),
    ])

  const classOptions = (classes ?? [])
    .sort((a, b) => (a.grade_levels?.ordinal ?? 999) - (b.grade_levels?.ordinal ?? 999))
    .map((c) => ({ id: c.id, label: c.grade_levels?.name ?? c.name }))

  const sectionOptions = (sections ?? []).map((s) => ({
    id: s.id,
    label: s.name,
    class_id: s.class_id,
  }))

  const studentOptions = (students ?? []).map((s) => ({
    id: s.id,
    label: [s.first_name, s.last_name].filter(Boolean).join(' '),
    class_id: s.current_class_id,
    section_id: s.current_section_id,
    admission_number: s.admission_number,
    // The student's own fee is what the form defaults the amount to, so a
    // scholarship is honoured without anyone looking it up.
    fee: Number(s.final_fee) || Number(s.base_fee) || 0,
  }))

  const policyByClass = Object.fromEntries(
    (policies ?? []).filter((p) => p.class_id).map((p) => [p.class_id, p])
  )

  if (!canWrite) {
    return (
      <div className="flex flex-col gap-5">
        <h1 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>
          Create Challan
        </h1>
        <div className="card px-6 py-16 text-center" style={{ borderStyle: 'dashed' }}>
          <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            Read-only access
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm" style={{ color: 'var(--muted)' }}>
            Issuing challans needs the Fees write permission.
          </p>
          <Link href="/school/fees/challans" className="btn btn-primary mt-4">
            View challans
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>
            Create Challan
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
            Generate fee challans for individual students or entire classes
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <RefreshButton />
          <Link href="/school/fees/challans" className="btn btn-ghost">
            View All Challans
          </Link>
        </div>
      </div>

      <ChallanForm
        schoolName={school?.school_name ?? 'School Management System'}
        classes={classOptions}
        sections={sectionOptions}
        students={studentOptions}
        policyByClass={policyByClass}
      />
    </div>
  )
}
