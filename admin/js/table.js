// Ephemer — Admin · THE TABLE
//
// Every character at a glance, while you run the session. One card each, condensed to what a DM
// actually asks for mid-combat: hit points, AC, the save DCs, and the two numbers the Wounds push
// up. Every figure is computed by the server from sheet/js/rules.js, so this board and the
// player's own sheet can never disagree.
//
// It polls while it is open, and only while it is open — enter() and leave() are the whole reason
// the router has them. Eight players and one small endpoint is not worth a second transport.
//
// This is the one section you open DURING a session. It takes no rail: a rail of eight names
// beside a grid of the same eight cards is a list of what you are already looking at, and the
// width it costs is a column of the grid. Jumping to the person — their grants, their Grimm, their
// Servants — is one click on the card, and lands on the Players section instead.

const PARTY = { cards: [], timer: null, at: null, err: null, busy: null, note: "" };
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

async function loadParty() {
  try {
    PARTY.cards = (await api("GET", "api/characters/party")).party;
    PARTY.at = new Date(); PARTY.err = null;
  } catch (err) {
    PARTY.err = err.message;        // keep the last good cards on screen rather than blanking it
  }
  if (UI.sec !== "table") return;
  drawSecs();                       // the tab's count, if a character has appeared or left
  drawParty();
}

// A redraw replaces the whole board, so anything the DM is in the middle of typing has to survive
// it — and if the caret is actually in a field, the redraw waits rather than interrupting.
function drawParty() {
  const note = document.getElementById("ptyNote");
  if (note) PARTY.note = note.value;
  // Any field, not just the note: the Dream score is typed too now, and a four-second poll landing
  // between the "2" and the "4" of a 24 would be the most annoying bug on this page.
  const a = document.activeElement;
  if (a && a.matches?.("#ptyNote, .pty-do input")) return;
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

function renderTable() {
  const cards = PARTY.cards;
  const when = PARTY.at ? PARTY.at.toLocaleTimeString() : "—";
  let h = `<div class="cdx wide"><div class="cdx-hd"><div><h1>The table</h1>
      <p class="cdx-desc">Every character as it stands right now, refreshed every few seconds.
        Level, Dream and Fate are yours to set here — a player's own sheet cannot touch them.</p></div></div>

    <div class="cdx-sec">
      <div class="adm-line wide">
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

// A portrait where the player chose one, their initials where they did not — never an empty hole,
// which is the same bargain the sheet makes.
const initials = n => String(n || "?").split(/\s+/).filter(Boolean).slice(0, 2)
  .map(w => w[0].toUpperCase()).join("");

// A stored portrait path is a player's data, so it is encoded before it goes inside a url() inside
// an attribute — one apostrophe in it would otherwise end the url and the attribute early.
const urlAttr = u => escQ(encodeURI(String(u || "")).replace(/'/g, "%27"));

// Opened by id rather than by passing the path through an inline handler: a number cannot carry a
// quote, and the card already holds everything the lightbox needs. `portraitArt` is the full plate;
// a portrait with no full version opens the crop itself rather than nothing.
function partyArt(id) {
  const c = PARTY.cards.find(x => x.id === id);
  if (!c?.portrait) return;
  lightbox(`../sheet/${c.portraitArt || c.portrait}`, c.name);
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
      ${c.portrait
        ? `<button class="pty-por" onclick="partyArt(${c.id})" title="See ${escQ(c.name)}'s plate whole"
             style="background-image:url('../sheet/${urlAttr(c.portrait)}')"
             aria-label="See ${escQ(c.name)}'s plate whole"></button>`
        : `<span class="pty-por" aria-hidden="true">${esc(initials(c.name))}</span>`}
      <b>${esc(c.name)}</b>
      ${c.userId && UI.sec === "table"
        ? `<button class="pty-who as-link" onclick="go('players',${c.userId},'character')"
             title="Open ${escQ(c.player)} — their grants, their Grimm and their Servants">${esc(c.player)}</button>`
        : `<span class="pty-who">${esc(c.player)}</span>`}
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

    <footer class="pty-do">${partyControls(c)}</footer>
  </section>`;
}

// The controls are their own function because the player page shows this same footer under that
// person's character, and the two must not drift: a level allowed from one place and a level
// allowed from the other are the same call on the same endpoint.
function partyControls(c) {
  return `${c.pendingLevel
      ? `<span class="pty-wait" title="Allowed, and waiting for the player to take it">
           Level ${c.pendingLevel} waiting</span>`
      : `<button class="mini go" onclick="partyAllowLevel(${c.id})"
           title="Clear this character for level ${c.level + 1}. Their sheet grows a LEVEL UP button; the level rises when they press it."
           ${c.level >= 20 ? "disabled" : ""}>Allow Lv ${Math.min(20, c.level + 1)}</button>`}
    <span class="pair"><span class="lbl">Level</span><div class="step">
      <button onclick="partyBump(${c.id},'level',-1)" aria-label="Lower level">–</button><span>${c.level}</span>
      <button onclick="partyBump(${c.id},'level',1)" aria-label="Raise level">+</button></div></span>
    <span class="pair"><span class="lbl">Dream</span><div class="step">
      <button onclick="partyBump(${c.id},'dream',-1)" aria-label="Lower Dream">–</button>
      <input class="stepv" type="number" min="0" max="40" value="${c.dream}" id="ptyDream${c.id}"
        title="Type a Dream score and press Enter — a campaign event rarely moves it by one"
        aria-label="Dream score for ${escQ(c.name)}"
        onkeydown="if(event.key==='Enter')this.blur();if(event.key==='Escape')partyRevert(${c.id},'dream',this)"
        onchange="partySet(${c.id},'dream',this.value)">
      <button onclick="partyBump(${c.id},'dream',1)" aria-label="Raise Dream">+</button></div></span>
    <span class="pair"><span class="lbl">Fate</span><div class="step">
      <button onclick="partyBump(${c.id},'fate',-1)" aria-label="Take back a Fate use">–</button><span>${c.fate}</span>
      <button onclick="partyBump(${c.id},'fate',1)" aria-label="Grant a Fate use">+</button></div></span>
    <button class="mini" onclick="partyUnlock(${c.id},'asi')" title="Open an ability score improvement for this player to spend">+ ASI</button>
    <button class="mini" onclick="partyUnlock(${c.id},'feat')" title="Open a feat for this player to spend">+ Feat</button>
    ${c.unspent.honor || c.unspent.morality
      ? `<span class="pty-wait" title="Allocations this player has not spent yet">
          ${c.unspent.honor ? `${c.unspent.honor} Honor` : ""}${c.unspent.honor && c.unspent.morality ? " · " : ""}${c.unspent.morality ? `${c.unspent.morality} Morality` : ""} unspent</span>`
      : ""}`;
}

// Clearing a character for the next level WITHOUT taking it for them. The player's sheet grows a
// LEVEL UP button, and pressing it is what moves the level — so the features, the subclass and the
// ability score improvement are settled in the same breath as the number instead of a sheet sitting
// at a level nobody has filled in. The stepper beside it is still there for a correction or a rollback.
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
  await afterPartyWrite();
}

const PARTY_LIMITS = { level: [1, 20], dream: [0, 40], fate: [0, 99] };
const PARTY_FIELD = { level: "Level", dream: "Dream", fate: "Fate" };

// A nudge is just a set with the arithmetic done here, so there is one write path and one set of
// guards however the number was changed.
function partyBump(id, field, by) {
  const c = PARTY.cards.find(x => x.id === id);
  if (c) partySet(id, field, c[field] + by);
}
// Putting the number back after a refused or abandoned edit, without waiting for the next poll.
function partyRevert(id, field, el) {
  const c = PARTY.cards.find(x => x.id === id);
  if (c && el) { el.value = c[field]; el.blur(); }
}

// One change: write it, record the reason, and read the board back. A level also issues the Honor and
// Morality allocations and the unlock token the server attaches to it — this does not do that itself.
//
// ⭐ Dream is TYPED rather than stepped. It does not creep: it moves when the DM records a campaign
// event, and the table is at 24 — twenty-four presses of a + button to set up a character is not a
// control, it is a punishment. The arrows stay for the odd correction.
async function partySet(id, field, value) {
  const c = PARTY.cards.find(x => x.id === id);
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
  await afterPartyWrite();
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
  await afterPartyWrite();
}

// These same three controls sit on a player's Character tab, so a write has to redraw whichever of
// the two is actually on screen.
async function afterPartyWrite() {
  try { PARTY.cards = (await api("GET", "api/characters/party")).party; PARTY.at = new Date(); PARTY.err = null; }
  catch (err) { PARTY.err = err.message; }
  if (UI.sec === "table") drawParty(); else drawBody();
}

// The character a given account holds. One player, one character in practice — the board is
// ordered by player, and a second one would simply be a second card.
const partyOf = userId => PARTY.cards.filter(c => String(c.userId) === String(userId));
