import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { headers } from 'next/headers'
import { getCitationByRef, type Citation } from '@/lib/enforcement'

const hits = new Map<string, number[]>()

/** Simple in-memory sliding-window rate limit (per server instance). Returns true when the request is allowed. */
export async function rateLimit(bucket: string, max: number, windowMs: number) {
  const h = await headers()
  const ip = (h.get('x-forwarded-for') ?? '').split(',')[0].trim() || h.get('x-real-ip') || 'local'
  const key = `${bucket}:${ip}`
  const now = Date.now()
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs)
  if (recent.length >= max) { hits.set(key, recent); return false }
  recent.push(now)
  hits.set(key, recent)
  return true
}

const digits = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '')

/**
 * A citizen proves they are the cited person with the citation number plus the last 4 digits of the phone
 * (or the full email) recorded on the citation. Returns null on any mismatch, without saying which part was wrong.
 */
export async function verifyCitationAccess(ref: string, contact: string): Promise<Citation | null> {
  const c = await getCitationByRef(ref)
  if (!c) return null
  const value = contact.trim().toLowerCase()
  const phoneOk = digits(c.offender_phone).length >= 4 && digits(value).length === 4 && digits(c.offender_phone).endsWith(digits(value))
  const emailOk = Boolean(c.offender_email) && value.includes('@') && value === c.offender_email!.toLowerCase()
  return phoneOk || emailOk ? c : null
}

function secret() {
  if (!process.env.API_TOKEN_SECRET) throw new Error('API_TOKEN_SECRET is not set')
  return process.env.API_TOKEN_SECRET
}

/** Short-lived token that lets the citizen who verified a citation start an online payment for it. */
export function citationToken(citationId: number, minutes = 30) {
  const payload = `${citationId}.${Date.now() + minutes * 60_000}`
  return `${payload}.${createHmac('sha256', secret()).update(`pay:${payload}`).digest('base64url')}`
}

export function readCitationToken(token: string) {
  const [id, exp, sig] = token.split('.')
  if (!id || !exp || !sig) return null
  const expected = Buffer.from(createHmac('sha256', secret()).update(`pay:${id}.${exp}`).digest('base64url'))
  const actual = Buffer.from(sig)
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual) || Number(exp) < Date.now()) return null
  return Number(id)
}
