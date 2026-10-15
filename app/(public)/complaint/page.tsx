import Link from 'next/link'
import { ComplaintForm } from '@/components/public-page'
import { container } from '@/components/public/nav'
import { PageHero } from '@/components/public/page-hero'
import { SUB_CITIES } from '@/lib/constants'
import { cn } from '@/lib/utils'

export const metadata = { title: 'Report a violation' }

export default function ComplaintPage() {
  return <>
    <PageHero eyebrow="Complaint center" title="Report a municipal code violation" intro="Your report helps keep the city safe and fair. Reports can be anonymous and are handled securely by the right sub-city team." />
    <section className={cn(container, 'grid gap-8 py-12 sm:py-16 lg:grid-cols-[minmax(0,1fr)_300px]')}>
      <div className="min-w-0"><h2 className="text-2xl font-semibold">Submit your report</h2><p className="mt-2 mb-6 text-sm leading-6 text-[#708097]">Complete the fields below so the right local office can review and respond.</p><ComplaintForm /></div>
      <aside className="flex h-fit flex-col gap-4">
        <div className="rounded-3xl border border-[#dce6f1] bg-white p-6 shadow-sm"><p className="text-sm font-bold text-[#082957]">Before you submit</p>
          <ul className="mt-4 flex list-disc flex-col gap-3 pl-5 text-sm leading-6 text-[#64758c]"><li>Pin the location on the map or describe a clear landmark.</li><li>Describe what happened and when.</li><li>Photos help inspectors act faster.</li><li>Save your reference number to track progress.</li></ul></div>
        <div className="rounded-3xl bg-[#edf3fa] p-6"><p className="text-xs font-bold uppercase tracking-[0.14em] text-[#a87916]">Already reported?</p><p className="mt-2 text-sm leading-6 text-[#53677f]">Follow your case with its reference number.</p><Link href="/track" className="mt-3 inline-flex rounded-xl bg-[#082957] px-4 py-2.5 text-sm font-bold text-white">Track a case</Link></div>
        <p className="px-2 text-xs leading-5 text-[#8996a8]">Reports are routed across {SUB_CITIES.length} sub-city offices.</p>
      </aside>
    </section>
  </>
}
