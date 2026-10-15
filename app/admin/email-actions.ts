'use server'

import { revalidatePath } from 'next/cache'
import type { ActionState } from '@/app/admin/actions'
import { logAudit } from '@/lib/activity'
import { can, deny, requireStaff } from '@/lib/auth'
import { query, queryOne } from '@/lib/db'
import { EXPORTS, buildExport, isExportKind } from '@/lib/exports'
import { parseAddresses, sendEmail, type Attachment } from '@/lib/mailer'

const text = (fd: FormData, key: string) => String(fd.get(key) ?? '').trim()
const MAX_RECIPIENTS = 200
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
const BLOCKED_EXTENSIONS = /\.(exe|bat|cmd|com|msi|scr|js|vbs|ps1|jar|sh)$/i

type Recipient = { email: string; name: string | null }

/** Resolves staff picked in the form (by audience) plus any extra typed addresses into a de-duplicated list. */
async function resolveRecipients(fd: FormData): Promise<{ recipients: Recipient[]; invalid: string[] }> {
  const audience = text(fd, 'audience') || 'people'
  let staff: Recipient[] = []
  if (audience === 'all') staff = await query<Recipient>(`select email, name from staff where status = 'Active'`)
  else if (audience === 'roles') staff = await query<Recipient>(`select email, name from staff where status = 'Active' and role = any($1::text[])`, [fd.getAll('roles').map(String)])
  else if (audience === 'districts') staff = await query<Recipient>(`select email, name from staff where status = 'Active' and district = any($1::text[])`, [fd.getAll('districts').map(String)])
  else staff = await query<Recipient>(`select email, name from staff where id = any($1::int[])`, [fd.getAll('people').map(Number).filter(Boolean)])
  const { valid, invalid } = parseAddresses(text(fd, 'extra'))
  const map = new Map<string, Recipient>()
  for (const r of staff) map.set(r.email.toLowerCase(), r)
  for (const email of valid) if (!map.has(email)) map.set(email, { email, name: null })
  return { recipients: [...map.values()], invalid }
}

const greet = (body: string, name: string | null) => body.replaceAll('{name}', name ? name.split(' ')[0] : 'there')

export async function sendBroadcast(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const staff = await requireStaff()
  const denied = deny(staff, 'email.broadcast')
  if (denied) return denied
  const subject = text(fd, 'subject')
  const message = text(fd, 'message')
  if (!subject || message.length < 5) return { error: 'Write a subject and a message.' }
  const { recipients, invalid } = await resolveRecipients(fd)
  if (invalid.length) return { error: `These addresses look invalid: ${invalid.join(', ')}` }
  if (!recipients.length) return { error: 'No recipients match this audience.' }
  if (recipients.length > MAX_RECIPIENTS) return { error: `Broadcasts are limited to ${MAX_RECIPIENTS} recipients.` }
  const names = new Map(recipients.map((r) => [r.email, r.name]))
  const result = await sendEmail({
    to: recipients.map((r) => r.email), subject, text: message, individually: true, kind: 'Broadcast', staffId: staff.id,
    personalize: (to) => greet(message, names.get(to) ?? null),
  })
  await logAudit(staff.id, `Sent broadcast "${subject}"`, 'Email', `${result.sent}/${recipients.length} delivered`)
  revalidatePath('/admin/email')
  if (result.status === 'Failed') return { error: `Broadcast failed: ${result.error}` }
  return { ok: true, message: result.failed.length ? `Sent to ${result.sent} of ${recipients.length}. Failed: ${result.failed.join(', ')}` : `Broadcast sent to ${result.sent} recipient(s).` }
}

export async function sendReportEmail(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const staff = await requireStaff()
  const denied = deny(staff, 'email.send')
  if (denied) return denied
  const attachments: Attachment[] = []

  const kind = text(fd, 'report')
  if (kind) {
    if (!isExportKind(kind)) return { error: 'Choose a valid report.' }
    if (!can(staff, 'reports.export') || !can(staff, EXPORTS[kind].permission)) return { error: `Your role cannot export the ${EXPORTS[kind].label.toLowerCase()}.` }
    const file = await buildExport(kind, { days: text(fd, 'days'), status: text(fd, 'status'), from: text(fd, 'from'), to: text(fd, 'to') })
    attachments.push({ filename: file.filename, content: file.csv, contentType: 'text/csv; charset=utf-8' })
  }

  const files = fd.getAll('files').filter((f): f is File => f instanceof File && f.size > 0)
  if (files.length > 5) return { error: 'Attach up to 5 files.' }
  const total = files.reduce((sum, f) => sum + f.size, 0)
  if (total > MAX_ATTACHMENT_BYTES) return { error: 'Attachments must be 10 MB or less in total.' }
  for (const f of files) {
    if (BLOCKED_EXTENSIONS.test(f.name)) return { error: `${f.name}: this file type cannot be emailed.` }
    attachments.push({ filename: f.name.slice(0, 120), content: Buffer.from(await f.arrayBuffer()), contentType: f.type || undefined })
  }
  if (!attachments.length) return { error: 'Choose a report or attach at least one file.' }

  const { recipients, invalid } = await resolveRecipients(fd)
  if (invalid.length) return { error: `These addresses look invalid: ${invalid.join(', ')}` }
  if (!recipients.length) return { error: 'Add at least one recipient.' }
  if (recipients.length > 50) return { error: 'Send reports to 50 recipients or fewer at a time.' }

  const subject = text(fd, 'subject') || (kind && isExportKind(kind) ? `${EXPORTS[kind].label} – ${new Date().toLocaleDateString('en-GB')}` : 'Files from AACEA')
  const message = text(fd, 'message') || 'Hello {name},\n\nPlease find the attached file(s).'
  const names = new Map(recipients.map((r) => [r.email, r.name]))
  const result = await sendEmail({
    to: recipients.map((r) => r.email), subject, text: message, attachments, individually: true, kind: kind ? 'Report' : 'File', staffId: staff.id,
    personalize: (to) => greet(message, names.get(to) ?? null),
  })
  await logAudit(staff.id, `Emailed ${attachments.map((a) => a.filename).join(', ')}`, 'Email', `${result.sent}/${recipients.length} delivered · ${recipients.map((r) => r.email).join(', ')}`)
  revalidatePath('/admin/email')
  if (result.status === 'Failed') return { error: `Email failed: ${result.error}` }
  return { ok: true, message: result.failed.length ? `Sent to ${result.sent} of ${recipients.length}. Failed: ${result.failed.join(', ')}` : `Sent ${attachments.length} attachment(s) to ${result.sent} recipient(s).` }
}

export async function emailReporter(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const staff = await requireStaff()
  const denied = deny(staff, 'email.send') ?? deny(staff, 'incidents.edit')
  if (denied) return denied
  const incident = await queryOne<{ id: number; ref: string; reporter_email: string | null; reporter_name: string | null; anonymous: boolean }>(
    'select id, ref, reporter_email, reporter_name, anonymous from incidents where id = $1', [Number(fd.get('id'))])
  if (!incident?.reporter_email || incident.anonymous) return { error: 'This case has no reporter email address.' }
  const subject = text(fd, 'subject') || `Update on your report ${incident.ref}`
  const message = text(fd, 'message')
  if (message.length < 5) return { error: 'Write a message to the reporter.' }
  const result = await sendEmail({ to: [incident.reporter_email], subject, text: message, kind: 'Reporter update', staffId: staff.id })
  if (result.status !== 'Sent') return { error: `Email failed: ${result.error}` }
  await query('insert into incident_notes (incident_id, staff_id, body) values ($1, $2, $3)', [incident.id, staff.id, `Emailed reporter: "${subject}"\n${message}`])
  await logAudit(staff.id, `Emailed reporter of ${incident.ref}`, 'Email', subject)
  revalidatePath(`/admin/incidents/${incident.id}`)
  return { ok: true, message: `Email sent to ${incident.reporter_email}.` }
}

export async function sendTestEmail(): Promise<ActionState> {
  const staff = await requireStaff()
  const denied = deny(staff, 'email.send')
  if (denied) return denied
  const result = await sendEmail({
    to: [staff.email], subject: 'Test email from the staff workspace', kind: 'Test', staffId: staff.id,
    text: `Hello ${staff.name.split(' ')[0]},\n\nThis is a test message. If you can read it, email delivery from the workspace is working.`,
  })
  revalidatePath('/admin/email')
  return result.status === 'Sent' ? { ok: true, message: `Test email sent to ${staff.email}.` } : { error: `Test failed: ${result.error}` }
}
