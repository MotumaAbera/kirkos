'use server'

import { randomInt } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import type { ActionState } from '@/app/admin/actions'
import { logAudit } from '@/lib/activity'
import { deny, hashPassword, requireStaff, type SessionStaff } from '@/lib/auth'
import { STAFF_STATUSES, SUB_CITIES } from '@/lib/constants'
import { query, queryOne } from '@/lib/db'
import { isEmail, sendEmail } from '@/lib/mailer'
import { getSettings } from '@/lib/queries'
import { SUPER_ROLE, isPermission } from '@/lib/rbac'

const text = (fd: FormData, key: string) => String(fd.get(key) ?? '').trim()
const refresh = () => revalidatePath('/admin', 'layout')

/** Readable temporary password: no look-alike characters, always has upper, lower, digit and symbol. */
function temporaryPassword() {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnpqrstuvwxyz', '23456789', '!@#$%']
  const all = sets.join('')
  const chars = sets.map((set) => set[randomInt(set.length)])
  while (chars.length < 12) chars.push(all[randomInt(all.length)])
  for (let i = chars.length - 1; i > 0; i--) { const j = randomInt(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]] }
  return chars.join('')
}

async function loginUrl() {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}/admin/login`
}

async function emailCredentials(actor: SessionStaff, to: { name: string; email: string }, password: string, reason: 'welcome' | 'reset') {
  const settings = await getSettings()
  const url = await loginUrl()
  const subject = reason === 'welcome' ? `Your ${settings.org_name} staff account` : 'Your staff workspace password was reset'
  const intro = reason === 'welcome'
    ? `An account has been created for you on the ${settings.org_name} staff workspace.`
    : `${actor.name} has reset the password for your staff workspace account.`
  return sendEmail({
    to: [to.email], subject, kind: reason === 'welcome' ? 'Account invitation' : 'Password reset', staffId: actor.id,
    heading: reason === 'welcome' ? `Welcome, ${to.name.split(' ')[0]}` : 'Password reset',
    text: `Hello ${to.name},\n\n${intro}\n\nSign in: ${url}\nEmail: ${to.email}\nTemporary password: ${password}\n\nYou will be asked to choose a new password after signing in. If you did not expect this email, contact your administrator.`,
  })
}

/** Non-administrators with users.manage may not create, edit, or promote anyone to the Administrator role. */
function protectSuperRole(actor: SessionStaff, targetRole: string | null, newRole: string) {
  if (actor.role === SUPER_ROLE) return null
  if (newRole === SUPER_ROLE || targetRole === SUPER_ROLE) return { error: 'Only an Administrator can grant or change the Administrator role.' }
  return null
}

export async function saveUser(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireStaff()
  const denied = deny(actor, 'users.manage')
  if (denied) return denied
  const id = Number(fd.get('id')) || null
  const name = text(fd, 'name')
  const email = text(fd, 'email').toLowerCase()
  const role = text(fd, 'role')
  const status = (STAFF_STATUSES as readonly string[]).includes(text(fd, 'status')) ? text(fd, 'status') : 'Active'
  const district = text(fd, 'district') || 'Central office'
  if (district !== 'Central office' && !(SUB_CITIES as readonly string[]).includes(district)) return { error: 'Choose a valid district.' }
  if (!name || !isEmail(email)) return { error: 'Enter a name and a valid email address.' }
  if (!(await queryOne('select 1 from roles where name = $1', [role]))) return { error: 'Choose a valid role.' }
  if (await queryOne('select 1 from staff where email = $1 and id <> $2', [email, id ?? 0])) return { error: 'Another user already has this email.' }

  if (id) {
    const current = await queryOne<{ role: string; name: string }>('select role, name from staff where id = $1', [id])
    if (!current) return { error: 'User not found.' }
    const blocked = protectSuperRole(actor, current.role, role)
    if (blocked) return blocked
    if (id === actor.id && (status !== 'Active' || role !== actor.role)) return { error: 'You cannot change your own role or deactivate your own account.' }
    await query('update staff set name=$2, email=$3, role=$4, district=$5, phone=$6, status=$7 where id=$1', [id, name, email, role, district, text(fd, 'phone') || null, status])
    await logAudit(actor.id, `Updated user ${name}`, 'Users', `${role} · ${district} · ${status}${current.role !== role ? ` (was ${current.role})` : ''}`)
    refresh()
    return { ok: true, message: `${name} updated.` }
  }

  const blocked = protectSuperRole(actor, null, role)
  if (blocked) return blocked
  const sendInvite = text(fd, 'password_mode') !== 'manual'
  const password = sendInvite ? temporaryPassword() : text(fd, 'password')
  if (password.length < 8) return { error: 'Password must be at least 8 characters.' }
  const forceChange = sendInvite || fd.get('must_change') === 'on'
  await query('insert into staff (name, email, role, district, phone, status, password_hash, must_change_password) values ($1,$2,$3,$4,$5,$6,$7,$8)',
    [name, email, role, district, text(fd, 'phone') || null, status, hashPassword(password), forceChange])
  await logAudit(actor.id, `Created user ${name}`, 'Users', `${role} · ${district}${sendInvite ? ' · invitation emailed' : ''}`)
  refresh()
  if (!sendInvite) return { ok: true, message: `${name} added. Share the password with them securely.` }
  const result = await emailCredentials(actor, { name, email }, password, 'welcome')
  return result.status === 'Sent'
    ? { ok: true, message: `${name} added and an invitation was emailed to ${email}.` }
    : { ok: true, message: `${name} added, but the invitation email failed (${result.error}). Reset their password to try again.` }
}

export async function resetUserPassword(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireStaff()
  const denied = deny(actor, 'users.manage')
  if (denied) return denied
  const user = await queryOne<{ id: number; name: string; email: string; role: string }>('select id, name, email, role from staff where id = $1', [Number(fd.get('id'))])
  if (!user) return { error: 'User not found.' }
  const blocked = protectSuperRole(actor, user.role, user.role)
  if (blocked) return blocked
  const emailIt = text(fd, 'mode') !== 'manual'
  const password = emailIt ? temporaryPassword() : text(fd, 'password')
  if (password.length < 8) return { error: 'Password must be at least 8 characters.' }
  await query('update staff set password_hash = $2, must_change_password = true where id = $1', [user.id, hashPassword(password)])
  await logAudit(actor.id, `Reset password for ${user.name}`, 'Users', emailIt ? 'temporary password emailed' : 'set manually')
  refresh()
  if (!emailIt) return { ok: true, message: `Password reset. ${user.name} must choose a new one at next sign-in.` }
  const result = await emailCredentials(actor, user, password, 'reset')
  return result.status === 'Sent' ? { ok: true, message: `A temporary password was emailed to ${user.email}.` } : { error: `Password was reset but the email failed: ${result.error}` }
}

export async function setUserStatus(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireStaff()
  const denied = deny(actor, 'users.manage')
  if (denied) return denied
  const id = Number(fd.get('id'))
  const status = text(fd, 'status') === 'Active' ? 'Active' : 'Inactive'
  if (id === actor.id) return { error: 'You cannot deactivate your own account.' }
  const user = await queryOne<{ name: string; role: string }>('select name, role from staff where id = $1', [id])
  if (!user) return { error: 'User not found.' }
  const blocked = protectSuperRole(actor, user.role, user.role)
  if (blocked) return blocked
  await query('update staff set status = $2 where id = $1', [id, status])
  await logAudit(actor.id, `${status === 'Active' ? 'Reactivated' : 'Deactivated'} user ${user.name}`, 'Users')
  refresh()
  return { ok: true, message: `${user.name} ${status === 'Active' ? 'reactivated' : 'deactivated'}.` }
}

// ── Roles & permissions ─────────────────────────────────────────────────

function requireSuper(actor: SessionStaff) {
  return actor.role === SUPER_ROLE ? null : { error: 'Only Administrators can change roles and permissions.' }
}

export async function saveRolePermissions(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireStaff()
  const denied = deny(actor, 'users.manage') ?? requireSuper(actor)
  if (denied) return denied
  const role = text(fd, 'role')
  if (role === SUPER_ROLE) return { error: 'The Administrator role always has every permission.' }
  const permissions = [...new Set(fd.getAll('perm').map(String).filter(isPermission))]
  const row = await queryOne<{ permissions: string[] }>('select permissions from roles where name = $1', [role])
  if (!row) return { error: 'Role not found.' }
  await query('update roles set permissions = $2, description = coalesce(nullif($3, \'\'), description) where name = $1', [role, permissions, text(fd, 'description')])
  const added = permissions.filter((p) => !row.permissions.includes(p))
  const removed = row.permissions.filter((p) => !permissions.includes(p as never))
  await logAudit(actor.id, `Changed permissions for ${role}`, 'Users', [added.length && `+ ${added.join(', ')}`, removed.length && `− ${removed.join(', ')}`].filter(Boolean).join(' · ') || 'description only')
  refresh()
  return { ok: true, message: `${role} saved (${permissions.length} permissions).` }
}

export async function createRole(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireStaff()
  const denied = deny(actor, 'users.manage') ?? requireSuper(actor)
  if (denied) return denied
  const name = text(fd, 'name').replace(/\s+/g, ' ')
  if (name.length < 3 || name.length > 40) return { error: 'Role name must be 3–40 characters.' }
  if (await queryOne('select 1 from roles where lower(name) = lower($1)', [name])) return { error: 'A role with this name already exists.' }
  const copy = await queryOne<{ permissions: string[] }>('select permissions from roles where name = $1', [text(fd, 'copy_from')])
  await query('insert into roles (name, description, permissions) values ($1, $2, $3)', [name, text(fd, 'description'), copy?.permissions ?? []])
  await logAudit(actor.id, `Created role ${name}`, 'Users', copy ? `copied from ${text(fd, 'copy_from')}` : 'no permissions')
  refresh()
  return { ok: true, message: `Role ${name} created. Adjust its permissions below.` }
}

export async function deleteRole(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireStaff()
  const denied = deny(actor, 'users.manage') ?? requireSuper(actor)
  if (denied) return denied
  const role = text(fd, 'role')
  const row = await queryOne<{ builtin: boolean; users: number }>('select builtin, (select count(*) from staff where role = $1)::int as users from roles where name = $1', [role])
  if (!row) return { error: 'Role not found.' }
  if (row.builtin) return { error: 'Built-in roles cannot be deleted.' }
  if (row.users) return { error: `${row.users} user(s) still have this role. Move them to another role first.` }
  await query('delete from roles where name = $1', [role])
  await logAudit(actor.id, `Deleted role ${role}`, 'Users')
  refresh()
  return { ok: true, message: `Role ${role} deleted.` }
}
