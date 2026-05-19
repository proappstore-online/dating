import type { Profile } from '../types'
import { saveProfile } from './db'

interface Seed {
  name: string
  gender: Profile['gender']
  lookingFor: Profile['lookingFor']
  age: number
  bio: string
  /** Hue 0–360 for the placeholder swatch. */
  hue: number
}

const SEEDS: Seed[] = [
  { name: 'Alex',    gender: 'man',       lookingFor: 'everyone', age: 28, bio: 'Coffee snob. Will out-walk you.',                hue:  10 },
  { name: 'Sam',     gender: 'woman',     lookingFor: 'everyone', age: 31, bio: 'Books, ramen, occasional climbing.',              hue:  40 },
  { name: 'Jordan',  gender: 'nonbinary', lookingFor: 'everyone', age: 26, bio: 'Synths and houseplants.',                          hue:  70 },
  { name: 'Riley',   gender: 'woman',     lookingFor: 'men',      age: 29, bio: 'I&rsquo;ll bring the dog and the picnic.',          hue: 100 },
  { name: 'Casey',   gender: 'man',       lookingFor: 'women',    age: 33, bio: 'Trail runs, terrible at small talk.',              hue: 140 },
  { name: 'Morgan',  gender: 'woman',     lookingFor: 'women',    age: 27, bio: 'Pottery, pasta, polar plunges.',                   hue: 180 },
  { name: 'Taylor',  gender: 'man',       lookingFor: 'men',      age: 30, bio: 'Building a bookshop in my garage.',                hue: 200 },
  { name: 'Quinn',   gender: 'nonbinary', lookingFor: 'everyone', age: 24, bio: 'Climbing, comics, cold brew.',                     hue: 230 },
  { name: 'Robin',   gender: 'woman',     lookingFor: 'everyone', age: 35, bio: 'Marathoner. Will ruthlessly recommend novels.',    hue: 260 },
  { name: 'Avery',   gender: 'man',       lookingFor: 'women',    age: 32, bio: 'Three dogs, one violin.',                           hue: 290 },
  { name: 'Skylar',  gender: 'woman',     lookingFor: 'men',      age: 26, bio: 'Brunch and existentialism.',                       hue: 320 },
  { name: 'Drew',    gender: 'man',       lookingFor: 'everyone', age: 28, bio: 'Carpenter weekdays, drummer weekends.',            hue: 350 },
]

function dobForAge(age: number): string {
  const now = new Date()
  const d = new Date(now.getFullYear() - age, now.getMonth(), now.getDate())
  return d.toISOString().slice(0, 10)
}

function placeholderPhoto(hue: number, name: string): string {
  const initial = name[0]?.toUpperCase() ?? '?'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 800">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="hsl(${hue}, 70%, 65%)" />
        <stop offset="1" stop-color="hsl(${(hue + 40) % 360}, 60%, 45%)" />
      </linearGradient>
    </defs>
    <rect width="600" height="800" fill="url(#g)" />
    <text x="50%" y="55%" text-anchor="middle" font-family="Georgia,serif" font-size="280" fill="rgba(255,255,255,0.85)" font-weight="700">${initial}</text>
  </svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

/**
 * Build a candidate seed profile around an anchor lat/lng so distance ranking
 * has something to chew on. Offsets are roughly within a 25 km radius.
 */
function jitter(base: number | null, magnitude: number): number | null {
  if (base == null) return null
  return base + (Math.random() - 0.5) * magnitude
}

/**
 * Insert demo profiles around my location. Run via `?seed=1` query string or
 * the dev button on the Profile tab. Safe to call multiple times — uses
 * deterministic user_ids so it upserts rather than duplicating.
 */
export async function seedDemoProfiles(anchorLat: number | null, anchorLng: number | null): Promise<number> {
  const now = Date.now()
  let inserted = 0
  for (const s of SEEDS) {
    const userId = `demo-${s.name.toLowerCase()}`
    const profile: Profile = {
      userId,
      displayName: s.name,
      dob: dobForAge(s.age),
      bio: s.bio,
      gender: s.gender,
      lookingFor: s.lookingFor,
      photos: [placeholderPhoto(s.hue, s.name)],
      lat: jitter(anchorLat, 0.4),
      lng: jitter(anchorLng, 0.4),
      updatedAt: now,
    }
    await saveProfile(profile)
    inserted++
  }
  return inserted
}
