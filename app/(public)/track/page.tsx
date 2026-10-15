import Link from 'next/link'
import { Check, Search } from 'lucide-react'
import { container } from '@/components/public/nav'
import { PageHero } from '@/components/public/page-hero'
import { rateLimit } from '@/lib/public-access'
import { trackReference } from '@/lib/public'
import { cn } from '@/lib/utils'

export const metadata = { title: 'Track a case or request' }
const day = (d: Date | null) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Addis_Ababa' }) : '—')

export default async function TrackPage({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const { ref } = await searchParams
  const limited = ref ? !(await rateLimit('track', 30, 10 * 60_000)) : false
  const result = ref && !limited ? await trackReference(ref) : null

  return <>
    <PageHero eyebrow="Track" title="Track a case or request" intro="Enter the reference number you received when you reported a violation (AACEA-…) or submitted a service request (AACEA-S…).">
      <form className="mt-8 flex w-full max-w-xl flex-col gap-2 rounded-2xl bg-white p-2 shadow-2xl sm:flex-row sm:items-center">
        <label className="flex min-w-0 flex-1 items-center"><span className="sr-only">Reference number</span><Search className="ml-3 size-5 shrink-0 text-[#8c9aab]" />
          <input name="ref" required defaultValue={ref} placeholder="AACEA-24101" autoCapitalize="characters" className="w-full min-w-0 bg-transparent px-3 py-3 text-base text-[#14233b] outline-none sm:text-sm" /></label>
        <button className="shrink-0 rounded-xl bg-[#e9bb52] px-5 py-3 text-sm font-bold text-[#082957]">Track</button>
      </form>
    </PageHero>
    <section className={cn(container, 'max-w-3xl py-12 sm:py-16')}>
      {!ref ? <p className="text-center text-sm text-[#708097]">Your reference number is in the confirmation message and email you received.</p>
        : limited ? <p role="alert" className="rounded-2xl bg-[#fff0f1] p-5 text-sm font-semibold text-[#b32d3d]">Too many lookups from this connection. Please wait a few minutes.</p>
        : !result ? <div className="rounded-3xl border border-[#dce6f1] bg-white p-8 text-center shadow-sm"><h2 className="text-xl font-semibold">No match for “{ref}”</h2><p className="mt-2 text-sm text-[#708097]">Check the number and try again. Citation numbers (CIT-…) can be checked on the <Link href="/pay" className="font-semibold text-[#1d5fa7] underline">Pay & appeal</Link> page.</p></div>
        : <div className="rounded-3xl border border-[#dce6f1] bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#a87916]">{result.kind === 'incident' ? 'Violation report' : 'Service request'} · {result.ref}</p><h2 className="mt-1 text-2xl font-semibold">{result.category}</h2><p className="mt-1 text-sm text-[#708097]">{result.sub_city} sub-city · received {day(result.received)}</p></div>
            <span className={cn('rounded-full px-3 py-1 text-xs font-bold', ['Resolved', 'Closed'].includes(result.status) ? 'bg-[#eaf8f0] text-[#21804a]' : 'bg-[#edf3fa] text-[#082957]')}>{result.status}</span>
          </div>
          <ol className="mt-8 flex flex-col gap-0">{result.steps.map((s, i) => <li key={s.label} className="relative flex gap-4 pb-6 last:pb-0">
            {i < result.steps.length - 1 && <span className={cn('absolute left-[15px] top-8 h-[calc(100%-2rem)] w-0.5', s.done && result.steps[i + 1].done ? 'bg-[#21804a]' : 'bg-[#dfe7f0]')} />}
            <span className={cn('relative flex size-8 shrink-0 items-center justify-center rounded-full border-2', s.done ? 'border-[#21804a] bg-[#21804a] text-white' : 'border-[#dfe7f0] bg-white text-[#aab7c7]')}>{s.done ? <Check className="size-4" /> : <span className="size-2 rounded-full bg-current" />}</span>
            <div className="pt-1"><p className={cn('font-semibold', !s.done && 'text-[#8996a8]')}>{s.label}</p>{s.at && <p className="text-xs text-[#708097]">{day(s.at)}</p>}</div>
          </li>)}</ol>
          <p className="mt-6 border-t border-[#e5ebf2] pt-4 text-xs text-[#708097]">Last updated {day(result.updated)}. For privacy, details of the report and the people involved are not shown here.</p>
        </div>}
    </section>
  </>
}
