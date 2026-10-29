// The character sheet's rules engine: every number the sheet shows, and nothing that draws it.
//
// Pure functions only — no DOM, no fetch, no module state. The requirements call for calculations
// isolated from the UI, deterministic, versioned and covered by fixtures (NF-002), and the engine is
// the one part of this tool that must never be guessed at twice. Every formula below cites the vault
// note or the ruling it comes from, because about a dozen of them are NOT standard 5e and a reader
// who assumes otherwise will "fix" them back.
//
// This file is an ES module, unlike the Arcanum builder's plain <script> files. The builder shares one
// global scope so its inline onclick handlers keep working; the sheet is a new section with no such
// history, and a module is the only way the Node test runner and the browser can read the SAME file
// instead of a copy that drifts. The sheet's UI modules import from here; nothing here imports back.

export const RULES_VERSION = "ouas-2014-v1.5";

// ── The seven scores ────────────────────────────────────────────────────
// Dream is the seventh ability (HB-001). It starts at 10 and rises ONLY through a DM-recorded
// campaign event (DM-01, DM-02, RES-03) — never from point-buy or an ordinary ASI. The table is
// currently at Dream 24 / +7, which is above the cap of 20 that Star Force.md documents; the engine
// does not enforce a cap, because the live table value already exceeds it and silently clamping a
// player's score to 20 would be worse than reporting the number the DM set.
export const ABILITIES = ["str", "dex", "con", "int", "wis", "cha", "dream"];
export const STANDARD_ABILITIES = ["str", "dex", "con", "int", "wis", "cha"];
export const ABILITY_NAME = {
  str: "Strength", dex: "Dexterity", con: "Constitution",
  int: "Intelligence", wis: "Wisdom", cha: "Charisma", dream: "Dream",
};
export const DREAM_START = 10;

export const abilityMod = score => Math.floor((num(score) - 10) / 2);
export const proficiencyBonus = level => 2 + Math.floor((Math.max(1, num(level)) - 1) / 4);

// ── Skills ──────────────────────────────────────────────────────────────
// The 18 standard 5e skills, the four Dream skills (HB-002) and Harvesting (HB-003).
//
// `abilities` is a LIST because a skill may have more than one eligible ability and the player picks
// per check. Harvesting is Wisdom or Intelligence. The v2 sheet also prints "Nature (Int or Wis)" and
// "Religion (Int or Wis)", but a PDF label is interface evidence and does not outrank an explicit
// campaign mechanic (Appendix B precedence), and no note grants those two a second ability — so they
// keep their 2014 ability here and a DM who wants the sheet's reading can add one without a code
// change. `prof` is 0 none / 1 proficient / 2 expertise; expertise is counted once, never twice.
export const SKILLS = [
  { id: "acrobatics",     name: "Acrobatics",      abilities: ["dex"] },
  { id: "alter",          name: "Alter",           abilities: ["dream"] },
  { id: "animalHandling", name: "Animal Handling", abilities: ["wis"] },
  { id: "arcana",         name: "Arcana",          abilities: ["int"] },
  { id: "athletics",      name: "Athletics",       abilities: ["str"] },
  { id: "deception",      name: "Deception",       abilities: ["cha"] },
  { id: "fabricate",      name: "Fabricate",       abilities: ["dream"] },
  { id: "harvesting",     name: "Harvesting",      abilities: ["wis", "int"] },
  { id: "history",        name: "History",         abilities: ["int"] },
  { id: "incept",         name: "Incept",          abilities: ["dream"] },
  { id: "insight",        name: "Insight",         abilities: ["wis"] },
  { id: "intimidation",   name: "Intimidation",    abilities: ["cha"] },
  { id: "investigation",  name: "Investigation",   abilities: ["int"] },
  { id: "medicine",       name: "Medicine",        abilities: ["wis"] },
  { id: "nature",         name: "Nature",          abilities: ["int"] },
  { id: "perception",     name: "Perception",      abilities: ["wis"] },
  { id: "performance",    name: "Performance",     abilities: ["cha"] },
  { id: "persuasion",     name: "Persuasion",      abilities: ["cha"] },
  { id: "religion",       name: "Religion",        abilities: ["int"] },
  { id: "reveal",         name: "Reveal",          abilities: ["dream"] },
  { id: "sleightOfHand",  name: "Sleight of Hand", abilities: ["dex"] },
  { id: "stealth",        name: "Stealth",         abilities: ["dex"] },
  { id: "survival",       name: "Survival",        abilities: ["wis"] },
];
export const SKILL_BY_ID = Object.fromEntries(SKILLS.map(s => [s.id, s]));
export const DREAM_SKILLS = SKILLS.filter(s => s.abilities[0] === "dream").map(s => s.id);

// How much a proficiency level is worth. Expertise doubles the bonus, it does not add it twice —
// which is also why Fabricate's two formulas below both call this exactly once.
export const profContribution = (pb, prof) => num(pb) * Math.min(2, Math.max(0, num(prof)));

// ── Modifiers ───────────────────────────────────────────────────────────
// A named, reasoned adjustment a player or the DM added by hand: "+2 AC, Shield of Faith, 10 rounds".
// Base scores are never written over — a total is always base plus the modifiers that target it, so
// removing one restores the original without remembering what it was.
//
// `target` is "ac" | "speed" | "initiative" | "maxHp" | "attack" | "damage" | "saveDc"
//   | "ability:<id>" | "save:<id>" | "skill:<id>".
// `rounds` null means permanent. `active: false` is an expired or suspended record kept for history,
// which is why expiry blanks a modifier in place rather than deleting it.
export function modifierTotal(modifiers, target) {
  return contributions(modifiers, target).reduce((t, m) => t + m.amount, 0);
}
export function contributions(modifiers, target) {
  return (modifiers || [])
    .filter(m => m && m.active !== false && m.target === target)
    // `permanent` is the distinction the sheet shows: a thing that expires on a confirmed round and
    // a thing that is simply true of you read completely differently at the table, and a list that
    // mixes them without saying which is which is a list nobody can act on.
    .map(m => ({ amount: num(m.amount), reason: m.reason || "", rounds: m.rounds ?? null,
      id: m.id, source: m.source || "", permanent: m.rounds == null }));
}

// One confirmed round of the character's own tracker. Anything carrying `rounds` counts down and
// expires in place; `rounds: null` is permanent and untouched. Used for both named modifiers and
// temporary actions, because "it lasts three rounds" means the same thing for either.
export function tickTimed(list, round) {
  const ended = [];
  const next = (list || []).map(m => {
    if (!m || m.active === false || m.rounds == null) return m;
    const rounds = num(m.rounds) - 1;
    if (rounds > 0) return { ...m, rounds };
    ended.push(m);
    return { ...m, rounds: 0, active: false, expiredRound: num(round) + 1 };
  });
  return { list: next, ended };
}
export function advanceRound(modifiers, round) {
  const { list, ended } = tickTimed(modifiers, round);
  return { modifiers: list, ended, round: num(round) + 1 };
}

// ── The action economy of one turn ──────────────────────────────────────
// Everyone starts a turn with one Action, one Bonus Action and one Reaction. The campaign's other
// costs — Quick, Grand, Pair — are not a per-turn allowance anyone has by default, so they appear
// on the tracker only once something grants one.
//
// A grant is `{ kind, n, rounds, why }`: Haste's extra Action, a Grimm's second Reaction, whatever
// the table hands out. `rounds: null` is permanent; a number counts down on the same confirmed
// round that modifiers and temporary actions do, which is why grants tick through `tickTimed` too.
export const TURN_KINDS = ["action", "bonus", "reaction", "quick", "grand", "pair"];
export const TURN_BASE = { action: 1, bonus: 1, reaction: 1 };

export function turnAllowance(ch) {
  const out = { ...TURN_BASE };
  for (const g of ch?.grants || []) {
    if (!g || g.active === false || !TURN_KINDS.includes(g.kind)) continue;
    out[g.kind] = (out[g.kind] || 0) + Math.max(1, num(g.n) || 1);
  }
  return out;
}

// `used` was a set of booleans before grants existed, and a sheet saved then is still a sheet.
export function turnUsed(ch, kind) {
  const u = (ch?.used || {})[kind];
  if (u === true) return 1;
  return Math.max(0, num(u));
}

export const turnSpent = ch =>
  Object.keys(turnAllowance(ch)).reduce((n, k) => n + turnUsed(ch, k), 0);

// ── Derived numbers ─────────────────────────────────────────────────────
export function abilityScore(ch, id) {
  return num(ch.abilities?.[id]) + modifierTotal(activeModifiers(ch), `ability:${id}`);
}
export function abilityModifier(ch, id) {
  return abilityMod(abilityScore(ch, id));
}

// A skill's total, for one chosen eligible ability. Pass `ability` to settle Harvesting; omitted, the
// first eligible one is used.
export function skillTotal(ch, skillId, ability) {
  const sk = SKILL_BY_ID[skillId];
  if (!sk) return 0;
  const use = sk.abilities.includes(ability) ? ability : sk.abilities[0];
  return abilityModifier(ch, use)
    + profContribution(proficiencyBonus(ch.level), ch.skills?.[skillId])
    + modifierTotal(activeModifiers(ch), `skill:${skillId}`);
}
export function saveTotal(ch, abilityId) {
  return abilityModifier(ch, abilityId)
    + (ch.saves?.[abilityId] ? proficiencyBonus(ch.level) : 0)
    + modifierTotal(activeModifiers(ch), `save:${abilityId}`);
}
export const passiveScore = (ch, skillId, ability) => 10 + skillTotal(ch, skillId, ability);

export const armorClass = ch => num(ch.ac) + modifierTotal(activeModifiers(ch), "ac");
export const speed = ch => num(ch.speed) + modifierTotal(activeModifiers(ch), "speed");
export const initiative = ch => abilityModifier(ch, "dex") + modifierTotal(activeModifiers(ch), "initiative");
export const maxHp = ch => Math.max(0, num(ch.maxHp) + modifierTotal(activeModifiers(ch), "maxHp"));

// ── Honor and Morality ──────────────────────────────────────────────────
// Four independent non-negative sub-scores, two totals, two directional modifiers (HB-005, HB-006,
// RES-10). This is deliberately NOT ability-modifier arithmetic: the total is the plain sum.
//
// The owning note calls the first Honor sub-score "Order" in its overview and "Law" in its worked
// example, and Khaled's recorded sheet says "Law 3 / Chaos 6". They are one sub-score under two
// names; `order` is canonical here and `LAW` is kept as an alias so either spelling reads correctly.
export const HONOR_AXES = { order: "Order", chaos: "Chaos" };
export const MORALITY_AXES = { good: "Good", evil: "Evil" };
export const HONOR_ALIASES = { law: "order", order: "order", chaos: "chaos" };

export const honorTotal = axes => num(axes?.order) + num(axes?.chaos);
export const moralityTotal = axes => num(axes?.good) + num(axes?.evil);

// The modifier for a check aligned with one side of an axis: the absolute difference, signed by
// whether the DOMINANT sub-score is the aligned one. A tie is zero.
// Order 4 / Chaos 6 gives +2 on a Chaos-aligned roll and -2 on an Order-aligned roll.
export function axisModifier(axes, alignedWith) {
  const keys = Object.keys(axes || {});
  if (keys.length !== 2) return 0;
  const aligned = HONOR_ALIASES[alignedWith] || alignedWith;
  const other = keys.find(k => k !== aligned);
  if (!other || !(aligned in axes)) return 0;
  const diff = Math.abs(num(axes[aligned]) - num(axes[other]));
  if (num(axes[aligned]) === num(axes[other])) return 0;
  return num(axes[aligned]) > num(axes[other]) ? diff : -diff;
}

// Corruption is tracked separately from Honor and Morality, but its save modifier is derived from
// all four (Corruption Ruleset.md, HB-024): [(Good - Evil) + (Order - Chaos)] / 2, rounded down.
export function corruptionSaveModifier(axes) {
  const a = axes || {};
  return Math.floor(((num(a.good) - num(a.evil)) + (num(a.order) - num(a.chaos))) / 2);
}

// A DM-granted increase in OVERALL character level issues one Honor and one Morality allocation,
// regardless of how the level splits across classes (RES-10, HB-007). Only the DM may call this;
// the server route is the gate, this is just the arithmetic.
export function levelAllocations(fromLevel, toLevel) {
  const steps = Math.max(0, num(toLevel) - num(fromLevel));
  return { honor: steps, morality: steps, levels: steps };
}

// ── Wounds and Injuries ─────────────────────────────────────────────────
// The campaign replaced Wound Risks and Wound Threshold with this system; those two PDF fields are
// retired from active calculation and kept only as migration history (RES-02, HB-013). Wounds do not
// reduce hit points — they raise two DCs.
export const deathSaveDC = (wounds, injuries) => 10 + num(wounds) + num(injuries);
export const concentrationDC = (damage, wounds, injuries) =>
  Math.max(10, Math.floor(num(damage) / 2)) + num(wounds) + num(injuries);

export const WOUND_TRIGGERS = [
  { id: "halfMaxHp",   label: "Damage from a single source of half maximum HP or more" },
  { id: "zeroHp",      label: "Reduced to 0 HP" },
  { id: "critical",    label: "Struck by a critical hit" },
  { id: "natural1",    label: "Failed a saving throw with a natural 1" },
  { id: "dmEvent",     label: "A massive or dramatic effect, at the DM's discretion" },
];

// At the sixth Wound an Injury is determined and Wounds reset to the number of ACTIVE injuries,
// capped at five. With one injury on the sheet that reset lands on 1, which is the spec's fixture.
export const INJURY_AT_WOUNDS = 6;
export function woundsAfterInjury(activeInjuryCount) {
  return Math.min(5, Math.max(0, num(activeInjuryCount)));
}
// At most one Wound per turn by default, however many triggers fired, unless the DM overrides it.
export function woundsFromTriggers(triggers, { dmOverride = false } = {}) {
  const n = (triggers || []).length;
  return { wounds: dmOverride ? n : Math.min(1, n), suppressed: dmOverride ? 0 : Math.max(0, n - 1) };
}
// A healing spell of 4th level or higher removes `level - 3` Wounds unless the spell says otherwise.
// Injury healing follows each Injury's own rule and is never implied by Wound healing.
export const woundsRemovedBySpell = spellLevel => Math.max(0, num(spellLevel) - 3);

// ── Exhaustion: two separate tracks ─────────────────────────────────────
// Physical 5e Exhaustion is unchanged. Dream Exhaustion is its own 0-8 ladder with its own recovery
// (HB-008, DE-01..04, RES-11). The DM has confirmed the effects are CUMULATIVE: the dream d20 penalty
// stops deepening at -5 but persists through levels 6, 7 and 8 alongside everything below it.
export const DREAM_EXHAUSTION = [
  { level: 0, name: "None",             penalty: 0 },
  { level: 1, name: "Flicker",          penalty: -1 },
  { level: 2, name: "Fracture",         penalty: -2 },
  { level: 3, name: "Duality",          penalty: -3 },
  { level: 4, name: "Dissonance",       penalty: -4, concentrationDisadvantage: true },
  { level: 5, name: "Loop Entrapment",  penalty: -5, sessionLoop: true },
  { level: 6, name: "Identity Drift",   penalty: -5, concentrationDisadvantage: true, dreamScar: true, noInspirationInDream: true },
  { level: 7, name: "Dream Echo State", penalty: -5, concentrationDisadvantage: true, shadowOverride: true, visibleToNightmares: true },
  { level: 8, name: "Cognitive Collapse", penalty: -5, concentrationDisadvantage: true, collapseSave: true },
];
export const DREAM_EXHAUSTION_MAX = 8;

// Everything true at this level, with the lower levels' effects folded in.
export function dreamExhaustion(level) {
  const lv = clamp(level, 0, DREAM_EXHAUSTION_MAX);
  const out = { level: lv, name: DREAM_EXHAUSTION[lv].name, penalty: 0, effects: [] };
  for (let i = 1; i <= lv; i++) {
    const row = DREAM_EXHAUSTION[i];
    out.penalty = row.penalty;                       // deepens to -5, then holds
    for (const k of ["concentrationDisadvantage", "sessionLoop", "dreamScar",
                     "noInspirationInDream", "shadowOverride", "visibleToNightmares", "collapseSave"])
      if (row[k]) out[k] = true;
    out.effects.push({ level: i, name: row.name });
  }
  return out;
}
// The penalty applies to d20 rolls made IN a dream, not in the waking world — so the caller passes
// where the character is standing rather than the engine assuming.
export const dreamRollPenalty = (level, inDream) => (inDream ? dreamExhaustion(level).penalty : 0);

// Surviving the level-8 save: awaken at once, four PHYSICAL exhaustion levels, 1d3 long-term memories
// lost, and Dream Exhaustion STAYS at 8 (DM-09). Which memories go is the DM's call, so the engine
// reports how many to ask about and never writes any.
export function cognitiveCollapseSurvived(ch) {
  return {
    dreamExhaustion: 8,
    exhaustion: clamp(num(ch.exhaustion) + 4, 0, 6),
    memoriesLost: "1d3",
    awakenImmediately: true,
    dmResolutionRequired: true,
  };
}

// ── Rests ───────────────────────────────────────────────────────────────
// Three kinds, because the campaign has three. A long rest only reduces Dream Exhaustion if the
// character did NOT Dream Walk (DE-02), and two consecutive uninterrupted Safe Haven long rests are
// the only mundane way to clear Wounds and the Exhaustion that forcing a Grimm leaves behind.
//
// This returns a PREVIEW. Nothing is applied until the player confirms it (CS-062), and a resource
// whose recharge rule is not written down anywhere is left alone rather than guessed at.
export function restPreview(ch, { kind = "long", dreamWalked = false, safeHaven = false,
                                  dawn = false, dusk = false } = {}) {
  const changes = [];
  const next = {};
  const hpMax = maxHp(ch);
  // Item charges whose regain is a dice expression are reported rather than resolved — rolling is
  // the interface's job, and the preview says so instead of pretending to know the number.
  const roll = [];

  // A class resource whose recharge rule IS written down — the compendium's `reset` says short or
  // long — comes back here. One whose rule is written nowhere is still left alone rather than
  // guessed at; this only spends what the data already states.
  const spent = (ch.features || []).filter(f =>
    isDerivedFeature(f) && num(f.uses) > 0 && num(f.used) > 0 &&
    (f.reset === "s" || (kind !== "short" && f.reset === "l")));
  if (spent.length) {
    next.features = (ch.features || []).map(f => (spent.includes(f) ? { ...f, used: 0 } : f));
    changes.push({ label: "Class resources come back", detail: spent.map(f => f.name).join(", ") });
  }

  // Spell slots. Every expended slot comes back on a long rest — and on a SHORT rest for a class
  // whose slots work that way, which in the 2014 rules is the Warlock's Pact Magic and nothing else.
  // Which it is comes from `spells.slotsReset`, written when the class is taken and overridable by
  // hand, because a sheet may be carrying a pool the compendium never described.
  const slotsShort = String(ch.spells?.slotsReset || "l").toLowerCase() === "s";
  if (kind === "long" || slotsShort) {
    const slots = ch.spells?.slots || {};
    const spentSlots = Object.keys(slots)
      .filter(l => num(slots[l]?.used) > 0)
      .sort((a, b) => num(a) - num(b));
    if (spentSlots.length) {
      const nextSlots = {};
      for (const l of Object.keys(slots)) nextSlots[l] = { ...slots[l], used: 0 };
      next.spells = { ...(ch.spells || {}), slots: nextSlots };
      changes.push({
        label: "Spell slots come back",
        detail: spentSlots.map(l => `${num(slots[l].used)} at level ${l}`).join(", "),
      });
    }
  }

  // Item charges, on whichever trigger each item carries (CS-065). A long rest includes a short
  // one; dawn and dusk are passed in, because a party that rested from noon passed neither.
  const recharging = rechargePlan(ch, { kind, dawn, dusk });
  if (recharging.length) {
    const whole = recharging.filter(p => p.all).map(p => ({ where: p.where, by: p.used }));
    if (whole.length) Object.assign(next, applyRecharge(ch, whole));
    for (const p of recharging) if (!p.all) roll.push(p);
    changes.push({ label: "Item charges come back",
      detail: recharging.map(p => p.all ? p.name : `${p.name} — roll ${p.regain}`).join(", ") });
  }

  // Hit dice. A short rest is where they are spent, and the dialog does that itself — the preview
  // only says how many are there to spend, because how many you want is not something to guess at.
  // A long rest hands back half the pool, rounded down, minimum one (CS-031, CS-062).
  const hd = hitDiceState(ch);
  if (kind === "short") {
    changes.push({ label: "Hit dice may be spent",
      detail: hd.total ? `${hd.left} of ${hd.total} left — spend them below`
        : "None on your sheet yet — set the pool in Character › Identity" });
  } else if (hd.used > 0) {
    const r = restoreHitDice(ch, Math.min(hd.used, hitDiceRegained(hd.total)));
    next.hitDiceUsed = r.hitDiceUsed;
    changes.push({ label: "Hit dice come back", detail: formatHitDice(r.back),
      from: hd.left, to: hd.left + r.restored });
  }

  if (kind !== "short") {
    next.hp = hpMax;
    changes.push({ label: "Hit points", from: num(ch.hp), to: hpMax });
    // Coming back from zero clears the death saves, here as everywhere else. It is listed in the
    // preview rather than done quietly, because a rest is read before it is taken.
    if (clearsDeathSaves(ch.hp, hpMax)
        && (num(ch.deathSaveSuccesses) || num(ch.deathSaveFailures))) {
      next.deathSaveSuccesses = 0;
      next.deathSaveFailures = 0;
      changes.push({ label: "Death saves", detail: "Cleared — you are above zero hit points again" });
    }
    if (dreamWalked) {
      changes.push({
        label: "Dream Exhaustion", detail: "No change — this rest included Dream Walking",
        from: num(ch.dreamExhaustion), to: num(ch.dreamExhaustion),
      });
    } else if (num(ch.dreamExhaustion) > 0) {
      next.dreamExhaustion = num(ch.dreamExhaustion) - 1;
      changes.push({ label: "Dream Exhaustion", from: num(ch.dreamExhaustion), to: next.dreamExhaustion });
    }
    if (num(ch.exhaustion) > 0 && safeHaven) {
      next.exhaustion = num(ch.exhaustion) - 1;
      changes.push({ label: "Exhaustion", from: num(ch.exhaustion), to: next.exhaustion });
    }
  }
  if (safeHaven && kind === "long") {
    changes.push({
      label: "Wounds",
      detail: "Two consecutive uninterrupted Safe Haven long rests clear all Wounds",
      from: num(ch.wounds), to: num(ch.safeHavenRests) >= 1 ? 0 : num(ch.wounds),
    });
    if (num(ch.safeHavenRests) >= 1) next.wounds = 0;
    next.safeHavenRests = num(ch.safeHavenRests) + 1;
  } else if (kind === "long") {
    next.safeHavenRests = 0;      // the pair has to be consecutive
  }
  return { kind, dreamWalked, safeHaven, dawn, dusk, changes, next, roll };
}

// ── Cognitive Saving Throw ──────────────────────────────────────────────
// d20 + Dream modifier + the HIGHEST of the six standard ability modifiers. Dream itself is excluded
// from that second term and proficiency is NOT added — a CogST is not a check (DM-10, RES-01).
export function cognitiveSavingThrowBonus(ch) {
  const best = Math.max(...STANDARD_ABILITIES.map(id => abilityModifier(ch, id)));
  return abilityModifier(ch, "dream") + best;
}
export const cognitiveSavingThrow = (ch, roll) => num(roll) + cognitiveSavingThrowBonus(ch);
// Its two notes disagree on ties — one takes a silent max, the other lets the creature choose. The
// total is identical either way, so the engine reports which abilities tied and lets the sheet say so.
export function cognitiveSavingThrowSources(ch) {
  const mods = STANDARD_ABILITIES.map(id => ({ id, mod: abilityModifier(ch, id) }));
  const best = Math.max(...mods.map(m => m.mod));
  return { best, tied: mods.filter(m => m.mod === best).map(m => m.id) };
}

// ── Fabricate's two formulas ────────────────────────────────────────────
// A general Fabricate check is the skill. Crafting a DREAM ITEM additionally adds Intelligence, and
// the recipe supersedes the generic skill association (RES-06). Proficiency is counted once in both.
export function fabricateGeneral(ch) {
  return abilityModifier(ch, "dream")
    + profContribution(proficiencyBonus(ch.level), ch.skills?.fabricate);
}
export function fabricateCrafting(ch) {
  return abilityModifier(ch, "int") + fabricateGeneral(ch);
}

// ── Arcanum Veritas and Dream DCs ───────────────────────────────────────
// Verum Modifier is the character's highest ability modifier; the Verum DC folds in Dream on top.
export const verumModifier = ch => Math.max(...STANDARD_ABILITIES.map(id => abilityModifier(ch, id)));
export const verumDC = ch =>
  8 + proficiencyBonus(ch.level) + verumModifier(ch) + abilityModifier(ch, "dream")
  + modifierTotal(activeModifiers(ch), "saveDc");
export const sealAttackBonus = ch => proficiencyBonus(ch.level) + verumModifier(ch);
// Seals per long rest, and inscriptions held at once, both equal the proficiency bonus.
export const sealUses = ch => proficiencyBonus(ch.level);
// Your own Dream DC, the one others roll against to reach you (Dream Abilities.md, Dream Walking).
export const ownDreamDC = ch => 15 + proficiencyBonus(ch.level) + abilityModifier(ch, "dream");
// Cognitive Sense: one use per short rest, two at Dream 18 or higher, and Pulse and Whisper spend
// from that one shared pool (DM-11, CGS-01).
export const cognitiveSenseUses = ch => (abilityScore(ch, "dream") >= 18 ? 2 : 1);

// ── Fate Die: Rolling With Emphasis ─────────────────────────────────────
// A player spends one DM-granted Fate use to re-roll a consequential roll that JUST happened: roll
// 2d20 and keep the natural face farthest from 10. Equidistant faces reroll BOTH dice; the optional
// higher-die variant is not active here (DM-04..07, FD-01..04, RES-04).
//
// Selection is on the natural faces only — never on advantage, and never on totals after modifiers.
export const emphasisDistance = die => Math.abs(num(die) - 10);
export function emphasisPick(a, b) {
  const da = emphasisDistance(a), db = emphasisDistance(b);
  if (da === db) return { tie: true, pick: null, dice: [num(a), num(b)], distances: [da, db] };
  return { tie: false, pick: da > db ? num(a) : num(b), dice: [num(a), num(b)], distances: [da, db] };
}
// Rolls until the distances differ, keeping every pair so the log can show the ties that were
// rerolled. `rng` is injectable so the tests are deterministic. The cap is a loop guard, not a rule:
// a d20 pair ties on only 10 of 400 outcomes, so reaching it means the rng is broken.
export function rollEmphasis(rng = Math.random, maxRerolls = 50) {
  const d20 = () => 1 + Math.floor(rng() * 20);
  const pairs = [];
  for (let i = 0; i <= maxRerolls; i++) {
    const r = emphasisPick(d20(), d20());
    pairs.push({ dice: r.dice, distances: r.distances, tie: r.tie });
    if (!r.tie) return { pairs, pick: r.pick, rerolls: i };
  }
  throw new Error("Emphasis never resolved — check the random source.");
}
// Whether a balance can pay for a use. Fate is granted ONLY by the DM and never recharges, so there
// is no "restore" path anywhere in this engine on purpose (DM-05).
export const canSpendFate = ch => num(ch.fate) > 0;

// ── Pair Action ─────────────────────────────────────────────────────────
// DC 8 + both proficiency bonuses + the HIGHER of the two eligible modifiers, applied once, never
// summed (DM-12, RES-14).
export const pairActionDC = (pbA, pbB, modA, modB) =>
  8 + num(pbA) + num(pbB) + Math.max(num(modA), num(modB));

// ── Cognitions ──────────────────────────────────────────────────────────
// Learn DCs are 5 x Tier for a quarter, +5 for a half, +10 for full; Tier III and above can only be
// finished by a DM-declared Epiphany (Learning Cognitions.md). Roll is 1d20 + Dream modifier.
export const COGNITION_TIERS = { I: 1, II: 2, III: 3, IV: 4, V: 5 };
export const COGNITION_DEPTHS = ["none", "quarter", "half", "threshold", "full"];
export function cognitionLearnDC(tier, threshold) {
  const t = COGNITION_TIERS[tier] || num(tier);
  if (!t) return null;
  const step = { quarter: 0, half: 5, threshold: 5, full: 10 }[threshold];
  return step == null ? null : 5 * t + step;
}
export const cognitionNeedsEpiphany = tier => (COGNITION_TIERS[tier] || num(tier)) >= 3;

// The whole table at once, which is what a player actually wants in front of them: the DC for each
// depth at each Tier, and which Tiers cannot be finished by rolling at all. The sheet prints this
// rather than one number because a Cognition you have NOT been granted does not tell the browser
// its Tier — deliberately, on the server — so the row you need is the one you read off.
export function cognitionLadder() {
  return Object.keys(COGNITION_TIERS).map(tier => ({
    tier,
    needsEpiphany: cognitionNeedsEpiphany(tier),
    steps: ["quarter", "half", "threshold", "full"]
      .map(threshold => ({ threshold, dc: cognitionLearnDC(tier, threshold) })),
  }));
}
// What the tracker's four marks mean, in the words the builder's Learning tab already uses — one
// vocabulary across both tools, because they are the same record seen from two places.
export const COGNITION_DEPTH_NOTE = [
  "not begun",
  "Learn ¼ — rituals only",
  "Learn ½ — as a secondary Cognition",
  "past ½",
  "Learn Full",
];
export const cognitionUnderstandingBonus = ch => abilityModifier(ch, "dream");

// ── Attunement ──────────────────────────────────────────────────────────
// Three baseline slots plus feature overrides, and three more that exist only in Insomnia for
// Dreamlike and Lucidlike items. Leaving Insomnia does NOT unattune anything — the records stay and
// the extra-slot effects go inactive until the character is eligible again (DM-14, RES-09).
export const ATTUNEMENT_BASELINE = 3;
export const ATTUNEMENT_INSOMNIA = 3;

// ── Equipment slots ─────────────────────────────────────────────────────
// From Equipment Ruleset.md, which owns them: one item per slot unless a feature says otherwise.
// Zariel's own Equipment note lists only two rings and adds a "Ranged Weapon" row; the ruleset is
// the canon, so four rings it is, and a ranged weapon goes in a hand like any other weapon.
//
// Tail, Wings and Horn are `optional` because most characters have none — and eighteen slots on a
// sheet that is meant to fit one screen is a lot of nothing. The party has a Dragonborn and two
// Tieflings, so they are a toggle rather than an omission.
export const WORN_SLOTS = [
  { id: "head", name: "Head", eg: "Helm, circlet, mask" },
  { id: "face", name: "Face", eg: "Goggles, visor" },
  { id: "neck", name: "Neck", eg: "Amulet, pendant" },
  { id: "shoulders", name: "Shoulders", eg: "Mantle, cloak, scarf" },
  { id: "back", name: "Back", eg: "Cape, cloak, quiver" },
  { id: "chest", name: "Chest", eg: "Armour, robe, tunic" },
  { id: "arms", name: "Arms", eg: "Bracers, armwraps" },
  { id: "hands", name: "Hands", eg: "Gloves, gauntlets" },
  { id: "ring1", name: "Ring I", eg: "Magical rings" },
  { id: "ring2", name: "Ring II", eg: "Magical rings" },
  { id: "ring3", name: "Ring III", eg: "Magical rings" },
  { id: "ring4", name: "Ring IV", eg: "Magical rings" },
  { id: "waist", name: "Waist", eg: "Belt, sash" },
  { id: "legs", name: "Legs", eg: "Trousers, greaves" },
  { id: "feet", name: "Feet", eg: "Boots, sandals" },
  { id: "tail", name: "Tail", eg: "For creatures with tails", optional: true },
  { id: "wings", name: "Wings", eg: "Harnesses, grafted wings", optional: true },
  { id: "horn", name: "Horn", eg: "Circlets for horned beings", optional: true },
];
export const WIELDED_SLOTS = [
  { id: "mainHand", name: "Main Hand", eg: "Weapon, shield or focus" },
  { id: "offHand", name: "Off Hand", eg: "Shield, second weapon or focus" },
  { id: "ammunition", name: "Ammunition", eg: "Quiver, pouch, case" },
];
export const EQUIPMENT_SLOTS = [...WORN_SLOTS, ...WIELDED_SLOTS];
export const SLOT_BY_ID = Object.fromEntries(EQUIPMENT_SLOTS.map(s => [s.id, s]));

// Which slots a sheet should show: the always-on ones, plus any optional one the character has
// turned on or already has something in.
export const slotsFor = (ch, list = EQUIPMENT_SLOTS) => list.filter(s =>
  !s.optional || (ch.anatomy || []).includes(s.id) || (ch.equipment || {})[s.id]?.name);

// Everything attuned, wherever it is recorded: a worn or wielded slot, a carried item, or the
// legacy flat list a sheet had before equipment existed. One place to ask, so the count on the
// Gear tab and the count in the rail can never disagree.
export function attunedItems(ch) {
  const out = [];
  for (const s of EQUIPMENT_SLOTS) {
    const it = (ch.equipment || {})[s.id];
    if (it && it.name && it.attuned) out.push({ ...it, slot: s.id });
  }
  for (const it of ch.carried || []) if (it && it.name && it.attuned) out.push({ ...it });
  for (const it of ch.attuned || []) if (it && it.name) out.push({ ...it });
  return out;
}

// ── Items ───────────────────────────────────────────────────────────────
// One record wherever it is — in a slot or in the pack — so a thing does not change shape when you
// put it on. Beyond the name it carries what a table actually asks about mid-session: what it
// weighs, what it is worth, how many charges are left, and what it is DOING to your numbers.
//
// `effects` are the same `{ target, amount }` pairs a hand-written modifier uses, which is the whole
// trick: an item does not need its own arithmetic anywhere in this engine. It contributes modifiers,
// those modifiers go through the one path every total already reads, and a +1 ring shows up in the
// breakdown beside Bless with its own name on it.
export const ITEM_RECHARGE = [
  { id: "manual", label: "Only when you say so", hint: "Nothing gives these back on its own." },
  { id: "short", label: "On a short rest", hint: "And on a long one, which includes it." },
  { id: "long", label: "On a long rest" },
  { id: "dawn", label: "At dawn", hint: "A long rest gives these back only if it carried you through dawn." },
  { id: "dusk", label: "At dusk" },
];
export const RECHARGE_BY_ID = Object.fromEntries(ITEM_RECHARGE.map(r => [r.id, r]));

// Charges, read safely: an item with no charges says so by returning null rather than zeroes, so
// "has no charges" and "has none left" never read the same.
export function itemCharges(it) {
  const c = it?.charges;
  if (!c || num(c.max) <= 0) return null;
  const max = num(c.max), used = clamp(c.used, 0, max);
  return { max, used, left: max - used,
    recharge: RECHARGE_BY_ID[c.recharge] ? c.recharge : "manual",
    // "all" or a dice expression the sheet rolls — "1d6+1" is how half the published wands word it.
    regain: String(c.regain || "all").trim() || "all" };
}
export const itemWeightTotal = it =>
  Math.round(num(it?.weight) * Math.max(1, num(it?.qty) || 1) * 100) / 100;
export const itemEffectList = it =>
  (it?.effects || []).filter(e => e && e.target && num(e.amount) !== 0)
    .map(e => ({ target: String(e.target), amount: num(e.amount) }));

// Every item on the character, and where it is, so one piece of code can walk them all. `where` is
// the address the interface hands back when it wants to change one.
export function allItems(ch) {
  const out = [];
  for (const s of EQUIPMENT_SLOTS) {
    const it = (ch?.equipment || {})[s.id];
    if (it && it.name) out.push({ item: it, where: `slot:${s.id}`, slot: s.id, slotName: s.name });
  }
  (ch?.carried || []).forEach((it, i) => {
    if (it && it.name) out.push({ item: it, where: `pack:${i}`, index: i });
  });
  return out;
}
export const findItem = (ch, where) => allItems(ch).find(r => r.where === where) || null;

// Whether an item's effects are in force. Equipped, because a ring in your pack has never done
// anything; attuned, where the item says it needs to be; and awake-or-dreaming, because a Dreamlike
// item goes inactive outside Insomnia without the attunement breaking (DM-14, RES-09).
//
// The attunement CAP is deliberately not enforced here. The sheet reports being over it and leaves
// the choice to the player, the way it reports every other thing it will not referee.
export function itemIsActive(ch, it, where) {
  if (!it || !it.name || !String(where || "").startsWith("slot:")) return false;
  if (it.requiresAttunement && !it.attuned) return false;
  if (it.insomniaOnly && !ch?.inInsomnia) return false;
  return true;
}

export function itemEffects(ch) {
  const out = [];
  for (const r of allItems(ch)) {
    if (!itemIsActive(ch, r.item, r.where)) continue;
    for (const e of itemEffectList(r.item))
      out.push({ id: `itm:${r.where}:${e.target}`, target: e.target, amount: e.amount,
        reason: r.item.name, rounds: null, active: true, source: "item", where: r.where });
  }
  return out;
}

// Everything adjusting this character right now: what someone wrote down, and what their equipment
// implies. Every total in this file reads THIS rather than the stored list, which is why equipping
// a +1 cloak moves the AC without anything being written into the sheet twice.
export const activeModifiers = ch => [...(ch?.modifiers || []), ...itemEffects(ch)];
export const isItemModifier = m => typeof m?.id === "string" && m.id.startsWith("itm:");

export function spendCharges(it, n = 1) {
  const c = itemCharges(it);
  if (!c || c.left < Math.max(1, num(n))) return null;
  return { ...it.charges, used: c.used + Math.max(1, num(n)) };
}
export function restoreCharges(it, n) {
  const c = itemCharges(it);
  if (!c || !c.used) return null;
  return { ...it.charges, used: Math.max(0, c.used - (n == null ? c.used : num(n))) };
}

// Which charges a rest gives back. A long rest includes a short one; dawn and dusk are asked about
// rather than assumed, because a party that rested from noon did not pass either (CS-065).
export function rechargePlan(ch, { kind = "long", dawn = false, dusk = false } = {}) {
  const fires = new Set(kind === "short" ? ["short"] : ["short", "long"]);
  if (dawn) fires.add("dawn");
  if (dusk) fires.add("dusk");
  return allItems(ch)
    .map(r => ({ r, c: itemCharges(r.item) }))
    .filter(({ c }) => c && c.used > 0 && fires.has(c.recharge))
    .map(({ r, c }) => ({ where: r.where, name: r.item.name, used: c.used, max: c.max,
      regain: c.regain, all: c.regain === "all" }));
}

// Applying it. `by` is how many charges to hand back; leaving it out hands all of them back.
export function applyRecharge(ch, rows) {
  const equipment = { ...(ch?.equipment || {}) };
  const carried = [...(ch?.carried || [])];
  for (const row of rows || []) {
    const found = findItem(ch, row?.where);
    if (!found) continue;
    const charges = restoreCharges(found.item, row.by);
    if (!charges) continue;
    if (found.slot) equipment[found.slot] = { ...found.item, charges };
    else carried[found.index] = { ...found.item, charges };
  }
  return { equipment, carried };
}

// ── Coin and weight ─────────────────────────────────────────────────────
// Fifty coins to the pound, whatever they are made of, which is the one piece of 5e encumbrance
// everybody actually uses. Carrying capacity is Strength x 15; the encumbrance thresholds below it
// are the OPTIONAL variant, so they are reported and never enforced.
export const COINS = [
  { id: "pp", name: "Platinum", short: "pp", gp: 10 },
  { id: "gp", name: "Gold", short: "gp", gp: 1 },
  { id: "ep", name: "Electrum", short: "ep", gp: 0.5 },
  { id: "sp", name: "Silver", short: "sp", gp: 0.1 },
  { id: "cp", name: "Copper", short: "cp", gp: 0.01 },
];
export const coinTotalGp = coins =>
  Math.round(COINS.reduce((t, c) => t + num(coins?.[c.id]) * c.gp, 0) * 100) / 100;
export const coinCount = coins => COINS.reduce((t, c) => t + num(coins?.[c.id]), 0);
export const coinWeight = coins => coinCount(coins) / 50;

export function carriedWeight(ch) {
  const items = allItems(ch).reduce((t, r) => t + itemWeightTotal(r.item), 0);
  const coins = coinWeight(ch?.coins);
  return { items: Math.round(items * 100) / 100, coins: Math.round(coins * 100) / 100,
    total: Math.round((items + coins) * 100) / 100 };
}
export function carryingCapacity(ch) {
  const str = abilityScore(ch, "str");
  return { capacity: str * 15, encumbered: str * 5, heavilyEncumbered: str * 10 };
}
// Which band the load falls in, under the optional rule. "none" is the only one that is not a penalty.
export function encumbrance(ch) {
  const { total } = carriedWeight(ch);
  const cap = carryingCapacity(ch);
  if (total > cap.capacity) return { band: "over", label: "Over your capacity", total, ...cap };
  if (total > cap.heavilyEncumbered)
    return { band: "heavy", label: "Heavily encumbered", total, ...cap };
  if (total > cap.encumbered) return { band: "light", label: "Encumbered", total, ...cap };
  return { band: "none", label: "", total, ...cap };
}

export function attunement(ch, { inInsomnia = false } = {}) {
  const baseline = ATTUNEMENT_BASELINE + num(ch.attunementBonus);
  const items = attunedItems(ch);
  const dreamish = items.filter(i => i && i.insomniaOnly);
  const normal = items.filter(i => i && !i.insomniaOnly);
  return {
    baseline, used: normal.length, insomniaSlots: ATTUNEMENT_INSOMNIA,
    insomniaUsed: dreamish.length, inInsomnia,
    // "Active" is the distinction the ruling asks for: owned, equipped, attuned — and in effect.
    active: [...normal.slice(0, baseline), ...(inInsomnia ? dreamish.slice(0, ATTUNEMENT_INSOMNIA) : [])],
    inactive: inInsomnia ? [] : dreamish,
    over: Math.max(0, normal.length - baseline),
  };
}

// ── Conditions the campaign rewrote ────────────────────────────────────
// Only the ones whose 2014 text does NOT apply. Everything else uses the standard condition, and the
// sheet must not stack a rewritten condition on top of its 5e namesake (RES-08, HB-014).
//
// Bound is two conditions, not one: an effect that says only "Bound" no longer resolves, so they keep
// independent ids, names, rules and durations and never merge (DM-13, RES-07).
export const CONDITIONS = {
  "stunned": {
    id: "stunned", name: "Stunned", campaign: true,
    // "Your turn is taken apart, not taken away." Must NOT also apply 5e stunned or incapacitated.
    allowances: { speedHalved: true, reactions: false, actionOrBonusNotBoth: true, maxAttacks: 1 },
    note: "Speed halved, no Reactions, Action OR Bonus Action but not both, never more than one attack.",
  },
  "paralyzed": {
    id: "paralyzed", name: "Paralyzed", campaign: true, keepsStandardText: true,
    note: "At the start of your turn choose Resist (repeat the save) or Force Through (+1 Exhaustion, suppressed until end of turn, no save this turn).",
  },
  "bound.term": {
    id: "bound.term", name: "Bound — Term", campaign: true,
    note: "Binding by a declared term. Independent of Bound — Proximity.",
  },
  "bound.proximity": {
    id: "bound.proximity", name: "Bound — Proximity", campaign: true,
    note: "Binding by creature proximity. Independent of Bound — Term.",
  },
};

// Force Through: act despite paralysis until the end of this turn, for one level of PHYSICAL
// Exhaustion. There is no written limit on how often, and Dream Exhaustion is untouched.
export function forceThrough(ch) {
  return {
    exhaustion: clamp(num(ch.exhaustion) + 1, 0, 6),
    dreamExhaustion: num(ch.dreamExhaustion),
    suppressedUntilEndOfTurn: true,
    saveThisTurn: false,
  };
}

// ── Star Force ──────────────────────────────────────────────────────────
// Dream 18 is eligibility and nothing else: the transition needs a DM-controlled epiphany, and it is
// never automatic (RES-12, HB-025). Starting Wish Embers are 3 x attained Grimm stages + distinct
// known Cognitions + distinct Cognitions mastered at Tier III — attained stages, not possible ones.
export const starForceEligible = ch => abilityScore(ch, "dream") >= 18;
export const wishEmbers = ({ grimmStagesAttained = 0, knownCognitions = 0, masteredTierIII = 0 } = {}) =>
  3 * num(grimmStagesAttained) + num(knownCognitions) + num(masteredTierIII);

// The transition itself. Reaching 18 is not a trigger — without an explicit DM epiphany this returns
// nothing, which is the whole point of the ruling. A player can never call this path.
export function starForceTransition(ch, { dmEpiphany = false } = {}) {
  if (!dmEpiphany) {
    return { transitioned: false, eligible: starForceEligible(ch), reason: "Requires a DM-declared epiphany." };
  }
  return {
    transitioned: true,
    imaginari: abilityScore(ch, "dream"),
    capRemoved: true,
    // Grimm and Arcanum Veritas Cognitions become history, not simultaneously castable.
    legacyReadOnly: ["grimm", "cognitions"],
  };
}

// ── Hit points ──────────────────────────────────────────────────────────
// Healing never exceeds the maximum; temporary HP replaces rather than stacks unless a campaign rule
// says otherwise (CS-030); damage eats temporary HP first. Returns the next values plus the Wound
// triggers this event may have fired, flagged for adjudication rather than applied — the sheet asks,
// it does not decide (HB-010, RES-02).
export function applyDamage(ch, amount, { critical = false } = {}) {
  const dmg = Math.max(0, num(amount));
  const temp = num(ch.tempHp);
  const absorbed = Math.min(temp, dmg);
  const hp = clamp(num(ch.hp) - (dmg - absorbed), 0, maxHp(ch));
  const triggers = [];
  if (dmg > 0 && dmg >= Math.ceil(maxHp(ch) / 2)) triggers.push("halfMaxHp");
  if (hp === 0) triggers.push("zeroHp");
  if (critical) triggers.push("critical");
  return {
    hp, tempHp: temp - absorbed, absorbed, dealt: dmg,
    woundTriggers: triggers,
    concentrationDC: concentrationDC(dmg, ch.wounds, ch.injuries?.length ?? ch.injuries),
  };
}
// Regaining a hit point from zero clears the death saves — Ephemer follows 5e here (Juan,
// 2026-10-28). It is a predicate rather than a mutation because nothing in this file touches a
// character, and it is exported so that every way of coming back — a heal, a hit die, a long rest
// — asks the same question instead of each deciding for itself.
export const clearsDeathSaves = (hpBefore, hpAfter) => num(hpBefore) <= 0 && num(hpAfter) > 0;

export function applyHealing(ch, amount) {
  const max = maxHp(ch);
  const before = clamp(num(ch.hp), 0, max);
  const hp = clamp(before + Math.max(0, num(amount)), 0, max);
  return { hp, healed: hp - before, revived: clearsDeathSaves(before, hp) };
}
export function applyTempHp(ch, amount) {
  const next = Math.max(0, num(amount));
  return { tempHp: Math.max(num(ch.tempHp), next), replaced: next > num(ch.tempHp) };
}

// ── Class progression ───────────────────────────────────────────────────
// What a class gives a character — derived, not typed in. A class definition from the compendium
// carries `levels[n]` holding `features`, `slots`, `counters` and `scoreImprovement`; this section
// turns that, plus the character's own `classes` entry, into the features, resources and pending
// choices the sheet shows. It stays pure: the definitions are passed IN, because the catalogue is a
// fetch and nothing in this file may reach the network (NF-002).
//
// WHY DERIVE RATHER THAN COPY. The first flow wrote a class's features into the sheet once, when the
// class was picked, and never looked again — so a level granted afterwards brought nothing with it,
// and a corrected level left behind features the character no longer had. Deriving means the sheet
// records only the decisions (which class, which level, which subclass, which menu picks) and the
// feature list is recomputed from them, so a level up, a rollback, a changed subclass and a
// re-import all land in the same place.

// A Fight Club feature name carries its group in a prefix: "Fighting Style: Archery",
// "School of Evocation: Sculpt Spells", "Oath of Devotion Channel Divinity: Sacred Weapon". Those
// prefixes are the only thing that identifies a subclass in the data, and they hold for a homebrew
// class the DM imports too, because one parser reads both (fc5e.mjs).
export function featureGroup(name) {
  const s = String(name || "");
  const i = s.indexOf(": ");
  return i < 0 ? { group: "", label: s } : { group: s.slice(0, i), label: s.slice(i + 2) };
}

// Groups that are a MENU rather than an archetype: the character picks from them, and the prefix
// names the menu instead of a subclass. Everything else prefixed is read as a subclass's own
// feature — which is what makes "choose the subclass once, and get its later features without being
// asked again" work for a class this code has never seen. The number is how many to take where the
// rules fix it; absent means the class table says, and counting is the player's.
export const OPTION_MENUS = { "Fighting Style": 1, "Metamagic": 2 };

// "Oath of Devotion Channel Divinity" and "Oath of Devotion" are one subclass under two headings —
// the suffix is the feature's category, not a different archetype.
const GROUP_SUFFIXES = [" Channel Divinity"];
export function subclassKey(group) {
  let g = String(group || "");
  for (const s of GROUP_SUFFIXES) if (g.endsWith(s)) g = g.slice(0, -s.length);
  return g;
}

export const classLevels = def =>
  Object.keys(def?.levels || {}).map(Number).filter(n => n > 0).sort((a, b) => a - b);

// Every optional feature a class offers, grouped by its prefix, and what each group IS.
//
// Three things wear the same `Prefix: Name` shape and mean entirely different things:
//
//   archetype  `Champion: Improved Critical`   — a feature belonging to one archetype
//   category   `Martial Archetype: Champion`   — the class ANNOUNCING that archetype as a choice
//   menu       `Fighting Style: Archery`       — a list to pick from that is not an archetype at all
//
// The SRD ships one archetype per class and no announcements, so the first cut of this read every
// prefix as an archetype — and the moment the real books went in, "Martial Archetype", "Divine
// Domain" and "Arcane Tradition" turned up in the picker as though they were subclasses you could be.
//
// They are told apart structurally rather than by a list of names, so an imported homebrew class is
// read correctly without anyone registering it: **a category is a group whose options are mostly the
// names of other groups.** "Martial Archetype" offers Champion, Battle Master, Echo Knight — every
// one of them a group in its own right. "Fighting Style" offers Archery and Defense, which name
// nothing. The category is also the best label the sheet has for the question it is about to ask:
// a Cleric is asked for a Divine Domain, not for a "subclass".
export function classGroups(def) {
  const groups = new Map();
  for (const lv of classLevels(def))
    for (const f of def?.levels?.[lv]?.features || []) {
      if (!f?.optional || !f.name) continue;
      const { group, label } = featureGroup(f.name);
      const g = group || "";
      if (!groups.has(g)) groups.set(g, { name: g, level: lv, options: [] });
      const row = groups.get(g);
      row.level = Math.min(row.level, lv);
      row.options.push({ name: f.name, label: label || f.name, text: f.text || "", level: lv });
    }

  const keys = new Set([...groups.keys()].filter(Boolean).map(subclassKey));
  const kinds = new Map();
  const categories = [], menus = [];
  const archetypes = new Map();
  const note = (name, level) => {
    const key = subclassKey(name);
    if (!key) return;
    if (!archetypes.has(key) || archetypes.get(key).level > level) archetypes.set(key, { name: key, level });
  };

  for (const [g, row] of groups) {
    if (!g || g in OPTION_MENUS) { kinds.set(g, "menu"); menus.push(row); continue; }
    const named = row.options.filter(o => keys.has(subclassKey(o.label))).length;
    if (row.options.length && named * 2 > row.options.length) {
      kinds.set(g, "category"); categories.push(row);
      // An archetype that announces itself but grants nothing of its own is still an archetype.
      for (const o of row.options) note(o.label, row.level);
      continue;
    }
    // A menu is spent at one level and an archetype is not. `Pact Boon` offers its three pacts at
    // level 3 and never speaks again; `Champion` speaks at 3, 7, 10, 15 and 18. That is the whole
    // difference between "pick one of these" and "this is what you are", and it is the only thing in
    // the data that separates them — both are a prefix over a list of alternatives.
    if (new Set(row.options.map(o => o.level)).size === 1 && row.options.length > 1) {
      kinds.set(g, "menu"); menus.push(row); continue;
    }
    kinds.set(g, "archetype");
    note(g, row.level);
  }

  const list = [...archetypes.values()].sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  return {
    groups, kinds, categories, menus, archetypes: list,
    // What this class calls the question. Its own word for it beats ours every time.
    label: categories.length ? categories[0].name : "Subclass",
    // WHEN it is asked is the class's business too, and it is NOT the earliest level any archetype
    // happens to speak at. A Wizard chooses an Arcane Tradition at 2; the campaign's School of Blade
    // Dancing grants something at 1, and reading the minimum would have dragged the question down to
    // level 1 for every Wizard in the game. The announcement is the authority; the minimum is only
    // the fallback for a class that never announces.
    askedAt: categories.length ? categories[0].level : (list[0]?.level ?? null),
  };
}

// Every archetype this class offers, and the level each one first speaks at. Read out of the data,
// so an imported class brings its own subclasses with it and nothing here is ever hard-coded.
export const subclassOptions = def => classGroups(def).archetypes;

export const asiDueAt = (def, classLevel) => !!(def?.levels || {})[num(classLevel)]?.scoreImprovement;

// Which rest brings a class's spell slots back. Everybody is "l" except Pact Magic, and nothing in
// the compendium data marks that — so it is read off the feature the class actually grants rather
// than a list of class names, which is the same reason subclasses are detected structurally. A
// homebrew pact caster that names its feature Pact Magic is read correctly without being registered.
export function slotResetFor(def) {
  for (const lv of classLevels(def))
    for (const f of def?.levels?.[lv]?.features || [])
      if (/^pact magic$/i.test(featureGroup(f?.name || "").label.trim())) return "s";
  return "l";
}

const featureId = (className, level, name) => `cls:${className}:${level}:${name}`;
const resourceId = (className, name) => `res:${className}:${name}`;
// Both derived prefixes in one test, because reconcileFeatures has to tell a feature the engine owns
// from one the player typed, and getting that backwards deletes someone's notes.
export const isDerivedFeature = f =>
  typeof f?.id === "string" && (f.id.startsWith("cls:") || f.id.startsWith("res:"));

const RESET_TEXT = { s: "Comes back on a short or long rest.", l: "Comes back on a long rest." };

// Everything one class at one level brings. `subclass` is the archetype chosen and `picks` the menu
// choices made, keyed `<level>:<group>`; both live on the sheet's own class entry, so no decision
// here has to be made twice.
export function classProgress(def, level, { subclass = "", picks = {} } = {}) {
  const lv = Math.max(0, num(level));
  const name = def?.name || "";
  const sub = subclassKey(subclass);
  const shape = classGroups(def);
  const granted = [], choices = [], asiLevels = [];
  const counters = new Map();           // by name: the highest level at or below this one wins
  let slots = null;

  for (const n of classLevels(def)) {
    if (n > lv) continue;
    const row = def.levels[n] || {};
    if (row.scoreImprovement) asiLevels.push(n);
    if (row.slots) slots = row.slots;
    const menus = new Map();

    for (const f of row.features || []) {
      if (!f?.name) continue;
      const { group, label } = featureGroup(f.name);
      if (!f.optional) {
        granted.push({ id: featureId(name, n, f.name), name: f.name, text: f.text || "",
          source: "class", className: name, level: n });
        continue;
      }
      const kind = shape.kinds.get(group || "");
      if (kind === "archetype" || kind === "category") {
        // An archetype's own feature is matched on its PREFIX (`Champion: Improved Critical`); an
        // announcement is matched on its LABEL (`Martial Archetype: Champion`), because there the
        // prefix is the question and the label is the answer. Either way it arrives only for the
        // archetype this character follows — nobody needs fifteen domains on one sheet.
        const belongs = subclassKey(kind === "category" ? label : group);
        if (sub && belongs === sub)
          granted.push({ id: featureId(name, n, f.name), name: f.name, text: f.text || "",
            source: "class", className: name, level: n, subclass: sub });
        continue;
      }
      const g = group || "";              // a bare-named option belongs to its level's own menu
      if (!menus.has(g)) menus.set(g, []);
      menus.get(g).push({ name: f.name, label: label || f.name, text: f.text || "" });
    }

    for (const [g, options] of menus) {
      const id = `${n}:${g}`;
      const taken = (picks[id] || []).filter(p => options.some(o => o.name === p));
      for (const p of taken) {
        const o = options.find(x => x.name === p);
        granted.push({ id: featureId(name, n, o.name), name: o.name, text: o.text,
          source: "class", className: name, level: n, choice: id });
      }
      const want = OPTION_MENUS[g] ?? null;
      choices.push({ id, kind: "menu", level: n, group: g, className: name,
        label: g || menuLabel(row, n), pick: want, options, taken,
        done: want == null ? taken.length > 0 : taken.length >= want });
    }

    for (const c of row.counters || [])
      if (c?.name) counters.set(c.name, { name: c.name, value: num(c.value), reset: c.reset || "", level: n });
  }

  // A class resource is a feature with uses: the data says how big the pool is and which rest brings
  // it back, so it is tracked rather than described. It stays derived, which is why the level that
  // widens Ki Points from 2 to 3 widens it on the sheet without anyone editing anything.
  const resources = [...counters.values()].map(c => ({
    id: resourceId(name, c.name), name: c.name, source: "class", className: name, level: c.level,
    uses: c.value, used: 0, reset: String(c.reset || "").toLowerCase(),
    text: RESET_TEXT[String(c.reset || "").toLowerCase()] || "",
  }));

  // The archetype itself, asked once at the level that first offers one, in the class's own words.
  const subs = shape.archetypes;
  if (subs.length && shape.askedAt != null && shape.askedAt <= lv && !sub)
    choices.unshift({ id: "subclass", kind: "subclass", level: shape.askedAt, className: name,
      label: shape.label, pick: 1, taken: [], done: false,
      options: subs.map(s => ({ name: s.name, label: s.name, text: "" })) });

  return {
    className: name, level: lv, subclass: sub, hitDie: num(def?.hd),
    granted: [...granted, ...resources], resources, choices, asiLevels,
    subclassOptions: subs, subclassLabel: shape.label, subclassAskedAt: shape.askedAt,
    slots: slots ? slots.slice(1).map(num) : null,
    cantripsKnown: slots ? num(slots[0]) : 0,
    castingAbility: def?.spellAbility || "",
    slotsReset: slotResetFor(def),
  };
}

// The non-optional feature at a level that announces its menu — "Eldritch Invocations" over the
// thirty-three that follow it. With nothing to read, the level says it itself.
function menuLabel(row, n) {
  const plain = (row.features || []).filter(f => f && !f.optional);
  return plain.length === 1 ? plain[0].name : `Choices at level ${n}`;
}

// `defs` is a name -> definition map; the lookup is case-insensitive because a class typed by hand
// and a class read from the catalogue should be the same class.
export function classDef(defs, name) {
  if (!defs || !name) return null;
  const key = String(name).toLowerCase();
  if (typeof defs.get === "function") return defs.get(key) || defs.get(String(name)) || null;
  return defs[key] || defs[String(name)] || null;
}

// Every class on the sheet, together. A class the catalogue does not know yields nothing rather than
// an error — a DM may well have a class typed in before its compendium entry is imported, and the
// sheet has to keep working in between.
export function featurePlan(classes, defs = {}) {
  const per = (classes || []).filter(c => c && c.name).map(c => {
    const def = classDef(defs, c.name);
    return def
      ? classProgress(def, c.level, { subclass: c.subclass, picks: c.picks })
      : { className: c.name, level: num(c.level), subclass: subclassKey(c.subclass), hitDie: 0,
          granted: [], resources: [], choices: [], asiLevels: [], subclassOptions: [],
          slots: null, cantripsKnown: 0, castingAbility: "", slotsReset: "l", unknown: true };
  });

  // Slots: exact for one casting class. With two, the 2014 multiclass table is its own progression
  // and inferring which classes are full, half or third casters from this data would be a guess —
  // so they are reported and left to the player, the way an unwritten recharge rule is.
  const casters = per.filter(p => p.slots && p.slots.some(n => n > 0));
  return {
    classes: per,
    granted: per.flatMap(p => p.granted),
    resources: per.flatMap(p => p.resources),
    choices: per.flatMap(p => p.choices).filter(c => !c.done),
    unknown: per.filter(p => p.unknown).map(p => p.className),
    totalLevel: per.reduce((n, p) => n + p.level, 0),
    slots: casters.length === 1 ? casters[0].slots : null,
    cantripsKnown: casters.length === 1 ? casters[0].cantripsKnown : 0,
    slotsReset: casters.length === 1 ? casters[0].slotsReset : null,
    multiclassCasters: casters.length > 1 ? casters.map(p => p.className) : [],
    // Every class that states a spellcasting ability, whether or not it has slots of its own: a
    // Paladin's Charisma DC matters at level 1, before the first slot arrives.
    casting: per.filter(p => castingAbilityId(p.castingAbility))
      .map(p => ({ className: p.className, ability: castingAbilityId(p.castingAbility) })),
  };
}

// "11d8 + 2d10" — one pool per die size, biggest die first, which is what a multiclass character
// actually spends on a short rest (CS-031).
export function hitDicePool(classes, defs = {}) {
  const by = new Map();
  for (const c of classes || []) {
    const hd = num(classDef(defs, c?.name)?.hd);
    if (!hd || !num(c?.level)) continue;
    by.set(hd, (by.get(hd) || 0) + num(c.level));
  }
  return formatHitDice([...by.entries()].sort((a, b) => b[0] - a[0]).map(([die, n]) => ({ die, n })));
}

// ── Hit dice ────────────────────────────────────────────────────────────
// The pool is a STRING on the sheet — "2d10 + 9d8" — because that is what it shows, what a level up
// writes, and what a player with a class the catalogue has never heard of types in by hand. So it is
// also what the engine reads, rather than a second structured copy that can drift out of step with
// the one on screen. What is SPENT is the only thing stored separately: `hitDiceUsed`, by die size.
export function parseHitDice(text) {
  const by = new Map();
  for (const m of String(text || "").matchAll(/(\d+)\s*d\s*(\d+)/gi)) {
    const die = num(m[2]), n = num(m[1]);
    if (die > 0 && n > 0) by.set(die, (by.get(die) || 0) + n);
  }
  return [...by.entries()].sort((a, b) => b[0] - a[0]).map(([die, n]) => ({ die, n }));
}
export const formatHitDice = rows =>
  (rows || []).filter(r => r && num(r.n) > 0).map(r => `${num(r.n)}d${num(r.die)}`).join(" + ");

export function hitDiceState(ch) {
  const used = ch?.hitDiceUsed || {};
  const rows = parseHitDice(ch?.hitDice).map(r => {
    const spent = clamp(used[r.die], 0, r.n);
    return { die: r.die, n: r.n, used: spent, left: r.n - spent };
  });
  const sum = k => rows.reduce((t, r) => t + r[k], 0);
  return { rows, total: sum("n"), used: sum("used"), left: sum("left"),
    pool: formatHitDice(rows) };
}

// Spending one. The roll is passed IN, because rolling dice is the interface's job and this file is
// the one part of the tool that has to stay deterministic. A Constitution penalty cannot make a hit
// die cost you hit points, so the total it gives back is floored at zero, and what is actually
// healed is capped at your maximum — the two are reported separately so the dialog can say both.
export function spendHitDie(ch, die, roll) {
  const row = hitDiceState(ch).rows.find(r => r.die === num(die));
  if (!row || row.left <= 0) return null;
  const con = abilityModifier(ch, "con");
  const regained = Math.max(0, num(roll) + con);
  const before = clamp(ch?.hp, 0, maxHp(ch));
  const hp = clamp(before + regained, 0, maxHp(ch));
  return {
    die: row.die, roll: num(roll), con, regained, healed: hp - before, hp,
    revived: clearsDeathSaves(before, hp),
    hitDiceUsed: { ...(ch?.hitDiceUsed || {}), [row.die]: row.used + 1 },
    left: row.left - 1,
  };
}

// Handing one back — the same gesture as a spent spell slot, for the die spent by mistake.
export function returnHitDie(ch, die) {
  const row = hitDiceState(ch).rows.find(r => r.die === num(die));
  if (!row || row.used <= 0) return null;
  return { ...(ch?.hitDiceUsed || {}), [row.die]: row.used - 1 };
}

// A long rest hands back half the pool, rounded down, minimum one.
export const hitDiceRegained = total => Math.max(1, Math.floor(Math.max(0, num(total)) / 2));

// Which ones come back: the biggest dice first, because a d10 heals more than a d8 and that is what
// anybody would pick. 2014 leaves the choice to the player, so the rest says which went back and a
// spent pip hands any of them over again — the one case where it matters is a click away.
export function restoreHitDice(ch, count) {
  const st = hitDiceState(ch);
  const next = { ...(ch?.hitDiceUsed || {}) };
  const back = [];
  let owed = Math.max(0, num(count));
  for (const r of st.rows) {
    if (owed <= 0) break;
    const give = Math.min(owed, r.used);
    if (!give) continue;
    next[r.die] = r.used - give;
    back.push({ die: r.die, n: give });
    owed -= give;
  }
  return { hitDiceUsed: next, back, restored: Math.max(0, num(count)) - owed };
}

// Merging a derived feature list into the sheet's own. Three rules, in this order: a feature the
// character added by hand is never touched; a derived feature that is still granted keeps what the
// player tracked on it — the uses they have spent — while its text and its pool size come from the
// data; and a derived feature the character no longer has goes, because leaving it is how a sheet
// ends up carrying an archetype nobody remembers choosing.
export function reconcileFeatures(existing, granted) {
  const want = new Map((granted || []).filter(f => f && f.id).map(f => [f.id, f]));
  const out = [], added = [], removed = [];
  for (const f of existing || []) {
    if (!f) continue;
    if (!isDerivedFeature(f)) { out.push(f); continue; }
    const g = want.get(f.id);
    if (!g) { removed.push(f); continue; }
    out.push(g.uses ? { ...g, used: Math.min(num(f.used), num(g.uses)) } : { ...g });
    want.delete(f.id);
  }
  for (const g of want.values()) { out.push(g); added.push(g); }
  return { features: out, added, removed };
}

// What the LEVEL UP button is about to do, worked out before anything is written so the dialog can
// show it and the player can still say not yet. `className` is which class takes the level — asked
// only when there is more than one to ask about, settled in silence when there is one.
export function levelUpPlan(ch, defs = {}, { target, className } = {}) {
  const from = num(ch?.level);
  const to = num(target) || from + 1;
  const classes = (Array.isArray(ch?.classes) ? ch.classes : []).filter(c => c && c.name);
  const name = className || (classes.length === 1 ? classes[0].name : "");
  const known = classes.some(c => c.name === name);
  const next = known
    ? classes.map(c => (c.name === name ? { ...c, level: num(c.level) + 1 } : c))
    : (name ? [...classes, { name, level: 1 }] : classes);

  const after = featurePlan(next, defs);
  const rec = reconcileFeatures(ch?.features || [], after.granted);
  const taking = after.classes.find(p => p.className === name);
  const def = classDef(defs, name);

  return {
    from, to, className: name, needsClass: !name, newClass: !!name && !known,
    classes: next, plan: after, features: rec.features,
    newFeatures: rec.added, lostFeatures: rec.removed,
    choices: after.choices,
    asi: !!def && asiDueAt(def, taking ? taking.level : 0),
    proficiency: { from: proficiencyBonus(from), to: proficiencyBonus(to) },
    hitDice: hitDicePool(next, defs),
    allocations: levelAllocations(from, to),
    // A total that no longer matches the DM's level is the one thing a player cannot fix alone, so
    // it is reported rather than quietly corrected (CS-014's acceptance).
    assigned: next.reduce((n, c) => n + num(c.level), 0),
  };
}

// ── Spellcasting ────────────────────────────────────────────────────────
// Two numbers per casting class, and they are NOT the campaign's Verum DC. A Wizard's spells are
// resisted at 8 + PB + Intelligence; a seal is resisted at the Verum DC, which folds in Dream and
// the highest modifier of the six. Both belong on the sheet, and conflating them would mean every
// published spell the party casts is read at the wrong DC (CS-043).
//
// A multiclass caster has one of each PER CLASS, because the ability differs: Richard's Paladin
// spells are Charisma and a Wizard level would be Intelligence. Proficiency is the character's, from
// the total level, which is what 2014 multiclassing says.
export const CASTING_ABILITY = {
  strength: "str", dexterity: "dex", constitution: "con",
  intelligence: "int", wisdom: "wis", charisma: "cha", dream: "dream",
  str: "str", dex: "dex", con: "con", int: "int", wis: "wis", cha: "cha",
};
export function castingAbilityId(name) {
  return CASTING_ABILITY[String(name || "").trim().toLowerCase()] || "";
}

// Temporary attack and damage modifiers are deliberately NOT folded in here, the same way the seal
// attack bonus leaves them out: this is the number printed on the sheet, and a round of Bless is
// shown on the roll that uses it rather than quietly rewritten into the character's statistics.
export const spellSaveDC = (ch, abilityId) =>
  8 + proficiencyBonus(ch.level) + abilityModifier(ch, abilityId)
  + modifierTotal(activeModifiers(ch), "saveDc");
export const spellAttackBonus = (ch, abilityId) =>
  proficiencyBonus(ch.level) + abilityModifier(ch, abilityId);

// One row per casting class, in the order the classes sit on the sheet. `plan` is a featurePlan —
// passed in, because which classes cast comes from the catalogue and nothing here may fetch.
export function spellcasting(ch, plan) {
  return (plan?.casting || []).map(c => ({
    className: c.className, ability: c.ability, abilityName: ABILITY_NAME[c.ability],
    mod: abilityModifier(ch, c.ability),
    dc: spellSaveDC(ch, c.ability),
    attack: spellAttackBonus(ch, c.ability),
  }));
}

// ── The spellbook ───────────────────────────────────────────────────────
// `spells.book` is a flat list; an entry is a catalogue spell's own compact fields plus how the
// character came by it. CS-041 asks for known, prepared, always-prepared and granted tracked
// SEPARATELY, and they are four genuinely different standings rather than one flag under four names:
//
//   known     in your repertoire, not ready today — the spells sitting in a Wizard's book
//   prepared  chosen for today, and castable
//   always    always prepared, never counted against the day's list — a Domain, Oath or Pact spell
//   granted   from a feature, an item or an ancestry rather than from the class's own list
//
// Only the first is uncastable, which is the single rule the rest of the sheet reads. A caster who
// casts from what they know rather than from what they prepared — a Bard, a Sorcerer, a Warlock —
// marks their repertoire Prepared once and never thinks about it again; the engine does not decide
// which kind of caster a class is, because the compendium data does not say.
export const SPELL_STANDINGS = [
  { id: "known", label: "Known", short: "known",
    hint: "In your repertoire, not ready today." },
  { id: "prepared", label: "Prepared", short: "prepared",
    hint: "Chosen for today, and castable." },
  { id: "always", label: "Always prepared", short: "always",
    hint: "Always ready, and never counted against the day's list." },
  { id: "granted", label: "Granted", short: "granted",
    hint: "From a feature, an item or your ancestry rather than your class's list." },
];
export const SPELL_STANDING = Object.fromEntries(SPELL_STANDINGS.map(s => [s.id, s]));

export const spellLevel = s => clamp(s?.level, 0, 9);
// Fight Club writes a ritual as "YES"; an absent field and a literal "no" both mean it is not one.
export const spellIsRitual = s =>
  !!s?.ritual && !/^(no|false|0)$/i.test(String(s.ritual).trim());
// Concentration is not its own field in the data — it is in the duration, and that is where every
// book puts it too ("Concentration, up to 1 minute").
export const spellIsConcentration = s => /concentration/i.test(String(s?.duration || ""));
export const spellStanding = s => (SPELL_STANDING[s?.standing] ? s.standing : "known");
// A cantrip is always castable: there is nothing to prepare and nothing to spend.
export const spellCastable = s => spellLevel(s) === 0 || spellStanding(s) !== "known";

// What this spell's compact record looks like, made from a catalogue entry. The long rules text is
// deliberately NOT copied: a sheet is saved on every edit, and forty spells' worth of prose on every
// keystroke is a lot of nothing. It is read back from the catalogue when a spell is opened, and a
// spell whose entry has since gone still casts — it just has no text to show.
export const spellRecord = (e, standing = "known") => ({
  id: `sp:${String(e?.name || "").toLowerCase()}`,
  name: String(e?.name || ""), level: clamp(e?.level, 0, 9),
  school: e?.school || "", time: e?.time || "", range: e?.range || "",
  components: e?.components || "", duration: e?.duration || "",
  ritual: e?.ritual || "", classes: e?.classes || "", source: e?.source || "",
  standing: SPELL_STANDING[standing] ? standing : "known",
});

// The book, grouped the way a sheet reads it: cantrips first, then one row per level the character
// actually has a spell at. Levels with nothing in them are left out rather than printed empty.
export function spellbook(ch) {
  const list = (ch?.spells?.book || []).filter(s => s && s.name);
  const byLevel = new Map();
  for (const s of list) {
    const lv = spellLevel(s);
    if (!byLevel.has(lv)) byLevel.set(lv, []);
    byLevel.get(lv).push(s);
  }
  const levels = [...byLevel.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([level, spells]) => ({
      level,
      spells: spells.sort((a, b) => String(a.name).localeCompare(String(b.name))),
    }));
  const by = id => list.filter(s => spellStanding(s) === id).length;
  return {
    list, levels,
    counts: {
      total: list.length,
      known: by("known"), prepared: by("prepared"), always: by("always"), granted: by("granted"),
      cantrips: list.filter(s => spellLevel(s) === 0).length,
      // What a player actually wants counted: how many of today's list are ready to cast, cantrips
      // and always-prepared spells left out because neither is a decision made this morning.
      ready: list.filter(s => spellLevel(s) > 0 && spellStanding(s) === "prepared").length,
      concentration: list.filter(spellIsConcentration).length,
      rituals: list.filter(spellIsRitual).length,
    },
  };
}

export const inSpellbook = (ch, name) =>
  (ch?.spells?.book || []).some(s => String(s?.name).toLowerCase() === String(name).toLowerCase());

// Which slots could pay for this spell: its own level and every higher one with a slot left. That
// list IS upcasting — a 1st-level spell cast from a 3rd-level slot is one of these rows (CS-044).
// A cantrip returns none, because it costs nothing.
export function castingOptions(ch, level) {
  const lv = clamp(level, 0, 9);
  if (!lv) return [];
  const slots = ch?.spells?.slots || {};
  const out = [];
  for (let l = lv; l <= 9; l++) {
    const row = slots[l];
    if (!row || !num(row.max)) continue;
    out.push({ level: l, max: num(row.max), used: num(row.used),
      left: Math.max(0, num(row.max) - num(row.used)) });
  }
  return out;
}

// Spending one. Returns the whole `spells` object to write, or null if there was nothing to spend —
// the caller says so rather than silently casting for free.
export function spendSlot(ch, level) {
  const slots = { ...(ch?.spells?.slots || {}) };
  const row = slots[level];
  if (!row || num(row.used) >= num(row.max)) return null;
  slots[level] = { ...row, used: num(row.used) + 1 };
  return { ...(ch?.spells || {}), slots };
}

// The dice a spell's own text mentions, so casting can offer to roll them. This reads the text and
// claims nothing about the rules: "8d6" in Fireball's description is an offer to roll 8d6, and which
// of them the situation calls for is still the player's and the DM's to settle.
export function diceInText(text, max = 6) {
  const out = [];
  for (const m of String(text || "").matchAll(/\b(\d{1,2})d(4|6|8|10|12|20|100)\b/g)) {
    const d = `${m[1]}d${m[2]}`;
    if (!out.includes(d)) out.push(d);
    if (out.length >= max) break;
  }
  return out;
}

// ── helpers ─────────────────────────────────────────────────────────────
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, num(v))); }
export const sign = n => (num(n) >= 0 ? "+" : "") + num(n);

// A blank character. Every field the sheet reads lives here, so a sheet saved before a field existed
// gets it filled on load rather than rendering `undefined` — the same trick the Grimm Companion uses.
export function blankCharacter() {
  return {
    name: "", level: 1, classes: [], ancestry: "", background: "",
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10, dream: DREAM_START },
    saves: {}, skills: {}, skillAbility: {},
    hp: 1, maxHp: 1, tempHp: 0, ac: 10, speed: 30, hitDice: "", hitDiceUsed: {},
    deathSaveSuccesses: 0, deathSaveFailures: 0,
    exhaustion: 0, dreamExhaustion: 0, wounds: 0, injuries: [], safeHavenRests: 0,
    honor: { order: 0, chaos: 0 }, morality: { good: 0, evil: 0 },
    corruption: 0,
    fate: 0,
    attuned: [], attunementBonus: 0,
    equipment: {}, carried: [], anatomy: [],
    coins: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
    modifiers: [], actions: [], grants: [], used: {}, conditions: [], round: 1, inCombat: false,
    attacks: [], features: [], inventory: [], notes: "",
    spells: { slots: {}, book: [], cantripsKnown: 0, slotsReset: "l" },
    portrait: "", accent: "",
    rulesVersion: RULES_VERSION,
  };
}
