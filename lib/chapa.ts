import 'server-only'
import { randomBytes } from 'node:crypto'
import { logAudit } from '@/lib/activity'
import { query, queryOne } from '@/lib/db'
import { refreshCitationStatus } from '@/lib/enforcement'

/**
 * Chapa (https://chapa.co) online payments. Enabled only when CHAPA_SECRET_KEY is set in .env.
 * Use a test key (CHASECK_TEST-…) first; every payment is confirmed by calling Chapa's verify API, never by trusting redirects.
 */
const API = 'https://api.chapa.co/v1'
export const chapaEnabled = () => Boolean(process.env.CHAPA_SECRET_KEY)
const auth = () => ({ Authorization: `Bearer ${process.env.CHAPA_SECRET_KEY}` })

export async function initializeChapa(input: { citationId: number; citationRef: string; amount: number; email?: string | null; phone?: string | null; name: string; baseUrl: string }) {
  if (!chapaEnabled()) throw new Error('Online payment is not available.')
  const txRef = `AACEA-${input.citationRef}-${randomBytes(5).toString('hex')}`.replace(/[^A-Za-z0-9-_.]/g, '')
  const [first, ...rest] = input.name.trim().split(/\s+/)
  await query(`insert into payments (citation_id, amount, method, status, provider_tx_ref) values ($1, $2, 'Chapa (online)', 'Pending', $3)`, [input.citationId, input.amount, txRef])
  const res = await fetch(`${API}/transaction/initialize`, {
    method: 'POST',
    headers: { ...auth(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount: input.amount.toFixed(2), currency: 'ETB', tx_ref: txRef,
      email: input.email || undefined, phone_number: input.phone || undefined, first_name: first || 'Citizen', last_name: rest.join(' ') || undefined,
      callback_url: `${input.baseUrl}/api/payments/chapa/callback`, return_url: `${input.baseUrl}/pay/return?tx=${encodeURIComponent(txRef)}`,
      customization: { title: 'AACEA fine', description: `Citation ${input.citationRef}` },
    }),
    cache: 'no-store',
  })
  const body = (await res.json().catch(() => ({}))) as { status?: string; message?: unknown; data?: { checkout_url?: string } }
  if (!res.ok || body.status !== 'success' || !body.data?.checkout_url) {
    await query(`update payments set status = 'Failed' where provider_tx_ref = $1`, [txRef])
    throw new Error(typeof body.message === 'string' ? body.message : 'The payment provider did not accept the request.')
  }
  return { checkoutUrl: body.data.checkout_url, txRef }
}

/** Confirms a payment with Chapa and updates our record. Idempotent: safe to call from both the callback and the return page. */
export async function verifyChapa(txRef: string) {
  const payment = await queryOne<{ id: number; citation_id: number; amount: string; status: string; ref: string }>(
    `select p.id, p.citation_id, p.amount::text, p.status, c.ref from payments p join citations c on c.id = p.citation_id where p.provider_tx_ref = $1`, [txRef])
  if (!payment) return { status: 'unknown' as const }
  if (payment.status === 'Confirmed') return { status: 'confirmed' as const, ref: payment.ref, amount: payment.amount, citationId: payment.citation_id }
  if (!chapaEnabled()) return { status: 'pending' as const, ref: payment.ref }
  const res = await fetch(`${API}/transaction/verify/${encodeURIComponent(txRef)}`, { headers: auth(), cache: 'no-store' })
  const body = (await res.json().catch(() => ({}))) as { status?: string; data?: { status?: string; amount?: string | number; currency?: string; reference?: string } }
  const ok = res.ok && body.status === 'success' && body.data?.status === 'success' && body.data.currency === 'ETB' && Math.abs(Number(body.data.amount) - Number(payment.amount)) < 0.01
  if (ok) {
    const updated = await queryOne(`update payments set status = 'Confirmed', paid_at = now(), reference = $2 where id = $1 and status <> 'Confirmed' returning id`, [payment.id, body.data?.reference ?? null])
    if (updated) {
      await refreshCitationStatus(payment.citation_id)
      await logAudit(null, `Online payment confirmed for ${payment.ref}`, 'Revenue', `ETB ${payment.amount} · Chapa ${txRef}`)
    }
    return { status: 'confirmed' as const, ref: payment.ref, amount: payment.amount, citationId: payment.citation_id }
  }
  if (body.data?.status === 'failed' || body.data?.status === 'cancelled') {
    await query(`update payments set status = 'Failed' where id = $1 and status = 'Pending'`, [payment.id])
    return { status: 'failed' as const, ref: payment.ref }
  }
  return { status: 'pending' as const, ref: payment.ref }
}
