-- Drives the new fee functions as a real signed-in administrator, inside the
-- dry run's transaction. auth.uid() reads request.jwt.claims, so setting the
-- claim is what makes current_school_id() and has_permission() answer the way
-- they will for a person at a screen -- which is the only way to find out
-- whether these functions work before shipping them.
SET LOCAL request.jwt.claims = '{"sub":"56e07697-2065-4d71-9805-22bf82e0ce06","role":"authenticated"}';

CREATE TEMP TABLE probe_student (id uuid) ON COMMIT DROP;

DO $probe$
DECLARE
  v_student  uuid;
  v_challan  uuid;
  v_lines    integer;
  v_total    numeric;
  v_result   jsonb;
  v_balance  numeric;
  v_credit   numeric;
  v_second   uuid;
  v_applied  numeric;
  v_payable  numeric;
BEGIN
  IF public.current_school_id() IS NULL THEN
    RAISE EXCEPTION 'PROBE: the jwt claim did not take -- current_school_id() is null';
  END IF;
  IF NOT public.has_permission('fees.write') THEN
    RAISE EXCEPTION 'PROBE: administrator cannot write fees';
  END IF;
  RAISE NOTICE 'PROBE: acting as the administrator of school %', public.current_school_id();

  -- A student with a fee on file, in a class that has a policy.
  SELECT s.id INTO v_student
    FROM public.students s
    JOIN public.fee_policies p
      ON p.class_id = s.current_class_id AND p.is_deleted = false AND p.status = 'active'
   WHERE s.school_id = public.current_school_id()
     AND s.is_deleted = false AND s.status = 'active'
   ORDER BY s.id
   LIMIT 1;

  IF v_student IS NULL THEN
    RAISE EXCEPTION 'PROBE: no active student sits in a class with an active fee policy';
  END IF;

  INSERT INTO probe_student VALUES (v_student);

  SELECT fee_balance INTO v_balance FROM public.students WHERE id = v_student;
  RAISE NOTICE 'PROBE: student % opens at balance %', v_student, v_balance;

  /* ---------- 1. one voucher covering five months ---------- */

  v_challan := public.raise_fee_voucher(v_student, '2027-01-01'::date, 5, '2027-01-10'::date, NULL);

  IF v_challan IS NULL THEN
    RAISE EXCEPTION 'PROBE FAILED: five-month voucher produced nothing';
  END IF;

  SELECT count(*), COALESCE(SUM(amount), 0) INTO v_lines, v_total
    FROM public.fee_challan_items WHERE challan_id = v_challan AND is_deleted = false;

  RAISE NOTICE 'PROBE: voucher has % lines totalling %', v_lines, v_total;

  IF v_lines < 5 THEN
    RAISE EXCEPTION 'PROBE FAILED: expected at least 5 monthly lines, got %', v_lines;
  END IF;

  IF (SELECT period_to FROM public.fee_challans WHERE id = v_challan) <> '2027-05-01'::date THEN
    RAISE EXCEPTION 'PROBE FAILED: the voucher does not span to May 2027';
  END IF;

  /* ---------- 2. the same months cannot be billed twice ---------- */

  IF public.raise_fee_voucher(v_student, '2027-01-01'::date, 5, NULL, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'PROBE FAILED: the same five months were billed a second time';
  END IF;
  RAISE NOTICE 'PROBE: re-billing those months correctly produced nothing';

  /* ---------- 3. one payment clearing several bills, with change ---------- */

  SELECT fee_balance INTO v_balance FROM public.students WHERE id = v_student;

  v_result := public.collect_fee(
    v_student, v_balance + 7000, 'cash', 'probe', now(), 'probe payment', NULL
  );

  RAISE NOTICE 'PROBE: receipt % allocated % across % challans, % left as credit',
    v_result ->> 'receipt_no', v_result ->> 'allocated', v_result ->> 'challans', v_result ->> 'credit';

  IF (v_result ->> 'credit')::numeric <> 7000 THEN
    RAISE EXCEPTION 'PROBE FAILED: expected 7000 credit, got %', v_result ->> 'credit';
  END IF;

  IF (v_result ->> 'challans')::integer < 1 THEN
    RAISE EXCEPTION 'PROBE FAILED: the payment cleared no challans';
  END IF;

  SELECT fee_balance INTO v_balance FROM public.students WHERE id = v_student;
  IF v_balance <> -7000 THEN
    RAISE EXCEPTION 'PROBE FAILED: balance should be -7000 (in credit), is %', v_balance;
  END IF;
  RAISE NOTICE 'PROBE: balance is now % -- the family is in credit', v_balance;

  IF EXISTS (
    SELECT 1 FROM public.fee_challans
     WHERE student_id = v_student AND is_deleted = false AND status <> 'cancelled'
       AND COALESCE(net_amount, amount, 0) > COALESCE(paid_amount, 0)
  ) THEN
    RAISE EXCEPTION 'PROBE FAILED: a challan is still outstanding after paying the lot';
  END IF;
  RAISE NOTICE 'PROBE: every challan reads paid';

  /* ---------- 4. the next voucher settles itself from that credit ---------- */

  v_credit := public.available_credit(v_student);
  IF v_credit <> 7000 THEN
    RAISE EXCEPTION 'PROBE FAILED: available credit should be 7000, is %', v_credit;
  END IF;

  v_second := public.raise_fee_voucher(v_student, '2027-06-01'::date, 1, '2027-06-10'::date, NULL);
  IF v_second IS NULL THEN
    RAISE EXCEPTION 'PROBE FAILED: June voucher produced nothing';
  END IF;

  SELECT credit_applied, payable, COALESCE(net_amount, amount)
    INTO v_applied, v_payable, v_total
    FROM public.fee_challans WHERE id = v_second;

  RAISE NOTICE 'PROBE: June voucher is %, credit applied %, payable %', v_total, v_applied, v_payable;

  IF v_applied <= 0 THEN
    RAISE EXCEPTION 'PROBE FAILED: credit was not applied to the new voucher';
  END IF;
  IF v_payable <> GREATEST(0, v_total - v_applied) THEN
    RAISE EXCEPTION 'PROBE FAILED: payable % does not equal % less %', v_payable, v_total, v_applied;
  END IF;

  /* ---------- 5. the ledger reads as a statement ---------- */

  IF NOT EXISTS (SELECT 1 FROM public.student_ledger(v_student, NULL)) THEN
    RAISE EXCEPTION 'PROBE FAILED: student_ledger returned nothing';
  END IF;
  RAISE NOTICE 'PROBE: ledger has % entries', (SELECT count(*) FROM public.student_ledger(v_student, NULL));


  /* ---------- 6. the typed-in voucher: a fine, a trip, a one-off ---------- */

  v_challan := public.raise_manual_voucher(
    v_student, '2027-07-01'::date, 'transport', 1500, '2027-07-10'::date, 'Picnic bus'
  );
  IF v_challan IS NULL THEN
    RAISE EXCEPTION 'PROBE FAILED: manual voucher produced nothing';
  END IF;

  SELECT count(*) INTO v_lines
    FROM public.fee_challan_items WHERE challan_id = v_challan AND is_deleted = false;
  IF v_lines <> 1 THEN
    RAISE EXCEPTION 'PROBE FAILED: manual voucher should carry exactly one line, has %', v_lines;
  END IF;

  IF (SELECT COALESCE(net_amount, amount) FROM public.fee_challans WHERE id = v_challan) <> 1500 THEN
    RAISE EXCEPTION 'PROBE FAILED: manual voucher total is not 1500';
  END IF;

  IF public.raise_manual_voucher(
       v_student, '2027-07-01'::date, 'transport', 1500, NULL, 'Picnic bus again'
     ) IS NOT NULL THEN
    RAISE EXCEPTION 'PROBE FAILED: the same month and type was billed twice by hand';
  END IF;
  RAISE NOTICE 'PROBE: manual voucher written once, refused the second time';


  /* ---------- 7. the counter's view of this family ---------- */

  SELECT d.balance, d.credit, d.open_challans
    INTO v_balance, v_credit, v_lines
    FROM public.fee_dues() d
   WHERE d.student_id = v_student;

  IF v_balance IS NULL THEN
    RAISE EXCEPTION 'PROBE FAILED: fee_dues() does not list the student';
  END IF;

  RAISE NOTICE 'PROBE: counter sees balance %, credit %, % open bills', v_balance, v_credit, v_lines;

  IF v_balance <> (SELECT fee_balance FROM public.students WHERE id = v_student) THEN
    RAISE EXCEPTION 'PROBE FAILED: fee_dues() balance disagrees with the student record';
  END IF;

  IF v_credit <> public.available_credit(v_student) THEN
    RAISE EXCEPTION 'PROBE FAILED: fee_dues() credit % disagrees with available_credit() %',
      v_credit, public.available_credit(v_student);
  END IF;


  /* ---------- 8. a split naming a challan that is not theirs ---------- */

  -- A stale screen, or a mistyped id. The money must not be treated as spent
  -- just because the allocation failed to land: it stays as credit, and the
  -- receipt total still equals what the parent handed over.
  v_challan := public.raise_manual_voucher(
    v_student, '2027-08-01'::date, 'monthly', 2000, '2027-08-10'::date, 'August'
  );

  v_result := public.collect_fee(
    v_student, 2000, 'cash', 'bad-split', now(), NULL,
    jsonb_build_array(
      jsonb_build_object('challan_id', gen_random_uuid(), 'amount', 2000)
    )
  );

  RAISE NOTICE 'PROBE: bad split -- allocated %, credit %, challans %',
    v_result ->> 'allocated', v_result ->> 'credit', v_result ->> 'challans';

  IF (v_result ->> 'allocated')::numeric <> 0 THEN
    RAISE EXCEPTION 'PROBE FAILED: % was reported allocated to a challan that does not exist',
      v_result ->> 'allocated';
  END IF;

  IF (v_result ->> 'credit')::numeric <> 2000 THEN
    RAISE EXCEPTION 'PROBE FAILED: the money vanished -- expected 2000 credit, got %',
      v_result ->> 'credit';
  END IF;

  IF (SELECT COALESCE(SUM(amount), 0) FROM public.fee_payment_allocations
       WHERE payment_id = (v_result ->> 'payment_id')::uuid) <> 0 THEN
    RAISE EXCEPTION 'PROBE FAILED: an allocation was written for a foreign challan';
  END IF;
  RAISE NOTICE 'PROBE: a bad split kept the money as credit instead of losing it';

  RAISE NOTICE 'PROBE OK: every step passed';
END
$probe$;

-- The statement the parent would be handed, for the eyes.
SELECT to_char(entry_date, 'DD Mon') AS on_date,
       description,
       debit, credit, balance
  FROM public.student_ledger((SELECT id FROM probe_student), NULL);
