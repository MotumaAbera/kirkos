import 'server-only'
import nodemailer, { type Transporter } from 'nodemailer'
import { query } from '@/lib/db'
import { getSettings } from '@/lib/queries'

const globalForMail = globalThis as unknown as { mailer?: Transporter }

function transporter() {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) throw new Error('Email is not configured: set EMAIL_USER and EMAIL_PASS in .env')
  globalForMail.mailer ??= nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: Number(process.env.EMAIL_PORT || 465),
    secure: Number(process.env.EMAIL_PORT || 465) === 465,
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  })
  return globalForMail.mailer
}

export const isEmail = (value: string) => /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(value)

/** Splits "a@x.com, b@y.com; c@z.com" into unique, valid addresses (lower-cased) and the invalid leftovers. */
export function parseAddresses(raw: string) {
  const parts = raw.split(/[\s,;]+/).map((p) => p.trim().toLowerCase()).filter(Boolean)
  return { valid: [...new Set(parts.filter(isEmail))], invalid: parts.filter((p) => !isEmail(p)) }
}

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

/** Wraps plain text in the authority's branded HTML email layout. */
export function renderEmail({ heading, body, orgName, footer }: { heading: string; body: string; orgName: string; footer?: string }) {
  const paragraphs = escapeHtml(body).split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px;line-height:1.6">${p.replace(/\n/g, '<br>')}</p>`).join('')
  return `<!doctype html><html><body style="margin:0;background:#f4f7fb;font-family:Segoe UI,Arial,sans-serif;color:#14233b">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #dfe7f0">
      <tr><td style="background:#082957;padding:20px 28px;color:#ffffff">
        <div style="font-size:11px;letter-spacing:2px;font-weight:700;color:#e9bb52">AACEA</div>
        <div style="font-size:14px;margin-top:2px;color:#c4d3e5">${escapeHtml(orgName)}</div>
      </td></tr>
      <tr><td style="padding:28px">
        <h1 style="margin:0 0 18px;font-size:20px;color:#082957">${escapeHtml(heading)}</h1>
        <div style="font-size:14px;color:#33445c">${paragraphs}</div>
      </td></tr>
      <tr><td style="padding:16px 28px;background:#f7f9fc;font-size:11px;color:#718096;border-top:1px solid #edf1f5">${escapeHtml(footer ?? `Sent from the ${orgName} staff workspace.`)}</td></tr>
    </table>
  </td></tr></table></body></html>`
}

export type Attachment = { filename: string; content: Buffer | string; contentType?: string }
type SendInput = {
  to: string[]
  subject: string
  heading?: string
  text: string
  attachments?: Attachment[]
  /** Send one message per recipient (personalised, recipients can't see each other) instead of one shared message. */
  individually?: boolean
  personalize?: (to: string) => string
  kind: string
  staffId: number | null
}

/** Sends an email (or one per recipient) and records the result in email_log. Never throws for delivery failures. */
export async function sendEmail(input: SendInput) {
  const settings = await getSettings()
  const from = { name: settings.email_sender_name || settings.org_name, address: process.env.EMAIL_USER ?? '' }
  const failed: string[] = []
  let error: string | null = null
  try {
    const mailer = transporter()
    const batches = input.individually ? input.to.map((r) => [r]) : [input.to]
    for (const batch of batches) {
      const text = input.personalize ? input.personalize(batch[0]) : input.text
      try {
        await mailer.sendMail({
          from, to: batch, subject: input.subject, text,
          html: renderEmail({ heading: input.heading ?? input.subject, body: text, orgName: settings.org_name }),
          attachments: input.attachments,
        })
      } catch (e) {
        failed.push(...batch)
        error = e instanceof Error ? e.message : String(e)
      }
    }
  } catch (e) {
    failed.push(...input.to)
    error = e instanceof Error ? e.message : String(e)
  }
  const status = failed.length === 0 ? 'Sent' : failed.length === input.to.length ? 'Failed' : 'Partly sent'
  await query('insert into email_log (staff_id, kind, subject, recipients, failed, attachments, status, error) values ($1,$2,$3,$4,$5,$6,$7,$8)',
    [input.staffId, input.kind, input.subject, input.to, failed, (input.attachments ?? []).map((a) => a.filename), status, error])
  return { status, sent: input.to.length - failed.length, failed, error }
}

type MailerStatus = { ok: true; user: string } | { ok: false; user: string; error: string }
const globalStatus = globalThis as unknown as { mailerStatus?: { at: number; value: MailerStatus } }

/** Checks the SMTP login. Successful checks are cached for 5 minutes so pages stay fast. */
export async function verifyMailer(): Promise<MailerStatus> {
  const cached = globalStatus.mailerStatus
  if (cached && cached.value.ok && Date.now() - cached.at < 5 * 60_000) return cached.value
  let value: MailerStatus
  try {
    await transporter().verify()
    value = { ok: true, user: process.env.EMAIL_USER! }
  } catch (e) {
    value = { ok: false, user: process.env.EMAIL_USER ?? '', error: e instanceof Error ? e.message : String(e) }
  }
  globalStatus.mailerStatus = { at: Date.now(), value }
  return value
}
