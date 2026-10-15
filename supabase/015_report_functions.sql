-- ============================================================================
-- 015_REPORT_FUNCTIONS.sql -- run after 014_super_admin.sql
-- ============================================================================
-- Paste the whole file into the SQL editor and Run. Idempotent.
--
-- WHY THIS EXISTS
--
-- Three dashboards -- Fee Overview, Fee Reports and the main Reports screen --
-- were summing whole tables in Node. They selected every challan, every
-- payment and every mark the school had ever recorded, shipped them over the
-- wire, and added them up in a loop.
--
-- That works on a demo and fails on a real school. Marks grow as
-- students x subjects x exams: a 600-pupil school with 8 subjects and 3 exams
-- a year puts 14,400 rows a year into a page that wanted six numbers. Challans
-- and payments grow at roughly 12 x students a year each. By year three the
-- dashboard is pulling six figures of rows to render a handful of tiles, and
-- PostgREST's default cap would have silently truncated it long before --
-- which is worse than slow, because the totals would simply have been wrong.
--
-- Counting belongs where the rows are. Each function below answers one
-- screen's question in one round trip and returns tens of rows instead of
-- tens of thousands.
--
-- All are SECURITY INVOKER (the default) and STABLE: they run as the caller,
-- so the ordinary tenant RLS on each table decides what is visible, exactly
-- as it would for a direct select. A user who cannot read fees still cannot
-- read fee totals.
--
-- The money rule from 010 holds here too: a challan's worth is
-- COALESCE(net_amount, total_amount, amount), and a cancelled challan is not
-- money the school is owed.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Fee totals for the whole school
-- ----------------------------------------------------------------------------
-- The four tiles on Fee Overview and the headline figures on Fee Reports.
--
-- Overdue is computed against CURRENT_DATE rather than read from status: the
-- stored status is written by a trigger when a payment lands, so a challan
-- that quietly fell past its due date overnight would still read 'open'.
CREATE OR REPLACE FUNCTION public.fee_totals(p_school uuid)
RETURNS TABLE (
  billed        numeric,
  collected     numeric,
  challans      bigint,
  paid_count    bigint,
  partial_count bigint,
  unpaid_count  bigint,
  overdue_count bigint
)
LANGUAGE sql
STABLE
AS $fn$
  WITH live AS (
    SELECT COALESCE(c.net_amount, c.total_amount, c.amount, 0) AS owed,
           COALESCE(c.paid_amount, 0)                          AS paid,
           c.due_date
      FROM public.fee_challans c
     WHERE c.school_id = p_school
       AND c.is_deleted = false
       AND c.status <> 'cancelled'
  )
  SELECT COALESCE(SUM(owed), 0),
         COALESCE(SUM(paid), 0),
         count(*),
         count(*) FILTER (WHERE owed > 0 AND paid >= owed),
         count(*) FILTER (WHERE paid > 0 AND paid < owed),
         count(*) FILTER (WHERE paid = 0),
         count(*) FILTER (
           WHERE paid < owed
             AND due_date IS NOT NULL
             AND due_date < CURRENT_DATE
         )
    FROM live;
$fn$;

GRANT EXECUTE ON FUNCTION public.fee_totals(uuid) TO authenticated;


-- ----------------------------------------------------------------------------
-- 2. Fee collection by month
-- ----------------------------------------------------------------------------
-- Counted on the date money ARRIVED, not the month it was billed for. A July
-- fee paid in September belongs to September's collection -- that is what the
-- chart is asked to show, and what an accountant means by revenue.
CREATE OR REPLACE FUNCTION public.fee_monthly_collection(p_school uuid, p_year integer)
RETURNS TABLE (
  month     smallint,
  collected numeric,
  payments  bigint
)
LANGUAGE sql
STABLE
AS $fn$
  SELECT EXTRACT(MONTH FROM p.paid_at)::smallint,
         COALESCE(SUM(p.amount_paid), 0),
         count(*)
    FROM public.fee_payments p
   WHERE p.school_id = p_school
     AND p.is_deleted = false
     AND EXTRACT(YEAR FROM p.paid_at) = p_year
   GROUP BY 1;
$fn$;

GRANT EXECUTE ON FUNCTION public.fee_monthly_collection(uuid, integer) TO authenticated;


-- ----------------------------------------------------------------------------
-- 3. Fee position per class
-- ----------------------------------------------------------------------------
-- One row per class rather than one per challan: a school has a dozen classes
-- and tens of thousands of challans.
CREATE OR REPLACE FUNCTION public.fee_class_summary(p_school uuid)
RETURNS TABLE (
  class_id      uuid,
  challans      bigint,
  billed        numeric,
  collected     numeric,
  paid_count    bigint,
  unpaid_count  bigint,
  overdue_count bigint
)
LANGUAGE sql
STABLE
AS $fn$
  WITH live AS (
    SELECT c.class_id,
           COALESCE(c.net_amount, c.total_amount, c.amount, 0) AS owed,
           COALESCE(c.paid_amount, 0)                          AS paid,
           c.due_date
      FROM public.fee_challans c
     WHERE c.school_id = p_school
       AND c.is_deleted = false
       AND c.status <> 'cancelled'
  )
  SELECT class_id,
         count(*),
         COALESCE(SUM(owed), 0),
         COALESCE(SUM(paid), 0),
         count(*) FILTER (WHERE owed > 0 AND paid >= owed),
         count(*) FILTER (WHERE paid < owed),
         count(*) FILTER (
           WHERE paid < owed
             AND due_date IS NOT NULL
             AND due_date < CURRENT_DATE
         )
    FROM live
   GROUP BY class_id;
$fn$;

GRANT EXECUTE ON FUNCTION public.fee_class_summary(uuid) TO authenticated;


-- ----------------------------------------------------------------------------
-- 4. Collection split by what the money was for
-- ----------------------------------------------------------------------------
-- Payments do not carry a fee type, so each is attributed to the type of the
-- challan it paid. The join is what makes this a database question.
CREATE OR REPLACE FUNCTION public.fee_type_collection(p_school uuid)
RETURNS TABLE (
  fee_type  text,
  collected numeric,
  payments  bigint
)
LANGUAGE sql
STABLE
AS $fn$
  SELECT COALESCE(c.fee_type, 'other'),
         COALESCE(SUM(p.amount_paid), 0),
         count(*)
    FROM public.fee_payments p
    LEFT JOIN public.fee_challans c
      ON c.id = p.challan_id
     AND c.school_id = p.school_id
   WHERE p.school_id = p_school
     AND p.is_deleted = false
   GROUP BY 1;
$fn$;

GRANT EXECUTE ON FUNCTION public.fee_type_collection(uuid) TO authenticated;


-- ----------------------------------------------------------------------------
-- 5. Students per class
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.student_class_summary(p_school uuid)
RETURNS TABLE (
  class_id uuid,
  total    bigint,
  male     bigint,
  female   bigint,
  other    bigint
)
LANGUAGE sql
STABLE
AS $fn$
  SELECT s.current_class_id,
         count(*),
         count(*) FILTER (WHERE s.gender = 'male'),
         count(*) FILTER (WHERE s.gender = 'female'),
         count(*) FILTER (WHERE s.gender IS DISTINCT FROM 'male'
                            AND s.gender IS DISTINCT FROM 'female')
    FROM public.students s
   WHERE s.school_id = p_school
     AND s.is_deleted = false
     AND s.status = 'active'
   GROUP BY s.current_class_id;
$fn$;

GRANT EXECUTE ON FUNCTION public.student_class_summary(uuid) TO authenticated;


-- ----------------------------------------------------------------------------
-- 6. Exam marks, in aggregate
-- ----------------------------------------------------------------------------
-- The fastest-growing table in the schema, and the one the Reports screen was
-- pulling whole. p_pass is the school's configured pass mark, so a school
-- passing at 40 does not get a pass rate computed at 33.
--
-- Rows with no max_marks are excluded rather than counted as zero: an unmarked
-- paper is not a fail.
CREATE OR REPLACE FUNCTION public.exam_mark_summary(p_school uuid, p_pass numeric DEFAULT 33)
RETURNS TABLE (
  recorded    bigint,
  scored      bigint,
  avg_percent numeric,
  pass_count  bigint
)
LANGUAGE sql
STABLE
AS $fn$
  WITH scored AS (
    SELECT (m.marks_obtained / m.max_marks) * 100 AS pct
      FROM public.marks m
     WHERE m.school_id = p_school
       AND m.is_deleted = false
       AND m.max_marks > 0
       AND m.marks_obtained IS NOT NULL
  )
  SELECT (SELECT count(*) FROM public.marks
           WHERE school_id = p_school AND is_deleted = false),
         count(*),
         COALESCE(ROUND(AVG(pct)::numeric, 1), 0),
         count(*) FILTER (WHERE pct >= p_pass)
    FROM scored;
$fn$;

GRANT EXECUTE ON FUNCTION public.exam_mark_summary(uuid, numeric) TO authenticated;


-- ----------------------------------------------------------------------------
-- 7. Grade distribution
-- ----------------------------------------------------------------------------
-- The ladder is duplicated from lib/exam-options.js on purpose: the app grades
-- one result at a time for display, and this grades a hundred thousand at once
-- for a chart. Keep the thresholds in step if either changes.
CREATE OR REPLACE FUNCTION public.exam_grade_distribution(p_school uuid, p_pass numeric DEFAULT 33)
RETURNS TABLE (
  grade text,
  count bigint
)
LANGUAGE sql
STABLE
AS $fn$
  WITH scored AS (
    SELECT (m.marks_obtained / m.max_marks) * 100 AS pct
      FROM public.marks m
     WHERE m.school_id = p_school
       AND m.is_deleted = false
       AND m.max_marks > 0
       AND m.marks_obtained IS NOT NULL
  ), graded AS (
    SELECT CASE
             WHEN pct < p_pass THEN 'F'
             WHEN pct >= 80    THEN 'A+'
             WHEN pct >= 70    THEN 'A'
             WHEN pct >= 60    THEN 'B'
             WHEN pct >= 50    THEN 'C'
             WHEN pct >= 33    THEN 'D'
             ELSE 'F'
           END AS g
      FROM scored
  )
  SELECT g, count(*) FROM graded GROUP BY g;
$fn$;

GRANT EXECUTE ON FUNCTION public.exam_grade_distribution(uuid, numeric) TO authenticated;


-- ----------------------------------------------------------------------------
-- 8. One day's attendance, per class
-- ----------------------------------------------------------------------------
-- 007 already has attendance_daily_summary for a date RANGE. This is the
-- single-day case the Reports overview asks for, kept separate so the common
-- call does not pay for a range scan.
CREATE OR REPLACE FUNCTION public.attendance_day_by_class(p_school uuid, p_date date)
RETURNS TABLE (
  class_id uuid,
  present  bigint,
  absent   bigint,
  total    bigint
)
LANGUAGE sql
STABLE
AS $fn$
  SELECT a.class_id,
         count(*) FILTER (WHERE a.status <> 'absent'),
         count(*) FILTER (WHERE a.status =  'absent'),
         count(*)
    FROM public.attendance a
   WHERE a.school_id = p_school
     AND a.is_deleted = false
     AND a.date = p_date
   GROUP BY a.class_id;
$fn$;

GRANT EXECUTE ON FUNCTION public.attendance_day_by_class(uuid, date) TO authenticated;


-- ----------------------------------------------------------------------------
-- 9. Indexes the above lean on
-- ----------------------------------------------------------------------------
-- Without these every one of these functions is a sequential scan, which
-- defeats the point of moving the work into the database.
CREATE INDEX IF NOT EXISTS idx_fee_payments_year
  ON public.fee_payments (school_id, paid_at) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_marks_school_live
  ON public.marks (school_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_students_class_active
  ON public.students (school_id, current_class_id) WHERE is_deleted = false AND status = 'active';


DO $report$
BEGIN
  RAISE NOTICE '----------------------------------------------------------';
  RAISE NOTICE 'Report functions installed.';
  RAISE NOTICE '  Dashboards now aggregate in SQL instead of in the app.';
  RAISE NOTICE '----------------------------------------------------------';
END
$report$;
