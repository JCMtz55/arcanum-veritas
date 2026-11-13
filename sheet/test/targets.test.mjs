// The contract between the Arcanum builder and the sheet.
//
// The builder writes a seal's benefits as plain objects and the server is what checks them, because
// the builder is plain <script> files that cannot import the engine. Everything here is that check:
// a benefit the sheet could not apply must never become a row on somebody else's character.
//
// Run with:  node --test sheet/test/targets.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import * as T from "../js/targets.js";
import * as R from "../js/rules.js";

const caster = (over = {}) => ({ ...R.blankCharacter(), ...over,
  abilities: { ...R.blankCharacter().abilities, ...(over.abilities || {}) } });

test("the menu is the engine's list, in the engine's order", () => {
  assert.deepEqual(T.MOD_TARGETS.map(t => t.value), R.MOD_TARGET_IDS);
  // Every one of them says something a player can read; none falls back to its own id.
  assert.ok(T.MOD_TARGETS.every(t => t.label && t.label !== t.value));
});

test("a benefit the sheet could not apply is not a benefit", () => {
  assert.equal(T.cleanBenefit({ target: "morale", amount: 2 }), null);
  assert.equal(T.cleanBenefit({ target: "ac", amount: 0 }), null);     // a +0 is not an effect
  assert.equal(T.cleanBenefit({ target: "ac", amount: 99 }), null);    // nor is a forged one
  assert.equal(T.cleanBenefit(null), null);
  assert.equal(T.cleanBenefit("ac"), null);
});

test("a benefit is cleaned down to what the engine understands", () => {
  assert.deepEqual(T.cleanBenefit({ target: "ac", amount: "2", rounds: 10, note: "Shield of Faith" }),
    { kind: "modifier", target: "ac", amount: 2, rounds: 10, note: "Shield of Faith" });
  // A duration nobody offered is no duration at all, rather than a number invented here.
  assert.equal(T.cleanBenefit({ target: "ac", amount: 2, rounds: 7 }).rounds, null);
});

test("a derived benefit keeps its formula and carries no amount of its own", () => {
  const b = T.cleanBenefit({ target: "saveDc", from: "dream", times: 2, amount: 99 });
  assert.equal(b.from, "dream");
  assert.equal(b.times, 2);
  assert.equal(b.amount, 0);          // the 99 is ignored, not honoured
  // An ability nothing derives from is not a derivation, and then the amount has to stand on its own.
  assert.equal(T.cleanBenefit({ target: "ac", from: "luck", amount: 2 }).from, undefined);
});

test("a seal carries six benefits and no more", () => {
  const many = Array.from({ length: 20 }, () => ({ target: "ac", amount: 1 }));
  assert.equal(T.cleanBenefits(many).length, T.BENEFITS_MAX);
  assert.equal(T.cleanBenefits(null).length, 0);
  // The rubbish is dropped rather than failing the whole cast: three good rows still land.
  assert.equal(T.cleanBenefits([{ target: "ac", amount: 1 }, { target: "nonsense", amount: 1 },
    { target: "speed", amount: 10 }, null, { target: "initiative", amount: 2 }]).length, 3);
});

test("a derived benefit is resolved against the CASTER, and frozen there", () => {
  // Dream 20 is a +5. "Twice my Dream modifier" is a +10 the moment it is cast...
  const me = caster({ level: 1, abilities: { dream: 20 } });
  const b = T.cleanBenefit({ target: "saveDc", from: "dream", times: 2 });
  const out = T.resolveBenefit(me, b);
  assert.equal(out.amount, 10);
  assert.equal(out.formula, "twice your Dream modifier");

  // ...and it is a flat 10 afterwards, whatever the recipient's own Dream happens to be. This is
  // the whole reason the number is resolved here rather than on the sheet it lands on.
  assert.equal(out.from, undefined);
  const poorer = caster({ abilities: { dream: 8 } });
  assert.equal(T.resolveBenefit(poorer, b).amount, -2);
  assert.notEqual(T.resolveBenefit(poorer, b).amount, out.amount);
});

test("a flat benefit resolves to itself and says nothing about a formula", () => {
  const out = T.resolveBenefit(caster(), T.cleanBenefit({ target: "ac", amount: 2, rounds: 10 }));
  assert.deepEqual(out, { kind: "modifier", target: "ac", amount: 2, rounds: 10,
    formula: "", note: "", payload: null });
});

// ── the other four kinds ────────────────────────────────────────────────
test("a heal carries dice and no duration — it either lands or it does not", () => {
  assert.deepEqual(T.cleanBenefit({ kind: "heal", dice: "3d8 + 4", rounds: 10, note: "warmth" }),
    { kind: "heal", dice: "3d8+4", note: "warmth" });
  assert.deepEqual(T.cleanBenefit({ kind: "tempHp", dice: "12" }),
    { kind: "tempHp", dice: "12", note: "" });
  // Anything the sheet's own dice parser could not read is not a benefit.
  assert.equal(T.cleanBenefit({ kind: "heal", dice: "a lot" }), null);
  assert.equal(T.cleanBenefit({ kind: "heal", dice: "" }), null);
  assert.equal(T.cleanBenefit({ kind: "heal" }), null);
});

test("a resistance names a real damage type, and a seal never hands out a vulnerability", () => {
  assert.deepEqual(T.cleanBenefit({ kind: "defence", dtype: "Fire", standing: "resistant", rounds: 10 }),
    { kind: "defence", dtype: "fire", standing: "resistant", rounds: 10, note: "" });
  assert.equal(T.cleanBenefit({ kind: "defence", dtype: "sadness", standing: "resistant" }), null);
  // Vulnerability is a real standing and deliberately not offerable: a benefit is a benefit.
  assert.equal(T.cleanBenefit({ kind: "defence", dtype: "fire", standing: "vulnerable" }), null);
});

test("an extra action names one of the six costs and is capped at three", () => {
  assert.deepEqual(T.cleanBenefit({ kind: "turn", turnKind: "reaction", n: 9, rounds: 1 }),
    { kind: "turn", turnKind: "reaction", n: 3, rounds: 1, note: "" });
  assert.equal(T.cleanBenefit({ kind: "turn", turnKind: "interlude" }), null);
  for (const k of R.TURN_KINDS)
    assert.equal(T.cleanBenefit({ kind: "turn", turnKind: k }).turnKind, k);
});

test("advantage carries a target and no amount, because the second d20 is the amount", () => {
  assert.deepEqual(T.cleanBenefit({ kind: "advantage", target: "skill:perception", rounds: 10 }),
    { kind: "advantage", target: "skill:perception", rounds: 10, note: "" });
  // Scoped by the SAME list a bonus is scoped by — one vocabulary, so a seal cannot point advantage
  // at something no roll consults.
  assert.equal(T.cleanBenefit({ kind: "advantage", target: "vibes" }), null);
  // Nothing about the caster changes what it is worth, so there is nothing to resolve.
  const out = T.resolveBenefit(caster({ abilities: { dream: 20 } }),
    T.cleanBenefit({ kind: "advantage", target: R.SAVE_ALL }));
  assert.equal(out.target, R.SAVE_ALL);
  assert.equal(out.amount, 0);
  assert.equal(out.payload, null);
  // ...and it is never dropped as "worth nothing", which only a modifier can be.
  assert.ok(!T.benefitIsEmpty(out));
  // `targetLabel`'s wording, not the menu's: a sentence wants "all saves", a dropdown row wants
  // "All saving throws", and the two are allowed to differ.
  assert.equal(T.benefitSays(out), "advantage on all saves");
});

test("an unknown kind falls back to a modifier rather than becoming nothing", () => {
  // A row from a save written before kinds existed has no `kind` at all, and it is a modifier.
  assert.equal(T.cleanBenefit({ target: "ac", amount: 2 }).kind, "modifier");
  assert.equal(T.cleanBenefit({ kind: "wish", target: "ac", amount: 2 }).kind, "modifier");
});

test("only a modifier can be worth nothing", () => {
  assert.ok(T.benefitIsEmpty({ kind: "modifier", amount: 0 }));
  assert.ok(!T.benefitIsEmpty({ kind: "modifier", amount: -1 }));
  // A heal of 3d8 is never nothing, and a resistance has no number to be zero.
  assert.ok(!T.benefitIsEmpty({ kind: "heal", amount: 0, payload: { dice: "3d8" } }));
  assert.ok(!T.benefitIsEmpty({ kind: "defence", amount: 0 }));
  assert.ok(!T.benefitIsEmpty({ kind: "turn", amount: 0 }));
});

test("the non-modifier kinds resolve to a payload and nothing the caster's scores touch", () => {
  const me = caster({ level: 9, abilities: { dream: 18 } });
  const heal = T.resolveBenefit(me, T.cleanBenefit({ kind: "heal", dice: "3d8" }));
  assert.equal(heal.kind, "heal");
  assert.deepEqual(heal.payload, { dice: "3d8" });
  assert.equal(heal.rounds, null);

  const res = T.resolveBenefit(me, T.cleanBenefit({ kind: "defence", dtype: "fire", standing: "immune", rounds: 3 }));
  assert.deepEqual(res.payload, { dtype: "fire", standing: "immune" });
  assert.equal(res.rounds, 3);

  const act = T.resolveBenefit(me, T.cleanBenefit({ kind: "turn", turnKind: "bonus", n: 2 }));
  assert.deepEqual(act.payload, { turnKind: "bonus", n: 2 });
});

test("every kind says what it does, in words the three readings share", () => {
  const says = b => T.benefitSays(T.resolveBenefit(caster(), T.cleanBenefit(b)));
  assert.equal(says({ kind: "heal", dice: "3d8" }), "heals 3d8");
  assert.equal(says({ kind: "tempHp", dice: "2d6" }), "2d6 temporary HP");
  assert.equal(says({ kind: "defence", dtype: "fire", standing: "resistant" }), "resistant to fire");
  assert.equal(says({ kind: "turn", turnKind: "action", n: 1 }), "an extra action");
  assert.equal(says({ kind: "turn", turnKind: "reaction", n: 2 }), "2 extra reactions");
  assert.equal(says({ target: "ac", amount: 2 }), "+2 AC");
});

test("what the server grants is what the engine then merges", () => {
  // The round trip: authored in the builder, cleaned, resolved against the caster, stored as a row,
  // and read back by the engine as an ordinary modifier on somebody else's character.
  const me = caster({ level: 9, abilities: { dream: 18 } });        // Dream +4
  const resolved = T.resolveBenefit(me, T.cleanBenefit({ target: "ac", from: "dream", times: 1 }));
  const them = { ...R.blankCharacter(), ac: 10,
    granted: [{ id: 1, label: "Gate of Caelum", player: "Salomon", ...resolved }] };
  assert.equal(R.armorClass(them), 14);
});
