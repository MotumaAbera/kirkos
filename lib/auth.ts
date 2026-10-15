import 'server-only'
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { cache } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { queryOne } from '@/lib/db'
import { SUPER_ROLE, type Permission } from '@/lib/rbac'

export const SESSION_COOKIE = 'aacea_session'
const SESSION_TTL_SECONDS = 60 * 60 * 12

export type SessionStaff = { id: number; name: string; email: string; role: string; district: string; permissions: Permission[]; must_change_password: boolean }

function secret() {
  const value = process.env.API_TOKEN_SECRET
  if (!value) throw new Error('API_TOKEN_SECRET is not set')
  return value
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex')
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`
}

export function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const expected = Buffer.from(hash, 'hex')
  const actual = scryptSync(password, salt, 64)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

function sign(payload: string) {
  return createHmac('sha256', secret()).update(payload).digest('base64url')
}

export async function createSession(staffId: number) {
  const payload = Buffer.from(JSON.stringify({ sid: staffId, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS })).toString('base64url')
  const store = await cookies()
  store.set(SESSION_COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  })
}

export async function destroySession() {
  const store = await cookies()
  store.delete(SESSION_COOKIE)
}

function readToken(token: string | undefined) {
  if (!token) return null
  const [payload, signature] = token.split('.')
  if (!payload || !signature) return null
  const expected = Buffer.from(sign(payload))
  const actual = Buffer.from(signature)
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { sid: number; exp: number }
    return data.exp > Date.now() / 1000 ? data.sid : null
  } catch {
    return null
  }
}

/** Returns the signed-in staff member, or null. Cached per request. */
export const getSession = cache(async (): Promise<SessionStaff | null> => {
  const store = await cookies()
  const staffId = readToken(store.get(SESSION_COOKIE)?.value)
  if (!staffId) return null
  return queryOne<SessionStaff>(`
    select s.id, s.name, s.email, s.role, s.district, s.must_change_password, coalesce(r.permissions, '{}') as permissions
    from staff s left join roles r on r.name = s.role
    where s.id = $1 and s.status <> 'Inactive'`, [staffId])
})

/** Use in admin pages and server actions: redirects to the login page when there is no valid session. */
export async function requireStaff() {
  const staff = await getSession()
  if (!staff) redirect('/admin/login')
  return staff
}

/** True when the staff member's role grants the permission. Administrators always pass. */
export const can = (staff: Pick<SessionStaff, 'role' | 'permissions'>, permission: Permission) => staff.role === SUPER_ROLE || staff.permissions.includes(permission)

/** Use in admin pages: signed-in staff without the permission are sent to the access-denied page. */
export async function requirePermission(permission: Permission) {
  const staff = await requireStaff()
  if (!can(staff, permission)) redirect(`/admin/denied?need=${permission}`)
  return staff
}

/** Use in server actions: returns an error result when the permission is missing, otherwise null. */
export function deny(staff: SessionStaff, permission: Permission, message?: string) {
  return can(staff, permission) ? null : { error: message ?? 'Your role does not allow this action. Ask an administrator for access.' }
}
