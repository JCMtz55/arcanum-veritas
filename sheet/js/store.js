// The sheet's state and its conversation with the server.
//
// One rule shapes this whole file: a save is bound to the character it was made on, by id AND by
// version, and never to "whichever character is selected right now". The previous attempt at this
// tool debounced its writes against a mutable global, so switching characters inside the debounce
// window could write one player's edits onto another's sheet — the audit's highest-priority finding.
// Here `flush` takes the id and version it was queued with, and switching characters flushes first.

import * as rules from "./rules.js";

export const state = {
  me: null,
  list: [],            // every character this account owns
  current: null,       // the one on screen: { id, version, name, level, dream, fate, honor, ... sheet }
  unlocks: [],
  save: "idle",        // "idle" | "saving" | "saved" | "error" | "conflict"
  saveError: "",
  view: "combat",      // which centre tab
  inInsomnia: false,   // where the character is standing, which the attunement rules care about
  classPlan: null,     // what the classes imply, derived; null until the catalogue has answered
  // Ephemer's own systems, which live on the ACCOUNT rather than on the character — the DM grants
  // them to a player, not to a sheet. Null until the Dream tab has asked for them once.
  cognitions: null,    // the Cognitions this account has been granted
  learning: null,      // their own tracker: [{ name, depth }]
  learnNames: null,    // the names of the ones they do not have yet, for the picker
  ephemerError: "",
};

const listeners = new Set();
export const onChange = fn => { listeners.add(fn); return () => listeners.delete(fn); };
export function emit() { for (const fn of listeners) fn(); }

// ── talking to the server ───────────────────────────────────────────────
// Same shape as the builder's api(): fetch only throws when nothing answered at all, and the
// browser's own words for that ("Failed to fetch") tell nobody anything.
export async function api(method, url, body) {
  let r;
  try {
    r = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    const err = new Error("Couldn't reach the server.");
    err.offline = true;
    throw err;
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(data.error || `Request failed (${r.status})`);
    err.status = r.status;
    err.data = data;
    throw err;
  }
  return data;
}

export async function boot() {
  state.me = (await api("GET", "../api/me")).user;
  await refreshList();
  const last = Number(localStorage.getItem("ouas-sheet:last") || 0);
  const pick = state.list.find(c => c.id === last) || state.list[0];
  if (pick) await select(pick.id);
  emit();
}

export async function refreshList() {
  state.list = (await api("GET", "../api/characters")).characters;
}

// ── which character is on screen ────────────────────────────────────────
export async function select(id) {
  if (state.current && state.current.id !== id) await flushNow();   // never carry edits across
  const { character } = await api("GET", `../api/characters/${id}`);
  state.current = normalise(character);
  try { localStorage.setItem("ouas-sheet:last", String(id)); } catch {}
  await loadUnlocks();
  state.save = "idle"; state.saveError = "";
  emit();
}

export async function create(name) {
  const { character } = await api("POST", "../api/characters", { name });
  await refreshList();
  await select(character.id);
  return character;
}

// A sheet saved before a field existed gets it filled in on load, rather than rendering `undefined`
// — the same trick the Grimm Companion uses, and the reason blankCharacter lives in the engine.
function normalise(character) {
  const blank = rules.blankCharacter();
  const sheet = { ...blank, ...(character.sheet || {}) };
  sheet.abilities = { ...blank.abilities, ...(character.sheet?.abilities || {}) };
  for (const k of ["saves", "skills", "skillAbility", "spells", "equipment", "used", "hitDiceUsed",
                   "coins"])
    sheet[k] = { ...blank[k], ...(character.sheet?.[k] || {}) };
  for (const k of ["modifiers", "actions", "grants", "injuries", "attacks", "features", "inventory",
                   "attuned", "conditions", "carried", "anatomy"])
    sheet[k] = Array.isArray(character.sheet?.[k]) ? character.sheet[k] : (blank[k] || []);
  return { ...character, sheet };
}

// The character as the rules engine wants it: the DM's columns win over anything left in the JSON,
// so a stale level in an old save can never beat the column the DM set. Mirrors the server's forRules.
export function derived() {
  const c = state.current;
  if (!c) return null;
  return {
    ...c.sheet,
    abilities: { ...c.sheet.abilities, dream: c.dream },
    level: c.level, fate: c.fate,
    honor: c.honor, morality: c.morality,
    // Where the character is standing travels with them, because an item's effects depend on it: a
    // Dreamlike item is inactive while awake, and the engine must not have to be told twice.
    inInsomnia: state.inInsomnia,
  };
}

// ── editing ─────────────────────────────────────────────────────────────
// Every change goes through here, so the autosave hangs off one place rather than forty call sites.
let timer = null, pending = null;
const DEBOUNCE = 700;

export function mutate(fn, { now = false } = {}) {
  const c = state.current;
  if (!c) return;
  fn(c.sheet);
  // Remember WHICH character and WHICH version this edit belongs to, at the moment it is made.
  pending = { id: c.id, version: c.version, name: c.name };
  state.save = "saving";
  emit();
  clearTimeout(timer);
  if (now) return flushNow();
  timer = setTimeout(flushNow, DEBOUNCE);
}

export async function flushNow() {
  clearTimeout(timer); timer = null;
  const job = pending;
  if (!job) return;
  pending = null;

  // The sheet being sent is the one belonging to the queued id, not whatever is selected now.
  const target = state.current && state.current.id === job.id ? state.current : null;
  if (!target) return;                       // the character was closed; its last edit went with it

  try {
    const { character } = await api("PUT", `../api/characters/${job.id}`, {
      sheet: target.sheet, name: job.name, version: job.version,
    });
    // Only adopt the answer if it is still the character on screen.
    if (state.current && state.current.id === character.id) {
      state.current = { ...normalise(character), sheet: state.current.sheet };
      state.current.version = character.version;
      state.save = "saved"; state.saveError = "";
    }
  } catch (err) {
    if (err.status === 409) {
      state.save = "conflict";
      state.saveError = err.message;
      state.conflict = err.data?.character || null;
    } else {
      state.save = "error";
      state.saveError = err.message;
      pending = job;                         // keep it, so a retry has something to send
    }
  }
  emit();
}

export async function retrySave() {
  if (!pending && state.current) pending = { id: state.current.id, version: state.current.version, name: state.current.name };
  state.save = "saving"; emit();
  await flushNow();
}

// Taking the server's copy after a conflict. The alternative — silently keeping the local sheet —
// is how one device quietly erases another, so this is always the player's explicit choice.
export async function takeServerCopy() {
  if (!state.current) return;
  pending = null;
  state.conflict = null;
  await select(state.current.id);
}

export function rename(name) {
  if (!state.current) return;
  state.current.name = name;
  mutate(() => {}, { now: true });
}

// ── the DM's columns, and what a player may spend ───────────────────────
export async function loadUnlocks() {
  if (!state.current) return;
  try {
    state.unlocks = (await api("GET", `../api/characters/${state.current.id}/unlocks`)).unlocks;
  } catch { state.unlocks = []; }
}

// A level is opened on the DM's screen, and the button for it has to turn up on the player's without
// anyone being told to reload — "it appears when your DM enables the level" is the whole promise.
// So the open tokens are re-read on a slow timer: only this one small list, never the sheet, which
// the player may be editing. A redraw happens only when the set has actually changed, and nothing
// polls at all while the tab is in the background.
const UNLOCK_POLL = 25_000;
let unlockKey = "";
setInterval(async () => {
  if (document.hidden || !state.current || state.save === "conflict") return;
  const before = unlockKey;
  await loadUnlocks();
  unlockKey = openUnlocks().map(u => `${u.id}:${u.target_level || ""}`).join(",");
  if (unlockKey !== before) emit();
}, UNLOCK_POLL);
export const openUnlocks = () => state.unlocks.filter(u => !u.consumed_at);
// The level the DM has allowed and the player has not taken yet — what the LEVEL UP button is for.
// There is at most one open at a time (the server refuses a second), and the lowest one goes first
// so a DM who set two levels at once is walked up them in order.
export const pendingLevel = () => openUnlocks()
  .filter(u => u.kind === "level" && u.target_level)
  .sort((a, b) => a.target_level - b.target_level)[0] || null;

// Spending an unlock. A level token also moves the level column, server-side, in the same statement
// that spends it — so the answer carries the character back and the DM's columns are taken from it
// rather than assumed. The sheet underneath is untouched: it is the caller's to write.
export async function consumeUnlock(id, choice) {
  const out = await api("POST", `../api/characters/${state.current.id}/unlocks/${id}/consume`, { choice });
  if (out.character && state.current && state.current.id === out.character.id) {
    const { level, dream, fate, honor, morality, unspent } = out.character;
    Object.assign(state.current, { level, dream, fate, honor, morality, unspent });
  }
  await loadUnlocks();
  emit();
  return out;
}

export async function allocate(axis) {
  const { character } = await api("POST", `../api/characters/${state.current.id}/allocate`, { axis });
  // The axis scores and the unspent counts are the server's; take them and leave the sheet alone.
  Object.assign(state.current, {
    honor: character.honor, morality: character.morality, unspent: character.unspent,
  });
  emit();
}

// A Fate use. The id is generated here, before the roll, and the server's primary key on it is what
// makes a retry cost one charge instead of two.
export async function spendFate({ emphasis, original, note }) {
  const useId = `use-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const out = await api("POST", `../api/characters/${state.current.id}/fate/spend`,
    { useId, emphasis, original, note });
  state.current.fate = out.fate;
  emit();
  return out;
}

export async function events(limit = 40) {
  const { events } = await api("GET", `../api/characters/${state.current.id}/events`);
  return events.slice(0, limit);
}

// Leaving with an edit still queued would lose it. The debounce is short, so this almost never
// fires; when it does, the browser asks before the tab goes.
window.addEventListener("beforeunload", e => {
  if (pending) { e.preventDefault(); e.returnValue = ""; }
});
