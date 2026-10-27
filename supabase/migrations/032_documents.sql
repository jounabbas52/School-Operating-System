-- ============================================================================
-- 032  PRINTED DOCUMENTS
--
-- Everything the school puts on paper -- a fee challan, a salary slip, a
-- payment voucher, a certificate, an ID card, any report -- carries the same
-- three things at the top: the name, the logo, and the contact line. Until
-- now each screen invented its own. certificate_settings held a school_name
-- and a logo, id_card_settings held ANOTHER school_name and ANOTHER logo, the
-- salary slip had neither, and a fee challan could not be printed at all.
--
-- document_settings is that masthead, once, for every sheet. The two template
-- tables keep their own copies because a certificate may legitimately want a
-- different crest from an ID card, but both now fall back to this row, so a
-- school that fills it in once gets a complete letterhead everywhere.
--
-- It also holds the three marks a real school document is not accepted
-- without: the round school seal, the principal rubber stamp, and the
-- signatures. Those are object PATHS in the public school-assets bucket, like
-- every other image in this schema -- see lib/storage.js on why never a URL.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The letterhead, the stamps, the bank
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.document_settings (
  school_id        uuid PRIMARY KEY REFERENCES public.schools(id) ON DELETE CASCADE,

  -- Masthead. Blank falls back to the schools row at render time, so a school
  -- that never opens this tab still prints its own name rather than nothing.
  school_name      text,
  tagline          text,
  address          text,
  city             text,
  phone            varchar(40),
  phone_alt        varchar(40),
  email            text,
  website          text,
  -- The line a board-affiliated school is required to print: "Affiliated with
  -- BISE Lahore - Reg. No. 1234".
  registration_no  text,

  logo_url         text,
  -- Printed very faint behind the body. A crest at 6% ink, not a background
  -- photograph -- anything darker makes the sheet unreadable on a laser
  -- printer.
  watermark_url    text,

  -- The three marks.
  school_stamp_url         text,
  principal_stamp_url      text,
  principal_name           text,
  principal_label          text NOT NULL DEFAULT 'Principal',
  principal_signature_url  text,
  accountant_name          text,
  accountant_label         text NOT NULL DEFAULT 'Accountant',
  accountant_signature_url text,

  -- Bank block, printed on the challan. A parent pays at a bank counter and
  -- the teller needs the title and the number on the slip itself.
  bank_name           text,
  bank_branch         text,
  bank_account_title  text,
  bank_account_number text,
  bank_iban           text,
  bank_note           text,

  -- Challan layout. The copies are an array rather than a count because what
  -- they are CALLED differs by school -- some print four, some name the third
  -- "Parent Copy".
  challan_copies       jsonb NOT NULL DEFAULT '["Bank Copy","School Copy","Student Copy"]'::jsonb,
  challan_title        text NOT NULL DEFAULT 'FEE CHALLAN',
  challan_instructions text NOT NULL DEFAULT
    'Fee is payable on or before the due date. A fine applies after the due date. Keep the student copy as proof of payment. This challan is valid for the stated period only.',
  challan_show_barcode boolean NOT NULL DEFAULT true,
  challan_show_bank    boolean NOT NULL DEFAULT true,
  -- The "payable after due date" row -- the same amount plus the fine. Schools
  -- that do not fine anybody switch it off rather than printing two identical
  -- figures.
  challan_show_fine    boolean NOT NULL DEFAULT true,
  challan_fine_amount  numeric(10,2) NOT NULL DEFAULT 0,

  -- Shared look. One accent colour drives the rules, the table heads and the
  -- copy badge on every printed sheet.
  accent_color     text NOT NULL DEFAULT '#1e3a8a',
  header_style     text NOT NULL DEFAULT 'classic'
                   CHECK (header_style IN ('classic','banner','minimal')),
  paper_size       text NOT NULL DEFAULT 'a4' CHECK (paper_size IN ('a4','letter','legal')),
  -- The small print along the bottom edge.
  footer_note      text NOT NULL DEFAULT
    'This is a computer generated document. For queries contact the school office.',
  show_print_time  boolean NOT NULL DEFAULT true,

  updated_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.document_settings IS
  'One row per school: the letterhead, stamps, signatures and bank block shared by every printed document.';

-- ----------------------------------------------------------------------------
-- 2. RLS -- read by everybody in the school, written by settings
--
-- Deliberately NOT apply_tenant_rls(): that factory wants one read permission,
-- and there is no single section this belongs to. A fee clerk printing a
-- challan, a payroll officer printing a slip and a clerk printing an ID card
-- all need the masthead, and none of them has the others' permissions. It is
-- the school's name and address -- the least secret thing in the database --
-- so tenancy alone gates the read, and core.settings.write gates every write,
-- exactly as it does for the logo on the schools row.
-- ----------------------------------------------------------------------------
ALTER TABLE public.document_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS document_settings_select ON public.document_settings;
CREATE POLICY document_settings_select ON public.document_settings
  FOR SELECT USING (
    public.is_platform_admin() OR school_id = public.current_school_id()
  );

DROP POLICY IF EXISTS document_settings_insert ON public.document_settings;
CREATE POLICY document_settings_insert ON public.document_settings
  FOR INSERT WITH CHECK (
    school_id = public.current_school_id() AND public.has_permission('core.settings.write')
  );

DROP POLICY IF EXISTS document_settings_update ON public.document_settings;
CREATE POLICY document_settings_update ON public.document_settings
  FOR UPDATE USING (
    school_id = public.current_school_id() AND public.has_permission('core.settings.write')
  ) WITH CHECK (
    school_id = public.current_school_id() AND public.has_permission('core.settings.write')
  );

DROP POLICY IF EXISTS document_settings_delete ON public.document_settings;
CREATE POLICY document_settings_delete ON public.document_settings
  FOR DELETE USING (
    school_id = public.current_school_id() AND public.has_permission('core.settings.write')
  );

SELECT public.add_touch_trigger('document_settings');

-- ----------------------------------------------------------------------------
-- 3. Certificates -- a real template, not one hardcoded layout
--
-- The old table could hold one body text for five kinds of certificate, which
-- meant a school leaving certificate and a character certificate printed the
-- same sentence. `bodies` and `titles` are keyed by kind, and body_text stays
-- as the fallback for a kind nobody has written yet.
--
-- `template` is loose text rather than a CHECK: the list of layouts lives in
-- lib/documents.js, and a constraint here would mean a migration every time a
-- layout is added. An unknown value falls back to the first one at render
-- time.
-- ----------------------------------------------------------------------------
ALTER TABLE public.certificate_settings
  ADD COLUMN IF NOT EXISTS template      text NOT NULL DEFAULT 'classic',
  ADD COLUMN IF NOT EXISTS accent_color  text NOT NULL DEFAULT '#1e3a8a',
  ADD COLUMN IF NOT EXISTS border_style  text NOT NULL DEFAULT 'double',
  ADD COLUMN IF NOT EXISTS font_family   text NOT NULL DEFAULT 'serif',
  ADD COLUMN IF NOT EXISTS paper_size    text NOT NULL DEFAULT 'a4',
  ADD COLUMN IF NOT EXISTS bodies        jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS titles        jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS show_seal     boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_photo    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_serial   boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS serial_prefix text NOT NULL DEFAULT 'CERT',
  ADD COLUMN IF NOT EXISTS seal_url      text,
  ADD COLUMN IF NOT EXISTS stamp_url     text,
  ADD COLUMN IF NOT EXISTS footer_note   text;

-- ----------------------------------------------------------------------------
-- 4. ID cards -- a back side, and the marks that make one official
-- ----------------------------------------------------------------------------
ALTER TABLE public.id_card_settings
  ADD COLUMN IF NOT EXISTS template       text NOT NULL DEFAULT 'classic',
  ADD COLUMN IF NOT EXISTS accent_color   text NOT NULL DEFAULT '#7c3aed',
  ADD COLUMN IF NOT EXISTS show_back      boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_signature boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_stamp     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stamp_url      text,
  ADD COLUMN IF NOT EXISTS back_fields    jsonb NOT NULL DEFAULT
    '{"date_of_birth":true,"blood_group":true,"guardian_phone":true,"emergency_phone":true,"address":true,"session":true}'::jsonb,
  ADD COLUMN IF NOT EXISTS back_note      text NOT NULL DEFAULT
    'This card is the property of the school and must be carried on the premises at all times. If found, please return it to the school office.',
  ADD COLUMN IF NOT EXISTS valid_until    date;

-- ----------------------------------------------------------------------------
-- 5. Staff signatures and stamps
--
-- A teacher signs a date sheet, a result card and a leaving certificate; a
-- class teacher stamp goes on a report card. staff already carries a
-- photo_url in the PRIVATE staff-photos bucket, and these follow it rather
-- than going to school-assets -- writing to school-assets needs
-- core.settings.write, which an HR clerk maintaining staff records has no
-- reason to hold. Same bucket, same policies, same staff.write key.
-- ----------------------------------------------------------------------------
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS signature_url text,
  ADD COLUMN IF NOT EXISTS stamp_url     text;

COMMENT ON COLUMN public.staff.signature_url IS
  'Object path in the staff-photos bucket (private) -- needs a signed URL to render.';
COMMENT ON COLUMN public.staff.stamp_url IS
  'Object path in the staff-photos bucket (private) -- needs a signed URL to render.';

-- ----------------------------------------------------------------------------
-- 6. Seed one row per existing school, carried over from whatever is already
--    filled in. A school that configured certificates last month should not
--    have to retype its address to print a challan today.
-- ----------------------------------------------------------------------------
INSERT INTO public.document_settings (
  school_id, school_name, address, city, phone, email, website,
  registration_no, logo_url, principal_name
)
SELECT
  s.id,
  COALESCE(cs.school_name, ic.school_name, s.school_name),
  COALESCE(cs.school_address, ic.school_address, s.address),
  s.city,
  COALESCE(cs.contact_number, ic.school_phone, s.phone),
  COALESCE(cs.email, ic.school_email, s.email),
  s.website,
  s.affiliation,
  COALESCE(cs.logo_url, ic.logo_url, s.logo_url),
  COALESCE(cs.principal_name, s.principal_name)
FROM public.schools s
LEFT JOIN public.certificate_settings cs ON cs.school_id = s.id
LEFT JOIN public.id_card_settings     ic ON ic.school_id = s.id
ON CONFLICT (school_id) DO NOTHING;

-- Signatures too, where a school already uploaded one for its certificates.
UPDATE public.document_settings d
   SET principal_signature_url = cs.principal_signature_url,
       principal_label         = COALESCE(cs.principal_label, d.principal_label)
  FROM public.certificate_settings cs
 WHERE cs.school_id = d.school_id
   AND d.principal_signature_url IS NULL
   AND cs.principal_signature_url IS NOT NULL;
