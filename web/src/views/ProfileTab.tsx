import { useEffect, useState } from 'react'
import type { Profile, View } from '../types'
import { app } from '../lib/app'
import { ageFromDob } from '../lib/photos'
import { loadPrefs, savePrefs, type Preferences, DEFAULT_PREFS } from '../lib/prefs'
import { getNotificationPermission, requestNotificationPermission } from '../lib/realtime'
import { seedDemoProfiles } from '../lib/seed'
import Onboarding from './Onboarding'

const SEED_ENABLED = typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('seed')

interface Props {
  me: Profile
  onUpdated: (next: Profile) => void
  onNavigate: (v: View) => void
}

export default function ProfileTab({ me, onUpdated, onNavigate }: Props) {
  const [editing, setEditing] = useState(false)
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFS)
  const [prefsLoaded, setPrefsLoaded] = useState(false)
  const [notifPerm, setNotifPerm] = useState<NotificationPermission | 'unsupported'>(getNotificationPermission())
  const [seedStatus, setSeedStatus] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    loadPrefs().then((p) => { if (!cancelled) { setPrefs(p); setPrefsLoaded(true) } })
    return () => { cancelled = true }
  }, [])

  async function patchPrefs(patch: Partial<Preferences>) {
    const next = { ...prefs, ...patch }
    setPrefs(next)
    try { await savePrefs(next) } catch { /* swallow; will re-sync on next load */ }
  }

  if (editing) {
    return (
      <Onboarding
        userId={me.userId}
        dob={me.dob}
        initial={me}
        onDone={() => {
          setEditing(false)
          onUpdated({ ...me, updatedAt: Date.now() })
        }}
      />
    )
  }

  const age = ageFromDob(me.dob)
  return (
    <div className="px-5 py-6 max-w-md mx-auto">
      <h1 className="display-font text-3xl mb-6">Profile</h1>
      <div className="rounded-3xl overflow-hidden bg-[var(--accent-soft)] mb-4">
        {me.photos[0] ? (
          <img src={me.photos[0]} alt="" className="w-full aspect-square object-cover" />
        ) : (
          <div className="w-full aspect-square flex items-center justify-center text-6xl text-[var(--muted)]">?</div>
        )}
      </div>

      <div className="mb-2 flex items-baseline gap-2">
        <h2 className="text-2xl font-bold display-font">{me.displayName}</h2>
        {age != null && <span className="text-xl text-[var(--muted)]">{age}</span>}
      </div>
      {me.bio && <p className="text-[var(--ink)] mb-6 whitespace-pre-line">{me.bio}</p>}

      <Row label="I am" value={genderLabel(me.gender)} />
      <Row label="Looking for" value={lookingForLabel(me.lookingFor)} />
      <Row label="Photos" value={`${me.photos.length} uploaded`} />

      <h3 className="display-font text-xl mt-8 mb-2">Notifications</h3>
      <div className="rounded-2xl border border-[var(--line)] p-4 bg-white">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm">
            {notifPerm === 'granted' && 'On — pings while Dating is open in any tab.'}
            {notifPerm === 'denied' && (
              <span className="text-[var(--muted)]">Blocked in browser settings.</span>
            )}
            {notifPerm === 'default' && 'Get pinged when someone messages you.'}
            {notifPerm === 'unsupported' && (
              <span className="text-[var(--muted)]">Not supported in this browser.</span>
            )}
          </div>
          {notifPerm === 'default' && (
            <button
              onClick={async () => setNotifPerm(await requestNotificationPermission())}
              className="rounded-full bg-[var(--ink)] text-[var(--paper)] font-semibold px-4 py-2 text-sm flex-shrink-0"
            >
              Enable
            </button>
          )}
          {notifPerm === 'granted' && (
            <span className="text-[var(--success)] font-semibold text-sm flex-shrink-0">On</span>
          )}
        </div>
        <p className="text-xs text-[var(--muted)] mt-3">
          Install Dating to your home screen for the full app experience &mdash; chats stay in sync, no tab to keep open.
        </p>
      </div>

      <h3 className="display-font text-xl mt-8 mb-2">Discovery</h3>
      <div className="rounded-2xl border border-[var(--line)] p-4 bg-white">
        <Slider
          label="Maximum distance"
          value={prefs.maxDistanceKm}
          min={5}
          max={500}
          step={5}
          format={(v) => `${v} km`}
          onChange={(v) => patchPrefs({ maxDistanceKm: v })}
          disabled={!prefsLoaded}
        />
        <div className="h-px bg-[var(--line)] my-4" />
        <Slider
          label="Minimum age"
          value={prefs.minAge}
          min={18}
          max={Math.max(18, prefs.maxAge - 1)}
          step={1}
          format={(v) => String(v)}
          onChange={(v) => patchPrefs({ minAge: v })}
          disabled={!prefsLoaded}
        />
        <Slider
          label="Maximum age"
          value={prefs.maxAge}
          min={Math.min(80, prefs.minAge + 1)}
          max={80}
          step={1}
          format={(v) => String(v)}
          onChange={(v) => patchPrefs({ maxAge: v })}
          disabled={!prefsLoaded}
        />
      </div>

      <button
        onClick={() => setEditing(true)}
        className="w-full rounded-full bg-[var(--ink)] text-[var(--paper)] font-semibold py-3.5 mt-6"
      >
        Edit profile
      </button>
      <button
        onClick={() => { app.auth.signOut(); onNavigate({ name: 'signin' }) }}
        className="w-full rounded-full border border-[var(--line)] py-3.5 mt-3"
      >
        Sign out
      </button>

      {SEED_ENABLED && (
        <div className="mt-8 p-4 rounded-2xl bg-[var(--accent-soft)] border border-dashed border-[var(--accent)]">
          <p className="text-xs font-semibold text-[var(--accent)] uppercase tracking-wider mb-1">Dev tools</p>
          <p className="text-sm text-[var(--ink)] mb-3">Insert 12 demo profiles around your location so you can swipe.</p>
          <button
            onClick={async () => {
              setSeedStatus('Inserting…')
              try {
                const n = await seedDemoProfiles(me.lat, me.lng)
                setSeedStatus(`Inserted ${n} demo profiles. Head to Discover.`)
              } catch (e) {
                setSeedStatus('Failed: ' + (e as Error).message)
              }
            }}
            className="rounded-full bg-[var(--accent)] text-white font-semibold px-4 py-2 text-sm"
          >
            Seed demo profiles
          </button>
          {seedStatus && <p className="text-xs mt-2 text-[var(--ink)]">{seedStatus}</p>}
        </div>
      )}
    </div>
  )
}

function Slider({
  label, value, min, max, step, format, onChange, disabled,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  format: (v: number) => string
  onChange: (v: number) => void
  disabled?: boolean
}) {
  return (
    <label className="block">
      <div className="flex justify-between text-sm mb-1">
        <span className="text-[var(--muted)]">{label}</span>
        <span className="font-semibold">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[var(--accent)]"
      />
    </label>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-3 border-b border-[var(--line)] text-sm">
      <span className="text-[var(--muted)]">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}

function genderLabel(g: Profile['gender']): string {
  return g === 'woman' ? 'Woman' : g === 'man' ? 'Man' : 'Non-binary'
}

function lookingForLabel(l: Profile['lookingFor']): string {
  return l === 'women' ? 'Women' : l === 'men' ? 'Men' : 'Everyone'
}
