// Turns the vault's own `Homebrew/` folder into compendium entries, and folds its class material
// into a bundle built from the books.
//
//   node sheet/tools/build-homebrew.mjs <vault Homebrew folder> [--base book-bundle.json] [--out x.json]
//
// WHY THIS IS SEPARATE FROM build-compendium.mjs. That one reads Fight Club XML, where a feature's
// level is an attribute and nothing has to be guessed. This reads Obsidian notes written by hand
// over several years, in at least three heading conventions, by someone who was writing for a human
// reader and not for a parser. So it is deliberately conservative: it converts what the note
// actually states and REPORTS everything it could not place, rather than inventing a level.
//
// WHAT IT PRODUCES.
//   Feats       — one per file in Homebrew/Feats/. The cleanest mapping in the vault.
//   Subclasses  — Homebrew/Classes/<Class>/Subclasses/<Name>.md becomes optional features on that
//                 class, named `<Name>: <Feature>`, which is the convention rules.js reads to offer
//                 an archetype and then grant everything it brings as the levels come.
//   Variants    — Homebrew/Classes/<Class>/<Ephemerian|Heroic> <Class>.md is NOT an archetype: it
//                 adds to or replaces features on the base class itself (Juan, 2026-10-27), so its
//                 features are non-optional and land on the class for everyone playing it.
//
// WHAT IT REFUSES TO DO. A feature whose note never says which level it arrives at is left out and
// listed in the report. Putting it at level 1 would hand a 3rd-level Barbarian a 20th-level feature;
// guessing a level is worse than saying so.

import { readdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { mergeClassDefs, KINDS } from "../js/fc5e.mjs";

const args = process.argv.slice(2);
const flag = n => { const i = args.indexOf(n); return i < 0 ? null : args[i + 1]; };
const HOME = args.find(a => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--base" && args[args.indexOf(a) - 1] !== "--out");
if (!HOME) {
  console.error("Usage: node sheet/tools/build-homebrew.mjs <Homebrew folder> [--base bundle.json] [--out out.json]");
  process.exit(1);
}
const BASE = flag("--base");
const OUT = flag("--out") || path.join(path.dirname(BASE || HOME), "compendium-bundle.json");

// A campaign archetype that deliberately overrides a published one of the same name. Listed rather
// than inferred: a collision is a ruling, not a coincidence, and it should be visible in the diff.
const REPLACES = ["School of Necromancy"];

// ── reading a note ──────────────────────────────────────────────────────
// Obsidian markdown into the plain text a sheet shows. Bold and italics carry no meaning once the
// text is in a feature card, a wikilink's target is not reachable from the app, and a tag line is
// vault furniture rather than rules.
// What a player should read on a feature card. Four heading conventions grew in this vault over
// several years — `#### Name` with a marker line under it, `### 3rd Level — Name`,
// `## Level 2 — Name`, and `### 📖 Level 3 – _Name_` — and all four mean the same thing.
const cleanName = s => String(s)
  .replace(/^[^\p{L}\p{N}(]+/u, "")                                  // emoji, bullets, bold marks
  .replace(/^(?:Level\s*\d+|\d+\s*(?:st|nd|rd|th)\s+Level)\s*[-–—:.]\s*/i, "")
  .replace(/[*_`]/g, "")
  .replace(/\s*[.:]\s*$/, "")
  .trim();

function plain(s) {
  return String(s)
    // "*2nd level feature*" is the note telling a reader what the sheet now knows from the level it
    // was filed under. Keeping it would print the level twice on every card.
    .replace(/^\s*\*?\s*\d{1,2}\s*(?:st|nd|rd|th)\s+level\s+feature\.?\s*\*?\s*$/gim, "")
    .replace(/^\s*(tags|type|class|source|aliases)::.*$/gim, "")     // dataview furniture
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/^\s*(_{3,}|-{3,}|\*{3,})\s*$/gm, "")                   // horizontal rules
    .replace(/^\s*#[A-Za-z][\w/-]*\s*$/gm, "")                       // a bare #Feat tag line
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1$2")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// A feature heading is `##` to `####`. Deeper ones are parts OF a feature, not features: Heroic
// Barbarian's five rage forms sit under "Rage Forms" as `######`, and lifting them out would turn
// one feature into six that each say half of it.
const HEADING = /^(#{2,4})\s+(.*\S)\s*$/;
const SUBHEADING = /^#{5,6}\s+(.*\S)\s*$/;

// Headings that are about the note rather than in the game. A subclass summary table and a block of
// design notes are for Juan, and would read as features a character had.
const NOT_A_FEATURE = /^(lore|overview|summary|design notes?|dm reference|credits?|notes?|table|subclass summary|flavou?r|introduction|description|changelog|history)\b/i;

// The level a feature arrives at, taken only from where a note actually declares one. Checked in
// order of how much the note means it, and never from deep in the prose — "you may later reach 17th
// level" inside a 6th-level feature is a sentence, not a heading.
function levelOf(headingText, bodyLines) {
  const inHeading = /\bLevel\s+(\d{1,2})\b/i.exec(headingText) || /(\d{1,2})\s*(?:st|nd|rd|th)\s+level/i.exec(headingText);
  if (inHeading) return Number(inHeading[1]);
  for (const line of bodyLines.slice(0, 2)) {                        // the marker line, or the first sentence
    const t = line.trim();
    if (!t) continue;
    const m = /(\d{1,2})\s*(?:st|nd|rd|th)\s+level/i.exec(t) || /^\*?\s*Level\s+(\d{1,2})/i.exec(t);
    if (m) return Number(m[1]);
    break;                                                            // only the first non-empty line counts
  }
  return null;
}

// Every `#### Heading` in a note, with its body and the level it declares.
function sections(text) {
  const out = [];
  let cur = null;
  for (const line of text.split(/\r?\n/)) {
    const h = HEADING.exec(line);
    if (h) {
      // `raw` keeps the heading as written, because "## Level 2 — Arcanobiological Insight" declares
      // its level there and nowhere else; `name` is what a player should read on the card.
      cur = { raw: h[2], name: cleanName(h[2]), lines: [] };
      out.push(cur);
      continue;
    }
    const sub = SUBHEADING.exec(line);
    if (sub && cur) { cur.lines.push(`${sub[1]}:`); continue; }      // folded into its parent's body
    if (cur) cur.lines.push(line);
  }
  return out
    .map(s => ({ name: s.name, level: levelOf(s.raw, s.lines), text: plain(s.lines.join("\n")) }))
    .filter(s => s.name && !NOT_A_FEATURE.test(s.name) && s.text.length > 40);
}

async function* walk(dir) {
  let items;
  try { items = await readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const e of items) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.name.endsWith(".md")) yield p;
  }
}

// ── feats ───────────────────────────────────────────────────────────────
const feats = [];
for await (const file of walk(path.join(HOME, "Feats"))) {
  const raw = await readFile(file, "utf8");
  const name = path.basename(file, ".md");
  const pre = /^\s*\*?\s*prerequisite\s*:?\s*(.+?)\*?\s*$/im.exec(raw);
  const text = plain(raw.replace(/^\s*\*?\s*prerequisite\s*:.*$/im, ""));
  if (text.length < 40) { console.error(`  thin, skipped: ${name}`); continue; }
  feats.push({ kind: "feat", name, source: "Ephemer Homebrew",
    data: { name, ...(pre ? { prerequisite: pre[1].trim().replace(/\*+$/, "") } : {}), text } });
}

// ── classes: variants and subclasses ────────────────────────────────────
const classes = new Map();          // class name -> def shaped like fc5e's klass()
const unplaced = [];                // what could not be given a level
const report = [];

const addFeature = (className, level, feature) => {
  if (!classes.has(className)) classes.set(className, { name: className, levels: {} });
  const levels = classes.get(className).levels;
  const row = levels[level] || (levels[level] = {});
  (row.features || (row.features = [])).push(feature);
};

for await (const file of walk(path.join(HOME, "Classes"))) {
  const rel = path.relative(path.join(HOME, "Classes"), file);
  const parts = rel.split(path.sep);
  const className = parts[0];
  const title = path.basename(file, ".md");
  // "Sublclasses" is how one of the folders is actually spelled, and renaming Juan's vault to suit a
  // parser would be the wrong way round.
  const isSubclass = parts.some(p => /^sub-?l?classes$/i.test(p) || /^subclasses$/i.test(p) || /sublclass/i.test(p));

  const found = sections(await readFile(file, "utf8"));
  const placed = [], missing = [];
  for (const s of found) {
    if (s.level == null) { missing.push(s.name); continue; }
    addFeature(className, s.level, isSubclass
      // An archetype's features carry its name, which is what rules.js reads to offer it and then
      // grant everything it brings as the levels come.
      ? { name: `${title}: ${s.name}`, text: s.text, optional: true }
      // A variant is the class, not a choice within it, so its features are everyone's.
      : { name: s.name, text: s.text });
    placed.push(s.name);
  }
  report.push({ file: rel, className, title, kind: isSubclass ? "subclass" : "variant",
    placed: placed.length, missing });
  for (const m of missing) unplaced.push({ file: rel, feature: m, kind: isSubclass ? "subclass" : "variant" });
}

// ── fold into the books, if a base bundle was given ─────────────────────
let entries = [...feats];
let base = null;
if (BASE) {
  base = JSON.parse(await readFile(BASE, "utf8"));
  const byKey = new Map(base.entries.map(e => [`${e.kind}:${e.name.toLowerCase()}`, e]));
  for (const [name, def] of classes) {
    const key = `class:${name.toLowerCase()}`;
    const have = byKey.get(key);
    if (have) {
      have.data = mergeClassDefs(have.data, def, { replaceGroups: REPLACES });
      have.books = [...new Set([...(have.books || []), "Ephemer Homebrew"])];
    } else {
      byKey.set(key, { kind: "class", name, source: "Ephemer Homebrew",
        books: ["Ephemer Homebrew"], data: def });
    }
  }
  // The homebrew feats join the books' own, replacing a published one of the same name.
  for (const f of feats) byKey.set(`feat:${f.name.toLowerCase()}`, f);
  entries = [...byKey.values()];
} else {
  for (const [name, def] of classes)
    entries.push({ kind: "class", name, source: "Ephemer Homebrew", books: ["Ephemer Homebrew"], data: def });
}

const counts = Object.fromEntries(KINDS.map(k => [k, entries.filter(e => e.kind === k).length]));
await writeFile(OUT, JSON.stringify({
  schema: 1,
  collection: BASE ? `${base.collection} + Ephemer Homebrew` : "Ephemer Homebrew",
  builtAt: new Date().toISOString().slice(0, 10),
  counts, entries,
}), "utf8");

// ── what happened ───────────────────────────────────────────────────────
console.log(`Feats          ${feats.length}`);
console.log(`Class notes    ${report.length}\n`);
for (const r of report)
  console.log(`  ${r.kind.padEnd(8)} ${r.title.padEnd(26)} ${String(r.placed).padStart(2)} placed` +
    (r.missing.length ? `, ${r.missing.length} with no level` : ""));

if (unplaced.length) {
  console.log(`\n${unplaced.length} features state no level and were left out:`);
  let last = "";
  for (const u of unplaced) {
    if (u.file !== last) { console.log(`\n  ${u.file}`); last = u.file; }
    console.log(`      ${u.feature}`);
  }
  console.log(`\n  Add a line like "*6th level feature*" under the heading and run this again.`);
}

// A checklist in the vault's own idiom, so the next pass is a matter of ticking things off rather
// than reading a terminal that scrolled away. Regenerated on every run, so it never goes stale.
const REPORT = flag("--report");
if (REPORT) {
  const byFile = new Map();
  for (const u of unplaced) {
    if (!byFile.has(u.file)) byFile.set(u.file, []);
    byFile.get(u.file).push(u.feature);
  }
  const lines = [
    `# Homebrew — features still needing a level`,
    ``,
    `Generated by \`sheet/tools/build-homebrew.mjs\` on ${new Date().toISOString().slice(0, 10)}. **Regenerated every run — do not hand-edit.**`,
    ``,
    `**${entries.filter(e => e.kind === "feat" && e.source === "Ephemer Homebrew").length} feats** and **${report.reduce((n, r) => n + r.placed, 0)} class features** converted cleanly.`,
    `The ${unplaced.length} below were left out because their note never says which level they arrive at —`,
    `placing them at level 1 would hand a 3rd-level character a 20th-level feature.`,
    ``,
    `**The fix is one line under the heading**, in any of the shapes the vault already uses:`,
    `\`*6th level feature*\` · \`### 6th Level — Name\` · \`## Level 6 — Name\`. Then run the tool again.`,
    ``,
  ];
  for (const [file, feats] of byFile) {
    const r = report.find(x => x.file === file);
    lines.push(`## ${file.replace(/\\/g, "/")}`);
    lines.push(`*${r.kind}${r.placed ? ` · ${r.placed} already placed` : " · nothing placed yet"}*`);
    lines.push(``);
    for (const f of feats) lines.push(`- [ ] ${f}`);
    lines.push(``);
  }
  await writeFile(REPORT, lines.join("\n"), "utf8");
  console.log(`\nChecklist written to ${REPORT}`);
}
console.log(`\n${OUT}  ${((await stat(OUT)).size / 1024 / 1024).toFixed(1)} MB`);
console.log(`  ${entries.length} entries: ${Object.entries(counts).filter(([, n]) => n).map(([k, n]) => `${n} ${k}`).join(", ")}`);
console.log("Upload it in Admin -> Compendium. Do not commit it.");
