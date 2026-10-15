'use client'

import 'leaflet/dist/leaflet.css'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Flame, MapPin, Navigation, RefreshCw, Send, UserRound, X } from 'lucide-react'
import type * as Leaflet from 'leaflet'
import { dispatchOfficer } from '@/app/admin/enforcement-actions'
import { ActionForm, SubmitButton } from '@/components/admin/forms'
import { ADDIS, OSM_ATTRIBUTION, OSM_TILES, STATUS_COLORS, loadLeaflet } from '@/components/map/leaflet'
import { directionsUrl, distanceKm, etaMinutes } from '@/lib/geo'
import { cn } from '@/lib/utils'

export type MapCase = { id: number; ref: string; title: string; category: string; status: string; priority: string; sub_city: string; lat: number; lng: number; approximate: boolean; assignee_name: string | null; overdue: boolean; age: string }
export type MapOfficer = { staff_id: number; name: string; role: string; district: string; lat: number; lng: number; accuracy: number | null; on_duty: boolean; minutes_ago: number; open_cases: number }

const STALE_MINUTES = 15

export function OperationsMap({ cases, officers, canDispatch }: { cases: MapCase[]; officers: MapOfficer[]; canDispatch: boolean }) {
  const router = useRouter()
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<Leaflet.Map | null>(null)
  const layers = useRef<{ cases?: Leaflet.LayerGroup; heat?: Leaflet.Layer; officers?: Leaflet.LayerGroup }>({})
  const [ready, setReady] = useState(false)
  const [show, setShow] = useState({ cases: true, heat: false, officers: true })
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const selected = cases.find((c) => c.id === selectedId) ?? null

  useEffect(() => {
    let cancelled = false
    loadLeaflet(true).then((L) => {
      if (cancelled || !box.current || map.current) return
      const m = L.map(box.current, { zoomControl: true }).setView(ADDIS, 12)
      L.tileLayer(OSM_TILES, { attribution: OSM_ATTRIBUTION, maxZoom: 19 }).addTo(m)
      map.current = m
      const pts = [...cases.map((c) => [c.lat, c.lng]), ...officers.map((o) => [o.lat, o.lng])] as [number, number][]
      if (pts.length > 1) m.fitBounds(L.latLngBounds(pts).pad(0.15), { maxZoom: 14 })
      setReady(true)
    })
    return () => { cancelled = true; map.current?.remove(); map.current = null; layers.current = {} }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Redraw layers whenever data or toggles change.
  useEffect(() => {
    if (!ready || !map.current) return
    loadLeaflet(true).then((L) => {
      const m = map.current!
      Object.values(layers.current).forEach((l) => l && m.removeLayer(l))
      layers.current = {}
      if (show.heat && cases.length) {
        const weight = (c: MapCase) => (c.status === 'Resolved' ? 0.3 : c.priority === 'High' ? 1 : 0.6)
        const heat = (L as unknown as { heatLayer: (p: [number, number, number][], o: object) => Leaflet.Layer }).heatLayer(cases.map((c) => [c.lat, c.lng, weight(c)]), { radius: 28, blur: 22, maxZoom: 15, minOpacity: 0.35 })
        heat.addTo(m)
        layers.current.heat = heat
      }
      if (show.cases) {
        const g = L.layerGroup()
        for (const c of cases) {
          L.circleMarker([c.lat, c.lng], {
            radius: c.priority === 'High' ? 9 : 7, color: c.overdue ? '#b32d3d' : '#ffffff', weight: c.overdue ? 3 : 2,
            fillColor: STATUS_COLORS[c.status] ?? '#607089', fillOpacity: c.status === 'Resolved' ? 0.55 : 0.95, dashArray: c.approximate ? '3 3' : undefined,
          }).bindTooltip(`${c.ref} · ${c.title}`, { direction: 'top' }).on('click', () => setSelectedId(c.id)).addTo(g)
        }
        g.addTo(m)
        layers.current.cases = g
      }
      if (show.officers) {
        const g = L.layerGroup()
        for (const o of officers) {
          const stale = !o.on_duty || o.minutes_ago > STALE_MINUTES
          const icon = L.divIcon({
            className: '',
            html: `<div style="width:30px;height:30px;border-radius:9999px;background:${stale ? '#94a3b8' : '#082957'};border:3px solid ${stale ? '#e2e8f0' : '#e9bb52'};color:white;font:700 11px system-ui;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.3)">${o.name.split(' ').map((n) => n[0]).slice(0, 2).join('')}</div>`,
            iconSize: [30, 30], iconAnchor: [15, 15],
          })
          L.marker([o.lat, o.lng], { icon }).bindTooltip(`${o.name} · ${stale ? `last seen ${o.minutes_ago} min ago` : 'on shift'}`, { direction: 'top' }).addTo(g)
          if (o.accuracy && !stale) L.circle([o.lat, o.lng], { radius: o.accuracy, color: '#082957', weight: 1, fillOpacity: 0.06 }).addTo(g)
        }
        g.addTo(m)
        layers.current.officers = g
      }
    })
  }, [ready, show, cases, officers])

  useEffect(() => {
    if (selected && map.current) map.current.panTo([selected.lat, selected.lng])
  }, [selected])

  // Refresh officer positions every 30 seconds.
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 30_000)
    return () => clearInterval(t)
  }, [router])

  const nearest = useMemo(() => {
    if (!selected) return []
    return officers
      .map((o) => ({ ...o, km: distanceKm([selected.lat, selected.lng], [o.lat, o.lng]), live: o.on_duty && o.minutes_ago <= STALE_MINUTES }))
      .sort((a, b) => Number(b.live) - Number(a.live) || a.km - b.km)
      .slice(0, 5)
  }, [selected, officers])

  const toggle = (key: keyof typeof show, label: string, Icon: typeof Flame) =>
    <button type="button" onClick={() => setShow((s) => ({ ...s, [key]: !s[key] }))} aria-pressed={show[key]} className={cn('inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold', show[key] ? 'border-[#082957] bg-[#082957] text-white' : 'border-[#d8e1ec] bg-white text-[#52637b]')}><Icon className="size-3.5" />{label}</button>

  return <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
    <div className="relative">
      <div className="absolute left-3 top-3 z-[500] flex flex-wrap gap-2">
        {toggle('cases', 'Cases', MapPin)}{toggle('heat', 'Heatmap', Flame)}{toggle('officers', 'Officers', UserRound)}
        <button type="button" onClick={() => router.refresh()} className="inline-flex items-center gap-1.5 rounded-lg border border-[#d8e1ec] bg-white px-3 py-1.5 text-xs font-semibold text-[#52637b]"><RefreshCw className="size-3.5" />Refresh</button>
      </div>
      <div ref={box} className="z-0 h-[620px] w-full overflow-hidden rounded-xl border border-[#dfe7f0] bg-[#eef2f6]" />
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[#52637b]">
        {Object.entries(STATUS_COLORS).map(([s, c]) => <span key={s} className="flex items-center gap-1.5"><i className="size-2.5 rounded-full" style={{ background: c }} />{s}</span>)}
        <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-full border-2 border-[#b32d3d]" />Overdue</span>
        <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-full border border-dashed border-[#52637b]" />Approximate location</span>
        <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-[#082957] ring-2 ring-[#e9bb52]" />Officer on shift</span>
        <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-[#94a3b8]" />Last seen &gt;{STALE_MINUTES} min ago</span>
      </div>
    </div>

    <aside className="flex flex-col gap-4">
      {!selected ? <div className="rounded-xl border border-dashed border-[#cbd8e7] bg-white p-5 text-sm text-[#718096]">Select a case on the map to see the nearest officers and dispatch one.
        <ul className="mt-4 flex max-h-[480px] flex-col gap-1 overflow-y-auto">{cases.filter((c) => c.status !== 'Resolved').slice(0, 40).map((c) => <li key={c.id}>
          <button type="button" onClick={() => setSelectedId(c.id)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-[#f4f7fb]">
            <i className="size-2.5 shrink-0 rounded-full" style={{ background: STATUS_COLORS[c.status] }} /><span className="flex-1 truncate font-semibold text-[#14233b]">{c.title}</span><span className="text-[#8996a8]">{c.sub_city}</span>
          </button></li>)}</ul>
      </div> : <div className="rounded-xl border border-[#dfe7f0] bg-white shadow-sm">
        <div className="flex items-start gap-2 border-b border-[#edf1f5] p-4">
          <div className="min-w-0 flex-1"><p className="text-[11px] font-semibold text-[#a87916]">{selected.ref} · {selected.category}</p><p className="mt-0.5 font-bold">{selected.title}</p>
            <p className="mt-1 text-xs text-[#718096]">{selected.status} · {selected.priority} priority · {selected.sub_city} · {selected.age}{selected.approximate && ' · approximate location'}</p>
            <p className="mt-1 text-xs text-[#52637b]">Assigned: <b>{selected.assignee_name ?? 'nobody'}</b></p></div>
          <button type="button" aria-label="Close" onClick={() => setSelectedId(null)} className="rounded-md p-1 text-[#8996a8] hover:bg-[#f4f7fb]"><X className="size-4" /></button>
        </div>
        <div className="flex gap-2 border-b border-[#edf1f5] p-3">
          <Link href={`/admin/incidents/${selected.id}`} className="flex-1 rounded-lg border border-[#d8e1ec] px-3 py-2 text-center text-xs font-semibold hover:bg-[#f4f7fb]">Open case</Link>
          <a href={directionsUrl([selected.lat, selected.lng])} target="_blank" rel="noreferrer" className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-[#d8e1ec] px-3 py-2 text-xs font-semibold hover:bg-[#f4f7fb]"><Navigation className="size-3.5" />Directions</a>
        </div>
        <div className="p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-[#718096]">Nearest officers</p>
          {nearest.length === 0 ? <p className="mt-2 text-sm text-[#718096]">No officers are sharing their location. Inspectors start a shift in the field app.</p> :
            <ul className="mt-2 flex flex-col gap-2">{nearest.map((o) => <li key={o.staff_id} className="rounded-lg border border-[#edf1f5] p-3">
              <div className="flex items-center gap-2"><span className={cn('size-2 rounded-full', o.live ? 'bg-[#267448]' : 'bg-[#94a3b8]')} />
                <span className="flex-1 truncate text-sm font-semibold">{o.name}</span><span className="text-xs font-bold text-[#082957]">~{etaMinutes(o.km)} min</span></div>
              <p className="mt-0.5 pl-4 text-[11px] text-[#718096]">{o.km.toFixed(1)} km away · {o.open_cases} open case(s) · {o.live ? 'on shift' : `seen ${o.minutes_ago} min ago`}</p>
              {canDispatch && <ActionForm action={dispatchOfficer} hideMessage className="mt-2 flex items-center gap-2 pl-4">
                <input type="hidden" name="incident_id" value={selected.id} /><input type="hidden" name="staff_id" value={o.staff_id} /><input type="hidden" name="eta" value={`~${etaMinutes(o.km)} min`} />
                <label className="flex items-center gap-1 text-[11px] text-[#52637b]"><input type="checkbox" name="urgent" className="accent-[#b32d3d]" />Urgent</label>
                <SubmitButton pendingText="Dispatching…" className="ml-auto inline-flex items-center gap-1 rounded-md bg-[#082957] px-2.5 py-1.5 text-[11px] font-semibold text-white disabled:opacity-60"><Send className="size-3" />Dispatch</SubmitButton>
              </ActionForm>}
            </li>)}</ul>}
          <p className="mt-3 text-[11px] leading-4 text-[#8996a8]">Drive times are estimates from straight-line distance. Use Directions for the live route.</p>
        </div>
      </div>}
    </aside>
  </div>
}
