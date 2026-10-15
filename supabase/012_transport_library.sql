-- ============================================================================
-- 012_TRANSPORT_LIBRARY.sql -- run after 011_payroll.sql
-- ============================================================================
-- Paste the whole file into the SQL editor and Run. Idempotent.
--
-- WHAT THIS ADDS AND WHY
--
-- TRANSPORT
--
-- 1. transport_routes gains route_code, area, status and the driver fields.
--    The driver lives on the ROUTE as well as the vehicle because a school
--    thinks "who drives the North Campus run", and the van assigned to that
--    run changes when one is in the workshop.
--
-- 2. vehicles gains vehicle_type, route_id, and the two expiry dates the
--    fleet screen counts alerts from. Fitness and insurance expiry are the
--    only numbers on that screen that can make a van illegal to drive, which
--    is why they are columns and not a note.
--
-- 3. passengers gains monthly_fee. Transport is billed per student per month
--    and the fare on the route is only the default.
--
-- LIBRARY
--
-- 4. books gains book_code, author, location and status. `authors` already
--    existed as free text; `author` is kept alongside it as the single
--    display name the catalogue sorts and searches on.
--
-- 5. book_loans gains book_id. The table was built around book_copies, which
--    is correct for a barcoded library and wrong for a school that owns
--    "thirty copies of Physics" and never numbers them. Issuing against the
--    title keeps copy_id available for libraries that do track copies.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Routes
-- ----------------------------------------------------------------------------
ALTER TABLE public.transport_routes
  ADD COLUMN IF NOT EXISTS route_code   text,
  ADD COLUMN IF NOT EXISTS area         text,
  ADD COLUMN IF NOT EXISTS vehicle_id   uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS driver_name  text,
  ADD COLUMN IF NOT EXISTS driver_phone varchar(30),
  ADD COLUMN IF NOT EXISTS status       text NOT NULL DEFAULT 'active';

ALTER TABLE public.transport_routes DROP CONSTRAINT IF EXISTS transport_routes_status_check;
ALTER TABLE public.transport_routes
  ADD CONSTRAINT transport_routes_status_check
  CHECK (status IN ('active', 'inactive', 'suspended'));

CREATE UNIQUE INDEX IF NOT EXISTS transport_routes_school_code_key
  ON public.transport_routes (school_id, route_code) WHERE route_code IS NOT NULL;

-- Route numbering, counted in the database so two clerks cannot mint the
-- same code.
CREATE OR REPLACE FUNCTION public.next_route_code(p_school uuid, p_prefix text DEFAULT 'RT')
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_next integer;
BEGIN
  SELECT COALESCE(MAX(NULLIF(regexp_replace(route_code, '^.*-', ''), '')::integer), 0) + 1
    INTO v_next
    FROM public.transport_routes
   WHERE school_id = p_school AND route_code LIKE p_prefix || '-%';

  RETURN p_prefix || '-' || lpad(v_next::text, 3, '0');
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.next_route_code(uuid, text) TO authenticated;


-- ----------------------------------------------------------------------------
-- 2. Fleet
-- ----------------------------------------------------------------------------
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS vehicle_type     text NOT NULL DEFAULT 'bus',
  ADD COLUMN IF NOT EXISTS route_id         uuid REFERENCES public.transport_routes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fitness_expiry   date,
  ADD COLUMN IF NOT EXISTS insurance_expiry date,
  ADD COLUMN IF NOT EXISTS status           text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS notes            text;

ALTER TABLE public.vehicles DROP CONSTRAINT IF EXISTS vehicles_status_check;
ALTER TABLE public.vehicles
  ADD CONSTRAINT vehicles_status_check
  CHECK (status IN ('active', 'in_repair', 'inactive'));

ALTER TABLE public.vehicles DROP CONSTRAINT IF EXISTS vehicles_type_check;
ALTER TABLE public.vehicles
  ADD CONSTRAINT vehicles_type_check
  CHECK (vehicle_type IN ('bus', 'van', 'coaster', 'car', 'other'));

CREATE INDEX IF NOT EXISTS idx_vehicles_route  ON public.vehicles (school_id, route_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_expiry ON public.vehicles (school_id, fitness_expiry, insurance_expiry);


-- ----------------------------------------------------------------------------
-- 3. Passengers
-- ----------------------------------------------------------------------------
ALTER TABLE public.passengers
  ADD COLUMN IF NOT EXISTS monthly_fee numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notes       text;

ALTER TABLE public.passengers DROP CONSTRAINT IF EXISTS passengers_status_check;
ALTER TABLE public.passengers
  ADD CONSTRAINT passengers_status_check
  CHECK (status IN ('active', 'inactive', 'suspended'));


-- ----------------------------------------------------------------------------
-- 4. Catalogue
-- ----------------------------------------------------------------------------
ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS book_code text,
  ADD COLUMN IF NOT EXISTS author    text,
  ADD COLUMN IF NOT EXISTS location  text,
  ADD COLUMN IF NOT EXISTS status    text NOT NULL DEFAULT 'active';

ALTER TABLE public.books DROP CONSTRAINT IF EXISTS books_status_check;
ALTER TABLE public.books
  ADD CONSTRAINT books_status_check
  CHECK (status IN ('active', 'archived'));

CREATE UNIQUE INDEX IF NOT EXISTS books_school_code_key
  ON public.books (school_id, book_code) WHERE book_code IS NOT NULL;

-- The ISBN UNIQUE from schema.sql blocks a second book with no ISBN, because
-- the constraint was written as a plain UNIQUE (school_id, isbn) and a school
-- catalogues most of its stock without one.
ALTER TABLE public.books DROP CONSTRAINT IF EXISTS books_school_id_isbn_key;
CREATE UNIQUE INDEX IF NOT EXISTS books_school_isbn_key
  ON public.books (school_id, isbn) WHERE isbn IS NOT NULL AND isbn <> '';

-- Carry the old free-text `authors` across so the catalogue is not blank on
-- first load.
UPDATE public.books SET author = authors WHERE author IS NULL AND authors IS NOT NULL;

CREATE OR REPLACE FUNCTION public.next_book_code(p_school uuid, p_prefix text DEFAULT 'BK')
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_next integer;
BEGIN
  SELECT COALESCE(MAX(NULLIF(regexp_replace(book_code, '^.*-', ''), '')::integer), 0) + 1
    INTO v_next
    FROM public.books
   WHERE school_id = p_school AND book_code LIKE p_prefix || '-%';

  RETURN p_prefix || '-' || lpad(v_next::text, 4, '0');
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.next_book_code(uuid, text) TO authenticated;


-- ----------------------------------------------------------------------------
-- 5. Loans
-- ----------------------------------------------------------------------------
ALTER TABLE public.book_loans
  ADD COLUMN IF NOT EXISTS book_id uuid REFERENCES public.books(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS notes   text;

-- Backfill from the copy, where a copy was used.
UPDATE public.book_loans l
   SET book_id = c.book_id
  FROM public.book_copies c
 WHERE l.copy_id = c.id AND l.book_id IS NULL;

ALTER TABLE public.book_loans DROP CONSTRAINT IF EXISTS book_loans_status_check;
ALTER TABLE public.book_loans
  ADD CONSTRAINT book_loans_status_check
  CHECK (status IN ('issued', 'on_loan', 'returned', 'overdue', 'lost'));

CREATE INDEX IF NOT EXISTS idx_book_loans_book
  ON public.book_loans (school_id, book_id, returned_at);

-- How many of a title are on the shelf right now. A stored
-- available_copies column would need a trigger on every loan and would drift
-- the first time one was edited around; counting is cheap at school scale.
CREATE OR REPLACE VIEW public.book_availability
WITH (security_invoker = true) AS
SELECT b.id   AS book_id,
       b.school_id,
       COALESCE(b.total_copies, 0) AS total_copies,
       COALESCE(b.total_copies, 0) - COALESCE(l.on_loan, 0) AS available_copies,
       COALESCE(l.on_loan, 0) AS issued_copies
  FROM public.books b
  LEFT JOIN (
        SELECT book_id, school_id, count(*) AS on_loan
          FROM public.book_loans
         WHERE returned_at IS NULL AND is_deleted = false
         GROUP BY book_id, school_id
       ) l ON l.book_id = b.id AND l.school_id = b.school_id
 WHERE b.is_deleted = false;


-- ----------------------------------------------------------------------------
-- 6. Triggers
-- ----------------------------------------------------------------------------
-- All five tables already carry the standard tenant policies from schema.sql,
-- so nothing here needs apply_tenant_rls -- new COLUMNS inherit the table's
-- policies.
SELECT public.add_audit_trigger('book_loans');
SELECT public.add_audit_trigger('passengers');


DO $report$
BEGIN
  RAISE NOTICE '----------------------------------------------------------';
  RAISE NOTICE 'Transport and Library installed.';
  RAISE NOTICE '  routes:     %', (SELECT count(*) FROM public.transport_routes);
  RAISE NOTICE '  vehicles:   %', (SELECT count(*) FROM public.vehicles);
  RAISE NOTICE '  passengers: %', (SELECT count(*) FROM public.passengers);
  RAISE NOTICE '  books:      %', (SELECT count(*) FROM public.books);
  RAISE NOTICE '  loans:      %', (SELECT count(*) FROM public.book_loans);
  RAISE NOTICE '----------------------------------------------------------';
END
$report$;
