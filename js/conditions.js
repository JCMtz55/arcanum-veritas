// Arcanum Veritas Builder — The Conditions tab
//
// Two kinds of condition meet here, and the tab exists because nothing else in the vault holds
// both at once:
//   · the STANDARD conditions, 5e's with this campaign's two house changes — Stunned no longer
//     takes the turn away, and Paralyzed can be resisted or forced through
//   · the conditions the Cognitions themselves make: every Cognition's own minor / major / severe
//     Eidon ladder, and the named states its Verum text applies, each written out as a real rule
//
// Like the Damage tab, the cross-references are READ FROM THE COGNITION FILES rather than typed
// here, so "who inflicts Frightened" can never drift out of date. The DEFINITIONS are read too,
// from `sheet/js/conditions.js` through `/api/conditions` — see the note below.

// ═══════════════════════════════════════════════════════════
//  THE STANDARD CONDITIONS
// ═══════════════════════════════════════════════════════════
// `status`: same (5e as written) · changed (house rule on top) · fresh (new to this campaign)
// · retired (no longer a standard condition). `note` is the design voice, shown under the rules.
const COND_STATUS = {
  same:    { label: "Unchanged from 5e", cls: "cs-same" },
  changed: { label: "Changed",           cls: "cs-changed" },
  fresh:   { label: "New",               cls: "cs-fresh" },
  retired: { label: "Retired",           cls: "cs-retired" },
};

// ── THE CATALOGUE LIVES IN ONE FILE ────────────────────────────────────
// `sheet/js/conditions.js` holds the standard conditions and the named states. This tab held its
// own copy of both until the initiative board needed them too — the board applies a condition to a
// monster and seeds the DM's condition library from the same definitions — and a list this long in
// two places is two lists that disagree by the second session. The prose did not change; it moved.
//
// Filled on the first open of the tab, from `/api/conditions`. Nothing below renders before
// `conditionUse()` has awaited it, and the search box cannot be reached before the tab is open.
let CONDITIONS = [];
let NAMED_STATES = {};
let COND_BY_NAME = new Map();
let CATALOGUE = null;        // the fetch in flight, so two opens do not ask twice

function loadCatalogue() {
  return (CATALOGUE ||= fetch("api/conditions")
    .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then(d => {
      CONDITIONS = d.standard || [];
      NAMED_STATES = d.named || {};
      COND_BY_NAME = new Map(CONDITIONS.map(c => [c.name.toLowerCase(), c]));
    })
    .catch(e => {
      // Dropped rather than left poisoned, so the next open asks again: a tab that stays empty for
      // the rest of the session because one request failed is worse than one that retries.
      CATALOGUE = null;
      console.warn("Conditions: the catalogue did not load.", e);
    }));
}

// ═══════════════════════════════════════════════════════════
//  WHAT THE COGNITIONS DO WITH THEM — read from the files
// ═══════════════════════════════════════════════════════════
// Three harvests from one pass:
//   `inflict` — which Cognitions can apply each standard condition, from a Verum's declared
//               mech.conditions and from an Eidon condition whose card names it
//   `eidon`   — every Cognition's minor / major / severe ladder, in full
//   `named`   — the states the Verum text invents, and who uses each
//
// Some mech.conditions entries are prose standing in for a condition the effect chooses at the
// table ("the named Core Emotion"). They are not conditions, and they are dropped.
const COND_NOT_A_NAME = /^(a |the )/i;
// The harvest is cached, but keyed on the Cognitions it was built from: signing out and back in as
// someone else replaces INDEX without reloading the page, and a cache that ignored that would serve
// one account's counts to the next.
let COND_USE = null, COND_USE_KEY = null;

async function conditionUse() {
  await loadCatalogue();
  const ready = INDEX.filter(c => c.ready);
  // The catalogue's size is in the key so that a harvest built while it was missing is not the one
  // that is served once it arrives.
  const key = `${CONDITIONS.length}|` + ready.map(c => c.id).join(",");
  if (COND_USE && COND_USE_KEY === key) return COND_USE;
  COND_USE_KEY = key;
  await Promise.all(ready.map(c => loadCognition(c.id)));
  const inflict = {}, named = new Map(), eidon = [];
  const add = (map, key, c) => ((map[key] ||= []).some(x => x.id === c.id) || map[key].push(c));

  ready.forEach(c => {
    const cog = LOADED[c.id]; if (!cog) return;
    const ladder = cog.eidon?.conditions || {};
    const rung = k => ladder[k] ? { name: ladder[k].name, card: ladder[k].card || "" } : null;
    if (ladder.minor || ladder.major || ladder.severe)
      eidon.push({ c, minor: rung("minor"), major: rung("major"), severe: rung("severe") });

    // An Eidon condition's card is where it says which standard condition it really is
    ["minor", "major", "severe"].forEach(k => {
      const card = (ladder[k]?.card || "").toLowerCase();
      CONDITIONS.forEach(s => { if (card.includes(s.name.toLowerCase())) add(inflict, s.name.toLowerCase(), c); });
    });

    const walk = o => {
      if (!o || typeof o !== "object") return;
      if (Array.isArray(o)) return o.forEach(walk);
      if (Array.isArray(o.conditions)) for (const x of o.conditions) {
        const n = String(x?.name || "").trim();
        if (!n || COND_NOT_A_NAME.test(n)) continue;
        if (COND_BY_NAME.has(n.toLowerCase())) add(inflict, n.toLowerCase(), c);
        else {
          if (!named.has(n)) named.set(n, []);
          if (!named.get(n).some(x => x.id === c.id)) named.get(n).push(c);
        }
      }
      Object.values(o).forEach(walk);
    };
    walk(cog.verumEffects); walk(cog.complementEffects);
  });

  eidon.sort((a, b) => a.c.name.localeCompare(b.c.name));
  // One list. A condition is a condition, whether 5e wrote it or a Cognition did, so the rail holds
  // them together and alphabetically — you look up Hollowed exactly the way you look up Prone.
  // Built from what this account's Cognitions actually name, not from the whole table: a player
  // who hasn't been granted Nightmare has no business seeing Nightling in a rail.
  const all = CONDITIONS.map(c => ({ ...c, kind: "std" }))
    .concat([...named.keys()].map(n => ({ name: n, kind: "named", ...(NAMED_STATES[n] || {}), cogs: named.get(n) })))
    .sort((a, b) => a.name.localeCompare(b.name));
  return (COND_USE = { inflict, eidon, named, all });
}
const condFind = name => (COND_USE?.all || []).find(c => c.name.toLowerCase() === String(name).toLowerCase());

// ═══════════════════════════════════════════════════════════
//  THE PAGES
// ═══════════════════════════════════════════════════════════
function openCondition(ref) {
  state.condRef = ref;
  renderConditionList(); renderCondition();
  const b = document.getElementById("conditionBody"); if (b) b.scrollTop = 0;
}
// The tab's entry point: the rail can't be drawn until the harvest knows which states exist
async function openConditionsView() {
  try { await conditionUse(); } catch (e) { console.warn("Conditions tab:", e); }
  renderConditionList(); renderCondition();
}

function renderConditionList() {
  const box = document.getElementById("conditionList"); if (!box) return;
  // The definitions come over the wire now, so there is a state where there are none — and a rail
  // that is silently empty reads as "this campaign has no conditions" rather than "ask again".
  if (!CONDITIONS.length) return void (box.innerHTML =
    `<div class="empty" style="padding:22px 8px">The conditions list could not be loaded.
       <button class="cog" onclick="openConditionsView()" style="margin-top:10px">Try again</button></div>`);
  const on = state.condRef || "overview";
  const q = (document.getElementById("condSearch")?.value || "").trim().toLowerCase();
  const hit = s => !q || s.toLowerCase().includes(q);
  const btn = (key, label, badge) => `<button class="cog${key === on ? " core" : ""}" onclick="openCondition('${escAttr(key)}')">
      <span class="nm">${esc(label)}</span>${badge || ""}</button>`;

  let h = "";
  if (!q) h += `<div class="rail-grp">The rules</div>` + btn("overview", "Overview")
    + `<div class="rail-grp">From the Cognitions</div>` + btn("eidon", "Eidon conditions");

  // Two groups, one list: 5e's own, then the ones this system made. Alphabetical within each, so
  // a name is still easy to find, but you always know which half of the game you are reading.
  const rows = (COND_USE?.all || CONDITIONS.map(c => ({ ...c, kind: "std" }))).filter(c => hit(c.name));
  const group = (title, kind) => {
    const list = rows.filter(c => c.kind === kind);
    if (!list.length) return "";
    return `<div class="rail-grp">${title} · ${list.length}</div>` + list.map(c => btn("c:" + c.name, c.name,
      c.status && c.status !== "same" ? `<span class="rl cnd-rl ${COND_STATUS[c.status].cls}">${COND_STATUS[c.status].label}</span>` : "")).join("");
  };
  h += group("Base conditions", "std") + group("Homebrew conditions", "named");

  box.innerHTML = rows.length || !q ? h : `<div class="empty" style="padding:22px 8px">Nothing matches “${esc(q)}”.</div>`;
}

// Cognition chips, the Damage tab's own — one click opens that Cognition in the Codex
const condChips = list => (list || []).length
  ? `<div class="dmg-cogs">${list.map(c => cogChip(c, false)).join("")}</div>`
  : `<span class="cdx-soon" style="padding:0">No Cognition applies it yet.</span>`;

// Conditions quote each other constantly — Buried is "Restrained", Ravenous is "a Starving
// creature", Dread-frozen is "Paralyzed with dread". Every mention becomes a link to that entry.
// Only tag text, never inside a tag, and only Capitalised matches, so the prose "bound to a
// prohibition" doesn't turn into a link to Bound while "is Bound" does.
const RX_ESC = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function condLinks(html, selfName) {
  const names = (COND_USE?.all || []).map(c => c.name)
    .filter(n => n !== selfName).sort((a, b) => b.length - a.length);
  if (!names.length || !html) return html;
  const rx = new RegExp(`(?<![\\w-])(${names.map(RX_ESC).join("|")})(?![\\w-])`, "g");
  return String(html).split(/(<[^>]*>)/).map(part => part.startsWith("<") ? part
    : part.replace(rx, m => `<button class="cnd-link" onclick="openCondition('c:${escAttr(m)}')" title="Open ${escQ(m)}">${m}</button>`)).join("");
}

async function renderCondition() {
  const host = document.getElementById("conditionBody"); if (!host) return;
  const use = await conditionUse();
  const ref = state.condRef || "overview";

  if (ref === "overview")  return void (host.innerHTML = condOverview(use));
  if (ref === "eidon")     return void (host.innerHTML = condEidon(use));
  const c = condFind(String(ref).slice(2));
  host.innerHTML = !c ? `<div class="empty">Pick a condition from the left.</div>`
    : c.kind === "named" ? condNamedOne(c, use) : condOne(c, use);
}

function condOverview(use) {
  const changed = CONDITIONS.filter(c => c.status !== "same");
  const BLURB = {
    Stunned: "Rewritten rather than retired. Halved Speed, no Reactions, an Action <em>or</em> a Bonus Action, and never more than one attack — it takes a turn apart without taking it away. <strong>Nothing in the system needs rewriting</strong>: every effect that says <em>Stunned</em> already means this.",
    Paralyzed: "Still brutal, but at the start of your turn you may <strong>Resist</strong> (repeat the save) or <strong>Force Through</strong> (a level of Exhaustion to act anyway). It reaches no other condition.",
  };
  return `<div class="cdx"><div class="cdx-hd"><div><h1>Conditions</h1>
      <p class="cdx-desc">5e's conditions as this table plays them, and the ones the Cognitions make for themselves.</p></div></div>

    <div class="cdx-sec"><h2>What changed</h2><div class="cdx-defs">` +
      changed.map(c => `<div class="cdx-def"><b>${esc(c.name)} <span class="cnd-tag ${COND_STATUS[c.status].cls}">${COND_STATUS[c.status].label}</span></b>
        <span>${BLURB[c.name] || ""}</span></div>`).join("") +
    `</div><p class="cdx-rings">Everything else is <strong>5e as written</strong> — the two above are the whole of the house rule, and they point the same way: <strong>a condition should ruin your turn, not delete it.</strong></p></div>

    <div class="cdx-sec"><h2>The rules behind all of them</h2>
      <p class="cdx-rings">The handful that settle most condition arguments before they start. Each base condition's own page carries the questions it raises in particular.</p>
      <div class="cdx-defs">
      <div class="cdx-def"><b>Advantage and disadvantage never stack</b><span>Any number of sources of each <strong>cancel to a single straight roll</strong>. A blinded creature attacking an unseen target rolls one die, not two of anything.</span></div>
      <div class="cdx-def"><b>Conditions don't stack either</b><span>Having a condition twice is having it once. Durations run independently, so the longest one governs when it ends.</span></div>
      <div class="cdx-def"><b>Saving throws are not ability checks</b><span>A condition that hits "ability checks" — <strong>Poisoned</strong>, <strong>Frightened</strong> — leaves saving throws alone. This is the most misplayed line in the whole system.</span></div>
      <div class="cdx-def"><b>Auto-failing Dex saves means full damage</b><span><strong>Paralyzed</strong>, <strong>Petrified</strong> and <strong>Unconscious</strong> auto-fail Strength and Dexterity saves, so every area effect lands in full. Combined with the melee auto-crit, this is what makes them lethal rather than merely bad.</span></div>
      <div class="cdx-def"><b>Incapacitated breaks concentration</b><span>And so does everything that includes it. It is the quickest way to end an enemy's spell.</span></div>
      <div class="cdx-def"><b>A condition is not its spell</b><span>The <em>Invisibility spell</em> ends when you attack; the <strong>Invisible</strong> condition doesn't. Read the effect that applied it before you read the condition.</span></div>
    </div></div>

    <div class="cdx-sec"><h2>Where conditions come from</h2><div class="cdx-defs">
      <div class="cdx-def"><b>A seal</b><span>A Control Ring, or a Verum Effect that names one. The Cognition's own <strong>Main Saving Throw</strong> resists it, against your <strong>Verum DC</strong>.</span></div>
      <div class="cdx-def"><b>An Eidon or Ignition</b><span>The <strong>Status</strong> Template inflicts its primary Cognition's own condition free at Rank I, and power dice raise it from minor to major to severe. <strong>Zone</strong> can buy the minor one for 1d12.</span></div>
      <div class="cdx-def"><b>A Paragon</b><span>A Devotion's abilities name their own, and they are written per character.</span></div>
    </div></div>

    <div class="cdx-sec"><h2>One list</h2><div class="cdx-defs">
      <div class="cdx-def"><b>${CONDITIONS.length} standard · ${use.named.size} from the Cognitions</b><span>They sit together in the rail, alphabetically — a condition is a condition, and you look up <em>Hollowed</em> the way you look up <em>Prone</em>. The ones a Cognition made are marked <em>From the Cognitions</em> on their own page. <strong>Use the search box</strong> at the top of the rail.</span></div>
      <div class="cdx-def"><b>Eidon ladders</b><span>Separately, <strong>${use.eidon.length}</strong> Cognitions carry a <strong>minor / major / severe</strong> condition of their own — ${use.eidon.length * 3} in all. See <em>Eidon conditions</em>.</span></div>
      <div class="cdx-def"><b>Where the definitions come from</b><span>Which states exist and who inflicts them is read from the Cognition files, so it can't drift. The rules written on each are drawn from the effect text that applies it, stated once instead of leaving you to hunt the tier that said it.</span></div>
    </div></div></div>`;
}

function condOne(c, use) {
  const st = COND_STATUS[c.status];
  const who = use.inflict[c.name.toLowerCase()] || [];
  let h = `<div class="cdx"><div class="cdx-hd"><div>
      <h1>${esc(c.name)}</h1>
      <div class="c-tags" style="margin-top:9px"><span class="t cnd-tag ${st.cls}">${st.label}</span>${
        c.sub ? `<span class="t">${esc(c.sub)}</span>` : ""}</div></div></div>`;

  const L = t => condLinks(t, c.name);

  if (c.bullets) h += `<div class="cdx-sec"><h2>Rules</h2><div class="cdx-note"><ul class="cnd-ul">` +
    c.bullets.map(b => `<li>${L(esc(b))}</li>`).join("") + `</ul></div></div>`;

  if (c.extra) h += `<div class="cdx-sec"><h2>Resist, or Force Through</h2>
    <p class="cdx-rings">${esc(c.extra.lead)}</p><div class="cdx-defs">` +
    c.extra.defs.map(([n, t]) => `<div class="cdx-def"><b>${esc(n)}</b><span>${L(esc(t))}</span></div>`).join("") +
    `</div><p class="cdx-rings">${esc(c.extra.tail)}</p></div>`;

  if (c.reach) h += `<div class="cdx-sec"><h2>How far it reaches</h2><div class="cdx-defs">` +
    c.reach.map(([n, t]) => `<div class="cdx-def"><b>${esc(n)}</b><span>${L(t)}</span></div>`).join("") + `</div></div>`;

  if (c.note) h += `<div class="cdx-sec"><h2>Why</h2><div class="cdx-note"><p>${L(c.note)}</p></div></div>`;

  // The arguments this condition actually starts — the ones that come up at every table and all
  // over the internet, answered once so they don't have to be answered again mid-combat.
  if (c.qa) h += `<div class="cdx-sec"><h2>Questions it always raises</h2><div class="cnd-qa">` +
    c.qa.map(([q, a]) => `<div class="cnd-q"><b>${L(q)}</b><p>${L(a)}</p></div>`).join("") + `</div></div>`;

  h += `<div class="cdx-sec"><h2>Applied by</h2>
    <p class="cdx-rings">Cognitions with a Verum, Sigil or Eidon condition that applies ${esc(c.name)}.</p>
    ${condChips(who)}</div>`;
  return h + `</div>`;
}

function condEidon(use) {
  const row = r => `<tr>
    <td>${cogIcon(r.c)} ${esc(r.c.name)}</td>
    <td class="wrap"><b>${esc(r.minor?.name || "—")}</b>${r.minor?.card ? `<em>${esc(r.minor.card)}</em>` : ""}</td>
    <td class="wrap"><b>${esc(r.major?.name || "—")}</b>${r.major?.card ? `<em>${esc(r.major.card)}</em>` : ""}</td>
    <td class="wrap"><b>${esc(r.severe?.name || "—")}</b>${r.severe?.card ? `<em>${esc(r.severe.card)}</em>` : ""}</td></tr>`;

  return `<div class="cdx"><div class="cdx-hd"><div><h1>Eidon conditions</h1>
      <p class="cdx-desc">Every Cognition's own three — what it does to a body when it is the Core of the blow.</p></div></div>

    <div class="cdx-sec"><h2>How they are used</h2><div class="cdx-defs">
      <div class="cdx-def"><b>Status Template</b><span>Inflicts the <strong>minor</strong> one free at Rank I. <strong>2d12</strong> raises it to major, <strong>3d12</strong> to severe, and once raised <strong>1d12</strong> stacks the minor back on top.</span></div>
      <div class="cdx-def"><b>Zone Template</b><span><strong>1d12</strong> applies the minor one to everything that fails.</span></div>
      <div class="cdx-def"><b>Which Cognition's</b><span>Always the <strong>primary</strong> Burning Cognition's. Sigils lend their Verum, never their conditions.</span></div>
      <div class="cdx-def"><b>The save</b><span>The primary Cognition's Main Saving Throw, against your <strong>Verum DC</strong>.</span></div>
    </div></div>

    <div class="cdx-sec"><h2>All ${use.eidon.length}</h2>
      <p class="cdx-rings">Several of the severe ones read <em>Stunned</em>; under the retirement rule they are <strong>Dazed</strong>.</p>
      <div class="tbl-wrap"><table class="tbl cnd-tbl"><thead><tr>
        <th>Cognition</th><th>Minor</th><th>Major</th><th>Severe</th></tr></thead><tbody>` +
      use.eidon.map(row).join("") + `</tbody></table></div></div></div>`;
}

// ═══════════════════════════════════════════════════════════
//  NAMED STATES — defined, not just listed
// ═══════════════════════════════════════════════════════════
// Every state a Verum applies by name, written out as a real condition, with the duration the
// effects agree on where they agree on one. They are in `sheet/js/conditions.js` beside the
// standard ones — the initiative board seeds its library from the same definitions — and arrive
// here in `NAMED_STATES` from `/api/conditions`.

// A condition a Cognition made. Same page shape as a standard one — rules, duration, who applies it
// — so that moving between the two reads as one reference rather than two.
function condNamedOne(c, use) {
  if (!c.def) console.warn(`Conditions tab: no definition written for “${c.name}”`);
  const cogs = c.cogs || [];
  return `<div class="cdx"><div class="cdx-hd"><div>
      <h1>${esc(c.name)}</h1>
      <div class="c-tags" style="margin-top:9px">
        <span class="t cnd-tag cs-cog">Homebrew — from the Cognitions</span>
        ${c.dur ? `<span class="t">${esc(c.dur)}</span>` : ""}
        ${cogs.length > 1 ? `<span class="t">named by ${cogs.length}</span>` : ""}
      </div></div></div>

    <div class="cdx-sec"><h2>Rules</h2><div class="cdx-note">
      <p>${condLinks(c.def, c.name) || `<span style="opacity:.6">No definition written yet — the effect that applies it defines it.</span>`}</p>
      ${c.dur ? `<p class="cdx-rings" style="margin:7px 0 0">Normally lasts <strong>${esc(c.dur)}</strong>, where the effects agree on one.</p>` : ""}
    </div></div>` +

    (c.see ? `<div class="cdx-sec"><h2>It has its own rules</h2><div class="cdx-note cnd-see-note">
      <p>This state has <strong>rules of its own</strong> in the vault — see <strong>${c.see}</strong>. Those govern; the line above is the summary.</p></div></div>` : "") +

    `<div class="cdx-sec"><h2>Applied by</h2>
      <p class="cdx-rings">Cognitions with a Verum or Sigil that applies ${esc(c.name)} by name.</p>
      ${condChips(cogs)}</div></div>`;
}
