'use client'

import { useActionState, useMemo, useState } from 'react'
import SidePanel from '@/components/side-panel'
import { PanelButton, PanelCancel } from '@/components/submit-button'
import { useCloseOnSuccess } from '@/components/use-close-on-success'
import {
  ACTION_LABEL,
  applyToggle,
  countGranted,
  countTotal,
  seedSheet,
  setPages,
} from '@/lib/access'
import { saveUserAccess } from '../actions'

// ONE PERSON'S ACCESS.
//
// Left: the menu. Right: the pages in that group, and on each page three
// switches -- View, Edit, Delete.
//
// A page with nothing on does not appear in their sidebar and does not open.
// A page with View alone opens exactly as it does for the administrator, with
// no Add, no Save and no Delete on it. View and Edit without Delete means
// they can change a record and not remove it.
//
// EVERY LINE IS ITS OWN LINE
//
// A switch changes that page and nothing else. Student Attendance can be
// given without Staff Attendance or the reports beside it. The only two
// couplings live inside a single row -- View off clears that row's Edit and
// Delete; Edit or Delete on turns that row's View on -- and both are in
// applyToggle() in lib/access.js, with scripts/access-test.mjs standing over
// them, because this is exactly where it went wrong before.

const TONE = { view: 'var(--brand)', edit: 'var(--amber)', delete: 'var(--red)' }

function Switch({ checked, onChange, tone, label }) {
  return (
    <label className="flex cursor-pointer items-center justify-center" title={label}>
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="size-4 cursor-pointer rounded"
        style={{ accentColor: tone }}
      />
      <span className="sr-only">{label}</span>
    </label>
  )
}

export default function AccessEditor({ profileId, personName, tree, rows, trigger }) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState(saveUserAccess, {})
  useCloseOnSuccess(state, () => setOpen(false))

  const pages = useMemo(() => tree.flatMap((g) => g.pages), [tree])

  const [sheet, setSheet] = useState(() => seedSheet(pages, rows))
  const [group, setGroup] = useState(tree[0]?.key ?? null)

  // RE-SEED WHEN THE SERVER SENDS NEW ROWS.
  //
  // useState's initial value is read once, on first mount, and this dialog
  // lives inside a table row that stays mounted. Save, the list revalidates,
  // fresh rows arrive as a prop -- and without this the switches would still
  // be the ones from the first render. Turn three off, save, reopen, and all
  // three would be back, which looks exactly like the dialog changing things
  // by itself.
  //
  // Adjusting state during render on a changed input is the pattern React
  // documents for this; an effect would show the stale list first.
  const signature = useMemo(
    () =>
      JSON.stringify(
        (rows ?? []).map((r) => [r.page, r.can_view, r.can_edit, r.can_delete]).sort()
      ),
    [rows]
  )
  const [seeded, setSeeded] = useState(signature)

  if (seeded !== signature) {
    setSeeded(signature)
    setSheet(seedSheet(pages, rows))
  }

  const total = countTotal(pages)
  const granted = countGranted(sheet, pages)

  const active = tree.find((g) => g.key === group) ?? tree[0]
  const counts = (g) => ({ on: countGranted(sheet, g.pages), of: countTotal(g.pages) })

  const t = trigger ?? { label: 'Access', className: 'btn btn-ghost !px-2.5 !py-1 text-xs' }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={t.className}
        style={t.style}
        title="Manage access"
      >
        {t.label}
      </button>

      <SidePanel
        open={open}
        onClose={() => setOpen(false)}
        title={`Access — ${personName}`}
        description={`${granted} of ${total} switched on · nothing is saved until you press Save`}
        icon="⛨"
        variant="modal"
        width="max-w-5xl"
        footer={
          <>
            <span className="mr-auto flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setSheet((s) => setPages(s, pages, true))}
                className="btn btn-ghost !px-2.5 !py-1 text-xs"
              >
                Everything on
              </button>
              <button
                type="button"
                onClick={() => setSheet((s) => setPages(s, pages, false))}
                className="btn btn-ghost !px-2.5 !py-1 text-xs"
                style={{ color: 'var(--red)' }}
              >
                Everything off
              </button>
            </span>
            <PanelCancel onClick={() => setOpen(false)} pending={pending} />
            <PanelButton form="access-form" pending={pending}>
              Save
            </PanelButton>
          </>
        }
      >
        <form id="access-form" action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="profile_id" value={profileId} />

          {/* What the form actually posts: one line per switch that is on. */}
          {pages.map((page) =>
            page.actions
              .filter((action) => sheet[page.key]?.[action])
              .map((action) => (
                <input
                  key={`${page.key}:${action}`}
                  type="hidden"
                  name="grant"
                  value={`${action}:${page.key}`}
                />
              ))
          )}

          <div className="grid gap-3 md:grid-cols-[13rem_1fr]">
            {/* -------------------------------------------------- the menu */}
            <div
              className="flex max-h-[28rem] flex-col gap-0.5 overflow-y-auto rounded-xl p-1.5"
              style={{ background: 'var(--card-alt)', border: '1px solid var(--border-soft)' }}
            >
              {tree.map((g) => {
                const count = counts(g)
                const on = g.key === active?.key
                return (
                  <button
                    key={g.key}
                    type="button"
                    onClick={() => setGroup(g.key)}
                    className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left"
                    style={{
                      background: on ? 'var(--brand-soft)' : 'transparent',
                      color: on ? 'var(--brand-ink)' : 'var(--ink-2)',
                    }}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[0.8rem] font-medium">{g.label}</span>
                      <span className="block text-[0.62rem]" style={{ color: 'var(--muted-2)' }}>
                        {g.pages.length} page{g.pages.length === 1 ? '' : 's'}
                      </span>
                    </span>
                    <span
                      className="shrink-0 font-mono text-[0.62rem]"
                      style={{ color: count.on ? 'var(--brand-ink)' : 'var(--muted-2)' }}
                    >
                      {count.on}/{count.of}
                    </span>
                  </button>
                )
              })}
            </div>

            {/* ------------------------------------------------- the pages */}
            <div className="flex max-h-[28rem] flex-col gap-2 overflow-y-auto pr-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                  {active?.label}
                </h3>
                <span className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSheet((s) => setPages(s, active.pages, true))}
                    className="btn btn-ghost !px-2.5 !py-1 text-xs"
                  >
                    All on
                  </button>
                  <button
                    type="button"
                    onClick={() => setSheet((s) => setPages(s, active.pages, false))}
                    className="btn btn-ghost !px-2.5 !py-1 text-xs"
                  >
                    All off
                  </button>
                </span>
              </div>

              {/* One header, then one row per page, so the three columns line
                  up down the whole group instead of being relabelled on every
                  card. */}
              <div
                className="grid items-center gap-2 px-3 text-[0.6rem] font-bold uppercase tracking-wider"
                style={{
                  gridTemplateColumns: '1fr repeat(3, 3.5rem)',
                  color: 'var(--muted-2)',
                }}
              >
                <span>Page</span>
                <span className="text-center">View</span>
                <span className="text-center">Edit</span>
                <span className="text-center">Delete</span>
              </div>

              {active?.pages.map((page) => {
                const row = sheet[page.key] ?? {}
                return (
                  <div
                    key={page.key}
                    className="grid items-center gap-2 rounded-xl px-3 py-2.5"
                    style={{
                      gridTemplateColumns: '1fr repeat(3, 3.5rem)',
                      background: row.view ? 'var(--card)' : 'var(--card-alt)',
                      border: `1px solid ${row.view ? 'var(--brand-soft)' : 'var(--border-soft)'}`,
                    }}
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium" style={{ color: 'var(--ink)' }}>
                        {page.label}
                        {!page.built && <span className="ml-1.5 pill pill-muted">not built</span>}
                      </span>
                      <code
                        className="block font-mono text-[0.62rem]"
                        style={{ color: 'var(--muted-2)' }}
                      >
                        {page.href}
                      </code>
                    </span>

                    {['view', 'edit', 'delete'].map((action) =>
                      page.actions.includes(action) ? (
                        <Switch
                          key={action}
                          checked={Boolean(row[action])}
                          onChange={(e) => setSheet((s) => applyToggle(s, page.key, action, e.target.checked))}
                          tone={TONE[action]}
                          label={`${ACTION_LABEL[action]} — ${page.label}`}
                        />
                      ) : (
                        <span
                          key={action}
                          className="text-center text-xs"
                          style={{ color: 'var(--muted-2)' }}
                          title={`${page.label} has nothing to ${action}`}
                        >
                          —
                        </span>
                      )
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          <p className="text-xs" style={{ color: 'var(--muted-2)' }}>
            Each line is its own: a switch here changes that page and no other. Their sidebar, and
            every Add, Save and Delete button on the pages you open, follow these switches exactly.
            Changes take effect the next time that person loads a page.
          </p>

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
