import { useState, useEffect, useRef } from 'react'
import type { Candidate, Profile, SwipeDirection, View } from '../types'
import { loadCandidates, recordSwipe, countAdmirers } from '../lib/db'
import { ageFromDob } from '../lib/photos'
import { formatDistance } from '../lib/geo'
import { loadPrefs } from '../lib/prefs'
import { broadcastMatch } from '../lib/realtime'

interface Props {
  me: Profile
  onMatched: () => void
  onNavigate: (v: View) => void
}

const THRESHOLD = 120
const FLY_OUT = 700

export default function Discover({ me, onMatched, onNavigate }: Props) {
  const [stack, setStack] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(true)
  const [matched, setMatched] = useState<Candidate | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [admirerCount, setAdmirerCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const prefs = await loadPrefs()
        const [candidates, admirers] = await Promise.all([
          loadCandidates(me, prefs),
          countAdmirers(me.userId),
        ])
        if (cancelled) return
        setStack([...candidates].reverse())
        setAdmirerCount(admirers)
      } catch (e) {
        if (!cancelled) setError((e as Error).message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [me])

  async function handleSwipe(target: Candidate, direction: SwipeDirection) {
    setStack((s) => s.filter((p) => p.userId !== target.userId))
    try {
      const match = await recordSwipe(me.userId, target.userId, direction)
      if (match) {
        setMatched(target)
        onMatched()
        broadcastMatch(target.userId, {
          kind: 'match',
          aId: match.aId,
          bId: match.bId,
          otherId: me.userId,
        })
      }
    } catch (e) {
      setError((e as Error).message)
    }
  }

  if (loading) {
    return <CenteredMessage>Looking around…</CenteredMessage>
  }
  if (error) {
    return <CenteredMessage>Trouble loading: {error}</CenteredMessage>
  }
  if (stack.length === 0) {
    return (
      <CenteredMessage>
        <div className="text-6xl mb-4">&#9728;</div>
        <p className="text-lg mb-1">That&rsquo;s everyone for now.</p>
        <p className="text-sm text-[var(--muted)]">Check back soon for new people nearby.</p>
      </CenteredMessage>
    )
  }

  const top = stack[stack.length - 1]
  const next = stack[stack.length - 2]

  return (
    <div className="relative h-full w-full flex flex-col">
      {admirerCount > 0 && (
        <button
          onClick={() => onNavigate({ name: 'admirers' })}
          className="mx-4 mt-3 rounded-2xl bg-[var(--accent)] text-white px-4 py-3 flex items-center gap-3 active:opacity-90 transition"
        >
          <span className="text-2xl">&#10084;</span>
          <span className="font-semibold text-left flex-1">
            {admirerCount} {admirerCount === 1 ? 'person likes' : 'people like'} you
          </span>
          <span className="text-xl opacity-80">&rsaquo;</span>
        </button>
      )}
      <div className="relative flex-1 flex items-center justify-center px-4 pb-4">
        {next && <Card key={next.userId} profile={next} isTop={false} onDecide={() => {}} />}
        {top && <Card key={top.userId} profile={top} isTop={true} onDecide={(d) => handleSwipe(top, d)} />}
      </div>
      <div className="flex justify-center gap-6 pb-6">
        <ActionButton onClick={() => top && handleSwipe(top, 'left')} variant="nope">&times;</ActionButton>
        <ActionButton onClick={() => top && handleSwipe(top, 'right')} variant="yes">&#10084;</ActionButton>
      </div>
      {matched && <MatchOverlay me={me} other={matched} onClose={() => setMatched(null)} />}
    </div>
  )
}

function Card({
  profile,
  isTop,
  onDecide,
}: {
  profile: Candidate
  isTop: boolean
  onDecide: (direction: SwipeDirection) => void
}) {
  const [drag, setDrag] = useState({ x: 0, y: 0 })
  const [flyOut, setFlyOut] = useState<SwipeDirection | null>(null)
  const [photoIdx, setPhotoIdx] = useState(0)
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const age = ageFromDob(profile.dob)

  function handleStart(e: React.PointerEvent) {
    if (!isTop || flyOut) return
    ;(e.target as Element).setPointerCapture(e.pointerId)
    startRef.current = { x: e.clientX, y: e.clientY }
  }
  function handleMove(e: React.PointerEvent) {
    if (!startRef.current || flyOut) return
    setDrag({ x: e.clientX - startRef.current.x, y: e.clientY - startRef.current.y })
  }
  function handleEnd() {
    if (!startRef.current || flyOut) return
    startRef.current = null
    if (drag.x > THRESHOLD) {
      setFlyOut('right')
      setTimeout(() => onDecide('right'), 220)
    } else if (drag.x < -THRESHOLD) {
      setFlyOut('left')
      setTimeout(() => onDecide('left'), 220)
    } else {
      setDrag({ x: 0, y: 0 })
    }
  }

  function tapPhoto(e: React.MouseEvent) {
    if (!isTop || profile.photos.length <= 1) return
    if (Math.abs(drag.x) > 4) return
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const goNext = e.clientX - rect.left > rect.width / 2
    setPhotoIdx((i) => {
      if (goNext) return Math.min(profile.photos.length - 1, i + 1)
      return Math.max(0, i - 1)
    })
  }

  const transform = flyOut
    ? `translate(${flyOut === 'right' ? FLY_OUT : -FLY_OUT}px, ${drag.y}px) rotate(${flyOut === 'right' ? 30 : -30}deg)`
    : `translate(${drag.x}px, ${drag.y}px) rotate(${drag.x / 20}deg)`
  const transition = flyOut
    ? 'transform 220ms ease-out, opacity 220ms ease-out'
    : startRef.current ? 'none' : 'transform 200ms ease-out'

  const likeOpacity = Math.max(0, Math.min(1, drag.x / THRESHOLD))
  const nopeOpacity = Math.max(0, Math.min(1, -drag.x / THRESHOLD))

  const scaleClass = isTop ? '' : 'scale-95 opacity-90'
  const photo = profile.photos[photoIdx] ?? null

  return (
    <div
      className={`absolute inset-4 rounded-3xl overflow-hidden shadow-2xl bg-[var(--accent-soft)] ${scaleClass}`}
      style={{
        transform,
        transition,
        opacity: flyOut ? 0 : undefined,
        touchAction: isTop ? 'none' : undefined,
      }}
      onPointerDown={handleStart}
      onPointerMove={handleMove}
      onPointerUp={handleEnd}
      onPointerCancel={handleEnd}
      onClick={tapPhoto}
    >
      {photo ? (
        <img src={photo} alt="" className="absolute inset-0 w-full h-full object-cover" draggable={false} />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-6xl text-[var(--muted)]">?</div>
      )}

      {profile.photos.length > 1 && (
        <div className="absolute top-3 left-3 right-3 flex gap-1">
          {profile.photos.map((_, i) => (
            <div
              key={i}
              className={`flex-1 h-1 rounded-full ${i === photoIdx ? 'bg-white' : 'bg-white/40'}`}
            />
          ))}
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 p-5 pt-16 bg-gradient-to-t from-black/80 via-black/30 to-transparent text-white">
        <div className="flex items-baseline gap-2">
          <h2 className="text-2xl font-bold display-font">{profile.displayName}</h2>
          {age != null && <span className="text-2xl font-light opacity-90">{age}</span>}
        </div>
        {profile.distanceKm != null && (
          <p className="text-xs opacity-80 mt-0.5">{formatDistance(profile.distanceKm)}</p>
        )}
        {profile.bio && <p className="text-sm mt-1.5 opacity-90 line-clamp-3">{profile.bio}</p>}
      </div>

      {isTop && (
        <>
          <div
            className="absolute top-10 left-6 border-4 border-[var(--success)] text-[var(--success)] rounded-lg px-3 py-1 rotate-[-12deg] font-extrabold text-2xl tracking-widest"
            style={{ opacity: likeOpacity }}
          >
            LIKE
          </div>
          <div
            className="absolute top-10 right-6 border-4 border-[var(--error)] text-[var(--error)] rounded-lg px-3 py-1 rotate-[12deg] font-extrabold text-2xl tracking-widest"
            style={{ opacity: nopeOpacity }}
          >
            NOPE
          </div>
        </>
      )}
    </div>
  )
}

function ActionButton({
  onClick,
  children,
  variant,
}: {
  onClick: () => void
  children: React.ReactNode
  variant: 'yes' | 'nope'
}) {
  const color = variant === 'yes' ? 'text-[var(--accent)]' : 'text-[var(--ink)]'
  return (
    <button
      onClick={onClick}
      className={`w-16 h-16 rounded-full bg-white shadow-lg flex items-center justify-center text-3xl active:scale-90 transition ${color}`}
    >
      {children}
    </button>
  )
}

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
      {children}
    </div>
  )
}

function MatchOverlay({ me, other, onClose }: { me: Profile; other: Candidate; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-[var(--accent)]/95 text-white flex flex-col items-center justify-center px-6 text-center">
      <h2 className="display-font text-5xl mb-2">It&rsquo;s a match!</h2>
      <p className="mb-10 opacity-90">You and {other.displayName} liked each other.</p>
      <div className="flex gap-6 mb-12">
        <Avatar src={me.photos[0]} />
        <Avatar src={other.photos[0]} />
      </div>
      <button
        onClick={onClose}
        className="rounded-full bg-white text-[var(--accent)] font-semibold px-8 py-3"
      >
        Keep swiping
      </button>
    </div>
  )
}

function Avatar({ src }: { src: string | undefined }) {
  return (
    <div className="w-28 h-28 rounded-full overflow-hidden border-4 border-white bg-white/20">
      {src && <img src={src} alt="" className="w-full h-full object-cover" />}
    </div>
  )
}
