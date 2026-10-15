import { createIncident } from '@/app/admin/actions'
import { ActionForm, SubmitButton } from '@/components/admin/forms'
import { inputClass, labelClass, textareaClass } from '@/components/admin/ui'
import { INCIDENT_CATEGORIES, PRIORITIES, SUB_CITIES } from '@/lib/constants'

export function IncidentForm({ staff }: { staff: { id: number; name: string; district: string }[] }) {
  return <ActionForm action={createIncident} className="grid gap-4 sm:grid-cols-2">
    <label className={`${labelClass} sm:col-span-2`}>Title<input name="title" required maxLength={120} placeholder="e.g. Unpermitted construction on public land" className={inputClass} /></label>
    <label className={labelClass}>Category<select name="category" required className={inputClass}>{INCIDENT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label>
    <label className={labelClass}>Priority<select name="priority" defaultValue="Medium" className={inputClass}>{PRIORITIES.map((p) => <option key={p}>{p}</option>)}</select></label>
    <label className={labelClass}>Sub-city<select name="sub_city" required className={inputClass}>{SUB_CITIES.map((c) => <option key={c}>{c}</option>)}</select></label>
    <label className={labelClass}>Woreda<input name="woreda" placeholder="Woreda 03" className={inputClass} /></label>
    <label className={`${labelClass} sm:col-span-2`}>Landmark<input name="landmark" placeholder="Street, building, or nearby landmark" className={inputClass} /></label>
    <label className={`${labelClass} sm:col-span-2`}>Description<textarea name="description" rows={3} className={textareaClass} /></label>
    <label className={labelClass}>Source<select name="source" className={inputClass}>{['Phone', 'Walk-in', 'Field patrol'].map((s) => <option key={s}>{s}</option>)}</select></label>
    <label className={labelClass}>Assign to<select name="assignee_id" className={inputClass}><option value="">Unassigned</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.district}</option>)}</select></label>
    <label className={labelClass}>Reporter name<input name="reporter_name" className={inputClass} /></label>
    <label className={labelClass}>Reporter phone<input name="reporter_phone" className={inputClass} /></label>
    <div className="flex justify-end sm:col-span-2"><SubmitButton pendingText="Creating…">Create incident</SubmitButton></div>
  </ActionForm>
}
