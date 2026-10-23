// Ephemer — the character sheet's rules engine.
//
// Every number the sheet shows is computed here, and nothing in this file touches the DOM or the
// network. That is deliberate and it is NF-002 of the spec: the calculations are isolated from the
// UI, deterministic, and the same state always produces the same totals — which is what makes them
// testable, and what will let the server recompute them when it stops trusting the browser.
//
// The rules that are NOT plain 2014 D&D are marked with the ruling that decides them, because
// several of them look like the standard rule until you read them twice:
//
//   DM-01/RES-03   Dream starts at 10 and only a campaign event raises it
//   DM-10/RES-01   Cognitive Saving Throw uses the HIGHEST of the six, never a chosen Main Stat
//   DM-08/RES-11   Dream Exhaustion is cumulative — the -5 stays on at levels 6, 7 and 8
//   DM-09          a survived Cognitive Collapse leaves the track AT 8, it does not reset
//   RES-02         death-save and concentration DCs rise with Wounds and unhealed Injuries
//   RES-10         Honor and Morality are four sub-scores, and the modifier is directional
//   RES-06         Fabricate crafting adds INT on top of Dream — once, never proficiency twice
//
// Canon lives in the vault, not here: Cognitive Saving Throw.md, Dream Exhaustion.md,
// Wounds & Injuries..md, Honor & Moral.md. If one of those changes, change this with it.

// ── The six, and the seventh ───────────────────────────────
export const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"];
export const ABILITY_NAMES = {
  str: "Strength", dex: "Dexterity", con: "Constitution",
  int: "Intelligence", wis: "Wisdom", cha: "Charisma", dream: "Dream",
};

/** 5e's score-to-modifier, used by Dream as well — RES-03 grants it no exception. */
export const mod = score => Math.floor((Number(score) || 0) / 2) - 5;

/** 2014 proficiency bonus. Total character level, so multiclass sums before it gets here. */
export const profBonus = level => 2 + Math.floor((clamp(level, 1, 20) - 1) / 4);

export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, Number(n) || 0));
export const signed = n => (n >= 0 ? `+${n}` : `${n}`);

/** The six modifiers, as an object. Dream is deliberately not in here — see cognitiveSave. */
export function mods(scores) {
  const out = {};
  for (const a of ABILITIES) out[a] = mod(scores?.[a]);
  return out;
}

// ── Skills ─────────────────────────────────────────────────
// The four Dream skills come from Awakening (DA-01) and key off Dream rather than a standard
// ability. Harvesting is HB-003: the player picks which of Wisdom or Intelligence a given check
// uses, so its ability is stored on the character, not fixed here.
export const DREAM_SKILLS = [
  { key: "alter",     name: "Alter",     ability: "dream", note: "Reshape what is already dreamt." },
  { key: "fabricate", name: "Fabricate", ability: "dream", note: "Make something out of Rhea Sand." },
  { key: "incept",    name: "Incept",    ability: "dream", note: "Enter, and move between, dreams." },
  { key: "reveal",    name: "Reveal",    ability: "dream", note: "Read what a dream is hiding." },
];

export const CUSTOM_SKILLS = [
  { key: "harvesting", name: "Harvesting", ability: "wis", choices: ["wis", "int"],
    note: "Wisdom or Intelligence — the character's pick, per check." },
];

export const SKILLS_2014 = [
  ["acrobatics", "Acrobatics", "dex"], ["animal", "Animal Handling", "wis"],
  ["arcana", "Arcana", "int"], ["athletics", "Athletics", "str"],
  ["deception", "Deception", "cha"], ["history", "History", "int"],
  ["insight", "Insight", "wis"], ["intimidation", "Intimidation", "cha"],
  ["investigation", "Investigation", "int"], ["medicine", "Medicine", "wis"],
  ["nature", "Nature", "int"], ["perception", "Perception", "wis"],
  ["performance", "Performance", "cha"], ["persuasion", "Persuasion", "cha"],
  ["religion", "Religion", "int"], ["sleight", "Sleight of Hand", "dex"],
  ["stealth", "Stealth", "dex"], ["survival", "Survival", "wis"],
].map(([key, name, ability]) => ({ key, name, ability }));

/**
 * One skill's total, with the parts that made it.
 * `train` is 0 none, 1 proficient, 2 expertise — never added twice (RES-06's warning).
 */
export function skillTotal(ch, skill) {
  const ability = skill.ability === "dream" ? "dream" : (ch.skillAbility?.[skill.key] || skill.ability);
  const abilityMod = ability === "dream" ? mod(ch.dream) : mod(ch.scores?.[ability]);
  const train = clamp(ch.skills?.[skill.key] ?? 0, 0, 2);
  const pb = profBonus(ch.level);
  const prof = train * pb;
  const misc = Number(ch.skillMisc?.[skill.key]) || 0;
  return {
    total: abilityMod + prof + misc,
    parts: [
      { label: ABILITY_NAMES[ability], value: abilityMod },
      ...(train ? [{ label: train === 2 ? `Expertise (2 × ${pb})` : `Proficiency (${pb})`, value: prof }] : []),
      ...(misc ? [{ label: "Other", value: misc }] : []),
    ],
    ability, train,
  };
}

/** A saving throw: ability + proficiency if trained. Dream saves use the Dream score. */
export function saveTotal(ch, ability) {
  const abilityMod = ability === "dream" ? mod(ch.dream) : mod(ch.scores?.[ability]);
  const prof = ch.saves?.[ability] ? profBonus(ch.level) : 0;
  const misc = Number(ch.saveMisc?.[ability]) || 0;
  return {
    total: abilityMod + prof + misc,
    parts: [
      { label: ABILITY_NAMES[ability], value: abilityMod },
      ...(prof ? [{ label: `Proficiency (${prof})`, value: prof }] : []),
      ...(misc ? [{ label: "Other", value: misc }] : []),
    ],
  };
}

// ── Cognitive Saving Throw — DM-10 / RES-01 ────────────────
// `d20 + Dream modifier + the highest of the six`. No proficiency, and Dream is NOT a candidate
// for the second term: it is already the first one and is never counted twice.
//
// Juan ruled this on 2026-10-23, retiring the older Main Stat rule in which the player chose an
// "anchor of self" at creation. The old rule is not a variant to fall back on — do not add one.
export function cognitiveSave(ch) {
  const six = mods(ch.scores);
  let best = ABILITIES[0];
  for (const a of ABILITIES) if (six[a] > six[best]) best = a;
  const dreamMod = mod(ch.dream);
  return {
    total: dreamMod + six[best],
    highest: best,
    parts: [
      { label: "Dream", value: dreamMod },
      { label: `Highest of the six — ${ABILITY_NAMES[best]}`, value: six[best] },
    ],
    // Stated so the sheet can say it out loud rather than leaving a player to wonder.
    excludes: "No proficiency. Dream is the first term and is never counted as the highest too.",
  };
}

// ── Wounds and Injuries — RES-02 ───────────────────────────
// Each active Wound and each unhealed Injury raises the death-save DC and the concentration DC
// by one. The concentration floor is the ordinary 5e one before those add on.
export function deathSaveDc(ch) {
  const w = clamp(ch.wounds, 0, 6), i = clamp(ch.injuries, 0, 5);
  return { dc: 10 + w + i, parts: [{ label: "Base", value: 10 }, { label: "Wounds", value: w }, { label: "Unhealed Injuries", value: i }] };
}

export function concentrationDc(ch, damage) {
  const w = clamp(ch.wounds, 0, 6), i = clamp(ch.injuries, 0, 5);
  const base = Math.max(10, Math.floor((Number(damage) || 0) / 2));
  return { dc: base + w + i, parts: [{ label: `Half of ${damage || 0}, min 10`, value: base }, { label: "Wounds", value: w }, { label: "Unhealed Injuries", value: i }] };
}

/**
 * The sixth Wound is what makes an Injury, and Wounds then reset to the number of active
 * Injuries, capped at five. Returns the state after the Injury is recorded — the Injury itself
 * is the DM's to roll and name, so this never invents one.
 */
export function injuryFromWounds(ch) {
  if (clamp(ch.wounds, 0, 99) < 6) return null;
  const injuries = clamp(ch.injuries, 0, 99) + 1;
  return { injuries, wounds: Math.min(injuries, 5), prompt: "Six Wounds — the DM determines the Injury." };
}

/** A spell of 4th level or higher removes `level - 3` Wounds, unless the spell says otherwise. */
export const woundsHealedBySpell = spellLevel =>
  (Number(spellLevel) || 0) >= 4 ? Number(spellLevel) - 3 : 0;

// ── Dream Exhaustion — DE-01, and cumulative by DM-08 ──────
// The named ladder is the vault's table. The penalty column is where the ruling bites: the note
// stops naming a penalty after level 5, and Juan confirmed earlier effects persist — so the -5
// is still on at 6, 7 and 8 rather than quietly lapsing.
export const DREAM_EXHAUSTION = [
  { level: 0, name: "None",               penalty: 0,  effect: "No Dream Exhaustion." },
  { level: 1, name: "Flicker",            penalty: -1, effect: "Your reflection no longer mimics you." },
  { level: 2, name: "Fracture",           penalty: -2, effect: "A voice narrates your thoughts — DC 12 Wisdom (Insight) to resist distraction." },
  { level: 3, name: "Duality",            penalty: -3, effect: "You see your Hollowborn in crowds, mirrors and Denizen masks." },
  { level: 4, name: "Dissonance",         penalty: -4, effect: "Irrefutable disadvantage on Concentration checks. False memories may occur." },
  { level: 5, name: "Loop Entrapment",    penalty: -5, effect: "Once per session you may repeat an action or line unless a DC 20 Dream Save succeeds." },
  { level: 6, name: "Identity Drift",     penalty: -5, effect: "A Dream Scar. You cannot benefit from Inspiration while in dream." },
  { level: 7, name: "Dream Echo State",   penalty: -5, effect: "GM rolls 1d4 each round; on a 1 your shadow overrides an action. Visible to all Nightmares." },
  { level: 8, name: "Cognitive Collapse", penalty: -5, effect: "Dream Save vs the Dream Node DC. Failure is permanent Hollowborn; success wakes you." },
];

/**
 * What Dream Exhaustion is doing right now. The penalty applies to d20 rolls IN DREAM only —
 * a waking roll is untouched, which is why `inDream` has to be asked for rather than assumed.
 */
export function dreamExhaustion(level, inDream) {
  const rung = DREAM_EXHAUSTION[clamp(level, 0, 8)];
  return {
    ...rung,
    applied: inDream ? rung.penalty : 0,
    cumulative: rung.level >= 6,          // so the UI can say WHY a level-7 roll still takes -5
    concentrationDisadvantage: rung.level >= 4,
    inspirationBlocked: inDream && rung.level >= 6,
  };
}

/**
 * A survived Collapse — DM-09. The character wakes, takes four levels of PHYSICAL Exhaustion and
 * loses 1d3 long-term memories, and the Dream track STAYS AT 8. It is not reset, and this
 * function will not reset it however tempting that looks.
 *
 * The memories themselves and the Dream Scar are the DM's to author (APR/open item 8), so this
 * returns a prompt rather than any narrative text.
 */
export function collapseSurvived(ch) {
  return {
    dreamExhaustion: 8,
    exhaustion: clamp(ch.exhaustion, 0, 6) + 4,
    prompt: "Roll 1d3 — that many long-term memories are lost. The DM names them and the Dream Scar.",
  };
}

/** A long rest WITHOUT Dream Walking takes one level off. One that included it takes none. */
export const dreamRestRecovery = (level, dreamWalked) =>
  dreamWalked ? clamp(level, 0, 8) : Math.max(0, clamp(level, 0, 8) - 1);

// ── Honor and Morality — RES-10 ────────────────────────────
// Four independent sub-scores. The totals are sums, and the situational modifier is the DIFFERENCE
// — positive when the dominant side is the one the situation calls for, negative when it is not,
// zero on a tie. It is not an ability modifier and does not go through mod().
export function axis(a, b, alignedWith) {
  const hi = Math.max(a, b), lo = Math.min(a, b);
  const diff = hi - lo;
  if (diff === 0) return { total: a + b, modifier: 0, dominant: null };
  const dominant = a > b ? "a" : "b";
  return { total: a + b, modifier: alignedWith === dominant ? diff : -diff, dominant };
}

export function honor(ch, alignedWith) {
  const r = axis(ch.honorOrder || 0, ch.honorChaos || 0, alignedWith === "order" ? "a" : alignedWith === "chaos" ? "b" : null);
  return { ...r, dominant: r.dominant === "a" ? "order" : r.dominant === "b" ? "chaos" : null };
}

export function morality(ch, alignedWith) {
  const r = axis(ch.moralityGood || 0, ch.moralityEvil || 0, alignedWith === "good" ? "a" : alignedWith === "evil" ? "b" : null);
  return { ...r, dominant: r.dominant === "a" ? "good" : r.dominant === "b" ? "evil" : null };
}

// ── Fate Die — FD-02, DM-04 through DM-07 ──────────────────
// Two d20, and the one kept is the face FARTHEST from 10 — not the higher, and not compared after
// modifiers. Equidistant faces reroll BOTH dice; the "higher die" variant is not active here.
// This returns the selection only: spending the charge and retconning the event are the server's
// and the DM's, and nothing in the app may hand a player a charge.
export function emphasis(rolls) {
  const d = (a) => Math.abs(a - 10);
  const [x, y] = rolls;
  if (d(x) === d(y)) return { tie: true, kept: null, rolls: [x, y], reason: "Equidistant from 10 — reroll both dice." };
  const kept = d(x) > d(y) ? x : y;
  return { tie: false, kept, rolls: [x, y], reason: `${kept} is ${d(kept)} from 10; the other is ${d(kept === x ? y : x)}.` };
}

// ── Derived combat numbers ─────────────────────────────────
export function initiative(ch) {
  const m = mod(ch.scores?.dex) + (Number(ch.initiativeMisc) || 0);
  return { total: m };
}

export function passive(ch, skillKey) {
  const s = [...SKILLS_2014, ...DREAM_SKILLS, ...CUSTOM_SKILLS].find(k => k.key === skillKey);
  return s ? 10 + skillTotal(ch, s).total : 10;
}

/** Spell attack and save DC for one casting ability — CS-043 keeps them per source. */
export function spellcasting(ch, ability) {
  const pb = profBonus(ch.level);
  const m = ability === "dream" ? mod(ch.dream) : mod(ch.scores?.[ability]);
  return { attack: m + pb, dc: 8 + m + pb, ability };
}

// ── Fabricate — RES-06 ─────────────────────────────────────
// A general Fabricate check is the ordinary skill. CRAFTING a Dream item adds Intelligence on top
// of Dream, and the proficiency contribution is counted exactly once in both.
export function fabricate(ch, { crafting = false } = {}) {
  const skill = skillTotal(ch, DREAM_SKILLS.find(s => s.key === "fabricate"));
  if (!crafting) return { total: skill.total, parts: skill.parts };
  const intMod = mod(ch.scores?.int);
  return {
    total: skill.total + intMod,
    parts: [...skill.parts, { label: "Intelligence (crafting only)", value: intMod }],
  };
}

// ── Pair Action — DM-12 / RES-14 ───────────────────────────
// `8 + both proficiency bonuses + the HIGHER of the two eligible modifiers`, added once.
// The example in the vault note used to read 10 + 4 + 3 and reached 17 by luck; corrected
// 2026-10-23 at the same time as this was written.
export function pairSaveDc(pbA, pbB, modA, modB) {
  const best = Math.max(Number(modA) || 0, Number(modB) || 0);
  return { dc: 8 + (Number(pbA) || 0) + (Number(pbB) || 0) + best, used: best };
}

// ── Cognitive Sense — CGS-01, shared pool by DM-11 ─────────
// One use per short rest, two at Dream 18 or higher, and Pulse and Whisper spend from the SAME
// pool: an activation of either is one use. Usable only in Insomnia.
export const cognitiveSenseUses = dreamScore => (Number(dreamScore) >= 18 ? 2 : 1);

export const WHISPER_BANDS = [
  { min: 1,  max: 9,  learn: "An uneasy presence, nothing specific. Try again after a long rest." },
  { min: 10, max: 14, learn: "Emotional resonance and general direction." },
  { min: 15, max: 19, learn: "The Cognition's name, its location's dream flavour, and its attunement DC range." },
  { min: 20, max: 24, learn: "A vision or metaphorical symbol, and the ideal method of engagement." },
  { min: 25, max: 99, learn: "Known for Incepting for 1 hour — you may attempt attunement as if standing before it." },
];

export const whisperBand = result => WHISPER_BANDS.find(b => result >= b.min && result <= b.max) || WHISPER_BANDS[0];

// ── Attunement — DM-14 / RES-09 ────────────────────────────
// Three baseline slots, plus three Insomnia-only slots for Dreamlike and Lucidlike items. Leaving
// Insomnia does NOT unattune anything: the records stand and the extra-slot effects go inactive,
// coming back when the character is eligible in Insomnia again.
export function attunement(ch, { inInsomnia = false } = {}) {
  const baseline = 3 + (Number(ch.attunementBonus) || 0);
  const items = ch.attuned || [];
  const planar = items.filter(i => i.planar);
  const normal = items.filter(i => !i.planar);
  return {
    baseline, used: normal.length,
    planarSlots: 3, planarUsed: planar.length,
    planarActive: inInsomnia,
    // The wording the sheet should use, so nobody reads "inactive" as "lost"
    planarNote: inInsomnia
      ? "Active — you are in Insomnia."
      : "Inactive outside Insomnia. The attunement stands; only the effects are suspended.",
    over: normal.length > baseline,
  };
}
