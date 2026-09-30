// Arcanum Veritas Builder — What a signed-in player keeps on their account:
// the Learning tab (their own tracker of Cognitions in progress) and saved seals and Eidons.

// ═══════════════════════════════════════════════════════════
//  LEARNING — the player's own tracker
// ═══════════════════════════════════════════════════════════
// It opens nothing in the builder. At 4/4 the DM is reminded, and the DM enabling the Cognition
// is what moves it from here into the rail.
let LEARNING = [], LEARN_NAMES = [];   // LEARN_NAMES: what the name field suggests — names only
const DEPTH_NOTE = ["not begun", "Learn ¼ — rituals only", "Learn ½ — as a secondary Cognition", "past ½", "Learn Full"];

async function openLearning() {
  if (!API || ME.role === "dm") return setView("composer");
  try {
    LEARNING = (await api("GET", "api/learning")).learning;
    LEARN_NAMES = (await api("GET", "api/learning/names")).names;
  } catch (err) { toast(err.message); }
  renderLearning();
}

function renderLearning() {
  const host = document.getElementById("learnBody");
  const going = LEARNING.filter(l => l.depth < 4), done = LEARNING.filter(l => l.depth === 4);
  const row = l => `<div class="cdx-def lrn"><b>${esc(l.name)}</b>
      <span><span class="pips">${[1, 2, 3, 4].map(i =>
        `<button class="lpip ${i <= l.depth ? "on" : ""}" onclick="setDepth('${escAttr(l.name)}',${i === l.depth ? i - 1 : i})" aria-label="${esc(l.name)} ${i} of 4"></button>`).join("")}</span>
        <em>${l.depth}/4 · ${l.depth === 4 ? "mastered — waiting for the DM to enable it" : DEPTH_NOTE[l.depth]}</em></span>
      <button class="mini" onclick="dropLearning('${escAttr(l.name)}')" title="Stop tracking ${escQ(l.name)}">Remove</button></div>`;

  host.innerHTML = `<div class="cdx"><div class="cdx-hd"><div><h1>Learning</h1>
      <p class="cdx-desc">Your own record of the Cognitions you are working toward. Click a mark to set how far you are; click the last one again to step back.</p></div></div>

    <div class="cdx-sec"><h2>In progress</h2>` +
      (going.length ? `<div class="cdx-defs">${going.map(row).join("")}</div>` : `<div class="cdx-note"><p>Nothing in progress.</p></div>`) + `
      <form class="adm-line" onsubmit="return addLearning(event)">
        <input class="search" id="lrnName" list="lrnNames" autocomplete="off" maxlength="40" placeholder="A Cognition you have begun to learn" aria-label="Cognition name" required>
        <datalist id="lrnNames">${LEARN_NAMES.filter(n => !LEARNING.some(l => l.name.toLowerCase() === n.toLowerCase()))
          .map(n => `<option value="${escQ(n)}"></option>`).join("")}</datalist>
        <button class="mini" type="submit">Track</button>
      </form></div>` +

    (done.length ? `<div class="cdx-sec"><h2>Mastered — waiting for the DM</h2>
      <p class="cdx-rings">Your DM has been told. It appears in the builder once they enable it.</p>
      <div class="cdx-defs">${done.map(row).join("")}</div></div>` : "") +

    `<div class="cdx-sec"><h2>Mastered · ${INDEX.length}</h2><div class="c-tags">` +
      (INDEX.map(c => `<span class="t dom ${catOf(c) || ""}">${esc(c.name)}</span>`).join("") || `<span class="t">none yet</span>`) +
    `</div></div></div>`;
}

function saveDepth(name, depth) {
  return api("PUT", "api/learning", { name, depth }).then(openLearning).catch(err => toast(err.message));
}
function setDepth(name, depth) { saveDepth(name, depth); }
function addLearning(e) {
  e.preventDefault();
  const name = document.getElementById("lrnName").value.trim();
  if (LEARNING.some(l => l.name.toLowerCase() === name.toLowerCase())) toast(`${name} is already on your tracker`);
  else saveDepth(name, 1);
  return false;
}
function dropLearning(name) {
  api("DELETE", `api/learning/${encodeURIComponent(name)}`).then(openLearning).catch(err => toast(err.message));
}

// ═══════════════════════════════════════════════════════════
//  SAVED BUILDS — seals and Eidons, private to the account
// ═══════════════════════════════════════════════════════════
// A save is the recipe, not the character: level and modifiers stay whatever the bar says, so a
// saved build grows with you. An Eidon also keeps its count of successful manifestations.
let SAVES = null;
async function loadSaves(fresh) {
  if (fresh || !SAVES) { SAVES = (await api("GET", "api/saves")).saves; if (INDEX.length) renderMain(); }
  return SAVES;
}
function saveAbout(s) {
  const nameOf = id => INDEX.find(c => c.id === id)?.name || id;
  return s.kind === "seal"
    ? `${nameOf(s.data.core)} · ${COMP_DATA[s.data.compType]?.label || ""} ${s.data.compSub || ""} · ${ORDINALS[s.data.slotLevel] || ""} slot`
    : (s.data.burning || []).filter(b => b.inEidon).map(b => nameOf(b.id)).join(" + ");
}
// The composer's opening screen, before anything is picked: this mode's saved builds as cards,
// one click to load. Nothing at all until something is saved (or on a static host).
function savedHome() {
  const ign = state.mode === "ign", rows = (SAVES || []).filter(s => s.kind === (ign ? "eidon" : "seal"));
  if (!rows.length) return "";
  return `<div class="blk saved-home"><div class="blk-h"><h2>Your saved ${ign ? "Eidons" : "seals"}</h2><div class="rule"></div>
      <button class="saved-m" onclick="openSaves()" title="Delete saved builds">manage</button></div>
    <div class="rings">` + rows.map(s => `<button class="ring" onclick="loadSave(${s.id})">
      <b>${esc(s.name)}</b><span>${esc(saveAbout(s))}</span></button>`).join("") + `</div></div>`;
}

function sealSnapshot() {
  if (!state.core || !state.compType || !state.compSub) return null;
  const { slotLevel, core, coreVerum, compType, compSub, complements, shape, manner, phase } = state;
  return { slotLevel, core, coreVerum, compType, compSub, complements, shape, manner, phase };
}
function eidonSnapshot() {
  const I = state.ign;
  if (!asEidonSlot(() => eidon()).ok) return null;
  return { burning: I.burning.map(b => ({ id: b.id, inEidon: b.inEidon })), template: I.template, act: I.act,
           spend: I.spend, verums: I.verums, forge: I.forge, successes: I.successes };
}

async function saveBuild() {
  const ign = state.mode === "ign", kind = ign ? "eidon" : "seal";
  const data = ign ? eidonSnapshot() : sealSnapshot();
  if (!data) return toast(ign ? "Build an Eidon first" : "Draw a seal first");
  let name = (ign ? state.ign.name : state.sealName || "").trim();
  if (!name) {
    name = (prompt(`Name this ${ign ? "Eidon" : "seal"} to save it`) || "").trim();
    if (!name) return;
    if (ign) state.ign.name = name; else state.sealName = name;
    renderMain();
  }
  try {
    const old = (await loadSaves()).find(s => s.kind === kind && s.name.toLowerCase() === name.toLowerCase());
    if (old && !confirm(`Replace your saved ${ign ? "Eidon" : "seal"} “${old.name}”?`)) return;
    await (old ? api("PUT", `api/saves/${old.id}`, { name, data }) : api("POST", "api/saves", { kind, name, data }));
    await loadSaves(true);
    toast(`Saved “${name}”`);
  } catch (err) { toast(err.message); }
}

async function openSaves() {
  try { await loadSaves(true); } catch (err) { return toast(err.message); }
  renderSaves();
  const dlg = document.getElementById("savesDlg");
  if (!dlg.open) dlg.showModal();
}
function renderSaves() {
  const group = (kind, title) => {
    const rows = SAVES.filter(s => s.kind === kind);
    return `<h3>${title}</h3>` + (rows.length ? `<div class="cdx-defs">` + rows.map(s =>
      `<div class="cdx-def"><b>${esc(s.name)}</b><span>${esc(saveAbout(s))}</span>
        <button class="mini on" onclick="loadSave(${s.id})">Load</button>
        <button class="mini" onclick="deleteSave(${s.id})">Delete</button></div>`).join("") + `</div>`
      : `<p class="hint">None saved yet — build one and press Save.</p>`);
  };
  document.getElementById("savesBody").innerHTML = group("seal", "Seals") + group("eidon", "Eidons");
}

async function loadSave(id) {
  const s = SAVES.find(x => x.id === id); if (!s) return;
  const d = s.data;
  const ids = s.kind === "seal" ? [d.core, ...(d.complements || []).map(c => c.id)] : (d.burning || []).map(b => b.id);
  const gone = ids.filter(cid => !INDEX.find(c => c.id === cid)?.ready);
  if (gone.length) return toast(`Can't load “${s.name}” — ${gone.join(", ")} isn't open to you`);
  await Promise.all(ids.map(loadCognition));
  if (ids.some(cid => !LOADED[cid])) return toast(`Couldn't load “${s.name}”`);

  if (s.kind === "seal") {
    Object.assign(state, {
      slotLevel: Math.min(9, Math.max(1, d.slotLevel | 0)), core: d.core, coreVerum: d.coreVerum || null,
      compType: d.compType, compSub: d.compSub, complements: d.complements || [],
      shape: d.shape || "sphere", manner: d.manner || "standard", phase: d.phase || 0, sealName: s.name,
    });
    if (state.mode === "ign") setMode("av", true);
  } else {
    Object.assign(state.ign, {
      burning: d.burning.map(b => ({ id: b.id, rounds: BURN_ROUNDS, inEidon: !!b.inEidon })),
      template: d.template || null, act: d.act || null, spend: d.spend || {}, verums: d.verums || {},
      forge: !!d.forge, successes: d.successes || 0, name: s.name, burnedRound: false, eidonRound: false, last: null,
    });
    if (state.mode !== "ign") setMode("ign", true);
  }
  document.getElementById("savesDlg").close();
  setView("composer");
  syncBar(); renderCogList(); renderMain();
  toast(`Loaded “${s.name}”`);
}
function deleteSave(id) {
  const s = SAVES.find(x => x.id === id);
  if (!s || !confirm(`Delete your saved “${s.name}”?`)) return;
  api("DELETE", `api/saves/${id}`).then(() => loadSaves(true)).then(renderSaves).catch(err => toast(err.message));
}
