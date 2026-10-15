import { Fragment } from 'react'
import Link from 'next/link'
import { Download, Search } from 'lucide-react'
import { EmptyState, PageHeader, Panel, StatCard, inputClass, secondaryButton } from '@/components/admin/ui'
import { can, requirePermission } from '@/lib/auth'
import { listAudit, listStaff } from '@/lib/queries'

export default async function AuditActivityPage({ searchParams }: { searchParams: Promise<{ staff?: string; area?: string; q?: string }> }) {
  const me = await requirePermission('audit.view')
  const params = await searchParams
  const [{ rows, stats, areas }, staff] = await Promise.all([listAudit(params), listStaff()])
  const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][])

  return <>
    <PageHeader eyebrow="Workspace" title="Audit activity" description="A complete, day-by-day record of every sign-in, change, and export, for accountability and review."
      actions={can(me, 'reports.export') ? <a href={`/admin/audit/export?${query}`} className={secondaryButton}><Download className="size-4" />Export CSV</a> : undefined} />
    <div className="grid gap-4 sm:grid-cols-3">
      <StatCard label="Events (7 days)" value={stats.week} />
      <StatCard label="Active staff (7 days)" value={stats.active_staff} />
      <StatCard label="Exports recorded" value={stats.exports} />
    </div>

    <form className="mt-6 grid gap-2 sm:grid-cols-[1fr_200px_180px_auto]">
      <label className="relative"><span className="sr-only">Search</span><Search className="absolute left-3 top-[1.15rem] size-4 text-[#8996a8]" /><input name="q" defaultValue={params.q} placeholder="Search actions or details…" className={`${inputClass} pl-9`} /></label>
      <select name="staff" defaultValue={params.staff ?? ''} aria-label="Staff member" className={inputClass}><option value="">All staff</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
      <select name="area" defaultValue={params.area ?? ''} aria-label="Area" className={inputClass}><option value="">All areas</option>{areas.map((a) => <option key={a}>{a}</option>)}</select>
      <div className="mt-1.5 flex gap-2"><button className={`${secondaryButton} h-10`}>Apply</button>{query.size > 0 && <Link href="/admin/audit" className="flex h-10 items-center px-2 text-xs font-semibold text-[#1d5fa7]">Clear</Link>}</div>
    </form>

    <Panel className="mt-4" flush>
      {rows.length === 0 ? <EmptyState title="No events found" /> : <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm">
        <thead className="border-b border-[#edf1f5] bg-[#f7f9fc] text-[11px] font-bold uppercase tracking-wider text-[#718096]"><tr><th className="px-5 py-3">Time</th><th className="px-3 py-3">Who</th><th className="px-3 py-3">Action</th><th className="px-3 py-3">Area</th><th className="px-5 py-3">Detail</th></tr></thead>
        <tbody className="divide-y divide-[#edf1f5]">{rows.map((r, i) => { const day = dayLabel(r.created_at); const newDay = i === 0 || dayLabel(rows[i - 1].created_at) !== day; return <Fragment key={r.id}>
          {newDay && <tr className="bg-[#f7f9fc]"><td colSpan={5} className="px-5 py-2 text-[11px] font-bold uppercase tracking-wider text-[#a87916]">{day}</td></tr>}
          <tr className="hover:bg-[#f7f9fc]">
          <td className="whitespace-nowrap px-5 py-3 text-xs text-[#718096]">{new Date(r.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</td>
          <td className="px-3 py-3 text-xs font-semibold">{r.staff_name ?? 'System / public'}</td>
          <td className="px-3 py-3 font-semibold">{r.action}</td>
          <td className="px-3 py-3"><span className="rounded bg-[#edf3fa] px-2 py-0.5 text-[11px] font-semibold text-[#1d5fa7]">{r.area}</span></td>
          <td className="px-5 py-3 text-xs text-[#52637b]">{r.detail}</td>
        </tr></Fragment> })}</tbody>
      </table></div>}
    </Panel>
    {rows.length === 200 && <p className="mt-3 text-center text-xs text-[#718096]">Showing the latest 200 events. Export to see the full log.</p>}
  </>
}

function dayLabel(value: Date) {
  const d = new Date(value)
  const today = new Date()
  const yesterday = new Date(Date.now() - 86400000)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}
