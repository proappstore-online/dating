import { app } from './app'
import type { Candidate, Profile, Gender, LookingFor, Match, Message, SwipeDirection } from '../types'
import { kmBetween } from './geo'
import { ageFromDob } from './photos'
import type { Preferences } from './prefs'
import { q, x } from './actions'

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
/**
 * Apply pending migrations. Raw `db.migrate` runs caller-supplied SQL, so the
 * data worker restricts it to the app's team since the cross-tenant lockdown —
 * a regular signed-in user gets a 403 here. That's fine: the schema is already
 * migrated (a team member's visit applies anything new), so swallow the 403 and
 * carry on. Every user-facing read/write goes through registered actions (see
 * lib/actions.ts + mcp.json), not raw SQL.
 */
export async function ensureMigrated(): Promise<void> {
  if (migrated) return
  try {
    await app.db.migrate(MIGRATIONS)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (!message.includes('403')) throw err
  }
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

/**
 * Fetch one profile's public card by id. Used both for the caller's own profile
 * and for the profiles of matches/admirers — profile cards are public data
 * within the app (the same fields shown on the swipe stack).
 */
export async function getMyProfile(userId: string): Promise<Profile | null> {
  await ensureMigrated()
  const rows = await q<ProfileRow>('get_profile', { user_id: userId })
  return rows[0] ? rowToProfile(rows[0]) : null
}

export async function saveProfile(p: Profile): Promise<void> {
  await ensureMigrated()
  await x('save_my_profile', {
    display_name: p.displayName,
    dob: p.dob,
    bio: p.bio,
    gender: p.gender,
    looking_for: p.lookingFor,
    photos_json: JSON.stringify(p.photos),
    lat: p.lat,
    lng: p.lng,
    updated_at: p.updatedAt,
  })
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
  const wantGender =
    me.lookingFor === 'women' ? 'woman' : me.lookingFor === 'men' ? 'man' : 'any'
  const myGenderTarget = me.gender === 'woman' ? 'women' : me.gender === 'man' ? 'men' : 'everyone'
  const pool = Math.max(limit * 4, 100)
  const rows = await q<ProfileRow>('load_candidates', {
    want_gender: wantGender,
    my_gender_target: myGenderTarget,
    pool,
  })

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

export function orderedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a]
}

/**
 * Record a swipe. If reciprocal right-swipe exists, create a match. Returns the new
 * match if one was just created, otherwise null. The swipe actor and match
 * membership are enforced server-side against the verified caller.
 */
export async function recordSwipe(
  swiperId: string,
  targetId: string,
  direction: SwipeDirection,
): Promise<Match | null> {
  await ensureMigrated()
  await x('record_swipe', { target_id: targetId, direction })
  if (direction !== 'right') return null

  const rows = await q<{ direction: string }>('get_reciprocal_swipe', { target_id: targetId })
  if (!rows[0] || rows[0].direction !== 'right') return null

  const [aId, bId] = orderedPair(swiperId, targetId)
  const meta = await x('create_match', { a_id: aId, b_id: bId })
  if (meta.changes < 1) return null
  return { aId, bId, createdAt: Date.now() }
}

export interface MatchWithProfile {
  match: Match
  other: Profile
  lastMessage: Message | null
}

export async function loadMatches(userId: string): Promise<MatchWithProfile[]> {
  await ensureMigrated()
  const rows = await q<{
    a_id: string
    b_id: string
    created_at: number
  }>('load_my_matches')
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
  const rows = await q<MessageRow>('load_messages', { a_id: aId, b_id: bId })
  return rows.map(rowToMessage)
}

async function loadLastMessage(aId: string, bId: string): Promise<Message | null> {
  const rows = await q<MessageRow>('load_last_message', { a_id: aId, b_id: bId })
  return rows[0] ? rowToMessage(rows[0]) : null
}

export async function sendMessage(
  aId: string,
  bId: string,
  senderId: string,
  body: string,
): Promise<Message> {
  await ensureMigrated()
  await x('send_message', { a_id: aId, b_id: bId, body })
  // The server assigns the row id + timestamp; mirror the sender's optimistic
  // copy locally so the UI and the realtime broadcast stay consistent.
  return {
    id: crypto.randomUUID(),
    matchA: aId,
    matchB: bId,
    senderId,
    body,
    createdAt: Date.now(),
  }
}

/**
 * Count incoming right-swipes I haven't reciprocated yet (and that aren't from
 * users I've blocked or who have blocked me). Each one is a guaranteed match
 * waiting on my swipe.
 */
export async function countAdmirers(_userId: string): Promise<number> {
  await ensureMigrated()
  const rows = await q<{ n: number }>('count_admirers')
  return rows[0]?.n ?? 0
}

/**
 * Profiles that have right-swiped me, ordered most recent first. Used to
 * populate the "X likes you" preview list — these are guaranteed matches the
 * moment the user swipes right.
 */
export async function loadAdmirers(_userId: string, limit = 50): Promise<Profile[]> {
  await ensureMigrated()
  const rows = await q<ProfileRow>('load_admirers', { limit })
  return rows.map(rowToProfile)
}

export async function unmatch(aId: string, bId: string): Promise<void> {
  await ensureMigrated()
  await x('unmatch', { a_id: aId, b_id: bId })
}

/**
 * Block another user. Removes any existing match + messages, records a swipe-left
 * to keep them out of discovery, and inserts a blocks row so the block is symmetric:
 * the candidate query excludes pairs where either side has blocked the other.
 */
export async function blockUser(blockerId: string, blockedId: string): Promise<void> {
  await ensureMigrated()
  const [aId, bId] = orderedPair(blockerId, blockedId)
  await x('block_user', { blocked_id: blockedId, a_id: aId, b_id: bId })
}

export async function unblock(blockedId: string): Promise<void> {
  await ensureMigrated()
  await x('unblock_user', { blocked_id: blockedId })
}

/**
 * Whether the caller is blocked with `otherId` in either direction. The block
 * check is always relative to the verified caller — server-derived — so the
 * other party in the pair is the one argument that matters.
 */
export async function isBlocked(otherId: string): Promise<boolean> {
  await ensureMigrated()
  const rows = await q<{ n: number }>('is_blocked', { other_id: otherId })
  return (rows[0]?.n ?? 0) > 0
}

export type ReportReason = 'inappropriate' | 'spam' | 'underage' | 'harassment' | 'fake' | 'other'

export async function reportUser(
  _reporterId: string,
  reportedId: string,
  reason: ReportReason,
  note: string,
): Promise<void> {
  await ensureMigrated()
  await x('report_user', { reported_id: reportedId, reason, note })
}
