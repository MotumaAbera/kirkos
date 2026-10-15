'use server'

import { revalidatePath } from 'next/cache'
import type { ActionState } from '@/app/admin/actions'
import { logAudit } from '@/lib/activity'
import { deny, requireStaff } from '@/lib/auth'
import { query, queryOne } from '@/lib/db'
import { isEmail, sendEmail } from '@/lib/mailer'

const text = (fd: FormData, key: string, max = 300) => String(fd.get(key) ?? '').trim().slice(0, max)

export async function savePublicSite(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const staff = await requireStaff()
  const denied = deny(staff, 'settings.manage')
  if (denied) return denied
  const values = { public_phone: text(fd, 'public_phone', 40), public_email: text(fd, 'public_email', 120).toLowerCase(), public_address: text(fd, 'public_address', 200), office_hours: text(fd, 'office_hours', 120) }
  if (!values.public_phone || !values.public_address || !values.office_hours) return { error: 'Phone, address and office hours are required.' }
  if (!isEmail(values.public_email)) return { error: 'Enter a valid public email address.' }
  for (const [key, value] of Object.entries(values))
    await query('insert into settings (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value', [key, JSON.stringify(value)])
  await logAudit(staff.id, 'Changed public website contact details', 'Public website', `${values.public_phone} · ${values.public_email}`)
  revalidatePath('/', 'layout')
  return { ok: true, message: 'Public website details saved.' }
}

export async function setDocumentPublished(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const staff = await requireStaff()
  const denied = deny(staff, 'settings.manage')
  if (denied) return denied
  const mode = text(fd, 'mode')
  const id = Number(fd.get('id'))
  if (mode === 'delete') {
    // The file stays on disk so earlier downloads remain verifiable; only the listing is removed.
    const row = await queryOne<{ title: string }>('delete from public_documents where id = $1 returning title', [id])
    if (row) await logAudit(staff.id, `Removed document "${row.title}"`, 'Public website')
  } else {
    const row = await queryOne<{ title: string }>('update public_documents set published = $2 where id = $1 returning title', [id, mode === 'publish'])
    if (row) await logAudit(staff.id, `${mode === 'publish' ? 'Published' : 'Unpublished'} document "${row.title}"`, 'Public website')
  }
  revalidatePath('/services')
  revalidatePath('/admin/settings')
  return { ok: true }
}

/** Reply to a citizen who submitted a service request or contact message from the public site. */
export async function emailRequester(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const staff = await requireStaff()
  const denied = deny(staff, 'email.send') ?? deny(staff, 'services.edit')
  if (denied) return denied
  const r = await queryOne<{ id: number; ref: string; requester_email: string | null; requester_name: string | null }>('select id, ref, requester_email, requester_name from service_requests where id = $1', [Number(fd.get('id'))])
  if (!r?.requester_email) return { error: 'This request has no email address.' }
  const message = text(fd, 'message', 5000)
  if (message.length < 5) return { error: 'Write a message.' }
  const subject = text(fd, 'subject', 150) || `Your request ${r.ref}`
  const result = await sendEmail({ to: [r.requester_email], subject, text: message, kind: 'Requester reply', staffId: staff.id })
  if (result.status !== 'Sent') return { error: `Email failed: ${result.error}` }
  await query(`update service_requests set notes = trim(notes || E'\\n\\n' || $2), updated_at = now() where id = $1`, [r.id, `[${new Date().toISOString().slice(0, 10)}] ${staff.name} emailed the requester: "${subject}"\n${message}`])
  await logAudit(staff.id, `Emailed requester of ${r.ref}`, 'Email', subject)
  revalidatePath(`/admin/services/${r.id}`)
  return { ok: true, message: `Email sent to ${r.requester_email}.` }
}
