'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronRight, Navigation } from 'lucide-react'
import { directionsUrl, distanceKm, etaMinutes } from '@/lib/geo'
import { cn } from '@/lib/utils'

export type FieldCase = { id: number; ref: string; title: string; status: string; priority: string; sub_city: string; woreda: string | null; lat: number | null; lng: number | null; age: string }

/** Assigned cases, sorted nearest-first once the phone's position is known. */
export function FieldCaseList({ cases }: { cases: FieldCase[] }) {
  const [here, setHere] = useState<[number, number] | null>(null)
  useEffect(() => {
    navigator.geolocation?.getCurrentPosition((p) => setHere([p.coords.latitude, p.coords.longitude]), () => {}, { maximumAge: 120_000, timeout: 10_000 })
  }, [])
  const sorted = useMemo(() => {
    const withKm = cases.map((c) => ({ ...c, km: here && c.lat !== null && c.lng !== null ? distanceKm(here, [c.lat, c.lng]) : null }))
    return here ? withKm.sort((a, b) => (a.priority === 'High' ? -1 : 0) - (b.priority === 'High' ? -1 : 0) || (a.km ?? 1e9) - (b.km ?? 1e9)) : withKm
  }, [cases, here])

  if (!cases.length) return <p className="rounded-2xl bg-white p-6 text-center text-sm text-[#718096]">No open cases assigned to you.</p>
  return <ul className="flex flex-col gap-2">{sorted.map((c) => <li key={c.id} className="overflow-hidden rounded-2xl bg-white shadow-sm">
    <Link href={`/field/cases/${c.id}`} className="flex items-center gap-3 p-4">
      <span className={cn('h-10 w-1.5 shrink-0 rounded-full', c.priority === 'High' ? 'bg-[#b32d3d]' : c.priority === 'Medium' ? 'bg-[#e9bb52]' : 'bg-[#94a3b8]')} />
      <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{c.title}</span>
        <span className="block truncate text-xs text-[#718096]">{c.ref} · {c.sub_city}{c.woreda ? `, ${c.woreda}` : ''} · {c.status} · {c.age}</span>
        {c.km !== null && <span className="mt-0.5 block text-xs font-semibold text-[#082957]">{c.km.toFixed(1)} km · ~{etaMinutes(c.km)} min drive</span>}</span>
      <ChevronRight className="size-4 text-[#aab7c7]" />
    </Link>
    {c.lat !== null && c.lng !== null && <a href={directionsUrl([c.lat, c.lng], here ?? undefined)} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1.5 border-t border-[#edf1f5] py-2.5 text-xs font-bold text-[#1d5fa7]"><Navigation className="size-3.5" />Directions</a>}
  </li>)}</ul>
}
