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
  // The DM's controls live in admin/ now; a sheet saved while they were a tab here comes back to its own.
  if (!VIEWS[S.view]) S.view = 'sheet';
  // While the chains are off or a domain is up, the page keeps a low edge — red or pink — so the
  // table can tell at a glance that something big is still running.
  const live = S.current ? sheet() : null;
  const domain = live && live.rs && live.rs.on;
  document.body.classList.toggle('shackled-now', !!(live && shackleOn()));
  document.body.classList.toggle('shifted-now', !!domain);
  // While a domain holds, the page wears its plate — a dark wash of the Shift's own art behind the
  // sheet, so anyone glancing at the screen can see whose reality the table is standing in. It is a
  // variable rather than an element because body::before paints it and clearing the variable takes
  // it away; a Shift whose note carries no plate just sets none and the page looks as it always did.
  // Absolute, not "img/…": a relative url() inside a custom property is resolved against the
  // stylesheet that *uses* the variable, not the document, so css/app.css turned the plate into
  // css/img/… and the backdrop silently never loaded.
  const plate = domain && shiftOn(S.current) && grimmById(S.current).shift?.art;
  document.body.style.setProperty('--rs-plate', plate ? `url('${new URL(plate, location.href).href}')` : 'none');
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

// When a Shackle Break's three rounds run out, show what it costs — and when a Reality Shift's
// last round passes, collapse it.
const _nextRound = nextRound;
nextRound = function () {
  const sh = sheet(), g = grimmById(S.current);
  const breaking = sh.effects.filter(e => e.rounds === 1 && g.abilities.some(a => a.kind === 'shackle' && a.name === e.name));
  const shiftOver = sh.rs?.on && g.shift && sh.effects.some(e => e.rounds === 1 && e.name === g.shift.name);
  _nextRound();
  if (shiftOver) return shiftEnd();
  if (breaking.length) return shackleClose(breaking[0].name);
}
// ── A Shackle Break opening ─────────────────────────────────────────────
// Pressing Use on a Shackle Break used to be indistinguishable from pressing Use on anything else:
// a toast, and three rounds quietly added to the tracker. It is the loudest thing a Grimm can do, so
// it now takes over the screen — the chain snaps, the page glows red — and then the window below
// asks for the decisions this particular Grimm has to make while the chains are off.
//
// The animation is skippable (click, or any key) and honours prefers-reduced-motion, because the
// table will see it often and nobody should have to sit through it twice in one fight.
const CHAIN_LINKS = [52, 104, 156, 208, 260];     // mirrored around the centre of the 640-wide box
const chainSvg = () => `<svg class="sb-chain" viewBox="0 0 640 120" aria-hidden="true">
  <g class="lh">${CHAIN_LINKS.map((x, i) => i % 2
    ? `<ellipse cx="${x}" cy="60" rx="11" ry="19"/>`
    : `<ellipse cx="${x}" cy="60" rx="25" ry="13"/>`).join('')}
    <path d="M296 44 a22 16 0 0 0 0 32" /></g>
  <g class="rh">${CHAIN_LINKS.map((x, i) => i % 2
    ? `<ellipse cx="${640 - x}" cy="60" rx="11" ry="19"/>`
    : `<ellipse cx="${640 - x}" cy="60" rx="25" ry="13"/>`).join('')}
    <path d="M344 44 a22 16 0 0 1 0 32" /></g>
  <g class="shards">${[0, 1, 2, 3, 4, 5].map(i => `<rect class="s${i}" x="316" y="56" width="9" height="7" rx="1.5"/>`).join('')}</g>
</svg>`;

// The two big openings share everything but their art: a full-screen layer, a skip on click or any
// key, the reduced-motion cut, and the window each hands over to when it is done.
function cinematic({ kind, inner, body, ms, after }) {
  document.querySelectorAll('.cine').forEach(o => o.remove());   // two in a row never stack
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const el = document.createElement('div');
  el.className = `cine ${kind}`;
  el.innerHTML = `${inner}<span class="cine-skip">click to skip</span>`;
  document.body.append(el);
  if (body) document.body.classList.add(body);
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    clearTimeout(t);
    document.removeEventListener('keydown', finish, true);
    if (body) document.body.classList.remove(body);
    el.classList.add('out');
    setTimeout(() => el.remove(), 320);
    if (after) after();
  };
  const t = setTimeout(finish, reduced ? 700 : ms);
  el.addEventListener('click', finish);
  document.addEventListener('keydown', finish, true);
}

function shackleBreakOpen(a, g) {
  cinematic({
    kind: 'sbreak', body: 'breaking', ms: 2400,
    inner: `<div class="sb-glow"></div>${chainSvg()}
      <div class="cine-words"><b>Shackle Break</b><em>${esc(a.name)}</em></div>`,
    after: () => shackleSetup(a, sheet(), g),
  });
}

// ── A Reality Shift rising ──────────────────────────────────────────────
// Pink and black energies drag in from every edge of the screen, spiral down into one ball, and the
// domain's name lands on it. What follows is the window shiftStart has always opened: the Shift's
// own "On Activation" beats, the ones you resolve once as it rises.
// Two layers turning against each other — pink one way, black the other. The black needs a pink rim
// or it is just more darkness on a dark page, which is why the void wisps carry their own glow.
const RS_WISPS = 16, RS_VOID = 11;
const rsWisps = (n, skew) => Array.from({ length: n }, (_, i) =>
  `<i style="--a:${Math.round(i * 360 / n + (i % 3) * skew)}deg;--d:${(i % 6) * 70}ms"></i>`).join('');
// The domain's own plate is the payoff. It opens out of the ball on the ring burst — the energies
// collapse to a point and the place is simply there, which is what a Reality Shift is: not a spell
// laid on a place, a place laid on a place. The ball fades as the art passes it so the centre of
// the screen is the domain and not a pink sphere sitting on top of it.
// A Shift whose note carries no plate runs exactly the original animation at the original length;
// the extra second is only bought when there is something to look at.
function realityShiftOpen(s, after) {
  const plate = s.art ? `<div class="rs-plate" style="background-image:url('${attr(s.art)}')"></div>` : '';
  cinematic({
    kind: `rshift${s.art ? ' plated' : ''}`, body: 'shifting', ms: s.art ? 3800 : 2800,
    inner: `<div class="rs-void"></div>${plate}
      <div class="rs-field hot">${rsWisps(RS_WISPS, 7)}</div>
      <div class="rs-field dark">${rsWisps(RS_VOID, 11)}</div>
      <div class="rs-ball"></div><div class="rs-ring"></div>
      <div class="cine-words"><b>Reality Shift</b><em>${esc(s.name)}</em></div>`,
    after,
  });
}

// What a Shackle Break asks for differs per Grimm, so each one registers its own window in
// SHACKLE_SETUP (see panels.js). Everything gets the same footer: how long it holds, which abilities
// are running their + form, and what it will cost when the chains close.
function shackleSetup(a, sh, g) {
  const own = SHACKLE_SETUP[g.id] && SHACKLE_SETUP[g.id](sh, g, a);
  const v = derived(sh), left = (sh.effects.find(e => e.name === a.name) || {}).rounds;
  const evolved = Object.keys(plusForms(a))
    .map(k => (g.abilities.find(x => x.name.trim().toLowerCase() === k) || {}).name)
    .filter(Boolean);
  openDialog(a.name, `${own ? own.body : ''}
    <div class="sb-foot">
      <div class="stats">
        ${stat(left ?? '—', `round${left === 1 ? '' : 's'} it holds`)}
        ${stat(a.cost, `Grimm Slot${a.cost > 1 ? 's' : ''} spent`)}
        ${stat(v.dreamDC, 'Dream save when it ends')}
      </div>
      ${evolved.length ? `<p class="hint">Running their <b>+</b> form while it holds: ${evolved.map(n => `<b>${esc(n)}</b>`).join(' · ')}. The sheet shows each one in place of the original.</p>` : ''}
      <p class="hint">When it closes — on its own or early — <b>2 Exhaustion</b>, <b>3 Dream Exhaustion</b> and that Dream save. The sheet will walk you through it.</p>
    </div>
    <div class="row"><span class="sp"></span><button class="btn" onclick="this.closest('dialog').close()">${own && own.done ? own.done : 'Close'}</button></div>`);
  if (own && own.after) own.after();
}

// Letting go early costs exactly what running out of rounds costs.
function shackleEndNow() {
  const sh = sheet(), sb = shackleOn();
  if (!sb) return;
  sh.effects = sh.effects.filter(e => e.name !== sb.name);
  save(); render();
  shackleClose(sb.name);
}
// The one funnel both endings pass through — rounds running out above, "End it now" below — so a
// Grimm that has to put something back when the chains close registers it once, in SHACKLE_END,
// and gets it done on either path.
function shackleClose(name) {
  const v = derived(sheet());
  const extra = SHACKLE_END[S.current] ? SHACKLE_END[S.current](sheet(), name) : '';
  openDialog(`${name} ends`, `<div class="prose"><p>The chains close again — and bite.</p>
    <ul><li>Gain <b>2 points of Exhaustion</b> and <b>3 points of Dream Exhaustion</b>.</li>
    <li>Make a <b>Dream Saving Throw, DC ${v.dreamDC}</b> (8 + PB + Dream mod). On a failure the bond is damaged — tell your DM.</li></ul></div>
    ${extra}
    <div class="row"><button class="btn pri" onclick="shackleEnd()">Apply exhaustion & roll the save</button></div><div id="shOut"></div>`);
}
function shackleEnd() {
  const sh = sheet(), v = derived(sh);
  sh.exhaustion += 2; sh.dreamExhaustion += 3; save();
  const r = d(20), tot = r + sh.dreamMod, failed = tot < v.dreamDC;
  // Some Breaks cost more than the bond on a failure — White Rabbit's hands Grizzly something of
  // Silk's that he did not ask for. The Grimm registers that in SHACKLE_FAIL (see panels.js).
  const extra = failed && SHACKLE_FAIL[S.current] ? SHACKLE_FAIL[S.current](sh, v) : '';
  $('#shOut').innerHTML = `<div class="roll">d20 ${r} ${sign(sh.dreamMod)} = <b>${tot}</b> vs DC ${v.dreamDC} — ${failed ? '<b class="bad">the bond is damaged</b> — tell your DM' : '<b class="ok">the bond holds</b>'}</div>${extra}`;
  $('#shOut').previousElementSibling.remove();
  render();
}

// The DM's switches used to be read exactly once, at boot. Flip one on the Admin page and the
// Companion kept the old set until someone reloaded — which at the table reads as "the toggle does
// nothing", because the Admin page updates its own copy immediately and looks like it worked.
// Re-read them whenever this page comes back to the foreground. No-ops on a static host.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) syncGrimms().then(render);
});

document.addEventListener('keydown', e => {
  if (e.target.matches('input,textarea,select') || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = { '1': 'sheet', '2': 'codex', '3': 'party', '4': 'rules' }[e.key];
  if (k) setView(k);
  if (e.key === 'n' && S.view === 'sheet' && S.current) nextRound();
});

$('#built').textContent = D.built;
render();
// The chains and the DM's toggles, then the player's own Servants — both no-op on a static host.
// Souls come second so the roster lands on a sheet whose level and stage are already right.
syncGrimms().then(syncSouls).then(render);
