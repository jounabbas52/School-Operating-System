-- ============================================================================
-- 009_EXAMINATIONS.sql -- run after 008_timetable.sql
-- ============================================================================
-- Paste the whole file into the SQL editor and Run. Idempotent.
--
-- WHAT THIS ADDS AND WHY
--
-- The exam tables shipped in schema.sql describe marks well and the paperwork
-- around them not at all. These screens need the paperwork.
--
-- 1. exams gains class_id, session_id, description and status. An exam is
--    announced for a class long before anyone enters a mark, and the list is
--    filtered by Upcoming / Ongoing / Completed. status is text with a CHECK
--    rather than a new enum value: ALTER TYPE ... ADD VALUE cannot run inside
--    a transaction block and the SQL editor wraps statements in one -- the
--    same reason 005 widened staff.status by hand.
--
-- 2. tests gains the same three. A test is the small sibling of an exam and
--    the Tests screen filters identically.
--
-- 3. datesheet_groups -- a NAMED, printable date sheet. The existing
--    datesheets table is one row per paper; nothing held the sheet those
--    papers are printed on, so there was nothing for a slip to point at.
--
-- 4. datesheets gains exam_name, duration, venue, day_label and group_id.
--    exam_name is free text on purpose: a date sheet is routinely typed up
--    (Mid Term 2026) before anyone creates the exam record, and blocking the
--    clerk until they do is how paper date sheets stay on paper.
--
-- 5. exam_slips -- admit cards. One row per student per date sheet, carrying
--    the three print toggles, because two clerks printing the same sheet
--    should get the same card.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Exams: the announcement, not just the marks
-- ----------------------------------------------------------------------------
ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS class_id    uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS session_id  uuid REFERENCES public.sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS status      text NOT NULL DEFAULT 'upcoming';

ALTER TABLE public.exams DROP CONSTRAINT IF EXISTS exams_status_check;
ALTER TABLE public.exams
  ADD CONSTRAINT exams_status_check
  CHECK (status IN ('upcoming', 'ongoing', 'completed', 'cancelled'));

CREATE INDEX IF NOT EXISTS idx_exams_class  ON public.exams (school_id, class_id);
CREATE INDEX IF NOT EXISTS idx_exams_status ON public.exams (school_id, status, start_date);


-- ----------------------------------------------------------------------------
-- 2. Tests: same three columns
-- ----------------------------------------------------------------------------
ALTER TABLE public.tests
  ADD COLUMN IF NOT EXISTS session_id  uuid REFERENCES public.sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS status      text NOT NULL DEFAULT 'upcoming';

ALTER TABLE public.tests DROP CONSTRAINT IF EXISTS tests_status_check;
ALTER TABLE public.tests
  ADD CONSTRAINT tests_status_check
  CHECK (status IN ('upcoming', 'ongoing', 'completed', 'cancelled'));

CREATE INDEX IF NOT EXISTS idx_tests_status ON public.tests (school_id, status, test_date);


-- ----------------------------------------------------------------------------
-- 3. The sheet itself
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.datesheet_groups (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id    uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name         text NOT NULL,
  exam_id      uuid REFERENCES public.exams(id) ON DELETE SET NULL,
  class_id     uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  session_id   uuid REFERENCES public.sessions(id) ON DELETE SET NULL,
  -- Free text so a sheet can be headed before the exam row exists. exam_id
  -- stays the link when there is one.
  exam_name    text,
  start_date   date,
  end_date     date,
  -- Printed under the table on the sheet.
  instructions text,
  status       text NOT NULL DEFAULT 'draft',
  notes        text,
  user_id      uuid,
  created_by   uuid,
  updated_by   uuid,
  deleted_by   uuid,
  deleted_at   timestamptz,
  is_deleted   boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, name)
);

ALTER TABLE public.datesheet_groups DROP CONSTRAINT IF EXISTS datesheet_groups_status_check;
ALTER TABLE public.datesheet_groups
  ADD CONSTRAINT datesheet_groups_status_check
  CHECK (status IN ('draft', 'published', 'archived'));

CREATE INDEX IF NOT EXISTS idx_datesheet_groups_school
  ON public.datesheet_groups (school_id, status);


-- ----------------------------------------------------------------------------
-- 4. One paper on a sheet
-- ----------------------------------------------------------------------------
ALTER TABLE public.datesheets
  ADD COLUMN IF NOT EXISTS group_id  uuid REFERENCES public.datesheet_groups(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS exam_name text,
  -- Stored, not derived at render time: a paper moved to a public holiday
  -- keeps the weekday the office wrote down until someone changes the date.
  ADD COLUMN IF NOT EXISTS day_label text,
  ADD COLUMN IF NOT EXISTS duration  text,
  ADD COLUMN IF NOT EXISTS venue     text;

CREATE INDEX IF NOT EXISTS idx_datesheets_group ON public.datesheets (school_id, group_id);
CREATE INDEX IF NOT EXISTS idx_datesheets_date  ON public.datesheets (school_id, exam_date);


-- ----------------------------------------------------------------------------
-- 5. Admit cards
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.exam_slips (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  group_id       uuid NOT NULL REFERENCES public.datesheet_groups(id) ON DELETE CASCADE,
  student_id     uuid REFERENCES public.students(id) ON DELETE CASCADE,
  class_id       uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  section_id     uuid REFERENCES public.sections(id) ON DELETE SET NULL,
  -- Copied rather than joined: an exam roll number is often not the class
  -- roll number, and the card has to reprint identically next year.
  student_name   text,
  roll_number    text,
  room_number    text,
  show_room      boolean NOT NULL DEFAULT true,
  show_time      boolean NOT NULL DEFAULT true,
  show_signature boolean NOT NULL DEFAULT false,
  issued_at      timestamptz NOT NULL DEFAULT now(),
  user_id        uuid,
  created_by     uuid,
  updated_by     uuid,
  deleted_by     uuid,
  deleted_at     timestamptz,
  is_deleted     boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  -- One card per student per sheet. Pressing Generate twice should not fill
  -- the drawer with duplicates.
  UNIQUE (school_id, group_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_exam_slips_group ON public.exam_slips (school_id, group_id);


-- ----------------------------------------------------------------------------
-- 6. Row level security and triggers
-- ----------------------------------------------------------------------------
SELECT public.apply_tenant_rls('datesheet_groups', 'exams.read', 'exams.write');
SELECT public.apply_tenant_rls('exam_slips',       'exams.read', 'exams.write');

SELECT public.add_touch_trigger('datesheet_groups');
SELECT public.add_touch_trigger('exam_slips');

SELECT public.add_audit_trigger('exams');
SELECT public.add_audit_trigger('datesheet_groups');


DO $report$
BEGIN
  RAISE NOTICE '----------------------------------------------------------';
  RAISE NOTICE 'Examinations installed.';
  RAISE NOTICE '  exams:            %', (SELECT count(*) FROM public.exams);
  RAISE NOTICE '  tests:            %', (SELECT count(*) FROM public.tests);
  RAISE NOTICE '  datesheet groups: %', (SELECT count(*) FROM public.datesheet_groups);
  RAISE NOTICE '  exam slips:       %', (SELECT count(*) FROM public.exam_slips);
  RAISE NOTICE '----------------------------------------------------------';
END
$report$;
