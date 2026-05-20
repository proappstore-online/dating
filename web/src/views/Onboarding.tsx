import { useState, useEffect, useRef } from 'react'
import type { Profile, Gender, LookingFor } from '../types'
import { saveProfile } from '../lib/db'
import { uploadProfilePhoto, ageFromDob } from '../lib/photos'

interface Props {
  userId: string
  /** Platform-level date of birth — set by AgeGate before this view ever renders. */
  dob: string
  initial: Profile | null
  onDone: () => void
}

export default function Onboarding({ userId, dob, initial, onDone }: Props) {
  const [displayName, setDisplayName] = useState(initial?.displayName ?? '')
  const [bio, setBio] = useState(initial?.bio ?? '')
  const [gender, setGender] = useState<Gender>(initial?.gender ?? 'woman')
  const [lookingFor, setLookingFor] = useState<LookingFor>(initial?.lookingFor ?? 'everyone')
  const [photos, setPhotos] = useState<string[]>(initial?.photos ?? [])
  const [lat, setLat] = useState<number | null>(initial?.lat ?? null)
  const [lng, setLng] = useState<number | null>(initial?.lng ?? null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (lat != null || !navigator.geolocation) return
    // No timeout — the browser permission prompt can sit for minutes
    // and a 5s abort would silently kill the request as soon as the
    // user blinked, leaving the profile without coordinates. Long-cache
    // is fine (5 minutes) since profile fixed to home base is typical.
    navigator.geolocation.getCurrentPosition(
      (pos) => { setLat(pos.coords.latitude); setLng(pos.coords.longitude) },
      () => { /* swallow: user can save without coords and edit later */ },
      { maximumAge: 5 * 60 * 1000 },
    )
  }, [lat])

  const age = ageFromDob(dob)
  const canSave =
    displayName.trim().length >= 2 &&
    age != null && age >= 18 &&
    photos.length >= 1

  const missing: string[] = []
  if (displayName.trim().length < 2) missing.push('display name (2+ chars)')
  if (photos.length < 1) missing.push('at least one photo')

  async function handleFiles(files: FileList | null) {
    if (!files) return
    setUploading(true)
    setError(null)
    try {
      const slots = 6 - photos.length
      const picked = Array.from(files).slice(0, slots)
      const skipped = files.length - picked.length
      for (const file of picked) {
        const url = await uploadProfilePhoto(userId, file)
        setPhotos((p) => [...p, url])
      }
      if (skipped > 0) {
        setError(`Only the first ${picked.length} added — 6-photo limit. ${skipped} skipped.`)
      }
    } catch (e) {
      setError('Upload failed: ' + (e as Error).message)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  function removePhoto(url: string) {
    setPhotos((p) => p.filter((u) => u !== url))
  }

  function movePhoto(idx: number, dir: -1 | 1) {
    setPhotos((p) => {
      const j = idx + dir
      if (j < 0 || j >= p.length) return p
      const next = [...p]
      ;[next[idx], next[j]] = [next[j]!, next[idx]!]
      return next
    })
  }

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    setError(null)
    try {
      const profile: Profile = {
        userId,
        displayName: displayName.trim(),
        dob,
        bio: bio.trim(),
        gender,
        lookingFor,
        photos,
        lat,
        lng,
        updatedAt: Date.now(),
      }
      await saveProfile(profile)
      onDone()
    } catch (e) {
      setError('Save failed: ' + (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-dvh px-5 py-8 max-w-md mx-auto">
      <h1 className="display-font text-3xl mb-1">Your profile</h1>
      <p className="text-[var(--muted)] mb-6 text-sm">A few details so people can find you.</p>

      <Section label="Photos">
        <div className="grid grid-cols-3 gap-2">
          {photos.map((url, idx) => (
            <div key={url} className="relative aspect-square rounded-xl overflow-hidden bg-[var(--accent-soft)] group">
              <img src={url} alt="" className="w-full h-full object-cover" />
              {idx === 0 && (
                <span className="absolute bottom-1 left-1 bg-[var(--accent)] text-white text-[10px] font-bold uppercase tracking-wide rounded px-1.5 py-0.5">
                  Primary
                </span>
              )}
              <div className="absolute top-1 left-1 flex gap-1">
                <button
                  onClick={() => movePhoto(idx, -1)}
                  disabled={idx === 0}
                  className="w-6 h-6 rounded-full bg-black/60 text-white text-xs leading-none flex items-center justify-center disabled:opacity-30"
                  aria-label="Move left"
                >
                  &larr;
                </button>
                <button
                  onClick={() => movePhoto(idx, 1)}
                  disabled={idx === photos.length - 1}
                  className="w-6 h-6 rounded-full bg-black/60 text-white text-xs leading-none flex items-center justify-center disabled:opacity-30"
                  aria-label="Move right"
                >
                  &rarr;
                </button>
              </div>
              <button
                onClick={() => removePhoto(url)}
                className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white text-xs leading-none flex items-center justify-center"
                aria-label="Remove photo"
              >
                &times;
              </button>
            </div>
          ))}
          {photos.length < 6 && (
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="aspect-square rounded-xl border-2 border-dashed border-[var(--line)] flex items-center justify-center text-3xl text-[var(--muted)] disabled:opacity-50"
            >
              {uploading ? '…' : '+'}
            </button>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <p className="text-xs text-[var(--muted)] mt-2">First photo is your headline &mdash; use the arrows to reorder. 1&ndash;6 photos.</p>
      </Section>

      <Section label="Display name">
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={40}
          placeholder="What should we call you?"
          className="w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-base"
        />
      </Section>

      <Section label="Age">
        <div className="rounded-xl bg-[var(--accent-soft)] px-4 py-3 text-sm flex items-center justify-between">
          <span>{age != null ? `${age} years old` : 'Unknown'}</span>
          <span className="text-xs text-[var(--muted)]">from platform &mdash; can&rsquo;t change</span>
        </div>
      </Section>

      <Section label="About you">
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={300}
          rows={4}
          placeholder="A line or two about you."
          className="w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-base resize-none"
        />
        <p className="text-xs text-[var(--muted)] mt-1 text-right">{bio.length}/300</p>
      </Section>

      <Section label="I am">
        <Pills
          value={gender}
          onChange={setGender}
          options={[
            { value: 'woman', label: 'Woman' },
            { value: 'man', label: 'Man' },
            { value: 'nonbinary', label: 'Non-binary' },
          ]}
        />
      </Section>

      <Section label="Looking for">
        <Pills
          value={lookingFor}
          onChange={setLookingFor}
          options={[
            { value: 'women', label: 'Women' },
            { value: 'men', label: 'Men' },
            { value: 'everyone', label: 'Everyone' },
          ]}
        />
      </Section>

      {error && <p className="text-[var(--error)] text-sm mb-3">{error}</p>}
      {!canSave && missing.length > 0 && (
        <p className="text-xs text-[var(--muted)] mt-4 text-center">
          Still need: {missing.join(' · ')}
        </p>
      )}

      <button
        onClick={handleSave}
        disabled={!canSave || saving}
        className="w-full rounded-full bg-[var(--accent)] text-white font-semibold py-3.5 mt-4 disabled:opacity-40 active:scale-[0.98] transition"
      >
        {saving ? 'Saving…' : initial ? 'Save' : 'Start dating'}
      </button>
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <label className="block text-xs uppercase tracking-wider font-semibold text-[var(--muted)] mb-2">{label}</label>
      {children}
    </div>
  )
}

function Pills<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
}) {
  return (
    <div className="flex gap-2 flex-wrap">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`px-4 py-2 rounded-full border text-sm font-medium transition ${
            value === o.value
              ? 'bg-[var(--ink)] text-[var(--paper)] border-[var(--ink)]'
              : 'bg-white text-[var(--ink)] border-[var(--line)]'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
