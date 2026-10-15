import Link from 'next/link'
import { Pencil, Plus, Search } from 'lucide-react'
import { saveFee, saveRevenueSettings } from '@/app/admin/enforcement-actions'
import { CitationForm } from '@/components/admin/citation-form'
import { ActionForm, Modal, SubmitButton } from '@/components/admin/forms'
import { Badge, EmptyState, FilterTabs, PageHeader, Panel, StatCard, formatDate, inputClass, labelClass, secondaryButton, textareaClass } from '@/components/admin/ui'
import { can, requirePermission } from '@/lib/auth'
import { INCIDENT_CATEGORIES } from '@/lib/constants'
import { CITATION_STATUSES, getRevenueStats, listCitations, listFees, listPayments, listPlans, type Fee } from '@/lib/enforcement'
import { formatBirr } from '@/lib/money'
import { getSettings } from '@/lib/queries'
import { cn } from '@/lib/utils'

const citationTone = (s: string) => (s === 'Paid' ? 'Healthy' : s === 'Escalated' ? 'Critical' : s === 'Under appeal' || s === 'Partially paid' ? 'Watch' : s === 'Void' || s === 'Waived' ? 'Inactive' : 'New')

function FeeForm({ fee }: { fee?: Fee }) {
  return <ActionForm action={saveFee} resetOnSuccess={!fee} className="grid gap-4 sm:grid-cols-2">
    {fee && <input type="hidden" name="id" value={fee.id} />}
    <label className={labelClass}>Code<input name="code" required defaultValue={fee?.code} placeholder="e.g. IC-03" className={inputClass} /></label>
    <label className={labelClass}>Category<select name="category" defaultValue={fee?.category ?? INCIDENT_CATEGORIES[0]} className={inputClass}>{INCIDENT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label>
    <label className={`${labelClass} sm:col-span-2`}>Violation<input name="violation" required defaultValue={fee?.violation} className={inputClass} /></label>
    <label className={labelClass}>First offense (ETB)<input name="first_amount" required inputMode="decimal" defaultValue={fee?.first_amount} className={inputClass} /></label>
    <label className={labelClass}>Repeat offense (ETB)<input name="repeat_amount" required inputMode="decimal" defaultValue={fee?.repeat_amount} className={inputClass} /></label>
    <label className={labelClass}>Days to pay<input name="due_days" type="number" min={1} max={180} required defaultValue={fee?.due_days ?? 30} className={inputClass} /></label>
    {fee && <label className="mt-6 flex items-center gap-2 text-sm font-semibold"><input type="checkbox" name="active" defaultChecked={fee.active} className="size-4 accent-[#1d5fa7]" />Active (can be used for new citations)</label>}
    <label className={`${labelClass} sm:col-span-2`}>Legal basis / notes<textarea name="description" rows={2} defaultValue={fee?.description} className={textareaClass} /></label>
    <p className="text-xs text-[#718096] sm:col-span-2">Changes apply to new citations only. Every change is recorded in Audit activity.</p>
    <div className="flex justify-end sm:col-span-2"><SubmitButton>{fee ? 'Save fee' : 'Add fee'}</SubmitButton></div>
  </ActionForm>
}

export default async function RevenuePage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; status?: string }> }) {
  const me = await requirePermission('citations.view')
  const params = await searchParams
  const tab = ['citations', 'payments', 'plans', 'fees'].includes(params.tab ?? '') ? params.tab! : 'citations'
  const status = params.status ?? 'Outstanding'
  const [stats, fees, settings] = await Promise.all([getRevenueStats(), listFees(), getSettings()])
  const activeFees = fees.filter((f) => f.active)

  return <>
    <PageHeader eyebrow="Workspace" title="Citations & fines" description="Issue citations from the official fee schedule, record payments, and manage installment plans."
      actions={can(me, 'citations.issue') && <Modal trigger={<><Plus className="size-4" />Issue citation</>} title="Issue a citation" description="Usually issued from the case page so it links to the evidence." wide><CitationForm fees={activeFees} canEmail={can(me, 'email.send')} /></Modal>} />

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Collected this month" value={formatBirr(stats.collected_month)} note={`${formatBirr(stats.collected_30d)} in the last 30 days`} tone="good" />
      <StatCard label="Outstanding" value={formatBirr(stats.outstanding)} note={`${stats.issued_month} citation(s) issued this month`} href="/admin/revenue?status=Outstanding" />
      <StatCard label="Overdue" value={formatBirr(stats.overdue_amount)} note={`${stats.overdue_count} citation(s) past due · court referral after ${settings.escalate_after_days} days`} tone={stats.overdue_count ? 'bad' : 'good'} href="/admin/revenue?status=Overdue" />
      <StatCard label="Active payment plans" value={stats.plans_active} note={`${stats.appeals_open} open appeal(s)`} href="/admin/revenue?tab=plans" />
    </div>

    <div className="mt-6"><FilterTabs basePath="/admin/revenue" param="tab" active={tab} params={{}} items={[{ label: 'Citations', value: 'citations' }, { label: 'Payments', value: 'payments' }, { label: 'Payment plans', value: 'plans' }, { label: 'Fee schedule', value: 'fees', count: activeFees.length }]} /></div>

    {tab === 'citations' && await (async () => {
      const rows = await listCitations({ q: params.q, status: status === 'All' ? '' : status })
      return <>
        <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center">
          <FilterTabs basePath="/admin/revenue" param="status" active={status} params={{ tab: 'citations', q: params.q }} items={['Outstanding', 'Overdue', ...CITATION_STATUSES, 'All'].map((s) => ({ label: s, value: s }))} />
          <form className="flex flex-1 gap-2"><input type="hidden" name="status" value={status} />
            <label className="relative flex-1"><span className="sr-only">Search</span><Search className="absolute left-3 top-[0.7rem] size-4 text-[#8996a8]" /><input name="q" defaultValue={params.q} placeholder="Citation, name, phone, case…" className={cn(inputClass, 'mt-0 pl-9')} /></label>
            <button className={`${secondaryButton} h-10`}>Search</button></form>
        </div>
        <Panel className="mt-3" flush>{rows.length === 0 ? <EmptyState title="No citations here" /> : <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b border-[#edf1f5] bg-[#f7f9fc] text-[11px] font-bold uppercase tracking-wider text-[#718096]"><tr><th className="px-5 py-3">Citation</th><th className="px-3 py-3">Offender</th><th className="px-3 py-3 text-right">Amount</th><th className="px-3 py-3 text-right">Balance</th><th className="px-3 py-3">Due</th><th className="px-5 py-3">Status</th></tr></thead>
          <tbody className="divide-y divide-[#edf1f5]">{rows.map((c) => <tr key={c.id} className="hover:bg-[#f7f9fc]">
            <td className="px-5 py-3"><Link href={`/admin/revenue/${c.id}`} className="font-semibold text-[#1d5fa7] hover:underline">{c.ref}</Link><p className="max-w-64 truncate text-xs text-[#718096]">{c.violation}{c.incident_ref ? ` · ${c.incident_ref}` : ''}</p></td>
            <td className="px-3 py-3"><p className="font-semibold">{c.offender_name}</p><p className="text-xs text-[#718096]">{c.offender_phone ?? '—'}</p></td>
            <td className="px-3 py-3 text-right">{formatBirr(c.amount)}</td>
            <td className="px-3 py-3 text-right font-semibold">{formatBirr(c.balance)}</td>
            <td className="px-3 py-3 text-xs">{c.due_date}{c.overdue && <span className="ml-1"><Badge>Overdue</Badge></span>}</td>
            <td className="px-5 py-3"><div className="flex flex-wrap gap-1"><Badge tone={citationTone(c.status)}>{c.status}</Badge>{c.plan_id && <Badge tone="Watch">Plan</Badge>}</div></td>
          </tr>)}</tbody></table></div>}</Panel>
      </>
    })()}

    {tab === 'payments' && await (async () => {
      const rows = await listPayments({ limit: 200 })
      return <Panel className="mt-4" title="Payments" description="Latest 200 payments, newest first" flush>{rows.length === 0 ? <EmptyState title="No payments recorded yet" /> : <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-sm">
        <thead className="border-b border-[#edf1f5] bg-[#f7f9fc] text-[11px] font-bold uppercase tracking-wider text-[#718096]"><tr><th className="px-5 py-3">Paid</th><th className="px-3 py-3">Citation</th><th className="px-3 py-3">Method</th><th className="px-3 py-3">Receipt / reference</th><th className="px-3 py-3 text-right">Amount</th><th className="px-5 py-3">Status</th></tr></thead>
        <tbody className="divide-y divide-[#edf1f5]">{rows.map((p) => <tr key={p.id} className="hover:bg-[#f7f9fc]">
          <td className="px-5 py-3 text-xs text-[#718096]">{formatDate(p.paid_at)}<span className="block">{p.received_by_name ?? 'Online'}</span></td>
          <td className="px-3 py-3"><Link href={`/admin/revenue/${p.citation_id}`} className="font-semibold text-[#1d5fa7] hover:underline">{p.citation_ref}</Link><p className="text-xs text-[#718096]">{p.offender_name}</p></td>
          <td className="px-3 py-3 text-xs">{p.method}</td>
          <td className="px-3 py-3 text-xs">{p.receipt_no ?? '—'}{p.reference && <span className="block text-[#8996a8]">{p.reference}</span>}</td>
          <td className="px-3 py-3 text-right font-semibold">{formatBirr(p.amount)}</td>
          <td className="px-5 py-3"><Badge tone={p.status === 'Confirmed' ? 'Healthy' : p.status === 'Pending' ? 'Watch' : 'Critical'}>{p.status}</Badge></td>
        </tr>)}</tbody></table></div>}</Panel>
    })()}

    {tab === 'plans' && await (async () => {
      const plans = await listPlans()
      return <Panel className="mt-4" title="Payment plans" description="Monthly installments approved for large fines. A plan defaults when an installment is unpaid past the escalation threshold." flush>{plans.length === 0 ? <EmptyState title="No payment plans" text="Approve a plan from a citation's page." /> : <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-sm">
        <thead className="border-b border-[#edf1f5] bg-[#f7f9fc] text-[11px] font-bold uppercase tracking-wider text-[#718096]"><tr><th className="px-5 py-3">Citation</th><th className="px-3 py-3">Progress</th><th className="px-3 py-3">Next installment</th><th className="px-3 py-3 text-right">Paid / total</th><th className="px-5 py-3">Status</th></tr></thead>
        <tbody className="divide-y divide-[#edf1f5]">{plans.map((p) => <tr key={p.id} className="hover:bg-[#f7f9fc]">
          <td className="px-5 py-3"><Link href={`/admin/revenue/${p.citation_id}`} className="font-semibold text-[#1d5fa7] hover:underline">{p.ref}</Link><p className="text-xs text-[#718096]">{p.offender_name}</p></td>
          <td className="px-3 py-3"><div className="flex items-center gap-2"><div className="h-1.5 w-28 rounded-full bg-[#edf1f5]"><div className="h-1.5 rounded-full bg-[#267448]" style={{ width: `${(p.paidCount / p.installments) * 100}%` }} /></div><span className="text-xs">{p.paidCount}/{p.installments}</span></div></td>
          <td className="px-3 py-3 text-xs">{p.next ? <>{formatBirr(p.next.amount - p.next.paid)} due {p.next.due} <Badge tone={p.next.status === 'Overdue' ? 'Critical' : 'New'}>{p.next.status}</Badge></> : '—'}</td>
          <td className="px-3 py-3 text-right text-xs">{formatBirr(p.paid)} / {formatBirr(p.amount)}</td>
          <td className="px-5 py-3"><Badge tone={p.status === 'Active' ? 'New' : p.status === 'Completed' ? 'Healthy' : p.status === 'Defaulted' ? 'Critical' : 'Inactive'}>{p.status}</Badge></td>
        </tr>)}</tbody></table></div>}</Panel>
    })()}

    {tab === 'fees' && <div className="mt-4 grid gap-6 xl:grid-cols-[1fr_340px]">
      <Panel title="Fee schedule" description="Official penalty amounts used when issuing citations" actions={can(me, 'fees.manage') && <Modal trigger={<><Plus className="size-4" />Add fee</>} title="Add a fee" wide><FeeForm /></Modal>} flush>
        <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-[#edf1f5] bg-[#f7f9fc] text-[11px] font-bold uppercase tracking-wider text-[#718096]"><tr><th className="px-5 py-3">Code</th><th className="px-3 py-3">Violation</th><th className="px-3 py-3 text-right">First</th><th className="px-3 py-3 text-right">Repeat</th><th className="px-3 py-3">Days</th><th className="px-3 py-3">Used</th><th className="px-5 py-3" /></tr></thead>
          <tbody className="divide-y divide-[#edf1f5]">{fees.map((f) => <tr key={f.id} className={f.active ? 'hover:bg-[#f7f9fc]' : 'opacity-50'}>
            <td className="px-5 py-3 font-mono text-xs font-semibold">{f.code}</td>
            <td className="px-3 py-3"><p className="font-semibold">{f.violation}</p><p className="text-xs text-[#718096]">{f.category}{f.description && ` · ${f.description}`}</p></td>
            <td className="px-3 py-3 text-right">{formatBirr(f.first_amount)}</td>
            <td className="px-3 py-3 text-right">{formatBirr(f.repeat_amount)}</td>
            <td className="px-3 py-3 text-xs">{f.due_days}</td>
            <td className="px-3 py-3 text-xs">{f.citations}</td>
            <td className="px-5 py-3 text-right">{can(me, 'fees.manage') && <Modal trigger={<><Pencil className="size-3.5" />Edit</>} triggerClassName="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-[#1d5fa7] hover:bg-[#edf3fa]" title={`Edit ${f.code}`} wide><FeeForm fee={f} /></Modal>}</td>
          </tr>)}</tbody></table></div>
      </Panel>
      <Panel title="Collection rules" className="h-fit">
        <ActionForm action={saveRevenueSettings} className="flex flex-col gap-4">
          <fieldset disabled={!can(me, 'fees.manage')} className="flex flex-col gap-4">
            <label className={labelClass}>Refer unpaid citations to court after<span className="mt-1.5 flex items-center gap-2"><input name="escalate_after_days" type="number" min={1} max={365} defaultValue={settings.escalate_after_days} className={cn(inputClass, 'mt-0 w-24')} /><span className="font-normal">days past due</span></span></label>
            <label className={labelClass}>Appeal window<span className="mt-1.5 flex items-center gap-2"><input name="appeal_window_days" type="number" min={1} max={90} defaultValue={settings.appeal_window_days} className={cn(inputClass, 'mt-0 w-24')} /><span className="font-normal">days after issue</span></span></label>
            <label className={labelClass}>Payment instructions for citizens<textarea name="payment_instructions" rows={4} defaultValue={settings.payment_instructions} className={textareaClass} /></label>
          </fieldset>
          {can(me, 'fees.manage') ? <SubmitButton>Save rules</SubmitButton> : <p className="text-[11px] text-[#718096]">Only roles with Fee schedule permission can change these.</p>}
        </ActionForm>
      </Panel>
    </div>}
  </>
}
