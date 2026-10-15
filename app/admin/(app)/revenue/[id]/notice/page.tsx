import { notFound } from 'next/navigation'
import { requirePermission } from '@/lib/auth'
import { getCitation } from '@/lib/enforcement'
import { formatBirr } from '@/lib/money'
import { getSettings } from '@/lib/queries'
import { appUrl } from '@/lib/url'
import { PrintButton } from './print-button'

/** Printable notice of violation (A4). Opens inside the admin shell; the shell is hidden when printing. */
export default async function CitationNoticePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('citations.view')
  const { id } = await params
  const [c, settings, base] = await Promise.all([getCitation(Number(id) || 0), getSettings(), appUrl()])
  if (!c) notFound()
  return <div className="mx-auto max-w-[800px]">
    <style>{`@media print { aside, header, nav, .no-print, [aria-live] { display: none !important } main { padding: 0 !important } body { background: white !important } .lg\\:pl-\\[260px\\] { padding-left: 0 !important } }`}</style>
    <div className="no-print mb-4 flex justify-end"><PrintButton /></div>
    <article className="rounded-xl border border-[#dfe7f0] bg-white p-10 text-[#14233b] print:border-0 print:p-0">
      <header className="flex items-start justify-between border-b-2 border-[#082957] pb-5">
        <div><p className="text-xs font-bold tracking-[0.2em] text-[#a87916]">AACEA</p><h1 className="mt-1 text-xl font-bold">{settings.org_name}</h1><p className="text-sm text-[#52637b]">Notice of violation</p></div>
        <div className="text-right"><p className="text-xs text-[#718096]">Citation number</p><p className="font-mono text-lg font-bold">{c.ref}</p><p className="text-xs text-[#718096]">Issued {new Date(c.issued_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p></div>
      </header>
      <section className="mt-6 grid grid-cols-2 gap-6 text-sm">
        <div><p className="text-xs font-bold uppercase tracking-wider text-[#718096]">Issued to</p><p className="mt-1 font-semibold">{c.offender_name}</p>{c.offender_id_no && <p>ID/licence: {c.offender_id_no}</p>}{c.offender_address && <p>{c.offender_address}</p>}{c.offender_phone && <p>{c.offender_phone}</p>}</div>
        <div><p className="text-xs font-bold uppercase tracking-wider text-[#718096]">Violation</p><p className="mt-1 font-semibold">{c.violation}</p>{c.repeat_offense && <p>Repeat offense</p>}{c.incident_ref && <p>Case {c.incident_ref}{c.sub_city ? ` · ${c.sub_city}` : ''}</p>}<p>Issued by {c.issued_by_name ?? '—'}</p></div>
      </section>
      <section className="mt-8 rounded-lg bg-[#f4f7fb] p-5">
        <div className="flex items-end justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-[#718096]">Amount due</p><p className="text-3xl font-bold">{formatBirr(c.balance)}</p></div><div className="text-right"><p className="text-xs font-bold uppercase tracking-wider text-[#718096]">Pay by</p><p className="text-xl font-bold">{c.due_date}</p></div></div>
      </section>
      <section className="mt-6 space-y-3 text-sm leading-6">
        <p><b>How to pay.</b> {settings.payment_instructions} You can also view this citation and pay online at <b>{base}/pay</b> using your citation number and phone number.</p>
        <p><b>Your right to appeal.</b> If you believe this citation is wrong, you may appeal within {settings.appeal_window_days} days of the issue date at <b>{base}/appeal</b> or at any sub-city office. Payment is paused while an appeal is reviewed.</p>
        <p><b>If you do not pay.</b> Citations that remain unpaid {settings.escalate_after_days} days after the due date are referred for court proceedings. Payment plans may be available for large fines — contact the office before the due date.</p>
      </section>
      {c.notes && <section className="mt-6 text-sm"><p className="text-xs font-bold uppercase tracking-wider text-[#718096]">Inspector notes</p><p className="mt-1 whitespace-pre-wrap">{c.notes}</p></section>}
      <footer className="mt-12 grid grid-cols-2 gap-10 text-xs text-[#52637b]"><div className="border-t border-[#94a3b8] pt-2">Issuing officer signature</div><div className="border-t border-[#94a3b8] pt-2">Received by (offender)</div></footer>
    </article>
  </div>
}
