import { saveServiceRequest } from '@/app/admin/actions'
import { ActionForm, SubmitButton } from '@/components/admin/forms'
import { inputClass, labelClass, textareaClass } from '@/components/admin/ui'
import { SERVICE_CATEGORIES, SERVICE_STATUSES, SUB_CITIES } from '@/lib/constants'
import type { ServiceRequest } from '@/lib/queries'

export function ServiceForm({ staff, request, readOnly }: { staff: { id: number; name: string; district: string }[]; request?: ServiceRequest; readOnly?: boolean }) {
  return <ActionForm action={saveServiceRequest} className="grid gap-4 sm:grid-cols-2">
    <fieldset disabled={readOnly} className="contents">
    {request && <input type="hidden" name="id" value={request.id} />}
    <label className={`${labelClass} sm:col-span-2`}>Title<input name="title" required maxLength={120} defaultValue={request?.title} className={inputClass} /></label>
    <label className={labelClass}>Category<select name="category" defaultValue={request?.category} className={inputClass}>{SERVICE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label>
    <label className={labelClass}>Sub-city<select name="sub_city" defaultValue={request?.sub_city} className={inputClass}>{SUB_CITIES.map((c) => <option key={c}>{c}</option>)}</select></label>
    {request && <label className={labelClass}>Status<select name="status" defaultValue={request.status} className={inputClass}>{SERVICE_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></label>}
    <label className={labelClass}>Due date<input name="due_date" type="date" defaultValue={request?.due_date ?? ''} className={inputClass} /></label>
    <label className={labelClass}>Assign to<select name="assignee_id" defaultValue={request?.assignee_id ?? ''} className={inputClass}><option value="">Unassigned</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.district}</option>)}</select></label>
    <label className={labelClass}>Requester name<input name="requester_name" defaultValue={request?.requester_name ?? ''} className={inputClass} /></label>
    <label className={labelClass}>Requester phone<input name="requester_phone" defaultValue={request?.requester_phone ?? ''} className={inputClass} /></label>
    <label className={`${labelClass} sm:col-span-2`}>Requester email<input name="requester_email" type="email" defaultValue={request?.requester_email ?? ''} className={inputClass} /></label>
    <label className={`${labelClass} sm:col-span-2`}>Notes<textarea name="notes" rows={4} defaultValue={request?.notes} className={textareaClass} /></label>
    </fieldset>
    {readOnly ? <p className="text-xs text-[#718096] sm:col-span-2">Your role can view but not edit service requests.</p> : <div className="flex justify-end sm:col-span-2"><SubmitButton>{request ? 'Save changes' : 'Create request'}</SubmitButton></div>}
  </ActionForm>
}
