-- ============================================================================
-- 007_ATTENDANCE.sql -- run after 006_hr_staff.sql
-- ============================================================================
-- Paste the whole file into the SQL editor and Run. Idempotent.
--
-- WHAT THIS ADDS AND WHY
--
-- 1. Both status columns widened. attendance_status is an ENUM of
--    (present, absent, late, excused) and the register needs five marks:
--    Present, Absent, Short Leave, Leave, Late. Converted to text with a
--    CHECK rather than adding enum values, because ALTER TYPE ... ADD VALUE
--    cannot run inside a transaction block and the SQL editor wraps
--    statements in one. Same move as students in 003 and staff in 005.
--
--    'excused' is kept in the CHECK so rows written before today stay legal.
--
-- 2. attendance.class_id / section_id / session_id -- the class the student
--    sat in ON THAT DAY. Today this is only derivable through
--    students.current_class_id, which is where they are NOW. The first
--    promotion would silently rewrite last year's class registers: March's
--    attendance for 1st-A would start reporting itself as 2nd-A. Recording it
--    on the row is the only way the history stays true.
--
-- 3. staff_attendance.check_in / check_out -- a staff register is a
--    timesheet, not a tick. Payroll deductions and late arrivals both need
--    the clock, not just the status.
--
-- 4. staff.shift -- the Shift filter on the staff register.
--
-- 5. Two report functions. The Reports and History screens ask for counts
--    per student and per day over a date range; pulling every row into the
--    browser to count them there falls over on a year of data for 500
--    pupils. Both are SECURITY INVOKER on purpose -- they run as the caller,
--    so the ordinary RLS on attendance is what decides which rows are
--    visible, exactly as it would for a direct select.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Widen attendance.status
-- ----------------------------------------------------------------------------
DO $student_status$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'attendance'
      AND column_name = 'status' AND udt_name = 'attendance_status'
  ) THEN
    ALTER TABLE public.attendance ALTER COLUMN status DROP DEFAULT;
    ALTER TABLE public.attendance ALTER COLUMN status TYPE text USING status::text;
    ALTER TABLE public.attendance ALTER COLUMN status SET DEFAULT 'present';
    RAISE NOTICE 'attendance.status: attendance_status -> text';
  END IF;
END
$student_status$;

ALTER TABLE public.attendance DROP CONSTRAINT IF EXISTS attendance_status_check;
ALTER TABLE public.attendance
  ADD CONSTRAINT attendance_status_check
  CHECK (status IN ('present','absent','late','leave','short_leave','excused'));


-- ----------------------------------------------------------------------------
-- 2. Widen staff_attendance.status
-- ----------------------------------------------------------------------------
DO $staff_status$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'staff_attendance'
      AND column_name = 'status' AND udt_name = 'attendance_status'
  ) THEN
    ALTER TABLE public.staff_attendance ALTER COLUMN status DROP DEFAULT;
    ALTER TABLE public.staff_attendance ALTER COLUMN status TYPE text USING status::text;
    ALTER TABLE public.staff_attendance ALTER COLUMN status SET DEFAULT 'present';
    RAISE NOTICE 'staff_attendance.status: attendance_status -> text';
  END IF;
END
$staff_status$;

ALTER TABLE public.staff_attendance DROP CONSTRAINT IF EXISTS staff_attendance_status_check;
ALTER TABLE public.staff_attendance
  ADD CONSTRAINT staff_attendance_status_check
  CHECK (status IN ('present','absent','late','leave','short_leave','half_day','excused'));


-- ----------------------------------------------------------------------------
-- 3. Where the student actually sat that day
-- ----------------------------------------------------------------------------
ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS class_id   uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS section_id uuid REFERENCES public.sections(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES public.sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_attendance_class
  ON public.attendance (school_id, class_id, section_id, date);
CREATE INDEX IF NOT EXISTS idx_attendance_student
  ON public.attendance (school_id, student_id, date);

-- Existing rows predate the columns. Their student has not been promoted yet
-- if the register was only just started, so current_class_id is the best
-- answer available -- and the only one that will ever be available.
UPDATE public.attendance a
   SET class_id   = COALESCE(a.class_id, s.current_class_id),
       section_id = COALESCE(a.section_id, s.current_section_id),
       session_id = COALESCE(a.session_id, s.session_id)
  FROM public.students s
 WHERE s.id = a.student_id
   AND (a.class_id IS NULL OR a.section_id IS NULL OR a.session_id IS NULL);


-- ----------------------------------------------------------------------------
-- 4. Staff timesheet columns and shift
-- ----------------------------------------------------------------------------
ALTER TABLE public.staff_attendance
  ADD COLUMN IF NOT EXISTS check_in  time,
  ADD COLUMN IF NOT EXISTS check_out time;

CREATE INDEX IF NOT EXISTS idx_staff_attendance_date
  ON public.staff_attendance (school_id, date);

ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS shift text NOT NULL DEFAULT 'morning';

ALTER TABLE public.staff DROP CONSTRAINT IF EXISTS staff_shift_check;
ALTER TABLE public.staff
  ADD CONSTRAINT staff_shift_check
  CHECK (shift IN ('morning','evening','both'));


-- ----------------------------------------------------------------------------
-- 5. Report aggregates
-- ----------------------------------------------------------------------------
-- Per-student totals over a date range. NULL class/section means "all".
-- SECURITY INVOKER (the default): RLS on attendance decides what is counted.
CREATE OR REPLACE FUNCTION public.attendance_student_summary(
  p_from    date,
  p_to      date,
  p_class   uuid DEFAULT NULL,
  p_section uuid DEFAULT NULL
)
RETURNS TABLE (
  student_id  uuid,
  present     bigint,
  absent      bigint,
  late        bigint,
  leave_count bigint,
  marked      bigint
)
LANGUAGE sql
STABLE
AS $fn$
  SELECT a.student_id,
         count(*) FILTER (WHERE a.status = 'present'),
         count(*) FILTER (WHERE a.status = 'absent'),
         count(*) FILTER (WHERE a.status = 'late'),
         count(*) FILTER (WHERE a.status IN ('leave','short_leave','excused')),
         count(*)
    FROM public.attendance a
   WHERE a.is_deleted = false
     AND a.date BETWEEN p_from AND p_to
     AND (p_class   IS NULL OR a.class_id   = p_class)
     AND (p_section IS NULL OR a.section_id = p_section)
   GROUP BY a.student_id;
$fn$;

GRANT EXECUTE ON FUNCTION public.attendance_student_summary(date, date, uuid, uuid) TO authenticated;

-- One row per day (and class), for the daily log and the history screen.
CREATE OR REPLACE FUNCTION public.attendance_daily_summary(
  p_from    date,
  p_to      date,
  p_class   uuid DEFAULT NULL,
  p_section uuid DEFAULT NULL
)
RETURNS TABLE (
  date        date,
  class_id    uuid,
  section_id  uuid,
  total       bigint,
  present     bigint,
  absent      bigint,
  late        bigint,
  leave_count bigint
)
LANGUAGE sql
STABLE
AS $fn$
  SELECT a.date,
         a.class_id,
         a.section_id,
         count(*),
         count(*) FILTER (WHERE a.status = 'present'),
         count(*) FILTER (WHERE a.status = 'absent'),
         count(*) FILTER (WHERE a.status = 'late'),
         count(*) FILTER (WHERE a.status IN ('leave','short_leave','excused'))
    FROM public.attendance a
   WHERE a.is_deleted = false
     AND a.date BETWEEN p_from AND p_to
     AND (p_class   IS NULL OR a.class_id   = p_class)
     AND (p_section IS NULL OR a.section_id = p_section)
   GROUP BY a.date, a.class_id, a.section_id
   ORDER BY a.date DESC;
$fn$;

GRANT EXECUTE ON FUNCTION public.attendance_daily_summary(date, date, uuid, uuid) TO authenticated;


DO $report$
BEGIN
  RAISE NOTICE '----------------------------------------------------------';
  RAISE NOTICE 'Attendance upgrade applied.';
  RAISE NOTICE '  student marks: %', (SELECT count(*) FROM public.attendance WHERE is_deleted = false);
  RAISE NOTICE '  staff marks:   %', (SELECT count(*) FROM public.staff_attendance WHERE is_deleted = false);
  RAISE NOTICE '----------------------------------------------------------';
END
$report$;
