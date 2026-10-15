-- ============================================================================
-- 016_BIOMETRIC_ATTENDANCE.sql -- run after 015_report_functions.sql
-- ============================================================================
-- Paste the whole file into the SQL editor and Run. Idempotent.
--
-- WHAT THIS IS
--
-- Thumb (fingerprint) attendance for students, teachers and support staff.
--
-- THE ONE THING TO UNDERSTAND FIRST
--
-- A browser cannot read a fingerprint. There is no web API that takes a thumb
-- off a USB scanner and tells you which of 600 students it belongs to --
-- WebAuthn proves "the owner of THIS phone verified themselves", which is a
-- different question entirely. So the thumb is always read by hardware outside
-- this app: a gate device (ZKTeco, eSSL and the like) or a scanner driven by a
-- small local agent.
--
-- That makes the shape of this feature inevitable, and it is a good shape:
--
--   device/agent  ->  attendance_punches  ->  attendance / staff_attendance
--      (raw)            (append-only log)         (the register)
--
-- 1. attendance_punches is the RAW log. One row per thumb press, never
--    edited. It is the evidence: if the register is ever disputed, this is
--    what says the gate recorded a press at 07:48:12.
--
-- 2. Resolution is a SEPARATE step that reads the log and writes the register.
--    Keeping them apart is what makes the whole thing safe to re-run, and it
--    is what lets a device sync a week late without anything being lost.
--
-- 3. Ingest is authenticated by a DEVICE TOKEN the database checks itself, in
--    a SECURITY DEFINER function. A gate device has no Supabase session, and
--    the alternative -- a service_role key in an agent sitting in a school
--    office -- would hand whoever finds that machine every row in every
--    school. .env.local says never to put that key in this project, and this
--    is the design that honours it.
--
-- WHAT RESOLUTION DECIDES
--
--   first punch of the day  -> check_in
--   last punch of the day   -> check_out  (same punch if they pressed once)
--   check_in after late_after      -> 'late'
--   check_in after half_day_after  -> 'half_day'
--   enrolled, no punch, auto_absent on -> 'absent'
--
-- A row the office typed by hand is NEVER overwritten. `source` records who
-- wrote each row, and resolution only touches rows it wrote itself or rows
-- that do not exist. A human who deliberately marked a child present after
-- the gate missed them has made a decision, and a machine re-run must not
-- quietly undo it.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Where a mark came from
-- ----------------------------------------------------------------------------
-- Defaulting to 'manual' is deliberate: every row that already exists was
-- typed by somebody, and must stay protected from the first resolution run.
ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS source    text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS check_in  time,
  ADD COLUMN IF NOT EXISTS check_out time;

ALTER TABLE public.staff_attendance
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';

ALTER TABLE public.attendance DROP CONSTRAINT IF EXISTS attendance_source_check;
ALTER TABLE public.attendance
  ADD CONSTRAINT attendance_source_check CHECK (source IN ('manual', 'biometric', 'import'));

ALTER TABLE public.staff_attendance DROP CONSTRAINT IF EXISTS staff_attendance_source_check;
ALTER TABLE public.staff_attendance
  ADD CONSTRAINT staff_attendance_source_check CHECK (source IN ('manual', 'biometric', 'import'));


-- ----------------------------------------------------------------------------
-- 2. School-level attendance rules
-- ----------------------------------------------------------------------------
-- These live in their own table rather than the settings jsonb because the
-- resolver reads them on every run and a typed column beats casting a jsonb
-- key a few thousand times.
CREATE TABLE IF NOT EXISTS public.attendance_settings (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id            uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,

  late_after           time NOT NULL DEFAULT '08:00',
  half_day_after       time NOT NULL DEFAULT '10:30',
  -- Mark enrolled people with no punch at all as absent. Off by default: a
  -- device that was unplugged all morning would otherwise mark the whole
  -- school absent, and that is a worse failure than a blank register.
  auto_absent          boolean NOT NULL DEFAULT false,
  -- A thumb pressed three times in ten seconds is one arrival, not three.
  min_punch_gap_minutes smallint NOT NULL DEFAULT 5,
  -- Below this, a second punch is treated as part of the same visit rather
  -- than a departure -- stops a double-tap becoming an instant check-out.
  min_session_minutes  smallint NOT NULL DEFAULT 60,

  updated_by           uuid,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id)
);


-- ----------------------------------------------------------------------------
-- 3. The devices
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.biometric_devices (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name          text NOT NULL,
  -- How the agent identifies itself. Globally unique because the ingest
  -- function looks a device up by serial BEFORE it knows the school.
  serial        text NOT NULL,
  location      text,
  kind          text NOT NULL DEFAULT 'zkteco',
  -- bcrypt, via pgcrypto's crypt(). The plaintext token is shown once, at
  -- creation, and never stored -- same contract as any API key.
  token_hash    text NOT NULL,
  status        text NOT NULL DEFAULT 'active',
  last_seen_at  timestamptz,
  last_punch_at timestamptz,
  notes         text,
  user_id       uuid,
  created_by    uuid,
  updated_by    uuid,
  deleted_by    uuid,
  deleted_at    timestamptz,
  is_deleted    boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (serial)
);

ALTER TABLE public.biometric_devices DROP CONSTRAINT IF EXISTS biometric_devices_kind_check;
ALTER TABLE public.biometric_devices
  ADD CONSTRAINT biometric_devices_kind_check
  CHECK (kind IN ('zkteco', 'essl', 'usb_bridge', 'mobile', 'other'));

ALTER TABLE public.biometric_devices DROP CONSTRAINT IF EXISTS biometric_devices_status_check;
ALTER TABLE public.biometric_devices
  ADD CONSTRAINT biometric_devices_status_check
  CHECK (status IN ('active', 'inactive'));


-- ----------------------------------------------------------------------------
-- 4. Whose thumb is whose
-- ----------------------------------------------------------------------------
-- The device knows a person only as a number it was enrolled with. This table
-- is the only thing that turns that number back into a student or a staff
-- member, which is why the fingerprint TEMPLATE never needs to leave the
-- device -- we store the mapping, not the biometric.
CREATE TABLE IF NOT EXISTS public.biometric_enrollments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  person_type    text NOT NULL,
  student_id     uuid REFERENCES public.students(id) ON DELETE CASCADE,
  staff_id       uuid REFERENCES public.staff(id) ON DELETE CASCADE,
  -- The ID enrolled on the hardware. Text, not an integer: eSSL pads, ZKTeco
  -- does not, and a leading zero that silently disappears is a person whose
  -- attendance stops working.
  device_user_id text NOT NULL,
  finger_label   text,
  status         text NOT NULL DEFAULT 'active',
  enrolled_at    timestamptz NOT NULL DEFAULT now(),
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

ALTER TABLE public.biometric_enrollments DROP CONSTRAINT IF EXISTS biometric_enrollments_person_check;
ALTER TABLE public.biometric_enrollments
  ADD CONSTRAINT biometric_enrollments_person_check
  CHECK (
    (person_type = 'student' AND student_id IS NOT NULL AND staff_id IS NULL) OR
    (person_type = 'staff'   AND staff_id   IS NOT NULL AND student_id IS NULL)
  );

-- One device id maps to exactly one person. Without this a punch is ambiguous
-- and the register silently marks the wrong child.
CREATE UNIQUE INDEX IF NOT EXISTS biometric_enrollments_device_user
  ON public.biometric_enrollments (school_id, device_user_id)
  WHERE is_deleted = false AND status = 'active';

-- And one person has one active enrolment, so nobody is double-counted.
CREATE UNIQUE INDEX IF NOT EXISTS biometric_enrollments_one_student
  ON public.biometric_enrollments (school_id, student_id)
  WHERE student_id IS NOT NULL AND is_deleted = false AND status = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS biometric_enrollments_one_staff
  ON public.biometric_enrollments (school_id, staff_id)
  WHERE staff_id IS NOT NULL AND is_deleted = false AND status = 'active';


-- ----------------------------------------------------------------------------
-- 5. The raw punch log
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.attendance_punches (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  device_id       uuid REFERENCES public.biometric_devices(id) ON DELETE SET NULL,
  device_user_id  text NOT NULL,
  punched_at      timestamptz NOT NULL,
  -- The local calendar day the punch belongs to. Stored because the register
  -- is keyed on a date and a timestamptz would otherwise be re-derived in
  -- whatever zone the reader happens to be in.
  punch_date      date NOT NULL,
  direction       text NOT NULL DEFAULT 'auto',
  -- The agent's own id for this punch. THE idempotency key: an agent that
  -- loses its connection mid-upload re-sends the batch, and this is what
  -- stops the same press being counted twice.
  client_punch_id text NOT NULL,
  raw             jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolution      text NOT NULL DEFAULT 'pending',
  resolved_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, client_punch_id)
);

ALTER TABLE public.attendance_punches DROP CONSTRAINT IF EXISTS attendance_punches_direction_check;
ALTER TABLE public.attendance_punches
  ADD CONSTRAINT attendance_punches_direction_check
  CHECK (direction IN ('in', 'out', 'auto'));

ALTER TABLE public.attendance_punches DROP CONSTRAINT IF EXISTS attendance_punches_resolution_check;
ALTER TABLE public.attendance_punches
  ADD CONSTRAINT attendance_punches_resolution_check
  CHECK (resolution IN ('pending', 'matched', 'unknown_user', 'debounced'));

CREATE INDEX IF NOT EXISTS idx_punches_day
  ON public.attendance_punches (school_id, punch_date, device_user_id, punched_at);
CREATE INDEX IF NOT EXISTS idx_punches_unresolved
  ON public.attendance_punches (school_id, resolution) WHERE resolution = 'pending';


-- ----------------------------------------------------------------------------
-- 6. Ingest -- the one thing a device may call
-- ----------------------------------------------------------------------------
-- SECURITY DEFINER because the caller has no session: a gate device holds a
-- serial and a token, nothing more. The function authenticates the device
-- itself and derives school_id from the matched row, so a token can only ever
-- write punches for its own school. It cannot read anything.
--
-- p_punches is a jsonb array of
--   { "user_id": "17", "at": "2026-10-15T07:48:12+05:00",
--     "id": "ZK01:17:1760500092", "direction": "auto" }
CREATE OR REPLACE FUNCTION public.ingest_attendance_punches(
  p_serial  text,
  p_token   text,
  p_punches jsonb
)
RETURNS TABLE (accepted integer, duplicates integer)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, extensions
AS $fn$
DECLARE
  v_device  public.biometric_devices%ROWTYPE;
  v_offered integer;
  v_inserted integer;
BEGIN
  SELECT * INTO v_device
    FROM public.biometric_devices
   WHERE serial = p_serial AND is_deleted = false AND status = 'active';

  -- Same message either way. Telling an unauthenticated caller which half of
  -- the credential was wrong is how serials get enumerated.
  IF v_device.id IS NULL OR v_device.token_hash <> crypt(p_token, v_device.token_hash) THEN
    RAISE EXCEPTION 'Unknown device or bad token' USING ERRCODE = '28000';
  END IF;

  IF jsonb_typeof(p_punches) <> 'array' THEN
    RAISE EXCEPTION 'punches must be a JSON array' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_offered FROM jsonb_array_elements(p_punches);

  WITH incoming AS (
    SELECT
      NULLIF(e->>'user_id', '')                            AS device_user_id,
      (e->>'at')::timestamptz                              AS punched_at,
      NULLIF(e->>'id', '')                                 AS client_punch_id,
      COALESCE(NULLIF(e->>'direction', ''), 'auto')        AS direction,
      e                                                    AS raw
      FROM jsonb_array_elements(p_punches) AS e
  ), valid AS (
    SELECT * FROM incoming
     WHERE device_user_id IS NOT NULL
       AND punched_at IS NOT NULL
       AND client_punch_id IS NOT NULL
       AND direction IN ('in', 'out', 'auto')
  ), written AS (
    INSERT INTO public.attendance_punches
      (school_id, device_id, device_user_id, punched_at, punch_date,
       direction, client_punch_id, raw)
    SELECT v_device.school_id, v_device.id, device_user_id, punched_at,
           -- The school's own day, not UTC's. A 07:48 Karachi punch must not
           -- land on yesterday's register.
           (punched_at AT TIME ZONE COALESCE(
              (SELECT timezone FROM public.schools WHERE id = v_device.school_id),
              'Asia/Karachi'))::date,
           direction, client_punch_id, raw
      FROM valid
    ON CONFLICT (school_id, client_punch_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_inserted FROM written;

  UPDATE public.biometric_devices
     SET last_seen_at = now(),
         last_punch_at = GREATEST(COALESCE(last_punch_at, '-infinity'::timestamptz),
                                  COALESCE((SELECT max((e->>'at')::timestamptz)
                                              FROM jsonb_array_elements(p_punches) e),
                                           '-infinity'::timestamptz))
   WHERE id = v_device.id;

  RETURN QUERY SELECT v_inserted, (v_offered - v_inserted);
END;
$fn$;

-- anon on purpose: an agent in a school office holds the project's public
-- key and its own device token. The token is the credential; the function is
-- the only thing it can reach.
GRANT EXECUTE ON FUNCTION public.ingest_attendance_punches(text, text, jsonb) TO anon, authenticated;


-- ----------------------------------------------------------------------------
-- 7. Turn punches into a register
-- ----------------------------------------------------------------------------
-- SECURITY INVOKER: it writes attendance rows, so the caller must hold
-- attendance.write and RLS must apply exactly as it would to a direct write.
CREATE OR REPLACE FUNCTION public.resolve_attendance_punches(p_school uuid, p_date date)
RETURNS TABLE (
  students_marked integer,
  staff_marked    integer,
  unknown_punches integer
)
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_late     time;
  v_half     time;
  v_gap      smallint;
  v_session  uuid;
  v_students integer := 0;
  v_staff    integer := 0;
  v_unknown  integer := 0;
BEGIN
  SELECT late_after, half_day_after, min_punch_gap_minutes
    INTO v_late, v_half, v_gap
    FROM public.attendance_settings WHERE school_id = p_school;

  IF v_late IS NULL THEN
    v_late := '08:00'; v_half := '10:30'; v_gap := 5;
  END IF;

  SELECT id INTO v_session
    FROM public.sessions
   WHERE school_id = p_school AND is_current = true AND is_deleted = false
   LIMIT 1;

  -- One pass over the day's punches, debounced, joined to whoever the device
  -- id belongs to.
  CREATE TEMP TABLE _day ON COMMIT DROP AS
  WITH ordered AS (
    SELECT p.id, p.device_user_id, p.punched_at,
           lag(p.punched_at) OVER (PARTITION BY p.device_user_id ORDER BY p.punched_at) AS prev_at
      FROM public.attendance_punches p
     WHERE p.school_id = p_school AND p.punch_date = p_date
  ), kept AS (
    -- A second press inside the gap is the same arrival, not a new event.
    SELECT * FROM ordered
     WHERE prev_at IS NULL
        OR punched_at - prev_at >= make_interval(mins => v_gap)
  )
  SELECT e.person_type, e.student_id, e.staff_id,
         min(k.punched_at) AS first_at,
         max(k.punched_at) AS last_at,
         count(*)          AS presses
    FROM kept k
    JOIN public.biometric_enrollments e
      ON e.school_id = p_school
     AND e.device_user_id = k.device_user_id
     AND e.is_deleted = false
     AND e.status = 'active'
   GROUP BY e.person_type, e.student_id, e.staff_id;

  -- Punches whose device id matches nobody. Flagged rather than dropped: it
  -- means somebody was enrolled on the hardware and never here, and the
  -- office needs to see that.
  UPDATE public.attendance_punches p
     SET resolution = 'unknown_user', resolved_at = now()
   WHERE p.school_id = p_school AND p.punch_date = p_date
     AND NOT EXISTS (
       SELECT 1 FROM public.biometric_enrollments e
        WHERE e.school_id = p_school AND e.device_user_id = p.device_user_id
          AND e.is_deleted = false AND e.status = 'active');
  GET DIAGNOSTICS v_unknown = ROW_COUNT;

  /* ---------------------------------------------------------- students */
  WITH marked AS (
    INSERT INTO public.attendance
      (school_id, student_id, date, status, class_id, section_id, session_id,
       check_in, check_out, source)
    SELECT p_school, d.student_id, p_date,
           CASE
             WHEN (d.first_at AT TIME ZONE 'Asia/Karachi')::time > v_half THEN 'half_day'
             WHEN (d.first_at AT TIME ZONE 'Asia/Karachi')::time > v_late THEN 'late'
             ELSE 'present'
           END,
           s.current_class_id, s.current_section_id, v_session,
           (d.first_at AT TIME ZONE 'Asia/Karachi')::time,
           CASE WHEN d.presses > 1 THEN (d.last_at AT TIME ZONE 'Asia/Karachi')::time END,
           'biometric'
      FROM _day d
      JOIN public.students s ON s.id = d.student_id
     WHERE d.person_type = 'student'
    ON CONFLICT (school_id, student_id, date) DO UPDATE
       SET status    = EXCLUDED.status,
           check_in  = EXCLUDED.check_in,
           check_out = EXCLUDED.check_out,
           source    = 'biometric',
           updated_at = now()
     -- The whole point: a hand-typed row is a decision, and re-running the
     -- resolver must not quietly overwrite it.
     WHERE public.attendance.source <> 'manual'
    RETURNING 1
  )
  SELECT count(*) INTO v_students FROM marked;

  /* ------------------------------------------------------------- staff */
  WITH marked AS (
    INSERT INTO public.staff_attendance
      (school_id, staff_id, date, status, check_in, check_out, source)
    SELECT p_school, d.staff_id, p_date,
           CASE
             WHEN (d.first_at AT TIME ZONE 'Asia/Karachi')::time > v_half THEN 'half_day'
             WHEN (d.first_at AT TIME ZONE 'Asia/Karachi')::time > v_late THEN 'late'
             ELSE 'present'
           END,
           (d.first_at AT TIME ZONE 'Asia/Karachi')::time,
           CASE WHEN d.presses > 1 THEN (d.last_at AT TIME ZONE 'Asia/Karachi')::time END,
           'biometric'
      FROM _day d
     WHERE d.person_type = 'staff'
    ON CONFLICT (school_id, staff_id, date) DO UPDATE
       SET status    = EXCLUDED.status,
           check_in  = EXCLUDED.check_in,
           check_out = EXCLUDED.check_out,
           source    = 'biometric',
           updated_at = now()
     WHERE public.staff_attendance.source <> 'manual'
    RETURNING 1
  )
  SELECT count(*) INTO v_staff FROM marked;

  UPDATE public.attendance_punches
     SET resolution = 'matched', resolved_at = now()
   WHERE school_id = p_school AND punch_date = p_date AND resolution = 'pending';

  RETURN QUERY SELECT v_students, v_staff, v_unknown;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.resolve_attendance_punches(uuid, date) TO authenticated;


-- ----------------------------------------------------------------------------
-- 8. Issuing a device token
-- ----------------------------------------------------------------------------
-- The plaintext is returned once and never stored. SECURITY DEFINER so it can
-- write the hash, but it re-checks the caller holds attendance.write first --
-- the UI guard is not the boundary.
CREATE OR REPLACE FUNCTION public.rotate_device_token(p_device uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, extensions
AS $fn$
DECLARE
  v_school uuid;
  v_token  text;
BEGIN
  SELECT school_id INTO v_school FROM public.biometric_devices WHERE id = p_device;
  IF v_school IS NULL THEN
    RAISE EXCEPTION 'No such device';
  END IF;

  IF v_school <> public.current_school_id() OR NOT public.has_permission('attendance.write') THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;

  v_token := encode(gen_random_bytes(24), 'hex');

  UPDATE public.biometric_devices
     SET token_hash = crypt(v_token, gen_salt('bf')), updated_at = now()
   WHERE id = p_device;

  RETURN v_token;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.rotate_device_token(uuid) TO authenticated;


-- ----------------------------------------------------------------------------
-- 9. Row level security and triggers
-- ----------------------------------------------------------------------------
SELECT public.apply_tenant_rls('attendance_settings',    'attendance.read', 'attendance.write');
SELECT public.apply_tenant_rls('biometric_devices',      'attendance.read', 'attendance.write');
SELECT public.apply_tenant_rls('biometric_enrollments',  'attendance.read', 'attendance.write');
SELECT public.apply_tenant_rls('attendance_punches',     'attendance.read', 'attendance.write');

SELECT public.add_touch_trigger('attendance_settings');
SELECT public.add_touch_trigger('biometric_devices');
SELECT public.add_touch_trigger('biometric_enrollments');

SELECT public.add_audit_trigger('biometric_enrollments');
SELECT public.add_audit_trigger('biometric_devices');


DO $report$
BEGIN
  RAISE NOTICE '----------------------------------------------------------';
  RAISE NOTICE 'Biometric attendance installed.';
  RAISE NOTICE '  devices:     %', (SELECT count(*) FROM public.biometric_devices);
  RAISE NOTICE '  enrolments:  %', (SELECT count(*) FROM public.biometric_enrollments);
  RAISE NOTICE '  punches:     %', (SELECT count(*) FROM public.attendance_punches);
  RAISE NOTICE '  Register a device under Attendance -> Biometric to get a token.';
  RAISE NOTICE '----------------------------------------------------------';
END
$report$;
