import type { NextRequest } from 'next/server'
import { verifyChapa } from '@/lib/chapa'

/** Chapa calls this after a payment (GET with ?trx_ref=…, or a POST webhook). We always re-verify with Chapa's API. */
async function handle(txRef: string | null | undefined) {
  if (!txRef) return Response.json({ error: 'Missing transaction reference' }, { status: 400 })
  const result = await verifyChapa(txRef)
  return Response.json({ status: result.status })
}

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams
  return handle(p.get('trx_ref') ?? p.get('tx_ref'))
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { trx_ref?: string; tx_ref?: string }
  return handle(body.trx_ref ?? body.tx_ref)
}
