import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadCandidates, recordSwipe } from './db'
import { q, x } from './actions'
import type { Profile } from '../types'

vi.mock('./app', () => ({ app: { db: { migrate: vi.fn().mockResolvedValue(undefined) } } }))
vi.mock('./actions', () => ({ q: vi.fn(), x: vi.fn() }))

beforeEach(() => {
  vi.mocked(q).mockReset()
  vi.mocked(x).mockReset().mockResolvedValue({ changes: 1 })
})

describe('mutual matching', () => {
  it('records a pass without creating a match', async () => {
    expect(await recordSwipe('alice', 'bob', 'left')).toBeNull()
    expect(x).toHaveBeenCalledExactlyOnceWith('record_swipe', { target_id: 'bob', direction: 'left' })
    expect(q).not.toHaveBeenCalled()
  })

  it('does not match a one-sided like', async () => {
    vi.mocked(q).mockResolvedValue([])
    expect(await recordSwipe('alice', 'bob', 'right')).toBeNull()
    expect(x).toHaveBeenCalledTimes(1)
  })

  it('creates a mutual match with canonical participant ordering', async () => {
    vi.mocked(q).mockResolvedValue([{ direction: 'right' }])
    const match = await recordSwipe('bob', 'alice', 'right')
    expect(match).toMatchObject({ aId: 'alice', bId: 'bob' })
    expect(x).toHaveBeenLastCalledWith('create_match', { a_id: 'alice', b_id: 'bob' })
  })

  it('does not announce an already-existing match again', async () => {
    vi.mocked(q).mockResolvedValue([{ direction: 'right' }])
    vi.mocked(x).mockResolvedValueOnce({ changes: 1 }).mockResolvedValueOnce({ changes: 0 })
    expect(await recordSwipe('alice', 'bob', 'right')).toBeNull()
  })
})

describe('discovery', () => {
  it('filters age and radius, ranks nearby profiles, and retains unknown locations last', async () => {
    const me: Profile = { userId: 'me', displayName: 'Me', dob: '1995-01-01', bio: '', gender: 'woman', lookingFor: 'men', photos: [], lat: 0, lng: 0, updatedAt: 0 }
    const candidate = (id: string, age: number, lat: number | null, updated = 0) => ({
      user_id: id, display_name: id, dob: `${new Date().getFullYear() - age}-01-01`, bio: '', gender: 'man', looking_for: 'women', photos_json: '[]', lat, lng: lat == null ? null : 0, updated_at: updated,
    })
    vi.mocked(q).mockResolvedValue([
      candidate('unknown', 25, null, 100), candidate('near', 25, 0.01),
      candidate('far', 25, 10), candidate('young', 17, 0),
      candidate('older', 70, 0), candidate('nearest', 25, 0),
    ])
    const results = await loadCandidates(me, { minAge: 18, maxAge: 40, maxDistanceKm: 20 }, 3)
    expect(results.map(p => p.userId)).toEqual(['nearest', 'near', 'unknown'])
    expect(results[0].distanceKm).toBe(0)
    expect(results[2].distanceKm).toBeNull()
  })
})
