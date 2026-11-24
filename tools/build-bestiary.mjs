// Build the Enemy Library's seed from the vault's own stat blocks.
//
// The vault is NOT on the server — `stat blocks/*.md` lives next to this repo on the DM's drive and
// never leaves it. So the parsing happens HERE, once, on his machine, and what ships is the JSON it
// writes: server/bestiary.json, which the server seeds `init_library` from on first boot and which
// the library's "Import from the vault" button tops up from afterwards.
//
//   node tools/build-bestiary.mjs              writes server/bestiary.json
//   node tools/build-bestiary.mjs --dry        prints what it found and writes nothing
//   node tools/build-bestiary.mjs --in "D:/elsewhere/stat blocks"
//
// What it takes is only what a row on the board holds — name, hit points, AC, a save DC, an
// initiative modifier, and the two switches. Traits, actions and auras are NOT taken: the stat block
// itself stays the thing the DM reads, in Obsidian, beside the laptop. CR and the subfolder come
// along as the library card's own two lines, and neither is copied onto the board.

import { readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");                        // the Arcanum Veritas repo
const DEFAULT_IN = path.join(ROOT, "..", "stat blocks");   // the vault, one level up
const OUT = path.join(ROOT, "server", "bestiary.json");

const argv = process.argv.slice(2);
const DRY = argv.includes("--dry");
const IN = argv.includes("--in") ? argv[argv.indexOf("--in") + 1] : DEFAULT_IN;

// The campaign's own two lists, kept identical to server.js — a Nightmare's grade and the Vile
// Emotions it is rooted in are canon, and an entry that invents a twenty-fifth emotion would be
// thrown away by the server's own cleaning anyway.
const VILE_EMOTIONS = [
  "Absurdity", "Anxiety", "Apathy", "Deceit", "Despair", "Desperation", "Doubt", "Evasion",
  "Greed", "Hate", "Hypocrisy", "Inferiority", "Jealousy", "Loneliness", "Obsession", "Prejudice",
  "Rashness", "Regret", "Revenge", "Scorn", "Shame", "Slander", "Vanity", "Zealotry",
];
const GRADES = ["Demi-Nightmare", "Nightling", "Recurring Nightmare", "Primordial Nightmare"];

// ── Walking the folder ──────────────────────────────────────
// One level of subfolders is all there is, and each one is a set the DM built together — Briar
// Realm, Prima Nocta, Roses Nightmare. That folder name becomes the card's tag, which is the only
// grouping the library needs: typing "roses" finds the four of them.
async function walk(dir, tag = "") {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(full, tag || e.name));
    else if (e.name.endsWith(".md")) out.push({ file: full, name: e.name.slice(0, -3), tag });
  }
  return out;
}

// ── Reading one of them ─────────────────────────────────────
// Numbers are written four ways across these files, because they were written over two years by
// hand: `**Armor Class** 19 (...)`, `**AC**: 17`, `- **Armor Class** 23`, and `**Hit Points**
// 1,000 (see The Ink)` with a thousands comma. One regex per fact, loose on the punctuation.
const num = s => (s == null ? null : parseInt(String(s).replace(/,/g, ""), 10));

// Six spellings of the same line, across two years of writing by hand:
//
//   **Armor Class** 19 (Reflective Carapace)      Glassling
//   **AC**: 17 (natural armor)                    Krieger
//   ### **Armor Class:** 20                       Carol, colon inside the bold
//   |**AC**|21 (Neuro-Filament Armor)|            Juliet, a two-column table
//   \> - \*\*Armor Class\*\* 20                   King Ivar, markdown escaped by a paste
//   Armor Class 21 (Arcane grafts)                The Vivitect, no bold at all
//
// Rather than six regexes, FLATTEN first: drop the escaping backslashes, drop the emphasis, and
// drop the leading quote/bullet/hash/pipe furniture from every line. What is left is one shape.
const flatten = t => t
  .replace(/\\(?=[*_>#|~`])/g, "")      // \*\* -> **
  .replace(/[*_`]+/g, "")               // emphasis is decoration here, never meaning
  .replace(/^[>\s\-#|]+/gm, "");        // > - ### | furniture, the same on header and data rows

// Two of them put the whole defence line on ONE line — `Armor Class 16 (Dreamborn Hollow) Hit
// Points 112 (15d8 + 45) Speed 40 ft.`, and `AC 17 · HP 120` — so a label is at the start of a line
// OR just after the bracket, middot or comma that ended the fact before it.
const AT = String.raw`(?:^|[)·,;|]\s*)`;
const re = (label, val = String.raw`[\d,]+`) =>
  new RegExp(`${AT}(?:${label})\\s*:?\\s*\\|?\\s*(${val})`, "mi");

const AC_RE = re("Armor Class|AC");
// `Hit Points` and `Detail` (the Reverian word for them — a remembered thing does not bleed) are
// tried before the bare `HP`, because "regains 14 (2d12 + 2) HP" is a sentence in half these files
// and "his HP resets to 300" is in the other half.
const HP_RE = re("Hit Points|Detail");
const HP_RE2 = re("HP");
const CR_RE = re("Challenge|CR", String.raw`[\d/]+`);

// A save DC is the one number on a stat block that is never written down as itself — what is there
// instead is five or six DCs inside the traits. The one the DM wants on the row is the creature's
// own, which in practice is the DC its abilities keep repeating: the Glassling's three DC 16s
// against a single 19 and a single 15. So: the DC that appears most often, the highest on a tie.
function modalDc(body) {
  const seen = new Map();
  for (const m of body.matchAll(/\bDC\s*([\d]{1,2})\b/g)) {
    const v = num(m[1]);
    if (v >= 5 && v <= 40) seen.set(v, (seen.get(v) || 0) + 1);
  }
  if (!seen.size) return null;
  return [...seen.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
}

// Initiative is the modifier, and no stat block states one — what every one of them states is DEX,
// which is the same number. Written as `**DEX** 16 (+3)`, as `DEX 12 (+1)` inside a one-row table,
// or as a bare column under a `| STR | DEX | ... |` header with the modifier in brackets.
function dexMod(body) {
  const direct = /\bDEX\b[^\d\n(]{0,12}(\d+)\s*\(\s*([+\-\u2012-\u2015\u2212]?\s*\d+)\s*\)/i.exec(body);
  if (direct) return signed(direct[2]);
  // The header-and-row shape. Find the header, then the first row under it that holds six brackets.
  const lines = body.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const head = lines[i].split("|").map(c => c.replace(/\*|\s/g, "").toUpperCase());
    if (!(head.includes("STR") && head.includes("DEX"))) continue;
    const col = head.indexOf("DEX");
    for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
      const cells = lines[j].split("|");
      const cell = cells[col];
      if (!cell) continue;
      const m = /\(\s*([+\-\u2012-\u2015\u2212]?\s*\d+)\s*\)/.exec(cell);
      if (m) return signed(m[1]);
    }
  }
  return 0;
}
// Any of the five dashes these files use for a minus, including the en dash in `INT 6 (–2)`.
const signed = s => {
  const t = String(s).replace(/\s/g, "");
  const n = parseInt(t.replace(/^[^\d]+/, ""), 10) || 0;
  return /^[\-\u2012-\u2015\u2212]/.test(t) ? -n : n;
};

// Legendary resistances, written as `(3/Day)` beside the trait's name.
function legendary(body) {
  const m = /Legendary Resistance[s]?\s*\(?\s*(\d+)\s*\/\s*Day/i.exec(body);
  return m ? num(m[1]) : (/\bLegendary Resistance/i.test(body) ? 3 : 0);
}

// Phases. `## Phase Two`, `### Phase 3`, `Phase II` — count the distinct ones named and keep the
// highest, because a block that names Phase Three has three.
function phases(body) {
  const words = { one: 1, two: 2, three: 3, four: 4, five: 5, i: 1, ii: 2, iii: 3, iv: 4, v: 5 };
  let max = 1;
  for (const m of body.matchAll(/\bPhase\s+([A-Za-z]+|\d+)\b/gi)) {
    const t = m[1].toLowerCase();
    const n = /^\d+$/.test(t) ? parseInt(t, 10) : words[t];
    if (n && n <= 6) max = Math.max(max, n);
  }
  return max;
}

// Frontmatter, on the newest files only. `root_vile_emotion:` and a `tags:` list that says `boss`.
function frontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  return m ? m[1] : "";
}

function parse(text, name, tag) {
  const fm = frontmatter(text);
  const flat = flatten(text);

  // An overlay, not a creature: the Reverian templates are applied TO something and have no numbers
  // of their own, so the examples inside them must not walk into the library as monsters.
  if (/#Template\b/i.test(text) || /\bTemplates?\b/.test(name)) return null;

  const hp = num(HP_RE.exec(flat)?.[1] ?? HP_RE2.exec(flat)?.[1]);
  const ac = num(AC_RE.exec(flat)?.[1]);
  // Not a creature either: a build sheet with no defences (Carlo), or a thing that cannot be
  // destroyed and has no turns (The Door). Both belong in this folder; neither rolls initiative.
  if (hp == null || ac == null) return null;

  // What it is, off the type line: `Medium Nightmare (Nightling), Neutral Evil`.
  const typeLine = /^([A-Z][^\n]{0,80}?(?:Nightmare|Denizen|Humanoid|Beast|Fey|Fiend|Undead|Construct|Aberration|Dragon|Elemental|Giant|Monstrosity|Ooze|Plant|Celestial)[^\n]{0,80})$/mi
    .exec(flat)?.[1] || "";

  const isNightmare = /Nightmare/i.test(typeLine) || /\bNightmare\b/i.test(fm);
  let grade = "";
  if (isNightmare) {
    const hay = `${typeLine} ${fm}`;
    if (/Primordial|Primal/i.test(hay)) grade = "Primordial Nightmare";
    else if (/Recurring/i.test(hay)) grade = "Recurring Nightmare";
    else if (/Demi/i.test(hay)) grade = "Demi-Nightmare";
    else if (/Nightling/i.test(hay)) grade = "Nightling";
  }

  // The Root Vile Emotions. Three spellings across the files, plus the frontmatter key — and Asha
  // carries five of them on one line, separated by middots.
  // `Root Vile Emotion: Vanity`, `Root Emotion: *Shame*`, and the Lode's `Its Root Vile Emotion is
  // Apathy — the winter's numbness`, which is a sentence rather than a field.
  const rootLine = /Root (?:Vile )?Emotions?\s*(?::|is)?\s*([^\n]{0,120})/i.exec(flat)?.[1]
    || /root_vile_emotion\s*:\s*([^\n]+)/i.exec(fm)?.[1] || "";
  const emotions = VILE_EMOTIONS.filter(e => new RegExp(`\\b${e}\\b`, "i").test(rootLine)).slice(0, 6);

  const lr = legendary(flat);
  const ph = phases(flat);
  const isBoss = lr > 0 || ph > 1 || /\btags?\b[\s\S]{0,200}?\bboss\b/i.test(fm);

  const mon = {
    kind: "npc", name,
    img: "", hpMax: hp, hp, tempHp: 0,
    ac, dc: modalDc(flat),
    init: null, initMod: dexMod(flat),
    conditions: [], counters: [], note: "",
    boss: isBoss
      ? { legendary: lr, legendaryMax: lr, phases: ph, phase: 1, turns: 1, inits: [] }
      : null,
    nightmare: isNightmare
      ? { grade, emotions, roots: emotions.length, rootsMax: emotions.length }
      : null,
    hidden: false, down: false,
  };
  return { name, tag, cr: CR_RE.exec(flat)?.[1] || "", mon };
}

// ── Go ──────────────────────────────────────────────────────
const files = (await walk(IN)).sort((a, b) =>
  a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1);

const entries = [], skipped = [];
for (const f of files) {
  const got = parse(await readFile(f.file, "utf8"), f.name, f.tag);
  if (got) entries.push(got); else skipped.push(f.name);
}

if (DRY) {
  const pad = (s, n) => String(s).padEnd(n).slice(0, n);
  for (const e of entries)
    console.log(`${pad(e.name, 34)} ${pad(e.tag, 15)} HP ${pad(e.mon.hpMax, 6)}`
      + `AC ${pad(e.mon.ac, 4)}DC ${pad(e.mon.dc ?? "-", 4)}`
      + `init ${pad((e.mon.initMod >= 0 ? "+" : "") + e.mon.initMod, 5)}`
      + `${pad(e.cr && "CR " + e.cr, 8)}`
      + `${e.mon.boss ? `boss(LR ${e.mon.boss.legendary}, ph ${e.mon.boss.phases}) ` : ""}`
      + `${e.mon.nightmare ? `${e.mon.nightmare.grade || "nightmare"}: ${e.mon.nightmare.emotions.join("/") || "-"}` : ""}`);
  console.log(`\n${entries.length} creatures. Skipped (no AC or no HP): ${skipped.join(", ") || "none"}`);
} else {
  await writeFile(OUT, JSON.stringify({
    builtAt: new Date().toISOString().slice(0, 10),
    from: "stat blocks/",
    entries,
  }, null, 1) + "\n", "utf8");
  console.log(`${entries.length} creatures -> ${path.relative(ROOT, OUT)}`
    + `${skipped.length ? `\nSkipped (no AC or no HP): ${skipped.join(", ")}` : ""}`);
}
