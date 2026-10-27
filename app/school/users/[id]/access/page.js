import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getSchoolContext } from '@/lib/school-context'
import { accessTree } from '@/lib/access'
import AccessForm from './access-form'

export const metadata = { title: 'Access' }

// EVERYTHING ONE PERSON MAY DO, ON ONE PAGE.
//
// Not a dialog. An admin setting somebody up works down the whole menu --
// which modules they get, and page by page what they may do inside each --
// and that is a page's worth of decisions, with scrolling and a Save at the
// end. A popup made it feel like a quick edit and hid half the list.
//
// Two rules, both visible here at once:
//
//   1. the module switch on each group header: off, and the group is not in
//      their sidebar at all
//   2. view / edit / delete on each page inside it
export default async function UserAccessPage({ params }) {
  const { id } = await params
  const { schoolId, modules, permissions, profile: me, supabase } = await getSchoolContext()

  if (!permissions.has('users.read')) {
    return (
      <div className="card px-6 py-16 text-center" style={{ borderStyle: 'dashed' }}>
        <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
          Not available to you
        </p>
        <p className="mx-auto mt-1 max-w-sm text-sm" style={{ color: 'var(--muted)' }}>
          Managing access needs <strong>View</strong> on the Users &amp; Access page of your own
          list.
        </p>
        <Link href="/school" className="btn btn-ghost mt-4">
          Back to dashboard
        </Link>
      </div>
    )
  }

  const [{ data: person }, { data: pageRows }, { data: moduleRows }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, email, status, is_school_admin')
      .eq('id', id)
      .eq('school_id', schoolId)
      .maybeSingle(),
    supabase
      .from('user_page_access')
      .select('page, section, can_view, can_edit, can_delete')
      .eq('school_id', schoolId)
      .eq('profile_id', id),
    supabase
      .from('user_module_access')
      .select('module, enabled')
      .eq('school_id', schoolId)
      .eq('profile_id', id),
  ])

  if (!person) notFound()

  // An administrator has no access list, so there is nothing on this page to
  // show them. Every switch would be on, none of them would mean anything,
  // and turning one off would do nothing at all -- which is a worse lesson
  // than a plain sentence.
  if (person.is_school_admin) {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>
            {person.full_name || person.email}
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
            {person.email}
          </p>
        </div>

        <div
          className="card flex flex-col gap-3 p-6"
          style={{ borderColor: 'var(--amber)' }}
        >
          <span className="pill pill-amber w-fit">administrator</span>
          <p className="text-sm" style={{ color: 'var(--ink-2)' }}>
            Administrators have every page of every module this school has, always, and no access
            list to set. They are the people who write everybody else&rsquo;s.
          </p>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            That is deliberate rather than an oversight: an access system whose own administrator
            can be switched out of the screen that fixes it has one failure mode, and it costs you
            the school. So there is nothing here to configure, and nothing here to get wrong.
          </p>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            To take this away, or to appoint somebody else, use the SQL editor — it is not a button
            on purpose:{' '}
            <code className="font-mono text-[0.72rem]">
              SELECT make_school_admin(&apos;{person.email}&apos;);
            </code>
          </p>
          <span className="flex flex-wrap gap-2 pt-1">
            <Link href={`/school/users/${person.id}`} className="btn btn-ghost">
              Their file
            </Link>
            <Link href="/school/users" className="btn btn-ghost">
              All users
            </Link>
          </span>
        </div>
      </div>
    )
  }

  // Narrowed to the modules this school actually has: a switch that grants
  // nothing however it is set is worse than no switch.
  const tree = accessTree(modules.map((m) => m.code))

  const canWrite = permissions.has('users.write')
  const isMe = person.id === me?.id

  return (
    <AccessForm
      person={person}
      tree={tree}
      pageRows={pageRows ?? []}
      moduleRows={moduleRows ?? []}
      readOnly={!canWrite || isMe}
      reason={
        isMe
          ? 'This is your own access, so it is read-only here. Another administrator can change it — which is what stops anybody from quietly locking the school out of its own user screen.'
          : !canWrite
            ? 'Changing access needs Edit on the Users & Access page of your own list.'
            : null
      }
    />
  )
}
