import Link from 'next/link'
import { getSchoolContext } from '@/lib/school-context'
import { StatCard, StatRow } from '@/components/stats'
import ExportButtons from '@/components/export-buttons'
import RefreshButton from '@/components/refresh-button'
import ConfirmButton from '@/components/confirm'
import { staffName } from '@/lib/staff-options'
import { grossOf, money } from '@/lib/payroll-options'
import { deleteStaffSalary } from '../actions'
import SalaryPanel from './salary-panel'
import TemplatePanel from './template-panel'

export const metadata = { title: 'Staff Salaries' }

export default async function StaffSalariesPage({ searchParams }) {
  const params = await searchParams
  const q = (params?.q ?? '').trim()
  const department = params?.department ?? ''
  const onlyUnassigned = params?.unassigned === '1'

  const { schoolId, permissions, supabase } = await getSchoolContext()
  const canWrite = permissions.has('payroll.write')

  const [{ data: staffRows }, { data: packages }, { data: structures }] = await Promise.all([
    supabase
      .from('staff')
      .select('id, first_name, last_name, staff_number, designation, department, staff_type, status')
      .eq('school_id', schoolId)
      .eq('is_deleted', false)
      .eq('status', 'active')
      .order('first_name'),
    supabase
      .from('staff_salaries')
      .select('*')
      .eq('school_id', schoolId)
      .eq('is_deleted', false),
    supabase
      .from('salary_structures')
      .select(
        'id, name, grade, basic_salary, house_allowance, medical_allowance, conveyance_allowance, special_allowance, total_deductions'
      )
      .eq('school_id', schoolId)
      .eq('is_deleted', false)
      .eq('status', 'active')
      .order('name'),
  ])

  const allStaff = staffRows ?? []
  const packageByStaff = new Map((packages ?? []).map((p) => [p.staff_id, p]))

  const structureOptions = (structures ?? []).map((s) => ({
    id: s.id,
    label: s.grade ? `${s.name} · ${s.grade}` : s.name,
    ...s,
  }))

  const departments = [...new Set(allStaff.map((s) => s.department).filter(Boolean))].sort()

  const rows = allStaff
    .map((s) => {
      const pkg = packageByStaff.get(s.id) ?? null
      return { ...s, pkg, gross: pkg ? grossOf(pkg) : 0 }
    })
    .filter((s) => {
      if (department && s.department !== department) return false
      if (onlyUnassigned && s.pkg) return false
      if (!q) return true
      const needle = q.toLowerCase()
      return [staffName(s), s.staff_number, s.designation]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle))
    })

  const assigned = allStaff.filter((s) => packageByStaff.has(s.id)).length
  const monthlyCost = allStaff.reduce((sum, s) => {
    const pkg = packageByStaff.get(s.id)
    return sum + (pkg ? grossOf(pkg) : 0)
  }, 0)

  const exportRows = rows.map((s, i) => ({
    n: i + 1,
    staff_number: s.staff_number ?? '',
    name: staffName(s),
    designation: s.designation ?? '',
    department: s.department ?? '',
    basic: Number(s.pkg?.basic_salary) || 0,
    allowances: s.pkg ? s.gross - (Number(s.pkg.basic_salary) || 0) : 0,
    gross: s.gross,
    deductions: Number(s.pkg?.other_deductions) || 0,
    mode: s.pkg?.payment_mode ?? '',
    assigned: s.pkg ? 'Yes' : 'No',
  }))

  const filtered = Boolean(q || department || onlyUnassigned)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>
            Staff Salaries
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
            Each employee&rsquo;s own package — this is what payroll actually pays
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <RefreshButton />
          <ExportButtons
            rows={exportRows}
            columns={[
              { key: 'n', label: '#' },
              { key: 'staff_number', label: 'Staff ID' },
              { key: 'name', label: 'Name' },
              { key: 'designation', label: 'Designation' },
              { key: 'department', label: 'Department' },
              { key: 'basic', label: 'Basic' },
              { key: 'allowances', label: 'Allowances' },
              { key: 'gross', label: 'Gross' },
              { key: 'deductions', label: 'Deductions' },
              { key: 'mode', label: 'Payment mode' },
              { key: 'assigned', label: 'Package assigned' },
            ]}
            filename="staff-salaries"
            title="Staff Salaries"
          />
          {canWrite && structureOptions.length > 0 && (
            <TemplatePanel
              structures={structureOptions}
              staff={allStaff.map((s) => ({
                id: s.id,
                label: staffName(s),
                designation: s.designation,
                assigned: packageByStaff.has(s.id),
              }))}
              trigger={{ label: 'Apply Template', className: 'btn btn-primary' }}
            />
          )}
        </div>
      </div>

      <StatRow>
        <StatCard
          label="Active staff"
          value={allStaff.length}
          sub="On the payroll roster"
          tone="brand"
          icon="◉"
        />
        <StatCard
          label="Salary assigned"
          value={assigned}
          sub="Ready for payroll"
          tone="green"
          icon="✓"
        />
        <StatCard
          label="Not assigned"
          value={allStaff.length - assigned}
          sub={allStaff.length === assigned ? 'Everyone is covered' : 'Skipped when payroll runs'}
          tone="amber"
          icon="!"
        />
        <StatCard
          label="Monthly gross cost"
          value={money(monthlyCost)}
          sub="At full attendance"
          tone="blue"
          icon="₨"
        />
      </StatRow>

      {/* --------------------------------------------------------- filters */}
      <form className="card flex flex-wrap items-center gap-2 p-3">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search name, designation or ID…"
          className="field min-w-56 flex-1"
        />

        <select
          name="department"
          defaultValue={department}
          className="field w-auto min-w-40"
          aria-label="Filter by department"
        >
          <option value="">All Departments</option>
          {departments.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>

        <label className="segment">
          <input type="checkbox" name="unassigned" value="1" defaultChecked={onlyUnassigned} />
          Only unassigned
        </label>

        <button className="btn btn-primary">Search</button>
        {filtered && (
          <Link href="/school/payroll/salaries" className="btn btn-ghost">
            Clear
          </Link>
        )}

        <span className="ml-auto text-xs" style={{ color: 'var(--muted)' }}>
          {rows.length} staff
        </span>
      </form>

      {!rows.length ? (
        <div className="card px-6 py-16 text-center" style={{ borderStyle: 'dashed' }}>
          <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            No staff found
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm" style={{ color: 'var(--muted)' }}>
            {filtered
              ? 'Try a different search or filter.'
              : 'Add staff under HR / Staff before assigning salaries.'}
          </p>
          {!allStaff.length && (
            <Link href="/school/hr" className="btn btn-primary mt-4">
              Go to Staff
            </Link>
          )}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table min-w-[64rem]">
            <thead>
              <tr>
                <th>Staff ID</th>
                <th>Name</th>
                <th>Designation</th>
                <th className="text-right">Basic</th>
                <th className="text-right">Allowances</th>
                <th className="text-right">Gross</th>
                <th>Statutory</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td>
                    <span className="pill pill-muted font-mono">{s.staff_number ?? '—'}</span>
                  </td>
                  <td>
                    <span className="font-medium" style={{ color: 'var(--ink)' }}>
                      {staffName(s)}
                    </span>
                    <span className="block text-xs" style={{ color: 'var(--muted)' }}>
                      {s.department ?? '—'}
                    </span>
                  </td>
                  <td>{s.designation ?? '—'}</td>
                  <td className="text-right tabular-nums">
                    {s.pkg ? money(s.pkg.basic_salary) : '—'}
                  </td>
                  <td className="text-right tabular-nums">
                    {s.pkg ? money(s.gross - (Number(s.pkg.basic_salary) || 0)) : '—'}
                  </td>
                  <td
                    className="text-right tabular-nums font-semibold"
                    style={{ color: s.pkg ? 'var(--ink)' : 'var(--muted-2)' }}
                  >
                    {s.pkg ? money(s.gross) : '—'}
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {s.pkg?.eobi_applicable && <span className="pill pill-blue">EOBI</span>}
                      {s.pkg?.pf_applicable && <span className="pill pill-brand">PF</span>}
                      {Number(s.pkg?.tax_annual) > 0 && <span className="pill pill-amber">Tax</span>}
                      {!s.pkg?.eobi_applicable &&
                        !s.pkg?.pf_applicable &&
                        !Number(s.pkg?.tax_annual) && (
                          <span className="text-xs" style={{ color: 'var(--muted-2)' }}>
                            —
                          </span>
                        )}
                    </div>
                  </td>
                  <td>
                    {s.pkg ? (
                      <span className="pill pill-green">Assigned</span>
                    ) : (
                      <span className="pill pill-amber">Not assigned</span>
                    )}
                  </td>
                  <td>
                    <div className="flex items-center justify-end gap-1.5">
                      {canWrite ? (
                        <>
                          <SalaryPanel
                            staffId={s.id}
                            staffLabel={staffName(s)}
                            row={s.pkg}
                            structures={structureOptions}
                            trigger={{
                              label: s.pkg ? 'Edit' : 'Assign',
                              className: s.pkg
                                ? 'btn btn-ghost !px-2.5 !py-1'
                                : 'btn btn-primary !px-2.5 !py-1',
                            }}
                          />
                          {s.pkg && (
                            <form action={deleteStaffSalary}>
                              <input type="hidden" name="id" value={s.pkg.id} />
                              <ConfirmButton
                                className="btn btn-danger !px-2.5 !py-1"
                                title={`Remove ${staffName(s)}'s package?`}
                                message="They are skipped by future payroll runs. Months already generated keep their figures."
                                confirmLabel="Remove"
                              >
                                Delete
                              </ConfirmButton>
                            </form>
                          )}
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
    </div>
  )
}
