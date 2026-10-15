import Link from 'next/link'
import { KeyRound, Lock, Pencil, Plus, Search, ShieldCheck, Trash2, UserPlus } from 'lucide-react'
import { createRole, deleteRole, resetUserPassword, saveRolePermissions, saveUser, setUserStatus } from '@/app/admin/user-actions'
import { ActionForm, Modal, SubmitButton } from '@/components/admin/forms'
import { Badge, FilterTabs, PageHeader, Panel, StatCard, formatDate, initials, inputClass, labelClass, secondaryButton, textareaClass } from '@/components/admin/ui'
import { requirePermission } from '@/lib/auth'
import { STAFF_STATUSES, SUB_CITIES } from '@/lib/constants'
import { listRoles, listUsers, type RoleRow, type UserRow } from '@/lib/queries'
import { PERMISSION_GROUPS, PERMISSION_INFO, SUPER_ROLE } from '@/lib/rbac'
import { cn } from '@/lib/utils'

const radioRow = 'flex items-start gap-2.5 rounded-lg border border-[#dfe7f0] p-3 text-sm has-[:checked]:border-[#1d5fa7] has-[:checked]:bg-[#f1f6fc]'

function UserForm({ user, roles, canGrantAdmin }: { user?: UserRow; roles: RoleRow[]; canGrantAdmin: boolean }) {
  const roleOptions = roles.filter((r) => canGrantAdmin || r.name !== SUPER_ROLE || user?.role === SUPER_ROLE)
  return <ActionForm action={saveUser} resetOnSuccess={!user} className="grid gap-4 sm:grid-cols-2">
    {user && <input type="hidden" name="id" value={user.id} />}
    <label className={labelClass}>Full name<input name="name" required defaultValue={user?.name} className={inputClass} /></label>
    <label className={labelClass}>Work email<input name="email" type="email" required defaultValue={user?.email} className={inputClass} /></label>
    <label className={labelClass}>Role<select name="role" defaultValue={user?.role ?? 'Field inspector'} className={inputClass}>{roleOptions.map((r) => <option key={r.name}>{r.name}</option>)}</select></label>
    <label className={labelClass}>District<select name="district" defaultValue={user?.district ?? 'Central office'} className={inputClass}><option>Central office</option>{SUB_CITIES.map((c) => <option key={c}>{c}</option>)}</select></label>
    <label className={labelClass}>Phone<input name="phone" defaultValue={user?.phone ?? ''} className={inputClass} /></label>
    <label className={labelClass}>Status<select name="status" defaultValue={user?.status ?? 'Active'} className={inputClass}>{STAFF_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></label>
    {!user && <fieldset className="flex flex-col gap-2 sm:col-span-2">
      <legend className={`${labelClass} mb-1.5`}>Sign-in details</legend>
      <label className={radioRow}><input type="radio" name="password_mode" value="email" defaultChecked className="mt-0.5 accent-[#1d5fa7]" /><span><b className="block">Email an invitation</b><span className="text-xs text-[#718096]">Generates a temporary password and emails it. They must change it at first sign-in.</span></span></label>
      <label className={radioRow}><input type="radio" name="password_mode" value="manual" className="mt-0.5 accent-[#1d5fa7]" /><span className="flex-1"><b className="block">Set a password now</b><span className="text-xs text-[#718096]">Share it with them yourself.</span>
        <input name="password" type="password" minLength={8} autoComplete="new-password" placeholder="At least 8 characters" className={inputClass} />
        <span className="mt-2 flex items-center gap-2 text-xs"><input type="checkbox" name="must_change" defaultChecked className="accent-[#1d5fa7]" />Require a new password at first sign-in</span></span></label>
    </fieldset>}
    <div className="flex justify-end sm:col-span-2"><SubmitButton>{user ? 'Save changes' : 'Create user'}</SubmitButton></div>
  </ActionForm>
}

function ResetPasswordForm({ user }: { user: UserRow }) {
  return <ActionForm action={resetUserPassword} resetOnSuccess className="flex flex-col gap-3">
    <input type="hidden" name="id" value={user.id} />
    <label className={radioRow}><input type="radio" name="mode" value="email" defaultChecked className="mt-0.5 accent-[#1d5fa7]" /><span><b className="block">Email a temporary password</b><span className="text-xs text-[#718096]">Sent to {user.email}.</span></span></label>
    <label className={radioRow}><input type="radio" name="mode" value="manual" className="mt-0.5 accent-[#1d5fa7]" /><span className="flex-1"><b className="block">Set a password</b>
      <input name="password" type="password" minLength={8} autoComplete="new-password" placeholder="At least 8 characters" className={inputClass} /></span></label>
    <p className="text-xs text-[#718096]">Either way, {user.name.split(' ')[0]} must choose a new password at next sign-in.</p>
    <SubmitButton pendingText="Resetting…"><KeyRound className="size-4" />Reset password</SubmitButton>
  </ActionForm>
}

export default async function UserManagementPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; role?: string; status?: string }> }) {
  const me = await requirePermission('users.manage')
  const params = await searchParams
  const tab = params.tab === 'roles' ? 'roles' : 'users'
  const isSuper = me.role === SUPER_ROLE
  const [users, roles, allUsers] = await Promise.all([listUsers(params), listRoles(), listUsers({})])
  const pending = allUsers.filter((u) => u.status === 'Active' && (u.must_change_password || !u.last_login_at)).length

  return <>
    <PageHeader eyebrow="Workspace" title="User management" description="Create accounts, control who can do what, and keep access tidy."
      actions={tab === 'users'
        ? <Modal trigger={<><UserPlus className="size-4" />Add user</>} title="Add a user" description="New users can sign in as soon as they receive their password." wide><UserForm roles={roles} canGrantAdmin={isSuper} /></Modal>
        : isSuper && <Modal trigger={<><Plus className="size-4" />New role</>} title="Create a role">
          <ActionForm action={createRole} resetOnSuccess className="flex flex-col gap-4">
            <label className={labelClass}>Role name<input name="name" required minLength={3} maxLength={40} placeholder="e.g. District officer" className={inputClass} /></label>
            <label className={labelClass}>Description<textarea name="description" rows={2} className={textareaClass} /></label>
            <label className={labelClass}>Start with permissions from<select name="copy_from" className={inputClass}><option value="">No permissions</option>{roles.map((r) => <option key={r.name}>{r.name}</option>)}</select></label>
            <SubmitButton>Create role</SubmitButton>
          </ActionForm>
        </Modal>} />

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Total users" value={allUsers.length} note={`${allUsers.filter((u) => u.status === 'Active').length} active`} />
      <StatCard label="Administrators" value={allUsers.filter((u) => u.role === SUPER_ROLE && u.status === 'Active').length} note="Full access, including users & roles" />
      <StatCard label="Awaiting first sign-in" value={pending} note="Temporary password or never signed in" tone={pending ? 'warn' : 'good'} />
      <StatCard label="Roles" value={roles.length} note={`${roles.filter((r) => !r.builtin).length} custom`} />
    </div>

    <div className="mt-6"><FilterTabs basePath="/admin/users" param="tab" active={tab} params={{}} items={[{ label: 'Users', value: 'users', count: allUsers.length }, { label: 'Roles & permissions', value: 'roles', count: roles.length }]} /></div>

    {tab === 'users' ? <>
      <form className="mt-4 grid gap-2 sm:grid-cols-[1fr_200px_160px_auto]">
        <label className="relative"><span className="sr-only">Search</span><Search className="absolute left-3 top-[1.15rem] size-4 text-[#8996a8]" /><input name="q" defaultValue={params.q} placeholder="Search name, email, district…" className={`${inputClass} pl-9`} /></label>
        <select name="role" defaultValue={params.role ?? ''} aria-label="Role" className={inputClass}><option value="">All roles</option>{roles.map((r) => <option key={r.name}>{r.name}</option>)}</select>
        <select name="status" defaultValue={params.status ?? ''} aria-label="Status" className={inputClass}><option value="">Any status</option>{STAFF_STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
        <div className="mt-1.5 flex gap-2"><button className={`${secondaryButton} h-10`}>Apply</button>{(params.q || params.role || params.status) && <Link href="/admin/users" className="flex h-10 items-center px-2 text-xs font-semibold text-[#1d5fa7]">Clear</Link>}</div>
      </form>
      <Panel className="mt-4" flush>
        <div className="overflow-x-auto"><table className="w-full min-w-[860px] text-left text-sm">
          <thead className="border-b border-[#edf1f5] bg-[#f7f9fc] text-[11px] font-bold uppercase tracking-wider text-[#718096]">
            <tr><th className="px-5 py-3">User</th><th className="px-3 py-3">Role</th><th className="px-3 py-3">District</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Last sign-in</th><th className="px-5 py-3 text-right">Actions</th></tr>
          </thead>
          <tbody className="divide-y divide-[#edf1f5]">{users.map((u) => {
            const locked = !isSuper && u.role === SUPER_ROLE
            const self = u.id === me.id
            return <tr key={u.id} className={cn('hover:bg-[#f7f9fc]', u.status === 'Inactive' && 'opacity-60')}>
              <td className="px-5 py-3"><div className="flex items-center gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#dce9f7] text-xs font-bold text-[#1d5fa7]">{initials(u.name)}</span><div className="min-w-0"><p className="truncate font-semibold">{u.name}{self && <span className="ml-1 font-normal text-[#718096]">(you)</span>}</p><p className="truncate text-xs text-[#718096]">{u.email}</p></div></div></td>
              <td className="px-3 py-3"><span className={cn('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold', u.role === SUPER_ROLE ? 'bg-[#082957] text-white' : 'bg-[#edf3fa] text-[#1d5fa7]')}>{u.role === SUPER_ROLE && <ShieldCheck className="size-3" />}{u.role}</span></td>
              <td className="px-3 py-3 text-xs text-[#52637b]">{u.district}</td>
              <td className="px-3 py-3"><div className="flex flex-wrap gap-1"><Badge>{u.status}</Badge>{u.must_change_password && <Badge tone="Watch">Temp password</Badge>}</div></td>
              <td className="px-3 py-3 text-xs text-[#718096]">{u.last_login_at ? formatDate(u.last_login_at) : 'Never'}</td>
              <td className="px-5 py-3"><div className="flex items-center justify-end gap-1">
                {locked ? <span className="inline-flex items-center gap-1 text-xs text-[#8996a8]"><Lock className="size-3" />Administrator only</span> : <>
                  <Modal trigger={<><Pencil className="size-3.5" />Edit</>} triggerClassName="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-[#1d5fa7] hover:bg-[#edf3fa]" title={`Edit ${u.name}`} wide><UserForm user={u} roles={roles} canGrantAdmin={isSuper} /></Modal>
                  <Modal trigger={<><KeyRound className="size-3.5" />Reset</>} triggerClassName="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-[#1d5fa7] hover:bg-[#edf3fa]" title={`Reset password for ${u.name}`}><ResetPasswordForm user={u} /></Modal>
                  {!self && <ActionForm action={setUserStatus} hideMessage>
                    <input type="hidden" name="id" value={u.id} /><input type="hidden" name="status" value={u.status === 'Inactive' ? 'Active' : 'Inactive'} />
                    <SubmitButton confirm={u.status === 'Inactive' ? undefined : `Deactivate ${u.name}? They will be signed out and unable to sign in.`} pendingText="…" className={cn('rounded-md px-2 py-1 text-xs font-semibold', u.status === 'Inactive' ? 'text-[#267448] hover:bg-[#eaf8f0]' : 'text-[#b32d3d] hover:bg-[#fff0f1]')}>{u.status === 'Inactive' ? 'Activate' : 'Deactivate'}</SubmitButton>
                  </ActionForm>}
                </>}
              </div></td>
            </tr>
          })}</tbody>
        </table></div>
        {users.length === 0 && <p className="p-8 text-center text-sm text-[#718096]">No users match these filters.</p>}
      </Panel>
    </> : <>
      <div className="mt-4 flex items-start gap-3 rounded-xl border border-[#cfe0f2] bg-[#f7faff] p-4 text-sm text-[#33445c]">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[#1d5fa7]" />
        <p>Tick what each role may do, then save that role&apos;s column. The <b>Administrator</b> role always has every permission. {isSuper ? 'Changes apply the next time each user loads a page.' : 'Only Administrators can change roles; you can view them here.'}</p>
      </div>
      <Panel className="mt-4" flush>
        <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b border-[#edf1f5] bg-[#f7f9fc] align-top">
            <tr><th className="sticky left-0 z-10 bg-[#f7f9fc] px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-[#718096]">Permission</th>
              {roles.map((r) => <th key={r.name} className="min-w-36 px-3 py-3 text-center">
                <p className="text-xs font-bold text-[#14233b]">{r.name}</p>
                <p className="mt-0.5 text-[10px] font-normal text-[#718096]">{r.users} user{r.users === 1 ? '' : 's'} · {r.name === SUPER_ROLE ? 'all' : r.permissions.length} perms{!r.builtin && ' · custom'}</p>
              </th>)}</tr>
          </thead>
          <tbody>
            {PERMISSION_GROUPS.map((g) => [
              <tr key={g.label} className="bg-[#fbfcfe]"><td colSpan={roles.length + 1} className="sticky left-0 px-5 pb-1.5 pt-4 text-[11px] font-bold uppercase tracking-wider text-[#a87916]">{g.label}</td></tr>,
              ...PERMISSION_INFO.filter((p) => p.group === g.label).map((p) => <tr key={p.key} className="border-t border-[#f1f4f8] hover:bg-[#f7f9fc]">
                <td className="sticky left-0 z-10 bg-white px-5 py-2.5"><p className="font-semibold">{p.label}</p><p className="text-[11px] text-[#718096]">{p.help}</p></td>
                {roles.map((r, i) => <td key={r.name} className="px-3 py-2.5 text-center">
                  <input type="checkbox" name="perm" value={p.key} form={`role-${i}`} aria-label={`${r.name}: ${p.label}`}
                    defaultChecked={r.name === SUPER_ROLE || r.permissions.includes(p.key)} disabled={!isSuper || r.name === SUPER_ROLE} className="size-4 accent-[#1d5fa7] disabled:opacity-60" />
                </td>)}
              </tr>),
            ])}
          </tbody>
          {isSuper && <tfoot className="border-t border-[#edf1f5] bg-[#f7f9fc]"><tr><td className="sticky left-0 bg-[#f7f9fc] px-5 py-3 text-xs text-[#718096]">Save each role separately</td>
            {roles.map((r, i) => <td key={r.name} className="px-3 py-3 text-center align-top">
              {r.name === SUPER_ROLE ? <span className="inline-flex items-center gap-1 text-[11px] text-[#8996a8]"><Lock className="size-3" />Always full access</span> : <>
                <ActionForm action={saveRolePermissions} id={`role-${i}`} className="text-left">
                  <input type="hidden" name="role" value={r.name} />
                  <SubmitButton className="w-full rounded-md bg-[#082957] px-2 py-1.5 text-xs font-semibold text-white hover:bg-[#0d3a78] disabled:opacity-60">Save</SubmitButton>
                </ActionForm>
                {!r.builtin && <ActionForm action={deleteRole} className="mt-1 text-left">
                  <input type="hidden" name="role" value={r.name} />
                  <SubmitButton confirm={`Delete the ${r.name} role?`} pendingText="…" className="inline-flex w-full items-center justify-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-[#b32d3d] hover:bg-[#fff0f1]"><Trash2 className="size-3" />Delete</SubmitButton>
                </ActionForm>}
              </>}
            </td>)}
          </tr></tfoot>}
        </table></div>
      </Panel>
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{roles.map((r) => <div key={r.name} className="rounded-xl border border-[#dfe7f0] bg-white p-4">
        <p className="text-sm font-bold">{r.name} {r.builtin ? <span className="ml-1 text-[10px] font-semibold uppercase text-[#8996a8]">built-in</span> : <span className="ml-1 text-[10px] font-semibold uppercase text-[#a87916]">custom</span>}</p>
        <p className="mt-1 text-xs leading-5 text-[#718096]">{r.description || 'No description.'}</p>
        <Link href={`/admin/users?role=${encodeURIComponent(r.name)}`} className="mt-2 inline-block text-xs font-semibold text-[#1d5fa7] hover:underline">{r.users} user{r.users === 1 ? '' : 's'}</Link>
      </div>)}</div>
    </>}
  </>
}
