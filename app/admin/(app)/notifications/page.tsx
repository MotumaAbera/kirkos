import { Bell, Check, CheckCheck, CircleAlert, Info, Trash2, Undo2, UserCheck } from 'lucide-react'
import { markAllNotificationsRead, markNotification, openNotification, saveSettings } from '@/app/admin/actions'
import { ActionForm, SubmitButton } from '@/components/admin/forms'
import { EmptyState, FilterTabs, PageHeader, Panel, secondaryButton, timeAgo } from '@/components/admin/ui'
import { can, requirePermission } from '@/lib/auth'
import { getSettings, listNotifications } from '@/lib/queries'
import { cn } from '@/lib/utils'

const icons = { urgent: [CircleAlert, 'bg-[#fff0f1] text-[#b32d3d]'], assignment: [UserCheck, 'bg-[#fff7df] text-[#9a6d08]'], info: [Info, 'bg-[#edf3fa] text-[#1d5fa7]'] } as const

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const staff = await requirePermission('notifications.view')
  const { filter = 'all' } = await searchParams
  const [items, settings] = await Promise.all([listNotifications(filter), getSettings()])
  const unread = items.filter((n) => !n.read_at).length

  return <>
    <PageHeader eyebrow="Workspace" title="Notifications" description="Escalations, new reports, and assignments as they happen."
      actions={<ActionForm action={markAllNotificationsRead} hideMessage><SubmitButton className={secondaryButton} pendingText="Updating…"><CheckCheck className="size-4" />Mark all read</SubmitButton></ActionForm>} />

    <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
      <div className="min-w-0">
        <FilterTabs basePath="/admin/notifications" param="filter" active={filter} params={{}} items={[{ label: 'All', value: 'all' }, { label: 'Unread', value: 'unread' }, { label: 'Urgent', value: 'urgent' }, { label: 'Assignments', value: 'assignment' }, { label: 'Info', value: 'info' }]} />
        <Panel className="mt-3" flush>
          {items.length === 0 ? <EmptyState title="You're all caught up" text="New alerts will show up here." /> : <ul className="divide-y divide-[#edf1f5]">
            {items.map((n) => {
              const [Icon, tone] = icons[n.type as keyof typeof icons] ?? [Bell, 'bg-[#edf3fa] text-[#1d5fa7]']
              return <li key={n.id} className={cn('flex gap-3 px-5 py-4', !n.read_at && 'bg-[#f7faff]')}>
                <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${tone}`}><Icon className="size-4" /></span>
                <form action={openNotification} className="min-w-0 flex-1">
                  <input type="hidden" name="id" value={n.id} />
                  <button type="submit" className="block w-full text-left">
                    <p className="flex items-center gap-2 text-sm font-semibold hover:text-[#1d5fa7]">{!n.read_at && <span className="size-2 shrink-0 rounded-full bg-[#1d5fa7]" />}{n.title}</p>
                    {n.body && <p className="mt-0.5 text-xs leading-5 text-[#718096]">{n.body}</p>}
                    <p className="mt-1 text-[11px] text-[#8996a8]">{timeAgo(n.created_at)}</p>
                  </button>
                </form>
                <div className="flex shrink-0 items-start gap-1">
                  <ActionForm action={markNotification} hideMessage>
                    <input type="hidden" name="id" value={n.id} /><input type="hidden" name="mode" value={n.read_at ? 'unread' : 'read'} />
                    <button type="submit" title={n.read_at ? 'Mark unread' : 'Mark read'} aria-label={n.read_at ? 'Mark unread' : 'Mark read'} className="rounded-md p-2 text-[#8996a8] hover:bg-[#edf1f5] hover:text-[#14233b]">{n.read_at ? <Undo2 className="size-4" /> : <Check className="size-4" />}</button>
                  </ActionForm>
                  <ActionForm action={markNotification} hideMessage>
                    <input type="hidden" name="id" value={n.id} /><input type="hidden" name="mode" value="delete" />
                    <button type="submit" title="Delete" aria-label="Delete notification" className="rounded-md p-2 text-[#8996a8] hover:bg-[#fff0f1] hover:text-[#b32d3d]"><Trash2 className="size-4" /></button>
                  </ActionForm>
                </div>
              </li>
            })}
          </ul>}
        </Panel>
        {filter === 'all' && unread > 0 && <p className="mt-3 text-xs text-[#718096]">{unread} unread</p>}
      </div>

      <Panel title="Alert preferences" description="Which events create notifications" className="h-fit">
        <ActionForm action={saveSettings} className="flex flex-col gap-3">
          <input type="hidden" name="section" value="preferences" />
          {([['pref_escalations', 'Escalations'], ['pref_assignments', 'Assignments'], ['pref_sla', 'SLA warnings (cases past the response target)']] as const).map(([key, label]) => <label key={key} className="flex items-center justify-between gap-3 rounded-lg border border-[#edf1f5] px-3 py-2.5 text-sm font-semibold">
            {label}<input type="checkbox" name={key} defaultChecked={settings[key]} disabled={!can(staff, 'settings.manage')} className="size-4 accent-[#1d5fa7]" />
          </label>)}
          {can(staff, 'settings.manage') ? <SubmitButton>Save preferences</SubmitButton> : <p className="text-[11px] text-[#718096]">Supervisors and administrators can change these.</p>}
        </ActionForm>
      </Panel>
    </div>
  </>
}
