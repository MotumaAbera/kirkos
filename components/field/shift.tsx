'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { MapPin, Power, Radio } from 'lucide-react'
import { distanceKm } from '@/lib/geo'
import { cn } from '@/lib/utils'

const KEY = 'aacea-field-on-shift'
const MIN_INTERVAL_MS = 60_000
const MIN_MOVE_KM = 0.05

/**
 * Shift control: while on shift and this page is open, the phone's position is sent at most once a minute
 * (sooner if the inspector moves 50 m). Browsers stop sharing when the app is closed or the screen locks.
 */
export function ShiftControl({ initiallyOnDuty }: { initiallyOnDuty: boolean }) {
  const [onShift, setOnShift] = useState(false)
  const [status, setStatus] = useState<string>('')
  const [last, setLast] = useState<{ at: Date; acc: number } | null>(null)
  const watch = useRef<number | null>(null)
  const lastSent = useRef<{ t: number; p: [number, number] } | null>(null)

  const send = useCallback(async (pos: GeolocationPosition) => {
    const p: [number, number] = [pos.coords.latitude, pos.coords.longitude]
    const prev = lastSent.current
    if (prev && Date.now() - prev.t < MIN_INTERVAL_MS && distanceKm(prev.p, p) < MIN_MOVE_KM) return
    lastSent.current = { t: Date.now(), p }
    try {
      const res = await fetch('/api/field/location', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lat: p[0], lng: p[1], accuracy: pos.coords.accuracy }) })
      if (res.status === 401) { setStatus('Signed out – sign in again to keep sharing.'); return }
      setLast({ at: new Date(), acc: pos.coords.accuracy })
      setStatus('')
    } catch {
      setStatus('Offline – will retry on the next location update.')
      lastSent.current = null
    }
  }, [])

  const start = useCallback(() => {
    if (!navigator.geolocation) return setStatus('This phone cannot share its location.')
    setStatus('Waiting for GPS…')
    watch.current = navigator.geolocation.watchPosition(send, (err) => {
      setStatus(err.code === err.PERMISSION_DENIED ? 'Location permission is off. Enable it in your browser settings.' : 'Cannot get a GPS fix. Move outdoors and try again.')
    }, { enableHighAccuracy: true, maximumAge: 15_000, timeout: 30_000 })
    setOnShift(true)
    try { localStorage.setItem(KEY, '1') } catch {}
  }, [send])

  const stop = useCallback(async () => {
    if (watch.current !== null) navigator.geolocation.clearWatch(watch.current)
    watch.current = null
    setOnShift(false)
    setStatus('')
    try { localStorage.removeItem(KEY) } catch {}
    await fetch('/api/field/location', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ onDuty: false }) }).catch(() => {})
  }, [])

  // Resume sharing after a reload if the inspector was on shift.
  useEffect(() => {
    let resume = false
    try { resume = localStorage.getItem(KEY) === '1' } catch {}
    if (resume || initiallyOnDuty) start()
    return () => { if (watch.current !== null) navigator.geolocation.clearWatch(watch.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <section className={cn('rounded-2xl p-4 text-white shadow-sm', onShift ? 'bg-[#1f6b45]' : 'bg-[#082957]')}>
    <div className="flex items-center gap-3">
      <span className={cn('flex size-11 items-center justify-center rounded-full', onShift ? 'bg-white/15' : 'bg-white/10')}>{onShift ? <Radio className="size-5 animate-pulse" /> : <Power className="size-5" />}</span>
      <div className="min-w-0 flex-1">
        <p className="font-bold">{onShift ? 'On shift – sharing location' : 'Off shift'}</p>
        <p className="text-xs text-white/75">{onShift ? (last ? `Last sent ${last.at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} · ±${Math.round(last.acc)} m` : 'Getting your position…') : 'Supervisors can only see you while you are on shift.'}</p>
      </div>
      <button type="button" onClick={onShift ? stop : start} className={cn('rounded-xl px-4 py-2.5 text-sm font-bold', onShift ? 'bg-white text-[#1f6b45]' : 'bg-[#e9bb52] text-[#082957]')}>{onShift ? 'End shift' : 'Start shift'}</button>
    </div>
    {status && <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-black/20 px-3 py-2 text-xs"><MapPin className="size-3.5" />{status}</p>}
    {onShift && <p className="mt-2 text-[11px] text-white/70">Keep this app open while on duty. Only your latest position is stored.</p>}
  </section>
}
