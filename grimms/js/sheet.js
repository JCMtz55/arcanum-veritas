// The Sheet: slots, exhaustion, the chains (shown only), loadout, abilities, effects — and the DM's Chains view.

function renderSheet() {
  const g = grimmById(S.current), sh = sheet(), v = derived(sh);
  fitLoadout(g, sh);
  const awake = stageIdx(sh.stage) >= 3;
  const form = (awake ? g.forms.awakened : g.forms.invoked) || '';
  // The sheet always wears the 2nd Stage plate, whatever the stage (Juan, 2026-10-18). The familiar
  // art is still the Compendium's — side by side with the true form, which is where comparing the
  // two belongs — but the sheet is the screen you live on, and it should show the Grimm itself.
  // The form NAME still follows the stage, so an Invoked sheet reads "Striped Fury" over a picture
  // of Magnamalo on purpose: the name is a fact about where the Grimm is, the plate is its portrait.
  const img = g.images.awakened || g.images.invoked;
  // The caption names what is in the picture, not what stage the sheet is on. The plate is always
  // the true form, so at Invoked the eyebrow reads "Striped Fury" while the lightbox correctly
  // says "Magnamalo" — the eyebrow is describing the Grimm, the caption is describing the art.
  const plateName = `${g.name}${g.forms.awakened ? ' — ' + g.forms.awakened : ''}`;
  // The header band is the art, twice: blurred as the field behind, crisp as the portrait in front.
  // That is the only treatment that survives the plates we actually have — the 2nd Stage art is
  // portrait 4:5 and the familiars run from 0.72:1 to 1.73:1, so nothing can be cropped to a banner
  // without butchering somebody, and a new plate can be dropped in without tuning a focal point.
  // While a domain holds, the field becomes the Reality Shift's plate: those ARE 16:9 and painted
  // as landscapes, so this is the one place they get to be the full-width place they were drawn as,
  // with the Grimm standing crisp in front of it.
  const domain = sh.rs?.on && shiftOn(g.id) && g.shift?.art;
  // Absolute, always. These land in a custom property, and a relative url() in a custom property
  // is resolved against the stylesheet that *uses* the variable rather than the document — so
  // "img/x.png" read from css/app.css becomes "css/img/x.png" and silently 404s. Same trap as the
  // page backdrop in app.js. new URL() leaves Peco's external gmbinder address alone.
  const css = u => (u ? `url('${attr(new URL(u, location.href).href)}')` : 'none');
  // Published page-wide so the hotbar's sigils can carry the same plate faintly behind them —
  // a bar should look like this Grimm's bar, not a generic one.
  document.documentElement.style.setProperty('--sheet-plate', css(img));

  $('#view').innerHTML = `
  <div class="hero plate${domain ? ' domain' : ''}" style="--plate:${css(img)};--field:${css(domain || img)}">
    <div class="hero-back"></div>
    <div class="portrait" role="button" tabindex="0" title="Click to see it whole"
      onclick="lightbox(bgUrl(this),'${attr(plateName)}')"
      onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();lightbox(bgUrl(this),'${attr(plateName)}')}"></div>
    <div class="hero-id">
      ${form ? `<div class="eyebrow">${esc(form)}</div>` : ''}
      <h1>${esc(g.name)}</h1>
      <div class="sub">Grimm of <b>${esc(g.user)}</b> · ${STAGE_NAME[sh.stage]}${sh.stage === 'unveiled' ? ' · <b title="Unveiled grants the Reality Shift and nothing else — your DM has its page">Reality Shift</b>' : ''}${sh.familiar ? ' · <b>Familiar form</b>' : ''}</div>
      ${domain ? `<div class="hero-domain">Standing in <b>${esc(g.shift.name)}</b></div>` : ''}
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
    <h2>Grimm Slots <span class="r"><button class="btn sm" onclick="shortRest()" title="Refills Servant charges set to a short rest">Short rest</button>
      <button class="btn sm" onclick="longRest()" title="Only if you dreamt — a disrupted rest restores nothing">Long rest</button></span></h2>
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
// ── Mythical Grimm Abilities — SUPERSEDED, kept for one line's worth of undo ─────────────────
// This was a card in the side column. Both Mythics are now tiles closing the ability hotbar
// (see mythicTiles), which Juan asked for on 2026-10-18 once the panels were compact enough to
// afford it. Nothing calls this any more. To put the card back, add `${mythicalCard(g, sh, v)}`
// to the <aside class="rounds"> in renderSheet and drop the mythic group from hotbar().
//
// What it did: kept whichever Mythic this Grimm actually has one click away, showed what was
// already running, and could end either. No card at all for a Grimm with neither; the Shackle
// Break half waited for the stage that unlocks it, the Shift half for the DM to reveal it.
function mythicalCard(g, sh, v) {
  const sb = abilitiesOf(g).find(a => a.kind === 'shackle' && unlocked(a, sh.stage));
  const shift = g.shift && shiftOn(g.id) ? g.shift : null;
  // A Break already running when the DM hides it still has to be endable, or its rounds, its
  // Exhaustion and its Dream save are stranded on the sheet with no way to resolve them. So `open`
  // is read from the unfiltered list, the same way rs.on outlives its own reveal.
  const open = shackleOn(sh, g);
  if (!sb && !open && !shift) return '';
  const rs = rsState(sh);
  const roundsOf = name => (sh.effects.find(e => e.name === name) || {}).rounds;
  const left = n => `<span class="tag k">${n ?? '—'} round${n === 1 ? '' : 's'} left</span>`;
  // rs.on can outlive the reveal — a sheet saved mid-Shift, then the DM hides it — so the rounds are
  // only read once we know there is still a Shift to read them from.
  const sbLeft = open ? roundsOf(open.name) : 0, rsLeft = rs.on && shift ? roundsOf(shift.name) : 0;
  return `<section class="card mythical">
    <h2>Mythical Grimm Abilities</h2>
    ${!sb && !open ? '' : open
      ? `<div class="bm" style="--kc:var(--k-super)"><span class="nm">${esc(open.name)}</span>${left(sbLeft)}
          <span class="sp"></span><button class="btn sm warn" onclick="shackleEndNow()">End it now</button>
          <p class="hint">Every ability is running its <b>+</b> form.</p></div>`
      : `<div class="bm" style="--kc:var(--k-super)">
          <button class="btn go-sb" onclick="useAbility('${attr(sb.id)}')" title="${attr(sb.name)}">Shackle Break</button>
          <span class="tag k">${sb.cost} slot${sb.cost > 1 ? 's' : ''}</span>
          <p class="hint">${esc(sb.name)} · 3 rounds, then 2 Exhaustion and 3 Dream Exhaustion.${
            sh.familiar ? ' <b>Familiar form can\'t.</b>' : v.left < sb.cost ? ' <b>Not enough slots.</b>' : ''}</p></div>`}
    ${!shift ? '' : rs.on
      ? `<div class="bm" style="--kc:#FF4FA3"><span class="nm">${esc(shift.name)}</span>${left(rsLeft)}
          <span class="sp"></span><button class="btn sm warn" onclick="shiftEnd()">End the Shift</button>
          <p class="hint">Your attacks hit automatically in here if you can reach.</p></div>`
      : `<div class="bm" style="--kc:#FF4FA3">
          <button class="btn go-rs" onclick="shiftStart()" title="${attr(shift.name)}">Reality Shift</button>
          <span class="tag k">10 rounds</span>
          <p class="hint">${esc(shift.name)} · then 3 Exhaustion, 5 Dream Exhaustion, and 30 days before it answers again.${
            sh.dreamExhaustion ? ` <b>Blocked — you carry ${sh.dreamExhaustion} Dream Exhaustion.</b>` : ''}</p></div>`}
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
  // Servant charge trackers refill by their own rule; a long rest covers the short-rest ones too.
  const n = typeof trRefill === 'function' ? trRefill('long') : 0;
  save(); render();
  toast(`Long rest — Grimm Slots restored${n ? `, ${n} Servant charge${n > 1 ? 's' : ''} refilled` : ''}. Recompose your abilities if you wish.`);
}
// Servants spend charges between long rests, so the short rest needs a button of its own.
function shortRest() {
  const n = typeof trRefill === 'function' ? trRefill('short') : 0;
  save(); render();
  toast(n ? `Short rest — ${n} Servant charge${n > 1 ? 's' : ''} refilled.` : 'Short rest — nothing of the Grimm\'s refills on one.');
}
function bump(k, n) { const sh = sheet(); sh[k] = Math.max(0, (+sh[k] || 0) + n); save(); render(); }
function toggle(k) { const sh = sheet(); sh[k] = !sh[k]; save(); render(); }
function setNum(k, val) { const sh = sheet(); sh[k] = +val || 0; save(); render(); }
function setStr(k, val) { const sh = sheet(); sh[k] = val; save(); }

// ── Chains ──────────────────────────────────────────────────────────────
// A player's sheet only shows the chains. The DM keeps them, for every Grimm, on the Admin page.
function chainIcons(n) {
  let h = '';
  for (let i = 0; i < 3; i++) h += `<span class="chain ${i >= n ? 'broken' : ''}">⛓</span>`;
  return h;
}

// ── Loadout & abilities ─────────────────────────────────────────────────
function loadoutCard(g, sh, v) {
  const loaded = new Set([...sh.loadout.passive, ...sh.loadout.active, ...sh.loadout.super]);
  const show = abilitiesOf(g).filter(a => a.kind === 'core' || loaded.has(a.id) || (a.kind === 'shackle' && unlocked(a, sh.stage)));
  const sb = shackleOn(sh, g), plus = plusForms(sb);
  const left = sb ? (sh.effects.find(e => e.name === sb.name) || {}).rounds : 0;
  return `<section class="card span12">
    <h2>Abilities <span class="r">
      <button class="btn sm ${sh.inCombat ? 'on' : ''}" onclick="toggle('inCombat')" title="In combat, swapping an ability is an Exhausting Exchange">${sh.inCombat ? 'In combat — swaps cost Exhaustion' : 'Out of combat'}</button>
      <button class="btn sm" onclick="openCompendium('${g.id}')">Full ability pool</button></span></h2>
    ${sb ? `<div class="row shackled"><b>${esc(sb.name)} is open</b>
      <span class="tag k" style="--kc:var(--k-super)">${left ?? '—'} round${left === 1 ? '' : 's'} left</span>
      <span class="hint" style="flex:1;min-width:180px">Every ability below is running its <b>+</b> form.</span>
      <button class="btn sm warn" onclick="shackleEndNow()">End it now</button></div>` : ''}
    ${hotbar(g, sh, v, plus)}
    <p class="hint" style="margin-top:0">Hover a tile to read it, click to pin · click a socket to equip · <b>Use</b> is in the panel. Compose after a Long Rest (1 hour of introspection). ${sh.inCombat ? '<b>Exhausting Exchange:</b> each swap is a Bonus Action and +1 Exhaustion, once per round.' : ''} ✦ = additional ability.</p>
  </section>`;
}
// ── The hotbar ──────────────────────────────────────────────────────────
// What you have equipped, as squares you can read across in one look — kind by colour, cost by
// pips, action by the corner badge — with the rules text on hover. The accordion list underneath
// is untouched and is still the full reference; this sits on top of it, it does not replace it.
//
// No ability has art of its own. There are eight Grimms at roughly eight abilities each and no
// icon set anywhere in the vault, so a square can be blank or it can say something: it says the
// ability's initials, cut in the serif face over the Grimm's own plate. Written art-ready — give
// an ability an `icon` and the monogram gives way to it without another line changing here.
const SIGIL_SKIP = /^(of|the|a|an|and|to|in|for|i|my|on)$/i;
const sigil = n => n.split(/[^A-Za-z]+/).filter(w => w && !SIGIL_SKIP.test(w))
  .slice(0, 2).map(w => w[0].toUpperCase()).join('') || n.slice(0, 2).toUpperCase();
const ACT_SHORT = { 'Action':'ACT', 'Bonus Action':'BNS', 'Reaction':'REA', 'Free':'FREE', 'Attack':'ATK' };

// Nothing is spent by clicking a tile. A click pins the tooltip and the Use button lives in
// there — at a table a misfired tap that eats two Grimm Slots is a worse bug than an extra click,
// and hover already shows the cost before anyone commits to it.
//
// The bar IS the loadout: a socket per slot the stage grants, empty ones included, and clicking an
// empty socket opens the pool for that kind. The three <select> columns this replaced said the
// same thing in a form nobody could read across — you could not see at a glance that your second
// Active slot was empty, and that is exactly the thing you need to see in a fight.
function hotbar(g, sh, v, plus) {
  const n = v.abilitySlots;
  const byId = id => g.abilities.find(a => a.id === id);
  const groups = [];

  // Familiar is not a loadout slot — it is always there, so it sits in its own group rather than
  // looking like something you chose.
  const fixed = abilitiesOf(g).filter(a => a.kind === 'core');
  if (fixed.length) groups.push({ lbl: 'Always', k: null, tiles: fixed.map(a => tile(a, sh, v, plus)) });

  for (const k of ['passive', 'active', 'super']) {
    if (!n[k]) continue;
    groups.push({
      lbl: `${KIND_NAME[k]} · ${n[k]}`, k,
      tiles: sh.loadout[k].map((id, i) => {
        const a = id && byId(id);
        return a ? tile(a, sh, v, plus, k, i) : socket(k, i);
      }),
    });
  }
  // The two Mythics close the bar, where an ultimate belongs. They used to be a card of their own
  // in the side column (Juan, 2026-10-18 — once the panels were compact enough to afford it).
  const myth = mythicTiles(g, sh, v, plus);
  if (myth) groups.push(myth);

  return `<div class="hotbar">${groups.map(gr =>
    `<div class="hbgroup${gr.cls ? ' ' + gr.cls : ''}"${gr.k ? ` style="--kc:var(--k-${gr.k})"` : ''}>
      <span class="hblbl">${esc(gr.lbl)}</span>
      <div class="hbrow">${gr.tiles.join('')}</div>
    </div>`).join('')}</div>`;
}

// Shackle Break and Reality Shift as two tiles. Each shows what is running on its face — the rounds
// in the corner badge — and its panel carries the cost, what it will take out of you, and the one
// button that fires or ends it. A Grimm with neither gets no group at all; a Break waits for the
// stage that unlocks it and a Shift for the DM to reveal it.
function mythicTiles(g, sh, v, plus) {
  const sb = abilitiesOf(g).find(a => a.kind === 'shackle' && unlocked(a, sh.stage));
  // A Break already running when the DM hides it still has to be endable, or its rounds, its
  // Exhaustion and its Dream save are stranded with no way to resolve them.
  const open = shackleOn(sh, g);
  const shift = g.shift && shiftOn(g.id) ? g.shift : null;
  if (!sb && !open && !shift) return null;
  const rs = rsState(sh), tiles = [];
  const roundsOf = nm => (sh.effects.find(e => e.name === nm) || {}).rounds;
  if (open || sb) tiles.push(tile(open || sb, sh, v, plus));
  if (shift) {
    const blocked = !rs.on && sh.dreamExhaustion > 0;
    tiles.push(`<button type="button" class="slotbtn rshift${rs.on ? ' running' : ''}${blocked ? ' dim' : ''}" data-rs="1"
      onmouseenter="shiftTip(this)" onmouseleave="abTipOff()"
      onfocus="shiftTip(this)" onblur="abTipOff()"
      onclick="event.stopPropagation();shiftTip(this,true)" title="${attr(shift.name)}">
      <span class="sig"><b>${esc(sigil(shift.name))}</b>
        ${rs.on ? `<span class="act">${roundsOf(shift.name) ?? '—'}</span>` : ''}</span>
      <span class="cap">${esc(shift.name)}</span></button>`);
  }
  return { lbl: 'Mythic', k: null, cls: 'mythic', tiles };
}

function shiftTip(el, pin) {
  if (abTipPin && !pin) return;
  if (pin && abTipPin === 'rshift') return abTipOff(true);
  const g = grimmById(S.current), sh = sheet(), s = g.shift, rs = rsState(sh);
  if (!s) return;
  const left = (sh.effects.find(e => e.name === s.name) || {}).rounds;
  popAt(el, `<div class="abtip-h"><b>${esc(s.name)}</b><span class="tag k">Reality Shift</span>
      <span class="tag">${rs.on ? `${left ?? '—'} round${left === 1 ? '' : 's'} left` : '10 rounds'}</span></div>
    <div class="abtip-b"><p class="hint" style="margin:0">${rs.on
      ? 'Your attacks <b>hit automatically</b> in here if you can reach. Every creature in initiative is trapped.'
      : `Then <b>3 Exhaustion</b>, <b>5 Dream Exhaustion</b>, and <b>30 days</b> before it answers again.${
        sh.dreamExhaustion ? ` <b style="color:#e4927f">Blocked — you carry ${sh.dreamExhaustion} Dream Exhaustion.</b>` : ''}`}</p></div>
    <div class="abtip-f">${rs.on
      ? `<button class="btn sm warn" onclick="abTipOff(true);shiftEnd()">End the Shift</button>`
      : `<button class="btn sm pri" onclick="abTipOff(true);shiftStart()">Raise the domain</button>`}
      <span class="hint">Natural Turn Action · Unveiled</span></div>`, 'rshift', pin);
  if (pin) abTipPin = 'rshift';
}

function tile(a, sh, v, plus, k, i) {
  const up = plus && plus[a.name.trim().toLowerCase()];
  const short = a.cost > v.left, locked = sh.familiar && a.cost;
  const seat = k != null ? ` data-k="${k}" data-i="${i}"` : '';
  // A Break that is already open wears its remaining rounds instead of its cost, and stops being
  // dimmed for slots it is not about to spend.
  const run = a.kind === 'shackle' && (shackleOn(sh, grimmById(S.current)) || {}).name === a.name
    ? ((sh.effects.find(e => e.name === a.name) || {}).rounds ?? '—') : null;
  if (run !== null) return `<button type="button" class="slotbtn shackle running"
    onmouseenter="abTip(this,'${a.id}')" onmouseleave="abTipOff()"
    onfocus="abTip(this,'${a.id}')" onblur="abTipOff()"
    onclick="event.stopPropagation();abTip(this,'${a.id}',true)" title="${attr(a.name)}">
    <span class="sig"><b>${esc(sigil(a.name))}</b><span class="act">${run}</span></span>
    <span class="cap">${esc(a.name)}</span></button>`;
  return `<button type="button" class="slotbtn ${a.kind}${up ? ' evolved' : ''}${locked || short ? ' dim' : ''}"${seat}
    onmouseenter="abTip(this,'${a.id}')" onmouseleave="abTipOff()"
    onfocus="abTip(this,'${a.id}')" onblur="abTipOff()"
    onclick="event.stopPropagation();abTip(this,'${a.id}',true)">
    <span class="sig"${a.icon ? ` style="--icon:url('${attr(new URL(a.icon, location.href).href)}')"` : ''}>
      <b>${a.icon ? '' : esc(sigil(a.name))}</b>
      ${a.action ? `<span class="act">${esc(ACT_SHORT[a.action] || a.action)}</span>` : ''}
      ${a.cost ? `<span class="pips">${'<i></i>'.repeat(a.cost)}</span>` : ''}
      ${up ? '<span class="plus">+</span>' : ''}
    </span>
    <span class="cap">${esc(a.name)}</span>
  </button>`;
}

function socket(k, i) {
  return `<button type="button" class="slotbtn empty ${k}" data-k="${k}" data-i="${i}"
    onclick="event.stopPropagation();abPick(this,'${k}',${i})" title="Equip a ${KIND_NAME[k].toLowerCase()} ability">
    <span class="sig"><b>+</b></span><span class="cap">Empty</span></button>`;
}

// The pool for one socket. Everything the stage can hold is listed; what is already in another
// socket is shown struck through rather than hidden, so the reason a choice is unavailable is on
// screen instead of being a gap. In combat the Exhausting Exchange is stated before the click,
// not toasted after it.
function abPick(el, k, i) {
  const g = grimmById(S.current), sh = sheet();
  const here = sh.loadout[k][i];
  const pool = abilitiesOf(g).filter(a => slotKind(a) === k && unlocked(a, sh.stage));
  const rows = pool.map(a => {
    const taken = sh.loadout[k].includes(a.id) && a.id !== here;
    return `<button type="button" class="pickrow ${a.kind}${taken ? ' taken' : ''}${a.id === here ? ' on' : ''}"
      ${taken ? 'disabled' : `onclick="event.stopPropagation();setLoad('${k}',${i},'${a.id}')"`}>
      <span class="sig"><b>${esc(sigil(a.name))}</b></span>
      <span class="pr-id"><b>${esc(a.name)}${a.stage === 'additional' ? ' ✦' : ''}</b>
        <span class="hint">${esc(a.action || KIND_NAME[a.kind])}${a.cost ? ` · ${a.cost} slot${a.cost > 1 ? 's' : ''}` : ''}${taken ? ' · already equipped' : ''}</span></span>
    </button>`;
  }).join('');
  popAt(el, `<div class="abtip-h"><b>${KIND_NAME[k]} slot ${i + 1}</b>
      ${here ? `<span class="tag">replacing ${esc((g.abilities.find(a => a.id === here) || {}).name || '')}</span>` : ''}</div>
    <div class="abtip-b picker">${rows || '<p class="hint">Nothing in the pool for this slot yet.</p>'}</div>
    <div class="abtip-f">
      ${here ? `<button class="btn sm warn" onclick="event.stopPropagation();setLoad('${k}',${i},'')">Clear the slot</button>` : ''}
      <span class="hint">${sh.inCombat
        ? '<b>Exhausting Exchange</b> — this is a Bonus Action and +1 Exhaustion.'
        : 'Free to change outside combat.'}</span>
    </div>`, k, true);
  abTipPin = `pick:${k}:${i}`;   // claim the pin, or the next hover would steal the picker away
}

// One tooltip element, moved and refilled rather than one per square. Pinned means it survives the
// mouse leaving, which is the only way a touch device can read it at all — there is no hover there.
let abTipPin = null;

// One popover element for both the tooltip and the equip picker: created once, moved and refilled.
// It is placed under whatever opened it and nudged back inside the viewport rather than being
// clipped by it, flipping above when there is no room below.
function popAt(el, html, kind, pin) {
  let t = document.getElementById('abtip');
  if (!t) { t = document.createElement('div'); t.id = 'abtip'; document.body.append(t); }
  t.className = `abtip ${kind || ''}${pin ? ' pinned' : ''}`;
  t.innerHTML = html;
  // A click inside the panel is not a click away from it. Without this the document handler that
  // dismisses a pinned panel fires the moment you touch a field inside one.
  t.onclick = e => e.stopPropagation();
  const r = el.getBoundingClientRect(), w = Math.min(380, innerWidth - 24);
  t.style.width = w + 'px';
  t.style.left = Math.round(Math.max(12, Math.min(r.left, innerWidth - w - 12))) + 'px';
  t.style.top = Math.round(r.bottom + 8 + scrollY) + 'px';
  if (r.bottom + t.offsetHeight + 20 > innerHeight)
    t.style.top = Math.round(Math.max(scrollY + 8, r.top - t.offsetHeight - 8 + scrollY)) + 'px';
  return t;
}

function abTip(el, id, pin) {
  if (abTipPin && !pin) return;                        // a pinned pop outranks a hover
  if (pin && abTipPin === id) return abTipOff(true);   // clicking the pinned one closes it
  const g = grimmById(S.current), sh = sheet();
  const a = g.abilities.find(x => x.id === id);
  if (!a) return;
  const up = plusForms(shackleOn(sh, g))[a.name.trim().toLowerCase()];
  const k = el.dataset.k, i = el.dataset.i;            // absent on Familiar and the Shackle Break
  const running = a.kind === 'shackle' && (shackleOn(sh, g) || {}).name === a.name;
  popAt(el, `<div class="abtip-h"><b>${esc(a.name)}${up ? ' +' : ''}</b>
      <span class="tag k">${KIND_NAME[a.kind]}</span>
      ${a.action ? `<span class="tag">${esc(a.action)}</span>` : ''}
      ${a.cost ? `<span class="tag">${a.cost} Grimm Slot${a.cost > 1 ? 's' : ''}</span>` : ''}</div>
    <div class="abtip-b">${up ? `<div class="plusform">${prose(up, sh)}</div><p class="hint">Unchanged below.</p>` : ''}${prose(a.text, sh)}</div>
    ${a.cost || k ? `<div class="abtip-f">
      ${running ? `<button class="btn sm warn" onclick="event.stopPropagation();abTipOff(true);shackleEndNow()">End it now</button>`
        : a.cost ? `<button class="btn sm pri" onclick="event.stopPropagation();abTipOff(true);useAbility('${a.id}')">Use · ${a.cost} slot${a.cost > 1 ? 's' : ''}</button>` : ''}
      ${k ? `<button class="btn sm" onclick="event.stopPropagation();abPick(document.querySelector('[data-k=&quot;${k}&quot;][data-i=&quot;${i}&quot;]'),'${k}',${i})">Swap</button>` : ''}
      <span class="hint">${a.cost ? (sh.familiar ? 'Familiar form — slot abilities are unavailable.' : `${derived(sh).left} left`) : ''}</span></div>` : ''}`,
    a.kind, pin);
  abTipPin = pin ? id : abTipPin;
}
function abTipOff(force) {
  if (abTipPin && !force) return;
  abTipPin = null;
  document.getElementById('abtip')?.remove();
}
document.addEventListener('click', () => abTipOff(true));

function abilityHtml(a, sh, usable, plus) {
  const cost = a.cost ? `<span class="cost" title="${a.cost} Grimm Slot${a.cost > 1 ? 's' : ''}">${'<i></i>'.repeat(a.cost)}</span>` : '';
  const useBtn = usable && a.cost ? `<button class="btn sm pri" onclick="event.stopPropagation();useAbility('${a.id}')">Use</button>` : '';
  // While a Shackle Break holds, an ability that has a "+" form shows it in its place — the
  // original stays underneath, because the + text only describes what changed.
  const up = plus && plus[a.name.trim().toLowerCase()];
  return `<div class="ab ${a.kind}${up ? ' open' : ''}" id="ab-${a.id}">
    <div class="ab-h" onclick="this.parentNode.classList.toggle('open')">
      <span class="nm">${esc(a.name)}${up ? ' +' : ''}</span>
      <span class="tag k">${KIND_NAME[a.kind]}</span>
      ${a.action ? `<span class="tag">${esc(a.action)}</span>` : ''}
      ${up ? '<span class="tag k" style="--kc:var(--k-super)">Evolved</span>'
           : a.stage === 'additional' ? '<span class="tag st">Additional</span>'
           : a.stage !== 'shackle' ? `<span class="tag st">${STAGE_NAME[a.stage] || a.stage}</span>` : ''}
      ${cost}${useBtn}<span class="car">▶</span>
    </div>
    <div class="ab-b">${up ? `<div class="plusform">${prose(up, sh)}</div><p class="hint">Unchanged below.</p>` : ''}${prose(a.text, sh)}</div>
  </div>`;
}
function setLoad(k, i, id) {
  const sh = sheet();
  if (sh.inCombat && sh.loadout[k][i] !== id) { sh.exhaustion++; toast('Exhausting Exchange — +1 Exhaustion (Bonus Action).'); }
  sh.loadout[k][i] = id;
  abTipOff(true);   // the picker was the thing that called this; it has had its answer
  save(); render();
}
function useAbility(id) {
  const g = grimmById(S.current), sh = sheet(), a = g.abilities.find(x => x.id === id);
  if (sh.familiar) return toast('Your Grimm is in Familiar form — slot abilities are unavailable.');
  if (!spend(a.cost)) return;
  const mins = /\b1 minute\b/i.test(a.text) ? 10 : /\b3 Rounds\b/i.test(a.text) ? 3 : 0;
  if (mins) sh.effects.push({ name: a.name, rounds: mins });
  if (USE_HOOK[a.id]) USE_HOOK[a.id](sh, g);
  save(); render();
  // A Shackle Break is not an ability you press and forget: the chains come off on screen, and then
  // its window asks for whatever this Grimm has to decide while it holds.
  if (a.kind === 'shackle') return shackleBreakOpen(a, g);
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
  // The domain arrives on screen first; its On Activation beats land the moment it settles.
  realityShiftOpen(s, () => {
    const act = (s.parts || []).find(p => p.key === 'activation');
    openDialog(`${s.name} rises`, act
      ? act.entries.map(e => `<div class="stagehead">${esc(e.name)}</div>${prose(e.text, sheet())}`).join('')
      : `<div class="prose"><p>The domain is yours for 10 rounds.</p></div>`);
  });
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
