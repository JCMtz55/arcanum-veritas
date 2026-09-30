// The Sheet: slots, exhaustion, chains, loadout, abilities, effects, harmony, revive.

function renderSheet() {
  const g = grimmById(S.current), sh = sheet(), v = derived(sh);
  fitLoadout(g, sh);
  const awake = stageIdx(sh.stage) >= 3;
  const form = (awake ? g.forms.awakened : g.forms.invoked) || '';
  const img = (awake ? g.images.awakened : g.images.invoked) || g.images.invoked;

  $('#view').innerHTML = `
  <div class="hero">
    <div class="portrait" style="background-image:url('${attr(img)}')"></div>
    <div>
      <h1>${esc(g.name)}</h1>
      <div class="sub">Grimm of <b>${esc(g.user)}</b> · ${esc(form)} · ${STAGE_NAME[sh.stage]}${sh.familiar ? ' · <b>Familiar form</b>' : ''}</div>
    </div>
  </div>
  <div class="grid">
    ${slotsCard(g, sh, v)}
    ${chainsCard(g, sh, v)}
    ${loadoutCard(g, sh, v)}
    ${PANELS[g.id] ? `<section class="card span7">${PANELS[g.id](g, sh, v)}</section>` : ''}
    ${effectsCard(g, sh, v)}
    ${harmonyCard(g, sh, v)}
    ${reviveCard(g, sh, v)}
  </div>
  <p class="foot">Saved in this browser only · <button class="btn sm" onclick="exportSheet()">Export backup</button> <button class="btn sm" onclick="importSheet()">Import</button> <button class="btn sm warn" onclick="resetSheet()">Reset this sheet</button></p>`;
}

// ── Grimm Slots & exhaustion ────────────────────────────────────────────
function slotsCard(g, sh, v) {
  let pips = '';
  for (let i = 0; i < v.base; i++) pips += `<button class="pip ${i < sh.used ? 'used' : ''}" title="${i < sh.used ? 'Spent — click to restore' : 'Click to spend'}" onclick="pipClick(${i},false)"></button>`;
  for (let i = 0; i < sh.temp; i++) pips += `<button class="pip temp ${i < sh.tempUsed ? 'used' : ''}" title="Temporary slot bought with Exhaustion" onclick="pipClick(${i},true)"></button>`;
  return `<section class="card span5">
    <h2>Grimm Slots <span class="r"><button class="btn sm" onclick="longRest()" title="Only if you dreamt — a disrupted rest restores nothing">Long rest</button></span></h2>
    <div class="row"><div class="pips">${pips || '<span class="hint">A Dormant Grimm has no slots.</span>'}</div></div>
    <div class="row">
      <div class="stats">
        <div class="stat"><b>${v.left}</b><i>left</i></div>
        <div class="stat"><b>${v.base}</b><i>${STAGE_NAME[sh.stage]}${v.soul ? ' +1 Soulbound' : ''}</i></div>
        ${sh.temp ? `<div class="stat"><b style="color:var(--ember)">${sh.temp - sh.tempUsed}</b><i>temporary</i></div>` : ''}
      </div>
    </div>
    <div class="row">
      <button class="btn" onclick="forceSlot()" title="Out of slots? Offer a piece of yourself">Force the Grimm · +1 Exhaustion</button>
      <button class="btn" onclick="restoreSlot()" title="A Grimm Token can restore 1 Grimm Slot">Restore 1</button>
      <button class="btn ${sh.familiar ? 'on' : ''}" onclick="toggle('familiar')" title="In Familiar form, abilities that need a Grimm Slot can't be used">Familiar form</button>
    </div>
    <div class="row">
      <span class="lbl">Exhaustion</span><div class="step"><button onclick="bump('exhaustion',-1)">–</button><span>${sh.exhaustion}</span><button onclick="bump('exhaustion',1)">+</button></div>
      <span class="lbl">Dream exh.</span><div class="step"><button onclick="bump('dreamExhaustion',-1)">–</button><span>${sh.dreamExhaustion}</span><button onclick="bump('dreamExhaustion',1)">+</button></div>
    </div>
    <p class="hint">Exhaustion from forcing the Grimm or an Exhausting Exchange <b>can't be removed by magic</b> like <i>Greater Restoration</i> — only by resting in a Safe Haven or divine intervention. Slots come back only after a Long Rest in which you <b>dream</b>.</p>
  </section>`;
}
function pipClick(i, temp) {
  const sh = sheet();
  if (temp) sh.tempUsed = i < sh.tempUsed ? i : i + 1;
  else sh.used = i < sh.used ? i : i + 1;
  save(); render();
}
function spend(n) {
  const sh = sheet(), v = derived(sh);
  if (n > v.left) { toast(`Needs ${n} Grimm Slot${n > 1 ? 's' : ''} — you have ${v.left}. Force the Grimm for more.`); return false; }
  for (let k = 0; k < n; k++) {
    if (sh.used < v.base) sh.used++; else sh.tempUsed++;
  }
  return true;
}
function forceSlot() {
  const sh = sheet(); sh.exhaustion++; sh.temp++;
  save(); render(); toast('+1 Exhaustion → 1 temporary Grimm Slot. Use it now.');
}
function restoreSlot() {
  const sh = sheet();
  if (sh.tempUsed > 0 && sh.used === 0) sh.tempUsed--; else if (sh.used > 0) sh.used--; else return toast('Your slots are already full.');
  save(); render();
}
function longRest() {
  const sh = sheet();
  sh.used = 0; sh.temp = 0; sh.tempUsed = 0; sh.effects = []; sh.round = 1; sh.inCombat = false;
  if (LONG_REST[S.current]) LONG_REST[S.current](sh);
  save(); render(); toast('Long rest — Grimm Slots restored. Recompose your abilities if you wish.');
}
function bump(k, n) { const sh = sheet(); sh[k] = Math.max(0, (+sh[k] || 0) + n); save(); render(); }
function toggle(k) { const sh = sheet(); sh[k] = !sh[k]; save(); render(); }
function setNum(k, val) { const sh = sheet(); sh[k] = +val || 0; save(); render(); }
function setStr(k, val) { const sh = sheet(); sh[k] = val; save(); }

// ── Chains ──────────────────────────────────────────────────────────────
const CHAIN_FX = {
  3: 'The pact is whole. The Grimm behaves per its stage.',
  2: 'The Grimm\'s voice grows more independent — it speaks unprompted, hesitates a half-beat, watches you when it thinks itself unobserved.',
  1: 'The Grimm may act on its own once per session (DM). Its abilities run hot. Every Dream Saving Throw to hold the last chain is +2 to +5 DC.',
  0: 'The user dies and the Grimm Unchains.',
};
function chainsCard(g, sh, v) {
  const st = v.chainState.toLowerCase();
  let icons = '';
  for (let i = 0; i < 3; i++) icons += `<button class="chain ${i >= sh.chains ? 'broken' : ''}" onclick="chainClick(${i})" title="${i < sh.chains ? 'Record a break' : 'Broken — chains never restore'}">⛓</button>`;
  const pre = stageIdx(sh.stage) < 3;
  const log = sh.chainLog.map((e, i) => `<div class="item"><span class="tag">${esc(e.type)}</span><span class="nm">${esc(e.note || '—')}</span><span class="hint">${e.session ? 'Session ' + esc(e.session) : ''}</span>${i === sh.chainLog.length - 1 ? `<span class="sp"></span><button class="x" title="Undo — only to fix a mis-click" onclick="undoBreak()">↺</button>` : ''}</div>`).join('');
  return `<section class="card span7">
    <h2>The Three Chains <span class="r"><span class="state st-${st}">${v.chainState}</span></span></h2>
    <div class="row"><div class="chains">${icons}</div><p class="hint" style="margin:0;flex:1;min-width:200px">${CHAIN_FX[sh.chains]}</p></div>
    ${sh.chainLog.length ? `<h3>Breaks</h3><div class="items">${log}</div>` : ''}
    <div class="row" style="margin-top:10px">
      <input class="txt" style="flex:1" placeholder="Aggrieved ability" value="${attr(sh.aggrieved)}" onchange="setStr('aggrieved',this.value)">
      <input class="txt" style="flex:1" placeholder="Bleed (from a ⟨Scar⟩)" value="${attr(sh.bleed)}" onchange="setStr('bleed',this.value)">
    </div>
    <h3>Dream Saving Throw — holding a chain</h3>
    <div class="row">
      <select class="pick" id="dsSev">
        <option value="12">Minor contradiction · 12</option><option value="16">Serious act · 16</option>
        <option value="20">Direct betrayal / defining reinvention · 20</option><option value="24">Profound rupture · 24</option>
      </select>
      <span class="lbl">Held before (same theme)</span><input class="num" id="dsHeld" type="number" min="0" value="0">
      ${sh.chains === 1 ? `<span class="lbl">Fraying +</span><input class="num" id="dsFray" type="number" min="2" max="5" value="2">` : ''}
      <label class="lbl"><input type="checkbox" id="dsProf"> add PB</label>
      <button class="btn pri" onclick="rollDreamSave()">Roll${pre ? ' (adv.)' : ''}</button>
    </div>
    <div id="dsOut"></div>
    <p class="hint">Players never break their own chains — the DM calls these saves. ${pre ? 'Before Awakened the bond is slack: <b>advantage</b>.' : 'From Awakened on, every contradiction lands like a blade.'} Each chain that survives the same theme of offense raises the next DC by +2.</p>
  </section>`;
}
function chainClick(i) {
  const sh = sheet();
  if (i >= sh.chains) return toast('A bond, once broken, is broken forever.');
  openDialog('Record a broken chain', `
    <p class="hint">Only record what the DM has ruled. What matters is <b>who</b> broke it and <b>why</b>.</p>
    <div class="row"><select class="pick" id="brType">
      <option>Grievance</option><option>⟨Molt⟩</option><option>⟨Scar⟩</option></select>
      <input class="txt" id="brSess" placeholder="Session" style="width:90px"></div>
    <div class="row"><input class="txt" id="brNote" placeholder="What happened / what it changed" style="flex:1"></div>
    <div class="prose">
      <p><b>Grievance</b> — the Grimm let go. One ability becomes Aggrieved; trust, not power, is lost.</p>
      <p><b>⟨Molt⟩</b> — you outgrew the Wish. One ability transforms into a new one of equal weight.</p>
      <p><b>⟨Scar⟩</b> — something cut it. An unstable new power surfaces, and the cut end bleeds.</p>
    </div>
    <div class="row"><span class="sp"></span><button class="btn warn" onclick="confirmBreak()">Break the chain</button></div>`);
}
function confirmBreak() {
  const sh = sheet();
  sh.chainLog.push({ type: $('#brType').value, note: $('#brNote').value, session: $('#brSess').value });
  sh.chains = Math.max(0, sh.chains - 1);
  $('#dlg').close(); save(); render();
  if (sh.chains === 0) toast('The third chain is broken. The Grimm is Unchained.');
}
function undoBreak() {
  if (!confirm('Undo the last recorded break? Use this only to fix a mistake — in the story, chains never restore.')) return;
  const sh = sheet(); sh.chainLog.pop(); sh.chains = Math.min(3, sh.chains + 1); save(); render();
}
function rollDreamSave() {
  const sh = sheet(), v = derived(sh);
  const dc = +$('#dsSev').value + 2 * (+$('#dsHeld').value || 0) + (sh.chains === 1 ? (+($('#dsFray') || {}).value || 2) : 0);
  const adv = stageIdx(sh.stage) < 3;
  const a = d(20), b = d(20), nat = adv ? Math.max(a, b) : a;
  const mod = sh.dreamMod + ($('#dsProf').checked ? v.pb : 0), tot = nat + mod;
  $('#dsOut').innerHTML = `<div class="roll">d20 ${adv ? `[${a}, ${b}] → ` : ''}${nat} ${sign(mod)} = <b>${tot}</b> vs DC ${dc} — ${tot >= dc ? '<b class="ok">the chain holds</b>' : '<b class="bad">the chain strains…</b> tell your DM'}</div>`;
}

// ── Loadout & abilities ─────────────────────────────────────────────────
function loadoutCard(g, sh, v) {
  const n = v.abilitySlots;
  const col = k => {
    if (!n[k]) return `<div class="slotcol"><span class="lbl">${KIND_NAME[k]}</span><p class="hint">No ${KIND_NAME[k].toLowerCase()} slots at ${STAGE_NAME[sh.stage]}.</p></div>`;
    const pool = g.abilities.filter(a => slotKind(a) === k);
    const lines = sh.loadout[k].map((id, i) => `<div class="slotline"><select class="pick" onchange="setLoad('${k}',${i},this.value)">
      <option value="">— empty —</option>
      ${pool.map(a => `<option value="${a.id}" ${a.id === id ? 'selected' : ''} ${!unlocked(a, sh.stage) || (sh.loadout[k].includes(a.id) && a.id !== id) ? 'disabled' : ''}>${esc(a.name)}${a.stage === 'additional' ? ' ✦' : ''}</option>`).join('')}
    </select></div>`).join('');
    return `<div class="slotcol"><span class="lbl" style="color:var(--k-${k})">${KIND_NAME[k]} · ${n[k]}</span>${lines}</div>`;
  };
  const loaded = new Set([...sh.loadout.passive, ...sh.loadout.active, ...sh.loadout.super]);
  const show = g.abilities.filter(a => a.kind === 'core' || loaded.has(a.id) || (a.kind === 'shackle' && unlocked(a, sh.stage)));
  return `<section class="card span12">
    <h2>Abilities <span class="r">
      <button class="btn sm ${sh.inCombat ? 'on' : ''}" onclick="toggle('inCombat')" title="In combat, swapping an ability is an Exhausting Exchange">${sh.inCombat ? 'In combat — swaps cost Exhaustion' : 'Out of combat'}</button>
      <button class="btn sm" onclick="openCompendium('${g.id}')">Full ability pool</button></span></h2>
    <div class="loadout">${col('passive')}${col('active')}${col('super')}</div>
    <p class="hint" style="margin-top:0">Compose after a Long Rest (1 hour of introspection). ${sh.inCombat ? '<b>Exhausting Exchange:</b> each swap now is a Bonus Action and +1 Exhaustion, once per round.' : ''} ✦ = additional ability.</p>
    ${show.map(a => abilityHtml(a, sh, true)).join('')}
  </section>`;
}
function abilityHtml(a, sh, usable) {
  const cost = a.cost ? `<span class="cost" title="${a.cost} Grimm Slot${a.cost > 1 ? 's' : ''}">${'<i></i>'.repeat(a.cost)}</span>` : '';
  const useBtn = usable && a.cost ? `<button class="btn sm pri" onclick="event.stopPropagation();useAbility('${a.id}')">Use</button>` : '';
  return `<div class="ab ${a.kind}" id="ab-${a.id}">
    <div class="ab-h" onclick="this.parentNode.classList.toggle('open')">
      <span class="nm">${esc(a.name)}</span>
      <span class="tag k">${KIND_NAME[a.kind]}</span>
      ${a.action ? `<span class="tag">${esc(a.action)}</span>` : ''}
      ${a.stage === 'additional' ? '<span class="tag st">Additional</span>' : a.stage !== 'shackle' ? `<span class="tag st">${STAGE_NAME[a.stage] || a.stage}</span>` : ''}
      ${cost}${useBtn}<span class="car">▶</span>
    </div>
    <div class="ab-b">${prose(a.text, sh)}</div>
  </div>`;
}
function setLoad(k, i, id) {
  const sh = sheet();
  if (sh.inCombat && sh.loadout[k][i] !== id) { sh.exhaustion++; toast('Exhausting Exchange — +1 Exhaustion (Bonus Action).'); }
  sh.loadout[k][i] = id; save(); render();
}
function useAbility(id) {
  const g = grimmById(S.current), sh = sheet(), a = g.abilities.find(x => x.id === id);
  if (sh.familiar) return toast('Your Grimm is in Familiar form — slot abilities are unavailable.');
  if (!spend(a.cost)) return;
  const mins = /\b1 minute\b/i.test(a.text) ? 10 : /\b3 Rounds\b/i.test(a.text) ? 3 : 0;
  if (mins) sh.effects.push({ name: a.name, rounds: mins });
  if (USE_HOOK[a.id]) USE_HOOK[a.id](sh, g);
  save(); render();
  toast(`${a.name} — ${a.cost} slot${a.cost > 1 ? 's' : ''} spent${mins ? `, tracking ${mins} rounds` : ''}.`);
}

// ── Effects & rounds ────────────────────────────────────────────────────
function effectsCard(g, sh) {
  const list = sh.effects.map((e, i) => `<div class="item"><span class="nm">${esc(e.name)}</span><span class="sp"></span>
    <span class="hint">${e.rounds} round${e.rounds === 1 ? '' : 's'}</span><button class="x" onclick="dropEffect(${i})">×</button></div>`).join('');
  return `<section class="card span5 effects">
    <h2>Round tracker <span class="r"><button class="btn sm" onclick="endCombat()">End combat</button></span></h2>
    <div class="row"><div class="stat"><b>${sh.round}</b><i>round</i></div><button class="btn pri" onclick="nextRound()">Next round</button></div>
    <div class="items" style="margin-top:10px">${list || '<p class="hint">Durations you start with <b>Use</b> land here (1 minute = 10 rounds).</p>'}</div>
    <div class="row" style="margin-top:10px"><input class="txt" id="efName" placeholder="Custom effect" style="flex:1"><input class="num" id="efRounds" type="number" value="10" min="1"><button class="btn" onclick="addEffect()">Add</button></div>
  </section>`;
}
function nextRound() {
  const sh = sheet(); sh.round++; sh.inCombat = true;
  const ended = [];
  sh.effects = sh.effects.filter(e => (--e.rounds > 0) || (ended.push(e.name), false));
  save(); render();
  if (ended.length) toast('Ended: ' + ended.join(', '));
}
function endCombat() { const sh = sheet(); sh.round = 1; sh.effects = []; sh.inCombat = false; save(); render(); }
function addEffect() { const sh = sheet(); const n = $('#efName').value.trim(); if (!n) return; sh.effects.push({ name: n, rounds: +$('#efRounds').value || 10 }); save(); render(); }
function dropEffect(i) { const sh = sheet(); sh.effects.splice(i, 1); save(); render(); }

// ── Harmony ─────────────────────────────────────────────────────────────
const HARMONY_EVENTS = [
  ['Shared Ideal / protected the Grimm', 7], ['Named it / crafted its anchor', 5], ["Did the Grimm's will unprompted", 3],
  ['Bonding ritual (1/week)', 10], ["Ignored its voice / morality", -5], ['Forced Familiar against its will', -3],
  ['Used an ability against its Cognition', -5], ['Let an ally die despite its protest', -10], ['Lost an inner conflict', -10],
];
function harmonyCard(g, sh) {
  if (!sh.harmonyOn) return `<section class="card span6"><h2>Harmony <span class="r"><button class="btn sm" onclick="toggle('harmonyOn')">Track Harmony</button></span></h2>
    <p class="hint">Optional gauge (0–100) of your bond. Turn it on if your table uses it — Soulbound adds a Grimm Slot.</p></section>`;
  const st = harmonyStatus(sh.harmony);
  const dc = { Stable:40, Fractured:60, Hostile:80 }[st[1]];
  return `<section class="card span6">
    <h2>Harmony <span class="r"><span class="state">${st[1]}</span><button class="btn sm" onclick="toggle('harmonyOn')">Hide</button></span></h2>
    <div class="row"><input type="range" min="0" max="100" value="${sh.harmony}" style="flex:1" oninput="this.nextElementSibling.textContent=this.value" onchange="setNum('harmony',this.value)"><b style="font-family:var(--sans);min-width:30px">${sh.harmony}</b></div>
    <p class="hint">${st[2]}</p>
    <div class="chips">${HARMONY_EVENTS.map(([t, n]) => `<button class="chip" onclick="harmonyShift(${n})">${sign(n)} ${esc(t)}</button>`).join('')}</div>
    <h3>Harmony Check</h3>
    <div class="row"><span class="lbl">Dream score</span><input class="num" id="hcDream" type="number" value="10"><span class="lbl">Slot tier / other</span><input class="num" id="hcTier" type="number" value="0">
      <button class="btn pri" onclick="rollHarmony(${dc || 0})" ${st[1] === 'Unbound' ? 'disabled' : ''}>Roll d100</button></div>
    <div id="hcOut"></div>
    <p class="hint">Called for Reality Shift, Familiar Form, an Unveiled Super, or deep conflict. ${dc ? `DC ${dc} at ${st[1]}.` : st[1] === 'Unbound' ? 'Unbound: no check — the Grimm acts.' : 'DC 40 at Stable; your DM sets it above that.'}</p>
  </section>`;
}
function harmonyShift(n) { const sh = sheet(); sh.harmony = Math.max(0, Math.min(100, sh.harmony + n)); save(); render(); }
function rollHarmony(dc) {
  dc = dc || 40;
  const r = d(100), tot = r + (+$('#hcDream').value || 0) + (+$('#hcTier').value || 0);
  $('#hcOut').innerHTML = `<div class="roll">d100 ${r} → <b>${tot}</b> vs DC ${dc} — ${tot >= dc ? '<b class="ok">in harmony</b>' : '<b class="bad">the Grimm resists</b>'}</div>`;
}

// ── Revive & notes ──────────────────────────────────────────────────────
function reviveCard(g, sh, v) {
  return `<section class="card span6">
    <h2>Revive ledger & notes</h2>
    <div class="row">
      <span class="lbl">Deaths</span><div class="step"><button onclick="bump('deaths',-1)">–</button><span>${sh.deaths}</span><button onclick="bump('deaths',1)">+</button></div>
      <div class="stat"><b>${v.reviveDC}</b><i>Revive DC</i></div>
      ${sh.unchainedDeath ? `<div class="stat"><b style="color:var(--ember)">−20</b><i>Unchained, forever</i></div>` : ''}
      <label class="lbl"><input type="checkbox" ${sh.unchainedDeath ? 'checked' : ''} onchange="toggle('unchainedDeath')"> died via Unchaining</label>
    </div>
    <p class="hint">Every revival is a d20 Revive Roll against 10 + 1 per previous death.</p>
    <textarea class="txt" placeholder="Notes — what your Grimm said, what it wants…" onchange="setStr('notes',this.value)">${esc(sh.notes)}</textarea>
  </section>`;
}

// ── backup ──────────────────────────────────────────────────────────────
function exportSheet() {
  const blob = new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `grimm-companion-${S.current}.json`; a.click(); URL.revokeObjectURL(a.href);
}
function importSheet() {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
  inp.onchange = async () => {
    try {
      const o = JSON.parse(await inp.files[0].text());
      if (!o.sheets) throw 0;
      Object.assign(S, o); save(); render(); toast('Backup restored.');
    } catch (e) { toast('That file is not a Grimm Companion backup.'); }
  };
  inp.click();
}
function resetSheet() {
  if (!confirm(`Reset ${grimmById(S.current).name}'s sheet? This clears everything tracked here.`)) return;
  delete S.sheets[S.current]; save(); render();
}
