'use client'

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// The app's one dropdown. Every select goes through this so the list panel,
// keyboard behaviour and theming are identical everywhere.
//
// Emits a hidden input carrying the chosen id, so it drops into a plain form
// exactly where a <select> used to sit.
//
// Pass `createName` to allow inventing a new option: a second hidden input
// then carries the typed text, and the server action treats it as "make this
// first, then use it". Without `createName` it is a plain searchable select.
//
// The list renders in a PORTAL on <body>, positioned from the trigger's
// bounding box. An absolutely positioned panel is clipped by any ancestor
// with overflow -- which every table here has, since they scroll sideways --
// so inside a table the list was simply invisible. The portal also lets it
// flip upward when the trigger sits near the bottom of the window, which is
// what happens on the last row of a table.
export default function Combobox({
  id,
  options,
  name,
  createName,
  defaultValue = '',
  placeholder = 'Select…',
  createLabel = 'Add new',
  emptyLabel = 'No matches.',
  required = false,
  searchable = true,
  className = '',
  onChangeValue,
}) {
  const selected = options.find((o) => String(o.id) === String(defaultValue))

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(selected?.label ?? '')
  const [chosen, setChosen] = useState(selected ?? null)
  const [creating, setCreating] = useState(null)
  const [active, setActive] = useState(0)
  const [pos, setPos] = useState(null)

  const boxRef = useRef(null)
  const panelRef = useRef(null)
  const listId = useId()

  const typed = query.trim()

  // Once something is chosen its label sits in the box; filtering by that
  // would hide every other option the moment the list reopened.
  const filtering = searchable && typed && typed !== chosen?.label
  const matches = filtering
    ? options.filter((o) => o.label.toLowerCase().includes(typed.toLowerCase()))
    : options

  const canCreate =
    Boolean(createName) &&
    typed.length > 0 &&
    !options.some((o) => o.label.toLowerCase() === typed.toLowerCase())

  // Measure the trigger and decide which way the list opens. Runs on scroll
  // and resize too, so the panel tracks the field instead of drifting off it.
  useLayoutEffect(() => {
    if (!open) return

    function place() {
      const el = boxRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const gap = 4
      const below = window.innerHeight - r.bottom - gap
      const above = r.top - gap
      const wanted = 264
      const flip = below < Math.min(wanted, 180) && above > below

      setPos({
        left: r.left,
        width: r.width,
        top: flip ? undefined : r.bottom + gap,
        bottom: flip ? window.innerHeight - r.top + gap : undefined,
        maxHeight: Math.max(140, Math.min(wanted, flip ? above : below)),
      })
    }

    place()
    // capture:true so scrolling any ancestor container repositions, not just
    // the window.
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open])

  // The panel is not a DOM descendant of the trigger any more, so onBlur
  // cannot tell "clicked an option" from "left the control". Watch the
  // document instead and treat either element as inside.
  useEffect(() => {
    if (!open) return
    function onDown(event) {
      if (boxRef.current?.contains(event.target)) return
      if (panelRef.current?.contains(event.target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  function pick(option) {
    setChosen(option)
    setCreating(null)
    setQuery(option.label)
    setOpen(false)
    onChangeValue?.(option.id)
  }

  function create() {
    setCreating(typed)
    setChosen(null)
    setOpen(false)
  }

  function onKeyDown(event) {
    if (event.key === 'Escape') {
      setOpen(false)
      return
    }
    if (event.key === 'Tab') {
      setOpen(false)
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setOpen(true)
      const total = matches.length + (canCreate ? 1 : 0)
      if (!total) return
      setActive((i) => (event.key === 'ArrowDown' ? (i + 1) % total : (i - 1 + total) % total))
      return
    }
    if (event.key === 'Enter' && open) {
      event.preventDefault()
      if (active < matches.length) pick(matches[active])
      else if (canCreate) create()
    }
  }

  const panel = open && pos && (
    <div
      ref={panelRef}
      className="popover"
      style={{
        position: 'fixed',
        left: pos.left,
        width: pos.width,
        top: pos.top,
        bottom: pos.bottom,
        zIndex: 80, // above the slide-over, which sits at 50
      }}
    >
      <ul
        id={listId}
        role="listbox"
        className="overflow-y-auto py-1"
        style={{ maxHeight: pos.maxHeight }}
      >
        {matches.length === 0 && !canCreate && (
          <li className="px-3 py-2 text-sm" style={{ color: 'var(--muted)' }}>
            {emptyLabel}
          </li>
        )}
        {matches.map((option, index) => (
          <li key={option.id}>
            <button
              type="button"
              role="option"
              aria-selected={String(chosen?.id) === String(option.id)}
              onMouseEnter={() => setActive(index)}
              onClick={() => pick(option)}
              className={`option ${active === index ? 'option-active' : ''}`}
            >
              {option.label}
            </button>
          </li>
        ))}
      </ul>

      {canCreate && (
        <button
          type="button"
          onMouseEnter={() => setActive(matches.length)}
          onClick={create}
          className="flex w-full items-center gap-1.5 border-t px-3 py-2.5 text-left text-sm font-medium"
          style={{
            borderColor: 'var(--border)',
            color: 'var(--brand-ink)',
            background: active === matches.length ? 'var(--brand-soft)' : 'transparent',
          }}
        >
          <span aria-hidden="true">+</span> {createLabel} &ldquo;{typed}&rdquo;
        </button>
      )}
    </div>
  )

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      <input type="hidden" name={name} value={chosen?.id ?? ''} />
      {createName && <input type="hidden" name={createName} value={creating ?? ''} />}

      <div className="relative">
        {searchable && (
          <span
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--muted-2)' }}
            aria-hidden="true"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" strokeLinecap="round" />
            </svg>
          </span>
        )}

        <input
          id={id}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete={searchable ? 'list' : 'none'}
          readOnly={!searchable}
          required={required && !chosen && !creating}
          value={query}
          placeholder={placeholder}
          onChange={(event) => {
            if (!searchable) return
            setQuery(event.target.value)
            setChosen(null)
            setCreating(null)
            setActive(0)
            setOpen(true)
          }}
          onClick={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className={`field ${searchable ? '!pl-9' : ''} !pr-8 cursor-pointer`}
        />

        <span
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2"
          style={{ color: 'var(--muted-2)' }}
          aria-hidden="true"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            className={`transition-transform ${open ? 'rotate-180' : ''}`}
          >
            <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </div>

      {creating && (
        <p className="mt-1 text-xs" style={{ color: 'var(--brand-ink)' }}>
          Will create &ldquo;{creating}&rdquo;.
        </p>
      )}

      {/* Portalled to body so no ancestor's overflow can clip it. */}
      {panel && createPortal(panel, document.body)}
    </div>
  )
}

// Plain dropdown: same panel and keyboard behaviour, no "add new" row.
// searchable defaults off for short fixed lists like Active/Inactive, where a
// search box is noise.
export function Select({ options, searchable = false, ...rest }) {
  return <Combobox options={options} searchable={searchable} {...rest} />
}
