import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

// The root decides which panel you belong in, so nothing else has to guess.
//
// There are two, and only two. Platform staff have profiles.school_id = NULL
// and a platform_admins row; everybody else belongs to exactly one school and
// goes to /school, where the sidebar is built from their own page list.
//
// There used to be a third -- a teacher panel, reached by inferring "this
// person looks like a teacher" from their permissions. It guessed wrong often
// enough to matter, and its way out led back to the guess, so somebody with
// perfectly good access could be trapped between the two. One panel, and a
// list of pages, cannot do that.
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
