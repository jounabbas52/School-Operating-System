'use client'

import { useState } from 'react'

// The "+ Add Section" repeating rows from the design.
//
// Each row emits section_name / section_capacity inputs, so the server action
// reads them with formData.getAll() and zips them by index -- no JSON blob to
// parse and no way for the two lists to fall out of step.
export default function SectionRows({ defaultCapacity = 35 }) {
  const [rows, setRows] = useState([])
  const [nextId, setNextId] = useState(1)

  function add() {
    // A, B, C… so the common case needs no typing.
    const letter = String.fromCharCode(65 + rows.length)
    setRows((current) => [
      ...current,
      { id: nextId, name: rows.length < 26 ? letter : '', capacity: defaultCapacity },
    ])
    setNextId((n) => n + 1)
  }

  function update(id, patch) {
    setRows((current) => current.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  function remove(id) {
    setRows((current) => current.filter((r) => r.id !== id))
  }

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="label !mb-0">Sections</span>
        <span className="text-xs" style={{ color: 'var(--muted)' }}>
          {rows.length} added
        </span>
      </div>

      {rows.length > 0 && (
        <div className="mb-2 flex flex-col gap-2">
          {rows.map((row) => (
            <div key={row.id} className="flex items-center gap-2">
              <input
                name="section_name"
                required
                value={row.name}
                onChange={(e) => update(row.id, { name: e.target.value.toUpperCase() })}
                placeholder="A"
                aria-label="Section name"
                className="field flex-1"
              />
              <input
                name="section_capacity"
                type="number"
                min="1"
                value={row.capacity}
                onChange={(e) => update(row.id, { capacity: e.target.value })}
                aria-label="Section capacity"
                className="field w-24"
              />
              <button
                type="button"
                onClick={() => remove(row.id)}
                aria-label={`Remove section ${row.name || ''}`}
                className="btn btn-danger !px-2.5"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={add}
        className="w-full rounded-lg border border-dashed py-2.5 text-sm font-medium transition"
        style={{ borderColor: 'var(--border)', color: 'var(--brand-ink)', background: 'transparent' }}
      >
        + Add Section
      </button>

      <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
        Optional — sections can be added later on the Sections screen.
      </p>
    </div>
  )
}
