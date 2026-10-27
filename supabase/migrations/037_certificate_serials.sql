-- ============================================================================
-- 033  CERTIFICATE SERIALS
--
-- certificates_issued has existed since 003_students.sql and nothing has ever
-- written to it. That was survivable while a certificate was a preview on a
-- screen; it stops being survivable now that the sheet prints a "Serial No"
-- line, because a serial that is not stored is not a serial -- reprint the
-- same certificate tomorrow and it would carry a different one.
--
-- So: a column to hold it, a number minted the same way a challan number is
-- (see next_challan_number in 010_fees.sql), and a unique index per school so
-- two clerks pressing Print at the same moment cannot both get CERT-2026-0007.
-- ============================================================================

ALTER TABLE public.certificates_issued
  ADD COLUMN IF NOT EXISTS serial_no text;

-- Partial, because rows predating this column have no serial and a plain
-- unique index would collapse them all onto one NULL in some engines. Scoped
-- per school: two schools on the platform both start at 0001.
CREATE UNIQUE INDEX IF NOT EXISTS certificates_issued_serial
  ON public.certificates_issued (school_id, serial_no)
  WHERE serial_no IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_certs_issued_on
  ON public.certificates_issued (school_id, issued_on DESC);

-- ----------------------------------------------------------------------------
-- The next serial for a school, as CERT-2026-0001.
--
-- SECURITY DEFINER and the same shape as next_challan_number on purpose: the
-- caller needs to read the MAX across rows it may not be able to see
-- individually, and a numbering function that behaves differently from the
-- other numbering function is a numbering function somebody will misuse.
--
-- The regexp takes everything after the last dash, so a school that changes
-- its prefix mid-year does not restart the count from one.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.next_certificate_serial(
  p_school uuid,
  p_prefix text DEFAULT 'CERT'
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_year text := to_char(CURRENT_DATE, 'YYYY');
  v_next integer;
BEGIN
  SELECT COALESCE(MAX(NULLIF(regexp_replace(serial_no, '^.*-', ''), '')::integer), 0) + 1
    INTO v_next
    FROM public.certificates_issued
   WHERE school_id = p_school
     AND serial_no LIKE p_prefix || '-' || v_year || '-%';

  RETURN p_prefix || '-' || v_year || '-' || lpad(v_next::text, 4, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.next_certificate_serial(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_certificate_serial(uuid, text) TO authenticated;
