import Link from 'next/link'
import { getSchoolContext } from '@/lib/school-context'
import { StatCard, StatRow } from '@/components/stats'
import SubmitButton from '@/components/submit-button'
import ExportButtons from '@/components/export-buttons'
import RefreshButton from '@/components/refresh-button'
import ConfirmButton from '@/components/confirm'
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABEL,
  EXPENSE_STATUSES,
  EXPENSE_STATUS_LABEL,
  EXPENSE_STATUS_TONE,
  dateLabel,
  money,
} from '@/lib/payroll-options'
import { deleteExpense, setExpenseStatus } from '../actions'
import ExpensePanel from './expense-panel'

export const metadata = { title: 'Other Expenses' }

export default async function ExpensesPage({ searchParams }) {
  const params = await searchParams
  const q = (params?.q ?? '').trim()
  const categoryFilter = params?.category ?? ''
  const statusFilter = params?.status ?? ''

  const { schoolId, permissions, supabase } = await getSchoolContext()
  // Expenses are gated on accounts.*, which is where schema.sql put the table
  // — the screen lives under Payroll, the permission does not move.
  const canWrite = permissions.has('accounts.write')

  let query = supabase
    .from('expenses')
    .select(
      'id, title, category, amount, expense_date, vendor, paid_to, bill_no, voucher_no, payment_method, description, status, approved_at, paid_at'
    ,
      { count: 'exact' }
    )
    .eq('school_id', schoolId)
    .eq('is_deleted', false)

  if (categoryFilter) query = query.eq('category', categoryFilter)
  if (statusFilter) query = query.eq('status', statusFilter)
  if (q) {
    query = query.or(
      `title.ilike.%${q}%,vendor.ilike.%${q}%,voucher_no.ilike.%${q}%,bill_no.ilike.%${q}%`
    )
  }

  // Capped: vouchers accumulate for the life of the school. The filters above
  // and the CSV export are how you reach older ones.
  const LIST_CAP = 500
  const { data: expenseRows, error, count } = await query
    .order('expense_date', { ascending: false })
    .limit(LIST_CAP)

  const expenses = expenseRows ?? []

  // The tiles count every expense, not the filtered view.
  const { data: allRows } = await supabase
    .from('expenses')
    .select('amount, status')
    .eq('school_id', schoolId)
    .eq('is_deleted', false)

  const all = allRows ?? []
  const sumOf = (status) =>
    all.filter((e) => e.status === status).reduce((sum, e) => sum + (Number(e.amount) || 0), 0)
  const recorded = all
    .filter((e) => e.status !== 'rejected')
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0)

  const exportRows = expenses.map((e, i) => ({
    n: i + 1,
    voucher: e.voucher_no ?? '',
    title: e.title,
    category: EXPENSE_CATEGORY_LABEL[e.category] ?? e.category,
    amount: Number(e.amount) || 0,
    date: e.expense_date ?? '',
    vendor: e.vendor ?? '',
    paid_to: e.paid_to ?? '',
    bill: e.bill_no ?? '',
    mode: e.payment_method ?? '',
    status: EXPENSE_STATUS_LABEL[e.status] ?? e.status,
  }))

  const filtered = Boolean(q || categoryFilter || statusFilter)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>
            Other Expenses
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
            Non-salary spending, with an approval trail and a voucher number
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <RefreshButton />
          <ExportButtons
            rows={exportRows}
            columns={[
              { key: 'n', label: '#' },
              { key: 'voucher', label: 'Voucher no.' },
              { key: 'title', label: 'Title' },
              { key: 'category', label: 'Category' },
              { key: 'amount', label: 'Amount' },
              { key: 'date', label: 'Date' },
              { key: 'vendor', label: 'Vendor' },
              { key: 'paid_to', label: 'Paid to' },
              { key: 'bill', label: 'Bill no.' },
              { key: 'mode', label: 'Payment mode' },
              { key: 'status', label: 'Status' },
            ]}
            filename="expenses"
            title="Other Expenses"
          />
          {canWrite && (
            <ExpensePanel trigger={{ label: '+ New Expense', className: 'btn btn-primary' }} />
          )}
        </div>
      </div>

      <StatRow>
        <StatCard
          label="Total recorded"
          value={money(recorded)}
          sub={`${all.length} voucher${all.length === 1 ? '' : 's'}`}
          tone="brand"
          icon="▤"
        />
        <StatCard
          label="Awaiting approval"
          value={money(sumOf('pending'))}
          tone="amber"
          icon="◷"
        />
        <StatCard
          label="Approved, unpaid"
          value={money(sumOf('approved'))}
          sub="Cleared to pay"
          tone="blue"
          icon="✓"
        />
        <StatCard label="Paid" value={money(sumOf('paid'))} tone="green" icon="▲" />
      </StatRow>

      {/* --------------------------------------------------------- filters */}
      <form className="card flex flex-wrap items-center gap-2 p-3">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search title, vendor, voucher or bill no…"
          className="field min-w-56 flex-1"
        />

        <select
          name="category"
          defaultValue={categoryFilter}
          className="field w-auto min-w-36"
          aria-label="Filter by category"
        >
          <option value="">All Categories</option>
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>

        <div className="flex flex-wrap items-center gap-1">
          <Link
            href="/school/payroll/expenses"
            className={`tab !px-2.5 !py-1 ${!statusFilter ? 'tab-on' : ''}`}
          >
            All
          </Link>
          {EXPENSE_STATUSES.map((s) => (
            <Link
              key={s.id}
              href={`/school/payroll/expenses?status=${s.id}`}
              className={`tab !px-2.5 !py-1 ${statusFilter === s.id ? 'tab-on' : ''}`}
            >
              {s.label}
            </Link>
          ))}
        </div>

        <button className="btn btn-primary">Search</button>
        {filtered && (
          <Link href="/school/payroll/expenses" className="btn btn-ghost">
            Clear
          </Link>
        )}
      </form>

      {error && (
        <p
          className="rounded-lg px-3 py-2 text-sm"
          style={{ background: 'var(--red-soft)', color: 'var(--red-ink)' }}
        >
          {error.message}
        </p>
      )}

      {!expenses.length ? (
        <div className="card px-6 py-16 text-center" style={{ borderStyle: 'dashed' }}>
          <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            No expenses found
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm" style={{ color: 'var(--muted)' }}>
            {filtered ? 'Try adjusting your filters.' : 'Click "New Expense" to record one.'}
          </p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table min-w-[66rem]">
            <thead>
              <tr>
                <th>Voucher no.</th>
                <th>Title</th>
                <th>Category</th>
                <th>Vendor</th>
                <th>Date</th>
                <th className="text-right">Amount</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((e) => (
                <tr key={e.id}>
                  <td>
                    <span className="pill pill-muted font-mono">{e.voucher_no ?? '—'}</span>
                  </td>
                  <td>
                    <span className="font-medium" style={{ color: 'var(--ink)' }}>
                      {e.title}
                    </span>
                    {e.bill_no && (
                      <span className="block text-xs" style={{ color: 'var(--muted)' }}>
                        Bill {e.bill_no}
                      </span>
                    )}
                  </td>
                  <td>
                    <span className="pill pill-brand">
                      {EXPENSE_CATEGORY_LABEL[e.category] ?? e.category}
                    </span>
                  </td>
                  <td>
                    {e.vendor ?? '—'}
                    {e.paid_to && (
                      <span className="block text-xs" style={{ color: 'var(--muted)' }}>
                        to {e.paid_to}
                      </span>
                    )}
                  </td>
                  <td className="tabular-nums">{dateLabel(e.expense_date)}</td>
                  <td className="text-right tabular-nums font-semibold" style={{ color: 'var(--ink)' }}>
                    {money(e.amount)}
                  </td>
                  <td>
                    <span className={`pill ${EXPENSE_STATUS_TONE[e.status] ?? 'pill-muted'}`}>
                      {EXPENSE_STATUS_LABEL[e.status] ?? e.status}
                    </span>
                  </td>
                  <td>
                    <div className="flex items-center justify-end gap-1.5">
                      <Link
                        href={`/school/payroll/expenses/print?id=${e.id}`}
                        className="btn btn-ghost !px-2.5 !py-1"
                        title={`Print voucher ${e.voucher_no ?? ''}`}
                      >
                        Voucher
                      </Link>
                      {canWrite ? (
                        <>
                          {e.status === 'pending' && (
                            <>
                              <form action={setExpenseStatus}>
                                <input type="hidden" name="id" value={e.id} />
                                <input type="hidden" name="status" value="approved" />
                                <SubmitButton pendingLabel="Approving…" className="btn btn-blue !px-2.5 !py-1">
                                  Approve
                                </SubmitButton>
                              </form>
                              <form action={setExpenseStatus}>
                                <input type="hidden" name="id" value={e.id} />
                                <input type="hidden" name="status" value="rejected" />
                                <ConfirmButton
                                  className="btn btn-danger !px-2.5 !py-1"
                                  title={`Reject ${e.title}?`}
                                  message="It stays on file as a rejected voucher and stops counting toward totals."
                                  confirmLabel="Reject"
                                >
                                  Reject
                                </ConfirmButton>
                              </form>
                            </>
                          )}
                          {e.status === 'approved' && (
                            <form action={setExpenseStatus}>
                              <input type="hidden" name="id" value={e.id} />
                              <input type="hidden" name="status" value="paid" />
                              <SubmitButton pendingLabel="Saving…" className="btn btn-primary !px-2.5 !py-1">
                                Mark paid
                              </SubmitButton>
                            </form>
                          )}
                          <ExpensePanel
                            row={e}
                            trigger={{ label: 'Edit', className: 'btn btn-ghost !px-2.5 !py-1' }}
                          />
                          <form action={deleteExpense}>
                            <input type="hidden" name="id" value={e.id} />
                            <ConfirmButton
                              className="btn btn-danger !px-2.5 !py-1"
                              title={`Remove ${e.title}?`}
                              message="The voucher number is not reused — the gap is the record that something was removed."
                              confirmLabel="Remove"
                            >
                              Delete
                            </ConfirmButton>
                          </form>
                        </>
                      ) : (
                        <span className="text-xs" style={{ color: 'var(--muted-2)' }}>
                          read only
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {count > LIST_CAP && (
        <p className="text-xs" style={{ color: 'var(--muted)' }}>
          Showing the first {LIST_CAP} of {count}. Narrow the filters above, or use Export CSV for
          the full set.
        </p>
      )}
    </div>
  )
}
