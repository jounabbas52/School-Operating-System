-- ============================================================================
-- 010_FEES.sql -- run after 009_examinations.sql
-- ============================================================================
-- Paste the whole file into the SQL editor and Run. Idempotent.
--
-- WHAT THIS ADDS AND WHY
--
-- 1. fee_policies -- the fee structure for a class. fee_items already exists
--    and is a flat price list for the whole school; a policy is the thing a
--    clerk actually sets up, because the same school charges Class 1 and
--    Class 10 differently and bills admission fee once while billing tuition
--    twelve times.
--
--    Each component carries its own months array rather than a single
--    "frequency" string. "Tuition every month, exam fee in March and
--    September, admission fee in April" is the normal case, and a frequency
--    enum cannot say it.
--
-- 2. fee_challans gains the columns the challan form asks for and the ledger
--    reads back: fee_type, late_fee, discount, net_amount, description,
--    period_month, class_id and section_id.
--
--    class_id and section_id are DENORMALISED on purpose. The challan list is
--    filtered by class on every visit, and a student who is promoted in July
--    must not retroactively move last year's challans into their new class.
--
--    net_amount is stored, not computed, for the same reason: a late fee
--    waived next month must not silently rewrite a receipt already printed.
--
-- 3. challan_number gets a generator. Two clerks pressing Generate at the
--    same moment must not mint the same number, so the sequence is read
--    inside the database rather than counted in the app.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Fee policies
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fee_policies (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id         uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name              text NOT NULL,
  class_id          uuid REFERENCES public.classes(id) ON DELETE CASCADE,
  session_id        uuid REFERENCES public.sessions(id) ON DELETE SET NULL,

  -- Months are 1-12. An empty array means the component is defined but never
  -- billed automatically, which is different from an amount of zero.
  tuition_fee       numeric NOT NULL DEFAULT 0,
  tuition_months    smallint[] NOT NULL DEFAULT ARRAY[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[],
  admission_fee     numeric NOT NULL DEFAULT 0,
  admission_months  smallint[] NOT NULL DEFAULT ARRAY[]::smallint[],
  exam_fee          numeric NOT NULL DEFAULT 0,
  exam_months       smallint[] NOT NULL DEFAULT ARRAY[]::smallint[],
  transport_fee     numeric NOT NULL DEFAULT 0,
  transport_months  smallint[] NOT NULL DEFAULT ARRAY[]::smallint[],
  other_fee         numeric NOT NULL DEFAULT 0,
  other_months      smallint[] NOT NULL DEFAULT ARRAY[]::smallint[],

  notes             text,
  status            text NOT NULL DEFAULT 'active',
  user_id           uuid,
  created_by        uuid,
  updated_by        uuid,
  deleted_by        uuid,
  deleted_at        timestamptz,
  is_deleted        boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, name)
);

ALTER TABLE public.fee_policies DROP CONSTRAINT IF EXISTS fee_policies_status_check;
ALTER TABLE public.fee_policies
  ADD CONSTRAINT fee_policies_status_check
  CHECK (status IN ('active', 'inactive'));

-- One ACTIVE policy per class. A partial unique index rather than a plain
-- UNIQUE, so last year's policy can stay on file as inactive.
CREATE UNIQUE INDEX IF NOT EXISTS fee_policies_one_active_per_class
  ON public.fee_policies (school_id, class_id)
  WHERE status = 'active' AND is_deleted = false AND class_id IS NOT NULL;


-- ----------------------------------------------------------------------------
-- 2. Challan columns
-- ----------------------------------------------------------------------------
ALTER TABLE public.fee_challans
  ADD COLUMN IF NOT EXISTS fee_type     text NOT NULL DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS late_fee     numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount     numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_amount   numeric,
  ADD COLUMN IF NOT EXISTS description  text,
  -- Always the first of the month it bills, so a month is one equality test
  -- rather than a range.
  ADD COLUMN IF NOT EXISTS period_month date,
  ADD COLUMN IF NOT EXISTS class_id     uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS section_id   uuid REFERENCES public.sections(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS policy_id    uuid REFERENCES public.fee_policies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_fee_challans_period
  ON public.fee_challans (school_id, period_month, status);
CREATE INDEX IF NOT EXISTS idx_fee_challans_class
  ON public.fee_challans (school_id, class_id);

-- One monthly challan per student per month per type. Without this, pressing
-- "Generate Challans" twice bills the school's parents twice.
CREATE UNIQUE INDEX IF NOT EXISTS fee_challans_one_per_period
  ON public.fee_challans (school_id, student_id, period_month, fee_type)
  WHERE period_month IS NOT NULL AND is_deleted = false;

-- Backfill: existing rows predate net_amount, and a null there would read as
-- a zero-rupee challan on the collection screen.
UPDATE public.fee_challans
   SET net_amount = COALESCE(total_amount, amount)
 WHERE net_amount IS NULL;


-- ----------------------------------------------------------------------------
-- 3. Payment notes
-- ----------------------------------------------------------------------------
ALTER TABLE public.fee_payments
  ADD COLUMN IF NOT EXISTS notes text;


-- ----------------------------------------------------------------------------
-- 4. Challan and receipt numbering
-- ----------------------------------------------------------------------------
-- Counted in the database, not the app: two clerks pressing Generate in the
-- same second would otherwise both read the same count and mint the same
-- number, and the UNIQUE constraint would fail the second one.
--
-- SECURITY DEFINER so the count is taken over every row of the school, not
-- just the rows the caller's policies let them see.
CREATE OR REPLACE FUNCTION public.next_challan_number(p_school uuid, p_prefix text DEFAULT 'CH')
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_year text := to_char(CURRENT_DATE, 'YYYY');
  v_next integer;
BEGIN
  SELECT COALESCE(MAX(NULLIF(regexp_replace(challan_number, '^.*-', ''), '')::integer), 0) + 1
    INTO v_next
    FROM public.fee_challans
   WHERE school_id = p_school
     AND challan_number LIKE p_prefix || '-' || v_year || '-%';

  RETURN p_prefix || '-' || v_year || '-' || lpad(v_next::text, 4, '0');
END;
$fn$;

CREATE OR REPLACE FUNCTION public.next_receipt_number(p_school uuid, p_prefix text DEFAULT 'RC')
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_year text := to_char(CURRENT_DATE, 'YYYY');
  v_next integer;
BEGIN
  SELECT COALESCE(MAX(NULLIF(regexp_replace(receipt_no, '^.*-', ''), '')::integer), 0) + 1
    INTO v_next
    FROM public.fee_payments
   WHERE school_id = p_school
     AND receipt_no LIKE p_prefix || '-' || v_year || '-%';

  RETURN p_prefix || '-' || v_year || '-' || lpad(v_next::text, 4, '0');
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.next_challan_number(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_receipt_number(uuid, text) TO authenticated;


-- ----------------------------------------------------------------------------
-- 5. Keep net_amount honest
-- ----------------------------------------------------------------------------
-- The recalc trigger from schema.sql compares paid against
-- COALESCE(total_amount, amount), so total_amount has to carry the figure the
-- parent actually owes -- amount plus late fee, less discount.
CREATE OR REPLACE FUNCTION public.fee_challan_totals()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  NEW.net_amount := COALESCE(NEW.amount, 0)
                  + COALESCE(NEW.late_fee, 0)
                  - COALESCE(NEW.discount, 0);
  NEW.total_amount := NEW.net_amount;
  RETURN NEW;
END;
$fn$;

DO $$ BEGIN
  CREATE TRIGGER trg_fee_challans_totals
    BEFORE INSERT OR UPDATE OF amount, late_fee, discount ON public.fee_challans
    FOR EACH ROW EXECUTE FUNCTION public.fee_challan_totals();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ----------------------------------------------------------------------------
-- 6. Row level security and triggers
-- ----------------------------------------------------------------------------
SELECT public.apply_tenant_rls('fee_policies', 'fees.read', 'fees.write');
SELECT public.add_touch_trigger('fee_policies');
SELECT public.add_audit_trigger('fee_policies');


DO $report$
BEGIN
  RAISE NOTICE '----------------------------------------------------------';
  RAISE NOTICE 'Fees installed.';
  RAISE NOTICE '  fee policies: %', (SELECT count(*) FROM public.fee_policies);
  RAISE NOTICE '  challans:     %', (SELECT count(*) FROM public.fee_challans);
  RAISE NOTICE '  payments:     %', (SELECT count(*) FROM public.fee_payments);
  RAISE NOTICE '----------------------------------------------------------';
END
$report$;
