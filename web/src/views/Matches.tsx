import { useEffect, useState } from 'react'
import type { Profile, View } from '../types'
import { loadMatches, type MatchWithProfile } from '../lib/db'

interface Props {
  me: Profile
  onNavigate: (v: View) => void
}

export default function Matches({ me, onNavigate }: Props) {
  const [items, setItems] = useState<MatchWithProfile[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const ms = await loadMatches(me.userId)
        if (!cancelled) setItems(ms)
      } catch (e) {
        if (!cancelled) setError((e as Error).message)
      }
    })()
    return () => { cancelled = true }
  }, [me.userId])

  if (error) return <div className="p-6 text-[var(--error)]">{error}</div>
  if (!items) return <div className="p-6 text-[var(--muted)]">Loading…</div>
  if (items.length === 0) {
    return (
      <div className="p-8 text-center text-[var(--muted)]">
        <div className="text-5xl mb-3">&#128172;</div>
        <p className="text-lg">No matches yet.</p>
        <p className="text-sm mt-1">Head over to Discover and start swiping.</p>
      </div>
    )
  }

  return (
    <div className="px-4 py-4">
      <h1 className="display-font text-3xl mb-4 px-1">Matches</h1>
      <ul className="space-y-1">
        {items.map((m) => (
          <li key={m.match.aId + ':' + m.match.bId}>
            <button
              onClick={() =>
                onNavigate({ name: 'chat', aId: m.match.aId, bId: m.match.bId, otherName: m.other.displayName })
              }
              className="w-full flex items-center gap-3 p-3 rounded-2xl active:bg-[var(--accent-soft)] transition text-left"
            >
              <div className="w-14 h-14 rounded-full overflow-hidden bg-[var(--accent-soft)] flex-shrink-0">
                {m.other.photos[0] && (
                  <img src={m.other.photos[0]} alt="" className="w-full h-full object-cover" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate">{m.other.displayName}</div>
                <div className="text-sm text-[var(--muted)] truncate">
                  {m.lastMessage
                    ? (m.lastMessage.senderId === me.userId ? 'You: ' : '') + m.lastMessage.body
                    : 'Say hi!'}
                </div>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
