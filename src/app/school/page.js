import Link from 'next/link'
import { getSchoolContext } from '@/lib/school-context'

export const metadata = { title: 'Dashboard' }

const BUILT = new Set(['core', 'users', 'academics'])

function StatCard({ label, value, sub, href, tone }) {
  const body = (
    <div className="card flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <span
          className="flex size-9 items-center justify-center rounded-lg text-sm font-semibold text-white"
          style={{ background: tone }}
        >
          {label[0]}
        </span>
        {href && (
          <span className="text-xs font-medium" style={{ color: 'var(--blue-600)' }}>
            View →
          </span>
        )}
      </div>
      <div>
        <p className="text-2xl font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>
          {value}
        </p>
        <p
          className="mt-0.5 text-[0.68rem] font-semibold uppercase tracking-wider"
          style={{ color: 'var(--muted)' }}
        >
          {label}
        </p>
        {sub && (
          <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
            {sub}
          </p>
        )}
      </div>
    </div>
  )
  return href ? <Link href={href}>{body}</Link> : body
}

export default async function SchoolDashboard() {
  const { school, profile, modules, permissions, schoolId, supabase } = await getSchoolContext()

  const [{ count: classCount }, { count: sectionCount }, { count: subjectCount }, { count: userCount }] =
    await Promise.all([
      supabase.from('classes').select('*', { count: 'exact', head: true }).eq('school_id', schoolId).eq('is_deleted', false),
      supabase.from('sections').select('*', { count: 'exact', head: true }).eq('school_id', schoolId).eq('is_deleted', false),
      supabase.from('subjects').select('*', { count: 'exact', head: true }).eq('school_id', schoolId).eq('is_deleted', false),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('school_id', schoolId),
    ])

  const role = profile?.profile_roles?.[0]?.roles
  const firstName = (profile?.full_name || '').split(' ')[0]
  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  const pending = modules.filter((m) => !BUILT.has(m.code))

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-xs" style={{ color: 'var(--muted)' }}>
          {today}
        </p>
        <h1 className="mt-1 text-xl font-semibold" style={{ color: 'var(--ink)' }}>
          Welcome{firstName ? `, ${firstName}` : ''}
        </h1>
        <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
          {school?.school_name} · {role?.display_name ?? 'no role'} · {permissions.size} permissions
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Classes"
          value={classCount ?? 0}
          href="/school/academics/classes"
          tone="var(--blue-600)"
        />
        <StatCard
          label="Sections"
          value={sectionCount ?? 0}
          href="/school/academics/sections"
          tone="var(--green)"
        />
        <StatCard
          label="Subjects"
          value={subjectCount ?? 0}
          href="/school/academics/subjects"
          tone="var(--brand)"
        />
        <StatCard
          label="Users"
          value={userCount ?? 0}
          href={permissions.has('users.read') ? '/school/users' : undefined}
          tone="var(--amber)"
        />
      </div>

      <section className="card p-5">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
          Your modules
        </h2>
        <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
          {modules.length} enabled for this school. Anything not listed was switched off by the
          platform — its data is unreachable, not merely hidden.
        </p>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {modules.map((module) => (
            <span
              key={module.code}
              className={BUILT.has(module.code) ? 'pill pill-green' : 'pill pill-muted'}
            >
              {module.name}
            </span>
          ))}
        </div>
        {pending.length > 0 && (
          <p className="mt-3 text-xs" style={{ color: 'var(--muted)' }}>
            {pending.length} module{pending.length === 1 ? ' is' : 's are'} enabled but not built
            yet.
          </p>
        )}
      </section>
    </div>
  )
}
