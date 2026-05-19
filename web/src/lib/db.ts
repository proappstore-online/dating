import { app } from './app'
import type { Profile, Gender, LookingFor, Match, Message, SwipeDirection } from '../types'

const MIGRATIONS = [
  {
    name: '0001_init',
    sql: `
      CREATE TABLE IF NOT EXISTS profiles (
        user_id      TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        dob          TEXT NOT NULL,
        bio          TEXT NOT NULL DEFAULT '',
        gender       TEXT NOT NULL,
        looking_for  TEXT NOT NULL,
        photos_json  TEXT NOT NULL DEFAULT '[]',
        lat          REAL,
        lng          REAL,
        updated_at   INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_profiles_updated ON profiles(updated_at DESC);

      CREATE TABLE IF NOT EXISTS swipes (
        swiper_id  TEXT NOT NULL,
        target_id  TEXT NOT NULL,
        direction  TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (swiper_id, target_id)
      );
      CREATE INDEX IF NOT EXISTS idx_swipes_target ON swipes(target_id, direction);

      CREATE TABLE IF NOT EXISTS matches (
        a_id       TEXT NOT NULL,
        b_id       TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (a_id, b_id)
      );
      CREATE INDEX IF NOT EXISTS idx_matches_a ON matches(a_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_matches_b ON matches(b_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS messages (
        id         TEXT PRIMARY KEY,
        match_a    TEXT NOT NULL,
        match_b    TEXT NOT NULL,
        sender_id  TEXT NOT NULL,
        body       TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_messages_match ON messages(match_a, match_b, created_at);
    `,
  },
]

let migrated = false
export async function ensureMigrated(): Promise<void> {
  if (migrated) return
  await app.db.migrate(MIGRATIONS)
  migrated = true
}

interface ProfileRow {
  user_id: string
  display_name: string
  dob: string
  bio: string
  gender: string
  looking_for: string
  photos_json: string
  lat: number | null
  lng: number | null
  updated_at: number
}

function rowToProfile(r: ProfileRow): Profile {
  return {
    userId: r.user_id,
    displayName: r.display_name,
    dob: r.dob,
    bio: r.bio,
    gender: r.gender as Gender,
    lookingFor: r.looking_for as LookingFor,
    photos: JSON.parse(r.photos_json) as string[],
    lat: r.lat,
    lng: r.lng,
    updatedAt: r.updated_at,
  }
}

export async function getMyProfile(userId: string): Promise<Profile | null> {
  await ensureMigrated()
  const { rows } = await app.db.query<ProfileRow>('SELECT * FROM profiles WHERE user_id = ?', [userId])
  return rows[0] ? rowToProfile(rows[0]) : null
}

export async function saveProfile(p: Profile): Promise<void> {
  await ensureMigrated()
  await app.db.execute(
    `INSERT INTO profiles (user_id, display_name, dob, bio, gender, looking_for, photos_json, lat, lng, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       display_name = excluded.display_name,
       dob          = excluded.dob,
       bio          = excluded.bio,
       gender       = excluded.gender,
       looking_for  = excluded.looking_for,
       photos_json  = excluded.photos_json,
       lat          = excluded.lat,
       lng          = excluded.lng,
       updated_at   = excluded.updated_at`,
    [p.userId, p.displayName, p.dob, p.bio, p.gender, p.lookingFor, JSON.stringify(p.photos), p.lat, p.lng, p.updatedAt],
  )
}

/**
 * Candidates I haven't swiped on yet, filtered by mutual orientation compatibility.
 * Returns at most `limit` rows ordered by most recently updated.
 */
export async function loadCandidates(me: Profile, limit = 25): Promise<Profile[]> {
  await ensureMigrated()
  const wants = wantsGenderSql(me.lookingFor)
  const wantsMe = `(p.looking_for = 'everyone' OR p.looking_for = ?)`
  const myGenderTarget = me.gender === 'woman' ? 'women' : me.gender === 'man' ? 'men' : 'everyone'
  const { rows } = await app.db.query<ProfileRow>(
    `SELECT p.* FROM profiles p
     WHERE p.user_id != ?
       AND ${wants}
       AND ${wantsMe}
       AND NOT EXISTS (SELECT 1 FROM swipes s WHERE s.swiper_id = ? AND s.target_id = p.user_id)
     ORDER BY p.updated_at DESC
     LIMIT ?`,
    [me.userId, myGenderTarget, me.userId, limit],
  )
  return rows.map(rowToProfile)
}

function wantsGenderSql(lookingFor: LookingFor): string {
  if (lookingFor === 'women') return `p.gender = 'woman'`
  if (lookingFor === 'men') return `p.gender = 'man'`
  return `1=1`
}

export function orderedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a]
}

/**
 * Record a swipe. If reciprocal right-swipe exists, create a match. Returns the new
 * match if one was just created, otherwise null.
 */
export async function recordSwipe(
  swiperId: string,
  targetId: string,
  direction: SwipeDirection,
): Promise<Match | null> {
  await ensureMigrated()
  const now = Date.now()
  await app.db.execute(
    `INSERT OR IGNORE INTO swipes (swiper_id, target_id, direction, created_at) VALUES (?, ?, ?, ?)`,
    [swiperId, targetId, direction, now],
  )
  if (direction !== 'right') return null

  const { rows } = await app.db.query<{ direction: string }>(
    `SELECT direction FROM swipes WHERE swiper_id = ? AND target_id = ?`,
    [targetId, swiperId],
  )
  if (!rows[0] || rows[0].direction !== 'right') return null

  const [aId, bId] = orderedPair(swiperId, targetId)
  await app.db.execute(
    `INSERT OR IGNORE INTO matches (a_id, b_id, created_at) VALUES (?, ?, ?)`,
    [aId, bId, now],
  )
  return { aId, bId, createdAt: now }
}

export interface MatchWithProfile {
  match: Match
  other: Profile
  lastMessage: Message | null
}

export async function loadMatches(userId: string): Promise<MatchWithProfile[]> {
  await ensureMigrated()
  const { rows } = await app.db.query<{
    a_id: string
    b_id: string
    created_at: number
  }>(
    `SELECT a_id, b_id, created_at FROM matches WHERE a_id = ? OR b_id = ? ORDER BY created_at DESC`,
    [userId, userId],
  )
  const result: MatchWithProfile[] = []
  for (const m of rows) {
    const otherId = m.a_id === userId ? m.b_id : m.a_id
    const other = await getMyProfile(otherId)
    if (!other) continue
    const lastMessage = await loadLastMessage(m.a_id, m.b_id)
    result.push({
      match: { aId: m.a_id, bId: m.b_id, createdAt: m.created_at },
      other,
      lastMessage,
    })
  }
  return result
}

interface MessageRow {
  id: string
  match_a: string
  match_b: string
  sender_id: string
  body: string
  created_at: number
}

function rowToMessage(r: MessageRow): Message {
  return {
    id: r.id,
    matchA: r.match_a,
    matchB: r.match_b,
    senderId: r.sender_id,
    body: r.body,
    createdAt: r.created_at,
  }
}

export async function loadMessages(aId: string, bId: string): Promise<Message[]> {
  await ensureMigrated()
  const { rows } = await app.db.query<MessageRow>(
    `SELECT * FROM messages WHERE match_a = ? AND match_b = ? ORDER BY created_at ASC LIMIT 500`,
    [aId, bId],
  )
  return rows.map(rowToMessage)
}

async function loadLastMessage(aId: string, bId: string): Promise<Message | null> {
  const { rows } = await app.db.query<MessageRow>(
    `SELECT * FROM messages WHERE match_a = ? AND match_b = ? ORDER BY created_at DESC LIMIT 1`,
    [aId, bId],
  )
  return rows[0] ? rowToMessage(rows[0]) : null
}

export async function sendMessage(
  aId: string,
  bId: string,
  senderId: string,
  body: string,
): Promise<Message> {
  await ensureMigrated()
  const msg: Message = {
    id: crypto.randomUUID(),
    matchA: aId,
    matchB: bId,
    senderId,
    body,
    createdAt: Date.now(),
  }
  await app.db.execute(
    `INSERT INTO messages (id, match_a, match_b, sender_id, body, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [msg.id, msg.matchA, msg.matchB, msg.senderId, msg.body, msg.createdAt],
  )
  return msg
}
