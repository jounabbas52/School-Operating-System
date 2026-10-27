import { dateLabel, monthLabel, remaining } from '@/lib/fee-options'

// Who owes what, shaped for the Collect Fee panel.
//
// Three screens open that panel -- Collect Fee, Challans, and a student's own
// ledger -- and each used to hand it a single challan. That could not describe
// a parent arriving with one sum for three overdue months and two ahead, so
// the panel now works from the student and needs the same thing on every
// screen: their balance, their credit, and every bill still open. One function
// builds it so the three cannot disagree.
//
// Deliberately not month-filtered. Arrears are the whole point: a screen
// showing October must still let the counter take money for June.
export async function feePayers(supabase, schoolId) {
  const [{ data: dues }, { data: challans }] = await Promise.all([
    // fee_dues() carries the credit figure, which no query against challans
    // can produce: credit is money received that no bill has claimed.
    supabase.rpc('fee_dues'),
    supabase
      .from('fee_challans')
      .select(
        'id, challan_number, student_id, fee_type, amount, late_fee, discount, net_amount, total_amount, paid_amount, due_date, period_month, period_from, period_to, description, status'
      )
      .eq('school_id', schoolId)
      .eq('is_deleted', false)
      .neq('status', 'cancelled')
      .order('due_date', { ascending: true, nullsFirst: false }),
  ])

  const billsByStudent = new Map()

  for (const c of challans ?? []) {
    const outstanding = remaining(c)
    if (outstanding <= 0) continue

    const from = c.period_from ?? c.period_month
    const to = c.period_to ?? c.period_month
    // A five-month voucher reads as its span, not as one month, or the cashier
    // cannot tell it from a single month's bill.
    const period =
      from && to && from !== to
        ? `${monthLabel(from)} – ${monthLabel(to)}`
        : from
          ? monthLabel(from)
          : (c.description ?? 'Challan')

    const list = billsByStudent.get(c.student_id) ?? []
    list.push({
      id: c.id,
      label: `${c.challan_number ?? 'Challan'} · ${period}`,
      outstanding,
      dueLabel: c.due_date ? dateLabel(c.due_date) : null,
      dueDate: c.due_date ?? null,
    })
    billsByStudent.set(c.student_id, list)
  }

  return (dues ?? [])
    .map((d) => {
      const bills = billsByStudent.get(d.student_id) ?? []
      const owed = bills.reduce((sum, b) => sum + b.outstanding, 0)
      const credit = Number(d.credit) || 0

      return {
        id: d.student_id,
        // The combobox searches this string, so the admission number and the
        // father's name belong in it -- that is what a parent at the counter
        // gives when the child's name is one of four Alis in the school.
        label: [
          d.full_name,
          d.admission_number ? `· ${d.admission_number}` : null,
          d.father_name ? `· ${d.father_name}` : null,
          owed > 0 ? `· ${Math.round(owed).toLocaleString('en-PK')} due` : null,
          credit > 0 ? `· ${Math.round(credit).toLocaleString('en-PK')} advance` : null,
        ]
          .filter(Boolean)
          .join(' '),
        name: d.full_name,
        admissionNumber: d.admission_number ?? null,
        balance: Number(d.balance) || 0,
        credit,
        bills,
      }
    })
    // Families who owe nothing and hold nothing stay out of the list: the
    // counter is looking for the ones with something to settle. A student with
    // credit stays, because a refund or an adjustment starts there.
    .filter((p) => p.bills.length > 0 || p.credit > 0 || p.balance !== 0)
}
