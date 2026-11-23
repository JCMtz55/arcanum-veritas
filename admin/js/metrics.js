// Ephemer — Admin · METRICS
//
// What the party actually drew. One row per press of "Drew it" in the composer (js/metrics.js),
// read back here as a night's worth of evidence: which slots were spent, which Rings carry the
// party, which Cognitions never come out, and what a seal's DC and damage really were at the level
// they were cast at rather than at today's.
//
// It states figures and nothing else. No verdict, no "too strong" — a tool cannot see the fight
// those numbers happened in, and a page that offered an opinion would be guessing at the half of
// the evidence it hasn't got. The balance call is the DM's, made with this and the session note
// open beside each other.
//
// A night, not a date: a session that runs to 2am is one night, so the server stamps every row with
// the game night (6am boundary, the table's own timezone). The rail lists the nights there are.
//
// Loaded when the section is opened rather than with the boot payload — a night of draws is rows
// nobody is waiting for while the board paints.

const MET = { nights: [], night: null, loadedFor: null, rows: [], summary: null,
              loading: false, err: null, tonight: null, zone: null, all: false };

section("metrics", {
  mark: "▤", label: "Metrics", title: "What the party actually drew, night by night",
  count: () => MET.nights.reduce((n, x) => n + x.draws, 0) || null,
  first: () => "latest",
  rail: () => {
    const sel = UI.sel || "latest";
    const rows = [`<button class="cog ${sel === "all" ? "core" : ""}" onclick="go('metrics','all')"
        title="Every night at once — the trend across sessions">
        <span class="ico">∞</span><span class="nm">Every night</span>
        <span class="rl">${MET.nights.reduce((n, x) => n + x.draws, 0)}</span></button>`];
    MET.nights.forEach((x, i) => {
      const on = sel === x.night || (sel === "latest" && i === 0);
      rows.push(`<button class="cog ${on ? "core" : ""}" onclick="go('metrics','${escAttr(x.night)}')"
        title="${x.players} player${x.players === 1 ? "" : "s"}">
        <span class="ico">◴</span><span class="nm">${esc(metNightName(x.night))}</span>
        <span class="rl">${x.draws}</span></button>`);
    });
    if (!MET.nights.length) rows.push(`<p class="hint" style="padding:10px 12px">Nothing drawn yet.</p>`);
    return rows.join("");
  },
  railFoot: () => `<button class="ghost" onclick="metReload()">Reload</button>`,
  body: () => renderMetrics(),
  enter: () => metEnsure(),
});

// ── reading it ──────────────────────────────────────────────
function metWanted() { return UI.sec === "metrics" ? (UI.sel || "latest") : null; }

function metEnsure() {
  const want = metWanted();
  if (!want || MET.loading || MET.loadedFor === want) return;
  MET.loading = true; MET.err = null;
  const q = want === "latest" ? "" : `?night=${encodeURIComponent(want)}`;
  api("GET", "api/admin/metrics" + q).then(d => {
    MET.nights = d.nights || []; MET.night = d.night; MET.all = d.night === "all";
    MET.rows = d.rows || []; MET.summary = d.summary || null;
    MET.tonight = d.tonight; MET.zone = d.zone;
    MET.loadedFor = want;
  }).catch(err => { MET.err = err.message; MET.loadedFor = want; })
    .finally(() => { MET.loading = false; if (UI.sec === "metrics") { drawRail(); drawBody(); drawSecs(); } });
}
function metReload() { MET.loadedFor = null; metEnsure(); drawBody(); }

// A night reads as the evening it was: "Tue 18 Nov" for the night that began on the 18th.
function metNightName(night) {
  const [y, m, d] = String(night).split("-").map(Number);
  if (!y) return String(night);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  return dt.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })
    + (y === new Date().getUTCFullYear() ? "" : ` ${y}`);
}
const metNum = (v, dash = "—") => (v == null ? dash : String(v));
const metPct = (n, of) => (of ? Math.round(n / of * 100) : 0);

// ── the page ────────────────────────────────────────────────
function renderMetrics() {
  metEnsure();
  if (MET.err) return `<div class="cdx"><div class="cdx-hd"><div><h1>Metrics</h1></div></div>
    <div class="cdx-sec"><div class="cdx-note"><p>${esc(MET.err)}</p></div></div></div>`;
  if (MET.loading && !MET.summary) return `<div class="empty">Reading the night…</div>`;
  const s = MET.summary;
  if (!s) return `<div class="empty">Nothing read yet.</div>`;

  const night = MET.all ? "all" : MET.night;
  const title = MET.all ? "Every night" : metNightName(night);
  const exp = f => `${API_BASE}api/admin/metrics/export?night=${encodeURIComponent(night)}&format=${f}`;

  if (!s.draws) return `<div class="cdx wide"><div class="cdx-hd"><div><h1>Metrics</h1>
      <p class="cdx-desc">What the party actually drew. A row lands here when a player presses
        <strong>Drew it</strong> on the seal card.</p></div></div>
    <div class="cdx-sec"><div class="cdx-note"><p>No seals drawn ${MET.all ? "yet" : `on ${esc(title)}`}.
      Tonight is <strong>${esc(metNum(MET.tonight))}</strong>${MET.zone ? ` (${esc(MET.zone)}, a night turns over at 6am)` : ""}.</p></div></div></div>`;

  return `<div class="cdx wide">
    <div class="cdx-hd"><div><h1>${esc(title)}</h1>
      <p class="cdx-desc">${s.draws} seal${s.draws === 1 ? "" : "s"} drawn by
        ${s.players.length} player${s.players.length === 1 ? "" : "s"}${metClock(s)}. Figures only —
        what they mean for balance is yours to decide.</p></div>
      <div class="cdx-go">
        <a class="mini" href="${exp("csv")}" download>CSV</a>
        <a class="mini" href="${exp("json")}" download>JSON</a>
      </div></div>

    ${metFigures(s)}
    ${metSlots(s)}
    ${metRings(s)}
    ${metCognitions(s)}
    ${metChoices(s)}
    ${metPlayers(s)}
    ${metDraws()}
  </div>`;
}

function metClock(s) {
  if (!s.clock) return "";
  const t = x => new Date(x).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `, ${t(s.clock.first)} to ${t(s.clock.last)}`;
}

// The six numbers worth seeing before anything else.
function metFigures(s) {
  const fig = (b, lab, note) => `<div class="met-fig"><b>${esc(String(b))}</b><i>${esc(lab)}</i>
    ${note ? `<u>${esc(note)}</u>` : ""}</div>`;
  const n = s.numbers;
  return `<div class="cdx-sec"><h2>The night</h2><div class="met-figs">
    ${fig(s.draws, "seals drawn")}
    ${fig(metNum(n.slot?.avg), "average slot", n.slot ? `${n.slot.min}–${n.slot.max}` : "")}
    ${fig(metNum(n.dc?.avg), "average Verum DC", n.dc ? `${n.dc.min}–${n.dc.max}` : "")}
    ${fig(metNum(n.damage?.avg), "expected damage", n.damage ? `peak ${n.damage.max}` : "no damage rolled")}
    ${fig(`${metNum(s.sigils.pct, "0")}%`, "Sigil capacity used", `${s.sigils.used} of ${s.sigils.cap}`)}
    ${fig(`${metPct(s.absolute, s.draws)}%`, "came out Absolute", `${s.absolute} of ${s.draws}`)}
    ${fig(s.granting, "handed something out", "a seal with a benefit written on it")}
  </div>
  <p class="cdx-rings"><strong>Expected damage</strong> is the dice mean plus the flat part of what
    the card said — 6d8 + 5 counts as 32. It is the only way different dice compare across a night;
    it is not what was rolled.</p></div>`;
}

// Where the slots went. The question this answers is whether the top of the ladder is ever spent.
function metSlots(s) {
  const top = Math.max(...s.slots.map(x => x.n), 1);
  const ord = ["", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"];
  return `<div class="cdx-sec"><h2>Slots spent</h2><div class="met-bars">` +
    s.slots.map(x => `<div class="met-bar${x.n ? "" : " none"}">
      <span class="met-bl">${ord[x.slot]}</span>
      <span class="met-bt"><i style="width:${Math.round(x.n / top * 100)}%"></i></span>
      <span class="met-bn">${x.n || "—"}</span>
      <span class="met-bp">${x.n ? metPct(x.n, s.draws) + "%" : ""}</span></div>`).join("") +
    `</div></div>`;
}

// Which Rings carry the party, and what each one's numbers came to.
function metRings(s) {
  const top = Math.max(...s.subtypes.map(x => x.n), 1);
  return `<div class="cdx-sec"><h2>Rings</h2>
    <div class="chips">${s.rings.map(r =>
      `<span class="chip on">${esc(r.key)} · ${r.n} <em>${metPct(r.n, s.draws)}%</em></span>`).join("")}</div>
    <div class="met-rows">
      <div class="met-row met-h"><span>Ring</span><span>Subtype</span><span>Drawn</span>
        <span>Avg DC</span><span>Expected</span><span></span></div>` +
    s.subtypes.map(x => `<div class="met-row">
      <span>${esc(x.ring)}</span><span>${esc(x.subtype || "—")}</span><span>${x.n}</span>
      <span>${metNum(x.avgDc)}</span><span>${metNum(x.avgDamage)}</span>
      <span class="met-bt"><i style="width:${Math.round(x.n / top * 100)}%"></i></span></div>`).join("") +
    `</div></div>`;
}

// Cognitions: as a Core, as a Sigil, and — the one that matters most — the ones that never came out.
function metCognitions(s) {
  const used = new Set([...s.cores.map(c => c.id), ...s.sigilsUsed.map(c => c.id)]);
  const idle = INDEX.filter(c => c.ready && !used.has(c.id));
  return `<div class="cdx-sec"><h2>Cognitions</h2>
    <h3 class="met-h3">As the Core</h3>
    <div class="chips">${s.cores.map(c =>
      `<span class="chip on">${esc(c.name)} · ${c.n}</span>`).join("") || `<span class="chip">none</span>`}</div>
    <h3 class="met-h3">As a Sigil</h3>
    <div class="chips">${s.sigilsUsed.map(c =>
      `<span class="chip">${esc(c.name)} · ${c.n}</span>`).join("") || `<span class="chip">none — no Sigil was drawn</span>`}</div>
    <h3 class="met-h3">Never came out · ${idle.length}</h3>
    <div class="chips">${idle.map(c => `<span class="chip">${esc(c.name)}</span>`).join("") ||
      `<span class="chip on">every open Cognition was used</span>`}</div>
    <p class="cdx-rings">“Never came out” counts the Cognitions that are open to somebody at this
      table and were not drawn ${MET.all ? "in any logged night" : "that night"} — as a Core or as a
      Sigil. A Cognition nobody reaches for is a balance question of its own.</p></div>`;
}

// The choices that cost something: the Manner, the shape, what a target had to save with.
function metChoices(s) {
  const grid = (title, rows, note) => `<div><h3 class="met-h3">${esc(title)}</h3>
    <div class="chips">${rows.map(r => `<span class="chip">${esc(r.key)} · ${r.n}</span>`).join("")
      || `<span class="chip">none</span>`}</div>${note ? `<p class="cdx-rings">${note}</p>` : ""}</div>`;
  return `<div class="cdx-sec"><h2>How they were drawn</h2><div class="met-two">
    ${grid("Manner of drawing", s.manners, "A Manner other than standard is a cost paid for reach — Coven carries three more Sigils.")}
    ${grid("Shape", s.shapes)}
    ${grid("Saves asked for", s.saves, "Only the Rings that ask for one: an Area, a Field, a Control seal.")}
    ${grid("Damage types", s.damageKinds)}
  </div></div>`;
}

function metPlayers(s) {
  return `<div class="cdx-sec"><h2>Player by player</h2><div class="met-rows">
      <div class="met-row met-p met-h"><span>Player</span><span>Character</span><span>Drawn</span>
        <span>Avg slot</span><span>Avg DC</span><span>Expected</span><span>Sigils</span><span>Leans on</span></div>` +
    s.players.map(p => `<div class="met-row met-p">
      <span>${esc(p.player)}</span><span>${esc(p.character || "—")}</span><span>${p.draws}</span>
      <span>${metNum(p.avgSlot)}</span><span>${metNum(p.avgDc)}</span><span>${metNum(p.avgDamage)}</span>
      <span>${metNum(p.sigilsPerSeal)}</span>
      <span>${esc([p.topRing, p.topCore].filter(Boolean).join(" · ") || "—")}</span></div>`).join("") +
    `</div></div>`;
}

// Every draw, newest last, the way the night ran. Capped on the all-nights view: the export is
// where a thousand rows belong, not a page.
const MET_MAX_ROWS = 300;
function metDraws() {
  const rows = MET.rows.slice(-MET_MAX_ROWS);
  const t = x => new Date(x).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const cast = MET.summary?.viaCast || 0;
  return `<div class="cdx-sec"><h2>Every draw · ${MET.rows.length}</h2>
    <p class="cdx-rings">${cast
      ? `${cast} of them wrote <strong>themselves</strong> — a Supportive seal logs its own draw
         when it is cast at the party; the rest are <strong>Drew it</strong>.`
      : `All of them were logged with <strong>Drew it</strong>. A Supportive seal cast at the party
         logs itself and is marked <em>cast</em>.`}</p>
    ${MET.rows.length > rows.length ? `<p class="cdx-rings">The last ${MET_MAX_ROWS} are shown —
      the CSV has all ${MET.rows.length}.</p>` : ""}
    <div class="met-rows">
      <div class="met-row met-d met-h"><span>Time</span><span>Player</span><span>Seal</span>
        <span>Ring</span><span>Slot</span><span>DC</span><span>Damage</span><span>Sigils</span></div>` +
    rows.map(r => `<div class="met-row met-d">
      <span>${esc(t(r.at))}${MET.all ? `<em> ${esc(metNightName(r.night))}</em>` : ""}</span>
      <span>${esc(r.player)}</span>
      <span>${esc(r.name || r.coreName)}<em>${esc([r.name ? r.coreName : r.verum || "",
        r.via === "cast" ? "cast" : ""].filter(Boolean).join(" · "))}</em></span>
      <span>${esc(r.ring)}<em>${esc(r.subtype || "")}</em></span>
      <span>${r.slot}<em>lv ${r.charLevel}</em></span>
      <span>${metNum(r.dc)}${r.save ? `<em>${esc(r.save.slice(0, 3))}</em>` : r.attack != null ? `<em>${sign(r.attack)} hit</em>` : ""}</span>
      <span>${esc(r.damage || "—")}${r.damage ? `<em>${esc(r.damageKind)}${r.absolute ? " · abs" : ""}</em>` : ""}</span>
      <span>${r.sigils}/${r.sigilCap}${r.sigilNames.length ? `<em>${esc(r.sigilNames.join(", "))}</em>` : ""}</span>
      </div>`).join("") + `</div></div>`;
}
