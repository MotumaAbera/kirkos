import Link from 'next/link'
import { Download, Plus, Search } from 'lucide-react'
import { setServiceStatus } from '@/app/admin/actions'
import { ActionForm, AutoSubmitSelect, Modal } from '@/components/admin/forms'
import { ServiceForm } from '@/components/admin/service-form'
import { Badge, EmptyState, FilterTabs, PageHeader, Panel, StatCard, formatDate, inputClass, secondaryButton } from '@/components/admin/ui'
import { can, requirePermission } from '@/lib/auth'
import { SERVICE_CATEGORIES, SERVICE_STATUSES } from '@/lib/constants'
import { listAssignableStaff, listServiceRequests } from '@/lib/queries'

export default async function ServicesPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; category?: string }> }) {
  const me = await requirePermission('services.view')
  const params = await searchParams
  const status = params.status || 'Open'
  const [{ rows, stats, byStatus, byCategory }, staff] = await Promise.all([
    listServiceRequests({ q: params.q, status: status === 'All' ? '' : status, category: params.category }),
    listAssignableStaff(),
  ])
  const total = Object.values(byStatus).reduce((a, b) => a + b, 0)
  const maxCategory = Math.max(1, ...byCategory.map((c) => c.count))

  return <>
    <PageHeader eyebrow="Workspace" title="Service requests" description="Track citizen service requests from intake to closure, against their due dates."
      actions={<>{can(me, 'reports.export') && <a href={`/admin/services/export?status=${status === 'All' ? '' : encodeURIComponent(status)}`} className={secondaryButton}><Download className="size-4" />Export CSV</a>}{can(me, 'services.edit') && <Modal trigger={<><Plus className="size-4" />New request</>} title="New service request" wide><ServiceForm staff={staff} /></Modal>}</>} />

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Open requests" value={stats.open} href="/admin/services?status=Open" />
      <StatCard label="Due within 7 days" value={stats.due_week} note={stats.overdue ? `${stats.overdue} overdue` : 'Nothing overdue'} tone={stats.overdue ? 'bad' : 'good'} />
      <StatCard label="Closed (30 days)" value={stats.closed_month} />
      <StatCard label="Closed on time" value={stats.on_time === null ? '—' : `${stats.on_time}%`} tone="good" />
    </div>

    <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_300px]">
      <div className="min-w-0">
        <FilterTabs basePath="/admin/services" param="status" active={status} params={{ q: params.q, category: params.category }} items={[
          { label: 'Open', value: 'Open', count: total - (byStatus.Closed ?? 0) },
          ...SERVICE_STATUSES.map((s) => ({ label: s, value: s, count: byStatus[s] ?? 0 })),
          { label: 'All', value: 'All', count: total },
        ]} />
        <form className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input type="hidden" name="status" value={status} />
          <label className="relative flex-1"><span className="sr-only">Search</span><Search className="absolute left-3 top-[1.15rem] size-4 text-[#8996a8]" /><input name="q" defaultValue={params.q} placeholder="Search reference, title, requester…" className={`${inputClass} pl-9`} /></label>
          <select name="category" defaultValue={params.category ?? ''} aria-label="Category" className={`${inputClass} sm:w-56`}><option value="">All categories</option>{SERVICE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
          <button className={`${secondaryButton} mt-1.5 h-10`}>Apply</button>
        </form>
        <Panel className="mt-3" flush>
          {rows.length === 0 ? <EmptyState title="No requests here" text="Create a request or switch to another status." /> : <ul className="divide-y divide-[#edf1f5]">
            {rows.map((r) => <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5 hover:bg-[#f7f9fc]">
              <Link href={`/admin/services/${r.id}`} className="min-w-0 flex-1 basis-60">
                <p className="flex items-center gap-2 truncate text-sm font-semibold hover:text-[#1d5fa7]">{r.title}{r.source === 'Public portal' && <span className="shrink-0 rounded bg-[#edf3fa] px-1.5 py-0.5 text-[10px] font-bold text-[#1d5fa7]">Website</span>}</p>
                <p className="mt-0.5 truncate text-xs text-[#718096]">{r.ref} · {r.category} · {r.sub_city} · {r.assignee_name ?? 'Unassigned'}</p>
              </Link>
              <div className="flex items-center gap-2">
                {r.overdue && <Badge>Overdue</Badge>}
                <span className="w-24 text-right text-xs text-[#718096]">{r.due_date ? `Due ${formatDate(r.due_date, false)}` : 'No due date'}</span>
                {can(me, 'services.edit') ? <ActionForm action={setServiceStatus} hideMessage>
                  <input type="hidden" name="id" value={r.id} />
                  <AutoSubmitSelect label={`Status for ${r.ref}`} name="status" defaultValue={r.status} options={SERVICE_STATUSES.map((s) => ({ value: s, label: s }))} className="h-8 rounded-md border border-[#d8e1ec] bg-white px-2 text-xs font-semibold" />
                </ActionForm> : <Badge>{r.status}</Badge>}
              </div>
            </li>)}
          </ul>}
        </Panel>
      </div>
      <Panel title="Top categories" className="h-fit">
        {byCategory.length === 0 ? <p className="text-sm text-[#718096]">No requests yet.</p> : <div className="flex flex-col gap-3">{byCategory.map((c) => <Link key={c.category} href={`/admin/services?status=All&category=${encodeURIComponent(c.category)}`} className="group block">
          <div className="mb-1 flex justify-between text-xs font-semibold"><span className="group-hover:text-[#1d5fa7]">{c.category}</span><span className="text-[#718096]">{c.count}</span></div>
          <div className="h-2 rounded-full bg-[#edf1f5]"><div className="h-2 rounded-full bg-[#e9bb52]" style={{ width: `${(c.count / maxCategory) * 100}%` }} /></div>
        </Link>)}</div>}
      </Panel>
    </div>
  </>
}
