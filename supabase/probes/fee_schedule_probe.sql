-- Drives the fee automation inside the dry run's transaction.
--
-- The token is planted directly rather than through rotate_fee_cron_token(),
-- because that function requires a platform admin and the point here is the
-- run, not the rotation.
SET LOCAL request.jwt.claims = '{"sub":"56e07697-2065-4d71-9805-22bf82e0ce06","role":"authenticated"}';

DO $cron$
DECLARE
  v_school uuid;
  v_result jsonb;
  v_made   integer;
  v_on     date := CURRENT_DATE;
  v_failed boolean := false;
BEGIN
  v_school := public.current_school_id();
  IF v_school IS NULL THEN
    RAISE EXCEPTION 'PROBE: the jwt claim did not take';
  END IF;

  INSERT INTO public.fee_automation (id, token_hash)
  VALUES (true, extensions.crypt('probe-token', extensions.gen_salt('bf')))
  ON CONFLICT (id) DO UPDATE SET token_hash = EXCLUDED.token_hash;

  /* ---------- 1. a wrong token is refused ---------- */

  BEGIN
    PERFORM public.run_fee_generation('not-the-token', v_on);
  EXCEPTION WHEN insufficient_privilege THEN
    v_failed := true;
  END;

  IF NOT v_failed THEN
    RAISE EXCEPTION 'PROBE FAILED: a wrong token was accepted';
  END IF;
  RAISE NOTICE 'PROBE: a wrong token was refused';

  /* ---------- 2. switched off means nothing is billed ---------- */

  UPDATE public.settings
     SET value = value - 'auto_generate_enabled'
   WHERE school_id = v_school AND key = 'fees';

  v_result := public.run_fee_generation('probe-token', v_on);

  IF jsonb_array_length(v_result -> 'schools') <> 0 THEN
    RAISE EXCEPTION 'PROBE FAILED: a school with automation off was billed anyway: %', v_result;
  END IF;
  RAISE NOTICE 'PROBE: automation off billed nothing, which is the shipped default';

  /* ---------- 3. switched on, on the right day, bills ---------- */

  INSERT INTO public.settings (school_id, key, value)
  VALUES (v_school, 'fees', jsonb_build_object(
    'auto_generate_enabled', 'true',
    'auto_generate_day', EXTRACT(DAY FROM v_on)::text,
    'due_day', '10'
  ))
  ON CONFLICT (school_id, key) DO UPDATE
    SET value = public.settings.value || EXCLUDED.value;

  v_result := public.run_fee_generation('probe-token', v_on);

  RAISE NOTICE 'PROBE: run returned %', v_result;

  IF jsonb_array_length(v_result -> 'schools') <> 1 THEN
    RAISE EXCEPTION 'PROBE FAILED: expected exactly one school in the run, got %',
      jsonb_array_length(v_result -> 'schools');
  END IF;

  IF (v_result -> 'schools' -> 0) ? 'error' THEN
    RAISE EXCEPTION 'PROBE FAILED: the run errored: %', v_result -> 'schools' -> 0 -> 'error';
  END IF;

  v_made := ((v_result -> 'schools' -> 0) ->> 'made')::integer;
  RAISE NOTICE 'PROBE: % voucher(s) raised unattended', v_made;

  /* ---------- 4. running twice does not bill twice ---------- */

  v_result := public.run_fee_generation('probe-token', v_on);
  IF ((v_result -> 'schools' -> 0) ->> 'made')::integer <> 0 THEN
    RAISE EXCEPTION 'PROBE FAILED: a second run on the same day billed % more vouchers',
      (v_result -> 'schools' -> 0) ->> 'made';
  END IF;
  RAISE NOTICE 'PROBE: a repeat run raised nothing -- retries are safe';

  /* ---------- 5. the wrong day of the month bills nothing ---------- */

  UPDATE public.settings
     SET value = value || jsonb_build_object('auto_generate_day',
           CASE WHEN EXTRACT(DAY FROM v_on)::integer = 1 THEN '2' ELSE '1' END)
   WHERE school_id = v_school AND key = 'fees';

  v_result := public.run_fee_generation('probe-token', v_on);
  IF jsonb_array_length(v_result -> 'schools') <> 0 THEN
    RAISE EXCEPTION 'PROBE FAILED: billed on a day the school did not name';
  END IF;
  RAISE NOTICE 'PROBE: nothing billed on a day the school did not choose';

  IF (SELECT last_run_at FROM public.fee_automation WHERE id = true) IS NULL THEN
    RAISE EXCEPTION 'PROBE FAILED: the run was not recorded';
  END IF;

  RAISE NOTICE 'CRON PROBE OK: every step passed';
END
$cron$;
