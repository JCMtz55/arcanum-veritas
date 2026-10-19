// Grimm Companion — data builder
//
// Reads the player Grimm pages, pair actions and rules out of the Obsidian vault
// and writes them to ../js/data.js as one global (window.GRIMM_DATA), so the site
// works from GitHub Pages *and* straight off the disk.
//
//   node grimms/tools/build-data.mjs                 (uses the default vault path)
//   node grimms/tools/build-data.mjs "D:/My Vault/Once Upon a Star ★"
//
// Only what players are meant to see is read. DM tools (the Chain Tracker, NPC and
// Aeon Grimms, unrevealed Reality Shifts and Shackle Breaks) are never opened.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const VAULT = process.argv[2] ||
  path.join(process.env.USERPROFILE || '', 'OneDrive/Documents/Once Upon a Star/Once Upon a Star ★');
const G = path.join(VAULT, 'Grimms');
const PG = path.join(G, 'Grimm Compendium/Player Grimms');
const OUT = path.join(here, '../js/data.js');

// The party. `short` is the name the pair-action matrix uses; `chains` is where the
// chains stood when this was built — each player can change their own on the sheet.
const GRIMMS = [
  { id:'gate-of-caelum',    file:'Gate of Caelum.md',                  user:"Salomon Lev'nali",  short:'Salomon', chains:3, hue:'#7A6EA8' },
  { id:'ouroboros-vigil',   file:'Ouroboros Vigil/Ouroboros Vigil.md', user:'Solomon',           short:'Solomon', chains:3, hue:'#4E8C6A' },
  { id:'vidarr',            file:'Vidarr.md',                          user:'Zariel Necroshade', short:'Zariel',  chains:2, hue:'#C0553F' },
  { id:'white-rabbit',      file:'White Rabbit.md',                    user:'Grizzly',           short:'Grizzly', chains:2, hue:'#C9C3B6' },
  { id:'makoa',             file:'Makoa.md',                           user:'Zeke (Junsekah Greyhawk)', short:'Zeke', chains:2, hue:'#6E8B97' },
  { id:'thanatos',          file:'Thanatos.md',                        user:'Rory Mercury',      short:'Rory',    chains:3, hue:'#8A6F9E' },
  { id:'rage-of-the-tiger', file:'Rage of the Tiger.md',               user:'Richard Aquitaine', short:'Richard', chains:3, hue:'#D08A3A' },
  { id:'peco',              file:'Peco.md', name:'Peco Peco',          user:'Khaled Guile',      short:'Khaled',  chains:3, hue:'#4FA4C4' },
];

// Supporting pages a player's sheet can open (statblocks for summons and stones).
// One statblock per soul, and nothing else: every entry here becomes a RECRUITABLE soul that
// holds a servant slot. The Servant Roster index was in this list once and the sheet counted
// it as a soul — 7/6 slots, and it showed up in the Summon dropdown. Keep indexes, roleplay
// references and background entries out.
// Read from the folders rather than a hand-kept list, so renaming a form in the vault just works.
//   Statblocks/Base/       one file per recruitable soul — each is ONE SERVANT SLOT
//   Statblocks/Divine/     its Parted Gates Divine Form
//   Statblocks/Forbidden/  its Parted Gates Forbidden Form
// Roleplay/ and Servant Roster.md stay out: anything listed as a servant becomes a recruitable
// soul holding a slot, and the Roster index once pushed the sheet to 7/6.
const SERVANTS = { 'gate-of-caelum': 'Gate of Caelum/Servants/Statblocks' };

// White Rabbit's Umbra Platoon, the same way: one file per TROOP TYPE, read from the folder so a
// new job is a new note and nothing here has to change. Each note owns that job's numbers — the
// Hollownest appendix is now the summary of these, not the source (Juan, 2026-10-19).
// `Universal Traits.md` is not a job: it is the block every troop shares, pulled out by name the
// way Servant Roster.md is kept out of the servant list.
const TROOPS = { 'white-rabbit': 'White Rabbit/Troops' };
const TROOP_SHARED = 'Universal Traits';
// A troop that is NOT a job: it arrives through a Shackle Break and is the DM's to reveal. Named
// here rather than flagged in the note, for the same reason SHACKLES is a list — nothing is
// auto-discovered, so a secret can never be swept onto a player's sheet by a file being added.
// `secret` carries the toggle that reveals it; the server cuts the troop out of a reader's copy of
// data.js until that toggle is on, exactly as it cuts an unrevealed Shackle Break.
const TROOP_SECRET = { 'white-rabbit': { 'The Fallen Hero': 'shackle', 'Squire': 'shackle' } };
// The platoon parades in this order whatever order the folder is read in. Anything not listed
// follows, alphabetically.
const TROOP_ORDER = ['Infantry', 'Scout', 'Medic', 'Magus', 'Bulwark', 'Squire', 'The Fallen Hero'];

// A form file is matched to its soul by name token, so the forms can be renamed freely in the
// vault without touching this file: "Alaric D'Arquen" claims both "Sir Alaric, Exemplar of the
// Radiant Oath" and "Alaric The Fallen" on the strength of the word "alaric". Honorifics and
// epithets in front of the name are why this is not just a first-word match.
const nameWords = n => n.toLowerCase().split(/[^a-z0-9']+/).filter(w => w.length > 2);

// Each Grimm's Imperfect Shackle Break, in a file of its own (Juan, 2026-10-09).
//
// These used to be read off the Grimm's own page, which meant the only way to get one into the app
// was to write it there — and anything on that page reaches every reader. Salomon's Parted Gates is
// NOT revealed, so it cannot live on the Gate of Caelum page at all. Its own file keeps the release
// decision in the DM's hands: parsed into `g.shackle` rather than into `g.abilities`, so the server
// can cut it per reader exactly as it cuts an unrevealed Reality Shift, and the sheet merges it back
// in only if it arrives. Adding one is adding a line here; nothing is auto-discovered, so an NPC's
// Shackle Break can never be swept in by accident.
//
// Paths are relative to Player Grimms/. The toggle that reveals one is `shackle` (see the Admin tab).
const SHACKLES = {
  'gate-of-caelum': 'Gate of Caelum/Gate of Caelum - Shackle Break.md',
  'vidarr':         'Vidarr - Shackle Break.md',
  'white-rabbit':   'White Rabbit - Shackle Break.md',
};

// Each Grimm's Reality Shift, from Reality Shifts/Players/. These are built into the data but
// stay hidden in the app until the DM reveals one — see the DM view. Only these files are read:
// the NPC shifts and "Solemn Temperance - Mad King Mode" (a secret oath) are never opened.
const SHIFTS = {
  'gate-of-caelum':    'End of Haven.md',
  'ouroboros-vigil':   'Solar Eclipse.md',
  'vidarr':            'Purgatory.md',
  'white-rabbit':      'Hollownest.md',
  'makoa':             'Eden.md',
  'thanatos':          'Memento Mori.md',
  'rage-of-the-tiger': 'Solemn Temperance.md',
  'peco':              'Final Step.md',
};

// Each Grimm's portrait, per stage. The sheet shows `invoked` up to Chained and `awakened` from
// Awakened on, so these are the 1st Stage (familiar) and 2nd Stage (true form) plates from
// resources/grimm/Players/. Named by file rather than discovered, exactly as the Shifts above are:
// the folders also hold WIP and alternates, and nothing should be swept in by accident.
//
// Why this exists at all: the images used to come from scraping <img src='…'> out of the Grimm's
// vault page, which only ever found the old GMBinder HTML. Six of the eight Grimms had no portrait
// in the app, and the two that did were hotlinking gmbinder.com — a third-party host, for art Juan
// owns and keeps locally. A name here is resolved through useImage(), so the file is copied into
// grimms/img/ and served from the app like every other plate. The scrape is kept as the fallback
// for anything not listed (Peco, until his two stages are drawn).
const PORTRAITS = {
  'gate-of-caelum':    { invoked: 'familiar_gateOfCaelum.png',  awakened: 'grimm_GateOfCaelum.png' },
  'ouroboros-vigil':   { invoked: 'familiar_oroborosVigil.png',  awakened: 'grimm_Oroboros.png' },
  'vidarr':            { invoked: 'familiar_vidar.png',          awakened: 'grimm_Vidarr.png' },
  'white-rabbit':      { invoked: 'familiar_whiteRabbit.png',    awakened: 'grimm_WhiteRabbit.png' },
  'makoa':             { invoked: 'familiar_makoa.png',          awakened: 'grimm_Makoa.png' },
  'thanatos':          { invoked: 'familiar_Thanatos.png',       awakened: 'grimm_Thanatos.png' },
  'rage-of-the-tiger': { invoked: 'familiar_rageOfTheTIger.png', awakened: 'grimm_RageOfTheTiger.png' },
  'peco':              { invoked: 'familiar_peco.png',           awakened: 'grimm_Peco.png' },
};
// With Peco drawn (2026-10-19) every Grimm is served from grimms/img/ and nothing hotlinks
// gmbinder.com any more. The scrape below still runs as the fallback, but nothing reaches it.
//
// Thanatos, Rage of the Tiger, Víðarr and Ouroboros Vigil were redrawn the same day, and the last
// three 1st-Stage plates moved from .jpg/.jpeg to .png — so the names above are the new ones. The
// old Ouroboros .jpeg is gone from resources/ entirely; a name that no longer resolves is reported
// as missing at the end of a build and that Grimm simply loses its portrait, so this list has to
// move when a plate's extension does.

const RULES = [
  ['grimms',    'Rules of the Grimm',  'Grimms.md'],
  ['types',     'Grimm Stages',        'Lore/Types of Grimm.md'],
  ['slots',     'Grimm Slots',         'Lore/Grimm Slots.md'],
  ['abilities', 'Grimm Abilities',     'Lore/Grimm Abilities.md'],
  ['chains',    'The Three Chains',    'Grimm Chains.md'],
  // Harmony ('Lore/Grimm Harmony.md') is left out — the table doesn't use it.
  ['fate',      'Grimm Fate & Tokens', 'Lore/Grimm Fate.md'],
  ['vinculum',  'Vinculum Pair Actions','Vinculum Grimm Actions.md'],
  ['shards',    'Soul Shards',         'Grimm Appendix/Soul Shards Table.md'],
  ['advcr',     "Adventurer's CR",     "Grimm Appendix/Adventurer's CR Table.md"],
];

// ── helpers ─────────────────────────────────────────────────────────────
const read = f => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const exists = f => fs.existsSync(f);
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ── art ────────────────────────────────────────────────────────────────
// Vault pages embed art as ![[file.png]], and the art lives in <vault>/../resources — outside the
// folder the app is served from. So anything a page actually references is copied into grimms/img/
// and the embed rewritten to a plain relative image. Embeds that resolve to nothing are dropped
// rather than printed as raw text. The index is built lazily and only once, on the first embed.
const IMG_OUT = path.join(here, '../img');
const RESOURCES = path.join(VAULT, '..', 'resources');
let resIndex = null;
function resourceIndex() {
  if (resIndex) return resIndex;
  resIndex = new Map();
  const walk = dir => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (!resIndex.has(e.name)) resIndex.set(e.name, p);   // first match wins
    }
  };
  if (exists(RESOURCES)) walk(RESOURCES);
  return resIndex;
}
const artCopied = new Map();
const artMissing = new Set();
// Obsidian writes an embed as a bare file name or as a vault-relative path, depending on how that
// note's links were made: ![[grimm_Peco.png]] and ![[resources/grimm/Players/2nd Stage/grimm_Peco.png]]
// are the same plate. The index is keyed by file name, so a path form is resolved — and named in
// img/ — by its last segment. Without this, Peco's page lost both its plates while the portraits
// above still worked, because PORTRAITS asks for the bare names (Juan, 2026-10-19).
function useImage(name) {
  if (artCopied.has(name)) return artCopied.get(name);
  const base = name.split(/[\\/]/).pop();
  const src = resourceIndex().get(name) || resourceIndex().get(base);
  if (!src) { artMissing.add(name); artCopied.set(name, null); return null; }
  const safe = base.replace(/[^\w.-]+/g, '_');
  fs.mkdirSync(IMG_OUT, { recursive: true });
  fs.copyFileSync(src, path.join(IMG_OUT, safe));
  const url = 'img/' + safe;
  artCopied.set(name, url);
  return url;
}

// The first plate on an already-cleaned page — its face, for the app to use as art rather than
// only as a picture in a body of prose. clean() has copied the file into img/ by then, so this is
// just reading back the URL it produced; no plate simply means no art.
const firstPlate = t => (String(t || '').match(/!\[[^\]]*\]\((img\/[^)\s]+)\)/) || [])[1] || '';

// Obsidian → plain markdown the site's renderer understands.
function clean(md) {
  return md
    .replace(/^---\n[\s\S]*?\n---\n/, '')               // frontmatter
    .replace(/%%[\s\S]*?%%/g, '')                        // Obsidian comments
    .replace(/!\[\[([^\]|]+?)(?:\|[^\]]*)?\]\]/g, (_, n) => {   // embeds → copied art
      const url = useImage(n.trim());
      return url ? `![](${url})` : '';
    })
    .replace(/<img[^>]*>/gi, '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')       // [[target|label]]
    .replace(/\[\[([^\]]+)\]\]/g, (_, t) => t.split('/').pop().replace(/#.*/, ''))
    .replace(/\[([^\]]+)\]\(#[^)]*\)/g, '$1')            // in-page anchors
    .replace(/(^|\s)#(NERF|BUFF|Grimm|Statblock|TODO)\b/g, '$1') // tags
    .replace(/==([^=]*)==/g, '$1')
    .replace(/\\([*_])/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// "*Passive Skill*" → a kind. Old pages say Feature, newer ones Skill.
function kindOf(tag) {
  const t = (tag || '').toLowerCase();
  if (t.includes('shackle')) return 'shackle';
  if (t.includes('core')) return 'core';
  if (t.includes('super')) return 'super';
  if (t.includes('passive')) return 'passive';
  if (t.includes('active') || t.includes('interactive') || t.includes('reactive')) return 'active';
  return 'other';
}
const WORDN = { one:1, two:2, three:3, four:4 };
function costOf(kind, text) {
  if (kind === 'passive' || kind === 'core') return 0;
  const m = text.match(/\b(\d|one|two|three|four)\s+Grimm\s+Slots?\b/i);
  if (m) return WORDN[m[1].toLowerCase()] ?? +m[1];
  if (/Grimm Slot/i.test(text)) return 1;
  return kind === 'super' || kind === 'shackle' ? 2 : kind === 'active' ? 1 : 0;
}
function actionOf(text) {
  const m = text.match(/\b(?:as\s+(?:an?|one)|use\s+(?:a\s+)?its)\s+\**\s*`?(bonus action|reaction|action|attack|free action)\b/i);
  if (!m) return '';
  return { 'bonus action':'Bonus Action', reaction:'Reaction', action:'Action',
    attack:'Attack', 'free action':'Free' }[m[1].toLowerCase()];
}

// ── a player Grimm page ────────────────────────────────────────────────
function parseGrimm(meta) {
  const raw = read(path.join(PG, meta.file));
  const imgs = [...raw.matchAll(/<img\s+src='([^']+)'/g)]
    .map(m => m[1].replace(/\.(jpg|png)g$/, '.$1'));
  const md = clean(raw);
  const name = meta.name || meta.file.split('/').pop().replace(/\.md$/, '');

  const forms = {};
  for (const m of md.matchAll(/In its (invoked|awakened) form[^\n]*?takes the form of (?:an? |multiple )?\**([^*.\n]+)/gi))
    forms[m[1].toLowerCase()] = m[2].trim();

  // Split on level-2 sections, then level-3 abilities inside them.
  const sections = md.split(/^## /m).slice(1);
  const abilities = [], stances = [];
  for (const sec of sections) {
    const nl = sec.indexOf('\n');
    const head = sec.slice(0, nl).trim().replace(/\.$/, '');
    const body = sec.slice(nl + 1);
    const low = head.toLowerCase();

    if (low.includes('stances')) {
      for (const s of body.split(/^#### /m).slice(1)) {
        const i = s.indexOf('\n');
        stances.push({ name: s.slice(0, i).trim(), text: s.slice(i + 1).trim() });
      }
      continue;
    }
    // A Shackle Break is one ability whose sub-headings are its upgrades.
    const firstTag = (body.match(/^\s*\*([^*\n]+)\*/) || [])[1];
    if (firstTag && /shackle/i.test(firstTag)) {
      const text = body.replace(/^\s*\*[^*\n]+\*\s*\n(___\n)?/, '').trim();
      abilities.push({ id: slug(head), name: head, stage: 'shackle', kind: 'shackle',
        tag: firstTag.trim(), cost: costOf('shackle', text), action: actionOf(text), text });
      continue;
    }
    const stage = low.startsWith('invoked') ? 'invoked'
      : low.startsWith('awakened') ? 'awakened'
      : low.startsWith('additional') ? 'additional' : 'other';

    const parts = body.split(/^### /m);
    for (const p of parts.slice(1)) {
      const i = p.indexOf('\n');
      const aname = p.slice(0, i).trim().replace(/\.$/, '');
      let rest = p.slice(i + 1);
      const tag = (rest.match(/^\s*\*([^*\n]+)\*/) || [])[1] || '';
      rest = rest.replace(/^\s*\*[^*\n]+\*\s*\n/, '').replace(/^\s*_{3,}\s*\n/, '').trim();
      const kind = /^familiar$/i.test(aname) ? 'core' : kindOf(tag);
      abilities.push({ id: slug(aname), name: aname, stage, kind, tag: tag.trim(),
        cost: costOf(kind, rest), action: actionOf(rest), text: rest });
    }
  }
  // PORTRAITS wins where it has an entry; the scraped tags are the fallback. A name listed there
  // that resolves to nothing is reported at the end with every other missing embed, so a renamed
  // or misspelt file is noisy rather than silently blank — which is how six empty portraits went
  // unnoticed in the first place.
  const art = PORTRAITS[meta.id] || {};
  const pick = (k, i) => (art[k] && useImage(art[k])) || imgs[i] || '';
  return { ...meta, name, forms,
    images: { invoked: pick('invoked', 0), awakened: pick('awakened', 1) },
    abilities, stances };
}

// ── a Shackle Break, from its own file ──────────────────────────────────
// The file is one "## <Name>" section shaped exactly as it was when it lived on the Grimm page: a
// "*Imperfect Shackle Break*" tag line, a rule, then the body — whose "### Fake Death +" sub-headings
// the sheet reads as what each ability becomes while the Break holds. So it is parsed into the same
// single ability object the page used to yield, and nothing downstream had to change shape.
function shackle(id) {
  const rel = SHACKLES[id];
  if (!rel) return null;
  const f = path.join(PG, rel);
  if (!exists(f)) { console.log(`   ⚠ ${id}: no Shackle Break at ${rel}`); return null; }
  const md = clean(read(f));
  const sec = md.split(/^## /m)[1];
  if (!sec) { console.log(`   ⚠ ${rel}: no "## <Name>" heading — skipped`); return null; }
  const nl = sec.indexOf('\n');
  const name = sec.slice(0, nl).trim().replace(/\.$/, '');
  const body = sec.slice(nl + 1);
  const tag = (body.match(/^\s*\*([^*\n]+)\*/) || [])[1] || 'Imperfect Shackle Break';
  const text = body.replace(/^\s*\*[^*\n]+\*\s*\n(___\n)?/, '').trim();
  return { id: slug(name), name, stage: 'shackle', kind: 'shackle',
    tag: tag.trim(), cost: costOf('shackle', text), action: actionOf(text), text };
}

// ── statblocks: Gate of Caelum servants, Ouroboros soul stones & spirits ─
function servants(id) {
  const root = SERVANTS[id];
  if (!root || !exists(path.join(PG, root, 'Base'))) return [];
  const md = sub => {
    const dir = path.join(PG, root, sub);
    return exists(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.md'))
      .map(f => ({ name: path.basename(f, '.md'), text: clean(read(path.join(dir, f))) })) : [];
  };
  const divine = md('Divine'), forbidden = md('Forbidden');
  const pick = (list, name) => { const want = nameWords(name);
    return list.find(f => nameWords(f.name).some(w => want.includes(w))) || null; };
  return md('Base').map(b => {
    const d = pick(divine, b.name), f = pick(forbidden, b.name);
    if (!d || !f) console.log(`   ⚠ ${b.name}: no ${!d ? 'Divine' : 'Forbidden'} Form found`);
    return { ...b, divine: d, forbidden: f };
  });
}
// ── statblocks: White Rabbit's troop types ──────────────────────────────
// A troop type is a job with a corporeal body: a sigil for its tile, the trait it lends the
// Commander, its actions and charges, and — while Hollownest holds — HP, AC and Speed.
//
// The numbers are read off the note's own Stats table rather than scraped out of its prose, because
// a troop's HP is a FORMULA ("50 + (5 × your level)") and no amount of 5e-shaped regex will turn
// that into a number the sheet can track. Each row is named, so a note can leave one out and the
// panel simply doesn't show it.
const TR_ROW = (t, label) =>
  (t.match(new RegExp(`\\|\\s*\\*\\*${label}\\*\\*\\s*\\|\\s*([^|\\n]+)`, 'i')) || [])[1]?.trim() || '';
function troopStats(text) {
  const hp = TR_ROW(text, 'HP').match(/(\d+)\s*\+\s*\(?\s*(\d+)\s*[×x*]\s*(?:your\s+)?level/i);
  // "War Cry ×2 · Purge Pain ×1" → { 'War Cry': 2, 'Purge Pain': 1 }. An em dash means none.
  const charges = {};
  for (const part of TR_ROW(text, 'Charges').split('·')) {
    const m = part.match(/^\s*(.+?)\s*[×x]\s*(\d+)\s*$/);
    if (m) charges[m[1].trim()] = +m[2];
  }
  return {
    sigil: TR_ROW(text, 'Sigil').replace(/\*/g, '').slice(0, 4).toUpperCase(),
    role: TR_ROW(text, 'Role'),
    hp: hp ? { base: +hp[1], per: +hp[2] } : null,
    ac: +TR_ROW(text, 'AC').replace(/\D+/g, '') || null,
    speed: TR_ROW(text, 'Speed'),
    charges,
  };
}
function troops(id) {
  const dir = TROOPS[id] && path.join(PG, TROOPS[id]);
  if (!dir || !exists(dir)) return { types: [], shared: '' };
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
  const one = f => ({ name: path.basename(f, '.md'), text: clean(read(path.join(dir, f))) });
  const shared = files.includes(TROOP_SHARED + '.md') ? one(TROOP_SHARED + '.md').text : '';
  const rank = n => { const i = TROOP_ORDER.indexOf(n); return i < 0 ? TROOP_ORDER.length : i; };
  const secret = TROOP_SECRET[id] || {};
  const types = files.filter(f => path.basename(f, '.md') !== TROOP_SHARED).map(f => {
    const t = one(f), st = troopStats(t.text);
    if (!st.hp) console.log(`   ⚠ ${t.name}: no "**HP** | base + (per × your level)" row`);
    if (!st.sigil) console.log(`   ⚠ ${t.name}: no "**Sigil**" row — the tile will use its initials`);
    return { id: slug(t.name), ...t, img: firstPlate(t.text), ...st,
      ...(secret[t.name] ? { secret: secret[t.name] } : {}) };
  }).sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));
  return { types, shared };
}

// A Shift's page is cut into the beats the sheet's helper card runs: what happens when it opens,
// what holds while it lasts, what you can spend an action on, the Lair Action, and the collapse.
// Newer pages say "On Activation / Passive Effects / Reality Actions / Lair Action / On Collapse";
// the older three say "Domain Effects / Lair Action (Initiative 20) / Collapse Effect". Anything
// else on the page (Environment, trap libraries, appendices) is kept as reference.
const PART_OF = h => /^on activation/i.test(h) ? 'activation'
  : /^(passive effects|domain effects)/i.test(h) ? 'passives'
  : /^reality actions/i.test(h) ? 'actions'
  : /^lair action/i.test(h) ? 'lair'
  : /^(on collapse|collapse effect)/i.test(h) ? 'collapse' : null;
const PART_TITLE = { activation:'On Activation', passives:'Passive Effects', actions:'Reality Actions', lair:'Lair Action', collapse:'On Collapse' };
const unbold = s => s.replace(/\*\*/g, '').replace(/^Option\s*\d+\s*[:.]\s*/i, '').replace(/[.:]$/, '').trim();
// A bullet that names something — "- **Absolution.** …" or "- **Mass Summon** *(Action).* …" — is an
// entry of its own. A bullet that merely starts in bold ("- **cannot be turned** by any effect") is not.
const NAMED_BULLET = /^[-*]\s+\*\*[^*]+?(?:\.\*\*|\*\*\s*\*\()/;

// One section's body → its own note, then an entry per "**Name.** …" or per sub-heading.
function shiftEntries(body) {
  const lines = body.split('\n');
  if (lines.some(l => /^#{3,4} /.test(l))) {
    const out = [];
    let cur = null, note = [];
    for (const l of lines) {
      const h = l.match(/^#{3,4} (.+)$/);
      if (h) { cur = { name: unbold(h[1]), tag: '', text: [] }; out.push(cur); continue; }
      (cur ? cur.text : note).push(l);
    }
    return { note: note.join('\n').trim(), entries: out.map(e => ({ ...e, text: e.text.join('\n').trim() })) };
  }
  const out = [];
  let cur = null, note = [];
  // A list of named bullets reads as a list of entries, so each one starts its own block.
  const blocks = [];
  for (const b of body.split(/\n{2,}/)) {
    if (!NAMED_BULLET.test(b.trim())) { blocks.push(b); continue; }
    let acc = [];
    for (const line of b.split('\n')) {
      if (NAMED_BULLET.test(line)) { if (acc.length) blocks.push(acc.join('\n')); acc = [line.replace(/^[-*]\s+/, '')]; }
      else acc.push(line);
    }
    if (acc.length) blocks.push(acc.join('\n'));
  }
  for (const block of blocks) {
    const m = block.match(/^\*\*([^*]+?)[.:]?\*\*\s*(?:\*\(([^)]+)\)\*)?[.:]?\s*/);
    if (m) {
      cur = { name: unbold(m[1]), tag: (m[2] || '').trim(), text: [block.slice(m[0].length).trim()] };
      out.push(cur);
    } else (cur ? cur.text : note).push(block.trim());
  }
  return { note: note.join('\n\n').trim(), entries: out.map(e => ({ ...e, text: e.text.filter(Boolean).join('\n\n') })) };
}

function shift(id) {
  const f = SHIFTS[id] && path.join(G, 'Reality Shifts/Players', SHIFTS[id]);
  if (!f || !exists(f)) return null;
  // The page often opens with its own title and a "*Grimm: … · Owner: …*" line; the card states both.
  const text = clean(read(f))
    .replace(/^#\s+.*\n+/, '')
    .replace(/^\*Grimm:[^\n]*\n+/, '')
    .replace(/^_[^\n_]*Exclusive_\s*\n+/i, '')
    .replace(/^-{3,}\s*\n+/, '')
    .trim();

  const chunks = text.split(/^## /m);
  const parts = {}, extra = [];
  for (const c of chunks.slice(1)) {
    const nl = c.indexOf('\n');
    const head = c.slice(0, nl).trim(), body = c.slice(nl + 1).trim();
    // "While Active" is only a wrapper: its ### sections are the real parts.
    if (/^while active/i.test(head)) {
      for (const s of body.split(/^### /m).slice(1)) {
        const i = s.indexOf('\n');
        const h = s.slice(0, i).trim(), key = PART_OF(h);
        if (key) parts[key] = { title: h.replace(/\s*\*\(.*/, '').trim(), ...shiftEntries(s.slice(i + 1).trim()) };
      }
      continue;
    }
    const key = PART_OF(head);
    if (key) parts[key] = { title: head.replace(/\s*\(.*/, '').replace(/\s*\*\(.*/, '').trim(), ...shiftEntries(body) };
    else extra.push({ title: head, text: body });
  }
  const order = ['activation', 'passives', 'actions', 'lair', 'collapse'];
  const intro = chunks[0].trim();
  // The domain's plate, lifted out of the intro so the app can use it as art rather than only as a
  // picture in a body of prose: the activation cinematic opens on it and the sheet wears it while
  // the Shift holds. `clean()` has already copied it into img/ and rewritten the embed, so this is
  // just reading back the URL it produced. No plate in the note simply means no art — every caller
  // checks, and the Shift looks exactly as it did before.
  const art = (intro.match(/!\[[^\]]*\]\((img\/[^)]+)\)/) || [])[1] || null;
  return {
    name: path.basename(f, '.md'),
    intro, art,
    parts: order.filter(k => parts[k]).map(k => ({ key: k, title: PART_TITLE[k], ...parts[k] })),
    extra, text,
  };
}
// The rules every Reality Shift shares. Kept out of the Rules tab: it rides with a revealed Shift.
function shiftRules() {
  const f = path.join(G, 'Lore/Reality Shift.md');
  return exists(f) ? clean(read(f)) : '';
}
function soulStones() {
  const dir = path.join(PG, 'Ouroboros Vigil/Soul Stones');
  const sdir = path.join(PG, 'Ouroboros Vigil/Spirits');
  if (!exists(dir)) return [];
  const spirits = {};
  for (const f of fs.readdirSync(sdir)) spirits[f.replace(/\.md$/, '')] = clean(read(path.join(sdir, f)));
  return fs.readdirSync(dir).filter(f => f.endsWith('.md')).map(f => {
    const raw = read(path.join(dir, f));
    const link = (raw.match(/assume the powers of the \[\[([^\]|]+)/) || [])[1];
    const cr = spirits[link] && (spirits[link].match(/\*\*Challenge\*\*\s*([\d/]+)/) || [])[1];
    const traits = [...clean(raw).matchAll(/^#{2,3} (.+)$/gm)].map(m => m[1].trim().replace(/\.$/, ''))
      .filter(n => !/Spirit$|King Goblin$/.test(n));
    return { name: f.replace(/ Soul Stone\.md$/, ''), cr: cr || '', traits,
      text: clean(raw), spirit: link || '', spiritText: spirits[link] || '' };
  });
}

// ── pair actions ─────────────────────────────────────────────────────────
function pairs() {
  const md = read(path.join(G, 'Vinculum Grimm Actions.md'));
  const rows = md.split('\n').filter(l => /^\|/.test(l) && !/^\|\s*:?-/.test(l));
  const cells = r => r.split('|').slice(1, -1).map(c => c.trim());
  const heads = cells(rows[0]).slice(1);
  const matrix = {}, actions = {};
  for (const r of rows.slice(1)) {
    const c = cells(r), who = c[0];
    matrix[who] = {};
    c.slice(1).forEach((cell, i) => {
      if (!cell || cell === '-') return;
      const n = cell.replace(/\[\[|\]\]/g, '').trim();
      matrix[who][heads[i]] = n;
      const f = path.join(G, 'Vinculum Actions', n + '.md');
      if (!(n in actions)) actions[n] = exists(f) && fs.statSync(f).size > 0 ? clean(read(f)) : '';
    });
  }
  // The lines under the table ("Salomon - Rory") are the pairs currently synced.
  const current = [...md.matchAll(/^(\w+)\s+-\s+(\w+)\s*$/gm)].map(m => [m[1], m[2]]);
  return { players: heads, matrix, actions, current };
}

// ── rules ────────────────────────────────────────────────────────────────
function rules() {
  return RULES.filter(([, , f]) => exists(path.join(G, f))).map(([id, title, f]) => {
    let text = clean(read(path.join(G, f)));
    if (id === 'vinculum') text = text.replace(/\n\|[\s\S]*$/, '').trim();  // matrix is its own page
    return { id, title, text };
  });
}

// ── write ────────────────────────────────────────────────────────────────
const data = {
  built: new Date().toISOString().slice(0, 10),
  grimms: GRIMMS.map(m => {
    const tr = troops(m.id);
    return { ...parseGrimm(m), servants: servants(m.id), troops: tr.types, troopTraits: tr.shared,
      shift: shift(m.id), shackle: shackle(m.id) };
  }),
  realityShift: shiftRules(),
  soulStones: soulStones(),
  pairs: pairs(),
  rules: rules(),
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT,
  '// Generated by tools/build-data.mjs from the Obsidian vault — do not edit by hand.\n' +
  'window.GRIMM_DATA = ' + JSON.stringify(data, null, 1) + ';\n');

for (const g of data.grimms)
  console.log(`${g.name.padEnd(18)} ${g.abilities.length} abilities, ${g.stances.length} stances, shift: ${g.shift ? g.shift.name : '—'}, shackle: ${g.shackle ? g.shackle.name : '—'}${
    g.troops.length ? `, troops: ${g.troops.map(t => `${t.name}${t.img ? '' : ' (no art)'}`).join(' · ')}` : ''}`);
console.log(`${data.soulStones.length} soul stones · ${Object.keys(data.pairs.actions).length} pair actions · ${data.rules.length} rule pages`);
const art = [...artCopied.values()].filter(Boolean).length;
console.log(`${art} image${art === 1 ? '' : 's'} copied to grimms/img/${artMissing.size ? `\n⚠ not found in resources/: ${[...artMissing].join(', ')}` : ''}`);
console.log('→', path.relative(process.cwd(), OUT));
