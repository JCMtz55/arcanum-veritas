// Arcanum Veritas server — serves the builder, signs players in, and hands each of them only the
// Cognitions the DM has granted. The Cognition JSON is never served as a static file.

import express from "express";
import { readFile, readdir } from "node:fs/promises";
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
// The Paragon path's Devotions: one player's reading of one Cognition, with the Paragon Abilities
// written for them. One file each, in cognitions/devotions/, named <owner>_<cognition>_devotion.json
// — so adding a Devotion is adding a file, and two people writing two Devotions never touch the
// same one. Authored beside the Cognitions and served the same way: never as a static file, and
// never anyone's but their own. A file with `example: true` belongs to nobody.
const DEVOTIONS_DIR = path.join(ROOT, "cognitions", "devotions");
const DEVOTIONS = await loadDevotions();
// Custom Ignitions: a permanent technique one character owns, inherited from a Dream Item, a
// Dream-Touched Creature or an Epiphany. One file each, in ignitions/, named
// ignition_<owner>_<slug>.json — added the same way a Devotion is, and served the same way: never
// as a static file, never anyone's but their own, and only once the DM has enabled it. They are
// read-only entries, not recipes: nothing here ever loads into the Forge.
const IGNITIONS_DIR = path.join(ROOT, "ignitions");
const IGNITIONS = await loadIgnitions();

// A byte-order mark is invisible in every editor and fatal to JSON.parse, and Windows PowerShell
// writes one by default — so a Devotion saved from a shell would vanish with a baffling parse
// error. Strip it rather than blame the author.
async function readJson(file) {
  return JSON.parse((await readFile(file, "utf8")).replace(/^﻿/, ""));
}

async function loadDevotions() {
  let files = [];
  try {
    files = (await readdir(DEVOTIONS_DIR)).filter(f => f.endsWith("_devotion.json")).sort();
  } catch (e) {
    console.warn(`cognitions/devotions/ can't be read — the Paragon path will have nothing in it. ${e.message}`);
    return [];
  }
  const out = [];
  for (const file of files) {
    let d;
    try { d = await readJson(path.join(DEVOTIONS_DIR, file)); }
    catch (e) { console.warn(`devotions/${file} isn't valid JSON — skipped. ${e.message}`); continue; }
    // The file name is the id, so there is only ever one of them to keep right
    const id = file.replace(/\.json$/, "");
    const owner = d.player || (d.example ? "example" : null);
    if (!owner) { console.warn(`devotions/${file}: needs a "player", or "example": true — skipped.`); continue; }
    if (!BY_ID.has(d.cognition)) { console.warn(`devotions/${file}: unknown Cognition "${d.cognition}" — skipped.`); continue; }
    // A lint, not a rule: a name that disagrees with what's inside is a rename half-done
    if (!file.startsWith(`${owner}_`) || !file.includes(`_${d.cognition}_`))
      console.warn(`devotions/${file}: the name doesn't match ${owner} + ${d.cognition} — expected ${owner}_${d.cognition}_devotion.json.`);
    out.push({ ...d, id });
  }
  // The folder is the truth; index.json only exists so a static host can find these files at all
  try {
    const listed = ((await readJson(path.join(DEVOTIONS_DIR, "index.json"))).devotions || []).map(x => x.file);
    const missing = files.filter(f => !listed.includes(f)), extra = listed.filter(f => !files.includes(f));
    if (missing.length || extra.length)
      console.warn(`devotions/index.json is out of date — ${missing.length ? `missing ${missing.join(", ")}` : ""}${missing.length && extra.length ? "; " : ""}${extra.length ? `lists ${extra.join(", ")} which isn't there` : ""}. The server is fine; a static host would be wrong.`);
  } catch (e) { console.warn("devotions/index.json is missing or unreadable — a static host won't find the Devotions."); }
  console.log(`Loaded ${out.length} Devotion${out.length === 1 ? "" : "s"} from cognitions/devotions/.`);
  return out;
}

// The same shape as loadDevotions, for the same reasons: the folder is the truth, the file name is
// the id, and a bad file is skipped with a reason rather than taking the server down with it.
async function loadIgnitions() {
  let files = [];
  try {
    files = (await readdir(IGNITIONS_DIR)).filter(f => f.startsWith("ignition_") && f.endsWith(".json")).sort();
  } catch (e) {
    console.warn(`ignitions/ can't be read — there will be no custom Ignitions. ${e.message}`);
    return [];
  }
  const out = [];
  for (const file of files) {
    let d;
    try { d = await readJson(path.join(IGNITIONS_DIR, file)); }
    catch (e) { console.warn(`ignitions/${file} isn't valid JSON — skipped. ${e.message}`); continue; }
    const id = file.replace(/\.json$/, "");
    const owner = d.player || (d.example ? "example" : null);
    if (!owner) { console.warn(`ignitions/${file}: needs a "player", or "example": true — skipped.`); continue; }
    if (!d.name) { console.warn(`ignitions/${file}: needs a "name" — skipped.`); continue; }
    const cogs = Array.isArray(d.cognitions) ? d.cognitions : [];
    const unknown = cogs.filter(c => !BY_ID.has(c));
    if (unknown.length) { console.warn(`ignitions/${file}: unknown Cognition${unknown.length > 1 ? "s" : ""} ${unknown.join(", ")} — skipped.`); continue; }
    // A lint, not a rule: a name that disagrees with what's inside is a rename half-done
    if (!file.startsWith(`ignition_${owner}_`))
      console.warn(`ignitions/${file}: the name doesn't match ${owner} — expected ignition_${owner}_<slug>.json.`);
    out.push({ ...d, id, cognitionNames: cogs.map(c => BY_ID.get(c).name) });
  }
  try {
    const listed = ((await readJson(path.join(IGNITIONS_DIR, "index.json"))).ignitions || []).map(x => x.file);
    const missing = files.filter(f => !listed.includes(f)), extra = listed.filter(f => !files.includes(f));
    if (missing.length || extra.length)
      console.warn(`ignitions/index.json is out of date — ${missing.length ? `missing ${missing.join(", ")}` : ""}${missing.length && extra.length ? "; " : ""}${extra.length ? `lists ${extra.join(", ")} which isn't there` : ""}. The server is fine; a static host would be wrong.`);
  } catch (e) { console.warn("ignitions/index.json is missing or unreadable — a static host won't find the custom Ignitions."); }
  console.log(`Loaded ${out.length} custom Ignition${out.length === 1 ? "" : "s"} from ignitions/.`);
  return out;
}

const devotionsOf = username => DEVOTIONS.filter(d => d.player && d.player.toLowerCase() === String(username).toLowerCase());
const DEVOTION_EXAMPLES = DEVOTIONS.filter(d => d.example);
const ignitionsOf = username => IGNITIONS.filter(i => i.player && i.player.toLowerCase() === String(username).toLowerCase());
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
  // Zeke already walks the path in the campaign. Open it for anyone the Devotion file writes sets
  // for, and put the Devotions they have actually mastered into their pool — the rest waits on a
  // Pilgrimage, which is exactly what Zeke's own sheet says about Nature. Everyone else starts
  // with the path closed and an empty pool.
  if (!(await db.query("SELECT 1 FROM meta WHERE key = 'paragon_pool_seeded'")).rows.length) {
    for (const username of new Set(DEVOTIONS.filter(d => d.player).map(d => d.player.toLowerCase()))) {
      const user = (await db.query("SELECT id FROM users WHERE username = $1", [username])).rows[0];
      if (!user) continue;
      await db.query("UPDATE users SET paragon = true WHERE id = $1", [user.id]);
      const mine = await grantsOf(user.id);
      const open = devotionsOf(username).filter(d => mine.has(d.cognition));
      for (const d of open)
        await db.query("INSERT INTO paragon_devotions (user_id, cognition_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
          [user.id, d.cognition]);
      console.log(`Paragon path opened for ${username} — ${open.length} of ${devotionsOf(username).length} Devotions mastered.`);
    }
    await db.query("INSERT INTO meta (key, value) VALUES ('paragon_pool_seeded', '1')");
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

// ═══════════════════════════════════════════════════════════
//  THE PARAGON PATH
// ═══════════════════════════════════════════════════════════
// Three things make up a Paragon, and they come from three different places:
//   · whether the path is open at all, and which Devotions are in the pool — the DM's, in Admin
//   · the Paragon Abilities themselves — cognitions/devotions/<player>_<cognition>_devotion.json
//   · which up-to-three are sworn, and which one burns — the player's, kept per account
// A player is served only the sets written for them, and only for a Devotion the DM has opened.
const DEVOTIONS_SWORN = 3;

async function poolOf(userId) {
  const { rows } = await db.query("SELECT cognition_id FROM paragon_devotions WHERE user_id = $1", [userId]);
  return new Set(rows.map(r => r.cognition_id));
}
async function choiceOf(userId) {
  const { rows } = await db.query("SELECT sworn, active FROM paragon_choice WHERE user_id = $1", [userId]);
  let sworn = [];
  try { sworn = JSON.parse(rows[0]?.sworn || "[]"); } catch (e) {}
  return { sworn: Array.isArray(sworn) ? sworn : [], active: rows[0]?.active || null };
}
// A Devotion needs two things to agree: the DM opened it, and the player has mastered the
// Cognition. The abilities are a third thing, and they can lag — the path is a choice of identity
// that comes before anyone has written anything down — so a Devotion with no set yet is served as
// a stub and says so on its own card, rather than vanishing from a pool the DM can see.
async function openDevotionsOf(user) {
  const pool = await poolOf(user.id), mastered = await grantsOf(user.id);
  const mine = devotionsOf(user.username);
  return [...pool].filter(id => mastered.has(id)).map(id => {
    const d = mine.find(x => x.cognition === id);
    // A `pilgrimage` note says the Cognition isn't reachable yet. Being in the pool means it is,
    // so the note has served its purpose and would only contradict the card it sits on.
    if (d) { const { pilgrimage, ...rest } = d; return rest; }
    return { id: `${id}-unwritten`, player: user.username, cognition: id, unwritten: true,
             name: BY_ID.get(id)?.name || id, icon: BY_ID.get(id)?.icon || "◆",
             description: "", savingThrow: "—", damageType: "—", abilities: {} };
  }).sort((a, b) => (a.unwritten ? 1 : 0) - (b.unwritten ? 1 : 0) || a.name.localeCompare(b.name));
}
// Sets written for this player that they can't reach yet — the Cognition isn't mastered, or the
// DM hasn't opened it. Zeke's Nature was exactly this before his Pilgrimage.
async function awaitingOf(user) {
  const pool = await poolOf(user.id), mastered = await grantsOf(user.id);
  return devotionsOf(user.username)
    .filter(d => !(pool.has(d.cognition) && mastered.has(d.cognition)))
    .map(d => ({ id: d.id, cognition: d.cognition, name: d.name, description: d.description,
                 cognitionName: BY_ID.get(d.cognition)?.name || d.cognition,
                 pilgrimage: d.pilgrimage || null, source: d.source || null,
                 mastered: mastered.has(d.cognition) }));
}
// The names ride along: a Pilgrimage can reach for a Cognition the player hasn't mastered yet —
// which is exactly Zeke's Nature — and their browser was never told that one's name.
const pilgrimageRow = r => ({
  id: r.id, leaving: r.leaving, arriving: r.arriving, note: r.note, status: r.status,
  leavingName: r.leaving ? (BY_ID.get(r.leaving)?.name || r.leaving) : null,
  arrivingName: BY_ID.get(r.arriving)?.name || r.arriving,
  createdAt: r.created_at, decidedAt: r.decided_at,
});

app.get("/api/paragon", requireUser, async (req, res) => {
  const devotions = await openDevotionsOf(req.user);
  const ids = new Set(devotions.map(d => d.cognition));
  const { sworn, active } = await choiceOf(req.user.id);
  const kept = sworn.filter(id => ids.has(id)).slice(0, DEVOTIONS_SWORN);
  const { rows } = await db.query(
    "SELECT * FROM paragon_pilgrimage WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10", [req.user.id]);
  res.json({
    enabled: !!req.user.paragon,
    max: DEVOTIONS_SWORN,
    devotions,                                       // the pool, with every ability written out
    awaiting: await awaitingOf(req.user),            // written for them, not yet reachable
    sworn: kept,
    active: kept.includes(active) ? active : null,
    // Cognitions mastered but with no Devotion open — the short road a Pilgrimage can take
    reachable: [...(await grantsOf(req.user.id))].filter(id => !ids.has(id)),
    // …and the long one: the names, and only the names, of the Cognitions they haven't mastered.
    // The same list the Learning tracker suggests from, because a Pilgrimage is how Zeke's Nature
    // reaches Learn Full in the first place.
    names: INDEX.filter(c => !ids.has(c.id)).map(c => c.name).sort(),
    examples: DEVOTION_EXAMPLES,
    pilgrimage: rows.map(pilgrimageRow),
  });
});

// Swear up to three, and say which one is held in the Deeper Burn.
app.put("/api/paragon/choice", requireUser, async (req, res) => {
  if (!req.user.paragon) return res.status(403).json({ error: "The Paragon path isn't open to you." });
  const ids = new Set((await openDevotionsOf(req.user)).map(d => d.cognition));
  const asked = Array.isArray(req.body?.sworn) ? req.body.sworn.map(String) : [];
  const sworn = [...new Set(asked)].filter(id => ids.has(id));
  if (sworn.length > DEVOTIONS_SWORN)
    return res.status(400).json({ error: `Three Devotions is the limit — a Pilgrimage replaces one.` });
  const active = sworn.includes(String(req.body?.active)) ? String(req.body.active) : null;
  await db.query(
    `INSERT INTO paragon_choice (user_id, sworn, active) VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE SET sworn = EXCLUDED.sworn, active = EXCLUDED.active, updated_at = now()`,
    [req.user.id, JSON.stringify(sworn), active]);
  res.json({ sworn, active });
});

// A Pilgrimage is notice, not a switch: the player asks, the DM answers in Admin.
app.post("/api/paragon/pilgrimage", requireUser, async (req, res) => {
  if (!req.user.paragon) return res.status(403).json({ error: "The Paragon path isn't open to you." });
  // `arriving` may be an id or the name the player typed — a Pilgrimage can reach for something
  // they haven't mastered, and their browser only ever learned that one's name.
  const asked = String(req.body?.arriving || "");
  const arriving = BY_ID.has(asked) ? asked : BY_NAME.get(keyOf(asked))?.id;
  const leaving = req.body?.leaving ? String(req.body.leaving) : null;
  if (!arriving) return res.status(404).json({ error: "No such Cognition." });
  const pool = await poolOf(req.user.id);
  if (pool.has(arriving)) return res.status(409).json({ error: `${BY_ID.get(arriving).name} is already one of your Devotions.` });
  if (leaving && !pool.has(leaving)) return res.status(400).json({ error: "That isn't one of your Devotions." });
  if ((await db.query("SELECT 1 FROM paragon_pilgrimage WHERE user_id = $1 AND status = 'asked'", [req.user.id])).rows.length)
    return res.status(409).json({ error: "You're already on a Pilgrimage — one road at a time." });
  const note = String(req.body?.note || "").trim().slice(0, 600);
  const { rows } = await db.query(
    "INSERT INTO paragon_pilgrimage (user_id, leaving, arriving, note) VALUES ($1, $2, $3, $4) RETURNING id",
    [req.user.id, leaving, arriving, note]);
  res.status(201).json({ id: rows[0].id });
});

app.delete("/api/paragon/pilgrimage/:id", requireUser, async (req, res) => {
  await db.query("DELETE FROM paragon_pilgrimage WHERE id = $1 AND user_id = $2 AND status = 'asked'",
    [parseInt(req.params.id, 10) || 0, req.user.id]);
  res.json({ ok: true });
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

// ── Custom Ignitions: written in ignitions/, enabled per player by the DM ───────
// Two things have to agree, the same two a Devotion needs: a file was written for this player, and
// the DM has switched it on. An Ignition the DM has not enabled never reaches the browser at all.
// The DM is served every one of them, each saying whose it is — they wrote them.
async function enabledIgnitionsOf(userId) {
  const { rows } = await db.query("SELECT ignition_id FROM user_ignitions WHERE user_id = $1", [userId]);
  return new Set(rows.map(r => r.ignition_id));
}

app.get("/api/ignitions", requireUser, async (req, res) => {
  if (req.user.role === "dm") return res.json({ ignitions: IGNITIONS, dm: true });
  const on = await enabledIgnitionsOf(req.user.id);
  res.json({ ignitions: ignitionsOf(req.user.username).filter(i => on.has(i.id)) });
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
  const opened = (await db.query("SELECT user_id, cognition_id FROM paragon_devotions")).rows;
  const choices = (await db.query("SELECT user_id, sworn, active FROM paragon_choice")).rows;
  const asked = (await db.query("SELECT * FROM paragon_pilgrimage WHERE status = 'asked' ORDER BY created_at")).rows;
  const ignOn = (await db.query("SELECT user_id, ignition_id FROM user_ignitions")).rows;
  const swornOf = id => { try { return JSON.parse(choices.find(c => c.user_id === id)?.sworn || "[]"); } catch (e) { return []; } };
  res.json({ users: users.map(u => ({
    ...publicUser(u), hasPassword: u.has_password, paragon: !!u.paragon,
    // Which Devotions the DM has opened, which of those the player swore, and which one burns.
    // The Paragon Abilities live in the Devotion file, so the names of the sets come from there.
    devotions: opened.filter(d => d.user_id === u.id).map(d => d.cognition_id),
    sworn: swornOf(u.id),
    burning: choices.find(c => c.user_id === u.id)?.active || null,
    devotionSets: devotionsOf(u.username).map(d => ({ cog: d.cognition, name: d.name, id: d.id })),
    pilgrimage: asked.filter(p => p.user_id === u.id).map(pilgrimageRow),
    // Custom Ignitions: which are switched on, and which have been written for them at all.
    // Same split as the Devotions above — the entries live in ignitions/, not in this page.
    ignitions: ignOn.filter(i => i.user_id === u.id).map(i => i.ignition_id),
    ignitionSets: ignitionsOf(u.username).map(i => ({
      id: i.id, name: i.name, rank: i.rank || null, cognitions: i.cognitionNames || [], source: i.source || null })),
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
  // A Devotion can only be a mastered Cognition, so taking the Cognition away closes the Devotion
  await db.query("DELETE FROM paragon_devotions WHERE user_id = $1 AND cognition_id = $2", [req.target.id, req.params.cog]);
  await unswear(req.target.id, req.params.cog);
  res.json({ ok: true });
});

// ── Admin: the Paragon path — who walks it, and which Devotions are open to them.
// The abilities aren't here: they're authored in cognitions/devotions/<player>_<cognition>_devotion.json.
admin.put("/users/:id/paragon", async (req, res) => {
  if (typeof req.body?.enabled !== "boolean") return res.status(400).json({ error: "Set the path on or off." });
  await db.query("UPDATE users SET paragon = $1 WHERE id = $2", [req.body.enabled, req.target.id]);
  res.json({ ok: true });
});

// Open a Devotion. Only a Cognition this player has mastered — the rule the pool exists to keep.
admin.put("/users/:id/devotions/:cog", async (req, res) => {
  const cog = req.params.cog;
  if (!BY_ID.has(cog)) return res.status(404).json({ error: "No such Cognition." });
  if (!(await grantsOf(req.target.id)).has(cog))
    return res.status(400).json({ error: `${req.target.display_name} hasn't mastered ${BY_ID.get(cog).name} — grant it first.` });
  await db.query("INSERT INTO paragon_devotions (user_id, cognition_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    [req.target.id, cog]);
  res.json({ ok: true });
});

admin.delete("/users/:id/devotions/:cog", async (req, res) => {
  await db.query("DELETE FROM paragon_devotions WHERE user_id = $1 AND cognition_id = $2", [req.target.id, req.params.cog]);
  await unswear(req.target.id, req.params.cog);
  res.json({ ok: true });
});

// ── Admin: custom Ignitions — which of the ones written for a player are switched on.
// The entries aren't here: they're authored in ignitions/ignition_<player>_<slug>.json. The server
// only ever enables one for the player whose name is inside the file, so a mis-click in a stale
// page can't hand Rory's Ignition to Khaled.
admin.put("/users/:id/ignitions/:ign", async (req, res) => {
  const ign = IGNITIONS.find(i => i.id === req.params.ign);
  if (!ign) return res.status(404).json({ error: "No such Ignition." });
  if (!ign.player || ign.player.toLowerCase() !== req.target.username.toLowerCase())
    return res.status(400).json({ error: `“${ign.name}” was written for ${ign.player || "nobody"}, not ${req.target.display_name}.` });
  await db.query("INSERT INTO user_ignitions (user_id, ignition_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    [req.target.id, ign.id]);
  res.json({ ok: true });
});

admin.delete("/users/:id/ignitions/:ign", async (req, res) => {
  await db.query("DELETE FROM user_ignitions WHERE user_id = $1 AND ignition_id = $2", [req.target.id, req.params.ign]);
  res.json({ ok: true });
});

// A Devotion taken away is unsworn too, and puts out the Burn if it was the one alight.
async function unswear(userId, cog) {
  const { sworn, active } = await choiceOf(userId);
  if (!sworn.includes(cog)) return;
  const kept = sworn.filter(id => id !== cog);
  await db.query("UPDATE paragon_choice SET sworn = $1, active = $2, updated_at = now() WHERE user_id = $3",
    [JSON.stringify(kept), active === cog ? null : active, userId]);
}

// Pilgrimages waiting on an answer, newest first — the advance notice the rule asks for.
admin.get("/pilgrimages", async (req, res) => {
  const { rows } = await db.query(
    `SELECT p.*, u.display_name, u.username FROM paragon_pilgrimage p JOIN users u ON u.id = p.user_id
      ORDER BY (p.status = 'asked') DESC, p.created_at DESC LIMIT 60`);
  res.json({ pilgrimages: rows.map(r => ({ ...pilgrimageRow(r), userId: r.user_id, displayName: r.display_name, username: r.username })) });
});

// Walked: the old Devotion leaves and the new one takes its place, in one step.
admin.put("/pilgrimages/:id", async (req, res) => {
  const status = String(req.body?.status || "");
  if (!["walked", "declined"].includes(status)) return res.status(400).json({ error: "A Pilgrimage is walked or declined." });
  const { rows } = await db.query("SELECT * FROM paragon_pilgrimage WHERE id = $1", [parseInt(req.params.id, 10) || 0]);
  const p = rows[0];
  if (!p) return res.status(404).json({ error: "No such Pilgrimage." });
  if (p.status !== "asked") return res.status(409).json({ error: "That Pilgrimage is already answered." });
  if (status === "walked") {
    if (!(await grantsOf(p.user_id)).has(p.arriving))
      return res.status(400).json({ error: `${BY_ID.get(p.arriving)?.name || p.arriving} isn't mastered yet — grant it first, then let the Pilgrimage finish.` });
    if (p.leaving) {
      await db.query("DELETE FROM paragon_devotions WHERE user_id = $1 AND cognition_id = $2", [p.user_id, p.leaving]);
      await unswear(p.user_id, p.leaving);
    }
    await db.query("INSERT INTO paragon_devotions (user_id, cognition_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [p.user_id, p.arriving]);
  }
  await db.query("UPDATE paragon_pilgrimage SET status = $1, decided_at = now() WHERE id = $2", [status, p.id]);
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
// "/" and "/index.html" are the same front page — an old bookmark or a hand-typed URL used to
// get Express's bare "Cannot GET /index.html" instead of the hub.
app.get(["/", "/index.html"], (req, res) => res.sendFile(path.join(ROOT, "index.html")));
app.get("/arcanum.html", (req, res) => res.sendFile(path.join(ROOT, "arcanum.html")));
// The Admin page. Served like any other page — it signs you in itself, and turns away anyone who
// isn't the DM. Every call it makes is behind requireDm, which is where the real boundary is.
app.get("/admin.html", (req, res) => res.sendFile(path.join(ROOT, "admin.html")));

app.use((err, req, res, next) => {
  if (!err.status || err.status >= 500) console.error(err);
  res.status(err.status || 500).json({ error: err.status ? "Bad request." : "Server error." });
});

app.listen(PORT, () => console.log(`Arcanum Veritas listening on :${PORT} — ${process.env.DATABASE_URL ? "Postgres" : "embedded database (.data/)"}`));
