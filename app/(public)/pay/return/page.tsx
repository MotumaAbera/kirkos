import Link from 'next/link'
import { CheckCircle2, Clock3, XCircle } from 'lucide-react'
import { verifyChapa } from '@/lib/chapa'

export const metadata = { title: 'Payment status' }

/** Chapa sends the citizen back here; the payment is re-verified server-side before we show success. */
export default async function PaymentReturnPage({ searchParams }: { searchParams: Promise<{ tx?: string }> }) {
  const { tx } = await searchParams
  const result = tx ? await verifyChapa(tx) : { status: 'unknown' as const }
  const ref = 'ref' in result ? result.ref : undefined
  const view = {
    confirmed: { icon: CheckCircle2, tone: 'text-[#21804a]', title: 'Payment confirmed', text: `Your payment${'amount' in result ? ` of ETB ${Number(result.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : ''} for citation ${ref} has been received. Thank you.` },
    pending: { icon: Clock3, tone: 'text-[#9a6d08]', title: 'Payment processing', text: `We haven't received confirmation yet for citation ${ref}. This usually takes a minute — refresh this page shortly.` },
    failed: { icon: XCircle, tone: 'text-[#b32d3d]', title: 'Payment not completed', text: `The payment for citation ${ref} was cancelled or failed. No money was taken. You can try again.` },
    unknown: { icon: XCircle, tone: 'text-[#b32d3d]', title: 'Payment not found', text: 'We could not find this payment. If money was taken, contact the citizen support desk with your transaction receipt.' },
  }[result.status]
  return <>
    <section className="mx-auto max-w-2xl px-5 py-16">
      <div className="rounded-3xl border border-[#dce6f1] bg-white p-8 text-center shadow-sm">
        <view.icon className={`mx-auto size-12 ${view.tone}`} />
        <h1 className="mt-5 text-2xl font-semibold">{view.title}</h1>
        <p className="mt-3 text-sm leading-7 text-[#53677f]">{view.text}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {ref && <Link href={`/pay?ref=${encodeURIComponent(ref)}`} className="rounded-xl bg-[#082957] px-5 py-3 text-sm font-bold text-white">View citation</Link>}
          <Link href="/" className="rounded-xl border border-[#dce6f1] px-5 py-3 text-sm font-bold">Home</Link>
        </div>
      </div>
    </section>
  </>
}
