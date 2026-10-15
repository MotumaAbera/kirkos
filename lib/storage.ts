import 'server-only'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

/** Evidence lives outside the web root; files are only served through the authenticated evidence route. */
/** Root for uploaded files. Set STORAGE_DIR in production to a persistent, backed-up location. */
const STORAGE_ROOT = process.env.STORAGE_DIR || path.join(/* turbopackIgnore: true */ process.cwd(), 'storage')
export const EVIDENCE_DIR = path.join(STORAGE_ROOT, 'evidence')
export const PUBLIC_DOCS_DIR = path.join(STORAGE_ROOT, 'public-docs')
export const MAX_EVIDENCE_BYTES = 50 * 1024 * 1024
export const MAX_PUBLIC_EVIDENCE_BYTES = 20 * 1024 * 1024

type Kind = { mime: string; ext: string; label: 'Photo' | 'Video' | 'Document' | 'Audio' }

/** Identify the file from its first bytes (never trust the browser's MIME type or the file name). */
export function sniff(buf: Buffer): Kind | null {
  const hex = buf.subarray(0, 16).toString('hex')
  const ascii = buf.subarray(0, 16).toString('latin1')
  if (hex.startsWith('ffd8ff')) return { mime: 'image/jpeg', ext: 'jpg', label: 'Photo' }
  if (hex.startsWith('89504e470d0a1a0a')) return { mime: 'image/png', ext: 'png', label: 'Photo' }
  if (ascii.startsWith('GIF8')) return { mime: 'image/gif', ext: 'gif', label: 'Photo' }
  if (ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP') return { mime: 'image/webp', ext: 'webp', label: 'Photo' }
  if (ascii.slice(4, 8) === 'ftyp') {
    const brand = ascii.slice(8, 12)
    if (/^(heic|heix|mif1|msf1)/.test(brand)) return { mime: 'image/heic', ext: 'heic', label: 'Photo' }
    if (brand.startsWith('qt')) return { mime: 'video/quicktime', ext: 'mov', label: 'Video' }
    if (brand.startsWith('M4A')) return { mime: 'audio/mp4', ext: 'm4a', label: 'Audio' }
    return { mime: 'video/mp4', ext: 'mp4', label: 'Video' }
  }
  if (hex.startsWith('1a45dfa3')) return { mime: 'video/webm', ext: 'webm', label: 'Video' }
  if (ascii.startsWith('%PDF-')) return { mime: 'application/pdf', ext: 'pdf', label: 'Document' }
  if (hex.startsWith('504b0304')) return { mime: 'application/zip', ext: 'docx', label: 'Document' } // Word/Excel (OOXML)
  if (ascii.startsWith('ID3') || hex.startsWith('fffb') || hex.startsWith('fff3')) return { mime: 'audio/mpeg', ext: 'mp3', label: 'Audio' }
  return null
}

export const kindOf = (mime: string) => (mime.startsWith('image/') ? 'Photo' : mime.startsWith('video/') ? 'Video' : mime.startsWith('audio/') ? 'Audio' : 'Document')

/** Reads GPS and original capture time from photo metadata, when present. */
async function photoMetadata(buf: Buffer, mime: string) {
  if (!mime.startsWith('image/')) return {}
  try {
    const exifr = (await import('exifr')).default
    const data = await exifr.parse(buf, { gps: true, pick: ['DateTimeOriginal', 'CreateDate', 'latitude', 'longitude'] })
    const lat = typeof data?.latitude === 'number' ? data.latitude : undefined
    const lng = typeof data?.longitude === 'number' ? data.longitude : undefined
    const taken = data?.DateTimeOriginal ?? data?.CreateDate
    return { lat, lng, capturedAt: taken instanceof Date && !Number.isNaN(taken.getTime()) ? taken : undefined }
  } catch {
    return {}
  }
}

export type StoredFile = { storedName: string; mime: string; size: number; sha256: string; lat?: number; lng?: number; capturedAt?: Date; originalName: string }

/** Validates and stores an uploaded file. Throws a user-readable Error for rejected files. */
export async function storeEvidence(file: File, maxBytes = MAX_EVIDENCE_BYTES, dir = EVIDENCE_DIR, allow?: (kind: Kind) => boolean): Promise<StoredFile> {
  if (file.size === 0) throw new Error(`${file.name} is empty.`)
  if (file.size > maxBytes) throw new Error(`${file.name} is larger than ${Math.round(maxBytes / 1024 / 1024)} MB.`)
  const buf = Buffer.from(await file.arrayBuffer())
  const kind = sniff(buf)
  if (!kind) throw new Error(`${file.name}: only photos, videos, audio, PDF and Word/Excel files are accepted.`)
  if (allow && !allow(kind)) throw new Error(`${file.name}: this file type is not accepted here.`)
  const storedName = `${randomUUID()}.${kind.ext}`
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(/* turbopackIgnore: true */ dir, storedName), buf, { flag: 'wx' })
  const meta = await photoMetadata(buf, kind.mime)
  return {
    storedName, mime: kind.mime, size: buf.length, sha256: createHash('sha256').update(buf).digest('hex'),
    originalName: file.name.replace(/[^\p{L}\p{N}._ -]/gu, '_').slice(0, 120) || `file.${kind.ext}`, ...meta,
  }
}

/** Reads a stored file and re-checks its SHA-256 so tampering on disk is detected. */
export async function readEvidence(storedName: string, expectedSha: string, dir = EVIDENCE_DIR) {
  if (!/^[0-9a-f-]{36}\.[a-z0-9]{2,5}$/.test(storedName)) throw new Error('Invalid file reference')
  const buf = await readFile(path.join(dir, storedName))
  const intact = createHash('sha256').update(buf).digest('hex') === expectedSha
  return { buf, intact }
}
