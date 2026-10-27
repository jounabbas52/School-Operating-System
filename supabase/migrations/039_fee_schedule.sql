-- ============================================================================
-- 031 · THE MONTHLY RUN, UNATTENDED
-- ============================================================================
--
-- Everything in 030 is driven by somebody pressing a button. A school with
-- nine hundred students does not want to remember to press it on the 1st, and
-- the month a clerk forgets is a month with no bills and no collection.
--
-- So: the same generator, reachable by a machine.
--
-- THIS SHIPS SWITCHED OFF, and that is deliberate. The thing being automated
-- writes bills for every family in the school. A school that has not chosen
-- its billing day, its due day, and its fee policies would get a month of
-- wrong challans generated on its behalf, and would find out from parents.
-- auto_generate_enabled defaults to false; the switch is in
-- Settings -> Fee & Finance.
--
-- HOW THE CALLER IS AUTHORISED
--
-- The same way the biometric gates and the WhatsApp dispatcher are, because
-- they have the same problem: a machine has no session, so auth.uid() is null
-- and current_school_id() answers nothing. One bcrypt hash in a table with
-- RLS and no policies, the plaintext presented on each call, the comparison
-- done inside a SECURITY DEFINER function. The route that calls this holds no
-- privilege of its own -- it passes the token through, and could be replaced
-- by curl.

-- ----------------------------------------------------------------------------
-- 1. The token
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fee_automation (
  id          boolean PRIMARY KEY DEFAULT true CHECK (id),
  token_hash  text NOT NULL,
  rotated_at  timestamptz NOT NULL DEFAULT now(),
  last_run_at timestamptz,
  last_result jsonb
);

ALTER TABLE public.fee_automation ENABLE ROW LEVEL SECURITY;
-- No policy, deliberately. RLS with zero policies denies everything, so the
-- hash cannot be read through PostgREST by anyone at all. Only the
-- SECURITY DEFINER functions below touch this table.

COMMENT ON TABLE public.fee_automation IS
  'One row. The bcrypt hash of the token the fee cron presents. Readable by nobody.';

CREATE OR REPLACE FUNCTION public.rotate_fee_cron_token()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, extensions
AS $fn$
DECLARE
  v_token text;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Only a platform admin may rotate the fee automation token'
      USING ERRCODE = '42501';
  END IF;

  v_token := encode(gen_random_bytes(24), 'hex');

  INSERT INTO public.fee_automation (id, token_hash, rotated_at)
  VALUES (true, crypt(v_token, gen_salt('bf')), now())
  ON CONFLICT (id) DO UPDATE
    SET token_hash = EXCLUDED.token_hash, rotated_at = now();

  -- Returned once, in the clear, and never again. The caller stores it in
  -- the environment; the database keeps only the hash.
  RETURN v_token;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.rotate_fee_cron_token() TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. The generator, with the school named rather than inferred
-- ----------------------------------------------------------------------------
-- 030's generate_fee_vouchers() reads current_school_id(), which is exactly
-- right for a person at a screen and useless to a cron. The logic moves here,
-- taking the school as an argument, and the screen-facing version becomes a
-- wrapper that supplies the caller's own school and checks their permission.
--
-- Not granted to authenticated: a signed-in user calling this directly could
-- name somebody else's school. The wrapper is the only way in from a session.
CREATE OR REPLACE FUNCTION public.generate_fee_vouchers_for(
  p_school   uuid,
  p_year     integer,
  p_month    integer,
  p_due_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, auth
AS $fn$
DECLARE
  v_period  date;
  v_made    integer := 0;
  v_skipped integer := 0;
  v_months  integer;
  v_challan uuid;
  s         record;
BEGIN
  IF p_school IS NULL THEN
    RAISE EXCEPTION 'No school given.';
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
     WHERE st.school_id = p_school
       AND st.is_deleted = false
       AND st.status = 'active'
     ORDER BY st.created_at
  LOOP
    -- A quarterly student is billed three months at a time, in the month
    -- their quarter starts, and not at all in the other two. An annual one
    -- gets twelve months once a year. This is why a monthly run cannot just
    -- bill everybody every month.
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

REVOKE ALL ON FUNCTION public.generate_fee_vouchers_for(uuid, integer, integer, date) FROM PUBLIC;

-- raise_fee_voucher() checks fees.write, which a cron does not hold, so the
-- generator has to be allowed to raise vouchers on its own authority. That is
-- what SECURITY DEFINER on this function provides; the gate in front of it is
-- the token, checked in run_fee_generation() below.

-- The screen-facing version, now a wrapper.
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
  v_school uuid := public.current_school_id();
BEGIN
  IF v_school IS NULL THEN
    RAISE EXCEPTION 'No active school.';
  END IF;
  IF NOT public.has_permission('fees.write') THEN
    RAISE EXCEPTION 'You do not have permission to raise challans.';
  END IF;

  RETURN public.generate_fee_vouchers_for(v_school, p_year, p_month, p_due_date);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.generate_fee_vouchers(integer, integer, date) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. The run
-- ----------------------------------------------------------------------------
-- Called every day. It decides for itself whether today is a billing day for
-- each school, which is what makes the schedule a daily one-liner instead of
-- per-school cron entries that drift out of step with the settings screen.
--
-- Idempotent by construction: the one-month-one-bill index means a second run
-- on the same day raises nothing. That matters because retries happen.
CREATE OR REPLACE FUNCTION public.run_fee_generation(
  p_token text,
  p_on    date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, extensions, auth
AS $fn$
DECLARE
  v_on      date := COALESCE(p_on, CURRENT_DATE);
  v_results jsonb := '[]'::jsonb;
  v_one     jsonb;
  v_day     integer;
  v_dueday  integer;
  v_due     date;
  sc        record;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.fee_automation
     WHERE token_hash = crypt(COALESCE(p_token, ''), token_hash)
  ) THEN
    RAISE EXCEPTION 'Not authorised.' USING ERRCODE = '42501';
  END IF;

  FOR sc IN
    SELECT s.school_id, s.value
      FROM public.settings s
     WHERE s.key = 'fees'
       AND COALESCE(s.value ->> 'auto_generate_enabled', 'false') = 'true'
  LOOP
    v_day    := GREATEST(1, LEAST(28, COALESCE((sc.value ->> 'auto_generate_day')::integer, 1)));
    v_dueday := GREATEST(1, LEAST(28, COALESCE((sc.value ->> 'due_day')::integer, 10)));

    -- Only on the day the school named. Capped at 28 so February cannot
    -- silently skip a school that chose the 30th.
    CONTINUE WHEN EXTRACT(DAY FROM v_on)::integer <> v_day;

    v_due := make_date(
      EXTRACT(YEAR FROM v_on)::integer,
      EXTRACT(MONTH FROM v_on)::integer,
      v_dueday
    );

    BEGIN
      v_one := public.generate_fee_vouchers_for(
        sc.school_id,
        EXTRACT(YEAR FROM v_on)::integer,
        EXTRACT(MONTH FROM v_on)::integer,
        v_due
      );
    EXCEPTION WHEN OTHERS THEN
      -- One school's bad data must not stop the other schools being billed.
      -- The failure is reported rather than swallowed.
      v_one := jsonb_build_object('error', SQLERRM);
    END;

    v_results := v_results || jsonb_build_array(
      jsonb_build_object('school_id', sc.school_id) || v_one
    );
  END LOOP;

  UPDATE public.fee_automation
     SET last_run_at = now(),
         last_result = jsonb_build_object('on', v_on, 'schools', v_results)
   WHERE id = true;

  RETURN jsonb_build_object('on', v_on, 'schools', v_results);
END;
$fn$;

-- Granted to anon for the same reason whatsapp_claim_batch is: the token is
-- the authorisation, and checking it twice -- once in a route, once here --
-- would mean the route's check could be bypassed while this one could not.
-- One gate, in the database.
GRANT EXECUTE ON FUNCTION public.run_fee_generation(text, date) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. RESULT
-- ----------------------------------------------------------------------------
SELECT 'fee automation ready'           AS step,
       (SELECT count(*) FROM public.fee_automation) AS token_rows,
       (SELECT count(*) FROM public.settings
         WHERE key = 'fees'
           AND COALESCE(value ->> 'auto_generate_enabled', 'false') = 'true') AS schools_switched_on;
