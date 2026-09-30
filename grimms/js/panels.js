// Grimm-specific trackers. Each PANELS[id] returns the inside of one card; state
// lives in sheet().x. LONG_REST[id] tidies up after a rest, USE_HOOK[abilityId]
// reacts when an ability is used from the sheet.

const PANELS = {}, LONG_REST = {}, USE_HOOK = {};

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

// ── Gate of Caelum — servants & soul shards ─────────────────────────────
PANELS['gate-of-caelum'] = (g, sh, v) => {
  const x = sh.x; x.servants = x.servants || [];
  const slots = awakened(sh) ? 6 : 3, limit = Math.ceil(v.pb / 2);
  const out = x.servants.filter(s => s.out && !s.elite).length;
  const elite = x.servants.find(s => s.out && s.elite);
  const bonusHp = 10 * v.pb * (+x.missing || 0);
  const rows = x.servants.map((s, i) => `<div class="item ${s.out ? 'on' : ''}">
      <span class="nm">${esc(s.name)}</span><span class="tag">CR ${esc(s.cr)}</span>
      ${s.elite ? '<span class="tag k" style="--kc:var(--k-super)">Elite</span>' : ''}
      <span class="sp"></span>
      <span class="lbl">HP</span><input class="num" type="number" value="${s.hp ?? ''}" onchange="servantSet(${i},'hp',this.value)">
      <span class="lbl">/ ${s.max ? (+s.max + bonusHp) * (s.elite ? 2 : elite && s.out ? .5 : 1) : '—'}</span>
      <button class="btn sm ${s.out ? 'on' : ''}" onclick="servantToggle(${i})">${s.out ? 'Summoned' : 'In Limbo'}</button>
      <button class="x" title="Release this soul" onclick="servantDrop(${i})">×</button>
      <input class="txt" style="flex-basis:100%" placeholder="Attuned items (max ${s.elite ? 3 : 2})" value="${attr(s.items || '')}" onchange="servantSet(${i},'items',this.value)">
    </div>`).join('');
  return `<h2>Commander of Souls <span class="r">${g.servants.map((s, i) => `<button class="btn sm" onclick="viewServant(${i})">${esc(s.name)} statblock</button>`).join('')}</span></h2>
    <div class="stats">
      ${stat(`${x.servants.length}/${slots}`, 'servant slots')}
      ${stat(`${out}/${limit}`, 'summoned at once')}
      ${stat(sh.level + v.pb, 'Max Servant CR (+3 w/ slots)')}
      ${stat(x.shards || 0, 'soul shards', 'var(--brass)')}
    </div>
    <div class="row" style="margin-top:10px">
      <span class="lbl">Soul shards</span><div class="step"><button onclick="xbump('shards',-1)">–</button><span>${x.shards || 0}</span><button onclick="xbump('shards',1)">+</button></div>
      ${numIn('Missing party members', 'missing', 0)}
      <label class="lbl"><input type="checkbox" ${x.fakeDeathUsed ? 'checked' : ''} onchange="xset('fakeDeathUsed',this.checked)"> Fake Death used</label>
    </div>
    ${bonusHp ? `<p class="hint">Each servant's max HP is raised by <b>${bonusHp}</b> for the missing party (10 × PB each).</p>` : ''}
    <h3>Servants</h3>
    <div class="items">${rows || '<p class="hint">No souls answer yet. Speak the word <b>Arise</b> over a creature dead less than 24 hours — Persuasion vs <b>CR + 10</b>.</p>'}</div>
    <div class="row" style="margin-top:9px"><input class="txt" id="svName" placeholder="Servant name" style="flex:1"><input class="num" id="svCr" placeholder="CR"><input class="num" id="svMax" placeholder="Max HP" style="width:70px">
      <label class="lbl"><input type="checkbox" id="svElite"> Elite</label><button class="btn" onclick="servantAdd(${slots})">Recruit</button></div>
    <p class="hint">Summoning a servant costs 1 slot (Action), an Elite Servant 2 — it doesn't count toward the limit but halves the others' HP. Harvest reaps up to <b>${v.pb}</b> fallen souls for shards (Int check).</p>`;
};
function servantAdd(slots) {
  const x = X(); x.servants = x.servants || [];
  const name = $('#svName').value.trim(); if (!name) return;
  if (x.servants.length >= slots) return toast('No servant slot free — release a soul first.');
  x.servants.push({ name, cr: $('#svCr').value || '?', max: +$('#svMax').value || 0, hp: +$('#svMax').value || 0, elite: $('#svElite').checked, out: false, items: '' });
  save(); render();
}
function servantSet(i, k, v) { X().servants[i][k] = k === 'hp' ? +v : v; save(); }
function servantToggle(i) { const s = X().servants[i]; s.out = !s.out; save(); render(); }
function servantDrop(i) { if (confirm('Release this soul? Its slot frees and its attuned items are lost.')) { X().servants.splice(i, 1); save(); render(); } }
function viewServant(i) { const s = grimmById(S.current).servants[i]; openDialog(s.name, prose(s.text, sheet())); }
LONG_REST['gate-of-caelum'] = sh => { sh.x.fakeDeathUsed = false; };

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
PANELS['white-rabbit'] = (g, sh, v) => {
  const x = sh.x, base = awakened(sh) ? 3 : 2;
  x.troops = x.troops || [];
  while (x.troops.length < base) x.troops.push({ job: '', used: {} });
  const reinf = x.reinf || 0, total = base + reinf, maxT = 2 * v.pb;
  const n = j => x.troops.slice(0, base).filter(t => t.job === j).length;
  const dex = +x.dex || 0, wis = +x.wis || 0, half = Math.floor(v.pb / 2);
  const troopRows = x.troops.slice(0, base).map((t, i) => {
    const ch = JOBS[t.job] ? JOBS[t.job].charges : {};
    return `<div class="item"><span class="nm">Troop ${i + 1}</span>
      ${awakened(sh) ? `<select class="pick" onchange="troopJob(${i},this.value)"><option value="">— no job —</option>${Object.keys(JOBS).map(j => `<option ${t.job === j ? 'selected' : ''}>${j}</option>`).join('')}</select>` : ''}
      <span class="sp"></span>
      ${Object.entries(ch).map(([a, max]) => `<span class="lbl">${a}</span><span class="pips">${Array.from({ length: max }, (_, k) => `<button class="pip sm ${k < (t.used[a] || 0) ? 'used' : ''}" onclick="troopCharge(${i},'${a}',${k})"></button>`).join('')}</span>`).join('')}
    </div>`;
  }).join('');
  return `<h2>Umbra Platoon <span class="r"><button class="btn sm" onclick="troopRest()">Short rest</button></span></h2>
    <div class="stats">
      ${stat(total, `troops${reinf ? ` (${reinf} reinf.)` : ''}`)}
      ${stat(`${40 * total} ft`, 'warding range')}
      ${stat(`${20 - n('Infantry')}–20`, 'crit range')}
      ${n('Scout') ? stat(`+${n('Scout')}`, 'atk & dmg, +' + 3 * n('Scout') + ' Perception') : ''}
      ${n('Medic') ? stat(`+${10 * n('Medic')}`, 'max HP') : ''}
      ${n('Magus') ? stat(`+${n('Magus')}`, 'spell atk & DC') : ''}
      ${n('Bulwark') ? stat(`+${n('Bulwark')}`, 'AC & saves') : ''}
    </div>
    <div class="row" style="margin-top:10px">${numIn('Dex mod', 'dex', 0)}${numIn('Wis mod', 'wis', 0)}
      <span class="lbl">Reinforcements</span><div class="step"><button onclick="xbump('reinf',-1,0,${Math.max(0, maxT - base)})">–</button><span>${reinf}</span><button onclick="xbump('reinf',1,0,${Math.max(0, maxT - base)})">+</button></div></div>
    <div class="items" style="margin-top:10px">${troopRows}</div>
    ${awakened(sh) ? `<div class="row" style="margin-top:9px">
      ${n('Infantry') ? rollBtn('Vorpal Slash', half, 6, dex) : ''}
      ${n('Scout') ? rollBtn('Psionic Arrow', half, 6, dex) : ''}
      ${n('Magus') ? rollBtn('Magic Edge', v.pb, 12, dex) : ''}
      ${n('Magus') ? rollBtn('Arcane Nova', 4, 8) : ''}
      ${n('Medic') ? rollBtn('Fluffy Paw', v.pb, 6, wis) : ''}
    </div>
    <p class="hint">Troop attacks hit at <b>${sign(dex + v.pb)}</b>. Bonus Action: every troop moves and takes one action. Jobs change after a Short or Long Rest; charges refill on a Short Rest.</p>`
    : '<p class="hint">Troop jobs open with <b>Troop Regiment</b> at Awakened.</p>'}
    <div id="pOut"></div>`;
};
function troopJob(i, j) { const t = X().troops[i]; t.job = j; t.used = {}; save(); render(); }
function troopCharge(i, a, k) { const t = X().troops[i]; t.used[a] = k < (t.used[a] || 0) ? k : k + 1; save(); render(); }
function troopRest() { (X().troops || []).forEach(t => t.used = {}); X().reinf = 0; save(); render(); toast('Troop charges restored.'); }
USE_HOOK['reinforcements'] = sh => { sh.x.reinf = (sh.x.reinf || 0) + 1; };
LONG_REST['white-rabbit'] = sh => { (sh.x.troops || []).forEach(t => t.used = {}); sh.x.reinf = 0; };

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
  const x = sh.x, n = +x.sacrificed || 0, lost = +x.lost || 0;
  const withLove = Math.floor(sh.maxHp * (1 + 0.5 * n));
  const max = x.hysteria ? Math.floor(withLove / 2) : withLove;
  return `<h2>Thanatos <span class="r"><button class="btn sm ${x.hysteria ? 'on' : ''}" onclick="xset('hysteria',${!x.hysteria})">Hysteria ${x.hysteria ? 'on' : 'off'}</button></span></h2>
    <div class="stats">
      ${stat(max, 'max HP now')}
      ${x.hysteria ? stat(`${Math.max(1, Math.floor(lost / 50))}d6`, 'bonus necrotic/cold') + stat('+2', 'AC') + stat('+10 ft', 'speed') : ''}
      ${stat(`${15 * v.pb} ft`, 'Circle radius')}
    </div>
    <div class="row" style="margin-top:10px"><span class="lbl">Base max HP</span><input class="num" type="number" style="width:64px" value="${sh.maxHp}" onchange="setNum('maxHp',this.value)">
      ${x.hysteria ? numIn('HP lost', 'lost', 0, 64) : ''}</div>
    <h3>Lovely Death</h3>
    <div class="row"><span class="lbl">Death saves sacrificed</span><div class="chips">${[0, 1, 2, 3].map(k => `<button class="chip ${n === k ? 'on' : ''}" onclick="xset('sacrificed',${k})">${k} · +${k * 50}%</button>`).join('')}</div></div>
    <p class="hint">Chosen after a Long Rest${awakened(sh) ? '' : ' (Awakened)'}; while sacrificed you roll Death Saves with advantage.</p>
    <div class="row">${rollBtn('Scent of Death', v.pb, 8)}${rollBtn('Circle of the Damned', v.pb, 12)}${rollBtn("Death's Door", v.pb, 8)}</div>
    <div id="pOut"></div>
    <p class="hint">Hysteria halves your max HP for 1 minute and keeps running even if you fall unconscious. Reaper Assault: <b>${2 + v.pb}</b> attacks with doubled reach and base damage.</p>`;
};
USE_HOOK['hysteria-of-demised'] = sh => { sh.x.hysteria = true; sh.x.lost = 0; };
LONG_REST['thanatos'] = sh => { sh.x.hysteria = false; };

// ── Rage of the Tiger — stances & stripes ───────────────────────────────
PANELS['rage-of-the-tiger'] = (g, sh, v) => {
  const x = sh.x; x.stances = (x.stances || []).filter(n => g.stances.some(s => s.name === n));
  const full = x.stances.length >= v.pb, str = +x.str || 0, half = Math.floor(v.pb / 2);
  return `<h2>Arts of War <span class="r"><span class="hint">${x.stances.length}/${v.pb} stances</span></span></h2>
    <div class="chips">${g.stances.map(s => `<button class="chip ${x.stances.includes(s.name) ? 'on' : ''}" ${!x.stances.includes(s.name) && full ? 'disabled' : ''} onclick="stance('${attr(s.name)}')">${esc(s.name)}</button>`).join('')}</div>
    <div style="margin-top:10px">${x.stances.map(n => { const s = g.stances.find(t => t.name === n); return `<div class="ab passive open"><div class="ab-h"><span class="nm">${esc(n)}</span></div><div class="ab-b">${prose(s.text)}</div></div>`; }).join('')}</div>
    <p class="hint">Chosen after a Long Rest. Swap one when you roll initiative, as a Bonus Action, or when you drop a creature to 0.</p>
    <h3>Fury of Conquest · ${v.pb} stripes</h3>
    <div class="stats">${stat(5 * v.pb, 'HP burned')}${stat(`+${5 * v.pb} ft`, 'speed')}${stat(`+${v.pb}`, 'Str score')}${stat(`+${half}d8`, 'necrotic on hit')}${stat(`${20 - half}–20`, 'crit range')}</div>
    <div class="row" style="margin-top:10px">${numIn('Str mod', 'str', 0)}<span class="lbl">Max HP</span><input class="num" type="number" style="width:64px" value="${sh.maxHp}" onchange="setNum('maxHp',this.value)">
      <span class="lbl">Wounds</span><div class="step"><button onclick="xbump('wounds',-1)">–</button><span>${x.wounds || 0}</span><button onclick="xbump('wounds',1)">+</button></div></div>
    <div class="stats" style="margin-top:9px">${stat(Math.floor(sh.maxHp * .3), 'Tall I Stand heal')}${stat(10 + str + v.pb, 'Kneel DC (Con)')}${stat(`${15 * v.pb} ft`, 'Warmonger move')}</div>
    <div class="row">${rollBtn('Kneel for the King', sh.level, 10)}</div><div id="pOut"></div>`;
};
function stance(n) { const s = X().stances; const i = s.indexOf(n); i >= 0 ? s.splice(i, 1) : s.push(n); save(); render(); }
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
