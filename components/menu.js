'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// Anchored dropdown menu, portalled to <body> for the same reason the
// combobox is: the topbar is sticky and its ancestors clip, so an absolutely
// positioned menu gets cut off.
//
// `children` is a function receiving { close } so items can dismiss the menu
// after acting.
export default function Menu({ button, children, align = 'end', width = 232, label }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null)
  const anchorRef = useRef(null)
  const panelRef = useRef(null)

  useLayoutEffect(() => {
    if (!open) return
    function place() {
      const el = anchorRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      // Keep the panel on screen when the trigger sits near an edge.
      const left =
        align === 'end'
          ? Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8))
          : Math.max(8, Math.min(r.left, window.innerWidth - width - 8))
      setPos({ left, top: r.bottom + 6 })
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open, align, width])

  useEffect(() => {
    if (!open) return
    function onDown(event) {
      if (anchorRef.current?.contains(event.target)) return
      if (panelRef.current?.contains(event.target)) return
      setOpen(false)
    }
    function onKey(event) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const close = () => setOpen(false)

  return (
    <div ref={anchorRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        className="flex items-center"
      >
        {button}
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={panelRef}
            role="menu"
            className="popover"
            style={{ position: 'fixed', left: pos.left, top: pos.top, width, zIndex: 90 }}
          >
            {children({ close })}
          </div>,
          document.body
        )}
    </div>
  )
}

export function MenuItem({ children, onClick, icon, danger = false, as = 'button', ...rest }) {
  const Tag = as
  return (
    <Tag
      {...rest}
      onClick={onClick}
      role="menuitem"
      className="menu-item"
      style={danger ? { color: 'var(--red)' } : undefined}
    >
      {icon && (
        <span className="shrink-0" aria-hidden="true">
          {icon}
        </span>
      )}
      <span className="flex-1 text-left">{children}</span>
    </Tag>
  )
}

export function MenuDivider() {
  return <div style={{ borderTop: '1px solid var(--border)' }} />
}
