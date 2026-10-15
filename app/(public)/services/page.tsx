import Link from 'next/link'
import { ArrowRight, ClipboardCheck, Download, FileText, Megaphone, Store, Trees, Truck } from 'lucide-react'
import { PublicRequestForm } from '@/components/public-page'
import { container } from '@/components/public/nav'
import { PageHero } from '@/components/public/page-hero'
import { listPublicDocuments } from '@/lib/public'
import { cn } from '@/lib/utils'

export const metadata = { title: 'Services & guides' }

const services = [
  { icon: ClipboardCheck, title: 'Inspection request', text: 'Ask for a compliance inspection of a building, business, or site.' },
  { icon: FileText, title: 'Building permit review', text: 'Have a plan or permit checked against the building code before work starts.' },
  { icon: Store, title: 'Street vendor registration', text: 'Register to trade legally in designated vending areas.' },
  { icon: Trees, title: 'Public space booking', text: 'Book a public space for a market, event, or community activity.' },
  { icon: Truck, title: 'Waste collection', text: 'Request bulk or special waste collection for your neighbourhood.' },
  { icon: Megaphone, title: 'Awareness sessions', text: 'Training for merchants, institutions, and community groups on city rules.' },
]

const size = (b: number) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`)

export default async function ServicesPage() {
  const documents = await listPublicDocuments()
  return <>
    <PageHero eyebrow="Public services" title="Services & guides" intro="Request a municipal service online, download official guides, and connect with the team responsible for your neighbourhood." />
    <section className={cn(container, 'py-12 sm:py-16')}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{services.map(({ icon: Icon, title, text }) => <article key={title} className="rounded-2xl border border-[#e0e7f0] bg-white p-5 shadow-sm"><span className="flex size-11 items-center justify-center rounded-xl bg-[#edf3fa] text-[#082957]"><Icon className="size-5" /></span><h2 className="mt-4 font-semibold">{title}</h2><p className="mt-1 text-sm leading-6 text-[#708097]">{text}</p></article>)}</div>

      <div id="guides" className="mt-14 scroll-mt-24 rounded-3xl border border-[#dce6f1] bg-white p-6 sm:p-9">
        <h2 className="text-2xl font-semibold">Regulations & guides</h2>
        {documents.length === 0 ? <p className="mt-3 text-sm text-[#708097]">Guides will be published here soon. For a copy of a regulation, <Link href="/contact" className="font-semibold text-[#1d5fa7] underline">contact us</Link>.</p>
          : <ul className="mt-5 grid gap-3 md:grid-cols-2">{documents.map((d) => <li key={d.id}><a href={`/documents/${d.id}`} target="_blank" rel="noreferrer" className="flex items-start gap-3 rounded-2xl bg-[#f1f5fa] p-4 transition hover:bg-[#e6eef7]">
            <FileText className="mt-0.5 size-5 shrink-0 text-[#a87916]" /><span className="min-w-0 flex-1"><span className="block font-semibold">{d.title}</span>{d.description && <span className="mt-0.5 block text-sm text-[#708097]">{d.description}</span>}<span className="mt-1 block text-xs text-[#8996a8]">{d.mime === 'application/pdf' ? 'PDF' : 'Document'} · {size(Number(d.size_bytes))}</span></span><Download className="size-4 shrink-0 text-[#082957]" /></a></li>)}</ul>}
      </div>

      <div id="request" className="mt-14 grid scroll-mt-24 gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div><h2 className="text-2xl font-semibold">Request a service</h2><p className="mt-2 mb-6 text-sm leading-6 text-[#708097]">You&apos;ll get a reference number to follow your request on the Track page.</p><PublicRequestForm kind="service" /></div>
        <aside className="h-fit rounded-3xl bg-[#082957] p-6 text-white"><h3 className="font-semibold">Reporting a violation instead?</h3><p className="mt-2 text-sm leading-6 text-[#c4d3e5]">Use the complaint form for illegal construction, dumping, blocked sidewalks, or occupation of public land.</p>
          <Link href="/complaint" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#e9bb52] px-4 py-2.5 text-sm font-bold text-[#082957]">Report a violation<ArrowRight className="size-4" /></Link></aside>
      </div>
    </section>
  </>
}
