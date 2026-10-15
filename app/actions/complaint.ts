'use server'

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { logAudit, notify } from '@/lib/activity'
import { query, queryOne } from '@/lib/db'
import { INCIDENT_CATEGORIES, SUB_CITIES } from '@/lib/constants'
import { isEmail, sendEmail } from '@/lib/mailer'
import { getSettings } from '@/lib/queries'
import { SUB_CITY_CENTRES, inAddis } from '@/lib/geo'
import { MAX_PUBLIC_EVIDENCE_BYTES, storeEvidence, type StoredFile } from '@/lib/storage'

export type ComplaintState = { ref?: string; error?: string } | null

const text = (fd: FormData, key: string) => String(fd.get(key) ?? '').trim().slice(0, 2000)

export async function submitComplaint(_prev: ComplaintState, fd: FormData): Promise<ComplaintState> {
  const category = text(fd, 'category')
  const subCity = text(fd, 'sub_city')
  const woreda = text(fd, 'woreda')
  const landmark = text(fd, 'landmark')
  const description = text(fd, 'description')
  if (!(INCIDENT_CATEGORIES as readonly string[]).includes(category) || !(SUB_CITIES as readonly string[]).includes(subCity))
    return { error: 'Please choose a category and sub-city.' }
  if (!woreda || !landmark || description.length < 10) return { error: 'Please complete the location and give a short description (at least 10 characters).' }

  const lat = Number(fd.get('lat'))
  const lng = Number(fd.get('lng'))
  const hasPoint = fd.get('lat') !== '' && Number.isFinite(lat) && Number.isFinite(lng) && inAddis(lat, lng)
  if (fd.get('lat') && !hasPoint) return { error: 'The pinned location is outside Addis Ababa. Move the pin or clear it.' }

  // Validate evidence before creating the case so a bad file doesn't leave a half-submitted report.
  const files = fd.getAll('evidence').filter((f): f is File => f instanceof File && f.size > 0)
  if (files.length > 3) return { error: 'Attach up to 3 files.' }
  if (files.reduce((sum, f) => sum + f.size, 0) > 10 * 1024 * 1024) return { error: 'Attachments must be 10 MB or less in total.' }
  const stored: StoredFile[] = []
  for (const file of files) {
    try { stored.push(await storeEvidence(file, MAX_PUBLIC_EVIDENCE_BYTES)) } catch (e) { return { error: e instanceof Error ? e.message : 'A file could not be uploaded.' } }
  }

  const anonymous = fd.get('anonymous') === 'on'
  const reporterEmail = anonymous ? '' : text(fd, 'reporter_email').toLowerCase()
  if (reporterEmail && !isEmail(reporterEmail)) return { error: 'Please enter a valid email address, or leave it blank.' }
  const title = `${category.split(' / ')[0]} – ${landmark}`.slice(0, 120)
  const row = await queryOne<{ id: number; ref: string }>(
    `insert into incidents (title, category, sub_city, woreda, landmark, description, source, anonymous, reporter_name, reporter_phone, reporter_email, lat, lng, location_source)
     values ($1,$2,$3,$4,$5,$6,'Public portal',$7,$8,$9,$10,$11,$12,$13) returning id, ref`,
    [title, category, subCity, woreda, landmark, description, anonymous,
      anonymous ? null : text(fd, 'reporter_name') || null, anonymous ? null : text(fd, 'reporter_phone') || null, reporterEmail || null, hasPoint ? lat : null, hasPoint ? lng : null, hasPoint ? 'Pinned by reporter' : null],
  )
  for (const f of stored) {
    await query(`insert into evidence (incident_id, original_name, stored_name, mime, size_bytes, sha256, captured_at, lat, lng, source) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'Public portal')`,
      [row!.id, f.originalName, f.storedName, f.mime, f.size, f.sha256, f.capturedAt ?? null, f.lat ?? (hasPoint ? lat : null), f.lng ?? (hasPoint ? lng : null)])
  }
  if (!hasPoint) {
    // Fall back to the first photo's GPS, then to the sub-city centre (marked approximate).
    const gps = stored.find((f) => f.lat !== undefined && f.lng !== undefined && inAddis(f.lat, f.lng))
    const centre = SUB_CITY_CENTRES[subCity]
    if (gps) await query(`update incidents set lat = $2, lng = $3, location_source = 'Photo GPS' where id = $1`, [row!.id, gps.lat, gps.lng])
    else if (centre) await query(`update incidents set lat = $2, lng = $3, location_source = 'Approximate (sub-city centre)' where id = $1`, [row!.id, centre[0], centre[1]])
  }
  await notify(`New public report ${row!.ref}`, `${category} in ${subCity}, ${woreda}.`, 'assignment', `/admin/incidents/${row!.id}`)
  await logAudit(null, `Public report ${row!.ref} received`, 'Incidents', `${category} · ${subCity}`)
  revalidatePath('/admin', 'layout')

  // Confirmation email goes out after the response so the citizen isn't kept waiting.
  if (reporterEmail) after(async () => {
    const settings = await getSettings()
    if (!settings.email_confirm_reporters) return
    const name = text(fd, 'reporter_name')
    await sendEmail({
      to: [reporterEmail], subject: `Report received: ${row!.ref}`, heading: 'We received your report', kind: 'Reporter confirmation', staffId: null,
      text: `Hello${name ? ` ${name}` : ''},

Thank you for reporting a ${category.toLowerCase()} issue in ${subCity}, ${woreda} (${landmark}).

Your reference number is ${row!.ref}. Please keep it to follow up with the authority.

Our team will review your report and may contact you if more information is needed.`,
    }).catch((e) => console.error('Reporter confirmation failed', e))
  })
  return { ref: row!.ref }
}
