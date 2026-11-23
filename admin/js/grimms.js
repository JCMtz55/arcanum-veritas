// Ephemer — Admin · THE GRIMMS
//
// The chains, each Grimm's Reality Shift and Shackle Break, and which of its abilities its user may
// compose. The Companion reads the same state through api/grimms/state; it used to carry these
// controls inline, and now only reads them. A hidden Shift's text is never sent to that player's
// browser.
//
// This section is the Grimms as THINGS — eight of them, worked one at a time, mostly between
// sessions. The two levers you reach for at the table, the chain count and the two reveals, also
// appear on their holder's own page: grimmMini() below is that panel, and both draw from this
// file's state, so they cannot disagree. The ability grid is not duplicated — it is forty buttons
// that belong to the Grimm rather than to the person, and the player page links here for it.

const GRIMMS = window.GRIMM_DATA || { grimms: [] };
// The same wording the Companion uses, so a chain reads the same to the DM and to its user
const CHAIN_STATE = ["Unchained", "Fraying", "Loosened", "Bound"];
const CHAIN_FX = {
  3: "The pact is whole. The Grimm behaves per its stage.",
  2: "The Grimm's voice grows more independent — it speaks unprompted, hesitates a half-beat, watches you when it thinks itself unobserved.",
  1: "The Grimm may act on its own once per session (DM). Its abilities run hot. Every Dream Saving Throw to hold the last chain is +2 to +5 DC.",
  0: "The user dies and the Grimm Unchains.",
};
// chains by Grimm id, and the DM's switches: "shift", "shackle", or "a:<ability id>"
let GRIMM_CHAINS = {}, GRIMM_TOGGLES = {};

onData(d => {
  GRIMM_CHAINS = d.grimms?.chains || {};
  GRIMM_TOGGLES = d.grimms?.toggles || {};
});

section("grimms", {
  mark: "⛓", label: "Grimms", title: "The Three Chains, the reveals and the ability grids",
  count: () => (GRIMMS.grimms || []).length,
  first: () => (GRIMMS.grimms || [])[0]?.id ?? null,
  rail: () => (GRIMMS.grimms || []).map(g => {
    const on = UI.sel === g.id;
    const n = grimmChains(g.id);
    return `<button class="cog ${on ? "core" : ""}" onclick="go('grimms','${escAttr(g.id)}')" title="${escQ(g.user)}">
      <span class="ico" style="color:${g.hue}">◈</span><span class="nm">${esc(g.name)}</span>
      <span class="rl ${n < 3 ? "dm" : ""}">${n}/3</span></button>`;
  }).join(""),
  body: () => (UI.sel ? renderGrimm(UI.sel) : `<div class="empty">Pick a Grimm from the left.</div>`),
});

function grimmById(id)   { return (GRIMMS.grimms || []).find(g => g.id === id); }
function grimmChains(id) { const n = GRIMM_CHAINS[id]; return n === undefined ? 3 : n; }
// Abilities are open unless the DM has switched one off; a Reality Shift stays hidden until revealed
function shiftOn(id)        { return GRIMM_TOGGLES[id]?.shift === true; }
// A Shackle Break is hidden until the DM says otherwise, the same as a Reality Shift
function shackleOn(id)      { return GRIMM_TOGGLES[id]?.shackle === true; }
function abilityOn(id, aid) { return GRIMM_TOGGLES[id]?.[`a:${aid}`] !== false; }

async function setChains(id, n) {
  n = Math.max(0, Math.min(3, n));
  if (n === grimmChains(id)) return;
  try {
    await api("PUT", `api/admin/grimms/${id}/chains`, { chains: n });
    GRIMM_CHAINS[id] = n;
    draw();                       // the rail carries the count, so both halves move
  } catch (err) { toast(err.message); }
}
async function setToggle(gid, key, enabled) {
  try {
    await api("PUT", `api/admin/grimms/${gid}/toggles/${encodeURIComponent(key)}`, { enabled });
    (GRIMM_TOGGLES[gid] = GRIMM_TOGGLES[gid] || {})[key] = enabled;
    drawBody();
  } catch (err) { toast(err.message); }
}

function chainIcons(n) {
  let h = "";
  for (let i = 0; i < 3; i++) h += `<span class="chain ${i >= n ? "broken" : ""}">⛓</span>`;
  return h;
}

// ── The chains, and the two reveals ────────────────────────
// Written once and shown twice: in full here, and folded onto its holder's page by grimmMini().
function chainBlock(id) {
  const n = grimmChains(id);
  return `<div class="cdx-sec"><h2>The Three Chains</h2>
    <p class="cdx-rings">Players see the chains on their sheet. Breaking one is the DM's to do.</p>
    <div class="adm-line" style="gap:12px">
      <div class="step"><button onclick="setChains('${escAttr(id)}',${n - 1})" aria-label="Break a chain">–</button><span>${n}</span><button onclick="setChains('${escAttr(id)}',${n + 1})" aria-label="Restore a chain">+</button></div>
      <span class="chains shown">${chainIcons(n)}</span>
      <span class="t">${esc(CHAIN_STATE[n])}</span>
    </div>
    <p class="hint" style="font-style:normal">${esc(CHAIN_FX[n])}</p></div>`;
}

function shiftBlock(g) {
  if (!g.shift) return "";
  const sh = shiftOn(g.id);
  return `<div class="cdx-sec"><h2>Reality Shift — ${esc(g.shift.name)}</h2>
    <p class="cdx-rings">While it's hidden its text never reaches that player's browser.</p>
    <div class="adm-line" style="gap:10px">
      <button class="mini ${sh ? "on" : ""}" onclick="setToggle('${escAttr(g.id)}','shift',${!sh})">
        ${sh ? "✓ Revealed" : "Reveal it"}</button>
      ${sh ? `<span class="hint" style="margin:0">Their sheet can read it now.</span>` : ""}
    </div></div>`;
}

// A Break's payload is withheld with it, and it is not the same payload for every Grimm: the
// Parted Gates carry twelve Servant forms, The Fallen Hero carries the two troops it puts on
// the field. Name what the lock actually covers, so the DM can see what flipping it hands over.
function shackleBlock(g) {
  if (!g.shackle) return "";
  const sb = shackleOn(g.id);
  const forms = (g.servants || []).filter(s => s.divine || s.forbidden).length;
  const secret = (g.troops || []).filter(t => t.secret === "shackle");
  const withheld = [
    forms ? `the ${forms} Divine and Forbidden Forms it transforms a Servant into` : "",
    secret.length ? `${secret.length === 1 ? "the troop" : `the ${secret.length} troops`} it puts on the field — <b>${secret.map(t => esc(t.name)).join("</b>, <b>")}</b>` : "",
  ].filter(Boolean);
  return `<div class="cdx-sec"><h2>Shackle Break — ${esc(g.shackle.name)}</h2>
    <p class="cdx-rings">While it's hidden its text never reaches that player's browser${
      withheld.length ? `, and neither does what it carries: ${withheld.join("; and ")}` : ""}.</p>
    <div class="adm-line" style="gap:10px">
      <button class="mini ${sb ? "on" : ""}" onclick="setToggle('${escAttr(g.id)}','shackle',${!sb})">
        ${sb ? "✓ Revealed" : "Reveal it"}</button>
      ${sb ? `<span class="hint" style="margin:0">Their sheet can run it now.</span>` : ""}
    </div>
    ${secret.length ? `<p class="hint" style="margin:9px 0 0">${sb
      ? `Their sheet now holds <b>${secret.map(t => esc(t.name)).join("</b> and <b>")}</b>. Neither can be picked as a job — the Break is the only thing that puts them on the field.`
      : `Revealing it also sends <b>${secret.map(t => esc(t.name)).join("</b> and <b>")}</b> to their browser. Until then their copy of the data has no record that either exists.`}</p>` : ""}
    </div>`;
}

function renderGrimm(id) {
  const g = grimmById(id);
  if (!g) return `<div class="empty">No such Grimm.</div>`;
  const n = grimmChains(id), sh = shiftOn(id), sb = shackleOn(id);
  // Which account holds it, so the Grimms section can hand you back to the person. Read through
  // grimmFor(), so this agrees with the player's own page whether the holder was assigned by the
  // DM or is still the inherited name match.
  const holder = (ADMIN.users || []).find(u => grimmFor(u)?.id === g.id);

  return `<div class="cdx"><div class="cdx-hd"><div>
      <h1 style="color:${g.hue}">${esc(g.name)}</h1>
      <p class="cdx-desc">${esc(g.user)}</p>
      <div class="c-tags" style="margin-top:9px">
        <span class="t">${esc(CHAIN_STATE[n])}</span>
        <span class="t">${g.abilities.length} abilities</span>
        ${g.shift ? `<span class="t ${sh ? "hot" : ""}">Reality Shift ${sh ? "revealed" : "hidden"}</span>` : ""}
        ${g.shackle ? `<span class="t ${sb ? "hot" : ""}">Shackle Break ${sb ? "revealed" : "hidden"}</span>` : ""}
      </div></div>
      ${holder ? `<div class="cdx-go"><button class="mini" onclick="go('players',${holder.id},'grimm')"
        title="Everything else about ${escQ(holder.displayName)} — their grants, their Servants, their character">
        ${esc(holder.displayName)} &rarr;</button></div>` : ""}</div>

    ${chainBlock(id)}
    ${shiftBlock(g)}
    ${shackleBlock(g)}

    <div class="cdx-sec"><h2>Abilities</h2>
      <p class="cdx-rings">Click to allow or deny. An ability switched off leaves that player's loadout and ability pool the next time their Companion loads.</p>
      <div class="chips">` + g.abilities.map(a => {
        const on = abilityOn(id, a.id);
        return `<button class="chip ${on ? "on" : ""}" onclick="setToggle('${escAttr(id)}','a:${escAttr(a.id)}',${!on})"
          title="${on ? "On — click to take it away" : "Off — click to give it back"}">${esc(a.name)}</button>`;
      }).join("") + `</div></div></div>`;
}

// ── The same Grimm, folded onto its holder's page ──────────
// The chain count and the two reveals, which are the levers you reach for while a session is
// running. Not the ability grid: forty buttons belong to the Grimm, not to the person, and a
// second copy of them is a second place to get it wrong.
function grimmMini(u) {
  const g = grimmFor(u);
  return grimmPick(u) + (g ? `<div class="cdx-sec">
      <h2>${esc(g.name)}</h2>
      <p class="cdx-rings" style="color:${g.hue}">${esc(g.user)} · ${g.abilities.length} abilities ·
        <button class="as-link" onclick="go('grimms','${escAttr(g.id)}')">open the full page for its abilities &rarr;</button></p>
    </div>
    ${chainBlock(g.id)}
    ${shiftBlock(g)}
    ${shackleBlock(g)}` : "");
}

// ── Who holds which Grimm ──────────────────────────────────
// The assignment itself. It used to be no decision at all: the account name was matched against the
// Grimm's `short` — a CHARACTER name hard-coded in grimms/tools/build-data.mjs — so a player's login
// had to be their character's name for ever, and renaming an account took their Grimm away without
// saying so. Two of the eight shorts are Salomon and Solomon.
//
// One holder per Grimm, so picking one already held moves it; the server answers with whose it was
// and the toast says so, rather than letting it happen quietly.
function grimmPick(u) {
  const g = grimmFor(u), assumed = grimmAssumed(u);
  const holderOf = {};
  for (const x of (ADMIN.users || [])) if (x.grimmId && x.id !== u.id) holderOf[x.grimmId] = x.displayName;

  return `<div class="cdx-sec"><h2>Whose Grimm</h2>
    <p class="cdx-rings">${assumed
      ? `Nothing is assigned, so this is still the old guess from the account name — <code>${esc(u.username)}</code>
         spells <b>${esc(g.short || "")}</b>. Click it to make it the DM's answer instead.`
      : g ? `Assigned by you. Their sheet and the Companion read this, not the account name.`
          : `No Grimm yet. Until one is picked their sheet shows no Grimm card.`}</p>
    <div class="chips">${(GRIMMS.grimms || []).map(x => {
      const on = g && g.id === x.id, held = holderOf[x.id];
      return `<button class="chip ${on ? "on" : ""}" onclick="setGrimmHolder(${u.id},'${escAttr(x.id)}')"
        title="${escQ(x.user)}${held ? ` — held by ${escQ(held)}; picking it moves it` : ""}"
        >${esc(x.name)}${held ? " ·" : ""}</button>`;
    }).join("")}</div>
    <div class="adm-line" style="gap:10px;margin-top:9px">
      <button class="mini ${g ? "" : "on"}" onclick="setGrimmHolder(${u.id},null)">No Grimm</button>
      ${Object.keys(holderOf).length
        ? `<span class="hint" style="margin:0">A Grimm marked · is held by someone else.</span>` : ""}
    </div></div>`;
}

async function setGrimmHolder(userId, grimm) {
  const u = userById(userId);
  if (!u) return;
  try {
    const r = await api("PUT", `api/admin/users/${userId}/grimm`, { grimm });
    // One holder per Grimm here too, so the page agrees with the server without a refetch
    if (grimm) for (const x of (ADMIN.users || [])) if (x.grimmId === grimm) x.grimmId = null;
    u.grimmId = grimm || null;
    const name = grimm ? (grimmById(grimm)?.name || grimm) : null;
    toast(!grimm ? `${u.displayName} holds no Grimm`
      : r?.movedFrom ? `${name} moves from ${r.movedFrom} to ${u.displayName}`
      : `${u.displayName} holds ${name}`);
    draw();                         // the header tags and the Grimms rail both read the holder
  } catch (err) { toast(err.message); }
}
