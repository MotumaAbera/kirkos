'use client'

import { startTransition, useActionState, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, CheckCircle2, CreditCard, FileText, Gavel, Search, Upload } from 'lucide-react'
import { lookupCitation, startOnlinePayment, submitAppeal } from '@/app/actions/pay'

const field = 'mt-2 w-full rounded-xl border border-[#d8e1ec] bg-white px-4 py-3 font-normal'
const birr = (v: number | string) => `ETB ${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function LookupFields({ defaultRef }: { defaultRef?: string }) {
  return <>
    <label className="text-sm font-semibold">Citation number<input name="ref" required defaultValue={defaultRef} placeholder="CIT-2026-1001" autoCapitalize="characters" className={field} /></label>
    <label className="text-sm font-semibold">Last 4 digits of your phone, or your email<input name="contact" required placeholder="e.g. 4567" autoComplete="off" className={field} />
      <span className="mt-1 block text-xs font-normal text-[#708097]">The phone number or email the inspector recorded on your citation.</span></label>
  </>
}

const submitOnEnter = (action: (fd: FormData) => void) => (e: React.FormEvent<HTMLFormElement>) => {
  e.preventDefault()
  const fd = new FormData(e.currentTarget)
  startTransition(() => action(fd))
}

export function PayPortal({ defaultRef }: { defaultRef?: string }) {
  const [state, action, pending] = useActionState(lookupCitation, null)
  const [paying, setPaying] = useState(false)
  const [payError, setPayError] = useState('')
  const c = state?.citation

  async function pay(choice: 'balance' | 'installment', email: string) {
    if (!c) return
    setPaying(true)
    setPayError('')
    const r = await startOnlinePayment(c.token, choice, email)
    if (r.url) window.location.href = r.url
    else { setPaying(false); setPayError(r.error ?? 'Payment could not be started.') }
  }

  if (!c) return <form onSubmit={submitOnEnter(action)} className="grid gap-5 rounded-3xl border border-[#dce6f1] bg-white p-6 shadow-sm sm:p-8">
    <LookupFields defaultRef={defaultRef} />
    {state?.error && <p role="alert" className="rounded-xl bg-[#fff0f1] px-4 py-3 text-sm font-semibold text-[#b32d3d]">{state.error}</p>}
    <button disabled={pending} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#082957] px-5 py-3.5 text-sm font-bold text-white disabled:opacity-60 sm:w-fit"><Search className="size-4" />{pending ? 'Searching…' : 'Find my citation'}</button>
  </form>

  const due = Number(c.balance) > 0 && ['Unpaid', 'Partially paid', 'Escalated'].includes(c.status)
  return <div className="flex flex-col gap-5">
    <section className="rounded-3xl border border-[#dce6f1] bg-white p-6 shadow-sm sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#a87916]">Citation {c.ref}</p><h2 className="mt-1 text-2xl font-semibold">{c.violation}</h2><p className="mt-1 text-sm text-[#708097]">Issued to {c.offender} on {c.issued}</p></div>
        <span className="rounded-full bg-[#edf3fa] px-3 py-1 text-xs font-bold text-[#082957]">{c.status}</span>
      </div>
      <dl className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl bg-[#f4f7fb] p-4"><dt className="text-xs text-[#708097]">Fine</dt><dd className="mt-1 text-xl font-semibold">{birr(c.amount)}</dd></div>
        <div className="rounded-2xl bg-[#f4f7fb] p-4"><dt className="text-xs text-[#708097]">Paid</dt><dd className="mt-1 text-xl font-semibold text-[#21804a]">{birr(c.paid)}</dd></div>
        <div className="rounded-2xl bg-[#f4f7fb] p-4"><dt className="text-xs text-[#708097]">Balance · due {c.due}</dt><dd className={`mt-1 text-xl font-semibold ${c.overdue ? 'text-[#b32d3d]' : ''}`}>{birr(c.balance)}</dd></div>
      </dl>
      {c.status === 'Under appeal' && <p className="mt-5 rounded-xl bg-[#fff7df] px-4 py-3 text-sm text-[#7a5606]">Your appeal is being reviewed. Payment is paused until a decision is made.</p>}
      {c.status === 'Paid' && <p className="mt-5 flex items-center gap-2 rounded-xl bg-[#eaf8f0] px-4 py-3 text-sm font-semibold text-[#21804a]"><CheckCircle2 className="size-5" />This citation is fully paid. Thank you.</p>}
    </section>

    {c.plan && <section className="rounded-3xl border border-[#dce6f1] bg-white p-6 shadow-sm sm:p-8"><h3 className="text-lg font-semibold">Payment plan · {c.plan.installments} monthly installments ({c.plan.status})</h3>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">{c.plan.schedule.map((i) => <li key={i.seq} className="flex justify-between rounded-xl bg-[#f4f7fb] px-4 py-2.5 text-sm"><span>#{i.seq} · {i.due}</span><span className="font-semibold">{birr(i.amount)} · {i.status}</span></li>)}</ul></section>}

    {due && <section className="rounded-3xl border border-[#dce6f1] bg-white p-6 shadow-sm sm:p-8">
      <h3 className="flex items-center gap-2 text-lg font-semibold"><CreditCard className="size-5 text-[#a87916]" />How to pay</h3>
      <p className="mt-3 text-sm leading-7 text-[#53677f]">{c.instructions}</p>
      {c.canPayOnline ? <form className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); pay(String(fd.get('choice')) as 'balance' | 'installment', String(fd.get('email') ?? '')) }}>
        <input name="email" type="email" placeholder="Email for your receipt (optional)" className="rounded-xl border border-[#d8e1ec] px-4 py-3 text-sm" />
        <input type="hidden" name="choice" value={c.plan?.next ? 'installment' : 'balance'} />
        <button disabled={paying} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#082957] px-5 py-3 text-sm font-bold text-white disabled:opacity-60">{paying ? 'Opening Chapa…' : `Pay ${birr(c.plan?.next ? c.plan.next.amount - c.plan.next.paid : c.balance)} online`}<ArrowRight className="size-4" /></button>
        <p className="text-xs text-[#708097] sm:col-span-2">Secure payment by Chapa: Telebirr, CBE Birr, M-Pesa, bank cards and more. Your citation updates automatically once the payment is confirmed.</p>
        {payError && <p role="alert" className="rounded-xl bg-[#fff0f1] px-4 py-3 text-sm font-semibold text-[#b32d3d] sm:col-span-2">{payError}</p>}
      </form> : <p className="mt-3 text-xs text-[#708097]">Quote your citation number <b>{c.ref}</b> with your payment.</p>}
    </section>}

    {c.payments.length > 0 && <section className="rounded-3xl border border-[#dce6f1] bg-white p-6 shadow-sm sm:p-8"><h3 className="text-lg font-semibold">Payments received</h3>
      <ul className="mt-3 divide-y divide-[#e5ebf2] text-sm">{c.payments.map((p, i) => <li key={i} className="flex justify-between py-2.5"><span>{p.date} · {p.method}{p.receipt ? ` · receipt ${p.receipt}` : ''}</span><b>{birr(p.amount)}</b></li>)}</ul></section>}

    {c.canAppeal && <section className="flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-[#edf3fa] p-6 sm:p-8"><div><h3 className="flex items-center gap-2 text-lg font-semibold"><Gavel className="size-5" />Think this citation is wrong?</h3><p className="mt-1 text-sm text-[#53677f]">You can appeal until {c.appealDeadline}. Payment is paused while your appeal is reviewed.</p></div>
      <Link href={`/appeal?ref=${encodeURIComponent(c.ref)}`} className="inline-flex items-center gap-2 rounded-xl bg-[#082957] px-5 py-3 text-sm font-bold text-white">File an appeal<ArrowRight className="size-4" /></Link></section>}
  </div>
}

export function AppealForm({ defaultRef }: { defaultRef?: string }) {
  const [state, action, pending] = useActionState(submitAppeal, null)
  if (state?.ref) return <div className="rounded-3xl border border-[#cde5d6] bg-[#f2fbf5] p-7 sm:p-10"><CheckCircle2 className="size-10 text-[#21804a]" /><h2 className="mt-5 text-2xl font-semibold">Appeal received</h2>
    <p className="mt-3 text-sm leading-7 text-[#53677f]">Your appeal reference is <b className="text-[#14233b]">{state.ref}</b>. Payment of the citation is paused while we review it. We will contact you with a hearing date or a decision.</p>
    <Link href="/" className="mt-6 inline-flex rounded-xl bg-[#082957] px-5 py-3 text-sm font-bold text-white">Return home</Link></div>
  return <form onSubmit={submitOnEnter(action)} className="grid gap-5 rounded-3xl border border-[#dce6f1] bg-white p-6 shadow-sm sm:grid-cols-2 sm:p-8">
    <div className="grid gap-5 sm:col-span-2 sm:grid-cols-2"><LookupFields defaultRef={defaultRef} /></div>
    <label className="text-sm font-semibold sm:col-span-2">Why are you appealing?<textarea name="reason" required minLength={30} rows={6} placeholder="Explain what happened and why the citation should be reduced or cancelled. Mention any permits or licences you hold." className={field} /></label>
    <label className="text-sm font-semibold">Your name<input name="name" placeholder="As on the citation" className={field} /></label>
    <label className="text-sm font-semibold">Phone for follow-up<input name="phone" inputMode="tel" className={field} /></label>
    <label className="text-sm font-semibold sm:col-span-2">Email (to receive updates)<input name="email" type="email" className={field} /></label>
    <label className="flex cursor-pointer flex-col gap-2 rounded-xl border border-dashed border-[#cbd8e7] p-4 text-sm font-semibold sm:col-span-2"><span className="flex items-center gap-2"><Upload className="size-5 text-[#a87916]" />Supporting documents <span className="font-normal text-[#708097]">(permits, receipts, photos – up to 3 files, 10 MB total)</span></span>
      <input type="file" name="documents" multiple accept="image/*,application/pdf,.doc,.docx" className="text-xs font-normal" /></label>
    {state?.error && <p role="alert" className="rounded-xl bg-[#fff0f1] px-4 py-3 text-sm font-semibold text-[#b32d3d] sm:col-span-2">{state.error}</p>}
    <button disabled={pending} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#082957] px-5 py-3.5 text-sm font-bold text-white disabled:opacity-60 sm:w-fit"><FileText className="size-4" />{pending ? 'Submitting…' : 'Submit appeal'}</button>
  </form>
}
