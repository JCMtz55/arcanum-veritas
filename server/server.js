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

const db = await openDb();
await migrate(db);
await seed();

// ═══════════════════════════════════════════════════════════
//  FIRST RUN
// ═══════════════════════════════════════════════════════════
// An empty database gets the DM account and the players in seed.json with their mastered
// Cognitions. After that the database is the truth — seed.json is never read again.
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
    `SELECT u.id, u.username, u.display_name, u.role
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
app.get("/api/me", requireUser, (req, res) => res.json({ user: publicUser(req.user) }));

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

// ── Admin: players and what each may read ──────────────────
const admin = express.Router();
admin.use(requireUser, requireDm);

admin.get("/users", async (req, res) => {
  const users = (await db.query(
    `SELECT id, username, display_name, role, password_hash <> '${LOCKED}' AS has_password
       FROM users ORDER BY role, display_name`)).rows;
  const grants = (await db.query("SELECT user_id, cognition_id FROM user_cognitions")).rows;
  res.json({ users: users.map(u => ({
    ...publicUser(u), hasPassword: u.has_password,
    cognitions: grants.filter(g => g.user_id === u.id).map(g => g.cognition_id),
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
  res.json({ ok: true });
});

admin.delete("/users/:id/cognitions/:cog", async (req, res) => {
  await db.query("DELETE FROM user_cognitions WHERE user_id = $1 AND cognition_id = $2", [req.target.id, req.params.cog]);
  res.json({ ok: true });
});

app.use("/api/admin", admin);
app.use("/api", (req, res) => res.status(404).json({ error: "Not found." }));

// ── The builder itself. Only these folders are public — cognitions/ and server/ never are.
app.use("/css", express.static(path.join(ROOT, "css")));
app.use("/js", express.static(path.join(ROOT, "js")));
app.use("/grimms", express.static(path.join(ROOT, "grimms")));
app.get("/", (req, res) => res.sendFile(path.join(ROOT, "index.html")));

app.use((err, req, res, next) => {
  if (!err.status || err.status >= 500) console.error(err);
  res.status(err.status || 500).json({ error: err.status ? "Bad request." : "Server error." });
});

app.listen(PORT, () => console.log(`Arcanum Veritas listening on :${PORT} — ${process.env.DATABASE_URL ? "Postgres" : "embedded database (.data/)"}`));
