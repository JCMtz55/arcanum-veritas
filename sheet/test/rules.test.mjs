// The eleven minimum test fixtures from Character Sheet Requirements v1.5, plus the acceptance tests
// its appendices spell out for Fate, Dream Exhaustion and Honor.
//
// These are transcribed from the spec, not invented: when one of them fails, the engine is wrong, not
// the test. Run with:  node --test sheet/test/

import { test } from "node:test";
import assert from "node:assert/strict";
import * as R from "../js/rules.js";

// A character built from the blank sheet with only the fields a fixture names, so a test can never
// pass because of a number it did not set.
const pc = (over = {}) => ({ ...R.blankCharacter(), ...over,
  abilities: { ...R.blankCharacter().abilities, ...(over.abilities || {}) } });

// ── 1. Cognitive Saving Throw ───────────────────────────────────────────
// "Dream=16 (mod +3), STR=12 (+1), DEX=18 (+4); roll 10 => CogST 17, no proficiency.
//  A legacy Main Stat STR choice would yield 14, but only if explicitly selected as the active variant."
test("fixture 1 — CogST is Dream mod + highest of the six, without proficiency", () => {
  const ch = pc({ level: 5, abilities: { dream: 16, str: 12, dex: 18 } });
  assert.equal(R.abilityModifier(ch, "dream"), 3);
  assert.equal(R.cognitiveSavingThrow(ch, 10), 17);

  // Proficiency must not creep in: a CogST is not a check.
  const proficient = pc({ level: 5, abilities: { dream: 16, str: 12, dex: 18 }, skills: { incept: 2 } });
  assert.equal(R.cognitiveSavingThrow(proficient, 10), 17);

  // The highest of the six is DEX here, not the retired "Main Stat" STR reading that would give 14.
  assert.deepEqual(R.cognitiveSavingThrowSources(ch), { best: 4, tied: ["dex"] });
  assert.notEqual(R.cognitiveSavingThrow(ch, 10), 14);

  // Dream is excluded from the highest-of-six term — at Dream 16 it would otherwise win.
  const dreamy = pc({ level: 5, abilities: { dream: 20, str: 10, dex: 10 } });
  assert.equal(R.cognitiveSavingThrowSources(dreamy).best, 0);
});

// ── 2. Wounds, death saves and concentration ────────────────────────────
// "2 Wounds + 1 unhealed Injury => death-save DC 13; damage 28 => concentration DC max(10,14)+3=17.
//  After the sixth Wound creates a first Injury, Wounds reset to 1."
test("fixture 2 — Wounds and Injuries raise both DCs by +1 each", () => {
  assert.equal(R.deathSaveDC(2, 1), 13);
  assert.equal(R.concentrationDC(28, 2, 1), 17);

  // The floor(damage/2) term only matters once it beats 10.
  assert.equal(R.concentrationDC(6, 0, 0), 10);
  assert.equal(R.concentrationDC(28, 0, 0), 14);

  // Sixth Wound creates the first Injury, and Wounds reset to the active injury count, max five.
  assert.equal(R.INJURY_AT_WOUNDS, 6);
  assert.equal(R.woundsAfterInjury(1), 1);
  assert.equal(R.woundsAfterInjury(7), 5);

  // At most one Wound per turn however many triggers fired, unless the DM overrides it.
  assert.deepEqual(R.woundsFromTriggers(["critical", "zeroHp", "halfMaxHp"]), { wounds: 1, suppressed: 2 });
  assert.deepEqual(R.woundsFromTriggers(["critical", "zeroHp"], { dmOverride: true }), { wounds: 2, suppressed: 0 });

  // A 4th-level healing spell removes one Wound, +1 per level above 4th; nothing below 4th does.
  assert.equal(R.woundsRemovedBySpell(3), 0);
  assert.equal(R.woundsRemovedBySpell(4), 1);
  assert.equal(R.woundsRemovedBySpell(6), 3);
});

// ── 3. Honor and Morality ───────────────────────────────────────────────
// "Order=5, Chaos=5 => directional modifier 0. At Order=4, Chaos=6 => Chaos +2 / Order -2."
test("fixture 3 — axis totals are sums and the modifier is the signed difference", () => {
  assert.equal(R.axisModifier({ order: 5, chaos: 5 }, "chaos"), 0);
  assert.equal(R.axisModifier({ order: 4, chaos: 6 }, "chaos"), 2);
  assert.equal(R.axisModifier({ order: 4, chaos: 6 }, "order"), -2);

  // The spec's other worked example: Good 7 / Evil 3 gives +4 aligned, -4 opposed.
  assert.equal(R.axisModifier({ good: 7, evil: 3 }, "good"), 4);
  assert.equal(R.axisModifier({ good: 7, evil: 3 }, "evil"), -4);

  // Totals are plain sums, NOT ability-modifier arithmetic.
  assert.equal(R.honorTotal({ order: 6, chaos: 4 }), 10);
  assert.equal(R.moralityTotal({ good: 5, evil: 3 }), 8);

  // The owning note writes this sub-score as both "Order" and "Law"; either spelling must resolve.
  assert.equal(R.axisModifier({ order: 4, chaos: 6 }, "law"), -2);

  // HB-024: Good=7, Evil=3, Order=6, Chaos=4 => ((4)+(2))/2 = +3.
  assert.equal(R.corruptionSaveModifier({ good: 7, evil: 3, order: 6, chaos: 4 }), 3);
  // Rounded DOWN, including when negative.
  assert.equal(R.corruptionSaveModifier({ good: 0, evil: 1, order: 0, chaos: 0 }), -1);
});

// ── 4. Fabricate's two formulas ─────────────────────────────────────────
// "Dream 16 (+3), INT 14 (+2), proficiency +3 => general Fabricate +6, crafting Fabricate +8
//  (before situational bonuses); expertise changes proficiency contribution only once."
test("fixture 4 — general Fabricate is the skill, crafting adds Intelligence", () => {
  const ch = pc({ level: 5, abilities: { dream: 16, int: 14 }, skills: { fabricate: 1 } });
  assert.equal(R.proficiencyBonus(5), 3);
  assert.equal(R.fabricateGeneral(ch), 6);
  assert.equal(R.fabricateCrafting(ch), 8);

  // Expertise doubles the proficiency contribution once: 3 + 6 = 9, and 2 + 9 = 11. Never 3 + 6 + 6.
  const expert = pc({ level: 5, abilities: { dream: 16, int: 14 }, skills: { fabricate: 2 } });
  assert.equal(R.fabricateGeneral(expert), 9);
  assert.equal(R.fabricateCrafting(expert), 11);
});

// ── 5. Attunement across planes ─────────────────────────────────────────
// "In Ephemer, 3 baseline magic slots; in Insomnia, three additional eligible Dreamlike/Lucidlike
//  slots become available. Leaving Insomnia deactivates their extra-pool effects but preserves the
//  attunement records."
test("fixture 5 — Insomnia-only attunement goes inactive off-plane without being lost", () => {
  const ch = pc({ attuned: [
    { name: "Etherium Twin Daggers" }, { name: "Cloak" }, { name: "Ring" },
    { name: "Dreamlike Lantern", insomniaOnly: true }, { name: "Lucidlike Mirror", insomniaOnly: true },
  ] });

  const awake = R.attunement(ch, { inInsomnia: false });
  assert.equal(awake.baseline, 3);
  assert.equal(awake.used, 3);
  assert.equal(awake.active.length, 3);
  assert.equal(awake.inactive.length, 2);                       // suspended, not removed
  assert.equal(ch.attuned.length, 5);                           // the records survive

  const dreaming = R.attunement(ch, { inInsomnia: true });
  assert.equal(dreaming.active.length, 5);
  assert.equal(dreaming.inactive.length, 0);
  assert.equal(dreaming.insomniaSlots, 3);
});

// ── 6. Level authority and allocations ──────────────────────────────────
// "Character level 4->5 granted by DM creates two allocations (one Honor, one Morality); a
//  player-triggered or duplicated request creates none."
test("fixture 6 — one DM-granted level issues exactly one Honor and one Morality allocation", () => {
  assert.deepEqual(R.levelAllocations(4, 5), { honor: 1, morality: 1, levels: 1 });

  // A duplicate request moves nothing.
  assert.deepEqual(R.levelAllocations(5, 5), { honor: 0, morality: 0, levels: 0 });
  // A rollback never issues allocations either.
  assert.deepEqual(R.levelAllocations(5, 4), { honor: 0, morality: 0, levels: 0 });
  // Two levels at once issue two of each, regardless of how they split across classes.
  assert.deepEqual(R.levelAllocations(4, 6), { honor: 2, morality: 2, levels: 2 });
});

// ── 7. Paralyzed — Force Through ────────────────────────────────────────
// "cost +1 normal Exhaustion; can act until end of turn; paralysis resumes if underlying cause
//  remains. Dream Exhaustion is unchanged."
test("fixture 7 — Force Through costs physical Exhaustion and leaves Dream Exhaustion alone", () => {
  const ch = pc({ exhaustion: 1, dreamExhaustion: 3 });
  const out = R.forceThrough(ch);
  assert.equal(out.exhaustion, 2);
  assert.equal(out.dreamExhaustion, 3);
  assert.equal(out.suppressedUntilEndOfTurn, true);
  assert.equal(out.saveThisTurn, false);

  // The campaign Stunned is not 5e stunned: an Action OR a Bonus Action, and only one attack.
  assert.deepEqual(R.CONDITIONS["stunned"].allowances,
    { speedHalved: true, reactions: false, actionOrBonusNotBoth: true, maxAttacks: 1 });
});

// ── 8. Bound is two conditions ──────────────────────────────────────────
// "`Bound — Term` and `Bound — Proximity` may coexist under different IDs without merging effects."
test("fixture 8 — the two Bound conditions keep separate ids and names", () => {
  const term = R.CONDITIONS["bound.term"], prox = R.CONDITIONS["bound.proximity"];
  assert.notEqual(term.id, prox.id);
  assert.notEqual(term.name, prox.name);
  assert.match(term.name, /Term$/);
  assert.match(prox.name, /Proximity$/);
  // There is deliberately no bare "bound": an effect that says only Bound no longer resolves.
  assert.equal(R.CONDITIONS["bound"], undefined);
});

// ── 9. Pair Action ──────────────────────────────────────────────────────
// "PB_A=4, PB_B=3, highest eligible mod +2 => DC 17."
test("fixture 9 — Pair Action DC uses both PBs and the higher modifier once", () => {
  assert.equal(R.pairActionDC(4, 3, 2, 1), 17);
  // The higher is selected, never the sum: swapping the two must not change the DC.
  assert.equal(R.pairActionDC(4, 3, 1, 2), 17);
  assert.notEqual(R.pairActionDC(4, 3, 2, 1), 8 + 4 + 3 + 2 + 1);
});

// ── 10. Fate Die — Rolling With Emphasis ────────────────────────────────
// "(a) 3 vs 17 and 4 vs 16 both tie and reroll both dice; (b) 1 vs 20 selects 20 (distances 9 vs 10);
//  (c) the DM grants two Fate uses and a player can spend one, leaving one; (e) no player can grant
//  themselves charges or trigger automatic recovery."
test("fixture 10 — Emphasis keeps the face farthest from 10 and rerolls ties", () => {
  // (a) equidistant pairs tie
  assert.equal(R.emphasisPick(3, 17).tie, true);
  assert.equal(R.emphasisPick(4, 16).tie, true);
  assert.equal(R.emphasisPick(3, 17).pick, null);

  // (b) 1 vs 20 selects 20 — distances 9 and 10
  const r = R.emphasisPick(1, 20);
  assert.equal(r.tie, false);
  assert.equal(r.pick, 20);
  assert.deepEqual(r.distances, [9, 10]);

  // Selection is on the natural faces, so a low roll can beat a high one: 1 is farther than 15.
  assert.equal(R.emphasisPick(1, 15).pick, 1);

  // A tie rerolls BOTH dice, and the log keeps the pair that tied.
  const seq = [0.1, 0.8, 0.0, 0.95];            // -> 3, 17 (tie), then 1, 20
  let i = 0;
  const out = R.rollEmphasis(() => seq[i++]);
  assert.equal(out.rerolls, 1);
  assert.equal(out.pick, 20);
  assert.equal(out.pairs.length, 2);
  assert.deepEqual(out.pairs[0].dice, [3, 17]);
  assert.equal(out.pairs[0].tie, true);
  assert.deepEqual(out.pairs[1].dice, [1, 20]);

  // (c) and (e): a balance of two can pay; a balance of zero cannot, and nothing here restores one.
  assert.equal(R.canSpendFate(pc({ fate: 2 })), true);
  assert.equal(R.canSpendFate(pc({ fate: 0 })), false);
  assert.equal(typeof R.restoreFate, "undefined");
});

// ── 11. Star Force ──────────────────────────────────────────────────────
// "Dream 18 does nothing by itself; DM epiphany transitions to Imaginari 18 with no score cap.
//  Wish Embers are computed from logged distinct prior unlocks, then confirmed."
test("fixture 11 — Dream 18 is eligibility only, never the transition", () => {
  const ch = pc({ abilities: { dream: 18 } });
  assert.equal(R.starForceEligible(ch), true);

  const idle = R.starForceTransition(ch);
  assert.equal(idle.transitioned, false);
  assert.match(idle.reason, /epiphany/i);

  const done = R.starForceTransition(ch, { dmEpiphany: true });
  assert.equal(done.transitioned, true);
  assert.equal(done.imaginari, 18);
  assert.equal(done.capRemoved, true);

  assert.equal(R.starForceEligible(pc({ abilities: { dream: 17 } })), false);

  // 3 x attained Grimm stages + distinct known + distinct mastered at Tier III.
  assert.equal(R.wishEmbers({ grimmStagesAttained: 4, knownCognitions: 12, masteredTierIII: 3 }), 27);
  assert.equal(R.wishEmbers(), 0);
});

// ── Dream Exhaustion acceptance tests ───────────────────────────────────
// "(a) level 3 dreaming roll receives -3 and real-world roll does not; (c) level 7 dream d20 roll
//  still suffers -5; (d) dream-free long rest changes 3->2, dream-walking rest does not;
//  (e) a level-8 successful save leaves Dream Exhaustion at 8 and applies four physical Exhaustion."
test("Dream Exhaustion is cumulative, holds at -5, and only recovers without Dream Walking", () => {
  // (a) the penalty applies in a dream, not in the waking world
  assert.equal(R.dreamRollPenalty(3, true), -3);
  assert.equal(R.dreamRollPenalty(3, false), 0);

  // (b) level 4 brings the campaign's Concentration disadvantage
  assert.equal(R.dreamExhaustion(4).concentrationDisadvantage, true);
  assert.equal(R.dreamExhaustion(3).concentrationDisadvantage, undefined);

  // (c) the -5 persists at 6, 7 and 8 — the ruling the source table stops short of stating
  for (const lv of [5, 6, 7, 8]) assert.equal(R.dreamExhaustion(lv).penalty, -5);
  // and the lower levels' effects persist alongside it
  const seven = R.dreamExhaustion(7);
  assert.equal(seven.concentrationDisadvantage, true);
  assert.equal(seven.dreamScar, true);
  assert.equal(seven.shadowOverride, true);
  assert.equal(seven.effects.length, 7);

  // (d) a long rest WITHOUT Dream Walking drops 3 -> 2; one that included it changes nothing
  const ch = pc({ dreamExhaustion: 3, hp: 1, maxHp: 40 });
  assert.equal(R.restPreview(ch, { kind: "long", dreamWalked: false }).next.dreamExhaustion, 2);
  assert.equal(R.restPreview(ch, { kind: "long", dreamWalked: true }).next.dreamExhaustion, undefined);
  // a short rest never touches this track
  assert.equal(R.restPreview(ch, { kind: "short" }).next.dreamExhaustion, undefined);

  // (e) surviving Collapse keeps Dream Exhaustion at 8 and adds four PHYSICAL levels
  const collapsing = pc({ dreamExhaustion: 8, exhaustion: 1 });
  const out = R.cognitiveCollapseSurvived(collapsing);
  assert.equal(out.dreamExhaustion, 8);
  assert.equal(out.exhaustion, 5);
  assert.equal(out.memoriesLost, "1d3");
  assert.equal(out.dmResolutionRequired, true);

  assert.equal(R.dreamExhaustion(0).penalty, 0);
  assert.equal(R.dreamExhaustion(99).level, 8);                 // clamped, never past the ladder
});

// ── Rests ───────────────────────────────────────────────────────────────
test("Safe Haven long rests clear Wounds only on the second consecutive one", () => {
  const first = pc({ wounds: 4, safeHavenRests: 0, hp: 10, maxHp: 50 });
  const p1 = R.restPreview(first, { kind: "long", safeHaven: true });
  assert.equal(p1.next.wounds, undefined);                      // not yet
  assert.equal(p1.next.safeHavenRests, 1);

  const second = pc({ wounds: 4, safeHavenRests: 1, hp: 10, maxHp: 50 });
  const p2 = R.restPreview(second, { kind: "long", safeHaven: true });
  assert.equal(p2.next.wounds, 0);
  assert.equal(p2.next.safeHavenRests, 2);

  // An ordinary long rest breaks the pair.
  assert.equal(R.restPreview(second, { kind: "long", safeHaven: false }).next.safeHavenRests, 0);

  // A long rest restores hit points to the modified maximum.
  assert.equal(R.restPreview(first, { kind: "long" }).next.hp, 50);
});

// ── The seven scores, skills and modifiers ──────────────────────────────
test("Dream is the seventh ability and starts at 10", () => {
  assert.equal(R.ABILITIES.length, 7);
  assert.equal(R.ABILITIES.at(-1), "dream");
  assert.equal(R.STANDARD_ABILITIES.length, 6);
  assert.equal(R.blankCharacter().abilities.dream, R.DREAM_START);
  assert.equal(R.DREAM_START, 10);

  // The table's current value is above the documented cap of 20 and must still read correctly.
  assert.equal(R.abilityMod(24), 7);
});

test("the four Dream skills and Harvesting's selectable ability", () => {
  assert.deepEqual(R.DREAM_SKILLS.sort(), ["alter", "fabricate", "incept", "reveal"]);

  // Harvesting is Wisdom OR Intelligence, chosen per check — and nothing else changes.
  const ch = pc({ level: 5, abilities: { wis: 10, int: 18 }, skills: { harvesting: 1 } });
  assert.equal(R.skillTotal(ch, "harvesting", "wis"), 3);       // +0 wis, +3 prof
  assert.equal(R.skillTotal(ch, "harvesting", "int"), 7);       // +4 int, +3 prof
  // An ineligible ability falls back to the first eligible one rather than silently using it.
  assert.equal(R.skillTotal(ch, "harvesting", "cha"), R.skillTotal(ch, "harvesting", "wis"));

  // A Dream skill rides the Dream score.
  const dreamer = pc({ level: 5, abilities: { dream: 24 }, skills: { incept: 1 } });
  assert.equal(R.skillTotal(dreamer, "incept"), 10);            // +7 dream, +3 prof
});

test("named modifiers add to totals without touching the base score", () => {
  const ch = pc({
    level: 5, ac: 16, speed: 30, maxHp: 80, hp: 80,
    abilities: { str: 14, dex: 12 },
    modifiers: [
      { id: "m1", target: "ac", amount: 2, reason: "Shield of Faith", rounds: 10 },
      { id: "m2", target: "ability:str", amount: 4, reason: "Enlarge", rounds: 3 },
      { id: "m3", target: "speed", amount: -10, reason: "Difficult going", rounds: null },
      { id: "m4", target: "ac", amount: 1, reason: "Ring", rounds: null },
      { id: "m5", target: "ac", amount: 5, reason: "Expired buff", active: false },
    ],
  });
  assert.equal(R.armorClass(ch), 19);                           // 16 + 2 + 1, the inactive one ignored
  assert.equal(R.abilityScore(ch, "str"), 18);                  // base 14 untouched underneath
  assert.equal(ch.abilities.str, 14);
  assert.equal(R.abilityModifier(ch, "str"), 4);
  assert.equal(R.speed(ch), 20);

  // Every total can show where it came from.
  const why = R.contributions(ch.modifiers, "ac");
  assert.equal(why.length, 2);
  assert.deepEqual(why.map(c => c.reason), ["Shield of Faith", "Ring"]);
});

test("a confirmed round expires timed modifiers in place and leaves permanent ones", () => {
  let state = {
    round: 1,
    modifiers: [
      { id: "a", target: "ac", amount: 2, reason: "Shield of Faith", rounds: 2 },
      { id: "b", target: "ac", amount: 1, reason: "Ring", rounds: null },
    ],
  };

  state = { ...state, ...R.advanceRound(state.modifiers, state.round) };
  assert.equal(state.round, 2);
  assert.equal(state.modifiers[0].rounds, 1);
  assert.equal(state.ended.length, 0);

  state = { ...state, ...R.advanceRound(state.modifiers, state.round) };
  assert.equal(state.round, 3);
  assert.equal(state.modifiers[0].active, false);               // inactive, not deleted
  assert.equal(state.modifiers[0].rounds, 0);
  assert.equal(state.modifiers[0].expiredRound, 3);
  assert.deepEqual(state.ended.map(m => m.reason), ["Shield of Faith"]);
  assert.equal(state.modifiers[1].rounds, null);                // the permanent one is untouched
  assert.equal(state.modifiers.length, 2);                      // history is kept
});

// ── Hit points ──────────────────────────────────────────────────────────
test("damage eats temporary HP first and flags Wound triggers without applying them", () => {
  const ch = pc({ hp: 40, maxHp: 40, tempHp: 5, wounds: 0, injuries: [] });

  const light = R.applyDamage(ch, 3);
  assert.equal(light.tempHp, 2);
  assert.equal(light.hp, 40);
  assert.deepEqual(light.woundTriggers, []);

  // 20 of a 40 maximum is half, so the half-max trigger is raised for adjudication.
  const heavy = R.applyDamage(ch, 25);
  assert.equal(heavy.tempHp, 0);
  assert.equal(heavy.hp, 20);
  assert.deepEqual(heavy.woundTriggers, ["halfMaxHp"]);
  assert.equal(heavy.concentrationDC, 12);                      // max(10, 12) + 0 + 0

  const out = R.applyDamage(ch, 100, { critical: true });
  assert.equal(out.hp, 0);
  assert.deepEqual(out.woundTriggers, ["halfMaxHp", "zeroHp", "critical"]);

  // Wounds are flagged, never auto-applied: the sheet asks the table.
  assert.equal(ch.wounds, 0);
});

test("healing is capped at the modified maximum and temporary HP does not stack", () => {
  const ch = pc({ hp: 10, maxHp: 40, tempHp: 6 });
  assert.equal(R.applyHealing(ch, 100).hp, 40);
  assert.equal(R.applyHealing(ch, 5).healed, 5);

  assert.deepEqual(R.applyTempHp(ch, 4), { tempHp: 6, replaced: false });   // the better one stands
  assert.deepEqual(R.applyTempHp(ch, 9), { tempHp: 9, replaced: true });

  // A maxHp modifier raises the ceiling healing may reach.
  const buffed = pc({ hp: 10, maxHp: 40, modifiers: [{ target: "maxHp", amount: 10, reason: "Aid" }] });
  assert.equal(R.maxHp(buffed), 50);
  assert.equal(R.applyHealing(buffed, 100).hp, 50);
});

// ── Arcanum Veritas and Cognition DCs ───────────────────────────────────
test("Verum DC folds Dream in on top of the highest ability modifier", () => {
  const ch = pc({ level: 5, abilities: { cha: 18, dream: 16 } });
  assert.equal(R.verumModifier(ch), 4);
  assert.equal(R.verumDC(ch), 8 + 3 + 4 + 3);                   // 18
  assert.equal(R.sealAttackBonus(ch), 7);
  assert.equal(R.sealUses(ch), 3);                              // seals per long rest = PB
  assert.equal(R.ownDreamDC(ch), 15 + 3 + 3);                   // 21

  // Dream is excluded from the Verum Modifier itself — it is added separately, never twice.
  const dreamOnly = pc({ level: 5, abilities: { dream: 24 } });
  assert.equal(R.verumModifier(dreamOnly), 0);
});

test("Cognitive Sense grants a second shared use at Dream 18", () => {
  assert.equal(R.cognitiveSenseUses(pc({ abilities: { dream: 17 } })), 1);
  assert.equal(R.cognitiveSenseUses(pc({ abilities: { dream: 18 } })), 2);
});

test("Cognition learn DCs are 5 x Tier, +5 for a half, +10 for full", () => {
  assert.equal(R.cognitionLearnDC("I", "quarter"), 5);
  assert.equal(R.cognitionLearnDC("I", "full"), 15);
  assert.equal(R.cognitionLearnDC("II", "half"), 15);
  assert.equal(R.cognitionLearnDC("III", "full"), 25);          // the Epiphany DC
  assert.equal(R.cognitionLearnDC("V", "full"), 35);

  assert.equal(R.cognitionNeedsEpiphany("II"), false);
  assert.equal(R.cognitionNeedsEpiphany("III"), true);

  // The roll is 1d20 + Dream modifier, which at the table's 24 is +7.
  assert.equal(R.cognitionUnderstandingBonus(pc({ abilities: { dream: 24 } })), 7);
});

test("a turn is one of each until something grants more", () => {
  const plain = pc({});
  assert.deepEqual(R.turnAllowance(plain), { action: 1, bonus: 1, reaction: 1 });

  // Haste grants an Action; a Grimm grants a second Reaction. Both stack onto the base.
  const hasted = pc({ grants: [
    { id: "g1", kind: "action", n: 1, rounds: 10, why: "Haste", active: true },
    { id: "g2", kind: "reaction", n: 1, rounds: null, why: "Vidarr", active: true },
  ] });
  assert.deepEqual(R.turnAllowance(hasted), { action: 2, bonus: 1, reaction: 2 });

  // An expired grant is kept as history, so it must not keep paying out.
  const spent = pc({ grants: [{ id: "g1", kind: "action", n: 2, rounds: 0, why: "Haste", active: false }] });
  assert.equal(R.turnAllowance(spent).action, 1);

  // A cost nobody has by default only appears once it is granted.
  assert.equal(R.turnAllowance(plain).quick, undefined);
  assert.equal(R.turnAllowance(pc({ grants: [{ kind: "quick", n: 1, active: true }] })).quick, 1);

  // A grant of an unknown kind is ignored rather than inventing a row.
  assert.deepEqual(R.turnAllowance(pc({ grants: [{ kind: "nonsense", n: 9, active: true }] })),
    { action: 1, bonus: 1, reaction: 1 });
});

test("the old boolean `used` still reads as one spent slot", () => {
  // Sheets saved before grants existed stored `used: { action: true }`.
  assert.equal(R.turnUsed({ used: { action: true } }, "action"), 1);
  assert.equal(R.turnUsed({ used: { action: 2 } }, "action"), 2);
  assert.equal(R.turnUsed({ used: {} }, "action"), 0);
  assert.equal(R.turnUsed({}, "action"), 0);
  assert.equal(R.turnUsed({ used: { action: -3 } }, "action"), 0);
  assert.equal(R.turnSpent({ used: { action: true, bonus: 1 } }), 2);
});

test("a timed grant expires in place on a confirmed round", () => {
  const grants = [
    { id: "g1", kind: "action", n: 1, rounds: 1, why: "Haste", active: true },
    { id: "g2", kind: "bonus", n: 1, rounds: null, why: "Cunning Action", active: true },
  ];
  const { list, ended } = R.tickTimed(grants, 4);
  assert.equal(ended.length, 1);
  assert.equal(ended[0].why, "Haste");
  assert.equal(list[0].active, false);           // kept, not deleted
  assert.equal(list[0].expiredRound, 5);
  assert.equal(list[1].active, true);            // permanent is untouched
  assert.deepEqual(R.turnAllowance({ grants: list }), { action: 1, bonus: 2, reaction: 1 });
});

test("the engine carries a rules version", () => {
  assert.equal(typeof R.RULES_VERSION, "string");
  assert.equal(R.blankCharacter().rulesVersion, R.RULES_VERSION);
});

// ── Class progression ───────────────────────────────────────────────────
// These run against the SRD the app actually ships, not a fixture written to match the code: if the
// compendium is rebuilt and a class's shape changes, these are what notice.

import { readFile } from "node:fs/promises";
import * as fc from "../js/fc5e.mjs";

const SRD = JSON.parse(await readFile(new URL("../data/srd-core.json", import.meta.url), "utf8"));
const DEFS = Object.fromEntries(SRD.classes.map(c => [c.name.toLowerCase(), c]));
const def = name => DEFS[name.toLowerCase()];

test("a feature name carries its group in a prefix", () => {
  assert.deepEqual(R.featureGroup("Fighting Style: Archery"), { group: "Fighting Style", label: "Archery" });
  assert.deepEqual(R.featureGroup("Second Wind"), { group: "", label: "Second Wind" });
  // One subclass under two headings is one subclass.
  assert.equal(R.subclassKey("Oath of Devotion Channel Divinity"), "Oath of Devotion");
  assert.equal(R.subclassKey("Life Domain"), "Life Domain");
});

test("subclasses are read out of the data, never hard-coded", () => {
  // Every archetype in the SRD, and the level it first speaks at. A menu is not one of them.
  assert.deepEqual(R.subclassOptions(def("Cleric")), [{ name: "Life Domain", level: 1 }]);
  assert.deepEqual(R.subclassOptions(def("Wizard")), [{ name: "School of Evocation", level: 2 }]);
  assert.deepEqual(R.subclassOptions(def("Fighter")), [{ name: "Champion", level: 3 }]);
  assert.ok(!R.subclassOptions(def("Fighter")).some(s => s.name === "Fighting Style"));
  assert.deepEqual(R.subclassOptions(def("Warlock")).map(s => s.name),
    ["The Archfey", "The Fiend", "The Great Old One"]);
});

test("choosing the subclass once brings its later features on its own", () => {
  const without = R.classProgress(def("Cleric"), 8);
  // Nothing of any domain's until one is chosen, and the choice is the pending one.
  assert.ok(!without.granted.some(f => f.name.startsWith("Life Domain")));
  assert.equal(without.choices.find(c => c.kind === "subclass")?.level, 1);

  const chosen = R.classProgress(def("Cleric"), 8, { subclass: "Life Domain" });
  const names = chosen.granted.map(f => f.name);
  assert.ok(names.includes("Life Domain: Disciple of Life"));       // level 1, the level it was picked
  assert.ok(names.includes("Life Domain Channel Divinity: Preserve Life")); // level 2, unasked
  assert.ok(names.includes("Life Domain: Blessed Healer"));          // level 6, unasked
  assert.ok(names.includes("Life Domain: Divine Strike"));           // level 8, unasked
  // Level 17's is still out of reach at 8, and the subclass question is settled.
  assert.ok(!names.includes("Life Domain: Supreme Healing"));
  assert.ok(!chosen.choices.some(c => c.kind === "subclass"));
});

test("a menu is a pending choice until it is picked, and then it is a feature", () => {
  const open = R.classProgress(def("Fighter"), 1);
  const style = open.choices.find(c => c.group === "Fighting Style");
  assert.equal(style.pick, 1);
  assert.equal(style.done, false);
  assert.equal(style.options.length, 6);
  assert.ok(!open.granted.some(f => f.name.startsWith("Fighting Style:")));

  const picked = R.classProgress(def("Fighter"), 1, { picks: { "1:Fighting Style": ["Fighting Style: Defense"] } });
  assert.ok(picked.granted.some(f => f.name === "Fighting Style: Defense"));
  assert.equal(picked.choices.find(c => c.group === "Fighting Style").done, true);
  // One style, not six: the five not chosen are simply absent.
  assert.equal(picked.granted.filter(f => f.name.startsWith("Fighting Style:")).length, 1);

  // A pick that is no longer on offer is ignored rather than granted — a changed import must not
  // leave a feature behind that its class no longer has.
  const stale = R.classProgress(def("Fighter"), 1, { picks: { "1:Fighting Style": ["Fighting Style: Nonsense"] } });
  assert.ok(!stale.granted.some(f => f.name.startsWith("Fighting Style:")));
});

// ── The three shapes a "Prefix: Name" feature can be ────────────────────
// Built by hand rather than from a book, because the books that show these are not the SRD and
// cannot be committed here. Each one is the shape a real class file uses, reduced to the bone.
const madeUpClass = levels => ({ name: "Testclass", hd: 8, levels });

test("a category announces the archetypes instead of being one, and names the question", () => {
  // How every non-SRD book writes it: the class announces each archetype, and the archetype then
  // speaks for itself at later levels.
  const def = madeUpClass({
    3: { features: [
      { name: "Martial Archetype: Champion", text: "You are a Champion.", optional: true },
      { name: "Martial Archetype: Samurai", text: "You are a Samurai.", optional: true },
      { name: "Champion: Improved Critical", text: "Crit on 19.", optional: true },
      { name: "Samurai: Fighting Spirit", text: "Advantage once.", optional: true },
    ] },
    7: { features: [{ name: "Champion: Remarkable Athlete", text: "Half proficiency.", optional: true }] },
    10: { features: [{ name: "Samurai: Tireless Spirit", text: "Regain on initiative.", optional: true }] },
  });
  const shape = R.classGroups(def);

  // "Martial Archetype" is the question, not an answer to it.
  assert.deepEqual(shape.archetypes.map(a => a.name), ["Champion", "Samurai"]);
  assert.equal(shape.label, "Martial Archetype");
  assert.equal(shape.kinds.get("Martial Archetype"), "category");
  assert.equal(shape.kinds.get("Champion"), "archetype");

  // The announcement is matched on its LABEL and the archetype's own features on their PREFIX, so a
  // Champion gets both of theirs and none of the Samurai's.
  const champ = R.classProgress(def, 7, { subclass: "Champion" });
  const names = champ.granted.map(f => f.name);
  assert.deepEqual(names, ["Martial Archetype: Champion", "Champion: Improved Critical", "Champion: Remarkable Athlete"]);
  assert.ok(!names.some(n => n.includes("Samurai")));

  // And the choice carries the class's own word for itself.
  const open = R.classProgress(def, 3).choices.find(c => c.kind === "subclass");
  assert.equal(open.label, "Martial Archetype");
  assert.deepEqual(open.options.map(o => o.name), ["Champion", "Samurai"]);
});

test("the archetype is asked for when the class announces it, not when the earliest one speaks", () => {
  // A campaign archetype that grants something at level 1 must not drag the question down to level 1
  // for everyone. The Wizard's own Arcane Tradition is announced at 2; the vault's School of Blade
  // Dancing starts dancing at 1, and reading the minimum asked every Wizard to choose a tradition
  // before the class offers one.
  const def = madeUpClass({
    1: { features: [{ name: "Blade Dancing: First Dance", text: "You begin dancing.", optional: true }] },
    2: { features: [
      { name: "Arcane Tradition: Blade Dancing", text: "Choose this school.", optional: true },
      { name: "Arcane Tradition: Evocation", text: "Choose this school.", optional: true },
      { name: "Evocation: Sculpt Spells", text: "Shape the blast.", optional: true },
    ] },
    6: { features: [{ name: "Blade Dancing: Second Dance", text: "You dance better.", optional: true }] },
  });
  const shape = R.classGroups(def);
  assert.equal(shape.askedAt, 2, "the announcement is the authority");
  assert.equal(shape.label, "Arcane Tradition");

  // Nothing is asked at 1, and the question appears at 2.
  assert.ok(!R.classProgress(def, 1).choices.some(c => c.kind === "subclass"));
  assert.equal(R.classProgress(def, 2).choices.find(c => c.kind === "subclass")?.level, 2);

  // Having chosen at 2, the level-1 feature is still granted — it was always theirs to have.
  const danced = R.classProgress(def, 2, { subclass: "Blade Dancing" }).granted.map(f => f.name);
  assert.ok(danced.includes("Blade Dancing: First Dance"));
  assert.ok(danced.includes("Arcane Tradition: Blade Dancing"));
  assert.ok(!danced.some(n => n.startsWith("Evocation:")));

  // A class that never announces still falls back to the earliest archetype level.
  const quiet = R.classGroups(madeUpClass({
    3: { features: [{ name: "Thief: Fast Hands", text: "Quick fingers.", optional: true }] },
    9: { features: [{ name: "Thief: Supreme Sneak", text: "Quieter still.", optional: true }] },
  }));
  assert.equal(quiet.askedAt, 3);
  assert.equal(quiet.label, "Subclass");
});

test("a group spent at one level is a menu; one that speaks again is an archetype", () => {
  // Pact Boon offers its three pacts at level 3 and is never heard from again. Nothing else in the
  // data separates it from an archetype — both are a prefix over a list of alternatives.
  const def = madeUpClass({
    3: { features: [
      { name: "Pact Boon: Pact of the Blade", text: "A weapon.", optional: true },
      { name: "Pact Boon: Pact of the Tome", text: "A book.", optional: true },
      { name: "The Fiend: Dark One's Blessing", text: "Temp HP.", optional: true },
    ] },
    6: { features: [{ name: "The Fiend: Dark One's Own Luck", text: "Add d10.", optional: true }] },
  });
  const shape = R.classGroups(def);
  assert.equal(shape.kinds.get("Pact Boon"), "menu");
  assert.equal(shape.kinds.get("The Fiend"), "archetype");
  assert.deepEqual(shape.archetypes.map(a => a.name), ["The Fiend"]);

  // So the pact is a choice to resolve, and picking one grants exactly that one.
  const open = R.classProgress(def, 3, { subclass: "The Fiend" });
  const pact = open.choices.find(c => c.group === "Pact Boon");
  assert.equal(pact.options.length, 2);
  assert.equal(pact.pick, null);
  const picked = R.classProgress(def, 3, { subclass: "The Fiend",
    picks: { "3:Pact Boon": ["Pact Boon: Pact of the Blade"] } });
  assert.ok(picked.granted.some(f => f.name === "Pact Boon: Pact of the Blade"));
  assert.ok(!picked.granted.some(f => f.name === "Pact Boon: Pact of the Tome"));
});

test("merging the same class from several books makes one class", () => {
  // The shape every supplement uses: the base book carries the whole class, and the supplement
  // carries only the name and the archetypes it adds. Posted unmerged, the second would be a second
  // Fighter with no hit die — and the catalogue keeps whichever it read last.
  const base = { name: "Fighter", hd: 10, proficiency: "Strength Saving Throws, Athletics",
    numSkills: 2, levels: {
      1: { features: [{ name: "Second Wind", text: "Regain hp." }], slots: [0, 0] },
      3: { features: [{ name: "Champion: Improved Critical", text: "19-20.", optional: true }] },
      4: { scoreImprovement: true },
    } };
  const supplement = { name: "Fighter", levels: {
    3: { features: [{ name: "Samurai: Fighting Spirit", text: "Advantage.", optional: true }] },
    7: { features: [{ name: "Samurai: Elegant Courtier", text: "Wisdom saves.", optional: true }] },
  } };

  const one = fc.mergeClassDefs(base, supplement);
  assert.equal(one.hd, 10, "the scalars come from the book that states them");
  assert.equal(one.numSkills, 2);
  assert.deepEqual(Object.keys(one.levels).map(Number).sort((a, b) => a - b), [1, 3, 4, 7]);
  assert.deepEqual(one.levels[3].features.map(f => f.name),
    ["Champion: Improved Critical", "Samurai: Fighting Spirit"], "a shared level concatenates");
  assert.equal(one.levels[4].scoreImprovement, true);
  assert.deepEqual(one.levels[1].slots, [0, 0], "the base class owns its own progression");

  // Both archetypes are now on offer from the one class.
  assert.deepEqual(R.subclassOptions(one).map(s => s.name), ["Champion", "Samurai"]);

  // Merging the same file twice must not double anything — re-importing a corrected book is normal.
  const twice = fc.mergeClassDefs(one, supplement);
  assert.deepEqual(twice.levels[3].features.map(f => f.name),
    ["Champion: Improved Critical", "Samurai: Fighting Spirit"]);
  assert.equal(fc.mergeClassDefs(null, supplement), supplement);
  assert.equal(fc.mergeClassDefs(base, null), base);
});

test("a campaign archetype can replace a published one of the same name", () => {
  // The vault's own School of Necromancy is not the Player's Handbook's, and it reuses four of its
  // five feature names. Merged without saying so, a Necromancer gets both readings of Grim Harvest.
  const book = { name: "Wizard", hd: 6, levels: {
    2: { features: [
      { name: "Arcane Tradition", text: "Choose a tradition." },
      { name: "School of Necromancy: Grim Harvest", text: "The published one.", optional: true },
      { name: "School of Evocation: Sculpt Spells", text: "Untouched.", optional: true },
    ] },
    6: { features: [{ name: "School of Necromancy: Undead Thralls", text: "The published one.", optional: true }] },
  } };
  const vault = { name: "Wizard", levels: {
    2: { features: [{ name: "School of Necromancy: Grim Harvest", text: "The Ephemer one.", optional: true }] },
    6: { features: [{ name: "School of Necromancy: Undead Thralls", text: "The Ephemer one.", optional: true }] },
  } };

  const merged = fc.mergeClassDefs(book, vault, { replaceGroups: ["School of Necromancy"] });
  const necro = R.classProgress(merged, 6, { subclass: "School of Necromancy" }).granted
    .filter(f => f.name.startsWith("School of Necromancy:"));
  assert.equal(necro.length, 2, "five features, not ten of two different minds");
  assert.ok(necro.every(f => f.text === "The Ephemer one."));

  // Only the named group goes. Another archetype on the same class is untouched, and so is the
  // class's own announcement of the choice.
  const evoker = R.classProgress(merged, 2, { subclass: "School of Evocation" }).granted;
  assert.ok(evoker.some(f => f.name === "School of Evocation: Sculpt Spells"));
  assert.ok(evoker.some(f => f.name === "Arcane Tradition"));
  // Both archetypes are still on offer; replacing is not removing.
  assert.deepEqual(R.subclassOptions(merged).map(s => s.name),
    ["School of Evocation", "School of Necromancy"]);

  // And this is why the flag has to exist. Without it the merge de-duplicates by name and the FIRST
  // definition wins, so the published text stays and the campaign's is dropped on the floor — the
  // count looks right, the rules are wrong, and nothing anywhere says so.
  const naive = fc.mergeClassDefs(book, vault);
  const quiet = R.classProgress(naive, 6, { subclass: "School of Necromancy" }).granted
    .filter(f => f.name.startsWith("School of Necromancy:"));
  assert.equal(quiet.length, 2);
  assert.ok(quiet.every(f => f.text === "The published one."), "the campaign's version is lost silently");
});

test("a bare-named menu takes its name from the feature that announces it", () => {
  const w = R.classProgress(def("Warlock"), 2);
  const inv = w.choices.find(c => c.label === "Eldritch Invocations");
  assert.ok(inv, "the invocation menu is labelled by its own announcement");
  assert.ok(inv.options.length > 20);
  assert.equal(inv.pick, null);                   // the class table says how many; the player counts
});

test("a class resource is a feature with uses, sized by the level reached", () => {
  const monk2 = R.classProgress(def("Monk"), 2).resources.find(r => r.name === "Ki Points");
  const monk9 = R.classProgress(def("Monk"), 9).resources.find(r => r.name === "Ki Points");
  assert.equal(monk2.uses, 2);
  assert.equal(monk9.uses, 9);                    // the latest row at or below the level wins
  assert.equal(monk9.reset, "s");
  assert.equal(monk9.id, "res:Monk:Ki Points");
});

test("spell slots are exact for one caster and reported for two", () => {
  const one = R.featurePlan([{ name: "Wizard", level: 5 }], DEFS);
  assert.deepEqual(one.slots.slice(0, 4), [4, 3, 2, 0]);
  assert.equal(one.cantripsKnown, 4);
  assert.deepEqual(one.multiclassCasters, []);

  const two = R.featurePlan([{ name: "Wizard", level: 5 }, { name: "Cleric", level: 3 }], DEFS);
  assert.equal(two.slots, null);                  // the 2014 multiclass table is not guessed at
  assert.deepEqual(two.multiclassCasters, ["Wizard", "Cleric"]);
});

test("a class the catalogue has never heard of costs nothing", () => {
  const plan = R.featurePlan([{ name: "Oneiromancer", level: 7 }], DEFS);
  assert.deepEqual(plan.unknown, ["Oneiromancer"]);
  assert.deepEqual(plan.granted, []);
  assert.equal(plan.totalLevel, 7);
});

test("hit dice are one pool per die size", () => {
  assert.equal(R.hitDicePool([{ name: "Wizard", level: 11 }], DEFS), "11d6");
  assert.equal(R.hitDicePool([{ name: "Fighter", level: 2 }, { name: "Rogue", level: 9 }], DEFS), "2d10 + 9d8");
  assert.equal(R.hitDicePool([{ name: "Nothing", level: 3 }], DEFS), "");
});

test("reconciling keeps what the player owns and drops what the character lost", () => {
  const granted = R.featurePlan([{ name: "Monk", level: 3, subclass: "Way of the Open Hand" }], DEFS).granted;
  const existing = [
    { id: "x1", name: "A promise to Milo", source: "" },                 // typed by hand
    { id: "res:Monk:Ki Points", name: "Ki Points", uses: 2, used: 2 },   // derived, two spent
    { id: "cls:Monk:3:Way of the Shadow: Shadow Arts", name: "Shadow Arts", source: "class" },
  ];
  const { features, added, removed } = R.reconcileFeatures(existing, granted);

  assert.ok(features.some(f => f.id === "x1"), "a hand-written feature is never touched");
  const ki = features.find(f => f.id === "res:Monk:Ki Points");
  assert.equal(ki.uses, 3);          // the pool size comes from the data, which has moved on
  assert.equal(ki.used, 2);          // what the player spent is theirs and survives
  assert.ok(!features.some(f => f.name === "Shadow Arts"), "an archetype the character does not have goes");
  assert.equal(removed.length, 1);
  assert.ok(added.some(f => f.name === "Way of the Open Hand: Open Hand Technique"));

  // Spent uses can never exceed a pool that shrank — a rolled-back level must not leave 9 of 2.
  const shrunk = R.reconcileFeatures([{ id: "res:Monk:Ki Points", uses: 9, used: 9 }],
    R.featurePlan([{ name: "Monk", level: 2 }], DEFS).granted);
  assert.equal(shrunk.features.find(f => f.id === "res:Monk:Ki Points").used, 2);
});

test("the level-up plan says what the level will bring before anything is written", () => {
  const ch = { ...R.blankCharacter(), level: 3,
    classes: [{ name: "Fighter", level: 3, subclass: "Champion", picks: { "1:Fighting Style": ["Fighting Style: Defense"] } }],
    features: [] };
  const p = R.levelUpPlan(ch, DEFS);

  assert.equal(p.from, 3);
  assert.equal(p.to, 4);
  assert.equal(p.className, "Fighter");        // one class takes it without being asked
  assert.equal(p.needsClass, false);
  assert.equal(p.asi, true);                   // Fighter 4 is an ability score improvement
  assert.deepEqual(p.proficiency, { from: 2, to: 2 });
  assert.deepEqual(p.allocations, { honor: 1, morality: 1, levels: 1 });
  assert.equal(p.hitDice, "4d10");
  assert.equal(p.assigned, 4);
  // The subclass and the style already chosen are not asked about again.
  assert.ok(!p.choices.some(c => c.kind === "subclass"));
  assert.ok(!p.choices.some(c => c.group === "Fighting Style"));

  // Level 5 is not an ASI, and it is where the proficiency bonus moves.
  const at4 = { ...ch, level: 4, classes: [{ ...ch.classes[0], level: 4 }] };
  const q = R.levelUpPlan(at4, DEFS);
  assert.equal(q.asi, false);
  assert.deepEqual(q.proficiency, { from: 2, to: 3 });
  assert.ok(q.newFeatures.some(f => f.name === "Extra Attack"));
});

test("a level that starts a second class is a new class at level 1", () => {
  const ch = { ...R.blankCharacter(), level: 5, classes: [{ name: "Rogue", level: 5 }], features: [] };
  const p = R.levelUpPlan(ch, DEFS, { className: "Wizard" });
  assert.equal(p.newClass, true);
  assert.deepEqual(p.classes, [{ name: "Rogue", level: 5 }, { name: "Wizard", level: 1 }]);
  assert.equal(p.assigned, 6);
  assert.equal(p.hitDice, "5d8 + 1d6");
  assert.ok(p.newFeatures.some(f => f.name === "Arcane Recovery"));

  // With two classes and no class named, the plan refuses to choose for the player.
  const two = { ...ch, classes: p.classes };
  assert.equal(R.levelUpPlan(two, DEFS).needsClass, true);
});

test("a rest brings back only the resources whose rule is written down", () => {
  const ch = { ...R.blankCharacter(), level: 5, hp: 10, maxHp: 40, features: [
    { id: "res:Monk:Ki Points", name: "Ki Points", uses: 5, used: 5, reset: "s" },
    { id: "res:Fighter:Indomitable", name: "Indomitable", uses: 1, used: 1, reset: "l" },
    { id: "x1", name: "A favour owed", uses: 1, used: 1 },
  ] };
  const short = R.restPreview(ch, { kind: "short" });
  assert.equal(short.next.features.find(f => f.id === "res:Monk:Ki Points").used, 0);
  assert.equal(short.next.features.find(f => f.id === "res:Fighter:Indomitable").used, 1);
  assert.equal(short.next.features.find(f => f.id === "x1").used, 1, "a rule nobody wrote is not invented");

  const long = R.restPreview(ch, { kind: "long" });
  assert.equal(long.next.features.find(f => f.id === "res:Fighter:Indomitable").used, 0);
  assert.equal(long.next.hp, 40);
});
