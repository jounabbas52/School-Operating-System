'use client'

import { useActionState, useRef, useState } from 'react'
import { Spinner } from '@/components/spinner'
import ConfirmButton from '@/components/confirm'
import {
  API_TEMPLATE_STATES,
  AUTO_SEND_EVENTS,
  TEMPLATE_VARIABLES,
  previewTemplate,
  unknownVariables,
} from '@/lib/whatsapp-options'
import { deleteTemplate, saveTemplate } from './actions'

// One template per school event, edited in place.
//
// THE CHIPS ARE THE POINT
//
// Merge fields are NAMED ({student_name}, not {{1}}) precisely so they can
// be clicked into the body at the cursor. A chip that inserts "{{2}}" tells
// the writer nothing, and the sentence becomes unreadable the moment
// anybody reorders it. The cost is that a typo like {studnt_name} is
// possible, so unknownVariables() refuses to save one.

const EVENTS = [
  ...AUTO_SEND_EVENTS.map((e) => ({ id: e.key, label: e.label, hint: e.hint })),
  {
    id: 'announcement',
    label: 'General announcement',
    hint: 'The one you reach for when the school closes unexpectedly.',
  },
]

export default function TemplatesTab({ templates, canWrite, apiReady }) {
  const [event, setEvent] = useState(EVENTS[0].id)

  const current = templates.find((t) => t.event === event && !t.is_deleted)
  const meta = EVENTS.find((e) => e.id === event)

  return (
    <div className="flex flex-col gap-4">
      {/* --------------------------------------------------- event picker */}
      <div className="card flex flex-wrap gap-1 p-2">
        {EVENTS.map((e) => {
          const on = event === e.id
          const written = templates.some((t) => t.event === e.id)
          return (
            <button
              key={e.id}
              type="button"
              onClick={() => setEvent(e.id)}
              className="flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition"
              style={{
                background: on ? 'var(--brand)' : 'transparent',
                color: on ? '#fff' : 'var(--muted)',
              }}
            >
              {e.label}
              {/* A dot for "written", so the gaps are visible without
                  clicking through all six. */}
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full"
                style={{ background: written ? 'var(--green)' : 'var(--muted-2)' }}
              />
            </button>
          )
        })}
      </div>

      <TemplateEditor
        key={event}
        event={event}
        hint={meta?.hint}
        row={current}
        canWrite={canWrite}
        apiReady={apiReady}
      />
    </div>
  )
}

function TemplateEditor({ event, hint, row, canWrite, apiReady }) {
  const [state, action, pending] = useActionState(saveTemplate, {})
  const [body, setBody] = useState(row?.body ?? '')
  const boxRef = useRef(null)

  const unknown = unknownVariables(body)
  const preview = previewTemplate(body)
  const apiState = API_TEMPLATE_STATES[row?.meta_status ?? 'none'] ?? API_TEMPLATE_STATES.none

  // Insert at the caret, not at the end. Appending to the end would mean
  // writing the sentence backwards around the fields, which is exactly the
  // friction the chips exist to remove.
  function insert(key) {
    const el = boxRef.current
    const token = `{${key}}`

    if (!el) {
      setBody((b) => b + token)
      return
    }

    const start = el.selectionStart ?? body.length
    const end = el.selectionEnd ?? body.length
    const next = body.slice(0, start) + token + body.slice(end)

    setBody(next)

    // Put the caret after what was just inserted, on the next frame — the
    // textarea has not re-rendered with the new value yet.
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(start + token.length, start + token.length)
    })
  }

  // Save and Delete are two different actions, so they are two different
  // forms -- and forms cannot nest. The save form carries an id and the
  // buttons sit outside it, associated by the `form` attribute.
  const formId = `tpl-form-${event}`

  return (
    <>
      <form id={formId} action={action} className="flex flex-col gap-4">
        <input type="hidden" name="event" value={event} />
        {row && <input type="hidden" name="id" value={row.id} />}

      {/* ------------------------------------------------- variable chips */}
      <div className="card p-4">
        <p
          className="text-[0.68rem] font-bold uppercase tracking-wider"
          style={{ color: 'var(--muted)' }}
        >
          Click to insert a field at the cursor
        </p>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {TEMPLATE_VARIABLES.map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => insert(v.key)}
              disabled={!canWrite}
              title={v.label}
              className="rounded-lg px-2.5 py-1.5 font-mono text-xs transition"
              style={{ background: 'var(--card-alt)', color: 'var(--brand)' }}
            >
              {`{${v.key}}`}
            </button>
          ))}
        </div>
      </div>

      {/* -------------------------------------------------------- the body */}
      <div className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
              {row ? row.name : 'New template'}
            </p>
            {hint && (
              <p className="mt-0.5 text-xs" style={{ color: 'var(--muted)' }}>
                {hint}
              </p>
            )}
          </div>
          {apiReady && <span className={`pill ${apiState.tone}`}>{apiState.label}</span>}
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor={`tpl-name-${event}`}>
              Name *
            </label>
            <input
              id={`tpl-name-${event}`}
              name="name"
              required
              defaultValue={row?.name ?? ''}
              placeholder="Absence alert"
              disabled={!canWrite}
              className="field"
            />
            <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
              What the office calls it. Parents never see this.
            </p>
          </div>

          <div className="flex items-end">
            <label className="flex items-center gap-2.5 pb-2">
              <input
                type="checkbox"
                name="is_active"
                defaultChecked={row?.is_active ?? true}
                disabled={!canWrite}
                className="size-5"
              />
              <span className="text-sm" style={{ color: 'var(--ink)' }}>
                Use this template for the event
              </span>
            </label>
          </div>
        </div>

        <div className="mt-4">
          <label className="label" htmlFor={`tpl-body-${event}`}>
            Message *
          </label>
          <textarea
            id={`tpl-body-${event}`}
            ref={boxRef}
            name="body"
            rows={5}
            required
            value={body}
            onChange={(e) => setBody(e.target.value)}
            disabled={!canWrite}
            placeholder="Dear Parent, {student_name} of {class_name} was marked {attendance_status} on {date}. — {school_name}"
            className="field resize-none"
          />
          {unknown.length > 0 ? (
            <p className="mt-1 text-xs" style={{ color: 'var(--red)' }}>
              {unknown.map((u) => `{${u}}`).join(', ')}{' '}
              {unknown.length === 1 ? 'is not a field' : 'are not fields'} this system can fill —
              a parent would receive it exactly as written.
            </p>
          ) : (
            <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
              Name the school somewhere in the text. A notice a parent cannot place is a notice
              they report.
            </p>
          )}
        </div>

        {preview.trim() && (
          <div className="mt-4">
            <p className="label">How a parent sees it</p>
            <div
              className="rounded-xl px-3.5 py-2.5 text-sm whitespace-pre-wrap"
              style={{ background: 'var(--green-soft)', color: 'var(--ink)' }}
            >
              {preview}
            </div>
          </div>
        )}

        {/* ----------------------------------------- the API counterpart */}
        {apiReady && (
          <div
            className="mt-4 grid gap-4 border-t pt-4 sm:grid-cols-2"
            style={{ borderColor: 'var(--border)' }}
          >
            <div className="sm:col-span-2">
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                To send this one through the official API as well, register the same wording at
                Meta and put its template name here. Until Meta approves it, this message keeps
                going out from the linked phone.
              </p>
            </div>
            <div>
              <label className="label" htmlFor={`tpl-meta-${event}`}>
                Meta template name
              </label>
              <input
                id={`tpl-meta-${event}`}
                name="meta_name"
                defaultValue={row?.meta_name ?? ''}
                placeholder="student_absent_alert"
                disabled={!canWrite}
                className="field font-mono"
              />
            </div>
            <div>
              <label className="label" htmlFor={`tpl-lang-${event}`}>
                Language code
              </label>
              <input
                id={`tpl-lang-${event}`}
                name="meta_lang"
                defaultValue={row?.meta_lang ?? 'en'}
                placeholder="en"
                disabled={!canWrite}
                className="field font-mono"
              />
            </div>
          </div>
        )}

        {state?.error && (
          <p
            className="mt-4 rounded-lg px-3 py-2 text-sm"
            style={{ background: 'var(--red-soft)', color: 'var(--red)' }}
          >
            {state.error}
          </p>
        )}
        {state?.ok && (
          <p
            className="mt-4 rounded-lg px-3 py-2 text-sm"
            style={{ background: 'var(--green-soft)', color: 'var(--green-ink)' }}
          >
            {state.ok}
          </p>
        )}

        </div>
      </form>

      {canWrite && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {row && (
            <form action={deleteTemplate}>
              <input type="hidden" name="id" value={row.id} />
              <ConfirmButton
                className="btn btn-danger"
                title={`Remove ${row.name}?`}
                message="The event stops sending until another template is written. Messages already sent keep their text in the log."
                confirmLabel="Remove"
              >
                Delete
              </ConfirmButton>
            </form>
          )}
          <button
            type="submit"
            form={formId}
            disabled={pending || unknown.length > 0}
            className="btn btn-primary"
          >
            {pending ? (
              <>
                <Spinner /> Saving…
              </>
            ) : row ? (
              'Save template'
            ) : (
              'Create template'
            )}
          </button>
        </div>
      )}
    </>
  )
}
