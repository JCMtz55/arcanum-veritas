// Arcanum Veritas Builder — The Rings tab

// ═══════════════════════════════════════════════════════════
//  RINGS — the composition tables, read on their own
// ═══════════════════════════════════════════════════════════
// What d20 the Ring asks for, if any — stated per Ring rather than inferred,
// because "not a Direct Attack" does not mean "somebody saves".
const RING_ROLL = {
  "offensive/Direct Attack": "seal attack roll",
  "offensive/Area":          "saving throw",
  "offensive/Field":         "saving throw",
  "offensive/Infusion":      "your weapon attack",
  "supportive/Self":         "no roll",
  "supportive/Ally":         "no roll",
  "supportive/Aura":         "no roll",
  "supportive/Ward":         "no roll — it absorbs",
  "control/Targeted":        "saving throw",
  "control/Area":            "saving throw",
  "creation/Structure":      "verum on touch",
  "creation/Construct":      "the construct's own attacks",
  "creation/Object":         "no roll",
  "utility/Utility":         "no roll",
};

function renderRingList() {
  if (state.mode === "ign") return renderIgnRefList();   // in Ignition mode this tab is the Ignition reference
  const box = document.getElementById("ringList");
  const ref = state.ringRef || {};
  box.innerHTML = Object.entries(COMP_DATA).map(([k, d]) =>
    `<div class="rail-grp ${d.color}">${d.icon} ${d.label}</div>` +
    Object.keys(d.subtypes).map(sk => {
      const on = ref.type === k && ref.sub === sk;
      return `<button class="cog${on ? " core" : ""}" onclick="openRing('${k}','${escAttr(sk)}')">
        <span class="nm">${sk}</span></button>`;
    }).join("")
  ).join("");
}

function openRing(type, sub) {
  state.ringRef = { type, sub };
  renderRingList(); renderRing();
  document.getElementById("ringBody").scrollTop = 0;
  // Keep the rail on the selection — stacked, it is a 190px window over fourteen Rings
  document.querySelector("#ringList .cog.core")?.scrollIntoView({ block: "nearest" });
}
// Jumping the slot from a table row keeps the whole tool on that slot (renderMain redraws here)
function ringSlot(n) { bumpSlotTo(n); }

function renderRing() {
  if (state.mode === "ign") return renderIgnRef();
  const host = document.getElementById("ringBody");
  if (!host) return;
  const ref = state.ringRef;
  const d   = ref && COMP_DATA[ref.type];
  const sub = d && d.subtypes[ref.sub];
  if (!sub) { host.innerHTML = `<div class="empty">Pick a Ring from the left.</div>`; return; }

  // Where this Ring's Verum effects come from, in general and for the Core in play
  const fallback = sub.verumKey || d.verumKey || ref.type;
  const coreCog  = LOADED[state.core];
  const live     = coreCog ? poolFor(coreCog, ref.type, ref.sub) : null;

  let tags = "";
  if (sub.reaction)      tags += `<span class="t hot">reaction</span>`;
  if (sub.concentration) tags += `<span class="t hot">concentration</span>`;
  // Worth saying only where a sibling Ring in the same family does concentrate — there it is a choice
  else if (Object.values(d.subtypes).some(s => s.concentration))
    tags += `<span class="t">no concentration</span>`;
  if (sub.saveDisadvantage) tags += `<span class="t hot">first save at disadvantage</span>`;
  if (sub.shape)         tags += `<span class="t">sphere · cone · line</span>`;
  const roll = RING_ROLL[`${ref.type}/${ref.sub}`];
  if (roll) tags += `<span class="t">${esc(roll)}</span>`;
  if (fallback !== ref.type)
    tags += `<span class="t">borrows the ${esc(COMP_DATA[fallback].label)} pool</span>`;

  let h = `<div class="cdx">
    <div class="cdx-hd"><div class="cdx-ico">${d.icon}</div><div>
      <h1>${esc(ref.sub)}</h1>
      <p class="cdx-desc">${esc(d.label)} — ${esc(d.desc)}</p>
      <div class="c-tags">${tags}</div>
    </div></div>`;

  // ── Which pool fills it
  h += `<div class="cdx-sec"><h2 class="${d.color}">Verum pool</h2>
    <p class="cdx-rings">A Cognition's own <strong>${esc(d.label)}</strong> effects fill this Ring` +
    (fallback !== ref.type
      ? `, and when it has none written, this Ring falls back to its <strong>${esc(COMP_DATA[fallback].label)}</strong> pool.`
      : `.`) +
    (live ? ` For <strong>${esc(INDEX.find(c => c.id === state.core)?.name || "")}</strong>,
        the Core you have selected, it resolves to <strong>${esc(COMP_DATA[live].label)}</strong>.` : ``) +
    `</p></div>`;

  // ── The whole table, every slot, the live one lit
  h += `<div class="cdx-sec"><h2 class="${d.color}">Scaling — all nine slots</h2>
    <p class="cdx-rings">Click a row to set the tool to that slot. Formulas resolve against your Verum mod.</p>
    <div class="tbl-wrap"><table class="tbl"><thead><tr>` +
    sub.columns.map(c => `<th>${esc(c)}</th>`).join("") + `</tr></thead><tbody>` +
    sub.rows.map(r => {
      const n = ORDINALS.indexOf(r[0]);
      return `<tr class="${n === state.slotLevel ? "now" : ""}" onclick="ringSlot(${n})">` +
        r.map((cellv, i) => `<td${String(cellv).length > 40 ? ' class="wrap"' : ""}>${esc(resolve(cellv))}</td>`).join("") +
        `</tr>`;
    }).join("") + `</tbody></table></div></div>`;

  // ── How it resolves at the table
  if (sub.notes) {
    h += `<div class="cdx-sec"><h2 class="${d.color}">How it resolves</h2>
      <div class="cdx-note">` + sub.notes.split(/\n+/).map(p => `<p>${esc(p)}</p>`).join("") + `</div></div>`;
  }

  // ── Shapes, only where a radius exists to shape
  if (sub.shape) {
    h += `<div class="cdx-sec"><h2 class="${d.color}">Shape</h2><div class="cdx-defs">` +
      Object.values(SHAPES).map(s =>
        `<div class="cdx-def"><b>${esc(s.label)}</b><span>${esc(s.desc)}</span></div>`).join("") +
      `</div></div>`;
  }

  // ── Manners, with the ones this Ring forbids struck out
  h += `<div class="cdx-sec"><h2 class="${d.color}">Manner of drawing</h2><div class="cdx-defs">` +
    Object.entries(MANNERS).map(([k, m]) => {
      const ok = mannerAllowed(k, ref.sub);
      return `<div class="cdx-def${ok ? "" : " dis"}"><b>${esc(m.label)}</b>
        <span>${ok ? esc(m.desc) : `Not available to ${esc(ref.sub)}.`}</span></div>`;
    }).join("") + `</div></div>`;

  // ── The rest of the family, one click away
  const siblings = Object.keys(d.subtypes).filter(s => s !== ref.sub);
  if (siblings.length) {
    h += `<div class="cdx-sec"><h2 class="${d.color}">Also ${esc(d.label)}</h2><div class="chips">` +
      siblings.map(s => `<button class="chip" onclick="openRing('${ref.type}','${escAttr(s)}')">${esc(s)}</button>`).join("") +
      `</div></div>`;
  }

  host.innerHTML = h + `</div>`;
}
