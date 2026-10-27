-- ============================================================================
-- 033_DASHBOARD.sql -- run after 032_documents.sql
-- ============================================================================
-- Paste the whole file into the SQL editor and Run. Idempotent.
--
-- WHAT THIS IS FOR
--
-- The school dashboard used to show four counts -- classes, sections,
-- subjects, users -- and a list of the modules the school had bought. None of
-- that changes between Monday and Friday, so the first screen everybody lands
-- on told them nothing about the day they had just walked into.
--
-- What an office actually wants at 9am is today: what came in at the fee
-- counter, who is in the building, who is not, and what is waiting. That is
-- eight numbers over six tables, and one round trip is the right price for
-- them.
--
-- WHY THE DAY IS PASSED IN RATHER THAN READ FROM CURRENT_DATE
--
-- The server runs in UTC and the school does not. CURRENT_DATE here would
-- hand a school in Asia/Karachi yesterday's takings until 5am, and every
-- timestamp comparison would be off by the same five hours. The caller knows
-- the school's configured zone, so it resolves the day boundary and passes
-- the answer: p_day for the date columns, p_from/p_to for the timestamps.
--
-- WHY THERE IS NO SECURITY DEFINER ON IT
--
-- Deliberate, and it is what makes one function safe for a screen whose
-- blocks are gated separately. Running as the caller means every count below
-- is taken through that person's own RLS: a clerk with fees.read and nothing
-- else sums their receipts and gets zero for the registers, because the rows
-- are not theirs to see. The permission check is the one already written on
-- each table, not a second one copied in here that could drift away from it.
-- ============================================================================


CREATE OR REPLACE FUNCTION public.dashboard_today(
  p_school uuid,
  p_day    date,
  p_from   timestamptz,
  p_to     timestamptz
)
RETURNS TABLE (
  -- The fee counter. `fee_cash` is split out because it is the number that
  -- has to match the drawer at closing time; everything banked, transferred
  -- or taken on a card is the other half.
  fee_collected  numeric,
  fee_receipts   bigint,
  fee_cash       numeric,
  -- Money out, so the dashboard can show a net for the day rather than a
  -- takings figure that flatters it.
  expense_total  numeric,
  expense_count  bigint,
  -- The student register. `marked` is how many pupils were called at all --
  -- without it a quiet morning and an unmarked one look identical.
  present        bigint,
  absent         bigint,
  late           bigint,
  excused        bigint,
  marked         bigint,
  -- The staff register, same shape, one column fewer.
  staff_present  bigint,
  staff_absent   bigint,
  staff_marked   bigint,
  -- Signed in and not yet signed out: who is in the building right now, which
  -- is a safety question rather than a statistic.
  visitors_in    bigint,
  admissions_new bigint
)
LANGUAGE sql
STABLE
AS $fn$
  SELECT
    (SELECT COALESCE(SUM(p.amount_paid), 0)
       FROM public.fee_payments p
      WHERE p.school_id = p_school AND p.is_deleted = false
        AND p.paid_at >= p_from AND p.paid_at < p_to),
    (SELECT count(*)
       FROM public.fee_payments p
      WHERE p.school_id = p_school AND p.is_deleted = false
        AND p.paid_at >= p_from AND p.paid_at < p_to),
    (SELECT COALESCE(SUM(p.amount_paid), 0)
       FROM public.fee_payments p
      WHERE p.school_id = p_school AND p.is_deleted = false
        AND p.method = 'cash'
        AND p.paid_at >= p_from AND p.paid_at < p_to),

    (SELECT COALESCE(SUM(e.amount), 0)
       FROM public.expenses e
      WHERE e.school_id = p_school AND e.is_deleted = false
        AND e.expense_date = p_day),
    (SELECT count(*)
       FROM public.expenses e
      WHERE e.school_id = p_school AND e.is_deleted = false
        AND e.expense_date = p_day),

    (SELECT count(*) FILTER (WHERE a.status = 'present')
       FROM public.attendance a
      WHERE a.school_id = p_school AND a.is_deleted = false AND a.date = p_day),
    (SELECT count(*) FILTER (WHERE a.status = 'absent')
       FROM public.attendance a
      WHERE a.school_id = p_school AND a.is_deleted = false AND a.date = p_day),
    (SELECT count(*) FILTER (WHERE a.status = 'late')
       FROM public.attendance a
      WHERE a.school_id = p_school AND a.is_deleted = false AND a.date = p_day),
    (SELECT count(*) FILTER (WHERE a.status = 'excused')
       FROM public.attendance a
      WHERE a.school_id = p_school AND a.is_deleted = false AND a.date = p_day),
    (SELECT count(*)
       FROM public.attendance a
      WHERE a.school_id = p_school AND a.is_deleted = false AND a.date = p_day),

    (SELECT count(*) FILTER (WHERE s.status IN ('present', 'late'))
       FROM public.staff_attendance s
      WHERE s.school_id = p_school AND s.is_deleted = false AND s.date = p_day),
    (SELECT count(*) FILTER (WHERE s.status = 'absent')
       FROM public.staff_attendance s
      WHERE s.school_id = p_school AND s.is_deleted = false AND s.date = p_day),
    (SELECT count(*)
       FROM public.staff_attendance s
      WHERE s.school_id = p_school AND s.is_deleted = false AND s.date = p_day),

    (SELECT count(*)
       FROM public.visitors v
      WHERE v.school_id = p_school AND v.is_deleted = false
        AND v.in_time >= p_from AND v.in_time < p_to
        AND v.out_time IS NULL),

    (SELECT count(*)
       FROM public.admission_inquiries i
      WHERE i.school_id = p_school AND i.is_deleted = false
        AND i.inquiry_date = p_day);
$fn$;

GRANT EXECUTE ON FUNCTION public.dashboard_today(uuid, date, timestamptz, timestamptz)
  TO authenticated;


-- ----------------------------------------------------------------------------
-- The indexes the day's counts lean on
-- ----------------------------------------------------------------------------
-- Each of the above is a single-day slice. Without an index on (school, date)
-- every one of them reads the whole table, which is exactly the cost the
-- function was written to avoid.
CREATE INDEX IF NOT EXISTS idx_attendance_school_date
  ON public.attendance (school_id, date) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_staff_attendance_school_date
  ON public.staff_attendance (school_id, date) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_expenses_school_date
  ON public.expenses (school_id, expense_date) WHERE is_deleted = false;


DO $report$
BEGIN
  RAISE NOTICE '----------------------------------------------------------';
  RAISE NOTICE 'dashboard_today() installed.';
  RAISE NOTICE '  The school dashboard now reads one row for the whole day.';
  RAISE NOTICE '----------------------------------------------------------';
END
$report$;
