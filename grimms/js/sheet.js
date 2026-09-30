// The Sheet: slots, exhaustion, the chains (shown only), loadout, abilities, effects — and the DM's Chains view.

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
      <div class="sub">Grimm of <b>${esc(g.user)}</b> · ${esc(form)} · ${STAGE_NAME[sh.stage]}${sh.stage === 'unveiled' ? ' · <b title="Unveiled grants the Reality Shift and nothing else — your DM has its page">Reality Shift</b>' : ''}${sh.familiar ? ' · <b>Familiar form</b>' : ''}</div>
    </div>
    <div class="chains shown" title="The Three Chains — ${v.chainState}. Your DM keeps them.">${chainIcons(sh.chains)}</div>
  </div>
  <div class="sheet-cols">
    <div class="grid">
      ${PANELS[g.id] ? `<section class="card span12">${PANELS[g.id](g, sh, v)}</section>` : ''}
      ${EXTRA[g.id] ? `<section class="card span12">${EXTRA[g.id](g, sh, v)}</section>` : ''}
      ${loadoutCard(g, sh, v)}
      ${shiftCard(g, sh)}
    </div>
    <aside class="rounds">${slotsCard(g, sh, v)}${effectsCard(g, sh)}</aside>
  </div>
  <p class="foot">Saved in this browser only · <button class="btn sm" onclick="exportSheet()">Export backup</button> <button class="btn sm" onclick="importSheet()">Import</button> <button class="btn sm warn" onclick="resetSheet()">Reset this sheet</button></p>`;
}

// ── Grimm Slots & exhaustion ────────────────────────────────────────────
function slotsCard(g, sh, v) {
  let pips = '';
  for (let i = 0; i < v.base; i++) pips += `<button class="pip ${i < sh.used ? 'used' : ''}" title="${i < sh.used ? 'Spent — click to restore' : 'Click to spend'}" onclick="pipClick(${i},false)"></button>`;
  for (let i = 0; i < sh.temp; i++) pips += `<button class="pip temp ${i < sh.tempUsed ? 'used' : ''}" title="Temporary slot bought with Exhaustion" onclick="pipClick(${i},true)"></button>`;
  return `<section class="card slots">
    <h2>Grimm Slots <span class="r"><button class="btn sm" onclick="longRest()" title="Only if you dreamt — a disrupted rest restores nothing">Long rest</button></span></h2>
    <div class="slots-h">
    <div class="row"><div class="pips">${pips || '<span class="hint">A Dormant Grimm has no slots.</span>'}</div></div>
    <div class="row">
      <div class="stats">
        <div class="stat"><b>${v.left}</b><i>left</i></div>
        <div class="stat"><b>${v.base}</b><i>${STAGE_NAME[sh.stage]}</i></div>
        ${sh.temp ? `<div class="stat"><b style="color:var(--ember)">${sh.temp - sh.tempUsed}</b><i>temporary</i></div>` : ''}
      </div>
    </div>
    <div class="row">
      <button class="btn" onclick="forceSlot()" title="Out of slots? Offer a piece of yourself">Force the Grimm · +1 Exhaustion</button>
      <button class="btn" onclick="restoreSlot()" title="A Grimm Token can restore 1 Grimm Slot">Restore 1</button>
      <button class="btn ${sh.familiar ? 'on' : ''}" onclick="toggle('familiar')" title="In Familiar form, abilities that need a Grimm Slot can't be used">Familiar form</button>
    </div>
    <div class="row">
      <span class="pair"><span class="lbl">Exhaustion</span><div class="step"><button onclick="bump('exhaustion',-1)">–</button><span>${sh.exhaustion}</span><button onclick="bump('exhaustion',1)">+</button></div></span>
      <span class="pair"><span class="lbl">Dream exh.</span><div class="step"><button onclick="bump('dreamExhaustion',-1)">–</button><span>${sh.dreamExhaustion}</span><button onclick="bump('dreamExhaustion',1)">+</button></div></span>
    </div>
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
// A player's sheet only shows the chains. The DM keeps them, for every Grimm, in the Chains view.
const CHAIN_FX = {
  3: 'The pact is whole. The Grimm behaves per its stage.',
  2: 'The Grimm\'s voice grows more independent — it speaks unprompted, hesitates a half-beat, watches you when it thinks itself unobserved.',
  1: 'The Grimm may act on its own once per session (DM). Its abilities run hot. Every Dream Saving Throw to hold the last chain is +2 to +5 DC.',
  0: 'The user dies and the Grimm Unchains.',
};
function chainIcons(n) {
  let h = '';
  for (let i = 0; i < 3; i++) h += `<span class="chain ${i >= n ? 'broken' : ''}">⛓</span>`;
  return h;
}
// The DM's view: every Grimm's chains, which of its abilities the player may compose, and whether
// its Reality Shift is revealed. A hidden Shift's text is never sent to that player's browser.
function renderGrimmsAdmin() {
  $('#view').innerHTML = `
  <div class="hero"><div><h1 style="color:var(--bone)">The Grimms</h1>
    <div class="sub">Yours to keep. Players see the chains on their sheet, compose only the abilities you leave on, and read a Reality Shift only once you reveal it.</div></div></div>
  <div class="grid">${D.grimms.map(g => {
    const n = sheet(g.id).chains, sh = shiftOn(g.id);
    return `<section class="card span12" style="--hue:${g.hue}">
      <h2><span style="color:${g.hue}">${esc(g.name)}</span> <span class="hint" style="text-transform:none;letter-spacing:0">${esc(g.user)}</span>
        <span class="r">
          <div class="step"><button onclick="setChains('${g.id}',${n - 1})" aria-label="Break a chain">–</button><span>${n}</span><button onclick="setChains('${g.id}',${n + 1})" aria-label="Restore a chain">+</button></div>
          <span class="chains shown">${chainIcons(n)}</span>
          <span class="state st-${CHAIN_STATE[n].toLowerCase()}">${CHAIN_STATE[n]}</span>
        </span></h2>
      <p class="hint" style="margin-top:0">${CHAIN_FX[n]}</p>
      ${g.shift ? `<div class="row" style="margin-top:10px">
        <span class="lbl">Reality Shift</span><b style="font-family:var(--sans);font-size:14px">${esc(g.shift.name)}</b>
        <button class="btn sm ${sh ? 'on' : ''}" onclick="setToggle('${g.id}','shift',${!sh})">${sh ? 'Revealed' : 'Hidden'}</button>
        <button class="btn sm" onclick="openDialog('${attr(g.shift.name)}', prose(grimmById('${g.id}').shift.text))">Read it</button>
      </div>` : ''}
      <h3>Abilities</h3>
      <div class="chips">${g.abilities.map(a => {
        const on = abilityOn(g.id, a.id);
        return `<button class="chip ${on ? 'on' : ''}" title="${on ? 'On — click to take it away' : 'Off — click to give it back'}" onclick="setToggle('${g.id}','a:${attr(a.id)}',${!on})">${esc(a.name)}</button>`;
      }).join('')}</div>
      <p class="hint">An ability switched off leaves that player's loadout and ability pool at once.</p>
    </section>`; }).join('')}</div>`;
}
async function setToggle(gid, key, enabled) {
  try {
    const r = await fetch(`../api/admin/grimms/${gid}/toggles/${encodeURIComponent(key)}`,
      { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled }) });
    if (!r.ok) throw 0;
    (TOGGLES[gid] = TOGGLES[gid] || {})[key] = enabled;
    const sh = S.sheets[gid];
    if (sh && key !== 'shift') fitLoadout(grimmById(gid), sh);   // a denied ability leaves the loadout
    save(); render();
  } catch (e) { toast("Couldn't save — are you still signed in as the DM?"); }
}
async function setChains(id, n) {
  n = Math.max(0, Math.min(3, n));
  if (n === sheet(id).chains) return;
  try {
    const r = await fetch(`../api/admin/grimms/${id}/chains`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chains: n }) });
    if (!r.ok) throw 0;
    sheet(id).chains = n; save(); render();
  } catch (e) { toast("Couldn't save — are you still signed in as the DM?"); }
}

// ── Loadout & abilities ─────────────────────────────────────────────────
function loadoutCard(g, sh, v) {
  const n = v.abilitySlots;
  const col = k => {
    if (!n[k]) return `<div class="slotcol"><span class="lbl">${KIND_NAME[k]}</span><p class="hint">No ${KIND_NAME[k].toLowerCase()} slots at ${STAGE_NAME[sh.stage]}.</p></div>`;
    const pool = abilitiesOf(g).filter(a => slotKind(a) === k);
    const lines = sh.loadout[k].map((id, i) => `<div class="slotline"><select class="pick" onchange="setLoad('${k}',${i},this.value)">
      <option value="">— empty —</option>
      ${pool.map(a => `<option value="${a.id}" ${a.id === id ? 'selected' : ''} ${!unlocked(a, sh.stage) || (sh.loadout[k].includes(a.id) && a.id !== id) ? 'disabled' : ''}>${esc(a.name)}${a.stage === 'additional' ? ' ✦' : ''}</option>`).join('')}
    </select></div>`).join('');
    return `<div class="slotcol"><span class="lbl" style="color:var(--k-${k})">${KIND_NAME[k]} · ${n[k]}</span>${lines}</div>`;
  };
  const loaded = new Set([...sh.loadout.passive, ...sh.loadout.active, ...sh.loadout.super]);
  const show = abilitiesOf(g).filter(a => a.kind === 'core' || loaded.has(a.id) || (a.kind === 'shackle' && unlocked(a, sh.stage)));
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

// ── Reality Shift ───────────────────────────────────────────────────────
// Unveiled grants this and nothing else. The card only exists once the DM reveals it, and it runs
// the Shift beat by beat: what it does when it opens, what holds while it lasts, the actions and
// the Lair Action you spend your turns on, and what it costs when it collapses.
const RS_KIND = { activation:'core', passives:'passive', actions:'active', lair:'super', collapse:'core' };
const RS_NOTE = {
  activation: 'The moment it opens — resolve these once.',
  passives:   'True the whole time it lasts.',
  actions:    'What you can spend a turn on inside the domain.',
  lair:       'Initiative 20, losing ties. Solo Shift only, and it can be traded for an Action or Bonus Action.',
  collapse:   'When it ends, or the moment you drop to 0 HP.',
};
const rsState = sh => (sh.rs = sh.rs || { on: false, crits: 0, lair: 0 });

function shiftCard(g, sh) {
  if (!g.shift || !shiftOn(g.id)) return '';
  const s = g.shift, rs = rsState(sh), v = derived(sh);
  const left = (sh.effects.find(e => e.name === s.name) || {}).rounds;
  const escDC = Math.max(1, 20 + sh.dreamMod + v.pb - 2 * rs.crits);
  const lairReady = rs.lair !== sh.round;
  const parts = (s.parts || []).filter(p => rs.on || p.key !== 'collapse');

  const entry = (e, p) => `<div class="ab ${RS_KIND[p.key] || ''} ${rs.on && (p.key === 'actions' || p.key === 'lair') ? 'open' : ''}">
    <div class="ab-h" onclick="this.parentNode.classList.toggle('open')">
      <span class="nm">${esc(e.name)}</span>${e.tag ? `<span class="tag">${esc(e.tag)}</span>` : ''}<span class="car">▶</span></div>
    <div class="ab-b">${prose(e.text, sh)}</div></div>`;

  return `<section class="card span12 shift">
    <h2>Reality Shift <span class="r">
      <span class="state" style="color:${g.hue};border-color:${g.hue}">${esc(s.name)}</span>
      ${rs.on ? `<button class="btn sm warn" onclick="shiftEnd()">End the Shift</button>`
              : `<button class="btn sm pri" onclick="shiftStart()">Activate</button>`}</span></h2>

    ${rs.on ? `<div class="stats">
        <div class="stat"><b>${left ?? '—'}</b><i>rounds left</i></div>
        <div class="stat"><b>${escDC}</b><i>Escape DC${rs.crits ? ` · −${2 * rs.crits}` : ''}</i></div>
        <div class="stat"><b>${sign(sh.dreamMod)}</b><i>to your save DCs</i></div>
        <div class="stat"><b>${v.left}/${v.total}</b><i>Grimm Slots</i></div>
      </div>
      <div class="row" style="margin-top:10px">
        <button class="btn" onclick="shiftSlots()" title="Rule 7 — at the start of your turn">Start of turn · +2 Grimm Slots</button>
        <button class="btn ${lairReady ? 'pri' : 'on'}" onclick="shiftLair()" title="Initiative 20">${lairReady ? 'Lair Action ready' : `Lair Action used · round ${rs.lair}`}</button>
        <span class="lbl">Crits taken</span><div class="step"><button onclick="shiftCrit(-1)">–</button><span>${rs.crits}</span><button onclick="shiftCrit(1)">+</button></div>
      </div>
      <p class="hint">Your attacks <b>hit automatically</b> in here if you can reach — still roll for crits. Every creature in initiative is trapped; escaping is an Incept Check vs the Escape DC, and each crit against you lowers it by 2.</p>
      ${SHIFT_PANEL[g.id] ? SHIFT_PANEL[g.id](g, sh, rs) : ''}`
    : `<p class="hint" style="margin-top:0">Unveiled, a Natural Turn Action that can't be downgraded, Dream Affinity 1+, not restrained, and <b>no Dream Exhaustion</b>. It lasts 1 minute, then costs <b>3 Exhaustion</b> and <b>5 Dream Exhaustion</b> — and it can't be called again for 30 days.</p>`}

    ${parts.map(p => `<h3>${esc(p.title)} <span class="hint" style="font-family:var(--serif);font-weight:400">${RS_NOTE[p.key] || ''}</span></h3>
      ${p.note ? `<div class="hint" style="margin-bottom:6px">${prose(p.note, sh)}</div>` : ''}
      ${p.entries.map(e => entry(e, p)).join('')}`).join('')}

    ${!parts.length ? `<div class="ab"><div class="ab-h" onclick="this.parentNode.classList.toggle('open')">
      <span class="nm">${esc(s.name)}</span><span class="car">▶</span></div><div class="ab-b">${prose(s.text, sh)}</div></div>` : ''}

    <h3>Reference</h3>
    ${(s.extra || []).map(x => `<div class="ab"><div class="ab-h" onclick="this.parentNode.classList.toggle('open')">
      <span class="nm">${esc(x.title)}</span><span class="car">▶</span></div><div class="ab-b">${prose(x.text, sh)}</div></div>`).join('')}
    ${s.intro ? `<div class="ab"><div class="ab-h" onclick="this.parentNode.classList.toggle('open')">
      <span class="nm">The domain</span><span class="tag">what it looks like</span><span class="car">▶</span></div><div class="ab-b">${prose(s.intro, sh)}</div></div>` : ''}
    ${D.realityShift ? `<div class="ab"><div class="ab-h" onclick="this.parentNode.classList.toggle('open')">
      <span class="nm">The rules of a Reality Shift</span><span class="tag">shared by every Shift</span><span class="car">▶</span></div>
      <div class="ab-b">${prose(D.realityShift, sh)}</div></div>` : ''}
  </section>`;
}
// Opening one: the domain rises, the clock starts, and its On Activation beats are put in front of you.
function shiftStart() {
  const g = grimmById(S.current), sh = sheet(), s = g.shift, rs = rsState(sh);
  if (sh.dreamExhaustion > 0) return toast(`You carry ${sh.dreamExhaustion} Dream Exhaustion — a Reality Shift needs none.`);
  rs.on = true; rs.crits = 0; rs.lair = 0;
  rs.banner = 'king'; rs.acclaim = 0; rs.labors = {};   // Solemn Temperance
  rs.traps = []; rs.placed = {};                        // Hollownest
  sh.inCombat = true;
  sh.effects = sh.effects.filter(e => e.name !== s.name);
  sh.effects.push({ name: s.name, rounds: 10 });
  save(); render();
  const act = (s.parts || []).find(p => p.key === 'activation');
  openDialog(`${s.name} rises`, act
    ? act.entries.map(e => `<div class="stagehead">${esc(e.name)}</div>${prose(e.text, sh)}`).join('')
    : `<div class="prose"><p>The domain is yours for 10 rounds.</p></div>`);
}
// Ending it: the collapse, and what it takes out of you.
function shiftEnd() {
  const g = grimmById(S.current), sh = sheet(), s = g.shift, rs = rsState(sh);
  rs.on = false; rs.crits = 0; rs.lair = 0; rs.acclaim = 0; rs.labors = {}; rs.traps = []; rs.placed = {};
  sh.exhaustion += 3; sh.dreamExhaustion += 5;
  sh.effects = sh.effects.filter(e => e.name !== s.name);
  save(); render();
  const col = (s.parts || []).find(p => p.key === 'collapse');
  openDialog(`${s.name} collapses`, (col
    ? col.entries.map(e => `<div class="stagehead">${esc(e.name)}</div>${prose(e.text, sh)}`).join('')
    : '') + `<div class="prose"><p><b>+3 Exhaustion</b> and <b>+5 Dream Exhaustion</b> applied. You can't call it again for <b>30 days</b>.</p></div>`);
}
function shiftCrit(n) { const rs = rsState(sheet()); rs.crits = Math.max(0, rs.crits + n); save(); render(); }
function shiftLair() { const sh = sheet(), rs = rsState(sh); rs.lair = rs.lair === sh.round ? 0 : sh.round; save(); render(); }
function shiftSlots() {
  const sh = sheet(), v = derived(sh);
  if (!sh.used && !sh.tempUsed) return toast('Your Grimm Slots are already full.');
  for (let i = 0; i < 2; i++) { if (sh.tempUsed > 0 && !sh.used) sh.tempUsed--; else if (sh.used > 0) sh.used--; }
  save(); render(); toast('The domain gives back 2 Grimm Slots.');
}

// ── Effects & rounds ────────────────────────────────────────────────────
// The round tracker is the sheet's side bar: it stays in view while the rest scrolls.
function effectsCard(g, sh) {
  const list = sh.effects.map((e, i) => `<div class="item"><span class="nm">${esc(e.name)}</span><span class="sp"></span>
    <span class="hint">${e.rounds} round${e.rounds === 1 ? '' : 's'}</span><button class="x" onclick="dropEffect(${i})">×</button></div>`).join('');
  return `<section class="card effects">
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
