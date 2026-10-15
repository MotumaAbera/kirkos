import { can, getSession } from '@/lib/auth'
import { query } from '@/lib/db'
import { inAddis } from '@/lib/geo'

/**
 * Location ping from the field app while an inspector is on shift.
 * Only the latest position is stored (no movement history) – check-ins are the permanent record.
 */
export async function POST(request: Request) {
  const staff = await getSession()
  if (!staff) return Response.json({ error: 'Signed out' }, { status: 401 })
  if (!can(staff, 'field.use')) return Response.json({ error: 'Forbidden' }, { status: 403 })
  const body = (await request.json().catch(() => null)) as { lat?: number; lng?: number; accuracy?: number; onDuty?: boolean } | null
  if (body?.onDuty === false) {
    await query('update staff_locations set on_duty = false, updated_at = now() where staff_id = $1', [staff.id])
    return Response.json({ ok: true })
  }
  const lat = Number(body?.lat)
  const lng = Number(body?.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return Response.json({ error: 'Invalid location' }, { status: 400 })
  if (!inAddis(lat, lng)) return Response.json({ ok: true, ignored: 'outside Addis Ababa' })
  const accuracy = Number.isFinite(Number(body?.accuracy)) ? Number(body?.accuracy) : null
  await query(`insert into staff_locations (staff_id, lat, lng, accuracy, on_duty, updated_at) values ($1,$2,$3,$4,true,now())
    on conflict (staff_id) do update set lat = excluded.lat, lng = excluded.lng, accuracy = excluded.accuracy, on_duty = true, updated_at = now()`, [staff.id, lat, lng, accuracy])
  return Response.json({ ok: true })
}
