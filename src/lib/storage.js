// Storage helpers.
//
// The database stores the object PATH, never a full URL -- "logo_url" is a
// column name inherited from the old schema, but what goes in it is
// "{school_id}/logo-123.png". A stored URL would break the moment the project
// ref changed, and a private bucket has no stable URL to store in the first
// place.

export const ASSETS = 'school-assets'
export const PHOTOS = 'student-photos'
// Separate from student-photos on purpose: that bucket's policies are written
// against students.read / students.write, which is the wrong key for an
// employee's photograph. See 005_teachers.sql.
export const STAFF_PHOTOS = 'staff-photos'

// Public bucket: the URL is deterministic, so it needs no client and no
// round trip.
export function publicUrl(path) {
  if (!path) return null
  if (path.startsWith('http')) return path // tolerate rows written before this
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${ASSETS}/${path}`
}

// Private bucket: every view needs a fresh signed URL. Batched because ID
// cards ask for one per student and doing that serially is a visible stall.
export async function signedPhotoUrls(supabase, paths, expiresIn = 3600, bucket = PHOTOS) {
  const wanted = [...new Set(paths.filter(Boolean))]
  if (wanted.length === 0) return new Map()

  const { data, error } = await supabase.storage.from(bucket).createSignedUrls(wanted, expiresIn)
  if (error) return new Map()

  return new Map(
    (data ?? []).filter((row) => row.signedUrl && !row.error).map((row) => [row.path, row.signedUrl])
  )
}

export async function signedPhotoUrl(supabase, path, expiresIn = 3600, bucket = PHOTOS) {
  if (!path) return null
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn)
  return data?.signedUrl ?? null
}
