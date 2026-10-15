'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, FileUp, Upload } from 'lucide-react'
import { inputClass } from '@/components/admin/ui'

/** Uploads evidence to /api/evidence. Photos keep their own GPS; otherwise the device location is attached when available. */
export function EvidenceUploader({ incidentId, legalCaseId, source = 'Staff upload', camera }: { incidentId?: number; legalCaseId?: number; source?: 'Staff upload' | 'Field app'; camera?: boolean }) {
  const router = useRouter()
  const files = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok?: string; error?: string } | null>(null)

  async function deviceLocation(): Promise<GeolocationPosition | null> {
    if (!navigator.geolocation) return null
    return new Promise((resolve) => navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }))
  }

  async function upload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const fd = new FormData(form)
    if (!fd.getAll('files').some((f) => f instanceof File && f.size > 0)) return setResult({ error: 'Choose at least one file.' })
    setBusy(true)
    setResult(null)
    const pos = await deviceLocation()
    if (pos) { fd.set('lat', String(pos.coords.latitude)); fd.set('lng', String(pos.coords.longitude)) }
    if (incidentId) fd.set('incident_id', String(incidentId))
    if (legalCaseId) fd.set('legal_case_id', String(legalCaseId))
    fd.set('source', source)
    try {
      const res = await fetch('/api/evidence', { method: 'POST', body: fd })
      const body = (await res.json()) as { saved?: string[]; rejected?: string[]; error?: string }
      if (body.error) setResult({ error: body.error })
      else setResult({ ok: body.saved?.length ? `Saved ${body.saved.length} file(s).` : undefined, error: body.rejected?.length ? body.rejected.join(' ') : undefined })
      if (body.saved?.length) { form.reset(); router.refresh() }
    } catch {
      setResult({ error: 'Upload failed. Check your connection and try again.' })
    } finally {
      setBusy(false)
    }
  }

  return <form onSubmit={upload} className="flex flex-col gap-3">
    <label className="flex cursor-pointer flex-col gap-2 rounded-xl border border-dashed border-[#cbd8e7] p-4 text-sm hover:border-[#1d5fa7]">
      <span className="flex items-center gap-2 font-semibold">{camera ? <Camera className="size-4 text-[#a87916]" /> : <FileUp className="size-4 text-[#a87916]" />}{camera ? 'Take or choose photos' : 'Add photos, video or documents'}</span>
      <input ref={files} type="file" name="files" multiple accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx" capture={camera ? 'environment' : undefined} className="text-xs" />
      <span className="text-[11px] text-[#8996a8]">Up to 10 files, 50 MB each. Each file is fingerprinted (SHA-256) and time-stamped.</span>
    </label>
    <input name="description" maxLength={500} placeholder="What does this show? (optional)" className={inputClass} />
    <button type="submit" disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#082957] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"><Upload className="size-4" />{busy ? 'Uploading…' : 'Upload evidence'}</button>
    {result?.ok && <p role="status" className="rounded-lg bg-[#eaf8f0] px-3 py-2 text-xs font-semibold text-[#267448]">{result.ok}</p>}
    {result?.error && <p role="alert" className="rounded-lg bg-[#fff0f1] px-3 py-2 text-xs font-semibold text-[#b32d3d]">{result.error}</p>}
  </form>
}
