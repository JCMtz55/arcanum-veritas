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
    composerTab: "Devotions", refTab: "Paragon",
    cardTitle: "The Paragon", atkLabel: "Paragon attack", dcLabel: "Paragon DC",
    slotDial: false,
    kind: "paragon", noun: "Paragon", plural: "Paragons",
    needCard: "Light a Devotion first",
    rail: parRail, main: renderParagon,
    refList: renderParRefList, ref: renderParRef,
    pick: null,                       // nothing to pick from a rail — the Devotion cards do it
    clear: () => parClear(),
    syncBar: parSyncBar,
    snapshot: () => parSnapshot(),
    name: { get: () => state.par.name, set: v => state.par.name = v },
    ids:  d => d.devotions || [],
    // Loading a saved Paragon swears its three again, as far as the DM still allows: a Devotion
    // that has since been closed is simply dropped rather than shown as something you can't use.
    load: (d, name) => {
      const open = new Set(parPool().map(x => x.cognition));
      PAR.sworn = (d.devotions || []).filter(id => open.has(id)).slice(0, parMax());
      PAR.active = PAR.sworn.includes(d.paragon) ? d.paragon : null;
      Object.assign(state.par, { wheel: { ...(d.wheel || {}) }, arrived: true, rotated: false, out: false, name });
      parSaveChoice();
    },
  },
};

// The mode in play, and the one the ⇄ button goes to next
state.mode = "av";
function mode()     { return MODES[state.mode] || MODES.av; }
// The Paragon path is the DM's to open, so it joins the cycle only for a player who walks it
// (and for the DM, who needs to see what they wrote). And it closes the other two behind it: a
// Paragon can't use Arcanum Veritas or Ignitions, so for them there is only the one Art and the
// ⇄ button has nowhere to go.
function modeOrder() {
  if (parLocked()) return ["par"];
  return MODE_ORDER.filter(k => k !== "par" || parAllowed());
}
function nextMode()  { const o = modeOrder(); return o[(o.indexOf(state.mode) + 1) % o.length]; }

// ═══════════════════════════════════════════════════════════
//  MODE SWITCH
// ═══════════════════════════════════════════════════════════
function setMode(m, quiet) {
  if (m === "par" && !parAllowed()) {            // a remembered mode the DM has since closed
    if (!quiet) toast("The Paragon path isn't open to you — your DM opens it");
    m = "av";
  }
  // A Paragon has one Art. A remembered seal or Eidon from before the path opened goes nowhere.
  if (parLocked() && m !== "par") {
    if (!quiet) toast("A Paragon can't use Arcanum Veritas or Ignitions — that road is closed");
    m = "par";
  }
  state.mode = MODES[m] ? m : "av";
  try { localStorage.setItem("av-mode", state.mode); } catch (e) {}
  applyMode();
  renderCogList(); renderMain();
  if (state.view === "rings") { renderRingList(); renderRing(); }
  if (!quiet) toast(mode().toast);
}
function toggleMode() { setMode(nextMode()); }

function applyMode() {
  const M = mode(), order = modeOrder(), N = MODES[nextMode()];
  const set = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
  // Arcanum Veritas is the unclassed default; the other two carry a body class for their colours
  MODE_ORDER.forEach(k => document.body.classList.toggle(k, k !== "av" && k === state.mode));
  // `locked` is what hides the rail and the summary card: on this path the Devotion cards are all
  // there is, and there is no seal to summarise.
  document.body.classList.toggle("par-only", parLocked());
  document.querySelector(".brand").innerHTML = `${M.brand}<em>${M.tagline}</em>`;
  set("modeBtn", `⇄ ${N.brand}`);
  const btn = document.getElementById("modeBtn");
  if (btn) {
    btn.hidden = order.length < 2;               // one Art, nowhere to switch to
    btn.title = `Switch to ${N.brand} — ${order.map(k => MODES[k].brand).join(", ")} cycle in turn`;
  }
  set("tabComposer", M.composerTab);
  set("tabRings", M.refTab);
  set("sealTitle", M.cardTitle);
  document.querySelector(".lv.atk i").textContent = M.atkLabel;
  // Every Cognitive Art resolves on the same DC; the Paragon rules just call it by its own name,
  // and the bar is the only place that name appears now.
  document.querySelector(".lv.dc i").textContent  = M.dcLabel || "Verum DC";
  const slot = document.getElementById("slotDial");
  if (slot) slot.hidden = !M.slotDial;
  document.title = M.docTitle;
  syncBar();
}
