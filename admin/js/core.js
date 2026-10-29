// Ephemer — Admin: the frame.
//
// This used to be one page at the root — admin.html and a single 1,140-line admin.js — whose rail
// mixed the live party board, the reminders, the compendium, nine accounts and eight Grimms into
// one list of twenty rows. A player was three of those rows: their grants under Accounts, their
// Grimm under Grimms, their character on the board. Opening one gave a single scroll seven
// sections deep, a hundred Cognition chips somewhere in the middle of it.
//
// It is a section of its own now, like sheet/ and map/ and grimms/, and it is cut by TOPIC:
//
//   Table       the live board — the only one of the four you open while a session is running
//   Players     one page per player, tabbed: everything about that person in one place
//   Grimms      the chains, the two reveals and the ability grids, Grimm by Grimm
//   Compendium  what the Character Sheet offers when a player picks a class or a spell
//
// Reminders stopped being a row. It is a count in the bar that opens over whatever you are on,
// because an inbox is not a place you go.
//
// This file is the frame: sign-in, the shared helpers, the section router and that inbox. Each
// section registers itself with section() and is handed its slice of the boot payload by onData().
// They are plain scripts rather than ES modules, the way the rest of this app is written.

let ME = null;
let INDEX = [];              // the Cognition index — every entry, because this page is the DM's

// Every page below the root reaches the API the same way: grimms/ and map/ both write "../api/…".
// Doing it here instead of at four hundred call sites means a section's code reads the same as it
// did when this lived at the root.
const API_BASE = "../";

async function api(method, url, body) {
  const r = await fetch(API_BASE + url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Request failed (${r.status})`);
  return data;
}

function esc(t)     { return String(t).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }
function escAttr(s) { return String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'"); }
function escQ(t)    { return esc(t).replace(/"/g, "&quot;"); }
const sign = n => (Number(n) >= 0 ? "+" : "") + Number(n);
const cogName = id => INDEX.find(c => c.id === id)?.name || id;

function showErr(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg || ""; el.hidden = !msg;
}
function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2200);
}

// The painting, whole. The board shows a character's plate at 34px; this is the same picture at
// the size it was painted — `contain`, never cropped, which is the point of opening it. Click
// anywhere or press Escape. The <dialog> is in index.html, so Escape and the backdrop are the
// browser's job, exactly as the account and reminder dialogs already do it.
function lightbox(src, caption) {
  if (!src) return;
  const d = document.getElementById("lbox");
  d.innerHTML = `<img src="${escQ(src)}" alt="${escQ(caption || "")}">
    ${caption ? `<figcaption>${esc(caption)}</figcaption>` : ""}
    <span class="lbox-x" aria-hidden="true">×</span>`;
  d.showModal();
}

// ═══════════════════════════════════════════════════════════
//  SIGN-IN
// ═══════════════════════════════════════════════════════════
function signIn(e) {
  e.preventDefault();
  showErr("gateErr");
  api("POST", "api/login", {
    username: document.getElementById("gateUser").value,
    password: document.getElementById("gatePass").value,
  }).then(() => {
    document.getElementById("gate").hidden = true;
    document.getElementById("gatePass").value = "";
    boot();
  }).catch(err => showErr("gateErr", err.message));
  return false;
}
function openAccount() {
  document.getElementById("acctName").textContent = ME.displayName;
  showErr("acctErr");
  document.getElementById("acct").showModal();
}
function changePassword(e) {
  e.preventDefault();
  const cur = document.getElementById("acctCur"), next = document.getElementById("acctNew");
  api("POST", "api/password", { current: cur.value, next: next.value }).then(() => {
    cur.value = next.value = "";
    document.getElementById("acct").close();
    toast("Password changed");
  }).catch(err => showErr("acctErr", err.message));
  return false;
}
function signOut() { api("POST", "api/logout").finally(() => location.reload()); }

// ═══════════════════════════════════════════════════════════
//  THE SECTIONS
// ═══════════════════════════════════════════════════════════
// A section is a topic that minds its own business. It declares what its tab says, whether it
// wants the rail at all — the board and the compendium do not — and how to draw both halves.
//
//   mark, label, title   the tab in the section bar
//   count()              a number beside the label, or nothing
//   rail(), railFoot()   the left column; return null for a section that has no list to stand on
//   first()              what to select when you arrive with nothing chosen
//   body()               the right-hand page
//   enter(), leave()     for a section that has to start or stop something — only the board does
//   reload()             re-read whatever this section polls for itself
const SECTIONS = {};
const SEC_ORDER = ["table", "players", "grimms", "compendium"];
function section(key, def) { SECTIONS[key] = def; }

// Boot hands every section its slice of one payload. Registering a loader rather than letting each
// section fetch for itself is what turned five sequential round-trips into one.
const LOADERS = [];
function onData(fn) { LOADERS.push(fn); }

// Where we are. `sel` is always a STRING — it comes out of the location hash as one, and a player
// id compared against `u.id` with == rather than === is the kind of thing that works until it
// doesn't. `tab` is the player page's own tab, and nothing else uses it.
const UI = { sec: null, sel: null, tab: null };

function go(sec, sel, tab) {
  if (!SECTIONS[sec]) sec = SEC_ORDER[0];
  const fresh = UI.sec !== sec;
  if (fresh && UI.sec) SECTIONS[UI.sec].leave?.();
  UI.sec = sec;
  if (sel !== undefined && sel !== null) UI.sel = String(sel);
  else if (fresh || UI.sel == null) UI.sel = SECTIONS[sec].first?.() ?? null;
  // The tab belongs to the player page. Leaving the section drops it, or #/grimms would inherit
  // whichever tab you were last on and carry "…/grimm" around after it for no reason.
  UI.tab = fresh ? (tab ?? null) : (tab ?? (sel !== undefined && sel !== null ? null : UI.tab));
  if (fresh) SECTIONS[sec].enter?.();
  writeHash();
  draw();
  document.getElementById("adminBody").scrollTop = 0;
}
// Switching the tab inside a player page — the rail doesn't move, so only the body is redrawn.
function goTab(tab) {
  UI.tab = tab;
  writeHash();
  drawBody();
  document.getElementById("adminBody").scrollTop = 0;
}

function draw() { drawSecs(); drawRail(); drawBody(); }

function drawSecs() {
  document.getElementById("secs").innerHTML = SEC_ORDER.map(key => {
    const s = SECTIONS[key], n = s.count?.();
    return `<button class="a-sec ${UI.sec === key ? "on" : ""}" onclick="go('${key}')" title="${escQ(s.title)}"
      ${UI.sec === key ? 'aria-current="page"' : ""}>
      <span class="a-mark" aria-hidden="true">${s.mark}</span><span class="a-lbl">${esc(s.label)}</span>
      ${n ? `<span class="a-n">${n}</span>` : ""}</button>`;
  }).join("");
}
function drawRail() {
  const rail = document.getElementById("rail");
  const html = SECTIONS[UI.sec]?.rail?.();
  rail.hidden = html == null;
  if (html == null) return;
  document.getElementById("railList").innerHTML = html;
  const foot = SECTIONS[UI.sec].railFoot?.();
  document.getElementById("railFoot").innerHTML = foot || "";
  document.getElementById("railFoot").hidden = !foot;
}
function drawBody() {
  document.getElementById("adminBody").innerHTML = SECTIONS[UI.sec]?.body?.() ?? `<div class="empty">Nothing here.</div>`;
}

// ── The location hash ──────────────────────────────────────
// #/players/7/grimm, #/grimms/caelum, #/table. Worth the twenty lines: a reload keeps you where
// you were instead of dropping you back on the board, and a note in the vault can now link at a
// particular player's Paragon tab rather than saying "open Admin and find them".
let HASH_OURS = false;
function writeHash() {
  const bits = ["#", UI.sec];
  if (UI.sel != null) bits.push(encodeURIComponent(UI.sel));
  if (UI.tab) bits.push(UI.tab);
  HASH_OURS = true;
  location.hash = bits.join("/");
  setTimeout(() => { HASH_OURS = false; }, 0);
}
function readHash() {
  const [, sec, sel, tab] = (location.hash || "").split("/");
  return { sec: sec || SEC_ORDER[0], sel: sel ? decodeURIComponent(sel) : null, tab: tab || null };
}
window.addEventListener("hashchange", () => {
  if (HASH_OURS || !ME) return;
  const h = readHash();
  go(h.sec, h.sel, h.tab);
});

// ═══════════════════════════════════════════════════════════
//  THE INBOX — everything waiting on the DM
// ═══════════════════════════════════════════════════════════
// Two different things wait here — a Cognition tracked to 4/4, and a Pilgrimage on the road — and
// both belong to the Players section, which is where they are answered. So the sections contribute
// the items and this only counts them and puts them on screen. Over the page rather than beside
// it: answering one takes a click, and it should not cost you the place you were working in.
const INBOX = [];
function inbox(src) { INBOX.push(src); }         // { count(), render() }

const waitingCount = () => INBOX.reduce((n, s) => n + (s.count() || 0), 0);

function syncWaiting() {
  const n = waitingCount();
  const call = document.getElementById("remCall");
  call.hidden = !n;
  call.innerHTML = `<span aria-hidden="true">✦</span><b>${n}</b><i>waiting</i>`;
  document.getElementById("whoBtn").textContent = n ? `${ME.displayName} · ${n}` : ME.displayName;
  drawSecs();
  if (document.getElementById("rem").open) drawReminders();
}
function openReminders() {
  drawReminders();
  document.getElementById("rem").showModal();
}
function closeReminders() { document.getElementById("rem").close(); }
function drawReminders() {
  const html = INBOX.map(s => s.render()).filter(Boolean).join("");
  document.getElementById("remBody").innerHTML = html ||
    `<div class="cdx-note"><p>Nothing is waiting on you.</p></div>`;
}

// ═══════════════════════════════════════════════════════════
//  BOOT
// ═══════════════════════════════════════════════════════════
// The page is the DM's alone. The API refuses a player every admin call anyway; this is so they
// are told plainly rather than shown an interface that fails on every click.
async function boot() {
  let me = null;
  try { me = await fetch(API_BASE + "api/me"); } catch (e) {}
  if (!me || me.status === 404) return showLocked("This page needs the builder's own server — there are no accounts on a static host.");
  if (!me.ok) {
    document.getElementById("gate").hidden = false;
    document.getElementById("gateUser").focus();
    return;
  }
  ME = (await me.json()).user;
  if (ME.role !== "dm") return showLocked(`Signed in as ${ME.displayName}. Admin is the DM's.`);

  document.getElementById("whoBtn").textContent = ME.displayName;
  document.getElementById("who").hidden = false;
  document.getElementById("board").hidden = false;

  try {
    await refresh();
  } catch (err) {
    toast(err.message);
  }
  const h = readHash();
  go(h.sec, h.sel, h.tab);
}

// One call for the whole page. It used to be five, awaited one after another — the index, the Grimm
// state, the party, the compendium summary and the users — so the page sat empty for the length of
// all five. Every section still has its own endpoints for its own writes; this is only the arrival.
async function refresh() {
  const d = await api("GET", "api/admin/overview");
  INDEX = d.cognitions || [];
  for (const fn of LOADERS) fn(d);
  if (ME) syncWaiting();
}
// After a write: re-read, then redraw whatever is on screen.
async function reload() {
  try { await refresh(); } catch (err) { return toast(err.message); }
  draw();
}

function showLocked(why) {
  document.getElementById("locked").hidden = false;
  document.getElementById("lockedWhy").textContent = why;
}

// The account menu closes when you click away, the way it does everywhere else
document.addEventListener("click", e => {
  document.querySelectorAll("details.more[open]").forEach(d => { if (!d.contains(e.target)) d.open = false; });
});

// Last, so every section has registered itself by the time the first draw happens.
document.addEventListener("DOMContentLoaded", boot);
