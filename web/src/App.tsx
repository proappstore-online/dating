import { useEffect, useState } from 'react'
import type { User } from '@proappstore/sdk'
import type { Profile, View } from './types'
import { app } from './lib/app'
import { getMyProfile } from './lib/db'
import SignIn from './views/SignIn'
import Onboarding from './views/Onboarding'
import Discover from './views/Discover'
import Matches from './views/Matches'
import Chat from './views/Chat'
import ProfileTab from './views/ProfileTab'

type Stage =
  | { name: 'booting' }
  | { name: 'signin' }
  | { name: 'onboarding'; user: User; initial: Profile | null }
  | { name: 'ready'; user: User; me: Profile }

export default function App() {
  const [stage, setStage] = useState<Stage>({ name: 'booting' })
  const [view, setView] = useState<View>({ name: 'discover' })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      await app.auth.init()
      const off = app.auth.onChange(async (user: User | null) => {
        if (cancelled) return
        if (!user) {
          setStage({ name: 'signin' })
          setView({ name: 'discover' })
          return
        }
        try {
          const profile = await getMyProfile(user.id)
          if (cancelled) return
          if (!profile) {
            setStage({ name: 'onboarding', user, initial: null })
          } else {
            setStage({ name: 'ready', user, me: profile })
            setView({ name: 'discover' })
          }
        } catch {
          if (!cancelled) setStage({ name: 'onboarding', user, initial: null })
        }
      })
      return () => off()
    })()
    return () => { cancelled = true }
  }, [])

  if (stage.name === 'booting') {
    return <div className="min-h-dvh flex items-center justify-center text-[var(--muted)]">Loading…</div>
  }
  if (stage.name === 'signin') {
    return <SignIn />
  }
  if (stage.name === 'onboarding') {
    return (
      <Onboarding
        userId={stage.user.id}
        initial={stage.initial}
        onDone={async () => {
          const me = await getMyProfile(stage.user.id)
          if (me) setStage({ name: 'ready', user: stage.user, me })
        }}
      />
    )
  }

  const { me } = stage

  if (view.name === 'chat') {
    return <Chat me={me} aId={view.aId} bId={view.bId} otherName={view.otherName} onNavigate={setView} />
  }

  return (
    <div className="flex flex-col h-dvh">
      <main className="flex-1 overflow-y-auto">
        {view.name === 'discover' && <Discover me={me} />}
        {view.name === 'matches' && <Matches me={me} onNavigate={setView} />}
        {view.name === 'profile' && (
          <ProfileTab me={me} onUpdated={(next) => setStage({ ...stage, me: next })} onNavigate={setView} />
        )}
      </main>
      <BottomNav active={view.name} onChange={(n) => setView({ name: n } as View)} />
    </div>
  )
}

function BottomNav({
  active,
  onChange,
}: {
  active: View['name']
  onChange: (n: 'discover' | 'matches' | 'profile') => void
}) {
  return (
    <nav
      className="flex border-t border-[var(--line)] bg-[var(--paper)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <Tab label="Discover" icon="&#10084;" current={active === 'discover'} onClick={() => onChange('discover')} />
      <Tab label="Matches" icon="&#128172;" current={active === 'matches'} onClick={() => onChange('matches')} />
      <Tab label="Profile" icon="&#128100;" current={active === 'profile'} onClick={() => onChange('profile')} />
    </nav>
  )
}

function Tab({
  label,
  icon,
  current,
  onClick,
}: {
  label: string
  icon: string
  current: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-3 flex flex-col items-center gap-0.5 text-xs ${
        current ? 'text-[var(--accent)]' : 'text-[var(--muted)]'
      }`}
    >
      <span className="text-xl" dangerouslySetInnerHTML={{ __html: icon }} />
      <span>{label}</span>
    </button>
  )
}
