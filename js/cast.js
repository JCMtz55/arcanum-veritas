// Arcanum Veritas Builder — Casting a Supportive seal at the people around you
//
// A Supportive seal is the one Ring that reaches other people by design: Ally is "delivered to
// willing creatures", Aura covers "creatures of your choice inside it", Ward answers for someone
// you can see. So the button lives on the seal card, where the seal is — not on the character
// sheet, which is where it would be if this were a thing you looked up rather than a thing you did.
//
// What it hands over is `state.benefits`, written in the composer's "What it grants" block and
// resolved against the caster on the server. The recipients' sheets are never written: each benefit
// becomes a row the server owns, and their sheets merge it. See `character_effects` in server/db.js.
//
// HOW MANY PEOPLE IT REACHES IS THE RING'S OWN NUMBER, not a number invented here. Ally's scaling
// table has a Targets column — 1 at 1st slot, 2 at 3rd, 5 at 9th — and Sigils add to it exactly as
// they do on the card. Self reaches you and nobody else. Ward is one creature. Aura names no count
// at all, because it is a radius, so the party is its only limit.

let CAST = { mine: [], roster: [], from: null, chosen: new Set(), busy: false };

// Supportive, with something to actually hand over, on a deployment that has sheets behind it.
function castable() {
  return !!API && state.compType === "supportive" && (state.benefits || []).length > 0;
}

// The Ring's own cap. `says` is the bare number for a counter — "1 of 2" — and `blurb` is the
// sentence form, because "up to 2" and "yourself only" cannot be the same string.
function castTargetCap() {
  const sub = COMP_DATA.supportive?.subtypes?.[state.compSub];
  if (!sub) return { n: 1, says: "1", blurb: "" };
  if (state.compSub === "Self")
    return { n: 1, says: "1", blurb: "yourself only", selfOnly: true };
  const i = sub.columns.indexOf("Targets");
  const row = sub.rows.find(r => r[0] === ORDINALS[state.slotLevel]);
  if (i < 0 || !row) {
    // Aura names a radius, not a count: everyone you choose inside it. Ward answers for one.
    if (state.compSub === "Ward")
      return { n: 1, says: "1", blurb: "one creature you can see" };
    return { n: 99, says: "any", blurb: "anyone inside the radius" };
  }
  const base = parseInt(String(resolve(row[i])).match(/^(\d+)/)?.[1] || "1", 10);
  const bonus = sigilTargets(getTier(state.charLevel)) || 0;
  const n = base + bonus;
  return { n, says: String(n),
           blurb: bonus ? `up to ${n} — ${base} +${bonus} Sigil` : `up to ${n}` };
}

// The button, appended to the seal card by buildPlayCardHTML.
function castSection() {
  if (!castable()) return "";
  const cap = castTargetCap();
  const n = (state.benefits || []).length;
  return `<div class="c-cast">
    <button class="c-castb" onclick="openCast()">Cast To Ally</button>
    <span class="c-casth">${n} benefit${n === 1 ? "" : "s"} · ${esc(cap.blurb)}</span></div>`;
}

// Who the Ring may land on (Juan, 2026-11-12). The two inward/outward Rings are opposites and the
// picker says so by what it offers:
//
//   Self   — the characters on YOUR account, and nobody else's. The Ring is drawn inward.
//   Ally   — every OTHER player's character, and none of your own.
//   Aura   — a field centred on you: anyone you choose inside it, yourself included.
//   Ward   — "when you or a creature you can see takes damage", so likewise everyone.
//
// ⚠️ The Ally note in data.js still reads "You may be one of the targets" — Juan's ruling for the
// app is that Ally reaches other players, so the picker does not offer you. The note is left as
// written rather than quietly edited; it is a question for the rules, not for this file.
function castPool() {
  if (state.compSub === "Self") return CAST.roster.filter(r => r.mine);
  if (state.compSub === "Ally") return CAST.roster.filter(r => !r.mine);
  return CAST.roster;
}

// A face is how anybody at this table is actually recognised — the sheet, the DM's board and the
// Grimm Companion all lead with the plate, and a row of word-chips here would be the one place in
// the app that made you read a name to find somebody. Portraits are stored relative to `sheet/`,
// which is where this page is relative to as well.
function castPlate(r) {
  return r.portrait
    ? `<span class="cast-p" style="background-image:url('sheet/${castUrlAttr(r.portrait)}')"></span>`
    : `<span class="cast-p none">${esc(castInitials(r.name))}</span>`;
}
// A stored path is a player's own data, so it is encoded before it goes inside a url() inside an
// attribute — one apostrophe would otherwise end both early. Same guard the DM's board uses.
const castUrlAttr = u => escAttr(encodeURI(String(u || "")).replace(/'/g, "%27"));
const castInitials = n => String(n || "?").trim().split(/\s+/).slice(0, 2)
  .map(w => w[0] || "").join("").toUpperCase() || "?";

// ── the modal ───────────────────────────────────────────────────────────
async function openCast() {
  const dlg = document.getElementById("castDlg");
  CAST.chosen = new Set();
  CAST.busy = false;
  document.getElementById("castBody").innerHTML = `<p class="hint">Loading the table…</p>`;
  if (!dlg.open) dlg.showModal();
  try {
    const [mine, roster] = await Promise.all([
      api("GET", "api/characters"),
      api("GET", "api/party/roster"),
    ]);
    CAST.mine = mine.characters || [];
    CAST.roster = roster.roster || [];
    CAST.from = CAST.mine[0]?.id || null;
  } catch (err) {
    document.getElementById("castBody").innerHTML = `<p class="hint">${esc(err.message)}</p>`;
    return;
  }
  renderCast();
}

function renderCast() {
  const cap = castTargetCap();
  const body = document.getElementById("castBody");

  // A seal has to be cast BY somebody: the benefits are resolved against that character's own
  // scores, and an account with no character has nothing to resolve them against.
  if (!CAST.mine.length) {
    body.innerHTML = `<p class="hint">You have no character yet. Open the
      <b>Character Sheet</b> and make one — a seal is cast by somebody, and what it grants is worked
      out against their scores.</p>`;
    return;
  }

  const pool = castPool();

  const full = CAST.chosen.size >= cap.n;
  body.innerHTML = `
    ${CAST.mine.length > 1 ? `<label class="cast-as">Cast as
      <select class="search" onchange="setCastFrom(this.value)">${CAST.mine.map(c =>
        `<option value="${c.id}"${c.id === CAST.from ? " selected" : ""}>${esc(c.name)}</option>`).join("")}</select></label>`
      : `<p class="cast-as-one">Cast as <b>${esc(CAST.mine[0].name)}</b></p>`}

    <div class="cast-fx">${(state.benefits || []).map(b => {
      const k = b.kind || "modifier";
      const once = k === "heal" || k === "tempHp";
      return `<div class="cast-fx-r${once ? " once" : ""}">
        <span>${esc(castBenefitSays(b))}</span>
        <em>${esc(b.from ? castDerivedSays(b) : (b.note || ""))}</em>
        <i>${once ? "they take it" : b.rounds ? `${b.rounds}r` : "until dropped"}</i></div>`;
    }).join("")}
    </div>

    <h3 class="cast-h">Who it lands on <span>${CAST.chosen.size} of ${esc(cap.says)}</span>
      <i>${esc(state.compSub)}</i></h3>
    <div class="cast-who">${pool.map(r => {
      const on = CAST.chosen.has(r.id);
      return `<button class="cast-t${on ? " on" : ""}${!on && full ? " dis" : ""}"
        onclick="toggleCastTarget(${r.id})" title="${escAttr(r.name)} — ${escAttr(r.player)}">
        ${castPlate(r)}<b>${esc(r.name)}</b><i>${esc(r.mine ? "you" : r.player)}</i></button>`;
    }).join("") || `<p class="hint">${state.compSub === "Ally"
      ? "No other player has a character yet — Ally reaches the rest of the table, not you."
      : "Nobody to cast at."}</p>`}</div>

    <p class="hint">What it grants is worked out against <b>you</b>, now, and frozen there — it will
      not follow either of you afterwards. Everything one cast hands out ends together when you drop
      concentration, from your sheet's Round card.</p>

    <div class="acct-row">
      <button class="mini on" onclick="doCast()"${CAST.busy ? " disabled" : ""}>Cast it</button>
      <button class="mini" type="button" onclick="document.getElementById('castDlg').close()">Cancel</button>
    </div>`;
}

function setCastFrom(id) { CAST.from = Number(id) || null; }

function toggleCastTarget(id) {
  const cap = castTargetCap();
  if (CAST.chosen.has(id)) CAST.chosen.delete(id);
  else if (CAST.chosen.size < cap.n) CAST.chosen.add(id);
  else return toast(`${state.compSub} at this slot reaches ${cap.blurb}.`);
  renderCast();
}

async function doCast() {
  if (CAST.busy) return;
  if (!CAST.chosen.size) return toast("Choose who it lands on.");
  const label = (state.sealName || "").trim() ||
    INDEX.find(c => c.id === state.core)?.name || "A seal";
  CAST.busy = true;
  renderCast();
  try {
    const out = await api("POST", "api/effects", {
      fromCharacterId: CAST.from, label,
      benefits: state.benefits, targets: [...CAST.chosen],
    });
    document.getElementById("castDlg").close();
    toast(`${label} — ${out.targets.join(", ")}`);
  } catch (err) {
    toast(err.message);
  } finally {
    CAST.busy = false;
  }
}

// One line saying what a benefit hands over, in the AUTHORED shape — before the server resolves it.
// `targets.js` says the same thing about a resolved one; these two readings of a seal have to
// agree, which is why both are one function rather than inline strings in four places.
function castBenefitSays(b) {
  const k = b.kind || "modifier";
  if (k === "advantage") return `advantage on ${castTargetLabel(b.target)}`;
  if (k === "heal") return `heals ${b.dice || "—"}`;
  if (k === "tempHp") return `${b.dice || "—"} temporary HP`;
  if (k === "defence") {
    const name = (state.benefitMenu?.damageTypes || []).find(d => d.id === b.dtype)?.name || b.dtype;
    return `${b.standing === "immune" ? "immune to" : "resistant to"} ${String(name).toLowerCase()}`;
  }
  if (k === "turn") {
    const n = Number(b.n) || 1;
    return `${n > 1 ? `${n} extra ` : "an extra "}${b.turnKind}${n > 1 ? "s" : ""}`;
  }
  return `${b.from ? "" : sgn(b.amount)} ${castTargetLabel(b.target)}`.trim();
}

// What a target is called, for the one line that says what is being handed over. The authoritative
// labels come with the menu from /api/mod-targets, which the composer has already fetched by the
// time there is a benefit to cast.
function castTargetLabel(id) {
  return (state.benefitMenu?.targets || []).find(t => t.value === id)?.label || id;
}
const CAST_TIMES = { 0.5: "half", 1: "", 2: "twice", 3: "three times" };
function castDerivedSays(b) {
  const t = CAST_TIMES[Number(b.times) || 1];
  // "proficiency bonus", not "proficiency bonus modifier" — it is the one derivation that is not
  // an ability score, and the sheet words it the same way.
  const what = b.from === "prof" ? "proficiency bonus" : `${ABIL_LONG[b.from] || b.from} modifier`;
  return `${t ? `${t} your` : "your"} ${what}`;
}
