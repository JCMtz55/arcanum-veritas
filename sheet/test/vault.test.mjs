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

  // Weekly is CS-096 and is not built, so it must be refused loudly rather than silently becoming
  // a long rest — The Compact would come back seven times too often.
  const weekly = f("weekly");
  assert.equal(weekly.features[0].reset, "");
  assert.match(weekly.warnings[0], /not a recharge for F/);
});

test("an item with no charges says so by having none, not by having zero", () => {
  assert.equal(V.normalizeBlock({ name: "Plain Rope" }).item.charges, null);
  assert.equal(V.normalizeBlock({ name: "Wand", charges: { max: 0 } }).item.charges, null);
});
