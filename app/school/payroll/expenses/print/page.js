import Link from 'next/link'
import { getSchoolContext } from '@/lib/school-context'
import { loadDocument, printDateTime } from '@/lib/documents'
import {
  EXPENSE_CATEGORY_LABEL,
  EXPENSE_STATUS_LABEL,
} from '@/lib/payroll-options'
// expenses.payment_method is the payment_method enum, and FEE_METHOD_LABEL is
// the list written against that enum -- PAYMENT_MODE_LABEL in staff-options
// is the subset HR offers for salaries and has no entry for 'card'.
import { FEE_METHOD_LABEL } from '@/lib/fee-options'
import VoucherSheet from '@/components/print/voucher-sheet'
import { PageBreak } from '@/components/print/document-sheet'
import { AutoPrint, CloseButton, PaperRule, PrintButton } from '@/components/print/print-now'

export const metadata = { title: 'Print Voucher' }

//   ?id=<uuid>                 one voucher
//   ?ids=<uuid>,<uuid>         a batch, one sheet each
//   ?category=…&status=…       everything matching, which is how a month's
//                              vouchers get filed
export default async function PrintVoucherPage({ searchParams }) {
  const params = await searchParams
  const ids = String(params?.ids ?? params?.id ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const categoryFilter = params?.category ?? ''
  const statusFilter = params?.status ?? ''
  const auto = params?.auto !== '0'

  const { schoolId, school, supabase } = await getSchoolContext()

  let query = supabase
    .from('expenses')
    .select(
      'id, title, category, amount, expense_date, vendor, paid_to, bill_no, voucher_no, payment_method, description, notes, status, created_by, approved_by'
    )
    .eq('school_id', schoolId)
    .eq('is_deleted', false)

  if (ids.length) query = query.in('id', ids)
  if (categoryFilter) query = query.eq('category', categoryFilter)
  if (statusFilter) query = query.eq('status', statusFilter)

  const { data: rows, error } = await query
    .order('expense_date', { ascending: false })
    .limit(100)

  const doc = await loadDocument(supabase, schoolId, school)

  // Who prepared and who approved. Printing "Accountant" over a line when the
  // database knows the actual name is the sort of thing that makes a voucher
  // worth less than the paper.
  const people = [
    ...new Set((rows ?? []).flatMap((r) => [r.created_by, r.approved_by]).filter(Boolean)),
  ]
  const { data: profiles } = people.length
    ? await supabase.from('profiles').select('id, full_name').in('id', people)
    : { data: [] }
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]))

  const vouchers = (rows ?? []).map((e) => ({
    id: e.id,
    title: 'PAYMENT VOUCHER',
    voucherNo: e.voucher_no,
    date: e.expense_date,
    paidTo: e.paid_to || e.vendor || '—',
    vendor: e.vendor,
    billNo: e.bill_no,
    categoryLabel: EXPENSE_CATEGORY_LABEL[e.category] ?? e.category,
    methodLabel: FEE_METHOD_LABEL[e.payment_method] ?? e.payment_method ?? 'Cash',
    status: e.status,
    statusLabel: EXPENSE_STATUS_LABEL[e.status] ?? e.status,
    amount: Number(e.amount) || 0,
    notes: e.notes || e.description,
    preparedByName: nameById.get(e.created_by) ?? null,
    approvedByName: nameById.get(e.approved_by) ?? null,
    lines: [
      {
        label: e.title || EXPENSE_CATEGORY_LABEL[e.category] || 'Expense',
        note: e.description && e.description !== e.title ? e.description : null,
        amount: Number(e.amount) || 0,
      },
    ],
  }))

  const printedAt = printDateTime()

  return (
    <div className="flex flex-col gap-4">
      <PaperRule paper={doc.paper} />

      <div className="no-print flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>
            Print Voucher
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
            {vouchers.length} voucher{vouchers.length === 1 ? '' : 's'} · two copies per sheet
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CloseButton label="Back" />
          <PrintButton label="Print" disabled={vouchers.length === 0} />
        </div>
      </div>

      {error && (
        <p
          className="no-print rounded-lg px-3 py-2 text-sm"
          style={{ background: 'var(--red-soft)', color: 'var(--red-ink)' }}
        >
          {error.message}
        </p>
      )}

      {vouchers.length === 0 ? (
        <div className="no-print card px-6 py-16 text-center" style={{ borderStyle: 'dashed' }}>
          <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            Nothing to print
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm" style={{ color: 'var(--muted)' }}>
            No expense matched. Go back and pick one.
          </p>
          <Link href="/school/payroll/expenses" className="btn btn-primary mt-4">
            Back to expenses
          </Link>
        </div>
      ) : (
        <div className="doc-preview flex flex-col items-center gap-6">
          {vouchers.map((v, i) => (
            <div key={v.id}>
              <VoucherSheet voucher={v} doc={doc} printedAt={printedAt} />
              {i < vouchers.length - 1 && <PageBreak />}
            </div>
          ))}
        </div>
      )}

      {vouchers.length > 0 && <AutoPrint enabled={auto} />}
    </div>
  )
}
