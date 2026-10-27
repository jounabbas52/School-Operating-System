import Link from 'next/link'
import RefreshButton from '@/components/refresh-button'
import { getSchoolContext } from '@/lib/school-context'
import { dayRange, formatLongDate, formatTime, monthStartKey } from '@/lib/appearance'
import { FEE_METHOD_LABEL, MONTHS, money, plain, studentName } from '@/lib/fee-options'

export const metadata = { title: 'Dashboard' }

// THE DASHBOARD IS A SCREEN ABOUT TODAY.
//
// It used to be four counts -- classes, sections, subjects, users -- and a
// list of the modules the school had bought. None of that moves between
// Monday and Friday, so the first page everybody lands on said nothing about
// the day they had just walked into, and the module list told staff about a
// billing arrangement they cannot change from here.
//
// What replaces it is the morning questions: what has the fee counter taken,
// who is in and who is missing, which classes are short, and what is sitting
// unanswered. The things that do not change daily -- classes, sections,
// subjects, headcounts -- are still here, but at the bottom and in one line,
// because they are reference rather than news.
//
// THREE GATES, AND THEY ARE NOT THE SAME GATE
//
//   module      what the SCHOOL has bought -- from school_enabled_modules
//   permission  what THIS PERSON may see -- their rolled-up section codes
//   page        what THIS PERSON may OPEN -- their own sheet, page by page
//
// The first two decide whether a figure is drawn, and both are needed: an
// administrator holds every permission code whether or not the school bought
// the module (see adminAccess in lib/access.js), so the permission alone
// would draw a fee panel for a school with no Fees.
//
// The third decides whether that figure is a LINK, and it is stricter than
// the second, because a section code is held by anybody with view on any one
// page in it. See the `link` helper below. RLS is still what actually
// refuses the rows; none of this is the security boundary.

/* ---------------------------------------------------------------- furniture */

const TONES = {
  brand: { fg: 'var(--brand)', bg: 'var(--brand-soft)' },
  blue: { fg: 'var(--blue)', bg: 'var(--blue-soft)' },
  green: { fg: 'var(--green)', bg: 'var(--green-soft)' },
  amber: { fg: 'var(--amber)', bg: 'var(--amber-soft)' },
  red: { fg: 'var(--red)', bg: 'var(--red-soft)' },
}

function Tile({ label, value, sub, tone = 'brand', icon, href }) {
  const t = TONES[tone] ?? TONES.brand
  const body = (
    <div className="card flex h-full items-start justify-between gap-3 p-4">
      <div className="min-w-0">
        <p
          className="text-[0.68rem] font-semibold uppercase tracking-wider"
          style={{ color: 'var(--muted)' }}
        >
          {label}
        </p>
        <p className="mt-1.5 text-2xl font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>
          {value}
        </p>
        {sub && (
          <p className="mt-0.5 text-xs" style={{ color: 'var(--muted-2)' }}>
            {sub}
          </p>
        )}
      </div>
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-lg text-sm"
        style={{ background: t.bg, color: t.fg }}
        aria-hidden="true"
      >
        {icon}
      </span>
    </div>
  )
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  )
}

function Panel({ title, hint, href, linkLabel, children, className = '' }) {
  return (
    <section className={`card flex flex-col p-5 ${className}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
            {title}
          </h2>
          {hint && (
            <p className="mt-0.5 text-xs" style={{ color: 'var(--muted)' }}>
              {hint}
            </p>
          )}
        </div>
        {href && (
          <Link href={href} className="text-xs font-medium" style={{ color: 'var(--blue-600)' }}>
            {linkLabel ?? 'View'} →
          </Link>
        )}
      </div>
      <div className="mt-4 flex-1">{children}</div>
    </section>
  )
}

// A labelled bar. `display` overrides the "n · x%" on the right, for the rows
// where a percentage is the wrong way to read the number.
function Meter({ label, value, total, colour, display }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span style={{ color: 'var(--ink-2)' }}>{label}</span>
        <span className="font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>
          {display ?? `${plain(value)} · ${pct}%`}
        </span>
      </div>
      <div
        className="mt-1 h-1.5 w-full overflow-hidden rounded-full"
        style={{ background: 'var(--border-soft)' }}
      >
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: colour }} />
      </div>
    </div>
  )
}

// One line of the "Needs attention" list. A zero is still drawn, greyed: an
// empty list reads as "not loaded", and "0 overdue" is the answer somebody
// came to the screen for.
function Alert({ label, count, hint, href, tone = 'amber' }) {
  const quiet = !count
  const t = TONES[tone] ?? TONES.amber
  const body = (
    <div
      className="flex items-center justify-between gap-3 py-2"
      style={{ borderBottom: '1px solid var(--border-soft)' }}
    >
      <div className="min-w-0">
        <p className="truncate text-xs font-medium" style={{ color: 'var(--ink-2)' }}>
          {label}
        </p>
        {hint && (
          <p className="truncate text-[0.68rem]" style={{ color: 'var(--muted-2)' }}>
            {hint}
          </p>
        )}
      </div>
      <span
        className="shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums"
        style={{
          background: quiet ? 'var(--card-alt)' : t.bg,
          color: quiet ? 'var(--muted-2)' : t.fg,
        }}
      >
        {plain(count)}
      </span>
    </div>
  )
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  )
}

/* -------------------------------------------------------------------- page */

export default async function SchoolDashboard() {
  const { school, profile, modules, pages, permissions, isAdmin, schoolId, appearance, supabase } =
    await getSchoolContext()

  // The layout shows its "no school access" card in place of this page, but
  // the page still runs -- and every query below would go out with
  // school_id = null, which PostgREST answers with an error rather than zero.
  if (!schoolId) return null

  const enabled = new Set(modules.map((m) => m.code))
  const may = (module, code) => enabled.has(module) && permissions.has(code)

  const seeStudents = may('students', 'students.read')
  const seeStaff = may('staff', 'staff.read')
  const seeAcademics = may('academics', 'academics.read')
  const seeFees = may('fees', 'fees.read')
  const seeAttendance = may('attendance', 'attendance.read')
  const seeAccounts = may('accounts', 'accounts.read')
  const seeAdmissions = may('admissions', 'admissions.read')
  const seeFrontdesk = may('frontdesk', 'frontdesk.read')
  const seeLibrary = may('library', 'library.read')
  const seeLeave = may('hr', 'hr.read')

  // A THIRD GATE, ON THE LINKS ONLY.
  //
  // The two above decide whether a FIGURE is drawn; they work in sections --
  // fees.read, attendance.read -- and a section permission is held by anybody
  // with view on any one page in it. The links are narrower than that: a
  // clerk given Fees > Overview and nothing else holds fees.read, so they see
  // the day's takings, and "Collect fee →" would land them on a screen their
  // own sheet does not open.
  //
  // So every href on this page goes through the rule the sidebar is built
  // from -- pages.get(href).view, their own sheet, page by page. Failing it
  // takes the link away and leaves the number, which is the right way round:
  // they are allowed to know what the school took today, they are just not
  // the person who takes it.
  //
  // Candidates in order, because a page being shut does not mean the whole
  // module is: somebody who cannot reach Collect Fee can usually still reach
  // the Overview, and a link there beats no link at all. The label travels
  // with the href so it never promises the wrong screen.
  const link = (...candidates) => {
    for (const [href, label] of candidates) {
      // Keys in the sheet are routes; a tab or filter hangs off the end of
      // some of these hrefs and is not part of the page's identity.
      if (pages.get(href.split('?')[0])?.view) return { href, label }
    }
    return {}
  }

  // The school's day, not the server's. Rendered in UTC, a school in
  // Asia/Karachi would see yesterday's takings until 5am every morning.
  const now = new Date()
  const { day, start, end } = dayRange(now, { timezone: appearance.timezone })
  const monthStart = monthStartKey(now, { timezone: appearance.timezone })
  const year = Number(day.slice(0, 4))
  const monthNo = Number(day.slice(5, 7))

  // Built as a map and awaited in one batch, so a module the school has not
  // bought costs nothing rather than running a query whose result is dropped.
  //
  // dashboard_today is unconditional on purpose: it is one round trip for the
  // whole day, and it runs as the caller, so each figure inside it is already
  // filtered by that person's own RLS. Somebody without fees.read sums no
  // payments, because there are none for them to sum.
  const q = {
    today: supabase.rpc('dashboard_today', {
      p_school: schoolId,
      p_day: day,
      p_from: start,
      p_to: end,
    }),
  }

  if (seeStudents) {
    q.students = supabase
      .from('students')
      .select('*', { count: 'exact', head: true })
      .eq('school_id', schoolId)
      .eq('is_deleted', false)
      .eq('status', 'active')
    q.joinedThisMonth = supabase
      .from('students')
      .select('*', { count: 'exact', head: true })
      .eq('school_id', schoolId)
      .eq('is_deleted', false)
      .gte('admission_date', monthStart)
      .lte('admission_date', day)
    q.studentsByClass = supabase.rpc('student_class_summary', { p_school: schoolId })
  }

  if (seeStaff) {
    q.staff = supabase
      .from('staff')
      .select('*', { count: 'exact', head: true })
      .eq('school_id', schoolId)
      .eq('is_deleted', false)
      .eq('status', 'active')
    q.teachers = supabase
      .from('staff')
      .select('*', { count: 'exact', head: true })
      .eq('school_id', schoolId)
      .eq('is_deleted', false)
      .eq('status', 'active')
      .eq('staff_type', 'teaching')
  }

  if (seeAcademics) {
    q.classes = supabase
      .from('classes')
      .select('id, name, grade_levels(name, ordinal)')
      .eq('school_id', schoolId)
      .eq('is_deleted', false)
    q.sections = supabase
      .from('sections')
      .select('*', { count: 'exact', head: true })
      .eq('school_id', schoolId)
      .eq('is_deleted', false)
    q.subjects = supabase
      .from('subjects')
      .select('*', { count: 'exact', head: true })
      .eq('school_id', schoolId)
      .eq('is_deleted', false)
  }

  if (seeFees) {
    q.feeTotals = supabase.rpc('fee_totals', { p_school: schoolId })
    q.feeMonths = supabase.rpc('fee_monthly_collection', { p_school: schoolId, p_year: year })
    q.feeByClass = supabase.rpc('fee_class_summary', { p_school: schoolId })
    // The only row-level read on this screen, and it is the panel's own list:
    // six receipts, newest first. The day's TOTAL is counted in the database
    // by dashboard_today, so this limit cannot make the headline wrong.
    q.receipts = supabase
      .from('fee_payments')
      .select('id, amount_paid, paid_at, receipt_no, method, students(first_name, last_name)')
      .eq('school_id', schoolId)
      .eq('is_deleted', false)
      .gte('paid_at', start)
      .lt('paid_at', end)
      .order('paid_at', { ascending: false })
      .limit(6)
  }

  if (seeAttendance) {
    q.attendanceByClass = supabase.rpc('attendance_day_by_class', {
      p_school: schoolId,
      p_date: day,
    })
  }

  // A month of expenses is tens of rows, not thousands -- cheap enough to sum
  // here, and the only way to put a net against the month's collection.
  if (seeAccounts) {
    q.monthExpenses = supabase
      .from('expenses')
      .select('amount')
      .eq('school_id', schoolId)
      .eq('is_deleted', false)
      .gte('expense_date', monthStart)
      .lte('expense_date', day)
  }

  if (seeAdmissions) {
    // 'open' is what the table defaulted to before the pipeline existed, so
    // old rows carry it and new ones do not.
    q.openApplications = supabase
      .from('admission_inquiries')
      .select('*', { count: 'exact', head: true })
      .eq('school_id', schoolId)
      .eq('is_deleted', false)
      .in('status', ['applied', 'review', 'open'])
  }

  if (seeLeave) {
    q.pendingLeave = supabase
      .from('leave_requests')
      .select('*', { count: 'exact', head: true })
      .eq('school_id', schoolId)
      .eq('is_deleted', false)
      .eq('status', 'pending')
  }

  if (seeFrontdesk) {
    q.openComplaints = supabase
      .from('complaints')
      .select('*', { count: 'exact', head: true })
      .eq('school_id', schoolId)
      .eq('is_deleted', false)
      .in('status', ['pending', 'in_progress'])
  }

  if (seeLibrary) {
    // Overdue is derived, never stored: a loan issued on Monday is overdue on
    // Friday without anybody touching the row.
    q.overdueBooks = supabase
      .from('book_loans')
      .select('*', { count: 'exact', head: true })
      .eq('school_id', schoolId)
      .eq('is_deleted', false)
      .is('returned_at', null)
      .neq('status', 'lost')
      .lt('due_at', now.toISOString())
  }

  const keys = Object.keys(q)
  const settled = await Promise.all(keys.map((k) => q[k]))
  const r = Object.fromEntries(keys.map((k, i) => [k, settled[i]]))

  /* ------------------------------------------------------------- the numbers */

  // A single-row function comes back as an array of one.
  const today = r.today?.data?.[0] ?? {}
  const num = (v) => Number(v) || 0

  const collectedToday = num(today.fee_collected)
  const receiptsToday = num(today.fee_receipts)
  const cashToday = num(today.fee_cash)
  const otherToday = Math.max(0, collectedToday - cashToday)
  const spentToday = num(today.expense_total)

  const present = num(today.present)
  const absent = num(today.absent)
  const late = num(today.late)
  const excused = num(today.excused)
  const marked = num(today.marked)
  // Everyone called who was not marked absent -- late and excused included.
  //
  // Deliberately the same reading attendance_day_by_class uses, because the
  // per-class table below is built from that function. Two definitions of
  // "present" on one screen is how a headline stops adding up to the rows
  // underneath it, and the four meters further down carry the detail anyway.
  const inAttendance = marked - absent

  const staffPresent = num(today.staff_present)
  const staffAbsent = num(today.staff_absent)
  const staffMarked = num(today.staff_marked)

  const visitorsIn = num(today.visitors_in)
  const admissionsToday = num(today.admissions_new)

  const activeStudents = r.students?.count ?? 0
  const joinedThisMonth = r.joinedThisMonth?.count ?? 0
  const staffCount = r.staff?.count ?? 0
  const teacherCount = r.teachers?.count ?? 0
  const sectionCount = r.sections?.count ?? 0
  const subjectCount = r.subjects?.count ?? 0

  const feeTotals = r.feeTotals?.data?.[0] ?? {}
  const billed = num(feeTotals.billed)
  const collected = num(feeTotals.collected)
  const outstanding = Math.max(0, billed - collected)
  const overdueChallans = num(feeTotals.overdue_count)
  const unpaidChallans = num(feeTotals.unpaid_count) + num(feeTotals.partial_count)

  const collectedThisMonth = num(
    (r.feeMonths?.data ?? []).find((row) => Number(row.month) === monthNo)?.collected
  )
  const spentThisMonth = (r.monthExpenses?.data ?? []).reduce((sum, e) => sum + num(e.amount), 0)

  const receipts = r.receipts?.data ?? []

  // The register's denominator. Marked-of-enrolled is the number that says
  // whether a quiet morning was quiet or simply never called.
  const roll = seeStudents && activeStudents > 0 ? activeStudents : marked
  const attendancePct = marked > 0 ? Math.round((inAttendance / marked) * 100) : 0

  /* ----------------------------------------------------------- classes today */

  const classList = (r.classes?.data ?? [])
    .slice()
    .sort((a, b) => (a.grade_levels?.ordinal ?? 999) - (b.grade_levels?.ordinal ?? 999))

  const studentsPerClass = new Map(
    (r.studentsByClass?.data ?? []).map((row) => [row.class_id, num(row.total)])
  )
  const attendancePerClass = new Map(
    (r.attendanceByClass?.data ?? []).map((row) => [
      row.class_id,
      { present: num(row.present), absent: num(row.absent), total: num(row.total) },
    ])
  )
  const feesPerClass = new Map(
    (r.feeByClass?.data ?? []).map((row) => [
      row.class_id,
      { billed: num(row.billed), collected: num(row.collected) },
    ])
  )

  const classRows = classList.map((c) => {
    const register = attendancePerClass.get(c.id)
    const fees = feesPerClass.get(c.id)
    return {
      id: c.id,
      label: c.grade_levels?.name ?? c.name,
      students: studentsPerClass.get(c.id) ?? 0,
      marked: register?.total ?? 0,
      present: register?.present ?? 0,
      absent: register?.absent ?? 0,
      // null, not 0: a class nobody has billed has no collection rate, and
      // drawing it as 0% reads as a class that has paid nothing.
      rate: fees && fees.billed > 0 ? Math.round((fees.collected / fees.billed) * 100) : null,
    }
  })

  /* --------------------------------------------------------------- the tiles */

  // More candidates than slots, in the order an office would want them. The
  // first four this person can actually see are the ones drawn, so a school
  // without Fees gets a full row rather than two tiles and a gap.
  const tiles = [
    seeStudents && {
      label: 'Students',
      value: plain(activeStudents),
      sub: joinedThisMonth > 0 ? `+${plain(joinedThisMonth)} admitted this month` : 'on the roll',
      tone: 'blue',
      icon: '◉',
      href: link(['/school/students'], ['/school/students/register']).href,
    },
    seeFees && {
      label: 'Collected today',
      value: money(collectedToday),
      sub: `${plain(receiptsToday)} receipt${receiptsToday === 1 ? '' : 's'}`,
      tone: 'green',
      icon: '₨',
      href: link(['/school/fees/collect'], ['/school/fees'], ['/school/fees/challans']).href,
    },
    seeAttendance && {
      label: 'Present today',
      value: marked > 0 ? `${plain(inAttendance)} / ${plain(roll)}` : 'Not marked',
      sub: marked > 0 ? `${attendancePct}% of those called` : 'no register taken yet',
      tone: marked === 0 ? 'amber' : attendancePct >= 90 ? 'green' : 'amber',
      icon: '✓',
      href: link(['/school/attendance'], ['/school/attendance/reports']).href,
    },
    seeFees && {
      label: 'Outstanding dues',
      value: money(outstanding),
      sub: `${plain(overdueChallans)} challan${overdueChallans === 1 ? '' : 's'} overdue`,
      tone: outstanding > 0 ? 'red' : 'green',
      icon: '!',
      href: link(['/school/fees/reports'], ['/school/fees/challans'], ['/school/fees']).href,
    },
    seeStaff && {
      label: 'Staff',
      value: plain(staffCount),
      sub: `${plain(teacherCount)} teaching`,
      tone: 'brand',
      icon: '◆',
      href: link(['/school/hr'], ['/school/teachers']).href,
    },
    seeAcademics && {
      label: 'Classes',
      value: plain(classList.length),
      sub: `${plain(sectionCount)} section${sectionCount === 1 ? '' : 's'}`,
      tone: 'brand',
      icon: '▦',
      href: link(['/school/academics/classes'], ['/school/academics/sections']).href,
    },
  ]
    .filter(Boolean)
    .slice(0, 4)

  const alerts = [
    seeFees && {
      label: 'Overdue challans',
      count: overdueChallans,
      hint: 'past their due date, not settled',
      href: link(['/school/fees/reports?tab=overdue'], ['/school/fees/challans']).href,
      tone: 'red',
    },
    seeFees && {
      label: 'Unpaid or partial challans',
      count: unpaidChallans,
      hint: `${money(outstanding)} still owed`,
      href: link(['/school/fees/challans'], ['/school/fees/reports']).href,
      tone: 'amber',
    },
    seeAttendance && {
      label: 'Absent today',
      count: absent,
      hint: late > 0 ? `${plain(late)} more marked late` : 'students marked absent',
      href: link(['/school/attendance'], ['/school/attendance/reports']).href,
      tone: 'red',
    },
    seeLeave && {
      label: 'Leave requests waiting',
      count: r.pendingLeave?.count ?? 0,
      hint: 'nobody has decided these yet',
      href: link(['/school/hr/leave']).href,
      tone: 'amber',
    },
    seeAdmissions && {
      label: 'Open applications',
      count: r.openApplications?.count ?? 0,
      hint: admissionsToday > 0 ? `${plain(admissionsToday)} arrived today` : 'applied or in review',
      href: link(['/school/admissions']).href,
      tone: 'blue',
    },
    seeFrontdesk && {
      label: 'Complaints open',
      count: r.openComplaints?.count ?? 0,
      hint: 'pending or in progress',
      href: link(['/school/frontdesk/complaints']).href,
      tone: 'amber',
    },
    seeFrontdesk && {
      label: 'Visitors in the building',
      count: visitorsIn,
      hint: 'signed in, not signed out',
      href: link(['/school/frontdesk/visitors']).href,
      tone: 'blue',
    },
    seeLibrary && {
      label: 'Books overdue',
      count: r.overdueBooks?.count ?? 0,
      hint: 'issued and past the return date',
      href: link(['/school/library/issue-return'], ['/school/library']).href,
      tone: 'amber',
    },
  ].filter(Boolean)

  const firstName = (profile?.full_name || '').split(' ')[0]
  const longDate = formatLongDate(now, { timezone: appearance.timezone })
  const monthName = MONTHS.find((m) => m.id === monthNo)?.label ?? ''

  // The panel headings' own links, resolved once rather than inline, because
  // each has a fallback and the label has to follow whichever one wins.
  const feeLink = link(
    ['/school/fees/collect', 'Collect fee'],
    ['/school/fees', 'Fee overview'],
    ['/school/fees/challans', 'Challans']
  )
  const registerLink = link(
    ['/school/attendance', 'Register'],
    ['/school/attendance/reports', 'Attendance reports']
  )
  const classLink = link(
    ['/school/academics/classes', 'All classes'],
    ['/school/academics/sections', 'Sections']
  )
  const monthLink = link(
    ['/school/fees/reports', 'Fee reports'],
    ['/school/fees', 'Fee overview'],
    ['/school/students/reports', 'Student reports']
  )

  const showClassPanel = seeAcademics && classRows.length > 0
  const showMonth = seeFees || seeAccounts || seeStudents
  const nothingToShow = tiles.length === 0 && alerts.length === 0 && !showClassPanel

  return (
    <div className="flex flex-col gap-5">
      {/* --------------------------------------------------------------- head */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            {longDate}
          </p>
          <h1 className="mt-1 text-xl font-semibold" style={{ color: 'var(--ink)' }}>
            Welcome{firstName ? `, ${firstName}` : ''}
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
            {school?.school_name}
            {isAdmin
              ? ' · administrator, full access'
              : ` · ${permissions.size} permission${permissions.size === 1 ? '' : 's'}`}
          </p>
        </div>
        <RefreshButton />
      </div>

      {nothingToShow && (
        <section className="card p-8 text-center">
          <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            Nothing to show here yet
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm" style={{ color: 'var(--muted)' }}>
            This dashboard draws on the fee counter, the registers and the front desk. None of
            those are open to you, so there is nothing for it to report — the pages in your
            sidebar are where your work is.
          </p>
        </section>
      )}

      {/* -------------------------------------------------------------- tiles */}
      {tiles.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {tiles.map((tile) => (
            <Tile key={tile.label} {...tile} />
          ))}
        </div>
      )}

      {/* ------------------------------------------------- today: money + roll */}
      {(seeFees || seeAttendance) && (
        <div className="grid gap-4 lg:grid-cols-3">
          {seeFees && (
            <Panel
              title="Fee counter — today"
              hint="Every receipt written since midnight, in the school's own zone"
              href={feeLink.href}
              linkLabel={feeLink.label}
              className="lg:col-span-2"
            >
              <div className="grid gap-5 sm:grid-cols-[minmax(0,14rem)_1fr]">
                <div>
                  <p
                    className="text-3xl font-semibold tabular-nums"
                    style={{ color: 'var(--green)' }}
                  >
                    {money(collectedToday)}
                  </p>
                  <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                    across {plain(receiptsToday)} receipt{receiptsToday === 1 ? '' : 's'}
                  </p>

                  {/* Cash is split out because it is the half that has to
                      match the drawer at closing time. */}
                  <div className="mt-4 flex flex-col gap-2.5">
                    <Meter
                      label="Cash in the drawer"
                      value={cashToday}
                      total={Math.max(1, collectedToday)}
                      colour="var(--green)"
                      display={money(cashToday)}
                    />
                    <Meter
                      label="Bank, card and online"
                      value={otherToday}
                      total={Math.max(1, collectedToday)}
                      colour="var(--blue)"
                      display={money(otherToday)}
                    />
                  </div>

                  {seeAccounts && (
                    <p
                      className="mt-3 pt-2.5 text-xs"
                      style={{ borderTop: '1px solid var(--border-soft)', color: 'var(--muted)' }}
                    >
                      Less {money(spentToday)} spent today ·{' '}
                      <span className="font-semibold" style={{ color: 'var(--ink)' }}>
                        {money(collectedToday - spentToday)} net
                      </span>
                    </p>
                  )}
                </div>

                <div>
                  {receipts.length === 0 ? (
                    <p className="text-sm" style={{ color: 'var(--muted)' }}>
                      No fee has been taken yet today.
                    </p>
                  ) : (
                    <ul className="flex flex-col">
                      {receipts.map((p) => (
                        <li
                          key={p.id}
                          className="flex items-center justify-between gap-3 py-2"
                          style={{ borderBottom: '1px solid var(--border-soft)' }}
                        >
                          <div className="min-w-0">
                            <p
                              className="truncate text-xs font-medium"
                              style={{ color: 'var(--ink-2)' }}
                            >
                              {studentName(p.students) || 'Student'}
                            </p>
                            <p
                              className="truncate text-[0.68rem]"
                              style={{ color: 'var(--muted-2)' }}
                            >
                              {p.receipt_no ? `${p.receipt_no} · ` : ''}
                              {FEE_METHOD_LABEL[p.method] ?? p.method} ·{' '}
                              {formatTime(p.paid_at, { timezone: appearance.timezone })}
                            </p>
                          </div>
                          <span
                            className="shrink-0 text-xs font-semibold tabular-nums"
                            style={{ color: 'var(--ink)' }}
                          >
                            {money(p.amount_paid)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </Panel>
          )}

          {seeAttendance && (
            <Panel
              title="Registers — today"
              hint={marked > 0 ? `${plain(marked)} of ${plain(roll)} pupils called` : 'not taken yet'}
              href={registerLink.href}
              linkLabel={registerLink.label}
            >
              {marked === 0 ? (
                <p className="text-sm" style={{ color: 'var(--muted)' }}>
                  Nobody has been marked today. Until a register is taken this panel has nothing
                  to report — an unmarked morning and an empty school look the same from here.
                </p>
              ) : (
                <div className="flex flex-col gap-2.5">
                  <Meter label="Present" value={present} total={marked} colour="var(--green)" />
                  <Meter label="Late" value={late} total={marked} colour="var(--amber)" />
                  <Meter label="Absent" value={absent} total={marked} colour="var(--red)" />
                  <Meter label="Excused" value={excused} total={marked} colour="var(--blue)" />
                  {seeStudents && roll > marked && (
                    <p className="pt-1 text-xs" style={{ color: 'var(--amber)' }}>
                      {plain(roll - marked)} pupil{roll - marked === 1 ? '' : 's'} not called yet.
                    </p>
                  )}
                </div>
              )}

              <div className="mt-4 pt-3" style={{ borderTop: '1px solid var(--border-soft)' }}>
                <p className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>
                  Staff
                </p>
                {staffMarked === 0 ? (
                  <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                    No staff register today.
                  </p>
                ) : (
                  <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                    <span className="font-semibold" style={{ color: 'var(--ink)' }}>
                      {plain(staffPresent)}
                    </span>{' '}
                    in,{' '}
                    <span className="font-semibold" style={{ color: 'var(--ink)' }}>
                      {plain(staffAbsent)}
                    </span>{' '}
                    away, of {plain(staffMarked)} marked
                    {seeStaff && staffCount > staffMarked
                      ? ` · ${plain(staffCount - staffMarked)} not called`
                      : ''}
                  </p>
                )}
              </div>
            </Panel>
          )}
        </div>
      )}

      {/* ------------------------------------------- classes + needs attention */}
      {(showClassPanel || alerts.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-3">
          {showClassPanel && (
            <Panel
              title="Classes today"
              hint="The roll, this morning's register and the fee position, per class"
              href={classLink.href}
              linkLabel={classLink.label}
              className="lg:col-span-2"
            >
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th className="text-left">Class</th>
                      <th className="text-right">Students</th>
                      {seeAttendance && <th className="text-right">Present</th>}
                      {seeAttendance && <th className="text-right">Absent</th>}
                      {seeFees && <th className="text-right">Fee collected</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {classRows.map((row) => (
                      <tr key={row.id}>
                        <td style={{ color: 'var(--ink-2)' }}>{row.label}</td>
                        <td className="text-right tabular-nums">{plain(row.students)}</td>
                        {seeAttendance && (
                          <td className="text-right tabular-nums">
                            {row.marked === 0 ? (
                              <span style={{ color: 'var(--muted-2)' }}>—</span>
                            ) : (
                              plain(row.present)
                            )}
                          </td>
                        )}
                        {seeAttendance && (
                          <td className="text-right tabular-nums">
                            {row.marked === 0 ? (
                              <span style={{ color: 'var(--muted-2)' }}>—</span>
                            ) : row.absent > 0 ? (
                              <span style={{ color: 'var(--red)' }}>{plain(row.absent)}</span>
                            ) : (
                              '0'
                            )}
                          </td>
                        )}
                        {seeFees && (
                          <td className="text-right">
                            {row.rate === null ? (
                              <span style={{ color: 'var(--muted-2)' }}>—</span>
                            ) : (
                              <span
                                className={`pill ${
                                  row.rate >= 90
                                    ? 'pill-green'
                                    : row.rate >= 60
                                      ? 'pill-amber'
                                      : 'pill-red'
                                }`}
                              >
                                {row.rate}%
                              </span>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}

          {alerts.length > 0 && (
            <Panel title="Needs attention" hint="Everything waiting on somebody here">
              <div className="flex flex-col">
                {alerts.map((a) => (
                  <Alert key={a.label} {...a} />
                ))}
              </div>
            </Panel>
          )}
        </div>
      )}

      {/* --------------------------------------------------------- this month */}
      {showMonth && (
        <Panel
          title={`${monthName} so far`}
          hint="Counted on the day money arrived, not the month it was billed for"
          href={monthLink.href}
          linkLabel={monthLink.label}
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {seeFees && (
              <div>
                <p className="text-lg font-semibold tabular-nums" style={{ color: 'var(--green)' }}>
                  {money(collectedThisMonth)}
                </p>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>
                  Fee collected
                </p>
              </div>
            )}
            {seeAccounts && (
              <div>
                <p className="text-lg font-semibold tabular-nums" style={{ color: 'var(--red)' }}>
                  {money(spentThisMonth)}
                </p>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>
                  Expenses recorded
                </p>
              </div>
            )}
            {seeFees && seeAccounts && (
              <div>
                <p className="text-lg font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>
                  {money(collectedThisMonth - spentThisMonth)}
                </p>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>
                  Net
                </p>
              </div>
            )}
            {seeStudents && (
              <div>
                <p className="text-lg font-semibold tabular-nums" style={{ color: 'var(--blue)' }}>
                  {plain(joinedThisMonth)}
                </p>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>
                  New admissions
                </p>
              </div>
            )}
          </div>
        </Panel>
      )}

      {/* ------------------------------------------------------ the setup line */}
      {/* Reference, not news: these change once a year, so they sit at the
          bottom in one line rather than taking four cards at the top. */}
      {(seeAcademics || seeStaff || seeStudents) && (
        <div className="card flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3 text-xs">
          {/* The count stays either way; only the link comes off. Somebody
              allowed to know the school has eleven classes is not necessarily
              allowed to open the screen that edits them. */}
          {[
            seeStudents && ['Students', plain(activeStudents), '/school/students'],
            seeAcademics && ['Classes', plain(classList.length), '/school/academics/classes'],
            seeAcademics && ['Sections', plain(sectionCount), '/school/academics/sections'],
            seeAcademics && ['Subjects', plain(subjectCount), '/school/academics/subjects'],
            seeStaff && ['Teachers', plain(teacherCount), '/school/teachers'],
            seeStaff && ['Staff', plain(staffCount), '/school/hr'],
          ]
            .filter(Boolean)
            .map(([label, value, target]) => {
              const inner = (
                <>
                  <span className="font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>
                    {value}
                  </span>
                  <span style={{ color: 'var(--muted)' }}>{label}</span>
                </>
              )
              const href = link([target]).href
              return href ? (
                <Link key={label} href={href} className="flex items-baseline gap-1.5">
                  {inner}
                </Link>
              ) : (
                <span key={label} className="flex items-baseline gap-1.5">
                  {inner}
                </span>
              )
            })}
        </div>
      )}
    </div>
  )
}
