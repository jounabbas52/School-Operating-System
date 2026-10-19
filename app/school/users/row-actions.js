'use client'

import { useState } from 'react'
import Link from 'next/link'
import Menu, { MenuDivider, MenuItem } from '@/components/menu'
import SidePanel from '@/components/side-panel'
import SubmitButton from '@/components/submit-button'
import { removeUser } from '../actions'
import AccessEditor from './access-editor'
import EditUser from './edit-user'

// The two buttons at the end of every row.
//
//   ⋯   what to do with the PERSON -- open them, edit them, remove them
//   ⛨   what they may DO -- the guard, which is the whole access system
//
// They are deliberately different shapes. Editing a phone number and handing
// somebody the payroll are not the same kind of decision, and a menu that
// mixed them would invite the second by accident.

function Dots() {
  return (
    <span
      className="flex size-7 items-center justify-center rounded-lg"
      style={{ color: 'var(--muted)' }}
      aria-hidden="true"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <circle cx="5" cy="12" r="1.8" />
        <circle cx="12" cy="12" r="1.8" />
        <circle cx="19" cy="12" r="1.8" />
      </svg>
    </span>
  )
}

function Shield() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z" strokeLinejoin="round" />
      <path d="M9.5 12l1.8 1.8L15 10" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function RowActions({ person, tree, rows, canWrite, isMe }) {
  const [editing, setEditing] = useState(false)
  const [removing, setRemoving] = useState(false)

  return (
    <span className="flex items-center justify-end gap-1.5">
      {/* ----------------------------------------------------- the guard */}
      {canWrite && !isMe ? (
        <AccessEditor
          profileId={person.id}
          personName={person.full_name || person.email}
          tree={tree}
          rows={rows}
          trigger={{
            label: (
              <span className="flex items-center gap-1.5">
                <Shield />
                Access
              </span>
            ),
            className:
              'inline-flex items-center rounded-lg border px-2.5 py-1 text-xs font-medium',
            style: { borderColor: 'var(--brand)', color: 'var(--brand-ink)' },
          }}
        />
      ) : (
        <Link
          href={`/school/users/${person.id}`}
          className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium"
          style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
        >
          <Shield />
          View
        </Link>
      )}

      {/* --------------------------------------------------- the options */}
      <Menu
        label={`Options for ${person.full_name || person.email}`}
        button={<Dots />}
        width={200}
      >
        {({ close }) => (
          <>
            <MenuItem as={Link} href={`/school/users/${person.id}`} onClick={close} icon="◻">
              Open their file
            </MenuItem>

            {canWrite && (
              <MenuItem
                icon="✎"
                onClick={() => {
                  close()
                  setEditing(true)
                }}
              >
                Edit details
              </MenuItem>
            )}

            {canWrite && !isMe && (
              <>
                <MenuDivider />
                <MenuItem
                  icon="🗑"
                  danger
                  onClick={() => {
                    close()
                    setRemoving(true)
                  }}
                >
                  Delete user
                </MenuItem>
              </>
            )}
          </>
        )}
      </Menu>

      {editing && <EditUser person={person} open={editing} onClose={() => setEditing(false)} />}

      {/* Its own dialog rather than a confirm button inside the menu: the menu
          closes the moment the dialog takes focus, and a form that unmounts
          underneath an open dialog submits nothing when you press Delete. */}
      <SidePanel
        open={removing}
        onClose={() => setRemoving(false)}
        title={`Delete ${person.full_name || person.email}?`}
        description="They lose all access immediately"
        icon="🗑"
        variant="modal"
        width="max-w-md"
        footer={
          <>
            <button type="button" onClick={() => setRemoving(false)} className="btn btn-ghost">
              Cancel
            </button>
            <SubmitButton
              form="remove-user-form"
              pendingLabel="Removing…"
              className="btn btn-danger-solid"
            >
              Delete user
            </SubmitButton>
          </>
        }
      >
        <form id="remove-user-form" action={removeUser}>
          <input type="hidden" name="profile_id" value={person.id} />
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            Their access sheet is deleted and they are detached from the school, so they can reach
            nothing from the moment you press the button.
          </p>
          <p className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>
            The sign-in account itself, and everything they ever created, stays intact — the audit
            trail keeps its author, and adding them back restores the person, though not their
            access.
          </p>
        </form>
      </SidePanel>
    </span>
  )
}
