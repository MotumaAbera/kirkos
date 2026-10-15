import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, CalendarPlus, Gavel } from 'lucide-react'
import { closeLegalCase, recordDecision, scheduleHearing, updateHearing } from '@/app/admin/enforcement-actions'
import { EvidenceUploader } from '@/components/admin/evidence'
import { EvidenceGallery } from '@/components/admin/evidence-gallery'
import { ActionForm, SubmitButton } from '@/components/admin/forms'
import { Badge, PageHeader, Panel, formatDate, inputClass, labelClass, textareaClass } from '@/components/admin/ui'
import { can, requirePermission } from '@/lib/auth'
import { HEARING_STATUSES, LEGAL_OUTCOMES, getLegalCase, listEvidence, listHearings } from '@/lib/enforcement'
import { formatBirr } from '@/lib/money'

const TZ = 'Africa/Addis_Ababa'
const when = (d: Date) => new Date(d).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: TZ })

export default async function LegalCasePage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requirePermission('legal.view')
  const { id } = await params
  const lc = await getLegalCase(Number(id) || 0)
  if (!lc) notFound()
  const [hearings, evidence] = await Promise.all([listHearings({ caseId: lc.id }), can(me, 'evidence.view') ? listEvidence({ legalCaseId: lc.id }) : Promise.resolve([])])
  const manage = can(me, 'legal.manage')
  const closed = lc.status === 'Closed'

  return <>
    <Link href="/admin/legal" className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-[#607089] hover:text-[#082957]"><ArrowLeft className="size-3.5" />Back to legal & appeals</Link>
    <PageHeader eyebrow={`${lc.type} · opened ${formatDate(lc.created_at)}${lc.created_by_name ? ` by ${lc.created_by_name}` : ''}`} title={lc.ref} description={lc.appellant_name ?? undefined}
      actions={<><Badge tone={lc.status === 'Closed' ? 'Inactive' : lc.status === 'Decided' ? 'Healthy' : 'Watch'}>{lc.status}</Badge>{lc.outcome && <Badge tone="Inactive">{lc.outcome}</Badge>}
        {manage && <ActionForm action={closeLegalCase}><input type="hidden" name="id" value={lc.id} />{closed && <input type="hidden" name="reopen" value="1" />}
          <SubmitButton confirm={closed ? 'Reopen this case?' : 'Close this case? No further hearings can be scheduled.'} className="rounded-lg border border-[#d8e1ec] bg-white px-3 py-2 text-xs font-semibold" pendingText="…">{closed ? 'Reopen' : 'Close case'}</SubmitButton></ActionForm>}</>} />

    <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
      <div className="flex flex-col gap-6">
        <Panel title="Grounds">
          <p className="whitespace-pre-wrap text-sm leading-6 text-[#33445c]">{lc.reason || '—'}</p>
          {lc.outcome && <div className="mt-5 rounded-lg border border-[#c7e9d4] bg-[#f3fbf6] p-4 text-sm">
            <p className="font-bold text-[#267448]">Decision: {lc.outcome}{lc.outcome_amount ? ` – fine reduced to ${formatBirr(lc.outcome_amount)}` : ''}</p>
            <p className="mt-1 text-xs text-[#52637b]">{lc.decided_at && formatDate(lc.decided_at)}</p>
            <p className="mt-2 whitespace-pre-wrap text-[#33445c]">{lc.decision_notes}</p>
          </div>}
        </Panel>

        <Panel title="Hearings" description={`${hearings.length} scheduled or held · times in Addis Ababa`} flush>
          {hearings.length === 0 ? <p className="p-5 text-sm text-[#718096]">No hearings yet.</p> : <ul className="divide-y divide-[#edf1f5]">{hearings.map((h) => <li key={h.id} className="flex flex-wrap items-start gap-3 px-5 py-3 text-sm">
            <div className="min-w-0 flex-1"><p className="font-semibold">{when(h.scheduled_at)}</p><p className="text-xs text-[#718096]">{h.location}{h.presiding ? ` · presiding: ${h.presiding}` : ''}</p>{h.notes && <p className="mt-1 whitespace-pre-wrap text-xs text-[#52637b]">{h.notes}</p>}</div>
            {manage && !closed ? <ActionForm action={updateHearing} hideMessage className="flex items-center gap-2"><input type="hidden" name="id" value={h.id} />
              <select name="status" defaultValue={h.status} aria-label="Hearing status" className="h-8 rounded-md border border-[#d8e1ec] bg-white px-2 text-xs">{HEARING_STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
              <input name="notes" placeholder="Note" className="h-8 w-28 rounded-md border border-[#d8e1ec] px-2 text-xs" />
              <SubmitButton className="h-8 rounded-md bg-[#082957] px-2.5 text-xs font-semibold text-white" pendingText="…">Save</SubmitButton></ActionForm>
              : <Badge tone={h.status === 'Held' ? 'Healthy' : h.status === 'Scheduled' ? 'New' : 'Inactive'}>{h.status}</Badge>}
          </li>)}</ul>}
          {manage && !closed && <div className="border-t border-[#edf1f5] bg-[#fbfcfe] p-5">
            <p className="mb-3 flex items-center gap-2 text-sm font-bold"><CalendarPlus className="size-4" />Schedule a hearing</p>
            <ActionForm action={scheduleHearing} resetOnSuccess className="grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="legal_case_id" value={lc.id} />
              <label className={labelClass}>Date & time<input name="scheduled_at" type="datetime-local" required className={inputClass} /></label>
              <label className={labelClass}>Location<input name="location" required placeholder="e.g. Head office, Hearing room 2" className={inputClass} /></label>
              <label className={labelClass}>Presiding officer / panel<input name="presiding" className={inputClass} /></label>
              <label className={labelClass}>Notes<input name="notes" className={inputClass} /></label>
              {lc.appellant_email && <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="notify" defaultChecked className="size-4 accent-[#1d5fa7]" />Email the hearing notice to {lc.appellant_email}</label>}
              <div className="sm:col-span-2"><SubmitButton pendingText="Scheduling…">Schedule hearing</SubmitButton></div>
            </ActionForm>
          </div>}
        </Panel>

        {can(me, 'evidence.view') && <Panel title="Documents & evidence" description="Appeal letters, IDs, permits, photos. Each file is fingerprinted and every view is logged.">
          <EvidenceGallery items={evidence} />
          {can(me, 'evidence.upload') && !closed && <div className="mt-5 border-t border-[#edf1f5] pt-5"><EvidenceUploader legalCaseId={lc.id} /></div>}
        </Panel>}
      </div>

      <div className="flex flex-col gap-6">
        <Panel title="Parties & citation">
          <dl className="flex flex-col gap-2 text-sm">
            <div><dt className="text-xs text-[#718096]">{lc.type === 'Appeal' ? 'Appellant' : 'Respondent'}</dt><dd className="font-semibold">{lc.appellant_name ?? '—'}</dd></div>
            <div><dt className="text-xs text-[#718096]">Contact</dt><dd>{[lc.appellant_phone, lc.appellant_email].filter(Boolean).join(' · ') || '—'}</dd></div>
            {lc.citation_ref && <div><dt className="text-xs text-[#718096]">Citation</dt><dd><Link href={`/admin/revenue/${lc.citation_id}`} className="font-semibold text-[#1d5fa7] hover:underline">{lc.citation_ref}</Link> · {formatBirr(lc.amount ?? 0)} · balance {formatBirr(lc.balance ?? 0)}</dd></div>}
            {lc.incident_ref && <div><dt className="text-xs text-[#718096]">Original case</dt><dd><Link href={`/admin/incidents/${lc.incident_id}`} className="font-semibold text-[#1d5fa7] hover:underline">{lc.incident_ref}</Link></dd></div>}
          </dl>
        </Panel>

        {manage && !closed && <Panel title={lc.outcome ? 'Revise the decision' : 'Record the decision'}>
          <ActionForm action={recordDecision} className="flex flex-col gap-3">
            <input type="hidden" name="id" value={lc.id} />
            <label className={labelClass}>Decision<select name="outcome" defaultValue={lc.outcome ?? ''} required className={inputClass}><option value="" disabled>Choose…</option>{LEGAL_OUTCOMES.map((o) => <option key={o}>{o}</option>)}</select></label>
            <label className={labelClass}>Reduced amount (ETB, only for &quot;Reduced&quot;)<input name="outcome_amount" inputMode="decimal" className={inputClass} /></label>
            <label className={labelClass}>Reasons<textarea name="decision_notes" required minLength={10} rows={4} defaultValue={lc.decision_notes} className={textareaClass} /></label>
            {lc.appellant_email && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="notify" defaultChecked className="size-4 accent-[#1d5fa7]" />Email the decision</label>}
            <ul className="space-y-1 rounded-lg bg-[#f7f9fc] p-3 text-[11px] leading-4 text-[#52637b]">
              <li><b>Upheld / Withdrawn</b> – citation stands; payment due again.</li>
              <li><b>Reduced</b> – citation amount is lowered.</li>
              <li><b>Dismissed</b> – citation is waived.</li>
              <li><b>Referred to court</b> – citation is escalated.</li>
            </ul>
            <SubmitButton confirm="Record this decision? It updates the citation." pendingText="Saving…"><Gavel className="size-4" />Record decision</SubmitButton>
          </ActionForm>
        </Panel>}
      </div>
    </div>
  </>
}
