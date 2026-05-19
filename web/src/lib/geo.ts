const EARTH_KM = 6371

/** Great-circle distance between two lat/lng pairs, in kilometres. */
export function kmBetween(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(bLat - aLat)
  const dLng = toRad(bLng - aLng)
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_KM * Math.asin(Math.sqrt(s))
}

/** Human-readable distance string, with the conventional dating-app rounding. */
export function formatDistance(km: number): string {
  if (km < 1) return 'less than 1 km away'
  if (km < 10) return `${Math.round(km)} km away`
  if (km < 100) return `${Math.round(km / 5) * 5} km away`
  return `${Math.round(km / 10) * 10} km away`
}
