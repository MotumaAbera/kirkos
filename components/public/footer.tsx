import Image from 'next/image'
import Link from 'next/link'
import { Clock3, Mail, MapPin, Phone } from 'lucide-react'
import { container } from '@/components/public/nav'
import type { Settings } from '@/lib/queries'
import { cn } from '@/lib/utils'

const columns = [
  { title: 'Citizen services', links: [['/complaint', 'Report a violation'], ['/track', 'Track a case or request'], ['/pay', 'Pay a fine'], ['/appeal', 'Appeal a citation'], ['/services#request', 'Request a service']] },
  { title: 'The authority', links: [['/about', 'About us'], ['/services', 'Services & guides'], ['/contact', 'Contact us'], ['/admin/login', 'Staff sign in']] },
] as const

export function PublicFooter({ settings }: { settings: Settings }) {
  return <footer className="mt-auto bg-[#071f43] text-white">
    <div className={cn(container, 'grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.2fr]')}>
      <div>
        <div className="flex items-center gap-3"><Image src="/logo-128.png" alt="" width={56} height={56} className="size-14 rounded-full bg-white/95 p-0.5" /><div><p className="text-xs font-bold tracking-[0.2em] text-[#f4d889]">AACEA</p><p className="font-semibold leading-tight">{settings.org_name}</p></div></div>
        <p className="mt-4 max-w-sm text-sm leading-7 text-[#b9c9dc]">Protecting public land, supporting safe neighbourhoods, and keeping municipal standards visible to everyone.</p>
      </div>
      {columns.map((c) => <div key={c.title}><p className="text-sm font-bold">{c.title}</p><ul className="mt-4 flex flex-col gap-2.5 text-sm text-[#b9c9dc]">{c.links.map(([href, label]) => <li key={href}><Link href={href} className="hover:text-white">{label}</Link></li>)}</ul></div>)}
      <div><p className="text-sm font-bold">Citizen support</p>
        <ul className="mt-4 flex flex-col gap-3 text-sm text-[#b9c9dc]">
          <li className="flex gap-2.5"><Phone className="mt-0.5 size-4 shrink-0 text-[#e9bb52]" /><a href={`tel:${settings.public_phone.replace(/\s/g, '')}`} className="hover:text-white">{settings.public_phone}</a></li>
          <li className="flex gap-2.5"><Mail className="mt-0.5 size-4 shrink-0 text-[#e9bb52]" /><a href={`mailto:${settings.public_email}`} className="break-all hover:text-white">{settings.public_email}</a></li>
          <li className="flex gap-2.5"><MapPin className="mt-0.5 size-4 shrink-0 text-[#e9bb52]" />{settings.public_address}</li>
          <li className="flex gap-2.5"><Clock3 className="mt-0.5 size-4 shrink-0 text-[#e9bb52]" />{settings.office_hours}</li>
        </ul>
      </div>
    </div>
    <div className="border-t border-white/10"><p className={cn(container, 'py-5 text-xs text-[#91a7c2]')}>© {new Date().getFullYear()} {settings.org_name}. Official public portal.</p></div>
  </footer>
}
