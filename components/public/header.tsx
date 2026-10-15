'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowRight, LogIn, Menu, Search, X } from 'lucide-react'
import { PUBLIC_NAV, container } from '@/components/public/nav'
import { cn } from '@/lib/utils'

const isActive = (pathname: string, href: string) => (href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`) || (href === '/pay' && pathname.startsWith('/appeal')))

/** Fixed-height public header shared by every public page (rendered once by the (public) layout, so it never shifts). */
export function PublicHeader() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  useEffect(() => setOpen(false), [pathname])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.documentElement.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => { document.documentElement.style.overflow = ''; window.removeEventListener('keydown', onKey) }
  }, [open])

  return <header className="sticky top-0 z-50 border-b border-[#e1e7ef] bg-white/95 backdrop-blur-md">
    <div className={cn(container, 'flex h-[72px] items-center gap-4')}>
      <Link href="/" className="flex min-w-0 shrink-0 items-center gap-3" aria-label="AACEA home">
        <Image src="/logo-128.png" alt="Addis Ababa City Administration Code Enforcement Authority emblem" width={48} height={48} priority className="size-11 shrink-0 sm:size-12" />
        <span className="min-w-0 leading-tight">
          <span className="block text-[11px] font-bold uppercase tracking-[0.2em] text-[#082957]">AACEA</span>
          <span className="block max-w-[180px] truncate text-xs font-semibold text-[#607089] sm:max-w-none sm:text-sm">Code Enforcement Authority</span>
        </span>
      </Link>

      <nav aria-label="Main" className="ml-auto hidden items-center gap-0.5 lg:flex">
        {PUBLIC_NAV.map(({ href, label }) => {
          const active = isActive(pathname, href)
          return <Link key={href} href={href} aria-current={active ? 'page' : undefined}
            className={cn('relative rounded-lg px-3 py-2 text-sm font-semibold transition', active ? 'text-[#082957]' : 'text-[#607089] hover:bg-[#f4f7fb] hover:text-[#082957]')}>
            {label}{active && <span className="absolute inset-x-3 -bottom-[17px] h-[3px] rounded-t bg-[#e9bb52]" />}
          </Link>
        })}
      </nav>

      <Link href="/admin/login" className="ml-2 hidden shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-[#607089] hover:bg-[#f4f7fb] hover:text-[#082957] xl:inline-flex"><LogIn className="size-4" />Staff</Link>
      <Link href="/complaint" className="hidden shrink-0 items-center gap-1.5 rounded-xl bg-[#082957] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#0d3a78] sm:inline-flex lg:hidden xl:inline-flex">Report a violation<ArrowRight className="size-4" /></Link>

      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="mobile-menu" aria-label={open ? 'Close menu' : 'Open menu'}
        className="ml-auto flex size-11 shrink-0 items-center justify-center rounded-xl border border-[#dfe7f0] text-[#082957] sm:ml-0 lg:hidden">
        {open ? <X className="size-5" /> : <Menu className="size-5" />}
      </button>
    </div>

    {open && <>
      <button type="button" aria-label="Close menu" onClick={() => setOpen(false)} className="fixed inset-0 top-[72px] z-40 bg-[#061a34]/40 lg:hidden" />
      <div id="mobile-menu" className="absolute inset-x-0 top-[72px] z-50 max-h-[calc(100dvh-72px)] overflow-y-auto border-t border-[#e8edf3] bg-white shadow-xl lg:hidden">
        <nav aria-label="Main" className={cn(container, 'flex flex-col gap-1 py-3')}>
          {PUBLIC_NAV.map(({ href, label }) => {
            const active = isActive(pathname, href)
            return <Link key={href} href={href} aria-current={active ? 'page' : undefined}
              className={cn('flex items-center justify-between rounded-xl px-4 py-3.5 text-base font-semibold', active ? 'bg-[#edf3fa] text-[#082957]' : 'text-[#33445c] hover:bg-[#f4f7fb]')}>
              {label}{active && <span className="size-2 rounded-full bg-[#e9bb52]" />}
            </Link>
          })}
        </nav>
        <div className={cn(container, 'grid gap-2 border-t border-[#edf1f5] py-4 sm:grid-cols-3')}>
          <Link href="/complaint" className="flex items-center justify-center gap-2 rounded-xl bg-[#082957] px-4 py-3 text-sm font-bold text-white">Report a violation</Link>
          <Link href="/track" className="flex items-center justify-center gap-2 rounded-xl border border-[#dfe7f0] px-4 py-3 text-sm font-bold text-[#082957]"><Search className="size-4" />Track a case</Link>
          <Link href="/admin/login" className="flex items-center justify-center gap-2 rounded-xl border border-[#dfe7f0] px-4 py-3 text-sm font-semibold text-[#607089]"><LogIn className="size-4" />Staff sign in</Link>
        </div>
      </div>
    </>}
  </header>
}
