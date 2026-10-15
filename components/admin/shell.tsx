'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bell, BriefcaseBusiness, ChartColumnBig, ClipboardList, ExternalLink, Gavel, KeyRound, LayoutDashboard, LogOut, Mail, Map as MapIcon, MapPinned, Menu, Receipt, Search, Settings, ShieldCheck, Smartphone, UserCog, Users, X, type LucideIcon } from 'lucide-react'
import { logout } from '@/app/admin/actions'
import { Toaster } from '@/components/admin/forms'
import { cn } from '@/lib/utils'

type Counts = { new_incidents: number; escalated: number; open_services: number; unread: number; open_appeals: number }
type NavItem = { href: string; label: string; icon: LucideIcon; perm?: string | string[]; badge?: (c: Counts) => { value: number; urgent?: boolean } | null }

const groups: { label: string; items: NavItem[] }[] = [
  {
    label: 'Workspace',
    items: [
      { href: '/admin', label: 'Overview', icon: LayoutDashboard },
      { href: '/admin/incidents', label: 'Incident management', icon: ClipboardList, perm: 'incidents.view', badge: (c) => (c.escalated ? { value: c.escalated, urgent: true } : c.new_incidents ? { value: c.new_incidents } : null) },
      { href: '/admin/map', label: 'Live map', icon: MapIcon, perm: 'map.view' },
      { href: '/admin/districts', label: 'District performance', icon: MapPinned, perm: 'districts.view' },
      { href: '/admin/services', label: 'Service requests', icon: BriefcaseBusiness, perm: 'services.view', badge: (c) => (c.open_services ? { value: c.open_services } : null) },
      { href: '/admin/revenue', label: 'Citations & fines', icon: Receipt, perm: 'citations.view' },
      { href: '/admin/legal', label: 'Legal & appeals', icon: Gavel, perm: 'legal.view', badge: (c) => (c.open_appeals ? { value: c.open_appeals } : null) },
      { href: '/admin/team', label: 'Team workload', icon: Users, perm: 'team.view' },
      { href: '/admin/reports', label: 'Reports & exports', icon: ChartColumnBig, perm: 'reports.view' },
      { href: '/admin/email', label: 'Email center', icon: Mail, perm: ['email.send', 'email.broadcast'] },
      { href: '/admin/users', label: 'User management', icon: UserCog, perm: 'users.manage' },
      { href: '/admin/audit', label: 'Audit activity', icon: ShieldCheck, perm: 'audit.view' },
      { href: '/admin/notifications', label: 'Notifications', icon: Bell, perm: 'notifications.view', badge: (c) => (c.unread ? { value: c.unread, urgent: true } : null) },
      { href: '/admin/settings', label: 'Settings', icon: Settings },
    ],
  },
]

const isActive = (pathname: string, href: string) => (href === '/admin' ? pathname === '/admin' : pathname === href || pathname.startsWith(`${href}/`))

export function AdminShell({ children, staff, counts, orgName }: { children: ReactNode; staff: { name: string; role: string; email: string; permissions: string[]; must_change_password: boolean }; counts: Counts; orgName: string }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  useEffect(() => setOpen(false), [pathname])
  const allowed = (item: NavItem) => !item.perm || staff.role === 'Administrator' || [item.perm].flat().some((p) => staff.permissions.includes(p))
  const visibleGroups = groups.map((g) => ({ ...g, items: g.items.filter(allowed) }))
  const current = visibleGroups.flatMap((g) => g.items.map((i) => ({ ...i, group: g.label }))).find((i) => isActive(pathname, i.href))
  const initials = staff.name.split(/\s+/).map((n) => n[0]).slice(0, 2).join('').toUpperCase()

  return <div className="min-h-screen bg-[#f4f7fb] text-[#14233b]">
    <aside className={cn('fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col bg-[#082957] text-white transition-transform duration-200 lg:translate-x-0', open ? 'translate-x-0 shadow-2xl' : '-translate-x-full')}>
      <div className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-white/10 px-5">
        <Link href="/admin" className="flex min-w-0 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#e9bb52] text-[#082957]"><ShieldCheck className="size-5" /></span>
          <span className="min-w-0"><strong className="block text-sm tracking-wide">AACEA</strong><span className="block truncate text-[11px] text-[#9fb4cf]">{orgName}</span></span>
        </Link>
        <button className="rounded-lg p-1.5 text-[#c4d3e5] hover:bg-white/10 lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu"><X className="size-5" /></button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Admin navigation">
        {visibleGroups.map((group) => <div key={group.label} className="mb-5 last:mb-0">
          <p className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[#7f97b6]">{group.label}</p>
          <ul className="flex flex-col gap-1.5">
            {group.items.map(({ href, label, icon: Icon, badge }) => {
              const active = isActive(pathname, href)
              const b = badge?.(counts)
              return <li key={href}>
                <Link href={href} aria-current={active ? 'page' : undefined} className={cn('group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition', active ? 'bg-white/[0.12] text-white' : 'text-[#c4d3e5] hover:bg-white/[0.06] hover:text-white')}>
                  {active && <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-r bg-[#e9bb52]" />}
                  <Icon className={cn('size-[18px] shrink-0', active ? 'text-[#e9bb52]' : 'text-[#8fa6c4] group-hover:text-white')} />
                  <span className="flex-1 truncate">{label}</span>
                  {b && <span className={cn('min-w-5 rounded-full px-1.5 py-0.5 text-center text-[10px] font-bold', b.urgent ? 'bg-[#e5484d] text-white' : 'bg-white/15 text-white')}>{b.value > 99 ? '99+' : b.value}</span>}
                </Link>
              </li>
            })}
          </ul>
        </div>)}
      </nav>

      <div className="shrink-0 border-t border-white/10 p-3">
        {allowed({ href: '', label: '', icon: Smartphone, perm: 'field.use' }) && <Link href="/field" className="mb-1 flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium text-[#9fb4cf] hover:bg-white/[0.06] hover:text-white"><Smartphone className="size-4" />Open field app</Link>}
        <Link href="/" target="_blank" className="mb-2 flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium text-[#9fb4cf] hover:bg-white/[0.06] hover:text-white"><ExternalLink className="size-4" />View public portal</Link>
        <div className="flex items-center gap-3 rounded-lg bg-white/[0.06] p-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#e9bb52] text-xs font-bold text-[#082957]">{initials}</span>
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{staff.name}</span><span className="block truncate text-[11px] text-[#9fb4cf]">{staff.role}</span></span>
          <form action={logout}><button type="submit" title="Sign out" aria-label="Sign out" className="rounded-md p-2 text-[#9fb4cf] hover:bg-white/10 hover:text-white"><LogOut className="size-4" /></button></form>
        </div>
      </div>
    </aside>
    {open && <button className="fixed inset-0 z-40 bg-[#061a34]/50 lg:hidden" onClick={() => setOpen(false)} aria-label="Close navigation overlay" />}

    <div className="lg:pl-[260px]">
      <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-[#dfe7f0] bg-white/95 px-4 backdrop-blur sm:px-6">
        <button className="rounded-lg border border-[#dfe7f0] p-2 lg:hidden" onClick={() => setOpen(true)} aria-label="Open admin menu"><Menu className="size-5" /></button>
        <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-2 text-sm md:flex">
          <span className="text-[#8996a8]">{current?.group ?? 'Workspace'}</span><span className="text-[#c5cfdb]">/</span>
          <span className="truncate font-semibold">{current?.label ?? 'Overview'}</span>
        </nav>
        <div className="flex-1" />
        {allowed({ href: '', label: '', icon: Search, perm: 'incidents.view' }) && <form action="/admin/incidents" className="flex w-full max-w-xs items-center gap-2 rounded-lg border border-[#dfe7f0] bg-[#f7f9fc] px-3 py-2 focus-within:border-[#1d5fa7] focus-within:bg-white">
          <Search className="size-4 shrink-0 text-[#8996a8]" />
          <input name="q" placeholder="Search cases, IDs, places…" aria-label="Search incidents" className="w-full bg-transparent text-sm outline-none placeholder:text-[#8996a8]" />
        </form>}
        <Link href="/admin/notifications" aria-label={`Notifications (${counts.unread} unread)`} className="relative rounded-lg border border-[#dfe7f0] p-2.5 text-[#607089] hover:bg-[#f4f7fb]">
          <Bell className="size-4" />
          {counts.unread > 0 && <span className="absolute -right-1 -top-1 flex min-w-4 items-center justify-center rounded-full bg-[#e5484d] px-1 text-[10px] font-bold leading-4 text-white">{counts.unread > 9 ? '9+' : counts.unread}</span>}
        </Link>
      </header>
      {staff.must_change_password && pathname !== '/admin/settings' && <div className="flex flex-wrap items-center gap-3 border-b border-[#f2dfa6] bg-[#fff7df] px-4 py-3 text-sm text-[#7a5606] sm:px-6">
        <KeyRound className="size-4 shrink-0" /><span className="flex-1">You are using a temporary password. Please choose a new one now.</span>
        <Link href="/admin/settings#account" className="rounded-lg bg-[#082957] px-3 py-1.5 text-xs font-semibold text-white">Change password</Link>
      </div>}
      <main className="mx-auto max-w-[1400px] p-4 sm:p-6 lg:p-8">{children}</main>
      <Toaster />
    </div>
  </div>
}
