'use client'

import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Spinner } from './spinner'
import { useToast } from './toast'

// File picker that uploads straight from the browser to Supabase Storage and
// puts the resulting object PATH into a hidden input, so the surrounding form
// submits a path rather than a file.
//
// The upload deliberately does not go through a server action: the file would
// have to cross the Next.js server inside the form payload, which is slow and
// runs into body-size limits on a 2MB image. RLS on storage.objects is what
// authorises it, exactly as it does for table writes.
export default function ImageUpload({
  name,
  bucket,
  folder,
  defaultPath = '',
  defaultPreview = null,
  label = 'Image',
  hint,
  isPublic = true,
  maxBytes = 2 * 1024 * 1024,
  onUploaded,
}) {
  const [path, setPath] = useState(defaultPath ?? '')
  const [preview, setPreview] = useState(defaultPreview)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef(null)
  const { error: toastError } = useToast()

  async function onPick(event) {
    const file = event.target.files?.[0]
    if (!file) return

    if (file.size > maxBytes) {
      toastError(`That image is ${(file.size / 1048576).toFixed(1)}MB — the limit is 2MB.`)
      event.target.value = ''
      return
    }

    setBusy(true)
    const supabase = createClient()
    const previousPath = path

    // Timestamped so the CDN cannot serve a stale copy under a reused name.
    const ext = (file.name.split('.').pop() ?? 'png').toLowerCase()
    const nextPath = `${folder}/${name}-${Date.now()}.${ext}`

    const { error } = await supabase.storage.from(bucket).upload(nextPath, file, {
      cacheControl: '3600',
      upsert: false,
    })

    if (error) {
      // A row-level-security refusal reads as an opaque failure otherwise.
      toastError(
        error.message.toLowerCase().includes('policy')
          ? 'You do not have permission to upload here.'
          : error.message
      )
      setBusy(false)
      event.target.value = ''
      return
    }

    // Preview: public buckets have a stable URL, private ones need signing.
    if (isPublic) {
      const { data } = supabase.storage.from(bucket).getPublicUrl(nextPath)
      setPreview(data.publicUrl)
    } else {
      const { data } = await supabase.storage.from(bucket).createSignedUrl(nextPath, 3600)
      setPreview(data?.signedUrl ?? null)
    }

    setPath(nextPath)
    onUploaded?.(nextPath)

    // Replacing leaves the old object behind otherwise -- still billed, and
    // nothing in the database points at it any more.
    if (previousPath && previousPath !== nextPath) {
      await supabase.storage.from(bucket).remove([previousPath])
    }

    setBusy(false)
    event.target.value = ''
  }

  async function clear() {
    if (path) {
      const supabase = createClient()
      await supabase.storage.from(bucket).remove([path])
    }
    setPath('')
    setPreview(null)
    onUploaded?.('')
  }

  return (
    <div>
      <span className="label">{label}</span>
      <input type="hidden" name={name} value={path} />

      <div className="flex items-center gap-3">
        <span
          className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border"
          style={{ borderColor: 'var(--border)', background: 'var(--card-alt)' }}
        >
          {busy ? (
            <span className="spinner" style={{ color: 'var(--brand)' }} />
          ) : preview ? (
            // Not next/image: the host is a Supabase project URL that would
            // need remotePatterns config, and signed URLs expire anyway.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="size-full object-cover" />
          ) : (
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              style={{ color: 'var(--muted-2)' }}
              aria-hidden="true"
            >
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <circle cx="9" cy="10" r="1.8" />
              <path d="M21 16l-5-5-8 8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </span>

        <div className="flex flex-col gap-1.5">
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              className="btn btn-ghost !py-1.5"
            >
              {busy ? (
                <>
                  <Spinner /> Uploading…
                </>
              ) : path ? (
                'Replace'
              ) : (
                'Upload'
              )}
            </button>
            {path && !busy && (
              <button type="button" onClick={clear} className="btn btn-danger !py-1.5">
                Remove
              </button>
            )}
          </div>
          {hint && (
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              {hint}
            </p>
          )}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={onPick}
        className="hidden"
        aria-label={label}
      />
    </div>
  )
}
