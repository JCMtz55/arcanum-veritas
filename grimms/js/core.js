// State, persistence, the rules' numbers, and small shared helpers.
// Plain scripts sharing one global scope, like the seal composer.

// ⚠️ `|| { grimms: [] }` is load-bearing. `js/data.js` is a separate script tag, and when it does
// not arrive — the server going away under an open tab, a reload on a dropped connection — this
// file used to die on its very next line, which took `$` and everything after it with it. The page
// went blank with two console errors and no explanation. It degrades instead now: NO_BOOK is true,
// render() says so, and nothing downstream has to ask whether there is a book.
const D = window.GRIMM_DATA || { grimms: [] };
const NO_BOOK = !(D.grimms || []).length;
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
    // The last Long Rest this browser has acted on. A rest taken on the character sheet restores
    // the shared slots and stamps the row; this is how that page knows it has already finished its
    // own half of it (the effects, the round, the hooks, the charges) and must not do it twice.
    restedSeen: '', shortRestedSeen: '',
    // Which fight the round above belongs to. The board mints one when the DM starts a fight; an
    // id this page has not seen means the round it is holding is from a fight that is over.
    fightId: '',
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
  try { queueLive(); } catch (e) {}
  try { queueExh(); } catch (e) {}
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

// ── Whose sheet this is ────────────────────────────────────────────────
// This page used to ask the browser. The chooser offered all eight Grimms, the bar kept a switcher,
// and the answer lived in localStorage — so any signed-in player could open another player's sheet
// and start spending their slots, and a shared laptop handed the next person whatever the last one
// picked. The DM now says who holds which Grimm (Admin › Players) and the server hands that down on
// /api/me, the same answer the character sheet reads.
//
// Three states, because the answer is not always there:
//   MINE + LOCKED  — the DM has assigned it. The sheet is theirs and the switcher is gone.
//   MINE           — nobody assigned anything; the server MATCHED the account name to a Grimm and
//                    is guessing. Open there, but leave them free to move: a guess must not lock a
//                    player out of their own Grimm before the DM has been round the party.
//   neither        — the DM (who holds no Grimm and drives any of them at the table), an account
//                    that matches nothing, or a static host where nothing is fetched at all. The
//                    chooser behaves exactly as it always did.
let ME = null, MINE = null, LOCKED = false, ME_PENDING = true;

function bindToMine() {
  MINE = ME && grimmById(ME.grimmId) ? ME.grimmId : null;
  LOCKED = !!(MINE && ME.grimmAssigned);
  // The table shares devices, and this choice used to be nothing but a line in localStorage — so the
  // next person to sign in on the same laptop opened on whatever the last one was holding. It now
  // travels with the account that made it. A state from before this page knew who you were has no
  // owner and is adopted rather than thrown away.
  const uid = ME ? ME.id : null;
  if (S.owner == null) S.owner = uid;
  else if (S.owner !== uid) { S.owner = uid; S.current = null; }
  // Assigned: theirs, whatever this device was last looking at. Only guessed: open there, but a
  // choice already made by this account stands.
  if (MINE && (LOCKED || !S.current)) { S.current = MINE; sheet(); }
  save();
}

async function syncGrimms() {
  try {
    const me = await fetch('../api/me');
    if (!me.ok) return;
    ME = (await me.json()).user || null;
    bindToMine();
    const { chains, toggles } = await (await fetch('../api/grimms/state')).json();
    TOGGLES = toggles || {};
    for (const g of D.grimms) sheet(g.id).chains = chains[g.id] ?? g.chains;
    save();
  } catch (e) {} finally { ME_PENDING = false; }
}
// ── The Grimm Slots, mirrored to the server ────────────────────────────
// The character sheet carries this tracker too now (Juan, 2026-11-17), so these five numbers are a
// row as well as a line in localStorage. localStorage stays the working copy and the offline
// fallback: served from a folder with no server behind it, everything here no-ops exactly as the
// chains, the toggles and the Servants do.
//
// What travels is only what the two pages have to agree about — the stage, the slots spent, the
// temporary ones and Familiar form. The round tracker, the loadout and the effects stay in this
// browser, which is the only place that needs them.
let LIVE_SYNCED = false, applyingLive = false;
const liveOf = sh => ({ stage: sh.stage, used: sh.used, temp: sh.temp, tempUsed: sh.tempUsed, familiar: !!sh.familiar });

async function syncLive() {
  try {
    const r = await fetch('../api/grimms/live');
    if (!r.ok) return;
    const { grimms } = await r.json();
    applyingLive = true;          // the server's answer must not bounce straight back as a write
    const restedElsewhere = [], shortRestedElsewhere = [];
    for (const g of D.grimms) {
      const row = grimms[g.id];
      if (!row) continue;
      const sh = sheet(g.id), stageMoved = sh.stage !== row.stage;
      sh.stage = row.stage; sh.used = row.used; sh.temp = row.temp;
      sh.tempUsed = row.tempUsed; sh.familiar = row.familiar;
      // A stage arriving from elsewhere changes how many ability sockets there are, so the loadout
      // has to be refitted exactly as it is when the stage is changed on this page.
      if (stageMoved) fitLoadout(g, sh);
      // A Long Rest taken on the character sheet. The slots came back with the row above; what is
      // left is everything only this page knows how to do.
      //
      // ⚠️ Acted on only while the stamp is FRESH. A browser opening this Grimm for the first time
      // reads whatever rest was last taken — possibly weeks ago — and must not replay it over a
      // fight in progress. It is recorded either way, so it is read once and never again. The
      // window is wide enough to survive the clock being a little out at either end, and the cost
      // of missing one is a button the player presses themselves.
      if (freshRest(sh, 'restedSeen', row.restedAt) && g.id === S.current) restedElsewhere.push(g);
      // A Short Rest has nothing shared to bring back — the whole of it is the Servant charges
      // whose rule says a short rest refills them, and only this page knows which those are.
      if (freshRest(sh, 'shortRestedSeen', row.shortRestedAt) && g.id === S.current)
        shortRestedElsewhere.push(g);
    }
    // Finishing a rest somebody took on the character sheet: the effects, the round and this
    // Grimm's own hooks and Servant charges. Run inside `applyingLive` so it is not mistaken for a
    // fresh edit and pushed straight back up.
    for (const g of restedElsewhere) longRestTail(g);
    let shortCharges = 0;
    for (const g of shortRestedElsewhere)
      shortCharges += (typeof trRefill === 'function' ? trRefill('short') : 0);
    LIVE_SYNCED = true;
    save();
    applyingLive = false;
    if (restedElsewhere.length && typeof toast === 'function')
      toast('A Long Rest was taken on your character sheet — slots, charges and effects restored.');
    else if (shortRestedElsewhere.length && typeof toast === 'function')
      toast(shortCharges
        ? `A Short Rest was taken on your character sheet — ${shortCharges} Servant charge${shortCharges > 1 ? 's' : ''} refilled.`
        : 'A Short Rest was taken on your character sheet — nothing of the Grimm\'s refills on one.');
    // Nothing on the server for the Grimm in hand — this account has never opened the Companion
    // with the server behind it. Hand up what this browser is holding rather than starting it over.
    if (S.current && !grimms[S.current]) await pushLive(S.current);
  } catch (e) { applyingLive = false; }
}

// Everything a Long Rest does that is NOT the slots. Pulled out of longRest() so that a rest taken
// on the character sheet and a rest taken here do exactly the same thing to this browser, rather
// than two lists that drift. The slots themselves are already zero by the time this runs — the
// server did them, because they are the half both screens share.
function longRestTail(g) {
  const sh = sheet(g.id);
  sh.effects = []; sh.round = 1; sh.inCombat = false;
  if (LONG_REST[g.id]) LONG_REST[g.id](sh);
  // Servant charge trackers refill by their own rule, and only for the Grimm in hand: trRefill
  // works on the current sheet.
  return g.id === S.current && typeof trRefill === 'function' ? trRefill('long') : 0;
}

// A rest taken HERE is written down the same way, so there is one record of the last Long Rest
// whichever screen took it — and so the character sheet's tracker shows full slots at once. The
// stamp that comes back is adopted, or this page would read its own rest as somebody else's and
// clear the effects a second time.
async function stampRest(gid, kind = 'long') {
  if (!LIVE_SYNCED || !gid) return;          // a static host has no row to stamp
  try {
    const r = await fetch(`../api/grimms/live/${encodeURIComponent(gid)}/rest`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind }),
    });
    if (!r.ok) return;
    const { live } = await r.json();
    applyingLive = true;
    const sh = sheet(gid);
    sh.restedSeen = live.restedAt || '';
    sh.shortRestedSeen = live.shortRestedAt || '';
    save();
    applyingLive = false;
  } catch (e) { applyingLive = false; }
}

// A stamp is read ONCE, and acted on only while it is fresh. A browser opening a Grimm it has not
// seen for a week reads whatever rest was last taken there and must not replay it over a fight in
// progress; the window is wide enough to survive a clock being out at either end, and the cost of
// missing one is a button the player presses themselves. Recorded either way, so it is never read
// twice. Returns whether this one is to be acted on.
function freshRest(sh, key, stamp) {
  if (!stamp || stamp === sh[key]) return false;
  const age = Date.now() - Date.parse(stamp);
  sh[key] = stamp;
  return age < 10 * 60 * 1000 && age > -10 * 60 * 1000;
}

// Debounced, because every pip click calls save(). The last write for a Grimm wins, which is the
// same promise the Servants make and the right one for numbers a single player is changing.
const liveTimers = {};
function queueLive() {
  if (!LIVE_SYNCED || applyingLive || !S.current) return;
  const gid = S.current;
  clearTimeout(liveTimers[gid]);
  liveTimers[gid] = setTimeout(() => pushLive(gid), 600);
}
async function pushLive(gid) {
  try {
    await fetch(`../api/grimms/live/${encodeURIComponent(gid)}`, {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(liveOf(sheet(gid))),
    });
  } catch (e) {}
}

// ── What the character already knows ───────────────────────────────────
// Juan, 2026-11-17: this page's Exhaustion and Dream Exhaustion and the character sheet's "in
// physical / in dream" are the SAME two numbers, and the table was keeping them twice. ⭐ The sheet
// is the home — it has the 0–6 ladder, the 0–8 Dream ladder with its roll penalties, the rest rules
// and the level-8 save; this page had two steppers and no rules at all. So these are read from and
// written to the player's character, and what is kept here is a mirror of it.
//
// 2026-11-18: the **Level** and the **Dream mod** turned out to be the same story, and a worse one,
// because this page was not mirroring them — it was ASKING. A stepper and a text box in the bar,
// kept in whichever browser the player happened to be holding, and they decide:
//   · the proficiency bonus, and so every DC this Grimm has
//   · what the ability text itself says, wherever it reads "Grimm User's Level"
//   · Gate of Caelum's roster size and Max CR, and Víðarr's Blood threshold
//   · the Dream save that closes a Shackle Break, and a Reality Shift's escape DC
// ⚠️ **Neither is the player's to set.** The level is the DM's column, and the Dream mod is the
// character's own DRE score through the engine. Both are READ here and never written back.
//
// All of it is written onto EVERY Grimm's sheet, not just the one in hand, because none of it
// belongs to the Grimm: switching Grimm must not appear to change the person holding it.
let CHAR_SYNCED = false, CHAR = null;
// Dream Exhaustion is a 0-6 ladder since the 2026-11-18 rework, same length as the physical track.
// Kept as its own constant rather than merged with EXH_MAX: the two are separate rules that happen
// to share a ceiling, and the next change to either should not silently move the other.
const EXH_MAX = 6, DREAM_EXH_MAX = 6;

function applyChar(d) {
  applyingLive = true;
  for (const g of D.grimms) {
    const sh = sheet(g.id);
    sh.exhaustion = d.exhaustion;
    sh.dreamExhaustion = d.dreamExhaustion;
    if (Number.isInteger(d.level)) sh.level = d.level;
    if (Number.isInteger(d.dreamMod)) sh.dreamMod = d.dreamMod;
  }
  save();
  applyingLive = false;
}

async function syncChar() {
  try {
    const r = await fetch('../api/me/character');
    if (!r.ok) return;
    const d = await r.json();
    CHAR = d.character;
    // No character on this account yet. The dials keep working on this page's own numbers and the
    // bar says where they will come from once there is a sheet to read.
    if (!CHAR) return;
    applyChar(d);
    CHAR_SYNCED = true;
    applyFight(d);
  } catch (e) { applyingLive = false; }
}

// ── The fight, as the table is running it ──────────────────────────────
// Juan, 2026-11-18. This page counted its own rounds with its own button, while the DM's board was
// already writing the round onto every character sheet at the table — so the number that expires a
// **Shackle Break** and collapses a **Reality Shift** was a number somebody here was pressing by
// hand. Now the board drives it.
//
// ⭐ The rounds are REPLAYED rather than assigned: the board moving from 3 to 5 runs nextRound()
// twice, so durations tick down and a Break ends where it should. The arithmetic stays exactly
// where it already lived — which is the same choice the character sheet made.
//
// Deliberately NOT taken away: the player's own Next round button. A table where the DM forgets to
// press theirs should not leave seven people unable to count.
const FIGHT_CATCHUP_MAX = 20;

function applyFight(d) {
  if (!S.current || !d) return;
  const sh = sheet(), id = d.fightId || '';

  // A NEW fight is not a round going by. End the one this page is holding — which clears what it
  // left running — and start again from the board's number.
  //
  // ⚠️ Unless this page has never seen ANY fight. A browser whose first sync lands in the middle of
  // one — a reload, or the first load after this shipped — has a round and effects that are
  // perfectly real, and must not have them cleared for the crime of not recognising the id.
  if (id && id !== sh.fightId) {
    const firstEver = !sh.fightId;
    sh.fightId = id;
    if (!firstEver) endCombat();                   // round 1, effects gone, out of combat
    sh.round = Math.max(1, +d.round || 1);
    sh.inCombat = !!d.inCombat;
    save(); render();
    if (firstEver) return;
    return toast(d.inCombat ? 'The fight begins — round 1.' : 'The fight ended.');
  }
  if (!d.inCombat && sh.inCombat) { endCombat(); return toast('The fight ended.'); }
  if (!d.inCombat) return;
  // A board that is BEHIND this page must not un-expire anything, so it is ignored and the number
  // catches up on the next round.
  const behind = (+d.round || 1) - sh.round;
  if (behind <= 0) return;
  for (let i = 0; i < Math.min(FIGHT_CATCHUP_MAX, behind); i++) nextRound();
}

// Only the exhaustion goes back up. The level and the Dream mod are read, never written: this page
// has no business telling the character sheet what level it is.
let exhTimer = null;
function queueExh() {
  // ⚠️ `S.current` matters here. With no Grimm in hand — the DM on the chooser — `sheet()` has no
  // Grimm to build a blank one from and throws, and there is no exhaustion on screen to push.
  if (!CHAR_SYNCED || applyingLive || !S.current) return;
  clearTimeout(exhTimer);
  exhTimer = setTimeout(pushExh, 600);
}
async function pushExh() {
  if (!S.current) return;
  const sh = sheet();
  if (!sh) return;
  try {
    const r = await fetch('../api/me/exhaustion', {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        characterId: CHAR && CHAR.id,
        exhaustion: Math.max(0, Math.min(EXH_MAX, Math.trunc(+sh.exhaustion || 0))),
        dreamExhaustion: Math.max(0, Math.min(DREAM_EXH_MAX, Math.trunc(+sh.dreamExhaustion || 0))),
      }),
    });
    if (!r.ok) return;
    // Adopt the answer. A Shackle Break closing adds 2 and 3 without looking at the ceiling, so the
    // number that comes back may be lower than the one that went up — and the ladder's top is the
    // sheet's to decide, not this page's.
    const d = await r.json();
    CHAR = d.character;
    applyChar(d);
    if (typeof render === 'function') render();
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
