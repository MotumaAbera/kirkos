import Link from 'next/link'
import { ArrowRight, Download, MapPinned, X } from 'lucide-react'
import { Badge, EmptyState, FilterTabs, PageHeader, Panel, StatCard, initials, secondaryButton, timeAgo } from '@/components/admin/ui'
import { can, requirePermission } from '@/lib/auth'
import { SUB_CITIES } from '@/lib/constants'
import { districtHealth } from '@/lib/district-health'
import { getDistrictDetail, getDistrictPerformance, getSettings } from '@/lib/queries'
import { cn } from '@/lib/utils'

const PERIODS = [{ label: '7 days', value: '7' }, { label: '30 days', value: '30' }, { label: '90 days', value: '90' }, { label: '12 months', value: '365' }]

export default async function DistrictPerformancePage({ searchParams }: { searchParams: Promise<{ days?: string; district?: string }> }) {
  const me = await requirePermission('districts.view')
  const params = await searchParams
  const days = PERIODS.some((p) => p.value === params.days) ? Number(params.days) : 30
  const district = (SUB_CITIES as readonly string[]).includes(params.district ?? '') ? params.district! : null
  const settings = await getSettings()
  const [rows, detail] = await Promise.all([
    getDistrictPerformance(days, settings.response_target_hours, SUB_CITIES),
    district ? getDistrictDetail(district, days, settings.response_target_hours) : null,
  ])
  const totals = rows.reduce((t, r) => ({ received: t.received + r.received, resolved: t.resolved + r.resolved, open: t.open + r.open, overdue: t.overdue + r.overdue }), { received: 0, resolved: 0, open: 0, overdue: 0 })
  const critical = rows.filter((r) => districtHealth(r) === 'Critical')
  const ranked = rows.filter((r) => r.resolution_rate !== null).sort((a, b) => b.resolution_rate! - a.resolution_rate!)
  const maxOpen = Math.max(1, ...rows.map((r) => r.open))
  const selected = rows.find((r) => r.sub_city === district)
  const href = (extra: Record<string, string | undefined>) => `/admin/districts?${new URLSearchParams(Object.entries({ days: String(days), ...extra }).filter(([, v]) => v) as [string, string][])}`

  return <>
    <PageHeader eyebrow="Workspace" title="District performance" description={`How each of the ${SUB_CITIES.length} sub-cities is handling its caseload · last ${PERIODS.find((p) => Number(p.value) === days)?.label}.`}
      actions={can(me, 'reports.export') ? <a href={`/admin/districts/export?days=${days}`} className={secondaryButton}><Download className="size-4" />Export CSV</a> : undefined} />
    <FilterTabs basePath="/admin/districts" param="days" active={String(days)} params={{ district: district ?? undefined }} items={PERIODS} />

    <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Cases received" value={totals.received} note={`${totals.resolved} resolved in the same period`} />
      <StatCard label="Open citywide" value={totals.open} note={totals.overdue ? `${totals.overdue} past the ${settings.response_target_hours}h target` : 'None overdue'} tone={totals.overdue ? 'bad' : 'good'} />
      <StatCard label="Best resolution rate" value={ranked[0] ? `${ranked[0].resolution_rate}%` : '—'} note={ranked[0]?.sub_city ?? 'No cases in period'} tone="good" />
      <StatCard label="Districts needing action" value={critical.length} note={critical.length ? critical.map((c) => c.sub_city).join(', ') : 'All districts stable'} tone={critical.length ? 'bad' : 'good'} />
    </div>

    <Panel className="mt-6" title="District league table" description="Sorted by open caseload. Select a district for its breakdown." flush>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead className="border-b border-[#edf1f5] bg-[#f7f9fc] text-[11px] font-bold uppercase tracking-wider text-[#718096]">
            <tr><th className="px-5 py-3">Sub-city</th><th className="px-3 py-3">Health</th><th className="px-3 py-3 text-right">Received</th><th className="px-3 py-3 text-right">Resolved</th><th className="w-44 px-3 py-3">Open caseload</th><th className="px-3 py-3 text-right">Escalated</th><th className="px-3 py-3 text-right">Overdue</th><th className="px-3 py-3 text-right">Avg. time</th><th className="px-3 py-3 text-right">Rate</th><th className="px-3 py-3 text-right">Staff</th><th className="px-5 py-3" /></tr>
          </thead>
          <tbody className="divide-y divide-[#edf1f5]">
            {rows.map((r) => <tr key={r.sub_city} className={cn('hover:bg-[#f7f9fc]', r.sub_city === district && 'bg-[#f1f6fc]')}>
              <td className="px-5 py-3"><Link href={href({ district: r.sub_city })} className="flex items-center gap-2 font-semibold hover:text-[#1d5fa7]"><MapPinned className="size-4 text-[#a87916]" />{r.sub_city}</Link></td>
              <td className="px-3 py-3"><Badge>{districtHealth(r)}</Badge></td>
              <td className="px-3 py-3 text-right">{r.received}</td>
              <td className="px-3 py-3 text-right">{r.resolved}</td>
              <td className="px-3 py-3"><div className="flex items-center gap-2"><div className="h-1.5 flex-1 rounded-full bg-[#edf1f5]"><div className="h-1.5 rounded-full bg-[#1d5fa7]" style={{ width: `${(r.open / maxOpen) * 100}%` }} /></div><span className="w-6 text-right text-xs font-semibold">{r.open}</span></div></td>
              <td className={cn('px-3 py-3 text-right', r.escalated && 'font-bold text-[#b32d3d]')}>{r.escalated}</td>
              <td className={cn('px-3 py-3 text-right', r.overdue && 'font-bold text-[#b32d3d]')}>{r.overdue}</td>
              <td className="px-3 py-3 text-right text-xs">{r.avg_hours === null ? '—' : `${r.avg_hours}h`}</td>
              <td className="px-3 py-3 text-right text-xs font-semibold text-[#267448]">{r.resolution_rate === null ? '—' : `${r.resolution_rate}%`}</td>
              <td className={cn('px-3 py-3 text-right text-xs', !r.staff && 'text-[#9a6d08]')}>{r.staff || 'None'}</td>
              <td className="px-5 py-3 text-right"><Link href={`/admin/incidents?subCity=${encodeURIComponent(r.sub_city)}&status=Open`} className="text-xs font-semibold text-[#1d5fa7] hover:underline">Cases</Link></td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </Panel>

    {selected && detail && <section id="district" className="mt-6 rounded-xl border border-[#cfe0f2] bg-[#f7faff] p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <MapPinned className="size-5 text-[#a87916]" />
        <h2 className="text-lg font-bold">{selected.sub_city}</h2><Badge>{districtHealth(selected)}</Badge>
        <span className="text-xs text-[#718096]">{selected.open} open · {selected.open_services} open service requests · {selected.staff} staff based here</span>
        <Link href={href({})} className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-[#607089] hover:text-[#14233b]"><X className="size-3.5" />Close</Link>
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="8-week trend" description="Received vs resolved">
          <div className="flex h-36 items-end gap-2">{detail.weekly.map((w) => { const max = Math.max(1, ...detail.weekly.flatMap((x) => [x.received, x.resolved])); return <div key={w.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <div className="flex h-full w-full items-end justify-center gap-0.5"><div className="w-1/2 max-w-3 rounded-t bg-[#1d5fa7]" style={{ height: `${(w.received / max) * 100}%`, minHeight: w.received ? 3 : 0 }} /><div className="w-1/2 max-w-3 rounded-t bg-[#e9bb52]" style={{ height: `${(w.resolved / max) * 100}%`, minHeight: w.resolved ? 3 : 0 }} /></div>
            <span className="text-[9px] text-[#8996a8]">{w.label.split(' ')[1]}</span></div> })}</div>
        </Panel>
        <Panel title="Top issues" description="Categories reported in this period">
          {detail.categories.length === 0 ? <p className="text-sm text-[#718096]">No reports in this period.</p> : <ul className="flex flex-col gap-2.5">{detail.categories.slice(0, 5).map((c) => <li key={c.label} className="flex justify-between gap-3 text-sm"><span className="truncate">{c.label}</span><b>{c.count}</b></li>)}</ul>}
        </Panel>
        <Panel title="Field team" description="Staff based here or holding cases here">
          {detail.team.length === 0 ? <p className="text-sm text-[#9a6d08]">No staff assigned to this district. <Link href="/admin/team" className="font-semibold underline">Assign staff</Link></p> : <ul className="flex flex-col gap-2.5">{detail.team.map((t) => <li key={t.id} className="flex items-center gap-2.5 text-sm"><span className="flex size-7 items-center justify-center rounded-full bg-[#dce9f7] text-[10px] font-bold text-[#1d5fa7]">{initials(t.name)}</span><span className="min-w-0 flex-1 truncate">{t.name}<span className="block text-[11px] text-[#718096]">{t.role}</span></span><span className="text-xs font-semibold">{t.open} open</span></li>)}</ul>}
        </Panel>
      </div>
      <Panel className="mt-4" title="Open cases needing action" flush actions={<Link href={`/admin/incidents?subCity=${encodeURIComponent(selected.sub_city)}&status=Open`} className="text-xs font-semibold text-[#1d5fa7] hover:underline">All open cases</Link>}>
        {detail.cases.length === 0 ? <EmptyState title="No open cases" text="This district is fully up to date." /> : <ul className="divide-y divide-[#edf1f5]">{detail.cases.map((c) => <li key={c.id}><Link href={`/admin/incidents/${c.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-[#f7f9fc]">
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{c.title}</span><span className="text-xs text-[#718096]">{c.ref} · {c.woreda ?? '—'} · {c.assignee_name ?? 'Unassigned'}</span></span>
          {c.overdue && <Badge>Overdue</Badge>}<Badge>{c.status}</Badge><span className="hidden w-14 text-right text-xs text-[#8996a8] sm:block">{timeAgo(c.created_at)}</span><ArrowRight className="size-4 text-[#aab7c7]" />
        </Link></li>)}</ul>}
      </Panel>
    </section>}
  </>
}
