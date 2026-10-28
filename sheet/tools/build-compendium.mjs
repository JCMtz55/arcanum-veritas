// Turns a Fight Club 5e *collection* — a manifest of book files — into one bundle the Admin page
// uploads into a deployment's database.
//
//   node sheet/tools/build-compendium.mjs <collection.xml> <FightClub5eXML-root> [out.json]
//
// WHY THIS EXISTS, AND WHY ITS OUTPUT IS NOT COMMITTED. `build-srd.mjs` beside it converts the one
// openly-licensed file this repo ships. This one converts the books a DM owns, and the requirements
// forbid bundling copyrighted non-SRD material (CS-085) — the app is served to the open internet.
// So the bundle it writes goes into the DM's own deployment through Admin → Compendium and never
// into git. Keep the output out of the repository; `.gitignore` carries a rule for it.
//
// WHY A BUNDLE RATHER THAN POSTING EACH FILE. A class is spread across books: `class-fighter-phb.xml`
// has the whole Fighter, and `class-fighter-xge.xml` has only its name and the archetypes Xanathar's
// adds. Posted one file at a time they land as five separate Fighters, four with no hit die, and the
// catalogue keeps whichever it read last. They have to be merged before anything is written, and
// doing it here — once, offline, where it can be read and tested — beats doing it in a browser.

import { readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { convert, mergeClassDefs, KINDS } from "../js/fc5e.mjs";

const [, , collectionPath, repoRoot, outArg] = process.argv;
if (!collectionPath || !repoRoot) {
  console.error("Usage: node sheet/tools/build-compendium.mjs <collection.xml> <FightClub5eXML-root> [out.json]");
  process.exit(1);
}
const OUT = outArg || path.join(path.dirname(collectionPath), "compendium-bundle.json");

// A bestiary or a vehicle file holds nothing this app reads — the parser drops monsters on purpose
// and vehicles are not one of its kinds — so they are skipped rather than parsed and thrown away.
const SKIP = /^(bestiary|vehicles)-/i;

// The folder a file sits in is the book it came from. Spelled out here because "VolosGuideToMonsters"
// is not what anyone wants to read on a card, and CS-086 asks for the attribution to be kept.
const BOOKS = {
  PlayersHandbook: "Player's Handbook",
  DungeonMastersGuide: "Dungeon Master's Guide",
  MonsterManual: "Monster Manual",
  XanatharsGuideToEverything: "Xanathar's Guide to Everything",
  TashasCauldronOfEverything: "Tasha's Cauldron of Everything",
  MordenkainensTomeOfFoes: "Mordenkainen's Tome of Foes",
  MordenkainensFiendishFolio: "Mordenkainen's Fiendish Folio",
  VolosGuideToMonsters: "Volo's Guide to Monsters",
  SwordCoastAdventurersGuide: "Sword Coast Adventurer's Guide",
  GuildmastersGuideToRavnica: "Guildmaster's Guide to Ravnica",
  EberronRisingFromTheLastWar: "Eberron: Rising from the Last War",
  MythicOdysseysOfTheros: "Mythic Odysseys of Theros",
  ExplorersGuideToWildemount: "Explorer's Guide to Wildemount",
  AcquisitionsIncorporated: "Acquisitions Incorporated",
  PrincesOfTheApocalypse: "Princes of the Apocalypse",
  TheTortlePackage: "The Tortle Package",
  OneGrungAbove: "One Grung Above",
  SystemReferenceDocument: "SRD 5.1",
};
const bookOf = rel => BOOKS[rel.split(/[\\/]/)[1]] || rel.split(/[\\/]/)[1] || "Imported";

const manifest = await readFile(collectionPath, "utf8");
const hrefs = [...manifest.matchAll(/<doc\s+href="([^"]+)"/g)].map(m => m[1]);
if (!hrefs.length) {
  console.error("That file lists no <doc href=…> entries — is it a collection manifest?");
  process.exit(1);
}

// kind -> name -> entry. A class accumulates; everything else keeps the first book to define it,
// because a later printing of the same spell is the same spell and the first one named it.
const byKind = Object.fromEntries(KINDS.map(k => [k, new Map()]));
const sources = new Map();          // entry key -> every book that mentioned it
let read = 0, skipped = 0, failed = 0;

for (const href of hrefs) {
  const rel = href.replace(/^\.\.\//, "");
  if (SKIP.test(path.basename(rel))) { skipped++; continue; }
  const abs = path.join(repoRoot, rel);
  let xml;
  try { xml = await readFile(abs, "utf8"); }
  catch { console.error(`  missing: ${rel}`); failed++; continue; }

  let parsed;
  try { parsed = convert(xml); }
  catch (err) { console.error(`  unreadable: ${rel} — ${err.message}`); failed++; continue; }

  const book = bookOf(rel);
  for (const kind of KINDS) {
    for (const entry of parsed[kind]) {
      const key = String(entry.name).toLowerCase();
      const bag = byKind[kind];
      if (kind === "class") bag.set(key, mergeClassDefs(bag.get(key), entry));
      else if (!bag.has(key)) bag.set(key, entry);
      const sk = `${kind}:${key}`;
      if (!sources.has(sk)) sources.set(sk, new Set());
      sources.get(sk).add(book);
    }
  }
  read++;
}

// One flat list, each entry carrying the book it is attributed to. Where a thing is in several books
// the first that defined it is the attribution and the rest are recorded beside it.
const entries = [];
for (const kind of KINDS)
  for (const [key, data] of byKind[kind]) {
    const books = [...(sources.get(`${kind}:${key}`) || [])];
    entries.push({ kind, name: data.name, source: books[0] || "Imported", books, data });
  }

const counts = Object.fromEntries(KINDS.map(k => [k, byKind[k].size]));
const bundle = {
  schema: 1,
  collection: path.basename(collectionPath),
  builtAt: new Date().toISOString().slice(0, 10),
  files: { read, skipped, failed, listed: hrefs.length },
  counts,
  entries,
};

await writeFile(OUT, JSON.stringify(bundle), "utf8");
const size = (await stat(OUT)).size;
console.log(`Read ${read} of ${hrefs.length} files (${skipped} bestiary/vehicle skipped, ${failed} failed)`);
for (const k of KINDS) console.log(`  ${k.padEnd(11)} ${String(counts[k]).padStart(5)}`);
console.log(`  ${"total".padEnd(11)} ${String(entries.length).padStart(5)}`);
console.log(`\n${OUT}  ${(size / 1024 / 1024).toFixed(1)} MB`);
console.log("Upload it in Admin → Compendium. Do not commit it.");
