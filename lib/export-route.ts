import 'server-only'
import type { NextRequest } from 'next/server'
import { logAudit } from '@/lib/activity'
import { can, getSession } from '@/lib/auth'
import { EXPORTS, buildExport, type ExportKind } from '@/lib/exports'

/** Shared GET handler for every /admin/.../export route: checks permissions, builds the CSV, and records the export. */
export async function exportResponse(kind: ExportKind, request: NextRequest) {
  const staff = await getSession()
  if (!staff) return new Response('Unauthorized', { status: 401 })
  if (!can(staff, 'reports.export') || !can(staff, EXPORTS[kind].permission)) return new Response('Forbidden: your role cannot export this data.', { status: 403 })
  const file = await buildExport(kind, Object.fromEntries(request.nextUrl.searchParams))
  await logAudit(staff.id, `Exported ${EXPORTS[kind].label.toLowerCase()}`, 'Reports', `${file.filename} · ${file.count} rows`)
  return new Response(file.csv, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${file.filename}"`, 'Cache-Control': 'no-store' },
  })
}
