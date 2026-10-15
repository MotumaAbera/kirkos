'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { can, createSession, deny, destroySession, getSession, hashPassword, requireStaff, verifyPassword } from '@/lib/auth'
import { logAudit, notify } from '@/lib/activity'
import { query, queryOne } from '@/lib/db'
import { getSettings } from '@/lib/queries'
import { INCIDENT_CATEGORIES, INCIDENT_STATUSES, PRIORITIES, SERVICE_CATEGORIES, SERVICE_STATUSES, SUB_CITIES } from '@/lib/constants'

export type ActionState = { ok?: boolean; error?: string; message?: string } | null

const text = (fd: FormData, key: string) => String(fd.get(key) ?? '').trim()
const optional = (fd: FormData, key: string) => text(fd, key) || null
const oneOf = <T extends readonly string[]>(list: T, value: string, fallback?: T[number]) => ((list as readonly string[]).includes(value) ? value : fallback) as T[number] | undefined
const idFrom = (fd: FormData, key = 'id') => { const n = Number(fd.get(key)); return Number.isInteger(n) && n > 0 ? n : null }
const refreshAdmin = () => revalidatePath('/admin', 'layout')

// ── Auth ────────────────────────────────────────────────────────────────

export async function login(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const email = text(fd, 'email').toLowerCase()
  const password = text(fd, 'password')
  if (!email || !password) return { error: 'Enter your email and password.' }
  const staff = await queryOne<{ id: number; password_hash: string; status: string; must_change_password: boolean }>('select id, password_hash, status, must_change_password from staff where email = $1', [email])
  if (!staff || !verifyPassword(password, staff.password_hash)) return { error: 'Incorrect email or password.' }
  if (staff.status === 'Inactive') return { error: 'This account has been deactivated. Contact an administrator.' }
  await createSession(staff.id)
  await query('update staff set last_login_at = now() where id = $1', [staff.id])
  await logAudit(staff.id, 'Signed in', 'Access', email)
  if (staff.must_change_password) redirect('/admin/settings#account')
  const next = text(fd, 'next')
  redirect(next.startsWith('/admin') && !next.startsWith('/admin/login') ? next : '/admin')
}

export async function logout() {
  const staff = await getSession()
  if (staff) await logAudit(staff.id, 'Signed out', 'Access', staff.email)
  await destroySession()
  redirect('/admin/login')
}

// ── Incidents ───────────────────────────────────────────────────────────

export async function createIncident(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const staff = await requireStaff()
  const denied = deny(staff, 'incidents.create')
  if (denied) return denied
  const title = text(fd, 'title')
  const category = oneOf(INCIDENT_CATEGORIES, text(fd, 'category'))
  const subCity = oneOf(SUB_CITIES, text(fd, 'sub_city'))
  if (!title || !category || !subCity) return { error: 'Title, category and sub-city are required.' }
  const settings = await getSettings()
  if (settings.require_location && !text(fd, 'landmark') && !text(fd, 'woreda')) return { error: 'A woreda or landmark is required (Settings → Queue rules).' }
  const assignee = idFrom(fd, 'assignee_id')
  const row = await queryOne<{ id: number; ref: string }>(
    `insert into incidents (title, category, sub_city, woreda, landmark, description, priority, source, assignee_id, status, reporter_name, reporter_phone)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning id, ref`,
    [title, category, subCity, optional(fd, 'woreda'), optional(fd, 'landmark'), text(fd, 'description'), oneOf(PRIORITIES, text(fd, 'priority'), 'Medium'),
      oneOf(['Phone', 'Walk-in', 'Field patrol', 'Public portal'] as const, text(fd, 'source'), 'Phone'), assignee, assignee ? 'In progress' : 'New', optional(fd, 'reporter_name'), optional(fd, 'reporter_phone')],
  )
  await logAudit(staff.id, `Logged incident ${row!.ref}`, 'Incidents', title)
  refreshAdmin()
  redirect(`/admin/incidents/${row!.id}`)
}

export async function updateIncident(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const staff = await requireStaff()
  const denied = deny(staff, 'incidents.edit')
  if (denied) return denied
  const id = idFrom(fd)
  if (!id) return { error: 'Missing incident.' }
  const current = await queryOne<{ ref: string; status: string; priority: string; assignee_id: number | null }>('select ref, status, priority, assignee_id from incidents where id = $1', [id])
  if (!current) return { error: 'Incident not found.' }

  const status = oneOf(INCIDENT_STATUSES, text(fd, 'status'), current.status as never)!
  const priority = oneOf(PRIORITIES, text(fd, 'priority'), current.priority as never)!
  const assignee = fd.has('assignee_id') ? idFrom(fd, 'assignee_id') : current.assignee_id
  const settings = await getSettings()
  if (status === 'Resolved' && current.status !== 'Resolved' && settings.require_approval_close && !can(staff, 'incidents.close'))
    return { error: 'Your role cannot close cases while supervisor approval is required (Settings → Queue rules).' }

  await query(
    `update incidents set status = $2, priority = $3, assignee_id = $4, updated_at = now(),
       resolved_at = case when $2 = 'Resolved' then coalesce(resolved_at, now()) else null end
     where id = $1`, [id, status, priority, assignee])

  const changes: string[] = []
  if (status !== current.status) changes.push(`status ${current.status} → ${status}`)
  if (priority !== current.priority) changes.push(`priority ${current.priority} → ${priority}`)
  if (assignee !== current.assignee_id) {
    const name = assignee ? (await queryOne<{ name: string }>('select name from staff where id = $1', [assignee]))?.name : 'unassigned'
    changes.push(`assigned to ${name}`)
    if (assignee && settings.pref_assignments) await notify(`${current.ref} assigned to ${name}`, 'A case has been assigned and is ready for field work.', 'assignment', `/admin/incidents/${id}`)
  }
  if (status === 'Escalated' && current.status !== 'Escalated' && settings.notify_escalations && settings.pref_escalations)
    await notify(`${current.ref} escalated`, `Escalated by ${staff.name}. Supervisor review needed.`, 'urgent', `/admin/incidents/${id}`)
  const note = text(fd, 'note')
  if (note) await query('insert into incident_notes (incident_id, staff_id, body) values ($1, $2, $3)', [id, staff.id, note])
  if (changes.length) {
    await query('insert into incident_notes (incident_id, staff_id, body) values ($1, $2, $3)', [id, staff.id, `Updated: ${changes.join(', ')}`])
    await logAudit(staff.id, `Updated ${current.ref}`, 'Incidents', changes.join(', '))
  }
  refreshAdmin()
  return { ok: true, message: changes.length || note ? 'Case updated.' : 'No changes to save.' }
}

export async function addIncidentNote(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const staff = await requireStaff()
  const denied = deny(staff, 'incidents.edit')
  if (denied) return denied
  const id = idFrom(fd)
  const body = text(fd, 'body')
  if (!id || !body) return { error: 'Write a note first.' }
  await query('insert into incident_notes (incident_id, staff_id, body) values ($1, $2, $3)', [id, staff.id, body])
  await query('update incidents set updated_at = now() where id = $1', [id])
  revalidatePath(`/admin/incidents/${id}`)
  return { ok: true, message: 'Note added.' }
}

export async function deleteIncident(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const staff = await requireStaff()
  const denied = deny(staff, 'incidents.delete')
  if (denied) return denied
  const id = idFrom(fd)
  const row = await queryOne<{ ref: string; title: string }>('delete from incidents where id = $1 returning ref, title', [id])
  if (row) await logAudit(staff.id, `Deleted ${row.ref}`, 'Incidents', row.title)
  refreshAdmin()
  redirect('/admin/incidents')
}

// ── Service requests ────────────────────────────────────────────────────

export async function saveServiceRequest(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const staff = await requireStaff()
  const denied = deny(staff, 'services.edit')
  if (denied) return denied
  const id = idFrom(fd)
  const title = text(fd, 'title')
  const category = oneOf(SERVICE_CATEGORIES, text(fd, 'category'))
  const subCity = oneOf(SUB_CITIES, text(fd, 'sub_city'))
  if (!title || !category || !subCity) return { error: 'Title, category and sub-city are required.' }
  const assignee = idFrom(fd, 'assignee_id')
  const requesterEmail = text(fd, 'requester_email').toLowerCase()
  if (requesterEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requesterEmail)) return { error: 'The requester email looks invalid.' }
  const values = [title, category, subCity, assignee, optional(fd, 'requester_name'), optional(fd, 'requester_phone'), text(fd, 'notes'), optional(fd, 'due_date'), requesterEmail || null]

  if (!id) {
    const row = await queryOne<{ id: number; ref: string }>(
      `insert into service_requests (title, category, sub_city, assignee_id, requester_name, requester_phone, notes, due_date, requester_email, status)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id, ref`, [...values, assignee ? 'Assigned' : 'Received'])
    await logAudit(staff.id, `Created request ${row!.ref}`, 'Service requests', title)
    refreshAdmin()
    redirect(`/admin/services/${row!.id}`)
  }

  const current = await queryOne<{ ref: string; status: string }>('select ref, status from service_requests where id = $1', [id])
  if (!current) return { error: 'Request not found.' }
  const status = oneOf(SERVICE_STATUSES, text(fd, 'status'), current.status as never)!
  await query(
    `update service_requests set title=$1, category=$2, sub_city=$3, assignee_id=$4, requester_name=$5, requester_phone=$6, notes=$7, due_date=$8, requester_email=$9,
       status=$10, updated_at=now(), closed_at = case when $10 = 'Closed' then coalesce(closed_at, now()) else null end where id=$11`, [...values, status, id])
  await logAudit(staff.id, `Updated request ${current.ref}`, 'Service requests', status !== current.status ? `status ${current.status} → ${status}` : 'details edited')
  refreshAdmin()
  return { ok: true, message: 'Request saved.' }
}

export async function setServiceStatus(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const staff = await requireStaff()
  const denied = deny(staff, 'services.edit')
  if (denied) return denied
  const id = idFrom(fd)
  const status = oneOf(SERVICE_STATUSES, text(fd, 'status'))
  if (!id || !status) return { error: 'Invalid request.' }
  const row = await queryOne<{ ref: string }>(
    `update service_requests set status=$2, updated_at=now(), closed_at = case when $2 = 'Closed' then coalesce(closed_at, now()) else null end where id=$1 returning ref`, [id, status])
  if (row) await logAudit(staff.id, `Moved ${row.ref} to ${status}`, 'Service requests')
  refreshAdmin()
  return { ok: true }
}

export async function deleteServiceRequest(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const staff = await requireStaff()
  const denied = deny(staff, 'services.delete')
  if (denied) return denied
  const row = await queryOne<{ ref: string; title: string }>('delete from service_requests where id = $1 returning ref, title', [idFrom(fd)])
  if (row) await logAudit(staff.id, `Deleted request ${row.ref}`, 'Service requests', row.title)
  refreshAdmin()
  redirect('/admin/services')
}

// ── Notifications ───────────────────────────────────────────────────────

export async function markNotification(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const staff = await requireStaff()
  const denied = deny(staff, 'notifications.view')
  if (denied) return denied
  const id = idFrom(fd)
  if (text(fd, 'mode') === 'delete') await query('delete from notifications where id = $1', [id])
  else if (text(fd, 'mode') === 'unread') await query('update notifications set read_at = null where id = $1', [id])
  else await query('update notifications set read_at = now() where id = $1 and read_at is null', [id])
  refreshAdmin()
  return { ok: true }
}

export async function markAllNotificationsRead(): Promise<ActionState> {
  const staff = await requireStaff()
  const denied = deny(staff, 'notifications.view')
  if (denied) return denied
  await query('update notifications set read_at = now() where read_at is null')
  await logAudit(staff.id, 'Marked all notifications read', 'Notifications')
  refreshAdmin()
  return { ok: true, message: 'All caught up.' }
}

export async function openNotification(fd: FormData) {
  await requireStaff()
  const row = await queryOne<{ link: string | null }>('update notifications set read_at = coalesce(read_at, now()) where id = $1 returning link', [idFrom(fd)])
  refreshAdmin()
  redirect(row?.link || '/admin/notifications')
}

// ── Settings ────────────────────────────────────────────────────────────

const BOOLEAN_SETTINGS = {
  rules: ['notify_escalations', 'require_location', 'show_resolved', 'require_approval_close'],
  preferences: ['pref_escalations', 'pref_assignments', 'pref_sla'],
} as const

async function putSetting(key: string, value: unknown) {
  await query('insert into settings (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value', [key, JSON.stringify(value)])
}

export async function saveSettings(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const staff = await requireStaff()
  const denied = deny(staff, 'settings.manage')
  if (denied) return denied
  const section = text(fd, 'section')
  if (section === 'profile') {
    const orgName = text(fd, 'org_name')
    const hours = Number(fd.get('response_target_hours'))
    if (!orgName) return { error: 'Organization name is required.' }
    if (![24, 48, 72, 96].includes(hours)) return { error: 'Choose a valid response target.' }
    await putSetting('org_name', orgName)
    await putSetting('contact_email', text(fd, 'contact_email'))
    await putSetting('response_target_hours', hours)
    await putSetting('default_district', text(fd, 'default_district') || 'All districts')
  } else if (section === 'email') {
    const senderName = text(fd, 'email_sender_name')
    if (!senderName) return { error: 'Sender name is required.' }
    await putSetting('email_sender_name', senderName.slice(0, 80))
    await putSetting('email_confirm_reporters', fd.get('email_confirm_reporters') === 'on')
  } else if (section === 'rules' || section === 'preferences') {
    for (const key of BOOLEAN_SETTINGS[section]) await putSetting(key, fd.get(key) === 'on')
  } else return { error: 'Unknown settings section.' }
  await logAudit(staff.id, 'Changed workspace settings', 'Settings', section)
  refreshAdmin()
  return { ok: true, message: 'Settings saved.' }
}

export async function changePassword(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const staff = await requireStaff()
  const current = text(fd, 'current_password')
  const next = text(fd, 'new_password')
  if (next.length < 8) return { error: 'New password must be at least 8 characters.' }
  if (next !== text(fd, 'confirm_password')) return { error: 'The new passwords do not match.' }
  const row = await queryOne<{ password_hash: string }>('select password_hash from staff where id = $1', [staff.id])
  if (!row || !verifyPassword(current, row.password_hash)) return { error: 'Your current password is incorrect.' }
  await query('update staff set password_hash = $2, must_change_password = false where id = $1', [staff.id, hashPassword(next)])
  await logAudit(staff.id, 'Changed own password', 'Access')
  refreshAdmin()
  return { ok: true, message: 'Password updated.' }
}

// ── Bulk incident management ────────────────────────────────────────────

export async function bulkUpdateIncidents(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const staff = await requireStaff()
  const denied = deny(staff, 'incidents.bulk')
  if (denied) return denied
  const ids = fd.getAll('ids').map(Number).filter((n) => Number.isInteger(n) && n > 0)
  if (!ids.length) return { error: 'Select at least one case first.' }
  const status = oneOf(INCIDENT_STATUSES, text(fd, 'bulk_status'))
  const priority = oneOf(PRIORITIES, text(fd, 'bulk_priority'))
  const assigneeRaw = text(fd, 'bulk_assignee')
  if (!status && !priority && !assigneeRaw) return { error: 'Choose a status, priority, or assignee to apply.' }
  const settings = await getSettings()
  if (status === 'Resolved' && settings.require_approval_close && !can(staff, 'incidents.close')) return { error: 'Your role cannot close cases while supervisor approval is required.' }

  const assignee = assigneeRaw === 'none' ? null : Number(assigneeRaw) || undefined
  const sets: string[] = ['updated_at = now()']
  const params: unknown[] = [ids]
  if (status) { params.push(status); sets.push(`status = $${params.length}`, `resolved_at = case when $${params.length} = 'Resolved' then coalesce(resolved_at, now()) else null end`) }
  if (priority) { params.push(priority); sets.push(`priority = $${params.length}`) }
  if (assignee !== undefined) { params.push(assignee); sets.push(`assignee_id = $${params.length}`) }
  const rows = await query<{ id: number; ref: string }>(`update incidents set ${sets.join(', ')} where id = any($1::int[]) returning id, ref`, params)

  const summary = [status && `status → ${status}`, priority && `priority → ${priority}`, assignee !== undefined && (assignee ? `assigned to ${(await queryOne<{ name: string }>('select name from staff where id = $1', [assignee]))?.name}` : 'unassigned')].filter(Boolean).join(', ')
  for (const row of rows) await query('insert into incident_notes (incident_id, staff_id, body) values ($1, $2, $3)', [row.id, staff.id, `Bulk update: ${summary}`])
  if (status === 'Escalated' && settings.notify_escalations && settings.pref_escalations)
    await notify(`${rows.length} case${rows.length === 1 ? '' : 's'} escalated`, `${rows.map((r) => r.ref).join(', ')} escalated by ${staff.name}.`, 'urgent', '/admin/incidents?status=Escalated')
  if (assignee && settings.pref_assignments) await notify(`${rows.length} case${rows.length === 1 ? '' : 's'} assigned`, `${summary}: ${rows.map((r) => r.ref).join(', ')}`, 'assignment', `/admin/incidents?assignee=${assignee}`)
  await logAudit(staff.id, `Bulk updated ${rows.length} incidents`, 'Incidents', `${summary} · ${rows.map((r) => r.ref).join(', ')}`)
  refreshAdmin()
  return { ok: true, message: `${rows.length} case${rows.length === 1 ? '' : 's'} updated (${summary}).` }
}

// ── Team workload ───────────────────────────────────────────────────────

export async function reassignWorkload(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const staff = await requireStaff()
  const denied = deny(staff, 'team.reassign')
  if (denied) return denied
  const from = idFrom(fd, 'from_id')
  const to = idFrom(fd, 'to_id')
  const scope = text(fd, 'scope')
  if (!from || !to || from === to) return { error: 'Choose two different staff members.' }
  const names = await query<{ id: number; name: string }>('select id, name from staff where id = any($1::int[])', [[from, to]])
  const name = (id: number) => names.find((n) => n.id === id)?.name ?? `#${id}`
  let cases = 0
  let requests = 0
  if (scope !== 'services') {
    const moved = await query<{ id: number }>(`update incidents set assignee_id = $2, updated_at = now() where assignee_id = $1 and status <> 'Resolved' returning id`, [from, to])
    cases = moved.length
    for (const m of moved) await query('insert into incident_notes (incident_id, staff_id, body) values ($1, $2, $3)', [m.id, staff.id, `Reassigned from ${name(from)} to ${name(to)}`])
  }
  if (scope !== 'incidents') requests = (await query(`update service_requests set assignee_id = $2, updated_at = now() where assignee_id = $1 and status <> 'Closed' returning id`, [from, to])).length
  if (!cases && !requests) return { error: `${name(from)} has no open work to move.` }
  await notify(`Workload moved to ${name(to)}`, `${cases} case(s) and ${requests} request(s) reassigned from ${name(from)}.`, 'assignment', `/admin/incidents?assignee=${to}`)
  await logAudit(staff.id, `Reassigned workload from ${name(from)}`, 'Team', `${cases} cases, ${requests} requests → ${name(to)}`)
  refreshAdmin()
  return { ok: true, message: `Moved ${cases} case(s) and ${requests} request(s) to ${name(to)}.` }
}
