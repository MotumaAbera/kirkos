'use client'

import { startTransition, useActionState, useState } from 'react'
import { MapPinCheck } from 'lucide-react'
import { checkIn } from '@/app/admin/enforcement-actions'

/** Gets a fresh GPS fix, then records a site check-in for the case. */
export function CheckInButton({ incidentId }: { incidentId: number }) {
  const [state, action, pending] = useActionState(checkIn, null)
  const [locating, setLocating] = useState(false)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  function go() {
    if (!navigator.geolocation) return setError('This phone cannot share its location.')
    setLocating(true)
    setError('')
    navigator.geolocation.getCurrentPosition((pos) => {
      setLocating(false)
      const fd = new FormData()
      fd.set('incident_id', String(incidentId))
      fd.set('lat', String(pos.coords.latitude))
      fd.set('lng', String(pos.coords.longitude))
      fd.set('accuracy', String(pos.coords.accuracy))
      fd.set('note', note)
      startTransition(() => action(fd))
      setNote('')
    }, (err) => {
      setLocating(false)
      setError(err.code === err.PERMISSION_DENIED ? 'Location permission is off.' : 'No GPS fix yet. Try again outdoors.')
    }, { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 })
  }

  return <div className="flex flex-col gap-2">
    <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional), e.g. owner not present" className="h-11 rounded-xl border border-[#d8e1ec] bg-white px-3 text-sm" />
    <button type="button" onClick={go} disabled={locating || pending} className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[#1f6b45] text-sm font-bold text-white disabled:opacity-60"><MapPinCheck className="size-5" />{locating ? 'Getting GPS fix…' : pending ? 'Saving…' : "I'm on site – check in"}</button>
    {(error || state?.error) && <p role="alert" className="rounded-lg bg-[#fff0f1] px-3 py-2 text-xs font-semibold text-[#b32d3d]">{error || state?.error}</p>}
    {state?.ok && <p role="status" className="rounded-lg bg-[#eaf8f0] px-3 py-2 text-xs font-semibold text-[#267448]">{state.message}</p>}
  </div>
}
