-- ============================================================================
-- 013_FRONTDESK_SETTINGS.sql -- run after 012_transport_library.sql
-- ============================================================================
-- Paste the whole file into the SQL editor and Run. Idempotent.
--
-- WHAT THIS ADDS AND WHY
--
-- FRONT DESK
--
-- 1. inquiries gains purpose, inquiry_date, internal_notes and a widened
--    status. The existing columns describe a web lead; the front desk screen
--    is a counter log, where someone walked in, asked something, and has to
--    be chased next Tuesday.
--
-- 2. visitors gains badge_no, whom_to_meet and visit_date. host_profile_id
--    already existed and is kept, but most visitors ask for a person by name
--    who may not have a login, so the free-text field is what the gate
--    actually fills in.
--
-- 3. complaints -- new. Nothing in the schema held one, and a complaint is
--    not an inquiry: it has a priority, a subject, and it is about a student.
--
-- 4. contacts_directory gains designation, department, extension and
--    category. The phone book shows staff pulled live from HR plus the
--    numbers that are not staff -- the electrician, the bus contractor --
--    and those need a category to sit under.
--
-- SETTINGS
--
-- 5. schools gains the identity fields the settings screen edits. These are
--    columns rather than keys in the settings jsonb because they are printed
--    on certificates, ID cards and challans, where a missing key would render
--    as a blank line nobody notices until a hundred cards are printed.
--
-- 6. settings already exists as school_id + key + jsonb value, which is the
--    right shape for the academic / fee / notification / appearance blocks.
--    No change needed; the app writes one row per block.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Inquiries
-- ----------------------------------------------------------------------------
ALTER TABLE public.inquiries
  ADD COLUMN IF NOT EXISTS purpose          text,
  ADD COLUMN IF NOT EXISTS inquiry_date     date NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS internal_notes   text,
  ADD COLUMN IF NOT EXISTS class_id         uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  -- Set when the inquiry turns into an admission, so the front desk can see
  -- which of last month's walk-ins actually enrolled.
  ADD COLUMN IF NOT EXISTS student_id       uuid REFERENCES public.students(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS admission_status text NOT NULL DEFAULT 'none';

-- 'open' was the old default and is kept as an accepted value so existing
-- rows do not fail the constraint.
ALTER TABLE public.inquiries DROP CONSTRAINT IF EXISTS inquiries_status_check;
ALTER TABLE public.inquiries
  ADD CONSTRAINT inquiries_status_check
  CHECK (status IN ('open', 'pending', 'followup', 'resolved', 'closed'));

ALTER TABLE public.inquiries DROP CONSTRAINT IF EXISTS inquiries_admission_status_check;
ALTER TABLE public.inquiries
  ADD CONSTRAINT inquiries_admission_status_check
  CHECK (admission_status IN ('none', 'applied', 'admitted', 'declined'));

ALTER TABLE public.inquiries ALTER COLUMN status SET DEFAULT 'pending';

CREATE INDEX IF NOT EXISTS idx_inquiries_status
  ON public.inquiries (school_id, status, inquiry_date);


-- ----------------------------------------------------------------------------
-- 2. Visitor log
-- ----------------------------------------------------------------------------
ALTER TABLE public.visitors
  ADD COLUMN IF NOT EXISTS badge_no      text,
  ADD COLUMN IF NOT EXISTS whom_to_meet  text,
  -- The date the visit belongs to, kept separate from in_time so a visitor
  -- who signs in at 23:50 and out at 00:10 stays on one day's sheet.
  ADD COLUMN IF NOT EXISTS visit_date    date NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS cnic          text,
  ADD COLUMN IF NOT EXISTS notes         text;

CREATE INDEX IF NOT EXISTS idx_visitors_date
  ON public.visitors (school_id, visit_date, out_time);

CREATE OR REPLACE FUNCTION public.next_visitor_badge(p_school uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_next integer;
BEGIN
  -- Badges restart each day: the gate hands out V-001 every morning.
  SELECT COALESCE(MAX(NULLIF(regexp_replace(badge_no, '^.*-', ''), '')::integer), 0) + 1
    INTO v_next
    FROM public.visitors
   WHERE school_id = p_school
     AND visit_date = CURRENT_DATE
     AND badge_no LIKE 'V-%';

  RETURN 'V-' || lpad(v_next::text, 3, '0');
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.next_visitor_badge(uuid) TO authenticated;


-- ----------------------------------------------------------------------------
-- 3. Complaints
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.complaints (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  complainant    text NOT NULL,
  relation       text,
  -- Optional: a complaint about the canteen is about no student at all.
  student_id     uuid REFERENCES public.students(id) ON DELETE SET NULL,
  subject        text NOT NULL,
  description    text,
  category       text NOT NULL DEFAULT 'general',
  priority       text NOT NULL DEFAULT 'medium',
  complaint_date date NOT NULL DEFAULT CURRENT_DATE,
  status         text NOT NULL DEFAULT 'pending',
  resolution     text,
  resolved_by    uuid,
  resolved_at    timestamptz,
  phone          varchar(30),
  user_id        uuid,
  created_by     uuid,
  updated_by     uuid,
  deleted_by     uuid,
  deleted_at     timestamptz,
  is_deleted     boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.complaints DROP CONSTRAINT IF EXISTS complaints_status_check;
ALTER TABLE public.complaints
  ADD CONSTRAINT complaints_status_check
  CHECK (status IN ('pending', 'in_progress', 'resolved', 'closed'));

ALTER TABLE public.complaints DROP CONSTRAINT IF EXISTS complaints_priority_check;
ALTER TABLE public.complaints
  ADD CONSTRAINT complaints_priority_check
  CHECK (priority IN ('low', 'medium', 'high', 'urgent'));

CREATE INDEX IF NOT EXISTS idx_complaints_status
  ON public.complaints (school_id, status, complaint_date);


-- ----------------------------------------------------------------------------
-- 4. Phone book
-- ----------------------------------------------------------------------------
ALTER TABLE public.contacts_directory
  ADD COLUMN IF NOT EXISTS designation text,
  ADD COLUMN IF NOT EXISTS department  text,
  ADD COLUMN IF NOT EXISTS extension   text,
  ADD COLUMN IF NOT EXISTS category    text NOT NULL DEFAULT 'other';

ALTER TABLE public.contacts_directory DROP CONSTRAINT IF EXISTS contacts_directory_category_check;
ALTER TABLE public.contacts_directory
  ADD CONSTRAINT contacts_directory_category_check
  CHECK (category IN ('staff', 'management', 'emergency', 'vendor', 'other'));

CREATE INDEX IF NOT EXISTS idx_contacts_category
  ON public.contacts_directory (school_id, category);


-- ----------------------------------------------------------------------------
-- 5. School identity
-- ----------------------------------------------------------------------------
ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS school_type      text NOT NULL DEFAULT 'private',
  ADD COLUMN IF NOT EXISTS affiliation      text,
  ADD COLUMN IF NOT EXISTS established_year integer,
  ADD COLUMN IF NOT EXISTS principal_name   text,
  ADD COLUMN IF NOT EXISTS city             text,
  ADD COLUMN IF NOT EXISTS province         text,
  ADD COLUMN IF NOT EXISTS postal_code      text;

ALTER TABLE public.schools DROP CONSTRAINT IF EXISTS schools_type_check;
ALTER TABLE public.schools
  ADD CONSTRAINT schools_type_check
  CHECK (school_type IN ('private', 'public', 'trust', 'ngo', 'other'));


-- ----------------------------------------------------------------------------
-- 6. Row level security and triggers
-- ----------------------------------------------------------------------------
SELECT public.apply_tenant_rls('complaints', 'frontdesk.read', 'frontdesk.write');
SELECT public.add_touch_trigger('complaints');
SELECT public.add_audit_trigger('complaints');


DO $report$
BEGIN
  RAISE NOTICE '----------------------------------------------------------';
  RAISE NOTICE 'Front desk and settings installed.';
  RAISE NOTICE '  inquiries:  %', (SELECT count(*) FROM public.inquiries);
  RAISE NOTICE '  visitors:   %', (SELECT count(*) FROM public.visitors);
  RAISE NOTICE '  complaints: %', (SELECT count(*) FROM public.complaints);
  RAISE NOTICE '  contacts:   %', (SELECT count(*) FROM public.contacts_directory);
  RAISE NOTICE '----------------------------------------------------------';
END
$report$;
