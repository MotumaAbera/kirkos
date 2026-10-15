'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Upload } from 'lucide-react'
import { inputClass, labelClass } from '@/components/admin/ui'

/** Publishes a PDF / Word / Excel guide to the public Services page. */
export function DocumentUploader() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok?: string; error?: string } | null>(null)

  async function upload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    setBusy(true)
    setResult(null)
    try {
      const res = await fetch('/api/public-documents', { method: 'POST', body: new FormData(form) })
      const body = (await res.json()) as { saved?: string[]; error?: string }
      if (body.error) setResult({ error: body.error })
      else { setResult({ ok: 'Published to the Services page.' }); form.reset(); router.refresh() }
    } catch {
      setResult({ error: 'Upload failed. Try again.' })
    } finally {
      setBusy(false)
    }
  }

  return <form onSubmit={upload} className="flex flex-col gap-3 rounded-lg border border-dashed border-[#cbd8e7] p-4">
    <label className={labelClass}>Title<input name="title" required maxLength={150} placeholder="e.g. Building Code Directive (summary)" className={inputClass} /></label>
    <label className={labelClass}>Short description<input name="description" maxLength={300} className={inputClass} /></label>
    <label className={labelClass}>File (PDF, Word or Excel · max 20 MB)<input name="file" type="file" required accept=".pdf,.doc,.docx,.xls,.xlsx,application/pdf" className="mt-1.5 block text-xs" /></label>
    <button disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#082957] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"><Upload className="size-4" />{busy ? 'Uploading…' : 'Publish document'}</button>
    {result?.ok && <p role="status" className="rounded-lg bg-[#eaf8f0] px-3 py-2 text-xs font-semibold text-[#267448]">{result.ok}</p>}
    {result?.error && <p role="alert" className="rounded-lg bg-[#fff0f1] px-3 py-2 text-xs font-semibold text-[#b32d3d]">{result.error}</p>}
  </form>
}
