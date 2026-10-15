'use client'

import { createBrowserClient } from '@supabase/ssr'

// For Client Components only. Uses the anon key, which is public by design --
// row level security is what actually protects the data.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
}
