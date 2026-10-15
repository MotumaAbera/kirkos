'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { ActionState } from '@/app/admin/actions'
import { logAudit, notify } from '@/lib/activity'
import { deny, requireStaff } from '@/lib/auth'
import { query, queryOne } from '@/lib/db'
import { HEARING_STATUSES, LEGAL_OUTCOMES, PAYMENT_METHODS, getCitation, refreshCitationStatus } from '@/lib/enforcement'
import { inAddis } from '@/lib/geo'
import { isEmail, sendEmail } from '@/lib/mailer'
import { formatBirr } from '@/lib/money'
import { getSettings } from '@/lib/queries'
import { appUrl } from '@/lib/url'

const text = (fd: FormData, key: string) => String(fd.get(key) ?? '').trim()
const num = (fd: FormData, key: string) => Number(String(fd.get(key) ?? '').replace(/,/g, ''))
const refresh = () => revalidatePath('/admin', 'layout')
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v)

// ── Citations ───────────────────────────────────────────────────────────

export async function issueCitation(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const staff = await requireStaff()
  const denied = deny(staff, 'citations.issue')
  if (denied) return denied
  const fee = await queryOne<{ id: number; violation: string; first_amount: string; repeat_amount: string; due_days: number }>('select * from fee_schedule where id = $1 and active', [Number(fd.get('fee_id'))])
  if (!fee) return { error: 'Choose a violation from the fee schedule.' }
  const offender = text(fd, 'offender_name')
  if (offender.length < 2) return { error: 'Enter the name of the person or business being cited.' }
  const email = text(fd, 'offender_email').toLowerCase()
  if (email && !isEmail(email)) return { error: 'The offender email address looks invalid.' }
  const repeat = fd.get('repeat_offense') === 'on'
  const amount = Number(repeat ? fee.repeat_amount : fee.first_amount)
  const incidentId = Number(fd.get('incident_id')) || null

  const row = await queryOne<{ id: number; ref: string; due_date: string }>(`
    insert into citations (incident_id, fee_id, violation, offender_name, offender_id_no, offender_phone, offender_email, offender_address, repeat_offense, amount, due_date, notes, issued_by)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, current_date + $11::int, $12, $13) returning id, ref, to_char(due_date, 'DD Mon YYYY') as due_date`,
    [incidentId, fee.id, fee.violation, offender, text(fd, 'offender_id_no') || null, text(fd, 'offender_phone') || null, email || null, text(fd, 'offender_address') || null, repeat, amount, fee.due_days, text(fd, 'notes'), staff.id])
  if (incidentId) await query('insert into incident_notes (incident_id, staff_id, body) values ($1, $2, $3)', [incidentId, staff.id, `Citation ${row!.ref} issued to ${offender}: ${fee.violation}, ${formatBirr(amount)}, due ${row!.due_date}`])
  await logAudit(staff.id, `Issued citation ${row!.ref}`, 'Revenue', `${offender} · ${fee.violation} · ${formatBirr(amount)}`)
  if (email && fd.get('send_notice') === 'on') await emailNotice(row!.id, staff.id)
  refresh()
  return { ok: true, message: `Citation ${row!.ref} issued for ${formatBirr(amount)}${email && fd.get('send_notice') === 'on' ? ' and emailed to the offender' : ''}.` }
}

async function emailNotice(citationId: number, staffId: number) {
  const c = await getCitation(citationId)
  if (!c?.offender_email) return null
  const settings = await getSettings()
  const base = await appUrl()
  return sendEmail({
    to: [c.offender_email], subject: `Notice of violation ${c.ref}`, heading: 'Notice of violation', kind: 'Citation notice', staffId,
    text: `Dear ${c.offender_name},\n\nA citation has been issued to you by the ${settings.org_name}.\n\nCitation: ${c.ref}\nViolation: ${c.violation}\nAmount: ${formatBirr(c.amount)}\nDue date: ${c.due_date}\n\n${settings.payment_instructions}\n\nView your citation and payment options: ${base}/pay?ref=${encodeURIComponent(c.ref)}\n\nYou may appeal within ${settings.appeal_window_days} days of issue: ${base}/appeal?ref=${encodeURIComponent(c.ref)}\n\nUnpaid citations may be referred to court ${settings.escalate_after_days} days after the due date.`,
  })
}

export async function resendNotice(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const staff = await requireStaff()
  const denied = deny(staff, 'citations.issue') ?? deny(staff, 'email.send')
  if (denied) return denied
  const result = await emailNotice(Number(fd.get('id')), staff.id)
  if (!result) return { error: 'This citation has no offender email address.' }
  return result.status === 'Sent' ? { ok: true, message: 'Notice emailed.' } : { error: `Email failed: ${result.error}` }
}

export async function setCitationStatus(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const staff = await requireStaff()
  const denied = deny(staff, 'citations.manage')
  if (denied) return denied
  const id = Number(fd.get('id'))
  const action = text(fd, 'action')
  const reason = text(fd, 'reason')
  if (reason.length < 5) return { error: 'Give a reason (it is kept on the citation record).' }
  const c = await queryOne<{ ref: string; status: string }>('select ref, status from citations where id = $1', [id])
  if (!c) return { error: 'Citation not found.' }
  if (action === 'void' || action === 'waive') {
    const status = action === 'void' ? 'Void' : 'Waived'
    await query(`update citations set status = $2, notes = trim(notes || E'\\n' || $3), updated_at = now() where id = $1`, [id, status, `[${new Date().toISOString().slice(0, 10)}] ${status} by ${staff.name}: ${reason}`])
    await query(`update payment_plans set status = 'Cancelled' where citation_id = $1 and status = 'Active'`, [id])
    await logAudit(staff.id, `${status} citation ${c.ref}`, 'Revenue', reason)
  } else if (action === 'reinstate') {
    await query(`update citations set status = 'Unpaid', notes = trim(notes || E'\\n' || $2), updated_at = now() where id = $1`, [id, `[${new Date().toISOString().slice(0, 10)}] Reinstated by ${staff.name}: ${reason}`])
    await refreshCitationStatus(id)
    await logAudit(staff.id, `Reinstated citation ${c.ref}`, 'Revenue', reason)
  } else if (action === 'extend') {
    const due = text(fd, 'due_date')
    if (!isDate(due)) return { error: 'Choose a new due date.' }
    await query(`update citations set due_date = $2, notes = trim(notes || E'\\n' || $3), updated_at = now() where id = $1`, [id, due, `[${new Date().toISOString().slice(0, 10)}] Due date moved to ${due} by ${staff.name}: ${reason}`])
    await logAudit(staff.id, `Extended due date of ${c.ref}`, 'Revenue', `${due} · ${reason}`)
  } else return { error: 'Unknown action.' }
  refresh()
  return { ok: true, message: 'Citation updated.' }
}

// ── Payments ────────────────────────────────────────────────────────────

export async function recordPayment(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const staff = await requireStaff()
  const denied = deny(staff, 'payments.record')
  if (denied) return denied
  const c = await getCitation(Number(fd.get('citation_id')))
  if (!c) return { error: 'Citation not found.' }
  if (['Void', 'Waived'].includes(c.status)) return { error: `This citation is ${c.status.toLowerCase()}; no payment is due.` }
  const amount = Math.round(num(fd, 'amount') * 100) / 100
  if (!(amount > 0)) return { error: 'Enter the amount received.' }
  if (amount > Number(c.balance) + 0.009) return { error: `That is more than the outstanding balance (${formatBirr(c.balance)}).` }
  const method = (PAYMENT_METHODS as readonly string[]).includes(text(fd, 'method')) ? text(fd, 'method') : null
  if (!method || method === 'Chapa (online)') return { error: 'Choose how the payment was made.' }
  const receipt = text(fd, 'receipt_no')
  if (!receipt) return { error: 'Enter the official receipt number.' }
  if (await queryOne('select 1 from payments where receipt_no = $1 and status = $2', [receipt, 'Confirmed'])) return { error: 'That receipt number has already been recorded.' }
  const paidAt = isDate(text(fd, 'paid_at')) ? text(fd, 'paid_at') : null
  await query(`insert into payments (citation_id, amount, method, receipt_no, reference, received_by, paid_at) values ($1,$2,$3,$4,$5,$6, coalesce($7::date + (now()::time), now()))`,
    [c.id, amount, method, receipt, text(fd, 'reference') || null, staff.id, paidAt])
  await refreshCitationStatus(c.id)
  await logAudit(staff.id, `Recorded payment on ${c.ref}`, 'Revenue', `${formatBirr(amount)} · ${method} · receipt ${receipt}`)
  if (c.offender_email && fd.get('send_receipt') === 'on') {
    const after = await getCitation(c.id)
    await sendEmail({
      to: [c.offender_email], subject: `Payment received – ${c.ref}`, heading: 'Payment received', kind: 'Payment receipt', staffId: staff.id,
      text: `Dear ${c.offender_name},\n\nWe have received your payment.\n\nCitation: ${c.ref}\nAmount paid: ${formatBirr(amount)}\nMethod: ${method}\nReceipt number: ${receipt}\nRemaining balance: ${formatBirr(after?.balance ?? 0)}\n\nThank you.`,
    })
  }
  refresh()
  return { ok: true, message: `Payment of ${formatBirr(amount)} recorded.` }
}

export async function reversePayment(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const staff = await requireStaff()
  const denied = deny(staff, 'citations.manage')
  if (denied) return denied
  const reason = text(fd, 'reason')
  if (reason.length < 5) return { error: 'Give a reason for reversing this payment.' }
  const p = await queryOne<{ citation_id: number; amount: string; receipt_no: string | null; ref: string }>(`update payments set status = 'Reversed' where id = $1 and status = 'Confirmed' returning citation_id, amount::text, receipt_no, (select ref from citations where id = citation_id) as ref`, [Number(fd.get('id'))])
  if (!p) return { error: 'Payment not found or already reversed.' }
  await refreshCitationStatus(p.citation_id)
  await logAudit(staff.id, `Reversed payment on ${p.ref}`, 'Revenue', `${formatBirr(p.amount)} · receipt ${p.receipt_no ?? '—'} · ${reason}`)
  refresh()
  return { ok: true, message: 'Payment reversed.' }
}

// ── Payment plans ───────────────────────────────────────────────────────

export async function createPaymentPlan(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const staff = await requireStaff()
  const denied = deny(staff, 'citations.manage')
  if (denied) return denied
  const c = await getCitation(Number(fd.get('citation_id')))
  if (!c) return { error: 'Citation not found.' }
  if (!['Unpaid', 'Partially paid', 'Escalated'].includes(c.status)) return { error: `A plan can't be set up while the citation is ${c.status.toLowerCase()}.` }
  if (c.plan_id) return { error: 'This citation already has an active plan.' }
  const installments = Math.trunc(num(fd, 'installments'))
  if (installments < 2 || installments > 24) return { error: 'Choose between 2 and 24 monthly installments.' }
  const start = text(fd, 'start_date')
  if (!isDate(start)) return { error: 'Choose the first installment date.' }
  await query('insert into payment_plans (citation_id, installments, start_date, approved_by, notes) values ($1,$2,$3,$4,$5)', [c.id, installments, start, staff.id, text(fd, 'notes')])
  if (c.status === 'Escalated') await query(`update citations set status = case when (select coalesce(sum(amount),0) from payments where citation_id = $1 and status = 'Confirmed') > 0 then 'Partially paid' else 'Unpaid' end where id = $1`, [c.id])
  await logAudit(staff.id, `Approved payment plan for ${c.ref}`, 'Revenue', `${installments} monthly installments from ${start}`)
  refresh()
  return { ok: true, message: `Plan approved: ${installments} monthly installments.` }
}

export async function cancelPaymentPlan(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const staff = await requireStaff()
  const denied = deny(staff, 'citations.manage')
  if (denied) return denied
  const row = await queryOne<{ ref: string }>(`update payment_plans set status = 'Cancelled' where id = $1 and status in ('Active', 'Defaulted') returning (select ref from citations where id = citation_id) as ref`, [Number(fd.get('id'))])
  if (!row) return { error: 'Plan not found.' }
  await logAudit(staff.id, `Cancelled payment plan for ${row.ref}`, 'Revenue', text(fd, 'reason'))
  refresh()
  return { ok: true, message: 'Plan cancelled.' }
}

// ── Fee schedule & revenue settings ─────────────────────────────────────

export async function saveFee(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const staff = await requireStaff()
  const denied = deny(staff, 'fees.manage')
  if (denied) return denied
  const id = Number(fd.get('id')) || null
  const code = text(fd, 'code').toUpperCase()
  const violation = text(fd, 'violation')
  const first = Math.round(num(fd, 'first_amount') * 100) / 100
  const repeat = Math.round(num(fd, 'repeat_amount') * 100) / 100
  const dueDays = Math.trunc(num(fd, 'due_days'))
  if (!/^[A-Z0-9-]{2,12}$/.test(code) || !violation) return { error: 'Enter a code (letters, numbers, dashes) and the violation name.' }
  if (!(first > 0) || !(repeat >= first)) return { error: 'Amounts must be positive and the repeat amount at least the first-offense amount.' }
  if (dueDays < 1 || dueDays > 180) return { error: 'Days to pay must be between 1 and 180.' }
  if (await queryOne('select 1 from fee_schedule where code = $1 and id <> $2', [code, id ?? 0])) return { error: 'Another fee already uses this code.' }
  const values = [code, violation, text(fd, 'category') || 'Other', text(fd, 'description'), first, repeat, dueDays, fd.get('active') === 'on' || !id]
  if (id) {
    const before = await queryOne<{ first_amount: string; repeat_amount: string }>('select first_amount::text, repeat_amount::text from fee_schedule where id = $1', [id])
    await query('update fee_schedule set code=$1, violation=$2, category=$3, description=$4, first_amount=$5, repeat_amount=$6, due_days=$7, active=$8, updated_at=now() where id=$9', [...values, id])
    await logAudit(staff.id, `Updated fee ${code}`, 'Revenue', `${violation}: ${formatBirr(before?.first_amount ?? 0)} → ${formatBirr(first)}, repeat ${formatBirr(before?.repeat_amount ?? 0)} → ${formatBirr(repeat)}`)
  } else {
    await query('insert into fee_schedule (code, violation, category, description, first_amount, repeat_amount, due_days, active) values ($1,$2,$3,$4,$5,$6,$7,$8)', values)
    await logAudit(staff.id, `Added fee ${code}`, 'Revenue', `${violation}: ${formatBirr(first)} / repeat ${formatBirr(repeat)}`)
  }
  refresh()
  return { ok: true, message: `Fee ${code} saved. Existing citations keep their original amount.` }
}

export async function saveRevenueSettings(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const staff = await requireStaff()
  const denied = deny(staff, 'fees.manage')
  if (denied) return denied
  const escalate = Math.trunc(num(fd, 'escalate_after_days'))
  const window = Math.trunc(num(fd, 'appeal_window_days'))
  const instructions = text(fd, 'payment_instructions')
  if (escalate < 1 || escalate > 365 || window < 1 || window > 90) return { error: 'Escalation must be 1–365 days and the appeal window 1–90 days.' }
  if (instructions.length < 10) return { error: 'Write payment instructions for citizens.' }
  for (const [key, value] of [['escalate_after_days', escalate], ['appeal_window_days', window], ['payment_instructions', instructions]] as const)
    await query('insert into settings (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value', [key, JSON.stringify(value)])
  await logAudit(staff.id, 'Changed revenue settings', 'Revenue', `escalate after ${escalate}d · appeal window ${window}d`)
  refresh()
  return { ok: true, message: 'Revenue settings saved.' }
}

// ── Legal cases & hearings ──────────────────────────────────────────────

export async function createLegalCase(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const staff = await requireStaff()
  const denied = deny(staff, 'legal.manage')
  if (denied) return denied
  const type = text(fd, 'type') === 'Court referral' ? 'Court referral' : 'Appeal'
  const citation = text(fd, 'citation_ref') ? await queryOne<{ id: number; incident_id: number | null; offender_name: string; offender_phone: string | null; offender_email: string | null }>('select id, incident_id, offender_name, offender_phone, offender_email from citations where upper(ref) = upper($1)', [text(fd, 'citation_ref')]) : null
  if (text(fd, 'citation_ref') && !citation) return { error: 'No citation with that reference.' }
  const reason = text(fd, 'reason')
  if (reason.length < 10) return { error: 'Describe the grounds for the case.' }
  const row = await queryOne<{ id: number; ref: string }>(`insert into legal_cases (type, citation_id, incident_id, appellant_name, appellant_phone, appellant_email, reason, created_by) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id, ref`,
    [type, citation?.id ?? null, citation?.incident_id ?? null, text(fd, 'appellant_name') || citation?.offender_name || null, text(fd, 'appellant_phone') || citation?.offender_phone || null, text(fd, 'appellant_email') || citation?.offender_email || null, reason, staff.id])
  if (citation) await query(`update citations set status = $2, updated_at = now() where id = $1 and status not in ('Paid', 'Void', 'Waived')`, [citation.id, type === 'Appeal' ? 'Under appeal' : 'Escalated'])
  await logAudit(staff.id, `Opened ${type.toLowerCase()} ${row!.ref}`, 'Legal', text(fd, 'citation_ref'))
  refresh()
  redirect(`/admin/legal/${row!.id}`)
}

export async function scheduleHearing(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const staff = await requireStaff()
  const denied = deny(staff, 'legal.manage')
  if (denied) return denied
  const lc = await queryOne<{ id: number; ref: string; status: string; appellant_name: string | null; appellant_email: string | null }>('select id, ref, status, appellant_name, appellant_email from legal_cases where id = $1', [Number(fd.get('legal_case_id'))])
  if (!lc) return { error: 'Case not found.' }
  if (lc.status === 'Closed') return { error: 'This case is closed.' }
  const when = text(fd, 'scheduled_at')
  const date = new Date(when)
  if (!when || Number.isNaN(date.getTime())) return { error: 'Choose a date and time.' }
  if (date.getTime() < Date.now() - 3600_000) return { error: 'Hearings must be scheduled in the future.' }
  const location = text(fd, 'location')
  if (!location) return { error: 'Enter where the hearing will take place.' }
  const clash = await queryOne<{ ref: string }>(`select l.ref from hearings h join legal_cases l on l.id = h.legal_case_id where h.status = 'Scheduled' and h.location = $1 and abs(extract(epoch from h.scheduled_at - $2::timestamptz)) < 3600`, [location, when])
  if (clash) return { error: `${location} already has hearing ${clash.ref} within an hour of that time.` }
  await query('insert into hearings (legal_case_id, scheduled_at, location, presiding, notes, created_by) values ($1,$2,$3,$4,$5,$6)', [lc.id, when, location, text(fd, 'presiding') || null, text(fd, 'notes'), staff.id])
  await query(`update legal_cases set status = 'Hearing scheduled', updated_at = now() where id = $1`, [lc.id])
  const label = date.toLocaleString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Addis_Ababa' })
  await logAudit(staff.id, `Scheduled hearing for ${lc.ref}`, 'Legal', `${label} · ${location}`)
  let emailed = false
  if (lc.appellant_email && fd.get('notify') === 'on') {
    const r = await sendEmail({ to: [lc.appellant_email], subject: `Hearing scheduled – ${lc.ref}`, heading: 'Your hearing has been scheduled', kind: 'Hearing notice', staffId: staff.id,
      text: `Dear ${lc.appellant_name ?? 'appellant'},\n\nA hearing for case ${lc.ref} has been scheduled.\n\nDate and time: ${label} (Addis Ababa time)\nLocation: ${location}\n\nPlease bring any documents that support your case and a valid ID. If you cannot attend, contact us as soon as possible.` })
    emailed = r.status === 'Sent'
  }
  refresh()
  return { ok: true, message: `Hearing scheduled for ${label}${emailed ? '; the appellant was emailed' : ''}.` }
}

export async function updateHearing(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const staff = await requireStaff()
  const denied = deny(staff, 'legal.manage')
  if (denied) return denied
  const status = (HEARING_STATUSES as readonly string[]).includes(text(fd, 'status')) ? text(fd, 'status') : null
  if (!status) return { error: 'Choose a status.' }
  const h = await queryOne<{ legal_case_id: number; ref: string }>(`update hearings set status = $2, notes = case when $3 = '' then notes else trim(notes || E'\\n' || $3) end where id = $1 returning legal_case_id, (select ref from legal_cases where id = legal_case_id) as ref`, [Number(fd.get('id')), status, text(fd, 'notes')])
  if (!h) return { error: 'Hearing not found.' }
  await query(`update legal_cases set status = 'Open', updated_at = now() where id = $1 and status = 'Hearing scheduled' and not exists (select 1 from hearings where legal_case_id = $1 and status = 'Scheduled')`, [h.legal_case_id])
  await logAudit(staff.id, `Hearing for ${h.ref} marked ${status}`, 'Legal', text(fd, 'notes'))
  refresh()
  return { ok: true, message: `Hearing marked ${status.toLowerCase()}.` }
}

export async function recordDecision(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const staff = await requireStaff()
  const denied = deny(staff, 'legal.manage')
  if (denied) return denied
  const lc = await queryOne<{ id: number; ref: string; type: string; citation_id: number | null; appellant_name: string | null; appellant_email: string | null }>('select id, ref, type, citation_id, appellant_name, appellant_email from legal_cases where id = $1', [Number(fd.get('id'))])
  if (!lc) return { error: 'Case not found.' }
  const outcome = (LEGAL_OUTCOMES as readonly string[]).includes(text(fd, 'outcome')) ? text(fd, 'outcome') : null
  if (!outcome) return { error: 'Choose the decision.' }
  const notes = text(fd, 'decision_notes')
  if (notes.length < 10) return { error: 'Record the reasons for the decision.' }
  const newAmount = outcome === 'Reduced' ? Math.round(num(fd, 'outcome_amount') * 100) / 100 : null
  const settings = await getSettings()

  if (lc.citation_id) {
    const c = await getCitation(lc.citation_id)
    if (outcome === 'Reduced') {
      if (!(newAmount! > 0) || newAmount! >= Number(c!.amount)) return { error: `Enter a reduced amount below ${formatBirr(c!.amount)}.` }
      await query(`update citations set amount = $2, status = 'Unpaid', due_date = greatest(due_date, current_date + $3::int), notes = trim(notes || E'\\n' || $4), updated_at = now() where id = $1`,
        [c!.id, newAmount, settings.appeal_window_days, `[${new Date().toISOString().slice(0, 10)}] Reduced from ${formatBirr(c!.amount)} on appeal ${lc.ref}`])
      await refreshCitationStatus(c!.id)
    } else if (outcome === 'Dismissed') {
      await query(`update citations set status = 'Waived', notes = trim(notes || E'\\n' || $2), updated_at = now() where id = $1`, [c!.id, `[${new Date().toISOString().slice(0, 10)}] Dismissed on appeal ${lc.ref}`])
      await query(`update payment_plans set status = 'Cancelled' where citation_id = $1 and status = 'Active'`, [c!.id])
    } else if (outcome === 'Referred to court') {
      await query(`update citations set status = 'Escalated', updated_at = now() where id = $1 and status not in ('Paid', 'Void', 'Waived')`, [c!.id])
    } else {
      // Upheld or withdrawn: the citation stands; give the usual time to pay from today.
      await query(`update citations set status = 'Unpaid', due_date = greatest(due_date, current_date + $2::int), updated_at = now() where id = $1 and status in ('Under appeal', 'Escalated')`, [c!.id, settings.appeal_window_days])
      await refreshCitationStatus(c!.id)
    }
  }
  await query(`update legal_cases set outcome = $2, outcome_amount = $3, decision_notes = $4, decided_at = now(), status = 'Decided', updated_at = now() where id = $1`, [lc.id, outcome, newAmount, notes])
  await query(`update hearings set status = 'Held' where legal_case_id = $1 and status = 'Scheduled' and scheduled_at < now()`, [lc.id])
  await logAudit(staff.id, `Decision on ${lc.ref}: ${outcome}`, 'Legal', notes)
  await notify(`${lc.ref} decided: ${outcome}`, notes.slice(0, 140), 'info', `/admin/legal/${lc.id}`)
  if (lc.appellant_email && fd.get('notify') === 'on') {
    const base = await appUrl()
    const c = lc.citation_id ? await getCitation(lc.citation_id) : null
    await sendEmail({ to: [lc.appellant_email], subject: `Decision on ${lc.ref}`, heading: 'Decision on your case', kind: 'Decision notice', staffId: staff.id,
      text: `Dear ${lc.appellant_name ?? 'appellant'},\n\nA decision has been made on case ${lc.ref}.\n\nDecision: ${outcome}${newAmount ? ` – the fine is reduced to ${formatBirr(newAmount)}` : ''}\n\nReasons:\n${notes}${c && Number(c.balance) > 0 && !['Waived', 'Void'].includes(c.status) ? `\n\nAmount now due: ${formatBirr(c.balance)} by ${c.due_date}.\nPayment options: ${base}/pay?ref=${encodeURIComponent(c.ref)}` : ''}` })
  }
  refresh()
  return { ok: true, message: `Decision recorded: ${outcome}.` }
}

export async function closeLegalCase(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const staff = await requireStaff()
  const denied = deny(staff, 'legal.manage')
  if (denied) return denied
  const row = await queryOne<{ ref: string }>(`update legal_cases set status = $2, updated_at = now() where id = $1 returning ref`, [Number(fd.get('id')), text(fd, 'reopen') ? 'Open' : 'Closed'])
  if (!row) return { error: 'Case not found.' }
  await logAudit(staff.id, `${text(fd, 'reopen') ? 'Reopened' : 'Closed'} ${row.ref}`, 'Legal')
  refresh()
  return { ok: true, message: text(fd, 'reopen') ? 'Case reopened.' : 'Case closed.' }
}

// ── Locations & dispatch ────────────────────────────────────────────────

export async function setIncidentLocation(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const staff = await requireStaff()
  const denied = deny(staff, 'incidents.edit')
  if (denied) return denied
  const lat = num(fd, 'lat')
  const lng = num(fd, 'lng')
  if (!inAddis(lat, lng)) return { error: 'Pick a point inside Addis Ababa.' }
  const row = await queryOne<{ ref: string }>(`update incidents set lat = $2, lng = $3, location_source = 'Set by staff', updated_at = now() where id = $1 returning ref`, [Number(fd.get('id')), lat, lng])
  if (!row) return { error: 'Case not found.' }
  await logAudit(staff.id, `Set map location for ${row.ref}`, 'Incidents', `${lat.toFixed(5)}, ${lng.toFixed(5)}`)
  refresh()
  return { ok: true, message: 'Location saved.' }
}

export async function dispatchOfficer(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const staff = await requireStaff()
  const denied = deny(staff, 'map.view') ?? deny(staff, 'incidents.edit')
  if (denied) return denied
  const incident = await queryOne<{ id: number; ref: string; title: string; status: string }>('select id, ref, title, status from incidents where id = $1', [Number(fd.get('incident_id'))])
  const officer = await queryOne<{ id: number; name: string }>(`select id, name from staff where id = $1 and status = 'Active'`, [Number(fd.get('staff_id'))])
  if (!incident || !officer) return { error: 'Choose a case and an active officer.' }
  await query(`update incidents set assignee_id = $2, status = case when status = 'New' then 'In progress' else status end, priority = case when $3 then 'High' else priority end, updated_at = now() where id = $1`, [incident.id, officer.id, fd.get('urgent') === 'on'])
  const eta = text(fd, 'eta')
  await query('insert into incident_notes (incident_id, staff_id, body) values ($1, $2, $3)', [incident.id, staff.id, `Dispatched ${officer.name}${eta ? ` (estimated ${eta} away)` : ''}`])
  await notify(`Dispatch: ${incident.ref} → ${officer.name}`, `${incident.title}. Open the field app for directions.`, 'assignment', `/field/cases/${incident.id}`)
  await logAudit(staff.id, `Dispatched ${officer.name} to ${incident.ref}`, 'Incidents', eta ? `ETA ${eta}` : '')
  refresh()
  return { ok: true, message: `${officer.name} dispatched to ${incident.ref}.` }
}

/** Used by the field app: a check-in records where the inspector was when they reached the site. */
export async function checkIn(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const staff = await requireStaff()
  const denied = deny(staff, 'field.use')
  if (denied) return denied
  const lat = num(fd, 'lat')
  const lng = num(fd, 'lng')
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !lat || !lng) return { error: 'Your location is not available yet. Allow location access and try again.' }
  const incident = await queryOne<{ id: number; ref: string; lat: number | null; lng: number | null }>('select id, ref, lat, lng from incidents where id = $1', [Number(fd.get('incident_id'))])
  if (!incident) return { error: 'Case not found.' }
  const accuracy = num(fd, 'accuracy') || null
  await query('insert into checkins (staff_id, incident_id, lat, lng, accuracy, note) values ($1,$2,$3,$4,$5,$6)', [staff.id, incident.id, lat, lng, accuracy, text(fd, 'note')])
  await query('insert into incident_notes (incident_id, staff_id, body) values ($1, $2, $3)', [incident.id, staff.id, `Checked in on site${accuracy ? ` (±${Math.round(accuracy)} m)` : ''}${text(fd, 'note') ? `: ${text(fd, 'note')}` : ''}`])
  // Improve the case location when it was only approximate.
  if (!incident.lat || (await queryOne(`select 1 from incidents where id = $1 and location_source like 'Approximate%'`, [incident.id])))
    await query(`update incidents set lat = $2, lng = $3, location_source = 'Inspector check-in' where id = $1`, [incident.id, lat, lng])
  await query(`insert into staff_locations (staff_id, lat, lng, accuracy, on_duty, updated_at) values ($1,$2,$3,$4,true,now()) on conflict (staff_id) do update set lat = excluded.lat, lng = excluded.lng, accuracy = excluded.accuracy, updated_at = now()`, [staff.id, lat, lng, accuracy])
  await logAudit(staff.id, `Checked in at ${incident.ref}`, 'Field', `${lat.toFixed(5)}, ${lng.toFixed(5)}`)
  refresh()
  return { ok: true, message: 'Checked in.' }
}

export async function endShift(): Promise<ActionState> {
  const staff = await requireStaff()
  await query('update staff_locations set on_duty = false, updated_at = now() where staff_id = $1', [staff.id])
  await logAudit(staff.id, 'Ended shift', 'Field')
  refresh()
  return { ok: true, message: 'Shift ended. Location sharing is off.' }
}

