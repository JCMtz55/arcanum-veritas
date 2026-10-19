// State, persistence, the rules' numbers, and small shared helpers.
// Plain scripts sharing one global scope, like the seal composer.

const D = window.GRIMM_DATA;
const KEY = 'grimm-companion:v1';

// A Shackle Break is authored in a file of its own and arrives in `g.shackle`, not in `g.abilities`
// — so the server can withhold an unrevealed one (Salomon's Parted Gates) exactly the way it
// withholds an unrevealed Reality Shift, and its text never reaches that reader's browser at all.
// Merge it back into the ability list once, here, so everything downstream keeps finding it where it
// has always been: a `kind: 'shackle'` entry in `g.abilities`.
for (const g of (D.grimms || []))
  if (g.shackle && !(g.abilities || []).some(a => a.kind === 'shackle'))
    (g.abilities = g.abilities || []).push(g.shackle);

const STAGES = ['dormant', 'invoked', 'chained', 'awakened', 'unveiled'];
const STAGE_NAME = { dormant:'Dormant', invoked:'Invoked', chained:'Chained', awakened:'Awakened', unveiled:'Unveiled' };
// Grimm Slots and ability slots by stage (Grimm Slots.md, Grimm Abilities.md).
// Unveiled adds nothing to either (Juan's ruling, 2026-09-30): it is Awakened plus the Reality Shift.
const SLOTS_BY_STAGE = { dormant:0, invoked:3, chained:6, awakened:6, unveiled:6 };
const ABILITY_SLOTS = {
  dormant:  { passive:0, active:0, super:0 },
  invoked:  { passive:1, active:2, super:0 },
  chained:  { passive:1, active:2, super:1 },
  awakened: { passive:2, active:2, super:1 },
  unveiled: { passive:2, active:2, super:1 },
};
const KIND_NAME = { passive:'Passive', active:'Active', super:'Special', core:'Core', shackle:'Shackle Break', other:'Other' };
const CHAIN_STATE = ['Unchained', 'Fraying', 'Loosened', 'Bound'];
const DAMAGE_TYPES = ['Acid','Bludgeoning','Cold','Fire','Force','Lightning','Necrotic','Piercing','Poison','Psychic','Radiant','Slashing','Thunder'];

const grimmById = id => D.grimms.find(g => g.id === id);

// ── state ──────────────────────────────────────────────────────────────
function blankSheet(g) {
  return {
    level: 10, stage: 'awakened', dreamMod: 0, intMod: 3, maxHp: 100, ac: 16,
    used: 0, temp: 0, tempUsed: 0,
    exhaustion: 0, dreamExhaustion: 0, inCombat: false, familiar: false,
    loadout: null,
    chains: g.chains,
    effects: [], round: 1,
    rs: { on: false, crits: 0, lair: 0 },   // a Reality Shift while it is running
    x: {},                               // Grimm-specific trackers
  };
}
function load() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
  s = s && typeof s === 'object' ? s : {};
  s.current = grimmById(s.current) ? s.current : null;
  s.sheets = s.sheets || {};
  s.party = Object.assign({ players: 6, tokens: 4, sightAttempt: 1 }, s.party);
  s.view = s.view || 'sheet';
  return s;
}
const S = load();
// localStorage is the working copy; the Servants also go up to the server, debounced. Every
// mutation in the app already calls save(), which is why the mirror hangs off it rather than off
// forty call sites.
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
  try { queueSouls(); } catch (e) {}
}

function sheet(id = S.current) {
  const g = grimmById(id);
  if (!S.sheets[id]) S.sheets[id] = blankSheet(g);
  const sh = S.sheets[id];
  // fill fields added after a sheet was first saved
  const b = blankSheet(g);
  for (const k in b) if (!(k in sh)) sh[k] = b[k];
  if (!sh.loadout) sh.loadout = defaultLoadout(g, sh.stage);
  return sh;
}

// ── the numbers ────────────────────────────────────────────────────────
const pbOf = lvl => 2 + Math.floor((Math.max(1, lvl) - 1) / 4);
const stageIdx = st => STAGES.indexOf(st);

// The chains, each Grimm's Reality Shift and which abilities it may use are the DM's to keep —
// they are set on the Admin page and only read here. Opened through the Ephemer server the
// server's answer wins; on a plain static host nothing is fetched, so abilities are all open and
// no Reality Shift is shown.
let TOGGLES = {};
async function syncGrimms() {
  try {
    const me = await fetch('../api/me');
    if (!me.ok) return;
    const { chains, toggles } = await (await fetch('../api/grimms/state')).json();
    TOGGLES = toggles || {};
    for (const g of D.grimms) sheet(g.id).chains = chains[g.id] ?? g.chains;
    save();
  } catch (e) {}
}
// ── Servants, kept on the server ───────────────────────────────────────
// A player's roster used to live only in this browser, so clearing site data lost it, a second
// device saw nothing, and an upgrade to a vault Servant had nowhere to be written down. Now the
// sheet's `x.souls` / `x.edits` / `x.statblocks` are mirrored to grimm_souls, keyed by soul.
//
// localStorage stays the working copy and the offline fallback: on a static host nothing is fetched
// and everything below no-ops, exactly as the chains and toggles do.
let SOULS_SYNCED = false;

// The three bags the sheet keeps → one record per soul, which is what the server stores.
function soulsPayload(gid) {
  const x = sheet(gid).x || {}, own = {}, out = {};
  for (const b of (x.statblocks || [])) own[b.id] = b;
  const keys = new Set([...Object.keys(x.souls || {}), ...Object.keys(x.edits || {}), ...Object.keys(own)]);
  for (const k of keys)
    out[k] = { edits: own[k] || (x.edits || {})[k] || {}, state: (x.souls || {})[k] || {} };
  return out;
}
// …and back again. A record whose `edits` has a name is a soul the player wrote; the rest are
// layers on a vault Servant's numbers.
function applySouls(gid, bag) {
  const x = sheet(gid).x;
  x.souls = {}; x.edits = {}; x.statblocks = [];
  for (const [k, v] of Object.entries(bag || {})) {
    x.souls[k] = v.state || {};
    if (v.edits && v.edits.name) x.statblocks.push({ ...v.edits, id: k });
    else if (v.edits && Object.keys(v.edits).length) x.edits[k] = v.edits;
  }
  x.vaultKeyed = true;   // the server only ever holds name-keyed ids
}
async function syncSouls() {
  try {
    const r = await fetch('../api/grimms/souls');
    if (!r.ok) return;
    const { grimms, adopted } = await r.json();
    for (const g of D.grimms) {
      const bag = grimms[g.id], has = bag && Object.keys(bag).length;
      if (has) applySouls(g.id, bag);
      // Nothing on the server and this browser was never adopted: hand up what it has, once.
      else if (!(adopted || []).includes(g.id) && Object.keys(soulsPayload(g.id)).length)
        await pushSouls(g.id, true);
    }
    SOULS_SYNCED = true;
    save();
  } catch (e) {}
}
// Debounced, because every pip click calls save(). The last write for a Grimm wins.
const pushTimers = {};
async function pushSouls(gid, adopt) {
  try {
    await fetch('../api/grimms/souls/' + encodeURIComponent(gid), {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ souls: soulsPayload(gid), adopt: !!adopt }),
    });
  } catch (e) {}
}
function queueSouls(gid = S.current) {
  if (!SOULS_SYNCED || !gid) return;      // static host, or the first load has not answered yet
  clearTimeout(pushTimers[gid]);
  pushTimers[gid] = setTimeout(() => pushSouls(gid), 800);
}

// Abilities are open unless the DM has switched one off; a Reality Shift stays hidden until revealed.
const abilityOn = (gid, aid) => TOGGLES[gid]?.['a:' + aid] !== false;
const shiftOn = gid => TOGGLES[gid]?.shift === true;
// A Shackle Break is hidden until the DM reveals it, exactly as a Reality Shift is — the Admin page
// has always said so and has always had this switch. The server withholds an unrevealed Break from a
// *player's* copy of data.js, which is why this was never missed; but the DM is served every Break,
// so without this check the Admin page could read "Shackle Break hidden" while the sheet still
// offered the button. Filtered here rather than at each call site so the side column, the ability
// list and the Compendium all agree.
const breakOn = gid => TOGGLES[gid]?.shackle === true;
const abilitiesOf = g => g.abilities.filter(a =>
  abilityOn(g.id, a.id) && (a.kind !== 'shackle' || breakOn(g.id)));

function derived(sh = sheet()) {
  const pb = pbOf(sh.level);
  const base = SLOTS_BY_STAGE[sh.stage];
  const left = Math.max(0, base - sh.used) + Math.max(0, sh.temp - sh.tempUsed);
  return {
    pb, base, left,
    total: base + sh.temp,
    dreamDC: 8 + pb + sh.dreamMod,          // Shackle Break end, Dream saves vs self
    chainState: CHAIN_STATE[sh.chains],
    abilitySlots: ABILITY_SLOTS[sh.stage],
  };
}

// Which abilities a stage can hold. Awakened abilities open at Chained — the Fourth
// Chain brings an Invoked Grimm to "almost Awakened" power. Additional abilities are
// open to any stage that can compose (Changing Grimm Abilities).
function unlocked(a, stage) {
  const s = stageIdx(stage);
  if (a.stage === 'invoked' || a.stage === 'additional') return s >= 1;
  if (a.stage === 'awakened') return s >= 2;
  if (a.stage === 'shackle') return s >= 1;
  return true;
}
const slotKind = a => a.kind === 'passive' ? 'passive' : a.kind === 'super' ? 'super' : a.kind === 'active' ? 'active' : null;

// ── A Shackle Break while it is running ────────────────────────────────
// It is "on" for exactly as long as its duration sits on the round tracker, which is what Use put
// there and what the round tracker takes away — so nothing extra has to be stored or kept in sync.
function shackleOn(sh = sheet(), g = grimmById(S.current)) {
  return (g.abilities || []).find(a => a.kind === 'shackle' && (sh.effects || []).some(e => e.name === a.name)) || null;
}
// Inside a Shackle Break, "### Fake Death +" is what Fake Death becomes while it holds. Pull those
// out keyed by the ability they evolve, so the sheet can show the + form in place of the original.
function plusForms(a) {
  const out = {};
  if (!a) return out;
  const t = String(a.text || ''), heads = [...t.matchAll(/^#{3,4} (.+)$/gm)];
  heads.forEach((h, i) => {
    const name = h[1].trim();
    if (!/\+$/.test(name)) return;
    const end = i + 1 < heads.length ? heads[i + 1].index : t.length;
    out[name.replace(/\s*\+$/, '').trim().toLowerCase()] = t.slice(h.index + h[0].length, end).trim();
  });
  return out;
}

function defaultLoadout(g, stage) {
  const n = ABILITY_SLOTS[stage], out = { passive:[], active:[], super:[] };
  for (const a of abilitiesOf(g)) {
    const k = slotKind(a);
    if (k && unlocked(a, stage) && a.stage !== 'additional' && out[k].length < n[k]) out[k].push(a.id);
  }
  for (const a of abilitiesOf(g)) {              // top up with additional abilities
    const k = slotKind(a);
    if (k && unlocked(a, stage) && !out[k].includes(a.id) && out[k].length < n[k]) out[k].push(a.id);
  }
  return out;
}
// Keep the loadout the right size when the stage changes.
//
// Only a sheet that has never composed this kind gets the default loadout. Once the array exists
// it is the player's own arrangement and is kept exactly as it stands, blanks included: with the
// hotbar as the loadout an emptied socket is a decision, and the old behaviour — drop the blanks,
// then top back up from the defaults — meant "clear this slot" silently refilled itself and an
// empty socket could never be seen. An ability that has become invalid (locked by the stage, or
// switched off by the DM) is blanked in place rather than closing the gap, so nothing else slides
// along the bar underneath someone's hand mid-fight.
function fitLoadout(g, sh) {
  const n = ABILITY_SLOTS[sh.stage], def = defaultLoadout(g, sh.stage);
  for (const k of ['passive', 'active', 'super']) {
    const fresh = !Array.isArray(sh.loadout[k]);
    let arr = fresh ? [] : sh.loadout[k].map(id => {
      const a = id && g.abilities.find(x => x.id === id);
      return a && unlocked(a, sh.stage) && abilityOn(g.id, id) ? id : '';
    });
    arr = arr.slice(0, n[k]);
    if (fresh) for (const id of def[k]) if (arr.length < n[k] && !arr.includes(id)) arr.push(id);
    while (arr.length < n[k]) arr.push('');
    sh.loadout[k] = arr;
  }
}

// ── helpers ────────────────────────────────────────────────────────────
const $ = s => document.querySelector(s);
const d = n => 1 + Math.floor(Math.random() * n);
function roll(count, sides) { let t = 0; const r = []; for (let i = 0; i < count; i++) { const v = d(sides); r.push(v); t += v; } return { t, r }; }
const sign = n => (n >= 0 ? '+' : '') + n;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), 2200);
}
function attr(s) { return esc(s).replace(/'/g, '&#39;'); }

// ── Lightbox ───────────────────────────────────────────────────────────
// The plates are the thing on this site people actually want to look at, and every surface shows
// them small: a 66px sigil, a 118px portrait, a column-width card. Any of them opens full size
// here. Click anywhere or press Escape to close; the image itself is `contain`, never cropped,
// because being able to see the whole painting is the entire point of opening it.
function lightbox(src, caption) {
  if (!src) return;
  document.getElementById('lbox')?.remove();
  const el = document.createElement('div');
  el.id = 'lbox';
  el.className = 'lbox';
  el.innerHTML = `<img src="${attr(src)}" alt="${attr(caption || '')}">
    ${caption ? `<figcaption>${esc(caption)}</figcaption>` : ''}
    <span class="lbox-x" aria-hidden="true">×</span>`;
  const key = e => { if (e.key === 'Escape') { e.stopPropagation(); off(); } };
  const off = () => { el.remove(); document.removeEventListener('keydown', key, true); };
  el.addEventListener('click', off);
  document.addEventListener('keydown', key, true);
  document.body.append(el);
}
// A CSS background is not an <img>, so the url() has to be unwrapped before it can be opened.
const bgUrl = el => (getComputedStyle(el).backgroundImage.match(/url\(["']?(.*?)["']?\)/) || [])[1] || '';

// Rendered vault text, with the numbers the player needs pinned beside the words.
function prose(text, sh) {
  let html = md(text);
  if (!sh) return `<div class="prose">${html}</div>`;
  const pb = pbOf(sh.level);
  const chip = v => `<span class="calc">${v}</span>`;
  html = html.replace(/(>[^<]*)/g, seg => seg
    .replace(/\b(P(?:ro|or)f(?:\.|iciency)?\s?Bonus|Proficiency(?!\s+(?:Level|Bonus))|PB)\b(?!\s*\()/g, m => m + chip(pb))
    .replace(/\b((?:Grimm User(?:'s|’s)?|its|your) (?:Total )?Level|Total Level)\b/g, m => m + chip(sh.level)));
  return `<div class="prose">${html}</div>`;
}

function openDialog(title, bodyHtml) {
  const dl = $('#dlg');
  dl.innerHTML = `<div class="dlg-h"><h3>${esc(title)}</h3><span class="sp"></span><button class="btn" onclick="this.closest('dialog').close()">Close</button></div><div class="dlg-b">${bodyHtml}</div>`;
  dl.showModal();
}
