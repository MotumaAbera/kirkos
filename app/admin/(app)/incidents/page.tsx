import Link from 'next/link'
import { Download, Plus, Search } from 'lucide-react'
import { bulkUpdateIncidents } from '@/app/admin/actions'
import { ActionForm, Modal, SelectAll, SubmitButton } from '@/components/admin/forms'
import { IncidentForm } from '@/components/admin/incident-form'
import { Badge, EmptyState, FilterTabs, PageHeader, Panel, StatCard, inputClass, secondaryButton, timeAgo } from '@/components/admin/ui'
import { can, requirePermission } from '@/lib/auth'
import { INCIDENT_STATUSES, PRIORITIES, SUB_CITIES } from '@/lib/constants'
import { getSettings, listAssignableStaff, listIncidents } from '@/lib/queries'

type Search = { q?: string; status?: string; subCity?: string; priority?: string; assignee?: string; new?: string }
const bulkSelect = 'h-9 rounded-lg border border-[#d8e1ec] bg-white px-2.5 text-xs font-semibold text-[#14233b]'

export default async function IncidentManagementPage({ searchParams }: { searchParams: Promise<Search> }) {
  const me = await requirePermission('incidents.view')
  const canBulk = can(me, 'incidents.bulk')
  const params = await searchParams
  const settings = await getSettings()
  const status = params.status || (settings.show_resolved ? 'All' : 'Open')
  const filters = { q: params.q, status: status === 'All' ? '' : status, subCity: params.subCity, priority: params.priority, assignee: params.assignee }
  const [{ rows, counts, queue }, staff] = await Promise.all([listIncidents(filters, settings.response_target_hours), listAssignableStaff()])
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  const exportQuery = new URLSearchParams(Object.entries(filters).filter(([, v]) => v) as [string, string][])
  const hasFilters = Boolean(params.q || params.subCity || params.priority || params.assignee)
  const tabParams = { q: params.q, subCity: params.subCity, priority: params.priority, assignee: params.assignee }

  return <>
    <PageHeader eyebrow="Workspace" title="Incident management" description="Triage, assign, escalate, and resolve civic reports from every channel."
      actions={<>
        {can(me, 'reports.export') && <a href={`/admin/incidents/export?${exportQuery}`} className={secondaryButton}><Download className="size-4" />Export CSV</a>}
        {can(me, 'incidents.create') && <Modal trigger={<><Plus className="size-4" />Log incident</>} title="Log a new incident" description="For reports received by phone, walk-in, or field patrol." wide defaultOpen={params.new === '1'}>
          <IncidentForm staff={staff} />
        </Modal>}
      </>} />

    <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Awaiting triage" value={counts.New ?? 0} note="New reports not yet worked" href="/admin/incidents?status=New" />
      <StatCard label="Unassigned open cases" value={queue.unassigned} note={queue.unassigned ? (canBulk ? 'Assign below with bulk actions' : 'Waiting for an assignee') : 'Everything has an owner'} tone={queue.unassigned ? 'warn' : 'good'} href="/admin/incidents?status=Open&assignee=unassigned" />
      <StatCard label="Past response target" value={queue.overdue} note={`Older than ${settings.response_target_hours}h and still open`} tone={queue.overdue ? 'bad' : 'good'} href="/admin/incidents?status=Overdue" />
      <StatCard label="Resolved today" value={queue.resolved_today} note={`${queue.high} high-priority cases still open`} tone="good" href="/admin/incidents?status=Resolved" />
    </div>

    <FilterTabs basePath="/admin/incidents" param="status" active={status} params={tabParams} items={[
      { label: 'Open', value: 'Open', count: total - (counts.Resolved ?? 0) },
      { label: 'New', value: 'New', count: counts.New ?? 0 },
      { label: 'In progress', value: 'In progress', count: counts['In progress'] ?? 0 },
      { label: 'Escalated', value: 'Escalated', count: counts.Escalated ?? 0 },
      { label: 'Overdue', value: 'Overdue', count: queue.overdue },
      { label: 'Resolved', value: 'Resolved', count: counts.Resolved ?? 0 },
      { label: 'All', value: 'All', count: total },
    ]} />

    <form className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_170px_150px_190px_auto]">
      <input type="hidden" name="status" value={status} />
      <label className="relative"><span className="sr-only">Search</span><Search className="absolute left-3 top-[1.15rem] size-4 text-[#8996a8]" /><input name="q" defaultValue={params.q} placeholder="Search ID, title, place…" className={`${inputClass} pl-9`} /></label>
      <select name="subCity" defaultValue={params.subCity ?? ''} aria-label="Sub-city" className={inputClass}><option value="">All sub-cities</option>{SUB_CITIES.map((c) => <option key={c}>{c}</option>)}</select>
      <select name="priority" defaultValue={params.priority ?? ''} aria-label="Priority" className={inputClass}><option value="">Any priority</option>{PRIORITIES.map((p) => <option key={p}>{p}</option>)}</select>
      <select name="assignee" defaultValue={params.assignee ?? ''} aria-label="Assignee" className={inputClass}><option value="">Anyone</option><option value="unassigned">Unassigned</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
      <div className="mt-1.5 flex gap-2"><button className={`${secondaryButton} h-10 flex-1`}>Apply</button>{hasFilters && <Link href={`/admin/incidents?status=${encodeURIComponent(status)}`} className="flex h-10 items-center px-2 text-xs font-semibold text-[#1d5fa7]">Clear</Link>}</div>
    </form>

    <Panel className="mt-4" flush>
      {rows.length === 0 ? <EmptyState title="No incidents match" text="Try a different status tab or clear the filters." /> : <ActionForm action={bulkUpdateIncidents} resetOnSuccess className="pb-1">
        {canBulk && <div className="flex flex-wrap items-center gap-2 border-b border-[#edf1f5] bg-[#fbfcfe] px-5 py-3">
          <span data-selected-count className="mr-2 text-xs font-bold text-[#52637b]">None selected</span>
          <select name="bulk_status" aria-label="Set status" defaultValue="" className={bulkSelect}><option value="">Set status…</option>{INCIDENT_STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
          <select name="bulk_priority" aria-label="Set priority" defaultValue="" className={bulkSelect}><option value="">Set priority…</option>{PRIORITIES.map((p) => <option key={p}>{p}</option>)}</select>
          <select name="bulk_assignee" aria-label="Assign to" defaultValue="" className={bulkSelect}><option value="">Assign to…</option><option value="none">Unassign</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.district}</option>)}</select>
          <SubmitButton className="h-9 rounded-lg bg-[#082957] px-3.5 text-xs font-semibold text-white hover:bg-[#0d3a78] disabled:opacity-60" pendingText="Applying…">Apply to selected</SubmitButton>
        </div>}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="border-b border-[#edf1f5] bg-[#f7f9fc] text-[11px] font-bold uppercase tracking-wider text-[#718096]">
              <tr>{canBulk ? <th className="w-10 py-3 pl-5"><SelectAll label="Select all cases on this page" /></th> : <th className="w-2" />}<th className="px-3 py-3">Case</th><th className="px-3 py-3">Location</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Priority</th><th className="px-3 py-3">Assignee</th><th className="px-5 py-3 text-right">Received</th></tr>
            </thead>
            <tbody className="divide-y divide-[#edf1f5]">
              {rows.map((item) => <tr key={item.id} className="group hover:bg-[#f7f9fc] has-[:checked]:bg-[#f1f6fc]">
                {canBulk ? <td className="py-3 pl-5"><input type="checkbox" name="ids" value={item.id} aria-label={`Select ${item.ref}`} className="size-4 accent-[#1d5fa7]" /></td> : <td className="w-2" />}
                <td className="px-3 py-3"><Link href={`/admin/incidents/${item.id}`} className="block"><span className="block max-w-xs truncate font-semibold group-hover:text-[#1d5fa7]">{item.title}</span><span className="text-xs text-[#718096]">{item.ref} · {item.category}</span></Link></td>
                <td className="px-3 py-3 text-xs text-[#52637b]">{item.sub_city}{item.woreda && <span className="block text-[#8996a8]">{item.woreda}</span>}</td>
                <td className="px-3 py-3"><div className="flex flex-wrap gap-1"><Badge>{item.status}</Badge>{item.overdue && <Badge>Overdue</Badge>}</div></td>
                <td className="px-3 py-3"><Badge>{item.priority}</Badge></td>
                <td className="px-3 py-3 text-xs">{item.assignee_name ?? <span className="text-[#9a6d08]">Unassigned</span>}</td>
                <td className="px-5 py-3 text-right text-xs text-[#8996a8]">{timeAgo(item.created_at)}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </ActionForm>}
    </Panel>
    {rows.length === 100 && <p className="mt-3 text-center text-xs text-[#718096]">Showing the first 100 results. Narrow the filters or export to see everything.</p>}
  </>
}
