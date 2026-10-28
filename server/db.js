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
  // What the DM has switched on or off for one Grimm: `key` is "shift" for its Reality Shift,
  // "shackle" for its Imperfect Shackle Break, or "a:<ability id>" for one ability. A Grimm with no
  // row for a key keeps that key's default — abilities are on, the Reality Shift and the Shackle
  // Break are off.
  `CREATE TABLE IF NOT EXISTS grimm_toggles (
     grimm_id TEXT NOT NULL,
     key      TEXT NOT NULL,
     enabled  BOOLEAN NOT NULL,
     PRIMARY KEY (grimm_id, key)
   )`,
  // Shackle Breaks defaulted to visible before they were gated (2026-10-09), because the only way
  // to get one into the app was to write it on the Grimm's own page. Zariel's Arm of the Blood
  // Keeper was live and his table knows it, so it is switched on once here rather than taken away
  // by an upgrade. ON CONFLICT DO NOTHING, so a DM who later hides it stays hidden.
  // Salomon's Parted Gates gets no row: it is unrevealed, and the default is off.
  `INSERT INTO grimm_toggles (grimm_id, key, enabled) VALUES ('vidarr', 'shackle', true)
     ON CONFLICT (grimm_id, key) DO NOTHING`,
  // A player's Servants (Juan, 2026-10-09). These used to live only in the browser, which meant a
  // cleared cache lost the roster, a second device saw nothing, and a Soul Shard upgrade to a vault
  // Servant had nowhere to be written down at all.
  //
  // A row is the player's DELTA, never a copy of the statblock. The vault still owns a Servant's
  // prose and keeps updating it on every rebuild; `edits` holds only what the player may change —
  // level, CR, HP, AC, ability scores, attuned items and a note — and `state` holds what moves at
  // the table: current HP, prepared, summoned, Elite, which form, and the charge trackers. A soul
  // the player wrote themselves has its whole statblock in `edits` and no vault base to layer onto.
  //
  // `soul_key` is 'vault:<name-slug>' or the player's own 'sb<rand>'. It is keyed by NAME and not by
  // position: the ids were once 'vault:' + readdirSync index, so adding or renaming one Base file
  // shifted every index and silently re-pointed saved state at the wrong Servant. Survivable in
  // localStorage, permanent once it is a row — see the migration in panels.js gateState().
  `CREATE TABLE IF NOT EXISTS grimm_souls (
     user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     grimm_id   TEXT NOT NULL,
     soul_key   TEXT NOT NULL,
     edits      TEXT NOT NULL DEFAULT '{}',
     state      TEXT NOT NULL DEFAULT '{}',
     updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     PRIMARY KEY (user_id, grimm_id, soul_key)
   )`,
  // Set the first time a browser hands its localStorage roster up, so the adoption only ever runs
  // once per player per Grimm. Without it, a player who opened an old tab would re-import a stale
  // roster over the one they have been using.
  `CREATE TABLE IF NOT EXISTS grimm_souls_adopted (
     user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     grimm_id   TEXT NOT NULL,
     adopted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     PRIMARY KEY (user_id, grimm_id)
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
  // World Map: where a place actually sits on the map the app serves. map/locations.json carries
  // the gazetteer's old eyeball estimates, transcribed from a DIFFERENT render — that one drew
  // Vestur narrower and set Austur further east, so most of those numbers put a pin in open water.
  // A row here is the DM having dragged the pin where it belongs, and it wins over the file.
  //
  // Deleting a row is how a placement is undone: the location falls back to its estimate. x and y
  // are in the gazetteer's frame (x 0..100 west to east, y 0..48 north to south from the NW corner)
  // and are fractions of the image, so re-rendering the map at a higher resolution moves nothing.
  //
  // `revealed` only means anything for a location the file marks secret; everywhere else is public
  // by default, because a world map the table cannot read is not a world map.
  // `placed` is kept apart from the coordinates because revealing a secret place writes a row
  // before anyone has dragged its pin: without the flag, a reveal would silently promote an
  // estimate into a placement and the DM would lose track of what is still guesswork.
  `CREATE TABLE IF NOT EXISTS map_locations (
     id         TEXT PRIMARY KEY,
     x          REAL NOT NULL CHECK (x >= 0 AND x <= 100),
     y          REAL NOT NULL CHECK (y >= 0 AND y <= 48),
     placed     BOOLEAN NOT NULL DEFAULT true,
     revealed   BOOLEAN NOT NULL DEFAULT false,
     updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  // 2026-10-21, same day: the table outgrew being a coordinate override. The DM needs to add places
  // the seed never had — a point of interest, a ruin, where the party is standing tonight — and to
  // rewrite a description without touching the JSON. So a row now carries the whole editable record.
  //
  // A row is still a DELTA over map-locations.json wherever that file has the id: a NULL column means
  // "whatever the seed says", so correcting one word of a description does not fork the other fields
  // and a later re-seed still flows through. `custom` marks a row with no seed behind it, where every
  // column is the truth and NULL means genuinely empty.
  //
  // `archived` is how a place leaves. Nothing is deleted: a mis-dropped pin is hidden and can come
  // back, which is the same bargain the vault makes with its own notes.
  `ALTER TABLE map_locations ADD COLUMN IF NOT EXISTS name       TEXT`,
  `ALTER TABLE map_locations ADD COLUMN IF NOT EXISTS nation     TEXT`,
  `ALTER TABLE map_locations ADD COLUMN IF NOT EXISTS kind       TEXT`,
  `ALTER TABLE map_locations ADD COLUMN IF NOT EXISTS terrain    TEXT`,
  `ALTER TABLE map_locations ADD COLUMN IF NOT EXISTS note       TEXT`,
  // NULL = take the seed's answer. `revealed` is the DM's override on top of whichever wins, so a
  // place is visible to players when it is not secret, or when it is secret and revealed.
  `ALTER TABLE map_locations ADD COLUMN IF NOT EXISTS secret     BOOLEAN`,
  `ALTER TABLE map_locations ADD COLUMN IF NOT EXISTS custom     BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE map_locations ADD COLUMN IF NOT EXISTS archived   BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE map_locations ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now()`,
  // Custom places are listed and filtered by nation constantly; seeded ones are looked up by id.
  `CREATE INDEX IF NOT EXISTS map_locations_nation ON map_locations (nation) WHERE nation IS NOT NULL`,
  // ── The Character Sheet ───────────────────────────────────────────────────────────────────────
  // One row per character. `sheet` is the whole editable sheet as JSON text, the same bargain the
  // Servants make: the player owns what is in there and the engine recomputes every total from it.
  //
  // The columns beside it are deliberately NOT in that JSON. `level`, `dream` and `fate` are the
  // DM's to set (DM-009, DM-02, DM-05), so they are real columns written only by the DM-only routes
  // and stripped from any player save. If they lived in `sheet` a forged payload would set them, and
  // hiding the control in the UI is not a permission — the same lesson the map's secret places taught
  // (`mapLocationsFor`: withhold, don't hide).
  //
  // Honor and Morality are four independent non-negative sub-scores, never an ability-modifier pair,
  // plus the unspent allocations a granted level issues. `honor_order` is the canonical name for the
  // sub-score the rules note calls "Order" in one paragraph and "Law" in the next.
  `CREATE TABLE IF NOT EXISTS characters (
     id               SERIAL PRIMARY KEY,
     user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     name             TEXT NOT NULL,
     level            SMALLINT NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 20),
     dream            SMALLINT NOT NULL DEFAULT 10 CHECK (dream BETWEEN 0 AND 40),
     fate             SMALLINT NOT NULL DEFAULT 0 CHECK (fate >= 0),
     honor_order      SMALLINT NOT NULL DEFAULT 0 CHECK (honor_order >= 0),
     honor_chaos      SMALLINT NOT NULL DEFAULT 0 CHECK (honor_chaos >= 0),
     morality_good    SMALLINT NOT NULL DEFAULT 0 CHECK (morality_good >= 0),
     morality_evil    SMALLINT NOT NULL DEFAULT 0 CHECK (morality_evil >= 0),
     honor_unspent    SMALLINT NOT NULL DEFAULT 0 CHECK (honor_unspent >= 0),
     morality_unspent SMALLINT NOT NULL DEFAULT 0 CHECK (morality_unspent >= 0),
     sheet            TEXT NOT NULL DEFAULT '{}',
     version          INTEGER NOT NULL DEFAULT 1,
     archived         BOOLEAN NOT NULL DEFAULT false,
     created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
     updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  // The Dream score is capped at 40 rather than 20 on purpose. Star Force.md documents a cap of 20,
  // but the table has been at 24 since Session 76, and a CHECK that refuses the number the DM
  // actually granted would make the sheet unusable for all eight players. The contradiction is
  // Juan's to settle; the column records what he set either way.
  `CREATE INDEX IF NOT EXISTS characters_user ON characters (user_id) WHERE archived = false`,
  // Append-only history. This is what makes a Fate spend, a granted level or a Dream event
  // reconstructable afterwards (DM-007, FD-04): who did it, to what, when, and from what to what.
  // Nothing updates or deletes a row here.
  `CREATE TABLE IF NOT EXISTS character_events (
     id           SERIAL PRIMARY KEY,
     character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
     actor_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
     action       TEXT NOT NULL,
     detail       TEXT NOT NULL DEFAULT '{}',
     note         TEXT NOT NULL DEFAULT '',
     at           TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS character_events_char ON character_events (character_id, id DESC)`,
  // A DM-granted advancement the player has yet to spend: a level, an ability score improvement, or
  // a feat. A token rather than a counter, so each one carries why it was given and when it was
  // used, and so "allow an ASI" can never be claimed twice (HB-007's acceptance, CS-063).
  `CREATE TABLE IF NOT EXISTS character_unlocks (
     id           SERIAL PRIMARY KEY,
     character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
     kind         TEXT NOT NULL CHECK (kind IN ('level', 'asi', 'feat')),
     note         TEXT NOT NULL DEFAULT '',
     granted_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
     granted_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
     consumed_at  TIMESTAMPTZ,
     choice       TEXT NOT NULL DEFAULT '{}'
   )`,
  // Which level this token is permission to REACH. The level column itself stays where it is until
  // the player presses LEVEL UP and this token is spent, which is the whole gate: the DM authorises
  // the level, the player applies it, and the raise happens in the same statement that consumes the
  // token so it can never happen twice (CS-063, DM-009). NULL is an older token, or an `asi`/`feat`
  // one, neither of which moves the level.
  `ALTER TABLE character_unlocks ADD COLUMN IF NOT EXISTS target_level SMALLINT`,
  `CREATE INDEX IF NOT EXISTS character_unlocks_open ON character_unlocks (character_id) WHERE consumed_at IS NULL`,
  // One row per Fate use ever spent, keyed by the id the sheet generates before it asks. A Fate
  // balance is granted only by the DM and never recharges, so a spend that gets sent twice — a
  // retried request, a double tap, a dropped connection the player reloads through — must not cost
  // two. The primary key is the whole mechanism: the second insert fails and the balance stands.
  `CREATE TABLE IF NOT EXISTS character_fate_spends (
     use_id       TEXT PRIMARY KEY,
     character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
     balance_after SMALLINT NOT NULL,
     at           TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  // Compendium content the DM uploaded. The SRD ships as a file in sheet/data/ because it is openly
  // licensed; everything else a DM imports lands HERE, in the database, and never in the git repo —
  // the requirements forbid bundling copyrighted non-SRD material (CS-085), and this app is public.
  // `source` is the book or file it came from, kept for the attribution CS-086 asks for.
  `CREATE TABLE IF NOT EXISTS compendium_entries (
     id         SERIAL PRIMARY KEY,
     kind       TEXT NOT NULL,
     name       TEXT NOT NULL,
     source     TEXT NOT NULL DEFAULT '',
     ruleset    TEXT NOT NULL DEFAULT 'dnd5e-2014',
     data       TEXT NOT NULL DEFAULT '{}',
     version    INTEGER NOT NULL DEFAULT 1,
     retired    BOOLEAN NOT NULL DEFAULT false,
     added_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
     added_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
     UNIQUE (kind, name, source, version)
   )`,
];

export async function migrate(db) {
  for (const sql of SCHEMA) await db.query(sql);
}
