import type { NextRequest } from 'next/server'
import { logAudit } from '@/lib/activity'
import { can, getSession } from '@/lib/auth'
import { queryOne } from '@/lib/db'
import { readEvidence } from '@/lib/storage'

const INLINE = /^(image\/(jpeg|png|gif|webp)|video\/(mp4|webm|quicktime)|audio\/(mpeg|mp4)|application\/pdf)$/

/** Serves an evidence file to authorised staff, re-verifying its SHA-256 and recording the access (chain of custody). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const staff = await getSession()
  if (!staff) return new Response('Unauthorized', { status: 401 })
  if (!can(staff, 'evidence.view')) return new Response('Forbidden', { status: 403 })
  const { id } = await params
  const e = await queryOne<{ id: number; stored_name: string; original_name: string; mime: string; sha256: string; incident_id: number | null; legal_case_id: number | null; ref: string | null }>(`
    select e.*, coalesce(i.ref, l.ref) as ref from evidence e left join incidents i on i.id = e.incident_id left join legal_cases l on l.id = e.legal_case_id where e.id = $1`, [Number(id)])
  if (!e) return new Response('Not found', { status: 404 })
  if (e.legal_case_id && !can(staff, 'legal.view')) return new Response('Forbidden', { status: 403 })

  let file
  try { file = await readEvidence(e.stored_name, e.sha256) } catch { return new Response('File missing from storage', { status: 410 }) }
  const download = request.nextUrl.searchParams.get('download') === '1'
  // Thumbnails load on every page view, so only full views and downloads are written to the audit log.
  if (request.nextUrl.searchParams.get('thumb') !== '1')
    await logAudit(staff.id, `${download ? 'Downloaded' : 'Viewed'} evidence #${e.id}`, 'Evidence', `${e.original_name} · ${e.ref ?? ''}${file.intact ? '' : ' · INTEGRITY CHECK FAILED'}`)

  const disposition = download || !INLINE.test(e.mime) ? 'attachment' : 'inline'
  return new Response(new Uint8Array(file.buf), {
    headers: {
      'Content-Type': e.mime === 'application/zip' ? 'application/octet-stream' : e.mime,
      'Content-Disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(e.original_name)}`,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox",
      'Cache-Control': 'private, no-store',
      'X-Evidence-SHA256': e.sha256,
      'X-Evidence-Integrity': file.intact ? 'verified' : 'FAILED',
    },
  })
}
