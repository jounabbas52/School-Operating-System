import { Suspense } from 'react'
import LoginForm from './login-form'

// useSearchParams() forces a client-side bail-out, so the form needs its own
// Suspense boundary or the whole route fails to prerender.
export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-zinc-50 dark:bg-zinc-950" />
      }
    >
      <LoginForm />
    </Suspense>
  )
}
