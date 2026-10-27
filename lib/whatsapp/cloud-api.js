// Meta's official Cloud API — the SECOND transport, alongside the linked
// phone. Neither replaces the other:
//
//   linked phone   any text, to anyone, free, but unofficial and bannable
//   Cloud API      only wording Meta approved, billed per message, but
//                  official and immune to the ban risk
//
// So a message takes the API route only when its template is Approved;
// campaigns, free text and anything unapproved keep using the phone. That
// split is decided in the dispatcher, not here.
//
// Server-only: it handles access tokens. There is no 'use client' anywhere
// in its import graph and there must never be.

// Pin the version. Meta deprecates a Graph version roughly every two years
// and the unversioned URL follows whatever is current -- so an integration
// that worked for a year breaks on a day nobody deployed anything. Bump
// this deliberately, after reading the changelog.
const GRAPH_VERSION = 'v21.0'

const TIMEOUT_MS = 10_000

async function graph(path, { token, method = 'GET', body } = {}) {
  let response
  let text

  try {
    response = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    text = await response.text()
  } catch (err) {
    return {
      ok: false,
      retryable: true,
      error: err?.name === 'TimeoutError' ? 'Meta did not respond in time.' : 'Could not reach Meta.',
    }
  }

  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    parsed = {}
  }

  if (response.ok) return { ok: true, data: parsed }

  const error = parsed?.error ?? {}

  return {
    ok: false,
    // 4xx is our fault and will fail identically forever -- a bad template
    // name, an unapproved template, a number not on WhatsApp. Retrying
    // those burns quota and delays everything behind them. 429 and 5xx are
    // Meta's and do deserve another go.
    retryable: response.status === 429 || response.status >= 500,
    code: String(error.code ?? response.status),
    error: [error.message, error.error_data?.details].filter(Boolean).join(' — ').slice(0, 400),
  }
}

/**
 * Are these credentials real, and do they point at a usable number?
 *
 * Backs "Save & check" on the API tab. Reads the phone number rather than
 * sending anything, so pressing it costs nothing and messages nobody.
 */
export async function checkCredentials({ phoneNumberId, token }) {
  if (!phoneNumberId || !token) {
    return { ok: false, error: 'Phone number ID and access token are both needed.' }
  }

  const result = await graph(`${phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`, {
    token,
  })

  if (!result.ok) return result

  return {
    ok: true,
    number: result.data?.display_phone_number ?? null,
    name: result.data?.verified_name ?? null,
    quality: result.data?.quality_rating ?? null,
  }
}

/**
 * The templates Meta holds for this WABA, with their review verdicts.
 *
 * Backs "Sync from Meta". Meta is the authority on approval -- the local
 * meta_status column is only ever a cached copy of what this returns.
 */
export async function listTemplates({ wabaId, token }) {
  if (!wabaId || !token) return { ok: false, error: 'WABA ID and access token are both needed.' }

  const result = await graph(`${wabaId}/message_templates?fields=name,status,language&limit=200`, {
    token,
  })

  if (!result.ok) return result

  return {
    ok: true,
    templates: (result.data?.data ?? []).map((t) => ({
      name: t.name,
      language: t.language,
      status: String(t.status ?? '').toLowerCase(),
    })),
  }
}

/**
 * Send an approved template.
 *
 * `variables` is a plain array for {{1}}, {{2}} … in order. Note the
 * mismatch with our own templates, which use named {student_name} fields:
 * Meta only speaks positional, so the caller flattens named values into
 * the order Meta approved. That translation is the price of running both
 * transports off one body of text.
 */
export function sendTemplate({ phoneNumberId, token, to, name, language = 'en', variables = [] }) {
  return graph(`${phoneNumberId}/messages`, {
    token,
    method: 'POST',
    body: {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: String(to).replace(/\D/g, ''),
      type: 'template',
      template: {
        name,
        language: { code: language },
        components: variables.length
          ? [
              {
                type: 'body',
                parameters: variables.map((v) => ({ type: 'text', text: String(v ?? '') })),
              },
            ]
          : [],
      },
    },
  }).then((r) =>
    r.ok ? { ok: true, waMessageId: r.data?.messages?.[0]?.id ?? null } : r
  )
}

export { GRAPH_VERSION }
