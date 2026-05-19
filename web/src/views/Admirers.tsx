import { useEffect, useState } from 'react'
import type { Profile, View } from '../types'
import { loadAdmirers } from '../lib/db'
import { ageFromDob } from '../lib/photos'

interface Props {
  me: Profile
  onNavigate: (v: View) => void
}

export default function Admirers({ me, onNavigate }: Props) {
  const [admirers, setAdmirers] = useState<Profile[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const list = await loadAdmirers(me.userId)
        if (!cancelled) setAdmirers(list)
      } catch (e) {
        if (!cancelled) setError((e as Error).message)
      }
    })()
    return () => { cancelled = true }
  }, [me.userId])

  return (
    <div className="min-h-dvh">
      <header className="flex items-center gap-3 px-4 py-3 border-b border-[var(--line)] bg-[var(--paper)]">
        <button
          onClick={() => onNavigate({ name: 'discover' })}
          className="text-2xl text-[var(--muted)] active:opacity-50"
          aria-label="Back"
        >
          &larr;
        </button>
        <h1 className="font-semibold flex-1">Likes you</h1>
      </header>

      {error && <p className="p-6 text-[var(--error)]">{error}</p>}
      {!error && !admirers && <p className="p-6 text-[var(--muted)]">Loading…</p>}
      {admirers && admirers.length === 0 && (
        <div className="p-8 text-center text-[var(--muted)]">
          <p className="text-lg">No one yet.</p>
          <p className="text-sm mt-1">Keep your profile fresh.</p>
        </div>
      )}
      {admirers && admirers.length > 0 && (
        <>
          <p className="px-5 pt-4 pb-2 text-sm text-[var(--muted)]">
            Swipe right on any of these and you&rsquo;ll match instantly.
          </p>
          <div className="grid grid-cols-2 gap-3 p-4">
            {admirers.map((a) => {
              const age = ageFromDob(a.dob)
              return (
                <button
                  key={a.userId}
                  onClick={() => onNavigate({ name: 'discover' })}
                  className="relative aspect-[3/4] rounded-2xl overflow-hidden bg-[var(--accent-soft)] text-left active:scale-95 transition"
                >
                  {a.photos[0] && (
                    <img
                      src={a.photos[0]}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover blur-md scale-110"
                      draggable={false}
                    />
                  )}
                  <div className="absolute inset-0 bg-black/10" />
                  <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/70 to-transparent text-white">
                    <div className="font-semibold truncate">
                      {a.displayName}{age != null ? `, ${age}` : ''}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
          <p className="px-5 pb-8 text-xs text-[var(--muted)]">
            Photos are blurred until you mutual-match.
          </p>
        </>
      )}
    </div>
  )
}
