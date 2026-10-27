-- ============================================================================
-- 029_STUDENT_LEFT_ON.sql -- run after 028_whatsapp.sql
-- ============================================================================
-- Paste the whole file into the SQL editor and Run. Idempotent.
--
-- WHAT THIS ADDS AND WHY
--
-- students.left_on -- the date a student stopped studying here.
--
-- The Old Students screen lists everyone whose status is graduated,
-- transferred, inactive or suspended, and shows when each of them left. It
-- was reading students.left_on, which no migration had ever created, so the
-- whole page failed with "column students.left_on does not exist".
--
-- WHY A TRIGGER RATHER THAN SETTING IT IN THE SERVER ACTION
--
-- A student's status is changed from several places: the status buttons on
-- the roll, the Reactivate button on Old Students, and the promotion run,
-- which rewrites statuses in bulk. Stamping the date in one server action
-- would leave the other paths writing a status with no date, and the column
-- would be trustworthy only sometimes -- which is worse than not having it,
-- because the screen would show a blank and nobody could tell whether the
-- date was missing or the student never left.
--
-- The rule belongs to the data, so the database keeps it:
--
--   active -> anything else   stamp left_on with today, unless a date was
--                             supplied in the same statement (a back-dated
--                             transfer certificate, say -- that wins)
--   anything else -> active   clear it; they are studying here again
--
-- Existing rows are backfilled from updated_at, which is the closest thing on
-- file to the moment the status was last changed. It is an approximation, and
-- deliberately only applied to rows that have left.
-- ============================================================================

alter table public.students
  add column if not exists left_on date;

comment on column public.students.left_on is
  'Date the student stopped studying here. Maintained by students_stamp_left_on(); clear it by setting status back to active.';

-- ---------------------------------------------------------------- the rule

create or replace function public.students_stamp_left_on()
returns trigger
language plpgsql
-- INVOKER: this only rewrites the row already being written, so it needs no
-- privilege the writer does not already hold.
security invoker
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    if old.status = 'active' and new.status <> 'active' then
      -- An explicit date in the same UPDATE is a deliberate back-date.
      if new.left_on is null or new.left_on is not distinct from old.left_on then
        new.left_on := current_date;
      end if;
    elsif new.status = 'active' then
      new.left_on := null;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists students_stamp_left_on on public.students;

create trigger students_stamp_left_on
  before update of status on public.students
  for each row
  execute function public.students_stamp_left_on();

-- ------------------------------------------------------------- the backfill

-- Only rows that have already left, and only where nothing is on file yet, so
-- re-running this never overwrites a date somebody entered by hand.
update public.students
   set left_on = updated_at::date
 where left_on is null
   and status in ('graduated', 'transferred', 'inactive', 'suspended')
   and is_deleted = false;

-- The Old Students list filters on status and orders by name; left_on is only
-- ever displayed, so it needs no index of its own.
