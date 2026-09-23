// Arcanum Veritas Builder — Composition tables (every Ring and its scaling) and the domains the rail groups by

// ═══════════════════════════════════════════════════════════
//  COMPOSITION TABLES
// ═══════════════════════════════════════════════════════════
const COMP_DATA = {
  offensive: {
    label: "Offensive", icon: "⚔️", desc: "Damage & harm", color: "off",
    subtypes: {
      "Direct Attack": {
        columns: ["Slot","Damage","Range"],
        notes: "One target. Seal attack roll (Prof + Verum Mod) — the only d20 this seal asks for. On a hit: full damage + Core Verum Effect, and every Complement resolves off that same hit. Crits double the dice. Never hits more than one creature — that is what Area is for.\n\nTouch variant: draw the seal into your hand instead — range 5 ft, damage gains one additional die.",
        rows: [
          ["1st","2d8 + VM","90 ft"],["2nd","3d8 + VM","90 ft"],
          ["3rd","4d8 + VM","120 ft"],["4th","5d8 + VM","120 ft"],
          ["5th","6d8 + VM","150 ft"],["6th","7d8 + VM","150 ft"],
          ["7th","8d8 + VM","180 ft"],["8th","9d8 + VM","180 ft"],
          ["9th","10d8 + VM","200 ft"],
        ]
      },
      "Area": {
        columns: ["Slot","Damage","Radius","Range"], shape: true,
        notes: "All creatures in the shape save against the Core's saving throw. Fail = full damage + Verum Effect. Success = half damage, no Verum Effect.",
        rows: [
          ["1st","4d6","15 ft","90 ft"],["2nd","6d6","15 ft","90 ft"],
          ["3rd","8d6","20 ft","150 ft"],["4th","10d6","20 ft","150 ft"],
          ["5th","12d6","25 ft","180 ft"],["6th","14d6","25 ft","180 ft"],
          ["7th","16d6","30 ft","200 ft"],["8th","18d6","30 ft","200 ft"],
          ["9th","20d6","40 ft","250 ft"],
        ]
      },
      "Field": {
        columns: ["Slot","Damage / turn","Radius","Range","Duration"], shape: true, concentration: true,
        notes: "A lingering zone. Creatures save when it appears and again at the start of each turn inside it. Fail = full damage + Verum Effect. Success = half, no Verum. Requires concentration.",
        rows: [
          ["1st","3d6","15 ft","90 ft","1 minute"],["2nd","4d6","15 ft","90 ft","1 minute"],
          ["3rd","5d6","20 ft","150 ft","1 minute"],["4th","6d6","20 ft","150 ft","10 minutes"],
          ["5th","7d6","25 ft","180 ft","10 minutes"],["6th","8d6","25 ft","180 ft","1 hour"],
          ["7th","9d6","30 ft","200 ft","1 hour"],["8th","10d6","30 ft","200 ft","8 hours"],
          ["9th","11d6","40 ft","250 ft","8 hours"],
        ]
      },
      "Infusion": {
        columns: ["Slot","Weapon Die","Duration"],
        notes: "Draw the seal into a held weapon. Every hit deals the Weapon Die as bonus damage of the Core's type and carries its Verum Effect.\n\nFirst-hit rule: any bonus damage beyond the Weapon Die — the Core's extra dice and every Complement's damage die — applies only to the first hit you land each turn. Non-damaging riders (pushes, conditions, stacks) trigger on every hit, but a creature saves against a given rider once per turn.\n\nBestowed: you may draw the Infusion into a willing ally's held weapon within 30 ft instead of your own.",
        rows: [
          ["1st","1d6","until end of your next turn"],["2nd","1d6","1 minute"],
          ["3rd","1d8","1 minute"],["4th","1d8","10 minutes"],
          ["5th","1d10","10 minutes"],["6th","1d10","1 hour"],
          ["7th","1d12","1 hour"],["8th","1d12","8 hours"],
          ["9th","1d12","24 hours"],
        ]
      }
    }
  },
  supportive: {
    label: "Supportive", icon: "🌟", desc: "Healing, buffs & wards", color: "sup",
    subtypes: {
      "Self": {
        columns: ["Slot","Healing","Buff Duration"],
        notes: "Inward. No roll; resolves on cast. All Verum Effects apply at full potency — the only Ring that can touch your own body, mind, or soul.\n\nSelf concentrates what Ally divides. It heals half again what Ally gives any one target, and its buff runs two slots longer. Ally wins on total output from the 3rd slot up, once it has more than one body to reach — Self wins on any single body, always.",
        rows: [
          ["1st","2d8 + VM","1 minute"],["2nd","3d8 + VM","10 minutes"],
          ["3rd","5d8 + VM","10 minutes"],["4th","6d8 + VM","1 hour"],
          ["5th","8d8 + VM","1 hour"],["6th","10d8 + VM","8 hours"],
          ["7th","12d8 + VM","8 hours"],["8th","15d8 + VM","24 hours"],
          ["9th","18d8 + VM","until countered"],
        ]
      },
      "Ally": {
        columns: ["Slot","Healing / Target","Range","Targets","Buff Duration"],
        notes: "Delivered to willing creatures. No roll. Full healing and Verum Effect to each target. Internal-state Verum Effects do not transfer.\n\nYou may be one of the targets, but you heal as a target of Ally — the Self table is only for a seal drawn inward.",
        rows: [
          ["1st","1d8 + VM","30 ft","1","1 round"],["2nd","2d8 + VM","30 ft","1","3 rounds"],
          ["3rd","3d8 + VM","60 ft","2","1 minute"],["4th","4d8 + VM","60 ft","2","10 minutes"],
          ["5th","5d8 + VM","90 ft","3","10 minutes"],["6th","6d8 + VM","90 ft","3","1 hour"],
          ["7th","8d8 + VM","120 ft","4","1 hour"],["8th","10d8 + VM","120 ft","4","8 hours"],
          ["9th","12d8 + VM","150 ft","5","8 hours"],
        ]
      },
      "Aura": {
        columns: ["Slot","Radius","Duration"], concentration: true,
        notes: "A field centered on you. Creatures of your choice inside it are under the Verum Effect while they remain inside. If the Verum involves a quantity, use the Cognition's Aura entry. Requires concentration.",
        rows: [
          ["1st","10 ft","1 round"],["2nd","10 ft","3 rounds"],
          ["3rd","15 ft","1 minute"],["4th","15 ft","10 minutes"],
          ["5th","20 ft","10 minutes"],["6th","20 ft","1 hour"],
          ["7th","25 ft","1 hour"],["8th","25 ft","8 hours"],
          ["9th","30 ft","until countered"],
        ]
      },
      "Ward": {
        columns: ["Slot","Absorb","Range"], reaction: true,
        notes: "REACTION — when you or a creature you can see within range takes damage. The seal absorbs the damage; if the Core's Verum targets a creature it targets the attacker, otherwise it applies to the protected creature (never both absorb and Verum temp HP). Ward is the only reaction Ring: it spends a use and a slot, and triggers Dual Use if you also drew a seal on your turn this round.",
        rows: [
          ["1st","3d8 + VM","30 ft"],["2nd","4d8 + VM","30 ft"],
          ["3rd","5d8 + VM","60 ft"],["4th","6d8 + VM","60 ft"],
          ["5th","7d8 + VM","90 ft"],["6th","8d8 + VM","90 ft"],
          ["7th","9d8 + VM","120 ft"],["8th","10d8 + VM","120 ft"],
          ["9th","12d8 + VM","150 ft"],
        ]
      }
    }
  },
  control: {
    label: "Control", icon: "🔗", desc: "Conditions & zones", color: "con",
    subtypes: {
      "Targeted": {
        columns: ["Slot","Targets","Range","Duration on Fail"], saveDisadvantage: true,
        notes: "Each target saves independently against your Verum DC, and saves that first one at DISADVANTAGE — a Targeted seal is the whole of your attention. Success = no effect.\n\nOnly the first save is at disadvantage. Repeat saves later in the duration are rolled normally: you commit at the drawing, not for the hour afterward.\n\nTargeted does not concentrate. It reaches further than a Control Area, it holds while you also hold an Aura or a Field, and damage cannot break it. What it will not do is deny ground — it binds creatures, not space.",
        rows: [
          ["1st","1","150 ft","until end of their next turn"],["2nd","1","150 ft","1 min (repeat save each turn)"],
          ["3rd","2","180 ft","1 min (repeat save each turn)"],["4th","2","180 ft","1 min (no repeat save)"],
          ["5th","3","200 ft","10 min (repeat save, 1/min)"],["6th","3","200 ft","10 min (repeat save, 1/min)"],
          ["7th","4","250 ft","1 hr (repeat save, 1/min)"],["8th","4","250 ft","1 hr (repeat save, 1/min)"],
          ["9th","5","300 ft","8 hrs (repeat save, 1/hr)"],
        ]
      },
      "Area": {
        columns: ["Slot","Radius","Range","Zone Duration","Condition on Fail"], shape: true, concentration: true,
        notes: "A zone. Creatures save when it appears and again whenever they start their turn inside it. Success = no condition this turn. The zone persists for its full duration. Requires concentration.\n\nArea asks the question again every turn, so a creature that saves once is not free — it is free until its next turn inside. That, and the ground it denies to everything that would cross it, is what the concentration and the shorter reach buy. Unlike Targeted, it never rolls at disadvantage, and it does not care how many bodies walk in.",
        rows: [
          ["1st","15 ft","90 ft","1 round","until end of their next turn"],
          ["2nd","15 ft","90 ft","1 minute","until end of their next turn"],
          ["3rd","20 ft","150 ft","1 minute","1 min (repeat save each turn)"],
          ["4th","20 ft","150 ft","10 minutes","1 min (repeat save each turn)"],
          ["5th","25 ft","180 ft","10 minutes","1 min (no repeat save)"],
          ["6th","25 ft","180 ft","1 hour","10 min (repeat save, 1/min)"],
          ["7th","30 ft","200 ft","1 hour","10 min (repeat save, 1/min)"],
          ["8th","35 ft","200 ft","8 hours","1 hr (repeat save, 1/min)"],
          ["9th","40 ft","250 ft","8 hours","1 hr (repeat save, 1/min)"],
        ]
      }
    }
  },
  creation: {
    label: "Creation", icon: "🏗️", desc: "Walls, servants & objects", color: "cre", verumKey: "control",
    subtypes: {
      "Structure": {
        columns: ["Slot","Size","AC","HP / segment","Duration"],
        notes: "Raise a wall, bridge, barrier, or shelter of the Core's substance. Total cover; 5 ft thick unless the Core says otherwise. Size is total length of a wall 10 ft high (or equivalent volume) in 10-ft segments — each segment has the listed HP and is destroyed on its own. The Core's Verum applies to creatures that touch or strike it, if it makes sense for one to.",
        rows: [
          ["1st","10 ft","13","20","1 minute"],["2nd","20 ft","14","30","10 minutes"],
          ["3rd","30 ft","15","45","10 minutes"],["4th","40 ft","15","60","1 hour"],
          ["5th","50 ft","16","80","1 hour"],["6th","60 ft","16","100","8 hours"],
          ["7th","80 ft","17","125","8 hours"],["8th","100 ft","17","150","24 hours"],
          ["9th","120 ft","18","200","until countered"],
        ]
      },
      "Construct": {
        columns: ["Slot","CR cap","Duration"], concentration: true, verumKey: "offensive",
        notes: "Shape the Core into a servant. It uses a stat block of CR equal to the slot level or lower that the DM approves, gains the Core's damage type and Verum Effect on its attacks, acts on your initiative, and obeys you. Requires concentration.",
        rows: [
          ["1st","1","1 minute"],["2nd","2","10 minutes"],["3rd","3","10 minutes"],
          ["4th","4","1 hour"],["5th","5","1 hour"],["6th","6","8 hours"],
          ["7th","7","8 hours"],["8th","8","24 hours"],["9th","9","until countered"],
        ]
      },
      "Object": {
        columns: ["Slot","Max size","Quality","Duration"],
        notes: "Draw a tool, weapon, vessel, or piece of equipment out of the Core's substance. Mundane and nonmagical unless noted. An Object can never be a magic item with properties — that is what Dream Items are for.",
        rows: [
          ["1st","Tiny","mundane","1 minute"],["2nd","Small","mundane","10 minutes"],
          ["3rd","Medium","mundane","10 minutes"],["4th","Medium","mundane","1 hour"],
          ["5th","Large","counts as magical, +1","1 hour"],["6th","Large","+1","8 hours"],
          ["7th","Huge","+1","8 hours"],["8th","Huge","+2","24 hours"],
          ["9th","Gargantuan","+2","until countered"],
        ]
      }
    }
  },
  utility: {
    label: "Utility", icon: "✨", desc: "Light, sight, passage, shaping", color: "uti", verumKey: "supportive",
    subtypes: {
      "Utility": {
        columns: ["Slot","Tier","Scope","Duration cap"],
        notes: "No dice. The Core decides the flavor; the slot decides the scope. Utility seals never deal damage, heal, or impose a condition on an unwilling creature. If the effect would concentrate as a spell, it concentrates as a seal. The premium is the seal itself — no components, no counterspell.",
        rows: [
          ["1st","Minor","up to a 3rd-level utility effect — light, detection, unlocking, a 30-ft step, feather fall, illusion, comprehend, water breathing, clairvoyance","1 hour"],
          ["2nd","Minor","as 1st","1 hour"],
          ["3rd","Minor","as 1st","1 hour"],
          ["4th","Moderate","up to a 6th-level utility effect — flight, sending, stone shape, scrying, a 500-ft step, true seeing, wind walk","8 hours"],
          ["5th","Moderate","as 4th","8 hours"],
          ["6th","Moderate","as 4th","8 hours"],
          ["7th","Major","up to a 9th-level utility effect — teleportation across a region, mass utility, unmaking non-seal magic, a step between planes","24 hours"],
          ["8th","Major","as 7th","24 hours"],
          ["9th","Major","as 7th","until countered"],
        ]
      }
    }
  }
};

// Shapes available to any Ring flagged shape:true (Area, Field, Control Area)
const SHAPES = {
  sphere: { label:"Sphere", desc:"a point within range · radius as tabled" },
  cone:   { label:"Cone",   desc:"from your hand · length = 2× radius · no range" },
  line:   { label:"Line",   desc:"from your hand · length = 4× radius, 5 ft wide · no range" },
};

// Manners of Drawing — how the seal is drawn
const MANNERS = {
  standard:  { label:"Standard",  desc:"Your action, once per turn." },
  rite:      { label:"Rite",      desc:"Drawn over 10 minutes. Still spends a use and a slot. Choose one: double the duration, or double the radius / size. Not a Ward or a Direct Attack." },
  inscribed: { label:"Inscribed", desc:"Drawn over 1 minute onto a surface, object, or willing creature's skin. Fires on a trigger you set within (slot level) hours, centered on the inscription (Targeted takes the triggering creature). You can hold Prof Bonus inscriptions. Not a Ward." },
  coven:     { label:"Coven",     desc:"Up to three willing creatures within 30 ft who know a Cognition each spend their reaction to add one Sigil beyond your budget. A Coven is a leader and three." },
};

// Global rules shown on the reference card
const RULES = {
  numbers: [
    ["Verum Modifier","your highest ability score modifier"],
    ["Seal attack bonus","Proficiency Bonus + Verum Modifier"],
    ["Verum DC","8 + Proficiency Bonus + Verum Modifier + Dream Score modifier"],
    ["Saving throw type","set by the Core (its Main Saving Throw)"],
    ["Absolute damage","from Tier III (level 11+), all of a seal's damage — Verum, Sigils, ticks and riders — turns into its type's Absolute form: fire becomes Infernal, force Astral, necrotic Doom… Some Verums get there sooner. Absolute damage is never halved or negated: a creature resistant to the ordinary type reduces it by 2 × its Proficiency Bonus, an immune one by 4 × its Proficiency Bonus (once per damage roll, never below 0). Vulnerability still doubles it. Where a Verum or Sigil ignores resistance or immunity, against Absolute damage it ignores that reduction. Void and All-Mighty are born at their zenith: nothing resists, reduces or absorbs them, at any level."],
  ],
  premium: "The Premium Rule — a seal of slot N should perform like the best spell of slot N+1, before its Verum Effect and Sigils. It costs a slot AND a use; you get Proficiency Bonus uses per long rest; no cantrips.",
  limits: [
    "Uses: Proficiency Bonus seals per long rest. Nothing restores uses unless it says so.",
    "Verum Effects scale by CHARACTER LEVEL, never by slot. The slot sets the Ring; your level sets the Core's tier.",
    "Budget: one Core + (slot level − 1) Complements. Coven Drawing may add up to three more.",
    "Timing: your action, once per turn, never a bonus action. Ward is a reaction. Rite and Inscribed take longer by design.",
    "Concentration: Aura, Field, Control zones, and Constructs. Self, Ally, Infusion, Structures, and Objects do not.",
    "Countered, not dispelled: immune to Counterspell and Dispel Magic; suppressed by Antimagic Field. Only an opposing seal unmakes a seal early.",
  ],
  countering: [
    "Core to Core — only an opposing Core counters (see the Cognition's Opposed entry). Complements never counter.",
    "Slot must match — the countering seal's slot is equal or higher.",
    "Reaction countering spends a use and a slot like any seal.",
    "Dual Use — a seal as an action and another as a reaction in the same round = one level of exhaustion, removed only by a long rest with sleep.",
  ],
};

// ═══════════════════════════════════════════════════════════
//  DOMAINS — how the 36 Cognitions sort in the rail
// ═══════════════════════════════════════════════════════════
// Read from index.json's `category`, so the rail can be grouped and filtered without
// fetching all 36 Cognition files. `favorite` is a separate axis: the players' favourites,
// held to a higher power bar, wherever they sit by domain.
const CATEGORIES = {
  elemental: { label:"Elemental", short:"Elem",  note:"matter and force" },
  cosmical:  { label:"Cosmical",  short:"Cosmos",note:"the shape of creation itself" },
  corporeal: { label:"Corporeal", short:"Body",  note:"blood, bone and beast" },
  vital:     { label:"Vital",     short:"Vital", note:"the living and the unliving" },
  reason:    { label:"Reason",    short:"Reason",note:"the mind at work — thought, knowing, selfhood" },
  mores:     { label:"Mores",     short:"Mores", note:"feeling, virtue, and how people treat each other" },
  umbral:    { label:"Umbral",    short:"Umbral",note:"absence, erasure, the unmade" },
  fate:      { label:"Fate",      short:"Fate",  note:"what happens to you" },
  dominion:  { label:"Dominion",  short:"Rule",  note:"will imposed on the world" },
};
const CAT_ORDER = Object.keys(CATEGORIES);
function catOf(c) { return CATEGORIES[c?.category] ? c.category : null; }

// Cognition icons: a Font Awesome glyph (`fa` in index.json) tinted in the domain's colour.
// Until the icon font has actually loaded — or if it never does (offline, blocked CDN) —
// the emoji in `icon` is used instead, so nothing ever renders as an empty box.
let FA_READY = false;
function cogIcon(c) {
  if (FA_READY && c?.fa) return `<i class="fa-solid fa-${c.fa} dom-${catOf(c) || "none"}" aria-hidden="true"></i>`;
  return c?.icon || "◆";
}
function initIcons() {
  if (!document.fonts?.load) return;
  document.fonts.load('900 1em "Font Awesome 6 Free"').then(faces => {
    if (!faces.length) return;
    FA_READY = true;
    renderCogList(); renderCodexList(); renderMain();
    if (state.view === "codex") renderCodex();
  }).catch(() => {});
}

const ORDINALS = ["","1st","2nd","3rd","4th","5th","6th","7th","8th","9th"];

const TIERS = [
  { label:"Lv 1–4",   min:1,  max:4  },
  { label:"Lv 5–10",  min:5,  max:10 },
  { label:"Lv 11–16", min:11, max:16 },
  { label:"Lv 17+",   min:17, max:20 },
];
