import { CheckCircle2, CircleAlert, FileUp, Megaphone, Paperclip, Send } from 'lucide-react'
import { saveSettings } from '@/app/admin/actions'
import { sendBroadcast, sendReportEmail, sendTestEmail } from '@/app/admin/email-actions'
import { ActionForm, SubmitButton } from '@/components/admin/forms'
import { Badge, EmptyState, FilterTabs, PageHeader, Panel, StatCard, formatDate, inputClass, labelClass, secondaryButton, textareaClass } from '@/components/admin/ui'
import { can, requireStaff } from '@/lib/auth'
import { INCIDENT_STATUSES, SUB_CITIES } from '@/lib/constants'
import { EXPORTS, type ExportKind } from '@/lib/exports'
import { verifyMailer } from '@/lib/mailer'
import { getSettings, listEmailLog, listRoles, listUsers } from '@/lib/queries'
import { cn } from '@/lib/utils'
import { redirect } from 'next/navigation'

const chip = 'flex cursor-pointer items-center gap-2 rounded-lg border border-[#dfe7f0] px-3 py-2 text-xs font-semibold has-[:checked]:border-[#1d5fa7] has-[:checked]:bg-[#f1f6fc] has-[:checked]:text-[#082957]'

function PeoplePicker({ people }: { people: { id: number; name: string; email: string; role: string }[] }) {
  return <div className="max-h-56 overflow-y-auto rounded-lg border border-[#dfe7f0]">
    {people.map((p) => <label key={p.id} className="flex cursor-pointer items-center gap-3 border-b border-[#f1f4f8] px-3 py-2 text-sm last:border-0 hover:bg-[#f7f9fc] has-[:checked]:bg-[#f1f6fc]">
      <input type="checkbox" name="people" value={p.id} className="size-4 accent-[#1d5fa7]" />
      <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{p.name}</span><span className="block truncate text-xs text-[#718096]">{p.email}</span></span>
      <span className="text-[11px] text-[#8996a8]">{p.role}</span>
    </label>)}
  </div>
}

export default async function EmailCenterPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const me = await requireStaff()
  const canSend = can(me, 'email.send')
  const canBroadcast = can(me, 'email.broadcast')
  if (!canSend && !canBroadcast) redirect('/admin/denied?need=email.send')
  const { tab: rawTab } = await searchParams
  const tabs = [canBroadcast && { label: 'Broadcast', value: 'broadcast' }, canSend && { label: 'Send report or file', value: 'report' }, { label: 'Sent history', value: 'history' }].filter(Boolean) as { label: string; value: string }[]
  const tab = tabs.some((t) => t.value === rawTab) ? rawTab! : tabs[0].value

  const [mailer, settings, log, roles, people] = await Promise.all([verifyMailer(), getSettings(), listEmailLog(), listRoles(), listUsers({ status: 'Active' })])
  const reportKinds = (Object.keys(EXPORTS) as ExportKind[]).filter((k) => can(me, 'reports.export') && can(me, EXPORTS[k].permission))
  const districtsWithStaff = SUB_CITIES.filter((c) => people.some((p) => p.district === c))

  return <>
    <PageHeader eyebrow="Workspace" title="Email center" description="Send announcements to staff, share reports and files, and track every email sent from the workspace."
      actions={canSend && <ActionForm action={sendTestEmail} hideMessage={false} className="flex flex-col items-end"><SubmitButton className={secondaryButton} pendingText="Sending…"><Send className="size-4" />Send me a test email</SubmitButton></ActionForm>} />

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <div className={cn('rounded-xl border p-5 shadow-sm', mailer.ok ? 'border-[#c7e9d4] bg-[#f3fbf6]' : 'border-[#f6cdd2] bg-[#fff6f7]')}>
        <p className="flex items-center gap-2 text-xs font-semibold text-[#52637b]">{mailer.ok ? <CheckCircle2 className="size-4 text-[#267448]" /> : <CircleAlert className="size-4 text-[#b32d3d]" />}Mail server</p>
        <p className={cn('mt-2 text-lg font-bold', mailer.ok ? 'text-[#267448]' : 'text-[#b32d3d]')}>{mailer.ok ? 'Connected' : 'Not connected'}</p>
        <p className="mt-1 truncate text-xs text-[#52637b]" title={mailer.ok ? mailer.user : mailer.error}>{mailer.ok ? `Sending as ${settings.email_sender_name} <${mailer.user}>` : mailer.error}</p>
      </div>
      <StatCard label="Emails sent (30 days)" value={log.stats.month} />
      <StatCard label="Recipients reached (30 days)" value={log.stats.recipients} />
      <StatCard label="Failed or partial (30 days)" value={log.stats.failed} tone={log.stats.failed ? 'bad' : 'good'} note={log.stats.failed ? 'See sent history for details' : 'All delivered'} />
    </div>

    <div className="mt-6"><FilterTabs basePath="/admin/email" param="tab" active={tab} params={{}} items={tabs} /></div>

    <div className="mt-4 grid gap-6 xl:grid-cols-[1fr_320px]">
      <div className="min-w-0">
        {tab === 'broadcast' && <Panel title="Broadcast to staff" description="Each person gets their own copy, so recipients can't see each other.">
          <ActionForm action={sendBroadcast} resetOnSuccess className="group flex flex-col gap-5">
            <fieldset>
              <legend className={`${labelClass} mb-2`}>Audience</legend>
              <div className="flex flex-wrap gap-2">
                {[['all', `All active staff (${people.length})`], ['roles', 'By role'], ['districts', 'By district'], ['people', 'Pick people']].map(([value, label], i) =>
                  <label key={value} className={chip}><input type="radio" name="audience" value={value} id={`aud-${value}`} defaultChecked={i === 0} className="accent-[#1d5fa7]" />{label}</label>)}
              </div>
              <div className="mt-3 hidden flex-wrap gap-2 group-has-[#aud-roles:checked]:flex">
                {roles.map((r) => <label key={r.name} className={chip}><input type="checkbox" name="roles" value={r.name} className="accent-[#1d5fa7]" />{r.name}<span className="text-[#8996a8]">{people.filter((p) => p.role === r.name).length}</span></label>)}
              </div>
              <div className="mt-3 hidden flex-wrap gap-2 group-has-[#aud-districts:checked]:flex">
                {['Central office', ...districtsWithStaff].map((d) => <label key={d} className={chip}><input type="checkbox" name="districts" value={d} className="accent-[#1d5fa7]" />{d}<span className="text-[#8996a8]">{people.filter((p) => p.district === d).length}</span></label>)}
              </div>
              <div className="mt-3 hidden group-has-[#aud-people:checked]:block"><PeoplePicker people={people} /></div>
            </fieldset>
            <label className={labelClass}>Also send to (optional)<input name="extra" placeholder="name@example.com, another@example.com" className={inputClass} /></label>
            <label className={labelClass}>Subject<input name="subject" required maxLength={150} placeholder="e.g. Office closure on Friday" className={inputClass} /></label>
            <label className={labelClass}>Message<textarea name="message" required rows={8} defaultValue={'Hello {name},\n\n'} className={textareaClass} />
              <span className="mt-1 block font-normal text-[#8996a8]">Use <code className="rounded bg-[#edf1f5] px-1">{'{name}'}</code> to insert each person&apos;s first name.</span></label>
            <div><SubmitButton confirm="Send this broadcast now?" pendingText="Sending…"><Megaphone className="size-4" />Send broadcast</SubmitButton></div>
          </ActionForm>
        </Panel>}

        {tab === 'report' && <Panel title="Send a report or file" description="Attach a live CSV report, your own files, or both. Each recipient gets their own copy.">
          <ActionForm action={sendReportEmail} resetOnSuccess className="flex flex-col gap-5">
            <input type="hidden" name="audience" value="people" />
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={`${labelClass} sm:col-span-2`}>Report to attach<select name="report" className={inputClass}><option value="">No report – files only</option>{reportKinds.map((k) => <option key={k} value={k}>{EXPORTS[k].label} (CSV)</option>)}</select></label>
              <label className={labelClass}>Period (district & summary reports)<select name="days" defaultValue="30" className={inputClass}>{[['7', 'Last 7 days'], ['30', 'Last 30 days'], ['90', 'Last 90 days'], ['365', 'Last 12 months']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
              <label className={labelClass}>Incident status (incident register)<select name="status" className={inputClass}><option value="">All statuses</option><option value="Open">Open only</option><option value="Overdue">Overdue only</option>{INCIDENT_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></label>
            </div>
            <label className="flex cursor-pointer flex-col gap-2 rounded-xl border border-dashed border-[#cbd8e7] p-4 text-sm hover:border-[#1d5fa7]">
              <span className="flex items-center gap-2 font-semibold"><FileUp className="size-4 text-[#a87916]" />Attach files</span>
              <input type="file" name="files" multiple className="text-xs" />
              <span className="text-xs text-[#8996a8]">Up to 5 files, 10 MB in total. PDF, Word, Excel, images and CSV all work.</span>
            </label>
            <div>
              <p className={`${labelClass} mb-1.5`}>Recipients</p>
              <PeoplePicker people={people} />
            </div>
            <label className={labelClass}>Other email addresses<input name="extra" placeholder="council@example.gov.et, partner@example.com" className={inputClass} /></label>
            <label className={labelClass}>Subject (optional)<input name="subject" maxLength={150} placeholder="Defaults to the report name and today's date" className={inputClass} /></label>
            <label className={labelClass}>Message<textarea name="message" rows={5} defaultValue={'Hello {name},\n\nPlease find the attached report.\n\n'} className={textareaClass} /></label>
            <div><SubmitButton pendingText="Sending…"><Paperclip className="size-4" />Send email</SubmitButton></div>
          </ActionForm>
        </Panel>}

        {tab === 'history' && <Panel title="Sent history" description="The latest 50 emails sent from the workspace" flush>
          {log.rows.length === 0 ? <EmptyState title="No emails sent yet" /> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-[#edf1f5] bg-[#f7f9fc] text-[11px] font-bold uppercase tracking-wider text-[#718096]"><tr><th className="px-5 py-3">Sent</th><th className="px-3 py-3">Type</th><th className="px-3 py-3">Subject</th><th className="px-3 py-3">Recipients</th><th className="px-5 py-3">Status</th></tr></thead>
            <tbody className="divide-y divide-[#edf1f5]">{log.rows.map((e) => <tr key={e.id} className="align-top hover:bg-[#f7f9fc]">
              <td className="whitespace-nowrap px-5 py-3 text-xs text-[#718096]">{formatDate(e.created_at)}<span className="block">{e.staff_name ?? 'System'}</span></td>
              <td className="px-3 py-3"><span className="rounded bg-[#edf3fa] px-2 py-0.5 text-[11px] font-semibold text-[#1d5fa7]">{e.kind}</span></td>
              <td className="px-3 py-3"><p className="font-semibold">{e.subject}</p>{e.attachments.length > 0 && <p className="mt-0.5 flex items-center gap-1 text-xs text-[#718096]"><Paperclip className="size-3" />{e.attachments.join(', ')}</p>}</td>
              <td className="px-3 py-3 text-xs text-[#52637b]" title={e.recipients.join(', ')}>{e.recipients.length === 1 ? e.recipients[0] : `${e.recipients.length} recipients`}</td>
              <td className="px-5 py-3"><Badge tone={e.status === 'Sent' ? 'Healthy' : e.status === 'Failed' ? 'Critical' : 'Watch'}>{e.status}</Badge>{e.error && <p className="mt-1 max-w-56 text-[11px] text-[#b32d3d]">{e.error}</p>}</td>
            </tr>)}</tbody>
          </table></div>}
        </Panel>}
      </div>

      <div className="flex flex-col gap-6">
        <Panel title="Email settings">
          <ActionForm action={saveSettings} className="flex flex-col gap-4">
            <input type="hidden" name="section" value="email" />
            <fieldset disabled={!can(me, 'settings.manage')} className="flex flex-col gap-4">
              <label className={labelClass}>Sender name<input name="email_sender_name" required defaultValue={settings.email_sender_name} className={inputClass} /><span className="mt-1 block font-normal text-[#8996a8]">Address: {mailer.user || 'not set'} (from .env)</span></label>
              <label className="flex items-start justify-between gap-3 rounded-lg border border-[#edf1f5] p-3 text-sm"><span><b className="block">Confirm public reports by email</b><span className="text-xs text-[#718096]">Citizens who leave an email get their reference number.</span></span><input type="checkbox" name="email_confirm_reporters" defaultChecked={settings.email_confirm_reporters} className="mt-1 size-4 accent-[#1d5fa7]" /></label>
            </fieldset>
            {can(me, 'settings.manage') ? <SubmitButton>Save email settings</SubmitButton> : <p className="text-[11px] text-[#718096]">Only roles with Workspace settings can change these.</p>}
          </ActionForm>
        </Panel>
        <Panel title="Automatic emails">
          <ul className="flex flex-col gap-3 text-sm text-[#33445c]">
            <li><b>Invitations</b> – new users get a temporary password (User management).</li>
            <li><b>Password resets</b> – emailed temporary passwords.</li>
            <li><b>Report confirmations</b> – citizens get their reference number.</li>
            <li><b>Reporter updates</b> – sent from a case&apos;s page.</li>
          </ul>
        </Panel>
      </div>
    </div>
  </>
}
