import { container } from '@/components/public/nav'
import { PageHero } from '@/components/public/page-hero'
import { AppealForm } from '@/components/public-pay'
import { getSettings } from '@/lib/queries'
import { cn } from '@/lib/utils'

export const metadata = { title: 'Appeal a citation' }

export default async function AppealPage({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const [{ ref }, settings] = await Promise.all([searchParams, getSettings()])
  return <>
    <PageHero eyebrow="Appeals" title="Appeal a citation" intro={`You may appeal within ${settings.appeal_window_days} days of the date your citation was issued. Payment is paused while your appeal is reviewed, and you may be invited to a hearing.`} />
    <section className={cn(container, 'max-w-3xl py-12 sm:py-16')}><AppealForm defaultRef={ref} /></section>
  </>
}
