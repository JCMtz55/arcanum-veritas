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

// A plate's URL is relative to `sheet/` — that is where the catalogue of them lives, and it does
// not guess who is reading it (the Admin board prefixes it too). This page is `initiative/`, so a
// plate served raw here asks for `initiative/img/portraits/…` and gets nothing: which is exactly
// why the party's faces were blank squares. A picture the DM dropped on a row is a data URL and is
// left alone.
const imgSrc = u => !u ? "" : /^(data:|https?:|\/|\.\.\/)/.test(u) ? u : `../sheet/${u}`;

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
let EMOTIONS = [];       // the campaign's Vile Emotions, from Vileness.md by way of the server
let GRADES = [];         // Demi-Nightmare · Nightling · Recurring · Primordial
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
  api("POST", "api/initiative/clock", { round: S.round || 1, inCombat: S.inCombat, fightId: S.fightId || "" })
    .catch(() => { /* the fight is not stopping for this */ });
}

// ── The order ──────────────────────────────────────────────
// A PC row is merged with their live card HERE, in the page, and sorted the same way the server
// sorts for the room: highest first, nobody who has not rolled above somebody who has, ties in the
// order the DM put them in. The player's view is resolved server-side instead, because that is
// where things are left out and a browser must not be trusted with that.
function resolve() {
  const byId = new Map(PARTY.map(p => [p.id, p]));
  const rows = S.combatants.map(c => {
    if (c.kind !== "pc") return { ...c, player: "" };
    const p = byId.get(c.charId);
    if (!p) return { ...c, name: "(gone)", gone: true, hp: 0, hpMax: 0, tempHp: 0, ac: null, dc: null,
                     conditions: [], down: false, player: "" };
    return {
      ...c,
      name: p.name, player: p.player, level: p.level,
      // The crop on the row; the uncropped painting is what a splash falls back to.
      img: p.portrait || p.portraitArt || "",
      artFull: p.portraitArt || p.portrait || "",
      hp: p.hp, hpMax: p.maxHp, tempHp: p.tempHp,
      ac: p.ac, dc: p.saveDc, initMod: p.initiative,
      conditions: (p.conditions || []).map(x => ({ name: typeof x === "string" ? x : x?.name, rounds: null }))
        .filter(x => x.name),
      down: p.hp <= 0,
      wounds: p.wounds, deathSaveDC: p.deathSaveDC, fate: p.fate,
      exhaustion: p.exhaustion, dreamExhaustion: p.dreamExhaustion,
      dreamExhaustionName: p.dreamExhaustionName,
      round: p.round, art: p.art || {},
    };
  });
  return turnSlots(rows).sort((a, b) =>
    (a.init == null) - (b.init == null) || (b.init ?? 0) - (a.init ?? 0) ||
    (b.initMod ?? 0) - (a.initMod ?? 0) || String(a.name).localeCompare(String(b.name)) ||
    a.slot - b.slot);
}

// A boss that acts more than once a round sits in the order more than once. The extra places are
// SLOTS of the same creature — `id#1` — with an initiative of their own and the same hit points.
// Damage typed on any of them lands on the one monster, which is the whole reason this is not two
// rows the DM adds by hand and then has to keep level with each other. The server expands the room
// view the same way, from the same fields.
function turnSlots(rows) {
  const out = [];
  for (const r of rows) {
    const turns = r.kind === "pc" ? 1 : Math.max(1, r.boss?.turns || 1);
    out.push({ ...r, baseId: r.id, slot: 0, slots: turns });
    for (let i = 1; i < turns; i++)
      out.push({ ...r, id: `${r.id}#${i}`, baseId: r.id, slot: i, slots: turns,
                 init: r.boss.inits?.[i - 1] ?? null, conditions: [], counters: [] });
  }
  return out;
}

// A slot's id carries the creature's own id in front of the `#`, so everything that writes — the
// damage box, the menu, a condition — finds the one combatant behind however many places it takes.
const baseOf = id => String(id).split("#")[0];
const slotOf = id => Number(String(id).split("#")[1] || 0);
const find = id => S.combatants.find(c => c.id === baseOf(id));
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
                ${r.down ? "down" : ""} ${r.hidden ? "off" : ""} ${r.gone ? "gone" : ""}
                ${r.slot ? "slot" : ""}" data-id="${r.id}">
      <input class="ini-init ${r.init == null ? "none" : ""}" value="${r.init == null ? "" : r.init}"
        inputmode="numeric" placeholder="roll" aria-label="Initiative for ${escQ(r.name)}"
        onchange="setInit('${r.id}', this.value)">
      <div class="ini-face" onclick="rowMenu('${r.id}')" title="${escQ(r.name)}">
        ${r.img ? `<img src="${escQ(imgSrc(r.img))}" alt="">` : `<span>${pc ? "◉" : "✦"}</span>`}
      </div>
      <div class="ini-id">
        <b>${esc(r.name)}${r.slots > 1 ? `<i class="ini-turnof">turn ${r.slot + 1}/${r.slots}</i>` : ""}</b>
        <span>${pc
          ? `${esc(r.player || "")}${r.level ? ` · Lv ${r.level}` : ""}${
              r.exhaustion ? ` · Exh ${r.exhaustion}` : ""}${
              r.dreamExhaustion ? ` · ${esc(r.dreamExhaustionName || "Dream")} ${r.dreamExhaustion}` : ""}`
          : `${r.nightmare?.grade ? esc(r.nightmare.grade) : r.boss ? "boss" : ""}${
              r.nightmare?.grade || r.boss ? " · " : ""}${
              r.initMod ? `init ${sign(r.initMod)}` : "monster"}${r.hidden ? " · off the screen" : ""}`}</span>
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
        ${pc ? woundChip(r) : ""}
        ${r.slot ? "" : trackChips(r)}
        ${(r.conditions || []).map(c => `<button class="chip ${isCampaign(c.name) ? "camp" : ""}"
            onclick="dropCondition('${r.id}','${escQ(c.name)}')" title="Click to clear">
            ${esc(c.name)}${c.rounds ? `<i>${c.rounds}</i>` : ""}</button>`).join("")}
        ${r.slot ? "" : `<button class="chip add" onclick="openConditions('${r.id}')" title="Add a condition">+</button>`}
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

// ── What a row counts ──────────────────────────────────────
// Everything here is the same chip: a word and a number, click to spend one, shift-click to put one
// back, the whole meaning on the tooltip. Wounds are a PC's and come from their sheet; the rest are
// a monster's and live on the board.
function woundChip(r) {
  const n = r.wounds || 0;
  return `<button class="chip wnd ${n ? "on" : ""}" onclick="bumpWound('${r.id}', event)"
    title="Wounds — ${n} of 20, from their sheet. Click to add one, shift-click to heal one.">W·${n}</button>`;
}

function trackChips(r) {
  const out = [];
  const b = r.boss, nm = r.nightmare;
  if (b && b.legendaryMax)
    out.push(`<button class="chip boss" onclick="spendLegendary('${r.id}', event)"
      title="Legendary Resistance — ${b.legendary} of ${b.legendaryMax} left. Click to burn one, shift-click to give it back.">
      LR ${pips(b.legendary, b.legendaryMax)}</button>`);
  if (b && b.phases > 1)
    out.push(`<button class="chip boss" onclick="nextPhase('${r.id}', event)"
      title="Phase ${b.phase} of ${b.phases}. Click for the next one, shift-click to go back.">
      ◆ ${b.phase}/${b.phases}</button>`);
  if (nm && nm.rootsMax)
    out.push(`<button class="chip nm" onclick="cutRoot('${r.id}', event)"
      title="Roots — ${nm.roots} of ${nm.rootsMax} still in the ground${
        nm.emotions?.length ? `: ${nm.emotions.join(", ")}` : ""}. Click to cut one, shift-click to put it back.">
      ⚯ ${nm.roots}/${nm.rootsMax}</button>`);
  if (nm && nm.emotions?.length)
    out.push(`<span class="chip nm flat" title="${escQ(`Root Vile Emotion${nm.emotions.length > 1 ? "s" : ""}: ${nm.emotions.join(", ")}`)}">
      ${esc(nm.emotions[0])}${nm.emotions.length > 1 ? ` +${nm.emotions.length - 1}` : ""}</span>`);
  for (const c of r.counters || [])
    out.push(`<button class="chip ctr" onclick="bumpCounter('${r.id}','${escQ(c.id)}', event)"
      title="${escQ(`${c.name}${c.why ? ` — ${c.why}` : ""}. Click to take one off, shift-click to put one back.`)}">
      ${esc(c.name)} ${c.max ? pips(c.n, c.max) : c.n}</button>`);
  return out.join("");
}

// Pips while there are few enough to read at a glance, a number once there are not.
const pips = (n, max) => max > 6 ? `${n}/${max}`
  : "●".repeat(Math.max(0, n)) + "○".repeat(Math.max(0, max - n));

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
    ${optionBlocks("a")}
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

// ── The two switches ───────────────────────────────────────
// Shut, a monster is still five boxes. Thrown, they are the two kinds of creature this campaign
// builds a night around: the boss the fight is about, and a Nightmare, which is a Denizen corrupted
// by Vile Emotions and is fought by cutting what roots it here.
//
// The same block is the add form's and the row menu's, with a prefix so the two sets of fields can
// be on the page at once. Their open/shut state is held here rather than in the DOM, because this
// panel is repainted whenever the poll comes back and a <details> would spring shut under the DM.
const OPT = { a: { boss: false, nm: false, emo: new Set() }, e: { boss: false, nm: false, emo: new Set() } };

function optionBlocks(p) {
  const o = OPT[p];
  const num = (id, label, val, ph) => `<div class="ini-f w-n"><label for="${p}${id}">${label}</label>
    <input id="${p}${id}" value="${val == null ? "" : val}" inputmode="numeric" placeholder="${ph}"></div>`;
  return `
  <div class="ini-opt ${o.boss ? "open" : ""}">
    <button class="opt-hd" onclick="flipOpt('${p}','boss')">
      <i>${o.boss ? "▾" : "▸"}</i> Boss${o.boss ? "" : `<span>legendary resistances · phases · turns</span>`}</button>
    ${o.boss ? `<div class="ini-form">
      ${num("Lr", "Resist.", OPTV(p, "Lr"), "3")}
      ${num("Ph", "Phases", OPTV(p, "Ph"), "2")}
      ${num("Tn", "Turns", OPTV(p, "Tn"), "1")}
      <p class="hint">Two turns puts it in the order twice, sharing one pool of hit points.</p>
    </div>` : ""}
  </div>
  <div class="ini-opt ${o.nm ? "open" : ""}">
    <button class="opt-hd" onclick="flipOpt('${p}','nm')">
      <i>${o.nm ? "▾" : "▸"}</i> Nightmare${o.nm ? "" : `<span>grade · vile emotions · roots</span>`}</button>
    ${o.nm ? `<div class="ini-form">
      <div class="ini-f"><label for="${p}Gr">Grade</label>
        <select id="${p}Gr" class="opt-sel">${["", ...GRADES].map(g =>
          `<option value="${escQ(g)}" ${OPTV(p, "Gr") === g ? "selected" : ""}>${g || "—"}</option>`).join("")}</select></div>
      ${num("Rt", "Roots", OPTV(p, "Rt"), "3")}
    </div>
    <div class="opt-emo">${EMOTIONS.map(e => `<button class="chip ${o.emo.has(e) ? "on" : ""}"
        onclick="flipEmotion('${p}','${escQ(e)}')">${esc(e)}</button>`).join("")}</div>
    <p class="hint">Its Root Vile Emotions — what it is made of, and what purifying it has to answer.</p>` : ""}
  </div>`;
}
// What is already typed into one of those fields, so a repaint does not empty it.
const OPTV = (p, id) => { const n = el(`${p}${id}`); return n ? n.value : ""; };
function flipOpt(p, which) {
  OPT[p][which] = !OPT[p][which];
  if (p === "a") drawAdd(); else drawOptEditor();
}
function flipEmotion(p, e) {
  OPT[p].emo.has(e) ? OPT[p].emo.delete(e) : OPT[p].emo.add(e);
  if (p === "a") drawAdd(); else drawOptEditor();
}
// Read the two blocks back out — null when the switch was never thrown, which is almost every row.
function readOptions(p) {
  const o = OPT[p];
  const n = id => { const v = parseInt(OPTV(p, id), 10); return Number.isFinite(v) ? v : 0; };
  const lr = n("Lr"), roots = n("Rt");
  return {
    boss: o.boss ? { legendary: lr, legendaryMax: lr, phases: Math.max(1, n("Ph") || 1), phase: 1,
                     turns: Math.max(1, Math.min(4, n("Tn") || 1)), inits: [] } : null,
    nightmare: o.nm ? { grade: OPTV(p, "Gr") || "", emotions: [...o.emo], roots, rootsMax: roots } : null,
  };
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
  const opt = readOptions("a");
  for (let i = 0; i < n; i++) {
    S.combatants.push({
      id: newId(), kind: "npc",
      // Each of four gets its OWN resistances and its own roots: they are four creatures, and a
      // counter they shared would be a counter that is wrong for three of them.
      boss: opt.boss ? { ...opt.boss, inits: [] } : null,
      nightmare: opt.nightmare ? { ...opt.nightmare, emotions: [...opt.nightmare.emotions] } : null,
      counters: [],
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
  const n = value.trim() === "" ? null : parseInt(value, 10) || 0;
  // The second turn of a boss keeps its own number, beside the first one rather than instead of it.
  const slot = slotOf(id);
  if (slot && c.boss) { c.boss.inits = c.boss.inits || []; c.boss.inits[slot - 1] = n; }
  else c.init = n;
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

// ── The counters, spent from the row ───────────────────────
// Click spends, shift-click gives back — one gesture per chip, because mid-fight a second menu to
// burn a Legendary Resistance is a menu that does not get used and a resistance that gets forgotten.
function spendLegendary(id, ev) {
  const c = find(id); if (!c?.boss) return;
  const back = ev?.shiftKey;
  c.boss.legendary = Math.max(0, Math.min(c.boss.legendaryMax, c.boss.legendary + (back ? 1 : -1)));
  push(); draw();
  if (!back) toast(c.boss.legendary ? `${c.name} refuses it — ${c.boss.legendary} left.`
                                    : `${c.name} has no resistance left.`);
}
function nextPhase(id, ev) {
  const c = find(id); if (!c?.boss) return;
  const step = ev?.shiftKey ? -1 : 1;
  c.boss.phase = Math.max(1, Math.min(c.boss.phases, (c.boss.phase || 1) + step));
  push(); draw();
  toast(`${c.name} — phase ${c.boss.phase} of ${c.boss.phases}.`);
}
function cutRoot(id, ev) {
  const c = find(id); if (!c?.nightmare) return;
  const back = ev?.shiftKey;
  const nm = c.nightmare;
  nm.roots = Math.max(0, Math.min(nm.rootsMax, nm.roots + (back ? 1 : -1)));
  push(); draw();
  if (!back) toast(nm.roots ? `A root is cut — ${nm.roots} still in the ground.`
                            : `${c.name} has nothing left holding it here.`);
}
function bumpCounter(id, cid, ev) {
  const c = find(id); if (!c) return;
  const ctr = (c.counters || []).find(x => x.id === cid); if (!ctr) return;
  const step = ev?.shiftKey ? 1 : -1;
  ctr.n = Math.max(0, Math.min(ctr.max ?? 999, ctr.n + step));
  push(); draw();
}
// Wounds are on the PLAYER'S sheet, so this is a write to it rather than a number the board keeps.
async function bumpWound(id, ev) {
  const c = find(id); if (!c || c.kind !== "pc") return;
  const r = resolve().find(x => x.id === id); if (!r) return;
  const n = Math.max(0, Math.min(20, (r.wounds || 0) + (ev?.shiftKey ? -1 : 1)));
  if (n === (r.wounds || 0)) return;
  try { await api("PUT", `api/characters/${c.charId}/vitals`, { vitals: { wounds: n }, note: "initiative board" }); }
  catch (err) { return toast(err.message); }
  await pull(); draw();
  toast(`${r.name} — ${n} Wound${n === 1 ? "" : "s"}.`);
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
  const n = d20() + (row?.initMod || 0);
  const slot = slotOf(id);
  if (slot && c.boss) { c.boss.inits = c.boss.inits || []; c.boss.inits[slot - 1] = n; }
  else c.init = n;
}
function rollAll() {
  // Six Redcaps roll ONCE between them: the same name and the same modifier is the same group of
  // monsters, and six separate numbers for them is six turns the DM has to remember instead of one.
  const rolled = new Map();
  for (const c of S.combatants) {
    if (c.kind === "pc") continue;
    const row = resolve().find(r => r.id === c.id);
    if (c.init == null) {
      const key = `${String(c.name).replace(/\s+\d+$/, "")}|${row?.initMod || 0}`;
      if (!rolled.has(key)) rolled.set(key, d20() + (row?.initMod || 0));
      c.init = rolled.get(key);
    }
    // A boss's second turn is its own place in the order, so it is its own roll — grouping it with
    // the first would put the two turns back to back, which is the one thing it must not do.
    for (let i = 1; i < (c.boss?.turns || 1); i++) {
      c.boss.inits = c.boss.inits || [];
      if (c.boss.inits[i - 1] == null) {
        c.boss.inits[i - 1] = d20() + (row?.initMod || 0);
        rolled.set(`${c.id}#${i}`, c.boss.inits[i - 1]);
      }
    }
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
  // A NEW fight, and the sheets have to be told that rather than handed a 1. Without an id of its
  // own, "start the fight" wrote round 1 under seven sheets that still said round five — they kept
  // showing the old number until their players reloaded, and whatever the last fight left running
  // was still running. The sheet ends the old fight properly when it sees an id it does not know.
  S.fightId = newId();
  S.turnId = rows[0].id;
  push(); pushClock(); draw();
}
function endFight() {
  S.inCombat = false; S.round = 0; S.turnId = "";
  // A fuse that was counting rounds has nothing left to count.
  for (const c of S.combatants) if (c.kind !== "pc")
    c.conditions = (c.conditions || []).filter(x => x.rounds == null);
  push();
  if (S.clock !== false)
    api("POST", "api/initiative/clock", { round: 1, inCombat: false, fightId: S.fightId || "" })
      .catch(() => {});
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
    ${r.kind === "pc" ? `<div class="line"><b>Splash art</b>
      <span>their turn, on the room's screen</span>
      <button class="mini" onclick="openSplash(${c.charId})">Pictures…</button></div>` : ""}
    ${r.kind === "npc" ? `<div class="line"><b>Counters</b>
      <span>${(c.counters || []).length ? (c.counters || []).map(x => x.name).join(" · ") : "none yet"}</span>
      <button class="mini" onclick="openCounters('${id}')">Keep count…</button></div>
    <div class="line"><b>Boss and Nightmare</b>
      <span>${c.boss ? "boss" : ""}${c.boss && c.nightmare ? " · " : ""}${c.nightmare ? (c.nightmare.grade || "nightmare") : ""}${
        !c.boss && !c.nightmare ? "neither — an ordinary monster" : ""}</span>
      <button class="mini" onclick="openOptions('${id}')">Switches…</button></div>
    <div class="line"><b>Initiative modifier</b>
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
  // A deep copy, or the two of them would share one set of counters and one pool of resistances —
  // the second Krieger would lose a root because the first one did.
  const copy = JSON.parse(JSON.stringify(c));
  if (copy.boss) { copy.boss.legendary = copy.boss.legendaryMax; copy.boss.phase = 1; copy.boss.inits = []; }
  if (copy.nightmare) copy.nightmare.roots = copy.nightmare.rootsMax;
  for (const k of copy.counters || []) { k.id = newId(); if (k.max != null) k.n = k.max; }
  S.combatants.push({ ...copy, id: newId(), name: `${base} ${n + 1}`, hp: c.hpMax, tempHp: 0,
                      conditions: [], init: c.init, down: false, note: "" });
  push(); draw(); closeDlg();
}
function removeRow(id) {
  const base = baseOf(id);
  if (baseOf(S.turnId) === base) nextTurn();
  S.combatants = S.combatants.filter(c => c.id !== base);
  push(); draw(); closeDlg();
}
function clearBoard() {
  if (!confirm("Take everybody off the board? The lineups you saved are kept.")) return;
  const wasFighting = S.inCombat;
  S.combatants = []; S.inCombat = false; S.round = 0; S.turnId = "";
  push();
  // Clearing the board mid-fight IS ending the fight, and the sheets have to hear it — otherwise
  // seven of them sit in combat all evening waiting for a round that never comes.
  if (wasFighting && S.clock !== false)
    api("POST", "api/initiative/clock", { round: 1, inCombat: false, fightId: S.fightId || "" })
      .catch(() => {});
  draw();
}

// ── Counters: a number on a monster, and what it means ─────
// Free-form, because what a fight needs counted is different every fight — resistances left,
// charges on a relic, cultists still chanting, how many times it has eaten. The meaning is stored
// beside the number and shown on the chip's tooltip, so a board picked up an hour later still says
// what the 3 was for.
let CTR_FOR = "";
function openCounters(id) {
  CTR_FOR = id;
  const c = find(id); if (!c) return;
  const list = c.counters || [];
  openDlg(`${c.name} — counters`, `
    ${list.length ? list.map(x => `<div class="line">
        <b>${esc(x.name)}</b>
        <span>${esc(x.why || "")}</span>
        <button class="mini" onclick="setCounter('${escQ(x.id)}',-1)">−</button>
        <span class="ctr-n">${x.n}${x.max ? ` / ${x.max}` : ""}</span>
        <button class="mini" onclick="setCounter('${escQ(x.id)}',1)">+</button>
        <button class="mini warn" onclick="dropCounter('${escQ(x.id)}')">Remove</button>
      </div>`).join("")
    : `<p class="note">Nothing counted on this one yet.</p>`}
    <div class="line" style="margin-top:12px;flex-wrap:wrap">
      <input class="search" id="ctrName" style="width:130px" placeholder="Legendary Resistance">
      <input class="search" id="ctrN" style="width:56px" inputmode="numeric" placeholder="3">
      <span>of</span>
      <input class="search" id="ctrMax" style="width:56px" inputmode="numeric" placeholder="3">
      <button class="mini go" onclick="addCounter()">Add</button>
    </div>
    <input class="search" id="ctrWhy" style="width:100%;margin-top:8px"
      placeholder="What it means — burned to refuse a save">
    <p class="note">Leave “of” empty for a plain number. On the row, a click takes one off and a
      shift-click puts one back.</p>`);
}
function addCounter() {
  const c = find(CTR_FOR); if (!c) return;
  const name = el("ctrName").value.trim();
  if (!name) return toast("Give the counter a name.");
  const n = parseInt(el("ctrN").value, 10);
  const max = parseInt(el("ctrMax").value, 10);
  c.counters = (c.counters || []).concat({
    id: newId(), name, n: Number.isFinite(n) ? n : 0,
    max: Number.isFinite(max) ? max : null, why: el("ctrWhy").value.trim(),
  });
  push(); draw(); openCounters(CTR_FOR);
}
function setCounter(cid, step) {
  const c = find(CTR_FOR); if (!c) return;
  const x = (c.counters || []).find(k => k.id === cid); if (!x) return;
  x.n = Math.max(0, Math.min(x.max ?? 999, x.n + step));
  push(); draw(); openCounters(CTR_FOR);
}
function dropCounter(cid) {
  const c = find(CTR_FOR); if (!c) return;
  c.counters = (c.counters || []).filter(k => k.id !== cid);
  push(); draw(); openCounters(CTR_FOR);
}

// ── The two switches, on a monster already on the board ────
let OPT_FOR = "";
function openOptions(id) {
  OPT_FOR = id;
  const c = find(id); if (!c) return;
  OPT.e.boss = !!c.boss;
  OPT.e.nm = !!c.nightmare;
  OPT.e.emo = new Set(c.nightmare?.emotions || []);
  openDlg(`${c.name} — boss and nightmare`, "");
  drawOptEditor(true);
}
// Drawn separately from the dialog's frame so flipping a switch repaints only the body — and so
// the fields keep what is typed into them, the same way the add form does.
function drawOptEditor(first) {
  const c = find(OPT_FOR); if (!c) return;
  const b = c.boss, nm = c.nightmare;
  el("dlgBody").innerHTML = `
    ${optionBlocks("e")}
    <div class="line" style="margin-top:12px">
      <b>${b || nm ? "Keep it" : "Save"}</b>
      <span>${b?.turns > 1 ? `it will sit in the order ${b.turns} times` : ""}</span>
      <button class="mini go" onclick="saveOptions()">Apply</button></div>
    <p class="note">Turning a switch off and applying takes that side off the monster. Resistances
      and roots already spent are kept unless you change their number.</p>`;
  // Only on the way in: afterwards these are whatever the DM has typed.
  if (first) {
    if (b) { el("eLr").value = b.legendaryMax || 0; el("ePh").value = b.phases || 1; el("eTn").value = b.turns || 1; }
    if (nm) { el("eRt").value = nm.rootsMax || 0; if (el("eGr")) el("eGr").value = nm.grade || ""; }
  }
}
function saveOptions() {
  const c = find(OPT_FOR); if (!c) return;
  const had = { boss: c.boss, nm: c.nightmare };
  const next = readOptions("e");
  if (next.boss && had.boss) {
    // What is already spent stays spent: a resistance burned this round does not come back because
    // the DM opened this dialog to add a phase.
    next.boss.legendary = Math.min(had.boss.legendary, next.boss.legendaryMax);
    next.boss.phase = Math.min(had.boss.phase || 1, next.boss.phases);
    next.boss.inits = (had.boss.inits || []).slice(0, Math.max(0, next.boss.turns - 1));
  }
  if (next.nightmare && had.nm) next.nightmare.roots = Math.min(had.nm.roots, next.nightmare.rootsMax);
  c.boss = next.boss;
  c.nightmare = next.nightmare;
  push(); draw(); closeDlg();
  toast(`${c.name} — ${[next.boss ? "boss" : "", next.nightmare ? "nightmare" : ""].filter(Boolean).join(" and ")
    || "an ordinary monster again"}.`);
}

// ── Splash art ─────────────────────────────────────────────
// Two pictures per character: the one the room sees when their turn comes up, and the one it sees
// instead when they are nearly out. Stored on the CHARACTER rather than on this board, so they are
// uploaded once and are there every session — and out of the sheet's own JSON, so a player's
// autosave never carries them. Downscaled here, as portraits are, because a phone photograph is
// four megabytes of something that will be shown 500px tall.
let SPLASH_FOR = 0;
function openSplash(charId) {
  SPLASH_FOR = charId;
  const p = PARTY.find(x => x.id === charId);
  const bust = Date.now();
  openDlg(`${p?.name || "Splash art"} — the room's screen`, `
    <div class="spl-pair">
      ${["normal", "hurt"].map(k => `<div class="spl">
        <b>${k === "normal" ? "Their turn" : "Nearly out"}</b>
        <div class="spl-box">${p?.art?.[k]
          ? `<img src="${API_BASE}api/characters/${charId}/art/${k}?t=${bust}" alt="">`
          : `<span>nothing yet</span>`}</div>
        <label class="mini" style="cursor:pointer">Choose…
          <input type="file" accept="image/*" hidden onchange="uploadSplash('${k}', this)"></label>
        ${p?.art?.[k] ? `<button class="mini warn" onclick="clearSplash('${k}')">Clear</button>` : ""}
      </div>`).join("")}
    </div>
    <p class="note">The second one is used from a tenth of their maximum hit points downwards. With
      no splash uploaded the room falls back to the full painting behind their plate, so a character
      with a plate already has something. Light novel, anime, Persona — whatever you paint them as.</p>`);
}
async function uploadSplash(kind, input) {
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  toast("Reading the picture…");
  let data;
  try { data = await shrink(file, ART_SIDE); } catch { return toast("That file is not a picture this browser can read."); }
  try { await api("PUT", `api/characters/${SPLASH_FOR}/art`, { [kind]: data }); }
  catch (err) { return toast(err.message); }
  await pull();
  openSplash(SPLASH_FOR);
  toast("Saved — it comes up when their turn does.");
}
async function clearSplash(kind) {
  try { await api("PUT", `api/characters/${SPLASH_FOR}/art`, { [kind]: "" }); }
  catch (err) { return toast(err.message); }
  await pull();
  openSplash(SPLASH_FOR);
}
// Longest side to `side` pixels, aspect kept — a splash is a portrait of a person, not a square.
//
// A cut-out keeps its cut. This used to re-encode everything as JPEG, which has no alpha, so a
// painting with its background removed arrived as that same figure on a hard black rectangle —
// close enough to pass on the room's dark panel, and wrong the moment the feather or the pool of
// light fell across it. Now a picture that HAS transparency is sent in a format that can carry it
// and only a picture that doesn't is flattened, where JPEG is the smaller file and loses nothing.
const ART_BUDGET = 880_000;      // under the server's 900k, counted on the data URL like it counts

// The panel the splash fills is about 1030 tall on a 1080p television, so anything under that is
// being stretched back up to meet it. 900 was costing roughly a seventh of the height in sharpness
// on exactly the screen this was built for.
const ART_SIDE = 1200;

function hasAlpha(ctx, w, h) {
  let px;
  try { px = ctx.getImageData(0, 0, w, h).data; } catch { return true; }  // unreadable — assume it does
  for (let i = 3; i < px.length; i += 4 * 4) if (px[i] < 255) return true;
  return false;
}

// Best quality that still fits the budget, or nothing if even the lowest does not.
function encodeWithin(canvas, type) {
  for (const q of [0.9, 0.8, 0.7, 0.6]) {
    const url = canvas.toDataURL(type, q);
    if (url.length <= ART_BUDGET) return url;
  }
  return null;
}

function shrink(file, side) {
  return new Promise((ok, no) => {
    const fr = new FileReader();
    fr.onerror = no;
    fr.onload = () => {
      const img = new Image();
      img.onerror = no;
      img.onload = () => {
        const s = Math.min(1, side / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        const ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0, c.width, c.height);

        // WebP carries alpha at a fraction of PNG's size. A browser that cannot encode it hands
        // back a PNG instead, which carries alpha too — so either answer is one we can use. A flat
        // picture goes to JPEG, which is smaller still and throws away nothing it had.
        const type = hasAlpha(ctx, c.width, c.height) ? "image/webp" : "image/jpeg";

        const fits = encodeWithin(c, type);
        if (fits) return ok(fits);

        // Still too heavy even at the lowest quality — give up resolution rather than the cut-out.
        const half = document.createElement("canvas");
        half.width = Math.max(1, Math.round(c.width / 2));
        half.height = Math.max(1, Math.round(c.height / 2));
        half.getContext("2d").drawImage(c, 0, 0, half.width, half.height);
        ok(encodeWithin(half, type) || half.toDataURL("image/jpeg", 0.6));
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
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
    ${flag("splash", "Splash art", "whose turn it is, in the corner")}
    ${flag("stats", "Their numbers", "scores, hit points and slots beside the splash")}
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
  // The room reads the order as a QUEUE, not as a table of initiative numbers: whoever is up is at
  // the top, and the moment their turn ends they drop to the bottom, behind the line where the next
  // round begins. Everybody at the table can see how far away their turn is without counting past
  // the people who have already gone. The DM's board keeps the plain initiative order — that one is
  // for editing, and a list that moves under the cursor is a list you mistype into.
  const idx = v.inCombat ? v.order.findIndex(r => r.id === v.turnId) : -1;
  const queue = idx > 0 ? [...v.order.slice(idx), ...v.order.slice(0, idx)] : v.order;
  // Where this round ends: everybody after this line acts again in the next one.
  const breakAt = idx >= 0 ? v.order.length - idx : -1;
  el("roomList").innerHTML = queue.map((r, i) => `
    ${i === breakAt ? roundBreak(v.round + 1) : ""}
    <li class="${r.id === v.turnId && v.inCombat ? "on" : ""} ${r.down ? "down" : ""}
               ${breakAt >= 0 && i >= breakAt ? "later" : ""}">
      <div class="r-init">${r.init == null ? "—" : r.init}</div>
      ${v.show.portraits !== false ? `<div class="r-face">${r.img
        ? `<img src="${escQ(imgSrc(r.img))}" alt="">` : `<span>${r.kind === "pc" ? "◉" : "✦"}</span>`}</div>` : ""}
      <div class="r-id">
        <b>${esc(r.name)}${r.slots > 1 ? ` <i class="r-turnof">turn ${r.slot + 1} of ${r.slots}</i>` : ""}</b>
        ${r.player ? `<span>${esc(r.player)}${r.wounds ? ` · ${r.wounds} Wound${r.wounds > 1 ? "s" : ""}` : ""}</span>` : ""}
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
  drawSplash(v, turn);
  fitRoom();
}

// Nobody walks over to scroll a television, so the order is MEASURED against the screen rather
// than guessed at from how many rows there are: tighten once, tighten again, and a fight with a
// dozen things in it still ends above the bottom edge.
function fitRoom() {
  const room = document.querySelector(".ini-room");
  if (!room) return;
  const b = document.body;
  // Its BOTTOM against the screen's, not its height: the bar sits above it and takes fifty pixels
  // that a height comparison would hand out twice.
  const fits = () => room.getBoundingClientRect().bottom <= innerHeight - 6;
  // The steps tighten the rows AND the space around them — a screen full of rows is not the place
  // for a forty-pixel header margin.
  for (const step of ["", "rm-dense", "rm-denser", "rm-tiny"]) {
    b.classList.remove("rm-dense", "rm-denser", "rm-tiny");
    if (step) b.classList.add(step);
    if (fits()) return;
  }
}
addEventListener("resize", () => { if (ASROOM || document.body.classList.contains("as-room")) fitRoom(); });

// The line the round turns on. Not a row — a rule with the next round's number sitting in it.
const roundBreak = n => `<li class="room-break"><span>Round ${n}</span></li>`;

// ── Whose turn it is, in the corner ────────────────────────
// A character's own painting, bottom left, while their turn is up: the table looks at the person
// whose turn it is instead of at a row of text. The picture is fetched by URL, once, and then the
// browser has it — the four-second poll carries a character id, never an image. It changes to the
// bloodied one from a tenth of their maximum hit points downwards.
let SPLASH_NOW = "";
function drawSplash(v, turn) {
  const box = el("splash"); if (!box) return;
  const on = v.inCombat && v.show?.splash !== false;
  const monster = on && turn?.kind === "npc";
  const sp = on && !monster ? turn?.splash : null;
  // A character with no uploaded splash falls back to the full painting behind their plate, so a
  // party that has plates has this working before anybody paints anything. A MONSTER has only the
  // picture it was added with, which is a 192px square — so it is framed as a bust rather than
  // stretched into a figure it was never going to fill, and when it is bloodied the frame is shown
  // in blood. With no picture at all it is a mark in the same frame, which reddens the same way.
  const want = monster
    ? `mon:${turn.id}:${turn.img ? "pic" : "mark"}:${turn.bloodied ? "hurt" : "whole"}`
    : !sp ? (on && turn?.full ? `plate:${turn.full}` : "")
    : `${sp.id}:${sp.bloodied && sp.hurt ? "hurt" : sp.normal ? "normal" : sp.hurt ? "hurt" : ""}`;
  // The picture is only rebuilt when it actually changes — rewriting the <img> every four seconds
  // would restart the fade and flicker on the wall. The numbers under it are redrawn whenever they
  // move, which is the whole point of having them there.
  if (want === SPLASH_NOW) {
    const plate = box.querySelector(".spl-stats");
    const html = splashStats(turn);
    if (plate && plate.outerHTML !== html) plate.outerHTML = html;
    // A monster carries its word instead of a plate, and that word moves without the picture doing.
    const word = box.querySelector(".spl-name span");
    if (monster && word && turn.hp?.word && word.textContent !== turn.hp.word)
      word.textContent = turn.hp.word;
    return;
  }
  SPLASH_NOW = want;
  // The order starts where the splash ends, so it has to know whether there is one. In a fight
  // there always is — a monster with no picture still gets its mark — so this only moves when the
  // fight starts and stops, never between turns.
  document.body.classList.toggle("spl-on", !!want);
  if (!want) { box.className = "room-splash"; box.innerHTML = ""; return; }
  // `API_BASE` because this page is served from `initiative/`: a bare "api/…" would ask the server
  // for `initiative/api/…`, which is nothing at all.
  const hurt = want.endsWith(":hurt") || want.endsWith("hurt");
  if (want.startsWith("mon:")) {
    box.className = `room-splash in mon${turn.bloodied ? " hurt" : ""}`;
    box.innerHTML = `
      <div class="mon-frame ${turn.img ? "" : "mark"}">
        ${turn.img ? `<img src="${escQ(imgSrc(turn.img))}" alt="">` : `<span>✦</span>`}
      </div>
      <div class="spl-name"><b>${esc(turn.name)}</b>${
        turn.hp?.word ? `<span>${esc(turn.hp.word)}</span>` : ""}</div>`;
    return;
  }
  // `API_BASE` because this page is served from `initiative/`: a bare "api/…" would ask the server
  // for `initiative/api/…`, which is nothing at all.
  const src = want.startsWith("plate:")
    ? imgSrc(want.slice(6))
    : `${API_BASE}api/characters/${want.split(":")[0]}/art/${want.split(":")[1]}`;
  box.className = "room-splash in" + (hurt ? " hurt" : "");
  box.innerHTML = `<img src="${escQ(src)}" alt="">
    <div class="spl-name"><b>${esc(turn.name)}</b>${turn.player ? `<span>${esc(turn.player)}</span>` : ""}</div>
    ${splashStats(turn)}`;
}

// ── The plate under the splash ─────────────────────────────
// Their own numbers, framed around the picture: what the table reads out loud every round anyway —
// hit points, the two numbers other people roll against, their scores, and what they can still
// cast. A PC's sheet is theirs and already says all of it; this only saves somebody asking.
const SCORE_ORDER = ["str", "dex", "con", "int", "wis", "cha"];
function splashStats(turn) {
  const s = turn.stats;
  if (!s) return "";
  const hp = turn.hp || {};
  const pct = hp.max ? Math.max(0, Math.min(100, Math.round((hp.hp / hp.max) * 100))) : 0;
  const slots = Object.entries(s.slots || {}).sort((a, b) => a[0] - b[0]);
  const roman = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"];
  return `<div class="spl-stats">
    ${hp.max != null ? `<div class="spl-hp">
      <div class="spl-bar ${pct >= 60 ? "" : pct >= 30 ? "mid" : "low"}"><i style="width:${pct}%"></i></div>
      <div class="spl-hpn"><b>${hp.hp}</b><s>/${hp.max}</s>${hp.temp ? `<em>+${hp.temp}</em>` : ""}</div>
    </div>` : ""}
    <div class="spl-line">
      ${s.ac != null ? `<span><b>${s.ac}</b>AC</span>` : ""}
      ${s.dc != null ? `<span><b>${s.dc}</b>DC</span>` : ""}
      ${s.speed ? `<span><b>${s.speed}</b>SPD</span>` : ""}
      ${s.pp ? `<span><b>${s.pp}</b>PP</span>` : ""}
      ${s.level ? `<span><b>${s.level}</b>LV</span>` : ""}
    </div>
    <div class="spl-abil">${SCORE_ORDER.filter(k => s.abilities?.[k]).map(k => `
      <div><i>${k.toUpperCase()}</i><b>${sign(s.abilities[k].mod)}</b><s>${s.abilities[k].score}</s></div>`).join("")}</div>
    ${slots.length ? `<div class="spl-slots">
      ${slots.map(([lv, k]) => `<div><i>${roman[lv] || lv}</i>${
        // Pips while they can be counted at six feet; a fraction once there are too many.
        k.max > 6 ? `<b>${k.max - k.used}/${k.max}</b>`
          : `<u>${"●".repeat(Math.max(0, k.max - k.used))}${"○".repeat(Math.min(k.max, k.used))}</u>`}</div>`).join("")}
    </div>` : ""}
    ${[s.inspiration ? `${s.inspiration} Inspiration` : "",
       turn.wounds ? `${turn.wounds} Wound${turn.wounds > 1 ? "s" : ""}` : "",
       s.exhaustion ? `Exhaustion ${s.exhaustion}` : "",
       s.dreamExhaustion ? `${esc(s.dreamExhaustionName || "Dream")} ${s.dreamExhaustion}` : ""]
      .filter(Boolean).map(t => `<span class="spl-tag">${t}</span>`).join("")}
  </div>`;
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
  if (d.emotions?.length) EMOTIONS = d.emotions;
  if (d.grades?.length) GRADES = d.grades;
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
    EMOTIONS = d.emotions || []; GRADES = d.grades || [];
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
