// The character sheet's API, against a real server and a throwaway database.
//
// This suite is here for one reason: every rule about who may change what is enforced on the server,
// and a hidden button is not a permission. So it tries the escalations directly — a player writing
// their own level, reading someone else's sheet, spending a Fate charge twice, claiming an unlock
// that is already spent — rather than trusting that the UI will not offer them.
//
// It starts its own server on a free port with PGLITE_DIR pointed at a temporary directory, so it
// never touches the campaign's own .data/ database. Run with:  node --test sheet/test/

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DM_PASSWORD = "dm-test-password";
const PLAYER_PASSWORD = "player-test-password";

let server, dataDir, base;
const cookies = {};          // one jar per signed-in name

const freePort = () => new Promise(res => {
  const s = net.createServer();
  s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => res(port)); });
});

before(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), "av-sheet-test-"));
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;

  server = spawn(process.execPath, [path.join(ROOT, "server", "server.js")], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), PGLITE_DIR: dataDir,
           DM_USERNAME: "dm", DM_PASSWORD, DATABASE_URL: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("server never started")), 60_000);
    let out = "";
    server.stdout.on("data", d => {
      out += d;
      if (out.includes("listening on")) { clearTimeout(timer); resolve(); }
    });
    server.stderr.on("data", d => { out += d; });
    server.on("exit", c => { clearTimeout(timer); reject(new Error(`server exited ${c}: ${out}`)); });
  });

  await signIn("dm", "dm", DM_PASSWORD);
  // The DM makes the two player accounts, which is the only way an account comes into being.
  await api("dm", "POST", "/api/admin/users", { username: "tester", displayName: "Tester", password: PLAYER_PASSWORD });
  await api("dm", "POST", "/api/admin/users", { username: "other", displayName: "Other", password: PLAYER_PASSWORD });
  await signIn("tester", "tester", PLAYER_PASSWORD);
  await signIn("other", "other", PLAYER_PASSWORD);
});

after(async () => {
  server?.kill();
  if (dataDir) await rm(dataDir, { recursive: true, force: true }).catch(() => {});
});

async function raw(who, method, url, body) {
  return fetch(base + url, {
    method,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}),
               ...(cookies[who] ? { Cookie: cookies[who] } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
}
async function api(who, method, url, body) {
  const r = await raw(who, method, url, body);
  const data = await r.json().catch(() => ({}));
  return { status: r.status, ...data };
}
async function signIn(who, username, password) {
  const r = await raw(null, "POST", "/api/login", { username, password });
  assert.equal(r.status, 200, `${username} could not sign in`);
  cookies[who] = (r.headers.getSetCookie?.() || [r.headers.get("set-cookie")])
    .filter(Boolean).map(c => c.split(";")[0]).join("; ");
}
const makeCharacter = (who, name) => api(who, "POST", "/api/characters", { name });

// ── Creation and ownership ──────────────────────────────────────────────
test("a new character starts at the engine's blank sheet with Dream 10", async () => {
  const { status, character } = await makeCharacter("tester", "Test Subject");
  assert.equal(status, 200);
  assert.equal(character.name, "Test Subject");
  assert.equal(character.level, 1);
  assert.equal(character.dream, 10);            // DM-01, set by the server and nowhere else
  assert.equal(character.fate, 0);
  assert.deepEqual(character.honor, { order: 0, chaos: 0 });
  assert.deepEqual(character.unspent, { honor: 0, morality: 0 });
  assert.equal(character.sheet.abilities.dream, 10);

  const list = await api("tester", "GET", "/api/characters");
  assert.ok(list.characters.some(c => c.id === character.id));
});

test("a character is invisible to another player, and says so as a 404", async () => {
  const { character } = await makeCharacter("tester", "Private");
  const seen = await api("other", "GET", `/api/characters/${character.id}`);
  assert.equal(seen.status, 404);               // the same answer a nonexistent row gives

  // Another player's list never contains it either.
  const theirs = await api("other", "GET", "/api/characters");
  assert.ok(!theirs.characters.some(c => c.id === character.id));

  // Writing it is refused too, not merely hidden.
  const written = await api("other", "PUT", `/api/characters/${character.id}`,
    { sheet: { hp: 999 }, version: character.version });
  assert.equal(written.status, 404);

  // The DM may read it — DM-003 — but the player's own list is still only their own.
  const dmSees = await api("dm", "GET", `/api/characters/${character.id}`);
  assert.equal(dmSees.status, 200);
});

test("signing out is required: the sheet page and its API refuse a stranger", async () => {
  assert.equal((await api(null, "GET", "/api/characters")).status, 401);
  assert.equal((await api(null, "GET", "/api/characters/party")).status, 401);
  const page = await raw(null, "GET", "/sheet/");
  assert.equal(page.status, 302);               // redirected to the front page, not served
});

// ── The protected columns ───────────────────────────────────────────────
test("a player cannot write level, Dream or Fate through their own sheet save", async () => {
  const { character } = await makeCharacter("tester", "Climber");

  const forged = await api("tester", "PUT", `/api/characters/${character.id}`, {
    version: character.version,
    sheet: {
      hp: 40, maxHp: 40,
      // Everything below is the DM's. A forged payload must lose all of it.
      level: 20, dream: 30, fate: 99,
      honor: { order: 99, chaos: 99 }, morality: { good: 99, evil: 99 },
      unspent: { honor: 99, morality: 99 },
    },
  });
  assert.equal(forged.status, 200);
  assert.equal(forged.character.level, 1);
  assert.equal(forged.character.dream, 10);
  assert.equal(forged.character.fate, 0);
  assert.deepEqual(forged.character.honor, { order: 0, chaos: 0 });
  assert.deepEqual(forged.character.unspent, { honor: 0, morality: 0 });
  // The keys are not merely ignored on read — they are not stored.
  assert.equal(forged.character.sheet.level, undefined);
  assert.equal(forged.character.sheet.fate, undefined);
  // What the player genuinely owns did save.
  assert.equal(forged.character.sheet.hp, 40);

  // And the DM-only routes refuse them outright.
  assert.equal((await api("tester", "PUT", `/api/characters/${character.id}/level`, { level: 20 })).status, 403);
  assert.equal((await api("tester", "PUT", `/api/characters/${character.id}/dream`, { dream: 30 })).status, 403);
  assert.equal((await api("tester", "PUT", `/api/characters/${character.id}/fate`, { fate: 9 })).status, 403);
  assert.equal((await api("tester", "POST", `/api/characters/${character.id}/unlocks`, { kind: "feat" })).status, 403);
});

test("a stale save is refused and handed the newer sheet", async () => {
  const { character } = await makeCharacter("tester", "Two Tabs");

  const first = await api("tester", "PUT", `/api/characters/${character.id}`,
    { sheet: { hp: 10 }, version: character.version });
  assert.equal(first.status, 200);
  assert.equal(first.character.version, character.version + 1);

  // The second tab still believes the old version. It must not overwrite the first tab's save.
  const stale = await api("tester", "PUT", `/api/characters/${character.id}`,
    { sheet: { hp: 99 }, version: character.version });
  assert.equal(stale.status, 409);
  assert.equal(stale.character.sheet.hp, 10);   // the newer content comes back to merge onto
  assert.equal(stale.character.version, character.version + 1);
});

// ── Level, allocations and unlocks ──────────────────────────────────────
test("a DM-granted level issues one Honor and one Morality allocation and a level unlock", async () => {
  const { character } = await makeCharacter("tester", "Riser");

  const up = await api("dm", "PUT", `/api/characters/${character.id}/level`,
    { level: 2, note: "Chapter 3 milestone" });
  assert.equal(up.status, 200);
  assert.equal(up.character.level, 2);
  assert.deepEqual(up.allocations, { honor: 1, morality: 1, levels: 1 });
  assert.deepEqual(up.character.unspent, { honor: 1, morality: 1 });

  const unlocks = await api("tester", "GET", `/api/characters/${character.id}/unlocks`);
  assert.equal(unlocks.unlocks.filter(u => u.kind === "level" && !u.consumed_at).length, 1);

  // Two levels at once issue two of each, however the levels split across classes.
  const jump = await api("dm", "PUT", `/api/characters/${character.id}/level`, { level: 4 });
  assert.deepEqual(jump.allocations, { honor: 2, morality: 2, levels: 2 });
  assert.deepEqual(jump.character.unspent, { honor: 3, morality: 3 });

  // The player spends one into the sub-score of their choice; the counter goes down, not the score up
  // on its own.
  const spent = await api("tester", "POST", `/api/characters/${character.id}/allocate`, { axis: "chaos" });
  assert.equal(spent.character.honor.chaos, 1);
  assert.equal(spent.character.unspent.honor, 2);

  // "Law" is the other name the rules note uses for Order, and it must land on the same column.
  const law = await api("tester", "POST", `/api/characters/${character.id}/allocate`, { axis: "law" });
  assert.equal(law.character.honor.order, 1);

  // A rollback issues nothing, and never hands back an allocation already spent.
  const down = await api("dm", "PUT", `/api/characters/${character.id}/level`, { level: 3 });
  assert.deepEqual(down.allocations, { honor: 0, morality: 0, levels: 0 });
  assert.equal(down.character.level, 3);
});

test("allocations cannot be spent past the number granted", async () => {
  const { character } = await makeCharacter("tester", "Greedy");
  await api("dm", "PUT", `/api/characters/${character.id}/level`, { level: 2 });

  assert.equal((await api("tester", "POST", `/api/characters/${character.id}/allocate`, { axis: "good" })).status, 200);
  const second = await api("tester", "POST", `/api/characters/${character.id}/allocate`, { axis: "good" });
  assert.equal(second.status, 400);
  assert.match(second.error, /no allocation left/i);

  assert.equal((await api("tester", "POST", `/api/characters/${character.id}/allocate`, { axis: "nonsense" })).status, 400);
});

test("an unlock is single-use", async () => {
  const { character } = await makeCharacter("tester", "Feated");
  const granted = await api("dm", "POST", `/api/characters/${character.id}/unlocks`,
    { kind: "feat", note: "Chapter reward" });
  assert.equal(granted.unlock.kind, "feat");

  const first = await api("tester", "POST", `/api/characters/${character.id}/unlocks/${granted.unlock.id}/consume`,
    { choice: { feat: "Alert" } });
  assert.equal(first.status, 200);
  assert.deepEqual(first.unlock.choice, { feat: "Alert" });

  const again = await api("tester", "POST", `/api/characters/${character.id}/unlocks/${granted.unlock.id}/consume`,
    { choice: { feat: "Actor" } });
  assert.equal(again.status, 400);
  assert.match(again.error, /already spent/i);

  // Another player cannot spend it either.
  const theft = await api("other", "POST", `/api/characters/${character.id}/unlocks/${granted.unlock.id}/consume`, {});
  assert.equal(theft.status, 404);

  assert.equal((await api("dm", "POST", `/api/characters/${character.id}/unlocks`, { kind: "wish" })).status, 400);
});

// ── Allowing a level, and the player taking it ──────────────────────────
// The LEVEL UP gate. Allowing does not move the level; spending the token does, server-side, in the
// statement that spends it — so the authority stays the DM's (DM-009) while the moment the features
// arrive is the player's (CS-063).
test("allowing a level opens it without taking it, and the player's press is what raises it", async () => {
  const { character } = await makeCharacter("tester", "Patient");

  const allowed = await api("dm", "POST", `/api/characters/${character.id}/level/allow`,
    { note: "Session 77 milestone" });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.targetLevel, 2);
  assert.equal(allowed.character.level, 1, "allowing a level must not take it");

  // The player sees exactly one open level token, and it names the level it is permission for.
  const open = (await api("tester", "GET", `/api/characters/${character.id}/unlocks`))
    .unlocks.filter(u => u.kind === "level" && !u.consumed_at);
  assert.equal(open.length, 1);
  assert.equal(open[0].target_level, 2);

  // A second one is refused: two buttons for one level would be two levels.
  const twice = await api("dm", "POST", `/api/characters/${character.id}/level/allow`);
  assert.equal(twice.status, 400);
  assert.match(twice.error, /already waiting/i);

  // Taking it raises the level and issues the allocations, in one answer.
  const took = await api("tester", "POST", `/api/characters/${character.id}/unlocks/${open[0].id}/consume`,
    { choice: { level: 2, className: "Fighter" } });
  assert.equal(took.status, 200);
  assert.equal(took.character.level, 2);
  assert.deepEqual(took.allocations, { honor: 1, morality: 1, levels: 1 });
  assert.deepEqual(took.character.unspent, { honor: 1, morality: 1 });
  assert.deepEqual(took.unlock.choice, { level: 2, className: "Fighter" });

  // And it cannot be taken again — one token, one level, whatever a retry or a double tap does.
  const again = await api("tester", "POST", `/api/characters/${character.id}/unlocks/${open[0].id}/consume`, {});
  assert.equal(again.status, 400);
  assert.equal((await api("tester", "GET", `/api/characters/${character.id}`)).character.level, 2);
});

test("only a DM may allow a level, and level 20 is the last one", async () => {
  const { character } = await makeCharacter("tester", "Capped");
  assert.equal((await api("tester", "POST", `/api/characters/${character.id}/level/allow`)).status, 403);
  assert.equal((await api("other", "POST", `/api/characters/${character.id}/level/allow`)).status, 403);

  await api("dm", "PUT", `/api/characters/${character.id}/level`, { level: 20 });
  const at20 = await api("dm", "POST", `/api/characters/${character.id}/level/allow`);
  assert.equal(at20.status, 400);
  assert.match(at20.error, /last one/i);
});

test("a token for a level the character already has adds its features and moves nothing", async () => {
  const { character } = await makeCharacter("tester", "Corrected");
  // The DM sets the level by hand — the correction path. It still issues a token per level gained, so
  // the player is walked through what those levels brought.
  await api("dm", "PUT", `/api/characters/${character.id}/level`, { level: 3 });
  const open = (await api("tester", "GET", `/api/characters/${character.id}/unlocks`))
    .unlocks.filter(u => u.kind === "level" && !u.consumed_at).sort((a, b) => a.target_level - b.target_level);
  assert.deepEqual(open.map(u => u.target_level), [2, 3]);

  // The level is already 3, so spending either of them issues no second helping of allocations.
  const out = await api("tester", "POST", `/api/characters/${character.id}/unlocks/${open[0].id}/consume`, {});
  assert.equal(out.character.level, 3);
  assert.deepEqual(out.allocations, { honor: 0, morality: 0, levels: 0 });
  assert.deepEqual(out.character.unspent, { honor: 2, morality: 2 });   // the two the grant issued, no more
});

test("a rollback takes its unspent level tokens with it", async () => {
  const { character } = await makeCharacter("tester", "Reverted");
  await api("dm", "PUT", `/api/characters/${character.id}/level`, { level: 5 });
  await api("dm", "PUT", `/api/characters/${character.id}/level`, { level: 2 });

  const open = (await api("tester", "GET", `/api/characters/${character.id}/unlocks`))
    .unlocks.filter(u => u.kind === "level" && !u.consumed_at);
  assert.deepEqual(open.map(u => u.target_level).sort((a, b) => a - b), [2],
    "a token for a level the character no longer has on the way must not offer a LEVEL UP back to it");
});

test("the party board says a level is waiting, and what the classes are", async () => {
  const { character } = await makeCharacter("tester", "Boarded");
  await api("tester", "PUT", `/api/characters/${character.id}`, {
    version: character.version,
    sheet: { classes: [{ name: "Fighter", level: 1, subclass: "Champion" }] },
  });
  await api("dm", "POST", `/api/characters/${character.id}/level/allow`);

  const card = (await api("dm", "GET", "/api/characters/party")).party.find(c => c.id === character.id);
  assert.equal(card.level, 1);
  assert.equal(card.pendingLevel, 2);
  assert.ok(card.openUnlocks >= 1);
  assert.deepEqual(card.classes, [{ name: "Fighter", level: 1, subclass: "Champion" }]);
});

// ── Fate ────────────────────────────────────────────────────────────────
test("a Fate use is spent once, by the player, and never recharges", async () => {
  const { character } = await makeCharacter("tester", "Fated");

  // Nothing to spend until the DM grants it (DM-05).
  const broke = await api("tester", "POST", `/api/characters/${character.id}/fate/spend`,
    { useId: "use-00000001" });
  assert.equal(broke.status, 400);
  assert.match(broke.error, /no Fate/i);

  await api("dm", "PUT", `/api/characters/${character.id}/fate`, { fate: 2, note: "Session 77" });

  const spent = await api("tester", "POST", `/api/characters/${character.id}/fate/spend`, {
    useId: "use-00000002",
    emphasis: { pairs: [{ dice: [3, 17], tie: true }, { dice: [1, 20], tie: false }], pick: 20 },
    original: { event: "death save", roll: 4 },
  });
  assert.equal(spent.fate, 1);

  // The same use arriving twice — a retry, a double tap, a reload mid-request — costs one charge.
  const repeat = await api("tester", "POST", `/api/characters/${character.id}/fate/spend`,
    { useId: "use-00000002" });
  assert.equal(repeat.fate, 1);
  assert.equal(repeat.repeated, true);

  // A genuinely new use spends the second charge, and then there are none.
  assert.equal((await api("tester", "POST", `/api/characters/${character.id}/fate/spend`, { useId: "use-00000003" })).fate, 0);
  assert.equal((await api("tester", "POST", `/api/characters/${character.id}/fate/spend`, { useId: "use-00000004" })).status, 400);

  // A use with no id is refused rather than guessed at.
  assert.equal((await api("tester", "POST", `/api/characters/${character.id}/fate/spend`, {})).status, 400);

  // Both faces, the rerolled tie and the selected result are in the audit log, with the original.
  // The log is newest-first and three uses were spent here, so find the one being asserted about.
  const { events } = await api("tester", "GET", `/api/characters/${character.id}/events`);
  const fate = events.find(e => e.action === "fate.spent" && e.detail.useId === "use-00000002");
  assert.equal(fate.detail.emphasis.pick, 20);
  assert.equal(fate.detail.emphasis.pairs[0].tie, true);
  assert.equal(fate.detail.original.roll, 4);
  assert.equal(fate.actor, "Tester");
});

// ── The audit log ───────────────────────────────────────────────────────
test("a Dream change must name the campaign event that caused it", async () => {
  const { character } = await makeCharacter("tester", "Dreamer");

  // DM-02: Dream rises only through a special campaign event, recorded with the change.
  const nameless = await api("dm", "PUT", `/api/characters/${character.id}/dream`, { dream: 24 });
  assert.equal(nameless.status, 400);
  assert.match(nameless.error, /name the campaign event/i);
  assert.equal((await api("dm", "GET", `/api/characters/${character.id}`)).character.dream, 10);

  const named = await api("dm", "PUT", `/api/characters/${character.id}/dream`,
    { dream: 24, note: "The Sun's gift, Session 76" });
  assert.equal(named.character.dream, 24);

  // Re-sending the same value is not a change, so it needs no event.
  assert.equal((await api("dm", "PUT", `/api/characters/${character.id}/dream`, { dream: 24 })).status, 200);
});

test("sensitive changes record actor, action and before/after", async () => {
  const { character } = await makeCharacter("tester", "Audited");
  await api("dm", "PUT", `/api/characters/${character.id}/dream`, { dream: 24, note: "S76 reward, party-wide" });

  const { events } = await api("tester", "GET", `/api/characters/${character.id}/events`);
  const dream = events.find(e => e.action === "dream.set");
  assert.equal(dream.detail.from, 10);
  assert.equal(dream.detail.to, 24);
  assert.equal(dream.note, "S76 reward, party-wide");
  assert.equal(dream.actor, "Dungeon Master");

  assert.ok(events.some(e => e.action === "character.created"));
});

// ── The DM's party board ────────────────────────────────────────────────
test("the party board is DM-only and computes the DCs the Wounds push up", async () => {
  const { character } = await makeCharacter("tester", "Wounded");
  await api("dm", "PUT", `/api/characters/${character.id}/level`, { level: 5 });
  await api("dm", "PUT", `/api/characters/${character.id}/dream`, { dream: 24, note: "S76" });

  const fresh = await api("tester", "GET", `/api/characters/${character.id}`);
  await api("tester", "PUT", `/api/characters/${character.id}`, {
    version: fresh.character.version,
    sheet: {
      ...fresh.character.sheet,
      hp: 31, maxHp: 94, tempHp: 5, ac: 18, speed: 30,
      abilities: { ...fresh.character.sheet.abilities, dex: 16, cha: 18 },
      wounds: 2, injuries: [{ name: "Ruptured Artery", healed: false }, { name: "Old scar", healed: true }],
      exhaustion: 1, dreamExhaustion: 7,
      modifiers: [{ id: "x", target: "ac", amount: 2, reason: "Shield of Faith", rounds: 10 }],
    },
  });

  assert.equal((await api("tester", "GET", "/api/characters/party")).status, 403);

  const { party } = await api("dm", "GET", "/api/characters/party");
  const card = party.find(c => c.id === character.id);
  assert.equal(card.player, "Tester");
  assert.equal(card.level, 5);
  assert.equal(card.hp, 31);
  assert.equal(card.maxHp, 94);
  assert.equal(card.tempHp, 5);
  assert.equal(card.ac, 20);                     // 18 + the named modifier
  assert.equal(card.initiative, 3);
  assert.equal(card.dream, 24);
  assert.equal(card.dreamMod, 7);
  // Two Wounds and ONE unhealed Injury — the healed one must not count.
  assert.equal(card.wounds, 2);
  assert.equal(card.injuries, 2);
  assert.equal(card.unhealedInjuries, 1);
  assert.equal(card.deathSaveDC, 13);
  assert.equal(card.concentrationFloor, 13);
  // Verum DC at level 5: 8 + PB 3 + highest-of-six (+4 Cha) + Dream +7
  assert.equal(card.saveDc, 22);
  assert.equal(card.dreamExhaustion, 7);
  assert.equal(card.dreamExhaustionName, "Dream Echo State");
  assert.equal(card.dreamPenalty, -5);           // still -5 at level 7
  assert.equal(card.activeModifiers, 1);
});

// ── What the DM may set ON the sheet ────────────────────────────────────
// The board writes hit points, conditions, the Wounds and the rest into the player's own JSON,
// which is the one place the DM reaches into a document they do not own. These are the tests that
// keep it narrow: a whitelist, the engine's bounds, DM only, and an audit row for every change.
//
// An account may hold 24 characters and this suite makes a lot of them, so these four tests get an
// account of their own rather than spending "tester"'s remaining budget — the same reason the kind
// tests below share one pair.
let BOARD = null;
async function board() {
  if (!BOARD) BOARD = (async () => {
    await api("dm", "POST", "/api/admin/users",
      { username: "board", displayName: "Board", password: PLAYER_PASSWORD }).catch(() => {});
    await signIn("board", "board", PLAYER_PASSWORD);
  })();
  await BOARD;
}

async function sheetWith(name, extra) {
  await board();
  const { character } = await makeCharacter("board", name);
  const fresh = await api("board", "GET", `/api/characters/${character.id}`);
  await api("board", "PUT", `/api/characters/${character.id}`, {
    version: fresh.character.version,
    sheet: { ...fresh.character.sheet, ...extra },
  });
  return character.id;
}

test("the DM sets what the table adjudicates, and nothing else", async () => {
  const id = await sheetWith("Adjudicated", { hp: 40, maxHp: 40 });

  // A player cannot reach it at all, whosever sheet it is.
  assert.equal((await api("board", "PUT", `/api/characters/${id}/vitals`, { vitals: { hp: 1 } })).status, 403);
  assert.equal((await api("other", "PUT", `/api/characters/${id}/vitals`, { vitals: { hp: 1 } })).status, 403);

  await api("dm", "PUT", `/api/characters/${id}/vitals`, {
    vitals: { hp: 12, tempHp: 4, wounds: 2, exhaustion: 1, dreamExhaustion: 3,
              conditions: [{ id: "stunned" }, { name: "Prone" }],
              injuries: [{ name: "Broken rib" }],
              inspiration: [{ die: "d6", why: "held the line" }] },
    note: "the dragon's second breath",
  });

  const card = (await api("dm", "GET", "/api/characters/party")).party.find(c => c.id === id);
  assert.equal(card.hp, 12);
  assert.equal(card.tempHp, 4);
  assert.equal(card.wounds, 2);
  assert.equal(card.exhaustion, 1);
  assert.equal(card.dreamExhaustion, 3);
  assert.equal(card.unhealedInjuries, 1);
  assert.equal(card.inspiration.length, 1);
  assert.equal(card.inspiration[0].die, "d6");
  // A rewritten condition keeps the engine's own id; anything else is free text with a made-up one.
  assert.deepEqual(card.conditions.map(c => c.id), ["stunned", card.conditions[1].id]);
  assert.equal(card.conditions[0].name, "Stunned");
  assert.equal(card.conditions[1].name, "Prone");
  assert.ok(card.conditions[1].id.startsWith("x:"));
  // Two Wounds and one unhealed Injury: 10 + 2 + 1.
  assert.equal(card.deathSaveDC, 13);

  // Out of bounds, and off the whitelist. Both refused rather than clamped or ignored.
  assert.equal((await api("dm", "PUT", `/api/characters/${id}/vitals`, { vitals: { hp: 999 } })).status, 400);
  assert.equal((await api("dm", "PUT", `/api/characters/${id}/vitals`, { vitals: { exhaustion: 9 } })).status, 400);
  assert.equal((await api("dm", "PUT", `/api/characters/${id}/vitals`, { vitals: { abilities: { str: 20 } } })).status, 400);
  assert.equal((await api("dm", "PUT", `/api/characters/${id}/vitals`, { vitals: { level: 9 } })).status, 400);
  // And nothing it refused landed.
  const again = (await api("dm", "GET", "/api/characters/party")).party.find(c => c.id === id);
  assert.equal(again.hp, 12);
  assert.equal(again.exhaustion, 1);

  const { events } = await api("dm", "GET", `/api/characters/${id}/events`);
  const logged = events.find(e => e.action === "vitals.set");
  assert.equal(logged.actor, "Dungeon Master");
  assert.equal(logged.note, "the dragon's second breath");
  assert.equal(logged.detail.before.hp, 40);
  assert.equal(logged.detail.after.hp, 12);
});

test("the player's own sheet is told what the DM changed", async () => {
  const id = await sheetWith("Told", { hp: 30, maxHp: 30 });
  const before = (await api("board", "GET", `/api/characters/${id}`)).character.version;

  await api("dm", "PUT", `/api/characters/${id}/vitals`, { vitals: { hp: 7, wounds: 1 } });

  // The small read the open sheet polls: the eight keys, and a version that says it moved.
  const seen = await api("board", "GET", `/api/characters/${id}/vitals`);
  assert.equal(seen.vitals.hp, 7);
  assert.equal(seen.vitals.wounds, 1);
  assert.ok(seen.version > before);
  // Somebody else's sheet is still a 404, exactly as the full read is.
  assert.equal((await api("other", "GET", `/api/characters/${id}/vitals`)).status, 404);

  // A client that had the sheet open and saves the old hit points back is refused rather than
  // winning — the DM's write bumped the version, which is the whole point of bumping it.
  const stale = await api("board", "PUT", `/api/characters/${id}`, { version: before, sheet: { hp: 30 } });
  assert.equal(stale.status, 409);
});

test("Honor and Morality are the DM's to set outright", async () => {
  await board();
  const { character } = await makeCharacter("board", "Aligned");
  assert.equal((await api("board", "PUT", `/api/characters/${character.id}/axes`,
    { axes: { order: 9 } })).status, 403);

  const out = await api("dm", "PUT", `/api/characters/${character.id}/axes`, {
    axes: { order: 4, chaos: 6, good: 3, evil: 1, honorUnspent: 2, moralityUnspent: 0 },
    note: "the Lion's court",
  });
  assert.equal(out.character.honor.order, 4);
  assert.equal(out.character.morality.good, 3);
  assert.equal(out.character.unspent.honor, 2);

  const card = (await api("dm", "GET", "/api/characters/party")).party.find(c => c.id === character.id);
  assert.equal(card.honor.total, 10);
  assert.equal(card.honor.chaosMod, 2);            // Chaos 6 over Order 4
  assert.equal(card.honor.orderMod, -2);
  assert.equal(card.morality.total, 4);
  assert.equal(card.corruptionSave, 0);            // ((3-1) + (4-6)) / 2

  assert.equal((await api("dm", "PUT", `/api/characters/${character.id}/axes`, { axes: { order: 200 } })).status, 400);
  assert.equal((await api("dm", "PUT", `/api/characters/${character.id}/axes`, { axes: { luck: 3 } })).status, 400);
});

test("the DM can grant a benefit with no caster behind it, and end it", async () => {
  const id = await sheetWith("Blessed", { hp: 20, maxHp: 20, ac: 15 });

  assert.equal((await api("other", "POST", `/api/characters/${id}/effects`,
    { label: "Not theirs", benefits: [{ kind: "modifier", target: "ac", amount: 2 }] })).status, 403);

  const made = await api("dm", "POST", `/api/characters/${id}/effects`, {
    label: "The Lion's regard", note: "knelt at the throne",
    benefits: [{ kind: "modifier", target: "ac", amount: 2, rounds: 10 }],
  });
  assert.equal(made.granted, 1);

  // It reaches the recipient's own sheet like any cast — and the board counts it in the AC.
  const mine = (await api("board", "GET", `/api/characters/${id}/effects`)).effects;
  assert.equal(mine.length, 1);
  assert.equal(mine[0].label, "The Lion's regard");
  assert.equal(mine[0].player, "");                // nobody cast it
  const card = (await api("dm", "GET", "/api/characters/party")).party.find(c => c.id === id);
  assert.equal(card.ac, 17);
  assert.equal(card.effects[0].fromDm, true);

  await api("dm", "DELETE", `/api/effects/${mine[0].id}`);
  assert.equal((await api("board", "GET", `/api/characters/${id}/effects`)).effects.length, 0);

  assert.equal((await api("dm", "POST", `/api/characters/${id}/effects`, { label: "" })).status, 400);
  assert.equal((await api("dm", "POST", `/api/characters/${id}/effects`,
    { label: "Nothing at all", benefits: [{ kind: "modifier", target: "ac", amount: 0 }] })).status, 400);
});

test("archiving hides a character without deleting it", async () => {
  const { character } = await makeCharacter("tester", "Retired");
  await api("tester", "POST", `/api/characters/${character.id}/archive`, { archived: true });

  const list = await api("tester", "GET", "/api/characters");
  assert.ok(!list.characters.some(c => c.id === character.id));
  // Still there, still readable by id — archived, not gone.
  assert.equal((await api("tester", "GET", `/api/characters/${character.id}`)).status, 200);

  await api("tester", "POST", `/api/characters/${character.id}/archive`, { archived: false });
  assert.ok((await api("tester", "GET", "/api/characters")).characters.some(c => c.id === character.id));
});

// ── the compendium ──────────────────────────────────────────────────────
test("only the DM can import, and a preview changes nothing", async () => {
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<compendium version="5">
  <race><name>Azurian Demi-Elf</name><size>M</size><speed>30</speed>
    <ability>Dex +2, Cha +1</ability>
    <trait><name>Starlit</name><text>You see by starlight as if it were day.</text></trait></race>
  <feat><name>Dreamtouched</name><prerequisite>Dream 13</prerequisite>
    <text>Your Dream score counts as 1 higher for prerequisites.</text></feat>
  <monster><name>Should Be Ignored</name></monster>
</compendium>`;

  assert.equal((await api("tester", "POST", "/api/compendium/import", { xml })).status, 403);

  const preview = await api("dm", "POST", "/api/compendium/import", { xml, source: "Ephemer" });
  assert.equal(preview.preview, true);
  assert.equal(preview.counts.race, 1);
  assert.equal(preview.counts.feat, 1);
  assert.equal(preview.total, 2);                 // the monster is dropped, not counted
  assert.ok(preview.sample.some(s => s.includes("Azurian Demi-Elf")));

  // A preview saves nothing.
  assert.equal(((await api("tester", "GET", "/api/compendium")).entries || []).length, 0);

  const done = await api("dm", "POST", "/api/compendium/import", { xml, source: "Ephemer", commit: true });
  assert.equal(done.imported, 2);

  // Players read it, so the sheet can offer it.
  const { entries } = await api("tester", "GET", "/api/compendium");
  assert.equal(entries.length, 2);
  const race = entries.find(e => e.kind === "race");
  assert.equal(race.name, "Azurian Demi-Elf");
  assert.equal(race.source, "Ephemer");
  assert.equal(race.data.ability, "Dex +2, Cha +1");
  assert.equal(race.data.traits[0].name, "Starlit");
  assert.equal(race.data.speed, 30);

  // Re-importing the same file is an upsert, not a pile of duplicates.
  await api("dm", "POST", "/api/compendium/import", { xml, source: "Ephemer", commit: true });
  assert.equal((await api("tester", "GET", "/api/compendium")).entries.length, 2);

  assert.equal((await api("dm", "POST", "/api/compendium/import", { xml: "nope" })).status, 400);
  assert.equal((await api("dm", "POST", "/api/compendium/import",
    { xml: "<compendium></compendium>" })).status, 400);
});

// ── One player's seal on another player's character ─────────────────────
// This is the first thing in the app that lets a player change somebody else's numbers, so every
// edge of it is tried here rather than trusted to the dialog that offers it.
test("a seal's benefit lands on another player's character without touching their sheet", async () => {
  const mine = (await makeCharacter("tester", "Caster")).character;
  const theirs = (await makeCharacter("other", "Recipient")).character;

  const cast = await api("tester", "POST", "/api/effects", {
    fromCharacterId: mine.id, label: "Bless",
    targets: [theirs.id], benefits: [{ target: "ac", amount: 2, rounds: 10 }],
  });
  assert.equal(cast.status, 200);
  assert.equal(cast.granted, 1);

  // The recipient sees it on their own character...
  const on = await api("other", "GET", `/api/characters/${theirs.id}/effects`);
  assert.equal(on.effects.length, 1);
  assert.equal(on.effects[0].amount, 2);
  assert.equal(on.effects[0].label, "Bless");
  assert.equal(on.effects[0].player, "Caster");       // who cast it, by character

  // ...and their SHEET is untouched, which is the whole point: no version moved, so nothing they
  // were editing was lost and no save of theirs will come back a conflict.
  const after = await api("other", "GET", `/api/characters/${theirs.id}`);
  assert.equal(after.character.version, theirs.version);
  assert.deepEqual(after.character.sheet.modifiers, []);

  // The DM's board says so too, and names the seal and the caster rather than only counting —
  // "why is their AC 21" is the question it exists to answer.
  const board = await api("dm", "GET", "/api/characters/party");
  const card = board.party.find(p => p.id === theirs.id);
  assert.equal(card.granted, 1);
  assert.equal(card.grantedFrom, "Bless (Caster)");
  assert.equal(card.ac, 12);                          // and the number already has it in

  // The caster keeps the cast on their own side, as one thing, so concentration can end it.
  const out = await api("tester", "GET", `/api/characters/${mine.id}/effects/out`);
  assert.equal(out.out.length, 1);
  assert.equal(out.out[0].onWhom, "Recipient");
  assert.equal((await api("tester", "POST",
    `/api/effects/concentration/${out.out[0].group}/end`)).ended, 1);
  assert.equal((await api("other", "GET", `/api/characters/${theirs.id}/effects`)).effects.length, 0);
});

test("a derived benefit is worth the CASTER's number, and stays worth it", async () => {
  const mine = (await makeCharacter("tester", "Dreamer")).character;
  const theirs = (await makeCharacter("other", "Blessed")).character;
  // Dream moves only with the event that moved it (DM-02), note included.
  await api("dm", "PUT", `/api/characters/${mine.id}/dream`, { dream: 20, note: "a test" });  // +5

  const cast = await api("tester", "POST", "/api/effects", {
    fromCharacterId: mine.id, label: "Gate of Caelum", targets: [theirs.id],
    benefits: [{ target: "saveDc", from: "dream", times: 2 }],
  });
  assert.equal(cast.status, 200, JSON.stringify(cast));
  const [e] = (await api("other", "GET", `/api/characters/${theirs.id}/effects`)).effects;
  assert.equal(e.amount, 10);                          // twice the caster's +5
  assert.equal(e.formula, "twice your Dream modifier");

  // The caster's Dream falling does not reach back into what already landed.
  await api("dm", "PUT", `/api/characters/${mine.id}/dream`, { dream: 10, note: "and back" });
  assert.equal((await api("other", "GET", `/api/characters/${theirs.id}/effects`)).effects[0].amount, 10);
});

test("a cast can only come from your own character, and only reach a player's", async () => {
  const mine = (await makeCharacter("tester", "Mine")).character;
  const theirs = (await makeCharacter("other", "Theirs")).character;
  const dms = (await makeCharacter("dm", "A Monster")).character;
  const ok = { label: "X", benefits: [{ target: "ac", amount: 2 }] };

  // Casting FROM somebody else's character is refused outright.
  assert.equal((await api("tester", "POST", "/api/effects",
    { ...ok, fromCharacterId: theirs.id, targets: [mine.id] })).status, 403);

  // The DM's own characters are not on the roster and cannot be granted to — a player's seal does
  // not reach the NPCs from here.
  const roster = await api("tester", "GET", "/api/party/roster");
  assert.ok(roster.roster.some(r => r.id === theirs.id));
  assert.ok(!roster.roster.some(r => r.id === dms.id));
  assert.equal((await api("tester", "POST", "/api/effects",
    { ...ok, fromCharacterId: mine.id, targets: [dms.id] })).status, 400);

  // A target the engine has no row for never becomes one.
  assert.equal((await api("tester", "POST", "/api/effects",
    { fromCharacterId: mine.id, label: "X", targets: [theirs.id],
      benefits: [{ target: "morale", amount: 2 }] })).status, 400);
  // Nor does a forged amount.
  assert.equal((await api("tester", "POST", "/api/effects",
    { fromCharacterId: mine.id, label: "X", targets: [theirs.id],
      benefits: [{ target: "ac", amount: 500 }] })).status, 400);
});

test("either end can drop a granted effect, and nobody else can", async () => {
  const mine = (await makeCharacter("tester", "Giver")).character;
  const theirs = (await makeCharacter("other", "Taker")).character;
  const cast = async () => {
    await api("tester", "POST", "/api/effects", { fromCharacterId: mine.id, label: "Aid",
      targets: [theirs.id], benefits: [{ target: "maxHp", amount: 5 }] });
    return (await api("other", "GET", `/api/characters/${theirs.id}/effects`)).effects.at(-1);
  };

  // The recipient drops one that is on them.
  let e = await cast();
  assert.equal((await api("other", "DELETE", `/api/effects/${e.id}`)).status, 200);
  assert.equal((await api("other", "GET", `/api/characters/${theirs.id}/effects`)).effects.length, 0);

  // The caster takes one back.
  e = await cast();
  assert.equal((await api("tester", "DELETE", `/api/effects/${e.id}`)).status, 200);

  // A third player can do neither.
  e = await cast();
  await api("dm", "POST", "/api/admin/users",
    { username: "third", displayName: "Third", password: PLAYER_PASSWORD }).catch(() => {});
  await signIn("third", "third", PLAYER_PASSWORD);
  assert.equal((await api("third", "DELETE", `/api/effects/${e.id}`)).status, 403);
  assert.equal((await api("other", "GET", `/api/characters/${theirs.id}/effects`)).effects.length, 1);
});

// An account may hold 24 characters, and this suite makes a lot of them — so the kind tests share
// one pair rather than each minting its own and walking the whole file into that ceiling.
let KINDS = null;
async function kindsPair() {
  if (!KINDS) KINDS = {
    mine: (await makeCharacter("tester", "Giver2")).character,
    theirs: (await makeCharacter("other", "Taker2")).character,
  };
  return KINDS;
}

test("a seal can hand over healing, a resistance and an extra action, each as its own kind", async () => {
  const { mine, theirs } = await kindsPair();
  const cast = await api("tester", "POST", "/api/effects", {
    fromCharacterId: mine.id, label: "Mercy", targets: [theirs.id],
    benefits: [
      { kind: "heal", dice: "3d8" },
      { kind: "defence", dtype: "fire", standing: "resistant", rounds: 10 },
      { kind: "turn", turnKind: "bonus", n: 1, rounds: 3 },
      { kind: "advantage", target: "skill:perception", rounds: 10 },
    ],
  });
  assert.equal(cast.status, 200, JSON.stringify(cast));
  assert.equal(cast.granted, 4);

  const { effects } = await api("other", "GET", `/api/characters/${theirs.id}/effects`);
  const byKind = Object.fromEntries(effects.map(e => [e.kind, e]));
  assert.deepEqual(byKind.heal.payload, { dice: "3d8" });
  assert.deepEqual(byKind.defence.payload, { dtype: "fire", standing: "resistant" });
  assert.deepEqual(byKind.turn.payload, { turnKind: "bonus", n: 1 });
  // Advantage rides in the target column beside a modifier's, and carries no amount.
  assert.equal(byKind.advantage.target, "skill:perception");
  assert.equal(byKind.advantage.amount, 0);

  // The ongoing three reach the DM's board through the engine, like any other granted effect.
  const board = await api("dm", "GET", "/api/characters/party");
  const card = board.party.find(p => p.id === theirs.id);
  assert.equal(card.granted, 4);
});

test("a one-time grant is taken once, by its recipient, and never twice", async () => {
  const { mine, theirs } = await kindsPair();
  await api("tester", "POST", "/api/effects", {
    fromCharacterId: mine.id, label: "Mercy", targets: [theirs.id],
    benefits: [{ kind: "heal", dice: "2d4" }, { kind: "ac-bonus-that-is-not", target: "ac", amount: 2 }],
  });
  const open = (await api("other", "GET", `/api/characters/${theirs.id}/effects`)).effects;
  const heal = open.find(e => e.kind === "heal");
  const mod = open.find(e => e.kind === "modifier");

  // The caster cannot take it for them, and neither can anybody else.
  assert.equal((await api("tester", "POST", `/api/effects/${heal.id}/apply`)).status, 403);
  // An ongoing effect is not something you "take" — it is already on you.
  assert.equal((await api("other", "POST", `/api/effects/${mod.id}/apply`)).status, 400);

  assert.equal((await api("other", "POST", `/api/effects/${heal.id}/apply`, { note: "9 healed" })).status, 200);
  // Spent: it leaves the open list, and a second press changes nothing.
  const after = (await api("other", "GET", `/api/characters/${theirs.id}/effects`)).effects;
  assert.ok(!after.some(e => e.id === heal.id));
  assert.ok(after.some(e => e.id === mod.id));          // the ongoing one is untouched
  assert.equal((await api("other", "POST", `/api/effects/${heal.id}/apply`)).status, 400);
});

test("a benefit the engine has no row for never becomes a grant, whatever its kind", async () => {
  const { mine, theirs } = await kindsPair();
  const bad = b => api("tester", "POST", "/api/effects",
    { fromCharacterId: mine.id, label: "X", targets: [theirs.id], benefits: [b] });

  assert.equal((await bad({ kind: "heal", dice: "lots" })).status, 400);
  assert.equal((await bad({ kind: "defence", dtype: "sadness", standing: "resistant" })).status, 400);
  // A seal hands out benefits, so a vulnerability is refused even though it is a real standing.
  assert.equal((await bad({ kind: "defence", dtype: "fire", standing: "vulnerable" })).status, 400);
  assert.equal((await bad({ kind: "turn", turnKind: "interlude" })).status, 400);
  // Advantage is scoped by the modifier targets, so it cannot be pointed at something no roll asks.
  assert.equal((await bad({ kind: "advantage", target: "vibes" })).status, 400);
});

test("bad input is refused rather than coerced", async () => {
  assert.equal((await api("tester", "POST", "/api/characters", { name: "" })).status, 400);
  const { character } = await makeCharacter("tester", "Validated");
  assert.equal((await api("tester", "PUT", `/api/characters/${character.id}`, { sheet: "nope", version: 1 })).status, 400);
  assert.equal((await api("tester", "PUT", `/api/characters/${character.id}`, { sheet: {} })).status, 400);
  assert.equal((await api("dm", "PUT", `/api/characters/${character.id}/level`, { level: 21 })).status, 400);
  assert.equal((await api("dm", "PUT", `/api/characters/${character.id}/level`, { level: 0 })).status, 400);
  assert.equal((await api("dm", "PUT", `/api/characters/${character.id}/fate`, { fate: -1 })).status, 400);
  assert.equal((await api("tester", "GET", "/api/characters/999999")).status, 404);
});
