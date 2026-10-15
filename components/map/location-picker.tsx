'use client'

import 'leaflet/dist/leaflet.css'
import { useEffect, useRef, useState } from 'react'
import { Crosshair, MapPin } from 'lucide-react'
import type * as Leaflet from 'leaflet'
import { ADDIS, OSM_ATTRIBUTION, OSM_TILES, loadLeaflet } from '@/components/map/leaflet'

type Props = {
  /** Initial point, if known. */
  value?: [number, number] | null
  /** Hidden input names that receive the chosen coordinates. */
  latName?: string
  lngName?: string
  /** Associates the hidden inputs with a form elsewhere on the page. */
  form?: string
  readOnly?: boolean
  height?: number
  /** Fallback centre when no point is set (e.g. the sub-city centre). */
  centre?: [number, number]
  note?: string
}

/** Small map where users tap (or use their GPS) to mark a location; writes lat/lng into hidden inputs. */
export function LocationPicker({ value, latName = 'lat', lngName = 'lng', form, readOnly, height = 260, centre, note }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<Leaflet.Map | null>(null)
  const marker = useRef<Leaflet.CircleMarker | null>(null)
  const [point, setPoint] = useState<[number, number] | null>(value ?? null)
  const [locating, setLocating] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    loadLeaflet().then((L) => {
      if (cancelled || !box.current || map.current) return
      const m = L.map(box.current, { scrollWheelZoom: false }).setView(value ?? centre ?? ADDIS, value ? 16 : centre ? 14 : 12)
      L.tileLayer(OSM_TILES, { attribution: OSM_ATTRIBUTION, maxZoom: 19 }).addTo(m)
      map.current = m
      if (value) marker.current = L.circleMarker(value, { radius: 9, color: '#fff', weight: 3, fillColor: '#b32d3d', fillOpacity: 1 }).addTo(m)
      if (!readOnly) m.on('click', (e: Leaflet.LeafletMouseEvent) => place(L, [e.latlng.lat, e.latlng.lng]))
    })
    return () => { cancelled = true; map.current?.remove(); map.current = null; marker.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function place(L: typeof Leaflet, p: [number, number], zoom?: number) {
    setPoint(p)
    setError('')
    if (marker.current) marker.current.setLatLng(p)
    else if (map.current) marker.current = L.circleMarker(p, { radius: 9, color: '#fff', weight: 3, fillColor: '#b32d3d', fillOpacity: 1 }).addTo(map.current)
    if (zoom) map.current?.setView(p, zoom)
  }

  function useMyLocation() {
    if (!navigator.geolocation) return setError('This device cannot share its location.')
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => { setLocating(false); place(await loadLeaflet(), [pos.coords.latitude, pos.coords.longitude], 17) },
      (err) => { setLocating(false); setError(err.code === err.PERMISSION_DENIED ? 'Location permission was denied. Tap the map instead.' : 'Could not get your location. Tap the map instead.') },
      { enableHighAccuracy: true, timeout: 15000 },
    )
  }

  return <div>
    <div ref={box} style={{ height }} className="z-0 w-full overflow-hidden rounded-xl border border-[#d8e1ec] bg-[#eef2f6]" />
    {!readOnly && <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
      <button type="button" onClick={useMyLocation} disabled={locating} className="inline-flex items-center gap-1.5 rounded-lg border border-[#d8e1ec] bg-white px-3 py-2 font-semibold text-[#082957] hover:bg-[#f4f7fb] disabled:opacity-60"><Crosshair className="size-3.5" />{locating ? 'Locating…' : 'Use my current location'}</button>
      <span className="flex items-center gap-1 text-[#718096]"><MapPin className="size-3.5" />{point ? `${point[0].toFixed(5)}, ${point[1].toFixed(5)}` : note ?? 'or tap the map to mark the spot'}</span>
      {error && <span className="w-full text-[#b32d3d]">{error}</span>}
    </div>}
    <input type="hidden" name={latName} value={point?.[0] ?? ''} form={form} readOnly />
    <input type="hidden" name={lngName} value={point?.[1] ?? ''} form={form} readOnly />
  </div>
}
