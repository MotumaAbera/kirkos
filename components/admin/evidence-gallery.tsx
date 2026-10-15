import { Download, FileText, MapPin, Music, ShieldCheck, Video } from 'lucide-react'
import { formatDate } from '@/components/admin/ui'
import type { Evidence } from '@/lib/enforcement'

const size = (bytes: number) => (bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`)

/** Evidence list with thumbnails and chain-of-custody details. Opening a file is recorded in the audit log. */
export function EvidenceGallery({ items }: { items: Evidence[] }) {
  if (!items.length) return <p className="text-sm text-[#718096]">No evidence yet.</p>
  return <ul className="grid gap-3 sm:grid-cols-2">{items.map((e) => {
    const isImage = /^image\/(jpeg|png|gif|webp)$/.test(e.mime)
    const Icon = e.mime.startsWith('video/') ? Video : e.mime.startsWith('audio/') ? Music : FileText
    return <li key={e.id} className="overflow-hidden rounded-xl border border-[#edf1f5]">
      <a href={`/admin/evidence/${e.id}`} target="_blank" rel="noreferrer" className="block bg-[#f4f7fb]">
        {isImage
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={`/admin/evidence/${e.id}?thumb=1`} alt={e.description || e.original_name} loading="lazy" className="h-36 w-full object-cover" />
          : <span className="flex h-36 items-center justify-center text-[#8996a8]"><Icon className="size-10" /></span>}
      </a>
      <div className="p-3 text-xs">
        <p className="truncate font-semibold text-[#14233b]" title={e.original_name}>{e.original_name}</p>
        {e.description && <p className="mt-0.5 text-[#52637b]">{e.description}</p>}
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11px] text-[#718096]">
          <dt>Captured</dt><dd className="text-[#33445c]">{e.captured_at ? formatDate(e.captured_at) : 'not in file'}</dd>
          <dt>Uploaded</dt><dd className="text-[#33445c]">{formatDate(e.created_at)} · {e.uploaded_by_name ?? e.source}</dd>
          <dt>Location</dt><dd className="text-[#33445c]">{e.lat !== null && e.lng !== null ? <a className="inline-flex items-center gap-0.5 text-[#1d5fa7] hover:underline" target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/?mlat=${e.lat}&mlon=${e.lng}#map=18/${e.lat}/${e.lng}`}><MapPin className="size-3" />{e.lat.toFixed(5)}, {e.lng.toFixed(5)}</a> : 'none'}</dd>
          <dt>SHA-256</dt><dd className="truncate font-mono text-[10px] text-[#33445c]" title={e.sha256}>{e.sha256.slice(0, 16)}…</dd>
        </dl>
        <div className="mt-2 flex items-center justify-between">
          <span className="inline-flex items-center gap-1 text-[10px] text-[#267448]"><ShieldCheck className="size-3" />{size(Number(e.size_bytes))} · verified on open</span>
          <a href={`/admin/evidence/${e.id}?download=1`} className="inline-flex items-center gap-1 font-semibold text-[#1d5fa7] hover:underline"><Download className="size-3" />Download</a>
        </div>
      </div>
    </li>
  })}</ul>
}
