// Compendium (every player Grimm), Party (tokens, pair actions, Grimm Sight), Rules.

// ── Compendium ─────────────────────────────────────────────────────────
let compId = null;
function openCompendium(id) { compId = id; setView('codex'); }
function renderCodex() {
  compId = grimmById(compId) ? compId : S.current || D.grimms[0].id;
  const g = grimmById(compId), mine = S.current && S.sheets[S.current] ? sheet() : null;
  const groups = [['invoked', 'Invoked form'], ['awakened', 'Awakened form'], ['additional', 'Additional abilities'], ['shackle', 'Shackle Break']];
  $('#view').innerHTML = `<div class="split">
    <nav class="side">${D.grimms.map(x => `<button class="${x.id === compId ? 'on' : ''}" onclick="compId='${x.id}';render()"><span class="dot" style="background:${x.hue}"></span>${esc(x.name)}<small>${esc(x.short)}</small></button>`).join('')}</nav>
    <div>
      <div class="hero" style="--hue:${g.hue};margin-bottom:6px"><div><h1>${esc(g.name)}</h1><div class="sub">Grimm of <b>${esc(g.user)}</b></div></div></div>
      <div class="forms">
        ${['invoked', 'awakened'].map(s => g.images[s] ? `<div class="form"><img src="${attr(g.images[s])}" alt="${attr(g.name)} — ${s} form" loading="lazy" onerror="this.remove()"><div>${STAGE_NAME[s]}<b>${esc(g.forms[s] || '')}</b></div></div>` : '').join('')}
      </div>
      ${mine ? `<p class="hint">Numbers are shown for <b>your</b> level ${mine.level} (PB ${pbOf(mine.level)}).</p>` : ''}
      ${groups.map(([st, label]) => {
        const list = g.abilities.filter(a => a.stage === st);
        return list.length ? `<div class="stagehead">${label}</div>` + list.map(a => abilityHtml(a, mine, false)).join('') : '';
      }).join('')}
      ${g.stances.length ? `<div class="stagehead">Stances</div>` + g.stances.map(s => `<div class="ab passive"><div class="ab-h" onclick="this.parentNode.classList.toggle('open')"><span class="nm">${esc(s.name)}</span><span class="car">▶</span></div><div class="ab-b">${prose(s.text)}</div></div>`).join('') : ''}
      ${g.id === 'ouroboros-vigil' ? `<div class="stagehead">Known Soul Stones</div>` + D.soulStones.map(s => `<div class="ab core"><div class="ab-h" onclick="this.parentNode.classList.toggle('open')"><span class="nm">${esc(s.name)}</span>${s.cr ? `<span class="tag">CR ${s.cr}</span>` : ''}<span class="hint">${esc(s.traits.join(' · '))}</span><span class="car">▶</span></div><div class="ab-b">${prose(s.text)}${s.spiritText ? `<div class="stagehead">${esc(s.spirit)}</div>${prose(s.spiritText)}` : ''}</div></div>`).join('') : ''}
      ${g.servants.length ? `<div class="stagehead">Servants</div>` + g.servants.map(s => `<div class="ab core"><div class="ab-h" onclick="this.parentNode.classList.toggle('open')"><span class="nm">${esc(s.name)}</span><span class="car">▶</span></div><div class="ab-b">${prose(s.text)}</div></div>`).join('') : ''}
    </div></div>`;
  if (location.hash.startsWith('#ab-')) { const el = $(location.hash); if (el) el.classList.add('open'); }
}

// ── Party ──────────────────────────────────────────────────────────────
const TOKEN_USES = [
  'Reroll an attack, save or check and keep either — a failure turned success is partial, with complications.',
  'In combat: remove one failed Death Save or 1 wound.',
  'In combat: move one player\'s initiative +10 for this fight.',
  'In combat: make the DM reroll an attack roll and use the new result.',
  'Restore 1 Grimm Slot.',
  'The DM rolls twice on a random table; the party picks.',
];
const maxTokens = p => p <= 4 ? 3 : p <= 6 ? 4 : 5;
let pairFocus = null;
function renderParty() {
  const P = S.party, max = maxTokens(P.players); P.tokens = Math.min(P.tokens, max);
  const me = S.current ? grimmById(S.current).short : null;
  pairFocus = pairFocus || me || D.pairs.players[0];
  const pr = D.pairs, cur = pr.current || [];
  const isCur = (a, b) => cur.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  const mineRow = pr.players.filter(p => p !== pairFocus).map(p => {
    const n = (pr.matrix[pairFocus] || {})[p]; const ok = n && pr.actions[n];
    const g = D.grimms.find(x => x.short === p);
    return `<div class="item ${isCur(pairFocus, p) ? 'on' : ''}"><span class="dot" style="width:9px;height:9px;border-radius:50%;background:${g ? g.hue : 'var(--mute)'}"></span>
      <span class="nm">${esc(p)}</span><span class="hint">${g ? esc(g.name) : ''}</span><span class="sp"></span>
      ${isCur(pairFocus, p) ? '<span class="tag k" style="--kc:var(--brass)">Synced</span>' : ''}
      ${ok ? `<button class="btn sm" onclick="viewPair('${attr(n)}')">${esc(n)}</button>` : `<span class="hint"><i>${esc(n || '—')}</i> · not yet written</span>`}</div>`;
  }).join('');
  const DCs = [10, 30, 70, 100];
  $('#view').innerHTML = `<div class="grid">
    <section class="card span5">
      <h2>Grimm Tokens <span class="r"><button class="btn sm" onclick="partyTok(${max})">New session</button></span></h2>
      <div class="row"><span class="lbl">Players at the table</span><div class="step"><button onclick="partyPlayers(-1)">–</button><span>${P.players}</span><button onclick="partyPlayers(1)">+</button></div>
        <span class="hint">max ${max}</span></div>
      <div class="row" style="margin:14px 0 6px"><div class="pips">${Array.from({ length: max }, (_, i) => `<button class="pip tok ${i < P.tokens ? '' : 'used'}" onclick="partyTokClick(${i})"></button>`).join('')}</div>
        <b style="font-family:var(--sans);font-size:20px;margin-left:8px">${P.tokens}/${max}</b></div>
      <p class="hint">Party-wide — spend one only when <b>all players agree</b>. Keep this on one device (whoever holds the tokens).</p>
      <h3>Spend one to…</h3><ul class="prose">${TOKEN_USES.map(t => `<li>${esc(t)}</li>`).join('')}</ul>
      <h3>Regain one when…</h3><ul class="prose"><li>A player rolls a <b>natural 1</b>.</li><li>The DM rewards a remarkable roleplaying moment.</li></ul>
    </section>
    <section class="card span7">
      <h2>Vinculum Pair Actions</h2>
      <div class="row"><span class="lbl">Show pairs for</span><div class="chips">${pr.players.map(p => `<button class="chip ${p === pairFocus ? 'on' : ''}" onclick="pairFocus='${p}';render()">${esc(p)}</button>`).join('')}</div></div>
      <div class="items" style="margin-top:10px">${mineRow}</div>
      <p class="hint">Both users must be in <b>Paired Combat</b> — within 30 ft and synced — and each spends <b>1 Grimm Slot</b>. Once per turn.</p>
      <details style="margin-top:8px"><summary class="lbl" style="cursor:pointer">Full matrix</summary>
      <div class="matrix" style="margin-top:8px"><table><tr><th></th>${pr.players.map(p => `<th class="${p === pairFocus ? 'me' : ''}">${esc(p)}</th>`).join('')}</tr>
      ${pr.players.map(r => `<tr><th class="${r === pairFocus ? 'me' : ''}">${esc(r)}</th>${pr.players.map(c => {
        if (r === c) return '<td>—</td>';
        const n = (pr.matrix[r] || {})[c]; const ok = n && pr.actions[n];
        return `<td class="${isCur(r, c) ? 'cur' : ''} ${ok ? '' : 'tbd'} ${r === pairFocus || c === pairFocus ? 'me' : ''}">${ok ? `<button onclick="viewPair('${attr(n)}')">${esc(n)}</button>` : esc(n || '')}</td>`;
      }).join('')}</tr>`).join('')}</table></div></details>
    </section>
    <section class="card span6">
      <h2>Grimm Sight</h2>
      <p class="hint">As an Action, try to see another user's hidden Grimm: roll d100 <b>under</b> the attempt's number. Each failure makes the next easier.</p>
      <div class="row"><div class="chips">${DCs.map((dc, i) => `<button class="chip ${P.sightAttempt === i + 1 ? 'on' : ''}" onclick="S.party.sightAttempt=${i + 1};save();render()">${['1st', '2nd', '3rd', '4th'][i]} · ${i === 3 ? 'auto' : '<' + dc}</button>`).join('')}</div>
        <button class="btn pri" onclick="rollSight()">Roll d100</button></div>
      <div id="sightOut"></div>
    </section>
    <section class="card span6">
      <h2>The party's Grimms</h2>
      <div class="items">${D.grimms.map(g => `<div class="item" style="cursor:pointer" onclick="openCompendium('${g.id}')"><span class="dot" style="width:9px;height:9px;border-radius:50%;background:${g.hue}"></span><span class="nm">${esc(g.name)}</span><span class="hint">${esc(g.user)}</span><span class="sp"></span><span class="hint">${esc(g.forms.awakened || g.forms.invoked || '')}</span></div>`).join('')}</div>
    </section>
  </div>`;
}
function partyPlayers(n) { S.party.players = Math.max(1, Math.min(10, S.party.players + n)); save(); render(); }
function partyTok(max) { S.party.tokens = max; save(); render(); toast('Tokens refilled for the session.'); }
function partyTokClick(i) { S.party.tokens = i < S.party.tokens ? i : i + 1; save(); render(); }
function rollSight() {
  const a = S.party.sightAttempt, dc = [10, 30, 70, 100][a - 1], r = d(100), ok = a === 4 || r < dc;
  $('#sightOut').innerHTML = `<div class="roll">d100 <b>${r}</b> — ${ok ? '<b class="ok">you see it</b>' : `<b class="bad">it stays hidden</b> · next attempt: under ${[10, 30, 70, 100][a]}`}</div>`;
  if (!ok && a < 4) { S.party.sightAttempt = a + 1; save(); setTimeout(render, 1400); }
  else if (ok) { S.party.sightAttempt = 1; save(); }
}
function viewPair(n) { openDialog(n, prose(D.pairs.actions[n], S.current ? sheet() : null)); }

// ── Rules ──────────────────────────────────────────────────────────────
let ruleId = 'chains';
function renderRules() {
  const r = D.rules.find(x => x.id === ruleId) || D.rules[0];
  $('#view').innerHTML = `<div class="split">
    <nav class="side">${D.rules.map(x => `<button class="${x.id === r.id ? 'on' : ''}" onclick="ruleId='${x.id}';render()">${esc(x.title)}</button>`).join('')}</nav>
    <article class="card"><h2>${esc(r.title)}</h2>${prose(r.text)}</article></div>`;
}
