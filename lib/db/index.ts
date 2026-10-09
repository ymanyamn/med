import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

export const pool = new Pool({ connectionString: process.env.DATABASE_URL })
export const sql = drizzle(pool)

export async function query(text: string, values: unknown[] = []) {
  return pool.query(text, values)
}

export async function closeDatabase() {
  await pool.end()
}
