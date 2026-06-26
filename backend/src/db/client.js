import pg from 'pg';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const { Pool } = pg;

const __dirname = dirname(fileURLToPath(import.meta.url));

// Railway/most managed Postgres providers require SSL. We enable it whenever a
// DATABASE_URL is present and not pointing at localhost.
const connectionString = process.env.DATABASE_URL;
const isLocal =
  !connectionString ||
  connectionString.includes('localhost') ||
  connectionString.includes('127.0.0.1');

export const pool = new Pool({
  connectionString,
  ssl: isLocal ? false : { rejectUnauthorized: false },
});

/**
 * Run the schema migration on first boot. The SQL uses `IF NOT EXISTS` guards
 * and an idempotent `ON CONFLICT` default insert, so this is safe to run every
 * time the process starts.
 */
export async function runMigrations() {
  const sql = readFileSync(join(__dirname, 'migrations', '001_init.sql'), 'utf8');
  await pool.query(sql);
  console.log('[db] migrations applied');
}

/** Thin query helper so callers don't import the pool directly everywhere. */
export function query(text, params) {
  return pool.query(text, params);
}
