// Ephemer — the character sheet page.
//
// This file is the wiring: it holds one character's state, draws the panels, and saves. Every
// number it shows comes out of sheet-rules.js, which knows the rules and nothing about the DOM —
// so if a total looks wrong, the bug is in one of two places and the test suite covers one of them.
//
// Persistence has two modes, the same bargain the rest of the app makes. Served by its own server
// there is an account and `/api/characters`; opened as plain files there is no api/ at all, and the
// sheet keeps itself in localStorage so it still works at a table with no network. The footer says
// which mode you are in, because "my changes vanished" is otherwise a very confusing evening.
//
// What a player may NOT change is enforced in two places and meant seriously in one of them: the
// inputs for level and Dream are disabled here as a courtesy, and the server refuses to write them
// from a player's route, which is the part that counts. See DM-009 and DM-01/02.

import * as R from "./sheet-rules.js";

const $ = id => document.getElementById(id);
const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };

// ── State ──────────────────────────────────────────────────
const BLANK = () => ({
  id: null, name: "", ancestry: "", class: "", background: "",
  level: 1, dream: 10,
  scores: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
  saves: {}, skills: {}, skillAbility: {}, skillMisc: {}, saveMisc: {},
  ac: 10, speed: 30, hitDice: "", hp: 0, hpMax: 0, hpTemp: 0,
  wounds: 0, injuries: 0, exhaustion: 0, dreamExhaustion: 0,
  honorOrder: 0, honorChaos: 0, moralityGood: 0, moralityEvil: 0,
  honorUnspent: 0, moralityUnspent: 0,
  fate: 0, attuned: [], attunementBonus: 0, senseSpent: 0,
  notes: "",
});

let ch = BLANK();
let roster = [];
let me = null;              // the signed-in account, or null on a static host
let online = false;         // whether /api/ answered at all
let inDream = false;
let concDamage = 0;

const isDm = () => me?.role === "dm";
// Level and Dream are the DM's. On a static host there is nobody to ask, so the sheet unlocks
// them rather than leaving a solo user unable to write down what level they are.
const mayGrant = () => !online || isDm();

// ── Saving ─────────────────────────────────────────────────
const LS_KEY = "ephemer.sheet.v1";
let saveTimer = null, saving = false;

function setSaved(state, text) {
  const n = $("saveState");
  n.dataset.state = state || "";
  n.textContent = text || "";
}

function queueSave() {
  clearTimeout(saveTimer);
  setSaved("saving", "saving…");
  saveTimer = setTimeout(save, 600);
}

async function save() {
  if (saving) return queueSave();
  saving = true;
  try {
    if (online) {
      // The player's route carries only what a player owns. Level, Dream, the Fate balance and
      // the alignment sub-scores are left out on purpose — they have their own DM routes, and
      // sending them here would only be refused.
      const body = {
        name: ch.name,
        sheet: {
          ancestry: ch.ancestry, class: ch.class, background: ch.background,
          scores: ch.scores, saves: ch.saves, skills: ch.skills,
          skillAbility: ch.skillAbility, skillMisc: ch.skillMisc, saveMisc: ch.saveMisc,
          ac: ch.ac, speed: ch.speed, hitDice: ch.hitDice,
          hp: ch.hp, hpMax: ch.hpMax, hpTemp: ch.hpTemp,
          wounds: ch.wounds, injuries: ch.injuries,
          exhaustion: ch.exhaustion, dreamExhaustion: ch.dreamExhaustion,
          attuned: ch.attuned, attunementBonus: ch.attunementBonus,
          senseSpent: ch.senseSpent, notes: ch.notes,
        },
      };
      const r = await fetch(`api/characters/${ch.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Save failed.");
    } else {
      const all = loadLocal();
      all[ch.id] = ch;
      localStorage.setItem(LS_KEY, JSON.stringify(all));
    }
    setSaved("", "saved");
  } catch (e) {
    setSaved("error", "not saved");
    toast(e.message || "Could not save.");
  } finally {
    saving = false;
  }
}

function loadLocal() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch { return {}; }
}

function toast(msg) {
  const t = $("toast");
  if (!t) return;
  t.textContent = msg; t.classList.add("on");
  setTimeout(() => t.classList.remove("on"), 2600);
}

// ── Draw ───────────────────────────────────────────────────
function render() {
  document.body.classList.toggle("in-dream", inDream);
  renderIdentity();
  renderScores();
  renderSaves();
  renderCogst();
  renderCombat();
  renderWounds();
  renderExhaustion();
  renderAxes();
  renderFate();
  renderAttune();
  renderSkills();
  renderSense();
  $("foot").innerHTML = online
    ? `Saved to your account. Level and Dream are the DM's to set.`
    : `No server here, so this sheet lives in <b>this browser only</b> — open it from the Ephemer server to save it to your account.`;
}

function renderIdentity() {
  $("fName").value = ch.name;
  $("fAncestry").value = ch.ancestry;
  $("fClass").value = ch.class;
  $("fBackground").value = ch.background;
  const lv = $("fLevel");
  lv.value = ch.level;
  lv.disabled = !mayGrant();
  lv.closest("label").title = mayGrant()
    ? "You may set this"
    : "DM-009 — only the DM may grant, set or roll back a level";
  $("oProf").textContent = R.signed(R.profBonus(ch.level));
}

function renderScores() {
  const box = $("scores");
  box.innerHTML = "";
  for (const a of R.ABILITIES) {
    const n = el("div", "sc");
    n.innerHTML = `<h3>${R.ABILITY_NAMES[a].slice(0, 3)}</h3>
      <input type="number" min="1" max="30" value="${ch.scores[a]}" aria-label="${R.ABILITY_NAMES[a]}">
      <div class="sc-mod">${R.signed(R.mod(ch.scores[a]))}</div>`;
    n.querySelector("input").addEventListener("input", e => {
      ch.scores[a] = R.clamp(e.target.value, 1, 30);
      n.querySelector(".sc-mod").textContent = R.signed(R.mod(ch.scores[a]));
      renderSaves(); renderCogst(); renderSkills(); renderCombat();
      queueSave();
    });
    box.appendChild(n);
  }
  // Dream sits in the same row as the six, because it is one of the seven — but it is marked,
  // and it is the DM's.
  const d = el("div", "sc dream");
  d.innerHTML = `<h3>Dream</h3>
    <input type="number" min="0" max="30" value="${ch.dream}" aria-label="Dream"${mayGrant() ? "" : " disabled"}>
    <div class="sc-mod">${R.signed(R.mod(ch.dream))}</div>`;
  d.title = mayGrant() ? "Starts at 10; only a campaign event raises it" : "DM-02 — raised only by a campaign event";
  // `change`, not `input`: a DM typing "16" should not fire three campaign events on the way.
  d.querySelector("input").addEventListener("change", e => {
    const v = R.clamp(e.target.value, 0, 30);
    if (v === ch.dream) return;
    if (online) {
      const note = prompt("Dream moves only by a campaign event. Which one?", "");
      if (!note) { e.target.value = ch.dream; return; }     // cancelled — put it back
      dmSet("dream", v, note);
      return;
    }
    ch.dream = v;
    d.querySelector(".sc-mod").textContent = R.signed(R.mod(ch.dream));
    renderSaves(); renderCogst(); renderSkills(); renderSense();
    queueSave();
  });
  box.appendChild(d);
}

function row(name, total, abbr, { dream = false, onPip = null, train = 0, extra = "" } = {}) {
  const n = el("div", "rw" + (dream ? " is-dream" : ""));
  n.innerHTML =
    (onPip ? `<button class="pip" data-t="${train}" aria-label="Proficiency" title="None → proficient → expertise"></button>` : `<span class="pip" style="visibility:hidden"></span>`) +
    `<span class="rw-t">${R.signed(total)}</span><span class="rw-n">${name}</span>${extra}<span class="rw-a">${abbr}</span>`;
  if (onPip) n.querySelector(".pip").addEventListener("click", onPip);
  return n;
}

function renderSaves() {
  const box = $("saves");
  box.innerHTML = "";
  for (const a of [...R.ABILITIES, "dream"]) {
    const s = R.saveTotal(ch, a);
    const n = row(R.ABILITY_NAMES[a], s.total, a === "dream" ? "dream" : a, {
      dream: a === "dream", train: ch.saves?.[a] ? 1 : 0,
      onPip: () => { ch.saves[a] = !ch.saves[a]; renderSaves(); queueSave(); },
    });
    n.title = s.parts.map(p => `${p.label} ${R.signed(p.value)}`).join("  ·  ");
    box.appendChild(n);
  }
}

function renderCogst() {
  const c = R.cognitiveSave(ch);
  $("cogst").innerHTML = `
    <h3>Cognitive Saving Throw <span class="cog-t">d20 ${R.signed(c.total)}</span></h3>
    <p class="cog-p">${c.parts.map(p => `${p.label} <b>${R.signed(p.value)}</b>`).join(" &nbsp;+&nbsp; ")}</p>
    <p class="cog-x">${c.excludes}</p>`;
}

function renderCombat() {
  $("fAc").value = ch.ac; $("fSpeed").value = ch.speed;
  $("fHitDice").value = ch.hitDice;
  $("fHp").value = ch.hp; $("fHpMax").value = ch.hpMax; $("fHpTemp").value = ch.hpTemp;
  $("oInit").textContent = R.signed(R.initiative(ch).total);

  const ds = R.deathSaveDc(ch), cd = R.concentrationDc(ch, concDamage);
  $("combatDc").innerHTML = `
    <div class="dc"><b>Death Save DC</b><div class="dc-v">${ds.dc}</div>
      <div class="dc-p">${ds.parts.map(p => `${p.label} ${p.value}`).join(" + ")}</div></div>
    <div class="dc"><b>Concentration DC <input type="number" id="fConc" min="0" max="999" value="${concDamage}" aria-label="Damage taken"></b>
      <div class="dc-v">${cd.dc}</div>
      <div class="dc-p">${cd.parts.map(p => `${p.label} ${p.value}`).join(" + ")}</div></div>`;
  $("fConc").addEventListener("input", e => { concDamage = R.clamp(e.target.value, 0, 999); renderCombat(); });
}

function pipRow(cls, count, max, onSet) {
  const p = el("div", "pips" + (cls ? " " + cls : ""));
  for (let i = 1; i <= max; i++) {
    const b = el("button", null, String(i));
    b.setAttribute("aria-pressed", i <= count ? "true" : "false");
    b.addEventListener("click", () => onSet(i === count ? i - 1 : i));   // click the lit one to step back
    p.appendChild(b);
  }
  return p;
}

function renderWounds() {
  const box = $("wounds");
  box.innerHTML = "";

  const w = el("div", "track", "<h3>Active Wounds</h3>");
  w.appendChild(pipRow(null, ch.wounds, 6, v => {
    ch.wounds = v;
    const inj = R.injuryFromWounds(ch);
    if (inj) {
      ch.injuries = inj.injuries; ch.wounds = inj.wounds;
      toast(inj.prompt);
    }
    renderWounds(); renderCombat(); queueSave();
  }));
  const say = el("p", "track-say");
  say.innerHTML = ch.wounds >= 6
    ? `<span class="warn">Six Wounds.</span> The DM determines the Injury; Wounds then reset to the number of active Injuries, capped at five.`
    : `Two uninterrupted Safe Haven long rests clear Wounds entirely. A heal of 4th level or higher removes <b>spell level − 3</b>.`;
  w.appendChild(say);
  box.appendChild(w);

  const i = el("div", "track", "<h3>Unhealed Injuries</h3>");
  i.appendChild(pipRow(null, ch.injuries, 5, v => { ch.injuries = v; renderWounds(); renderCombat(); queueSave(); }));
  i.appendChild(el("p", "track-say", `Injuries heal by their own recorded rule — <b>never</b> as a side effect of clearing Wounds.`));
  box.appendChild(i);
}

function renderExhaustion() {
  const box = $("exhaustion");
  box.innerHTML = "";

  const a = el("div", "track", "<h3>Exhaustion — standard</h3>");
  a.appendChild(pipRow(null, ch.exhaustion, 6, v => { ch.exhaustion = v; renderExhaustion(); queueSave(); }));
  a.appendChild(el("p", "track-say", `2014's track, unchanged. It is also what <b>Forcing Through</b> a paralysis costs.`));
  box.appendChild(a);

  const d = el("div", "track", "<h3>Dream Exhaustion — 0 to 8</h3>");
  d.appendChild(pipRow("dream", ch.dreamExhaustion, 8, v => { ch.dreamExhaustion = v; renderExhaustion(); queueSave(); }));
  const st = R.dreamExhaustion(ch.dreamExhaustion, inDream);
  const now = el("div", "exh-now");
  now.innerHTML = `
    <span class="en-p">${st.applied ? R.signed(st.applied) : "—"}</span>
    <span class="en-n">${st.level} · ${st.name}</span>
    <p class="en-e">${st.effect}</p>
    ${st.cumulative ? `<p class="en-c">Cumulative: the −5 from Loop Entrapment is still on at ${st.level}, alongside this rung's own effect.</p>` : ""}
    ${!inDream && st.penalty ? `<p class="en-c">You are awake, so the ${st.penalty} does not apply to this roll.</p>` : ""}
    ${st.concentrationDisadvantage ? `<p class="en-c">Irrefutable disadvantage on Concentration checks.</p>` : ""}
    ${st.inspirationBlocked ? `<p class="en-c">You cannot benefit from Inspiration while in dream.</p>` : ""}`;
  d.appendChild(now);

  if (ch.dreamExhaustion === 8) {
    const b = el("button", "mini", "Survived the Collapse");
    b.title = "Wakes you, adds four physical Exhaustion, and leaves Dream Exhaustion at 8";
    b.addEventListener("click", () => {
      const out = R.collapseSurvived(ch);
      ch.exhaustion = Math.min(6, out.exhaustion);
      ch.dreamExhaustion = out.dreamExhaustion;     // 8, deliberately
      toast(out.prompt);
      renderExhaustion(); queueSave();
    });
    d.appendChild(b);
  }

  const rest = el("button", "mini", "Long rest without Dream Walking");
  rest.addEventListener("click", () => {
    ch.dreamExhaustion = R.dreamRestRecovery(ch.dreamExhaustion, false);
    renderExhaustion(); queueSave();
  });
  d.appendChild(rest);
  box.appendChild(d);
}

function axisPanel(title, aKey, bKey, aName, bName, unspentKey, calc) {
  const n = el("div", "axis");
  const totals = calc(ch);
  const unspent = ch[unspentKey] || 0;
  n.innerHTML = `<h3>${title}<span>${totals.total}</span></h3>
    <div class="axis-pair">
      <div class="axis-sub"><b>${aName}</b><div class="as-v">${ch[aKey]}</div>
        <button data-k="${aKey}"${unspent ? "" : " disabled"}>+1</button></div>
      <div class="axis-sub"><b>${bName}</b><div class="as-v">${ch[bKey]}</div>
        <button data-k="${bKey}"${unspent ? "" : " disabled"}>+1</button></div>
    </div>
    <p class="axis-say">${
      totals.dominant
        ? `A check <b>aligned with ${totals.dominant}</b> takes <b>${R.signed(Math.abs(totals.modifier) || 0)}</b>; one against it takes <b>${R.signed(-Math.abs(totals.modifier))}</b>.`
        : `Tied, so a situational check takes <b>+0</b> either way.`
    }${unspent ? `<span class="unspent">${unspent} to spend</span>` : ""}</p>`;
  n.querySelectorAll("button[data-k]").forEach(b => b.addEventListener("click", () => {
    if (!ch[unspentKey]) return;
    allocate(AXIS_OF[b.dataset.k]);
  }));
  return n;
}

const AXIS_OF = { honorOrder: "order", honorChaos: "chaos", moralityGood: "good", moralityEvil: "evil" };
const AXIS_FIELD = { order: "honorOrder", chaos: "honorChaos", good: "moralityGood", evil: "moralityEvil" };
const AXIS_POOL = { order: "honorUnspent", chaos: "honorUnspent", good: "moralityUnspent", evil: "moralityUnspent" };

// Spending an allocation is the server's to do — it is the guard that stops two clicks spending
// one point twice, and offline there is no pool to spend from anyway unless the DM seeded one.
async function allocate(into) {
  if (!online) {
    ch[AXIS_FIELD[into]]++; ch[AXIS_POOL[into]]--;
    renderAxes(); queueSave();
    return;
  }
  try {
    const r = await fetch(`api/characters/${ch.id}/allocate`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ into }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || "Could not allocate.");
    Object.assign(ch, pickLocked(d.character));
    renderAxes();
  } catch (e) { toast(e.message); }
}

/** The columns the server owns, lifted off a fresh row so the page agrees with it again. */
const pickLocked = c => ({
  level: c.level, dream: c.dream, fate: c.fate,
  honorOrder: c.honorOrder, honorChaos: c.honorChaos,
  moralityGood: c.moralityGood, moralityEvil: c.moralityEvil,
  honorUnspent: c.honorUnspent, moralityUnspent: c.moralityUnspent,
});

// A DM changing a level or a Dream score goes through the DM routes, not the save — the save
// would quietly drop them. Dream asks for the event, because the server insists on one and the
// ruling is the reason: a score that moved for no recorded reason is the thing DM-02 forbids.
async function dmSet(what, value, note) {
  try {
    const r = await fetch(`api/characters/${ch.id}/${what}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [what]: value, note }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || "Refused.");
    Object.assign(ch, pickLocked(d.character));
    render();
    setSaved("", "saved");
  } catch (e) { toast(e.message); render(); }
}

function renderAxes() {
  const box = $("axes");
  box.innerHTML = "";
  box.appendChild(axisPanel("Honor", "honorOrder", "honorChaos", "Order", "Chaos", "honorUnspent",
    c => { const h = R.honor(c); return { total: h.total, modifier: h.modifier, dominant: h.dominant }; }));
  box.appendChild(axisPanel("Morality", "moralityGood", "moralityEvil", "Good", "Evil", "moralityUnspent",
    c => { const m = R.morality(c); return { total: m.total, modifier: m.modifier, dominant: m.dominant }; }));
}

function renderFate() {
  const box = $("fate");
  box.innerHTML = `
    <div class="fate-bal"><span class="fb-v">${ch.fate}</span>
      <span class="fb-l">${ch.fate === 1 ? "charge" : "charges"}, granted by the DM.
      ${ch.fate ? "" : "Nothing here recharges — ask at the table."}</span></div>
    <div class="fate-roll">
      <button id="rollFate"${ch.fate ? "" : " disabled"}>Roll with Emphasis</button>
      <span id="fateDice"></span>
    </div>
    <p class="fate-say" id="fateSay">Keep the face <b>farthest from 10</b>. Equidistant faces reroll both dice — the higher-die variant is not active here.</p>`;

  $("rollFate").addEventListener("click", () => {
    if (!ch.fate) return;
    const d20 = () => 1 + Math.floor(Math.random() * 20);
    let out, rerolls = 0;
    do { out = R.emphasis([d20(), d20()]); rerolls++; } while (out.tie && rerolls < 25);
    $("fateDice").innerHTML = out.rolls.map(v =>
      `<span class="die${v === out.kept ? " kept" : ""}">${v}</span>`).join(" ");
    $("fateSay").innerHTML = `Kept <b>${out.kept}</b>. ${out.reason}
      ${rerolls > 1 ? `<br><i>${rerolls - 1} tie${rerolls > 2 ? "s" : ""} rerolled on the way.</i>` : ""}
      <br>The DM redoes the event with this roll and retcons its outcome; the original stays in the log, superseded.`;
    // Spending is the server's call when there is one — the balance shown here is optimistic and
    // reconciles on the next load. Offline it is simply the local count.
    ch.fate = Math.max(0, ch.fate - 1);
    spendFate();
    renderFate();
  });
}

async function spendFate() {
  if (!online) return queueSave();
  try {
    const r = await fetch(`api/characters/${ch.id}/fate/spend`, { method: "POST" });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Could not spend the charge.");
    const d = await r.json();
    if (typeof d.fate === "number") { ch.fate = d.fate; renderFate(); }
  } catch (e) { toast(e.message); }
}

function renderAttune() {
  const a = R.attunement(ch, { inInsomnia: inDream });
  const slots = (n, used, cls, dim) => Array.from({ length: n }, (_, i) =>
    `<span class="slot ${cls}${i < used ? " full" : ""}${dim ? " dim" : ""}"></span>`).join("");
  $("attune").innerHTML = `
    <div class="att-row"><b>Baseline — ${a.used} of ${a.baseline}</b>
      <div class="slots">${slots(a.baseline, a.used, "")}</div>
      ${a.over ? `<p class="att-say warn">Over the cap.</p>` : ""}</div>
    <div class="att-row"><b>Insomnia — Dreamlike &amp; Lucidlike, ${a.planarUsed} of ${a.planarSlots}</b>
      <div class="slots">${slots(a.planarSlots, a.planarUsed, "planar", !a.planarActive)}</div>
      <p class="att-say${a.planarActive ? "" : " off"}">${a.planarNote}</p></div>`;
}

function renderSkills() {
  const box = $("skills");
  box.innerHTML = "";
  const all = [...R.DREAM_SKILLS, ...R.CUSTOM_SKILLS, ...R.SKILLS_2014];
  for (const s of all) {
    const t = R.skillTotal(ch, s);
    let extra = "";
    if (s.choices) {
      extra = `<select data-skill="${s.key}" aria-label="${s.name}'s ability">` +
        s.choices.map(c => `<option value="${c}"${t.ability === c ? " selected" : ""}>${c.toUpperCase()}</option>`).join("") +
        `</select>`;
    }
    const n = row(s.name, t.total, t.ability === "dream" ? "dream" : t.ability, {
      dream: t.ability === "dream", train: t.train, extra,
      onPip: () => { ch.skills[s.key] = ((ch.skills[s.key] || 0) + 1) % 3; renderSkills(); queueSave(); },
    });
    n.title = t.parts.map(p => `${p.label} ${R.signed(p.value)}`).join("  ·  ") + (s.note ? `\n${s.note}` : "");
    const sel = n.querySelector("select");
    if (sel) sel.addEventListener("change", e => {
      ch.skillAbility[s.key] = e.target.value; renderSkills(); queueSave();
    });
    box.appendChild(n);
  }
}

function renderSense() {
  const uses = R.cognitiveSenseUses(ch.dream);
  const spent = Math.min(ch.senseSpent || 0, uses);
  const left = uses - spent;
  const dots = Array.from({ length: uses }, (_, i) => `<span class="use${i < spent ? " spent" : ""}"></span>`).join("");
  $("sense").innerHTML = `
    <div>
      <div class="sense-uses">${dots}
        <span class="sense-out" style="min-height:0">${left} of ${uses} left${uses === 2 ? " (Dream 18+)" : ""}</span></div>
      <div class="sense-modes">
        <button id="pulse"${inDream && left ? "" : " disabled"}>Pulse</button>
        <button id="whisper"${inDream && left ? "" : " disabled"}>Whisper</button>
        <button id="senseRest" class="mini">Short rest</button>
      </div>
      ${inDream ? "" : `<p class="sense-out" style="color:var(--mute);font-style:italic">Usable in Insomnia only.</p>`}
    </div>
    <div><div class="sense-out" id="senseOut">One activation of <b>either</b> mode spends one use — they share the pool.</div>
      <table class="band-table" id="bands">${R.WHISPER_BANDS.map(b =>
        `<tr data-min="${b.min}"><td>${b.max > 90 ? `${b.min}+` : `${b.min}–${b.max}`}</td><td>${b.learn}</td></tr>`).join("")}</table></div>`;

  $("senseRest").addEventListener("click", () => { ch.senseSpent = 0; renderSense(); queueSave(); });

  $("pulse").addEventListener("click", () => {
    const d4 = 1 + Math.floor(Math.random() * 4);
    ch.senseSpent = spent + 1;
    renderSense();
    $("senseOut").innerHTML = `<b>Pulse — ${d4} × 100 = ${d4 * 100} feet.</b> The DM gives you the direction, distance and general resonance of the strongest Cognition in range. Weaker ones and any imagery are theirs to offer or withhold.`;
    queueSave();
  });

  $("whisper").addEventListener("click", () => {
    const roll = 1 + Math.floor(Math.random() * 20);
    const total = roll + R.mod(ch.dream) + (ch.skills?.reveal ? R.profBonus(ch.level) : 0);
    const band = R.whisperBand(total);
    ch.senseSpent = spent + 1;
    renderSense();
    $("senseOut").innerHTML = `<b>Whisper — Reveal check ${total}</b> <i>(d20 ${roll} ${R.signed(R.mod(ch.dream))} Dream${ch.skills?.reveal ? ` ${R.signed(R.profBonus(ch.level))} proficiency` : ""})</i><br>${band.learn}`;
    const hit = document.querySelector(`#bands tr[data-min="${band.min}"]`);
    if (hit) hit.classList.add("hit");
    queueSave();
  });
}

// ── Plain fields ───────────────────────────────────────────
function bindField(id, key, { number = false, lo = 0, hi = 999 } = {}) {
  const n = $(id);
  if (!n) return;
  n.addEventListener("input", e => {
    ch[key] = number ? R.clamp(e.target.value, lo, hi) : e.target.value;
    if (key === "level") { renderIdentity(); renderSaves(); renderSkills(); renderCogst(); }
    if (key === "hp" || key === "hpMax") renderCombat();
    queueSave();
  });
}

// ── Roster ─────────────────────────────────────────────────
function fillPicker() {
  const p = $("charPick");
  if (roster.length < 2) { p.hidden = true; return; }
  p.hidden = false;
  p.innerHTML = roster.map(c => `<option value="${c.id}"${c.id === ch.id ? " selected" : ""}>${c.name || "Unnamed"}</option>`).join("");
}

async function newCharacter() {
  const c = BLANK();
  c.name = "New character";
  if (online) {
    const r = await fetch("api/characters", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: c.name }),
    });
    if (!r.ok) { toast("Could not create the character."); return; }
    const d = await r.json();
    c.id = d.character.id;
  } else {
    c.id = "local-" + Date.now().toString(36);
  }
  ch = c; roster.push({ id: c.id, name: c.name });
  $("sheet").hidden = false; $("empty").hidden = true;
  fillPicker(); render(); save();
}

function adopt(raw) {
  // A server row is { id, name, level, dream, fate, honor_*, sheet } — the sheet blob holds the
  // rest. A localStorage record is already the whole thing.
  const base = BLANK();
  if (raw.sheet && typeof raw.sheet === "object") {
    Object.assign(base, raw.sheet, {
      id: raw.id, name: raw.name, level: raw.level, dream: raw.dream, fate: raw.fate,
      honorOrder: raw.honorOrder ?? 0, honorChaos: raw.honorChaos ?? 0,
      moralityGood: raw.moralityGood ?? 0, moralityEvil: raw.moralityEvil ?? 0,
      honorUnspent: raw.honorUnspent ?? 0, moralityUnspent: raw.moralityUnspent ?? 0,
    });
  } else {
    Object.assign(base, raw);
  }
  // Guard the shapes a hand-edited or older record might be missing, so one absent key cannot
  // take the whole page down.
  base.scores = { ...BLANK().scores, ...(base.scores || {}) };
  for (const k of ["saves", "skills", "skillAbility", "skillMisc", "saveMisc"]) base[k] = base[k] || {};
  base.attuned = Array.isArray(base.attuned) ? base.attuned : [];
  return base;
}

// ── Boot ───────────────────────────────────────────────────
async function boot() {
  bindField("fName", "name"); bindField("fAncestry", "ancestry");
  bindField("fClass", "class"); bindField("fBackground", "background");
  // The level is the DM's, and on a server it travels by its own route so the allocations a
  // granted level owes are issued in the same statement. Offline it is just a number.
  $("fLevel").addEventListener("change", e => {
    const v = R.clamp(e.target.value, 1, 20);
    if (v === ch.level) return;
    if (online) { dmSet("level", v, ""); return; }
    ch.level = v;
    renderIdentity(); renderSaves(); renderSkills(); renderCogst();
    queueSave();
  });
  bindField("fAc", "ac", { number: true, lo: 0, hi: 40 });
  bindField("fSpeed", "speed", { number: true, lo: 0, hi: 200 });
  bindField("fHitDice", "hitDice");
  bindField("fHp", "hp", { number: true, lo: -99, hi: 999 });
  bindField("fHpMax", "hpMax", { number: true, lo: 0, hi: 999 });
  bindField("fHpTemp", "hpTemp", { number: true, lo: 0, hi: 999 });
  bindField("fNotes", "notes");

  $("inDream").addEventListener("change", e => {
    inDream = e.target.checked;
    render();            // the penalty, the planar slots and Cognitive Sense all turn on this
  });
  $("newChar").addEventListener("click", newCharacter);
  $("emptyNew").addEventListener("click", newCharacter);
  $("charPick").addEventListener("change", async e => {
    const pick = roster.find(c => String(c.id) === e.target.value);
    if (pick) { ch = adopt(pick.full || pick); render(); }
  });

  // Is there a server? The same question tools.js asks, answered the same way.
  try {
    const r = await fetch("api/me");
    if (r.ok) { me = (await r.json()).user; online = true; }
  } catch { /* static host — localStorage it is */ }

  if (online) {
    $("brandWho").textContent = me.displayName || me.username;
    try {
      const r = await fetch("api/characters");
      if (r.ok) {
        const d = await r.json();
        roster = (d.characters || []).map(c => ({ id: c.id, name: c.name, full: adopt(c) }));
      } else if (r.status === 404) {
        // Signed in, but this server has no character routes yet — the schema landed later than
        // the page did. Fall back rather than offering a sheet that cannot save: an account is
        // no use here if there is nowhere to put the character.
        online = false;
      }
    } catch { online = false; }
  }

  if (!online) {
    const all = loadLocal();
    roster = Object.values(all).map(c => ({ id: c.id, name: c.name, full: adopt(c) }));
  }

  if (!roster.length) { $("empty").hidden = false; return; }
  ch = roster[0].full;
  $("sheet").hidden = false;
  fillPicker();
  render();
}

boot();
