// Command bar, view switching, the first-visit chooser, boot. Loads last.

const VIEWS = { sheet: 'Sheet', codex: 'Compendium', party: 'Party', rules: 'Rules' };

function renderBar() {
  const g = S.current && grimmById(S.current);
  document.documentElement.style.setProperty('--hue', g ? g.hue : '#B08842');
  $('#tabs').innerHTML = Object.entries(VIEWS).map(([k, n]) => `<button class="tab ${S.view === k ? 'on' : ''}" onclick="setView('${k}')">${n}</button>`).join('');
  if (!g) { $('#dials').innerHTML = ''; $('#live').innerHTML = ''; return; }
  const sh = sheet(), v = derived(sh);
  $('#dials').innerHTML = `
    <select class="pick who" aria-label="Your Grimm" onchange="pickGrimm(this.value)">${D.grimms.map(x => `<option value="${x.id}" ${x.id === g.id ? 'selected' : ''}>${esc(x.name)} · ${esc(x.short)}</option>`).join('')}</select>
    <div class="dial"><label>Level</label><div class="step"><button onclick="bumpLevel(-1)" aria-label="Lower level">–</button><span>${sh.level}</span><button onclick="bumpLevel(1)" aria-label="Raise level">+</button></div></div>
    <div class="dial"><label for="stageSel">Stage</label><select class="pick" id="stageSel" onchange="setStage(this.value)">${STAGES.map(s => `<option value="${s}" ${s === sh.stage ? 'selected' : ''}>${STAGE_NAME[s]}</option>`).join('')}</select></div>
    <div class="dial"><label for="dmIn">Dream mod</label><input class="num" id="dmIn" type="number" value="${sh.dreamMod}" onchange="setNum('dreamMod',this.value)"></div>`;
  $('#live').innerHTML = `
    <span class="lv pb"><b>+${v.pb}</b><i>prof</i></span>
    <span class="lv sl"><b>${v.left}/${v.total}</b><i>slots</i></span>
    <span class="lv"><b class="st-${v.chainState.toLowerCase()}" style="font-size:14px">${'⛓'.repeat(sh.chains) || '—'}</b><i>${v.chainState}</i></span>`;
}

function render() {
  renderBar();
  if (S.view === 'sheet') S.current ? renderSheet() : renderChooser();
  else if (S.view === 'codex') renderCodex();
  else if (S.view === 'party') renderParty();
  else renderRules();
}
function setView(v) { S.view = v; save(); render(); window.scrollTo(0, 0); }
function pickGrimm(id) { S.current = id; S.view = 'sheet'; pairFocus = null; sheet(); save(); render(); }
function bumpLevel(n) { const sh = sheet(); sh.level = Math.max(1, Math.min(20, sh.level + n)); save(); render(); }
function setStage(st) { const sh = sheet(); sh.stage = st; fitLoadout(grimmById(S.current), sh); save(); render(); }

function renderChooser() {
  $('#view').innerHTML = `
    <div class="hero"><div><h1 style="color:var(--bone)">Whose Grimm is this?</h1>
    <div class="sub">Pick yours — the sheet remembers it on this device. You can switch any time from the bar.</div></div></div>
    <div class="grid">${D.grimms.map(g => `
      <button class="card span4" style="text-align:left;cursor:pointer;border-color:${g.hue};display:flex;gap:14px;align-items:center" onclick="pickGrimm('${g.id}')">
        <span class="hero" style="margin:0"><span class="portrait" style="border-color:${g.hue};background-image:url('${attr(g.images.awakened || g.images.invoked)}')"></span></span>
        <span><b style="font-family:var(--sans);font-size:17px;color:${g.hue}">${esc(g.name)}</b><br>
        <span class="hint">${esc(g.user)}</span><br><span class="hint">${esc(g.forms.invoked || '')} → ${esc(g.forms.awakened || '')}</span></span>
      </button>`).join('')}</div>`;
}

// When a Shackle Break's three rounds run out, show what it costs.
const _nextRound = nextRound;
nextRound = function () {
  const sh = sheet(), g = grimmById(S.current);
  const breaking = sh.effects.filter(e => e.rounds === 1 && g.abilities.some(a => a.kind === 'shackle' && a.name === e.name));
  _nextRound();
  if (breaking.length) {
    const v = derived(sh);
    openDialog(`${breaking[0].name} ends`, `<div class="prose"><p>The chains close again — and bite.</p>
      <ul><li>Gain <b>2 points of Exhaustion</b> and <b>3 points of Dream Exhaustion</b>.</li>
      <li>Make a <b>Dream Saving Throw, DC ${v.dreamDC}</b> (8 + PB + Dream mod). On a failure the bond is damaged — tell your DM.</li></ul></div>
      <div class="row"><button class="btn pri" onclick="shackleEnd()">Apply exhaustion & roll the save</button></div><div id="shOut"></div>`);
  }
};
function shackleEnd() {
  const sh = sheet(), v = derived(sh);
  sh.exhaustion += 2; sh.dreamExhaustion += 3; save();
  const r = d(20), tot = r + sh.dreamMod;
  $('#shOut').innerHTML = `<div class="roll">d20 ${r} ${sign(sh.dreamMod)} = <b>${tot}</b> vs DC ${v.dreamDC} — ${tot >= v.dreamDC ? '<b class="ok">the bond holds</b>' : '<b class="bad">the bond is damaged</b> — tell your DM'}</div>`;
  $('#shOut').previousElementSibling.remove();
  render();
}

document.addEventListener('keydown', e => {
  if (e.target.matches('input,textarea,select') || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = { '1': 'sheet', '2': 'codex', '3': 'party', '4': 'rules' }[e.key];
  if (k) setView(k);
  if (e.key === 'n' && S.view === 'sheet' && S.current) nextRound();
});

$('#built').textContent = D.built;
render();
