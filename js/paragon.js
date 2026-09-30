// Arcanum Veritas Builder — The Paragon path

// ═══════════════════════════════════════════════════════════
//  THE PARAGON PATH
// ═══════════════════════════════════════════════════════════
// The third Cognitive Art, and the only one that builds nothing. Arcanum Veritas composes a seal
// out of any Cognition; Ignition forges an Eidon out of whatever is Burning. A Paragon swears
// themselves to three Cognitions and holds exactly one of them in a Deeper Burn.
//
// So this file is not a composer. It is a character sheet and a round tracker, and it looks
// nothing like the other two modes:
//
//   · There is no Cognition rail. A Paragon doesn't choose from the whole book — they choose from
//     the Devotions their DM has opened, and those can only be Cognitions they have mastered.
//   · There is no summary card. The Devotions themselves are the cards, and the one held in the
//     Deeper Burn opens into its full list of Paragon Abilities.
//   · The other two Arts are closed. A Paragon's soul has no room left for them, so for an
//     account on this path the builder has one mode and the ⇄ button is gone.
//
// Where everything comes from:
//   · whether the path is open, and which Devotions are in the pool — the DM's, set in Admin
//   · the Paragon Abilities — cognitions/devotions/<player>_<cognition>_devotion.json, authored per character
//   · which up-to-three are sworn and which one burns — the player's, kept with their account
//   · the Burn, the round, the uses, the wheel — this browser's, because they last one fight

const DEVOTIONS_SWORN = 3;
// The rules ask for a Dream *Score* of 13+. The bar only ever knows the modifier, and a score of
// 13 is a +1, so +1 is the gate the sheet can actually check.
const PAR_MIN_DREAM = 1;

const PAR_GROUPS = {
  passive:    { label: "Passive",    hint: "always on while its Cognition is your Paragon — Rotating ends it" },
  offensive:  { label: "Offensive",  hint: "activated to harm, hinder or break an enemy" },
  supportive: { label: "Supportive", hint: "activated to protect, heal or empower yourself or an ally" },
};
const PAR_GROUP_ORDER = ["passive", "offensive", "supportive"];
const PAR_ACTS = { action: "Action", bonus: "Bonus Action", reaction: "Reaction" };

// ── What the server (or the file) says about this character's path ──
// devotions: the open pool, each with its abilities · sworn: up to three of them · active: the Burn
let PAR = { enabled: false, max: DEVOTIONS_SWORN, devotions: [], sworn: [], active: null,
            reachable: [], examples: [], pilgrimage: [] };

// ── The part that belongs to this fight, not to the account ──
state.par = {
  uses:    null,    // pooled Offensive / Supportive uses left; null = full
  rotated: false,   // Rotate is a Bonus Action — one a turn
  out:     false,   // incapacitated: the Deeper Burn has gone out
  wheel:   {},      // devotion id → where its engine's cycle stands
  arrived: true,    // on the turn a phase is lit it arrives instead of turning
  held:    {},      // devotion id → the Rank III hold spent this Deeper Burn
  toll:    {},      // cognition id → how many times its own toll has been paid
  unsaved: null,    // why the last write of the three didn't land; null = everything is saved
  name:    "",      // the player's own name for this Paragon
};
// Set when /api/paragon itself couldn't be reached, so an empty pool isn't reported as "the DM
// hasn't opened the path" when the truth is that nothing answered.
let PAR_OFFLINE = false;

async function loadParagon() {
  if (!API) {
    // A plain static host has no accounts, so there is nobody to open the path for — every
    // Devotion is shown. A browser can't list a folder either, so this is the one place
    // cognitions/devotions/index.json earns its keep; the server reads the folder itself.
    try {
      const r = await fetch("cognitions/devotions/index.json");
      if (!r.ok) throw new Error(r.status);
      const listed = (await r.json()).devotions || [];
      const all = (await Promise.all(listed.map(async x => {
        try {
          const f = await fetch(`cognitions/devotions/${x.file}`);
          if (!f.ok) throw new Error(f.status);
          return { ...(await f.json()), id: x.file.replace(/\.json$/, "") };
        } catch (e) { console.warn(`Couldn't read devotions/${x.file}`, e); return null; }
      }))).filter(Boolean);
      PAR = { enabled: true, max: DEVOTIONS_SWORN, devotions: all.filter(d => !d.example),
              sworn: [], active: null, reachable: [], examples: all.filter(d => d.example), pilgrimage: [] };
    } catch (e) { console.warn("Couldn't read cognitions/devotions/", e); }
    return;
  }
  try {
    const r = await fetch("api/paragon");
    if (r.ok) { PAR = { ...PAR, ...(await r.json()) }; PAR_OFFLINE = false; }
  } catch (e) {
    PAR_OFFLINE = true;
    console.warn("Couldn't load your Devotions", e);
  }
  // The Cognition behind each sworn Devotion, for its own rules — Blood's toll, Sun's Corruption
  await Promise.all(PAR.sworn.map(loadCognition));
}

// The path is the DM's to open. Signed out, or on a static host, nothing is gated.
function parAllowed() { return !API || !ME ? true : (!!ME.paragon || ME.role === "dm"); }
// Locked to this one Art: a Paragon can't use Arcanum Veritas or Ignitions, can't manifest Eidons
// and has no Blaze Points, so the builder simply doesn't offer them. The DM is not locked — they
// need to see every Art to run the table.
function parLocked() { return !!(API && ME && ME.paragon && ME.role !== "dm"); }
// Kept for Arcanum Veritas' own composer: with the lockout there is no longer anything to warn about.
function pathWarning() { return ""; }

// ═══════════════════════════════════════════════════════════
//  NUMBERS IN THE TEXT
// ═══════════════════════════════════════════════════════════
// A Devotion's JSON writes {{2*(VM+PB)}} and the card shows the number. Recursive descent over
// + − × ÷ and brackets, with ceil() / floor() / abs(); nothing here goes near eval().
function parVars() {
  return { VM: state.verumMod, PB: profBonus(), DC: verumDC(), ATK: sealAttack(),
           DS: state.dreamMod, LVL: state.charLevel, RANK: getTier(state.charLevel) + 1 };
}
function parMath(src) {
  const vars = parVars(), s = String(src);
  let i = 0;
  const ws = () => { while (i < s.length && /\s/.test(s[i])) i++; };
  function expr() {
    let v = term(); ws();
    while (s[i] === "+" || s[i] === "-" || s[i] === "−") {
      const op = s[i++]; const r = term(); v = op === "+" ? v + r : v - r; ws();
    }
    return v;
  }
  function term() {
    let v = unary(); ws();
    while (s[i] === "*" || s[i] === "×" || s[i] === "/" || s[i] === "÷") {
      const op = s[i++]; const r = unary(); v = (op === "*" || op === "×") ? v * r : v / r; ws();
    }
    return v;
  }
  function unary() {
    ws();
    if (s[i] === "-" || s[i] === "−") { i++; return -unary(); }
    if (s[i] === "+") { i++; return unary(); }
    return atom();
  }
  function atom() {
    ws();
    if (s[i] === "(") { i++; const v = expr(); ws(); if (s[i] === ")") i++; return v; }
    const num = /^\d+(?:\.\d+)?/.exec(s.slice(i));
    if (num) { i += num[0].length; return parseFloat(num[0]); }
    const id = /^[A-Za-z]+/.exec(s.slice(i));
    if (!id) throw new Error(`can't read “${s.slice(i, i + 8)}”`);
    i += id[0].length; ws();
    if (s[i] === "(") {
      i++; const v = expr(); ws(); if (s[i] === ")") i++;
      const fn = id[0].toLowerCase();
      return fn === "ceil" ? Math.ceil(v) : fn === "floor" ? Math.floor(v) : fn === "abs" ? Math.abs(v) : v;
    }
    const key = id[0].toUpperCase();
    if (key in vars) return vars[key];
    throw new Error(`unknown name “${id[0]}”`);
  }
  const v = expr();
  if (!Number.isFinite(v)) throw new Error("not a number");
  return String(Math.round(v * 100) / 100);
}

// Devotion text runs through {{…}}, then through the shared resolver every other tab uses.
function parResolve(s) {
  const pb = profBonus(), vm = state.verumMod;
  const t = String(s == null ? "" : s)
    .replace(/\{\{([^{}]*)\}\}/g, (m, e) => {
      try { return parMath(e); }
      catch (err) { console.warn(`Devotion formula {{${e}}} — ${err.message}`); return m; }
    })
    // longhand a hand-written set may still carry
    .replace(/(\d+)\s*×\s*Proficiency Bonus/gi, (m, n) => `${(+n) * pb}`)
    .replace(/(\d+)\s*×\s*Verum Modifier/gi,    (m, n) => `${(+n) * vm}`)
    .replace(/half your Verum Modifier \(rounded up\)/gi, `${Math.ceil(vm / 2)}`);
  return resolve(t);
}
// A tier reads as its card line where it has one, else its prose — the tolerance a Cognition has.
function parLine(p)  { return parResolve(partCard(p) || partText(p)); }
function parProse(p) { return parResolve(partText(p) || partCard(p)); }
function parRank(tier) { return TIERS[tier].label.split(" · ")[0]; }

// ═══════════════════════════════════════════════════════════
//  THE POOL, THE THREE, AND THE BURN
// ═══════════════════════════════════════════════════════════
function parEntry(id) { return INDEX.find(c => c.id === id) || { id, name: id }; }
function parPool()      { return PAR.devotions || []; }
function parDevotion(cogId) { return parPool().find(d => d.cognition === cogId) || null; }
function parSwornList() { return (PAR.sworn || []).filter(id => parDevotion(id)); }
function parActive()    { return state.par.out ? null : (PAR.active && parSwornList().includes(PAR.active) ? PAR.active : null); }
function parCurrent()   { return parActive() ? parDevotion(parActive()) : null; }
function parMax()       { return PAR.max || DEVOTIONS_SWORN; }

// Can this character walk the path at all? A Dream Score of 13+, and three Cognitions at Learn
// Full — for a player INDEX *is* the list of what they have mastered.
function parEligible() {
  return { dream: state.dreamMod >= PAR_MIN_DREAM, known: INDEX.length >= DEVOTIONS_SWORN,
           pool: parPool().length >= DEVOTIONS_SWORN };
}

// Every change to the three, or to which one burns, is written back to the account at once.
//
// When that write fails the change is *kept* rather than rolled back: this is a Rotate in the
// middle of a fight, and the player needs the Burn where they just put it whether or not a server
// is listening. But the sheet then says so — an unsaved Rotate that quietly reverts on the next
// reload is worse than one that admits it. The whole {sworn, active} pair goes up every time, so
// one successful save afterwards puts everything right.
async function parSaveChoice() {
  if (!API) return true;
  try {
    const r = await api("PUT", "api/paragon/choice", { sworn: PAR.sworn, active: PAR.active });
    PAR.sworn = r.sworn; PAR.active = r.active;
    state.par.unsaved = null;
    return true;
  } catch (err) {
    state.par.unsaved = err.offline
      ? "The server isn't answering."
      : err.status === 401 ? "Your session has expired." : err.message;
    return false;
  }
}
async function parRetrySave() {
  if (await parSaveChoice()) toast("Saved — your Devotions are on your account again");
  else toast(state.par.unsaved);
  syncBar(); renderMain();
}
// Fetch the pool again after the server comes back, without losing the round's trackers
async function parReload() {
  await loadParagon();
  toast(PAR_OFFLINE ? "Still nothing answering" : "Your Devotions are back");
  syncBar(); renderMain();
}

async function parSwear(cogId) {
  const d = parDevotion(cogId); if (!d) return;
  if (PAR.sworn.includes(cogId)) return;
  if (PAR.sworn.length >= parMax())
    return toast("Three Devotions is the limit — release one, or walk a Pilgrimage");
  await loadCognition(cogId);
  PAR.sworn = [...PAR.sworn, cogId];
  if (!PAR.active) { PAR.active = cogId; state.par.out = false; parLitFresh(cogId); }
  toast(`${d.name} — ${parEntry(cogId).name} sworn as a Devotion`);
  await parSaveChoice();
  syncBar(); renderMain();
}

async function parRelease(cogId) {
  if (!PAR.sworn.includes(cogId)) return;
  PAR.sworn = PAR.sworn.filter(id => id !== cogId);
  if (PAR.active === cogId) PAR.active = null;           // letting the Paragon go puts it out
  toast(`${parEntry(cogId).name} is no longer a Devotion`);
  await parSaveChoice();
  syncBar(); renderMain();
}

// Lighting a Devotion: its engine starts where the engine says it starts, and the phase arrives
// on this turn rather than turning.
function parLitFresh(cogId) {
  const d = parDevotion(cogId);
  if (d?.engine?.phases?.length) state.par.wheel[d.id] = d.engine.start || 0;
  state.par.arrived = true;
  state.par.held = {};
}

// Rotate — a Bonus Action, one a turn. It ends only the old Paragon's Passives; anything its
// Offensive or Supportive abilities set in motion keeps running on its own clock.
async function parLight(cogId, how) {
  if (!PAR.sworn.includes(cogId)) return;
  if (PAR.active === cogId && !state.par.out) return;
  const lit = !!parActive();
  if (lit && state.par.rotated) toast("You've already Rotated this turn — it's a Bonus Action");
  PAR.active = cogId;
  state.par.out = false;
  state.par.rotated = true;
  parLitFresh(cogId);
  toast(how === "relight" ? `${parEntry(cogId).name} relit — the Deeper Burn returns`
      : lit ? `Rotated to ${parEntry(cogId).name}` : `${parEntry(cogId).name} takes the Deeper Burn`);
  await parSaveChoice();
  syncBar(); renderMain();
}
// The rotation dial: step to the next or previous of the three.
function parRotateStep(dir) {
  const three = parSwornList();
  if (three.length < 2) return toast("Rotating needs a second Devotion to rotate to");
  const at = three.indexOf(parActive());
  const to = at < 0 ? 0 : (at + dir + three.length) % three.length;
  parLight(three[to]);
}
// Incapacitated: the Deeper Burn goes out. Relight any Devotion with a Bonus Action on a later turn.
function parIncapacitated() {
  state.par.out = true;
  state.par.held = {};
  toast("Incapacitated — the Deeper Burn goes out");
  syncBar(); renderMain();
}

// ── The round, the uses, and the rests ───────────────────
function parUsesMax() { return profBonus(); }
function parUsesNow() { const P = state.par; return P.uses === null ? parUsesMax() : Math.min(P.uses, parUsesMax()); }
function parSpendUse(n)   { state.par.uses = Math.max(0, parUsesNow() - n); syncBar(); renderMain(); }
function parRestoreUse(n) { state.par.uses = Math.min(parUsesMax(), parUsesNow() + n); syncBar(); renderMain(); }

function parNextRound() {
  const P = state.par;
  P.rotated = false;
  const d = parCurrent();
  // The cycle turns at the start of each of your turns — except the turn its phase arrived on
  if (d?.engine?.phases?.length) {
    if (P.arrived) P.arrived = false;
    else parTurnWheel(1, true);
  }
  renderMain();
}
function parLongRest() {
  state.par.uses = parUsesMax();
  state.par.held = {};
  state.par.toll = {};
  state.track = { marks: [], now: "gold" };   // Sun's Solar Tracker resets with the rest
  state.phase = 0;                            // Lunar wakes at the New Moon after every long rest
  toast("Long rest — every use restored, every ledger cleared");
  syncBar(); renderMain();
}
function parShortRest() { toast("Short rest — the Deeper Burn is untouched by it"); }

// ── The engine's cycle (Nature's Wheel, and anything written like it) ──
function parEngine()      { return parCurrent()?.engine || null; }
function parPhases()      { return parEngine()?.phases || []; }
function parPhaseIndex()  { const d = parCurrent(); const n = parPhases().length; return n ? ((state.par.wheel[d.id] || 0) % n + n) % n : 0; }
function parPhase()       { return parPhases()[parPhaseIndex()] || null; }
function parSetPhase(i, quiet) {
  const d = parCurrent(), n = parPhases().length; if (!d || !n) return;
  state.par.wheel[d.id] = ((i % n) + n) % n;
  if (!quiet) state.par.arrived = true;
  renderMain();
}
function parTurnWheel(dir, quiet) {
  if (dir < 0 && getTier(state.charLevel) < 3)
    return toast(`Turning the wheel back is ${parRank(3)} — for now it only goes forward`);
  parSetPhase(parPhaseIndex() + dir, quiet);
}
// Rank III: once per Deeper Burn, when the phase would turn, you can hold it one more turn.
function parHold() {
  const d = parCurrent(); if (!d) return;
  if (getTier(state.charLevel) < 2) return toast(`Holding the wheel is ${parRank(2)}`);
  if (state.par.held[d.id]) return toast("You've already held the wheel this Deeper Burn");
  state.par.held[d.id] = true;
  state.par.arrived = true;
  toast(`${parPhase()?.name || "The phase"} holds for one more turn`);
  renderMain();
}

// ── The Cognition's own ledger: Blood's toll, Sun's Corruption, anything with a `cost` ──
function parToll(cogId, n) {
  state.par.toll[cogId] = Math.max(0, (state.par.toll[cogId] || 0) + n);
  renderMain();
}

// ── The bar ───────────────────────────────────────────────
// Attack and DC are already right: the Paragon Attack Bonus is Proficiency + Verum mod, which is
// what sealAttack() is, and the Paragon DC is the Verum DC.
function parSyncBar() {
  document.getElementById("capOut").textContent = `${parUsesNow()}/${parUsesMax()}`;
  document.getElementById("capLbl").textContent = "uses";
}
// No rail on this path — the Devotion cards are the choosing. Kept so renderCogList has somewhere
// to go, and so an old browser that still shows the rail shows an explanation rather than a seal.
function parRail(box) {
  box.innerHTML = `<div class="empty" style="padding:22px 8px">A Paragon chooses from their
    Devotions, not from the whole book. They're on the right.</div>`;
}
function parClear() { /* nothing to clear: the three are the account's, not this page's */ }

// ═══════════════════════════════════════════════════════════
//  THE SHEET
// ═══════════════════════════════════════════════════════════
// Choosing and reading are two different jobs, so they are two different blocks: the cards are
// the choosing, and the abilities below them are only ever the one Devotion in the Deeper Burn.
function renderParagon() {
  const comp = document.getElementById("composer");
  comp.innerHTML = parHeader() + parRules() + parDevotionsBlock() + parBurningBlock()
                 + parOwnRulesBlock() + parPilgrimageBlock() + savedHome();
  // The seal panel is hidden on this path, but Copy-as-text and Save-as-image read from it, so
  // the burning Devotion is written there too.
  const seal = document.getElementById("sumBody");
  if (seal) {
    const d = parCurrent();
    seal.innerHTML = d ? parCardHTML(d) : `<div class="empty">Nothing is burning.</div>`;
    seal.dataset.text = d ? parCardText(d).join("\n") : "";
  }
  const play = document.getElementById("mPlay");
  if (play) play.className = "mini on";
  // Keep the burning tile in view on the reel — Rotating from the arrows has to be visible
  const focus = document.getElementById("parFocus");
  if (focus) focus.scrollIntoView({ block: "nearest", inline: "center" });
}

// ── The header: the Deeper Burn, and every tracker the round needs ──
function parHeader() {
  const P = state.par, tier = getTier(state.charLevel), d = parCurrent();
  const three = parSwornList(), elig = parEligible();
  const umax = parUsesMax(), unow = parUsesNow();

  let h = `<div class="par-hd">
    <div class="par-hd-l">
      <div class="par-burn ${d ? "lit" : "dark"}">
        <span class="par-burn-i">${d ? cogIcon(parEntry(d.cognition)) : "○"}</span>
        <span class="par-burn-t"><b>${d ? esc(d.name) : P.out ? "The Burn is out" : "Nothing is burning"}</b>
          <i>${d ? `Paragon of ${esc(parEntry(d.cognition).name)} · Deeper Burn` :
                P.out ? "Incapacitated — relight a Devotion with a Bonus Action" :
                three.length ? "Light one of your Devotions" : "Swear a Devotion below"}</i></span>
      </div>
      <div class="par-nums">
        <span class="n atk"><b>${sgn(sealAttack())}</b><i>Paragon attack</i></span>
        <span class="n dc"><b>${verumDC()}</b><i>Paragon DC</i></span>
        <span class="n"><b>${parRank(tier)}</b><i>level ${state.charLevel}</i></span>
        <span class="n"><b>${three.length}/${parMax()}</b><i>Devotions sworn</i></span>
      </div>
    </div>`;

  // The Rotate dial used to live here. It is the Devotions reel now — one line, and whichever
  // Devotion has the focus is the one in the Deeper Burn.

  // Uses, the round, and the rests
  h += `<div class="par-track">
    <div class="blaze">${Array.from({ length: umax }, (_, i) => `<span class="bp${i < unow ? " on" : ""}"></span>`).join("")}
      <b>${unow} / ${umax}</b><i>uses — Offensive &amp; Supportive, pooled across every Devotion</i></div>
    <div class="chips">
      <button class="chip" onclick="parSpendUse(1)" ${unow ? "" : "disabled"}>Spend a use</button>
      <button class="chip" onclick="parRestoreUse(1)" ${unow < umax ? "" : "disabled"}>Give one back</button>
      <button class="chip" onclick="parNextRound()" title="${parPhases().length ? "Turns the cycle and clears the Bonus Action" : "Clears the Bonus Action"}">Next round ›</button>
      ${d ? `<button class="chip" onclick="parIncapacitated()" title="The Deeper Burn goes out — relight with a Bonus Action on a later turn">Incapacitated</button>` : ""}
      <button class="chip" onclick="parShortRest()">Short rest</button>
      <button class="chip" onclick="parLongRest()">Long rest</button>
      ${API ? `<button class="chip" onclick="saveBuild()" title="Keep this Paragon on your account">Save</button>` : ""}
      <button class="chip" onclick="parCopy()">Copy</button>
      <button class="chip" onclick="saveImage()" title="Save the burning Devotion as a PNG">Image</button>
      <button class="chip" onclick="window.print()">Print</button>
    </div>`;
  // An unsaved Rotate still holds at the table — but it must not pretend to be saved
  if (P.unsaved)
    h += `<p class="par-warn par-unsaved">⚠ <strong>${esc(P.unsaved)}</strong> Your Devotions and the
      Deeper Burn are set here and work at the table, but they haven't reached your account, so a
      reload would lose them.
      <button class="chip" onclick="parRetrySave()">Try again</button></p>`;
  if (!elig.dream)
    h += `<p class="hint">⚠ The path asks for a Dream Score of 13 or higher — a Dream mod of at
      least +${PAR_MIN_DREAM}. The bar reads ${sgn(state.dreamMod)}.</p>`;
  if (!elig.known)
    h += `<p class="hint">⚠ The path asks for three Cognitions at Learn Full. ${INDEX.length === 1 ? "One is" : INDEX.length + " are"} open to you.</p>`;
  h += `</div></div>`;
  return h;
}

function parCopy() {
  const d = parCurrent();
  if (!d) return toast("Light a Devotion first");
  navigator.clipboard.writeText(parCardText(d).join("\n")).then(() => toast("Copied to clipboard"));
}

// ── The Devotions reel — one line, and Rotate is the same control ──
// Choosing a Devotion and rotating to it were two gestures doing one thing, so they are one reel:
// every open Devotion sits on a single line, the focused tile is the one in the Deeper Burn, and
// the ‹ › arrows step the focus round the three sworn — which is exactly what Rotate does.
function parDevotionsBlock() {
  const pool = parPool();
  // Nothing answered, so we don't actually know whether the path is open — say that, don't guess
  if (PAR_OFFLINE)
    return block("Devotions", `<p class="par-warn">⚠ <strong>Couldn't reach the server</strong>, so
      your Devotions haven't loaded. Nothing is lost — reload once it's back.
      <button class="chip" onclick="parReload()">Try again</button></p>`);
  if (!PAR.enabled)
    return block("Devotions", API && ME?.role === "dm"
      ? `<p class="hint">You're reading this as the DM, and the DM holds no Devotions. Open the path
         for a player on the <a href="admin.html">Admin page</a> and set which Devotions they may
         swear; their abilities are written in
         <code>cognitions/devotions/<player>_<cognition>_devotion.json</code>. The worked examples from the rules
         are under <strong>Reference › Paragon</strong>.</p>`
      : `<p class="hint">The Paragon path isn't open to you. It's a choice of identity made with
         your DM, and they open it.</p>`);
  if (!pool.length)
    return block("Devotions", `<p class="hint">No Devotions are open to you yet. Your DM sets them
      on the Admin page, and they can only be Cognitions you already know at <strong>Learn Full</strong>.
      ${PAR.reachable.length ? `You've mastered ${PAR.reachable.length} Cognition${PAR.reachable.length > 1 ? "s" : ""} that could become one.` : ""}</p>`);

  const three = parSwornList(), full = three.length >= parMax();
  const P = state.par, canStep = three.length > 1;

  // Sworn first, in the order they were sworn — that is the rotation — then the rest of the pool
  const reel = [...three.map(parDevotion), ...pool.filter(d => !three.includes(d.cognition))];

  let h = `<div class="par-reel">
    <button class="par-arrow" onclick="parRotateStep(-1)" ${canStep ? "" : "disabled"}
      title="Rotate to the Devotion before this one — a Bonus Action" aria-label="Rotate back">‹</button>
    <div class="par-track-x" id="parReel">` + reel.map(d => parDevotionTile(d, three, full)).join("") + `</div>
    <button class="par-arrow" onclick="parRotateStep(1)" ${canStep ? "" : "disabled"}
      title="Rotate to the next Devotion — a Bonus Action" aria-label="Rotate forward">›</button>
  </div>`;

  // One line of plain words under the reel, saying where you stand
  const room = parMax() - three.length, spare = pool.length - three.length;
  let note = P.rotated ? `You've Rotated this turn — it's a Bonus Action.`
    : P.out ? `The Deeper Burn is out. Pick a Devotion to relight it.`
    : !three.length ? `Nothing sworn yet. Pick up to ${parMax()} — the one you focus is the one that burns.`
    : !parActive() ? `Nothing is burning. Pick one of your sworn Devotions.`
    : `The focused Devotion is the one in the Deeper Burn. The arrows Rotate — a Bonus Action that ends only Passives.`;
  if (room > 0 && spare > 0) note += ` ${room} more to swear.`;
  else if (room > 0 && three.length) note += ` You've sworn every Devotion open to you — ${three.length} of ${parMax()}; your DM opens another, or a Pilgrimage reaches for one.`;
  h += `<p class="hint" style="margin:10px 0 0">${note}</p>`;

  return block(`Devotions · ${three.length}/${parMax()} sworn of ${pool.length} open`, h);
}

// One tile on the reel. Clicking it is the whole gesture: a sworn Devotion takes the Deeper Burn,
// an unsworn one is sworn (and lights if nothing else is). ✕ lets it go.
function parDevotionTile(d, three, full) {
  const cog = parEntry(d.cognition);
  const sworn = three.includes(d.cognition), burning = parActive() === d.cognition;
  const cls = ["par-tile", burning ? "burning" : sworn ? "sworn" : "spare", full && !sworn ? "dis" : ""].filter(Boolean).join(" ");
  const act = sworn
    ? `parLight('${escAttr(d.cognition)}'${state.par.out ? ",'relight'" : ""})`
    : `parSwear('${escAttr(d.cognition)}')`;
  const why = burning ? "Burning now — the Deeper Burn"
    : sworn ? (state.par.out ? `Relight ${cog.name}` : parActive() ? `Rotate to ${cog.name} — a Bonus Action` : `Light ${cog.name} — a Bonus Action`)
    : full ? "Three Devotions is the limit — release one, or walk a Pilgrimage" : `Swear yourself to ${d.name}`;

  return `<div class="${cls}"${burning ? ` id="parFocus"` : ""}>
    <button class="par-tile-b" onclick="${act}" ${full && !sworn ? "disabled" : ""} title="${escQ(why)}">
      <span class="ico">${cogIcon(cog)}</span>
      <span class="par-tile-n"><b>${esc(d.name)}</b><i>${esc(cog.name)}${d.unwritten ? " · nothing written" : ""}</i></span>
      <span class="par-tile-s">${burning ? "✦ burning" : sworn ? "sworn" : full ? "—" : "swear"}</span>
    </button>
    ${sworn ? `<button class="par-tile-x" onclick="parRelease('${escAttr(d.cognition)}')"
      title="Let ${escQ(d.name)} go" aria-label="Release ${escQ(d.name)}">✕</button>` : ""}
  </div>`;
}

// ── The abilities section: the one Devotion in the Deeper Burn, and no other ──
// A Devotion that isn't your Paragon grants nothing, so there is nothing of it to read here.
// Rotating swaps the whole section over; putting the Burn out empties it.
function parBurningBlock() {
  if (!PAR.enabled || !parPool().length) return "";
  const d = parCurrent(), three = parSwornList();
  if (!d)
    return block("Paragon Abilities", `<p class="hint" style="margin-top:0">${
      state.par.out
        ? "The Deeper Burn is out. Relight one of your Devotions with a Bonus Action and its abilities load here."
        : three.length
          ? "Nothing is burning. Light one of your Devotions and its abilities load here — only that one's."
          : "Swear a Devotion above, then light it. Only the Devotion in the Deeper Burn shows its abilities."}</p>`);

  const tier = getTier(state.charLevel), cog = parEntry(d.cognition);
  const any = PAR_GROUP_ORDER.some(g => (d.abilities?.[g] || []).length);

  let h = `<div class="par-now">
    <span class="ico">${cogIcon(cog)}</span>
    <span class="par-now-t"><b>${esc(d.name)}</b><i>Paragon of ${esc(cog.name)} · ${parRank(tier)} · Deeper Burn</i></span>
    <span class="t hot">burning</span></div>`;
  if (d.description) h += `<p class="par-card-d">${esc(d.description)}</p>`;
  // What the reel's one line has no room for lives here, on the Devotion actually in play
  h += `<div class="c-tags">
    ${d.savingThrow && d.savingThrow !== "—" ? `<span class="t">${esc(d.savingThrow)} save vs ${verumDC()}</span>` : ""}
    ${d.damageType && d.damageType !== "—" ? `<span class="t">${esc(d.damageType)}</span>` : ""}
    ${d.engine ? `<span class="t">${esc(d.engine.title || "engine")}</span>` : ""}
    ${d.source ? `<span class="t">${esc(d.source)}</span>` : ""}</div>`;
  if (d.pilgrimage) h += `<p class="par-warn">⚠ ${esc(d.pilgrimage)}</p>`;

  if (!any)
    return block("Paragon Abilities", h + `<p class="par-warn">No Paragon Abilities are written for
      ${esc(d.name || cog.name)} yet. They're built for you with your DM — a Passive, and an
      Offensive or Supportive ability, each scaling by Rank. The Deeper Burn still holds:
      ${esc(cog.name)}'s own rules apply below, and your DC and attack are the same.</p>`);

  if (d.engine) h += parEngineHTML(d, tier);
  PAR_GROUP_ORDER.forEach(g => {
    (d.abilities?.[g] || []).forEach(ab => { h += parAbilityHTML(d, ab, g, tier); });
  });
  h += `<p class="par-foot">Only while burning — an ability works, and a Passive is on, only while
    its Cognition is your Paragon. Rotating ends the Passives and nothing else${three.length > 1
      ? `, and brings ${esc(parEntry(three.find(id => id !== d.cognition)).name)}'s or the third's here instead` : ""}.</p>`;
  return block(`Paragon Abilities — ${esc(d.name)}`, h);
}

// The engine — Nature's Wheel, and anything else written the same way: a cycle of phases that
// decides what the Passive does and what the other abilities add.
function parEngineHTML(d, tier) {
  const e = d.engine, phases = e.phases || [], i = parPhaseIndex(), p = phases[i];
  let h = `<div class="par-eng"><div class="par-eng-h"><b>${esc(e.title || "The engine")}</b>
    ${e.card ? `<i>${esc(parResolve(e.card))}</i>` : ""}</div>`;
  if (phases.length) {
    h += `<div class="chips"><span class="chip-lbl">${esc(e.unit || "Phase")}</span>` +
      phases.map((x, n) => `<button class="chip${n === i ? " on" : ""}" onclick="parSetPhase(${n})"
        title="${escQ(x.epithet || x.name)}">${x.icon || ""} ${esc(x.name)}</button>`).join("") +
      `<button class="chip" onclick="parTurnWheel(1)" title="Turn it one step forward">turn ›</button>
       <button class="chip${tier >= 3 ? "" : " dis"}" onclick="parTurnWheel(-1)" title="${tier >= 3 ? "Rank IV — it turns either way" : "Turning back is Rank IV"}">‹ back</button>
       <button class="chip${tier >= 2 && !state.par.held[d.id] ? "" : " dis"}" onclick="parHold()"
         title="${tier < 2 ? "Holding is Rank III" : state.par.held[d.id] ? "Already held this Deeper Burn" : "Hold it one more turn — once per Deeper Burn"}">hold</button></div>`;
    if (p) {
      h += `<p class="scale-note">${p.icon || ""} <strong>${esc(p.name)}${p.epithet ? ` — ${esc(p.epithet)}` : ""}</strong> · ${esc(parLine(p.tiers?.[tier] ?? p.card))}</p>`;
      if (p.calm) h += `<p class="hint" style="font-style:normal">Out of combat — ${esc(p.calm)}</p>`;
      const next = phases[(i + 1) % phases.length];
      h += `<p class="hint">${state.par.arrived
        ? `It has just arrived — it won't turn until your next turn. Then ${next.icon || ""} ${esc(next.name)}.`
        : `Next turn it becomes ${next.icon || ""} ${esc(next.name)}.`}</p>`;
    }
  }
  if (e.text) h += `<p class="par-ab-t">${esc(parResolve(e.text))}</p>`;
  if (e.tiers) h += parLadder(e.tiers, tier);
  return h + `</div>`;
}

function parAbilityHTML(d, ab, group, tier) {
  const G = PAR_GROUPS[group];
  const now = parLine(ab.tiers?.[tier] ?? ab.tiers?.[ab.tiers?.length - 1]);
  const rider = parRiderLine(d, ab, tier);
  return `<div class="par-ab ${group}">
    <div class="par-ab-h"><b>${esc(ab.name)}</b>
      <span class="t ${group === "passive" ? "" : "hot"}">${G.label}</span>
      ${ab.activation ? `<span class="t">${PAR_ACTS[ab.activation] || esc(ab.activation)}</span>` : ""}
      ${ab.uses ? `<span class="t">${esc(parResolve(ab.uses))} use${String(ab.uses) === "1" ? "" : "s"}</span>` : ""}
      ${ab.duration ? `<span class="t">${esc(ab.duration)}</span>` : ""}
      ${group === "passive" ? "" : `<button class="mini" onclick="parSpendUse(1)" ${parUsesNow() ? "" : "disabled"} title="Use it — spends one of the pooled uses">use it</button>`}</div>
    ${ab.description ? `<p class="par-ab-f">${esc(ab.description)}</p>` : ""}
    <p class="par-ab-t">${esc(parResolve(ab.text || ""))}</p>
    ${now ? `<p class="par-ab-now">${esc(now)}</p>` : ""}
    ${rider ? `<p class="par-ab-now rider">${esc(rider)}</p>` : ""}
    ${parLadder(ab.tiers, tier)}</div>`;
}

// What the engine's current phase adds to this ability. `rider: "phase"` means the Passive simply
// *is* the phase; any other value keys into the phase's own `riders`.
function parRiderLine(d, ab, tier) {
  if (!ab.rider) return "";
  const p = parPhase(); if (!p) return "";
  if (ab.rider === "phase") return `${p.icon || ""} ${p.name} — ${parLine(p.tiers?.[tier] ?? p.card)}`;
  const line = p.riders?.[ab.rider];
  if (!line) return "";
  return `${p.icon || ""} ${p.name} — ${parLine(Array.isArray(line) ? (line[tier] ?? line[line.length - 1]) : line)}`;
}

function parLadder(tiers, tier) {
  if (!Array.isArray(tiers) || !tiers.length) return "";
  return `<div class="ladder">` + tiers.map((t, i) => {
    const line = parLine(t);
    if (!line) return "";
    return `<div class="rung ${i === tier ? "now" : i < tier ? "past" : "later"}">
      <span class="lv">${TIERS[i].label}</span><span>${esc(line)}</span></div>`;
  }).join("") + `</div>`;
}

// ═══════════════════════════════════════════════════════════
//  THE COGNITION'S OWN RULES
// ═══════════════════════════════════════════════════════════
// "Whatever a Cognition charges or depends on when it forms the Core of a seal applies to its
// Paragon Abilities too" — so the Devotion's own Cognition file is read for its `cost`, its
// `engine` (Sun's Solar Tracker, Lunar's phases) and the `mastery` traits the level has reached.
function parOwnRulesBlock() {
  const d = parCurrent(); if (!d) return "";
  const cog = LOADED[d.cognition];
  if (!cog) {
    loadCognition(d.cognition).then(c => { if (c) renderMain(); });
    return block(`${parEntry(d.cognition).name}'s own rules`, `<p class="hint">Reading ${esc(parEntry(d.cognition).name)}…</p>`);
  }
  const tolls = parTollHTML(cog), trk = parCogTrackerHTML(cog), ph = parCogPhaseHTML(cog), mast = parMasteryHTML(cog);
  if (!tolls && !trk && !ph && !mast) return "";
  return block(`${esc(cog.name)}'s own rules`, `<p class="hint" style="margin-top:0">Whatever
    ${esc(cog.name)} charges or depends on as a seal's Core, it charges here too.</p>` + tolls + trk + ph + mast);
}

function parTollHTML(cog) {
  if (!cog.cost) return "";
  const paid = state.par.toll[cog.id] || 0;
  // A toll written per slot level has no slot to read on this path — a Paragon draws no seal.
  // The sheet resolves it at slot 1 and says so rather than quietly inventing a number.
  const perSlot = /\{SLOT\}/.test(`${cog.cost.card || ""}${cog.cost.text || ""}`);
  return `<div class="par-eng"><div class="par-eng-h"><b>The toll</b>
      <i>${esc(parResolve(cog.cost.card || ""))}</i></div>
    <p class="par-ab-t">${esc(parResolve(cog.cost.text || ""))}</p>
    ${perSlot ? `<p class="par-warn">This toll is written per <strong>slot level</strong>, and a
      Paragon draws no seal and spends no slot. It's shown here at slot 1 — settle with your DM what
      it costs a Paragon Ability, by Rank or by a flat figure.</p>` : ""}
    <div class="chips" style="margin-top:8px"><span class="chip-lbl">Paid since your last long rest</span>
      <button class="chip" onclick="parToll('${escAttr(cog.id)}',-1)" ${paid ? "" : "disabled"}>–</button>
      <span class="t hot">${paid}×</span>
      <button class="chip" onclick="parToll('${escAttr(cog.id)}',1)">+</button></div></div>`;
}

// Sun's Two Suns, and anything else with engine.tracker — trackerOf() and the Gold/Black ledger
// are the composer's, reused whole.
function parCogTrackerHTML(cog) {
  const trk = trackerOf(cog); if (!trk) return "";
  let h = `<div class="par-eng"><div class="par-eng-h"><b>${esc(trk.tr.name || cog.engine.title || "Tracker")}</b>
      <i>${esc(parResolve(cog.engine.card || ""))}</i></div><div class="chips">` +
    Array.from({ length: trk.win }, (_, i) => {
      if (i < trk.marks.length) return `<button class="chip pip ${trk.marks[i]}" onclick="markTrack(${i})" title="Click to flip Gold / Black, again to clear">${i + 1} · ${trk.marks[i] === "gold" ? "Gold" : "Black"}</button>`;
      if (i === trk.marks.length) return `<button class="chip pip now on" title="This activation">${i + 1} · now</button>`;
      return `<button class="chip pip dis">${i + 1}</button>`;
    }).join("") + `</div>
    <div class="chips" style="margin-top:8px">
      <button class="chip${trk.now === "gold" ? " on" : ""}" onclick="setTrackNow('gold')">${esc(trk.tr.gold?.label || "Gold")}</button>
      <button class="chip${trk.now === "black" ? " on" : ""}" onclick="setTrackNow('black')">${esc(trk.tr.black?.label || "Black")} — can't pay</button>
      <button class="chip" onclick="parLogTrack()" title="You used it — log this activation and move on">Log it ›</button>
      <button class="chip" onclick="resetTrack()">Reset</button></div>
    <p class="hint">${esc(parResolve((trk.now === "gold" ? trk.tr.gold : trk.tr.black)?.card || ""))}.` +
    (trk.last && trk.reck
      ? ` <strong>This is activation ${trk.win} — ${esc(trk.reck.name)}:</strong> ${esc(parResolve(trk.reck.card))}.`
      : ` Activation ${trk.n} of ${trk.win} — ${trk.win - trk.n} more before the Reckoning.`) + `</p></div>`;
  return h;
}
// logTrack() reads the *seal's* Core; a Paragon's tracker hangs off the burning Devotion instead.
function parLogTrack() {
  const d = parCurrent(); if (!d) return;
  const trk = trackerOf(LOADED[d.cognition]); if (!trk) return;
  state.track.marks = trk.last ? [] : [...trk.marks, trk.now];
  state.track.now = "gold";
  renderMain();
}

// Lunar's cycle, and anything else with engine.phases on the Cognition itself
function parCogPhaseHTML(cog) {
  const phz = phaseOf(cog); if (!phz) return "";
  return `<div class="par-eng"><div class="par-eng-h"><b>${esc(cog.engine.title || "The cycle")}</b>
      <i>${esc(parResolve(cog.engine.card || ""))}</i></div>
    <div class="chips">` + phz.all.map((p, i) =>
      `<button class="chip${i === phz.index ? " on" : ""}" onclick="selectPhase(${i})">${esc(p.name)}</button>`).join("") + `</div>
    <p class="scale-note"><strong>${esc(phz.now.epithet || phz.now.name)}</strong> · ${esc(parResolve(phz.now.card || ""))}</p>
    <p class="hint">Then turn it to ${esc(phz.next.name)} or ${esc(phz.prev.name)}.</p></div>`;
}

function parMasteryHTML(cog) {
  const traits = masteryOf(cog); if (!traits.length) return "";
  return `<div class="par-eng"><div class="par-eng-h"><b>${esc(cog.mastery.title || "Mastery")}</b>
      <i>${esc(cog.mastery.text || "")}</i></div><div class="cdx-defs">` +
    traits.map(tr => `<div class="cdx-def"><b>${esc(tr.name)}</b><span>${esc(parResolve(tr.card || tr.text || ""))}</span></div>`).join("") +
    `</div></div>`;
}

// ═══════════════════════════════════════════════════════════
//  PILGRIMAGE
// ═══════════════════════════════════════════════════════════
// The rule asks the player to give the DM advance notice, so the notice is the mechanism: the
// player names the swap here, and the DM answers it on the Admin page.
const PILGRIM_WORDS = { asked: "on the road — waiting for your DM", walked: "walked", declined: "not this one" };

// A row names its Cognitions for us, because a Pilgrimage may reach for one this browser has
// never been told the id of.
function parPilName(p, which) { return p[which + "Name"] || parEntry(p[which]).name; }

function parPilgrimageBlock() {
  if (!PAR.enabled || !API) return "";
  const open = (PAR.pilgrimage || []).find(p => p.status === "asked");
  const past = (PAR.pilgrimage || []).filter(p => p.status !== "asked").slice(0, 4);
  const sworn = parSwornList();
  // The short road: a Cognition already mastered, waiting on the DM to open it as a Devotion.
  // The long one: a Cognition not mastered at all — which is how Zeke's Nature gets there.
  const near = PAR.reachable || [], far = (PAR.names || []).filter(n =>
    !near.some(id => parEntry(id).name.toLowerCase() === n.toLowerCase()));

  let h = `<p class="hint" style="margin-top:0">Your Devotions can change, but not casually. To
    replace one you undertake a <strong>Pilgrimage</strong> — a personal ritual over downtime,
    whose shape you and your DM decide together. Name the swap here and your DM is told; the
    Devotion only changes when they say the road is walked.</p>`;

  // Abilities already written for a Devotion you can't hold yet — the clearest thing to walk toward
  const waiting = PAR.awaiting || [];
  if (waiting.length)
    h += `<div class="par-eng"><div class="par-eng-h"><b>Written for you, out of reach</b>
        <i>the abilities exist — the Devotion doesn't, yet</i></div><div class="cdx-defs">` +
      waiting.map(w => `<div class="cdx-def"><b>${esc(w.name)}</b>
        <span>Devotion of ${esc(w.cognitionName)} — ${esc(w.pilgrimage || (w.mastered
          ? "mastered; waiting for your DM to open it as a Devotion"
          : "not known at Learn Full yet, so a Pilgrimage is the road to it"))}</span></div>`).join("") + `</div></div>`;

  if (open) {
    h += `<div class="par-eng"><div class="par-eng-h"><b>On Pilgrimage</b>
        <i>${esc(PILGRIM_WORDS.asked)}</i></div>
      <p class="par-ab-t">${open.leaving ? `${esc(parPilName(open, "leaving"))} leaves you, and ` : ""}${esc(parPilName(open, "arriving"))} takes its place.</p>
      ${open.note ? `<p class="par-ab-f">“${esc(open.note)}”</p>` : ""}
      <div class="chips"><button class="chip" onclick="parWithdrawPilgrimage(${open.id})">Turn back</button></div></div>`;
  } else if (!near.length && !far.length) {
    h += `<p class="hint">There's nothing to walk toward — every Cognition is already a Devotion.</p>`;
  } else {
    h += `<form class="par-pil" onsubmit="return parAskPilgrimage(event)">
      <label>Leaving
        <select class="pick" id="pilLeaving">
          <option value="">— nothing, I have room</option>` +
          parPool().map(d => `<option value="${escQ(d.cognition)}">${escQ(parEntry(d.cognition).name)} — ${escQ(d.name)}${sworn.includes(d.cognition) ? " (sworn)" : ""}</option>`).join("") +
        `</select></label>
      <label>Arriving
        <select class="pick" id="pilArriving" required>` +
          (near.length ? `<optgroup label="Known at Learn Full">` +
            near.map(id => `<option value="${escQ(id)}">${escQ(parEntry(id).name)}</option>`).join("") + `</optgroup>` : "") +
          (far.length ? `<optgroup label="Not yet known — the Pilgrimage is how you reach it">` +
            far.map(n => `<option value="${escQ(n)}">${escQ(n)}</option>`).join("") + `</optgroup>` : "") +
        `</select></label>
      <label>The shape of the ritual — for your DM
        <textarea class="search par-ta" id="pilNote" rows="2" maxlength="600" placeholder="A vigil at a burning shrine · a month of silence · retracing the road where I first felt it stir"></textarea></label>
      <div class="chips"><button class="chip on" type="submit">Set out</button></div></form>`;
  }
  if (past.length)
    h += `<div class="cdx-defs" style="margin-top:10px">` + past.map(p =>
      `<div class="cdx-def"><b>${esc(parPilName(p, "arriving"))}</b><span>${p.leaving ? `in place of ${esc(parPilName(p, "leaving"))} · ` : ""}${esc(PILGRIM_WORDS[p.status] || p.status)}</span></div>`).join("") + `</div>`;
  return block("Pilgrimage", h);
}

async function parAskPilgrimage(e) {
  e.preventDefault();
  const leaving = document.getElementById("pilLeaving").value || null;
  const arriving = document.getElementById("pilArriving").value;
  const note = document.getElementById("pilNote").value;
  try {
    await api("POST", "api/paragon/pilgrimage", { leaving, arriving, note });
    await loadParagon();
    toast("Your DM has been told — the road is open");
    renderMain();
  } catch (err) { toast(err.message); }
  return false;
}
async function parWithdrawPilgrimage(id) {
  try {
    await api("DELETE", `api/paragon/pilgrimage/${id}`);
    await loadParagon();
    toast("You turned back");
    renderMain();
  } catch (err) { toast(err.message); }
}

// ═══════════════════════════════════════════════════════════
//  THE CARD — for copying, for an image, and for the Rings tab
// ═══════════════════════════════════════════════════════════
function parCardHTML(d) {
  const tier = getTier(state.charLevel), cog = parEntry(d.cognition);
  const off = (d.abilities?.offensive || [])[0];
  const dice = off && (parLine(off.tiers?.[tier]).match(/(\d+d\d+)/) || [])[1];

  let nums = `<span class="n atk"><b>${sgn(sealAttack())}</b><i>Paragon attack</i><u>proficiency + Verum mod</u></span>`;
  nums += `<span class="n dc"><b>${verumDC()}</b><i>${esc(d.savingThrow && d.savingThrow !== "—" ? d.savingThrow + " save" : "Paragon DC")}</i></span>`;
  if (dice) nums += `<span class="n dmg"><b>${dice}</b><i>${esc((d.damageType || "").toLowerCase())} · ${esc(off.name)}</i></span>`;
  nums += `<span class="n"><b>${parUsesNow()}/${parUsesMax()}</b><i>uses left</i></span>`;

  let h = `<div class="card paragon">
    <div class="c-name">${esc(state.par.name || d.name)}</div>
    <div class="c-sub">Paragon of ${esc(cog.name)} · ${esc(d.name)} · ${parRank(tier)} · level ${state.charLevel}</div>
    <div class="c-nums">${nums}</div>
    <div class="c-tags">${parSwornList().map(id =>
      `<span class="t${id === parActive() ? " hot" : ""}">${esc(parEntry(id).name)}${id === parActive() ? " · burning" : ""}</span>`).join("")}
      ${parPhase() ? `<span class="t">${parPhase().icon || ""} ${esc(parPhase().name)}</span>` : ""}</div>
    <div class="c-cost">Deeper Burn — until you Rotate or are incapacitated · Rotate is a Bonus Action and ends only Passives</div>`;
  if (d.description) h += `<div class="c-engine"><b>${esc(d.name)}</b>${esc(d.description)}</div>`;
  if (d.pilgrimage) h += `<div class="c-engine cond"><b>Pilgrimage required</b>${esc(d.pilgrimage)}</div>`;
  if (parPhase()) {
    const p = parPhase(), next = parPhases()[(parPhaseIndex() + 1) % parPhases().length];
    h += `<div class="c-sec"><div class="c-lbl">${esc(d.engine.title || "The engine")} · ${p.icon || ""} ${esc(p.name)}</div>
      <div class="c-core"><b>${esc(p.name)}</b>
        <div class="c-tier now"><span class="c-tl">now</span><span>${esc(parLine(p.tiers?.[tier] ?? p.card))}</span></div>
        <div class="c-tier"><span class="c-tl">next</span><span>${next.icon || ""} ${esc(next.name)}</span></div></div></div>`;
  }
  PAR_GROUP_ORDER.forEach(g => (d.abilities?.[g] || []).forEach(ab => {
    const rider = parRiderLine(d, ab, tier);
    h += `<div class="c-sec"><div class="c-lbl">${esc(ab.name)} · ${PAR_GROUPS[g].label}${ab.activation ? " · " + (PAR_ACTS[ab.activation] || ab.activation) : ""}</div>
      <div class="c-core"><b>${esc(ab.name)}</b>
        <div class="c-tier now"><span class="c-tl">${TIERS[tier].label}</span><span>${esc(parLine(ab.tiers?.[tier]))}</span></div>
        ${rider ? `<div class="c-tier now"><span class="c-tl">phase</span><span>${esc(rider)}</span></div>` : ""}
        <div class="c-tier"><span class="c-tl">rule</span><span>${esc(parResolve(ab.text || ""))}</span></div></div></div>`;
  }));
  return h + `<div class="c-foot">Offensive and Supportive abilities share ${parUsesMax()} uses per
    long rest across every Devotion · a Paragon can't use Arcanum Veritas, Ignitions or Eidons, and has no Blaze</div></div>`;
}

function parCardText(d) {
  const tier = getTier(state.charLevel), L = [];
  L.push(`${(state.par.name || d.name).toUpperCase()} · Paragon of ${parEntry(d.cognition).name}`);
  L.push(`${parRank(tier)} · Char Lv ${state.charLevel} · Paragon attack ${sgn(sealAttack())} · Paragon DC ${verumDC()}${d.savingThrow && d.savingThrow !== "—" ? ` (${d.savingThrow} save)` : ""}`);
  L.push(`DEVOTIONS — ${parSwornList().map(id => `${parEntry(id).name}${id === parActive() ? " (burning)" : ""}`).join(", ") || "none sworn"}`);
  L.push(`USES — ${parUsesNow()}/${parUsesMax()}, pooled across every Devotion, restored on a long rest`);
  if (parPhase()) L.push(`${(d.engine.unit || "PHASE").toUpperCase()} — ${parPhase().name}${parPhase().epithet ? ` (${parPhase().epithet})` : ""}: ${parLine(parPhase().tiers?.[tier] ?? parPhase().card)}`);
  if (d.pilgrimage) L.push(`⚠ ${d.pilgrimage}`);
  L.push("");
  PAR_GROUP_ORDER.forEach(g => (d.abilities?.[g] || []).forEach(ab => {
    L.push(`${ab.name.toUpperCase()} — ${PAR_GROUPS[g].label}${ab.activation ? ` · ${PAR_ACTS[ab.activation] || ab.activation}` : ""}${ab.uses ? ` · ${parResolve(ab.uses)} use(s)` : ""}`);
    if (ab.text) L.push(`  ${parResolve(ab.text)}`);
    L.push(`  ▸ ${TIERS[tier].label}: ${parLine(ab.tiers?.[tier])}`);
    const rider = parRiderLine(d, ab, tier);
    if (rider) L.push(`  ▸ ${rider}`);
  }));
  L.push("");
  L.push("Deeper Burn — until you Rotate or are incapacitated. Rotate is a Bonus Action and ends only Passives.");
  return L;
}

// ═══════════════════════════════════════════════════════════
//  THE RULES DRAWER
// ═══════════════════════════════════════════════════════════
function parRules() {
  return `<details class="rules"><summary>Rules of the Paragon path</summary><div class="rules-b">
    <h3>Numbers</h3><ul>
      <li><strong>Requirement</strong> — a Dream Score of 13+, and at least three Cognitions known at Learn Full.</li>
      <li><strong>Devotions</strong> — three Cognitions you know at Learn Full, dedicated to your soul. A Devotion that isn't your Paragon grants nothing on its own.</li>
      <li><strong>The Paragon</strong> — one Devotion held in a Deeper Burn. Never more than one.</li>
      <li><strong>Deeper Burn</strong> — lasts until you Rotate or are incapacitated, not 1 minute like an ordinary Burn.</li>
      <li><strong>Rotate</strong> — a Bonus Action to change your Paragon to another Devotion. It ends only <strong>Passive</strong> abilities.</li>
      <li><strong>Paragon DC</strong> — your Verum DC: 8 + Proficiency Bonus + Verum mod + Dream mod (${verumDC()} right now).</li>
      <li><strong>Paragon attack</strong> — Proficiency Bonus + Verum mod (${sgn(sealAttack())} right now).</li>
      <li><strong>Ranks</strong> — abilities improve at Ranks I–IV (levels 1, 5, 11, 17). They never depend on spell slots.</li>
      <li><strong>Path lockout</strong> — no Arcanum Veritas, no Ignitions, no Eidons, no Blaze Points.</li>
    </ul>
    <h3>At the table</h3><ul>
      <li><strong>Only while burning</strong> — an ability works, and a Passive is on, only while its Cognition is your Paragon.</li>
      <li><strong>The Cognition's own rules apply</strong> — whatever it charges as a seal's Core it charges here: Blood's toll, Sun's Corruption, Nightmare's Dream save, Lunar's phase. They're listed under the burning Devotion.</li>
      <li><strong>Relighting</strong> — if the Burn goes out because you were incapacitated, relight any Devotion with a Bonus Action on a later turn.</li>
      <li><strong>Visible</strong> — your Paragon marks you somehow, and anyone with Cognitive Sense can tell which Cognition you hold.</li>
      <li><strong>Pilgrimage</strong> — a downtime ritual replaces one Devotion with another Cognition you know at Learn Full. Your DM gets advance notice.</li>
      <li><strong>Abilities are personal</strong> — built for each player with their DM. Two Paragons of one Cognition may resonate with different parts of it.</li>
    </ul>
  </div></details>`;
}

// ═══════════════════════════════════════════════════════════
//  PARAGON REFERENCE — the Rings tab, in Paragon mode
// ═══════════════════════════════════════════════════════════
function parRefPages() { return [
  { key: "overview", label: "The Paragon path", grp: "The system", body: () => `
    <p class="cdx-desc">The sorcerer holds a thousand candles and tends none of them. The Paragon holds one, and the whole night bends toward it.</p>
    <div class="cdx-sec"><h2>Quick reference</h2><div class="cdx-defs">
      <div class="cdx-def"><b>Requirement</b><span>A Dream Score of 13+, and at least three Cognitions known at Learn Full.</span></div>
      <div class="cdx-def"><b>Devotions</b><span>Three Cognitions you know at Learn Full, dedicated to your soul. Your DM opens which ones you may swear.</span></div>
      <div class="cdx-def"><b>The Paragon</b><span>One Devotion held in a Deeper Burn. You can never hold more than one.</span></div>
      <div class="cdx-def"><b>Deeper Burn</b><span>Lasts until you Rotate or are incapacitated.</span></div>
      <div class="cdx-def"><b>Rotate</b><span>Bonus Action — change your Paragon to another Devotion. Ends only Passive abilities.</span></div>
      <div class="cdx-def"><b>Paragon Abilities</b><span>Stronger, more rigid Verum Effects of your Paragon, built for you: Passive, Offensive or Supportive, scaling by Rank.</span></div>
      <div class="cdx-def"><b>Paragon DC</b><span>Your Verum DC — 8 + Proficiency Bonus + Verum mod + Dream mod (${verumDC()} right now).</span></div>
      <div class="cdx-def"><b>Paragon attack</b><span>Proficiency Bonus + Verum mod (${sgn(sealAttack())} right now).</span></div>
      <div class="cdx-def"><b>Pilgrimage</b><span>A downtime ritual: replace one Devotion with another Cognition you know.</span></div>
      <div class="cdx-def"><b>Path lockout</b><span>No Arcanum Veritas, no Ignitions, no Eidons, no Blaze Points.</span></div>
    </div></div>
    <div class="cdx-sec"><h2>Walking the path</h2><div class="cdx-note">
      <p>Becoming a Paragon is a choice of identity, not a lesson you learn. Instead of learning to draw a Cognition in a hundred shapes, the Paragon gives their soul to the few Cognitions that feel like home and lets one of them burn inside them all the time. The result is narrower than the other paths, and far heavier.</p>
      <p>When you take the path, it closes off the others. A Paragon's soul has no room left for any other way of channelling a Cognition — the path suits anyone who wants a Cognition's power without keeping track of a magic system: the warrior who <em>is</em> the flame rather than the one who wields it.</p>
    </div></div>` },
  { key: "burn", label: "Deeper Burn &amp; Rotate", grp: "The system", body: () => `
    <div class="cdx-sec"><h2>The Deeper Burn</h2><p class="cdx-rings">A normal Burn is shallow and brief: a Cognition flares for a minute, and a warrior can keep several burning at once. A Deeper Burn goes all the way to the soul.</p>
      <div class="cdx-defs">
      <div class="cdx-def"><b>One at a time</b><span>You can hold only one Paragon. Setting a new one extinguishes the old.</span></div>
      <div class="cdx-def"><b>Enduring</b><span>It stays lit until you Rotate or become incapacitated — it doesn't expire after 1 minute.</span></div>
      <div class="cdx-def"><b>Relighting</b><span>If it goes out because you were incapacitated, relight any Devotion as your Paragon with a Bonus Action on a later turn.</span></div>
      <div class="cdx-def"><b>Visible</b><span>It marks you somehow — embers in your breath, a stillness in the air, a faint ring of light at your feet. Creatures with Cognitive Sense can tell which Cognition you're holding.</span></div>
    </div></div>
    <div class="cdx-sec"><h2>Rotate</h2><div class="cdx-note">
      <p>As a Bonus Action on your turn you can Rotate: extinguish your current Paragon and set one of your other Devotions in its place. The new Paragon's abilities are available right away.</p>
      <p>Rotating ends only the old Paragon's <strong>Passive</strong> abilities. Anything its Offensive or Supportive abilities already set in motion — a creature left Ablaze, an ally wreathed in flame — keeps going until its own duration ends.</p>
      <p>Rotating is the Paragon's tactics. A Paragon doesn't choose which spell to cast. They choose <em>who to be</em> this round, and that costs them part of their turn.</p>
    </div></div>` },
  { key: "abilities", label: "Paragon Abilities", grp: "The system", body: () => `
    <p class="cdx-desc">Verum Effects that have been deepened: stronger than anything a seal or an Eidon draws from the same Cognition, and fixed in shape.</p>
    <div class="cdx-sec"><h2>The three types</h2><div class="cdx-defs">` +
      Object.values(PAR_GROUPS).map(t => `<div class="cdx-def"><b>${t.label}</b><span>${t.hint.charAt(0).toUpperCase() + t.hint.slice(1)}.</span></div>`).join("") +
    `</div></div>
    <div class="cdx-sec"><h2>How they work</h2><div class="cdx-defs">
      <div class="cdx-def"><b>Personal</b><span>Built for each player, and written in <code>cognitions/devotions/<player>_<cognition>_devotion.json</code> beside the Cognitions themselves. Two Paragons of the same Cognition may resonate with different parts of it — one hears Fire as fury, the other as the hearth.</span></div>
      <div class="cdx-def"><b>Scale by Rank</b><span>Ranks I–IV at levels 1, 5, 11 and 17 — the same ladder Verum Effects use. Never spell slots.</span></div>
      <div class="cdx-def"><b>DC and attack</b><span>A save uses your Verum DC (${verumDC()}); an attack roll adds your Paragon Attack Bonus (${sgn(sealAttack())}).</span></div>
      <div class="cdx-def"><b>Only while burning</b><span>You can activate an ability, and a Passive works, only while its Cognition is your current Paragon.</span></div>
      <div class="cdx-def"><b>The Cognition's own rules apply</b><span>Whatever a Cognition charges or depends on as a seal's Core applies here too — Blood's toll, Sun's Corruption, Nightmare's Dream save, Lunar's phase. The sheet lists them under the burning Devotion.</span></div>
      <div class="cdx-def"><b>Uses</b><span>The rules call activation costs and uses placeholders until the Paragon Ability guideline is finished. This tracker pools them the way Zeke's sheet does: Offensive and Supportive abilities share Proficiency Bonus uses per long rest across every Devotion.</span></div>
    </div></div>
    <div class="cdx-sec"><h2>Pilgrimage</h2><div class="cdx-note">
      <p>Your Devotions can change, but not casually. To replace one with another Cognition you know at Learn Full you undertake a Pilgrimage: a personal ritual performed over downtime — a vigil at a burning shrine, a month of silence, retracing the road where you first felt the new Cognition stir.</p>
      <p>When it's complete the old Devotion leaves you and the new one takes its place. Name the swap on your sheet: your DM is told, and answers it when the road is walked.</p>
    </div></div>` },
  ...parPool().map(parRefPage("Your Devotions")),
  ...(PAR.examples || []).map(parRefPage("Worked examples")),
  ];
}
const parRefPage = grp => d => ({
  key: `${grp === "Worked examples" ? "eg" : "mine"}:${d.id}`,
  label: d.name, grp,
  title: `${d.name} — Devotion of ${parEntry(d.cognition).name}`,
  body: () => parDevotionRef(d),
});

function parDevotionRef(d) {
  const tier = getTier(state.charLevel);
  let h = `<p class="cdx-desc">${esc(d.description || "")}</p>
    <div class="cdx-sec"><div class="cdx-defs">
      <div class="cdx-def"><b>Cognition</b><span>${esc(parEntry(d.cognition).name)}</span></div>
      <div class="cdx-def"><b>Save</b><span>${esc(d.savingThrow && d.savingThrow !== "—" ? `${d.savingThrow} — against your Verum DC (${verumDC()})` : "No save of its own")}</span></div>
      <div class="cdx-def"><b>Damage</b><span>${esc(d.damageType && d.damageType !== "—" ? d.damageType : "None of its own")}</span></div>
      <div class="cdx-def"><b>Written for</b><span>${esc(d.source || (d.example ? "the Paragon rules" : "you"))}</span></div>
    </div></div>`;
  if (d.pilgrimage) h += `<div class="cdx-sec"><div class="cdx-note"><p>⚠ ${esc(d.pilgrimage)}</p></div></div>`;
  if (d.engine?.phases?.length) {
    h += `<div class="cdx-sec"><h2>${esc(d.engine.title || "The engine")}</h2>
      <p class="cdx-rings">${esc(parResolve(d.engine.text || ""))}</p>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>${esc(d.engine.unit || "Phase")}</th><th>In combat</th><th>Out of combat</th></tr></thead><tbody>` +
      d.engine.phases.map(p => `<tr><td>${p.icon || ""} <strong>${esc(p.name)}</strong>${p.epithet ? `<br>${esc(p.epithet)}` : ""}</td>
        <td class="wrap">${esc(parLine(p.tiers?.[tier] ?? p.card))}</td><td class="wrap">${esc(p.calm || "—")}</td></tr>`).join("") +
      `</tbody></table></div></div>`;
    if (d.engine.tiers) h += `<div class="cdx-sec"><h2>${esc(d.engine.title || "The engine")} by Rank</h2>${parLadder(d.engine.tiers, tier)}</div>`;
  }
  PAR_GROUP_ORDER.forEach(g => (d.abilities?.[g] || []).forEach(ab => {
    h += `<div class="cdx-sec"><h2>${esc(ab.name)}</h2>
      <div class="c-tags"><span class="t ${g === "passive" ? "" : "hot"}">${PAR_GROUPS[g].label}</span>
        ${ab.activation ? `<span class="t">${PAR_ACTS[ab.activation] || esc(ab.activation)}</span>` : ""}
        ${ab.uses ? `<span class="t">${esc(parResolve(ab.uses))} use${String(ab.uses) === "1" ? "" : "s"}</span>` : ""}</div>
      <p class="cdx-rings">${esc(parResolve(ab.text || ""))} <em>${esc(PAR_GROUPS[g].hint)}.</em></p>`;
    const rider = ab.rider && ab.rider !== "phase" ? ab.rider : null;
    if (rider && d.engine?.phases?.length) {
      h += `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>${esc(d.engine.unit || "Phase")}</th><th>Effect</th></tr></thead><tbody>` +
        d.engine.phases.map(p => {
          const line = p.riders?.[rider];
          return `<tr><td>${p.icon || ""} ${esc(p.name)}</td><td class="wrap">${esc(line ? parLine(Array.isArray(line) ? (line[tier] ?? line[line.length - 1]) : line) : "—")}</td></tr>`;
        }).join("") + `</tbody></table></div>`;
    }
    h += parLadder(ab.tiers, tier) + `</div>`;
  }));
  return h;
}

function renderParRefList() {
  const box = document.getElementById("ringList"); if (!box) return;
  const on = state.parRef || "overview";
  let grp = "", h = "";
  parRefPages().forEach(s => {
    if (s.grp !== grp) { grp = s.grp; h += `<div class="rail-grp">${grp}</div>`; }
    h += `<button class="cog${s.key === on ? " core" : ""}" onclick="openParRef('${escAttr(s.key)}')"><span class="nm">${s.label}</span></button>`;
  });
  box.innerHTML = h;
}
function renderParRef() {
  const host = document.getElementById("ringBody"); if (!host) return;
  const pages = parRefPages();
  const s = pages.find(x => x.key === (state.parRef || "overview")) || pages[0];
  host.innerHTML = `<div class="cdx"><div class="cdx-hd"><div><h1>${s.title || s.label}</h1></div></div>${s.body()}</div>`;
}
function openParRef(k) { state.parRef = k; renderParRefList(); renderParRef(); document.getElementById("ringBody").scrollTop = 0; }

// ── Saving a Paragon: the three sworn, which one burns, and where the engine stands
function parSnapshot() {
  const three = parSwornList();
  if (!three.length) return null;
  return { devotions: three, paragon: parActive(), wheel: { ...state.par.wheel } };
}
