// Ephemer — Initiative: the fight on the table.
//
// Modelled on what Improved Initiative got right and nothing else. Three things make that tool
// worth a screen, and all three are here:
//
//   · ONE LIST, ALWAYS IN ORDER — initiative, hit points, conditions, whose turn it is
//   · A SECOND SCREEN for the room, showing the order and not the DM's arithmetic
//   · EVERY NUMBER one keystroke away: the damage roll goes in a box and the bar moves
//
// What it does NOT copy is the statblock library. This table's monsters live in the vault as prose,
// and a creature on the board needs five things — a name, hit points, AC, a save DC and a face
// (Juan, 2026-11-12). Everything else about it is in the session note, where the DM is already
// looking. So adding one is five boxes, and the rest of the row is optional.
//
// WHAT IS DIFFERENT HERE, and it is the whole reason this is not a browser tab pointed at somebody
// else's app: the party is not typed in. A PC on this board is a POINTER at their character sheet —
// their hit points, AC, save DC, conditions, Wounds and both Exhaustions arrive live, through the
// same engine their own sheet reads, and damage typed here lands on that sheet. And when the DM
// moves the round on, every sheet at the table is told, so the three-round blessing somebody cast
// expires on the round it should rather than on the round somebody remembers.
//
// The player's face of this page is built from a DIFFERENT response (`view`, resolved server-side).
// A hidden combatant is not styled out of sight here — it was never sent. See initPlayerView in
// server/server.js.

// ═══════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════
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

const esc = t => String(t ?? "").replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const escQ = t => esc(t).replace(/"/g, "&quot;");
const sign = n => (Number(n) >= 0 ? "+" : "") + Number(n);
const el = id => document.getElementById(id);
const d20 = () => 1 + Math.floor(Math.random() * 20);

function toast(msg) {
  const t = el("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2200);
}
function showErr(id, msg) { const e = el(id); e.textContent = msg || ""; e.hidden = !msg; }

// ═══════════════════════════════════════════════════════════
//  SIGN-IN  (the same three functions every page here has)
// ═══════════════════════════════════════════════════════════
let ME = null;

function signIn(e) {
  e.preventDefault();
  showErr("gateErr");
  api("POST", "api/login", {
    username: el("gateUser").value, password: el("gatePass").value,
  }).then(() => { el("gate").hidden = true; el("gatePass").value = ""; boot(); })
    .catch(err => showErr("gateErr", err.message));
  return false;
}
function openAccount() {
  el("acctName").textContent = ME.displayName;
  showErr("acctErr");
  el("acct").showModal();
}
function changePassword(e) {
  e.preventDefault();
  const cur = el("acctCur"), next = el("acctNew");
  api("POST", "api/password", { current: cur.value, next: next.value }).then(() => {
    cur.value = next.value = "";
    el("acct").close();
    toast("Password changed");
  }).catch(err => showErr("acctErr", err.message));
  return false;
}
function signOut() { api("POST", "api/logout").finally(() => location.reload()); }

// ═══════════════════════════════════════════════════════════
//  THE BOARD
// ═══════════════════════════════════════════════════════════
let S = null;            // the fight, as the server holds it
let PARTY = [];          // the live party cards — never written into S
let CONDS = [];          // the conditions the picker offers
let SAVED = [];          // lineups kept for later
let ROOM = null;         // the player's view, when this page is wearing that face
let ASROOM = false;      // #player — the DM looking at what the room sees

// One writer, so there is nothing to race: the board is pushed whole, on a short debounce, and the
// poll below refuses to overwrite it while anything is in flight.
let DIRTY = false, PUSHING = false, PUSH_T = null, REDRAW = false;

function push() {
  DIRTY = true;
  clearTimeout(PUSH_T);
  PUSH_T = setTimeout(async () => {
    PUSHING = true; DIRTY = false;
    try { S = (await api("PUT", "api/initiative", { state: S })).state; }
    catch (err) { DIRTY = true; toast(err.message); }
    finally { PUSHING = false; }
  }, 280);
}

// The round, onto every sheet at the table. Fire-and-forget on purpose: the fight does not wait on
// seven database writes, and a sheet that misses one gets the next one four seconds later.
function pushClock() {
  if (S.clock === false) return;
  api("POST", "api/initiative/clock", { round: S.round || 1, inCombat: S.inCombat })
    .catch(() => { /* the fight is not stopping for this */ });
}

// ── The order ──────────────────────────────────────────────
// A PC row is merged with their live card HERE, in the page, and sorted the same way the server
// sorts for the room: highest first, nobody who has not rolled above somebody who has, ties in the
// order the DM put them in. The player's view is resolved server-side instead, because that is
// where things are left out and a browser must not be trusted with that.
function resolve() {
  const byId = new Map(PARTY.map(p => [p.id, p]));
  return S.combatants.map(c => {
    if (c.kind !== "pc") return { ...c, player: "" };
    const p = byId.get(c.charId);
    if (!p) return { ...c, name: "(gone)", gone: true, hp: 0, hpMax: 0, tempHp: 0, ac: null, dc: null,
                     conditions: [], down: false, player: "" };
    return {
      ...c,
      name: p.name, player: p.player, level: p.level,
      img: p.portraitArt || p.portrait || "",
      hp: p.hp, hpMax: p.maxHp, tempHp: p.tempHp,
      ac: p.ac, dc: p.saveDc, initMod: p.initiative,
      conditions: (p.conditions || []).map(x => ({ name: typeof x === "string" ? x : x?.name, rounds: null }))
        .filter(x => x.name),
      down: p.hp <= 0,
      wounds: p.wounds, deathSaveDC: p.deathSaveDC, fate: p.fate,
      exhaustion: p.exhaustion, dreamExhaustion: p.dreamExhaustion,
      dreamExhaustionName: p.dreamExhaustionName,
      round: p.round,
    };
  }).sort((a, b) =>
    (a.init == null) - (b.init == null) || (b.init ?? 0) - (a.init ?? 0) ||
    (b.initMod ?? 0) - (a.initMod ?? 0) || String(a.name).localeCompare(String(b.name)));
}

const find = id => S.combatants.find(c => c.id === id);
const newId = () => Math.random().toString(36).slice(2, 10);

// ═══════════════════════════════════════════════════════════
//  DRAWING — the DM's board
// ═══════════════════════════════════════════════════════════
// A redraw while somebody is typing would take the caret with it, and this page is typed into
// constantly — initiative numbers, damage, a monster's hit points. So a draw that lands on a
// focused field is deferred to the blur instead.
// Only a FIELD defers a draw, and only a draw the poll asked for. A button is not a field: a click
// on Add that had to wait for the cursor to leave the form would look like a board that ignores you.
const typing = () => {
  const a = document.activeElement;
  return !!a && /^(INPUT|TEXTAREA)$/.test(a.tagName) && !!a.closest?.(".ini-order, .ini-add");
};
document.addEventListener("focusout", () => setTimeout(() => {
  if (REDRAW && !typing()) { REDRAW = false; draw(); }
}, 0));

// `soft` is a draw nobody asked for — the four-second poll. Those wait for the cursor; everything
// the DM does draws at once.
function draw(soft) {
  if (ASROOM) return;
  if (soft && typing()) { REDRAW = true; return; }
  drawClock(); drawOrder(); drawAdd();
}

// Painting a panel only when its markup actually changed. The poll redraws every four seconds, and
// an innerHTML that writes the same string back still empties every field under it: a monster typed
// in but not yet added, a damage roll waiting on the Enter key. Nothing on this page is allowed to
// disappear because four seconds went by.
const PAINTED = {};
function paint(id, html) {
  if (PAINTED[id] === html) return;
  PAINTED[id] = html;
  el(id).innerHTML = html;
}

function drawClock() {
  const rows = resolve();
  const turn = rows.find(r => r.id === S.turnId);
  const n = rows.filter(r => !r.hidden).length;
  el("roundPill").hidden = !S.inCombat;
  el("roundPill").innerHTML = `Round <b>${S.round}</b>`;
  paint("clock", `
    <div class="ini-rd ${S.inCombat ? "" : "off"}">
      <b>${S.inCombat ? S.round : "—"}</b><i>round</i>
    </div>
    ${S.inCombat
      ? `<button class="mini next" onclick="nextTurn()" title="Next turn — Space, N or →">Next ▸</button>
         <button class="mini" onclick="prevTurn()" title="Back one turn — B or ←">◂</button>
         <div class="ini-turn">${turn ? `<b>${esc(turn.name)}</b>${turn.player ? ` · ${esc(turn.player)}` : ""}` : "nobody"}</div>`
      : `<button class="mini next" onclick="startFight()" ${n ? "" : "disabled"}>Start the fight</button>`}
    <div class="sp"></div>
    <button class="mini ${ADDOPEN ? "on" : ""}" onclick="toggleAdd()"
      title="Who else is coming — A">${ADDOPEN ? "Add ▸" : "+ Add"}</button>
    <button class="mini" onclick="rollAll()" title="Roll initiative for every monster — R">Roll monsters</button>
    ${S.inCombat ? `<button class="mini warn" onclick="endFight()">End the fight</button>` : ""}
    <button class="mini" onclick="openRoomSettings()" title="What the room's screen shows">Room ▾</button>
    <a class="mini" href="#player" target="_blank" rel="noopener"
       title="Open the second screen — leave this on a television or a tablet">Player view ↗</a>`);
}

const hpClass = (hp, max) => !max ? "" : hp / max >= 0.6 ? "" : hp / max >= 0.3 ? "mid" : "low";

function drawOrder() {
  const rows = resolve();
  if (!rows.length) {
    paint("order", `<div class="ini-empty">Nobody is in this fight yet.
      <button class="mini" onclick="toggleAdd(true)">Open “Add to the fight”</button></div>`);
    return;
  }
  paint("order", rows.map(r => {
    const pc = r.kind === "pc";
    const pct = r.hpMax ? Math.max(0, Math.min(100, Math.round((r.hp / r.hpMax) * 100))) : 0;
    // A PC's own numbers are read from their sheet and are not typed here; a monster's are.
    const stat = (v, label, what) => pc || r.gone
      ? `<div class="ini-stat ${v == null ? "none" : ""}" title="${escQ(label)} — from their sheet">
           <b>${v == null ? "—" : v}</b><span>${label}</span></div>`
      : `<div class="ini-stat ${v == null ? "none" : ""}">
           <input value="${v == null ? "" : v}" inputmode="numeric" placeholder="—"
             aria-label="${escQ(label)}" onchange="setNum('${r.id}','${what}',this.value)">
           <span>${label}</span></div>`;
    return `
    <div class="ini-row ${pc ? "pc" : ""} ${r.id === S.turnId && S.inCombat ? "on" : ""}
                ${r.down ? "down" : ""} ${r.hidden ? "off" : ""} ${r.gone ? "gone" : ""}" data-id="${r.id}">
      <input class="ini-init ${r.init == null ? "none" : ""}" value="${r.init == null ? "" : r.init}"
        inputmode="numeric" placeholder="roll" aria-label="Initiative for ${escQ(r.name)}"
        onchange="setInit('${r.id}', this.value)">
      <div class="ini-face" onclick="rowMenu('${r.id}')" title="${escQ(r.name)}">
        ${r.img ? `<img src="${escQ(r.img)}" alt="">` : `<span>${pc ? "◉" : "✦"}</span>`}
      </div>
      <div class="ini-id">
        <b>${esc(r.name)}</b>
        <span>${pc
          ? `${esc(r.player || "")}${r.level ? ` · Lv ${r.level}` : ""}${
              r.wounds ? ` · <em class="hurt">${r.wounds} Wound${r.wounds > 1 ? "s" : ""}</em>` : ""}${
              r.exhaustion ? ` · Exh ${r.exhaustion}` : ""}${
              r.dreamExhaustion ? ` · ${esc(r.dreamExhaustionName || "Dream")} ${r.dreamExhaustion}` : ""}`
          : `${r.initMod ? `init ${sign(r.initMod)}` : "monster"}${r.hidden ? " · off the screen" : ""}`}</span>
      </div>
      <div class="ini-hp">
        <div class="hpbar ${hpClass(r.hp, r.hpMax)}"><i style="width:${pct}%"></i></div>
        <div class="hpn">
          <b>${r.hp ?? 0}</b><s>/${r.hpMax || "—"}</s>
          ${r.tempHp ? `<em>+${r.tempHp}</em>` : ""}
          ${r.gone ? "" : `<input class="hit" placeholder="hit" aria-label="Damage or healing for ${escQ(r.name)}"
            title="12 takes it off · +12 puts it back · t8 temporary · =40 sets it"
            onkeydown="if(event.key==='Enter'){hit('${r.id}',this.value);this.value=''}">`}
        </div>
      </div>
      ${stat(r.ac, "AC", "ac")}
      ${stat(r.dc, "DC", "dc")}
      <div class="ini-con">
        ${(r.conditions || []).map(c => `<button class="chip ${isCampaign(c.name) ? "camp" : ""}"
            onclick="dropCondition('${r.id}','${escQ(c.name)}')" title="Click to clear">
            ${esc(c.name)}${c.rounds ? `<i>${c.rounds}</i>` : ""}</button>`).join("")}
        <button class="chip add" onclick="openConditions('${r.id}')" title="Add a condition">+</button>
      </div>
      <div class="ini-tools">
        <button class="${r.hidden ? "" : "on"}" onclick="toggleHidden('${r.id}')"
          title="${r.hidden ? "Not on the room's screen" : "On the room's screen"}">${r.hidden ? "⊘" : "👁"}</button>
        <button onclick="rowMenu('${r.id}')" title="More">⋯</button>
      </div>
      ${r.note ? `<div class="ini-note">${esc(r.note)}</div>` : ""}
    </div>`;
  }).join(""));
}

const isCampaign = name => CONDS.some(c => c.name === name && c.campaign);

// ── Who else is coming ─────────────────────────────────────
let PIC = "";        // the picture waiting on the add form, as a data URL

// The drawer. Shut by default — most of a session is somebody's turn, not somebody arriving — and
// remembered per browser, because the DM who keeps it open keeps it open all evening.
let ADDOPEN = false;
try { ADDOPEN = localStorage.getItem("ini.add") === "1"; } catch (e) {}

function toggleAdd(want) {
  ADDOPEN = want === undefined ? !ADDOPEN : !!want;
  // A field inside a shut drawer keeps the cursor, and the keyboard would then hand every key to a
  // box nobody can see — including the A that is meant to open the drawer again.
  if (!ADDOPEN && el("side")?.contains(document.activeElement)) document.activeElement.blur();
  document.body.classList.toggle("add-open", ADDOPEN);
  try { localStorage.setItem("ini.add", ADDOPEN ? "1" : "0"); } catch (e) {}
  drawClock();                                   // the button in the clock shows which way it is
  if (ADDOPEN) setTimeout(() => el("aName")?.focus(), 190);
}

function drawAdd() {
  const onBoard = new Set(S.combatants.filter(c => c.kind === "pc").map(c => c.charId));
  const away = PARTY.filter(p => !onBoard.has(p.id));
  // What is already typed is rendered back in, because this panel is also redrawn when a picture is
  // chosen — half a monster typed in must not vanish because the DM picked its face second.
  const keep = id => { const n = el(id); return n ? escQ(n.value) : ""; };
  paint("add", `
    <div class="ini-form">
      <label class="ini-pic" title="A face for the room's screen">
        ${PIC ? `<img src="${escQ(PIC)}" alt="">` : "✛"}
        <input type="file" accept="image/*" onchange="takePicture(this)">
      </label>
      <div class="ini-f w-name"><label for="aName">Name</label>
        <input id="aName" value="${keep("aName")}" placeholder="Glassling"
          onkeydown="if(event.key==='Enter')addNpc()"></div>
      <div class="ini-f w-n"><label for="aHp">HP</label>
        <input id="aHp" value="${keep("aHp")}" inputmode="numeric" placeholder="132"></div>
      <div class="ini-f w-n"><label for="aAc">AC</label>
        <input id="aAc" value="${keep("aAc")}" inputmode="numeric" placeholder="19"></div>
      <div class="ini-f w-n"><label for="aDc">DC</label>
        <input id="aDc" value="${keep("aDc")}" inputmode="numeric" placeholder="16"></div>
      <div class="ini-f w-n"><label for="aMod">Init</label>
        <input id="aMod" value="${keep("aMod")}" inputmode="numeric" placeholder="+5"></div>
      <div class="ini-f w-n"><label for="aN">How many</label>
        <input id="aN" value="${keep("aN")}" inputmode="numeric" placeholder="1"></div>
      <button class="mini go" onclick="addNpc()">Add</button>
    </div>
    <div class="row2">
      ${away.length
        ? `<button class="mini" onclick="addParty()">+ The party${away.length < PARTY.length ? ` (${away.length} left)` : ""}</button>`
        : `<span class="hint" style="margin:0">The whole party is on the board.</span>`}
      ${away.map(p => `<button class="chip" onclick="addPc(${p.id})" title="Add ${escQ(p.name)}">
         ${esc(p.name)}</button>`).join("")}
      <div class="sp" style="flex:1"></div>
      <button class="mini" onclick="openLineups()">Lineups…</button>
      ${S.combatants.length ? `<button class="mini warn" onclick="clearBoard()">Clear the board</button>` : ""}
    </div>`);
}

// A picture arrives as a file and leaves as a square 192px data URL. Downscaled HERE rather than
// stored whole: this blob rides in every save of the board and has to cross the room to a
// television, and a 4MB phone photo would make both of those worse for no gain at 58px.
function takePicture(input) {
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  const fr = new FileReader();
  fr.onload = () => {
    const img = new Image();
    img.onload = () => {
      const side = 192, s = Math.min(img.width, img.height);
      const c = document.createElement("canvas");
      c.width = c.height = side;
      c.getContext("2d").drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, side, side);
      PIC = c.toDataURL("image/jpeg", 0.78);
      drawAdd();
    };
    img.onerror = () => toast("That file is not a picture this browser can read.");
    img.src = fr.result;
  };
  fr.readAsDataURL(file);
}

// ═══════════════════════════════════════════════════════════
//  WHAT THE DM DOES
// ═══════════════════════════════════════════════════════════
function addNpc() {
  const name = el("aName").value.trim() || "Monster";
  const hp = parseInt(el("aHp").value, 10) || 0;
  const ac = el("aAc").value === "" ? null : parseInt(el("aAc").value, 10) || 0;
  const dc = el("aDc").value === "" ? null : parseInt(el("aDc").value, 10) || 0;
  const mod = parseInt(el("aMod").value, 10) || 0;
  const n = Math.max(1, Math.min(24, parseInt(el("aN").value, 10) || 1));
  if (S.combatants.length + n > 60) return toast("That is as many as one board holds.");
  for (let i = 0; i < n; i++) {
    S.combatants.push({
      id: newId(), kind: "npc",
      // Four Glasslings are "Glassling 1" through "Glassling 4": the DM has to be able to say which
      // one is bleeding, and a board of four identical rows cannot answer that.
      name: n > 1 ? `${name} ${i + 1}` : name,
      img: PIC, hp, hpMax: hp, tempHp: 0, ac, dc,
      init: null, initMod: mod, conditions: [], note: "", hidden: false, down: false,
    });
  }
  PIC = "";
  for (const id of ["aName", "aHp", "aAc", "aDc", "aMod", "aN"]) el(id).value = "";
  push(); draw();
  el("aName")?.focus();
  toast(n > 1 ? `${n} × ${name} added` : `${name} added`);
}

function addPc(charId) {
  if (S.combatants.some(c => c.kind === "pc" && c.charId === charId)) return;
  S.combatants.push({ id: `pc${charId}`, kind: "pc", charId, init: null, initMod: 0,
                      hidden: false, note: "" });
  push(); draw();
}
function addParty() {
  for (const p of PARTY) addPc(p.id);
  toast("The party is on the board.");
}

function setInit(id, value) {
  const c = find(id); if (!c) return;
  c.init = value.trim() === "" ? null : parseInt(value, 10) || 0;
  push(); draw();
}
function setNum(id, what, value) {
  const c = find(id); if (!c) return;
  const n = value.trim() === "" ? null : parseInt(value, 10) || 0;
  if (what === "hp") { c.hp = n ?? 0; c.hpMax = Math.max(c.hpMax || 0, c.hp); }
  else c[what] = n;
  push(); draw();
}

// The damage box. `12` takes it off, `+12` puts it back, `t8` is temporary hit points, `=40` sets
// the number outright. A PC's hit points are written to their SHEET — the board never keeps a
// second copy of them — and their own screen has it inside five seconds.
async function hit(id, raw) {
  const c = find(id); if (!c) return;
  const txt = String(raw).trim();
  if (!txt) return;
  const m = /^([+=t-]?)\s*(\d+)$/i.exec(txt);
  if (!m) return toast("Try 12, +12, t8 or =40.");
  const [, op, digits] = m, n = parseInt(digits, 10);
  const row = resolve().find(r => r.id === id);
  if (!row) return;

  // Temporary hit points REPLACE rather than stack, which is 5e's own rule and the sheet's.
  const next = op === "t" ? { tempHp: n }
    : op === "=" ? { hp: n }
    : op === "+" ? { hp: Math.min(row.hpMax || n, (row.hp || 0) + n) }
    : (() => {
        // Through the temporary pool first, then the real ones — never below zero, because a
        // monster at −7 tells the table nothing a monster at 0 does not.
        const t = Math.min(row.tempHp || 0, n);
        return { tempHp: (row.tempHp || 0) - t, hp: Math.max(0, (row.hp || 0) - (n - t)) };
      })();

  if (c.kind === "pc") {
    try { await api("PUT", `api/characters/${c.charId}/vitals`, { vitals: next, note: "initiative board" }); }
    catch (err) { return toast(err.message); }
    // Re-read, then draw OUTRIGHT rather than softly: the cursor is still in the box that was just
    // emptied, and a number that only moves once you click away looks like a hit that did not land.
    await pull();
    draw();
    return;
  }
  Object.assign(c, next);
  if (c.hp <= 0 && !c.down) { c.down = true; toast(`${c.name} is down.`); }
  if (c.hp > 0) c.down = false;
  push(); draw();
}

function toggleHidden(id) {
  const c = find(id); if (!c) return;
  c.hidden = !c.hidden;
  push(); draw();
  toast(c.hidden ? "Off the room's screen." : "On the room's screen.");
}

function rollOne(id) {
  const c = find(id); if (!c) return;
  const row = resolve().find(r => r.id === id);
  c.init = d20() + (row?.initMod || 0);
}
function rollAll() {
  // Six Redcaps roll ONCE between them: the same name and the same modifier is the same group of
  // monsters, and six separate numbers for them is six turns the DM has to remember instead of one.
  const rolled = new Map();
  for (const c of S.combatants) {
    if (c.kind === "pc" || c.init != null) continue;
    const row = resolve().find(r => r.id === c.id);
    const key = `${String(c.name).replace(/\s+\d+$/, "")}|${row?.initMod || 0}`;
    if (!rolled.has(key)) rolled.set(key, d20() + (row?.initMod || 0));
    c.init = rolled.get(key);
  }
  if (!rolled.size) return toast("Every monster already has a number. Clear one to re-roll it.");
  push(); draw();
  toast(`Rolled ${rolled.size} ${rolled.size === 1 ? "group" : "groups"}.`);
}

// ── The clock ──────────────────────────────────────────────
function startFight() {
  const rows = resolve();
  if (!rows.length) return;
  S.inCombat = true; S.round = 1;
  S.turnId = rows[0].id;
  push(); pushClock(); draw();
}
function endFight() {
  S.inCombat = false; S.round = 0; S.turnId = "";
  // A fuse that was counting rounds has nothing left to count.
  for (const c of S.combatants) if (c.kind !== "pc")
    c.conditions = (c.conditions || []).filter(x => x.rounds == null);
  push();
  if (S.clock !== false) api("POST", "api/initiative/clock", { round: 1, inCombat: false }).catch(() => {});
  draw();
}
function nextTurn() {
  const rows = resolve();
  if (!rows.length) return;
  if (!S.inCombat) return startFight();
  const i = rows.findIndex(r => r.id === S.turnId);
  if (i < 0) { S.turnId = rows[0].id; push(); return draw(); }
  if (i === rows.length - 1) { S.turnId = rows[0].id; newRound(S.round + 1); return; }
  S.turnId = rows[i + 1].id;
  push(); draw();
}
function prevTurn() {
  const rows = resolve();
  if (!rows.length || !S.inCombat) return;
  const i = rows.findIndex(r => r.id === S.turnId);
  S.turnId = rows[(i <= 0 ? rows.length : i) - 1].id;
  // Going back over the top takes the round with it, or the fight gains a round every time the DM
  // corrects themselves.
  if (i <= 0 && S.round > 1) { S.round--; pushClock(); }
  push(); draw();
}
function newRound(n) {
  S.round = n;
  // Every monster's fuses burn down one. The DM is told what went out, because a condition that
  // ended quietly is a condition that goes on being played.
  const ended = [];
  for (const c of S.combatants) {
    if (c.kind === "pc") continue;
    c.conditions = (c.conditions || []).map(x => x.rounds == null ? x : { ...x, rounds: x.rounds - 1 })
      .filter(x => { if (x.rounds != null && x.rounds <= 0) { ended.push(`${c.name}: ${x.name}`); return false; }
                     return true; });
  }
  push(); pushClock(); draw();
  toast(ended.length ? `Round ${n} — ended: ${ended.join(", ")}` : `Round ${n}`);
}

// ── The row's own menu ─────────────────────────────────────
function closeDlg() { el("dlg").close(); }
function openDlg(title, html) {
  el("dlgTitle").textContent = title;
  el("dlgBody").innerHTML = html;
  el("dlg").showModal();
}

function rowMenu(id) {
  const r = resolve().find(x => x.id === id); if (!r) return;
  const c = find(id);
  openDlg(r.name, `
    ${r.kind === "pc" ? `<p class="note">Their hit points, AC, save DC and conditions come from their
      own sheet and are not editable here — what you type in the hit box goes onto that sheet.</p>` : ""}
    <div class="line"><b>Roll initiative</b>
      <button class="mini" onclick="menuRoll('${id}')">d20 ${sign(r.initMod || 0)}</button></div>
    ${r.kind === "npc" ? `<div class="line"><b>Initiative modifier</b>
      <input class="search" style="width:70px" value="${c.initMod || 0}" inputmode="numeric"
        onchange="setNum('${id}','initMod',this.value)"></div>
    <div class="line"><b>Duplicate</b>
      <button class="mini" onclick="duplicate('${id}')">One more</button></div>
    <div class="line"><b>Maximum hit points</b>
      <input class="search" style="width:80px" value="${c.hpMax || 0}" inputmode="numeric"
        onchange="setNum('${id}','hpMax',this.value)"></div>
    <div class="line"><b>Picture</b>
      <label class="mini" style="cursor:pointer">Choose…
        <input type="file" accept="image/*" hidden onchange="rowPicture('${id}', this)"></label>
      ${c.img ? `<button class="mini" onclick="setRowImg('${id}','')">Clear</button>` : ""}</div>` : ""}
    <div class="line"><b>Note</b><span>shown on the row, never in the room</span></div>
    <textarea onchange="setNote('${id}', this.value)"
      placeholder="Recharge 5–6 · breath next round · still has its Legendary Resistance"
      >${esc(c.note || "")}</textarea>
    <div class="line" style="margin-top:12px"><b>Take off the board</b>
      <button class="mini warn" onclick="removeRow('${id}')">Remove</button></div>`);
}
function menuRoll(id) { rollOne(id); push(); draw(); closeDlg(); }
function setNote(id, v) { const c = find(id); if (!c) return; c.note = String(v).slice(0, 400); push(); draw(); }
function setRowImg(id, v) { const c = find(id); if (!c) return; c.img = v; push(); draw(); closeDlg(); }
function rowPicture(id, input) {
  const keep = PIC;
  takePicture(input);
  // takePicture is asynchronous and writes PIC; wait for it, then move it onto the row.
  const t = setInterval(() => {
    if (PIC === keep) return;
    clearInterval(t);
    const img = PIC; PIC = keep;
    setRowImg(id, img);
  }, 80);
  setTimeout(() => clearInterval(t), 8000);
}
function duplicate(id) {
  const c = find(id); if (!c || c.kind === "pc") return;
  const base = String(c.name).replace(/\s+\d+$/, "");
  const n = Math.max(1, ...S.combatants.filter(x => String(x.name || "").replace(/\s+\d+$/, "") === base)
    .map(x => parseInt(String(x.name).match(/\s+(\d+)$/)?.[1] || "1", 10)));
  S.combatants.push({ ...c, id: newId(), name: `${base} ${n + 1}`, hp: c.hpMax, tempHp: 0,
                      conditions: [], init: c.init, down: false, note: "" });
  push(); draw(); closeDlg();
}
function removeRow(id) {
  if (S.turnId === id) nextTurn();
  S.combatants = S.combatants.filter(c => c.id !== id);
  push(); draw(); closeDlg();
}
function clearBoard() {
  if (!confirm("Take everybody off the board? The lineups you saved are kept.")) return;
  S.combatants = []; S.inCombat = false; S.round = 0; S.turnId = "";
  push(); draw();
}

// ── Conditions ─────────────────────────────────────────────
function openConditions(id) {
  const r = resolve().find(x => x.id === id); if (!r) return;
  const has = new Set((r.conditions || []).map(c => c.name));
  openDlg(`${r.name} — conditions`, `
    <div class="grid">${CONDS.map(c => `
      <button class="chip ${has.has(c.name) ? "on" : ""} ${c.campaign ? "camp" : ""}"
        title="${escQ(c.note || "")}" onclick="toggleCondition('${id}','${escQ(c.name)}')">
        ${esc(c.name)}${c.campaign ? " ★" : ""}</button>`).join("")}</div>
    <p class="note">★ is a condition this campaign rewrote — the chip's tooltip carries the ruling.
      ${r.kind === "npc" ? "A number beside one on the row is the round it ends on." : ""}</p>
    ${r.kind === "npc" ? `<div class="line" style="margin-top:10px"><b>Ends after</b>
      <input class="search" id="conRounds" style="width:70px" inputmode="numeric" placeholder="rounds">
      <span>set this first, then pick one</span></div>` : ""}`);
}
async function toggleCondition(id, name) {
  const c = find(id);
  const r = resolve().find(x => x.id === id);
  if (!c || !r) return;
  const had = (r.conditions || []).some(x => x.name === name);

  if (c.kind === "pc") {
    // A PC's conditions live on their sheet, so this is a write to the sheet, in the shape the
    // sheet's own cleaner expects — and it arrives on their screen on the next poll.
    const list = (r.conditions || []).filter(x => x.name !== name).map(x => ({ name: x.name }));
    if (!had) list.push({ name });
    try { await api("PUT", `api/characters/${c.charId}/vitals`, { vitals: { conditions: list } }); }
    catch (err) { return toast(err.message); }
    await pull(); openConditions(id); return;
  }
  const rounds = parseInt(el("conRounds")?.value, 10);
  c.conditions = (c.conditions || []).filter(x => x.name !== name);
  if (!had) c.conditions.push({ name, rounds: Number.isFinite(rounds) && rounds > 0 ? rounds : null });
  push(); draw(); openConditions(id);
}
function dropCondition(id, name) {
  const c = find(id); if (!c) return;
  if (c.kind === "pc") return toggleCondition(id, name);
  c.conditions = (c.conditions || []).filter(x => x.name !== name);
  push(); draw();
}

// ── What the room's screen shows ───────────────────────────
function openRoomSettings() {
  const sh = S.show;
  const flag = (key, label, why) => `<div class="line"><b>${label}</b><span>${why}</span>
    <button class="mini ${sh[key] ? "on" : ""}" onclick="toggleShow('${key}')">${sh[key] ? "Shown" : "Hidden"}</button></div>`;
  openDlg("The room's screen", `
    ${flag("portraits", "Faces", "a picture per row")}
    ${flag("ac", "Armour Class", "they work it out anyway")}
    ${flag("conditions", "Conditions", "who is frightened, who is prone")}
    <div class="line"><b>Monster hit points</b>
      ${["words", "numbers", "none"].map(v => `<button class="mini ${sh.hp === v ? "on" : ""}"
        onclick="setShowHp('${v}')">${v === "words" ? "In words" : v === "numbers" ? "Numbers" : "Nothing"}</button>`).join("")}</div>
    <p class="note">In words is Unhurt · Grazed · Hurt · Bloodied · Reeling · Down. A number on the
      wall tells the table how many rounds are left in the boss, which is yours to say, not the
      tool's to leak. The party is always shown their own numbers — those are on their sheets.</p>
    <div class="line" style="margin-top:12px"><b>Drive the table's clock</b>
      <span>write the round onto every sheet</span>
      <button class="mini ${S.clock !== false ? "on" : ""}" onclick="toggleClock()">
        ${S.clock !== false ? "On" : "Off"}</button></div>
    <p class="note">With this on, pressing Next into a new round tells every character sheet at the
      table, and each one expires its own timed effects — a three-round blessing, a borrowed
      resistance, an extra Bonus Action somebody handed out.</p>`);
}
function toggleShow(key) { S.show[key] = !S.show[key]; push(); openRoomSettings(); }
function setShowHp(v) { S.show.hp = v; push(); openRoomSettings(); }
function toggleClock() { S.clock = S.clock === false; push(); openRoomSettings(); }

// ── Lineups kept for later ─────────────────────────────────
function openLineups() {
  openDlg("Lineups", `
    <div class="line"><b>Save the monsters on the board</b>
      <input class="search" id="lineName" style="width:150px" placeholder="The Gate ambush">
      <button class="mini go" onclick="saveLineup()">Save</button></div>
    ${SAVED.length ? SAVED.map(e => `<div class="line"><b>${esc(e.name)}</b>
        <button class="mini" onclick="loadLineup(${e.id})">Add to the board</button>
        <button class="mini warn" onclick="deleteLineup(${e.id})">Delete</button></div>`).join("")
      : `<p class="note">Nothing saved yet. Only the monsters are kept — the party is whoever is at
         the table that night.</p>`}`);
}
async function saveLineup() {
  const name = el("lineName").value.trim();
  const combatants = S.combatants.filter(c => c.kind === "npc")
    .map(c => ({ ...c, hp: c.hpMax, conditions: [], init: null, down: false }));
  if (!name) return toast("Give the lineup a name.");
  if (!combatants.length) return toast("There are no monsters on the board.");
  try { await api("POST", "api/initiative/encounters", { name, combatants }); }
  catch (err) { return toast(err.message); }
  await pull(); openLineups(); toast(`Saved as “${name}”.`);
}
async function loadLineup(id) {
  let got;
  try { got = await api("GET", `api/initiative/encounters/${id}`); } catch (err) { return toast(err.message); }
  for (const c of got.combatants) S.combatants.push({ ...c, id: newId(), hp: c.hpMax, init: null });
  push(); draw(); closeDlg();
  toast(`${got.name} — ${got.combatants.length} added.`);
}
async function deleteLineup(id) {
  try { await api("DELETE", `api/initiative/encounters/${id}`); } catch (err) { return toast(err.message); }
  await pull(); openLineups();
}

// ═══════════════════════════════════════════════════════════
//  THE SECOND SCREEN
// ═══════════════════════════════════════════════════════════
function drawRoom() {
  const v = ROOM || { order: [], round: 0, inCombat: false };
  el("roomRound").textContent = v.inCombat ? `Round ${v.round}` : "Initiative";
  const turn = v.order.find(r => r.id === v.turnId);
  el("roomSub").textContent = !v.order.length ? "Nothing is running."
    : v.inCombat ? (turn ? `${turn.name}${turn.player ? ` — ${turn.player}` : ""} is up` : "")
    : "Rolled, not started.";
  el("roomList").innerHTML = v.order.map(r => `
    <li class="${r.id === v.turnId && v.inCombat ? "on" : ""} ${r.down ? "down" : ""}">
      <div class="r-init">${r.init == null ? "—" : r.init}</div>
      ${v.show.portraits !== false ? `<div class="r-face">${r.img
        ? `<img src="${escQ(r.img)}" alt="">` : `<span>${r.kind === "pc" ? "◉" : "✦"}</span>`}</div>` : ""}
      <div class="r-id">
        <b>${esc(r.name)}</b>
        ${r.player ? `<span>${esc(r.player)}</span>` : ""}
        ${r.conditions?.length ? `<span class="cons">${r.conditions.map(esc).join(" · ")}</span>` : ""}
      </div>
      <div class="r-hp">
        ${r.hp ? (r.hp.max != null && r.hp.hp != null
            ? `<b>${r.hp.hp}<span> / ${r.hp.max}</span>${r.hp.temp ? `<span> +${r.hp.temp}</span>` : ""}</b>`
            : `<b class="w-${String(r.hp.word).toLowerCase()}">${esc(r.hp.word)}</b>`)
          : ""}
        ${v.show.ac !== false && r.ac != null ? `<span>AC ${r.ac}</span>` : ""}
      </div>
    </li>`).join("");
  el("roomFoot").textContent = v.order.length
    ? "Once Upon a Star ★ — this screen follows the DM's board."
    : "";
}

// ═══════════════════════════════════════════════════════════
//  POLL AND BOOT
// ═══════════════════════════════════════════════════════════
// Four seconds while a fight is running, twelve while it is not — the same reasoning as the party
// board's own timer, and nothing polls at all in a background tab.
const TICK = 4000;
let ticks = 0;

async function pull() {
  const d = await api("GET", "api/initiative" + (ASROOM ? "?view=1" : ""));
  if (d.role !== "dm" || ASROOM) {
    // The DM previewing the room is served the player's own resolved view (`?view=1`), so the
    // preview is the television rather than a drawing of it.
    ROOM = d.view || ROOM;
    drawRoom();
    return;
  }
  PARTY = d.party || [];
  if (d.conditions?.length) CONDS = d.conditions;
  SAVED = d.encounters || [];
  if (!DIRTY && !PUSHING) S = { ...S, ...d.state };
  draw(true);
}

setInterval(async () => {
  if (document.hidden) return;
  ticks++;
  if (!ASROOM && S && !S.inCombat && ticks % 3) return;      // out of combat, every third tick
  try { await pull(); } catch { /* a dropped poll is the next poll's problem */ }
}, TICK);

// Space, N and → are the next turn; B and ← go back; R rolls the monsters; A opens the drawer. Not
// while something is being typed into, and not while a dialog is open.
document.addEventListener("keydown", e => {
  if (ASROOM || !S || e.metaKey || e.ctrlKey || e.altKey) return;
  // Escape is the one key the drawer takes while a field has the cursor — it is how you get out of
  // a half-typed monster without reaching for the mouse.
  if (e.key === "Escape" && ADDOPEN && !el("dlg").open) { e.preventDefault(); return toggleAdd(false); }
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "")) return;
  if (el("dlg").open) return;
  const k = e.key.toLowerCase();
  if (k === "a") { e.preventDefault(); return toggleAdd(); }
  if (k === " " || k === "n" || k === "arrowright") { e.preventDefault(); nextTurn(); }
  else if (k === "b" || k === "arrowleft") { e.preventDefault(); prevTurn(); }
  else if (k === "r") { e.preventDefault(); rollAll(); }
});

// The DM's own preview of the room, and the URL a player opens. #player forces the second screen
// even for the DM, so the television and the laptop are the same page with the same link.
window.addEventListener("hashchange", () => location.reload());

async function boot() {
  ASROOM = location.hash === "#player";
  let me = null;
  try { me = await fetch(API_BASE + "api/me"); } catch (e) {}
  if (!me || me.status === 404)
    return showLocked("This board needs the app's own server — there are no accounts on a static host.");
  if (!me.ok) { el("gate").hidden = false; el("gateUser").focus(); return; }
  ME = (await me.json()).user;

  el("whoBtn").textContent = ME.displayName;
  el("who").hidden = false;

  let d;
  try { d = await api("GET", "api/initiative" + (ASROOM ? "?view=1" : "")); }
  catch (err) { return showLocked(err.message); }

  if (d.role === "dm" && !ASROOM) {
    S = d.state; PARTY = d.party || []; CONDS = d.conditions || []; SAVED = d.encounters || [];
    el("board").hidden = false;
    document.body.classList.toggle("add-open", ADDOPEN);
    // An empty board is a board somebody is about to fill: the drawer opens itself once.
    if (!S.combatants.length && !ADDOPEN) toggleAdd(true);
    draw();
  } else {
    // A player — or the DM holding the second screen. Either way, no board.
    document.body.classList.add("as-room");
    el("room").hidden = false;
    if (d.role === "dm") { el("bar").classList.add("room-bar"); }
    ROOM = d.view || { order: [], round: 0, inCombat: false, show: {} };
    drawRoom();
    if (d.role === "dm") await pull();
  }
}

function showLocked(why) {
  el("locked").hidden = false;
  el("lockedWhy").textContent = why;
}

document.addEventListener("click", e => {
  document.querySelectorAll("details.more[open]").forEach(d => { if (!d.contains(e.target)) d.open = false; });
});

document.addEventListener("DOMContentLoaded", boot);
