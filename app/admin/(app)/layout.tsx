import type { ReactNode } from 'react'
import { after } from 'next/server'
import { AdminShell } from '@/components/admin/shell'
import { raiseSlaWarnings } from '@/lib/activity'
import { escalateOverdueCitations } from '@/lib/enforcement'
import { requireStaff } from '@/lib/auth'
import { getNavCounts, getSettings } from '@/lib/queries'

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const staff = await requireStaff()
  const [counts, settings] = await Promise.all([getNavCounts(), getSettings()])
  if (settings.pref_sla) after(() => raiseSlaWarnings(settings.response_target_hours).catch((e) => console.error('SLA check failed', e)))
  // Unpaid citations past the escalation threshold become court referrals (idempotent).
  after(() => escalateOverdueCitations(settings.escalate_after_days).catch((e) => console.error('Citation escalation failed', e)))
  return <AdminShell staff={staff} counts={counts} orgName={settings.org_name}>{children}</AdminShell>
}
