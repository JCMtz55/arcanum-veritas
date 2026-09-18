// Arcanum Veritas Builder — The Damage tab

// ═══════════════════════════════════════════════════════════
//  UTILS
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
//  DAMAGE — every damage type and its Absolute evolution
// ═══════════════════════════════════════════════════════════
const IRRESISTIBLE = new Set(["void", "all-mighty"]);
const DAMAGE_FAMILIES = [
  { key: "physical",  label: "Physical",     color: "steel",  types: ["Bludgeoning", "Piercing", "Slashing"] },
  { key: "elemental", label: "Elemental",    color: "ember",  types: ["Acid", "Cold", "Fire", "Lightning", "Thunder", "Poison"] },
  { key: "arcane",    label: "Arcane & Spirit", color: "indigo", types: ["Force", "Necrotic", "Radiant", "Psychic"] },
  { key: "beyond",    label: "Beyond",       color: "brass",  types: ["Sanguine", "Void", "All-Mighty"] },
];
const DAMAGE_INFO = {
  "Acid":        { ord: "Dissolving chemistry — burns that eat through armour, hide and flesh.",
                   abs: "Acid that dissolves the idea of a surface. It eats through the protection itself — ward, plate, or enchantment — before it reaches the body." },
  "Bludgeoning": { ord: "Blunt force: impact, crushing, the fall and the fist.",
                   abs: "The weight of the world. Impact as the ground itself moving — it shatters whatever was braced to hold it." },
  "Cold":        { ord: "Freezing that numbs, slows, and cracks.",
                   abs: "Cold past the point where heat can return — a frost that does not thaw, because warmth has forgotten the way back." },
  "Fire":        { ord: "Flame and heat.",
                   abs: "Fire with Kaiser's breath in it. It burns what has no fuel, and it does not care what it was told it could not burn." },
  "Force":       { ord: "Pure magical energy, shaped into a blow.",
                   abs: "Force from beyond the sky — the pressure of the stars themselves, pressing down on one point." },
  "Lightning":   { ord: "Electric discharge.",
                   abs: "Lightning that finds the current already running through every living thing, and runs it backwards." },
  "Necrotic":    { ord: "Death-energy that withers what lives.",
                   abs: "Not decay but the certainty of it — the end arriving early, and on time." },
  "Piercing":    { ord: "Punctures, stabs, and arrows.",
                   abs: "The point that goes through everything placed in front of it, and keeps going." },
  "Poison":      { ord: "Toxins and venom.",
                   abs: "Poison concentrated to its idea — it finds a way into bodies that do not breathe, eat, or bleed." },
  "Psychic":     { ord: "Harm dealt to the mind.",
                   abs: "The nerves themselves burn: pain written straight onto the body's signal, past any mind that could refuse it." },
  "Radiant":     { ord: "Searing, holy, or blinding light.",
                   abs: "Light as judgment — the Sun's own gaze, which does not ask whether a thing wants to be seen." },
  "Sanguine":    { ord: "The body attacking itself — vessels bursting, organs hemorrhaging, veins writhing with cursed memory. Hemomancy, blood hexes, Grimm malice.",
                   abs: "The blood no longer answers its owner at all. It answers you.",
                   rules: [
                     ["Purely vital", "Resistance to necrotic, poison, or physical damage doesn't mitigate it. Only creatures with no blood, or protected by divine anti-hemomancy, can be immune."],
                     ["Living only", "Only creatures with a working circulatory system suffer it — constructs, oozes and most undead are immune unless altered by magic."],
                     ["Blood Echo", "A creature reduced to 0 hit points by it gains 2 Wounds and rolls on the Sanguine Injury table."] ] },
  "Slashing":    { ord: "Cuts, cleaves, and tears.",
                   abs: "A cut that parts what should not part — sinew, bond, and ward alike." },
  "Thunder":     { ord: "Concussive sound.",
                   abs: "Sound at the one frequency that breaks a thing from the inside." },
  "Void":        { ord: "Entropy and unreality, the violation of natural law — Nightmares, corrupted magic, Grimm mutations, the Denizens of Insomnia. The memory of a world that never was.",
                   abs: "Born at its zenith. Void has no gentler form to grow out of.",
                   born: true,
                   rules: [
                     ["Irresistible", "Nothing resists, reduces, or absorbs it — not immunity, resistance, temporary hit points, or spells like Absorb Elements."],
                     ["Vital Corrosion", "The target's hit point maximum drops by half the Void damage it took, until a long rest or Greater Restoration."],
                     ["Nightmare Mark", "A creature reduced to 0 hit points by it makes a Dream save (DC 10 + the Void damage dealt) or gains 2 Dream Exhaustion; a Dreamer who fails carries a Nightling seed."] ] },
  "All-Mighty":  { ord: "Conceptual force made real — belief becoming harm, the story of a blow rewriting the truth of a soul. Grimms, Lucidlike items, Awakened Dreamers, Divine Expressions, Cognitions.",
                   abs: "Born at its zenith. To imagine the wound is already to have dealt it.",
                   born: true,
                   rules: [
                     ["Unresistable Narrative", "It ignores every form of resistance, reduction, and immunity unless explicitly stated. Not even gods shrug it off."],
                     ["Soul-Writing", "A creature reduced to 0 hit points by it disintegrates into script or dream dust; slain in Ephemer, its soul must be re-imagined (Wish, True Resurrection, or miracle) to return. Inside Insomnia, a Dreamer makes a DC 15 Dream save or is ejected from the Node with 2 Dream Exhaustion."],
                     ["Construct of Will", "It deals extra damage when its wielder controls a Node, is Dream Walking, or has used an ability fuelled by belief, passion, or memory this turn."] ] },
};
function familyOf(type) { return DAMAGE_FAMILIES.find(f => f.types.includes(type)); }

// Who deals what: the Cognition's own damageType, and any other type its Verums or Sigils name
let DMG_USE = null;
async function damageUse() {
  const ready = INDEX.filter(c => c.ready);
  await Promise.all(ready.map(c => loadCognition(c.id)));
  const primary = {}, secondary = {};
  const keys = new Set(Object.keys(DAMAGE_TYPES).map(k => k.toLowerCase()));
  ready.forEach(c => {
    const cog = LOADED[c.id]; if (!cog) return;
    const own = baseType(cog.damageType);
    if (keys.has(own)) (primary[own] ||= []).push(c);
    const seen = new Set();
    const walk = o => {
      if (!o || typeof o !== "object") return;
      if (Array.isArray(o)) return o.forEach(walk);
      if (typeof o.type === "string") { const b = baseType(o.type); if (keys.has(b) && b !== own) seen.add(b); }
      Object.values(o).forEach(walk);
    };
    walk(cog.verumEffects); walk(cog.complementEffects);
    seen.forEach(b => (secondary[b] ||= []).push(c));
  });
  return (DMG_USE = { primary, secondary });
}
// When a Cognition's damage turns Absolute: its own threshold, or sooner through one Verum
function absoluteFrom(cog) {
  const base = cog?.absoluteTier ?? ABSOLUTE_FROM_TIER;
  let best = { tier: base, via: null };
  Object.values(cog?.verumEffects || {}).flat().forEach(v => (v.tiers || []).forEach((t, i) => {
    if ((partMech(t) || {}).absolute === true && i < best.tier) best = { tier: i, via: v.name };
  }));
  return best;
}
function cogChip(c, withLevel) {
  const cog = LOADED[c.id], a = withLevel ? absoluteFrom(cog) : null;
  const lvl = !a ? "" : IRRESISTIBLE.has(baseType(cog?.damageType)) ? "" :
    `<i>${a.via ? `Lv ${TIERS[a.tier].min} via ${esc(a.via)}` : `Lv ${TIERS[a.tier].min}`}</i>`;
  return `<button class="dmg-cog" onclick="setView('codex'); openCodex('${escAttr(c.id)}')" title="Open ${esc(c.name)} in the Codex">
    <span class="ico">${cogIcon(c)}</span>${esc(c.name)}${lvl}</button>`;
}

function openDamage(ref) { state.dmgRef = ref; renderDamageList(); renderDamage(); document.getElementById("damageBody").scrollTop = 0; }
function renderDamageList() {
  const box = document.getElementById("damageList"); if (!box) return;
  const on = state.dmgRef;
  box.innerHTML = `<button class="cog${on === "overview" ? " core" : ""}" onclick="openDamage('overview')"><span class="nm">Overview</span></button>` +
    DAMAGE_FAMILIES.map(f => `<div class="rail-grp dmg-${f.color}">${f.label}</div>` + f.types.map(ty =>
      `<button class="cog${on === ty ? " core" : ""}" onclick="openDamage('${escAttr(ty)}')">
        <span class="nm">${ty}</span><span class="dmg-arrow">${DAMAGE_INFO[ty]?.born ? "born Absolute" : "→ " + DAMAGE_TYPES[ty]}</span></button>`).join("")).join("");
}
async function renderDamage() {
  const host = document.getElementById("damageBody"); if (!host) return;
  const use = DMG_USE || await damageUse();
  const ref = state.dmgRef || "overview";

  if (ref === "overview") {
    let h = `<div class="cdx"><div class="cdx-hd"><div><h1>Damage &amp; the Absolute</h1>
      <p class="cdx-desc">Every damage type has a zenith. A seal starts in the ordinary form and grows into the Absolute one.</p></div></div>`;
    h += `<div class="cdx-sec"><h2>How it works</h2><div class="cdx-defs">
      <div class="cdx-def"><b>The progression</b><span>A Cognition deals its ordinary type through Tiers I–II. From <strong>Tier III (level 11)</strong> every point of its seal damage — Verum, Sigils, ticks and riders — turns Absolute. Some get there sooner: a Cognition can set its own threshold (Sun is Holy from level 1), and a single Verum can reach it early (Nightmare's Void-Bleed).</span></div>
      <div class="cdx-def"><b>Resistance</b><span>Against Absolute damage it doesn't halve — it <strong>reduces</strong> the damage by <strong>2 × the target's Proficiency Bonus</strong>, once per damage roll, never below 0.</span></div>
      <div class="cdx-def"><b>Immunity</b><span>Doesn't negate — it reduces by <strong>4 × the target's Proficiency Bonus</strong>.</span></div>
      <div class="cdx-def"><b>Vulnerability</b><span>Still doubles it.</span></div>
      <div class="cdx-def"><b>“Ignores resistance”</b><span>Below Tier III: ignores the halving or negation. Against Absolute damage: ignores the reduction. “Immunity counts only as resistance” means half damage before, the 2× reduction after.</span></div>
      <div class="cdx-def"><b>Born Absolute</b><span><strong>Void</strong> and <strong>All-Mighty</strong> have no gentler form. Nothing resists, reduces, or absorbs them, at any level.</span></div>
      <div class="cdx-def"><b>Protection</b><span>Text that <em>protects</em> — “resistance to fire damage” — keeps the ordinary name. Against a seal it grants the reduction; against everything else it works as usual.</span></div>
    </div></div>`;
    h += `<div class="cdx-sec"><h2>The sixteen</h2><div class="tbl-wrap"><table class="tbl dmg-tbl">
      <thead><tr><th>Ordinary</th><th></th><th>Absolute</th><th>Dealt by</th></tr></thead><tbody>` +
      DAMAGE_FAMILIES.map(f => f.types.map(ty => {
        const who = use.primary[ty.toLowerCase()] || [];
        return `<tr onclick="openDamage('${escAttr(ty)}')"><td class="dmg-${f.color}">${ty}</td><td>→</td>
          <td><strong>${DAMAGE_TYPES[ty]}</strong>${DAMAGE_INFO[ty]?.born ? ` <span class="t">born Absolute</span>` : ""}</td>
          <td class="wrap">${who.map(c => esc(c.name)).join(" · ") || `<span style="opacity:.5">—</span>`}</td></tr>`;
      }).join("")).join("") + `</tbody></table></div></div>`;
    host.innerHTML = h + `</div>`;
    return;
  }

  const ty = ref, info = DAMAGE_INFO[ty] || {}, fam = familyOf(ty), abs = DAMAGE_TYPES[ty];
  const who = use.primary[ty.toLowerCase()] || [], also = use.secondary[ty.toLowerCase()] || [];
  let h = `<div class="cdx"><div class="cdx-hd"><div>
    <div class="dmg-fam dmg-${fam?.color}">${fam?.label || ""}</div>
    <h1>${ty} <span class="dmg-to">→</span> <span class="dmg-abs">${abs}</span></h1>
    <p class="cdx-desc">${info.born ? "Born at its zenith — irresistible at every level." : "Ordinary through Tier II · Absolute from Tier III (level 11), or sooner where a Cognition says so."}</p></div></div>`;
  h += `<div class="cdx-sec"><div class="dmg-evo">
    <div class="dmg-step"><b>${ty}</b><em>${info.born ? "as it arrives" : "ordinary"}</em><p>${esc(info.ord || "")}</p>
      <span>${info.born ? "Nothing resists, reduces, or absorbs it." : "Resistance halves it · immunity negates it"}</span></div>
    <div class="dmg-arr">→</div>
    <div class="dmg-step abs"><b>${abs}</b><em>${info.born ? "already Absolute" : "Absolute"}</em><p>${esc(info.abs || "")}</p>
      <span>${info.born ? "Irresistible — no reduction either." : "Resistance −2 × their PB · immunity −4 × their PB · vulnerability doubles"}</span></div>
  </div></div>`;
  if (info.rules?.length) h += `<div class="cdx-sec"><h2>Special rules</h2><div class="cdx-defs">` +
    info.rules.map(([n, r]) => `<div class="cdx-def"><b>${esc(n)}</b><span>${esc(r)}</span></div>`).join("") + `</div></div>`;
  h += `<div class="cdx-sec"><h2>Dealt by</h2><p class="cdx-rings">Cognitions whose seals deal ${ty}${info.born ? "" : `, and the level they turn it ${abs}`}.</p>
    <div class="dmg-cogs">${who.map(c => cogChip(c, true)).join("") || `<span class="cdx-soon" style="padding:0">No Cognition deals ${ty} as its own type yet.</span>`}</div></div>`;
  if (also.length) h += `<div class="cdx-sec"><h2>Also appears in</h2><p class="cdx-rings">A Verum, Sigil, rider or hazard of these deals ${ty} too.</p>
    <div class="dmg-cogs">${also.map(c => cogChip(c, false)).join("")}</div></div>`;
  host.innerHTML = h + `</div>`;
}
