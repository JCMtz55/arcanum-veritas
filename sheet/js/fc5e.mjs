// Reading a Fight Club 5e compendium XML into the shapes the character sheet uses.
//
// Shared on purpose: `sheet/tools/build-srd.mjs` runs it offline over the SRD to produce the JSON
// this repo ships, and the server runs the same code over whatever XML the DM uploads. One parser
// means an imported homebrew class and a committed SRD class cannot end up differently shaped.
//
// The format is loose — children are interleaved rather than grouped, <text> repeats within one
// element, <name> can appear again inside a feature, and only some classes carry <slots> or
// <counter> — so this keeps what it recognises instead of asserting a shape. No dependency: the app
// has three and none of them parse XML.

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
export const decode = s => String(s)
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
  .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);

export function parseXml(xml) {
  const root = { name: "#root", attrs: {}, children: [], text: "" };
  const stack = [root];
  const re = /<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<(\/?)([A-Za-z0-9_:.-]+)((?:\s+[A-Za-z0-9_:.-]+\s*=\s*"[^"]*")*)\s*(\/?)>/g;
  let last = 0, m;
  while ((m = re.exec(xml))) {
    const chunk = xml.slice(last, m.index);
    if (chunk) stack[stack.length - 1].text += chunk;
    last = re.lastIndex;
    if (m[0].startsWith("<?") || m[0].startsWith("<!--")) continue;
    const [, close, name, attrsRaw, selfClose] = m;
    if (close) { if (stack.length > 1) stack.pop(); continue; }
    const attrs = {};
    for (const a of attrsRaw.matchAll(/([A-Za-z0-9_:.-]+)\s*=\s*"([^"]*)"/g)) attrs[a[1]] = decode(a[2]);
    const node = { name, attrs, children: [], text: "" };
    stack[stack.length - 1].children.push(node);
    if (!selfClose) stack.push(node);
  }
  return root;
}

const kids = (node, name) => node.children.filter(c => c.name === name);
const one = (node, name) => node.children.find(c => c.name === name);
const txt = node => decode(node ? node.text : "").trim();
const val = (node, name) => txt(one(node, name));
const num = (node, name) => { const v = val(node, name); return v === "" ? null : (Number(v) ?? null); };
// A repeated <text> is one body with blank lines between its paragraphs.
const body = node => kids(node, "text").map(t => decode(t.text).trim()).join("\n").replace(/\n{3,}/g, "\n\n").trim();
const keep = o => Object.fromEntries(Object.entries(o).filter(([, v]) =>
  v !== null && v !== "" && v !== undefined && !(Array.isArray(v) && !v.length) &&
  !(v && typeof v === "object" && !Array.isArray(v) && !Object.keys(v).length)));

export const SCHOOL = { A: "Abjuration", C: "Conjuration", D: "Divination", EN: "Enchantment",
  EV: "Evocation", I: "Illusion", N: "Necromancy", T: "Transmutation" };

// Fight Club's item types are single letters. Spelling them out here means the sheet never has to.
export const ITEM_TYPE = { LA: "Light armor", MA: "Medium armor", HA: "Heavy armor", S: "Shield",
  M: "Melee weapon", R: "Ranged weapon", A: "Ammunition", RD: "Rod", ST: "Staff", WD: "Wand",
  RG: "Ring", P: "Potion", SC: "Scroll", W: "Wondrous item", G: "Gear", $: "Treasure" };

export const race = n => keep({
  name: val(n, "name"), size: val(n, "size"), speed: num(n, "speed"),
  ability: val(n, "ability"), proficiency: val(n, "proficiency"), spellAbility: val(n, "spellAbility"),
  traits: kids(n, "trait").map(t => keep({ name: val(t, "name"), text: body(t) })),
});

// A class is its scalars plus a map of level -> what that level brings. `scoreImprovement` is kept
// per level rather than flattened away: it is exactly the hook the DM's ASI unlock needs.
export const klass = n => {
  const levels = {};
  for (const al of kids(n, "autolevel")) {
    const lv = Number(al.attrs.level) || 0;
    if (!lv) continue;
    const row = levels[lv] || (levels[lv] = {});
    if (/^yes$/i.test(al.attrs.scoreImprovement || "")) row.scoreImprovement = true;
    for (const f of kids(al, "feature"))
      (row.features || (row.features = [])).push(keep({
        name: val(f, "name"), text: body(f),
        optional: /^yes$/i.test(f.attrs.optional || "") || undefined,
      }));
    const slots = one(al, "slots");
    if (slots) row.slots = txt(slots).split(",").map(s => Number(s.trim()) || 0);
    for (const c of kids(al, "counter"))
      (row.counters || (row.counters = [])).push(keep({
        name: val(c, "name"), value: num(c, "value"), reset: val(c, "reset"),
      }));
  }
  return keep({
    name: val(n, "name"), hd: num(n, "hd"), proficiency: val(n, "proficiency"),
    numSkills: num(n, "numSkills"), armor: val(n, "armor"), weapons: val(n, "weapons"),
    tools: val(n, "tools"), wealth: val(n, "wealth"), spellAbility: val(n, "spellAbility"),
    levels,
  });
};

export const background = n => keep({
  name: val(n, "name"), proficiency: val(n, "proficiency"),
  traits: kids(n, "trait").map(t => keep({ name: val(t, "name"), text: body(t) })),
});

export const feat = n => keep({
  name: val(n, "name"), prerequisite: val(n, "prerequisite"), text: body(n),
  modifiers: kids(n, "modifier").map(m => keep({ category: m.attrs.category, text: txt(m) })),
});

export const spell = n => keep({
  name: val(n, "name"), level: num(n, "level"),
  school: SCHOOL[val(n, "school")] || val(n, "school"),
  ritual: /^yes$/i.test(val(n, "ritual")) || undefined,
  time: val(n, "time"), range: val(n, "range"), components: val(n, "components"),
  duration: val(n, "duration"), classes: val(n, "classes"), text: body(n),
  roll: kids(n, "roll").map(r => txt(r)),
});

export const item = n => keep({
  name: val(n, "name"), type: ITEM_TYPE[val(n, "type")] || val(n, "type") || undefined,
  detail: val(n, "detail"), magic: /^yes$/i.test(val(n, "magic")) || undefined,
  weight: num(n, "weight"), value: num(n, "value"), text: body(n),
  dmg1: val(n, "dmg1"), dmg2: val(n, "dmg2"), dmgType: val(n, "dmgType"),
  property: val(n, "property"), ac: num(n, "ac"), strength: val(n, "strength"),
  stealth: val(n, "stealth"), range: val(n, "range"),
});

// ── Merging a class that several books define ───────────────────────────
// The SRD arrives as one file, so a class is one `<class>` element and nothing has to be joined.
// Every other book does it differently: `class-fighter-phb.xml` carries the whole class, and
// `class-fighter-xge.xml` carries **only** `<name>Fighter</name>` and the new `<autolevel>` rows for
// the archetypes it adds — no hit die, no proficiencies, no slots.
//
// So importing a collection without merging gives you five Fighters, four of them with no hit die,
// and whichever one the catalogue happened to read last. These are joined into one instead: the
// scalars come from the first file that actually states them, and the level rows are unioned.
//
// Two books defining the same level is normal and expected — PHB's Fighter 3 announces the Martial
// Archetype, Xanathar's adds Arcane Archer at the same level — so a level's features concatenate,
// de-duplicated by name so re-importing a corrected file cannot double anything.
// `replaceGroups` is for a campaign variant that OVERRIDES a published archetype rather than adding
// to it: the vault's own School of Necromancy is not the Player's Handbook's, and a Wizard who picks
// it must get five features rather than ten of two different minds. Naming the group drops every
// optional feature of `a` that belongs to it before `b`'s are folded in.
export function mergeClassDefs(a, b, { replaceGroups = [] } = {}) {
  if (!a) return b;
  if (!b) return a;
  const out = { ...a };
  if (replaceGroups.length) {
    const drop = new Set(replaceGroups.map(g => String(g).toLowerCase()));
    const kept = {};
    for (const [lv, row] of Object.entries(a.levels || {})) {
      const features = (row.features || []).filter(f => {
        if (!f?.optional || !f.name) return true;
        const i = String(f.name).indexOf(": ");
        return i < 0 || !drop.has(f.name.slice(0, i).toLowerCase());
      });
      kept[lv] = { ...row, ...(row.features ? { features } : {}) };
    }
    out.levels = kept;
    a = out;
  }
  for (const k of ["hd", "proficiency", "numSkills", "armor", "weapons", "tools", "wealth", "spellAbility"])
    if (out[k] == null || out[k] === "") { if (b[k] != null && b[k] !== "") out[k] = b[k]; }

  const levels = { ...(a.levels || {}) };
  for (const [lv, row] of Object.entries(b.levels || {})) {
    const have = levels[lv];
    if (!have) { levels[lv] = row; continue; }
    const merged = { ...have };
    if (row.scoreImprovement) merged.scoreImprovement = true;
    // Slots and counters are the class's own progression, not an archetype's: the first book to
    // state them owns them, and a later one must not quietly rewrite the spell table.
    if (!merged.slots && row.slots) merged.slots = row.slots;
    if (row.counters) merged.counters = dedupeByName([...(merged.counters || []), ...row.counters]);
    if (row.features) merged.features = dedupeByName([...(merged.features || []), ...row.features]);
    levels[lv] = merged;
  }
  out.levels = levels;
  return out;
}

const dedupeByName = list => {
  const seen = new Map();
  for (const x of list) if (x && x.name && !seen.has(x.name)) seen.set(x.name, x);
  return [...seen.values()];
};

// Monsters are deliberately dropped everywhere: a character sheet has no use for stat blocks, and
// in the SRD they are a third of the payload the table would otherwise download.
export const KINDS = ["race", "class", "background", "feat", "spell", "item"];
const SHAPE = { race, class: klass, background, feat, spell, item };

// Everything a compendium holds, in one pass, sorted so a rebuild produces a clean diff.
export function convert(xml) {
  const root = parseXml(String(xml).replace(/^﻿/, ""));   // PowerShell writes a BOM by default
  const comp = one(root, "compendium") || root;
  const byName = (a, b) => String(a.name).localeCompare(String(b.name));
  const out = {};
  for (const kind of KINDS)
    out[kind] = kids(comp, kind).map(SHAPE[kind]).filter(e => e.name).sort(byName);
  return out;
}
