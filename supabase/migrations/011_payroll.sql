-- ============================================================================
-- 011_PAYROLL.sql -- run after 010_fees.sql
-- ============================================================================
-- Paste the whole file into the SQL editor and Run. Idempotent.
--
-- WHAT THIS ADDS AND WHY
--
-- The distinction this file exists to make: a SALARY STRUCTURE is a template
-- for a designation, a STAFF SALARY is one employee's actual package, and a
-- PAYROLL ITEM is a frozen snapshot of what they were paid in one month.
-- Collapsing any two of those is how a school ends up unable to answer
-- "why was March different from February".
--
-- 1. salary_structures gains the named allowance columns the form shows.
--    The table already had allowances/deductions as jsonb, which is right for
--    arbitrary extras and wrong for the five fields every Pakistani payslip
--    has -- a jsonb key cannot be summed in SQL without casting every row.
--
-- 2. staff_salaries -- what payroll actually pays. Two teachers on the same
--    designation routinely earn different amounts; a template cannot hold
--    that, and overwriting the template to raise one person's pay would
--    silently raise everyone's.
--
-- 3. payroll_runs gains working_days and the approval trail. The working-day
--    count is SNAPSHOTTED at generation: adding a holiday in April must not
--    retroactively change what March paid.
--
-- 4. payroll_items gains the attendance counts and the per-employee status.
--    Everything here is a frozen number, not a join -- a payslip reprinted in
--    December must show the figures December's payslip showed.
--
-- 5. payroll_settings -- how this school counts a working day and what an
--    absence costs. One row per school.
--
-- 6. payroll_holidays -- days the school was shut, so nobody is marked absent
--    for Eid.
--
-- 7. expenses gains the voucher trail: vendor, bill number, approval state.
--    Note expenses stays gated on accounts.read / accounts.write, which is
--    where schema.sql put it -- the screen lives under Payroll in the
--    sidebar, but the permission is unchanged.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Salary structure templates
-- ----------------------------------------------------------------------------
ALTER TABLE public.salary_structures
  ADD COLUMN IF NOT EXISTS grade                  text,
  ADD COLUMN IF NOT EXISTS house_allowance        numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS medical_allowance      numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS conveyance_allowance   numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS special_allowance      numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_deductions       numeric NOT NULL DEFAULT 0;


-- ----------------------------------------------------------------------------
-- 2. One employee's actual package
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.staff_salaries (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id            uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  staff_id             uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  -- Which template this was copied from, for the record only. Editing the
  -- template afterwards does not reach back into the package.
  structure_id         uuid REFERENCES public.salary_structures(id) ON DELETE SET NULL,

  basic_salary         numeric NOT NULL DEFAULT 0,
  house_allowance      numeric NOT NULL DEFAULT 0,
  medical_allowance    numeric NOT NULL DEFAULT 0,
  conveyance_allowance numeric NOT NULL DEFAULT 0,
  special_allowance    numeric NOT NULL DEFAULT 0,
  other_allowances     numeric NOT NULL DEFAULT 0,
  other_deductions     numeric NOT NULL DEFAULT 0,

  -- Statutory deductions apply per employee, not per school: a part-timer is
  -- usually outside EOBI while the full-time staff are inside it.
  eobi_applicable      boolean NOT NULL DEFAULT false,
  pf_applicable        boolean NOT NULL DEFAULT false,
  tax_annual           numeric NOT NULL DEFAULT 0,

  bank_name            text,
  account_no           text,
  payment_mode         text NOT NULL DEFAULT 'bank_transfer',
  effective_from       date NOT NULL DEFAULT CURRENT_DATE,
  status               text NOT NULL DEFAULT 'active',
  notes                text,
  user_id              uuid,
  created_by           uuid,
  updated_by           uuid,
  deleted_by           uuid,
  deleted_at           timestamptz,
  is_deleted           boolean NOT NULL DEFAULT false,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, staff_id)
);
CREATE INDEX IF NOT EXISTS idx_staff_salaries_staff
  ON public.staff_salaries (school_id, staff_id);


-- ----------------------------------------------------------------------------
-- 3. The monthly run
-- ----------------------------------------------------------------------------
-- status is the existing payroll_status enum
-- (draft / finalized / paid / cancelled). The UI calls 'finalized' Approved;
-- adding an 'approved' value would need ALTER TYPE, which cannot run in the
-- SQL editor's transaction block.
ALTER TABLE public.payroll_runs
  ADD COLUMN IF NOT EXISTS working_days smallint,
  ADD COLUMN IF NOT EXISTS generated_by uuid,
  ADD COLUMN IF NOT EXISTS generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by  uuid,
  ADD COLUMN IF NOT EXISTS approved_at  timestamptz,
  ADD COLUMN IF NOT EXISTS paid_at      timestamptz,
  ADD COLUMN IF NOT EXISTS notes        text;


-- ----------------------------------------------------------------------------
-- 4. One employee's month
-- ----------------------------------------------------------------------------
ALTER TABLE public.payroll_items
  ADD COLUMN IF NOT EXISTS basic_salary     numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS allowances       numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS working_days     smallint,
  ADD COLUMN IF NOT EXISTS present_days     numeric,
  ADD COLUMN IF NOT EXISTS absent_days      numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS leave_days       numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS half_days        numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS late_marks       smallint NOT NULL DEFAULT 0,
  -- The jsonb `deductions` column stays as the itemised breakdown; this is
  -- the single figure the payslip subtracts and the reports sum.
  ADD COLUMN IF NOT EXISTS deduction_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS absence_amount   numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS eobi_amount      numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pf_amount        numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_amount       numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_mode     text,
  ADD COLUMN IF NOT EXISTS paid_reference   text,
  ADD COLUMN IF NOT EXISTS status           text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS remarks          text;

ALTER TABLE public.payroll_items DROP CONSTRAINT IF EXISTS payroll_items_status_check;
ALTER TABLE public.payroll_items
  ADD CONSTRAINT payroll_items_status_check
  CHECK (status IN ('draft', 'approved', 'paid', 'hold'));

CREATE INDEX IF NOT EXISTS idx_payroll_items_run
  ON public.payroll_items (school_id, payroll_run_id, status);


-- ----------------------------------------------------------------------------
-- 5. How this school counts a month
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payroll_settings (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id           uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,

  -- 'calendar' = month days minus weekly offs and holidays.
  -- 'fixed'    = the same denominator every month, whatever the calendar says.
  working_days_mode   text NOT NULL DEFAULT 'calendar',
  fixed_working_days  smallint NOT NULL DEFAULT 26,
  -- ISO day numbers, matching periods.day_of_week: 1 = Monday ... 7 = Sunday.
  weekly_offs         smallint[] NOT NULL DEFAULT ARRAY[7]::smallint[],

  deduct_absences     boolean NOT NULL DEFAULT true,
  -- 'gross' or 'basic'. Gross is the common choice; basic is more lenient.
  deduct_from         text NOT NULL DEFAULT 'gross',
  half_day_fraction   numeric NOT NULL DEFAULT 0.5,
  -- 0 disables late deductions entirely.
  late_marks_per_day  smallint NOT NULL DEFAULT 3,

  eobi_enabled        boolean NOT NULL DEFAULT false,
  eobi_amount         numeric NOT NULL DEFAULT 0,
  pf_enabled          boolean NOT NULL DEFAULT false,
  pf_percent          numeric NOT NULL DEFAULT 0,
  tax_enabled         boolean NOT NULL DEFAULT false,

  default_payment_mode text NOT NULL DEFAULT 'bank_transfer',
  cutoff_day          smallint NOT NULL DEFAULT 25,

  updated_by          uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id)
);

ALTER TABLE public.payroll_settings DROP CONSTRAINT IF EXISTS payroll_settings_mode_check;
ALTER TABLE public.payroll_settings
  ADD CONSTRAINT payroll_settings_mode_check
  CHECK (working_days_mode IN ('calendar', 'fixed'));

ALTER TABLE public.payroll_settings DROP CONSTRAINT IF EXISTS payroll_settings_deduct_check;
ALTER TABLE public.payroll_settings
  ADD CONSTRAINT payroll_settings_deduct_check
  CHECK (deduct_from IN ('gross', 'basic'));


-- ----------------------------------------------------------------------------
-- 5b. Paid vs unpaid leave
-- ----------------------------------------------------------------------------
-- staff_attendance can already say someone was on leave; it cannot say whether
-- that leave costs them anything. Without this, payroll has to choose between
-- docking every leave (wrong for annual leave) and docking none (wrong for
-- unpaid leave), and a school needs both.
--
-- Default true: a leave is paid unless somebody says otherwise, which is the
-- safer direction to be wrong in.
ALTER TABLE public.staff_attendance
  ADD COLUMN IF NOT EXISTS is_paid_leave boolean NOT NULL DEFAULT true;


-- ----------------------------------------------------------------------------
-- 6. Days the school was shut
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payroll_holidays (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id    uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  holiday_date date NOT NULL,
  name         text NOT NULL,
  created_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, holiday_date)
);
CREATE INDEX IF NOT EXISTS idx_payroll_holidays_year
  ON public.payroll_holidays (school_id, holiday_date);


-- ----------------------------------------------------------------------------
-- 7. Non-salary spending
-- ----------------------------------------------------------------------------
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS vendor      text,
  ADD COLUMN IF NOT EXISTS paid_to     text,
  ADD COLUMN IF NOT EXISTS bill_no     text,
  ADD COLUMN IF NOT EXISTS voucher_no  text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS status      text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS paid_at     timestamptz;

ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_status_check;
ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_status_check
  CHECK (status IN ('pending', 'approved', 'paid', 'rejected'));

CREATE UNIQUE INDEX IF NOT EXISTS expenses_school_voucher_key
  ON public.expenses (school_id, voucher_no) WHERE voucher_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_status
  ON public.expenses (school_id, status, expense_date);

-- Voucher numbers, counted in the database for the same reason challan
-- numbers are.
CREATE OR REPLACE FUNCTION public.next_voucher_number(p_school uuid, p_prefix text DEFAULT 'EXP')
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_year text := to_char(CURRENT_DATE, 'YYYY');
  v_next integer;
BEGIN
  SELECT COALESCE(MAX(NULLIF(regexp_replace(voucher_no, '^.*-', ''), '')::integer), 0) + 1
    INTO v_next
    FROM public.expenses
   WHERE school_id = p_school
     AND voucher_no LIKE p_prefix || '-' || v_year || '-%';

  RETURN p_prefix || '-' || v_year || '-' || lpad(v_next::text, 4, '0');
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.next_voucher_number(uuid, text) TO authenticated;


-- ----------------------------------------------------------------------------
-- 8. Working days for one month
-- ----------------------------------------------------------------------------
-- The denominator every per-day rate divides by. In the database because it
-- has to agree with itself across the generator, the payslip and the reports,
-- and because only the database can see the holiday table and the settings
-- row in one pass.
CREATE OR REPLACE FUNCTION public.payroll_working_days(p_school uuid, p_month date)
RETURNS smallint
LANGUAGE plpgsql
STABLE
SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_mode      text;
  v_fixed     smallint;
  v_offs      smallint[];
  v_start     date := date_trunc('month', p_month)::date;
  v_end       date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  v_count     smallint;
BEGIN
  SELECT working_days_mode, fixed_working_days, weekly_offs
    INTO v_mode, v_fixed, v_offs
    FROM public.payroll_settings
   WHERE school_id = p_school;

  -- No settings row yet: the sane default is a calendar month minus Sundays.
  IF v_mode IS NULL THEN
    v_mode  := 'calendar';
    v_offs  := ARRAY[7]::smallint[];
  END IF;

  IF v_mode = 'fixed' THEN
    RETURN COALESCE(v_fixed, 26);
  END IF;

  SELECT count(*)::smallint INTO v_count
    FROM generate_series(v_start, v_end, interval '1 day') AS d(day)
   WHERE NOT (EXTRACT(isodow FROM d.day)::smallint = ANY (v_offs))
     AND NOT EXISTS (
           SELECT 1 FROM public.payroll_holidays h
            WHERE h.school_id = p_school AND h.holiday_date = d.day::date
         );

  RETURN v_count;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.payroll_working_days(uuid, date) TO authenticated;


-- ----------------------------------------------------------------------------
-- 9. Row level security and triggers
-- ----------------------------------------------------------------------------
SELECT public.apply_tenant_rls('staff_salaries',   'payroll.read', 'payroll.write');
SELECT public.apply_tenant_rls('payroll_settings', 'payroll.read', 'payroll.write');
SELECT public.apply_tenant_rls('payroll_holidays', 'payroll.read', 'payroll.write');

SELECT public.add_touch_trigger('staff_salaries');
SELECT public.add_touch_trigger('payroll_settings');
SELECT public.add_touch_trigger('payroll_holidays');

SELECT public.add_audit_trigger('staff_salaries');
SELECT public.add_audit_trigger('payroll_runs');
SELECT public.add_audit_trigger('expenses');


DO $report$
BEGIN
  RAISE NOTICE '----------------------------------------------------------';
  RAISE NOTICE 'Payroll installed.';
  RAISE NOTICE '  salary structures: %', (SELECT count(*) FROM public.salary_structures);
  RAISE NOTICE '  staff salaries:    %', (SELECT count(*) FROM public.staff_salaries);
  RAISE NOTICE '  payroll runs:      %', (SELECT count(*) FROM public.payroll_runs);
  RAISE NOTICE '  expenses:          %', (SELECT count(*) FROM public.expenses);
  RAISE NOTICE '----------------------------------------------------------';
END
$report$;
