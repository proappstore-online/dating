import { useState } from 'react'
import type { Profile, View } from '../types'
import { app } from '../lib/app'
import { ageFromDob } from '../lib/photos'
import Onboarding from './Onboarding'

interface Props {
  me: Profile
  onUpdated: (next: Profile) => void
  onNavigate: (v: View) => void
}

export default function ProfileTab({ me, onUpdated, onNavigate }: Props) {
  const [editing, setEditing] = useState(false)

  if (editing) {
    return (
      <Onboarding
        userId={me.userId}
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
    </div>
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
