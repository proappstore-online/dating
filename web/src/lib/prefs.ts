import { app } from './app'

export interface Preferences {
  maxDistanceKm: number
  minAge: number
  maxAge: number
}

export const DEFAULT_PREFS: Preferences = {
  maxDistanceKm: 50,
  minAge: 18,
  maxAge: 60,
}

const KEY = 'prefs.v1'

export async function loadPrefs(): Promise<Preferences> {
  try {
    const raw = await app.kv.get<Preferences>(KEY)
    if (!raw) return DEFAULT_PREFS
    return { ...DEFAULT_PREFS, ...raw }
  } catch {
    return DEFAULT_PREFS
  }
}

export async function savePrefs(p: Preferences): Promise<void> {
  await app.kv.set<Preferences>(KEY, p)
}
