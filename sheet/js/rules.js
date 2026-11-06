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
//   | "ability:<id>" | "save:<id>" | "save:all" | "skill:<id>".
// "save:all" is every saving throw at once — see saveTotal.
// `rounds` null means permanent. `active: false` is an expired or suspended record kept for history,
// which is why expiry blanks a modifier in place rather than deleting it.
//
// `amount` is a flat number — UNLESS the record carries `from`, in which case the amount is derived
// and `amount` is ignored (Juan, 2026-10-29). See DERIVE_FROM.
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
      id: m.id, source: m.source || "", permanent: m.rounds == null,
      // Carried so the tooltip can say WHY the number is what it is — "+6, twice your proficiency
      // bonus" — rather than printing a 6 that moves on its own next level.
      from: m.from || "", times: m.from ? (num(m.times) || 1) : 0 }));
}

// ── An effect whose amount is derived ───────────────────────────────────
// "A bonus equal to my Charisma modifier." "Twice my proficiency bonus." Almost every real bonus in
// this campaign is one of those rather than a number somebody worked out once — Aura of Protection,
// the Absolute reductions, half your proficiency on a skill — and a number worked out once is wrong
// the moment the score behind it moves.
//
// A record carries `from` (an ability id, or "prof") and `times`; `amount` is then ignored.
export const DERIVE_FROM = [
  { id: "prof", name: "proficiency bonus", short: "PB" },
  ...ABILITIES.map(id => ({ id, name: `${ABILITY_NAME[id]} modifier`, short: ABILITY_NAME[id].slice(0, 3) })),
];
export const DERIVE_TIMES = [
  { value: 0.5, name: "half" }, { value: 1, name: "" },
  { value: 2, name: "twice" }, { value: 3, name: "three times" },
];

// WHY THE DERIVED ONES ARE EXCLUDED FROM WHAT A DERIVATION READS. Without this, an effect worth
// "my Charisma modifier" asks for Charisma, which asks for every modifier on Charisma, which asks
// for that effect again — and a bonus to Charisma itself worth "my Charisma modifier" would never
// return at all. So a derivation is measured against the scores as they stand MINUS anything that
// is itself derived: one level deep, which both terminates and gets the common case right (a flat
// +2 from a worn belt counts; a second derived effect does not pile on).
function plainModifiers(ch) {
  return [...(ch?.modifiers || []), ...itemEffects(ch)].filter(m => m && m.active !== false && !m.from);
}
export function deriveValue(ch, from) {
  if (from === "prof") return proficiencyBonus(ch?.level);
  if (!ABILITIES.includes(from)) return 0;
  return abilityMod(num(ch?.abilities?.[from]) + modifierTotal(plainModifiers(ch), `ability:${from}`));
}
// Rounded DOWN, which is 5e's rule everywhere and the only one that matters here: half of a +5
// proficiency bonus is +2.
export function modifierAmount(ch, m) {
  if (!m?.from) return num(m?.amount);
  return Math.floor(deriveValue(ch, m.from) * (num(m.times) || 1));
}
// The same thing in the fewest characters, for a line that is already dense: "2×PB", "½×PB", "Cha".
export function derivationShort(m) {
  if (!m?.from) return "";
  const src = DERIVE_FROM.find(d => d.id === m.from);
  if (!src) return "";
  const t = num(m.times) || 1;
  return `${t === 1 ? "" : t === 0.5 ? "½×" : `${t}×`}${src.short}`;
}
// "twice your proficiency bonus" — the words under a number that moves on its own.
export function derivationLabel(m) {
  if (!m?.from) return "";
  const src = DERIVE_FROM.find(d => d.id === m.from);
  if (!src) return "";
  const times = DERIVE_TIMES.find(t => t.value === (num(m.times) || 1));
  return `${times?.name ? `${times.name} your` : "your"} ${src.name}`;
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

// The two blankets on the other side of the sheet from `save:all`, and the distinction between them
// is the one 5e makes: **a skill check IS an ability check**, so anything granted to every ability
// check reaches the skills as well, while `skill:all` stops at the skills. Guidance and Enhance
// Ability are the first; a pair of Gloves of Thievery is the second (Juan, 2026-10-29).
export const CHECK_ALL = "check:all";
export const SKILL_ALL = "skill:all";

// An ability CHECK, which is not the same number as the ability modifier — and the reason this is
// its own function rather than something added inside `abilityModifier`: that one feeds the saves,
// the spell DCs, the attack bonuses and the hit dice, and a bonus to checks must reach none of them.
export function abilityCheckTotal(ch, id) {
  return abilityModifier(ch, id) + modifierTotal(activeModifiers(ch), CHECK_ALL);
}
export const abilityCheckContributions = ch => contributions(activeModifiers(ch), CHECK_ALL);

// A skill's total, for one chosen eligible ability. Pass `ability` to settle Harvesting; omitted, the
// first eligible one is used.
export function skillTotal(ch, skillId, ability) {
  const sk = SKILL_BY_ID[skillId];
  if (!sk) return 0;
  const use = sk.abilities.includes(ability) ? ability : sk.abilities[0];
  const mods = activeModifiers(ch);
  return abilityModifier(ch, use)
    + profContribution(proficiencyBonus(ch.level), ch.skills?.[skillId])
    + modifierTotal(mods, `skill:${skillId}`)
    + modifierTotal(mods, SKILL_ALL)
    + modifierTotal(mods, CHECK_ALL);
}
// This skill's own effects, then every skill, then every check — the order the number, the tooltip
// and the roll's breakdown all read, because they ask this and never assemble it themselves.
export function skillContributions(ch, skillId) {
  const mods = activeModifiers(ch);
  return [...contributions(mods, `skill:${skillId}`), ...contributions(mods, SKILL_ALL),
    ...contributions(mods, CHECK_ALL)];
}
// Every save at once, which is what a save bonus nearly always is: Bless, a Paladin's aura, a
// Cloak of Protection, Resistance, Magic Resistance. Seven separate records to say "+2 to saving
// throws" is six too many, and an ITEM could not say it at all — its effects are the same
// `{target, amount}` pairs, so a cloak had no way to reach more than one save (Juan, 2026-10-29).
export const SAVE_ALL = "save:all";

// Everything an effect may point at, in the order the sheet offers them. The ENGINE owns this list
// rather than the view: a target nothing can apply must not be offerable, and the vault importer
// checks a note's effects against the same list the dialog builds its menu from — so a hidden block
// can never ask for a row the sheet does not have. The labels are the view's business, in
// `MOD_TARGETS`. The three blankets come first, because they are what a spell or an item nearly
// always grants: Bless and an aura give saves, Guidance gives a check, a cloak gives every save.
export const MOD_TARGET_IDS = [
  CHECK_ALL,
  ...ABILITIES.map(id => `ability:${id}`),
  // `attack` and `damage` are EVERY attack and every damage roll. `spellAttack` reaches only the
  // spell attack roll, because an item that says "+4 to spell attacks" should not lift a bow
  // (CS-090) — Tome of Salem and Mother's Touch III both say exactly that. Its partner `saveDc` is
  // already spell-specific in practice: `spellSaveDC` is the only thing that reads it.
  //
  // `spellDamage` reaches only a spell's OWN damage roll, which a spell has once somebody has said
  // which of its dice are damage (`spellDamageOf`). Nothing infers that: not one of the 317 SRD
  // spells carries the `roll` field the parser would have read, and half the dice in a spell's
  // text are healing or duration — a +4 that lands on a Cure Wounds is worse than no target.
  // `crit` is how much WIDER the critical range is, not the number you need: +2 means 18–20. It is
  // an ordinary effect target on purpose (CS-097), which hands it three things for free — it can
  // be derived, it can carry a `when` for the ones that last a minute, and it names its source in
  // the breakdown like everything else.
  "ac", "speed", "initiative", "maxHp", "attack", "damage", "spellAttack", "spellDamage", "saveDc", "crit",
  SAVE_ALL,
  ...ABILITIES.map(id => `save:${id}`),
  SKILL_ALL,
  ...SKILLS.map(s => `skill:${s.id}`),
];
// Whether this save is proficient, which has TWO sources and keeps them apart (Juan, 2026-10-29:
// "where is proficiency for saving throws?" — there was nowhere, and a class was the only thing
// that could grant one).
//
// `savesFromClass` is derived and rewritten whole every time the class list changes; `saves` is
// what a hand set. A hand-set `true` adds one the class never gave — **Resilient**, an ancestry, a
// Grimm, a DM's word — and a hand-set `false` takes away one it did, which is why this is three
// states and not a boolean. Absent means "whatever the class says", so changing class moves it.
export function saveProficient(ch, abilityId) {
  const own = ch?.saves?.[abilityId];
  if (own === true || own === false) return own;
  return (ch?.savesFromClass || []).includes(abilityId);
}
export function saveProficiencySource(ch, abilityId) {
  const own = ch?.saves?.[abilityId];
  const fromClass = (ch?.savesFromClass || []).includes(abilityId);
  if (own === true) return fromClass ? "class" : "hand";
  if (own === false) return "removed";
  return fromClass ? "class" : "none";
}

export function saveTotal(ch, abilityId) {
  const mods = activeModifiers(ch);
  return abilityModifier(ch, abilityId)
    + (saveProficient(ch, abilityId) ? proficiencyBonus(ch.level) : 0)
    + modifierTotal(mods, `save:${abilityId}`)
    + modifierTotal(mods, SAVE_ALL);
}
// What is moving one save, named — the one save and the blanket together, in that order, so the
// number, its tooltip and the roll's breakdown cannot assemble the pair differently.
export function saveContributions(ch, abilityId) {
  const mods = activeModifiers(ch);
  return [...contributions(mods, `save:${abilityId}`), ...contributions(mods, SAVE_ALL)];
}
export const passiveScore = (ch, skillId, ability) => 10 + skillTotal(ch, skillId, ability);

// ── What a feature COSTS, and which ones belong on the Combat tab ───────
// An imported item's features all land under "Items" on the Character tab, which is right for
// "what does this thing do" and wrong for "it is my turn". The ones you ACT with belong beside the
// attacks, with the charges you spend them from.
//
// 📊 Counted across the Item Vault's 550 features before this was written, because the answer
// decides the design: **173 state a cost in their own prose**, 189 open with "Passive.", and
// **60 state no cost at all and still carry charges**. So the words are read where they are
// there — and a feature with pips is a thing you DO whatever its prose forgot to say.
export const COST_IDS = ["action", "bonus", "reaction", "quick", "grand", "pair", "free", "passive"];
// First match wins, so "as a bonus action" is settled before the bare word "action" can claim it.
const COST_SAID = [
  ["passive",  /^\s*passive\b/i],
  ["bonus",    /\bas a bonus action\b|^\s*bonus action\b|\ba bonus action\b/i],
  ["reaction", /\bas a reaction\b|^\s*reaction\b|\b(?:your|their|a) reaction\b/i],
  ["quick",    /\bquick action\b/i],
  ["grand",    /\bgrand action\b/i],
  ["pair",     /\bpair action\b/i],
  ["free",     /\bfree action\b|\bno action required\b|\bneed no action\b|\bcosts? you nothing\b/i],
  ["action",   /\bas an action\b|^\s*action\b|\ban action\b|\btake the attack action\b/i],
];
// A note may say it outright — `"cost": "bonus"` — and that always beats the prose, because a
// field is a statement and a regex is a reading.
export function featureCost(f) {
  const said = String(f?.cost || "").trim().toLowerCase();
  if (COST_IDS.includes(said)) return said;
  const hit = COST_SAID.find(([, re]) => re.test(String(f?.text || "")));
  return hit ? hit[0] : "";
}

// The item features worth putting on the Combat tab, each carrying `i` — its index in `ch.features`
// — so its pips fire the SAME `feat-use` handler the Character tab's do. Nothing is copied onto the
// character and nothing is written: this is read at draw time, so the two tabs can never drift.
//
// ⬜ Deliberately items only. A class's features would fill this list with thirty rows and bury the
// three an item just handed you, which is the thing Juan could not find.
export function itemActions(ch) {
  return (ch?.features || [])
    .map((f, i) => ({ ...f, i }))
    .filter(f => f && f.name && f.source === "item")
    .map(f => ({ ...f, cost: featureCost(f), pool: featureUses(ch, f) }))
    // Either it says it costs something, or it has charges to spend. The four features in the vault
    // that open "Passive." AND carry charges are kept — Ironmaw's Centripetal Core is passive with
    // a once-per-rest leap inside it — but they are not labelled with a cost they do not have.
    .filter(f => (f.cost && f.cost !== "passive") || f.pool > 0)
    .map(f => ({ ...f, cost: f.cost === "passive" ? "" : f.cost }));
}

// The lowest natural roll that still crits (CS-097). Eight items widen it — Black Raze and the
// Last Ligonier Glaive to 18, Spiral Fang to 15 for a minute, Midas to 14 — and the sheet held no
// such number at all, so every one of them was a line of prose the player had to remember.
//
// The FLOOR is a guard rather than a rule: nothing in the vault goes below 14, and a range that
// has run away to 2 is a bug, not a build.
export const CRIT_FLOOR = 10;
export const critRange = ch =>
  clamp(20 - modifierTotal(activeModifiers(ch), "crit"), CRIT_FLOOR, 20);
// How a table SAYS it: "20" while it is one number, "18–20" once it is a window. Every sheet starts
// at 20 — there is no base to type, because a critical range is not a thing you have, it is a thing
// something gives you, so the number is the modifiers and nothing else.
export const critRangeSays = ch => {
  const n = critRange(ch);
  return n >= 20 ? "20" : `${n}–20`;
};

export const armorClass = ch => baseArmorClass(ch).value + modifierTotal(activeModifiers(ch), "ac");
export const speed = ch => num(ch.speed) + modifierTotal(activeModifiers(ch), "speed");
// Initiative takes the check blanket too, because initiative IS a Dexterity ability check — so a
// table that hands out "+2 to ability checks" and then rolls for order would otherwise have to
// remember this one by hand. ⬜ One line to undo if Ephemer rules it apart.
export const initiative = ch => abilityModifier(ch, "dex")
  + modifierTotal(activeModifiers(ch), "initiative")
  + modifierTotal(activeModifiers(ch), CHECK_ALL);
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

// ── When a feature's uses come back ─────────────────────────────────────
// The vocabulary a feature uses to say how it recharges. `""` means it does not — a feature whose
// rule is written nowhere is left alone rather than guessed at, which is the same bargain the item
// charges and the rest preview already make.
//
// `dawn` and `dusk` are here because a table says "once per day" far more often than it says "once
// per long rest", and the rest preview is already told whether the rest carried the party through
// either.
//
// THE FIVE BELOW THEM ARE CS-096, and the Item Vault wanted them badly: blocking all 127 items
// turned up EIGHT recharges the sheet could not name, on 16 of them. They divide into three kinds,
// and the kind decides how a use comes back:
//
//   `rest`  — the rest dialog gives it back.                           s · l · dawn · dusk
//   `table` — nothing on this sheet knows a week has passed, so the    session · week · cycle
//             DM's own button does. A rest must NEVER return these.
//   `roll`  — a die decides, so the player rolls it.                   d6 (Recharge 5–6)
//   `clock` — real time the sheet cannot see. Named anyway, because    after (12 hours, 7 days…)
//             "comes back after 12 hours" is the truth and "nothing
//             gives these back" was a lie.
export const FEATURE_RESET = [
  { id: "", name: "By hand only", short: "", kind: "", says: "Nothing gives these back — clear them yourself" },
  { id: "s", name: "Short or long rest", short: "short rest", kind: "rest", says: "Comes back on a short or long rest" },
  { id: "l", name: "Long rest", short: "long rest", kind: "rest", says: "Comes back on a long rest" },
  { id: "dawn", name: "At dawn", short: "dawn", kind: "rest", says: "Comes back at dawn",
    hint: "A long rest gives these back only if it carried you through dawn." },
  { id: "dusk", name: "At dusk", short: "dusk", kind: "rest", says: "Comes back at dusk" },
  { id: "session", name: "Each session", short: "session", kind: "table", says: "Comes back each session" },
  { id: "week", name: "Once per week", short: "week", kind: "table", says: "Comes back once per week" },
  { id: "cycle", name: "Once per Cycle", short: "Cycle", kind: "table", says: "Comes back once per Cycle" },
  { id: "d6", name: "Recharge 5–6", short: "a d6", kind: "roll", says: "Recharge 5–6 — roll the die",
    hint: "Roll a d6 at the start of your turn; on a 5 or 6 the feature is back." },
  { id: "after", name: "After a set time", short: "time", kind: "clock",
    says: "Comes back after a set time — the sheet has no clock, so clear it yourself" },
];
export const FEATURE_RESET_BY_ID = Object.fromEntries(FEATURE_RESET.map(r => [r.id, r]));
// The resets the DM's own button returns, and the ones a die returns.
export const TABLE_RESETS = FEATURE_RESET.filter(r => r.kind === "table");

// What the tooltip says about how a feature comes back — in a whole sentence, because half of
// these need one. `after` carries its own words, so "comes back after 12 hours" is exact.
export function featureResetSays(f) {
  const r = FEATURE_RESET_BY_ID[f?.reset || ""];
  if (!r) return FEATURE_RESET_BY_ID[""].says;
  if (r.id === "after") {
    const w = String(f?.after || "").trim();
    return w ? `Comes back after ${w} — the sheet has no clock, so clear it yourself` : r.says;
  }
  return r.says;
}

// How many uses a feature has. A plain number, or DERIVED the way an effect's amount is — because
// "a number of times equal to your proficiency bonus" is how nineteen items in the Item Vault word
// it (CS-088), and a number worked out once goes stale at the next level.
//
// The shape is the same `{ from, times }` an effect carries, so the two read alike and one helper
// resolves both. Everything that draws a pip, spends one or hands one back comes through here, so
// a Charisma-sized pool grows the moment the Charisma does.
export function featureUses(ch, f) {
  const u = f?.uses;
  if (u && typeof u === "object") return clamp(modifierAmount(ch, u), 0, 99);
  return clamp(num(u), 0, 99);
}
// The words under the pips, for a feature whose count moves: "equal to your proficiency bonus".
export const featureUsesLabel = f =>
  (f?.uses && typeof f.uses === "object") ? derivationLabel(f.uses) : "";

// A stretch of time the sheet cannot see passing — a new session, a week, a Cycle. The DM says it
// happened and this is what it returns, in the same preview-then-confirm shape a rest uses, so the
// player can see what is about to come back before anything changes.
export function timePasses(ch, kind) {
  const spent = (ch?.features || []).filter(f =>
    f && String(f.reset || "") === kind && featureUses(ch, f) > 0 && num(f.used) > 0);
  return {
    kind,
    features: spent,
    next: spent.length
      ? { features: (ch.features || []).map(f => (spent.includes(f) ? { ...f, used: 0 } : f)) }
      : {},
  };
}

// Recharge 5–6, rolled. The whole feature comes back on a hit, which is what a published recharge
// does — it is not a per-use trickle. The roll is returned so the toast can show the die rather
// than asserting the result.
export function rollRecharge(f, roll) {
  const on = num(f?.rechargeOn) || 5;
  const hit = num(roll) >= on;
  return { roll: num(roll), on, hit, next: hit ? { used: 0 } : null };
}

// A REST gives back only the rest-driven recharges. `session`, `week`, `cycle`, `d6` and `after`
// all fall through to false on purpose — a long rest is not a week, and a night's sleep does not
// roll your d6 for you. Each of those has its own way back, below.
export function featureComesBack(f, { kind = "long", dawn = false, dusk = false } = {}) {
  const r = String(f?.reset || "").toLowerCase();
  if (FEATURE_RESET_BY_ID[r] && FEATURE_RESET_BY_ID[r].kind !== "rest") return false;
  if (r === "s") return true;                 // every rest includes a short one
  if (r === "l") return kind !== "short";
  if (r === "dawn") return !!dawn;
  if (r === "dusk") return !!dusk;
  return false;
}

// ── Corruption ──────────────────────────────────────────────────────────
// The third axis of spiritual integrity, beside Honor and Morality (Corruption Ruleset.md). It was
// a field on the blank sheet that NOTHING read, showed or changed — declared and then forgotten —
// which is not the same as being tracked (Juan, 2026-11-03).
//
// Two things are the character's and are recorded here: the SCORE, and the NATURE a soul dissolves
// toward once the score reaches five. The Nature cannot be changed without a soul-cleansing ritual,
// so the sheet asks once and then keeps it. The Dominant Vile Emotion is free text because it is
// the player's word for their own ruin, not a list to pick from.
export const CORRUPTION_MAX = 10;
export const CORRUPTION_NATURE_AT = 5;
export const CORRUPTION_NATURES = [
  { id: "demon", name: "Demon", mark: "🔴",
    blurb: "Chaos given sentience — raw, consuming, boundless. They do not become mindless; they become too much." },
  { id: "nightmare", name: "Nightmare", mark: "🔵",
    blurb: "Vile Imagination given form — fear made flesh. They do not lose intelligence; they gain a terrible new one." },
];
export const CORRUPTION_NATURE_BY_ID = Object.fromEntries(CORRUPTION_NATURES.map(n => [n.id, n]));

// The ladder, condensed to what a table needs mid-session. The full text, with every rider and
// every Affinity, is Corruption Ruleset.md in the vault; this is the reminder, not the ruleset.
export const CORRUPTION_THRESHOLDS = [
  { score: 1,
    shared: "You hear faint voices of past victims. Disadvantage on Insight checks to judge your own intentions.",
    demon: "The voices argue about what you should destroy.",
    nightmare: "The voices whisper your fears back in the voices of people you love." },
  { score: 2,
    shared: "You detect as Undead or Cursed. Holy beings are uneasy near you.",
    demon: "Divine detection reads a minor Demon; celestials treat you as hostile.",
    nightmare: "Dream Lords read a Nightmare; sleepers within 30 ft dream your Vile Emotion." },
  { score: 3,
    shared: "+2 DC resisting Binding and Wicked Curses. You attract Vile Emotion auras.",
    demon: "Resistance to force damage, but your proficiency bonus does not apply to Charisma checks about trust, contracts or oaths.",
    nightmare: "Resistance to psychic damage, but animals, children and Dream-sensitive creatures recoil from you." },
  { score: 4,
    shared: "Morality above 15 drops by 1. You automatically fail Honor or Morality checks about forgiveness or empathy.",
    demon: "A failed Concentration check detonates the spell — 10-ft radius, its level × 1d6, its own type.",
    nightmare: "You sense sleepers within 60 ft and feel their dream-state. You cannot turn it off." },
  { score: 5,
    shared: "At dawn, roll d6. On a 1, a Rebound Curse of your Dominant Vile Emotion until your next long rest.",
    demon: "Partial Demonification — visible chaotic alterations, and one Demon Surge.",
    nightmare: "Partial Nightmarification — visible nightmare alterations, and one Nightmare Intrusion." },
  { score: 6,
    shared: "A Charisma save to remain on hallowed ground; on a failure, disadvantage on all checks while there.",
    demon: "A natural 1 on an attack releases a 15-ft Chaos Burst — 2d8, random type, Dex save DC 12 + half your score.",
    nightmare: "You consume dreams instead of having them: no dream restoration, and a Corruption save DC 14 or you pull a CR ≤ 3 nightmare into waking." },
  { score: 7,
    shared: "You are Haunted. Undead and Fiends have advantage on attacks against you.",
    demon: "Lesser demons will not attack unprovoked; greater ones want to consume you. You read as a Chaotic Outsider.",
    nightmare: "Denizens are unsettled, Dream Lords know your name — and you may redirect a fear effect to a creature within 30 ft, no save." },
  { score: 8,
    shared: "You cast no reflection and are immune to scrying, Locate Creature and Sending unless your exact place is known.",
    demon: "Once a day, a Wisdom save DC 10 + your score or be Reckless for a minute — you cannot stop yourself.",
    nightmare: "Once a day, seeing extreme fear, a Wisdom save DC 10 + your score or you Feed: 5 temporary hit points, and they may be frightened of you for an hour." },
  { score: 9,
    shared: "Non-magical creatures must make an Intelligence check to remember your name each day. Records fade you out.",
    demon: "Once per long rest, Phase as a reaction — incorporeal until the end of your next turn, then a Corruption save DC 18 or a level of exhaustion.",
    nightmare: "You see through mundane and magical darkness; anything with Dream-sight sees your Nightmare form over your own." },
  { score: 10,
    shared: "Curse Incarnate. Only necrotic sources heal you, Honor and Morality cannot be regained, and anything dying within 30 ft has a 25% chance to rise as your Wraith. Slain, you return in 1d6 days unless buried or cleansed.",
    demon: "Full Demonification. You count as a Demon for all purposes; divine detection reads only ancient Chaos.",
    nightmare: "Full Nightmarification. You count as a Nightmare; you stand in Ephemer and on Insomnia's border at once." },
];

export const corruptionScore = ch => clamp(ch?.corruption, 0, CORRUPTION_MAX);
export const corruptionNature = ch =>
  CORRUPTION_NATURE_BY_ID[ch?.corruptionNature] ? ch.corruptionNature : "";
// A Nature is owed once the score reaches five and has not been chosen.
export const corruptionNatureDue = ch =>
  corruptionScore(ch) >= CORRUPTION_NATURE_AT && !corruptionNature(ch);

// Every threshold at or below the score, with the right column already resolved — so a sheet shows
// what is IN FORCE rather than a table to read across. Below five the Nature rows are foreshadowing
// and are marked as such, because the ruleset says they only take effect once a Nature is chosen.
export function corruptionInForce(ch) {
  const score = corruptionScore(ch);
  const nature = corruptionNature(ch);
  return CORRUPTION_THRESHOLDS.filter(t => t.score <= score).map(t => ({
    score: t.score,
    shared: t.shared,
    nature: nature ? t[nature] : "",
    natureName: nature ? CORRUPTION_NATURE_BY_ID[nature].name : "",
  }));
}

// The save modifier, read off the character rather than off a loose bag of axes. Corruption's own
// score does not feed it — Honor and Morality do (HB-024).
export const corruptionSaveBonus = ch =>
  corruptionSaveModifier({ ...(ch?.honor || {}), ...(ch?.morality || {}) });

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

  // ANY feature whose recharge rule is written down — a class resource from the compendium, a
  // feature read out of an item's vault entry, or one somebody typed in. One whose rule is written
  // nowhere is still left alone rather than guessed at; this only spends what the data states.
  //
  // This used to test `isDerivedFeature` as well, which meant only ids beginning `cls:` or `res:`
  // came back — so every feature imported from an item had to be cleared by hand, forever (CS-089).
  // The rule was never "class resources recharge"; it was "what says how it recharges, recharges".
  const spent = (ch.features || []).filter(f =>
    f && featureUses(ch, f) > 0 && num(f.used) > 0 && featureComesBack(f, { kind, dawn, dusk }));
  if (spent.length) {
    next.features = (ch.features || []).map(f => (spent.includes(f) ? { ...f, used: 0 } : f));
    changes.push({ label: "Features come back", detail: spent.map(f => f.name).join(", ") });
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
// a DREAMLIKE item's effects go inactive until the bearer is in Insomnia again (DM-14, RES-09).
export const ATTUNEMENT_BASELINE = 3;
export const ATTUNEMENT_INSOMNIA = 3;

// ── The dream axis ──────────────────────────────────────────────────────
// WHY THIS IS THREE VALUES AND NOT A BOOLEAN. It was `insomniaOnly`, one flag covering both kinds of
// dream item, because Character Sheet Requirements v1.5 wrote them as one: DM-14 and HB-018 both
// say "Dreamlike/Lucidlike" and both say inactive off-plane. The item canon says otherwise, in
// three places — `Artificing Dream Items.md` ("can exist in both Insomnia and Ephemer
// simultaneously"), `Lucidite.md` ("able to exist in Insomnia and Ephemer at once") and the
// Glossary ("Dreamlike items cannot return to Ephemer; Lucidlike ones can"). Juan ruled for the
// item canon on 2026-11-03, and the spec and its fixture 5 were corrected to match:
//
//   (none)      Ephemer and Insomnia alike      one baseline slot
//   dreamlike   Insomnia only, inactive awake   one Insomnia slot
//   lucidlike   BOTH planes, always in force    one baseline AND one Insomnia slot
//
// Lucidlike holds a slot in each pool whether or not the bearer is dreaming — that permanent double
// cost is what two-plane existence is paid for with, and it is why the Attunement card shows a
// Lucidlike item in both of its groups rather than looking like it counted something twice.
export const ITEM_DREAM = [
  { id: "", name: "Of Ephemer", short: "", hint: "An ordinary item — one baseline attunement slot." },
  { id: "dreamlike", name: "Dreamlike", short: "Dreamlike",
    hint: "Insomnia only — it cannot leave, and its effects stop while you are awake. One Insomnia slot." },
  { id: "lucidlike", name: "Lucidlike", short: "Lucidlike",
    hint: "Both planes at once, awake or dreaming. Costs one baseline slot AND one Insomnia slot." },
];
export const DREAM_BY_ID = Object.fromEntries(ITEM_DREAM.map(d => [d.id, d]));

// Read safely, and read the LEGACY flag too: every item saved before the axis had three values
// carries `insomniaOnly`, and that boolean meant exactly Dreamlike — "an Insomnia-only slot, and
// inactive while awake". So an old sheet keeps behaving exactly as it did until somebody marks a
// specific item Lucidlike, which is the only safe way to migrate eight live characters.
export function itemDream(it) {
  const d = String(it?.dream || "").toLowerCase();
  if (d === "dreamlike" || d === "lucidlike") return d;
  return it?.insomniaOnly ? "dreamlike" : "";
}
export const isDreamlike = it => itemDream(it) === "dreamlike";
export const isLucidlike = it => itemDream(it) === "lucidlike";
// Does a bonded item draw on a pool at all? `requiresAttunement` is the slot-cost flag — Juan,
// 2026-11-03: "no attunement require means it does not take a attunement slot". So an item bonded
// some other way is listed, is in force, and costs nothing: Solomon's Scarf needs no attunement,
// and The First Thorn is permanently Soul Attuned and its entry says plainly that it "requires no
// Attunement Slot". The dream kind says WHERE an item works; this says whether it is paid for.
//
// The question is asked this way round ON PURPOSE. Only an item that SAYS it needs no attunement is
// free; a record that never wrote the flag down — the legacy `attuned` list, and the v1.5 fixtures
// themselves — keeps costing a slot, because "nobody recorded it" is not a ruling. That is the
// difference between reading a ruling and quietly handing three slots back to every old sheet.
export const costsASlot = it => it?.requiresAttunement !== false;
// Which of the two pools a PAID item draws on. Lucidlike draws on both; that is the point.
export const usesBaselineSlot = it => costsASlot(it) && itemDream(it) !== "dreamlike";
export const usesInsomniaSlot = it => costsASlot(it) && itemDream(it) !== "";

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
// A DERIVED effect carries no amount of its own, so "amount is not zero" would throw every one of
// them away — an item worth "your proficiency bonus" would simply never appear (Juan, 2026-10-30).
// `when` is A CONDITION IN WORDS, and the sheet never evaluates it (CS-092). "Under the sun",
// "while you carry no shield", "at half hit points or fewer" — 27 items in the Item Vault carry a
// bonus like that, and the sheet cannot see the sky, the off hand or the party's composition.
//
// So it does the honest thing instead of guessing: an effect that names a condition starts
// SWITCHED OFF and waits for a click. The condition travels with it — onto the chip, into the
// tooltip, and into the reason line of every breakdown the bonus appears in — so the player reads
// the rule at the moment they arm it. A flat +2 that is simply true carries no `when` and is in
// force the moment the item is in a slot, exactly as before.
export const effectInForce = e => !e?.when || !!e.on;

export const itemEffectList = it =>
  (it?.effects || []).filter(e => e && e.target && (e.from || num(e.amount) !== 0))
    .map(e => ({ target: String(e.target), amount: num(e.amount),
      ...(e.from ? { from: String(e.from), times: num(e.times) || 1 } : {}),
      ...(e.when ? { when: String(e.when).slice(0, 120) } : {}),
      ...(e.on ? { on: true } : {}) }));

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
// Only DREAMLIKE is gated here. A Lucidlike item exists in both planes at once and keeps working
// while its bearer is awake — that is the whole difference between the two, and the thing the old
// single `insomniaOnly` flag could not say (Juan, 2026-11-03).
//
// The attunement CAP is deliberately not enforced here. The sheet reports being over it and leaves
// the choice to the player, the way it reports every other thing it will not referee.
export function itemIsActive(ch, it, where) {
  if (!it || !it.name || !String(where || "").startsWith("slot:")) return false;
  if (it.requiresAttunement && !it.attuned) return false;
  if (isDreamlike(it) && !ch?.inInsomnia) return false;
  return true;
}

export function itemEffects(ch) {
  const out = [];
  for (const r of allItems(ch)) {
    if (!itemIsActive(ch, r.item, r.where)) continue;
    // Indexed rather than keyed on the target, because an item may carry two effects on the same
    // one — and because the index is the address the toggle hands back.
    itemEffectList(r.item).forEach((e, i) => {
      out.push({ id: `itm:${r.where}:${i}`, target: e.target, amount: e.amount,
        // Carried through, so a worn item's effect can be worth a stat exactly as a written one
        // can — `activeModifiers` resolves both at the same door.
        ...(e.from ? { from: e.from, times: e.times } : {}),
        // A conditional effect names its condition in the reason, so the breakdown reads
        // "Solar Scarf — under the sun +2" rather than leaving the player to remember why.
        reason: e.when ? `${r.item.name} — ${e.when}` : r.item.name,
        // `contributions` drops anything with `active: false`, so a disarmed conditional effect
        // costs nothing anywhere — no total, no tooltip, no roll. It is still listed, because an
        // effect you cannot see is an effect you will never remember to switch on.
        rounds: null, active: effectInForce(e), source: "item", where: r.where,
        when: e.when || "", fx: i });
    });
  }
  return out;
}

// ── armour that SETS the base AC ────────────────────────────────────────
// CS-108. Ten of the twenty-nine entries in `Item Vault/Armor` state a whole armour class rather
// than a bonus — "your AC is 13 + your Dexterity modifier", "+2 Plate (base AC 20)", and
// Merigold's "12 + your Intelligence modifier + your Wisdom modifier", which takes two abilities.
//
// `ac` could never express that: it ADDS to the number you typed, so `ac +13` would stack on top
// of it. `baseAc` replaces that number instead, and `ac` bonuses then land on the result — which
// is the right order, and the reason a shield still works over a robe that sets its own base.
//
// `{ base, from, cap, from2 }` — a number, an ability to add, an optional ceiling on that ability
// (Ferracortex caps Dexterity at +2, as medium armour does), and a second ability for the one
// entry that wants two.
export function resolveBaseAc(ch, b) {
  let v = num(b?.base);
  for (const [key, capKey] of [["from", "cap"], ["from2", "cap2"]]) {
    const id = b?.[key];
    if (!id) continue;
    let mod = id === "prof" ? proficiencyBonus(ch?.level) : abilityModifier(ch, id);
    const cap = b?.[capKey];
    if (cap != null && cap !== "") mod = Math.min(mod, num(cap));
    v += mod;
  }
  return v;
}

// The base this character is actually using, and what is setting it. WHICHEVER IS HIGHER wins —
// which is both 5e's own convention for Unarmored Defense and what Midnight Regalia says in as
// many words: "This replaces Unarmored Defense if you have it; take whichever is higher." The
// number the player typed is just another candidate.
export function baseArmorClass(ch) {
  let best = { value: num(ch?.ac), from: "", where: "", spec: null };
  for (const r of allItems(ch)) {
    if (!itemIsActive(ch, r.item, r.where)) continue;
    const b = r.item.baseAc;
    if (!b || !num(b.base)) continue;
    const value = resolveBaseAc(ch, b);
    if (value > best.value) best = { value, from: r.item.name, where: r.where, spec: b };
  }
  return best;
}

// ── a weapon whose dice grow with you ───────────────────────────────────
// CS-087. "An extra 1d8 force damage, 2d8 at 11th level, 3d8 at 17th" is how nine entries word it,
// and until now the block had to name all three steps in prose and leave the row at the first —
// which is worse than no row, because a row looks authoritative.
//
// `steps` is `[{ at, damage, bonus }]` and the one in force is the highest `at` the character has
// reached. Anything a step does not name is left as the row has it, so a step can move the dice,
// the bonus, or both.
export function attackAtLevel(ch, a) {
  const steps = (Array.isArray(a?.steps) ? a.steps : []).filter(s => s && num(s.at) > 0);
  if (!steps.length) return a;
  const lv = num(ch?.level) || 1;
  const sorted = [...steps].sort((x, y) => num(x.at) - num(y.at));
  const live = sorted.filter(s => num(s.at) <= lv).pop();
  return {
    ...a,
    // Below the first step the row keeps its own dice — the steps are what it BECOMES, and the
    // first one is not always level 1.
    ...(live?.damage ? { damage: String(live.damage) } : {}),
    ...(live?.bonus == null ? {} : { bonus: num(live.bonus) }),
    ...(live ? { stepAt: num(live.at) } : {}),
    // What is still coming, and when — so the row can say "2d8 at 11th" without sending anyone
    // back to the note. This is set whether or not a step is live yet, which is the whole point
    // for a character who has not reached the first one.
    nextStep: sorted.find(s => num(s.at) > lv) || null,
  };
}
// Every attack, resolved to the level the character is at. One door, so the row, the damage roll
// and the crit all agree about which die this character is holding.
export const attackList = ch => (ch?.attacks || []).map(a => attackAtLevel(ch, a));

// Every conditional effect on the character, armed or not, with the address that toggles it. The
// Gear tab reads this to draw one switch per condition.
export function conditionalEffects(ch) {
  const out = [];
  for (const r of allItems(ch)) {
    itemEffectList(r.item).forEach((e, i) => {
      if (!e.when) return;
      out.push({ where: r.where, fx: i, item: r.item, slot: r.slot || null,
        target: e.target, when: e.when, on: !!e.on,
        amount: modifierAmount(ch, e),
        // In force needs BOTH: armed, and the item itself counting at all.
        live: !!e.on && itemIsActive(ch, r.item, r.where) });
    });
  }
  return out;
}

// Everything adjusting this character right now: what someone wrote down, and what their equipment
// implies. Every total in this file reads THIS rather than the stored list, which is why equipping
// a +1 cloak moves the AC without anything being written into the sheet twice.
//
// It is also where a DERIVED amount becomes a number. Every total, tooltip and roll breakdown on
// this sheet comes through here, so resolving it once at this door means "equal to my Charisma
// modifier" reaches all of them and none of them had to learn what `from` means.
export const activeModifiers = ch => [...(ch?.modifiers || []), ...itemEffects(ch)]
  .map(m => (m && m.from ? { ...m, amount: modifierAmount(ch, m) } : m));
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
  const items = attunedItems(ch).filter(Boolean);
  const dreamlike = items.filter(isDreamlike);
  const lucidlike = items.filter(isLucidlike);
  // The two pools, each holding everything that draws on it. A Lucidlike item is in BOTH lists, on
  // purpose — it pays into both, awake or dreaming.
  const onBaseline = items.filter(usesBaselineSlot);
  const onInsomnia = items.filter(usesInsomniaSlot);
  // Bonded and unpaid-for. Shown rather than dropped: an item that costs nothing is still something
  // the player is attuned to, and a slot silently not being charged is how a count stops being
  // trusted. Its dream kind still decides which plane it works in.
  const free = items.filter(i => !costsASlot(i));
  return {
    baseline, used: onBaseline.length, insomniaSlots: ATTUNEMENT_INSOMNIA,
    insomniaUsed: onInsomnia.length, inInsomnia,
    dreamlike, lucidlike, onBaseline, onInsomnia, free,
    // "Active" is the distinction the ruling asks for: owned, equipped, attuned — and in effect.
    // Lucidlike items are inside `onBaseline`, so they are here in both planes without a second
    // clause; only the Dreamlike ones wait to be dreaming. A free item is in force without paying,
    // and answers to the same plane rule.
    active: [
      ...onBaseline.slice(0, baseline),
      ...(inInsomnia ? onInsomnia.filter(isDreamlike).slice(0, ATTUNEMENT_INSOMNIA) : []),
      ...free.filter(i => !isDreamlike(i) || inInsomnia),
    ],
    inactive: inInsomnia ? [] : dreamlike,
    over: Math.max(0, onBaseline.length - baseline),
    insomniaOver: Math.max(0, onInsomnia.length - ATTUNEMENT_INSOMNIA),
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

// ── Damage types, and the Absolute ──────────────────────────────────────
// The sixteen types Ephemer deals, each with the name it takes at its zenith — Homebrew/Rulesets/
// Absolute Damage.md, which is the owning note. Families and order are the vault's.
//
// WHETHER A HIT IS ABSOLUTE IS NEVER THE DEFENDER'S TO KNOW. It depends on the attacker's Rank,
// their Cognition and sometimes one Verum of it, and none of that is on this sheet. So the absolute
// NAME is data here and the sheet asks — one toggle on the damage it takes — rather than guessing
// from the character's own level, which would be wrong in both directions.
//
// `born` is a type with no gentler form; `irresistible` is one that nothing may reduce. Today they
// are the same two types and they are still two fields, because they are two different claims.
//
// NOTE — Slashing's zenith is **Vorpal** in the owning note and **"Severe"** in the builder's own
// table (js/card.js). The note wins here and the contradiction is logged for Juan rather than
// quietly settled in code.
export const DAMAGE_TYPES = [
  { id: "bludgeoning", name: "Bludgeoning", absolute: "Tectonic", family: "physical" },
  { id: "piercing", name: "Piercing", absolute: "Impale", family: "physical" },
  { id: "slashing", name: "Slashing", absolute: "Vorpal", family: "physical" },
  { id: "acid", name: "Acid", absolute: "Corrosive", family: "elemental" },
  { id: "cold", name: "Cold", absolute: "Everfrost", family: "elemental" },
  { id: "fire", name: "Fire", absolute: "Infernal", family: "elemental" },
  { id: "lightning", name: "Lightning", absolute: "Voltaic", family: "elemental" },
  { id: "thunder", name: "Thunder", absolute: "Sonic", family: "elemental" },
  { id: "poison", name: "Poison", absolute: "Toxin", family: "elemental" },
  { id: "force", name: "Force", absolute: "Astral", family: "arcane" },
  { id: "necrotic", name: "Necrotic", absolute: "Doom", family: "arcane" },
  { id: "radiant", name: "Radiant", absolute: "Holy", family: "arcane" },
  { id: "psychic", name: "Psychic", absolute: "Neural", family: "arcane" },
  // Purely vital: resistance to necrotic, poison or physical damage does not touch it, and only a
  // creature with no blood — or one under a divine anti-hemomancy ward — can be immune at all.
  { id: "sanguine", name: "Sanguine", absolute: "Hemal", family: "beyond",
    note: "Purely vital. Resistance to necrotic, poison or physical damage does not mitigate it, and only a creature with no blood, or divine anti-hemomancy, can be immune." },
  { id: "void", name: "Void", absolute: "Void", family: "beyond", born: true, irresistible: true,
    note: "Born Absolute and irresistible. Nothing resists, reduces or absorbs it — not resistance, not immunity, not temporary hit points, not a god's own ward." },
  { id: "all-mighty", name: "All-Mighty", absolute: "All-Mighty", family: "beyond", born: true, irresistible: true,
    note: "Born Absolute. It ignores every form of resistance, reduction and immunity unless a rule explicitly says otherwise." },
];
export const DAMAGE_BY_ID = Object.fromEntries(DAMAGE_TYPES.map(d => [d.id, d]));
export const DAMAGE_FAMILIES = [
  { id: "physical", name: "Physical" }, { id: "elemental", name: "Elemental" },
  { id: "arcane", name: "Arcane & Spirit" }, { id: "beyond", name: "Beyond" },
];
// What to call the damage on the way in. Fire is Infernal when it arrives Absolute, and a type born
// there has one name only, so there is nothing to switch.
export function damageTypeName(id, absolute = false) {
  const t = DAMAGE_BY_ID[String(id || "").toLowerCase()];
  if (!t) return "";
  return absolute || t.born ? t.absolute : t.name;
}

// What a defence is worth, in both regimes. Protective text keeps the ordinary name — "resistance to
// fire" is still fire — so one record answers for both, and which one applies is decided per hit.
export const DEFENCE_STANDINGS = [
  { id: "resistant", name: "Resistant", ordinary: "halved", absolute: "reduced by 2 x PB" },
  { id: "immune", name: "Immune", ordinary: "no damage", absolute: "reduced by 4 x PB" },
  { id: "vulnerable", name: "Vulnerable", ordinary: "doubled", absolute: "still doubled" },
];
export const STANDING_BY_ID = Object.fromEntries(DEFENCE_STANDINGS.map(s => [s.id, s]));

// What a standing subtracts from Absolute damage. Read from the DEFENDER's proficiency bonus and
// nothing else, which is the reason the ruleset subtracts rather than halves: a resistant creature
// shrugs off a cantrip exactly as hard as it shrugs off a 17th-level seal.
export const absoluteReduction = (ch, standing) =>
  (standing === "immune" ? 4 : standing === "resistant" ? 2 : 0) * proficiencyBonus(ch?.level);

// A defence is a RECORD, not a column: `{ id, type, standing, why, rounds, active }` — the same
// shape as a modifier, a granted action, a turn grant and a die of Inspiration, so it counts down
// through `tickTimed` with them and needs no clock of its own. `rounds: null` is lasting.
//
// WHY A LIST RATHER THAN ONE STANDING PER TYPE. Because a defence can run out (Juan, 2026-10-29):
// Absorb Elements, a Rage, a potion and a Grimm's gift all hand out a resistance for a while, and
// they land ON TOP of what a character already is. A map keyed by type can hold only one answer, so
// the temporary one would overwrite the permanent one and never give it back.
//
// A defence an ITEM grants (CS-104). Sixteen entries in the Item Vault hand one out — the Steeldoor
// Harness alone grants four — and until this existed every one of them had to be typed into the
// bar by hand AND REMEMBERED WHEN THE ARMOUR CAME OFF, which is the half nobody ever does.
//
// Read exactly like an item's effects: only from a slot, only while attuned where the item says so,
// and only on the plane a Dreamlike item belongs to. So it arrives when the armour does and leaves
// when it does, with no record left behind to go stale.
//
// Deliberately LASTING while the item is in force, never timed. A defence with a fuse — Overforge's
// minute of fire immunity, Justice's minute of resistance to everything — is a hand-typed record
// with `rounds`, because the fuse belongs to the moment it was lit and not to the item.
export function itemDefences(ch) {
  const out = [];
  for (const r of allItems(ch)) {
    if (!itemIsActive(ch, r.item, r.where)) continue;
    (r.item.defences || []).forEach((d, i) => {
      const type = String(d?.type || "").toLowerCase();
      if (!DAMAGE_BY_ID[type] || !STANDING_BY_ID[d?.standing]) return;
      out.push({ id: `itmdef:${r.where}:${i}`, type, standing: d.standing,
        why: r.item.name, rounds: null, active: true, source: "item", where: r.where });
    });
  }
  return out;
}

// Typed by hand OR granted by an item. A resistance arrives from an ancestry, a class feature, a
// worn item, a spell or a DM's ruling — the item is the one the sheet can now read for itself, and
// the rest still carry their reason in the player's own words.
export function defenceRecords(ch) {
  const d = ch?.defences;
  const ok = r => r && r.active !== false && STANDING_BY_ID[r.standing]
    && DAMAGE_BY_ID[String(r.type || "").toLowerCase()];
  const worn = itemDefences(ch);
  if (Array.isArray(d)) return [...d.filter(ok).map(r => ({ ...r, type: String(r.type).toLowerCase(),
    rounds: r.rounds ?? null })), ...worn];
  // A sheet saved before a defence could run out: one standing per type, keyed by the type, and
  // every one of them lasting. Read rather than migrated, so nothing is lost by opening the sheet;
  // the first edit writes the list back in the new shape.
  return [...Object.entries(d || {}).map(([type, row]) => ({
    id: `d:${type}`, type: String(type).toLowerCase(),
    standing: typeof row === "string" ? row : row?.standing,
    why: (typeof row === "string" ? "" : row?.why) || "",
    rounds: null, active: true,
  })).filter(ok), ...worn];
}

// The character's OWN records, without what their gear is granting. EVERY WRITE BACK TO THE SHEET
// MUST GO THROUGH THIS. Writing `defenceRecords` back would copy an item's defence onto the
// character, where it would survive the armour coming off — which is precisely the failure CS-104
// exists to end, reintroduced by the save path instead of the read path.
export const ownDefenceRecords = ch => defenceRecords(ch).filter(r => r.source !== "item");

// What this character IS against one type, once every record that touches it has had its say.
//
// Multiple instances of the same standing count as one, which is 5e's own rule and the only one
// that survives contact with a table: three sources of fire resistance is still half. A resistance
// and a vulnerability CANCEL — the reading every table already uses — and immunity beats both,
// because nothing else is worth saying about a hit that does not land.
export function defence(ch, typeId) {
  const id = String(typeId || "").toLowerCase();
  const rows = defenceRecords(ch).filter(r => r.type === id);
  if (!rows.length) return null;
  const has = s => rows.some(r => r.standing === s);
  const standing = has("immune") ? "immune"
    : has("resistant") && has("vulnerable") ? "none"
    : has("resistant") ? "resistant"
    : has("vulnerable") ? "vulnerable" : "none";
  // The ones that actually decided it, so the sheet can name them rather than naming all of them.
  const deciding = standing === "none" ? rows : rows.filter(r => r.standing === standing);
  const timed = deciding.filter(r => r.rounds != null);
  return {
    standing, rows, deciding,
    cancelled: standing === "none",
    why: deciding.map(r => r.why).filter(Boolean).join(" · "),
    // The shortest fuse among them: when THAT runs out the answer may change, and it is the only
    // number worth putting on a chip.
    rounds: timed.length ? Math.min(...timed.map(r => num(r.rounds))) : null,
    temporary: timed.length > 0 && timed.length === deciding.length,
  };
}
// Every record, in the order the types are written, lasting ones first within a type — the same
// sort every other list on this sheet uses, because a thing that is simply true of you reads
// differently from a thing with two rounds left.
export function defenceList(ch) {
  const order = DAMAGE_TYPES.map(t => t.id);
  return defenceRecords(ch)
    .map(r => ({ ...DAMAGE_BY_ID[r.type], ...r }))
    .sort((a, b) => (order.indexOf(a.type) - order.indexOf(b.type))
      || (Number(a.rounds != null) - Number(b.rounds != null)));
}
// The types this character has anything recorded against, each with its resolved answer — what the
// incoming-damage picker offers, and what the card groups by.
export function defenceTypes(ch) {
  const seen = [];
  for (const r of defenceList(ch)) if (!seen.includes(r.type)) seen.push(r.type);
  return seen.map(id => ({ ...DAMAGE_BY_ID[id], ...defence(ch, id) }));
}

// What this hit actually does to this character, and why. Pure arithmetic, so it is applied rather
// than asked about — unlike a Wound, there is no judgement in it. With no type named nothing
// happens at all, which is what "22 damage" at a table usually is.
//
// Against ORDINARY damage: resistance halves, immunity negates, vulnerability doubles.
// Against ABSOLUTE damage: resistance subtracts 2 x PB, immunity subtracts 4 x PB, never below 0 —
// halving scales with the attack, subtracting scales with the defender, which is the whole point of
// crossing into Rank IV.
export function mitigate(ch, amount, { type = "", absolute = false, ignoresResistance = false } = {}) {
  const before = Math.max(0, num(amount));
  const t = DAMAGE_BY_ID[String(type || "").toLowerCase()] || null;
  const abs = !!t?.born || !!absolute;
  const d = t ? defence(ch, t.id) : null;
  const out = {
    before, dealt: before, by: 0, type: t?.id || "", absolute: abs,
    name: t ? damageTypeName(t.id, abs) : "", standing: d?.standing || "none",
    why: d?.why || "", applied: "none", note: t?.note || "",
  };
  if (!t || !d) return out;
  // A resistance and a vulnerability on the same type cancel, and the sheet says so rather than
  // quietly doing nothing — "why did that not halve" is a question worth answering unprompted.
  if (d.standing === "none") { out.applied = d.cancelled ? "cancelled" : "none"; return out; }

  // Vulnerability was never a defence, so none of the Absolute rules touch it: it doubles in both
  // regimes, and it doubles even what nothing else can resist.
  if (d.standing === "vulnerable") {
    out.dealt = before * 2; out.by = -before; out.applied = "doubled";
    return out;
  }
  // Irresistible is checked before anything is subtracted, because there is nothing there to
  // reduce. A recorded resistance to Void is kept — it is true of the character — and does nothing.
  if (t.irresistible) { out.applied = "irresistible"; return out; }
  if (ignoresResistance) { out.applied = "ignored"; return out; }
  if (abs) {
    const by = absoluteReduction(ch, d.standing);
    out.dealt = Math.max(0, before - by);
    out.by = before - out.dealt;
    out.applied = "reduced";
    return out;
  }
  if (d.standing === "immune") { out.dealt = 0; out.by = before; out.applied = "negated"; return out; }
  out.dealt = Math.floor(before / 2); out.by = before - out.dealt; out.applied = "halved";
  return out;
}

// The one line the table needs after a hit: what arrived, what it cost, and why the number moved.
export function mitigationLine(m) {
  if (!m || !m.type) return "";
  const nm = m.name || "";
  if (m.applied === "none") return `${nm}${m.absolute ? " (Absolute)" : ""} — nothing of yours applies.`;
  if (m.applied === "cancelled") return `${nm} — your resistance and your vulnerability cancel, so all ${m.dealt} lands.`;
  if (m.applied === "doubled") return `${nm} — vulnerable, so ${m.before} doubles to ${m.dealt}.`;
  if (m.applied === "irresistible") return `${nm} — irresistible. Nothing resists, reduces or absorbs it, so all ${m.dealt} lands.`;
  if (m.applied === "ignored") return `${nm} — the source ignores ${m.standing === "immune" ? "immunity" : "resistance"}, so all ${m.dealt} lands.`;
  if (m.applied === "negated") return `${nm} — immune, so none of it lands.`;
  if (m.applied === "halved") return `${nm} — resistant, so ${m.before} halves to ${m.dealt}.`;
  return `${nm} — ${m.standing === "immune" ? "immunity" : "resistance"} against Absolute damage takes ${m.by} off ${m.before}, leaving ${m.dealt}.`;
}

// ── Senses ──────────────────────────────────────────────────────────────
// The ranges are the standard ones, offered as a starting number and editable, because an ancestry
// and a spell hand out the same sense at different distances.
export const SENSES = [
  { id: "darkvision", name: "Darkvision", range: 60 },
  { id: "superiorDarkvision", name: "Superior Darkvision", range: 120 },
  { id: "blindsight", name: "Blindsight", range: 10 },
  { id: "tremorsense", name: "Tremorsense", range: 30 },
  { id: "truesight", name: "Truesight", range: 30 },
  { id: "devilsSight", name: "Devil's Sight", range: 120 },
];
export const SENSE_BY_ID = Object.fromEntries(SENSES.map(s => [s.id, s]));
export const senseList = ch => (ch?.senses || [])
  .filter(s => s && s.name)
  .map(s => ({ id: s.id || "", name: s.name, range: num(s.range), why: s.why || "" }));

// ── Inspiration ─────────────────────────────────────────────────────────
// A pool of dice someone handed you, rather than the single yes-or-no token 2014 prints: at this
// table a d4 of Bless, a Bard's d8 and a DM's "have a d6 for that" are all the same act, and the
// sheet should be able to hold three of them at once and say where each came from.
//
// A die is `{ id, die, rounds, why, active }` — the same shape as a modifier, a granted action and
// a turn grant, which is why it counts down through `tickTimed` with them and needs no clock of its
// own. `rounds: null` means until used.
export const INSPIRATION_DICE = ["d4", "d6", "d8", "d10", "d12", "d20"];
export const inspirationHeld = ch => (ch?.inspiration || []).filter(d => d && d.active !== false && d.die);
export const inspirationOf = (ch, die) => inspirationHeld(ch).filter(d => d.die === die);

// Which one to spend: the one about to run out. A die with rounds on it is worth less than one that
// waits, so the perishable goes first and "until used" is kept for later — and among timed ones the
// shortest fuse goes first.
export function inspirationNext(ch, die) {
  const soonest = (a, b) => (a.rounds == null ? Infinity : num(a.rounds)) - (b.rounds == null ? Infinity : num(b.rounds));
  return [...inspirationOf(ch, die)].sort(soonest)[0] || null;
}

// ── Hit points ──────────────────────────────────────────────────────────
// Healing never exceeds the maximum; temporary HP replaces rather than stacks unless a campaign rule
// says otherwise (CS-030); damage eats temporary HP first. Returns the next values plus the Wound
// triggers this event may have fired, flagged for adjudication rather than applied — the sheet asks,
// it does not decide (HB-010, RES-02).
//
// A damage type turns the defences on: `mitigate` runs FIRST and everything downstream reads the
// number that actually landed — temporary hit points, the half-maximum Wound trigger and the
// concentration DC all answer to the damage taken, not to the damage rolled.
export function applyDamage(ch, amount, { critical = false, type = "", absolute = false,
                                          ignoresResistance = false } = {}) {
  const mitigation = mitigate(ch, amount, { type, absolute, ignoresResistance });
  const dmg = mitigation.dealt;
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
    mitigation,
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

// The general `attack` and `damage` modifiers are deliberately NOT folded in here, the same way the
// seal attack bonus leaves them out: a round of Bless is shown on the roll that uses it rather than
// quietly rewritten into the character's printed statistics.
//
// The two SPELL-SPECIFIC targets are another matter and are folded in, because they are what an
// item means when it says "+4 to spell attacks and spell save DC" — a standing property of the
// tome in your hand, not a round of something. `saveDc` always worked this way; `spellAttack`
// joined it when CS-090 was built, which is why the spell attack bonus is no longer bare
// proficiency plus ability.
export const spellSaveDC = (ch, abilityId) =>
  8 + proficiencyBonus(ch.level) + abilityModifier(ch, abilityId)
  + modifierTotal(activeModifiers(ch), "saveDc");
export const spellAttackBonus = (ch, abilityId) =>
  proficiencyBonus(ch.level) + abilityModifier(ch, abilityId)
  + modifierTotal(activeModifiers(ch), "spellAttack");

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
  // Which of its dice are DAMAGE, and of what type. The catalogue cannot say: Fight Club's `<roll>`
  // element would have, and not one of the 317 SRD spells ships with it. So this is the character's
  // own note about their own spell — set once from the dice the dialog scraped out of the text, or
  // typed — and it is what `spellDamage` modifiers land on. Empty means the sheet does not know,
  // and it asks rather than guessing (CS-090).
  damage: "", damageType: "",
});

// A spell's damage expression, if its owner has said what it is. Separate from `spellRecord` so a
// spell saved before this existed answers the same as one that simply has not been told yet.
export const spellDamageOf = s => String(s?.damage || "").trim();
export const spellDamageBonus = ch => modifierTotal(activeModifiers(ch), "spellDamage");

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
    // `saves` is what a hand set — true adds one, false takes one away; `savesFromClass` is
    // derived from the first class and rewritten whole. See saveProficient.
    saves: {}, savesFromClass: [], skills: {}, skillAbility: {},
    hp: 1, maxHp: 1, tempHp: 0, ac: 10, speed: 30, hitDice: "", hitDiceUsed: {},
    deathSaveSuccesses: 0, deathSaveFailures: 0,
    exhaustion: 0, dreamExhaustion: 0, wounds: 0, injuries: [], safeHavenRests: 0,
    honor: { order: 0, chaos: 0 }, morality: { good: 0, evil: 0 },
    // What the world's harm is worth against this character, and what they can see with. Defences
    // are records with their own fuses — see the Damage types section.
    defences: [], senses: [],
    // Dice someone handed you, each with its own fuse. See the Inspiration section.
    inspiration: [],
    // Corruption is the third axis beside Honor and Morality: the score, the Nature a soul
    // dissolves toward once it reaches five, and the player's own word for what is eating them.
    corruption: 0, corruptionNature: "", corruptionVile: "",
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
