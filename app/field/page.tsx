import { FieldCaseList } from '@/components/field/case-list'
import { ShiftControl } from '@/components/field/shift'
import { timeAgo } from '@/components/admin/ui'
import { requireStaff } from '@/lib/auth'
import { queryOne } from '@/lib/db'
import { getFieldCases } from '@/lib/enforcement'

export default async function FieldHome() {
  const staff = await requireStaff()
  const [cases, loc] = await Promise.all([
    getFieldCases(staff.id),
    queryOne<{ on_duty: boolean }>(`select on_duty from staff_locations where staff_id = $1 and updated_at > now() - interval '2 hours'`, [staff.id]),
  ])
  return <div className="flex flex-col gap-4">
    <ShiftControl initiallyOnDuty={Boolean(loc?.on_duty)} />
    <div className="flex items-end justify-between"><h1 className="text-lg font-bold">My cases</h1><span className="text-xs text-[#718096]">{cases.length} open · nearest first</span></div>
    <FieldCaseList cases={cases.map((c) => ({ id: c.id, ref: c.ref, title: c.title, status: c.status, priority: c.priority, sub_city: c.sub_city, woreda: c.woreda, lat: c.lat, lng: c.lng, age: timeAgo(c.created_at) }))} />
    <p className="text-center text-[11px] text-[#8996a8]">Tip: use your browser&apos;s “Add to Home screen” to install this app.</p>
  </div>
}
