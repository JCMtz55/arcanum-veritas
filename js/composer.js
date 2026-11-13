// Arcanum Veritas Builder — The composer and everything you select in it

// ═══════════════════════════════════════════════════════════
//  COMPOSER
// ═══════════════════════════════════════════════════════════
function block(title, body) {
  return `<div class="blk"><div class="blk-h"><h2>${title}</h2><div class="rule"></div></div>${body}</div>`;
}

function renderMain() {
  const comp = document.getElementById("composer");
  const seal = document.getElementById("sumBody");
  syncBar();
  // Codex and Rings resolve formulas off the same bar, so they re-read whenever it moves
  if (state.view === "codex") renderCodex();
  if (state.view === "rings") renderRing();
  const main = mode().main;
  if (main) return main();

  if (!state.core) {
    comp.innerHTML = pathWarning() + rulesDrawer() + `<div class="empty">
      Pick a cognition from the left to set your Keystone. Everything else follows from it.</div>` + savedHome();
    seal.innerHTML = `<div class="empty">No seal drawn yet.</div>`;
    return;
  }

  const coreCog = LOADED[state.core];
  const tier    = getTier(state.charLevel);
  comp.innerHTML = pathWarning() + rulesDrawer() + buildComposer(coreCog, tier);

  if (!state.compType || !state.compSub || !currentSub()) {
    seal.innerHTML = `<div class="empty">Choose a Ring to draw the seal.</div>`;
    seal.dataset.text = "";
  } else {
    seal.innerHTML = state.sumMode === "play"
      ? buildPlayCardHTML(coreCog, tier)
      : `<div class="raw">${buildFullRef(coreCog, tier).join("\n")}</div>`;
    seal.dataset.text = buildPlayCard(coreCog, tier).join("\n");
  }
  document.getElementById("mPlay").className = "mini" + (state.sumMode === "play" ? " on" : "");
  document.getElementById("mFull").className = "mini" + (state.sumMode === "full" ? " on" : "");
}

function buildComposer(coreCog, tier) {
  const cd  = COMP_DATA[state.compType];
  const sub = currentSub();
  let h = "";

  // The seal's own name — optional; the card falls back to the Core's
  h += block("Name your seal", `<input class="search eidon-name" type="text" placeholder="Name your seal — or leave it as ${esc(INDEX.find(c => c.id === state.core)?.name || "its Core")}"
    value="${esc(state.sealName || "").replace(/"/g, "&quot;")}" oninput="sealName(this.value)">`);

  // Ring family — only the ones this Core can fill
  const rings = availableRings(coreCog);
  if (!rings.length) {
    return block("Ring — what shape the seal takes",
      `<p class="hint">${esc(INDEX.find(c => c.id === state.core)?.name || "This cognition")}
       has no Verum effects written yet, so it can't take a Ring.</p>`);
  }
  h += block("Ring — what shape the seal takes", `<div class="rings">` +
    rings.map(k => {
      const d = COMP_DATA[k];
      return `<button class="ring ${k}${state.compType === k ? " on" : ""}" onclick="selectCompType('${k}')">
        <b>${d.label}</b><span>${d.desc}</span></button>`;
    }).join("") + `</div>`);

  if (!state.compType) return h;

  // Subtype — likewise, only the ones with a pool behind them
  const subs = availableSubs(coreCog, state.compType);
  h += block("Subtype", `<div class="chips">` +
    subs.map(sk =>
      `<button class="chip${state.compSub === sk ? " on" : ""}" onclick="selectCompSub('${escAttr(sk)}')">${sk}</button>`
    ).join("") + `</div>`);

  if (!state.compSub || !sub) return h;

  // Shape + Manner side by side
  let opts = "";
  if (sub.shape) opts += `<div><div class="blk-h"><h2>Shape</h2><div class="rule"></div></div>
    <div class="chips">${Object.entries(SHAPES).map(([k, sh]) =>
      `<button class="chip${state.shape === k ? " on" : ""}" onclick="selectShape('${k}')">${sh.label}</button>`).join("")}</div>
    <p class="hint">${SHAPES[state.shape].desc}</p></div>`;
  opts += `<div><div class="blk-h"><h2>Manner of drawing</h2><div class="rule"></div></div>
    <div class="chips">${Object.entries(MANNERS).map(([k, m]) =>
      `<button class="chip${state.manner === k ? " on" : ""}${mannerAllowed(k) ? "" : " dis"}" onclick="selectManner('${k}')">${m.label}</button>`).join("")}</div>
    <p class="hint">${MANNERS[state.manner].desc}</p></div>`;
  h += `<div class="blk grid2">${opts}</div>`;

  // The Core's cycle, if it has one — every seal resolves in the phase you're in
  const phz = phaseOf(coreCog);
  if (phz) h += block(esc(coreCog.engine.title), `<div class="chips">` + phz.all.map((p, i) =>
      `<button class="chip${i === phz.index ? " on" : ""}" onclick="selectPhase(${i})">${esc(p.name)}</button>`).join("") +
    `</div><p class="hint"><strong>${esc(phz.now.epithet || phz.now.name)}</strong> — ${esc(resolve(phz.now.card))}. Then turn the Moon to ${esc(phz.next.name)} or ${esc(phz.prev.name)}.</p>`);

  // The Core's tracker, if it keeps one — where this activation falls, and what the 4th brings
  const trk = trackerOf(coreCog);
  if (trk) {
    const av0 = coreVerumOf(coreCog), fuel = av0?.fuel;
    let t = `<div class="chips">` + Array.from({ length: trk.win }, (_, i) => {
      if (i < trk.marks.length) return `<button class="chip pip ${trk.marks[i]}" onclick="markTrack(${i})" title="Click to flip Gold / Black, again to clear">${i + 1} · ${trk.marks[i] === "gold" ? "Gold" : "Black"}</button>`;
      if (i === trk.marks.length) return `<button class="chip pip now on" title="This activation">${i + 1} · now</button>`;
      return `<button class="chip pip dis">${i + 1}</button>`;
    }).join("") + `</div>`;
    t += `<div class="chips" style="margin-top:8px">
      <button class="chip${trk.now === "gold" ? " on" : ""}" onclick="setTrackNow('gold')">${esc(trk.tr.gold?.label || "Gold")}${fuel ? ` — spend ${fuel}` : ""}</button>
      <button class="chip${trk.now === "black" ? " on" : ""}" onclick="setTrackNow('black')">${esc(trk.tr.black?.label || "Black")} — can't pay</button>
      <button class="chip" onclick="logTrack()" title="You drew it — log this activation and move on">Log it ›</button>
      <button class="chip" onclick="resetTrack()">Reset</button></div>`;
    t += `<p class="hint">${esc(resolve((trk.now === "gold" ? trk.tr.gold : trk.tr.black)?.card || ""))}.` +
      (trk.last && trk.reck ? ` <strong>This is activation ${trk.win} — ${esc(trk.reck.name)}:</strong> ${esc(resolve(trk.reck.card))}.` +
        (trk.reck.corona && av0?.corona ? ` <strong>${esc(av0.corona.name)}.</strong>` : "")
      : ` Activation ${trk.n} of ${trk.win} — ${trk.win - trk.n} more before the Reckoning.`) + `</p>`;
    h += block(esc(trk.tr.name || "Tracker"), t);
  }

  // Verum effect + the tier ladder
  const verums = coreCog?.verumEffects?.[verumKey()] || [];
  if (verums.length) {
    let v = "";
    if (verums.length > 1) v += `<div class="chips" style="margin-bottom:9px">` + verums.map(e =>
      `<button class="chip${state.coreVerum === e.name ? " on" : ""}" onclick="selectCoreVerum('${escAttr(e.name)}')">${e.name}</button>`).join("") + `</div>`;
    const av = verums.find(e => e.name === state.coreVerum) || verums[0];
    v += `<div class="vname">${av.name}</div>` +
         `<p class="hint" style="margin:0 0 9px">${av.description || ""}</p><div class="ladder">` +
      av.tiers.map((t, i) => i > tier ? "" :
        `<div class="rung ${i === tier ? "now" : "past"}"><span class="lv">${TIERS[i].label}</span>
         <span>${resolve(partText(t))}</span></div>`).join("") + `</div>`;
    h += block(`Verum effect — ${verumLabel()} pool`, v);
  } else {
    h += block("Verum effect", `<p class="hint">${INDEX.find(c=>c.id===state.core)?.name} has no ${verumLabel()} effect yet.</p>`);
  }

  // Scaling — the whole ladder, current slot lit
  const row = sub.rows.find(r => r[0] === ORDINALS[state.slotLevel]);
  let sc = `<div class="scale">` + sub.rows.map(r =>
    `<button class="sl${r[0] === ORDINALS[state.slotLevel] ? " on" : ""}" onclick="bumpSlotTo(${ORDINALS.indexOf(r[0])})">
      <b>${r[0]}</b><span>${resolve(r[1])}</span></button>`).join("") + `</div>`;
  if (row) sc += `<p class="scale-note">` + sub.columns.map((c, i) => `${c}: <strong>${resolve(row[i])}</strong>`).join(" · ") + `</p>`;
  if (sub.notes) sc += `<p class="scale-note" style="font-style:italic">${sub.notes.split("\n")[0]}</p>`;
  h += block(`${state.compSub} — scaling`, sc);

  // Complements
  if (maxComps() > 0) {
    let c = "";
    state.complements.forEach((cs, idx) => {
      const cog = LOADED[cs.id], entry = INDEX.find(x => x.id === cs.id);
      if (!cog || !entry) return;
      const avail = complementPool(cog);
      if (avail.length && !avail.find(f => f.name === cs.compEffect)) cs.compEffect = avail[0].name;
      const fx = avail.find(f => f.name === cs.compEffect) || avail[0];
      const coven = idx >= state.slotLevel - 1;
      c += `<div class="cmp"><div class="cmp-h"><span class="ico">${cogIcon(entry)}</span><b>${entry.name}</b>
        <span class="tag">${coven ? "coven sigil" : "sigil " + (idx + 1)}</span></div>`;
      if (!fx) {
        c += `<div class="cmp-b"><span class="hint">No ${verumLabel()} complement for ${entry.name} yet.</span></div></div>`;
        return;
      }
      if (avail.length > 1) c += `<div class="cmp-b" style="padding-bottom:0"><div class="chips">` +
        avail.map(f => `<button class="chip${f.name === cs.compEffect ? " on" : ""}" onclick="selectCompEffect(${idx},'${escAttr(f.name)}')">${f.name}</button>`).join("") + `</div></div>`;
      c += `<div class="cmp-b">${resolve(partText(fx.effect))}` +
        liveUpgrades(fx.upgrades, tier).map(u => `<span class="cmp-up">${resolve(partText(u))}</span>`).join("") + `</div></div>`;
    });
    const free = maxComps() - state.complements.length;
    if (free > 0) c += `<p class="hint">${free} more sigil${free > 1 ? "s" : ""} available — add from the list on the left.</p>`;
    h += block("Sigils", c || `<p class="hint">No sigils yet. Add up to ${maxComps()} from the list on the left.</p>`);
  }

  h += benefitsBlock();
  return h;
}

// ═══════════════════════════════════════════════════════════
//  WHAT THE SEAL GRANTS
// ═══════════════════════════════════════════════════════════
// A seal that helps somebody else writes down what it hands them, once, here — and the character
// sheet casts it at the party. Everything else about a save is a recipe that grows with you; this
// is the one part that DOES something, so it is the one part the sheet reads back.
//
// The menu is the ENGINE's list, served from /api/mod-targets. It is never written out again in
// this file: a seal that could grant a row the sheet has no place for is the failure the engine
// warns about beside MOD_TARGET_IDS, and one list is the only defence against it.
let benefitMenuAsked = false;
function ensureBenefitMenu() {
  if (state.benefitMenu || benefitMenuAsked || !API) return;
  benefitMenuAsked = true;
  api("GET", "api/mod-targets")
    .then(m => { state.benefitMenu = m; renderMain(); })
    .catch(() => { benefitMenuAsked = false; });   // a static host simply never shows the block
}

function benefitsBlock() {
  ensureBenefitMenu();
  const M = state.benefitMenu;
  // No API behind this page means no sheets to cast at either, so the block is not a broken
  // control — it is simply not part of what this deployment does.
  if (!API || !M) return "";
  const list = state.benefits || [];
  const derives = [{ id: "", name: "a flat number" },
    { id: "prof", name: "my proficiency bonus" },
    ...["str", "dex", "con", "int", "wis", "cha", "dream"].map(id =>
      ({ id, name: `my ${ABIL_LONG[id]} modifier` }))];

  let b = `<p class="hint">Written once, cast from your character sheet: pick who it lands on and
    the sheet applies it for you. Leave it empty for a seal that only does what the card says.</p>`;

  const dur = (i, x) => `<select class="search ben-d" onchange="setBenefit(${i},'rounds',this.value)">
      <option value=""${x.rounds == null ? " selected" : ""}>until it is dropped</option>${
      (M.rounds || [1, 2, 3, 10, 100]).map(r =>
        `<option value="${r}"${Number(x.rounds) === r ? " selected" : ""}>${r} round${r > 1 ? "s" : ""}${
          r === 10 ? " (1 minute)" : r === 100 ? " (10 minutes)" : ""}</option>`).join("")}</select>`;

  b += list.map((x, i) => {
    const kind = x.kind || "modifier";
    // One row per kind, because they are genuinely different things: a bonus has a target and an
    // amount, a heal has dice and no duration, a resistance has a damage type, an extra Action has
    // a count. A single row that tried to be all four would be wrong three times out of four.
    let controls;
    if (kind === "heal" || kind === "tempHp") {
      controls = `<input class="search ben-dice" maxlength="12" placeholder="3d8, 2d6+4, 10"
          value="${escAttr(x.dice || "")}" aria-label="How much"
          onchange="setBenefit(${i},'dice',this.value)">
        <span class="ben-once">one-time — they roll it and take it</span>`;
    } else if (kind === "defence") {
      controls = `<select class="search ben-f" onchange="setBenefit(${i},'standing',this.value)">${
          (M.standings || []).map(s => `<option value="${s.id}"${s.id === x.standing ? " selected" : ""}>${esc(s.name)}</option>`).join("")}</select>
        <select class="search ben-t" onchange="setBenefit(${i},'dtype',this.value)">${
          (M.damageTypes || []).map(d => `<option value="${d.id}"${d.id === x.dtype ? " selected" : ""}>${esc(d.name)}</option>`).join("")}</select>
        ${dur(i, x)}`;
    } else if (kind === "advantage") {
      // Pointed at the same things a bonus is pointed at — the second d20 is the amount, so there
      // is no number to ask for.
      controls = `<select class="search ben-t" onchange="setBenefit(${i},'target',this.value)">${
          M.targets.map(t => `<option value="${escAttr(t.value)}"${t.value === x.target ? " selected" : ""}>${esc(t.label)}</option>`).join("")}</select>
        ${dur(i, x)}`;
    } else if (kind === "turn") {
      controls = `<select class="search ben-t" onchange="setBenefit(${i},'turnKind',this.value)">${
          (M.turnKinds || []).map(k => `<option value="${k}"${k === x.turnKind ? " selected" : ""}>${esc(k)}</option>`).join("")}</select>
        <select class="search ben-a" aria-label="How many" onchange="setBenefit(${i},'n',this.value)">${
          [1, 2, 3].map(n => `<option value="${n}"${Number(x.n || 1) === n ? " selected" : ""}>${n} extra</option>`).join("")}</select>
        ${dur(i, x)}`;
    } else {
      const flat = !x.from;
      controls = `<select class="search ben-t" onchange="setBenefit(${i},'target',this.value)">${
          M.targets.map(t => `<option value="${escAttr(t.value)}"${t.value === x.target ? " selected" : ""}>${esc(t.label)}</option>`).join("")}</select>
        <select class="search ben-f" onchange="setBenefit(${i},'from',this.value)">${
          derives.map(d => `<option value="${d.id}"${d.id === (x.from || "") ? " selected" : ""}>${esc(d.name)}</option>`).join("")}</select>
        ${flat
          ? `<input class="search ben-a" type="number" min="-30" max="30" value="${Number(x.amount) || 0}"
               aria-label="How much" onchange="setBenefit(${i},'amount',this.value)">`
          : `<select class="search ben-a" aria-label="How many times" onchange="setBenefit(${i},'times',this.value)">${
              [[0.5, "half of it"], [1, "just it"], [2, "twice it"], [3, "three times it"]].map(([v, n]) =>
                `<option value="${v}"${Number(x.times || 1) === v ? " selected" : ""}>${n}</option>`).join("")}</select>`}
        ${dur(i, x)}`;
    }

    return `<div class="ben">
      <div class="ben-r">
        <select class="search ben-k" onchange="setBenefit(${i},'kind',this.value)">${
          (M.kinds || []).map(k => `<option value="${k.id}"${k.id === kind ? " selected" : ""}>${esc(k.name)}</option>`).join("")}</select>
        <button class="mini" onclick="dropBenefit(${i})" title="Remove this benefit">✕</button>
      </div>
      <div class="ben-r">${controls}</div>
      <input class="search ben-n" maxlength="80" placeholder="A word about it — what the table hears"
        value="${escAttr(x.note || "")}" onchange="setBenefit(${i},'note',this.value)"></div>`;
  }).join("");

  const max = M.max || 6;
  b += list.length < max
    ? `<button class="mini on" onclick="addBenefit()">+ what it grants</button>`
    : `<p class="hint">${max} is as much as one seal carries.</p>`;
  if (list.some(x => x.from))
    b += `<p class="hint">A derived amount is worked out against <b>you</b>, at the moment you cast
      it, and the number that lands is frozen there — it stays what it was worth even after you
      level, or go down.</p>`;
  return block("What it grants", b);
}

const ABIL_LONG = { str: "Strength", dex: "Dexterity", con: "Constitution",
  int: "Intelligence", wis: "Wisdom", cha: "Charisma", dream: "Dream" };

function addBenefit() {
  const M = state.benefitMenu;
  state.benefits = [...(state.benefits || []),
    { kind: "modifier", target: M?.targets?.[0]?.value || "ac", amount: 1, rounds: 10, note: "" }];
  renderMain();
}
function dropBenefit(i) {
  state.benefits = (state.benefits || []).filter((_, n) => n !== i);
  renderMain();
}

// A fresh row of each kind, with the sensible thing already filled in. A heal starts at the Ring's
// OWN healing for this slot — the scaling table has been sitting right there saying "3d8 + VM" and
// making somebody retype it would be the app asking a question it can answer.
function blankOfKind(kind, M) {
  if (kind === "advantage")
    return { kind, target: M?.targets?.[0]?.value || "ac", rounds: 10, note: "" };
  if (kind === "heal" || kind === "tempHp")
    return { kind, dice: kind === "heal" ? ringHealing() : "", note: "" };
  if (kind === "defence")
    return { kind, standing: "resistant", dtype: M?.damageTypes?.[0]?.id || "fire", rounds: 10, note: "" };
  if (kind === "turn")
    return { kind, turnKind: "action", n: 1, rounds: 1, note: "" };
  return { kind: "modifier", target: M?.targets?.[0]?.value || "ac", amount: 1, rounds: 10, note: "" };
}

// What this Ring heals at this slot, as dice, with the Verum modifier already worked in. Returns ""
// for a Ring with no healing column, which is every Ring but Self and Ally.
function ringHealing() {
  const sub = COMP_DATA[state.compType]?.subtypes?.[state.compSub];
  if (!sub) return "";
  const i = ["Healing", "Healing / Target", "Absorb"].map(c => sub.columns.indexOf(c)).find(n => n >= 0);
  const row = sub.rows.find(r => r[0] === ORDINALS[state.slotLevel]);
  if (i == null || i < 0 || !row) return "";
  // "3d8 + VM" with the bar's Verum modifier substituted, which is what `resolve` is for.
  return String(resolve(row[i])).replace(/\s+/g, "");
}

function setBenefit(i, key, value) {
  const list = [...(state.benefits || [])];
  let x = { ...list[i] };
  if (key === "kind") {
    // A different kind is a different shape. Starting from a blank of the new kind is the only way
    // the row cannot keep a field that no longer means anything — a `target` left on a heal would
    // be invisible here and refused by the server.
    x = { ...blankOfKind(value, state.benefitMenu), note: x.note || "" };
  } else if (key === "amount") x.amount = Math.max(-30, Math.min(30, Math.trunc(Number(value) || 0)));
  else if (key === "n") x.n = Math.max(1, Math.min(3, Math.trunc(Number(value) || 1)));
  else if (key === "times") x.times = Number(value) || 1;
  else if (key === "rounds") x.rounds = value === "" ? null : Number(value);
  else if (key === "from") {
    // Switching between a flat number and a derived one swaps which control is shown, so this is
    // the one change inside a kind that has to redraw.
    if (value) { x.from = value; x.times = x.times || 1; x.amount = 0; }
    else { delete x.from; delete x.times; x.amount = x.amount || 1; }
  } else x[key] = value;
  list[i] = x;
  state.benefits = list;
  if (key === "from" || key === "kind") renderMain();   // the others are already what the control says
}

function bumpSlotTo(n) {
  state.slotLevel = n;
  state.complements = state.complements.slice(0, maxComps());
  syncBar(); renderCogList(); renderMain();
}

function rulesDrawer() {
  return `<details class="rules"><summary>Rules of the seal</summary><div class="rules-b">
    <h3>Numbers</h3><ul>${RULES.numbers.map(([k, v]) => `<li><strong>${k}</strong> — ${v}</li>`).join("")}</ul>
    <p class="prem">${RULES.premium}</p>
    <h3>Limits</h3><ul>${RULES.limits.map(x => `<li>${x}</li>`).join("")}</ul>
    <h3>Countering</h3><ul>${RULES.countering.map(x => `<li>${x}</li>`).join("")}</ul>
  </div></details>`;
}

// ═══════════════════════════════════════════════════════════
//  SELECTION
// ═══════════════════════════════════════════════════════════
async function toggleCog(id) {
  const pick = mode().pick;
  if (pick) return pick(id);
  const entry = INDEX.find(c => c.id === id);
  if (!entry || !entry.ready) return;

  if (state.core === id) {
    // Deselect core → reset everything
    state.core = null; state.coreVerum = null; state.sealName = "";
    state.compType = null; state.compSub = null; state.complements = []; state.benefits = [];
  } else if (state.complements.some(x => x.id === id)) {
    // Remove complement
    state.complements = state.complements.filter(x => x.id !== id);
  } else if (!state.core) {
    // Set as core — always allowed
    await loadCognition(id);
    state.core = id;
    state.coreVerum = null;
    state.compType = null; state.compSub = null; state.complements = [];
  } else {
    // Add complement if slot allows — and never one that is always Core
    if (entry.coreOnly || state.complements.length >= maxComps()) return;
    await loadCognition(id);
    state.complements.push({ id, compEffect: null });
  }

  renderCogList();
  renderMain();
}

// Typing the name updates only the card, so the field you're typing in keeps its focus
function sealName(v) {
  state.sealName = v;
  if (!state.core || !state.compType || !state.compSub || !currentSub()) return;
  const seal = document.getElementById("sumBody"), coreCog = LOADED[state.core], tier = getTier(state.charLevel);
  seal.innerHTML = state.sumMode === "play" ? buildPlayCardHTML(coreCog, tier) : `<div class="raw">${buildFullRef(coreCog, tier).join("\n")}</div>`;
  seal.dataset.text = buildPlayCard(coreCog, tier).join("\n");
}

function clearAll() {
  const clear = mode().clear;   // Ignition puts every Burn out; the Paragon lets its Devotions go
  if (clear) { clear(); renderCogList(); renderMain(); return; }
  state.core = null; state.coreVerum = null; state.sealName = "";
  state.compType = null; state.compSub = null; state.complements = []; state.benefits = [];
  renderCogList(); renderMain();
}

// ═══════════════════════════════════════════════════════════
//  COMPOSITION SELECTION
// ═══════════════════════════════════════════════════════════
function selectCompType(type) {
  const coreCog0 = LOADED[state.core];
  state.compType = type;
  state.compSub  = availableSubs(coreCog0, type)[0] || Object.keys(COMP_DATA[type].subtypes)[0];
  state.complements = state.complements.map(c => ({ ...c, compEffect: null }));
  // Auto-select first verum effect for this composition type (pure state, not in render)
  state.shape = "sphere";
  if (!mannerAllowed(state.manner)) state.manner = "standard";
  const coreCog = LOADED[state.core];
  const effects = coreCog?.verumEffects?.[verumKey()] || [];
  state.coreVerum = effects.length > 0 ? effects[0].name : null;
  renderMain();
}

function selectCompSub(sub) {
  state.compSub = sub;
  state.shape = "sphere";
  if (!mannerAllowed(state.manner)) state.manner = "standard";
  const coreCog = LOADED[state.core];
  const effects = coreCog?.verumEffects?.[verumKey()] || [];
  if (!effects.find(e => e.name === state.coreVerum)) state.coreVerum = effects.length ? effects[0].name : null;
  renderMain();
}

function selectShape(sh)  { state.shape = sh; renderMain(); }
function selectPhase(i)   { state.phase = i; renderMain(); }
// A Core with a cycle (Lunar's phases): where it stands now, and what comes next
// Cognition-wide abilities the character has reached (mastery.traits, each with a level)
function masteryOf(cog) {
  return (cog?.mastery?.traits || []).filter(tr => (tr.level || 1) <= state.charLevel);
}
// A Core that keeps a running tally (Sun's Two Suns): this activation's number, Gold or Black,
// and — on the last one of the window — the Reckoning it brings
function trackerOf(cog) {
  const tr = cog?.engine?.tracker; if (!tr) return null;
  const win   = tr.window || 4;
  const marks = (state.track.marks || []).slice(0, win - 1);
  const n     = marks.length + 1;
  const now   = state.track.now === "black" ? "black" : "gold";
  const blacks = [...marks, now].filter(m => m === "black").length;
  const last  = n === win;
  const reck  = last ? (tr.reckoning || []).find(r => blacks >= r.min && blacks <= r.max) : null;
  return { tr, win, marks, n, now, blacks, last, reck };
}
function coreVerumOf(cog) {
  const vs = cog?.verumEffects?.[verumKey()] || [];
  return vs.find(v => v.name === state.coreVerum) || vs[0] || null;
}
// Click a logged pip to flip it Gold ↔ Black; the next empty pip logs a Gold; clicking the last logged one twice clears it
function markTrack(i) {
  const m = state.track.marks;
  if (i < m.length) { if (m[i] === "gold") m[i] = "black"; else m.splice(i); }
  else if (i === m.length) m.push("gold");
  renderMain();
}
function setTrackNow(v) { state.track.now = v; renderMain(); }
// After drawing: log this activation and move on (the Reckoning resets the window)
function logTrack() {
  const trk = trackerOf(LOADED[state.core]); if (!trk) return;
  state.track.marks = trk.last ? [] : [...trk.marks, trk.now];
  state.track.now = "gold";
  renderMain();
}
function resetTrack() { state.track = { marks: [], now: "gold" }; renderMain(); }
function phaseOf(cog) {
  const ph = cog?.engine?.phases; if (!ph?.length) return null;
  const i = Math.min(state.phase || 0, ph.length - 1);
  return { now: ph[i], next: ph[(i + 1) % ph.length], prev: ph[(i - 1 + ph.length) % ph.length], index: i, all: ph };
}
function selectManner(m)  {
  if (!mannerAllowed(m)) return;
  state.manner = m;
  state.complements = state.complements.slice(0, maxComps());
  syncBar(); renderCogList(); renderMain();
}

function selectCoreVerum(name) {
  state.coreVerum = name;
  renderMain();
}

function selectCompEffect(idx, name) {
  state.complements[idx].compEffect = name;
  renderMain();
}
