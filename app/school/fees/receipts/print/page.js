import Link from 'next/link'
import { getSchoolContext } from '@/lib/school-context'
import { loadDocument, printDateTime } from '@/lib/documents'
import { FEE_METHOD_LABEL, FEE_TYPE_LABEL, monthLabel, studentName } from '@/lib/fee-options'
import ReceiptSheet from '@/components/print/receipt-sheet'
import { PageBreak } from '@/components/print/document-sheet'
import { AutoPrint, CloseButton, PaperRule, PrintButton } from '@/components/print/print-now'

export const metadata = { title: 'Print Receipt' }

//   ?id=<payment uuid>      one receipt
//   ?ids=<uuid>,<uuid>      the day's takings, one sheet each
//   ?challan=<uuid>         every receipt that settled part of one challan
//
// A receipt is no longer one payment against one challan. A parent settling
// three overdue months and two ahead hands over one sum and gets one receipt,
// and the bills it cleared are listed on it. So the particulars come from the
// payment's allocations, and the balance printed on it is read off the ledger
// as at that receipt -- not recomputed from today, because a reprint must not
// contradict the copy the parent kept.
export default async function PrintReceiptPage({ searchParams }) {
  const params = await searchParams
  const ids = String(params?.ids ?? params?.id ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const challanId = params?.challan ?? ''
  const auto = params?.auto !== '0'

  const { schoolId, school, supabase } = await getSchoolContext()

  // fee_payment_allocations and fee_ledger are created by 029_fee_ledger.sql
  // and 030_fee_vouchers.sql, which are not applied everywhere yet. Naming a
  // table that does not exist fails the whole request, so each of the three
  // reads that depend on them goes through this: ask for the rich shape, and
  // on any error fall back to the one that has always worked. The receipt
  // then prints with one settled bill instead of five -- which is exactly
  // what a pre-ledger payment actually was.
  const tolerant = async (rich, plain) => {
    const result = await rich()
    if (!result.error) return { ...result, rich: true }
    return { ...(await plain()), rich: false }
  }

  const base = (select) => {
    let q = supabase
      .from('fee_payments')
      .select(select)
      .eq('school_id', schoolId)
      .eq('is_deleted', false)
    if (ids.length) q = q.in('id', ids)
    return q
  }

  const CORE =
    'id, challan_id, student_id, amount_paid, paid_at, method, reference, receipt_no, notes, received_by, students(first_name, last_name, father_name, guardian_name, admission_number, roll_number, current_class_id, current_section_id), fee_challans(challan_number, fee_type, period_month, net_amount, total_amount, amount, paid_amount)'
  const WITH_ALLOCATIONS = `${CORE}, fee_payment_allocations(amount, challan_id, fee_challans(challan_number, fee_type, period_month, period_from, period_to, net_amount, total_amount, amount))`

  // A payment reaches a challan through its allocations once 030 is applied.
  // The old column is still matched so receipts written before it still turn
  // up -- and when the table is absent, the old column is all there is.
  let allocationPaymentIds = []
  if (challanId) {
    const { data: viaAllocation } = await supabase
      .from('fee_payment_allocations')
      .select('payment_id')
      .eq('challan_id', challanId)
    allocationPaymentIds = [...new Set((viaAllocation ?? []).map((a) => a.payment_id))]
  }

  const forChallan = (q) => {
    if (!challanId) return q
    return allocationPaymentIds.length
      ? q.or(`challan_id.eq.${challanId},id.in.(${allocationPaymentIds.join(',')})`)
      : q.eq('challan_id', challanId)
  }

  const {
    data: payments,
    error,
  } = await tolerant(
    () => forChallan(base(WITH_ALLOCATIONS)).order('paid_at', { ascending: true }).limit(100),
    () => forChallan(base(CORE)).order('paid_at', { ascending: true }).limit(100)
  )

  const [{ data: classes }, { data: sections }, doc] = await Promise.all([
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
    loadDocument(supabase, schoolId, school),
  ])

  // Who took the money. A receipt signed "Accountant" when the cashier was
  // somebody else is the thing an audit picks up on, so the real name prints
  // where there is one.
  const takerIds = [...new Set((payments ?? []).map((p) => p.received_by).filter(Boolean))]
  const { data: takers } = takerIds.length
    ? await supabase.from('profiles').select('id, full_name').in('id', takerIds)
    : { data: [] }
  const takerById = new Map((takers ?? []).map((t) => [t.id, t.full_name]))

  // The balance as at EACH receipt, not today. A receipt reprinted after a
  // later instalment must still show the balance that was outstanding when it
  // was issued -- otherwise the reprint contradicts the original, and the
  // original is the one the parent kept.
  //
  // The ledger already holds every charge and payment in order, so running it
  // forward once gives the balance after each receipt. One query for the lot,
  // rather than asking the database for a running balance per payment.
  // Absent before 029_fee_ledger.sql, in which case the balance line is
  // simply left off the receipt rather than guessed at.
  const studentIds = [...new Set((payments ?? []).map((p) => p.student_id).filter(Boolean))]
  const { data: ledgerRows } = studentIds.length
    ? await supabase
        .from('fee_ledger')
        .select('student_id, entry_date, seq, amount, payment_id')
        .eq('school_id', schoolId)
        .eq('is_deleted', false)
        .in('student_id', studentIds)
    : { data: [] }
  // A failed read gives data: null, which the loop below already tolerates.

  const byStudentLedger = new Map()
  for (const e of ledgerRows ?? []) {
    const list = byStudentLedger.get(e.student_id) ?? []
    list.push(e)
    byStudentLedger.set(e.student_id, list)
  }

  // balanceAfter[paymentId] -- what the family owed the moment that receipt
  // was written. Negative means the school is holding their money.
  const balanceAfter = new Map()
  for (const list of byStudentLedger.values()) {
    list.sort(
      (a, b) =>
        String(a.entry_date).localeCompare(String(b.entry_date)) ||
        Number(a.seq) - Number(b.seq)
    )
    let running = 0
    for (const e of list) {
      running += Number(e.amount) || 0
      if (e.payment_id) balanceAfter.set(e.payment_id, running)
    }
  }

  const classById = new Map((classes ?? []).map((c) => [c.id, c.grade_levels?.name ?? c.name]))
  const sectionById = new Map((sections ?? []).map((s) => [s.id, s.name]))

  const receipts = (payments ?? []).map((p) => {
    const amount = Number(p.amount_paid) || 0

    // What this one payment cleared. A payment written before this module
    // existed has no allocations and names its challan directly, so that
    // case is folded in as a single settled bill.
    const allocations = (p.fee_payment_allocations ?? []).filter((a) => Number(a.amount) > 0)
    const legacy =
      !allocations.length && p.fee_challans
        ? [{ amount, challan_id: p.challan_id, fee_challans: p.fee_challans }]
        : []

    const settled = [...allocations, ...legacy].map((a) => {
      const c = a.fee_challans
      const from = c?.period_from ?? c?.period_month
      const to = c?.period_to ?? c?.period_month
      return {
        challanNumber: c?.challan_number ?? '—',
        periodLabel:
          from && to && from !== to
            ? `${monthLabel(from)} – ${monthLabel(to)}`
            : from
              ? monthLabel(from)
              : '—',
        typeLabel: FEE_TYPE_LABEL[c?.fee_type] ?? c?.fee_type ?? 'Fee',
        billed: Number(c?.net_amount ?? c?.total_amount ?? c?.amount) || 0,
        amount: Number(a.amount) || 0,
      }
    })

    const allocated = settled.reduce((sum, a) => sum + a.amount, 0)
    // Money received that no bill claimed: a deliberate advance, or change
    // after the last outstanding challan was cleared.
    const heldAsAdvance = Math.max(0, amount - allocated)
    const ch = settled[0]
    const typeLabel = ch?.typeLabel ?? 'Fee'
    const period = settled.length === 1 ? settled[0].periodLabel : null

    return {
      id: p.id,
      receiptNo: p.receipt_no,
      paidAt: p.paid_at,
      amount,
      methodLabel: FEE_METHOD_LABEL[p.method] ?? p.method ?? 'Cash',
      reference: p.reference,
      notes: p.notes,
      receivedByName: takerById.get(p.received_by) ?? null,
      // Whoever handed the money over. The guardian where one is recorded,
      // the father otherwise -- it is almost never the student.
      payerName:
        p.students?.guardian_name || p.students?.father_name || studentName(p.students) || '—',
      onAccountOf:
        settled.length > 1
          ? `fees against ${settled.length} challans`
          : settled.length === 1
            ? [typeLabel, period].filter(Boolean).join(' — ')
            : 'fees paid in advance',
      // What it cleared, line by line, which is the whole reason one receipt
      // can stand for five months of bills.
      settled,
      allocated,
      heldAsAdvance,
      challanNumber: settled.length === 1 ? settled[0].challanNumber : null,
      periodLabel: period ?? (settled.length > 1 ? `${settled.length} challans` : '—'),
      // Read off the ledger as at this receipt. Positive is owed, negative is
      // money the school is holding.
      balanceAfter: balanceAfter.has(p.id) ? balanceAfter.get(p.id) : null,
      student: {
        name: studentName(p.students) || '—',
        fatherName: p.students?.father_name,
        admissionNumber: p.students?.admission_number,
        rollNumber: p.students?.roll_number,
        className:
          [
            classById.get(p.students?.current_class_id),
            sectionById.get(p.students?.current_section_id),
          ]
            .filter(Boolean)
            .join(' - ') || '—',
      },
    }
  })

  const printedAt = printDateTime()

  return (
    <div className="flex flex-col gap-4">
      <PaperRule paper={doc.paper} />

      <div className="no-print flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>
            Print Receipt
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
            {receipts.length} receipt{receipts.length === 1 ? '' : 's'} · two copies per sheet
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CloseButton label="Back" />
          <PrintButton label="Print" disabled={receipts.length === 0} />
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

      {receipts.length === 0 ? (
        <div className="no-print card px-6 py-16 text-center" style={{ borderStyle: 'dashed' }}>
          <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            No receipt to print
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm" style={{ color: 'var(--muted)' }}>
            A receipt exists only once a payment has been recorded against a challan.
          </p>
          <Link href="/school/fees/collect" className="btn btn-primary mt-4">
            Collect a fee
          </Link>
        </div>
      ) : (
        <div className="doc-preview flex flex-col items-center gap-6">
          {receipts.map((r, i) => (
            <div key={r.id}>
              <ReceiptSheet receipt={r} doc={doc} printedAt={printedAt} />
              {i < receipts.length - 1 && <PageBreak />}
            </div>
          ))}
        </div>
      )}

      {receipts.length > 0 && <AutoPrint enabled={auto} />}
    </div>
  )
}
