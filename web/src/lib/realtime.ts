import { useEffect, useRef, useState } from 'react'
import type { Room, RoomMessage } from '@proappstore/sdk'
import { app } from './app'
import type { Message } from '../types'
import type { MatchWithProfile } from './db'

export interface ActiveChat {
  aId: string
  bId: string
}

/**
 * Holds a long-lived WebSocket connection to every match-room the user
 * participates in. When a peer sends a message we either (a) suppress it
 * because the user is currently viewing that chat, in which case the local
 * Chat component handles it, or (b) bump the unread count and fire a
 * browser Notification.
 *
 * Match rooms have a 32-peer cap upstream — fine because each match has
 * exactly 2 participants. The 64-active-rooms-per-app cap means users with
 * more than 64 matches will silently miss notifications for the oldest ones,
 * which is acceptable for v1.
 */
export function useRealtime(matches: MatchWithProfile[], active: ActiveChat | null) {
  const [unread, setUnread] = useState<Record<string, number>>({})
  const roomsRef = useRef<Map<string, Room>>(new Map())
  const activeRef = useRef<ActiveChat | null>(active)
  const matchesRef = useRef<MatchWithProfile[]>(matches)

  useEffect(() => { activeRef.current = active }, [active])
  useEffect(() => { matchesRef.current = matches }, [matches])

  useEffect(() => {
    const wantKeys = new Set(matches.map((m) => keyOf(m.match.aId, m.match.bId)))
    const haveKeys = new Set(roomsRef.current.keys())

    for (const k of haveKeys) {
      if (!wantKeys.has(k)) {
        roomsRef.current.get(k)?.close()
        roomsRef.current.delete(k)
      }
    }

    for (const m of matches) {
      const key = keyOf(m.match.aId, m.match.bId)
      if (roomsRef.current.has(key)) continue
      const room = app.rooms.join(`match-${m.match.aId}-${m.match.bId}`)
      room.onMessage<Message>((msg: RoomMessage<Message>) => {
        const me = app.auth.user?.id
        if (!me || msg.from.uid === me) return
        const a = activeRef.current
        if (a && keyOf(a.aId, a.bId) === key) return
        setUnread((u) => ({ ...u, [key]: (u[key] ?? 0) + 1 }))
        notify(m.other.displayName, msg.data.body, `/`)
      })
      roomsRef.current.set(key, room)
    }
  }, [matches])

  useEffect(() => {
    return () => {
      for (const room of roomsRef.current.values()) room.close()
      roomsRef.current.clear()
    }
  }, [])

  function clearUnread(aId: string, bId: string) {
    const key = keyOf(aId, bId)
    setUnread((u) => {
      if (!u[key]) return u
      const next = { ...u }
      delete next[key]
      return next
    })
  }

  return { unread, clearUnread }
}

export function keyOf(aId: string, bId: string): string {
  return `${aId}:${bId}`
}

function notify(title: string, body: string, url: string) {
  if (typeof Notification === 'undefined') return
  if (Notification.permission !== 'granted') return
  if (typeof document !== 'undefined' && !document.hidden) return
  try {
    const n = new Notification(title, { body, tag: title })
    n.onclick = () => {
      window.focus()
      if (url && url !== '/') window.location.href = url
      n.close()
    }
  } catch { /* some browsers throw if constructor used in non-secure context */ }
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof Notification === 'undefined') return 'denied'
  if (Notification.permission === 'granted' || Notification.permission === 'denied') {
    return Notification.permission
  }
  return await Notification.requestPermission()
}

export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.permission
}
