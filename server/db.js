// Arcanum Veritas server — the database. Postgres when DATABASE_URL is set (Railway);
// otherwise an embedded PGlite database in .data/, so the server runs locally with nothing installed.

import { fileURLToPath } from "node:url";

export async function openDb() {
  if (process.env.DATABASE_URL) {
    const { default: pg } = await import("pg");
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    return { query: (text, params) => pool.query(text, params) };
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const lite = new PGlite(process.env.PGLITE_DIR || fileURLToPath(new URL("../.data/pg", import.meta.url)));
  return { query: (text, params) => lite.query(text, params) };
}

// Users and what each may read. The Cognitions themselves stay as JSON files in cognitions/ —
// the database only knows their ids. A password_hash of "!" is an account nobody can sign in to yet.
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
     id            SERIAL PRIMARY KEY,
     username      TEXT NOT NULL UNIQUE,
     display_name  TEXT NOT NULL,
     password_hash TEXT NOT NULL,
     role          TEXT NOT NULL DEFAULT 'player' CHECK (role IN ('player', 'dm')),
     created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS user_cognitions (
     user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     cognition_id TEXT NOT NULL,
     granted_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
     PRIMARY KEY (user_id, cognition_id)
   )`,
  `CREATE TABLE IF NOT EXISTS sessions (
     token_hash TEXT PRIMARY KEY,
     user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     expires_at TIMESTAMPTZ NOT NULL
   )`,
];

export async function migrate(db) {
  for (const sql of SCHEMA) await db.query(sql);
}
