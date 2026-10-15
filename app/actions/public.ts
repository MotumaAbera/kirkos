'use server'

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { logAudit, notify } from '@/lib/activity'
import { SERVICE_CATEGORIES, SUB_CITIES } from '@/lib/constants'
import { queryOne } from '@/lib/db'
import { isEmail, sendEmail } from '@/lib/mailer'
import { rateLimit } from '@/lib/public-access'

export type PublicRequestState = { error?: string; ref?: string } | null

const text = (fd: FormData, key: string, max = 2000) => String(fd.get(key) ?? '').trim().slice(0, max)

/**
 * Citizen service requests and contact-form messages. Both land in Admin → Service requests
 * (contact messages use the "General inquiry" category) and can be followed on the Track page.
 */
export async function submitPublicRequest(_prev: PublicRequestState, fd: FormData): Promise<PublicRequestState> {
  if (text(fd, 'website')) return { ref: 'AACEA-S0' } // honeypot field: bots fill it, people don't see it
  if (!(await rateLimit('public-request', 5, 10 * 60_000))) return { error: 'Too many requests from this connection. Please try again in a few minutes.' }
  const kind = text(fd, 'kind') === 'contact' ? 'contact' : 'service'
  const category = kind === 'contact' ? 'General inquiry' : text(fd, 'category')
  if (!(SERVICE_CATEGORIES as readonly string[]).includes(category) || category === 'Other' && kind === 'service' && !text(fd, 'details')) return { error: 'Choose the service you need.' }
  const subCity = text(fd, 'sub_city') || 'Kirkos'
  if (!(SUB_CITIES as readonly string[]).includes(subCity)) return { error: 'Choose your sub-city.' }
  const name = text(fd, 'name', 120)
  const phone = text(fd, 'phone', 40)
  const email = text(fd, 'email', 160).toLowerCase()
  const details = text(fd, 'details')
  const subject = text(fd, 'subject', 120)
  if (name.length < 2) return { error: 'Enter your name.' }
  if (!phone && !email) return { error: 'Give a phone number or email so we can reply.' }
  if (email && !isEmail(email)) return { error: 'Enter a valid email address.' }
  if (phone && !/^[+\d][\d\s-]{6,}$/.test(phone)) return { error: 'Enter a valid phone number.' }
  if (details.length < 10) return { error: 'Please add a few details (at least 10 characters).' }

  const title = kind === 'contact' ? `Inquiry: ${subject || details.slice(0, 60)}` : `${category} – ${name}`
  const row = await queryOne<{ id: number; ref: string }>(
    `insert into service_requests (title, category, sub_city, requester_name, requester_phone, requester_email, notes, source, due_date)
     values ($1,$2,$3,$4,$5,$6,$7,'Public portal', current_date + $8::int) returning id, ref`,
    [title.slice(0, 120), category, subCity, name, phone || null, email || null, details, kind === 'contact' ? 3 : 10])
  await notify(`New ${kind === 'contact' ? 'inquiry' : 'service request'} ${row!.ref}`, `${name} · ${category} · ${subCity}`, 'assignment', `/admin/services/${row!.id}`)
  await logAudit(null, `Public ${kind === 'contact' ? 'inquiry' : 'service request'} ${row!.ref} received`, 'Service requests', `${category} · ${subCity}`)
  revalidatePath('/admin', 'layout')
  if (email) after(() => sendEmail({
    to: [email], subject: `We received your ${kind === 'contact' ? 'message' : 'request'} – ${row!.ref}`, heading: 'Thank you for contacting us', kind: 'Request confirmation', staffId: null,
    text: `Hello ${name},\n\nWe received your ${kind === 'contact' ? 'message' : `request for ${category.toLowerCase()}`}. Your reference number is ${row!.ref}.\n\nYou can follow its progress on our website using the Track page.`,
  }).then(() => undefined).catch((e) => console.error('Request confirmation failed', e)))
  return { ref: row!.ref }
}
