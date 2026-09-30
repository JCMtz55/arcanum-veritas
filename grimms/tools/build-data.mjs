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
const SERVANTS = { 'gate-of-caelum': ['Gate of Caelum/Servants/Silence.md'] };

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

// Obsidian → plain markdown the site's renderer understands.
function clean(md) {
  return md
    .replace(/^---\n[\s\S]*?\n---\n/, '')               // frontmatter
    .replace(/%%[\s\S]*?%%/g, '')                        // Obsidian comments
    .replace(/!\[\[[^\]]*\]\]/g, '')                     // embeds
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
  return { ...meta, name, forms, images: { invoked: imgs[0] || '', awakened: imgs[1] || '' },
    abilities, stances };
}

// ── statblocks: Gate of Caelum servants, Ouroboros soul stones & spirits ─
function servants(id) {
  return (SERVANTS[id] || []).filter(f => exists(path.join(PG, f))).map(f => ({
    name: path.basename(f, '.md'), text: clean(read(path.join(PG, f))),
  }));
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
  return {
    name: path.basename(f, '.md'),
    intro: chunks[0].trim(),
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
  grimms: GRIMMS.map(m => ({ ...parseGrimm(m), servants: servants(m.id), shift: shift(m.id) })),
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
  console.log(`${g.name.padEnd(18)} ${g.abilities.length} abilities, ${g.stances.length} stances, shift: ${g.shift ? g.shift.name : '—'}`);
console.log(`${data.soulStones.length} soul stones · ${Object.keys(data.pairs.actions).length} pair actions · ${data.rules.length} rule pages`);
console.log('→', path.relative(process.cwd(), OUT));
