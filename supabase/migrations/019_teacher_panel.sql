-- ============================================================================
-- 019_TEACHER_PANEL.sql -- run after 018_teacher_scope.sql
-- ============================================================================
-- Paste the whole file into the SQL editor and Run. Idempotent.
--
-- 017 decided WHAT a teacher may touch. This answers the question the teacher
-- panel actually asks on every screen: what is mine, with names on it.
--
-- The panel could in principle work these out client-side -- read sections,
-- read section_subjects, read the timetable, intersect. Three round trips and
-- a join in JavaScript, repeated on every page, to re-derive something the
-- database already knows. These return it in one call with the names
-- attached, which is what the screens need to render.
--
-- All TABLE-returning on purpose. A SETOF scalar comes back from PostgREST as
-- a bare array whose shape depends on the client version; a table function is
-- always an array of objects with named keys, which is what the pages destructure.
--
-- SECURITY DEFINER for the same reason as 017's helpers: they read the
-- teaching tables to work out what is yours, and a teacher does not
-- necessarily hold read permission on all of them. Every one is pinned to
-- current_school_id() and current_staff_id() internally and takes no
-- parameter that could widen the answer.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. My sections
-- ----------------------------------------------------------------------------
-- One row per section I teach, with the names and the head count the register
-- screen needs. is_class_teacher matters: a class teacher owns the whole
-- register, a subject teacher is only there for their period.
CREATE OR REPLACE FUNCTION public.my_sections()
RETURNS TABLE (
  section_id       uuid,
  section_name     text,
  class_id         uuid,
  class_name       text,
  is_class_teacher boolean,
  student_count    bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public
AS $fn$
  SELECT sec.id,
         sec.name,
         cls.id,
         COALESCE(gl.name, cls.name),
         sec.class_teacher_id = public.current_staff_id(),
         count(st.id)
    FROM public.sections sec
    JOIN public.classes cls ON cls.id = sec.class_id AND cls.is_deleted = false
    LEFT JOIN public.grade_levels gl ON gl.id = cls.grade_level_id
    LEFT JOIN public.students st
      ON st.current_section_id = sec.id
     AND st.is_deleted = false
     AND st.status = 'active'
   WHERE sec.school_id = public.current_school_id()
     AND sec.is_deleted = false
     AND sec.id IN (SELECT public.my_taught_sections())
   GROUP BY sec.id, sec.name, cls.id, gl.name, cls.name, sec.class_teacher_id
   ORDER BY COALESCE(gl.name, cls.name), sec.name;
$fn$;

GRANT EXECUTE ON FUNCTION public.my_sections() TO authenticated;


-- ----------------------------------------------------------------------------
-- 2. My subjects, per section
-- ----------------------------------------------------------------------------
-- The marks screen needs the SUBJECT dimension, which the register does not.
-- A class teacher takes the whole register but only marks their own papers,
-- so this list is narrower than my_sections() by design.
CREATE OR REPLACE FUNCTION public.my_subjects()
RETURNS TABLE (
  section_id   uuid,
  section_name text,
  class_id     uuid,
  class_name   text,
  subject_id   uuid,
  subject_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public
AS $fn$
  WITH me AS (SELECT public.current_staff_id() AS staff_id,
                     public.current_school_id() AS school_id),
  pairs AS (
    SELECT ss.section_id, ss.subject_id
      FROM public.section_subjects ss, me
     WHERE ss.school_id = me.school_id AND ss.teacher_id = me.staff_id
       AND ss.is_deleted = false AND me.staff_id IS NOT NULL

    UNION

    SELECT te.section_id, te.subject_id
      FROM public.timetable_entries te, me
     WHERE te.school_id = me.school_id AND te.teacher_id = me.staff_id
       AND te.is_deleted = false AND te.subject_id IS NOT NULL
       AND me.staff_id IS NOT NULL

    UNION

    SELECT sec.id, cs.subject_id
      FROM public.class_subjects cs
      JOIN public.sections sec ON sec.class_id = cs.class_id AND sec.is_deleted = false,
           me
     WHERE cs.school_id = me.school_id AND cs.teacher_id = me.staff_id
       AND cs.is_deleted = false AND me.staff_id IS NOT NULL
  )
  SELECT p.section_id,
         sec.name,
         cls.id,
         COALESCE(gl.name, cls.name),
         p.subject_id,
         sub.name
    FROM pairs p
    JOIN public.sections sec ON sec.id = p.section_id AND sec.is_deleted = false
    JOIN public.classes cls  ON cls.id = sec.class_id AND cls.is_deleted = false
    LEFT JOIN public.grade_levels gl ON gl.id = cls.grade_level_id
    JOIN public.subjects sub ON sub.id = p.subject_id AND sub.is_deleted = false
   ORDER BY COALESCE(gl.name, cls.name), sec.name, sub.name;
$fn$;

GRANT EXECUTE ON FUNCTION public.my_subjects() TO authenticated;


-- ----------------------------------------------------------------------------
-- 3. My timetable
-- ----------------------------------------------------------------------------
-- p_day NULL returns the whole week, which is the weekly grid; a day number
-- returns one column, which is the dashboard. One function rather than two so
-- the two screens cannot disagree about what a period is.
--
-- Scoped on timetable_entries.teacher_id only -- deliberately NOT on
-- my_taught_sections(). A class teacher should see the periods they actually
-- teach, not every period their section sits through with other staff.
CREATE OR REPLACE FUNCTION public.my_timetable(p_day smallint DEFAULT NULL)
RETURNS TABLE (
  entry_id     uuid,
  day_of_week  smallint,
  period_id    uuid,
  period_name  text,
  start_time   time,
  end_time     time,
  sort_order   smallint,
  section_id   uuid,
  section_name text,
  class_id     uuid,
  class_name   text,
  subject_id   uuid,
  subject_name text,
  room_number  text
)
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public
AS $fn$
  SELECT te.id,
         per.day_of_week,
         per.id,
         per.name,
         per.start_time,
         per.end_time,
         per.sort_order,
         sec.id,
         sec.name,
         cls.id,
         COALESCE(gl.name, cls.name),
         sub.id,
         sub.name,
         te.room_number
    FROM public.timetable_entries te
    JOIN public.periods per ON per.id = te.period_id AND per.is_deleted = false
    JOIN public.sections sec ON sec.id = te.section_id AND sec.is_deleted = false
    JOIN public.classes cls  ON cls.id = sec.class_id AND cls.is_deleted = false
    LEFT JOIN public.grade_levels gl ON gl.id = cls.grade_level_id
    LEFT JOIN public.subjects sub ON sub.id = te.subject_id AND sub.is_deleted = false
   WHERE te.school_id = public.current_school_id()
     AND te.is_deleted = false
     AND te.teacher_id = public.current_staff_id()
     AND public.current_staff_id() IS NOT NULL
     AND (p_day IS NULL OR per.day_of_week = p_day)
   ORDER BY per.day_of_week, per.sort_order;
$fn$;

GRANT EXECUTE ON FUNCTION public.my_timetable(smallint) TO authenticated;


-- ----------------------------------------------------------------------------
-- 4. Which of my sections still need a register today
-- ----------------------------------------------------------------------------
-- The one question the dashboard exists to answer. Counting marked rows
-- here rather than in the page keeps it to a single call, and means an
-- unmarked section cannot hide behind a half-filled register.
CREATE OR REPLACE FUNCTION public.my_register_status(p_date date)
RETURNS TABLE (
  section_id    uuid,
  section_name  text,
  class_name    text,
  student_count bigint,
  marked_count  bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public
AS $fn$
  SELECT sec.id,
         sec.name,
         COALESCE(gl.name, cls.name),
         count(DISTINCT st.id),
         count(DISTINCT a.student_id)
    FROM public.sections sec
    JOIN public.classes cls ON cls.id = sec.class_id AND cls.is_deleted = false
    LEFT JOIN public.grade_levels gl ON gl.id = cls.grade_level_id
    LEFT JOIN public.students st
      ON st.current_section_id = sec.id
     AND st.is_deleted = false
     AND st.status = 'active'
    LEFT JOIN public.attendance a
      ON a.section_id = sec.id
     AND a.date = p_date
     AND a.is_deleted = false
   WHERE sec.school_id = public.current_school_id()
     AND sec.is_deleted = false
     AND sec.id IN (SELECT public.my_taught_sections())
   GROUP BY sec.id, sec.name, gl.name, cls.name
   ORDER BY COALESCE(gl.name, cls.name), sec.name;
$fn$;

GRANT EXECUTE ON FUNCTION public.my_register_status(date) TO authenticated;


DO $report$
BEGIN
  RAISE NOTICE '----------------------------------------------------------';
  RAISE NOTICE 'Teacher panel helpers installed.';
  RAISE NOTICE '  my_sections(), my_subjects(), my_timetable(day),';
  RAISE NOTICE '  my_register_status(date)';
  RAISE NOTICE '  The panel lives at /teacher.';
  RAISE NOTICE '----------------------------------------------------------';
END
$report$;
