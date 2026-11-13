// The sheet's controller: boot it, and turn a click into a change.
//
// One listener for the whole page. Every control in view.js carries a `data-act`, and the table
// below says what each one does — so there are no inline handlers (this is a module, they would not
// be in scope) and no per-element listeners to re-attach on every redraw.

import * as rules from "./rules.js";
import * as store from "./store.js";
import { state, derived, mutate } from "./store.js";
import { renderAll, targetLabel, MOD_TARGETS, ACCENTS, PORTRAITS, portraitUrl, fullArtUrl,
  portraitOf, ACTION_COST, toggleHtml, TAB_ORDER } from "./view.js";
import * as compendium from "./compendium.js";
import * as ephemer from "./ephemer.js";
import * as vault from "./vault.js";
import { esc, sign, toast, popAt, closePop, popKey, popContains, dialog, closeDialog,
  lightbox, rollCheck, rollDice, rollHtml, parseDice } from "./pop.js";
import { icon } from "./icons.js";

const ch = () => derived();
const uid = () => Math.random().toString(36).slice(2, 10);

// Regaining a hit point from zero clears the death saves (Juan, 2026-10-28 — Ephemer follows 5e).
// Every way back writes it through here — a quick heal, the hit point dialog, a hit die and a long
// rest, which carries it in its own preview — so the ruling is one line, not four.
const clearDeathSaves = s => { s.deathSaveSuccesses = 0; s.deathSaveFailures = 0; };

// ── boot ────────────────────────────────────────────────────────────────
store.onChange(renderAll);

// What the classes imply is derived from the compendium, which is a fetch — and the view is
// synchronous. So it is computed here, whenever the character or its class list changes, and parked
// on `state` for the view to read. Keying on the class list is what stops this from looping: the
// refresh emits, this listener runs again, the key is the same, and nothing more happens.
let planKey = null;
store.onChange(() => {
  const c = state.current;
  const key = c ? `${c.id}|${c.level}|${JSON.stringify(c.sheet.classes || [])}` : "";
  if (key === planKey) return;
  planKey = key;
  compendium.refreshClassPlan();
});

(async function init() {
  try {
    await store.boot();
  } catch (err) {
    if (err.status === 401) { location.href = "../"; return; }
    document.getElementById("fail").hidden = false;
    document.getElementById("failWhy").textContent = err.message;
    return;
  }
  document.getElementById("app").hidden = false;
  renderAll();
})();

// ── the dispatcher ──────────────────────────────────────────────────────
document.addEventListener("click", e => {
  const el = e.target.closest("[data-act]");
  if (!el) return;
  const act = el.dataset.act;
  if (!ACTS[act]) return;
  e.preventDefault();
  e.stopPropagation();

  // Because that stopPropagation runs in the capture phase, pop.js's document-level dismissal never
  // sees this click — so a pinned popover used to survive every button on the page and sit there
  // until you found bare background to click. Dismissal is handled here instead.
  //
  // It is done AFTER the action, and only if the action did not itself open or toggle a popover:
  // comparing the pinned key across the call distinguishes "this click opened a pop" and "this
  // click toggled the same pop shut" from "this click was somewhere else entirely".
  const insidePop = popContains(e.target);
  const keyBefore = popKey();
  try { ACTS[act](el, e); } catch (err) { toast(err.message || "That did not work."); }
  if (!insidePop && popKey() === keyBefore) closePop(true);
}, true);

document.addEventListener("input", e => {
  const el = e.target.closest("[data-act]");
  if (!el) return;
  if (el.dataset.act === "skill-query") { state.skillQuery = el.value; renderAll(); document.getElementById("skillQ")?.focus(); }
  if (el.dataset.act === "field") setField(el.dataset.id, el.value);
  if (el.dataset.act === "coin") ACTS.coin(el);
});

document.addEventListener("submit", e => {
  const el = e.target.closest("[data-act]");
  if (!el) return;
  e.preventDefault();
  if (el.dataset.act === "create-form") {
    const name = document.getElementById("newName").value.trim();
    if (name) store.create(name).catch(err => toast(err.message));
  }
  if (el.dataset.act === "learn-add") {
    const input = document.getElementById("lrnName");
    const name = input.value.trim();
    if (!name) return;
    if ((state.learning || []).some(l => l.name.toLowerCase() === name.toLowerCase()))
      return toast(`${name} is already on your tracker.`);
    input.value = "";
    // One mark, because tracking something you have not begun is what the row itself says.
    ephemer.setDepth(name, 1).catch(err => toast(err.message));
  }
});

// Number keys switch the centre tab, the way the Grimm Companion's do.
document.addEventListener("keydown", e => {
  if (e.target.matches("input, textarea, select")) return;
  if (e.key >= "1" && e.key <= String(TAB_ORDER.length)) showTab(TAB_ORDER[+e.key - 1]);
});

// Switching tabs, in one place, because the two that hold Ephemer's own systems have to fetch what
// the ACCOUNT knows the first time either is opened — and a player who never opens them never pays
// for those requests.
function showTab(id) {
  if (!id) return;
  state.view = id;
  if (id === "arts" || id === "grimm") ephemer.ensure().catch(() => {});
  renderAll();
}

// ── small helpers ───────────────────────────────────────────────────────
function setField(id, value) {
  if (id === "name") { store.rename(String(value).slice(0, 60)); return; }
  mutate(s => { s[id] = typeof s[id] === "number" ? Number(value) || 0 : String(value); });
}
const bump = (key, by, lo, hi) => mutate(s => {
  s[key] = Math.max(lo, Math.min(hi, (Number(s[key]) || 0) + by));
});

// Ask for a number, in a popover over the thing being changed, rather than a prompt() box.
function askNumber(el, { title, value, min = 0, max = 999, hint = "", onSet }) {
  const p = popAt(el, `<div class="pop-h"><b>${esc(title)}</b></div>
    <div class="pop-b"><input class="txt" id="popNum" type="number" value="${value}" min="${min}" max="${max}">
      ${hint ? `<p class="hint">${hint}</p>` : ""}</div>
    <div class="pop-f"><button class="btn sm pri" id="popOk">Set</button></div>`,
    { pin: true, key: "num" });
  const input = p.querySelector("#popNum");
  input.focus(); input.select();
  const commit = () => {
    const v = Math.max(min, Math.min(max, Number(input.value) || 0));
    closePop(true); onSet(v);
  };
  p.querySelector("#popOk").onclick = commit;
  input.onkeydown = ev => { if (ev.key === "Enter") commit(); };
}

// Every d20 roll lands in the same dialog, with its breakdown, and can be rerolled with advantage
// or disadvantage without re-deriving the modifier.
//
// `scopes` is what this particular roll answers to — a skill check answers to this skill, every
// skill and every check. If somebody's seal has granted advantage on any of them, THE FIRST ROLL IS
// ALREADY MADE WITH IT, and the dialog says whose seal. The alternative is a buff that only works
// when the player remembers they have it, which is the same as not having it.
function showRoll(label, modifier, breakdown, { critOn = 20, scopes = [] } = {}) {
  const given = rules.advantageOn(ch(), scopes);
  const draw = opts => {
    const r = rollCheck(modifier, { ...opts, critOn });
    // Said only when the advantage was GIVEN rather than asked for, because a player who just
    // pressed the Advantage button does not need telling why they have it.
    const why = opts.advantage && opts.given
      ? `<p class="hint">Advantage from <b>${esc(given.map(a => a.why).join(", "))}</b>.</p>` : "";
    const d = dialog(label, rollHtml(r, { label, breakdown }) + why, {
      footer: `<button class="btn sm" data-reroll="adv">Advantage</button>
        <button class="btn sm" data-reroll="dis">Disadvantage</button>
        <span class="sp"></span><button class="btn sm${given.length ? "" : " pri"}" data-reroll="again">
          ${given.length ? "Roll flat" : "Roll again"}</button>
        ${given.length ? `<button class="btn sm pri" data-reroll="keep">Roll again</button>` : ""}`,
    });
    d.querySelectorAll("[data-reroll]").forEach(b => b.onclick = () => {
      const k = b.dataset.reroll;
      draw(k === "adv" ? { advantage: true }
        : k === "dis" ? { disadvantage: true }
        // "Roll again" keeps whatever the seal gave you; "Roll flat" is how you decline it for one
        // roll, which is a thing a table does and should not need the effect dropped to do.
        : k === "keep" && given.length ? { advantage: true, given: true }
        : {});
    });
  };
  draw(given.length ? { advantage: true, given: true } : {});
}

const breakdownFor = (parts) => parts.filter(p => p && p.amount);

// ── one clock for the table ─────────────────────────────────────────────
// The DM's initiative board writes the round onto every sheet (POST /api/initiative/clock), and
// store.js hands it here rather than merging it, because arriving at round four has to EXPIRE three
// rounds of timed things on the way. So this presses the sheet's own buttons: the arithmetic stays
// in one place, and whatever ran out is announced in the same toast the player would have seen if
// they had pressed it themselves.
//
// It only ever moves FORWARD. A board that is behind this sheet — a DM who stepped back a round to
// correct themselves — must not un-expire anything, so it is ignored; the number catches up on the
// next round. The player's own button is untouched and still works.
store.onClock((round, inCombat) => {
  if (inCombat === false && ch().inCombat) {
    ACTS["end-combat"]();
    toast("The fight ended.");
    return;
  }
  if (round == null) return;
  // A guard rather than a trusted number: 20 rounds of catching up is already far more than a tab
  // left open through a fight, and an unbounded loop here would be a frozen sheet.
  for (let n = 0; n < 20 && (Number(ch().round) || 1) < round; n++) ACTS["next-round"]();
});

// ── the actions ─────────────────────────────────────────────────────────
const ACTS = {
  "dlg-close": () => closeDialog(),
  tab: el => { showTab(el.dataset.id); },

  // ── Ephemer's own systems ──
  // The tracker writes straight through to the account, because it is the DM's reminder as much as
  // the player's note — a depth that only existed in this browser would be neither.
  "learn-depth": el => ephemer.setDepth(el.dataset.id, Number(el.dataset.i))
    .catch(err => toast(err.message)),
  "learn-drop": el => ephemer.dropLearning(el.dataset.id).catch(err => toast(err.message)),
  "roll-learn": () => showRoll("Understanding a Cognition",
    rules.cognitionUnderstandingBonus(ch()),
    [{ reason: "Dream modifier", amount: rules.abilityModifier(ch(), "dream") }]),
  plane: () => { state.inInsomnia = !state.inInsomnia; renderAll(); },

  // ── switching, making and saving ──
  pick: el => {
    popAt(el, `<div class="pop-h"><b>Your characters</b></div>
      <div class="pop-b list">${state.list.map(c => `
        <button class="listrow ${c.id === state.current.id ? "on" : ""}" data-act="pick-one" data-id="${c.id}">
          <b>${esc(c.name)}</b><span>Lv ${c.level}</span></button>`).join("")}</div>
      <div class="pop-f"><button class="btn sm" data-act="pick-new">New character</button></div>`,
      { pin: true, key: "pick" });
  },
  "pick-one": el => { closePop(true); store.select(+el.dataset.id).catch(err => toast(err.message)); },
  "pick-new": () => {
    closePop(true);
    dialog("New character", `<form class="blank-form" id="mk">
        <input class="txt" id="mkName" maxlength="60" placeholder="Character name" required autocomplete="off">
        <button class="btn pri" type="submit">Create</button></form>
      <p class="hint">Your DM sets the level, the Dream score and any Fate once it exists.</p>`);
    document.getElementById("mk").onsubmit = ev => {
      ev.preventDefault();
      const name = document.getElementById("mkName").value.trim();
      if (!name) return;
      closeDialog();
      store.create(name).catch(err => toast(err.message));
    };
  },
  "save-state": () => {
    if (state.save === "conflict") {
      dialog("Saved somewhere else", `<p>${esc(state.saveError)}</p>
        <p class="hint">Another tab or another device saved this sheet after you opened it. Taking their
          copy discards the changes you made here; nothing is merged automatically, because quietly
          picking one would be how a sheet loses an evening's notes.</p>`, {
        footer: `<button class="btn sm pri" id="takeTheirs">Take their copy</button>
          <button class="btn sm" data-act="dlg-close">Keep mine for now</button>`,
      });
      document.getElementById("takeTheirs").onclick = () => { closeDialog(); store.takeServerCopy(); };
      return;
    }
    if (state.save === "error") store.retrySave();
  },

  // ── rolls ──
  "roll-ability": el => {
    const id = el.dataset.id, c = ch();
    showRoll(`${rules.ABILITY_NAME[id]} check`, rules.abilityCheckTotal(c, id),
      breakdownFor([{ reason: `${rules.ABILITY_NAME[id]} modifier`, amount: rules.abilityMod(c.abilities[id]) },
        // An effect on the SCORE is worth half of itself to the modifier; one on the check is worth
        // what it says, which is why the two are listed through different arithmetic.
        ...rules.contributions(rules.activeModifiers(c), `ability:${id}`).map(m => ({ reason: m.reason, amount: Math.floor(m.amount / 2) || m.amount })),
        ...rules.abilityCheckContributions(c)]),
      { scopes: rules.ADVANTAGE_SCOPES.ability(id) });
  },
  "roll-save": el => {
    const id = el.dataset.id, c = ch();
    showRoll(`${rules.ABILITY_NAME[id]} save`, rules.saveTotal(c, id),
      breakdownFor([{ reason: `${rules.ABILITY_NAME[id]} modifier`, amount: rules.abilityModifier(c, id) },
        { reason: "Proficiency", amount: c.saves?.[id] ? rules.proficiencyBonus(c.level) : 0 },
        ...rules.saveContributions(c, id)]),
      { scopes: rules.ADVANTAGE_SCOPES.save(id) });
  },
  "roll-skill": el => {
    const id = el.dataset.id, c = ch(), sk = rules.SKILL_BY_ID[id];
    const use = (sk.abilities.length > 1 && c.skillAbility?.[id]) || sk.abilities[0];
    const prof = c.skills?.[id] || 0;
    showRoll(sk.name, rules.skillTotal(c, id, use),
      breakdownFor([{ reason: `${rules.ABILITY_NAME[use]} modifier`, amount: rules.abilityModifier(c, use) },
        { reason: prof === 2 ? "Expertise" : "Proficiency", amount: rules.profContribution(rules.proficiencyBonus(c.level), prof) },
        ...rules.skillContributions(c, id)]),
      { scopes: rules.ADVANTAGE_SCOPES.skill(id) });
  },
  "roll-init": () => {
    const c = ch();
    showRoll("Initiative", rules.initiative(c),
      breakdownFor([{ reason: "Dexterity modifier", amount: rules.abilityModifier(c, "dex") },
        ...rules.contributions(rules.activeModifiers(c), "initiative"),
        // Initiative is a Dexterity check, so what every check gets, it gets.
        ...rules.abilityCheckContributions(c)]),
      { scopes: rules.ADVANTAGE_SCOPES.initiative() });
  },
  "roll-cogst": () => {
    const c = ch(), src = rules.cognitiveSavingThrowSources(c);
    showRoll("Cognitive Saving Throw", rules.cognitiveSavingThrowBonus(c),
      breakdownFor([{ reason: "Dream modifier", amount: rules.abilityModifier(c, "dream") },
        { reason: `Highest of the six (${src.tied.map(t => rules.ABILITY_NAME[t]).join(" or ")})`, amount: src.best }]));
  },
  "roll-axis": el => {
    const side = el.dataset.id, c = ch();
    const axes = ["order", "chaos"].includes(side) ? c.honor : c.morality;
    const mod = rules.axisModifier(axes, side);
    showRoll(`${side[0].toUpperCase() + side.slice(1)}-aligned check`, mod,
      [{ reason: `Difference between the two sides`, amount: mod }]);
  },
  dice: el => {
    dialog("Dice", `<form class="blank-form" id="dx">
        <input class="txt" id="dxE" placeholder="2d6+3" autocomplete="off" required>
        <button class="btn pri" type="submit">Roll</button></form>
      <div id="dxOut"></div>
      <p class="hint">Dice and flat numbers only — <code>2d6+3</code>, <code>1d20-1</code>, <code>2d6+1d4</code>.</p>`);
    document.getElementById("dx").onsubmit = ev => {
      ev.preventDefault();
      const expr = document.getElementById("dxE").value;
      const r = rollDice(expr);
      document.getElementById("dxOut").innerHTML = r
        ? rollHtml(r, { label: expr })
        : `<p class="hint hot">That is not an expression this will roll.</p>`;
    };
  },

  // ── editing the numbers ──
  "edit-ability": el => {
    const id = el.dataset.id;
    askNumber(el, { title: rules.ABILITY_NAME[id], value: ch().abilities[id], min: 1, max: 40,
      hint: "The base score. Temporary changes belong in an effect, so they can expire.",
      onSet: v => mutate(s => { s.abilities[id] = v; }) });
  },
  "edit-ac": el => askNumber(el, { title: "Armour Class", value: ch().ac, min: 0, max: 40,
    onSet: v => mutate(s => { s.ac = v; }) }),
  "edit-speed": el => askNumber(el, { title: "Speed", value: ch().speed, min: 0, max: 200,
    onSet: v => mutate(s => { s.speed = v; }) }),
  "cycle-prof": el => {
    const id = el.dataset.id;
    mutate(s => { s.skills[id] = ((Number(s.skills[id]) || 0) + 1) % 3; });
  },
  // A save's proficiency, which only a class could grant until now. Writing the state back as
  // "whatever the class says" when it AGREES with the class is what keeps a hand-set record from
  // outliving the reason for it: pick up Resilient, change class to one that grants the same save,
  // and the hand-set copy quietly disappears rather than surviving the next class change too.
  "save-prof": el => {
    const id = el.dataset.id;
    const next = !rules.saveProficient(ch(), id);
    mutate(s => {
      s.saves = { ...(s.saves || {}) };
      if (next === (s.savesFromClass || []).includes(id)) delete s.saves[id];
      else s.saves[id] = next;
    });
  },
  "pick-skill-ability": (el, e) => {
    e.stopPropagation();
    const id = el.dataset.id, sk = rules.SKILL_BY_ID[id];
    popAt(el, `<div class="pop-h"><b>${esc(sk.name)}</b></div>
      <div class="pop-b list">${sk.abilities.map(a => `
        <button class="listrow" data-act="set-skill-ability" data-id="${id}" data-ab="${a}">
          <b>${esc(rules.ABILITY_NAME[a])}</b><span>${sign(rules.skillTotal(ch(), id, a))}</span></button>`).join("")}</div>`,
      { pin: true, key: `sk:${id}` });
  },
  "set-skill-ability": el => {
    closePop(true);
    mutate(s => { s.skillAbility[el.dataset.id] = el.dataset.ab; });
  },
  field: () => {},   // handled by the input listener

  // ── hit points ──
  // Damage and healing without opening anything, because they are what happens to this sheet most
  // and they used to cost a dialog each time. The dialog is still there behind the ⋯ for the rest
  // of it — temporary hit points, a critical, and the maximum — and the rules are the same calls,
  // so the two paths cannot drift apart.
  "hp-quick": el => {
    const input = document.getElementById("hpQuick");
    const n = Number(input?.value) || 0;
    if (!n) return input?.focus();
    // Emptied and focused BEFORE the redraw, not after: renderCentre carries this field's value and
    // its focus across every redraw, so what it finds here is what survives. Clearing afterwards
    // would be undone by the save landing a moment later and redrawing again.
    input.value = "";
    input.focus();
    const cur = ch();
    if (el.dataset.id === "dmg") {
      // The type and the Absolute mark are whatever the chip beside this field says, so the
      // defences apply to the quick path and the dialog identically — one call, one answer.
      const r = rules.applyDamage(cur, n, { type: state.dmgType, absolute: state.dmgAbsolute });
      mutate(s => { s.hp = r.hp; s.tempHp = r.tempHp; });
      const line = rules.mitigationLine(r.mitigation);
      toast(`${line ? `${line} ` : ""}${r.absorbed ? `${r.absorbed} absorbed — ` : ""}${
        r.dealt} damage. Concentration DC ${r.concentrationDC}.`);
      // A Wound is never applied for you: at most one lands per turn however many triggers fired,
      // and the DM may rule otherwise. The prompt is the same one the dialog shows.
      if (r.woundTriggers.length) dialog("Wound trigger", woundPrompt(r.woundTriggers));
    } else {
      const r = rules.applyHealing(cur, n);
      mutate(s => { s.hp = r.hp; if (r.revived) clearDeathSaves(s); });
      toast(r.healed
        ? `Healed ${r.healed}.${r.revived ? " Up, and the death saves are cleared." : ""}`
        : "Already at full hit points.");
    }
  },
  hp: el => {
    const c = ch(), max = rules.maxHp(c);
    // The same defended types the chip offers, and for the same reason: a type this character has
    // nothing against changes no number here either. The row is absent when there are none.
    const defended = rules.defenceTypes(c);
    const typeRow = defended.length ? `<div class="tgls">
        <select class="txt sm" id="hpType" aria-label="What kind of damage">
          <option value="">Untyped</option>
          ${defended.map(t => `<option value="${t.id}" ${state.dmgType === t.id ? "selected" : ""}>${
            esc(t.name)} — ${esc(t.cancelled ? "cancelled out"
              : rules.STANDING_BY_ID[t.standing].name.toLowerCase())}${
            t.rounds == null ? "" : `, ${t.rounds}r`}</option>`).join("")}
        </select>
        ${toggleHtml(`id="hpAbs"`, !!state.dmgAbsolute, "crit", "It arrives Absolute — a seal from Rank IV")}
        <span class="hint">your defences are applied as it lands</span>
      </div>` : "";
    dialog("Hit points", `<div class="hpdlg">
        <div class="stats">
          <div class="stat"><b>${c.hp}</b><i>now</i></div>
          <div class="stat"><b>${max}</b><i>maximum</i></div>
          <div class="stat"><b>${c.tempHp}</b><i>temporary</i></div>
        </div>
        <form class="hpform" id="hpf">
          <input class="txt" id="hpN" type="number" min="0" max="999" value="" placeholder="How much" autocomplete="off">
          <div class="hpbtns">
            <button class="btn warn" value="dmg">Damage</button>
            <button class="btn" value="heal">Heal</button>
            <button class="btn" value="temp">Temp HP</button>
          </div>
          <div class="tgls">${toggleHtml(`id="hpCrit"`, false, "crit", "It was a critical hit")}
            <span class="hint">a critical hit, which is its own Wound trigger</span></div>
          ${typeRow}
        </form>
        <div id="hpOut"></div>
      </div>`, {
      footer: `<button class="btn sm" id="hpMax">Set maximum</button>
        <span class="sp"></span><button class="btn sm" data-act="dlg-close">Done</button>`,
    });

    const out = document.getElementById("hpOut");
    document.getElementById("hpN").focus();
    document.getElementById("hpf").onsubmit = ev => ev.preventDefault();
    document.querySelectorAll(".hpbtns .btn").forEach(b => b.onclick = ev => {
      ev.preventDefault();
      const n = Number(document.getElementById("hpN").value) || 0;
      if (!n) return;
      const critBtn = document.getElementById("hpCrit");
      const crit = critBtn.classList.contains("on");
      const cur = ch();
      if (b.value === "dmg") {
        // The dialog's own picker is also the session's: choosing Infernal here leaves the chip
        // beside the damage field saying Infernal, because it is the same incoming blow.
        const typeEl = document.getElementById("hpType");
        const absEl = document.getElementById("hpAbs");
        if (typeEl) state.dmgType = typeEl.value;
        if (absEl) state.dmgAbsolute = absEl.classList.contains("on");
        const r = rules.applyDamage(cur, n, { critical: crit,
          type: state.dmgType, absolute: state.dmgAbsolute });
        mutate(s => { s.hp = r.hp; s.tempHp = r.tempHp; });
        const line = rules.mitigationLine(r.mitigation);
        out.innerHTML = `${line ? `<p class="prose">${esc(line)}</p>` : ""}
          <p class="hint">${r.absorbed ? `${r.absorbed} absorbed by temporary hit points. ` : ""}
          Concentration DC <b>${r.concentrationDC}</b> if you were holding something.</p>
          ${r.woundTriggers.length ? woundPrompt(r.woundTriggers) : ""}`;
      } else if (b.value === "heal") {
        const r = rules.applyHealing(cur, n);
        mutate(s => { s.hp = r.hp; if (r.revived) clearDeathSaves(s); });
        out.innerHTML = `<p class="hint">Healed ${r.healed}.${r.revived
          ? " You are above zero again, so the death saves are cleared." : ""}</p>`;
      } else {
        const r = rules.applyTempHp(cur, n);
        mutate(s => { s.tempHp = r.tempHp; });
        out.innerHTML = `<p class="hint">${r.replaced ? "Temporary hit points set." : "You already had more — temporary hit points do not stack."}</p>`;
      }
      document.getElementById("hpN").value = "";
      critBtn.classList.remove("on");
      critBtn.setAttribute("aria-pressed", "false");
    });
    // Both flags in this dialog are plain lit squares with an id rather than a data-act, so they
    // toggle here instead of through the dispatcher — one handler for the two of them.
    for (const id of ["hpCrit", "hpAbs"]) {
      const b = document.getElementById(id);
      if (!b) continue;
      b.onclick = e => {
        e.preventDefault();
        const on = !b.classList.contains("on");
        b.classList.toggle("on", on);
        b.setAttribute("aria-pressed", String(on));
      };
    }
    document.getElementById("hpMax").onclick = () => {
      const v = Number(prompt("Maximum hit points", String(ch().maxHp)) || 0);
      if (v > 0) mutate(s => { s.maxHp = v; s.hp = Math.min(s.hp, v); });
    };
  },

  // A Wound is never applied automatically: the triggers are raised and the table decides, because
  // only one Wound lands per turn however many fired, and the DM may rule otherwise.
  "wound-take": () => {
    mutate(s => { s.wounds = (Number(s.wounds) || 0) + 1; });
    toast("One Wound recorded. Six of them calls for an Injury.");
  },

  "hit-dice": el => hitDicePop(el),

  "death-saves": el => {
    const c = ch(), unhealed = c.injuries.filter(i => i && !i.healed).length;
    const dc = rules.deathSaveDC(c.wounds, unhealed);
    popAt(el, `<div class="pop-h"><b>Death saves</b><span class="tag">DC ${dc}</span></div>
      <div class="pop-b">
        <p class="hint">10, plus one for each of your ${c.wounds} Wound${c.wounds === 1 ? "" : "s"}
          and ${unhealed} unhealed Injur${unhealed === 1 ? "y" : "ies"}.</p>
        <div class="dsrow"><i>Successes</i><span class="step">
          <button data-act="ds" data-k="deathSaveSuccesses" data-d="-1">–</button>
          <span>${c.deathSaveSuccesses}/3</span>
          <button data-act="ds" data-k="deathSaveSuccesses" data-d="1">+</button></span></div>
        <div class="dsrow"><i>Failures</i><span class="step">
          <button data-act="ds" data-k="deathSaveFailures" data-d="-1">–</button>
          <span>${c.deathSaveFailures}/3</span>
          <button data-act="ds" data-k="deathSaveFailures" data-d="1">+</button></span></div>
      </div>
      <div class="pop-f"><button class="btn sm pri" data-act="roll-death">Roll · DC ${dc}</button>
        <button class="btn sm" data-act="ds-clear">Clear</button></div>`, { pin: true, key: "ds" });
  },
  ds: el => bump(el.dataset.k, +el.dataset.d, 0, 3),
  // The pips on the vitals panel: click the third and you have three, click it again and you have
  // two. A rating, not a counter — at a table you mark a save and occasionally unmark a misclick,
  // and both should be one press.
  "ds-set": el => {
    const k = el.dataset.k, i = Number(el.dataset.i) || 0;
    mutate(s => { s[k] = (Number(s[k]) || 0) === i ? i - 1 : i; });
  },
  "ds-clear": () => mutate(s => clearDeathSaves(s)),
  "roll-death": () => {
    closePop(true);
    const c = ch(), unhealed = c.injuries.filter(i => i && !i.healed).length;
    showRoll(`Death save · DC ${rules.deathSaveDC(c.wounds, unhealed)}`, 0, []);
  },

  conc: el => {
    const c = ch(), unhealed = c.injuries.filter(i => i && !i.healed).length;
    askNumber(el, { title: "Concentration", value: 0, min: 0, max: 500,
      hint: `Damage taken from one source. The DC is half of it or 10, whichever is more, plus ${c.wounds + unhealed} for your Wounds and Injuries.`,
      onSet: v => {
        const dc = rules.concentrationDC(v, c.wounds, unhealed);
        showRoll(`Concentration · DC ${dc}`, rules.saveTotal(c, "con"),
          [{ reason: "Constitution save", amount: rules.saveTotal(c, "con") }],
          { scopes: rules.ADVANTAGE_SCOPES.save("con") });
      } });
  },
  "conc-drop": () => mutate(s => { s.concentrating = ""; }),

  // ── attacks ──
  "atk-add": () => attackDialog(null),
  "atk-edit": el => attackDialog(Number(el.dataset.id)),
  "atk-alt": el => rollDamage(rules.attackAtLevel(ch(), ch().attacks[+el.dataset.id]), false, true),
  "atk-del": el => mutate(s => { s.attacks.splice(+el.dataset.id, 1); }),
  "atk-roll": el => {
    const c = ch();
    // Resolved to the level first, because a stepped weapon's bonus may move with its dice.
    const a = rules.attackAtLevel(c, c.attacks[+el.dataset.id]);
    // The engine owns the arithmetic now (CS-021). It hands back the total AND every term by
    // name, so the breakdown under the die is the same list the row's tooltip shows — the player
    // reads one account of where a +11 came from, not two that could drift apart.
    const hit = rules.attackBonus(c, a);
    showRoll(`${a.name || "Attack"} — to hit`, hit.total, breakdownFor(hit.parts),
      // A widened critical range belongs to the character, not the die (CS-097). A spell attack
      // answers to the advantage somebody's seal put on spell attacks as well as on attacks.
      { critOn: rules.critRange(c),
        scopes: a.spell ? rules.ADVANTAGE_SCOPES.spellAttack() : rules.ADVANTAGE_SCOPES.attack() });
  },
  "atk-dmg": el => rollDamage(rules.attackAtLevel(ch(), ch().attacks[+el.dataset.id]), false),
  "atk-crit": el => rollDamage(rules.attackAtLevel(ch(), ch().attacks[+el.dataset.id]), true),

  // ── action economy ──
  // Clicking the nth pip means "I have spent n+1 of these", and clicking a spent one hands it back
  // — the same idiom as the spell slots, so one gesture works in both places.
  econ: el => {
    const k = el.dataset.id, i = +el.dataset.i;
    mutate(s => {
      s.used = { ...(s.used || {}) };
      const now = rules.turnUsed(s, k);
      s.used[k] = i < now ? i : i + 1;
    });
  },
  "new-turn": () => mutate(s => { s.used = {}; }),
  "grant-add": () => grantDialog(),
  "grant-del": el => mutate(s => {
    s.grants = (s.grants || []).filter(g => g.id !== el.dataset.id);
  }),

  // ── conditions ──
  "cond-add": el => {
    popAt(el, `<div class="pop-h"><b>Add a condition</b></div>
      <div class="pop-b list">${Object.values(rules.CONDITIONS).map(c => `
        <button class="listrow" data-act="cond-set" data-id="${esc(c.id)}">
          <b>${esc(c.name)}</b><span>campaign</span></button>`).join("")}
        <button class="listrow" data-act="cond-custom"><b>Something else…</b></button></div>
      <p class="hint">Only the conditions this campaign rewrote are listed. The standard ones work as
        written, so they do not need a special entry.</p>`, { pin: true, key: "cond" });
  },
  "cond-set": el => {
    closePop(true);
    const c = rules.CONDITIONS[el.dataset.id];
    mutate(s => { s.conditions = [...(s.conditions || []), { id: c.id, name: c.name }]; });
  },
  "cond-custom": () => {
    closePop(true);
    const name = prompt("Condition");
    if (name) mutate(s => { s.conditions = [...(s.conditions || []), { id: `x:${uid()}`, name: name.slice(0, 40) }]; });
  },
  "cond-del": el => mutate(s => { s.conditions.splice(+el.dataset.id, 1); }),

  // ── defences, and what is coming in ──
  // What kind of damage is arriving is session state, not the character's: it is a fact about the
  // dragon, not about you. It sticks between hits because a dragon tends to breathe twice.
  "dmg-type": el => incomingPop(el),
  "dmg-pick": el => {
    state.dmgType = el.dataset.id;
    closePop(true);
    renderAll();
  },
  "dmg-absolute": () => {
    state.dmgAbsolute = !state.dmgAbsolute;
    renderAll();
    // Reopened on the chip, because the toggle changes what every row in that list is worth and the
    // reader is mid-decision — closing it would make them find it again to see the new numbers.
    // Closed first: opening a pinned pop with the same key is how popAt TOGGLES it shut, so without
    // this the mark went on and the list vanished.
    closePop(true);
    const chip = document.querySelector('[data-act="dmg-type"]');
    if (chip) incomingPop(chip);
  },
  "dmg-untype": () => { state.dmgType = ""; renderAll(); },

  "def-add": () => defenceDialog(""),
  "def-open": el => defenceDialog(el.dataset.id),
  // A defence the gear grants is not edited here — it is a fact about the item, so the chip opens
  // the ITEM instead. Taking the armour off is how you remove it, which is the behaviour the whole
  // of CS-104 is for.
  "def-item": el => itemDialog(el.dataset.id),
  "def-del": el => {
    closeDialog();
    const id = el.dataset.id;
    const row = rules.defenceRecords(ch()).find(r => r.id === id);
    mutate(s => { s.defences = rules.ownDefenceRecords(s).filter(r => r.id !== id); });
    // The chip beside the damage field may now point at a type nothing answers for.
    if (row && state.dmgType === row.type && !rules.defence(ch(), row.type)) state.dmgType = "";
    toast(`${row ? rules.DAMAGE_BY_ID[row.type].name : "That"} — defence removed.`);
  },

  "sense-add": () => senseDialog(-1),
  "sense-open": el => senseDialog(+el.dataset.id),
  "sense-del": el => {
    closeDialog();
    mutate(s => { s.senses = (s.senses || []).filter((_, i) => i !== +el.dataset.id); });
  },
  "cog-sense": el => {
    const c = ch();
    popAt(el, `<div class="pop-h"><b>Cognitive Sense</b><span class="tag">×${rules.cognitiveSenseUses(c)}</span></div>
      <div class="pop-b"><p class="hint">Derived from your Dream score rather than recorded here:
        <b>Dream ${rules.abilityScore(c, "dream")}</b> grants
        ${rules.cognitiveSenseUses(c)} use${rules.cognitiveSenseUses(c) === 1 ? "" : "s"}, and
        Dream 18 is where the second one arrives.</p></div>`, { pin: true, key: "cogsense" });
  },

  // ── Inspiration: a die someone handed you ──
  insp: el => inspirationPop(el.dataset.id),
  "insp-add": el => {
    const die = el.dataset.id;
    const dur = document.getElementById("inspDur")?.value ?? "";
    const why = (document.getElementById("inspWhy")?.value || "").trim();
    const row = { id: uid(), die, why, rounds: dur ? Number(dur) : null, active: true };
    mutate(s => { s.inspiration = [...(s.inspiration || []), row]; });
    toast(`${die}${why ? ` — ${why}` : ""} · ${row.rounds == null ? "until used" : `${row.rounds} rounds`}`);
    // Reopened on the same die — the redraw replaced the button this was anchored to — so taking
    // two in a row is two clicks rather than two journeys.
    inspirationPop(die, { reopen: true });
  },
  "insp-spend": el => {
    const die = el.dataset.id;
    const one = el.dataset.k
      ? rules.inspirationHeld(ch()).find(d => d.id === el.dataset.k)
      : rules.inspirationNext(ch(), die);
    if (!one) return toast(`No ${die} to spend.`);
    const r = rollDice(`1${one.die}`);
    mutate(s => { s.inspiration = (s.inspiration || []).filter(d => d.id !== one.id); });
    toast(`${one.die}${one.why ? ` — ${one.why}` : ""} → ${r.total}`);
    inspirationPop(one.die, { reopen: true, rolled: { die: one.die, total: r.total, why: one.why } });
  },
  "insp-open": el => {
    const d = rules.inspirationHeld(ch()).find(x => x.id === el.dataset.id);
    if (!d) return;
    popAt(el, `<div class="pop-h"><b>${esc(d.die)}</b>
        ${d.rounds == null ? `<span class="tag">until used</span>` : `<span class="tag k">${d.rounds} round${d.rounds === 1 ? "" : "s"} left</span>`}</div>
      <div class="pop-b">${d.why ? `<p class="prose">${esc(d.why)}</p>`
        : `<p class="hint">No source recorded.</p>`}</div>
      <div class="pop-f">
        <button class="btn sm pri" data-act="insp-spend" data-id="${esc(d.die)}" data-k="${esc(d.id)}">Spend it</button>
        ${d.rounds == null ? "" : `<button class="btn sm" data-act="insp-extend" data-id="${esc(d.id)}">+1 round</button>`}
        <button class="btn sm warn" data-act="insp-del" data-id="${esc(d.id)}">Give it back</button></div>`,
      { pin: true, key: `insp:${d.id}` });
  },
  "insp-extend": el => mutate(s => {
    const d = (s.inspiration || []).find(x => x.id === el.dataset.id);
    if (d && d.rounds != null) d.rounds += 1;
  }),
  "insp-del": el => {
    closePop(true);
    mutate(s => { s.inspiration = (s.inspiration || []).filter(d => d.id !== el.dataset.id); });
  },

  // ── spell slots ──
  slot: el => {
    const l = el.dataset.id, i = +el.dataset.i;
    mutate(s => {
      s.spells = { ...(s.spells || {}) };
      s.spells.slots = { ...(s.spells.slots || {}) };
      const row = { ...(s.spells.slots[l] || { max: 0, used: 0 }) };
      row.used = i < row.used ? i : i + 1;
      s.spells.slots[l] = row;
    });
  },
  "slots-edit": () => {
    const slots = ch().spells?.slots || {};
    const reset = String(ch().spells?.slotsReset || "l").toLowerCase() === "s" ? "s" : "l";
    dialog("Spell slots", `<div class="fields grid3">${Array.from({ length: 9 }, (_, i) => i + 1).map(l => `
      <label>Level ${l}<input class="txt" type="number" min="0" max="9" id="sl${l}" value="${slots[l]?.max || 0}"></label>`).join("")}</div>
      <label class="ck-col">When they come back<select class="txt" id="slReset">
          <option value="l" ${reset === "l" ? "selected" : ""}>On a long rest</option>
          <option value="s" ${reset === "s" ? "selected" : ""}>On a short rest — Pact Magic</option>
        </select></label>
      <p class="hint">How many you have at each level. Taking a casting class fills both of these in;
        set them here for a pool the catalogue does not describe. A second independent pool is still
        a feature with uses rather than a second row here.</p>`, {
      footer: `<button class="btn sm pri" id="slOk">Save</button>`,
    });
    document.getElementById("slOk").onclick = () => {
      const next = {};
      for (let l = 1; l <= 9; l++) {
        const max = Number(document.getElementById(`sl${l}`).value) || 0;
        if (max) next[l] = { max, used: Math.min(slots[l]?.used || 0, max) };
      }
      const slotsReset = document.getElementById("slReset").value === "s" ? "s" : "l";
      closeDialog();
      mutate(s => { s.spells = { ...(s.spells || {}), slots: next, slotsReset }; });
    };
  },

  // ── the spellbook ──
  "spell-open": el => spellDialog(el.dataset.id),
  "spell-del": el => mutate(s => {
    s.spells = { ...(s.spells || {}) };
    s.spells.book = (s.spells.book || []).filter(x => x.id !== el.dataset.id);
  }),
  // The chip on the left. Preparing and unpreparing is the gesture people make twenty times a day,
  // so it is one click; the two standings that are not a daily decision open the full list instead.
  "spell-stand": (el, e) => {
    const s = (ch().spells?.book || []).find(x => x.id === el.dataset.id);
    if (!s) return;
    const standing = rules.spellStanding(s);
    if (standing === "known" || standing === "prepared")
      return setStanding(s.id, standing === "known" ? "prepared" : "known");
    e.stopPropagation();
    popAt(el, `<div class="pop-h"><b>${esc(s.name)}</b></div>
      <div class="pop-b list">${rules.SPELL_STANDINGS.map(st => `
        <button class="listrow ${st.id === standing ? "on" : ""}" data-act="spell-set" data-id="${esc(s.id)}" data-k="${st.id}">
          <b>${esc(st.label)}</b><span>${esc(st.hint)}</span></button>`).join("")}</div>`,
      { pin: true, key: `spl:${s.id}` });
  },
  "spell-set": el => { closePop(true); setStanding(el.dataset.id, el.dataset.k); },

  // A new day: everything prepared goes back to known, and nothing else moves. Always-prepared and
  // granted spells are untouched because neither is a choice made in the morning, and cantrips are
  // not a choice at all.
  "spell-clear": () => {
    const n = rules.spellbook(ch()).counts.ready;
    if (!n) return toast("Nothing is prepared.");
    dialog("A new day", `<p>${n} prepared spell${n === 1 ? "" : "s"} go${n === 1 ? "es" : ""} back to
        <b>known</b>, ready to be prepared again. Always-prepared and granted spells stay as they are.</p>`, {
      footer: `<button class="btn pri" id="spDay">Clear what is prepared</button>
        <span class="sp"></span><button class="btn sm" data-act="dlg-close">Keep it</button>`,
    });
    document.getElementById("spDay").onclick = () => {
      closeDialog();
      mutate(s => {
        s.spells = { ...(s.spells || {}) };
        s.spells.book = (s.spells.book || []).map(x =>
          rules.spellStanding(x) === "prepared" ? { ...x, standing: "known" } : x);
      });
      toast(`${n} spell${n === 1 ? "" : "s"} back to known.`);
    };
  },

  // ── the campaign tracks ──
  wounds: el => bump("wounds", +el.dataset.d, 0, 20),
  exh: el => bump("exhaustion", +el.dataset.d, 0, 6),
  dexh: el => bump("dreamExhaustion", +el.dataset.d, 0, rules.DREAM_EXHAUSTION_MAX),
  de: el => mutate(s => { s.dreamExhaustion = Math.min(rules.DREAM_EXHAUSTION_MAX, +el.dataset.id || 0); }),

  "injury-add": () => {
    const name = prompt("Which Injury? (the table and its healing rule are in the campaign notes)");
    if (!name) return;
    mutate(s => {
      s.injuries = [...(s.injuries || []), { id: uid(), name: name.slice(0, 60), healed: false }];
      // At six Wounds an Injury resets them to the number of active injuries, capped at five.
      s.wounds = rules.woundsAfterInjury(s.injuries.filter(i => !i.healed).length);
    });
    toast("Injury recorded, and your Wounds reset to the number of active Injuries.");
  },
  injury: el => {
    const i = +el.dataset.id, inj = ch().injuries[i];
    popAt(el, `<div class="pop-h"><b>${esc(inj.name)}</b><span class="tag">${inj.healed ? "healed" : "unhealed"}</span></div>
      <div class="pop-b"><p class="hint">An unhealed Injury adds +1 to your death save and concentration DCs.
        Each Injury heals by its own rule — clearing your Wounds does not clear it.</p></div>
      <div class="pop-f"><button class="btn sm" data-act="injury-heal" data-id="${i}">${inj.healed ? "Mark unhealed" : "Mark healed"}</button>
        <button class="btn sm warn" data-act="injury-del" data-id="${i}">Remove</button></div>`,
      { pin: true, key: `inj:${i}` });
  },
  "injury-heal": el => { closePop(true); mutate(s => { const i = s.injuries[+el.dataset.id]; i.healed = !i.healed; }); },
  "injury-del": el => { closePop(true); mutate(s => { s.injuries.splice(+el.dataset.id, 1); }); },

  // ── Honor and Morality allocations ──
  "allocate-open": el => {
    const c = state.current;
    popAt(el, `<div class="pop-h"><b>Allocate</b></div>
      <div class="pop-b list">
        ${c.unspent?.honor ? `<div class="pop-grp">Honor · ${c.unspent.honor} to spend</div>
          <button class="listrow" data-act="allocate" data-id="order"><b>Order</b><span>${c.honor.order} → ${c.honor.order + 1}</span></button>
          <button class="listrow" data-act="allocate" data-id="chaos"><b>Chaos</b><span>${c.honor.chaos} → ${c.honor.chaos + 1}</span></button>` : ""}
        ${c.unspent?.morality ? `<div class="pop-grp">Morality · ${c.unspent.morality} to spend</div>
          <button class="listrow" data-act="allocate" data-id="good"><b>Good</b><span>${c.morality.good} → ${c.morality.good + 1}</span></button>
          <button class="listrow" data-act="allocate" data-id="evil"><b>Evil</b><span>${c.morality.evil} → ${c.morality.evil + 1}</span></button>` : ""}
      </div>
      <p class="hint">Each level your DM grants gives you one of each. Once spent, it is spent.</p>`,
      { pin: true, key: "alloc" });
  },
  allocate: el => {
    closePop(true);
    store.allocate(el.dataset.id).then(() => toast("Allocated.")).catch(err => toast(err.message));
  },

  // ── Fate ──
  emphasis: () => emphasisDialog(),

  // ── rests ──
  rest: el => restDialog(el.dataset.id),

  // ── rounds and effects ──
  "next-round": () => {
    const c = ch();
    // Modifiers and temporary actions run on the same clock, so one confirmed round moves both.
    const mods = rules.tickTimed(c.modifiers, c.round);
    const acts = rules.tickTimed(c.actions, c.round);
    const gr = rules.tickTimed(c.grants, c.round);
    // A die of Inspiration and a borrowed resistance keep the same clock, which is the reason they
    // are the same shape as a modifier: "it lasts three rounds" means one thing on this sheet, in
    // one place. Defences are read through the engine first, so a sheet still holding the old
    // keyed-by-type map ticks correctly and is written back as a list.
    const insp = rules.tickTimed(c.inspiration, c.round);
    // The character's OWN records only: an item's defence has no fuse to tick and must never be
    // written onto the sheet, or it would outlive the armour that granted it.
    const defs = rules.tickTimed(rules.ownDefenceRecords(c), c.round);
    mutate(s => {
      s.modifiers = mods.list; s.actions = acts.list; s.grants = gr.list;
      // An expired defence is gone rather than kept as history: what a character WAS resistant to
      // for two rounds is not a thing anyone reads back, and the card is a list of what is true.
      s.defences = defs.list.filter(r => r && r.active !== false);
      // An expired die is gone rather than kept as history: a d6 that ran out is not a record
      // anyone reads, and the pool is counted by what is in it.
      s.inspiration = insp.list.filter(d => d && d.active !== false);
      s.round = c.round + 1; s.inCombat = true; s.used = {};
    });
    const ended = [...mods.ended.map(m => m.reason), ...acts.ended.map(a => a.name),
      ...gr.ended.map(g => g.why || `extra ${g.kind}`),
      ...insp.ended.map(d => `${d.die}${d.why ? ` (${d.why})` : ""}`),
      ...defs.ended.map(r => `${rules.DAMAGE_BY_ID[r.type]?.name || r.type} ${r.standing}${
        r.why ? ` (${r.why})` : ""}`)];
    if (ended.length) toast(`Ended: ${ended.join(", ")}`);
  },
  "end-combat": () => mutate(s => {
    s.round = 1; s.inCombat = false; s.used = {};
    // Timed things end with the fight; permanent ones and the history stay.
    const drop = x => x.rounds == null ? x : { ...x, active: false, rounds: 0 };
    s.modifiers = (s.modifiers || []).map(drop);
    s.actions = (s.actions || []).map(drop);
    s.grants = (s.grants || []).map(drop);
    // A die that was good for a few rounds ends with the fight; one held "until used" is still
    // yours afterwards, because nothing about the fight ending spends it. A borrowed resistance
    // goes the same way, while what you simply ARE resistant to stays.
    s.inspiration = (s.inspiration || []).filter(d => d && d.rounds == null);
    s.defences = rules.ownDefenceRecords(s).filter(r => r.rounds == null);
  }),
  "mod-add": () => modifierDialog(),
  "mod-del": el => mutate(s => {
    s.modifiers = s.modifiers.map(m => m.id === el.dataset.id ? { ...m, active: false } : m);
  }),

  // ── what another player's seal is doing to you ──
  // None of these touch the sheet: the rows are the server's, and a × here asks it to end one.
  // That is the whole reason a grant cannot collide with an autosave.
  //
  // There is no CAST here on purpose. A Supportive seal is cast from the Arcanum builder's seal
  // card, where the seal is — the sheet's business is what has landed on you, and what you still
  // have out on other people.
  "effect-end": el => store.endEffect(Number(el.dataset.id))
    .then(() => toast("Dropped."))
    .catch(err => toast(err.message)),

  // Taking a heal or temporary hit points that somebody's seal offered. The dice are rolled HERE,
  // in front of the player, and the result is written to their own sheet by their own client —
  // which is both why it cannot collide with anything and why the table gets to see the roll.
  "effect-apply": el => applyOffer(Number(el.dataset.id)),
  "conc-end": el => store.endConcentration(el.dataset.id)
    .then(r => toast(`Ended — ${r?.ended || 0} effect${r?.ended === 1 ? "" : "s"} gone.`))
    .catch(err => toast(err.message)),

  // ── the Verum DC, spelled out ──
  verum: el => {
    const c = ch();
    popAt(el, `<div class="pop-h"><b>Verum DC ${rules.verumDC(c)}</b></div>
      <div class="pop-b"><ul class="why">
        <li><span>Base</span><b>8</b></li>
        <li><span>Proficiency bonus</span><b>${sign(rules.proficiencyBonus(c.level))}</b></li>
        <li><span>Highest non-Dream modifier</span><b>${sign(rules.verumModifier(c))}</b></li>
        <li><span>Dream modifier</span><b>${sign(rules.abilityModifier(c, "dream"))}</b></li>
        ${rules.contributions(rules.activeModifiers(c), "saveDc").map(m =>
          `<li><span>${esc(m.reason)}</span><b>${sign(m.amount)}</b></li>`).join("")}
      </ul>
      <p class="hint">Your seal attack bonus is <b>${sign(rules.sealAttackBonus(c))}</b>, and you may
        draw <b>${rules.sealUses(c)}</b> seals per long rest — each one also costs a spell slot.</p></div>`,
      { pin: true, key: "verum" });
  },

  // ── the critical range, spelled out ──
  // There is nothing to EDIT here, which is the point: a sheet does not own a critical range the
  // way it owns an AC, it starts at 20 and only something granted moves it. So this lists what is
  // moving it and offers the one way to add another — a real effect, with a reason and a duration,
  // which is what makes "18–20 for a minute" end on its own.
  crit: el => {
    const c = ch(), n = rules.critRange(c), on = rules.contributions(rules.activeModifiers(c), "crit");
    popAt(el, `<div class="pop-h"><b>Critical range</b><span class="tag">${rules.critRangeSays(c)}</span></div>
      <div class="pop-b"><ul class="why">
        <li><span>Every sheet starts at</span><b>20</b></li>
        ${/* The amounts are written against that 20, so the column adds up on the page: a crit
              effect of +2 is "wider by two", which is the threshold falling by two. */""}
        ${on.map(m => `<li><span>${esc(m.reason)}${m.permanent ? "" : " — while it lasts"}</span>
          <b>${sign(-m.amount)}</b></li>`).join("")}
      </ul>
      <p class="hint">${n >= 20
        ? "Only a natural 20 crits. Anything that widens the window — an item, a Cognition, a minute of Spiral Fang — adds to it here."
        : `A natural <b>${n}</b> or more is a critical hit: ${20 - n} wider than a bare 20.`}
        ${n <= rules.CRIT_FLOOR ? ` It will go no lower than ${rules.CRIT_FLOOR}.` : ""}</p></div>
      <div class="pop-f"><button class="btn sm" data-act="mod-add">Add an effect</button></div>`,
      { pin: true, key: "crit" });
  },

  // ── actions: things you can DO, permanent or for a few rounds ──
  "action-add": () => actionDialog(),
  "action-open": el => {
    const a = (ch().actions || []).find(x => x.id === el.dataset.id);
    if (!a) return;
    popAt(el, `<div class="pop-h"><b>${esc(a.name)}</b>
        ${a.cost ? `<span class="tag">${esc(ACTION_COST[a.cost] || a.cost)}</span>` : ""}
        ${a.rounds == null ? `<span class="tag">permanent</span>` : `<span class="tag k">${a.rounds} rounds left</span>`}</div>
      <div class="pop-b">${a.text ? `<p class="prose">${esc(a.text)}</p>` : `<p class="hint">No description.</p>`}</div>
      <div class="pop-f">
        ${a.rounds == null ? "" : `<button class="btn sm" data-act="action-extend" data-id="${esc(a.id)}">+1 round</button>`}
        <button class="btn sm warn" data-act="action-del" data-id="${esc(a.id)}">Remove</button></div>`,
      { pin: true, key: `act:${a.id}` });
  },
  // An item's feature read from the Combat tab, where it has no body to unfold — `feat-open` only
  // toggles one open on the Character tab, so clicking a gear row there would do nothing at all.
  // Same popover as an action, because on this card it IS one.
  "gear-open": el => {
    const c = ch(), f = (c.features || [])[+el.dataset.id];
    if (!f) return;
    const cost = rules.featureCost(f), pool = rules.featureUses(c, f);
    popAt(el, `<div class="pop-h"><b>${esc(f.name)}</b>
        ${cost && cost !== "passive" ? `<span class="tag">${esc(ACTION_COST[cost] || cost)}</span>` : ""}
        ${f.dc ? `<span class="tag dc">DC ${f.dc}</span>` : ""}</div>
      <div class="pop-b">
        ${f.text ? `<p class="prose">${esc(f.text)}</p>` : `<p class="hint">No description.</p>`}
        ${pool ? `<p class="hint">${pool - (f.used || 0)} of ${pool} left — ${esc(rules.featureResetSays(f))}</p>` : ""}
      </div>
      <p class="hint" style="padding:0 11px 9px">It came with an item, so it lives under
        <b>Items</b> on the Character tab. Taking the item off does not remove it — re-read the
        note, or delete it there.</p>`,
      { pin: true, key: `gear:${f.id || el.dataset.id}` });
  },
  "action-extend": el => mutate(s => {
    const a = s.actions.find(x => x.id === el.dataset.id);
    if (a && a.rounds != null) a.rounds += 1;
  }),
  "action-del": el => {
    closePop(true);
    mutate(s => { s.actions = (s.actions || []).filter(a => a.id !== el.dataset.id); });
  },

  // ── equipment ──
  "slot-edit": el => itemDialog(`slot:${el.dataset.id}`),
  "item-edit": el => itemDialog(el.dataset.id),

  // One click spends one charge, wherever the item is sitting. Mid-session that is the whole
  // interaction, and making it a dialog would mean opening one every time somebody waves a wand.
  "item-use": el => {
    const found = rules.findItem(ch(), el.dataset.id);
    if (!found) return;
    const charges = rules.spendCharges(found.item, 1);
    if (!charges) return toast(`${found.item.name} has no charges left.`);
    writeItem(el.dataset.id, it => ({ ...it, charges }));
    const left = rules.itemCharges({ ...found.item, charges }).left;
    toast(`${found.item.name} — ${left} charge${left === 1 ? "" : "s"} left.`);
  },

  "item-equip": el => {
    const where = el.dataset.id;
    const found = rules.findItem(ch(), where);
    if (!found) return;
    popAt(el, `<div class="pop-h"><b>Wear ${esc(found.item.name)}</b></div>
      <div class="pop-b list">${rules.slotsFor(ch()).map(s => {
        const taken = (ch().equipment || {})[s.id];
        return `<button class="listrow" data-act="item-to-slot" data-id="${esc(where)}" data-k="${s.id}">
          <b>${esc(s.name)}</b><span>${taken?.name ? `${esc(taken.name)} comes off` : "empty"}</span></button>`;
      }).join("")}</div>
      <p class="hint">Whatever is in the slot goes back to your pack. An item only grants its
        effects from a slot.</p>`, { pin: true, key: "equip" });
  },
  "item-to-slot": el => { closePop(true); equipItem(el.dataset.id, el.dataset.k); },
  "item-unequip": el => { unequipItem(el.dataset.id); },

  coin: el => mutate(s => {
    s.coins = { ...(s.coins || {}) };
    s.coins[el.dataset.id] = Math.max(0, Number(el.value) || 0);
  }),
  // Arming a conditional effect (CS-092). One click, from the Gear tab, because the condition it
  // waits on is a thing that changes mid-session — the sun comes up, the shield goes down — and
  // anything that needs a dialog will not get used at a table.
  "fx-when": el => {
    const where = el.dataset.id, i = Number(el.dataset.i);
    const found = rules.findItem(ch(), where);
    const e = found && (found.item.effects || [])[i];
    if (!e) return;
    const on = !e.on;
    writeItem(where, it => {
      const fx = [...(it.effects || [])];
      fx[i] = { ...fx[i], on };
      if (!on) delete fx[i].on;
      return { ...it, effects: fx };
    });
    toast(on
      ? `${e.when} — ${sign(rules.modifierAmount(ch(), e))} ${targetLabel(e.target)} is counting.`
      : `${e.when} — off.`);
  },

  "slot-flag": el => mutate(s => {
    const it = (s.equipment || {})[el.dataset.id];
    if (it) it[el.dataset.k] = !it[el.dataset.k];
  }),
  // The dream axis has three values, so its pip cycles rather than toggling: of Ephemer →
  // Dreamlike → Lucidlike → round again. The toast names what it landed on, because the three
  // cost different slots and "I clicked the moon once" is not an answer at a table.
  "slot-dream": el => {
    const order = rules.ITEM_DREAM.map(d => d.id);
    const current = rules.itemDream((ch().equipment || {})[el.dataset.id]);
    const next = order[(order.indexOf(current) + 1) % order.length];
    mutate(s => {
      const it = (s.equipment || {})[el.dataset.id];
      if (!it) return;
      it.dream = next;
      // Cleared as the axis is set, so nothing carries a stale boolean disagreeing with it.
      delete it.insomniaOnly;
    });
    toast(`${rules.DREAM_BY_ID[next].name} — ${rules.DREAM_BY_ID[next].hint}`);
  },
  anatomy: el => {
    const have = ch().anatomy || [];
    popAt(el, `<div class="pop-h"><b>Body slots</b></div>
      <div class="pop-b list">${rules.WORN_SLOTS.filter(s => s.optional).map(s => `
        <button class="listrow ${have.includes(s.id) ? "on" : ""}" data-act="anatomy-toggle" data-id="${s.id}">
          <b>${esc(s.name)}</b><span>${have.includes(s.id) ? "shown" : "hidden"}</span></button>`).join("")}</div>
      <p class="hint">Most characters have none of these, so they stay off until you say otherwise.</p>`,
      { pin: true, key: "anatomy" });
  },
  "anatomy-toggle": el => mutate(s => {
    const id = el.dataset.id;
    s.anatomy = (s.anatomy || []).includes(id)
      ? s.anatomy.filter(x => x !== id) : [...(s.anatomy || []), id];
  }),
  "carry-add": () => itemDialog("pack:new"),
  "vault-add": () => vaultDialog(),
  "carry-del": el => mutate(s => { s.carried.splice(+el.dataset.id, 1); }),

  // ── portrait and accent ──
  portrait: () => {
    dialog("Portrait", `<div class="pgrid">${PORTRAITS.map(p => `
        <button class="pgrid-b ${ch().portrait === portraitUrl(p.file) ? "on" : ""}"
          data-act="portrait-pick" data-id="${esc(p.file)}" title="${esc(p.name)}"
          style="background-image:url('${esc(portraitUrl(p.file))}')" aria-label="${esc(p.name)}"></button>`).join("")}</div>
      <p class="hint">The party's plates. A new one is a file dropped into
        <code>sheet/img/portraits/</code> plus a line in <code>PORTRAITS</code>
        in <code>sheet/js/view.js</code>.</p>`, { wide: true });
  },
  // Clicking the plate at the head of the sheet opens the painting whole. A plate with no full
  // version opens the crop itself rather than nothing, and an empty frame opens the picker —
  // whatever is there, clicking it does the obvious thing.
  "portrait-art": () => {
    const c = ch();
    if (!c.portrait) return ACTS.portrait();
    const p = portraitOf(c);
    lightbox(p?.art ? fullArtUrl(p.art) : c.portrait, p?.name || state.current?.name || "");
  },
  "portrait-pick": el => { closeDialog(); mutate(s => { s.portrait = portraitUrl(el.dataset.id); }); },
  "portrait-clear": () => mutate(s => { s.portrait = ""; }),
  accent: el => mutate(s => { s.accent = el.dataset.id || ""; }),

  "feat-add": () => {
    dialog("Add a feature", `<form class="fields" id="ft">
        <label>Name<input class="txt" id="ftName" maxlength="80" required></label>
        <label>Source<input class="txt" id="ftSrc" maxlength="40" placeholder="class, feat, item, ancestry"></label>
        <div class="fields grid2">
          <label>Uses<input class="txt" id="ftUses" type="number" min="0" max="99" placeholder="leave empty if unlimited"></label>
          <label>Comes back<select class="txt" id="ftReset">${rules.FEATURE_RESET.map(r =>
            `<option value="${r.id}">${esc(r.name)}</option>`).join("")}</select></label>
        </div>
        <label>…or as many as<select class="txt" id="ftFrom">
          <option value="">— a flat number, above —</option>
          ${rules.DERIVE_FROM.map(s => `<option value="${s.id}">my ${esc(s.name)}</option>`).join("")}
        </select></label>
        <p class="hint">Pick a score here and the pool is worked out every time it is read, so
          "a number of times equal to your proficiency bonus" grows with you instead of going stale
          at the next level. It overrides the number above.</p>
        <label>Its own save DC<input class="txt" id="ftDc" type="number" min="0" max="40"
          placeholder="leave empty unless the feature states one"></label>
        <p class="hint">A DC here is the <b>feature's</b> number, not yours — the 18 an item's own
          blast makes its victims beat. Nothing that raises your spell save DC moves it, which is
          exactly why it needs somewhere of its own to live.</p>
        <label>If it comes back after a set time, say how long<input class="txt" id="ftAfter"
          maxlength="40" placeholder="12 hours, 24 hours, 7 days…"></label>
        <p class="hint">A feature that recharges on a <b>rest</b> comes back with the rest that
          matches it. <b>Each session</b>, <b>once per week</b> and <b>once per Cycle</b> are the
          DM's to hand back — they get their own buttons under the list, because a long rest is not
          a week. <b>Recharge 5–6</b> gets a die beside its pips. And a set time the sheet cannot
          see is at least named, so the tooltip tells the truth instead of saying nothing gives it
          back.</p>
        <label>What it does<textarea class="txt ta" id="ftText" rows="4"></textarea></label>
        <button class="btn pri" type="submit">Add</button></form>`);
    document.getElementById("ft").onsubmit = ev => {
      ev.preventDefault();
      const name = document.getElementById("ftName").value.trim();
      if (!name) return;
      const f = { id: uid(), name,
        source: document.getElementById("ftSrc").value.trim(),
        // A derived pool wins over the typed number, because choosing a score is the more specific
        // statement — the box above is what you fall back to when no score fits.
        uses: document.getElementById("ftFrom").value
          ? { from: document.getElementById("ftFrom").value, times: 1 }
          : Number(document.getElementById("ftUses").value) || 0,
        used: 0,
        reset: document.getElementById("ftReset").value,
        after: document.getElementById("ftAfter").value.trim(),
        dc: Number(document.getElementById("ftDc").value) || 0,
        text: document.getElementById("ftText").value.trim() };
      closeDialog();
      mutate(s => { s.features = [...(s.features || []), f]; });
    };
  },
  // The third axis. The score is a stepper rather than a typed box because it moves one point at a
  // time, by something that just happened at the table; the Nature is asked for once at five and
  // then kept, because the ruleset says it cannot change without a soul-cleansing ritual — the
  // sheet still lets it be changed, since a ritual is a thing that can happen, but it says so.
  corruption: () => {
    const draw = () => {
      const c = ch();
      const score = rules.corruptionScore(c);
      const nature = rules.corruptionNature(c);
      const dlg = dialog("Corruption", `
          <div class="trks">
            <span class="trk"><i title="Soul damage — not Honor, not Morality">Score</i>
              <span class="step"><button data-corr="-1" aria-label="Lower Corruption">–</button>
                <span>${score}<em>/${rules.CORRUPTION_MAX}</em></span>
                <button data-corr="1" aria-label="Raise Corruption">+</button></span></span>
          </div>
          <p class="hint">Corruption save modifier <b>${sign(rules.corruptionSaveBonus(c))}</b>
            — <code>[(Good − Evil) + (Order − Chaos)] ÷ 2</code>, rounded down. Your own score does
            not feed it.</p>

          <div class="zone-h sm"><h4>Nature</h4></div>
          ${score >= rules.CORRUPTION_NATURE_AT || nature ? `
            <div class="list">${rules.CORRUPTION_NATURES.map(n => `
              <button class="listrow ${n.id === nature ? "on" : ""}" type="button" data-nature="${n.id}">
                <b>${n.mark} ${esc(n.name)}</b><span>${esc(n.blurb)}</span></button>`).join("")}</div>
            ${nature ? `<p class="hint">Chosen. It cannot be changed without a complete soul-cleansing
              ritual — pick the other one only if that is what happened.</p>` : ""}`
            : `<p class="hint">Asked at score ${rules.CORRUPTION_NATURE_AT}, when a soul begins
               visibly dissolving toward one of the two. Not yet.</p>`}

          <div class="zone-h sm"><h4>Dominant Vile Emotion</h4></div>
          <input class="txt" id="corrVile" maxlength="40" value="${esc(c.corruptionVile || "")}"
            placeholder="Wrath, Envy, Greed…" ${score >= rules.CORRUPTION_NATURE_AT ? "" : "disabled"}>
          <p class="hint">${score >= rules.CORRUPTION_NATURE_AT
            ? "It names your Rebound Curse, your transformation, and whatever you become at ten."
            : `Assigned at score ${rules.CORRUPTION_NATURE_AT} and above.`}</p>
          ${score ? `<p class="hint">Everything in force at ${score} — all ${score} thresholds, with
            your Nature's own consequence on each — is on the <b>Character</b> tab. The rail only
            carries the number.</p>` : ""}`,
        { wide: true });

      const vile = document.getElementById("corrVile");
      const keepVile = () => { if (vile && !vile.disabled) mutate(s => { s.corruptionVile = vile.value.trim(); }); };
      dlg.querySelectorAll("[data-corr]").forEach(b => b.onclick = () => {
        keepVile();
        mutate(s => { s.corruption = Math.max(0, Math.min(rules.CORRUPTION_MAX,
          rules.corruptionScore(s) + Number(b.dataset.corr))); });
        draw();
      });
      dlg.querySelectorAll("[data-nature]").forEach(b => b.onclick = () => {
        keepVile();
        // Clicking the one already chosen clears it, which is the only way back from a mis-click.
        mutate(s => { s.corruptionNature = s.corruptionNature === b.dataset.nature ? "" : b.dataset.nature; });
        draw();
      });
      if (vile) vile.onchange = keepVile;
    };
    draw();
  },

  "feat-open": el => el.parentNode.classList.toggle("open"),
  "feat-del": (el, e) => { e.stopPropagation(); mutate(s => { s.features.splice(+el.dataset.id, 1); }); },

  history: async () => {
    dialog("History", `<p class="hint">Loading…</p>`, { wide: true });
    try {
      const events = await store.events(60);
      document.querySelector("#dlg .dlg-b").innerHTML = events.length
        ? `<ul class="hist">` + events.map(e => `<li>
            <b>${esc(describeEvent(e))}</b>
            <span>${esc(e.actor || "—")} · ${new Date(e.at).toLocaleString()}</span>
            ${e.note ? `<em>“${esc(e.note)}”</em>` : ""}</li>`).join("") + `</ul>`
        : `<p class="hint">Nothing recorded yet.</p>`;
    } catch (err) {
      document.querySelector("#dlg .dlg-b").innerHTML = `<p class="hint hot">${esc(err.message)}</p>`;
    }
  },

  advance: () => { state.view = "character"; renderAll(); },
  unlock: el => {
    const u = store.openUnlocks().find(x => x.id === +el.dataset.id);
    // A level token is the LEVEL UP flow, wherever it was clicked from.
    if (u && u.kind === "level" && u.target_level) return levelUpDialog();
    unlockDialog(+el.dataset.id);
  },

  // ── classes, subclasses and the level up ──
  "level-up": () => levelUpDialog(),
  "choice-open": el => choiceDialog(el.dataset.id, el.dataset.cls),
  "class-level": el => {
    const i = +el.dataset.id, by = +el.dataset.d, cap = state.current.level;
    const next = (ch().classes || []).map((c, n) =>
      n === i ? { ...c, level: Math.max(0, Math.min(cap, (Number(c.level) || 0) + by)) } : c);
    compendium.syncClasses(next).catch(err => toast(err.message));
  },
  "class-del": el => {
    const c = (ch().classes || [])[+el.dataset.id];
    if (!c) return;
    dialog(`Drop ${esc(c.name)}?`, `<p>Its features and its resources go with it — everything derived
        from it, and nothing you wrote yourself. Your level stays where your DM set it, so those
        levels will be waiting to go somewhere.</p>`, {
      footer: `<button class="btn warn" id="clsGo">Drop ${esc(c.name)}</button>
        <span class="sp"></span><button class="btn sm" data-act="dlg-close">Keep it</button>`,
    });
    document.getElementById("clsGo").onclick = () => {
      closeDialog();
      compendium.syncClasses((ch().classes || []).filter((_, n) => n !== +el.dataset.id))
        .then(() => toast(`${c.name} dropped.`)).catch(err => toast(err.message));
    };
  },
  // Time the sheet cannot see passing (CS-096): a new session, a week, a Cycle. The DM says so and
  // every feature waiting on that one comes back — and nothing else moves, which is the whole
  // reason this is not a button on the rest dialog.
  "time-passes": el => {
    const kind = el.dataset.id;
    const out = rules.timePasses(ch(), kind);
    if (!out.features.length) return;
    mutate(s => { Object.assign(s, rules.timePasses(s, kind).next); });
    const r = rules.FEATURE_RESET_BY_ID[kind];
    toast(`${r ? r.name : kind} — ${out.features.map(f => f.name).join(", ")} back.`);
  },
  // Recharge 5–6, rolled rather than assumed. The whole feature returns on a hit, which is what a
  // published recharge does; the toast shows the die so nobody has to take the sheet's word for it.
  "feat-recharge": (el, e) => {
    e.stopPropagation();
    const i = +el.dataset.id;
    const f = ch().features?.[i];
    if (!f) return;
    const out = rules.rollRecharge(f, rollDice("1d6")?.total);
    if (out.hit) mutate(s => { if (s.features[i]) s.features[i].used = 0; });
    toast(`${f.name} — d6 rolled ${out.roll}. ${out.hit ? "Back." : `Needs ${out.on} or more; still spent.`}`);
  },

  // A use spent out of a feature's pool, the same pip idiom as the spell slots: clicking the nth pip
  // means "I have spent n+1 of these", and clicking a spent one hands it back.
  "feat-use": (el, e) => {
    e.stopPropagation();
    const i = +el.dataset.id, n = +el.dataset.i;
    mutate(s => {
      const f = s.features[i];
      if (!f) return;
      // Clamped against the pool as it stands, because a DERIVED pool can shrink: a feature worth
      // "your Charisma modifier" spent to the brim and then drained of a point would otherwise
      // keep a used count the pips cannot show.
      f.used = Math.min(n < (Number(f.used) || 0) ? n : n + 1, rules.featureUses(s, f));
    });
  },

  // ── the compendium ──
  compendium: el => compendium.openCompendium(el.dataset.id || "spell"),
  "cmp-kind": el => compendium.setKind(el.dataset.id),
  "cmp-pick": el => compendium.pick(el.dataset.id),
  "cmp-apply": el => {
    const kind = compendium.currentKind();
    // Adding a spell leaves the drawer open — nobody adds exactly one — and redraws it so the
    // "in your spells" marker catches up. Every other kind is a one-off, so the drawer closes.
    if (kind !== "spell") closeDialog();
    compendium.applyEntry(kind, el.dataset.id)
      .then(() => { if (kind === "spell") compendium.redraw(); })
      .catch(err => toast(err.message));
  },
};

// ── the bigger dialogs ──────────────────────────────────────────────────
function woundPrompt(triggers) {
  const names = triggers.map(t => rules.WOUND_TRIGGERS.find(w => w.id === t)?.label || t);
  return `<div class="wprompt">
    <b>That may have cost you a Wound.</b>
    <ul>${names.map(n => `<li>${esc(n)}</li>`).join("")}</ul>
    <p class="hint">At most one Wound lands per turn however many of these fired, and your DM may rule
      otherwise — so nothing has been applied.</p>
    <button class="btn sm warn" data-act="wound-take">Take one Wound</button></div>`;
}

// ── What an attack is made of ───────────────────────────────────────────
// CS-021 / CS-025. The old dialog asked for a to-hit number and a damage expression, which meant
// the player did the arithmetic and the sheet stored the answer. This one asks for the PARTS and
// shows the answer as they type — so a level-up, an ASI or a +1 sword moves the row instead of
// leaving it quietly wrong.
//
// It also edits, which the old one could not: a row could be added and deleted and nothing else.
// Without editing, the new fields would be unreachable for every attack already on every sheet.
function attackDialog(index) {
  const editing = Number.isInteger(index);
  const src = editing ? (ch().attacks || [])[index] : null;
  if (editing && !src) return toast("That attack is gone.");

  const d = {
    id: src?.id || uid(),
    name: src?.name || "",
    item: src?.item || "",
    ability: src?.ability || "",
    proficient: !!src?.proficient,
    spell: !!src?.spell,
    damageAbility: src?.damageAbility !== false,
    magic: Number(src?.magic) || 0,
    bonus: Number(src?.bonus) || 0,
    damage: src?.damage || "",
    type: src?.type || "",
    versatile: src?.versatile || "",
    versatileName: src?.versatileName || "",
    extra: Array.isArray(src?.extra) ? src.extra.map(x => ({ ...x })) : [],
    // Carried through untouched. A stepped weapon's growth is authored on its vault note, not
    // here, and a first edit must not strip it off (the same bargain itemDialog makes with an
    // item's defences and its base AC).
    steps: Array.isArray(src?.steps) ? src.steps.map(x => ({ ...x })) : [],
  };

  const v = id => document.getElementById(id);
  const collect = () => {
    d.name = v("akName").value.trim();
    d.item = v("akItem").value;
    d.ability = v("akAbility").value;
    d.magic = Number(v("akMagic").value) || 0;
    d.bonus = Number(v("akBonus").value) || 0;
    d.damage = v("akDmg").value.trim();
    d.type = v("akType").value.trim();
    d.versatile = v("akVers").value.trim();
    d.versatileName = v("akVersName").value.trim();
    document.querySelectorAll("[data-xd]").forEach(row => {
      const i = Number(row.dataset.xd);
      if (!d.extra[i]) return;
      d.extra[i] = { dice: row.querySelector(".xd-d").value.trim(),
        type: row.querySelector(".xd-t").value.trim(),
        label: row.querySelector(".xd-l").value.trim(),
        when: row.querySelector(".xd-w").value.trim().slice(0, 120) };
    });
  };

  // The row as it would be if saved, so the preview is the real engine rather than a second
  // arithmetic that could disagree with it.
  const provisional = () => rules.attackAtLevel(ch(), { ...d });

  const draw = () => {
    const c = ch();
    const a = provisional();
    const hit = rules.attackBonus(c, a);
    const groups = rules.damageGroups(c, a);
    const link = rules.attackItem(c, a);
    const owned = rules.allItems(c).map(r => r.item.name);
    // An item named on the row that is not on the character any more stays in the menu, or
    // opening the dialog would silently unlink it.
    const names = [...new Set([...owned, ...(d.item && !owned.includes(d.item) ? [d.item] : [])])];
    // A note may name a `best:` pair the menu does not list. It is added rather than dropped —
    // otherwise opening this dialog and pressing Save would quietly wipe the row's ability.
    const listed = rules.ATTACK_ABILITIES.some(x => x.id === d.ability);
    const pair = rules.bestOfIds(d.ability);
    const abilities = listed ? rules.ATTACK_ABILITIES : [...rules.ATTACK_ABILITIES,
      ...(pair.length > 1 ? [{ id: d.ability, short: "±",
        name: `The better of ${pair.map(x => rules.ABILITY_NAME[x]).join(" and ")}`,
        hint: "Whichever of those is higher, read fresh every time. Written on this row's own note." }] : [])];
    const ability = abilities.find(x => x.id === d.ability) || rules.ATTACK_ABILITIES[0];

    const dlg = dialog(editing ? (d.name || "Attack") : "Add an attack", `
        <form class="fields" id="ak">
          <label>Name<input class="txt" id="akName" maxlength="60" required autocomplete="off"
            value="${esc(d.name)}" placeholder="Etherium Dagger"></label>

          <label>It comes from<select class="txt" id="akItem">
            <option value="">nothing — it is always in hand</option>
            ${names.map(n => `<option value="${esc(n)}" ${n === d.item ? "selected" : ""}>${esc(n)}</option>`).join("")}
          </select></label>
          <p class="hint">${d.item
            ? link?.missing
              ? `<b class="hot">${esc(d.item)} is not on this character.</b> The row still rolls, without its enhancement.`
              : link?.active
                ? `${esc(link.name)} is in your <b>${esc(link.slot ? rules.SLOT_BY_ID[link.slot]?.name || link.slot : "pack")}</b>, so this attack is armed.`
                : `${esc(link.name)} is not in a slot${link.item?.requiresAttunement && !link.item?.attuned ? " and is not attuned" : ""}, so the row reads <b>stowed</b> and its enhancement is out of both rolls.`
            : `Link it to a weapon and the row arms and disarms with that weapon — put the sword
               away and its <b>+2</b> leaves the to-hit by itself.`}</p>

          <div class="zone-h sm"><h4>What the to-hit is made of</h4></div>
          <div class="fields grid2">
            <label>Ability<select class="txt" id="akAbility">${abilities.map(x =>
              `<option value="${esc(x.id)}" ${x.id === d.ability ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select></label>
            <label>Enhancement<input class="txt" id="akMagic" type="number" min="-5" max="10" value="${d.magic}"></label>
          </div>
          <p class="hint">${esc(ability.hint)} <b>Enhancement</b> is the weapon's own <code>+N</code>
            — it lifts the to-hit <em>and</em> the damage, which is the one thing the old bonus box
            could never say.</p>

          <div class="tgls">
            ${toggleHtml(`data-tgl="proficient"`, d.proficient, "character", "You are proficient")}
            ${toggleHtml(`data-tgl="spell"`, d.spell, "spells", "It is a spell attack")}
            ${toggleHtml(`data-tgl="damageAbility"`, d.damageAbility, "damage", "Add the ability to damage")}
            <span class="hint">${esc([
              d.proficient ? `proficient ${sign(rules.proficiencyBonus(c.level))}` : "not proficient",
              d.spell ? "spell attack" : "",
              d.ability ? (d.damageAbility ? "ability on damage" : "ability on the to-hit only") : "",
            ].filter(Boolean).join(" · "))}</span>
          </div>
          ${d.spell ? `<p class="hint">A spell attack answers to <b>spell attack</b> and <b>spell
            damage</b> effects as well as the general ones — a tome's "+4 to spell attacks" reaches
            this row and leaves your bow alone.</p>` : ""}

          <label>Anything else<input class="txt" id="akBonus" type="number" min="-20" max="30" value="${d.bonus}"></label>
          <p class="hint">${hit.legacy && d.bonus
            ? `<b>This row was written the old way</b> — the number above is the whole to-hit, with
               the ability and proficiency already inside it. Name them above and take them back out
               of this box, and the row will follow your character from then on.`
            : `For what nothing above models — a Fighting Style, a DM's ruling. Bless and a worn
               item reach this row on their own; do not type those in twice.`}</p>

          <div class="zone-h sm"><h4>Damage</h4></div>
          <div class="fields grid2">
            <label>Dice<input class="txt" id="akDmg" maxlength="40" autocomplete="off"
              value="${esc(d.damage)}" placeholder="1d8"></label>
            <label>Type<input class="txt" id="akType" maxlength="24" autocomplete="off" list="akTypes"
              value="${esc(d.type)}" placeholder="slashing"></label>
          </div>
          <datalist id="akTypes">${rules.DAMAGE_TYPES.map(t =>
            `<option value="${esc(t.name.toLowerCase())}"></option>`).join("")}</datalist>
          <p class="hint">Dice only — <b>no modifier</b>. ${d.ability
            ? `Your ${esc(ability.name.toLowerCase())} ${d.damageAbility ? "is added for you" : "is kept off this roll"}.`
            : `Name an ability above and it will be added for you; a row with none keeps whatever
               you type here, which is how every older row works.`}</p>

          <div class="fields grid2">
            <label>Other mode<input class="txt" id="akVers" maxlength="40" autocomplete="off"
              value="${esc(d.versatile)}" placeholder="1d10"></label>
            <label>Called<input class="txt" id="akVersName" maxlength="24" autocomplete="off"
              value="${esc(d.versatileName)}" placeholder="Two-handed"></label>
          </div>
          <p class="hint">A second damage expression for the same weapon — two-handed, or a form it
            changes into. It gets its own small button on the row rather than a row of its own.</p>

          <div class="zone-h sm"><h4>On top of that</h4></div>
          ${d.extra.length ? d.extra.map((x, i) => `
            <div class="fx" data-xd="${i}">
              <input class="txt xd-d" maxlength="24" value="${esc(x.dice || "")}" placeholder="1d6" autocomplete="off">
              <input class="txt xd-t" maxlength="24" value="${esc(x.type || "")}" placeholder="fire" list="akTypes" autocomplete="off">
              <input class="txt xd-l" maxlength="40" value="${esc(x.label || "")}" placeholder="Everflame" autocomplete="off">
              <button class="x" type="button" data-xd-del="${i}" aria-label="Remove this rider">×</button>
              <input class="txt xd-w" maxlength="120" value="${esc(x.when || "")}" autocomplete="off"
                placeholder="only when… — leave empty and it rolls every time"
                title="A condition in your own words. The sheet never checks it: a rider that has one is kept OUT of the damage and offered as a button on the roll.">
            </div>`).join("")
            : `<p class="hint">Nothing. A rider is extra damage of its OWN type — Everflame's
               <code>1d6</code> of fire, a Zealot's radiant. It is rolled and called separately,
               doubles on a critical, and your ability modifier is never added to it.</p>`}
          ${d.extra.some(x => x.when) ? `<p class="hint">A rider with a condition is <b>left out of
            the row's damage</b> and offered as a button when you roll — so a 6d6 that wants
            advantage never quietly lands on a swing that did not have it.</p>` : ""}
          <button class="btn sm" type="button" id="akXAdd">+ Add damage of another type</button>

          <div class="zone-h sm"><h4>As it stands</h4></div>
          <ul class="why">
            <li><span>To hit</span><b>${sign(hit.total)}</b></li>
            ${hit.parts.filter(p => p.amount).map(p =>
              `<li><span>— ${esc(p.reason)}</span><b>${sign(p.amount)}</b></li>`).join("")}
            <li><span>Damage</span><b>${esc(rules.damageSays(c, a) || "—")}</b></li>
            ${d.versatile ? `<li><span>${esc(d.versatileName || "Two-handed")}</span>
              <b>${esc(rules.damageSays(c, a, { versatile: true }))}</b></li>` : ""}
            ${groups.length > 1 ? `<li><span>Called as</span><b>${esc(groups.map(g =>
              g.type || "damage").join(" + "))}</b></li>` : ""}
          </ul>
          ${d.steps.length ? `<p class="hint">Its dice grow with you — ${esc(d.steps.map(s =>
            `${s.damage || `${sign(s.bonus)}`} at ${s.at}`).join(", "))}. That comes from the item's
            note and is left alone by this dialog.</p>` : ""}

          <button class="btn pri" type="submit">${editing ? "Save" : "Add"}</button>
        </form>`,
      { footer: editing ? `<span class="sp"></span>
          <button class="btn sm warn" id="akDel">Remove</button>` : "" });

    // Anything that changes what the rest of the form SAYS redraws it — the preview at the bottom
    // is the whole point of the dialog, and a preview that only updates on save is a preview of
    // the last thing you typed.
    //
    // ⚠️ A redraw replaces the form, so the box somebody was working in is a different element
    // afterwards and the cursor lands back at the top of the dialog. Every redraw therefore puts
    // the focus back where it was, at the end of the text — without this, tabbing out of the dice
    // box throws you to the top of the form and the next Tab goes somewhere else entirely.
    const redraw = () => {
      const id = document.activeElement?.id || "";
      collect();
      draw();
      const back = id && document.getElementById(id);
      if (!back) return;
      back.focus();
      // A number input has no selection to set — asking for one throws in Firefox and Safari.
      if (back.type !== "number" && back.setSelectionRange) {
        const n = back.value.length;
        try { back.setSelectionRange(n, n); } catch { /* not a text field */ }
      }
    };

    dlg.querySelectorAll("[data-tgl]").forEach(b => b.onclick = () => {
      collect(); d[b.dataset.tgl] = !d[b.dataset.tgl]; draw();
    });
    dlg.querySelectorAll("[data-xd-del]").forEach(b => b.onclick = () => {
      collect(); d.extra.splice(Number(b.dataset.xdDel), 1); draw();
    });
    // On commit rather than per keystroke — a redraw on every letter would fight the typist even
    // with the focus put back.
    ["akAbility", "akItem", "akMagic", "akBonus", "akDmg", "akType", "akVers"]
      .forEach(id => { v(id).onchange = redraw; });
    v("akXAdd").onclick = () => { collect(); d.extra.push({ dice: "1d6", type: "", label: "" }); draw(); };
    v("ak").onsubmit = ev => { ev.preventDefault(); save(); };
    const del = document.getElementById("akDel");
    if (del) del.onclick = () => {
      closeDialog();
      mutate(s => { s.attacks = (s.attacks || []).filter((_, i) => i !== index); });
      toast(`${d.name || "It"} is gone.`);
    };
  };

  const save = () => {
    collect();
    if (!d.name) return toast("Give it a name.");
    if (d.damage && !parseDice(d.damage)) return toast("That damage expression will not roll.");
    if (d.versatile && !parseDice(d.versatile)) return toast("The other mode's expression will not roll.");
    const bad = d.extra.find(x => x.dice && !parseDice(x.dice));
    if (bad) return toast(`"${bad.dice}" will not roll.`);

    // Only what is actually set is written. A row that names no ability, no item and no
    // enhancement comes back out of here in exactly the shape it went in, which is what keeps
    // every sheet written before today reading the same as it did yesterday.
    const a = {
      id: d.id, name: d.name, bonus: d.bonus, damage: d.damage, type: d.type,
      ...(d.item ? { item: d.item } : {}),
      ...(d.ability ? { ability: d.ability } : {}),
      ...(d.proficient ? { proficient: true } : {}),
      ...(d.spell ? { spell: true } : {}),
      ...(d.ability && !d.damageAbility ? { damageAbility: false } : {}),
      ...(d.magic ? { magic: d.magic } : {}),
      ...(d.versatile ? { versatile: d.versatile } : {}),
      ...(d.versatile && d.versatileName ? { versatileName: d.versatileName } : {}),
      ...(d.extra.some(x => x.dice) ? { extra: d.extra.filter(x => x.dice).map(x => ({
        dice: x.dice, type: x.type, label: x.label, ...(x.when ? { when: x.when } : {}) })) } : {}),
      ...(d.steps.length ? { steps: d.steps } : {}),
    };
    closeDialog();
    mutate(s => {
      const list = [...(s.attacks || [])];
      if (editing) list[index] = a; else list.push(a);
      s.attacks = list;
    });
  };

  draw();
}

// Damage, rolled in the groups a table says out loud: "nine slashing and four fire". Each group
// is its own expression, so a critical doubles every rider's dice without doubling anybody's
// Strength — and so the player can hand the DM the split, which is the only form that survives a
// resistance. One number cannot be half-resisted.
function rollDamage(a, crit, versatile = false, armed = []) {
  const c = ch();
  const groups = rules.damageGroups(c, a, { versatile, armed });
  // The riders that wait to be asked for — Shadow Strike's 6d6 wants advantage, Orcish Fury's
  // wants you bloodied. Offered as buttons that roll AGAIN with the rider counted, rather than
  // as a switch somewhere that would be left on and forgotten.
  const waiting = rules.conditionalRiders(a);
  const on = new Set(armed);
  const rolled = groups.map(g => ({ g, r: rollDice(rules.groupExpr(g), { crit }) })).filter(x => x.r);
  if (!rolled.length) return toast("No damage expression on that attack.");

  const total = rolled.reduce((t, x) => t + x.r.total, 0);
  // The dice of every group in one tray, each labelled with what it is — `rollHtml` draws
  // `r.parts` when a roll carries no single d20, which is exactly this shape.
  const parts = rolled.flatMap(x => x.r.parts.map(p => ({
    ...p, label: `${p.label}${x.g.type ? ` ${x.g.type}` : ""}` })));

  // One line per damage type, which is what gets called across the table. A group with no type
  // named is left as plain damage rather than guessed at.
  const byType = [];
  for (const { g, r } of rolled) {
    const name = g.type || "damage";
    const row = byType.find(t => t.reason === name);
    if (row) row.amount += r.total; else byType.push({ reason: name, amount: r.total });
  }

  // The modifiers that lifted the weapon's own group, by name — the same courtesy the to-hit
  // breakdown gives. Shown under the split, because "where did the +5 come from" and "how much
  // fire was it" are two different questions.
  const why = (groups[0]?.why || []).filter(w => w.amount);

  const mode = versatile ? ` · ${a.versatileName || "two-handed"}` : "";
  const d = dialog(`${a.name || "Attack"} — damage${crit ? " (critical)" : ""}${mode}`,
    rollHtml({ total, parts, crit }, {
      label: byType.length > 1 ? "" : (byType[0]?.reason === "damage" ? "" : byType[0]?.reason || ""),
      breakdown: byType.length > 1 ? byType : why,
    }) +
    // ⚠️ Kept visually apart from the per-type lines above. Run together they read as one column
    // of numbers that does not add up — "slashing 9" and "Strength modifier +4" are an answer and
    // a working, and a reader cannot tell which is which when they share a list.
    (byType.length > 1 && why.length
      ? `<div class="zone-h sm"><h4>What is inside the first of those</h4></div>
         <ul class="why">${why.map(w =>
           `<li><span>${esc(w.reason)}</span><b>${sign(w.amount)}</b></li>`).join("")}</ul>`
      : "") +
    (byType.length > 1
      ? `<p class="hint">Call the types separately — <b>${esc(byType.map(t =>
          `${t.amount} ${t.reason}`).join(", "))}</b>. A resistance lands on one of them, not on the total.</p>`
      : "") +
    (crit ? `<p class="hint">Every die is doubled, riders included; no modifier is.</p>` : "") +
    (rules.attackArmed(c, a) ? "" : `<p class="hint hot">${esc(a.item || "That item")} is not in a
       slot, so its enhancement is not in this roll.</p>`),
    {
      // One button per conditional rider, saying the condition in the note's own words. Pressing
      // one rolls the whole thing again with that rider counted — the dice are re-rolled rather
      // than added to the result, because a roll somebody has already seen must not grow.
      footer: waiting.map(r => `<button class="btn sm${on.has(r.key) ? " on" : ""}"
          data-rider="${esc(r.key)}"
          title="${esc(`${r.dice} ${r.type || "damage"} — ${r.when}`)}">${
          on.has(r.key) ? "−" : "+"} ${esc(r.label || r.dice)}</button>`).join(""),
    });

  d.querySelectorAll("[data-rider]").forEach(b => b.onclick = () => {
    const k = b.dataset.rider;
    const next = new Set(on);
    if (next.has(k)) next.delete(k); else next.add(k);
    rollDamage(a, crit, versatile, [...next]);
  });
}

// An extra slot in the turn's own economy — Haste's Action, a second Reaction, a Quick Action the
// table handed out. Not the same thing as an entry in the Actions card: that is something you can
// DO, this is permission to do one more thing this turn.
// ── what is hitting you ─────────────────────────────────────────────────
// Only the types this character has a defence for, because those are the only ones that change a
// number: picking "cold" with no cold defence would be a click that does nothing, and a list of
// sixteen to find the two that matter is slower than the arithmetic it was meant to save.
function incomingPop(el) {
  const c = ch();
  const abs = !!state.dmgAbsolute;
  // One row per TYPE, carrying the answer every record on it adds up to — not one row per record.
  // What the reader needs here is "what does fire do to me", and two chips saying different things
  // about fire is the question, not the answer.
  const rows = rules.defenceTypes(c).map(t => {
    const st = rules.STANDING_BY_ID[t.standing];
    const says = t.cancelled ? "they cancel — nothing applies"
      : t.irresistible && t.standing !== "vulnerable" ? "nothing applies"
      : t.standing === "vulnerable" ? "doubled"
      : abs ? `${rules.absoluteReduction(c, t.standing)} off`
      : t.standing === "immune" ? "no damage" : "halved";
    const left = t.rounds == null ? "" : ` · ${t.rounds}r left`;
    return `<button class="listrow ${state.dmgType === t.id ? "on" : ""}" data-act="dmg-pick" data-id="${t.id}">
      <b>${esc(rules.damageTypeName(t.id, abs))}</b><span>${esc(
        (t.cancelled ? says : `${st.name} · ${says}`) + left)}</span></button>`;
  }).join("");

  popAt(el, `<div class="pop-h"><b>What is hitting you</b>
      ${toggleHtml(`data-act="dmg-absolute"`, abs, "crit",
        "It arrives Absolute — a seal from Rank IV, or a Verum that gets there sooner")}</div>
    <div class="pop-b list">
      <button class="listrow ${state.dmgType ? "" : "on"}" data-act="dmg-pick" data-id="">
        <b>Untyped</b><span>nothing is applied</span></button>
      ${rows}</div>
    <p class="hint">${abs
      ? `<b>Absolute.</b> Resistance stops halving and subtracts ${rules.absoluteReduction(c, "resistant")},
         immunity ${rules.absoluteReduction(c, "immune")} — twice and four times your proficiency bonus,
         never below 0. Vulnerability still doubles.`
      : `Ordinary damage: resistance halves it, immunity stops it, vulnerability doubles it.
         Turn on the mark above for a seal that arrives Absolute.`}</p>`,
    { pin: true, key: "dmgtype" });
}

// One defence: a type, how it lands, and where it came from — which is the inspectable source
// CS-032 asks for. Typed rather than derived, because a resistance arrives from an ancestry, a
// feature, a worn item or a ruling, and only the last of those is anywhere this sheet can read.
function defenceDialog(recordId) {
  const c = ch();
  const cur = recordId ? rules.defenceRecords(c).find(r => r.id === recordId) : null;
  const typeId = cur?.type || "";
  const opts = rules.DAMAGE_FAMILIES.map(f =>
    `<optgroup label="${esc(f.name)}">` + rules.DAMAGE_TYPES.filter(t => t.family === f.id).map(t =>
      `<option value="${t.id}" ${t.id === typeId ? "selected" : ""}>${esc(t.name)}${
        t.born ? " — born Absolute" : ` → ${t.absolute}`}</option>`).join("") + `</optgroup>`).join("");
  // The same ladder the effects, the actions and the Inspiration dice offer, because they are the
  // same question — Absorb Elements is a round, a Rage is ten, a potion is a hundred.
  const durations = [["", "Lasting — it is simply true of me"], ["1", "1 round"], ["2", "2 rounds"],
    ["3", "3 rounds"], ["10", "10 rounds (1 minute)"], ["100", "100 rounds (10 minutes)"]];
  const dur = cur?.rounds == null ? "" : String(cur.rounds);

  dialog(cur ? `${rules.DAMAGE_BY_ID[typeId].name} — how it lands` : "Add a defence",
    `<form class="fields" id="df">
      <label>Damage type<select class="txt" id="dfType">${opts}</select></label>
      <label>How it lands on you<select class="txt" id="dfStanding">${rules.DEFENCE_STANDINGS.map(s =>
        `<option value="${s.id}" ${cur?.standing === s.id ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select></label>
      <label>How long you have it<select class="txt" id="dfDur">${durations.map(([v, label]) =>
        `<option value="${v}" ${v === dur ? "selected" : ""}>${esc(label)}</option>`).join("")}</select></label>
      <label>Where it comes from<input class="txt" id="dfWhy" maxlength="60" autocomplete="off"
        value="${esc(cur?.why || "")}" placeholder="Drow, Rage, Absorb Elements, a DM ruling…"></label>
      <button class="btn pri" type="submit">${cur ? "Save" : "Add"}</button></form>
    <div id="dfNote"></div>`, {
      footer: cur ? `<button class="btn sm warn" data-act="def-del" data-id="${esc(recordId)}">Remove</button>
        <span class="sp"></span><button class="btn sm" data-act="dlg-close">Done</button>` : "",
    });

  const type = document.getElementById("dfType");
  const standing = document.getElementById("dfStanding");
  const note = document.getElementById("dfNote");
  // Both regimes, spelled out for the pair actually chosen, before anything is saved — the whole
  // reason this is not a tickbox: "immune to fire" means two different things either side of level 17.
  const draw = () => {
    const t = rules.DAMAGE_BY_ID[type.value];
    const st = rules.STANDING_BY_ID[standing.value];
    const red = rules.absoluteReduction(c, st.id);
    const dead = t.irresistible && st.id !== "vulnerable";
    // A born-Absolute type gets ONE row, not two: there is no ordinary void to halve, and printing
    // "ordinary void — halved" above "Void — no effect" is the sheet contradicting itself.
    note.innerHTML = `<ul class="why">
        ${t.born ? "" : `<li><span>Ordinary ${esc(t.name.toLowerCase())}</span><b>${esc(st.ordinary)}</b></li>`}
        <li><span>${esc(t.absolute)}${t.born ? " — born Absolute" : " (Absolute)"}</span><b>${
          dead ? "no effect" : st.id === "vulnerable" ? "still doubled" : `${red} off`}</b></li>
      </ul>
      ${t.note ? `<p class="hint${dead ? " hot" : ""}">${esc(t.note)}</p>` : ""}
      ${dead ? `<p class="hint hot">Recorded all the same — it is true of this character, and the
        sheet saying it does nothing is more use at a table than the sheet refusing it.</p>` : ""}`;
  };
  draw();
  type.onchange = draw;
  standing.onchange = draw;

  document.getElementById("df").onsubmit = ev => {
    ev.preventDefault();
    const durVal = document.getElementById("dfDur").value;
    const row = {
      id: cur?.id || `df:${uid()}`, type: type.value, standing: standing.value,
      why: document.getElementById("dfWhy").value.trim(),
      rounds: durVal ? Number(durVal) : null, active: true,
    };
    closeDialog();
    // Written back as a LIST however it was stored, which is what migrates a sheet saved under the
    // old one-standing-per-type map: it is read in that shape and saved in this one.
    mutate(s => {
      const list = rules.ownDefenceRecords(s).filter(r => r.id !== row.id);
      s.defences = [...list, row];
    });
    toast(`${rules.DAMAGE_BY_ID[row.type].name} — ${rules.STANDING_BY_ID[row.standing].name.toLowerCase()}${
      row.rounds == null ? "" : `, ${row.rounds} round${row.rounds === 1 ? "" : "s"}`}.`);
  };
}

// A sense, with the six standard ones as one-click fills. The range is editable because an ancestry
// and a spell hand out the same sense at different distances.
function senseDialog(i) {
  const list = rules.senseList(ch());
  const cur = i >= 0 ? list[i] : null;
  dialog(cur ? cur.name : "Add a sense",
    `<div class="chips snq">${rules.SENSES.map(s =>
      `<button type="button" class="chip" data-sn="${s.id}">${esc(s.name)} ${s.range} ft</button>`).join("")}</div>
    <form class="fields" id="sf">
      <label>What it is<input class="txt" id="sfName" maxlength="40" required autocomplete="off"
        value="${esc(cur?.name || "")}"></label>
      <label>Range in feet<input class="txt" id="sfRange" type="number" min="0" max="999"
        value="${cur?.range || 0}"></label>
      <label>Where it comes from<input class="txt" id="sfWhy" maxlength="60" autocomplete="off"
        value="${esc(cur?.why || "")}" placeholder="Drow, a Grimm's gift, a potion…"></label>
      <button class="btn pri" type="submit">${cur ? "Save" : "Add"}</button></form>
    <p class="hint">The six above fill both boxes at their standard range — change the number where
      your version differs. A range of 0 is shown as the sense alone.</p>`, {
      footer: cur ? `<button class="btn sm warn" data-act="sense-del" data-id="${i}">Remove</button>
        <span class="sp"></span><button class="btn sm" data-act="dlg-close">Done</button>` : "",
    });

  document.querySelectorAll(".snq [data-sn]").forEach(b => b.onclick = () => {
    const s = rules.SENSE_BY_ID[b.dataset.sn];
    document.getElementById("sfName").value = s.name;
    document.getElementById("sfRange").value = s.range;
    document.getElementById("sfName").focus();
  });

  document.getElementById("sf").onsubmit = ev => {
    ev.preventDefault();
    const name = document.getElementById("sfName").value.trim();
    if (!name) return;
    const row = {
      id: rules.SENSES.find(s => s.name === name)?.id || `x:${uid()}`,
      name,
      range: Math.max(0, Math.min(999, Number(document.getElementById("sfRange").value) || 0)),
      why: document.getElementById("sfWhy").value.trim(),
    };
    closeDialog();
    mutate(s => {
      const next = [...(s.senses || [])];
      if (i >= 0) next[i] = row; else next.push(row);
      s.senses = next;
    });
  };
}

// One die of Inspiration: take one, or spend one you hold. Both live in the same popover because
// they are the same gesture on the same die — which is how Juan asked for it, and it is right: the
// question "do I have a d6" and the act of using it should not be two different journeys.
function inspirationPop(die, { rolled = null, reopen = false } = {}) {
  // Every path here redraws the sheet first, which replaces the button this hangs from, so the
  // anchor is found rather than passed. Opening a pinned pop with the same key TOGGLES it shut,
  // which is what the die wants and the opposite of what a spend wants.
  const el = document.querySelector(`[data-act="insp"][data-id="${die}"]`);
  if (!el) return;
  if (reopen) closePop(true);
  const c = ch();
  const mine = rules.inspirationOf(c, die);
  const next = rules.inspirationNext(c, die);

  popAt(el, `<div class="pop-h"><b>${esc(die)}</b>
      ${mine.length ? `<span class="tag">${mine.length} held</span>` : ""}</div>
    <div class="pop-b">
      ${rolled ? `<div class="hd-roll"><b>${rolled.total}</b>
        <span>${esc(rolled.die)}${rolled.why ? ` — ${esc(rolled.why)}` : ""} · spent</span></div>` : ""}
      ${mine.length ? `<div class="chips">${mine.map(d =>
        `<button class="chip on" data-act="insp-open" data-id="${esc(d.id)}"
          title="${esc(d.why || "No source recorded")}">${d.rounds == null ? "until used" : `${d.rounds}r`}${
          d.why ? ` · ${esc(d.why)}` : ""}</button>`).join("")}</div>` : ""}
      <label class="ck-col">How long it lasts<select class="txt" id="inspDur">
          <option value="">Until used</option>
          <option value="1">1 round</option><option value="2">2 rounds</option>
          <option value="3">3 rounds</option><option value="10">10 rounds (1 minute)</option>
          <option value="100">100 rounds (10 minutes)</option>
        </select></label>
      <label class="ck-col">Where it came from<input class="txt" id="inspWhy" maxlength="40"
        autocomplete="off" placeholder="Bless, Bardic Inspiration, a DM's nod…"></label>
    </div>
    <div class="pop-f">
      <button class="btn sm pri" data-act="insp-add" data-id="${esc(die)}">Take a ${esc(die)}</button>
      <button class="btn sm" data-act="insp-spend" data-id="${esc(die)}" ${mine.length ? "" : "disabled"}
        title="${esc(next ? `Rolls it and lets it go — ${next.why || "unnamed"}${
          next.rounds == null ? ", until used" : `, ${next.rounds}r left`}` : `No ${die} to spend`)}">Spend</button>
    </div>
    ${mine.length > 1 ? `<p class="hint">Spend takes the one about to run out — a die with rounds on
      it is worth less than one that waits. Pick a particular one above to spend that instead.</p>` : ""}`,
    { pin: true, key: `inspd:${die}` });
}

function grantDialog() {
  dialog("Another one this turn", `<form class="fields" id="gf">
      <label>What you get more of<select class="txt" id="gfKind">${rules.TURN_KINDS.map(k =>
        `<option value="${k}">${ACTION_COST[k] || k}</option>`).join("")}</select></label>
      <label>How many<input class="txt" id="gfN" type="number" value="1" min="1" max="4"></label>
      <label>Why<input class="txt" id="gfWhy" maxlength="80" autocomplete="off"
        placeholder="Haste, Action Surge, a Grimm's gift…"></label>
      <label>How long<select class="txt" id="gfDur">
          <option value="">Permanent — I always have it</option>
          <option value="1">1 round</option><option value="2">2 rounds</option>
          <option value="3">3 rounds</option><option value="10" selected>10 rounds (1 minute)</option>
          <option value="100">100 rounds (10 minutes)</option>
        </select></label>
      <button class="btn pri" type="submit">Grant it</button></form>
    <p class="hint">Extra slots show as their own pips on the tracker. A timed one runs out when you
      confirm a round, the same clock your effects and temporary actions keep.</p>`);
  document.getElementById("gf").onsubmit = ev => {
    ev.preventDefault();
    const dur = document.getElementById("gfDur").value;
    const kind = document.getElementById("gfKind").value;
    const g = { id: uid(), kind,
      n: Math.max(1, Math.min(4, Number(document.getElementById("gfN").value) || 1)),
      why: document.getElementById("gfWhy").value.trim(),
      rounds: dur ? Number(dur) : null, active: true };
    closeDialog();
    mutate(s => { s.grants = [...(s.grants || []), g]; });
    toast(`+${g.n} ${ACTION_COST[kind] || kind}${g.rounds ? ` — ${g.rounds} rounds` : ""}`);
  };
}

// Something this character can do — permanently, or for a few rounds because a spell or an ability
// granted it. Deliberately separate from an attack: most of what a Once Upon a Star character does
// on their turn has no to-hit roll at all.
function actionDialog() {
  dialog("Add an action", `<form class="fields" id="af">
      <label>What it is<input class="txt" id="afName" maxlength="80" required autocomplete="off"
        placeholder="Cunning Action, Force Through, Baton Pass…"></label>
      <label>What it costs<select class="txt" id="afCost">${Object.entries(ACTION_COST).map(([k, v]) =>
        `<option value="${k}">${v}</option>`).join("")}</select></label>
      <label>How long you have it<select class="txt" id="afDur">
          <option value="">Permanent — it is just something I can do</option>
          <option value="1">1 round</option><option value="2">2 rounds</option>
          <option value="3">3 rounds</option><option value="10">10 rounds (1 minute)</option>
          <option value="100">100 rounds (10 minutes)</option>
        </select></label>
      <label>What it does<textarea class="txt ta" id="afText" rows="3"></textarea></label>
      <button class="btn pri" type="submit">Add</button></form>
    <p class="hint">A temporary one counts down with your rounds and goes quiet when it runs out,
      rather than disappearing — so you can see what you had.</p>`);
  document.getElementById("af").onsubmit = ev => {
    ev.preventDefault();
    const name = document.getElementById("afName").value.trim();
    if (!name) return;
    const dur = document.getElementById("afDur").value;
    const a = { id: uid(), name,
      cost: document.getElementById("afCost").value,
      text: document.getElementById("afText").value.trim(),
      rounds: dur ? Number(dur) : null, active: true };
    closeDialog();
    mutate(s => { s.actions = [...(s.actions || []), a]; });
    toast(a.rounds ? `${name} — ${a.rounds} rounds` : `${name} added.`);
  };
}

// One equipment slot. The three flags are the columns Zariel's own Equipment note keeps, and the
// attunement ones feed the counts on the same tab rather than a separate list to keep in step.
// ── items ───────────────────────────────────────────────────────────────
// The four things an item can BE. Each is a square that lights up rather than a tickbox: four
// tickboxes in a column read as a form to fill in, and these are states you want to read at a
// glance. The words are in the tooltip, and the lit ones are named under the row as well, because
// an icon nobody has met yet is a guess until it is.
const ITEM_FLAGS = [
  { id: "magical", icon: "effect", short: "magical", label: "Magical" },
  { id: "requiresAttunement", icon: "needsAttunement", short: "needs attunement",
    label: "Needs attunement — it does nothing until you are attuned" },
  { id: "attuned", icon: "attunement", short: "attuned", label: "Attuned to it" },
  // Where an item stands on the dream axis is NOT here any more: it has three values, and a square
  // that lights up can only say two. It is the select below the flags (`rules.ITEM_DREAM`).
];

// Writing one item back, wherever it lives. Every change to an item goes through here so the two
// containers — the slots and the pack — never need separate copies of the same edit.
function writeItem(where, fn) {
  const found = rules.findItem(ch(), where);
  if (!found) return;
  mutate(s => {
    if (found.slot) {
      s.equipment = { ...(s.equipment || {}) };
      s.equipment[found.slot] = fn(found.item);
    } else {
      s.carried = [...(s.carried || [])];
      s.carried[found.index] = fn(found.item);
    }
  });
}

// Equipping is a MOVE, not a copy: one record, in one place, so a wand with three charges left
// cannot end up as two wands with three charges each. Whatever was in the slot goes to the pack.
function equipItem(where, slotId) {
  const found = rules.findItem(ch(), where);
  if (!found) return;
  const item = found.item;
  mutate(s => {
    const displaced = (s.equipment || {})[slotId];
    let carried = [...(s.carried || [])];
    if (found.index != null) carried.splice(found.index, 1);
    if (displaced?.name) carried = [...carried, displaced];
    s.carried = carried;
    s.equipment = { ...(s.equipment || {}), [slotId]: item };
  });
  toast(`${item.name} — ${rules.SLOT_BY_ID[slotId]?.name || slotId}.`);
}

function unequipItem(where) {
  const found = rules.findItem(ch(), where);
  if (!found?.slot) return;
  mutate(s => {
    s.equipment = { ...(s.equipment || {}) };
    delete s.equipment[found.slot];
    s.carried = [...(s.carried || []), found.item];
  });
  toast(`${found.item.name} is in your pack. Its effects stop there.`);
}

// One dialog for one item, wherever it is. It holds the three things an item does beyond having a
// name: what it weighs and is worth, how many charges it has and what brings them back, and what it
// is doing to your numbers — which are the same `{target, amount}` pairs a hand-written effect uses.
function itemDialog(where) {
  const isNew = where === "pack:new";
  // The slot comes from the address, not from what is in it — clicking an EMPTY slot has to open
  // this dialog too, and that is the whole way an item gets put on in the first place.
  const slotId = where.startsWith("slot:") ? where.slice(5) : null;
  const slot = slotId ? rules.SLOT_BY_ID[slotId] : null;
  const found = isNew ? null : rules.findItem(ch(), where);
  if (!isNew && !slot && !found) return toast("That item is gone.");

  // A working copy: nothing is written until Save, so the effect list can be built up and abandoned.
  const src = found?.item || {};
  const c0 = rules.itemCharges(src);
  const d = {
    name: src.name || "", qty: Number(src.qty) || 1, weight: Number(src.weight) || 0,
    value: Number(src.value) || 0, notes: src.notes || "",
    magical: !!src.magical, requiresAttunement: !!src.requiresAttunement,
    attuned: !!src.attuned,
    // Read through `itemDream`, so an item saved under the old boolean opens as Dreamlike.
    dream: rules.itemDream(src),
    charges: c0 ? { ...c0 } : { max: 0, used: 0, recharge: "manual", regain: "all" },
    effects: rules.itemEffectList(src),
    // Carried through the dialog untouched: a defence is granted by the item and edited on the
    // note, not here, but it must survive a Save or the first edit would strip the armour's
    // resistances off it.
    defences: Array.isArray(src.defences) ? src.defences.map(x => ({ ...x })) : [],
    // Like the defences: granted by the item, authored on the note, and it must survive a Save or
    // the first edit would strip the armour's own armour class off it.
    baseAc: src.baseAc ? { ...src.baseAc } : null,
    id: src.id || uid(),
    // Its page in the Obsidian vault, and whatever the last read of that page brought back. The
    // features and attacks are held here rather than written as they arrive, so cancelling the
    // dialog really does cancel the import — the same bargain the effect list already makes.
    vault: src.vault || "",
    newFeatures: [], newAttacks: [], warnings: [],
  };

  const fieldId = k => `it${k[0].toUpperCase()}${k.slice(1)}`;
  const collect = () => {
    const v = k => document.getElementById(fieldId(k));
    d.name = v("name").value.trim();
    d.qty = Math.max(1, Number(v("qty").value) || 1);
    d.weight = Math.max(0, Number(v("weight").value) || 0);
    d.value = Math.max(0, Number(v("value").value) || 0);
    d.notes = v("notes").value.trim();
    d.vault = v("vault").value.trim();
    d.dream = rules.DREAM_BY_ID[v("dream").value] ? v("dream").value : "";
    // The four flags are not read back from the DOM: they are squares that light up, and the click
    // that lights one is what changes `d`. Only the typed fields are collected here.
    d.charges = { max: Math.max(0, Number(v("max").value) || 0), used: d.charges.used,
      recharge: v("recharge").value, regain: v("regain").value.trim() || "all" };
    d.charges.used = Math.min(d.charges.used, d.charges.max);
    document.querySelectorAll("[data-fx]").forEach(row => {
      const i = Number(row.dataset.fx);
      if (!d.effects[i]) return;
      // Which controls are in the row depends on whether this one is derived, so each is read by
      // its own class rather than by position — `querySelector("select")` used to mean the target
      // and would now mean whichever select came first.
      const from = row.querySelector(".fx-f").value;
      // The condition, and whether it is armed. `on` is read off the record rather than the DOM —
      // it is switched from the Gear tab, not from here — and it is dropped the moment the
      // condition is cleared, because an effect with nothing to wait for must not stay waiting.
      const when = (row.querySelector(".fx-w")?.value || "").trim().slice(0, 120);
      const on = when ? !!d.effects[i].on : false;
      d.effects[i] = from
        ? { target: row.querySelector(".fx-t").value, amount: 0,
            from, times: Number(row.querySelector(".fx-x")?.value) || 1 }
        : { target: row.querySelector(".fx-t").value,
            amount: Number(row.querySelector(".fx-a")?.value) || 0 };
      if (when) Object.assign(d.effects[i], { when, ...(on ? { on: true } : {}) });
    });
  };

  const draw = () => {
    const title = slot ? `${slot.name} — ${d.name || "empty"}` : (isNew ? "Carry an item" : d.name || "Item");
    const dlg = dialog(title, `
        <form class="fields" id="itf">
          <label>Item<input class="txt" id="itName" maxlength="80" value="${esc(d.name)}"
            autocomplete="off" placeholder="${esc(slot ? slot.eg : "Etherium Dagger")}" required></label>
          <div class="fields grid3">
            <label>How many<input class="txt" id="itQty" type="number" min="1" max="999" value="${d.qty}"></label>
            <label>Weight, lb<input class="txt" id="itWeight" type="number" min="0" step="0.1" value="${d.weight}"></label>
            <label>Value, gp<input class="txt" id="itValue" type="number" min="0" step="0.01" value="${d.value}"></label>
          </div>
          <label>Notes<input class="txt" id="itNotes" maxlength="160" value="${esc(d.notes)}"></label>

          <label>Vault link<input class="txt" id="itVault" maxlength="500" value="${esc(d.vault)}"
            autocomplete="off" spellcheck="false"
            placeholder="https://publish.obsidian.md/once-upon-a-star/…"></label>
          <div class="vaultrow">
            <button class="btn sm" type="button" id="itVaultRead">${icon("vault")} Read the note</button>
            ${vaultHref(d.vault)
              ? `<a class="btn sm" href="${esc(vaultHref(d.vault))}" target="_blank"
                   rel="noopener noreferrer">Open the page</a>` : ""}
            <span class="hint">${d.newFeatures.length || d.newAttacks.length
              ? `Read from the vault — ${[
                  d.newFeatures.length && `${d.newFeatures.length} feature${d.newFeatures.length > 1 ? "s" : ""}`,
                  d.newAttacks.length && `${d.newAttacks.length} attack${d.newAttacks.length > 1 ? "s" : ""}`,
                ].filter(Boolean).join(" and ")} land on the sheet when you save.`
              : `Its page on publish.obsidian.md. Reading it fills this dialog in from the note's
                 hidden <code>av-item</code> block, which the page itself never shows.`}</span>
          </div>
          ${d.warnings.length ? `<p class="hint hot">${d.warnings.map(esc).join(" ")}</p>` : ""}

          <div class="tgls">
            ${ITEM_FLAGS.map(f => toggleHtml(`data-tgl="${f.id}"`, d[f.id], f.icon, f.label)).join("")}
            <span class="hint">${esc([...ITEM_FLAGS.filter(f => d[f.id]).map(f => f.short),
              rules.DREAM_BY_ID[d.dream].short].filter(Boolean).join(" · ") || "none of these")}</span>
          </div>

          <label>In the dream<select class="txt" id="itDream">${rules.ITEM_DREAM.map(x =>
            `<option value="${x.id}" ${x.id === d.dream ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select></label>
          <p class="hint">${esc(rules.DREAM_BY_ID[d.dream].hint)}</p>

          <div class="zone-h sm"><h4>Charges</h4></div>
          <div class="fields grid3">
            <label>How many<input class="txt" id="itMax" type="number" min="0" max="99" value="${d.charges.max}"></label>
            <label>Comes back<select class="txt" id="itRecharge">${rules.ITEM_RECHARGE.map(r =>
              `<option value="${r.id}" ${d.charges.recharge === r.id ? "selected" : ""}>${esc(r.label)}</option>`).join("")}</select></label>
            <label>Regains<input class="txt" id="itRegain" maxlength="12" value="${esc(d.charges.regain)}"
              placeholder="all, or 1d6+1"></label>
          </div>
          ${d.charges.max ? `<p class="hint">${d.charges.max - d.charges.used} of ${d.charges.max} left.
            <b>Regains</b> is <code>all</code>, or a dice expression the sheet rolls for you when the
            rest comes round — <code>1d6+1</code> is how half the published wands word it.</p>` : ""}

          <div class="zone-h sm"><h4>What it does to your numbers</h4></div>
          ${d.effects.length ? d.effects.map((e, i) => `
            <div class="fx" data-fx="${i}">
              <select class="txt fx-t">${MOD_TARGETS.map(t =>
                `<option value="${t.value}" ${t.value === e.target ? "selected" : ""}>${esc(t.label)}</option>`).join("")}</select>
              <select class="txt fx-f" data-fx-from="${i}">
                <option value="">a flat number</option>
                ${rules.DERIVE_FROM.map(s =>
                  `<option value="${s.id}" ${s.id === e.from ? "selected" : ""}>my ${esc(s.name)}</option>`).join("")}
              </select>
              ${e.from
                ? `<select class="txt fx-x">${rules.DERIVE_TIMES.map(t =>
                    `<option value="${t.value}" ${t.value === (Number(e.times) || 1) ? "selected" : ""}>${
                      esc(t.name ? `${t.name} it` : "just it")}</option>`).join("")}
                   </select>
                   <span class="fx2-n">= ${sign(rules.modifierAmount(ch(), e))}</span>`
                : `<input class="txt fx-a" type="number" min="-20" max="20" value="${e.amount}">`}
              <button class="x" type="button" data-fx-del="${i}" aria-label="Remove this effect">×</button>
              <input class="txt fx-w" maxlength="120" value="${esc(e.when || "")}"
                placeholder="only when… — leave empty and it always counts"
                title="A condition in your own words. The sheet never checks it; an effect that has one starts switched off and is armed from the Gear tab.">
            </div>`).join("")
            : `<p class="hint">Nothing yet. Add one and it counts the moment the item is in a
               slot — the same path a hand-written effect takes, so it shows in the breakdown with
               the item's own name on it.</p>`}
          ${d.effects.some(e => e.from) ? `<p class="hint">A derived amount is worked out every time
            the number is read, so it follows the score behind it — and it only counts while the
            item is in a slot, like any other effect of its.</p>` : ""}
          <button class="btn sm" type="button" id="itFxAdd">+ Add an effect</button>
          ${d.baseAc && Number(d.baseAc.base) ? `<div class="zone-h sm"><h4>Armour class it sets</h4></div>
            <ul class="why"><li><span>Base AC</span><b>${rules.resolveBaseAc(ch(), d.baseAc)}</b></li></ul>
            <p class="hint">This <b>replaces</b> the AC on your sheet rather than adding to it, and
              only while the item is in force. Whichever is higher wins, so your own number is
              still there underneath — and a shield's <code>+2</code> lands on top of this.</p>` : ""}
          ${(d.defences || []).length ? `<div class="zone-h sm"><h4>Defences it grants</h4></div>
            <ul class="why">${d.defences.map(x => `<li>
              <span>${esc(rules.DAMAGE_BY_ID[x.type]?.name || x.type)}</span>
              <b>${esc(rules.STANDING_BY_ID[x.standing]?.name || x.standing)}</b></li>`).join("")}</ul>
            <p class="hint">These come from the item's own note and are edited there. They are in
              force exactly while the item is — <b>and they leave when it comes off</b>, which a
              resistance typed into the bar by hand never does.</p>` : ""}
          <button class="btn pri" type="submit">Save</button>
        </form>`,
      { footer: [
        found && d.charges.max ? `<button class="btn sm" id="itUse">Use a charge</button>` : "",
        found && d.charges.used ? `<button class="btn sm" id="itRefill">Refill</button>` : "",
        found && slot ? `<button class="btn sm" id="itOff">Take it off</button>` : "",
        found && !slot ? `<button class="btn sm" id="itOn">Equip</button>` : "",
        `<span class="sp"></span>`,
        found ? `<button class="btn sm warn" id="itDel">Remove</button>` : "",
      ].filter(Boolean).join("") });

    dlg.querySelectorAll("[data-tgl]").forEach(b => b.onclick = () => {
      collect(); d[b.dataset.tgl] = !d[b.dataset.tgl]; draw();
    });
    dlg.querySelectorAll("[data-fx-del]").forEach(b => b.onclick = () => {
      collect(); d.effects.splice(Number(b.dataset.fxDel), 1); draw();
    });
    // Choosing a source swaps the number box for a multiplier, so the row is redrawn — collect
    // first, exactly as the flags and the delete do, or the other rows lose what was typed in them.
    dlg.querySelectorAll("[data-fx-from]").forEach(s => s.onchange = () => { collect(); draw(); });
    // Changing the dream kind redraws, so the line under it always describes the kind now chosen —
    // the whole reason it is a select is that the three cost different things.
    const dreamSel = document.getElementById("itDream");
    if (dreamSel) dreamSel.onchange = () => { collect(); draw(); };
    document.getElementById("itFxAdd").onclick = () => {
      collect(); d.effects.push({ target: "ac", amount: 1 }); draw();
    };
    document.getElementById("itf").onsubmit = ev => { ev.preventDefault(); save(); };

    const on = (id, fn) => { const b = document.getElementById(id); if (b) b.onclick = fn; };
    // Re-reading the note is how an item stays in step with canon after Juan rewrites its entry:
    // everything typed here is overwritten from the block, and nothing is saved until Save.
    on("itVaultRead", async () => {
      collect();
      const b = document.getElementById("itVaultRead");
      b.disabled = true; b.textContent = "Reading…";
      try {
        const { entries, note } = await vault.readItemsFromNote(d.vault);
        // A note covering a set hands back several; take the one already named here if it is among
        // them, so re-reading a Knight's Standard does not quietly turn it into a different one.
        const pick = entries.find(e => e.item.name.toLowerCase() === d.name.toLowerCase()) || entries[0];
        applyImport(d, pick, note);
        draw();
        toast(`${pick.item.name} — read from the vault.`);
      } catch (err) {
        toast(err.message);
        b.disabled = false; b.innerHTML = `${icon("vault")} Read the note`;
      }
    });
    on("itUse", () => {
      const charges = rules.spendCharges({ charges: d.charges }, 1);
      if (!charges) return toast("No charges left.");
      d.charges = { ...d.charges, used: charges.used };
      save({ keepOpen: true });
    });
    on("itRefill", () => { d.charges = { ...d.charges, used: 0 }; save({ keepOpen: true }); });
    on("itOff", () => { closeDialog(); unequipItem(where); });
    on("itOn", () => { save(); const el = document.querySelector(`[data-act="item-equip"][data-id="${where}"]`); if (el) el.click(); });
    on("itDel", () => {
      closeDialog();
      if (slotId) mutate(s => { s.equipment = { ...(s.equipment || {}) }; delete s.equipment[slotId]; });
      else mutate(s => { s.carried = (s.carried || []).filter((_, i) => i !== found.index); });
      toast(`${d.name || "It"} is gone.`);
    });
  };

  const save = ({ keepOpen = false } = {}) => {
    collect();
    if (!d.name) {
      // An empty name on a slot is how the old dialog cleared it, and that is worth keeping.
      if (slotId) { closeDialog(); mutate(s => { s.equipment = { ...(s.equipment || {}) }; delete s.equipment[slotId]; }); }
      return;
    }
    const item = { id: d.id, name: d.name, qty: d.qty, weight: d.weight, value: d.value,
      notes: d.notes, magical: d.magical, requiresAttunement: d.requiresAttunement,
      attuned: d.attuned,
      // Written as the axis and never as the retired boolean, so no record can end up carrying two
      // answers that disagree. `itemDream` is what reads an older one.
      dream: d.dream,
      charges: d.charges.max ? { ...d.charges } : null,
      // A DERIVED effect has no amount of its own — dropping anything falsy here would throw every
      // one of them away on the way to being saved, which is the same trap `itemEffectList` had.
      effects: d.effects.filter(e => e.target && (e.from || e.amount)),
      defences: (d.defences || []).filter(x => x && x.type && x.standing),
      ...(d.baseAc && Number(d.baseAc.base) ? { baseAc: { ...d.baseAc } } : {}),
      // Stored as typed rather than as parsed, so a half-finished paste is not lost; the row only
      // renders it as a link once it really is one.
      vault: d.vault };
    if (isNew) mutate(s => { s.carried = [...(s.carried || []), item]; });
    else if (slotId) mutate(s => { s.equipment = { ...(s.equipment || {}), [slotId]: item }; });
    else mutate(s => { s.carried = (s.carried || []).map((x, i) => (i === found.index ? item : x)); });
    writeImported(item.name, d.newFeatures, d.newAttacks);
    d.newFeatures = []; d.newAttacks = [];
    if (keepOpen) draw(); else closeDialog();
  };

  draw();
}

// ── the vault ───────────────────────────────────────────────────────────
// Every item in this campaign already has an Obsidian note. These three functions are the bridge:
// `vault.js` reads the note and hands back sheet records; this decides what happens to them.
//
// Only a link that parses is offered as one. The field itself accepts anything — losing a paste
// half-way through typing it would be worse than a dead button — but nothing unparseable is ever
// rendered as an anchor.
const vaultHref = v => { try { return vault.parseVaultLink(v).page; } catch { return ""; } };

// What a read brings back, folded into an open item dialog. Two things the note is NOT allowed to
// decide, because they are facts about this character rather than about the item: whether they have
// spent an attunement slot on it, and how many charges they have already burned at the table.
function applyImport(d, entry, note) {
  const it = entry.item;
  Object.assign(d, {
    name: it.name, qty: it.qty, weight: it.weight, value: it.value, notes: it.notes,
    magical: it.magical, requiresAttunement: it.requiresAttunement, dream: it.dream,
    effects: it.effects, defences: it.defences || [], baseAc: it.baseAc || null,
    vault: it.vault || note.page,
    newFeatures: entry.features, newAttacks: entry.attacks, warnings: entry.warnings,
  });
  d.attuned = d.attuned || it.attuned;
  d.charges = it.charges
    ? { ...it.charges, used: Math.min(d.charges?.used || 0, it.charges.max) }
    : { max: 0, used: 0, recharge: "manual", regain: "all" };
}

// The features and attacks an imported item brings with it. Keyed on the item's name, so reading
// the same note a second time REPLACES its own rows rather than adding a second Dawnbreak — which
// is the whole reason a re-read is safe after Juan rewrites an entry.
function writeImported(name, features = [], attacks = []) {
  if (!features.length && !attacks.length) return;
  const fp = vault.featurePrefix(name), ap = vault.attackPrefix(name);
  mutate(s => {
    if (features.length)
      s.features = [...(s.features || []).filter(f => !String(f?.id || "").startsWith(fp)), ...features];
    if (attacks.length)
      s.attacks = [...(s.attacks || []).filter(a => !String(a?.id || "").startsWith(ap)), ...attacks];
  });
}

// Reading an item in from scratch. The item dialog can do this too, but somebody who has just been
// handed a sword has no item to open yet — so this is their door: paste the link, read what the
// note actually says, then put it in the pack or straight into its slot.
function vaultDialog() {
  let found = null;      // { note, entries } once a note has answered
  let chosen = 0;

  const flagsOf = it => ITEM_FLAGS.filter(f => it[f.id]).map(f => f.short).join(" · ");

  const previewHtml = e => {
    const slot = e.slot ? rules.SLOT_BY_ID[e.slot] : null;
    const flags = flagsOf(e.item);
    const c = e.item.charges;
    return `<h4 class="vprev-n">${esc(e.item.name)}</h4>
      ${e.item.notes ? `<p class="cmp-body">${esc(e.item.notes)}</p>` : ""}
      <ul class="why">
        <li><span>Goes</span><b>${esc(slot ? slot.name : "in the pack")}</b></li>
        <li><span>Weight</span><b>${e.item.weight || 0} lb</b></li>
        ${e.item.value ? `<li><span>Value</span><b>${e.item.value} gp</b></li>` : ""}
        ${e.item.qty > 1 ? `<li><span>How many</span><b>${e.item.qty}</b></li>` : ""}
        ${c ? `<li><span>Charges</span><b>${c.max} · ${esc(rules.RECHARGE_BY_ID[c.recharge].label.toLowerCase())}</b></li>` : ""}
        ${flags ? `<li><span>It is</span><b>${esc(flags)}</b></li>` : ""}
        ${e.item.dream ? `<li><span>In the dream</span>
          <b title="${esc(rules.DREAM_BY_ID[e.item.dream].hint)}">${esc(rules.DREAM_BY_ID[e.item.dream].name)}</b></li>` : ""}
      </ul>
      ${e.item.effects.length ? `<div class="zone-h sm"><h4>What it does to your numbers</h4></div>
        <ul class="why">${e.item.effects.map(x => `<li><span>${esc(targetLabel(x.target))}</span>
          <b>${sign(rules.modifierAmount(ch(), x))}${x.from ? ` ${esc(rules.derivationShort(x))}` : ""}</b></li>`).join("")}</ul>` : ""}
      ${e.features.length ? `<div class="zone-h sm"><h4>Features it adds</h4></div>
        ${e.features.map(f => `<p class="cmp-t"><b>${esc(f.name)}</b>${
          f.uses && typeof f.uses === "object"
            ? ` <span class="tag">uses = ${esc(rules.derivationLabel(f.uses))}</span>`
            : f.uses ? ` <span class="tag">${f.uses} uses</span>` : ""}${
          f.dc ? ` <span class="tag dc">DC ${f.dc}</span>` : ""} ${esc(f.text)}</p>`).join("")}` : ""}
      ${e.attacks.length ? `<div class="zone-h sm"><h4>Attacks it adds</h4></div>
        <ul class="why">${e.attacks.map(a => `<li><span>${esc(a.name)}</span>
          <b>${esc(a.damage)}${a.type ? ` ${esc(a.type)}` : ""} · ${sign(a.bonus)} to hit</b></li>`).join("")}</ul>` : ""}
      ${e.warnings.length ? `<p class="hint hot">${e.warnings.map(esc).join(" ")}</p>` : ""}
      ${!e.features.length && !e.item.effects.length && !e.attacks.length
        ? `<p class="hint">The block carries no effects, features or attacks — just the item itself.</p>` : ""}`;
  };

  // Putting it on the sheet. Whatever was in the slot goes to the pack, exactly as equipping by
  // hand does, so an import can never make an item disappear.
  const add = slotId => {
    const e = found.entries[chosen];
    const item = { id: uid(), ...e.item };
    mutate(s => {
      if (slotId) {
        const displaced = (s.equipment || {})[slotId];
        s.equipment = { ...(s.equipment || {}), [slotId]: item };
        if (displaced?.name) s.carried = [...(s.carried || []), displaced];
      } else {
        s.carried = [...(s.carried || []), item];
      }
    });
    writeImported(item.name, e.features, e.attacks);
    closeDialog();
    const extra = [
      e.features.length && `${e.features.length} feature${e.features.length > 1 ? "s" : ""}`,
      e.attacks.length && `${e.attacks.length} attack${e.attacks.length > 1 ? "s" : ""}`,
    ].filter(Boolean).join(" and ");
    toast(`${item.name} — ${slotId ? rules.SLOT_BY_ID[slotId].name : "in your pack"}${
      extra ? `, with ${extra}` : ""}.`);
  };

  const draw = (link = "") => {
    const e = found?.entries[chosen];
    const slot = e?.slot ? rules.SLOT_BY_ID[e.slot] : null;
    const dlg = dialog("From the vault", found ? `
        ${found.entries.length > 1 ? `<div class="list vpick">${found.entries.map((x, i) => `
          <button class="listrow ${i === chosen ? "on" : ""}" type="button" data-vpick="${i}">
            <b>${esc(x.item.name)}</b><span>${esc(x.item.notes || "")}</span></button>`).join("")}</div>
          <p class="hint">That note declares ${found.entries.length} items. One at a time.</p>` : ""}
        <div class="vprev">${previewHtml(e)}</div>`
      : `<form class="fields" id="vf">
          <label>The note's link<input class="txt" id="vfUrl" maxlength="500" value="${esc(link)}"
            autocomplete="off" spellcheck="false" required
            placeholder="https://publish.obsidian.md/once-upon-a-star/…"></label>
          <p class="hint">An item's page on <code>publish.obsidian.md/once-upon-a-star</code>, or
            just its path in the vault. The sheet reads the note's hidden <code>av-item</code>
            block — the page itself shows no such thing, in Obsidian or on the site.</p>
          <button class="btn pri" type="submit">${icon("vault")} Read the note</button>
        </form>`,
      { wide: !!found, footer: found ? [
        `<button class="btn sm pri" id="vfPack">Put it in the pack</button>`,
        slot ? `<button class="btn sm" id="vfSlot">Equip — ${esc(slot.name)}</button>` : "",
        `<span class="sp"></span>`,
        `<a class="btn sm" href="${esc(found.note.page)}" target="_blank"
           rel="noopener noreferrer">Open the page</a>`,
        `<button class="btn sm" id="vfBack">Another note</button>`,
      ].filter(Boolean).join("") : "" });

    const form = document.getElementById("vf");
    if (form) form.onsubmit = async ev => {
      ev.preventDefault();
      const url = document.getElementById("vfUrl").value.trim();
      const btn = form.querySelector(".btn.pri");
      btn.disabled = true; btn.textContent = "Reading…";
      try {
        found = await vault.readItemsFromNote(url);
        chosen = 0;
        draw();
      } catch (err) {
        // Redrawn with what was typed still in the field: the link is usually RIGHT and the note
        // merely has no block yet, so the next attempt is one click away rather than another paste.
        toast(err.message);
        draw(url);
      }
    };
    dlg.querySelectorAll("[data-vpick]").forEach(b =>
      b.onclick = () => { chosen = Number(b.dataset.vpick); draw(); });
    const on = (id, fn) => { const b = document.getElementById(id); if (b) b.onclick = fn; };
    on("vfPack", () => add(null));
    on("vfSlot", () => add(e.slot));
    on("vfBack", () => { const back = found.note.page; found = null; draw(back); });
  };

  draw();
}

// A named change with a reason and a duration. The reason is not optional dressing — it is the whole
// point of the feature: six weeks later a +2 nobody can explain is worse than no +2 at all.
function modifierDialog() {
  const c = ch();
  dialog("Add an effect", `<form class="fields" id="mf">
      <label>What it changes<select class="txt" id="mfT">${MOD_TARGETS.map(t =>
        `<option value="${esc(t.value)}">${esc(t.label)}</option>`).join("")}</select></label>
      <label>By how much<select class="txt" id="mfF">
          <option value="">a flat number</option>
          ${rules.DERIVE_FROM.map(d => `<option value="${d.id}">my ${esc(d.name)}</option>`).join("")}
        </select></label>
      <div class="fx2">
        <input class="txt" id="mfA" type="number" value="1" min="-30" max="30" required
          aria-label="How much">
        <select class="txt" id="mfX" hidden aria-label="How many times">${rules.DERIVE_TIMES.map(t =>
          `<option value="${t.value}" ${t.value === 1 ? "selected" : ""}>${
            esc(t.name ? `${t.name} it` : "just it")}</option>`).join("")}</select>
        <span class="fx2-n" id="mfNow"></span>
      </div>
      <label>Why<input class="txt" id="mfR" maxlength="80" required placeholder="Shield of Faith, Bless, a curse…"></label>
      <label>For how long<select class="txt" id="mfD">
          <option value="">Until I remove it</option>
          <option value="1">1 round</option><option value="2">2 rounds</option>
          <option value="3">3 rounds</option><option value="10" selected>10 rounds (1 minute)</option>
          <option value="100">100 rounds (10 minutes)</option>
        </select></label>
      <button class="btn pri" type="submit">Add</button></form>
    <p class="hint">Your base scores are never changed — removing an effect puts everything back.
      Timed effects count down when you confirm a round.</p>
    <p class="hint" id="mfWhy">A derived amount is worked out <b>every time the number is read</b>,
      so it follows the score behind it — raise the Charisma it leans on, or gain a level, and it
      moves on its own. Halves round down. It is measured against your scores as they stand, minus
      any other derived effect.</p>`);

  const from = document.getElementById("mfF");
  const flat = document.getElementById("mfA");
  const times = document.getElementById("mfX");
  const now = document.getElementById("mfNow");
  const why = document.getElementById("mfWhy");
  // What it is worth RIGHT NOW, beside the control that decides it — a derived amount is the one
  // kind of effect you cannot check by reading it back.
  const draw = () => {
    const derived = !!from.value;
    flat.hidden = derived;
    flat.required = !derived;
    times.hidden = !derived;
    why.hidden = !derived;
    now.textContent = derived
      ? `= ${sign(rules.modifierAmount(c, { from: from.value, times: Number(times.value) }))} right now`
      : "";
  };
  draw();
  from.onchange = draw;
  times.onchange = draw;

  document.getElementById("mf").onsubmit = ev => {
    ev.preventDefault();
    const reason = document.getElementById("mfR").value.trim();
    const derived = from.value;
    const amount = derived ? 0 : Number(flat.value) || 0;
    if (!reason || (!derived && !amount)) return toast("An effect needs an amount and a reason.");
    const rounds = document.getElementById("mfD").value ? Number(document.getElementById("mfD").value) : null;
    const m = { id: uid(), target: document.getElementById("mfT").value, amount, reason, rounds,
      active: true, ...(derived ? { from: derived, times: Number(times.value) || 1 } : {}) };
    closeDialog();
    mutate(s => { s.modifiers = [...(s.modifiers || []), m]; });
    toast(`${sign(rules.modifierAmount(ch(), m))} ${targetLabel(m.target)} — ${reason}${
      derived ? ` (${rules.derivationLabel(m)})` : ""}`);
  };
}

// ── taking what a seal offered ──────────────────────────────────────────
// Healing and temporary hit points are the two kinds that are NOT merged from outside the sheet:
// they are one-time, so they land in the player's own JSON, written by the player's own client.
//
// The roll happens here rather than on the server for the reason every roll in this tool happens
// here: a number that arrived already decided is a number nobody at the table saw.
function applyOffer(id) {
  const g = state.effects.find(e => e.id === id);
  if (!g) return;
  const r = rollDice(g.payload?.dice || "");
  if (!r) return toast("That one does not say how much.");
  const c = ch();

  if (g.kind === "heal") {
    const before = c.hp;
    const after = Math.min(rules.maxHp(c), before + r.total);
    mutate(s => {
      s.hp = after;
      // Coming back from zero clears the death saves, the same as every other way back does.
      if (before <= 0 && after > 0) clearDeathSaves(s);
    });
    store.applyGrant(id, `${r.total} healed`).catch(err => toast(err.message));
    dialog(`${g.label} — healing`, rollHtml(r, { label: "healed" }) +
      `<p class="hint">${esc(g.player || "A seal")} healed you for <b>${r.total}</b> —
        ${before} → <b>${after}</b>${after === rules.maxHp(c) ? " (full)" : ""}.</p>`);
    return;
  }

  // 5e: temporary hit points REPLACE rather than stack, and taking fewer than you have would be
  // strictly worse — so the sheet says so instead of quietly doing it.
  const have = Number(c.tempHp) || 0;
  if (r.total <= have) {
    store.applyGrant(id, `${r.total} declined — had ${have}`).catch(err => toast(err.message));
    return dialog(`${g.label} — temporary HP`, rollHtml(r, { label: "rolled" }) +
      `<p class="hint">You already have <b>${have}</b> temporary hit points, and temporary hit
        points replace rather than stack — so this one changes nothing. It has been marked spent.</p>`);
  }
  mutate(s => { s.tempHp = r.total; });
  store.applyGrant(id, `${r.total} temp HP`).catch(err => toast(err.message));
  dialog(`${g.label} — temporary HP`, rollHtml(r, { label: "temporary HP" }) +
    `<p class="hint">${esc(g.player || "A seal")} gave you <b>${r.total}</b> temporary hit points${
      have ? `, replacing the ${have} you had` : ""}.</p>`);
}

// ── hit dice ────────────────────────────────────────────────────────────
// Spending one is the same job in two places — the tile's popover, and the short rest — so the rows,
// the roll and the note are written once and each caller wires its own buttons. The pool itself is
// the string on the sheet; only what is SPENT is tracked, which is why a hand-typed pool works.
//
// It is not only a short-rest gesture in this campaign: Quick Action.md lists "regain hit points by
// expending 1 Hit Dice" among what a Quick Action buys, so the popover has to be able to do it in
// the middle of a fight.
function hitDiceRows(c) {
  const hd = rules.hitDiceState(c);
  if (!hd.total) return `<p class="hint">No pool yet — take a class and it fills itself in, or set it
    in Character › Identity.</p>`;
  return hd.rows.map(r => {
    let pips = "";
    for (let i = 0; i < r.n; i++)
      pips += `<button class="pip ${i < r.used ? "used" : ""}" data-hd-pip="${r.die}" data-i="${i}"
        title="${i < r.used ? "Spent — click to hand it back" : "Click to spend it"}"
        aria-label="d${r.die} ${i + 1} of ${r.n}"></button>`;
    return `<div class="slotrow"><i>d${r.die}</i><div class="pips">${pips}</div>
      <button class="btn sm ${r.left ? "pri" : ""}" data-hd-spend="${r.die}" ${r.left ? "" : "disabled"}
        title="Roll a d${r.die} and add your Constitution modifier">Spend</button></div>`;
  }).join("");
}

// Rolling is the interface's job; the engine is handed the face that came up. Returns the outcome so
// the caller can show it, or null when there was nothing of that size left to spend.
function spendOneHitDie(die) {
  const r = rollDice(`1d${die}`);
  const out = rules.spendHitDie(ch(), die, Number(r?.total) || 0);
  if (!out) { toast(`No d${die} left to spend.`); return null; }
  mutate(s => { s.hitDiceUsed = out.hitDiceUsed; s.hp = out.hp; if (out.revived) clearDeathSaves(s); });
  return out;
}

const hitDieNote = out => !out ? "" : `<div class="hd-roll">
  <b>${out.healed}</b> hit point${out.healed === 1 ? "" : "s"}
  <span>d${out.die} rolled ${out.roll}${out.con ? ` ${sign(out.con)} Constitution` : ""}${
    out.healed < out.regained ? ` · ${out.regained} rolled, and you were near your maximum` : ""}</span></div>`;

// Wires one rendered block of rows, wherever it is: the popover, or the short rest.
function wireHitDice(root, after) {
  root.querySelectorAll("[data-hd-spend]").forEach(b => b.onclick = () => {
    after(spendOneHitDie(Number(b.dataset.hdSpend)));
  });
  root.querySelectorAll("[data-hd-pip]").forEach(b => b.onclick = () => {
    const die = Number(b.dataset.hdPip);
    const used = rules.hitDiceState(ch()).rows.find(r => r.die === die)?.used || 0;
    if (Number(b.dataset.i) >= used) return after(spendOneHitDie(die));
    const back = rules.returnHitDie(ch(), die);
    if (back) mutate(s => { s.hitDiceUsed = back; });
    after(null);
  });
}

function hitDicePop(el, note = "", reopen = false) {
  // Opening the pinned pop again with the same key is how popAt toggles it SHUT, which is what the
  // tile wants and the exact opposite of what a spend wants — so a redraw closes it first.
  if (reopen) closePop(true);
  const c = ch();
  const hd = rules.hitDiceState(c);
  const con = rules.abilityModifier(c, "con");
  const p = popAt(el, `<div class="pop-h"><b>Hit dice</b><span class="tag">${hd.left}/${hd.total}</span></div>
    <div class="pop-b">
      ${hitDiceRows(c)}
      ${note}
      ${hd.total ? `<p class="hint">Spending one rolls the die and adds your Constitution modifier
        (${sign(con)}). A short rest is the usual place — <b>a Quick Action can also spend one</b>
        mid-fight. A long rest hands back half your pool, rounded down.</p>
        <p class="hint">Click a spent pip to hand it back.</p>` : ""}</div>`,
    { pin: true, key: "hd" });
  if (!p) return;                 // clicking the tile again closed it, and popAt returned nothing

  // Spending redraws the sheet, which replaces the tile this was anchored to — so the popover is
  // re-opened over the new one, carrying the roll it just made.
  wireHitDice(p, out => {
    const tile = document.querySelector('[data-act="hit-dice"]');
    if (tile) hitDicePop(tile, hitDieNote(out), true);
  });
}

// A rest shows what it will change before it changes anything, and asks the one question that
// decides whether Dream Exhaustion recovers at all.
function restDialog(kind) {
  const safeHaven = kind === "haven";
  const real = kind === "short" ? "short" : "long";
  const draw = (o = { dreamWalked: false, dawn: true, dusk: false }, note = "") => {
    const c = ch();
    const { dreamWalked, dawn, dusk } = o;
    const p = rules.restPreview(c, { kind: real, dreamWalked, safeHaven, dawn, dusk });
    const hp = `${c.hp}/${rules.maxHp(c)}`;
    const d = dialog(safeHaven ? "Safe Haven long rest" : real === "short" ? "Short rest" : "Long rest",
      `${real === "long" ? `<div class="tgls">
          ${toggleHtml(`data-tgl="dreamWalked"`, dreamWalked, "dreamWalk", "I was Dream Walking during this rest")}
          ${toggleHtml(`data-tgl="dawn"`, dawn, "dawn", "It carried us through dawn")}
          ${toggleHtml(`data-tgl="dusk"`, dusk, "dusk", "And through dusk")}
          <span class="hint">${[dreamWalked ? "Dream Walking" : "", dawn ? "through dawn" : "",
            dusk ? "through dusk" : ""].filter(Boolean).join(" · ") || "an ordinary rest, passing neither"}</span>
        </div>` : ""}
        ${p.changes.length ? `<ul class="why">` + p.changes.map(c2 => `<li>
            <span>${esc(c2.label)}${c2.detail ? ` — ${esc(c2.detail)}` : ""}</span>
            <b>${c2.from != null ? `${c2.from} → ${c2.to}` : ""}</b></li>`).join("") + `</ul>`
          : `<p class="hint">Nothing automatic changes on this one.</p>`}
        ${real === "short" ? `<div class="hd-block">
            <div class="zone-h sm"><h4>Hit dice · ${esc(hp)} hit points</h4></div>
            ${hitDiceRows(c)}
            ${note}
          </div>` : ""}
        <p class="hint">${real === "long"
          ? "A long rest only lowers Dream Exhaustion if you did <b>not</b> Dream Walk."
          : "Each one rolls its die and adds your Constitution modifier, and lands on your hit points as you go — spend as few or as many as you like. Nothing here guesses at a feature's own rule."}</p>`,
      { footer: `<button class="btn pri" id="rOk">Take the rest</button>
          <span class="sp"></span><button class="btn sm" data-act="dlg-close">Not yet</button>` });

    d.querySelectorAll("[data-tgl]").forEach(b => b.onclick = () =>
      draw({ ...o, [b.dataset.tgl]: !o[b.dataset.tgl] }));
    // Spending is applied immediately, not on confirmation: a die you rolled is a die you spent, and
    // "Not yet" should never take back hit points you have already written down.
    wireHitDice(d, out => draw(o, hitDieNote(out)));

    document.getElementById("rOk").onclick = () => {
      closeDialog();
      // Recomputed here rather than reused: hit dice may have been spent since this was drawn, and
      // the dice-regain charges are rolled at this moment because a preview must not pretend to
      // know what they will come up.
      const now = rules.restPreview(ch(), { kind: real, dreamWalked, safeHaven, dawn, dusk });
      const rolled = (now.roll || []).map(r => {
        const got = rollDice(r.regain);
        return { where: r.where, name: r.name, regain: r.regain,
          by: Math.min(r.used, Math.max(0, Number(got?.total) || 0)), total: got?.total };
      });
      mutate(s => {
        Object.assign(s, now.next);
        if (rolled.length) Object.assign(s, rules.applyRecharge(ch(), rolled));
        s.used = {};
      });
      toast(rolled.length
        ? `Rested. ${rolled.map(r => `${r.name} ${r.regain} → ${r.by}`).join(", ")}.`
        : now.changes.length ? "Rested." : "Rested — nothing automatic to change.");
    };
  };
  draw();
}

// ── one spell ───────────────────────────────────────────────────────────
// Writing one entry of the spellbook, wherever it is in the list — the same idiom `writeItem` uses
// for equipment, so a change to a spell is one call rather than a spread in four places.
const writeSpell = (id, fn) => mutate(s => {
  s.spells = { ...(s.spells || {}) };
  s.spells.book = (s.spells.book || []).map(x => (x.id === id ? fn(x) : x));
});
const setStanding = (id, standing) => writeSpell(id, x => ({ ...x, standing }));

// A spell's damage, which the sheet only knows because somebody told it. The catalogue cannot:
// Fight Club's `<roll>` element would have carried it and not one of the 317 SRD spells ships with
// it, so the alternative to asking is reading the text and guessing which `8d6` is damage and which
// is healing. The dice already scraped out of the text are offered as one click each — assistance,
// not a guess — and the answer is kept on the character's own spellbook entry.
//
// Once it is set, THIS is the roll a `spellDamage` modifier reaches, and the loose "dice in its
// text" buttons below it stay what they always were: raw dice, nothing added.
function spellDamageRow(s, dice) {
  const dmg = rules.spellDamageOf(s);
  const bonus = rules.spellDamageBonus(ch());
  if (dmg) return `<div class="spl-dmg">
      <button class="btn pri" data-sp-dmg="0">${icon("damage")} Roll damage · ${esc(dmg)}${
        bonus ? ` ${sign(bonus)}` : ""}${s.damageType ? ` ${esc(s.damageType)}` : ""}</button>
      <button class="btn sm" data-sp-dmg="1" title="Doubles the dice, not the modifier">crit</button>
      <button class="btn sm" data-sp-dmg-clear="1" title="Forget what its damage is">Clear</button>
    </div>`;
  return `<div class="spl-dmg set">
      <span class="hint">${dice.length
        ? "Which of these is its <b>damage</b>? Say once, and this spell gains a damage roll that your spell damage bonuses reach."
        : "No dice in its text. Type its damage and this spell gains a damage roll."}</span>
      ${dice.map(d => `<button class="btn sm" data-sp-dmg-pick="${esc(d)}">${esc(d)}</button>`).join("")}
      <input class="txt sm" id="spDmgX" maxlength="40" placeholder="or type 8d6" autocomplete="off">
      <input class="txt sm" id="spDmgT" maxlength="24" placeholder="fire" autocomplete="off"
        value="${esc(s.damageType || "")}" aria-label="Damage type">
      <button class="btn sm" data-sp-dmg-pick="">Set</button>
    </div>`;
}

function rollSpellDamage(s, crit) {
  const r = rollDice(rules.spellDamageOf(s), { crit });
  if (!r) return toast("That is not a dice expression.");
  const parts = rules.contributions(rules.activeModifiers(ch()), "spellDamage");
  const extra = rules.spellDamageBonus(ch());
  dialog(`${s.name} — damage${crit ? " (critical)" : ""}`,
    rollHtml({ ...r, total: r.total + extra }, { label: s.damageType || "", breakdown: parts }) +
    (crit ? `<p class="hint">The dice are doubled; the flat modifier is not.</p>` : ""));
}

// Read it and cast it, in one place. The sheet stores a spell's compact fields and not its prose, so
// the rules text is fetched from the catalogue when the spell is opened — which means a spell whose
// entry the DM has since changed reads as it reads TODAY, and one whose entry is gone still casts.
async function spellDialog(id) {
  const open = () => (ch().spells?.book || []).find(x => x.id === id);
  if (!open()) return toast("That spell is not in your spells any more.");

  let full = null, loaded = false;
  const draw = () => {
    const s = open();
    if (!s) return closeDialog();
    const lv = rules.spellLevel(s);
    const standing = rules.spellStanding(s);
    const conc = rules.spellIsConcentration(s);
    const ritual = rules.spellIsRitual(s);
    const options = rules.castingOptions(ch(), lv);
    const casting = state.classPlan ? rules.spellcasting(ch(), state.classPlan) : [];
    const dice = rules.diceInText(full?.text);

    const facts = [["Level", lv ? lv : "Cantrip"], ["School", s.school], ["Casting time", s.time],
      ["Range", s.range], ["Components", s.components], ["Duration", s.duration],
      ["Classes", s.classes], ["Ritual", ritual ? "yes" : ""], ["Source", s.source]]
      .filter(([, v]) => v !== "" && v != null);

    dialog(s.name, `
        <ul class="why">${facts.map(([k, v]) => `<li><span>${esc(k)}</span><b>${esc(v)}</b></li>`).join("")}</ul>

        <div class="spl-stand">${rules.SPELL_STANDINGS.map(st => `
          <button class="btn sm ${st.id === standing ? "pri" : ""}" data-sp-stand="${st.id}"
            title="${esc(st.hint)}">${esc(st.label)}</button>`).join("")}</div>

        ${lv === 0
          ? `<p class="hint">A cantrip costs nothing — cast it as often as you like.</p>`
          : standing === "known"
            ? `<p class="hint hot">Not prepared. Prepare it above, or cast it anyway if your DM says so
                — the buttons below will still spend the slot.</p>`
            : ""}

        <div class="spl-cast">
          ${lv === 0
            ? `<button class="btn pri" data-sp-cast="0">Cast it</button>`
            : options.length
              ? options.map(o => `<button class="btn ${o.level === lv ? "pri" : ""}" data-sp-cast="${o.level}"
                  ${o.left ? "" : "disabled"} title="${o.left ? esc(`Spends one level ${o.level} slot`) : "None left"}">
                  ${o.level === lv ? "Cast" : `Upcast to ${o.level}`} · ${o.left}/${o.max}</button>`).join("")
              : `<p class="hint">You have no slot of level ${lv} or higher. Set your slots on the Spells tab.</p>`}
          ${ritual ? `<button class="btn sm" data-sp-cast="ritual"
            title="Ten minutes longer, and no slot spent">As a ritual</button>` : ""}
        </div>

        ${casting.length ? `<div class="stats">${casting.map(c => `
          <button class="stat btn-stat" data-sp-atk="${esc(c.ability)}" title="Roll a ${esc(c.className)} spell attack">
            <b>${sign(c.attack)}</b><i>${esc(c.className)} attack</i></button>
          <div class="stat"><b>${c.dc}</b><i>${esc(c.className)} save DC</i></div>`).join("")}</div>` : ""}

        ${spellDamageRow(s, dice)}

        ${dice.length ? `<div class="spl-dice"><span class="hint">Dice in its text</span>
          ${dice.map(d => `<button class="btn sm" data-sp-roll="${esc(d)}">${esc(d)}</button>`).join("")}
          <span class="hint">Rolled as they are — no modifier of yours is added to these.</span>
          </div>` : ""}

        ${conc ? `<p class="hint">${ch().concentrating === s.name
            ? "You are concentrating on this."
            : "Casting it takes your concentration, and the sheet will say so on the bar."}</p>` : ""}

        ${full?.text ? `<p class="cmp-body">${esc(full.text)}</p>`
          : loaded ? `<p class="hint">The catalogue has no text for this one any more — it still casts.</p>`
          : `<p class="hint">Reading its text…</p>`}`,
      { wide: true,
        footer: `<button class="btn sm warn" data-sp-del="1">Remove from my spells</button>
          <span class="sp"></span><button class="btn sm" data-act="dlg-close">Close</button>` });

    const d = document.getElementById("dlg");
    d.querySelectorAll("[data-sp-stand]").forEach(b => b.onclick = () => {
      setStanding(id, b.dataset.spStand); draw();
    });
    d.querySelectorAll("[data-sp-atk]").forEach(b => b.onclick = () => {
      const a = b.dataset.spAtk;
      // The breakdown carries whatever is lifting it, by name — the same courtesy a weapon attack
      // gets. Without this, a tome's +4 would just make the number four bigger than the two terms
      // beside it, which is how a player stops trusting the sheet.
      showRoll(`${s.name} — spell attack`, rules.spellAttackBonus(ch(), a),
        [{ reason: `Proficiency`, amount: rules.proficiencyBonus(ch().level) },
         { reason: rules.ABILITY_NAME[a], amount: rules.abilityModifier(ch(), a) },
         ...rules.contributions(rules.activeModifiers(ch()), "spellAttack")],
        { scopes: rules.ADVANTAGE_SCOPES.spellAttack() });
    });
    d.querySelectorAll("[data-sp-roll]").forEach(b => b.onclick = () => {
      const r = rollDice(b.dataset.spRoll);
      if (r) dialog(`${s.name} — ${b.dataset.spRoll}`, rollHtml(r, { label: "from its text" }));
    });
    // Saying which dice are its damage, and of what type. A picked button fills the expression; the
    // bare Set button takes whatever was typed. Either way the type field comes along.
    d.querySelectorAll("[data-sp-dmg-pick]").forEach(b => b.onclick = () => {
      const typed = document.getElementById("spDmgX")?.value.trim() || "";
      const damage = b.dataset.spDmgPick || typed;
      if (!damage) return toast("Pick one of its dice, or type the expression.");
      if (!parseDice(damage)) return toast(`"${damage}" is not a dice expression.`);
      const damageType = document.getElementById("spDmgT")?.value.trim() || "";
      writeSpell(id, sp => ({ ...sp, damage, damageType }));
      draw();
    });
    d.querySelectorAll("[data-sp-dmg]").forEach(b => b.onclick = () => rollSpellDamage(open(), b.dataset.spDmg === "1"));
    d.querySelectorAll("[data-sp-dmg-clear]").forEach(b => b.onclick = () => {
      writeSpell(id, sp => ({ ...sp, damage: "", damageType: "" }));
      draw();
    });
    d.querySelectorAll("[data-sp-cast]").forEach(b => b.onclick = () => castSpell(s, b.dataset.spCast));
    d.querySelector("[data-sp-del]").onclick = () => {
      closeDialog();
      mutate(st => {
        st.spells = { ...(st.spells || {}) };
        st.spells.book = (st.spells.book || []).filter(x => x.id !== id);
      });
      toast(`${s.name} removed.`);
    };
  };

  draw();
  try { full = await compendium.find("spell", open()?.name); } catch { full = null; }
  loaded = true;
  if (document.getElementById("dlg")?.open) draw();
}

// Casting spends exactly one thing and says what it spent. A ritual spends nothing, a cantrip spends
// nothing, and a levelled spell spends the slot the player picked — which is all upcasting is.
function castSpell(s, at) {
  const conc = rules.spellIsConcentration(s);
  const take = () => { if (conc) mutate(st => { st.concentrating = s.name; }); };

  if (at === "ritual") { take(); closeDialog(); return toast(`${s.name} cast as a ritual — no slot spent.`); }
  const level = Number(at) || 0;
  if (!level) { take(); closeDialog(); return toast(`${s.name} cast.`); }

  const next = rules.spendSlot(ch(), level);
  if (!next) return toast(`No level ${level} slot left.`);
  mutate(st => { st.spells = next; });
  take();
  closeDialog();
  toast(`${s.name} cast${level !== rules.spellLevel(s) ? ` at level ${level}` : ""} — one level ${level} slot spent.${conc ? " Concentrating." : ""}`);
}

// Two d20, keep the face farthest from 10, reroll an equal pair. The charge is spent on the server,
// once, and the dice are shown as they fell so the table can see the tie that was rerolled.
function emphasisDialog() {
  const c = state.current;
  if (!c.fate) return toast("You have no Fate to spend. Only your DM can grant it.");
  dialog("Rolling with Emphasis", `
      <p>You have <b>${c.fate}</b> use${c.fate === 1 ? "" : "s"}. Spending one rerolls the roll that just
        happened, and the new result replaces what happened — your DM narrates the change.</p>
      <label class="ck-col">What is being rerolled
        <input class="txt" id="emWhat" maxlength="80" placeholder="the death save, Khaled's attack…" autocomplete="off"></label>
      <label class="ck-col">What it originally rolled
        <input class="txt" id="emRoll" type="number" min="1" max="20" placeholder="optional"></label>
      <div id="emOut"></div>`, {
    footer: `<button class="btn pri" id="emGo">Spend one and roll</button>
      <span class="sp"></span><button class="btn sm" data-act="dlg-close">Keep it</button>`,
  });

  document.getElementById("emGo").onclick = async () => {
    const btn = document.getElementById("emGo");
    btn.disabled = true;                       // one click, one charge
    const what = document.getElementById("emWhat").value.trim();
    const original = Number(document.getElementById("emRoll").value) || null;
    const r = rules.rollEmphasis();
    try {
      const out = await store.spendFate({
        emphasis: { pairs: r.pairs, pick: r.pick, rerolls: r.rerolls },
        original: { what, roll: original },
        note: what,
      });
      document.getElementById("emOut").innerHTML = `
        <div class="rollout"><div class="rolltotal"><b>${r.pick}</b><i>the natural die that stands</i></div></div>
        <ul class="why">${r.pairs.map((p, i) => `<li>
          <span>${p.tie ? "Equal distance from 10 — rerolled" : "Kept"}</span>
          <b>${p.dice[0]} and ${p.dice[1]}</b></li>`).join("")}</ul>
        <p class="hint">${out.repeated ? "That use was already spent — your balance is unchanged. " : ""}
          ${out.fate} use${out.fate === 1 ? "" : "s"} left. The original roll stays in your history, marked superseded.</p>`;
    } catch (err) {
      btn.disabled = false;
      document.getElementById("emOut").innerHTML = `<p class="hint hot">${esc(err.message)}</p>`;
    }
  };
}

// ── the choices a class offers ──────────────────────────────────────────
// Two kinds through one dialog, because they are the same gesture: a subclass is a pick-one from a
// list, a menu is a pick-n from a longer one. The subclass is the interesting one — it is asked
// exactly once, and every feature that archetype grants at every later level then arrives on its
// own, which is the whole point of deriving features instead of copying them in.
function choiceDialog(id, className) {
  const classes = (ch().classes || []).filter(c => c && c.name);
  const idx = classes.findIndex(c => c.name === className);
  if (idx < 0) return toast("That class is not on your sheet.");
  const entry = classes[idx];

  const isSub = id === "subclass";
  const choice = isSub
    ? (state.classPlan?.classes || []).find(p => p.className === className)
    : (state.classPlan?.choices || []).find(ct => ct.id === id && ct.className === className);
  const options = isSub ? (choice?.subclassOptions || []).map(s => ({ name: s.name, label: s.name, text: "" }))
    : choice?.options || [];
  if (!options.length) return toast("Nothing to choose there — the compendium has no options for it.");

  const want = isSub ? 1 : choice.pick;
  const taken = new Set(isSub ? (entry.subclass ? [entry.subclass] : []) : (choice.taken || []));

  // A Wizard is asked for an Arcane Tradition and a Cleric for a Divine Domain. The class's own word
  // for the choice is in its data; "subclass" is only the fallback for one that never says.
  const subLabel = (isSub && choice?.subclassLabel) || "subclass";

  const draw = () => {
    const over = want != null && taken.size > want;
    // Redrawing rebuilds the list, which would otherwise jump back to the top every time something
    // is ticked — and a Wizard choosing among twenty traditions ticks from the bottom of it.
    const scrolled = document.querySelector("#dlg .picklist")?.scrollTop || 0;
    dialog(isSub ? `${className} — ${subLabel}` : `${className} ${choice.level} — ${choice.label}`,
      `<p>${isSub
        ? `Choose the ${esc(subLabel.toLowerCase())} you are following. Every feature it grants — at this
           level and at every level after it — arrives on its own from here on, with nothing more to pick.`
        : want ? `Pick ${want}.` : `Pick what you have. Your class table says how many.`}</p>
      <div class="list picklist">${options.map(o => `
        <button class="listrow ${taken.has(o.name) ? "on" : ""}" data-pick="${esc(o.name)}">
          <b>${esc(o.label)}</b>${o.text ? `<span>${esc(o.text.slice(0, 180))}${o.text.length > 180 ? "…" : ""}</span>` : ""}
        </button>`).join("")}</div>
      ${over ? `<p class="hint hot">That is ${taken.size} of ${want}.</p>` : ""}`,
      { wide: true, footer: `<button class="btn pri" id="pkOk" ${over ? "disabled" : ""}>Confirm</button>
          <span class="sp"></span><button class="btn sm" data-act="dlg-close">Later</button>` });

    const list = document.querySelector("#dlg .picklist");
    if (list) list.scrollTop = scrolled;
    document.querySelectorAll("#dlg [data-pick]").forEach(b => b.onclick = () => {
      const name = b.dataset.pick;
      if (taken.has(name)) taken.delete(name);
      else { if (want === 1) taken.clear(); taken.add(name); }
      draw();
    });
    document.getElementById("pkOk").onclick = () => {
      if (!taken.size) return toast("Nothing picked.");
      closeDialog();
      const next = classes.map((c, n) => n !== idx ? c
        : isSub ? { ...c, subclass: [...taken][0] }
                : { ...c, picks: { ...(c.picks || {}), [id]: [...taken] } });
      compendium.syncClasses(next)
        .then(({ plan }) => {
          const left = plan.choices.length;
          toast(isSub
            ? `${[...taken][0]} — its features are on your sheet.${left ? ` ${left} choice${left > 1 ? "s" : ""} left.` : ""}`
            : `Recorded.${left ? ` ${left} choice${left > 1 ? "s" : ""} left.` : ""}`);
        })
        .catch(err => toast(err.message));
    };
  };
  draw();
}

// ── LEVEL UP ────────────────────────────────────────────────────────────
// One button, and everything that can be settled from the class data is settled: the features the
// level brings, the resources it widens, the spell slots, the proficiency bonus. What is genuinely a
// decision is asked here and nowhere else — which class takes the level when there is more than one,
// the ability score improvement when the class marks this level for one — and anything still open
// after it (a subclass, a menu) is listed so it is not a surprise later.
//
// Hit points are deliberately untouched: Juan's call. The HP dialog stays the place for them.
//
// The order of operations matters. The token is spent FIRST, because that is the gated,
// not-twice part and the server raises the level in the same statement; the sheet is written after,
// and can always be re-derived from the classes if that second step is interrupted.
async function levelUpDialog() {
  const u = store.pendingLevel();
  if (!u) return toast("Nothing is open. Only your DM can clear you for the next level.");

  dialog(`Level ${u.target_level}`, `<p class="hint">Reading your class…</p>`, { wide: true });
  let defs;
  try { defs = await compendium.classDefs(); }
  catch (err) { return void dialog(`Level ${u.target_level}`, `<p class="hint hot">${esc(err.message)}</p>`); }

  const existing = (ch().classes || []).filter(c => c && c.name);
  let taking = existing.length === 1 ? existing[0].name : "";
  let newName = "";
  const asi = {};

  const draw = () => {
    const p = rules.levelUpPlan(ch(), defs, { target: u.target_level, className: taking || newName });
    const sum = rules.STANDARD_ABILITIES.reduce((n, a) => n + (Number(asi[a]) || 0), 0);
    const blocked = p.needsClass || (p.asi && sum !== 2 && sum !== 0);

    dialog(`Level ${p.from} → ${p.to}`, `
      ${existing.length > 1 || !existing.length ? `<div class="lvl-sec">
          <h4>Which class takes it?</h4>
          <div class="chips">${existing.map(c => `
            <button class="chip ${taking === c.name ? "on" : ""}" data-take="${esc(c.name)}">
              ${esc(c.name)} <em>${c.level} → ${c.level + 1}</em></button>`).join("")}
            <button class="chip ${newName ? "on" : ""}" data-take="">A class I do not have yet</button></div>
          ${!taking ? `<label class="ck-col">Which one
            <input class="txt" id="lvNew" list="lvClasses" value="${esc(newName)}" autocomplete="off"
              placeholder="Pick from the compendium, or type your own">
            <datalist id="lvClasses">${Object.values(defs).map(d => `<option value="${esc(d.name)}">`).join("")}</datalist>
          </label>` : ""}
        </div>` : ""}

      ${p.className ? `<div class="lvl-sec">
          <h4>${esc(p.className)} ${(p.classes.find(c => c.name === p.className)?.level) || 1}${p.newClass ? " — a new class" : ""}</h4>
          <ul class="why">
            <li><span>Proficiency bonus</span><b>${sign(p.proficiency.from)}${p.proficiency.to !== p.proficiency.from ? ` → ${sign(p.proficiency.to)}` : ""}</b></li>
            <li><span>Hit dice</span><b>${esc(p.hitDice || "—")}</b></li>
            <li><span>Honor and Morality</span><b>+1 each to spend</b></li>
          </ul>
        </div>` : ""}

      ${p.newFeatures.length ? `<div class="lvl-sec">
          <h4>What it brings</h4>
          <div class="abl">${p.newFeatures.map(f => `
            <div class="ab3 open"><div class="ab3-h"><span class="nm">${esc(f.name)}</span>
              ${f.uses ? `<span class="tag">${f.uses} uses</span>` : ""}
              ${f.level ? `<span class="tag">Lv ${f.level}</span>` : ""}</div>
              <div class="ab3-b">${esc((f.text || "").slice(0, 400))}${(f.text || "").length > 400 ? "…" : ""}</div></div>`).join("")}</div>
        </div>` : p.className ? `<div class="lvl-sec"><h4>What it brings</h4>
          <p class="hint">No new feature at this level — the class table has none for it.</p></div>` : ""}

      ${p.asi ? `<div class="lvl-sec">
          <h4>Ability score improvement</h4>
          <p class="hint">Two points into one score, or one into each of two — and <b>not into Dream</b>,
            which only a campaign event raises. Leave them all at zero to take a feat instead and write
            it down yourself.</p>
          <div class="fields grid3">${rules.STANDARD_ABILITIES.map(a => `
            <label>${esc(rules.ABILITY_NAME[a])} <em>${ch().abilities[a]}</em>
              <input class="txt" type="number" id="lvAs${a}" value="${Number(asi[a]) || 0}" min="0" max="2"></label>`).join("")}</div>
          ${sum && sum !== 2 ? `<p class="hint hot">That is ${sum} point${sum === 1 ? "" : "s"}; an improvement is two.</p>` : ""}
        </div>` : ""}

      ${p.choices.length ? `<div class="lvl-sec">
          <h4>Still to choose after this</h4>
          <div class="chips">${p.choices.map(ct => `<span class="chip">${esc(ct.className)} ${ct.level} · ${esc(ct.label)}</span>`).join("")}</div>
          <p class="hint">Waiting on the Character tab. A subclass picked there brings all of its later
            features with it.</p>
        </div>` : ""}

      ${p.assigned !== p.to ? `<p class="hint hot">Your class levels would add up to ${p.assigned}, not ${p.to}.
        Fix the split on the Character tab afterwards.</p>` : ""}`,
      { wide: true, footer: `<button class="btn pri lvlup" id="lvGo" ${blocked ? "disabled" : ""}>
            ${icon("levelUp")} Take level ${p.to}</button>
          <span class="sp"></span><button class="btn sm" data-act="dlg-close">Not yet</button>` });

    document.querySelectorAll("#dlg [data-take]").forEach(b => b.onclick = () => {
      taking = b.dataset.take; if (taking) newName = ""; draw();
    });
    const nw = document.getElementById("lvNew");
    if (nw) {
      nw.oninput = () => { newName = nw.value.trim(); redrawFooterOnly(); };
      nw.onchange = () => { newName = nw.value.trim(); draw(); };
    }
    for (const a of rules.STANDARD_ABILITIES) {
      const el = document.getElementById(`lvAs${a}`);
      if (el) el.onchange = () => { asi[a] = Math.max(0, Math.min(2, Number(el.value) || 0)); draw(); };
    }
    document.getElementById("lvGo").onclick = () => commit();
  };

  // Typing a class name must not redraw the dialog on every keystroke — that would take the focus
  // out of the box being typed into. Only the button's state depends on it.
  const redrawFooterOnly = () => {
    const btn = document.getElementById("lvGo");
    if (btn) btn.disabled = !(taking || newName);
  };

  // The plan is worked out again here rather than taken from the dialog's closure: a class name
  // still being typed when the button is pressed has to be the one that gets the level.
  const commit = async () => {
    const btn = document.getElementById("lvGo");
    const p = rules.levelUpPlan(ch(), defs, { target: u.target_level, className: taking || newName });
    if (p.needsClass) return toast("Say which class takes the level.");
    btn.disabled = true;                           // one click, one level
    const picks = Object.fromEntries(rules.STANDARD_ABILITIES
      .map(a => [a, Number(asi[a]) || 0]).filter(([, v]) => v));
    const sum = Object.values(picks).reduce((n, v) => n + v, 0);
    try {
      await store.consumeUnlock(u.id, {
        name: `Level ${p.to}${p.className ? ` — ${p.className}` : ""}`,
        level: p.to, className: p.className, newClass: p.newClass,
        abilities: sum === 2 ? picks : undefined,
        features: p.newFeatures.map(f => f.name),
      });
    } catch (err) {
      btn.disabled = false;
      return toast(err.message);
    }
    // The level is granted. Now the sheet: the classes as the plan has them, the ability score
    // improvement in the same save, and the features derived from the result.
    try {
      await compendium.syncClasses(p.classes, s => {
        if (sum === 2) for (const [a, v] of Object.entries(picks)) s.abilities[a] = (Number(s.abilities[a]) || 0) + v;
      });
      closeDialog();
      state.view = "character";
      renderAll();
      toast(`Level ${p.to}.${p.newFeatures.length ? ` ${p.newFeatures.length} new feature${p.newFeatures.length > 1 ? "s" : ""}.` : ""}`
        + (p.choices.length ? ` ${p.choices.length} to choose.` : ""));
    } catch (err) {
      closeDialog();
      toast(`Level ${p.to} is yours, but the sheet did not save: ${err.message}`);
    }
  };

  draw();
}

function unlockDialog(id) {
  const u = store.openUnlocks().find(x => x.id === id);
  if (!u) return;
  const c = ch();
  const body = u.kind === "asi"
    ? `<p>An ability score improvement. Two points into one score, or one into each of two — and
         <b>not into Dream</b>, which only a campaign event raises.</p>
       <div class="fields grid3">${rules.STANDARD_ABILITIES.map(a => `
         <label>${esc(rules.ABILITY_NAME[a])}<input class="txt" type="number" id="as${a}" value="0" min="0" max="2"></label>`).join("")}</div>`
    : u.kind === "feat"
      ? `<p>A feat. Write down which one and what it gives you — it is kept with the unlock.</p>
         <label class="ck-col">Which feat<input class="txt" id="ukName" maxlength="60" autocomplete="off"></label>`
      : `<p>${esc(u.note || "A level")}. Fill in what it brought: hit points, a feature, a new choice.</p>
         <label class="ck-col">What you chose<input class="txt" id="ukName" maxlength="120" autocomplete="off"></label>`;

  dialog(u.kind === "asi" ? "Ability score improvement" : u.kind === "feat" ? "A feat" : "A level",
    body, { footer: `<button class="btn pri" id="ukOk">Confirm</button>
      <span class="sp"></span><button class="btn sm" data-act="dlg-close">Later</button>` });

  document.getElementById("ukOk").onclick = async () => {
    let choice = {};
    if (u.kind === "asi") {
      const picks = {};
      let sum = 0;
      for (const a of rules.STANDARD_ABILITIES) {
        const v = Number(document.getElementById(`as${a}`).value) || 0;
        if (v) { picks[a] = v; sum += v; }
      }
      if (sum !== 2) return toast("An improvement is two points in total.");
      choice = { abilities: picks };
      mutate(s => { for (const [a, v] of Object.entries(picks)) s.abilities[a] = (Number(s.abilities[a]) || 0) + v; });
    } else {
      const name = document.getElementById("ukName").value.trim();
      if (!name) return toast("Write down what you chose.");
      choice = { name };
      if (u.kind === "feat")
        mutate(s => { s.features = [...(s.features || []), { id: uid(), name, source: "feat", text: "" }]; });
    }
    try {
      await store.consumeUnlock(u.id, choice);
      closeDialog();
      toast("Recorded.");
    } catch (err) { toast(err.message); }
  };
}

function describeEvent(e) {
  const d = e.detail || {};
  switch (e.action) {
    case "character.created": return "Character created";
    case "level.set": return `Level ${d.from} → ${d.to}`;
    case "dream.set": return `Dream score ${d.from} → ${d.to}`;
    case "fate.granted": return `Fate ${d.from} → ${d.to}`;
    case "fate.spent": return `Fate spent — kept a ${d.emphasis?.pick ?? "?"}${d.original?.what ? ` on ${d.original.what}` : ""}`;
    case "axis.allocated": return `Allocated a point to ${d.axis}`;
    case "unlock.granted": return `${d.kind === "asi" ? "An ability score improvement" : d.kind === "feat" ? "A feat" : "A level"} opened`;
    case "unlock.consumed": return `Chose ${d.choice?.name || Object.keys(d.choice?.abilities || {}).join(", ") || "an advancement"}`;
    case "character.archived": return "Archived";
    case "character.restored": return "Restored";
    default: return e.action;
  }
}
