// Arcanum Veritas Builder — State, formula helpers, boot, and the command bar

// ═══════════════════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════════════════
let INDEX  = [];
let LOADED = {};

const state = {
  slotLevel:   1,   // spell slot (1–9) — controls cognition count
  charLevel:   1,   // character level (1–20) — controls tier
  core:        null,
  coreVerum:   null,
  compType:    null,
  compSub:     null,
  complements: [],  // [{id, compEffect}]
  verumMod:    4,
  dreamMod:    0,
  sumMode:     "play",    // "play" | "full"
  shape:       "sphere",   // for Rings flagged shape:true
  manner:      "standard", // Manners of Drawing
  view:        "composer", // "composer" | "codex" | "rings"
  codexId:     null,       // which cognition the Codex is reading
  ringRef:     null,       // {type, sub} — which Ring the Rings tab is reading
  dmgRef:      "overview", // which damage type the Damage tab is reading
  filter:      null,       // domain filter, shared by both rails; null = all
  phase:       0,          // where a cycling Core (Lunar) stands in its cycle
  sealName:    "",         // the player's own name for the seal (optional)
  track:       { marks: [], now: "gold" }, // a tracker Core (Sun): activations logged this window, and this one
};

// Which Verum / Complement pool a Ring draws from.
// A Cognition that defines its own `creation` / `utility` pool uses it; otherwise the Ring's
// fallback mapping applies (Structure/Object → control, Construct → offensive, Utility → supportive).
function poolFor(cog, type, sub) {
  const cd = COMP_DATA[type]; if (!cd) return type;
  if (cog?.verumEffects?.[type]?.length) return type;
  const s = cd.subtypes[sub];
  return (s && s.verumKey) || cd.verumKey || type;
}
function verumKey(cog) {
  return poolFor(cog || LOADED[state.core], state.compType, state.compSub);
}
// A Ring is only offered when the Core can actually fill it — its own pool, or the
// pool it falls back to. Subtypes of one family can resolve differently
// (Construct → offensive, Structure / Object → control), so each is checked on its own.
function subHasVerum(cog, type, sub) {
  if (cog?.incompatible?.includes(type)) return false;   // a declared incompatibility beats the fallback map
  return !!(cog?.verumEffects?.[poolFor(cog, type, sub)]?.length);
}
function availableSubs(cog, type) {
  return Object.keys(COMP_DATA[type]?.subtypes || {}).filter(sk => subHasVerum(cog, type, sk));
}
function availableRings(cog) {
  return Object.keys(COMP_DATA).filter(k => availableSubs(cog, k).length > 0);
}
function verumLabel(cog) { return COMP_DATA[verumKey(cog)]?.label || ""; }
// Complement effects: a native type ("Creation" / "Utility") wins; else the fallback pool's label
function complementPool(cog) {
  const native = COMP_DATA[state.compType]?.label || "";
  const list = cog?.complementEffects || [];
  const nat = list.filter(fx => fx.type.toLowerCase() === native.toLowerCase());
  if (nat.length) return nat;
  const fb = verumLabel().toLowerCase();
  return list.filter(fx => fx.type.toLowerCase() === fb);
}
// Complement budget: slot − 1, plus up to three from Coven Drawing
function maxComps() { return state.slotLevel - 1 + (state.manner === "coven" ? 3 : 0); }
function currentSub() { return COMP_DATA[state.compType]?.subtypes?.[state.compSub]; }
// ── Schema tolerance: a tier / effect may be a plain string (v1) or {text, card, mech} (v2)
function partText(p) { return (p && typeof p === "object") ? (p.text || "") : (p || ""); }
function partCard(p) { return (p && typeof p === "object") ? (p.card || null) : null; }
function partMech(p) { return (p && typeof p === "object") ? (p.mech || null) : null; }
// PLAY card prefers the authored card line; falls back to compressing the prose
function cardLine(p) {
  const c = partCard(p);
  return c ? resolve(c) : compact(resolve(partText(p)));
}
// Core tiers accumulate: everything up to the live tier applies, oldest first.
// A dice ladder is the exception — each tier restates the total — so when a later reached
// tier restates bonusDice, an earlier tier's "+N dice" lead is dropped rather than read as extra.
function coreLadder(av, tier) {
  const top = Math.min(tier, (av?.tiers?.length || 0) - 1), out = [];
  for (let i = 0; i <= top; i++) {
    let line = cardLine(av.tiers[i]);
    const restated = av.tiers.slice(i + 1, top + 1)
      .some(t => typeof partMech(t)?.damage?.bonusDice === "number");
    if (restated) line = line.replace(/^\s*\+\s*\d+\s*(?:dice|die)\b\s*(?:·\s*)?/i, "");
    if (line.trim()) out.push({ label: TIERS[i].label, line, now: i === top });
  }
  return out;
}
// ── Derived numbers ────────────────────────────────────────
function profBonus()  { return Math.ceil(state.charLevel / 4) + 1; }
function sealAttack() { return profBonus() + state.verumMod; }
function verumDC()    { return 8 + profBonus() + state.verumMod + state.dreamMod; }
function sgn(n)       { return (n >= 0 ? "+" : "") + n; }
// Resolve the formula shorthands the tables and effect text use
function resolve(str) {
  if (!str) return str;
  const vm = state.verumMod, pb = profBonus(), dc = verumDC();
  return String(str)
    .replace(/2\s*×\s*\{VM\}\s*\+\s*\{PB\}/g, `${2*vm + pb}`)
    .replace(/\{VM\}\s*\+\s*\{PB\}/g, `${vm + pb}`)
    .replace(/\{PB\}\s*\+\s*\{VM\}/g, `${vm + pb}`)
    .replace(/\{VM\}\s*\+\s*\{SLOT\}/g, `${vm + state.slotLevel}`)
    .replace(/(\d+)\s*×\s*\{SLOT\}/g, (m, n) => `${(+n) * state.slotLevel}`)
    .replace(/\{SLOT\}/g, `${state.slotLevel}`)
    .replace(/\{DC\}/g, `DC ${dc}`)
    .replace(/\{ATK\}/g, sgn(pb + vm))
    .replace(/\{VM\}/g, `${vm}`)
    .replace(/\{PB\}/g, `${pb}`)
    // multipliers of the Verum Modifier resolve to a real number
    .replace(/(\d+)\s*[×x]\s*VM\b/g, (m, n) => `${(+n) * vm}`)
    .replace(/\b(two|three|four|five|six|seven|eight|nine|ten)\s+times\s+your\s+Verum\s+Modifier/gi,
             (m, w) => `${({two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10})[w.toLowerCase()] * vm}`)
    // specific phrasings first, so the general ones can't mangle them
    .replace(/\(DC equals your Verum DC\)/gi, `(DC ${dc})`)
    .replace(/against your Verum DC/gi, `vs DC ${dc}`)
    .replace(/your Verum DC/gi, `DC ${dc}`)
    // the spellcasting modifier is the Verum Modifier in this system — resolve it outright
    .replace(/twice your spellcasting modifier \+ your proficiency bonus/gi, `${2*vm + pb}`)
    .replace(/your spellcasting modifier \+ your proficiency bonus/gi, `${vm + pb}`)
    .replace(/twice your spellcasting modifier/gi, `${2*vm}`)
    .replace(/your spellcasting modifier/gi, `${vm}`)
    .replace(/twice your (Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) modifier \+ your proficiency bonus/gi, (m,a)=>`2×${a.slice(0,3)}+${pb}`)
    .replace(/your (Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) modifier \+ your proficiency bonus/gi, (m,a)=>`${a.slice(0,3)}+${pb}`)
    .replace(/twice your proficiency bonus/gi, `${pb*2}`)
    .replace(/\+\s*your proficiency bonus/gi, `+${pb}`)
    .replace(/your proficiency bonus/gi, `${pb}`)
    .replace(/twice your Verum Modifier/gi, `${vm*2}`)
    .replace(/\+\s*your Verum Modifier/gi, `+${vm}`)
    .replace(/your Verum Modifier/gi, `${vm}`)
    .replace(/\s*\+\s*VM\b/g, sgn(vm))
    .replace(/\bVM\b/g, sgn(vm))
    .replace(/\+\s*\+/g, "+");
}
// Which upgrade lines are live at the current tier (upgrade i unlocks at tier i+1)
function liveUpgrades(ups, tier) { return (ups || []).slice(0, tier); }
// Heuristic: does this effect text hang off a saving throw, and which one?
const ABILITIES = ["Strength","Dexterity","Constitution","Intelligence","Wisdom","Charisma"];
function saveAbilityOf(text) {
  const m = String(text || "").match(new RegExp("\\b(" + ABILITIES.join("|") + ")\\s+(?:saving throw|save)", "i"));
  return m ? m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase() : null;
}
function setSumMode(m) { state.sumMode = m; renderMain(); }
function mannerAllowed(m, sub = state.compSub) {
  if (m === "rite")      return !(sub === "Ward" || sub === "Direct Attack");
  if (m === "inscribed") return sub !== "Ward";
  return true;
}

function getTier(charLvl) {
  const idx = TIERS.findIndex(t => charLvl >= t.min && charLvl <= t.max);
  return idx < 0 ? 3 : idx;
}


// Safe onclick helper — avoids quote-in-attribute issues
function escAttr(s) { return String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'"); }

// ═══════════════════════════════════════════════════════════
//  BOOT
// ═══════════════════════════════════════════════════════════
async function boot() {
  try {
    const r = await fetch("cognitions/index.json");
    if (!r.ok) throw new Error(r.status);
    INDEX = (await r.json()).cognitions;
    const ready = INDEX.filter(c => c.ready).length;
    setStatus("ok", `✓ ${ready} cognitions ready`);
    renderCogList();
    renderCodexList();
    syncBar();
    renderMain();
    try { if (localStorage.getItem("av-dm")) setDmView(true, true); } catch (e) {}
    try { if (localStorage.getItem("av-mode") === "ign") setMode("ign", true); } catch (e) {}
    const fa = document.getElementById("faCss");
    if (fa?.sheet) initIcons(); else fa?.addEventListener("load", initIcons);
  } catch(e) {
    console.error("Arcanum Veritas Builder boot error:", e);
    const isFetch = !INDEX.length;
    setStatus("err", isFetch ? "✗ cognitions/index.json not found" : "✗ render error — see console");
    const host = document.getElementById("composer");
    if (!host) return;
    host.innerHTML = isFetch ? `
      <div class="empty">
        <p><strong>Can't find the cognitions folder.</strong></p>
        <p>Keep this file next to a <code>cognitions/</code> folder containing <code>index.json</code>.</p>
        <p>If the folder is there, your browser is blocking <code>fetch()</code> on <code>file://</code> —
           open it through a local server (VS Code Live Server, or <code>python -m http.server</code>), or use Firefox.</p>
      </div>` : `
      <div class="empty">
        <p><strong>Something failed while drawing the page.</strong></p>
        <p>${String(e.message || e)}</p>
        <p>The browser console has the details.</p>
      </div>`;
  }
}

async function loadCognition(id) {
  if (LOADED[id]) return LOADED[id];
  try {
    const r = await fetch(`cognitions/${id}.json`);
    if (!r.ok) throw new Error(r.status);
    LOADED[id] = await r.json();
    const dt = LOADED[id].damageType;
    if (dt && !Object.keys(DAMAGE_TYPES).some(k => k.toLowerCase() === dt.toLowerCase()))
      console.warn(`${id}: damageType "${dt}" is not one of the ordinary damage types`);
    return LOADED[id];
  } catch(e) {
    console.warn("Failed to load", id, e);
    return null;
  }
}


function setStatus(cls, msg) {
  const el = document.getElementById("statusEl");
  el.textContent = msg; el.className = "status " + cls;
}

// ═══════════════════════════════════════════════════════════
//  COMMAND BAR
// ═══════════════════════════════════════════════════════════
function bumpSlot(d) {
  state.slotLevel = Math.min(9, Math.max(1, state.slotLevel + d));
  state.complements = state.complements.slice(0, maxComps());
  syncBar(); renderCogList(); renderMain();
}
function bumpLvl(d) {
  state.charLevel = Math.min(20, Math.max(1, state.charLevel + d));
  syncBar(); renderMain();
}
function syncBar() {
  document.getElementById("slotVal").textContent = ORDINALS[state.slotLevel];
  document.getElementById("lvlVal").textContent  = state.charLevel;
  document.getElementById("atkOut").textContent  = sgn(sealAttack());
  document.getElementById("dcOut").textContent   = verumDC();
  const mc = maxComps(), have = state.complements.length + (state.core ? 1 : 0);
  document.getElementById("capOut").textContent = `${have}/${mc + 1}`;
  document.getElementById("capLbl").textContent =
    mc === 0 ? "core only" : (state.manner === "coven" ? "with coven" : "cognitions");
  if (state.mode === "ign") syncIgnBar();
}
