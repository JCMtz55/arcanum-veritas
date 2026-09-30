// Ephemer — the Admin page: everything the DM keeps, and nothing a player needs.
//
// This page stands alone. The builder's scripts are not loaded here, so the whole DM interface
// stops being shipped to players who can never use it. What it does need is small: the domain
// tables and Ranks from js/data.js, the Grimm book from grimms/js/data.js, and the worked
// Paragon sets from js/paragon-examples.js.

let ME = null;

// ── The small shared helpers, restated here so this page owes the builder nothing ──
async function api(method, url, body) {
  let r;
  try {
    r = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    // "Failed to fetch" is the browser's phrase for never having reached a server. Say so plainly.
    const err = new Error("Couldn't reach the server.");
    err.offline = true;
    throw err;
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(data.error || `Request failed (${r.status})`);
    err.status = r.status;
    throw err;
  }
  return data;
}
function esc(t)      { return String(t).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }
function escAttr(s)  { return String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'"); }
function escQ(t)     { return esc(t).replace(/"/g, "&quot;"); }
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

// ── The cognition index, for granting and for the Paragon editor's picker ──
let INDEX = [];

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
    // Reload rather than carry on: the Grimm book is served per-session, so landing here signed
    // out means that script was turned away and never arrived. A reload fetches it with the
    // session in hand.
    location.reload();
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
//  BOOT
// ═══════════════════════════════════════════════════════════
// The page is the DM's alone. The API refuses a player every admin call anyway; this is so they
// are told plainly rather than shown an interface that fails on every click.
async function boot() {
  let me = null;
  try { me = await fetch("api/me"); } catch (e) {}
  if (!me || me.status === 404) return showLocked("This page needs the builder's own server — there are no accounts on a static host.");
  if (!me.ok) {
    document.getElementById("gate").hidden = false;
    document.getElementById("gateUser").focus();
    return;
  }
  ME = (await me.json()).user;
  if (ME.role !== "dm") return showLocked(`Signed in as ${ME.displayName}. The Admin page is the DM's.`);

  document.getElementById("whoBtn").textContent = ME.displayName;
  document.getElementById("who").hidden = false;
  document.getElementById("board").hidden = false;

  try {
    INDEX = (await api("GET", "api/cognitions")).cognitions;
    await loadGrimmState();
    await openAdmin();
  } catch (err) { toast(err.message); }
}
function showLocked(why) {
  document.getElementById("locked").hidden = false;
  document.getElementById("lockedWhy").textContent = why;
}
// ═══════════════════════════════════════════════════════════
//  ADMIN — players, and which Cognitions each may read
// ═══════════════════════════════════════════════════════════
const ADMIN = { users: [], sel: null };   // sel: a user id, "new", or "reminders"

// Reminders: a player has tracked a Cognition to 4/4 and it isn't enabled for them yet.
// A name the index doesn't know is listed apart — there is nothing to enable.
function adminPending(known = true) {
  return ADMIN.users.flatMap(u => u.learning
    .filter(l => l.depth === 4 && !!l.cognitionId === known && !u.cognitions.includes(l.cognitionId))
    .map(l => ({ user: u, ...l })));
}
// Everything waiting on the DM: a Cognition tracked to 4/4, and a Pilgrimage on the road
function adminWaiting() { return adminPending().length + adminPilgrimages().length; }
function syncAdminTab() {
  const n = adminWaiting();
  const el = document.getElementById("pendingOut");
  if (el) { el.textContent = n; el.parentNode.hidden = !n; }
  document.getElementById("whoBtn").textContent = n ? `${ME.displayName} · ${n}` : ME.displayName;
}
async function refreshAdmin() {
  ADMIN.users = (await api("GET", "api/admin/users")).users;
  syncAdminTab();
}
async function openAdmin() {
  try { await refreshAdmin(); } catch (err) { toast(err.message); }
  if (ADMIN.sel !== "new" && ADMIN.sel !== "reminders" && !ADMIN.users.some(u => u.id === ADMIN.sel))
    ADMIN.sel = adminWaiting() ? "reminders" : (ADMIN.users.find(u => u.role === "player") || ADMIN.users[0] || {}).id ?? "new";
  renderAdminList(); renderAdmin();
}
function openAdminUser(id) {
  ADMIN.sel = id;
  renderAdminList(); renderAdmin();
  document.getElementById("adminBody").scrollTop = 0;
}

function renderAdminList() {
  const box = document.getElementById("adminList");
  const n = adminWaiting();
  box.innerHTML = `<button class="cog ${ADMIN.sel === "reminders" ? "core" : ""}" onclick="openAdminUser('reminders')">
      <span class="ico">✦</span><span class="nm">Reminders</span>${n ? `<span class="rl dm">${n}</span>` : ""}</button>
    <div class="grp">Accounts<i></i></div>` + ADMIN.users.map(u =>
    `<button class="cog ${ADMIN.sel === u.id ? "core" : ""}" onclick="openAdminUser(${u.id})" title="${escQ(u.username)}${u.paragon ? " — walks the Paragon path" : ""}">
      <span class="ico">${u.role === "dm" ? "★" : u.paragon ? "✦" : "◆"}</span><span class="nm">${esc(u.displayName)}</span>
      <span class="rl ${u.role === "dm" ? "dm" : ""}">${u.role === "dm" ? "DM" : u.paragon ? `${(u.sworn || []).length}/3` : u.cognitions.length}</span></button>`).join("")
    + `<div class="grp">Grimms<i></i></div>` + (GRIMMS.grimms || []).map(g => {
      const on = ADMIN.sel === `g:${g.id}`;
      return `<button class="cog ${on ? "core" : ""}" onclick="openAdminUser('g:${escAttr(g.id)}')" title="${escQ(g.user)}">
        <span class="ico" style="color:${g.hue}">◈</span><span class="nm">${esc(g.name)}</span>
        <span class="rl">${grimmChains(g.id)}/3</span></button>`;
    }).join("");
}

function renderAdmin() {
  const host = document.getElementById("adminBody");
  if (ADMIN.sel === "new") {
    host.innerHTML = `<div class="cdx"><div class="cdx-hd"><div><h1>New player</h1>
        <p class="cdx-desc">One account per player at the table. They start with no Cognitions.</p></div></div>
      <form class="adm-form" onsubmit="return adminCreate(event)">
        <label for="admNewUser">Username — what they type to sign in</label>
        <input class="search" id="admNewUser" autocapitalize="none" spellcheck="false" pattern="[A-Za-z0-9_\\-]{2,32}" required>
        <label for="admNewName">Name shown in the builder</label>
        <input class="search" id="admNewName" maxlength="60">
        <label for="admNewPass">Password — at least 8 characters; leave empty to set it later</label>
        <input class="search" id="admNewPass" type="text" autocomplete="off" minlength="8">
        <div class="acct-row"><button class="mini on" type="submit">Create player</button></div>
      </form></div>`;
    return;
  }
  if (ADMIN.sel === "reminders") {
    const todo = adminPending(), loose = adminPending(false), roads = adminPilgrimages();
    host.innerHTML = `<div class="cdx"><div class="cdx-hd"><div><h1>Reminders</h1>
        <p class="cdx-desc">Players who have tracked a Cognition to 4/4, and Paragons waiting on a Pilgrimage. Nothing opens for them until you answer.</p></div></div>
      <div class="cdx-sec"><h2>Waiting to be enabled</h2>` +
      (todo.length ? `<div class="cdx-defs">` + todo.map(p =>
        `<div class="cdx-def"><b>${esc(p.user.displayName)}</b><span>has mastered <strong>${esc(p.name)}</strong></span>
          <button class="mini on" onclick="adminEnable(${p.user.id},'${escAttr(p.cognitionId)}')">Enable</button></div>`).join("") + `</div>`
        : `<div class="cdx-note"><p>Nothing is waiting.</p></div>`) + `</div>` +
      (roads.length ? `<div class="cdx-sec"><h2>Pilgrimages on the road</h2>
        <p class="cdx-rings">A Paragon swapping one Devotion for another. Walking it needs the arriving Cognition granted first.</p>
        <div class="cdx-defs">` + roads.map(p =>
          `<div class="cdx-def"><b>${esc(p.user.displayName)}</b>
            <span>${p.leaving ? `${esc(cogName(p.leaving))} → ` : "→ "}<strong>${esc(cogName(p.arriving))}</strong>${p.note ? ` — “${esc(p.note)}”` : ""}</span>
            <button class="mini" onclick="openAdminUser(${p.user.id})">Open</button>
            <button class="mini on" onclick="pilgrimAnswer(${p.id},'walked','${escAttr(cogName(p.arriving))}')">Walked</button></div>`).join("") + `</div></div>` : "") +
      (loose.length ? `<div class="cdx-sec"><h2>Mastered, but not in the builder</h2>
        <p class="cdx-rings">These names match no Cognition in index.json, so there is nothing to enable.</p>
        <div class="cdx-defs">` + loose.map(p =>
          `<div class="cdx-def"><b>${esc(p.user.displayName)}</b><span>${esc(p.name)}</span></div>`).join("") + `</div></div>` : "") +
      `</div>`;
    return;
  }
  if (String(ADMIN.sel).startsWith("g:")) { host.innerHTML = renderGrimmAdmin(String(ADMIN.sel).slice(2)); return; }
  const u = ADMIN.users.find(x => x.id === ADMIN.sel);
  if (!u) { host.innerHTML = `<div class="empty">Pick an account or a Grimm from the left.</div>`; return; }
  const dm = u.role === "dm", has = new Set(u.cognitions);

  let h = `<div class="cdx"><div class="cdx-hd"><div>
      <h1>${esc(u.displayName)}</h1>
      <div class="c-tags" style="margin-top:9px">
        <span class="t">signs in as ${esc(u.username)}</span>
        <span class="t">${dm ? "Dungeon Master" : "player"}</span>
        ${dm ? "" : `<span class="t">${has.size} of ${INDEX.length} Cognitions</span>`}
        ${u.hasPassword ? "" : `<span class="t hot">no password yet — can't sign in</span>`}
      </div></div></div>

    <div class="cdx-sec"><h2>Account</h2>
      <div class="adm-line">
        <input class="search" id="admName" value="${escQ(u.displayName)}" maxlength="60" aria-label="Name shown in the builder">
        <button class="mini" onclick="adminRename(${u.id})">Rename</button>
      </div>
      <div class="adm-line">
        <input class="search" id="admPass" type="text" autocomplete="off" placeholder="New password — at least 8 characters" aria-label="New password">
        <button class="mini" onclick="adminSetPassword(${u.id})">Set password</button>
      </div>
      ${dm ? "" : `<div class="adm-line"><button class="mini adm-del" onclick="adminDelete(${u.id})">Delete this player</button></div>`}
    </div>`;

  if (dm) {
    h += `<div class="cdx-sec"><h2>Cognitions</h2>
      <div class="cdx-note"><p>The DM reads every Cognition, held-back ones included. There is nothing to grant.</p></div></div>`;
  } else {
    h += `<div class="cdx-sec"><h2>Cognitions</h2>
      <p class="cdx-rings">Click to grant or take away — it is saved at once. A Cognition that isn't granted never reaches this player's browser.
        <strong>Held back</strong> ones can be granted ahead of time: the player sees the name marked “soon”, and its text only once it is set <code>ready</code> in index.json.</p>`;
    CAT_ORDER.concat([null]).forEach(key => {
      const rows = INDEX.filter(c => catOf(c) === key);
      if (!rows.length) return;
      h += `<div class="grp ${key || ""}" style="padding-left:0">${key ? CATEGORIES[key].label : "Uncategorised"}<i></i></div><div class="chips">` +
        rows.map(c => `<button class="chip ${has.has(c.id) ? "on" : ""} ${c.written === false ? "held" : ""}"
          onclick="adminToggle(${u.id},'${escAttr(c.id)}',this)" aria-pressed="${has.has(c.id)}"
          title="${escQ(c.name)}${c.written === false ? " — held back (not ready)" : ""}">${esc(c.name)}</button>`).join("") + `</div>`;
    });
    h += `</div>`;
    h += renderParAdmin(u);
    // The player's own tracker, as they keep it — read-only here
    h += `<div class="cdx-sec"><h2>Learning — kept by ${esc(u.displayName)}</h2>` +
      (u.learning.length ? `<div class="cdx-defs">` + u.learning.map(l =>
        `<div class="cdx-def"><b>${esc(l.name)}</b><span><span class="pips-ro">${pipText(l.depth)}</span> ${l.depth}/4${
          l.depth === 4 ? (l.cognitionId ? " — waiting for you to enable it" : " — not in the builder") : ""}</span></div>`).join("") + `</div>`
        : `<div class="cdx-note"><p>Nothing tracked yet.</p></div>`) + `</div>`;
  }
  host.innerHTML = h + `</div>`;
}
function pipText(d) { return "▰".repeat(d) + "▱".repeat(4 - d); }

function adminEnable(userId, cogId) {
  api("PUT", `api/admin/users/${userId}/cognitions/${encodeURIComponent(cogId)}`)
    .then(() => { toast("Enabled"); return openAdmin(); }).catch(err => toast(err.message));
}

async function adminToggle(userId, cogId, btn) {
  const u = ADMIN.users.find(x => x.id === userId);
  const on = !u.cognitions.includes(cogId);
  btn.disabled = true;
  try {
    await api(on ? "PUT" : "DELETE", `api/admin/users/${userId}/cognitions/${encodeURIComponent(cogId)}`);
    u.cognitions = on ? u.cognitions.concat(cogId) : u.cognitions.filter(x => x !== cogId);
    if (on) u.learning = u.learning.filter(l => l.cognitionId !== cogId);   // the server drops it from their tracker
    syncAdminTab(); renderAdminList(); renderAdmin();
  } catch (err) { btn.disabled = false; toast(err.message); }
}
function adminCreate(e) {
  e.preventDefault();
  api("POST", "api/admin/users", {
    username: document.getElementById("admNewUser").value,
    displayName: document.getElementById("admNewName").value,
    password: document.getElementById("admNewPass").value || undefined,
  }).then(r => { ADMIN.sel = r.id; toast("Player created"); return openAdmin(); })
    .catch(err => toast(err.message));
  return false;
}
function adminRename(id) {
  api("PATCH", `api/admin/users/${id}`, { displayName: document.getElementById("admName").value })
    .then(() => { toast("Renamed"); return openAdmin(); }).catch(err => toast(err.message));
}
function adminSetPassword(id) {
  api("PATCH", `api/admin/users/${id}`, { password: document.getElementById("admPass").value })
    .then(() => { toast("Password set — pass it on to the player"); return openAdmin(); }).catch(err => toast(err.message));
}
function adminDelete(id) {
  const u = ADMIN.users.find(x => x.id === id);
  if (!confirm(`Delete ${u.displayName}'s account and everything granted to it?`)) return;
  api("DELETE", `api/admin/users/${id}`)
    .then(() => { ADMIN.sel = null; toast("Player deleted"); return openAdmin(); }).catch(err => toast(err.message));
}

// ═══════════════════════════════════════════════════════════
//  ADMIN — THE PARAGON PATH
// ═══════════════════════════════════════════════════════════
// Two things on this page belong to the DM, and only two:
//   · whether the path is open to this player at all — a choice of identity, made with them
//   · which Devotions they may swear from, and a Devotion can only be a Cognition they have
//     already mastered, so the picker is drawn from their grants and from nothing else
//
// The Paragon Abilities are not here. A Paragon's power is built for one character, so it is
// written beside the Cognitions themselves — cognitions/devotions/<player>_<cognition>_devotion.json — and this
// page only reports whether a set exists for a given Devotion. Opening a Devotion with no set
// written is allowed: the player's card says so plainly.
//
// The third thing is the Pilgrimage. The rule asks the player for advance notice, so the notice
// arrives here and the DM answers it: walking one swaps the Devotions in a single step.

const PILGRIM_LABEL = { asked: "waiting on you", walked: "walked", declined: "declined" };

// Pilgrimages waiting on an answer, across every account — they join the waiting count
function adminPilgrimages() {
  return ADMIN.users.flatMap(u => (u.pilgrimage || []).map(p => ({ user: u, ...p })));
}

async function parAdminTogglePath(userId) {
  const u = ADMIN.users.find(x => x.id === userId);
  try {
    await api("PUT", `api/admin/users/${userId}/paragon`, { enabled: !u.paragon });
    u.paragon = !u.paragon;
    toast(u.paragon ? `${u.displayName} walks the Paragon path` : `${u.displayName} leaves the Paragon path`);
    renderAdmin();
  } catch (err) { toast(err.message); }
}

// Open or close one Devotion. The server refuses a Cognition this player hasn't mastered, so the
// rule holds even if this page is out of date.
async function devAdminToggle(userId, cogId, btn) {
  const u = ADMIN.users.find(x => x.id === userId);
  const on = !(u.devotions || []).includes(cogId);
  btn.disabled = true;
  try {
    await api(on ? "PUT" : "DELETE", `api/admin/users/${userId}/devotions/${encodeURIComponent(cogId)}`);
    await refreshAdmin();
    toast(on ? `${cogName(cogId)} is a Devotion ${u.displayName} may swear` : `${cogName(cogId)} closed`);
    renderAdminList(); renderAdmin();
  } catch (err) { btn.disabled = false; toast(err.message); }
}

async function pilgrimAnswer(id, status, label) {
  if (status === "walked" && !confirm(`Finish the Pilgrimage to ${label}? The old Devotion leaves and this one takes its place.`)) return;
  try {
    await api("PUT", `api/admin/pilgrimages/${id}`, { status });
    await refreshAdmin();
    toast(status === "walked" ? "The road is walked" : "Declined");
    renderAdminList(); renderAdmin();
  } catch (err) { toast(err.message); }
}

const cogName = id => INDEX.find(c => c.id === id)?.name || id;

// ── The section itself, on a player's Admin page
function renderParAdmin(u) {
  let h = `<div class="cdx-sec"><h2>Paragon path</h2>
    <p class="cdx-rings">A choice of identity, not a lesson — you open it. While it's closed,
      ${esc(u.displayName)} never sees it. <strong>While it's open they lose Arcanum Veritas and
      Ignition entirely</strong>: the builder gives them one Art, no Cognition rail and no seal
      card — only their Devotions.</p>
    <div class="adm-line" style="gap:9px">
      <button class="mini ${u.paragon ? "on" : ""}" onclick="parAdminTogglePath(${u.id})">
        ${u.paragon ? "✓ Walks the Paragon path" : "Open the Paragon path"}</button>
    </div>`;
  if (!u.paragon) return h + `</div>`;

  const open = new Set(u.devotions || []), sworn = new Set(u.sworn || []);
  const sets = new Map((u.devotionSets || []).map(s => [s.cog, s]));
  const mastered = INDEX.filter(c => u.cognitions.includes(c.id));

  // What the player has chosen out of the pool, and what is burning right now
  h += `<h3 class="adm-sub">Devotions — ${open.size} open · ${sworn.size} of 3 sworn</h3>
    <p class="cdx-rings">Click to open or close. A Devotion can only be a Cognition
      ${esc(u.displayName)} knows at <strong>Learn Full</strong>, so only their granted Cognitions
      are listed — grant one above first if it's missing. They then swear up to three of these and
      hold one in the Deeper Burn.</p>`;

  if (!mastered.length) {
    h += `<div class="cdx-note"><p>${esc(u.displayName)} has no Cognitions granted yet, so there is
      nothing that could become a Devotion.</p></div>`;
  } else {
    h += `<div class="chips">` + mastered.map(c => {
      const s = sets.get(c.id), isOpen = open.has(c.id), isSworn = sworn.has(c.id), burning = u.burning === c.id;
      const cls = ["chip", "dev-chip", isSworn ? "sworn" : isOpen ? "open" : "", burning ? "burning" : "", s ? "" : "unwritten"].filter(Boolean).join(" ");
      const why = s ? `“${s.name}” is written for them` : "no abilities written yet — their card will say so";
      return `<button class="${cls}" onclick="devAdminToggle(${u.id},'${escAttr(c.id)}',this)" aria-pressed="${isOpen}"
        title="${escQ(c.name)} — ${escQ(why)}${burning ? " · burning now" : isSworn ? " · sworn" : isOpen ? " · open, not sworn" : ""}">${esc(c.name)}${burning ? " ✦" : ""}</button>`;
    }).join("") + `</div>
    <p class="dev-legend"><strong>plain</strong> mastered, not a Devotion ·
      <strong style="color:#9BD5BA">jade</strong> open to them ·
      <strong style="color:#7BC2A4">filled</strong> sworn · <strong>✦</strong> burning ·
      <em>dashed</em> no abilities written for it yet</p>`;
  }

  // Sets written for a Cognition they haven't mastered — the Pilgrimage cases
  const waiting = (u.devotionSets || []).filter(s => !u.cognitions.includes(s.cog));
  if (waiting.length)
    h += `<h3 class="adm-sub">Written, but not mastered</h3>
      <p class="cdx-rings">Abilities exist for these, and they can't become Devotions until
        ${esc(u.displayName)} reaches Learn Full — which is what a Pilgrimage is for.</p>
      <div class="cdx-defs">` + waiting.map(s =>
        `<div class="cdx-def"><b>${esc(s.name)}</b><span>Devotion of ${esc(cogName(s.cog))} — grant ${esc(cogName(s.cog))} above to open it</span></div>`).join("") + `</div>`;

  // Pilgrimages: the advance notice, answered
  const asked = u.pilgrimage || [];
  if (asked.length) {
    h += `<h3 class="adm-sub">Pilgrimage — ${asked.length} waiting</h3>
      <div class="cdx-defs">` + asked.map(p =>
      `<div class="cdx-def"><b>${esc(cogName(p.arriving))}</b>
        <span>${p.leaving ? `in place of ${esc(cogName(p.leaving))}` : "into a free Devotion"}${p.note ? ` — “${esc(p.note)}”` : ""}</span>
        <button class="mini on" onclick="pilgrimAnswer(${p.id},'walked','${escAttr(cogName(p.arriving))}')">Walked</button>
        <button class="mini adm-del" onclick="pilgrimAnswer(${p.id},'declined','')">Decline</button></div>`).join("") + `</div>
      <p class="hint" style="font-style:normal">Walking it closes the old Devotion and opens the new
        one in one step. ${esc(u.displayName)} must have mastered the arriving Cognition first —
        grant it above, then walk the road.</p>`;
  } else {
    h += `<h3 class="adm-sub">Pilgrimage</h3>
      <div class="cdx-note"><p>No Pilgrimage on the road. ${esc(u.displayName)} raises one from
        their own sheet when they want to swap a Devotion, and it appears here.</p></div>`;
  }

  h += `<h3 class="adm-sub">Where the abilities live</h3>
    <div class="cdx-note"><p>Paragon Abilities are written for each character, so they aren't typed
      into this page — they're authored in <code>cognitions/devotions/<player>_<cognition>_devotion.json</code>,
      beside the Cognitions. A set names its <code>player</code> and its <code>cognition</code>,
      groups its abilities the way a Cognition groups <code>verumEffects</code>, and gives each one
      a four-entry <code>tiers</code> ladder for Ranks I–IV. The server hands a set to nobody but
      the player it names.</p></div>`;
  return h + `</div>`;
}

// ═══════════════════════════════════════════════════════════
//  ADMIN — THE GRIMMS
// ═══════════════════════════════════════════════════════════
// The chains, each Grimm's Reality Shift and which of its abilities its user may compose. The
// Companion reads the same state through api/grimms/state; it used to carry these controls
// inline, and now only reads them. A hidden Shift's text is never sent to that player's browser.
const GRIMMS = window.GRIMM_DATA || { grimms: [] };
// The same wording the Companion uses, so a chain reads the same to the DM and to its user
const CHAIN_STATE = ["Unchained", "Fraying", "Loosened", "Bound"];
const CHAIN_FX = {
  3: "The pact is whole. The Grimm behaves per its stage.",
  2: "The Grimm's voice grows more independent — it speaks unprompted, hesitates a half-beat, watches you when it thinks itself unobserved.",
  1: "The Grimm may act on its own once per session (DM). Its abilities run hot. Every Dream Saving Throw to hold the last chain is +2 to +5 DC.",
  0: "The user dies and the Grimm Unchains.",
};
// chains by Grimm id, and the DM's switches: "shift", or "a:<ability id>"
let GRIMM_CHAINS = {}, GRIMM_TOGGLES = {};

async function loadGrimmState() {
  const s = await api("GET", "api/grimms/state");
  GRIMM_CHAINS = s.chains || {};
  GRIMM_TOGGLES = s.toggles || {};
}
function grimmById(id)   { return (GRIMMS.grimms || []).find(g => g.id === id); }
function grimmChains(id) { const n = GRIMM_CHAINS[id]; return n === undefined ? 3 : n; }
// Abilities are open unless the DM has switched one off; a Reality Shift stays hidden until revealed
function shiftOn(id)        { return GRIMM_TOGGLES[id]?.shift === true; }
function abilityOn(id, aid) { return GRIMM_TOGGLES[id]?.[`a:${aid}`] !== false; }

async function setChains(id, n) {
  n = Math.max(0, Math.min(3, n));
  if (n === grimmChains(id)) return;
  try {
    await api("PUT", `api/admin/grimms/${id}/chains`, { chains: n });
    GRIMM_CHAINS[id] = n;
    renderAdminList(); renderAdmin();
  } catch (err) { toast(err.message); }
}
async function setToggle(gid, key, enabled) {
  try {
    await api("PUT", `api/admin/grimms/${gid}/toggles/${encodeURIComponent(key)}`, { enabled });
    (GRIMM_TOGGLES[gid] = GRIMM_TOGGLES[gid] || {})[key] = enabled;
    renderAdmin();
  } catch (err) { toast(err.message); }
}

function chainIcons(n) {
  let h = "";
  for (let i = 0; i < 3; i++) h += `<span class="chain ${i >= n ? "broken" : ""}">⛓</span>`;
  return h;
}

function renderGrimmAdmin(id) {
  const g = grimmById(id);
  if (!g) return `<div class="empty">No such Grimm.</div>`;
  const n = grimmChains(id), sh = shiftOn(id);

  let h = `<div class="cdx"><div class="cdx-hd"><div>
      <h1 style="color:${g.hue}">${esc(g.name)}</h1>
      <p class="cdx-desc">${esc(g.user)}</p>
      <div class="c-tags" style="margin-top:9px">
        <span class="t">${esc(CHAIN_STATE[n])}</span>
        <span class="t">${g.abilities.length} abilities</span>
        ${g.shift ? `<span class="t ${sh ? "hot" : ""}">Reality Shift ${sh ? "revealed" : "hidden"}</span>` : ""}
      </div></div></div>

    <div class="cdx-sec"><h2>The Three Chains</h2>
      <p class="cdx-rings">Players see the chains on their sheet. Breaking one is the DM's to do.</p>
      <div class="adm-line" style="gap:12px">
        <div class="step"><button onclick="setChains('${escAttr(id)}',${n - 1})" aria-label="Break a chain">–</button><span>${n}</span><button onclick="setChains('${escAttr(id)}',${n + 1})" aria-label="Restore a chain">+</button></div>
        <span class="chains shown">${chainIcons(n)}</span>
        <span class="t">${esc(CHAIN_STATE[n])}</span>
      </div>
      <p class="hint" style="font-style:normal">${esc(CHAIN_FX[n])}</p></div>`;

  if (g.shift) {
    h += `<div class="cdx-sec"><h2>Reality Shift — ${esc(g.shift.name)}</h2>
      <p class="cdx-rings">While it's hidden its text never reaches that player's browser.</p>
      <div class="adm-line" style="gap:10px">
        <button class="mini ${sh ? "on" : ""}" onclick="setToggle('${escAttr(id)}','shift',${!sh})">
          ${sh ? "✓ Revealed" : "Reveal it"}</button>
        ${sh ? `<span class="hint" style="margin:0">Their sheet can read it now.</span>` : ""}
      </div></div>`;
  }

  h += `<div class="cdx-sec"><h2>Abilities</h2>
    <p class="cdx-rings">Click to allow or deny. An ability switched off leaves that player's loadout and ability pool the next time their Companion loads.</p>
    <div class="chips">` + g.abilities.map(a => {
      const on = abilityOn(id, a.id);
      return `<button class="chip ${on ? "on" : ""}" onclick="setToggle('${escAttr(id)}','a:${escAttr(a.id)}',${!on})"
        title="${on ? "On — click to take it away" : "Off — click to give it back"}">${esc(a.name)}</button>`;
    }).join("") + `</div></div></div>`;
  return h;
}

// The account menu closes when you click away, the way it does everywhere else
document.addEventListener("click", e => {
  document.querySelectorAll("details.more[open]").forEach(d => { if (!d.contains(e.target)) d.open = false; });
});

boot();
