'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import Menu, { MenuDivider, MenuItem } from '@/components/menu'
import SidePanel from '@/components/side-panel'
import SubmitButton from '@/components/submit-button'
import StudentPanel from '../students/student-panel'
import ApplicationPanel from './application-panel'
import { deleteApplication, setApplicationStatus } from './actions'

// What can be done to one application, which depends entirely on where it is
// in the pipeline.
//
// The prominent button is the next sensible step -- Review, then Accept, then
// Enrol -- because that is what somebody working through a list is reaching
// for. Everything else, including the ways back, lives in the menu.

const MOVES = {
  applied: { to: 'review', label: 'Start review' },
  review: { to: 'accepted', label: 'Accept' },
  accepted: null, // the next step is enrolment, which is a different thing
  rejected: null,
  enrolled: null,
}

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

function Move({ id, to, children, className = 'btn btn-ghost !px-2.5 !py-1 text-xs', note }) {
  return (
    <form action={setApplicationStatus}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={to} />
      {note && <input type="hidden" name="decision_note" value={note} />}
      <SubmitButton pendingLabel={null} className={className}>
        {children}
      </SubmitButton>
    </form>
  )
}

export default function RowActions({ row, classes, sections, nextSerial, schoolId, canWrite }) {
  const [editing, setEditing] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [discarding, setDiscarding] = useState(false)

  // The two one-click moves live in forms OUTSIDE the menu, submitted by ref.
  // A form rendered inside the menu would unmount the moment the menu closes,
  // and a detached form submits nothing.
  const acceptRef = useRef(null)
  const backRef = useRef(null)

  const move = MOVES[row.status]
  const enrolled = row.status === 'enrolled'

  if (!canWrite) {
    return enrolled && row.student_id ? (
      <Link href="/school/students" className="text-xs" style={{ color: 'var(--brand-ink)' }}>
        View student
      </Link>
    ) : (
      <span className="text-xs" style={{ color: 'var(--muted-2)' }}>
        read only
      </span>
    )
  }

  return (
    <span className="flex items-center justify-end gap-1.5">
      {/* ------------------------------------------------- the obvious step */}
      {enrolled ? (
        <Link
          href="/school/students"
          className="inline-flex items-center rounded-lg border px-2.5 py-1 text-xs font-medium"
          style={{ borderColor: 'var(--green-ink)', color: 'var(--green-ink)' }}
        >
          Student record
        </Link>
      ) : row.status === 'accepted' ? (
        // ENROLMENT IS THE STUDENT FORM, not a status button. An accepted
        // applicant becomes a pupil by having a student record written, and
        // doing it any other way leaves the school with an admission that
        // admitted nobody. The form arrives with what the application knows.
        <StudentPanel
          classes={classes}
          sections={sections}
          nextSerial={nextSerial}
          schoolId={schoolId}
          applicationId={row.id}
          row={{
            first_name: row.applicant_name,
            father_name: row.father_name,
            date_of_birth: row.date_of_birth,
            gender: row.gender,
            father_mobile: row.applicant_phone,
            father_email: row.applicant_email,
            current_address: row.address,
            current_class_id: row.class_id,
            admission_date: new Date().toISOString().slice(0, 10),
          }}
          trigger={{ label: 'Enrol', className: 'btn btn-primary !px-3 !py-1 text-xs' }}
        />
      ) : move ? (
        <Move id={row.id} to={move.to} className="btn btn-primary !px-3 !py-1 text-xs">
          {move.label}
        </Move>
      ) : (
        <Move id={row.id} to="review" className="btn btn-ghost !px-2.5 !py-1 text-xs">
          Reopen
        </Move>
      )}

      {/* ----------------------------------------------------- everything else */}
      <Menu label={`Options for ${row.applicant_name}`} button={<Dots />} width={210}>
        {({ close }) => (
          <>
            {!enrolled && (
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

            {row.status === 'applied' && (
              <MenuItem
                icon="✓"
                onClick={() => {
                  close()
                  acceptRef.current?.requestSubmit()
                }}
              >
                Accept without review
              </MenuItem>
            )}

            {row.status === 'accepted' && (
              <MenuItem
                icon="↩"
                onClick={() => {
                  close()
                  backRef.current?.requestSubmit()
                }}
              >
                Back to review
              </MenuItem>
            )}

            {!enrolled && row.status !== 'rejected' && (
              <>
                <MenuDivider />
                <MenuItem
                  icon="✕"
                  danger
                  onClick={() => {
                    close()
                    setRejecting(true)
                  }}
                >
                  Reject
                </MenuItem>
              </>
            )}

            {!enrolled && (
              <MenuItem
                icon="🗑"
                danger
                onClick={() => {
                  close()
                  setDiscarding(true)
                }}
              >
                Discard application
              </MenuItem>
            )}

            {enrolled && (
              <MenuItem as={Link} href="/school/students" onClick={close} icon="◻">
                Open Students
              </MenuItem>
            )}
          </>
        )}
      </Menu>

      {/* Out here, not in the menu, for the reason given above. */}
      {editing && (
        <ApplicationPanel
          row={row}
          classes={classes}
          open={editing}
          onClose={() => setEditing(false)}
        />
      )}
      <form ref={acceptRef} action={setApplicationStatus} hidden>
        <input type="hidden" name="id" value={row.id} />
        <input type="hidden" name="status" value="accepted" />
      </form>
      <form ref={backRef} action={setApplicationStatus} hidden>
        <input type="hidden" name="id" value={row.id} />
        <input type="hidden" name="status" value="review" />
      </form>

      {/* ----------------------------------------------------------- reject */}
      <SidePanel
        open={rejecting}
        onClose={() => setRejecting(false)}
        title={`Reject ${row.applicant_name}?`}
        description="The record stays; the decision is recorded against it"
        icon="✕"
        variant="modal"
        width="max-w-md"
        footer={
          <>
            <button type="button" onClick={() => setRejecting(false)} className="btn btn-ghost">
              Cancel
            </button>
            <SubmitButton form="reject-form" pendingLabel="Rejecting…" className="btn btn-danger-solid">
              Reject
            </SubmitButton>
          </>
        }
      >
        <form id="reject-form" action={setApplicationStatus} className="flex flex-col gap-3">
          <input type="hidden" name="id" value={row.id} />
          <input type="hidden" name="status" value="rejected" />
          <div>
            <span className="label">Reason</span>
            <textarea
              name="decision_note"
              rows={3}
              placeholder="Kept with the application. Useful when the family asks why, or applies again."
              className="field"
            />
          </div>
          <p className="text-xs" style={{ color: 'var(--muted-2)' }}>
            A rejected application can be reopened later — nothing is lost.
          </p>
        </form>
      </SidePanel>

      {/* ---------------------------------------------------------- discard */}
      <SidePanel
        open={discarding}
        onClose={() => setDiscarding(false)}
        title={`Discard ${row.applicant_name}?`}
        description="Removed from the list"
        icon="🗑"
        variant="modal"
        width="max-w-md"
        footer={
          <>
            <button type="button" onClick={() => setDiscarding(false)} className="btn btn-ghost">
              Cancel
            </button>
            <SubmitButton
              form="discard-form"
              pendingLabel="Discarding…"
              className="btn btn-danger-solid"
            >
              Discard
            </SubmitButton>
          </>
        }
      >
        <form id="discard-form" action={deleteApplication}>
          <input type="hidden" name="id" value={row.id} />
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            Use this for a duplicate or a mistake. To record that the school said no, reject it
            instead — a refused application is a question the school was asked, and the answer is
            worth keeping.
          </p>
        </form>
      </SidePanel>
    </span>
  )
}
