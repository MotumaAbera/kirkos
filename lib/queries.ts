import 'server-only'
import { query, queryOne } from '@/lib/db'

export type Incident = {
  id: number; ref: string; title: string; category: string; sub_city: string; woreda: string | null; landmark: string | null
  description: string; status: string; priority: string; source: string; assignee_id: number | null; assignee_name: string | null
  reporter_name: string | null; reporter_phone: string | null; reporter_email: string | null; anonymous: boolean
  created_at: Date; updated_at: Date; resolved_at: Date | null; overdue: boolean
  lat: number | null; lng: number | null; location_source: string | null
}
export type ServiceRequest = {
  id: number; ref: string; title: string; category: string; sub_city: string; status: string; assignee_id: number | null
  assignee_name: string | null; requester_name: string | null; requester_phone: string | null; requester_email: string | null; source: string; notes: string
  due_date: string | null; created_at: Date; updated_at: Date; closed_at: Date | null; overdue: boolean
}
export type Staff = { id: number; name: string; email: string; role: string; district: string; phone: string | null; status: string; last_login_at: Date | null; created_at: Date; open_incidents: number; open_services: number; escalated: number; overdue: number; resolved_30d: number; avg_hours_30d: number | null }
export type Notification = { id: number; title: string; body: string; type: string; link: string | null; read_at: Date | null; created_at: Date }
export type AuditEntry = { id: number; staff_name: string | null; action: string; area: string; detail: string; created_at: Date }
export type Settings = {
  org_name: string; contact_email: string; response_target_hours: number; default_district: string
  notify_escalations: boolean; require_location: boolean; show_resolved: boolean; require_approval_close: boolean
  pref_escalations: boolean; pref_assignments: boolean; pref_sla: boolean
  email_sender_name: string; email_confirm_reporters: boolean
  escalate_after_days: number; appeal_window_days: number; payment_instructions: string
  public_phone: string; public_email: string; public_address: string; office_hours: string
}

const SETTINGS_DEFAULTS: Settings = {
  org_name: 'Addis Ababa Code Enforcement Authority', contact_email: '', response_target_hours: 48, default_district: 'All districts',
  notify_escalations: true, require_location: true, show_resolved: false, require_approval_close: true,
  pref_escalations: true, pref_assignments: true, pref_sla: true,
  email_sender_name: 'AACEA – Code Enforcement Authority', email_confirm_reporters: true,
  escalate_after_days: 30, appeal_window_days: 15, payment_instructions: 'Pay at any AACEA sub-city office or by bank transfer, quoting your citation number.',
  public_phone: '011 123 4567', public_email: 'support@aacea.gov.et', public_address: 'City Hall, Menelik II Avenue, Addis Ababa', office_hours: 'Monday–Friday, 8:30 AM – 5:30 PM',
}

export async function getSettings(): Promise<Settings> {
  const rows = await query<{ key: string; value: unknown }>('select key, value from settings')
  return { ...SETTINGS_DEFAULTS, ...Object.fromEntries(rows.map((r) => [r.key, r.value])) } as Settings
}

const incidentSelect = `
  select i.*, s.name as assignee_name,
    (i.status <> 'Resolved' and i.created_at < now() - make_interval(hours => $1::int)) as overdue
  from incidents i left join staff s on s.id = i.assignee_id`

export async function getNavCounts() {
  return (await queryOne<{ new_incidents: number; escalated: number; open_services: number; unread: number; unassigned: number; open_appeals: number }>(`
    select
      (select count(*) from incidents where status = 'New')::int as new_incidents,
      (select count(*) from incidents where status = 'Escalated')::int as escalated,
      (select count(*) from service_requests where status <> 'Closed')::int as open_services,
      (select count(*) from notifications where read_at is null)::int as unread,
      (select count(*) from incidents where status <> 'Resolved' and assignee_id is null)::int as unassigned,
      (select count(*) from legal_cases where type = 'Appeal' and status in ('Open', 'Hearing scheduled'))::int as open_appeals`))!
}

export async function getOverview(targetHours: number) {
  const [stats, recent, daily, districts, attention] = await Promise.all([
    queryOne<{ open: number; received_week: number; received_prev_week: number; avg_hours: number | null; resolution_rate: number | null; overdue: number }>(`
      select
        (select count(*) from incidents where status <> 'Resolved')::int as open,
        (select count(*) from incidents where created_at > now() - interval '7 days')::int as received_week,
        (select count(*) from incidents where created_at between now() - interval '14 days' and now() - interval '7 days')::int as received_prev_week,
        (select round(avg(extract(epoch from resolved_at - created_at) / 3600)::numeric, 1)::float from incidents where resolved_at is not null) as avg_hours,
        (select round(100.0 * count(*) filter (where status = 'Resolved') / nullif(count(*), 0), 1)::float from incidents) as resolution_rate,
        (select count(*) from incidents where status <> 'Resolved' and created_at < now() - make_interval(hours => $1::int))::int as overdue`, [targetHours]),
    query<Incident>(`${incidentSelect} order by i.created_at desc limit 6`, [targetHours]),
    query<{ day: string; received: number; resolved: number }>(`
      select to_char(d, 'Dy') as day,
        (select count(*) from incidents where created_at::date = d)::int as received,
        (select count(*) from incidents where resolved_at::date = d)::int as resolved
      from generate_series(current_date - 6, current_date, interval '1 day') as d order by d`),
    query<{ sub_city: string; open: number }>(`select sub_city, count(*)::int as open from incidents where status <> 'Resolved' group by sub_city order by open desc limit 5`),
    queryOne<{ escalated: number; unassigned: number; due_services: number }>(`
      select
        (select count(*) from incidents where status = 'Escalated')::int as escalated,
        (select count(*) from incidents where status <> 'Resolved' and assignee_id is null)::int as unassigned,
        (select count(*) from service_requests where status <> 'Closed' and due_date <= current_date + 1)::int as due_services`),
  ])
  return { stats: stats!, recent, daily, districts, attention: attention! }
}

export type IncidentFilters = { q?: string; status?: string; subCity?: string; priority?: string; assignee?: string; from?: string; to?: string }

export async function listIncidents(filters: IncidentFilters, targetHours: number, limit = 100) {
  const where: string[] = []
  const params: unknown[] = [targetHours]
  const add = (clause: string, value: unknown) => { params.push(value); where.push(clause.replaceAll('?', `$${params.length}`)) }
  if (filters.q) add('(i.ref ilike ? or i.title ilike ? or i.sub_city ilike ? or i.landmark ilike ?)', `%${filters.q}%`)
  if (filters.status === 'Open') where.push(`i.status <> 'Resolved'`)
  else if (filters.status === 'Overdue') where.push(`i.status <> 'Resolved' and i.created_at < now() - make_interval(hours => $1::int)`)
  else if (filters.status) add('i.status = ?', filters.status)
  if (filters.subCity) add('i.sub_city = ?', filters.subCity)
  if (filters.priority) add('i.priority = ?', filters.priority)
  const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v)
  if (filters.from && isDate(filters.from)) add('i.created_at >= ?::date', filters.from)
  if (filters.to && isDate(filters.to)) add("i.created_at < ?::date + interval '1 day'", filters.to)
  if (filters.assignee === 'unassigned') where.push('i.assignee_id is null')
  else if (filters.assignee) add('i.assignee_id = ?', Number(filters.assignee))
  const whereSql = where.length ? `where ${where.join(' and ')}` : ''
  const rows = await query<Incident>(`${incidentSelect} ${whereSql} order by case i.status when 'Escalated' then 0 when 'New' then 1 when 'In progress' then 2 else 3 end, i.created_at desc limit ${limit}`, params)
  const counts = await query<{ status: string; count: number }>('select status, count(*)::int as count from incidents group by status')
  const queue = (await queryOne<{ overdue: number; unassigned: number; high: number; resolved_today: number }>(`
    select
      count(*) filter (where status <> 'Resolved' and created_at < now() - make_interval(hours => $1::int))::int as overdue,
      count(*) filter (where status <> 'Resolved' and assignee_id is null)::int as unassigned,
      count(*) filter (where status <> 'Resolved' and priority = 'High')::int as high,
      count(*) filter (where resolved_at::date = current_date)::int as resolved_today
    from incidents`, [targetHours]))!
  return { rows, queue, counts: Object.fromEntries(counts.map((c) => [c.status, c.count])) as Record<string, number> }
}

export async function getIncident(id: number, targetHours: number) {
  const incident = await queryOne<Incident>(`${incidentSelect} where i.id = $2`, [targetHours, id])
  if (!incident) return null
  const notes = await query<{ id: number; body: string; created_at: Date; staff_name: string | null }>(
    'select n.id, n.body, n.created_at, s.name as staff_name from incident_notes n left join staff s on s.id = n.staff_id where n.incident_id = $1 order by n.created_at desc', [id])
  return { incident, notes }
}

export async function listServiceRequests(filters: { q?: string; status?: string; category?: string }, limit = 200) {
  const where: string[] = []
  const params: unknown[] = []
  if (filters.q) { params.push(`%${filters.q}%`); where.push(`(r.ref ilike $${params.length} or r.title ilike $${params.length} or r.requester_name ilike $${params.length})`) }
  if (filters.status === 'Open') where.push(`r.status <> 'Closed'`)
  else if (filters.status) { params.push(filters.status); where.push(`r.status = $${params.length}`) }
  if (filters.category) { params.push(filters.category); where.push(`r.category = $${params.length}`) }
  const rows = await query<ServiceRequest>(`
    select r.*, to_char(r.due_date, 'YYYY-MM-DD') as due_date, s.name as assignee_name,
      (r.status <> 'Closed' and r.due_date < current_date) as overdue
    from service_requests r left join staff s on s.id = r.assignee_id
    ${where.length ? `where ${where.join(' and ')}` : ''}
    order by (r.status = 'Closed'), r.due_date nulls last, r.created_at desc limit ${limit}`, params)
  const stats = (await queryOne<{ open: number; due_week: number; overdue: number; closed_month: number; on_time: number | null }>(`
    select
      count(*) filter (where status <> 'Closed')::int as open,
      count(*) filter (where status <> 'Closed' and due_date <= current_date + 7)::int as due_week,
      count(*) filter (where status <> 'Closed' and due_date < current_date)::int as overdue,
      count(*) filter (where status = 'Closed' and closed_at > now() - interval '30 days')::int as closed_month,
      round(100.0 * count(*) filter (where status = 'Closed' and (due_date is null or closed_at::date <= due_date)) / nullif(count(*) filter (where status = 'Closed'), 0), 1)::float as on_time
    from service_requests`))!
  const byStatus = await query<{ status: string; count: number }>('select status, count(*)::int as count from service_requests group by status')
  const byCategory = await query<{ category: string; count: number }>(`select category, count(*)::int as count from service_requests group by category order by count desc limit 5`)
  return { rows, stats, byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s.count])) as Record<string, number>, byCategory }
}

export async function getServiceRequest(id: number) {
  return queryOne<ServiceRequest>(`
    select r.*, to_char(r.due_date, 'YYYY-MM-DD') as due_date, s.name as assignee_name, (r.status <> 'Closed' and r.due_date < current_date) as overdue
    from service_requests r left join staff s on s.id = r.assignee_id where r.id = $1`, [id])
}

export async function listStaff(targetHours = 48) {
  return query<Staff>(`
    select s.id, s.name, s.email, s.role, s.district, s.phone, s.status, s.last_login_at, s.created_at,
      (select count(*) from incidents i where i.assignee_id = s.id and i.status <> 'Resolved')::int as open_incidents,
      (select count(*) from service_requests r where r.assignee_id = s.id and r.status <> 'Closed')::int as open_services,
      (select count(*) from incidents i where i.assignee_id = s.id and i.status = 'Escalated')::int as escalated,
      (select count(*) from incidents i where i.assignee_id = s.id and i.status <> 'Resolved' and i.created_at < now() - make_interval(hours => $1::int))::int as overdue,
      (select count(*) from incidents i where i.assignee_id = s.id and i.resolved_at > now() - interval '30 days')::int as resolved_30d,
      (select round(avg(extract(epoch from i.resolved_at - i.created_at) / 3600)::numeric, 1)::float from incidents i where i.assignee_id = s.id and i.resolved_at > now() - interval '30 days') as avg_hours_30d
    from staff s order by s.status = 'Inactive', s.name`, [targetHours])
}

export async function listAssignableStaff() {
  return query<{ id: number; name: string; district: string }>(`select id, name, district from staff where status = 'Active' order by name`)
}

export async function getReport(days: number) {
  const [summary, byCategory, bySubCity, weekly, statusMix] = await Promise.all([
    queryOne<{ received: number; resolved: number; prev_received: number; avg_hours: number | null; services: number }>(`
      select
        (select count(*) from incidents where created_at > now() - make_interval(days => $1))::int as received,
        (select count(*) from incidents where resolved_at > now() - make_interval(days => $1))::int as resolved,
        (select count(*) from incidents where created_at between now() - make_interval(days => $1 * 2) and now() - make_interval(days => $1))::int as prev_received,
        (select round(avg(extract(epoch from resolved_at - created_at) / 3600)::numeric, 1)::float from incidents where resolved_at > now() - make_interval(days => $1)) as avg_hours,
        (select count(*) from service_requests where created_at > now() - make_interval(days => $1))::int as services`, [days]),
    query<{ label: string; count: number }>(`select category as label, count(*)::int as count from incidents where created_at > now() - make_interval(days => $1) group by category order by count desc`, [days]),
    query<{ label: string; count: number; resolved: number }>(`select sub_city as label, count(*)::int as count, count(*) filter (where status = 'Resolved')::int as resolved from incidents where created_at > now() - make_interval(days => $1) group by sub_city order by count desc`, [days]),
    query<{ label: string; received: number; resolved: number }>(`
      select to_char(w, 'Mon DD') as label,
        (select count(*) from incidents where created_at >= w and created_at < w + interval '7 days')::int as received,
        (select count(*) from incidents where resolved_at >= w and resolved_at < w + interval '7 days')::int as resolved
      from generate_series(date_trunc('week', now()) - interval '7 weeks', date_trunc('week', now()), interval '7 days') as w order by w`),
    query<{ status: string; count: number }>(`select status, count(*)::int as count from incidents where created_at > now() - make_interval(days => $1) group by status`, [days]),
  ])
  return { summary: summary!, byCategory, bySubCity, weekly, statusMix }
}

export async function listAudit(filters: { staff?: string; area?: string; q?: string }, limit = 200) {
  const where: string[] = []
  const params: unknown[] = []
  if (filters.staff) { params.push(Number(filters.staff)); where.push(`a.staff_id = $${params.length}`) }
  if (filters.area) { params.push(filters.area); where.push(`a.area = $${params.length}`) }
  if (filters.q) { params.push(`%${filters.q}%`); where.push(`(a.action ilike $${params.length} or a.detail ilike $${params.length})`) }
  const rows = await query<AuditEntry>(`select a.id, s.name as staff_name, a.action, a.area, a.detail, a.created_at from audit_log a left join staff s on s.id = a.staff_id ${where.length ? `where ${where.join(' and ')}` : ''} order by a.created_at desc limit ${limit}`, params)
  const stats = (await queryOne<{ week: number; active_staff: number; exports: number }>(`
    select count(*) filter (where created_at > now() - interval '7 days')::int as week,
      count(distinct staff_id) filter (where created_at > now() - interval '7 days')::int as active_staff,
      count(*) filter (where action ilike 'Exported%')::int as exports from audit_log`))!
  const areas = (await query<{ area: string }>('select distinct area from audit_log order by area')).map((r) => r.area)
  return { rows, stats, areas }
}

export async function listNotifications(filter?: string) {
  const where = filter === 'unread' ? 'where read_at is null' : filter && filter !== 'all' ? 'where type = $1' : ''
  return query<Notification>(`select * from notifications ${where} order by read_at is not null, created_at desc limit 200`, where.includes('$1') ? [filter] : [])
}

export type DistrictRow = {
  sub_city: string; received: number; resolved: number; open: number; escalated: number; overdue: number
  avg_hours: number | null; resolution_rate: number | null; open_services: number; staff: number
}

/** One row per sub-city (all sub-cities, even with no activity) for the selected period. */
export async function getDistrictPerformance(days: number, targetHours: number, subCities: readonly string[]) {
  return query<DistrictRow>(`
    select d.sub_city,
      count(i.id) filter (where i.created_at > now() - make_interval(days => $1))::int as received,
      count(i.id) filter (where i.resolved_at > now() - make_interval(days => $1))::int as resolved,
      count(i.id) filter (where i.status <> 'Resolved')::int as open,
      count(i.id) filter (where i.status = 'Escalated')::int as escalated,
      count(i.id) filter (where i.status <> 'Resolved' and i.created_at < now() - make_interval(hours => $2::int))::int as overdue,
      round(avg(extract(epoch from i.resolved_at - i.created_at) / 3600) filter (where i.resolved_at > now() - make_interval(days => $1))::numeric, 1)::float as avg_hours,
      round(100.0 * count(i.id) filter (where i.created_at > now() - make_interval(days => $1) and i.status = 'Resolved')
        / nullif(count(i.id) filter (where i.created_at > now() - make_interval(days => $1)), 0), 1)::float as resolution_rate,
      (select count(*) from service_requests r where r.sub_city = d.sub_city and r.status <> 'Closed')::int as open_services,
      (select count(*) from staff s where s.district = d.sub_city and s.status = 'Active')::int as staff
    from unnest($3::text[]) as d(sub_city)
    left join incidents i on i.sub_city = d.sub_city
    group by d.sub_city
    order by open desc, received desc, d.sub_city`, [days, targetHours, subCities])
}

export async function getDistrictDetail(subCity: string, days: number, targetHours: number) {
  const [categories, cases, team, weekly] = await Promise.all([
    query<{ label: string; count: number }>(`select category as label, count(*)::int as count from incidents where sub_city = $1 and created_at > now() - make_interval(days => $2) group by category order by count desc`, [subCity, days]),
    query<Incident>(`${incidentSelect} where i.sub_city = $2 and i.status <> 'Resolved' order by case i.status when 'Escalated' then 0 when 'New' then 1 else 2 end, i.created_at limit 8`, [targetHours, subCity]),
    query<{ id: number; name: string; role: string; open: number }>(`
      select s.id, s.name, s.role, (select count(*) from incidents i where i.assignee_id = s.id and i.status <> 'Resolved' and i.sub_city = $1)::int as open
      from staff s where s.status = 'Active' and (s.district = $1 or exists (select 1 from incidents i where i.assignee_id = s.id and i.sub_city = $1 and i.status <> 'Resolved'))
      order by open desc, s.name`, [subCity]),
    query<{ label: string; received: number; resolved: number }>(`
      select to_char(w, 'Mon DD') as label,
        (select count(*) from incidents where sub_city = $1 and created_at >= w and created_at < w + interval '7 days')::int as received,
        (select count(*) from incidents where sub_city = $1 and resolved_at >= w and resolved_at < w + interval '7 days')::int as resolved
      from generate_series(date_trunc('week', now()) - interval '7 weeks', date_trunc('week', now()), interval '7 days') as w order by w`, [subCity]),
  ])
  return { categories, cases, team, weekly }
}

export async function listExportHistory(limit = 8) {
  return query<AuditEntry>(`select a.id, s.name as staff_name, a.action, a.area, a.detail, a.created_at from audit_log a left join staff s on s.id = a.staff_id where a.action ilike 'Exported%' order by a.created_at desc limit ${limit}`)
}

export async function getSystemStatus() {
  const started = Date.now()
  const row = (await queryOne<{ database: string; version: string; incidents: number; services: number; staff: number; notes: number; notifications: number; audit: number }>(`
    select current_database() as database, current_setting('server_version') as version,
      (select count(*) from incidents)::int as incidents, (select count(*) from service_requests)::int as services,
      (select count(*) from staff)::int as staff, (select count(*) from incident_notes)::int as notes,
      (select count(*) from notifications)::int as notifications, (select count(*) from audit_log)::int as audit`))!
  return { ...row, latency_ms: Date.now() - started }
}

/** Headline metrics for the Overview page: month-over-month KPIs, report volume, and per-district SLA compliance. */
export async function getOverviewMetrics(targetHours: number, range: '12m' | '30d') {
  const [kpi, volume, districtSla] = await Promise.all([
    queryOne<{
      total: number; this_month: number; last_month: number; escalated: number
      sla_rate: number | null; sla_rate_last: number | null; avg_hours: number | null; avg_hours_last: number | null
    }>(`
      with resolved as (
        select resolved_at, extract(epoch from resolved_at - created_at) / 3600 as hours from incidents where resolved_at is not null
      )
      select
        (select count(*) from incidents)::int as total,
        (select count(*) from incidents where created_at >= date_trunc('month', now()))::int as this_month,
        (select count(*) from incidents where created_at >= date_trunc('month', now()) - interval '1 month' and created_at < date_trunc('month', now()))::int as last_month,
        (select count(*) from incidents where status = 'Escalated')::int as escalated,
        (select round(100.0 * count(*) filter (where hours <= $1) / nullif(count(*), 0), 1)::float from resolved) as sla_rate,
        (select round(100.0 * count(*) filter (where hours <= $1) / nullif(count(*), 0), 1)::float from resolved where resolved_at < date_trunc('month', now())) as sla_rate_last,
        (select round(avg(hours)::numeric, 1)::float from resolved where resolved_at >= date_trunc('month', now())) as avg_hours,
        (select round(avg(hours)::numeric, 1)::float from resolved where resolved_at >= date_trunc('month', now()) - interval '1 month' and resolved_at < date_trunc('month', now())) as avg_hours_last`,
      [targetHours]),
    range === '30d'
      ? query<{ label: string; full: string; count: number }>(`
          select to_char(d, 'DD') as label, to_char(d, 'DD Mon') as full, (select count(*) from incidents where created_at::date = d)::int as count
          from generate_series(current_date - 29, current_date, interval '1 day') as d order by d`)
      : query<{ label: string; full: string; count: number }>(`
          select left(to_char(m, 'Mon'), 1) as label, to_char(m, 'Mon YYYY') as full,
            (select count(*) from incidents where created_at >= m and created_at < m + interval '1 month')::int as count
          from generate_series(date_trunc('month', now()) - interval '11 months', date_trunc('month', now()), interval '1 month') as m order by m`),
    query<{ sub_city: string; rate: number; resolved: number }>(`
      select sub_city, count(*)::int as resolved,
        round(100.0 * count(*) filter (where extract(epoch from resolved_at - created_at) / 3600 <= $1) / count(*))::int as rate
      from incidents where resolved_at is not null group by sub_city order by rate desc, resolved desc limit 6`, [targetHours]),
  ])
  return { kpi: kpi!, volume, districtSla }
}

export type UserRow = { id: number; name: string; email: string; role: string; district: string; phone: string | null; status: string; last_login_at: Date | null; created_at: Date; must_change_password: boolean }
export type RoleRow = { name: string; description: string; permissions: string[]; builtin: boolean; users: number }

export async function listUsers(filters: { q?: string; role?: string; status?: string }) {
  const where: string[] = []
  const params: unknown[] = []
  if (filters.q) { params.push(`%${filters.q}%`); where.push(`(name ilike $${params.length} or email ilike $${params.length} or district ilike $${params.length})`) }
  if (filters.role) { params.push(filters.role); where.push(`role = $${params.length}`) }
  if (filters.status) { params.push(filters.status); where.push(`status = $${params.length}`) }
  return query<UserRow>(`select id, name, email, role, district, phone, status, last_login_at, created_at, must_change_password from staff ${where.length ? `where ${where.join(' and ')}` : ''} order by status = 'Inactive', name`, params)
}

export async function listRoles() {
  return query<RoleRow>(`select r.name, r.description, r.permissions, r.builtin, (select count(*) from staff s where s.role = r.name)::int as users from roles r order by r.builtin desc, array_length(r.permissions, 1) desc nulls last, r.name`)
}

export type EmailLogRow = { id: number; staff_name: string | null; kind: string; subject: string; recipients: string[]; failed: string[]; attachments: string[]; status: string; error: string | null; created_at: Date }

export async function listEmailLog(limit = 50) {
  const rows = await query<EmailLogRow>(`select e.id, s.name as staff_name, e.kind, e.subject, e.recipients, e.failed, e.attachments, e.status, e.error, e.created_at from email_log e left join staff s on s.id = e.staff_id order by e.created_at desc limit ${limit}`)
  const stats = (await queryOne<{ month: number; recipients: number; failed: number }>(`
    select count(*) filter (where created_at > now() - interval '30 days')::int as month,
      coalesce(sum(array_length(recipients, 1)) filter (where created_at > now() - interval '30 days'), 0)::int as recipients,
      count(*) filter (where status <> 'Sent' and created_at > now() - interval '30 days')::int as failed
    from email_log`))!
  return { rows, stats }
}
