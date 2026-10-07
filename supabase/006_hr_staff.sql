-- ============================================================================
-- 006_HR_STAFF.sql -- run after 005_teachers.sql
-- ============================================================================
-- Paste the whole file into the SQL editor and Run. Idempotent.
--
-- WHAT THIS ADDS AND WHY
--
-- 1. Salary payment details on staff -- payment mode, bank, account title,
--    account number. This is what the monthly bank transfer sheet is built
--    from; without it Payroll can compute an amount but cannot say where to
--    send it.
--
-- 2. leave_requests reworked from one day to a range. The table exists but
--    holds a single leave_date against a PROFILE. A leave application is
--    filed against an EMPLOYEE (who may have no login at all), covers a span
--    of days, and has a type -- annual, sick, casual. The old column is kept,
--    nullable and unused, so nothing that reads it breaks.
--
--    Its RLS is left exactly as schema.sql wrote it: anyone may file and see
--    their own, hr.read sees all, hr.write approves. That is already right.
--
-- 3. staff_documents -- the CNIC / degree / certificate / contract register,
--    with issue and expiry dates. Schools get audited on this and the only
--    question that matters is "what is about to expire".
--
--    NOTE ON status: it is stored, but a row that HAS an expiry date is
--    displayed from that date, not from this column. A stored status is a
--    fact about the day it was written -- "expiring soon" rots into a lie
--    three months later. The column is the answer for documents with no
--    expiry at all, like a degree.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Salary payment details
-- ----------------------------------------------------------------------------
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS payment_mode   text NOT NULL DEFAULT 'bank_transfer',
  ADD COLUMN IF NOT EXISTS bank_name      text,
  ADD COLUMN IF NOT EXISTS account_title  text,
  ADD COLUMN IF NOT EXISTS account_number text;

ALTER TABLE public.staff DROP CONSTRAINT IF EXISTS staff_payment_mode_check;
ALTER TABLE public.staff
  ADD CONSTRAINT staff_payment_mode_check
  CHECK (payment_mode IN ('bank_transfer', 'cash', 'cheque', 'online'));


-- ----------------------------------------------------------------------------
-- 2. Leave applications: one employee, one span of days
-- ----------------------------------------------------------------------------
ALTER TABLE public.leave_requests
  ADD COLUMN IF NOT EXISTS staff_id    uuid REFERENCES public.staff(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS leave_type  text NOT NULL DEFAULT 'annual',
  ADD COLUMN IF NOT EXISTS from_date   date,
  ADD COLUMN IF NOT EXISTS to_date     date,
  -- Numeric, not integer: half days are a real thing on a leave register.
  ADD COLUMN IF NOT EXISTS days        numeric,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS remarks     text;

ALTER TABLE public.leave_requests DROP CONSTRAINT IF EXISTS leave_requests_type_check;
ALTER TABLE public.leave_requests
  ADD CONSTRAINT leave_requests_type_check
  CHECK (leave_type IN ('annual','sick','casual','unpaid','maternity','paternity','other'));

ALTER TABLE public.leave_requests DROP CONSTRAINT IF EXISTS leave_requests_range_check;
ALTER TABLE public.leave_requests
  ADD CONSTRAINT leave_requests_range_check
  CHECK (from_date IS NULL OR to_date IS NULL OR to_date >= from_date);

-- Carry any single-date rows over into the range columns before the old
-- column stops being required.
UPDATE public.leave_requests
   SET from_date = COALESCE(from_date, leave_date),
       to_date   = COALESCE(to_date, leave_date),
       days      = COALESCE(days, 1)
 WHERE from_date IS NULL AND leave_date IS NOT NULL;

-- leave_date is now legacy. Nothing writes it; it stays so that any row
-- written before this migration keeps its original value.
ALTER TABLE public.leave_requests ALTER COLUMN leave_date DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leave_staff  ON public.leave_requests (school_id, staff_id);
CREATE INDEX IF NOT EXISTS idx_leave_status ON public.leave_requests (school_id, status);
CREATE INDEX IF NOT EXISTS idx_leave_dates  ON public.leave_requests (school_id, from_date, to_date);


-- ----------------------------------------------------------------------------
-- 3. Staff document register
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.staff_documents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id    uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  staff_id     uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  doc_type     text NOT NULL DEFAULT 'cnic'
               CHECK (doc_type IN ('cnic','degree','certificate','contract','other')),
  doc_number   text,
  issue_date   date,
  expiry_date  date,
  -- Only consulted when expiry_date IS NULL. See the note at the top.
  status       text NOT NULL DEFAULT 'valid'
               CHECK (status IN ('valid','expiring_soon','expired')),
  notes        text,
  user_id      uuid,
  created_by   uuid,
  updated_by   uuid,
  deleted_by   uuid,
  deleted_at   timestamptz,
  is_deleted   boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (issue_date IS NULL OR expiry_date IS NULL OR expiry_date >= issue_date)
);
CREATE INDEX IF NOT EXISTS idx_staff_docs_staff  ON public.staff_documents (school_id, staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_docs_expiry ON public.staff_documents (school_id, expiry_date);


-- ----------------------------------------------------------------------------
-- 4. Row level security and triggers
-- ----------------------------------------------------------------------------
-- A personnel file is a staff record, so it is gated with the staff module,
-- not hr. hr is the Leave Management module, and a school on the basic plan
-- has staff without it.
SELECT public.apply_tenant_rls('staff_documents', 'staff.read', 'staff.write');

SELECT public.add_touch_trigger('staff_documents');
SELECT public.add_audit_trigger('staff_documents');


DO $report$
BEGIN
  RAISE NOTICE '----------------------------------------------------------';
  RAISE NOTICE 'HR / Staff upgrade applied.';
  RAISE NOTICE '  staff rows:      %', (SELECT count(*) FROM public.staff WHERE is_deleted = false);
  RAISE NOTICE '  leave requests:  %', (SELECT count(*) FROM public.leave_requests WHERE is_deleted = false);
  RAISE NOTICE '  staff documents: %', (SELECT count(*) FROM public.staff_documents);
  RAISE NOTICE '----------------------------------------------------------';
END
$report$;
