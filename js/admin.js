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
    await loadParty();        // so the rail can say how many characters there are before it is opened
    await loadCompendium();
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
  if (!["new", "reminders", "party", "compendium"].includes(ADMIN.sel) && !String(ADMIN.sel).startsWith("g:")
      && !ADMIN.users.some(u => u.id === ADMIN.sel))
    ADMIN.sel = adminWaiting() ? "reminders" : (ADMIN.users.find(u => u.role === "player") || ADMIN.users[0] || {}).id ?? "new";
  renderAdminList(); renderAdmin();
}
function openAdminUser(id) {
  ADMIN.sel = id;
  // The table board polls while it is open and must stop the moment it isn't — leaving it running
  // behind another section would keep redrawing a panel nobody is looking at.
  if (id === "party") startPartyPolling(); else stopPartyPolling();
  renderAdminList(); renderAdmin();
  document.getElementById("adminBody").scrollTop = 0;
}

function renderAdminList() {
  const box = document.getElementById("adminList");
  const n = adminWaiting();
  box.innerHTML = `<button class="cog ${ADMIN.sel === "party" ? "core" : ""}" onclick="openAdminUser('party')" title="Every character, live">
      <span class="ico">❖</span><span class="nm">The table</span>${PARTY.cards.length ? `<span class="rl">${PARTY.cards.length}</span>` : ""}</button>
    <button class="cog ${ADMIN.sel === "reminders" ? "core" : ""}" onclick="openAdminUser('reminders')">
      <span class="ico">✦</span><span class="nm">Reminders</span>${n ? `<span class="rl dm">${n}</span>` : ""}</button>
    <button class="cog ${ADMIN.sel === "compendium" ? "core" : ""}" onclick="openAdminUser('compendium')" title="5e content the sheet offers">
      <span class="ico">◈</span><span class="nm">Compendium</span>${CMP.entries.length ? `<span class="rl">${CMP.entries.length}</span>` : ""}</button>
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
  if (ADMIN.sel === "party") { host.innerHTML = renderPartyAdmin(); return; }
  if (ADMIN.sel === "compendium") { host.innerHTML = renderCompendiumAdmin(); return; }
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
    h += renderIgnAdmin(u);
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

// ═══════════════════════════════════════════════════════════
//  THE TABLE — every character at a glance, while you run the session
// ═══════════════════════════════════════════════════════════
// One card per character, condensed to what a DM actually asks for mid-combat: hit points, AC, the
// save DCs, and the two numbers the Wounds push up. Every figure here is computed by the server from
// sheet/js/rules.js, so this board and the player's own sheet can never disagree.
//
// It polls while it is open. Eight players and one small endpoint is not worth a second transport,
// and the rest of this app already works by sending small writes and reading back.
const PARTY = { cards: [], timer: null, at: null, err: null, busy: null, note: "" };
const PARTY_EVERY = 4000;

async function loadParty() {
  const was = PARTY.cards.length;
  try {
    PARTY.cards = (await api("GET", "api/characters/party")).party;
    PARTY.at = new Date(); PARTY.err = null;
  } catch (err) {
    PARTY.err = err.message;        // keep the last good cards on screen rather than blanking it
  }
  if (ADMIN.sel !== "party") return;
  // The rail only changes when a character appears or leaves. Redrawing it on every poll would
  // move the row out from under the DM's cursor four times a minute for no reason.
  if (PARTY.cards.length !== was) renderAdminList();
  drawParty();
}

// A redraw replaces the whole board, so anything the DM is in the middle of typing has to survive
// it — and if the caret is actually in the note field, the redraw waits rather than interrupting.
function drawParty() {
  const note = document.getElementById("ptyNote");
  if (note) {
    PARTY.note = note.value;
    if (document.activeElement === note) return;
  }
  document.getElementById("adminBody").innerHTML = renderPartyAdmin();
}
function startPartyPolling() {
  stopPartyPolling();
  loadParty();
  PARTY.timer = setInterval(() => { if (!document.hidden) loadParty(); }, PARTY_EVERY);
}
function stopPartyPolling() { clearInterval(PARTY.timer); PARTY.timer = null; }

// The note the next change is recorded with. One field for the whole board rather than one per
// control: at the table the DM is already saying why out loud, and every change lands in
// character_events with an actor and a before/after whether or not a reason is typed.
const partyNote = () => (document.getElementById("ptyNote")?.value ?? PARTY.note ?? "").trim();
function clearPartyNote() {
  PARTY.note = "";
  const el = document.getElementById("ptyNote");
  if (el) el.value = "";
}

function renderPartyAdmin() {
  const cards = PARTY.cards;
  const when = PARTY.at ? PARTY.at.toLocaleTimeString() : "—";
  let h = `<div class="cdx"><div class="cdx-hd"><div><h1>The table</h1>
      <p class="cdx-desc">Every character as it stands right now, refreshed every few seconds.
        Level, Dream and Fate are yours to set here — a player's own sheet cannot touch them.</p></div></div>

    <div class="cdx-sec">
      <div class="adm-line">
        <input class="search" id="ptyNote" maxlength="200" style="flex:1" value="${escQ(PARTY.note || "")}"
          placeholder="Why — recorded with the next change you make" aria-label="Reason for the next change">
        <button class="mini" onclick="loadParty()">Refresh</button>
      </div>
      <p class="cdx-rings">Read at ${esc(when)}${PARTY.err ? ` · <strong class="hot">${esc(PARTY.err)}</strong>` : ""}</p>`;

  if (!cards.length) {
    h += `<div class="cdx-note"><p>No characters yet. A player makes their own from the Character Sheet
      — you grant the level, the Dream score and any Fate once it exists.</p></div></div></div>`;
    return h;
  }

  h += `<div class="pty">` + cards.map(partyCardHtml).join("") + `</div></div></div>`;
  return h;
}

function partyCardHtml(c) {
  const max = Math.max(1, c.maxHp);
  const pct = Math.max(0, Math.min(100, Math.round((c.hp / max) * 100)));
  // Three bands, because the only thing a DM needs from a bar across the room is "is this one about
  // to go down": bloodied at half, critical at a quarter.
  const band = c.hp <= 0 ? "out" : pct <= 25 ? "crit" : pct <= 50 ? "low" : "ok";
  const busy = PARTY.busy === c.id ? " busy" : "";
  const dc = (label, v, title) => `<span class="pty-dc" title="${escQ(title)}"><i>${label}</i><b>${v}</b></span>`;

  return `<section class="pty-card${busy}">
    <header class="pty-id">
      <b>${esc(c.name)}</b>
      <span class="pty-who">${esc(c.player)}</span>
      <span class="pty-lv">Lv ${c.level}${c.pendingLevel ? ` <u>&rarr; ${c.pendingLevel}</u>` : ""}</span>
    </header>
    ${(c.classes || []).length ? `<div class="pty-cls">` + c.classes.map(x =>
      `<span class="chip">${esc(x.name)} ${x.level}${x.subclass ? ` &middot; ${esc(x.subclass)}` : ""}</span>`).join("") + `</div>` : ""}

    <div class="pty-hp ${band}">
      <div class="pty-bar"><i style="width:${pct}%"></i></div>
      <span class="pty-hpn">${c.hp}<em>/${c.maxHp}</em>${c.tempHp ? `<u>+${c.tempHp}</u>` : ""}</span>
    </div>

    <div class="pty-row">
      ${dc("AC", c.ac, "Armour Class, with any named modifiers")}
      ${dc("INIT", sign(c.initiative), "Initiative")}
      ${dc("SPD", c.speed, "Speed in feet")}
      ${dc("PP", c.passivePerception, "Passive Perception")}
    </div>
    <div class="pty-row">
      ${dc("SAVE DC", c.saveDc, `Verum DC — 8 + PB + highest ability + Dream (${sign(c.dreamMod)})`)}
      ${dc("ATK", sign(c.spellAttack), "Seal attack bonus — PB + Verum modifier")}
      ${dc("DEATH", c.deathSaveDC, `Death save DC — 10 + ${c.wounds} Wounds + ${c.unhealedInjuries} unhealed Injuries`)}
      ${dc("CONC", c.concentrationFloor, "Concentration DC floor — rises with half the damage taken")}
    </div>

    <div class="pty-tracks">
      <span class="pty-t${c.wounds ? " hot" : ""}" title="Each Wound and unhealed Injury adds +1 to both DCs">
        <i>Wounds</i><b>${c.wounds}</b>${c.wounds >= 6 ? `<u>Injury due</u>` : ""}</span>
      <span class="pty-t${c.unhealedInjuries ? " hot" : ""}" title="${c.injuries} recorded, ${c.unhealedInjuries} unhealed">
        <i>Injuries</i><b>${c.unhealedInjuries}</b></span>
      <span class="pty-t${c.exhaustion ? " hot" : ""}" title="Standard physical Exhaustion">
        <i>Exh</i><b>${c.exhaustion}<em>/6</em></b></span>
      <span class="pty-t${c.dreamExhaustion ? " hot" : ""}"
        title="${escQ(c.dreamExhaustionName)} — ${c.dreamPenalty} to d20 rolls in a dream">
        <i>Dream exh</i><b>${c.dreamExhaustion}<em>/8</em></b>${c.dreamPenalty ? `<u>${c.dreamPenalty}</u>` : ""}</span>
      ${c.inCombat ? `<span class="pty-t hot" title="The player's own round tracker"><i>Round</i><b>${c.round}</b></span>` : ""}
      ${c.activeModifiers ? `<span class="pty-t" title="Named modifiers currently running on this sheet">
        <i>Effects</i><b>${c.activeModifiers}</b></span>` : ""}
    </div>

    ${c.conditions.length ? `<div class="pty-cond">` + c.conditions.map(x =>
      `<span class="chip on">${esc(typeof x === "string" ? x : x.name || "")}</span>`).join("") + `</div>` : ""}

    <footer class="pty-do">
      ${c.pendingLevel
        ? `<span class="pty-wait" title="Allowed, and waiting for the player to take it">
             Level ${c.pendingLevel} waiting</span>`
        : `<button class="mini go" onclick="partyAllowLevel(${c.id})"
             title="Clear this character for level ${c.level + 1}. Their sheet grows a LEVEL UP button; the level rises when they press it."
             ${c.level >= 20 ? "disabled" : ""}>Allow Lv ${Math.min(20, c.level + 1)}</button>`}
      <span class="pair"><span class="lbl">Level</span><div class="step">
        <button onclick="partyBump(${c.id},'level',-1)" aria-label="Lower level">–</button><span>${c.level}</span>
        <button onclick="partyBump(${c.id},'level',1)" aria-label="Raise level">+</button></div></span>
      <span class="pair"><span class="lbl">Dream</span><div class="step">
        <button onclick="partyBump(${c.id},'dream',-1)" aria-label="Lower Dream">–</button><span>${c.dream}</span>
        <button onclick="partyBump(${c.id},'dream',1)" aria-label="Raise Dream">+</button></div></span>
      <span class="pair"><span class="lbl">Fate</span><div class="step">
        <button onclick="partyBump(${c.id},'fate',-1)" aria-label="Take back a Fate use">–</button><span>${c.fate}</span>
        <button onclick="partyBump(${c.id},'fate',1)" aria-label="Grant a Fate use">+</button></div></span>
      <button class="mini" onclick="partyUnlock(${c.id},'asi')" title="Open an ability score improvement for this player to spend">+ ASI</button>
      <button class="mini" onclick="partyUnlock(${c.id},'feat')" title="Open a feat for this player to spend">+ Feat</button>
      ${c.unspent.honor || c.unspent.morality
        ? `<span class="pty-wait" title="Allocations this player has not spent yet">
            ${c.unspent.honor ? `${c.unspent.honor} Honor` : ""}${c.unspent.honor && c.unspent.morality ? " · " : ""}${c.unspent.morality ? `${c.unspent.morality} Morality` : ""} unspent</span>`
        : ""}
    </footer>
  </section>`;
}

// Clearing a character for the next level WITHOUT taking it for them. The player's sheet grows a
// LEVEL UP button, and pressing it is what moves the level — so the features, the subclass and the
// ability score improvement are settled in the same breath as the number instead of a sheet sitting
// at a level nobody has filled in. The stepper below is still there for a correction or a rollback.
async function partyAllowLevel(id) {
  const c = PARTY.cards.find(x => x.id === id);
  if (!c) return;
  PARTY.busy = id;
  try {
    const out = await api("POST", `api/characters/${id}/level/allow`, { note: partyNote() });
    clearPartyNote();
    toast(`${c.name} may take level ${out.targetLevel}.`);
  } catch (err) { toast(err.message); }
  PARTY.busy = null;
  await loadParty();
}

// One change: write it, record the reason, and read the board back. A level also issues the Honor and
// Morality allocations and the unlock token the server attaches to it — this does not do that itself.
async function partyBump(id, field, by) {
  const c = PARTY.cards.find(x => x.id === id);
  if (!c) return;
  const limits = { level: [1, 20], dream: [0, 40], fate: [0, 99] };
  const next = c[field] + by;
  const [lo, hi] = limits[field];
  if (next < lo || next > hi) return toast(`${field === "level" ? "Level" : field === "dream" ? "Dream" : "Fate"} is ${lo} to ${hi}.`);

  // Lowering a level is a rollback, and it takes features away — say so before it happens.
  if (field === "level" && by < 0 &&
      !confirm(`Take ${c.name} back to level ${next}? Allocations already spent are not returned.`)) return;

  PARTY.busy = id;
  try {
    const body = { [field]: next, note: partyNote() };
    const out = await api("PUT", `api/characters/${id}/${field}`, body);
    clearPartyNote();
    const a = out.allocations;
    toast(a && a.levels
      ? `${c.name} — level ${next}, ${a.honor} Honor and ${a.morality} Morality to allocate`
      : `${c.name} — ${field} ${next}`);
  } catch (err) { toast(err.message); }
  PARTY.busy = null;
  await loadParty();
}

async function partyUnlock(id, kind) {
  const c = PARTY.cards.find(x => x.id === id);
  if (!c) return;
  PARTY.busy = id;
  try {
    await api("POST", `api/characters/${id}/unlocks`, { kind, note: partyNote() });
    clearPartyNote();
    toast(`${c.name} may now choose ${kind === "asi" ? "an ability score improvement" : "a feat"}.`);
  } catch (err) { toast(err.message); }
  PARTY.busy = null;
  await loadParty();
}

const sign = n => (Number(n) >= 0 ? "+" : "") + Number(n);

// ═══════════════════════════════════════════════════════════
//  COMPENDIUM — the 5e content the character sheet offers
// ═══════════════════════════════════════════════════════════
// The sheet ships with the SRD because the SRD is openly licensed. Everything else is imported here
// and kept in the database, never in the repository — which is both the licence answer and the
// practical one: this deployment is yours, and what you own can live in it without being published.
const CMP = { entries: [], preview: null, busy: false, bundle: null, progress: null };

async function loadCompendium() {
  // The summary, not the library: once a DM imports their books this is thousands of rows, and a
  // listing needs names and counts rather than every spell's text.
  try { CMP.entries = (await api("GET", "api/compendium?summary=1")).entries; } catch (e) { CMP.entries = []; }
}

function renderCompendiumAdmin() {
  const byKind = {};
  for (const e of CMP.entries) byKind[e.kind] = (byKind[e.kind] || 0) + 1;
  const LABEL = { race: "ancestries", class: "classes", background: "backgrounds",
    feat: "feats", spell: "spells", item: "items" };

  return `<div class="cdx"><div class="cdx-hd"><div><h1>Compendium</h1>
      <p class="cdx-desc">What the Character Sheet offers when a player picks an ancestry, a class or
        a spell. The <strong>SRD ships with the app</strong>; anything else you own goes in here.</p></div></div>

    <div class="cdx-sec"><h2>Imported into this deployment</h2>
      ${CMP.entries.length
        ? `<div class="chips">` + Object.entries(byKind).map(([k, n]) =>
            `<span class="chip on">${n} ${esc(LABEL[k] || k)}</span>`).join("") + `</div>`
        : `<div class="cdx-note"><p>Nothing imported yet. Players see the SRD: 9 ancestries, 12 classes,
             317 spells and 432 items — and one background and one feat, which is all the SRD carries.</p></div>`}
    </div>

    <div class="cdx-sec"><h2>Upload a collection</h2>
      <p class="cdx-rings">A whole set of books at once, built from a Fight Club <strong>collection</strong>
        — the manifest that lists which book files belong together. Build the bundle on your own machine:</p>
      <pre class="cdx-pre">node sheet/tools/build-compendium.mjs &lt;collection.xml&gt; &lt;FightClub5eXML folder&gt;</pre>
      <p class="cdx-rings">then pick the <code>compendium-bundle.json</code> it writes. It arrives in batches,
        so a slow connection cannot lose the lot, and uploading the same bundle twice rewrites the same
        rows rather than doubling them. <strong>A class spread across several books is merged into one
        before it gets here</strong> — otherwise the Player's Handbook Fighter and the Xanathar's Fighter
        would land as two classes, one of them without a hit die.</p>
      <div class="adm-form">
        <label for="cmpFile">The bundle</label>
        <input class="search" id="cmpFile" type="file" accept="application/json,.json"
          onchange="cmpPickBundle(this)" ${CMP.busy ? "disabled" : ""}>
        ${CMP.bundle ? `<div class="cdx-defs">` + Object.entries(CMP.bundle.counts || {})
            .filter(([, n]) => n).map(([k, n]) =>
              `<div class="cdx-def"><b>${n}</b><span>${esc(LABEL[k] || k)}</span></div>`).join("") + `</div>
          <p class="cdx-rings">${esc(CMP.bundle.collection || "collection")} · built ${esc(CMP.bundle.builtAt || "")}
            · ${CMP.bundle.entries.length} entries${CMP.bundle.files
              ? ` from ${CMP.bundle.files.read} files` : ""}</p>` : ""}
        <div class="adm-line">
          ${CMP.bundle ? `<button class="mini on" onclick="cmpUploadBundle()" ${CMP.busy ? "disabled" : ""}>
            Upload ${CMP.bundle.entries.length} entries</button>` : ""}
          ${CMP.progress ? `<span class="cdx-rings">${esc(CMP.progress)}</span>` : ""}
        </div>
      </div>
    </div>

    <div class="cdx-sec"><h2>Import a Fight Club compendium</h2>
      <p class="cdx-rings">Paste a Fight Club 5e XML file. It is read first and shows you what it found;
        nothing is saved until you say so. An entry with the same name and source replaces the one
        already here, so re-importing a corrected file is safe. Monsters are ignored — a character
        sheet has no use for stat blocks.</p>
      <div class="adm-form">
        <label for="cmpSource">Where it came from — shown beside every entry it brings</label>
        <input class="search" id="cmpSource" maxlength="80" placeholder="Player's Handbook, our homebrew, ...">
        <label for="cmpXml">The XML</label>
        <textarea class="search par-ta" id="cmpXml" rows="7" spellcheck="false"
          placeholder="&lt;compendium version=&quot;5&quot;&gt; ..."></textarea>
        <div class="adm-line">
          <button class="mini" onclick="cmpPreview()" ${CMP.busy ? "disabled" : ""}>Read it</button>
          ${CMP.preview ? `<button class="mini on" onclick="cmpImport()" ${CMP.busy ? "disabled" : ""}>
            Import ${CMP.preview.total} entries</button>` : ""}
        </div>
      </div>
      ${CMP.preview ? `<div class="cdx-defs">` + Object.entries(CMP.preview.counts)
          .filter(([, n]) => n).map(([k, n]) =>
            `<div class="cdx-def"><b>${n}</b><span>${esc(LABEL[k] || k)}</span></div>`).join("") + `</div>
        <p class="cdx-rings">${CMP.preview.sample.map(s => esc(s)).join(" · ")}</p>` : ""}
      <p class="cdx-rings"><strong>A word on what you paste.</strong> The SRD is open; the books are not.
        Content from a book you own is fine in your own deployment, but it must not be committed to the
        repository, which is why this keeps it in the database instead.</p>
    </div></div>`;
}

// ── a whole collection, in batches ──────────────────────────────────────
// The file is read here and never uploaded whole: the request body is capped, and a single statement
// writing three thousand rows is a bad bet against a hosted database. It goes up in slices with the
// count moving, so a stall is visible rather than a spinner that may or may not be doing anything.
const CMP_BATCH = 400;

async function cmpPickBundle(input) {
  const file = input.files && input.files[0];
  CMP.bundle = null; CMP.progress = null;
  if (!file) return cmpRedraw();
  try {
    const bundle = JSON.parse(await file.text());
    if (!Array.isArray(bundle.entries) || !bundle.entries.length)
      throw new Error("That file holds no entries — is it the bundle the tool wrote?");
    CMP.bundle = bundle;
    toast(`${bundle.entries.length} entries read. Nothing uploaded yet.`);
  } catch (err) {
    toast(err.message.slice(0, 120));
  }
  cmpRedraw();
}

async function cmpUploadBundle() {
  const bundle = CMP.bundle;
  if (!bundle) return;
  CMP.busy = true;
  let written = 0, skipped = 0;
  const total = bundle.entries.length;
  try {
    for (let i = 0; i < total; i += CMP_BATCH) {
      const batch = bundle.entries.slice(i, i + CMP_BATCH);
      CMP.progress = `Uploading ${Math.min(i + batch.length, total)} of ${total}…`;
      cmpRedraw();
      const out = await api("POST", "api/compendium/import-bundle",
        { entries: batch, source: bundle.collection || "Imported" });
      written += out.written || 0;
      skipped += out.skipped || 0;
    }
    const counts = await api("GET", "api/compendium/counts");
    CMP.progress = `${written} written${skipped ? `, ${skipped} skipped` : ""} — this deployment now holds ${counts.total}.`;
    CMP.bundle = null;
    toast(`${written} entries imported.`);
    await loadCompendium();
  } catch (err) {
    CMP.progress = `Stopped after ${written} of ${total}: ${err.message}`;
    toast(err.message);
  }
  CMP.busy = false;
  renderAdminList();
  cmpRedraw();
}

function cmpRedraw() {
  const host = document.getElementById("adminBody");
  if (host) host.innerHTML = renderCompendiumAdmin();
}

async function cmpXmlBody() {
  const xml = document.getElementById("cmpXml")?.value || "";
  const source = (document.getElementById("cmpSource")?.value || "").trim() || "Imported";
  return { xml, source };
}

async function cmpPreview() {
  const { xml, source } = await cmpXmlBody();
  if (xml.trim().length < 20) return toast("Paste the XML first.");
  CMP.busy = true;
  try {
    CMP.preview = await api("POST", "api/compendium/import", { xml, source });
    toast(`Read ${CMP.preview.total} entries. Nothing saved yet.`);
  } catch (err) { CMP.preview = null; toast(err.message); }
  CMP.busy = false;
  // Keep what was pasted: re-rendering the section would otherwise empty the textarea under them.
  const keep = { xml, source };
  document.getElementById("adminBody").innerHTML = renderCompendiumAdmin();
  document.getElementById("cmpXml").value = keep.xml;
  document.getElementById("cmpSource").value = keep.source === "Imported" ? "" : keep.source;
}

async function cmpImport() {
  const { xml, source } = await cmpXmlBody();
  CMP.busy = true;
  try {
    const out = await api("POST", "api/compendium/import", { xml, source, commit: true });
    toast(`${out.imported} entries imported from ${out.source}.`);
    CMP.preview = null;
    await loadCompendium();
  } catch (err) { toast(err.message); }
  CMP.busy = false;
  renderAdminList();
  document.getElementById("adminBody").innerHTML = renderCompendiumAdmin();
}

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
//  ADMIN — CUSTOM IGNITIONS
// ═══════════════════════════════════════════════════════════
// One thing on this page belongs to the DM: whether an Ignition written for this player is
// switched on. The Ignitions themselves are authored in ignitions/ignition_<player>_<slug>.json,
// beside the Cognitions, for the same reason Paragon Abilities are — they are written for one
// character, and a file is reviewable where a textarea is not. The server will only ever enable
// one for the player named inside it, so this page can be stale without being dangerous.
const RANK_NUM = ["I", "II", "III", "IV"];

async function ignAdminToggle(userId, ignId, btn) {
  const u = ADMIN.users.find(x => x.id === userId);
  const on = !(u.ignitions || []).includes(ignId);
  const name = (u.ignitionSets || []).find(s => s.id === ignId)?.name || ignId;
  btn.disabled = true;
  try {
    await api(on ? "PUT" : "DELETE", `api/admin/users/${userId}/ignitions/${encodeURIComponent(ignId)}`);
    await refreshAdmin();
    toast(on ? `${name} is open to ${u.displayName}` : `${name} taken back`);
    renderAdminList(); renderAdmin();
  } catch (err) { btn.disabled = false; toast(err.message); }
}

function renderIgnAdmin(u) {
  const sets = u.ignitionSets || [], on = new Set(u.ignitions || []);
  let h = `<div class="cdx-sec"><h2>Ignitions — ${on.size} of ${sets.length} enabled</h2>
    <p class="cdx-rings">A permanent technique this character owns, inherited from a Dream Item, a
      Dream-Touched Creature or an Epiphany. Click to enable or take back — it is saved at once, and
      one that isn't enabled never reaches ${esc(u.displayName)}'s browser. They appear in the
      <strong>Forge</strong>, above their saved Eidons, and as their own entries in the
      <strong>Ignitions</strong> tab. They are read-only: an Ignition never loads into the builder.</p>`;

  if (!sets.length) {
    h += `<div class="cdx-note"><p>Nothing written for ${esc(u.displayName)} yet. Add a file to
      <code>ignitions/</code> named <code>ignition_${esc(u.username)}_&lt;slug&gt;.json</code> and it
      appears here to be enabled.</p></div>`;
  } else {
    h += `<div class="chips">` + sets.map(s => {
      const isOn = on.has(s.id);
      const about = [s.cognitions.join(" + "), s.rank ? `Rank ${RANK_NUM[s.rank - 1] || s.rank}` : null].filter(Boolean).join(" · ");
      return `<button class="chip ign-chip ${isOn ? "on" : ""}" onclick="ignAdminToggle(${u.id},'${escAttr(s.id)}',this)"
        aria-pressed="${isOn}" title="${escQ(s.name)} — ${escQ(about)}${isOn ? " · enabled" : ""}">${esc(s.name)}</button>`;
    }).join("") + `</div>
    <div class="cdx-defs" style="margin-top:12px">` + sets.map(s => {
      const about = [s.cognitions.join(" + "), s.rank ? `Rank ${RANK_NUM[s.rank - 1] || s.rank}` : null, s.source]
        .filter(Boolean).join(" · ");
      return `<div class="cdx-def"><b>${esc(s.name)}</b><span>${esc(about)}${
        on.has(s.id) ? "" : ` — <em>not enabled</em>`}</span></div>`;
    }).join("") + `</div>`;
  }
  return h + `</div>`;
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
  return h + soulsSection(u) + `</div>`;
}

// ── A player's Servants (Juan, 2026-10-09) ──────────────────────────────
// Their roster lives in grimm_souls now, so the DM can see what each Servant has been upgraded to
// and what charges it is holding — and correct a number or grant an upgrade without taking the
// player's sheet off them. Loaded on demand: most of the time you are on this page for something
// else, and there is no reason to ask the server for every player's roster to render a card.
const SOULS_BY_USER = {};
function soulsSection(u) {
  return `<h3 class="adm-sub">Servants</h3>
    <p class="cdx-rings">What ${esc(u.displayName)} holds, what they have upgraded, and what they
      have spent. Editing writes the same row their sheet syncs — safest between sessions.</p>
    <div id="souls-${u.id}"><button class="mini" onclick="loadSouls(${u.id})">Show their Servants</button></div>`;
}
async function loadSouls(uid) {
  const box = document.getElementById("souls-" + uid);
  if (box) box.innerHTML = `<p class="hint">Reading…</p>`;
  try {
    const { souls } = await api("GET", `api/admin/players/${uid}/souls`);
    SOULS_BY_USER[uid] = souls || [];
  } catch (e) { if (box) box.innerHTML = `<p class="hint">Couldn't read them: ${esc(e.message || e)}</p>`; return; }
  drawSouls(uid);
}
const soulName = key => key.startsWith("vault:")
  ? key.slice(6).replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase())
  : "their own";
// Which Grimm an account holds. The Companion's party list carries a `short` name per Grimm and the
// accounts are named the same way (salomon → Salomon), which is the only link between the two.
const userById = id => (ADMIN.users || []).find(u => u.id === id);
const grimmOfUser = u => (GRIMMS.grimms || []).find(g =>
  String(g.short || "").toLowerCase() === String(u && u.username || "").toLowerCase());
const vaultKeyOf = name => "vault:" + String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// The vault's Servants are the baseline, listed whether or not the player has touched them — a row
// exists only once they change something, so there is nothing to prefill and nothing to go stale.
// Their own souls are appended, and so is anything recorded against another Grimm.
function drawSouls(uid) {
  const box = document.getElementById("souls-" + uid);
  if (!box) return;
  const rows = SOULS_BY_USER[uid] || [];
  const u = userById(uid), g = grimmOfUser(u);
  const byKey = new Map(rows.map(r => [r.grimm + "|" + r.key, r]));
  const lines = [];

  if (g) for (const sv of (g.servants || [])) {
    const key = vaultKeyOf(sv.name), r = byKey.get(g.id + "|" + key);
    byKey.delete(g.id + "|" + key);
    lines.push({ nm: sv.name, grimm: g.id, key, r, vault: true });
  }
  for (const r of byKey.values()) lines.push({ nm: r.edits.name || soulName(r.key), grimm: r.grimm, key: r.key, r, vault: r.key.startsWith("vault:") });

  if (!lines.length) {
    box.innerHTML = `<div class="cdx-note"><p>${esc((u && u.displayName) || "This player")} holds no Grimm
      with Servants${g ? "" : " that this page can match to their account"}.</p></div>`;
    return;
  }
  box.innerHTML = `<div class="cdx-defs">` + lines.map(l => {
    const s = l.r, tr = (s && s.state.tr) || [];
    const up = s ? ["level", "cr", "hp", "ac"].filter(k => s.edits[k] != null && s.edits[k] !== "")
      .map(k => `${k.toUpperCase()} ${s.edits[k]}`).join(" · ") : "";
    const where = s && s.state.out ? " · summoned" : s && s.state.prep ? " · prepared" : "";
    return `<div class="cdx-def${s ? "" : " dis"}"><b>${esc(l.nm)}</b>
      <span>${esc(l.grimm)}${l.vault ? "" : " · written by them"}${up ? ` · upgraded: ${esc(up)}` : s ? " · no upgrades recorded" : " · untouched"}${where}${s && s.state.hp != null ? ` · ${s.state.hp} HP` : ""}</span>
      ${tr.length ? `<span>${tr.map(t => `${esc(t.name)} <b>${+t.cur || 0}/${+t.max || 0}</b>`).join(" · ")}</span>` : ""}
      ${l.vault || s ? `<button class="mini" onclick="editSoulAdmin(${uid},'${escAttr(l.grimm)}','${escAttr(l.key)}','${escAttr(l.nm)}')">Edit</button>` : ""}</div>`;
  }).join("") + `</div>
  <p class="hint" style="font-style:normal">Greyed means <b>untouched</b> — the Servant is on their
    sheet as the vault writes it, with nothing recorded against it. Editing one writes the first row.</p>`;
}
// One soul, by hand. Only the numbers and the charges — the same things the player may change.
// Addressed by grimm + key rather than by position, because the list now includes untouched vault
// Servants that have no row at all, and a Servant with no row is exactly the one you grant an
// upgrade to. Saving it writes that first row.
const soulRow = (uid, grimm, key) => (SOULS_BY_USER[uid] || []).find(r => r.grimm === grimm && r.key === key);
function editSoulAdmin(uid, grimm, key, nm) {
  const s = soulRow(uid, grimm, key) || { grimm, key, edits: {}, state: {} };
  const box = document.getElementById("souls-" + uid);
  document.getElementById("asEdit")?.remove();
  const f = (k, lbl) => `<label class="adm-f"><span>${lbl}</span><input id="as_${k}" value="${escQ(s.edits[k] ?? "")}"></label>`;
  const tr = s.state.tr || [];
  box.insertAdjacentHTML("afterbegin", `<div class="cdx-note" id="asEdit">
    <p><b>${esc(nm)}</b> — ${esc(grimm)}${soulRow(uid, grimm, key) ? "" : " · nothing recorded yet"}</p>
    <div class="adm-line">${f("level", "Level")}${f("cr", "CR")}${f("hp", "HP")}${f("ac", "AC")}</div>
    ${tr.length ? `<div class="adm-line">${tr.map((t, j) =>
      `<label class="adm-f"><span>${esc(t.name)}</span><input id="as_tr${j}" value="${+t.cur || 0}" style="width:60px"></label>`).join("")}</div>` : ""}
    <div class="adm-line"><button class="mini on" onclick="saveSoulAdmin(${uid},'${escAttr(grimm)}','${escAttr(key)}','${escAttr(nm)}')">Save</button>
      <button class="mini" onclick="document.getElementById('asEdit').remove()">Cancel</button></div>
    <p class="hint" style="font-style:normal">Leave a number empty to hand it back to the vault's
      statblock. Their sheet picks this up the next time it loads${tr.length ? "" : "; they define their own charge trackers, so there are none to correct here yet"}.</p></div>`);
}
async function saveSoulAdmin(uid, grimm, key, nm) {
  const s = soulRow(uid, grimm, key) || { grimm, key, edits: {}, state: {} };
  const edits = { ...s.edits }, state = { ...s.state };
  for (const k of ["level", "cr", "hp", "ac"]) {
    const v = (document.getElementById("as_" + k)?.value ?? "").trim();
    if (v === "") delete edits[k]; else edits[k] = v;
  }
  if ((s.state.tr || []).length) state.tr = s.state.tr.map((t, j) => {
    const v = +(document.getElementById("as_tr" + j)?.value ?? t.cur) || 0;
    return { ...t, cur: Math.max(0, Math.min(+t.max || 0, v)) };
  });
  try {
    await api("PUT", `api/admin/players/${uid}/souls/${encodeURIComponent(grimm)}/${encodeURIComponent(key)}`, { edits, state });
    const cur = soulRow(uid, grimm, key);
    if (cur) { cur.edits = edits; cur.state = state; }
    else (SOULS_BY_USER[uid] = SOULS_BY_USER[uid] || []).push({ grimm, key, edits, state });
    document.getElementById("asEdit")?.remove();
    drawSouls(uid);
    toast(`${nm} updated.`);
  } catch (e) { alert("Couldn't save: " + (e.message || e)); }
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
// A Shackle Break is hidden until the DM says otherwise, the same as a Reality Shift
function shackleOn(id)      { return GRIMM_TOGGLES[id]?.shackle === true; }
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
  const n = grimmChains(id), sh = shiftOn(id), sb = shackleOn(id);

  let h = `<div class="cdx"><div class="cdx-hd"><div>
      <h1 style="color:${g.hue}">${esc(g.name)}</h1>
      <p class="cdx-desc">${esc(g.user)}</p>
      <div class="c-tags" style="margin-top:9px">
        <span class="t">${esc(CHAIN_STATE[n])}</span>
        <span class="t">${g.abilities.length} abilities</span>
        ${g.shift ? `<span class="t ${sh ? "hot" : ""}">Reality Shift ${sh ? "revealed" : "hidden"}</span>` : ""}
        ${g.shackle ? `<span class="t ${sb ? "hot" : ""}">Shackle Break ${sb ? "revealed" : "hidden"}</span>` : ""}
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

  if (g.shackle) {
    // A Break's payload is withheld with it, and it is not the same payload for every Grimm: the
    // Parted Gates carry twelve Servant forms, The Fallen Hero carries the two troops it puts on
    // the field. Name what the lock actually covers, so the DM can see what flipping it hands over.
    const forms = (g.servants || []).filter(s => s.divine || s.forbidden).length;
    const secret = (g.troops || []).filter(t => t.secret === "shackle");
    const withheld = [
      forms ? `the ${forms} Divine and Forbidden Forms it transforms a Servant into` : "",
      secret.length ? `${secret.length === 1 ? "the troop" : `the ${secret.length} troops`} it puts on the field — <b>${secret.map(t => esc(t.name)).join("</b>, <b>")}</b>` : "",
    ].filter(Boolean);
    h += `<div class="cdx-sec"><h2>Shackle Break — ${esc(g.shackle.name)}</h2>
      <p class="cdx-rings">While it's hidden its text never reaches that player's browser${
        withheld.length ? `, and neither does what it carries: ${withheld.join("; and ")}` : ""}.</p>
      <div class="adm-line" style="gap:10px">
        <button class="mini ${sb ? "on" : ""}" onclick="setToggle('${escAttr(id)}','shackle',${!sb})">
          ${sb ? "✓ Revealed" : "Reveal it"}</button>
        ${sb ? `<span class="hint" style="margin:0">Their sheet can run it now.</span>` : ""}
      </div>
      ${secret.length ? `<p class="hint" style="margin:9px 0 0">${sb
        ? `Their sheet now holds <b>${secret.map(t => esc(t.name)).join("</b> and <b>")}</b>. Neither can be picked as a job — the Break is the only thing that puts them on the field.`
        : `Revealing it also sends <b>${secret.map(t => esc(t.name)).join("</b> and <b>")}</b> to their browser. Until then their copy of the data has no record that either exists.`}</p>` : ""}
      </div>`;
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
