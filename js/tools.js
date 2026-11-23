// Ephemer — the tool menu that sits at the left of every bar.
//
// The tools are separate pages — the seal composer, the Grimm Companion, the World Map, Admin —
// and the only road between them used to be back out to the front page and in again: two loads
// to cross the room. The ★ in the corner of every bar opens them directly instead: every tool
// the account may open, with the one you are standing in marked.
//
// A page carries it with two lines: an empty <nav class="tools" data-tool="…"> in its bar, and a
// <script src="js/tools.js"> (or ../js/tools.js from inside grimms/ and map/). Nothing else —
// the strip brings its own styling, and asks api/me itself rather than waiting on each page's
// own boot, so none of the five boot functions had to learn about it.
//
// Who sees what follows the front page exactly: everyone signed in gets Home, the composer, the
// Companion, the World Map (since 2026-10-23) and Initiative (since 2026-11-12); Admin is the DM's. That is a convenience,
// not the boundary: every Admin call sits behind requireDm, and on the map the server decides
// per place what an account may read. On a static host there is no api/ and no accounts, so the
// menu shows what is public anyway.

// Where the app root is, read off this script's own src — which is why a page in grimms/ or map/
// needs nothing but the right relative path on its <script> tag.
const TOOL_BASE = (document.currentScript?.getAttribute("src") || "js/tools.js")
  .replace(/js\/tools\.js.*$/, "");

// The marks match the front page's cards, so a tool looks the same wherever you meet it.
const TOOLS = [
  { key: "hub", href: "", mark: "★", label: "Home",
    title: "Ephemer — the front page" },
  { key: "arcanum", href: "arcanum.html", mark: "✦", label: "Arcanum",
    title: "Arcanum Veritas, Ignition and the Paragon path — compose seals, forge Eidons, read the Codex" },
  { key: "grimms", href: "grimms/", mark: "⛓", label: "Grimms",
    title: "Grimm Companion — your Grimm's sheet, the compendium and the party tools" },
  { key: "sheet", href: "sheet/", mark: "◉", label: "Sheet",
    title: "Character Sheet — your seven scores, the Fate Die, Wounds and both exhaustion tracks" },
  { key: "map", href: "map/", mark: "✶", label: "Map",
    title: "World Map — nations, settlements and the roads between them" },
  // Everyone signed in: the DM gets the board, a player gets the running order. Which face the page
  // wears is the server's answer to /api/initiative, not this row's.
  { key: "initiative", href: "initiative/", mark: "⧗", label: "Initiative",
    title: "Initiative — the fight on the table, and the second screen for the room" },
  { key: "library", href: "library/", mark: "▤", label: "Library",
    title: "The Library — the campaign's shared documents, published from the vault" },
  { key: "admin", href: "admin/", mark: "❖", label: "Admin", dm: true,
    title: "Admin — the table's live board, the players, the Grimms and the compendium" },
];

// A menu rather than a row of buttons: the bars are crowded already — the composer's carries the
// Art, seven view tabs, four dials and three live numbers — and a tool is something you reach for
// a few times an evening, not something that has to sit in the open. So it keeps the ★ that was
// in that corner all along, and the star now opens rather than only going home.
function renderTools(role) {
  document.querySelectorAll("nav.tools").forEach(nav => {
    const here = nav.dataset.tool || "";
    const open = nav.querySelector("details")?.open;      // a re-render shouldn't shut the menu
    const rows = TOOLS.filter(t => !t.dm || role === "dm").map(t => {
      const on = t.key === here;
      const href = t.href ? TOOL_BASE + t.href : (TOOL_BASE || "./");
      return `<a href="${href}" title="${t.title}"${on ? ' aria-current="page"' : ""}>` +
        `<span class="tm" aria-hidden="true">${t.mark}</span><span class="tl">${t.label}</span></a>`;
    }).join("");
    nav.innerHTML = `<details class="t-menu"${open ? " open" : ""}>` +
      `<summary title="The tools of Ephemer" aria-label="The tools of Ephemer">` +
      `<span aria-hidden="true">★</span><span class="t-car" aria-hidden="true">▾</span></summary>` +
      `<div class="t-pop">${rows}</div></details>`;
  });
}

// Clicking anywhere else closes it. The three pages built on css/app.css already do this for
// their own details.more menus; grimms/ and map/ have no such handler, so the strip brings one.
document.addEventListener("click", e => {
  document.querySelectorAll("nav.tools details[open]").forEach(d => { if (!d.contains(e.target)) d.open = false; });
});

// The strip's own styling. It rides with the script rather than living in a stylesheet because
// the three sections keep three separate sheets (css/app.css, grimms/css/app.css, map/css/map.css)
// — all of which define these same tokens, so one block covers them. In <head>, it lands before
// the first paint.
document.head.insertAdjacentHTML("beforeend", `<style>
.tools{flex:none;margin-right:16px;line-height:1}
.t-menu{position:relative}
.t-menu > summary{display:flex;align-items:center;gap:3px;list-style:none;cursor:pointer;
  padding:4px 7px;border:1px solid var(--line);border-radius:6px;background:var(--slate);
  color:var(--brass);font-size:13px;line-height:1.3}
.t-menu > summary::-webkit-details-marker{display:none}
.t-menu > summary:hover,.t-menu[open] > summary{color:#E0B050;border-color:var(--mute)}
.t-menu .t-car{font-size:9px;color:var(--mute)}
.t-pop{position:absolute;left:0;top:calc(100% + 6px);z-index:60;min-width:172px;padding:5px;
  background:var(--panel);border:1px solid var(--line);border-radius:8px;
  box-shadow:0 10px 26px rgba(0,0,0,.45)}
.t-pop a{display:flex;align-items:center;gap:9px;padding:7px 10px;border-radius:5px;
  font-family:var(--sans);font-size:12px;line-height:1.3;
  color:var(--bone2);text-decoration:none;white-space:nowrap}
.t-pop a:hover{background:var(--panel2);color:var(--bone)}
/* Where you already are — named, not hidden, so the menu says which tool this page is */
.t-pop a[aria-current]{color:var(--brass);font-weight:500}
.t-pop a[aria-current]::after{content:"\\2022";margin-left:auto;color:var(--brass)}
.t-pop .tm{width:14px;text-align:center;font-size:12px;color:var(--mute)}
.t-pop a:hover .tm,.t-pop a[aria-current] .tm{color:inherit}
@media print{ .tools{display:none} }

/* ── The fight, across every tool ─────────────────────────────────────────
   Juan, 2026-11-18: while the table is in combat, every tool says so and says which round. It
   rides with the strip for the same reason the strip does — one file, and every page already
   loads it.
   NOTE: the three sections all give .bar position:sticky with top:0, so a banner above it has to
   move it down or the two share the same line. Everything here is under body.in-fight, which is
   set only while a fight is actually running, so the ordinary page is untouched. The Companion's
   two inner sticky columns are offset from the bar's own height and move with it.
   (No backticks in this block: it lives inside a template literal.) */
body.in-fight{--fight-h:30px}
.fight-strip{position:sticky;top:0;z-index:50;display:flex;align-items:center;justify-content:center;
  gap:10px;height:30px;padding:0 14px;background:#6d2f2a;color:#FFE9DF;
  font-family:var(--sans);font-size:11.5px;letter-spacing:.06em;text-transform:uppercase;
  border-bottom:1px solid #8d3c35}
.fight-strip b{font-weight:700;letter-spacing:.02em;font-size:13px;text-transform:none}
.fight-strip .fs-dot{width:7px;height:7px;border-radius:50%;background:#FF6B5B;flex:none;
  animation:fs-beat 1.8s ease-in-out infinite}
@keyframes fs-beat{0%,100%{opacity:1}50%{opacity:.35}}
@media (prefers-reduced-motion:reduce){ .fight-strip .fs-dot{animation:none} }
body.in-fight .bar{top:var(--fight-h)}
body.in-fight .rounds,body.in-fight .side{top:calc(70px + var(--fight-h))}
@media print{ .fight-strip{display:none} }
</style>`);

// ── Is the table fighting? ───────────────────────────────────────────────
// `/api/me/character` answers for the account's own character, and the board writes the round onto
// every sheet at the table (POST /api/initiative/clock), so this is the same answer the character
// sheet and the Companion are reading. A page with no session, or a static host, simply never
// shows it.
//
// The banner is the FIRST child of <body> and sticky, so it sits above each page's own bar rather
// than over it; `body.in-fight` moves the bar down by its height and nothing shifts when no fight
// is running.
let fightStrip = null, fightSeen = null;

function drawFight(d) {
  const on = !!(d && d.inCombat);
  const key = on ? `${d.fightId}|${d.round}` : "";
  if (key === fightSeen) return;                 // no churn while the round sits still
  fightSeen = key;
  document.body.classList.toggle("in-fight", on);
  if (!on) { fightStrip?.remove(); fightStrip = null; return; }
  if (!fightStrip) {
    fightStrip = document.createElement("div");
    fightStrip.className = "fight-strip";
    fightStrip.setAttribute("role", "status");
    document.body.prepend(fightStrip);
  }
  fightStrip.innerHTML = `<span class="fs-dot" aria-hidden="true"></span>` +
    `<span>In combat</span><b>Round ${Number(d.round) || 1}</b>`;
}

async function readFight() {
  if (document.hidden) return;
  try {
    const r = await fetch(TOOL_BASE + "api/me/character");
    if (!r.ok) return;
    drawFight(await r.json());
  } catch (e) { /* offline, or a host with no API — leave whatever is on screen */ }
}

// Asked at parse time so it is in flight while the page parses, and the answer is usually there
// by the time the bar is drawn. Two renders rather than one: the strip appears with the tools
// everyone has, and the DM's two join it a moment later — the same way the front page unhides
// its own cards.
const TOOL_ROLE = fetch(TOOL_BASE + "api/me")
  .then(r => (r.ok ? r.json() : null))
  .then(d => d?.user?.role || null)
  .catch(() => null);                       // static host, or no server — show what is public

function bootTools() {
  renderTools(null);
  TOOL_ROLE.then(renderTools);
  // Ten seconds is the round the table is on, not the turn — nobody needs it sooner, and this runs
  // on every page of the app. Paused while the tab is hidden, and read at once on the way back.
  readFight();
  setInterval(readFight, 10_000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) readFight(); });
  window.addEventListener("focus", readFight);
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootTools);
else bootTools();
