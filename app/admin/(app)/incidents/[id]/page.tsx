import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Mail, MapPin, Navigation, Phone, Plus, Send, Trash2, UserRound } from 'lucide-react'
import { addIncidentNote, deleteIncident, updateIncident } from '@/app/admin/actions'
import { emailReporter } from '@/app/admin/email-actions'
import { setIncidentLocation } from '@/app/admin/enforcement-actions'
import { CitationForm } from '@/components/admin/citation-form'
import { EvidenceUploader } from '@/components/admin/evidence'
import { EvidenceGallery } from '@/components/admin/evidence-gallery'
import { ActionForm, Modal, SubmitButton } from '@/components/admin/forms'
import { LocationPicker } from '@/components/map/location-picker'
import { Badge, PageHeader, Panel, formatDate, inputClass, labelClass, textareaClass, timeAgo } from '@/components/admin/ui'
import { can, requirePermission } from '@/lib/auth'
import { INCIDENT_STATUSES, PRIORITIES } from '@/lib/constants'
import { query } from '@/lib/db'
import { listCheckins, listEvidence, listFees } from '@/lib/enforcement'
import { SUB_CITY_CENTRES, directionsUrl } from '@/lib/geo'
import { formatBirr } from '@/lib/money'
import { getIncident, getSettings, listAssignableStaff } from '@/lib/queries'

export default async function IncidentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requirePermission('incidents.view')
  const { id } = await params
  const settings = await getSettings()
  const [data, team] = await Promise.all([getIncident(Number(id) || 0, settings.response_target_hours), listAssignableStaff()])
  if (!data) notFound()
  const { incident: item, notes } = data
  const canEdit = can(staff, 'incidents.edit')
  const [evidence, checkins, citations, fees] = await Promise.all([
    can(staff, 'evidence.view') ? listEvidence({ incidentId: item.id }) : Promise.resolve([]),
    listCheckins(item.id),
    can(staff, 'citations.view') ? query<{ id: number; ref: string; offender_name: string; amount: string; status: string }>('select id, ref, offender_name, amount::text, status from citations where incident_id = $1 order by issued_at desc', [item.id]) : Promise.resolve([]),
    can(staff, 'citations.issue') ? listFees(true) : Promise.resolve([]),
  ])
  const point: [number, number] | null = item.lat !== null && item.lng !== null ? [item.lat, item.lng] : null
  const approximate = (item.location_source ?? '').startsWith('Approximate')
  const hoursOpen = Math.round(((item.resolved_at ? new Date(item.resolved_at) : new Date()).getTime() - new Date(item.created_at).getTime()) / 3600000)

  return <>
    <Link href="/admin/incidents" className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-[#607089] hover:text-[#082957]"><ArrowLeft className="size-3.5" />Back to incidents</Link>
    <PageHeader eyebrow={`${item.ref} · ${item.category}`} title={item.title} description={`Received ${formatDate(item.created_at)} via ${item.source} · open ${hoursOpen}h`}
      actions={<><Badge>{item.status}</Badge><Badge>{item.priority}</Badge>{item.overdue && <Badge>Overdue</Badge>}</>} />

    <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
      <div className="flex flex-col gap-6">
        <Panel title="Report details">
          <p className="whitespace-pre-wrap text-sm leading-6 text-[#33445c]">{item.description || 'No description provided.'}</p>
          <dl className="mt-5 grid gap-4 border-t border-[#edf1f5] pt-5 text-sm sm:grid-cols-2">
            <div className="flex gap-3"><MapPin className="mt-0.5 size-4 shrink-0 text-[#a87916]" /><div><dt className="text-xs text-[#718096]">Location</dt><dd className="font-semibold">{item.sub_city}{item.woreda ? `, ${item.woreda}` : ''}</dd>{item.landmark && <dd className="text-xs text-[#52637b]">{item.landmark}</dd>}</div></div>
            <div className="flex gap-3"><UserRound className="mt-0.5 size-4 shrink-0 text-[#a87916]" /><div><dt className="text-xs text-[#718096]">Reporter</dt>
              {item.anonymous ? <dd className="font-semibold">Anonymous</dd> : <>
                <dd className="font-semibold">{item.reporter_name || 'Not provided'}</dd>
                {item.reporter_phone && <dd className="flex items-center gap-1 text-xs"><Phone className="size-3" /><a href={`tel:${item.reporter_phone}`} className="hover:underline">{item.reporter_phone}</a></dd>}
                {item.reporter_email && <dd className="flex items-center gap-1 text-xs"><Mail className="size-3" /><a href={`mailto:${item.reporter_email}`} className="hover:underline">{item.reporter_email}</a></dd>}
              </>}
            </div></div>
          </dl>
        </Panel>

        <Panel title="Location" description={point ? `${item.location_source ?? 'Map point'}${approximate ? ' – tap the exact spot to correct it' : ''}` : 'No map point yet – tap the map to set one'}
          actions={point ? <a href={directionsUrl(point)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-[#1d5fa7] hover:underline"><Navigation className="size-3.5" />Directions</a> : undefined}>
          {canEdit ? <ActionForm action={setIncidentLocation} className="flex flex-col gap-3">
            <input type="hidden" name="id" value={item.id} />
            <LocationPicker value={point} centre={SUB_CITY_CENTRES[item.sub_city]} height={240} />
            <div><SubmitButton pendingText="Saving…"><MapPin className="size-4" />Save location</SubmitButton></div>
          </ActionForm> : <LocationPicker value={point} centre={SUB_CITY_CENTRES[item.sub_city]} readOnly height={220} />}
        </Panel>

        {can(staff, 'evidence.view') && <Panel title="Evidence" description={`${evidence.length} file(s) · fingerprinted, time-stamped, and every view is logged`}>
          <EvidenceGallery items={evidence} />
          {can(staff, 'evidence.upload') && <div className="mt-5 border-t border-[#edf1f5] pt-5"><EvidenceUploader incidentId={item.id} /></div>}
        </Panel>}

        <Panel title="Activity & notes" description={`${notes.length} entr${notes.length === 1 ? 'y' : 'ies'}`}>
          {canEdit && <ActionForm action={addIncidentNote} resetOnSuccess className="mb-5">
            <input type="hidden" name="id" value={item.id} />
            <label className="sr-only" htmlFor="note-body">Add a note</label>
            <textarea id="note-body" name="body" rows={2} required placeholder="Add an inspection note, call summary, or next step…" className={textareaClass} />
            <div className="mt-2 flex justify-end"><SubmitButton pendingText="Adding…">Add note</SubmitButton></div>
          </ActionForm>}
          {notes.length === 0 ? <p className="text-sm text-[#718096]">No activity yet.</p> : <ol className="relative flex flex-col gap-4 border-l border-[#dfe7f0] pl-5">
            {notes.map((n) => <li key={n.id} className="relative">
              <span className="absolute -left-[25px] top-1.5 size-2.5 rounded-full border-2 border-white bg-[#1d5fa7]" />
              <p className="text-xs text-[#718096]"><b className="text-[#14233b]">{n.staff_name ?? 'System'}</b> · {timeAgo(n.created_at)}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-[#33445c]">{n.body}</p>
            </li>)}
          </ol>}
        </Panel>
      </div>

      <div className="flex flex-col gap-6">
        {canEdit && <Panel title="Manage case">
          <ActionForm action={updateIncident} clearOnSuccess={["note"]} className="flex flex-col gap-4">
            <input type="hidden" name="id" value={item.id} />
            <label className={labelClass}>Status<select name="status" defaultValue={item.status} className={inputClass}>{INCIDENT_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></label>
            <label className={labelClass}>Priority<select name="priority" defaultValue={item.priority} className={inputClass}>{PRIORITIES.map((p) => <option key={p}>{p}</option>)}</select></label>
            <label className={labelClass}>Assigned to<select name="assignee_id" defaultValue={item.assignee_id ?? ''} className={inputClass}><option value="">Unassigned</option>
              {item.assignee_id && !team.some((t) => t.id === item.assignee_id) && <option value={item.assignee_id}>{item.assignee_name} (not active)</option>}
              {team.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.district}</option>)}</select></label>
            <label className={labelClass}>Note for this update (optional)<textarea name="note" rows={2} className={textareaClass} /></label>
            <SubmitButton>Save changes</SubmitButton>
            {settings.require_approval_close && !can(staff, 'incidents.close') && <p className="text-[11px] text-[#718096]">Your role cannot close cases while supervisor approval is required.</p>}
          </ActionForm>
        </Panel>}
        {canEdit && can(staff, 'email.send') && item.reporter_email && !item.anonymous && <Panel title="Email the reporter" description={item.reporter_email}>
          <ActionForm action={emailReporter} resetOnSuccess className="flex flex-col gap-3">
            <input type="hidden" name="id" value={item.id} />
            <label className={labelClass}>Subject<input name="subject" defaultValue={`Update on your report ${item.ref}`} className={inputClass} /></label>
            <label className={labelClass}>Message<textarea name="message" rows={4} required minLength={5} defaultValue={`Hello${item.reporter_name ? ` ${item.reporter_name}` : ''},

Thank you for your report ${item.ref}. `} className={textareaClass} /></label>
            <SubmitButton pendingText="Sending…"><Send className="size-4" />Send email</SubmitButton>
            <p className="text-[11px] text-[#718096]">The message is saved to this case&apos;s activity.</p>
          </ActionForm>
        </Panel>}
        {can(staff, 'citations.view') && <Panel title="Citations" description={citations.length ? undefined : 'No fines issued for this case'}
          actions={can(staff, 'citations.issue') ? <Modal trigger={<><Plus className="size-3.5" />Issue</>} triggerClassName="inline-flex items-center gap-1 rounded-md bg-[#082957] px-2.5 py-1.5 text-xs font-semibold text-white" title={`Issue a citation for ${item.ref}`} wide>
            <CitationForm fees={fees} incidentId={item.id} category={item.category} canEmail={can(staff, 'email.send')} /></Modal> : undefined}>
          {citations.length > 0 && <ul className="flex flex-col gap-2">{citations.map((c) => <li key={c.id}><Link href={`/admin/revenue/${c.id}`} className="flex items-center justify-between gap-2 rounded-lg border border-[#edf1f5] p-3 text-sm hover:bg-[#f7f9fc]">
            <span><b>{c.ref}</b><span className="block text-xs text-[#718096]">{c.offender_name} · {formatBirr(c.amount)}</span></span><Badge tone={c.status === 'Paid' ? 'Healthy' : c.status === 'Escalated' ? 'Critical' : 'Watch'}>{c.status}</Badge></Link></li>)}</ul>}
        </Panel>}

        {checkins.length > 0 && <Panel title="Site check-ins" description="Where inspectors confirmed they were on site">
          <ul className="flex flex-col gap-2 text-sm">{checkins.map((c) => <li key={c.id} className="flex items-start gap-2"><MapPin className="mt-0.5 size-3.5 shrink-0 text-[#a87916]" />
            <span><b>{c.staff_name ?? '—'}</b> · {formatDate(c.created_at)}<a className="block text-xs text-[#1d5fa7] hover:underline" target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/?mlat=${c.lat}&mlon=${c.lng}#map=18/${c.lat}/${c.lng}`}>{c.lat.toFixed(5)}, {c.lng.toFixed(5)}{c.accuracy ? ` (±${Math.round(c.accuracy)} m)` : ''}</a>{c.note && <span className="block text-xs text-[#52637b]">{c.note}</span>}</span></li>)}</ul>
        </Panel>}

        <Panel title="Timeline">
          <dl className="flex flex-col gap-3 text-sm">
            <div className="flex justify-between"><dt className="text-[#718096]">Received</dt><dd className="font-semibold">{formatDate(item.created_at)}</dd></div>
            <div className="flex justify-between"><dt className="text-[#718096]">Last updated</dt><dd className="font-semibold">{formatDate(item.updated_at)}</dd></div>
            <div className="flex justify-between"><dt className="text-[#718096]">Resolved</dt><dd className="font-semibold">{formatDate(item.resolved_at)}</dd></div>
            <div className="flex justify-between"><dt className="text-[#718096]">Response target</dt><dd className="font-semibold">{settings.response_target_hours}h</dd></div>
          </dl>
        </Panel>
        {can(staff, 'incidents.delete') && <ActionForm action={deleteIncident}>
          <input type="hidden" name="id" value={item.id} />
          <SubmitButton confirm={`Delete ${item.ref} permanently? This cannot be undone.`} pendingText="Deleting…" className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[#f6cdd2] bg-white px-4 py-2.5 text-sm font-semibold text-[#b32d3d] hover:bg-[#fff0f1]"><Trash2 className="size-4" />Delete case</SubmitButton>
        </ActionForm>}
      </div>
    </div>
  </>
}
