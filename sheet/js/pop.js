// Tooltips, popovers, dialogs, toasts and the dice — the furniture the sheet is built out of.
//
// The requirement is a sheet that fits one screen, so almost nothing here is laid out in the page:
// detail lives in a popover you open over the number it explains, and a result lands in a dialog.
// The popover is one element, moved and refilled, nudged back inside the viewport rather than
// clipped by it — the same approach the Grimm Companion's `popAt` takes, rewritten here because that
// file is a plain script in another section and this one is a module.

export const esc = s => String(s ?? "").replace(/[&<>"']/g,
  c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const attr = s => esc(s);
export const sign = n => (Number(n) >= 0 ? "+" : "") + Number(n);

// ── toast ───────────────────────────────────────────────────────────────
let toastTimer = null;
export function toast(msg) {
  let t = document.getElementById("toast");
  if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; document.body.append(t); }
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2400);
}

// ── popover ─────────────────────────────────────────────────────────────
// `pinned` means it survives the mouse leaving, which is the only way a touch device can read one at
// all — there is no hover there.
let pinnedKey = null;
let lastOpener = null;

export function popAt(el, html, { kind = "", pin = false, key = null } = {}) {
  if (pinnedKey && !pin) return;                      // a pinned pop outranks a hover
  if (pin && key && pinnedKey === key) return closePop(true);   // clicking the pinned one closes it

  let p = document.getElementById("pop");
  if (!p) { p = document.createElement("div"); p.id = "pop"; document.body.append(p); }
  p.className = `pop ${kind}${pin ? " pinned" : ""}`;
  // A pinned pop needs a way out that is not "click some empty space" — on a touch screen there
  // may not be any empty space on this page, and hunting for it is not an interaction.
  p.innerHTML = pin
    ? html.replace(/(<div class="pop-h"[^>]*>)/, `$1<button class="pop-x" data-pop-close aria-label="Close">×</button>`)
    : html;
  if (pin && !p.querySelector("[data-pop-close]"))
    p.insertAdjacentHTML("afterbegin", `<button class="pop-x solo" data-pop-close aria-label="Close">×</button>`);
  p.querySelector("[data-pop-close]")?.addEventListener("click", e => { e.stopPropagation(); closePop(true); });
  // A click inside the panel is not a click away from it: without this, the document handler that
  // dismisses a pinned pop fires the moment you touch a field inside one.
  p.onclick = e => e.stopPropagation();

  const r = el.getBoundingClientRect();
  const w = Math.min(360, window.innerWidth - 20);
  p.style.width = w + "px";
  p.style.left = Math.round(Math.max(10, Math.min(r.left, window.innerWidth - w - 10))) + "px";
  p.style.top = Math.round(r.bottom + 7) + "px";
  if (r.bottom + p.offsetHeight + 16 > window.innerHeight)
    p.style.top = Math.round(Math.max(8, r.top - p.offsetHeight - 7)) + "px";

  if (pin) { pinnedKey = key || "pop"; lastOpener = el; }
  return p;
}
export function closePop(force) {
  if (pinnedKey && !force) return;
  pinnedKey = null;
  document.getElementById("pop")?.remove();
  // Keyboard focus goes back where it came from, or the next Tab starts from the top of the page.
  if (force && lastOpener?.isConnected) { lastOpener.focus(); lastOpener = null; }
}
export const popIsPinned = () => !!pinnedKey;
export const popKey = () => pinnedKey;
// Whether a click landed inside the open popover. The page's own click dispatcher needs this,
// because it stops propagation before the document-level dismissal below can ever see the event.
export const popContains = node => {
  const p = document.getElementById("pop");
  return !!(p && node instanceof Node && p.contains(node));
};

// ── dialog ──────────────────────────────────────────────────────────────
// A native <dialog>, so Escape, the backdrop and the focus trap are the browser's job rather than
// something to reimplement badly.
let dialogReturn = null;

export function dialog(title, bodyHtml, { footer = "", wide = false } = {}) {
  dialogReturn = document.activeElement;
  let d = document.getElementById("dlg");
  if (!d) {
    d = document.createElement("dialog"); d.id = "dlg"; document.body.append(d);
    // Returning focus to whatever opened it, every time it closes, however it closed.
    d.addEventListener("close", () => { if (dialogReturn?.isConnected) dialogReturn.focus(); });
  }
  d.className = `dlg${wide ? " wide" : ""}`;
  d.innerHTML = `<div class="dlg-h"><h3>${esc(title)}</h3><span class="sp"></span>
      <button class="btn sm" data-act="dlg-close" aria-label="Close">Close</button></div>
    <div class="dlg-b">${bodyHtml}</div>
    ${footer ? `<div class="dlg-f">${footer}</div>` : ""}`;
  d.showModal();
  // Put the caret in the first field, or on the primary button, so the keyboard works immediately.
  (d.querySelector("input, select, textarea, .btn.pri") || d.querySelector(".btn"))?.focus();
  return d;
}
export const closeDialog = () => document.getElementById("dlg")?.close();

// ── dice ────────────────────────────────────────────────────────────────
// A parser, not an evaluator: "2d6+3", "1d20", "4d8 - 1", "2d6+1d4+2". Anything else is refused
// rather than run, because an expression a player types must never be able to execute code (CS-024).
const DIE = /^\s*([+-]?)\s*(\d*)d(\d+)\s*/i;
const FLAT = /^\s*([+-]?)\s*(\d+)\s*/;

export function parseDice(expr) {
  let s = String(expr || "").trim();
  if (!s) return null;
  const groups = [];
  let flat = 0, first = true, guard = 0;
  while (s && guard++ < 40) {
    let m = DIE.exec(s);
    if (m) {
      const n = m[2] === "" ? 1 : parseInt(m[2], 10);
      const faces = parseInt(m[3], 10);
      if (!n || n > 100 || !faces || faces > 1000) return null;
      if (!first && !m[1]) return null;                      // "2d6 1d4" is not an expression
      groups.push({ n, faces, neg: m[1] === "-" });
      s = s.slice(m[0].length); first = false; continue;
    }
    m = FLAT.exec(s);
    if (m) {
      if (!first && !m[1]) return null;
      flat += (m[1] === "-" ? -1 : 1) * parseInt(m[2], 10);
      s = s.slice(m[0].length); first = false; continue;
    }
    return null;
  }
  if (s.trim()) return null;
  return groups.length || flat ? { groups, flat } : null;
}

const d = faces => 1 + Math.floor(Math.random() * faces);

// Rolls a parsed expression. `crit` doubles the DICE, never the flat modifier.
export function rollDice(expr, { crit = false } = {}) {
  const p = parseDice(expr);
  if (!p) return null;
  const parts = [];
  let total = p.flat;
  for (const g of p.groups) {
    const n = crit ? g.n * 2 : g.n;
    const faces = [];
    for (let i = 0; i < n; i++) faces.push(d(g.faces));
    const sum = faces.reduce((a, b) => a + b, 0);
    total += g.neg ? -sum : sum;
    parts.push({ label: `${n}d${g.faces}`, faces, sum, neg: g.neg });
  }
  return { total, parts, flat: p.flat, crit, expr: String(expr) };
}

// A d20 check: one die, a modifier, and optional advantage or disadvantage.
export function rollCheck(modifier, { advantage = false, disadvantage = false } = {}) {
  const a = d(20), b = (advantage || disadvantage) ? d(20) : null;
  const natural = b == null ? a : (advantage ? Math.max(a, b) : Math.min(a, b));
  return {
    natural, dice: b == null ? [a] : [a, b],
    modifier: Number(modifier) || 0,
    total: natural + (Number(modifier) || 0),
    advantage, disadvantage,
    crit: natural === 20, fumble: natural === 1,
  };
}

// How a roll is shown: the result large, and underneath it exactly what was added and why — so a
// player can see where a total came from instead of trusting it.
export function rollHtml(r, { label = "", breakdown = [] } = {}) {
  const dice = r.dice
    ? r.dice.map((v, i) => `<span class="die${r.dice.length > 1 && v !== r.natural ? " dim" : ""}">${v}</span>`).join("")
    : r.parts.map(p => `<span class="dgroup"><i>${esc(p.label)}</i>${p.faces.map(f => `<span class="die sm">${f}</span>`).join("")}</span>`).join("");
  const tag = r.crit ? `<span class="tag good">critical</span>`
    : r.fumble ? `<span class="tag bad">natural 1</span>`
    : r.advantage ? `<span class="tag">advantage</span>`
    : r.disadvantage ? `<span class="tag">disadvantage</span>` : "";
  return `<div class="rollout">
      <div class="rolltotal"><b>${r.total}</b>${label ? `<i>${esc(label)}</i>` : ""}</div>
      <div class="rolldice">${dice}${tag}</div>
    </div>
    ${breakdown.length ? `<ul class="why">` + breakdown
      .filter(b => b && b.amount !== 0)
      .map(b => `<li><span>${esc(b.reason)}</span><b>${sign(b.amount)}</b></li>`).join("") + `</ul>` : ""}`;
}

// A click on bare page closes a pinned popover. This only fires for clicks that reach the document,
// which is NOT every click: app.js dispatches on the capture phase and stops propagation for
// anything carrying a data-act, so that path closes the popover itself. Both are needed.
document.addEventListener("click", () => closePop(true));
// Escape closes the popover and NOTHING else. Without preventDefault the browser would also close
// a dialog sitting underneath it, so one key press would dismiss two things.
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && popIsPinned()) {
    e.preventDefault();
    e.stopPropagation();
    closePop(true);
  }
}, true);
