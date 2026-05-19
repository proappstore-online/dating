import type { Profile, View } from '../types'
import type { MatchWithProfile } from '../lib/db'
import { keyOf } from '../lib/realtime'

interface Props {
  me: Profile
  matches: MatchWithProfile[]
  unread: Record<string, number>
  onNavigate: (v: View) => void
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
          return (
            <li key={k}>
              <button
                onClick={() =>
                  onNavigate({ name: 'chat', aId: m.match.aId, bId: m.match.bId, otherName: m.other.displayName })
                }
                className="w-full flex items-center gap-3 p-3 rounded-2xl active:bg-[var(--accent-soft)] transition text-left"
              >
                <div className="relative w-14 h-14 rounded-full overflow-hidden bg-[var(--accent-soft)] flex-shrink-0">
                  {m.other.photos[0] && (
                    <img src={m.other.photos[0]} alt="" className="w-full h-full object-cover" />
                  )}
                  {count > 0 && (
                    <span className="absolute -top-1 -right-1 bg-[var(--accent)] text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center ring-2 ring-[var(--paper)]">
                      {count > 9 ? '9+' : count}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`font-semibold truncate ${count > 0 ? '' : ''}`}>{m.other.displayName}</div>
                  <div className={`text-sm truncate ${count > 0 ? 'text-[var(--ink)] font-medium' : 'text-[var(--muted)]'}`}>
                    {m.lastMessage
                      ? (m.lastMessage.senderId === me.userId ? 'You: ' : '') + m.lastMessage.body
                      : 'Say hi!'}
                  </div>
                </div>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
