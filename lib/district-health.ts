import type { DistrictRow } from '@/lib/queries'

export function districtHealth(d: Pick<DistrictRow, 'overdue' | 'escalated'>) {
  if (d.overdue >= 3 || d.escalated >= 2) return 'Critical'
  if (d.overdue > 0 || d.escalated > 0) return 'Watch'
  return 'Healthy'
}
