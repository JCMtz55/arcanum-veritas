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

test("regaining a hit point from zero clears the death saves, and only from zero", () => {
  const down = pc({ hp: 0, maxHp: 40, deathSaveSuccesses: 1, deathSaveFailures: 2 });

  assert.equal(R.applyHealing(down, 1).revived, true);
  assert.equal(R.applyHealing(down, 0).revived, false);          // nothing regained, nothing cleared
  assert.equal(R.applyHealing(pc({ hp: 8, maxHp: 40 }), 5).revived, false);

  // A hit die on a short rest is a way back up like any other.
  const withDice = pc({ hp: 0, maxHp: 40, hitDice: "3d8", abilities: { con: 10 } });
  assert.equal(R.spendHitDie(withDice, 8, 5).revived, true);

  // A long rest carries it in its own preview rather than doing it quietly.
  const rested = R.restPreview(down, { kind: "long" });
  assert.equal(rested.next.deathSaveSuccesses, 0);
  assert.equal(rested.next.deathSaveFailures, 0);
  assert.ok(rested.changes.some(c => c.label === "Death saves"));

  // Someone who went down with a clean slate gets no line about it.
  const clean = R.restPreview(pc({ hp: 0, maxHp: 40 }), { kind: "long" });
  assert.equal(clean.changes.some(c => c.label === "Death saves"), false);

  // And the predicate itself, which is what every path asks.
  assert.equal(R.clearsDeathSaves(0, 1), true);
  assert.equal(R.clearsDeathSaves(0, 0), false);
  assert.equal(R.clearsDeathSaves(3, 9), false);
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

// ── Cognitions ──────────────────────────────────────────────────────────
// The learn DCs had been in this engine since the first pass with nothing in front of them. The
// sheet prints the whole table because the Tier of a Cognition the player has NOT been granted is
// deliberately withheld by the server — so the row they need is the one they read off.

test("the learn DC ladder is 5 x Tier, +5 for a half, +10 for full", () => {
  assert.equal(R.cognitionLearnDC("I", "quarter"), 5);
  assert.equal(R.cognitionLearnDC("I", "full"), 15);
  assert.equal(R.cognitionLearnDC("II", "half"), 15);
  assert.equal(R.cognitionLearnDC(3, "full"), 25);
  assert.equal(R.cognitionLearnDC("V", "quarter"), 25);
  assert.equal(R.cognitionLearnDC("nonsense", "full"), null);
  assert.equal(R.cognitionLearnDC("I", "nonsense"), null);

  const ladder = R.cognitionLadder();
  assert.deepEqual(ladder.map(t => t.tier), ["I", "II", "III", "IV", "V"]);
  assert.deepEqual(ladder[0].steps.map(s => s.dc), [5, 10, 10, 15]);
  assert.deepEqual(ladder[4].steps.map(s => s.dc), [25, 30, 30, 35]);
  // Tier III and above cannot be finished by rolling at all — the last step is the DM's to declare.
  assert.deepEqual(ladder.map(t => t.needsEpiphany), [false, false, true, true, true]);

  // The roll itself is Dream alone: proficiency does not enter into understanding one.
  const ch = { ...R.blankCharacter(), level: 11,
    abilities: { ...R.blankCharacter().abilities, dream: 18 }, skills: { incept: 2 } };
  assert.equal(R.cognitionUnderstandingBonus(ch), 4);

  // And the four marks say the same thing here as they do in the builder's own tracker.
  assert.equal(R.COGNITION_DEPTH_NOTE.length, 5);
  assert.match(R.COGNITION_DEPTH_NOTE[4], /Full/);
});

// ── Items ───────────────────────────────────────────────────────────────
// CS-051 asks that equipping an item apply its effect, and CS-052 and CS-065 for charges with a
// recharge trigger. The point of the design is that an item contributes ordinary modifiers, so none
// of the totals below needed new arithmetic to notice it.

const worn = (slot, item) => ({ ...R.blankCharacter(), ac: 10, speed: 30,
  equipment: { [slot]: { name: "x", ...item } } });

test("an equipped item's effects reach every total, and a carried one's do not", () => {
  const ring = { name: "Ring of Protection", magical: true, requiresAttunement: true, attuned: true,
    effects: [{ target: "ac", amount: 1 }, { target: "save:dex", amount: 1 }] };

  const on = worn("ring1", ring);
  assert.equal(R.armorClass(on), 11);
  assert.equal(R.saveTotal(on, "dex"), 1);
  assert.equal(R.itemEffects(on).length, 2);
  assert.equal(R.itemEffects(on)[0].reason, "Ring of Protection");
  assert.ok(R.isItemModifier(R.itemEffects(on)[0]));

  // Not attuned: it needs it, so it does nothing.
  const loose = worn("ring1", { ...ring, attuned: false });
  assert.equal(R.armorClass(loose), 10);
  assert.equal(R.itemIsActive(loose, loose.equipment.ring1, "slot:ring1"), false);

  // In the pack rather than on the hand: carrying a ring has never done anything.
  const packed = { ...R.blankCharacter(), ac: 10, carried: [ring] };
  assert.equal(R.armorClass(packed), 10);
  assert.equal(R.itemEffects(packed).length, 0);

  // A Dreamlike item is inactive while awake and in force in Insomnia, without the attunement
  // breaking either way (DM-14, RES-09).
  const dreamy = worn("neck", { name: "Lucid Pendant", insomniaOnly: true,
    effects: [{ target: "ability:dream", amount: 2 }] });
  assert.equal(R.abilityScore(dreamy, "dream"), R.DREAM_START);
  assert.equal(R.abilityScore({ ...dreamy, inInsomnia: true }, "dream"), R.DREAM_START + 2);

  // And it stacks with a hand-written modifier rather than replacing it — one list, one path.
  const blessed = { ...on, modifiers: [{ id: "m1", target: "ac", amount: 2, reason: "Shield of Faith", active: true }] };
  assert.equal(R.armorClass(blessed), 13);
  assert.deepEqual(R.contributions(R.activeModifiers(blessed), "ac").map(c => c.reason),
    ["Shield of Faith", "Ring of Protection"]);
});

test("a contribution says whether it lasts, and where it came from", () => {
  const ch = { ...R.blankCharacter(), ac: 10,
    equipment: { shoulders: { name: "Cloak of Protection", effects: [{ target: "ac", amount: 1 }] } },
    modifiers: [
      { id: "m1", target: "ac", amount: 2, reason: "Shield of Faith", rounds: 10, active: true },
      { id: "m2", target: "ac", amount: 1, reason: "A ruling of the DM's", rounds: null, active: true },
      { id: "m3", target: "ac", amount: 9, reason: "expired", rounds: 0, active: false },
    ] };

  const on = R.contributions(R.activeModifiers(ch), "ac");
  assert.deepEqual(on.map(c => [c.reason, c.permanent, c.source]), [
    ["Shield of Faith", false, ""],
    ["A ruling of the DM's", true, ""],
    ["Cloak of Protection", true, "item"],
  ]);
  assert.equal(R.armorClass(ch), 14, "an inactive one contributes nothing");

  // Which is the whole split the sheet draws: the round tracker holds what runs out, and everything
  // else is simply true of the character.
  assert.equal(on.filter(c => !c.permanent).length, 1);
  assert.equal(on.filter(c => c.permanent).length, 2);
  assert.equal(on.filter(c => c.source === "item").length, 1);
});

test("an item's effects reach the derived numbers that are not plain addition", () => {
  // Strength through an item moves carrying capacity, because capacity reads the score.
  const belt = worn("waist", { name: "Belt of Hill Giant Strength", requiresAttunement: true,
    attuned: true, effects: [{ target: "ability:str", amount: 11 }] });
  assert.equal(R.abilityScore(belt, "str"), 21);
  assert.equal(R.carryingCapacity(belt).capacity, 315);

  // And a save-DC item moves the Verum DC and a class DC alike.
  const rod = worn("mainHand", { name: "Rod of the Pact Keeper",
    effects: [{ target: "saveDc", amount: 1 }] });
  assert.equal(R.verumDC(rod), R.verumDC({ ...rod, equipment: {} }) + 1);
  assert.equal(R.spellSaveDC(rod, "cha"), R.spellSaveDC({ ...rod, equipment: {} }, "cha") + 1);
});

test("charges are spent, and come back on the trigger the item carries", () => {
  const wand = { name: "Wand of Magic Missiles",
    charges: { max: 7, used: 7, recharge: "dawn", regain: "1d6+1" } };
  const staff = { name: "Staff of Healing", charges: { max: 10, used: 4, recharge: "long", regain: "all" } };
  const pearl = { name: "Pearl of Power", charges: { max: 1, used: 1, recharge: "manual", regain: "all" } };

  const c = R.itemCharges(staff);
  assert.deepEqual([c.max, c.used, c.left, c.recharge, c.regain], [10, 4, 6, "long", "all"]);
  assert.equal(R.itemCharges({ name: "Rope" }), null, "no charges is not zero charges");

  assert.equal(R.spendCharges(staff, 1).used, 5);
  assert.equal(R.spendCharges(wand, 1), null, "nothing left to spend");
  assert.equal(R.restoreCharges(staff, 2).used, 2);
  assert.equal(R.restoreCharges(staff).used, 0, "no number means all of them");

  const ch = { ...R.blankCharacter(), hp: 9, maxHp: 9,
    equipment: { mainHand: wand }, carried: [staff, pearl] };

  // A short rest fires neither of these; a long rest fires the staff but not the wand.
  assert.deepEqual(R.rechargePlan(ch, { kind: "short" }), []);
  assert.deepEqual(R.rechargePlan(ch, { kind: "long" }).map(p => p.name), ["Staff of Healing"]);
  // Only once the rest is said to have carried through dawn does the wand come back.
  assert.deepEqual(R.rechargePlan(ch, { kind: "long", dawn: true }).map(p => p.name),
    ["Wand of Magic Missiles", "Staff of Healing"]);
  // The Pearl recharges on nothing — it waits to be told, and no rest ever claims it.
  assert.ok(!R.rechargePlan(ch, { kind: "long", dawn: true, dusk: true })
    .some(p => p.name === "Pearl of Power"));

  // A long rest resolves the "all" one itself and REPORTS the dice one rather than guessing it.
  const long = R.restPreview(ch, { kind: "long", dawn: true });
  assert.equal(R.itemCharges(long.next.carried[0]).used, 0, "the staff is full again");
  assert.equal(R.itemCharges(long.next.equipment.mainHand).used, 7, "the wand waits for its roll");
  assert.deepEqual(long.roll.map(r => [r.name, r.regain]), [["Wand of Magic Missiles", "1d6+1"]]);
  assert.ok(long.changes.some(c2 => /item charges/i.test(c2.label)));

  // Which the caller then applies with whatever it rolled.
  const after = R.applyRecharge(ch, [{ where: "slot:mainHand", by: 4 }]);
  assert.equal(R.itemCharges(after.equipment.mainHand).left, 4);
  assert.equal(R.itemCharges(after.carried[0]).used, 4, "nothing else moved");

  // Nothing spent, nothing said.
  const full = { ...ch, equipment: {}, carried: [{ ...staff, charges: { ...staff.charges, used: 0 } }] };
  assert.ok(!R.restPreview(full, { kind: "long", dawn: true }).changes
    .some(c2 => /item charges/i.test(c2.label)));
});

test("coin, weight and the optional encumbrance bands", () => {
  const coins = { pp: 2, gp: 30, ep: 0, sp: 40, cp: 50 };
  assert.equal(R.coinTotalGp(coins), 54.5);       // 20 + 30 + 4 + 0.5
  assert.equal(R.coinCount(coins), 122);
  assert.equal(R.coinWeight(coins), 2.44);

  const ch = { ...R.blankCharacter(), abilities: { ...R.blankCharacter().abilities, str: 10 },
    coins, equipment: { chest: { name: "Plate", weight: 65 } },
    carried: [{ name: "Rations", qty: 5, weight: 2 }, { name: "Letter", qty: 1 }] };

  assert.equal(R.itemWeightTotal({ weight: 2, qty: 5 }), 10);
  assert.deepEqual(R.carriedWeight(ch), { items: 75, coins: 2.44, total: 77.44 });
  assert.deepEqual(R.carryingCapacity(ch), { capacity: 150, encumbered: 50, heavilyEncumbered: 100 });
  assert.equal(R.encumbrance(ch).band, "light");
  assert.equal(R.encumbrance({ ...ch, carried: [], equipment: {}, coins: {} }).band, "none");
  // The plate alone is already past Strength 10's threshold, which is the point of the variant.
  assert.equal(R.encumbrance({ ...ch, carried: [] }).band, "light");
  assert.equal(R.encumbrance({ ...ch, equipment: { chest: { name: "Anvil", weight: 300 } } }).band, "over");

  // Capacity follows the score, items included — the belt test above is the other half of this.
  const strong = { ...ch, abilities: { ...ch.abilities, str: 20 } };
  assert.equal(R.carryingCapacity(strong).capacity, 300);
  assert.equal(R.encumbrance(strong).band, "none");
});

test("one item in one place: every address resolves to the same record", () => {
  const ch = { ...R.blankCharacter(),
    equipment: { mainHand: { name: "Dagger" }, head: { name: "" } },
    carried: [{ name: "Rope" }, { name: "" }, { name: "Torch" }] };

  assert.deepEqual(R.allItems(ch).map(r => [r.where, r.item.name]),
    [["slot:mainHand", "Dagger"], ["pack:0", "Rope"], ["pack:2", "Torch"]]);
  assert.equal(R.findItem(ch, "slot:mainHand").item.name, "Dagger");
  assert.equal(R.findItem(ch, "pack:2").item.name, "Torch");
  assert.equal(R.findItem(ch, "pack:1"), null, "an unnamed row is not an item");
  assert.equal(R.findItem(ch, "slot:feet"), null);
});

// ── Hit dice ────────────────────────────────────────────────────────────
// CS-031 asks for expenditure with the Constitution bonus applied. The pool was derived and shown
// and there was no way to spend one: a short rest said "choose how many below" and there was
// nothing below.

test("the pool is read back out of the string the sheet shows", () => {
  assert.deepEqual(R.parseHitDice("2d10 + 9d8"), [{ die: 10, n: 2 }, { die: 8, n: 9 }]);
  assert.deepEqual(R.parseHitDice("11d6"), [{ die: 6, n: 11 }]);
  // Biggest die first however it was typed, and two entries of a size are one pool.
  assert.deepEqual(R.parseHitDice("3d6 + 2d12 + 1d6"), [{ die: 12, n: 2 }, { die: 6, n: 4 }]);
  assert.deepEqual(R.parseHitDice("5 D 8"), [{ die: 8, n: 5 }]);
  assert.deepEqual(R.parseHitDice("nonsense"), []);
  assert.deepEqual(R.parseHitDice(""), []);
  assert.equal(R.formatHitDice([{ die: 10, n: 2 }, { die: 8, n: 0 }]), "2d10");

  // Which means a derived pool and a hand-typed one are the same thing to everything downstream.
  assert.equal(R.hitDicePool([{ name: "Fighter", level: 2 }, { name: "Rogue", level: 9 }], DEFS),
    "2d10 + 9d8");
});

test("spending a hit die rolls it and adds Constitution", () => {
  // Constitution 16 (+3), 20 of 44 hit points, a 2/9 split pool with one d8 already gone.
  const ch = { ...R.blankCharacter(), level: 11, hp: 20, maxHp: 44,
    abilities: { ...R.blankCharacter().abilities, con: 16 },
    hitDice: "2d10 + 9d8", hitDiceUsed: { 8: 1 } };

  const st = R.hitDiceState(ch);
  assert.deepEqual(st.rows, [{ die: 10, n: 2, used: 0, left: 2 }, { die: 8, n: 9, used: 1, left: 8 }]);
  assert.deepEqual([st.total, st.used, st.left], [11, 1, 10]);

  const out = R.spendHitDie(ch, 10, 6);
  assert.equal(out.con, 3);
  assert.equal(out.regained, 9);                 // 6 + 3
  assert.equal(out.healed, 9);
  assert.equal(out.hp, 29);
  assert.deepEqual(out.hitDiceUsed, { 8: 1, 10: 1 });

  // Healing never exceeds the maximum, and the two numbers are reported apart so the dialog can
  // say "9 rolled, and you were near your maximum".
  const nearly = R.spendHitDie({ ...ch, hp: 42 }, 10, 6);
  assert.equal(nearly.regained, 9);
  assert.equal(nearly.healed, 2);
  assert.equal(nearly.hp, 44);

  // A Constitution penalty cannot make a hit die cost you hit points.
  const frail = { ...ch, abilities: { ...ch.abilities, con: 4 } };          // -3
  assert.equal(R.spendHitDie(frail, 8, 1).regained, 0);
  assert.equal(R.spendHitDie(frail, 8, 1).healed, 0);

  // A size that is spent out, and a size the character does not have.
  assert.equal(R.spendHitDie({ ...ch, hitDiceUsed: { 10: 2, 8: 9 } }, 10, 5), null);
  assert.equal(R.spendHitDie(ch, 12, 5), null);

  // And handing one back, the same gesture as a spent spell slot.
  assert.deepEqual(R.returnHitDie(ch, 8), { 8: 0 });
  assert.equal(R.returnHitDie(ch, 10), null, "nothing to hand back");
});

test("a long rest hands back half the pool, rounded down, minimum one", () => {
  assert.equal(R.hitDiceRegained(11), 5);
  assert.equal(R.hitDiceRegained(1), 1, "minimum one, never none");
  assert.equal(R.hitDiceRegained(2), 1);
  assert.equal(R.hitDiceRegained(0), 1);

  const ch = { ...R.blankCharacter(), level: 11, hp: 44, maxHp: 44,
    hitDice: "2d10 + 9d8", hitDiceUsed: { 10: 2, 8: 9 } };

  // Biggest die first: the d10s are worth more and are what anyone would choose back.
  const r = R.restoreHitDice(ch, 5);
  assert.deepEqual(r.hitDiceUsed, { 10: 0, 8: 6 });
  assert.deepEqual(r.back, [{ die: 10, n: 2 }, { die: 8, n: 3 }]);
  assert.equal(r.restored, 5);

  // Asking for more than are spent gives back what there is, and says so.
  const all = R.restoreHitDice({ ...ch, hitDiceUsed: { 8: 2 } }, 5);
  assert.equal(all.restored, 2);

  const long = R.restPreview(ch, { kind: "long" });
  assert.deepEqual(long.next.hitDiceUsed, { 10: 0, 8: 6 });
  const line = long.changes.find(c => /hit dice come back/i.test(c.label));
  assert.equal(line.detail, "2d10 + 3d8");
  assert.deepEqual([line.from, line.to], [0, 5]);

  // Nothing spent, nothing said — and a short rest never hands any back on its own.
  const fresh = { ...ch, hitDiceUsed: {} };
  assert.ok(!R.restPreview(fresh, { kind: "long" }).changes.some(c => /hit dice come back/i.test(c.label)));
  const short = R.restPreview(ch, { kind: "short" });
  assert.equal(short.next.hitDiceUsed, undefined);
  assert.match(short.changes.find(c => /hit dice/i.test(c.label)).detail, /0 of 11 left/);
});

// ── Spellcasting ────────────────────────────────────────────────────────
// CS-062 asks a rest to refresh slots, and it did not: five of the eight PCs cast, and every one of
// them long-rested still holding spent slots. These are the tests that would have caught it.

const caster = (over = {}) => ({ ...R.blankCharacter(), ...over,
  abilities: { ...R.blankCharacter().abilities, ...(over.abilities || {}) },
  spells: { ...R.blankCharacter().spells, ...(over.spells || {}) } });

test("a long rest brings every spent spell slot back", () => {
  const ch = caster({ level: 5, hp: 10, maxHp: 40, spells: { slots: {
    1: { max: 4, used: 4 }, 2: { max: 3, used: 1 }, 3: { max: 2, used: 0 },
  } } });

  const long = R.restPreview(ch, { kind: "long" });
  assert.equal(long.next.spells.slots[1].used, 0);
  assert.equal(long.next.spells.slots[2].used, 0);
  assert.equal(long.next.spells.slots[1].max, 4, "the pool itself is not touched");
  assert.ok(long.changes.some(c => /spell slots/i.test(c.label)));

  // A short rest leaves them alone for everyone but a pact caster.
  const short = R.restPreview(ch, { kind: "short" });
  assert.equal(short.next.spells, undefined);
  assert.ok(!short.changes.some(c => /spell slots/i.test(c.label)));

  // Nothing spent, nothing to say.
  const fresh = caster({ level: 5, spells: { slots: { 1: { max: 4, used: 0 } } } });
  assert.ok(!R.restPreview(fresh, { kind: "long" }).changes.some(c => /spell slots/i.test(c.label)));
});

test("Pact Magic slots come back on a short rest, and that is read out of the data", () => {
  assert.equal(R.slotResetFor(def("Warlock")), "s");
  assert.equal(R.slotResetFor(def("Wizard")), "l");
  assert.equal(R.slotResetFor(def("Paladin")), "l");
  assert.equal(R.classProgress(def("Warlock"), 5).slotsReset, "s");
  assert.equal(R.featurePlan([{ name: "Warlock", level: 5 }], DEFS).slotsReset, "s");

  const pact = caster({ level: 5, hp: 40, maxHp: 40,
    spells: { slotsReset: "s", slots: { 3: { max: 2, used: 2 } } } });
  assert.equal(R.restPreview(pact, { kind: "short" }).next.spells.slots[3].used, 0);
  // A long rest includes everything a short one gives, so they come back there too.
  assert.equal(R.restPreview(pact, { kind: "long" }).next.spells.slots[3].used, 0);
});

test("a spell save DC and attack bonus are per class, and are not the Verum DC", () => {
  // Level 5, Intelligence 18 (+4), Wisdom 14 (+2), proficiency +3.
  const ch = caster({ level: 5, abilities: { int: 18, wis: 14, dream: 16 } });
  assert.equal(R.proficiencyBonus(5), 3);
  assert.equal(R.spellSaveDC(ch, "int"), 15);        // 8 + 3 + 4
  assert.equal(R.spellAttackBonus(ch, "int"), 7);    // 3 + 4
  assert.equal(R.spellSaveDC(ch, "wis"), 13);

  // The campaign's own DC folds in Dream and the best of the six, so it is a different number and
  // must never be used for a published spell.
  assert.equal(R.verumDC(ch), 18);                   // 8 + 3 + 4 + 3
  assert.notEqual(R.verumDC(ch), R.spellSaveDC(ch, "int"));

  const plan = R.featurePlan([{ name: "Wizard", level: 3 }, { name: "Cleric", level: 2 }], DEFS);
  const rows = R.spellcasting(ch, plan);
  assert.deepEqual(rows.map(r => [r.className, r.ability, r.dc, r.attack]),
    [["Wizard", "int", 15, 7], ["Cleric", "wis", 13, 5]]);

  // A saveDc modifier reaches a class DC the same way it reaches the Verum DC.
  const blessed = caster({ level: 5, abilities: { int: 18 },
    modifiers: [{ target: "saveDc", amount: 1, reason: "a ring", active: true }] });
  assert.equal(R.spellSaveDC(blessed, "int"), 16);

  assert.equal(R.castingAbilityId("Intelligence"), "int");
  assert.equal(R.castingAbilityId("charisma"), "cha");
  assert.equal(R.castingAbilityId(""), "");
});

test("the four standings are tracked separately, and only one of them cannot be cast", () => {
  const book = [
    { id: "a", name: "Fire Bolt", level: 0, standing: "known" },
    { id: "b", name: "Shield", level: 1, standing: "prepared", duration: "1 round" },
    { id: "c", name: "Bless", level: 1, standing: "always", duration: "Concentration, up to 1 minute" },
    { id: "d", name: "Hellish Rebuke", level: 1, standing: "granted" },
    { id: "e", name: "Fireball", level: 3, standing: "known", ritual: "YES" },
  ];
  const ch = caster({ spells: { book } });
  const b = R.spellbook(ch);

  assert.deepEqual(b.levels.map(g => [g.level, g.spells.length]), [[0, 1], [1, 3], [3, 1]]);
  assert.deepEqual(b.levels[1].spells.map(s => s.name), ["Bless", "Hellish Rebuke", "Shield"]);
  assert.equal(b.counts.total, 5);
  assert.equal(b.counts.ready, 1, "cantrips and always-prepared are not today's decisions");
  assert.equal(b.counts.known, 2);
  assert.equal(b.counts.always, 1);
  assert.equal(b.counts.granted, 1);
  assert.equal(b.counts.concentration, 1);
  assert.equal(b.counts.rituals, 1);

  // A cantrip is always castable; a levelled spell still only known is not.
  assert.equal(R.spellCastable(book[0]), true);
  assert.equal(R.spellCastable(book[1]), true);
  assert.equal(R.spellCastable(book[2]), true);
  assert.equal(R.spellCastable(book[3]), true);
  assert.equal(R.spellCastable(book[4]), false);

  assert.equal(R.spellIsConcentration(book[2]), true);
  assert.equal(R.spellIsConcentration(book[1]), false);
  assert.equal(R.spellIsRitual(book[4]), true);
  assert.equal(R.spellIsRitual({ ritual: "no" }), false);
  assert.equal(R.spellIsRitual({}), false);

  assert.equal(R.inSpellbook(ch, "fireball"), true);
  assert.equal(R.inSpellbook(ch, "Counterspell"), false);
  // An unknown standing reads as known rather than as nothing.
  assert.equal(R.spellStanding({ standing: "nonsense" }), "known");
});

test("casting spends the slot you choose, which is all upcasting is", () => {
  const ch = caster({ spells: { slots: {
    1: { max: 4, used: 4 }, 2: { max: 3, used: 1 }, 3: { max: 2, used: 0 }, 5: { max: 1, used: 1 },
  } } });

  // A 1st-level spell can be paid for from 1, 2, 3 or 5 — and the engine says how many are left in
  // each, so the dialog can grey out the ones that cannot pay.
  assert.deepEqual(R.castingOptions(ch, 1).map(o => [o.level, o.left]),
    [[1, 0], [2, 2], [3, 2], [5, 0]]);
  assert.deepEqual(R.castingOptions(ch, 3).map(o => o.level), [3, 5]);
  assert.deepEqual(R.castingOptions(ch, 0), [], "a cantrip costs nothing");
  assert.deepEqual(R.castingOptions(ch, 9), []);

  const spent = R.spendSlot(ch, 2);
  assert.equal(spent.slots[2].used, 2);
  assert.equal(spent.slots[1].used, 4, "nothing else moves");
  assert.equal(R.spendSlot(ch, 1), null, "a slot that is gone cannot be spent");
  assert.equal(R.spendSlot(ch, 4), null, "a level with no slots cannot be spent");

  // The record a catalogue entry becomes: the fields the sheet reads, and not the prose.
  const rec = R.spellRecord({ name: "Fireball", level: 3, school: "Evocation",
    duration: "Instantaneous", text: "A long paragraph." }, "prepared");
  assert.equal(rec.id, "sp:fireball");
  assert.equal(rec.standing, "prepared");
  assert.equal(rec.text, undefined, "the rules text is read back from the catalogue, not copied");

  assert.deepEqual(R.diceInText("each creature takes 8d6 fire damage, or 8d6 again, plus 1d4"),
    ["8d6", "1d4"]);
  assert.deepEqual(R.diceInText(""), []);
});

// ── A bonus to every saving throw at once ───────────────────────────────
// Bless, a Paladin's aura, a Cloak of Protection: almost every save bonus in play is "+X to saving
// throws", not "+X to your Dexterity save", and an item can only say it this way (Juan, 2026-10-29).
test("a save bonus can be written once and reach all seven", () => {
  const base = pc({ level: 9, abilities: { dex: 16, wis: 14 }, saves: { dex: true } });
  assert.equal(R.saveTotal(base, "dex"), 7, "+3 Dexterity, +4 proficiency");
  assert.equal(R.saveTotal(base, "wis"), 2, "no proficiency there");

  const blessed = { ...base, modifiers: [
    { id: "m1", target: R.SAVE_ALL, amount: 2, reason: "Aura of Protection", rounds: null, active: true },
    { id: "m2", target: "save:dex", amount: 1, reason: "a ring", rounds: 10, active: true },
  ] };
  assert.equal(R.saveTotal(blessed, "dex"), 10, "both the blanket and the one");
  assert.equal(R.saveTotal(blessed, "wis"), 4, "the blanket alone");
  assert.equal(R.saveTotal(blessed, "dream"), 2, "and Dream is a save like the others");

  // The one save first, then the blanket — the order the number, its tooltip and the roll's
  // breakdown all read, because they ask the same function.
  assert.deepEqual(R.saveContributions(blessed, "dex").map(c => [c.reason, c.amount]),
    [["a ring", 1], ["Aura of Protection", 2]]);
  assert.deepEqual(R.saveContributions(blessed, "wis").map(c => c.reason), ["Aura of Protection"]);

  // It expires like anything else with rounds on it, and nothing else does.
  const { list } = R.tickTimed(blessed.modifiers, 1);
  assert.equal(list.find(m => m.id === "m1").rounds, null);
  assert.equal(list.find(m => m.id === "m2").rounds, 9);

  // An ITEM can say it too, which is the half that was impossible before: equipping a cloak moves
  // every save, and the breakdown carries the cloak's own name.
  const cloaked = pc({ level: 9, abilities: { dex: 16 }, saves: { dex: true },
    equipment: { back: { name: "Cloak of Protection", equipped: true,
      effects: [{ target: R.SAVE_ALL, amount: 1 }] } } });
  assert.equal(R.saveTotal(cloaked, "dex"), 8);
  assert.equal(R.saveTotal(cloaked, "cha"), 1);
  assert.equal(R.saveContributions(cloaked, "cha")[0].reason, "Cloak of Protection");
});

// ── An effect whose amount is derived ───────────────────────────────────
// "A bonus equal to my Charisma modifier." "Twice my proficiency bonus." (Juan, 2026-10-29.) Almost
// every real bonus is one of those rather than a number worked out once — and a number worked out
// once is wrong the moment the score behind it moves.
test("an effect can be worth an ability modifier or a proficiency bonus, times a multiplier", () => {
  const pal = pc({ level: 9, abilities: { cha: 18, con: 14 },
    saves: { cha: true }, savesFromClass: ["wis", "cha"] });
  assert.equal(R.proficiencyBonus(pal.level), 4);

  const aura = { id: "m1", target: R.SAVE_ALL, from: "cha", times: 1,
    reason: "Aura of Protection", rounds: null, active: true };
  assert.equal(R.modifierAmount(pal, aura), 4, "Charisma 18 is +4");
  assert.equal(R.derivationLabel(aura), "your Charisma modifier");

  const twicePb = { ...aura, id: "m2", from: "prof", times: 2, reason: "a seal's reduction" };
  assert.equal(R.modifierAmount(pal, twicePb), 8);
  assert.equal(R.derivationLabel(twicePb), "twice your proficiency bonus");
  assert.equal(R.derivationLabel({ ...twicePb, times: 0.5 }), "half your proficiency bonus");

  // Halves round down, 5e's rule everywhere.
  assert.equal(R.modifierAmount({ ...pal, level: 5 }, { from: "prof", times: 0.5 }), 1, "half of +3");
  assert.equal(R.modifierAmount(pal, { from: "prof", times: 0.5 }), 2, "half of +4");

  // It reaches every total through activeModifiers, so nothing else had to learn what `from` means.
  const blessed = { ...pal, modifiers: [aura] };
  assert.equal(R.saveTotal(blessed, "con"), 6, "+2 Constitution, +4 from the aura");
  assert.equal(R.saveTotal(blessed, "cha"), 12, "+4 Charisma, +4 proficiency, +4 from the aura");
  assert.equal(R.contributions(R.activeModifiers(blessed), R.SAVE_ALL)[0].amount, 4);
  assert.equal(R.contributions(R.activeModifiers(blessed), R.SAVE_ALL)[0].from, "cha");

  // It FOLLOWS the score: raise the Charisma and the aura rises with it, which is the whole point.
  const ascended = { ...blessed, abilities: { ...blessed.abilities, cha: 20 } };
  assert.equal(R.saveTotal(ascended, "con"), 7);
  // Including a flat effect on that ability — a worn belt counts.
  const belted = { ...blessed, modifiers: [aura,
    { id: "m3", target: "ability:cha", amount: 2, reason: "a belt", rounds: null, active: true }] };
  assert.equal(R.saveTotal(belted, "con"), 7, "Charisma 20 through the belt is +5");

  // And it TERMINATES, which is the part that could have gone wrong: a derivation is measured
  // against the scores minus anything itself derived, so neither of these loops.
  const circular = { ...pal, modifiers: [
    { id: "a", target: "ability:cha", from: "cha", times: 1, reason: "a strange curse", active: true },
    { id: "b", target: "save:all", from: "cha", times: 1, reason: "the aura", active: true },
  ] };
  assert.equal(R.abilityScore(circular, "cha"), 22, "18 + its own +4, once");
  assert.equal(R.saveTotal(circular, "con"), 6, "the aura still reads the plain +4, not the +6");

  // A record with no `from` is untouched, and an unknown source is worth nothing.
  assert.equal(R.modifierAmount(pal, { amount: 3 }), 3);
  assert.equal(R.modifierAmount(pal, { from: "nonsense", times: 2 }), 0);
  assert.equal(R.derivationLabel({ amount: 3 }), "");
});

// An ITEM's effects take a derived amount the same way (Juan, 2026-10-30) — which is the half that
// needed care, because a derived effect carries no amount and the old filter threw away anything
// worth zero.
test("a worn item's effect can be derived too, and only while it is worn", () => {
  const cloak = { name: "Cloak of the Sworn", equipped: true,
    effects: [{ target: R.SAVE_ALL, from: "prof", times: 2 }, { target: "ac", amount: 1 }] };
  const pal = pc({ level: 9, abilities: { cha: 18 }, equipment: { back: cloak } });
  assert.equal(R.proficiencyBonus(pal.level), 4);

  // It survives the list at all, which it did not before.
  assert.deepEqual(R.itemEffectList(cloak).map(e => [e.target, e.amount, e.from || "", e.times || 0]),
    [["save:all", 0, "prof", 2], ["ac", 1, "", 0]]);

  assert.equal(R.saveTotal(pal, "con"), 8, "+8 from twice the proficiency bonus");
  assert.equal(R.armorClass(pal), 11);
  const fx = R.contributions(R.activeModifiers(pal), R.SAVE_ALL)[0];
  assert.equal(fx.amount, 8);
  assert.equal(fx.reason, "Cloak of the Sworn", "named by the item, as every item effect is");
  assert.equal(R.derivationShort(fx), "2×PB");
  assert.equal(R.derivationShort({ from: "cha" }), "Cha");
  assert.equal(R.derivationShort({ from: "prof", times: 0.5 }), "½×PB");

  // Take it off and both go, derived or not.
  const off = pc({ level: 9, equipment: { back: { ...cloak, equipped: true, requiresAttunement: true } } });
  assert.equal(R.saveTotal(off, "con"), 0, "it needs attunement and has none");

  // And a derived item effect is excluded from what another derivation reads, exactly as a written
  // one is — so an item worth "your Charisma" cannot feed an effect worth "your Charisma".
  const odd = pc({ level: 9, abilities: { cha: 18 },
    equipment: { back: { name: "Odd cloak", equipped: true,
      effects: [{ target: "ability:cha", from: "cha", times: 1 }] } },
    modifiers: [{ id: "m", target: "save:all", from: "cha", times: 1, reason: "aura", active: true }] });
  assert.equal(R.saveTotal(odd, "con"), 4, "the aura reads the plain +4, not the cloak's doubling");
});

// ── Save proficiency has two sources ────────────────────────────────────
// A class grants two and nothing else could, so Resilient, an ancestry, a Grimm or a DM's word had
// nowhere to go — and a hand-set one was wiped the next time the class list changed.
test("a save proficiency can be granted by the class or set by hand, and they survive each other", () => {
  const fighter = pc({ level: 9, abilities: { con: 14 }, savesFromClass: ["str", "con"] });
  assert.equal(R.saveProficient(fighter, "con"), true);
  assert.equal(R.saveProficient(fighter, "wis"), false);
  assert.equal(R.saveTotal(fighter, "con"), 6, "+2 Constitution, +4 proficiency");
  assert.equal(R.saveTotal(fighter, "wis"), 0);

  // Resilient (Wisdom): the class never granted it, so it is a hand-set true.
  const resilient = { ...fighter, saves: { wis: true } };
  assert.equal(R.saveProficient(resilient, "wis"), true);
  assert.equal(R.saveTotal(resilient, "wis"), 4);
  assert.equal(R.saveProficiencySource(resilient, "wis"), "hand");
  assert.equal(R.saveProficiencySource(resilient, "con"), "class");

  // And the other direction: one the class granted, taken away by hand.
  const cursed = { ...fighter, saves: { con: false } };
  assert.equal(R.saveProficient(cursed, "con"), false);
  assert.equal(R.saveTotal(cursed, "con"), 2);
  assert.equal(R.saveProficiencySource(cursed, "con"), "removed");

  // Absent means "whatever the class says", so a class change moves it and the hand-set one stays.
  const reclassed = { ...resilient, savesFromClass: ["dex", "int"] };
  assert.equal(R.saveProficient(reclassed, "con"), false, "the old class's is gone");
  assert.equal(R.saveProficient(reclassed, "dex"), true, "the new class's is here");
  assert.equal(R.saveProficient(reclassed, "wis"), true, "and Resilient survived it");

  // A sheet saved before the split has its class's saves in `saves` and no list beside them —
  // read exactly as they always were.
  const old = pc({ level: 9, saves: { str: true, con: true } });
  assert.equal(R.saveProficient(old, "con"), true);
  assert.equal(R.saveProficient(old, "wis"), false);
  assert.equal(R.saveProficiencySource(old, "con"), "hand");
  assert.deepEqual(R.blankCharacter().savesFromClass, []);
});

// ── A bonus to every check, and to every skill ──────────────────────────
// The same gap on the other side of the sheet, and the distinction 5e makes: a SKILL check is an
// ABILITY check, so `check:all` reaches the skills and `skill:all` stops at them.
test("a check bonus reaches the skills; a skill bonus does not reach the checks", () => {
  const base = pc({ level: 9, abilities: { dex: 16, int: 14 }, skills: { stealth: 1, arcana: 2 } });
  assert.equal(R.abilityCheckTotal(base, "dex"), 3);
  assert.equal(R.skillTotal(base, "stealth"), 7, "+3 Dexterity, +4 proficiency");
  assert.equal(R.skillTotal(base, "arcana"), 10, "+2 Intelligence, +8 expertise");

  const guided = { ...base, modifiers: [
    { id: "m1", target: R.CHECK_ALL, amount: 2, reason: "Guidance", rounds: 10, active: true },
    { id: "m2", target: R.SKILL_ALL, amount: 1, reason: "Gloves", rounds: null, active: true },
    { id: "m3", target: "skill:stealth", amount: 3, reason: "a cloak", rounds: null, active: true },
  ] };
  assert.equal(R.abilityCheckTotal(guided, "dex"), 5, "the check blanket only");
  assert.equal(R.skillTotal(guided, "stealth"), 13, "7 + 3 + 1 + 2");
  assert.equal(R.skillTotal(guided, "arcana"), 13, "10 + 1 + 2");
  assert.equal(R.passiveScore(guided, "perception"), 13, "a passive is 10 + the skill");

  // What it must NOT reach: the saves, the spell DCs, the attack bonus and the ability score.
  assert.equal(R.saveTotal(guided, "dex"), 3, "a check bonus is not a save bonus");
  assert.equal(R.abilityScore(guided, "dex"), 16);
  assert.equal(R.abilityModifier(guided, "dex"), 3);
  assert.equal(R.verumDC(guided), 8 + 4 + 3 + 0);

  // Initiative IS a Dexterity check, so it does take the check blanket.
  assert.equal(R.initiative(guided), 5);
  assert.equal(R.initiative(base), 3);

  // The order the number, the tooltip and the roll all read: this skill, every skill, every check.
  assert.deepEqual(R.skillContributions(guided, "stealth").map(c => [c.reason, c.amount]),
    [["a cloak", 3], ["Gloves", 1], ["Guidance", 2]]);
  assert.deepEqual(R.abilityCheckContributions(guided).map(c => c.reason), ["Guidance"]);

  // And Guidance runs out like anything else with rounds on it.
  const { list, ended } = R.tickTimed(guided.modifiers, 1);
  assert.equal(list.find(m => m.id === "m1").rounds, 9);
  assert.deepEqual(ended, []);
  assert.equal(R.skillTotal({ ...guided, modifiers: list.map(m => m.id === "m1" ? { ...m, active: false } : m) },
    "arcana"), 11, "once Guidance is gone, the gloves alone");
});

// ── Defences and the Absolute ───────────────────────────────────────────
// Transcribed from Homebrew/Rulesets/Absolute Damage.md, which is the owning note: resistance
// halves ordinary damage and SUBTRACTS 2 x the defender's proficiency bonus from Absolute damage;
// immunity negates the ordinary and subtracts 4 x PB; vulnerability doubles either; Void and
// All-Mighty are born Absolute and irresistible.
const resistant = (type, over = {}) => pc({ level: 9, defences: { [type]: { standing: "resistant", why: "test" } }, ...over });

test("the sixteen types each carry their Absolute name", () => {
  assert.equal(R.DAMAGE_TYPES.length, 16);
  assert.equal(R.damageTypeName("fire"), "Fire");
  assert.equal(R.damageTypeName("fire", true), "Infernal");
  assert.equal(R.damageTypeName("slashing", true), "Vorpal");
  // Born Absolute: there is no gentler name to fall back to, with or without the flag.
  assert.equal(R.damageTypeName("void"), "Void");
  assert.equal(R.damageTypeName("all-mighty", false), "All-Mighty");
  assert.equal(R.damageTypeName("nonsense", true), "");
});

test("ordinary damage: resistance halves, immunity negates, vulnerability doubles", () => {
  assert.equal(R.mitigate(resistant("fire"), 21, { type: "fire" }).dealt, 10, "halving rounds down");
  assert.equal(R.mitigate(resistant("fire"), 21, { type: "cold" }).dealt, 21, "another type is untouched");
  assert.equal(R.mitigate(resistant("fire"), 21, {}).dealt, 21, "no type named, nothing applied");

  const immune = pc({ level: 9, defences: { poison: { standing: "immune" } } });
  assert.equal(R.mitigate(immune, 30, { type: "poison" }).dealt, 0);
  assert.equal(R.mitigate(immune, 30, { type: "poison" }).applied, "negated");

  const weak = pc({ level: 9, defences: { radiant: { standing: "vulnerable" } } });
  assert.equal(R.mitigate(weak, 12, { type: "radiant" }).dealt, 24);
});

test("Absolute damage: resistance subtracts 2 x PB, immunity 4 x PB, never below zero", () => {
  // The worked example from the note, at a defender with proficiency +4: a 70-point seal against
  // fire resistance deals 35 at Rank III and 62 at Rank IV.
  const fiend = resistant("fire");
  assert.equal(R.proficiencyBonus(fiend.level), 4);
  assert.equal(R.mitigate(fiend, 70, { type: "fire" }).dealt, 35);
  const abs = R.mitigate(fiend, 70, { type: "fire", absolute: true });
  assert.equal(abs.dealt, 62);
  assert.equal(abs.by, 8);
  assert.equal(abs.name, "Infernal");
  assert.equal(abs.applied, "reduced");

  // It scales with the DEFENDER, not the attack: the same resistance at level 17 takes 12 off.
  assert.equal(R.absoluteReduction(pc({ level: 17 }), "resistant"), 12);
  assert.equal(R.absoluteReduction(pc({ level: 17 }), "immune"), 24);
  assert.equal(R.absoluteReduction(pc({ level: 9 }), "vulnerable"), 0);

  // Immunity stops negating and starts subtracting — and never goes below zero.
  const immune = pc({ level: 9, defences: { necrotic: { standing: "immune" } } });
  assert.equal(R.mitigate(immune, 30, { type: "necrotic", absolute: true }).dealt, 14);
  assert.equal(R.mitigate(immune, 10, { type: "necrotic", absolute: true }).dealt, 0);

  // Vulnerability was never a defence, so the Absolute rules leave it exactly as it was.
  const weak = pc({ level: 9, defences: { cold: { standing: "vulnerable" } } });
  assert.equal(R.mitigate(weak, 12, { type: "cold", absolute: true }).dealt, 24);
});

test("Void and All-Mighty are irresistible, and a defence against them is kept and worth nothing", () => {
  const warded = pc({ level: 17, defences: {
    void: { standing: "immune", why: "a god's own ward" },
    "all-mighty": { standing: "resistant" },
  } });
  const v = R.mitigate(warded, 40, { type: "void" });
  assert.equal(v.dealt, 40, "nothing resists, reduces or absorbs it");
  assert.equal(v.absolute, true, "born Absolute without being told");
  assert.equal(v.applied, "irresistible");
  assert.equal(R.mitigate(warded, 40, { type: "all-mighty" }).dealt, 40);
  // The record survives, because it is still true of the character — the sheet says it does
  // nothing rather than refusing to hold it.
  assert.equal(R.defence(warded, "void").standing, "immune");
  assert.equal(R.defenceList(warded).length, 2);

  // "Ignores resistance": the halving before Rank IV, the reduction after it.
  const fiend = resistant("fire");
  assert.equal(R.mitigate(fiend, 70, { type: "fire", ignoresResistance: true }).dealt, 70);
  assert.equal(R.mitigate(fiend, 70, { type: "fire", absolute: true, ignoresResistance: true }).dealt, 70);
});

test("a defence is tolerant of how it was written, and strict about what it means", () => {
  // A bare string is a standing, and a map keyed by type is a sheet saved before a defence could
  // run out — both are still read, and both come back as lasting records.
  const terse = pc({ defences: { fire: "resistant" } });
  assert.equal(R.defence(terse, "fire").standing, "resistant");
  assert.equal(R.defence(terse, "fire").rounds, null);
  assert.equal(R.defence(terse, "FIRE").standing, "resistant", "the type id is case-insensitive");
  assert.deepEqual(R.defenceRecords(pc({ defences: { cold: { standing: "immune", why: "a ward" } } })),
    [{ id: "d:cold", type: "cold", standing: "immune", why: "a ward", rounds: null, active: true }]);
  // Anything that is not one of the three standings is not a defence.
  assert.equal(R.defence(pc({ defences: { fire: { standing: "immunish" } } }), "fire"), null);
  assert.equal(R.defence(pc({ defences: [{ id: "x", type: "nonsense", standing: "immune" }] }), "nonsense"), null);
  assert.equal(R.defence(pc(), "fire"), null);
  assert.deepEqual(R.defenceList(pc()), []);
});

// ── A defence that runs out ─────────────────────────────────────────────
// Absorb Elements, a Rage, a potion, a Grimm's gift: a resistance can be borrowed for a few rounds,
// and it lands ON TOP of what the character already is. So defences are records on the same clock
// as every other timed thing, and more than one can touch the same damage type.
test("a borrowed defence counts down, and several on one type resolve to one answer", () => {
  const ch = pc({ level: 9, defences: [
    { id: "a", type: "fire", standing: "resistant", why: "Tiefling", rounds: null, active: true },
    { id: "b", type: "fire", standing: "resistant", why: "Absorb Elements", rounds: 1, active: true },
    { id: "c", type: "cold", standing: "immune", why: "a potion", rounds: 10, active: true },
    { id: "d", type: "radiant", standing: "vulnerable", why: "a curse", rounds: null, active: true },
    { id: "e", type: "radiant", standing: "resistant", why: "a ward", rounds: 3, active: true },
  ] });

  // Multiple instances of one standing count as one — three sources of fire resistance is still half.
  assert.equal(R.defence(ch, "fire").standing, "resistant");
  assert.equal(R.mitigate(ch, 21, { type: "fire" }).dealt, 10);
  // The chip shows the shortest fuse among the records that decided it, because when THAT runs out
  // the answer may change — here it does not, since the Tiefling's own resistance is lasting.
  assert.equal(R.defence(ch, "fire").rounds, 1);
  assert.equal(R.defence(ch, "fire").temporary, false, "one of the two is simply true of them");
  assert.equal(R.defence(ch, "cold").temporary, true);

  // A resistance and a vulnerability on one type cancel: the damage lands whole, and the sheet says
  // which it was rather than quietly doing nothing.
  const rad = R.defence(ch, "radiant");
  assert.equal(rad.standing, "none");
  assert.equal(rad.cancelled, true);
  const m = R.mitigate(ch, 12, { type: "radiant" });
  assert.equal(m.dealt, 12);
  assert.equal(m.applied, "cancelled");
  assert.match(R.mitigationLine(m), /cancel/);

  // Immunity beats both, however they were written.
  const warded = pc({ defences: [
    { id: "a", type: "fire", standing: "vulnerable", active: true },
    { id: "b", type: "fire", standing: "resistant", active: true },
    { id: "c", type: "fire", standing: "immune", rounds: 2, active: true },
  ] });
  assert.equal(R.defence(warded, "fire").standing, "immune");
  assert.equal(R.mitigate(warded, 30, { type: "fire" }).dealt, 0);

  // One confirmed round: Absorb Elements ends, the potion counts down, the Tiefling is unchanged —
  // the same tick the modifiers, the actions, the grants and the Inspiration dice run on.
  const { list, ended } = R.tickTimed(R.defenceRecords(ch), 1);
  assert.deepEqual(ended.map(r => r.id), ["b"]);
  assert.equal(list.find(r => r.id === "c").rounds, 9);
  assert.equal(list.find(r => r.id === "a").rounds, null);

  // And once it has gone, the character is still resistant — which is the whole reason these are
  // records rather than one standing per type.
  const after = pc({ level: 9, defences: list.filter(r => r.active !== false) });
  assert.equal(R.defence(after, "fire").standing, "resistant");
  assert.equal(R.defence(after, "fire").rounds, null);
  assert.equal(R.defenceRecords(after).length, 4);

  // The types a picker offers: one row per type, each carrying its resolved answer.
  // In the order the sixteen are written, not the order they were added.
  assert.deepEqual(R.defenceTypes(ch).map(t => [t.id, t.standing]),
    [["cold", "immune"], ["fire", "resistant"], ["radiant", "none"]]);
});

test("typed damage meets the defences before hit points, temporary ones included", () => {
  const ch = resistant("fire", { hp: 94, maxHp: 94, tempHp: 10 });
  // 50 fire against resistance is 25 landing: the temporary pool absorbs 10 of THAT, and the
  // half-maximum Wound trigger reads what landed rather than what was rolled.
  const r = R.applyDamage(ch, 50, { type: "fire" });
  assert.equal(r.mitigation.dealt, 25);
  assert.equal(r.absorbed, 10);
  assert.equal(r.hp, 79);
  assert.equal(r.tempHp, 0);
  assert.deepEqual(r.woundTriggers, [], "25 is not half of 94");
  assert.equal(r.concentrationDC, 12, "10 or half the damage that landed");

  // Untyped, the same blow is the whole 50 — which fires the trigger it always did.
  const raw = R.applyDamage(ch, 50);
  assert.equal(raw.hp, 54);
  assert.deepEqual(raw.woundTriggers, ["halfMaxHp"]);
  assert.equal(raw.mitigation.applied, "none");

  // Immunity to the ordinary form means a hit that changes nothing at all.
  const immune = pc({ hp: 40, maxHp: 40, defences: { poison: { standing: "immune" } } });
  assert.equal(R.applyDamage(immune, 18, { type: "poison" }).hp, 40);

  // And the line the table reads afterwards names the form, not the type.
  assert.match(R.mitigationLine(R.mitigate(resistant("fire"), 70, { type: "fire", absolute: true })),
    /Infernal/);
  assert.equal(R.mitigationLine(R.mitigate(pc(), 10, {})), "", "nothing to say about untyped damage");
});

// ── Inspiration ─────────────────────────────────────────────────────────
// A pool of dice rather than one token: a d4 of Bless, a Bard's d8 and a DM's "have a d6" are the
// same act at this table. Each die is the same shape as a modifier, so it keeps the same clock.
test("inspiration is a pool, and the die about to run out is spent first", () => {
  const ch = pc({ inspiration: [
    { id: "a", die: "d6", rounds: null, why: "a DM's nod", active: true },
    { id: "b", die: "d6", rounds: 3, why: "Bless", active: true },
    { id: "c", die: "d6", rounds: 1, why: "Guidance", active: true },
    { id: "d", die: "d8", rounds: null, why: "Bardic Inspiration", active: true },
    { id: "e", die: "d4", rounds: 2, active: false },
  ] });
  assert.equal(R.inspirationHeld(ch).length, 4, "an inactive die is not held");
  assert.equal(R.inspirationOf(ch, "d6").length, 3);
  assert.equal(R.inspirationNext(ch, "d6").id, "c", "the shortest fuse goes first");
  assert.equal(R.inspirationNext(ch, "d8").id, "d", "until used, when that is all there is");
  assert.equal(R.inspirationNext(ch, "d12"), null);
  assert.deepEqual(R.INSPIRATION_DICE, ["d4", "d6", "d8", "d10", "d12", "d20"]);

  // One confirmed round: Guidance ends, Bless counts down, the DM's nod is untouched.
  const { list, ended } = R.tickTimed(ch.inspiration, 1);
  assert.deepEqual(ended.map(d => d.id), ["c"]);
  assert.equal(list.find(d => d.id === "b").rounds, 2);
  assert.equal(list.find(d => d.id === "a").rounds, null);
  assert.equal(R.inspirationHeld({ inspiration: list }).length, 3);
});
