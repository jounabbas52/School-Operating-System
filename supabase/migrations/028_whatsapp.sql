-- ============================================================================
-- 028_WHATSAPP.sql -- run after 027_delete_user.sql
-- ============================================================================
-- Paste the whole file into the SQL editor and Run. Idempotent.
--
-- WHAT THIS IS
--
-- WhatsApp to parents over a LINKED DEVICE -- the school scans a QR code
-- with the phone that already holds their number, exactly as they would to
-- use WhatsApp Web, and the app then sends from that session.
--
-- No Meta business verification, no approved templates, no per-message
-- charge, and no 24-hour reply window. Any text, to anyone, at any time.
--
-- WHAT IT COSTS INSTEAD, AND IT IS NOT NOTHING
--
-- This is not an API WhatsApp publishes. The number can be banned, and
-- bursts are what trigger it far more than volume. Three things in this
-- schema exist solely to protect the number, and removing them is how a
-- school loses the line their parents actually read:
--
--   daily_cap     a ceiling per school per day
--   quiet hours   nothing sends overnight
--   the queue     sends trickle out one at a time, paced by the gateway
--
-- WHERE THE SESSION LIVES -- AND WHY THERE ARE NO SECRETS IN THIS FILE
--
-- The Signal keys that ARE the linked device are held by whatsapp-gateway/,
-- a resident Node process, on its own disk. Postgres never sees them. So
-- unlike a Cloud API design there is no token column here to protect: the
-- worst this schema can leak is a phone number and a message body, both of
-- which the school already holds in plain sight.
--
--   server action  ->  whatsapp_messages  ->  dispatcher  ->  gateway -> phone
--      (queued)          (the outbox)          (drains)      (socket)
--                              ^                                 |
--                              +------- /api/whatsapp/events <----+
--                                   (receipts, replies, session state)
--
-- Queueing and SENDING are separate because they must be. The gateway paces
-- sends at one every few seconds; 400 fee reminders is therefore twenty-odd
-- minutes of trickle, which cannot happen inside an HTTP request. Rows go in
-- as 'queued' and the dispatcher drains them. If anything crashes, the queue
-- is still the truth about who has been told.
--
-- HOW THE MACHINE CALLERS AUTHENTICATE
--
-- The dispatcher and the gateway have no Supabase session. Both present one
-- platform token that the database checks itself, inside SECURITY DEFINER
-- functions -- the pattern 017 uses for gate devices, for the same reason.
-- .env.local says never to put the service_role key in this project, and
-- this is the design that honours it.
--
-- Section 8 MINTS that token and prints it once. Copy it into .env.local as
-- WHATSAPP_INGEST_TOKEN, and give the gateway the same value.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0. Upgrade from the Cloud API shape, if this database has it
-- ----------------------------------------------------------------------------
-- An earlier cut of this file built the same feature on Meta's Cloud API.
-- Some databases ran it. This section converts those in place and is a
-- no-op on a database that never saw it -- every statement is guarded.
--
-- WHY THE FUNCTIONS MUST BE DROPPED RATHER THAN REPLACED
--
-- CREATE OR REPLACE FUNCTION cannot change a return type: it raises
-- "cannot change return type of existing function" and the whole migration
-- stops. Worse, where the ARGUMENTS changed it would not replace anything
-- at all -- it would create a second overload sitting alongside the first,
-- and PostgREST would then have two candidates and refuse to call either.
-- Both of those are silent until something tries to send a message.
DROP FUNCTION IF EXISTS public.whatsapp_claim_batch(text, integer);
DROP FUNCTION IF EXISTS public.whatsapp_ingest_events(text, jsonb);
DROP FUNCTION IF EXISTS public.whatsapp_record_send(text, uuid, boolean, text, text, text);
DROP FUNCTION IF EXISTS public.whatsapp_enqueue(jsonb, uuid, text, text);

-- whatsapp_settings: the Meta credentials go, the session state arrives.
ALTER TABLE IF EXISTS public.whatsapp_settings
  ADD COLUMN IF NOT EXISTS session_status    text NOT NULL DEFAULT 'disconnected',
  ADD COLUMN IF NOT EXISTS linked_number     text,
  ADD COLUMN IF NOT EXISTS last_connected_at timestamptz;

ALTER TABLE IF EXISTS public.whatsapp_settings
  DROP COLUMN IF EXISTS phone_number_id,
  DROP COLUMN IF EXISTS waba_id,
  DROP COLUMN IF EXISTS access_token,
  DROP COLUMN IF EXISTS display_number;

-- AND GIVE THE TABLE BACK ITS ORDINARY SELECT GRANT.
--
-- The Cloud API version revoked table-wide SELECT and granted a named
-- column list, because access_token lived here and had to be unreadable.
-- That column is gone, so there is no longer a secret to protect -- but the
-- revoke would persist, and every `select('*')` on this table would keep
-- failing with a permission error that looks nothing like its cause.
GRANT SELECT ON public.whatsapp_settings TO authenticated, anon;

-- whatsapp_templates: these are saved messages now, not Meta templates.
-- Nothing is submitted for approval, so the approval machinery goes.
DROP INDEX IF EXISTS public.whatsapp_templates_name_lang;
ALTER TABLE IF EXISTS public.whatsapp_templates
  DROP COLUMN IF EXISTS language,
  DROP COLUMN IF EXISTS category,
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS rejection_note;

-- whatsapp_messages: no template language, and no Meta pricing category.
ALTER TABLE IF EXISTS public.whatsapp_messages
  DROP COLUMN IF EXISTS template_lang,
  DROP COLUMN IF EXISTS pricing_category,
  DROP COLUMN IF EXISTS error_code;

-- body carried the rendered text before and carries it now, but it was
-- nullable: on this channel a message IS its text, and a null one would be
-- a blank chat bubble sent to a parent.
-- CREATE TABLE IF NOT EXISTS below will NOT tighten an existing column, so
-- the constraint has to be applied here for a database being upgraded.
UPDATE public.whatsapp_messages  SET body = '' WHERE body IS NULL;
UPDATE public.whatsapp_templates SET body = '' WHERE body IS NULL;

DO $upgrade$
BEGIN
  IF to_regclass('public.whatsapp_messages') IS NOT NULL THEN
    ALTER TABLE public.whatsapp_messages  ALTER COLUMN body SET NOT NULL;
  END IF;
  IF to_regclass('public.whatsapp_templates') IS NOT NULL THEN
    ALTER TABLE public.whatsapp_templates ALTER COLUMN body SET NOT NULL;
  END IF;
END
$upgrade$;


-- ----------------------------------------------------------------------------
-- 1. The module
-- ----------------------------------------------------------------------------
INSERT INTO public.modules (code, name, category, is_core, sort_order, description) VALUES
  ('whatsapp', 'WhatsApp', 'general', false, 175, 'WhatsApp to parents from a linked device')
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name, category = EXCLUDED.category,
      sort_order = EXCLUDED.sort_order, description = EXCLUDED.description;

INSERT INTO public.plan_modules (plan_id, module_code)
SELECT pm.plan_id, 'whatsapp'
  FROM public.plan_modules pm
 WHERE pm.module_code = 'notifications'
ON CONFLICT DO NOTHING;

-- AND BACKFILL THE SCHOOLS THEMSELVES. This line is not optional.
--
-- school_modules is written once, by provision_school(), from the plan as it
-- stood on the day the school was created. A module added to a plan later
-- reaches nobody: every existing school still has no row for it, and
-- school_has_module() therefore returns false.
--
-- The consequence is silent and total. has_permission() gates EVERY
-- 'whatsapp.*' code on that function -- including the administrator
-- short-circuit -- so without this the sidebar entry never renders, the RLS
-- policies refuse every row, and whatsapp_enqueue() raises "you do not have
-- permission" for the school's own owner. Nothing in the UI explains why.
INSERT INTO public.school_modules (school_id, module_code)
SELECT s.id, 'whatsapp'
  FROM public.schools s
  JOIN public.plan_modules pm
    ON pm.plan_id = s.plan_id AND pm.module_code = 'whatsapp'
ON CONFLICT DO NOTHING;


-- ----------------------------------------------------------------------------
-- 2. One linked device per school
-- ----------------------------------------------------------------------------
-- Every school links its OWN phone. This is a multi-tenant platform and one
-- shared session would put School A's parents in School B's inbox -- and
-- would mean one school's ban takes every other school down with it.
CREATE TABLE IF NOT EXISTS public.whatsapp_settings (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,

  -- Mirrors the gateway, which is the real authority on whether the socket
  -- is up. Kept here so the screen can render without a round trip, and so
  -- the dispatcher can skip a school whose phone is unlinked.
  session_status   text NOT NULL DEFAULT 'disconnected',
  -- Filled in from the session once scanned. Display only.
  linked_number    text,
  last_connected_at timestamptz,

  -- Off until somebody has scanned and sent a test. A half-configured
  -- integration that silently drops a day of absence alerts is worse than
  -- one that is visibly switched off.
  is_enabled       boolean NOT NULL DEFAULT false,

  -- THE BAN GUARDS. See the header.
  --
  -- The default is deliberately low for an unofficial channel. A school with
  -- 2,000 parents should raise it knowingly, having thought about what a
  -- 2,000-message day looks like from WhatsApp's side, rather than
  -- discovering the limit by losing the number.
  daily_cap        integer NOT NULL DEFAULT 500,

  -- Nothing goes out before or after these, school-local. A fee reminder at
  -- 3am is how a school gets reported as spam by its own parents.
  quiet_from       time NOT NULL DEFAULT '21:00',
  quiet_until      time NOT NULL DEFAULT '07:30',

  last_error       text,
  last_sent_at     timestamptz,
  updated_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id)
);

ALTER TABLE public.whatsapp_settings DROP CONSTRAINT IF EXISTS whatsapp_settings_session_check;
ALTER TABLE public.whatsapp_settings
  ADD CONSTRAINT whatsapp_settings_session_check
  CHECK (session_status IN ('disconnected', 'qr', 'connecting', 'connected', 'logged_out'));


-- ----------------------------------------------------------------------------
-- 3. Saved messages
-- ----------------------------------------------------------------------------
-- NOT Meta templates -- there is no approval queue on this channel and any
-- text may be sent. These are a convenience: the half-dozen notices a school
-- sends over and over, written once, with {{1}} {{2}} blanks.
--
-- `variables` is an array of human labels for those blanks, in order:
--   ["Student name", "Date"]
-- so the send screen can label its inputs instead of asking for {{2}}.
CREATE TABLE IF NOT EXISTS public.whatsapp_templates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,

  name          text NOT NULL,
  body          text NOT NULL,
  variables     jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- A label the app matches on, so code can ask for "the absence message"
  -- without hardcoding a name the school is free to change.
  purpose       text NOT NULL DEFAULT 'custom',

  is_deleted    boolean NOT NULL DEFAULT false,
  created_by    uuid,
  updated_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_templates DROP CONSTRAINT IF EXISTS whatsapp_templates_purpose_check;
ALTER TABLE public.whatsapp_templates
  ADD CONSTRAINT whatsapp_templates_purpose_check
  CHECK (purpose IN ('absence', 'fee_due', 'fee_received', 'result', 'announcement', 'custom'));

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_templates_name
  ON public.whatsapp_templates (school_id, lower(name))
  WHERE is_deleted = false;


-- ----------------------------------------------------------------------------
-- 4. Who we may message, and who has told us to stop
-- ----------------------------------------------------------------------------
-- Keyed by PHONE, not by student, and that is deliberate. One father's
-- number is on three siblings' records. If he replies STOP he has opted out
-- -- not "the middle child has opted out".
--
-- Honouring STOP matters more here than it would on the official API. There
-- is no Meta quality rating to warn anybody first: on this channel the
-- feedback mechanism is parents pressing Block and Report, and enough of
-- that is how the number goes.
CREATE TABLE IF NOT EXISTS public.whatsapp_contacts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,

  -- Always E.164, always normalised by lib/whatsapp/phone.js before it gets
  -- here. '0300-1234567' and '+92 300 1234567' are the same parent and must
  -- not become two rows with different opt-out states.
  phone            text NOT NULL,

  last_inbound_at  timestamptz,
  last_outbound_at timestamptz,

  opted_out        boolean NOT NULL DEFAULT false,
  opted_out_at     timestamptz,
  opted_in_at      timestamptz,
  opt_out_reason   text,

  display_name     text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_contacts_optout
  ON public.whatsapp_contacts (school_id, opted_out);


-- ----------------------------------------------------------------------------
-- 5. The outbox, the log and the inbox -- one table
-- ----------------------------------------------------------------------------
-- Outbound and inbound share a table because the only view anybody actually
-- wants is a conversation with a parent in time order, and splitting them
-- would mean UNIONing two tables to get it back.
--
-- A row is never deleted on send. It moves through statuses and keeps its
-- error, because "did we tell the parent?" is the question this table exists
-- to answer, months later, when it is disputed.
CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,

  direction        text NOT NULL DEFAULT 'out',

  student_id       uuid REFERENCES public.students(id) ON DELETE SET NULL,
  staff_id         uuid REFERENCES public.staff(id) ON DELETE SET NULL,

  to_phone         text NOT NULL,

  -- Which saved message this came from, for grouping the log. The text that
  -- was actually sent is in `body` -- rendered at queue time, so the log
  -- still reads correctly after somebody edits the saved message.
  template_id      uuid REFERENCES public.whatsapp_templates(id) ON DELETE SET NULL,
  template_name    text,

  -- The exact text. For inbound, what the parent wrote.
  body             text NOT NULL,

  status           text NOT NULL DEFAULT 'queued',
  wa_message_id    text,
  error_detail     text,
  attempts         smallint NOT NULL DEFAULT 0,

  queued_at        timestamptz NOT NULL DEFAULT now(),
  sent_at          timestamptz,
  delivered_at     timestamptz,
  read_at          timestamptz,
  failed_at        timestamptz,

  -- Free text saying what queued this: 'absence:2026-10-20', 'announcement',
  -- 'manual'. The thing you group by when a parent asks why they got six.
  source           text NOT NULL DEFAULT 'manual',

  created_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_messages DROP CONSTRAINT IF EXISTS whatsapp_messages_direction_check;
ALTER TABLE public.whatsapp_messages
  ADD CONSTRAINT whatsapp_messages_direction_check
  CHECK (direction IN ('out', 'in'));

ALTER TABLE public.whatsapp_messages DROP CONSTRAINT IF EXISTS whatsapp_messages_status_check;
ALTER TABLE public.whatsapp_messages
  ADD CONSTRAINT whatsapp_messages_status_check
  CHECK (status IN ('queued', 'sending', 'sent', 'delivered', 'read',
                    'failed', 'cancelled', 'received'));

-- The dispatcher's query: oldest queued rows first. Partial, because the
-- queue is tiny next to the log it lives in and this index must stay that
-- way after a million sent rows.
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_queue
  ON public.whatsapp_messages (school_id, queued_at)
  WHERE status IN ('queued', 'sending');

-- Receipts arrive knowing only WhatsApp's own id.
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_messages_wa_id
  ON public.whatsapp_messages (wa_message_id)
  WHERE wa_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_thread
  ON public.whatsapp_messages (school_id, to_phone, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_student
  ON public.whatsapp_messages (school_id, student_id)
  WHERE student_id IS NOT NULL;


-- ----------------------------------------------------------------------------
-- 6. The platform token the machine callers hold
-- ----------------------------------------------------------------------------
-- One row. One bcrypt hash. The dispatcher and the gateway both present the
-- plaintext; the database compares and derives everything else itself.
CREATE TABLE IF NOT EXISTS public.whatsapp_platform (
  id          boolean PRIMARY KEY DEFAULT true CHECK (id),
  token_hash  text NOT NULL,
  rotated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_platform ENABLE ROW LEVEL SECURITY;
-- No policy, deliberately. RLS with zero policies denies everything, so not
-- even a platform admin can read the hash through PostgREST. Only the
-- SECURITY DEFINER functions below touch this table.

CREATE OR REPLACE FUNCTION public.whatsapp_check_token(p_token text)
RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public, extensions
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.whatsapp_platform
     WHERE token_hash = crypt(COALESCE(p_token, ''), token_hash)
  );
$$;

CREATE OR REPLACE FUNCTION public.rotate_whatsapp_token()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, extensions
AS $fn$
DECLARE
  v_token text;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Only a platform admin may rotate the WhatsApp token'
      USING ERRCODE = '42501';
  END IF;

  v_token := encode(gen_random_bytes(24), 'hex');

  INSERT INTO public.whatsapp_platform (id, token_hash, rotated_at)
  VALUES (true, crypt(v_token, gen_salt('bf')), now())
  ON CONFLICT (id) DO UPDATE
    SET token_hash = EXCLUDED.token_hash, rotated_at = now();

  RETURN v_token;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.rotate_whatsapp_token() TO authenticated;


-- ----------------------------------------------------------------------------
-- 7a. The dispatcher claims a batch
-- ----------------------------------------------------------------------------
-- Flipping 'queued' -> 'sending' inside this function, under FOR UPDATE SKIP
-- LOCKED, is what makes two overlapping dispatcher runs harmless. Without it
-- a slow cron and a manual "Send now" send everything twice, and a parent
-- gets two fee reminders -- which on this channel is not merely untidy, it
-- is the behaviour that gets numbers reported.
--
-- Nothing secret is returned. The gateway is addressed by school_id and
-- holds the session itself.
CREATE OR REPLACE FUNCTION public.whatsapp_claim_batch(p_token text, p_limit integer DEFAULT 25)
RETURNS TABLE (
  id        uuid,
  school_id uuid,
  to_phone  text,
  body      text,
  attempts  smallint
)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, extensions
AS $fn$
BEGIN
  IF NOT public.whatsapp_check_token(p_token) THEN
    RAISE EXCEPTION 'Bad token' USING ERRCODE = '28000';
  END IF;

  -- Every column below is table-qualified, and it has to be: this function's
  -- RETURNS TABLE names (id, school_id, body …) are plpgsql variables inside
  -- the body, so a bare `id` is ambiguous and the function fails at RUN
  -- time, not at CREATE time.
  RETURN QUERY
  WITH claimed AS (
    SELECT m.id
      FROM public.whatsapp_messages m
      JOIN public.whatsapp_settings s ON s.school_id = m.school_id
     WHERE m.direction = 'out'
       AND m.status = 'queued'
       AND s.is_enabled
       -- A school whose phone is unlinked must not have its queue drained
       -- into a dead socket, burning attempts until every message fails.
       AND s.session_status = 'connected'
       -- Quiet hours, in the school's own timezone. The window may wrap
       -- midnight (21:00 -> 07:30), which is why it is two cases.
       AND NOT (
         CASE
           WHEN s.quiet_from < s.quiet_until THEN
             (now() AT TIME ZONE COALESCE(
                (SELECT sc.timezone FROM public.schools sc WHERE sc.id = m.school_id),
                'Asia/Karachi'))::time BETWEEN s.quiet_from AND s.quiet_until
           ELSE
             (now() AT TIME ZONE COALESCE(
                (SELECT sc.timezone FROM public.schools sc WHERE sc.id = m.school_id),
                'Asia/Karachi'))::time >= s.quiet_from
             OR
             (now() AT TIME ZONE COALESCE(
                (SELECT sc.timezone FROM public.schools sc WHERE sc.id = m.school_id),
                'Asia/Karachi'))::time <= s.quiet_until
         END
       )
       -- The daily cap, counted over what has actually gone out today.
       AND (
         SELECT count(*) FROM public.whatsapp_messages d
          WHERE d.school_id = m.school_id
            AND d.direction = 'out'
            AND d.sent_at >= date_trunc('day', now())
       ) < s.daily_cap
     ORDER BY m.queued_at
     LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 25), 100))
     FOR UPDATE OF m SKIP LOCKED
  ), moved AS (
    UPDATE public.whatsapp_messages m
       SET status = 'sending', attempts = m.attempts + 1, updated_at = now()
      FROM claimed c
     WHERE m.id = c.id
     RETURNING m.*
  )
  SELECT mv.id, mv.school_id, mv.to_phone, mv.body, mv.attempts FROM moved mv;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.whatsapp_claim_batch(text, integer) TO anon, authenticated;


-- ----------------------------------------------------------------------------
-- 7b. The dispatcher reports what the gateway said
-- ----------------------------------------------------------------------------
-- 'sent' means the session handed the message to WhatsApp, nothing more.
-- Delivery arrives later as a receipt. Conflating the two is how a school
-- tells a parent "we informed you" about a message that never landed.
--
-- A retryable failure goes back to 'queued'; at MAX_ATTEMPTS it stops,
-- because a number WhatsApp has refused three times is wrong, not unlucky.
CREATE OR REPLACE FUNCTION public.whatsapp_record_send(
  p_token text,
  p_id    uuid,
  p_ok    boolean,
  p_wa_id text DEFAULT NULL,
  p_error text DEFAULT NULL,
  p_retryable boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, extensions
AS $fn$
DECLARE
  MAX_ATTEMPTS constant smallint := 3;
  v_row public.whatsapp_messages%ROWTYPE;
  v_done boolean;
BEGIN
  IF NOT public.whatsapp_check_token(p_token) THEN
    RAISE EXCEPTION 'Bad token' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_row FROM public.whatsapp_messages WHERE id = p_id;
  IF v_row.id IS NULL THEN RETURN; END IF;

  IF p_ok THEN
    UPDATE public.whatsapp_messages
       SET status = 'sent', wa_message_id = p_wa_id, sent_at = now(),
           error_detail = NULL, updated_at = now()
     WHERE id = p_id;

    UPDATE public.whatsapp_settings
       SET last_sent_at = now(), last_error = NULL
     WHERE school_id = v_row.school_id;

    INSERT INTO public.whatsapp_contacts (school_id, phone, last_outbound_at)
    VALUES (v_row.school_id, v_row.to_phone, now())
    ON CONFLICT (school_id, phone) DO UPDATE
      SET last_outbound_at = now(), updated_at = now();
  ELSE
    -- "Not registered on WhatsApp" will be just as true in five minutes, so
    -- it is burned off now rather than retried twice more.
    v_done := NOT COALESCE(p_retryable, true) OR v_row.attempts >= MAX_ATTEMPTS;

    UPDATE public.whatsapp_messages
       SET status = CASE WHEN v_done THEN 'failed' ELSE 'queued' END,
           failed_at = CASE WHEN v_done THEN now() ELSE NULL END,
           error_detail = p_error, updated_at = now()
     WHERE id = p_id;

    UPDATE public.whatsapp_settings
       SET last_error = p_error
     WHERE school_id = v_row.school_id;
  END IF;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.whatsapp_record_send(text, uuid, boolean, text, text, boolean)
  TO anon, authenticated;


-- ----------------------------------------------------------------------------
-- 7c. The gateway reports receipts, replies and session state
-- ----------------------------------------------------------------------------
-- One array of events, each one of three shapes:
--
--   {"type":"session",  "schoolId":…, "status":"connected", "number":"92…"}
--   {"type":"receipt",  "schoolId":…, "waMessageId":…, "messageStatus":"read"}
--   {"type":"inbound",  "schoolId":…, "waMessageId":…, "from":"+92…",
--    "text":…, "name":…, "at":1760500100}
--
-- Receipts arrive OUT OF ORDER -- 'read' routinely lands before 'delivered'.
-- Each timestamp is written with COALESCE and the status only ever moves
-- forward, so a late receipt can never demote a row that is already ahead.
CREATE OR REPLACE FUNCTION public.whatsapp_ingest_events(p_token text, p_events jsonb)
RETURNS TABLE (receipts integer, inbound integer, sessions integer)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, extensions
AS $fn$
DECLARE
  v_rank    constant jsonb := '{"sent":1,"delivered":2,"read":3,"failed":4}'::jsonb;
  v_event   jsonb;
  v_school  uuid;
  v_phone   text;
  v_tail    text;
  v_student uuid;
  v_receipts integer := 0;
  v_inbound  integer := 0;
  v_sessions integer := 0;
BEGIN
  IF NOT public.whatsapp_check_token(p_token) THEN
    RAISE EXCEPTION 'Bad token' USING ERRCODE = '28000';
  END IF;

  FOR v_event IN SELECT jsonb_array_elements(COALESCE(p_events, '[]'::jsonb))
  LOOP
    -- The gateway is keyed by school, so unlike a Cloud API webhook the
    -- tenant arrives explicitly. Verify it is real before trusting it.
    BEGIN
      v_school := (v_event->>'schoolId')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      CONTINUE;
    END;

    CONTINUE WHEN v_school IS NULL
      OR NOT EXISTS (SELECT 1 FROM public.schools s WHERE s.id = v_school);

    -- ------------------------------------------------------ session state
    IF v_event->>'type' = 'session' THEN
      INSERT INTO public.whatsapp_settings (school_id, session_status, linked_number,
                                            last_connected_at)
      VALUES (v_school, v_event->>'status', v_event->>'number',
              CASE WHEN v_event->>'status' = 'connected' THEN now() END)
      ON CONFLICT (school_id) DO UPDATE
        SET session_status = EXCLUDED.session_status,
            linked_number  = COALESCE(EXCLUDED.linked_number,
                                      whatsapp_settings.linked_number),
            last_connected_at = COALESCE(EXCLUDED.last_connected_at,
                                         whatsapp_settings.last_connected_at),
            updated_at = now();

      v_sessions := v_sessions + 1;

      -- An unlinked phone cannot send. Switching the integration off is
      -- what stops the queue draining into nothing and failing every
      -- message three times over.
      IF v_event->>'status' = 'logged_out' THEN
        UPDATE public.whatsapp_settings
           SET is_enabled = false,
               last_error = 'The phone unlinked this device. Scan again to reconnect.'
         WHERE school_id = v_school;
      END IF;

      CONTINUE;
    END IF;

    -- ---------------------------------------------------- delivery receipt
    IF v_event->>'type' = 'receipt' THEN
      UPDATE public.whatsapp_messages m
         SET status = CASE
                        WHEN COALESCE((v_rank->>(v_event->>'messageStatus'))::int, 0)
                           > COALESCE((v_rank->>m.status)::int, 0)
                        THEN v_event->>'messageStatus'
                        ELSE m.status
                      END,
             delivered_at = COALESCE(m.delivered_at,
                              CASE WHEN v_event->>'messageStatus' = 'delivered'
                                   THEN now() END),
             read_at      = COALESCE(m.read_at,
                              CASE WHEN v_event->>'messageStatus' = 'read'
                                   THEN now() END),
             updated_at   = now()
       WHERE m.wa_message_id = v_event->>'waMessageId'
         AND m.school_id = v_school;

      IF FOUND THEN v_receipts := v_receipts + 1; END IF;
      CONTINUE;
    END IF;

    -- -------------------------------------------------------- inbound reply
    IF v_event->>'type' = 'inbound' THEN
      v_phone := '+' || ltrim(COALESCE(v_event->>'from', ''), '+');
      v_tail  := right(regexp_replace(v_phone, '[^0-9]', '', 'g'), 10);

      CONTINUE WHEN length(v_tail) < 7;

      -- WHOSE PARENT IS THIS?
      --
      -- Attributed only when the number appears on exactly ONE active
      -- student. On a shared family number the reply stays unattributed
      -- rather than guessed: filing a father's message against the wrong
      -- child is worse than filing it against none.
      --
      -- The CASE-over-count is what enforces "exactly one" in a single
      -- pass. The obvious `SELECT id … HAVING count(*) = 1` does not even
      -- run -- id is neither grouped nor aggregated -- and plpgsql would
      -- not have told us until the first parent replied.
      --
      -- Matching is on the last 10 digits because the students table holds
      -- 0300-1234567, +92 300 1234567 and 923001234567 for the same man.
      v_student := NULL;
      IF length(v_tail) = 10 THEN
        SELECT CASE WHEN count(*) = 1 THEN (array_agg(s.id))[1] END
          INTO v_student
          FROM public.students s
         WHERE s.school_id = v_school
           AND s.is_deleted = false
           AND s.status = 'active'
           AND v_tail IN (
             right(regexp_replace(COALESCE(s.father_whatsapp, ''), '[^0-9]', '', 'g'), 10),
             right(regexp_replace(COALESCE(s.whatsapp_number, ''), '[^0-9]', '', 'g'), 10),
             right(regexp_replace(COALESCE(s.father_mobile, ''),   '[^0-9]', '', 'g'), 10),
             right(regexp_replace(COALESCE(s.guardian_phone, ''),  '[^0-9]', '', 'g'), 10)
           );
      END IF;

      INSERT INTO public.whatsapp_messages
        (school_id, direction, to_phone, body, status, wa_message_id,
         created_at, source, student_id)
      VALUES
        (v_school, 'in', v_phone, COALESCE(v_event->>'text', '[media]'),
         'received', v_event->>'waMessageId',
         to_timestamp(COALESCE((v_event->>'at')::bigint, extract(epoch FROM now())::bigint)),
         'inbound', v_student)
      -- The unique index on wa_message_id is PARTIAL, so the predicate has
      -- to be repeated here or Postgres cannot infer which index this means
      -- and raises "no unique or exclusion constraint matching".
      ON CONFLICT (wa_message_id) WHERE wa_message_id IS NOT NULL DO NOTHING;

      v_inbound := v_inbound + 1;

      -- The existing row is referenced by BARE table name in a DO UPDATE --
      -- schema-qualifying it is a parse error.
      INSERT INTO public.whatsapp_contacts (school_id, phone, last_inbound_at, display_name)
      VALUES (v_school, v_phone,
              to_timestamp(COALESCE((v_event->>'at')::bigint,
                                    extract(epoch FROM now())::bigint)),
              v_event->>'name')
      ON CONFLICT (school_id, phone) DO UPDATE
        SET last_inbound_at = GREATEST(
              COALESCE(whatsapp_contacts.last_inbound_at, '-infinity'::timestamptz),
              EXCLUDED.last_inbound_at),
            display_name = COALESCE(EXCLUDED.display_name, whatsapp_contacts.display_name),
            updated_at = now();

      -- STOP, in the words parents actually use. On an unofficial channel
      -- there is no Meta quality score to warn anybody first -- the next
      -- escalation after being ignored is Block and Report, and enough of
      -- those is the number gone.
      IF lower(btrim(COALESCE(v_event->>'text', ''))) IN
           ('stop', 'unsubscribe', 'band karo', 'bandkaro', 'band',
            'stop messages', 'remove me', 'no message')
      THEN
        UPDATE public.whatsapp_contacts
           SET opted_out = true, opted_out_at = now(),
               opt_out_reason = 'replied stop', updated_at = now()
         WHERE school_id = v_school AND phone = v_phone;

        -- Anything already waiting for them is pulled, not sent. An opt-out
        -- that only takes effect tomorrow is not an opt-out.
        UPDATE public.whatsapp_messages
           SET status = 'cancelled', updated_at = now()
         WHERE school_id = v_school AND to_phone = v_phone
           AND direction = 'out' AND status = 'queued';
      END IF;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_receipts, v_inbound, v_sessions;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.whatsapp_ingest_events(text, jsonb) TO anon, authenticated;


-- ----------------------------------------------------------------------------
-- 7d. Queueing, with the rules enforced in one place
-- ----------------------------------------------------------------------------
-- The app could INSERT into whatsapp_messages directly -- RLS would allow
-- it. It goes through this instead so the opt-out check cannot be forgotten
-- by the third screen that wants to message a parent. A rule enforced in a
-- server action is a rule that holds until somebody writes another server
-- action.
--
-- p_recipients is [{phone, student_id?, body?}]. Each recipient may carry
-- its OWN body -- that is what makes a per-student absence alert possible
-- ("Ali was absent today") rather than only one broadcast text. Recipients
-- without one fall back to p_body.
--
-- Returns what was queued AND what was skipped, so the UI can say
-- "412 queued, 6 opted out" rather than implying everybody was reached.
CREATE OR REPLACE FUNCTION public.whatsapp_enqueue(
  p_recipients jsonb,
  p_body       text DEFAULT NULL,
  p_template   uuid DEFAULT NULL,
  p_source     text DEFAULT 'manual'
)
RETURNS TABLE (queued integer, skipped_optout integer, skipped_empty integer)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, extensions
AS $fn$
DECLARE
  v_school  uuid := public.current_school_id();
  v_tplname text;
  v_queued  integer := 0;
  v_optout  integer := 0;
  v_empty   integer := 0;
  v_item    jsonb;
  v_phone   text;
  v_text    text;
BEGIN
  IF v_school IS NULL OR NOT public.has_permission('whatsapp.write') THEN
    RAISE EXCEPTION 'You do not have permission to send WhatsApp messages'
      USING ERRCODE = '42501';
  END IF;

  IF p_template IS NOT NULL THEN
    SELECT t.name INTO v_tplname
      FROM public.whatsapp_templates t
     WHERE t.id = p_template AND t.school_id = v_school AND t.is_deleted = false;

    IF v_tplname IS NULL THEN
      RAISE EXCEPTION 'That saved message does not exist' USING ERRCODE = '23503';
    END IF;
  END IF;

  FOR v_item IN SELECT jsonb_array_elements(COALESCE(p_recipients, '[]'::jsonb))
  LOOP
    v_phone := btrim(v_item->>'phone');
    CONTINUE WHEN COALESCE(v_phone, '') = '';

    v_text := COALESCE(NULLIF(btrim(v_item->>'body'), ''), NULLIF(btrim(p_body), ''));

    -- An empty message is not a message. Queueing one sends a blank chat
    -- bubble to a parent, which looks like the school was hacked.
    IF v_text IS NULL THEN
      v_empty := v_empty + 1;
      CONTINUE;
    END IF;

    IF EXISTS (SELECT 1 FROM public.whatsapp_contacts c
                WHERE c.school_id = v_school AND c.phone = v_phone AND c.opted_out) THEN
      v_optout := v_optout + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.whatsapp_messages
      (school_id, direction, student_id, to_phone, template_id, template_name,
       body, status, source, created_by)
    VALUES
      (v_school, 'out',
       NULLIF(v_item->>'student_id', '')::uuid,
       v_phone, p_template, v_tplname,
       v_text, 'queued', COALESCE(p_source, 'manual'), auth.uid());

    v_queued := v_queued + 1;
  END LOOP;

  RETURN QUERY SELECT v_queued, v_optout, v_empty;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.whatsapp_enqueue(jsonb, text, uuid, text) TO authenticated;


-- ----------------------------------------------------------------------------
-- 7e. The settings screen: auto-send, pacing, and the official API
-- ----------------------------------------------------------------------------
-- Everything the WhatsApp Settings tabs write. Added as ALTERs rather than
-- folded into section 2 so this file stays re-runnable against a database
-- that already has the earlier shape.
ALTER TABLE public.whatsapp_settings
  -- AUTO-SEND. One boolean per event, as jsonb rather than five columns:
  -- the set grows every time somebody wants another notice, and a jsonb key
  -- does not need a migration and a deploy to appear.
  --
  -- A switch here does nothing on its own. It is read by autoSend() in
  -- lib/whatsapp/auto-send.js, which the attendance and fee actions call --
  -- so adding a key without a caller gives a toggle that silently does
  -- nothing, which is worse than no toggle.
  ADD COLUMN IF NOT EXISTS auto_send jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- PACING, as the Advanced tab sets it. The gateway reads these per send.
  -- Random between the two, never a fixed interval: a message every
  -- precisely 3.0 seconds is a machine signature, and machine signatures
  -- are what get numbers banned.
  ADD COLUMN IF NOT EXISTS send_delay_min smallint NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS send_delay_max smallint NOT NULL DEFAULT 8,

  -- THE OFFICIAL CLOUD API, which sits ALONGSIDE the linked phone rather
  -- than replacing it. Meta approves wording per template, so only an
  -- approved template may take this route; everything else keeps using the
  -- phone. api_fallback decides what happens when the API cannot send --
  -- token expired, template not approved, Meta down.
  ADD COLUMN IF NOT EXISTS api_enabled      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS api_fallback     boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS waba_id          text,
  ADD COLUMN IF NOT EXISTS phone_number_id  text,
  ADD COLUMN IF NOT EXISTS meta_app_id      text,
  ADD COLUMN IF NOT EXISTS api_access_token text,
  ADD COLUMN IF NOT EXISTS api_status       text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS api_checked_at   timestamptz,
  ADD COLUMN IF NOT EXISTS api_error        text;

ALTER TABLE public.whatsapp_settings DROP CONSTRAINT IF EXISTS whatsapp_settings_api_status_check;
ALTER TABLE public.whatsapp_settings
  ADD CONSTRAINT whatsapp_settings_api_status_check
  CHECK (api_status IN ('none', 'ok', 'error'));

ALTER TABLE public.whatsapp_settings DROP CONSTRAINT IF EXISTS whatsapp_settings_delay_check;
ALTER TABLE public.whatsapp_settings
  ADD CONSTRAINT whatsapp_settings_delay_check
  CHECK (send_delay_min >= 0 AND send_delay_max >= send_delay_min);

-- api_access_token IS A SECRET, and the only one in this schema.
--
-- RLS decides which ROWS you see and has nothing to say about which
-- COLUMNS. A Meta token that can bill the school is not something a clerk
-- with whatsapp.read should ever receive, so SELECT on that one column is
-- revoked. Order matters: a table-wide grant outranks a column grant, so
-- the table-wide one must go FIRST and the column list be granted after.
--
-- CONSEQUENCE, AND IT WILL BITE: `select('*')` on whatsapp_settings now
-- FAILS for authenticated callers -- not "returns null for that column",
-- fails the whole query with a permission error. Name the columns.
-- SETTINGS_COLUMNS in lib/whatsapp-options.js is the safe list.
REVOKE SELECT ON public.whatsapp_settings FROM authenticated, anon;

GRANT SELECT (id, school_id, session_status, linked_number, last_connected_at,
              is_enabled, daily_cap, quiet_from, quiet_until, last_error,
              last_sent_at, auto_send, send_delay_min, send_delay_max,
              api_enabled, api_fallback, waba_id, phone_number_id, meta_app_id,
              api_status, api_checked_at, api_error, updated_by,
              created_at, updated_at)
  ON public.whatsapp_settings TO authenticated;

-- Writing it is the whole point of the API tab. Reading it back is what
-- must never happen.
GRANT INSERT, UPDATE, DELETE ON public.whatsapp_settings TO authenticated;

-- Templates gain the event they serve, and their standing with Meta.
ALTER TABLE public.whatsapp_templates
  -- Which auto-send event reaches for this template. One active template
  -- per event per school -- enforced below, because two would make the
  -- choice arbitrary and the office would never work out which went out.
  ADD COLUMN IF NOT EXISTS event        text NOT NULL DEFAULT 'custom',
  ADD COLUMN IF NOT EXISTS is_active    boolean NOT NULL DEFAULT true,
  -- The matching template registered with Meta, for the API route. Null
  -- means this template has no API equivalent and always uses the phone.
  ADD COLUMN IF NOT EXISTS meta_name    text,
  ADD COLUMN IF NOT EXISTS meta_lang    text DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS meta_status  text NOT NULL DEFAULT 'none';

-- `purpose` was the earlier name for the same idea. Carry it across once,
-- then stop reading it.
UPDATE public.whatsapp_templates
   SET event = purpose
 WHERE event = 'custom'
   AND purpose IS NOT NULL
   AND purpose IN ('absence', 'fee_due', 'fee_received', 'result', 'admission');

ALTER TABLE public.whatsapp_templates DROP CONSTRAINT IF EXISTS whatsapp_templates_event_check;
ALTER TABLE public.whatsapp_templates
  ADD CONSTRAINT whatsapp_templates_event_check
  CHECK (event IN ('absence', 'fee_due', 'fee_received', 'result', 'admission',
                   'announcement', 'custom'));

ALTER TABLE public.whatsapp_templates DROP CONSTRAINT IF EXISTS whatsapp_templates_meta_status_check;
ALTER TABLE public.whatsapp_templates
  ADD CONSTRAINT whatsapp_templates_meta_status_check
  CHECK (meta_status IN ('none', 'pending', 'approved', 'rejected', 'paused'));

-- One active template per event. 'custom' is exempt: those are written for
-- a particular announcement and there can be as many as the school likes.
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_templates_one_per_event
  ON public.whatsapp_templates (school_id, event)
  WHERE is_deleted = false AND is_active AND event <> 'custom';

-- The template an auto-send event should use, or null if the school has
-- not written one. SECURITY DEFINER so a trigger running as the clerk who
-- saved the register can still find it.
CREATE OR REPLACE FUNCTION public.whatsapp_template_for(p_school uuid, p_event text)
RETURNS TABLE (id uuid, name text, body text, meta_name text, meta_status text)
LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public
AS $$
  SELECT t.id, t.name, t.body, t.meta_name, t.meta_status
    FROM public.whatsapp_templates t
   WHERE t.school_id = p_school
     AND t.event = p_event
     AND t.is_active
     AND t.is_deleted = false
   LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.whatsapp_template_for(uuid, text) TO authenticated;

-- The one way to read the Meta token back.
--
-- The column revoke above means a server action CANNOT simply select it --
-- the query fails outright. But "Save & check", "Sync from Meta" and the
-- API test all have to present the token to Meta, so there must be exactly
-- one door, and this is it: SECURITY DEFINER, pinned to the caller's own
-- school, and gated on whatsapp.write rather than mere read.
--
-- It returns to a SERVER ACTION, never to a browser. Anything calling this
-- must not put the result in a prop, a client component, or a response.
CREATE OR REPLACE FUNCTION public.whatsapp_api_credentials()
RETURNS TABLE (waba_id text, phone_number_id text, access_token text)
LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_school uuid := public.current_school_id();
BEGIN
  IF v_school IS NULL OR NOT public.has_permission('whatsapp.write') THEN
    RAISE EXCEPTION 'You do not have permission to use the WhatsApp API'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT s.waba_id, s.phone_number_id, s.api_access_token
    FROM public.whatsapp_settings s
   WHERE s.school_id = v_school;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.whatsapp_api_credentials() TO authenticated;


-- ----------------------------------------------------------------------------
-- 8. Permissions, RLS, triggers
-- ----------------------------------------------------------------------------
INSERT INTO public.permission_map (code, section, verb) VALUES
  ('whatsapp.read',   'whatsapp', 'view'),
  ('whatsapp.write',  'whatsapp', 'edit'),
  ('whatsapp.delete', 'whatsapp', 'delete')
ON CONFLICT (code) DO UPDATE
  SET section = EXCLUDED.section, verb = EXCLUDED.verb;

-- The three Communication pages are seeded in 026_simple_access.sql, with
-- every other page, so that one file is the only place a label, a group or a
-- sidebar position is written down. They were listed here as well, and the two
-- copies had already drifted -- this file called the templates screen "Saved
-- Messages" while the sidebar called it "Templates" -- and the module column
-- here said 'whatsapp' where the sidebar's group slugs to 'communication',
-- which would have left every Communication page switched off for everybody:
-- has_permission() joins user_module_access on exactly that string.

SELECT public.apply_tenant_rls('whatsapp_settings',  'whatsapp.read', 'whatsapp.write');
SELECT public.apply_tenant_rls('whatsapp_templates', 'whatsapp.read', 'whatsapp.write');
SELECT public.apply_tenant_rls('whatsapp_contacts',  'whatsapp.read', 'whatsapp.write');
SELECT public.apply_tenant_rls('whatsapp_messages',  'whatsapp.read', 'whatsapp.write');

SELECT public.add_touch_trigger('whatsapp_settings');
SELECT public.add_touch_trigger('whatsapp_templates');
SELECT public.add_touch_trigger('whatsapp_contacts');
SELECT public.add_touch_trigger('whatsapp_messages');

SELECT public.add_audit_trigger('whatsapp_settings');
SELECT public.add_audit_trigger('whatsapp_templates');


-- ----------------------------------------------------------------------------
-- 9. Mint the platform token, if there is not one already
-- ----------------------------------------------------------------------------
DO $mint$
DECLARE
  v_token text;
BEGIN
  IF EXISTS (SELECT 1 FROM public.whatsapp_platform) THEN
    RAISE NOTICE '----------------------------------------------------------';
    RAISE NOTICE 'WhatsApp platform token already set (rotated %).',
      (SELECT rotated_at FROM public.whatsapp_platform);
    RAISE NOTICE 'Keeping it. To replace: SELECT public.rotate_whatsapp_token();';
  ELSE
    v_token := encode(gen_random_bytes(24), 'hex');
    INSERT INTO public.whatsapp_platform (id, token_hash)
    VALUES (true, crypt(v_token, gen_salt('bf')));

    RAISE NOTICE '----------------------------------------------------------';
    RAISE NOTICE 'COPY THIS -- it is shown only once. The same value goes in';
    RAISE NOTICE 'BOTH .env.local and whatsapp-gateway/.env :';
    RAISE NOTICE '';
    RAISE NOTICE '  WHATSAPP_INGEST_TOKEN=%', v_token;
    RAISE NOTICE '';
  END IF;
END
$mint$;

DO $report$
BEGIN
  RAISE NOTICE '----------------------------------------------------------';
  RAISE NOTICE 'WhatsApp (linked device) installed.';
  RAISE NOTICE '  schools linked:  %',
    (SELECT count(*) FROM public.whatsapp_settings WHERE session_status = 'connected');
  RAISE NOTICE '  saved messages:  %',
    (SELECT count(*) FROM public.whatsapp_templates WHERE is_deleted = false);
  RAISE NOTICE '  queued:          %',
    (SELECT count(*) FROM public.whatsapp_messages WHERE status = 'queued');
  RAISE NOTICE '';
  RAISE NOTICE 'Next: start whatsapp-gateway (npm start), then open';
  RAISE NOTICE 'School -> Communication -> WhatsApp and scan the QR code.';
  RAISE NOTICE '----------------------------------------------------------';
END
$report$;
