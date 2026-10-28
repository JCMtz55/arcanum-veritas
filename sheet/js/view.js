// What the sheet looks like. Three zones inside one viewport-height grid: the seven scores and the
// skills on the left, the body on the right, and the rail of campaign tracks down the side.
//
// Nothing here changes state. Every control carries a `data-act` and app.js decides what it means —
// which is also why this file has no inline onclick: it is a module, so a handler written into the
// markup would not be in scope. Event delegation was the better answer anyway.

import * as rules from "./rules.js";
import * as ephemer from "./ephemer.js";
import { state, derived, openUnlocks, pendingLevel } from "./store.js";
import { esc, sign } from "./pop.js";
import { icon } from "./icons.js";

const $ = id => document.getElementById(id);

// Eight accents, every one of them already a token in the app's palette, so a character can look
// like themselves without any of them looking out of place beside the rest of Ephemer.
// Placeholders until Juan supplies the real plates. Dropping a file into sheet/img/portraits/ and
// adding its name here is the whole of it — deliberately a list rather than a directory listing,
// because the server does not serve one and a 404 per guess is not a feature.
export const PORTRAITS = [
  "khaled.png", "zariel.png", "solomon.png",
  "placeholder-1.png", "placeholder-2.jpeg", "placeholder-3.png", "placeholder-4.png",
  "placeholder-5.png", "placeholder-6.png", "placeholder-7.png", "placeholder-8.png",
];
export const portraitUrl = f => `img/portraits/${f}`;

export const ACCENTS = [
  { id: "brass", name: "Brass", value: "#B08842" },
  { id: "ember", name: "Ember", value: "#C0553F" },
  { id: "verdant", name: "Verdant", value: "#4E8C6A" },
  { id: "indigo", name: "Indigo", value: "#6274B8" },
  { id: "steel", name: "Steel", value: "#6E8B97" },
  { id: "dream", name: "Dream", value: "#E069A6" },
  { id: "umbral", name: "Umbral", value: "#7A6EA8" },
  { id: "cosmical", name: "Cosmical", value: "#4FA4C4" },
];
export const accentOf = ch => ACCENTS.find(a => a.id === ch?.accent)?.value || "";

export function renderAll() {
  renderBar();
  if (!state.current) return renderEmpty();
  $("sheet").hidden = false;
  $("noChar").hidden = true;
  // The chosen accent rides on the document so every token that leans on --accent follows it.
  const accent = accentOf(derived());
  document.documentElement.style.setProperty("--accent", accent || "var(--brass)");
  renderLeft();
  renderCentre();
  renderRight();
}

// A portrait where there is one, the character's initials where there is not — never an empty hole.
export function portraitHtml(ch, name, cls = "") {
  const initials = String(name || "?").split(/\s+/).filter(Boolean).slice(0, 2)
    .map(w => w[0].toUpperCase()).join("");
  return ch?.portrait
    ? `<span class="por ${cls}" style="background-image:url('${esc(ch.portrait)}')" role="img" aria-label="${esc(name)}"></span>`
    : `<span class="por ${cls} none" aria-hidden="true">${esc(initials)}</span>`;
}

function renderEmpty() {
  $("sheet").hidden = true;
  $("noChar").hidden = false;
  $("noChar").innerHTML = `<div class="blank">
    <h1>No character yet</h1>
    <p>Make one and it is yours — kept with your account, on every device you sign in from.
      Your DM sets the level, the Dream score and any Fate; everything else is yours.</p>
    <form class="blank-form" data-act="create-form">
      <input class="txt" id="newName" maxlength="60" placeholder="Character name" required autocomplete="off">
      <button class="btn pri" type="submit">Create</button>
    </form></div>`;
}

// ── the bar ─────────────────────────────────────────────────────────────
function renderBar() {
  const c = state.current;
  const saveLabel = { idle: "", saving: "Saving…", saved: "Saved", error: "Not saved", conflict: "Conflict" }[state.save];
  $("barId").innerHTML = !c ? "" : `
    <button class="pick-btn" data-act="pick" title="Switch character">
      ${portraitHtml(c.sheet, c.name, "sm")}
      <b>${esc(c.name)}</b><span>Lv ${c.level}${c.sheet.classes?.length ? ` · ${esc(c.sheet.classes.map(x => x.name).join(" / "))}` : ""}</span>
    </button>`;
  // The level the DM has opened gets the loudest control on the bar and says the number, because it
  // is the one thing on this sheet a player has been waiting for. Everything else they can choose
  // stays behind the quieter count beside it.
  const lvl = pendingLevel();
  const others = openUnlocks().filter(u => u !== lvl).length;
  $("barState").innerHTML = !c ? "" : `
    ${lvl ? `<button class="btn sm lvlup" data-act="level-up" title="Your DM has opened level ${lvl.target_level}">
        ${icon("levelUp")} Level up <em>${lvl.target_level}</em></button>` : ""}
    ${others ? `<button class="btn sm pri" data-act="advance" title="Your DM has opened something for you">
        ${others} to choose</button>` : ""}
    ${(c.unspent?.honor || c.unspent?.morality) ? `<button class="btn sm" data-act="allocate-open">
        ${(c.unspent.honor || 0) + (c.unspent.morality || 0)} to allocate</button>` : ""}
    <button class="btn sm ${state.inInsomnia ? "on" : ""}" data-act="plane"
      title="Where you are standing. Insomnia opens three more attunement slots.">${state.inInsomnia ? "In Insomnia" : "Awake"}</button>
    <span class="savestate ${state.save}" data-act="save-state" tabindex="0"
      title="${esc(state.saveError || "Every change is saved as you make it")}">${esc(saveLabel)}</span>`;
}

// ── flags, and what is changing a number ────────────────────────────────
// A flag you turn on and off is a SQUARE THAT LIGHTS UP, named in its tooltip — the idiom the
// equipment rows already use. A column of tickboxes reads as a form to fill in; a row of lit squares
// reads as a set of states, which is what these are. `attr` is whatever the caller wires it with.
export const toggleHtml = (attr, on, ic, label) =>
  `<button type="button" class="tgl${on ? " on" : ""}" ${attr}
    aria-pressed="${on ? "true" : "false"}" title="${esc(label)}">${icon(ic)}<span class="sr">${esc(label)}</span></button>`;

// Everything adjusting one number, with the lasting ones first — they are the ones that are simply
// true of you, and a list that opens with "3 rounds of Bless" buries them.
export const buffsOn = (ch, target) =>
  rules.contributions(rules.activeModifiers(ch), target)
    .sort((a, b) => Number(b.permanent) - Number(a.permanent));

// The corner mark on a number something is changing: an infinity when every source is lasting, an
// hourglass the moment anything in the mix runs out. The reasons ride on the button's own tooltip,
// so hovering the number answers "why is this 18" without a click.
export function buffMark(list) {
  if (!list.length) return "";
  const timed = list.some(c => !c.permanent);
  return `<span class="bmark ${timed ? "timed" : "lasting"}" aria-hidden="true">${icon(timed ? "timed" : "lasting")}</span>`;
}
export function buffTitle(base, list) {
  if (!list.length) return base;
  return `${base}\n` + list.map(c =>
    `${sign(c.amount)} ${c.reason || "unnamed"} — ${c.permanent ? "lasting" : `${c.rounds} round${c.rounds === 1 ? "" : "s"}`}`).join("\n");
}

// ── left: the seven scores, saves, skills ───────────────────────────────
function renderLeft() {
  const ch = derived();
  const pb = rules.proficiencyBonus(ch.level);
  const q = (state.skillQuery || "").toLowerCase();

  const ability = id => {
    const score = rules.abilityScore(ch, id);
    const mod = rules.abilityModifier(ch, id);
    const base = ch.abilities[id];
    const buffed = score !== base;
    const dm = id === "dream";
    const name = rules.ABILITY_NAME[id];
    const onScore = buffsOn(ch, `ability:${id}`);
    const onSave = buffsOn(ch, `save:${id}`);
    return `<div class="ab2 ${dm ? "dream" : ""}${buffed ? " buffed" : ""}">
      <button class="ab2-roll" data-act="roll-ability" data-id="${id}"
        title="${esc(buffTitle(`Roll a ${name} check`, onScore))}">
        <i>${esc(name.slice(0, 3))}</i><b>${sign(mod)}</b></button>
      <button class="ab2-score" data-act="edit-ability" data-id="${id}"
        title="${esc(buffTitle(dm ? `Dream is your DM's to set — base ${base}`
          : `Set the score, or add an effect — base ${base}`, onScore))}"
        ${dm ? "disabled" : ""}>${score}${buffMark(onScore)}</button>
      <button class="ab2-save ${ch.saves?.[id] ? "on" : ""}" data-act="roll-save" data-id="${id}"
        title="${esc(buffTitle(`${name} saving throw${ch.saves?.[id] ? " · proficient" : ""}`,
          [...onSave, ...onScore]))}">${sign(rules.saveTotal(ch, id))}${buffMark(onSave)}</button>
    </div>`;
  };

  const skills = rules.SKILLS
    .filter(s => !q || s.name.toLowerCase().includes(q))
    .map(s => {
      const prof = ch.skills?.[s.id] || 0;
      const multi = s.abilities.length > 1;
      const use = (multi && ch.skillAbility?.[s.id]) || s.abilities[0];
      const dream = s.abilities[0] === "dream";
      const on = [...buffsOn(ch, `skill:${s.id}`), ...buffsOn(ch, `ability:${use}`)];
      return `<div class="sk ${dream ? "dream" : ""}">
        <button class="sk-prof p${prof}" data-act="cycle-prof" data-id="${s.id}"
          title="${prof === 2 ? "Expertise" : prof === 1 ? "Proficient" : "Not proficient"} — click to change"
          aria-label="${esc(s.name)} proficiency">${prof === 2 ? "◉" : prof === 1 ? "●" : "○"}</button>
        <button class="sk-roll" data-act="roll-skill" data-id="${s.id}"
          title="${esc(buffTitle(`Roll ${s.name}`, on))}">
          <span class="sk-nm">${esc(s.name)}</span>
          ${multi ? `<em class="sk-ab" data-act="pick-skill-ability" data-id="${s.id}"
            title="Harvesting uses Wisdom or Intelligence — click to switch">${esc(use.slice(0, 3))}</em>`
            : `<em class="sk-ab mute">${esc(use.slice(0, 3))}</em>`}
          <b>${sign(rules.skillTotal(ch, s.id, use))}${buffMark(on)}</b>
        </button></div>`;
    }).join("");

  $("left").innerHTML = `
    <div class="zone-h"><h2>Scores</h2><span class="pbtag" title="Proficiency bonus">PB ${sign(pb)}</span></div>
    <div class="abs">${rules.ABILITIES.map(ability).join("")}</div>
    <div class="legend"><i>mod</i><i>score</i><i>save</i></div>

    <div class="zone-h"><h2>Skills</h2>
      <input class="txt sm" id="skillQ" placeholder="Find" value="${esc(state.skillQuery || "")}"
        aria-label="Filter skills" data-act="skill-query"></div>
    <div class="sks">${skills || `<p class="hint">Nothing matches.</p>`}</div>

    <div class="zone-h"><h2>Passive</h2></div>
    <div class="passives">
      <span class="pv"><i>Perception</i><b>${rules.passiveScore(ch, "perception")}</b></span>
      <span class="pv"><i>Investigation</i><b>${rules.passiveScore(ch, "investigation")}</b></span>
      <span class="pv"><i>Insight</i><b>${rules.passiveScore(ch, "insight")}</b></span>
    </div>`;
}

// ── centre: the body ────────────────────────────────────────────────────
// Seven, since Ephemer's own systems got their own two. The Dream tab had grown into a drawer
// holding four unrelated things, and the Cognitive Arts are a family in their own right: the
// Cognitions you know, Arcanum Veritas, your Ignitions and the Paragon path all answer to the same
// three Arts. The Grimm is nobody's family but its own.
const TABS = { combat: "Combat", spells: "Spells", dream: "Dream", arts: "Cognitive Arts",
  grimm: "Grimms", gear: "Gear", character: "Character" };
// What the strip prints, where the full name is too long to fit seven of them. The tooltip and the
// aria-label keep the real name, so only the width is abbreviated and never the meaning.
const TAB_SHORT = { arts: "Arts" };
const TAB_ICON = { combat: "attack", spells: "spells", dream: "dream", arts: "cognition",
  grimm: "grimm", gear: "gear", character: "character" };
export const TAB_ORDER = Object.keys(TABS);

function renderCentre() {
  const ch = derived();
  const max = rules.maxHp(ch);
  const pct = Math.max(0, Math.min(100, Math.round((ch.hp / Math.max(1, max)) * 100)));
  const band = ch.hp <= 0 ? "out" : pct <= 25 ? "crit" : pct <= 50 ? "low" : "ok";
  const unhealed = ch.injuries.filter(i => i && !i.healed).length;
  // The tile shows what is LEFT, not the pool: once three dice are spent, printing the whole pool
  // is a lie, and the pool itself is one hover away in the title.
  const hd = rules.hitDiceState(ch);

  // `target` is optional: give one and the tile carries the mark and the breakdown of whatever is
  // changing that number, so hovering AC answers "why is it 12" without opening anything.
  const tile = (act, ic, label, value, title, target) => {
    const on = target ? buffsOn(ch, target) : [];
    return `<button class="tile" data-act="${act}" title="${esc(buffTitle(title, on))}">
      <i>${icon(ic)}${label}</i><b>${value}${buffMark(on)}</b></button>`;
  };

  const c = state.current;
  // Replacing the markup resets the scroll of both scrollers, so where the reader was is carried
  // across the redraw. Without this, preparing a spell halfway down the book throws you back to the
  // top of the tab — and the same was true of every pip and every toggle in every other tab.
  const centre = $("centre");
  const was = { centre: centre.scrollTop, panel: document.getElementById("panel")?.scrollTop || 0 };
  centre.innerHTML = `
    <div class="vitals">
      <button class="face" data-act="portrait" title="Change portrait">
        ${portraitHtml(ch, c.name, "xl")}
        <span class="face-n">
          <b>${esc(c.name)}</b>
          <em>Lv ${c.level}${ch.ancestry ? ` · ${esc(ch.ancestry)}` : ""}${ch.classes?.length ? ` · ${esc(ch.classes.map(x => x.name).join(" / "))}` : ""}</em>
        </span>
      </button>
      <div class="hp ${band}">
        <button class="hp-btn" data-act="hp" title="Damage, healing and temporary hit points">
          <span class="hp-n">${icon("hp", "hp-ic")}${ch.hp}<em>/${max}</em>${ch.tempHp ? `<u>+${ch.tempHp}</u>` : ""}</span>
          <span class="hp-bar"><i style="width:${pct}%"></i></span>
          <span class="hp-lbl">Hit points</span>
        </button>
      </div>
      <div class="tiles">
        ${tile("edit-ac", "ac", "AC", rules.armorClass(ch), `Armour Class — base ${ch.ac}`, "ac")}
        ${tile("roll-init", "initiative", "Init", sign(rules.initiative(ch)), "Roll initiative", "initiative")}
        ${tile("edit-speed", "speed", "Speed", rules.speed(ch), `Speed in feet — base ${ch.speed}`, "speed")}
        ${tile("verum", "saveDC", "Verum DC", rules.verumDC(ch),
          `8 + proficiency ${sign(rules.proficiencyBonus(ch.level))} + highest non-Dream modifier ${sign(rules.verumModifier(ch))} + Dream ${sign(rules.abilityModifier(ch, "dream"))}`,
          "saveDc")}
        ${tile("hit-dice", "hitDice", "Hit dice", esc(hitDiceLeft(ch) || "—"),
          hd.used ? `${hd.left} of ${hd.total} left — your pool is ${hd.pool}`
            : "Spend a hit die on a short rest, or with a Quick Action")}
        ${tile("death-saves", "deathDC", "Death DC", rules.deathSaveDC(ch.wounds, unhealed),
          `Death save DC — 10 + ${ch.wounds} Wounds + ${unhealed} unhealed Injuries`)}
        ${tile("conc", "concentration", "Conc", rules.concentrationDC(0, ch.wounds, unhealed) + "+",
          "Concentration DC floor — rises with half the damage taken")}
      </div>
    </div>

    ${conditionBar(ch)}

    <div class="tabs">${Object.entries(TABS).map(([k, label]) =>
      `<button class="tab ${state.view === k ? "on" : ""}" data-act="tab" data-id="${k}"
        title="${label}" aria-label="${label}">
        ${icon(TAB_ICON[k])}<span class="tab-n">${TAB_SHORT[k] || label}</span></button>`).join("")}
      <span class="sp"></span>
      <button class="btn sm" data-act="compendium" data-id="spell" title="Races, classes, feats, spells and items">${icon("compendium")} Compendium</button>
      <button class="btn sm" data-act="dice" title="Roll any expression">${icon("dice")} Dice</button>
    </div>
    <div class="panel" id="panel">${panelHtml(ch)}</div>`;

  centre.scrollTop = was.centre;
  const panel = document.getElementById("panel");
  if (panel) panel.scrollTop = was.panel;
}

const hitDiceLeft = ch =>
  rules.formatHitDice(rules.hitDiceState(ch).rows.map(r => ({ die: r.die, n: r.left })));

// Conditions belong with the vitals rather than inside the Combat tab: what you are suffering from
// is read as often as your AC, and it should not disappear the moment you open your spells.
// Concentration rides the same line, because dropping it is the other thing people forget.
function conditionBar(ch) {
  const chips = (ch.conditions || []).map((x, i) => {
    const name = typeof x === "string" ? x : x.name;
    const known = rules.CONDITIONS[typeof x === "string" ? "" : x.id];
    return `<button class="chip on" data-act="cond-del" data-id="${i}"
      title="${esc(known ? known.note : "Click to remove")}">${esc(name)} ×</button>`;
  }).join("");

  return `<div class="condbar${chips || ch.concentrating ? " live" : ""}">
    <span class="condbar-k" title="The campaign rewrites Stunned and Paralyzed — add those from the list, not from memory">
      ${icon("condition")}Conditions</span>
    <div class="chips">
      ${chips || `<span class="hint">None</span>`}
      ${ch.concentrating ? `<button class="chip conc" data-act="conc-drop"
        title="Click to drop concentration">${icon("concentration")}${esc(ch.concentrating)} ×</button>` : ""}
    </div>
    <button class="btn sm" data-act="cond-add" title="Add a condition">Add</button>
  </div>`;
}

function panelHtml(ch) {
  if (state.view === "combat") return combatPanel(ch);
  if (state.view === "spells") return spellPanel(ch);
  if (state.view === "dream") return dreamPanel(ch);
  if (state.view === "arts") return artsPanel(ch);
  if (state.view === "grimm") return grimmPanel(ch);
  if (state.view === "gear") return gearPanel(ch);
  return characterPanel(ch);
}

function combatPanel(ch) {
  const attacks = ch.attacks.length ? ch.attacks.map((a, i) => `
    <div class="atk">
      <button class="atk-nm" data-act="atk-roll" data-id="${i}" title="Roll to hit">
        <b>${esc(a.name || "Attack")}</b><span>${sign(a.bonus || 0)} to hit</span></button>
      <button class="atk-dmg" data-act="atk-dmg" data-id="${i}" title="Roll damage">
        ${esc(a.damage || "—")}${a.type ? ` <em>${esc(a.type)}</em>` : ""}</button>
      <button class="atk-crit" data-act="atk-crit" data-id="${i}" title="Critical — doubles the dice, not the modifier">crit</button>
      <button class="x" data-act="atk-del" data-id="${i}" aria-label="Remove ${esc(a.name || "attack")}">×</button>
    </div>`).join("") : `<p class="hint">No attacks yet. Add the ones you actually use — they roll from here.</p>`;

  // The turn's allowance, which is no longer always one of each: Haste grants an Action, a Grimm
  // may grant a second Reaction, and a grant can be permanent or run for a few rounds. Each slot is
  // its own pip, so "I have two Actions and have spent one" is a thing the tracker can say.
  const allow = rules.turnAllowance(ch);
  const grantsFor = k => (ch.grants || []).filter(g => g && g.active !== false && g.kind === k);
  const econ = Object.keys(allow).filter(k => allow[k] > 0).map(k => {
    const used = rules.turnUsed(ch, k);
    const gs = grantsFor(k);
    const pips = Array.from({ length: allow[k] }, (_, i) => {
      const extra = i >= (rules.TURN_BASE[k] || 0);
      const g = extra ? gs[i - (rules.TURN_BASE[k] || 0)] : null;
      return `<button class="epip ${i < used ? "spent" : ""}${extra ? " extra" : ""}"
        data-act="econ" data-id="${k}" data-i="${i}"
        title="${esc(g ? `${ACTION_COST[k] || k} — ${g.why || "granted"}${g.rounds == null ? "" : ` · ${g.rounds}r`}`
          : `${ACTION_COST[k] || k} — click to spend`)}"
        aria-label="${esc(ACTION_COST[k] || k)} ${i + 1} of ${allow[k]}"></button>`;
    }).join("");
    return `<div class="econ ${used >= allow[k] ? "done" : ""}">
      <span class="econ-n">${esc(ACTION_COST[k] || k)}</span>
      <span class="epips">${pips}</span>
      ${gs.length ? `<button class="x" data-act="grant-del" data-id="${esc(gs[gs.length - 1].id)}"
        title="Give back ${esc(gs[gs.length - 1].why || "the extra")}" aria-label="Remove the extra">×</button>` : ""}
    </div>`;
  }).join("");

  const timedGrants = (ch.grants || []).filter(g => g && g.active !== false && g.rounds != null);

  // Things this character can DO, as opposed to things they can hit with. Some are permanent — a
  // class feature, a Quick Action they always have — and some last a few rounds, because a spell or
  // a Grimm ability granted them for a minute. The timed ones count down on the same confirmed
  // round the modifiers do, so one button moves the whole sheet forward.
  const live = (ch.actions || []).filter(a => a && a.active !== false);
  const actions = live.length ? live.map(a => `
    <div class="act2 ${a.cost || ""}">
      <button class="act2-b" data-act="action-open" data-id="${esc(a.id)}" title="${esc(a.text || a.name)}">
        <span class="act2-n">${esc(a.name)}</span>
        ${a.cost ? `<span class="tag">${esc(ACTION_COST[a.cost] || a.cost)}</span>` : ""}
        ${a.rounds == null ? "" : `<span class="tag k">${a.rounds}r</span>`}
      </button>
      <button class="x" data-act="action-del" data-id="${esc(a.id)}" aria-label="Remove ${esc(a.name)}">×</button>
    </div>`).join("")
    : `<p class="hint">Nothing here yet. Add the things you can <em>do</em> — a Quick Action, a
       Grimm ability, something a spell granted you for a minute.</p>`;

  // This turn comes first: it is the thing you look at on every one of your turns, and the thing
  // you reach for before you have decided which attack to make.
  return `<section class="card">
      <h3>${icon("round")} This turn <span class="r">
        <button class="btn sm" data-act="grant-add" title="Haste, a second Reaction, a Quick Action someone handed you">+ Extra</button>
        <button class="btn sm" data-act="new-turn" title="Hand the action economy back">New turn</button></span></h3>
      <div class="econs">${econ}</div>
      <p class="hint">A tracker, not a referee — rolling an attack does not spend anything.
        ${timedGrants.length ? `Extras run out when you confirm a round.` : ""}</p>
    </section>

    <section class="card">
      <h3>${icon("attack")} Attacks <span class="r"><button class="btn sm" data-act="atk-add">Add</button></span></h3>
      <div class="atks">${attacks}</div>
    </section>

    <section class="card">
      <h3>${icon("action")} Actions <span class="r">
        <button class="btn sm" data-act="action-add">Add</button></span></h3>
      <div class="acts2">${actions}</div>
      ${live.some(a => a.rounds != null) ? `<p class="hint">Timed ones run out when you confirm a round.</p>` : ""}
    </section>`;
}

function spellPanel(ch) {
  const slots = ch.spells?.slots || {};
  const slotsShort = String(ch.spells?.slotsReset || "l").toLowerCase() === "s";
  const rows = Array.from({ length: 9 }, (_, i) => i + 1).filter(l => slots[l]?.max).map(l => {
    const { max = 0, used = 0 } = slots[l];
    let pips = "";
    for (let i = 0; i < max; i++)
      pips += `<button class="pip ${i < used ? "used" : ""}" data-act="slot" data-id="${l}" data-i="${i}"
        aria-label="Level ${l} slot ${i + 1}"></button>`;
    return `<div class="slotrow"><i>${l}</i><div class="pips">${pips}</div>
      <span class="hint">${max - used}/${max}</span></div>`;
  }).join("");

  // One spell attack and one save DC per casting class, because the ability differs per class and a
  // published spell is never resisted at the Verum DC. Null means the catalogue has not answered yet.
  const casting = state.classPlan ? rules.spellcasting(ch, state.classPlan) : [];
  const castStats = casting.map(c => `
    <div class="stat"><b>${c.dc}</b><i>${esc(c.className)} save DC</i></div>
    <div class="stat"><b>${sign(c.attack)}</b><i>${esc(c.className)} attack</i></div>`).join("");

  return `<section class="card">
      <h3>Spellcasting</h3>
      ${casting.length ? `<div class="stats">${castStats}</div>
        <p class="hint">${casting.map(c => `<b>${esc(c.className)}</b> casts with ${esc(c.abilityName)}
          (${sign(c.mod)}) — DC 8 + proficiency ${sign(rules.proficiencyBonus(ch.level))} + ${sign(c.mod)}`).join("; ")}.
          ${casting.length > 1 ? "Each class keeps its own ability, and your proficiency bonus comes from your total level." : ""}</p>`
        : `<p class="hint">${state.classPlan === null
            ? "Reading the catalogue…"
            : "No class on your sheet casts spells. Take one from the compendium and its DC appears here."}</p>`}
      <p class="hint">⚠️ A <b>seal</b> is resisted at the Verum DC and not at any of these — Arcanum
        Veritas is its own Art, and it has its own tab now.</p>
    </section>

    <section class="card">
      <h3>Spell slots <span class="r"><button class="btn sm" data-act="slots-edit">Set</button></span></h3>
      ${rows || `<p class="hint">No slots set yet. Taking a casting class fills these in.</p>`}
      ${rows ? `<p class="hint">${slotsShort
        ? "<b>Pact Magic</b> — these come back on a <b>short</b> rest."
        : "These come back on a long rest."} Click a pip to spend one, click a spent one to hand it back.</p>` : ""}
    </section>

    ${spellbookCard(ch)}`;
}

// The book itself. Grouped by level, because that is how a caster looks for a spell, and each row
// carries the three things you need mid-turn: whether it is ready, whether it needs concentration,
// and whether it can be cast as a ritual instead of spending anything.
function spellbookCard(ch) {
  const book = rules.spellbook(ch);
  const slots = ch.spells?.slots || {};

  const row = s => {
    const lv = rules.spellLevel(s);
    const standing = rules.spellStanding(s);
    const castable = rules.spellCastable(s);
    const st = rules.SPELL_STANDING[standing];
    const toggles = standing === "known" || standing === "prepared";
    return `<div class="spl ${castable ? "on" : ""}">
      <button class="spl-s ${standing}" data-act="spell-stand" data-id="${esc(s.id)}"
        title="${esc(`${st.label} — ${st.hint}${toggles ? " Click to change." : ""}`)}"
        aria-label="${esc(st.label)}">${esc(st.short)}</button>
      <button class="spl-n" data-act="spell-open" data-id="${esc(s.id)}"
        title="Read it, and cast it">
        <b>${esc(s.name)}</b>
        <span>${[esc(s.school || ""), s.time ? esc(s.time) : "", s.range ? esc(s.range) : ""]
          .filter(Boolean).join(" · ")}</span>
      </button>
      <span class="spl-t">
        ${rules.spellIsConcentration(s) ? `<span class="tag k" title="Concentration">C</span>` : ""}
        ${rules.spellIsRitual(s) ? `<span class="tag" title="Can be cast as a ritual">R</span>` : ""}
        ${lv > 0 && castable && !rules.castingOptions(ch, lv).some(o => o.left)
          ? `<span class="tag warn" title="No slot left that can pay for it">no slot</span>` : ""}
      </span>
      <button class="x" data-act="spell-del" data-id="${esc(s.id)}"
        aria-label="Remove ${esc(s.name)}">×</button>
    </div>`;
  };

  const groups = book.levels.map(g => {
    const left = g.level > 0 && slots[g.level]
      ? `<span class="hint">${(slots[g.level].max || 0) - (slots[g.level].used || 0)}/${slots[g.level].max || 0} slots</span>`
      : "";
    return `<div class="spl-g">
      <div class="spl-lv"><b>${g.level === 0 ? "Cantrips" : `Level ${g.level}`}</b>${left}</div>
      ${g.spells.map(row).join("")}</div>`;
  }).join("");

  const c = book.counts;
  return `<section class="card">
      <h3>Spells <span class="r">
        ${c.total ? `<button class="btn sm" data-act="spell-clear"
          title="Set every levelled spell back to known — the start of a new day">New day</button>` : ""}
        <button class="btn sm pri" data-act="compendium" data-id="spell">+ Add</button></span></h3>
      ${c.total ? `<p class="hint">${c.total} spell${c.total === 1 ? "" : "s"}${c.cantrips ? ` · ${c.cantrips} cantrip${c.cantrips === 1 ? "" : "s"}` : ""}
          · <b>${c.ready}</b> prepared${c.always ? ` · ${c.always} always prepared` : ""}${c.granted ? ` · ${c.granted} granted` : ""}
          ${c.known ? ` · ${c.known} known and not ready` : ""}</p>
        <div class="spls">${groups}</div>
        <p class="hint">Click a spell to read it and cast it; casting spends the slot you choose, so
          upcasting is just picking a higher one. The chip on the left is how you have it — click it
          to move between <b>known</b> and <b>prepared</b>. Nothing here caps how many you may prepare:
          the number your class allows is in your class's own table, and the sheet does not guess it.</p>`
        : `<p class="hint">Nothing in your spells yet. <b>Add</b> searches the compendium — your DM's
          imported books included — and a cantrip arrives always prepared while everything else
          arrives as known, for you to prepare on the day.</p>`}
    </section>`;
}

function dreamPanel(ch) {
  const de = rules.dreamExhaustion(ch.dreamExhaustion);
  const score = rules.abilityScore(ch, "dream");
  return `<section class="card">
      <h3>Dream</h3>
      <div class="stats">
        <div class="stat"><b>${score}</b><i>Dream score</i></div>
        <div class="stat"><b>${sign(rules.abilityModifier(ch, "dream"))}</b><i>modifier</i></div>
        <div class="stat"><b>${rules.ownDreamDC(ch)}</b><i>your Dream DC</i></div>
        <div class="stat"><b>${rules.cognitiveSenseUses(ch)}</b><i>Cognitive Sense, per short rest</i></div>
      </div>
      <p class="hint">Your Dream score starts at 10 and rises only through a campaign event your DM records.
        ${rules.starForceEligible(ch) ? "<b>At 18 or more you are eligible for a Star Force epiphany</b> — which is your DM's to declare, never automatic." : ""}</p>
    </section>

    <section class="card">
      <h3>The four Dream skills</h3>
      <div class="stats">${["alter", "fabricate", "incept", "reveal"].map(id =>
        `<button class="stat btn-stat" data-act="roll-skill" data-id="${id}">
          <b>${sign(rules.skillTotal(ch, id))}</b><i>${esc(rules.SKILL_BY_ID[id].name)}</i></button>`).join("")}</div>
      <p class="hint">Crafting a dream item is the one exception: that check adds Intelligence as well
        — <b>${sign(rules.fabricateCrafting(ch))}</b> rather than ${sign(rules.fabricateGeneral(ch))}. Proficiency is never counted twice.</p>
    </section>

    <section class="card">
      <h3>Cognitive Saving Throw</h3>
      <button class="btn pri" data-act="roll-cogst">Roll · ${sign(rules.cognitiveSavingThrowBonus(ch))}</button>
      <p class="hint">Your Dream modifier plus the highest of your six standard ability modifiers.
        Proficiency is not added — a Cognitive Saving Throw is not a check.</p>
    </section>

    <section class="card">
      <h3>Dream Exhaustion · ${de.level}/8 — ${esc(de.name)}</h3>
      ${de.level ? `<p class="de-now"><b>${de.penalty}</b> to every d20 roll you make <b>in a dream</b>.
        ${de.concentrationDisadvantage ? " Disadvantage on Concentration checks." : ""}
        ${de.noInspirationInDream ? " No Inspiration while in a dream." : ""}</p>` : ""}
      <div class="ladder">${rules.DREAM_EXHAUSTION.slice(1).map(r => `
        <button class="rung ${r.level <= de.level ? "on" : ""}" data-act="de" data-id="${r.level}"
          title="${esc(r.name)}">${r.level}</button>`).join("")}
        <button class="btn sm" data-act="de" data-id="0">Clear</button></div>
      <p class="hint">Effects are cumulative, and the −5 holds at 6, 7 and 8.
        A long rest <b>without Dream Walking</b> removes one level; one that included it removes none.
        ${de.collapseSave ? `<b class="hot">At 8 a Cognitive Collapse Dream Save is due — your DM calls it.</b>` : ""}</p>
    </section>`;
}

// ── Ephemer's own systems, joined to the sheet ──────────────────────────
// These belong to the ACCOUNT rather than to the character — the DM grants a Cognition to a player
// — so they are read from the same routes the Arcanum Veritas builder reads, and the sheet is a
// second window onto one record rather than a second copy of it. Until now a player kept two tabs
// open to run one character: the Cognitive Saving Throw on this screen and the Cognitions it is
// rolled for on another.
// ── Cognitive Arts ──────────────────────────────────────────────────────
// The three Arts and what they are made of, in one place. They were scattered — the Verum DC sat
// among the spell slots as though a seal were a spell, and the Cognitions sat under Dream as though
// knowing one were a kind of exhaustion. They are one family: ⭐ **a Cognition is the material, and
// Arcanum Veritas, Ignition and the Paragon path are the three things you can do with it.**
function artsPanel(ch) {
  return `${veritasCard(ch)}
    ${cognitionsCard(ch)}
    ${learningCard(ch)}
    ${ignitionsCard()}
    ${paragonCard()}`;
}

function grimmPanel() {
  return grimmCard() || `<section class="card">
    <h3>${icon("grimm")} Grimm</h3>
    <p class="hint">Reading what your DM keeps…</p></section>`;
}

function veritasCard(ch) {
  return `<section class="card">
      <h3>${icon("saveDC")} Arcanum Veritas <span class="r">
        <a class="btn sm" href="../arcanum.html">Compose a seal</a></span></h3>
      <div class="stats">
        <button class="stat btn-stat" data-act="verum"><b>${rules.verumDC(ch)}</b><i>Verum DC</i></button>
        <div class="stat"><b>${sign(rules.sealAttackBonus(ch))}</b><i>Seal attack</i></div>
        <div class="stat"><b>${rules.sealUses(ch)}</b><i>Seals per long rest</i></div>
        <div class="stat"><b>${rules.ownDreamDC(ch)}</b><i>your Dream DC</i></div>
      </div>
      <p class="hint">A seal costs one use <b>and</b> a spell slot of 1st level or higher. The Verum
        DC — 8 + proficiency + your highest ability modifier + your Dream modifier — is what a
        <b>seal</b> is resisted at, and never what a published spell is; those have their own DC on
        the Spells tab. Seals per long rest is your proficiency bonus, and so is the number of
        inscriptions you may hold at once.</p>
    </section>`;
}

// An Ignition is written for one player and switched on by the DM, so a player who has none sees
// nothing rather than an empty promise. The Blaze Points it costs are the builder's to spend —
// the same line the Grimm card draws.
function ignitionsCard() {
  const mine = state.ignitions;
  if (!mine || !mine.length) return "";
  return `<section class="card">
      <h3>${icon("ignition")} Ignitions <span class="r">
        <a class="btn sm" href="../arcanum.html">Forge</a></span></h3>
      <div class="igns">${mine.map(i => `
        <div class="ign">
          <span class="ign-i" aria-hidden="true">${esc(i.icon || "✶")}</span>
          <span class="ign-n"><b>${esc(i.name)}</b>
            <span>${[i.template, i.activation].filter(Boolean).map(esc).join(" · ")}</span></span>
          ${i.rank ? `<span class="tag k">Rank ${esc(String(i.rank))}</span>` : ""}
        </div>
        ${(i.cognitions || []).length ? `<div class="ign-c">${(i.cognitions || []).map(id =>
          `<span class="chip">${esc(cognitionName(id))}</span>`).join("")}</div>` : ""}`).join("")}
      </div>
      <p class="hint">Written for you and opened by your DM. ⚠️ <b>Every Cognition an Ignition burns
        must be known at Learn Full</b> — the forge itself, and the Blaze Points it spends, are in the
        <a href="../arcanum.html">builder</a>.</p>
    </section>`;
}

const cognitionName = id =>
  (state.cognitions || []).find(c => c.id === id)?.name
  || String(id).replace(/-/g, " ").replace(/\b\w/g, m => m.toUpperCase());

// The Paragon path: three Devotions sworn, one of them held in the Deeper Burn. All of it is the
// DM's to open and the builder's to choose in — the sheet says where you stand.
function paragonCard() {
  const p = state.paragon;
  if (!p || !p.enabled) return "";
  const nameOf = id => (p.devotions || []).find(d => d.cognition === id)?.name || cognitionName(id);
  const open = (p.pilgrimage || []).find(x => x.status === "asked");
  return `<section class="card">
      <h3>${icon("paragon")} Paragon <span class="r">
        <a class="btn sm" href="../arcanum.html">Choose</a></span></h3>
      ${p.sworn?.length ? `<div class="chips">${p.sworn.map(id => `
        <span class="chip ${id === p.active ? "on" : ""}"
          title="${esc(id === p.active ? "Held in the Deeper Burn" : "Sworn")}">
          ${esc(nameOf(id))}${id === p.active ? " ✦" : ""}</span>`).join("")}</div>`
        : `<p class="hint">None sworn yet.</p>`}
      <p class="hint">${p.sworn?.length || 0} of ${p.max || 3} sworn${
        p.active ? ` · <b>${esc(nameOf(p.active))}</b> is held in the Deeper Burn` : ""}${
        (p.devotions || []).length ? ` · ${p.devotions.length} in your pool` : ""}.
        ${open ? `🧭 <b>A Pilgrimage is open</b> — you asked for
          <b>${esc(open.arrivingName || "")}</b>${open.leavingName ? `, leaving ${esc(open.leavingName)}` : ""},
          and your DM answers it in Admin.` : ""}</p>
    </section>`;
}

// The Grimm, as the sheet needs it and no further. ⭐ The live state — which slots are spent, which
// stage it is in, what is loaded out — belongs to the Companion, which owns it and keeps it in that
// browser; copying it here would make two answers to one question. What the sheet shows is the part
// that is NOT the Companion's: the DM's chains, what the DM has revealed, and how many souls are on
// the roster — the three things a player currently opens another tab to read.
function grimmCard() {
  if (state.grimmData === null && state.grimmState === null) return "";
  const g = ephemer.myGrimm();
  if (!g) {
    // The DM, or an account no Grimm is written for. The Admin page is where the DM reads all eight.
    return state.grimmData ? `<section class="card">
      <h3>${icon("grimm")} Grimm</h3>
      <p class="hint">No Grimm is written for <b>${esc(state.me?.username || "this account")}</b>.
        A Grimm is matched to the player by name, the same way the Admin page matches it —
        the DM reads all of them in <a href="../admin/#/grimms">Admin › Grimms</a>.</p>
    </section>` : "";
  }

  const chains = Number(state.grimmState?.chains?.[g.id]) || 0;
  const toggles = state.grimmState?.toggles?.[g.id] || {};
  const souls = Object.keys(state.grimmSouls?.grimms?.[g.id] || {}).length;

  const reveal = (on, label, name, note) => `<div class="rev ${on ? "on" : ""}">
    <span class="rev-k">${esc(label)}</span>
    <b>${on ? esc(name || "revealed") : "not yet"}</b>
    <span class="hint">${esc(on ? note : "your DM has not revealed it")}</span></div>`;

  return `<section class="card grimm" style="--gh:${esc(g.hue || "var(--accent)")}">
      <h3>${icon("grimm")} ${esc(g.name)} <span class="r">
        <a class="btn sm" href="../grimms/">Open the Companion</a></span></h3>
      <p class="hint">Grimm of <b>${esc(g.user || g.short || "")}</b>${
        g.forms?.invoked ? ` · Invoked as <b>${esc(g.forms.invoked)}</b>` : ""}${
        g.forms?.awakened ? ` · Awakened as <b>${esc(g.forms.awakened)}</b>` : ""}</p>

      <div class="chainrow" title="The Three Chains — your DM keeps them">
        <span class="chainrow-k">The Three Chains</span>
        <span class="chainpips">${[1, 2, 3].map(i =>
          `<span class="chainpip ${i <= chains ? "on" : ""}" aria-hidden="true"></span>`).join("")}</span>
        <b>${chains}/3</b>
        <span class="hint">${chains >= 3 ? "all three hold" : chains ? "broken" : "every chain is broken"}</span>
      </div>

      <div class="revs">
        ${reveal(toggles.shackle === true, "Shackle Break", g.shackle?.name,
          "yours to use when the stage allows it")}
        ${reveal(toggles.shift === true, "Reality Shift", g.shift?.name,
          "yours to use — the Companion has its page")}
      </div>

      ${souls ? `<p class="hint">${souls} soul${souls === 1 ? "" : "s"} on your roster.
        Preparing them, and everything they carry, is in the Companion.</p>` : ""}
      <p class="hint">Your slots, your stage and your loadout live in the
        <a href="../grimms/">Companion</a>, which is where they are spent — this is the part your DM
        keeps, so you can read it without leaving your character.</p>
    </section>`;
}

function cognitionsCard() {
  const mine = state.cognitions;
  if (mine === null) return `<section class="card">
      <h3>${icon("cognition")} Cognitions</h3>
      <p class="hint">Reading what your DM has opened…</p></section>`;

  const byCat = new Map();
  for (const c of mine) {
    const k = ephemer.categoryOf(c) || "other";
    if (!byCat.has(k)) byCat.set(k, []);
    byCat.get(k).push(c);
  }
  const groups = [...byCat.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([cat, list]) => `<div class="cogs-g">
      <div class="zone-h sm"><h4>${esc(cat === "other" ? "Uncategorised" : cat)}</h4></div>
      <div class="cogs">${list.sort((a, b) => a.name.localeCompare(b.name)).map(c => `
        <a class="cog ${esc(ephemer.categoryOf(c))}" href="../arcanum.html"
          title="${esc(`${c.name} — Tier ${c.tier || "?"}${c.opposing ? `, opposed by ${c.opposing}` : ""}${
            c.ready ? "" : " · your DM has not opened this one for reading yet"}`)}">
          ${icon(c.fa || "cognition")}<b>${esc(c.name)}</b><em>${esc(c.tier || "")}</em>
          ${c.ready ? "" : `<span class="tag">held</span>`}</a>`).join("")}</div>
    </div>`).join("");

  return `<section class="card">
      <h3>${icon("cognition")} Cognitions <span class="r">
        <span class="tag">${mine.length}</span></span></h3>
      ${state.ephemerError ? `<p class="hint hot">${esc(state.ephemerError)}</p>` : ""}
      ${mine.length ? groups + `<p class="hint">Your DM grants these to <b>you</b>, not to one
          character — they follow your account. Open one in the
          <a href="../arcanum.html">builder</a> to read it and to compose with it.
          A <b>held</b> one is yours and not yet readable.</p>`
        : `<p class="hint">None yet. Your DM opens a Cognition once you have mastered it — the
          tracker below is what tells them you are close.</p>`}
    </section>`;
}

function learningCard(ch) {
  const rows = state.learning;
  if (rows === null) return "";
  const going = rows.filter(l => l.depth < 4);
  const done = rows.filter(l => l.depth === 4);

  const row = l => `<div class="lrn">
    <b>${esc(l.name)}</b>
    <span class="lpips">${[1, 2, 3, 4].map(i =>
      `<button class="pip ${i <= l.depth ? "used" : ""}" data-act="learn-depth"
        data-id="${esc(l.name)}" data-i="${i === l.depth ? i - 1 : i}"
        title="${esc(rules.COGNITION_DEPTH_NOTE[i])}"
        aria-label="${esc(l.name)} ${i} of 4"></button>`).join("")}</span>
    <em>${l.depth}/4 · ${esc(l.depth === 4
      ? "mastered — waiting for your DM to open it"
      : rules.COGNITION_DEPTH_NOTE[l.depth])}</em>
    <button class="x" data-act="learn-drop" data-id="${esc(l.name)}"
      aria-label="Stop tracking ${esc(l.name)}">×</button>
  </div>`;

  const ladder = rules.cognitionLadder();
  return `<section class="card">
      <h3>${icon("dream")} Learning <span class="r">
        <button class="btn sm pri" data-act="roll-learn"
          title="1d20 + your Dream modifier">Roll · ${sign(rules.cognitionUnderstandingBonus(ch))}</button>
        </span></h3>
      ${going.length ? `<div class="lrns">${going.map(row).join("")}</div>`
        : `<p class="hint">Nothing in progress.</p>`}
      <form class="adder" data-act="learn-add">
        <input class="txt" id="lrnName" list="lrnNames" maxlength="40" autocomplete="off"
          placeholder="A Cognition you have begun to learn" aria-label="Cognition name" required>
        <datalist id="lrnNames">${(state.learnNames || [])
          .filter(n => !rows.some(l => l.name.toLowerCase() === n.toLowerCase()))
          .map(n => `<option value="${esc(n)}"></option>`).join("")}</datalist>
        <button class="btn sm" type="submit">Track</button>
      </form>

      ${done.length ? `<div class="zone-h sm"><h4>Mastered — waiting for your DM</h4></div>
        <div class="lrns">${done.map(row).join("")}</div>` : ""}

      <div class="zone-h sm"><h4>What it takes</h4></div>
      <div class="dcs">${ladder.map(t => `
        <div class="dcrow ${t.needsEpiphany ? "epi" : ""}">
          <i>Tier ${esc(t.tier)}</i>
          ${t.steps.map(s => `<span title="${esc(s.threshold)}"><em>${esc(s.threshold === "threshold" ? "past ½" : s.threshold)}</em><b>${s.dc}</b></span>`).join("")}
        </div>`).join("")}</div>
      <p class="hint">1d20 + your Dream modifier against the DC for the Tier you are after.
        ⚠️ <b>Tier III and above cannot be finished by rolling</b> — the last step is an Epiphany
        your DM declares. The Tier of a Cognition you have not been granted is not sent to your
        browser, so read the row your DM names.
        Reaching 4/4 tells them you are ready; <b>opening it is still theirs</b>.</p>
    </section>`;
}

// The costs the campaign actually uses — the standard three, plus the nonstandard categories the
// rulesets add (Quick Action, Grand Action, Pair Action) and the ones that cost nothing at all.
export const ACTION_COST = {
  action: "Action", bonus: "Bonus", reaction: "Reaction", quick: "Quick", grand: "Grand",
  pair: "Pair", free: "Free", passive: "Passive",
};

// ── Gear ────────────────────────────────────────────────────────────────
// The slots from Equipment Ruleset.md, in its order, with the three columns Zariel's own Equipment
// note keeps: the item, whether it is magical, and whether it is attuned.
// What an item is doing, in the fewest words that are still true: its effects while they are in
// force, and a greyed version of them while they are not, because "this ring does nothing right now"
// is a thing a player needs to be able to see without taking it off to check.
function itemLine(ch, r) {
  const fx = rules.itemEffectList(r.item);
  const live = rules.itemIsActive(ch, r.item, r.where);
  const bits = fx.map(e => `${sign(e.amount)} ${targetLabel(e.target)}`);
  if (r.item.qty > 1) bits.unshift(`×${r.item.qty}`);
  if (r.item.weight) bits.push(`${rules.itemWeightTotal(r.item)} lb`);
  if (!bits.length) return r.item.notes ? esc(r.item.notes) : "";
  return `<span class="${fx.length && !live ? "off" : ""}">${esc(bits.join(" · "))}</span>${
    fx.length && !live ? ` <span class="tag">not in force</span>` : ""}`;
}

// The charge chip: one click spends one. Mid-session that is the whole interaction, and burying it
// in a dialog would mean opening a dialog every time somebody waves a wand.
function chargeChip(r) {
  const c = rules.itemCharges(r.item);
  if (!c) return "";
  return `<button class="chg ${c.left ? "" : "out"}" data-act="item-use" data-id="${esc(r.where)}"
    ${c.left ? "" : "disabled"}
    title="${esc(`${c.left} of ${c.max} charges left · ${rules.RECHARGE_BY_ID[c.recharge].label}${
      c.left ? " · click to spend one" : ""}`)}">${c.left}/${c.max}</button>`;
}

function gearPanel(ch) {
  const att = rules.attunement(ch, { inInsomnia: state.inInsomnia });
  const row = s => {
    const it = (ch.equipment || {})[s.id] || {};
    const filled = !!it.name;
    const r = { item: it, where: `slot:${s.id}`, slot: s.id };
    const line = filled ? itemLine(ch, r) : "";
    return `<div class="slot ${filled ? "on" : ""}">
      <span class="slot-i" title="${esc(s.eg)}">${icon("slot." + s.id)}</span>
      <span class="slot-n">${esc(s.name)}</span>
      <button class="slot-v" data-act="slot-edit" data-id="${s.id}"
        title="${filled ? esc(it.notes || s.eg) : esc(s.eg)}">${filled
          ? `<b>${esc(it.name)}</b>${line ? `<span>${line}</span>` : ""}`
          : `<em>empty</em>`}</button>
      ${filled ? chargeChip(r) : `<span></span>`}
      ${filled ? `<span class="slot-f">
          <button class="pipx ${it.magical ? "on" : ""}" data-act="slot-flag" data-id="${s.id}" data-k="magical"
            title="Magical">${icon("effect")}</button>
          <button class="pipx ${it.attuned ? "on" : ""}" data-act="slot-flag" data-id="${s.id}" data-k="attuned"
            title="${it.requiresAttunement ? "Attuned — this one needs it to work" : "Attuned"}">${icon("attunement")}</button>
          <button class="pipx ${it.insomniaOnly ? "dream" : ""}" data-act="slot-flag" data-id="${s.id}" data-k="insomniaOnly"
            title="Dreamlike or Lucidlike — uses an Insomnia-only attunement slot">${icon("dream")}</button>
        </span>` : `<span class="slot-f"></span>`}
    </div>`;
  };

  const worn = rules.slotsFor(ch, rules.WORN_SLOTS).map(row).join("");
  const wielded = rules.slotsFor(ch, rules.WIELDED_SLOTS).map(row).join("");
  const anatomy = rules.WORN_SLOTS.filter(s => s.optional);

  const attRow = (list, cap, label, dream) => `
    <div class="attn-grp ${dream ? "dream" : ""}">
      <div class="attn-h"><b>${label}</b><span>${list.length}/${cap}</span>
        ${dream && !state.inInsomnia ? `<span class="tag">inactive while awake</span>` : ""}</div>
      ${list.length ? `<div class="chips">` + list.map(i =>
        `<span class="chip ${dream && !state.inInsomnia ? "dim" : "on"}">${esc(i.name)}</span>`).join("") + `</div>`
        : `<p class="hint">None.</p>`}
    </div>`;

  const normal = rules.attunedItems(ch).filter(i => !i.insomniaOnly);
  const dreamish = rules.attunedItems(ch).filter(i => i.insomniaOnly);

  return `<section class="card">
      <h3>${icon("gear")} Worn <span class="r">
        <button class="btn sm" data-act="anatomy">Body slots</button></span></h3>
      <div class="slots2">${worn}</div>
      ${anatomy.every(s => !(ch.anatomy || []).includes(s.id))
        ? `<p class="hint">Tail, Wings and Horn are off by default — turn on the ones you have.</p>` : ""}
    </section>

    <section class="card">
      <h3>${icon("attack")} Wielded</h3>
      <div class="slots2">${wielded}</div>
      <p class="hint">One item per slot. A ring is a Bonus Action to swap, a worn item an Action,
        and unattuning waits for a Short Rest.</p>
    </section>

    <section class="card">
      <h3>${icon("attunement")} Attunement</h3>
      ${attRow(normal, att.baseline, "Attuned", false)}
      ${attRow(dreamish, rules.ATTUNEMENT_INSOMNIA, "Dream attuned", true)}
      ${att.over ? `<p class="hint hot">${att.over} more than your slots allow — choose which are active.</p>` : ""}
      <p class="hint">Three slots, and three more in Insomnia for Dreamlike and Lucidlike items.
        Leaving Insomnia does not break those attunements; their effects just go inactive.</p>
    </section>

    <section class="card">
      <h3>${icon("compendium")} Carried <span class="r">
        <button class="btn sm" data-act="carry-add">Add</button></span></h3>
      ${(ch.carried || []).length ? `<div class="carry">` + ch.carried.map((it, i) => {
        const r = { item: it, where: `pack:${i}`, index: i };
        const line = itemLine(ch, r);
        return `<div class="carry-r">
          <button class="carry-n" data-act="item-edit" data-id="${esc(r.where)}"
            title="${esc(it.notes || "Open it")}">
            <b>${esc(it.name)}</b>${line ? `<span>${line}</span>` : ""}</button>
          ${chargeChip(r)}
          <button class="btn sm" data-act="item-equip" data-id="${esc(r.where)}"
            title="Put it in a slot, where its effects count">Equip</button>
          <button class="x" data-act="carry-del" data-id="${i}" aria-label="Remove ${esc(it.name)}">×</button>
        </div>`;
      }).join("") + `</div>`
        : `<p class="hint">Nothing carried but not equipped. An item only grants its effects from a
          slot — carrying a ring in your pack has never done anything.</p>`}
    </section>

    ${purseCard(ch)}`;
}

// Coin and what it all weighs. The encumbrance thresholds are the OPTIONAL 5e rule, so the card
// names the band you are in and never touches a single number because of it.
function purseCard(ch) {
  const w = rules.carriedWeight(ch);
  const enc = rules.encumbrance(ch);
  return `<section class="card">
      <h3>${icon("gear")} Coin and load</h3>
      <div class="coins">${rules.COINS.map(c => `
        <label class="coin"><span>${esc(c.short)}</span>
          <input class="txt" type="number" min="0" max="999999" data-act="coin" data-id="${c.id}"
            value="${Number(ch.coins?.[c.id]) || 0}" aria-label="${esc(c.name)}"></label>`).join("")}
      </div>
      <div class="stats">
        <div class="stat"><b>${rules.coinTotalGp(ch.coins)}</b><i>gold piece value</i></div>
        <div class="stat"><b>${w.total}</b><i>pounds carried</i></div>
        <div class="stat"><b>${enc.capacity}</b><i>your capacity</i></div>
      </div>
      <p class="hint">${w.items} lb of gear and ${w.coins} lb of coin — fifty coins to the pound,
        whatever they are made of.
        ${enc.band === "none"
          ? `Encumbered above ${enc.encumbered} lb and heavily above ${enc.heavilyEncumbered} lb, under the optional rule.`
          : `<b class="hot">${esc(enc.label)}</b> under the optional rule — the sheet says so and changes nothing.`}</p>
    </section>`;
}

// Everything that is simply TRUE of this character, as opposed to running out — a worn item's
// bonus, a permanent ability bump, an effect somebody wrote down with no duration. These used to
// sit in the Round card beside the countdowns, which was fine with two of them and unreadable with
// ten; they are grouped by where they come from, because "my gear" and "something I wrote down" are
// looked for differently and only one of them has a × .
function lastingCard(ch) {
  const all = rules.activeModifiers(ch)
    .filter(m => m && m.active !== false && m.rounds == null);
  const fromItems = all.filter(rules.isItemModifier);
  const written = all.filter(m => !rules.isItemModifier(m));

  const row = m => `<div class="mod${rules.isItemModifier(m) ? " item" : ""}">
    <span class="mod-n">${sign(m.amount)} ${esc(targetLabel(m.target))}</span>
    <span class="mod-w" title="${esc(m.reason)}">${esc(m.reason)}</span>
    ${rules.isItemModifier(m)
      ? `<span class="mod-r" title="Worn — it goes when the item does">${icon("gear")}</span><span class="x"></span>`
      : `<span class="mod-r" title="No duration — it does not expire">${icon("lasting")}</span>
         <button class="x" data-act="mod-del" data-id="${esc(m.id)}" aria-label="Remove">×</button>`}</div>`;

  return `<section class="card">
      <h3>${icon("lasting")} Lasting effects <span class="r">
        <button class="btn sm" data-act="mod-add" title="A named change, with a reason">Add effect</button></span></h3>
      ${all.length ? `
        ${fromItems.length ? `<div class="zone-h sm"><h4>From what you are wearing</h4></div>
          <div class="mods">${fromItems.map(row).join("")}</div>` : ""}
        ${written.length ? `<div class="zone-h sm"><h4>Written down</h4></div>
          <div class="mods">${written.map(row).join("")}</div>` : ""}
        <p class="hint">Anything with a duration lives in <b>Round</b> instead, where it counts down.
          A worn item's line has no × — it goes when the item comes off.</p>`
        : `<p class="hint">Nothing lasting. An item's effects appear here the moment it is in a slot,
          and an effect you add with no duration lands here rather than in the round tracker.</p>`}
    </section>`;
}

// Features by source, which is what CS-060 asks for and also how anyone actually looks for one: a
// player hunting Channel Divinity is thinking "my Cleric features", not scrolling one long list.
// A derived feature carries no × — it follows its class, and a delete that comes straight back on
// the next sync would read as a bug.
const FEATURE_GROUPS = { ancestry: "Ancestry", background: "Background", feat: "Feats", item: "Items" };

function featureList(ch) {
  const all = (ch.features || []).map((f, i) => ({ ...f, i })).filter(f => f && f.name);
  if (!all.length) return `<p class="hint">Nothing yet.</p>`;
  const groups = new Map();
  for (const f of all) {
    const key = f.source === "class" && f.className ? `class:${f.className}` : (f.source || "other");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(f);
  }
  const label = key => key.startsWith("class:") ? key.slice(6)
    : FEATURE_GROUPS[key] || (key === "other" ? "Yours" : key[0].toUpperCase() + key.slice(1));

  // Classes first, in the order they sit on the sheet, then everything else.
  const order = [...groups.keys()].sort((a, b) =>
    (a.startsWith("class:") ? 0 : 1) - (b.startsWith("class:") ? 0 : 1) || label(a).localeCompare(label(b)));

  return order.map(key => `<div class="featgrp">
    <div class="zone-h sm"><h4>${esc(label(key))}</h4></div>
    <div class="abl">${groups.get(key).sort((a, b) => (a.level || 0) - (b.level || 0)).map(f => `
      <div class="ab3"><div class="ab3-h" data-act="feat-open" data-id="${f.i}">
          <span class="nm">${esc(f.name)}</span>
          ${f.level ? `<span class="tag">Lv ${f.level}</span>` : ""}
          ${f.uses ? `<span class="uses">${Array.from({ length: Math.min(12, f.uses) }, (_, n) =>
            `<button class="pip ${n < (f.used || 0) ? "used" : ""}" data-act="feat-use" data-id="${f.i}" data-i="${n}"
              aria-label="${esc(f.name)} use ${n + 1}"></button>`).join("")}<em>${(f.uses - (f.used || 0))}/${f.uses}</em></span>` : ""}
          ${rules.isDerivedFeature(f) ? "" :
            `<button class="x" data-act="feat-del" data-id="${f.i}" aria-label="Remove ${esc(f.name)}">×</button>`}
        </div>
        <div class="ab3-b">${esc(f.text || "")}</div></div>`).join("")}</div></div>`).join("");
}

// One class on the sheet: its name, how many of the character's levels it holds, and the archetype
// it is following. The stepper is here rather than in the level-up flow because a multiclass split
// is the one number a player may want to correct long after the level that created it.
function classRow(entry, i, plan, total) {
  const p = (plan?.classes || []).find(x => x.className === entry.name);
  const subs = p?.subclassOptions || [];
  // The class's own word for the choice, and its own level for it — a Wizard is asked for an Arcane
  // Tradition at 2, whatever level the earliest tradition happens to grant something at.
  const asks = p?.subclassLabel && p.subclassLabel !== "Subclass" ? p.subclassLabel : "subclass";
  const at = p?.subclassAskedAt;
  return `<div class="clsrow">
    <span class="clsrow-n"><b>${esc(entry.name)}</b>
      ${entry.subclass ? `<em>${esc(entry.subclass)}</em>`
        : subs.length && at != null && (p?.level || 0) >= at
          ? `<button class="chip on" data-act="choice-open" data-id="subclass" data-cls="${esc(entry.name)}">Choose ${esc(/^[aeiou]/i.test(asks) ? "an" : "a")} ${esc(asks.toLowerCase())}</button>`
          : subs.length && at != null ? `<em class="mute">${esc(asks.toLowerCase())} at level ${at}</em>` : ""}
      ${p?.unknown ? `<span class="tag warn" title="No compendium entry — nothing can be derived for it">not in the compendium</span>` : ""}
    </span>
    <span class="step" title="How many of your ${total} levels are in ${esc(entry.name)}">
      <button data-act="class-level" data-id="${i}" data-d="-1" aria-label="One level less of ${esc(entry.name)}">–</button>
      <span>${entry.level}</span>
      <button data-act="class-level" data-id="${i}" data-d="1" aria-label="One level more of ${esc(entry.name)}">+</button></span>
    <button class="x" data-act="class-del" data-id="${i}" aria-label="Remove ${esc(entry.name)}">×</button>
  </div>`;
}

function characterPanel(ch) {
  const c = state.current;
  const lvl = pendingLevel();
  const unlocks = openUnlocks().filter(u => u !== lvl);
  const plan = state.classPlan;
  const classes = (ch.classes || []).filter(x => x && x.name);
  const assigned = classes.reduce((n, x) => n + (Number(x.level) || 0), 0);
  const choices = plan?.choices || [];

  return `${lvl ? `<section class="card hi lvlcard">
      <h3>${icon("levelUp")} Level ${lvl.target_level} is open</h3>
      <p>Your DM has cleared you for <b>level ${lvl.target_level}</b>. Taking it adds the features that
        come with it, asks only about what is actually yours to choose, and gives you one Honor and
        one Morality point to spend.</p>
      <button class="btn pri lvlup" data-act="level-up">${icon("levelUp")} Level up to ${lvl.target_level}</button>
      <p class="hint">Nothing changes until you confirm it, and the level stays at ${c.level} until you do.</p>
    </section>` : ""}

    ${choices.length ? `<section class="card">
      <h3>${icon("choice")} Still to choose</h3>
      <div class="chips">${choices.map(ct => `
        <button class="chip on" data-act="choice-open" data-id="${esc(ct.id)}" data-cls="${esc(ct.className)}">
          ${esc(ct.className)} ${ct.level} · ${esc(ct.label)}${ct.pick ? ` <em>pick ${ct.pick}</em>` : ""}</button>`).join("")}</div>
      <p class="hint">A choice your class offers and nobody has made yet. Picking one adds its feature
        below; a subclass also brings every one of its later features as you level, without asking again.</p>
    </section>` : ""}

    ${unlocks.length ? `<section class="card hi">
      <h3>Your DM has opened something</h3>
      <div class="chips">${unlocks.map(u => `<button class="chip on" data-act="unlock" data-id="${u.id}">
        ${u.kind === "asi" ? "Ability score improvement" : u.kind === "feat" ? "A feat" : esc(u.note || "A level")}</button>`).join("")}</div>
      <p class="hint">Each one is spent once. What you choose is recorded with it.</p>
    </section>` : ""}

    <section class="card">
      <h3>Identity <span class="r"><button class="btn sm" data-act="compendium" data-id="class">Compendium</button></span></h3>
      <div class="fields">
        <label>Name<input class="txt" data-act="field" data-id="name" value="${esc(c.name)}" maxlength="60"></label>
        <label>Hit dice<input class="txt" data-act="field" data-id="hitDice" value="${esc(ch.hitDice)}" maxlength="30" placeholder="e.g. 11d8"></label>
      </div>
      <div class="build">
        ${buildRow("Ancestry", ch.ancestry, "race")}
        ${buildRow("Background", ch.background, "background")}
      </div>
      <div class="clslist">
        <div class="zone-h sm"><h4>Classes</h4><span class="pbtag ${assigned === c.level ? "" : "hot"}"
          title="Your class levels have to add up to the level your DM granted">${assigned} of ${c.level}</span></div>
        ${classes.length
          ? classes.map((x, i) => classRow(x, i, plan, c.level)).join("")
          : `<p class="hint">No class yet. Take one from the compendium and everything it grants at
               level ${c.level} arrives with it.</p>`}
        <button class="btn sm" data-act="compendium" data-id="class">${classes.length ? "Add another class" : "Take a class"}</button>
        ${assigned !== c.level ? `<p class="hint hot">${assigned > c.level
          ? `That is ${assigned - c.level} more than your DM granted.`
          : `${c.level - assigned} of your levels are not in a class yet.`} Only your DM can change
          the total — move levels between classes with the steppers.</p>` : ""}
      </div>
      ${plan?.multiclassCasters?.length ? `<p class="hint">You cast from
        <b>${esc(plan.multiclassCasters.join(" and "))}</b>. The 2014 multiclass slot table is its own
        progression, so your slots are left as you set them rather than taken from one class's column.</p>` : ""}
      ${ch.skillChoices?.from?.length ? `<p class="hint">Your class lets you pick
        <b>${ch.skillChoices.pick}</b> of: ${esc(ch.skillChoices.from.join(", "))} — mark them
        proficient in the Skills list on the left.</p>` : ""}
      <p class="hint">Picking one fills in what it brings — ability bonuses as named effects you can
        see and undo, traits and features in the list below, saving throws, and spell slots.
        Level ${c.level} is your DM's to set, and so are your Dream score and your Fate balance.</p>
    </section>

    <section class="card">
      <h3>${icon("character")} Portrait &amp; colour</h3>
      <div class="look">
        ${portraitHtml(ch, c.name, "lg")}
        <div class="look-do">
          <button class="btn sm" data-act="portrait">${ch.portrait ? "Change portrait" : "Choose a portrait"}</button>
          ${ch.portrait ? `<button class="btn sm warn" data-act="portrait-clear">Remove</button>` : ""}
          <div class="swatches">${ACCENTS.map(a => `
            <button class="sw ${ch.accent === a.id ? "on" : ""}" data-act="accent" data-id="${a.id}"
              style="--sw:${a.value}" title="${esc(a.name)}" aria-label="${esc(a.name)}"></button>`).join("")}
            <button class="sw none ${ch.accent ? "" : "on"}" data-act="accent" data-id=""
              title="Default brass" aria-label="Default">—</button>
          </div>
        </div>
      </div>
      <p class="hint">The colour follows you through the sheet. Portraits are placeholders for now —
        your DM can drop the real ones into <code>sheet/img/portraits/</code>.</p>
    </section>

    ${lastingCard(ch)}

    <section class="card">
      <h3>${icon("effect")} Features &amp; traits <span class="r"><button class="btn sm" data-act="feat-add">Add</button></span></h3>
      ${featureList(ch)}
      <p class="hint">A feature with a class beside it is derived from that class and follows it — it
        arrives with the level that grants it and goes if the level is taken back, so there is
        nothing to remove by hand. What you have spent of a pool is yours and survives both.</p>
    </section>

    <section class="card">
      <h3>Notes</h3>
      <textarea class="txt ta" data-act="field" data-id="notes" rows="6"
        placeholder="Prepared spells, inventory, whatever you need to hand">${esc(ch.notes)}</textarea>
    </section>

    <section class="card">
      <h3>History <span class="r"><button class="btn sm" data-act="history">Open</button></span></h3>
      <p class="hint">Every level, Dream event, Fate use and unlock, with who did it and when.</p>
    </section>`;
}

// ── right: the campaign's own tracks ────────────────────────────────────
function renderRight() {
  const ch = derived();
  const c = state.current;
  const de = rules.dreamExhaustion(ch.dreamExhaustion);
  const unhealed = ch.injuries.filter(i => i && !i.healed).length;
  // The Round card is about THIS ROUND, so it holds only what runs out. A worn item's +1 and a
  // permanent ability bump are simply true of you; they belong with the character, not beside a
  // countdown — and once a party is six items deep this rail would otherwise be unreadable.
  const all = rules.activeModifiers(ch).filter(m => m && m.active !== false);
  const active = all.filter(m => m.rounds != null);
  const lasting = all.length - active.length;

  const step = (act, ic, label, value, max, title) => `
    <span class="trk" title="${esc(title)}"><i>${icon(ic)}${label}</i>
      <span class="step"><button data-act="${act}" data-d="-1" aria-label="Lower ${label}">–</button>
        <span>${value}${max ? `<em>/${max}</em>` : ""}</span>
        <button data-act="${act}" data-d="1" aria-label="Raise ${label}">+</button></span></span>`;

  // Order is Juan's: Round, Rest, Wounds, Exhaustion, Honor — then Fate, which is rare enough that
  // it does not deserve the top of the rail or a control you can nudge by accident.
  $("right").innerHTML = `
    <section class="card">
      <h3>${icon("round")} Round ${ch.round} <span class="r">
        <button class="btn sm" data-act="mod-add" title="A named change, with a reason">Add effect</button></span></h3>
      <div class="rounds">
        <button class="btn pri" data-act="next-round">Next round</button>
        <button class="btn sm" data-act="end-combat">End combat</button>
      </div>
      ${active.length ? `<div class="mods">` + active.map(m => `
        <div class="mod">
          <span class="mod-n">${sign(m.amount)} ${esc(targetLabel(m.target))}</span>
          <span class="mod-w" title="${esc(m.reason)}">${esc(m.reason)}</span>
          <span class="mod-r">${icon("timed")}${m.rounds}r</span>
          <button class="x" data-act="mod-del" data-id="${esc(m.id)}" aria-label="Remove">×</button></div>`).join("") + `</div>`
        : `<p class="hint">Nothing running. A timed effect counts down when you confirm a round.</p>`}
      ${lasting ? `<button class="lastlink" data-act="tab" data-id="character"
        title="They do not expire, so they do not belong beside a countdown">
        ${icon("lasting")}${lasting} lasting effect${lasting === 1 ? "" : "s"} — on the Character tab</button>` : ""}
    </section>

    <section class="card">
      <h3>${icon("rest")} Rest</h3>
      <div class="rests">
        <button class="btn" data-act="rest" data-id="short">Short</button>
        <button class="btn" data-act="rest" data-id="long">Long</button>
        <button class="btn" data-act="rest" data-id="haven" title="Two consecutive Safe Haven long rests clear every Wound">Safe Haven</button>
      </div>
      ${ch.safeHavenRests ? `<p class="hint">${ch.safeHavenRests} consecutive Safe Haven rest${ch.safeHavenRests > 1 ? "s" : ""}
        — ${ch.safeHavenRests >= 2 ? "Wounds cleared" : "one more clears your Wounds"}.</p>` : ""}
    </section>

    <section class="card">
      <h3>${icon("wounds")} Wounds &amp; Injuries</h3>
      <div class="trks">
        ${step("wounds", "wounds", "Wounds", ch.wounds, "", "Each Wound adds +1 to your death save and concentration DCs")}
      </div>
      ${ch.wounds >= rules.INJURY_AT_WOUNDS ? `<p class="hint hot">
        Six Wounds — an Injury is due. <button class="btn sm warn" data-act="injury-add">Record it</button></p>` : ""}
      ${ch.injuries.length ? `<div class="chips">` + ch.injuries.map((inj, i) => `
        <button class="chip ${inj.healed ? "dim" : "on"}" data-act="injury" data-id="${i}"
          title="${inj.healed ? "Healed" : "Unhealed — still raising both DCs"}">${icon("injuries")} ${esc(inj.name)}</button>`).join("") + `</div>`
        : `<p class="hint">None recorded.</p>`}
      ${unhealed ? `<p class="hint">${unhealed} unhealed · death save DC <b>${rules.deathSaveDC(ch.wounds, unhealed)}</b></p>` : ""}
    </section>

    <section class="card">
      <h3>${icon("exhaustion")} Exhaustion</h3>
      <div class="trks">
        ${step("exh", "exhaustion", "Physical", ch.exhaustion, 6, "Standard 5e Exhaustion")}
        ${step("dexh", "dreamExhaustion", "Dream", de.level, 8, de.name)}
      </div>
      ${de.level ? `<p class="hint dreamy"><b>${esc(de.name)}</b> · ${de.penalty} to d20 rolls
        <b>in a dream</b>${de.concentrationDisadvantage ? " · disadvantage on Concentration" : ""}</p>` : ""}
      ${ch.exhaustion >= 6 ? `<p class="hint hot">Six levels of physical Exhaustion.</p>` : ""}
    </section>

    <section class="card">
      <h3>${icon("honor")} Honor &amp; Morality</h3>
      <div class="axes">
        ${axisRow("Honor", ch.honor, "order", "chaos", c.unspent?.honor)}
        ${axisRow("Morality", ch.morality, "good", "evil", c.unspent?.morality)}
      </div>
      <p class="hint">A check aligned with the higher side gets the difference as a bonus, the lower side
        gets it as a penalty, and a tie is nothing.</p>
    </section>

    <section class="card fate">
      <h3>${icon("fate")} Fate <span class="r"><b class="fate-n">${c.fate}</b></span></h3>
      <button class="btn sm" data-act="emphasis" ${c.fate > 0 ? "" : "disabled"}>Roll with Emphasis</button>
      <p class="hint">Two d20, keep the face <b>farthest from 10</b>. Your DM grants these and
        nothing gives them back.</p>
    </section>`;
}

// One line of the builder: what is chosen, and the way to change it. The compendium opens on the
// right kind so nobody has to find "Ancestries" from a list of six.
function buildRow(label, value, kind) {
  return `<div class="buildrow">
    <i>${label}</i>
    <b class="${value ? "" : "none"}">${esc(value || "not chosen")}</b>
    <button class="btn sm" data-act="compendium" data-id="${kind}">${value ? "Change" : "Choose"}</button>
  </div>`;
}

function axisRow(label, axes, a, b, unspent) {
  const [ka, kb] = [a, b];
  const total = Number(axes?.[ka] || 0) + Number(axes?.[kb] || 0);
  const mod = rules.axisModifier(axes, ka);
  return `<div class="axis">
    <div class="axis-h"><b>${label}</b><span>${total}</span>
      ${unspent ? `<button class="btn sm pri" data-act="allocate-open" title="${unspent} to allocate">+${unspent}</button>` : ""}</div>
    <div class="axis-b">
      <button class="side ${mod > 0 ? "up" : mod < 0 ? "dn" : ""}" data-act="roll-axis" data-id="${ka}"
        title="Roll a ${esc(ka)}-aligned check">${cap(ka)} ${axes?.[ka] || 0} <em>${sign(mod)}</em></button>
      <button class="side ${mod < 0 ? "up" : mod > 0 ? "dn" : ""}" data-act="roll-axis" data-id="${kb}"
        title="Roll a ${esc(kb)}-aligned check">${cap(kb)} ${axes?.[kb] || 0} <em>${sign(-mod)}</em></button>
    </div></div>`;
}

const cap = s => s[0].toUpperCase() + s.slice(1);

export function targetLabel(target) {
  if (!target) return "";
  const [kind, id] = String(target).split(":");
  if (kind === "ability") return rules.ABILITY_NAME[id] || id;
  if (kind === "save") return `${rules.ABILITY_NAME[id] || id} save`;
  if (kind === "skill") return rules.SKILL_BY_ID[id]?.name || id;
  return { ac: "AC", speed: "Speed", initiative: "Initiative", maxHp: "Max HP",
           attack: "Attack", damage: "Damage", saveDc: "Save DC" }[kind] || kind;
}

export const MOD_TARGETS = [
  ...rules.ABILITIES.map(id => ({ value: `ability:${id}`, label: rules.ABILITY_NAME[id] })),
  { value: "ac", label: "AC" }, { value: "speed", label: "Speed" },
  { value: "initiative", label: "Initiative" }, { value: "maxHp", label: "Maximum HP" },
  { value: "attack", label: "Attack rolls" }, { value: "damage", label: "Damage" },
  { value: "saveDc", label: "Your save DCs" },
  ...rules.ABILITIES.map(id => ({ value: `save:${id}`, label: `${rules.ABILITY_NAME[id]} save` })),
  ...rules.SKILLS.map(s => ({ value: `skill:${s.id}`, label: s.name })),
];
