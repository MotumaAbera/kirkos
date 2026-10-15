/** Every permission the workspace checks, grouped for the roles matrix. Keep in sync with scripts/db-setup.mjs. */
export const PERMISSION_GROUPS = [
  {
    label: 'Incidents',
    items: [
      ['incidents.view', 'View incidents', 'See the incident queue and case details'],
      ['incidents.create', 'Log incidents', 'Create cases from phone, walk-in, or patrol reports'],
      ['incidents.edit', 'Work cases', 'Change status, priority, assignee and add notes'],
      ['incidents.bulk', 'Bulk actions', 'Update many cases at once'],
      ['incidents.close', 'Close cases', 'Mark cases resolved when supervisor approval is required'],
      ['incidents.delete', 'Delete cases', 'Permanently remove a case'],
    ],
  },
  {
    label: 'GIS, field & evidence',
    items: [
      ['map.view', 'Live map & dispatch', 'See the incident map, heatmap, officer locations, and dispatch officers'],
      ['field.use', 'Field app', 'Use the mobile field app: shifts, location sharing, check-ins'],
      ['evidence.view', 'View evidence', 'Open photos, videos, and documents attached to cases and appeals'],
      ['evidence.upload', 'Upload evidence', 'Attach photos, videos, and documents to cases and appeals'],
    ],
  },
  {
    label: 'Revenue & fines',
    items: [
      ['citations.view', 'View citations', 'See citations, balances, and payment history'],
      ['citations.issue', 'Issue citations', 'Issue a citation (fine) against a case'],
      ['citations.manage', 'Manage citations', 'Void or waive citations and approve payment plans'],
      ['payments.record', 'Record payments', 'Record cash, bank, and mobile-money payments'],
      ['fees.manage', 'Fee schedule', 'Change the official penalty amounts'],
    ],
  },
  {
    label: 'Legal & appeals',
    items: [
      ['legal.view', 'View legal cases', 'See appeals, court referrals, and hearings'],
      ['legal.manage', 'Manage legal cases', 'Schedule hearings and record decisions'],
    ],
  },
  {
    label: 'Operations',
    items: [
      ['districts.view', 'District performance', 'View sub-city performance and drill-downs'],
      ['services.view', 'View service requests', 'See service requests and their details'],
      ['services.edit', 'Work service requests', 'Create and update service requests'],
      ['services.delete', 'Delete service requests', 'Permanently remove a service request'],
      ['team.view', 'Team workload', 'See workload across staff'],
      ['team.reassign', 'Reassign work', 'Move open work between staff'],
    ],
  },
  {
    label: 'Insights & communication',
    items: [
      ['reports.view', 'View reports', 'See reports and analytics'],
      ['reports.export', 'Export data', 'Download CSV exports'],
      ['audit.view', 'Audit activity', 'See the audit trail of all staff actions'],
      ['notifications.view', 'Notifications', 'Receive and manage workspace notifications'],
      ['email.send', 'Send emails & reports', 'Email reports, files, and case updates to people'],
      ['email.broadcast', 'Email broadcasts', 'Send announcements to staff groups'],
    ],
  },
  {
    label: 'Administration',
    items: [
      ['users.manage', 'Manage users & roles', 'Create accounts, reset passwords, edit roles and permissions'],
      ['settings.manage', 'Workspace settings', 'Change workspace rules and email settings'],
    ],
  },
] as const

export type Permission = (typeof PERMISSION_GROUPS)[number]['items'][number][0]
export const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => i[0])) as Permission[]
export const isPermission = (value: string): value is Permission => (ALL_PERMISSIONS as string[]).includes(value)

/** The role that always holds every permission and cannot be edited or deleted. */
export const SUPER_ROLE = 'Administrator'

/** Flat list of permissions with labels, for lookups and the roles matrix. */
export const PERMISSION_INFO: { key: Permission; label: string; help: string; group: string }[] = PERMISSION_GROUPS.flatMap((g) =>
  (g.items as readonly (readonly [string, string, string])[]).map(([key, label, help]) => ({ key: key as Permission, label, help, group: g.label })))
