'use client'

import { useActionState, useEffect, useState } from 'react'
import Image from 'next/image'
import { Spinner } from '@/components/spinner'
import {
  AUTO_SEND_EVENTS,
  SESSION_STATES,
} from '@/lib/whatsapp-options'
import {
  endSession,
  readSession,
  saveApiCredentials,
  saveSettings,
  sendApiTest,
  startSession,
  syncMetaTemplates,
} from './actions'
import TemplatesTab from './templates-tab'
import MessagesTab from './messages-tab'

// The WhatsApp settings screen: one page, five tabs.
//
// WHY EVERY TAB LIVES IN ONE FORM
//
// Auto-Send, Advanced and the API switches are all saved by the single
// "Save Settings" button in the header, which means their inputs must still
// post while another tab is showing. So every panel is RENDERED and the
// inactive ones are merely hidden -- unmounting them would drop their
// values, and a clerk who ticked three auto-send boxes, wandered over to
// Advanced and pressed Save would silently lose the ticks.
//
// The Connection tab and the Meta credentials are the exceptions: those act
// immediately (scan, unlink, verify) and have their own buttons, because
// "Save Settings" implying a phone had been linked would be a lie.

const TABS = [
  { id: 'connection', label: 'Connection', icon: '◉' },
  { id: 'autosend', label: 'Auto-Send', icon: '⚡' },
  { id: 'templates', label: 'Templates', icon: '▤' },
  { id: 'advanced', label: 'Advanced', icon: '⚙' },
  { id: 'api', label: 'WhatsApp API', icon: '◈' },
  { id: 'messages', label: 'Messages', icon: '≡' },
]

const POLL_MS = 3000

function Panel({ show, children }) {
  return <div className={show ? 'flex flex-col gap-4' : 'hidden'}>{children}</div>
}

function Card({ title, subtitle, icon, action, children }) {
  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div className="flex items-center gap-3">
          <span
            className="flex size-10 shrink-0 items-center justify-center rounded-xl text-base text-white"
            style={{ background: 'var(--brand-grad)' }}
            aria-hidden="true"
          >
            {icon}
          </span>
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
              {title}
            </p>
            {subtitle && (
              <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {action}
      </div>
      {children && (
        <div className="px-5 pb-5" style={{ borderTop: '1px solid var(--border)' }}>
          {children}
        </div>
      )}
    </div>
  )
}

function Toggle({ name, defaultChecked, title, hint, disabled, form }) {
  return (
    <label
      className="flex items-start justify-between gap-4 rounded-xl px-4 py-3"
      style={{ background: 'var(--card-alt)', opacity: disabled ? 0.55 : 1 }}
    >
      <span>
        <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
          {title}
        </span>
        {hint && (
          <span className="mt-0.5 block text-xs" style={{ color: 'var(--muted)' }}>
            {hint}
          </span>
        )}
      </span>
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        disabled={disabled}
        // Lets this control sit OUTSIDE <form id="wa-settings"> in the DOM
        // and still post with it -- which is how the Meta credentials can
        // be rendered above these switches while Save Settings still owns
        // them.
        form={form}
        className="mt-0.5 size-5 shrink-0"
      />
    </label>
  )
}

export default function WhatsAppSettings({
  settings,
  templates,
  messages = [],
  classes = [],
  sections = [],
  optedOut = 0,
  canWrite,
  initialTab,
}) {
  const [tab, setTab] = useState(
    TABS.some((t) => t.id === initialTab) ? initialTab : 'connection'
  )
  const [state, formAction, pending] = useActionState(saveSettings, {})

  const [session, setSession] = useState({
    status: settings?.session_status ?? 'disconnected',
    qr: null,
    number: settings?.linked_number ?? null,
    error: null,
  })
  const [busy, setBusy] = useState(false)
  const [poke, setPoke] = useState(0)

  // A self-rescheduling timer rather than setInterval: each tick picks its
  // own next delay from the status it just read, so a linked session drops
  // to a slow heartbeat instead of asking every three seconds forever, and
  // a slow gateway cannot pile requests on top of each other.
  //
  // Only runs while the Connection tab is showing. Polling a socket from a
  // tab nobody is looking at is pure waste.
  useEffect(() => {
    if (tab !== 'connection') return

    let cancelled = false
    let timer

    async function run() {
      const next = await readSession()
      if (cancelled) return

      if (next?.error) {
        setSession((s) => ({ ...s, error: next.error }))
      } else {
        setSession({
          status: next.status,
          qr: next.qr,
          number: next.number,
          error: next.lastError ?? null,
        })
      }

      const settled = next?.status === 'connected' || next?.status === 'logged_out'
      timer = setTimeout(run, settled ? POLL_MS * 5 : POLL_MS)
    }

    // 0ms, so the first call is a callback rather than a synchronous
    // setState in the effect body -- React 19 rejects the latter.
    timer = setTimeout(run, 0)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [tab, poke])

  const meta = SESSION_STATES[session.status] ?? SESSION_STATES.disconnected
  const linked = session.status === 'connected'
  const autoSend = settings?.auto_send ?? {}

  async function act(fn) {
    setBusy(true)
    const result = await fn()
    if (result?.error) setSession((s) => ({ ...s, error: result.error }))
    setBusy(false)
    setPoke((n) => n + 1)
  }

  return (
    <div className="flex flex-col gap-5">
      {/* ---------------------------------------------------------- header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className="flex size-10 shrink-0 items-center justify-center rounded-xl text-base text-white"
            style={{ background: 'var(--brand-grad)' }}
            aria-hidden="true"
          >
            ✉
          </span>
          <div>
            <h1 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>
              WhatsApp Settings
            </h1>
            <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
              Configure auto-send notifications, message templates, and sending limits
            </p>
          </div>
        </div>

        {canWrite && (
          <button
            type="submit"
            form="wa-settings"
            disabled={pending}
            className="btn btn-primary"
          >
            {pending ? (
              <>
                <Spinner /> Saving…
              </>
            ) : (
              'Save Settings'
            )}
          </button>
        )}
      </div>

      <p
        className="rounded-xl px-4 py-3 text-sm"
        style={{ background: 'var(--brand-soft)', color: 'var(--ink-2)' }}
      >
        Link the school phone once from the <strong>Connection</strong> tab — the session is
        shared across every staff account, so nobody else has to scan. Auto-send behaviour and
        templates below apply to every message this school sends.
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
        <p
          className="rounded-lg px-3 py-2 text-sm"
          style={{ background: 'var(--green-soft)', color: 'var(--green-ink)' }}
        >
          {state.ok}
        </p>
      )}

      {/* ------------------------------------------------------------ tabs */}
      <div className="card flex flex-wrap items-center gap-1 p-2">
        {TABS.map((t) => {
          const on = tab === t.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition"
              style={{
                background: on ? 'var(--brand)' : 'transparent',
                color: on ? '#fff' : 'var(--muted)',
              }}
            >
              <span aria-hidden="true">{t.icon}</span>
              {t.label}
            </button>
          )
        })}
      </div>

      {/* ------------------------------------------------------ connection */}
      <Panel show={tab === 'connection'}>
        <Card
          title="WhatsApp Connection"
          icon={linked ? '✓' : '◉'}
          subtitle={meta.help}
          action={
            canWrite && (
              <div className="flex flex-wrap items-center gap-2">
                {!linked ? (
                  <button
                    type="button"
                    onClick={() => act(startSession)}
                    disabled={busy}
                    className="btn btn-primary"
                  >
                    {busy ? (
                      <>
                        <Spinner /> Connecting…
                      </>
                    ) : session.qr ? (
                      'New code'
                    ) : (
                      'Connect'
                    )}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => act(endSession)}
                  disabled={busy}
                  className={linked ? 'btn btn-danger' : 'btn btn-ghost'}
                >
                  {linked ? 'Unlink' : 'Reset'}
                </button>
              </div>
            )
          }
        >
          <div className="flex flex-col items-center gap-4 pt-5">
            <span className={`pill ${meta.tone}`}>{meta.label}</span>

            {linked && session.number && (
              <p className="font-mono text-sm" style={{ color: 'var(--ink)' }}>
                +{session.number}
              </p>
            )}

            {session.qr && !linked && (
              <>
                {/* The gateway renders the code to a data URL, so no QR
                    library ships in this app's bundle. unoptimized because
                    next/image cannot process a data URL. */}
                <Image
                  src={session.qr}
                  alt="WhatsApp pairing QR code"
                  width={280}
                  height={280}
                  unoptimized
                  className="rounded-2xl"
                  style={{ background: '#fff', padding: 12 }}
                />
                <ol
                  className="w-full max-w-md rounded-xl px-4 py-3 text-xs"
                  style={{ background: 'var(--card-alt)', color: 'var(--muted)' }}
                >
                  <li>1. Open WhatsApp on the school phone.</li>
                  <li>2. Settings → Linked devices → Link a device.</li>
                  <li>3. Point it at this code.</li>
                </ol>
              </>
            )}

            {session.error && (
              <p
                className="w-full rounded-lg px-3 py-2 text-sm"
                style={{ background: 'var(--red-soft)', color: 'var(--red)' }}
              >
                {session.error}
              </p>
            )}

            <p className="max-w-xl text-center text-xs" style={{ color: 'var(--muted)' }}>
              The scan is one-time — the link survives restarts and only breaks if somebody
              removes it from <strong>Linked devices</strong> on the phone. Keep that phone
              charged and online; if it stays offline long enough WhatsApp drops the device.
            </p>
          </div>
        </Card>
      </Panel>

      {/* ----------------------------------------------- the one big form */}
      <form id="wa-settings" action={formAction}>
        {/* -------------------------------------------------- auto-send */}
        <Panel show={tab === 'autosend'}>
          <Card
            title="Send automatically"
            icon="⚡"
            subtitle="School events that message a parent on their own"
          >
            <div className="flex flex-col gap-2.5 pt-5">
              <Toggle
                name="is_enabled"
                defaultChecked={settings?.is_enabled ?? false}
                title="Sending is switched on"
                hint="Off, messages still queue but nothing goes out. The master switch."
                disabled={!canWrite}
              />

              <div className="h-px" style={{ background: 'var(--border)' }} />

              {AUTO_SEND_EVENTS.map((e) => (
                <Toggle
                  key={e.key}
                  name={`auto_${e.key}`}
                  defaultChecked={Boolean(autoSend[e.key])}
                  title={e.label}
                  hint={e.hint}
                  disabled={!canWrite}
                />
              ))}

              <p
                className="rounded-lg px-3 py-2 text-xs"
                style={{ background: 'var(--card-alt)', color: 'var(--muted)' }}
              >
                Each of these needs a template on the <strong>Templates</strong> tab. An event
                switched on with no template written sends nothing — the Templates tab says which
                are missing.
              </p>
            </div>
          </Card>
        </Panel>

        {/* ---------------------------------------------------- advanced */}
        <Panel show={tab === 'advanced'}>
          <Card
            title="Send delay"
            icon="◷"
            subtitle="Random pause between messages, to avoid WhatsApp restrictions"
          >
            <div className="grid gap-4 pt-5 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="wa-delay-min">
                  Minimum delay (seconds)
                </label>
                <input
                  id="wa-delay-min"
                  name="send_delay_min"
                  type="number"
                  min="0"
                  max="120"
                  defaultValue={settings?.send_delay_min ?? 3}
                  disabled={!canWrite}
                  className="field"
                />
              </div>
              <div>
                <label className="label" htmlFor="wa-delay-max">
                  Maximum delay (seconds)
                </label>
                <input
                  id="wa-delay-max"
                  name="send_delay_max"
                  type="number"
                  min="0"
                  max="300"
                  defaultValue={settings?.send_delay_max ?? 8}
                  disabled={!canWrite}
                  className="field"
                />
              </div>
            </div>

            <p
              className="mt-3 rounded-lg px-3 py-2 text-xs"
              style={{ background: 'var(--amber-soft)', color: 'var(--amber-ink)' }}
            >
              Random between the two, never a fixed interval — a message every precisely 3.0
              seconds is a machine signature, and that is what gets numbers restricted. 3–8
              seconds is the sane floor; lower it only if you know why.
            </p>
          </Card>

          <Card title="Limits" icon="▤" subtitle="The ceiling, and the hours nothing goes out">
            <div className="grid gap-4 pt-5 sm:grid-cols-3">
              <div>
                <label className="label" htmlFor="wa-cap">
                  Daily cap
                </label>
                <input
                  id="wa-cap"
                  name="daily_cap"
                  type="number"
                  min="1"
                  defaultValue={settings?.daily_cap ?? 500}
                  disabled={!canWrite}
                  className="field"
                />
              </div>
              <div>
                <label className="label" htmlFor="wa-quiet-from">
                  Quiet from
                </label>
                <input
                  id="wa-quiet-from"
                  name="quiet_from"
                  type="time"
                  defaultValue={settings?.quiet_from?.slice(0, 5) ?? '21:00'}
                  disabled={!canWrite}
                  className="field"
                />
              </div>
              <div>
                <label className="label" htmlFor="wa-quiet-until">
                  Quiet until
                </label>
                <input
                  id="wa-quiet-until"
                  name="quiet_until"
                  type="time"
                  defaultValue={settings?.quiet_until?.slice(0, 5) ?? '07:30'}
                  disabled={!canWrite}
                  className="field"
                />
              </div>
            </div>
          </Card>

          <div
            className="rounded-xl px-4 py-3 text-xs"
            style={{ background: 'var(--amber-soft)', color: 'var(--amber-ink)' }}
          >
            <p className="text-sm font-semibold">Worth knowing</p>
            <ul className="mt-1.5 flex flex-col gap-1">
              <li>• The linked phone must stay online for anything to send.</li>
              <li>• Sending too much too fast can get the number temporarily restricted.</li>
              <li>• A parent who replies STOP is opted out at once and never messaged again.</li>
              <li>• These limits apply to every staff account using this school&rsquo;s number.</li>
            </ul>
          </div>
        </Panel>

      </form>

      {/* -------------------------------------------------------- messages */}
      <Panel show={tab === 'messages'}>
        <MessagesTab
          messages={messages}
          templates={templates}
          classes={classes}
          sections={sections}
          optedOut={optedOut}
          live={linked && settings?.is_enabled}
          canWrite={canWrite}
        />
      </Panel>

      {/* ------------------------------------------------------- templates */}
      <Panel show={tab === 'templates'}>
        <TemplatesTab templates={templates} canWrite={canWrite} apiReady={settings?.api_status === 'ok'} />
      </Panel>

      {/* ------------------------------------------------- Meta credentials */}
      <Panel show={tab === 'api'}>
        <ApiCredentials settings={settings} canWrite={canWrite} />

        {/* Below the credentials, as on the reference design: switching the
            route on only makes sense once Meta has accepted them. The
            inputs post with the header's Save Settings via form=. */}
        <div className="flex flex-col gap-2.5">
          <Toggle
            form="wa-settings"
            name="api_enabled"
            defaultChecked={settings?.api_enabled ?? false}
            title="Send through the official WhatsApp API"
            hint={
              settings?.api_status === 'ok'
                ? 'Approved templates take the official route; everything else uses the phone.'
                : 'Save and verify your Meta details above first.'
            }
            disabled={!canWrite || settings?.api_status !== 'ok'}
          />
          <Toggle
            form="wa-settings"
            name="api_fallback"
            defaultChecked={settings?.api_fallback ?? true}
            title="Use the linked phone when the API cannot send"
            hint="If the token expires, Meta is down, or a message has no approved template, it goes through the phone instead of failing."
            disabled={!canWrite}
          />
        </div>
      </Panel>
    </div>
  )
}

/* ------------------------------------------------------------------------ */

function ApiCredentials({ settings, canWrite }) {
  const [state, action, pending] = useActionState(saveApiCredentials, {})
  const [testState, testAction, testing] = useActionState(sendApiTest, {})
  const [syncState, syncAction, syncing] = useActionState(
    async () => await syncMetaTemplates(),
    {}
  )

  const configured = Boolean(settings?.phone_number_id)
  const verified = settings?.api_status === 'ok'

  return (
    <>
      <Card
        title="Official WhatsApp API"
        icon={verified ? '✓' : '?'}
        subtitle={
          verified
            ? 'Verified with Meta'
            : settings?.api_status === 'error'
              ? `Not working: ${settings.api_error ?? 'Meta refused the credentials.'}`
              : 'Not set up'
        }
        action={
          canWrite &&
          verified && (
            <form action={syncAction}>
              <button type="submit" disabled={syncing} className="btn btn-ghost">
                {syncing ? (
                  <>
                    <Spinner /> Syncing…
                  </>
                ) : (
                  'Sync from Meta'
                )}
              </button>
            </form>
          )
        }
      >
        <p className="pt-4 text-sm" style={{ color: 'var(--muted)' }}>
          Optional, and entirely separate from the linked phone. The official API cannot be
          banned and is what a school should use once Meta has verified its business — but Meta
          must approve each message&rsquo;s wording first, so only approved templates take this
          route. Everything else keeps using the phone.
        </p>

        <form id="wa-api" action={action} className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              From <strong>developers.facebook.com → your app → WhatsApp → API Setup</strong>. Use
              a permanent System User token with the <code className="font-mono">whatsapp_business_messaging</code>{' '}
              and <code className="font-mono">whatsapp_business_management</code> permissions — the
              temporary 24-hour token on that page stops working tomorrow.
            </p>
          </div>

          <div>
            <label className="label" htmlFor="api-waba">
              WhatsApp Business Account ID
            </label>
            <input
              id="api-waba"
              name="waba_id"
              defaultValue={settings?.waba_id ?? ''}
              placeholder="e.g. 102290129340398"
              disabled={!canWrite}
              className="field font-mono"
            />
          </div>

          <div>
            <label className="label" htmlFor="api-pnid">
              Phone Number ID
            </label>
            <input
              id="api-pnid"
              name="phone_number_id"
              defaultValue={settings?.phone_number_id ?? ''}
              placeholder="e.g. 123456789012345"
              disabled={!canWrite}
              className="field font-mono"
            />
            <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
              A long number, not the phone number itself.
            </p>
          </div>

          <div>
            <label className="label" htmlFor="api-token">
              Access token
            </label>
            <input
              id="api-token"
              name="api_access_token"
              type="password"
              autoComplete="off"
              placeholder={configured ? 'Saved — leave blank to keep it' : 'EAAG…'}
              disabled={!canWrite}
              className="field font-mono"
            />
            <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
              {configured
                ? 'A token is on file. It cannot be read back, so this box is always blank.'
                : 'Stored server-side and never sent to a browser, including this one.'}
            </p>
          </div>

          <div>
            <label className="label" htmlFor="api-app">
              Meta App ID <span style={{ color: 'var(--muted)' }}>(optional)</span>
            </label>
            <input
              id="api-app"
              name="meta_app_id"
              defaultValue={settings?.meta_app_id ?? ''}
              placeholder="e.g. 1234567890123456"
              disabled={!canWrite}
              className="field font-mono"
            />
          </div>

          {canWrite && (
            <div className="flex justify-end sm:col-span-2">
              <button type="submit" disabled={pending} className="btn btn-primary">
                {pending ? (
                  <>
                    <Spinner /> Checking…
                  </>
                ) : (
                  'Save & check'
                )}
              </button>
            </div>
          )}

          {state?.error && (
            <p
              className="rounded-lg px-3 py-2 text-sm sm:col-span-2"
              style={{ background: 'var(--red-soft)', color: 'var(--red)' }}
            >
              {state.error}
            </p>
          )}
          {state?.ok && (
            <p
              className="rounded-lg px-3 py-2 text-sm sm:col-span-2"
              style={{ background: 'var(--green-soft)', color: 'var(--green-ink)' }}
            >
              {state.ok}
            </p>
          )}
          {syncState?.ok && (
            <p
              className="rounded-lg px-3 py-2 text-sm sm:col-span-2"
              style={{ background: 'var(--green-soft)', color: 'var(--green-ink)' }}
            >
              {syncState.ok}
            </p>
          )}
          {syncState?.error && (
            <p
              className="rounded-lg px-3 py-2 text-sm sm:col-span-2"
              style={{ background: 'var(--red-soft)', color: 'var(--red)' }}
            >
              {syncState.error}
            </p>
          )}
        </form>
      </Card>

      {canWrite && configured && (
        <Card
          title="Send a test"
          icon="➤"
          subtitle="Through the API only, even before it is switched on"
        >
          <form action={testAction} className="flex flex-wrap items-end gap-3 pt-4">
            <div className="min-w-48 flex-1">
              <label className="label" htmlFor="api-test-phone">
                Number
              </label>
              <input
                id="api-test-phone"
                name="phone"
                required
                placeholder="0300 1234567"
                className="field"
              />
            </div>
            <div className="min-w-48 flex-1">
              <label className="label" htmlFor="api-test-template">
                Template
              </label>
              <input
                id="api-test-template"
                name="meta_name"
                defaultValue="hello_world"
                className="field font-mono"
              />
              <input type="hidden" name="meta_lang" value="en_US" />
            </div>
            <button type="submit" disabled={testing} className="btn btn-primary">
              {testing ? (
                <>
                  <Spinner /> Sending…
                </>
              ) : (
                'Send test'
              )}
            </button>
          </form>

          <p className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>
            <code className="font-mono">hello_world</code> is Meta&rsquo;s sample template, which
            every new account already has approved — it is the quickest proof the credentials
            work.
          </p>

          {testState?.error && (
            <p
              className="mt-2 rounded-lg px-3 py-2 text-sm"
              style={{ background: 'var(--red-soft)', color: 'var(--red)' }}
            >
              {testState.error}
            </p>
          )}
          {testState?.ok && (
            <p
              className="mt-2 rounded-lg px-3 py-2 text-sm"
              style={{ background: 'var(--green-soft)', color: 'var(--green-ink)' }}
            >
              {testState.ok}
            </p>
          )}
        </Card>
      )}

      <div
        className="rounded-xl px-4 py-3 text-xs"
        style={{ background: 'var(--brand-soft)', color: 'var(--ink-2)' }}
      >
        <p>
          • Meta bills your WhatsApp Business Account directly, per delivered template message.
          Utility messages are the cheap category; Marketing costs several times more.
        </p>
        <p className="mt-1">
          • A payment method must be added in Meta Business Settings → Payments, or Meta stops
          delivering.
        </p>
        <p className="mt-1">
          • A new number can message a limited number of customers a day until Meta verifies the
          business.
        </p>
      </div>
    </>
  )
}
