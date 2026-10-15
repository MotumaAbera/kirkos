import { container } from '@/components/public/nav'
import { PageHero } from '@/components/public/page-hero'
import { PayPortal } from '@/components/public-pay'
import { cn } from '@/lib/utils'

export const metadata = { title: 'Pay or appeal a citation' }

export default async function PayPage({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const { ref } = await searchParams
  return <>
    <PageHero eyebrow="Fines & payments" title="Pay or appeal a citation" intro="Check your balance, see your payment plan, pay, or appeal a citation you believe is wrong." />
    <section className={cn(container, 'max-w-3xl py-12 sm:py-16')}><PayPortal defaultRef={ref} /></section>
  </>
}
