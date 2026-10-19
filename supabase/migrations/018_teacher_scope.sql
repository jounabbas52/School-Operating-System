-- ============================================================================
-- 018_TEACHER_SCOPE.sql -- run after 017_biometric_attendance.sql
-- ============================================================================
-- Paste the whole file into the SQL editor and Run. Idempotent.
--
-- WHY THIS EXISTS
--
-- Until now every permission has been school-wide. apply_tenant_rls() builds
-- policies that say "school_id = current_school_id() AND has_permission(x)",
-- so the moment a teacher is granted attendance.read they can read the
-- attendance of every child in the school, and exams.read hands them every
-- mark ever entered.
--
-- That was fine while the only people with logins were office staff who are
-- supposed to see everything. It stops being fine the instant a teacher gets
-- an account, which is the next thing to build. A teacher panel on top of
-- today's policies would be one of two things: insecure, because changing an
-- id in a URL returns another class's marks; or a lie, because the filtering
-- happens in a page the database does not enforce.
--
-- This file adds the missing dimension. It is deliberately the step BEFORE
-- the teacher panel, because a boundary retrofitted after people are already
-- using a screen is a boundary nobody trusts.
--
-- THE APPROACH: ADDITIVE, NOT A REWRITE
--
-- Every existing permission keeps its exact meaning. attendance.read still
-- means "all attendance in the school", and every role that holds it today is
-- untouched. What is new is a NARROWER sibling:
--
--     attendance.read        ->  every student in the school   (office)
--     attendance.read.own    ->  only my own sections          (teacher)
--
-- A policy passes if EITHER is satisfied, so the two compose: a head of
-- department who holds both simply gets the wider one. Nothing is taken away
-- from anybody, which is what makes this safe to run on a live school.
--
-- has_permission() splits a code on its FIRST dot to find the module, so
-- 'attendance.read.own' is still gated by the attendance module exactly as
-- its parent is. The suffix is invisible to the module gate.
--
-- WHAT COUNTS AS "MINE"
--
--   section_subjects.teacher_id   subject X in section Y   (most precise)
--   timetable_entries.teacher_id  subject X in section Y   (from the schedule)
--   class_subjects.teacher_id     subject X in every section of class Z
--   sections.class_teacher_id     class teacher: the whole section
--
-- All four are unioned. A school that fills in only one of them still works,
-- which matters because most fill in the timetable and nothing else.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Who am I, as a member of staff
-- ----------------------------------------------------------------------------
-- SECURITY DEFINER throughout this file, for one specific reason: these
-- functions are called FROM policies. A plain query inside a policy would
-- re-enter that table's own RLS and recurse. Reading the teaching tables with
-- the definer's rights breaks the cycle -- and is safe because every one of
-- them is pinned to current_school_id() and auth.uid() internally. None of
-- them takes a parameter that could widen what it returns.
CREATE OR REPLACE FUNCTION public.current_staff_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public
AS $fn$
  SELECT s.id
    FROM public.staff s
   WHERE s.profile_id = auth.uid()
     AND s.school_id = public.current_school_id()
     AND s.is_deleted = false
   LIMIT 1;
$fn$;

GRANT EXECUTE ON FUNCTION public.current_staff_id() TO authenticated;


-- ----------------------------------------------------------------------------
-- 2. The sections I teach
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.my_taught_sections()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public
AS $fn$
  WITH me AS (SELECT public.current_staff_id() AS staff_id,
                     public.current_school_id() AS school_id)
  -- Class teacher: the whole section, every subject.
  SELECT sec.id
    FROM public.sections sec, me
   WHERE sec.school_id = me.school_id
     AND sec.class_teacher_id = me.staff_id
     AND sec.is_deleted = false
     AND me.staff_id IS NOT NULL

  UNION

  -- Subject teacher, assigned per section.
  SELECT ss.section_id
    FROM public.section_subjects ss, me
   WHERE ss.school_id = me.school_id
     AND ss.teacher_id = me.staff_id
     AND ss.is_deleted = false
     AND me.staff_id IS NOT NULL

  UNION

  -- Subject teacher, as the timetable has them.
  SELECT te.section_id
    FROM public.timetable_entries te, me
   WHERE te.school_id = me.school_id
     AND te.teacher_id = me.staff_id
     AND te.is_deleted = false
     AND me.staff_id IS NOT NULL

  UNION

  -- Subject teacher assigned at class level: every section of that class.
  SELECT sec.id
    FROM public.class_subjects cs
    JOIN public.sections sec ON sec.class_id = cs.class_id AND sec.is_deleted = false,
         me
   WHERE cs.school_id = me.school_id
     AND cs.teacher_id = me.staff_id
     AND cs.is_deleted = false
     AND me.staff_id IS NOT NULL;
$fn$;

GRANT EXECUTE ON FUNCTION public.my_taught_sections() TO authenticated;


-- ----------------------------------------------------------------------------
-- 3. The students in those sections
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.my_students()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public
AS $fn$
  SELECT s.id
    FROM public.students s
   WHERE s.school_id = public.current_school_id()
     AND s.is_deleted = false
     AND s.current_section_id IN (SELECT public.my_taught_sections());
$fn$;

GRANT EXECUTE ON FUNCTION public.my_students() TO authenticated;


-- ----------------------------------------------------------------------------
-- 4. Which student/subject pairs are mine to mark
-- ----------------------------------------------------------------------------
-- A class teacher may take the register for their whole section, but that
-- does not make them the Physics marker. Marks are scoped per SUBJECT, which
-- is a narrower question than attendance and needs its own answer.
CREATE OR REPLACE FUNCTION public.my_student_subjects()
RETURNS TABLE (student_id uuid, subject_id uuid)
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
  SELECT st.id, p.subject_id
    FROM pairs p
    JOIN public.students st
      ON st.current_section_id = p.section_id
     AND st.school_id = public.current_school_id()
     AND st.is_deleted = false;
$fn$;

GRANT EXECUTE ON FUNCTION public.my_student_subjects() TO authenticated;


-- ----------------------------------------------------------------------------
-- 5. Widen the policies
-- ----------------------------------------------------------------------------
-- Each table's policy becomes "the wide permission OR the scoped one". The
-- originals are dropped and rebuilt rather than added to, because a second
-- PERMISSIVE policy would be OR'd in anyway and two half-stated rules are
-- harder to read than one whole one.

/* ------------------------------------------------------------- students */
DROP POLICY IF EXISTS students_select ON public.students;
CREATE POLICY students_select ON public.students FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR (school_id = public.current_school_id() AND public.has_permission('students.read'))
    OR (school_id = public.current_school_id()
        AND public.has_permission('students.read.own')
        AND id IN (SELECT public.my_students()))
  );

/* ----------------------------------------------------------- attendance */
DROP POLICY IF EXISTS attendance_select ON public.attendance;
CREATE POLICY attendance_select ON public.attendance FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR (school_id = public.current_school_id() AND public.has_permission('attendance.read'))
    OR (school_id = public.current_school_id()
        AND public.has_permission('attendance.read.own')
        AND section_id IN (SELECT public.my_taught_sections()))
  );

DROP POLICY IF EXISTS attendance_insert ON public.attendance;
CREATE POLICY attendance_insert ON public.attendance FOR INSERT TO authenticated
  WITH CHECK (
    school_id = public.current_school_id()
    AND (
      public.has_permission('attendance.write')
      OR (public.has_permission('attendance.write.own')
          AND section_id IN (SELECT public.my_taught_sections()))
    )
  );

DROP POLICY IF EXISTS attendance_update ON public.attendance;
CREATE POLICY attendance_update ON public.attendance FOR UPDATE TO authenticated
  USING (
    school_id = public.current_school_id()
    AND (
      public.has_permission('attendance.write')
      OR (public.has_permission('attendance.write.own')
          AND section_id IN (SELECT public.my_taught_sections()))
    )
  )
  -- Both halves are needed: USING decides which rows may be touched, WITH
  -- CHECK decides what they may become. Without the second, a teacher could
  -- move a row into a section that is not theirs.
  WITH CHECK (
    school_id = public.current_school_id()
    AND (
      public.has_permission('attendance.write')
      OR (public.has_permission('attendance.write.own')
          AND section_id IN (SELECT public.my_taught_sections()))
    )
  );

/* ---------------------------------------------------------------- marks */
DROP POLICY IF EXISTS marks_select ON public.marks;
CREATE POLICY marks_select ON public.marks FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR (school_id = public.current_school_id() AND public.has_permission('exams.read'))
    OR (school_id = public.current_school_id()
        AND public.has_permission('exams.read.own')
        AND (student_id, subject_id) IN (SELECT student_id, subject_id FROM public.my_student_subjects()))
  );

DROP POLICY IF EXISTS marks_insert ON public.marks;
CREATE POLICY marks_insert ON public.marks FOR INSERT TO authenticated
  WITH CHECK (
    school_id = public.current_school_id()
    AND (
      public.has_permission('exams.write')
      OR (public.has_permission('exams.write.own')
          AND (student_id, subject_id) IN (SELECT student_id, subject_id FROM public.my_student_subjects()))
    )
  );

DROP POLICY IF EXISTS marks_update ON public.marks;
CREATE POLICY marks_update ON public.marks FOR UPDATE TO authenticated
  USING (
    school_id = public.current_school_id()
    AND (
      public.has_permission('exams.write')
      OR (public.has_permission('exams.write.own')
          AND (student_id, subject_id) IN (SELECT student_id, subject_id FROM public.my_student_subjects()))
    )
  )
  WITH CHECK (
    school_id = public.current_school_id()
    AND (
      public.has_permission('exams.write')
      OR (public.has_permission('exams.write.own')
          AND (student_id, subject_id) IN (SELECT student_id, subject_id FROM public.my_student_subjects()))
    )
  );

/* ----------------------------------------------------------- test_marks */
DROP POLICY IF EXISTS test_marks_select ON public.test_marks;
CREATE POLICY test_marks_select ON public.test_marks FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR (school_id = public.current_school_id() AND public.has_permission('tests.read'))
    OR (school_id = public.current_school_id()
        AND public.has_permission('tests.read.own')
        AND student_id IN (SELECT public.my_students()))
  );

DROP POLICY IF EXISTS test_marks_insert ON public.test_marks;
CREATE POLICY test_marks_insert ON public.test_marks FOR INSERT TO authenticated
  WITH CHECK (
    school_id = public.current_school_id()
    AND (
      public.has_permission('tests.write')
      OR (public.has_permission('tests.write.own')
          AND student_id IN (SELECT public.my_students()))
    )
  );

DROP POLICY IF EXISTS test_marks_update ON public.test_marks;
CREATE POLICY test_marks_update ON public.test_marks FOR UPDATE TO authenticated
  USING (
    school_id = public.current_school_id()
    AND (
      public.has_permission('tests.write')
      OR (public.has_permission('tests.write.own')
          AND student_id IN (SELECT public.my_students()))
    )
  )
  WITH CHECK (
    school_id = public.current_school_id()
    AND (
      public.has_permission('tests.write')
      OR (public.has_permission('tests.write.own')
          AND student_id IN (SELECT public.my_students()))
    )
  );


-- ----------------------------------------------------------------------------
-- 6. Indexes the scoped policies lean on
-- ----------------------------------------------------------------------------
-- Every one of these is a teacher_id lookup that now runs on each query from
-- a scoped user. Without them the policy is a sequential scan per request.
CREATE INDEX IF NOT EXISTS idx_section_subjects_teacher
  ON public.section_subjects (school_id, teacher_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_class_subjects_teacher
  ON public.class_subjects (school_id, teacher_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_sections_class_teacher
  ON public.sections (school_id, class_teacher_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_staff_profile
  ON public.staff (school_id, profile_id) WHERE is_deleted = false;


-- ----------------------------------------------------------------------------
-- 7. Correct the Teacher role
-- ----------------------------------------------------------------------------
-- THIS IS A FIX, NOT A NEW ROW.
--
-- schema.sql already seeds a system 'teacher' template described as "Own
-- classes, attendance and marks" -- but the permissions it actually grants
-- are students.read, attendance.read/write and exams.read/write, every one of
-- them school-wide. The description and the grant have disagreed since the
-- day it shipped, and the grant is what the database enforces: anybody
-- holding that role can read every child's marks in the school.
--
-- There were no scoped permissions to express the intent with until now. This
-- rewrites the template to say what it always claimed to say.
--
-- An UPSERT, deliberately, not ON CONFLICT DO NOTHING: the row exists, so
-- DO NOTHING would leave the wide grant in place and quietly defeat the
-- entire migration. is_system roles cannot be edited by schools, so this is
-- the shipped template being corrected rather than anybody's customisation
-- being overwritten.
--
-- reports.read is dropped too: the Reports module aggregates the whole
-- school's fees, marks and attendance, which is not a teacher's business.
INSERT INTO public.roles (school_id, name, display_name, description, is_system, permissions)
VALUES (
  NULL,
  'teacher',
  'Teacher',
  'Own sections only: take the register, enter marks for subjects they teach.',
  true,
  '[
    "academics.read",
    "students.read.own",
    "attendance.read.own",
    "attendance.write.own",
    "exams.read.own",
    "exams.write.own",
    "tests.read.own",
    "tests.write.own",
    "notifications.read"
  ]'::jsonb
)
ON CONFLICT (name) WHERE school_id IS NULL
DO UPDATE SET
  description = EXCLUDED.description,
  permissions = EXCLUDED.permissions,
  updated_at  = now();


DO $report$
DECLARE
  v_teachers integer;
  v_holding  integer;
BEGIN
  SELECT count(*) INTO v_teachers
    FROM public.staff
   WHERE staff_type = 'teaching' AND is_deleted = false AND profile_id IS NOT NULL;

  -- How many people are affected by the role correction above. If this is
  -- not zero, those accounts could see the whole school a minute ago and
  -- cannot now -- which is the fix working, but worth knowing about.
  SELECT count(*) INTO v_holding
    FROM public.profile_roles pr
    JOIN public.roles r ON r.id = pr.role_id
   WHERE r.school_id IS NULL AND r.name = 'teacher';

  RAISE NOTICE '----------------------------------------------------------';
  RAISE NOTICE 'Teacher scoping installed.';
  RAISE NOTICE '  Custom roles are UNCHANGED -- .own codes are new, narrower';
  RAISE NOTICE '  siblings, so nothing anybody could see has been taken away.';
  RAISE NOTICE '';
  RAISE NOTICE '  EXCEPT the system Teacher template, which was granting the';
  RAISE NOTICE '  whole school despite describing itself as "own classes".';
  RAISE NOTICE '  It is now scoped. People holding it: %', v_holding;
  RAISE NOTICE '';
  RAISE NOTICE '  Teaching staff with a login: %', v_teachers;
  RAISE NOTICE '----------------------------------------------------------';
END
$report$;
