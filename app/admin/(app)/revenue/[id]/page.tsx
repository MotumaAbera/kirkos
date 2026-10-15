import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Gavel, Mail, Printer, Undo2 } from 'lucide-react'
import { cancelPaymentPlan, createPaymentPlan, recordPayment, resendNotice, reversePayment, setCitationStatus } from '@/app/admin/enforcement-actions'
import { ActionForm, Modal, SubmitButton } from '@/components/admin/forms'
import { Badge, PageHeader, Panel, formatDate, inputClass, labelClass, secondaryButton, textareaClass } from '@/components/admin/ui'
import { can, requirePermission } from '@/lib/auth'
import { query } from '@/lib/db'
import { PAYMENT_METHODS, getCitation, getPlan, listPayments } from '@/lib/enforcement'
import { formatBirr } from '@/lib/money'

const tone = (s: string) => (s === 'Paid' ? 'Healthy' : s === 'Escalated' ? 'Critical' : s === 'Under appeal' || s === 'Partially paid' ? 'Watch' : s === 'Void' || s === 'Waived' ? 'Inactive' : 'New')

export default async function CitationPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requirePermission('citations.view')
  const { id } = await params
  const c = await getCitation(Number(id) || 0)
  if (!c) notFound()
  const [payments, plan, legal] = await Promise.all([
    listPayments({ citationId: c.id }), getPlan(c.id),
    query<{ id: number; ref: string; type: string; status: string; outcome: string | null }>('select id, ref, type, status, outcome from legal_cases where citation_id = $1 order by created_at desc', [c.id]),
  ])
  const open = ['Unpaid', 'Partially paid', 'Escalated', 'Under appeal'].includes(c.status)
  const today = new Date().toISOString().slice(0, 10)
  const nextMonth = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)

  return <>
    <Link href="/admin/revenue" className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-[#607089] hover:text-[#082957]"><ArrowLeft className="size-3.5" />Back to citations</Link>
    <PageHeader eyebrow={`Citation · issued ${formatDate(c.issued_at, false)} by ${c.issued_by_name ?? 'system'}`} title={c.ref} description={`${c.violation}${c.repeat_offense ? ' (repeat offense)' : ''}`}
      actions={<><Badge tone={tone(c.status)}>{c.status}</Badge>{c.overdue && <Badge>Overdue</Badge>}
        <a href={`/admin/revenue/${c.id}/notice`} target="_blank" rel="noreferrer" className={secondaryButton}><Printer className="size-4" />Print notice</a>
        {c.offender_email && can(me, 'email.send') && can(me, 'citations.issue') && <ActionForm action={resendNotice}><input type="hidden" name="id" value={c.id} /><SubmitButton className={secondaryButton} pendingText="Sending…"><Mail className="size-4" />Email notice</SubmitButton></ActionForm>}</>} />

    <div className="grid gap-4 sm:grid-cols-3">
      <div className="rounded-xl border border-[#dfe7f0] bg-white p-5"><p className="text-xs font-semibold text-[#718096]">Fine</p><p className="mt-2 text-2xl font-bold text-[#082957]">{formatBirr(c.amount)}</p></div>
      <div className="rounded-xl border border-[#dfe7f0] bg-white p-5"><p className="text-xs font-semibold text-[#718096]">Paid</p><p className="mt-2 text-2xl font-bold text-[#267448]">{formatBirr(c.paid)}</p></div>
      <div className="rounded-xl border border-[#dfe7f0] bg-white p-5"><p className="text-xs font-semibold text-[#718096]">Balance · due {c.due_date}</p><p className={`mt-2 text-2xl font-bold ${Number(c.balance) > 0 ? 'text-[#b32d3d]' : 'text-[#267448]'}`}>{formatBirr(c.balance)}</p></div>
    </div>

    <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_360px]">
      <div className="flex flex-col gap-6">
        <Panel title="Payments" flush>
          {payments.length === 0 ? <p className="p-5 text-sm text-[#718096]">No payments yet.</p> : <ul className="divide-y divide-[#edf1f5]">{payments.map((p) => <li key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
            <div className="min-w-0 flex-1"><p className="font-semibold">{formatBirr(p.amount)} · {p.method}</p><p className="text-xs text-[#718096]">{formatDate(p.paid_at)} · receipt {p.receipt_no ?? '—'}{p.reference ? ` · ref ${p.reference}` : ''} · {p.received_by_name ?? 'online'}</p></div>
            <Badge tone={p.status === 'Confirmed' ? 'Healthy' : p.status === 'Pending' ? 'Watch' : 'Critical'}>{p.status}</Badge>
            {p.status === 'Confirmed' && can(me, 'citations.manage') && <Modal trigger={<><Undo2 className="size-3.5" />Reverse</>} triggerClassName="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-[#b32d3d] hover:bg-[#fff0f1]" title="Reverse this payment">
              <ActionForm action={reversePayment} className="flex flex-col gap-3"><input type="hidden" name="id" value={p.id} />
                <p className="text-sm text-[#52637b]">Use this for bounced transfers or receipts entered in error. The payment stays on record as reversed.</p>
                <label className={labelClass}>Reason<textarea name="reason" required rows={2} className={textareaClass} /></label>
                <SubmitButton pendingText="Reversing…">Reverse payment</SubmitButton></ActionForm>
            </Modal>}
          </li>)}</ul>}
          {open && Number(c.balance) > 0 && can(me, 'payments.record') && <div className="border-t border-[#edf1f5] bg-[#fbfcfe] p-5">
            <p className="mb-3 text-sm font-bold">Record a payment</p>
            <ActionForm action={recordPayment} resetOnSuccess className="grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="citation_id" value={c.id} />
              <label className={labelClass}>Amount (ETB)<input name="amount" required inputMode="decimal" defaultValue={plan?.status === 'Active' ? plan.schedule.find((i) => i.status !== 'Paid')?.amount : c.balance} className={inputClass} /></label>
              <label className={labelClass}>Method<select name="method" className={inputClass}>{PAYMENT_METHODS.filter((m) => m !== 'Chapa (online)').map((m) => <option key={m}>{m}</option>)}</select></label>
              <label className={labelClass}>Official receipt number<input name="receipt_no" required className={inputClass} /></label>
              <label className={labelClass}>Bank / transaction reference<input name="reference" className={inputClass} /></label>
              <label className={labelClass}>Date paid<input name="paid_at" type="date" max={today} defaultValue={today} className={inputClass} /></label>
              {c.offender_email && <label className="mt-6 flex items-center gap-2 text-sm"><input type="checkbox" name="send_receipt" defaultChecked className="size-4 accent-[#1d5fa7]" />Email a receipt</label>}
              <div className="sm:col-span-2"><SubmitButton pendingText="Recording…">Record payment</SubmitButton></div>
            </ActionForm>
          </div>}
        </Panel>

        <Panel title="Payment plan" description={plan ? `${plan.installments} monthly installments from ${plan.start_date} · approved by ${plan.approved_by_name ?? '—'}` : 'Split a large fine into monthly installments'}
          actions={plan && ['Active', 'Defaulted'].includes(plan.status) && can(me, 'citations.manage') ? <ActionForm action={cancelPaymentPlan}><input type="hidden" name="id" value={plan.id} /><SubmitButton confirm="Cancel this payment plan?" pendingText="…" className="text-xs font-semibold text-[#b32d3d]">Cancel plan</SubmitButton></ActionForm> : plan ? <Badge tone={plan.status === 'Completed' ? 'Healthy' : plan.status === 'Defaulted' ? 'Critical' : 'Inactive'}>{plan.status}</Badge> : undefined} flush>
          {plan ? <table className="w-full text-left text-sm">
            <thead className="border-b border-[#edf1f5] bg-[#f7f9fc] text-[11px] font-bold uppercase tracking-wider text-[#718096]"><tr><th className="px-5 py-2.5">#</th><th className="px-3 py-2.5">Due</th><th className="px-3 py-2.5 text-right">Amount</th><th className="px-3 py-2.5 text-right">Paid</th><th className="px-5 py-2.5">Status</th></tr></thead>
            <tbody className="divide-y divide-[#edf1f5]">{plan.schedule.map((i) => <tr key={i.seq}><td className="px-5 py-2.5">{i.seq}</td><td className="px-3 py-2.5">{i.due}</td><td className="px-3 py-2.5 text-right">{formatBirr(i.amount)}</td><td className="px-3 py-2.5 text-right">{formatBirr(i.paid)}</td>
              <td className="px-5 py-2.5"><Badge tone={i.status === 'Paid' ? 'Healthy' : i.status === 'Overdue' ? 'Critical' : i.status === 'Upcoming' ? 'Inactive' : 'Watch'}>{i.status}</Badge></td></tr>)}</tbody>
          </table> : open && Number(c.balance) > 0 && can(me, 'citations.manage') ? <ActionForm action={createPaymentPlan} className="grid gap-3 p-5 sm:grid-cols-2">
            <input type="hidden" name="citation_id" value={c.id} />
            <label className={labelClass}>Monthly installments<input name="installments" type="number" min={2} max={24} defaultValue={6} className={inputClass} /></label>
            <label className={labelClass}>First installment due<input name="start_date" type="date" min={today} defaultValue={nextMonth} className={inputClass} /></label>
            <label className={`${labelClass} sm:col-span-2`}>Approval notes<textarea name="notes" rows={2} placeholder="e.g. Business owner showed hardship; agreed at district office" className={textareaClass} /></label>
            <p className="text-xs text-[#718096] sm:col-span-2">While a plan is active the citation is not escalated. A missed installment more than the escalation threshold late marks the plan as defaulted.</p>
            <div className="sm:col-span-2"><SubmitButton>Approve plan</SubmitButton></div>
          </ActionForm> : <p className="p-5 text-sm text-[#718096]">No plan.</p>}
        </Panel>
      </div>

      <div className="flex flex-col gap-6">
        <Panel title="Offender">
          <dl className="flex flex-col gap-2 text-sm">
            <div><dt className="text-xs text-[#718096]">Name</dt><dd className="font-semibold">{c.offender_name}</dd></div>
            {c.offender_id_no && <div><dt className="text-xs text-[#718096]">ID / licence</dt><dd>{c.offender_id_no}</dd></div>}
            <div><dt className="text-xs text-[#718096]">Phone</dt><dd>{c.offender_phone ?? '—'}</dd></div>
            <div><dt className="text-xs text-[#718096]">Email</dt><dd>{c.offender_email ?? '—'}</dd></div>
            {c.offender_address && <div><dt className="text-xs text-[#718096]">Address</dt><dd>{c.offender_address}</dd></div>}
            {c.incident_id && <div><dt className="text-xs text-[#718096]">Case</dt><dd><Link href={`/admin/incidents/${c.incident_id}`} className="font-semibold text-[#1d5fa7] hover:underline">{c.incident_ref}</Link></dd></div>}
          </dl>
        </Panel>

        <Panel title="Legal" actions={can(me, 'legal.manage') && open ? <Link href={`/admin/legal?new=1&citation=${encodeURIComponent(c.ref)}`} className="inline-flex items-center gap-1 text-xs font-semibold text-[#1d5fa7] hover:underline"><Gavel className="size-3.5" />Open case</Link> : undefined}>
          {legal.length === 0 ? <p className="text-sm text-[#718096]">No appeals or court referrals.</p> : <ul className="flex flex-col gap-2">{legal.map((l) => <li key={l.id}>
            <Link href={`/admin/legal/${l.id}`} className="flex items-center justify-between gap-2 rounded-lg border border-[#edf1f5] p-3 text-sm hover:bg-[#f7f9fc]"><span><b>{l.ref}</b><span className="block text-xs text-[#718096]">{l.type}{l.outcome ? ` · ${l.outcome}` : ''}</span></span><Badge tone={l.status === 'Closed' || l.status === 'Decided' ? 'Inactive' : 'Watch'}>{l.status}</Badge></Link>
          </li>)}</ul>}
        </Panel>

        {can(me, 'citations.manage') && <Panel title="Adjust citation">
          <ActionForm action={setCitationStatus} resetOnSuccess className="flex flex-col gap-3">
            <input type="hidden" name="id" value={c.id} />
            <label className={labelClass}>Action<select name="action" className={inputClass}>
              {open && <option value="extend">Extend the due date</option>}
              {open && <option value="waive">Waive (forgive the balance)</option>}
              {c.status !== 'Void' && <option value="void">Void (issued in error)</option>}
              {['Void', 'Waived'].includes(c.status) && <option value="reinstate">Reinstate</option>}
            </select></label>
            <label className={labelClass}>New due date (for extensions)<input name="due_date" type="date" min={today} className={inputClass} /></label>
            <label className={labelClass}>Reason (kept on record)<textarea name="reason" required rows={2} className={textareaClass} /></label>
            <SubmitButton confirm="Apply this change to the citation?">Apply</SubmitButton>
          </ActionForm>
        </Panel>}

        {c.notes && <Panel title="Notes & history"><p className="whitespace-pre-wrap text-sm text-[#33445c]">{c.notes}</p></Panel>}
      </div>
    </div>
  </>
}
