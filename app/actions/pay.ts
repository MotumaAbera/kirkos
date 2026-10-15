'use server'

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { logAudit, notify } from '@/lib/activity'
import { chapaEnabled, initializeChapa } from '@/lib/chapa'
import { query, queryOne } from '@/lib/db'
import { getCitation, getPlan } from '@/lib/enforcement'
import { isEmail, sendEmail } from '@/lib/mailer'
import { formatBirr } from '@/lib/money'
import { citationToken, rateLimit, readCitationToken, verifyCitationAccess } from '@/lib/public-access'
import { getSettings } from '@/lib/queries'
import { MAX_PUBLIC_EVIDENCE_BYTES, storeEvidence, type StoredFile } from '@/lib/storage'
import { appUrl } from '@/lib/url'

const text = (fd: FormData, key: string) => String(fd.get(key) ?? '').trim().slice(0, 4000)
const NOT_FOUND = 'We could not find a citation matching those details. Check the citation number and the phone digits or email you gave the inspector.'

export type CitationView = {
  token: string; ref: string; violation: string; offender: string; issued: string; due: string; status: string
  amount: string; paid: string; balance: string; overdue: boolean
  plan: { installments: number; status: string; next: { seq: number; due: string; amount: number; paid: number } | null; schedule: { seq: number; due: string; amount: number; status: string }[] } | null
  payments: { date: string; amount: string; method: string; receipt: string | null }[]
  canPayOnline: boolean; canAppeal: boolean; appealDeadline: string; instructions: string
}
export type LookupState = { error?: string; citation?: CitationView } | null

async function view(citationId: number): Promise<CitationView> {
  const [c, plan, payments, settings] = await Promise.all([
    getCitation(citationId), getPlan(citationId),
    query<{ paid_at: Date; amount: string; method: string; receipt_no: string | null }>(`select paid_at, amount::text, method, receipt_no from payments where citation_id = $1 and status = 'Confirmed' order by paid_at desc`, [citationId]),
    getSettings(),
  ])
  const deadline = new Date(new Date(c!.issued_at).getTime() + settings.appeal_window_days * 86400000)
  const payable = ['Unpaid', 'Partially paid', 'Escalated'].includes(c!.status) && Number(c!.balance) > 0
  const next = plan?.status === 'Active' ? plan.schedule.find((i) => i.status !== 'Paid') ?? null : null
  return {
    token: citationToken(citationId), ref: c!.ref, violation: c!.violation, offender: c!.offender_name, issued: new Date(c!.issued_at).toISOString().slice(0, 10), due: c!.due_date,
    status: c!.status, amount: c!.amount, paid: c!.paid, balance: c!.balance, overdue: c!.overdue,
    plan: plan ? { installments: plan.installments, status: plan.status, next: next && { seq: next.seq, due: next.due, amount: next.amount, paid: next.paid }, schedule: plan.schedule.map((i) => ({ seq: i.seq, due: i.due, amount: i.amount, status: i.status })) } : null,
    payments: payments.map((p) => ({ date: new Date(p.paid_at).toISOString().slice(0, 10), amount: p.amount, method: p.method, receipt: p.receipt_no })),
    canPayOnline: payable && chapaEnabled(), canAppeal: ['Unpaid', 'Partially paid'].includes(c!.status) && deadline.getTime() > Date.now(),
    appealDeadline: deadline.toISOString().slice(0, 10), instructions: settings.payment_instructions,
  }
}

export async function lookupCitation(_prev: LookupState, fd: FormData): Promise<LookupState> {
  if (!(await rateLimit('citation-lookup', 10, 10 * 60_000))) return { error: 'Too many attempts. Please wait 10 minutes and try again.' }
  const c = await verifyCitationAccess(text(fd, 'ref'), text(fd, 'contact'))
  if (!c) return { error: NOT_FOUND }
  return { citation: await view(c.id) }
}

export async function startOnlinePayment(token: string, choice: 'balance' | 'installment', email: string): Promise<{ url?: string; error?: string }> {
  if (!(await rateLimit('chapa-init', 5, 10 * 60_000))) return { error: 'Too many attempts. Please wait a few minutes.' }
  const id = readCitationToken(token)
  if (!id) return { error: 'Your session expired. Look up the citation again.' }
  const c = await getCitation(id)
  if (!c || !['Unpaid', 'Partially paid', 'Escalated'].includes(c.status) || Number(c.balance) <= 0) return { error: 'This citation has nothing to pay online.' }
  const plan = await getPlan(id)
  const next = plan?.status === 'Active' ? plan.schedule.find((i) => i.status !== 'Paid') : undefined
  const amount = choice === 'installment' && next ? Math.round((next.amount - next.paid) * 100) / 100 : Number(c.balance)
  const contactEmail = email.trim().toLowerCase() || c.offender_email
  if (contactEmail && !isEmail(contactEmail)) return { error: 'Enter a valid email address for your receipt.' }
  try {
    const { checkoutUrl } = await initializeChapa({ citationId: id, citationRef: c.ref, amount, email: contactEmail, phone: c.offender_phone, name: c.offender_name, baseUrl: await appUrl() })
    return { url: checkoutUrl }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Online payment could not be started.' }
  }
}

export type AppealState = { error?: string; ref?: string } | null

export async function submitAppeal(_prev: AppealState, fd: FormData): Promise<AppealState> {
  if (!(await rateLimit('appeal', 5, 10 * 60_000))) return { error: 'Too many attempts. Please wait 10 minutes and try again.' }
  const c = await verifyCitationAccess(text(fd, 'ref'), text(fd, 'contact'))
  if (!c) return { error: NOT_FOUND }
  const settings = await getSettings()
  const deadline = new Date(new Date(c.issued_at).getTime() + settings.appeal_window_days * 86400000)
  if (!['Unpaid', 'Partially paid'].includes(c.status)) return { error: c.status === 'Under appeal' ? 'An appeal for this citation is already being reviewed.' : `This citation is ${c.status.toLowerCase()} and can't be appealed online. Please visit a sub-city office.` }
  if (deadline.getTime() < Date.now()) return { error: `The ${settings.appeal_window_days}-day appeal window closed on ${deadline.toISOString().slice(0, 10)}. Please visit a sub-city office.` }
  const reason = text(fd, 'reason')
  if (reason.length < 30) return { error: 'Please explain why you are appealing (at least 30 characters).' }
  const name = text(fd, 'name') || c.offender_name
  const phone = text(fd, 'phone') || c.offender_phone
  const email = text(fd, 'email').toLowerCase() || c.offender_email
  if (email && !isEmail(email)) return { error: 'Enter a valid email address or leave it blank.' }

  const files = fd.getAll('documents').filter((f): f is File => f instanceof File && f.size > 0)
  if (files.length > 3) return { error: 'Attach up to 3 documents.' }
  if (files.reduce((s, f) => s + f.size, 0) > 10 * 1024 * 1024) return { error: 'Documents must be 10 MB or less in total.' }
  const stored: StoredFile[] = []
  for (const f of files) {
    try { stored.push(await storeEvidence(f, MAX_PUBLIC_EVIDENCE_BYTES)) } catch (e) { return { error: e instanceof Error ? e.message : 'A document could not be uploaded.' } }
  }

  const lc = await queryOne<{ id: number; ref: string }>(`insert into legal_cases (type, citation_id, incident_id, appellant_name, appellant_phone, appellant_email, reason) values ('Appeal', $1, $2, $3, $4, $5, $6) returning id, ref`,
    [c.id, c.incident_id, name, phone, email || null, reason])
  await query(`update citations set status = 'Under appeal', updated_at = now() where id = $1`, [c.id])
  for (const f of stored)
    await query(`insert into evidence (legal_case_id, original_name, stored_name, mime, size_bytes, sha256, captured_at, lat, lng, source, description) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'Public appeal','Submitted with the appeal')`,
      [lc!.id, f.originalName, f.storedName, f.mime, f.size, f.sha256, f.capturedAt ?? null, f.lat ?? null, f.lng ?? null])
  await notify(`New appeal ${lc!.ref}`, `${name} appealed citation ${c.ref} (${formatBirr(c.amount)}).`, 'assignment', `/admin/legal/${lc!.id}`)
  await logAudit(null, `Appeal ${lc!.ref} filed online`, 'Legal', `Citation ${c.ref} · ${stored.length} document(s)`)
  revalidatePath('/admin', 'layout')
  if (email) after(() => sendEmail({
    to: [email], subject: `Appeal received – ${lc!.ref}`, heading: 'We received your appeal', kind: 'Appeal confirmation', staffId: null,
    text: `Dear ${name},\n\nYour appeal of citation ${c.ref} has been received. Your appeal reference is ${lc!.ref}.\n\nPayment of the citation is paused while the appeal is reviewed. We will contact you with a hearing date or a decision.`,
  }).then(() => undefined).catch((e) => console.error('Appeal confirmation failed', e)))
  return { ref: lc!.ref }
}
