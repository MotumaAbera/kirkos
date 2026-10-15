import { queryOne } from '@/lib/db'
import { PUBLIC_DOCS_DIR, readEvidence } from '@/lib/storage'

/** Public download of a published guide. Unpublished or tampered files are not served. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const d = await queryOne<{ stored_name: string; original_name: string; mime: string; sha256: string }>('select stored_name, original_name, mime, sha256 from public_documents where id = $1 and published', [Number(id) || 0])
  if (!d) return new Response('Not found', { status: 404 })
  let file
  try { file = await readEvidence(d.stored_name, d.sha256, PUBLIC_DOCS_DIR) } catch { return new Response('Not found', { status: 404 }) }
  if (!file.intact) return new Response('This document is temporarily unavailable.', { status: 503 })
  return new Response(new Uint8Array(file.buf), {
    headers: {
      'Content-Type': d.mime === 'application/zip' ? 'application/octet-stream' : d.mime,
      'Content-Disposition': `${d.mime === 'application/pdf' ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(d.original_name)}`,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
