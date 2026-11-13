// Arcanum Veritas server — serves the builder, signs players in, and hands each of them only the
// Cognitions the DM has granted. The Cognition JSON is never served as a static file.

import express from "express";
import { readFile, readdir } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openDb, migrate } from "./db.js";
import { hashPassword, verifyPassword, newToken, tokenHash } from "./auth.js";
// The character sheet's rules engine. The same file the browser imports, so the DM's party board and
// the player's own sheet cannot disagree about a death-save DC. It is pure — no DOM, no state.
import * as rules from "../sheet/js/rules.js";
// The party's plates, for the same reason: the DM's board shows the portrait a player chose, and
// the list of which painting sits behind which plate should exist once. Pure data and four
// functions — view.js re-exports these, but view.js touches the DOM and cannot be imported here.
import * as plates from "../sheet/js/plates.js";
// The effect-target menu and the rules for one seal's granted benefit. Lifted out of view.js for
// this exact reason: the Arcanum builder is plain <script> files that cannot import a module, so it
// asks for the list over the wire and the server is what answers.
import * as targets from "../sheet/js/targets.js";
// Reading a Fight Club compendium XML. The same module sheet/tools/build-srd.mjs uses offline, so a
// class the DM imports tonight is shaped exactly like the SRD classes that shipped with the repo.
import { convert as convertCompendium, KINDS as COMPENDIUM_KINDS } from "../sheet/js/fc5e.mjs";

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
// 20kb is the right ceiling for almost every request here, and the few that are legitimately larger
// declare their own parser further down (SHEET_JSON, IMPORT_JSON, BUNDLE_JSON).
//
// They have to be let PAST this one to reach it. `express.json()` parses the body where it is
// mounted, so a global parser in front of a route-level one is the only parser that ever runs: a
// body over the limit was rejected with a 413 here before the route it was addressed to was even
// matched, and the larger limit downstream never applied to anything. A whole character sheet and
// every compendium import were failing on it — silently, because the test fixtures are small.
const SMALL_JSON = express.json({ limit: "20kb" });
const BRINGS_OWN_PARSER = req =>
  (req.method === "PUT" && /^\/api\/characters\/\d+$/.test(req.path)) ||
  (req.method === "POST" && /^\/api\/compendium\/import(-bundle)?$/.test(req.path)) ||
  // The initiative board carries a portrait per combatant (INIT_JSON, 4mb). Twelve of those is
  // well past 20kb, and a board that 413s mid-fight is a board nobody trusts again.
  (req.method === "PUT" && req.path === "/api/initiative") ||
  (req.method === "POST" && req.path === "/api/initiative/encounters");
app.use((req, res, next) => (BRINGS_OWN_PARSER(req) ? next() : SMALL_JSON(req, res, next)));
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
async function grimmState() {
  const chains = (await db.query("SELECT grimm_id, chains FROM grimm_chains")).rows;
  const toggles = (await db.query("SELECT grimm_id, key, enabled FROM grimm_toggles")).rows;
  const out = {};
  for (const t of toggles) (out[t.grimm_id] = out[t.grimm_id] || {})[t.key] = !!t.enabled;
  return { chains: Object.fromEntries(chains.map(r => [r.grimm_id, r.chains])), toggles: out };
}
app.get("/api/grimms/state", requireUser, async (req, res) => res.json(await grimmState()));

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

// The accounts, with everything the Admin section says about them. A function rather than only a
// route because /overview answers with this too, and a second copy of nine joins is a second copy
// to get wrong.
async function adminUsers() {
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
  return users.map(u => ({
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
  }));
}
admin.get("/users", async (req, res) => res.json({ users: await adminUsers() }));

// Everything the Admin section needs to draw itself, in one call.
//
// It used to be five, awaited one after another as the page booted — the Cognition index, the Grimm
// state, the party board, the compendium summary and the accounts — so the page sat empty for the
// length of all five in series. They do not depend on each other, so they go together and in
// parallel. Every section still has its own endpoints for its own writes; this is only the arrival.
admin.get("/overview", async (req, res) => {
  const [users, party, grimms, compendium] = await Promise.all([
    adminUsers(),
    partyBoard(),
    grimmState(),
    db.query(`SELECT id, kind, name, source, ruleset FROM compendium_entries
               WHERE retired = false ORDER BY kind, name`).then(r => r.rows),
  ]);
  res.json({ cognitions: INDEX, users, party, grimms, compendium });
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
// A sheet is one `characters` row: a JSON blob the player owns, and beside it the handful of columns
// the DM owns. Everything derived — AC, the save DCs, the death-save DC the Wounds push up — is
// computed by sheet/js/rules.js, imported above, so the board the DM reads and the sheet the player
// reads can never disagree about a number.
//
// A full sheet with an inventory and a spellbook is bigger than the 20kb the global parser allows,
// so the two routes that carry one get their own.
const SHEET_JSON = express.json({ limit: "256kb" });

// The sheet a player may write is the JSON and the name. Nothing else: `level`, `dream`, `fate`, the
// four Honor/Morality sub-scores and the unspent allocations are the DM's, each with its own route.
// They are columns rather than keys inside `sheet` precisely so that a forged payload has nowhere to
// put them — the same reason a secret map pin is withheld instead of sent and hidden.
async function loadCharacter(id, user) {
  const n = parseInt(id, 10) || 0;
  const { rows } = await db.query(`SELECT * FROM characters WHERE id = $1`, [n]);
  const row = rows[0];
  if (!row) return null;
  if (row.user_id !== user.id && user.role !== "dm") return null;   // 404, not 403: the same answer
  return row;                                                        // a stranger gets for a row
}                                                                    // that does not exist

async function logEvent(characterId, actorId, action, detail = {}, note = "") {
  await db.query(
    `INSERT INTO character_events (character_id, actor_id, action, detail, note) VALUES ($1,$2,$3,$4,$5)`,
    [characterId, actorId, action, JSON.stringify(detail), String(note || "").slice(0, 2000)]);
}

const parseSheet = row => { try { return JSON.parse(row.sheet || "{}"); } catch { return {}; } };

// What the client gets: the DM's columns flattened into the shape rules.js expects, with the
// player's JSON underneath. `sheet` stays nested so a save can send it back untouched.
function publicCharacter(row) {
  return {
    id: row.id, ownerId: row.user_id, name: row.name,
    level: row.level, dream: row.dream, fate: row.fate,
    honor: { order: row.honor_order, chaos: row.honor_chaos },
    morality: { good: row.morality_good, evil: row.morality_evil },
    unspent: { honor: row.honor_unspent, morality: row.morality_unspent },
    version: row.version, archived: row.archived,
    updatedAt: row.updated_at,
    sheet: parseSheet(row),
  };
}

// The character as rules.js wants it: the DM's columns win over anything the JSON happens to hold,
// so a stale `level` left in an old save can never beat the column the DM set.
// `granted` is what another player's seal is doing to them. It comes from its own table rather than
// the sheet, so it has to be handed in — and it MUST be, or the board's AC and the player's sheet
// disagree about the same character, which is the one thing this function exists to prevent.
function forRules(row, granted = []) {
  const s = parseSheet(row);
  return {
    ...rules.blankCharacter(), ...s,
    abilities: { ...rules.blankCharacter().abilities, ...(s.abilities || {}), dream: row.dream },
    level: row.level, fate: row.fate,
    honor: { order: row.honor_order, chaos: row.honor_chaos },
    morality: { good: row.morality_good, evil: row.morality_evil },
    granted,
  };
}

// The condensed line the DM's party board reads: what matters mid-combat and nothing else. Computed
// here rather than in the browser so every card agrees, and so no part of a player's private notes
// rides along with it.
function partyCard(row, displayName, granted = []) {
  const ch = forRules(row, granted);
  const injuries = Array.isArray(ch.injuries) ? ch.injuries.length : 0;
  const unhealed = Array.isArray(ch.injuries) ? ch.injuries.filter(i => i && !i.healed).length : 0;
  const de = rules.dreamExhaustion(ch.dreamExhaustion);
  return {
    // userId so a card can hand you its player's page. There was no link from a character back to
    // an account before, which is most of why the board had to be a place of its own.
    id: row.id, userId: row.user_id, name: row.name, player: displayName, level: row.level,
    // The plate and the painting behind it, both relative to `sheet/` — the board prefixes them,
    // because this is the sheet's own catalogue and it is not the board's business where it sits.
    // Resolved here rather than on the board so the two can never disagree about which is which.
    portrait: ch.portrait || "", portraitArt: plates.artUrl(ch),
    pendingLevel: row.pending_level == null ? null : Number(row.pending_level),
    openUnlocks: Number(row.open_unlocks) || 0,
    classes: (Array.isArray(ch.classes) ? ch.classes : []).filter(x => x && x.name)
      .map(x => ({ name: String(x.name), level: Number(x.level) || 0, subclass: x.subclass || "" })),
    hp: ch.hp, maxHp: rules.maxHp(ch), tempHp: ch.tempHp,
    ac: rules.armorClass(ch), speed: rules.speed(ch), initiative: rules.initiative(ch),
    saveDc: rules.verumDC(ch), spellAttack: rules.sealAttackBonus(ch),
    dream: row.dream, dreamMod: rules.abilityModifier(ch, "dream"),
    passivePerception: rules.passiveScore(ch, "perception"),
    exhaustion: ch.exhaustion,
    dreamExhaustion: de.level, dreamExhaustionName: de.name, dreamPenalty: de.penalty,
    wounds: ch.wounds, injuries, unhealedInjuries: unhealed,
    deathSaveDC: rules.deathSaveDC(ch.wounds, unhealed),
    concentrationFloor: rules.concentrationDC(0, ch.wounds, unhealed),
    fate: row.fate,
    unspent: { honor: row.honor_unspent, morality: row.morality_unspent },
    conditions: Array.isArray(ch.conditions) ? ch.conditions : [],
    // ── What the row opens onto ──
    // The board used to send exactly what fitted on a card. A row that expands asks four more
    // questions of the same sheet — what are their numbers, what are they carrying, where are their
    // axes, what are they still owed — and every one of them is answered here, by the same engine,
    // rather than by the DM alt-tabbing to the player's own sheet.
    prof: rules.proficiencyBonus(row.level),
    abilities: Object.fromEntries(rules.ABILITIES.map(id => [id, {
      score: rules.abilityScore(ch, id),
      mod: rules.abilityModifier(ch, id),
      save: rules.saveTotal(ch, id),
      proficient: rules.saveProficient(ch, id),
    }])),
    hitDice: (({ pool, total, used, left }) => ({ pool, total, used, left }))(rules.hitDiceState(ch)),
    // The four sub-scores, their sums and the modifier each side of each axis is worth. A board that
    // showed Order 4 / Chaos 6 and left the DM to work out the +2 would be showing bookkeeping.
    honor: { order: row.honor_order, chaos: row.honor_chaos,
             total: rules.honorTotal({ order: row.honor_order, chaos: row.honor_chaos }),
             orderMod: rules.axisModifier({ order: row.honor_order, chaos: row.honor_chaos }, "order"),
             chaosMod: rules.axisModifier({ order: row.honor_order, chaos: row.honor_chaos }, "chaos") },
    morality: { good: row.morality_good, evil: row.morality_evil,
                total: rules.moralityTotal({ good: row.morality_good, evil: row.morality_evil }),
                goodMod: rules.axisModifier({ good: row.morality_good, evil: row.morality_evil }, "good"),
                evilMod: rules.axisModifier({ good: row.morality_good, evil: row.morality_evil }, "evil") },
    corruptionSave: rules.corruptionSaveModifier({
      order: row.honor_order, chaos: row.honor_chaos, good: row.morality_good, evil: row.morality_evil }),
    // The dice somebody handed them, the injuries by name, and what the DM has running on them —
    // each with the id its own control needs, so the row can take one away as well as show it.
    inspiration: rules.inspirationHeld(ch)
      .map(d => ({ id: d.id || "", die: d.die, rounds: d.rounds ?? null, why: d.why || "" })),
    injuryList: (Array.isArray(ch.injuries) ? ch.injuries : []).filter(Boolean).map((i, n) => ({
      id: i.id || "", name: i.name || `Injury ${n + 1}`, healed: !!i.healed, why: i.why || "" })),
    effects: granted.map(g => ({
      id: g.id ?? null, label: g.label, player: g.player || "", rounds: g.rounds ?? null,
      says: targets.benefitSays(g), fromDm: !g.player })),
    round: ch.round, inCombat: !!ch.inCombat,
    activeModifiers: (ch.modifiers || []).filter(m => m && m.active !== false).length,
    // What another player's seal is doing to them. Counted separately from their own modifiers
    // because the DM asking "why is their AC 21" wants to know it came from somebody else — and
    // `grantedFrom` names which seal and which caster, so the answer is on the card.
    granted: granted.length,
    grantedFrom: [...new Set(granted.map(g => `${g.label}${g.player ? ` (${g.player})` : ""}`))].join(", "),
    updatedAt: row.updated_at,
  };
}

const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const CHAR_NAME = /^.{1,60}$/;

app.get("/api/characters", requireUser, async (req, res) => {
  const { rows } = await db.query(
    `SELECT * FROM characters WHERE user_id = $1 AND archived = false ORDER BY id`, [req.user.id]);
  res.json({ characters: rows.map(publicCharacter) });
});

app.post("/api/characters", requireUser, async (req, res) => {
  const name = String(req.body?.name || "").trim();
  if (!CHAR_NAME.test(name)) return res.status(400).json({ error: "Give the character a name." });
  const { rows } = await db.query(
    `SELECT count(*)::int AS n FROM characters WHERE user_id = $1 AND archived = false`, [req.user.id]);
  // A guard against someone filling the table, not a rule about how many characters a player may
  // have — archived ones do not count, so retiring one always makes room.
  if (rows[0].n >= 24) return res.status(400).json({ error: "That is enough characters for one account. Archive one to make room." });
  // A new character starts at the blank sheet the engine defines, so the sheet and the tests always
  // agree about what "new" means — and Dream starts at 10 (DM-01), set here and nowhere else.
  const blank = rules.blankCharacter();
  const { rows: made } = await db.query(
    `INSERT INTO characters (user_id, name, dream, sheet) VALUES ($1,$2,$3,$4) RETURNING *`,
    [req.user.id, name, rules.DREAM_START, JSON.stringify({ ...blank, name })]);
  await logEvent(made[0].id, req.user.id, "character.created", { name });
  res.json({ character: publicCharacter(made[0]) });
});

// The DM's board. A function as well as a route because /api/admin/overview sends it with the
// first paint, and the board then polls this same shape on its own while it is open.
async function partyBoard() {
  // The open tokens ride along, so the board can say that a level has been allowed and is still
  // waiting to be taken — the difference between "they are level 12" and "they may become 13".
  const { rows } = await db.query(
    `SELECT c.*, u.display_name,
            (SELECT max(k.target_level) FROM character_unlocks k
              WHERE k.character_id = c.id AND k.kind = 'level' AND k.consumed_at IS NULL) AS pending_level,
            (SELECT count(*)::int FROM character_unlocks k
              WHERE k.character_id = c.id AND k.consumed_at IS NULL) AS open_unlocks
       FROM characters c JOIN users u ON u.id = c.user_id
      WHERE c.archived = false ORDER BY u.display_name, c.id`);

  // Every open granted effect at the table, in one query rather than one per card. They are handed
  // to the engine, not merely counted: a board that showed AC 10 beside a sheet showing AC 12 would
  // be worse than a board that said nothing at all.
  const { rows: fx } = await db.query(
    `SELECT e.id, e.character_id, e.label, e.formula, e.kind, e.payload, e.target, e.amount, e.rounds,
            e.concentration_group, fc.name AS caster_name
       FROM character_effects e
       LEFT JOIN characters fc ON fc.id = e.from_character_id
       JOIN characters c ON c.id = e.character_id
      WHERE c.archived = false AND e.ended_at IS NULL AND e.dismissed_at IS NULL
        AND e.applied_at IS NULL
      ORDER BY e.id`);
  const byCharacter = new Map();
  for (const r of fx) {
    if (!byCharacter.has(r.character_id)) byCharacter.set(r.character_id, []);
    byCharacter.get(r.character_id).push({
      // The id rides along so the board can END one. Everything else here is what the engine needs
      // to merge it; this is the one field that exists for the interface.
      id: r.id,
      label: r.label, formula: r.formula, player: r.caster_name || "",
      kind: r.kind || "modifier", payload: safeJson(r.payload),
      target: r.target, amount: r.amount, rounds: r.rounds,
      concentrationGroup: r.concentration_group,
    });
  }
  return rows.map(r => partyCard(r, r.display_name, byCharacter.get(r.id) || []));
}
// Registered BEFORE "/api/characters/:id", or ":id" would swallow "party" and answer 404 for the DM.
app.get("/api/characters/party", requireUser, requireDm, async (req, res) =>
  res.json({ party: await partyBoard() }));

app.get("/api/characters/:id", requireUser, async (req, res) => {
  const row = await loadCharacter(req.params.id, req.user);
  if (!row) return res.status(404).json({ error: "No such character." });
  res.json({ character: publicCharacter(row) });
});

// The player's save. Optimistic concurrency on `version`: a stale write is refused and handed the
// newer row rather than overwriting whatever the other tab or device already saved (CS-004).
app.put("/api/characters/:id", requireUser, SHEET_JSON, async (req, res) => {
  const row = await loadCharacter(req.params.id, req.user);
  if (!row) return res.status(404).json({ error: "No such character." });
  if (row.user_id !== req.user.id) return res.status(403).json({ error: "Not your character." });

  const { sheet, name, version } = req.body || {};
  if (sheet == null || typeof sheet !== "object" || Array.isArray(sheet))
    return res.status(400).json({ error: "That is not a sheet." });
  if (name != null && !CHAR_NAME.test(String(name).trim()))
    return res.status(400).json({ error: "Give the character a name." });
  if (!Number.isInteger(version))
    return res.status(400).json({ error: "Which version are you saving over?" });

  // Drop anything the DM owns, wherever the client put it. The columns are the truth; a key of the
  // same name inside the JSON is ignored rather than trusted, and never written back.
  const clean = { ...sheet };
  for (const k of ["level", "fate", "dream", "honor", "morality", "unspent"]) delete clean[k];

  const { rows } = await db.query(
    `UPDATE characters SET sheet = $1, name = COALESCE($2, name), version = version + 1,
            updated_at = now()
      WHERE id = $3 AND user_id = $4 AND version = $5
      RETURNING *`,
    [JSON.stringify(clean), name == null ? null : String(name).trim(), row.id, req.user.id, version]);

  // PGlite does not report row counts, so the RETURNING row is the only honest answer here.
  if (!rows[0]) {
    const { rows: now } = await db.query(`SELECT * FROM characters WHERE id = $1`, [row.id]);
    return res.status(409).json({
      error: "This sheet was saved somewhere else since you opened it.",
      character: now[0] ? publicCharacter(now[0]) : null,
    });
  }
  res.json({ character: publicCharacter(rows[0]) });
});

app.post("/api/characters/:id/archive", requireUser, async (req, res) => {
  const row = await loadCharacter(req.params.id, req.user);
  if (!row) return res.status(404).json({ error: "No such character." });
  if (row.user_id !== req.user.id && req.user.role !== "dm")
    return res.status(403).json({ error: "Not your character." });
  const archived = req.body?.archived !== false;
  // Archived, never deleted — the same bargain the map makes with a mis-dropped pin.
  await db.query(`UPDATE characters SET archived = $1, updated_at = now() WHERE id = $2`, [archived, row.id]);
  await logEvent(row.id, req.user.id, archived ? "character.archived" : "character.restored");
  res.json({ ok: true });
});

app.get("/api/characters/:id/events", requireUser, async (req, res) => {
  const row = await loadCharacter(req.params.id, req.user);
  if (!row) return res.status(404).json({ error: "No such character." });
  const { rows } = await db.query(
    `SELECT e.id, e.action, e.detail, e.note, e.at, u.display_name AS actor
       FROM character_events e LEFT JOIN users u ON u.id = e.actor_id
      WHERE e.character_id = $1 ORDER BY e.id DESC LIMIT 200`, [row.id]);
  res.json({ events: rows.map(r => ({ ...r, detail: safeJson(r.detail) })) });
});

// ── What only the DM may set ────────────────────────────────
// Level, Dream and Fate. Each writes its column, records the change with actor and before/after, and
// — for a level — issues the allocations and the unlock tokens that go with it.
//
// There are two ways a level moves, and they are different on purpose.
//
//   /level/allow  opens the NEXT level and changes nothing else. The player's sheet grows a LEVEL UP
//                 button, and the column rises when they press it — so the features, the subclass
//                 and the ASI are settled in the same breath as the number, rather than a sheet
//                 sitting at a level whose features nobody has filled in yet.
//   PUT /level    sets the column outright. It is the correction and the rollback (CS-066): a level
//                 typed in by hand, or taken back. It still issues a token per level gained, so the
//                 player is walked through what those levels brought; because the column is already
//                 there, spending that token adds the features without moving the number again.
app.put("/api/characters/:id/level", requireUser, requireDm, async (req, res) => {
  const row = await loadCharacter(req.params.id, req.user);
  if (!row) return res.status(404).json({ error: "No such character." });
  const { level, note } = req.body || {};
  if (!int(level, 1, 20)) return res.status(400).json({ error: "Level is 1 to 20." });

  const alloc = rules.levelAllocations(row.level, level);
  const { rows } = await db.query(
    `UPDATE characters SET level = $1,
            honor_unspent = honor_unspent + $2, morality_unspent = morality_unspent + $3,
            updated_at = now()
      WHERE id = $4 RETURNING *`, [level, alloc.honor, alloc.morality, row.id]);

  // One unlock token per level gained, so the advancement choices it opens can be spent exactly once.
  for (let i = 0; i < alloc.levels; i++)
    await db.query(
      `INSERT INTO character_unlocks (character_id, kind, note, target_level, granted_by)
       VALUES ($1,'level',$2,$3,$4)`,
      [row.id, `Level ${row.level + i + 1}`, row.level + i + 1, req.user.id]);

  // A rollback takes its unspent permissions with it. An open token for a level the character no
  // longer has on the way would otherwise sit there offering a LEVEL UP back to it.
  if (level < row.level)
    await db.query(
      `DELETE FROM character_unlocks
        WHERE character_id = $1 AND kind = 'level' AND consumed_at IS NULL AND target_level > $2`,
      [row.id, level]);

  await logEvent(row.id, req.user.id, "level.set",
    { from: row.level, to: level, allocations: alloc }, note);
  res.json({ character: publicCharacter(rows[0]), allocations: alloc });
});

// Open the next level without taking it. The level the token names is computed here rather than
// accepted from the request, so a DM cannot hand out level 20 by typo, and an open one is not
// re-issued — two LEVEL UP buttons for one level would be two levels.
app.post("/api/characters/:id/level/allow", requireUser, requireDm, async (req, res) => {
  const row = await loadCharacter(req.params.id, req.user);
  if (!row) return res.status(404).json({ error: "No such character." });
  if (row.level >= 20) return res.status(400).json({ error: "Level 20 is the last one." });

  const target = row.level + 1;
  const { rows: open } = await db.query(
    `SELECT id FROM character_unlocks
      WHERE character_id = $1 AND kind = 'level' AND consumed_at IS NULL AND target_level IS NOT NULL`,
    [row.id]);
  if (open[0])
    return res.status(400).json({ error: "A level is already waiting for this character to take it." });

  const { rows } = await db.query(
    `INSERT INTO character_unlocks (character_id, kind, note, target_level, granted_by)
     VALUES ($1,'level',$2,$3,$4) RETURNING id, kind, note, target_level, granted_at`,
    [row.id, `Level ${target}`, target, req.user.id]);
  await logEvent(row.id, req.user.id, "level.allowed",
    { to: target, unlockId: rows[0].id }, req.body?.note);
  res.json({ unlock: rows[0], targetLevel: target, character: publicCharacter(row) });
});

// Dream rises only through a special campaign event, and the event is the point: the note is what
// the DM is actually recording (DM-02, RES-03, APR-05). No increment is assumed.
app.put("/api/characters/:id/dream", requireUser, requireDm, async (req, res) => {
  const row = await loadCharacter(req.params.id, req.user);
  if (!row) return res.status(404).json({ error: "No such character." });
  const { dream, note } = req.body || {};
  if (!int(dream, 0, 40)) return res.status(400).json({ error: "Dream is 0 to 40." });
  // The ruling is that Dream moves only through a special campaign event (DM-02, RES-03), so the
  // event is not optional metadata — it is the thing being recorded. A change with nothing named
  // would leave a score nobody can account for six months later.
  // It reads as "Dream moves only by 1", which is not the rule and never was — any amount is
  // allowed, the EVENT is what is required.
  if (dream !== row.dream && !String(note || "").trim())
    return res.status(400).json({ error: "Name the campaign event — Dream only moves when one is recorded." });
  const { rows } = await db.query(
    `UPDATE characters SET dream = $1, updated_at = now() WHERE id = $2 RETURNING *`, [dream, row.id]);
  await logEvent(row.id, req.user.id, "dream.set", { from: row.dream, to: dream }, note);
  res.json({ character: publicCharacter(rows[0]) });
});

app.put("/api/characters/:id/fate", requireUser, requireDm, async (req, res) => {
  const row = await loadCharacter(req.params.id, req.user);
  if (!row) return res.status(404).json({ error: "No such character." });
  const { fate, note } = req.body || {};
  if (!int(fate, 0, 99)) return res.status(400).json({ error: "Fate is 0 to 99." });
  const { rows } = await db.query(
    `UPDATE characters SET fate = $1, updated_at = now() WHERE id = $2 RETURNING *`, [fate, row.id]);
  await logEvent(row.id, req.user.id, "fate.granted", { from: row.fate, to: fate }, note);
  res.json({ character: publicCharacter(rows[0]) });
});

// ── What the DM may set ON THE SHEET ────────────────────────
// Everything above writes a COLUMN the DM owns. The three routes below reach into the sheet JSON,
// which is the player's own document, and that is a deliberate exception rather than a loosening.
//
// The reason is the table. The DM is the one holding the damage roll, and a board that shows hit
// points but cannot change them is a board that gets read once and then replaced by "Rory, you're
// on 38" shouted across the room. Wounds, Exhaustion and a condition are adjudications — the DM
// decides them out loud and then somebody has to type them.
//
// So it is narrow, and the narrowness is the design:
//
//   * A WHITELIST of keys, each bounded by the engine's own constants. A key not named here is a
//     400, never a silent no-op — a typo should fail loudly rather than look like it worked.
//   * `version` is bumped, so a player with that sheet open is TOLD it changed somewhere else and
//     offered the server's copy, instead of quietly saving their stale hit points back over it
//     (CS-004). This is also why the sheet's own poller re-reads these keys: see store.js.
//   * Every change lands in character_events with the actor, the before and the after, exactly as
//     a level or a Dream score does. Nothing the DM does here is anonymous.
//
// What is NOT reachable from here, on purpose: abilities, classes, the inventory, the spellbook,
// the journal — anything that is a player's authorship rather than a table adjudication.
const vitalStr = (v, n) => String(v ?? "").trim().slice(0, n);
const vitalId = (v, prefix) => vitalStr(v, 40) || `${prefix}:${randomBytes(4).toString("hex")}`;

// A condition keeps its engine id when it names one of the campaign's four rewritten conditions, so
// the sheet does not stack a rewritten condition on its 5e namesake (RES-08). Anything else is a
// free-text condition, which is what the sheet's own "+ condition" writes.
const cleanConditions = list => (Array.isArray(list) ? list : []).map(c => {
  const raw = typeof c === "string" ? { name: c } : (c || {});
  const known = rules.CONDITIONS[vitalStr(raw.id, 40)] || rules.CONDITIONS[vitalStr(raw.name, 40).toLowerCase()];
  const name = vitalStr(known ? known.name : raw.name, 40);
  if (!name) return null;
  return { id: known ? known.id : vitalId(raw.id, "x"), name };
}).filter(Boolean).slice(0, 24);

// An injury is a named thing that heals, not a counter: the DCs read the UNHEALED ones, and the
// sheet's own list is what the player reads back later.
const cleanInjuries = list => (Array.isArray(list) ? list : []).map(i => {
  if (!i || typeof i !== "object") return null;
  return { id: vitalId(i.id, "inj"), name: vitalStr(i.name, 80) || "Injury",
           why: vitalStr(i.why, 160), healed: !!i.healed };
}).filter(Boolean).slice(0, 24);

// `{ id, die, rounds, why, active }` — the shape rules.js counts down through tickTimed with the
// modifiers and the turn grants. `rounds: null` means until used, which is what a DM's nod is.
const cleanInspiration = list => (Array.isArray(list) ? list : []).map(d => {
  const die = vitalStr(d?.die, 4);
  if (!rules.INSPIRATION_DICE.includes(die)) return null;
  return { id: vitalId(d?.id, "insp"), die,
           rounds: int(d?.rounds, 1, 100) ? d.rounds : null,
           why: vitalStr(d?.why, 60), active: d?.active !== false };
}).filter(Boolean).slice(0, 12);

// The eight keys above, read back. This is what makes the board's writes ARRIVE: a player's sheet
// holds its own JSON and never re-reads it, so without this a DM's "you're on 38" would sit in the
// database until the player reloaded, and their next autosave would be a conflict rather than a
// correction. Small on purpose — it is polled beside the unlocks and the granted effects, and the
// one thing it must not do is send a whole sheet every five seconds.
//
// `version` is here so the client can tell "nothing has changed" from "something has", without
// comparing eight values itself. Not DM-only: it is the player's OWN sheet they are reading.
// `round` and `inCombat` joined them when the initiative board became the table's clock: the DM's
// "next round" writes them onto every sheet (POST /api/initiative/clock) and each sheet picks the
// new round up here, on the poll it was already making, and runs its own expiry. The sheet's own
// button still works and is still the player's — this is a second hand on the same clock, not a
// replacement for it.
const VITAL_KEYS = ["hp", "tempHp", "wounds", "exhaustion", "dreamExhaustion",
                    "conditions", "injuries", "inspiration", "round", "inCombat"];

app.get("/api/characters/:id/vitals", requireUser, async (req, res) => {
  const row = await loadCharacter(req.params.id, req.user);
  if (!row) return res.status(404).json({ error: "No such character." });
  const sheet = parseSheet(row);
  res.json({
    version: row.version,
    vitals: Object.fromEntries(VITAL_KEYS.map(k => [k, sheet[k] ?? null])),
  });
});

app.put("/api/characters/:id/vitals", requireUser, requireDm, async (req, res) => {
  const row = await loadCharacter(req.params.id, req.user);
  if (!row) return res.status(404).json({ error: "No such character." });

  const patch = req.body?.vitals;
  if (!patch || typeof patch !== "object" || Array.isArray(patch))
    return res.status(400).json({ error: "Nothing to set." });

  const sheet = parseSheet(row);
  // Bounded by what the engine says the sheet's own maximum is — modifiers and granted effects
  // included, so a Bless that raised the ceiling raises what may be typed into it.
  const top = Math.max(1, rules.maxHp(forRules(row)));
  const next = {}, before = {};

  for (const [key, value] of Object.entries(patch)) {
    switch (key) {
      case "hp":
        if (!int(value, 0, top)) return res.status(400).json({ error: `Hit points are 0 to ${top}.` });
        next.hp = value; break;
      case "tempHp":
        if (!int(value, 0, 999)) return res.status(400).json({ error: "Temporary hit points are 0 to 999." });
        next.tempHp = value; break;
      case "wounds":
        if (!int(value, 0, 20)) return res.status(400).json({ error: "Wounds are 0 to 20." });
        next.wounds = value; break;
      case "exhaustion":
        if (!int(value, 0, 6)) return res.status(400).json({ error: "Exhaustion is 0 to 6." });
        next.exhaustion = value; break;
      case "dreamExhaustion":
        if (!int(value, 0, rules.DREAM_EXHAUSTION_MAX))
          return res.status(400).json({ error: `Dream Exhaustion is 0 to ${rules.DREAM_EXHAUSTION_MAX}.` });
        next.dreamExhaustion = value; break;
      case "conditions":
        if (!Array.isArray(value)) return res.status(400).json({ error: "Conditions are a list." });
        next.conditions = cleanConditions(value); break;
      case "injuries":
        if (!Array.isArray(value)) return res.status(400).json({ error: "Injuries are a list." });
        next.injuries = cleanInjuries(value); break;
      case "inspiration":
        if (!Array.isArray(value)) return res.status(400).json({ error: "Inspiration is a list of dice." });
        next.inspiration = cleanInspiration(value); break;
      default:
        return res.status(400).json({ error: `The board does not set "${vitalStr(key, 40)}".` });
    }
    before[key] = sheet[key] ?? null;
  }

  const { rows } = await db.query(
    `UPDATE characters SET sheet = $1, version = version + 1, updated_at = now()
      WHERE id = $2 RETURNING *`, [JSON.stringify({ ...sheet, ...next }), row.id]);
  await logEvent(row.id, req.user.id, "vitals.set", { before, after: next }, req.body?.note);
  res.json({ character: publicCharacter(rows[0]) });
});

// Honor and Morality, set outright. `allocate` above is the player spending one point inside an
// axis, one at a time, from what a level issued; this is the DM writing the score — a campaign
// event that cost somebody three Order, or a number being brought in line with the paper sheet.
// The unspent counters are settable for the same reason: an allocation granted by mistake has to be
// takeable back without inventing an event to spend it on.
app.put("/api/characters/:id/axes", requireUser, requireDm, async (req, res) => {
  const row = await loadCharacter(req.params.id, req.user);
  if (!row) return res.status(404).json({ error: "No such character." });

  const COLUMN = { order: "honor_order", chaos: "honor_chaos",
                   good: "morality_good", evil: "morality_evil",
                   honorUnspent: "honor_unspent", moralityUnspent: "morality_unspent" };
  const axes = req.body?.axes;
  if (!axes || typeof axes !== "object" || Array.isArray(axes))
    return res.status(400).json({ error: "Nothing to set." });

  const sets = [], vals = [], before = {}, after = {};
  for (const [key, value] of Object.entries(axes)) {
    const col = COLUMN[key];
    if (!col) return res.status(400).json({ error: `Not an axis: "${vitalStr(key, 40)}".` });
    if (!int(value, 0, 99)) return res.status(400).json({ error: "An axis is 0 to 99." });
    vals.push(value);
    sets.push(`${col} = $${vals.length}`);
    before[key] = row[col]; after[key] = value;
  }
  if (!sets.length) return res.status(400).json({ error: "Nothing to set." });

  vals.push(row.id);
  const { rows } = await db.query(
    `UPDATE characters SET ${sets.join(", ")}, updated_at = now()
      WHERE id = $${vals.length} RETURNING *`, vals);
  await logEvent(row.id, req.user.id, "axes.set", { before, after }, req.body?.note);
  res.json({ character: publicCharacter(rows[0]) });
});

// A benefit the DM hands somebody directly — an aura, a blessing, a ruling that lasts three rounds.
// It is the SAME row a player's seal makes, through the same contract in targets.js, with no caster
// behind it: `from_character_id` is null and the board says "the DM" where a cast says a name.
//
// Written this way rather than as a sheet patch for the reason the whole effects table exists: an
// ongoing bonus read from outside the sheet never races the player's autosave, and it can be ended
// later by one row going quiet instead of a second patch that has to remember what it changed.
app.post("/api/characters/:id/effects", requireUser, requireDm, async (req, res) => {
  const row = await loadCharacter(req.params.id, req.user);
  if (!row) return res.status(404).json({ error: "No such character." });

  const label = String(req.body?.label || "").trim().slice(0, 60);
  if (!label) return res.status(400).json({ error: "Name it — that name is what their sheet shows." });

  const benefits = targets.cleanBenefits(req.body?.benefits);
  if (!benefits.length) return res.status(400).json({ error: "That grants nothing." });
  // Resolved against the RECIPIENT. A derivation means "the caster's own modifier" and there is no
  // caster here, so what the DM writes is a flat number and this only freezes it.
  const resolved = benefits.map(b => targets.resolveBenefit(forRules(row), b))
    .filter(b => !targets.benefitIsEmpty(b));
  if (!resolved.length) return res.status(400).json({ error: "That works out to nothing right now." });

  const group = `dm-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;
  const made = [];
  for (const b of resolved) {
    const { rows } = await db.query(
      `INSERT INTO character_effects
         (character_id, from_character_id, from_user_id, label, formula, note,
          kind, payload, target, amount, rounds, concentration_group)
       VALUES ($1,NULL,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [row.id, req.user.id, label, b.formula, b.note,
       b.kind, JSON.stringify(b.payload || {}), b.target, b.amount, b.rounds, group]);
    made.push(rows[0].id);
    await logEvent(row.id, req.user.id, "effect.granted",
      { effectId: rows[0].id, label, from: "the DM", kind: b.kind,
        says: targets.benefitSays(b), rounds: b.rounds, group }, req.body?.note);
  }
  res.json({ granted: made.length, group });
});

// ── What the player may spend ───────────────────────────────
// A Fate use. The player calls it — there is no approval gate (DM-04) — but the charge is spent
// server-side, once, and the balance can never go below zero or be restored by anything here.
//
// `useId` is generated by the sheet before it asks, and it is the whole idempotency story: the
// primary key on character_fate_spends refuses the second arrival of the same use, so a retry, a
// double tap or a reload mid-request costs one charge rather than two.
app.post("/api/characters/:id/fate/spend", requireUser, async (req, res) => {
  const row = await loadCharacter(req.params.id, req.user);
  if (!row) return res.status(404).json({ error: "No such character." });
  if (row.user_id !== req.user.id) return res.status(403).json({ error: "Not your character." });

  const useId = String(req.body?.useId || "");
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(useId))
    return res.status(400).json({ error: "That Fate use has no id." });

  const { rows: already } = await db.query(
    `SELECT balance_after FROM character_fate_spends WHERE use_id = $1 AND character_id = $2`,
    [useId, row.id]);
  if (already[0]) return res.json({ fate: already[0].balance_after, repeated: true });

  // Atomic, and the guard is in the predicate: a balance of zero matches nothing and spends nothing.
  const { rows: spent } = await db.query(
    `UPDATE characters SET fate = fate - 1, updated_at = now()
      WHERE id = $1 AND user_id = $2 AND fate > 0 RETURNING fate`, [row.id, req.user.id]);
  if (!spent[0]) return res.status(400).json({ error: "You have no Fate to spend." });

  await db.query(
    `INSERT INTO character_fate_spends (use_id, character_id, balance_after) VALUES ($1,$2,$3)`,
    [useId, row.id, spent[0].fate]);
  // Both faces, the ties that were rerolled and the selected result are the player's to report; the
  // narrative retcon is the DM's to write, and neither is a precondition of the charge (FD-03).
  await logEvent(row.id, req.user.id, "fate.spent", {
    useId, balanceAfter: spent[0].fate,
    emphasis: req.body?.emphasis ?? null, original: req.body?.original ?? null,
  }, req.body?.note);
  res.json({ fate: spent[0].fate });
});

// Spending one of the allocations a granted level issued. The player chooses within the axis; a DM
// may also assign it. Single-use: the counter is decremented in the same statement that reads it.
app.post("/api/characters/:id/allocate", requireUser, async (req, res) => {
  const row = await loadCharacter(req.params.id, req.user);
  if (!row) return res.status(404).json({ error: "No such character." });
  if (row.user_id !== req.user.id && req.user.role !== "dm")
    return res.status(403).json({ error: "Not your character." });

  const axis = String(req.body?.axis || "");
  const COLUMN = { order: ["honor_order", "honor_unspent"], chaos: ["honor_chaos", "honor_unspent"],
                   good: ["morality_good", "morality_unspent"], evil: ["morality_evil", "morality_unspent"],
                   law: ["honor_order", "honor_unspent"] };
  const pair = COLUMN[axis];
  if (!pair) return res.status(400).json({ error: "Order, Chaos, Good or Evil." });
  const [score, unspent] = pair;

  const { rows } = await db.query(
    `UPDATE characters SET ${score} = ${score} + 1, ${unspent} = ${unspent} - 1, updated_at = now()
      WHERE id = $1 AND ${unspent} > 0 RETURNING *`, [row.id]);
  if (!rows[0]) return res.status(400).json({ error: "No allocation left to spend." });
  await logEvent(row.id, req.user.id, "axis.allocated", { axis, column: score }, req.body?.note);
  res.json({ character: publicCharacter(rows[0]) });
});

// ── Unlocks: the DM opens an advancement, the player spends it ──
app.get("/api/characters/:id/unlocks", requireUser, async (req, res) => {
  const row = await loadCharacter(req.params.id, req.user);
  if (!row) return res.status(404).json({ error: "No such character." });
  const { rows } = await db.query(
    `SELECT id, kind, note, target_level, granted_at, consumed_at, choice FROM character_unlocks
      WHERE character_id = $1 ORDER BY id DESC`, [row.id]);
  res.json({ unlocks: rows.map(r => ({ ...r, choice: safeJson(r.choice) })) });
});

app.post("/api/characters/:id/unlocks", requireUser, requireDm, async (req, res) => {
  const row = await loadCharacter(req.params.id, req.user);
  if (!row) return res.status(404).json({ error: "No such character." });
  const kind = String(req.body?.kind || "");
  if (!["level", "asi", "feat"].includes(kind))
    return res.status(400).json({ error: "An unlock is a level, an asi or a feat." });
  const { rows } = await db.query(
    `INSERT INTO character_unlocks (character_id, kind, note, granted_by) VALUES ($1,$2,$3,$4)
     RETURNING id, kind, note, granted_at`,
    [row.id, kind, String(req.body?.note || "").slice(0, 200), req.user.id]);
  await logEvent(row.id, req.user.id, "unlock.granted", { kind, unlockId: rows[0].id }, req.body?.note);
  res.json({ unlock: rows[0] });
});

app.post("/api/characters/:id/unlocks/:unlockId/consume", requireUser, async (req, res) => {
  const row = await loadCharacter(req.params.id, req.user);
  if (!row) return res.status(404).json({ error: "No such character." });
  if (row.user_id !== req.user.id) return res.status(403).json({ error: "Not your character." });
  const choice = req.body?.choice;
  if (choice != null && (typeof choice !== "object" || Array.isArray(choice)))
    return res.status(400).json({ error: "That is not a choice." });
  // `consumed_at IS NULL` in the predicate is what makes an unlock single-use.
  const { rows } = await db.query(
    `UPDATE character_unlocks SET consumed_at = now(), choice = $1
      WHERE id = $2 AND character_id = $3 AND consumed_at IS NULL
      RETURNING id, kind, note, target_level, choice`,
    [JSON.stringify(choice || {}), parseInt(req.params.unlockId, 10) || 0, row.id]);
  if (!rows[0]) return res.status(400).json({ error: "That unlock is already spent." });

  // A level token is the player's permission to take the level the DM opened, so taking it moves the
  // column — the one path by which a level rises other than the DM setting it outright. The guard is
  // in the predicate: `level = target - 1` means a token applies only from the level below it, so two
  // tokens granted at once land in order, and a token for a level the character already has (a DM
  // correction, a reload mid-request) raises nothing and issues no allocations.
  let character = publicCharacter(row);
  let allocations = { honor: 0, morality: 0, levels: 0 };
  const target = Number(rows[0].target_level) || 0;
  if (rows[0].kind === "level" && int(target, 1, 20)) {
    const { rows: raised } = await db.query(
      `UPDATE characters SET level = $1,
              honor_unspent = honor_unspent + 1, morality_unspent = morality_unspent + 1,
              updated_at = now()
        WHERE id = $2 AND level = $3 RETURNING *`, [target, row.id, target - 1]);
    if (raised[0]) {
      character = publicCharacter(raised[0]);
      allocations = rules.levelAllocations(target - 1, target);
      await logEvent(row.id, req.user.id, "level.taken",
        { from: target - 1, to: target, unlockId: rows[0].id, allocations }, req.body?.note);
    }
  }

  await logEvent(row.id, req.user.id, "unlock.consumed",
    { unlockId: rows[0].id, kind: rows[0].kind, targetLevel: target || null, choice });
  res.json({ unlock: { ...rows[0], choice: safeJson(rows[0].choice) }, character, allocations });
});

function safeJson(t) { try { return JSON.parse(t || "{}"); } catch { return {}; } }

// ── What one player's seal does to another's character ──────────────────
// A seal carries what it grants, written in the builder and saved with the build. Casting it at the
// party lands one row per target per benefit, and the recipient's sheet is never touched: see the
// note on `character_effects` in db.js for why that is the whole design.
//
// The menu the builder writes a benefit against. Served rather than bundled so that the one list a
// target can be applied from is the one list it can be offered from — the builder cannot import the
// engine, and a hand-copied list is how a seal ends up granting a row the sheet does not have.
app.get("/api/mod-targets", requireUser, (req, res) => res.json({
  targets: targets.MOD_TARGETS,
  rounds: targets.BENEFIT_ROUNDS,
  max: targets.BENEFITS_MAX,
  // Everything else a benefit may be, and the vocabulary each kind picks from. Served for the same
  // reason the targets are: the builder cannot import the engine, and a hand-copied list of damage
  // types is how a seal ends up granting resistance to something that does not exist.
  kinds: targets.BENEFIT_KINDS,
  damageTypes: rules.DAMAGE_TYPES.map(d => ({ id: d.id, name: d.name })),
  standings: [{ id: "resistant", name: "resistant to" }, { id: "immune", name: "immune to" }],
  turnKinds: rules.TURN_KINDS,
  // The four conditions this campaign REWROTE, and the Inspiration dice. Here for the same reason
  // as everything above it: the Admin board hands these out from a row, it is a plain script that
  // cannot import rules.js, and a hand-copied list is how a board ends up writing a condition id
  // the sheet has no text for. The standard conditions are not listed — they work as printed, and
  // the board writes those as free text, exactly as the sheet's own "+ condition" does.
  conditions: Object.values(rules.CONDITIONS).map(c => ({ id: c.id, name: c.name, note: c.note || "" })),
  inspirationDice: rules.INSPIRATION_DICE,
}));

// Who may be granted to. The player's answer to the DM's party board, and deliberately much
// thinner: names and faces, no stats. A DM's own characters are not on it — they are the NPCs and
// the monsters, and a player's seal does not reach them from here.
const GRANTABLE = `FROM characters c JOIN users u ON u.id = c.user_id
                   WHERE c.archived = false AND u.role <> 'dm'`;

app.get("/api/party/roster", requireUser, async (req, res) => {
  const { rows } = await db.query(
    `SELECT c.id, c.name, c.user_id, u.display_name, c.sheet ${GRANTABLE} ORDER BY u.display_name, c.id`);
  res.json({ roster: rows.map(r => {
    const s = safeJson(r.sheet);
    return { id: r.id, name: r.name, player: r.display_name,
             portrait: s.portrait || "", mine: r.user_id === req.user.id };
  }) });
});

const CAST_TARGETS_MAX = 8;

// One cast: one caster, up to eight targets, up to six benefits, one concentration group so that
// dropping it ends every row the cast made at once.
app.post("/api/effects", requireUser, async (req, res) => {
  const casterId = parseInt(req.body?.fromCharacterId, 10) || 0;
  const { rows: mine } = await db.query(
    `SELECT * FROM characters WHERE id = $1 AND user_id = $2 AND archived = false`,
    [casterId, req.user.id]);
  const caster = mine[0];
  if (!caster) return res.status(403).json({ error: "That is not your character." });

  const label = String(req.body?.label || "").trim().slice(0, 60);
  if (!label) return res.status(400).json({ error: "A cast needs the seal's name." });

  // Cleaned against the engine's own list, so a hand-edited save cannot put a row the sheet could
  // not apply into somebody else's modifiers.
  const benefits = targets.cleanBenefits(req.body?.benefits);
  if (!benefits.length) return res.status(400).json({ error: "That seal grants nothing." });

  const ids = [...new Set((Array.isArray(req.body?.targets) ? req.body.targets : [])
    .map(n => parseInt(n, 10) || 0).filter(Boolean))];
  if (!ids.length) return res.status(400).json({ error: "Choose who it lands on." });
  if (ids.length > CAST_TARGETS_MAX)
    return res.status(400).json({ error: `One cast reaches ${CAST_TARGETS_MAX} characters.` });

  // Every target has to be grantable on its own terms — not archived, and not the DM's.
  const { rows: ok } = await db.query(
    `SELECT c.id, c.name ${GRANTABLE} AND c.id = ANY($1::int[])`, [ids]);
  if (ok.length !== ids.length)
    return res.status(400).json({ error: "One of those isn't a character you can grant to." });

  // Resolved against the CASTER, once, here. A benefit worth "my Dream modifier" is worth the
  // caster's Dream modifier on every sheet it lands on, and goes on being worth it after the caster
  // levels, or drops, or dies.
  const casterSheet = forRules(caster);
  const resolved = benefits.map(b => targets.resolveBenefit(casterSheet, b))
    .filter(b => !targets.benefitIsEmpty(b));
  if (!resolved.length) return res.status(400).json({ error: "Every one of those works out to zero right now." });

  const group = `cast-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;
  const made = [];
  for (const t of ok) for (const b of resolved) {
    const { rows } = await db.query(
      `INSERT INTO character_effects
         (character_id, from_character_id, from_user_id, label, formula, note,
          kind, payload, target, amount, rounds, concentration_group)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [t.id, caster.id, req.user.id, label, b.formula, b.note,
       b.kind, JSON.stringify(b.payload || {}), b.target, b.amount, b.rounds, group]);
    made.push(rows[0].id);
    // On the RECIPIENT's log, because that is the sheet it changed — and the one whose player will
    // be asking in six weeks where the +2 came from.
    await logEvent(t.id, req.user.id, "effect.granted",
      { effectId: rows[0].id, label, from: caster.name, kind: b.kind,
        says: targets.benefitSays(b), rounds: b.rounds, group });
  }
  res.json({ granted: made.length, group, targets: ok.map(t => t.name) });
});

const publicEffect = r => ({
  id: r.id, label: r.label, formula: r.formula, note: r.note,
  kind: r.kind || "modifier", payload: safeJson(r.payload),
  target: r.target, amount: r.amount, rounds: r.rounds,
  concentrationGroup: r.concentration_group,
  player: r.caster_name || "", fromCharacterId: r.from_character_id,
  grantedAt: r.granted_at, appliedAt: r.applied_at || null,
});

// What is on me right now. The recipient's own sheet polls this beside its unlocks.
//
// A one-time grant that has been taken (`applied_at`) is left out: it is spent, and the sheet it
// landed on has the hit points to show for it. An ongoing one stays until it ends or is dropped.
app.get("/api/characters/:id/effects", requireUser, async (req, res) => {
  const row = await loadCharacter(req.params.id, req.user);
  if (!row) return res.status(404).json({ error: "No such character." });
  const { rows } = await db.query(
    `SELECT e.*, c.name AS caster_name FROM character_effects e
       LEFT JOIN characters c ON c.id = e.from_character_id
      WHERE e.character_id = $1 AND e.ended_at IS NULL AND e.dismissed_at IS NULL
        AND e.applied_at IS NULL
      ORDER BY e.id`, [row.id]);
  res.json({ effects: rows.map(publicEffect) });
});

// Taking a one-time grant: healing, or temporary hit points. The recipient's OWN client writes the
// hit points to their own sheet — this only records that the offer is spent, so the same heal
// cannot be taken twice and the table can see afterwards what it was worth.
//
// `applied_at IS NULL` in the predicate is the whole mechanism, exactly as `consumed_at` is for an
// unlock: a double tap or a retried request finds nothing to update and changes nothing.
app.post("/api/effects/:id/apply", requireUser, async (req, res) => {
  const id = parseInt(req.params.id, 10) || 0;
  const { rows: found } = await db.query(
    `SELECT e.*, c.user_id AS owner_id FROM character_effects e
       JOIN characters c ON c.id = e.character_id WHERE e.id = $1`, [id]);
  const e = found[0];
  if (!e) return res.status(404).json({ error: "No such effect." });
  if (e.owner_id !== req.user.id)
    return res.status(403).json({ error: "That is not yours to take." });
  if (e.kind !== "heal" && e.kind !== "tempHp")
    return res.status(400).json({ error: "That one is not something you take — it is already on you." });

  const note = String(req.body?.note || "").slice(0, 80);
  const { rows } = await db.query(
    `UPDATE character_effects SET applied_at = now(), applied_note = $1
      WHERE id = $2 AND applied_at IS NULL AND ended_at IS NULL AND dismissed_at IS NULL
      RETURNING id`, [note, id]);
  if (!rows[0]) return res.status(400).json({ error: "That one is already taken." });
  await logEvent(e.character_id, req.user.id, "effect.applied",
    { effectId: id, label: e.label, kind: e.kind, note });
  res.json({ ok: true });
});

// Dropped by the recipient, or taken back by the caster. Both are the same row going quiet, and
// which of the two columns is set is the only record of who ended it.
app.delete("/api/effects/:id", requireUser, async (req, res) => {
  const id = parseInt(req.params.id, 10) || 0;
  const { rows } = await db.query(
    `SELECT e.*, c.user_id AS owner_id FROM character_effects e
       JOIN characters c ON c.id = e.character_id WHERE e.id = $1`, [id]);
  const e = rows[0];
  if (!e) return res.status(404).json({ error: "No such effect." });
  const recipient = e.owner_id === req.user.id;
  const caster = e.from_user_id === req.user.id;
  if (!recipient && !caster && req.user.role !== "dm")
    return res.status(403).json({ error: "That is not yours to end." });
  const column = recipient && !caster ? "dismissed_at" : "ended_at";
  await db.query(`UPDATE character_effects SET ${column} = now()
                   WHERE id = $1 AND ended_at IS NULL AND dismissed_at IS NULL`, [id]);
  await logEvent(e.character_id, req.user.id,
    recipient && !caster ? "effect.dismissed" : "effect.ended", { effectId: id, label: e.label });
  res.json({ ok: true });
});

// Concentration broke. Every row that one cast made ends together, wherever it landed — which is
// the only reason the group id exists.
app.post("/api/effects/concentration/:group/end", requireUser, async (req, res) => {
  const group = String(req.params.group || "").slice(0, 60);
  const { rows } = await db.query(
    `UPDATE character_effects SET ended_at = now()
      WHERE concentration_group = $1 AND from_user_id = $2 AND ended_at IS NULL
      RETURNING id, character_id, label`, [group, req.user.id]);
  for (const r of rows)
    await logEvent(r.character_id, req.user.id, "effect.ended", { effectId: r.id, label: r.label, group });
  res.json({ ended: rows.length });
});

// What this character still has out on other people, so a caster can see their own concentration
// and end it without hunting for whoever is carrying it.
app.get("/api/characters/:id/effects/out", requireUser, async (req, res) => {
  const row = await loadCharacter(req.params.id, req.user);
  if (!row) return res.status(404).json({ error: "No such character." });
  const { rows } = await db.query(
    `SELECT e.concentration_group, e.label, min(e.granted_at) AS granted_at,
            count(*)::int AS rows_out, string_agg(DISTINCT c.name, ', ') AS on_whom
       FROM character_effects e JOIN characters c ON c.id = e.character_id
      WHERE e.from_character_id = $1 AND e.ended_at IS NULL AND e.dismissed_at IS NULL
        AND e.applied_at IS NULL
      GROUP BY e.concentration_group, e.label ORDER BY min(e.granted_at) DESC`, [row.id]);
  res.json({ out: rows.map(r => ({ group: r.concentration_group, label: r.label,
    onWhom: r.on_whom, count: r.rows_out, grantedAt: r.granted_at })) });
});

// ── The compendium the DM imported ──────────────────────────────────────
// The SRD ships as files under sheet/data/ because it is openly licensed. Everything else lives
// HERE, in the database, and never in the git repo — the requirements forbid bundling copyrighted
// non-SRD material (CS-085), and this app is public. A DM who owns the books can put their content
// into their own deployment without it ever being redistributed from this repository.
// `kind` and `summary` exist because a DM who imports their books turns this into megabytes. The
// sheet asks for one kind at a time, so opening the spell list does not also download two thousand
// items; the Admin page asks for the summary, because a catalogue listing needs names and counts and
// never the entries themselves. Without them, every page load pulled the whole library.
app.get("/api/compendium", requireUser, async (req, res) => {
  const kind = String(req.query.kind || "");
  if (kind && !COMPENDIUM_KINDS.includes(kind))
    return res.status(400).json({ error: "Not a kind this compendium keeps." });
  const summary = req.query.summary === "1";
  const cols = summary ? "id, kind, name, source, ruleset" : "id, kind, name, source, ruleset, data";
  const { rows } = await db.query(
    `SELECT ${cols} FROM compendium_entries
      WHERE retired = false ${kind ? "AND kind = $1" : ""} ORDER BY kind, name`,
    kind ? [kind] : []);
  res.json({ entries: rows.map(r => (summary ? r : { ...r, data: safeJson(r.data) })) });
});

// Importing a whole collection — the books a DM owns, converted offline by
// `sheet/tools/build-compendium.mjs` and uploaded in batches from the Admin page.
//
// WHY NOT THE XML ROUTE BELOW. A class is spread across books: the Player's Handbook carries the
// whole Fighter and Xanathar's carries only the archetypes it adds. Posted file by file they land as
// five separate Fighters, four of them with no hit die. The tool merges them first, so what arrives
// here is already one entry per thing — which is also why this takes entries rather than XML.
//
// Batched because the request body is capped and a single statement writing three thousand rows is
// a bad bet against a hosted database. Each batch is its own transaction-free upsert, and the whole
// thing is idempotent: re-uploading the same bundle rewrites the same rows and changes no counts.
const BUNDLE_JSON = express.json({ limit: "8mb" });
const MAX_BATCH = 500;
app.post("/api/compendium/import-bundle", requireUser, requireDm, BUNDLE_JSON, async (req, res) => {
  const entries = Array.isArray(req.body?.entries) ? req.body.entries : null;
  if (!entries) return res.status(400).json({ error: "Send a batch of entries." });
  if (entries.length > MAX_BATCH)
    return res.status(400).json({ error: `At most ${MAX_BATCH} entries in one batch.` });

  const clean = [];
  for (const e of entries) {
    if (!e || !COMPENDIUM_KINDS.includes(e.kind)) continue;
    const name = String(e.name || "").trim().slice(0, 120);
    if (!name || !e.data || typeof e.data !== "object") continue;
    clean.push([e.kind, name, String(e.source || req.body?.source || "Imported").slice(0, 80),
      JSON.stringify(e.data), req.user.id]);
  }
  if (!clean.length) return res.status(400).json({ error: "Nothing in that batch was readable." });

  // One statement per batch rather than one per entry: three thousand round trips to Railway is the
  // difference between a few seconds and a few minutes.
  const values = clean.map((_, i) =>
    `($${i * 5 + 1},$${i * 5 + 2},$${i * 5 + 3},$${i * 5 + 4},$${i * 5 + 5})`).join(",");
  await db.query(
    `INSERT INTO compendium_entries (kind, name, source, data, added_by) VALUES ${values}
     ON CONFLICT (kind, name, source, version) DO UPDATE SET data = EXCLUDED.data, retired = false`,
    clean.flat());

  res.json({ written: clean.length, skipped: entries.length - clean.length });
});

// What the library holds now, by kind. The Admin page reads it after an upload to report the whole
// import rather than its last batch, and it is cheap enough to ask for at any time.
app.get("/api/compendium/counts", requireUser, requireDm, async (req, res) => {
  const { rows } = await db.query(
    `SELECT kind, count(*)::int AS n FROM compendium_entries WHERE retired = false GROUP BY kind`);
  const counts = Object.fromEntries(rows.map(r => [r.kind, r.n]));
  res.json({ counts, total: Object.values(counts).reduce((a, b) => a + b, 0) });
});

// Preview first, then commit — an import that silently replaced a class would be the worst kind of
// surprise. The same XML posted twice with commit is harmless: each entry upserts by its own name.
const IMPORT_JSON = express.json({ limit: "8mb" });
app.post("/api/compendium/import", requireUser, requireDm, IMPORT_JSON, async (req, res) => {
  const xml = String(req.body?.xml || "");
  if (xml.length < 20) return res.status(400).json({ error: "That is not a compendium." });
  const source = String(req.body?.source || "Imported").slice(0, 80);

  let parsed;
  try { parsed = convertCompendium(xml); }
  catch { return res.status(400).json({ error: "That XML could not be read." }); }

  const counts = Object.fromEntries(COMPENDIUM_KINDS.map(k => [k, parsed[k].length]));
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (!total) return res.status(400).json({ error: "Nothing in that file was a race, class, background, feat, spell or item." });
  if (!req.body?.commit) {
    return res.json({ preview: true, counts, total,
      sample: COMPENDIUM_KINDS.flatMap(k => parsed[k].slice(0, 3).map(e => `${k}: ${e.name}`)).slice(0, 12) });
  }

  // Monsters are dropped by the parser, so nothing here can be a stat block.
  let written = 0;
  for (const kind of COMPENDIUM_KINDS) {
    for (const entry of parsed[kind]) {
      await db.query(
        `INSERT INTO compendium_entries (kind, name, source, data, added_by)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (kind, name, source, version)
         DO UPDATE SET data = EXCLUDED.data, retired = false`,
        [kind, String(entry.name).slice(0, 120), source, JSON.stringify(entry), req.user.id]);
      written++;
    }
  }
  res.json({ imported: written, counts, source });
});

// ═══════════════════════════════════════════════════════════
//  INITIATIVE — the fight on the table
// ═══════════════════════════════════════════════════════════
// One board, two faces. The DM's is the whole fight; a player's is the running order and nothing
// else — and the difference is made HERE, not by hiding rows in the page. A hidden row in the markup
// is one Inspect away from the ambush it was hiding, and the player view is meant to be left open on
// a screen in the room all evening.
//
// WHAT IS STORED is the DM's board: one row, `init_state`, holding the whole fight as JSON. One
// writer, whole writes, no part of it ever queried on its own.
//
// WHAT A PC CONTRIBUTES to it is three things — their character id, their initiative, and whether
// they are on screen. Their hit points, AC, portrait, conditions and both Exhaustions are read live
// from `characters` on every poll, through the same `partyCard` the Admin board uses. So the number
// on the DM's screen, the number on the player's own sheet and the word on the television cannot
// disagree, and a fight that ran long never leaves a stale copy of somebody's hit points behind.
const INIT_MAX = 60;                 // combatants on one board
const INIT_IMG_MAX = 160_000;        // one portrait as a data URL — roughly 120kb of image
// A portrait is either a plate this app already serves or a picture the DM dropped on the page,
// which the browser downscales before it is ever sent. An arbitrary remote URL is NOT accepted: the
// player view hangs on a screen in the room, and it has no business fetching from anywhere else.
const INIT_IMG_OK = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;
// Twelve portraits is a bigger body than the 20kb the global parser allows, so this route brings its
// own — and is named in BRINGS_OWN_PARSER above, or the global one would answer first and 413 it.
const INIT_JSON = express.json({ limit: "4mb" });

const initBlank = () => ({
  round: 0, turnId: "", inCombat: false,
  // Whether this board is the table's clock. On by default — that is the point of it — and a
  // switch rather than a rule, because a DM running a fight on paper should be able to stop it
  // writing to seven character sheets.
  clock: true,
  // What the room is allowed to see. Hit points as WORDS is the default because a number on the wall
  // tells the table exactly how many rounds are left in the boss.
  show: { portraits: true, ac: true, dc: false, hp: "words", conditions: true },
  combatants: [],
});

async function loadInit() {
  const { rows } = await db.query("SELECT data, updated_at FROM init_state WHERE id = 1");
  let state = initBlank();
  if (rows[0]) { try { state = { ...state, ...JSON.parse(rows[0].data) }; } catch { /* keep blank */ } }
  return state;
}
async function saveInit(state) {
  await db.query(
    `INSERT INTO init_state (id, data, updated_at) VALUES (1, $1, now())
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
    [JSON.stringify(state)]);
}

const iNum = (v, lo, hi, dflt = 0) =>
  Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Math.round(Number(v)))) : dflt;
const iStr = (v, max) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const iId = v => iStr(v, 40).replace(/[^\w.:-]/g, "") || randomBytes(6).toString("hex");

// A condition on an NPC, with the round it dies on. `rounds: null` is "until somebody says
// otherwise", which is most of them — a fuse is a thing the DM sets deliberately.
function cleanInitConditions(list) {
  return (Array.isArray(list) ? list : []).slice(0, 12).map(c => ({
    name: iStr(c?.name, 40),
    rounds: c?.rounds == null ? null : iNum(c.rounds, 1, 99, 1),
  })).filter(c => c.name);
}

function cleanCombatant(c) {
  const kind = c?.kind === "pc" ? "pc" : "npc";
  const base = {
    id: iId(c?.id), kind,
    // The initiative itself. `null` is "has not rolled yet" and sorts to the bottom, which is what
    // a reinforcement that just walked in actually is.
    init: c?.init == null || c?.init === "" ? null : iNum(c.init, -20, 999, 0),
    initMod: iNum(c?.initMod, -20, 20, 0),
    hidden: !!c?.hidden,
    note: iStr(c?.note, 400),
  };
  // A PC is a POINTER. Nothing about their sheet is copied in, so nothing about it can go stale.
  if (kind === "pc") return { ...base, charId: iNum(c?.charId, 1, 10 ** 9, 0) };

  const img = String(c?.img || "");
  return {
    ...base,
    name: iStr(c?.name, 60) || "Unnamed",
    img: img.length <= INIT_IMG_MAX && INIT_IMG_OK.test(img) ? img
       : /^\/?(sheet|grimms|resources)\//.test(img) ? iStr(img, 300) : "",
    hpMax: iNum(c?.hpMax, 0, 99_999, 0),
    hp: iNum(c?.hp, -999, 99_999, 0),
    tempHp: iNum(c?.tempHp, 0, 9_999, 0),
    ac: c?.ac == null || c?.ac === "" ? null : iNum(c.ac, 0, 99, 10),
    dc: c?.dc == null || c?.dc === "" ? null : iNum(c.dc, 0, 99, 10),
    conditions: cleanInitConditions(c?.conditions),
    // Not "deleted": a monster that went down is part of the fight's history until the fight ends,
    // and it may well stand back up.
    down: !!c?.down,
  };
}

function cleanInit(body) {
  const s = body && typeof body === "object" ? body : {};
  const show = s.show && typeof s.show === "object" ? s.show : {};
  const seen = new Set();
  return {
    round: iNum(s.round, 0, 999, 0),
    turnId: iStr(s.turnId, 40),
    inCombat: !!s.inCombat,
    clock: s.clock !== false,
    show: {
      portraits: show.portraits !== false,
      ac: show.ac !== false,
      dc: !!show.dc,
      hp: ["words", "numbers", "none"].includes(show.hp) ? show.hp : "words",
      conditions: show.conditions !== false,
    },
    combatants: (Array.isArray(s.combatants) ? s.combatants : []).slice(0, INIT_MAX)
      .map(cleanCombatant)
      // Two rows with one id would be one row the DM cannot damage separately — the thing that
      // happens the moment somebody adds four Glasslings by copying a row.
      .filter(c => !seen.has(c.id) && seen.add(c.id)),
  };
}

// How hurt something is, in a word. The player view says this instead of a number, because a number
// on the wall tells the table how many rounds are left in the boss — which is the DM's to reveal by
// describing it, not the tool's to leak by arithmetic.
function hpWord(hp, max) {
  if (hp <= 0) return "Down";
  if (!max || hp >= max) return "Unhurt";
  const f = hp / max;
  if (f >= 0.75) return "Grazed";
  if (f >= 0.5) return "Hurt";
  if (f >= 0.25) return "Bloodied";
  return "Reeling";
}

// The board resolved: every combatant with the numbers that are true right now, in turn order.
// Both faces are built from this one list, so they can never disagree about whose turn it is.
function initRows(state, party) {
  const byId = new Map((party || []).map(p => [p.id, p]));
  const rows = state.combatants.map(c => {
    if (c.kind !== "pc") return { ...c, player: "" };
    const p = byId.get(c.charId);
    // A character that was archived, or a player who left, leaves a row with nothing behind it.
    // It is shown as a stub rather than dropped: silently losing somebody from the order mid-fight
    // is worse than a row the DM can see and remove.
    if (!p) return { ...c, name: "(gone)", gone: true, hp: 0, hpMax: 0, tempHp: 0,
                     ac: null, dc: null, conditions: [], down: false, player: "" };
    return {
      ...c,
      name: p.name, player: p.player, level: p.level,
      img: p.portraitArt || p.portrait || "",
      hp: p.hp, hpMax: p.maxHp, tempHp: p.tempHp,
      ac: p.ac, dc: p.saveDc, initMod: p.initiative,
      conditions: (p.conditions || []).map(x => ({ name: typeof x === "string" ? x : iStr(x?.name, 40),
                                                   rounds: null })).filter(x => x.name),
      down: p.hp <= 0,
      // What only a PC has, and what the DM wants on the row rather than in another tab.
      wounds: p.wounds, deathSaveDC: p.deathSaveDC,
      exhaustion: p.exhaustion, dreamExhaustion: p.dreamExhaustion,
      dreamExhaustionName: p.dreamExhaustionName,
      fate: p.fate, speed: p.speed, round: p.round, inCombat: p.inCombat,
    };
  });
  // Highest first; nobody who has not rolled yet is above somebody who has; ties keep the order the
  // DM put them in, which is how a tie is settled at a table — by the DM saying so.
  return rows.sort((a, b) =>
    (a.init == null) - (b.init == null) || (b.init ?? 0) - (a.init ?? 0) ||
    (b.initMod ?? 0) - (a.initMod ?? 0) || String(a.name).localeCompare(String(b.name)));
}

// What the room sees. Built by LEAVING THINGS OUT of the resolved board, so a thing the DM has not
// revealed was never in the response at all.
function initPlayerView(state, party) {
  const rows = initRows(state, party).filter(r => !r.hidden);
  const show = state.show;
  return {
    round: state.round, inCombat: state.inCombat, turnId: state.turnId,
    show: { portraits: show.portraits, ac: show.ac, conditions: show.conditions, hp: show.hp },
    order: rows.map(r => ({
      id: r.id, kind: r.kind, name: r.name, player: r.kind === "pc" ? r.player : "",
      init: r.init, down: r.down,
      img: show.portraits ? r.img : "",
      ac: show.ac ? r.ac : null,
      // A PC's own hit points are their business and already on their sheet, so the party is shown
      // in numbers; a monster is shown in a word, or not at all.
      hp: show.hp === "none" ? null
        : r.kind === "pc" ? { hp: r.hp, max: r.hpMax, temp: r.tempHp, word: hpWord(r.hp, r.hpMax) }
        : show.hp === "numbers" ? { hp: r.hp, max: r.hpMax, temp: 0, word: hpWord(r.hp, r.hpMax) }
        : { word: hpWord(r.hp, r.hpMax) },
      conditions: show.conditions ? r.conditions.map(c => c.name) : [],
    })),
  };
}

// The conditions the picker offers: 5e's own, with the four this campaign rewrote marked and
// carrying their own rules text. Served rather than hard-coded in the page so the rewritten ones
// come from `rules.CONDITIONS` — the file the sheet and the server already share.
const INIT_CONDITIONS = [
  "Blinded", "Charmed", "Deafened", "Frightened", "Grappled", "Incapacitated", "Invisible",
  "Paralyzed", "Petrified", "Poisoned", "Prone", "Restrained", "Stunned", "Unconscious",
].map(name => {
  const own = Object.values(rules.CONDITIONS).find(c => c.name === name);
  return { name, campaign: !!own, note: own?.note || "" };
}).concat(Object.values(rules.CONDITIONS)
  .filter(c => !/^(Stunned|Paralyzed)$/.test(c.name))
  .map(c => ({ name: c.name, campaign: true, note: c.note || "" })));

app.get("/api/initiative", requireUser, async (req, res) => {
  const state = await loadInit();
  // `?view=1` asks for the room's face. A player is given it whether they ask or not; the DM asks
  // for it when they open the second screen, and is given THE SAME ONE — so the preview on their
  // laptop is the television, not a drawing of it.
  if (req.user.role !== "dm" || req.query.view === "1") {
    const party = state.combatants.some(c => c.kind === "pc") ? await partyBoard() : [];
    return res.json({ role: req.user.role === "dm" ? "dm" : "player", asRoom: true,
                      view: initPlayerView(state, party) });
  }
  const party = await partyBoard();
  const { rows: saved } = await db.query(
    "SELECT id, name, updated_at FROM init_encounters ORDER BY lower(name)");
  // The DM is sent the board and the party SEPARATELY and merges them in the page. The player view
  // is sent one resolved list instead, because the merging is where the withholding happens and
  // that must not be a thing a browser is trusted to do.
  res.json({
    role: "dm", state, party,
    conditions: INIT_CONDITIONS,
    encounters: saved.map(r => ({ id: r.id, name: r.name, updatedAt: r.updated_at })),
  });
});

// The whole board, written whole. There is one writer, so there is no version to race: the DM's
// screen is the truth and the player view only ever reads.
app.put("/api/initiative", requireUser, requireDm, INIT_JSON, async (req, res) => {
  const state = cleanInit(req.body?.state);
  await saveInit(state);
  res.json({ state });
});

// ── The table's clock ───────────────────────────────────────
// Every sheet already counts its own rounds and expires its own timed things through
// `rules.tickTimed` — a modifier that lasts three rounds, a borrowed resistance, an extra Bonus
// Action somebody handed you. What it has never had is anybody telling it that a round went by, so
// in practice the DM says "round three" out loud and seven players remember to press their own
// button. This writes the round onto every sheet at the table instead; each sheet sees it arrive on
// its own poll and runs its own expiry, which keeps the arithmetic where it already lives.
app.post("/api/initiative/clock", requireUser, requireDm, async (req, res) => {
  const round = iNum(req.body?.round, 0, 999, 1);
  const inCombat = !!req.body?.inCombat;
  const { rows } = await db.query(
    "SELECT id, sheet FROM characters WHERE archived = false ORDER BY id");
  const moved = [];
  for (const row of rows) {
    let sheet; try { sheet = JSON.parse(row.sheet || "{}"); } catch { sheet = {}; }
    if (!sheet || typeof sheet !== "object") sheet = {};
    if (sheet.round === round && !!sheet.inCombat === inCombat) continue;
    sheet.round = round || 1;
    sheet.inCombat = inCombat;
    await db.query(
      `UPDATE characters SET sheet = $1, version = version + 1, updated_at = now() WHERE id = $2`,
      [JSON.stringify(sheet), row.id]);
    moved.push(row.id);
  }
  res.json({ round, inCombat, moved: moved.length });
});

// ── Lineups kept for later ──────────────────────────────────
// The NPC side only. The party is whoever is at the table that night, and a saved fight that
// remembered last month's hit points would be a lie the DM has to spot.
app.get("/api/initiative/encounters/:id", requireUser, requireDm, async (req, res) => {
  const { rows } = await db.query("SELECT * FROM init_encounters WHERE id = $1",
    [iNum(req.params.id, 1, 10 ** 9, 0)]);
  if (!rows[0]) return res.status(404).json({ error: "No such encounter." });
  let data = {}; try { data = JSON.parse(rows[0].data || "{}"); } catch { data = {}; }
  res.json({ name: rows[0].name, combatants: (Array.isArray(data.combatants) ? data.combatants : [])
    .slice(0, INIT_MAX).map(cleanCombatant).filter(c => c.kind === "npc") });
});

app.post("/api/initiative/encounters", requireUser, requireDm, INIT_JSON, async (req, res) => {
  const name = iStr(req.body?.name, 80);
  if (!name) return res.status(400).json({ error: "An encounter wants a name." });
  const combatants = (Array.isArray(req.body?.combatants) ? req.body.combatants : [])
    .slice(0, INIT_MAX).map(cleanCombatant).filter(c => c.kind === "npc");
  if (!combatants.length) return res.status(400).json({ error: "Nothing to save." });
  const { rows } = await db.query(
    `INSERT INTO init_encounters (name, data, updated_at) VALUES ($1,$2,now())
       ON CONFLICT (name) DO UPDATE SET data = EXCLUDED.data, updated_at = now()
     RETURNING id, name, updated_at`, [name, JSON.stringify({ combatants })]);
  res.json({ encounter: { id: rows[0].id, name: rows[0].name, updatedAt: rows[0].updated_at } });
});

app.delete("/api/initiative/encounters/:id", requireUser, requireDm, async (req, res) => {
  await db.query("DELETE FROM init_encounters WHERE id = $1", [iNum(req.params.id, 1, 10 ** 9, 0)]);
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

// The Library — the campaign's shared documents, published from the vault and shown in a frame.
// The page holds nothing but that frame, and the site at the far end is public anyway; the session
// is here for consistency with the rest of the app and so the tool strip can ask who you are.
app.use("/library", async (req, res, next) => {
  return (await currentUser(req)) ? next() : res.redirect("/");
});
app.use("/library", express.static(path.join(ROOT, "library")));

// The Character Sheet. A session is enough — what a player may READ is settled by the routes above,
// every one of which is owner-scoped, so the page itself carries nothing privileged. The folder's
// data/ holds only the openly licensed SRD catalogue; anything the DM imported lives in the database.
app.use("/sheet", async (req, res, next) => {
  return (await currentUser(req)) ? next() : res.redirect("/");
});
app.use("/sheet", express.static(path.join(ROOT, "sheet")));

// The initiative board. A session is enough to be handed the page, the same as /sheet and /map: the
// page itself holds no fight, and what it is served when it asks is decided by /api/initiative —
// the whole board for the DM, the running order and nothing else for everybody else. The player
// view is the point of the tool, so a player must be able to open this URL; the ambush that is not
// on it was never sent to them.
app.use("/initiative", async (req, res, next) => {
  return (await currentUser(req)) ? next() : res.redirect("/");
});
app.use("/initiative", express.static(path.join(ROOT, "initiative")));

// "/" and "/index.html" are the same front page — an old bookmark or a hand-typed URL used to
// get Express's bare "Cannot GET /index.html" instead of the hub.
app.get(["/", "/index.html"], (req, res) => res.sendFile(path.join(ROOT, "index.html")));
app.get("/arcanum.html", (req, res) => res.sendFile(path.join(ROOT, "arcanum.html")));

// The old single-page Admin, kept as a redirect. It was admin.html at the root for a year, so it
// is in bookmarks and in the vault's own notes; those should land on the section rather than on
// Express's bare "Cannot GET". A hash rides along, so a link at a particular player still works.
app.get("/admin.html", (req, res) => res.redirect(301, "/admin/"));

// Admin — the DM's own section, served the way /sheet and /map are: a session is enough to be
// handed the files, and the page turns a player away itself with something better worded than a
// redirect. The real boundary has not moved — every call this section makes is behind requireDm,
// and the folder holds no data, only the four sections' code.
app.use("/admin", async (req, res, next) => {
  return (await currentUser(req)) ? next() : res.redirect("/");
});
app.use("/admin", express.static(path.join(ROOT, "admin")));

app.use((err, req, res, next) => {
  if (!err.status || err.status >= 500) console.error(err);
  res.status(err.status || 500).json({ error: err.status ? "Bad request." : "Server error." });
});

app.listen(PORT, () => console.log(`Arcanum Veritas listening on :${PORT} — ${process.env.DATABASE_URL ? "Postgres" : "embedded database (.data/)"}`));
