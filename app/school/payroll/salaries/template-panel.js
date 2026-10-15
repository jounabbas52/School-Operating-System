'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Spinner } from '@/components/spinner'
import SidePanel from '@/components/side-panel'
import { useCloseOnSuccess } from '@/components/use-close-on-success'
import { Select } from '@/components/combobox'
import { money } from '@/lib/payroll-options'
import { applyTemplate } from '../actions'

function ApplyButton({ count }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      form="template-form"
      disabled={pending || count === 0}
      className="btn btn-primary"
    >
      {pending ? (
        <>
          <Spinner /> Applying…
        </>
      ) : (
        `Apply to ${count} staff`
      )}
    </button>
  )
}

// Copy one template's amounts onto several employees at once.
//
// The checkboxes post one staff_id per ticked row, which the action reads with
// getAll -- the same shape every other multi-select in this app uses.
export default function TemplatePanel({ structures, staff, trigger }) {
  const [open, setOpen] = useState(false)
  const [state, formAction] = useActionState(applyTemplate, {})
  useCloseOnSuccess(state, () => setOpen(false))

  const [structureId, setStructureId] = useState('')
  const [picked, setPicked] = useState(() => new Set())
  const [q, setQ] = useState('')

  const structure = structures.find((s) => String(s.id) === String(structureId))

  const visible = q
    ? staff.filter((s) => s.label.toLowerCase().includes(q.toLowerCase()))
    : staff

  function toggle(id) {
    setPicked((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allVisiblePicked = visible.length > 0 && visible.every((s) => picked.has(s.id))

  const gross = structure
    ? (Number(structure.basic_salary) || 0) +
      (Number(structure.house_allowance) || 0) +
      (Number(structure.medical_allowance) || 0) +
      (Number(structure.conveyance_allowance) || 0) +
      (Number(structure.special_allowance) || 0)
    : 0

  const overwriting = [...picked].filter((id) => staff.find((s) => s.id === id)?.assigned).length

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={trigger.className}>
        {trigger.label}
      </button>

      <SidePanel
        open={open}
        onClose={() => setOpen(false)}
        title="Apply Template to Staff"
        description="Copies the template amounts onto each selected employee"
        icon="▤"
        width="max-w-lg"
        footer={
          <>
            <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost">
              Cancel
            </button>
            <ApplyButton count={picked.size} />
          </>
        }
      >
        <form id="template-form" action={formAction} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="tpl-structure">
                Template *
              </label>
              <Select
                id="tpl-structure"
                name="structure_id"
                required
                placeholder="— choose —"
                options={structures.map((s) => ({ id: s.id, label: s.label }))}
                onChangeValue={setStructureId}
                emptyLabel="No templates yet."
              />
            </div>
            <div>
              <label className="label" htmlFor="tpl-effective">
                Effective from
              </label>
              <input
                id="tpl-effective"
                name="effective_from"
                type="date"
                defaultValue={new Date().toISOString().slice(0, 10)}
                className="field"
              />
              <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                Usually the 1st of the month the new package starts.
              </p>
            </div>
          </div>

          {structure && (
            <div
              className="flex items-center justify-between rounded-xl px-4 py-3"
              style={{ background: 'var(--brand-soft)', border: '1px solid transparent' }}
            >
              <div>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>
                  Gross this template pays
                </p>
                <p
                  className="mt-0.5 text-lg font-semibold tabular-nums"
                  style={{ color: 'var(--brand-ink)' }}
                >
                  {money(gross)}
                </p>
              </div>
              <span className="pill pill-brand">{structure.grade ?? structure.name}</span>
            </div>
          )}

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="label !mb-0">Employees</span>
              <button
                type="button"
                onClick={() =>
                  setPicked((current) => {
                    const next = new Set(current)
                    for (const s of visible) {
                      if (allVisiblePicked) next.delete(s.id)
                      else next.add(s.id)
                    }
                    return next
                  })
                }
                className="text-xs font-medium"
                style={{ color: 'var(--brand-ink)' }}
              >
                {allVisiblePicked ? 'Clear shown' : 'Select shown'}
              </button>
            </div>

            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filter employees…"
              aria-label="Filter employees"
              className="field mb-2"
            />

            <div
              className="max-h-64 overflow-y-auto rounded-lg"
              style={{ border: '1px solid var(--border)' }}
            >
              {!visible.length ? (
                <p className="px-3 py-6 text-center text-sm" style={{ color: 'var(--muted)' }}>
                  Nobody matches that filter.
                </p>
              ) : (
                visible.map((s) => (
                  <label
                    key={s.id}
                    className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm"
                    style={{ borderBottom: '1px solid var(--border-soft)' }}
                  >
                    <input
                      type="checkbox"
                      name="staff_id"
                      value={s.id}
                      checked={picked.has(s.id)}
                      onChange={() => toggle(s.id)}
                      className="size-4 shrink-0 cursor-pointer rounded"
                      style={{ accentColor: 'var(--brand)' }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate" style={{ color: 'var(--ink)' }}>
                        {s.label}
                      </span>
                      <span className="block text-xs" style={{ color: 'var(--muted)' }}>
                        {s.designation ?? '—'}
                      </span>
                    </span>
                    {s.assigned && <span className="pill pill-amber shrink-0">has package</span>}
                  </label>
                ))
              )}
            </div>
          </div>

          {overwriting > 0 && (
            <p
              className="rounded-lg px-3 py-2 text-sm"
              style={{ background: 'var(--amber-soft)', color: 'var(--amber-ink)' }}
            >
              {overwriting} of the selected employees already have a package. Applying this template
              replaces their current amounts.
            </p>
          )}

          {state?.error && (
            <p
              className="rounded-lg px-3 py-2 text-sm"
              style={{ background: 'var(--red-soft)', color: 'var(--red)' }}
            >
              {state.error}
            </p>
          )}
        </form>
      </SidePanel>
    </>
  )
}
