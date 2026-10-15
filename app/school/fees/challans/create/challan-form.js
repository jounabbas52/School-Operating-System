'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Spinner } from '@/components/spinner'
import { useToast } from '@/components/toast'
import Combobox, { Select } from '@/components/combobox'
import { FEE_TYPES, FEE_TYPE_LABEL, MONTHS, money, monthKey } from '@/lib/fee-options'
import { generateClassChallans, generateMonthlyBatch, saveChallan } from '../../actions'

const MODES = [
  { id: 'single', label: 'Single Student', hint: 'One student', icon: '◉' },
  { id: 'class', label: 'Entire Class', hint: 'Bulk by class', icon: '◎' },
  { id: 'batch', label: 'Monthly Batch', hint: 'Auto from policy', icon: '▦' },
]

function GenerateButton({ form, label, disabled }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      form={form}
      disabled={pending || disabled}
      className="btn btn-primary w-full !py-2.5"
    >
      {pending ? (
        <>
          <Spinner /> Generating…
        </>
      ) : (
        label
      )}
    </button>
  )
}

// The step rail from the design. It reads progress off the form rather than
// walking the user through five screens -- the form is short enough to show at
// once, and a wizard that hides the amount while you pick a class is slower.
function Steps({ done }) {
  const STEPS = ['Choose Mode', 'Select Class', 'Fee Details', 'Set Due Date', 'Generate']
  return (
    <ol className="card flex flex-wrap items-center gap-x-2 gap-y-2 p-3">
      {STEPS.map((label, i) => {
        const complete = done[i]
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className="flex size-5 shrink-0 items-center justify-center rounded-full text-[0.6rem] font-bold"
              style={{
                background: complete ? 'var(--brand)' : 'var(--card-alt)',
                color: complete ? '#fff' : 'var(--muted)',
                border: complete ? 'none' : '1px solid var(--border)',
              }}
              aria-hidden="true"
            >
              {complete ? '✓' : i + 1}
            </span>
            <span
              className="text-xs font-medium"
              style={{ color: complete ? 'var(--ink)' : 'var(--muted)' }}
            >
              {label}
            </span>
            {i < STEPS.length - 1 && (
              <span
                className="hidden h-px w-6 sm:block"
                style={{ background: 'var(--border)' }}
                aria-hidden="true"
              />
            )}
          </li>
        )
      })}
    </ol>
  )
}

export default function ChallanForm({ schoolName, classes, sections, students, policyByClass }) {
  const [mode, setMode] = useState('single')

  const [single, singleAction] = useActionState(saveChallan, {})
  const [perClass, perClassAction] = useActionState(generateClassChallans, {})
  const [batch, batchAction] = useActionState(generateMonthlyBatch, {})

  const state = mode === 'single' ? single : mode === 'class' ? perClass : batch

  const { success } = useToast()
  const [seen, setSeen] = useState(null)
  if (state?.ok && state.at !== seen) {
    setSeen(state.at)
    queueMicrotask(() => success(state.ok))
  }

  const now = new Date()
  const [classId, setClassId] = useState('')
  const [sectionId, setSectionId] = useState('')
  const [studentId, setStudentId] = useState('')
  const [feeType, setFeeType] = useState('monthly')
  const [amount, setAmount] = useState('')
  const [lateFee, setLateFee] = useState('')
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())

  // Last day of the chosen month: the house default for a due date.
  const defaultDue = `${year}-${String(month).padStart(2, '0')}-${String(
    new Date(year, month, 0).getDate()
  ).padStart(2, '0')}`
  const [dueDate, setDueDate] = useState(defaultDue)

  const visibleSections = classId ? sections.filter((s) => s.class_id === classId) : sections
  const classStudents = classId ? students.filter((s) => s.class_id === classId) : students
  const visibleStudents = sectionId
    ? classStudents.filter((s) => s.section_id === sectionId)
    : classStudents

  const student = students.find((s) => s.id === studentId)
  const policy = policyByClass[classId]

  // Picking a student fills the amount from their own fee. Typing over it
  // wins -- the field is not locked, it is pre-filled.
  function chooseStudent(id) {
    setStudentId(id)
    const picked = students.find((s) => s.id === id)
    if (picked?.fee > 0 && String(amount).trim() === '') setAmount(String(picked.fee))
  }

  const effectiveAmount =
    Number(amount) ||
    (mode === 'single' ? student?.fee ?? 0 : policy ? Number(policy.tuition_fee) || 0 : 0)
  const total = effectiveAmount + (Number(lateFee) || 0)

  const className = classes.find((c) => c.id === classId)?.label
  const sectionName = sections.find((s) => s.id === sectionId)?.label

  const done = [
    true,
    Boolean(mode === 'batch' ? month : classId),
    effectiveAmount > 0 || mode === 'batch',
    Boolean(dueDate),
    false,
  ]

  const formId =
    mode === 'single' ? 'challan-single' : mode === 'class' ? 'challan-class' : 'challan-batch'

  return (
    <div className="flex flex-col gap-4">
      <Steps done={done} />

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        {/* ------------------------------------------------------- the form */}
        <div className="card overflow-hidden">
          <div className="panel-head flex items-center gap-3 px-5 py-4">
            <span
              className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/15 text-sm text-white"
              aria-hidden="true"
            >
              ▤
            </span>
            <div>
              <p className="text-sm font-semibold text-white">Challan Details</p>
              <p className="text-xs text-white/75">All searchable fields — type to filter</p>
            </div>
          </div>

          <div className="flex flex-col gap-4 p-5">
            <div>
              <p
                className="mb-2 text-[0.68rem] font-bold uppercase tracking-wider"
                style={{ color: 'var(--muted)' }}
              >
                Generation Mode
              </p>
              <div className="grid gap-2 sm:grid-cols-3">
                {MODES.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMode(m.id)}
                    className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition"
                    style={{
                      background: mode === m.id ? 'var(--brand-soft)' : 'var(--card)',
                      border: `1px solid ${mode === m.id ? 'var(--brand)' : 'var(--border)'}`,
                    }}
                  >
                    <span
                      className="flex size-7 shrink-0 items-center justify-center rounded-md text-xs"
                      style={{
                        background: mode === m.id ? 'var(--brand)' : 'var(--card-alt)',
                        color: mode === m.id ? '#fff' : 'var(--muted)',
                      }}
                      aria-hidden="true"
                    >
                      {m.icon}
                    </span>
                    <span className="min-w-0">
                      <span
                        className="block text-xs font-semibold"
                        style={{ color: mode === m.id ? 'var(--brand-ink)' : 'var(--ink-2)' }}
                      >
                        {m.label}
                      </span>
                      <span className="block text-[0.65rem]" style={{ color: 'var(--muted)' }}>
                        {m.hint}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* ---------------------------------------------- single student */}
            {mode === 'single' && (
              <form id="challan-single" action={singleAction} className="flex flex-col gap-4">
                <input type="hidden" name="period_month" value={monthKey(year, month)} />

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor="cf-class">
                      Class *
                    </label>
                    <Combobox
                      id="cf-class"
                      options={classes}
                      defaultValue=""
                      placeholder="Select class…"
                      onChangeValue={(v) => {
                        setClassId(v)
                        setSectionId('')
                        setStudentId('')
                      }}
                      emptyLabel="No classes yet."
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="cf-section">
                      Section
                    </label>
                    <Combobox
                      id="cf-section"
                      options={visibleSections}
                      defaultValue=""
                      placeholder="All sections"
                      onChangeValue={setSectionId}
                      emptyLabel="No sections for that class."
                    />
                  </div>
                </div>

                <div>
                  <label className="label" htmlFor="cf-student">
                    Select Student *
                  </label>
                  <Combobox
                    id="cf-student"
                    name="student_id"
                    required
                    options={visibleStudents}
                    defaultValue=""
                    placeholder="Search student…"
                    onChangeValue={chooseStudent}
                    emptyLabel="No students match."
                  />
                  {classId && visibleStudents.length === 0 && (
                    <p className="mt-1 flex items-center gap-1 text-xs" style={{ color: 'var(--amber)' }}>
                      <span aria-hidden="true">⚠</span> No students found for{' '}
                      {className ?? 'this class'}
                    </p>
                  )}
                </div>

                <div>
                  <label className="label" htmlFor="cf-type">
                    Fee Type *
                  </label>
                  <Select
                    id="cf-type"
                    name="fee_type"
                    defaultValue="monthly"
                    options={FEE_TYPES}
                    onChangeValue={setFeeType}
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor="cf-amount">
                      Amount *
                    </label>
                    <input
                      id="cf-amount"
                      name="amount"
                      type="number"
                      min="1"
                      required
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="Rs 0"
                      className="field"
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="cf-late">
                      Late Fee <span style={{ color: 'var(--muted-2)' }}>(optional)</span>
                    </label>
                    <input
                      id="cf-late"
                      name="late_fee"
                      type="number"
                      min="0"
                      value={lateFee}
                      onChange={(e) => setLateFee(e.target.value)}
                      placeholder="Rs 0"
                      className="field"
                    />
                  </div>
                </div>

                <div>
                  <label className="label" htmlFor="cf-due">
                    Due Date *
                  </label>
                  <input
                    id="cf-due"
                    name="due_date"
                    type="date"
                    required
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="field"
                  />
                </div>

                <div>
                  <label className="label" htmlFor="cf-desc">
                    Description <span style={{ color: 'var(--muted-2)' }}>(optional)</span>
                  </label>
                  <textarea
                    id="cf-desc"
                    name="description"
                    rows={3}
                    placeholder="Additional notes for this challan…"
                    className="field resize-none"
                  />
                </div>

                {single?.error && (
                  <p
                    className="rounded-lg px-3 py-2 text-sm"
                    style={{ background: 'var(--red-soft)', color: 'var(--red)' }}
                  >
                    {single.error}
                  </p>
                )}

                <GenerateButton
                  form="challan-single"
                  label="Generate Challan"
                  disabled={!studentId}
                />
              </form>
            )}

            {/* ----------------------------------------------- entire class */}
            {mode === 'class' && (
              <form id="challan-class" action={perClassAction} className="flex flex-col gap-4">
                <input type="hidden" name="period_month" value={monthKey(year, month)} />

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor="cfc-class">
                      Class *
                    </label>
                    <Combobox
                      id="cfc-class"
                      name="class_id"
                      required
                      options={classes}
                      defaultValue=""
                      placeholder="Select class…"
                      onChangeValue={(v) => {
                        setClassId(v)
                        setSectionId('')
                      }}
                      emptyLabel="No classes yet."
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="cfc-section">
                      Section
                    </label>
                    <Combobox
                      id="cfc-section"
                      name="section_id"
                      options={visibleSections}
                      defaultValue=""
                      placeholder="All sections"
                      onChangeValue={setSectionId}
                      emptyLabel="No sections for that class."
                    />
                  </div>
                </div>

                <p className="text-xs" style={{ color: 'var(--muted)' }}>
                  {classId
                    ? `${visibleStudents.length} active student${visibleStudents.length === 1 ? '' : 's'} will be billed.`
                    : 'Every active student in the class is billed.'}
                </p>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor="cfc-type">
                      Fee Type *
                    </label>
                    <Select
                      id="cfc-type"
                      name="fee_type"
                      defaultValue="monthly"
                      options={FEE_TYPES}
                      onChangeValue={setFeeType}
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="cfc-amount">
                      Fallback amount
                    </label>
                    <input
                      id="cfc-amount"
                      name="amount"
                      type="number"
                      min="0"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="Rs 0"
                      className="field"
                    />
                    <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                      Each student&rsquo;s own fee is used where they have one.
                    </p>
                  </div>
                </div>

                <div>
                  <label className="label" htmlFor="cfc-due">
                    Due Date *
                  </label>
                  <input
                    id="cfc-due"
                    name="due_date"
                    type="date"
                    required
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="field"
                  />
                </div>

                <div>
                  <label className="label" htmlFor="cfc-desc">
                    Description <span style={{ color: 'var(--muted-2)' }}>(optional)</span>
                  </label>
                  <textarea
                    id="cfc-desc"
                    name="description"
                    rows={3}
                    className="field resize-none"
                  />
                </div>

                {perClass?.error && (
                  <p
                    className="rounded-lg px-3 py-2 text-sm"
                    style={{ background: 'var(--red-soft)', color: 'var(--red)' }}
                  >
                    {perClass.error}
                  </p>
                )}

                <GenerateButton
                  form="challan-class"
                  label="Generate Challans"
                  disabled={!classId}
                />
              </form>
            )}

            {/* ---------------------------------------------- monthly batch */}
            {mode === 'batch' && (
              <form id="challan-batch" action={batchAction} className="flex flex-col gap-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor="cfb-month">
                      Month *
                    </label>
                    <select
                      id="cfb-month"
                      name="month"
                      value={month}
                      onChange={(e) => {
                        setMonth(Number(e.target.value))
                        setDueDate('')
                      }}
                      className="field"
                    >
                      {MONTHS.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="cfb-year">
                      Year *
                    </label>
                    <input
                      id="cfb-year"
                      name="year"
                      type="number"
                      value={year}
                      onChange={(e) => setYear(Number(e.target.value))}
                      className="field"
                    />
                  </div>
                </div>

                <div>
                  <label className="label" htmlFor="cfb-due">
                    Due Date *
                  </label>
                  <input
                    id="cfb-due"
                    name="due_date"
                    type="date"
                    required
                    value={dueDate || defaultDue}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="field"
                  />
                </div>

                <div
                  className="rounded-xl px-4 py-3 text-xs"
                  style={{ background: 'var(--card-alt)', border: '1px solid var(--border-soft)' }}
                >
                  <p className="font-semibold" style={{ color: 'var(--ink-2)' }}>
                    What this does
                  </p>
                  <p className="mt-1" style={{ color: 'var(--muted)' }}>
                    Every active student is billed from their class&rsquo;s active fee policy, for
                    the components that policy charges in{' '}
                    {MONTHS.find((m) => m.id === month)?.label}. Students already billed for the
                    month are skipped, so it is safe to run twice.
                  </p>
                </div>

                {batch?.error && (
                  <p
                    className="rounded-lg px-3 py-2 text-sm"
                    style={{ background: 'var(--red-soft)', color: 'var(--red)' }}
                  >
                    {batch.error}
                  </p>
                )}

                <GenerateButton form="challan-batch" label="Generate Monthly Challans" />
              </form>
            )}
          </div>
        </div>

        {/* ---------------------------------------------------- live preview */}
        <div className="lg:sticky lg:top-20 lg:self-start">
          <div className="card overflow-hidden">
            <div className="panel-head flex items-center gap-2 px-4 py-3">
              <span className="text-xs text-white/80" aria-hidden="true">
                ◉
              </span>
              <p className="text-sm font-semibold text-white">Live Preview</p>
            </div>

            <div className="p-5">
              <div className="flex flex-col items-center gap-2 text-center">
                <span
                  className="flex size-10 items-center justify-center rounded-xl text-sm text-white"
                  style={{ background: 'var(--brand-grad)' }}
                  aria-hidden="true"
                >
                  ▤
                </span>
                <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                  {schoolName}
                </p>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>
                  Fee Challan
                </p>
              </div>

              <div
                className="my-4 border-t border-dashed"
                style={{ borderColor: 'var(--border)' }}
              />

              <dl className="flex flex-col gap-2.5 text-xs">
                {[
                  mode === 'single' ? ['Student', student?.label ?? '—'] : null,
                  ['Class', className ?? (mode === 'batch' ? 'All classes' : '—')],
                  mode !== 'batch' ? ['Section', sectionName ?? 'All'] : null,
                  [
                    'Fee Type',
                    mode === 'batch' ? 'From policy' : FEE_TYPE_LABEL[feeType] ?? feeType,
                  ],
                  [
                    'Period',
                    `${MONTHS.find((m) => m.id === month)?.label ?? ''} ${year}`,
                  ],
                  [
                    'Amount',
                    mode === 'batch'
                      ? 'Per policy'
                      : effectiveAmount > 0
                        ? money(effectiveAmount)
                        : '—',
                  ],
                  Number(lateFee) > 0 ? ['Late Fee', money(lateFee)] : null,
                  ['Due Date', dueDate || defaultDue],
                ]
                  .filter(Boolean)
                  .map(([label, value]) => (
                    <div key={label} className="flex items-baseline justify-between gap-3">
                      <dt style={{ color: 'var(--muted)' }}>{label}</dt>
                      <dd
                        className="truncate text-right font-medium"
                        style={{ color: 'var(--ink)' }}
                      >
                        {value}
                      </dd>
                    </div>
                  ))}
              </dl>

              <div
                className="mt-4 flex items-baseline justify-between border-t pt-3"
                style={{ borderColor: 'var(--border)' }}
              >
                <span
                  className="text-[0.68rem] font-bold uppercase tracking-wider"
                  style={{ color: 'var(--muted)' }}
                >
                  Total
                </span>
                <span
                  className="text-lg font-semibold tabular-nums"
                  style={{ color: 'var(--brand-ink)' }}
                >
                  {mode === 'batch' ? 'Per policy' : money(total)}
                </span>
              </div>

              {mode !== 'batch' && classId && !policy && (
                <p className="mt-3 text-[0.68rem]" style={{ color: 'var(--amber)' }}>
                  No active fee policy for {className}. The amount above is whatever you typed, not
                  a policy figure.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
