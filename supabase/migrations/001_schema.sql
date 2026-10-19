-- ============================================================================
-- SCHOOL MANAGEMENT SYSTEM -- MULTI-TENANT SCHEMA
-- ============================================================================
-- Paste into the Supabase SQL Editor and Run. Idempotent.
--
-- Structure follows the existing app's conventions: school_id as the tenant
-- boundary, uuid primary keys, user_id / created_by / updated_by for audit,
-- deleted_by / deleted_at / is_deleted for soft deletes, roles carrying a
-- jsonb permission list, and profile_roles joining people to roles.
--
-- WHAT IS NEW HERE
--   1. A platform layer: modules, school_modules, plans, platform_admins.
--      This is the super-admin panel's data model -- "School A can use the
--      library module, School B cannot" is one row in school_modules.
--   2. Row level security on every table. Without it school_id is a comment
--      rather than a boundary: the Supabase anon key is public, so any
--      logged-in user could otherwise read every school's data.
--
-- WHAT IS DELIBERATELY DIFFERENT
--   Authentication uses Supabase Auth. profiles.id references auth.users(id),
--   so RLS can identify the caller through auth.uid(). There is no users
--   table holding passwords and no local_users table -- policies cannot see
--   a home-grown session, and RLS is the only thing that actually enforces
--   the tenant boundary.
--
-- AFTER RUNNING
--   1. Auth > Hooks > Customize Access Token -> public.custom_access_token_hook
--   2. INSERT INTO public.platform_admins (user_id, role)
--      VALUES ('<your auth.users id>', 'owner');
--   3. SELECT public.provision_school('Demo School', 'demo', 'complete');
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- ENUMS
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE public.user_status AS ENUM ('active', 'inactive', 'suspended', 'pending');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.gender AS ENUM ('male', 'female', 'other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.attendance_status AS ENUM ('present', 'absent', 'late', 'excused');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.challan_status AS ENUM ('open', 'partial', 'paid', 'overdue', 'cancelled', 'pending');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.payment_method AS ENUM ('cash', 'card', 'bank_transfer', 'cheque', 'online');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.payroll_status AS ENUM ('draft', 'finalized', 'paid', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.leave_status AS ENUM ('pending', 'approved', 'rejected', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.test_type AS ENUM ('class_test', 'quiz', 'assignment', 'mock', 'exam');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.report_category AS ENUM ('student', 'staff', 'fee', 'exam', 'attendance', 'other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.platform_role AS ENUM ('owner', 'super_admin', 'support', 'billing', 'read_only');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- HELPERS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_created_updated_by()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.created_by IS NULL THEN
    NEW.created_by = auth.uid();
  END IF;
  IF NEW.updated_by IS NULL THEN
    NEW.updated_by = auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_user_id_on_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    NEW.user_id = auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

-- Attach the updated_at trigger to a table (used at the bottom of this file).
CREATE OR REPLACE FUNCTION public.add_touch_trigger(p_table text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE format(
    'CREATE TRIGGER trg_%1$s_updated_at BEFORE UPDATE ON public.%1$I
       FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at()', p_table);
EXCEPTION WHEN duplicate_object THEN NULL;
END;
$$;

-- ============================================================================
-- PLATFORM LAYER -- the super-admin panel's data model
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.modules (
  code        text PRIMARY KEY,
  name        text NOT NULL,
  description text,
  category    text NOT NULL DEFAULT 'general',
  is_core     boolean NOT NULL DEFAULT false,   -- core modules can never be disabled
  icon        text,
  sort_order  integer NOT NULL DEFAULT 100,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.plans (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL UNIQUE,
  name        text NOT NULL,
  description text,
  price       numeric NOT NULL DEFAULT 0,
  currency    char(3) NOT NULL DEFAULT 'PKR',
  billing_interval text NOT NULL DEFAULT 'month'
              CHECK (billing_interval IN ('month', 'year', 'once')),
  is_public   boolean NOT NULL DEFAULT true,
  sort_order  integer NOT NULL DEFAULT 100,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.plan_modules (
  plan_id     uuid NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  module_code text NOT NULL REFERENCES public.modules(code) ON DELETE CASCADE,
  PRIMARY KEY (plan_id, module_code)
);

-- Who may operate the super-admin panel. Not bound to any school.
CREATE TABLE IF NOT EXISTS public.platform_admins (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role       public.platform_role NOT NULL DEFAULT 'support',
  email      text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- CORE TENANT TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.schools (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_name  text NOT NULL,
  short_code   text,
  slug         text,                            -- acme.yourdomain.com
  address      text,
  phone        varchar(50),
  email        text,
  website      text,
  timezone     text DEFAULT 'Asia/Karachi',
  currency     char(3) NOT NULL DEFAULT 'PKR',
  logo_url     text,
  branding     jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  plan_id      uuid REFERENCES public.plans(id),
  status       text NOT NULL DEFAULT 'active',
  is_suspended boolean NOT NULL DEFAULT false,  -- super-admin kill switch
  suspended_reason text,
  is_demo      boolean NOT NULL DEFAULT false,
  user_id      uuid,
  created_by   uuid,
  updated_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (short_code),
  UNIQUE (slug)
);

-- THE module gate. The super admin writes here; every policy reads it.
CREATE TABLE IF NOT EXISTS public.school_modules (
  school_id   uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  module_code text NOT NULL REFERENCES public.modules(code) ON DELETE CASCADE,
  is_enabled  boolean NOT NULL DEFAULT true,
  enabled_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz,                      -- null = no expiry
  limits      jsonb NOT NULL DEFAULT '{}'::jsonb,
  settings    jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled_by  uuid,
  PRIMARY KEY (school_id, module_code)
);
CREATE INDEX IF NOT EXISTS idx_school_modules_school ON public.school_modules (school_id);

-- Roles carry their permissions as a jsonb array of codes, e.g.
--   ["students.read", "students.write", "fees.read"]
-- The text before the first dot is the module code, which is how a
-- permission is tied to the module gate without a second lookup table.
CREATE TABLE IF NOT EXISTS public.roles (
  id           bigserial PRIMARY KEY,
  school_id    uuid REFERENCES public.schools(id) ON DELETE CASCADE,  -- null = system template
  name         text NOT NULL,
  display_name text,
  description  text,
  permissions  jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_system    boolean NOT NULL DEFAULT false,  -- school admins cannot edit these
  created_by   uuid,
  updated_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, name)
);
CREATE UNIQUE INDEX IF NOT EXISTS roles_system_name_key
  ON public.roles (name) WHERE school_id IS NULL;

-- One row per person. id IS the auth.users id, which is what lets RLS
-- identify the caller.
CREATE TABLE IF NOT EXISTS public.profiles (
  id             uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  school_id      uuid REFERENCES public.schools(id) ON DELETE CASCADE,  -- null = platform staff
  full_name      text,
  preferred_name text,
  email          text,
  phone          varchar(30),
  address        text,
  gender         public.gender,
  date_of_birth  date,
  avatar_url     text,
  metadata       jsonb NOT NULL DEFAULT '{}'::jsonb,
  status         public.user_status NOT NULL DEFAULT 'active',
  last_login     timestamptz,
  created_by     uuid,
  updated_by     uuid,
  deleted_by     uuid,
  deleted_at     timestamptz,
  is_deleted     boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_profiles_school_id ON public.profiles (school_id);

CREATE TABLE IF NOT EXISTS public.profile_roles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  profile_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role_id     bigint NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  assigned_by uuid,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, profile_id, role_id)
);
CREATE INDEX IF NOT EXISTS idx_profile_roles_profile ON public.profile_roles (profile_id);

-- Mirror new auth users into profiles.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, auth
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- A school role may only be given to someone in that same school.
CREATE OR REPLACE FUNCTION public.check_role_school_match()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role_school uuid;
BEGIN
  SELECT school_id INTO v_role_school FROM public.roles WHERE id = NEW.role_id;
  IF v_role_school IS NOT NULL AND v_role_school IS DISTINCT FROM NEW.school_id THEN
    RAISE EXCEPTION 'role % belongs to another school', NEW.role_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  CREATE TRIGGER trg_profile_roles_school_match
    BEFORE INSERT OR UPDATE ON public.profile_roles
    FOR EACH ROW EXECUTE FUNCTION public.check_role_school_match();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- AUTHORISATION
-- ============================================================================
-- Three functions, none of which take a row-dependent argument, so Postgres
-- evaluates each once per statement rather than once per row.

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public, auth
AS $$
  SELECT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid());
$$;

-- The caller's school, or NULL if they are platform staff, deleted,
-- suspended, or their school has been switched off.
CREATE OR REPLACE FUNCTION public.current_school_id()
RETURNS uuid
LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public, auth
AS $$
  SELECT p.school_id
  FROM public.profiles p
  JOIN public.schools s ON s.id = p.school_id
  WHERE p.id = auth.uid()
    AND p.status = 'active'
    AND p.is_deleted = false
    AND s.is_suspended = false
    AND s.status = 'active';
$$;

-- Is a module live for this school right now?
CREATE OR REPLACE FUNCTION public.school_has_module(p_school uuid, p_module text)
RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE((SELECT m.is_core FROM public.modules m WHERE m.code = p_module), false)
  OR EXISTS (
    SELECT 1 FROM public.school_modules sm
    WHERE sm.school_id = p_school
      AND sm.module_code = p_module
      AND sm.is_enabled
      AND (sm.expires_at IS NULL OR sm.expires_at > now())
  );
$$;

-- THE workhorse, used by every policy in this file.
--
-- Answers: does the caller hold this permission through one of their roles,
-- AND is the module that owns it switched on for their school? The module is
-- the text before the first dot, so 'library.write' is gated by the 'library'
-- module. An unrecognised permission code yields false -- it fails closed.
CREATE OR REPLACE FUNCTION public.has_permission(p_perm text)
RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.profile_roles pr ON pr.profile_id = p.id
    JOIN public.roles r ON r.id = pr.role_id
    WHERE p.id = auth.uid()
      AND p.status = 'active'
      AND p.is_deleted = false
      AND r.permissions ? p_perm
      AND public.school_has_module(p.school_id, split_part(p_perm, '.', 1))
  );
$$;

-- Every module the caller's school may use. The app calls this once at login
-- and renders the sidebar from the result.
CREATE OR REPLACE FUNCTION public.school_enabled_modules(p_school uuid DEFAULT NULL)
RETURNS TABLE (code text, name text, category text, icon text, sort_order integer)
LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public
AS $$
  SELECT m.code, m.name, m.category, m.icon, m.sort_order
  FROM public.modules m
  WHERE public.school_has_module(COALESCE(p_school, public.current_school_id()), m.code)
  ORDER BY m.sort_order;
$$;

GRANT EXECUTE ON FUNCTION
  public.is_platform_admin(), public.current_school_id(),
  public.school_has_module(uuid, text), public.has_permission(text),
  public.school_enabled_modules(uuid)
  TO authenticated;

-- ----------------------------------------------------------------------------
-- Access token hook -- cheap facts for middleware routing only.
-- Permissions are NOT put in the token: they go stale the moment a role is
-- edited, and a stale allow is a security hole.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  claims jsonb := COALESCE(event->'claims', '{}'::jsonb);
  uid    uuid  := (event->>'user_id')::uuid;
  v_admin_role text;
  v_school uuid;
  v_slug   text;
  v_roles  jsonb;
BEGIN
  SELECT pa.role::text INTO v_admin_role
  FROM public.platform_admins pa WHERE pa.user_id = uid;

  SELECT p.school_id, s.slug INTO v_school, v_slug
  FROM public.profiles p
  LEFT JOIN public.schools s ON s.id = p.school_id
  WHERE p.id = uid AND p.status = 'active' AND p.is_deleted = false
    AND COALESCE(s.is_suspended, false) = false;

  SELECT COALESCE(jsonb_agg(r.name), '[]'::jsonb) INTO v_roles
  FROM public.profile_roles pr
  JOIN public.roles r ON r.id = pr.role_id
  WHERE pr.profile_id = uid;

  claims := claims
    || jsonb_build_object('is_platform_admin', v_admin_role IS NOT NULL)
    || jsonb_build_object('platform_role', v_admin_role)
    || jsonb_build_object('school_id', v_school)
    || jsonb_build_object('school_slug', v_slug)
    || jsonb_build_object('roles', v_roles);

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) FROM authenticated, anon, public;
GRANT SELECT ON public.profiles, public.schools, public.roles, public.profile_roles,
  public.platform_admins TO supabase_auth_admin;

-- ----------------------------------------------------------------------------
-- Policy factory. One call per tenant table, at the bottom of this file.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_tenant_rls(p_table text, p_read text, p_write text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', p_table);

  BEGIN
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
         USING (public.is_platform_admin()
                OR (school_id = public.current_school_id()
                    AND public.has_permission(%L)))',
      p_table || '_select', p_table, p_read);
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
         WITH CHECK (school_id = public.current_school_id()
                     AND public.has_permission(%L))',
      p_table || '_insert', p_table, p_write);
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
         USING (school_id = public.current_school_id() AND public.has_permission(%L))
         WITH CHECK (school_id = public.current_school_id() AND public.has_permission(%L))',
      p_table || '_update', p_table, p_write, p_write);
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated
         USING (school_id = public.current_school_id() AND public.has_permission(%L))',
      p_table || '_delete', p_table, p_write);
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END;
$$;

-- ============================================================================
-- ACADEMIC STRUCTURE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.sessions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name       text NOT NULL,
  start_date date NOT NULL,
  end_date   date NOT NULL,
  is_current boolean NOT NULL DEFAULT false,
  status     text NOT NULL DEFAULT 'active',
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

CREATE TABLE IF NOT EXISTS public.academic_years (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name       text NOT NULL,
  start_date date NOT NULL,
  end_date   date NOT NULL,
  is_active  boolean NOT NULL DEFAULT false,
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
-- Only one active year per school.
CREATE UNIQUE INDEX IF NOT EXISTS academic_years_one_active
  ON public.academic_years (school_id) WHERE is_active;

CREATE TABLE IF NOT EXISTS public.terms (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year_id uuid NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
  name             text NOT NULL,
  start_date       date,
  end_date         date,
  user_id          uuid,
  created_by       uuid,
  updated_by       uuid,
  deleted_by       uuid,
  deleted_at       timestamptz,
  is_deleted       boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, academic_year_id, name)
);

CREATE TABLE IF NOT EXISTS public.classes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id           uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name                text NOT NULL,
  code                text,
  capacity            integer,
  description         text,
  class_incharge_id   uuid,
  exam_marking_system text,
  standard_fee        numeric,
  fee_plan            text DEFAULT 'monthly',
  order_number        integer,
  status              text NOT NULL DEFAULT 'active',
  user_id             uuid,
  created_by          uuid,
  updated_by          uuid,
  deleted_by          uuid,
  deleted_at          timestamptz,
  is_deleted          boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, name)
);

CREATE TABLE IF NOT EXISTS public.sections (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  class_id         uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  name             text NOT NULL,
  class_teacher_id uuid,
  room_number      varchar(50),
  capacity         integer,
  order_by         integer,
  status           text NOT NULL DEFAULT 'active',
  user_id          uuid,
  created_by       uuid,
  updated_by       uuid,
  deleted_by       uuid,
  deleted_at       timestamptz,
  is_deleted       boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, class_id, name)
);

CREATE TABLE IF NOT EXISTS public.subjects (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  code          text,
  name          text NOT NULL,
  description   text,
  default_marks integer,
  user_id       uuid,
  created_by    uuid,
  updated_by    uuid,
  deleted_by    uuid,
  deleted_at    timestamptz,
  is_deleted    boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, code)
);

CREATE TABLE IF NOT EXISTS public.class_subjects (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  class_id      uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  subject_id    uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  teacher_id    uuid,
  is_compulsory boolean NOT NULL DEFAULT true,
  user_id       uuid,
  created_by    uuid,
  updated_by    uuid,
  deleted_by    uuid,
  deleted_at    timestamptz,
  is_deleted    boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, class_id, subject_id)
);

-- ============================================================================
-- PEOPLE
-- ============================================================================
-- profile_id is nullable: a young pupil or a parent who never signs in still
-- needs a record. Give them portal access later by creating the auth user
-- and filling this in -- no data migration.

CREATE TABLE IF NOT EXISTS public.staff (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  profile_id      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  first_name      text,
  last_name       text,
  staff_number    text,
  hire_date       date,
  department      text,
  designation     text,
  employment_type text,
  work_email      text,
  phone           varchar(30),
  work_phone      varchar(30),
  photo_url       text,
  cnic            text,
  status          public.user_status NOT NULL DEFAULT 'active',
  user_id         uuid,
  created_by      uuid,
  updated_by      uuid,
  deleted_by      uuid,
  deleted_at      timestamptz,
  is_deleted      boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, staff_number),
  UNIQUE (school_id, profile_id)
);
CREATE INDEX IF NOT EXISTS idx_staff_status ON public.staff (school_id, status);

CREATE TABLE IF NOT EXISTS public.students (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id              uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  profile_id             uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  first_name             text,
  last_name              text,
  father_name            text,
  mother_name            text,
  photo_url              text,
  admission_number       text,
  roll_number            text,
  admission_date         date,
  date_of_birth          date,
  gender                 public.gender,
  religion               text,
  nationality            text DEFAULT 'Pakistan',
  caste                  text,
  blood_group            text,
  whatsapp_number        text,
  student_mobile         text,
  current_class_id       uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  current_section_id     uuid REFERENCES public.sections(id) ON DELETE SET NULL,
  house                  text,
  current_address        text,
  city                   text,
  state                  text,
  postal_code            text,
  guardian_name          text,
  guardian_relation      text,
  guardian_phone         varchar(30),
  guardian_email         text,
  emergency_contact_name text,
  emergency_relation     text,
  emergency_phone        text,
  emergency_address      text,
  previous_school        text,
  previous_class         text,
  medical_problem        text,
  fee_plan               text DEFAULT 'monthly',
  starting_month         integer,
  base_fee               numeric,
  discount_value         numeric,
  discount_type          text,
  discount_note          text,
  final_fee              numeric,
  fee_plan_changed_at    timestamptz,
  status                 public.user_status NOT NULL DEFAULT 'active',
  user_id                uuid,
  created_by             uuid,
  updated_by             uuid,
  deleted_by             uuid,
  deleted_at             timestamptz,
  is_deleted             boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, admission_number),
  UNIQUE (school_id, profile_id)
);
CREATE INDEX IF NOT EXISTS idx_students_status ON public.students (school_id, status);
CREATE INDEX IF NOT EXISTS idx_students_class ON public.students (school_id, current_class_id);

-- ============================================================================
-- ATTENDANCE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.attendance (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id  uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  date        date NOT NULL,
  status      public.attendance_status NOT NULL,
  recorded_by uuid,
  remarks     text,
  user_id     uuid,
  created_by  uuid,
  updated_by  uuid,
  deleted_by  uuid,
  deleted_at  timestamptz,
  is_deleted  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, student_id, date)
);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON public.attendance (school_id, date);

CREATE TABLE IF NOT EXISTS public.staff_attendance (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  staff_id    uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  date        date NOT NULL,
  status      public.attendance_status NOT NULL,
  recorded_by uuid,
  remarks     text,
  user_id     uuid,
  created_by  uuid,
  updated_by  uuid,
  deleted_by  uuid,
  deleted_at  timestamptz,
  is_deleted  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, staff_id, date)
);

-- ============================================================================
-- TESTS AND EXAMS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tests (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  test_name  text NOT NULL,
  test_type  public.test_type DEFAULT 'class_test',
  test_date  date,
  class_id   uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  section_id uuid REFERENCES public.sections(id) ON DELETE SET NULL,
  subject_id uuid REFERENCES public.subjects(id) ON DELETE SET NULL,
  max_marks  numeric DEFAULT 100,
  pass_marks numeric DEFAULT 40,
  remarks    text,
  user_id    uuid,
  created_by uuid,
  updated_by uuid,
  deleted_by uuid,
  deleted_at timestamptz,
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.test_marks (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  test_id        uuid NOT NULL REFERENCES public.tests(id) ON DELETE CASCADE,
  student_id     uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  subject_id     uuid REFERENCES public.subjects(id) ON DELETE SET NULL,
  marks_obtained numeric,
  max_marks      numeric,
  grade          text,
  remarks        text,
  entered_by     uuid,
  entered_at     timestamptz NOT NULL DEFAULT now(),
  user_id        uuid,
  created_by     uuid,
  updated_by     uuid,
  deleted_by     uuid,
  deleted_at     timestamptz,
  is_deleted     boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, test_id, student_id, subject_id)
);

CREATE TABLE IF NOT EXISTS public.exams (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year_id uuid REFERENCES public.academic_years(id) ON DELETE SET NULL,
  term_id          uuid REFERENCES public.terms(id) ON DELETE SET NULL,
  name             text NOT NULL,
  start_date       date,
  end_date         date,
  -- Null means results are not yet visible to parents and students.
  results_published_at timestamptz,
  user_id          uuid,
  created_by       uuid,
  updated_by       uuid,
  deleted_by       uuid,
  deleted_at       timestamptz,
  is_deleted       boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.exam_subjects (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  exam_id    uuid NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  max_marks  integer NOT NULL DEFAULT 100,
  pass_marks integer NOT NULL DEFAULT 40,
  user_id    uuid,
  created_by uuid,
  updated_by uuid,
  deleted_by uuid,
  deleted_at timestamptz,
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, exam_id, subject_id)
);

CREATE TABLE IF NOT EXISTS public.marks (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  exam_id        uuid NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  student_id     uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  subject_id     uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  marks_obtained numeric,
  max_marks      numeric,
  grade          text,
  remarks        text,
  entered_by     uuid,
  entered_at     timestamptz NOT NULL DEFAULT now(),
  user_id        uuid,
  created_by     uuid,
  updated_by     uuid,
  deleted_by     uuid,
  deleted_at     timestamptz,
  is_deleted     boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, exam_id, student_id, subject_id)
);
CREATE INDEX IF NOT EXISTS idx_marks_student ON public.marks (school_id, student_id);

CREATE TABLE IF NOT EXISTS public.datesheets (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  exam_id    uuid REFERENCES public.exams(id) ON DELETE SET NULL,
  class_id   uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  section_id uuid REFERENCES public.sections(id) ON DELETE SET NULL,
  subject_id uuid REFERENCES public.subjects(id) ON DELETE SET NULL,
  exam_date  date,
  start_time time,
  end_time   time,
  user_id    uuid,
  created_by uuid,
  updated_by uuid,
  deleted_by uuid,
  deleted_at timestamptz,
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.datesheet_configurations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  config_name   text NOT NULL,
  config_type   text NOT NULL,
  configuration jsonb NOT NULL,
  is_default    boolean DEFAULT false,
  user_id       uuid,
  created_by    uuid,
  updated_by    uuid,
  deleted_by    uuid,
  deleted_at    timestamptz,
  is_deleted    boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, config_name, config_type)
);

-- ============================================================================
-- FEES AND ACCOUNTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.fee_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name        text NOT NULL,
  code        text,
  amount      numeric NOT NULL,
  frequency   text,
  description text,
  status      text DEFAULT 'active',
  user_id     uuid,
  created_by  uuid,
  updated_by  uuid,
  deleted_by  uuid,
  deleted_at  timestamptz,
  is_deleted  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, name)
);

CREATE TABLE IF NOT EXISTS public.fee_challans (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id     uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  challan_number text,
  amount         numeric NOT NULL,
  total_amount   numeric,
  paid_amount    numeric NOT NULL DEFAULT 0,
  due_date       date,
  issued_date    date NOT NULL DEFAULT CURRENT_DATE,
  status         public.challan_status NOT NULL DEFAULT 'open',
  metadata       jsonb NOT NULL DEFAULT '{}'::jsonb,
  user_id        uuid,
  created_by     uuid,
  updated_by     uuid,
  deleted_by     uuid,
  deleted_at     timestamptz,
  is_deleted     boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, challan_number)
);
CREATE INDEX IF NOT EXISTS idx_fee_challans_student ON public.fee_challans (school_id, student_id);
CREATE INDEX IF NOT EXISTS idx_fee_challans_status ON public.fee_challans (school_id, status, due_date);

CREATE TABLE IF NOT EXISTS public.fee_challan_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  challan_id  uuid NOT NULL REFERENCES public.fee_challans(id) ON DELETE CASCADE,
  fee_item_id uuid NOT NULL REFERENCES public.fee_items(id) ON DELETE CASCADE,
  description text,
  amount      numeric,
  user_id     uuid,
  created_by  uuid,
  updated_by  uuid,
  deleted_by  uuid,
  deleted_at  timestamptz,
  is_deleted  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, challan_id, fee_item_id)
);

CREATE TABLE IF NOT EXISTS public.fee_payments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  challan_id  uuid REFERENCES public.fee_challans(id) ON DELETE SET NULL,
  student_id  uuid REFERENCES public.students(id) ON DELETE RESTRICT,
  amount_paid numeric NOT NULL,
  paid_at     timestamptz NOT NULL DEFAULT now(),
  method      public.payment_method NOT NULL DEFAULT 'cash',
  reference   text,
  receipt_no  text,
  received_by uuid,
  user_id     uuid,
  created_by  uuid,
  updated_by  uuid,
  deleted_by  uuid,
  deleted_at  timestamptz,
  is_deleted  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, receipt_no)
);
CREATE INDEX IF NOT EXISTS idx_fee_payments_date ON public.fee_payments (school_id, paid_at);

-- Keep the challan's paid_amount and status in step with its payments.
CREATE OR REPLACE FUNCTION public.recalc_challan_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_challan uuid := COALESCE(NEW.challan_id, OLD.challan_id);
  v_paid  numeric;
  v_total numeric;
  v_due   date;
BEGIN
  IF v_challan IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT COALESCE(SUM(p.amount_paid), 0) INTO v_paid
  FROM public.fee_payments p
  WHERE p.challan_id = v_challan AND p.is_deleted = false;

  SELECT COALESCE(c.total_amount, c.amount), c.due_date INTO v_total, v_due
  FROM public.fee_challans c WHERE c.id = v_challan;

  UPDATE public.fee_challans c
     SET paid_amount = v_paid,
         status = CASE
           WHEN c.status = 'cancelled'                         THEN c.status
           WHEN v_paid >= v_total AND v_total > 0              THEN 'paid'
           WHEN v_paid > 0                                     THEN 'partial'
           WHEN v_due IS NOT NULL AND v_due < CURRENT_DATE     THEN 'overdue'
           ELSE 'open'
         END::public.challan_status,
         updated_at = now()
   WHERE c.id = v_challan;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DO $$ BEGIN
  CREATE TRIGGER trg_fee_payments_recalc
    AFTER INSERT OR UPDATE OR DELETE ON public.fee_payments
    FOR EACH ROW EXECUTE FUNCTION public.recalc_challan_paid();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.expenses (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  expense_date   date NOT NULL DEFAULT CURRENT_DATE,
  title          text NOT NULL,
  category       text,
  amount         numeric NOT NULL,
  payment_method public.payment_method,
  notes          text,
  user_id        uuid,
  created_by     uuid,
  updated_by     uuid,
  deleted_by     uuid,
  deleted_at     timestamptz,
  is_deleted     boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payroll_runs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  run_month  date NOT NULL,
  status     public.payroll_status NOT NULL DEFAULT 'draft',
  user_id    uuid,
  created_by uuid,
  updated_by uuid,
  deleted_by uuid,
  deleted_at timestamptz,
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, run_month)
);

CREATE TABLE IF NOT EXISTS public.payroll_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  payroll_run_id uuid NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
  staff_id       uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  gross_amount   numeric,
  deductions     jsonb,
  net_amount     numeric,
  paid_at        timestamptz,
  user_id        uuid,
  created_by     uuid,
  updated_by     uuid,
  deleted_by     uuid,
  deleted_at     timestamptz,
  is_deleted     boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, payroll_run_id, staff_id)
);

CREATE TABLE IF NOT EXISTS public.salary_payments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  staff_id       uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  payroll_run_id uuid REFERENCES public.payroll_runs(id) ON DELETE SET NULL,
  amount         numeric NOT NULL,
  paid_at        timestamptz NOT NULL DEFAULT now(),
  method         public.payment_method NOT NULL DEFAULT 'cash',
  reference      text,
  user_id        uuid,
  created_by     uuid,
  updated_by     uuid,
  deleted_by     uuid,
  deleted_at     timestamptz,
  is_deleted     boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- LIBRARY
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.books (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  title          text NOT NULL,
  authors        text,
  isbn           text,
  publisher      text,
  published_date date,
  category       text,
  total_copies   integer DEFAULT 1,
  metadata       jsonb NOT NULL DEFAULT '{}'::jsonb,
  user_id        uuid,
  created_by     uuid,
  updated_by     uuid,
  deleted_by     uuid,
  deleted_at     timestamptz,
  is_deleted     boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, isbn)
);

CREATE TABLE IF NOT EXISTS public.book_copies (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  book_id     uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  copy_number integer,
  barcode     text,
  status      text DEFAULT 'available',
  location    text,
  user_id     uuid,
  created_by  uuid,
  updated_by  uuid,
  deleted_by  uuid,
  deleted_at  timestamptz,
  is_deleted  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
-- Scoped to the school, unlike a global UNIQUE (barcode), so two schools can
-- each use their own numbering without colliding.
CREATE UNIQUE INDEX IF NOT EXISTS book_copies_school_barcode_key
  ON public.book_copies (school_id, barcode) WHERE barcode IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.book_loans (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  -- Nullable on purpose: loan history outlives the physical copy, and
  -- NOT NULL with ON DELETE SET NULL would make a lost book undeletable.
  copy_id     uuid REFERENCES public.book_copies(id) ON DELETE SET NULL,
  student_id  uuid REFERENCES public.students(id) ON DELETE CASCADE,
  staff_id    uuid REFERENCES public.staff(id) ON DELETE CASCADE,
  loaned_at   timestamptz NOT NULL DEFAULT now(),
  due_at      timestamptz,
  returned_at timestamptz,
  fine_amount numeric DEFAULT 0,
  status      text DEFAULT 'on_loan',
  user_id     uuid,
  created_by  uuid,
  updated_by  uuid,
  deleted_by  uuid,
  deleted_at  timestamptz,
  is_deleted  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_book_loans_open ON public.book_loans (school_id, returned_at, due_at);

-- ============================================================================
-- TRANSPORT
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.transport_routes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name        text NOT NULL,
  start_point text,
  end_point   text,
  stops       jsonb,
  fare        numeric,
  user_id     uuid,
  created_by  uuid,
  updated_by  uuid,
  deleted_by  uuid,
  deleted_at  timestamptz,
  is_deleted  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, name)
);

CREATE TABLE IF NOT EXISTS public.vehicles (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  registration_no text NOT NULL,
  model           text,
  capacity        integer,
  driver_name     text,
  driver_phone    text,
  user_id         uuid,
  created_by      uuid,
  updated_by      uuid,
  deleted_by      uuid,
  deleted_at      timestamptz,
  is_deleted      boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, registration_no)
);

CREATE TABLE IF NOT EXISTS public.passengers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id    uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id   uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  route_id     uuid REFERENCES public.transport_routes(id) ON DELETE SET NULL,
  vehicle_id   uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  pickup_point text,
  drop_point   text,
  status       text DEFAULT 'active',
  user_id      uuid,
  created_by   uuid,
  updated_by   uuid,
  deleted_by   uuid,
  deleted_at   timestamptz,
  is_deleted   boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
-- One active transport assignment per student. A plain UNIQUE across
-- nullable route_id/vehicle_id would not deduplicate, because NULLs never
-- collide.
CREATE UNIQUE INDEX IF NOT EXISTS passengers_one_active
  ON public.passengers (school_id, student_id) WHERE status = 'active' AND is_deleted = false;

-- ============================================================================
-- FRONT DESK, HR, MISCELLANEOUS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.contacts_directory (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name       text,
  type       text,
  phone      varchar(30),
  email      text,
  address    text,
  notes      text,
  user_id    uuid,
  created_by uuid,
  updated_by uuid,
  deleted_by uuid,
  deleted_at timestamptz,
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.inquiries (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name          text,
  contact_phone varchar(30),
  contact_email text,
  message       text,
  source        text,
  assigned_to   uuid,
  status        text DEFAULT 'open',
  user_id       uuid,
  created_by    uuid,
  updated_by    uuid,
  deleted_by    uuid,
  deleted_at    timestamptz,
  is_deleted    boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.visitors (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name            text,
  phone           varchar(30),
  email           text,
  purpose         text,
  in_time         timestamptz DEFAULT now(),
  out_time        timestamptz,
  host_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  user_id         uuid,
  created_by      uuid,
  updated_by      uuid,
  deleted_by      uuid,
  deleted_at      timestamptz,
  is_deleted      boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.admission_inquiries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  applicant_name  text,
  applicant_phone varchar(30),
  applicant_email text,
  class_id        uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  inquiry_date    date DEFAULT CURRENT_DATE,
  status          text DEFAULT 'open',
  notes           text,
  user_id         uuid,
  created_by      uuid,
  updated_by      uuid,
  deleted_by      uuid,
  deleted_at      timestamptz,
  is_deleted      boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.leave_requests (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  leave_date date NOT NULL,
  reason     text,
  status     public.leave_status NOT NULL DEFAULT 'pending',
  user_id    uuid,
  created_by uuid,
  updated_by uuid,
  deleted_by uuid,
  deleted_at timestamptz,
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id         uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  title             text,
  body              text,
  target_role       text,
  target_profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  delivered         boolean DEFAULT false,
  read_at           timestamptz,
  meta              jsonb NOT NULL DEFAULT '{}'::jsonb,
  user_id           uuid,
  created_by        uuid,
  updated_by        uuid,
  deleted_by        uuid,
  deleted_at        timestamptz,
  is_deleted        boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_target
  ON public.notifications (school_id, target_profile_id, read_at);

CREATE TABLE IF NOT EXISTS public.reports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  report_name     text NOT NULL,
  report_category public.report_category DEFAULT 'other',
  description     text,
  template_file   text,
  user_id         uuid,
  created_by      uuid,
  updated_by      uuid,
  deleted_by      uuid,
  deleted_at      timestamptz,
  is_deleted      boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.report_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  report_name     text NOT NULL,
  report_category public.report_category,
  description     text,
  template_file   text,
  user_id         uuid,
  created_by      uuid,
  updated_by      uuid,
  deleted_by      uuid,
  deleted_at      timestamptz,
  is_deleted      boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.settings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  key         text NOT NULL,
  value       jsonb,
  description text,
  user_id     uuid,
  created_by  uuid,
  updated_by  uuid,
  deleted_by  uuid,
  deleted_at  timestamptz,
  is_deleted  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, key)
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        uuid REFERENCES public.schools(id) ON DELETE SET NULL,
  actor_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action           text NOT NULL,
  target_table     text,
  target_id        text,
  before           jsonb,
  after            jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_school ON public.audit_logs (school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON public.audit_logs (target_table, target_id);

-- The audit table is useless without something writing to it.
CREATE OR REPLACE FUNCTION public.audit_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_before jsonb;
  v_after  jsonb;
BEGIN
  v_before := CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) END;
  v_after  := CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) END;

  INSERT INTO public.audit_logs
    (school_id, actor_profile_id, action, target_table, target_id, before, after)
  VALUES (
    COALESCE((v_after->>'school_id')::uuid, (v_before->>'school_id')::uuid),
    auth.uid(), lower(TG_OP), TG_TABLE_NAME,
    COALESCE(v_after->>'id', v_before->>'id'), v_before, v_after);

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.add_audit_trigger(p_table text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE format(
    'CREATE TRIGGER trg_%1$s_audit AFTER INSERT OR UPDATE OR DELETE ON public.%1$I
       FOR EACH ROW EXECUTE FUNCTION public.audit_row()', p_table);
EXCEPTION WHEN duplicate_object THEN NULL;
END;
$$;

SELECT public.add_audit_trigger(t) FROM unnest(ARRAY[
  'profiles', 'profile_roles', 'roles', 'students', 'staff',
  'marks', 'fee_challans', 'fee_payments', 'school_modules'
]) AS t;

-- ============================================================================
-- VIEWS
-- ============================================================================
-- security_invoker matters: without it a view runs with its owner's rights
-- and hands back rows the caller's policies would have blocked.

CREATE OR REPLACE VIEW public.current_academic_year
WITH (security_invoker = true) AS
SELECT id, school_id, name, start_date, end_date, is_active, created_at
FROM public.academic_years
WHERE is_active = true AND is_deleted = false;

CREATE OR REPLACE VIEW public.fee_types
WITH (security_invoker = true) AS
SELECT id, school_id, user_id,
       name AS fee_name, code AS fee_code,
       amount, frequency, description, status,
       created_by, updated_by, created_at, updated_at
FROM public.fee_items
WHERE is_deleted = false;

-- ============================================================================
-- UPDATED_AT TRIGGERS
-- ============================================================================

SELECT public.add_touch_trigger(t) FROM unnest(ARRAY[
  'plans', 'schools', 'roles', 'profiles', 'sessions', 'academic_years', 'terms',
  'classes', 'sections', 'subjects', 'class_subjects', 'staff', 'students',
  'attendance', 'staff_attendance', 'tests', 'test_marks', 'exams',
  'exam_subjects', 'marks', 'datesheets', 'datesheet_configurations',
  'fee_items', 'fee_challans', 'fee_challan_items', 'fee_payments',
  'expenses', 'payroll_runs', 'payroll_items', 'salary_payments',
  'books', 'book_copies', 'book_loans', 'transport_routes', 'vehicles',
  'passengers', 'contacts_directory', 'inquiries', 'visitors',
  'admission_inquiries', 'leave_requests', 'notifications',
  'reports', 'report_templates', 'settings'
]) AS t;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
-- Without this, school_id is a convention the app honours rather than a
-- boundary the database enforces -- and the Supabase anon key is public, so
-- any signed-in user could read every school's data straight from PostgREST.

ALTER TABLE public.modules         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plans           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_modules    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schools         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_modules  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_roles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_requests  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs      ENABLE ROW LEVEL SECURITY;

-- Catalogues: any signed-in user may read, only platform staff may write.
DO $$ BEGIN
  CREATE POLICY modules_read ON public.modules FOR SELECT TO authenticated USING (true);
  CREATE POLICY modules_write ON public.modules FOR ALL TO authenticated
    USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

  CREATE POLICY plans_read ON public.plans FOR SELECT TO authenticated
    USING (is_public OR public.is_platform_admin());
  CREATE POLICY plans_write ON public.plans FOR ALL TO authenticated
    USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

  CREATE POLICY plan_modules_read ON public.plan_modules FOR SELECT TO authenticated USING (true);
  CREATE POLICY plan_modules_write ON public.plan_modules FOR ALL TO authenticated
    USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

  CREATE POLICY platform_admins_all ON public.platform_admins FOR ALL TO authenticated
    USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Schools: a member sees only their own; only the super admin creates one.
DO $$ BEGIN
  CREATE POLICY schools_select ON public.schools FOR SELECT TO authenticated
    USING (public.is_platform_admin() OR id = public.current_school_id());
  CREATE POLICY schools_update ON public.schools FOR UPDATE TO authenticated
    USING (public.is_platform_admin()
           OR (id = public.current_school_id() AND public.has_permission('core.settings.write')))
    WITH CHECK (public.is_platform_admin()
           OR (id = public.current_school_id() AND public.has_permission('core.settings.write')));
  CREATE POLICY schools_insert ON public.schools FOR INSERT TO authenticated
    WITH CHECK (public.is_platform_admin());
  CREATE POLICY schools_delete ON public.schools FOR DELETE TO authenticated
    USING (public.is_platform_admin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- The module gate: a school may READ what it has been given, only the super
-- admin may CHANGE it. This is what stops a school switching itself on.
DO $$ BEGIN
  CREATE POLICY school_modules_select ON public.school_modules FOR SELECT TO authenticated
    USING (public.is_platform_admin() OR school_id = public.current_school_id());
  CREATE POLICY school_modules_write ON public.school_modules FOR ALL TO authenticated
    USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Roles: system templates are visible to everyone, school roles only to that
-- school, and a school can never edit a system template.
DO $$ BEGIN
  CREATE POLICY roles_select ON public.roles FOR SELECT TO authenticated
    USING (school_id IS NULL OR school_id = public.current_school_id()
           OR public.is_platform_admin());
  CREATE POLICY roles_write ON public.roles FOR ALL TO authenticated
    USING (school_id = public.current_school_id() AND is_system = false
           AND public.has_permission('users.roles.write'))
    WITH CHECK (school_id = public.current_school_id() AND is_system = false
           AND public.has_permission('users.roles.write'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Profiles: yourself always; colleagues only if you may manage users.
DO $$ BEGIN
  CREATE POLICY profiles_select_self ON public.profiles FOR SELECT TO authenticated
    USING (id = auth.uid() OR public.is_platform_admin());
  CREATE POLICY profiles_select_school ON public.profiles FOR SELECT TO authenticated
    USING (school_id = public.current_school_id() AND public.has_permission('users.read'));
  CREATE POLICY profiles_update_self ON public.profiles FOR UPDATE TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid() AND status = 'active' AND is_deleted = false);
  CREATE POLICY profiles_manage ON public.profiles FOR ALL TO authenticated
    USING (public.is_platform_admin()
           OR (school_id = public.current_school_id() AND public.has_permission('users.write')))
    WITH CHECK (public.is_platform_admin()
           OR (school_id = public.current_school_id() AND public.has_permission('users.write')));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY profile_roles_select ON public.profile_roles FOR SELECT TO authenticated
    USING (profile_id = auth.uid()
           OR (school_id = public.current_school_id() AND public.has_permission('users.read')));
  CREATE POLICY profile_roles_write ON public.profile_roles FOR ALL TO authenticated
    USING (school_id = public.current_school_id() AND public.has_permission('users.roles.write'))
    WITH CHECK (school_id = public.current_school_id() AND public.has_permission('users.roles.write'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Settings are read by everyone in the school -- the app needs them to render
-- at all -- but written only with the settings permission.
DO $$ BEGIN
  CREATE POLICY settings_select ON public.settings FOR SELECT TO authenticated
    USING (public.is_platform_admin() OR school_id = public.current_school_id());
  CREATE POLICY settings_write ON public.settings FOR ALL TO authenticated
    USING (school_id = public.current_school_id() AND public.has_permission('core.settings.write'))
    WITH CHECK (school_id = public.current_school_id() AND public.has_permission('core.settings.write'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Notifications: yours, or the school's broadcasts.
DO $$ BEGIN
  CREATE POLICY notifications_select ON public.notifications FOR SELECT TO authenticated
    USING (school_id = public.current_school_id()
           AND (target_profile_id IS NULL OR target_profile_id = auth.uid()
                OR public.has_permission('notifications.write')));
  CREATE POLICY notifications_update_own ON public.notifications FOR UPDATE TO authenticated
    USING (target_profile_id = auth.uid()) WITH CHECK (target_profile_id = auth.uid());
  CREATE POLICY notifications_write ON public.notifications FOR ALL TO authenticated
    USING (school_id = public.current_school_id() AND public.has_permission('notifications.write'))
    WITH CHECK (school_id = public.current_school_id() AND public.has_permission('notifications.write'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Leave: anyone may file and see their own; approvers need the permission.
DO $$ BEGIN
  CREATE POLICY leave_select ON public.leave_requests FOR SELECT TO authenticated
    USING (school_id = public.current_school_id()
           AND (profile_id = auth.uid() OR public.has_permission('hr.read')));
  CREATE POLICY leave_insert_own ON public.leave_requests FOR INSERT TO authenticated
    WITH CHECK (school_id = public.current_school_id() AND profile_id = auth.uid());
  CREATE POLICY leave_manage ON public.leave_requests FOR ALL TO authenticated
    USING (school_id = public.current_school_id() AND public.has_permission('hr.write'))
    WITH CHECK (school_id = public.current_school_id() AND public.has_permission('hr.write'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Audit log is read-only to everyone. Only the SECURITY DEFINER trigger writes.
DO $$ BEGIN
  CREATE POLICY audit_logs_select ON public.audit_logs FOR SELECT TO authenticated
    USING (public.is_platform_admin()
           OR (school_id = public.current_school_id() AND public.has_permission('core.audit.read')));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ----------------------------------------------------------------------------
-- The standard policy set, one call per remaining tenant table
-- ----------------------------------------------------------------------------
SELECT public.apply_tenant_rls(t[1], t[2], t[3])
FROM (VALUES
  (ARRAY['sessions',                 'academics.read',   'academics.write']),
  (ARRAY['academic_years',           'academics.read',   'academics.write']),
  (ARRAY['terms',                    'academics.read',   'academics.write']),
  (ARRAY['classes',                  'academics.read',   'academics.write']),
  (ARRAY['sections',                 'academics.read',   'academics.write']),
  (ARRAY['subjects',                 'academics.read',   'academics.write']),
  (ARRAY['class_subjects',           'academics.read',   'academics.write']),
  (ARRAY['staff',                    'staff.read',       'staff.write']),
  (ARRAY['students',                 'students.read',    'students.write']),
  (ARRAY['attendance',               'attendance.read',  'attendance.write']),
  (ARRAY['staff_attendance',         'attendance.read',  'attendance.write']),
  (ARRAY['tests',                    'tests.read',       'tests.write']),
  (ARRAY['test_marks',               'tests.read',       'tests.write']),
  (ARRAY['exams',                    'exams.read',       'exams.write']),
  (ARRAY['exam_subjects',            'exams.read',       'exams.write']),
  (ARRAY['marks',                    'exams.read',       'exams.write']),
  (ARRAY['datesheets',               'exams.read',       'exams.write']),
  (ARRAY['datesheet_configurations', 'exams.read',       'exams.write']),
  (ARRAY['fee_items',                'fees.read',        'fees.write']),
  (ARRAY['fee_challans',             'fees.read',        'fees.write']),
  (ARRAY['fee_challan_items',        'fees.read',        'fees.write']),
  (ARRAY['fee_payments',             'fees.read',        'fees.write']),
  (ARRAY['expenses',                 'accounts.read',    'accounts.write']),
  (ARRAY['salary_payments',          'accounts.read',    'accounts.write']),
  (ARRAY['payroll_runs',             'payroll.read',     'payroll.write']),
  (ARRAY['payroll_items',            'payroll.read',     'payroll.write']),
  (ARRAY['books',                    'library.read',     'library.write']),
  (ARRAY['book_copies',              'library.read',     'library.write']),
  (ARRAY['book_loans',               'library.read',     'library.write']),
  (ARRAY['transport_routes',         'transport.read',   'transport.write']),
  (ARRAY['vehicles',                 'transport.read',   'transport.write']),
  (ARRAY['passengers',               'transport.read',   'transport.write']),
  (ARRAY['contacts_directory',       'frontdesk.read',   'frontdesk.write']),
  (ARRAY['inquiries',                'frontdesk.read',   'frontdesk.write']),
  (ARRAY['visitors',                 'frontdesk.read',   'frontdesk.write']),
  (ARRAY['admission_inquiries',      'admissions.read',  'admissions.write']),
  (ARRAY['reports',                  'reports.read',     'reports.write']),
  (ARRAY['report_templates',         'reports.read',     'reports.write'])
) AS v(t);

-- ============================================================================
-- CATALOGUE SEED
-- ============================================================================
-- One module per feature area. A permission code's module is the text before
-- its first dot, so 'library.write' is gated by the 'library' module.

INSERT INTO public.modules (code, name, category, is_core, sort_order, description) VALUES
  ('core',          'Core',               'platform',   true,  10,  'School profile, settings, sessions'),
  ('users',         'Users & Roles',      'platform',   true,  20,  'Users, roles, permissions'),
  ('students',      'Students',           'academic',   false, 30,  'Student records'),
  ('staff',         'Staff',              'hr',         false, 40,  'Employee records and directory'),
  ('academics',     'Classes & Subjects', 'academic',   false, 50,  'Classes, sections, subjects, academic years'),
  ('attendance',    'Attendance',         'academic',   false, 60,  'Student and staff registers'),
  ('tests',         'Tests',              'academic',   false, 70,  'Class tests, quizzes and marks'),
  ('exams',         'Exams & Results',    'academic',   false, 80,  'Exams, datesheets, marks, results'),
  ('fees',          'Fees',               'finance',    false, 90,  'Fee items, challans, payments'),
  ('accounts',      'Accounts',           'finance',    false, 100, 'Expenses and salary payments'),
  ('payroll',       'Payroll',            'finance',    false, 110, 'Payroll runs and payslips'),
  ('library',       'Library',            'operations', false, 120, 'Books, copies, loans, fines'),
  ('transport',     'Transport',          'operations', false, 130, 'Routes, vehicles, passengers'),
  ('frontdesk',     'Front Desk',         'operations', false, 140, 'Visitors, inquiries, contacts'),
  ('admissions',    'Admissions',         'operations', false, 150, 'Admission inquiries'),
  ('hr',            'Leave Management',   'hr',         false, 160, 'Leave requests and approvals'),
  ('notifications', 'Notifications',      'general',    false, 170, 'In-app and broadcast notices'),
  ('reports',       'Reports',            'general',    false, 180, 'Report templates and exports')
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name, category = EXCLUDED.category, is_core = EXCLUDED.is_core,
      sort_order = EXCLUDED.sort_order, description = EXCLUDED.description;

INSERT INTO public.plans (code, name, price, sort_order) VALUES
  ('basic',    'Basic',    0,     10),
  ('standard', 'Standard', 5000,  20),
  ('complete', 'Complete', 12000, 30)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.plan_modules (plan_id, module_code)
SELECT p.id, m.code FROM public.plans p CROSS JOIN public.modules m
WHERE p.code = 'basic'
  AND m.code IN ('core','users','students','staff','academics','attendance','notifications')
ON CONFLICT DO NOTHING;

INSERT INTO public.plan_modules (plan_id, module_code)
SELECT p.id, m.code FROM public.plans p CROSS JOIN public.modules m
WHERE p.code = 'standard'
  AND m.code IN ('core','users','students','staff','academics','attendance',
                 'tests','exams','fees','notifications','reports')
ON CONFLICT DO NOTHING;

INSERT INTO public.plan_modules (plan_id, module_code)
SELECT p.id, m.code FROM public.plans p CROSS JOIN public.modules m
WHERE p.code = 'complete'
ON CONFLICT DO NOTHING;

-- System roles: school_id NULL means every school shares them and no school
-- can edit them.
INSERT INTO public.roles (school_id, name, display_name, is_system, description, permissions) VALUES
  (NULL, 'admin', 'School Administrator', true, 'Full control of one school',
   '["core.settings.write","core.audit.read","users.read","users.write","users.roles.write",
     "students.read","students.write","staff.read","staff.write",
     "academics.read","academics.write","attendance.read","attendance.write",
     "tests.read","tests.write","exams.read","exams.write","exams.publish",
     "fees.read","fees.write","accounts.read","accounts.write",
     "payroll.read","payroll.write","library.read","library.write",
     "transport.read","transport.write","frontdesk.read","frontdesk.write",
     "admissions.read","admissions.write","hr.read","hr.write",
     "notifications.read","notifications.write","reports.read","reports.write"]'::jsonb),

  (NULL, 'principal', 'Principal', true, 'Oversight across the school',
   '["core.audit.read","users.read","students.read","staff.read","academics.read",
     "attendance.read","tests.read","exams.read","exams.publish","fees.read",
     "accounts.read","library.read","transport.read","frontdesk.read",
     "admissions.read","hr.read","hr.write","notifications.read",
     "notifications.write","reports.read"]'::jsonb),

  (NULL, 'teacher', 'Teacher', true, 'Own classes, attendance and marks',
   '["students.read","academics.read","attendance.read","attendance.write",
     "tests.read","tests.write","exams.read","exams.write",
     "notifications.read","reports.read"]'::jsonb),

  (NULL, 'accountant', 'Accountant', true, 'Fees, payments and payroll',
   '["students.read","staff.read","fees.read","fees.write","accounts.read",
     "accounts.write","payroll.read","payroll.write","notifications.read",
     "reports.read"]'::jsonb),

  (NULL, 'librarian', 'Librarian', true, 'Library catalogue and loans',
   '["students.read","staff.read","library.read","library.write",
     "notifications.read"]'::jsonb),

  (NULL, 'receptionist', 'Receptionist', true, 'Front desk and admissions',
   '["students.read","staff.read","attendance.read","frontdesk.read",
     "frontdesk.write","admissions.read","admissions.write",
     "notifications.read"]'::jsonb)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- SUPER-ADMIN RPCs
-- ============================================================================

-- Onboard a school and switch on its plan's modules.
CREATE OR REPLACE FUNCTION public.provision_school(
  p_school_name text,
  p_slug        text,
  p_plan_code   text DEFAULT 'basic',
  p_is_demo     boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_school uuid;
  v_plan   uuid;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'only platform admins may provision schools'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT id INTO v_plan FROM public.plans WHERE code = p_plan_code;
  IF v_plan IS NULL THEN
    RAISE EXCEPTION 'unknown plan %', p_plan_code;
  END IF;

  INSERT INTO public.schools (school_name, slug, short_code, plan_id, is_demo, created_by)
  VALUES (p_school_name, p_slug, upper(left(p_slug, 8)), v_plan, p_is_demo, auth.uid())
  RETURNING id INTO v_school;

  INSERT INTO public.school_modules (school_id, module_code, enabled_by)
  SELECT v_school, pm.module_code, auth.uid()
  FROM public.plan_modules pm WHERE pm.plan_id = v_plan
  ON CONFLICT DO NOTHING;

  RETURN v_school;
END;
$$;

-- The switch behind the panel's toggle:
--   SELECT public.set_school_module('<school-a>', 'library', true);
--   SELECT public.set_school_module('<school-b>', 'library', false);
CREATE OR REPLACE FUNCTION public.set_school_module(
  p_school  uuid,
  p_module  text,
  p_enabled boolean,
  p_expires timestamptz DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'only platform admins may change modules'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF (SELECT is_core FROM public.modules WHERE code = p_module) AND NOT p_enabled THEN
    RAISE EXCEPTION 'module % is core and cannot be disabled', p_module;
  END IF;

  INSERT INTO public.school_modules (school_id, module_code, is_enabled, expires_at, enabled_by)
  VALUES (p_school, p_module, p_enabled, p_expires, auth.uid())
  ON CONFLICT (school_id, module_code) DO UPDATE
    SET is_enabled = EXCLUDED.is_enabled,
        expires_at = EXCLUDED.expires_at,
        enabled_by = EXCLUDED.enabled_by,
        enabled_at = now();
END;
$$;

-- Move a school onto a plan: everything in the plan on, everything else off.
CREATE OR REPLACE FUNCTION public.apply_plan_to_school(p_school uuid, p_plan_code text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_plan uuid;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'only platform admins may change plans'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT id INTO v_plan FROM public.plans WHERE code = p_plan_code;
  IF v_plan IS NULL THEN
    RAISE EXCEPTION 'unknown plan %', p_plan_code;
  END IF;

  UPDATE public.school_modules sm
     SET is_enabled = false, enabled_at = now(), enabled_by = auth.uid()
   WHERE sm.school_id = p_school
     AND sm.module_code NOT IN (SELECT module_code FROM public.plan_modules WHERE plan_id = v_plan)
     AND sm.module_code NOT IN (SELECT code FROM public.modules WHERE is_core);

  INSERT INTO public.school_modules (school_id, module_code, is_enabled, enabled_by)
  SELECT p_school, pm.module_code, true, auth.uid()
  FROM public.plan_modules pm WHERE pm.plan_id = v_plan
  ON CONFLICT (school_id, module_code) DO UPDATE
    SET is_enabled = true, enabled_at = now(), enabled_by = auth.uid();

  UPDATE public.schools SET plan_id = v_plan WHERE id = p_school;
END;
$$;

-- Put a signed-up user into a school with a role. The super admin uses this
-- to seat a school's first administrator; that administrator then uses it
-- for their own staff.
CREATE OR REPLACE FUNCTION public.assign_user_to_school(
  p_user      uuid,
  p_school    uuid,
  p_role_name text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role bigint;
BEGIN
  IF NOT (public.is_platform_admin()
          OR (p_school = public.current_school_id() AND public.has_permission('users.write'))) THEN
    RAISE EXCEPTION 'not allowed to manage users for this school'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT id INTO v_role FROM public.roles
  WHERE name = p_role_name AND (school_id = p_school OR school_id IS NULL)
  ORDER BY school_id NULLS LAST
  LIMIT 1;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'unknown role %', p_role_name;
  END IF;

  UPDATE public.profiles
     SET school_id = p_school, status = 'active', updated_at = now()
   WHERE id = p_user;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no profile for user % -- they must sign up first', p_user;
  END IF;

  INSERT INTO public.profile_roles (school_id, profile_id, role_id, assigned_by)
  VALUES (p_school, p_user, v_role, auth.uid())
  ON CONFLICT (school_id, profile_id, role_id) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION
  public.provision_school(text, text, text, boolean),
  public.set_school_module(uuid, text, boolean, timestamptz),
  public.apply_plan_to_school(uuid, text),
  public.assign_user_to_school(uuid, uuid, text)
  TO authenticated;

-- ============================================================================
-- SAFETY NET
-- ============================================================================
-- Refuse to finish quietly if any table was left without RLS. Adding a table
-- later without a policy is the classic way a multi-tenant system springs a
-- leak, so this fails loudly instead.

DO $$
DECLARE
  v_unprotected text;
BEGIN
  SELECT string_agg(c.relname, ', ') INTO v_unprotected
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = false;

  IF v_unprotected IS NOT NULL THEN
    RAISE EXCEPTION 'RLS is not enabled on: %', v_unprotected;
  END IF;

  RAISE NOTICE '----------------------------------------------------------';
  RAISE NOTICE 'Schema installed. % tables, all with RLS. % modules seeded.',
    (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'),
    (SELECT count(*) FROM public.modules);
  RAISE NOTICE 'Next: enable the access token hook, add yourself to';
  RAISE NOTICE 'platform_admins, then SELECT provision_school(...).';
  RAISE NOTICE '----------------------------------------------------------';
END;
$$;
