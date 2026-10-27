-- ============================================================================
-- 030_ADMISSIONS.sql -- run after 029_student_left_on.sql
-- ============================================================================
-- Paste the whole file into the SQL editor and Run. Idempotent.
--
-- WHAT THIS IS FOR
--
-- The Admissions module was sold, enabled, and never built: the sidebar entry
-- has sat there dimmed with `built: false` against an empty table. This gives
-- it the shape the screen needs.
--
-- ONE RECORD, FIVE STATES
--
--     applied -> review -> accepted -> enrolled
--                      \-> rejected
--
-- An application is a person who wants a place. It carries enough of them to
-- decide, and nothing more: the full student record is written when they are
-- enrolled, not before. Half a student row sitting in the students table
-- because somebody started an application is how a school ends up unable to
-- answer "how many pupils do we have".
--
-- `enrolled` is the only state that creates a student, and student_id is how
-- an application and the pupil it became stay joined afterwards.
--
-- WHY admission_inquiries RATHER THAN A NEW TABLE
--
-- It already existed, carried the right half of the columns, had its RLS and
-- its audit trigger, and held zero rows. A second table beside it would have
-- meant two places to look for the same question.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. The columns an application needs
-- ----------------------------------------------------------------------------
-- Everything is nullable except what the pipeline itself turns on. An
-- application arrives half-finished by nature -- somebody rings up with a
-- name and a class in mind -- and a form that refuses to save until every
-- box is filled just moves the record into somebody's notebook.
ALTER TABLE public.admission_inquiries
  ADD COLUMN IF NOT EXISTS application_no  text,
  ADD COLUMN IF NOT EXISTS father_name     text,
  ADD COLUMN IF NOT EXISTS date_of_birth   date,
  ADD COLUMN IF NOT EXISTS gender          public.gender,
  ADD COLUMN IF NOT EXISTS previous_school text,
  ADD COLUMN IF NOT EXISTS address         text,
  ADD COLUMN IF NOT EXISTS session_id      uuid REFERENCES public.sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS section_id      uuid REFERENCES public.sections(id) ON DELETE SET NULL,
  -- The pupil this application became. SET NULL rather than CASCADE: deleting
  -- a student should not erase the record of how they were admitted.
  ADD COLUMN IF NOT EXISTS student_id      uuid REFERENCES public.students(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS decided_on      timestamptz,
  ADD COLUMN IF NOT EXISTS decided_by      uuid,
  ADD COLUMN IF NOT EXISTS decision_note   text;

-- A human handle for a record people discuss on the phone. Unique per school,
-- and only where one has been issued.
CREATE UNIQUE INDEX IF NOT EXISTS admission_inquiries_no_key
  ON public.admission_inquiries (school_id, application_no)
  WHERE application_no IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_admission_inquiries_status
  ON public.admission_inquiries (school_id, status, inquiry_date DESC);


-- ----------------------------------------------------------------------------
-- 2. The five states, and nothing else
-- ----------------------------------------------------------------------------
-- The column arrived with a free-text default of 'open', which is a sixth
-- state that means whichever of the five the reader assumes. Existing rows
-- are mapped before the constraint is stated, in that order, for the reason
-- 026 learned the hard way: a CHECK added over data that does not satisfy it
-- fails the whole migration on its own contents.
UPDATE public.admission_inquiries
   SET status = CASE lower(coalesce(status, ''))
                  WHEN 'open'     THEN 'applied'
                  WHEN 'new'      THEN 'applied'
                  WHEN 'pending'  THEN 'review'
                  WHEN 'closed'   THEN 'rejected'
                  WHEN ''         THEN 'applied'
                  ELSE lower(status)
                END
 WHERE status IS NULL
    OR lower(status) NOT IN ('applied', 'review', 'accepted', 'rejected', 'enrolled');

-- Anything still unrecognised is from a shape nobody remembers; it becomes a
-- new application rather than blocking the file.
UPDATE public.admission_inquiries
   SET status = 'applied'
 WHERE status NOT IN ('applied', 'review', 'accepted', 'rejected', 'enrolled');

ALTER TABLE public.admission_inquiries ALTER COLUMN status SET DEFAULT 'applied';
ALTER TABLE public.admission_inquiries ALTER COLUMN status SET NOT NULL;

ALTER TABLE public.admission_inquiries
  DROP CONSTRAINT IF EXISTS admission_inquiries_status_check;
ALTER TABLE public.admission_inquiries
  ADD CONSTRAINT admission_inquiries_status_check
  CHECK (status IN ('applied', 'review', 'accepted', 'rejected', 'enrolled'));

-- Enrolled means there is a pupil. Anything else means there is not: an
-- application cannot quietly claim a student it never created.
ALTER TABLE public.admission_inquiries
  DROP CONSTRAINT IF EXISTS admission_inquiries_enrolled_check;
ALTER TABLE public.admission_inquiries
  ADD CONSTRAINT admission_inquiries_enrolled_check
  CHECK ((status = 'enrolled') = (student_id IS NOT NULL));


-- ----------------------------------------------------------------------------
-- 3. The next application number
-- ----------------------------------------------------------------------------
-- Per school, per year: APP-2026-0001. Issued by the screen when an
-- application is taken, so the number people quote on the phone exists from
-- the first minute rather than appearing at acceptance.
CREATE OR REPLACE FUNCTION public.next_application_no()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, auth
AS $fn$
DECLARE
  v_school uuid := public.current_school_id();
  v_year   text := to_char(now(), 'YYYY');
  v_next   integer;
BEGIN
  IF v_school IS NULL THEN
    RAISE EXCEPTION 'No active school.';
  END IF;

  -- The highest number already issued this year, read from the text rather
  -- than kept in a counter: a counter and a table disagree the first time a
  -- row is deleted by hand.
  SELECT coalesce(max(substring(application_no from '\d+$')::integer), 0) + 1
    INTO v_next
    FROM public.admission_inquiries
   WHERE school_id = v_school
     AND application_no LIKE 'APP-' || v_year || '-%';

  RETURN format('APP-%s-%s', v_year, lpad(v_next::text, 4, '0'));
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.next_application_no() TO authenticated;


-- ----------------------------------------------------------------------------
-- 4. Readable and writable by the Admissions switches
-- ----------------------------------------------------------------------------
-- apply_tenant_rls is idempotent and skips policies that already exist, so
-- this is here for a database where the table never got its policy set.
SELECT public.apply_tenant_rls('admission_inquiries', 'admissions.read', 'admissions.write');

-- 026 pointed every standard DELETE policy at `<module>.delete`. A policy
-- created before that, or by this call just now, still asks for `.write`.
DO $del$
DECLARE
  v_qual text;
BEGIN
  SELECT pg_get_expr(pol.polqual, pol.polrelid) INTO v_qual
    FROM pg_policy pol
    JOIN pg_class cls ON cls.oid = pol.polrelid
   WHERE cls.relname = 'admission_inquiries' AND pol.polname = 'admission_inquiries_delete';

  IF v_qual IS NOT NULL AND v_qual LIKE '%admissions.write%' THEN
    DROP POLICY admission_inquiries_delete ON public.admission_inquiries;
    CREATE POLICY admission_inquiries_delete ON public.admission_inquiries
      FOR DELETE TO authenticated
      USING (school_id = public.current_school_id()
             AND public.has_permission('admissions.delete'));
    RAISE NOTICE 'admission_inquiries delete policy now asks for admissions.delete';
  END IF;
END
$del$;


-- ============================================================================
-- 5. RESULT
-- ============================================================================
SELECT status, count(*) AS applications
  FROM public.admission_inquiries
 WHERE is_deleted = false
 GROUP BY status
 ORDER BY status;
