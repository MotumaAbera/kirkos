import 'server-only'
import { Pool, type QueryResultRow } from 'pg'

const globalForDb = globalThis as unknown as { pgPool?: Pool }

export const pool = globalForDb.pgPool ?? new Pool({ connectionString: process.env.DATABASE_URL, max: 10 })
if (process.env.NODE_ENV !== 'production') globalForDb.pgPool = pool

export async function query<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []) {
  const result = await pool.query<T>(text, params)
  return result.rows
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []) {
  const rows = await query<T>(text, params)
  return rows[0] ?? null
}
