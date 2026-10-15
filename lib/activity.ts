import 'server-only'
import { query } from '@/lib/db'

export async function logAudit(staffId: number | null, action: string, area: string, detail = '') {
  await query('insert into audit_log (staff_id, action, area, detail) values ($1, $2, $3, $4)', [staffId, action, area, detail])
}

export async function notify(title: string, body: string, type: 'urgent' | 'assignment' | 'info', link?: string) {
  await query('insert into notifications (title, body, type, link) values ($1, $2, $3, $4)', [title, body, type, link ?? null])
}

/** Creates one "SLA warning" notification per open incident that has passed the response target. Safe to call repeatedly. */
export async function raiseSlaWarnings(targetHours: number) {
  await query(
    `insert into notifications (title, body, type, link)
     select i.ref || ' passed the response target', i.title || ' (' || i.sub_city || ') has been open for more than ' || $1::int || ' hours.', 'urgent', '/admin/incidents/' || i.id
     from incidents i
     where i.status <> 'Resolved' and i.created_at < now() - make_interval(hours => $1::int)
       and not exists (select 1 from notifications n where n.link = '/admin/incidents/' || i.id and n.title like '%passed the response target')`,
    [targetHours],
  )
}
