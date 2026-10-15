import { issueCitation } from '@/app/admin/enforcement-actions'
import { ActionForm, SubmitButton } from '@/components/admin/forms'
import { inputClass, labelClass, textareaClass } from '@/components/admin/ui'
import type { Fee } from '@/lib/enforcement'
import { formatBirr } from '@/lib/money'

/** Issue a citation against the fee schedule. Amount and due date come from the schedule, never typed by hand. */
export function CitationForm({ fees, incidentId, category, canEmail }: { fees: Fee[]; incidentId?: number; category?: string; canEmail: boolean }) {
  const suggested = fees.find((f) => f.category === category)?.id
  return <ActionForm action={issueCitation} resetOnSuccess className="grid gap-4 sm:grid-cols-2">
    {incidentId && <input type="hidden" name="incident_id" value={incidentId} />}
    <label className={`${labelClass} sm:col-span-2`}>Violation (from the fee schedule)
      <select name="fee_id" required defaultValue={suggested ?? ''} className={inputClass}>
        <option value="" disabled>Choose a violation…</option>
        {fees.map((f) => <option key={f.id} value={f.id}>{f.code} · {f.violation} — {formatBirr(f.first_amount)} (repeat {formatBirr(f.repeat_amount)}), {f.due_days} days to pay</option>)}
      </select></label>
    <label className="flex items-center gap-2 text-sm font-semibold sm:col-span-2"><input type="checkbox" name="repeat_offense" className="size-4 accent-[#b32d3d]" />Repeat offense (charge the repeat amount)</label>
    <label className={labelClass}>Name of person or business<input name="offender_name" required className={inputClass} /></label>
    <label className={labelClass}>ID / licence number<input name="offender_id_no" className={inputClass} /></label>
    <label className={labelClass}>Phone<input name="offender_phone" inputMode="tel" className={inputClass} /></label>
    <label className={labelClass}>Email<input name="offender_email" type="email" className={inputClass} /></label>
    <label className={`${labelClass} sm:col-span-2`}>Address<input name="offender_address" className={inputClass} /></label>
    <label className={`${labelClass} sm:col-span-2`}>Inspector notes<textarea name="notes" rows={2} className={textareaClass} /></label>
    {canEmail && <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="send_notice" defaultChecked className="size-4 accent-[#1d5fa7]" />Email the notice of violation (if an email is given)</label>}
    <p className="text-xs text-[#718096] sm:col-span-2">The phone number is used by the citizen to look up and pay or appeal the citation online — record it whenever possible.</p>
    <div className="flex justify-end sm:col-span-2"><SubmitButton pendingText="Issuing…">Issue citation</SubmitButton></div>
  </ActionForm>
}
