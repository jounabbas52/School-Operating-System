import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

// The root decides which panel you belong in, so nothing else has to guess.
// Platform staff have profiles.school_id = NULL and a platform_admins row;
// everyone else belongs to exactly one school. Sending a school user to
// /admin would show them a "no platform access" wall, and vice versa.
export default async function Home() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // RLS on platform_admins returns rows only to platform staff, so an empty
  // result is the answer rather than an error.
  const { data: admin } = await supabase
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle()

  redirect(admin ? '/admin' : '/school')
}
