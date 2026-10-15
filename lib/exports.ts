import 'server-only'
import { SUB_CITIES } from '@/lib/constants'
import { toCsv } from '@/lib/csv'
import { districtHealth } from '@/lib/district-health'
import { getDistrictPerformance, getReport, getSettings, listAudit, listIncidents, listServiceRequests, listStaff } from '@/lib/queries'
import type { Permission } from '@/lib/rbac'

export const EXPORTS = {
  incidents: { label: 'Incident register', permission: 'incidents.view' },
  services: { label: 'Service requests', permission: 'services.view' },
  districts: { label: 'District performance', permission: 'districts.view' },
  team: { label: 'Team workload', permission: 'team.view' },
  summary: { label: 'Performance summary', permission: 'reports.view' },
  audit: { label: 'Audit activity', permission: 'audit.view' },
} as const satisfies Record<string, { label: string; permission: Permission }>

export type ExportKind = keyof typeof EXPORTS
export const isExportKind = (value: string): value is ExportKind => value in EXPORTS

const PERIODS = [7, 30, 90, 365]
const today = () => new Date().toISOString().slice(0, 10)

/** Builds a CSV export. `p` holds the same query parameters the download URLs use. */
export async function buildExport(kind: ExportKind, p: Record<string, string | undefined>) {
  const get = (key: string) => p[key] || undefined
  const days = PERIODS.includes(Number(p.days)) ? Number(p.days) : 30
  const settings = await getSettings()

  switch (kind) {
    case 'incidents': {
      const { rows } = await listIncidents({ q: get('q'), status: get('status'), subCity: get('subCity'), priority: get('priority'), assignee: get('assignee'), from: get('from'), to: get('to') }, settings.response_target_hours, 10000)
      return {
        filename: `incidents-${today()}.csv`, count: rows.length,
        csv: toCsv(['Reference', 'Title', 'Category', 'Sub-city', 'Woreda', 'Landmark', 'Status', 'Priority', 'Overdue', 'Assignee', 'Source', 'Reporter', 'Phone', 'Email', 'Received', 'Resolved', 'Description'],
          rows.map((r) => [r.ref, r.title, r.category, r.sub_city, r.woreda, r.landmark, r.status, r.priority, r.overdue ? 'Yes' : 'No', r.assignee_name, r.source,
            r.anonymous ? 'Anonymous' : r.reporter_name, r.anonymous ? '' : r.reporter_phone, r.anonymous ? '' : r.reporter_email, r.created_at, r.resolved_at, r.description])),
      }
    }
    case 'services': {
      const { rows } = await listServiceRequests({ status: get('status'), category: get('category'), q: get('q') }, 10000)
      return {
        filename: `service-requests-${today()}.csv`, count: rows.length,
        csv: toCsv(['Reference', 'Title', 'Category', 'Sub-city', 'Status', 'Overdue', 'Assignee', 'Requester', 'Phone', 'Due date', 'Created', 'Closed', 'Notes'],
          rows.map((r) => [r.ref, r.title, r.category, r.sub_city, r.status, r.overdue ? 'Yes' : 'No', r.assignee_name, r.requester_name, r.requester_phone, r.due_date, r.created_at, r.closed_at, r.notes])),
      }
    }
    case 'districts': {
      const rows = await getDistrictPerformance(days, settings.response_target_hours, SUB_CITIES)
      return {
        filename: `district-performance-${days}d-${today()}.csv`, count: rows.length,
        csv: toCsv(['Sub-city', 'Health', 'Received', 'Resolved', 'Open', 'Escalated', 'Overdue', 'Avg resolution hours', 'Resolution rate %', 'Open service requests', 'Active staff'],
          rows.map((r) => [r.sub_city, districtHealth(r), r.received, r.resolved, r.open, r.escalated, r.overdue, r.avg_hours ?? '', r.resolution_rate ?? '', r.open_services, r.staff])),
      }
    }
    case 'team': {
      const rows = await listStaff(settings.response_target_hours)
      return {
        filename: `team-workload-${today()}.csv`, count: rows.length,
        csv: toCsv(['Name', 'Email', 'Role', 'District', 'Phone', 'Status', 'Open cases', 'Open service requests', 'Escalated', 'Overdue', 'Resolved (30 days)', 'Avg resolution hours (30 days)', 'Last sign-in'],
          rows.map((s) => [s.name, s.email, s.role, s.district, s.phone, s.status, s.open_incidents, s.open_services, s.escalated, s.overdue, s.resolved_30d, s.avg_hours_30d ?? '', s.last_login_at])),
      }
    }
    case 'summary': {
      const { summary, byCategory, bySubCity, statusMix } = await getReport(days)
      const rows = [
        ['Summary', 'Reports received', summary.received, ''],
        ['Summary', 'Cases resolved', summary.resolved, ''],
        ['Summary', 'Average resolution hours', summary.avg_hours ?? '', ''],
        ['Summary', 'Service requests created', summary.services, ''],
        ...statusMix.map((s) => ['Status', s.status, s.count, '']),
        ...byCategory.map((c) => ['Category', c.label, c.count, '']),
        ...bySubCity.map((s) => ['Sub-city', s.label, s.count, s.resolved]),
      ]
      return { filename: `aacea-report-${days}d-${today()}.csv`, count: rows.length, csv: toCsv(['Section', 'Item', 'Count', 'Resolved'], rows) }
    }
    case 'audit': {
      const { rows } = await listAudit({ staff: get('staff'), area: get('area'), q: get('q') }, 50000)
      return {
        filename: `audit-log-${today()}.csv`, count: rows.length,
        csv: toCsv(['Time', 'Staff', 'Action', 'Area', 'Detail'], rows.map((r) => [r.created_at, r.staff_name ?? 'System / public', r.action, r.area, r.detail])),
      }
    }
  }
}
