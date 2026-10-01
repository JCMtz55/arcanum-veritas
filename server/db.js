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
  // A player's own tracker of what they are still learning. Free text on purpose: a player only
  // knows a Cognition by the name they heard at the table, and must not be shown the full list.
  // `key` is the lower-cased name; depth counts quarters, 4 = mastered and waiting on the DM.
  `CREATE TABLE IF NOT EXISTS learning (
     user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     key        TEXT NOT NULL,
     name       TEXT NOT NULL,
     depth      SMALLINT NOT NULL DEFAULT 1 CHECK (depth BETWEEN 0 AND 4),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     PRIMARY KEY (user_id, key)
   )`,
  // Saved seals, Eidons and Paragons — private to the account that made them. `data` is the build as JSON text.
  `CREATE TABLE IF NOT EXISTS saves (
     id         SERIAL PRIMARY KEY,
     user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     kind       TEXT NOT NULL CHECK (kind IN ('seal', 'eidon', 'paragon')),
     name       TEXT NOT NULL,
     data       TEXT NOT NULL,
     updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  // Grimm Companion: how many of a Grimm's Three Chains still hold. The DM's to set; a Grimm with
  // no row here has whatever its data file says.
  `CREATE TABLE IF NOT EXISTS grimm_chains (
     grimm_id TEXT PRIMARY KEY,
     chains   SMALLINT NOT NULL CHECK (chains BETWEEN 0 AND 3)
   )`,
  // What the DM has switched on or off for one Grimm: `key` is "shift" for its Reality Shift, or
  // "a:<ability id>" for one ability. A Grimm with no row for a key keeps that key's default —
  // abilities are on, the Reality Shift is off.
  `CREATE TABLE IF NOT EXISTS grimm_toggles (
     grimm_id TEXT NOT NULL,
     key      TEXT NOT NULL,
     enabled  BOOLEAN NOT NULL,
     PRIMARY KEY (grimm_id, key)
   )`,
  // Who walks the Paragon path. The DM turns it on per player — the path is a choice of identity
  // made with them, not something a player switches on for themselves.
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS paragon BOOLEAN NOT NULL DEFAULT false`,
  // RETIRED. Paragon Ability sets used to be typed into the Admin page and kept here. They now
  // live in cognitions/devotions/<player>_<cognition>_devotion.json, authored beside the Cognitions themselves.
  // The table is left standing so nothing a DM already wrote is destroyed; nothing reads it.
  `CREATE TABLE IF NOT EXISTS paragon_builds (
     id           SERIAL PRIMARY KEY,
     user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     cognition_id TEXT NOT NULL,
     name         TEXT NOT NULL,
     data         TEXT NOT NULL,
     updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
     UNIQUE (user_id, cognition_id, name)
   )`,
  // The Devotions the DM has opened to a player: the pool they may swear from. The server only
  // ever writes a row here for a Cognition the player has mastered — a granted one.
  `CREATE TABLE IF NOT EXISTS paragon_devotions (
     user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     cognition_id TEXT NOT NULL,
     opened_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
     PRIMARY KEY (user_id, cognition_id)
   )`,
  // Which of those the player has sworn — up to three — and which one is held in the Deeper Burn.
  // `sworn` is a JSON array of Cognition ids, in the order they were sworn. The Burn itself is
  // round-by-round state and belongs in the browser; this is the part that must survive a reload.
  `CREATE TABLE IF NOT EXISTS paragon_choice (
     user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
     sworn      TEXT NOT NULL DEFAULT '[]',
     active     TEXT,
     updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  // A Pilgrimage: the downtime ritual that swaps one Devotion for another. The rule asks the
  // player to give the DM advance notice, so the notice itself is a row the DM answers.
  `CREATE TABLE IF NOT EXISTS paragon_pilgrimage (
     id         SERIAL PRIMARY KEY,
     user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     leaving    TEXT,
     arriving   TEXT NOT NULL,
     note       TEXT NOT NULL DEFAULT '',
     status     TEXT NOT NULL DEFAULT 'asked' CHECK (status IN ('asked', 'walked', 'declined')),
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     decided_at TIMESTAMPTZ
   )`,
  // The custom Ignitions the DM has enabled for a player: permanent techniques one character owns,
  // inherited from a Dream Item, a Dream-Touched Creature or an Epiphany. The Ignitions themselves
  // are authored as files in ignitions/ — the database only knows their ids, exactly as it only
  // knows a Cognition's. A player with no row here has none, which is everyone until the DM says so.
  `CREATE TABLE IF NOT EXISTS user_ignitions (
     user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     ignition_id  TEXT NOT NULL,
     enabled_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
     PRIMARY KEY (user_id, ignition_id)
   )`,
  // The character's own numbers on the command bar, remembered per account (defaults = the builder's)
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS char_level SMALLINT NOT NULL DEFAULT 1`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS verum_mod  SMALLINT NOT NULL DEFAULT 4`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS dream_mod  SMALLINT NOT NULL DEFAULT 0`,
  // The Paragon path arrived after the saves table did, so widen the kind constraint on any
  // database already out there. DROP IF EXISTS then ADD keeps migrate() re-runnable.
  `ALTER TABLE saves DROP CONSTRAINT IF EXISTS saves_kind_check`,
  `ALTER TABLE saves ADD CONSTRAINT saves_kind_check CHECK (kind IN ('seal', 'eidon', 'paragon'))`,
];

export async function migrate(db) {
  for (const sql of SCHEMA) await db.query(sql);
}
