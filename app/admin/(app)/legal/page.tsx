import Link from 'next/link'
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Search } from 'lucide-react'
import { createLegalCase } from '@/app/admin/enforcement-actions'
import { ActionForm, Modal, SubmitButton } from '@/components/admin/forms'
import { Badge, EmptyState, FilterTabs, PageHeader, Panel, StatCard, formatDate, inputClass, labelClass, secondaryButton, textareaClass } from '@/components/admin/ui'
import { can, requirePermission } from '@/lib/auth'
import { LEGAL_STATUSES, getLegalStats, listHearings, listLegalCases } from '@/lib/enforcement'
import { formatBirr } from '@/lib/money'
import { cn } from '@/lib/utils'

const statusTone = (s: string) => (s === 'Closed' ? 'Inactive' : s === 'Decided' ? 'Healthy' : s === 'Hearing scheduled' ? 'Watch' : 'New')
const TZ = 'Africa/Addis_Ababa'

export default async function LegalPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; status?: string; type?: string; week?: string; new?: string; citation?: string }> }) {
  const me = await requirePermission('legal.view')
  const params = await searchParams
  const tab = params.tab === 'hearings' ? 'hearings' : 'cases'
  const status = params.status ?? 'Active'
  const stats = await getLegalStats()

  return <>
    <PageHeader eyebrow="Workspace" title="Legal & appeals" description="Citizen appeals of citations, court referrals for unpaid fines, hearings, and decisions."
      actions={can(me, 'legal.manage') && <Modal trigger={<><Plus className="size-4" />New case</>} title="Open a legal case" description="For appeals filed in person or manual court referrals. Online appeals arrive here automatically." wide defaultOpen={params.new === '1'}>
        <ActionForm action={createLegalCase} className="grid gap-4 sm:grid-cols-2">
          <label className={labelClass}>Type<select name="type" className={inputClass}><option>Appeal</option><option>Court referral</option></select></label>
          <label className={labelClass}>Citation number<input name="citation_ref" defaultValue={params.citation} placeholder="CIT-2026-1001" className={inputClass} /></label>
          <label className={labelClass}>Appellant / respondent name<input name="appellant_name" placeholder="Defaults to the offender" className={inputClass} /></label>
          <label className={labelClass}>Phone<input name="appellant_phone" className={inputClass} /></label>
          <label className={`${labelClass} sm:col-span-2`}>Email<input name="appellant_email" type="email" className={inputClass} /></label>
          <label className={`${labelClass} sm:col-span-2`}>Grounds<textarea name="reason" required minLength={10} rows={4} className={textareaClass} /></label>
          <div className="flex justify-end sm:col-span-2"><SubmitButton>Open case</SubmitButton></div>
        </ActionForm>
      </Modal>} />

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Open cases" value={stats.open} href="/admin/legal?status=Active" />
      <StatCard label="Appeals" value={stats.appeals} note="Payment paused while under appeal" href="/admin/legal?type=Appeal&status=Active" />
      <StatCard label="Court referrals" value={stats.referrals} note="Unpaid fines escalated automatically" tone={stats.referrals ? 'warn' : 'neutral'} href="/admin/legal?type=Court%20referral&status=Active" />
      <StatCard label="Hearings next 7 days" value={stats.hearings_week} note={`${stats.decided_month} decided this month`} href="/admin/legal?tab=hearings" />
    </div>

    <div className="mt-6"><FilterTabs basePath="/admin/legal" param="tab" active={tab} params={{}} items={[{ label: 'Cases', value: 'cases' }, { label: 'Hearings calendar', value: 'hearings' }]} /></div>

    {tab === 'cases' ? await (async () => {
      const rows = await listLegalCases({ q: params.q, status: status === 'All' ? '' : status, type: params.type })
      return <>
        <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center">
          <FilterTabs basePath="/admin/legal" param="status" active={status} params={{ q: params.q, type: params.type }} items={[{ label: 'Active', value: 'Active' }, ...LEGAL_STATUSES.map((s) => ({ label: s, value: s })), { label: 'All', value: 'All' }]} />
          <form className="flex flex-1 gap-2"><input type="hidden" name="status" value={status} />
            <select name="type" defaultValue={params.type ?? ''} aria-label="Type" className={cn(inputClass, 'mt-0 w-44')}><option value="">All types</option><option>Appeal</option><option>Court referral</option></select>
            <label className="relative flex-1"><span className="sr-only">Search</span><Search className="absolute left-3 top-[0.7rem] size-4 text-[#8996a8]" /><input name="q" defaultValue={params.q} placeholder="Case, citation, name…" className={cn(inputClass, 'mt-0 pl-9')} /></label>
            <button className={`${secondaryButton} h-10`}>Search</button></form>
        </div>
        <Panel className="mt-3" flush>{rows.length === 0 ? <EmptyState title="No legal cases" text="Appeals filed online and automatic court referrals will appear here." /> : <div className="overflow-x-auto"><table className="w-full min-w-[860px] text-left text-sm">
          <thead className="border-b border-[#edf1f5] bg-[#f7f9fc] text-[11px] font-bold uppercase tracking-wider text-[#718096]"><tr><th className="px-5 py-3">Case</th><th className="px-3 py-3">Party</th><th className="px-3 py-3">Citation</th><th className="px-3 py-3">Next hearing</th><th className="px-5 py-3">Status</th></tr></thead>
          <tbody className="divide-y divide-[#edf1f5]">{rows.map((l) => <tr key={l.id} className="hover:bg-[#f7f9fc]">
            <td className="px-5 py-3"><Link href={`/admin/legal/${l.id}`} className="font-semibold text-[#1d5fa7] hover:underline">{l.ref}</Link><p className="text-xs text-[#718096]">{l.type} · opened {formatDate(l.created_at, false)}</p></td>
            <td className="px-3 py-3"><p className="font-semibold">{l.appellant_name ?? '—'}</p><p className="text-xs text-[#718096]">{l.appellant_phone ?? ''}</p></td>
            <td className="px-3 py-3 text-xs">{l.citation_ref ? <><Link href={`/admin/revenue/${l.citation_id}`} className="font-semibold text-[#1d5fa7] hover:underline">{l.citation_ref}</Link><span className="block text-[#718096]">{formatBirr(l.amount ?? 0)} · balance {formatBirr(l.balance ?? 0)}</span></> : '—'}</td>
            <td className="px-3 py-3 text-xs">{l.next_hearing ? new Date(l.next_hearing).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: TZ }) : '—'}</td>
            <td className="px-5 py-3"><div className="flex flex-wrap gap-1"><Badge tone={statusTone(l.status)}>{l.status}</Badge>{l.outcome && <Badge tone="Inactive">{l.outcome}</Badge>}</div></td>
          </tr>)}</tbody></table></div>}</Panel>
      </>
    })() : await (async () => {
      // Four-week agenda starting on the Monday of the chosen week.
      const base = params.week && /^\d{4}-\d{2}-\d{2}$/.test(params.week) ? new Date(`${params.week}T00:00:00Z`) : new Date()
      const monday = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() - ((base.getUTCDay() + 6) % 7)))
      const end = new Date(monday.getTime() + 27 * 86400000)
      const iso = (d: Date) => d.toISOString().slice(0, 10)
      const hearings = await listHearings({ from: iso(monday), to: iso(end) })
      const days = Array.from({ length: 28 }, (_, i) => new Date(monday.getTime() + i * 86400000))
      const byDay = (d: Date) => hearings.filter((h) => new Date(h.scheduled_at).toLocaleDateString('en-CA', { timeZone: TZ }) === iso(d))
      const today = new Date().toLocaleDateString('en-CA', { timeZone: TZ })
      return <Panel className="mt-4" title={`${monday.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })} – ${end.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`} description={`${hearings.length} hearing(s) · times in Addis Ababa`}
        actions={<div className="flex gap-1">
          <Link href={`/admin/legal?tab=hearings&week=${iso(new Date(monday.getTime() - 28 * 86400000))}`} className={`${secondaryButton} px-2.5 py-1.5`} aria-label="Previous four weeks"><ChevronLeft className="size-4" /></Link>
          <Link href="/admin/legal?tab=hearings" className={`${secondaryButton} px-3 py-1.5 text-xs`}>Today</Link>
          <Link href={`/admin/legal?tab=hearings&week=${iso(new Date(monday.getTime() + 28 * 86400000))}`} className={`${secondaryButton} px-2.5 py-1.5`} aria-label="Next four weeks"><ChevronRight className="size-4" /></Link></div>}>
        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-[#edf1f5] bg-[#edf1f5] text-xs">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="bg-[#f7f9fc] px-2 py-1.5 text-center font-bold text-[#718096]">{d}</div>)}
          {days.map((d) => { const items = byDay(d); const isToday = iso(d) === today; return <div key={iso(d)} className={`min-h-24 bg-white p-1.5 ${isToday ? 'ring-2 ring-inset ring-[#e9bb52]' : ''}`}>
            <p className={`mb-1 text-[11px] font-semibold ${isToday ? 'text-[#a87916]' : 'text-[#8996a8]'}`}>{d.getUTCDate()} {d.getUTCDate() === 1 || iso(d) === iso(monday) ? d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }) : ''}</p>
            {items.map((h) => <Link key={h.id} href={`/admin/legal/${h.legal_case_id}`} className={`mb-1 block rounded px-1.5 py-1 leading-tight ${h.status === 'Scheduled' ? 'bg-[#edf3fa] text-[#082957]' : h.status === 'Held' ? 'bg-[#eaf8f0] text-[#267448]' : 'bg-[#f3f6fa] text-[#8996a8] line-through'}`}>
              <b>{new Date(h.scheduled_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: TZ })}</b> {h.case_ref}<span className="block truncate">{h.appellant_name ?? h.case_type} · {h.location}</span></Link>)}
          </div> })}
        </div>
        {hearings.length === 0 && <p className="mt-4 flex items-center gap-2 text-sm text-[#718096]"><CalendarDays className="size-4" />No hearings in these four weeks. Schedule them from a case page.</p>}
      </Panel>
    })()}
  </>
}
