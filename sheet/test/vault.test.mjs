// The vault importer: what it accepts as a link, what it finds in a note, and what it refuses to
// let a note write onto a character sheet.
//
// Nothing here touches the network. The two things that DO need the live site were checked by hand
// on 2026-11-03 and are recorded in vault.js: the access endpoint serves raw markdown with
// `Access-Control-Allow-Origin: *`, and an Obsidian `%% … %%` comment survives into that markdown
// while rendering as nothing on the published page.
//
// Run with:  node --test sheet/test/

import { test } from "node:test";
import assert from "node:assert/strict";
import * as V from "../js/vault.js";

const PAGE = "https://publish.obsidian.md/once-upon-a-star/"
  + "Once+Upon+a+Star+%E2%98%85/Item+Vault/Flagship/Dreammaker";

// ── the link ────────────────────────────────────────────────────────────
test("a page link off the published site becomes a path and a raw address", () => {
  const ref = V.parseVaultLink(PAGE);
  assert.equal(ref.path, "Once Upon a Star ★/Item Vault/Flagship/Dreammaker");
  assert.equal(ref.title, "Dreammaker");
  assert.equal(ref.raw, `https://publish-01.obsidian.md/access/${V.SITE.uid}/`
    + "Once%20Upon%20a%20Star%20%E2%98%85/Item%20Vault/Flagship/Dreammaker.md");
  // The page address is rebuilt rather than kept, so a link pasted in any of the three accepted
  // shapes is stored on the item in one shape.
  assert.equal(V.parseVaultLink(ref.raw).page, ref.page);
  assert.equal(V.parseVaultLink(ref.page).path, ref.path);
});

test("a bare vault path is a link too, with or without .md", () => {
  const a = V.parseVaultLink("Once Upon a Star ★/Item Vault/Equipment/Solar Scarf");
  const b = V.parseVaultLink("/Once Upon a Star ★/Item Vault/Equipment/Solar Scarf.md");
  assert.equal(a.path, b.path);
  assert.equal(a.title, "Solar Scarf");
});

test("anywhere that is not our own vault is refused by name", () => {
  for (const bad of [
    "https://example.com/once-upon-a-star/Item",           // another host
    "https://publish.obsidian.md/some-other-vault/Item",   // another Obsidian site
    "javascript:alert(1)",                                 // not a link at all
    "https://publish-01.obsidian.md/access/deadbeef/Item.md", // another site's uid
    "",
  ]) assert.throws(() => V.parseVaultLink(bad), /link|Paste/i, `accepted ${bad}`);
});

// ── the hidden block ────────────────────────────────────────────────────
const note = body => `*Weapon (Aethkasar), Mythic Lucidlike*\n\nSome prose.\n\n${body}\n\n## More prose\n`;

test("the block is found in both invisible forms, fenced or not", () => {
  const one = `%%av-item\n{ "name": "A" }\n%%`;
  const two = `<!--av-item\n\`\`\`json\n{ "name": "B" }\n\`\`\`\n-->`;
  assert.equal(V.readBlocks(note(one))[0].name, "A");
  assert.equal(V.readBlocks(note(two))[0].name, "B");
  assert.ok(V.hasBlock(note(one)) && V.hasBlock(note(two)));
  assert.equal(V.hasBlock(note("nothing hidden here")), false);
  assert.deepEqual(V.readBlocks("no block at all"), []);
});

test("one note can declare a set, as an array or under items", () => {
  assert.equal(V.readBlocks(note(`%%av-item\n[{ "name": "A" }, { "name": "B" }]\n%%`)).length, 2);
  assert.equal(V.readBlocks(note(`%%av-item\n{ "items": [{ "name": "A" }, { "name": "B" }] }\n%%`)).length, 2);
  // Two separate blocks in one note count as two as well.
  assert.equal(V.readBlocks(`%%av-item\n{"name":"A"}\n%%\ntext\n%%av-item\n{"name":"B"}\n%%`).length, 2);
});

test("broken JSON says so rather than being swallowed", () => {
  assert.throws(() => V.readBlocks(note(`%%av-item\n{ "name": "A", }\n%%`)), /not valid JSON/);
});

// ── what a note may and may not write onto a sheet ──────────────────────
const full = {
  name: "Dreammaker", slot: "mainHand", weight: 2.25, value: 0,
  notes: "Weapon (Aethkasar), Mythic Lucidlike",
  magical: true, requiresAttunement: true, dream: "lucidlike",
  charges: { max: 3, recharge: "long", regain: "all" },
  effects: [
    { target: "attack", from: "prof" },
    { target: "ac", amount: 1 },
    { target: "save:all", from: "cha", times: 2 },
  ],
  features: [{ name: "Dawnbreak", text: "Radiant damage in d8s.", uses: 1, reset: "s" },
             { name: "Radiant Core", text: "All its damage is radiant." }],
  attacks: [{ name: "Dreammaker", damage: "2d6", type: "radiant", bonus: 5 }],
};

test("a well-formed block maps onto the sheet's own item shape", () => {
  const out = V.normalizeBlock(full, { page: PAGE });
  assert.equal(out.slot, "mainHand");
  assert.equal(out.item.name, "Dreammaker");
  assert.equal(out.item.weight, 2.25);
  assert.equal(out.item.magical, true);
  assert.equal(out.item.dream, "lucidlike");
  assert.equal(out.item.vault, PAGE);
  // Attunement is never asserted by the note — whether a slot has been spent is the character's.
  assert.equal(out.item.attuned, false);
  assert.deepEqual(out.item.charges, { max: 3, used: 0, recharge: "long", regain: "all" });
  assert.equal(out.item.effects.length, 3);
  assert.deepEqual(out.item.effects[0], { target: "attack", amount: 0, from: "prof", times: 1 });
  assert.deepEqual(out.item.effects[1], { target: "ac", amount: 1 });
  assert.equal(out.item.effects[2].times, 2);
  assert.deepEqual(out.warnings, []);

  // Features and attacks are keyed on the item's name, which is what makes a second read replace
  // its own rows instead of adding a second Dawnbreak.
  assert.equal(out.features.length, 2);
  assert.equal(out.features[0].source, "item");
  assert.equal(out.features[0].used, 0);
  // Its recharge travels with it, so a rest gives it back instead of the player doing it (CS-089).
  assert.equal(out.features[0].reset, "s");
  assert.equal(out.features[1].reset, "");
  assert.ok(out.features.every(f => f.id.startsWith(V.featurePrefix("Dreammaker"))));
  assert.ok(out.attacks.every(a => a.id.startsWith(V.attackPrefix("Dreammaker"))));
  assert.equal(out.attacks[0].damage, "2d6");
});

test("a name is the one thing a block cannot do without", () => {
  assert.throws(() => V.normalizeBlock({ weight: 3 }), /no `name`/);
});

test("anything the engine cannot apply is dropped and reported, never applied", () => {
  const out = V.normalizeBlock({
    name: "Typo Ring",
    slot: "thirdHand",
    charges: { max: 2, recharge: "whenever" },
    effects: [
      { target: "charisma", amount: 2 },     // not a target id
      { target: "ac", from: "luck" },        // not a derivable score
      { target: "ac", amount: 0 },           // nothing to apply
      { target: "speed", from: "prof", times: 1.5 },  // not a multiplier the engine has
    ],
  });
  assert.equal(out.slot, null, "an unknown slot must send it to the pack");
  assert.equal(out.item.charges.recharge, "manual");
  assert.equal(out.item.effects.length, 1);
  assert.deepEqual(out.item.effects[0], { target: "speed", amount: 0, from: "prof", times: 1 });
  // One each for the slot, the recharge, the three refused effects and the rounded multiplier.
  assert.equal(out.warnings.length, 6);
  assert.ok(out.warnings.some(w => /thirdHand/.test(w)));
});

test("numbers are clamped and strings cut, so a typo cannot corrupt a sheet", () => {
  const out = V.normalizeBlock({
    name: "x".repeat(400), qty: 1e9, weight: -5, value: "lots",
    notes: "y".repeat(400),
    charges: { max: 500, used: 900 },
    effects: [{ target: "ac", amount: 999 }],
    features: Array.from({ length: 60 }, (_, i) => ({ name: `F${i}`, text: "t", uses: 99 })),
  });
  assert.equal(out.item.name.length, 80);
  assert.equal(out.item.qty, 999);
  assert.equal(out.item.weight, 0);
  assert.equal(out.item.value, 0);
  assert.equal(out.item.notes.length, 160);
  assert.equal(out.item.charges.max, 99);
  assert.equal(out.item.charges.used, 99);
  assert.equal(out.item.effects[0].amount, 20);
  assert.equal(out.features.length, 24);
  assert.equal(out.features[0].uses, 12);
});

test("a block says WHICH dream kind, and a nonsense one is refused rather than guessed", () => {
  assert.equal(V.normalizeBlock({ name: "A", dream: "Lucidlike" }).item.dream, "lucidlike");
  assert.equal(V.normalizeBlock({ name: "A", dream: "dreamlike" }).item.dream, "dreamlike");
  assert.equal(V.normalizeBlock({ name: "A" }).item.dream, "");
  assert.equal(V.normalizeBlock({ name: "A", dream: "none" }).item.dream, "");

  const bad = V.normalizeBlock({ name: "A", dream: "lucid" });
  assert.equal(bad.item.dream, "");
  assert.match(bad.warnings[0], /dreamlike.*lucidlike/);

  // The retired boolean is still read, and still means Dreamlike — blocks written before the axis
  // had three values must not silently become Lucidlike.
  assert.equal(V.normalizeBlock({ name: "A", insomniaOnly: true }).item.dream, "dreamlike");
  assert.equal(V.normalizeBlock({ name: "A", dream: "lucidlike", insomniaOnly: true }).item.dream, "lucidlike");
});

test("a feature's recharge is translated, and a nonsense one comes back by hand", () => {
  const f = r => V.normalizeBlock({ name: "X", features: [{ name: "F", uses: 1, reset: r }] });
  // The words a note is likely to use, mapped onto the engine's vocabulary.
  assert.equal(f("s").features[0].reset, "s");
  assert.equal(f("short").features[0].reset, "s");
  assert.equal(f("Long").features[0].reset, "l");
  assert.equal(f("day").features[0].reset, "dawn");
  assert.equal(f("daily").features[0].reset, "dawn");
  assert.equal(f("dusk").features[0].reset, "dusk");
  assert.equal(f(undefined).features[0].reset, "");

  // CS-096, built 2026-11-04: the five the Item Vault actually asks for are values now, not
  // shrugs. Before this, "weekly" was refused loudly — which was right at the time, because
  // silently making it a long rest would hand The Compact back seven times too often.
  assert.equal(f("weekly").features[0].reset, "week");
  assert.equal(f("week").features[0].reset, "week");
  assert.equal(f("per session").features[0].reset, "session");
  assert.equal(f("per Cycle").features[0].reset, "cycle");
  assert.equal(f("recharge").features[0].reset, "d6");
  assert.equal(f("weekly").warnings.length, 0);

  // And a nonsense one is still refused loudly rather than guessed at.
  const junk = f("whenever");
  assert.equal(junk.features[0].reset, "");
  assert.match(junk.warnings[0], /not a recharge for F/);

  // The companion fields ride only where they mean something.
  const timed = V.normalizeBlock({ name: "X",
    features: [{ name: "Solar Flare", uses: 1, reset: "hours", after: "24 hours" }] });
  assert.equal(timed.features[0].reset, "after");
  assert.equal(timed.features[0].after, "24 hours");

  const die = V.normalizeBlock({ name: "X",
    features: [{ name: "Ghost Step", uses: 1, reset: "recharge" }] });
  assert.equal(die.features[0].rechargeOn, 5);                 // 5–6 unless the note says otherwise
  assert.equal(die.features[0].after, undefined);              // no stray fields
  assert.equal(f("l").features[0].rechargeOn, undefined);
});

// ── CS-108: armour that sets the base AC ────────────────────────────────
test("a block can set a base AC, with a cap and a second ability", () => {
  const b = spec => V.normalizeBlock({ name: "Armour", baseAc: spec }).item.baseAc;
  assert.deepEqual(b({ base: 13, from: "dex" }), { base: 13, from: "dex" });
  assert.deepEqual(b({ base: 20 }), { base: 20 });
  assert.deepEqual(b({ base: 20, from: "dex", cap: 2 }), { base: 20, from: "dex", cap: 2 });
  assert.deepEqual(b({ base: 12, from: "int", from2: "wis" }),
    { base: 12, from: "int", from2: "wis" });

  // No number means no base: the player's own AC stands, and they are told.
  const none = V.normalizeBlock({ name: "X", baseAc: { from: "dex" } });
  assert.equal(none.item.baseAc, undefined);
  assert.match(none.warnings[0], /base AC has no number/);

  // A score the sheet cannot read is dropped from the total, and the base survives.
  const bad = V.normalizeBlock({ name: "X", baseAc: { base: 13, from: "evil" } });
  assert.deepEqual(bad.item.baseAc, { base: 13 });
  assert.match(bad.warnings[0], /not a score a base AC can read/);

  // An item that says nothing about AC carries no field at all.
  assert.equal(V.normalizeBlock({ name: "Rope" }).item.baseAc, undefined);
});

// ── CS-087: steps ───────────────────────────────────────────────────────
test("an attack's steps are read, sorted and checked", () => {
  const { attacks, warnings } = V.normalizeBlock({ name: "Ring of Dual Flow", attacks: [
    { name: "Arcane-Assault Link", damage: "1d8", type: "force",
      steps: [{ at: 17, damage: "3d8" }, { at: 11, damage: "2d8" }] },
  ] });
  // Sorted on the way in, so nothing downstream has to.
  assert.deepEqual(attacks[0].steps, [{ at: 11, damage: "2d8" }, { at: 17, damage: "3d8" }]);
  assert.equal(warnings.length, 0);

  // A step with no level cannot be placed, so it is dropped and reported.
  const nolevel = V.normalizeBlock({ name: "X",
    attacks: [{ name: "A", damage: "1d6", steps: [{ damage: "2d6" }] }] });
  assert.equal(nolevel.attacks[0].steps, undefined);
  assert.match(nolevel.warnings[0], /names no level/);

  // An attack with no steps carries no field.
  assert.equal(V.normalizeBlock({ name: "X",
    attacks: [{ name: "A", damage: "1d6" }] }).attacks[0].steps, undefined);
});

// ── CS-104: a defence the item grants ───────────────────────────────────
test("an item can grant a defence, written the way a rulebook words it", () => {
  const { item, warnings } = V.normalizeBlock({ name: "Steeldoor Harness", defences: [
    { type: "bludgeoning", standing: "resistance" },
    { type: "slashing", standing: "resistant" },
    { type: "fire", as: "immunity" },
    { type: "radiant", standing: "vulnerability" },
  ] });
  assert.deepEqual(item.defences, [
    { type: "bludgeoning", standing: "resistant" },
    { type: "slashing", standing: "resistant" },
    { type: "fire", standing: "immune" },
    { type: "radiant", standing: "vulnerable" },
  ]);
  assert.equal(warnings.length, 0);

  // A type or a standing the sheet does not know is dropped and reported, never guessed.
  const bad = V.normalizeBlock({ name: "X", defences: [
    { type: "sadness", standing: "resistant" },
    { type: "fire", standing: "quite good against" },
  ] });
  assert.deepEqual(bad.item.defences, []);
  assert.match(bad.warnings[0], /not a damage type/);
  assert.match(bad.warnings[1], /not a standing/);
});

test("an item with no charges says so by having none, not by having zero", () => {
  assert.equal(V.normalizeBlock({ name: "Plain Rope" }).item.charges, null);
  assert.equal(V.normalizeBlock({ name: "Wand", charges: { max: 0 } }).item.charges, null);
});

// ── CS-092: a condition in words ────────────────────────────────────────
test("an effect can carry a condition, and a read never arms it", () => {
  const { item } = V.normalizeBlock({ name: "Solar Scarf", effects: [
    { target: "ac", amount: 2 },
    { target: "saveDc", amount: 1, when: "under the sun" },
    { target: "attack", from: "prof", times: 1, only: "while you carry no shield" },
  ] });
  assert.equal(item.effects[0].when, undefined);
  assert.equal(item.effects[1].when, "under the sun");
  assert.equal(item.effects[2].when, "while you carry no shield");   // `only` is accepted too

  // WHETHER A CONDITION HOLDS IS A FACT ABOUT THIS MOMENT, NOT ABOUT THE ITEM. A note must never
  // be able to switch one on, however it words it.
  for (const e of item.effects) assert.equal(e.on, undefined);
  const forced = V.normalizeBlock({ name: "Cheat",
    effects: [{ target: "ac", amount: 2, when: "always", on: true }] });
  assert.equal(forced.item.effects[0].on, undefined);
});

// ── CS-088: uses sized by a score ───────────────────────────────────────
test("a feature's uses can be a number or a derivation", () => {
  const ok = V.normalizeBlock({ name: "Vambrace", features: [
    { name: "Fixed", uses: 3 },
    { name: "Derived", uses: { from: "prof" } },
    { name: "Scaled", uses: { from: "cha", times: 2 } },
  ] });
  assert.equal(ok.features[0].uses, 3);
  assert.deepEqual(ok.features[1].uses, { from: "prof", times: 1 });
  assert.deepEqual(ok.features[2].uses, { from: "cha", times: 2 });
  assert.equal(ok.warnings.length, 0);

  // A score the sheet cannot derive from is refused loudly, and the feature keeps no pips rather
  // than a wrong count — the same rule the effects follow.
  const bad = V.normalizeBlock({ name: "X",
    features: [{ name: "Evil", uses: { from: "evil" } }] });
  assert.equal(bad.features[0].uses, 0);
  assert.match(bad.warnings[0], /not a score Evil's uses can come from/);

  // A multiplier the engine does not have is snapped and reported, not silently rounded. 1.5 sits
  // exactly between ×1 and ×2, and the tie goes to the LOWER — a block asking for something the
  // sheet cannot do should not end up granting more than it asked for.
  const odd = V.normalizeBlock({ name: "Y",
    features: [{ name: "Odd", uses: { from: "prof", times: 1.5 } }] });
  assert.deepEqual(odd.features[0].uses, { from: "prof", times: 1 });
  assert.match(odd.warnings[0], /half, once, twice or three times/);
});

// ── CS-093: the feature's own save DC ───────────────────────────────────
test("a feature can carry its own save DC, clamped and never confused with yours", () => {
  const { features, item } = V.normalizeBlock({ name: "Steeldoor Harness",
    effects: [{ target: "saveDc", amount: 1 }],
    features: [
      { name: "Fail-Safe", dc: 16 },
      { name: "Spelled out", saveDc: 22 },
      { name: "Nonsense", dc: 400 },
      { name: "None" },
    ] });
  assert.equal(features[0].dc, 16);
  assert.equal(features[1].dc, 22);
  assert.equal(features[2].dc, 40);                 // clamped, not dropped
  assert.equal(features[3].dc, 0);                  // absent means absent

  // The two must not bleed into each other: the item's own effect still targets the CHARACTER's
  // spell save DC, and the features' numbers are theirs alone.
  assert.deepEqual(item.effects, [{ target: "saveDc", amount: 1 }]);
});
