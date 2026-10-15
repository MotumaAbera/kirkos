import { OperationsMap, type MapCase, type MapOfficer } from '@/components/map/operations-map'
import { FilterTabs, PageHeader, StatCard, inputClass, secondaryButton, timeAgo } from '@/components/admin/ui'
import { can, requirePermission } from '@/lib/auth'
import { INCIDENT_CATEGORIES } from '@/lib/constants'
import { getMapIncidents, getOfficerLocations } from '@/lib/enforcement'
import { getSettings } from '@/lib/queries'
import { cn } from '@/lib/utils'

export default async function LiveMapPage({ searchParams }: { searchParams: Promise<{ status?: string; days?: string; category?: string }> }) {
  const me = await requirePermission('map.view')
  const params = await searchParams
  const status = params.status || 'Open'
  const days = ['30', '90', '365'].includes(params.days ?? '') ? Number(params.days) : undefined
  const settings = await getSettings()
  const [incidents, officers] = await Promise.all([
    getMapIncidents({ status, days, category: params.category || undefined }, settings.response_target_hours),
    getOfficerLocations(),
  ])
  const cases: MapCase[] = incidents.map((i) => ({
    id: i.id, ref: i.ref, title: i.title, category: i.category, status: i.status, priority: i.priority, sub_city: i.sub_city, lat: i.lat, lng: i.lng,
    approximate: (i.location_source ?? '').startsWith('Approximate'), assignee_name: i.assignee_name, overdue: i.overdue, age: timeAgo(i.created_at),
  }))
  const now = Date.now()
  const team: MapOfficer[] = officers.map((o) => ({ ...o, minutes_ago: Math.round((now - new Date(o.updated_at).getTime()) / 60000) }))
  const onShift = team.filter((o) => o.on_duty && o.minutes_ago <= 15).length
  const counts = cases.reduce<Record<string, number>>((acc, c) => { if (c.status !== 'Resolved') acc[c.sub_city] = (acc[c.sub_city] ?? 0) + 1; return acc }, {})
  const hotspot = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]

  return <>
    <PageHeader eyebrow="Workspace" title="Live map" description="Where cases are, where violations cluster, and which officers are nearest. Officer positions refresh every 30 seconds." />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Cases on map" value={cases.length} note={`${cases.filter((c) => c.approximate).length} with approximate location`} />
      <StatCard label="Officers on shift" value={onShift} note={`${team.length - onShift} recently seen, not live`} tone={onShift ? 'good' : 'warn'} />
      <StatCard label="Busiest area" value={hotspot?.[0] ?? '—'} note={hotspot ? `${hotspot[1]} open case(s)` : 'No open cases'} />
      <StatCard label="Overdue on map" value={cases.filter((c) => c.overdue).length} tone={cases.some((c) => c.overdue) ? 'bad' : 'good'} note={`Past the ${settings.response_target_hours}h target`} />
    </div>
    <div className="mt-5 flex flex-wrap items-center gap-3">
      <FilterTabs basePath="/admin/map" param="status" active={status} params={{ days: params.days, category: params.category }} items={[{ label: 'Open', value: 'Open' }, { label: 'New', value: 'New' }, { label: 'Escalated', value: 'Escalated' }, { label: 'Resolved', value: 'Resolved' }, { label: 'All', value: 'All' }]} />
      <form className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="status" value={status} />
        <select name="days" defaultValue={params.days ?? ''} aria-label="Period" className={cn(inputClass, 'mt-0 h-9 w-40')}><option value="">Any time</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="365">Last 12 months</option></select>
        <select name="category" defaultValue={params.category ?? ''} aria-label="Category" className={cn(inputClass, 'mt-0 h-9 w-60')}><option value="">All categories</option>{INCIDENT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
        <button className={cn(secondaryButton, "h-9 py-0")}>Apply</button>
      </form>
    </div>
    <div className="mt-4"><OperationsMap cases={cases} officers={team} canDispatch={can(me, 'incidents.edit')} /></div>
  </>
}
