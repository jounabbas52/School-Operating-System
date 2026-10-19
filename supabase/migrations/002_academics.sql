-- ============================================================================
-- 002_ACADEMICS.sql -- run after schema.sql
-- ============================================================================
-- Paste the whole file into the SQL editor and Run. Idempotent.
--
-- WHAT THIS CHANGES AND WHY
--
-- 1. Adds grade_levels. A grade level is permanent -- "Class 1" is Class 1
--    every year forever. A class is that grade level *in one session*, so
--    "Class 1 - A, 2026-2027" is a class and "Class 1" is the grade level.
--    Without this split, promotion at year-end has nothing stable to promote
--    students between.
--
-- 2. Attaches classes to a session. Every class now belongs to exactly one
--    session, which is what makes "all new classes and admissions attach to
--    the active session" true rather than a convention.
--
-- 3. Removes academic_years. schema.sql carried both academic_years and
--    sessions -- the same concept under two names, inherited from the older
--    database. terms and exams are repointed at sessions and the duplicate is
--    dropped. Nothing is built on either table yet, so this is the cheapest
--    moment to do it; later it would be a data migration.
--
-- 4. Adds section_subjects. Subjects are picked per section, since two
--    sections of the same class can take different electives.
--
-- 5. Adds the class timing defaults and subject category/status the design
--    asks for.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Grade levels -- permanent, reused every session
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.grade_levels (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name       text NOT NULL,
  short_name text,
  ordinal    smallint NOT NULL DEFAULT 100,   -- Nursery first, then KG, then 1st...
  stage      text,
  user_id    uuid,
  created_by uuid,
  updated_by uuid,
  deleted_by uuid,
  deleted_at timestamptz,
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, name)
);
CREATE INDEX IF NOT EXISTS idx_grade_levels_school_id ON public.grade_levels (school_id);
CREATE INDEX IF NOT EXISTS idx_grade_levels_order ON public.grade_levels (school_id, ordinal);


-- ----------------------------------------------------------------------------
-- 2. Sessions gain a display order; classes gain grade level + session
-- ----------------------------------------------------------------------------
ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS grade_level_id uuid REFERENCES public.grade_levels(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS session_id     uuid REFERENCES public.sessions(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS grading_system text DEFAULT 'percentage',
  -- Timing defaults, applied to the timetable when periods are generated.
  ADD COLUMN IF NOT EXISTS start_time         time,
  ADD COLUMN IF NOT EXISTS periods_per_day    smallint,
  ADD COLUMN IF NOT EXISTS period_minutes     smallint,
  ADD COLUMN IF NOT EXISTS break_after_period smallint,
  ADD COLUMN IF NOT EXISTS break_minutes      smallint;

CREATE INDEX IF NOT EXISTS idx_classes_session ON public.classes (school_id, session_id);
CREATE INDEX IF NOT EXISTS idx_classes_grade ON public.classes (school_id, grade_level_id);

-- schema.sql had UNIQUE (school_id, name) on classes. A class is now named
-- for its grade level, so that constraint would stop "1st" existing in both
-- 2026-2027 and 2027-2028 -- which is the whole point of sessions. Scope it
-- to the session instead.
ALTER TABLE public.classes DROP CONSTRAINT IF EXISTS classes_school_id_name_key;

CREATE UNIQUE INDEX IF NOT EXISTS classes_name_per_session
  ON public.classes (school_id, session_id, name)
  WHERE is_deleted = false AND session_id IS NOT NULL;

-- A grade level may only appear once per session: "1st" for 2026-2027 is one
-- class, and its variants are sections beneath it.
CREATE UNIQUE INDEX IF NOT EXISTS classes_grade_per_session
  ON public.classes (school_id, session_id, grade_level_id)
  WHERE is_deleted = false AND grade_level_id IS NOT NULL AND session_id IS NOT NULL;

-- Only one active session per school. is_current is what "Active" means on
-- the Sessions screen, and two active sessions would make "the active
-- session" ambiguous everywhere else.
CREATE UNIQUE INDEX IF NOT EXISTS sessions_one_current
  ON public.sessions (school_id) WHERE is_current AND is_deleted = false;


-- ----------------------------------------------------------------------------
-- 3. Subjects gain category and status
-- ----------------------------------------------------------------------------
ALTER TABLE public.subjects
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS status   text NOT NULL DEFAULT 'active';


-- ----------------------------------------------------------------------------
-- 4. Subjects per section
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.section_subjects (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  section_id uuid NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  teacher_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  is_compulsory boolean NOT NULL DEFAULT true,
  user_id    uuid,
  created_by uuid,
  updated_by uuid,
  deleted_by uuid,
  deleted_at timestamptz,
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, section_id, subject_id)
);
CREATE INDEX IF NOT EXISTS idx_section_subjects_section ON public.section_subjects (section_id);


-- ----------------------------------------------------------------------------
-- 5. Retire academic_years in favour of sessions
-- ----------------------------------------------------------------------------
-- terms and exams referenced academic_years; sessions is the same concept and
-- is what the UI exposes. Doing this now, while both tables are empty, avoids
-- a data migration later.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'terms' AND column_name = 'academic_year_id'
  ) THEN
    ALTER TABLE public.terms DROP CONSTRAINT IF EXISTS terms_academic_year_id_fkey;
    ALTER TABLE public.terms DROP CONSTRAINT IF EXISTS terms_school_id_academic_year_id_name_key;
    ALTER TABLE public.terms RENAME COLUMN academic_year_id TO session_id;
    ALTER TABLE public.terms
      ADD CONSTRAINT terms_session_id_fkey
      FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE;
    ALTER TABLE public.terms
      ADD CONSTRAINT terms_school_session_name_key UNIQUE (school_id, session_id, name);
    RAISE NOTICE 'terms.academic_year_id -> session_id';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'exams' AND column_name = 'academic_year_id'
  ) THEN
    ALTER TABLE public.exams DROP CONSTRAINT IF EXISTS exams_academic_year_id_fkey;
    ALTER TABLE public.exams RENAME COLUMN academic_year_id TO session_id;
    ALTER TABLE public.exams
      ADD CONSTRAINT exams_session_id_fkey
      FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE SET NULL;
    RAISE NOTICE 'exams.academic_year_id -> session_id';
  END IF;
END
$$;

DROP VIEW IF EXISTS public.current_academic_year;

CREATE OR REPLACE VIEW public.current_session
WITH (security_invoker = true) AS
SELECT id, school_id, name, start_date, end_date, is_current, created_at
FROM public.sessions
WHERE is_current = true AND is_deleted = false;

-- Only drop academic_years if nothing was ever put in it.
DO $$
DECLARE
  v_rows bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'academic_years') THEN
    EXECUTE 'SELECT count(*) FROM public.academic_years' INTO v_rows;
    IF v_rows = 0 THEN
      DROP TABLE public.academic_years CASCADE;
      RAISE NOTICE 'dropped academic_years (was empty, duplicated sessions)';
    ELSE
      RAISE WARNING 'academic_years has % row(s) -- left in place. Migrate them into sessions, then drop it by hand.', v_rows;
    END IF;
  END IF;
END
$$;


-- ----------------------------------------------------------------------------
-- 6. Row level security for the new tables
-- ----------------------------------------------------------------------------
SELECT public.apply_tenant_rls('grade_levels',     'academics.read', 'academics.write');
SELECT public.apply_tenant_rls('section_subjects', 'academics.read', 'academics.write');

SELECT public.add_touch_trigger('grade_levels');
SELECT public.add_touch_trigger('section_subjects');


-- ----------------------------------------------------------------------------
-- 7. Seed grade levels and an opening session for schools that have none
-- ----------------------------------------------------------------------------
-- Grade levels are the same list at almost every school here, and an empty
-- Classes screen is unusable without them. Schools can rename, reorder or
-- delete any of these.
INSERT INTO public.grade_levels (school_id, name, short_name, ordinal)
SELECT s.id, g.name, g.short_name, g.ordinal
FROM public.schools s
CROSS JOIN (VALUES
  ('Nursery',    'NU', 1),
  ('Play Group', 'PL', 2),
  ('Prep',       'PR', 3),
  ('1st',        '1S', 4),
  ('2nd',        '2N', 5),
  ('3rd',        '3R', 6),
  ('4th',        '4T', 7),
  ('5th',        '5T', 8),
  ('6th',        '6T', 9),
  ('7th',        '7T', 10),
  ('8th',        '8T', 11),
  ('9th',        '9T', 12),
  ('10th',       '10', 13)
) AS g(name, short_name, ordinal)
WHERE NOT EXISTS (
  SELECT 1 FROM public.grade_levels gl WHERE gl.school_id = s.id
)
ON CONFLICT (school_id, name) DO NOTHING;

INSERT INTO public.sessions (school_id, name, start_date, end_date, is_current, status)
SELECT s.id, '2026-2027', DATE '2026-04-01', DATE '2027-03-31', true, 'active'
FROM public.schools s
WHERE NOT EXISTS (
  SELECT 1 FROM public.sessions se WHERE se.school_id = s.id AND se.is_deleted = false
);


DO $$
BEGIN
  RAISE NOTICE '----------------------------------------------------------';
  RAISE NOTICE 'Academics upgrade applied.';
  RAISE NOTICE '  grade levels: %', (SELECT count(*) FROM public.grade_levels);
  RAISE NOTICE '  sessions:     %', (SELECT count(*) FROM public.sessions);
  RAISE NOTICE '----------------------------------------------------------';
END
$$;
