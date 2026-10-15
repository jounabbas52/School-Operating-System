'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import SidePanel from '@/components/side-panel'
import { Select } from '@/components/combobox'
import { Spinner } from '@/components/spinner'
import { useCloseOnSuccess } from '@/components/use-close-on-success'
import {
  DAYS,
  DEFAULT_SETTINGS,
  PERIOD_KINDS,
  buildDay,
  timeRange,
} from '@/lib/timetable'
import { generatePeriods, savePeriod, updateTiming } from '../actions'

/* ------------------------------------------------------------- furniture */

function Submit({ form, label, busyLabel = 'Saving…' }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" form={form} disabled={pending} className="btn btn-primary">
      {pending ? (
        <>
          <Spinner /> {busyLabel}
        </>
      ) : (
        label
      )}
    </button>
  )
}

function Field({ label, children, required, hint, span = 1 }) {
  return (
    <div style={{ gridColumn: `span ${span} / span ${span}` }}>
      <span className="label">
        {label}
        {required && <span style={{ color: 'var(--red)' }}> *</span>}
      </span>
      {children}
      {hint && (
        <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
          {hint}
        </p>
      )}
    </div>
  )
}

function ErrorNote({ state }) {
  if (!state?.error) return null
  return (
    <p
      className="rounded-lg px-3 py-2 text-sm"
      style={{ background: 'var(--red-soft)', color: 'var(--red-ink)' }}
    >
      {state.error}
    </p>
  )
}

// The preview and the server run the same buildDay(), so what is drawn here is
// exactly what gets written.
function Timeline({ slots, title, footer }) {
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: 'var(--border)', background: 'var(--card-alt)' }}>
      <p
        className="mb-2 text-[0.68rem] font-bold uppercase tracking-wider"
        style={{ color: 'var(--brand-ink)' }}
      >
        {title}
      </p>
      <div className="flex max-h-[26rem] flex-col gap-1.5 overflow-y-auto">
        {slots.map((slot) => {
          const isBreak = slot.kind === 'break'
          return (
            <div
              key={slot.sort_order}
              className="rounded-lg px-3 py-2"
              style={{
                background: isBreak ? 'var(--amber-soft)' : 'var(--blue-soft)',
                border: `1px solid ${isBreak ? 'var(--amber)' : 'var(--blue)'}`,
              }}
            >
              <span
                className="block text-xs font-semibold"
                style={{ color: isBreak ? 'var(--amber-ink)' : 'var(--blue-ink)' }}
              >
                {slot.name}
              </span>
              <span
                className="block text-[0.68rem]"
                style={{ color: isBreak ? 'var(--amber-ink)' : 'var(--blue-ink)', opacity: 0.8 }}
              >
                {timeRange(slot.start_time, slot.end_time)}
              </span>
            </div>
          )
        })}
      </div>
      {footer && (
        <p className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>
          {footer}
        </p>
      )}
    </div>
  )
}

/* ------------------------------------------------------- add single period */

export function SinglePeriodPanel({ row, classes, trigger }) {
  const [open, setOpen] = useState(false)
  const [state, formAction] = useActionState(savePeriod, {})
  useCloseOnSuccess(state, () => setOpen(false))

  const editing = Boolean(row)

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={trigger.className}>
        {trigger.label}
      </button>

      <SidePanel
        open={open}
        onClose={() => setOpen(false)}
        width="max-w-md"
        icon="🕘"
        title={editing ? `Edit ${row.name}` : 'Add single period'}
        description="Fill in the period details"
        footer={
          <>
            <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost">
              Cancel
            </button>
            <Submit form="single-period-form" label={editing ? 'Save changes' : 'Add period'} />
          </>
        }
      >
        <form id="single-period-form" action={formAction} className="flex flex-col gap-4">
          {editing && <input type="hidden" name="id" value={row.id} />}
          {editing && <input type="hidden" name="sort_order" value={row.sort_order} />}

          <Field label="Class" required>
            <Select
              name="class_id"
              searchable
              required
              defaultValue={row?.class_id ?? ''}
              placeholder="Select class…"
              options={classes}
            />
          </Field>

          <Field label="Day" required>
            <Select
              name="day_of_week"
              required
              defaultValue={String(row?.day_of_week ?? 1)}
              options={DAYS.map((d) => ({ id: String(d.id), label: d.label }))}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Period name" required>
              <input
                name="name"
                required
                defaultValue={row?.name ?? 'Period 1'}
                className="field"
              />
            </Field>

            <Field label="Type">
              <Select name="kind" defaultValue={row?.kind ?? 'regular'} options={PERIOD_KINDS} />
            </Field>

            <Field label="Start time" required>
              <input
                name="start_time"
                type="time"
                required
                defaultValue={(row?.start_time ?? '08:00').slice(0, 5)}
                className="field"
              />
            </Field>

            <Field label="End time" required>
              <input
                name="end_time"
                type="time"
                required
                defaultValue={(row?.end_time ?? '08:45').slice(0, 5)}
                className="field"
              />
            </Field>
          </div>

          {!editing && (
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              It goes on the end of that day. Use Change Timing to renumber a whole schedule.
            </p>
          )}

          <ErrorNote state={state} />
        </form>
      </SidePanel>
    </>
  )
}

/* -------------------------------------------------------- add bulk periods */

export function BulkPeriodsPanel({ classes, defaults, trigger }) {
  const [open, setOpen] = useState(false)
  const [state, formAction] = useActionState(generatePeriods, {})
  useCloseOnSuccess(state, () => setOpen(false))

  const base = { ...DEFAULT_SETTINGS, ...(defaults ?? {}) }

  const [form, setForm] = useState({
    start_time: (base.start_time ?? '08:00').slice(0, 5),
    periods_per_day: base.periods_per_day,
    period_minutes: base.period_minutes,
    short_break: base.short_break_after > 0,
    short_break_after: base.short_break_after || 3,
    short_break_minutes: base.short_break_minutes || 10,
    lunch_break: base.lunch_after > 0,
    lunch_after: base.lunch_after || 5,
    lunch_minutes: base.lunch_minutes || 30,
  })
  const [days, setDays] = useState(base.days ?? [1, 2, 3, 4, 5])

  const set = (patch) => setForm((current) => ({ ...current, ...patch }))

  const preview = buildDay({
    ...form,
    short_break_after: form.short_break ? form.short_break_after : 0,
    short_break_minutes: form.short_break ? form.short_break_minutes : 0,
    lunch_after: form.lunch_break ? form.lunch_after : 0,
    lunch_minutes: form.lunch_break ? form.lunch_minutes : 0,
  })

  const total = preview.length * days.length

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={trigger.className}>
        {trigger.label}
      </button>

      <SidePanel
        open={open}
        onClose={() => setOpen(false)}
        width="max-w-3xl"
        icon="☰"
        title="Add bulk periods"
        description="Auto-generate periods for multiple days"
        footer={
          <>
            <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost">
              Cancel
            </button>
            <Submit
              form="bulk-periods-form"
              label={`Add ${total} period${total === 1 ? '' : 's'}`}
              busyLabel="Generating…"
            />
          </>
        }
      >
        <div className="grid gap-5 lg:grid-cols-[1fr_16rem]">
          <form id="bulk-periods-form" action={formAction} className="flex flex-col gap-4">
            {days.map((d) => (
              <input key={d} type="hidden" name="days" value={d} />
            ))}

            <Field label="Class" required>
              <Select
                name="class_id"
                searchable
                required
                defaultValue=""
                placeholder="Select class…"
                options={classes}
              />
            </Field>

            <div>
              <span className="label">
                Days<span style={{ color: 'var(--red)' }}> *</span>
              </span>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {DAYS.slice(0, 6).map((d) => {
                  const on = days.includes(d.id)
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() =>
                        setDays((current) =>
                          on ? current.filter((x) => x !== d.id) : [...current, d.id].sort()
                        )
                      }
                      aria-pressed={on}
                      className={`chip ${on ? 'chip-on' : ''}`}
                    >
                      {d.short}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="School start time">
                <input
                  name="start_time"
                  type="time"
                  value={form.start_time}
                  onChange={(e) => set({ start_time: e.target.value })}
                  className="field"
                />
              </Field>

              <Field label="No. of periods">
                <input
                  name="periods_per_day"
                  type="number"
                  min="1"
                  max="20"
                  value={form.periods_per_day}
                  onChange={(e) => set({ periods_per_day: e.target.value })}
                  className="field"
                />
              </Field>

              <Field label="Period duration (minutes)" span={2}>
                <input
                  name="period_minutes"
                  type="number"
                  min="5"
                  max="240"
                  value={form.period_minutes}
                  onChange={(e) => set({ period_minutes: e.target.value })}
                  className="field"
                />
              </Field>
            </div>

            <BreakBlock
              tone="amber"
              legend="Include short break"
              name="short_break"
              checked={form.short_break}
              onToggle={(v) => set({ short_break: v })}
              after={form.short_break_after}
              onAfter={(v) => set({ short_break_after: v })}
              minutes={form.short_break_minutes}
              onMinutes={(v) => set({ short_break_minutes: v })}
              afterName="short_break_after"
              minutesName="short_break_minutes"
            />

            <BreakBlock
              tone="green"
              legend="Include lunch break"
              name="lunch_break"
              checked={form.lunch_break}
              onToggle={(v) => set({ lunch_break: v })}
              after={form.lunch_after}
              onAfter={(v) => set({ lunch_after: v })}
              minutes={form.lunch_minutes}
              onMinutes={(v) => set({ lunch_minutes: v })}
              afterName="lunch_after"
              minutesName="lunch_minutes"
            />

            <p
              className="rounded-lg px-3 py-2 text-xs"
              style={{ background: 'var(--amber-soft)', color: 'var(--amber-ink)' }}
            >
              This replaces that class&rsquo;s existing periods on the days you picked, and any
              lessons already assigned to them.
            </p>

            <ErrorNote state={state} />
          </form>

          <Timeline
            slots={preview}
            title="Preview (1 day)"
            footer={`${days.length} day(s) × ${preview.length} slots = ${total} total`}
          />
        </div>
      </SidePanel>
    </>
  )
}

function BreakBlock({
  tone,
  legend,
  name,
  checked,
  onToggle,
  after,
  onAfter,
  minutes,
  onMinutes,
  afterName,
  minutesName,
}) {
  return (
    <fieldset
      className="rounded-xl border p-3"
      style={{ borderColor: `var(--${tone})`, background: `var(--${tone}-soft)` }}
    >
      <label className="flex items-center gap-2 text-sm font-medium" style={{ color: `var(--${tone}-ink)` }}>
        <input
          type="checkbox"
          name={name}
          checked={checked}
          onChange={(e) => onToggle(e.target.checked)}
          className="size-4"
          style={{ accentColor: `var(--${tone})` }}
        />
        {legend}
      </label>

      {checked && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <span className="label" style={{ color: `var(--${tone}-ink)` }}>
              After period #
            </span>
            <input
              name={afterName}
              type="number"
              min="1"
              value={after}
              onChange={(e) => onAfter(e.target.value)}
              className="field"
            />
          </div>
          <div>
            <span className="label" style={{ color: `var(--${tone}-ink)` }}>
              Duration (min)
            </span>
            <input
              name={minutesName}
              type="number"
              min="1"
              value={minutes}
              onChange={(e) => onMinutes(e.target.value)}
              className="field"
            />
          </div>
        </div>
      )}
    </fieldset>
  )
}

/* ------------------------------------------------------------ change timing */

export function TimingPanel({ classes, classId, defaults, trigger }) {
  const [open, setOpen] = useState(false)
  const [state, formAction] = useActionState(updateTiming, {})
  useCloseOnSuccess(state, () => setOpen(false))

  const base = { ...DEFAULT_SETTINGS, ...(defaults ?? {}) }
  const [form, setForm] = useState({
    start_time: (base.start_time ?? '08:00').slice(0, 5),
    periods_per_day: base.periods_per_day,
    period_minutes: base.period_minutes,
    short_break_after: base.short_break_after,
    short_break_minutes: base.short_break_minutes,
    lunch_after: base.lunch_after,
    lunch_minutes: base.lunch_minutes,
  })

  const set = (patch) => setForm((current) => ({ ...current, ...patch }))
  const preview = buildDay(form)

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={trigger.className}>
        {trigger.label}
      </button>

      <SidePanel
        open={open}
        onClose={() => setOpen(false)}
        width="max-w-3xl"
        icon="⚙"
        title="Change timing"
        description="Configure period durations and break times"
        footer={
          <>
            <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost">
              Cancel
            </button>
            <Submit form="timing-form" label="Save settings" busyLabel="Applying…" />
          </>
        }
      >
        <div className="grid gap-5 lg:grid-cols-[1fr_16rem]">
          <form id="timing-form" action={formAction} className="flex flex-col gap-4">
            <Field label="Class" required hint="Only this class's bell schedule changes.">
              <Select
                name="class_id"
                searchable
                required
                defaultValue={classId ?? ''}
                placeholder="Select class…"
                options={classes}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="School start time">
                <input
                  name="start_time"
                  type="time"
                  value={form.start_time}
                  onChange={(e) => set({ start_time: e.target.value })}
                  className="field"
                />
              </Field>

              <Field label="No. of periods">
                <input
                  name="periods_per_day"
                  type="number"
                  min="1"
                  max="20"
                  value={form.periods_per_day}
                  onChange={(e) => set({ periods_per_day: e.target.value })}
                  className="field"
                />
              </Field>

              <Field label="Period duration (minutes)" span={2}>
                <input
                  name="period_minutes"
                  type="number"
                  min="5"
                  max="240"
                  value={form.period_minutes}
                  onChange={(e) => set({ period_minutes: e.target.value })}
                  className="field"
                />
              </Field>
            </div>

            <fieldset
              className="rounded-xl border p-3"
              style={{ borderColor: 'var(--amber)', background: 'var(--amber-soft)' }}
            >
              <legend className="px-1 text-xs font-semibold" style={{ color: 'var(--amber-ink)' }}>
                Short break
              </legend>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="label" style={{ color: 'var(--amber-ink)' }}>
                    After period #
                  </span>
                  <input
                    name="short_break_after"
                    type="number"
                    min="0"
                    value={form.short_break_after}
                    onChange={(e) => set({ short_break_after: e.target.value })}
                    className="field"
                  />
                </div>
                <div>
                  <span className="label" style={{ color: 'var(--amber-ink)' }}>
                    Duration (min)
                  </span>
                  <input
                    name="short_break_minutes"
                    type="number"
                    min="0"
                    value={form.short_break_minutes}
                    onChange={(e) => set({ short_break_minutes: e.target.value })}
                    className="field"
                  />
                </div>
              </div>
              <p className="mt-2 text-xs" style={{ color: 'var(--amber-ink)', opacity: 0.85 }}>
                Set After period # to 0 for no break.
              </p>
            </fieldset>

            <fieldset
              className="rounded-xl border p-3"
              style={{ borderColor: 'var(--green)', background: 'var(--green-soft)' }}
            >
              <legend className="px-1 text-xs font-semibold" style={{ color: 'var(--green-ink)' }}>
                Lunch / long break
              </legend>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="label" style={{ color: 'var(--green-ink)' }}>
                    After period #
                  </span>
                  <input
                    name="lunch_after"
                    type="number"
                    min="0"
                    value={form.lunch_after}
                    onChange={(e) => set({ lunch_after: e.target.value })}
                    className="field"
                  />
                </div>
                <div>
                  <span className="label" style={{ color: 'var(--green-ink)' }}>
                    Duration (min)
                  </span>
                  <input
                    name="lunch_minutes"
                    type="number"
                    min="0"
                    value={form.lunch_minutes}
                    onChange={(e) => set({ lunch_minutes: e.target.value })}
                    className="field"
                  />
                </div>
              </div>
            </fieldset>

            <p
              className="rounded-lg px-3 py-2 text-xs"
              style={{ background: 'var(--amber-soft)', color: 'var(--amber-ink)' }}
            >
              The whole schedule is rebuilt on the days that class already has, so lessons already
              assigned to the old slots are cleared.
            </p>

            <ErrorNote state={state} />
          </form>

          <Timeline slots={preview} title="Live timeline" />
        </div>
      </SidePanel>
    </>
  )
}
