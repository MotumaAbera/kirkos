import { revalidatePath } from 'next/cache'
import { logAudit } from '@/lib/activity'
import { can, getSession } from '@/lib/auth'
import { query, queryOne } from '@/lib/db'
import { inAddis } from '@/lib/geo'
import { storeEvidence } from '@/lib/storage'

/** Staff evidence upload (multipart). Uses a route handler so files up to 50 MB aren't limited by the server-action body size. */
export async function POST(request: Request) {
  const staff = await getSession()
  if (!staff) return Response.json({ error: 'Please sign in again.' }, { status: 401 })
  if (!can(staff, 'evidence.upload')) return Response.json({ error: 'Your role cannot upload evidence.' }, { status: 403 })

  const fd = await request.formData()
  const incidentId = Number(fd.get('incident_id')) || null
  const legalCaseId = Number(fd.get('legal_case_id')) || null
  if (!incidentId === !legalCaseId) return Response.json({ error: 'Attach evidence to one case.' }, { status: 400 })
  if (legalCaseId && !can(staff, 'legal.view')) return Response.json({ error: 'Your role cannot access legal cases.' }, { status: 403 })
  const target = incidentId
    ? await queryOne<{ ref: string }>('select ref from incidents where id = $1', [incidentId])
    : await queryOne<{ ref: string }>('select ref from legal_cases where id = $1', [legalCaseId])
  if (!target) return Response.json({ error: 'Case not found.' }, { status: 404 })

  const files = fd.getAll('files').filter((f): f is File => f instanceof File && f.size > 0)
  if (!files.length) return Response.json({ error: 'Choose at least one file.' }, { status: 400 })
  if (files.length > 10) return Response.json({ error: 'Upload up to 10 files at a time.' }, { status: 400 })

  // Device location (from the browser) is only used when the photo itself carries no GPS.
  const deviceLat = Number(fd.get('lat'))
  const deviceLng = Number(fd.get('lng'))
  const hasDevice = Number.isFinite(deviceLat) && Number.isFinite(deviceLng) && inAddis(deviceLat, deviceLng)
  const source = String(fd.get('source') ?? '') === 'Field app' ? 'Field app' : 'Staff upload'
  const description = String(fd.get('description') ?? '').trim().slice(0, 500)

  const saved: string[] = []
  const rejected: string[] = []
  for (const file of files) {
    try {
      const f = await storeEvidence(file)
      const lat = f.lat ?? (hasDevice ? deviceLat : null)
      const lng = f.lng ?? (hasDevice ? deviceLng : null)
      await query(`insert into evidence (incident_id, legal_case_id, original_name, stored_name, mime, size_bytes, sha256, captured_at, lat, lng, source, description, uploaded_by)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [incidentId, legalCaseId, f.originalName, f.storedName, f.mime, f.size, f.sha256, f.capturedAt ?? null, lat, lng, source, description, staff.id])
      saved.push(f.originalName)
    } catch (e) {
      rejected.push(e instanceof Error ? e.message : `${file.name}: upload failed`)
    }
  }
  if (saved.length) {
    await logAudit(staff.id, `Added ${saved.length} evidence file(s) to ${target.ref}`, 'Evidence', saved.join(', '))
    if (incidentId) await query('insert into incident_notes (incident_id, staff_id, body) values ($1, $2, $3)', [incidentId, staff.id, `Added evidence: ${saved.join(', ')}`])
    revalidatePath(incidentId ? `/admin/incidents/${incidentId}` : `/admin/legal/${legalCaseId}`)
  }
  return Response.json({ saved, rejected }, { status: saved.length ? 200 : 400 })
}
