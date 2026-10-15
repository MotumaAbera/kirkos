import type { ReactNode } from 'react'
import { PublicFooter } from '@/components/public/footer'
import { PublicHeader } from '@/components/public/header'
import { getSettings } from '@/lib/queries'

/** One layout for every public page: the header and footer are rendered once and stay put during navigation. */
export default async function PublicLayout({ children }: { children: ReactNode }) {
  const settings = await getSettings()
  return <div className="flex min-h-dvh flex-col overflow-x-clip bg-[#f5f7fb] text-[#14233b]">
    <a href="#content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:shadow">Skip to content</a>
    <PublicHeader />
    <main id="content" className="flex-1">{children}</main>
    <PublicFooter settings={settings} />
  </div>
}
