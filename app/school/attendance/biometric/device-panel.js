'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Spinner } from '@/components/spinner'
import SidePanel from '@/components/side-panel'
import { Select } from '@/components/combobox'
import { rotateToken, saveDevice } from './actions'

const KINDS = [
  { id: 'zkteco', label: 'ZKTeco' },
  { id: 'essl', label: 'eSSL' },
  { id: 'usb_bridge', label: 'USB scanner + agent' },
  { id: 'mobile', label: 'Mobile' },
  { id: 'other', label: 'Other' },
]

function SaveButton({ editing }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" form="device-form" disabled={pending} className="btn btn-primary">
      {pending ? (
        <>
          <Spinner /> Saving…
        </>
      ) : editing ? (
        'Save changes'
      ) : (
        'Register device'
      )}
    </button>
  )
}

function RotateButton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="btn btn-ghost">
      {pending ? (
        <>
          <Spinner /> Issuing…
        </>
      ) : (
        'Issue new token'
      )}
    </button>
  )
}

// Shown once, immediately after the token is minted. There is no second
// chance -- the database stores a bcrypt hash, so nothing can ever read it
// back. Saying that plainly is better than a user discovering it later.
function TokenReveal({ token, serial }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(token)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard is blocked on insecure origins and in some locked-down
      // browsers. The token is selectable on screen, so this is survivable.
    }
  }

  return (
    <div
      className="rounded-xl p-4"
      style={{ background: 'var(--green-soft)', border: '1px solid transparent' }}
    >
      <p className="text-sm font-semibold" style={{ color: 'var(--green-ink)' }}>
        Device token — copy it now
      </p>
      <p className="mt-1 text-xs" style={{ color: 'var(--green-ink)' }}>
        This is the only time it is shown. Only a hash is stored, so it cannot be read back — if
        it is lost, issue a new one.
      </p>

      <div className="mt-3 flex items-center gap-2">
        <code
          className="min-w-0 flex-1 overflow-x-auto rounded-lg px-3 py-2 font-mono text-xs"
          style={{ background: 'var(--card)', color: 'var(--ink)' }}
        >
          {token}
        </code>
        <button type="button" onClick={copy} className="btn btn-ghost shrink-0">
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>

      <p className="mt-3 text-xs font-semibold" style={{ color: 'var(--green-ink)' }}>
        Agent configuration
      </p>
      <pre
        className="mt-1 overflow-x-auto rounded-lg px-3 py-2 font-mono text-[0.68rem]"
        style={{ background: 'var(--card)', color: 'var(--ink-2)' }}
      >
        {`POST /api/attendance/punches
{
  "serial": ${JSON.stringify(serial ?? 'YOUR-SERIAL')},
  "token":  "${token}",
  "punches": [
    { "user_id": "17",
      "at": "2026-10-15T07:48:12+05:00",
      "id": "${serial ?? 'DEV'}:17:1760500092" }
  ]
}`}
      </pre>
      <p className="mt-2 text-[0.68rem]" style={{ color: 'var(--green-ink)' }}>
        <strong>id</strong> is the agent&rsquo;s own key for the punch. Re-sending one that was
        already stored is ignored, which is what makes a retry after a dropped connection safe.
      </p>
    </div>
  )
}

export default function DevicePanel({ row, trigger }) {
  const [open, setOpen] = useState(false)
  const [state, formAction] = useActionState(saveDevice, {})
  const [rotateState, rotateAction] = useActionState(rotateToken, {})

  const editing = Boolean(row)
  // The panel deliberately stays OPEN on success when a token was minted --
  // closing it would throw away the one copy of the credential.
  const token = state?.token ?? rotateState?.token

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={trigger.className}>
        {trigger.label}
      </button>

      <SidePanel
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Edit ${row.name}` : 'Register a device'}
        description="A fingerprint reader, and the token its agent authenticates with"
        icon="▤"
        footer={
          <>
            <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost">
              {token ? 'Done' : 'Cancel'}
            </button>
            {!token && <SaveButton editing={editing} />}
          </>
        }
      >
        {token ? (
          <TokenReveal token={token} serial={state?.serial ?? row?.serial} />
        ) : (
          <form id="device-form" action={formAction} className="flex flex-col gap-4">
            {editing && <input type="hidden" name="id" value={row.id} />}

            <div>
              <label className="label" htmlFor="dv-name">
                Device name *
              </label>
              <input
                id="dv-name"
                name="name"
                required
                defaultValue={row?.name ?? ''}
                placeholder="e.g. Main Gate Reader"
                className="field"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="dv-serial">
                  Serial *
                </label>
                <input
                  id="dv-serial"
                  name="serial"
                  required
                  defaultValue={row?.serial ?? ''}
                  placeholder="ZK01"
                  className="field font-mono"
                />
                <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                  How the agent identifies itself. Must be unique.
                </p>
              </div>
              <div>
                <label className="label" htmlFor="dv-kind">
                  Type
                </label>
                <Select
                  id="dv-kind"
                  name="kind"
                  defaultValue={row?.kind ?? 'zkteco'}
                  options={KINDS}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="dv-location">
                  Location
                </label>
                <input
                  id="dv-location"
                  name="location"
                  defaultValue={row?.location ?? ''}
                  placeholder="e.g. Main gate"
                  className="field"
                />
              </div>
              <div>
                <label className="label" htmlFor="dv-status">
                  Status
                </label>
                <Select
                  id="dv-status"
                  name="status"
                  defaultValue={row?.status ?? 'active'}
                  options={[
                    { id: 'active', label: 'Active' },
                    { id: 'inactive', label: 'Inactive' },
                  ]}
                />
                <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                  Inactive refuses the token.
                </p>
              </div>
            </div>

            <div>
              <label className="label" htmlFor="dv-notes">
                Notes
              </label>
              <textarea
                id="dv-notes"
                name="notes"
                rows={2}
                defaultValue={row?.notes ?? ''}
                className="field resize-none"
              />
            </div>

            {!editing && (
              <p
                className="rounded-lg px-3 py-2 text-xs"
                style={{ background: 'var(--card-alt)', color: 'var(--muted)' }}
              >
                A token is issued when the device is saved, and shown once. The agent on the school
                PC uses it to post punches — it grants nothing else, and cannot read any data.
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
        )}

        {editing && !token && (
          <form action={rotateAction} className="mt-5 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
            <input type="hidden" name="id" value={row.id} />
            <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
              Token
            </p>
            <p className="mt-0.5 mb-3 text-xs" style={{ color: 'var(--muted)' }}>
              Issuing a new one stops the old token working immediately. The agent will be refused
              until it is updated.
            </p>
            <RotateButton />
            {rotateState?.error && (
              <p
                className="mt-2 rounded-lg px-3 py-2 text-sm"
                style={{ background: 'var(--red-soft)', color: 'var(--red)' }}
              >
                {rotateState.error}
              </p>
            )}
          </form>
        )}
      </SidePanel>
    </>
  )
}
