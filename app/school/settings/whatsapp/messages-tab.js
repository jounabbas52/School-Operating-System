'use client'

import { useMemo, useState } from 'react'
import { StatCard, StatRow } from '@/components/stats'
import { dateLabel, timeLabel, studentName } from '@/lib/operations-options'
import { phoneLabel } from '@/lib/whatsapp/phone'
import { MESSAGE_STATUSES, MESSAGE_STATUS_LABEL, MESSAGE_STATUS_TONE } from '@/lib/whatsapp-options'
import SendPanel from './send-panel'
import DispatchButton from './dispatch-button'

// What actually went out, and the one button that sends something new.
//
// Filtering is CLIENT-SIDE over the rows the page already loaded. That is a
// deliberate trade: the old log page pushed its search and paging through
// the URL, which cannot work inside a tab whose state is local. Two hundred
// rows is a fortnight for most schools and filters instantly; anything
// beyond that is an audit, and an audit wants an export rather than a
// Next button.

export default function MessagesTab({
  messages,
  templates,
  classes,
  sections,
  optedOut,
  live,
  canWrite,
}) {
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')

  const queued = messages.filter(
    (m) => m.status === 'queued' || m.status === 'sending'
  ).length
  const sent = messages.filter((m) => ['sent', 'delivered', 'read'].includes(m.status)).length
  const delivered = messages.filter((m) => ['delivered', 'read'].includes(m.status)).length
  const failed = messages.filter((m) => m.status === 'failed').length

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const digits = needle.replace(/\D/g, '')

    return messages.filter((m) => {
      if (status && m.status !== status) return false
      if (!needle) return true

      // A clerk looking something up holds a phone number or a child's
      // name, never a uuid — so both are matched, because they do not know
      // which one the message was addressed by.
      if (digits.length >= 4 && m.to_phone?.replace(/\D/g, '').includes(digits)) return true
      if (m.body?.toLowerCase().includes(needle)) return true
      return studentName(m.students).toLowerCase().includes(needle)
    })
  }, [messages, q, status])

  return (
    <div className="flex flex-col gap-4">
      <StatRow>
        <StatCard
          label="Queued"
          value={queued}
          sub={queued ? 'waiting for the dispatcher' : 'nothing waiting'}
          tone={queued ? 'amber' : 'brand'}
          icon="◷"
        />
        <StatCard
          label="Sent"
          value={sent}
          sub={`${delivered} confirmed delivered`}
          tone="blue"
          icon="↗"
        />
        <StatCard
          label="Failed"
          value={failed}
          sub={failed ? 'see the reason below' : 'none'}
          tone={failed ? 'red' : 'green'}
          icon="!"
        />
        <StatCard
          label="Opted out"
          value={optedOut}
          sub="never messaged again"
          tone="green"
          icon="↩"
        />
      </StatRow>

      <div className="card flex flex-wrap items-center gap-2 p-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search a number, a name, or the text…"
          className="field min-w-52 flex-1"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="field w-auto"
        >
          <option value="">Any status</option>
          {MESSAGE_STATUSES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {canWrite && <DispatchButton queued={queued} />}
          {canWrite && live && (
            <SendPanel
              templates={templates}
              classes={classes}
              sections={sections}
              trigger={{ label: '+ New Message', className: 'btn btn-primary' }}
            />
          )}
        </div>
      </div>

      {!rows.length ? (
        <div className="card px-6 py-16 text-center" style={{ borderStyle: 'dashed' }}>
          <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            {messages.length ? 'Nothing matches that search' : 'No messages yet'}
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm" style={{ color: 'var(--muted)' }}>
            {messages.length
              ? 'Only the most recent 200 messages are loaded here.'
              : 'Link the phone, then send one test to your own number before pointing this at 400 parents.'}
          </p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table min-w-[60rem]">
            <thead>
              <tr>
                <th>When</th>
                <th>Number</th>
                <th>Student</th>
                <th>Message</th>
                <th>Source</th>
                <th>Status</th>
                <th>Delivered</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id}>
                  <td className="tabular-nums whitespace-nowrap">
                    {timeLabel(m.created_at)}
                    <span className="block text-xs" style={{ color: 'var(--muted)' }}>
                      {dateLabel(m.created_at.slice(0, 10))}
                    </span>
                  </td>
                  <td className="whitespace-nowrap">
                    {m.direction === 'in' && <span className="pill pill-brand mr-1.5">in</span>}
                    {phoneLabel(m.to_phone)}
                  </td>
                  <td>
                    {m.students ? (
                      <>
                        <span style={{ color: 'var(--ink)' }}>{studentName(m.students)}</span>
                        <span className="block text-xs" style={{ color: 'var(--muted)' }}>
                          {m.students.admission_number ?? '—'}
                        </span>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="max-w-md">
                    <span className="block truncate" style={{ color: 'var(--ink-2)' }} title={m.body}>
                      {m.body}
                    </span>
                    {m.error_detail && (
                      <span className="block text-xs" style={{ color: 'var(--red)' }}>
                        {m.error_detail}
                        {m.attempts > 1 ? ` · ${m.attempts} attempts` : ''}
                      </span>
                    )}
                  </td>
                  <td>
                    <span className="pill pill-muted">{m.source}</span>
                  </td>
                  <td>
                    <span className={`pill ${MESSAGE_STATUS_TONE[m.status] ?? 'pill-muted'}`}>
                      {MESSAGE_STATUS_LABEL[m.status] ?? m.status}
                    </span>
                  </td>
                  <td
                    className="tabular-nums whitespace-nowrap text-xs"
                    style={{ color: 'var(--muted)' }}
                  >
                    {m.read_at
                      ? `read ${timeLabel(m.read_at)}`
                      : m.delivered_at
                        ? timeLabel(m.delivered_at)
                        : m.sent_at
                          ? `sent ${timeLabel(m.sent_at)}`
                          : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs" style={{ color: 'var(--muted)' }}>
        <strong>Sent</strong> means the phone handed the message to WhatsApp.{' '}
        <strong>Delivered</strong> means it reached the parent&rsquo;s phone. Only the second
        answers &ldquo;were they told?&rdquo;, and a message can sit at Sent indefinitely if the
        number is switched off. Showing the most recent {messages.length} messages.
      </p>
    </div>
  )
}
