// Arcanum Veritas Builder — The composer and everything you select in it

// ═══════════════════════════════════════════════════════════
//  COMPOSER
// ═══════════════════════════════════════════════════════════
function block(title, body) {
  return `<div class="blk"><div class="blk-h"><h2>${title}</h2><div class="rule"></div></div>${body}</div>`;
}

function renderMain() {
  const comp = document.getElementById("composer");
  const seal = document.getElementById("sumBody");
  syncBar();
  // Codex and Rings resolve formulas off the same bar, so they re-read whenever it moves
  if (state.view === "codex") renderCodex();
  if (state.view === "rings") renderRing();
  if (state.mode === "ign") return renderForge();

  if (!state.core) {
    comp.innerHTML = rulesDrawer() + `<div class="empty">
      Pick a cognition from the left to set your Keystone. Everything else follows from it.</div>`;
    seal.innerHTML = `<div class="empty">No seal drawn yet.</div>`;
    return;
  }

  const coreCog = LOADED[state.core];
  const tier    = getTier(state.charLevel);
  comp.innerHTML = rulesDrawer() + buildComposer(coreCog, tier);

  if (!state.compType || !state.compSub || !currentSub()) {
    seal.innerHTML = `<div class="empty">Choose a Ring to draw the seal.</div>`;
    seal.dataset.text = "";
  } else {
    seal.innerHTML = state.sumMode === "play"
      ? buildPlayCardHTML(coreCog, tier)
      : `<div class="raw">${buildFullRef(coreCog, tier).join("\n")}</div>`;
    seal.dataset.text = buildPlayCard(coreCog, tier).join("\n");
  }
  document.getElementById("mPlay").className = "mini" + (state.sumMode === "play" ? " on" : "");
  document.getElementById("mFull").className = "mini" + (state.sumMode === "full" ? " on" : "");
}

function buildComposer(coreCog, tier) {
  const cd  = COMP_DATA[state.compType];
  const sub = currentSub();
  let h = "";

  // The seal's own name — optional; the card falls back to the Core's
  h += block("Name your seal", `<input class="search eidon-name" type="text" placeholder="Name your seal — or leave it as ${esc(INDEX.find(c => c.id === state.core)?.name || "its Core")}"
    value="${esc(state.sealName || "").replace(/"/g, "&quot;")}" oninput="sealName(this.value)">`);

  // Ring family — only the ones this Core can fill
  const rings = availableRings(coreCog);
  if (!rings.length) {
    return block("Ring — what shape the seal takes",
      `<p class="hint">${esc(INDEX.find(c => c.id === state.core)?.name || "This cognition")}
       has no Verum effects written yet, so it can't take a Ring.</p>`);
  }
  h += block("Ring — what shape the seal takes", `<div class="rings">` +
    rings.map(k => {
      const d = COMP_DATA[k];
      return `<button class="ring ${k}${state.compType === k ? " on" : ""}" onclick="selectCompType('${k}')">
        <b>${d.label}</b><span>${d.desc}</span></button>`;
    }).join("") + `</div>`);

  if (!state.compType) return h;

  // Subtype — likewise, only the ones with a pool behind them
  const subs = availableSubs(coreCog, state.compType);
  h += block("Subtype", `<div class="chips">` +
    subs.map(sk =>
      `<button class="chip${state.compSub === sk ? " on" : ""}" onclick="selectCompSub('${escAttr(sk)}')">${sk}</button>`
    ).join("") + `</div>`);

  if (!state.compSub || !sub) return h;

  // Shape + Manner side by side
  let opts = "";
  if (sub.shape) opts += `<div><div class="blk-h"><h2>Shape</h2><div class="rule"></div></div>
    <div class="chips">${Object.entries(SHAPES).map(([k, sh]) =>
      `<button class="chip${state.shape === k ? " on" : ""}" onclick="selectShape('${k}')">${sh.label}</button>`).join("")}</div>
    <p class="hint">${SHAPES[state.shape].desc}</p></div>`;
  opts += `<div><div class="blk-h"><h2>Manner of drawing</h2><div class="rule"></div></div>
    <div class="chips">${Object.entries(MANNERS).map(([k, m]) =>
      `<button class="chip${state.manner === k ? " on" : ""}${mannerAllowed(k) ? "" : " dis"}" onclick="selectManner('${k}')">${m.label}</button>`).join("")}</div>
    <p class="hint">${MANNERS[state.manner].desc}</p></div>`;
  h += `<div class="blk grid2">${opts}</div>`;

  // The Core's cycle, if it has one — every seal resolves in the phase you're in
  const phz = phaseOf(coreCog);
  if (phz) h += block(esc(coreCog.engine.title), `<div class="chips">` + phz.all.map((p, i) =>
      `<button class="chip${i === phz.index ? " on" : ""}" onclick="selectPhase(${i})">${esc(p.name)}</button>`).join("") +
    `</div><p class="hint"><strong>${esc(phz.now.epithet || phz.now.name)}</strong> — ${esc(resolve(phz.now.card))}. Then turn the Moon to ${esc(phz.next.name)} or ${esc(phz.prev.name)}.</p>`);

  // The Core's tracker, if it keeps one — where this activation falls, and what the 4th brings
  const trk = trackerOf(coreCog);
  if (trk) {
    const av0 = coreVerumOf(coreCog), fuel = av0?.fuel;
    let t = `<div class="chips">` + Array.from({ length: trk.win }, (_, i) => {
      if (i < trk.marks.length) return `<button class="chip pip ${trk.marks[i]}" onclick="markTrack(${i})" title="Click to flip Gold / Black, again to clear">${i + 1} · ${trk.marks[i] === "gold" ? "Gold" : "Black"}</button>`;
      if (i === trk.marks.length) return `<button class="chip pip now on" title="This activation">${i + 1} · now</button>`;
      return `<button class="chip pip dis">${i + 1}</button>`;
    }).join("") + `</div>`;
    t += `<div class="chips" style="margin-top:8px">
      <button class="chip${trk.now === "gold" ? " on" : ""}" onclick="setTrackNow('gold')">${esc(trk.tr.gold?.label || "Gold")}${fuel ? ` — spend ${fuel}` : ""}</button>
      <button class="chip${trk.now === "black" ? " on" : ""}" onclick="setTrackNow('black')">${esc(trk.tr.black?.label || "Black")} — can't pay</button>
      <button class="chip" onclick="logTrack()" title="You drew it — log this activation and move on">Log it ›</button>
      <button class="chip" onclick="resetTrack()">Reset</button></div>`;
    t += `<p class="hint">${esc(resolve((trk.now === "gold" ? trk.tr.gold : trk.tr.black)?.card || ""))}.` +
      (trk.last && trk.reck ? ` <strong>This is activation ${trk.win} — ${esc(trk.reck.name)}:</strong> ${esc(resolve(trk.reck.card))}.` +
        (trk.reck.corona && av0?.corona ? ` <strong>${esc(av0.corona.name)}.</strong>` : "")
      : ` Activation ${trk.n} of ${trk.win} — ${trk.win - trk.n} more before the Reckoning.`) + `</p>`;
    h += block(esc(trk.tr.name || "Tracker"), t);
  }

  // Verum effect + the tier ladder
  const verums = coreCog?.verumEffects?.[verumKey()] || [];
  if (verums.length) {
    let v = "";
    if (verums.length > 1) v += `<div class="chips" style="margin-bottom:9px">` + verums.map(e =>
      `<button class="chip${state.coreVerum === e.name ? " on" : ""}" onclick="selectCoreVerum('${escAttr(e.name)}')">${e.name}</button>`).join("") + `</div>`;
    const av = verums.find(e => e.name === state.coreVerum) || verums[0];
    v += `<div class="vname">${av.name}</div>` +
         `<p class="hint" style="margin:0 0 9px">${av.description || ""}</p><div class="ladder">` +
      av.tiers.map((t, i) => i > tier ? "" :
        `<div class="rung ${i === tier ? "now" : "past"}"><span class="lv">${TIERS[i].label}</span>
         <span>${resolve(partText(t))}</span></div>`).join("") + `</div>`;
    h += block(`Verum effect — ${verumLabel()} pool`, v);
  } else {
    h += block("Verum effect", `<p class="hint">${INDEX.find(c=>c.id===state.core)?.name} has no ${verumLabel()} effect yet.</p>`);
  }

  // Scaling — the whole ladder, current slot lit
  const row = sub.rows.find(r => r[0] === ORDINALS[state.slotLevel]);
  let sc = `<div class="scale">` + sub.rows.map(r =>
    `<button class="sl${r[0] === ORDINALS[state.slotLevel] ? " on" : ""}" onclick="bumpSlotTo(${ORDINALS.indexOf(r[0])})">
      <b>${r[0]}</b><span>${resolve(r[1])}</span></button>`).join("") + `</div>`;
  if (row) sc += `<p class="scale-note">` + sub.columns.map((c, i) => `${c}: <strong>${resolve(row[i])}</strong>`).join(" · ") + `</p>`;
  if (sub.notes) sc += `<p class="scale-note" style="font-style:italic">${sub.notes.split("\n")[0]}</p>`;
  h += block(`${state.compSub} — scaling`, sc);

  // Complements
  if (maxComps() > 0) {
    let c = "";
    state.complements.forEach((cs, idx) => {
      const cog = LOADED[cs.id], entry = INDEX.find(x => x.id === cs.id);
      if (!cog || !entry) return;
      const avail = complementPool(cog);
      if (avail.length && !avail.find(f => f.name === cs.compEffect)) cs.compEffect = avail[0].name;
      const fx = avail.find(f => f.name === cs.compEffect) || avail[0];
      const coven = idx >= state.slotLevel - 1;
      c += `<div class="cmp"><div class="cmp-h"><span class="ico">${cogIcon(entry)}</span><b>${entry.name}</b>
        <span class="tag">${coven ? "coven sigil" : "sigil " + (idx + 1)}</span></div>`;
      if (!fx) {
        c += `<div class="cmp-b"><span class="hint">No ${verumLabel()} complement for ${entry.name} yet.</span></div></div>`;
        return;
      }
      if (avail.length > 1) c += `<div class="cmp-b" style="padding-bottom:0"><div class="chips">` +
        avail.map(f => `<button class="chip${f.name === cs.compEffect ? " on" : ""}" onclick="selectCompEffect(${idx},'${escAttr(f.name)}')">${f.name}</button>`).join("") + `</div></div>`;
      c += `<div class="cmp-b">${resolve(partText(fx.effect))}` +
        liveUpgrades(fx.upgrades, tier).map(u => `<span class="cmp-up">${resolve(partText(u))}</span>`).join("") + `</div></div>`;
    });
    const free = maxComps() - state.complements.length;
    if (free > 0) c += `<p class="hint">${free} more sigil${free > 1 ? "s" : ""} available — add from the list on the left.</p>`;
    h += block("Sigils", c || `<p class="hint">No sigils yet. Add up to ${maxComps()} from the list on the left.</p>`);
  }
  return h;
}

function bumpSlotTo(n) {
  state.slotLevel = n;
  state.complements = state.complements.slice(0, maxComps());
  syncBar(); renderCogList(); renderMain();
}

function rulesDrawer() {
  return `<details class="rules"><summary>Rules of the seal</summary><div class="rules-b">
    <h3>Numbers</h3><ul>${RULES.numbers.map(([k, v]) => `<li><strong>${k}</strong> — ${v}</li>`).join("")}</ul>
    <p class="prem">${RULES.premium}</p>
    <h3>Limits</h3><ul>${RULES.limits.map(x => `<li>${x}</li>`).join("")}</ul>
    <h3>Countering</h3><ul>${RULES.countering.map(x => `<li>${x}</li>`).join("")}</ul>
  </div></details>`;
}

// ═══════════════════════════════════════════════════════════
//  SELECTION
// ═══════════════════════════════════════════════════════════
async function toggleCog(id) {
  if (state.mode === "ign") return toggleBurn(id);
  const entry = INDEX.find(c => c.id === id);
  if (!entry || !entry.ready) return;

  if (state.core === id) {
    // Deselect core → reset everything
    state.core = null; state.coreVerum = null; state.sealName = "";
    state.compType = null; state.compSub = null; state.complements = [];
  } else if (state.complements.some(x => x.id === id)) {
    // Remove complement
    state.complements = state.complements.filter(x => x.id !== id);
  } else if (!state.core) {
    // Set as core — always allowed
    await loadCognition(id);
    state.core = id;
    state.coreVerum = null;
    state.compType = null; state.compSub = null; state.complements = [];
  } else {
    // Add complement if slot allows — and never one that is always Core
    if (entry.coreOnly || state.complements.length >= maxComps()) return;
    await loadCognition(id);
    state.complements.push({ id, compEffect: null });
  }

  renderCogList();
  renderMain();
}

// Typing the name updates only the card, so the field you're typing in keeps its focus
function sealName(v) {
  state.sealName = v;
  if (!state.core || !state.compType || !state.compSub || !currentSub()) return;
  const seal = document.getElementById("sumBody"), coreCog = LOADED[state.core], tier = getTier(state.charLevel);
  seal.innerHTML = state.sumMode === "play" ? buildPlayCardHTML(coreCog, tier) : `<div class="raw">${buildFullRef(coreCog, tier).join("\n")}</div>`;
  seal.dataset.text = buildPlayCard(coreCog, tier).join("\n");
}

function clearAll() {
  if (state.mode === "ign") { state.ign.burning = []; renderCogList(); renderMain(); return; }   // Ignition: put every Burn out
  state.core = null; state.coreVerum = null; state.sealName = "";
  state.compType = null; state.compSub = null; state.complements = [];
  renderCogList(); renderMain();
}

// ═══════════════════════════════════════════════════════════
//  COMPOSITION SELECTION
// ═══════════════════════════════════════════════════════════
function selectCompType(type) {
  const coreCog0 = LOADED[state.core];
  state.compType = type;
  state.compSub  = availableSubs(coreCog0, type)[0] || Object.keys(COMP_DATA[type].subtypes)[0];
  state.complements = state.complements.map(c => ({ ...c, compEffect: null }));
  // Auto-select first verum effect for this composition type (pure state, not in render)
  state.shape = "sphere";
  if (!mannerAllowed(state.manner)) state.manner = "standard";
  const coreCog = LOADED[state.core];
  const effects = coreCog?.verumEffects?.[verumKey()] || [];
  state.coreVerum = effects.length > 0 ? effects[0].name : null;
  renderMain();
}

function selectCompSub(sub) {
  state.compSub = sub;
  state.shape = "sphere";
  if (!mannerAllowed(state.manner)) state.manner = "standard";
  const coreCog = LOADED[state.core];
  const effects = coreCog?.verumEffects?.[verumKey()] || [];
  if (!effects.find(e => e.name === state.coreVerum)) state.coreVerum = effects.length ? effects[0].name : null;
  renderMain();
}

function selectShape(sh)  { state.shape = sh; renderMain(); }
function selectPhase(i)   { state.phase = i; renderMain(); }
// A Core with a cycle (Lunar's phases): where it stands now, and what comes next
// Cognition-wide abilities the character has reached (mastery.traits, each with a level)
function masteryOf(cog) {
  return (cog?.mastery?.traits || []).filter(tr => (tr.level || 1) <= state.charLevel);
}
// A Core that keeps a running tally (Sun's Two Suns): this activation's number, Gold or Black,
// and — on the last one of the window — the Reckoning it brings
function trackerOf(cog) {
  const tr = cog?.engine?.tracker; if (!tr) return null;
  const win   = tr.window || 4;
  const marks = (state.track.marks || []).slice(0, win - 1);
  const n     = marks.length + 1;
  const now   = state.track.now === "black" ? "black" : "gold";
  const blacks = [...marks, now].filter(m => m === "black").length;
  const last  = n === win;
  const reck  = last ? (tr.reckoning || []).find(r => blacks >= r.min && blacks <= r.max) : null;
  return { tr, win, marks, n, now, blacks, last, reck };
}
function coreVerumOf(cog) {
  const vs = cog?.verumEffects?.[verumKey()] || [];
  return vs.find(v => v.name === state.coreVerum) || vs[0] || null;
}
// Click a logged pip to flip it Gold ↔ Black; the next empty pip logs a Gold; clicking the last logged one twice clears it
function markTrack(i) {
  const m = state.track.marks;
  if (i < m.length) { if (m[i] === "gold") m[i] = "black"; else m.splice(i); }
  else if (i === m.length) m.push("gold");
  renderMain();
}
function setTrackNow(v) { state.track.now = v; renderMain(); }
// After drawing: log this activation and move on (the Reckoning resets the window)
function logTrack() {
  const trk = trackerOf(LOADED[state.core]); if (!trk) return;
  state.track.marks = trk.last ? [] : [...trk.marks, trk.now];
  state.track.now = "gold";
  renderMain();
}
function resetTrack() { state.track = { marks: [], now: "gold" }; renderMain(); }
function phaseOf(cog) {
  const ph = cog?.engine?.phases; if (!ph?.length) return null;
  const i = Math.min(state.phase || 0, ph.length - 1);
  return { now: ph[i], next: ph[(i + 1) % ph.length], prev: ph[(i - 1 + ph.length) % ph.length], index: i, all: ph };
}
function selectManner(m)  {
  if (!mannerAllowed(m)) return;
  state.manner = m;
  state.complements = state.complements.slice(0, maxComps());
  syncBar(); renderCogList(); renderMain();
}

function selectCoreVerum(name) {
  state.coreVerum = name;
  renderMain();
}

function selectCompEffect(idx, name) {
  state.complements[idx].compEffect = name;
  renderMain();
}
