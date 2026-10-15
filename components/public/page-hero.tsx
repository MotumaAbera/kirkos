import type { ReactNode } from 'react'
import { container } from '@/components/public/nav'
import { cn } from '@/lib/utils'

/** Standard inner-page hero, identical height and alignment on every public page. */
export function PageHero({ eyebrow, title, intro, children }: { eyebrow: string; title: string; intro?: ReactNode; children?: ReactNode }) {
  return <section className="relative overflow-hidden bg-[#082957] text-white">
    <div className="absolute inset-0 opacity-25" style={{ backgroundImage: 'radial-gradient(circle at 85% 20%, #5b87ba 0, transparent 30%)' }} />
    <div className={cn(container, 'relative py-12 sm:py-16')}>
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#f4d889]">{eyebrow}</p>
      <h1 className="mt-3 max-w-3xl text-3xl font-semibold tracking-[-0.03em] sm:text-5xl">{title}</h1>
      {intro && <p className="mt-4 max-w-2xl text-base leading-7 text-[#c4d3e5] sm:text-lg sm:leading-8">{intro}</p>}
      {children}
    </div>
  </section>
}
