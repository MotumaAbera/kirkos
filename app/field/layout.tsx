import type { Metadata, Viewport } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { LayoutDashboard, ShieldCheck } from 'lucide-react'
import { Toaster } from '@/components/admin/forms'
import { can, requireStaff } from '@/lib/auth'

export const metadata: Metadata = { title: 'AACEA Field', manifest: '/field/manifest.webmanifest', appleWebApp: { capable: true, title: 'AACEA Field', statusBarStyle: 'black-translucent' } }
export const viewport: Viewport = { themeColor: '#082957', width: 'device-width', initialScale: 1, viewportFit: 'cover' }

export default async function FieldLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff()
  if (!can(staff, 'field.use')) redirect('/admin/denied?need=field.use')
  return <div className="min-h-screen bg-[#f4f7fb] text-[#14233b]">
    <header className="sticky top-0 z-30 flex items-center gap-3 bg-[#082957] px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-white">
      <Link href="/field" className="flex items-center gap-2"><span className="flex size-8 items-center justify-center rounded-lg bg-[#e9bb52] text-[#082957]"><ShieldCheck className="size-4" /></span><span className="text-sm font-bold">AACEA Field</span></Link>
      <span className="ml-auto truncate text-xs text-[#c4d3e5]">{staff.name}</span>
      <Link href="/admin" aria-label="Open the full workspace" className="rounded-lg p-2 text-[#c4d3e5] hover:bg-white/10"><LayoutDashboard className="size-4" /></Link>
    </header>
    <main className="mx-auto max-w-xl px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-4">{children}</main>
    <Toaster />
  </div>
}
