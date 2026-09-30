// Grimm-specific trackers. Each PANELS[id] returns the inside of one card; state
// lives in sheet().x. LONG_REST[id] tidies up after a rest, USE_HOOK[abilityId]
// reacts when an ability is used from the sheet.

// EXTRA[id]: a second card, below the abilities. SHIFT_PANEL[id]: a tracker inside the Reality
// Shift card, for a Shift that asks you to keep something in your head.
const PANELS = {}, EXTRA = {}, SHIFT_PANEL = {}, LONG_REST = {}, USE_HOOK = {};

const X = () => sheet().x;
function xset(k, v) { X()[k] = v; save(); render(); }
function xnum(k, v) { X()[k] = +v || 0; save(); render(); }
function xbump(k, n, lo = 0, hi = 1e9) { const x = X(); x[k] = Math.max(lo, Math.min(hi, (+x[k] || 0) + n)); save(); render(); }
const numIn = (label, k, def = 0, w) => `<span class="lbl">${label}</span><input class="num" type="number" value="${X()[k] ?? def}" onchange="xnum('${k}',this.value)"${w ? ` style="width:${w}px"` : ''}>`;
const stat = (b, i, c) => `<div class="stat"><b${c ? ` style="color:${c}"` : ''}>${b}</b><i>${i}</i></div>`;
function rollOut(label, n, sides, bonus = 0) {
  const r = roll(n, sides), tot = r.t + bonus;
  const el = $('#pOut');
  if (el) el.innerHTML = `<div class="roll">${esc(label)}: ${n}d${sides}${bonus ? sign(bonus) : ''} [${r.r.join(', ')}] = <b>${tot}</b></div>`;
}
const rollBtn = (label, n, sides, bonus = 0) => n > 0 ? `<button class="btn sm" onclick="rollOut('${attr(label)}',${n},${sides},${bonus})">${esc(label)} · ${n}d${sides}${bonus ? sign(bonus) : ''}</button>` : '';
const awakened = sh => stageIdx(sh.stage) >= 3;
const has = (sh, id) => ['passive', 'active', 'super'].some(k => (sh.loadout[k] || []).includes(id));

// ── Gate of Caelum — servants, their statblocks & soul shards ───────────
// A servant is a soul in a slot; what it can do is a statblock. The statblocks the player knows
// live in x.statblocks (written in the app, or pasted from any 5e source), next to the ones
// the vault ships (Silence). Recruiting picks a statblock and spends a servant slot on it.
const ABILS = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const abilMod = n => Math.floor((+n - 10) / 2);

// The numbers a statblock's text states about itself — a vault table or the usual 5e wording.
function sbRead(text) {
  const t = String(text || ''), pick = (...res) => { for (const re of res) { const m = t.match(re); if (m) return m[1].trim(); } return ''; };
  const out = {
    ac: pick(/Armor Class\W*(\d+)/i, /\*\*AC\*\*\s*\|\s*(\d+)/i, /^\W*AC\b\W*(\d+)/im),
    hp: pick(/Hit Points\W*(\d+)/i, /\*\*HP\*\*\s*\|\s*(\d+)/i, /^\W*HP\b\W*(\d+)/im),
    hd: pick(/Hit Points\W*\d+\s*\(([^)]+)\)/i, /\*\*HP\*\*\s*\|\s*\d+\s*\(([^)]+)\)/i),
    speed: pick(/^\W*Speed\W*\|?\s*([^|\n]+)/im),
    cr: pick(/Challenge(?: Rating)?\W*([\d/]+)/i, /^\W*CR\b\W*([\d/]+)/im, /\*\*Base\*\*\s*\|[^|]*\|\s*\**([\d/]+)/),
  };
  const scores = [...t.matchAll(/(\d{1,2})\s*\(\s*[+−–-]?\s*\d+\s*\)/g)].map(m => +m[1]);
  if (scores.length >= 6) ABILS.forEach((a, i) => out[a] = scores[i]);
  return out;
}
// Everything a Gate of Caelum sheet can recruit: the vault's servants, then the player's own.
function sbAll(g = grimmById('gate-of-caelum'), x = sheet('gate-of-caelum').x) {
  return [
    ...g.servants.map((s, i) => ({ id: 'vault:' + i, name: s.name, vault: true, body: s.text, ...sbRead(s.text) })),
    ...(x.statblocks || []),
  ];
}
const sbFind = id => sbAll().find(b => b.id === id);

function sbHtml(b) {
  if (b.vault) return prose(b.body, sheet());
  const scores = ABILS.filter(a => b[a] !== '' && b[a] != null);
  return `${b.meta ? `<p class="hint" style="margin-top:0"><i>${esc(b.meta)}</i></p>` : ''}
    <div class="stats">
      ${b.ac ? stat(esc(b.ac), 'Armor Class') : ''}${b.hp ? stat(esc(b.hp), b.hd ? `HP · ${esc(b.hd)}` : 'Hit Points') : ''}
      ${b.speed ? stat(esc(b.speed), 'Speed') : ''}${b.cr ? stat(esc(b.cr), 'Challenge') : ''}
    </div>
    ${scores.length ? `<div class="stats" style="margin-top:8px">${ABILS.map(a => stat(b[a] === '' || b[a] == null ? '—' : `${+b[a]} <small>(${sign(abilMod(b[a]))})</small>`, a.toUpperCase())).join('')}</div>` : ''}
    ${prose(b.body || '')}`;
}
function viewStatblock(id) { const b = sbFind(id); if (b) openDialog(b.name, sbHtml(b)); }

// Recruiting a soul is adding its statblock: every statblock is one servant slot. Summoning picks
// among the recruited. What changes at the table — HP, attuned items, summoned or in Limbo, called
// as an Elite — is kept per soul in x.souls[id].
const sbNewId = () => 'sb' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
function gateState(g, x) {
  x.statblocks = x.statblocks || []; x.souls = x.souls || {};
  if (x.servants) {            // sheets saved before souls and statblocks were one thing
    for (const s of x.servants) {
      let b = sbAll(g, x).find(b => b.id === s.sb) || sbAll(g, x).find(b => b.name === s.name);
      if (!b) { b = { id: sbNewId(), name: s.name, cr: s.cr === '?' ? '' : s.cr, hp: s.max || '', body: '' }; x.statblocks.push(b); }
      if (!x.souls[b.id]) x.souls[b.id] = { hp: s.hp, elite: !!(s.out && s.elite), out: !!s.out, items: s.items || '' };
    }
    delete x.servants;
  }
  return sbAll(g, x).map(b => ({ b, s: x.souls[b.id] || (x.souls[b.id] = { hp: null, elite: false, out: false, items: '' }) }));
}
const gateSlots = sh => awakened(sh) ? 6 : 3;
const crNum = cr => { const m = String(cr ?? '').match(/^\s*(\d+)\s*\/\s*(\d+)/); return m ? m[1] / m[2] : parseFloat(cr) || 0; };
const gateMaxCr = sh => sh.level + pbOf(sh.level);
// A servant's max HP on the field: its statblock's, plus 10 × PB for each missing party member,
// doubled as the Elite — or halved for everyone else while an Elite is out.
function gateMaxHp(b, s, sh = sheet('gate-of-caelum')) {
  if (!+b.hp) return null;
  const eliteOut = Object.entries(sh.x.souls).some(([k, o]) => o.out && o.elite && sbFind(k));
  return Math.floor((+b.hp + 10 * pbOf(sh.level) * (+sh.x.missing || 0)) * (s.elite ? 2 : eliteOut ? .5 : 1));
}
// Elite Armament — chosen when the Elite is summoned
const ARMAMENT = {
  warrior: ['Warrior', pb => `+${pb} to attack and damage rolls, and +${pb}d6 necrotic when it deals damage`],
  mage:    ['Mage',    pb => `+${pb} to spell attacks and spell save DC; its first spell after the summon costs no slot`],
  healer:  ['Healer',  pb => `+${pb} AC; when it heals, one more creature within 60 ft gets the same healing`],
};
// Soul Shards Table — shards dropped by CR (index = CR, 20 and above = 30)
const SHARD_DROP = [0, 1, 2, 3, 4, 5, 8, 9, 10, 11, 15, 16, 17, 18, 19, 23, 24, 25, 26, 27, 30];
const shardsFor = cr => SHARD_DROP[Math.min(20, Math.floor(crNum(cr)))] || 0;

// ── Commander of Souls: who is on the field ──
// Rulings (Juan, 2026-09-30): one Elite at a time · a servant at 0 HP goes back to Limbo and can be
// summoned again at full HP · a dismissed servant keeps its HP · servants stay through a long rest ·
// Silence holds a servant slot · the Harvest DC is CR + 10.
PANELS['gate-of-caelum'] = (g, sh, v) => {
  const x = sh.x, souls = gateState(g, x);
  const limit = Math.ceil(v.pb / 2);
  const field = souls.filter(o => o.s.out), lent = souls.filter(o => o.s.lent), limbo = souls.filter(o => !o.s.out && !o.s.lent);
  const out = field.filter(o => !o.s.elite).length;
  const bonusHp = 10 * v.pb * (+x.missing || 0);
  const rows = field.map(({ b, s }) => { const id = attr(b.id), arm = ARMAMENT[s.armament]; return `<div class="item on">
      <span class="nm">${esc(b.name)}</span>${b.cr ? `<span class="tag">CR ${esc(b.cr)}</span>` : ''}
      ${s.elite ? `<span class="tag k" style="--kc:var(--k-super)">Elite${arm ? ' · ' + arm[0] : ''}</span>` : ''}
      <span class="sp"></span>
      <span class="lbl">HP</span><input class="num" type="number" value="${s.hp ?? ''}" onchange="soulSet('${id}','hp',this.value)">
      <span class="lbl">/ ${gateMaxHp(b, s, sh) ?? '—'}</span>
      <button class="btn sm" onclick="viewStatblock('${id}')">Statblock</button>
      <button class="btn sm warn" title="It dropped to 0 HP — back to Limbo; it answers again at full HP" onclick="soulFell('${id}')">Fell</button>
      <button class="btn sm" title="Send it back to Limbo — it keeps its HP" onclick="dismissSoul('${id}')">Dismiss</button>
      ${s.elite ? `<div class="row" style="flex-basis:100%;margin:0">
        <span class="hint" style="flex:1;min-width:200px">${arm ? arm[1](v.pb) + '. ' : ''}Can't be dominated.</span>
        <button class="btn sm ${s.willUsed ? 'on' : ''}" title="Once per summon: automatically succeed on a saving throw" onclick="soulSet('${id}','willUsed',${!s.willUsed},true)">Servant's Will · ${s.willUsed ? 'used' : 'ready'}</button>
        <button class="btn sm" title="End of its turn: regains PB d4 hit points" onclick="soulRegen('${id}')">Regenerate · ${v.pb}d4</button>
        ${s.armament === 'warrior' ? rollBtn('Necrotic', v.pb, 6) : ''}</div>` : ''}
      ${s.items ? `<span class="hint" style="flex-basis:100%">Attuned: ${esc(s.items)}</span>` : ''}
    </div>`; }).join('');
  const lentRows = lent.map(({ b, s }) => `<div class="item">
      <span class="nm">${esc(b.name)}</span><span class="hint">empowers <b>${esc(s.lent)}</b> — one extra action each turn</span>
      <span class="sp"></span>
      <span class="lbl">Health pool</span><input class="num" type="number" value="${s.pool ?? ''}" onchange="soulSet('${attr(b.id)}','pool',this.value)">
      <span class="lbl">/ ${+b.hp ? +b.hp + bonusHp : '—'}</span>
      <button class="btn sm" onclick="viewStatblock('${attr(b.id)}')">Statblock</button>
      <button class="btn sm warn" title="The pool reached 0, or you call it back" onclick="returnSoul('${attr(b.id)}')">End Relinquish</button>
    </div>`).join('');
  return `<h2>Commander of Souls</h2>
    <div class="stats">
      ${stat(`${out}/${limit}`, 'summoned at once')}
      ${stat(`${souls.length}/${gateSlots(sh)}`, 'servant slots')}
      ${stat(gateMaxCr(sh), 'Max Servant CR (+3 w/ slots)')}
      ${stat(x.shards || 0, 'soul shards', 'var(--brass)')}
    </div>
    <div class="row" style="margin-top:10px">
      <span class="lbl">Soul shards</span><div class="step"><button onclick="xbump('shards',-1)">–</button><span>${x.shards || 0}</span><button onclick="xbump('shards',1)">+</button></div>
      ${numIn('Missing party members', 'missing', 0)}
      <label class="lbl"><input type="checkbox" ${x.fakeDeathUsed ? 'checked' : ''} onchange="xset('fakeDeathUsed',this.checked)"> Fake Death used</label>
    </div>
    ${bonusHp ? `<p class="hint">Each servant's max HP is raised by <b>${bonusHp}</b> for the missing party (10 × PB each).</p>` : ''}
    <h3>Summoned</h3>
    <div class="items">${rows || '<p class="hint">Every soul is in Limbo.</p>'}</div>
    <div class="row" style="margin-top:9px">
      <select class="pick" id="svBlock" style="flex:1"><option value="">${limbo.length ? 'Summon a servant…' : souls.length ? 'No recruited soul is waiting in Limbo' : 'No souls recruited yet'}</option>${limbo.map(({ b }) => `<option value="${attr(b.id)}">${esc(b.name)}${b.cr ? ' · CR ' + esc(b.cr) : ''}</option>`).join('')}</select>
      <label class="lbl"><input type="checkbox" id="svElite" onchange="$('#svArm').hidden = !this.checked"> as Elite</label>
      <select class="pick" id="svArm" hidden title="Elite Armament">${Object.entries(ARMAMENT).map(([k, a]) => `<option value="${k}">${a[0]} Enhancement</option>`).join('')}</select>
      <button class="btn pri" onclick="summonSoul(${limit})">Summon</button></div>
    <div id="pOut"></div>
    ${lent.length ? `<h3>Relinquished</h3><div class="items">${lentRows}</div>` : ''}
    <h3>Harvest</h3>
    <div class="row"><input class="txt" id="hvCrs" style="flex:1;min-width:180px" placeholder="CR of each fallen creature — e.g. 3, 5, 12 (up to ${v.pb})">
      <span class="lbl">Int check</span><input class="num" id="hvCheck" type="number" placeholder="total"><button class="btn" onclick="harvestSouls(${v.pb})">Harvest · 1 slot</button></div>
    <p class="hint"><b>Summon</b> spends the Grimm Slots for you — 1 (Action), or 2 as the Elite — so don't also press <i>Use</i> on the ability below. One Elite at a time: it doesn't count toward the limit but halves the others' HP. Servants appear within <b>${v.pb * 5} ft</b>, act right after your turn, and your Action can grant one a Quick Action. Harvest is one Int check against <b>CR + 10</b> for each soul.</p>`;
};
function summonSoul(limit) {
  const id = $('#svBlock').value, b = sbFind(id), x = X();
  if (!b) return toast('Choose which recruited soul to summon.');
  const field = Object.entries(x.souls).filter(([k, s]) => s.out && sbFind(k)).map(([, s]) => s);
  const asElite = $('#svElite').checked;
  if (asElite && field.some(s => s.elite)) return toast('An Elite Servant is already on the field.');
  if (!asElite && field.filter(s => !s.elite).length >= limit) return toast(`You can hold ${limit} servant${limit > 1 ? 's' : ''} at once — dismiss one first.`);
  if (sheet().familiar) return toast('Your Grimm is in Familiar form — it can\'t summon.');
  const armament = asElite ? $('#svArm').value : '';
  if (!spend(asElite ? 2 : 1)) return;   // Commander of Souls costs 1 Grimm Slot, Elite Servant 2
  const s = x.souls[id];
  s.out = true; s.elite = asElite; s.armament = armament; s.willUsed = false;
  // never tracked, or fell at 0 — it answers the call whole, at the max HP it has right now
  if (!s.hp) s.hp = gateMaxHp(b, s) ?? 0;
  // an Elite's arrival halves the others: nobody keeps more HP than their new max
  if (asElite) Object.entries(x.souls).forEach(([k, o]) => {
    const ob = sbFind(k), max = ob && o.out && !o.elite ? gateMaxHp(ob, o) : null;
    if (max != null && o.hp > max) o.hp = max;
  });
  save(); render();
  toast(`${b.name} answers — ${asElite ? '2 Grimm Slots' : '1 Grimm Slot'} spent.`);
}
function dismissSoul(id) { const s = X().souls[id]; s.out = false; s.elite = false; save(); render(); }
function soulSet(id, k, v, redraw) { X().souls[id][k] = k === 'hp' || k === 'pool' ? +v : v; save(); if (redraw) render(); }
// 0 HP: back to Limbo, whole again the next time it is called. Arcane Repose answers if it is composed.
function soulFell(id) {
  const b = sbFind(id), s = X().souls[id], sh = sheet();
  s.out = false; s.elite = false; s.hp = null; s.willUsed = false;
  save(); render();
  if (awakened(sh) && has(sh, 'arcane-repose') && crNum(b.cr) >= 1)
    openDialog('Arcane Repose', `<div class="prose"><p><b>${esc(b.name)}</b> falls and returns to Limbo — it will answer again at full HP.</p>
      <p>You call its faint remains: recover spell slots with a combined level of <b>${Math.ceil(crNum(b.cr) / 2)}</b> or less (half its CR ${esc(b.cr)}, rounded up), none of 6th level or higher — as the wizard's <i>Arcane Recovery</i>.</p></div>`);
  else toast(`${b.name} falls and returns to Limbo.`);
}
function soulRegen(id) {
  const b = sbFind(id), s = X().souls[id], pb = pbOf(sheet().level), r = roll(pb, 4), max = gateMaxHp(b, s);
  s.hp = Math.min(max ?? Infinity, (+s.hp || 0) + r.t);
  save(); render();
  $('#pOut').innerHTML = `<div class="roll">Passive Regeneration: ${pb}d4 [${r.r.join(', ')}] = <b>${r.t}</b> → ${esc(b.name)} at ${s.hp} HP</div>`;
}
// One Int check against CR + 10 for each soul, up to PB of them; what succeeds drops shards by CR.
function harvestSouls(pb) {
  const crs = $('#hvCrs').value.split(/[,;\s]+/).filter(Boolean).slice(0, pb), check = +$('#hvCheck').value;
  if (!crs.length || !$('#hvCheck').value) return toast('Give the CR of each fallen creature and your Int check total.');
  if (sheet().familiar) return toast('Your Grimm is in Familiar form — it can\'t harvest.');
  if (!spend(1)) return;
  let total = 0;
  const lines = crs.map(c => { const dc = Math.floor(crNum(c)) + 10, ok = check >= dc, n = ok ? shardsFor(c) : 0; total += n;
    return `CR ${esc(c)} · DC ${dc} — ${ok ? `<b class="ok">${n} shard${n === 1 ? '' : 's'}</b>` : '<b class="bad">nothing</b>'}`; });
  const x = X(); x.shards = (+x.shards || 0) + total;
  save(); render();
  $('#pOut').innerHTML = `<div class="roll">Harvest, check ${check}: ${lines.join(' · ')} — <b>+${total}</b> soul shards</div>`;
}
// Relinquish Command: a soul in Limbo enters an ally as a health pool until it empties, a long rest, or you call it back
function relinquishSoul(id) {
  const b = sbFind(id);
  openDialog(`Relinquish ${b.name}`, `<div class="prose"><p>Two Grimm Slots. The spirit enters a willing ally you can see: an extra action each turn, a health pool equal to the servant's max HP, and its ability scores, traits or class levels where higher. You can't summon it while it is away.</p></div>
    <div class="row"><input class="txt" id="rlAlly" placeholder="Which ally?" style="flex:1"><button class="btn pri" onclick="relinquishNow('${attr(id)}')">Relinquish · 2 slots</button></div>`);
}
function relinquishNow(id) {
  const ally = $('#rlAlly').value.trim(), x = X(), b = sbFind(id), sh = sheet();
  if (!ally) return toast('Name the ally who receives the servant.');
  if (Object.values(x.souls).some(s => s.lent && s.lent.toLowerCase() === ally.toLowerCase())) return toast(`${ally} already carries a servant.`);
  if (sh.familiar) return toast('Your Grimm is in Familiar form.');
  if (!spend(2)) return;
  const s = x.souls[id];
  s.lent = ally; s.pool = +b.hp ? +b.hp + 10 * pbOf(sh.level) * (+x.missing || 0) : 0;
  $('#dlg').close(); save(); render();
}
function returnSoul(id) { const s = X().souls[id]; s.lent = ''; s.pool = null; save(); render(); }

// ── Recruited souls: the statblocks, in a card of their own ──
EXTRA['gate-of-caelum'] = (g, sh, v) => {
  const x = sh.x, souls = gateState(g, x), slots = gateSlots(sh);
  const boost = Math.min(3, +x.ariseBoost || 0), maxCr = gateMaxCr(sh) + boost, cr = x.ariseCr;
  const canLend = has(sh, 'relinquish-command');
  const rows = souls.map(({ b, s }) => `<div class="item ${s.out ? 'on' : ''}">
      <span class="nm">${esc(b.name)}</span>${b.cr ? `<span class="tag">CR ${esc(b.cr)}</span>` : ''}
      <span class="hint">${[b.hp && `HP ${esc(b.hp)}`, b.ac && `AC ${esc(b.ac)}`, s.out && 'summoned', s.lent && `with ${esc(s.lent)}`, b.vault && 'from the vault',
        crNum(b.cr) > gateMaxCr(sh) + 3 && '<span style="color:#e4927f">above your Max Servant CR</span>'].filter(Boolean).join(' · ')}</span>
      <span class="sp"></span>
      <button class="btn sm" onclick="viewStatblock('${attr(b.id)}')">View</button>
      ${canLend && !s.out && !s.lent ? `<button class="btn sm" onclick="relinquishSoul('${attr(b.id)}')">Relinquish</button>` : ''}
      ${s.lent ? `<button class="btn sm warn" title="Call it back from ${attr(s.lent)} — it returns to Limbo" onclick="returnSoul('${attr(b.id)}')">End Relinquish</button>` : ''}
      ${b.vault ? '' : `<button class="btn sm" onclick="editStatblock('${attr(b.id)}')">Edit</button><button class="btn sm warn" onclick="releaseSoul('${attr(b.id)}')">Release</button>`}
      <input class="txt" style="flex-basis:100%" placeholder="Attuned items — 2, or 3 when it is the Elite" value="${attr(s.items || '')}" onchange="soulSet('${attr(b.id)}','items',this.value,true)">
    </div>`).join('');
  return `<h2>Recruited souls <span class="r"><button class="btn sm pri" onclick="editStatblock()">Recruit</button></span></h2>
    <div class="stats">${stat(`${souls.length}/${slots}`, 'servant slots', souls.length > slots ? 'var(--ember)' : '')}</div>
    <div class="items" style="margin-top:10px">${rows || '<p class="hint">No souls answer yet.</p>'}</div>
    <h3>Arise</h3>
    <div class="row">${numIn('Creature CR', 'ariseCr', '')}
      ${cr ? stat(`DC ${Math.floor(+cr) + 10}`, 'Persuasion') : ''}
      ${stat(maxCr, boost ? `Max Servant CR · +${boost} from slots` : 'Max Servant CR', cr && +cr > maxCr ? 'var(--ember)' : '')}</div>
    <div class="row">
      <button class="btn sm" onclick="ariseSpend('boost')" ${boost >= 3 ? 'disabled' : ''} title="Up to +3">Raise Max CR +1 · 1 slot</button>
      <button class="btn sm" onclick="ariseSpend('retry')" title="After a failed check">Another attempt · 1 slot</button>
      ${boost || cr ? `<button class="btn sm" onclick="ariseDone()">Done</button>` : ''}</div>
    <p class="hint">${cr && +cr > maxCr ? `<b style="color:#e4927f">CR ${+cr} is beyond your reach</b> — raise the Max CR with slots (up to +3) or let the soul go. ` : ''}Speak <b>Arise</b> over a creature dead less than 24 hours (Action): Persuasion against <b>CR + 10</b>; the DM may grant a bonus for honouring the dead. On a success press <b>Recruit</b> and add its statblock — written here, or pasted from a 5e source. Each recruited soul holds one servant slot until you release it. <b>Undying Attunement:</b> an item a servant attunes to can't be taken back; after a Long Rest you may strip one from a servant, and it is lost forever.</p>`;
};
function ariseSpend(kind) {
  if (sheet().familiar) return toast('Your Grimm is in Familiar form.');
  if (!spend(1)) return;
  const x = X();
  if (kind === 'boost') x.ariseBoost = Math.min(3, (+x.ariseBoost || 0) + 1);
  save(); render();
  toast(kind === 'boost' ? 'Max Servant CR raised by 1 for this Arise — 1 Grimm Slot spent.' : 'Another attempt — 1 Grimm Slot spent. Roll Persuasion again.');
}
function ariseDone() { const x = X(); x.ariseBoost = 0; x.ariseCr = ''; save(); render(); }

// ── writing a statblock ──
const sbField = (id, label, val, w, type = 'text') => `<span class="lbl">${label}</span><input class="${type === 'number' ? 'num' : 'txt'}" id="${id}" type="${type}" value="${attr(val ?? '')}"${w ? ` style="width:${w}px"` : ''}>`;
function editStatblock(id) {
  const b = (id && (X().statblocks || []).find(s => s.id === id)) || {};
  openDialog(id ? `Edit ${b.name}` : 'Recruit a soul — its statblock', `
    <div class="row">${sbField('sbName', 'Name', b.name, 190)}${sbField('sbMeta', 'Size, type', b.meta, 220)}</div>
    <div class="row">${sbField('sbCr', 'CR', b.cr, 54)}${sbField('sbAc', 'AC', b.ac, 54, 'number')}${sbField('sbHp', 'HP', b.hp, 64, 'number')}${sbField('sbHd', 'Hit dice', b.hd, 110)}${sbField('sbSpeed', 'Speed', b.speed, 150)}</div>
    <div class="row">${ABILS.map(a => sbField('sb_' + a, a.toUpperCase(), b[a], 52, 'number')).join('')}</div>
    <div class="row"><span class="lbl">Saves, skills, senses, traits, actions…</span><span class="sp"></span>
      ${id ? '' : '<button class="btn sm" onclick="sbExample()" title="Fills the form with a complete example to rewrite into your own servant">Start from an example</button>'}
      <button class="btn sm" onclick="sbFill()" title="Reads Armor Class, Hit Points, Speed, Challenge and the six ability scores out of the text below">Read the numbers from the text</button></div>
    <textarea class="txt" id="sbBody" rows="14" style="width:100%" placeholder="Paste a whole 5e statblock here and press “Read the numbers from the text” — or write it yourself.&#10;&#10;## Actions&#10;**Multiattack.** The servant makes two attacks.">${esc(b.body || '')}</textarea>
    <div class="row"><span class="sp"></span><button class="btn pri" onclick="saveStatblock('${attr(id || '')}')">${id ? 'Save' : 'Recruit'}</button></div>`);
}
// A whole statblock to build on: every field filled, and a body that shows the layout —
// the bold lines, then Traits / Actions / Bonus Actions / Reactions with one entry each.
const SB_EXAMPLE = {
  name: 'Ashen Sentinel', meta: 'Medium undead, servant of the Gate', cr: '5', ac: 16, hp: 85, hd: '10d8 + 40', speed: '30 ft.',
  str: 18, dex: 12, con: 18, int: 8, wis: 12, cha: 10,
  body: `**Saving Throws** Str +7, Con +7

**Skills** Athletics +7, Perception +4

**Damage Resistances** necrotic; bludgeoning, piercing and slashing from nonmagical attacks

**Condition Immunities** charmed, frightened, poisoned

**Senses** darkvision 60 ft., passive Perception 14

**Languages** understands the languages it knew in life, but can't speak

**Proficiency Bonus** +3

## Traits

**Bound Soul.** The sentinel obeys its summoner's spoken commands. If it drops to 0 hit points it returns to Limbo instead of dying.

**Unyielding.** The sentinel has advantage on saving throws against being pushed or knocked prone.

## Actions

**Multiattack.** The sentinel makes two Greatsword attacks.

**Greatsword.** *Melee Weapon Attack:* +7 to hit, reach 5 ft., one target. *Hit:* 11 (2d6 + 4) slashing damage plus 7 (2d6) necrotic damage.

**Grave Bolt.** *Ranged Spell Attack:* +4 to hit, range 60 ft., one target. *Hit:* 10 (3d6) necrotic damage.

## Bonus Actions

**Ash Step (Recharge 5–6).** The sentinel teleports up to 30 feet to an unoccupied space it can see.

## Reactions

**Interpose.** When a creature the sentinel can see attacks its summoner within 5 feet of it, the sentinel becomes the target of that attack instead.`,
};
function sbExample() {
  const e = SB_EXAMPLE;
  $('#sbName').value = e.name; $('#sbMeta').value = e.meta; $('#sbCr').value = e.cr; $('#sbAc').value = e.ac;
  $('#sbHp').value = e.hp; $('#sbHd').value = e.hd; $('#sbSpeed').value = e.speed; $('#sbBody').value = e.body;
  ABILS.forEach(a => $('#sb_' + a).value = e[a]);
  toast('Example loaded — rewrite it into your servant.');
}
// Pasted 5e text: lift the numbers into their fields, take the name from the first line,
// and give the usual section names and "Name. text" entries some markdown.
function sbFill() {
  const ta = $('#sbBody'), r = sbRead(ta.value);
  const put = (id, val) => { if (val !== '' && val != null && !$(id).value) $(id).value = val; };
  put('#sbCr', r.cr); put('#sbAc', r.ac); put('#sbHp', r.hp); put('#sbHd', r.hd); put('#sbSpeed', r.speed);
  ABILS.forEach(a => put('#sb_' + a, r[a]));
  // Text that is already markdown (a vault page, with tables and headings) is left exactly as it is
  if (/^\s*(#|\|)/m.test(ta.value)) return toast('Numbers read — check them before you save.');
  let lines = ta.value.replace(/\r/g, '').split('\n');
  const first = lines.findIndex(l => l.trim());
  if (first >= 0 && !$('#sbName').value && !/Armor Class|Hit Points|^\W*(AC|HP)\b/i.test(lines[first])) {
    $('#sbName').value = lines[first].replace(/^[#*\s]+|[*\s]+$/g, '');
    lines.splice(first, 1);
    const next = lines.findIndex(l => l.trim());
    if (next >= 0 && !$('#sbMeta').value && /^(tiny|small|medium|large|huge|gargantuan)\b/i.test(lines[next].trim())) { $('#sbMeta').value = lines[next].trim(); lines.splice(next, 1); }
  }
  const header = /^\W*(Armor Class|Hit Points|Speed|Challenge(?: Rating)?)\b|^\s*(STR\s+DEX\s+CON\s+INT\s+WIS\s+CHA)\s*$|^\s*(\d{1,2}\s*\(\s*[+−–-]?\s*\d+\s*\)\s*){6}$/i;
  ta.value = lines.filter(l => !header.test(l)).map(l => {
    if (/^\s*(Traits|Actions|Bonus Actions|Reactions|Legendary Actions|Lair Actions|Mythic Actions)\s*$/i.test(l)) return '\n## ' + l.trim();
    return l.replace(/^([A-Z][\w'’-]*(?: [\w'’()/-]+){0,5})\.\s+(?=\S)/, '**$1.** ')
            .replace(/^(Saving Throws|Skills|Damage (?:Resistances|Immunities|Vulnerabilities)|Condition Immunities|Senses|Languages)\s+/i, '**$1** ');
  }).join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
  toast('Numbers read — check them before you save.');
}
function saveStatblock(id) {
  const name = $('#sbName').value.trim();
  if (!name) return toast('A statblock needs a name.');
  const x = X(); x.statblocks = x.statblocks || [];
  if (!id && sbAll().length >= gateSlots(sheet())) return toast('No servant slot free — release a soul first.');
  const b = { id: id || sbNewId(), name, meta: $('#sbMeta').value.trim(), cr: $('#sbCr').value.trim(),
    ac: $('#sbAc').value, hp: $('#sbHp').value, hd: $('#sbHd').value.trim(), speed: $('#sbSpeed').value.trim(), body: $('#sbBody').value };
  ABILS.forEach(a => b[a] = $('#sb_' + a).value);
  const at = x.statblocks.findIndex(s => s.id === b.id);
  if (at >= 0) x.statblocks[at] = b; else x.statblocks.push(b);
  $('#dlg').close(); save(); render();
}
// Releasing a soul frees its slot and forgets its statblock — asked in the app's own dialog
function releaseSoul(id) {
  const b = (X().statblocks || []).find(s => s.id === id); if (!b) return;
  openDialog(`Release ${b.name}?`, `<div class="prose"><p>Its servant slot frees, its attuned items are lost, and its statblock is forgotten.</p></div>
    <div class="row"><span class="sp"></span><button class="btn warn" onclick="releaseSoulNow('${attr(id)}')">Release this soul</button></div>`);
}
function releaseSoulNow(id) {
  const x = X();
  x.statblocks = (x.statblocks || []).filter(s => s.id !== id); delete x.souls[id];
  $('#dlg').close(); save(); render();
}
// A long rest gives Fake Death back and calls every relinquished servant home. Summoned servants stay.
LONG_REST['gate-of-caelum'] = sh => {
  sh.x.fakeDeathUsed = false;
  Object.values(sh.x.souls || {}).forEach(s => { s.lent = ''; s.pool = null; });
};
// Shadow Exchange: after the swap roll a d6 — on a 5 or 6 the Grimm Slot comes back
USE_HOOK['shadow-exchange'] = sh => {
  const r = d(6), free = r >= 5;
  if (free) { if (sh.tempUsed > 0) sh.tempUsed--; else if (sh.used > 0) sh.used--; }
  setTimeout(() => toast(`Shadow Exchange — d6: ${r}. ${free ? 'The Grimm Slot is not spent.' : 'The Grimm Slot is spent.'}`), 0);
};

// ── Ouroboros Vigil — soul stones & artifice ────────────────────────────
const RESISTS = ['Acid', 'Cold', 'Fire', 'Force', 'Lightning', 'Necrotic', 'Radiant', 'Thunder'];
PANELS['ouroboros-vigil'] = (g, sh, v) => {
  const x = sh.x; x.stones = x.stones || []; x.items = x.items || [];
  const limit = Math.max(0, 2 * sh.intMod), reson = Math.floor(x.stones.length / 2);
  const traitsPer = Math.max(1, v.pb - x.items.length);
  const lib = D.soulStones;
  const chosen = x.stones.filter(s => s.pick);
  const chimeraDc = chosen.length ? 10 + Math.round(chosen.reduce((t, s) => t + (+s.cr || 0), 0) / chosen.length) : null;
  const rows = x.stones.map((s, i) => `<div class="item ${s.pick ? 'on' : ''}">
      <label class="lbl"><input type="checkbox" ${s.pick ? 'checked' : ''} onchange="stoneSet(${i},'pick',this.checked)"></label>
      <span class="nm">${esc(s.name)}</span>${s.cr ? `<span class="tag">CR ${esc(s.cr)}</span>` : ''}
      <span class="hint">${esc((s.traits || []).join(' · '))}</span><span class="sp"></span>
      ${s.cr ? rollBtn('Spirit Strike', +s.cr, 8) : ''}
      <button class="btn sm ${s.struck ? 'on' : ''}" title="Used for Spirit Strike — wait 24 h or it shatters" onclick="stoneSet(${i},'struck',${!s.struck})">${s.struck ? 'Cooling 24h' : 'Ready'}</button>
      ${lib.find(l => l.name === s.name) ? `<button class="btn sm" onclick="viewStone('${attr(s.name)}')">View</button>` : ''}
      <button class="x" onclick="stoneDrop(${i})">×</button></div>`).join('');
  return `<h2>Soul Stones</h2>
    <div class="stats">
      ${stat(`${x.stones.length}/${limit}`, 'carried (2 × Int mod)', x.stones.length > limit ? 'var(--ember)' : '')}
      ${stat(sh.level + v.pb, 'Max CR (+3 w/ slots)')}
      ${stat(sign(reson), 'Soul Resonance')}
      ${stat(traitsPer, 'traits per artifice')}
    </div>
    <div class="row" style="margin-top:10px">
      <span class="lbl">Int mod</span><input class="num" type="number" value="${sh.intMod}" onchange="setNum('intMod',this.value)">
      <span class="lbl">Resist today</span><select class="pick" onchange="xset('resist',this.value)"><option value="">—</option>${RESISTS.map(r => `<option ${x.resist === r ? 'selected' : ''}>${r}</option>`).join('')}</select>
      <span class="lbl">Resonance to</span><select class="pick" onchange="xset('resTo',this.value)">${['Attack rolls', 'AC', 'Str saves', 'Dex saves', 'Con saves', 'Int saves', 'Wis saves', 'Cha saves'].map(r => `<option ${x.resTo === r ? 'selected' : ''}>${r}</option>`).join('')}</select>
    </div>
    ${x.stones.length > limit ? '<p class="hint" style="color:#e4927f">You carry more stones than your soul can hold — a stronger presence is pressing in.</p>' : ''}
    <h3>Carried</h3>
    <div class="items">${rows || '<p class="hint">Harvest a creature dead under 24 hours: Int check vs <b>CR + 10</b>. Beat it by 10 for two traits.</p>'}</div>
    <div class="row" style="margin-top:9px">
      <select class="pick" id="stLib" style="flex:1"><option value="">Add a known stone…</option>${lib.map(l => `<option value="${attr(l.name)}">${esc(l.name)}${l.cr ? ' · CR ' + l.cr : ''}</option>`).join('')}</select>
      <button class="btn" onclick="stoneAdd()">Add</button>
      <input class="txt" id="stName" placeholder="…or a new one" style="width:130px"><input class="num" id="stCr" placeholder="CR"><button class="btn" onclick="stoneAdd(true)">Add</button>
    </div>
    <div id="pOut"></div>
    <h3>Soul Chimera</h3>
    <p class="hint">${chosen.length ? `Channelling <b>${chosen.map(s => esc(s.name)).join(', ')}</b> — 2 slots, +1 per extra stone; Int check <b>DC ${chimeraDc}</b> for the extras.` : 'Tick stones above to see the Chimera DC (10 + their average CR).'} A failure keeps only the first creature and rolls a d20: 2–5 stunned, 20 refunds the extra slots.</p>
    <h3>Soul Artifice items <span class="hint">(1 hour each)</span></h3>
    <div class="items">${x.items.map((it, i) => `<div class="item"><span class="nm">${esc(it)}</span><span class="sp"></span><button class="x" onclick="itemDrop(${i})">×</button></div>`).join('') || '<p class="hint">None forged.</p>'}</div>
    <div class="row" style="margin-top:9px"><input class="txt" id="itName" placeholder="Item (e.g. Frost-plate: Coldborn, Action Surge)" style="flex:1"><button class="btn" onclick="itemAdd()">Forge</button></div>
    <p class="hint">Action: 1 slot, up to <b>${traitsPer}</b> traits. As a Bonus Action every trait after the first needs an Int check of <b>5 × extra traits</b>.</p>`;
};
function stoneAdd(custom) {
  const x = X(); x.stones = x.stones || [];
  if (custom) { const n = $('#stName').value.trim(); if (!n) return; x.stones.push({ name: n, cr: $('#stCr').value, traits: [] }); }
  else { const l = D.soulStones.find(s => s.name === $('#stLib').value); if (!l) return; x.stones.push({ name: l.name, cr: l.cr, traits: l.traits }); }
  save(); render();
}
function stoneSet(i, k, v) { X().stones[i][k] = v; save(); render(); }
function stoneDrop(i) { X().stones.splice(i, 1); save(); render(); }
function itemAdd() { const n = $('#itName').value.trim(); if (!n) return; (X().items = X().items || []).push(n); save(); render(); }
function itemDrop(i) { X().items.splice(i, 1); save(); render(); }
function viewStone(name) {
  const s = D.soulStones.find(l => l.name === name), sh = sheet();
  openDialog(name + ' Soul Stone', prose(s.text, sh) + (s.spiritText ? `<div class="stagehead">${esc(s.spirit)} — Soul Chimera</div>` + prose(s.spiritText) : ''));
}
LONG_REST['ouroboros-vigil'] = sh => { sh.x.items = []; (sh.x.stones || []).forEach(s => s.struck = false); };

// ── Víðarr — ash curses & blood ─────────────────────────────────────────
PANELS['vidarr'] = (g, sh, v) => {
  const x = sh.x; x.targets = x.targets || [];
  const pool = x.pool ?? 0, placed = x.targets.reduce((t, c) => t + c.curses, 0);
  const thr = sh.level * 5, blood = x.blood || 0;
  const broke = sh.effects.some(e => /blood keeper/i.test(e.name));
  const rows = x.targets.map((t, i) => `<div class="item">
      <span class="nm">${esc(t.name)}</span><span class="sp"></span>
      <span class="lbl">Curses</span><div class="step"><button onclick="curse(${i},'curses',-1)">–</button><span>${t.curses}</span><button onclick="curse(${i},'curses',1)">+</button></div>
      <span class="lbl">Stacks</span><div class="step"><button onclick="curse(${i},'stacks',-1)">–</button><span>${t.stacks}</span><button onclick="curse(${i},'stacks',1)">+</button></div>
      <button class="btn sm" title="At the end of its turn it gains 1 stack per curse" onclick="curseTurn(${i})">End of its turn</button>
      ${rollBtn('Detonate', t.stacks, 10)}
      <button class="x" onclick="curseDrop(${i})">×</button>
      <span class="hint" style="flex-basis:100%">vs this target: <b>+${t.curses}</b> to hit & DC · <b>+${t.curses}d8</b> ${esc(x.dmgType || '')} on hits</span>
    </div>`).join('');
  return `<h2>Curse of the Ashes ${broke ? '<span class="state st-fraying">Arm of the Blood Keeper</span>' : ''}</h2>
    <div class="stats">
      ${stat(`${placed}/${pool}`, 'curses placed')}
      ${stat(`${thr}`, 'dmg per spell slot')}
      ${has(sh, 'cursebounded') ? stat(broke ? '15–20' : '18–20', `crit · fumble 1–4`) : ''}
      ${has(sh, 'hateful-luck') ? stat(broke ? '1–6' : '1', 'Hateful Luck on') : ''}
    </div>
    <div class="row" style="margin-top:10px">
      <span class="lbl">Damage type</span><select class="pick" onchange="xset('dmgType',this.value)"><option value="">—</option>${DAMAGE_TYPES.map(t => `<option ${x.dmgType === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <button class="btn sm" onclick="curseAll()" title="Bonus Action: +1 Ash Stack on every cursed creature">+1 stack to all</button>
      <button class="btn sm" onclick="xset('targets',[])">Clear</button>
    </div>
    <div class="items" style="margin-top:9px">${rows || `<p class="hint">Use <b>Curse of the Ashes</b> to gain ${v.pb} curses, then spread them here.</p>`}</div>
    <div class="row" style="margin-top:9px"><input class="txt" id="cuName" placeholder="Cursed creature" style="flex:1"><button class="btn" onclick="curseAdd()">Add target</button></div>
    <div id="pOut"></div>
    <h3>Blood of the Damned</h3>
    <div class="meter"><i style="width:${Math.min(100, blood / thr * 100)}%"></i></div>
    <div class="row" style="margin-top:7px"><span class="hint">${blood}/${thr} damage toward the next spell slot · regained today: <b>${x.slotsBack || 0}</b></span><span class="sp"></span>
      <input class="num" id="bdDmg" type="number" placeholder="dmg" style="width:64px"><button class="btn sm" onclick="bloodTake()">Took damage</button>
      ${rollBtn('Self-provoke', v.pb, 8)}</div>
    <p class="hint">${has(sh, 'hateful-luck') ? '' : '(Not loaded) '}Hateful Luck on a natural ${broke ? '1–6' : '1'}: heal <b>${5 * v.pb}</b>, regain a spell slot, Misty Step, or +10 on your next d20${broke ? '; on a 1–2 you may restore a Grimm Slot instead' : ''}. Temporary HP doesn't feed the blood.</p>`;
};
function curseAdd() { const n = $('#cuName').value.trim(); if (!n) return; const x = X(); (x.targets = x.targets || []).push({ name: n, curses: 1, stacks: 0 }); save(); render(); }
function curse(i, k, n) { const t = X().targets[i]; t[k] = Math.max(0, t[k] + n); save(); render(); }
function curseTurn(i) { const t = X().targets[i]; t.stacks += t.curses; save(); render(); }
function curseAll() { X().targets.forEach(t => t.curses && t.stacks++); save(); render(); }
function curseDrop(i) { X().targets.splice(i, 1); save(); render(); }
function bloodTake() {
  const x = X(), sh = sheet(), thr = sh.level * 5;
  x.blood = (x.blood || 0) + (+$('#bdDmg').value || 0);
  let got = 0; while (x.blood >= thr) { x.blood -= thr; got++; }
  x.slotsBack = (x.slotsBack || 0) + got;
  save(); render(); if (got) toast(`Blood of the Damned — regain ${got} spell slot${got > 1 ? 's' : ''}.`);
}
USE_HOOK['curse-of-the-ashes'] = sh => { sh.x.pool = pbOf(sh.level); sh.x.targets = []; };
LONG_REST['vidarr'] = sh => { sh.x.blood = 0; sh.x.slotsBack = 0; sh.x.targets = []; sh.x.pool = 0; };

// ── White Rabbit — troops & jobs ────────────────────────────────────────
const JOBS = {
  Infantry: { charges: { 'War Cry': 2 } },
  Scout:    { charges: { 'Disrupting Bolt': 1 } },
  Medic:    { charges: { 'Fluffy Paw': 3, 'Purge Pain': 1 } },
  Magus:    { charges: { 'Magic Edge': 3, 'Arcane Nova': 2 } },
  Bulwark:  { charges: {} },
};
// Every troop gets a row of its own — the platoon proper, the reinforcements called up by the
// ability, and any summoned past the limit by Hollownest's Reinforcement Surge. They all take jobs.
const troopName = (i, base, reinf) =>
  i < base ? `Troop ${i + 1}` : i < base + reinf ? `Reinf. ${i - base + 1}` : `Surge ${i - base - reinf + 1}`;
PANELS['white-rabbit'] = (g, sh, v) => {
  const x = sh.x, base = awakened(sh) ? 3 : 2;
  const maxT = 2 * v.pb, reinf = x.reinf || 0, surge = x.surge || 0, total = base + reinf + surge;
  x.troops = x.troops || [];
  while (x.troops.length < total) x.troops.push({ job: '', used: {} });
  if (x.troops.length > total) x.troops.length = total;
  const n = j => x.troops.filter(t => t.job === j).length;
  const dex = +x.dex || 0, wis = +x.wis || 0, half = Math.floor(v.pb / 2);
  const troopRows = x.troops.map((t, i) => {
    const ch = JOBS[t.job] ? JOBS[t.job].charges : {};
    return `<div class="item ${i >= base ? 'reinf' : ''}"><span class="nm">${troopName(i, base, reinf)}</span>
      ${awakened(sh) ? `<select class="pick" onchange="troopJob(${i},this.value)"><option value="">— no job —</option>${Object.keys(JOBS).map(j => `<option ${t.job === j ? 'selected' : ''}>${j}</option>`).join('')}</select>` : ''}
      <span class="sp"></span>
      ${Object.entries(ch).map(([a, max]) => `<span class="lbl">${a}</span><span class="pips">${Array.from({ length: max }, (_, k) => `<button class="pip sm ${k < (t.used[a] || 0) ? 'used' : ''}" onclick="troopCharge(${i},'${a}',${k})"></button>`).join('')}</span>`).join('')}
    </div>`;
  }).join('');
  return `<h2>Umbra Platoon <span class="r"><button class="btn sm" onclick="troopRest()">Short rest</button></span></h2>
    <div class="stats">
      ${stat(total, `troops${reinf || surge ? ` · ${base} + ${reinf}${surge ? ` + ${surge}` : ''}` : ''}`)}
      ${stat(`${40 * total} ft`, 'warding range')}
      ${stat(`${20 - n('Infantry')}–20`, 'crit range')}
      ${n('Scout') ? stat(`+${n('Scout')}`, 'atk & dmg, +' + 3 * n('Scout') + ' Perception') : ''}
      ${n('Medic') ? stat(`+${10 * n('Medic')}`, 'max HP') : ''}
      ${n('Magus') ? stat(`+${n('Magus')}`, 'spell atk & DC') : ''}
      ${n('Bulwark') ? stat(`+${n('Bulwark')}`, 'AC & saves') : ''}
    </div>
    <div class="row" style="margin-top:10px">${numIn('Dex mod', 'dex', 0)}${numIn('Wis mod', 'wis', 0)}
      <span class="pair"><span class="lbl">Reinforcements</span><div class="step"><button onclick="xbump('reinf',-1,0,${Math.max(0, maxT - base)})">–</button><span>${reinf}</span><button onclick="xbump('reinf',1,0,${Math.max(0, maxT - base)})">+</button></div></span>
      ${surge ? `<span class="pair"><span class="lbl">Surge</span><div class="step"><button onclick="xbump('surge',-1,0,8)">–</button><span>${surge}</span><button onclick="xbump('surge',1,0,8)">+</button></div></span>` : ''}</div>
    <div class="items" style="margin-top:10px">${troopRows}</div>
    ${awakened(sh) ? `<div class="row" style="margin-top:9px">
      ${n('Infantry') ? rollBtn('Vorpal Slash', half, 6, dex) : ''}
      ${n('Scout') ? rollBtn('Psionic Arrow', half, 6, dex) : ''}
      ${n('Magus') ? rollBtn('Magic Edge', v.pb, 12, dex) : ''}
      ${n('Magus') ? rollBtn('Arcane Nova', 4, 8) : ''}
      ${n('Medic') ? rollBtn('Fluffy Paw', v.pb, 6, wis) : ''}
    </div>
    <p class="hint">Troop attacks hit at <b>${sign(dex + v.pb)}</b>. Bonus Action: every troop moves and takes one action. Jobs change after a Short or Long Rest; charges refill on a Short Rest. Reinforcements take jobs like any other troop, up to <b>${maxT}</b> in the platoon${surge ? ', and a Surge troop stands over that limit until the end of your next turn' : ''}.</p>`
    : '<p class="hint">Troop jobs open with <b>Troop Regiment</b> at Awakened.</p>'}
    <div id="pOut"></div>`;
};
function troopJob(i, j) { const t = X().troops[i]; t.job = j; t.used = {}; save(); render(); }
function troopCharge(i, a, k) { const t = X().troops[i]; t.used[a] = k < (t.used[a] || 0) ? k : k + 1; save(); render(); }
function troopRest() { (X().troops || []).forEach(t => t.used = {}); X().reinf = 0; X().surge = 0; save(); render(); toast('Troop charges restored.'); }
USE_HOOK['reinforcements'] = sh => { sh.x.reinf = (sh.x.reinf || 0) + 1; };
LONG_REST['white-rabbit'] = sh => { (sh.x.troops || []).forEach(t => t.used = {}); sh.x.reinf = 0; sh.x.surge = 0; };

// ── Makoa — the shell ───────────────────────────────────────────────────
PANELS['makoa'] = (g, sh, v) => {
  const x = sh.x; x.resists = x.resists || [];
  const str = +x.str || 0;
  const full = x.resists.length >= v.pb;
  return `<h2>The Shell</h2>
    <div class="stats">
      ${stat(sh.level, 'temp HP each turn')}
      ${stat(`${15 * v.pb} ft`, 'Snapback reach')}
      ${stat(sign(str + v.pb), 'Snapback to hit')}
      ${stat(`+${v.pb}`, 'Sheltering AC (10 ft)')}
    </div>
    <div class="row" style="margin-top:10px">${numIn('Str mod', 'str', 0)}<span class="lbl">AC</span><input class="num" type="number" value="${sh.ac}" onchange="setNum('ac',this.value)"></div>
    <div class="row">${rollBtn('Snapback', v.pb, 20, sh.ac)}${rollBtn('Healing Wave', v.pb, 8)}${rollBtn('Wrecking Wave', sh.level, 8)}</div>
    <div id="pOut"></div>
    <h3>Defiant Aegis — ${x.resists.length}/${v.pb} resistances</h3>
    <div class="chips">${DAMAGE_TYPES.map(t => `<button class="chip ${x.resists.includes(t) ? 'on' : ''}" ${!x.resists.includes(t) && full ? 'disabled' : ''} onclick="makoaRes('${t}')">${t}</button>`).join('')}</div>
    <p class="hint">Chosen after each Long Rest (never All-Mighty or Void). Breath of Life releases <b>${v.pb}</b> waves: heal in a ${20 * v.pb} ft cone, inspire within ${20 * v.pb} ft (${Math.floor(v.pb / 2)}d8 + ${v.pb} AC), or a ${30 * v.pb} ft line of all-mighty.</p>`;
};
function makoaRes(t) { const r = X().resists; const i = r.indexOf(t); i >= 0 ? r.splice(i, 1) : r.push(t); save(); render(); }

// ── Thanatos — the line between ─────────────────────────────────────────
PANELS['thanatos'] = (g, sh, v) => {
  const x = sh.x, n = +x.sacrificed || 0;
  const hys = +x.hysteria || 0;   // how many times Hysteria has been called this minute — it stacks
  const withLove = Math.floor(sh.maxHp * (1 + 0.5 * n));
  const max = Math.floor(withLove / 2 ** hys);
  const lost = withLove - max;    // what Hysteria took: base max HP with Lovely Death, less what is left
  return `<h2>Thanatos <span class="r"><span class="lbl">Hysteria</span><div class="step"><button onclick="xbump('hysteria',-1)" aria-label="One Hysteria fewer">–</button><span>${hys ? '×' + hys : 'off'}</span><button onclick="xbump('hysteria',1)" aria-label="Hysteria again">+</button></div>
      ${hys ? `<button class="btn sm" onclick="xset('hysteria',0)">End</button>` : ''}</span></h2>
    <div class="stats">
      ${stat(max, hys > 1 ? `max HP now · halved ×${hys}` : 'max HP now')}
      ${hys ? stat(`${Math.max(1, Math.floor(lost / 50))}d6`, `bonus necrotic/cold · ${lost} HP lost`) + stat('+' + 2 * hys, 'AC') + stat(`+${10 * hys} ft`, 'speed') : ''}
      ${stat(`${15 * v.pb} ft`, 'Circle radius')}
    </div>
    <div class="row" style="margin-top:10px"><span class="lbl">Base max HP</span><input class="num" type="number" style="width:64px" value="${sh.maxHp}" onchange="setNum('maxHp',this.value)"></div>
    <h3>Lovely Death</h3>
    <div class="row"><span class="lbl">Death saves sacrificed</span><div class="chips">${[0, 1, 2, 3].map(k => `<button class="chip ${n === k ? 'on' : ''}" onclick="xset('sacrificed',${k})">${k} · +${k * 50}%</button>`).join('')}</div></div>
    <p class="hint">Chosen after a Long Rest${awakened(sh) ? '' : ' (Awakened)'}; while sacrificed you roll Death Saves with advantage.</p>
    <div class="row">${rollBtn('Scent of Death', v.pb, 8)}${rollBtn('Circle of the Damned', v.pb, 12)}${rollBtn("Death's Door", v.pb, 8)}</div>
    <div id="pOut"></div>
    <p class="hint">Hysteria halves your max HP for 1 minute and keeps running even if you fall unconscious. Calling it again <b>stacks</b> — max HP halves again, another +2 AC and +10 ft — and restarts the minute. Reaper Assault: <b>${2 + v.pb}</b> attacks with doubled reach and base damage.</p>`;
};
// Each use stacks one more Hysteria and restarts its minute: one entry in the round tracker, not one per use.
// (A sheet saved when Hysteria was an on/off switch holds true, which counts as 1.)
USE_HOOK['hysteria-of-demised'] = sh => {
  const x = sh.x;
  x.hysteria = (+x.hysteria || 0) + 1;
  const last = sh.effects.map(e => e.name).lastIndexOf('Hysteria of Demised');
  sh.effects = sh.effects.filter((e, i) => e.name !== 'Hysteria of Demised' || i === last);
};
LONG_REST['thanatos'] = sh => { sh.x.hysteria = 0; };

// ── Rage of the Tiger — stances & stripes ───────────────────────────────
PANELS['rage-of-the-tiger'] = (g, sh, v) => {
  const x = sh.x; x.stances = (x.stances || []).filter(n => g.stances.some(s => s.name === n));
  const str = +x.str || 0, half = Math.floor(v.pb / 2);
  // A slot per stance the Rank allows, picked like an ability — 28 stances are too many as chips.
  const slot = i => `<div class="slotline"><select class="pick" onchange="setStance(${i},this.value)">
      <option value="">— empty —</option>
      ${g.stances.map(s => `<option value="${attr(s.name)}" ${s.name === x.stances[i] ? 'selected' : ''} ${x.stances.includes(s.name) && s.name !== x.stances[i] ? 'disabled' : ''}>${esc(s.name)}</option>`).join('')}
    </select></div>`;
  return `<h2>Arts of War <span class="r"><span class="hint">${x.stances.length}/${v.pb} stances</span></span></h2>
    <div class="stancerow">${Array.from({ length: v.pb }, (_, i) => slot(i)).join('')}</div>
    <p class="hint">Chosen after a Long Rest. Swap one when you roll initiative, as a Bonus Action, or when you drop a creature to 0.</p>
    ${x.stances.map(n => { const s = g.stances.find(t => t.name === n); return `<div class="ab passive"><div class="ab-h" onclick="this.parentNode.classList.toggle('open')"><span class="nm">${esc(n)}</span><span class="tag">stance</span><span class="car">▶</span></div><div class="ab-b">${prose(s.text)}</div></div>`; }).join('')}
    <h3>Fury of Conquest · ${v.pb} stripes</h3>
    <div class="stats">${stat(5 * v.pb, 'HP burned')}${stat(`+${5 * v.pb} ft`, 'speed')}${stat(`+${v.pb}`, 'Str score')}${stat(`+${half}d8`, 'necrotic on hit')}${stat(`${20 - half}–20`, 'crit range')}
      ${stat(Math.floor(sh.maxHp * .3), 'Tall I Stand heal')}${stat(10 + str + v.pb, 'Kneel DC (Con)')}${stat(`${15 * v.pb} ft`, 'Warmonger move')}</div>
    <div class="row" style="margin-top:10px">
      <span class="pair">${numIn('Str mod', 'str', 0)}</span>
      <span class="pair"><span class="lbl">Max HP</span><input class="num" type="number" style="width:64px" value="${sh.maxHp}" onchange="setNum('maxHp',this.value)"></span>
      <span class="pair"><span class="lbl">Wounds</span><div class="step"><button onclick="xbump('wounds',-1)">–</button><span>${x.wounds || 0}</span><button onclick="xbump('wounds',1)">+</button></div></span>
      ${rollBtn('Kneel for the King', sh.level, 10)}</div>
    <div id="pOut"></div>`;
};
// ── Hollownest: the traps ───────────────────────────────────────────────
// The Trap Library is read off the Shift's own appendix, so adding a trap to the vault page adds
// it here. Tier 1 is unlimited; Tier 2 allows 3 a Shift and Tier 3 just one.
const TIER_STOCK = { 1: Infinity, 2: 3, 3: 1 };
function trapLibrary(g) {
  const lib = (g.shift?.extra || []).find(x => /Trap Library/i.test(x.title));
  if (!lib) return [];
  const out = [];
  let tier = 1;
  for (const line of lib.text.split('\n')) {
    const t = line.match(/^###\s+Tier\s+(\d)/i);
    if (t) { tier = +t[1]; continue; }
    const h = line.match(/^#{4}\s+(.+?)\s*$/);
    if (!h) continue;
    const m = h[1].match(/^(.+?)\s*[*_]*\(([^)]+)\)/);
    out.push({ tier, name: (m ? m[1] : h[1]).replace(/[*_]/g, '').trim(), trigger: m ? m[2].replace(/[*_]/g, '').trim() : '' });
  }
  return out;
}
const trapsActive = sh => Math.max(3, sh.level >= 20 ? 8 : sh.level >= 17 ? 5 : 3);

SHIFT_PANEL['white-rabbit'] = (g, sh, rs) => {
  rs.traps = rs.traps || []; rs.placed = rs.placed || {};
  const lib = trapLibrary(g), max = trapsActive(sh);
  const left = t => TIER_STOCK[t] - (rs.placed[t] || 0);
  const full = rs.traps.length >= max;
  return `<h3>The Queen's Arsenal <span class="hint" style="font-family:var(--serif);font-weight:400">${rs.traps.length}/${max} set · Tier 2 ${rs.placed[2] || 0}/3 · Tier 3 ${rs.placed[3] || 0}/1</span></h3>
    <div class="items">${rs.traps.map((t, i) => `<div class="item">
        <span class="nm">${esc(t.name)}</span><span class="tag">T${t.tier}</span>
        ${t.trigger ? `<span class="hint">${esc(t.trigger)}</span>` : ''}
        <input class="txt" style="flex:1;min-width:120px" placeholder="Where? — yours alone" value="${attr(t.where || '')}" onchange="trapWhere(${i},this.value)">
        <button class="btn sm warn" title="It went off — a spent trap vanishes" onclick="trapSprung(${i})">Sprung</button>
        <button class="x" title="Never mind — take it back and refund the tier" onclick="trapDrop(${i})">×</button>
      </div>`).join('') || '<p class="hint">No traps laid.</p>'}</div>
    <div class="row" style="margin-top:9px">
      <select class="pick" id="trapPick" style="flex:1;min-width:190px">${lib.map(t =>
        `<option value="${attr(t.name)}" ${left(t.tier) <= 0 ? 'disabled' : ''}>Tier ${t.tier} · ${esc(t.name)}${t.trigger ? ' · ' + esc(t.trigger) : ''}${left(t.tier) <= 0 ? ' — none left' : ''}</option>`).join('')}</select>
      <button class="btn ${full ? '' : 'pri'}" ${full ? 'disabled' : ''} onclick="setTrap()">${full ? 'No trap slot free' : 'Set a trap · Bonus Action'}</button>
    </div>
    <p class="hint">One a turn. Enemies find them on a <b>DC ${35 + pbOf(sh.level)}</b> Investigation check; you always know where yours are and see 10 ft around each. Your troops cross them safely. <b>Write the place here and tell no one</b> — not even your DM. This list lives in your browser only.</p>
    <h3>Reinforcement Surge</h3>
    <div class="row">
      <span class="lbl">Troops over the limit</span>
      <div class="step"><button onclick="xbump('surge',-1,0,8)">–</button><span>${sh.x.surge || 0}</span><button onclick="xbump('surge',1,0,8)">+</button></div>
      <span class="hint" style="flex:1;min-width:220px">The Lair Action calls a troop of any specialization past your normal limit, fully corporeal, acting at once. It takes a job in the platoon above like any other, and stands until the end of your next turn.</span>
    </div>`;
};
function setTrap() {
  const g = grimmById(S.current), sh = sheet(), rs = rsState(sh);
  const t = trapLibrary(g).find(x => x.name === $('#trapPick').value);
  if (!t) return toast('Choose a trap from the Library.');
  rs.traps = rs.traps || []; rs.placed = rs.placed || {};
  if (rs.traps.length >= trapsActive(sh)) return toast('Every trap slot is in use — let one spring first.');
  if ((TIER_STOCK[t.tier] - (rs.placed[t.tier] || 0)) <= 0) return toast(`No Tier ${t.tier} traps left this Shift.`);
  rs.traps.push({ name: t.name, tier: t.tier, trigger: t.trigger, where: '' });
  rs.placed[t.tier] = (rs.placed[t.tier] || 0) + 1;
  save(); render();
}
function trapWhere(i, v) { rsState(sheet()).traps[i].where = v; save(); }
function trapSprung(i) {
  const rs = rsState(sheet()), t = rs.traps[i];
  rs.traps.splice(i, 1); save(); render();
  toast(`${t.name} springs — and is spent.`);
}
function trapDrop(i) {
  const rs = rsState(sheet()), t = rs.traps[i];
  rs.placed[t.tier] = Math.max(0, (rs.placed[t.tier] || 1) - 1);
  rs.traps.splice(i, 1); save(); render();
}

// Solemn Temperance runs on two numbers: which banner is raised, and how loud the crowd is.
const ACCLAIM_MAX = 5;
const BANNERS = {
  king: ['The True King', 'One extra Action · one extra attack on every Attack action · fear past immunity · +2d8 Holy a hit · Kneel for 1 slot and it frightens'],
  hero: ['The True Hero', 'Auras double their radius · a crit lets whoever landed it hand an ally a Quick Action · temp HP to allies · Lay on Hands as a Reaction'],
};
const LABORS = {
  king: ['Labor of Kingship', 'Every enemy within 60 ft: Con save DC 10 + Str + Prof + 2×Acclaim. Fail — d10s of Holy equal to your level, prone, and frightened for 1 minute past immunity. +10 ft and +2d10 per Acclaim.'],
  hero: ['Labor of Heroism', 'No ally within 30 ft can be reduced below 1 HP — the damage comes to you, halved. Each takes a Quick Action and gains temp HP equal to your level. One round longer per 2 Acclaim.'],
};
SHIFT_PANEL['rage-of-the-tiger'] = (g, sh, rs) => {
  const acc = Math.max(0, Math.min(ACCLAIM_MAX, +rs.acclaim || 0));
  const flying = rs.banner === 'hero' ? 'hero' : 'king';
  rs.labors = rs.labors || {};
  const banner = k => `<button class="btn ${flying === k ? 'on' : ''}" onclick="setBanner('${k}')" title="${attr(BANNERS[k][1])}">${BANNERS[k][0]}</button>`;
  const spent = rs.labors[flying];
  return `<h3>The Banner and the Crowd <span class="hint" style="font-family:var(--serif);font-weight:400">${BANNERS[flying][0]} flies</span></h3>
    <div class="row">${banner('king')}${banner('hero')}<span class="hint" style="flex:1;min-width:210px">${esc(BANNERS[flying][1])}</span></div>
    <div class="row" style="margin-top:9px">
      <span class="lbl">Acclaim</span>
      <div class="step"><button onclick="bumpAcclaim(-1)">–</button><span>${acc}/${ACCLAIM_MAX}</span><button onclick="bumpAcclaim(1)">+</button></div>
      <span class="pips">${Array.from({ length: ACCLAIM_MAX }, (_, i) => `<span class="pip ${i < acc ? 'used' : ''}"></span>`).join('')}</span>
      <div class="stat"><b>+${2 * acc}</b><i>to Kneel, Grimm DCs &amp; Labors</i></div>
      <button class="btn ${spent ? 'on' : 'pri'}" ${spent ? 'disabled' : ''} onclick="grandLabor()" title="Action · 2 Grimm Slots · once each per Shift">${spent ? LABORS[flying][0] + ' — done' : 'Grand Labor: ' + LABORS[flying][0]}</button>
    </div>
    <p class="hint">Acclaim: <b>+1</b> when Richard drops a creature to 0, <b>+1</b> when an ally acts on a King's Request, <b>+2</b> when he rises with Tall I Stand. Perform <b>both</b> Labors in one Shift and the throne survives the collapse.</p>`;
};
function setBanner(k) { rsState(sheet()).banner = k; save(); render(); }
function bumpAcclaim(n) {
  const rs = rsState(sheet());
  rs.acclaim = Math.max(0, Math.min(ACCLAIM_MAX, (+rs.acclaim || 0) + n));
  save(); render();
}
function grandLabor() {
  const sh = sheet(), rs = rsState(sh), k = rs.banner === 'hero' ? 'hero' : 'king';
  rs.labors = rs.labors || {};
  if (rs.labors[k]) return;
  if (!spend(2)) return;                                   // Action · 2 Grimm Slots
  rs.labors[k] = true; save(); render();
  const acc = Math.max(0, Math.min(ACCLAIM_MAX, +rs.acclaim || 0)), v = derived(sh);
  const detail = k === 'king'
    ? `<p>Every enemy within <b>${60 + 10 * acc} ft</b>: Constitution save, <b>DC ${10 + (+sh.x.str || 0) + v.pb + 2 * acc}</b>. On a failure — <b>${sh.level}d10 + ${2 * acc}d10 Holy</b>, <b>prone</b>, and <b>frightened of you for 1 minute</b>, immunity be damned; your Aura of Conquest pins them there. Half damage and no fear on a success.</p>`
    : `<p>Until the start of your next turn${acc >= 2 ? `, and ${Math.floor(acc / 2)} round${Math.floor(acc / 2) > 1 ? 's' : ''} longer` : ''}, <b>no ally within 30 ft can be reduced below 1 hit point</b> — that damage comes to you instead, <b>halved</b>. Each of them takes a <b>Quick Action</b> now and gains <b>${sh.level} temporary hit points</b>.</p>`;
  openDialog(LABORS[k][0], `<div class="prose">${detail}<p><em>${k === 'king'
    ? '"On your knees. That is not a request."'
    : '"Behind me. All of you. That is not an order — I am asking."'}</em></p></div>`);
}

function setStance(i, name) {
  const s = X().stances;
  if (!name) s.splice(i, 1); else if (i < s.length) s[i] = name; else s.push(name);
  save(); render();
}
USE_HOOK['tall-i-stand'] = sh => { sh.x.wounds = (sh.x.wounds || 0) + 1; };

// ── Peco Peco — speed ───────────────────────────────────────────────────
PANELS['peco'] = (g, sh, v) => {
  const dex = +sh.x.dex || 0;
  return `<h2>Peco Peco</h2>
    <div class="stats">
      ${stat(`+${10 * v.pb} ft`, 'Swift Flow speed')}
      ${stat(`${100 * v.pb} ft`, 'Blinking Shadow')}
      ${stat(sign(v.pb), 'initiative (Awakened)')}
      ${stat(`${15 * v.pb} ft`, 'Sonic Tempest radius')}
      ${stat(8 + v.pb + dex, 'Flashpoint DC (Dex)')}
    </div>
    <div class="row" style="margin-top:10px">${numIn('Dex mod', 'dex', 0)}</div>
    <div class="row">${rollBtn('Sonic Strikes', v.pb, 10)}${rollBtn('Sonic Tempest', v.pb, 8)}${rollBtn('Flashpoint', sh.level, 10)}</div>
    <div id="pOut"></div>
    <p class="hint">Swift Flow grants an extra Bonus Action each turn; Enlightened Reflexes an extra Reaction. Sonic Tempest and Overdrive each grant another Action for 1 minute.</p>`;
};
