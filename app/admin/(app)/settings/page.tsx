import { changePassword, saveSettings } from '@/app/admin/actions'
import { savePublicSite, setDocumentPublished } from '@/app/admin/site-actions'
import { DocumentUploader } from '@/components/admin/document-uploader'
import { ActionForm, SubmitButton } from '@/components/admin/forms'
import { Badge, PageHeader, Panel, formatDate, inputClass, labelClass } from '@/components/admin/ui'
import { listPublicDocuments } from '@/lib/public'
import { can, requireStaff } from '@/lib/auth'
import { SUB_CITIES } from '@/lib/constants'
import { getSettings, getSystemStatus } from '@/lib/queries'
import { Database, ExternalLink, FileText } from 'lucide-react'

const RULES = [
  ['notify_escalations', 'Notify supervisors about escalations', 'Creates an urgent notification whenever a case is escalated.'],
  ['require_location', 'Require location for staff-logged cases', 'A woreda or landmark must be entered when logging an incident.'],
  ['show_resolved', 'Show resolved cases in the default queue', 'When off, the incident list opens on open cases only.'],
  ['require_approval_close', 'Only supervisors can close cases', 'Inspectors and coordinators cannot mark cases as resolved.'],
] as const

export default async function SettingsPage() {
  const staff = await requireStaff()
  const [settings, system, documents] = await Promise.all([getSettings(), getSystemStatus(), listPublicDocuments(false)])
  const editable = can(staff, 'settings.manage')

  return <>
    <PageHeader eyebrow="Workspace" title="Settings" description={editable ? 'Workspace rules and your account.' : 'Workspace settings are managed by supervisors and administrators.'} />
    <div className="grid gap-6 xl:grid-cols-2">
      <Panel title="Authority profile" description="Shown across the staff workspace">
        <ActionForm action={saveSettings} className="grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="section" value="profile" />
          <fieldset disabled={!editable} className="contents">
            <label className={`${labelClass} sm:col-span-2`}>Organization name<input name="org_name" required defaultValue={settings.org_name} className={inputClass} /></label>
            <label className={`${labelClass} sm:col-span-2`}>Operations contact email<input name="contact_email" type="email" defaultValue={settings.contact_email} className={inputClass} /></label>
            <label className={labelClass}>Response target<select name="response_target_hours" defaultValue={String(settings.response_target_hours)} className={inputClass}>{[24, 48, 72, 96].map((h) => <option key={h} value={h}>{h} hours</option>)}</select></label>
            <label className={labelClass}>Default district<select name="default_district" defaultValue={settings.default_district} className={inputClass}><option>All districts</option>{SUB_CITIES.map((c) => <option key={c}>{c}</option>)}</select></label>
          </fieldset>
          {editable && <div className="sm:col-span-2"><SubmitButton>Save profile</SubmitButton></div>}
        </ActionForm>
      </Panel>

      <Panel title="Queue rules" description="How cases move through the workflow">
        <ActionForm action={saveSettings} className="flex flex-col gap-3">
          <input type="hidden" name="section" value="rules" />
          {RULES.map(([key, label, help]) => <label key={key} className="flex items-start justify-between gap-4 rounded-lg border border-[#edf1f5] p-3">
            <span><span className="block text-sm font-semibold">{label}</span><span className="mt-0.5 block text-xs text-[#718096]">{help}</span></span>
            <input type="checkbox" name={key} defaultChecked={settings[key]} disabled={!editable} className="mt-1 size-4 shrink-0 accent-[#1d5fa7]" />
          </label>)}
          {editable && <div><SubmitButton>Save rules</SubmitButton></div>}
        </ActionForm>
      </Panel>

      <Panel title="Public website" description="Contact details shown in the public site header, footer, and Contact page"
        actions={<a href="/" target="_blank" className="inline-flex items-center gap-1 text-xs font-semibold text-[#1d5fa7] hover:underline"><ExternalLink className="size-3.5" />View site</a>}>
        <ActionForm action={savePublicSite} className="grid gap-4 sm:grid-cols-2">
          <fieldset disabled={!editable} className="contents">
            <label className={labelClass}>Public phone<input name="public_phone" required defaultValue={settings.public_phone} className={inputClass} /></label>
            <label className={labelClass}>Public email<input name="public_email" type="email" required defaultValue={settings.public_email} className={inputClass} /></label>
            <label className={`${labelClass} sm:col-span-2`}>Office address<input name="public_address" required defaultValue={settings.public_address} className={inputClass} /></label>
            <label className={`${labelClass} sm:col-span-2`}>Office hours<input name="office_hours" required defaultValue={settings.office_hours} className={inputClass} /></label>
          </fieldset>
          {editable && <div className="sm:col-span-2"><SubmitButton>Save public details</SubmitButton></div>}
        </ActionForm>
      </Panel>

      <Panel title="Guides & documents" description="Downloadable on the public Services page">
        {documents.length === 0 ? <p className="text-sm text-[#718096]">No documents published yet.</p> : <ul className="flex flex-col divide-y divide-[#edf1f5]">{documents.map((d) => <li key={d.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
          <FileText className="size-4 shrink-0 text-[#a87916]" />
          <span className="min-w-0 flex-1"><a href={`/documents/${d.id}`} target="_blank" rel="noreferrer" className="block truncate font-semibold hover:text-[#1d5fa7]">{d.title}</a><span className="text-xs text-[#718096]">{d.original_name} · {formatDate(d.created_at, false)}</span></span>
          <Badge tone={d.published ? 'Healthy' : 'Inactive'}>{d.published ? 'Published' : 'Hidden'}</Badge>
          {editable && <><ActionForm action={setDocumentPublished} hideMessage><input type="hidden" name="id" value={d.id} /><input type="hidden" name="mode" value={d.published ? 'hide' : 'publish'} /><SubmitButton className="text-xs font-semibold text-[#1d5fa7]" pendingText="…">{d.published ? 'Hide' : 'Publish'}</SubmitButton></ActionForm>
            <ActionForm action={setDocumentPublished} hideMessage><input type="hidden" name="id" value={d.id} /><input type="hidden" name="mode" value="delete" /><SubmitButton confirm={`Remove "${d.title}" from the website?`} className="text-xs font-semibold text-[#b32d3d]" pendingText="…">Remove</SubmitButton></ActionForm></>}
        </li>)}</ul>}
        {editable && <div className="mt-4"><DocumentUploader /></div>}
      </Panel>

      <Panel title="System status" description="Live connection to the workspace database">
        <div className="flex items-center gap-3 rounded-lg bg-[#eaf8f0] p-3">
          <Database className="size-5 text-[#267448]" />
          <div className="flex-1"><p className="text-sm font-bold text-[#267448]">Database connected</p><p className="text-xs text-[#52637b]">{system.database} · PostgreSQL {system.version} · responded in {system.latency_ms} ms</p></div>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {([['Incidents', system.incidents], ['Service requests', system.services], ['Staff accounts', system.staff], ['Notes', system.notes], ['Notifications', system.notifications], ['Audit events', system.audit]] as const).map(([label, value]) => <div key={label} className="rounded-lg border border-[#edf1f5] p-3"><dd className="text-lg font-bold text-[#082957]">{value}</dd><dt className="text-[11px] text-[#718096]">{label}</dt></div>)}
        </dl>
      </Panel>

      <div id="account" className="scroll-mt-20"><Panel className={staff.must_change_password ? 'ring-2 ring-[#e9bb52]' : ''} title={staff.must_change_password ? 'My account · choose a new password' : 'My account'} description={`${staff.name} · ${staff.email} · ${staff.role}`}>
        <ActionForm action={changePassword} resetOnSuccess className="grid gap-4 sm:grid-cols-2">
          <label className={`${labelClass} sm:col-span-2`}>Current password<input name="current_password" type="password" required autoComplete="current-password" className={inputClass} /></label>
          <label className={labelClass}>New password<input name="new_password" type="password" required minLength={8} autoComplete="new-password" className={inputClass} /></label>
          <label className={labelClass}>Confirm new password<input name="confirm_password" type="password" required minLength={8} autoComplete="new-password" className={inputClass} /></label>
          <div className="sm:col-span-2"><SubmitButton>Change password</SubmitButton></div>
        </ActionForm>
      </Panel></div>
    </div>
  </>
}
