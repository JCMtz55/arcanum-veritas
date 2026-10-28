// Turns a Fight Club 5e compendium XML into the JSON the character sheet ships with.
//
//   node sheet/tools/build-srd.mjs <path-to-compendium.xml> [outDir]
//
// Run offline, by hand, the way grimms/tools/build-data.mjs is — the app itself has no build step
// and must not grow one. The output is committed; the XML is not.
//
// WHAT TO FEED IT. Only `Sources/SystemReferenceDocument/all-srd.xml` from
// github.com/ogre-project/FightClub5eXML belongs in this repo: the SRD is openly licensed, and the
// requirements forbid bundling copyrighted non-SRD material (CS-085) — which matters because this
// app is served to the open internet. Anything else a DM owns is imported through the Admin page
// instead, and lives in the database rather than here.
//
// The reading itself is in sheet/js/fc5e.mjs, shared with the server's import route.

import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { convert } from "../js/fc5e.mjs";

const [, , xmlPath, outArg] = process.argv;
if (!xmlPath) {
  console.error("Usage: node sheet/tools/build-srd.mjs <compendium.xml> [outDir]");
  process.exit(1);
}
const OUT = outArg || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "data");

const xml = await readFile(xmlPath, "utf8");
const c = convert(xml);

const SOURCE = "SRD 5.1";
// Split three ways because they are wanted at different moments: the builder needs the core the
// instant the sheet opens, while the spell and item catalogues are only read when someone searches
// them — so they load on demand rather than on every page view.
const files = {
  "srd-core.json": { source: SOURCE, ruleset: "dnd5e-2014", builtFrom: path.basename(xmlPath),
    races: c.race, classes: c.class, backgrounds: c.background, feats: c.feat },
  "srd-spells.json": { source: SOURCE, spells: c.spell },
  "srd-items.json": { source: SOURCE, items: c.item },
};

await mkdir(OUT, { recursive: true });
console.log(`Read ${path.basename(xmlPath)}`);
for (const [file, data] of Object.entries(files)) {
  const p = path.join(OUT, file);
  await writeFile(p, JSON.stringify(data, null, 1) + "\n", "utf8");
  console.log(`  ${file.padEnd(18)} ${String(Math.round((await stat(p)).size / 1024)).padStart(5)} KB`);
}
console.log(`  ${c.race.length} races, ${c.class.length} classes, ${c.background.length} backgrounds, ` +
  `${c.feat.length} feats, ${c.spell.length} spells, ${c.item.length} items`);
