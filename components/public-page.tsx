'use client'

import { startTransition, useActionState, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { ArrowRight, CheckCircle2, Search, Send, Upload } from 'lucide-react'
import { submitComplaint } from '@/app/actions/complaint'
import { submitPublicRequest } from '@/app/actions/public'
import { INCIDENT_CATEGORIES, SERVICE_CATEGORIES, SUB_CITIES } from '@/lib/constants'

const LocationPicker = dynamic(() => import('@/components/map/location-picker').then((m) => m.LocationPicker), { ssr: false, loading: () => <div className="h-[260px] animate-pulse rounded-xl bg-[#eef2f6]" /> })

export const fieldClass = 'mt-2 w-full rounded-xl border border-[#d8e1ec] bg-white px-4 py-3 text-base font-normal text-[#14233b] outline-none transition focus:border-[#1d5fa7] focus:ring-2 focus:ring-[#1d5fa7]/15 sm:text-sm'
const card = 'rounded-3xl border border-[#dce6f1] bg-white p-5 shadow-sm sm:p-8'

/** Submit without React's automatic form reset, so entries survive a validation error. */
const submitWith = (action: (fd: FormData) => void) => (e: React.FormEvent<HTMLFormElement>) => {
  e.preventDefault()
  const fd = new FormData(e.currentTarget)
  startTransition(() => action(fd))
}

function Success({ title, refNo, text }: { title: string; refNo: string; text: string }) {
  return <div className="rounded-3xl border border-[#cde5d6] bg-[#f2fbf5] p-7 sm:p-10">
    <CheckCircle2 className="size-10 text-[#21804a]" />
    <h2 className="mt-5 text-2xl font-semibold">{title}</h2>
    <p className="mt-3 text-sm leading-7 text-[#53677f]">Your reference number is <b className="font-mono text-base text-[#14233b]">{refNo}</b>. {text}</p>
    <div className="mt-6 flex flex-wrap gap-3">
      <Link href={`/track?ref=${encodeURIComponent(refNo)}`} className="inline-flex items-center gap-2 rounded-xl bg-[#082957] px-5 py-3 text-sm font-bold text-white"><Search className="size-4" />Track it</Link>
      <Link href="/" className="inline-flex rounded-xl border border-[#cde5d6] bg-white px-5 py-3 text-sm font-bold">Return home</Link>
    </div>
  </div>
}

export function ComplaintForm() {
  const [state, formAction, pending] = useActionState(submitComplaint, null)
  const [anonymous, setAnonymous] = useState(false)
  if (state?.ref) return <Success title="Report received securely" refNo={state.ref} text="Keep it to follow the progress of your report on the Track page." />
  return <form onSubmit={submitWith(formAction)} className={card}>
    <div className="grid gap-5 sm:grid-cols-2">
      <label className="text-sm font-semibold sm:col-span-2">Category of violation<select name="category" required className={fieldClass}><option value="">Select a category</option>{INCIDENT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label>
      <label className="text-sm font-semibold">Sub-city<select name="sub_city" required className={fieldClass}><option value="">Select sub-city</option>{SUB_CITIES.map((c) => <option key={c}>{c}</option>)}</select></label>
      <label className="text-sm font-semibold">Woreda / neighbourhood<input name="woreda" required className={fieldClass} /></label>
      <label className="text-sm font-semibold sm:col-span-2">Exact landmark<input name="landmark" required className={fieldClass} placeholder="Street, building, or nearby landmark" /></label>
      <label className="text-sm font-semibold sm:col-span-2">What happened?<textarea name="description" required minLength={10} rows={5} className={fieldClass} placeholder="Tell us what happened, when, and who may be affected." /></label>
      <div className="text-sm font-semibold sm:col-span-2">Pin the exact location <span className="font-normal text-[#708097]">(recommended)</span><div className="mt-2"><LocationPicker /></div></div>
      <label className="flex cursor-pointer flex-col gap-2 rounded-xl border border-dashed border-[#cbd8e7] p-4 text-sm font-semibold sm:col-span-2"><span className="flex flex-wrap items-center gap-2"><Upload className="size-5 text-[#a87916]" />Photos or video <span className="font-normal text-[#708097]">(optional · up to 3 files, 10 MB total)</span></span><input type="file" name="evidence" multiple accept="image/*,video/*" className="text-xs font-normal" /></label>
      <label className="flex items-center gap-3 rounded-xl bg-[#f3f6fa] p-4 text-sm font-semibold sm:col-span-2"><input type="checkbox" name="anonymous" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} className="size-5 accent-[#082957]" />Keep my identity completely anonymous</label>
      {!anonymous && <>
        <label className="text-sm font-semibold">Full name<input name="reporter_name" autoComplete="name" className={fieldClass} /></label>
        <label className="text-sm font-semibold">Phone number<input name="reporter_phone" type="tel" autoComplete="tel" className={fieldClass} /></label>
        <label className="text-sm font-semibold sm:col-span-2">Email address <span className="font-normal text-[#708097]">(we&apos;ll send your reference number)</span><input name="reporter_email" type="email" autoComplete="email" className={fieldClass} /></label>
      </>}
    </div>
    {state?.error && <p role="alert" className="mt-5 rounded-xl bg-[#fff0f1] px-4 py-3 text-sm font-semibold text-[#b32d3d]">{state.error}</p>}
    <button type="submit" disabled={pending} className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#082957] px-5 py-3.5 text-sm font-bold text-white disabled:opacity-60 sm:w-auto">{pending ? 'Submitting…' : 'Submit official report'}<ArrowRight className="size-4" /></button>
  </form>
}

/** Service request (kind="service") or contact message (kind="contact"). Both arrive in Admin → Service requests. */
export function PublicRequestForm({ kind }: { kind: 'service' | 'contact' }) {
  const [state, action, pending] = useActionState(submitPublicRequest, null)
  if (state?.ref) return <Success title={kind === 'contact' ? 'Message sent' : 'Request received'} refNo={state.ref} text="Our team will contact you. You can also follow progress on the Track page." />
  const services = SERVICE_CATEGORIES.filter((c) => c !== 'General inquiry')
  return <form onSubmit={submitWith(action)} className={card}>
    <input type="hidden" name="kind" value={kind} />
    {/* Honeypot: hidden from people, tempting for bots. */}
    <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 opacity-0" />
    <div className="grid gap-5 sm:grid-cols-2">
      {kind === 'service'
        ? <label className="text-sm font-semibold">Service needed<select name="category" required className={fieldClass}><option value="">Select a service</option>{services.map((c) => <option key={c}>{c}</option>)}</select></label>
        : <label className="text-sm font-semibold">Subject<input name="subject" maxLength={120} className={fieldClass} placeholder="e.g. Question about a permit" /></label>}
      <label className="text-sm font-semibold">Your sub-city<select name="sub_city" required className={fieldClass}><option value="">Select sub-city</option>{SUB_CITIES.map((c) => <option key={c}>{c}</option>)}</select></label>
      <label className="text-sm font-semibold">Full name<input name="name" required autoComplete="name" className={fieldClass} /></label>
      <label className="text-sm font-semibold">Phone<input name="phone" type="tel" autoComplete="tel" className={fieldClass} /></label>
      <label className="text-sm font-semibold sm:col-span-2">Email <span className="font-normal text-[#708097]">(phone or email required)</span><input name="email" type="email" autoComplete="email" className={fieldClass} /></label>
      <label className="text-sm font-semibold sm:col-span-2">{kind === 'contact' ? 'Message' : 'Details'}<textarea name="details" required minLength={10} rows={5} className={fieldClass} placeholder={kind === 'contact' ? 'How can we help?' : 'Location, dates, business name, and anything else that helps us process the request.'} /></label>
    </div>
    {state?.error && <p role="alert" className="mt-5 rounded-xl bg-[#fff0f1] px-4 py-3 text-sm font-semibold text-[#b32d3d]">{state.error}</p>}
    <button type="submit" disabled={pending} className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#082957] px-5 py-3.5 text-sm font-bold text-white disabled:opacity-60 sm:w-auto"><Send className="size-4" />{pending ? 'Sending…' : kind === 'contact' ? 'Send message' : 'Submit request'}</button>
  </form>
}
