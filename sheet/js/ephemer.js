// The join to Ephemer's own systems.
//
// A Cognition belongs to the ACCOUNT, not to the character: the DM grants it to a player, and that
// player may have two characters or none. So none of this lives in the sheet's JSON — it is read
// from the same routes the Arcanum Veritas builder reads, and written back to the same ones. There
// is one record of what you know and one tracker of what you are learning, and this is a second
// window onto them rather than a second copy.
//
// WHY IT IS HERE AT ALL. The builder has had these since before the sheet existed, and a player has
// been keeping two tabs open to run one character — the Cognitive Saving Throw on one screen and
// the Cognitions it is rolled for on another. The sheet is where the character is.
//
// Loaded on demand, the first time the Dream tab is opened: a player who never opens it never pays
// for the three requests, and a static host with no API behind it simply shows nothing.

import { api, state, emit } from "./store.js";
import { esc } from "./pop.js";

let loading = null;

// ── the Grimm's own data ────────────────────────────────────────────────
// `grimms/js/data.js` is generated from the vault and sets one global. It is half a megabyte, so it
// is pulled in ONCE and only when the Dream tab is first opened — and at exactly the URL the Admin
// page uses, version query included, so the browser serves both tools from one cache entry.
const GRIMM_DATA_URL = "../grimms/js/data.js?v=2026-10-28a";
let grimmScript = null;

function loadGrimmData() {
  if (window.GRIMM_DATA) return Promise.resolve(window.GRIMM_DATA);
  if (grimmScript) return grimmScript;
  grimmScript = new Promise(resolve => {
    const s = document.createElement("script");
    s.src = GRIMM_DATA_URL;
    // A sheet on a host with no Grimm data is a sheet without this card, not a broken page.
    s.onload = () => resolve(window.GRIMM_DATA || null);
    s.onerror = () => { grimmScript = null; resolve(null); };
    document.head.append(s);
  });
  return grimmScript;
}

// ── the abilities' prose ────────────────────────────────────────────────
// An ability's text is vault markdown — bold, lists, the occasional table — and this sheet has no
// renderer of its own; everywhere else it shows text it is text somebody typed, escaped into a
// `white-space: pre-wrap` block. Rather than write a second renderer that would drift from the one
// the Companion uses on the very same strings, it borrows that one: `grimms/js/md.js` is a classic
// script setting a global `md()`, pulled in the same lazy way as the book beside it.
//
// Its own `esc` lands on the global object too. Nothing on this page reads that — the sheet is
// modules, whose `esc` is their own, and `js/tools.js` has none — but it is the sort of thing worth
// writing down. If the script never arrives, the text is shown escaped rather than not at all.
const GRIMM_MD_URL = "../grimms/js/md.js?v=2026-11-17a";
let mdScript = null;

function loadGrimmMd() {
  if (window.md) return Promise.resolve(true);
  if (mdScript) return mdScript;
  mdScript = new Promise(resolve => {
    const s = document.createElement("script");
    s.src = GRIMM_MD_URL;
    s.onload = () => resolve(!!window.md);
    s.onerror = () => { mdScript = null; resolve(false); };
    document.head.append(s);
  });
  return mdScript;
}

export function grimmProse(text) {
  const t = String(text || "").trim();
  if (!t) return "";
  if (window.md) return window.md(t);
  return `<p>${esc(t).replace(/\n{2,}/g, "</p><p>").replace(/\n/g, "<br>")}</p>`;
}

// Whose Grimm is whose. The DM assigns it on the Admin page and the account carries the answer, so
// this reads `grimmId` off /api/me. Nothing is typed in here and nothing is stored on the character,
// because the Grimm belongs to the PLAYER — a player with two characters holds one Grimm across
// both, and one with none still holds it.
//
// There is no matching left to do here. `grimmId` is already the answer — the DM's assignment, or,
// for an account not assigned one yet, the old name match that the SERVER stands in for them. That
// fallback belongs there and not here: it has to refuse a Grimm another account is assigned, and
// this page can only see its own. `grimmAssigned` says which of the two it was.
export function myGrimm() {
  const id = state.me?.grimmId;
  if (!id || !state.grimmData) return null;
  return (state.grimmData.grimms || []).find(g => g.id === id) || null;
}

// Everything at once, because the three answers are small and meaningless apart: which Cognitions
// you have, which you are working toward, and the names you may pick from (which is the set
// difference the server computes so the browser never sees the ones you have not been granted).
export async function ensure(force = false) {
  if (!force && (state.cognitions || loading)) return loading;
  loading = (async () => {
    try {
      // ⚠️ Unpacked BY POSITION. A new call goes in at the same index in both lists, or something
      // else silently gets its answer.
      const [mine, learning, names, grimms, souls, live, data, ignitions, paragon] = await Promise.all([
        api("GET", "../api/cognitions"),
        api("GET", "../api/learning"),
        api("GET", "../api/learning/names"),
        api("GET", "../api/grimms/state"),
        api("GET", "../api/grimms/souls"),
        api("GET", "../api/grimms/live"),
        loadGrimmData(),
        api("GET", "../api/ignitions"),
        api("GET", "../api/paragon"),
        // Last, and unpacked by nobody: it only has to have finished before anything is drawn.
        loadGrimmMd(),
      ]);
      state.cognitions = mine.cognitions || [];
      state.learning = learning.learning || [];
      state.learnNames = names.names || [];
      state.grimmState = grimms || { chains: {}, toggles: {} };
      state.grimmSouls = souls || { grimms: {}, adopted: [] };
      state.grimmLive = live?.grimms || {};
      state.grimmData = data;
      // An account with no Ignitions written for it, and one the Paragon path is not open to, are
      // both ordinary answers — each card simply does not appear.
      state.ignitions = ignitions.ignitions || [];
      state.paragon = paragon || null;
      state.ephemerError = "";
    } catch (err) {
      // An account with none of this, or a deployment without the API, is a normal answer and not
      // an error the player should be shouted at about — but a real failure has to say so.
      state.cognitions = state.cognitions || [];
      state.learning = state.learning || [];
      state.learnNames = state.learnNames || [];
      state.grimmState = state.grimmState || { chains: {}, toggles: {} };
      state.grimmSouls = state.grimmSouls || { grimms: {}, adopted: [] };
      state.grimmLive = state.grimmLive || {};
      state.grimmData = state.grimmData || null;
      state.ignitions = state.ignitions || [];
      state.paragon = state.paragon || null;
      state.ephemerError = err.offline ? "" : err.message;
    }
    loading = null;
    emit();
  })();
  return loading;
}

// The tracker writes straight through: it is the DM's reminder as much as the player's note, and a
// depth that only existed in one browser would be neither.
// ── the Grimm Slots ─────────────────────────────────────────────────────
// What this page knows about them is whatever the server last said, and nothing else: it does not
// hold the rule for how many slots a stage has, which order the temporary ones are spent in, or
// what Familiar form forbids. It asks for one slot to be spent or given back and is told what the
// row says afterwards. ⭐ That is deliberate — the Companion already owns those rules and has to
// keep them for the static-host case, so a second copy here would be a third version of the truth.
//
// `ensure(true)` is NOT used: a pip tapped at a table should not re-fetch eight endpoints.
export function myLive(grimm) {
  return (state.grimmLive || {})[grimm] || null;
}
// The other half of the sync: a slot spent in the Companion has to arrive here too. Only this one
// call, not the whole of `ensure()` — coming back to the window should not re-fetch nine endpoints,
// and the slots are the one thing on this card that moves minute to minute.
export async function refreshLive() {
  if (!state.grimmLive) return;        // this card has never been opened; nothing to bring up to date
  try {
    const live = await api("GET", "../api/grimms/live");
    state.grimmLive = live?.grimms || {};
    emit();
  } catch (e) { /* offline, or a server that has none of this — leave what is on screen */ }
}

// A rest taken here reaches the Grimm too (Juan, 2026-11-17). A LONG one restores the Grimm Slots,
// which are the half the two screens share; a SHORT one changes nothing shared at all — its whole
// effect is the Servant charges whose rule says a short rest refills them, and only the Companion
// knows which those are. Both leave a stamp, and that stamp is how it is told to finish its half.
//
// It answers with the Grimm's name so the rest's own toast can say what else happened, and `null`
// when there is nothing to rest — no Grimm assigned, or no server behind the page.
export async function grimmRest(kind = "long") {
  // ⚠️ None of this is loaded until the Dream or Grimm tab is opened, and a player can rest without
  // ever having opened either in this session — which is exactly how it failed the first time. So
  // the rest is what loads it, if nothing else has.
  if (!state.grimmData || !state.grimmLive) await ensure().catch(() => {});
  const g = myGrimm();
  if (!g || !state.grimmLive) return null;
  try {
    const r = await api("POST", `../api/grimms/live/${encodeURIComponent(g.id)}/rest`, { kind });
    state.grimmLive = { ...(state.grimmLive || {}), [g.id]: r.live };
    emit();
    return { name: g.name, kind, live: r.live };
  } catch (err) { return null; }
}

export async function slotDelta(grimm, delta) {
  const r = await api("POST", `../api/grimms/live/${encodeURIComponent(grimm)}/slots`, { delta });
  state.grimmLive = { ...(state.grimmLive || {}), [grimm]: r.live };
  emit();
  return r.live;
}

export async function setDepth(name, depth) {
  await api("PUT", "../api/learning", { name, depth });
  return ensure(true);
}
export async function dropLearning(name) {
  await api("DELETE", `../api/learning/${encodeURIComponent(name)}`);
  return ensure(true);
}

// A Cognition's own category, for the tint. The builder colours by this and the sheet follows it,
// so the same Cognition is the same colour in both places.
export const CATEGORIES = ["elemental", "mores", "fate", "cosmic", "life", "mind"];
export const categoryOf = c => (CATEGORIES.includes(c?.category) ? c.category : "");
