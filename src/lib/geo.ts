// Duuka — distance math, shared by the server (nearest-first ordering) and
// the client (distance chips on cards). Pure functions, no dependencies.

export interface LatLng {
  lat: number
  lng: number
}

const EARTH_RADIUS_M = 6_371_000

// Great-circle distance in metres. GPS accuracy inside a market is far worse
// than the error this introduces, so the simple haversine is honest here.
export function haversineMeters(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

// Coordinates are rounded to 3 decimals (~110 m) BEFORE anything is stored or
// sent back — a seller's exact spot (e.g. their home) never exists on the
// server, while "which shop is closer" still works.
export function roundCoord(value: number): number {
  return Math.round(value * 1000) / 1000
}

// Calm, spoken-language distance: "840 m", "2.3 km", "16 km".
export function formatDistance(meters: number): string {
  if (meters < 950) return `${Math.max(10, Math.round(meters / 10) * 10)} m`
  if (meters < 10_000) return `${(meters / 1000).toFixed(1)} km`
  return `${Math.round(meters / 1000)} km`
}
