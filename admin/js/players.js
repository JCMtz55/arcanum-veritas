// Ephemer — Admin · THE PLAYERS
//
// One page per person, and everything about that person on it. It used to take three rows of one
// rail to see a player whole: their grants under Accounts, their Grimm under Grimms, their
// character on the board — three places, no link between them, and the account name quietly doing
// the joining in two of the three. Now the account is the subject and the rest hangs off it.
//
// The page is tabbed rather than scrolled. The old one stacked seven sections in a single column,
// the third of which was a hundred Cognition chips, so everything after the Cognitions was below
// a screen and a half of buttons. A tab is cheap and the sections were already separate things.
//
//   Account     name, password, deletion
//   Character   their card off the live board, with the same Level/Dream/Fate controls
//   Cognitions  the grant grid, alone on a tab at last
//   Ignitions   what has been written for them, and what is switched on
//   Paragon     the path, the Devotions, the Pilgrimage
//   Grimm       their Grimm's chains and its two reveals (the ability grid stays in Grimms)
//   Servants    their roster, as grimm_souls holds it
//
// The DM's own account gets the Account tab and nothing else: the DM reads every Cognition, holds
// no Grimm through this page and keeps no tracker, so the other six would all say "not applicable".

const ADMIN = { users: [] };

onData(d => { ADMIN.users = d.users || []; });

section("players", {
  mark: "◆", label: "Players", title: "One page per player — grants, Grimm, Servants and their character",
  count: () => ADMIN.users.filter(u => u.role !== "dm").length,
  first: () => String((ADMIN.users.find(u => u.role === "player") || ADMIN.users[0] || {}).id ?? "new"),
  rail: () => ADMIN.users.map(u => {
    const waiting = pendingFor(u).length + (u.pilgrimage || []).length;
    return `<button class="cog ${UI.sel === String(u.id) ? "core" : ""}" onclick="go('players',${u.id})"
      title="${escQ(u.username)}${u.paragon ? " — walks the Paragon path" : ""}">
      <span class="ico">${u.role === "dm" ? "★" : u.paragon ? "✦" : "◆"}</span>
      <span class="nm">${esc(u.displayName)}</span>
      <span class="rl ${waiting ? "dm" : ""}">${u.role === "dm" ? "DM" : waiting ? `${waiting} ✦` : u.cognitions.length}</span></button>`;
  }).join(""),
  railFoot: () => `<button class="ghost ${UI.sel === "new" ? "on" : ""}" onclick="go('players','new')">New player</button>`,
  body: () => renderPlayer(),
});

const userById = id => (ADMIN.users || []).find(u => String(u.id) === String(id));

// ── The tabs ───────────────────────────────────────────────
const PLAYER_TABS = [
  { key: "cognitions", label: "Cognitions", n: u => u.cognitions.length },
  { key: "ignitions",  label: "Ignitions",  n: u => (u.ignitions || []).length },
  { key: "paragon",    label: "Paragon",    n: u => (u.sworn || []).length || null, hot: u => (u.pilgrimage || []).length },
  { key: "grimm",      label: "Grimm" },
  { key: "servants",   label: "Servants" },
  { key: "character",  label: "Character" },
  { key: "account",    label: "Account" },
];
// Granting a Cognition is what you come here to do nine times in ten, so that is where you land.
const DEFAULT_TAB = "cognitions";

function renderPlayer() {
  if (UI.sel === "new") return renderNewPlayer();
  const u = userById(UI.sel);
  if (!u) return `<div class="empty">Pick a player from the left.</div>`;
  const dm = u.role === "dm";
  const tabs = dm ? [] : PLAYER_TABS;
  const tab = dm ? "account" : (tabs.some(t => t.key === UI.tab) ? UI.tab : DEFAULT_TAB);

  const g = grimmFor(u), chars = partyOf(u.id);
  let h = `<div class="cdx"><div class="cdx-hd"><div>
      <h1>${esc(u.displayName)}</h1>
      <div class="c-tags" style="margin-top:9px">
        <span class="t">signs in as ${esc(u.username)}</span>
        <span class="t">${dm ? "Dungeon Master" : "player"}</span>
        ${dm ? "" : `<span class="t">${u.cognitions.length} of ${INDEX.length} Cognitions</span>`}
        ${u.paragon ? `<span class="t">Paragon — ${(u.sworn || []).length} of 3 sworn</span>` : ""}
        ${g ? `<span class="t" style="color:${g.hue}">${esc(g.name)} · ${grimmChains(g.id)}/3 chains</span>` : ""}
        ${chars.map(c => `<span class="t">${esc(c.name)} · Lv ${c.level}</span>`).join("")}
        ${u.hasPassword ? "" : `<span class="t hot">no password yet — can't sign in</span>`}
      </div></div></div>`;

  if (!dm) {
    h += `<nav class="a-tabs" aria-label="${escQ(u.displayName)}">` + tabs.map(t => {
      const n = t.n?.(u), hot = t.hot?.(u);
      return `<button class="a-tab ${tab === t.key ? "on" : ""}" onclick="goTab('${t.key}')"
        ${tab === t.key ? 'aria-current="true"' : ""}>${esc(t.label)}
        ${hot ? `<span class="a-n hot">${hot}</span>` : n ? `<span class="a-n">${n}</span>` : ""}</button>`;
    }).join("") + `</nav>`;
  }

  h += ({
    account:    () => tabAccount(u),
    character:  () => tabCharacter(u, chars),
    cognitions: () => tabCognitions(u),
    ignitions:  () => tabIgnitions(u),
    paragon:    () => tabParagon(u),
    grimm:      () => grimmMini(u),
    servants:   () => tabServants(u),
  }[tab] || (() => ""))();

  return h + `</div>`;
}

function renderNewPlayer() {
  return `<div class="cdx"><div class="cdx-hd"><div><h1>New player</h1>
      <p class="cdx-desc">One account per player at the table. They start with no Cognitions.</p></div></div>
    <form class="adm-form" onsubmit="return adminCreate(event)">
      <label for="admNewUser">Username — what they type to sign in</label>
      <input class="search" id="admNewUser" autocapitalize="none" spellcheck="false" pattern="[A-Za-z0-9_\\-]{2,32}" required>
      <label for="admNewName">Name shown in the builder</label>
      <input class="search" id="admNewName" maxlength="60">
      <label for="admNewPass">Password — at least 8 characters; leave empty to set it later</label>
      <input class="search" id="admNewPass" type="text" autocomplete="off" minlength="8">
      <div class="acct-row"><button class="mini on" type="submit">Create player</button></div>
    </form>
    <div class="cdx-sec"><div class="cdx-note"><p>The account name is also what ties this player to
      their <strong>Grimm</strong> — the Companion's data carries a short name per Grimm, and the two
      are matched on it. Name the account the way the Grimm's <code>short</code> reads.</p></div></div>
    </div>`;
}

// ── Account ────────────────────────────────────────────────
function tabAccount(u) {
  const dm = u.role === "dm";
  return `<div class="cdx-sec"><h2>Account</h2>
      <div class="adm-line">
        <input class="search" id="admName" value="${escQ(u.displayName)}" maxlength="60" aria-label="Name shown in the builder">
        <button class="mini" onclick="adminRename(${u.id})">Rename</button>
      </div>
      <div class="adm-line">
        <input class="search" id="admPass" type="text" autocomplete="off" placeholder="New password — at least 8 characters" aria-label="New password">
        <button class="mini" onclick="adminSetPassword(${u.id})">Set password</button>
      </div>
      ${dm ? "" : `<div class="adm-line"><button class="mini adm-del" onclick="adminDelete(${u.id})">Delete this player</button></div>`}
    </div>
    ${dm ? `<div class="cdx-sec"><h2>What the DM sees</h2>
      <div class="cdx-note"><p>Every Cognition, held-back ones included — there is nothing to grant.
        The Grimms are on their own section, and the characters are on the board.</p></div></div>` : ""}`;
}

// ── Character ──────────────────────────────────────────────
// The same card and the same three controls as the board, because they are the same call on the
// same endpoint. Here so that a level granted between sessions doesn't mean opening the board,
// finding the row and losing the page you were on.
function tabCharacter(u, chars) {
  if (!chars.length)
    return `<div class="cdx-sec"><h2>Character</h2>
      <div class="cdx-note"><p>${esc(u.displayName)} has no character yet. They make their own from the
        <strong>Character Sheet</strong>; the level, the Dream score and any Fate are yours to grant
        once it exists.</p></div></div>`;
  return `<div class="cdx-sec"><h2>Character — live</h2>
    <p class="cdx-rings">The same card the board shows, and the same controls. Every figure is computed
      by the server from the sheet's own rules, so this and their sheet cannot disagree.</p>
    <div class="pty one">` + chars.map(partyCardHtml).join("") + `</div></div>`;
}

// ── Cognitions ─────────────────────────────────────────────
function tabCognitions(u) {
  const has = new Set(u.cognitions);
  let h = `<div class="cdx-sec"><h2>Cognitions — ${has.size} of ${INDEX.length}</h2>
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

  // The player's own tracker, as they keep it — read-only, and it belongs beside the grants
  // because the whole point of it is that a 4/4 becomes one.
  h += `<div class="cdx-sec"><h2>Learning — kept by ${esc(u.displayName)}</h2>` +
    (u.learning.length ? `<div class="cdx-defs">` + u.learning.map(l =>
      `<div class="cdx-def"><b>${esc(l.name)}</b><span><span class="pips-ro">${pipText(l.depth)}</span> ${l.depth}/4${
        l.depth === 4 ? (l.cognitionId ? " — waiting for you to enable it" : " — not in the builder") : ""}</span>${
        l.depth === 4 && l.cognitionId && !u.cognitions.includes(l.cognitionId)
          ? `<button class="mini on" onclick="adminEnable(${u.id},'${escAttr(l.cognitionId)}')">Enable</button>` : ""}</div>`).join("") + `</div>`
      : `<div class="cdx-note"><p>Nothing tracked yet.</p></div>`) + `</div>`;
  return h;
}
function pipText(d) { return "▰".repeat(d) + "▱".repeat(4 - d); }

// ── Ignitions ──────────────────────────────────────────────
// Written beside the Cognitions rather than typed into this page, for the same reason the Paragon
// Abilities are: they are written for one character, and a file is reviewable where a textarea is
// not. The server will only ever enable one for the player named inside it, so this page can be
// stale without being dangerous.
const RANK_NUM = ["I", "II", "III", "IV"];

function tabIgnitions(u) {
  const sets = u.ignitionSets || [], on = new Set(u.ignitions || []);
  let h = `<div class="cdx-sec"><h2>Ignitions — ${on.size} of ${sets.length} enabled</h2>
    <p class="cdx-rings">A permanent technique this character owns, inherited from a Dream Item, a
      Dream-Touched Creature or an Epiphany. Click to enable or take back — it is saved at once, and
      one that isn't enabled never reaches ${esc(u.displayName)}'s browser. They appear in the
      <strong>Forge</strong>, above their saved Eidons, and as their own entries in the
      <strong>Ignitions</strong> tab. They are read-only: an Ignition never loads into the builder.</p>`;

  if (!sets.length) {
    h += `<div class="cdx-note"><p>Nothing written for ${esc(u.displayName)} yet. Add a file to
      <code>ignitions/</code> named <code>ignition_${esc(u.username)}_&lt;slug&gt;.json</code> and it
      appears here to be enabled.</p></div>`;
  } else {
    h += `<div class="chips">` + sets.map(s => {
      const isOn = on.has(s.id);
      const about = [s.cognitions.join(" + "), s.rank ? `Rank ${RANK_NUM[s.rank - 1] || s.rank}` : null].filter(Boolean).join(" · ");
      return `<button class="chip ign-chip ${isOn ? "on" : ""}" onclick="ignAdminToggle(${u.id},'${escAttr(s.id)}',this)"
        aria-pressed="${isOn}" title="${escQ(s.name)} — ${escQ(about)}${isOn ? " · enabled" : ""}">${esc(s.name)}</button>`;
    }).join("") + `</div>
    <div class="cdx-defs" style="margin-top:12px">` + sets.map(s => {
      const about = [s.cognitions.join(" + "), s.rank ? `Rank ${RANK_NUM[s.rank - 1] || s.rank}` : null, s.source]
        .filter(Boolean).join(" · ");
      return `<div class="cdx-def"><b>${esc(s.name)}</b><span>${esc(about)}${
        on.has(s.id) ? "" : ` — <em>not enabled</em>`}</span></div>`;
    }).join("") + `</div>`;
  }
  return h + `</div>`;
}

async function ignAdminToggle(userId, ignId, btn) {
  const u = userById(userId);
  const on = !(u.ignitions || []).includes(ignId);
  const name = (u.ignitionSets || []).find(s => s.id === ignId)?.name || ignId;
  btn.disabled = true;
  try {
    await api(on ? "PUT" : "DELETE", `api/admin/users/${userId}/ignitions/${encodeURIComponent(ignId)}`);
    toast(on ? `${name} is open to ${u.displayName}` : `${name} taken back`);
    await reload();
  } catch (err) { btn.disabled = false; toast(err.message); }
}

// ── Paragon ────────────────────────────────────────────────
// Two things on this page belong to the DM, and only two:
//   · whether the path is open to this player at all — a choice of identity, made with them
//   · which Devotions they may swear from, and a Devotion can only be a Cognition they have
//     already mastered, so the picker is drawn from their grants and from nothing else
//
// The Paragon Abilities are not here. A Paragon's power is built for one character, so it is
// written beside the Cognitions themselves — cognitions/devotions/<player>_<cognition>_devotion.json
// — and this page only reports whether a set exists for a given Devotion. Opening a Devotion with no
// set written is allowed: the player's card says so plainly.
//
// The third thing is the Pilgrimage. The rule asks the player for advance notice, so the notice
// arrives here and the DM answers it: walking one swaps the Devotions in a single step.
const PILGRIM_LABEL = { asked: "waiting on you", walked: "walked", declined: "declined" };

function tabParagon(u) {
  let h = `<div class="cdx-sec"><h2>Paragon path</h2>
    <p class="cdx-rings">A choice of identity, not a lesson — you open it. While it's closed,
      ${esc(u.displayName)} never sees it. <strong>While it's open they lose Arcanum Veritas and
      Ignition entirely</strong>: the builder gives them one Art, no Cognition rail and no seal
      card — only their Devotions.</p>
    <div class="adm-line" style="gap:9px">
      <button class="mini ${u.paragon ? "on" : ""}" onclick="parAdminTogglePath(${u.id})">
        ${u.paragon ? "✓ Walks the Paragon path" : "Open the Paragon path"}</button>
    </div>`;
  if (!u.paragon) return h + `</div>`;

  const open = new Set(u.devotions || []), sworn = new Set(u.sworn || []);
  const sets = new Map((u.devotionSets || []).map(s => [s.cog, s]));
  const mastered = INDEX.filter(c => u.cognitions.includes(c.id));

  // What the player has chosen out of the pool, and what is burning right now
  h += `<h3 class="adm-sub">Devotions — ${open.size} open · ${sworn.size} of 3 sworn</h3>
    <p class="cdx-rings">Click to open or close. A Devotion can only be a Cognition
      ${esc(u.displayName)} knows at <strong>Learn Full</strong>, so only their granted Cognitions
      are listed — grant one on the Cognitions tab first if it's missing. They then swear up to
      three of these and hold one in the Deeper Burn.</p>`;

  if (!mastered.length) {
    h += `<div class="cdx-note"><p>${esc(u.displayName)} has no Cognitions granted yet, so there is
      nothing that could become a Devotion.</p></div>`;
  } else {
    h += `<div class="chips">` + mastered.map(c => {
      const s = sets.get(c.id), isOpen = open.has(c.id), isSworn = sworn.has(c.id), burning = u.burning === c.id;
      const cls = ["chip", "dev-chip", isSworn ? "sworn" : isOpen ? "open" : "", burning ? "burning" : "", s ? "" : "unwritten"].filter(Boolean).join(" ");
      const why = s ? `“${s.name}” is written for them` : "no abilities written yet — their card will say so";
      return `<button class="${cls}" onclick="devAdminToggle(${u.id},'${escAttr(c.id)}',this)" aria-pressed="${isOpen}"
        title="${escQ(c.name)} — ${escQ(why)}${burning ? " · burning now" : isSworn ? " · sworn" : isOpen ? " · open, not sworn" : ""}">${esc(c.name)}${burning ? " ✦" : ""}</button>`;
    }).join("") + `</div>
    <p class="dev-legend"><strong>plain</strong> mastered, not a Devotion ·
      <strong style="color:#9BD5BA">jade</strong> open to them ·
      <strong style="color:#7BC2A4">filled</strong> sworn · <strong>✦</strong> burning ·
      <em>dashed</em> no abilities written for it yet</p>`;
  }

  // Sets written for a Cognition they haven't mastered — the Pilgrimage cases
  const waiting = (u.devotionSets || []).filter(s => !u.cognitions.includes(s.cog));
  if (waiting.length)
    h += `<h3 class="adm-sub">Written, but not mastered</h3>
      <p class="cdx-rings">Abilities exist for these, and they can't become Devotions until
        ${esc(u.displayName)} reaches Learn Full — which is what a Pilgrimage is for.</p>
      <div class="cdx-defs">` + waiting.map(s =>
        `<div class="cdx-def"><b>${esc(s.name)}</b><span>Devotion of ${esc(cogName(s.cog))} — grant ${esc(cogName(s.cog))} on the Cognitions tab to open it</span></div>`).join("") + `</div>`;

  // Pilgrimages: the advance notice, answered
  const asked = u.pilgrimage || [];
  if (asked.length) {
    h += `<h3 class="adm-sub">Pilgrimage — ${asked.length} waiting</h3>
      <div class="cdx-defs">` + asked.map(p =>
      `<div class="cdx-def"><b>${esc(cogName(p.arriving))}</b>
        <span>${p.leaving ? `in place of ${esc(cogName(p.leaving))}` : "into a free Devotion"}${p.note ? ` — “${esc(p.note)}”` : ""}</span>
        <button class="mini on" onclick="pilgrimAnswer(${p.id},'walked','${escAttr(cogName(p.arriving))}')">Walked</button>
        <button class="mini adm-del" onclick="pilgrimAnswer(${p.id},'declined','')">Decline</button></div>`).join("") + `</div>
      <p class="hint" style="font-style:normal">Walking it closes the old Devotion and opens the new
        one in one step. ${esc(u.displayName)} must have mastered the arriving Cognition first —
        grant it on the Cognitions tab, then walk the road.</p>`;
  } else {
    h += `<h3 class="adm-sub">Pilgrimage</h3>
      <div class="cdx-note"><p>No Pilgrimage on the road. ${esc(u.displayName)} raises one from
        their own sheet when they want to swap a Devotion, and it appears here.</p></div>`;
  }

  h += `<h3 class="adm-sub">Where the abilities live</h3>
    <div class="cdx-note"><p>Paragon Abilities are written for each character, so they aren't typed
      into this page — they're authored in <code>cognitions/devotions/&lt;player&gt;_&lt;cognition&gt;_devotion.json</code>,
      beside the Cognitions. A set names its <code>player</code> and its <code>cognition</code>,
      groups its abilities the way a Cognition groups <code>verumEffects</code>, and gives each one
      a four-entry <code>tiers</code> ladder for Ranks I–IV. The server hands a set to nobody but
      the player it names.</p></div>`;
  return h + `</div>`;
}

async function parAdminTogglePath(userId) {
  const u = userById(userId);
  try {
    await api("PUT", `api/admin/users/${userId}/paragon`, { enabled: !u.paragon });
    u.paragon = !u.paragon;
    toast(u.paragon ? `${u.displayName} walks the Paragon path` : `${u.displayName} leaves the Paragon path`);
    draw();
  } catch (err) { toast(err.message); }
}

// Open or close one Devotion. The server refuses a Cognition this player hasn't mastered, so the
// rule holds even if this page is out of date.
async function devAdminToggle(userId, cogId, btn) {
  const u = userById(userId);
  const on = !(u.devotions || []).includes(cogId);
  btn.disabled = true;
  try {
    await api(on ? "PUT" : "DELETE", `api/admin/users/${userId}/devotions/${encodeURIComponent(cogId)}`);
    toast(on ? `${cogName(cogId)} is a Devotion ${u.displayName} may swear` : `${cogName(cogId)} closed`);
    await reload();
  } catch (err) { btn.disabled = false; toast(err.message); }
}

async function pilgrimAnswer(id, status, label) {
  if (status === "walked" && !confirm(`Finish the Pilgrimage to ${label}? The old Devotion leaves and this one takes its place.`)) return;
  try {
    await api("PUT", `api/admin/pilgrimages/${id}`, { status });
    toast(status === "walked" ? "The road is walked" : "Declined");
    await reload();
  } catch (err) { toast(err.message); }
}

// ── Servants ───────────────────────────────────────────────
// Their roster lives in grimm_souls, so the DM can see what each Servant has been upgraded to and
// what charges it is holding — and correct a number or grant an upgrade without taking the player's
// sheet off them. Loaded when the tab is opened rather than with the page: most visits here are for
// something else, and there is no reason to ask the server for a roster nobody is looking at.
const SOULS_BY_USER = {};

function tabServants(u) {
  if (!SOULS_BY_USER[u.id]) setTimeout(() => loadSouls(u.id), 0);
  return `<div class="cdx-sec"><h2>Servants</h2>
    <p class="cdx-rings">What ${esc(u.displayName)} holds, what they have upgraded, and what they
      have spent. Editing writes the same row their sheet syncs — safest between sessions.</p>
    <div id="souls-${u.id}"><p class="hint">Reading…</p></div></div>`;
}
async function loadSouls(uid) {
  const box = document.getElementById("souls-" + uid);
  try {
    const { souls } = await api("GET", `api/admin/players/${uid}/souls`);
    SOULS_BY_USER[uid] = souls || [];
  } catch (e) { if (box) box.innerHTML = `<p class="hint">Couldn't read them: ${esc(e.message || e)}</p>`; return; }
  drawSouls(uid);
}
const soulName = key => key.startsWith("vault:")
  ? key.slice(6).replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase())
  : "their own";
// Which Grimm an account holds. The Companion's party list carries a `short` name per Grimm and the
// accounts are named the same way (salomon → Salomon), which is the only link between the two.
const grimmFor = u => (GRIMMS.grimms || []).find(g =>
  String(g.short || "").toLowerCase() === String(u && u.username || "").toLowerCase());
const vaultKeyOf = name => "vault:" + String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// The vault's Servants are the baseline, listed whether or not the player has touched them — a row
// exists only once they change something, so there is nothing to prefill and nothing to go stale.
// Their own souls are appended, and so is anything recorded against another Grimm.
function drawSouls(uid) {
  const box = document.getElementById("souls-" + uid);
  if (!box) return;
  const rows = SOULS_BY_USER[uid] || [];
  const u = userById(uid), g = grimmFor(u);
  const byKey = new Map(rows.map(r => [r.grimm + "|" + r.key, r]));
  const lines = [];

  if (g) for (const sv of (g.servants || [])) {
    const key = vaultKeyOf(sv.name), r = byKey.get(g.id + "|" + key);
    byKey.delete(g.id + "|" + key);
    lines.push({ nm: sv.name, grimm: g.id, key, r, vault: true });
  }
  for (const r of byKey.values()) lines.push({ nm: r.edits.name || soulName(r.key), grimm: r.grimm, key: r.key, r, vault: r.key.startsWith("vault:") });

  if (!lines.length) {
    box.innerHTML = `<div class="cdx-note"><p>${esc((u && u.displayName) || "This player")} holds no Grimm
      with Servants${g ? "" : " that this page can match to their account"}.</p></div>`;
    return;
  }
  box.innerHTML = `<div class="cdx-defs">` + lines.map(l => {
    const s = l.r, tr = (s && s.state.tr) || [];
    const up = s ? ["level", "cr", "hp", "ac"].filter(k => s.edits[k] != null && s.edits[k] !== "")
      .map(k => `${k.toUpperCase()} ${s.edits[k]}`).join(" · ") : "";
    const where = s && s.state.out ? " · summoned" : s && s.state.prep ? " · prepared" : "";
    return `<div class="cdx-def${s ? "" : " dis"}"><b>${esc(l.nm)}</b>
      <span>${esc(l.grimm)}${l.vault ? "" : " · written by them"}${up ? ` · upgraded: ${esc(up)}` : s ? " · no upgrades recorded" : " · untouched"}${where}${s && s.state.hp != null ? ` · ${s.state.hp} HP` : ""}</span>
      ${tr.length ? `<span>${tr.map(t => `${esc(t.name)} <b>${+t.cur || 0}/${+t.max || 0}</b>`).join(" · ")}</span>` : ""}
      ${l.vault || s ? `<button class="mini" onclick="editSoulAdmin(${uid},'${escAttr(l.grimm)}','${escAttr(l.key)}','${escAttr(l.nm)}')">Edit</button>` : ""}</div>`;
  }).join("") + `</div>
  <p class="hint" style="font-style:normal">Greyed means <b>untouched</b> — the Servant is on their
    sheet as the vault writes it, with nothing recorded against it. Editing one writes the first row.</p>`;
}
// One soul, by hand. Only the numbers and the charges — the same things the player may change.
// Addressed by grimm + key rather than by position, because the list now includes untouched vault
// Servants that have no row at all, and a Servant with no row is exactly the one you grant an
// upgrade to. Saving it writes that first row.
const soulRow = (uid, grimm, key) => (SOULS_BY_USER[uid] || []).find(r => r.grimm === grimm && r.key === key);
function editSoulAdmin(uid, grimm, key, nm) {
  const s = soulRow(uid, grimm, key) || { grimm, key, edits: {}, state: {} };
  const box = document.getElementById("souls-" + uid);
  document.getElementById("asEdit")?.remove();
  const f = (k, lbl) => `<label class="adm-f"><span>${lbl}</span><input id="as_${k}" value="${escQ(s.edits[k] ?? "")}"></label>`;
  const tr = s.state.tr || [];
  box.insertAdjacentHTML("afterbegin", `<div class="cdx-note" id="asEdit">
    <p><b>${esc(nm)}</b> — ${esc(grimm)}${soulRow(uid, grimm, key) ? "" : " · nothing recorded yet"}</p>
    <div class="adm-line">${f("level", "Level")}${f("cr", "CR")}${f("hp", "HP")}${f("ac", "AC")}</div>
    ${tr.length ? `<div class="adm-line">${tr.map((t, j) =>
      `<label class="adm-f"><span>${esc(t.name)}</span><input id="as_tr${j}" value="${+t.cur || 0}" style="width:60px"></label>`).join("")}</div>` : ""}
    <div class="adm-line"><button class="mini on" onclick="saveSoulAdmin(${uid},'${escAttr(grimm)}','${escAttr(key)}','${escAttr(nm)}')">Save</button>
      <button class="mini" onclick="document.getElementById('asEdit').remove()">Cancel</button></div>
    <p class="hint" style="font-style:normal">Leave a number empty to hand it back to the vault's
      statblock. Their sheet picks this up the next time it loads${tr.length ? "" : "; they define their own charge trackers, so there are none to correct here yet"}.</p></div>`);
}
async function saveSoulAdmin(uid, grimm, key, nm) {
  const s = soulRow(uid, grimm, key) || { grimm, key, edits: {}, state: {} };
  const edits = { ...s.edits }, state = { ...s.state };
  for (const k of ["level", "cr", "hp", "ac"]) {
    const v = (document.getElementById("as_" + k)?.value ?? "").trim();
    if (v === "") delete edits[k]; else edits[k] = v;
  }
  if ((s.state.tr || []).length) state.tr = s.state.tr.map((t, j) => {
    const v = +(document.getElementById("as_tr" + j)?.value ?? t.cur) || 0;
    return { ...t, cur: Math.max(0, Math.min(+t.max || 0, v)) };
  });
  try {
    await api("PUT", `api/admin/players/${uid}/souls/${encodeURIComponent(grimm)}/${encodeURIComponent(key)}`, { edits, state });
    const cur = soulRow(uid, grimm, key);
    if (cur) { cur.edits = edits; cur.state = state; }
    else (SOULS_BY_USER[uid] = SOULS_BY_USER[uid] || []).push({ grimm, key, edits, state });
    document.getElementById("asEdit")?.remove();
    drawSouls(uid);
    toast(`${nm} updated.`);
  } catch (e) { alert("Couldn't save: " + (e.message || e)); }
}

// ── The account itself ─────────────────────────────────────
function adminEnable(userId, cogId) {
  api("PUT", `api/admin/users/${userId}/cognitions/${encodeURIComponent(cogId)}`)
    .then(() => { toast("Enabled"); return reload(); }).catch(err => toast(err.message));
}
async function adminToggle(userId, cogId, btn) {
  const u = userById(userId);
  const on = !u.cognitions.includes(cogId);
  btn.disabled = true;
  try {
    await api(on ? "PUT" : "DELETE", `api/admin/users/${userId}/cognitions/${encodeURIComponent(cogId)}`);
    toast(on ? `${cogName(cogId)} granted to ${u.displayName}` : `${cogName(cogId)} taken back`);
    await reload();
  } catch (err) { btn.disabled = false; toast(err.message); }
}
function adminCreate(e) {
  e.preventDefault();
  api("POST", "api/admin/users", {
    username: document.getElementById("admNewUser").value,
    displayName: document.getElementById("admNewName").value,
    password: document.getElementById("admNewPass").value || undefined,
  }).then(async ({ user }) => {
    toast(`${user.displayName} created`);
    await refresh();
    go("players", user.id);
  }).catch(err => toast(err.message));
  return false;
}
function adminRename(id) {
  const displayName = document.getElementById("admName").value.trim();
  api("PATCH", `api/admin/users/${id}`, { displayName })
    .then(() => { toast("Renamed"); return reload(); }).catch(err => toast(err.message));
}
function adminSetPassword(id) {
  const el = document.getElementById("admPass");
  api("PATCH", `api/admin/users/${id}`, { password: el.value })
    .then(() => { el.value = ""; toast("Password set"); return reload(); }).catch(err => toast(err.message));
}
function adminDelete(id) {
  const u = userById(id);
  if (!u || !confirm(`Delete ${u.displayName}? Their saved builds, grants and tracker go with the account.`)) return;
  api("DELETE", `api/admin/users/${id}`).then(async () => {
    toast(`${u.displayName} deleted`);
    await refresh();
    go("players", SECTIONS.players.first());
  }).catch(err => toast(err.message));
}

// ═══════════════════════════════════════════════════════════
//  WHAT IS WAITING — this section's two contributions to the inbox
// ═══════════════════════════════════════════════════════════
// A player has tracked a Cognition to 4/4 and it isn't enabled for them yet; and a Paragon has a
// Pilgrimage on the road. Both are answered here, which is why they are counted here — the bar
// only adds them up and puts them on screen.
const pendingFor = u => u.learning.filter(l => l.depth === 4 && l.cognitionId && !u.cognitions.includes(l.cognitionId));
// A name the index doesn't know is listed apart — there is nothing to enable.
function adminPending(known = true) {
  return ADMIN.users.flatMap(u => u.learning
    .filter(l => l.depth === 4 && !!l.cognitionId === known && !u.cognitions.includes(l.cognitionId))
    .map(l => ({ user: u, ...l })));
}
function adminPilgrimages() {
  return ADMIN.users.flatMap(u => (u.pilgrimage || []).map(p => ({ user: u, ...p })));
}

inbox({
  count: () => adminPending().length,
  render: () => {
    const todo = adminPending(), loose = adminPending(false);
    if (!todo.length && !loose.length) return "";
    return (todo.length ? `<div class="cdx-sec"><h2>Waiting to be enabled</h2>
        <p class="cdx-rings">They have tracked it to 4/4. Nothing opens for them until you answer.</p>
        <div class="cdx-defs">` + todo.map(p =>
          `<div class="cdx-def"><b>${esc(p.user.displayName)}</b><span>has mastered <strong>${esc(p.name)}</strong></span>
            <button class="mini" onclick="closeReminders();go('players',${p.user.id},'cognitions')">Open</button>
            <button class="mini on" onclick="adminEnable(${p.user.id},'${escAttr(p.cognitionId)}')">Enable</button></div>`).join("") + `</div></div>` : "") +
      (loose.length ? `<div class="cdx-sec"><h2>Mastered, but not in the builder</h2>
        <p class="cdx-rings">These names match no Cognition in index.json, so there is nothing to enable.</p>
        <div class="cdx-defs">` + loose.map(p =>
          `<div class="cdx-def"><b>${esc(p.user.displayName)}</b><span>${esc(p.name)}</span></div>`).join("") + `</div></div>` : "");
  },
});

inbox({
  count: () => adminPilgrimages().length,
  render: () => {
    const roads = adminPilgrimages();
    if (!roads.length) return "";
    return `<div class="cdx-sec"><h2>Pilgrimages on the road</h2>
      <p class="cdx-rings">A Paragon swapping one Devotion for another. Walking it needs the arriving Cognition granted first.</p>
      <div class="cdx-defs">` + roads.map(p =>
        `<div class="cdx-def"><b>${esc(p.user.displayName)}</b>
          <span>${p.leaving ? `${esc(cogName(p.leaving))} → ` : "→ "}<strong>${esc(cogName(p.arriving))}</strong>${p.note ? ` — “${esc(p.note)}”` : ""}</span>
          <button class="mini" onclick="closeReminders();go('players',${p.user.id},'paragon')">Open</button>
          <button class="mini on" onclick="pilgrimAnswer(${p.id},'walked','${escAttr(cogName(p.arriving))}')">Walked</button></div>`).join("") + `</div></div>`;
  },
});
