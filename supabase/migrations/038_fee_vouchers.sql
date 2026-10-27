-- ============================================================================
-- 030_FEE_VOUCHERS.sql -- run after 029_fee_ledger.sql
-- ============================================================================
-- Paste the whole file into the SQL editor and Run. Idempotent.
--
-- WHAT THIS FIXES
--
-- Four things the fee module could not do, all of them the same shape: a
-- challan was one month and a payment was one challan.
--
--   One voucher, many months   a parent paying Nov-Mar got five challans and
--                              five trips to the bank. Now the months are
--                              LINES on one voucher.
--
--   One payment, many bills    the cashier split the cash by hand and typed
--                              it five times. Now they type the total and
--                              the system allocates it, oldest first.
--
--   Advances                   recordPayment refused anything above the
--                              challan's outstanding. Now the excess stays on
--                              the account as credit and settles the next
--                              voucher at issue.
--
--   Arrears on the voucher     a November bill said Rs 4,500 while the family
--                              owed Rs 24,025. Now the voucher carries the
--                              previous balance, the credit applied, and what
--                              is actually payable.
--
-- THE RULE THAT MOVED
--
-- "One challan per student per month per fee type" was a unique index on the
-- header, which is exactly what made a five-month voucher impossible. It is
-- now the same rule on the LINES, so a month can be billed once however many
-- vouchers exist -- and December's batch skips a student whose December is
-- already a line on an advance voucher.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. A voucher covers a span
-- ----------------------------------------------------------------------------
ALTER TABLE public.fee_challans
  ADD COLUMN IF NOT EXISTS period_from      date,
  ADD COLUMN IF NOT EXISTS period_to        date,
  -- What the family owed before this voucher was raised. Written once, at
  -- issue, and never recomputed: a voucher is a statement of that moment, and
  -- one that silently rewrites itself is not a document anybody can pay from.
  ADD COLUMN IF NOT EXISTS previous_balance numeric(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credit_applied   numeric(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payable          numeric(12, 2);

-- Single-month challans from before this file keep reading correctly.
UPDATE public.fee_challans
   SET period_from = COALESCE(period_from, period_month),
       period_to   = COALESCE(period_to, period_month)
 WHERE period_month IS NOT NULL
   AND (period_from IS NULL OR period_to IS NULL);


-- ----------------------------------------------------------------------------
-- 2. The months are lines
-- ----------------------------------------------------------------------------
-- fee_challan_items existed since the first schema and was used by nothing.
-- This is what it was for.
--
-- fee_item_id pointed at the school's price list and was NOT NULL, which is
-- why nothing could use it: a challan is routinely raised for something that
-- never made the list. It becomes optional.
ALTER TABLE public.fee_challan_items
  ALTER COLUMN fee_item_id DROP NOT NULL;

ALTER TABLE public.fee_challan_items
  ADD COLUMN IF NOT EXISTS student_id   uuid REFERENCES public.students(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS period_month date,
  ADD COLUMN IF NOT EXISTS fee_type     text;

-- Denormalised from the challan so the one-per-month rule below can be an
-- index rather than a trigger. Kept honest by fee_item_fill() underneath.
UPDATE public.fee_challan_items i
   SET student_id = c.student_id,
       school_id  = c.school_id
  FROM public.fee_challans c
 WHERE c.id = i.challan_id AND i.student_id IS NULL;

CREATE OR REPLACE FUNCTION public.fee_item_fill()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $fn$
BEGIN
  IF NEW.student_id IS NULL OR NEW.school_id IS NULL THEN
    SELECT c.student_id, c.school_id INTO NEW.student_id, NEW.school_id
      FROM public.fee_challans c WHERE c.id = NEW.challan_id;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_fee_challan_items_fill ON public.fee_challan_items;
CREATE TRIGGER trg_fee_challan_items_fill
  BEFORE INSERT OR UPDATE ON public.fee_challan_items
  FOR EACH ROW EXECUTE FUNCTION public.fee_item_fill();

-- Every existing challan becomes a one-line challan, so the rule below holds
-- for the history as well as for what comes next.
INSERT INTO public.fee_challan_items
  (school_id, challan_id, student_id, period_month, fee_type, description, amount)
SELECT c.school_id, c.id, c.student_id, c.period_month, c.fee_type,
       COALESCE(c.description, initcap(c.fee_type)), c.amount
  FROM public.fee_challans c
 WHERE c.is_deleted = false
   AND NOT EXISTS (
     SELECT 1 FROM public.fee_challan_items i
      WHERE i.challan_id = c.id AND i.is_deleted = false
   );

-- THE RULE, in its new home. A month may be billed once per fee type per
-- student, whichever voucher carries it.
DROP INDEX IF EXISTS public.fee_challans_one_per_period;

CREATE UNIQUE INDEX IF NOT EXISTS fee_challan_items_one_per_period
  ON public.fee_challan_items (school_id, student_id, period_month, fee_type)
  WHERE period_month IS NOT NULL AND is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_fee_challan_items_challan
  ON public.fee_challan_items (challan_id);

-- The header total follows its lines, where there are any.
CREATE OR REPLACE FUNCTION public.fee_challan_from_items()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_challan uuid := COALESCE(NEW.challan_id, OLD.challan_id);
  v_sum numeric;
  v_from date;
  v_to date;
BEGIN
  SELECT COALESCE(SUM(amount), 0), MIN(period_month), MAX(period_month)
    INTO v_sum, v_from, v_to
    FROM public.fee_challan_items
   WHERE challan_id = v_challan AND is_deleted = false;

  UPDATE public.fee_challans c
     SET amount      = v_sum,
         period_from = COALESCE(v_from, c.period_from),
         period_to   = COALESCE(v_to, c.period_to),
         updated_at  = now()
   WHERE c.id = v_challan
     AND v_sum > 0;

  RETURN COALESCE(NEW, OLD);
END;
$fn$;

DROP TRIGGER IF EXISTS trg_fee_challan_items_total ON public.fee_challan_items;
CREATE TRIGGER trg_fee_challan_items_total
  AFTER INSERT OR UPDATE OR DELETE ON public.fee_challan_items
  FOR EACH ROW EXECUTE FUNCTION public.fee_challan_from_items();


-- ----------------------------------------------------------------------------
-- 3. A payment is money; an allocation says which bill it covers
-- ----------------------------------------------------------------------------
-- The split that lets one receipt clear five challans -- and lets money
-- received in October settle a voucher issued in November without anybody
-- recording a second payment.
CREATE TABLE IF NOT EXISTS public.fee_payment_allocations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  payment_id uuid NOT NULL REFERENCES public.fee_payments(id) ON DELETE CASCADE,
  challan_id uuid NOT NULL REFERENCES public.fee_challans(id) ON DELETE CASCADE,
  amount     numeric(12, 2) NOT NULL CHECK (amount > 0),
  created_by uuid,
  updated_by uuid,
  deleted_by uuid,
  deleted_at timestamptz,
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payment_id, challan_id)
);

CREATE INDEX IF NOT EXISTS idx_fee_allocations_challan
  ON public.fee_payment_allocations (challan_id);

SELECT public.apply_tenant_rls('fee_payment_allocations', 'fees.read', 'fees.write');
SELECT public.add_touch_trigger('fee_payment_allocations');

-- Every payment that already exists was against exactly one challan.
INSERT INTO public.fee_payment_allocations (school_id, payment_id, challan_id, amount)
SELECT p.school_id, p.id, p.challan_id, p.amount_paid
  FROM public.fee_payments p
 WHERE p.challan_id IS NOT NULL
   AND p.is_deleted = false
ON CONFLICT (payment_id, challan_id) DO NOTHING;

-- paid_amount now follows the ALLOCATIONS, not the payments. Same arithmetic,
-- one level down, which is what lets a single payment mark five challans paid.
CREATE OR REPLACE FUNCTION public.recalc_challan_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_challan uuid := COALESCE(NEW.challan_id, OLD.challan_id);
  v_paid  numeric;
  v_total numeric;
  v_due   date;
BEGIN
  IF v_challan IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT COALESCE(SUM(a.amount), 0) INTO v_paid
    FROM public.fee_payment_allocations a
    JOIN public.fee_payments p ON p.id = a.payment_id
   WHERE a.challan_id = v_challan
     AND a.is_deleted = false
     AND p.is_deleted = false;

  SELECT COALESCE(c.net_amount, c.total_amount, c.amount), c.due_date
    INTO v_total, v_due
    FROM public.fee_challans c WHERE c.id = v_challan;

  UPDATE public.fee_challans c
     SET paid_amount = v_paid,
         status = CASE
           WHEN c.status = 'cancelled'                     THEN c.status
           WHEN v_paid >= v_total AND v_total > 0          THEN 'paid'
           WHEN v_paid > 0                                 THEN 'partial'
           WHEN v_due IS NOT NULL AND v_due < CURRENT_DATE THEN 'overdue'
           ELSE 'open'
         END::public.challan_status,
         updated_at = now()
   WHERE c.id = v_challan;

  RETURN COALESCE(NEW, OLD);
END;
$fn$;

DROP TRIGGER IF EXISTS trg_fee_payments_recalc ON public.fee_payments;
DROP TRIGGER IF EXISTS trg_fee_allocations_recalc ON public.fee_payment_allocations;
CREATE TRIGGER trg_fee_allocations_recalc
  AFTER INSERT OR UPDATE OR DELETE ON public.fee_payment_allocations
  FOR EACH ROW EXECUTE FUNCTION public.recalc_challan_paid();

-- A payment inserted the old way -- with a challan_id and no allocation --
-- still works. Belt and braces for any path not yet rewritten.
CREATE OR REPLACE FUNCTION public.fee_payment_autoallocate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $fn$
BEGIN
  IF NEW.challan_id IS NOT NULL AND NOT NEW.is_deleted THEN
    INSERT INTO public.fee_payment_allocations (school_id, payment_id, challan_id, amount)
    VALUES (NEW.school_id, NEW.id, NEW.challan_id, NEW.amount_paid)
    ON CONFLICT (payment_id, challan_id) DO UPDATE SET amount = EXCLUDED.amount;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_fee_payments_autoallocate ON public.fee_payments;
CREATE TRIGGER trg_fee_payments_autoallocate
  AFTER INSERT ON public.fee_payments
  FOR EACH ROW EXECUTE FUNCTION public.fee_payment_autoallocate();


-- ----------------------------------------------------------------------------
-- 4. Credit: money received that no bill has claimed yet
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.available_credit(p_student uuid)
RETURNS numeric
LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public
AS $fn$
  SELECT GREATEST(0,
    COALESCE((SELECT SUM(p.amount_paid) FROM public.fee_payments p
               WHERE p.student_id = p_student AND p.is_deleted = false), 0)
    -
    COALESCE((SELECT SUM(a.amount) FROM public.fee_payment_allocations a
                JOIN public.fee_payments p ON p.id = a.payment_id
               WHERE p.student_id = p_student
                 AND a.is_deleted = false AND p.is_deleted = false), 0)
  );
$fn$;

GRANT EXECUTE ON FUNCTION public.available_credit(uuid) TO authenticated;

-- Spend that credit on one voucher, oldest money first. Creates allocations
-- against the payments the money actually came from -- no new payment row,
-- because no new money arrived: the ledger already recorded it.
CREATE OR REPLACE FUNCTION public.apply_credit(p_challan uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  r          record;
  v_student  uuid;
  v_school   uuid;
  v_due      numeric;
  v_take     numeric;
  v_applied  numeric := 0;
BEGIN
  SELECT c.student_id, c.school_id,
         COALESCE(c.net_amount, c.total_amount, c.amount, 0) - COALESCE(c.paid_amount, 0)
    INTO v_student, v_school, v_due
    FROM public.fee_challans c
   WHERE c.id = p_challan AND c.is_deleted = false AND c.status <> 'cancelled';

  IF v_student IS NULL OR v_due <= 0 THEN
    RETURN 0;
  END IF;

  FOR r IN
    SELECT p.id,
           p.amount_paid - COALESCE((
             SELECT SUM(a.amount) FROM public.fee_payment_allocations a
              WHERE a.payment_id = p.id AND a.is_deleted = false
           ), 0) AS spare
      FROM public.fee_payments p
     WHERE p.student_id = v_student AND p.is_deleted = false
     ORDER BY p.paid_at, p.created_at
  LOOP
    EXIT WHEN v_due <= 0;
    CONTINUE WHEN r.spare <= 0;

    v_take := LEAST(r.spare, v_due);

    INSERT INTO public.fee_payment_allocations (school_id, payment_id, challan_id, amount)
    VALUES (v_school, r.id, p_challan, v_take)
    ON CONFLICT (payment_id, challan_id) DO UPDATE
      SET amount = public.fee_payment_allocations.amount + EXCLUDED.amount;

    v_due     := v_due - v_take;
    v_applied := v_applied + v_take;
  END LOOP;

  IF v_applied > 0 THEN
    UPDATE public.fee_challans
       SET credit_applied = COALESCE(credit_applied, 0) + v_applied,
           payable = GREATEST(0, COALESCE(payable, COALESCE(net_amount, amount, 0)) - v_applied)
     WHERE id = p_challan;
  END IF;

  RETURN v_applied;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.apply_credit(uuid) TO authenticated;


-- ----------------------------------------------------------------------------
-- 5. Taking money: one amount, many bills
-- ----------------------------------------------------------------------------
-- The cashier picks a STUDENT, not a challan, and types what was handed over.
-- Oldest bill first unless they say otherwise; anything left over stays on
-- the account rather than being refused.
CREATE OR REPLACE FUNCTION public.collect_fee(
  p_student   uuid,
  p_amount    numeric,
  p_method    text DEFAULT 'cash',
  p_reference text DEFAULT NULL,
  p_paid_at   timestamptz DEFAULT now(),
  p_notes     text DEFAULT NULL,
  -- [{"challan_id": "...", "amount": 4500}, ...] to override the default
  -- oldest-first split.
  p_splits    jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, auth
AS $fn$
DECLARE
  v_school    uuid := public.current_school_id();
  v_receipt   text;
  v_payment   uuid;
  v_left      numeric := p_amount;
  v_take      numeric;
  v_cleared   integer := 0;
  v_hit       integer;
  r           record;
BEGIN
  IF v_school IS NULL THEN
    RAISE EXCEPTION 'No active school.';
  END IF;

  IF NOT public.has_permission('fees.write') THEN
    RAISE EXCEPTION 'You do not have permission to record payments.';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Enter an amount greater than zero.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.students s
     WHERE s.id = p_student AND s.school_id = v_school AND s.is_deleted = false
  ) THEN
    RAISE EXCEPTION 'That student is not in this school.';
  END IF;

  v_receipt := public.next_receipt_number(v_school, 'RC');

  INSERT INTO public.fee_payments
    (school_id, student_id, challan_id, amount_paid, method, reference, receipt_no, notes, paid_at, received_by)
  VALUES
    (v_school, p_student, NULL, p_amount, COALESCE(p_method, 'cash')::public.payment_method,
     p_reference, v_receipt, p_notes, COALESCE(p_paid_at, now()), auth.uid())
  RETURNING id INTO v_payment;

  IF p_splits IS NOT NULL THEN
    -- The cashier said where it goes.
    FOR r IN
      SELECT (e ->> 'challan_id')::uuid AS challan_id,
             (e ->> 'amount')::numeric  AS amount
        FROM jsonb_array_elements(p_splits) e
    LOOP
      CONTINUE WHEN r.amount IS NULL OR r.amount <= 0;
      EXIT WHEN v_left <= 0;

      v_take := LEAST(r.amount, v_left);

      INSERT INTO public.fee_payment_allocations (school_id, payment_id, challan_id, amount)
      SELECT v_school, v_payment, c.id, v_take
        FROM public.fee_challans c
       WHERE c.id = r.challan_id
         AND c.student_id = p_student
         AND c.school_id = v_school
         AND c.is_deleted = false
         AND c.status <> 'cancelled'
      ON CONFLICT (payment_id, challan_id) DO UPDATE
        SET amount = public.fee_payment_allocations.amount + EXCLUDED.amount;

      -- The SELECT above filters on the student, the school, and the
      -- challan not being deleted or cancelled. When it matches nothing --
      -- somebody else's challan id, a stale screen -- no allocation was
      -- written, so this money has not been spent. Reducing v_left here
      -- would make it vanish: shown as taken, arriving nowhere.
      GET DIAGNOSTICS v_hit = ROW_COUNT;

      IF v_hit > 0 THEN
        v_left := v_left - v_take;
        v_cleared := v_cleared + 1;
      END IF;
    END LOOP;
  ELSE
    -- Oldest first: the June bill before the July one, which is both what a
    -- school means by "paying off arrears" and what keeps late fees from
    -- accruing on the oldest debt.
    FOR r IN
      SELECT c.id,
             COALESCE(c.net_amount, c.total_amount, c.amount, 0) - COALESCE(c.paid_amount, 0) AS due
        FROM public.fee_challans c
       WHERE c.student_id = p_student
         AND c.school_id = v_school
         AND c.is_deleted = false
         AND c.status <> 'cancelled'
         AND COALESCE(c.net_amount, c.total_amount, c.amount, 0) > COALESCE(c.paid_amount, 0)
       ORDER BY COALESCE(c.period_from, c.period_month, c.issued_date), c.created_at
    LOOP
      EXIT WHEN v_left <= 0;
      CONTINUE WHEN r.due <= 0;

      v_take := LEAST(r.due, v_left);

      INSERT INTO public.fee_payment_allocations (school_id, payment_id, challan_id, amount)
      VALUES (v_school, v_payment, r.id, v_take)
      ON CONFLICT (payment_id, challan_id) DO UPDATE
        SET amount = public.fee_payment_allocations.amount + EXCLUDED.amount;

      v_left := v_left - v_take;
      v_cleared := v_cleared + 1;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'receipt_no', v_receipt,
    'payment_id', v_payment,
    'allocated',  p_amount - v_left,
    'credit',     v_left,
    'challans',   v_cleared,
    'balance',    (SELECT fee_balance FROM public.students WHERE id = p_student)
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.collect_fee(uuid, numeric, text, text, timestamptz, text, jsonb) TO authenticated;


-- ----------------------------------------------------------------------------
-- 6. What a student owes for one month
-- ----------------------------------------------------------------------------
-- The policy's components for that month, with the student's own tuition
-- figure winning over the policy's -- that is where a scholarship or a
-- sibling discount lives -- and anything already billed left out.
CREATE OR REPLACE FUNCTION public.fee_lines_for(p_student uuid, p_period date)
RETURNS TABLE (fee_type text, label text, amount numeric)
LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public
AS $fn$
  WITH me AS (
    SELECT s.id, s.school_id, s.current_class_id,
           COALESCE(NULLIF(s.final_fee, 0), NULLIF(s.base_fee, 0)) AS own_fee
      FROM public.students s WHERE s.id = p_student
  ),
  pol AS (
    SELECT p.* FROM public.fee_policies p, me
     WHERE p.school_id = me.school_id
       AND p.class_id = me.current_class_id
       AND p.is_deleted = false
       AND p.status = 'active'
     LIMIT 1
  ),
  parts AS (
    SELECT 'monthly'::text   AS ft, 'Tuition Fee'::text   AS lbl,
           COALESCE((SELECT own_fee FROM me), p.tuition_fee) AS amt,
           p.tuition_months AS months FROM pol p
    UNION ALL SELECT 'admission', 'Admission Fee', p.admission_fee, p.admission_months FROM pol p
    UNION ALL SELECT 'exam',      'Exam Fee',      p.exam_fee,      p.exam_months      FROM pol p
    UNION ALL SELECT 'transport', 'Transport Fee', p.transport_fee, p.transport_months FROM pol p
    UNION ALL SELECT 'other',     'Other Charges', p.other_fee,     p.other_months     FROM pol p
  )
  SELECT parts.ft, parts.lbl || ' · ' || to_char(p_period, 'Mon YYYY'), parts.amt
    FROM parts
   WHERE parts.amt > 0
     AND EXTRACT(MONTH FROM p_period)::smallint = ANY (parts.months)
     AND NOT EXISTS (
       SELECT 1 FROM public.fee_challan_items i
        WHERE i.student_id = p_student
          AND i.period_month = p_period
          AND i.fee_type = parts.ft
          AND i.is_deleted = false
     );
$fn$;

GRANT EXECUTE ON FUNCTION public.fee_lines_for(uuid, date) TO authenticated;


-- ----------------------------------------------------------------------------
-- 7. Raising vouchers
-- ----------------------------------------------------------------------------
-- One student, a span of months, one voucher. This is both the "bill ahead"
-- action and the engine the monthly batch runs per student.
CREATE OR REPLACE FUNCTION public.raise_fee_voucher(
  p_student   uuid,
  p_from      date,
  p_months    integer DEFAULT 1,
  p_due_date  date DEFAULT NULL,
  p_note      text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, auth
AS $fn$
DECLARE
  v_school   uuid := public.current_school_id();
  v_period   date;
  v_challan  uuid;
  v_number   text;
  v_prev     numeric;
  v_lines    integer := 0;
  v_total    numeric := 0;
  r          record;
  i          integer;
BEGIN
  IF v_school IS NULL THEN
    RAISE EXCEPTION 'No active school.';
  END IF;
  IF NOT public.has_permission('fees.write') THEN
    RAISE EXCEPTION 'You do not have permission to raise challans.';
  END IF;
  IF p_months < 1 OR p_months > 12 THEN
    RAISE EXCEPTION 'A voucher covers between 1 and 12 months.';
  END IF;

  SELECT s.fee_balance INTO v_prev
    FROM public.students s
   WHERE s.id = p_student AND s.school_id = v_school AND s.is_deleted = false;

  IF v_prev IS NULL THEN
    RAISE EXCEPTION 'That student is not in this school.';
  END IF;

  -- Nothing is written until we know there is something to bill: an empty
  -- voucher in the collection list is noise, not a bill.
  CREATE TEMP TABLE IF NOT EXISTS _lines (
    period date, fee_type text, label text, amount numeric
  ) ON COMMIT DROP;
  DELETE FROM _lines;

  FOR i IN 0 .. p_months - 1 LOOP
    v_period := (date_trunc('month', p_from) + (i || ' months')::interval)::date;
    INSERT INTO _lines (period, fee_type, label, amount)
    SELECT v_period, f.fee_type, f.label, f.amount FROM public.fee_lines_for(p_student, v_period) f;
  END LOOP;

  SELECT count(*), COALESCE(SUM(amount), 0) INTO v_lines, v_total FROM _lines;
  IF v_lines = 0 THEN
    RETURN NULL;
  END IF;

  v_number := public.next_challan_number(v_school, 'CH');

  INSERT INTO public.fee_challans
    (school_id, student_id, class_id, section_id, challan_number, fee_type,
     amount, late_fee, discount, due_date, period_month, period_from, period_to,
     description, previous_balance, payable, issued_date)
  SELECT v_school, p_student, s.current_class_id, s.current_section_id, v_number,
         -- The header's type is the dominant line's; the lines carry the detail.
         (SELECT fee_type FROM _lines GROUP BY fee_type ORDER BY SUM(amount) DESC LIMIT 1),
         v_total, 0, 0,
         COALESCE(p_due_date, (date_trunc('month', p_from) + interval '10 days')::date),
         (SELECT MIN(period) FROM _lines),
         (SELECT MIN(period) FROM _lines),
         (SELECT MAX(period) FROM _lines),
         COALESCE(p_note, CASE WHEN p_months > 1
                               THEN to_char(p_from, 'Mon YYYY') || ' – ' ||
                                    to_char((date_trunc('month', p_from) + ((p_months - 1) || ' months')::interval)::date, 'Mon YYYY')
                               ELSE to_char(p_from, 'Mon YYYY') END),
         v_prev,
         v_total + GREATEST(v_prev, 0),
         CURRENT_DATE
    FROM public.students s WHERE s.id = p_student
  RETURNING id INTO v_challan;

  INSERT INTO public.fee_challan_items
    (school_id, challan_id, student_id, period_month, fee_type, description, amount)
  SELECT v_school, v_challan, p_student, period, fee_type, label, amount FROM _lines;

  -- Credit the family already has settles this voucher before they see it.
  PERFORM public.apply_credit(v_challan);

  RETURN v_challan;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.raise_fee_voucher(uuid, date, integer, date, text) TO authenticated;

-- A one-off voucher for an amount somebody typed: a fine, a trip, a class
-- whose policy has not been set up yet. Same shape as a generated one --
-- header plus a line -- so the one-month-one-bill rule catches a duplicate
-- here exactly as it does for the batch.
--
-- Returns NULL when that month and fee type are already billed, which is how
-- the callers report "already existed" instead of failing.
CREATE OR REPLACE FUNCTION public.raise_manual_voucher(
  p_student     uuid,
  p_period      date,
  p_fee_type    text,
  p_amount      numeric,
  p_due_date    date,
  p_description text DEFAULT NULL,
  p_late_fee    numeric DEFAULT 0,
  p_discount    numeric DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, auth
AS $fn$
DECLARE
  v_school  uuid := public.current_school_id();
  v_challan uuid;
  v_number  text;
  v_prev    numeric;
  v_net     numeric;
BEGIN
  IF v_school IS NULL THEN
    RAISE EXCEPTION 'No active school.';
  END IF;
  IF NOT public.has_permission('fees.write') THEN
    RAISE EXCEPTION 'You do not have permission to raise challans.';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Enter an amount greater than zero.';
  END IF;

  SELECT s.fee_balance INTO v_prev
    FROM public.students s
   WHERE s.id = p_student AND s.school_id = v_school AND s.is_deleted = false;

  IF v_prev IS NULL THEN
    RAISE EXCEPTION 'That student is not in this school.';
  END IF;

  -- Already billed for that month and type: say so by returning nothing,
  -- rather than writing a second bill for the same thing.
  IF p_period IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.fee_challan_items i
     WHERE i.student_id = p_student AND i.period_month = p_period
       AND i.fee_type = p_fee_type AND i.is_deleted = false
  ) THEN
    RETURN NULL;
  END IF;

  v_net    := p_amount + COALESCE(p_late_fee, 0) - COALESCE(p_discount, 0);
  v_number := public.next_challan_number(v_school, 'CH');

  INSERT INTO public.fee_challans
    (school_id, student_id, class_id, section_id, challan_number, fee_type,
     amount, late_fee, discount, due_date, period_month, period_from, period_to,
     description, previous_balance, payable, issued_date)
  SELECT v_school, p_student, s.current_class_id, s.current_section_id, v_number, p_fee_type,
         p_amount, COALESCE(p_late_fee, 0), COALESCE(p_discount, 0), p_due_date,
         p_period, p_period, p_period, p_description, v_prev,
         v_net + GREATEST(v_prev, 0), CURRENT_DATE
    FROM public.students s WHERE s.id = p_student
  RETURNING id INTO v_challan;

  INSERT INTO public.fee_challan_items
    (school_id, challan_id, student_id, period_month, fee_type, description, amount)
  VALUES (v_school, v_challan, p_student, p_period, p_fee_type,
          COALESCE(NULLIF(p_description, ''), initcap(replace(p_fee_type, '_', ' '))), p_amount);

  PERFORM public.apply_credit(v_challan);

  RETURN v_challan;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.raise_manual_voucher(uuid, date, text, numeric, date, text, numeric, numeric) TO authenticated;

-- The monthly run, honouring each student's fee plan.
--
--   monthly    every month
--   quarterly  three months on one voucher, every third month from their
--              starting month
--   annual     twelve months on one voucher, in their starting month
--
-- fee_plan and starting_month have been on the student form since the
-- beginning and no generator has ever read them. This one does.
CREATE OR REPLACE FUNCTION public.generate_fee_vouchers(
  p_year     integer,
  p_month    integer,
  p_due_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, auth
AS $fn$
DECLARE
  v_school  uuid := public.current_school_id();
  v_period  date;
  v_made    integer := 0;
  v_skipped integer := 0;
  v_months  integer;
  v_challan uuid;
  s         record;
BEGIN
  IF v_school IS NULL THEN
    RAISE EXCEPTION 'No active school.';
  END IF;
  IF NOT public.has_permission('fees.write') THEN
    RAISE EXCEPTION 'You do not have permission to raise challans.';
  END IF;
  IF p_month < 1 OR p_month > 12 THEN
    RAISE EXCEPTION 'Choose a valid month.';
  END IF;

  v_period := make_date(p_year, p_month, 1);

  FOR s IN
    SELECT st.id,
           COALESCE(NULLIF(st.fee_plan, ''), 'monthly') AS plan,
           COALESCE(st.starting_month, 1)               AS start_month
      FROM public.students st
     WHERE st.school_id = v_school
       AND st.is_deleted = false
       AND st.status = 'active'
     ORDER BY st.created_at
  LOOP
    v_months := CASE s.plan
      WHEN 'quarterly' THEN CASE WHEN ((p_month - s.start_month) % 3 + 3) % 3 = 0 THEN 3 ELSE 0 END
      WHEN 'annual'    THEN CASE WHEN p_month = s.start_month THEN 12 ELSE 0 END
      ELSE 1
    END;

    IF v_months = 0 THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    v_challan := public.raise_fee_voucher(s.id, v_period, v_months, p_due_date, NULL);

    IF v_challan IS NULL THEN
      v_skipped := v_skipped + 1;
    ELSE
      v_made := v_made + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('made', v_made, 'skipped', v_skipped,
                            'period', to_char(v_period, 'Mon YYYY'));
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.generate_fee_vouchers(integer, integer, date) TO authenticated;


-- ----------------------------------------------------------------------------
-- 8. The delete policies, as 026 left them
-- ----------------------------------------------------------------------------
DO $del$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['fee_ledger', 'fee_payment_allocations']
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
       WHERE c.relname = t AND p.polname = t || '_delete'
         AND pg_get_expr(p.polqual, p.polrelid) LIKE '%fees.write%'
    ) THEN
      EXECUTE format('DROP POLICY %I ON public.%I', t || '_delete', t);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated
           USING (school_id = public.current_school_id() AND public.has_permission(''fees.delete''))',
        t || '_delete', t);
    END IF;
  END LOOP;
END
$del$;


-- A whole class in one press, for schools that bill off the student's own fee
-- figure rather than a class policy. One call rather than one per student:
-- next_challan_number() reads the table's current maximum, so minting forty
-- numbers from forty round trips is both slow and a race.
--
-- Returns {made, already, skipped} -- skipped being the students who have no
-- fee on file, who would otherwise get a zero-rupee bill.
CREATE OR REPLACE FUNCTION public.generate_class_vouchers(
  p_class       uuid,
  p_section     uuid DEFAULT NULL,
  p_period      date DEFAULT NULL,
  p_fee_type    text DEFAULT 'monthly',
  p_due_date    date DEFAULT NULL,
  p_fallback    numeric DEFAULT 0,
  p_description text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, auth
AS $fn$
DECLARE
  v_school  uuid := public.current_school_id();
  v_made    integer := 0;
  v_already integer := 0;
  v_skipped integer := 0;
  v_amount  numeric;
  v_challan uuid;
  s         record;
BEGIN
  IF v_school IS NULL THEN
    RAISE EXCEPTION 'No active school.';
  END IF;
  IF NOT public.has_permission('fees.write') THEN
    RAISE EXCEPTION 'You do not have permission to raise challans.';
  END IF;
  IF p_class IS NULL THEN
    RAISE EXCEPTION 'Choose a class.';
  END IF;

  FOR s IN
    SELECT st.id, st.final_fee, st.base_fee
      FROM public.students st
     WHERE st.school_id = v_school
       AND st.is_deleted = false
       AND st.status = 'active'
       AND st.current_class_id = p_class
       AND (p_section IS NULL OR st.current_section_id = p_section)
     ORDER BY st.first_name, st.last_name
  LOOP
    -- The student's own figure wins: that is where a scholarship or a sibling
    -- discount lives. The typed fallback is only for students who have none.
    v_amount := COALESCE(NULLIF(s.final_fee, 0), NULLIF(s.base_fee, 0), p_fallback);

    IF v_amount IS NULL OR v_amount <= 0 THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    v_challan := public.raise_manual_voucher(
      s.id, p_period, p_fee_type, v_amount, p_due_date, p_description
    );

    IF v_challan IS NULL THEN
      v_already := v_already + 1;
    ELSE
      v_made := v_made + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('made', v_made, 'already', v_already, 'skipped', v_skipped);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.generate_class_vouchers(uuid, uuid, date, text, date, numeric, text) TO authenticated;


-- Everything the collection counter needs about who owes what, in one read.
--
-- The screen cannot answer "what has this family got on account?" from the
-- challan table alone: credit is money received that no challan has claimed,
-- which only the payments and their allocations know about. Asking per student
-- would be one round trip each.
CREATE OR REPLACE FUNCTION public.fee_dues()
RETURNS TABLE (
  student_id       uuid,
  full_name        text,
  admission_number text,
  father_name      text,
  class_id         uuid,
  section_id       uuid,
  balance          numeric,
  credit           numeric,
  open_challans    integer,
  oldest_due       date
)
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public, auth
AS $fn$
  SELECT s.id,
         btrim(COALESCE(s.first_name, '') || ' ' || COALESCE(s.last_name, '')),
         s.admission_number,
         s.father_name,
         s.current_class_id,
         s.current_section_id,
         COALESCE(s.fee_balance, 0),
         -- Received, less what has been pinned to a bill. Clamped at zero:
         -- an over-allocation would otherwise read as negative credit.
         GREATEST(COALESCE(p.received, 0) - COALESCE(a.allocated, 0), 0),
         COALESCE(c.open_count, 0)::integer,
         c.oldest_due
    FROM public.students s
    LEFT JOIN (
      SELECT fp.student_id, SUM(fp.amount_paid) AS received
        FROM public.fee_payments fp
       WHERE fp.school_id = public.current_school_id()
       GROUP BY fp.student_id
    ) p ON p.student_id = s.id
    LEFT JOIN (
      SELECT fp.student_id, SUM(al.amount) AS allocated
        FROM public.fee_payment_allocations al
        JOIN public.fee_payments fp ON fp.id = al.payment_id
       WHERE fp.school_id = public.current_school_id()
       GROUP BY fp.student_id
    ) a ON a.student_id = s.id
    LEFT JOIN (
      SELECT ch.student_id,
             count(*) AS open_count,
             MIN(ch.due_date) AS oldest_due
        FROM public.fee_challans ch
       WHERE ch.school_id = public.current_school_id()
         AND ch.is_deleted = false
         AND ch.status <> 'cancelled'
         AND COALESCE(ch.net_amount, ch.amount, 0) > COALESCE(ch.paid_amount, 0)
       GROUP BY ch.student_id
    ) c ON c.student_id = s.id
   WHERE s.school_id = public.current_school_id()
     AND s.is_deleted = false
     AND s.status = 'active'
     AND public.has_permission('fees.read')
   ORDER BY s.first_name, s.last_name;
$fn$;

GRANT EXECUTE ON FUNCTION public.fee_dues() TO authenticated;


-- ============================================================================
-- 9. RESULT
-- ============================================================================
SELECT c.challan_number,
       to_char(c.period_from, 'Mon YYYY') || COALESCE(' – ' || to_char(NULLIF(c.period_to, c.period_from), 'Mon YYYY'), '') AS period,
       (SELECT count(*) FROM public.fee_challan_items i WHERE i.challan_id = c.id AND i.is_deleted = false) AS lines,
       c.amount, c.previous_balance, c.credit_applied, c.payable, c.paid_amount, c.status::text
  FROM public.fee_challans c
 WHERE c.is_deleted = false
 ORDER BY c.created_at DESC
 LIMIT 20;
