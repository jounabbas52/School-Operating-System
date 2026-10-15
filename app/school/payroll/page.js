import Link from 'next/link'
import { getSchoolContext } from '@/lib/school-context'
import { StatCard, StatRow } from '@/components/stats'
import ExportButtons from '@/components/export-buttons'
import RefreshButton from '@/components/refresh-button'
import ConfirmButton from '@/components/confirm'
import { grossOf, money } from '@/lib/payroll-options'
import { deleteStructure } from './actions'
import StructurePanel from './structure-panel'

export const metadata = { title: 'Salary Structures' }

export default async function SalaryStructuresPage({ searchParams }) {
  const params = await searchParams
  const q = (params?.q ?? '').trim()

  const { schoolId, permissions, supabase } = await getSchoolContext()
  const canWrite = permissions.has('payroll.write')

  let query = supabase
    .from('salary_structures')
    .select(
      'id, name, grade, basic_salary, house_allowance, medical_allowance, conveyance_allowance, special_allowance, total_deductions, description, status'
    )
    .eq('school_id', schoolId)
    .eq('is_deleted', false)

  if (q) query = query.or(`name.ilike.%${q}%,grade.ilike.%${q}%`)

  const { data: structureRows, error } = await query.order('name')

  const structures = (structureRows ?? []).map((s) => {
    const gross = grossOf({
      basic_salary: s.basic_salary,
      house_allowance: s.house_allowance,
      medical_allowance: s.medical_allowance,
      conveyance_allowance: s.conveyance_allowance,
      special_allowance: s.special_allowance,
    })
    return { ...s, gross, net: Math.max(0, gross - (Number(s.total_deductions) || 0)) }
  })

  const nets = structures.map((s) => s.net).filter((n) => n > 0)
  const avgNet = nets.length ? nets.reduce((a, b) => a + b, 0) / nets.length : 0

  const exportRows = structures.map((s, i) => ({
    n: i + 1,
    name: s.name,
    grade: s.grade ?? '',
    basic: Number(s.basic_salary) || 0,
    house: Number(s.house_allowance) || 0,
    medical: Number(s.medical_allowance) || 0,
    conveyance: Number(s.conveyance_allowance) || 0,
    special: Number(s.special_allowance) || 0,
    gross: s.gross,
    deductions: Number(s.total_deductions) || 0,
    net: s.net,
  }))

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>
            Salary Structures
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
            Reusable pay templates per designation
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <RefreshButton />
          <ExportButtons
            rows={exportRows}
            columns={[
              { key: 'n', label: '#' },
              { key: 'name', label: 'Designation' },
              { key: 'grade', label: 'Grade' },
              { key: 'basic', label: 'Basic' },
              { key: 'house', label: 'House' },
              { key: 'medical', label: 'Medical' },
              { key: 'conveyance', label: 'Conveyance' },
              { key: 'special', label: 'Special' },
              { key: 'gross', label: 'Gross' },
              { key: 'deductions', label: 'Deductions' },
              { key: 'net', label: 'Net' },
            ]}
            filename="salary-structures"
            title="Salary Structures"
          />
          {canWrite && (
            <StructurePanel trigger={{ label: '+ Add Structure', className: 'btn btn-primary' }} />
          )}
        </div>
      </div>

      {/* The distinction this whole module turns on, said once, where the
          mistake would otherwise be made. */}
      <div
        className="flex items-start gap-3 rounded-xl px-4 py-3"
        style={{ background: 'var(--blue-soft)', border: '1px solid transparent' }}
      >
        <span className="mt-0.5 shrink-0 text-sm" style={{ color: 'var(--blue)' }} aria-hidden="true">
          ⓘ
        </span>
        <p className="text-sm" style={{ color: 'var(--blue-ink)' }}>
          These are <strong>templates</strong>, not actual salaries. Payroll pays each employee the
          package on{' '}
          <Link href="/school/payroll/salaries" className="underline">
            Staff Salaries
          </Link>{' '}
          — copy a template there and adjust it per person. Two teachers on the same designation
          can, and usually do, earn different amounts.
        </p>
      </div>

      <StatRow>
        <StatCard
          label="Total structures"
          value={structures.length}
          sub="Pay grades defined"
          tone="brand"
          icon="▤"
        />
        <StatCard
          label="Avg net salary"
          value={money(avgNet)}
          sub="Across all grades"
          tone="blue"
          icon="◎"
        />
        <StatCard
          label="Highest net"
          value={money(nets.length ? Math.max(...nets) : 0)}
          sub="Top pay grade"
          tone="green"
          icon="▲"
        />
        <StatCard
          label="Lowest net"
          value={money(nets.length ? Math.min(...nets) : 0)}
          sub="Entry level"
          tone="amber"
          icon="▼"
        />
      </StatRow>

      <form className="card flex flex-wrap items-center gap-2 p-3">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search by designation or grade…"
          className="field min-w-56 flex-1"
        />
        <button className="btn btn-primary">Search</button>
        {q && (
          <Link href="/school/payroll" className="btn btn-ghost">
            Clear
          </Link>
        )}
        <span className="ml-auto text-xs" style={{ color: 'var(--muted)' }}>
          {structures.length} structure{structures.length === 1 ? '' : 's'}
        </span>
      </form>

      {error && (
        <p
          className="rounded-lg px-3 py-2 text-sm"
          style={{ background: 'var(--red-soft)', color: 'var(--red-ink)' }}
        >
          {error.message}
        </p>
      )}

      {!structures.length ? (
        <div className="card px-6 py-16 text-center" style={{ borderStyle: 'dashed' }}>
          <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            No salary structures yet
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm" style={{ color: 'var(--muted)' }}>
            {q
              ? 'Nothing matches that search.'
              : 'Define a pay grade once, then copy it onto each employee under Staff Salaries.'}
          </p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table min-w-[62rem]">
            <thead>
              <tr>
                <th>Designation</th>
                <th>Grade</th>
                <th className="text-right">Basic</th>
                <th className="text-right">Allowances</th>
                <th className="text-right">Gross</th>
                <th className="text-right">Deductions</th>
                <th className="text-right">Net</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {structures.map((s) => (
                <tr key={s.id}>
                  <td>
                    <span className="font-medium" style={{ color: 'var(--ink)' }}>
                      {s.name}
                    </span>
                    {s.description && (
                      <span className="block max-w-xs truncate text-xs" style={{ color: 'var(--muted)' }}>
                        {s.description}
                      </span>
                    )}
                  </td>
                  <td>
                    {s.grade ? <span className="pill pill-muted font-mono">{s.grade}</span> : '—'}
                  </td>
                  <td className="text-right tabular-nums">{money(s.basic_salary)}</td>
                  <td className="text-right tabular-nums">
                    {money(s.gross - (Number(s.basic_salary) || 0))}
                  </td>
                  <td className="text-right tabular-nums">{money(s.gross)}</td>
                  <td className="text-right tabular-nums" style={{ color: 'var(--red)' }}>
                    {Number(s.total_deductions) > 0 ? `- ${money(s.total_deductions)}` : '—'}
                  </td>
                  <td
                    className="text-right tabular-nums font-semibold"
                    style={{ color: 'var(--green)' }}
                  >
                    {money(s.net)}
                  </td>
                  <td>
                    <span className={`pill ${s.status === 'active' ? 'pill-green' : 'pill-muted'}`}>
                      {s.status === 'active' ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <div className="flex items-center justify-end gap-1.5">
                      {canWrite ? (
                        <>
                          <StructurePanel
                            row={s}
                            trigger={{ label: 'Edit', className: 'btn btn-ghost !px-2.5 !py-1' }}
                          />
                          <form action={deleteStructure}>
                            <input type="hidden" name="id" value={s.id} />
                            <ConfirmButton
                              className="btn btn-danger !px-2.5 !py-1"
                              title={`Remove ${s.name}?`}
                              message="Packages already copied from this template keep their amounts — a template is copied, not linked."
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
    </div>
  )
}
