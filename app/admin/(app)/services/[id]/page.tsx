import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Trash2 } from 'lucide-react'
import { deleteServiceRequest } from '@/app/admin/actions'
import { emailRequester } from '@/app/admin/site-actions'
import { ActionForm, SubmitButton } from '@/components/admin/forms'
import { ServiceForm } from '@/components/admin/service-form'
import { Badge, PageHeader, Panel, formatDate, inputClass, labelClass, textareaClass } from '@/components/admin/ui'
import { can, requirePermission } from '@/lib/auth'
import { getServiceRequest, listAssignableStaff } from '@/lib/queries'

export default async function ServiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requirePermission('services.view')
  const { id } = await params
  const [request, team] = await Promise.all([getServiceRequest(Number(id) || 0), listAssignableStaff()])
  if (!request) notFound()

  return <>
    <Link href="/admin/services" className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-[#607089] hover:text-[#082957]"><ArrowLeft className="size-3.5" />Back to service requests</Link>
    <PageHeader eyebrow={`${request.ref} · ${request.category}`} title={request.title} description={`Created ${formatDate(request.created_at)} · last updated ${formatDate(request.updated_at)}`}
      actions={<>{request.source === 'Public portal' && <Badge tone="New">From website</Badge>}<Badge>{request.status}</Badge>{request.overdue && <Badge>Overdue</Badge>}</>} />
    <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
      <Panel title="Request details"><ServiceForm staff={team} request={request} readOnly={!can(staff, 'services.edit')} /></Panel>
      <div className="flex flex-col gap-6">
        <Panel title="Summary">
          <dl className="flex flex-col gap-3 text-sm">
            <div className="flex justify-between"><dt className="text-[#718096]">Assignee</dt><dd className="font-semibold">{request.assignee_name ?? 'Unassigned'}</dd></div>
            <div className="flex justify-between"><dt className="text-[#718096]">Due</dt><dd className="font-semibold">{formatDate(request.due_date, false)}</dd></div>
            <div className="flex justify-between"><dt className="text-[#718096]">Closed</dt><dd className="font-semibold">{formatDate(request.closed_at)}</dd></div>
            <div className="flex justify-between"><dt className="text-[#718096]">Source</dt><dd className="font-semibold">{request.source}</dd></div>
          </dl>
        </Panel>
        {request.requester_email && can(staff, 'email.send') && can(staff, 'services.edit') && <Panel title="Reply by email" description={request.requester_email}>
          <ActionForm action={emailRequester} resetOnSuccess className="flex flex-col gap-3">
            <input type="hidden" name="id" value={request.id} />
            <label className={labelClass}>Subject<input name="subject" defaultValue={`Your request ${request.ref}`} className={inputClass} /></label>
            <label className={labelClass}>Message<textarea name="message" required rows={5} defaultValue={`Hello${request.requester_name ? ` ${request.requester_name}` : ''},\n\n`} className={textareaClass} /></label>
            <SubmitButton pendingText="Sending…">Send email</SubmitButton>
            <p className="text-[11px] text-[#718096]">The reply is saved in the request notes.</p>
          </ActionForm>
        </Panel>}
        {can(staff, 'services.delete') && <ActionForm action={deleteServiceRequest}>
          <input type="hidden" name="id" value={request.id} />
          <SubmitButton confirm={`Delete ${request.ref}? This cannot be undone.`} pendingText="Deleting…" className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[#f6cdd2] bg-white px-4 py-2.5 text-sm font-semibold text-[#b32d3d] hover:bg-[#fff0f1]"><Trash2 className="size-4" />Delete request</SubmitButton>
        </ActionForm>}
      </div>
    </div>
  </>
}
