import { revalidatePath } from 'next/cache'
import { logAudit } from '@/lib/activity'
import { can, getSession } from '@/lib/auth'
import { query } from '@/lib/db'
import { PUBLIC_DOCS_DIR, storeEvidence } from '@/lib/storage'

/** Upload a guide or regulation for the public Services page (PDF, Word, or Excel only). */
export async function POST(request: Request) {
  const staff = await getSession()
  if (!staff) return Response.json({ error: 'Please sign in again.' }, { status: 401 })
  if (!can(staff, 'settings.manage')) return Response.json({ error: 'Your role cannot publish documents.' }, { status: 403 })
  const fd = await request.formData()
  const title = String(fd.get('title') ?? '').trim().slice(0, 150)
  const description = String(fd.get('description') ?? '').trim().slice(0, 300)
  const file = fd.get('file')
  if (!title) return Response.json({ error: 'Give the document a title.' }, { status: 400 })
  if (!(file instanceof File) || file.size === 0) return Response.json({ error: 'Choose a file.' }, { status: 400 })
  try {
    const f = await storeEvidence(file, 20 * 1024 * 1024, PUBLIC_DOCS_DIR, (k) => k.label === 'Document')
    await query('insert into public_documents (title, description, original_name, stored_name, mime, size_bytes, sha256, uploaded_by) values ($1,$2,$3,$4,$5,$6,$7,$8)',
      [title, description, f.originalName, f.storedName, f.mime, f.size, f.sha256, staff.id])
    await logAudit(staff.id, `Published document "${title}"`, 'Public website', f.originalName)
    revalidatePath('/services')
    revalidatePath('/admin/settings')
    return Response.json({ saved: [f.originalName] })
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'Upload failed.' }, { status: 400 })
  }
}
