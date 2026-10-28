// The sheet's controller: boot it, and turn a click into a change.
//
// One listener for the whole page. Every control in view.js carries a `data-act`, and the table
// below says what each one does — so there are no inline handlers (this is a module, they would not
// be in scope) and no per-element listeners to re-attach on every redraw.

import * as rules from "./rules.js";
import * as store from "./store.js";
import { state, derived, mutate } from "./store.js";
import { renderAll, targetLabel, MOD_TARGETS, ACCENTS, PORTRAITS, portraitUrl, ACTION_COST,
  toggleHtml, TAB_ORDER } from "./view.js";
import * as compendium from "./compendium.js";
import * as ephemer from "./ephemer.js";
import { esc, sign, toast, popAt, closePop, popKey, popContains, dialog, closeDialog,
  rollCheck, rollDice, rollHtml, parseDice } from "./pop.js";
import { icon } from "./icons.js";

const ch = () => derived();
const uid = () => Math.random().toString(36).slice(2, 10);

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
function showRoll(label, modifier, breakdown) {
  const draw = opts => {
    const r = rollCheck(modifier, opts);
    const d = dialog(label, rollHtml(r, { label, breakdown }), {
      footer: `<button class="btn sm" data-reroll="adv">Advantage</button>
        <button class="btn sm" data-reroll="dis">Disadvantage</button>
        <span class="sp"></span><button class="btn sm pri" data-reroll="again">Roll again</button>`,
    });
    d.querySelectorAll("[data-reroll]").forEach(b => b.onclick = () => {
      const k = b.dataset.reroll;
      draw(k === "adv" ? { advantage: true } : k === "dis" ? { disadvantage: true } : {});
    });
  };
  draw({});
}

const breakdownFor = (parts) => parts.filter(p => p && p.amount);

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
    showRoll(`${rules.ABILITY_NAME[id]} check`, rules.abilityModifier(c, id),
      breakdownFor([{ reason: `${rules.ABILITY_NAME[id]} modifier`, amount: rules.abilityMod(c.abilities[id]) },
        ...rules.contributions(rules.activeModifiers(c), `ability:${id}`).map(m => ({ reason: m.reason, amount: Math.floor(m.amount / 2) || m.amount }))]));
  },
  "roll-save": el => {
    const id = el.dataset.id, c = ch();
    showRoll(`${rules.ABILITY_NAME[id]} save`, rules.saveTotal(c, id),
      breakdownFor([{ reason: `${rules.ABILITY_NAME[id]} modifier`, amount: rules.abilityModifier(c, id) },
        { reason: "Proficiency", amount: c.saves?.[id] ? rules.proficiencyBonus(c.level) : 0 },
        ...rules.contributions(rules.activeModifiers(c), `save:${id}`)]));
  },
  "roll-skill": el => {
    const id = el.dataset.id, c = ch(), sk = rules.SKILL_BY_ID[id];
    const use = (sk.abilities.length > 1 && c.skillAbility?.[id]) || sk.abilities[0];
    const prof = c.skills?.[id] || 0;
    showRoll(sk.name, rules.skillTotal(c, id, use),
      breakdownFor([{ reason: `${rules.ABILITY_NAME[use]} modifier`, amount: rules.abilityModifier(c, use) },
        { reason: prof === 2 ? "Expertise" : "Proficiency", amount: rules.profContribution(rules.proficiencyBonus(c.level), prof) },
        ...rules.contributions(rules.activeModifiers(c), `skill:${id}`)]));
  },
  "roll-init": () => {
    const c = ch();
    showRoll("Initiative", rules.initiative(c),
      breakdownFor([{ reason: "Dexterity modifier", amount: rules.abilityModifier(c, "dex") },
        ...rules.contributions(rules.activeModifiers(c), "initiative")]));
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
  hp: el => {
    const c = ch(), max = rules.maxHp(c);
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
        const r = rules.applyDamage(cur, n, { critical: crit });
        mutate(s => { s.hp = r.hp; s.tempHp = r.tempHp; });
        out.innerHTML = `<p class="hint">${r.absorbed ? `${r.absorbed} absorbed by temporary hit points. ` : ""}
          Concentration DC <b>${r.concentrationDC}</b> if you were holding something.</p>
          ${r.woundTriggers.length ? woundPrompt(r.woundTriggers) : ""}`;
      } else if (b.value === "heal") {
        const r = rules.applyHealing(cur, n);
        mutate(s => { s.hp = r.hp; });
        out.innerHTML = `<p class="hint">Healed ${r.healed}.</p>`;
      } else {
        const r = rules.applyTempHp(cur, n);
        mutate(s => { s.tempHp = r.tempHp; });
        out.innerHTML = `<p class="hint">${r.replaced ? "Temporary hit points set." : "You already had more — temporary hit points do not stack."}</p>`;
      }
      document.getElementById("hpN").value = "";
      critBtn.classList.remove("on");
      critBtn.setAttribute("aria-pressed", "false");
    });
    document.getElementById("hpCrit").onclick = e => {
      e.preventDefault();
      const b = e.currentTarget;
      const on = !b.classList.contains("on");
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", String(on));
    };
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
  "ds-clear": () => mutate(s => { s.deathSaveSuccesses = 0; s.deathSaveFailures = 0; }),
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
          [{ reason: "Constitution save", amount: rules.saveTotal(c, "con") }]);
      } });
  },
  "conc-drop": () => mutate(s => { s.concentrating = ""; }),

  // ── attacks ──
  "atk-add": () => attackDialog(null),
  "atk-del": el => mutate(s => { s.attacks.splice(+el.dataset.id, 1); }),
  "atk-roll": el => {
    const a = ch().attacks[+el.dataset.id];
    showRoll(`${a.name || "Attack"} — to hit`, (Number(a.bonus) || 0) + rules.modifierTotal(rules.activeModifiers(ch()), "attack"),
      breakdownFor([{ reason: "Attack bonus", amount: Number(a.bonus) || 0 },
        ...rules.contributions(rules.activeModifiers(ch()), "attack")]));
  },
  "atk-dmg": el => rollDamage(ch().attacks[+el.dataset.id], false),
  "atk-crit": el => rollDamage(ch().attacks[+el.dataset.id], true),

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
    mutate(s => {
      s.modifiers = mods.list; s.actions = acts.list; s.grants = gr.list;
      s.round = c.round + 1; s.inCombat = true; s.used = {};
    });
    const ended = [...mods.ended.map(m => m.reason), ...acts.ended.map(a => a.name),
      ...gr.ended.map(g => g.why || `extra ${g.kind}`)];
    if (ended.length) toast(`Ended: ${ended.join(", ")}`);
  },
  "end-combat": () => mutate(s => {
    s.round = 1; s.inCombat = false; s.used = {};
    // Timed things end with the fight; permanent ones and the history stay.
    const drop = x => x.rounds == null ? x : { ...x, active: false, rounds: 0 };
    s.modifiers = (s.modifiers || []).map(drop);
    s.actions = (s.actions || []).map(drop);
    s.grants = (s.grants || []).map(drop);
  }),
  "mod-add": () => modifierDialog(),
  "mod-del": el => mutate(s => {
    s.modifiers = s.modifiers.map(m => m.id === el.dataset.id ? { ...m, active: false } : m);
  }),

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
  "slot-flag": el => mutate(s => {
    const it = (s.equipment || {})[el.dataset.id];
    if (it) it[el.dataset.k] = !it[el.dataset.k];
  }),
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
  "carry-del": el => mutate(s => { s.carried.splice(+el.dataset.id, 1); }),

  // ── portrait and accent ──
  portrait: () => {
    dialog("Portrait", `<div class="pgrid">${PORTRAITS.map(f => `
        <button class="pgrid-b ${ch().portrait === portraitUrl(f) ? "on" : ""}"
          data-act="portrait-pick" data-id="${esc(f)}" title="${esc(f)}"
          style="background-image:url('${esc(portraitUrl(f))}')" aria-label="${esc(f)}"></button>`).join("")}</div>
      <p class="hint">Placeholders for now. Drop your own into <code>sheet/img/portraits/</code> and add
        the filename to <code>PORTRAITS</code> in <code>sheet/js/view.js</code>.</p>`, { wide: true });
  },
  "portrait-pick": el => { closeDialog(); mutate(s => { s.portrait = portraitUrl(el.dataset.id); }); },
  "portrait-clear": () => mutate(s => { s.portrait = ""; }),
  accent: el => mutate(s => { s.accent = el.dataset.id || ""; }),

  "feat-add": () => {
    dialog("Add a feature", `<form class="fields" id="ft">
        <label>Name<input class="txt" id="ftName" maxlength="80" required></label>
        <label>Source<input class="txt" id="ftSrc" maxlength="40" placeholder="class, feat, item, ancestry"></label>
        <label>Uses<input class="txt" id="ftUses" type="number" min="0" max="99" placeholder="leave empty if unlimited"></label>
        <label>What it does<textarea class="txt ta" id="ftText" rows="4"></textarea></label>
        <button class="btn pri" type="submit">Add</button></form>`);
    document.getElementById("ft").onsubmit = ev => {
      ev.preventDefault();
      const name = document.getElementById("ftName").value.trim();
      if (!name) return;
      const f = { id: uid(), name,
        source: document.getElementById("ftSrc").value.trim(),
        uses: Number(document.getElementById("ftUses").value) || 0, used: 0,
        text: document.getElementById("ftText").value.trim() };
      closeDialog();
      mutate(s => { s.features = [...(s.features || []), f]; });
    };
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
  // A use spent out of a feature's pool, the same pip idiom as the spell slots: clicking the nth pip
  // means "I have spent n+1 of these", and clicking a spent one hands it back.
  "feat-use": (el, e) => {
    e.stopPropagation();
    const i = +el.dataset.id, n = +el.dataset.i;
    mutate(s => {
      const f = s.features[i];
      if (!f) return;
      f.used = n < (Number(f.used) || 0) ? n : n + 1;
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

function attackDialog() {
  dialog("Add an attack", `<form class="fields" id="ak">
      <label>Name<input class="txt" id="akName" maxlength="60" required placeholder="Etherium Dagger"></label>
      <label>To hit<input class="txt" id="akBonus" type="number" min="-5" max="30" value="0"></label>
      <label>Damage<input class="txt" id="akDmg" maxlength="40" placeholder="1d4+5"></label>
      <label>Type<input class="txt" id="akType" maxlength="24" placeholder="piercing"></label>
      <button class="btn pri" type="submit">Add</button></form>
    <p class="hint">A critical doubles the dice, never the flat modifier.</p>`);
  document.getElementById("ak").onsubmit = ev => {
    ev.preventDefault();
    const name = document.getElementById("akName").value.trim();
    const damage = document.getElementById("akDmg").value.trim();
    if (!name) return;
    if (damage && !parseDice(damage)) return toast("That damage expression will not roll.");
    const a = { id: uid(), name, bonus: Number(document.getElementById("akBonus").value) || 0,
      damage, type: document.getElementById("akType").value.trim() };
    closeDialog();
    mutate(s => { s.attacks = [...(s.attacks || []), a]; });
  };
}

function rollDamage(a, crit) {
  const r = rollDice(a.damage, { crit });
  if (!r) return toast("No damage expression on that attack.");
  const extra = rules.modifierTotal(rules.activeModifiers(ch()), "damage");
  const total = r.total + extra;
  dialog(`${a.name || "Attack"} — damage${crit ? " (critical)" : ""}`,
    rollHtml({ ...r, total }, { label: a.type || "",
      breakdown: extra ? [{ reason: "Damage modifiers", amount: extra }] : [] }) +
    (crit ? `<p class="hint">The dice are doubled; the flat modifier is not.</p>` : ""));
}

// An extra slot in the turn's own economy — Haste's Action, a second Reaction, a Quick Action the
// table handed out. Not the same thing as an entry in the Actions card: that is something you can
// DO, this is permission to do one more thing this turn.
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
  { id: "insomniaOnly", icon: "dream", short: "Dreamlike",
    label: "Dreamlike or Lucidlike — an Insomnia-only slot, and inactive while awake" },
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
    attuned: !!src.attuned, insomniaOnly: !!src.insomniaOnly,
    charges: c0 ? { ...c0 } : { max: 0, used: 0, recharge: "manual", regain: "all" },
    effects: rules.itemEffectList(src),
    id: src.id || uid(),
  };

  const fieldId = k => `it${k[0].toUpperCase()}${k.slice(1)}`;
  const collect = () => {
    const v = k => document.getElementById(fieldId(k));
    d.name = v("name").value.trim();
    d.qty = Math.max(1, Number(v("qty").value) || 1);
    d.weight = Math.max(0, Number(v("weight").value) || 0);
    d.value = Math.max(0, Number(v("value").value) || 0);
    d.notes = v("notes").value.trim();
    // The four flags are not read back from the DOM: they are squares that light up, and the click
    // that lights one is what changes `d`. Only the typed fields are collected here.
    d.charges = { max: Math.max(0, Number(v("max").value) || 0), used: d.charges.used,
      recharge: v("recharge").value, regain: v("regain").value.trim() || "all" };
    d.charges.used = Math.min(d.charges.used, d.charges.max);
    document.querySelectorAll("[data-fx]").forEach(row => {
      const i = Number(row.dataset.fx);
      if (!d.effects[i]) return;
      d.effects[i] = { target: row.querySelector("select").value,
        amount: Number(row.querySelector("input").value) || 0 };
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
          <div class="tgls">
            ${ITEM_FLAGS.map(f => toggleHtml(`data-tgl="${f.id}"`, d[f.id], f.icon, f.label)).join("")}
            <span class="hint">${esc(ITEM_FLAGS.filter(f => d[f.id]).map(f => f.short).join(" · ")
              || "none of these")}</span>
          </div>

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
              <select class="txt">${MOD_TARGETS.map(t =>
                `<option value="${t.value}" ${t.value === e.target ? "selected" : ""}>${esc(t.label)}</option>`).join("")}</select>
              <input class="txt" type="number" min="-20" max="20" value="${e.amount}">
              <button class="x" type="button" data-fx-del="${i}" aria-label="Remove this effect">×</button>
            </div>`).join("")
            : `<p class="hint">Nothing yet. Add one and it counts the moment the item is in a
               slot — the same path a hand-written effect takes, so it shows in the breakdown with
               the item's own name on it.</p>`}
          <button class="btn sm" type="button" id="itFxAdd">+ Add an effect</button>
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
    document.getElementById("itFxAdd").onclick = () => {
      collect(); d.effects.push({ target: "ac", amount: 1 }); draw();
    };
    document.getElementById("itf").onsubmit = ev => { ev.preventDefault(); save(); };

    const on = (id, fn) => { const b = document.getElementById(id); if (b) b.onclick = fn; };
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
      attuned: d.attuned, insomniaOnly: d.insomniaOnly,
      charges: d.charges.max ? { ...d.charges } : null,
      effects: d.effects.filter(e => e.target && e.amount) };
    if (isNew) mutate(s => { s.carried = [...(s.carried || []), item]; });
    else if (slotId) mutate(s => { s.equipment = { ...(s.equipment || {}), [slotId]: item }; });
    else mutate(s => { s.carried = (s.carried || []).map((x, i) => (i === found.index ? item : x)); });
    if (keepOpen) draw(); else closeDialog();
  };

  draw();
}

// A named change with a reason and a duration. The reason is not optional dressing — it is the whole
// point of the feature: six weeks later a +2 nobody can explain is worse than no +2 at all.
function modifierDialog() {
  dialog("Add an effect", `<form class="fields" id="mf">
      <label>What it changes<select class="txt" id="mfT">${MOD_TARGETS.map(t =>
        `<option value="${esc(t.value)}">${esc(t.label)}</option>`).join("")}</select></label>
      <label>By how much<input class="txt" id="mfA" type="number" value="1" min="-30" max="30" required></label>
      <label>Why<input class="txt" id="mfR" maxlength="80" required placeholder="Shield of Faith, Bless, a curse…"></label>
      <label>For how long<select class="txt" id="mfD">
          <option value="">Until I remove it</option>
          <option value="1">1 round</option><option value="2">2 rounds</option>
          <option value="3">3 rounds</option><option value="10" selected>10 rounds (1 minute)</option>
          <option value="100">100 rounds (10 minutes)</option>
        </select></label>
      <button class="btn pri" type="submit">Add</button></form>
    <p class="hint">Your base scores are never changed — removing an effect puts everything back.
      Timed effects count down when you confirm a round.</p>`);
  document.getElementById("mf").onsubmit = ev => {
    ev.preventDefault();
    const reason = document.getElementById("mfR").value.trim();
    const amount = Number(document.getElementById("mfA").value) || 0;
    if (!reason || !amount) return toast("An effect needs an amount and a reason.");
    const rounds = document.getElementById("mfD").value ? Number(document.getElementById("mfD").value) : null;
    const m = { id: uid(), target: document.getElementById("mfT").value, amount, reason, rounds, active: true };
    closeDialog();
    mutate(s => { s.modifiers = [...(s.modifiers || []), m]; });
    toast(`${sign(amount)} ${targetLabel(m.target)} — ${reason}`);
  };
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
  mutate(s => { s.hitDiceUsed = out.hitDiceUsed; s.hp = out.hp; });
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
const setStanding = (id, standing) => mutate(s => {
  s.spells = { ...(s.spells || {}) };
  s.spells.book = (s.spells.book || []).map(x => (x.id === id ? { ...x, standing } : x));
});

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

        ${dice.length ? `<div class="spl-dice"><span class="hint">Dice in its text</span>
          ${dice.map(d => `<button class="btn sm" data-sp-roll="${esc(d)}">${esc(d)}</button>`).join("")}
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
      showRoll(`${s.name} — spell attack`, rules.spellAttackBonus(ch(), a),
        [{ reason: `Proficiency`, amount: rules.proficiencyBonus(ch().level) },
         { reason: rules.ABILITY_NAME[a], amount: rules.abilityModifier(ch(), a) }]);
    });
    d.querySelectorAll("[data-sp-roll]").forEach(b => b.onclick = () => {
      const r = rollDice(b.dataset.spRoll);
      if (r) dialog(`${s.name} — ${b.dataset.spRoll}`, rollHtml(r, { label: "from its text" }));
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
