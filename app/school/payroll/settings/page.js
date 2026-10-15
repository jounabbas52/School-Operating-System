import { getSchoolContext } from '@/lib/school-context'
import RefreshButton from '@/components/refresh-button'
import { DEFAULT_SETTINGS } from '@/lib/payroll-options'
import SettingsForm from './settings-form'
import HolidayList from './holiday-list'

export const metadata = { title: 'Payroll Settings' }

export default async function PayrollSettingsPage({ searchParams }) {
  const params = await searchParams
  const year = Number(params?.year) || new Date().getFullYear()

  const { schoolId, permissions, supabase } = await getSchoolContext()
  const canWrite = permissions.has('payroll.write')

  const [{ data: settings }, { data: holidays }] = await Promise.all([
    supabase.from('payroll_settings').select('*').eq('school_id', schoolId).maybeSingle(),
    supabase
      .from('payroll_holidays')
      .select('id, holiday_date, name')
      .eq('school_id', schoolId)
      .gte('holiday_date', `${year}-01-01`)
      .lte('holiday_date', `${year}-12-31`)
      .order('holiday_date'),
  ])

  // A school that has never opened this screen is paid on the defaults, so the
  // form has to show those rather than empty fields — otherwise the page
  // implies nothing is configured when something very much is.
  const current = settings ?? DEFAULT_SETTINGS

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>
            Payroll Settings
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
            How this school calculates working days, absences and statutory deductions
          </p>
        </div>
        <RefreshButton />
      </div>

      {!settings && (
        <p
          className="rounded-xl px-4 py-3 text-sm"
          style={{ background: 'var(--blue-soft)', color: 'var(--blue-ink)' }}
        >
          Nothing has been saved yet, so payroll currently runs on the defaults shown below — a
          calendar month less Sundays, absences docked from gross. Saving makes them explicit.
        </p>
      )}

      <SettingsForm settings={current} canWrite={canWrite} />

      <HolidayList holidays={holidays ?? []} year={year} canWrite={canWrite} />

      <p className="text-xs" style={{ color: 'var(--muted)' }}>
        Changes apply to payroll generated from here on. Already-generated months keep the figures
        they were built with — amounts are snapshotted at generation, not recalculated afterwards.
      </p>
    </div>
  )
}
