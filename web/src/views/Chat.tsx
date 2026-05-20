import { useEffect, useRef, useState } from 'react'
import type { Message, Profile, View } from '../types'
import { loadMessages, sendMessage } from '../lib/db'
import { app } from '../lib/app'
import type { Room, RoomMessage } from '@proappstore/sdk'
import SafetyMenu from './SafetyMenu'

interface Props {
  me: Profile
  aId: string
  bId: string
  otherName: string
  onNavigate: (v: View) => void
}

export default function Chat({ me, aId, bId, otherName, onNavigate }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const msgs = await loadMessages(aId, bId)
        if (!cancelled) setMessages(msgs)
      } catch (e) {
        if (!cancelled) setError((e as Error).message)
      }
    })()
    return () => { cancelled = true }
  }, [aId, bId])

  const roomRef = useRef<Room | null>(null)
  useEffect(() => {
    const roomId = `match-${aId}-${bId}`
    const room: Room = app.rooms.join(roomId)
    roomRef.current = room
    const off = room.onMessage<Message>((msg: RoomMessage<Message>) => {
      if (msg.from.uid === me.userId) return
      setMessages((prev) => (prev.some((m) => m.id === msg.data.id) ? prev : [...prev, msg.data]))
    })
    return () => {
      off()
      room.close()
      roomRef.current = null
    }
  }, [aId, bId, me.userId])

  const didInitialScroll = useRef(false)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    // First time we have any messages on this chat, jump instantly so the
    // user lands at the bottom instead of watching the view scroll from
    // top to bottom. Every subsequent message animates.
    const behavior: ScrollBehavior = didInitialScroll.current ? 'smooth' : 'auto'
    el.scrollTo({ top: el.scrollHeight, behavior })
    if (messages.length > 0) didInitialScroll.current = true
  }, [messages])

  async function handleSend() {
    const body = text.trim()
    if (!body || sending) return
    setSending(true)
    setError(null)
    setText('')
    try {
      const msg = await sendMessage(aId, bId, me.userId, body)
      setMessages((prev) => [...prev, msg])
      roomRef.current?.send(msg)
    } catch (e) {
      setError((e as Error).message)
      setText((current) => current || body)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex flex-col h-dvh">
      <header className="flex items-center gap-3 px-4 py-3 border-b border-[var(--line)] bg-[var(--paper)]">
        <button
          onClick={() => onNavigate({ name: 'matches' })}
          className="text-2xl text-[var(--muted)] active:opacity-50"
          aria-label="Back"
        >
          &larr;
        </button>
        <h1 className="font-semibold flex-1 truncate">{otherName}</h1>
        <button
          onClick={() => setMenuOpen(true)}
          className="text-2xl text-[var(--muted)] active:opacity-50 px-2"
          aria-label="More options"
        >
          &#8942;
        </button>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
        {messages.length === 0 && (
          <p className="text-center text-[var(--muted)] text-sm py-12">
            You matched with {otherName}. Say something nice.
          </p>
        )}
        {messages.map((m) => {
          const mine = m.senderId === me.userId
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[75%] px-4 py-2 rounded-2xl break-words ${
                  mine
                    ? 'bg-[var(--accent)] text-white rounded-br-md'
                    : 'bg-[var(--accent-soft)] text-[var(--ink)] rounded-bl-md'
                }`}
              >
                {m.body}
              </div>
            </div>
          )
        })}
      </div>

      {error && <p className="px-4 text-[var(--error)] text-sm">{error}</p>}

      <form
        onSubmit={(e) => { e.preventDefault(); handleSend() }}
        className="flex gap-2 p-3 border-t border-[var(--line)] bg-[var(--paper)]"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Message…"
          maxLength={1000}
          className="flex-1 rounded-full bg-[var(--accent-soft)] px-4 py-2.5 text-base outline-none"
        />
        <button
          type="submit"
          disabled={!text.trim() || sending}
          className="rounded-full bg-[var(--accent)] text-white font-semibold px-5 disabled:opacity-40"
        >
          Send
        </button>
      </form>

      {menuOpen && (
        <SafetyMenu
          meId={me.userId}
          otherId={me.userId === aId ? bId : aId}
          aId={aId}
          bId={bId}
          otherName={otherName}
          onClose={() => setMenuOpen(false)}
          onDone={() => { setMenuOpen(false); onNavigate({ name: 'matches' }) }}
        />
      )}
    </div>
  )
}
