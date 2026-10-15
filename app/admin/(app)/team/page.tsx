import Link from 'next/link'
import { ArrowRightLeft, Download, UserCog } from 'lucide-react'
import { reassignWorkload } from '@/app/admin/actions'
import { ActionForm, SubmitButton } from '@/components/admin/forms'
import { Badge, PageHeader, Panel, StatCard, formatDate, initials, inputClass, labelClass, secondaryButton } from '@/components/admin/ui'
import { can, requirePermission } from '@/lib/auth'
import { getNavCounts, getSettings, listStaff, type Staff } from '@/lib/queries'
import { cn } from '@/lib/utils'

/** Open items (cases + service requests) a person can carry comfortably. */
const CAPACITY = 10
const loadOf = (s: Staff) => s.open_incidents + s.open_services
const loadLevel = (s: Staff) => (loadOf(s) >= CAPACITY * 0.8 || s.overdue >= 3 ? 'Overloaded' : loadOf(s) >= CAPACITY * 0.4 ? 'Busy' : 'Available')

export default async function TeamWorkloadPage() {
  const me = await requirePermission('team.view')
  const settings = await getSettings()
  const [staff, counts] = await Promise.all([listStaff(settings.response_target_hours), getNavCounts()])
  const active = staff.filter((s) => s.status === 'Active')
  const away = staff.filter((s) => s.status !== 'Active')
  const openLoad = active.reduce((sum, s) => sum + loadOf(s), 0)
  const stranded = away.reduce((sum, s) => sum + loadOf(s), 0)
  const overloaded = active.filter((s) => loadLevel(s) === 'Overloaded')
  const resolved30 = staff.reduce((sum, s) => sum + s.resolved_30d, 0)
  const board = [...active].sort((a, b) => loadOf(b) - loadOf(a))
  const withWork = staff.filter((s) => loadOf(s) > 0)

  return <>
    <PageHeader eyebrow="Workspace" title="Team workload" description="See who is carrying what, spot overload early, and rebalance work across the team."
      actions={<>{can(me, 'reports.export') && <a href="/admin/team/export" className={secondaryButton}><Download className="size-4" />Export CSV</a>}{can(me, 'users.manage') && <Link href="/admin/users" className={secondaryButton}><UserCog className="size-4" />Manage users</Link>}</>} />

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Open assignments" value={openLoad} note={active.length ? `${(openLoad / active.length).toFixed(1)} per active person · capacity ${CAPACITY}` : 'No active staff'} />
      <StatCard label="Overloaded staff" value={overloaded.length} note={overloaded.length ? overloaded.map((s) => s.name.split(' ')[0]).join(', ') : 'Nobody above 80% capacity'} tone={overloaded.length ? 'bad' : 'good'} />
      <StatCard label="Waiting for an owner" value={counts.unassigned} note={stranded ? `${stranded} item(s) held by staff who are away` : 'Open cases with no assignee'} tone={stranded || counts.unassigned ? 'warn' : 'good'} href="/admin/incidents?status=Open&assignee=unassigned" />
      <StatCard label="Resolved (30 days)" value={resolved30} note={`${active.length} active · ${away.length} away or inactive`} tone="good" />
    </div>

    <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_320px]">
      <Panel title="Workload board" description={`Active staff, busiest first. Capacity is ${CAPACITY} open items per person.`}>
        {board.length === 0 ? <p className="text-sm text-[#718096]">No active staff.</p> : <div className="grid gap-3 md:grid-cols-2">
          {board.map((s) => {
            const load = loadOf(s)
            const level = loadLevel(s)
            return <article key={s.id} className="rounded-xl border border-[#edf1f5] p-4">
              <div className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#dce9f7] text-xs font-bold text-[#1d5fa7]">{initials(s.name)}</span>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{s.name}{s.id === me.id && <span className="ml-1 font-normal text-[#718096]">(you)</span>}</p><p className="truncate text-xs text-[#718096]">{s.role} · {s.district}</p></div>
                <Badge>{level}</Badge>
              </div>
              <div className="mt-4 flex items-center gap-2">
                <div className="h-2 flex-1 rounded-full bg-[#edf1f5]"><div className={cn('h-2 rounded-full', level === 'Overloaded' ? 'bg-[#b32d3d]' : level === 'Busy' ? 'bg-[#e9bb52]' : 'bg-[#267448]')} style={{ width: `${Math.min(100, (load / CAPACITY) * 100)}%` }} /></div>
                <span className="w-14 text-right text-xs font-semibold">{load}/{CAPACITY}</span>
              </div>
              <dl className="mt-3 grid grid-cols-4 gap-2 text-center">
                {[['Cases', s.open_incidents], ['Requests', s.open_services], ['Escalated', s.escalated], ['Overdue', s.overdue]].map(([label, value]) => <div key={label} className="rounded-lg bg-[#f7f9fc] py-2"><dd className={cn('text-sm font-bold', (label === 'Overdue' || label === 'Escalated') && Number(value) > 0 && 'text-[#b32d3d]')}>{value}</dd><dt className="text-[10px] text-[#718096]">{label}</dt></div>)}
              </dl>
              <div className="mt-3 flex items-center justify-between text-[11px] text-[#718096]">
                <span>{s.resolved_30d} resolved in 30d{s.avg_hours_30d !== null && ` · avg ${s.avg_hours_30d}h`}</span>
                <Link href={`/admin/incidents?status=Open&assignee=${s.id}`} className="font-semibold text-[#1d5fa7] hover:underline">View cases</Link>
              </div>
            </article>
          })}
        </div>}
      </Panel>

      <div className="flex flex-col gap-6">
        <Panel title="Rebalance work" description="Move all open work from one person to another.">
          {can(me, 'team.reassign') ? <ActionForm action={reassignWorkload} resetOnSuccess className="flex flex-col gap-3">
            <label className={labelClass}>From<select name="from_id" required defaultValue="" className={inputClass}><option value="" disabled>Choose staff…</option>{withWork.map((s) => <option key={s.id} value={s.id}>{s.name} · {loadOf(s)} open{s.status !== 'Active' ? ` (${s.status})` : ''}</option>)}</select></label>
            <label className={labelClass}>To<select name="to_id" required defaultValue="" className={inputClass}><option value="" disabled>Choose staff…</option>{active.map((s) => <option key={s.id} value={s.id}>{s.name} · {loadOf(s)} open</option>)}</select></label>
            <label className={labelClass}>What to move<select name="scope" className={inputClass}><option value="all">Cases and service requests</option><option value="incidents">Cases only</option><option value="services">Service requests only</option></select></label>
            <SubmitButton pendingText="Moving…"><ArrowRightLeft className="size-4" />Reassign</SubmitButton>
          </ActionForm> : <p className="text-sm text-[#718096]">Your role can view workload but not reassign it.</p>}
        </Panel>
        <Panel title="Away or inactive">
          {away.length === 0 ? <p className="text-sm text-[#718096]">Everyone is active.</p> : <ul className="flex flex-col gap-3">{away.map((s) => <li key={s.id} className="flex items-center gap-3 text-sm">
            <span className="flex size-8 items-center justify-center rounded-full bg-[#f3f6fa] text-[10px] font-bold text-[#718096]">{initials(s.name)}</span>
            <span className="min-w-0 flex-1 truncate">{s.name}{loadOf(s) > 0 && <span className="block text-[11px] font-semibold text-[#b32d3d]">{loadOf(s)} open item(s) need reassigning</span>}</span><Badge>{s.status}</Badge>
          </li>)}</ul>}
        </Panel>
      </div>
    </div>

    <Panel className="mt-6" title="Staff directory" description="Contact details for everyone in the workspace." actions={can(me, 'users.manage') ? <Link href="/admin/users" className="text-xs font-semibold text-[#1d5fa7] hover:underline">Edit in User management</Link> : undefined} flush>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-[#edf1f5] bg-[#f7f9fc] text-[11px] font-bold uppercase tracking-wider text-[#718096]">
            <tr><th className="px-5 py-3">Name</th><th className="px-3 py-3">Role & district</th><th className="px-3 py-3">Phone</th><th className="px-3 py-3">Status</th><th className="px-5 py-3">Last sign-in</th></tr>
          </thead>
          <tbody className="divide-y divide-[#edf1f5]">
            {staff.map((s) => <tr key={s.id} className="hover:bg-[#f7f9fc]">
              <td className="px-5 py-3"><p className="font-semibold">{s.name}</p><p className="text-xs text-[#718096]">{s.email}</p></td>
              <td className="px-3 py-3 text-xs"><p className="font-semibold text-[#33445c]">{s.role}</p><p className="text-[#718096]">{s.district}</p></td>
              <td className="px-3 py-3 text-xs text-[#52637b]">{s.phone ?? '—'}</td>
              <td className="px-3 py-3"><Badge>{s.status}</Badge></td>
              <td className="px-5 py-3 text-xs text-[#718096]">{s.last_login_at ? formatDate(s.last_login_at) : 'Never'}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </Panel>
  </>
}
