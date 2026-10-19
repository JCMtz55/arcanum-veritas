// Grimm-specific trackers. Each PANELS[id] returns the inside of one card; state
// lives in sheet().x. LONG_REST[id] tidies up after a rest, USE_HOOK[abilityId]
// reacts when an ability is used from the sheet.

// EXTRA[id]: a second card, below the abilities. SHIFT_PANEL[id]: a tracker inside the Reality
// Shift card, for a Shift that asks you to keep something in your head.
// SHACKLE_SETUP[id]: the window that opens behind the animation when a Shackle Break is used, for
// the choices that Grimm has to make while the chains are off.
// ROUND_HOOK[id]: called by the round tracker after it advances, for a tracker that burns down with
// the round rather than with an effect's duration (a troop's Last Stand, the ticks it spent).
// SHIFT_START[id] / SHIFT_END[id]: the Reality Shift opening and collapsing, for the state its own
// text changes — Hollownest makes the whole platoon corporeal "at full strength" as it rises.
const PANELS = {}, EXTRA = {}, SHIFT_PANEL = {}, LONG_REST = {}, USE_HOOK = {}, SHACKLE_SETUP = {};
const ROUND_HOOK = {}, SHIFT_START = {}, SHIFT_END = {};

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
// A vault page's own stats table is tried FIRST, because the prose patterns are greedy about
// where they match: a page that merely mentions "Armor Class 14 + PB" in a transformed form, or
// asks "flat 22 hit points?" in a DM note, would otherwise overwrite the real numbers with the
// first thing that looks like one. Table row, then line-leading label, then loose 5e wording.
function sbRead(text) {
  const t = String(text || ''), pick = (...res) => { for (const re of res) { const m = t.match(re); if (m) return m[1].trim(); } return ''; };
  const out = {
    ac: pick(/\*\*AC\*\*\s*\|\s*\**(\d+)/i, /^\W*AC\b\W*(\d+)/im, /Armor Class\W*(\d+)/i),
    hp: pick(/\*\*HP\*\*\s*\|\s*\**(\d+)/i, /^\W*HP\b\W*(\d+)/im, /Hit Points\W*(\d+)/i),
    hd: pick(/\*\*HP\*\*\s*\|\s*\**\d+\s*\(([^)]+)\)/i, /Hit Points\W*\d+\s*\(([^)]+)\)/i),
    speed: pick(/^\W*Speed\W*\|?\s*([^|\n]+)/im),
    cr: pick(/\*\*CR\*\*\s*\|\s*\**([\d/]+)/i, /^\W*CR\b\W*([\d/]+)/im, /Challenge(?: Rating)?\W*([\d/]+)/i, /\*\*Base\*\*\s*\|[^|]*\|\s*\**([\d/]+)/),
  };
  const scores = [...t.matchAll(/(\d{1,2})\s*\(\s*[+−–-]?\s*\d+\s*\)/g)].map(m => +m[1]);
  if (scores.length >= 6) ABILS.forEach((a, i) => out[a] = scores[i]);
  return out;
}
// Everything a Gate of Caelum sheet can recruit: the vault's servants, then the player's own.
// The vault keeps a soul's Base block and its two Parted Gates forms as three separate files, so
// the forms arrive already split — and the AC/HP/CR scrape only ever sees the Base block, which is
// what stops a Divine Form's "Armor Class 15 + PB" from being read as the soul's own AC.
// The first plate on a page is that soul's face — the builder has already copied it into img/.
const firstImage = t => (String(t || '').match(/!\[[^\]]*\]\(([^)\s]+)\)/) || [])[1] || '';
const withArt = f => f && { ...f, img: firstImage(f.text) };
// A vault soul's id is derived from its NAME, never its position in the folder. It used to be
// 'vault:' + readdirSync index, so adding or renaming one Base file shifted every index and quietly
// re-pointed saved state — HP, attuned items, trackers — at a different Servant. gateState() below
// migrates the old positional keys across once.
const vaultKey = name => 'vault:' + String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
// What the player is allowed to change about a vault soul (Juan, 2026-10-09): its numbers, nothing
// else. The vault keeps owning the prose, so your statblock fixes keep reaching them.
const EDITABLE = ['level', 'cr', 'hp', 'ac', 'speed', ...ABILS];
function sbAll(g = grimmById('gate-of-caelum'), x = sheet('gate-of-caelum').x) {
  const edits = x.edits || {};
  return [
    ...g.servants.map(s => {
      const id = vaultKey(s.name);
      const base = {
        id, name: s.name, vault: true, body: s.text, img: firstImage(s.text),
        forms: (s.divine || s.forbidden) ? { divine: withArt(s.divine), forbidden: withArt(s.forbidden) } : null,
        ...sbRead(s.text),
      };
      // The player's upgrades sit on top of the scraped numbers — an empty string means "unchanged".
      const e = edits[id] || {};
      for (const k of EDITABLE) if (e[k] !== undefined && e[k] !== '') base[k] = e[k];
      if (e.note) base.note = e.note;
      return base;
    }),
    ...(x.statblocks || []),
  ];
}
const sbFind = id => sbAll().find(b => b.id === id);
// One form, on its own — never both at once.
function viewForm(id, which) {
  const b = sbFind(id), f = b && b.forms && b.forms[which];
  if (!f) return toast('That Servant has no Parted Gates forms.');
  openDialog(f.name, prose(f.text, sheet()));
}

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
  x.statblocks = x.statblocks || []; x.souls = x.souls || {}; x.edits = x.edits || {};
  // Positional vault ids → name-keyed ones, once. The index order is the order g.servants is in,
  // which is the order the builder read the Base folder in, so the mapping is exact for any sheet
  // saved before this change. Anything pointing past the end of the roster is dropped rather than
  // guessed at — that soul's file is gone from the vault.
  if (!x.vaultKeyed) {
    for (const bag of ['souls', 'edits']) {
      for (const [k, v] of Object.entries(x[bag] || {})) {
        const m = /^vault:(\d+)$/.exec(k);
        if (!m) continue;
        delete x[bag][k];
        const s = g.servants[+m[1]];
        if (s) x[bag][vaultKey(s.name)] = v;
      }
    }
    x.vaultKeyed = true;
  }
  if (x.servants) {            // sheets saved before souls and statblocks were one thing
    for (const s of x.servants) {
      let b = sbAll(g, x).find(b => b.id === s.sb) || sbAll(g, x).find(b => b.name === s.name);
      if (!b) { b = { id: sbNewId(), name: s.name, cr: s.cr === '?' ? '' : s.cr, hp: s.max || '', body: '' }; x.statblocks.push(b); }
      if (!x.souls[b.id]) x.souls[b.id] = { hp: s.hp, elite: !!(s.out && s.elite), out: !!s.out, items: s.items || '' };
    }
    delete x.servants;
  }
  const all = sbAll(g, x).map(b => ({ b, s: x.souls[b.id] || (x.souls[b.id] = { hp: null, elite: false, out: false, items: '' }) }));
  // Sheets written before preparation existed had every recruited soul available. Carry the first
  // day's worth over as prepared so nobody opens the app to an empty roster, then leave it alone.
  if (!x.prepInit) {
    const cap = gatePrepared(sheet('gate-of-caelum'));
    all.forEach(({ s }, i) => { if (s.prep === undefined) s.prep = i < cap; });
    x.prepInit = true;
  }
  return all;
}
// Two different caps, and they are not the same number (rework, Juan 2026-10-09):
//   the ROSTER is every soul he holds at all — character level, so 11 at level 11;
//   PREPARED is how many of them answer today — the Grimm's old Servant Slots, 3 Invoked / 6 Awakened.
// Preparing is free until the first summon of the day; after that a swap costs a Grimm Slot.
const gatePrepared = sh => awakened(sh) ? 6 : 3;
const gateRoster = sh => sh.level;
const gateSlots = gateRoster;                  // old name, kept for the Recruit cap
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
  const sb = shackleOn(sh, g);          // the Parted Gates, while they are open
  const limit = Math.ceil(v.pb / 2);
  const field = souls.filter(o => o.s.out), lent = souls.filter(o => o.s.lent), limbo = souls.filter(o => !o.s.out && !o.s.lent);
  const ready = limbo.filter(o => o.s.prep);     // prepared today, so it can actually be called
  const prepped = souls.filter(o => o.s.prep).length, prepCap = gatePrepared(sh);
  const out = field.filter(o => !o.s.elite).length;
  const bonusHp = 10 * v.pb * (+x.missing || 0);
  // What is on the field gets a card with its face on it — there are only ever two, plus an Elite,
  // and a transformed Servant wears the art of the form it is wearing.
  const rows = field.map(({ b, s }) => { const id = attr(b.id), arm = ARMAMENT[s.armament];
    const form = sb && s.form && b.forms && b.forms[s.form];   // transformed by the Parted Gates
    const art = (form && form.img) || b.img, title = form ? form.name : b.name;
    const max = gateMaxHp(b, s, sh);
    const frac = !form && max ? Math.max(0, Math.min(1, (+s.hp || 0) / max)) : null;
    return `<div class="soulcard${form ? ' formed' : s.elite ? ' elite' : ''}">
      <div class="face">${art ? `<img src="${attr(art)}" alt="">` : `<span class="noface">${esc(b.name.slice(0, 1))}</span>`}
        ${form ? `<span class="badge">${s.form === 'divine' ? '✦ Divine' : '◉ Forbidden'}</span>`
               : s.elite ? `<span class="badge">Elite${arm ? ' · ' + arm[0] : ''}</span>` : ''}
        ${b.cr ? `<span class="crtag">CR ${esc(b.cr)}</span>` : ''}
      </div>
      <div class="meat">
        <div class="nm" title="${attr(title)}">${esc(title)}</div>
        ${form ? `<div class="lbl tether" title="Soul Tether: it shares your hit point pool">Soul Tether — shares your pool</div>`
               : `<div class="hpline"><span class="lbl">HP</span>
            <input class="num" type="number" value="${s.hp ?? ''}" onchange="soulSet('${id}','hp',this.value,true)">
            <span class="lbl">/ ${max ?? '—'}</span></div>
          ${frac === null ? '' : `<div class="hpbar"><i style="width:${Math.round(frac * 100)}%"></i></div>`}`}
        <div class="acts">
          <button class="btn sm" onclick="${form ? `viewForm('${id}','${s.form}')` : `viewStatblock('${id}')`}">Statblock</button>
          <button class="btn sm warn" title="It dropped to 0 HP — back to Limbo; it answers again at full HP" onclick="soulFell('${id}')">Fell</button>
          <button class="btn sm" title="Send it back to Limbo — it keeps its HP" onclick="dismissSoul('${id}')">Dismiss</button>
        </div>
        ${s.elite ? `<div class="acts">
          <button class="btn sm ${s.willUsed ? 'on' : ''}" title="Once per summon: automatically succeed on a saving throw" onclick="soulSet('${id}','willUsed',${!s.willUsed},true)">Servant's Will · ${s.willUsed ? 'used' : 'ready'}</button>
          <button class="btn sm" title="End of its turn: regains PB d4 hit points" onclick="soulRegen('${id}')">Regenerate · ${v.pb}d4</button>
          ${s.armament === 'warrior' ? rollBtn('Necrotic', v.pb, 6) : ''}</div>
          <p class="hint">${arm ? arm[1](v.pb) + '. ' : ''}Can't be dominated.</p>` : ''}
        ${trCardHtml(b.id, s)}
        ${s.items ? `<p class="hint">Attuned: ${esc(s.items)}</p>` : ''}
      </div>
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
      ${stat(`${prepped}/${prepCap}`, x.prepLocked ? 'prepared · locked' : 'prepared today', prepped > prepCap ? 'var(--ember)' : '')}
      ${stat(`${souls.length}/${gateRoster(sh)}`, 'soul roster')}
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
    ${rows ? `<div class="souls">${rows}</div>` : '<p class="hint">Every soul is in Limbo.</p>'}
    <div class="row" style="margin-top:9px">
      <select class="pick" id="svBlock" style="flex:1"><option value="">${ready.length || (sb && field.length) ? 'Summon a servant…' : limbo.length ? 'None of today\'s Servants are in Limbo' : souls.length ? 'Nothing prepared — prepare the day\'s Servants below' : 'No souls recruited yet'}</option>${
        // Only what was prepared today answers. The Parted Gates transform a Servant who is ALREADY
        // on the field, so while they are open the ones out there are choosable too.
        (sb ? [...ready, ...field] : ready).map(({ b, s }) => `<option value="${attr(b.id)}">${esc(b.name)}${b.cr ? ' · CR ' + esc(b.cr) : ''}${s.out ? ' · on the field' : ''}</option>`).join('')}</select>
      ${sb ? `<select class="pick" id="svMode" onchange="$('#svArm').hidden = this.value !== 'elite'" title="While ${esc(sb.name)} is open, a Servant can be called into one of its forms">
        <option value="">as itself</option>
        <option value="elite">as Elite</option>
        <option value="divine">✦ Divine Form</option>
        <option value="forbidden">◉ Forbidden Form</option>
      </select>`
      : `<label class="lbl"><input type="checkbox" id="svElite" onchange="$('#svArm').hidden = !this.checked"> as Elite</label>`}
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
  const mode = $('#svMode') ? $('#svMode').value : ($('#svElite').checked ? 'elite' : '');
  const asElite = mode === 'elite', asForm = mode === 'divine' || mode === 'forbidden';
  if (!x.souls[id].prep) return toast(`${b.name} was not prepared today — call it up from the roster first.`);
  // A form is the same move wherever it is chosen from — the Summon row, or the Shackle Break's own
  // window — so there is one implementation of it, below.
  if (asForm) return transformServant(id, mode);
  if (x.souls[id].out) return toast(`${b.name} is already on the field.`);
  if (asElite && field.some(s => s.elite)) return toast('An Elite Servant is already on the field.');
  if (!asElite && field.filter(s => !s.elite).length >= limit) return toast(`You can hold ${limit} servant${limit > 1 ? 's' : ''} at once — dismiss one first.`);
  if (sheet().familiar) return toast('Your Grimm is in Familiar form — it can\'t summon.');
  const armament = asElite ? $('#svArm').value : '';
  if (!spend(asElite ? 2 : 1)) return;           // Commander of Souls costs 1 Grimm Slot, Elite Servant 2
  const s = x.souls[id];
  x.prepLocked = true;                           // the day has begun — re-preparing now costs
  s.out = true; s.elite = asElite; s.form = ''; s.armament = armament; s.willUsed = false;
  // never tracked, or fell at 0 — it answers the call whole, at the max HP it has right now
  if (!s.hp) s.hp = gateMaxHp(b, s) ?? 0;
  // an Elite's arrival halves the others: nobody keeps more HP than their new max
  if (asElite) Object.entries(x.souls).forEach(([k, o]) => {
    const ob = sbFind(k), max = ob && o.out && !o.elite ? gateMaxHp(ob, o) : null;
    if (max != null && o.hp > max) o.hp = max;
  });
  // Anything this Servant refills "each summon" is full again as it arrives — only its own.
  const refilled = trRefill('summon', id);
  save(); render();
  toast(`${b.name} answers — ${asElite ? '2 Grimm Slots' : '1 Grimm Slot'} spent${refilled ? `, ${refilled} charge${refilled > 1 ? 's' : ''} full again` : ''}.`);
}
// ── The Parted Gates take one Servant ───────────────────────────────────
// The Shackle Break already paid for the transformation, so a form costs no further slot. Everything
// else on the field goes home: "All other active Servants immediately return to Limbo, pouring their
// remaining strength through the gate as they depart" — 5 × PB temporary hit points each.
// Returns true when it happened, so a caller can close its window on success and leave it open on a
// refusal with the toast still readable.
function transformServant(id, mode) {
  const b = sbFind(id), x = X();
  if (!b) return toast('Choose which Servant the Gates take.');
  if (!(b.forms && b.forms[mode])) return toast(`${b.name} has no ${mode === 'divine' ? 'Divine' : 'Forbidden'} Form.`);
  if (!x.souls[id].prep) return toast(`${b.name} was not prepared today — call it up from the roster first.`);
  if (Object.entries(x.souls).some(([k, o]) => k !== id && o.out && o.form)) return toast('The Parted Gates transform one Servant. Dismiss the transformed one first.');
  if (sheet().familiar) return toast('Your Grimm is in Familiar form — it can\'t summon.');
  const s = x.souls[id];
  x.prepLocked = true;
  s.out = true; s.elite = false; s.form = mode; s.armament = ''; s.willUsed = false;
  let sent = 0;
  Object.entries(x.souls).forEach(([k, o]) => { if (k !== id && o.out) { o.out = false; o.elite = false; o.form = ''; sent++; } });
  if (!s.hp) s.hp = gateMaxHp(b, s) ?? 0;
  trRefill('summon', id);
  save(); render();
  const f = b.forms[mode], pb = pbOf(sheet().level);
  toast(`${f.name}${sent ? ` — ${sent} Servant${sent > 1 ? 's' : ''} returned to Limbo, +${5 * pb} temporary hit points to the shared pool` : ''}.`);
  return true;
}
// The window the Break opens: the one decision the Gates force. A Servant already on the field is
// the usual answer, but one prepared and waiting in Limbo can be called straight into a form, which
// is what the Summon row allows while the Gates are open — so both are offered here.
SHACKLE_SETUP['gate-of-caelum'] = (sh, g) => {
  const x = sh.x, souls = gateState(g, x), pb = pbOf(sh.level);
  const has = o => o.b.forms && (o.b.forms.divine || o.b.forms.forbidden);
  const field = souls.filter(o => o.s.out && has(o)), ready = souls.filter(o => !o.s.out && !o.s.lent && o.s.prep && has(o));
  if (!field.length && !ready.length)
    return { body: `<div class="prose"><p>The Gates are open and there is <b>no Servant for them to take</b> — nothing prepared today has a form, on the field or in Limbo.</p>
      <p>Everything else the Break does is already running. You can still transform one later from the <b>Summoned</b> card.</p></div>` };
  // Who it is, is a name — the Servant you already know. WHAT it becomes is a picture, because the
  // two forms are the actual choice and they look nothing like each other.
  const all = [...field, ...ready];
  return {
    done: 'Not yet',
    after: shackleFormPick,
    body: `<div class="prose"><p>The Gates part for <b>one</b> Servant. Every other Servant on the field returns to Limbo as it changes, pouring <b>${5 * pb} temporary hit points</b> each into the shared pool on the way out.</p></div>
      <div class="row"><span class="lbl">The Gates take</span>
        <select class="pick" id="sgWho" style="flex:1;min-width:200px" onchange="shackleFormPick()">${
          all.map(o => `<option value="${attr(o.b.id)}">${esc(o.b.name)}</option>`).join('')}</select></div>
      <p class="hint" id="sgNote"></p>
      <div class="formgrid" id="sgForms"></div>
      <div id="sgText"></div>`,
  };
};
// Redrawn whenever the chosen Servant changes: its own two forms, wearing their own art, and what
// choosing costs. The card is the choice; Read sits inside it and doesn't take the form with it.
const FORM_LABEL = { divine: ['✦', 'Divine Form'], forbidden: ['◉', 'Forbidden Form'] };
function shackleFormPick() {
  const b = sbFind($('#sgWho').value), f = (b && b.forms) || {}, x = X();
  const here = (x.souls[(b || {}).id] || {}).out;
  const sent = Object.entries(x.souls).filter(([k, o]) => k !== (b || {}).id && o.out && sbFind(k)).map(([k]) => sbFind(k).name);
  const card = mode => {
    const [mark, label] = FORM_LABEL[mode];
    if (!f[mode]) return `<div class="formcard empty"><span class="meat">
      <span class="nm">No ${label}</span><span class="lbl">${esc(b.name)} has none written.</span></span></div>`;
    // Four of the twelve forms have no plate in the vault yet (Ishmar's and Silence's). They get the
    // mark in place of art rather than an empty grey window.
    return `<div class="formcard ${mode}" onclick="shackleTakeForm('${mode}')" title="Take this form">
      <span class="art">${f[mode].img ? `<img src="${attr(f[mode].img)}" alt="" loading="lazy">` : `<span class="noart">${mark}</span>`}
        <span class="mark">${mark} ${label}</span></span>
      <span class="meat"><span class="nm">${esc(f[mode].name)}</span>
        <button class="btn sm" onclick="event.stopPropagation();shackleFormRead('${mode}')">Read it first</button></span>
      <span class="take">${mark} Take this form</span></div>`;
  };
  $('#sgForms').innerHTML = card('divine') + card('forbidden');
  $('#sgNote').innerHTML = `<b>${esc(b.name)}</b> is ${here ? 'on the field' : 'in Limbo — it answers as it changes'}. ${sent.length
    ? `Choosing sends <b>${sent.map(esc).join('</b>, <b>')}</b> back to Limbo — they keep their HP and can be summoned again.`
    : 'Nothing else is on the field, so nothing is sent back.'}`;
  $('#sgText').innerHTML = '';
}
// In place, under the picker — never in a new dialog, which would replace this window.
function shackleFormRead(mode) {
  const b = sbFind($('#sgWho').value), f = b && b.forms && b.forms[mode];
  $('#sgText').innerHTML = f ? `<div class="sb-read">${prose(f.text, sheet())}</div>` : '';
}
function shackleTakeForm(mode) {
  if (transformServant($('#sgWho').value, mode) === true) $('#dlg').close();
}
function dismissSoul(id) { const s = X().souls[id]; s.out = false; s.elite = false; s.form = ''; save(); render(); }
function soulSet(id, k, v, redraw) { X().souls[id][k] = k === 'hp' || k === 'pool' ? +v : v; save(); if (redraw) render(); }

// ── charge trackers ─────────────────────────────────────────────────────
// Spell slots, inspiration dice, weapon charges, Ki — anything a Servant spends and gets back.
// The player writes their own (Juan, 2026-10-09): a name, a maximum, and when it refills. Kept per
// soul in x.souls[id].tr, so they travel with the soul and survive a dismissal.
//
// On a summon card they stay behind ONE toggle and nothing else, so a card is exactly as tall as it
// was before trackers existed until the player asks to see them. Which is open is deliberately NOT
// saved: it is a glance, not state, and it should not sync or survive a reload.
const TR_OPEN = new Set();
const trOf = s => (s.tr = s.tr || []);
const RESETS = { none: 'never', short: 'short rest', long: 'long rest', summon: 'each summon' };
// Few enough to count at a glance → pips. More than that and pips are a wall, so show the numbers.
const trPips = t => +t.max > 0 && +t.max <= 6;

function trToggle(id) { TR_OPEN.has(id) ? TR_OPEN.delete(id) : TR_OPEN.add(id); render(); }
function trAdd(soulId) {
  const name = ($('#trName')?.value || '').trim();
  const max = Math.max(0, Math.floor(+($('#trMax')?.value || 0)));
  const reset = $('#trReset')?.value || 'long';
  if (!name) return toast('Give the tracker a name — "Ki", "Holy Arcana", "1st-level slots".');
  if (!max) return toast('How many? Set a maximum above 0.');
  trOf(X().souls[soulId]).push({ id: 't' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36), name, max, cur: max, reset });
  TR_OPEN.add(soulId);
  save(); render(); editTrackers(soulId); toast(`${name} — ${max}, refills on a ${RESETS[reset]}.`);
}
function trStep(soulId, trId, d) {
  const t = trOf(X().souls[soulId]).find(t => t.id === trId); if (!t) return;
  t.cur = Math.max(0, Math.min(+t.max, (+t.cur || 0) + d));
  save(); render();
}
function trPip(soulId, trId, n) {
  const t = trOf(X().souls[soulId]).find(t => t.id === trId); if (!t) return;
  t.cur = (+t.cur === n) ? n - 1 : n;      // clicking the last filled pip spends it
  save(); render();
}
function trEdit(soulId, trId, k, v) {
  const t = trOf(X().souls[soulId]).find(t => t.id === trId); if (!t) return;
  if (k === 'max') { t.max = Math.max(0, Math.floor(+v || 0)); t.cur = Math.min(+t.cur || 0, t.max); }
  else t[k] = v;
  save(); render(); editTrackers(soulId);
}
function trDel(soulId, trId) {
  const s = X().souls[soulId], list = trOf(s), i = list.findIndex(t => t.id === trId);
  if (i < 0) return;
  const [gone] = list.splice(i, 1);
  save(); render(); editTrackers(soulId); toast(`Removed ${gone.name}.`);
}

// The editor: naming them, sizing them, saying when they come back. Spending them happens on the
// card, not here — this dialog is the thing you open once and then forget about.
function editTrackers(soulId) {
  const b = sbFind(soulId), s = X().souls[soulId];
  if (!b || !s) return;
  const id = attr(soulId), list = trOf(s);
  const rows = list.map(t => { const tid = attr(t.id);
    return `<div class="row">
      <input class="txt" style="width:150px" value="${attr(t.name)}" onchange="trEdit('${id}','${tid}','name',this.value)">
      <span class="lbl">of</span>
      <input class="num" type="number" min="0" value="${+t.max || 0}" onchange="trEdit('${id}','${tid}','max',this.value)">
      <span class="lbl">refills on</span>
      <select class="pick" onchange="trEdit('${id}','${tid}','reset',this.value)">
        ${Object.entries(RESETS).map(([k, lbl]) => `<option value="${k}"${t.reset === k ? ' selected' : ''}>${lbl}</option>`).join('')}
      </select>
      <span class="hint">${trPips(t) ? 'pips' : 'numbers'}</span>
      <span class="sp"></span>
      <button class="btn sm warn" onclick="trDel('${id}','${tid}')">Remove</button>
    </div>`; }).join('');
  openDialog(`${b.name} — charges`, `
    ${rows || '<p class="hint">Nothing tracked yet.</p>'}
    <h3>Add one</h3>
    <div class="row">
      <input class="txt" id="trName" style="width:150px" placeholder="Ki, Holy Arcana, 1st-level slots…">
      <span class="lbl">of</span>
      <input class="num" id="trMax" type="number" min="1" value="3">
      <span class="lbl">refills on</span>
      <select class="pick" id="trReset">${Object.entries(RESETS).map(([k, lbl]) =>
        `<option value="${k}"${k === 'long' ? ' selected' : ''}>${lbl}</option>`).join('')}</select>
      <span class="sp"></span>
      <button class="btn pri" onclick="trAdd('${id}')">Add</button>
    </div>
    <p class="hint">Six or fewer shows as <b>pips</b> you click; more than six shows as <b>numbers</b> with – and +. They sit behind one <b>Charges</b> button on the summon card, so the card stays the size it is until you open them. A long rest also refills anything set to a short rest.</p>`);
}
// Called by the rest buttons and by Summon. Refills every tracker whose rule matches, on every
// soul — a long rest also covers anything that refills on a short one.
function trRefill(kind, soulId) {
  const x = X(), kinds = kind === 'long' ? ['long', 'short'] : [kind];
  let n = 0;
  for (const [id, s] of Object.entries(x.souls || {})) {
    if (soulId && id !== soulId) continue;
    for (const t of trOf(s)) if (kinds.includes(t.reset) && +t.cur !== +t.max) { t.cur = +t.max; n++; }
  }
  return n;
}

// The card's one line: a toggle, and the trackers only once asked for.
function trCardHtml(soulId, s) {
  const list = trOf(s);
  if (!list.length) return '';
  const id = attr(soulId), open = TR_OPEN.has(soulId);
  const spent = list.filter(t => +t.cur < +t.max).length;
  if (!open) return `<div class="acts"><button class="btn sm trtog" onclick="trToggle('${id}')"
      title="${attr(list.map(t => `${t.name} ${t.cur}/${t.max}`).join(' · '))}">▸ Charges · ${list.length}${spent ? ` · ${spent} spent` : ''}</button></div>`;
  return `<div class="acts"><button class="btn sm trtog on" onclick="trToggle('${id}')">▾ Charges</button></div>
    <div class="trwrap">${list.map(t => {
      const tid = attr(t.id), cur = +t.cur || 0, max = +t.max || 0;
      const body = trPips(t)
        ? `<span class="pips">${Array.from({ length: max }, (_, i) =>
            `<i class="${i < cur ? 'on' : ''}" title="${i + 1} of ${max}" onclick="trPip('${id}','${tid}',${i + 1})"></i>`).join('')}</span>`
        : `<button class="pm" onclick="trStep('${id}','${tid}',-1)" aria-label="Spend one">–</button>
           <span class="cnt ${cur === 0 ? 'out' : ''}">${cur}<small>/${max}</small></span>
           <button class="pm" onclick="trStep('${id}','${tid}',1)" aria-label="Give one back">+</button>`;
      return `<div class="tr"><span class="nm" title="${attr(t.name)} — refills on a ${attr(RESETS[t.reset] || 'long rest')}">${esc(t.name)}</span>
        ${body}
        <button class="btn sm" title="Refill it" onclick="trStep('${id}','${tid}',${max})">↺</button></div>`;
    }).join('')}</div>`;
}
// 0 HP: back to Limbo, whole again the next time it is called. Arcane Repose answers if it is composed.
function soulFell(id) {
  const b = sbFind(id), s = X().souls[id], sh = sheet();
  s.out = false; s.elite = false; s.form = ''; s.hp = null; s.willUsed = false;
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

// ── Preparing the day's Servants ──
// Free to arrange until the first summon of the day; after that, calling a soul up out of the roster
// is a swap — 1 Grimm Slot and an Action. Letting one go is always free; it just stops answering.
function prepSoul(id) {
  const sh = sheet(), x = X(), s = x.souls[id], b = sbFind(id), cap = gatePrepared(sh);
  if (s.prep) {
    if (s.out) return toast(`${b.name} is on the field — dismiss it first.`);
    if (s.lent) return toast(`${b.name} is relinquished — call it back first.`);
    s.prep = false; save(); render();
    return toast(`${b.name} stands down for the day.`);
  }
  if (Object.values(x.souls).filter(o => o.prep).length >= cap)
    return toast(`You can prepare ${cap} Servant${cap > 1 ? 's' : ''} a day — stand one down first.`);
  if (x.prepLocked && !spend(1)) return;         // the day has begun: swapping costs
  s.prep = true; save(); render();
  toast(x.prepLocked ? `${b.name} is called up — 1 Grimm Slot spent (Action).` : `${b.name} is prepared for the day.`);
}

// ── Recruited souls: the statblocks, in a card of their own ──
EXTRA['gate-of-caelum'] = (g, sh, v) => {
  const x = sh.x, souls = gateState(g, x), slots = gateSlots(sh);
  const sb = shackleOn(sh, g);          // the forms are only offered while the Gates are open
  const boost = Math.min(3, +x.ariseBoost || 0), maxCr = gateMaxCr(sh) + boost, cr = x.ariseCr;
  const canLend = has(sh, 'relinquish-command');
  // A soul per tile, in the hotbar's square vocabulary. At level 13 this card was thirteen
  // full-width rows of eight buttons each and ran past 2000px on its own; the roster is something
  // you scan — who is prepared, who is out — and act on one at a time, so the face carries the
  // glance (initials, CR, prepared, summoned, lent) and the panel carries the eight buttons.
  const rows = souls.map(({ b, s }) => {
    const over = crNum(b.cr) > gateMaxCr(sh) + 3;
    const state = s.out ? 'out' : s.lent ? 'lent' : s.prep ? 'prep' : 'rest';
    return `<button type="button" class="slotbtn soul ${state}${s.prep || s.out ? '' : ' dim'}"
      data-soul="${attr(b.id)}" onclick="event.stopPropagation();soulPanel(this,'${attr(b.id)}')"
      title="${attr(b.name + (b.cr ? ` · CR ${b.cr}` : ''))}">
      <span class="sig"><b>${esc(sigil(b.name))}</b>
        ${b.cr ? `<span class="act">${esc(String(b.cr))}</span>` : ''}
        ${over ? '<span class="plus warn">!</span>' : ''}
        ${s.out ? '<span class="pips"><i></i></span>' : ''}</span>
      <span class="cap">${esc(b.name)}</span></button>`;
  }).join('');
  const prepped = souls.filter(o => o.s.prep).length, prepCap = gatePrepared(sh);
  return `<h2>The soul roster <span class="r"><button class="btn sm pri" onclick="editStatblock()">Recruit</button></span></h2>
    <div class="stats">
      ${stat(`${souls.length}/${gateRoster(sh)}`, 'souls held', souls.length > gateRoster(sh) ? 'var(--ember)' : '')}
      ${stat(`${prepped}/${prepCap}`, x.prepLocked ? 'prepared · the day has begun' : 'prepared today', prepped > prepCap ? 'var(--ember)' : '')}
    </div>
    <p class="hint">You hold <b>${gateRoster(sh)}</b> souls — your character level — and after each Long Rest you choose <b>${prepCap}</b> of them to answer that day. ${x.prepLocked ? 'The day has begun: <b>calling one up now costs 1 Grimm Slot and an Action</b>. Standing one down is free.' : 'Arrange them freely until your first summon.'}</p>
    <div class="troops">${rows || '<p class="hint">No souls answer yet.</p>'}</div>
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
// Everything the roster row used to carry, for one soul. Opened from its tile, and the only place
// any of it can be pressed — which is what lets the roster itself be a grid of squares.
function soulPanel(el, id) {
  if (abTipPin === `soul:${id}`) return abTipOff(true);
  const g = grimmById('gate-of-caelum'), sh = sheet('gate-of-caelum'), x = sh.x;
  const o = gateState(g, x).find(z => z.b.id === id);
  if (!o) return;
  const { b, s } = o, sb = shackleOn(sh, g), canLend = has(sh, 'relinquish-command');
  const q = attr(b.id);
  const facts = [b.cr && `CR ${esc(b.cr)}`, b.level && `Lv ${esc(b.level)}`, b.hp && `HP ${esc(b.hp)}`, b.ac && `AC ${esc(b.ac)}`,
    s.out && '<b>summoned</b>', s.lent && `with <b>${esc(s.lent)}</b>`,
    b.vault && ((x.edits || {})[b.id] ? '<b>upgraded</b>' : 'from the vault')].filter(Boolean).join(' · ');
  const over = crNum(b.cr) > gateMaxCr(sh) + 3;
  popAt(el, `<div class="abtip-h"><b>${esc(b.name)}</b>
      <span class="tag k">${s.out ? 'Summoned' : s.lent ? 'Relinquished' : s.prep ? 'Prepared' : 'At rest'}</span></div>
    <div class="abtip-b"><p class="hint" style="margin:0">${facts}</p>
      ${over ? '<p class="hint" style="color:#e4927f;margin:6px 0 0"><b>Above your Max Servant CR.</b></p>' : ''}
      <div class="row" style="margin-top:9px;gap:6px">
        <button class="btn sm ${s.prep ? 'on' : 'pri'}" title="${s.prep ? 'Prepared today — click to stand it down' : x.prepLocked ? 'Call it up mid-day: 1 Grimm Slot and an Action' : 'Prepare it for the day'}" onclick="prepSoul('${q}')">${s.prep ? 'Prepared' : x.prepLocked ? 'Call up · 1 slot' : 'Prepare'}</button>
        <button class="btn sm" onclick="viewStatblock('${q}')">View</button>
        ${sb && b.forms ? `${b.forms.divine ? `<button class="btn sm" title="${attr(b.forms.divine.name)}" onclick="viewForm('${q}','divine')">Divine</button>` : ''}${b.forms.forbidden ? `<button class="btn sm" title="${attr(b.forms.forbidden.name)}" onclick="viewForm('${q}','forbidden')">Forbidden</button>` : ''}` : ''}
        ${canLend && !s.out && !s.lent ? `<button class="btn sm" onclick="relinquishSoul('${q}')">Relinquish</button>` : ''}
        ${s.lent ? `<button class="btn sm warn" title="Call it back from ${attr(s.lent)} — it returns to Limbo" onclick="returnSoul('${q}')">End Relinquish</button>` : ''}
        <button class="btn sm" title="Spell slots, inspiration dice, weapon charges — anything it spends" onclick="editTrackers('${q}')">Charges${trOf(s).length ? ` · ${trOf(s).length}` : ''}</button>
        ${b.vault ? `<button class="btn sm" title="Record a Soul Shard upgrade — its numbers are yours to change; the vault keeps its text" onclick="editVaultNumbers('${q}')">Upgrade${(x.edits || {})[b.id] ? ' ✓' : ''}</button>`
                  : `<button class="btn sm" onclick="editStatblock('${q}')">Edit</button><button class="btn sm warn" onclick="releaseSoul('${q}')">Release</button>`}
      </div>
      <input class="txt" style="width:100%;margin-top:9px" placeholder="Attuned items — 2, or 3 when it is the Elite" value="${attr(s.items || '')}" onchange="soulSet('${q}','items',this.value,true)">
    </div>`, s.out ? 'super' : 'active', true);
  abTipPin = `soul:${id}`;
}

function ariseSpend(kind) {
  if (sheet().familiar) return toast('Your Grimm is in Familiar form.');
  if (!spend(1)) return;
  const x = X();
  if (kind === 'boost') x.ariseBoost = Math.min(3, (+x.ariseBoost || 0) + 1);
  save(); render();
  toast(kind === 'boost' ? 'Max Servant CR raised by 1 for this Arise — 1 Grimm Slot spent.' : 'Another attempt — 1 Grimm Slot spent. Roll Persuasion again.');
}
function ariseDone() { const x = X(); x.ariseBoost = 0; x.ariseCr = ''; save(); render(); }

// ── upgrading a vault soul ──
// Its numbers only (Juan, 2026-10-09). A Soul Shard level-up changes what a Servant *is* — CR, hit
// points, the ability it just raised — but the vault still owns its prose, so the sheet keeps
// receiving your corrections to the text. A blank field means "whatever the statblock says".
function editVaultNumbers(id) {
  const b = sbFind(id); if (!b || !b.vault) return;
  const e = (X().edits || {})[id] || {};
  const scraped = sbRead((grimmById('gate-of-caelum').servants.find(s => vaultKey(s.name) === id) || {}).text || '');
  const f = (key, label, w, type = 'number') =>
    `<span class="lbl">${label}</span><input class="${type === 'number' ? 'num' : 'txt'}" id="vn_${key}" type="${type}"
       placeholder="${attr(scraped[key] ?? '—')}" value="${attr(e[key] ?? '')}"${w ? ` style="width:${w}px"` : ''}>`;
  openDialog(`${b.name} — upgrade`, `
    <p class="hint" style="margin-top:0">Leave a field empty to keep what the statblock says. Its text, traits and actions stay as the vault writes them.</p>
    <div class="row">${f('level', 'Level', 60)}${f('cr', 'CR', 60, 'text')}${f('hp', 'HP', 70)}${f('ac', 'AC', 60)}${f('speed', 'Speed', 130, 'text')}</div>
    <div class="row">${ABILS.map(a => f(a, a.toUpperCase(), 56)).join('')}</div>
    <div class="row"><span class="lbl">Note</span><input class="txt" id="vn_note" style="flex:1" placeholder="What changed, and when" value="${attr(e.note || '')}"></div>
    <h3>Soul Shards</h3>
    <div class="row">${stat(X().shards || 0, 'banked', 'var(--brass)')}${+e.spent ? stat(+e.spent, 'spent on this one') : ''}
      <span class="lbl">Spend</span><input class="num" id="vn_spend" type="number" min="0" placeholder="40">
      <button class="btn sm" onclick="spendShards('${attr(id)}')">Spend them</button></div>
    <p class="hint">The cost and the <b>Max Servant CR</b> it needs are on this Servant's own sheet, under <i>Upgrade Path</i> — spending here just takes them out of the bank, so the number you type is the one the table agreed. Raising its CR past your cap flags itself red on the roster.</p>
    <div class="row"><button class="btn sm warn" onclick="clearVaultNumbers('${attr(id)}')">Reset to the vault</button>
      <span class="sp"></span><button class="btn pri" onclick="saveVaultNumbers('${attr(id)}')">Save</button></div>`);
}
function saveVaultNumbers(id) {
  const x = X(), out = {};
  for (const k of EDITABLE) { const v = ($('#vn_' + k)?.value ?? '').trim(); if (v !== '') out[k] = v; }
  const note = ($('#vn_note')?.value || '').trim(); if (note) out.note = note;
  x.edits = x.edits || {};
  // Shards already spent are a record of what happened, not one of the numbers being set — they
  // survive a save that clears every field, and a reset to the vault.
  const spent = +((x.edits[id] || {}).spent) || 0;
  if (spent) out.spent = spent;
  if (Object.keys(out).length) x.edits[id] = out; else delete x.edits[id];
  $('#dlg').close(); save(); render(); toast(`${sbFind(id)?.name || 'Servant'} updated.`);
}
// Shards were bankable and unspendable — Harvest put them in and nothing ever took them out, so an
// upgrade was recorded on the sheet while the balance sat there untouched. The cost itself stays on
// the Servant's own Upgrade Path rather than being parsed out of it: the table agrees the number,
// the app only moves it. Does not save or close, so it can be done alongside the numbers above.
function spendShards(id) {
  const x = X(), have = +x.shards || 0, n = Math.max(0, Math.floor(+($('#vn_spend')?.value || 0)));
  if (!n) return toast('How many shards? The cost is on its Upgrade Path.');
  if (n > have) return toast(`Only ${have} shard${have === 1 ? '' : 's'} banked — ${n} would overdraw it.`);
  x.shards = have - n;
  const e = (x.edits = x.edits || {})[id] || (x.edits[id] = {});
  e.spent = (+e.spent || 0) + n;
  save();
  $('#vn_spend').value = '';
  toast(`${n} shard${n === 1 ? '' : 's'} spent — ${x.shards} left. Set its new numbers above and Save.`);
  editVaultNumbers(id);
}
function clearVaultNumbers(id) {
  const x = X(), spent = +((x.edits || {})[id] || {}).spent || 0;
  delete (x.edits || {})[id];
  if (spent) (x.edits = x.edits || {})[id] = { spent };   // the shards were still spent
  $('#dlg').close(); save(); render();
  toast(`Back to the vault's numbers${spent ? ` — the ${spent} shards spent on it are still on record` : ''}.`);
}

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
  sh.x.prepLocked = false;        // a new day: arrange the prepared Servants freely again
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

// The Arm of the Bloodkeeper opens on a Reaction, before the triggering hit lands, and the first
// thing it does is hand over a second body's worth of hit points. The app stores a PC's max HP but
// not their current HP, so Borrowed Flesh is shown as a number to write down rather than applied to
// the sheet — a maxHp that the round tracker's × could strand at +130 is worse than no maxHp at all.
SHACKLE_SETUP['vidarr'] = sh => {
  const borrowed = 10 * sh.level;
  return { body: `<div class="prose">
    <p>The arm comes apart into ash and the plated one grows in its place. <b>It resolves before the damage that paid for it</b> — the blow lands on the arm.</p>
    <ul>
      <li><b>Borrowed Flesh:</b> maximum hit points <b>+${borrowed}</b> <i>(10 × level)</i>, gained as hit points now — <b>${sh.maxHp} → ${sh.maxHp + borrowed}</b>. It is ammunition, not armour: nothing unspent is kept when the Arm closes.</li>
      <li><b>The Shackle-Hand</b> is an extra attack on your Attack action — reach 10 ft., <b>2d10 + Cha</b> in the cursed damage type — and once a turn a hit can <b>Tear</b>.</li>
      <li><b>Penance becomes The Sentence:</b> the Arm is a fourth weapon at <b>2d12</b> that cannot be reduced or resisted and cannot be committed to, the self-damage is paid out of the Borrowed Flesh and still counts in full, and <b>Ash-Cursed creatures get no saving throw</b>.</li>
    </ul>
    <p class="hint">Write the borrowed total on your own sheet — the companion tracks your <b>base</b> max HP, so it will keep showing ${sh.maxHp}.</p></div>` };
};

// ── Víðarr — ash curses & blood ─────────────────────────────────────────
PANELS['vidarr'] = (g, sh, v) => {
  const x = sh.x; x.targets = x.targets || [];
  const pool = x.pool ?? 0, placed = x.targets.reduce((t, c) => t + c.curses, 0);
  const thr = sh.level * 5, blood = x.blood || 0;
  // Asking shackleOn, not matching the Break's name — the name has changed once already
  // (Arm of the Blood Keeper → Arm of the Bloodkeeper) and a string match fails silently,
  // which reads as "none of my + forms are running" rather than as a bug.
  const sb = shackleOn(sh, g), broke = !!sb;
  const borrowed = 10 * sh.level;
  const rows = x.targets.map((t, i) => `<div class="item">
      <span class="nm">${esc(t.name)}</span><span class="sp"></span>
      <span class="lbl">Curses</span><div class="step"><button onclick="curse(${i},'curses',-1)">–</button><span>${t.curses}</span><button onclick="curse(${i},'curses',1)">+</button></div>
      <span class="lbl">Stacks</span><div class="step"><button onclick="curse(${i},'stacks',-1)">–</button><span>${t.stacks}</span><button onclick="curse(${i},'stacks',1)">+</button></div>
      <button class="btn sm" title="At the end of its turn it gains 1 stack per curse" onclick="curseTurn(${i})">End of its turn</button>
      ${rollBtn('Detonate', t.stacks, 10)}
      <button class="x" onclick="curseDrop(${i})">×</button>
      <span class="hint" style="flex-basis:100%">vs this target: <b>+${t.curses}</b> to hit & DC · <b>+${t.curses}d8</b> ${esc(x.dmgType || '')} on hits</span>
    </div>`).join('');
  return `<h2>Curse of the Ashes ${broke ? `<span class="state st-fraying">${esc(sb.name)}</span>` : ''}</h2>
    <div class="stats">
      ${stat(`${placed}/${pool}`, 'curses placed')}
      ${stat(`${thr}`, 'dmg per spell slot')}
      ${has(sh, 'cursebounded') ? stat(broke ? '16–20' : '18–20', `crit · fumble 1–4`) : ''}
      ${has(sh, 'hateful-luck') ? stat(broke ? '1–4' : '1', 'Hateful Luck on') : ''}
      ${broke ? stat(`+${borrowed}`, `Borrowed Flesh · max HP ${sh.maxHp + borrowed}`) : ''}
    </div>
    ${broke ? `<p class="hint" style="margin-top:9px"><b>Tear</b> — once on your turn, when the Arm hits: <b>Shackle</b> <i>(grappled, speed 0, no teleport, curses can't be cleansed · Str save vs your spell save DC to break, +1 per curse on it)</i> · <b>Sunder</b> <i>(take a Multiattack attack, a recharge ability, its Reaction until end of its next turn, or a Legendary Resistance — only while the Arm holds, once per creature, and it may spend a Legendary Resistance to refuse)</i> · <b>Harvest</b> <i>(the Arm's damage hits you instead and every curse on the target detonates free)</i>.</p>` : ''}
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
    <p class="hint">${has(sh, 'hateful-luck') ? '' : '(Not loaded) '}Hateful Luck on a natural ${broke ? '<b>1–4</b> — the same band Cursebounded fumbles on, so every fumble pays' : '1'}: heal <b>${5 * v.pb}</b>, regain a spell slot, Misty Step, or +10 on your next d20${broke ? ' — <b>choose two</b>, and on a natural 1 also restore a Grimm Slot' : ''}. Temporary HP doesn't feed the blood.${broke ? ' The <b>self-provoke</b> costs no Grimm Slot while the Arm is open, and it can bleed the Borrowed Flesh.' : ''}</p>`;
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

// ── White Rabbit — the Umbra Platoon ────────────────────────────────────
// A troop type is a vault note now (`White Rabbit/Troops/<Job>.md` → g.troops), exactly as a
// Servant is: it owns its sigil, its art, the trait it lends the Commander, its actions and
// charges, and the HP/AC/Speed it wears once Hollownest makes it corporeal. So a sixth job is a
// sixth note and nothing here changes.
//
// JOBS_FALLBACK is what this panel knew before the notes existed, kept for a data.js built from an
// older vault — without it, a stale data file would show a platoon with no jobs at all.
const JOBS_FALLBACK = [
  { name: 'Infantry', sigil: 'INF', charges: { 'War Cry': 2 } },
  { name: 'Scout',    sigil: 'SCT', charges: { 'Disrupting Bolt': 1 } },
  { name: 'Medic',    sigil: 'MED', charges: { 'Fluffy Paw': 3, 'Purge Pain': 1 } },
  { name: 'Magus',    sigil: 'MAG', charges: { 'Magic Edge': 3, 'Arcane Nova': 2 } },
  { name: 'Bulwark',  sigil: 'BWK', charges: {} },
];
const troopTypes = (g = grimmById('white-rabbit')) => (g && g.troops && g.troops.length) ? g.troops : JOBS_FALLBACK;
const troopType = (job, g) => job ? troopTypes(g).find(t => t.name === job) || null : null;
const troopSigil = t => t ? (t.sigil || t.name.slice(0, 3).toUpperCase()) : '—';
const troopCharges = t => (t && t.charges) || {};
// Corporeal HP is written in the note as a formula — "50 + (5 × your level)" — because that is how
// Hollownest states it. The builder has already split it into base and per-level.
const troopMaxHp = (t, sh) => t && t.hp ? t.hp.base + t.hp.per * sh.level : 0;

// Which actions a troop can be told to take, read off its own note: the ### headings under
// "## Actions" and "## Reactions". A charge count from the Stats table attaches to the action of
// the same name, so renaming War Cry in the vault renames its pips here.
function troopSection(t, title) {
  const parts = String(t && t.text || '').split(/^## +/m);
  return parts.find(p => new RegExp('^' + title + '\\b', 'i').test(p)) || '';
}
function troopActions(t) {
  const out = [];
  for (const [title, kind] of [['Actions', 'action'], ['Reactions', 'reaction']])
    for (const m of troopSection(t, title).matchAll(/^### +(.+?)\s*$/gm))
      out.push({ name: m[1].replace(/\*/g, '').trim(), kind, max: troopCharges(t)[m[1].trim()] || 0 });
  // A charge the note lists but no heading claims still gets its pips — the Stats table is the
  // contract for what is spendable, the headings are only where the text lives.
  for (const [name, max] of Object.entries(troopCharges(t)))
    if (!out.some(a => a.name === name)) out.push({ name, kind: 'action', max });
  return out;
}
// The dice a troop rolls, by action name — the one thing still written here rather than scraped,
// because "Prof Bonus / 2 of d6s + Dex" is prose and these are the numbers it means.
const TROOP_DICE = {
  'Vorpal Slash':  (v, x) => [Math.floor(v.pb / 2), 6, +x.dex || 0],
  'Psionic Arrow': (v, x) => [Math.floor(v.pb / 2), 6, +x.dex || 0],
  'Disrupting Bolt': (v, x) => [Math.floor(v.pb / 2), 6, +x.dex || 0],
  'Magic Edge':    (v, x) => [v.pb, 12, +x.dex || 0],
  'Arcane Nova':   () => [4, 8, 0],
  'Fluffy Paw':    (v, x) => [v.pb, 6, +x.wis || 0],
};
// Every troop gets a tile — the platoon proper, the reinforcements called up by the ability, and
// any summoned past the limit by Hollownest's Reinforcement Surge. They all take jobs. A platoon
// can run to 2×PB, and as full-width rows that was the whole card; as tiles eight of them fit in
// two lines. The job goes in a popover, the charges stay on the face where they are spent.
//
// Corporeal — inside Hollownest, or when the DM rules them physical — a tile becomes a card with
// the troop type's plate on it, its HP, and what it has already spent this round. That is the only
// state the tile view cannot carry, and it is the state that decides whether a troop lives.
const troopName = (i, base, reinf) =>
  i < base ? `Troop ${i + 1}` : i < base + reinf ? `Reinf. ${i - base + 1}` : `Surge ${i - base - reinf + 1}`;
const JOB_SHORT = { Infantry: 'INF', Scout: 'SCT', Medic: 'MED', Magus: 'MAG', Bulwark: 'BWK' };

function troopPick(el, i) {
  const t = X().troops[i], mine = troopType(t.job);
  const ch = Object.entries(troopCharges(mine));
  // Charges first — mid-fight this panel is opened to spend one, not to change a job.
  const charges = ch.length ? `<div class="chgrow">${ch.map(([a, max]) => `<span class="chg">
      <i>${esc(a)}</i><span class="pips">${Array.from({ length: max }, (_, k) =>
        `<button class="pip sm ${k < (t.used[a] || 0) ? 'used' : ''}" title="${attr(a)}" onclick="event.stopPropagation();troopCharge(${i},'${a}',${k})"></button>`).join('')}</span>
    </span>`).join('')}</div>` : '';
  const rows = [null, ...troopTypes()].map(ty => {
    const c = Object.entries(troopCharges(ty)), j = ty ? ty.name : '';
    return `<button type="button" class="pickrow active${j === t.job ? ' on' : ''}"
      onclick="event.stopPropagation();abTipOff(true);troopJob(${i},'${attr(j)}')">
      <span class="sig"><b>${troopSigil(ty)}</b></span>
      <span class="pr-id"><b>${ty ? esc(ty.name) : 'No job'}</b><span class="hint">${
        ty ? esc(ty.role || '') + (c.length ? ' · ' + c.map(([a, n]) => `${a} ×${n}`).join(' · ') : '') : 'stands unassigned'}</span></span>
    </button>`;
  }).join('');
  popAt(el, `<div class="abtip-h"><b>${esc(el.dataset.tn || `Troop ${i + 1}`)}</b>${t.job ? `<span class="tag k">${esc(t.job)}</span>` : '<span class="tag">no job</span>'}</div>
    ${charges}
    <div class="abtip-b picker">${rows}</div>
    <div class="abtip-f"><span class="hint">Jobs change after a Short or Long Rest — or freely, with <b>Tactical Reassignment</b>, inside Hollownest. Charges refill on a Short Rest.</span></div>`, 'active', true);
  abTipPin = `troop:${i}`;
}
// ── A corporeal troop: what it has, and what it has spent ───────────────
// Only inside Hollownest does a troop have hit points at all — *Umbra Platoon Manifestation* is
// what makes it a physical token. Outside it, the base Grimm is explicit that White Rabbit has no
// HP and fades between commands, so the sheet refuses to invent numbers for it; x.corp is the
// DM's override for a table that rules otherwise.
const troopsCorp = (sh = sheet('white-rabbit')) => !!(rsState(sh).on || sh.x.corp);
const troopAlive = t => !t.dead;
// Last Stand: at 0 HP it stands until the end of your NEXT turn, then dies if not healed. `down`
// is the round it fell in, so it has until the end of round down + 1.
const troopDownTill = t => (t.down == null ? null : t.down + 1);
function troopHpSet(i, v) {
  const sh = sheet(), t = sh.x.troops[i], max = troopMaxHp(troopType(t.job), sh);
  t.hp = Math.max(0, Math.min(max || 1e9, Math.floor(+v || 0)));
  // Healing it above 0 in time pulls it out of Last Stand. It does NOT raise one that already ran
  // out of it: "then dies if not healed" — past that, only a rest or Re-form calls it back.
  if (t.hp > 0 && !t.dead) t.down = null;
  else if (t.hp === 0 && !t.dead && t.down == null) t.down = sh.round;
  save(); render();
}
function troopFell(i) {
  const sh = sheet(), t = sh.x.troops[i];
  t.hp = 0; t.down = sh.round;
  save(); render();
  toast(`${troopName(i, troopBase(sh), sh.x.reinf || 0)} is at 0 — Last Stand until the end of round ${t.down + 1}.`);
}
// Whole again: what a Short Rest, the Warren's activation and a Reinforcement Surge all do.
function troopReform(i) {
  const sh = sheet(), t = sh.x.troops[i];
  t.hp = troopMaxHp(troopType(t.job), sh) || null;
  t.down = null; t.dead = false; t.acted = 0; t.reacted = 0;
  save(); render();
}
// One Action each when the platoon is commanded, so the tick is per troop and the header button
// marks the whole platoon at once. Hollownest's Vorpal Ambush Strike un-marks them: "even if they
// have already acted this round".
function troopActed(i, kind) {
  const sh = sheet(), t = sh.x.troops[i], k = kind === 'reaction' ? 'reacted' : 'acted';
  const cap = kind === 'reaction' && t.job === 'Bulwark' && troopsCorp(sh) ? 2 : 1;   // Unbroken Guard
  const used = t[k] === sh.round ? (t[k + 'N'] || 1) : 0;
  if (used >= cap) { t[k] = 0; t[k + 'N'] = 0; } else { t[k] = sh.round; t[k + 'N'] = used + 1; }
  save(); render();
}
const troopUsed = (t, sh, kind) => (t[kind === 'reaction' ? 'reacted' : 'acted'] === sh.round)
  ? (t[(kind === 'reaction' ? 'reacted' : 'acted') + 'N'] || 1) : 0;
function troopsAllActed() {
  const sh = sheet();
  (sh.x.troops || []).forEach(t => { if (troopAlive(t) && t.job) { t.acted = sh.round; t.actedN = 1; } });
  save(); render(); toast('The platoon moves and acts — Bonus Action.');
}
function troopsClearActed() {
  const sh = sheet();
  (sh.x.troops || []).forEach(t => { t.acted = 0; t.actedN = 0; t.reacted = 0; t.reactedN = 0; });
  save(); render(); toast('Every troop may act again.');
}
function troopStatblock(job) {
  const t = troopType(job);
  if (!t) return toast('That troop has no statblock in the vault yet.');
  openDialog(t.name, prose(t.text, sheet('white-rabbit')));
}
function troopTraitsDialog() {
  const g = grimmById('white-rabbit');
  if (!g.troopTraits) return toast('No shared traits note in the vault — add White Rabbit/Troops/Universal Traits.md.');
  openDialog('Umbra Platoon — Universal Traits', prose(g.troopTraits, sheet('white-rabbit')));
}
// Rolling one of a troop's own actions, with that troop's name on the result.
function troopRoll(i, name) {
  const sh = sheet(), v = derived(sh), dice = TROOP_DICE[name];
  if (!dice) return;
  const [n, sides, bonus] = dice(v, sh.x);
  rollOut(`${troopName(i, troopBase(sh), sh.x.reinf || 0)} · ${name}`, n, sides, bonus);
}
const troopBase = sh => awakened(sh) ? 3 : 2;

// One card: the plate, the HP, the charges, and the round's ticks.
function troopCard(i, t, sh, v) {
  t.used = t.used || {};
  const ty = troopType(t.job), nm = troopName(i, troopBase(sh), sh.x.reinf || 0);
  const max = troopMaxHp(ty, sh), hp = t.hp == null ? max : +t.hp;
  const frac = max ? Math.max(0, Math.min(1, hp / max)) : 0;
  const till = troopDownTill(t);
  const acts = troopActions(ty);
  const reactCap = t.job === 'Bulwark' ? 2 : 1;
  const tick = (kind, cap, label) => {
    const used = troopUsed(t, sh, kind);
    return `<button class="btn sm tact ${used >= cap ? 'spent' : used ? 'part' : ''}"
      title="${attr(used >= cap ? `${label} spent this round — press to give it back` : `Mark its ${label} spent this round`)}"
      onclick="troopActed(${i},'${kind}')">${label}${cap > 1 ? ` ${used}/${cap}` : used >= cap ? ' ✓' : ''}</button>`;
  };
  return `<div class="soulcard troopcard${t.dead ? ' fallen' : till != null ? ' laststand' : ''}${i >= troopBase(sh) ? ' reinf' : ''}">
    <div class="face${ty && ty.img ? '' : ' blank'}">${ty && ty.img
      ? `<img src="${attr(ty.img)}" alt="" onclick="lightbox(this.src,'${attr(ty.name)}')" title="Click to see it whole">`
      : `<span class="noface sig">${troopSigil(ty)}</span>`}
      ${t.dead ? '<span class="badge warn">Fallen</span>'
        : till != null ? `<span class="badge warn">Last Stand · to round ${till}</span>`
        : t.job ? `<span class="badge">${esc(t.job)}</span>` : '<span class="badge">No job</span>'}
      ${ty && ty.ac ? `<span class="crtag">AC ${ty.ac}</span>` : ''}
    </div>
    <div class="meat">
      <div class="nm" title="${attr(nm + (ty ? ' · ' + ty.name : ''))}">${esc(nm)}${i >= troopBase(sh) ? ' <span class="tag">R</span>' : ''}</div>
      ${!t.job ? '<p class="hint">Give it a job to put it on the field.</p>'
        : t.dead ? '<p class="hint">It did not survive Last Stand. A Short Rest re-forms it.</p>'
        : `<div class="hpline"><span class="lbl">HP</span>
            <input class="num" type="number" value="${hp}" onchange="troopHpSet(${i},this.value)">
            <span class="lbl">/ ${max || '—'}</span></div>
          <div class="hpbar"><i style="width:${Math.round(frac * 100)}%"></i></div>
          ${ty && ty.speed ? `<div class="lbl spd">${esc(ty.speed)}</div>` : ''}
          <div class="acts">${tick('action', 1, 'Action')}${tick('reaction', reactCap, 'Reaction')}</div>`}
      ${t.job && !t.dead && acts.some(a => a.max) ? `<div class="trwrap">${acts.filter(a => a.max).map(a => {
        const left = a.max - (t.used[a.name] || 0);
        return `<div class="tr"><span class="nm" title="${attr(a.name)} — ${left} of ${a.max} left">${esc(a.name)}</span>
          <span class="pips">${Array.from({ length: a.max }, (_, k) =>
            `<i class="${k < left ? 'on' : ''}" title="${k + 1} of ${a.max}"
              onclick="troopPip(${i},'${attr(a.name)}',${k + 1})"></i>`).join('')}</span></div>`;
      }).join('')}</div>` : ''}
      ${t.job && !t.dead ? `<div class="acts">${acts.filter(a => TROOP_DICE[a.name]).map(a => {
        const [n, sides, bonus] = TROOP_DICE[a.name](v, sh.x);
        return `<button class="btn sm" onclick="troopRoll(${i},'${attr(a.name)}')">${esc(a.name)} · ${n}d${sides}${bonus ? sign(bonus) : ''}</button>`;
      }).join('')}</div>` : ''}
      <div class="acts">
        <button class="btn sm" onclick="troopPick(this,${i})" title="Change its job, or spend a charge">Job</button>
        ${t.job ? `<button class="btn sm" onclick="troopStatblock('${attr(t.job)}')">Statblock</button>` : ''}
        ${t.job && !t.dead && till == null ? `<button class="btn sm warn" title="It dropped to 0 HP" onclick="troopFell(${i})">Fell</button>` : ''}
        ${t.job && (t.dead || till != null || hp < max) ? `<button class="btn sm" title="Whole again" onclick="troopReform(${i})">Re-form</button>` : ''}
      </div>
    </div>
  </div>`;
}
PANELS['white-rabbit'] = (g, sh, v) => {
  const x = sh.x, base = awakened(sh) ? 3 : 2;
  const maxT = 2 * v.pb, reinf = x.reinf || 0, surge = x.surge || 0, total = base + reinf + surge;
  x.troops = x.troops || [];
  while (x.troops.length < total) x.troops.push({ job: '', used: {} });
  if (x.troops.length > total) x.troops.length = total;
  // A dead troop lends the Commander nothing: the traits are "for each Infantry" in the platoon,
  // and one that did not survive Last Stand is not in it any more.
  const n = j => x.troops.filter(t => t.job === j && troopAlive(t)).length;
  const dex = +x.dex || 0, wis = +x.wis || 0, half = Math.floor(v.pb / 2);
  const corp = troopsCorp(sh), rsOn = rsState(sh).on;
  const standing = x.troops.filter(t => troopAlive(t)).length;
  const fallen = total - standing;
  // Each troop is a tile in the same square vocabulary as the ability hotbar: the job's initials
  // on the face, charges as pips under them, and everything you press — picking the job, spending
  // a charge — in the popover. Pips cannot be buttons inside a button, and that is the right trade
  // anyway: the face is the glance, the panel is the interaction.
  //
  // Corporeal, that trade stops paying: HP, Last Stand and whether this one has already acted are
  // all state you need WHILE you look at the platoon, not one click away. So the tiles become
  // cards — the Servants' own card, wearing the troop type's plate.
  const troopRows = x.troops.map((t, i) => {
    const ty = troopType(t.job), nm = troopName(i, base, reinf);
    const spent = Object.entries(troopCharges(ty)).map(([a, max]) =>
      Array.from({ length: max }, (_, k) => `<i class="${k < (t.used[a] || 0) ? 'spent' : ''}"></i>`).join('')).join('');
    return `<button type="button" class="slotbtn troop ${t.job ? 'active' : 'core'}${i >= base ? ' reinf' : ''}${t.job ? '' : ' dim'}"
      data-tn="${attr(nm)}" onclick="event.stopPropagation();troopPick(this,${i})" title="${attr(nm + (t.job ? ' · ' + t.job : ' · no job'))}">
      <span class="sig"><b>${troopSigil(ty)}</b>
        ${spent ? `<span class="pips">${spent}</span>` : ''}
        ${i >= base ? '<span class="act">R</span>' : ''}</span>
      <span class="cap">${esc(nm)}</span></button>`;
  }).join('');
  const troopCards = x.troops.map((t, i) => troopCard(i, t, sh, v)).join('');
  return `<h2>Umbra Platoon <span class="r">
      ${grimmById('white-rabbit').troopTraits ? `<button class="btn sm" onclick="troopTraitsDialog()" title="What every troop has, whatever its job">Universal traits</button>` : ''}
      <button class="btn sm" onclick="troopRest()">Short rest</button></span></h2>
    <div class="stats">
      ${stat(total, `troops${reinf || surge ? ` · ${base} + ${reinf}${surge ? ` + ${surge}` : ''}` : ''}`)}
      ${fallen ? stat(fallen, 'fallen', 'var(--ember)') : ''}
      ${stat(`${40 * standing} ft`, `warding range${corp ? ' · from each corporeal troop' : ''}`)}
      ${stat(`${20 - n('Infantry')}–20`, 'crit range')}
      ${n('Scout') ? stat(`+${n('Scout')}`, 'atk & dmg, +' + 3 * n('Scout') + ' Perception') : ''}
      ${n('Medic') ? stat(`+${10 * n('Medic')}`, 'max HP') : ''}
      ${n('Magus') ? stat(`+${n('Magus')}`, 'spell atk & DC') : ''}
      ${n('Bulwark') ? stat(`+${n('Bulwark')}`, 'AC & saves') : ''}
    </div>
    <div class="row" style="margin-top:10px">${numIn('Dex mod', 'dex', 0)}${numIn('Wis mod', 'wis', 0)}
      <span class="pair"><span class="lbl">Reinforcements</span><div class="step"><button onclick="xbump('reinf',-1,0,${Math.max(0, maxT - base)})">–</button><span>${reinf}</span><button onclick="xbump('reinf',1,0,${Math.max(0, maxT - base)})">+</button></div></span>
      ${surge ? `<span class="pair"><span class="lbl">Surge</span><div class="step"><button onclick="xbump('surge',-1,0,8)">–</button><span>${surge}</span><button onclick="xbump('surge',1,0,8)">+</button></div></span>` : ''}
      <label class="lbl" title="${attr(rsOn ? 'Hollownest holds — the platoon is corporeal whatever this says' : 'The troop has HP, AC and Speed only when it is physical. Inside Hollownest that is automatic; tick this if your DM rules them physical outside it.')}">
        <input type="checkbox" ${corp ? 'checked' : ''} ${rsOn ? 'disabled' : ''} onchange="xset('corp',this.checked)"> Corporeal${rsOn ? ' · Hollownest' : ''}</label></div>
    ${corp ? `<div class="row" style="margin-top:9px">
        <button class="btn pri" onclick="troopsAllActed()" title="The Umbra Platoon Bonus Action: every troop moves and takes one Action">Platoon acts · Bonus Action</button>
        <button class="btn" onclick="troopsClearActed()" title="Vorpal Ambush Strike lets them act again, even if they already have">Let them act again</button>
        <span class="hint" style="flex:1;min-width:200px">Round <b>${sh.round}</b>. Ticks clear themselves on <b>Next round</b>, and a troop at 0 HP dies at the end of the round after it fell unless it is healed.</span>
      </div>
      <div class="souls">${troopCards}</div>`
    : `<div class="troops">${troopRows}</div>`}
    ${awakened(sh) ? `${corp ? '' : `<div class="row" style="margin-top:9px">
      ${n('Infantry') ? rollBtn('Vorpal Slash', half, 6, dex) : ''}
      ${n('Scout') ? rollBtn('Psionic Arrow', half, 6, dex) : ''}
      ${n('Magus') ? rollBtn('Magic Edge', v.pb, 12, dex) : ''}
      ${n('Magus') ? rollBtn('Arcane Nova', 4, 8) : ''}
      ${n('Medic') ? rollBtn('Fluffy Paw', v.pb, 6, wis) : ''}
    </div>`}
    <p class="hint">Troop attacks hit at <b>${sign(dex + v.pb)}</b>. Bonus Action: every troop moves and takes one action. Jobs change after a Short or Long Rest${corp ? ', or freely with <b>Tactical Reassignment</b> while the Warren holds' : ''}; charges refill on a Short Rest, which also re-forms a fallen troop. Reinforcements take jobs like any other troop, up to <b>${maxT}</b> in the platoon${surge ? ', and a Surge troop stands over that limit until the end of your next turn' : ''}.</p>`
    : '<p class="hint">Troop jobs open with <b>Troop Regiment</b> at Awakened.</p>'}
    <div id="pOut"></div>`;
};
// Reassigning a job re-forms the body: "It transforms at once and takes the new job's statistics
// and abilities" — so its HP is the new job's, not what was left of the old one's.
function troopJob(i, j) {
  const sh = sheet(), t = sh.x.troops[i];
  t.job = j; t.used = {};
  t.hp = troopMaxHp(troopType(j), sh) || null; t.down = null; t.dead = false;
  save(); render();
}
function troopCharge(i, a, k) { const t = X().troops[i]; t.used[a] = k < (t.used[a] || 0) ? k : k + 1; save(); render(); }
// The card's pips count what is LEFT, like a Servant's: clicking the last full one spends it.
function troopPip(i, name, n) {
  const sh = sheet(), t = sh.x.troops[i], max = troopCharges(troopType(t.job))[name] || 0;
  const left = max - (t.used[name] || 0);
  t.used[name] = max - (left === n ? n - 1 : n);
  save(); render();
}
// A Short Rest re-forms the platoon: charges back, bodies whole, the fallen standing again. They
// are shadow and memory, not flesh — nothing about them has to heal, only be called back.
function troopRest() {
  const sh = sheet();
  (sh.x.troops || []).forEach(t => {
    t.used = {}; t.down = null; t.dead = false; t.acted = 0; t.reacted = 0;
    t.hp = troopMaxHp(troopType(t.job), sh) || null;
  });
  sh.x.reinf = 0; sh.x.surge = 0;
  save(); render(); toast('The platoon re-forms — charges restored.');
}
USE_HOOK['reinforcements'] = sh => { sh.x.reinf = (sh.x.reinf || 0) + 1; };
LONG_REST['white-rabbit'] = sh => {
  (sh.x.troops || []).forEach(t => {
    t.used = {}; t.down = null; t.dead = false; t.acted = 0; t.reacted = 0;
    t.hp = troopMaxHp(troopType(t.job), sh) || null;
  });
  sh.x.reinf = 0; sh.x.surge = 0;
};
// Each round the ticks clear and Last Stand runs out: a troop that fell in round r can act until
// the end of round r + 1, and dies when round r + 2 begins if nobody healed it.
ROUND_HOOK['white-rabbit'] = sh => {
  const died = [];
  (sh.x.troops || []).forEach((t, i) => {
    t.acted = 0; t.actedN = 0; t.reacted = 0; t.reactedN = 0;
    if (t.down != null && sh.round > t.down + 1) {
      t.down = null; t.dead = true; t.hp = 0;
      died.push(troopName(i, troopBase(sh), sh.x.reinf || 0));
    }
  });
  if (died.length) toast(`${died.join(', ')} ${died.length > 1 ? 'do' : 'does'} not rise — Last Stand has run out.`);
};
// The Warren wakes: "every Vorpal Bunny under your command becomes corporeal at full strength".
SHIFT_START['white-rabbit'] = sh => {
  (sh.x.troops || []).forEach(t => {
    t.hp = troopMaxHp(troopType(t.job), sh) || null;
    t.down = null; t.dead = false; t.acted = 0; t.reacted = 0;
  });
};
// …and when it contracts they are shadow again, with no hit points to keep.
SHIFT_END['white-rabbit'] = sh => {
  (sh.x.troops || []).forEach(t => { t.hp = null; t.down = null; t.dead = false; t.acted = 0; t.reacted = 0; });
  sh.x.corp = false;
};

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
  // A socket per stance the Rank allows, in the same vocabulary as the ability hotbar: the stance
  // text is in the hover panel rather than an accordion under the bar. Four dropdowns plus four
  // expandable rows was most of this card's height, and 28 stances were never going to be chips.
  const tiles = Array.from({ length: v.pb }, (_, i) => {
    const n = x.stances[i];
    if (!n) return `<button type="button" class="slotbtn empty passive" title="Choose a stance"
      onclick="event.stopPropagation();stancePick(this,${i})"><span class="sig"><b>+</b></span><span class="cap">Empty</span></button>`;
    return `<button type="button" class="slotbtn passive" data-st="${i}"
      onmouseenter="stanceTip(this,${i})" onmouseleave="abTipOff()"
      onfocus="stanceTip(this,${i})" onblur="abTipOff()"
      onclick="event.stopPropagation();stanceTip(this,${i},true)">
      <span class="sig"><b>${esc(sigil(n))}</b></span><span class="cap">${esc(n)}</span></button>`;
  }).join('');
  return `<h2>Arts of War <span class="r"><span class="hint">${x.stances.length}/${v.pb} stances</span></span></h2>
    <div class="hotbar"><div class="hbgroup" style="--kc:var(--k-passive)"><div class="hbrow">${tiles}</div></div></div>
    <p class="hint">Hover a stance to read it · click a socket to choose. Chosen after a Long Rest; swap one when you roll initiative, as a Bonus Action, or when you drop a creature to 0.</p>
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

// A stance reads and is chosen exactly as an ability does — same popover, same picker rows — so
// there is one thing to learn on this sheet rather than two that look alike and behave differently.
function stanceTip(el, i, pin) {
  if (abTipPin && !pin) return;
  if (pin && abTipPin === `st:${i}`) return abTipOff(true);
  const g = grimmById('rage-of-the-tiger'), n = X().stances[i];
  const s = g.stances.find(t => t.name === n);
  if (!s) return;
  popAt(el, `<div class="abtip-h"><b>${esc(n)}</b><span class="tag k">Stance</span></div>
    <div class="abtip-b">${prose(s.text)}</div>
    <div class="abtip-f">
      <button class="btn sm" onclick="event.stopPropagation();stancePick(document.querySelector('[data-st=&quot;${i}&quot;]'),${i})">Swap</button>
      <button class="btn sm warn" onclick="event.stopPropagation();setStance(${i},'')">Clear</button></div>`,
    'passive', pin);
  if (pin) abTipPin = `st:${i}`;
}
function stancePick(el, i) {
  const g = grimmById('rage-of-the-tiger'), x = X();
  const rows = g.stances.map(s => {
    const taken = x.stances.includes(s.name) && s.name !== x.stances[i];
    return `<button type="button" class="pickrow passive${taken ? ' taken' : ''}${s.name === x.stances[i] ? ' on' : ''}"
      ${taken ? 'disabled' : `onclick="event.stopPropagation();setStance(${i},'${attr(s.name)}')"`}>
      <span class="sig"><b>${esc(sigil(s.name))}</b></span>
      <span class="pr-id"><b>${esc(s.name)}</b><span class="hint">${taken ? 'already taken' : 'stance'}</span></span></button>`;
  }).join('');
  popAt(el, `<div class="abtip-h"><b>Stance ${i + 1}</b><span class="tag">${g.stances.length} in the art</span></div>
    <div class="abtip-b picker">${rows}</div>`, 'passive', true);
  abTipPin = `stpick:${i}`;
}

function setStance(i, name) {
  const s = X().stances;
  // Positional, like the ability loadout: clearing stance 2 must leave stance 3 where it is rather
  // than sliding it left under the player's hand. Blanks are trimmed off the end only.
  while (s.length <= i) s.push('');
  s[i] = name || '';
  while (s.length && !s[s.length - 1]) s.pop();
  abTipOff(true);
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
