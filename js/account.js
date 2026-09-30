// Arcanum Veritas Builder — Sign-in, the account menu, and the DM's Admin tab.
// All of it is inert on a static host: nothing here runs unless boot() found the server's api/.

async function api(method, url, body) {
  const r = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Request failed (${r.status})`);
  return data;
}
function escQ(t) { return esc(t).replace(/"/g, "&quot;"); }
function showErr(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg || ""; el.hidden = !msg;
}

// ═══════════════════════════════════════════════════════════
//  SIGN-IN
// ═══════════════════════════════════════════════════════════
function showGate() {
  setStatus("", "");
  document.getElementById("gate").hidden = false;
  document.getElementById("gateUser").focus();
}
function signIn(e) {
  e.preventDefault();
  showErr("gateErr");
  api("POST", "api/login", {
    username: document.getElementById("gateUser").value,
    password: document.getElementById("gatePass").value,
  }).then(() => {
    document.getElementById("gate").hidden = true;
    document.getElementById("gatePass").value = "";
    boot();
  }).catch(err => showErr("gateErr", err.message));
  return false;
}
function showAccount() {
  document.getElementById("whoBtn").textContent = ME.displayName;
  document.getElementById("who").hidden = false;
  document.getElementById("tabAdmin").hidden = ME.role !== "dm";
  document.getElementById("tabLearn").hidden = ME.role === "dm";   // the DM has no character to track
  document.getElementById("saveBtn").hidden = document.getElementById("savedItem").hidden = false;
  loadSaves().catch(() => {});                                     // fills the composer's opening screen
  if (ME.role === "dm") refreshAdmin().catch(() => {});            // so the Admin tab can show its reminders
}
// ── The character's numbers — level, Verum mod, Dream mod — are remembered with the account.
// The slot is not: it belongs to the seal being drawn.
function applySheet(s) {
  if (!s) return;
  state.charLevel = s.charLevel; state.verumMod = s.verumMod; state.dreamMod = s.dreamMod;
  document.getElementById("vmInput").value = s.verumMod;
  document.getElementById("dsInput").value = s.dreamMod;
}
// Saved a moment after the last change, reading the bar as it stands then
let sheetTimer = null;
function saveSheet() {
  if (!API || !ME) return;
  clearTimeout(sheetTimer);
  sheetTimer = setTimeout(() => {
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v | 0));
    api("PUT", "api/sheet", { charLevel: state.charLevel, verumMod: clamp(state.verumMod, -2, 12), dreamMod: clamp(state.dreamMod, -2, 12) })
      .catch(err => toast(`Couldn't save your numbers — ${err.message}`));
  }, 700);
}

function openAccount() {
  document.getElementById("acctName").textContent = ME.displayName;
  showErr("acctErr");
  document.getElementById("acct").showModal();
}
function changePassword(e) {
  e.preventDefault();
  const cur = document.getElementById("acctCur"), next = document.getElementById("acctNew");
  api("POST", "api/password", { current: cur.value, next: next.value }).then(() => {
    cur.value = next.value = "";
    document.getElementById("acct").close();
    toast("Password changed");
  }).catch(err => showErr("acctErr", err.message));
  return false;
}
function signOut() {
  api("POST", "api/logout").finally(() => location.reload());
}

// ═══════════════════════════════════════════════════════════
//  ADMIN — players, and which Cognitions each may read
// ═══════════════════════════════════════════════════════════
const ADMIN = { users: [], sel: null };   // sel: a user id, "new", or "reminders"

// Reminders: a player has tracked a Cognition to 4/4 and it isn't enabled for them yet.
// A name the index doesn't know is listed apart — there is nothing to enable.
function adminPending(known = true) {
  return ADMIN.users.flatMap(u => u.learning
    .filter(l => l.depth === 4 && !!l.cognitionId === known && !u.cognitions.includes(l.cognitionId))
    .map(l => ({ user: u, ...l })));
}
function syncAdminTab() {
  const n = adminPending().length;
  document.getElementById("tabAdmin").textContent = n ? `Admin · ${n}` : "Admin";
  document.getElementById("whoBtn").textContent = n ? `${ME.displayName} · ${n}` : ME.displayName;   // seen without opening the menu
}
async function refreshAdmin() {
  ADMIN.users = (await api("GET", "api/admin/users")).users;
  syncAdminTab();
}
async function openAdmin() {
  if (ME?.role !== "dm") return setView("composer");
  try { await refreshAdmin(); } catch (err) { toast(err.message); }
  if (ADMIN.sel !== "new" && ADMIN.sel !== "reminders" && !ADMIN.users.some(u => u.id === ADMIN.sel))
    ADMIN.sel = adminPending().length ? "reminders" : (ADMIN.users.find(u => u.role === "player") || ADMIN.users[0] || {}).id ?? "new";
  renderAdminList(); renderAdmin();
}
function openAdminUser(id) {
  ADMIN.sel = id;
  if (state.view !== "admin") return setView("admin");
  renderAdminList(); renderAdmin();
  document.getElementById("adminBody").scrollTop = 0;
}

function renderAdminList() {
  const box = document.getElementById("adminList");
  const n = adminPending().length;
  box.innerHTML = `<button class="cog ${ADMIN.sel === "reminders" ? "core" : ""}" onclick="openAdminUser('reminders')">
      <span class="ico">✦</span><span class="nm">Reminders</span>${n ? `<span class="rl dm">${n}</span>` : ""}</button>
    <div class="grp">Accounts<i></i></div>` + ADMIN.users.map(u =>
    `<button class="cog ${ADMIN.sel === u.id ? "core" : ""}" onclick="openAdminUser(${u.id})" title="${escQ(u.username)}">
      <span class="ico">${u.role === "dm" ? "★" : "◆"}</span><span class="nm">${esc(u.displayName)}</span>
      <span class="rl ${u.role === "dm" ? "dm" : ""}">${u.role === "dm" ? "DM" : u.cognitions.length}</span></button>`).join("");
}

function renderAdmin() {
  const host = document.getElementById("adminBody");
  if (ADMIN.sel === "new") {
    host.innerHTML = `<div class="cdx"><div class="cdx-hd"><div><h1>New player</h1>
        <p class="cdx-desc">One account per player at the table. They start with no Cognitions.</p></div></div>
      <form class="adm-form" onsubmit="return adminCreate(event)">
        <label for="admNewUser">Username — what they type to sign in</label>
        <input class="search" id="admNewUser" autocapitalize="none" spellcheck="false" pattern="[A-Za-z0-9_\\-]{2,32}" required>
        <label for="admNewName">Name shown in the builder</label>
        <input class="search" id="admNewName" maxlength="60">
        <label for="admNewPass">Password — at least 8 characters; leave empty to set it later</label>
        <input class="search" id="admNewPass" type="text" autocomplete="off" minlength="8">
        <div class="acct-row"><button class="mini on" type="submit">Create player</button></div>
      </form></div>`;
    return;
  }
  if (ADMIN.sel === "reminders") {
    const todo = adminPending(), loose = adminPending(false);
    host.innerHTML = `<div class="cdx"><div class="cdx-hd"><div><h1>Reminders</h1>
        <p class="cdx-desc">Players who have tracked a Cognition to 4/4. Nothing opens for them until you enable it.</p></div></div>
      <div class="cdx-sec"><h2>Waiting to be enabled</h2>` +
      (todo.length ? `<div class="cdx-defs">` + todo.map(p =>
        `<div class="cdx-def"><b>${esc(p.user.displayName)}</b><span>has mastered <strong>${esc(p.name)}</strong></span>
          <button class="mini on" onclick="adminEnable(${p.user.id},'${escAttr(p.cognitionId)}')">Enable</button></div>`).join("") + `</div>`
        : `<div class="cdx-note"><p>Nothing is waiting.</p></div>`) + `</div>` +
      (loose.length ? `<div class="cdx-sec"><h2>Mastered, but not in the builder</h2>
        <p class="cdx-rings">These names match no Cognition in index.json, so there is nothing to enable.</p>
        <div class="cdx-defs">` + loose.map(p =>
          `<div class="cdx-def"><b>${esc(p.user.displayName)}</b><span>${esc(p.name)}</span></div>`).join("") + `</div></div>` : "") +
      `</div>`;
    return;
  }
  const u = ADMIN.users.find(x => x.id === ADMIN.sel);
  if (!u) { host.innerHTML = `<div class="empty">Pick an account from the left.</div>`; return; }
  const dm = u.role === "dm", has = new Set(u.cognitions);

  let h = `<div class="cdx"><div class="cdx-hd"><div>
      <h1>${esc(u.displayName)}</h1>
      <div class="c-tags" style="margin-top:9px">
        <span class="t">signs in as ${esc(u.username)}</span>
        <span class="t">${dm ? "Dungeon Master" : "player"}</span>
        ${dm ? "" : `<span class="t">${has.size} of ${INDEX.length} Cognitions</span>`}
        ${u.hasPassword ? "" : `<span class="t hot">no password yet — can't sign in</span>`}
      </div></div></div>

    <div class="cdx-sec"><h2>Account</h2>
      <div class="adm-line">
        <input class="search" id="admName" value="${escQ(u.displayName)}" maxlength="60" aria-label="Name shown in the builder">
        <button class="mini" onclick="adminRename(${u.id})">Rename</button>
      </div>
      <div class="adm-line">
        <input class="search" id="admPass" type="text" autocomplete="off" placeholder="New password — at least 8 characters" aria-label="New password">
        <button class="mini" onclick="adminSetPassword(${u.id})">Set password</button>
      </div>
      ${dm ? "" : `<div class="adm-line"><button class="mini adm-del" onclick="adminDelete(${u.id})">Delete this player</button></div>`}
    </div>`;

  if (dm) {
    h += `<div class="cdx-sec"><h2>Cognitions</h2>
      <div class="cdx-note"><p>The DM reads every Cognition, held-back ones included. There is nothing to grant.</p></div></div>`;
  } else {
    h += `<div class="cdx-sec"><h2>Cognitions</h2>
      <p class="cdx-rings">Click to grant or take away — it is saved at once. A Cognition that isn't granted never reaches this player's browser.
        <strong>Held back</strong> ones can be granted ahead of time: the player sees the name marked “soon”, and its text only once it is set <code>ready</code> in index.json.</p>`;
    CAT_ORDER.concat([null]).forEach(key => {
      const rows = INDEX.filter(c => catOf(c) === key);
      if (!rows.length) return;
      h += `<div class="grp ${key || ""}" style="padding-left:0">${key ? CATEGORIES[key].label : "Uncategorised"}<i></i></div><div class="chips">` +
        rows.map(c => `<button class="chip ${has.has(c.id) ? "on" : ""} ${c.written === false ? "held" : ""}"
          onclick="adminToggle(${u.id},'${escAttr(c.id)}',this)" aria-pressed="${has.has(c.id)}"
          title="${escQ(c.name)}${c.written === false ? " — held back (not ready)" : ""}">${esc(c.name)}</button>`).join("") + `</div>`;
    });
    h += `</div>`;
    h += renderParAdmin(u);
    // The player's own tracker, as they keep it — read-only here
    h += `<div class="cdx-sec"><h2>Learning — kept by ${esc(u.displayName)}</h2>` +
      (u.learning.length ? `<div class="cdx-defs">` + u.learning.map(l =>
        `<div class="cdx-def"><b>${esc(l.name)}</b><span><span class="pips-ro">${pipText(l.depth)}</span> ${l.depth}/4${
          l.depth === 4 ? (l.cognitionId ? " — waiting for you to enable it" : " — not in the builder") : ""}</span></div>`).join("") + `</div>`
        : `<div class="cdx-note"><p>Nothing tracked yet.</p></div>`) + `</div>`;
  }
  host.innerHTML = h + `</div>`;
}
function pipText(d) { return "▰".repeat(d) + "▱".repeat(4 - d); }

function adminEnable(userId, cogId) {
  api("PUT", `api/admin/users/${userId}/cognitions/${encodeURIComponent(cogId)}`)
    .then(() => { toast("Enabled"); return openAdmin(); }).catch(err => toast(err.message));
}

async function adminToggle(userId, cogId, btn) {
  const u = ADMIN.users.find(x => x.id === userId);
  const on = !u.cognitions.includes(cogId);
  btn.disabled = true;
  try {
    await api(on ? "PUT" : "DELETE", `api/admin/users/${userId}/cognitions/${encodeURIComponent(cogId)}`);
    u.cognitions = on ? u.cognitions.concat(cogId) : u.cognitions.filter(x => x !== cogId);
    if (on) u.learning = u.learning.filter(l => l.cognitionId !== cogId);   // the server drops it from their tracker
    syncAdminTab(); renderAdminList(); renderAdmin();
  } catch (err) { btn.disabled = false; toast(err.message); }
}
function adminCreate(e) {
  e.preventDefault();
  api("POST", "api/admin/users", {
    username: document.getElementById("admNewUser").value,
    displayName: document.getElementById("admNewName").value,
    password: document.getElementById("admNewPass").value || undefined,
  }).then(r => { ADMIN.sel = r.id; toast("Player created"); return openAdmin(); })
    .catch(err => toast(err.message));
  return false;
}
function adminRename(id) {
  api("PATCH", `api/admin/users/${id}`, { displayName: document.getElementById("admName").value })
    .then(() => { toast("Renamed"); return openAdmin(); }).catch(err => toast(err.message));
}
function adminSetPassword(id) {
  api("PATCH", `api/admin/users/${id}`, { password: document.getElementById("admPass").value })
    .then(() => { toast("Password set — pass it on to the player"); return openAdmin(); }).catch(err => toast(err.message));
}
function adminDelete(id) {
  const u = ADMIN.users.find(x => x.id === id);
  if (!confirm(`Delete ${u.displayName}'s account and everything granted to it?`)) return;
  api("DELETE", `api/admin/users/${id}`)
    .then(() => { ADMIN.sel = null; toast("Player deleted"); return openAdmin(); }).catch(err => toast(err.message));
}

// ═══════════════════════════════════════════════════════════
//  ADMIN — THE PARAGON PATH
// ═══════════════════════════════════════════════════════════
// The path is a choice of identity made with the DM, and a Paragon's abilities are written for
// them, so both live here rather than anywhere a player can reach. `draft` is the set being
// edited: text fields write straight into it so typing never costs the input its focus, and only
// structural changes (adding an ability, changing its type) redraw.
ADMIN.par = { draft: null, forUser: null };

const PAR_ADMIN_TYPES = { passive: "Passive", offensive: "Offensive", supportive: "Supportive" };
const PAR_ADMIN_ACTS  = { action: "Action", bonus: "Bonus Action", reaction: "Reaction" };
const PAR_SAVES = ["—", "Strength", "Dexterity", "Constitution", "Intelligence", "Wisdom", "Charisma"];

function parBlankAbility() {
  return { name: "", type: "passive", act: null, uses: "", text: "", ranks: ["", "", "", ""] };
}
function parBlankSet(cog) {
  return { cog: cog || "", name: "", flavor: "", save: "—", damage: "", warn: "", abilities: [parBlankAbility()] };
}

async function parAdminTogglePath(userId) {
  const u = ADMIN.users.find(x => x.id === userId);
  try {
    await api("PUT", `api/admin/users/${userId}/paragon`, { enabled: !u.paragon });
    u.paragon = !u.paragon;
    toast(u.paragon ? `${u.displayName} walks the Paragon path` : `${u.displayName} leaves the Paragon path`);
    renderAdmin();
  } catch (err) { toast(err.message); }
}

// Editing loads the set from the server, so the draft is the stored shape and nothing is guessed
async function parAdminEdit(userId, buildId) {
  try {
    const { builds } = await api("GET", `api/admin/users/${userId}/paragon`);
    const b = builds.find(x => x.id === buildId);
    if (!b) return toast("That ability set is gone — refresh.");
    const { id, cog, name, ...rest } = b;
    ADMIN.par = { forUser: userId, draft: { id, cog, name, warn: "", flavor: "", save: "—", damage: "", ...rest } };
    renderAdmin();
  } catch (err) { toast(err.message); }
}
function parAdminNew(userId, fromExample) {
  const eg = fromExample && PARAGON_EXAMPLES.find(x => x.name === fromExample);
  // Starting from an example copies its shape; the DM then makes it this character's own
  ADMIN.par = { forUser: userId, draft: eg
    ? JSON.parse(JSON.stringify({ cog: eg.cog, name: eg.name, flavor: eg.flavor, save: eg.save,
        damage: eg.damage, warn: "", abilities: eg.abilities }))
    : parBlankSet() };
  renderAdmin();
  document.getElementById("adminBody").scrollTop = 0;
}
function parAdminCancel() { ADMIN.par = { draft: null, forUser: null }; renderAdmin(); }

// Text fields write into the draft without redrawing — "abilities.0.ranks.2" addresses one line
function parAdminField(path, value) {
  const keys = path.split("."), d = ADMIN.par.draft;
  let o = d;
  for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]];
  o[keys[keys.length - 1]] = value;
}
function parAdminStructural(path, value) { parAdminField(path, value); renderAdmin(); }
function parAdminAddAbility() {
  if (ADMIN.par.draft.abilities.length >= 6) return toast("Six abilities is the most a set can hold");
  ADMIN.par.draft.abilities.push(parBlankAbility()); renderAdmin();
}
function parAdminRemoveAbility(i) {
  if (ADMIN.par.draft.abilities.length <= 1) return toast("A set needs at least one ability");
  ADMIN.par.draft.abilities.splice(i, 1); renderAdmin();
}

async function parAdminSave() {
  const { forUser, draft } = ADMIN.par;
  if (!draft.cog) return toast("Choose the Cognition this set belongs to");
  try {
    const { id, cog, name, ...data } = draft;
    await api("PUT", `api/admin/users/${forUser}/paragon/builds`, { id, cognitionId: cog, name, data });
    ADMIN.par = { draft: null, forUser: null };
    await refreshAdmin();
    toast(`Saved “${name}”`);
    renderAdminList(); renderAdmin();
  } catch (err) { toast(err.message); }
}
async function parAdminDelete(userId, buildId, label) {
  if (!confirm(`Delete the ability set “${label}”? This can't be undone.`)) return;
  try {
    await api("DELETE", `api/admin/users/${userId}/paragon/builds/${buildId}`);
    await refreshAdmin();
    toast("Deleted");
    renderAdminList(); renderAdmin();
  } catch (err) { toast(err.message); }
}

// ── The section itself, on a player's Admin page
function renderParAdmin(u) {
  const editing = ADMIN.par.draft && ADMIN.par.forUser === u.id;
  let h = `<div class="cdx-sec"><h2>Paragon path</h2>
    <p class="cdx-rings">The Paragon path is a choice of identity, not a lesson — you open it.
      While it's closed, ${esc(u.displayName)} can't reach Paragon mode at all. Their abilities are
      written here: a Paragon's power is <strong>built for them</strong>, so nothing is generated
      from a Cognition's JSON the way a seal's Verum Effects are.</p>
    <div class="adm-line" style="gap:9px">
      <button class="mini ${u.paragon ? "on" : ""}" onclick="parAdminTogglePath(${u.id})">
        ${u.paragon ? "✓ Walks the Paragon path" : "Open the Paragon path"}</button>
      ${u.paragon ? `<span class="hint" style="margin:0">Arcanum Veritas and Ignition stay reachable for them, with a note that the Arts don't share a body.</span>` : ""}
    </div>`;

  if (!u.paragon) return h + `</div>`;

  // What is written for them today
  const mine = u.paragonBuilds || [];
  h += `<h3 class="adm-sub">Ability sets — ${mine.length || "none"} written</h3>`;
  h += mine.length
    ? `<div class="cdx-defs">` + mine.map(b => {
        return `<div class="cdx-def"><b>${esc(b.name)}</b><span>Paragon of ${esc(INDEX.find(c => c.id === b.cog)?.name || b.cog)}</span>
          <button class="mini" onclick="parAdminEdit(${u.id}, ${b.id || 0})" ${b.id ? "" : "disabled"}>Edit</button>
          <button class="mini adm-del" onclick="parAdminDelete(${u.id}, ${b.id || 0}, '${escAttr(b.name)}')" ${b.id ? "" : "disabled"}>Delete</button></div>`;
      }).join("") + `</div>`
    : `<div class="cdx-note"><p>Nothing written yet. Until you write one, every Devotion ${esc(u.displayName)} swears will say so on its card.</p></div>`;

  if (!editing) {
    h += `<div class="chips" style="margin-top:10px">
      <button class="chip on" onclick="parAdminNew(${u.id})">＋ New ability set</button>
      <span class="chip-lbl">or start from an example</span>` +
      PARAGON_EXAMPLES.map(eg => `<button class="chip" onclick="parAdminNew(${u.id}, '${escAttr(eg.name)}')">${esc(eg.name)}</button>`).join("") +
      `</div>`;
    return h + `</div>`;
  }

  // ── The editor
  const d = ADMIN.par.draft;
  const granted = INDEX.filter(c => u.cognitions.includes(c.id));
  const cogs = granted.length ? granted : INDEX;
  h += `<div class="par-edit">
    <h3 class="adm-sub">${d.id ? "Editing" : "New ability set"}${d.wheel ? " · turns a wheel" : ""}</h3>
    <div class="par-grid">
      <label>Cognition
        <select class="pick" onchange="parAdminStructural('cog', this.value)">
          <option value="">— choose —</option>` +
          cogs.map(c => `<option value="${escAttr(c.id)}" ${d.cog === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("") +
        `</select>${granted.length ? "" : `<em class="par-note">This player has no Cognitions granted yet — the full list is shown.</em>`}</label>
      <label>Resonance — what this reading of it is called
        <input class="search" value="${escQ(d.name)}" placeholder="The Evergreen" oninput="parAdminField('name', this.value)"></label>
      <label>Save
        <select class="pick" onchange="parAdminField('save', this.value)">` +
          PAR_SAVES.map(s => `<option ${d.save === s ? "selected" : ""}>${s}</option>`).join("") + `</select></label>
      <label>Damage type
        <input class="search" value="${escQ(d.damage || "")}" placeholder="Necrotic" oninput="parAdminField('damage', this.value)"></label>
    </div>
    <label>Flavour — what it looks like while it burns
      <textarea class="search par-ta" rows="2" oninput="parAdminField('flavor', this.value)">${esc(d.flavor || "")}</textarea></label>
    <label>Warning — optional, shown on the card (e.g. a Pilgrimage still to make)
      <input class="search" value="${escQ(d.warn || "")}" oninput="parAdminField('warn', this.value)"></label>`;

  d.abilities.forEach((a, i) => {
    h += `<div class="par-ab ${a.type}" style="margin-top:14px">
      <div class="par-ab-h">
        <input class="search par-name" value="${escQ(a.name)}" placeholder="Ability name" oninput="parAdminField('abilities.${i}.name', this.value)">
        <select class="pick par-pick" onchange="parAdminStructural('abilities.${i}.type', this.value)">` +
          Object.entries(PAR_ADMIN_TYPES).map(([k, v]) => `<option value="${k}" ${a.type === k ? "selected" : ""}>${v}</option>`).join("") +
        `</select>` +
        (a.type === "passive"
          ? `<span class="t">always on — ends when they Rotate</span>`
          : `<select class="pick par-pick" onchange="parAdminField('abilities.${i}.act', this.value || null)">
               <option value="">no activation</option>` +
               Object.entries(PAR_ADMIN_ACTS).map(([k, v]) => `<option value="${k}" ${a.act === k ? "selected" : ""}>${v}</option>`).join("") +
             `</select>
             <input class="search par-uses" value="${escQ(a.uses || "")}" placeholder="uses, e.g. 1" oninput="parAdminField('abilities.${i}.uses', this.value)">`) +
        `<button class="mini adm-del" onclick="parAdminRemoveAbility(${i})" title="Remove this ability">✕</button>
      </div>
      <label>The rule — what it does
        <textarea class="search par-ta" rows="3" oninput="parAdminField('abilities.${i}.text', this.value)">${esc(a.text || "")}</textarea></label>
      <div class="par-ranks">` +
        [0, 1, 2, 3].map(r => `<label>${TIERS[r].label}
          <textarea class="search par-ta" rows="2" oninput="parAdminField('abilities.${i}.ranks.${r}', this.value)">${esc(a.ranks?.[r] || "")}</textarea></label>`).join("") +
      `</div></div>`;
  });

  h += `<div class="chips" style="margin-top:12px">
      <button class="chip" onclick="parAdminAddAbility()">＋ Add an ability</button></div>
    <p class="hint" style="font-style:normal;margin-top:10px">Write numbers as the rules do —
      <code>your Verum Modifier</code>, <code>twice your Verum Modifier</code>, <code>your proficiency bonus</code>,
      <code>5 × Proficiency Bonus</code>, <code>your Verum DC</code> — and the builder resolves them
      to the player's real numbers on the card.</p>
    <div class="acct-row" style="margin-top:12px">
      <button class="mini on" onclick="parAdminSave()">Save ability set</button>
      <button class="mini" onclick="parAdminCancel()">Cancel</button>
    </div></div>`;
  return h + `</div>`;
}
