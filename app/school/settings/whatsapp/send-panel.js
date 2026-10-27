'use client'

import { useActionState, useMemo, useState } from 'react'
import { Spinner } from '@/components/spinner'
import SidePanel from '@/components/side-panel'
import { Select } from '@/components/combobox'
import { useCloseOnSuccess } from '@/components/use-close-on-success'
import { TEMPLATE_VARIABLES, renderTemplate, usedVariables } from '@/lib/whatsapp-options'
import { queueAnnouncement } from './actions'

const FREE_TEXT = '__free__'

export default function SendPanel({ templates, classes, sections, trigger }) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState(queueAnnouncement, {})

  // Free text is the default. On this channel there is no approval queue, so
  // forcing somebody through a saved message to send one notice would be
  // ceremony for its own sake.
  const [templateId, setTemplateId] = useState(FREE_TEXT)
  const [classId, setClassId] = useState('')
  const [sectionId, setSectionId] = useState('')
  const [values, setValues] = useState({})
  const [typed, setTyped] = useState('')

  // Stays OPEN after a successful queue: the result says how many were
  // skipped and who has no usable number, and closing would throw that away
  // -- it is the only place that list is shown.
  useCloseOnSuccess(state, () => {})

  const usingTemplate = templateId !== FREE_TEXT
  const template = usingTemplate ? templates.find((t) => t.id === templateId) : null
  // Read off the BODY, not the stored variables column: the body is the
  // source of truth, and a template edited since would otherwise ask for
  // fields it no longer uses.
  const fields = usingTemplate ? usedVariables(template?.body) : []
  const labelFor = (key) =>
    TEMPLATE_VARIABLES.find((v) => v.key === key)?.label ?? key.replace(/_/g, ' ')

  const visibleSections = useMemo(
    () => (classId ? sections.filter((s) => s.class_id === classId) : []),
    [classId, sections]
  )

  const preview = usingTemplate ? renderTemplate(template?.body, values) : typed
  // Anything still in braces after rendering is a blank nobody filled, and
  // would reach a parent exactly as written.
  const unfilled = usingTemplate && usedVariables(preview).length > 0

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={trigger.className}>
        {trigger.label}
      </button>

      <SidePanel
        open={open}
        busy={pending}
        onClose={() => setOpen(false)}
        title="New message"
        description="To a class, a section, or every active student"
        icon="✉"
        footer={
          <>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={pending}
              className="btn btn-ghost"
            >
              {state?.ok ? 'Done' : 'Cancel'}
            </button>
            <button
              type="submit"
              form="wa-send"
              disabled={pending || unfilled || !preview?.trim()}
              className="btn btn-primary"
            >
              {pending ? (
                <>
                  <Spinner /> Queueing…
                </>
              ) : (
                'Queue messages'
              )}
            </button>
          </>
        }
      >
        <form id="wa-send" action={formAction} className="flex flex-col gap-4">
          <div>
            <label className="label" htmlFor="wa-template">
              Message
            </label>
            <Select
              id="wa-template"
              name="template_id_display"
              defaultValue={templateId}
              onChangeValue={(v) => {
                setTemplateId(v)
                setValues({})
              }}
              options={[
                { id: FREE_TEXT, label: 'Write a new message' },
                ...templates.map((t) => ({ id: t.id, label: t.name })),
              ]}
            />
            {/* The action wants an id or nothing at all. Posting the
                sentinel would send the RPC hunting for a template whose id
                is "__free__". */}
            <input type="hidden" name="template_id" value={usingTemplate ? templateId : ''} />
          </div>

          {!usingTemplate && (
            <div>
              <label className="label" htmlFor="wa-body">
                Text *
              </label>
              <textarea
                id="wa-body"
                name="body"
                rows={5}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder="School will remain closed tomorrow on account of heavy rain."
                className="field resize-none"
              />
              <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                Everybody selected gets this exact text. Reuse it later by saving it under Saved
                Messages.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="wa-class">
                Class
              </label>
              <Select
                id="wa-class"
                name="class_id"
                defaultValue={classId}
                onChangeValue={(v) => {
                  setClassId(v)
                  setSectionId('')
                }}
                options={[
                  { id: '', label: 'Every active student' },
                  ...classes.map((c) => ({ id: c.id, label: c.name })),
                ]}
              />
            </div>
            <div>
              <label className="label" htmlFor="wa-section">
                Section
              </label>
              {/* Remounted whenever the class changes. Combobox is
                  uncontrolled, so without a new key it would keep showing a
                  section belonging to the class you just left — and post
                  that id. */}
              <Select
                key={classId || 'all'}
                id="wa-section"
                name="section_id"
                defaultValue={sectionId}
                onChangeValue={setSectionId}
                options={[
                  { id: '', label: classId ? 'Whole class' : '—' },
                  ...visibleSections.map((s) => ({ id: s.id, label: s.name })),
                ]}
              />
            </div>
          </div>

          {fields.length > 0 && (
            <div className="flex flex-col gap-3">
              <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                Fill in the blanks
              </p>
              {/* One input per merge field the body actually uses, posted as
                  var_<key> so the action can read them back by name without
                  depending on the order they were rendered in. */}
              {fields.map((key) => (
                <div key={key}>
                  <label className="label" htmlFor={`wa-var-${key}`}>
                    {labelFor(key)}{' '}
                    <span className="font-mono" style={{ color: 'var(--muted)' }}>
                      {`{${key}}`}
                    </span>
                  </label>
                  <input
                    id={`wa-var-${key}`}
                    name={`var_${key}`}
                    value={values[key] ?? ''}
                    onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                    className="field"
                  />
                </div>
              ))}
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                These are the same for everybody in this send. A message naming each child
                individually is an absence alert, which auto-send queues per student.
              </p>
            </div>
          )}

          {preview?.trim() && (
            <div>
              <p className="label">Preview</p>
              <div
                className="rounded-xl px-3.5 py-2.5 text-sm whitespace-pre-wrap"
                style={{ background: 'var(--green-soft)', color: 'var(--ink)' }}
              >
                {preview}
              </div>
              {unfilled && (
                <p className="mt-1 text-xs" style={{ color: 'var(--red)' }}>
                  Some blanks are still empty — they would go out to parents exactly as you see
                  them here.
                </p>
              )}
            </div>
          )}

          <p
            className="rounded-lg px-3 py-2 text-xs"
            style={{ background: 'var(--card-alt)', color: 'var(--muted)' }}
          >
            One message per <strong>number</strong>, not per student — three siblings on one
            father&rsquo;s phone is one message. Anybody who has opted out is skipped. Sending is
            paced at a few seconds apiece to protect the number, so a large batch takes a while to
            clear.
          </p>

          {state?.error && (
            <p
              className="rounded-lg px-3 py-2 text-sm"
              style={{ background: 'var(--red-soft)', color: 'var(--red)' }}
            >
              {state.error}
            </p>
          )}

          {state?.ok && (
            <div
              className="rounded-xl px-3.5 py-3"
              style={{ background: 'var(--green-soft)', border: '1px solid transparent' }}
            >
              <p className="text-sm font-semibold" style={{ color: 'var(--green-ink)' }}>
                {state.ok}
              </p>

              {/* The students nobody can reach. Shown, not summarised away:
                  these are exactly the parents who later say they were never
                  told, and the fix is a two-minute edit to a record. */}
              {state.unreachable?.length > 0 && (
                <>
                  <p className="mt-2 text-xs font-medium" style={{ color: 'var(--green-ink)' }}>
                    No usable mobile on file — these were not messaged:
                  </p>
                  <ul
                    className="mt-1 max-h-48 overflow-y-auto text-xs"
                    style={{ color: 'var(--green-ink)' }}
                  >
                    {state.unreachable.map((u) => (
                      <li key={u.id}>
                        {u.name}
                        {u.admission_number ? ` (${u.admission_number})` : ''} — {u.reason}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </form>
      </SidePanel>
    </>
  )
}
