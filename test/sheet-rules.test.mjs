// The character sheet's rules engine, checked against the spec's own fixtures.
//
//   node test/sheet-rules.test.mjs
//
// These are not invented cases: Appendix B of the Character Sheet Requirements lists eleven
// "minimum test fixtures for the resolution", and Appendices A and C add acceptance tests beside
// each mechanic. Every number below comes from one of them, so a change that breaks a ruling
// breaks a test rather than quietly reaching the table.
//
// The two that matter most are the ones Juan ruled on 2026-10-23: the Cognitive Saving Throw uses
// the HIGHEST of the six (the legacy Main Stat answer is asserted too, as the wrong answer), and
// Dream Exhaustion is cumulative, so a level-7 roll still takes -5 and a survived Collapse leaves
// the track at 8.
import * as R from "../js/sheet-rules.js";

let pass = 0, fail = 0;
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${label}` + (ok ? ` = ${JSON.stringify(got)}` : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`));
};

const ch = {
  level: 5,                                   // PB 3
  dream: 16,                                  // +3
  scores: { str: 12, dex: 18, con: 14, int: 14, wis: 10, cha: 8 },
  skills: { fabricate: 1 },
  wounds: 2, injuries: 1, exhaustion: 0,
  honorOrder: 4, honorChaos: 6,
  moralityGood: 7, moralityEvil: 3,
};

console.log("\n1 · Cognitive Saving Throw — DM-10 Highest Stat");
eq("modifier (Dream +3, best of six = DEX +4)", R.cognitiveSave(ch).total, 7);
eq("a roll of 10 makes", 10 + R.cognitiveSave(ch).total, 17);
eq("the highest is DEX, not the chosen anchor", R.cognitiveSave(ch).highest, "dex");
eq("legacy Main Stat STR would have given", 10 + R.mod(ch.dream) + R.mod(ch.scores.str), 14);
eq("proficiency is not in it (PB is 3)", R.profBonus(ch.level), 3);

console.log("\n2 · Wounds and Injuries — RES-02");
eq("death-save DC with 2 Wounds + 1 Injury", R.deathSaveDc(ch).dc, 13);
eq("concentration DC after 28 damage", R.concentrationDc(ch, 28).dc, 17);
eq("concentration floor holds at low damage", R.concentrationDc(ch, 6).dc, 13);
eq("the sixth Wound makes an Injury, Wounds reset to 1",
   R.injuryFromWounds({ ...ch, wounds: 6, injuries: 0 }).wounds, 1);
eq("five Wounds is not yet an Injury", R.injuryFromWounds({ ...ch, wounds: 5 }), null);
eq("a 5th-level heal removes 2 Wounds", R.woundsHealedBySpell(5), 2);
eq("a 3rd-level heal removes none", R.woundsHealedBySpell(3), 0);

console.log("\n3 · Honor and Morality — RES-10");
eq("Honor total (Order 4 + Chaos 6)", R.honor(ch).total, 10);
eq("a Chaos-aligned check", R.honor(ch, "chaos").modifier, 2);
eq("an Order-aligned check", R.honor(ch, "order").modifier, -2);
eq("a tie is zero", R.honor({ honorOrder: 5, honorChaos: 5 }, "order").modifier, 0);
eq("Morality total (Good 7 + Evil 3)", R.morality(ch).total, 10);
eq("a Good-aligned check", R.morality(ch, "good").modifier, 4);

console.log("\n4 · Fabricate — RES-06");
eq("general Fabricate (Dream +3, prof 3)", R.fabricate(ch).total, 6);
eq("crafting adds Intelligence once", R.fabricate(ch, { crafting: true }).total, 8);

console.log("\n5 · Dream Exhaustion — DM-08 cumulative, DM-09 stays at 8");
eq("level 3, in dream", R.dreamExhaustion(3, true).applied, -3);
eq("level 3, awake", R.dreamExhaustion(3, false).applied, 0);
eq("level 7 STILL takes -5", R.dreamExhaustion(7, true).applied, -5);
eq("level 8 still takes -5", R.dreamExhaustion(8, true).applied, -5);
eq("level 4 brings Concentration disadvantage", R.dreamExhaustion(4, true).concentrationDisadvantage, true);
eq("level 6 blocks Inspiration in dream", R.dreamExhaustion(6, true).inspirationBlocked, true);
eq("a dream-free long rest takes 3 to 2", R.dreamRestRecovery(3, false), 2);
eq("a rest that included Dream Walking takes none", R.dreamRestRecovery(3, true), 3);
const col = R.collapseSurvived({ ...ch, exhaustion: 0 });
eq("a survived Collapse STAYS at 8", col.dreamExhaustion, 8);
eq("and adds four PHYSICAL Exhaustion", col.exhaustion, 4);

console.log("\n6 · Fate Die — FD-02");
eq("1 vs 20 keeps 20", R.emphasis([1, 20]).kept, 20);
eq("3 vs 17 is a tie", R.emphasis([3, 17]).tie, true);
eq("4 vs 16 is a tie", R.emphasis([4, 16]).tie, true);
eq("2 vs 15 keeps 2 (8 from 10 beats 5)", R.emphasis([2, 15]).kept, 2);
eq("10 vs 11 keeps 11", R.emphasis([10, 11]).kept, 11);

console.log("\n7 · Pair Action — DM-12 / RES-14");
eq("PB 4, PB 3, best eligible +2", R.pairSaveDc(4, 3, 2, 0).dc, 17);
eq("the higher modifier is used, never the sum", R.pairSaveDc(4, 3, 2, 1).used, 2);

console.log("\n8 · Cognitive Sense — CGS-01 / DM-11");
eq("Dream 17 grants one use", R.cognitiveSenseUses(17), 1);
eq("Dream 18 grants two", R.cognitiveSenseUses(18), 2);
eq("a Whisper of 24 is a vision, not a Known link", R.whisperBand(24).max, 24);
eq("25 grants the hour-long Known link", R.whisperBand(25).min, 25);

console.log("\n9 · Attunement — DM-14 / RES-09");
const att = { ...ch, attuned: [{ planar: false }, { planar: false }, { planar: true }] };
eq("three baseline slots", R.attunement(att).baseline, 3);
eq("planar effects are live in Insomnia", R.attunement(att, { inInsomnia: true }).planarActive, true);
eq("and inactive outside it", R.attunement(att, { inInsomnia: false }).planarActive, false);
eq("but the attunement record stands", R.attunement(att, { inInsomnia: false }).planarUsed, 1);

console.log("\n10 · Dream as the seventh score — RES-03");
eq("Dream 14 to 16 moves the modifier +2 to +3", [R.mod(14), R.mod(16)], [2, 3]);
eq("and a Strength check is untouched", R.skillTotal({ ...ch, dream: 16 }, R.SKILLS_2014.find(s => s.key === "athletics")).total,
   R.skillTotal({ ...ch, dream: 14 }, R.SKILLS_2014.find(s => s.key === "athletics")).total);
eq("the starting score is 10, a +0", R.mod(10), 0);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
