import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Navigation, Phone } from 'lucide-react'
import { addIncidentNote, updateIncident } from '@/app/admin/actions'
import { CitationForm } from '@/components/admin/citation-form'
import { EvidenceUploader } from '@/components/admin/evidence'
import { EvidenceGallery } from '@/components/admin/evidence-gallery'
import { ActionForm, SubmitButton } from '@/components/admin/forms'
import { Badge, timeAgo } from '@/components/admin/ui'
import { CheckInButton } from '@/components/field/check-in'
import { can, requireStaff } from '@/lib/auth'
import { listEvidence, listFees } from '@/lib/enforcement'
import { directionsUrl } from '@/lib/geo'
import { getIncident, getSettings } from '@/lib/queries'

const section = 'rounded-2xl bg-white p-4 shadow-sm'
const big = 'h-12 w-full rounded-xl text-sm font-bold'

export default async function FieldCasePage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff()
  if (!can(staff, 'incidents.view')) notFound()
  const { id } = await params
  const settings = await getSettings()
  const data = await getIncident(Number(id) || 0, settings.response_target_hours)
  if (!data) notFound()
  const { incident: c, notes } = data
  const [evidence, fees] = await Promise.all([can(staff, 'evidence.view') ? listEvidence({ incidentId: c.id }) : Promise.resolve([]), can(staff, 'citations.issue') ? listFees(true) : Promise.resolve([])])
  const canEdit = can(staff, 'incidents.edit')
  const point: [number, number] | null = c.lat !== null && c.lng !== null ? [c.lat, c.lng] : null

  return <div className="flex flex-col gap-4">
    <Link href="/field" className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#607089]"><ArrowLeft className="size-3.5" />My cases</Link>
    <section className={section}>
      <p className="text-[11px] font-semibold text-[#a87916]">{c.ref} · {c.category}</p>
      <h1 className="mt-1 text-lg font-bold leading-tight">{c.title}</h1>
      <div className="mt-2 flex flex-wrap gap-1"><Badge>{c.status}</Badge><Badge>{c.priority}</Badge>{c.overdue && <Badge>Overdue</Badge>}</div>
      <p className="mt-3 text-sm leading-6 text-[#33445c]">{c.description || 'No description.'}</p>
      <p className="mt-2 text-sm"><b>{c.sub_city}{c.woreda ? `, ${c.woreda}` : ''}</b>{c.landmark && <span className="block text-[#52637b]">{c.landmark}</span>}</p>
      {!c.anonymous && c.reporter_phone && <a href={`tel:${c.reporter_phone}`} className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-[#1d5fa7]"><Phone className="size-4" />Call reporter ({c.reporter_name ?? c.reporter_phone})</a>}
      {point && <a href={directionsUrl(point)} target="_blank" rel="noreferrer" className={`${big} mt-4 flex items-center justify-center gap-2 bg-[#082957] text-white`}><Navigation className="size-5" />Directions{(c.location_source ?? '').startsWith('Approximate') && ' (approximate)'}</a>}
    </section>

    {can(staff, 'field.use') && <section className={section}><h2 className="mb-3 font-bold">Check in</h2><CheckInButton incidentId={c.id} /></section>}

    {can(staff, 'evidence.upload') && <section className={section}><h2 className="mb-3 font-bold">Photos & evidence</h2>
      <EvidenceUploader incidentId={c.id} source="Field app" camera />
      {evidence.length > 0 && <div className="mt-4"><EvidenceGallery items={evidence} /></div>}
    </section>}

    {canEdit && <section className={section}><h2 className="mb-3 font-bold">Update status</h2>
      <ActionForm action={updateIncident} clearOnSuccess={['note']} className="flex flex-col gap-2">
        <input type="hidden" name="id" value={c.id} />
        <select name="status" defaultValue={c.status} className="h-12 rounded-xl border border-[#d8e1ec] bg-white px-3 text-sm">{['In progress', 'Escalated', 'Resolved'].concat(c.status === 'New' ? ['New'] : []).map((s) => <option key={s}>{s}</option>)}</select>
        <textarea name="note" rows={2} placeholder="What did you find / do?" className="rounded-xl border border-[#d8e1ec] p-3 text-sm" />
        <SubmitButton className={`${big} bg-[#082957] text-white disabled:opacity-60`}>Save update</SubmitButton>
      </ActionForm>
    </section>}

    {fees.length > 0 && <section className={section}><h2 className="mb-3 font-bold">Issue a citation</h2><CitationForm fees={fees} incidentId={c.id} category={c.category} canEmail={can(staff, 'email.send')} /></section>}

    {canEdit && <section className={section}><h2 className="mb-3 font-bold">Add a note</h2>
      <ActionForm action={addIncidentNote} resetOnSuccess className="flex flex-col gap-2"><input type="hidden" name="id" value={c.id} />
        <textarea name="body" required rows={2} className="rounded-xl border border-[#d8e1ec] p-3 text-sm" />
        <SubmitButton className={`${big} border border-[#d8e1ec] bg-white text-[#082957]`}>Add note</SubmitButton></ActionForm>
    </section>}

    <section className={section}><h2 className="mb-3 font-bold">History</h2>
      <ol className="flex flex-col gap-3 text-sm">{notes.slice(0, 15).map((n) => <li key={n.id}><p className="text-xs text-[#718096]"><b className="text-[#14233b]">{n.staff_name ?? 'System'}</b> · {timeAgo(n.created_at)}</p><p className="whitespace-pre-wrap">{n.body}</p></li>)}</ol>
    </section>
  </div>
}
