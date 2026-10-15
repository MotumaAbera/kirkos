import { Clock3, Mail, MapPin, Navigation, Phone } from 'lucide-react'
import { PublicRequestForm } from '@/components/public-page'
import { container } from '@/components/public/nav'
import { PageHero } from '@/components/public/page-hero'
import { getSettings } from '@/lib/queries'
import { cn } from '@/lib/utils'

export const metadata = { title: 'Contact us' }

export default async function ContactPage() {
  const s = await getSettings()
  const items = [
    { icon: Phone, label: 'Phone', value: s.public_phone, href: `tel:${s.public_phone.replace(/\s/g, '')}` },
    { icon: Mail, label: 'Email', value: s.public_email, href: `mailto:${s.public_email}` },
    { icon: MapPin, label: 'Visit', value: s.public_address, href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.public_address)}` },
    { icon: Clock3, label: 'Office hours', value: s.office_hours },
  ]
  return <>
    <PageHero eyebrow="Citizen support desk" title="We are here to help" intro="Questions about a case, a permit, or city rules? Send us a message and we'll reply with a reference number you can track." />
    <section className={cn(container, 'py-12 sm:py-16')}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{items.map(({ icon: Icon, label, value, href }) => {
        const body = <><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#edf3fa] text-[#a87916]"><Icon className="size-5" /></span><span className="min-w-0"><span className="block text-xs font-semibold text-[#708097]">{label}</span><span className="mt-0.5 block break-words text-sm font-semibold">{value}</span></span></>
        return href ? <a key={label} href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer" className="flex gap-3 rounded-2xl border border-[#e0e7f0] bg-white p-5 shadow-sm transition hover:border-[#b7c9df]">{body}</a> : <div key={label} className="flex gap-3 rounded-2xl border border-[#e0e7f0] bg-white p-5 shadow-sm">{body}</div>
      })}</div>
      <div className="mt-12 grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div><h2 className="text-2xl font-semibold">Send us a message</h2><p className="mt-2 mb-6 text-sm leading-6 text-[#708097]">Messages go straight to the support team.</p><PublicRequestForm kind="contact" /></div>
        <aside className="h-fit rounded-3xl border border-[#dce6f1] bg-white p-6 shadow-sm"><h3 className="font-semibold">Urgent or in person?</h3><p className="mt-2 text-sm leading-6 text-[#708097]">Call the support desk during office hours, or visit us. Each of the city&apos;s sub-cities also has a local enforcement office.</p>
          <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.public_address)}`} target="_blank" rel="noreferrer" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#082957] px-4 py-2.5 text-sm font-bold text-white"><Navigation className="size-4" />Get directions</a></aside>
      </div>
    </section>
  </>
}
