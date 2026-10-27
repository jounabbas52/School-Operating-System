'use client'

import { useState } from 'react'
import Link from 'next/link'
import Menu, { MenuDivider, MenuItem } from '@/components/menu'
import SidePanel from '@/components/side-panel'
import SubmitButton from '@/components/submit-button'
import { removeUser } from '../actions'
import EditUser from './edit-user'

// The two buttons at the end of every row.
//
//   ⋯   what to do with the PERSON -- open them, edit them, remove them
//   ⛨   what they may DO -- opens their access page
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

export default function RowActions({ person, canWrite, isMe, isAdminRow }) {
  const [editing, setEditing] = useState(false)
  const [removing, setRemoving] = useState(false)

  return (
    <span className="flex items-center justify-end gap-1.5">
      {/* ----------------------------------------------------- the guard */}
      {/* A page, not a dialog: setting somebody up is a walk down the whole
          menu, and a popup made that feel like a quick edit while hiding
          half the list.

          An administrator has no access list at all, so there is nothing to
          open -- saying so beats a button that leads to a page explaining
          there is nothing there. */}
      {isAdminRow ? (
        <span
          className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium"
          style={{ borderColor: 'var(--amber)', color: 'var(--amber-ink)' }}
          title="Administrators have full access to everything, always"
        >
          <Shield />
          Full access
        </span>
      ) : (
        <Link
          href={`/school/users/${person.id}/access`}
          className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium"
          style={
            canWrite && !isMe
              ? { borderColor: 'var(--brand)', color: 'var(--brand-ink)' }
              : { borderColor: 'var(--border)', color: 'var(--muted)' }
          }
        >
          <Shield />
          {canWrite && !isMe ? 'Access' : 'View access'}
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
        description="This cannot be undone"
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
            The account is deleted. They disappear from this list, their access goes with them, and
            the email stops working immediately. There is no undo — you would create them again
            from scratch.
          </p>
          <p className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>
            Kept: the audit trail of what they did, their HR staff record, and any leave history —
            all with the link to this login blanked. Removing somebody from a user list should not
            quietly remove them from the payroll.
          </p>
        </form>
      </SidePanel>
    </span>
  )
}
