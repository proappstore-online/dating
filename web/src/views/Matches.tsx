import { useState } from 'react'
import type { Profile, View } from '../types'
import type { MatchWithProfile } from '../lib/db'
import { keyOf } from '../lib/realtime'

interface Props {
  me: Profile
  matches: MatchWithProfile[]
  unread: Record<string, number>
  onNavigate: (v: View) => void
}

function relativeTime(ts: number): string {
  const diff = Math.max(0, Date.now() - ts)
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d`
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function Matches({ me, matches, unread, onNavigate }: Props) {
  if (matches.length === 0) {
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
        {matches.map((m) => {
          const k = keyOf(m.match.aId, m.match.bId)
          const count = unread[k] ?? 0
          const lastTs = m.lastMessage?.createdAt ?? m.match.createdAt
          return (
            <li key={k}>
              <MatchRow
                me={me}
                m={m}
                count={count}
                stamp={relativeTime(lastTs)}
                onOpen={() =>
                  onNavigate({ name: 'chat', aId: m.match.aId, bId: m.match.bId, otherName: m.other.displayName })
                }
              />
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function MatchRow({
  me, m, count, stamp, onOpen,
}: {
  me: Profile
  m: MatchWithProfile
  count: number
  stamp: string
  onOpen: () => void
}) {
  const [imgBroken, setImgBroken] = useState(false)
  const photo = m.other.photos[0]
  const initial = (m.other.displayName || '?').trim().charAt(0).toUpperCase()
  return (
    <button
      onClick={onOpen}
      className="w-full flex items-center gap-3 p-3 rounded-2xl active:bg-[var(--accent-soft)] transition text-left"
    >
      <div className="relative w-14 h-14 rounded-full overflow-hidden flex-shrink-0">
        {photo && !imgBroken ? (
          <img
            src={photo}
            alt=""
            className="w-full h-full object-cover"
            onError={() => setImgBroken(true)}
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center text-xl font-bold text-white"
            style={{ background: `linear-gradient(135deg, hsl(${(m.other.displayName.charCodeAt(0) || 200) * 7 % 360}, 60%, 55%), hsl(${(m.other.displayName.charCodeAt(0) || 200) * 7 % 360 + 40}, 50%, 45%))` }}
          >
            {initial}
          </div>
        )}
        {count > 0 && (
          <span className="absolute -top-1 -right-1 bg-[var(--accent)] text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center ring-2 ring-[var(--paper)]">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <div className="font-semibold truncate">{m.other.displayName}</div>
          <div className="text-xs text-[var(--muted)] flex-shrink-0">{stamp}</div>
        </div>
        <div className={`text-sm truncate ${count > 0 ? 'text-[var(--ink)] font-medium' : 'text-[var(--muted)]'}`}>
          {m.lastMessage
            ? (m.lastMessage.senderId === me.userId ? 'You: ' : '') + m.lastMessage.body
            : 'Say hi!'}
        </div>
      </div>
    </button>
  )
}
