// Arcanum Veritas Builder — the dice tray
//
// The card already resolves every formula into real numbers, so nothing here re-derives
// anything: it reads the chips the card printed and rolls what they say. Click a chip to
// roll it, or hit Roll (or the R key) to throw the whole seal at once.

const DICE_CAP = 400;                      // a sane ceiling, so a typo can't hang the page
const ROLL_KEEP = 8;                       // how many throws the tray remembers

state.dice = { rolls: [], n: 0 };

const rollDie = faces => 1 + Math.floor(Math.random() * faces);

// "23d6 + 4", "+3d6", "1d8" → the dice groups and the flat modifier. Null if there's nothing to roll.
function parseRoll(txt) {
  const s = String(txt || "").replace(/[−–—]/g, "-");
  const groups = [];
  const re = /([+-]?)\s*(\d*)\s*d\s*(\d+)/gi;
  let m;
  while ((m = re.exec(s))) {
    const n = Math.min(Math.max(parseInt(m[2] || "1", 10), 1), DICE_CAP);
    groups.push({ sign: m[1] === "-" ? -1 : 1, n, faces: +m[3] });
  }
  if (!groups.length) return null;
  let flat = 0;
  (s.replace(re, " ").match(/[+-]\s*\d+/g) || []).forEach(t => flat += parseInt(t.replace(/\s+/g, ""), 10));
  return { groups, flat };
}

function rollParsed(p, crit) {
  const groups = [];
  let total = p.flat;
  p.groups.forEach(g => {
    const n = Math.min(crit ? g.n * 2 : g.n, DICE_CAP), rolls = [];
    for (let i = 0; i < n; i++) rolls.push(rollDie(g.faces));
    const sum = rolls.reduce((a, b) => a + b, 0) * g.sign;
    total += sum;
    groups.push({ n, faces: g.faces, rolls, sign: g.sign, sum });
  });
  return { groups, flat: p.flat, total };
}

// Healing, temp HP and damage reduction don't double on a critical hit — only damage does
const CRITTABLE = lab => !/heal|temp|absorb|reduce|hp each/i.test(lab || "");

function pushRoll(entry) {
  entry.id = ++state.dice.n;
  state.dice.rolls.unshift(entry);
  state.dice.rolls.length = Math.min(state.dice.rolls.length, ROLL_KEEP);
  renderTray();
}
function clearRolls() { state.dice.rolls = []; renderTray(); }

// ── Rolling one chip ───────────────────────────────────────
// Dice only. The d20s of the seal — to hit, the target's save — are the table's to make;
// the tray throws the damage and healing the card worked out.
//
// A crit is never a mode you have to arm first. Either you know before you throw (Roll crit,
// or shift-click) or you find out after (the ×2 on the throw itself, which rolls the extra
// dice and adds them to the number already there — the same thing your hand does at the table).
function chipThrow(chip, crit) {
  const big = chip?.querySelector("b")?.textContent.trim() || "";
  const lab = chip?.querySelector("i")?.textContent.trim() || "";
  const via = chip?.querySelector("u")?.textContent.trim() || "";
  const p = parseRoll(big);
  if (!p) return null;
  const can = CRITTABLE(lab);
  const r = rollParsed(p, crit && can);
  return {
    label: lab || "damage",
    total: r.total,
    faces: r.groups.map(g => `${g.sign < 0 ? "−" : ""}${g.n}d${g.faces}: ${g.rolls.join(" ")}`).join("  "),
    tail: (r.flat ? `  ${sgn(r.flat)}` : "") + (via ? `  · ${via}` : ""),
    kind: /heal|temp|absorb/i.test(lab) ? "heal" : "dmg",
    dice: p,                       // kept so a crit can add the same dice again later
    critable: can,
    crit: !!(crit && can),
  };
}
function rollChip(chip, crit) {
  const t = chipThrow(chip, crit);
  if (!t) return false;
  pushRoll(t);
  return true;
}

// The dice a card offers: damage and healing chips, never the d20s
function sealChips() {
  const body = document.getElementById("sumBody");
  let chips = [...(body?.querySelectorAll(".card .n.dmg") || [])];
  if (!chips.length) chips = [...(body?.querySelectorAll(".card .n") || [])]
    .filter(c => !c.classList.contains("atk") && !c.classList.contains("dc") && parseRoll(c.querySelector("b")?.textContent));
  if (!chips.length) toast(body?.querySelector(".raw") ? "The chips live on the PLAY card — switch back to roll them"
      : state.core || state.mode === "ign" ? "Nothing on this card rolls dice" : "Draw a seal first");
  return chips;
}

// ── Rolling the whole seal ─────────────────────────────────
// Every damage and healing number on the card, each thrown separately — resistance cares
// which die is which — then added up, because the table wants one number to write down.
function rollSeal(crit) {
  const chips = sealChips();
  if (!chips.length) return;
  const parts = chips.map(c => chipThrow(c, crit)).filter(Boolean);
  if (!parts.length) return;
  if (parts.length === 1) return pushRoll(parts[0]);
  pushRoll({
    label: parts.every(p => p.kind === "heal") ? "healed, all told" : "dealt, all told",
    total: parts.reduce((a, p) => a + p.total, 0),
    kind: "total",
    crit: parts.some(p => p.crit),
    critable: parts.some(p => p.critable && !p.crit),
    parts,
  });
}

// ── Turning a throw you already made into a crit ───────────
// 5e doubles the dice, not the modifier: roll the same dice again and add them on.
function critThrow(id) {
  const e = state.dice.rolls.find(r => r.id === +id);
  if (!e) return;
  const bump = part => {
    if (!part.critable || part.crit) return 0;
    const extra = rollParsed({ groups: part.dice.groups, flat: 0 }, false);
    part.total += extra.total;
    part.faces += `  · crit ${extra.groups.map(g => g.rolls.join(" ")).join(" ")}`;
    part.crit = true;
    return extra.total;
  };
  if (e.parts) { e.total += e.parts.reduce((a, p) => a + bump(p), 0); e.crit = true; e.critable = false; }
  else bump(e);
  renderTray();
}

// ── The tray ───────────────────────────────────────────────
function renderTray() {
  const el = document.getElementById("tray");
  if (!el) return;
  const d = state.dice;
  if (!d.rolls.length) { el.hidden = true; el.innerHTML = ""; return; }
  el.hidden = false;
  // The ×2 only shows while it can still change something — once a throw is a crit, it's spent
  const x2 = r => r.critable && !r.crit
    ? `<button class="x2" onclick="critThrow(${r.id})" title="It was a critical hit — roll the same dice again and add them on">×2</button>` : "";
  const line = (r, btn) => `<span class="rv">${r.total}</span>
      <span class="rb"><i>${esc(r.label)}${r.crit ? " · crit" : ""}</i>${r.faces ? `<u>${esc(r.faces + (r.tail || ""))}</u>` : ""}</span>${btn ? x2(r) : ""}`;
  el.innerHTML = `<div class="tray-h">
      <b>Dice</b>
      <button class="mini" onclick="clearRolls()">Clear</button>
    </div>` +
    d.rolls.map((r, i) => r.parts
      ? `<div class="roll total${i ? "" : " new"}">
          <div class="rt"><span class="rv">${r.total}</span>
            <span class="rb"><i>${esc(r.label)}${r.crit ? " · crit" : ""}</i></span>${x2(r)}</div>
          ${r.parts.map(p => `<div class="rp ${esc(p.kind)}">${line(p, false)}</div>`).join("")}
        </div>`
      : `<div class="roll ${esc(r.kind || "")}${i ? "" : " new"}">${line(r, true)}</div>`).join("");
}

// ── Wiring ─────────────────────────────────────────────────
// The card is rebuilt from scratch on every change, so the chips are marked rollable
// whenever the seal panel's contents change rather than from inside each renderer.
function armRolls() {
  document.querySelectorAll("#sumBody .card .n").forEach(chip => {
    if (chip.classList.contains("atk") || chip.classList.contains("dc")) return;   // the d20s stay the table's
    if (!parseRoll(chip.querySelector("b")?.textContent.trim())) return;
    chip.classList.add("rollable");
    chip.title = chip.title || "Click to roll";
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const body = document.getElementById("sumBody");
  if (!body) return;
  new MutationObserver(armRolls).observe(body, { childList: true, subtree: true });
  armRolls();
  body.addEventListener("click", e => {
    const chip = e.target.closest?.(".n.rollable");
    if (chip) rollChip(chip, e.shiftKey);   // shift-click throws it as a crit
  });
});

document.addEventListener("keydown", e => {
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === "r" || e.key === "R") rollSeal(e.shiftKey);   // shift+R for a critical hit
});
