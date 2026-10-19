-- ============================================================================
-- 003_STUDENTS.sql -- run after 002_academics.sql
-- ============================================================================
-- Paste the whole file into the SQL editor and Run. Idempotent.
--
-- WHAT THIS ADDS AND WHY
--
-- 1. The admission-form fields the design asks for that the table lacks:
--    serial number, family number, father's contact/CNIC/occupation/income,
--    student CNIC, birth place.
--
-- 2. students.session_id -- the session a student was admitted in. The
--    Admission Register lists it, and without it "students admitted this
--    year" is unanswerable.
--
-- 3. student_enrollments -- one row per student per session, recording which
--    class and section they sat in and how that year ended. students only
--    holds current_class_id, which is where they are NOW. Promotion, Old
--    Students and last year's results all need where they WERE, and that
--    history has nowhere to live today.
--
-- 4. students.status widened. It is currently the user_status enum
--    (active/inactive/suspended/pending), which cannot express graduated or
--    transferred -- the two states the Old Students screen is built around.
--    Converted to text with a CHECK rather than adding enum values, because
--    ALTER TYPE ... ADD VALUE cannot run inside a transaction block and the
--    SQL editor wraps statements in one.
--
-- 5. certificate_settings and id_card_settings -- one row per school holding
--    the template configuration from the two settings panels.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Admission-form fields
-- ----------------------------------------------------------------------------
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS serial_number        integer,
  ADD COLUMN IF NOT EXISTS family_number        text,
  ADD COLUMN IF NOT EXISTS session_id           uuid REFERENCES public.sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS father_mobile        varchar(30),
  ADD COLUMN IF NOT EXISTS father_whatsapp      varchar(30),
  ADD COLUMN IF NOT EXISTS father_email         text,
  ADD COLUMN IF NOT EXISTS father_cnic          varchar(20),
  ADD COLUMN IF NOT EXISTS father_occupation    text,
  ADD COLUMN IF NOT EXISTS father_annual_income numeric,
  ADD COLUMN IF NOT EXISTS student_cnic         varchar(20),
  ADD COLUMN IF NOT EXISTS birth_place          text;

CREATE INDEX IF NOT EXISTS idx_students_session ON public.students (school_id, session_id);
CREATE INDEX IF NOT EXISTS idx_students_section ON public.students (school_id, current_section_id);
CREATE INDEX IF NOT EXISTS idx_students_family  ON public.students (school_id, family_number);

-- Serial numbers are per school and human-facing, so they must not collide.
CREATE UNIQUE INDEX IF NOT EXISTS students_serial_per_school
  ON public.students (school_id, serial_number)
  WHERE serial_number IS NOT NULL AND is_deleted = false;


-- ----------------------------------------------------------------------------
-- 2. Widen students.status
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'students'
      AND column_name = 'status' AND udt_name = 'user_status'
  ) THEN
    ALTER TABLE public.students ALTER COLUMN status DROP DEFAULT;
    ALTER TABLE public.students ALTER COLUMN status TYPE text USING status::text;
    ALTER TABLE public.students ALTER COLUMN status SET DEFAULT 'active';
    RAISE NOTICE 'students.status: user_status -> text';
  END IF;
END
$$;

ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_status_check;
ALTER TABLE public.students
  ADD CONSTRAINT students_status_check
  CHECK (status IN ('active', 'inactive', 'suspended', 'pending', 'graduated', 'transferred'));

CREATE INDEX IF NOT EXISTS idx_students_status ON public.students (school_id, status);


-- ----------------------------------------------------------------------------
-- 3. Enrolment history -- one row per student per session
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.student_enrollments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id  uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  session_id  uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  class_id    uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  section_id  uuid REFERENCES public.sections(id) ON DELETE SET NULL,
  roll_number text,
  -- How the student's year in this class ended. 'active' is the year in
  -- progress; the rest are set by the Promotion screen.
  status      text NOT NULL DEFAULT 'active'
              CHECK (status IN ('active','promoted','retained','graduated','transferred','withdrawn')),
  -- Where they went next, for an audit trail of the promotion itself.
  promoted_to_class_id   uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  promoted_to_section_id uuid REFERENCES public.sections(id) ON DELETE SET NULL,
  enrolled_on date NOT NULL DEFAULT CURRENT_DATE,
  ended_on    date,
  remarks     text,
  user_id     uuid,
  created_by  uuid,
  updated_by  uuid,
  deleted_by  uuid,
  deleted_at  timestamptz,
  is_deleted  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  -- A student sits in exactly one class per session.
  UNIQUE (school_id, student_id, session_id)
);
CREATE INDEX IF NOT EXISTS idx_enrol_session ON public.student_enrollments (school_id, session_id);
CREATE INDEX IF NOT EXISTS idx_enrol_class   ON public.student_enrollments (school_id, class_id, section_id);
CREATE INDEX IF NOT EXISTS idx_enrol_student ON public.student_enrollments (student_id);


-- ----------------------------------------------------------------------------
-- 4. Certificate template settings -- one row per school
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.certificate_settings (
  school_id       uuid PRIMARY KEY REFERENCES public.schools(id) ON DELETE CASCADE,
  school_name     text,
  school_address  text,
  contact_number  varchar(30),
  email           text,
  logo_url        text,
  background_url  text,
  title           text NOT NULL DEFAULT 'School Certificate',
  orientation     text NOT NULL DEFAULT 'portrait' CHECK (orientation IN ('portrait','landscape')),
  -- Which student fields print. Keys match the toggles in the settings panel.
  fields          jsonb NOT NULL DEFAULT
                  '{"student_name":true,"father_name":true,"class":true,
                    "roll_number":true,"admission_date":true,"issue_date":true}'::jsonb,
  -- Body text with {placeholder} tokens substituted at print time.
  body_text       text NOT NULL DEFAULT
                  'This is to certify that {student_name}, Son/Daughter of {father_name}, bearing Admission No. {admission_no}, is enrolled in {class} of this institution. This certificate is issued on {issue_date} upon request.',
  principal_name  text,
  principal_label text NOT NULL DEFAULT 'Principal',
  principal_signature_url text,
  signatory_name  text,
  signatory_label text NOT NULL DEFAULT 'Authorized Signatory',
  signatory_signature_url text,
  updated_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Log of what was actually issued -- schools get asked to reprint, and
-- "which certificate did we give whom" is a real question.
CREATE TABLE IF NOT EXISTS public.certificates_issued (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id  uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  kind        text NOT NULL
              CHECK (kind IN ('bonafide','character','school_leaving','result','migration')),
  issued_on   date NOT NULL DEFAULT CURRENT_DATE,
  issued_by   uuid,
  snapshot    jsonb NOT NULL DEFAULT '{}'::jsonb,
  user_id     uuid,
  created_by  uuid,
  updated_by  uuid,
  deleted_by  uuid,
  deleted_at  timestamptz,
  is_deleted  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_certs_student ON public.certificates_issued (school_id, student_id);


-- ----------------------------------------------------------------------------
-- 5. ID card template settings -- one row per school
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.id_card_settings (
  school_id      uuid PRIMARY KEY REFERENCES public.schools(id) ON DELETE CASCADE,
  school_name    text,
  school_email   text,
  school_phone   varchar(30),
  school_address text,
  logo_url       text,
  background_url text,

  orientation    text NOT NULL DEFAULT 'vertical' CHECK (orientation IN ('vertical','horizontal')),
  card_width     smallint NOT NULL DEFAULT 208,
  card_height    smallint NOT NULL DEFAULT 340,
  header_from    text NOT NULL DEFAULT '#3b0764',
  header_to      text NOT NULL DEFAULT '#7c3aed',
  border_style   text NOT NULL DEFAULT 'solid',
  border_color   text NOT NULL DEFAULT '#e2e8f0',

  fields         jsonb NOT NULL DEFAULT
                 '{"photo":true,"student_name":true,"father_name":true,"roll_number":true,
                   "class":true,"section":true,"date_of_birth":false,"admission_number":true,
                   "address":false,"gender":true,"status":true}'::jsonb,

  font_size      smallint NOT NULL DEFAULT 10,
  font_style     text NOT NULL DEFAULT 'sans',
  text_align     text NOT NULL DEFAULT 'center' CHECK (text_align IN ('left','center','right')),
  text_color     text NOT NULL DEFAULT '#1e293b',

  principal_signature_url text,
  principal_label text NOT NULL DEFAULT 'Principal',
  signatory_signature_url text,
  signatory_label text NOT NULL DEFAULT 'Authorized Signatory',

  show_barcode   boolean NOT NULL DEFAULT true,
  show_qr        boolean NOT NULL DEFAULT false,

  updated_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);


-- ----------------------------------------------------------------------------
-- 6. Backfill: give existing students a session and an enrolment row
-- ----------------------------------------------------------------------------
UPDATE public.students s
   SET session_id = (
     SELECT se.id FROM public.sessions se
     WHERE se.school_id = s.school_id AND se.is_current AND se.is_deleted = false
     LIMIT 1
   )
 WHERE s.session_id IS NULL AND s.is_deleted = false;

INSERT INTO public.student_enrollments
  (school_id, student_id, session_id, class_id, section_id, roll_number, status, enrolled_on)
SELECT s.school_id, s.id, s.session_id, s.current_class_id, s.current_section_id,
       s.roll_number, 'active', COALESCE(s.admission_date, CURRENT_DATE)
FROM public.students s
WHERE s.session_id IS NOT NULL
  AND s.is_deleted = false
ON CONFLICT (school_id, student_id, session_id) DO NOTHING;

-- Serial numbers for anyone who predates the column, ordered by admission.
WITH numbered AS (
  SELECT id, row_number() OVER (PARTITION BY school_id ORDER BY admission_date, created_at) AS n
  FROM public.students
  WHERE serial_number IS NULL AND is_deleted = false
)
UPDATE public.students s
   SET serial_number = numbered.n
  FROM numbered
 WHERE s.id = numbered.id;


-- ----------------------------------------------------------------------------
-- 7. Row level security
-- ----------------------------------------------------------------------------
SELECT public.apply_tenant_rls('student_enrollments',  'students.read', 'students.write');
SELECT public.apply_tenant_rls('certificates_issued',  'students.read', 'students.write');

-- The two settings tables are keyed by school_id as the primary key, so the
-- factory's school_id predicate works, but they belong to school settings
-- rather than to student records.
SELECT public.apply_tenant_rls('certificate_settings', 'students.read', 'core.settings.write');
SELECT public.apply_tenant_rls('id_card_settings',     'students.read', 'core.settings.write');

SELECT public.add_touch_trigger('student_enrollments');
SELECT public.add_touch_trigger('certificates_issued');
SELECT public.add_touch_trigger('certificate_settings');
SELECT public.add_touch_trigger('id_card_settings');

SELECT public.add_audit_trigger('student_enrollments');


-- ----------------------------------------------------------------------------
-- 8. Next serial number for a school, used by the admission form
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.next_student_serial(p_school uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT COALESCE(MAX(serial_number), 0) + 1
  FROM public.students
  WHERE school_id = p_school AND is_deleted = false;
$fn$;

GRANT EXECUTE ON FUNCTION public.next_student_serial(uuid) TO authenticated;


DO $$
BEGIN
  RAISE NOTICE '----------------------------------------------------------';
  RAISE NOTICE 'Students upgrade applied.';
  RAISE NOTICE '  students:            %', (SELECT count(*) FROM public.students);
  RAISE NOTICE '  enrolment rows:      %', (SELECT count(*) FROM public.student_enrollments);
  RAISE NOTICE '----------------------------------------------------------';
END
$$;
