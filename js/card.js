// Arcanum Veritas Builder — The seal card, damage math, and the Absolute progression

// ═══════════════════════════════════════════════════════════
//  MAIN RENDER
// ═══════════════════════════════════════════════════════════
// ─── Gather every complement's live text. One Seal, One Roll: Sigils never add their own save.
function gatherRiders(tier) {
  const riders = [], missing = [];
  state.complements.forEach(cs => {
    const cog   = LOADED[cs.id];
    const name  = INDEX.find(c => c.id === cs.id)?.name || cs.id;
    const avail = complementPool(cog);
    const fx    = avail.find(f => f.name === cs.compEffect) || avail[0];
    if (!fx) { missing.push(name); return; }
    riders.push({ name, fxName: fx.name, parts: [fx.effect, ...liveUpgrades(fx.upgrades, tier)] });
  });
  return { riders, missing };
}

// Trim an upgrade line's "Level 5+:" prefix — the card already filters by tier
function stripLvl(t) { return String(t).replace(/^\s*Level\s+\d+\+\s*:\s*/i, ""); }

// The section header already says when a rider fires, so drop the lead-in boilerplate
const LEAD_INS = [
  /^On a hit or failed saving throw against the primary effect,\s*/i,
  /^On a hit or failed save against the primary effect\s*[—–,]\s*/i,
  /^On a hit or failed save against the primary effect,\s*/i,
  /^When the primary effect hits or a target fails their save,\s*/i,
  /^On a hit or failed saving throw,\s*/i,
  /^When the primary effect hits or a target fails their saving throw,\s*/i,
  /^When the primary effect deals damage,\s*/i,
  /^When the primary effect resolves,\s*/i,
  /^On a failed save(?:ing throw)?,\s*/i,
];
function stripLead(t) {
  let out = String(t);
  for (const re of LEAD_INS) out = out.replace(re, "");
  return out.charAt(0).toUpperCase() + out.slice(1);
}
// Drop a trailing em-dash clause only when it carries no rules content (pure flavor)
const RULES_WORDS = /\d|\bd\d|advantage|disadvantage|save|saving|DC|damage|cannot|can't|must|immune|resist|condition|speed|feet|ft\b|round|turn|minute|hour|action|reaction|restrained|prone|frightened|stunned|paralyzed|blinded|charmed|poisoned|HP|hit point/i;
function stripFlavorTail(t) {
  const m = String(t).match(/^([\s\S]*?)\s*[—–]\s*([^—–]+)$/);
  if (!m) return t;
  const tail = m[2].trim();
  if (tail.length < 80 && !RULES_WORDS.test(tail)) return m[1].trim();
  return t;
}
// The die size of the current Ring row, so "one damage die of the primary effect's type" resolves
function primaryDie() {
  const sub = currentSub(); if (!sub) return null;
  const row = sub.rows.find(r => r[0] === ORDINALS[state.slotLevel]); if (!row) return null;
  for (const col of ["Damage","Damage / turn","Weapon Die","Healing","Healing / Target","Absorb"]) {
    const i = sub.columns.indexOf(col);
    if (i >= 0) { const m = String(row[i]).match(/d(\d+)/); if (m) return "d" + m[1]; }
  }
  return null;
}
const WORDNUM = { one:1, two:2, three:3, four:4, five:5 };
function resolveDice(t) {
  const die = primaryDie(); if (!die) return t;
  return String(t)
    .replace(/\b(one|two|three|four|five)\s+(?:additional\s+)?damage\s+(?:die|dice)\s+of\s+the\s+primary\s+effect'?s?\s+type(\s*\(min(?:imum)?\s*\d+d\d+\))?/gi,
             (m, w) => `${WORDNUM[w.toLowerCase()]}${die}`)
    .replace(/\bincreases?\s+to\s+(one|two|three|four|five)\s+dice\b/gi,
             (m, w) => `increases to ${WORDNUM[w.toLowerCase()]}${die}`);
}
// The SAVES header already states the DC and each line is labelled with its ability
function stripSaveBoiler(t) {
  return String(t)
    .replace(/^(?:the target\s+|they\s+|creatures?\s+)?(?:must\s+)?succeeds?\s+on\s+an?\s+[A-Z][a-z]+\s+(?:saving throw|save)\s+vs\s+DC\s*\d+\s+or\s+/i, "Fail: ")
    .replace(/[,—–]?\s*(?:the target|they|it)\s+must\s+succeeds?\s+on\s+an?\s+[A-Z][a-z]+\s+(?:saving throw|save)\s+vs\s+DC\s*\d+\s+or\s+/i, " — fail: ")
    .replace(/\s+vs\s+DC\s*\d+/gi, "");
}
function compact(t) {
  let out = stripFlavorTail(stripLead(stripLvl(t)));
  out = resolveDice(out);
  out = stripSaveBoiler(out);
  out = foldSigilSave(out);
  return out.replace(/\s+/g, " ").trim();
}
// One Seal, One Roll — a Sigil's own saving throw folds into the seal's single roll
function foldSigilSave(t) {
  return String(t)
    .replace(/on a failed\s+[A-Z][a-z]+\s+(?:saving throw|save)/gi, "on the failed save")
    .replace(/(?:the target |they |it )?must succeeds?\s+on an?\s+[A-Z][a-z]+\s+(?:saving throw|save)\s+or\s+/gi, "on a failed save, ")
    .replace(/succeeds?\s+on an?\s+[A-Z][a-z]+\s+(?:saving throw|save)/gi, "succeed on the save")
    .replace(/\bthey succeeds\b/gi, "they succeed")
    .replace(/([.!?]\s+)(on the failed save)/g, (m, p, r) => p + r.charAt(0).toUpperCase() + r.slice(1));
}

function buildPlayCard(coreCog, tier) {
  const coreEntry = INDEX.find(c => c.id === state.core);
  const cd  = COMP_DATA[state.compType];
  const sub = cd.subtypes[state.compSub];
  const L   = [];

  const scaleRow = sub.rows.find(r => r[0] === ORDINALS[state.slotLevel]);
  const cell = (col) => {
    const i = sub.columns.indexOf(col);
    return i >= 0 && scaleRow ? resolve(scaleRow[i]) : null;
  };

  // ── Header
  const bits = [`${ORDINALS[state.slotLevel]} slot`, `Char Lv ${state.charLevel}`];
  if (sub.shape) bits.push(SHAPES[state.shape].label);
  if (state.manner !== "standard") bits.push(MANNERS[state.manner].label);
  if (sub.concentration) bits.push("Concentration");
  if (sub.reaction) bits.push("REACTION");
  if (sub.saveDisadvantage) bits.push("first save at DISADVANTAGE");
  L.push(`${(coreEntry?.name || "—").toUpperCase()} · ${cd.label} — ${state.compSub}`);
  L.push(bits.join(" · "));

  // ── The one line of math that matters
  const stat = [];
  const dmg = cell("Damage") || cell("Damage / turn") || cell("Healing") || cell("Healing / Target") || cell("Absorb");
  if (state.compSub === "Direct Attack") stat.push(`Attack ${sgn(sealAttack())}`);
  if (dmg) {
    const kind = (cell("Healing") || cell("Healing / Target")) ? "healing"
               : cell("Absorb") ? "absorbed"
               : liveType(coreCog?.damageType || "damage", coreCog, tier);
    const absNote = kind !== "healing" && kind !== "absorbed" && isAbsolute(coreCog, tier);
    const { head, other } = damageLedger(dmg, coreCog, tier, kind);
    stat.push(`${head} ${kind}${absNote ? " (ABSOLUTE: resistant −2×their PB, immune −4×their PB)" : ""}`);
    other.forEach(s => stat.push(`+${s.count}${s.die} ${s.type ? liveType(s.type, coreCog, tier) : kind} (${s.source})`));
    const doom = doomOf(coreCog, tier), roll = doomRoll(head, doom);
    if (roll) stat.push(`Doom ${roll} ${doom.type ? liveType(doom.type, coreCog, tier) : kind} (${doom.when || "later"})`);
  }
  ["Range","Radius","Targets","Duration","Buff Duration","Zone Duration","Weapon Die","CR cap","Size","AC","HP / segment","Max size","Quality","Tier","Scope"]
    .forEach(c => { const v = cell(c); if (v) stat.push(`${c}: ${v}`); });
  if (coreCog?.savingThrow && state.compSub !== "Direct Attack")
    stat.push(`${coreCog.savingThrow} save DC ${verumDC()}`);
  L.push(stat.join(" · "));
  if (coreCog?.cost) L.push(`COST — ${cardLine(coreCog.cost)}`);
  masteryOf(coreCog).forEach(tr => L.push(`${tr.name.toUpperCase()} — ${resolve(tr.card)}`));
  const phT = phaseOf(coreCog);
  if (phT) L.push(`PHASE — ${phT.now.name}: ${resolve(phT.now.card)} (then ${phT.next.name} or ${phT.prev.name}, or hold it for 1 Dream Exhaustion)`);
  const tkT = trackerOf(coreCog);
  if (tkT) {
    const avT = coreVerumOf(coreCog);
    L.push(`${(tkT.tr.name || "TRACKER").toUpperCase()} — activation ${tkT.n}/${tkT.win}, ${tkT.now === "gold" ? `GOLD: spend ${avT?.fuel ?? "the"} Corruption` : "BLACK: gain 1d4 Corruption, spend nothing"}`);
    if (tkT.last && tkT.reck) L.push(`RECKONING — ${tkT.reck.name}: ${resolve(tkT.reck.card)}`);
    if (tkT.last && tkT.reck?.corona && avT?.corona) L.push(`CORONA — ${resolve(avT.corona.card)}`);
  }
  L.push("");

  // ── Core Verum: every tier reached, oldest first (they accumulate)
  const coreVerums  = coreCog?.verumEffects?.[verumKey()] || [];
  const activeVerum = coreVerums.find(v => v.name === state.coreVerum) || coreVerums[0];
  if (activeVerum) {
    L.push(`CORE — ${(activeVerum.name || "").toUpperCase()}${tier > 0 ? "  (tiers stack; a bigger number replaces a smaller one)" : ""}`);
    coreLadder(activeVerum, tier).forEach(r => L.push(`  ${r.now ? "▸" : "·"} ${r.label}: ${r.line}`));
    L.push("");
  }

  // ── Riders — all resolve off the seal's single roll
  const { riders, missing } = gatherRiders(tier);
  const isAttack = state.compSub === "Direct Attack";
  if (riders.length) {
    L.push(isAttack
      ? "ON HIT — the attack roll is the only d20"
      : `ON A FAILED ${(coreCog?.savingThrow || "—").toUpperCase()} SAVE — DC ${verumDC()}, the only d20`);
    riders.forEach(e => {
      L.push(`  [${e.name}] ${cardLine(e.parts[0])}`);
      e.parts.slice(1).forEach(p => L.push(`      ↑ ${cardLine(p)}`));
    });
    L.push(`  (Sigil conditions last until the end of the target's next turn)`);
    L.push("");
  }
  if (missing.length) L.push(`(no ${verumLabel()} complement defined: ${missing.join(", ")})`);

  return L;
}

function esc(t){ return String(t).replace(/[&<>]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;"}[c])); }

// Chips derived from the mech layer of everything in play
function collectTags(coreCog, tier) {
  const conds = new Set(), denies = new Set();
  let resource = null;
  const push = (p) => {
    const m = partMech(p); if (!m) return;
    (m.conditions || []).forEach(c => c.name && conds.add(c.name));
    (m.deny || []).forEach(d => denies.add(d));
    if (m.resource?.name) resource = m.resource.name;
  };
  const cv = coreCog?.verumEffects?.[verumKey()] || [];
  const av = cv.find(v => v.name === state.coreVerum) || cv[0];
  if (av) for (let i = 0; i <= tier; i++) push(av.tiers[i]);
  gatherRiders(tier).riders.forEach(e => e.parts.forEach(push));
  return { conds: [...conds], denies: [...denies], resource };
}

// A Core tier that adds dice adds them to the Ring's damage — show the resulting total
function totalDamage(baseCell, coreCog, tier) {
  if (!baseCell) return null;
  const m = String(baseCell).match(/^(\d+)d(\d+)(.*)$/);
  if (!m) return baseCell;
  let n = +m[1]; const die = m[2], rest = m[3] || "";
  const cv = coreCog?.verumEffects?.[verumKey()] || [];
  const av = cv.find(v => v.name === state.coreVerum) || cv[0];
  let bonus = 0, perSlot = 0;
  if (av) for (let i = 0; i <= tier; i++) {
    const mech = partMech(av.tiers[i]) || {};
    const b = mech.damage?.bonusDice;
    if (typeof b === "number") bonus = b;   // tiers restate the total, they don't stack
    const p = mech.heal?.perSlot;           // flat healing of N × slot level, restated the same way
    if (typeof p === "number") perSlot = p;
  }
  if (!bonus && !perSlot) return baseCell;
  let tail = rest;
  if (perSlot) {
    const flat = perSlot * state.slotLevel;
    const fm = rest.match(/^\s*\+\s*(\d+)\s*$/);
    tail = fm ? ` + ${+fm[1] + flat}` : `${rest} + ${flat}`;
  }
  const bits = { total: `${n + bonus}d${die}${tail}`, base: `${n}d${die}${perSlot ? rest : ""}` };
  bits.bonus = [bonus ? `+${bonus}d${die}` : "", perSlot ? `+${perSlot * state.slotLevel} (${perSlot}×slot)` : ""].filter(Boolean).join(" ");
  return bits;
}

// A Sigil adds to the seal's own damage only when its live line leads with "+N die(s)" —
// that is the shorthand for dice of the Ring's primary die. Everything else a Complement
// does (bleed ticks, terrain, per-turn ramps, riders on later turns) resolves on its own
// clock and must NOT be folded into the number you roll on the hit.
// Later live parts restate the total rather than stacking, exactly like Core tiers.
function sigilDamage(tier) {
  const die = primaryDie(); if (!die) return [];
  const baseSize = +die.slice(1);
  const out = [];
  gatherRiders(tier).riders.forEach(e => {
    let count = 0, type = null, minSize = 0;
    e.parts.forEach((p, i) => {
      const md = (partMech(p) || {}).damage || {};
      const d0 = Array.isArray(md.dice) ? md.dice[0] : md.dice;
      const dm = d0 && String(d0).match(/^(\d+)d(\d+)$/);
      // The "(min 1d6)" floor is authored on the base effect. A later upgrade's mech.damage
      // may describe something else entirely — collision damage, a tick — so don't read it.
      if (dm && i === 0) minSize = +dm[2];
      const m = String(partCard(p) || compact(partText(p)))
        .match(/^\s*\+\s*(\d+)\s*(?:dice|die)\b\s*([A-Za-z]+)?/i);
      if (m) {
        count = +m[1];
        const word = m[2] && !/^(of|and|to|on|per)$/i.test(m[2]) ? m[2].toLowerCase() : null;
        if (word) type = word;                       // a type named in the card lead always wins
        else if (!type && md.type) type = md.type;   // otherwise the first declaration stands
      }
    });
    if (count) out.push({ source: e.name, count, die: "d" + Math.max(baseSize, minSize), type });
  });
  return out;
}
// A Doom is the seal's damage coming back later, carrying extra dice of the Ring's die.
// Tiers accumulate, so later `doom` fields override earlier ones key by key.
function doomOf(coreCog, tier) {
  const cv = coreCog?.verumEffects?.[verumKey()] || [];
  const av = cv.find(v => v.name === state.coreVerum) || cv[0];
  let d = null;
  if (av) for (let i = 0; i <= tier && i < av.tiers.length; i++) {
    const m = partMech(av.tiers[i])?.doom;
    if (m) d = { ...d, ...m };
  }
  return d && d.extraDice ? d : null;
}
// What the Doom will land, written the way you'd roll it
function doomRoll(head, d) {
  const die = primaryDie(); if (!die || !d) return null;
  const m = String(head).match(/^(\d+)d(\d+)(.*)$/);
  if (d.share === "half" || !m) return `½ the hit +${d.extraDice}${die}`;
  return `${+m[1] + d.extraDice}d${m[2]}${m[3]}`;
}

// The damage types that exist, each with its Absolute form — the type at its zenith.
// A Cognition's damageType is the ordinary type. From Tier III (Lv 11+) every seal's damage
// turns Absolute; a Verum tier with mech.absolute: true gets there earlier. Against Absolute
// damage, resistance and immunity don't halve or negate — they reduce by 2× / 4× the target's PB.
const ABSOLUTE_FROM_TIER = 2;   // index into TIERS — Tier III
const DAMAGE_TYPES = {
  "Acid": "Corrosive", "Bludgeoning": "Tectonic", "Cold": "Everfrost", "Fire": "Infernal",
  "Force": "Astral", "Lightning": "Voltaic", "Necrotic": "Doom", "Piercing": "Impale",
  "Poison": "Toxin", "Psychic": "Neural", "Radiant": "Holy", "Sanguine": "Hemal",
  "Slashing": "Severe", "Thunder": "Sonic", "Void": "Void", "All-Mighty": "All-Mighty",
};
function baseType(s) {
  const k = String(s || "").toLowerCase().trim();
  const hit = Object.entries(DAMAGE_TYPES).find(([b, a]) => k === b.toLowerCase() || k === a.toLowerCase());
  return hit ? hit[0].toLowerCase() : k;
}
// Fire and Infernal are the same damage for the purpose of one total
function sameType(a, b) { return baseType(a) === baseType(b); }
function absoluteName(type) {
  const b = Object.keys(DAMAGE_TYPES).find(t => t.toLowerCase() === baseType(type));
  return b ? DAMAGE_TYPES[b] : null;
}
// Is the seal's damage Absolute at this tier? Tier III and up always; earlier only if a
// live tier of the chosen Verum says so.
function isAbsolute(coreCog, tier) {
  if (IRRESISTIBLE.has(baseType(coreCog?.damageType))) return true;   // Void and All-Mighty are born Absolute
  if (tier >= (coreCog?.absoluteTier ?? ABSOLUTE_FROM_TIER)) return true;   // a Cognition may set its own threshold (Sun: 0)
  const cv = coreCog?.verumEffects?.[verumKey()] || [];
  const av = cv.find(v => v.name === state.coreVerum) || cv[0];
  if (!av) return false;
  for (let i = 0; i <= tier; i++) if ((partMech(av.tiers[i]) || {}).absolute === true) return true;
  return false;
}
// The name a damage type goes by on the card right now
function liveType(type, coreCog, tier) {
  if (!type) return type;
  return isAbsolute(coreCog, tier) ? (absoluteName(type) || type).toLowerCase() : String(type).toLowerCase();
}
// Earliest tier any of the Cognition's Verums turns Absolute (for the Codex)
function earliestAbsolute(cog) {
  if (IRRESISTIBLE.has(baseType(cog?.damageType))) return 0;
  let best = cog?.absoluteTier ?? ABSOLUTE_FROM_TIER;
  Object.values(cog?.verumEffects || {}).flat().forEach(v => (v.tiers || []).forEach((t, i) => {
    if ((partMech(t) || {}).absolute === true && i < best) best = i;
  }));
  return best;
}
// Fold the Sigil dice that share the headline's die and type into it; hand back the rest
function damageLedger(headCell, coreCog, tier, kind) {
  const t = totalDamage(headCell, coreCog, tier);
  let head = (t && typeof t === "object") ? t.total : (t || headCell);
  const bits = (t && typeof t === "object") ? [t.base, t.bonus] : [];
  const other = [];
  sigilDamage(tier).forEach(s => {
    const hm = String(head).match(/^(\d+)d(\d+)(.*)$/);
    if (hm && s.die === "d" + hm[2] && sameType(s.type, kind)) {
      if (!bits.length) bits.push(`${hm[1]}d${hm[2]}`);
      bits.push(`+${s.count}d${hm[2]}`);
      head = `${+hm[1] + s.count}d${hm[2]}${hm[3]}`;
    } else other.push(s);
  });
  return { head, bits, other };
}

function buildPlayCardHTML(coreCog, tier) {
  const coreEntry = INDEX.find(c => c.id === state.core);
  const cd  = COMP_DATA[state.compType];
  const sub = cd.subtypes[state.compSub];
  const isAttack = state.compSub === "Direct Attack";

  const row  = sub.rows.find(r => r[0] === ORDINALS[state.slotLevel]);
  const cell = (c) => { const i = sub.columns.indexOf(c); return i >= 0 && row ? resolve(row[i]) : null; };

  // The numbers you roll, largest first
  let nums = "";
  if (isAttack) nums += `<span class="n atk"><b>${sgn(sealAttack())}</b><i>to hit</i></span>`;
  if (coreCog?.savingThrow)
    nums += `<span class="n dc"><b>${verumDC()}</b><i>${esc(coreCog.savingThrow)} save</i></span>`;
  const dmgCell = cell("Damage") || cell("Damage / turn") || cell("Healing") || cell("Healing / Target") || cell("Absorb");
  if (dmgCell) {
    const kind = (cell("Healing") || cell("Healing / Target")) ? "healing"
               : cell("Absorb") ? "absorbed"
               : liveType(coreCog?.damageType || "damage", coreCog, tier);
    const { head, bits, other } = damageLedger(dmgCell, coreCog, tier, kind);
    const isAbs = kind !== "healing" && kind !== "absorbed" && isAbsolute(coreCog, tier);
    const absTip = !isAbs ? "" : IRRESISTIBLE.has(baseType(kind)) ? ` title="Irresistible — nothing resists, reduces or absorbs it"`
      : ` title="Absolute — resistant targets reduce it by 2 × their PB, immune ones by 4 × their PB"`;
    nums += `<span class="n dmg${isAbs ? " abs" : ""}"${absTip}><b>${esc(head)}</b><i>${esc(kind)}${isAbs ? " · absolute" : ""}</i>` +
            (bits.length ? `<u>${esc(bits.join(" "))}</u>` : "") + `</span>`;
    // Sigil dice of a different type stay their own number — resistance cares
    other.forEach(s => nums += `<span class="n dmg"><b>+${s.count}${esc(s.die)}</b>` +
      `<i>${esc(s.type ? liveType(s.type, coreCog, tier) : kind)}</i><u>${esc(s.source)}</u></span>`);
    // Damage that comes back later gets its own chip, with when it lands
    const doom = doomOf(coreCog, tier), roll = doomRoll(head, doom);
    if (roll) nums += `<span class="n dmg"><b>${esc(roll)}</b><i>doom · ${esc(doom.type ? liveType(doom.type, coreCog, tier) : kind)}</i>` +
      `<u>${esc(doom.when || "later")}</u></span>`;
  }
  [["Range","range"],["Radius","radius"],["Targets","targets"],["Duration","duration"],
   ["Buff Duration","duration"],["Zone Duration","zone"],["Weapon Die","weapon die"],
   ["CR cap","CR"],["Size","size"],["HP / segment","HP each"],["Max size","size"],["Tier","tier"]]
   .forEach(([c,lab]) => { const v = cell(c); if (v) nums += `<span class="n"><b>${esc(v)}</b><i>${lab}</i></span>`; });

  const { conds, denies, resource } = collectTags(coreCog, tier);
  let tags = "";
  if (sub.reaction)      tags += `<span class="t hot">reaction</span>`;
  if (sub.concentration) tags += `<span class="t hot">concentration</span>`;
  if (sub.saveDisadvantage) tags += `<span class="t hot">first save at disadvantage</span>`;
  if (sub.shape && state.shape !== "sphere") tags += `<span class="t">${SHAPES[state.shape].label.toLowerCase()}</span>`;
  if (state.manner !== "standard")           tags += `<span class="t">${MANNERS[state.manner].label.toLowerCase()}</span>`;
  if (resource) tags += `<span class="t">${esc(resource)}</span>`;
  conds.forEach(c  => tags += `<span class="t hot">${esc(c.toLowerCase())}</span>`);
  denies.forEach(d => tags += `<span class="t">no ${esc(d)}</span>`);

  let h = `<div class="card">
    <div class="c-name">${esc(coreEntry?.name || "—")}</div>
    <div class="c-sub">${esc(cd.label)} ${esc(state.compSub)} · ${ORDINALS[state.slotLevel]} slot · level ${state.charLevel}</div>
    <div class="c-nums">${nums}</div>
    ${tags ? `<div class="c-tags">${tags}</div>` : ""}
    ${coreCog?.cost ? `<div class="c-cost">${esc(cardLine(coreCog.cost))}</div>` : ""}
    ${masteryOf(coreCog).length ? `<div class="c-mastery">` + masteryOf(coreCog).map(tr => `<div><b>${esc(tr.name)}</b>${esc(resolve(tr.card))}</div>`).join("") + `</div>` : ""}
    ${(() => { const k = trackerOf(coreCog); if (!k) return ""; const av = coreVerumOf(coreCog);
        return `<div class="c-engine track ${k.now}"><b>${k.now === "gold" ? "☀ Gold Sun" : "● Black Sun"} · ${k.n} of ${k.win}</b>` +
          esc(k.now === "gold" ? `Spend ${av?.fuel ?? "its"} Corruption Point${av?.fuel === 1 ? "" : "s"}` : "Gain 1d4 Corruption Points (no save) — spend nothing") +
          (k.last && k.reck ? `<span><strong>Reckoning — ${esc(k.reck.name)}.</strong> ${esc(resolve(k.reck.card))}</span>` : `<span>${k.win - k.n} more before the Reckoning.</span>`) + `</div>` +
          (k.last && k.reck?.corona && av?.corona ? `<div class="c-corona"><b>☀ Corona — ${esc(av.corona.name)}</b>${esc(resolve(av.corona.card))}</div>` : "");
      })()}
    ${phaseOf(coreCog) ? `<div class="c-engine"><b>${esc(phaseOf(coreCog).now.name)}</b> ${esc(resolve(phaseOf(coreCog).now.card))}<span>Then turn it to ${esc(phaseOf(coreCog).next.name)} or ${esc(phaseOf(coreCog).prev.name)} — or hold it for 1 Dream Exhaustion.</span></div>` : ""}`;

  const cv = coreCog?.verumEffects?.[verumKey()] || [];
  const av = cv.find(v => v.name === state.coreVerum) || cv[0];
  if (av) {
    const lbl = tier > 0 ? "Core verum — every tier reached applies; a bigger number replaces a smaller one" : "Core verum";
    h += `<div class="c-sec"><div class="c-lbl">${lbl}</div><div class="c-core"><b>${esc(av.name)}</b>` +
      coreLadder(av, tier).map(r =>
        `<div class="c-tier${r.now ? " now" : ""}"><span class="c-tl">${esc(r.label)}</span><span>${esc(r.line)}</span></div>`
      ).join("") + `</div></div>`;
  }

  const { riders, missing } = gatherRiders(tier);
  if (riders.length) {
    const lbl = isAttack
      ? "On a hit — the attack roll is the only d20"
      : `On a failed ${esc((coreCog?.savingThrow || "").toLowerCase())} save — the only d20`;
    h += `<div class="c-sec"><div class="c-lbl">${lbl}</div>`;
    riders.forEach(e => {
      h += `<div class="c-row"><div class="c-src">${esc(e.name)}</div><div class="c-txt">${esc(cardLine(e.parts[0]))}` +
           e.parts.slice(1).map(p => `<span class="c-up">${esc(cardLine(p))}</span>`).join("") + `</div></div>`;
    });
    h += `</div>`;
  }
  if (missing.length)
    h += `<div class="c-sec"><div class="c-lbl">Not yet written</div><div class="c-txt">${esc(missing.join(", "))} has no ${esc(verumLabel().toLowerCase())} complement.</div></div>`;

  const foot = [];
  if (riders.length) foot.push("Sigil conditions last until the end of the target's next turn.");
  if (foot.length) h += `<div class="c-foot">${foot.join(" ")}</div>`;
  return h + `</div>`;
}

function buildFullRef(coreCog, tier) {
  const coreEntry = INDEX.find(c => c.id === state.core);
  const cd  = COMP_DATA[state.compType];
  const sub = cd.subtypes[state.compSub];

  const coreVerums  = coreCog?.verumEffects?.[verumKey()] || [];
  const activeVerum = coreVerums.find(v => v.name === state.coreVerum) || coreVerums[0];

  const scaleRow = sub.rows.find(r => r[0] === ORDINALS[state.slotLevel]);
  const scaleStr = scaleRow
    ? sub.columns.map((col, i) => `${col}: ${resolve(scaleRow[i])}`).join("  |  ")
    : "";

  const lines = [
    `ARCANUM VERITAS — ${ORDINALS[state.slotLevel].toUpperCase()} LEVEL SLOT · Char Lv ${state.charLevel}`,
    "═".repeat(52),
    `Composition  : ${cd.label} · ${state.compSub}${sub.shape ? ` · ${SHAPES[state.shape].label}` : ""}`,
    `Manner       : ${MANNERS[state.manner].label}${state.manner!=="standard" ? ` — ${MANNERS[state.manner].desc}` : ""}`,
    `Core         : ${coreEntry?.name}${state.complements.length
      ? `   |   Complements: ${state.complements.map(x=>INDEX.find(c=>c.id===x.id)?.name||x.id).join(", ")}`
      : ""}`,
    `Saving Throw : ${coreCog?.savingThrow || "—"}`,
    `Damage Type  : ${coreCog?.damageType  || "—"}${isAbsolute(coreCog, tier) && absoluteName(coreCog?.damageType) ? ` → ${absoluteName(coreCog.damageType)} (Absolute)` : ""}`,
    `Tier         : ${TIERS[tier].label}`,
    `Numbers      : Prof ${sgn(profBonus())} · Attack ${sgn(sealAttack())} · Verum DC ${verumDC()}`,
    ``,
    `── SCALING (${ORDINALS[state.slotLevel]}) ──`,
    scaleStr,
    ``,
  ];
  // A Cognition that charges for its use says so before anything else it does
  if (coreCog?.cost) lines.push(`── COST ──`, resolve(partText(coreCog.cost)), ``);
  if (masteryOf(coreCog).length) lines.push(`── ${(coreCog.mastery.title || "MASTERY").toUpperCase()} ──`,
    ...masteryOf(coreCog).map(tr => `${tr.name} (Lv ${tr.level || 1}+): ${resolve(tr.text)}`), ``);
  const tkF = trackerOf(coreCog);
  if (tkF) {
    const avF = coreVerumOf(coreCog);
    lines.push(`── ${coreCog.engine.title.toUpperCase()} ──`, resolve(coreCog.engine.text),
      `Now: activation ${tkF.n} of ${tkF.win}, ${tkF.now === "gold" ? `Gold — spend ${avF?.fuel ?? "the"} Corruption` : "Black — gain 1d4 Corruption, spend nothing"}`);
    if (tkF.last && tkF.reck) lines.push(`Reckoning — ${tkF.reck.name}: ${resolve(tkF.reck.card)}`);
    if (tkF.last && tkF.reck?.corona && avF?.corona) lines.push(`Corona — ${avF.corona.name}: ${resolve(avF.corona.text)}`);
    lines.push(``);
  }
  const phF = phaseOf(coreCog);
  if (phF) lines.push(`── ${coreCog.engine.title.toUpperCase()} ──`, resolve(coreCog.engine.text), `Now: ${phF.now.name} (${phF.now.epithet}) — ${resolve(phF.now.card)}`, ``);

  // Sigil dice that land on the seal's own roll, spelled out alongside the Ring's numbers
  const sig = sigilDamage(tier);
  if (sig.length) {
    lines.push(`── SIGIL DICE (added to the hit) ──`);
    sig.forEach(s => lines.push(`+${s.count}${s.die}${s.type ? ` ${s.type}` : ""} — ${s.source}`));
    lines.push(``);
  }

  if (activeVerum) {
    lines.push(`── CORE VERUM: ${(state.coreVerum || activeVerum.name).toUpperCase()} ──`);
    for (let i = 0; i <= tier; i++) {
      lines.push(`[${TIERS[i].label}] ${resolve(partText(activeVerum.tiers[i]))}`);
    }
    lines.push(``);
  }

  if (state.complements.length) {
    lines.push("── COMPLEMENT EFFECTS ──");
    state.complements.forEach(cs => {
      const cog   = LOADED[cs.id];
      const name  = INDEX.find(c => c.id === cs.id)?.name || cs.id;
      const avail = complementPool(cog);
      const activeFx = avail.find(fx => fx.name === cs.compEffect) || avail[0];
      if (activeFx) {
        lines.push(`${name} — ${activeFx.name}:`);
        lines.push(resolve(partText(activeFx.effect)));
        liveUpgrades(activeFx.upgrades, tier).forEach(u => lines.push(`  ↑ ${resolve(partText(u))}`));
      } else {
        lines.push(`${name}: No ${verumLabel()} complement defined.`);
      }
    });
  }

  if (sub.notes) {
    lines.push("");
    lines.push(`── RULES NOTE ──`);
    lines.push(sub.notes);
  }
  return lines;
}
