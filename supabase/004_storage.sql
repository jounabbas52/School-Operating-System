-- ============================================================================
-- 004_STORAGE.sql -- run after 003_students.sql
-- ============================================================================
-- Creates the two buckets the app needs and locks them to the tenant.
--
-- WHY TWO BUCKETS AND NOT ONE
--
--   school-assets   PUBLIC   logos, certificate backgrounds, signature images
--   student-photos  PRIVATE  photographs of children
--
-- A public bucket serves files to anyone holding the URL, with no login and
-- no RLS. That is right for a school crest on a printed certificate, and
-- badly wrong for a photograph of a seven-year-old: one leaked or guessed URL
-- is permanent, indexable, and outside your control. Supabase cannot make a
-- bucket public for some paths and private for others, so the split has to be
-- at the bucket level.
--
-- PATH CONVENTION -- every object is stored under its school:
--     school-assets/{school_id}/logo.png
--     student-photos/{school_id}/{student_id}.jpg
-- The policies below read that first folder segment, so a mis-typed path
-- cannot land in another school's space.
--
-- IF THIS SCRIPT ERRORS: storage.objects is owned by supabase_storage_admin
-- and some projects refuse policy creation from the SQL editor. The block
-- below downgrades that to a notice; create the same policies from
-- Dashboard > Storage > Policies if so.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. The buckets
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'school-assets', 'school-assets', true, 2097152,
  ARRAY['image/png','image/jpeg','image/webp','image/svg+xml']
)
ON CONFLICT (id) DO UPDATE
  SET public = true,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'student-photos', 'student-photos', false, 2097152,
  ARRAY['image/png','image/jpeg','image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;


-- ----------------------------------------------------------------------------
-- 2. Policies
-- ----------------------------------------------------------------------------
DO $do$
BEGIN
  -- ---- school-assets: world-readable, written only by the owning school ----
  EXECUTE $p$
    CREATE POLICY "school assets read" ON storage.objects FOR SELECT TO public
      USING (bucket_id = 'school-assets')$p$;

  EXECUTE $p$
    CREATE POLICY "school assets insert" ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'school-assets'
        AND (storage.foldername(name))[1]::uuid = public.current_school_id()
        AND public.has_permission('core.settings.write')
      )$p$;

  EXECUTE $p$
    CREATE POLICY "school assets update" ON storage.objects FOR UPDATE TO authenticated
      USING (
        bucket_id = 'school-assets'
        AND (storage.foldername(name))[1]::uuid = public.current_school_id()
        AND public.has_permission('core.settings.write')
      )$p$;

  EXECUTE $p$
    CREATE POLICY "school assets delete" ON storage.objects FOR DELETE TO authenticated
      USING (
        bucket_id = 'school-assets'
        AND (storage.foldername(name))[1]::uuid = public.current_school_id()
        AND public.has_permission('core.settings.write')
      )$p$;

  -- ---- student-photos: private, and only to that school's staff ----
  EXECUTE $p$
    CREATE POLICY "student photos read" ON storage.objects FOR SELECT TO authenticated
      USING (
        bucket_id = 'student-photos'
        AND (storage.foldername(name))[1]::uuid = public.current_school_id()
        AND public.has_permission('students.read')
      )$p$;

  EXECUTE $p$
    CREATE POLICY "student photos insert" ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'student-photos'
        AND (storage.foldername(name))[1]::uuid = public.current_school_id()
        AND public.has_permission('students.write')
      )$p$;

  EXECUTE $p$
    CREATE POLICY "student photos update" ON storage.objects FOR UPDATE TO authenticated
      USING (
        bucket_id = 'student-photos'
        AND (storage.foldername(name))[1]::uuid = public.current_school_id()
        AND public.has_permission('students.write')
      )$p$;

  EXECUTE $p$
    CREATE POLICY "student photos delete" ON storage.objects FOR DELETE TO authenticated
      USING (
        bucket_id = 'student-photos'
        AND (storage.foldername(name))[1]::uuid = public.current_school_id()
        AND public.has_permission('students.write')
      )$p$;

  RAISE NOTICE 'storage policies created';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Could not create storage.objects policies (owned by supabase_storage_admin). Create them from Dashboard > Storage > Policies using the same expressions.';
  WHEN duplicate_object THEN
    RAISE NOTICE 'storage policies already exist -- skipped.';
END;
$do$;


-- ----------------------------------------------------------------------------
-- 3. Check
-- ----------------------------------------------------------------------------
SELECT id, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id IN ('school-assets', 'student-photos');
