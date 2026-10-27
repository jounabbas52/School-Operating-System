-- ============================================================================
-- 032_WHATSAPP_IN_SETTINGS.sql -- run after 031_sidebar_rename.sql
-- ============================================================================
-- Paste the whole file into the SQL editor and Run. Idempotent.
--
-- WHAT THIS IS FOR
--
-- WhatsApp has moved out of its own Communication section and into School
-- Settings. Three pages became one tabbed screen:
--
--   /school/communication/whatsapp            ->  /school/settings/whatsapp
--   /school/communication/whatsapp/templates  ->  (the Templates tab)
--   /school/communication/whatsapp/log        ->  (the Messages tab)
--
-- WHY THAT IS A DATABASE CHANGE AND NOT JUST A MOVED FOLDER
--
-- Two columns in page_catalog are join keys, not labels:
--
--   page    user_page_access rows point at it. Leave the old routes behind
--           and everybody's WhatsApp permission points at a page that no
--           longer exists -- the screen opens for nobody.
--
--   module  the slug of the sidebar GROUP, which has_permission() joins
--           user_module_access on. WhatsApp used to sit under a group
--           called "Communication" ('communication'); it now sits under
--           "School Settings" ('school-settings'). Somebody who had the
--           Communication switch on must end up with the School Settings
--           switch on, or every settings page goes dark for them.
--
-- Both halves are done here, in that order, and the old rows are only
-- removed once what pointed at them has been repointed.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Carry each person's WhatsApp access onto the new page
-- ----------------------------------------------------------------------------
-- Rolled up with bool_or: somebody could hold all three old pages with
-- different switches -- view on the log, edit on the templates -- and the
-- one page that replaces them should grant the most they had anywhere.
-- Taking any single row instead would quietly demote them.
INSERT INTO public.user_page_access
  (school_id, profile_id, page, section, can_view, can_edit, can_delete)
SELECT a.school_id,
       a.profile_id,
       '/school/settings/whatsapp',
       'whatsapp',
       bool_or(a.can_view),
       bool_or(a.can_edit),
       bool_or(a.can_delete)
  FROM public.user_page_access a
 WHERE a.page IN ('/school/communication/whatsapp',
                  '/school/communication/whatsapp/templates',
                  '/school/communication/whatsapp/log')
 GROUP BY a.school_id, a.profile_id
ON CONFLICT (school_id, profile_id, page) DO UPDATE
  SET can_view   = user_page_access.can_view   OR EXCLUDED.can_view,
      can_edit   = user_page_access.can_edit   OR EXCLUDED.can_edit,
      can_delete = user_page_access.can_delete OR EXCLUDED.can_delete,
      section    = EXCLUDED.section;

DELETE FROM public.user_page_access
 WHERE page IN ('/school/communication/whatsapp',
                '/school/communication/whatsapp/templates',
                '/school/communication/whatsapp/log');


-- ----------------------------------------------------------------------------
-- 2. The module switch moves with it
-- ----------------------------------------------------------------------------
-- 'communication' no longer exists as a sidebar group. Anybody who had it
-- needs 'school-settings' instead -- and most will already have a row for
-- that, so the two are OR-ed rather than overwritten: having had
-- Communication on must never switch School Settings off.
INSERT INTO public.user_module_access (school_id, profile_id, module, enabled)
SELECT u.school_id, u.profile_id, 'school-settings', bool_or(u.enabled)
  FROM public.user_module_access u
 WHERE u.module = 'communication'
 GROUP BY u.school_id, u.profile_id
ON CONFLICT (school_id, profile_id, module) DO UPDATE
  SET enabled = user_module_access.enabled OR EXCLUDED.enabled;

DELETE FROM public.user_module_access WHERE module = 'communication';


-- ----------------------------------------------------------------------------
-- 3. The catalogue itself
-- ----------------------------------------------------------------------------
-- 585 so it sorts directly after /school/settings (580) and before Users &
-- Access (590) -- the order it appears in the sidebar.
--
-- `section` stays 'whatsapp': that is the DATABASE unit, the one the RLS
-- policies ask for, and it is unchanged. Only the group moved.
INSERT INTO public.page_catalog
  (page, section, module, label, group_label, sort_order, has_edit, has_delete) VALUES
  ('/school/settings/whatsapp', 'whatsapp', 'school-settings', 'WhatsApp',
   'School Settings', 585, true, true)
ON CONFLICT (page) DO UPDATE
  SET section = EXCLUDED.section, module = EXCLUDED.module, label = EXCLUDED.label,
      group_label = EXCLUDED.group_label, sort_order = EXCLUDED.sort_order,
      has_edit = EXCLUDED.has_edit, has_delete = EXCLUDED.has_delete;

-- /school/settings itself is now a CHILD of its own group rather than a
-- lone entry, so its label changes but its page and module do not.
UPDATE public.page_catalog
   SET label = 'School Settings', group_label = 'School Settings', module = 'school-settings'
 WHERE page = '/school/settings';

DELETE FROM public.page_catalog
 WHERE page IN ('/school/communication/whatsapp',
                '/school/communication/whatsapp/templates',
                '/school/communication/whatsapp/log');


DO $report$
BEGIN
  RAISE NOTICE '----------------------------------------------------------';
  RAISE NOTICE 'WhatsApp moved into School Settings.';
  RAISE NOTICE '  people with the new page: %',
    (SELECT count(*) FROM public.user_page_access WHERE page = '/school/settings/whatsapp');
  RAISE NOTICE '  stale communication rows:  %',
    (SELECT count(*) FROM public.page_catalog WHERE page LIKE '/school/communication/%');
  RAISE NOTICE '----------------------------------------------------------';
END
$report$;
