-- ============================================================================
-- 005_TEACHERS.sql -- run after 004_storage.sql
-- ============================================================================
-- Paste the whole file into the SQL editor and Run. Idempotent.
--
-- WHAT THIS ADDS AND WHY
--
-- 1. salary_structures -- the "Designation" dropdown on the teacher form is
--    not free text; it picks a pay grade. Nothing in the schema held one, so
--    the field had nowhere to point. One row per designation per school,
--    carrying the basic pay that Payroll will later run against.
--
-- 2. staff.staff_type -- the staff table is the whole payroll: teachers,
--    clerks, drivers, guards. The Teachers screen must not list the driver,
--    and a later HR / Staff screen must not have to guess. Existing rows are
--    backfilled to 'teaching', which is what a school's staff list is made of
--    before anyone has said otherwise.
--
-- 3. The teacher-form fields the table lacks: qualification, subject
--    specialisation, monthly salary, address, gender, date of birth, blood
--    group, emergency contact, experience.
--
--    subject_id is the ONE subject a teacher is hired for -- their
--    specialisation, as on the form. What they actually teach this year is
--    class_subjects.teacher_id, which is many rows and a different question.
--
-- 4. staff.status widened. It is the user_status enum
--    (active/inactive/suspended/pending), which cannot express resigned,
--    terminated or on_leave -- the states an employee record actually needs.
--    Converted to text with a CHECK rather than adding enum values, because
--    ALTER TYPE ... ADD VALUE cannot run inside a transaction block and the
--    SQL editor wraps statements in one. Same move as students in 003.
--
-- 5. A private staff-photos bucket. Teacher photographs cannot go in
--    student-photos: that bucket's policies are written against
--    students.read / students.write, so an HR clerk holding only staff
--    permissions could not read them, and a teacher holding students.read
--    could read every colleague's.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Salary structures -- what the Designation dropdown reads
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.salary_structures (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id    uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name         text NOT NULL,
  basic_salary numeric,
  -- Named amounts on top of / off basic, e.g. {"house_rent": 5000}. Payroll
  -- reads these; the teacher form only needs the name and the basic.
  allowances   jsonb NOT NULL DEFAULT '{}'::jsonb,
  deductions   jsonb NOT NULL DEFAULT '{}'::jsonb,
  description  text,
  status       text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
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
CREATE INDEX IF NOT EXISTS idx_salary_structures_school
  ON public.salary_structures (school_id, status);


-- ----------------------------------------------------------------------------
-- 2. Staff columns the teacher form needs
-- ----------------------------------------------------------------------------
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS staff_type          text NOT NULL DEFAULT 'teaching',
  ADD COLUMN IF NOT EXISTS qualification       text,
  ADD COLUMN IF NOT EXISTS subject_id          uuid REFERENCES public.subjects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS salary_structure_id uuid REFERENCES public.salary_structures(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS monthly_salary      numeric,
  ADD COLUMN IF NOT EXISTS address             text,
  ADD COLUMN IF NOT EXISTS gender              public.gender,
  ADD COLUMN IF NOT EXISTS date_of_birth       date,
  ADD COLUMN IF NOT EXISTS blood_group         varchar(5),
  ADD COLUMN IF NOT EXISTS emergency_contact   varchar(30),
  ADD COLUMN IF NOT EXISTS experience_years    numeric,
  ADD COLUMN IF NOT EXISTS notes               text;

ALTER TABLE public.staff DROP CONSTRAINT IF EXISTS staff_type_check;
ALTER TABLE public.staff
  ADD CONSTRAINT staff_type_check
  CHECK (staff_type IN ('teaching', 'admin', 'support'));

CREATE INDEX IF NOT EXISTS idx_staff_type    ON public.staff (school_id, staff_type);
CREATE INDEX IF NOT EXISTS idx_staff_subject ON public.staff (school_id, subject_id);


-- ----------------------------------------------------------------------------
-- 3. Widen staff.status
-- ----------------------------------------------------------------------------
DO $status$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'staff'
      AND column_name = 'status' AND udt_name = 'user_status'
  ) THEN
    ALTER TABLE public.staff ALTER COLUMN status DROP DEFAULT;
    ALTER TABLE public.staff ALTER COLUMN status TYPE text USING status::text;
    ALTER TABLE public.staff ALTER COLUMN status SET DEFAULT 'active';
    RAISE NOTICE 'staff.status: user_status -> text';
  END IF;
END
$status$;

ALTER TABLE public.staff DROP CONSTRAINT IF EXISTS staff_status_check;
ALTER TABLE public.staff
  ADD CONSTRAINT staff_status_check
  CHECK (status IN ('active','inactive','suspended','pending','on_leave','resigned','terminated'));


-- ----------------------------------------------------------------------------
-- 4. Next staff number, used to prefill the form
-- ----------------------------------------------------------------------------
-- Returns TCH-001, TCH-002 ... per school. Only numbers already carrying the
-- caller's prefix are counted, so introducing a second prefix later (ADM-,
-- SUP-) does not renumber anyone.
CREATE OR REPLACE FUNCTION public.next_staff_number(p_school uuid, p_prefix text DEFAULT 'TCH')
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT p_prefix || '-' || lpad(
    (COALESCE(MAX((regexp_match(staff_number, '(\d+)$'))[1]::integer), 0) + 1)::text, 3, '0')
  FROM public.staff
  WHERE school_id = p_school
    AND is_deleted = false
    AND staff_number LIKE p_prefix || '-%'
    AND staff_number ~ '\d+$';
$fn$;

GRANT EXECUTE ON FUNCTION public.next_staff_number(uuid, text) TO authenticated;


-- ----------------------------------------------------------------------------
-- 5. Row level security and triggers
-- ----------------------------------------------------------------------------
-- Gated on staff, not payroll. A permission code's module is the text before
-- its first dot, so payroll.write is dead for any school that has not bought
-- the Payroll module -- and the Designation dropdown is written from the
-- teacher panel, which such a school does have.
SELECT public.apply_tenant_rls('salary_structures', 'staff.read', 'staff.write');

SELECT public.add_touch_trigger('salary_structures');
SELECT public.add_audit_trigger('salary_structures');


-- ----------------------------------------------------------------------------
-- 6. Staff photo bucket -- private, gated on staff permissions
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'staff-photos', 'staff-photos', false, 2097152,
  ARRAY['image/png','image/jpeg','image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DO $do$
BEGIN
  EXECUTE $p$
    CREATE POLICY "staff photos read" ON storage.objects FOR SELECT TO authenticated
      USING (
        bucket_id = 'staff-photos'
        AND (storage.foldername(name))[1]::uuid = public.current_school_id()
        AND public.has_permission('staff.read')
      )$p$;

  EXECUTE $p$
    CREATE POLICY "staff photos insert" ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'staff-photos'
        AND (storage.foldername(name))[1]::uuid = public.current_school_id()
        AND public.has_permission('staff.write')
      )$p$;

  EXECUTE $p$
    CREATE POLICY "staff photos update" ON storage.objects FOR UPDATE TO authenticated
      USING (
        bucket_id = 'staff-photos'
        AND (storage.foldername(name))[1]::uuid = public.current_school_id()
        AND public.has_permission('staff.write')
      )$p$;

  EXECUTE $p$
    CREATE POLICY "staff photos delete" ON storage.objects FOR DELETE TO authenticated
      USING (
        bucket_id = 'staff-photos'
        AND (storage.foldername(name))[1]::uuid = public.current_school_id()
        AND public.has_permission('staff.write')
      )$p$;

  RAISE NOTICE 'staff-photos storage policies created';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Could not create storage.objects policies (owned by supabase_storage_admin). Create them from Dashboard > Storage > Policies using the same expressions.';
  WHEN duplicate_object THEN
    RAISE NOTICE 'staff-photos storage policies already exist -- skipped.';
END;
$do$;


-- ----------------------------------------------------------------------------
-- 7. Backfill: a staff number for anyone who predates the form
-- ----------------------------------------------------------------------------
WITH numbered AS (
  SELECT id, 'TCH-' || lpad(
           row_number() OVER (PARTITION BY school_id ORDER BY hire_date, created_at)::text, 3, '0'
         ) AS n
  FROM public.staff
  WHERE staff_number IS NULL AND is_deleted = false
)
UPDATE public.staff s
   SET staff_number = numbered.n
  FROM numbered
 WHERE s.id = numbered.id;


DO $report$
BEGIN
  RAISE NOTICE '----------------------------------------------------------';
  RAISE NOTICE 'Teachers upgrade applied.';
  RAISE NOTICE '  staff rows:         %', (SELECT count(*) FROM public.staff WHERE is_deleted = false);
  RAISE NOTICE '  teaching staff:     %', (SELECT count(*) FROM public.staff WHERE is_deleted = false AND staff_type = 'teaching');
  RAISE NOTICE '  salary structures:  %', (SELECT count(*) FROM public.salary_structures);
  RAISE NOTICE '----------------------------------------------------------';
END
$report$;
