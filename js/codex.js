// Arcanum Veritas Builder — The Codex tab

// ═══════════════════════════════════════════════════════════
//  CODEX — one cognition, entire
// ═══════════════════════════════════════════════════════════
const VIEWS = { composer: "boardComposer", codex: "boardCodex", rings: "boardRings", damage: "boardDamage" };
const VIEW_TABS = { composer: "tabComposer", codex: "tabCodex", rings: "tabRings", damage: "tabDamage" };
function setView(v) {
  state.view = v;
  Object.entries(VIEWS).forEach(([k, id]) => document.getElementById(id).hidden = k !== v);
  Object.entries(VIEW_TABS).forEach(([k, id]) =>
    document.getElementById(id).className = "tab" + (k === v ? " on" : ""));
  if (v === "codex") {
    if (!state.codexId) {
      const first = state.core || (INDEX.find(c => c.ready) || {}).id;
      if (first) { openCodex(first); return; }
    }
    renderCodexList(); renderCodex();
  }
  if (v === "rings") {
    // Open on whatever the composer is already building, so the tabs stay in step
    if (!state.ringRef) state.ringRef = (state.compType && state.compSub)
      ? { type: state.compType, sub: state.compSub }
      : { type: "offensive", sub: "Direct Attack" };
    renderRingList(); renderRing();
  }
  if (v === "damage") { renderDamageList(); renderDamage(); }
}

function renderCodexList() {
  const box = document.getElementById("codexList");
  if (!box) return;
  renderFilter("codexFilter");
  const q = (document.getElementById("codexSearch")?.value || "").trim().toLowerCase();
  const { shown, h } = groupedRail(q, c => {
    const on = state.codexId === c.id;
    return `<button class="cog ${on ? "core" : c.ready ? "" : "off"}" ${c.ready ? "" : "disabled"}
      onclick="openCodex('${escAttr(c.id)}')" title="${c.ready ? c.name : c.name + " — not written yet"}">
      <span class="ico">${cogIcon(c)}</span><span class="nm">${c.name}</span>
      ${c.favorite ? `<span class="cos" title="Player favourite — held to a higher power bar">★</span>` : ""}
      ${c.ready ? (state.dm && c.written === false ? `<span class="rl dm" title="Held back — visible in DM view only">DM</span>` : "") : `<span class="rl">soon</span>`}</button>`;
  });
  box.innerHTML = shown ? h : `<div class="empty" style="padding:22px 8px">${emptyRail(q)}</div>`;
}

async function openCodex(id) {
  const entry = INDEX.find(c => c.id === id);
  if (!entry || !entry.ready) return;
  await loadCognition(id);
  state.codexId = id;
  renderCodexList();
  renderCodex();
  document.getElementById("codexBody").scrollTop = 0;
}

// Which Rings actually draw on a given pool for this cognition — the fallback map made visible
function ringsUsing(cog, pool) {
  const out = [];
  Object.entries(COMP_DATA).forEach(([k, d]) => {
    const subs = Object.keys(d.subtypes).filter(sk => poolFor(cog, k, sk) === pool);
    if (!subs.length) return;
    out.push(subs.length === Object.keys(d.subtypes).length
      ? d.label
      : `${d.label} (${subs.join(", ")})`);
  });
  return out;
}

function renderCodex() {
  const host = document.getElementById("codexBody");
  if (!host) return;
  const entry = INDEX.find(c => c.id === state.codexId);
  const cog   = LOADED[state.codexId];
  if (!entry || !cog) {
    host.innerHTML = `<div class="empty">Pick a cognition from the left to read it in full.</div>`;
    return;
  }
  const tier = getTier(state.charLevel);
  const opp  = INDEX.find(c => c.id === cog.opposing);

  let h = `<div class="cdx">
    <div class="cdx-hd"><div class="cdx-ico">${cogIcon(entry)}</div><div>
      <h1>${esc(entry.name)}</h1>
      ${cog.description ? `<p class="cdx-desc">${esc(cog.description)}</p>` : ""}
      <div class="c-tags">
        ${catOf(entry) ? `<span class="t dom ${entry.category}">${esc(CATEGORIES[entry.category].label)}</span>` : ""}
        ${entry.favorite ? `<span class="t hot">★ player favourite</span>` : ""}
        ${cog.savingThrow ? `<span class="t">${esc(cog.savingThrow)} save</span>` : ""}
        ${cog.damageType  ? `<span class="t hot">${esc(cog.damageType)}</span>` : ""}
        ${absoluteName(cog.damageType) ? (IRRESISTIBLE.has(baseType(cog.damageType)) ? `<span class="t hot" title="Irresistible — nothing resists, reduces or absorbs it">born Absolute</span>`
          : `<span class="t hot" title="Absolute damage — resistance and immunity only reduce it, by 2× / 4× the target's PB">→ ${esc(absoluteName(cog.damageType))} from Lv ${TIERS[earliestAbsolute(cog)].min}</span>`) : ""}
        ${opp ? `<span class="t">opposed by ${esc(opp.name)}</span>` : ""}
      </div>
    </div></div>`;

  // ── What using it costs, before what it does
  if (cog.cost) h += `<div class="cdx-sec"><h2>Cost of use</h2>
    <div class="cdx-note"><p>${esc(resolve(partText(cog.cost)))}</p></div></div>`;

  // ── Cognition-wide abilities, by the level that unlocks them
  if (cog.mastery?.traits?.length) h += `<div class="cdx-sec"><h2>${esc(cog.mastery.title || "Mastery")}</h2>` +
    (cog.mastery.text ? `<div class="cdx-note"><p>${esc(resolve(cog.mastery.text))}</p></div>` : "") +
    `<div class="cdx-defs mastery" style="margin-top:11px">` + cog.mastery.traits.map(tr =>
      `<div class="cdx-def"><b>${esc(tr.name)}<span class="unlock">Lv ${tr.level || 1}+</span></b><span>${esc(resolve(tr.text))}</span></div>`).join("") +
    `</div></div>`;

  // ── A cycle the Cognition runs on (Lunar's phases), each phase and its gift
  if (cog.engine) h += `<div class="cdx-sec"><h2>${esc(cog.engine.title)}</h2>
    <div class="cdx-note"><p>${esc(resolve(cog.engine.text))}</p></div>` +
    (cog.engine.tracker?.reckoning?.length ? `<div class="cdx-defs" style="margin-top:11px">` + cog.engine.tracker.reckoning.map(r =>
      `<div class="cdx-def"><b>${r.min === r.max ? r.min : r.min + "–" + r.max} Black</b><span><strong>${esc(r.name)}</strong> — ${esc(resolve(r.card))}</span></div>`).join("") + `</div>` : "") +
    (cog.engine.phases?.length ? `<div class="cdx-defs" style="margin-top:11px">` + cog.engine.phases.map(ph =>
      `<div class="cdx-def"><b>${esc(ph.name)}</b><span><em>${esc(ph.epithet || "")}</em> — ${esc(resolve(ph.card))}</span></div>`).join("") + `</div>` : "") +
    `</div>`;

  // ── Verum effects, pool by pool
  const POOLS = ["offensive","supportive","control","creation","utility"];
  let any = false;
  POOLS.forEach(pool => {
    const fx = cog.verumEffects?.[pool] || [];
    if (!fx.length) return;
    any = true;
    const d = COMP_DATA[pool];
    h += `<div class="cdx-sec"><h2 class="${d.color}">${d.icon} ${d.label} verum</h2>
      <p class="cdx-rings">Rings: ${esc(ringsUsing(cog, pool).join(" · ")) || "—"}</p>`;
    fx.forEach(e => {
      h += `<div class="cdx-fx"><div class="cdx-fx-h"><b>${esc(e.name)}</b>` +
           (e.fuel ? `<span class="t hot" style="margin:0 0 0 8px">Cost ${e.fuel} Corruption</span>` : "") +
           (e.description ? `<span>${esc(e.description)}</span>` : "") + `</div><div class="ladder">` +
        (e.tiers || []).map((t, i) =>
          `<div class="rung ${i === tier ? "now" : ""}"><span class="lv">${TIERS[i]?.label || ""}</span>
           <span>${esc(resolve(partText(t)))}</span></div>`).join("") + `</div>` +
        (e.corona ? `<div class="cdx-corona"><b>☀ Corona — ${esc(e.corona.name)}</b><span>${esc(resolve(e.corona.text))}</span></div>` : "") + `</div>`;
    });
    h += `</div>`;
  });
  if (!any) h += `<p class="cdx-soon">No Verum effects written for ${esc(entry.name)} yet.</p>`;

  // ── Complement effects, grouped the same way
  const comps = cog.complementEffects || [];
  if (comps.length) {
    h += `<div class="cdx-sec"><h2>◆ Complement effects — as a Sigil</h2>
      <p class="cdx-rings">What ${esc(entry.name)} contributes to someone else's seal.</p></div>`;
    POOLS.forEach(pool => {
      const label = COMP_DATA[pool].label;
      const mine  = comps.filter(f => String(f.type).toLowerCase() === label.toLowerCase());
      if (!mine.length) return;
      h += `<div class="cdx-sec"><h2 class="${COMP_DATA[pool].color}">${label} sigil</h2>`;
      mine.forEach(f => {
        h += `<div class="cdx-fx"><div class="cdx-fx-h"><b>${esc(f.name)}</b>` +
             (f.description ? `<span>${esc(f.description)}</span>` : "") + `</div>
             <div class="cmp-b">${esc(resolve(partText(f.effect)))}` +
             (f.upgrades || []).map(u => `<span class="cdx-up">${esc(resolve(partText(u)))}</span>`).join("") +
             `</div></div>`;
      });
      h += `</div>`;
    });
  }

  host.innerHTML = h + `</div>`;
}
