import Image from 'next/image'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowRight, ClipboardCheck, CreditCard, FileSearch, FileWarning, Gavel, HandHelping, Search } from 'lucide-react'
import { container } from '@/components/public/nav'
import { SUB_CITIES } from '@/lib/constants'
import { getPublicStats } from '@/lib/public'
import { getSettings } from '@/lib/queries'
import { cn } from '@/lib/utils'

const services = [
  { href: '/complaint', icon: FileWarning, title: 'Report a violation', text: 'Illegal construction, land occupation, dumping, vending, or blocked sidewalks.' },
  { href: '/track', icon: FileSearch, title: 'Track a case', text: 'Check the status of a report or service request with your reference number.' },
  { href: '/pay', icon: CreditCard, title: 'Pay a fine', text: 'See your citation balance and payment plan, and how to pay.' },
  { href: '/appeal', icon: Gavel, title: 'Appeal a citation', text: 'Believe a citation is wrong? Appeal online within the appeal window.' },
  { href: '/services#request', icon: ClipboardCheck, title: 'Request a service', text: 'Inspections, permit reviews, vendor registration, public space booking.' },
  { href: '/contact', icon: HandHelping, title: 'Get support', text: 'Ask a question or reach the citizen support desk.' },
]

const steps = [
  ['Report', 'Describe the problem, pin it on the map, and add photos. Anonymous reports are accepted.'],
  ['Review', 'Your report is routed to the right sub-city team and assigned to an inspector.'],
  ['Inspect', 'An inspector visits the site, records evidence, and takes enforcement action.'],
  ['Resolve', 'Follow every step with your reference number until the case is closed.'],
]

export default async function HomePage({ searchParams }: { searchParams: Promise<{ staff?: string }> }) {
  // Old staff links (/?staff=login, /?staff=dashboard) open the real admin workspace.
  const { staff } = await searchParams
  if (staff === 'login' || staff === 'dashboard') redirect(staff === 'login' ? '/admin/login' : '/admin')
  const [stats, settings] = await Promise.all([getPublicStats(), getSettings()])

  return <>
    <section className="relative overflow-hidden bg-[#082957] text-white">
      <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'radial-gradient(circle at 78% 30%, #5b87ba 0, transparent 32%), linear-gradient(120deg, transparent 62%, #174c83 62%, #174c83 63%, transparent 63%)' }} />
      <div className={cn(container, 'relative grid items-center gap-10 py-14 sm:py-20 lg:grid-cols-[1.15fr_.85fr]')}>
        <div>
          <h1 className="max-w-2xl text-4xl font-semibold leading-[1.05] tracking-[-0.04em] sm:text-6xl">Report civic issues.<br />See real action.</h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-[#c4d3e5] sm:text-lg">A simple, transparent way to report violations and help keep Addis Ababa safe, clean, and compliant — then follow your case to resolution.</p>
          <form action="/track" className="mt-8 flex w-full max-w-xl flex-col gap-2 rounded-2xl bg-white p-2 shadow-2xl sm:flex-row sm:items-center">
            <label className="flex min-w-0 flex-1 items-center"><span className="sr-only">Reference number</span><Search className="ml-3 size-5 shrink-0 text-[#8c9aab]" />
              <input name="ref" required className="w-full min-w-0 bg-transparent px-3 py-3 text-base text-[#14233b] outline-none sm:text-sm" placeholder="Track a case, e.g. AACEA-24101" autoCapitalize="characters" /></label>
            <button className="shrink-0 rounded-xl bg-[#e9bb52] px-5 py-3 text-sm font-bold text-[#082957] hover:bg-[#f4cd70]">Track case</button>
          </form>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/complaint" className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-semibold hover:bg-white/15">Report a violation<ArrowRight className="size-4" /></Link>
            <Link href="/pay" className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-[#c4d3e5] hover:text-white">Pay or appeal a fine</Link>
          </div>
        </div>
        <div className="hidden justify-center lg:flex"><div className="relative size-[300px] rounded-full border border-white/15 bg-white/[0.06] p-7">
          <Image src="/logo-256.png" alt="AACEA emblem" width={256} height={256} priority className="size-full rounded-full bg-white/95 p-2 shadow-2xl" />
          <div className="absolute -right-10 top-6 rounded-2xl border border-white/10 bg-[#0b3366]/90 p-4 backdrop-blur"><p className="text-xs text-[#b9c9dd]">Sub-cities served</p><p className="mt-1 text-2xl font-semibold">{SUB_CITIES.length}</p></div>
          <div className="absolute -bottom-2 -left-12 rounded-2xl border border-white/10 bg-[#0b3366]/90 p-4 backdrop-blur"><p className="text-xs text-[#b9c9dd]">Response target</p><p className="mt-1 text-2xl font-semibold">{settings.response_target_hours} hrs</p></div>
        </div></div>
      </div>
    </section>

    <section className={cn(container, 'py-14 sm:py-16')}>
      <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#a87916]">Citizen services</p><h2 className="mt-2 text-3xl font-semibold tracking-tight">How can we help today?</h2></div>
        <Link href="/services" className="flex items-center gap-2 text-sm font-bold text-[#082957]">All services<ArrowRight className="size-4" /></Link></div>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{services.map(({ href, icon: Icon, title, text }) => <Link key={href} href={href} className="group rounded-2xl border border-[#e0e7f0] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[#b7c9df] hover:shadow-md">
        <div className="flex items-start justify-between"><span className="flex size-11 items-center justify-center rounded-xl bg-[#edf3fa] text-[#082957]"><Icon className="size-5" /></span><ArrowRight className="size-4 text-[#a2afbf] transition group-hover:translate-x-1 group-hover:text-[#082957]" /></div>
        <h3 className="mt-5 font-semibold">{title}</h3><p className="mt-1 text-sm leading-6 text-[#708097]">{text}</p></Link>)}</div>
    </section>

    <section className="bg-white"><div className={cn(container, 'grid gap-10 py-14 sm:py-16 lg:grid-cols-[.9fr_1.1fr]')}>
      <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#a87916]">Transparency</p><h2 className="mt-2 text-3xl font-semibold tracking-tight">Live service performance</h2>
        <p className="mt-3 max-w-md text-sm leading-7 text-[#708097]">These figures come straight from our case system and update as reports are handled.</p>
        <dl className="mt-8 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-[#f4f7fb] p-5"><dt className="text-xs font-semibold text-[#708097]">Reports this year</dt><dd className="mt-2 text-3xl font-semibold text-[#082957]">{stats.received_year.toLocaleString('en-US')}</dd></div>
          <div className="rounded-2xl bg-[#f4f7fb] p-5"><dt className="text-xs font-semibold text-[#708097]">Resolved this year</dt><dd className="mt-2 text-3xl font-semibold text-[#082957]">{stats.resolved_year.toLocaleString('en-US')}</dd></div>
          <div className="rounded-2xl bg-[#f4f7fb] p-5"><dt className="text-xs font-semibold text-[#708097]">Resolution rate</dt><dd className="mt-2 text-3xl font-semibold text-[#082957]">{stats.resolution_rate === null ? '—' : `${stats.resolution_rate}%`}</dd></div>
          <div className="rounded-2xl bg-[#f4f7fb] p-5"><dt className="text-xs font-semibold text-[#708097]">Avg. time to resolve</dt><dd className="mt-2 text-3xl font-semibold text-[#082957]">{stats.avg_hours === null ? '—' : stats.avg_hours < 48 ? `${stats.avg_hours} h` : `${Math.round(stats.avg_hours / 24)} days`}</dd></div>
        </dl>
      </div>
      <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#a87916]">How it works</p><h2 className="mt-2 text-3xl font-semibold tracking-tight">From report to resolution</h2>
        <ol className="mt-8 grid gap-4 sm:grid-cols-2">{steps.map(([t, d], i) => <li key={t} className="rounded-2xl border border-[#e0e7f0] p-5"><span className="flex size-9 items-center justify-center rounded-full bg-[#082957] text-sm font-bold text-[#e9bb52]">{i + 1}</span><h3 className="mt-4 font-semibold">{t}</h3><p className="mt-1 text-sm leading-6 text-[#708097]">{d}</p></li>)}</ol>
      </div>
    </div></section>

    <section className={cn(container, 'py-14 sm:py-16')}>
      <div className="grid gap-6 md:grid-cols-3">
        <div className="rounded-3xl bg-[#082957] p-7 text-white md:col-span-2 md:p-10"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#f4d889]">Need assistance?</p><h2 className="mt-2 text-3xl font-semibold">We are here to help.</h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-[#c4d3e5]">For urgent civic concerns, general questions, or help with your case, reach the citizen support desk.</p>
          <div className="mt-6 flex flex-wrap gap-3"><a href={`tel:${settings.public_phone.replace(/\s/g, '')}`} className="rounded-xl bg-[#e9bb52] px-4 py-3 text-sm font-bold text-[#082957]">Call {settings.public_phone}</a><Link href="/contact" className="rounded-xl border border-white/20 px-4 py-3 text-sm font-semibold text-white">Send a message</Link></div></div>
        <div className="rounded-3xl border border-[#e0e7f0] bg-white p-7 shadow-sm"><h3 className="font-semibold">Service center</h3><p className="mt-3 text-sm leading-6 text-[#708097]">{settings.public_address}<br />{settings.office_hours}</p><Link href="/contact" className="mt-5 inline-flex items-center gap-1 text-sm font-bold text-[#082957]">Directions & contacts<ArrowRight className="size-4" /></Link></div>
      </div>
    </section>
  </>
}
