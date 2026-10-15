import 'server-only'
import { logAudit, notify } from '@/lib/activity'
import { query, queryOne } from '@/lib/db'
import { splitInstallments } from '@/lib/money'

// ── Types ───────────────────────────────────────────────────────────────

export const CITATION_STATUSES = ['Unpaid', 'Partially paid', 'Paid', 'Under appeal', 'Escalated', 'Waived', 'Void'] as const
export const PAYMENT_METHODS = ['Cash', 'Bank transfer', 'Telebirr', 'CBE Birr', 'Cheque', 'Chapa (online)'] as const
export const LEGAL_STATUSES = ['Open', 'Hearing scheduled', 'Decided', 'Closed'] as const
export const LEGAL_OUTCOMES = ['Upheld', 'Reduced', 'Dismissed', 'Referred to court', 'Withdrawn'] as const
export const HEARING_STATUSES = ['Scheduled', 'Held', 'Postponed', 'Cancelled'] as const

export type Fee = { id: number; code: string; violation: string; category: string; description: string; first_amount: string; repeat_amount: string; due_days: number; active: boolean; updated_at: Date; citations: number }
export type Citation = {
  id: number; ref: string; incident_id: number | null; incident_ref: string | null; fee_id: number | null; violation: string
  offender_name: string; offender_id_no: string | null; offender_phone: string | null; offender_email: string | null; offender_address: string | null
  repeat_offense: boolean; amount: string; paid: string; balance: string; due_date: string; status: string; notes: string
  issued_by_name: string | null; issued_at: Date; overdue: boolean; plan_id: number | null; sub_city: string | null
}
export type Payment = { id: number; citation_id: number; citation_ref: string; offender_name: string; amount: string; method: string; receipt_no: string | null; reference: string | null; status: string; received_by_name: string | null; paid_at: Date }
export type LegalCase = {
  id: number; ref: string; type: string; status: string; citation_id: number | null; citation_ref: string | null; incident_id: number | null; incident_ref: string | null
  appellant_name: string | null; appellant_phone: string | null; appellant_email: string | null; reason: string; outcome: string | null; outcome_amount: string | null
  decision_notes: string; decided_at: Date | null; created_at: Date; next_hearing: Date | null; created_by_name: string | null; amount: string | null; balance: string | null
}
export type Hearing = { id: number; legal_case_id: number; case_ref: string; case_type: string; appellant_name: string | null; scheduled_at: Date; location: string; presiding: string | null; status: string; notes: string }
export type Evidence = { id: number; incident_id: number | null; legal_case_id: number | null; original_name: string; mime: string; size_bytes: string; sha256: string; captured_at: Date | null; lat: number | null; lng: number | null; source: string; description: string; uploaded_by_name: string | null; created_at: Date }

const citationSelect = `
  select c.*, to_char(c.due_date, 'YYYY-MM-DD') as due_date, i.ref as incident_ref, i.sub_city, s.name as issued_by_name,
    coalesce(p.paid, 0)::numeric(12,2)::text as paid, greatest(c.amount - coalesce(p.paid, 0), 0)::numeric(12,2)::text as balance,
    (c.status in ('Unpaid', 'Partially paid') and c.due_date < current_date) as overdue,
    (select pp.id from payment_plans pp where pp.citation_id = c.id and pp.status = 'Active' limit 1) as plan_id
  from citations c
  left join incidents i on i.id = c.incident_id
  left join staff s on s.id = c.issued_by
  left join (select citation_id, sum(amount) as paid from payments where status = 'Confirmed' group by citation_id) p on p.citation_id = c.id`

// ── Fees ────────────────────────────────────────────────────────────────

export async function listFees(activeOnly = false) {
  return query<Fee>(`select f.*, (select count(*) from citations c where c.fee_id = f.id)::int as citations from fee_schedule f ${activeOnly ? 'where f.active' : ''} order by f.active desc, f.category, f.code`)
}

// ── Citations & payments ────────────────────────────────────────────────

export async function listCitations(filters: { q?: string; status?: string }, limit = 200) {
  const where: string[] = []
  const params: unknown[] = []
  if (filters.q) { params.push(`%${filters.q}%`); where.push(`(c.ref ilike $${params.length} or c.offender_name ilike $${params.length} or c.offender_phone ilike $${params.length} or i.ref ilike $${params.length})`) }
  if (filters.status === 'Outstanding') where.push(`c.status in ('Unpaid', 'Partially paid')`)
  else if (filters.status === 'Overdue') where.push(`c.status in ('Unpaid', 'Partially paid') and c.due_date < current_date`)
  else if (filters.status) { params.push(filters.status); where.push(`c.status = $${params.length}`) }
  return query<Citation>(`${citationSelect} ${where.length ? `where ${where.join(' and ')}` : ''} order by c.issued_at desc limit ${limit}`, params)
}

export async function getCitation(id: number) {
  return queryOne<Citation>(`${citationSelect} where c.id = $1`, [id])
}

export async function getCitationByRef(ref: string) {
  return queryOne<Citation>(`${citationSelect} where upper(c.ref) = upper($1)`, [ref.trim()])
}

export async function listPayments(filters: { citationId?: number; limit?: number } = {}) {
  return query<Payment>(`
    select p.*, c.ref as citation_ref, c.offender_name, s.name as received_by_name from payments p
    join citations c on c.id = p.citation_id left join staff s on s.id = p.received_by
    ${filters.citationId ? 'where p.citation_id = $1' : ''} order by p.paid_at desc limit ${filters.limit ?? 100}`, filters.citationId ? [filters.citationId] : [])
}

export async function getRevenueStats() {
  return (await queryOne<{ collected_30d: string; collected_month: string; outstanding: string; overdue_amount: string; overdue_count: number; issued_month: number; appeals_open: number; plans_active: number }>(`
    with bal as (
      select c.id, c.status, c.due_date, greatest(c.amount - coalesce((select sum(amount) from payments p where p.citation_id = c.id and p.status = 'Confirmed'), 0), 0) as balance from citations c
    )
    select
      coalesce((select sum(amount) from payments where status = 'Confirmed' and paid_at > now() - interval '30 days'), 0)::numeric(12,2)::text as collected_30d,
      coalesce((select sum(amount) from payments where status = 'Confirmed' and paid_at >= date_trunc('month', now())), 0)::numeric(12,2)::text as collected_month,
      coalesce((select sum(balance) from bal where status in ('Unpaid', 'Partially paid', 'Escalated')), 0)::numeric(12,2)::text as outstanding,
      coalesce((select sum(balance) from bal where status in ('Unpaid', 'Partially paid') and due_date < current_date), 0)::numeric(12,2)::text as overdue_amount,
      (select count(*) from bal where status in ('Unpaid', 'Partially paid') and due_date < current_date)::int as overdue_count,
      (select count(*) from citations where issued_at >= date_trunc('month', now()))::int as issued_month,
      (select count(*) from legal_cases where status <> 'Closed' and type = 'Appeal')::int as appeals_open,
      (select count(*) from payment_plans where status = 'Active')::int as plans_active`))!
}

/** Recomputes Paid / Partially paid / Unpaid after a payment change, leaving appeal/escalation/waived/void states alone. */
export async function refreshCitationStatus(citationId: number) {
  await query(`
    update citations c set status = case
        when paid.total >= c.amount then 'Paid'
        when c.status in ('Under appeal', 'Escalated', 'Waived', 'Void') then c.status
        when paid.total > 0 then 'Partially paid' else 'Unpaid' end,
      updated_at = now()
    from (select coalesce(sum(amount), 0) as total from payments where citation_id = $1 and status = 'Confirmed') paid
    where c.id = $1`, [citationId])
  await query(`update payment_plans set status = 'Completed' where citation_id = $1 and status = 'Active' and exists (select 1 from citations where id = $1 and status = 'Paid')`, [citationId])
}

// ── Payment plans ───────────────────────────────────────────────────────

export type PlanInstallment = { seq: number; due: string; amount: number; paid: number; status: 'Paid' | 'Partly paid' | 'Due' | 'Overdue' | 'Upcoming' }

export async function getPlan(citationId: number) {
  const plan = await queryOne<{ id: number; installments: number; start_date: string; status: string; notes: string; approved_by_name: string | null; created_at: Date; plan_amount: string }>(`
    select pp.id, pp.installments, to_char(pp.start_date, 'YYYY-MM-DD') as start_date, pp.status, pp.notes, s.name as approved_by_name, pp.created_at,
      c.amount::text as plan_amount
    from payment_plans pp join citations c on c.id = pp.citation_id left join staff s on s.id = pp.approved_by
    where pp.citation_id = $1 order by pp.created_at desc limit 1`, [citationId])
  if (!plan) return null
  const paidRow = await queryOne<{ paid: string }>(`select coalesce(sum(amount), 0)::text as paid from payments where citation_id = $1 and status = 'Confirmed'`, [citationId])
  return { ...plan, schedule: planSchedule(Number(plan.plan_amount), plan.installments, plan.start_date, Number(paidRow?.paid ?? 0)) }
}

/** Monthly schedule; payments are applied to the oldest installment first. */
export function planSchedule(total: number, installments: number, startDate: string, paid: number): PlanInstallment[] {
  const amounts = splitInstallments(total, installments)
  const today = new Date().toISOString().slice(0, 10)
  let remaining = paid
  return amounts.map((amount, i) => {
    const d = new Date(`${startDate}T00:00:00Z`)
    d.setUTCMonth(d.getUTCMonth() + i)
    const due = d.toISOString().slice(0, 10)
    const applied = Math.min(amount, Math.max(remaining, 0))
    remaining -= applied
    const status = applied >= amount - 0.001 ? 'Paid' : due < today ? 'Overdue' : applied > 0 ? 'Partly paid' : i === 0 || due <= today ? 'Due' : 'Upcoming'
    return { seq: i + 1, due, amount, paid: Math.round(applied * 100) / 100, status }
  })
}

// ── Legal ───────────────────────────────────────────────────────────────

const legalSelect = `
  select l.*, c.ref as citation_ref, c.amount::text as amount, i.ref as incident_ref, s.name as created_by_name,
    greatest(c.amount - coalesce((select sum(amount) from payments p where p.citation_id = c.id and p.status = 'Confirmed'), 0), 0)::numeric(12,2)::text as balance,
    (select min(h.scheduled_at) from hearings h where h.legal_case_id = l.id and h.status = 'Scheduled' and h.scheduled_at > now() - interval '1 day') as next_hearing
  from legal_cases l left join citations c on c.id = l.citation_id left join incidents i on i.id = l.incident_id left join staff s on s.id = l.created_by`

export async function listLegalCases(filters: { q?: string; status?: string; type?: string }) {
  const where: string[] = []
  const params: unknown[] = []
  if (filters.q) { params.push(`%${filters.q}%`); where.push(`(l.ref ilike $${params.length} or l.appellant_name ilike $${params.length} or c.ref ilike $${params.length})`) }
  if (filters.status === 'Active') where.push(`l.status <> 'Closed'`)
  else if (filters.status) { params.push(filters.status); where.push(`l.status = $${params.length}`) }
  if (filters.type) { params.push(filters.type); where.push(`l.type = $${params.length}`) }
  return query<LegalCase>(`${legalSelect} ${where.length ? `where ${where.join(' and ')}` : ''} order by (l.status = 'Closed'), l.created_at desc limit 200`, params)
}

export async function getLegalCase(id: number) {
  return queryOne<LegalCase>(`${legalSelect} where l.id = $1`, [id])
}

export async function listHearings(filters: { from?: string; to?: string; caseId?: number }) {
  const where: string[] = []
  const params: unknown[] = []
  if (filters.caseId) { params.push(filters.caseId); where.push(`h.legal_case_id = $${params.length}`) }
  if (filters.from) { params.push(filters.from); where.push(`h.scheduled_at >= $${params.length}::date`) }
  if (filters.to) { params.push(filters.to); where.push(`h.scheduled_at < $${params.length}::date + interval '1 day'`) }
  return query<Hearing>(`select h.*, l.ref as case_ref, l.type as case_type, l.appellant_name from hearings h join legal_cases l on l.id = h.legal_case_id ${where.length ? `where ${where.join(' and ')}` : ''} order by h.scheduled_at`, params)
}

export async function getLegalStats() {
  return (await queryOne<{ open: number; appeals: number; referrals: number; hearings_week: number; decided_month: number }>(`
    select
      (select count(*) from legal_cases where status <> 'Closed')::int as open,
      (select count(*) from legal_cases where status <> 'Closed' and type = 'Appeal')::int as appeals,
      (select count(*) from legal_cases where status <> 'Closed' and type = 'Court referral')::int as referrals,
      (select count(*) from hearings where status = 'Scheduled' and scheduled_at between now() and now() + interval '7 days')::int as hearings_week,
      (select count(*) from legal_cases where decided_at >= date_trunc('month', now()))::int as decided_month`))!
}

// ── Evidence ────────────────────────────────────────────────────────────

export async function listEvidence(target: { incidentId?: number; legalCaseId?: number }) {
  const [col, id] = target.incidentId ? ['incident_id', target.incidentId] : ['legal_case_id', target.legalCaseId]
  return query<Evidence>(`select e.*, e.size_bytes::text as size_bytes, s.name as uploaded_by_name from evidence e left join staff s on s.id = e.uploaded_by where e.${col} = $1 order by coalesce(e.captured_at, e.created_at) desc`, [id])
}

// ── Map & field ─────────────────────────────────────────────────────────

export type MapIncident = { id: number; ref: string; title: string; category: string; status: string; priority: string; sub_city: string; lat: number; lng: number; location_source: string | null; assignee_name: string | null; created_at: Date; overdue: boolean }
export type OfficerLocation = { staff_id: number; name: string; role: string; district: string; lat: number; lng: number; accuracy: number | null; on_duty: boolean; updated_at: Date; open_cases: number }

export async function getMapIncidents(filters: { status?: string; days?: number; category?: string }, targetHours: number) {
  const where = ['i.lat is not null']
  const params: unknown[] = [targetHours]
  if (filters.status === 'Open') where.push(`i.status <> 'Resolved'`)
  else if (filters.status && filters.status !== 'All') { params.push(filters.status); where.push(`i.status = $${params.length}`) }
  if (filters.days) { params.push(filters.days); where.push(`i.created_at > now() - make_interval(days => $${params.length})`) }
  if (filters.category) { params.push(filters.category); where.push(`i.category = $${params.length}`) }
  return query<MapIncident>(`
    select i.id, i.ref, i.title, i.category, i.status, i.priority, i.sub_city, i.lat, i.lng, i.location_source, i.created_at, s.name as assignee_name,
      (i.status <> 'Resolved' and i.created_at < now() - make_interval(hours => $1::int)) as overdue
    from incidents i left join staff s on s.id = i.assignee_id where ${where.join(' and ')} order by i.created_at desc limit 2000`, params)
}

/** Officers who shared a location in the last 12 hours. Locations older than 15 minutes are shown as stale in the UI. */
export async function getOfficerLocations() {
  return query<OfficerLocation>(`
    select l.staff_id, s.name, s.role, s.district, l.lat, l.lng, l.accuracy, l.on_duty, l.updated_at,
      (select count(*) from incidents i where i.assignee_id = s.id and i.status <> 'Resolved')::int as open_cases
    from staff_locations l join staff s on s.id = l.staff_id
    where s.status = 'Active' and l.updated_at > now() - interval '12 hours' order by l.on_duty desc, l.updated_at desc`)
}

export async function listCheckins(incidentId: number) {
  return query<{ id: number; staff_name: string | null; lat: number; lng: number; accuracy: number | null; note: string; created_at: Date }>(
    'select c.id, s.name as staff_name, c.lat, c.lng, c.accuracy, c.note, c.created_at from checkins c left join staff s on s.id = c.staff_id where c.incident_id = $1 order by c.created_at desc', [incidentId])
}

export async function getFieldCases(staffId: number) {
  return query<MapIncident & { description: string; landmark: string | null; woreda: string | null }>(`
    select i.id, i.ref, i.title, i.category, i.status, i.priority, i.sub_city, i.woreda, i.landmark, i.description, i.lat, i.lng, i.location_source, i.created_at, null as assignee_name, false as overdue
    from incidents i where i.assignee_id = $1 and i.status <> 'Resolved'
    order by case i.priority when 'High' then 0 when 'Medium' then 1 else 2 end, i.created_at`, [staffId])
}

// ── Automatic escalation ────────────────────────────────────────────────

/**
 * Citations unpaid more than `days` past their due date (or payment plans with an installment that late) are escalated:
 * the citation becomes "Escalated", a "Court referral" legal case is opened, and supervisors are notified. Safe to run repeatedly.
 */
export async function escalateOverdueCitations(days: number) {
  // Default payment plans whose oldest unpaid installment is more than `days` late.
  const plans = await query<{ id: number; citation_id: number; installments: number; start_date: string; amount: string; paid: string }>(`
    select pp.id, pp.citation_id, pp.installments, to_char(pp.start_date, 'YYYY-MM-DD') as start_date, c.amount::text as amount,
      coalesce((select sum(amount) from payments p where p.citation_id = c.id and p.status = 'Confirmed'), 0)::text as paid
    from payment_plans pp join citations c on c.id = pp.citation_id where pp.status = 'Active'`)
  const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
  for (const p of plans) {
    const late = planSchedule(Number(p.amount), p.installments, p.start_date, Number(p.paid)).some((i) => i.status === 'Overdue' && i.due < cutoff)
    if (late) await query(`update payment_plans set status = 'Defaulted' where id = $1`, [p.id])
  }

  const due = await query<{ id: number; ref: string; incident_id: number | null; offender_name: string }>(`
    select c.id, c.ref, c.incident_id, c.offender_name from citations c
    where c.status in ('Unpaid', 'Partially paid') and c.due_date < current_date - $1::int
      and not exists (select 1 from payment_plans pp where pp.citation_id = c.id and pp.status = 'Active')
      and not exists (select 1 from legal_cases l where l.citation_id = c.id and l.type = 'Court referral')`, [days])
  for (const c of due) {
    await query(`update citations set status = 'Escalated', updated_at = now() where id = $1`, [c.id])
    const lc = await queryOne<{ id: number; ref: string }>(`insert into legal_cases (type, citation_id, incident_id, appellant_name, reason) values ('Court referral', $1, $2, $3, $4) returning id, ref`,
      [c.id, c.incident_id, c.offender_name, `Automatically referred: citation ${c.ref} unpaid more than ${days} days after its due date.`])
    await notify(`${c.ref} escalated to ${lc!.ref}`, `Unpaid more than ${days} days past due. A court referral has been opened.`, 'urgent', `/admin/legal/${lc!.id}`)
    await logAudit(null, `Escalated ${c.ref} to court referral ${lc!.ref}`, 'Legal', `Unpaid ${days}+ days past due`)
  }
  return due.length
}

export async function listPlans() {
  const rows = await query<{ id: number; citation_id: number; ref: string; offender_name: string; installments: number; start_date: string; status: string; amount: string; paid: string; approved_by_name: string | null }>(`
    select pp.id, pp.citation_id, c.ref, c.offender_name, pp.installments, to_char(pp.start_date, 'YYYY-MM-DD') as start_date, pp.status, c.amount::text as amount,
      coalesce((select sum(amount) from payments p where p.citation_id = c.id and p.status = 'Confirmed'), 0)::text as paid, s.name as approved_by_name
    from payment_plans pp join citations c on c.id = pp.citation_id left join staff s on s.id = pp.approved_by
    order by (pp.status <> 'Active'), pp.created_at desc limit 200`)
  return rows.map((r) => {
    const schedule = planSchedule(Number(r.amount), r.installments, r.start_date, Number(r.paid))
    return { ...r, schedule, next: schedule.find((i) => i.status !== 'Paid') ?? null, paidCount: schedule.filter((i) => i.status === 'Paid').length }
  })
}
