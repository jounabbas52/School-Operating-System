import { Suspense } from 'react'
import LoginForm from './login-form'

export const metadata = {
  title: 'Sign in · Platform console',
}

// useSearchParams() forces a client-side bail-out, so the form needs its own
// Suspense boundary or the whole route fails to prerender. The fallback paints
// the two halves in their final colours so the split does not flash.
export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh" style={{ background: 'var(--app)' }}>
          <div
            className="hidden lg:block lg:w-[46%] lg:shrink-0"
            style={{ background: 'var(--side)' }}
          />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  )
}
