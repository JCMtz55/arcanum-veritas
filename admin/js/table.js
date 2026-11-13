// Ephemer — Admin · THE TABLE
//
// Every character at a glance, while you run the session — and every number on them changeable from
// the same place you read it.
//
// ── WHY THIS IS A LIST OF ROWS AND NOT A GRID OF CARDS ──────────────────
// It was a grid of 272px cards: eight little squares, each a column of its own, which meant eight
// of everything to find. A card is the right shape for a thing you pick ONE of. A party is a thing
// you SCAN — "who is bloodied", "who still has Fate", "who is carrying a Wound" — and scanning is
// reading down one column, which a grid cannot give you at any width.
//
// So: one row per character, the same fields in the same place on every row, and the portrait a
// strip down the left so the eye finds the person before it reads the numbers. A row at rest shows
// what a DM asks for mid-combat and nothing else. Clicking it opens everything else UNDER it —
// where the stats are not merely shown but set, which is the other half of why this exists.
//
// ── WHAT THE DM MAY NOW SET FROM HERE ───────────────────────────────────
// Hit points, temporary hit points, conditions, Wounds, Injuries, both Exhaustions, the Honor and
// Morality sub-scores, Inspiration dice, and a named effect — beside the Level, Dream and Fate that
// were always here. The first group lives in the sheet JSON rather than in a column the DM owns, so
// it goes through one narrow server route that whitelists exactly those keys and logs every change:
// see "What the DM may set ON THE SHEET" in server.js. Nothing here writes a sheet directly.
//
// It polls while it is open, and only while it is open — enter() and leave() are the whole reason
// the router has them.

const PARTY = {
  cards: [], timer: null, at: null, err: null, busy: null, note: "",
  open: new Set(),     // which rows are expanded — survives every redraw, including a poll's
  amt: {},             // the damage/heal amount typed on each row, likewise
};
const PARTY_EVERY = 4000;

onData(d => { PARTY.cards = d.party || []; });

section("table", {
  mark: "❖", label: "Table", title: "Every character, live — while you are running a session",
  count: () => PARTY.cards.length,
  rail: () => null,
  body: () => renderTable(),
  enter: () => startPartyPolling(),
  leave: () => stopPartyPolling(),
});

// ── The engine's own vocabulary ─────────────────────────────
// The four conditions this campaign rewrote, the Inspiration dice, the modifier targets and the
// durations a benefit may have. All of it is defined in sheet/js/rules.js and sheet/js/targets.js,
// which this page cannot import — it is plain scripts — so it is asked for ONCE, the first time a
// row is opened, and the list the board hands out is the list the sheet can read back.
const VOCAB = { ready: false, loading: null, conditions: [], dice: [], targets: [], rounds: [] };
function ensureVocab() {
  if (VOCAB.ready || VOCAB.loading) return VOCAB.loading;
  VOCAB.loading = api("GET", "api/mod-targets").then(d => {
    VOCAB.conditions = d.conditions || [];
    VOCAB.dice = d.inspirationDice || ["d4", "d6", "d8", "d10", "d12", "d20"];
    VOCAB.targets = d.targets || [];
    VOCAB.rounds = d.rounds || [1, 2, 3, 10, 100];
    VOCAB.ready = true;
    if (UI.sec === "table") drawParty(); else drawBody();
  }).catch(() => { VOCAB.loading = null; });
  return VOCAB.loading;
}

async function loadParty() {
  try {
    PARTY.cards = (await api("GET", "api/characters/party")).party;
    PARTY.at = new Date(); PARTY.err = null;
  } catch (err) {
    PARTY.err = err.message;        // keep the last good rows on screen rather than blanking it
  }
  if (UI.sec !== "table") return;
  drawSecs();                       // the tab's count, if a character has appeared or left
  drawParty();
}

// A redraw replaces the whole board, so anything the DM is in the middle of typing has to survive
// it — and if the caret is actually in a field, the redraw waits rather than interrupting. There
// are a dozen fields on an open row now, so this asks where the caret IS rather than naming them.
function drawParty() {
  const note = document.getElementById("ptyNote");
  if (note) PARTY.note = note.value;
  const a = document.activeElement;
  if (a && a.closest?.("#adminBody") && a.matches?.("input, select, textarea")) return;
  drawBody();
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

// ═══════════════════════════════════════════════════════════
//  THE BOARD
// ═══════════════════════════════════════════════════════════
function renderTable() {
  const cards = PARTY.cards;
  const when = PARTY.at ? PARTY.at.toLocaleTimeString() : "—";
  const anyOpen = cards.some(c => PARTY.open.has(c.id));

  let h = `<div class="cdx wide"><div class="cdx-hd"><div><h1>The table</h1>
      <p class="cdx-desc">Every character as it stands right now, refreshed every few seconds.
        Open a row to set anything on it — hit points and conditions, the Wounds and both
        Exhaustions, the axes, Inspiration, Level, Dream and Fate.</p></div></div>

    <div class="cdx-sec">
      <div class="ptr-head">
        <input class="search" id="ptyNote" maxlength="200" value="${escQ(PARTY.note || "")}"
          placeholder="Why — recorded with the next change you make" aria-label="Reason for the next change">
        <button class="mini" onclick="partyOpenAll(${anyOpen ? "false" : "true"})">${anyOpen ? "Close all" : "Open all"}</button>
        <button class="mini" onclick="loadParty()">Refresh</button>
      </div>
      <p class="cdx-rings">Read at ${esc(when)}${PARTY.err ? ` · <strong class="hot">${esc(PARTY.err)}</strong>` : ""}</p>`;

  if (!cards.length) {
    h += `<div class="cdx-note"><p>No characters yet. A player makes their own from the Character Sheet
      — you grant the level, the Dream score and any Fate once it exists.</p></div></div></div>`;
    return h;
  }

  h += `<div class="ptr-list">` + cards.map(partyRowHtml).join("") + `</div></div></div>`;
  return h;
}

// A portrait where the player chose one, their initials where they did not — never an empty hole,
// which is the same bargain the sheet makes.
const initials = n => String(n || "?").split(/\s+/).filter(Boolean).slice(0, 2)
  .map(w => w[0].toUpperCase()).join("");

// A stored portrait path is a player's data, so it is encoded before it goes inside a url() inside
// an attribute — one apostrophe in it would otherwise end the url and the attribute early.
const urlAttr = u => escQ(encodeURI(String(u || "")).replace(/'/g, "%27"));

// Opened by id rather than by passing the path through an inline handler: a number cannot carry a
// quote, and the row already holds everything the lightbox needs. `portraitArt` is the full plate;
// a portrait with no full version opens the crop itself rather than nothing.
function partyArt(id) {
  const c = PARTY.cards.find(x => x.id === id);
  if (!c?.portrait) return;
  lightbox(`../sheet/${c.portraitArt || c.portrait}`, c.name);
}

const card = id => PARTY.cards.find(x => x.id === id);

function partyToggle(id) {
  if (PARTY.open.has(id)) PARTY.open.delete(id);
  else { PARTY.open.add(id); ensureVocab(); }
  drawBody();
}
function partyOpenAll(open) {
  PARTY.open = open ? new Set(PARTY.cards.map(c => c.id)) : new Set();
  if (open) ensureVocab();
  drawBody();
}

// ── One row ────────────────────────────────────────────────
function partyRowHtml(c) {
  const max = Math.max(1, c.maxHp);
  const pct = Math.max(0, Math.min(100, Math.round((c.hp / max) * 100)));
  // Three bands, because the only thing a DM needs from a bar across the room is "is this one about
  // to go down": bloodied at half, critical at a quarter.
  const band = c.hp <= 0 ? "out" : pct <= 25 ? "crit" : pct <= 50 ? "low" : "ok";
  const open = PARTY.open.has(c.id);
  const num = (label, v, title) =>
    `<span class="ptr-n" title="${escQ(title)}"><i>${label}</i><b>${v}</b></span>`;

  return `<article class="ptr ${band}${open ? " open" : ""}${PARTY.busy === c.id ? " busy" : ""}">
    ${c.portrait
      ? `<button class="ptr-por" onclick="partyArt(${c.id})" title="See ${escQ(c.name)}'s plate whole"
           style="background-image:url('../sheet/${urlAttr(c.portrait)}')"
           aria-label="See ${escQ(c.name)}'s plate whole"></button>`
      : `<span class="ptr-por none" aria-hidden="true">${esc(initials(c.name))}</span>`}

    <div class="ptr-body">
      <div class="ptr-line ptr-who">
        <b class="ptr-name">${esc(c.name)}</b>
        ${c.userId && UI.sec === "table"
          ? `<button class="ptr-player as-link" onclick="go('players',${c.userId},'character')"
               title="Open ${escQ(c.player)} — their grants, their Grimm and their Servants">${esc(c.player)}</button>`
          : `<span class="ptr-player">${esc(c.player)}</span>`}
        <span class="ptr-lv">Lv ${c.level}${c.pendingLevel ? ` <u>&rarr; ${c.pendingLevel}</u>` : ""}</span>
        ${(c.classes || []).map(x =>
          `<span class="chip">${esc(x.name)} ${x.level}${x.subclass ? ` &middot; ${esc(x.subclass)}` : ""}</span>`).join("")}
        <span class="ptr-gap"></span>
        ${partyFlags(c)}
        <button class="ptr-x" onclick="partyToggle(${c.id})" aria-expanded="${open}"
          title="${open ? "Close" : "Open"} ${escQ(c.name)} — every stat, and the controls for them"
          aria-label="${open ? "Close" : "Open"} ${escQ(c.name)}">${open ? "▴" : "▾"}</button>
      </div>

      <div class="ptr-line ptr-stats">
        <div class="ptr-hp">
          <div class="ptr-bar"><i style="width:${pct}%"></i></div>
          <span class="ptr-hpn">${c.hp}<em>/${c.maxHp}</em>${c.tempHp ? `<u>+${c.tempHp}</u>` : ""}</span>
          <span class="ptr-quick" title="Damage or heal ${escQ(c.name)} by this much">
            <input class="search tiny" type="number" min="0" max="999" value="${escQ(PARTY.amt[c.id] || "")}"
              id="ptyAmt${c.id}" placeholder="0" aria-label="Amount to damage or heal ${escQ(c.name)} by"
              oninput="PARTY.amt[${c.id}]=this.value"
              onkeydown="if(event.key==='Enter')partyHeal(${c.id},-1)">
            <button class="ptr-dmg" onclick="partyHeal(${c.id},-1)" title="Take that much off — temporary hit points first">&minus;</button>
            <button class="ptr-hl" onclick="partyHeal(${c.id},1)" title="Heal that much, never past the maximum">+</button>
          </span>
        </div>
        <div class="ptr-nums">
          ${num("AC", c.ac, "Armour Class, with any named modifiers")}
          ${num("INIT", sign(c.initiative), "Initiative")}
          ${num("SPD", c.speed, "Speed in feet")}
          ${num("PP", c.passivePerception, "Passive Perception")}
          ${num("DC", c.saveDc, `Verum DC — 8 + PB + highest ability + Dream (${sign(c.dreamMod)})`)}
          ${num("ATK", sign(c.spellAttack), "Seal attack bonus — PB + Verum modifier")}
          ${num("DEATH", c.deathSaveDC, `Death save DC — 10 + ${c.wounds} Wounds + ${c.unhealedInjuries} unhealed Injuries`)}
          ${num("CONC", c.concentrationFloor, "Concentration DC floor — rises with half the damage taken")}
        </div>
      </div>

      <div class="ptr-line ptr-tags">${partyTags(c)}</div>
    </div>

    ${open ? partyPanels(c) : ""}
  </article>`;
}

// The right-hand end of the identity line: only what is WAITING on somebody. A row with nothing
// outstanding shows nothing here, which is what makes the ones that do show something readable.
function partyFlags(c) {
  const bits = [];
  if (c.pendingLevel) bits.push(`<span class="ptr-wait" title="Allowed, and waiting for the player to take it">Lv ${c.pendingLevel} waiting</span>`);
  if (c.unspent.honor) bits.push(`<span class="ptr-wait">${c.unspent.honor} Honor</span>`);
  if (c.unspent.morality) bits.push(`<span class="ptr-wait">${c.unspent.morality} Morality</span>`);
  const other = (c.openUnlocks || 0) - (c.pendingLevel ? 1 : 0);
  if (other > 0) bits.push(`<span class="ptr-wait" title="Ability score improvements and feats you have opened and they have not spent">${other} unspent</span>`);
  return bits.join("");
}

// The tracks, the conditions and what is running on them — one line of chips, hot only when the
// number is not zero. This is the line a DM reads to answer "why is their death save a 14".
function partyTags(c) {
  const t = (label, value, hot, title, tail = "") =>
    `<span class="ptr-t${hot ? " hot" : ""}" title="${escQ(title)}"><i>${label}</i><b>${value}</b>${tail}</span>`;
  const bits = [
    t("Wounds", c.wounds, c.wounds, "Each Wound and unhealed Injury adds +1 to the death save and the concentration floor",
      c.wounds >= 6 ? `<u>Injury due</u>` : ""),
    t("Injuries", c.unhealedInjuries, c.unhealedInjuries, `${c.injuries} recorded, ${c.unhealedInjuries} unhealed`),
    t("Exh", `${c.exhaustion}<em>/6</em>`, c.exhaustion, "Standard physical Exhaustion"),
    t("Dream exh", `${c.dreamExhaustion}<em>/8</em>`, c.dreamExhaustion,
      `${c.dreamExhaustionName} — ${c.dreamPenalty} to d20 rolls in a dream`,
      c.dreamPenalty ? `<u>${c.dreamPenalty}</u>` : ""),
    t("Fate", c.fate, false, "Fate charges in hand — the player spends these themselves"),
    t("Dream", c.dream, false, `Dream score — modifier ${sign(c.dreamMod)}`),
  ];
  if (c.inCombat) bits.push(t("Round", c.round, true, "The player's own round tracker"));
  if (c.activeModifiers) bits.push(t("Effects", c.activeModifiers, false, "Named modifiers currently running on this sheet"));

  const chips = (c.conditions || []).map(x =>
    `<span class="chip on">${esc(typeof x === "string" ? x : x.name || "")}</span>`).join("");
  const insp = (c.inspiration || []).map(d =>
    `<span class="chip roll" title="${escQ(d.why || "Inspiration")}">${esc(d.die)}</span>`).join("");
  const fx = (c.effects || []).map(e =>
    `<span class="chip held" title="${escQ(`${e.says}${e.rounds ? ` · ${e.rounds} rounds` : ""} — from ${e.fromDm ? "the DM" : e.player}`)}">${esc(e.label)}</span>`).join("");

  return bits.join("") + chips + insp + fx;
}

// ═══════════════════════════════════════════════════════════
//  THE OPEN ROW
// ═══════════════════════════════════════════════════════════
// Seven panels, each one topic, each one the DM's to write. Laid out as cards inside the row rather
// than as a second page: the thing you are changing stays in sight of the numbers it changes.
function partyPanels(c) {
  return `<div class="ptr-more">
    ${panelVitals(c)}
    ${panelTracks(c)}
    ${panelAdvance(c)}
    ${panelAxes(c)}
    ${panelInspiration(c)}
    ${panelEffects(c)}
    ${panelNumbers(c)}
  </div>`;
}

const pTitle = (name, hint) =>
  `<h3>${esc(name)}${hint ? ` <i>${esc(hint)}</i>` : ""}</h3>`;

// ── Hit points and conditions ──────────────────────────────
function panelVitals(c) {
  const known = VOCAB.conditions.map(k => {
    const on = (c.conditions || []).some(x => (typeof x === "string" ? x : x.id) === k.id);
    return `<button class="chip${on ? " on" : ""}" onclick="partyCondToggle(${c.id},'${escAttr(k.id)}')"
      title="${escQ(k.note || k.name)}">${esc(k.name)}</button>`;
  }).join("");
  const held = (c.conditions || []).map((x, i) => {
    const name = typeof x === "string" ? x : x.name || "";
    return `<button class="chip on" onclick="partyCondDrop(${c.id},${i})"
      title="Take ${escQ(name)} off">${esc(name)} ×</button>`;
  }).join("");

  return `<section class="ptr-p">
    ${pTitle("Hit points", `maximum ${c.maxHp}`)}
    <div class="ptr-ctl">
      <span class="pair"><span class="lbl">Current</span><div class="step">
        <input class="stepv" type="number" min="0" max="${c.maxHp}" value="${c.hp}" id="ptyHp${c.id}"
          aria-label="Hit points for ${escQ(c.name)}"
          onkeydown="if(event.key==='Enter')this.blur();if(event.key==='Escape')partyRevert(${c.id},'hp',this)"
          onchange="partyVital(${c.id},'hp',this.value)"></div></span>
      <span class="pair"><span class="lbl">Temp</span><div class="step">
        <input class="stepv" type="number" min="0" max="999" value="${c.tempHp || 0}" id="ptyTempHp${c.id}"
          title="Temporary hit points REPLACE rather than stack (CS-030)"
          aria-label="Temporary hit points for ${escQ(c.name)}"
          onkeydown="if(event.key==='Enter')this.blur();if(event.key==='Escape')partyRevert(${c.id},'tempHp',this)"
          onchange="partyVital(${c.id},'tempHp',this.value)"></div></span>
      <button class="mini" onclick="partyVital(${c.id},'hp',${c.maxHp})" title="Back to full">Full</button>
      <button class="mini" onclick="partyDown(${c.id})" title="Straight to 0 — the player still rolls their own death saves">Drop to 0</button>
    </div>
    ${pTitle("Conditions", "only the four this campaign rewrote are listed")}
    <div class="chips ptr-chips">${known || `<span class="ptr-none">asking the engine…</span>`}
      <button class="chip" onclick="partyCondAdd(${c.id})" title="Any other condition, by name">+ other</button></div>
    ${held ? `<div class="chips ptr-chips">${held}</div>` : `<p class="ptr-none">Nothing on them.</p>`}
  </section>`;
}

// ── Wounds, Injuries, Exhaustion ───────────────────────────
function panelTracks(c) {
  const step = (label, field, value, lo, hi, title) =>
    `<span class="pair"><span class="lbl" title="${escQ(title)}">${label}</span><div class="step">
      <button onclick="partyVital(${c.id},'${field}',${Math.max(lo, value - 1)})" aria-label="Lower ${label}" ${value <= lo ? "disabled" : ""}>–</button>
      <span>${value}</span>
      <button onclick="partyVital(${c.id},'${field}',${Math.min(hi, value + 1)})" aria-label="Raise ${label}" ${value >= hi ? "disabled" : ""}>+</button>
    </div></span>`;

  const list = (c.injuryList || []).map((i, n) => `<li class="ptr-inj${i.healed ? " healed" : ""}">
      <button class="mini" onclick="partyInjHeal(${c.id},${n},${!i.healed})"
        title="${i.healed ? "Mark it unhealed again" : "Mark it healed — it stops adding to the DCs"}">${i.healed ? "healed" : "heal"}</button>
      <span>${esc(i.name)}${i.why ? ` <i>${esc(i.why)}</i>` : ""}</span>
      <button class="mini" onclick="partyInjDrop(${c.id},${n})" title="Strike it from the sheet">×</button>
    </li>`).join("");

  return `<section class="ptr-p">
    ${pTitle("Tracks", `death save ${c.deathSaveDC} · concentration floor ${c.concentrationFloor}`)}
    <div class="ptr-ctl">
      ${step("Wounds", "wounds", c.wounds, 0, 20, "Each one adds +1 to the death save DC and the concentration floor. Six is an Injury due.")}
      ${step("Exhaustion", "exhaustion", c.exhaustion, 0, 6, "Standard physical Exhaustion")}
      ${step("Dream exh", "dreamExhaustion", c.dreamExhaustion, 0, 8, c.dreamExhaustionName)}
    </div>
    ${pTitle("Injuries", `${c.unhealedInjuries} of ${c.injuries} unhealed`)}
    ${list ? `<ul class="ptr-injs">${list}</ul>` : `<p class="ptr-none">None recorded.</p>`}
    <div class="ptr-ctl"><button class="mini" onclick="partyInjAdd(${c.id})">+ Injury</button></div>
  </section>`;
}

// ── Level, Dream, Fate, the unlocks ────────────────────────
// The same calls the old card's footer made, in the same order, because they are the same endpoints:
// a level allowed from here and a level allowed from a player's page must not be two code paths.
function panelAdvance(c) {
  return `<section class="ptr-p">
    ${pTitle("Advancement", c.pendingLevel ? `level ${c.pendingLevel} allowed, not yet taken` : "")}
    <div class="ptr-ctl">
      ${c.pendingLevel
        ? `<span class="ptr-wait" title="Allowed, and waiting for the player to take it">Level ${c.pendingLevel} waiting</span>`
        : `<button class="mini go" onclick="partyAllowLevel(${c.id})"
             title="Clear this character for level ${c.level + 1}. Their sheet grows a LEVEL UP button; the level rises when they press it."
             ${c.level >= 20 ? "disabled" : ""}>Allow Lv ${Math.min(20, c.level + 1)}</button>`}
      <span class="pair"><span class="lbl">Level</span><div class="step">
        <button onclick="partyBump(${c.id},'level',-1)" aria-label="Lower level">–</button><span>${c.level}</span>
        <button onclick="partyBump(${c.id},'level',1)" aria-label="Raise level">+</button></div></span>
      <span class="pair"><span class="lbl">Dream</span><div class="step">
        <button onclick="partyBump(${c.id},'dream',-1)" aria-label="Lower Dream">–</button>
        <input class="stepv" type="number" min="0" max="40" value="${c.dream}" id="ptyDream${c.id}"
          title="Type a Dream score and press Enter — and name the campaign event in the box at the top, because the server asks for one"
          aria-label="Dream score for ${escQ(c.name)}"
          onkeydown="if(event.key==='Enter')this.blur();if(event.key==='Escape')partyRevert(${c.id},'dream',this)"
          onchange="partySet(${c.id},'dream',this.value)">
        <button onclick="partyBump(${c.id},'dream',1)" aria-label="Raise Dream">+</button></div></span>
      <span class="pair"><span class="lbl">Fate</span><div class="step">
        <button onclick="partyBump(${c.id},'fate',-1)" aria-label="Take back a Fate use">–</button><span>${c.fate}</span>
        <button onclick="partyBump(${c.id},'fate',1)" aria-label="Grant a Fate use">+</button></div></span>
      <button class="mini" onclick="partyUnlock(${c.id},'asi')" title="Open an ability score improvement for this player to spend">+ ASI</button>
      <button class="mini" onclick="partyUnlock(${c.id},'feat')" title="Open a feat for this player to spend">+ Feat</button>
    </div>
  </section>`;
}

// ── Honor and Morality ─────────────────────────────────────
// Four independent sub-scores, and the modifier each side is worth is shown beside the number so
// the panel is not asking the DM to do the subtraction (HB-005, HB-006).
function panelAxes(c) {
  const axis = (label, key, value, mod, title) =>
    `<span class="pair"><span class="lbl" title="${escQ(title)}">${label}</span><div class="step">
      <input class="stepv" type="number" min="0" max="99" value="${value}" id="ptyAxis${key}${c.id}"
        aria-label="${escQ(label)} for ${escQ(c.name)}"
        onkeydown="if(event.key==='Enter')this.blur()"
        onchange="partyAxis(${c.id},'${key}',this.value)"></div>
      <span class="ptr-mod">${sign(mod)}</span></span>`;

  return `<section class="ptr-p">
    ${pTitle("Honor and Morality", `Honor ${c.honor.total} · Morality ${c.morality.total} · Corruption save ${sign(c.corruptionSave)}`)}
    <div class="ptr-ctl">
      ${axis("Order", "order", c.honor.order, c.honor.orderMod, "Worth this much on an Order-aligned roll")}
      ${axis("Chaos", "chaos", c.honor.chaos, c.honor.chaosMod, "Worth this much on a Chaos-aligned roll")}
      ${axis("Good", "good", c.morality.good, c.morality.goodMod, "Worth this much on a Good-aligned roll")}
      ${axis("Evil", "evil", c.morality.evil, c.morality.evilMod, "Worth this much on an Evil-aligned roll")}
    </div>
    <div class="ptr-ctl">
      <span class="pair"><span class="lbl" title="Points from a level this player has not allocated yet">Honor unspent</span><div class="step">
        <button onclick="partyAxis(${c.id},'honorUnspent',${Math.max(0, c.unspent.honor - 1)})" aria-label="One fewer unspent Honor" ${c.unspent.honor <= 0 ? "disabled" : ""}>–</button>
        <span>${c.unspent.honor}</span>
        <button onclick="partyAxis(${c.id},'honorUnspent',${c.unspent.honor + 1})" aria-label="One more unspent Honor">+</button></div></span>
      <span class="pair"><span class="lbl">Morality unspent</span><div class="step">
        <button onclick="partyAxis(${c.id},'moralityUnspent',${Math.max(0, c.unspent.morality - 1)})" aria-label="One fewer unspent Morality" ${c.unspent.morality <= 0 ? "disabled" : ""}>–</button>
        <span>${c.unspent.morality}</span>
        <button onclick="partyAxis(${c.id},'moralityUnspent',${c.unspent.morality + 1})" aria-label="One more unspent Morality">+</button></div></span>
    </div>
  </section>`;
}

// ── Inspiration ────────────────────────────────────────────
// A pool rather than one yes-or-no token: a d4 of Bless, a Bard's d8 and a DM's "have a d6 for
// that" are the same act at this table, so handing one over is one click per die size.
function panelInspiration(c) {
  const give = (VOCAB.dice.length ? VOCAB.dice : ["d4", "d6", "d8", "d10", "d12", "d20"]).map(d =>
    `<button class="chip roll" onclick="partyInspGrant(${c.id},'${escAttr(d)}')"
      title="Hand ${escQ(c.name)} a ${d} — theirs until they use it">+ ${esc(d)}</button>`).join("");
  const held = (c.inspiration || []).map((d, n) =>
    `<button class="chip on" onclick="partyInspDrop(${c.id},${n})"
      title="Take it back${d.why ? ` — ${escQ(d.why)}` : ""}">${esc(d.die)}${d.rounds ? ` · ${d.rounds}r` : ""} ×</button>`).join("");

  return `<section class="ptr-p">
    ${pTitle("Inspiration", "a die until it is used")}
    <div class="chips ptr-chips">${give}</div>
    ${held ? `<div class="chips ptr-chips">${held}</div>` : `<p class="ptr-none">Holding none.</p>`}
  </section>`;
}

// ── What is running on them ────────────────────────────────
// The same rows a player's seal makes, through the same contract — and the DM's own grant is one of
// them, with no caster behind it. An ongoing bonus is never written into the sheet, which is why it
// can be taken off again by one row going quiet.
function panelEffects(c) {
  const list = (c.effects || []).map(e => `<li class="ptr-fx">
      <b>${esc(e.label)}</b><span>${esc(e.says)}</span>
      <i>${e.fromDm ? "from you" : `from ${esc(e.player || "somebody")}`}${e.rounds ? ` · ${e.rounds} rounds` : ""}</i>
      ${e.id ? `<button class="mini" onclick="partyEffectEnd(${c.id},${e.id})" title="End it now">×</button>` : ""}
    </li>`).join("");

  const opts = VOCAB.targets.map(t =>
    `<option value="${escQ(t.value)}">${esc(t.label)}</option>`).join("");
  const rounds = `<option value="">while it lasts</option>` + VOCAB.rounds.map(n =>
    `<option value="${n}">${n} round${n === 1 ? "" : "s"}</option>`).join("");

  return `<section class="ptr-p wide">
    ${pTitle("Running on them", c.granted ? `${c.granted} granted` : "")}
    ${list ? `<ul class="ptr-fxs">${list}</ul>` : `<p class="ptr-none">Nothing granted.</p>`}
    <div class="ptr-ctl">
      <input class="search" id="ptyFxLabel${c.id}" maxlength="60" placeholder="What it is called"
        aria-label="Name of the effect to grant ${escQ(c.name)}">
      <select class="search" id="ptyFxTarget${c.id}" aria-label="What it changes">${opts}</select>
      <span class="pair"><span class="lbl">By</span><div class="step">
        <input class="stepv" type="number" min="-30" max="30" value="1" id="ptyFxAmt${c.id}" aria-label="By how much"></div></span>
      <select class="search" id="ptyFxRounds${c.id}" aria-label="For how long">${rounds}</select>
      <button class="mini go" onclick="partyEffectGrant(${c.id})">Grant</button>
    </div>
  </section>`;
}

// ── The numbers themselves ─────────────────────────────────
// Read-only, and the only read-only panel here: these come out of the sheet's own engine, so the
// board can show them but the DM does not set an ability score from the table — that is the
// player's authorship, and it is the line this page does not cross.
function panelNumbers(c) {
  const ABIL = { str: "STR", dex: "DEX", con: "CON", int: "INT", wis: "WIS", cha: "CHA", dream: "DREAM" };
  const cols = Object.entries(ABIL).map(([id, label]) => {
    const a = c.abilities?.[id] || { score: 0, mod: 0, save: 0 };
    return `<div class="ptr-ab"><i>${label}</i><b>${a.score}</b><u>${sign(a.mod)}</u>
      <span class="${a.proficient ? "prof" : ""}" title="Saving throw${a.proficient ? " — proficient" : ""}">${sign(a.save)}</span></div>`;
  }).join("");

  return `<section class="ptr-p wide">
    ${pTitle("Numbers", `proficiency ${sign(c.prof)} · hit dice ${c.hitDice.pool || "—"}${c.hitDice.total ? ` · ${c.hitDice.left} of ${c.hitDice.total} left` : ""}`)}
    <div class="ptr-abs">${cols}</div>
    <p class="cdx-rings">Score · modifier · save. Every figure computed by the server from the sheet's
      own rules, so this and their sheet cannot disagree. Last saved ${esc(partyWhen(c.updatedAt))}.</p>
  </section>`;
}

function partyWhen(at) {
  if (!at) return "—";
  const d = new Date(at);
  return Number.isNaN(+d) ? "—" : d.toLocaleString();
}

// ═══════════════════════════════════════════════════════════
//  THE WRITES
// ═══════════════════════════════════════════════════════════
// One shape for all of them: mark the row busy, make the call, carry the note, say what happened,
// read the board back. Every one of these is a DM-only endpoint that logs the change with a
// before/after — nothing on this page edits a sheet behind the server's back.
async function partyWrite(id, run, said) {
  const c = card(id);
  if (!c) return;
  PARTY.busy = id;
  try {
    const out = await run(c);
    clearPartyNote();
    toast(typeof said === "function" ? said(c, out) : said);
  } catch (err) { toast(err.message); }
  PARTY.busy = null;
  await afterPartyWrite();
}

// Clearing a character for the next level WITHOUT taking it for them. The player's sheet grows a
// LEVEL UP button, and pressing it is what moves the level — so the features, the subclass and the
// ability score improvement are settled in the same breath as the number instead of a sheet sitting
// at a level nobody has filled in. The stepper beside it is still there for a correction or a rollback.
const partyAllowLevel = id => partyWrite(id,
  c => api("POST", `api/characters/${c.id}/level/allow`, { note: partyNote() }),
  (c, out) => `${c.name} may take level ${out.targetLevel}.`);

const partyUnlock = (id, kind) => partyWrite(id,
  c => api("POST", `api/characters/${c.id}/unlocks`, { kind, note: partyNote() }),
  c => `${c.name} may now choose ${kind === "asi" ? "an ability score improvement" : "a feat"}.`);

// ── The DM's own columns ───────────────────────────────────
const PARTY_LIMITS = { level: [1, 20], dream: [0, 40], fate: [0, 99] };
const PARTY_FIELD = { level: "Level", dream: "Dream", fate: "Fate" };

// A nudge is just a set with the arithmetic done here, so there is one write path and one set of
// guards however the number was changed.
function partyBump(id, field, by) {
  const c = card(id);
  if (c) partySet(id, field, c[field] + by);
}
// Putting a number back after a refused or abandoned edit, without waiting for the next poll. It
// reads the field off the row by name, so it serves the columns and the vitals alike.
function partyRevert(id, field, el) {
  const c = card(id);
  if (c && el) { el.value = c[field] ?? 0; el.blur(); }
}

// ⭐ Dream is TYPED rather than stepped. It does not creep: it moves when the DM records a campaign
// event, and the table is at 24 — twenty-four presses of a + button to set up a character is not a
// control, it is a punishment. The arrows stay for the odd correction.
async function partySet(id, field, value) {
  const c = card(id);
  if (!c) return;
  const el = document.getElementById(`pty${PARTY_FIELD[field]}${id}`);
  const next = Math.round(Number(value));
  const [lo, hi] = PARTY_LIMITS[field];
  // An emptied or nonsense box is an abandoned edit, not a change to zero.
  if (!Number.isFinite(next)) return partyRevert(id, field, el);
  if (next === c[field]) return partyRevert(id, field, el);
  if (next < lo || next > hi) {
    toast(`${PARTY_FIELD[field]} is ${lo} to ${hi}.`);
    return partyRevert(id, field, el);
  }
  // Lowering a level is a rollback, and it takes features away — say so before it happens.
  if (field === "level" && next < c[field] &&
      !confirm(`Take ${c.name} back to level ${next}? Allocations already spent are not returned.`)) return;

  if (el) el.blur();                  // so the redraw below is not held off by its own caret
  await partyWrite(id, () => api("PUT", `api/characters/${id}/${field}`, { [field]: next, note: partyNote() }),
    (ch, out) => out?.allocations?.levels
      ? `${ch.name} — level ${next}, ${out.allocations.honor} Honor and ${out.allocations.morality} Morality to allocate`
      : `${ch.name} — ${field} ${next}`);
}

// ── The sheet's own numbers ────────────────────────────────
// One route, one whitelist, one event per change: see server.js. Everything below funnels into it,
// so there is exactly one place a hit point can be written from this page.
const VITAL_LIMITS = {
  hp: [0, null], tempHp: [0, 999], wounds: [0, 20], exhaustion: [0, 6], dreamExhaustion: [0, 8],
};
const VITAL_FIELD = {
  hp: "Hit points", tempHp: "Temporary hit points", wounds: "Wounds",
  exhaustion: "Exhaustion", dreamExhaustion: "Dream Exhaustion",
};
// Only two of them are typed into; the rest are steppers with no box to put a number back into.
// Looked up through this rather than by building an id, because `""+id` would be getElementById("3")
// and find whatever else on the page happens to be called that.
const VITAL_BOX = { hp: "ptyHp", tempHp: "ptyTempHp" };

function partyVital(id, field, value) {
  const c = card(id);
  if (!c) return;
  const el = VITAL_BOX[field] ? document.getElementById(`${VITAL_BOX[field]}${id}`) : null;
  const next = Math.round(Number(value));
  const [lo, hi] = VITAL_LIMITS[field];
  const top = hi == null ? Math.max(1, c.maxHp) : hi;
  if (!Number.isFinite(next)) return partyRevert(id, field, el);
  if (next === (c[field] || 0)) return partyRevert(id, field, el);
  if (next < lo || next > top) {
    toast(`${VITAL_FIELD[field]} is ${lo} to ${top}.`);
    return partyRevert(id, field, el);
  }
  if (el) el.blur();
  return partyWrite(id, () => api("PUT", `api/characters/${id}/vitals`,
    { vitals: { [field]: next }, note: partyNote() }),
    ch => `${ch.name} — ${VITAL_FIELD[field].toLowerCase()} ${next}`);
}

// Damage and healing, by the amount typed on the row. Damage eats temporary hit points first and
// healing never passes the maximum, which is the engine's own arithmetic (CS-030) — done here
// because the route sets values rather than applying events, and the DM is the one holding the roll.
function partyHeal(id, way) {
  const c = card(id);
  if (!c) return;
  const box = document.getElementById(`ptyAmt${id}`);
  const n = Math.abs(Math.round(Number(box?.value ?? PARTY.amt[id])));
  if (!Number.isFinite(n) || n <= 0) return toast("Type how much first.");

  const vitals = {};
  if (way > 0) {
    vitals.hp = Math.min(Math.max(1, c.maxHp), (c.hp || 0) + n);
  } else {
    const absorbed = Math.min(c.tempHp || 0, n);
    if (absorbed) vitals.tempHp = (c.tempHp || 0) - absorbed;
    vitals.hp = Math.max(0, (c.hp || 0) - (n - absorbed));
  }
  if (box) { box.value = ""; box.blur(); }
  PARTY.amt[id] = "";
  return partyWrite(id, () => api("PUT", `api/characters/${id}/vitals`, { vitals, note: partyNote() }),
    ch => way > 0 ? `${ch.name} healed ${n} — ${vitals.hp}/${ch.maxHp}`
                  : `${ch.name} took ${n} — ${vitals.hp}/${ch.maxHp}`);
}

function partyDown(id) {
  const c = card(id);
  if (!c || !confirm(`Put ${c.name} at 0 hit points? They roll their own death saves from there.`)) return;
  return partyWrite(id, () => api("PUT", `api/characters/${id}/vitals`,
    { vitals: { hp: 0, tempHp: 0 }, note: partyNote() }), ch => `${ch.name} is down.`);
}

// ── Conditions ─────────────────────────────────────────────
// The whole list travels on every change, because that is the shape the sheet stores and the route
// takes: a list, cleaned, replacing the old one. Nothing here merges server-side.
const condList = c => (c.conditions || []).map(x => typeof x === "string" ? { id: "", name: x } : x);

function partyCondToggle(id, condId) {
  const c = card(id);
  if (!c) return;
  const known = VOCAB.conditions.find(k => k.id === condId);
  if (!known) return;
  const held = condList(c);
  const on = held.some(x => x.id === condId);
  const next = on ? held.filter(x => x.id !== condId) : [...held, { id: known.id, name: known.name }];
  return partyWrite(id, () => api("PUT", `api/characters/${id}/vitals`,
    { vitals: { conditions: next }, note: partyNote() }),
    ch => `${ch.name} — ${known.name} ${on ? "off" : "on"}`);
}

function partyCondAdd(id) {
  const c = card(id);
  if (!c) return;
  const name = (prompt(`What condition is on ${c.name}?`) || "").trim();
  if (!name) return;
  return partyWrite(id, () => api("PUT", `api/characters/${id}/vitals`,
    { vitals: { conditions: [...condList(c), { id: "", name: name.slice(0, 40) }] }, note: partyNote() }),
    ch => `${ch.name} — ${name} on`);
}

function partyCondDrop(id, index) {
  const c = card(id);
  if (!c) return;
  const held = condList(c);
  const gone = held[index];
  if (!gone) return;
  return partyWrite(id, () => api("PUT", `api/characters/${id}/vitals`,
    { vitals: { conditions: held.filter((_, i) => i !== index) }, note: partyNote() }),
    ch => `${ch.name} — ${gone.name} off`);
}

// ── Injuries ───────────────────────────────────────────────
// An Injury is a named thing that heals, not a counter: the DCs read the unhealed ones, so healing
// one and striking one off are different acts and both are here.
function partyInjAdd(id) {
  const c = card(id);
  if (!c) return;
  const name = (prompt(`What injury did ${c.name} take?`, "Injury") || "").trim();
  if (!name) return;
  const next = [...(c.injuryList || []), { name: name.slice(0, 80), healed: false }];
  return partyWrite(id, () => api("PUT", `api/characters/${id}/vitals`,
    { vitals: { injuries: next }, note: partyNote() }), ch => `${ch.name} — ${name} recorded`);
}

function partyInjHeal(id, index, healed) {
  const c = card(id);
  const list = c?.injuryList || [];
  if (!list[index]) return;
  const next = list.map((i, n) => n === index ? { ...i, healed } : i);
  return partyWrite(id, () => api("PUT", `api/characters/${id}/vitals`,
    { vitals: { injuries: next }, note: partyNote() }),
    ch => `${ch.name} — ${list[index].name} ${healed ? "healed" : "open again"}`);
}

function partyInjDrop(id, index) {
  const c = card(id);
  const list = c?.injuryList || [];
  if (!list[index] || !confirm(`Strike "${list[index].name}" from ${c.name}'s sheet?`)) return;
  return partyWrite(id, () => api("PUT", `api/characters/${id}/vitals`,
    { vitals: { injuries: list.filter((_, n) => n !== index) }, note: partyNote() }),
    ch => `${ch.name} — injury struck off`);
}

// ── Inspiration ────────────────────────────────────────────
function partyInspGrant(id, die) {
  const c = card(id);
  if (!c) return;
  const next = [...(c.inspiration || []), { die, why: partyNote() || "the DM's nod", rounds: null }];
  return partyWrite(id, () => api("PUT", `api/characters/${id}/vitals`,
    { vitals: { inspiration: next }, note: partyNote() }), ch => `${ch.name} holds a ${die}.`);
}

function partyInspDrop(id, index) {
  const c = card(id);
  const held = c?.inspiration || [];
  if (!held[index]) return;
  return partyWrite(id, () => api("PUT", `api/characters/${id}/vitals`,
    { vitals: { inspiration: held.filter((_, n) => n !== index) }, note: partyNote() }),
    ch => `${ch.name} — ${held[index].die} taken back`);
}

// ── Honor and Morality ─────────────────────────────────────
function partyAxis(id, key, value) {
  const c = card(id);
  if (!c) return;
  const el = document.getElementById(`ptyAxis${key}${id}`);
  const next = Math.round(Number(value));
  if (!Number.isFinite(next) || next < 0 || next > 99) {
    toast("An axis is 0 to 99.");
    if (el) el.value = c.honor[key] ?? c.morality[key] ?? 0;
    return;
  }
  if (el) el.blur();
  return partyWrite(id, () => api("PUT", `api/characters/${id}/axes`,
    { axes: { [key]: next }, note: partyNote() }), ch => `${ch.name} — ${key} ${next}`);
}

// ── An effect the DM grants ────────────────────────────────
function partyEffectGrant(id) {
  const c = card(id);
  if (!c) return;
  const label = (document.getElementById(`ptyFxLabel${id}`)?.value || "").trim();
  const target = document.getElementById(`ptyFxTarget${id}`)?.value || "";
  const amount = Math.round(Number(document.getElementById(`ptyFxAmt${id}`)?.value));
  const roundsRaw = document.getElementById(`ptyFxRounds${id}`)?.value || "";
  const rounds = roundsRaw ? Number(roundsRaw) : null;
  if (!label) return toast("Name it — that name is what their sheet shows.");
  if (!target) return toast("Say what it changes.");
  if (!Number.isFinite(amount) || amount === 0) return toast("By how much?");

  return partyWrite(id, () => api("POST", `api/characters/${id}/effects`, {
    label, note: partyNote(),
    benefits: [{ kind: "modifier", target, amount, rounds, note: partyNote() }],
  }), ch => `${label} is running on ${ch.name}.`);
}

function partyEffectEnd(id, effectId) {
  return partyWrite(id, () => api("DELETE", `api/effects/${effectId}`), ch => `Ended on ${ch.name}.`);
}

// These same controls sit on a player's Character tab, so a write has to redraw whichever of the
// two is actually on screen.
async function afterPartyWrite() {
  try { PARTY.cards = (await api("GET", "api/characters/party")).party; PARTY.at = new Date(); PARTY.err = null; }
  catch (err) { PARTY.err = err.message; }
  if (UI.sec === "table") drawParty(); else drawBody();
}

// The character a given account holds. One player, one character in practice — the board is
// ordered by player, and a second one would simply be a second row.
const partyOf = userId => PARTY.cards.filter(c => String(c.userId) === String(userId));
