import Link from 'next/link'
import { ArrowRight, Check, CircleAlert, Clock3, Download, Plus, TrendingUp, UserX, type LucideIcon } from 'lucide-react'
import { Badge, EmptyState, PageHeader, Panel, primaryButton, secondaryButton, timeAgo } from '@/components/admin/ui'
import { can, requireStaff } from '@/lib/auth'
import { SUB_CITIES } from '@/lib/constants'
import { getOverview, getOverviewMetrics, getSettings } from '@/lib/queries'
import { cn } from '@/lib/utils'

function KpiCard({ label, value, trend, tone, icon: Icon, href }: { label: string; value: string; trend: string; tone: 'good' | 'bad' | 'warn' | 'neutral'; icon: LucideIcon; href: string }) {
  return <Link href={href} className="rounded-xl border border-[#dfe7f0] bg-white p-5 shadow-sm transition hover:border-[#b7c9df] hover:shadow-md">
    <div className="flex items-center justify-between"><p className="text-xs font-semibold text-[#718096]">{label}</p><Icon className="size-4 text-[#a87916]" /></div>
    <p className="mt-3 text-3xl font-bold tracking-tight text-[#082957]">{value}</p>
    <p className={cn('mt-1.5 text-xs font-semibold', tone === 'good' ? 'text-[#267448]' : tone === 'bad' ? 'text-[#b32d3d]' : tone === 'warn' ? 'text-[#9a6d08]' : 'text-[#718096]')}>{trend}</p>
  </Link>
}

const signed = (n: number, suffix = '') => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(n)}${suffix}`

export default async function OverviewPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const staff = await requireStaff()
  const { range: rawRange } = await searchParams
  const range = rawRange === '30d' ? '30d' : '12m'
  const settings = await getSettings()
  const target = settings.response_target_hours
  const [{ kpi, volume, districtSla }, { recent, attention }] = await Promise.all([getOverviewMetrics(target, range), getOverview(target)])

  const monthChange = kpi.last_month ? Math.round(((kpi.this_month - kpi.last_month) / kpi.last_month) * 1000) / 10 : null
  const slaChange = kpi.sla_rate !== null && kpi.sla_rate_last !== null ? Math.round((kpi.sla_rate - kpi.sla_rate_last) * 10) / 10 : null
  const avgChange = kpi.avg_hours !== null && kpi.avg_hours_last !== null ? Math.round((kpi.avg_hours - kpi.avg_hours_last) * 10) / 10 : null
  const maxVolume = Math.max(1, ...volume.map((v) => v.count))
  const hour = new Date().getHours()

  return <>
    <PageHeader eyebrow="Administration · citywide command center" title="Overview"
      description={`Good ${hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'}, ${staff.name.split(' ')[0]}. A clear view of service performance across all ${SUB_CITIES.length} sub-cities.`}
      actions={<>
        {can(staff, 'reports.export') && can(staff, 'reports.view') && <a href="/admin/reports/export?days=30" className={secondaryButton}><Download className="size-4" />Export report</a>}
        {can(staff, 'incidents.create') && <Link href="/admin/incidents?new=1" className={primaryButton}><Plus className="size-4" />Log incident</Link>}
      </>} />

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard label="Total incidents" value={kpi.total.toLocaleString('en-US')} icon={TrendingUp} href="/admin/incidents?status=All"
        trend={monthChange === null ? `${kpi.this_month} received this month` : `${signed(monthChange, '%')} this month vs last`} tone={monthChange === null ? 'neutral' : monthChange > 0 ? 'warn' : 'good'} />
      <KpiCard label="Within SLA" value={kpi.sla_rate === null ? '—' : `${kpi.sla_rate}%`} icon={Check} href="/admin/districts"
        trend={slaChange === null ? `Resolved within ${target}h` : `${signed(slaChange, ' pts')} vs last month`} tone={slaChange === null ? 'neutral' : slaChange >= 0 ? 'good' : 'bad'} />
      <KpiCard label="Escalated critical" value={String(kpi.escalated)} icon={CircleAlert} href="/admin/incidents?status=Escalated"
        trend={kpi.escalated ? 'Needs review' : 'Nothing escalated'} tone={kpi.escalated ? 'bad' : 'good'} />
      <KpiCard label="Avg. resolution" value={kpi.avg_hours === null ? '—' : `${kpi.avg_hours}h`} icon={Clock3} href="/admin/reports"
        trend={avgChange === null ? (kpi.avg_hours === null ? 'No cases resolved this month' : 'This month') : `${signed(avgChange, 'h')} this month`} tone={avgChange === null ? 'neutral' : avgChange <= 0 ? 'good' : 'warn'} />
    </div>

    <div className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_.65fr]">
      <Panel title="Reports received" description={range === '12m' ? 'Monthly volume across the city' : 'Daily volume across the city'}
        actions={<div className="flex gap-1 rounded-lg bg-[#edf1f5] p-1">{([['12m', 'Last 12 months'], ['30d', 'Last 30 days']] as const).map(([value, label]) =>
          <Link key={value} href={value === '12m' ? '/admin' : '/admin?range=30d'} scroll={false} className={cn('rounded-md px-2.5 py-1 text-xs font-semibold', range === value ? 'bg-white text-[#082957] shadow-sm' : 'text-[#607089] hover:text-[#14233b]')}>{label}</Link>)}</div>}>
        <div className={cn('flex h-48 items-end', range === '12m' ? 'gap-2 sm:gap-3' : 'gap-0.5 sm:gap-1')}>
          {volume.map((v) => <div key={v.full} className="group flex h-full flex-1 flex-col items-center justify-end gap-2">
            <span className="text-[10px] font-semibold text-[#718096] opacity-0 transition group-hover:opacity-100">{v.count}</span>
            <div title={`${v.full}: ${v.count} reports`} className="w-full rounded-t-md bg-[#1d5fa7] transition group-hover:bg-[#0d3a78]" style={{ height: `${(v.count / maxVolume) * 100}%`, minHeight: v.count ? 4 : 2, opacity: v.count ? 1 : 0.25 }} />
            <span className={cn('text-[10px] text-[#8996a8]', range === '30d' && 'hidden sm:block')}>{v.label}</span>
          </div>)}
        </div>
      </Panel>

      <Panel title="District performance" description={`Resolved within SLA (${target}h)`} actions={<Link href="/admin/districts" className="text-xs font-semibold text-[#1d5fa7] hover:underline">All districts</Link>}>
        {districtSla.length === 0 ? <EmptyState title="No resolved cases yet" /> : <div className="flex flex-col gap-4">{districtSla.map((d) => <Link key={d.sub_city} href={`/admin/districts?district=${encodeURIComponent(d.sub_city)}`} className="group block">
          <div className="mb-1.5 flex justify-between text-xs font-semibold"><span className="group-hover:text-[#1d5fa7]">{d.sub_city}</span><span className="text-[#718096]">{d.rate}%</span></div>
          <div className="h-2 rounded-full bg-[#edf1f5]"><div className={cn('h-2 rounded-full', d.rate >= 80 ? 'bg-[#1d5fa7]' : d.rate >= 50 ? 'bg-[#e9bb52]' : 'bg-[#b32d3d]')} style={{ width: `${Math.max(d.rate, 2)}%` }} /></div>
        </Link>)}</div>}
      </Panel>
    </div>

    <div className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_.65fr]">
      <Panel title="Recent incidents" description="Newest reports first" flush actions={<Link href="/admin/incidents" className="text-xs font-semibold text-[#1d5fa7] hover:underline">Incident management</Link>}>
        {recent.length === 0 ? <EmptyState title="No incidents yet" text="Reports submitted on the public portal will appear here." /> :
          <ul className="divide-y divide-[#edf1f5]">{recent.map((item) => <li key={item.id}>
            <Link href={`/admin/incidents/${item.id}`} className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-[#f7f9fc]">
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{item.title}</p><p className="mt-0.5 truncate text-xs text-[#718096]">{item.ref} · {item.sub_city}{item.woreda ? ` · ${item.woreda}` : ''} · {item.assignee_name ?? 'Unassigned'}</p></div>
              {item.overdue && <Badge>Overdue</Badge>}<Badge>{item.status}</Badge>
              <span className="hidden w-16 text-right text-xs text-[#8996a8] sm:block">{timeAgo(item.created_at)}</span>
            </Link>
          </li>)}</ul>}
      </Panel>

      <Panel title="Needs attention">
        <div className="flex flex-col gap-2">
          {[
            { label: 'Escalated cases', value: attention.escalated, href: '/admin/incidents?status=Escalated', icon: CircleAlert, tone: 'text-[#b32d3d] bg-[#fff0f1]' },
            { label: 'Unassigned open cases', value: attention.unassigned, href: '/admin/incidents?assignee=unassigned&status=Open', icon: UserX, tone: 'text-[#9a6d08] bg-[#fff7df]' },
            { label: 'Service requests due soon', value: attention.due_services, href: '/admin/services?status=Open', icon: Clock3, tone: 'text-[#1d5fa7] bg-[#edf3fa]' },
          ].map(({ label, value, href, icon: Icon, tone }) => <Link key={label} href={href} className="flex items-center gap-3 rounded-lg border border-[#edf1f5] p-3 transition hover:border-[#b7c9df] hover:bg-[#f7f9fc]">
            <span className={`flex size-9 items-center justify-center rounded-lg ${tone}`}><Icon className="size-4" /></span>
            <span className="flex-1 text-sm font-semibold">{label}</span>
            <span className="text-lg font-bold">{value}</span><ArrowRight className="size-4 text-[#aab7c7]" />
          </Link>)}
        </div>
      </Panel>
    </div>
  </>
}
