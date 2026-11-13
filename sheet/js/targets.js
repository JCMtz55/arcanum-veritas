// What an effect may point at, and what to call it.
//
// This was the bottom of view.js until a seal could grant an effect to somebody else. The builder
// needs the same menu the sheet's effect dialog uses, and the builder is plain <script> files that
// cannot import a module — so the list is served from `/api/mod-targets`, and the server needs a
// file it can import that does not touch the DOM. view.js is 1,800 lines of rendering; this is the
// part of it that is only data, lifted out whole.
//
// The LIST and its order are still the engine's (`rules.MOD_TARGET_IDS`). Nothing here invents a
// target: a seal that could grant a row the sheet does not have is the exact failure the engine's
// own note at MOD_TARGET_IDS warns about, and the only defence is that there is one list.

import * as rules from "./rules.js";

export function targetLabel(target) {
  if (!target) return "";
  const [kind, id] = String(target).split(":");
  if (kind === "ability") return rules.ABILITY_NAME[id] || id;
  if (kind === "save") return id === "all" ? "all saves" : `${rules.ABILITY_NAME[id] || id} save`;
  if (kind === "check") return "all checks";
  if (kind === "skill") return id === "all" ? "all skills" : (rules.SKILL_BY_ID[id]?.name || id);
  return { ac: "AC", speed: "Speed", initiative: "Initiative", maxHp: "Max HP",
           attack: "Attack", damage: "Damage", spellAttack: "Spell attack",
           spellDamage: "Spell damage", saveDc: "Save DC",
           // "+2 crit" would be read as the number, so the dense rows say what it widens.
           crit: "Crit range" }[kind] || kind;
}

// The menu an effect's target is chosen from. The LIST and its order are the engine's
// (`rules.MOD_TARGET_IDS`), so that the one place a target can be applied is the one place it can be
// offered — and so the vault importer can check a note's effects against the same list without
// reaching into the view. Only the handful of labels that want more room than a dense row gets are
// spelled out here; the rest are `targetLabel`'s own.
const MOD_TARGET_LABEL = {
  [rules.CHECK_ALL]: "All ability checks",
  maxHp: "Maximum HP", attack: "Attack rolls",
  // Named apart from "Attack rolls" so the menu makes the distinction before a mistake is made:
  // one lifts every attack, the other only a spell's.
  spellAttack: "Spell attack rolls", spellDamage: "Spell damage",
  saveDc: "Your spell save DCs",
  // Worded as what you TYPE, not what you get: +2 here means 18–20, and a menu saying "critical
  // range" would be read as the number you need.
  crit: "Critical range — wider by",
  // First of the saves, because it is the one most things actually grant — Bless, an aura, a cloak.
  [rules.SAVE_ALL]: "All saving throws",
  [rules.SKILL_ALL]: "All skills",
};
export const MOD_TARGETS = rules.MOD_TARGET_IDS.map(value =>
  ({ value, label: MOD_TARGET_LABEL[value] || targetLabel(value) }));

// A seal's benefit, as it is written in the builder and read back here. The builder cannot import
// this file, so this is the contract both ends are written against and the one the server checks.
//
// ── THE FIVE KINDS, AND WHY THERE ARE FIVE ──────────────────────────────
// A benefit began as one shape — a flat number on a modifier target — which covered Bless and an
// aura and nothing else. The Supportive Rings are built around a HEALING column, and the things a
// seal actually hands somebody at the table are mostly not numbers on a stat. So a benefit now says
// what KIND it is, and each kind lands through the engine structure that already models it:
//
//   modifier  {target, amount|from+times, rounds}   → ch.modifiers, merged at activeModifiers
//   defence   {dtype, standing, rounds}             → ch.defences, merged at defenceRecords
//   turn      {turnKind, n, rounds}                 → ch.grants, merged at turnAllowance
//   heal      {dice|amount}                         → one-time, OFFERED to the recipient
//   tempHp    {dice|amount}                         → one-time, OFFERED to the recipient
//
// WHY THE LAST TWO ARE OFFERED RATHER THAN APPLIED. The first three are ongoing: they are read from
// outside the sheet every time a number is asked for, and the recipient's JSON is never touched.
// Healing is not like that — it is a one-time change to `hp`, it usually wants a die rolled that
// the table should see, and temp HP REPLACES rather than stacks, so 5e makes taking it a choice.
// All three of those reasons say the same thing: the recipient applies it, on their own sheet, with
// their own client doing the writing. Which is also the only way it can be written at all without
// racing their autosave.
//
// `amount` on a modifier is always a flat number BY THE TIME IT IS GRANTED. A benefit may be
// authored as derived — "my Dream modifier" — but a derivation is resolved against the CASTER at
// the moment of the cast and frozen onto the granted row, because re-deriving it on the recipient
// would quietly turn "my Dream modifier" into theirs. See `resolveBenefit`.
export const BENEFITS_MAX = 6;          // SAVE_BYTES is 8000 and a seal snapshot is ~400
export const BENEFIT_ROUNDS = [1, 2, 3, 10, 100];

export const BENEFIT_KINDS = [
  { id: "modifier", name: "a bonus to something", ongoing: true },
  { id: "advantage", name: "advantage on something", ongoing: true },
  { id: "heal", name: "healing", ongoing: false },
  { id: "tempHp", name: "temporary hit points", ongoing: false },
  { id: "defence", name: "a resistance", ongoing: true },
  { id: "turn", name: "an extra action", ongoing: true },
];
export const BENEFIT_KIND_BY_ID = Object.fromEntries(BENEFIT_KINDS.map(k => [k.id, k]));
export const isOngoing = kind => !!BENEFIT_KIND_BY_ID[kind]?.ongoing;

const TARGETS = new Set(rules.MOD_TARGET_IDS);
// "3d8", "2d6+4", "12" — what the recipient will roll. Deliberately narrow: this string is handed
// to the sheet's own dice parser, and anything it could not read is not a benefit.
const DICE = /^\s*(\d{0,2}d\d{1,3}\s*([+-]\s*\d{1,3})?|\d{1,3})\s*$/i;
export const cleanDice = s => (DICE.test(String(s || "")) ? String(s).replace(/\s+/g, "") : "");

// One authored benefit, cleaned. Returns null for anything the sheet could not apply, so a hand-
// edited save cannot put a row into somebody else's sheet that nothing knows how to read.
export function cleanBenefit(b) {
  if (!b || typeof b !== "object") return null;
  const kind = BENEFIT_KIND_BY_ID[b.kind] ? String(b.kind) : "modifier";
  const rounds = BENEFIT_ROUNDS.includes(Number(b.rounds)) ? Number(b.rounds) : null;
  const note = String(b.note || "").slice(0, 80);

  if (kind === "heal" || kind === "tempHp") {
    // One-time, so no duration: it either lands or it does not.
    const dice = cleanDice(b.dice);
    if (!dice) return null;
    return { kind, dice, note };
  }

  if (kind === "defence") {
    const dtype = String(b.dtype || "").toLowerCase();
    const standing = String(b.standing || "");
    // Vulnerability is a real standing, but a SEAL handing an ally one is not a benefit — and the
    // picker never offers it. Refused here too, so a hand-edited save cannot smuggle one in.
    if (!rules.DAMAGE_BY_ID[dtype]) return null;
    if (standing !== "resistant" && standing !== "immune") return null;
    return { kind, dtype, standing, rounds, note };
  }

  if (kind === "turn") {
    const turnKind = rules.TURN_KINDS.includes(b.turnKind) ? String(b.turnKind) : "";
    if (!turnKind) return null;
    const n = Math.max(1, Math.min(3, Math.trunc(Number(b.n) || 1)));
    return { kind, turnKind, n, rounds, note };
  }

  // Advantage is SCOPED BY THE SAME TARGET VOCABULARY as a bonus, which is the whole reason it fits
  // here at all: "advantage on Perception" and "+2 Perception" name the same thing, so the picker,
  // the roll that consults it and the vault importer all keep one list. It has no amount — the
  // second d20 is the amount.
  if (kind === "advantage") {
    const target = String(b.target || "");
    if (!TARGETS.has(target)) return null;
    return { kind, target, rounds, note };
  }

  const target = String(b.target || "");
  if (!TARGETS.has(target)) return null;
  const from = rules.DERIVE_FROM.some(d => d.id === b.from) ? String(b.from) : "";
  const amount = Math.trunc(Number(b.amount) || 0);
  if (!from && (amount === 0 || amount < -30 || amount > 30)) return null;
  const times = from ? (Number(b.times) || 1) : 0;
  return { kind: "modifier", target, amount: from ? 0 : amount,
           ...(from ? { from, times } : {}), rounds, note };
}

export const cleanBenefits = list =>
  (Array.isArray(list) ? list : []).map(cleanBenefit).filter(Boolean).slice(0, BENEFITS_MAX);

// What this benefit is worth, cast by THIS character, right now. The caster's sheet is the only one
// consulted; what comes out is what lands.
//
// Everything a kind needs beyond the shared columns travels in `payload`, so the table does not
// grow a column per kind and an older row keeps meaning what it meant.
export function resolveBenefit(caster, b) {
  const base = { kind: b.kind || "modifier", rounds: b.rounds ?? null,
                 note: b.note || "", formula: "", target: "", amount: 0, payload: null };

  if (b.kind === "heal" || b.kind === "tempHp")
    return { ...base, rounds: null, payload: { dice: b.dice } };

  if (b.kind === "defence")
    return { ...base, payload: { dtype: b.dtype, standing: b.standing } };

  if (b.kind === "turn")
    return { ...base, payload: { turnKind: b.turnKind, n: b.n } };

  // Advantage rides in the `target` column beside a modifier's, because it IS a modifier target —
  // and nothing about the caster changes what it is worth, so there is nothing to resolve.
  if (b.kind === "advantage")
    return { ...base, target: b.target };

  return {
    ...base,
    target: b.target,
    amount: b.from ? rules.modifierAmount(caster, b) : Math.trunc(Number(b.amount) || 0),
    // Kept so the recipient's tooltip can say where the number came from rather than showing a 4
    // that nobody can account for six weeks later.
    formula: b.from ? rules.derivationLabel(b) : "",
  };
}

// Is this benefit worth nothing at all right now? Only a modifier can work out to zero; a heal of
// "3d8" is never nothing, and a resistance has no number to be zero.
export const benefitIsEmpty = r => (r.kind || "modifier") === "modifier" && r.amount === 0;

// One line saying what a benefit does, used by the cast dialog, the sheet and the party board so
// the same grant reads the same way in all three.
export function benefitSays(b) {
  const k = b.kind || "modifier";
  if (k === "advantage") return `advantage on ${targetLabel(b.target)}`;
  if (k === "heal") return `heals ${b.payload?.dice || b.dice || ""}`;
  if (k === "tempHp") return `${b.payload?.dice || b.dice || ""} temporary HP`;
  if (k === "defence") {
    const p = b.payload || b;
    return `${p.standing === "immune" ? "immune to" : "resistant to"} ${rules.DAMAGE_BY_ID[p.dtype]?.name.toLowerCase() || p.dtype}`;
  }
  if (k === "turn") {
    const p = b.payload || b;
    const n = Number(p.n) || 1;
    return `${n > 1 ? `${n} extra ` : "an extra "}${p.turnKind}${n > 1 ? "s" : ""}`;
  }
  const n = Number(b.amount) || 0;
  return `${n > 0 ? "+" : ""}${n} ${targetLabel(b.target)}`;
}
