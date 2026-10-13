// Grimm Companion — vault sync check
//
// Read-only. Answers one question: does `grimms/js/data.js` still match the vault?
//
//   node grimms/tools/check-vault-sync.mjs                 (vault beside this repo)
//   node grimms/tools/check-vault-sync.mjs "D:/My Vault/Once Upon a Star ★"
//   node grimms/tools/check-vault-sync.mjs --json
//
// Nothing is written and nothing is rebuilt — run `build-data.mjs` for that. This exists because
// the builder fails *quietly*: a renamed rules page is dropped, a missing Reality Shift becomes
// null, a pair action with no file becomes an empty string, and the app goes on showing the last
// good text as if nothing happened. Each of those is a line in this report instead.
//
// The lists that decide what the app reads (GRIMMS, SHIFTS, SHACKLES, SERVANTS, RULES) are taken
// from build-data.mjs itself, not copied here, so adding a Grimm there is enough for both.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const JSON_OUT = args.includes('--json');
const VAULT = args.find(a => !a.startsWith('--')) ||
  path.resolve(here, '../../../Once Upon a Star ★');
const G = path.join(VAULT, 'Grimms');
const PG = path.join(G, 'Grimm Compendium/Player Grimms');
const DATA = path.resolve(here, '../js/data.js');
const BUILDER = path.join(here, 'build-data.mjs');

// A byte-order mark would sit in front of a page's first line and defeat every `^` match, so it
// comes off here. Obsidian doesn't write one; anything that rewrites a note might.
const read = f => fs.readFileSync(f, 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n');
const exists = f => fs.existsSync(f);
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const mtime = f => (exists(f) ? fs.statSync(f).mtimeMs : 0);
const rel = f => path.relative(VAULT, f).replace(/\\/g, '/');
const words = n => n.toLowerCase().split(/[^a-z0-9']+/).filter(w => w.length > 2);
const ls = d => (exists(d) ? fs.readdirSync(d).filter(f => f.endsWith('.md')) : []);

const findings = [];
const add = (level, area, msg, fix) => findings.push({ level, area, msg, fix });

// Vault pages the app is meant NOT to have, so they are never reported as missing content. These
// mirror the exclusions build-data.mjs and grimms/README.md already explain; anything else that
// turns up unlisted is drift and gets reported.
const DELIBERATE = new Set([
  'Solemn Temperance - Mad King Mode.md',   // a secret oath — never served to a player
]);

// A vault table cell can itself contain an escaped pipe (`![[art.png\|200]]`), so rows are split on
// unescaped pipes only — otherwise every column after a portrait is off by one.
const cells = row => row.split(/(?<!\\)\|/).slice(1, -1).map(c => c.trim());

// ── the builder's lists, read out of the builder ──────────────────────────
// Everything above its "── helpers" banner is declarations only, so that prefix can be imported
// on its own. If the banner ever moves, this fails loudly rather than checking the wrong lists.
async function builderLists() {
  const src = read(BUILDER);
  const cut = src.indexOf('// ── helpers');
  if (cut < 0) throw new Error('build-data.mjs: "── helpers" banner not found — cannot read its lists');
  const tmp = path.join(os.tmpdir(), `grimm-lists-${process.pid}.mjs`);
  fs.writeFileSync(tmp, src.slice(0, cut) +
    '\nexport { GRIMMS, SERVANTS, SHACKLES, SHIFTS, RULES };\n');
  try {
    return await import(pathToFileURL(tmp).href);
  } finally {
    try { fs.unlinkSync(tmp); } catch { /* temp file, never fatal */ }
  }
}

// ── what the app is currently serving ─────────────────────────────────────
function loadData() {
  if (!exists(DATA)) return null;
  const w = {};
  new Function('window', read(DATA))(w);
  return w.GRIMM_DATA || null;
}

// ── the five beats of a Reality Shift, as the builder cuts them ───────────
const BEATS = ['activation', 'passives', 'actions', 'lair', 'collapse'];
const PART_OF = h => /^on activation/i.test(h) ? 'activation'
  : /^(passive effects|domain effects)/i.test(h) ? 'passives'
  : /^reality actions/i.test(h) ? 'actions'
  : /^lair action/i.test(h) ? 'lair'
  : /^(on collapse|collapse effect)/i.test(h) ? 'collapse' : null;

function shiftBeats(file) {
  const found = new Set();
  for (const c of read(file).split(/^## /m).slice(1)) {
    const nl = c.indexOf('\n');
    const head = c.slice(0, nl).trim();
    if (/^while active/i.test(head)) {
      for (const s of c.slice(nl + 1).split(/^### /m).slice(1)) {
        const k = PART_OF(s.slice(0, s.indexOf('\n')).trim());
        if (k) found.add(k);
      }
      continue;
    }
    const k = PART_OF(head);
    if (k) found.add(k);
  }
  return found;
}

// ── the Vinculum matrix, as the builder reads it ──────────────────────────
function matrixCells() {
  const f = path.join(G, 'Vinculum Grimm Actions.md');
  if (!exists(f)) return null;
  const rows = read(f).split('\n').filter(l => /^\|/.test(l) && !/^\|\s*:?-/.test(l));
  const heads = cells(rows[0]).slice(1);
  const out = [];
  for (const r of rows.slice(1)) {
    const c = cells(r), who = c[0];
    c.slice(1).forEach((cell, i) => {
      if (!cell || cell === '-') return;
      out.push({ who, with: heads[i], name: cell.replace(/\[\[|\]\]/g, '').trim() });
    });
  }
  return out;
}

const main = async () => {
  const report = { vault: VAULT, checked: new Date().toISOString(), sources: 0, stale: [], findings };

  if (!exists(G)) { add('ERROR', 'vault', `No Grimms folder at ${G} — wrong vault path?`); return report; }
  const lists = await builderLists();
  const { GRIMMS, SERVANTS, SHACKLES, SHIFTS, RULES } = lists;
  const data = loadData();
  const dataAt = mtime(DATA);
  report.built = data ? data.built : null;
  report.dataAt = dataAt ? new Date(dataAt).toISOString() : null;
  if (!data) add('ERROR', 'app', 'grimms/js/data.js is missing or unreadable — the app has no data at all.',
    'run build-data.mjs');

  // Every file the builder opens, so staleness is exact and not "something in Grimms/ changed".
  const sources = [];
  const source = (f, what) => { if (f) sources.push({ file: f, what }); };

  for (const m of GRIMMS) {
    const f = path.join(PG, m.file);
    if (!exists(f)) add('ERROR', 'grimm', `${m.id}: page missing — ${m.file}`,
      'the build CRASHES on this; fix the path in build-data.mjs GRIMMS');
    else source(f, `${m.id} page`);
  }
  for (const [id, r] of Object.entries(SHACKLES)) {
    const f = path.join(PG, r);
    if (!exists(f)) add('WARN', 'shackle', `${id}: Shackle Break file missing — ${r}`,
      'fix the path in SHACKLES, or drop the entry');
    else {
      source(f, `${id} shackle`);
      const sec = read(f).split(/^## /m)[1];
      if (!sec) add('WARN', 'shackle', `${r}: no "## <Name>" heading — the builder skips it silently.`,
        'give the file one level-2 heading naming the Break');
      else if (!/^\s*\*[^*\n]+\*/m.test(sec.slice(sec.indexOf('\n')))) add('INFO', 'shackle',
        `${r}: no *italic tag* line under the heading — it defaults to "Imperfect Shackle Break".`);
    }
  }
  for (const m of GRIMMS) {
    const n = SHIFTS[m.id];
    if (!n) { add('WARN', 'shift', `${m.id}: no SHIFTS entry — this Grimm's sheet has no Reality Shift at all.`); continue; }
    const f = path.join(G, 'Reality Shifts/Players', n);
    if (!exists(f)) { add('WARN', 'shift', `${m.id}: Reality Shift missing — Reality Shifts/Players/${n}`,
      'the sheet shows no Shift at all; fix the name in SHIFTS'); continue; }
    source(f, `${m.id} shift`);
    const beats = shiftBeats(f);
    const gone = BEATS.filter(k => !beats.has(k));
    if (gone.length) add('WARN', 'shift', `${n}: beats not found — ${gone.join(', ')}`,
      'the card runs without them; check the headings against the shape in grimms/README.md');
    // The page states its own owner. If it disagrees with SHIFTS, the app hands a Shift to the
    // wrong player's sheet — and the page is the one Juan edits, so the page is the tell.
    const credit = (read(f).match(/^\*Grimm:\s*([^\n]*)\*\s*$/m) || [])[1];
    if (!credit) add('INFO', 'shift', `${n}: no "*Grimm: [[…]] · Owner: [[…]]*" line — ownership unverified.`);
    else {
      const [gPart, oPart] = credit.split('·');
      const named = (gPart || '').replace(/Grimm:/i, '').replace(/\[\[|\]\]/g, '').split('|')[0].trim();
      const owner = (oPart || '').replace(/Owner:/i, '').replace(/\[\[|\]\]/g, '').split('|')[0].trim();
      const want = slug(path.basename(m.file, '.md'));
      if (named && slug(named.split('/').pop()) !== want && slug(named) !== slug(m.name || ''))
        add('WARN', 'shift', `${n}: the page says it belongs to **${named}**, but SHIFTS gives it to ${m.id}.`,
          'one of the two is wrong — the app puts it on that Grimm\'s sheet either way');
      if (owner && !words(owner).some(w => words(m.user).includes(w)))
        add('WARN', 'shift', `${n}: the page's owner is "${owner}", the app's is "${m.user}".`);
    }
  }
  const shiftRules = path.join(G, 'Lore/Reality Shift.md');
  if (!exists(shiftRules)) add('WARN', 'shift', 'Lore/Reality Shift.md missing — the shared Shift rules go blank.');
  else source(shiftRules, 'shift rules');

  for (const [id, title, f] of RULES) {
    const p = path.join(G, f);
    if (!exists(p)) add('WARN', 'rules', `"${title}" missing — ${f}`,
      'silently dropped from the Rules tab; fix the path in RULES');
    else source(p, `rules: ${id}`);
  }

  // Servants: one Base statblock is one servant slot, and each should have both Parted Gates forms.
  for (const [id, root] of Object.entries(SERVANTS)) {
    const base = ls(path.join(PG, root, 'Base'));
    if (!base.length) { add('WARN', 'servants', `${id}: no Base statblocks under ${root}/Base`); continue; }
    const divine = ls(path.join(PG, root, 'Divine')), forbidden = ls(path.join(PG, root, 'Forbidden'));
    for (const sub of ['Base', 'Divine', 'Forbidden'])
      for (const f of ls(path.join(PG, root, sub))) source(path.join(PG, root, sub, f), `${id} ${sub.toLowerCase()}`);
    const pick = (list, name) => { const want = words(name);
      return list.find(f => words(path.basename(f, '.md')).some(w => want.includes(w))) || null; };
    for (const b of base) {
      const n = path.basename(b, '.md');
      if (!pick(divine, n)) add('WARN', 'servants', `${n}: no Divine Form matched in ${root}/Divine`,
        'match by a name word (Alaric ↔ "Sir Alaric, Exemplar…")');
      if (!pick(forbidden, n)) add('WARN', 'servants', `${n}: no Forbidden Form matched in ${root}/Forbidden`);
      const txt = read(path.join(PG, root, 'Base', b));
      for (const stat of ['HP', 'AC', 'CR'])
        if (!new RegExp(`\\|\\s*\\*\\*${stat}\\*\\*`, 'i').test(txt))
          add('INFO', 'servants', `${n}: no "| **${stat}** |" row — the sheet may read it out of prose.`);
    }
    for (const f of [...divine, ...forbidden]) {
      const n = path.basename(f, '.md');
      if (!base.some(b => words(path.basename(b, '.md')).some(w => words(n).includes(w))))
        add('WARN', 'servants', `${n}: a form with no Base statblock to attach to — it never reaches the app.`);
    }
    if (data) {
      const g = data.grimms.find(x => x.id === id);
      if (g && g.servants && g.servants.length !== base.length)
        add('WARN', 'servants', `${id}: app has ${g.servants.length} souls, vault has ${base.length} Base statblocks.`,
          'rebuild');
    }
    // The Roster is the index a player reads. It is NOT read by the builder, so a soul that is
    // on it with no Base statblock exists on the page and nowhere in the app.
    const rosterFile = path.join(PG, root, '../Servant Roster.md');
    if (exists(rosterFile)) {
      // Only the FIRST table — the soul index. The note also carries level-up and gap tables, and
      // reading those had the check asking for a statblock named "11 → 12".
      const all = read(rosterFile).split('\n');
      const start = all.findIndex(l => /^\|/.test(l));
      const rows = [];
      for (let i = start; i >= 0 && i < all.length && /^\|/.test(all[i]); i++) rows.push(all[i]);
      const listed = new Set();
      for (const line of rows) {
        const raw = (cells(line)[0] || '').trim();
        if (!/^\*\*.+\*\*/.test(raw)) continue;                 // a soul's row names it in bold
        const first = raw.replace(/\*\*|★|🔒/g, '').trim();
        if (first) listed.add(first);
      }
      const baseNames = base.map(b => path.basename(b, '.md'));
      for (const n of listed)
        if (!baseNames.some(b => words(b).some(w => words(n).includes(w))))
          add('WARN', 'servants', `Servant Roster lists "${n}", which has no Base statblock — a player can read about a soul the app cannot summon.`,
            `write Statblocks/Base/${n}.md, or take the row off the Roster`);
      for (const b of baseNames)
        if (![...listed].some(n => words(n).some(w => words(b).includes(w))))
          add('INFO', 'servants', `${b} has a statblock but no Servant Roster row — it is summonable but undocumented.`);
    }
  }

  // Ouroboros soul stones and the spirits they link to.
  const stoneDir = path.join(PG, 'Ouroboros Vigil/Soul Stones');
  const spiritDir = path.join(PG, 'Ouroboros Vigil/Spirits');
  const spirits = ls(spiritDir).map(f => path.basename(f, '.md'));
  for (const f of ls(spiritDir)) source(path.join(spiritDir, f), 'spirit');
  for (const f of ls(stoneDir)) {
    const p = path.join(stoneDir, f);
    source(p, 'soul stone');
    const link = (read(p).match(/assume the powers of the \[\[([^\]|]+)/) || [])[1];
    const name = f.replace(/ Soul Stone\.md$/, '');
    if (!link) add('INFO', 'stones', `${name}: no "assume the powers of the [[Spirit]]" link — no CR or spirit text in the app.`);
    else if (!spirits.includes(link.split('/').pop())) add('WARN', 'stones',
      `${name}: links to [[${link}]], which is not in Ouroboros Vigil/Spirits.`, 'fix the link or move the spirit note');
  }

  // Pair actions: a cell with no file is served as an empty ability.
  const pairCells = matrixCells();
  if (!pairCells) add('ERROR', 'vinculum', 'Vinculum Grimm Actions.md missing — the build CRASHES.');
  else {
    source(path.join(G, 'Vinculum Grimm Actions.md'), 'vinculum matrix');
    const seen = new Map();
    for (const c of pairCells) {
      const f = path.join(G, 'Vinculum Actions', c.name + '.md');
      const ok = exists(f) && fs.statSync(f).size > 0;
      if (ok) source(f, `pair action: ${c.name}`);
      if (!seen.has(c.name)) {
        seen.set(c.name, ok);
        if (!ok) add('WARN', 'vinculum', `"${c.name}" (${c.who} × ${c.with}): ${exists(f) ? 'file is empty' : 'no file in Vinculum Actions/'} — the app shows the name with no text.`,
          `write Grimms/Vinculum Actions/${c.name}.md`);
      }
      const back = pairCells.find(o => o.who === c.with && o.with === c.who);
      if (back && back.name !== c.name && c.who < c.with) add('WARN', 'vinculum',
        `${c.who} × ${c.with} disagrees across the diagonal: "${c.name}" vs "${back.name}".`,
        'the matrix is read row by row, so both halves should name the same action');
    }
    const unused = ls(path.join(G, 'Vinculum Actions'))
      .map(f => path.basename(f, '.md')).filter(n => !seen.has(n));
    for (const n of unused) add('NEW', 'vinculum', `Vinculum Actions/${n}.md is in no matrix cell — the app never shows it.`);
  }

  // Vault content the app cannot see without an edit to build-data.mjs. Reported, never wired in:
  // putting a Shift or a Shackle Break in front of a player is the DM's call.
  const known = new Set(GRIMMS.map(m => m.file.split('/').pop()));
  for (const f of ls(PG)) {
    if (known.has(f) || DELIBERATE.has(f)) continue;
    if (/ - Shackle Break\.md$/.test(f)) {
      if (!Object.values(SHACKLES).some(r => r.split('/').pop() === f))
        add('NEW', 'shackle', `Player Grimms/${f} is in no SHACKLES entry — not in the app.`,
          'add it to SHACKLES only when you mean to be able to reveal it');
    } else add('NEW', 'grimm', `Player Grimms/${f} is in no GRIMMS entry — not in the app.`);
  }
  for (const f of ls(path.join(PG, 'Gate of Caelum')))
    if (!Object.values(SHACKLES).some(r => r.split('/').pop() === f))
      add('NEW', 'shackle', `Player Grimms/Gate of Caelum/${f} is in no SHACKLES entry — not in the app.`);
  const listedShifts = new Set(Object.values(SHIFTS));
  for (const f of ls(path.join(G, 'Reality Shifts/Players'))) {
    if (listedShifts.has(f) || DELIBERATE.has(f)) continue;
    add('NEW', 'shift', `Reality Shifts/Players/${f} is in no SHIFTS entry — not in the app.`,
      'add it to SHIFTS only when a player should be able to have it revealed');
  }

  // Who owns what, against the roster — the app carries the owner's name on every sheet.
  const roster = path.join(VAULT, 'Players/Stellar Reclaimers.md');
  if (!exists(roster)) add('INFO', 'roster', 'Players/Stellar Reclaimers.md not found — owner names unchecked.');
  else {
    const owners = new Map();
    const rows = read(roster).split('\n').filter(l => /^\|/.test(l) && !/^\|\s*:?-/.test(l));
    const head = rows.length ? cells(rows[0]).map(h => h.toLowerCase()) : [];
    const iName = head.indexOf('name'), iGrimm = head.indexOf('grimm');
    if (iName < 0 || iGrimm < 0) add('INFO', 'roster',
      'Stellar Reclaimers.md has no Name/Grimm columns in its first table — owner names unchecked.');
    for (const line of rows.slice(1)) {
      const c = cells(line);
      const name = (c[iName] || '').replace(/<br\s*\/?>/gi, ' ').trim();
      const link = (c[iGrimm] || '').replace(/\[\[|\]\]/g, '').split('|')[0].trim();
      if (name && link) owners.set(slug(link.split('/').pop()), name);
    }
    for (const m of GRIMMS) {
      const key = slug(path.basename(m.file, '.md'));
      const who = owners.get(key) ?? owners.get(m.id);
      if (who === undefined) add('INFO', 'roster', `${m.id}: no roster row links this Grimm — owner "${m.user}" unverified.`);
      else if (!words(who).some(w => words(m.user).includes(w))) add('WARN', 'roster',
        `${m.id}: builder says owner "${m.user}", roster says "${who}".`,
        'fix `user` in build-data.mjs GRIMMS, or the roster');
    }
  }

  // ── staleness ───────────────────────────────────────────────────────────
  report.sources = sources.length;
  if (dataAt) {
    for (const s of sources) if (mtime(s.file) > dataAt)
      report.stale.push({ file: rel(s.file), what: s.what, at: new Date(mtime(s.file)).toISOString() });
    report.stale.sort((a, b) => (a.at < b.at ? 1 : -1));
  }

  if (data) {
    report.inventory = data.grimms.map(g => ({
      id: g.id, name: g.name, user: g.user, chains: g.chains,
      abilities: g.abilities.length, stances: g.stances.length,
      servants: (g.servants || []).length,
      shift: g.shift ? g.shift.name : null, shackle: g.shackle ? g.shackle.name : null,
    }));
    report.counts = { soulStones: data.soulStones.length,
      pairActions: Object.keys(data.pairs.actions).length,
      emptyPairActions: Object.values(data.pairs.actions).filter(t => !t.trim()).length,
      rules: data.rules.length, rulesExpected: RULES.length };
    // ── what the Shifts and the Servants actually PARSED INTO ─────────────
    // A heading the builder recognises but whose body it cannot cut yields a beat with no entries:
    // the card then shows an empty section, which looks like a missing ability rather than a
    // formatting slip. Same for a statblock that parsed to almost nothing.
    report.shifts = [];
    report.servants = [];
    for (const g of data.grimms) {
      if (g.shift) {
        const got = new Map(g.shift.parts.map(p => [p.key, p]));
        report.shifts.push({ grimm: g.name, name: g.shift.name,
          beats: BEATS.map(k => (got.has(k) ? got.get(k).entries.length : null)),
          reference: g.shift.extra.length, intro: g.shift.intro.length });
        for (const k of BEATS) {
          const p = got.get(k);
          if (!p) continue;   // a missing beat is reported file-side, with its heading
          // 0 entries is a formatting slip, not a design choice: the card lists a beat as named
          // entries, so prose that names nothing arrives as one unlabelled blob — or as nothing.
          if (!p.entries.length) add('WARN', 'shift',
            `${g.shift.name} — "${p.title}" parsed to **no named entries**, only ${p.note.trim() ? `${p.note.trim().length} characters of loose prose` : 'an empty section'}.`,
            'each entry opens with **Name.** or **Name** *(Action).*, or is a ### sub-heading');
          for (const e of p.entries) if (!e.text.trim()) add('INFO', 'shift',
            `${g.shift.name} — "${e.name}" (${p.title}) has a name and no text.`);
        }
        if (!g.shift.intro.trim()) add('INFO', 'shift', `${g.shift.name}: no description above the first beat.`);
      }
      for (const s of g.servants || []) {
        report.servants.push({ grimm: g.name, name: s.name, chars: s.text.length,
          divine: s.divine ? s.divine.name : null, forbidden: s.forbidden ? s.forbidden.name : null });
        if (!s.divine || !s.forbidden) add('WARN', 'servants',
          `${s.name} reaches the app with no ${!s.divine ? 'Divine' : 'Forbidden'} Form — that half of the Parted Gates is unplayable for this soul.`);
        if (s.text.length < 800) add('WARN', 'servants',
          `${s.name}: only ${s.text.length} characters of statblock reached the app — the page likely didn't parse.`,
          'check its stats table and headings');
      }
    }

    for (const g of report.inventory) {
      if (!g.abilities) add('ERROR', 'grimm', `${g.id}: 0 abilities in the app — its page parsed to nothing.`,
        'check the "## Invoked/Awakened" and "### <ability>" headings on the page');
      const blank = (data.grimms.find(x => x.id === g.id).abilities || []).filter(a => !a.tag).map(a => a.name);
      if (blank.length) add('INFO', 'grimm', `${g.id}: abilities with no *italic kind* line — ${blank.join(', ')}`,
        'they fall through to kind "other" and cost 0');
    }
    if (data.rules.length < RULES.length) add('WARN', 'rules',
      `Rules tab has ${data.rules.length} of ${RULES.length} pages — one was dropped for a missing file.`);
  }

  return report;
};

const r = await main();
const bad = n => r.findings.filter(f => f.level === n).length;
r.verdict = bad('ERROR') ? 'ERROR' : r.stale.length ? 'STALE' : bad('WARN') ? 'WARN' : 'OK';

if (JSON_OUT) { console.log(JSON.stringify(r, null, 1)); process.exit(0); }

console.log(`Grimm Companion ↔ vault check  ${r.checked.slice(0, 16).replace('T', ' ')}`);
console.log(`vault: ${r.vault}`);
console.log(`data.js: built ${r.built || '—'}, written ${r.dataAt ? r.dataAt.slice(0, 16).replace('T', ' ') : '—'} · ${r.sources} source files watched\n`);

if (r.inventory) {
  for (const g of r.inventory)
    console.log(`  ${g.name.padEnd(18)} ${String(g.abilities).padStart(2)} ab · ${g.stances} st · ${String(g.servants).padStart(2)} sv · shift: ${(g.shift || '—').padEnd(18)} shackle: ${g.shackle || '—'}`);
  const c = r.counts;
  console.log(`  ${c.soulStones} soul stones · ${c.pairActions} pair actions (${c.emptyPairActions} with no text) · ${c.rules}/${c.rulesExpected} rule pages\n`);
}

if (r.shifts && r.shifts.length) {
  console.log('Reality Shifts — entries per beat (activation · passives · actions · lair · collapse)');
  for (const s of r.shifts)
    console.log(`  ${s.name.padEnd(18)} ${s.beats.map(n => (n === null ? ' —' : String(n).padStart(2))).join(' · ')}   ${s.reference} reference${s.reference === 1 ? '' : 's'}${s.intro ? '' : '  ⚠ no description'}`);
  console.log('');
}

if (r.servants && r.servants.length) {
  console.log('Servants — one Base statblock is one servant slot');
  for (const s of r.servants)
    console.log(`  ${s.name.padEnd(18)} ${String(s.chars).padStart(5)} chars · Divine: ${(s.divine || '⚠ none').padEnd(34)} Forbidden: ${s.forbidden || '⚠ none'}`);
  console.log('');
}

if (r.stale.length) {
  console.log(`STALE — ${r.stale.length} source file${r.stale.length === 1 ? '' : 's'} newer than data.js:`);
  for (const s of r.stale) console.log(`  ${s.at.slice(0, 16).replace('T', ' ')}  ${s.file}  (${s.what})`);
  console.log('');
} else if (r.dataAt) console.log('FRESH — no watched source file is newer than data.js.\n');

for (const level of ['ERROR', 'WARN', 'NEW', 'INFO']) {
  const list = r.findings.filter(f => f.level === level);
  if (!list.length) continue;
  console.log(`${level} (${list.length})`);
  for (const f of list) console.log(`  [${f.area}] ${f.msg}${f.fix ? `\n      → ${f.fix}` : ''}`);
  console.log('');
}

console.log(`VERDICT: ${r.verdict} · stale ${r.stale.length} · errors ${bad('ERROR')} · warnings ${bad('WARN')} · new ${bad('NEW')} · info ${bad('INFO')}`);
