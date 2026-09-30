// Arcanum Veritas server — serves the builder, signs players in, and hands each of them only the
// Cognitions the DM has granted. The Cognition JSON is never served as a static file.

import express from "express";
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openDb, migrate } from "./db.js";
import { hashPassword, verifyPassword, newToken, tokenHash } from "./auth.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = process.env.PORT || 3000;
const COOKIE = "av_session";
const SESSION_DAYS = 30;
const LOCKED = "!";   // a password_hash nobody can sign in with — the DM sets a real one in the Admin tab

const INDEX = JSON.parse(await readFile(path.join(ROOT, "cognitions", "index.json"), "utf8")).cognitions;
const BY_ID = new Map(INDEX.map(c => [c.id, c]));
// A player's tracker names a Cognition in free text — this is how a name finds its index entry
const BY_NAME = new Map(INDEX.flatMap(c => [[c.id, c], [c.name.toLowerCase(), c]]));
const keyOf = name => String(name || "").trim().replace(/\s+/g, " ").toLowerCase();

const db = await openDb();
await migrate(db);
await seed();

// ═══════════════════════════════════════════════════════════
//  FIRST RUN
// ═══════════════════════════════════════════════════════════
// An empty database gets the DM account and the players in seed.json with their mastered
// Cognitions. Their in-progress trackers are brought in once as well — also into a database that
// was seeded before the tracker existed. After that the database is the truth.
async function seed() {
  const dmName = (process.env.DM_USERNAME || "dm").toLowerCase();
  if (!(await db.query("SELECT 1 FROM users LIMIT 1")).rows.length) {
    const password = process.env.DM_PASSWORD || randomBytes(9).toString("base64url");
    await db.query("INSERT INTO users (username, display_name, password_hash, role) VALUES ($1, $2, $3, 'dm')",
      [dmName, "Dungeon Master", await hashPassword(password)]);
    if (!process.env.DM_PASSWORD) console.log(`DM account created — username "${dmName}", password "${password}". Change it after signing in.`);

    const { players } = JSON.parse(await readFile(path.join(ROOT, "server", "seed.json"), "utf8"));
    for (const p of players) {
      const { rows } = await db.query(
        "INSERT INTO users (username, display_name, password_hash) VALUES ($1, $2, $3) RETURNING id",
        [p.username, p.displayName, LOCKED]);
      for (const id of p.cognitions) {
        if (!BY_ID.has(id)) { console.warn(`seed: ${p.username} lists unknown cognition "${id}" — skipped`); continue; }
        await db.query("INSERT INTO user_cognitions (user_id, cognition_id) VALUES ($1, $2)", [rows[0].id, id]);
      }
    }
    console.log(`Seeded ${players.length} players. They cannot sign in until the DM sets their passwords.`);
  }
  if (!(await db.query("SELECT 1 FROM meta WHERE key = 'learning_seeded'")).rows.length) {
    const { players } = JSON.parse(await readFile(path.join(ROOT, "server", "seed.json"), "utf8"));
    for (const p of players) {
      const user = (await db.query("SELECT id FROM users WHERE username = $1", [p.username])).rows[0];
      if (!user) continue;
      const mine = await grantsOf(user.id);
      for (const [name, depth] of Object.entries(p.learning || {})) {
        if (mine.has(BY_NAME.get(keyOf(name))?.id)) continue;   // already enabled — nothing left to track
        await db.query("INSERT INTO learning (user_id, key, name, depth) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING",
          [user.id, keyOf(name), name, depth]);
      }
    }
    await db.query("INSERT INTO meta (key, value) VALUES ('learning_seeded', '1')");
    console.log("Learning trackers imported from seed.json.");
  }
  // Zeke already walks the path in the campaign, and his three ability sets are written. Seed them
  // so his account opens on them; every other player starts with the path off and nothing written.
  if (!(await db.query("SELECT 1 FROM meta WHERE key = 'paragon_seeded'")).rows.length) {
    const seed = JSON.parse(await readFile(path.join(ROOT, "server", "paragon-seed.json"), "utf8"));
    for (const [username, builds] of Object.entries(seed)) {
      const user = (await db.query("SELECT id FROM users WHERE username = $1", [username])).rows[0];
      if (!user) continue;
      await db.query("UPDATE users SET paragon = true WHERE id = $1", [user.id]);
      for (const b of builds) {
        const { id, cog, name, owner, ...data } = b;
        await db.query(
          `INSERT INTO paragon_builds (user_id, cognition_id, name, data) VALUES ($1, $2, $3, $4)
           ON CONFLICT (user_id, cognition_id, name) DO NOTHING`,
          [user.id, cog, name, JSON.stringify(data)]);
      }
      console.log(`Paragon path opened for ${username} with ${builds.length} ability sets.`);
    }
    await db.query("INSERT INTO meta (key, value) VALUES ('paragon_seeded', '1')");
  }
  // A way back in for a DM who lost the password: set RESET_DM_PASSWORD, redeploy, then remove it.
  if (process.env.RESET_DM_PASSWORD) {
    await db.query("UPDATE users SET password_hash = $1 WHERE role = 'dm' AND username = $2",
      [await hashPassword(process.env.RESET_DM_PASSWORD), dmName]);
    console.warn("RESET_DM_PASSWORD applied — remove that variable now.");
  }
}

// ═══════════════════════════════════════════════════════════
//  SESSIONS
// ═══════════════════════════════════════════════════════════
async function currentUser(req) {
  const m = new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`).exec(req.headers.cookie || "");
  if (!m) return null;
  const { rows } = await db.query(
    `SELECT u.id, u.username, u.display_name, u.role, u.char_level, u.verum_mod, u.dream_mod, u.paragon
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > now()`, [tokenHash(m[1])]);
  return rows[0] || null;
}
function setCookie(req, res, value, maxAge) {
  res.append("Set-Cookie", `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${req.secure ? "; Secure" : ""}`);
}
async function requireUser(req, res, next) {
  req.user = await currentUser(req);
  if (!req.user) return res.status(401).json({ error: "Sign in first." });
  next();
}
function requireDm(req, res, next) {
  if (req.user.role !== "dm") return res.status(403).json({ error: "DM only." });
  next();
}
const publicUser = u => ({ id: u.id, username: u.username, displayName: u.display_name, role: u.role });

// Wrong guesses are counted per address + name; eight inside fifteen minutes and it stops listening.
const FAILS = new Map(), FAIL_MAX = 8, FAIL_WINDOW = 15 * 60 * 1000;
function throttled(key) {
  const f = FAILS.get(key);
  if (f && Date.now() - f.since > FAIL_WINDOW) FAILS.delete(key);
  return (FAILS.get(key)?.n || 0) >= FAIL_MAX;
}
function failed(key) {
  const f = FAILS.get(key) || { n: 0, since: Date.now() };
  f.n++; FAILS.set(key, f);
}

const USERNAME = /^[a-z0-9_-]{2,32}$/;
function badPassword(p) { return typeof p !== "string" || p.length < 8 || p.length > 200; }

// ═══════════════════════════════════════════════════════════
//  APP
// ═══════════════════════════════════════════════════════════
const app = express();
app.set("trust proxy", 1);   // Railway terminates TLS in front of us
app.disable("x-powered-by");
app.use(express.json({ limit: "20kb" }));
app.use("/api", (req, res, next) => { res.set("Cache-Control", "no-store"); next(); });

// ── Signing in and out ─────────────────────────────────────
app.get("/api/me", requireUser, (req, res) => res.json({ user: {
  ...publicUser(req.user),
  // Whether the Paragon path is open to this account — the DM's to set, in the Admin tab
  paragon: !!req.user.paragon,
  sheet: { charLevel: req.user.char_level, verumMod: req.user.verum_mod, dreamMod: req.user.dream_mod },
} }));

// ── The Paragon path: the ability sets the DM has written for this player.
// A player reads only their own; the sets themselves are authored under /api/admin.
app.get("/api/paragon", requireUser, async (req, res) => {
  const { rows } = await db.query(
    "SELECT id, cognition_id, name, data FROM paragon_builds WHERE user_id = $1 ORDER BY cognition_id, name",
    [req.user.id]);
  res.json({ enabled: !!req.user.paragon, builds: rows.map(parBuildRow) });
});

// The character's numbers on the command bar — level, Verum mod, Dream mod — kept with the account
app.put("/api/sheet", requireUser, async (req, res) => {
  const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
  const { charLevel, verumMod, dreamMod } = req.body || {};
  if (!int(charLevel, 1, 20) || !int(verumMod, -2, 12) || !int(dreamMod, -2, 12))
    return res.status(400).json({ error: "Those numbers are out of range." });
  await db.query("UPDATE users SET char_level = $1, verum_mod = $2, dream_mod = $3 WHERE id = $4",
    [charLevel, verumMod, dreamMod, req.user.id]);
  res.json({ ok: true });
});

app.post("/api/login", async (req, res) => {
  const username = String(req.body?.username || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const key = `${req.ip}|${username}`;
  if (throttled(key)) return res.status(429).json({ error: "Too many attempts — wait a few minutes." });
  const { rows } = await db.query("SELECT id, username, display_name, role, password_hash FROM users WHERE username = $1", [username]);
  if (!(await verifyPassword(password, rows[0]?.password_hash))) {
    failed(key);
    return res.status(401).json({ error: "Wrong name or password." });
  }
  FAILS.delete(key);
  await db.query("DELETE FROM sessions WHERE expires_at < now()");
  const token = newToken();
  await db.query("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)",
    [tokenHash(token), rows[0].id, new Date(Date.now() + SESSION_DAYS * 864e5).toISOString()]);
  setCookie(req, res, token, SESSION_DAYS * 86400);
  res.json({ user: publicUser(rows[0]) });
});

app.post("/api/logout", async (req, res) => {
  const m = new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`).exec(req.headers.cookie || "");
  if (m) await db.query("DELETE FROM sessions WHERE token_hash = $1", [tokenHash(m[1])]);
  setCookie(req, res, "", 0);
  res.json({ ok: true });
});

app.post("/api/password", requireUser, async (req, res) => {
  const { current, next } = req.body || {};
  if (badPassword(next)) return res.status(400).json({ error: "A password needs at least 8 characters." });
  const { rows } = await db.query("SELECT password_hash FROM users WHERE id = $1", [req.user.id]);
  if (!(await verifyPassword(String(current || ""), rows[0].password_hash)))
    return res.status(401).json({ error: "That isn't your current password." });
  await db.query("UPDATE users SET password_hash = $1 WHERE id = $2", [await hashPassword(next), req.user.id]);
  res.json({ ok: true });
});

// ── Cognitions: the DM reads everything, a player only what was granted ─────────
async function grantsOf(userId) {
  const { rows } = await db.query("SELECT cognition_id FROM user_cognitions WHERE user_id = $1", [userId]);
  return new Set(rows.map(r => r.cognition_id));
}

app.get("/api/cognitions", requireUser, async (req, res) => {
  if (req.user.role === "dm") return res.json({ cognitions: INDEX });
  const mine = await grantsOf(req.user.id);
  res.json({ cognitions: INDEX.filter(c => mine.has(c.id)) });
});

// A Cognition a player may not read answers exactly like one that doesn't exist. `ready` stays the
// global gate it always was: a granted but held-back Cognition is listed, and not yet readable.
app.get("/api/cognitions/:id", requireUser, async (req, res) => {
  const entry = BY_ID.get(req.params.id);
  const allowed = entry && (req.user.role === "dm" || (entry.ready && (await grantsOf(req.user.id)).has(entry.id)));
  if (!allowed) return res.status(404).json({ error: "No such Cognition." });
  try {
    res.type("json").send(await readFile(path.join(ROOT, "cognitions", `${entry.id}.json`)));
  } catch (e) {
    res.status(404).json({ error: "No such Cognition." });
  }
});

// ── Learning: each player keeps their own tracker. It unlocks nothing — reaching 4/4 only puts
// a reminder on the DM's Admin tab, and the DM enabling the Cognition is what opens it.
const LEARNING_MAX = 60;
app.get("/api/learning", requireUser, async (req, res) => {
  const { rows } = await db.query("SELECT name, depth FROM learning WHERE user_id = $1 ORDER BY depth DESC, name", [req.user.id]);
  res.json({ learning: rows });
});

// What the tracker's name field suggests: the names — and only the names — of the Cognitions this
// player doesn't have yet. Nothing else about them leaves the server.
app.get("/api/learning/names", requireUser, async (req, res) => {
  const mine = await grantsOf(req.user.id);
  res.json({ names: INDEX.filter(c => !mine.has(c.id)).map(c => c.name).sort() });
});

app.put("/api/learning", requireUser, async (req, res) => {
  const name = String(req.body?.name || "").trim().replace(/\s+/g, " ").slice(0, 40), key = keyOf(name);
  const depth = Number(req.body?.depth);
  if (!key) return res.status(400).json({ error: "Name the Cognition you are learning." });
  if (!Number.isInteger(depth) || depth < 0 || depth > 4) return res.status(400).json({ error: "Depth runs from 0 to 4." });
  const entry = BY_NAME.get(key);
  if (entry && (await grantsOf(req.user.id)).has(entry.id)) return res.status(409).json({ error: `You already have ${entry.name}.` });
  const has = (await db.query("SELECT key FROM learning WHERE user_id = $1", [req.user.id])).rows;
  if (!has.some(r => r.key === key) && has.length >= LEARNING_MAX) return res.status(400).json({ error: "Your tracker is full." });
  await db.query(
    `INSERT INTO learning (user_id, key, name, depth) VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, key) DO UPDATE SET depth = EXCLUDED.depth, updated_at = now()`,
    [req.user.id, key, name, depth]);
  res.json({ ok: true });
});

app.delete("/api/learning/:name", requireUser, async (req, res) => {
  await db.query("DELETE FROM learning WHERE user_id = $1 AND key = $2", [req.user.id, keyOf(req.params.name)]);
  res.json({ ok: true });
});

// ── Saved seals and Eidons: private to the account, the DM included ─────────────
const SAVES_MAX = 200, SAVE_BYTES = 8000;
// The three Cognitive Arts a build can come from — the same list the saves table checks.
const SAVE_KINDS = ["seal", "eidon", "paragon"];

// ── A Paragon Ability set, as the DM writes it ─────────────
const PAR_TYPES = ["passive", "offensive", "supportive"];
const PAR_ACTS  = ["action", "bonus", "reaction"];
const RANKS = 4;   // Ranks I-IV, at levels 1 / 5 / 11 / 17

const parBuildRow = r => ({ id: r.id, cog: r.cognition_id, name: r.name, ...JSON.parse(r.data) });

// Everything the DM types is checked here — the player's builder trusts whatever comes back.
function cleanParagonBuild(body) {
  const cog = String(body?.cognitionId || "");
  if (!BY_ID.has(cog)) return { error: "No such Cognition." };
  const name = String(body?.name || "").trim().slice(0, 60);
  if (!name) return { error: "An ability set needs a name — the resonance, like “The Evergreen”." };

  const d = body?.data && typeof body.data === "object" ? body.data : {};
  const str = (v, n) => String(v == null ? "" : v).trim().slice(0, n);
  const abilities = Array.isArray(d.abilities) ? d.abilities : [];
  if (!abilities.length) return { error: "An ability set needs at least one ability." };
  if (abilities.length > 6) return { error: "Six abilities is the most a set can hold." };

  const clean = [];
  for (const a of abilities) {
    const an = str(a?.name, 60);
    if (!an) return { error: "Every ability needs a name." };
    if (!PAR_TYPES.includes(a?.type)) return { error: `“${an}” needs to be Passive, Offensive or Supportive.` };
    // A Passive is always on, so it has no activation and costs no use
    const act = a.type === "passive" ? null : (PAR_ACTS.includes(a?.act) ? a.act : null);
    const ranks = Array.isArray(a?.ranks) ? a.ranks : [];
    clean.push({
      name: an, type: a.type, act, uses: str(a?.uses, 60) || null,
      text: str(a?.text, 1200),
      ranks: Array.from({ length: RANKS }, (_, i) => str(ranks[i], 600)),
      ...(a?.seasonal ? { seasonal: str(a.seasonal, 20) } : {}),
    });
  }

  const data = {
    flavor: str(d.flavor, 600), save: str(d.save, 20) || "—", damage: str(d.damage, 20) || "—",
    warn: str(d.warn, 300) || undefined, source: str(d.source, 80) || "written by your DM",
    ...(d.wheel ? { wheel: true, wheelRanks: Array.from({ length: RANKS }, (_, i) => str(d.wheelRanks?.[i], 600)) } : {}),
    abilities: clean,
  };
  const json = JSON.stringify(data);
  if (json.length > SAVE_BYTES) return { error: "That ability set is too long." };
  return { cog, name, data: json };
}

function cleanSave(body) {
  const name = String(body?.name || "").trim().slice(0, 60);
  const data = body?.data && typeof body.data === "object" ? JSON.stringify(body.data) : "";
  if (!name) return { error: "A saved build needs a name." };
  if (!data || data.length > SAVE_BYTES) return { error: "That build can't be saved." };
  return { name, data };
}

app.get("/api/saves", requireUser, async (req, res) => {
  const { rows } = await db.query("SELECT id, kind, name, data FROM saves WHERE user_id = $1 ORDER BY kind DESC, lower(name)", [req.user.id]);
  res.json({ saves: rows.map(r => ({ id: r.id, kind: r.kind, name: r.name, data: JSON.parse(r.data) })) });
});

app.post("/api/saves", requireUser, async (req, res) => {
  const s = cleanSave(req.body), kind = req.body?.kind;
  if (s.error) return res.status(400).json({ error: s.error });
  if (!SAVE_KINDS.includes(kind)) return res.status(400).json({ error: "That build can't be saved." });
  if ((await db.query("SELECT id FROM saves WHERE user_id = $1", [req.user.id])).rows.length >= SAVES_MAX)
    return res.status(400).json({ error: `You can keep ${SAVES_MAX} saved builds — delete one first.` });
  const { rows } = await db.query("INSERT INTO saves (user_id, kind, name, data) VALUES ($1, $2, $3, $4) RETURNING id",
    [req.user.id, kind, s.name, s.data]);
  res.status(201).json({ id: rows[0].id });
});

app.put("/api/saves/:id", requireUser, async (req, res) => {
  const s = cleanSave(req.body);
  if (s.error) return res.status(400).json({ error: s.error });
  const { rows } = await db.query("UPDATE saves SET name = $1, data = $2, updated_at = now() WHERE id = $3 AND user_id = $4 RETURNING id",
    [s.name, s.data, parseInt(req.params.id, 10) || 0, req.user.id]);
  if (!rows.length) return res.status(404).json({ error: "No such saved build." });
  res.json({ ok: true });
});

app.delete("/api/saves/:id", requireUser, async (req, res) => {
  await db.query("DELETE FROM saves WHERE id = $1 AND user_id = $2", [parseInt(req.params.id, 10) || 0, req.user.id]);
  res.json({ ok: true });
});

// ── Grimm Companion: the Three Chains, and what the DM has switched on or off for each Grimm.
// Everyone at the table reads this; only the DM writes it.
app.get("/api/grimms/state", requireUser, async (req, res) => {
  const chains = (await db.query("SELECT grimm_id, chains FROM grimm_chains")).rows;
  const toggles = (await db.query("SELECT grimm_id, key, enabled FROM grimm_toggles")).rows;
  const out = {};
  for (const t of toggles) (out[t.grimm_id] = out[t.grimm_id] || {})[t.key] = !!t.enabled;
  res.json({ chains: Object.fromEntries(chains.map(r => [r.grimm_id, r.chains])), toggles: out });
});

// ── Admin: players and what each may read ──────────────────
const admin = express.Router();
admin.use(requireUser, requireDm);

admin.put("/grimms/:grimm/chains", async (req, res) => {
  const chains = req.body?.chains;
  if (!/^[a-z0-9_-]{1,40}$/.test(req.params.grimm) || !Number.isInteger(chains) || chains < 0 || chains > 3)
    return res.status(400).json({ error: "A Grimm holds 0 to 3 chains." });
  await db.query(
    `INSERT INTO grimm_chains (grimm_id, chains) VALUES ($1, $2)
     ON CONFLICT (grimm_id) DO UPDATE SET chains = EXCLUDED.chains`, [req.params.grimm, chains]);
  res.json({ ok: true });
});

// Reveal or hide a Grimm's Reality Shift ("shift"), or allow or deny one ability ("a:<id>")
admin.put("/grimms/:grimm/toggles/:key", async (req, res) => {
  const { grimm, key } = req.params;
  if (!/^[a-z0-9_-]{1,40}$/.test(grimm) || !/^(shift|a:[a-z0-9-]{1,60})$/.test(key) || typeof req.body?.enabled !== "boolean")
    return res.status(400).json({ error: "That isn't something the DM can switch." });
  await db.query(
    `INSERT INTO grimm_toggles (grimm_id, key, enabled) VALUES ($1, $2, $3)
     ON CONFLICT (grimm_id, key) DO UPDATE SET enabled = EXCLUDED.enabled`, [grimm, key, req.body.enabled]);
  res.json({ ok: true });
});

admin.get("/users", async (req, res) => {
  const users = (await db.query(
    `SELECT id, username, display_name, role, paragon, password_hash <> '${LOCKED}' AS has_password
       FROM users ORDER BY role, display_name`)).rows;
  const grants = (await db.query("SELECT user_id, cognition_id FROM user_cognitions")).rows;
  const learning = (await db.query("SELECT user_id, key, name, depth FROM learning ORDER BY depth DESC, name")).rows;
  const parBuilds = (await db.query("SELECT id, user_id, cognition_id, name FROM paragon_builds")).rows;
  res.json({ users: users.map(u => ({
    ...publicUser(u), hasPassword: u.has_password, paragon: !!u.paragon,
    paragonBuilds: parBuilds.filter(b => b.user_id === u.id).map(b => ({ id: b.id, cog: b.cognition_id, name: b.name })),
    cognitions: grants.filter(g => g.user_id === u.id).map(g => g.cognition_id),
    // cognitionId is null for a name the index doesn't know — nothing the DM can enable yet
    learning: learning.filter(l => l.user_id === u.id).map(l => ({ name: l.name, depth: l.depth, cognitionId: BY_NAME.get(l.key)?.id || null })),
  })) });
});

admin.post("/users", async (req, res) => {
  const username = String(req.body?.username || "").trim().toLowerCase();
  const displayName = String(req.body?.displayName || "").trim().slice(0, 60) || username;
  const password = req.body?.password;
  if (!USERNAME.test(username)) return res.status(400).json({ error: "Usernames are 2–32 characters: letters, digits, - and _." });
  if (password && badPassword(password)) return res.status(400).json({ error: "A password needs at least 8 characters." });
  if ((await db.query("SELECT 1 FROM users WHERE username = $1", [username])).rows.length)
    return res.status(409).json({ error: "That username is taken." });
  const { rows } = await db.query(
    "INSERT INTO users (username, display_name, password_hash) VALUES ($1, $2, $3) RETURNING id",
    [username, displayName, password ? await hashPassword(password) : LOCKED]);
  res.status(201).json({ id: rows[0].id });
});

admin.param("id", async (req, res, next, id) => {
  const { rows } = await db.query("SELECT id, username, display_name, role FROM users WHERE id = $1", [parseInt(id, 10) || 0]);
  if (!rows[0]) return res.status(404).json({ error: "No such user." });
  req.target = rows[0];
  next();
});

admin.patch("/users/:id", async (req, res) => {
  const { displayName, password } = req.body || {};
  if (password !== undefined) {
    if (badPassword(password)) return res.status(400).json({ error: "A password needs at least 8 characters." });
    await db.query("UPDATE users SET password_hash = $1 WHERE id = $2", [await hashPassword(password), req.target.id]);
    // a reset signs that user out everywhere — except the DM resetting their own
    if (req.target.id !== req.user.id) await db.query("DELETE FROM sessions WHERE user_id = $1", [req.target.id]);
  }
  if (displayName !== undefined) {
    const name = String(displayName).trim().slice(0, 60);
    if (!name) return res.status(400).json({ error: "A name can't be empty." });
    await db.query("UPDATE users SET display_name = $1 WHERE id = $2", [name, req.target.id]);
  }
  res.json({ ok: true });
});

admin.delete("/users/:id", async (req, res) => {
  if (req.target.role === "dm") return res.status(400).json({ error: "The DM account can't be deleted." });
  await db.query("DELETE FROM users WHERE id = $1", [req.target.id]);
  res.json({ ok: true });
});

admin.put("/users/:id/cognitions/:cog", async (req, res) => {
  if (!BY_ID.has(req.params.cog)) return res.status(404).json({ error: "No such Cognition." });
  await db.query("INSERT INTO user_cognitions (user_id, cognition_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    [req.target.id, req.params.cog]);
  // enabled — it leaves the player's tracker, and with it the DM's reminder
  const entry = BY_ID.get(req.params.cog);
  await db.query("DELETE FROM learning WHERE user_id = $1 AND key IN ($2, $3)", [req.target.id, entry.id, entry.name.toLowerCase()]);
  res.json({ ok: true });
});

admin.delete("/users/:id/cognitions/:cog", async (req, res) => {
  await db.query("DELETE FROM user_cognitions WHERE user_id = $1 AND cognition_id = $2", [req.target.id, req.params.cog]);
  res.json({ ok: true });
});

// ── Admin: the Paragon path — who walks it, and the ability sets written for them
admin.put("/users/:id/paragon", async (req, res) => {
  if (typeof req.body?.enabled !== "boolean") return res.status(400).json({ error: "Set the path on or off." });
  await db.query("UPDATE users SET paragon = $1 WHERE id = $2", [req.body.enabled, req.target.id]);
  res.json({ ok: true });
});

admin.get("/users/:id/paragon", async (req, res) => {
  const { rows } = await db.query(
    "SELECT id, cognition_id, name, data FROM paragon_builds WHERE user_id = $1 ORDER BY cognition_id, name",
    [req.target.id]);
  res.json({ builds: rows.map(parBuildRow) });
});

// Upsert. With an `id` the set is rewritten in place, so a resonance can be renamed;
// without one, (player, Cognition, name) is the key.
admin.put("/users/:id/paragon/builds", async (req, res) => {
  const b = cleanParagonBuild(req.body);
  if (b.error) return res.status(400).json({ error: b.error });
  const editing = parseInt(req.body?.id, 10) || 0;
  const clash = (await db.query(
    "SELECT id FROM paragon_builds WHERE user_id = $1 AND cognition_id = $2 AND lower(name) = lower($3)",
    [req.target.id, b.cog, b.name])).rows[0];
  if (clash && clash.id !== editing)
    return res.status(409).json({ error: `${req.target.display_name} already has a “${b.name}” for that Cognition.` });
  if (editing) {
    const { rowCount } = await db.query(
      "UPDATE paragon_builds SET cognition_id = $1, name = $2, data = $3, updated_at = now() WHERE id = $4 AND user_id = $5",
      [b.cog, b.name, b.data, editing, req.target.id]);
    if (!rowCount) return res.status(404).json({ error: "No such ability set." });
    return res.json({ id: editing });
  }
  const { rows } = await db.query(
    "INSERT INTO paragon_builds (user_id, cognition_id, name, data) VALUES ($1, $2, $3, $4) RETURNING id",
    [req.target.id, b.cog, b.name, b.data]);
  res.status(201).json({ id: rows[0].id });
});

admin.delete("/users/:id/paragon/builds/:buildId", async (req, res) => {
  await db.query("DELETE FROM paragon_builds WHERE id = $1 AND user_id = $2",
    [parseInt(req.params.buildId, 10) || 0, req.target.id]);
  res.json({ ok: true });
});

app.use("/api/admin", admin);
app.use("/api", (req, res) => res.status(404).json({ error: "Not found." }));

// ── The builder itself. Only these folders are public — cognitions/ and server/ never are.
app.use("/css", express.static(path.join(ROOT, "css")));
app.use("/js", express.static(path.join(ROOT, "js")));
// The front page (index.html) is where everyone signs in; the Grimm Companion has no sign-in of its
// own, so without a session it sends you back there.
app.use("/grimms", async (req, res, next) => {
  // The Grimm book is referenced by the Admin page too, which can be opened signed out. Let that
  // one asset through — the route below serves an empty book to anyone without a session, so it
  // parses as JavaScript instead of redirecting to a page of HTML.
  if (req.path === "/js/data.js") return next();
  return (await currentUser(req)) ? next() : res.redirect("/");
});

// The Grimm data carries every Reality Shift, so a player is served a copy with the ones the DM
// hasn't revealed cut out — hiding them in the page would leave the text a click away in the file.
const GRIMM_DATA_FILE = path.join(ROOT, "grimms", "js", "data.js");
const GRIMM_DATA = JSON.parse((await readFile(GRIMM_DATA_FILE, "utf8")).replace(/^[^{]*/, "").replace(/;\s*$/, ""));
const dataCache = new Map();
function grimmDataFor(revealed) {
  const key = [...revealed].sort().join(",");
  if (!dataCache.has(key)) {
    const data = { ...GRIMM_DATA, grimms: GRIMM_DATA.grimms.map(g => revealed.has(g.id) ? g : { ...g, shift: null }) };
    if (dataCache.size > 32) dataCache.clear();
    dataCache.set(key, "window.GRIMM_DATA = " + JSON.stringify(data) + ";\n");
  }
  return dataCache.get(key);
}
app.get("/grimms/js/data.js", async (req, res) => {
  const user = await currentUser(req);
  // Signed out, the book itself is campaign material — serve nothing rather than a redirect
  if (!user) return res.type("application/javascript").set("Cache-Control", "no-store")
    .send('window.GRIMM_DATA = { "grimms": [] };\n');
  let revealed;
  if (user.role === "dm") revealed = new Set(GRIMM_DATA.grimms.map(g => g.id));
  else {
    const { rows } = await db.query("SELECT grimm_id FROM grimm_toggles WHERE key = 'shift' AND enabled");
    revealed = new Set(rows.map(r => r.grimm_id));
  }
  res.type("application/javascript").set("Cache-Control", "no-store").send(grimmDataFor(revealed));
});

app.use("/grimms", express.static(path.join(ROOT, "grimms")));
app.get("/", (req, res) => res.sendFile(path.join(ROOT, "index.html")));
app.get("/arcanum.html", (req, res) => res.sendFile(path.join(ROOT, "arcanum.html")));
// The Admin page. Served like any other page — it signs you in itself, and turns away anyone who
// isn't the DM. Every call it makes is behind requireDm, which is where the real boundary is.
app.get("/admin.html", (req, res) => res.sendFile(path.join(ROOT, "admin.html")));

app.use((err, req, res, next) => {
  if (!err.status || err.status >= 500) console.error(err);
  res.status(err.status || 500).json({ error: err.status ? "Bad request." : "Server error." });
});

app.listen(PORT, () => console.log(`Arcanum Veritas listening on :${PORT} — ${process.env.DATABASE_URL ? "Postgres" : "embedded database (.data/)"}`));
