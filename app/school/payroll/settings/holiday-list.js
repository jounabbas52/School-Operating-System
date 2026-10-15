'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import Link from 'next/link'
import { Spinner } from '@/components/spinner'
import ConfirmButton from '@/components/confirm'
import { useToast } from '@/components/toast'
import { dateLabel } from '@/lib/payroll-options'
import { addHoliday, deleteHoliday } from '../actions'

function AddButton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="btn btn-primary">
      {pending ? (
        <>
          <Spinner /> Adding…
        </>
      ) : (
        'Add Holiday'
      )}
    </button>
  )
}

// Days the school was shut. Excluded from the working-day count, so nobody is
// marked absent for Eid.
export default function HolidayList({ holidays, year, canWrite }) {
  const [state, formAction] = useActionState(addHoliday, {})
  const { success } = useToast()
  const [seen, setSeen] = useState(null)

  if (state?.ok && state.at !== seen) {
    setSeen(state.at)
    queueMicrotask(() => success(state.ok))
  }

  const years = [year - 1, year, year + 1]

  return (
    <div className="card overflow-hidden">
      <div
        className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4"
        style={{ borderColor: 'var(--border)' }}
      >
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
            Holiday calendar
          </p>
          <p className="mt-0.5 text-xs" style={{ color: 'var(--muted)' }}>
            Holidays are excluded from working days, so nobody is marked absent for a day the
            school was shut.
          </p>
        </div>

        <div className="flex items-center gap-1">
          {years.map((y) => (
            <Link
              key={y}
              href={`/school/payroll/settings?year=${y}`}
              className={`tab !px-2.5 !py-1 ${year === y ? 'tab-on' : ''}`}
            >
              {y}
            </Link>
          ))}
        </div>
      </div>

      {canWrite && (
        <form
          action={formAction}
          className="flex flex-wrap items-end gap-2 border-b px-5 py-4"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="min-w-44">
            <label className="label" htmlFor="hol-date">
              Date
            </label>
            <input id="hol-date" name="holiday_date" type="date" required className="field" />
          </div>
          <div className="min-w-52 flex-1">
            <label className="label" htmlFor="hol-name">
              Occasion
            </label>
            <input
              id="hol-name"
              name="name"
              required
              placeholder="e.g. Eid-ul-Fitr"
              className="field"
            />
          </div>
          <AddButton />
        </form>
      )}

      {state?.error && (
        <p
          className="mx-5 mt-4 rounded-lg px-3 py-2 text-sm"
          style={{ background: 'var(--red-soft)', color: 'var(--red)' }}
        >
          {state.error}
        </p>
      )}

      {!holidays.length ? (
        <p className="px-6 py-10 text-center text-sm" style={{ color: 'var(--muted)' }}>
          No holidays recorded for {year}.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="table min-w-[32rem]">
            <thead>
              <tr>
                <th>Date</th>
                <th>Occasion</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {holidays.map((h) => (
                <tr key={h.id}>
                  <td className="tabular-nums">{dateLabel(h.holiday_date)}</td>
                  <td>
                    <span className="font-medium" style={{ color: 'var(--ink)' }}>
                      {h.name}
                    </span>
                  </td>
                  <td>
                    <div className="flex justify-end">
                      {canWrite ? (
                        <form action={deleteHoliday}>
                          <input type="hidden" name="id" value={h.id} />
                          <ConfirmButton
                            className="btn btn-danger !px-2.5 !py-1"
                            title={`Remove ${h.name}?`}
                            message="That day counts as a working day again in payroll generated from here on."
                            confirmLabel="Remove"
                          >
                            Delete
                          </ConfirmButton>
                        </form>
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
