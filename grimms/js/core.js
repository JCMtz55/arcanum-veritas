// State, persistence, the rules' numbers, and small shared helpers.
// Plain scripts sharing one global scope, like the seal composer.

const D = window.GRIMM_DATA;
const KEY = 'grimm-companion:v1';

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
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

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

// The chains, each Grimm's Reality Shift and which abilities it may use are the DM's to keep.
// Opened through the Ephemer server, ROLE says who is looking and the server's answer wins; on a
// plain static host nothing is fetched, so abilities are all open and no Reality Shift is shown.
let ROLE = null, TOGGLES = {};
async function syncGrimms() {
  try {
    const me = await fetch('../api/me');
    if (!me.ok) return;
    ROLE = (await me.json()).user.role;
    const { chains, toggles } = await (await fetch('../api/grimms/state')).json();
    TOGGLES = toggles || {};
    for (const g of D.grimms) sheet(g.id).chains = chains[g.id] ?? g.chains;
    save();
  } catch (e) {}
}
// Abilities are open unless the DM has switched one off; a Reality Shift stays hidden until revealed.
const abilityOn = (gid, aid) => TOGGLES[gid]?.['a:' + aid] !== false;
const shiftOn = gid => TOGGLES[gid]?.shift === true;
const abilitiesOf = g => g.abilities.filter(a => abilityOn(g.id, a.id));

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
function fitLoadout(g, sh) {
  const n = ABILITY_SLOTS[sh.stage], def = defaultLoadout(g, sh.stage);
  for (const k of ['passive', 'active', 'super']) {
    let arr = (sh.loadout[k] || []).filter(id => { const a = g.abilities.find(x => x.id === id); return a && unlocked(a, sh.stage) && abilityOn(g.id, id); });
    arr = arr.slice(0, n[k]);
    for (const id of def[k]) if (arr.length < n[k] && !arr.includes(id)) arr.push(id);
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
