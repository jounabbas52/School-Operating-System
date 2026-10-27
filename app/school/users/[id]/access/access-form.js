'use client'

import { useActionState, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import SubmitButton from '@/components/submit-button'
import {
  ACTION_LABEL,
  applyToggle,
  countGranted,
  countTotal,
  modulesFrom,
  seedSheet,
  setPages,
  toggleModule,
} from '@/lib/access'
import { saveUserAccess } from '../../../actions'

// The whole menu, with both rules on it.
//
// Every group is a card: a module switch in its header, and its pages beneath
// with View / Edit / Delete. Switch the module off and the card dims -- the
// page switches stay exactly as they are, because turning it back on should
// put the person where they were, not at nothing.
//
// What a switch does lives in lib/access.js (applyToggle, toggleModule) with
// scripts/access-test.mjs over it. Nothing in this file decides access; it
// only draws it.

const TONE = { view: 'var(--brand)', edit: 'var(--amber)', delete: 'var(--red)' }

function Switch({ checked, onChange, tone, label, disabled }) {
  return (
    <label
      className={`flex items-center justify-center ${disabled ? '' : 'cursor-pointer'}`}
      title={label}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className={`size-4 rounded ${disabled ? '' : 'cursor-pointer'}`}
        style={{ accentColor: tone }}
      />
      <span className="sr-only">{label}</span>
    </label>
  )
}

export default function AccessForm({ person, tree, pageRows, moduleRows, readOnly, reason }) {
  const router = useRouter()
  const [state, formAction, pending] = useActionState(saveUserAccess, {})

  const pages = useMemo(() => tree.flatMap((g) => g.pages), [tree])

  const [sheet, setSheet] = useState(() => seedSheet(pages, pageRows))
  const [live, setLive] = useState(() => modulesFrom(moduleRows))

  // Re-seed when the server sends new rows. useState reads its initial value
  // once; after a save the fresh rows arrive as props, and without this the
  // switches would still show what they did on first render.
  const signature = useMemo(
    () =>
      JSON.stringify([
        (pageRows ?? []).map((r) => [r.page, r.can_view, r.can_edit, r.can_delete]).sort(),
        (moduleRows ?? []).map((m) => [m.module, m.enabled]).sort(),
      ]),
    [pageRows, moduleRows]
  )
  const [seeded, setSeeded] = useState(signature)
  if (seeded !== signature) {
    setSeeded(signature)
    setSheet(seedSheet(pages, pageRows))
    setLive(modulesFrom(moduleRows))
  }

  // Only pages under a live module count towards what this person can do --
  // the same arithmetic the sidebar and the database apply.
  const livePages = pages.filter((p) => live.has(p.module))
  const granted = countGranted(sheet, livePages)
  const total = countTotal(pages)
  const visible = livePages.filter((p) => sheet[p.key]?.view).length

  function everything(value) {
    setSheet((s) => setPages(s, pages, value))
    setLive(value ? new Set(tree.map((g) => g.key)) : new Set())
  }

  const name = person.full_name || person.email

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="profile_id" value={person.id} />

      {/* What the form posts: the modules that are on, and every switch that
          is on beneath them. */}
      {[...live].map((key) => (
        <input key={key} type="hidden" name="module" value={key} />
      ))}
      {livePages.map((page) =>
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

      {/* ------------------------------------------------------- the header */}
      <div
        className="sticky top-0 z-20 -mx-5 flex flex-wrap items-end justify-between gap-3 px-5 py-3"
        style={{ background: 'var(--app)', borderBottom: '1px solid var(--border-soft)' }}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>
              Access — {name}
            </h1>
            <span className={`pill ${person.status === 'active' ? 'pill-green' : 'pill-red'}`}>
              {person.status}
            </span>
          </div>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
            {person.email} · <strong>{visible}</strong> page{visible === 1 ? '' : 's'} in their
            sidebar · {granted} of {total} switches on
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/school/users/${person.id}`} className="btn btn-ghost">
            Their file
          </Link>
          <Link href="/school/users" className="btn btn-ghost">
            All users
          </Link>
          {!readOnly && (
            <>
              <button
                type="button"
                onClick={() => everything(true)}
                className="btn btn-ghost !px-2.5 !py-1 text-xs"
              >
                Everything on
              </button>
              <button
                type="button"
                onClick={() => everything(false)}
                className="btn btn-ghost !px-2.5 !py-1 text-xs"
                style={{ color: 'var(--red)' }}
              >
                Everything off
              </button>
              <SubmitButton pendingLabel="Saving…" className="btn btn-primary">
                Save access
              </SubmitButton>
            </>
          )}
        </div>
      </div>

      {reason && (
        <p
          className="rounded-lg px-3 py-2 text-sm"
          style={{ background: 'var(--amber-soft)', color: 'var(--amber-ink)' }}
        >
          {reason}
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
      {state?.ok && (
        <p
          className="rounded-lg px-3 py-2 text-sm"
          style={{ background: 'var(--green-soft)', color: 'var(--green-ink)' }}
        >
          {state.ok}
        </p>
      )}

      <p className="text-sm" style={{ color: 'var(--muted)' }}>
        <strong>Two switches, and that is the whole system.</strong> The one on a group header
        decides whether that part of the app exists for {name} at all — off, and it is not in their
        sidebar and does not open. Inside a group that is on, each page carries View, Edit and
        Delete. A page with View alone opens exactly as it does for you, with nothing on it that
        changes anything.
      </p>

      {/* -------------------------------------------------------- the groups */}
      <div className="flex flex-col gap-3">
        {tree.map((group) => {
          const on = live.has(group.key)
          const here = countGranted(sheet, group.pages)
          const seen = group.pages.filter((p) => sheet[p.key]?.view).length

          return (
            <section
              key={group.key}
              className="card overflow-hidden"
              style={{ borderColor: on ? 'var(--brand-soft)' : 'var(--border)' }}
            >
              {/* ------------------------------------------ rule 1: module */}
              <div
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                style={{ background: on ? 'var(--brand-soft)' : 'var(--card-alt)' }}
              >
                <label className={`flex items-center gap-3 ${readOnly ? '' : 'cursor-pointer'}`}>
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={readOnly}
                    onChange={(e) => setLive((m) => toggleModule(m, group.key, e.target.checked))}
                    className={`size-4 rounded ${readOnly ? '' : 'cursor-pointer'}`}
                    style={{ accentColor: 'var(--brand)' }}
                  />
                  <span>
                    <span
                      className="block text-sm font-semibold"
                      style={{ color: on ? 'var(--brand-ink)' : 'var(--ink-2)' }}
                    >
                      {group.label}
                    </span>
                    <span className="block text-[0.68rem]" style={{ color: 'var(--muted)' }}>
                      {on
                        ? seen
                          ? `${seen} of ${group.pages.length} page${
                              group.pages.length === 1 ? '' : 's'
                            } in their sidebar`
                          : 'on, but no page inside it is switched on yet'
                        : `off — all ${group.pages.length} page${
                            group.pages.length === 1 ? '' : 's'
                          } hidden`}
                    </span>
                  </span>
                </label>

                <span className="flex items-center gap-2">
                  <span className="font-mono text-[0.68rem]" style={{ color: 'var(--muted-2)' }}>
                    {here}/{countTotal(group.pages)}
                  </span>
                  {!readOnly && on && (
                    <>
                      <button
                        type="button"
                        onClick={() => setSheet((s) => setPages(s, group.pages, true))}
                        className="btn btn-ghost !px-2 !py-0.5 text-[0.7rem]"
                      >
                        All on
                      </button>
                      <button
                        type="button"
                        onClick={() => setSheet((s) => setPages(s, group.pages, false))}
                        className="btn btn-ghost !px-2 !py-0.5 text-[0.7rem]"
                      >
                        All off
                      </button>
                    </>
                  )}
                </span>
              </div>

              {/* ------------------------------------------- rule 2: pages */}
              <div style={{ opacity: on ? 1 : 0.4 }}>
                <div
                  className="grid items-center gap-2 border-b px-4 py-1.5 text-[0.6rem] font-bold uppercase tracking-wider"
                  style={{
                    gridTemplateColumns: '1fr repeat(3, 3.5rem)',
                    borderColor: 'var(--border-soft)',
                    color: 'var(--muted-2)',
                  }}
                >
                  <span>Page</span>
                  <span className="text-center">View</span>
                  <span className="text-center">Edit</span>
                  <span className="text-center">Delete</span>
                </div>

                {group.pages.map((page) => {
                  const row = sheet[page.key] ?? {}
                  return (
                    <div
                      key={page.key}
                      className="grid items-center gap-2 border-b px-4 py-2 last:border-b-0"
                      style={{
                        gridTemplateColumns: '1fr repeat(3, 3.5rem)',
                        borderColor: 'var(--border-soft)',
                        background: on && row.view ? 'var(--card)' : 'transparent',
                      }}
                    >
                      <span className="min-w-0">
                        <span className="block text-sm" style={{ color: 'var(--ink-2)' }}>
                          {page.label}
                          {!page.built && (
                            <span className="ml-1.5 pill pill-muted">not built</span>
                          )}
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
                            disabled={readOnly || !on}
                            onChange={(e) =>
                              setSheet((s) => applyToggle(s, page.key, action, e.target.checked))
                            }
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
            </section>
          )
        })}
      </div>

      {!readOnly && (
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
          <p className="text-xs" style={{ color: 'var(--muted-2)' }}>
            Nothing is written until you press Save. Changes take effect the next time {name} loads
            a page.
          </p>
          <span className="flex items-center gap-2">
            <button type="button" onClick={() => router.back()} className="btn btn-ghost">
              Cancel
            </button>
            <SubmitButton pendingLabel="Saving…" className="btn btn-primary">
              Save access
            </SubmitButton>
          </span>
        </div>
      )}

      {pending && <span className="sr-only">Saving…</span>}
    </form>
  )
}
