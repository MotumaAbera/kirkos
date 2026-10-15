import 'server-only'
import { query, queryOne } from '@/lib/db'

/** Headline numbers for the public homepage, computed live. */
export async function getPublicStats() {
  return (await queryOne<{ received_year: number; resolved_year: number; resolution_rate: number | null; avg_hours: number | null }>(`
    select
      (select count(*) from incidents where created_at >= date_trunc('year', now()))::int as received_year,
      (select count(*) from incidents where resolved_at >= date_trunc('year', now()))::int as resolved_year,
      (select round(100.0 * count(*) filter (where status = 'Resolved') / nullif(count(*), 0))::float from incidents) as resolution_rate,
      (select round(avg(extract(epoch from resolved_at - created_at) / 3600))::float from incidents where resolved_at > now() - interval '90 days') as avg_hours`))!
}

export type TrackResult =
  | { kind: 'incident'; ref: string; category: string; sub_city: string; status: string; received: Date; updated: Date; resolved: Date | null; steps: { label: string; done: boolean; at: Date | null }[] }
  | { kind: 'service'; ref: string; category: string; sub_city: string; status: string; received: Date; updated: Date; resolved: Date | null; steps: { label: string; done: boolean; at: Date | null }[] }

/**
 * Public status for a case or service request. Deliberately shows no description, landmark,
 * reporter details, or internal notes – only what is safe to reveal to anyone holding the reference.
 */
export async function trackReference(raw: string): Promise<TrackResult | null> {
  const ref = raw.trim().toUpperCase()
  if (!/^AACEA-S?\d{2,8}$/.test(ref)) return null
  if (ref.startsWith('AACEA-S')) {
    const r = await queryOne<{ ref: string; category: string; sub_city: string; status: string; created_at: Date; updated_at: Date; closed_at: Date | null }>(
      'select ref, category, sub_city, status, created_at, updated_at, closed_at from service_requests where upper(ref) = $1', [ref])
    if (!r) return null
    const order = ['Received', 'Assigned', 'In review', 'Closed']
    const at = order.indexOf(r.status)
    return { kind: 'service', ref: r.ref, category: r.category, sub_city: r.sub_city, status: r.status, received: r.created_at, updated: r.updated_at, resolved: r.closed_at,
      steps: order.map((label, i) => ({ label, done: i <= at, at: i === 0 ? r.created_at : i === order.length - 1 ? r.closed_at : null })) }
  }
  const i = await queryOne<{ ref: string; category: string; sub_city: string; status: string; created_at: Date; updated_at: Date; resolved_at: Date | null; assigned: boolean }>(
    'select ref, category, sub_city, status, created_at, updated_at, resolved_at, assignee_id is not null as assigned from incidents where upper(ref) = $1', [ref])
  if (!i) return null
  return { kind: 'incident', ref: i.ref, category: i.category, sub_city: i.sub_city, status: i.status, received: i.created_at, updated: i.updated_at, resolved: i.resolved_at,
    steps: [
      { label: 'Report received', done: true, at: i.created_at },
      { label: 'Assigned to an inspector', done: i.assigned || i.status !== 'New', at: null },
      { label: i.status === 'Escalated' ? 'Escalated for senior review' : 'Under investigation', done: i.status !== 'New', at: null },
      { label: 'Resolved', done: i.status === 'Resolved', at: i.resolved_at },
    ] }
}

export type PublicDocument = { id: number; title: string; description: string; original_name: string; mime: string; size_bytes: string; published: boolean; created_at: Date }

export async function listPublicDocuments(publishedOnly = true) {
  return query<PublicDocument>(`select id, title, description, original_name, mime, size_bytes::text, published, created_at from public_documents ${publishedOnly ? 'where published' : ''} order by created_at desc`)
}
