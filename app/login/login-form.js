'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

/* ------------------------------------------------------------------- icons */
function Icon({ size = 16, width = 1.8, children }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

/* The platform mark: a mortarboard set in the brand gradient. */
function Mark({ size = 44, radius = '0.9rem' }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center text-white"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: 'var(--brand-grad)',
        boxShadow: '0 8px 24px -10px rgb(124 58 237 / 0.9)',
      }}
    >
      <Icon size={Math.round(size * 0.52)} width={1.7}>
        <path d="M2.5 9 12 4.5 21.5 9 12 13.5z" />
        <path d="M6.5 11.2v4.3c0 1.3 2.5 2.3 5.5 2.3s5.5-1 5.5-2.3v-4.3" />
        <path d="M21.5 9v5.2" />
      </Icon>
    </span>
  )
}

/* What the console actually does, in the platform's own vocabulary: schools,
   plans, school_modules, and the suspended / demo lifecycle flags. */
const CAPABILITIES = [
  {
    title: 'Tenant provisioning',
    body: 'Stand up a school, give it a slug and a plan, and it is live.',
    icon: (
      <>
        <rect x="3" y="7" width="18" height="14" rx="2" />
        <path d="M8 7V4.5A1.5 1.5 0 0 1 9.5 3h5A1.5 1.5 0 0 1 16 4.5V7" />
        <path d="M12 12v5M9.5 14.5h5" />
      </>
    ),
  },
  {
    title: 'Module-level control',
    body: 'Nineteen modules, switched on one school at a time.',
    icon: (
      <>
        <rect x="3" y="3" width="7.5" height="7.5" rx="1.6" />
        <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6" />
        <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6" />
        <path d="M17.25 13.5v7.5M21 17.25h-7.5" />
      </>
    ),
  },
  {
    title: 'Plans & lifecycle',
    body: 'Move a tenant between plans, mark it demo, or suspend it.',
    icon: <path d="M12 2.5 14.6 8l6 .9-4.3 4.2 1 6-5.3-2.8L6.7 19l1-6L3.4 8.9l6-.9z" />,
  },
]

const CATEGORIES = ['Academic', 'Finance', 'HR', 'Operations', 'Platform']

/* ------------------------------------------------------------- brand panel */
function BrandPanel() {
  return (
    <div
      className="relative hidden overflow-hidden lg:flex lg:w-[46%] lg:shrink-0 lg:flex-col lg:justify-between"
      style={{ background: 'var(--side)' }}
    >
      {/* Two drifting auras give the flat panel depth without an image. */}
      <div
        className="auth-aura pointer-events-none absolute -left-24 -top-32 size-[34rem] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgb(124 58 237 / 0.38), transparent 68%)',
          filter: 'blur(18px)',
        }}
      />
      <div
        className="auth-aura pointer-events-none absolute -bottom-40 -right-28 size-[32rem] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgb(99 102 241 / 0.3), transparent 70%)',
          filter: 'blur(20px)',
          animationDelay: '-9s',
        }}
      />
      <div className="auth-grid pointer-events-none absolute inset-0" />

      {/* ----------------------------------------------------------- header */}
      <div className="relative px-12 pt-12">
        <div className="flex items-center gap-3">
          <Mark />
          <div>
            <p className="text-[0.95rem] font-semibold leading-tight text-white">School OS</p>
            <p
              className="text-[0.62rem] font-semibold uppercase tracking-[0.18em]"
              style={{ color: 'var(--side-dim)' }}
            >
              Platform Console
            </p>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------ pitch */}
      <div className="relative px-12">
        <h2 className="max-w-md text-[2.1rem] font-semibold leading-[1.15] tracking-tight text-white">
          One console for
          <br />
          every school on
          <br />
          <span
            className="bg-clip-text text-transparent"
            style={{ backgroundImage: 'var(--brand-grad)' }}
          >
            the platform.
          </span>
        </h2>

        <ul className="mt-10 flex max-w-md flex-col gap-5">
          {CAPABILITIES.map((item) => (
            <li key={item.title} className="flex gap-3.5">
              <span
                className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg"
                style={{
                  background: 'rgb(255 255 255 / 0.05)',
                  border: '1px solid rgb(255 255 255 / 0.09)',
                  color: '#c4b5fd',
                }}
              >
                <Icon size={15}>{item.icon}</Icon>
              </span>
              <div>
                <p className="text-[0.85rem] font-semibold text-white">{item.title}</p>
                <p
                  className="mt-0.5 text-[0.78rem] leading-relaxed"
                  style={{ color: 'var(--side-text)' }}
                >
                  {item.body}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* ----------------------------------------------------------- footer */}
      <div className="relative px-12 pb-12">
        <p
          className="text-[0.62rem] font-semibold uppercase tracking-[0.16em]"
          style={{ color: 'var(--side-dim)' }}
        >
          Module categories
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <span key={c} className="auth-chip">
              {c}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------- form */
export default function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [reveal, setReveal] = useState(false)
  const [capsLock, setCapsLock] = useState(false)
  const [error, setError] = useState(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(event) {
    event.preventDefault()
    setPending(true)
    setError(null)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      // Deliberately vague: a precise message would tell an attacker which
      // half they got right.
      setError('That email and password do not match an account.')
      setPending(false)
      return
    }

    router.push(searchParams.get('next') || '/')
    router.refresh()
  }

  // A caps-locked password is the most common failed sign-in, and the field is
  // masked -- being told is the only way to see it.
  function trackCaps(event) {
    setCapsLock(event.getModifierState?.('CapsLock') ?? false)
  }

  return (
    <div className="flex min-h-dvh" style={{ background: 'var(--app)' }}>
      <BrandPanel />

      {/* Reads as a lit seam between the panel and the form, not a border. */}
      <div className="auth-seam hidden w-px shrink-0 lg:block" />

      <div className="relative flex min-w-0 flex-1 flex-col items-center justify-center overflow-hidden px-5 py-10 sm:px-10">
        {/* A whisper of the panel's colour, so the two halves read as one
            composition rather than two pages stitched together. */}
        <div
          className="pointer-events-none absolute -right-40 -top-40 size-[30rem] rounded-full"
          style={{
            background:
              'radial-gradient(circle, color-mix(in srgb, var(--brand) 14%, transparent), transparent 70%)',
            filter: 'blur(10px)',
          }}
        />

        <div className="auth-rise relative w-full max-w-[25rem]">
          {/* Below lg the brand panel is gone, so the mark comes along here. */}
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <Mark size={38} radius="0.75rem" />
            <div>
              <p
                className="text-[0.9rem] font-semibold leading-tight"
                style={{ color: 'var(--ink)' }}
              >
                School OS
              </p>
              <p
                className="text-[0.6rem] font-semibold uppercase tracking-[0.18em]"
                style={{ color: 'var(--muted)' }}
              >
                Platform Console
              </p>
            </div>
          </div>

          <div className="mb-7">
            <h1
              className="text-[1.6rem] font-semibold tracking-tight"
              style={{ color: 'var(--ink)' }}
            >
              Sign in
            </h1>
            <p className="mt-1.5 text-[0.86rem]" style={{ color: 'var(--muted)' }}>
              Manage schools, plans and modules across the platform.
            </p>
          </div>

          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            {/* ------------------------------------------------------ email */}
            <div>
              <label className="label" htmlFor="email">
                Email
              </label>
              <div className="relative">
                <span
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
                  style={{ color: 'var(--muted-2)' }}
                >
                  <Icon size={15}>
                    <rect x="3" y="5" width="18" height="14" rx="2.5" />
                    <path d="m3.5 7.5 8.5 5.5 8.5-5.5" />
                  </Icon>
                </span>
                <input
                  id="email"
                  type="email"
                  required
                  autoFocus
                  autoComplete="email"
                  placeholder="you@school.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="field !py-2.5 !pl-10"
                />
              </div>
            </div>

            {/* --------------------------------------------------- password */}
            <div>
              <label className="label" htmlFor="password">
                Password
              </label>
              <div className="relative">
                <span
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
                  style={{ color: 'var(--muted-2)' }}
                >
                  <Icon size={15}>
                    <rect x="4" y="10" width="16" height="11" rx="2.5" />
                    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                  </Icon>
                </span>
                <input
                  id="password"
                  type={reveal ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyUp={trackCaps}
                  onKeyDown={trackCaps}
                  onBlur={() => setCapsLock(false)}
                  className="field !py-2.5 !pl-10 !pr-11"
                />
                <button
                  type="button"
                  // Keep the caret -- and the Caps Lock warning -- in the field.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setReveal((v) => !v)}
                  aria-label={reveal ? 'Hide password' : 'Show password'}
                  aria-pressed={reveal}
                  className="icon-btn absolute right-1.5 top-1/2 !size-8 -translate-y-1/2"
                >
                  <Icon size={16}>
                    {reveal ? (
                      <>
                        <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
                        <circle cx="12" cy="12" r="3" />
                      </>
                    ) : (
                      <>
                        <path d="M10.6 6.2A8.9 8.9 0 0 1 12 6c6 0 9.5 6 9.5 6a16.4 16.4 0 0 1-2.9 3.6M6.2 7.1A16.2 16.2 0 0 0 2.5 12S6 18 12 18a9.2 9.2 0 0 0 4-.9" />
                        <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
                        <path d="m3 3 18 18" />
                      </>
                    )}
                  </Icon>
                </button>
              </div>

              {capsLock && (
                <p
                  className="mt-1.5 flex items-center gap-1.5 text-[0.74rem] font-medium"
                  style={{ color: 'var(--amber-ink)' }}
                >
                  <Icon size={13}>
                    <path d="M12 3 4 11h4v4h8v-4h4z" />
                    <path d="M8 19h8" />
                  </Icon>
                  Caps Lock is on.
                </p>
              )}
            </div>

            {/* ------------------------------------------------------ error */}
            {error && (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-lg px-3 py-2.5 text-[0.8rem] font-medium"
                style={{
                  background: 'var(--red-soft)',
                  color: 'var(--red-ink)',
                  border: '1px solid color-mix(in srgb, var(--red) 28%, transparent)',
                }}
              >
                <span className="mt-px shrink-0">
                  <Icon size={14}>
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7.5v5M12 16h.01" />
                  </Icon>
                </span>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={pending}
              className="btn btn-primary mt-1 !py-2.5 !text-[0.85rem]"
            >
              {pending ? (
                <>
                  <span className="spinner" />
                  Signing in…
                </>
              ) : (
                <>
                  Sign in
                  <Icon size={15} width={2}>
                    <path d="M5 12h13M13 6l6 6-6 6" />
                  </Icon>
                </>
              )}
            </button>
          </form>

          <div
            className="mt-7 flex items-start gap-2 border-t pt-5 text-[0.72rem] leading-relaxed"
            style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
          >
            <span className="mt-0.5 shrink-0">
              <Icon size={13}>
                <rect x="4" y="10" width="16" height="11" rx="2.5" />
                <path d="M8 10V7a4 4 0 0 1 8 0v3" />
              </Icon>
            </span>
            Restricted console. Accounts are provisioned by a platform administrator.
          </div>
        </div>
      </div>
    </div>
  )
}
