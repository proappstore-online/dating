// Published on https://proappstore.online — visit for more pro apps.
import { useEffect, useState, useCallback } from 'react'
import type { User } from '@proappstore/sdk'
import type { Profile, View } from './types'
import { app } from './lib/app'
import { getMyProfile, loadMatches, type MatchWithProfile } from './lib/db'
import { useRealtime, broadcastProfileUpdated } from './lib/realtime'
import SignIn from './views/SignIn'
import AgeGate from './views/AgeGate'
import Onboarding from './views/Onboarding'
import { ageFromDob } from './lib/photos'
import Discover from './views/Discover'
import Admirers from './views/Admirers'
import Matches from './views/Matches'
import Chat from './views/Chat'
import ProfileTab from './views/ProfileTab'

type Stage =
  | { name: 'booting' }
  | { name: 'signin' }
  | { name: 'age-gate'; user: User }
  | { name: 'too-young'; age: number }
  | { name: 'onboarding'; user: User; dob: string; initial: Profile | null }
  | { name: 'ready'; user: User; me: Profile }

export default function App() {
  const [stage, setStage] = useState<Stage>({ name: 'booting' })
  const [view, setView] = useState<View>({ name: 'discover' })

  useEffect(() => {
    let cancelled = false
    let off: (() => void) | null = null
    ;(async () => {
      await app.auth.init()
      if (cancelled) return
      off = app.auth.onChange(async (user: User | null) => {
        if (cancelled) return
        if (!user) {
          setStage({ name: 'signin' })
          setView({ name: 'discover' })
          return
        }
        if (!user.dateOfBirth) {
          setStage({ name: 'age-gate', user })
          return
        }
        const age = ageFromDob(user.dateOfBirth)
        if (age == null || age < 18) {
          setStage({ name: 'too-young', age: age ?? 0 })
          return
        }
        try {
          const profile = await getMyProfile(user.id)
          if (cancelled) return
          if (!profile) {
            setStage({ name: 'onboarding', user, dob: user.dateOfBirth, initial: null })
          } else {
            setStage({ name: 'ready', user, me: profile })
            setView({ name: 'discover' })
          }
        } catch {
          if (!cancelled) setStage({ name: 'onboarding', user, dob: user.dateOfBirth, initial: null })
        }
      })
    })()
    return () => {
      cancelled = true
      off?.()
    }
  }, [])

  if (stage.name === 'booting') {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center px-6">
        <div className="text-6xl mb-3 animate-pulse" aria-hidden="true">&#10084;</div>
        <p className="text-sm text-[var(--muted)]">Warming up…</p>
      </div>
    )
  }
  if (stage.name === 'signin') {
    return <SignIn />
  }
  if (stage.name === 'age-gate') {
    return (
      <AgeGate
        onSet={() => {
          const user = app.auth.user
          if (!user || !user.dateOfBirth) return
          const age = ageFromDob(user.dateOfBirth)
          if (age == null || age < 18) {
            setStage({ name: 'too-young', age: age ?? 0 })
          } else {
            setStage({ name: 'onboarding', user, dob: user.dateOfBirth, initial: null })
          }
        }}
      />
    )
  }
  if (stage.name === 'too-young') {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center px-6 text-center">
        <div className="text-5xl mb-4">&#9203;</div>
        <h1 className="display-font text-3xl mb-2">Come back later.</h1>
        <p className="text-[var(--muted)] max-w-xs mb-6">
          Dating is 18+. You can keep using other ProAppStore apps in the meantime.
        </p>
        <button
          onClick={() => app.auth.signOut()}
          className="rounded-full border border-[var(--line)] px-6 py-2.5"
        >
          Sign out
        </button>
      </div>
    )
  }
  if (stage.name === 'onboarding') {
    return (
      <Onboarding
        userId={stage.user.id}
        dob={stage.dob}
        initial={stage.initial}
        onDone={async () => {
          const me = await getMyProfile(stage.user.id)
          if (me) setStage({ name: 'ready', user: stage.user, me })
          // Tell everyone else's Discover: there's a new face in the pool.
          broadcastProfileUpdated(stage.user.id)
        }}
      />
    )
  }

  return <Ready me={stage.me} view={view} setView={setView} onProfileUpdate={(next) => setStage({ ...stage, me: next })} />
}

function Ready({
  me, view, setView, onProfileUpdate,
}: {
  me: Profile
  view: View
  setView: (v: View) => void
  onProfileUpdate: (next: Profile) => void
}) {
  const [matches, setMatches] = useState<MatchWithProfile[]>([])
  const refreshMatches = useCallback(async () => {
    try { setMatches(await loadMatches(me.userId)) }
    catch { /* swallow; will retry on next nav */ }
  }, [me.userId])

  useEffect(() => { refreshMatches() }, [refreshMatches])
  useEffect(() => {
    if (view.name === 'matches' || view.name === 'discover') refreshMatches()
  }, [view, refreshMatches])

  const [incomingMatch, setIncomingMatch] = useState<Profile | null>(null)
  const activeChat = view.name === 'chat' ? { aId: view.aId, bId: view.bId } : null

  // Bumped whenever something happens that should invalidate Discover's
  // candidate stack: prefs change (widened radius / age), profile edited,
  // admirer count changed via a fresh match, or somebody else saved their
  // profile (delivered through the global discovery-feed room).
  const [discoverEpoch, setDiscoverEpoch] = useState(0)
  const bumpDiscover = useCallback(() => setDiscoverEpoch((e) => e + 1), [])

  const { unread, clearUnread } = useRealtime(
    matches,
    activeChat,
    me.userId,
    (other) => {
      refreshMatches()
      setIncomingMatch(other)
    },
    bumpDiscover,
  )

  useEffect(() => {
    if (view.name === 'chat') clearUnread(view.aId, view.bId)
  }, [view, clearUnread])

  const totalUnread = Object.values(unread).reduce((a, b) => a + b, 0)

  if (view.name === 'chat') {
    return <Chat me={me} aId={view.aId} bId={view.bId} otherName={view.otherName} onNavigate={setView} />
  }

  // Tabs stay mounted (display: none when inactive) so the swipe stack
  // survives a quick "check messages and come back" trip without
  // re-fetching from D1 every time.
  return (
    <div className="flex flex-col h-dvh">
      <main className="flex-1 overflow-y-auto">
        <div className={view.name === 'discover' ? 'h-full' : 'hidden'}>
          <Discover me={me} epoch={discoverEpoch} onMatched={() => { refreshMatches(); bumpDiscover() }} onNavigate={setView} />
        </div>
        <div className={view.name === 'admirers' ? '' : 'hidden'}>
          <Admirers me={me} onNavigate={setView} />
        </div>
        <div className={view.name === 'matches' ? '' : 'hidden'}>
          <Matches me={me} matches={matches} unread={unread} onNavigate={setView} />
        </div>
        <div className={view.name === 'profile' ? '' : 'hidden'}>
          <ProfileTab
            me={me}
            onUpdated={(next) => {
              onProfileUpdate(next)
              bumpDiscover()
              broadcastProfileUpdated(me.userId)
            }}
            onPrefsChanged={bumpDiscover}
            onNavigate={setView}
          />
        </div>
      </main>
      <BottomNav active={view.name} unread={totalUnread} onChange={(n) => setView({ name: n } as View)} />
      {incomingMatch && (
        <IncomingMatchOverlay
          me={me}
          other={incomingMatch}
          onOpenChat={() => {
            const [aId, bId] = me.userId < incomingMatch.userId
              ? [me.userId, incomingMatch.userId]
              : [incomingMatch.userId, me.userId]
            setIncomingMatch(null)
            setView({ name: 'chat', aId, bId, otherName: incomingMatch.displayName })
          }}
          onClose={() => setIncomingMatch(null)}
        />
      )}
    </div>
  )
}

function IncomingMatchOverlay({
  me, other, onOpenChat, onClose,
}: {
  me: Profile; other: Profile
  onOpenChat: () => void; onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 bg-[var(--accent)]/95 text-white flex flex-col items-center justify-center px-6 text-center">
      <h2 className="display-font text-5xl mb-2">It&rsquo;s a match!</h2>
      <p className="mb-10 opacity-90">You and {other.displayName} liked each other.</p>
      <div className="flex gap-6 mb-12">
        <MatchAvatar src={me.photos[0]} name={me.displayName} />
        <MatchAvatar src={other.photos[0]} name={other.displayName} />
      </div>
      <button
        onClick={onOpenChat}
        className="rounded-full bg-white text-[var(--accent)] font-semibold px-8 py-3 mb-3"
      >
        Say hi
      </button>
      <button onClick={onClose} className="text-white/80 underline text-sm">Keep swiping</button>
    </div>
  )
}

function MatchAvatar({ src, name }: { src: string | undefined; name: string }) {
  const [broken, setBroken] = useState(false)
  const initial = (name || '?').trim().charAt(0).toUpperCase()
  return (
    <div className="w-28 h-28 rounded-full overflow-hidden border-4 border-white bg-white/20 flex items-center justify-center text-4xl font-bold">
      {src && !broken
        ? <img src={src} alt="" className="w-full h-full object-cover" onError={() => setBroken(true)} />
        : <span>{initial}</span>}
    </div>
  )
}

function BottomNav({
  active,
  unread,
  onChange,
}: {
  active: View['name']
  unread: number
  onChange: (n: 'discover' | 'matches' | 'profile') => void
}) {
  return (
    <nav
      className="flex border-t border-[var(--line)] bg-[var(--paper)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <Tab label="Discover" icon="&#10084;" current={active === 'discover'} onClick={() => onChange('discover')} />
      <Tab label="Matches" icon="&#128172;" badge={unread} current={active === 'matches'} onClick={() => onChange('matches')} />
      <Tab label="Profile" icon="&#128100;" current={active === 'profile'} onClick={() => onChange('profile')} />
    </nav>
  )
}

function Tab({
  label,
  icon,
  current,
  onClick,
  badge,
}: {
  label: string
  icon: string
  current: boolean
  onClick: () => void
  badge?: number
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-2 flex flex-col items-center gap-0.5 text-xs relative transition-colors ${
        current ? 'text-[var(--accent)]' : 'text-[var(--muted)]'
      }`}
    >
      <span
        className={`text-xl relative w-14 h-7 flex items-center justify-center rounded-full transition-all ${
          current ? 'bg-[var(--accent-soft)] scale-100' : 'scale-95'
        }`}
        dangerouslySetInnerHTML={{ __html: icon }}
      />
      {badge != null && badge > 0 && (
        <span className="absolute top-1.5 right-1/2 translate-x-7 bg-[var(--accent)] text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center ring-2 ring-[var(--paper)]">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
      <span className={`transition-opacity ${current ? 'font-semibold' : ''}`}>{label}</span>
    </button>
  )
}

