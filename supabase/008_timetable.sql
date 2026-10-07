-- ============================================================================
-- 008_TIMETABLE.sql -- run after 007_attendance.sql
-- ============================================================================
-- Paste the whole file into the SQL editor and Run. Idempotent.
--
-- WHAT THIS ADDS AND WHY
--
-- Nothing in the schema described a school day, so all three tables are new.
--
-- 1. periods -- the bell schedule. One row per class, per day, per slot,
--    carrying its own clock. Per CLASS and not per school because primary
--    and secondary rarely share a bell; per DAY because Friday is short
--    almost everywhere in Pakistan, and a single template that pretended
--    otherwise would have to be fought every week.
--
--    kind = 'break' rows sit in the same table rather than a separate one.
--    A break occupies a slot in the day exactly as a lesson does -- splitting
--    them would mean merging two ordered lists back together to draw one row
--    of the grid.
--
-- 2. timetable_entries -- what is taught in one slot, for one SECTION. The
--    period belongs to the class, the lesson belongs to the section: 10th-A
--    and 10th-B ring the same bell and sit in different rooms with different
--    teachers.
--
-- 3. timetable_settings -- the inputs the bulk generator last ran with, per
--    class. Regenerating a schedule is a routine act, and retyping the start
--    time, period length and both break rules every time is how a bell
--    schedule drifts.
--
-- 4. timetable_conflicts() -- one teacher, two rooms, same moment. The check
--    has to compare TIMES across classes, not period ids: 10th's Period 3 and
--    5th's Period 4 can easily be the same 45 minutes. Only the database can
--    see all of that at once.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. The bell schedule
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.periods (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  class_id    uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  -- ISO day numbering: 1 = Monday ... 7 = Sunday. Matches EXTRACT(isodow).
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  name        text NOT NULL,
  kind        text NOT NULL DEFAULT 'regular' CHECK (kind IN ('regular', 'break')),
  start_time  time NOT NULL,
  end_time    time NOT NULL,
  -- Position in the day. The grid draws its columns from this, so two slots
  -- in one day may not share a number.
  sort_order  smallint NOT NULL DEFAULT 1,
  user_id     uuid,
  created_by  uuid,
  updated_by  uuid,
  deleted_by  uuid,
  deleted_at  timestamptz,
  is_deleted  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (end_time > start_time),
  UNIQUE (school_id, class_id, day_of_week, sort_order)
);
CREATE INDEX IF NOT EXISTS idx_periods_class
  ON public.periods (school_id, class_id, day_of_week, sort_order);


-- ----------------------------------------------------------------------------
-- 2. What is taught in a slot
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.timetable_entries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  class_id    uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  section_id  uuid NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
  period_id   uuid NOT NULL REFERENCES public.periods(id) ON DELETE CASCADE,
  subject_id  uuid REFERENCES public.subjects(id) ON DELETE CASCADE,
  teacher_id  uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  room_number text,
  notes       text,
  user_id     uuid,
  created_by  uuid,
  updated_by  uuid,
  deleted_by  uuid,
  deleted_at  timestamptz,
  is_deleted  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  -- One section sits in exactly one lesson per slot.
  UNIQUE (school_id, section_id, period_id)
);
CREATE INDEX IF NOT EXISTS idx_timetable_section
  ON public.timetable_entries (school_id, section_id);
CREATE INDEX IF NOT EXISTS idx_timetable_teacher
  ON public.timetable_entries (school_id, teacher_id);


-- ----------------------------------------------------------------------------
-- 3. What the generator last ran with
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.timetable_settings (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id           uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  class_id            uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  start_time          time NOT NULL DEFAULT '08:00',
  period_minutes      smallint NOT NULL DEFAULT 45 CHECK (period_minutes BETWEEN 5 AND 240),
  periods_per_day     smallint NOT NULL DEFAULT 7 CHECK (periods_per_day BETWEEN 1 AND 20),
  -- 0 = no break. Kept as a plain number rather than a nullable column so the
  -- generator has one code path.
  short_break_after   smallint NOT NULL DEFAULT 3,
  short_break_minutes smallint NOT NULL DEFAULT 10,
  lunch_after         smallint NOT NULL DEFAULT 5,
  lunch_minutes       smallint NOT NULL DEFAULT 30,
  -- Which days the generator writes, as ISO day numbers.
  days                smallint[] NOT NULL DEFAULT ARRAY[1,2,3,4,5]::smallint[],
  updated_by          uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, class_id)
);


-- ----------------------------------------------------------------------------
-- 4. Teacher double-booking
-- ----------------------------------------------------------------------------
-- Every slot where one teacher is timetabled against two sections at once.
-- Overlap is compared on the CLOCK, because two classes keep their own
-- period numbering -- 10th's Period 3 and 5th's Period 4 are often the same
-- forty-five minutes.
--
-- SECURITY INVOKER (the default): RLS on timetable_entries decides what is
-- visible, exactly as it would for a direct select.
CREATE OR REPLACE FUNCTION public.timetable_conflicts()
RETURNS TABLE (
  teacher_id  uuid,
  day_of_week smallint,
  start_time  time,
  end_time    time,
  entry_a     uuid,
  entry_b     uuid,
  section_a   uuid,
  section_b   uuid
)
LANGUAGE sql
STABLE
AS $fn$
  SELECT a.teacher_id,
         pa.day_of_week,
         GREATEST(pa.start_time, pb.start_time),
         LEAST(pa.end_time, pb.end_time),
         a.id, b.id,
         a.section_id, b.section_id
    FROM public.timetable_entries a
    JOIN public.periods pa ON pa.id = a.period_id AND pa.is_deleted = false
    JOIN public.timetable_entries b
      ON b.school_id  = a.school_id
     AND b.teacher_id = a.teacher_id
     AND b.id > a.id                     -- each pair once, never against itself
     AND b.is_deleted = false
    JOIN public.periods pb
      ON pb.id = b.period_id
     AND pb.is_deleted = false
     AND pb.day_of_week = pa.day_of_week
     AND pb.start_time < pa.end_time     -- half-open: 8:45 may follow 8:00-8:45
     AND pb.end_time   > pa.start_time
   WHERE a.is_deleted = false
     AND a.teacher_id IS NOT NULL
     AND a.section_id <> b.section_id;
$fn$;

GRANT EXECUTE ON FUNCTION public.timetable_conflicts() TO authenticated;


-- ----------------------------------------------------------------------------
-- 5. Row level security and triggers
-- ----------------------------------------------------------------------------
SELECT public.apply_tenant_rls('periods',            'academics.read', 'academics.write');
SELECT public.apply_tenant_rls('timetable_entries',  'academics.read', 'academics.write');
SELECT public.apply_tenant_rls('timetable_settings', 'academics.read', 'academics.write');

SELECT public.add_touch_trigger('periods');
SELECT public.add_touch_trigger('timetable_entries');
SELECT public.add_touch_trigger('timetable_settings');

SELECT public.add_audit_trigger('timetable_entries');


DO $report$
BEGIN
  RAISE NOTICE '----------------------------------------------------------';
  RAISE NOTICE 'Timetable installed.';
  RAISE NOTICE '  periods:           %', (SELECT count(*) FROM public.periods);
  RAISE NOTICE '  timetable entries: %', (SELECT count(*) FROM public.timetable_entries);
  RAISE NOTICE '----------------------------------------------------------';
END
$report$;
