import { createClient } from '@/lib/supabase/server'

// A full JSON snapshot of one school's data.
//
// A Route Handler rather than a server action: the browser has to receive a
// FILE, and an action can only return a value into the React tree. This sets
// Content-Disposition and streams the JSON straight to the download.
//
// Read-only by construction. Every query goes through the caller's own
// Supabase client, so RLS decides what lands in the file -- a user who cannot
// see payroll gets a backup with no payroll in it, rather than an error or,
// worse, somebody else's rows.

// Ordered roughly as the schema builds up, so a human reading the file top to
// bottom meets parents before children.
const TABLES = [
  // Academic structure
  'sessions',
  'academic_years',
  'terms',
  'grade_levels',
  'classes',
  'sections',
  'subjects',
  'class_subjects',
  'section_subjects',
  // People
  'students',
  'student_enrollments',
  'certificates_issued',
  'staff',
  'staff_documents',
  'leave_requests',
  // Attendance
  'attendance',
  'staff_attendance',
  // Timetable
  'periods',
  'timetable_entries',
  'timetable_settings',
  // Examination
  'exams',
  'exam_subjects',
  'marks',
  'tests',
  'test_marks',
  'datesheet_groups',
  'datesheets',
  'exam_slips',
  // Fees
  'fee_items',
  'fee_policies',
  'fee_challans',
  'fee_challan_items',
  'fee_payments',
  // Payroll and accounts
  'salary_structures',
  'staff_salaries',
  'payroll_settings',
  'payroll_holidays',
  'payroll_runs',
  'payroll_items',
  'salary_payments',
  'expenses',
  // Operations
  'transport_routes',
  'vehicles',
  'passengers',
  'books',
  'book_copies',
  'book_loans',
  'inquiries',
  'visitors',
  'complaints',
  'contacts_directory',
  // Configuration
  'certificate_settings',
  'id_card_settings',
  'datesheet_configurations',
  'settings',
]

// Deliberately absent: audit_logs and notifications. The trail is append-only
// and can run to hundreds of thousands of rows, and notifications are
// transient -- including either would make the file enormous without making
// it more useful as a record of the school.

// Supabase caps a single select; a school with years of attendance will exceed
// it, so every table is paged.
const PAGE = 1000

async function dumpTable(supabase, schoolId, table) {
  const rows = []

  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('school_id', schoolId)
      .range(from, from + PAGE - 1)

    if (error) {
      // A table the caller's role cannot read, or one this school's schema
      // does not have, is not a failed backup -- it is a backup of what they
      // can see. The reason is recorded in the file rather than thrown away.
      return { skipped: error.message }
    }

    rows.push(...(data ?? []))
    if (!data || data.length < PAGE) break
  }

  return rows
}

export async function GET() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return Response.json({ error: 'Not signed in.' }, { status: 401 })
  }

  const { data: schoolId } = await supabase.rpc('current_school_id')
  if (!schoolId) {
    return Response.json({ error: 'No active school.' }, { status: 403 })
  }

  // The backup is the school's own record of itself, so it sits behind the
  // same permission as the settings screen that offers it.
  const { data: allowed } = await supabase.rpc('has_permission', {
    p_perm: 'core.settings.write',
  })
  if (!allowed) {
    return Response.json(
      { error: 'You do not have permission to export school data.' },
      { status: 403 }
    )
  }

  const { data: school } = await supabase
    .from('schools')
    .select('*')
    .eq('id', schoolId)
    .maybeSingle()

  const data = {}
  const skipped = {}

  // Sequential on purpose. Firing fifty queries at once against the connection
  // pool is how an export takes the whole app down with it.
  for (const table of TABLES) {
    const result = await dumpTable(supabase, schoolId, table)
    if (Array.isArray(result)) data[table] = result
    else skipped[table] = result.skipped
  }

  const counts = Object.fromEntries(Object.entries(data).map(([t, rows]) => [t, rows.length]))

  const payload = {
    _meta: {
      format: 'school-management-backup',
      version: 1,
      generated_at: new Date().toISOString(),
      generated_by: user.email ?? user.id,
      school_id: schoolId,
      school_name: school?.school_name ?? null,
      note: 'Read-only snapshot. Restoring is not supported from this file; it is for your own records.',
      row_counts: counts,
      // Named rather than silently absent, so an empty section in the file is
      // never mistaken for an empty school.
      skipped_tables: skipped,
    },
    school,
    data,
  }

  const stamp = new Date().toISOString().slice(0, 10)
  const slug = (school?.school_name ?? 'school')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="backup-${slug}-${stamp}.json"`,
      // A backup is a point-in-time snapshot; a cached one is a wrong one.
      'Cache-Control': 'no-store',
    },
  })
}
