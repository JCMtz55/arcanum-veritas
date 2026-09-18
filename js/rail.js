// Arcanum Veritas Builder — The Cognition rail

// ═══════════════════════════════════════════════════════════
//  COGNITION RAIL
// ═══════════════════════════════════════════════════════════
// Walk the domains in order, emitting a heading and then that domain's matches.
// `render` turns one index entry into a button; both rails share the scaffolding.
function groupedRail(q, render) {
  let shown = 0, h = "";
  CAT_ORDER.forEach(key => {
    if (state.filter && state.filter !== key) return;
    const rows = INDEX.filter(c => catOf(c) === key && (!q || c.name.toLowerCase().includes(q)));
    if (!rows.length) return;
    h += `<div class="grp ${key}">${CATEGORIES[key].label}<i></i></div>`;
    rows.forEach(c => { shown++; h += render(c); });
  });
  // Anything the data forgot to categorise still has to be reachable
  const loose = INDEX.filter(c => !catOf(c) && (!q || c.name.toLowerCase().includes(q)));
  if (loose.length && (!state.filter || state.filter === "__none")) {
    h += `<div class="grp">Uncategorised<i></i></div>`;
    loose.forEach(c => { shown++; h += render(c); });
  }
  return { shown, h };
}

function renderFilter(selId) {
  const sel = document.getElementById(selId);
  if (!sel) return;
  const n = {};
  INDEX.forEach(c => { const k = catOf(c); if (k) n[k] = (n[k] || 0) + 1; });
  const loose = INDEX.filter(c => !catOf(c)).length;
  // Labels stay short so the closed control doesn't truncate in a 218px rail;
  // the domain's gloss rides on the title instead.
  sel.innerHTML =
    `<option value="">All domains · ${INDEX.length}</option>` +
    CAT_ORDER.filter(k => n[k]).map(k =>
      `<option value="${k}">${esc(CATEGORIES[k].label)} · ${n[k]}</option>`
    ).join("") +
    (loose ? `<option value="__none">Uncategorised · ${loose}</option>` : "");
  sel.value = state.filter || "";
  sel.className = "pick" + (state.filter ? " " + state.filter : "");
  const cat = CATEGORIES[state.filter];
  sel.title = cat ? `${cat.label} — ${cat.note}` : "Filter the rail by domain";
}
function setFilter(k) {
  state.filter = k || null;
  renderCogList(); renderCodexList();
}

function renderCogList() {
  const box = document.getElementById("cogList");
  if (!box) return;
  renderFilter("cogFilter");
  const q = (document.getElementById("cogSearch")?.value || "").trim().toLowerCase();
  if (state.mode === "ign") return renderBurnRail(box, q);   // Ignition: the rail Burns Cognitions
  const atCap = state.complements.length >= maxComps() && state.core !== null;
  const { shown, h } = groupedRail(q, c => {
    const isCore = state.core === c.id;
    const isComp = state.complements.some(x => x.id === c.id);
    const off = !c.ready || (!isCore && !isComp && (atCap || (state.core !== null && c.coreOnly)));
    const cls = isCore ? "core" : isComp ? "comp" : off ? "off" : "";
    const role = isCore ? "core" : isComp ? "sigil" : "";
    return `<button class="cog ${cls}" ${off && !isCore && !isComp ? "disabled" : ""}
      onclick="toggleCog('${escAttr(c.id)}')" title="${!c.ready ? c.name + " — not written yet" : c.coreOnly ? c.name + " — always Core, never a Sigil" : c.name}">
      <span class="ico">${cogIcon(c)}</span><span class="nm">${c.name}</span>
      ${c.favorite ? `<span class="cos" title="Player favourite — held to a higher power bar">★</span>` : ""}
      ${role ? `<span class="rl">${role}</span>` : state.dm && c.written === false ? `<span class="rl dm" title="Held back — visible in DM view only">DM</span>` : ""}</button>`;
  });
  box.innerHTML = shown ? h : `<div class="empty" style="padding:22px 8px">${emptyRail(q)}</div>`;
}

function emptyRail(q) {
  const f = state.filter ? (CATEGORIES[state.filter]?.label || "Uncategorised") : null;
  if (q && f)  return `No ${f} cognition matches “${esc(q)}”.`;
  if (q)       return `No cognition matches “${esc(q)}”.`;
  return `Nothing in ${f || "this filter"}.`;
}
