import Link from 'next/link'
import { ArrowRight, Building2, Handshake, Landmark, Scale, ShieldCheck, Trash2, Users } from 'lucide-react'
import { container } from '@/components/public/nav'
import { PageHero } from '@/components/public/page-hero'
import { SUB_CITIES } from '@/lib/constants'
import { getPublicStats } from '@/lib/public'
import { cn } from '@/lib/utils'

export const metadata = { title: 'About us' }

const areas = [
  { icon: Building2, title: 'Illegal construction control', text: 'Monitoring unauthorized developments, building beyond approved plans, and zoning violations.' },
  { icon: Landmark, title: 'Public land protection', text: 'Safeguarding public spaces, government land, and the city master plan from illegal occupation.' },
  { icon: Trash2, title: 'Urban cleanliness', text: 'Enforcing rules on waste dumping, sidewalk obstruction, and street trade.' },
  { icon: Handshake, title: 'Inter-agency cooperation', text: 'Working with the police, sub-city administrations, and sector offices on joint enforcement.' },
]
const values = [
  { icon: Scale, title: 'Fairness', text: 'Equal standards for residents, businesses, and developers — with a right to appeal every citation.' },
  { icon: ShieldCheck, title: 'Integrity', text: 'Impartial enforcement, evidence recorded at every step, and every staff action logged.' },
  { icon: Users, title: 'Accountability', text: 'Every report gets a reference number citizens can track until it is resolved.' },
]

export default async function AboutPage() {
  const stats = await getPublicStats()
  return <>
    <PageHero eyebrow="Institutional mandate" title="Who we are" intro="The Addis Ababa City Administration Code Enforcement Authority is the municipal regulatory body that maintains public order, legality, and building standards across the capital." />
    <section className={cn(container, 'py-12 sm:py-16')}>
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-3xl border border-[#dce6f1] bg-white p-6 sm:p-9"><h2 className="text-2xl font-semibold">What we enforce</h2>
          <div className="mt-6 grid gap-5 sm:grid-cols-2">{areas.map(({ icon: Icon, title, text }) => <div key={title} className="flex gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#edf3fa] text-[#082957]"><Icon className="size-5" /></span><p className="text-sm leading-6 text-[#708097]"><b className="block text-[#14233b]">{title}</b>{text}</p></div>)}</div>
        </div>
        <div className="rounded-3xl bg-[#082957] p-6 text-white sm:p-9"><h2 className="text-xl font-semibold">At a glance</h2>
          <dl className="mt-6 grid grid-cols-2 gap-4">
            <div><dt className="text-xs text-[#b9c9dd]">Sub-cities</dt><dd className="mt-1 text-3xl font-semibold">{SUB_CITIES.length}</dd></div>
            <div><dt className="text-xs text-[#b9c9dd]">Reports this year</dt><dd className="mt-1 text-3xl font-semibold">{stats.received_year}</dd></div>
            <div><dt className="text-xs text-[#b9c9dd]">Resolution rate</dt><dd className="mt-1 text-3xl font-semibold">{stats.resolution_rate === null ? '—' : `${stats.resolution_rate}%`}</dd></div>
            <div><dt className="text-xs text-[#b9c9dd]">Resolved this year</dt><dd className="mt-1 text-3xl font-semibold">{stats.resolved_year}</dd></div>
          </dl>
          <p className="mt-6 text-xs leading-5 text-[#b9c9dd]">Serving {SUB_CITIES.join(', ')}.</p>
        </div>
      </div>
      <h2 className="mt-14 text-2xl font-semibold">Our values</h2>
      <div className="mt-6 grid gap-5 md:grid-cols-3">{values.map(({ icon: Icon, title, text }) => <article key={title} className="rounded-3xl border border-[#e0e7f0] bg-white p-6 shadow-sm sm:p-7"><span className="flex size-11 items-center justify-center rounded-xl bg-[#edf3fa] text-[#082957]"><Icon className="size-5" /></span><h3 className="mt-5 text-lg font-semibold">{title}</h3><p className="mt-2 text-sm leading-7 text-[#708097]">{text}</p></article>)}</div>
      <div className="mt-12 flex flex-col gap-4 rounded-3xl bg-[#edf3fa] p-6 sm:flex-row sm:items-center sm:justify-between sm:p-10"><div><h2 className="text-2xl font-semibold">See something that breaks the rules?</h2><p className="mt-2 text-sm leading-6 text-[#708097]">Reports can be anonymous. Every report is reviewed by a local team.</p></div>
        <Link href="/complaint" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#082957] px-5 py-3 text-sm font-bold text-white">Report a violation<ArrowRight className="size-4" /></Link></div>
    </section>
  </>
}
