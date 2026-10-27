import Link from 'next/link'
import { getSchoolContext } from '@/lib/school-context'
import { loadDocument, printDateTime } from '@/lib/documents'
import { staffName } from '@/lib/staff-options'
import { monthLabel, runMonth, toPayslip } from '@/lib/payroll-options'
import PayslipSheet from '@/components/print/payslip-sheet'
import { PageBreak } from '@/components/print/document-sheet'
import { AutoPrint, CloseButton, PaperRule, PrintButton } from '@/components/print/print-now'

export const metadata = { title: 'Print Salary Slips' }

// Two slips to a sheet, which halves the paper a payroll run costs. The pair
// is a deliberate pack size rather than "as many as fit": a slip is cut out
// and handed to one person, and three to a page leaves strips too narrow to
// hold.
const PER_SHEET = 2

export default async function PrintSlipsPage({ searchParams }) {
  const params = await searchParams
  const now = new Date()
  const year = Number(params?.year) || now.getFullYear()
  const month = Number(params?.month) || now.getMonth() + 1
  const only = String(params?.staff ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const auto = params?.auto !== '0'

  const { schoolId, school, supabase } = await getSchoolContext()
  const period = runMonth(year, month)

  const { data: run } = await supabase
    .from('payroll_runs')
    .select('id, run_month, status')
    .eq('school_id', schoolId)
    .eq('run_month', period)
    .maybeSingle()

  let items = []
  if (run) {
    let query = supabase
      .from('payroll_items')
      .select(
        'id, staff_id, basic_salary, allowances, gross_amount, working_days, present_days, absent_days, half_days, leave_days, late_marks, absence_amount, eobi_amount, pf_amount, tax_amount, deduction_amount, net_amount, payment_mode, status, remarks, staff(first_name, last_name, staff_number, designation, department, payment_mode, bank_name, account_number)'
      )
      .eq('school_id', schoolId)
      .eq('payroll_run_id', run.id)
      .eq('is_deleted', false)

    if (only.length) query = query.in('staff_id', only)

    const { data } = await query
    // Alphabetical, because the stack gets handed out by name.
    items = (data ?? []).sort((a, b) => staffName(a.staff).localeCompare(staffName(b.staff)))
  }

  const doc = await loadDocument(supabase, schoolId, school)
  const slips = items.map((i) => toPayslip(i, { period }))
  const printedAt = printDateTime()

  const sheets = []
  for (let i = 0; i < slips.length; i += PER_SHEET) sheets.push(slips.slice(i, i + PER_SHEET))

  return (
    <div className="flex flex-col gap-4">
      <PaperRule paper={doc.paper} />

      <div className="no-print flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>
            Print Salary Slips
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
            {monthLabel(period)} · {slips.length} slip{slips.length === 1 ? '' : 's'} on{' '}
            {sheets.length} sheet{sheets.length === 1 ? '' : 's'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CloseButton label="Back" />
          <PrintButton label="Print" disabled={slips.length === 0} />
        </div>
      </div>

      {slips.length === 0 ? (
        <div className="no-print card px-6 py-16 text-center" style={{ borderStyle: 'dashed' }}>
          <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            Nothing to print
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm" style={{ color: 'var(--muted)' }}>
            Payroll for {monthLabel(period)} has not been generated — a slip is a view of a
            payroll row, not a separate record.
          </p>
          <Link
            href={`/school/payroll/run?year=${year}&month=${month}`}
            className="btn btn-primary mt-4"
          >
            Go to Payroll Run
          </Link>
        </div>
      ) : (
        <div className="doc-preview flex flex-col items-center gap-6">
          {sheets.map((group, i) => (
            <div key={group[0]?.id ?? i}>
              <PayslipSheet slips={group} doc={doc} printedAt={printedAt} />
              {i < sheets.length - 1 && <PageBreak />}
            </div>
          ))}
        </div>
      )}

      {slips.length > 0 && <AutoPrint enabled={auto} />}
    </div>
  )
}
