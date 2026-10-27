import Link from 'next/link'
import { getSchoolContext } from '@/lib/school-context'
import { loadDocument, printDateTime } from '@/lib/documents'
import {
  FEE_TYPE_LABEL,
  effectiveStatus,
  monthLabel,
  remaining,
  studentName,
} from '@/lib/fee-options'
import ChallanSheet, { challanLandscape } from '@/components/print/challan-sheet'
import { PageBreak } from '@/components/print/document-sheet'
import { AutoPrint, CloseButton, PaperRule, PrintButton } from '@/components/print/print-now'

export const metadata = { title: 'Print Challans' }

// One route for one challan and for four hundred.
//
//   ?id=<uuid>                       the slip the clerk just raised
//   ?ids=<uuid>,<uuid>,…             a hand-picked set from the list screen
//   ?class=<uuid>&month=YYYY-MM-01   a whole class, which is how a month's
//                                    challans are actually distributed
//
// A separate "bulk print" screen would be the same query with the same
// renderer, so there is one of each. Everything is printed from the stored
// row -- see the comment at the top of components/print/challan-sheet.js on
// why nothing is recomputed.
// A voucher spanning five months has to say so on its face. "January 2027"
// on a bill covering January to May is how a parent ends up believing they
// paid for one month.
function periodSpan(c) {
  const from = c.period_from ?? c.period_month
  const to = c.period_to ?? c.period_month
  if (!from) return '—'
  if (!to || from === to) return monthLabel(from)
  return `${monthLabel(from)} – ${monthLabel(to)}`
}

export default async function PrintChallansPage({ searchParams }) {
  const params = await searchParams
  const ids = String(params?.ids ?? params?.id ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const classFilter = params?.class ?? ''
  const typeFilter = params?.type ?? ''
  const monthFilter = params?.month ?? ''
  const statusFilter = params?.status ?? ''
  const auto = params?.auto !== '0'

  const { schoolId, school, supabase } = await getSchoolContext()

  // `*` rather than a column list, deliberately.
  //
  // The voucher columns this sheet prints when they are there --
  // period_from/period_to, previous_balance, credit_applied, payable -- are
  // added by 030_fee_vouchers.sql, which is not applied everywhere yet. Named
  // explicitly, PostgREST rejects the whole SELECT with a 400 on any database
  // that predates it and the print screen dies; with `*` the columns simply
  // do not come back, and every reader below already falls back. Printing a
  // challan is not a place to be clever about bandwidth.
  let query = supabase
    .from('fee_challans')
    .select('*, students(first_name, last_name, father_name, admission_number, roll_number)')
    .eq('school_id', schoolId)
    .eq('is_deleted', false)

  if (ids.length) query = query.in('id', ids)
  if (classFilter) query = query.eq('class_id', classFilter)
  if (typeFilter) query = query.eq('fee_type', typeFilter)
  if (monthFilter) query = query.eq('period_month', monthFilter)

  // A print job is a stack of paper somebody has to carry. Five hundred
  // challans is fourteen reams and a browser that stops responding, so the
  // cap is deliberate and the page says when it bit.
  const LIMIT = 200

  const { data: rows, error } = await query
    .order('issued_date', { ascending: false })
    .limit(LIMIT + 1)

  // The particulars. A voucher covering January to May has five of these,
  // and the parent needs to see which months they are paying for -- that is
  // the difference between a bill and a demand for money.
  const challanIdsOnPage = (rows ?? []).map((c) => c.id)

  const [{ data: classes }, { data: sections }, { data: itemRows }, doc] = await Promise.all([
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
    // Same reason as above for `*`, and no .order(): ordering by a column
    // 030 adds would fail on a database that has not had it yet. The lines
    // are sorted below instead, where a missing field is just undefined.
    challanIdsOnPage.length
      ? supabase
          .from('fee_challan_items')
          .select('*')
          .in('challan_id', challanIdsOnPage)
          .eq('is_deleted', false)
      : Promise.resolve({ data: [] }),
    loadDocument(supabase, schoolId, school),
  ])

  const itemsByChallan = new Map()
  for (const it of itemRows ?? []) {
    const list = itemsByChallan.get(it.challan_id) ?? []
    list.push(it)
    itemsByChallan.set(it.challan_id, list)
  }
  // Chronological, so a five-month voucher reads January first. Sorted on a
  // field that may not exist, which is why it is a string compare on a
  // coalesced value rather than a date subtraction.
  for (const list of itemsByChallan.values()) {
    list.sort((a, b) => String(a.period_month ?? '').localeCompare(String(b.period_month ?? '')))
  }

  const classById = new Map((classes ?? []).map((c) => [c.id, c.grade_levels?.name ?? c.name]))
  const sectionById = new Map((sections ?? []).map((s) => [s.id, s.name]))

  const now = new Date()
  const all = (rows ?? []).map((c) => ({ ...c, state: effectiveStatus(c, now) }))
  const kept = statusFilter ? all.filter((c) => c.state === statusFilter) : all
  const truncated = kept.length > LIMIT
  const list = kept.slice(0, LIMIT)

  // The ?ids= order is the order the user picked them in; Postgres has no
  // reason to honour it, so it is restored here. Printing a hand-picked set
  // in a different order than it was selected is the kind of small wrongness
  // that costs somebody ten minutes at a sorting table.
  if (ids.length) {
    const rank = new Map(ids.map((id, i) => [id, i]))
    list.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0))
  }

  const challans = list.map((c) => {
    const net = Number(c.net_amount ?? c.total_amount ?? c.amount) || 0
    const base = Number(c.amount) || 0

    return {
      id: c.id,
      number: c.challan_number,
      issuedDate: c.issued_date,
      dueDate: c.due_date,
      periodLabel: periodSpan(c),
      feeTypeLabel: FEE_TYPE_LABEL[c.fee_type] ?? c.fee_type,
      description: c.description,
      status: c.state,
      // The particulars, off the challan's own lines. A challan raised
      // before this module existed has none, and then the header's single
      // figure is the whole bill -- so that case falls back rather than
      // printing an empty table. The late fee and the discount stay as
      // totals rather than lines, which is where a reader expects them.
      lines: (itemsByChallan.get(c.id) ?? []).length
        ? itemsByChallan.get(c.id).map((it) => ({
            label: it.description ?? FEE_TYPE_LABEL[it.fee_type] ?? 'Fee',
            note: it.period_month ? monthLabel(it.period_month) : null,
            amount: Number(it.amount) || 0,
          }))
        : [
            {
              label: FEE_TYPE_LABEL[c.fee_type] ?? 'Fee',
              note: c.period_month ? monthLabel(c.period_month) : null,
              amount: base,
            },
          ],
      amount: base,
      lateFee: Number(c.late_fee) || 0,
      discount: Number(c.discount) || 0,
      net,
      paid: Number(c.paid_amount) || 0,
      remaining: remaining(c),
      // What the family was already carrying when this bill was raised, and
      // any advance spent against it. Both are stamped on the challan at
      // issue time, so a reprint in December shows December's figures.
      previousBalance: Number(c.previous_balance) || 0,
      creditApplied: Number(c.credit_applied) || 0,
      payable: Number(c.payable) || 0,
      student: {
        name: studentName(c.students) || '—',
        fatherName: c.students?.father_name,
        admissionNumber: c.students?.admission_number,
        rollNumber: c.students?.roll_number,
        className: classById.get(c.class_id) ?? '—',
        sectionName: sectionById.get(c.section_id) ?? '—',
      },
    }
  })

  const printedAt = printDateTime()

  return (
    <div className="flex flex-col gap-4">
      {/* The sheet turns itself sideways for three copies -- see
          challanLandscape() -- and @page has to agree, or the browser
          centres a landscape sheet on a portrait page and clips both edges. */}
      <PaperRule paper={doc.paper} landscape={challanLandscape(doc)} />

      <div className="no-print flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>
            Print Challans
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
            {challans.length} challan{challans.length === 1 ? '' : 's'} ·{' '}
            {doc.challan.copies.length} copies per sheet ({doc.challan.copies.join(' / ')})
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CloseButton label="Back" />
          <Link href="/school/settings?section=documents" className="btn btn-ghost">
            Document settings
          </Link>
          <PrintButton label="Print" disabled={challans.length === 0} />
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

      {truncated && (
        <p
          className="no-print rounded-lg px-3 py-2 text-sm"
          style={{ background: 'var(--amber-soft)', color: 'var(--amber-ink)' }}
        >
          Showing the first {LIMIT}. Narrow by class or month and print in batches — a browser
          will not render much more than this in one job.
        </p>
      )}

      {!doc.bank.filled && doc.challan.showBank && (
        <p
          className="no-print rounded-lg px-3 py-2 text-sm"
          style={{ background: 'var(--amber-soft)', color: 'var(--amber-ink)' }}
        >
          No bank account is saved, so the deposit panel is left off the slip. Add it under{' '}
          <Link href="/school/settings?section=documents" className="underline underline-offset-2">
            Documents &amp; Branding
          </Link>
          .
        </p>
      )}

      {challans.length === 0 ? (
        <div className="no-print card px-6 py-16 text-center" style={{ borderStyle: 'dashed' }}>
          <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            Nothing to print
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm" style={{ color: 'var(--muted)' }}>
            No challan matched. Go back and pick one, or filter by class and month.
          </p>
          <Link href="/school/fees/challans" className="btn btn-primary mt-4">
            Back to challans
          </Link>
        </div>
      ) : (
        <div className="doc-preview flex flex-col items-center gap-6">
          {challans.map((c, i) => (
            <div key={c.id}>
              <ChallanSheet challan={c} doc={doc} printedAt={printedAt} />
              {i < challans.length - 1 && <PageBreak />}
            </div>
          ))}
        </div>
      )}

      {challans.length > 0 && <AutoPrint enabled={auto} />}
    </div>
  )
}
