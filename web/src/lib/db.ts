import { app } from './app'
import type { Candidate, Profile, Gender, LookingFor, Match, Message, SwipeDirection } from '../types'
import { kmBetween } from './geo'
import { ageFromDob } from './photos'
import type { Preferences } from './prefs'

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
  {
    name: '0002_safety',
    sql: `
      CREATE TABLE IF NOT EXISTS blocks (
        blocker_id TEXT NOT NULL,
        blocked_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (blocker_id, blocked_id)
      );
      CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON blocks(blocked_id);

      CREATE TABLE IF NOT EXISTS reports (
        id          TEXT PRIMARY KEY,
        reporter_id TEXT NOT NULL,
        reported_id TEXT NOT NULL,
        reason      TEXT NOT NULL,
        note        TEXT NOT NULL DEFAULT '',
        created_at  INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_reports_reported ON reports(reported_id, created_at DESC);
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
 * Candidates I haven't swiped on yet, filtered by orientation, age, and max-distance.
 * Pulls a wide pool, then computes haversine distance + age in JS so we can rank
 * by distance and drop anyone outside the preferred radius/age band. D1 has no
 * trig functions, so the work has to happen client-side.
 */
export async function loadCandidates(
  me: Profile,
  prefs: Preferences,
  limit = 25,
): Promise<Candidate[]> {
  await ensureMigrated()
  const wants = wantsGenderSql(me.lookingFor)
  const wantsMe = `(p.looking_for = 'everyone' OR p.looking_for = ?)`
  const myGenderTarget = me.gender === 'woman' ? 'women' : me.gender === 'man' ? 'men' : 'everyone'
  const pool = Math.max(limit * 4, 100)
  const { rows } = await app.db.query<ProfileRow>(
    `SELECT p.* FROM profiles p
     WHERE p.user_id != ?
       AND ${wants}
       AND ${wantsMe}
       AND NOT EXISTS (SELECT 1 FROM swipes s WHERE s.swiper_id = ? AND s.target_id = p.user_id)
       AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = ? AND b.blocked_id = p.user_id) OR (b.blocker_id = p.user_id AND b.blocked_id = ?))
     ORDER BY p.updated_at DESC
     LIMIT ?`,
    [me.userId, myGenderTarget, me.userId, me.userId, me.userId, pool],
  )

  const out: Candidate[] = []
  for (const r of rows) {
    const p = rowToProfile(r)
    const age = ageFromDob(p.dob)
    if (age == null || age < prefs.minAge || age > prefs.maxAge) continue
    let distanceKm: number | null = null
    if (me.lat != null && me.lng != null && p.lat != null && p.lng != null) {
      distanceKm = kmBetween(me.lat, me.lng, p.lat, p.lng)
      if (distanceKm > prefs.maxDistanceKm) continue
    }
    out.push({ ...p, distanceKm })
  }

  out.sort((a, b) => {
    if (a.distanceKm == null && b.distanceKm == null) return b.updatedAt - a.updatedAt
    if (a.distanceKm == null) return 1
    if (b.distanceKm == null) return -1
    return a.distanceKm - b.distanceKm
  })

  return out.slice(0, limit)
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

/**
 * Count incoming right-swipes I haven't reciprocated yet (and that aren't from
 * users I've blocked or who have blocked me). Each one is a guaranteed match
 * waiting on my swipe.
 */
export async function countAdmirers(userId: string): Promise<number> {
  await ensureMigrated()
  const { rows } = await app.db.query<{ n: number }>(
    `SELECT COUNT(*) AS n FROM swipes s
     WHERE s.target_id = ? AND s.direction = 'right'
       AND NOT EXISTS (SELECT 1 FROM swipes me WHERE me.swiper_id = ? AND me.target_id = s.swiper_id)
       AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = ? AND b.blocked_id = s.swiper_id) OR (b.blocker_id = s.swiper_id AND b.blocked_id = ?))`,
    [userId, userId, userId, userId],
  )
  return rows[0]?.n ?? 0
}

/**
 * Profiles that have right-swiped me, ordered most recent first. Used to
 * populate the "X likes you" preview list — these are guaranteed matches the
 * moment the user swipes right.
 */
export async function loadAdmirers(userId: string, limit = 50): Promise<Profile[]> {
  await ensureMigrated()
  const { rows } = await app.db.query<ProfileRow>(
    `SELECT p.* FROM swipes s
       JOIN profiles p ON p.user_id = s.swiper_id
     WHERE s.target_id = ? AND s.direction = 'right'
       AND NOT EXISTS (SELECT 1 FROM swipes me WHERE me.swiper_id = ? AND me.target_id = s.swiper_id)
       AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = ? AND b.blocked_id = s.swiper_id) OR (b.blocker_id = s.swiper_id AND b.blocked_id = ?))
     ORDER BY s.created_at DESC
     LIMIT ?`,
    [userId, userId, userId, userId, limit],
  )
  return rows.map(rowToProfile)
}

export async function unmatch(aId: string, bId: string): Promise<void> {
  await ensureMigrated()
  await app.db.batch([
    { sql: `DELETE FROM messages WHERE match_a = ? AND match_b = ?`, params: [aId, bId] },
    { sql: `DELETE FROM matches WHERE a_id = ? AND b_id = ?`, params: [aId, bId] },
  ])
}

/**
 * Block another user. Removes any existing match + messages, records a swipe-left
 * to keep them out of discovery, and inserts a blocks row so the block is symmetric:
 * the candidate query excludes pairs where either side has blocked the other.
 */
export async function blockUser(blockerId: string, blockedId: string): Promise<void> {
  await ensureMigrated()
  const [aId, bId] = orderedPair(blockerId, blockedId)
  const now = Date.now()
  await app.db.batch([
    { sql: `INSERT OR IGNORE INTO blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)`, params: [blockerId, blockedId, now] },
    { sql: `INSERT OR REPLACE INTO swipes (swiper_id, target_id, direction, created_at) VALUES (?, ?, 'left', ?)`, params: [blockerId, blockedId, now] },
    { sql: `DELETE FROM messages WHERE match_a = ? AND match_b = ?`, params: [aId, bId] },
    { sql: `DELETE FROM matches WHERE a_id = ? AND b_id = ?`, params: [aId, bId] },
  ])
}

export async function unblock(blockerId: string, blockedId: string): Promise<void> {
  await ensureMigrated()
  await app.db.execute(
    `DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?`,
    [blockerId, blockedId],
  )
}

export async function isBlocked(aId: string, bId: string): Promise<boolean> {
  await ensureMigrated()
  const { rows } = await app.db.query<{ n: number }>(
    `SELECT COUNT(*) AS n FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)`,
    [aId, bId, bId, aId],
  )
  return (rows[0]?.n ?? 0) > 0
}

export type ReportReason = 'inappropriate' | 'spam' | 'underage' | 'harassment' | 'fake' | 'other'

export async function reportUser(
  reporterId: string,
  reportedId: string,
  reason: ReportReason,
  note: string,
): Promise<void> {
  await ensureMigrated()
  await app.db.execute(
    `INSERT INTO reports (id, reporter_id, reported_id, reason, note, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [crypto.randomUUID(), reporterId, reportedId, reason, note, Date.now()],
  )
}
