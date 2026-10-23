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

// ── Grimm Companion: a player's own Servants ────────────────────────────
// Each row is that player's delta on one soul, never a copy of the statblock: `edits` is what they
// may change (a vault soul's numbers, or the whole statblock for a soul they wrote), and `state` is
// what moves at the table — HP, prepared, summoned, and the charge trackers. See db.js.
//
// A soul whose `edits` carries a `name` is the player's own; anything else is a layer on the vault's.
const GRIMM_ID = /^[a-z0-9_-]{1,40}$/;
const SOUL_KEY = /^(vault:[a-z0-9-]{1,60}|sb[a-z0-9]{1,30})$/;
const asJson = (v, fallback = {}) => { try { const o = JSON.parse(v); return o && typeof o === "object" ? o : fallback; } catch { return fallback; } };

app.get("/api/grimms/souls", requireUser, async (req, res) => {
  const { rows } = await db.query(
    "SELECT grimm_id, soul_key, edits, state FROM grimm_souls WHERE user_id = $1", [req.user.id]);
  const adopted = (await db.query(
    "SELECT grimm_id FROM grimm_souls_adopted WHERE user_id = $1", [req.user.id])).rows.map(r => r.grimm_id);
  const out = {};
  for (const r of rows) (out[r.grimm_id] = out[r.grimm_id] || {})[r.soul_key] =
    { edits: asJson(r.edits), state: asJson(r.state) };
  res.json({ grimms: out, adopted });
});

// The browser hands up the whole set for one Grimm and the server makes the table match it — a
// delete has to be able to travel, and a player has one roster per Grimm, not a shared one.
// `adopt` is the first hand-up from a browser that had the roster only in localStorage; it is
// recorded so it can never run twice and re-import a stale roster from a forgotten tab.
app.put("/api/grimms/souls/:grimm", requireUser, async (req, res) => {
  const grimm = req.params.grimm;
  if (!GRIMM_ID.test(grimm)) return res.status(400).json({ error: "Not a Grimm." });
  const souls = req.body?.souls;
  if (!souls || typeof souls !== "object") return res.status(400).json({ error: "Nothing to save." });
  const keys = Object.keys(souls).filter(k => SOUL_KEY.test(k)).slice(0, 200);

  if (req.body.adopt) {
    // Checked with a SELECT rather than the INSERT's row count, because PGlite does not report one
    // — relying on it meant the very first adoption looked like a repeat and the roster was never
    // uploaded at all, while the guard row went in and made it permanent.
    const seen = await db.query(
      "SELECT 1 FROM grimm_souls_adopted WHERE user_id = $1 AND grimm_id = $2", [req.user.id, grimm]);
    // Already adopted: this is an old tab offering its copy. Keep what is in the table.
    if (seen.rows.length) return res.json({ ok: true, adopted: false });
    await db.query(
      `INSERT INTO grimm_souls_adopted (user_id, grimm_id) VALUES ($1, $2)
       ON CONFLICT (user_id, grimm_id) DO NOTHING`, [req.user.id, grimm]);
  }
  for (const k of keys) {
    const v = souls[k] || {};
    await db.query(
      `INSERT INTO grimm_souls (user_id, grimm_id, soul_key, edits, state, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (user_id, grimm_id, soul_key)
       DO UPDATE SET edits = EXCLUDED.edits, state = EXCLUDED.state, updated_at = now()`,
      [req.user.id, grimm, k, JSON.stringify(v.edits || {}), JSON.stringify(v.state || {})]);
  }
  // Rows the browser no longer has are gone — a release has to travel. But an empty set would mean
  // "delete the roster", which is far more likely to be a bug at the other end than an intention,
  // so it has to say so out loud.
  if (keys.length)
    await db.query(
      `DELETE FROM grimm_souls WHERE user_id = $1 AND grimm_id = $2
         AND NOT (soul_key = ANY($3::text[]))`, [req.user.id, grimm, keys]);
  else if (req.body.clear === true)
    await db.query("DELETE FROM grimm_souls WHERE user_id = $1 AND grimm_id = $2", [req.user.id, grimm]);
  res.json({ ok: true, saved: keys.length });
});

// ── Admin: players and what each may read ──────────────────
const admin = express.Router();
admin.use(requireUser, requireDm);

// The DM reads and corrects a player's Servants (Juan, 2026-10-09) — the roster, the upgrades they
// have recorded and the charges they are holding. Writing one is for granting an upgrade or fixing
// a number; it is the same row the player's own sheet syncs, so do it between sessions when you can.
admin.get("/players/:id/souls", async (req, res) => {
  const { rows } = await db.query(
    "SELECT grimm_id, soul_key, edits, state, updated_at FROM grimm_souls WHERE user_id = $1 ORDER BY grimm_id, soul_key",
    [+req.params.id || 0]);
  res.json({ souls: rows.map(r => ({ grimm: r.grimm_id, key: r.soul_key, edits: asJson(r.edits), state: asJson(r.state), updated: r.updated_at })) });
});

admin.put("/players/:id/souls/:grimm/:key", async (req, res) => {
  const uid = +req.params.id || 0, { grimm, key } = req.params;
  if (!GRIMM_ID.test(grimm) || !SOUL_KEY.test(key)) return res.status(400).json({ error: "Not a soul." });
  const edits = req.body?.edits, state = req.body?.state;
  if (typeof edits !== "object" && typeof state !== "object")
    return res.status(400).json({ error: "Send edits, state, or both." });
  const cur = (await db.query(
    "SELECT edits, state FROM grimm_souls WHERE user_id = $1 AND grimm_id = $2 AND soul_key = $3",
    [uid, grimm, key])).rows[0];
  // A vault Servant exists on every sheet whether or not it has a row — a row is only the player's
  // delta on it — so the DM granting it an upgrade may be writing the first one. A soul the player
  // WROTE has no existence outside its row, so there the row must already be there.
  if (!cur && !key.startsWith("vault:"))
    return res.status(404).json({ error: "That player has no such soul." });
  await db.query(
    `INSERT INTO grimm_souls (user_id, grimm_id, soul_key, edits, state, updated_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (user_id, grimm_id, soul_key)
     DO UPDATE SET edits = EXCLUDED.edits, state = EXCLUDED.state, updated_at = now()`,
    [uid, grimm, key,
     JSON.stringify(typeof edits === "object" && edits ? edits : asJson(cur?.edits)),
     JSON.stringify(typeof state === "object" && state ? state : asJson(cur?.state))]);
  res.json({ ok: true });
});

admin.put("/grimms/:grimm/chains", async (req, res) => {
  const chains = req.body?.chains;
  if (!/^[a-z0-9_-]{1,40}$/.test(req.params.grimm) || !Number.isInteger(chains) || chains < 0 || chains > 3)
    return res.status(400).json({ error: "A Grimm holds 0 to 3 chains." });
  await db.query(
    `INSERT INTO grimm_chains (grimm_id, chains) VALUES ($1, $2)
     ON CONFLICT (grimm_id) DO UPDATE SET chains = EXCLUDED.chains`, [req.params.grimm, chains]);
  res.json({ ok: true });
});

// Reveal or hide a Grimm's Reality Shift ("shift") or its Imperfect Shackle Break ("shackle"), or
// allow or deny one ability ("a:<id>")
admin.put("/grimms/:grimm/toggles/:key", async (req, res) => {
  const { grimm, key } = req.params;
  if (!/^[a-z0-9_-]{1,40}$/.test(grimm) || !/^(shift|shackle|a:[a-z0-9-]{1,60})$/.test(key) || typeof req.body?.enabled !== "boolean")
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

// ── The World Map: where a place actually sits ─────────────
// map/locations.json holds the gazetteer's eyeball estimates, transcribed from an older render of
// the world. The art this section serves is not that render — it draws Vestur about half again as
// wide and sets Austur further west — so most of those coordinates put a pin in open water. The DM
// drags each one where it belongs and the row written here is the truth from then on.
// The seed lives in server/, NOT in map/, and that is deliberate. An exact route plus a static
// mount over the same folder is the shape of the hole already logged against the Grimm book:
// /grimms//js/data.js and eight other spellings miss the exact route and reach the folder handler,
// which hands back the unfiltered file. Keeping this file outside every served directory closes
// that off by construction rather than by out-guessing the URL parser.
const MAP_FILE = path.join(ROOT, "server", "map-locations.json");
const MAP_SEED = JSON.parse(await readFile(MAP_FILE, "utf8"));
const MAP_BY_ID = new Map(MAP_SEED.locations.map(l => [l.id, l]));

// A row overrides the seed field by field: NULL means "whatever the file says". That is what lets
// the DM rewrite one description without forking the other five columns, and what lets a re-seed
// still flow through everything they have not touched. A `custom` row has no file behind it, so
// there the row is simply the whole truth.
const OVERRIDE = ["name", "nation", "kind", "terrain", "note"];

function effective(seed, row) {
  const base = seed || {};
  const out = {
    id: base.id || (row && row.id),
    name: base.name || "", nation: base.nation || "free", kind: base.kind || "poi",
    terrain: base.terrain || "open", note: base.note || "",
    secret: !!base.secret,
    x: base.x, y: base.y,
    placed: false, revealed: false, custom: false,
  };
  if (base.vault) out.vault = base.vault;
  if (row) {
    for (const f of OVERRIDE) if (row[f] !== null && row[f] !== undefined) out[f] = row[f];
    if (row.secret !== null && row.secret !== undefined) out.secret = row.secret;
    out.x = Number(row.x); out.y = Number(row.y);
    out.placed = row.placed; out.revealed = row.revealed; out.custom = row.custom;
  }
  return out;
}

async function mapLocationsFor(user, { includeArchived = false } = {}) {
  const { rows } = await db.query(
    `SELECT * FROM map_locations${includeArchived ? "" : " WHERE NOT archived"}`);
  const byId = new Map(rows.map(r => [r.id, r]));
  const dm = user.role === "dm";
  const out = [];
  const take = l => {
    // A secret place is withheld outright rather than sent and hidden in the page — the same
    // bargain the Grimm book makes with an unrevealed Reality Shift. Hiding it client-side would
    // leave it one View Source away.
    if (l.secret && !dm && !l.revealed) return;
    out.push(l);
  };
  for (const seed of MAP_SEED.locations) {
    const row = byId.get(seed.id);
    byId.delete(seed.id);
    if (row && row.archived && !includeArchived) continue;
    take(effective(seed, row));
  }
  // Whatever is left has no seed behind it: places the DM added. A row whose seed entry was later
  // removed from the file lands here too, which is the right outcome — it keeps working.
  for (const row of byId.values()) take(effective(null, row));
  return out;
}

const SLUG = /^[a-z0-9-]{1,48}$/;
// Note the null check: JSON.stringify writes NaN as null, and Number(null) is 0, so a client that
// lost track of where it was pointing would otherwise land a place on the northwest corner.
const given = v => v !== null && v !== undefined && v !== "";
const onMap = (x, y) => Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= 100 && y >= 0 && y <= 48;
const slugOrNull = v => { const s = String(v ?? "").trim().toLowerCase(); return SLUG.test(s) ? s : null; };
const textOrNull = (v, max) => { const s = String(v ?? "").trim(); return s ? s.slice(0, max) : null; };

// Ids are made from the name so a glance at the database still reads like a map. A collision with
// the seed or with another custom place takes a numeric tail rather than silently overwriting.
async function freeId(name) {
  const stem = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "place";
  const { rows } = await db.query("SELECT id FROM map_locations WHERE id = $1 OR id LIKE $2", [stem, stem + "-%"]);
  const taken = new Set([...rows.map(r => r.id), ...MAP_BY_ID.keys()]);
  if (!taken.has(stem)) return stem;
  for (let n = 2; n < 999; n++) if (!taken.has(`${stem}-${n}`)) return `${stem}-${n}`;
  return `${stem}-${Date.now().toString(36)}`;
}

async function writeRow(cur) {
  const { rows } = await db.query(
    `INSERT INTO map_locations (id, x, y, placed, revealed, name, nation, kind, terrain, note, secret, custom, archived)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (id) DO UPDATE SET
       x = EXCLUDED.x, y = EXCLUDED.y, placed = EXCLUDED.placed, revealed = EXCLUDED.revealed,
       name = EXCLUDED.name, nation = EXCLUDED.nation, kind = EXCLUDED.kind,
       terrain = EXCLUDED.terrain, note = EXCLUDED.note, secret = EXCLUDED.secret,
       custom = EXCLUDED.custom, archived = EXCLUDED.archived, updated_at = now()
     RETURNING *`,
    [cur.id, cur.x, cur.y, cur.placed, cur.revealed, cur.name, cur.nation, cur.kind,
     cur.terrain, cur.note, cur.secret, cur.custom, cur.archived]);
  return rows[0];
}

// Answers 401 as JSON rather than redirecting: the page fetches this, and a login page parsed as
// JSON is a confusing way to be told you are signed out.
app.get("/map/locations.json", async (req, res) => {
  const user = await currentUser(req);
  if (!user) return res.status(401).json({ error: "Sign in first." });
  // Open to the table since 2026-10-23 (Juan). What a player gets is decided entirely by
  // mapLocationsFor: a secret place is withheld outright until the DM reveals it, and every
  // route that writes is behind requireDm, so this is a reading room for everyone but the DM.
  res.set("Cache-Control", "no-store").json({ locations: await mapLocationsFor(user) });
});

// Everything the DM has put away, so a mis-dropped pin is recoverable rather than gone.
app.get("/api/map/archived", requireUser, requireDm, async (req, res) => {
  const { rows } = await db.query("SELECT * FROM map_locations WHERE archived ORDER BY updated_at DESC");
  res.json({ locations: rows.map(r => effective(MAP_BY_ID.get(r.id), r)) });
});

// A new place the seed never had — a point of interest, a ruin, where the party is standing tonight.
app.post("/api/map/locations", requireUser, requireDm, async (req, res) => {
  const b = req.body || {};
  const name = textOrNull(b.name, 80);
  if (!name) return res.status(400).json({ error: "Give it a name." });
  if (!given(b.x) || !given(b.y)) return res.status(400).json({ error: "Say where it goes." });
  const x = Number(b.x), y = Number(b.y);
  if (!onMap(x, y)) return res.status(400).json({ error: "That is off the map." });

  const row = await writeRow({
    id: await freeId(name), x, y, placed: true, revealed: false,
    name,
    nation:  slugOrNull(b.nation) || "free",
    kind:    slugOrNull(b.kind) || "poi",
    terrain: b.terrain === "difficult" ? "difficult" : "open",
    note:    textOrNull(b.note, 4000),
    // Hidden unless the caller says otherwise — the default is the cautious one, because a place
    // revealed a session early cannot be un-revealed at the table.
    secret:  b.secret === undefined ? true : !!b.secret,
    custom:  true, archived: false,
  });
  res.status(201).json({ location: effective(null, row) });
});

// Editing one. The body carries only what changed; anything it leaves out is left exactly as it
// was, so rewriting a description never disturbs a coordinate and moving a pin never changes who
// can see it. Sending null for an overridable field hands it back to the seed.
app.put("/api/map/locations/:id", requireUser, requireDm, async (req, res) => {
  const id = req.params.id;
  const seed = MAP_BY_ID.get(id);
  const existing = (await db.query("SELECT * FROM map_locations WHERE id = $1", [id])).rows[0];
  if (!seed && !existing) return res.status(404).json({ error: "No such place." });

  const cur = existing || {
    id, x: seed.x, y: seed.y, placed: false, revealed: false,
    name: null, nation: null, kind: null, terrain: null, note: null, secret: null,
    custom: false, archived: false,
  };
  const b = req.body || {};
  let touched = false;

  if (b.x !== undefined || b.y !== undefined) {
    if (!given(b.x) || !given(b.y)) return res.status(400).json({ error: "Send both x and y." });
    const x = Number(b.x), y = Number(b.y);
    if (!onMap(x, y)) return res.status(400).json({ error: "That is off the map." });
    cur.x = x; cur.y = y; cur.placed = true; touched = true;
  }
  if (b.name !== undefined) {
    const n = textOrNull(b.name, 80);
    // A custom place has no seed to fall back on, so it may not be left nameless.
    if (!n && cur.custom) return res.status(400).json({ error: "Give it a name." });
    cur.name = n; touched = true;
  }
  if (b.nation  !== undefined) { cur.nation  = slugOrNull(b.nation); touched = true; }
  if (b.kind    !== undefined) { cur.kind    = slugOrNull(b.kind); touched = true; }
  if (b.terrain !== undefined) {
    cur.terrain = b.terrain === null ? null : (b.terrain === "difficult" ? "difficult" : "open");
    touched = true;
  }
  if (b.note     !== undefined) { cur.note     = textOrNull(b.note, 4000); touched = true; }
  if (b.secret   !== undefined) { cur.secret   = b.secret === null ? null : !!b.secret; touched = true; }
  if (b.revealed !== undefined) { cur.revealed = !!b.revealed; touched = true; }
  if (b.archived !== undefined) { cur.archived = !!b.archived; touched = true; }

  if (!touched) return res.status(400).json({ error: "Nothing to change." });
  const row = await writeRow(cur);
  res.json({ location: effective(seed, row) });
});

// Undoing a placement: drop the row and the place falls back to its gazetteer estimate — and to
// every other thing the file says about it. The seed is never edited, so there is always something
// to fall back to. A place the DM added has no seed behind it and would simply cease to exist, so
// that one is refused: archiving is how a custom place leaves.
app.delete("/api/map/locations/:id", requireUser, requireDm, async (req, res) => {
  const id = req.params.id;
  const seed = MAP_BY_ID.get(id);
  const existing = (await db.query("SELECT custom, archived FROM map_locations WHERE id = $1", [id])).rows[0];
  if (!seed && !existing) return res.status(404).json({ error: "No such place." });

  if (!seed || (existing && existing.custom)) {
    // A place the DM added has no seed to fall back on, so deleting the row deletes the place.
    // That is allowed, but only from the archive — two deliberate steps, never one slip.
    if (!existing || !existing.archived)
      return res.status(400).json({ error: "This one you added, so there is no seed to fall back to. Archive it first." });
    await db.query("DELETE FROM map_locations WHERE id = $1", [id]);
    return res.json({ deleted: id });
  }

  await db.query("DELETE FROM map_locations WHERE id = $1", [id]);
  res.json({ location: effective(seed, null) });
});

// ═══════════════════════════════════════════════════════════
//  THE CHARACTER SHEET
// ═══════════════════════════════════════════════════════════
// A character belongs to one account. Everything a player may set themselves travels in the
// `sheet` blob and is written by PUT /api/characters/:id; everything the rules put in the DM's
// hands is a column, and no player route touches one. That division is the whole security model
// here, and it is why the level is not simply a key in the JSON: this route takes the sheet
// wholesale, so a field inside it is a field a forged payload sets.
//
//   DM-009  only a DM may grant, set or roll back a level — and each granted level issues one
//           Honor and one Morality allocation (RES-10), which the player then spends
//   DM-02   Dream moves only by a campaign event the DM records
//   DM-05   Fate charges are granted by the DM; a player may spend one and nothing recharges

const SHEET_MAX = 16_000;   // one character's JSON. Generous for a sheet, far short of a payload.

// What the client is allowed to put in the blob. Anything else is dropped rather than rejected,
// so an older or newer page cannot fail a save over a key this server has not heard of.
const SHEET_KEYS = new Set([
  "ancestry", "class", "background", "scores", "saves", "skills", "skillAbility", "skillMisc",
  "saveMisc", "ac", "speed", "hitDice", "hp", "hpMax", "hpTemp", "wounds", "injuries",
  "exhaustion", "dreamExhaustion", "attuned", "attunementBonus", "senseSpent", "notes",
]);

const charRow = r => ({
  id: r.id, name: r.name, level: r.level, dream: r.dream, fate: r.fate,
  honorOrder: r.honor_order, honorChaos: r.honor_chaos,
  moralityGood: r.morality_good, moralityEvil: r.morality_evil,
  honorUnspent: r.honor_unspent, moralityUnspent: r.morality_unspent,
  sheet: safeJson(r.sheet),
  updatedAt: r.updated_at,
});
function safeJson(text) { try { return JSON.parse(text) || {}; } catch { return {}; } }

async function logEvent(characterId, actorId, action, detail, note = "") {
  await db.query(
    "INSERT INTO character_events (character_id, actor_id, action, detail, note) VALUES ($1, $2, $3, $4, $5)",
    [characterId, actorId, action, JSON.stringify(detail || {}), String(note || "").slice(0, 500)]);
}

// A DM may open any character in the campaign; everyone else only their own. Returns the row or
// null, so every route below gets the same answer to "may I touch this one".
async function charFor(user, id, { write = false } = {}) {
  const n = Number(id);
  if (!Number.isInteger(n)) return null;
  const { rows } = await db.query("SELECT * FROM characters WHERE id = $1", [n]);
  const row = rows[0];
  if (!row) return null;
  if (row.user_id === user.id) return row;
  // The DM reads everyone's, and writes only through the DM routes — never the player's save.
  if (user.role === "dm" && !write) return row;
  return null;
}

app.get("/api/characters", requireUser, async (req, res) => {
  const { rows } = await db.query(
    "SELECT * FROM characters WHERE user_id = $1 AND NOT archived ORDER BY id", [req.user.id]);
  res.json({ characters: rows.map(charRow) });
});

// The DM's view of the table — every player's characters, for granting levels and Fate.
app.get("/api/characters/all", requireUser, requireDm, async (req, res) => {
  const { rows } = await db.query(
    `SELECT c.*, u.display_name FROM characters c JOIN users u ON u.id = c.user_id
      WHERE NOT c.archived ORDER BY u.display_name, c.id`);
  res.json({ characters: rows.map(r => ({ ...charRow(r), userId: r.user_id, owner: r.display_name })) });
});

app.post("/api/characters", requireUser, async (req, res) => {
  const name = String(req.body?.name || "").trim().slice(0, 60) || "New character";
  const { rows } = await db.query(
    "INSERT INTO characters (user_id, name) VALUES ($1, $2) RETURNING *", [req.user.id, name]);
  await logEvent(rows[0].id, req.user.id, "created", { name });
  res.json({ character: charRow(rows[0]) });
});

app.get("/api/characters/:id", requireUser, async (req, res) => {
  const row = await charFor(req.user, req.params.id);
  if (!row) return res.status(404).json({ error: "No such character." });
  res.json({ character: charRow(row) });
});

// The player's save. Name and the sheet blob, and deliberately nothing else: a `level` or `dream`
// arriving in this body is ignored rather than honoured, which is the point of the whole split.
app.put("/api/characters/:id", requireUser, async (req, res) => {
  const row = await charFor(req.user, req.params.id, { write: true });
  if (!row) return res.status(404).json({ error: "No such character." });

  const name = String(req.body?.name ?? row.name).trim().slice(0, 60) || row.name;
  const incoming = req.body?.sheet;
  if (incoming != null && (typeof incoming !== "object" || Array.isArray(incoming)))
    return res.status(400).json({ error: "The sheet must be an object." });

  const clean = {};
  for (const [k, v] of Object.entries(incoming || {})) if (SHEET_KEYS.has(k)) clean[k] = v;
  const text = JSON.stringify(clean);
  if (text.length > SHEET_MAX) return res.status(400).json({ error: "That sheet is too large." });

  const { rows } = await db.query(
    "UPDATE characters SET name = $1, sheet = $2, updated_at = now() WHERE id = $3 RETURNING *",
    [name, text, row.id]);
  res.json({ character: charRow(rows[0]) });
});

app.post("/api/characters/:id/archive", requireUser, async (req, res) => {
  const row = await charFor(req.user, req.params.id, { write: true });
  if (!row) return res.status(404).json({ error: "No such character." });
  await db.query("UPDATE characters SET archived = true WHERE id = $1", [row.id]);
  await logEvent(row.id, req.user.id, "archived", {});
  res.json({ ok: true });
});

// ── The DM's routes ────────────────────────────────────────
// DM-009. A level change is one statement: the new level, and the allocations it owes. Going UP
// issues one Honor and one Morality point per level gained; a rollback takes back only what is
// still unspent, because points already spent are in the sub-scores and clawing them out would
// mean guessing which ones. The audit row records both levels either way.
app.put("/api/characters/:id/level", requireUser, requireDm, async (req, res) => {
  const row = await charFor(req.user, req.params.id);
  if (!row) return res.status(404).json({ error: "No such character." });
  const level = Number(req.body?.level);
  if (!Number.isInteger(level) || level < 1 || level > 20)
    return res.status(400).json({ error: "A level is 1 to 20." });

  const gained = level - row.level;
  if (!gained) return res.json({ character: charRow(row) });

  const honor = gained > 0 ? row.honor_unspent + gained : Math.max(0, row.honor_unspent + gained);
  const moral = gained > 0 ? row.morality_unspent + gained : Math.max(0, row.morality_unspent + gained);

  const { rows } = await db.query(
    `UPDATE characters SET level = $1, honor_unspent = $2, morality_unspent = $3, updated_at = now()
      WHERE id = $4 RETURNING *`, [level, honor, moral, row.id]);
  await logEvent(row.id, req.user.id, gained > 0 ? "level granted" : "level rolled back",
    { from: row.level, to: level, allocations: gained }, String(req.body?.note || ""));
  res.json({ character: charRow(rows[0]) });
});

// DM-02. Dream moves by a recorded campaign event and in no other way, so this route insists on
// a note: an increase with no event behind it is exactly what the ruling forbids.
app.put("/api/characters/:id/dream", requireUser, requireDm, async (req, res) => {
  const row = await charFor(req.user, req.params.id);
  if (!row) return res.status(404).json({ error: "No such character." });
  const dream = Number(req.body?.dream);
  if (!Number.isInteger(dream) || dream < 0 || dream > 30)
    return res.status(400).json({ error: "A Dream score is 0 to 30." });
  const note = String(req.body?.note || "").trim();
  if (dream !== row.dream && !note)
    return res.status(400).json({ error: "Name the campaign event — Dream moves only by one." });

  const { rows } = await db.query(
    "UPDATE characters SET dream = $1, updated_at = now() WHERE id = $2 RETURNING *", [dream, row.id]);
  await logEvent(row.id, req.user.id, "dream changed", { from: row.dream, to: dream }, note);
  res.json({ character: charRow(rows[0]) });
});

// DM-05. The only place a Fate charge is ever created.
app.put("/api/characters/:id/fate", requireUser, requireDm, async (req, res) => {
  const row = await charFor(req.user, req.params.id);
  if (!row) return res.status(404).json({ error: "No such character." });
  const fate = Number(req.body?.fate);
  if (!Number.isInteger(fate) || fate < 0 || fate > 20)
    return res.status(400).json({ error: "A Fate balance is 0 to 20." });
  const { rows } = await db.query(
    "UPDATE characters SET fate = $1, updated_at = now() WHERE id = $2 RETURNING *", [fate, row.id]);
  await logEvent(row.id, req.user.id, "fate set", { from: row.fate, to: fate }, String(req.body?.note || ""));
  res.json({ character: charRow(rows[0]) });
});

// ── The two things a player may do to a locked number ──────
// DM-04: the player calls Emphasis, with no DM approval step in front of it. The charge is spent
// here, atomically — the UPDATE's own WHERE is what stops a double submission spending two.
app.post("/api/characters/:id/fate/spend", requireUser, async (req, res) => {
  const row = await charFor(req.user, req.params.id, { write: true });
  if (!row) return res.status(404).json({ error: "No such character." });
  const { rows } = await db.query(
    "UPDATE characters SET fate = fate - 1 WHERE id = $1 AND fate > 0 RETURNING *", [row.id]);
  if (!rows[0]) return res.status(400).json({ error: "No Fate charges left — the DM grants them." });
  await logEvent(row.id, req.user.id, "fate spent", { from: row.fate, to: rows[0].fate },
    String(req.body?.note || ""));
  res.json({ fate: rows[0].fate, character: charRow(rows[0]) });
});

// RES-10: the player chooses within the axis, spending one of the allocations a level issued.
// Guarded the same way, so two clicks cannot spend one point twice.
const AXES = {
  order: ["honor_order", "honor_unspent"], chaos: ["honor_chaos", "honor_unspent"],
  good: ["morality_good", "morality_unspent"], evil: ["morality_evil", "morality_unspent"],
};
app.post("/api/characters/:id/allocate", requireUser, async (req, res) => {
  const row = await charFor(req.user, req.params.id, { write: true });
  if (!row) return res.status(404).json({ error: "No such character." });
  const pick = AXES[String(req.body?.into || "")];
  if (!pick) return res.status(400).json({ error: "Allocate into order, chaos, good or evil." });
  const [sub, pool] = pick;

  const { rows } = await db.query(
    `UPDATE characters SET ${sub} = ${sub} + 1, ${pool} = ${pool} - 1, updated_at = now()
      WHERE id = $1 AND ${pool} > 0 RETURNING *`, [row.id]);
  if (!rows[0]) return res.status(400).json({ error: "Nothing left to allocate on that axis." });
  await logEvent(row.id, req.user.id, "allocated", { into: req.body.into });
  res.json({ character: charRow(rows[0]) });
});

// DM-007: the history, for the player and the DM both. Secrets never enter it — every detail
// written above is a number or an axis name, so there is nothing here to filter.
app.get("/api/characters/:id/events", requireUser, async (req, res) => {
  const row = await charFor(req.user, req.params.id);
  if (!row) return res.status(404).json({ error: "No such character." });
  const { rows } = await db.query(
    `SELECT e.action, e.detail, e.note, e.at, u.display_name AS actor
       FROM character_events e LEFT JOIN users u ON u.id = e.actor_id
      WHERE e.character_id = $1 ORDER BY e.id DESC LIMIT 100`, [row.id]);
  res.json({ events: rows.map(r => ({ ...r, detail: safeJson(r.detail) })) });
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
function grimmDataFor(shifts, shackles) {
  const key = "s:" + [...shifts].sort().join(",") + "|b:" + [...shackles].sort().join(",");
  if (!dataCache.has(key)) {
    const data = { ...GRIMM_DATA, grimms: GRIMM_DATA.grimms.map(g => {
      const out = { ...g };
      if (!shifts.has(g.id)) out.shift = null;
      if (!shackles.has(g.id)) {
        out.shackle = null;
        // The Divine and Forbidden Forms are the Shackle Break's payload, not a separate feature:
        // twelve stat blocks that spell out the mechanic in full, each headed "Divine Form — Exalted
        // Servant". Withholding the rules while serving the forms would reveal it anyway, so they go
        // with it. The Base stat block of each soul stays — that is what the player uses every session.
        out.servants = (g.servants || []).map(s => ({ ...s, divine: null, forbidden: null }));
        // Same reasoning for a troop the Break calls: The Fallen Hero's statblock IS the payload of
        // White Rabbit's Shackle Break, and his note says so in its first paragraph. Serving him
        // while withholding the Break would hand the player the secret and keep the rules.
        out.troops = (g.troops || []).filter(t => t.secret !== "shackle");
      }
      if (!shifts.has(g.id)) out.troops = (out.troops || g.troops || []).filter(t => t.secret !== "shift");
      return out;
    }) };
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
  let shifts, shackles;
  if (user.role === "dm") {
    const all = new Set(GRIMM_DATA.grimms.map(g => g.id));
    shifts = all; shackles = all;
  } else {
    const { rows } = await db.query(
      "SELECT grimm_id, key FROM grimm_toggles WHERE key IN ('shift', 'shackle') AND enabled");
    shifts = new Set(rows.filter(r => r.key === "shift").map(r => r.grimm_id));
    shackles = new Set(rows.filter(r => r.key === "shackle").map(r => r.grimm_id));
  }
  res.type("application/javascript").set("Cache-Control", "no-store").send(grimmDataFor(shifts, shackles));
});

app.use("/grimms", express.static(path.join(ROOT, "grimms")));

// The World Map was DM-only while the pins were being set; it opened to the table on 2026-10-23
// (Juan). It still wants a session — the map is campaign material, not a public page — but the
// role check is gone, and what each account may READ is settled in mapLocationsFor rather than
// here. /map/locations.json is registered further up and has already answered by the time this
// runs, which is what keeps its refusal a JSON one.
app.use("/map", async (req, res, next) => {
  return (await currentUser(req)) ? next() : res.redirect("/");
});
app.use("/map", express.static(path.join(ROOT, "map")));

// "/" and "/index.html" are the same front page — an old bookmark or a hand-typed URL used to
// get Express's bare "Cannot GET /index.html" instead of the hub.
app.get(["/", "/index.html"], (req, res) => res.sendFile(path.join(ROOT, "index.html")));
app.get("/arcanum.html", (req, res) => res.sendFile(path.join(ROOT, "arcanum.html")));
app.get("/sheet.html", (req, res) => res.sendFile(path.join(ROOT, "sheet.html")));
// The Admin page. Served like any other page — it signs you in itself, and turns away anyone who
// isn't the DM. Every call it makes is behind requireDm, which is where the real boundary is.
app.get("/admin.html", (req, res) => res.sendFile(path.join(ROOT, "admin.html")));

app.use((err, req, res, next) => {
  if (!err.status || err.status >= 500) console.error(err);
  res.status(err.status || 500).json({ error: err.status ? "Bad request." : "Server error." });
});

app.listen(PORT, () => console.log(`Arcanum Veritas listening on :${PORT} — ${process.env.DATABASE_URL ? "Postgres" : "embedded database (.data/)"}`));
