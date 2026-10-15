'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Spinner } from '@/components/spinner'
import { useToast } from '@/components/toast'
import { Select } from '@/components/combobox'
import { PALETTES } from '@/lib/appearance'
import { MONTHS } from '@/lib/fee-options'
import {
  saveAcademicSettings,
  saveAppearanceSettings,
  saveFeeSettings,
  saveNotificationSettings,
  saveSchoolInfo,
} from './actions'

function SaveButton({ form, label = 'Save Changes' }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" form={form} disabled={pending} className="btn btn-primary">
      {pending ? (
        <>
          <Spinner /> Saving…
        </>
      ) : (
        label
      )}
    </button>
  )
}

function Block({ title, subtitle, children }) {
  return (
    <div className="card overflow-hidden">
      <div className="panel-head flex items-center gap-3 px-5 py-3.5">
        <span
          className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/15 text-xs text-white"
          aria-hidden="true"
        >
          ▣
        </span>
        <div>
          <p className="text-sm font-semibold text-white">{title}</p>
          {subtitle && <p className="text-xs text-white/75">{subtitle}</p>}
        </div>
      </div>
      <div className="grid gap-4 p-5 sm:grid-cols-2">{children}</div>
    </div>
  )
}

function Field({ label, hint, children, full }) {
  return (
    <div className={full ? 'sm:col-span-2' : undefined}>
      <span className="label">
        {label}
        {hint && (
          <span className="ml-1 font-normal" style={{ color: 'var(--muted-2)' }}>
            · {hint}
          </span>
        )}
      </span>
      {children}
    </div>
  )
}

// The toggle row from the design: a label, a hint, and a switch on the right.
function Switch({ name, label, hint, defaultChecked }) {
  return (
    <div
      className="flex items-center justify-between gap-4 py-3"
      style={{ borderBottom: '1px solid var(--border-soft)' }}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
          {label}
        </p>
        {hint && (
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            {hint}
          </p>
        )}
      </div>
      <label className="switch shrink-0">
        <input type="checkbox" name={name} defaultChecked={defaultChecked} />
      </label>
    </div>
  )
}

function Footer({ form, canWrite }) {
  return (
    <div
      className="card flex flex-wrap items-center justify-between gap-3 px-5 py-3.5"
      style={{ background: 'var(--card-alt)' }}
    >
      <p className="text-sm" style={{ color: 'var(--muted)' }}>
        Changes are saved to the database immediately.
      </p>
      {canWrite && <SaveButton form={form} />}
    </div>
  )
}

function Errors({ state }) {
  if (!state?.error) return null
  return (
    <p
      className="rounded-lg px-3 py-2 text-sm"
      style={{ background: 'var(--red-soft)', color: 'var(--red)' }}
    >
      {state.error}
    </p>
  )
}

// Raises a toast once per successful save. Same timestamp comparison the
// slide-overs use -- saving the same form twice gives the same message and
// would otherwise look like nothing happened.
function useSaved(state) {
  const { success } = useToast()
  const [seen, setSeen] = useState(null)
  if (state?.ok && state.at !== seen) {
    setSeen(state.at)
    queueMicrotask(() => success(state.ok))
  }
}

/* ============================================================ school info */

function SchoolInfo({ school, canWrite }) {
  const [state, formAction] = useActionState(saveSchoolInfo, {})
  useSaved(state)

  return (
    <form id="school-info-form" action={formAction} className="flex flex-col gap-4">
      <fieldset disabled={!canWrite} className="contents">
        <div className="grid gap-3 sm:grid-cols-4">
          {[
            ['School Name', school.school_name ?? '—'],
            ['Principal', school.principal_name ?? '—'],
            ['City', school.city ?? '—'],
            ['Phone', school.phone ?? '—'],
          ].map(([label, value]) => (
            <div key={label} className="card p-3.5">
              <p className="text-[0.65rem]" style={{ color: 'var(--muted)' }}>
                {label}
              </p>
              <p className="mt-0.5 truncate text-sm font-medium" style={{ color: 'var(--ink)' }}>
                {value}
              </p>
            </div>
          ))}
        </div>

        <Block title="School Identity" subtitle="Basic school information">
          <Field label="School Name" hint="required">
            <input
              name="school_name"
              required
              defaultValue={school.school_name ?? ''}
              className="field"
            />
          </Field>
          <Field label="School Code" hint="short identifier">
            <input
              name="short_code"
              defaultValue={school.short_code ?? ''}
              placeholder="e.g. BFS-001"
              className="field"
            />
          </Field>
          <Field label="School Type">
            <Select
              name="school_type"
              defaultValue={school.school_type ?? 'private'}
              options={[
                { id: 'private', label: 'Private' },
                { id: 'public', label: 'Public' },
                { id: 'trust', label: 'Trust' },
                { id: 'ngo', label: 'NGO' },
                { id: 'other', label: 'Other' },
              ]}
            />
          </Field>
          <Field label="Affiliation / Board">
            <input
              name="affiliation"
              defaultValue={school.affiliation ?? ''}
              placeholder="e.g. BISE Lahore"
              className="field"
            />
          </Field>
          <Field label="Established Year">
            <input
              name="established_year"
              type="number"
              min="1800"
              defaultValue={school.established_year ?? ''}
              placeholder="e.g. 1995"
              className="field"
            />
          </Field>
          <Field label="Principal Name">
            <input
              name="principal_name"
              defaultValue={school.principal_name ?? ''}
              placeholder="Full name"
              className="field"
            />
          </Field>
        </Block>

        <Block title="Location & Contact" subtitle="Address and communication details">
          <Field label="Street Address" hint="full address" full>
            <input
              name="address"
              defaultValue={school.address ?? ''}
              placeholder="Street, Area"
              className="field"
            />
          </Field>
          <Field label="City">
            <input
              name="city"
              defaultValue={school.city ?? ''}
              placeholder="e.g. Lahore"
              className="field"
            />
          </Field>
          <Field label="Province">
            <input
              name="province"
              defaultValue={school.province ?? ''}
              placeholder="e.g. Punjab"
              className="field"
            />
          </Field>
          <Field label="Phone Number">
            <input
              name="phone"
              defaultValue={school.phone ?? ''}
              placeholder="+92 300 0000000"
              className="field"
            />
          </Field>
          <Field label="Email Address">
            <input
              name="email"
              type="email"
              defaultValue={school.email ?? ''}
              placeholder="school@example.com"
              className="field"
            />
          </Field>
          <Field label="Website" full>
            <input
              name="website"
              defaultValue={school.website ?? ''}
              placeholder="https://"
              className="field"
            />
          </Field>
        </Block>
      </fieldset>

      <Errors state={state} />
      <Footer form="school-info-form" canWrite={canWrite} />
    </form>
  )
}

/* =============================================================== academic */

function Academic({ block, canWrite }) {
  const [state, formAction] = useActionState(saveAcademicSettings, {})
  useSaved(state)

  return (
    <form id="academic-form" action={formAction} className="flex flex-col gap-4">
      <fieldset disabled={!canWrite} className="contents">
        <Block title="Academic Year" subtitle="Session and year configuration">
          <Field label="Current Academic Year">
            <input
              name="academic_year"
              defaultValue={block.academic_year ?? ''}
              placeholder="2025-2026"
              className="field"
            />
          </Field>
          <Field label="Working Days Per Week">
            <Select
              name="working_days_per_week"
              defaultValue={String(block.working_days_per_week ?? 5)}
              options={[4, 5, 6, 7].map((n) => ({ id: String(n), label: `${n} days` }))}
            />
          </Field>
          <Field label="Session Start Month">
            <Select
              name="session_start_month"
              defaultValue={block.session_start_month ? String(block.session_start_month) : ''}
              placeholder="Select month…"
              options={MONTHS.map((m) => ({ id: String(m.id), label: m.label }))}
            />
          </Field>
          <Field label="Session End Month">
            <Select
              name="session_end_month"
              defaultValue={block.session_end_month ? String(block.session_end_month) : ''}
              placeholder="Select month…"
              options={MONTHS.map((m) => ({ id: String(m.id), label: m.label }))}
            />
          </Field>
          <Field label="School Start Time">
            <input
              name="school_start_time"
              type="time"
              defaultValue={block.school_start_time ?? '07:30'}
              className="field"
            />
          </Field>
          <Field label="School End Time">
            <input
              name="school_end_time"
              type="time"
              defaultValue={block.school_end_time ?? '14:00'}
              className="field"
            />
          </Field>
        </Block>

        <Block title="Periods & Grading" subtitle="Class periods and assessment rules">
          <Field label="Periods Per Day">
            <input
              name="periods_per_day"
              type="number"
              min="1"
              max="20"
              defaultValue={block.periods_per_day ?? 7}
              className="field"
            />
          </Field>
          <Field label="Period Duration" hint="minutes">
            <input
              name="period_duration"
              type="number"
              min="5"
              defaultValue={block.period_duration ?? 45}
              className="field"
            />
          </Field>
          <Field label="Pass Marks" hint="% — applies to exams, results and reports">
            <input
              name="pass_marks"
              type="number"
              min="0"
              max="100"
              defaultValue={block.pass_marks ?? 33}
              className="field"
            />
          </Field>
          <Field label="Grade Scale" hint="the ladder used on every result">
            <Select
              name="grade_scale"
              defaultValue={block.grade_scale ?? 'percentage'}
              options={[
                { id: 'percentage', label: 'Percentage (A+ … F)' },
                { id: 'gpa', label: 'GPA (4.0 scale)' },
                { id: 'marks', label: 'Marks only' },
              ]}
            />
          </Field>
        </Block>
      </fieldset>

      <Errors state={state} />
      <Footer form="academic-form" canWrite={canWrite} />
    </form>
  )
}

/* =================================================================== fees */

function Fees({ block, canWrite }) {
  const [state, formAction] = useActionState(saveFeeSettings, {})
  useSaved(state)

  return (
    <form id="fee-form" action={formAction} className="flex flex-col gap-4">
      <fieldset disabled={!canWrite} className="contents">
        <div className="grid gap-3 sm:grid-cols-4">
          {[
            ['Currency', block.currency_code ?? 'PKR'],
            ['Fee Frequency', block.fee_frequency ?? 'Monthly'],
            ['Grace Days', `${block.grace_days ?? 10} days`],
            ['Late Fee/Day', `PKR ${block.late_fee_per_day ?? 0}`],
          ].map(([label, value]) => (
            <div key={label} className="card p-3.5">
              <p className="text-[0.65rem]" style={{ color: 'var(--muted)' }}>
                {label}
              </p>
              <p className="mt-0.5 text-sm font-medium capitalize" style={{ color: 'var(--ink)' }}>
                {value}
              </p>
            </div>
          ))}
        </div>

        <Block title="Currency & Billing" subtitle="Fee collection configuration">
          <Field label="Currency Code">
            <input
              name="currency_code"
              defaultValue={block.currency_code ?? 'PKR'}
              className="field"
            />
          </Field>
          <Field label="Currency Symbol">
            <input
              name="currency_symbol"
              defaultValue={block.currency_symbol ?? 'Rs'}
              className="field"
            />
          </Field>
          <Field label="Fee Frequency">
            <Select
              name="fee_frequency"
              defaultValue={block.fee_frequency ?? 'monthly'}
              options={[
                { id: 'monthly', label: 'Monthly' },
                { id: 'quarterly', label: 'Quarterly' },
                { id: 'half_yearly', label: 'Half yearly' },
                { id: 'annual', label: 'Annual' },
              ]}
            />
          </Field>
          <Field label="Challan Validity" hint="days">
            <input
              name="challan_validity"
              type="number"
              min="1"
              defaultValue={block.challan_validity ?? 30}
              className="field"
            />
          </Field>
        </Block>

        <div className="card overflow-hidden">
          <div className="panel-head flex items-center gap-3 px-5 py-3.5">
            <span
              className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/15 text-xs text-white"
              aria-hidden="true"
            >
              ₨
            </span>
            <div>
              <p className="text-sm font-semibold text-white">Late Fee Rules</p>
              <p className="text-xs text-white/75">Penalty and overdue settings</p>
            </div>
          </div>

          <div className="px-5 pb-5">
            <Switch
              name="late_fee_enabled"
              label="Enable Late Fee"
              hint="Charge a fine after the grace period"
              defaultChecked={block.late_fee_enabled ?? true}
            />
            <Switch
              name="auto_mark_overdue"
              label="Auto Mark Overdue"
              hint="Automatically flag unpaid challans"
              defaultChecked={block.auto_mark_overdue ?? true}
            />

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Grace Period" hint="days before late fee">
                <input
                  name="grace_period"
                  type="number"
                  min="0"
                  defaultValue={block.grace_days ?? 10}
                  className="field"
                />
              </Field>
              <Field label="Late Fee Per Day" hint="PKR">
                <input
                  name="late_fee_per_day"
                  type="number"
                  min="0"
                  defaultValue={block.late_fee_per_day ?? 5}
                  className="field"
                />
              </Field>
              <Field label="Fine Per Absence" hint="PKR">
                <input
                  name="fine_per_absence"
                  type="number"
                  min="0"
                  defaultValue={block.fine_per_absence ?? 0}
                  className="field"
                />
              </Field>
            </div>

            <p className="mt-3 text-xs" style={{ color: 'var(--muted)' }}>
              These rules are what the <strong>Apply late fees</strong> action on Collect Fee reads.
              The fine is recomputed from each challan&rsquo;s due date, so running it twice in a day
              does not charge twice.
            </p>
          </div>
        </div>
      </fieldset>

      <Errors state={state} />
      <Footer form="fee-form" canWrite={canWrite} />
    </form>
  )
}

/* ========================================================== notifications */

function Notifications({ block, canWrite }) {
  const [state, formAction] = useActionState(saveNotificationSettings, {})
  useSaved(state)

  const GROUPS = [
    {
      title: 'Email Notifications',
      subtitle: 'Alerts sent via email',
      rows: [
        ['email_fee_reminders', 'Fee Reminders', 'Email when fee is due or overdue', true],
        ['email_low_attendance', 'Low Attendance', 'Email when attendance drops below threshold', false],
        ['email_exam_results', 'Exam Results', 'Email when results are published', true],
      ],
    },
    {
      title: 'SMS Notifications',
      subtitle: 'Alerts sent via SMS',
      rows: [
        ['sms_fee_alerts', 'Fee Alerts via SMS', 'SMS reminder for fee due/overdue', true],
        ['sms_attendance_alerts', 'Attendance Alerts via SMS', 'SMS for absent/low attendance', true],
        ['sms_exam_alerts', 'Exam Alerts via SMS', 'SMS for exam schedule & results', false],
      ],
    },
    {
      title: 'In-App Notifications',
      subtitle: 'Dashboard alerts',
      rows: [['in_app_all', 'All In-App Alerts', 'Show all notifications in the dashboard', true]],
    },
  ]

  return (
    <form id="notifications-form" action={formAction} className="flex flex-col gap-4">
      <fieldset disabled={!canWrite} className="contents">
        {GROUPS.map((g) => (
          <div key={g.title} className="card overflow-hidden">
            <div className="panel-head flex items-center gap-3 px-5 py-3.5">
              <span
                className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/15 text-xs text-white"
                aria-hidden="true"
              >
                ◉
              </span>
              <div>
                <p className="text-sm font-semibold text-white">{g.title}</p>
                <p className="text-xs text-white/75">{g.subtitle}</p>
              </div>
            </div>
            <div className="px-5 pb-2">
              {g.rows.map(([name, label, hint, fallback]) => (
                <Switch
                  key={name}
                  name={name}
                  label={label}
                  hint={hint}
                  defaultChecked={block[name] ?? fallback}
                />
              ))}
            </div>
          </div>
        ))}
      </fieldset>

      <Errors state={state} />
      <Footer form="notifications-form" canWrite={canWrite} />
    </form>
  )
}

/* ============================================================= appearance */

function Appearance({ block, canWrite }) {
  const [state, formAction] = useActionState(saveAppearanceSettings, {})
  useSaved(state)

  const THEMES = Object.entries(PALETTES).map(([id, p]) => ({
    id,
    label: p.label,
    colour: p.swatch,
  }))

  return (
    <form id="appearance-form" action={formAction} className="flex flex-col gap-4">
      <fieldset disabled={!canWrite} className="contents">
        <div className="card overflow-hidden">
          <div className="panel-head flex items-center gap-3 px-5 py-3.5">
            <span
              className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/15 text-xs text-white"
              aria-hidden="true"
            >
              ◐
            </span>
            <div>
              <p className="text-sm font-semibold text-white">Theme &amp; Colors</p>
              <p className="text-xs text-white/75">Visual appearance settings</p>
            </div>
          </div>

          <div className="p-5">
            <span className="label">Color Theme</span>
            <div className="grid gap-2 sm:grid-cols-4">
              {THEMES.map((t) => (
                <label key={t.id} className="segment">
                  <input
                    type="radio"
                    name="color_theme"
                    value={t.id}
                    defaultChecked={(block.color_theme ?? 'violet') === t.id}
                    className="sr-only"
                  />
                  <span
                    className="size-3 rounded-full"
                    style={{ background: t.colour }}
                    aria-hidden="true"
                  />
                  {t.label}
                </label>
              ))}
            </div>

            <div className="mt-4 max-w-sm">
              <Field label="Sidebar Style">
                <Select
                  name="sidebar_style"
                  defaultValue={block.sidebar_style ?? 'dark'}
                  options={[
                    { id: 'dark', label: 'Default (Dark)' },
                    { id: 'light', label: 'Light' },
                  ]}
                />
              </Field>
            </div>

            <p className="mt-3 text-xs" style={{ color: 'var(--muted)' }}>
              Both apply school-wide, to everyone. Light and dark mode stay
              personal — each person picks that in the top bar.
            </p>
          </div>
        </div>

        <Block title="Locale & Formatting" subtitle="Language, date, and timezone">
          <Field label="Language">
            <div
              className="flex items-center gap-2 rounded-[0.55rem] px-3 py-[0.55rem] text-sm"
              style={{
                background: 'var(--card-alt)',
                border: '1px solid var(--border)',
                color: 'var(--muted)',
              }}
            >
              <span style={{ color: 'var(--ink)' }}>English</span>
              <span className="pill pill-muted ml-auto">Only option</span>
            </div>
            <p className="mt-1.5 text-xs" style={{ color: 'var(--muted)' }}>
              Urdu needs translation groundwork — message catalogues and
              right-to-left layout — before it can be offered here.
            </p>
          </Field>
          <Field label="Date Format">
            <Select
              name="date_format"
              defaultValue={block.date_format ?? 'DD/MM/YYYY'}
              options={[
                { id: 'DD/MM/YYYY', label: 'DD/MM/YYYY' },
                { id: 'MM/DD/YYYY', label: 'MM/DD/YYYY' },
                { id: 'YYYY-MM-DD', label: 'YYYY-MM-DD' },
              ]}
            />
          </Field>
          <Field label="Timezone" full>
            <Select
              name="timezone"
              defaultValue={block.timezone ?? 'Asia/Karachi'}
              options={[
                { id: 'Asia/Karachi', label: 'Asia/Karachi (PKT +05:00)' },
                { id: 'Asia/Dubai', label: 'Asia/Dubai (GST +04:00)' },
                { id: 'UTC', label: 'UTC' },
              ]}
            />
          </Field>
        </Block>
      </fieldset>

      <Errors state={state} />
      <Footer form="appearance-form" canWrite={canWrite} />
    </form>
  )
}

export default function SettingsTabs({ section, school, blocks, canWrite }) {
  if (section === 'academic') {
    return <Academic block={blocks.academic ?? {}} canWrite={canWrite} />
  }
  if (section === 'fees') {
    return <Fees block={blocks.fees ?? {}} canWrite={canWrite} />
  }
  if (section === 'notifications') {
    return <Notifications block={blocks.notifications ?? {}} canWrite={canWrite} />
  }
  if (section === 'appearance') {
    return <Appearance block={blocks.appearance ?? {}} canWrite={canWrite} />
  }
  return <SchoolInfo school={school} canWrite={canWrite} />
}
