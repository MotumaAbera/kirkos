import Link from 'next/link'
import { BriefcaseBusiness, ClipboardList, Download, FileSpreadsheet, MapPinned, ShieldCheck, Users } from 'lucide-react'
import { FilterTabs, PageHeader, Panel, StatCard, formatDate, inputClass, labelClass, primaryButton, secondaryButton } from '@/components/admin/ui'
import { can, requirePermission } from '@/lib/auth'
import { EXPORTS, type ExportKind } from '@/lib/exports'
import { INCIDENT_STATUSES, SERVICE_STATUSES, SUB_CITIES } from '@/lib/constants'
import { getReport, listExportHistory } from '@/lib/queries'

const PERIODS = [{ label: '7 days', value: '7' }, { label: '30 days', value: '30' }, { label: '90 days', value: '90' }, { label: '12 months', value: '365' }]
const STATUS_COLORS: Record<string, string> = { Resolved: '#267448', 'In progress': '#e9bb52', New: '#1d5fa7', Escalated: '#b32d3d' }

export default async function ReportsExportsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const me = await requirePermission('reports.view')
  const canExport = (kind: ExportKind) => can(me, 'reports.export') && can(me, EXPORTS[kind].permission)
  const { days: raw } = await searchParams
  const days = PERIODS.some((p) => p.value === raw) ? Number(raw) : 30
  const [{ summary, byCategory, bySubCity, weekly, statusMix }, history] = await Promise.all([getReport(days), listExportHistory()])
  const today = new Date().toISOString().slice(0, 10)
  const periodStart = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
  const change = summary.prev_received ? Math.round(((summary.received - summary.prev_received) / summary.prev_received) * 100) : null
  const maxWeekly = Math.max(1, ...weekly.flatMap((w) => [w.received, w.resolved]))
  const maxCategory = Math.max(1, ...byCategory.map((c) => c.count))
  const mixTotal = statusMix.reduce((a, s) => a + s.count, 0)
  let acc = 0
  const gradient = statusMix.map((s) => { const start = acc; acc += (s.count / Math.max(1, mixTotal)) * 100; return `${STATUS_COLORS[s.status] ?? '#aab7c7'} ${start}% ${acc}%` }).join(', ')

  return <>
    <PageHeader eyebrow="Workspace" title="Reports & exports" description={`Performance over the last ${PERIODS.find((p) => Number(p.value) === days)?.label}, and data downloads for every part of the workspace.`}
      actions={can(me, 'reports.export') ? <><a href="#exports" className={secondaryButton}><FileSpreadsheet className="size-4" />Export center</a><a href={`/admin/reports/export?days=${days}`} className={primaryButton}><Download className="size-4" />Download summary</a></> : undefined} />
    <FilterTabs basePath="/admin/reports" param="days" active={String(days)} params={{}} items={PERIODS} />

    <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Reports received" value={summary.received} note={change === null ? 'No data for previous period' : `${change >= 0 ? '+' : ''}${change}% vs previous period`} />
      <StatCard label="Cases resolved" value={summary.resolved} tone="good" note={summary.received ? `${Math.round((summary.resolved / summary.received) * 100)}% of received` : undefined} />
      <StatCard label="Avg. resolution time" value={summary.avg_hours === null ? '—' : `${summary.avg_hours}h`} />
      <StatCard label="Service requests" value={summary.services} note="Created in this period" />
    </div>

    <div className="mt-6 grid gap-6 xl:grid-cols-[1.3fr_.7fr]">
      <Panel title="Weekly trend" description="Last 8 weeks · received vs resolved">
        <div className="flex h-52 items-end gap-2 sm:gap-4">
          {weekly.map((w) => <div key={w.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
            <div className="flex h-full w-full items-end justify-center gap-1">
              <div title={`${w.received} received`} className="w-1/2 max-w-5 rounded-t bg-[#1d5fa7]" style={{ height: `${(w.received / maxWeekly) * 100}%`, minHeight: w.received ? 4 : 0 }} />
              <div title={`${w.resolved} resolved`} className="w-1/2 max-w-5 rounded-t bg-[#e9bb52]" style={{ height: `${(w.resolved / maxWeekly) * 100}%`, minHeight: w.resolved ? 4 : 0 }} />
            </div>
            <span className="whitespace-nowrap text-[10px] text-[#8996a8]">{w.label}</span>
          </div>)}
        </div>
        <div className="mt-4 flex gap-4 text-xs font-semibold text-[#52637b]"><span className="flex items-center gap-1.5"><i className="size-2 rounded-sm bg-[#1d5fa7]" />Received</span><span className="flex items-center gap-1.5"><i className="size-2 rounded-sm bg-[#e9bb52]" />Resolved</span></div>
      </Panel>
      <Panel title="Status of cases received">
        {mixTotal === 0 ? <p className="text-sm text-[#718096]">No cases in this period.</p> : <div className="flex flex-wrap items-center gap-6">
          <div className="flex size-32 shrink-0 items-center justify-center rounded-full" style={{ background: `conic-gradient(${gradient})` }}>
            <div className="flex size-20 flex-col items-center justify-center rounded-full bg-white"><span className="text-lg font-bold text-[#082957]">{mixTotal}</span><span className="text-[10px] text-[#718096]">cases</span></div>
          </div>
          <ul className="flex flex-col gap-2 text-xs font-semibold">{statusMix.map((s) => <li key={s.status} className="flex items-center gap-2"><i className="size-2.5 rounded-full" style={{ background: STATUS_COLORS[s.status] ?? '#aab7c7' }} />{s.status}<span className="text-[#718096]">{s.count} · {Math.round((s.count / mixTotal) * 100)}%</span></li>)}</ul>
        </div>}
      </Panel>
    </div>

    <div className="mt-6 grid gap-6 lg:grid-cols-2">
      <Panel title="By category">
        {byCategory.length === 0 ? <p className="text-sm text-[#718096]">No data.</p> : <div className="flex flex-col gap-3">{byCategory.map((c) => <div key={c.label}>
          <div className="mb-1 flex justify-between text-xs font-semibold"><span>{c.label}</span><span className="text-[#718096]">{c.count}</span></div>
          <div className="h-2 rounded-full bg-[#edf1f5]"><div className="h-2 rounded-full bg-[#1d5fa7]" style={{ width: `${(c.count / maxCategory) * 100}%` }} /></div>
        </div>)}</div>}
      </Panel>
      <Panel title="By sub-city" flush>
        {bySubCity.length === 0 ? <p className="p-5 text-sm text-[#718096]">No data.</p> : <table className="w-full text-left text-sm">
          <thead className="border-b border-[#edf1f5] bg-[#f7f9fc] text-[11px] font-bold uppercase tracking-wider text-[#718096]"><tr><th className="px-5 py-2.5">Sub-city</th><th className="px-3 py-2.5 text-right">Received</th><th className="px-3 py-2.5 text-right">Resolved</th><th className="px-5 py-2.5 text-right">Rate</th></tr></thead>
          <tbody className="divide-y divide-[#edf1f5]">{bySubCity.map((s) => <tr key={s.label}><td className="px-5 py-2.5 font-semibold">{s.label}</td><td className="px-3 py-2.5 text-right">{s.count}</td><td className="px-3 py-2.5 text-right">{s.resolved}</td><td className="px-5 py-2.5 text-right text-[#267448]">{Math.round((s.resolved / s.count) * 100)}%</td></tr>)}</tbody>
        </table>}
      </Panel>
    </div>
    {can(me, 'reports.export') && <section id="exports" className="mt-8 scroll-mt-20">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div><h2 className="text-lg font-bold">Export center</h2><p className="text-sm text-[#718096]">CSV files open in Excel or Google Sheets. Every export is recorded in Audit activity.</p></div>
      </div>
      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="grid gap-4 md:grid-cols-2">
          <ExportCard icon={ClipboardList} title="Incident register" hidden={!canExport('incidents')} text="Every case with location, status, assignee, reporter, and timestamps." action="/admin/incidents/export">
            <div className="grid grid-cols-2 gap-2">
              <label className={labelClass}>From<input type="date" name="from" defaultValue={periodStart} max={today} className={inputClass} /></label>
              <label className={labelClass}>To<input type="date" name="to" defaultValue={today} max={today} className={inputClass} /></label>
              <label className={labelClass}>Status<select name="status" className={inputClass}><option value="">All statuses</option><option value="Open">Open only</option><option value="Overdue">Overdue only</option>{INCIDENT_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></label>
              <label className={labelClass}>Sub-city<select name="subCity" className={inputClass}><option value="">All</option>{SUB_CITIES.map((c) => <option key={c}>{c}</option>)}</select></label>
            </div>
          </ExportCard>
          <ExportCard icon={BriefcaseBusiness} title="Service requests" hidden={!canExport('services')} text="Requests with category, due dates, assignee, and closure details." action="/admin/services/export">
            <label className={labelClass}>Status<select name="status" className={inputClass}><option value="">All statuses</option><option value="Open">Open only</option>{SERVICE_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></label>
          </ExportCard>
          <ExportCard icon={MapPinned} title="District performance" hidden={!canExport('districts')} text="Received, resolved, open, overdue, and resolution rate for each sub-city." action="/admin/districts/export">
            <label className={labelClass}>Period<select name="days" defaultValue={String(days)} className={inputClass}>{PERIODS.map((p) => <option key={p.value} value={p.value}>Last {p.label}</option>)}</select></label>
          </ExportCard>
          <ExportCard icon={Users} title="Team workload" hidden={!canExport('team')} text="Staff directory with open cases, overdue items, and 30-day output." action="/admin/team/export" />
          <ExportCard icon={FileSpreadsheet} title="Performance summary" hidden={!canExport('summary')} text="Headline numbers by status, category, and sub-city for briefings." action="/admin/reports/export">
            <label className={labelClass}>Period<select name="days" defaultValue={String(days)} className={inputClass}>{PERIODS.map((p) => <option key={p.value} value={p.value}>Last {p.label}</option>)}</select></label>
          </ExportCard>
          <ExportCard icon={ShieldCheck} title="Audit activity" hidden={!canExport('audit')} text="Full record of sign-ins, changes, and exports for accountability." action="/admin/audit/export" />
        </div>
        <Panel title="Recent exports" className="h-fit" flush actions={<Link href="/admin/audit?q=Exported" className="text-xs font-semibold text-[#1d5fa7] hover:underline">View all</Link>}>
          {history.length === 0 ? <p className="p-5 text-sm text-[#718096]">No exports yet.</p> : <ul className="divide-y divide-[#edf1f5]">{history.map((h) => <li key={h.id} className="px-5 py-3">
            <p className="text-sm font-semibold">{h.action.replace(/^Exported /, '')}</p>
            <p className="mt-0.5 text-xs text-[#718096]">{h.staff_name ?? 'System'} · {formatDate(h.created_at)}{h.detail ? ` · ${h.detail}` : ''}</p>
          </li>)}</ul>}
        </Panel>
      </div>
    </section>}
  </>
}


function ExportCard({ icon: Icon, title, text, action, children, hidden }: { icon: typeof Download; title: string; text: string; action: string; children?: React.ReactNode; hidden?: boolean }) {
  if (hidden) return null
  return <form action={action} method="get" className="flex flex-col rounded-xl border border-[#dfe7f0] bg-white p-5 shadow-sm">
    <div className="flex items-start gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#edf3fa] text-[#1d5fa7]"><Icon className="size-5" /></span>
      <div><h3 className="text-sm font-bold">{title}</h3><p className="mt-0.5 text-xs leading-5 text-[#718096]">{text}</p></div>
    </div>
    {children && <div className="mt-4">{children}</div>}
    <button type="submit" className={`${secondaryButton} mt-4 w-full`}><Download className="size-4" />Download CSV</button>
  </form>
}
