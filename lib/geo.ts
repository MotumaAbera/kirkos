/** Approximate centre of each sub-city, used when a report has no exact coordinates. */
export const SUB_CITY_CENTRES: Record<string, [number, number]> = {
  Bole: [8.995, 38.79], Kirkos: [9.005, 38.76], Yeka: [9.04, 38.81], Lideta: [9.01, 38.735], Arada: [9.035, 38.752],
  'Akaki Kality': [8.89, 38.78], 'Nefas Silk Lafto': [8.96, 38.735], 'Kolfe Keranio': [9.02, 38.695], Gullele: [9.06, 38.735],
  'Addis Ketema': [9.03, 38.725], 'Lemi Kura': [9.02, 38.87],
}
export const ADDIS_CENTRE: [number, number] = [9.012, 38.761]

/** Rough bounding box of Addis Ababa, used to reject obviously wrong coordinates. */
export const inAddis = (lat: number, lng: number) => lat > 8.75 && lat < 9.2 && lng > 38.6 && lng < 39.0

export function distanceKm(a: [number, number], b: [number, number]) {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b[0] - a[0])
  const dLng = toRad(b[1] - a[1])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.asin(Math.sqrt(h))
}

/** Drive-time estimate: straight-line distance × 1.4 road factor at an average 22 km/h city speed. */
export const etaMinutes = (km: number) => Math.max(3, Math.round(((km * 1.4) / 22) * 60))

export const directionsUrl = (to: [number, number], from?: [number, number]) =>
  `https://www.google.com/maps/dir/?api=1${from ? `&origin=${from[0]},${from[1]}` : ''}&destination=${to[0]},${to[1]}&travelmode=driving`

