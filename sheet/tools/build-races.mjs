// Turns the vault's own `Worldbuilding/Races/` notes into compendium ancestries.
//
//   node sheet/tools/build-races.mjs <vault Worldbuilding/Races folder> [--base bundle.json] [--out x.json]
//
// WHY THIS IS A THIRD TOOL. `build-compendium.mjs` reads Fight Club XML, where everything is an
// attribute. `build-homebrew.mjs` crawls `Homebrew/` and converts every file it finds, because that
// folder is one file per feat and one file per subclass — the shape is the convention.
//
// `Worldbuilding/Races/` is not that folder. It is thirty-six notes written over five years, of
// which most are lore, several are empty, and a good few are creature stat blocks rather than
// ancestries anyone can play. Crawling it would produce a catalogue offering "Monsters" and
// "Nightmares" as ancestries and a Gen-One Dragonborn with 230 hit points.
//
// So this one is RECIPE-DRIVEN. `RACES` below names the notes that hold a playable ancestry and the
// section of each that holds its rules; `NOT_YET` names every other note in the folder and says why
// it is not here. Both lists are checked against the folder on every run — a note that appears in
// neither is reported as unclassified rather than silently dropped. The judgement is in this file,
// where it can be read and argued with; the parsing underneath is generic.
//
// ABILITY SCORES. Ephemer does not use fixed racial ability scores (Juan, 2026-10-28): a player
// takes +2 to one score and +1 to another, whatever their ancestry. That is why several of these
// notes state no Ability Score Increase at all — and why the ones that DO state one have it recorded
// as what the folk tend toward rather than written into the entry as a modifier the sheet applies.
//
// The output is a bundle like the other two write, uploaded in Admin -> Compendium, and NOT
// committed — `.gitignore` catches `*-compendium-bundle.json`.

import { readdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { KINDS } from "../js/fc5e.mjs";

const args = process.argv.slice(2);
const flag = n => { const i = args.indexOf(n); return i < 0 ? null : args[i + 1]; };
const positional = args.filter((a, i) => !a.startsWith("--") && !String(args[i - 1] || "").startsWith("--"));
const DIR = positional[0];
if (!DIR) {
  console.error("Usage: node sheet/tools/build-races.mjs <Worldbuilding/Races folder> [--base bundle.json] [--out out.json]");
  process.exit(1);
}
const BASE = flag("--base");
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = flag("--out")
  || (BASE ? path.join(path.dirname(BASE), "compendium-bundle.json")
           : path.join(REPO, "races-compendium-bundle.json"));

// ── the campaign's own rule on ability scores ───────────────────────────
const ABILITY_LINE = "+2 and +1 of your choice";
const ABILITY_TEXT =
  "Ephemer does not fix an ancestry's ability scores. Increase one ability score of your choice " +
  "by 2, and a different one of your choice by 1. Nobody at this table has to build around the " +
  "folk they were born to.";

// ── which notes hold a playable ancestry, and where ─────────────────────
// `from` and `to` are matched against whole lines, so a section can begin at a heading or at a bare
// line — "Tieflings Traits" in the oldest note here is neither bold nor a heading.
//
// `groups` marks a line that is a HEADER OVER the traits that follow rather than a trait itself.
// Three Maelum lineages each define a "Hellish Resistance" and an "Innate Spellcasting", so without
// this they collide and the catalogue keeps whichever was read last; with it they land as
// "Scorching: Hellish Resistance", which is the same convention `build-homebrew.mjs` uses for an
// archetype's features.
//
// `extras` pulls one whole section out of ANOTHER note and adds it as a single trait, body intact.
const RACES = [
  {
    name: "Ephemerian Azure",
    file: "Azure.md",
    // Two trait blocks exist in this note: a bulleted "Azure Template" summary and this one. They
    // say the same things; this is the one written in rules voice, and its bold labels are intact
    // (the summary's are broken across lines by the editor that wrote them).
    from: /^##\s+\*\*Azure Race\*\*\s*$/,
    to: /^##\s/,
  },
  {
    name: "Ephemerian Drow Elf",
    file: "Drow Elves.md",
    from: /^###\s+Racial Traits\s*$/,
    to: /^##\s/,
  },
  {
    // The Oath-Sworn of the Third Descent. Everything the Drow entry has, plus the racial Cognition
    // that its own note gives them. Kept as a second ancestry rather than folded into the first,
    // because `Drow Elves.md` marks Warden's Mark "(If Oath-Sworn)" and not every Drow has sworn.
    name: "Ephemerian Warden Drow Elf",
    file: "Drow Elves.md",
    from: /^###\s+Racial Traits\s*$/,
    to: /^##\s/,
    extras: [{ file: "Warden Drow Elf.md", name: "The Eternal Ember",
      from: /^###\s+The Eternal Ember\s*$/, to: /^###\s/ }],
  },
  {
    name: "Ephemerian Puppet",
    file: "Puppet.md",
    from: /^###\s+Racial Traits\s*$/,
    to: /^##\s/,
  },
  {
    name: "Ephemerian Tiefling",
    file: "Tieflings.md",
    // The note opens with the 2014 Player's Handbook tiefling pasted in for reference and then
    // states Ephemer's own below it. This starts at Ephemer's.
    from: /^Tieflings Traits\s*$/,
    groups: [
      { match: /^Scorching$/i, prefix: "Scorching" },
      { match: /^Penumbral$/i, prefix: "Penumbral" },
      { match: /^Kindred$/i, prefix: "Kindred" },
    ],
  },
  {
    // One of one: Salomon's constructed body, treated by the note as a racial reassignment. It is
    // here because the sheet needs somewhere to put it, not because anyone else may pick it.
    name: "Ephemerian Lev'nali",
    file: "The Lev'nali.md",
    from: /^##\s+GAME STATISTICS \(5e\)\s*$/,
    groups: [{ match: /^DETRIMENTS/i, prefix: "Detriment" }],
  },
];

// ── and why every other note in the folder is not here ──────────────────
// Checked against the folder on every run, so this cannot quietly go stale.
const NOT_YET = {
  "Ardling.md": "one line of lore",
  "Demi Elves.md": "hair colour and two images",
  "Demons.md": "a creature template — 'Creating a Demon', not a playable folk",
  "Deviant.md": "empty",
  "Dragonborns.md": "Gen-One stat template, CR 14-17 — a stat block, not an ancestry",
  "Dragons.md": "lore and an in-world treatise",
  "Dwarves.md": "One D&D playtest text, verbatim — the SRD dwarf already ships with the app",
  "Elves.md": "One D&D playtest text, verbatim — the SRD elf already ships with the app",
  "Erudite.md": "images only",
  "Faunus.md": "empty",
  "Fey.md": "lore",
  "Genasi.md": "one line of lore",
  "Giants.md": "history and shared traits in prose — no rules block",
  "Gnomes.md": "One D&D playtest text, verbatim — the SRD gnome already ships with the app",
  "Gods.md": "three words",
  "Hag.md": "lore",
  "Halflings.md": "a stub: two canon points, no size, speed or traits",
  "Humans.md": "One D&D playtest text, verbatim — the SRD human already ships with the app",
  "Merfolk.md": "empty",
  "Monsters.md": "cosmology of how monsters are made",
  "Nachtphyrs.md": "empty",
  "Nightmares.md": "a creature template with tiers and optional traits",
  "Orcs.md": "one line of lore",
  "Primordials.md": "empty",
  "Reverian.md": "empty",
  "The Arts of the Coven.md": "witch rules and stat-block templates — not an ancestry",
  "Titans.md": "two lines of lore",
  "Warden Drow Elf.md": "read by Ephemerian Warden Drow Elf, above",
  "Warforged.md": "one line of lore",
  "Witchdom/Witch Coven Trees.md": "genealogy",
  "Witchdom/Witches.md": "lore",
};

// ── markdown into the plain text a feature card shows ───────────────────
// Deliberately its own copy rather than shared with `build-homebrew.mjs`: these notes carry tables,
// embedded images and Obsidian callouts that the Homebrew folder does not, and quietly widening
// that tool's cleaner would change a bundle that is already built and known good.
// `[ \t]*` and never `\s*` on a line-anchored rule: `\s` matches a newline, so `^\s*\|(.*)\|\s*$`
// over a table swallowed the blank line after the header row and welded two rows into one.
const plain = s => String(s)
  .replace(/^[ \t]*!\[\[[^\]]*\]\][ \t]*$/gm, "")                  // embedded image
  .replace(/^[ \t]*!\[[^\]]*\]\([^)]*\)[ \t]*$/gm, "")             // embedded image, markdown form
  .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")                   // wikilink with a label
  .replace(/\[\[([^\]]+)\]\]/g, "$1")
  .replace(/^[ \t]*>[ \t]?\[!\w+\][^\n]*$/gm, "")                  // a callout's own first line
  .replace(/^[ \t]*>[ \t]?/gm, "")                                 // and its quoting
  .replace(/^[ \t]*\|?[ \t:|-]*-[ \t:|-]*\|[ \t:|-]*$/gm, "")      // a table's separator row
  .replace(/^[ \t]*\|(.*)\|[ \t]*$/gm, (_, row) => row.trim())     // a table row, pipes kept inside
  .replace(/^[ \t]*(_{3,}|-{3,}|\*{3,})[ \t]*$/gm, "")             // horizontal rules
  .replace(/^[ \t]*#[A-Za-z][\w/-]*(?:[ \t]+#[A-Za-z][\w/-]*)*[ \t]*$/gm, "")   // a tag line
  .replace(/^[ \t]*\*+[ \t]*$/gm, "")                              // a stray bold mark on its own
  // "As a Tiefling, you have these special traits" introduces the list; it is not part of whatever
  // trait happens to sit above it.
  .replace(/^[ \t]*As an? [^,\n]{2,30}, you have these special traits\.?[ \t]*$/gim, "")
  .replace(/`([^`]+)`/g, "$1")
  .replace(/\*\*([^*]+)\*\*/g, "$1")
  .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1$2")
  .replace(/[ \t]+$/gm, "")
  .replace(/\n{3,}/g, "\n\n")
  .trim();

// What a trait is called, once the heading's furniture is off it. `### Soul Resonance `Active ·
// 1/Long Rest`` keeps its tag, in brackets, because when a thing may be used is part of its name on
// a card — but `**Darkvision.**` and `**Size:**` lose their punctuation.
function traitName(raw) {
  const m = /^(.*?)\s*`([^`]+)`\s*$/.exec(raw.trim());
  const base = (m ? m[1] : raw).replace(/[*_]/g, "").replace(/\s*[.:]\s*$/, "").trim();
  return m ? `${base} (${m[2].trim()})` : base;
}

// A line that starts a trait: a heading, or a bold lead-in with or without its text beside it.
const HEADING = /^#{2,6}\s+(.*\S)\s*$/;
const BOLD_LEAD = /^\*\*(.{2,70}?)\*\*\s*[:.]?\s*(.*)$/;
const BOLD_LEAD_IN = /^\*\*(.{2,70}?)[:.]\*\*\s*(.*)$/;

function startsTrait(line) {
  const h = HEADING.exec(line);
  if (h) return { raw: h[1], rest: "" };
  const b = BOLD_LEAD_IN.exec(line) || BOLD_LEAD.exec(line);
  // "**Size:** Medium · **Speed:** 30 ft." is one line holding two labels; it still starts at Size,
  // and the rest of the line stays in Size's body where a reader will find both.
  if (b) return { raw: b[1], rest: b[2] || "" };
  return null;
}

// The lines of one section, from the line after `from` up to but not including `to`.
function slice(lines, from, to) {
  const start = lines.findIndex(l => from.test(l));
  if (start < 0) return null;
  const rest = lines.slice(start + 1);
  const end = to ? rest.findIndex(l => to.test(l)) : -1;
  return end < 0 ? rest : rest.slice(0, end);
}

// A section into traits. Anything before the first trait begins is the section's own preamble —
// "As a Tiefling, you have these special traits" — and belongs to no trait, so it is dropped.
function traitsOf(lines, groups = []) {
  const out = [];
  let cur = null, prefix = "";
  for (const line of lines) {
    const start = startsTrait(line);
    if (start) {
      const name = traitName(start.raw);
      const group = groups.find(g => g.match.test(name));
      if (group) { prefix = group.prefix; cur = null; continue; }
      cur = { name: prefix ? `${prefix}: ${name}` : name, lines: start.rest ? [start.rest] : [] };
      out.push(cur);
      continue;
    }
    if (cur) cur.lines.push(line);
  }
  return out
    .map(t => ({ name: t.name, text: plain(t.lines.join("\n")) }))
    .filter(t => t.name && t.text);
}

const SIZE = [[/\btiny\b/i, "T"], [/\bsmall\b/i, "S"], [/\bmedium\b/i, "M"],
  [/\blarge\b/i, "L"], [/\bhuge\b/i, "H"], [/\bgargantuan\b/i, "G"]];
// The FIRST size the line names, not the first this table lists: the Ephemerian tiefling is
// "Medium (about 4-7 feet tall) or Small (about 2-4 feet tall), chosen when you select this Race",
// and reading that table in order would make every one of them Small.
const sizeOf = traits => {
  const t = traits.find(x => /^size\b/i.test(x.name));
  if (!t) return null;
  let best = null, at = Infinity;
  for (const [re, code] of SIZE) {
    const m = re.exec(t.text);
    if (m && m.index < at) { at = m.index; best = code; }
  }
  return best;
};
const speedOf = traits => {
  const t = traits.find(x => /^speed\b/i.test(x.name)) || traits.find(x => /^size\b/i.test(x.name));
  const m = t && /(\d{2,3})\s*(?:ft|feet)/i.exec(t.text);
  return m ? Number(m[1]) : null;
};

// ── build ───────────────────────────────────────────────────────────────
const read = async file => (await readFile(path.join(DIR, file), "utf8")).split(/\r?\n/);
const entries = [];
const report = [];

for (const r of RACES) {
  let lines;
  try { lines = await read(r.file); }
  catch { console.error(`  missing: ${r.file}`); continue; }

  const body = slice(lines, r.from, r.to);
  if (!body) { console.error(`  ${r.file}: no section matched ${r.from}`); continue; }

  const found = traitsOf(body, r.groups);

  // The note's own Ability Score Increase, if it states one, becomes a line inside the campaign's
  // rule instead of a trait of its own — it is colour now, not arithmetic.
  const stated = found.find(t => /^ability score increase/i.test(t.name));
  const traits = found.filter(t => t !== stated);

  for (const x of r.extras || []) {
    const extraLines = slice(await read(x.file), x.from, x.to);
    if (!extraLines) { console.error(`  ${x.file}: no section matched ${x.from}`); continue; }
    const text = plain(extraLines.join("\n"));
    if (text) traits.push({ name: x.name, text });
  }

  traits.unshift({
    name: "Ability Scores",
    text: stated
      ? `${ABILITY_TEXT}\n\nWhat the ${r.name.replace(/^Ephemerian /, "")} tends toward, for ` +
        `those who want it: ${stated.text.replace(/\n+/g, " ").replace(/\s*-\s*/g, " ").trim()}`
      : ABILITY_TEXT,
  });

  const data = {
    name: r.name,
    ...(sizeOf(traits) ? { size: sizeOf(traits) } : {}),
    ...(speedOf(traits) ? { speed: speedOf(traits) } : {}),
    ability: ABILITY_LINE,
    traits,
  };
  entries.push({ kind: "race", name: r.name, source: "Ephemer Homebrew",
    books: ["Ephemer Homebrew"], data });
  report.push({ name: r.name, file: r.file, traits: traits.length,
    size: data.size || "—", speed: data.speed || "—", stated: !!stated });
}

// ── is the folder still what this file says it is ───────────────────────
async function* walk(dir, base = "") {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) yield* walk(path.join(dir, e.name), rel);
    else if (e.name.endsWith(".md")) yield rel;
  }
}
const known = new Set([...RACES.map(r => r.file), ...Object.keys(NOT_YET)]);
const unclassified = [];
for await (const rel of walk(DIR)) if (!known.has(rel)) unclassified.push(rel);

// ── fold into a base bundle, or stand alone ─────────────────────────────
let all = entries, base = null;
if (BASE) {
  base = JSON.parse(await readFile(BASE, "utf8"));
  const byKey = new Map(base.entries.map(e => [`${e.kind}:${e.name.toLowerCase()}`, e]));
  for (const e of entries) byKey.set(`race:${e.name.toLowerCase()}`, e);
  all = [...byKey.values()];
}

const counts = Object.fromEntries(KINDS.map(k => [k, all.filter(e => e.kind === k).length]));
await writeFile(OUT, JSON.stringify({
  schema: 1,
  collection: BASE ? `${base.collection} + Ephemer Races` : "Ephemer Races",
  builtAt: new Date().toISOString().slice(0, 10),
  counts, entries: all,
}), "utf8");

// ── what happened ───────────────────────────────────────────────────────
console.log(`Ancestries  ${report.length}\n`);
for (const r of report)
  console.log(`  ${r.name.padEnd(28)} ${String(r.traits).padStart(2)} traits  ` +
    `${String(r.size).padEnd(2)} ${String(r.speed).padEnd(3)}  ${r.file}` +
    (r.stated ? "   (its stated ASI kept as colour)" : ""));

console.log(`\nLeft out, on purpose — ${Object.keys(NOT_YET).length} notes:`);
for (const [file, why] of Object.entries(NOT_YET)) console.log(`  ${file.padEnd(28)} ${why}`);

if (unclassified.length) {
  console.log(`\n${unclassified.length} note(s) this tool has never been told about:`);
  for (const f of unclassified) console.log(`      ${f}`);
  console.log(`\n  Add each to RACES or to NOT_YET in this file, then run it again.`);
}

console.log(`\n${OUT}  ${((await stat(OUT)).size / 1024).toFixed(0)} KB`);
console.log(`  ${all.length} entries: ${Object.entries(counts).filter(([, n]) => n).map(([k, n]) => `${n} ${k}`).join(", ")}`);
console.log("Upload it in Admin -> Compendium. Do not commit it.");
