// Arcanum Veritas Builder — The mode registry

// ═══════════════════════════════════════════════════════════
//  THE THREE COGNITIVE ARTS
// ═══════════════════════════════════════════════════════════
// One shell, three ways of channelling a Cognition. Arcanum Veritas composes a seal, Ignition
// forges an Eidon, and the Paragon path holds a single Deeper Burn. They don't mix at the table
// — a creature walks one of them — so the builder shows one at a time and the ⇄ button cycles.
//
// Each mode declares its chrome (what the bar, the tabs and the card are called) and its
// renderers. A renderer left null means "the mode this file grew up around" — Arcanum Veritas,
// whose code is the default body of renderCogList, renderMain, renderRingList and renderRing.
// Everything that used to ask `state.mode === "ign"` asks this table instead.

const MODE_ORDER = ["av", "ign", "par"];

const MODES = {
  av: {
    brand: "Arcanum Veritas", tagline: "seal composer",
    docTitle: "Arcanum Veritas — Seal Composer",
    toast: "Arcanum Veritas — the seal composer",
    composerTab: "Composer", refTab: "Rings",
    cardTitle: "The seal", atkLabel: "to hit",
    slotDial: true,
    kind: "seal", noun: "seal", plural: "seals",
    needCard: "Draw a seal first",
    rail: null, main: null, refList: null, ref: null,
    pick: null, clear: null, syncBar: null,
    snapshot: () => sealSnapshot(),
    name: { get: () => state.sealName, set: v => state.sealName = v },
    ids:  d => [d.core, ...(d.complements || []).map(c => c.id)],
    load: (d, name) => Object.assign(state, {
      slotLevel: Math.min(9, Math.max(1, d.slotLevel | 0)), core: d.core, coreVerum: d.coreVerum || null,
      compType: d.compType, compSub: d.compSub, complements: d.complements || [],
      shape: d.shape || "sphere", manner: d.manner || "standard", phase: d.phase || 0, sealName: name,
    }),
  },
  ign: {
    brand: "Ignition", tagline: "eidon forge",
    docTitle: "Ignition — Eidon Forge",
    toast: "Ignition — the Eidon Forge",
    composerTab: "Forge", refTab: "Ignitions",
    cardTitle: "The Eidon", atkLabel: "Eidon check",
    slotDial: false,
    kind: "eidon", noun: "Eidon", plural: "Eidons",
    needCard: "Build an Eidon first",
    rail: renderBurnRail, main: renderForge,
    refList: renderIgnRefList, ref: renderIgnRef,
    pick: toggleBurn,
    clear: () => { state.ign.burning = []; },
    syncBar: syncIgnBar,
    snapshot: () => eidonSnapshot(),
    name: { get: () => state.ign.name, set: v => state.ign.name = v },
    ids:  d => (d.burning || []).map(b => b.id),
    load: (d, name) => Object.assign(state.ign, {
      burning: d.burning.map(b => ({ id: b.id, rounds: BURN_ROUNDS, inEidon: !!b.inEidon })),
      template: d.template || null, act: d.act || null, spend: d.spend || {}, verums: d.verums || {},
      forge: !!d.forge, successes: d.successes || 0, name, burnedRound: false, eidonRound: false, last: null,
    }),
  },
  par: {
    brand: "The Paragon", tagline: "deeper burn",
    docTitle: "The Paragon — Deeper Burn",
    toast: "The Paragon path — one Cognition, all the way down",
    composerTab: "The Path", refTab: "Paragon",
    cardTitle: "The Paragon", atkLabel: "Paragon attack",
    slotDial: false,
    kind: "paragon", noun: "Paragon", plural: "Paragons",
    needCard: "Light a Devotion first",
    rail: parRail, main: renderParagon,
    refList: renderParRefList, ref: renderParRef,
    pick: parToggleDevotion,
    clear: () => parClear(),
    syncBar: parSyncBar,
    snapshot: () => parSnapshot(),
    name: { get: () => state.par.name, set: v => state.par.name = v },
    ids:  d => d.devotions || [],
    load: (d, name) => Object.assign(state.par, {
      devotions: [...(d.devotions || [])], paragon: d.paragon || null, builds: d.builds || {},
      season: d.season || 0, arrived: true, rotated: false, name,
    }),
  },
};

// The mode in play, and the one the ⇄ button goes to next
state.mode = "av";
function mode()     { return MODES[state.mode] || MODES.av; }
function nextMode() { return MODE_ORDER[(MODE_ORDER.indexOf(state.mode) + 1) % MODE_ORDER.length]; }

// ═══════════════════════════════════════════════════════════
//  MODE SWITCH
// ═══════════════════════════════════════════════════════════
function setMode(m, quiet) {
  state.mode = MODES[m] ? m : "av";
  try { localStorage.setItem("av-mode", state.mode); } catch (e) {}
  applyMode();
  renderCogList(); renderMain();
  if (state.view === "rings") { renderRingList(); renderRing(); }
  if (!quiet) toast(mode().toast);
}
function toggleMode() { setMode(nextMode()); }

function applyMode() {
  const M = mode(), N = MODES[nextMode()];
  const set = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
  // Arcanum Veritas is the unclassed default; the other two carry a body class for their colours
  MODE_ORDER.forEach(k => document.body.classList.toggle(k, k !== "av" && k === state.mode));
  document.querySelector(".brand").innerHTML = `${M.brand}<em>${M.tagline}</em>`;
  set("modeBtn", `⇄ ${N.brand}`);
  const btn = document.getElementById("modeBtn");
  if (btn) btn.title = `Switch to ${N.brand} — ${MODE_ORDER.map(k => MODES[k].brand).join(", ")} cycle in turn`;
  set("tabComposer", M.composerTab);
  set("tabRings", M.refTab);
  set("sealTitle", M.cardTitle);
  document.querySelector(".lv.atk i").textContent = M.atkLabel;
  document.querySelector(".lv.dc i").textContent  = "Verum DC";   // every Cognitive Art shares it
  const slot = document.getElementById("slotDial");
  if (slot) slot.hidden = !M.slotDial;
  document.title = M.docTitle;
  syncBar();
}
