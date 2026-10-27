-- ============================================================================
-- 033_WHATSAPP_AUTO_SEND.sql -- run after 032_whatsapp_in_settings.sql
-- ============================================================================
-- Paste the whole file into the SQL editor and Run. Idempotent.
--
-- WHAT THIS IS FOR
--
-- Making the Notifications switches real, and letting the Settings screen
-- own them.
--
-- TWO PERMISSION PROBLEMS, AND THEY PULL IN OPPOSITE DIRECTIONS
--
-- 1. WHO MAY CHANGE THE SWITCHES.
--    The Notifications section of Settings is gated on core.settings.write.
--    whatsapp_settings is gated on whatsapp.write. So a school
--    administrator editing Notifications could see WhatsApp reminder
--    switches that RLS then refuses to save. whatsapp_set_auto_send()
--    bridges that: either permission is enough, because both mean "this
--    person configures the school".
--
-- 2. WHO MAY SEND.
--    A fee clerk taking money has fees.write. They do not have
--    whatsapp.write, and they should not -- they are not the person who
--    administers the school's WhatsApp. But the receipt must still go out.
--
--    whatsapp_auto_enqueue() is the answer, and the shift it makes is the
--    important idea in this file: an automatic message is authorised by the
--    SCHOOL'S CONFIGURATION, not by whoever happened to trigger it. The
--    checks are therefore about the school, not the user:
--
--      the module is on          the event's switch is on
--      WhatsApp is enabled       a template exists for the event
--      the phone is connected    the recipient has not opted out
--
--    Any of those false and it queues nothing. The caller is still pinned
--    to their own school by current_school_id(), so this cannot be used to
--    message another school's parents.
--
-- WHY THE BODY IS RENDERED IN HERE
--
-- The obvious shape is to render the text in JavaScript and pass the
-- finished string down. That would mean any signed-in user could post any
-- text to any parent, because this function does not check whatsapp.write.
-- So the caller passes VARIABLES ONLY and the database substitutes them
-- into the school's own stored template. The worst a caller can do is send
-- the school's own approved wording with odd values in the blanks.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. The Settings screen may own the switches
-- ----------------------------------------------------------------------------
-- Writes the auto_send map, nothing else. Deliberately narrow: the daily
-- cap, quiet hours and the API token stay behind whatsapp.write, because
-- those are the WhatsApp administrator's business rather than the general
-- settings editor's.
CREATE OR REPLACE FUNCTION public.whatsapp_set_auto_send(p_flags jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_school uuid := public.current_school_id();
  v_flags  jsonb;
BEGIN
  IF v_school IS NULL
     OR NOT (public.has_permission('core.settings.write')
             OR public.has_permission('whatsapp.write'))
  THEN
    RAISE EXCEPTION 'You do not have permission to change notification settings'
      USING ERRCODE = '42501';
  END IF;

  -- Only the keys this app knows about, and only as booleans. Writing the
  -- caller's jsonb straight in would let anything at all accumulate in a
  -- column the dispatcher reads.
  SELECT jsonb_object_agg(k, COALESCE((p_flags->>k)::boolean, false))
    INTO v_flags
    FROM unnest(ARRAY['absence', 'fee_due', 'fee_received', 'result', 'admission']) AS k;

  INSERT INTO public.whatsapp_settings (school_id, auto_send)
  VALUES (v_school, v_flags)
  ON CONFLICT (school_id) DO UPDATE
    SET auto_send = EXCLUDED.auto_send, updated_at = now();

  RETURN v_flags;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.whatsapp_set_auto_send(jsonb) TO authenticated;


-- ----------------------------------------------------------------------------
-- 2. Is WhatsApp actually able to send right now?
-- ----------------------------------------------------------------------------
-- One row, readable by anyone who can see the school, so the Notifications
-- screen can say "WhatsApp is not linked" without needing whatsapp.read.
-- Carries no credentials and no message content.
CREATE OR REPLACE FUNCTION public.whatsapp_status()
RETURNS TABLE (
  module_on      boolean,
  is_enabled     boolean,
  session_status text,
  linked_number  text,
  auto_send      jsonb,
  ready          boolean
)
LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    public.school_has_module(public.current_school_id(), 'whatsapp'),
    COALESCE(s.is_enabled, false),
    COALESCE(s.session_status, 'disconnected'),
    s.linked_number,
    COALESCE(s.auto_send, '{}'::jsonb),
    -- "ready" is the only thing the Notifications screen should branch on:
    -- bought, switched on, and a phone actually linked.
    public.school_has_module(public.current_school_id(), 'whatsapp')
      AND COALESCE(s.is_enabled, false)
      AND COALESCE(s.session_status, '') = 'connected'
    FROM (SELECT public.current_school_id() AS sid) ctx
    LEFT JOIN public.whatsapp_settings s ON s.school_id = ctx.sid
   WHERE ctx.sid IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION public.whatsapp_status() TO authenticated;


-- ----------------------------------------------------------------------------
-- 3. The automatic send itself
-- ----------------------------------------------------------------------------
-- p_recipients is [{phone, student_id?, variables:{student_name:…, date:…}}]
--
-- Returns what it did, so a caller can report "receipt sent" honestly --
-- or say nothing at all, which is the right behaviour when WhatsApp is off.
--
-- NOTHING HERE MAY RAISE. A fee payment must not fail because a message
-- could not be queued, so every gate returns zero rather than throwing. The
-- one exception is a caller with no school at all, which is a bug worth
-- hearing about.
CREATE OR REPLACE FUNCTION public.whatsapp_auto_enqueue(p_event text, p_recipients jsonb)
RETURNS TABLE (queued integer, skipped integer)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_school  uuid := public.current_school_id();
  v_set     public.whatsapp_settings%ROWTYPE;
  v_tpl     public.whatsapp_templates%ROWTYPE;
  v_item    jsonb;
  v_phone   text;
  v_body    text;
  v_pair    record;
  v_queued  integer := 0;
  v_skipped integer := 0;
BEGIN
  IF v_school IS NULL THEN
    RAISE EXCEPTION 'No school in context' USING ERRCODE = '42501';
  END IF;

  -- Only the events that have a switch. 'custom' and 'announcement' are
  -- written by a person on purpose and must not be reachable from here.
  IF p_event NOT IN ('absence', 'fee_due', 'fee_received', 'result', 'admission') THEN
    RETURN QUERY SELECT 0, 0;
    RETURN;
  END IF;

  IF NOT public.school_has_module(v_school, 'whatsapp') THEN
    RETURN QUERY SELECT 0, 0;
    RETURN;
  END IF;

  SELECT * INTO v_set FROM public.whatsapp_settings WHERE school_id = v_school;

  -- Switched off, phone unlinked, or this particular event not wanted.
  IF v_set.school_id IS NULL
     OR NOT v_set.is_enabled
     OR v_set.session_status <> 'connected'
     OR NOT COALESCE((v_set.auto_send->>p_event)::boolean, false)
  THEN
    RETURN QUERY SELECT 0, 0;
    RETURN;
  END IF;

  SELECT * INTO v_tpl
    FROM public.whatsapp_templates
   WHERE school_id = v_school AND event = p_event
     AND is_active AND is_deleted = false
   LIMIT 1;

  -- The switch is on but nobody wrote the words. Silent rather than an
  -- error: the Notifications screen is what tells them, at the moment they
  -- are looking at the switch.
  IF v_tpl.id IS NULL THEN
    RETURN QUERY SELECT 0, 0;
    RETURN;
  END IF;

  FOR v_item IN SELECT jsonb_array_elements(COALESCE(p_recipients, '[]'::jsonb))
  LOOP
    v_phone := btrim(v_item->>'phone');
    CONTINUE WHEN COALESCE(v_phone, '') = '';

    IF EXISTS (SELECT 1 FROM public.whatsapp_contacts c
                WHERE c.school_id = v_school AND c.phone = v_phone AND c.opted_out) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    -- Substitute {key} from the supplied variables into the SCHOOL'S OWN
    -- template. The caller never supplies the sentence, only the values --
    -- see the header. An unsupplied placeholder is left in place rather
    -- than blanked, so a missing value is visible rather than silent.
    v_body := v_tpl.body;
    FOR v_pair IN SELECT key, value FROM jsonb_each_text(COALESCE(v_item->'variables', '{}'::jsonb))
    LOOP
      v_body := replace(v_body, '{' || v_pair.key || '}', COALESCE(v_pair.value, ''));
    END LOOP;

    INSERT INTO public.whatsapp_messages
      (school_id, direction, student_id, to_phone, template_id, template_name,
       body, status, source, created_by)
    VALUES
      (v_school, 'out',
       NULLIF(v_item->>'student_id', '')::uuid,
       v_phone, v_tpl.id, v_tpl.name,
       v_body, 'queued', 'auto:' || p_event, auth.uid());

    v_queued := v_queued + 1;
  END LOOP;

  RETURN QUERY SELECT v_queued, v_skipped;
END;
$fn$;

-- authenticated, not a narrower role, and on purpose: the fee clerk and the
-- class teacher are the people who trigger these, and neither holds
-- whatsapp.write. The gates above are what make that safe.
GRANT EXECUTE ON FUNCTION public.whatsapp_auto_enqueue(text, jsonb) TO authenticated;


DO $report$
BEGIN
  RAISE NOTICE '----------------------------------------------------------';
  RAISE NOTICE 'WhatsApp auto-send wired to Settings -> Notifications.';
  RAISE NOTICE '  schools with any event switched on: %',
    (SELECT count(*) FROM public.whatsapp_settings
      WHERE auto_send <> '{}'::jsonb
        AND EXISTS (SELECT 1 FROM jsonb_each_text(auto_send) e WHERE e.value = 'true'));
  RAISE NOTICE '----------------------------------------------------------';
END
$report$;
