// Arcanum Veritas Builder — The Paragon path

// ═══════════════════════════════════════════════════════════
//  THE PARAGON PATH
// ═══════════════════════════════════════════════════════════
// The third Cognitive Art, and the only one that builds nothing. Arcanum Veritas composes a
// seal out of any Cognition; Ignition forges an Eidon out of whatever is Burning. A Paragon
// swears themselves to three Cognitions and holds exactly one of them in a Deeper Burn.
//
// Paragon Abilities are written for each character with their DM — "two Paragons of the same
// Cognition may resonate with different parts of it" — so they can't be generated from a
// Cognition's JSON the way a seal's Verum Effects are. PARAGON_BUILDS holds the sets that are
// written today: the three worked examples from the Paragon rules, and Zeke's three. A Devotion
// with no authored set is still a Devotion; its card just says nobody has written it yet.
//
// So this file is a character sheet and a round tracker, not a composer.

const PAR_DEVOTIONS  = 3;    // three Cognitions, sworn to
// The rules ask for a Dream *Score* of 13+. The bar only ever knows the modifier, and a score
// of 13 is a +1, so +1 is the gate the sheet can actually check.
const PAR_MIN_DREAM  = 1;

const PAR_TYPES = {
  passive:    { label: "Passive",    hint: "always on while its Cognition is your Paragon — Rotating ends it" },
  offensive:  { label: "Offensive",  hint: "activated to harm, hinder or break an enemy" },
  supportive: { label: "Supportive", hint: "activated to protect, heal or empower yourself or an ally" },
};
const PAR_ACTS = { action: "Action", bonus: "Bonus Action", reaction: "Reaction" };

// ── Nature's wheel ────────────────────────────────────────
// The Season decides what the Passive does and what Season's Blow and Season's Gift add. The
// lines are functions of the Rank so the card shows the number, not the formula.
function parRadius(tier) { return `${[15, 20, 30, 30][tier]} feet`; }
function parVmPb() { return state.verumMod + profBonus(); }

const PAR_SEASONS = [
  { key: "spring", icon: "🌱", label: "Spring", epithet: "Renewal",
    combat: t => `You and each ally within ${parRadius(t)} regain ${t >= 2 ? 2 * parVmPb() : parVmPb()} hit points.`,
    calm:   "Flowers open where you walk, and seeds you plant sprout within the hour.",
    blow:   () => `Blossoms burst from the wound. Each ally within 10 feet of the target regains ${state.verumMod} hit points.`,
    gift:   t => `Each regains ${t >= 1 ? "4d8" : "2d8"} + ${state.verumMod} hit points.` },
  { key: "summer", icon: "☀️", label: "Summer", epithet: "Thorns",
    combat: t => `Your weapon attacks deal an extra ${t >= 2 ? "2d8" : "1d8"} piercing. A creature that hits you with a melee attack takes ${state.verumMod} piercing damage.`,
    calm:   "You and your companions don't suffer from extreme heat, and fruit ripens at your touch.",
    blow:   () => `The blow deals 2 extra dice.`,
    gift:   t => `Each has advantage on its next attack roll before the start of your next turn.${t >= 1 ? " This hit also adds +1d8 piercing." : ""}` },
  { key: "autumn", icon: "🍂", label: "Autumn", epithet: "Decline",
    combat: t => `Enemies within ${parRadius(t)} can't regain hit points and their speed drops by 10 feet${t >= 3 ? ", and they can't take reactions" : ""}.`,
    calm:   "You can tell how long ago a plant, animal or trail began to decay.",
    blow:   () => `The target withers — disadvantage on its next attack roll, and its speed is halved until the end of its next turn.`,
    gift:   t => `Each ends one condition affecting it, such as Frightened, Charmed, Poisoned, Blinded or Deafened.${t >= 2 ? " It also removes one level of Exhaustion or Dream Exhaustion." : ""}` },
  { key: "winter", icon: "❄️", label: "Winter", epithet: "Stillness",
    combat: t => `You and allies within ${parRadius(t)} have ${t >= 3 ? "three-quarters" : "half"} cover, and the ground within ${parRadius(t)} is difficult terrain for enemies.`,
    calm:   "You and your companions don't suffer from extreme cold, and your camp stays sheltered from the weather.",
    blow:   () => `Frost-hard roots seize the target. It's Restrained until the end of its next turn, or until it escapes with a Strength check against your Verum DC.`,
    gift:   t => `Each gains ${(t >= 1 ? 10 : 5) * profBonus()} temporary hit points.${t >= 2 ? " Each also has resistance to one damage type until your next turn." : ""}` },
];

// ── The authored ability sets ─────────────────────────────
// `ranks` is the Rank I–IV ladder, read the way a Ring's and an Eidon's are: every Rank is
// shown, the one you're at is lit. A rank line restates its ability rather than adding to it.
const PARAGON_BUILDS = [
  // ── From the Paragon rules: two Paragons of Fire, to show the same Cognition resonating twice
  { id: "fire-kindled", cog: "fire", name: "The Kindled Heart",
    flavor: "For a player who hears Fire as fury and destruction. Built from Fierce and Wildfire.",
    save: "Dexterity", damage: "Fire", source: "Paragon rules — worked example",
    abilities: [
      { name: "Ember Soul", type: "passive",
        text: "Your weapon attacks deal an extra 1d6 fire damage, and a creature you hit takes fire damage equal to your Verum Modifier at the start of its next turn. This lingering burn doesn't stack.",
        ranks: ["An extra 1d6 fire damage.", "An extra 2d6 fire damage.",
                "An extra 2d6, and your fire damage ignores resistance.",
                "An extra 3d6, and immunity to fire counts only as resistance against your flames."] },
      { name: "Wildfire Rush", type: "offensive", act: "action", uses: "Proficiency Bonus per long rest",
        text: "You make one weapon attack. On a hit, the target must succeed on a Dexterity saving throw against your Verum DC or be Ablaze. An Ablaze creature takes fire damage equal to twice your Verum Modifier at the start of each of its turns until it, or a creature within 5 feet of it, uses an action to smother the flames.",
        ranks: ["Ablaze deals twice your Verum Modifier.",
                "An Ablaze creature that ends its turn within 5 feet of another creature spreads the fire to it.",
                "Smothering Ablaze now takes an action and a successful Dexterity check against your Verum DC.",
                "Ablaze deals five times your Verum Modifier."] },
    ] },
  { id: "fire-hearth", cog: "fire", name: "The Hearth-Keeper",
    flavor: "For a player who hears Fire as warmth and rebirth. Built from Life-Bringer and Hearthlight.",
    save: "—", damage: "Fire", source: "Paragon rules — worked example",
    abilities: [
      { name: "Hearthfire", type: "passive",
        text: "You shed bright light in a 20-foot radius. You and allies in that light can't be frozen, are warm in any cold, and gain temporary hit points equal to your Verum Modifier at the start of each of their turns.",
        ranks: ["Bright light in a 20-foot radius.", "The light reaches 30 feet.",
                "Once per turn, when an ally in your light regains hit points, it regains extra hit points equal to your Verum Modifier.",
                "As Rank III."] },
      { name: "Pyre of Renewal", type: "supportive", act: "reaction", uses: "once per short rest",
        text: "When a creature you can see within 30 feet drops to 0 hit points, you wrap it in fire. It drops to 1 hit point instead and is wreathed in flame until the end of its next turn, which deals 1d8 fire damage to any creature that hits it with a melee attack.",
        ranks: ["It drops to 1 hit point instead.", "It also ends one condition on the creature.",
                "As Rank II.", "It can restore a creature that died within the last round to 1 hit point."] },
    ] },
  { id: "protection-oath", cog: "protection", name: "The Unbroken Oath",
    flavor: "For a player who hears Protection as a promise to stand in front of others.",
    save: "—", damage: "—", source: "Paragon rules — worked example",
    abilities: [
      { name: "Oathwall", type: "passive",
        text: "Allies within 10 feet of you add half your Verum Modifier (rounded up) to their AC.",
        ranks: ["Allies within 10 feet.", "Allies within 10 feet.", "The area grows to 15 feet.", "The area grows to 15 feet."] },
      { name: "Take the Blow", type: "supportive", act: "reaction", uses: "Proficiency Bonus per long rest",
        text: "When an ally within 30 feet is hit by an attack, you swap places with it and become the attack's target. You take the damage with resistance.",
        ranks: ["You take the damage with resistance.", "You take the damage with resistance.", "You take the damage with resistance.",
                "You take no damage if the attack's total is lower than your Verum DC."] },
    ] },

  // ── Zeke's three
  { id: "life-evergreen", cog: "life", name: "The Evergreen", owner: "Zeke",
    flavor: "A leaf that doesn't fall in winter. While Life burns, green sap runs in the cracks of Zeke's scales, and flowers open where he stands.",
    save: "Constitution", damage: "Necrotic", source: "Zeke's Paragons",
    abilities: [
      { name: "Evergreen Sap", type: "passive",
        text: "At the start of each of your turns, you or one ally within 30 feet regains hit points equal to your Verum Modifier.",
        ranks: ["One creature heals your Verum Modifier.",
                "Healing past full becomes temporary hit points.",
                "It heals your Verum Modifier + your proficiency bonus.",
                "Two creatures heal each turn."] },
      { name: "Sap the Wicked", type: "offensive", act: "action", uses: "1",
        text: "You make a melee weapon attack. On a hit, the target takes your weapon's damage plus extra necrotic damage. You and allies of your choice within 30 feet share hit points equal to half the necrotic damage, divided as you choose.",
        ranks: ["+3d10 necrotic.",
                "+5d10 necrotic. The target's hit point maximum drops by the necrotic damage until a long rest.",
                "+7d10. The healing equals all the necrotic damage. The target can't regain hit points until the end of its next turn.",
                "+9d10. If the attack drops the target to 0, one ally within 60 feet who is at 0 hit points (or who died within the last minute) rises with half its hit points."] },
      { name: "Evergreen Oath", type: "supportive", act: "reaction", uses: "1",
        text: "When a creature you can see within 60 feet drops to 0 hit points, it drops to 1 hit point instead and regains extra hit points.",
        ranks: ["It regains 2d10 + your Verum Modifier.",
                "It regains 10 × Proficiency Bonus, the excess as temporary hit points, and ends one condition.",
                "For 1 minute its hit point maximum can't be reduced, and it holds on at 1 hit point once more if it drops again.",
                "It can target a creature that died within the last minute, if its body is intact."] },
    ] },
  { id: "protection-crescent", cog: "protection", name: "The Stained Crescent", owner: "Zeke",
    flavor: "The shell is a promise. While Protection burns, a pale silver crescent hangs at Zeke's back, and the air around him goes still and heavy.",
    save: "Constitution", damage: "Force", source: "Zeke's Paragons",
    abilities: [
      { name: "Crescent Ward", type: "passive",
        text: "Allies within 10 feet of you gain +1 AC.",
        ranks: ["Allies within 10 feet gain +1 AC.",
                "It reaches 15 feet, and a hit against a warded ally can't inflict Wounds.",
                "The bonus becomes +2 AC.",
                "Warded allies are immune to critical hits."] },
      { name: "Answering Blow", type: "offensive", act: "action", uses: "1",
        text: "You make a melee weapon attack. On a hit, the target takes your weapon's damage plus extra force damage. The extra damage also adds your Verum Modifier for each ally within 30 feet who has taken damage since the end of your last turn.",
        ranks: ["+2d10 force, counting up to 3 hurt allies.",
                "+4d10, counting up to 5 hurt allies. Until the end of its next turn the target has disadvantage on attacks against anyone but you.",
                "+6d10, and 2 × Verum Modifier per hurt ally. It ignores resistances and immunities if the target caused any of that damage.",
                "+8d10. For 1 minute, when an ally within 30 feet is hit, you can use your reaction to deal half this damage to the attacker."] },
      { name: "Guardian's Shell", type: "supportive", act: "reaction", uses: "1",
        text: "When you or a creature within 30 feet is targeted by an attack or forced to make a saving throw, it gains temporary hit points before the attack or save resolves.",
        ranks: ["5 × Proficiency Bonus temporary hit points.",
                "10 × Proficiency Bonus temporary hit points, plus resistance to one damage type for 1 round.",
                "15 × Proficiency Bonus temporary hit points, and resistance to two damage types.",
                "Damage of a resisted type is answered: the attacker takes 1d6 force per point of Proficiency Bonus (Constitution save for half)."] },
    ] },
  { id: "nature-turning", cog: "nature", name: "The Turning Year", owner: "Zeke", wheel: true,
    flavor: "The world, left to itself, doesn't stay still. It turns. While Nature burns, the air around Zeke smells of whatever season he's carrying: rain and blossom, dust and heat, leaf-rot, first frost.",
    save: "Wisdom", damage: "Piercing", source: "Zeke's Paragons",
    warn: "Zeke doesn't know Nature yet — it can't be his Paragon until he reaches Learn Full through a Pilgrimage.",
    wheelRanks: [
      "The wheel turns one Season forward at the start of each of your turns. Lit mid-fight, it starts in Spring.",
      "When you light Nature, choose its starting Season. Once per long rest you can spend 1 minute in stillness to force the wheel to a different Season until your next long rest.",
      "Once per Deeper Burn, when the Season would turn, you can hold it for one more turn.",
      "Each turn the wheel turns either way — forward or back, your choice.",
    ],
    abilities: [
      { name: "The Seasons", type: "passive", seasonal: "combat",
        text: "While Nature is your Paragon it always holds one Season, and the Season decides what this Passive does. In combat a Season's effect starts when it arrives, at the start of your turn, and lasts until your next turn.",
        ranks: ["Radius 15 feet.", "Radius 20 feet.", "Radius 30 feet. Spring's healing doubles and Summer's thorns become 2d8.",
                "Autumn's enemies also can't take reactions, and Winter's cover becomes three-quarters."] },
      { name: "Season's Blow", type: "offensive", act: "action", uses: "1", seasonal: "blow",
        text: "You make a melee weapon attack. On a hit, the target takes your weapon's damage plus extra piercing damage, and the current Season adds its effect.",
        ranks: ["+3d8 piercing.", "+5d8 piercing.", "+7d8 piercing.", "+9d8 piercing."] },
      { name: "Season's Gift", type: "supportive", act: "bonus", uses: "1", seasonal: "gift",
        text: "Up to your Proficiency Bonus allies within 30 feet receive the current Season's gift.",
        ranks: ["As written.", "As written.", "As written.",
                "The Full Year — once per long rest, you can give all four gifts at once."] },
    ] },
];

// ── State ─────────────────────────────────────────────────
state.par = {
  devotions: [],       // up to three Cognition ids, sworn to
  paragon:   null,     // which Devotion is held in the Deeper Burn
  builds:    {},       // cognition id → chosen build id, where a Cognition has more than one
  uses:      null,     // uses left; null = full
  season:    0,        // where Nature's wheel stands
  arrived:   true,     // on the turn it's lit the Season arrives instead of turning
  rotated:   false,    // Rotate is a Bonus Action — one a turn
  name:      "",
};

// ── Helpers ───────────────────────────────────────────────
// Paragon ability text runs through the shared resolver, plus the two multipliers Zeke's sheet
// writes out longhand that no seal formula uses. resolve() itself is left alone.
function parResolve(s) {
  const pb = profBonus(), vm = state.verumMod;
  return resolve(String(s == null ? "" : s)
    .replace(/(\d+)\s*×\s*Proficiency Bonus/gi, (m, n) => `${(+n) * pb}`)
    .replace(/(\d+)\s*×\s*Verum Modifier/gi,    (m, n) => `${(+n) * vm}`)
    .replace(/1d6 force per point of Proficiency Bonus/gi, `${pb}d6 force`)
    .replace(/half your Verum Modifier \(rounded up\)/gi, `${Math.ceil(vm / 2)}`)
    .replace(/your Verum Modifier \+ your proficiency bonus/gi, `${vm + pb}`));
}

function parRank(tier) { return TIERS[tier].label.split(" · ")[0]; }
function parBuildsFor(cogId) { return PARAGON_BUILDS.filter(b => b.cog === cogId); }
function parBuild(cogId) {
  const all = parBuildsFor(cogId);
  if (!all.length) return null;
  return all.find(b => b.id === state.par.builds[cogId]) || all[0];
}
function parCurrent() { return state.par.paragon ? parBuild(state.par.paragon) : null; }
function parEntry(id)  { return INDEX.find(c => c.id === id) || { id, name: id }; }
function parSeason()   { return PAR_SEASONS[state.par.season % PAR_SEASONS.length]; }
function parIsWheel()  { return !!parCurrent()?.wheel; }

// Uses: Zeke's sheet pools them — Offensive and Supportive abilities share Proficiency Bonus
// uses per long rest across all three Devotions. The rules call activation costs a placeholder,
// so that pooled count is what the tracker keeps.
function parUsesMax() { return profBonus(); }
function parUsesNow() { const P = state.par; return P.uses === null ? parUsesMax() : Math.min(P.uses, parUsesMax()); }
function parSpendUse(n) { state.par.uses = Math.max(0, parUsesNow() - n); syncBar(); renderMain(); }
function parRestoreUse(n) { state.par.uses = Math.min(parUsesMax(), parUsesNow() + n); syncBar(); renderMain(); }

// Can this character walk the path at all? The requirement is the sheet's, not a build's.
function parEligible() {
  return { dream: state.dreamMod >= PAR_MIN_DREAM, known: state.par.devotions.length >= PAR_DEVOTIONS };
}

// ── Actions ───────────────────────────────────────────────
// The rail swears a Cognition as a Devotion, or lets it go.
async function parToggleDevotion(id) {
  const P = state.par, entry = INDEX.find(c => c.id === id);
  if (!entry || !entry.ready) return;
  const at = P.devotions.indexOf(id);
  if (at >= 0) {
    P.devotions.splice(at, 1);
    if (P.paragon === id) { P.paragon = null; }        // letting the Paragon go puts it out
    toast(`${entry.name} is no longer a Devotion`);
  } else {
    if (P.devotions.length >= PAR_DEVOTIONS)
      return toast(`Three Devotions is the limit — a Pilgrimage replaces one`);
    await loadCognition(id);
    P.devotions.push(id);
    if (!P.paragon) parLight(id, true);                // the first Devotion lights itself
    toast(`${entry.name} sworn as a Devotion`);
  }
  renderCogList(); syncBar(); renderMain();
}

// Light a Devotion as the Paragon. Rotating is a Bonus Action and ends the old Passive;
// relighting after being incapacitated is the same Bonus Action.
function parLight(id, quiet) {
  const P = state.par;
  if (!P.devotions.includes(id)) return;
  P.paragon = id;
  P.arrived = true;                                    // the Season arrives on the turn it's lit
  P.season  = 0;                                       // lit mid-fight, the wheel starts in Spring
  if (!quiet) { P.rotated = true; toast(`${parEntry(id).name} takes the Deeper Burn`); }
  renderCogList(); syncBar(); renderMain();
}
function parRotate(id) {
  if (state.par.rotated) toast("You've already Rotated this turn — it's a Bonus Action");
  parLight(id);
}
// Incapacitated: the Deeper Burn goes out. Relight any Devotion with a Bonus Action later.
function parIncapacitated() {
  state.par.paragon = null;
  toast("Incapacitated — the Deeper Burn goes out");
  renderCogList(); syncBar(); renderMain();
}
function parNextRound() {
  const P = state.par;
  P.rotated = false;
  // The wheel turns at the start of each of your turns — except the turn the Season arrived on
  if (parIsWheel()) { if (P.arrived) P.arrived = false; else P.season = (P.season + 1) % PAR_SEASONS.length; }
  renderMain();
}
function parLongRest() {
  state.par.uses = parUsesMax();
  toast("Long rest — every use restored");
  syncBar(); renderMain();
}
function parSetSeason(i) { state.par.season = ((i % PAR_SEASONS.length) + PAR_SEASONS.length) % PAR_SEASONS.length; state.par.arrived = true; renderMain(); }
function parTurnWheel(d)  { parSetSeason(state.par.season + d); }
function parSetBuild(cogId, buildId) { state.par.builds[cogId] = buildId; renderMain(); }
function parName(v) { state.par.name = v; }

// ── The bar, the rail, and Clear selection ───────────────
// Attack and DC are already right for a Paragon: the Paragon Attack Bonus is Proficiency +
// Verum mod, which is what sealAttack() is, and the Paragon DC is the Verum DC.
function parSyncBar() {
  document.getElementById("capOut").textContent = `${parUsesNow()}/${parUsesMax()}`;
  document.getElementById("capLbl").textContent = "uses";
}
function parClear() {
  state.par.devotions = []; state.par.paragon = null;
  renderCogList(); syncBar(); renderMain();
}
// The rail swears Devotions: the Paragon reads as the Core does, the other two as Sigils.
function parRail(box, q) {
  const P = state.par;
  const { shown, h } = groupedRail(q, c => {
    const isPar = P.paragon === c.id, isDev = P.devotions.includes(c.id);
    const full  = P.devotions.length >= PAR_DEVOTIONS;
    const off   = !c.ready || (!isDev && full);
    const cls   = isPar ? "core" : isDev ? "comp" : off ? "off" : "";
    const role  = isPar ? "paragon" : isDev ? "devotion" : "";
    const has   = parBuildsFor(c.id).length;
    return `<button class="cog ${cls}" ${off && !isDev ? "disabled" : ""} onclick="toggleCog('${escAttr(c.id)}')"
      title="${!c.ready ? c.name + " — not written yet" : isDev ? c.name + " — a Devotion, click to let it go" : full ? "Three Devotions is the limit" : "Swear yourself to " + c.name}">
      <span class="ico">${cogIcon(c)}</span><span class="nm">${c.name}</span>
      ${has ? `<span class="cos" title="${has} authored ability set${has > 1 ? "s" : ""}">✦</span>` : ""}
      ${role ? `<span class="rl">${role}</span>` : state.dm && c.written === false ? `<span class="rl dm">DM</span>` : ""}</button>`;
  });
  box.innerHTML = shown ? h : `<div class="empty" style="padding:22px 8px">${emptyRail(q)}</div>`;
}

// ═══════════════════════════════════════════════════════════
//  THE PATH — composer and card in Paragon mode
// ═══════════════════════════════════════════════════════════
// What one ability says at the Rank you're at: its own line, plus the Season's where the
// ability is seasonal. The whole ladder is shown under it, the live Rank lit, the way a Ring's is.
function parAbilityNow(ab, tier) {
  const bits = [parResolve(ab.ranks?.[tier] ?? ab.ranks?.[ab.ranks.length - 1] ?? "")];
  if (ab.seasonal) {
    const s = parSeason(), line = s[ab.seasonal];
    bits.push(`${s.icon} ${s.label} — ${parResolve(typeof line === "function" ? line(tier) : line)}`);
  }
  return bits.filter(Boolean);
}

function renderParagon() {
  const comp = document.getElementById("composer"), seal = document.getElementById("sumBody");
  comp.innerHTML = parRules() + buildPath() + (state.par.devotions.length ? "" : savedHome());
  const b = parCurrent();
  if (!state.par.devotions.length) {
    seal.innerHTML = `<div class="empty">Swear yourself to a Cognition on the left — three Devotions make a Paragon.</div>`;
    seal.dataset.text = "";
  } else if (!state.par.paragon) {
    seal.innerHTML = `<div class="empty">Nothing is burning. Light one of your Devotions to take up its power.</div>`;
    seal.dataset.text = "";
  } else {
    seal.innerHTML = paragonCardHTML(b);
    seal.dataset.text = paragonCardText(b).join("\n");
  }
  document.getElementById("mPlay").className = "mini on";
}

// ── The composer side: the path, the Devotions, the uses, and Nature's wheel
function buildPath() {
  const P = state.par, tier = getTier(state.charLevel), elig = parEligible();
  let h = "";

  // Devotions — three slots, one of them burning
  let d = P.devotions.length ? `<div class="burns">` + P.devotions.map(id => {
      const c = parEntry(id), b = parBuild(id), isPar = P.paragon === id, all = parBuildsFor(id);
      return `<div class="burn${isPar ? " prim" : " in"}"><span class="ico">${cogIcon(c)}</span><b>${esc(c.name)}</b>
        <i>${isPar ? "the Paragon — Deeper Burn" : "a Devotion, waiting"}</i>
        ${b ? `<span class="rnd">${esc(b.name)}</span>` : `<span class="rnd">no abilities written</span>`}
        ${isPar ? "" : `<button class="mini" onclick="parRotate('${escAttr(id)}')" title="${P.paragon ? "Rotate — a Bonus Action; ends the old Paragon's Passives" : "Light it — a Bonus Action"}">${P.paragon ? "rotate to" : "light"}</button>`}
        ${all.length > 1 ? all.map(x => `<button class="mini${b?.id === x.id ? " on" : ""}" onclick="parSetBuild('${escAttr(id)}','${escAttr(x.id)}')">${esc(x.name)}</button>`).join("") : ""}
        <button class="mini" onclick="parToggleDevotion('${escAttr(id)}')" title="Let this Devotion go">✕</button></div>`;
    }).join("") + `</div>`
    : `<p class="hint">No Devotions yet. Choose three Cognitions you know at Learn Full from the left — they're a statement about who your character is, not a loadout.</p>`;
  if (P.devotions.length && P.devotions.length < PAR_DEVOTIONS)
    d += `<p class="hint">${PAR_DEVOTIONS - P.devotions.length} more Devotion${PAR_DEVOTIONS - P.devotions.length > 1 ? "s" : ""} to swear.</p>`;
  if (!elig.dream)
    d += `<p class="hint">⚠ The path asks for a Dream Score of 13 or higher — a Dream mod of at least +${PAR_MIN_DREAM}. The bar reads ${sgn(state.dreamMod)}.</p>`;
  h += block("Devotions", d);

  // Uses — pooled across every Devotion, restored on a long rest
  const umax = parUsesMax(), unow = parUsesNow();
  let u = `<div class="blaze">${Array.from({ length: umax }, (_, i) => `<span class="bp${i < unow ? " on" : ""}"></span>`).join("")}
    <b>${unow} / ${umax}</b><i>uses — Offensive &amp; Supportive, pooled</i></div>`;
  u += `<div class="chips" style="margin-top:8px">
    <button class="chip" onclick="parSpendUse(1)" ${unow ? "" : "disabled"}>Spend a use</button>
    <button class="chip" onclick="parRestoreUse(1)" ${unow < umax ? "" : "disabled"}>Give one back</button>
    <button class="chip" onclick="parNextRound()" title="${parIsWheel() ? "Turns the wheel and clears the Bonus Action" : "Clears the Bonus Action"}">Next round ›</button>
    <button class="chip" onclick="parLongRest()">Long rest</button>
    ${P.paragon ? `<button class="chip" onclick="parIncapacitated()" title="The Deeper Burn goes out — relight with a Bonus Action later">Incapacitated</button>` : ""}</div>`;
  if (P.rotated) u += `<p class="hint">You've Rotated this turn — it's a Bonus Action.</p>`;
  h += block("Uses", u);

  if (!P.paragon) return h;
  const b = parCurrent();
  if (!b) {
    h += block(parEntry(P.paragon).name, `<p class="hint">No Paragon Abilities are written for ${esc(parEntry(P.paragon).name)} yet. They're built for each player with their DM — a Passive, and an Offensive or Supportive ability, scaling by Rank.</p>`);
    return h;
  }

  // Nature's wheel — only where the Paragon turns one
  if (b.wheel) {
    const s = parSeason();
    let w = `<div class="chips" style="margin-bottom:6px"><span class="chip-lbl">Season</span>` +
      PAR_SEASONS.map((x, i) => `<button class="chip${i === state.par.season ? " on" : ""}" onclick="parSetSeason(${i})">${x.icon} ${x.label}</button>`).join("") +
      `<button class="chip" onclick="parTurnWheel(1)" title="Turn the wheel one Season forward">turn ›</button>` +
      (tier >= 3 ? `<button class="chip" onclick="parTurnWheel(-1)" title="Rank IV — the wheel turns either way">‹ back</button>` : "") + `</div>`;
    w += `<p class="scale-note">${s.icon} <strong>${esc(s.label)} — ${esc(s.epithet)}</strong> · ${esc(parResolve(s.combat(tier)))}</p>`;
    w += `<p class="hint" style="font-style:normal">Out of combat: ${esc(s.calm)}</p>`;
    if (state.par.arrived) w += `<p class="hint">The Season has just arrived — it won't turn until your next turn.</p>`;
    w += `<div class="ladder">` + b.wheelRanks.map((tx, i) =>
      `<div class="rung ${i === tier ? "now" : i < tier ? "past" : "later"}"><span class="lv">${TIERS[i].label}</span><span>${esc(tx)}</span></div>`).join("") + `</div>`;
    h += block("The Wheel", w);
  }

  // The abilities themselves, each with its own ladder
  let a = `<input class="search eidon-name" type="text" placeholder="Name this Paragon — ${esc(b.name)}" value="${esc(state.par.name).replace(/"/g, "&quot;")}" oninput="parName(this.value)">`;
  a += b.abilities.map(ab => {
    const T = PAR_TYPES[ab.type];
    return `<div class="par-ab ${ab.type}">
      <div class="par-ab-h"><b>${esc(ab.name)}</b><span class="t ${ab.type === "passive" ? "" : "hot"}">${T.label}</span>
        ${ab.act ? `<span class="t">${PAR_ACTS[ab.act]}</span>` : ""}
        ${ab.uses ? `<span class="t">${esc(parResolve(ab.uses))} use${ab.uses === "1" ? "" : "s"}</span>` : ""}</div>
      <p class="par-ab-t">${esc(parResolve(ab.text))}</p>
      ${parAbilityNow(ab, tier).map(x => `<p class="par-ab-now">${esc(x)}</p>`).join("")}
      <div class="ladder">` + (ab.ranks || []).map((tx, i) =>
        `<div class="rung ${i === tier ? "now" : i < tier ? "past" : "later"}"><span class="lv">${TIERS[i].label}</span><span>${esc(parResolve(tx))}</span></div>`).join("") +
      `</div></div>`;
  }).join("");
  h += block(`${esc(b.name)} — ${esc(parEntry(b.cog).name)}`, a);
  return h;
}

// ── The card
function paragonCardHTML(b) {
  const P = state.par, tier = getTier(state.charLevel), c = parEntry(P.paragon);
  if (!b) return `<div class="card paragon"><div class="c-name">${esc(c.name)}</div>
    <div class="c-sub">Paragon · Deeper Burn · level ${state.charLevel}</div>
    <div class="c-engine"><b>Not written</b>No Paragon Abilities exist for ${esc(c.name)} yet — build them with your DM.</div></div>`;

  // The dice the live Rank throws, so Roll and the chips have something to take hold of
  const off  = b.abilities.find(x => x.type === "offensive");
  const dice = off && (parResolve(off.ranks?.[tier] || "").match(/(\d+d\d+)/) || [])[1];

  let nums = `<span class="n atk"><b>${sgn(sealAttack())}</b><i>Paragon attack</i><u>proficiency + Verum mod</u></span>`;
  nums += `<span class="n dc"><b>${verumDC()}</b><i>${esc(b.save && b.save !== "—" ? b.save + " save" : "Paragon DC")}</i></span>`;
  if (dice) nums += `<span class="n dmg"><b>${dice}</b><i>${esc((b.damage || "").toLowerCase())} · ${esc(off.name)}</i></span>`;
  nums += `<span class="n"><b>${parUsesNow()}/${parUsesMax()}</b><i>uses left</i></span>`;

  let h = `<div class="card paragon">
    <div class="c-name">${esc(P.name || b.name)}</div>
    <div class="c-sub">Paragon of ${esc(parEntry(b.cog).name)} · ${esc(b.name)} · ${parRank(tier)} · level ${state.charLevel}</div>
    <div class="c-nums">${nums}</div>
    <div class="c-tags">${P.devotions.map(id =>
      `<span class="t${id === P.paragon ? " hot" : ""}">${esc(parEntry(id).name)}${id === P.paragon ? " · burning" : ""}</span>`).join("")}
      ${b.wheel ? `<span class="t">${parSeason().icon} ${esc(parSeason().label)}</span>` : ""}</div>
    <div class="c-cost">Deeper Burn — until you Rotate or are incapacitated · Rotate is a Bonus Action and ends only Passives</div>`;
  if (b.flavor) h += `<div class="c-engine"><b>${esc(b.name)}</b>${esc(b.flavor)}</div>`;
  if (b.warn)   h += `<div class="c-engine cond"><b>Pilgrimage required</b>${esc(b.warn)}</div>`;

  // Nature's Season rides above the abilities — it decides what they do
  if (b.wheel) {
    const s = parSeason();
    h += `<div class="c-sec"><div class="c-lbl">The Wheel · ${s.icon} ${esc(s.label)} — ${esc(s.epithet)}</div>
      <div class="c-core"><b>${esc(s.label)}</b><div class="c-tier now"><span class="c-tl">now</span><span>${esc(parResolve(s.combat(tier)))}</span></div>
      <div class="c-tier"><span class="c-tl">next</span><span>${PAR_SEASONS[(state.par.season + 1) % PAR_SEASONS.length].icon} ${esc(PAR_SEASONS[(state.par.season + 1) % PAR_SEASONS.length].label)}</span></div></div></div>`;
  }

  b.abilities.forEach(ab => {
    const T = PAR_TYPES[ab.type];
    h += `<div class="c-sec"><div class="c-lbl">${esc(ab.name)} · ${T.label}${ab.act ? " · " + PAR_ACTS[ab.act] : ""}</div>
      <div class="c-core"><b>${esc(ab.name)}</b>` +
      parAbilityNow(ab, tier).map(x => `<div class="c-tier now"><span class="c-tl">${TIERS[tier].label}</span><span>${esc(x)}</span></div>`).join("") +
      `<div class="c-tier"><span class="c-tl">rule</span><span>${esc(parResolve(ab.text))}</span></div></div></div>`;
  });
  h += `<div class="c-foot">Offensive and Supportive abilities share ${parUsesMax()} uses per long rest across every Devotion · a Paragon can't use Arcanum Veritas, Ignitions or Eidons, and has no Blaze</div>`;
  return h + `</div>`;
}

function paragonCardText(b) {
  const P = state.par, tier = getTier(state.charLevel), L = [];
  if (!b) return [`${parEntry(P.paragon).name.toUpperCase()} — no Paragon Abilities written yet`];
  L.push(`${(P.name || b.name).toUpperCase()} · Paragon of ${parEntry(b.cog).name} — ${b.name}`);
  L.push(`${parRank(tier)} · Char Lv ${state.charLevel} · Paragon attack ${sgn(sealAttack())} · Paragon DC ${verumDC()}${b.save && b.save !== "—" ? ` (${b.save} save)` : ""}`);
  L.push(`DEVOTIONS — ${P.devotions.map(id => `${parEntry(id).name}${id === P.paragon ? " (burning)" : ""}`).join(", ")}`);
  L.push(`USES — ${parUsesNow()}/${parUsesMax()}, pooled across every Devotion, restored on a long rest`);
  if (b.wheel) L.push(`SEASON — ${parSeason().label} (${parSeason().epithet}): ${parResolve(parSeason().combat(tier))}`);
  if (b.warn) L.push(`⚠ ${b.warn}`);
  L.push("");
  b.abilities.forEach(ab => {
    L.push(`${ab.name.toUpperCase()} — ${PAR_TYPES[ab.type].label}${ab.act ? ` · ${PAR_ACTS[ab.act]}` : ""}${ab.uses ? ` · ${parResolve(ab.uses)} use(s)` : ""}`);
    L.push(`  ${parResolve(ab.text)}`);
    parAbilityNow(ab, tier).forEach(x => L.push(`  ▸ ${TIERS[tier].label}: ${x}`));
  });
  L.push("");
  L.push(`Deeper Burn — until you Rotate or are incapacitated. Rotate is a Bonus Action and ends only Passives.`);
  return L;
}

// ═══════════════════════════════════════════════════════════
//  THE RULES DRAWER
// ═══════════════════════════════════════════════════════════
function parRules() {
  return `<details class="rules"><summary>Rules of the Paragon path</summary><div class="rules-b">
    <h3>Numbers</h3><ul>
      <li><strong>Requirement</strong> — a Dream Score of 13+, and at least three Cognitions known at Learn Full.</li>
      <li><strong>Devotions</strong> — three Cognitions you know at Learn Full, dedicated to your soul. A Devotion that isn't your Paragon grants nothing on its own.</li>
      <li><strong>The Paragon</strong> — one Devotion held in a Deeper Burn. Never more than one.</li>
      <li><strong>Deeper Burn</strong> — lasts until you Rotate or are incapacitated, not 1 minute like an ordinary Burn.</li>
      <li><strong>Rotate</strong> — a Bonus Action to change your Paragon to another Devotion. It ends only <strong>Passive</strong> abilities.</li>
      <li><strong>Paragon DC</strong> — your Verum DC: 8 + Proficiency Bonus + Verum mod + Dream mod.</li>
      <li><strong>Paragon attack</strong> — Proficiency Bonus + Verum mod.</li>
      <li><strong>Ranks</strong> — abilities improve at Ranks I–IV (levels 1, 5, 11, 17). They never depend on spell slots.</li>
      <li><strong>Path lockout</strong> — no Arcanum Veritas, no Ignitions, no Eidons, no Blaze Points.</li>
    </ul>
    <h3>At the table</h3><ul>
      <li><strong>Only while burning</strong> — an ability works, and a Passive is on, only while its Cognition is your Paragon.</li>
      <li><strong>The Cognition's own rules apply</strong> — whatever it charges as a seal's Core it charges here: Blood's toll, Sun's Corruption, Nightmare's Dream save, Lunar's phase.</li>
      <li><strong>Relighting</strong> — if the Burn goes out because you were incapacitated, relight any Devotion with a Bonus Action on a later turn.</li>
      <li><strong>Visible</strong> — your Paragon marks you somehow, and anyone with Cognitive Sense can tell which Cognition you hold.</li>
      <li><strong>Pilgrimage</strong> — a downtime ritual replaces one Devotion with another Cognition you know at Learn Full. Give your DM notice.</li>
      <li><strong>Abilities are personal</strong> — built for each player with their DM. Two Paragons of one Cognition may resonate with different parts of it.</li>
    </ul>
  </div></details>`;
}

// ═══════════════════════════════════════════════════════════
//  PARAGON REFERENCE — the Rings tab, in Paragon mode
// ═══════════════════════════════════════════════════════════
// One page per authored ability set, read the way the Rings tab reads a Ring.
function parBuildRef(b) {
  const tier = getTier(state.charLevel);
  let h = `<p class="cdx-desc">${esc(b.flavor || "")}</p>
    <div class="cdx-sec"><div class="cdx-defs">
      <div class="cdx-def"><b>Cognition</b><span>${esc(parEntry(b.cog).name)}</span></div>
      <div class="cdx-def"><b>Save</b><span>${esc(b.save && b.save !== "—" ? `${b.save} — against your Verum DC (${verumDC()})` : "No save of its own")}</span></div>
      <div class="cdx-def"><b>Damage</b><span>${esc(b.damage && b.damage !== "—" ? b.damage : "None of its own")}</span></div>
      <div class="cdx-def"><b>Written for</b><span>${esc(b.owner ? `${b.owner} — ${b.source}` : b.source)}</span></div>
    </div></div>`;
  if (b.warn) h += `<div class="cdx-sec"><div class="cdx-note"><p>⚠ ${esc(b.warn)}</p></div></div>`;
  if (b.wheel) {
    h += `<div class="cdx-sec"><h2>The Wheel</h2><p class="cdx-rings">While this is your Paragon it always holds one Season, and you can't skip one — you can only turn the wheel. Out of combat the wheel mirrors the world: your Season matches the true season of the land you stand in, and the Passive gives flavour and minor utility but no healing, damage or cover.</p>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Season</th><th>In combat</th><th>Out of combat</th></tr></thead><tbody>` +
      PAR_SEASONS.map(s => `<tr class="${s.key === parSeason().key ? "now" : ""}"><td>${s.icon} <strong>${esc(s.label)}</strong><br>${esc(s.epithet)}</td>
        <td class="wrap">${esc(parResolve(s.combat(tier)))}</td><td class="wrap">${esc(s.calm)}</td></tr>`).join("") +
      `</tbody></table></div></div>
      <div class="cdx-sec"><h2>The Wheel by Rank</h2><div class="ladder">` +
      b.wheelRanks.map((tx, i) => `<div class="rung ${i === tier ? "now" : ""}"><span class="lv">${TIERS[i].label}</span><span>${esc(tx)}</span></div>`).join("") +
      `</div></div>`;
  }
  b.abilities.forEach(ab => {
    const T = PAR_TYPES[ab.type];
    h += `<div class="cdx-sec"><h2>${esc(ab.name)}</h2>
      <div class="c-tags"><span class="t ${ab.type === "passive" ? "" : "hot"}">${T.label}</span>
        ${ab.act ? `<span class="t">${PAR_ACTS[ab.act]}</span>` : ""}
        ${ab.uses ? `<span class="t">${esc(parResolve(ab.uses))} use${ab.uses === "1" ? "" : "s"}</span>` : ""}</div>
      <p class="cdx-rings">${esc(parResolve(ab.text))} <em>${esc(T.hint)}.</em></p>`;
    if (ab.seasonal) {
      h += `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Season</th><th>Effect</th></tr></thead><tbody>` +
        PAR_SEASONS.map(s => { const line = s[ab.seasonal];
          return `<tr class="${s.key === parSeason().key ? "now" : ""}"><td>${s.icon} ${esc(s.label)}</td>
            <td class="wrap">${esc(parResolve(typeof line === "function" ? line(tier) : line))}</td></tr>`; }).join("") +
        `</tbody></table></div>`;
    }
    h += `<div class="ladder">` + (ab.ranks || []).map((tx, i) =>
      `<div class="rung ${i === tier ? "now" : ""}"><span class="lv">${TIERS[i].label}</span><span>${esc(parResolve(tx))}</span></div>`).join("") + `</div></div>`;
  });
  return h;
}

const PAR_REF = [
  { key: "overview", label: "The Paragon path", grp: "The system", body: () => `
    <p class="cdx-desc">The sorcerer holds a thousand candles and tends none of them. The Paragon holds one, and the whole night bends toward it.</p>
    <div class="cdx-sec"><h2>Quick reference</h2><div class="cdx-defs">
      <div class="cdx-def"><b>Requirement</b><span>A Dream Score of 13+, and at least three Cognitions known at Learn Full.</span></div>
      <div class="cdx-def"><b>Devotions</b><span>Three Cognitions you know at Learn Full, dedicated to your soul.</span></div>
      <div class="cdx-def"><b>The Paragon</b><span>One Devotion held in a Deeper Burn. You can never hold more than one.</span></div>
      <div class="cdx-def"><b>Deeper Burn</b><span>Lasts until you Rotate or are incapacitated.</span></div>
      <div class="cdx-def"><b>Rotate</b><span>Bonus Action — change your Paragon to another Devotion. Ends only Passive abilities.</span></div>
      <div class="cdx-def"><b>Paragon Abilities</b><span>Stronger, more rigid Verum Effects of your Paragon, built for you: Passive, Offensive or Supportive, scaling by Rank.</span></div>
      <div class="cdx-def"><b>Paragon DC</b><span>Your Verum DC — 8 + Proficiency Bonus + Verum mod + Dream mod (${verumDC()} right now).</span></div>
      <div class="cdx-def"><b>Paragon attack</b><span>Proficiency Bonus + Verum mod (${sgn(sealAttack())} right now).</span></div>
      <div class="cdx-def"><b>Pilgrimage</b><span>A downtime ritual: replace one Devotion with another Cognition you know.</span></div>
      <div class="cdx-def"><b>Path lockout</b><span>No Arcanum Veritas, no Ignitions, no Eidons, no Blaze Points.</span></div>
    </div></div>
    <div class="cdx-sec"><h2>Walking the path</h2><div class="cdx-note">
      <p>Becoming a Paragon is a choice of identity, not a lesson you learn. Instead of learning to draw a Cognition in a hundred shapes, the Paragon gives their soul to the few Cognitions that feel like home and lets one of them burn inside them all the time. The result is narrower than the other paths, and far heavier.</p>
      <p>When you take the path, it closes off the others. A Paragon's soul has no room left for any other way of channelling a Cognition — the path suits anyone who wants a Cognition's power without keeping track of a magic system: the warrior who <em>is</em> the flame rather than the one who wields it.</p>
    </div></div>` },
  { key: "burn", label: "Deeper Burn &amp; Rotate", grp: "The system", body: () => `
    <div class="cdx-sec"><h2>The Deeper Burn</h2><p class="cdx-rings">A normal Burn is shallow and brief: a Cognition flares for a minute, and a warrior can keep several burning at once. A Deeper Burn goes all the way to the soul.</p>
      <div class="cdx-defs">
      <div class="cdx-def"><b>One at a time</b><span>You can hold only one Paragon. Setting a new one extinguishes the old.</span></div>
      <div class="cdx-def"><b>Enduring</b><span>It stays lit until you Rotate or become incapacitated — it doesn't expire after 1 minute.</span></div>
      <div class="cdx-def"><b>Relighting</b><span>If it goes out because you were incapacitated, relight any Devotion as your Paragon with a Bonus Action on a later turn.</span></div>
      <div class="cdx-def"><b>Visible</b><span>It marks you somehow — embers in your breath, a stillness in the air, a faint ring of light at your feet. Creatures with Cognitive Sense can tell which Cognition you're holding.</span></div>
    </div></div>
    <div class="cdx-sec"><h2>Rotate</h2><div class="cdx-note">
      <p>As a Bonus Action on your turn you can Rotate: extinguish your current Paragon and set one of your other Devotions in its place. The new Paragon's abilities are available right away.</p>
      <p>Rotating ends only the old Paragon's <strong>Passive</strong> abilities. Anything its Offensive or Supportive abilities already set in motion — a creature left Ablaze, an ally wreathed in flame — keeps going until its own duration ends.</p>
      <p>Rotating is the Paragon's tactics. A Paragon doesn't choose which spell to cast. They choose <em>who to be</em> this round, and that costs them part of their turn.</p>
    </div></div>` },
  { key: "abilities", label: "Paragon Abilities", grp: "The system", body: () => `
    <p class="cdx-desc">Verum Effects that have been deepened: stronger than anything a seal or an Eidon draws from the same Cognition, and fixed in shape.</p>
    <div class="cdx-sec"><h2>The three types</h2><div class="cdx-defs">` +
      Object.values(PAR_TYPES).map(t => `<div class="cdx-def"><b>${t.label}</b><span>${t.hint.charAt(0).toUpperCase() + t.hint.slice(1)}.</span></div>`).join("") +
    `</div></div>
    <div class="cdx-sec"><h2>How they work</h2><div class="cdx-defs">
      <div class="cdx-def"><b>Personal</b><span>Built for each player. Two Paragons of the same Cognition may resonate with different parts of it — one hears Fire as fury, the other as the hearth.</span></div>
      <div class="cdx-def"><b>Scale by Rank</b><span>Ranks I–IV at levels 1, 5, 11 and 17 — the same ladder Verum Effects use. Never spell slots.</span></div>
      <div class="cdx-def"><b>DC and attack</b><span>A save uses your Verum DC (${verumDC()}); an attack roll adds your Paragon Attack Bonus (${sgn(sealAttack())}).</span></div>
      <div class="cdx-def"><b>Only while burning</b><span>You can activate an ability, and a Passive works, only while its Cognition is your current Paragon.</span></div>
      <div class="cdx-def"><b>The Cognition's own rules apply</b><span>Whatever a Cognition charges or depends on as a seal's Core applies here too — Blood's toll, Sun's Corruption, Nightmare's Dream save, Lunar's phase.</span></div>
      <div class="cdx-def"><b>Uses</b><span>The rules call activation costs and uses placeholders until the Paragon Ability guideline is finished. This tracker pools them the way Zeke's sheet does: Offensive and Supportive abilities share Proficiency Bonus uses per long rest across every Devotion.</span></div>
    </div></div>
    <div class="cdx-sec"><h2>Pilgrimage</h2><div class="cdx-note">
      <p>Your Devotions can change, but not casually. To replace one with another Cognition you know at Learn Full you undertake a Pilgrimage: a personal ritual performed over downtime — a vigil at a burning shrine, a month of silence, retracing the road where you first felt the new Cognition stir.</p>
      <p>When it's complete the old Devotion leaves you and the new one takes its place. Give your DM advance notice, so they can prepare the new Cognition's abilities with you before you finish.</p>
    </div></div>` },
  ...PARAGON_BUILDS.map(b => ({
    key: b.id, label: `${b.name}`, grp: b.owner ? `${b.owner}'s Paragons` : "Worked examples",
    title: `${b.name} — Paragon of ${b.cog.charAt(0).toUpperCase() + b.cog.slice(1)}`,
    body: () => parBuildRef(b),
  })),
];

function renderParRefList() {
  const box = document.getElementById("ringList"); if (!box) return;
  const on = state.parRef || "overview";
  let grp = "", h = "";
  PAR_REF.forEach(s => {
    if (s.grp !== grp) { grp = s.grp; h += `<div class="rail-grp">${grp}</div>`; }
    h += `<button class="cog${s.key === on ? " core" : ""}" onclick="openParRef('${escAttr(s.key)}')"><span class="nm">${s.label}</span></button>`;
  });
  box.innerHTML = h;
}
function renderParRef() {
  const host = document.getElementById("ringBody"); if (!host) return;
  const s = PAR_REF.find(x => x.key === (state.parRef || "overview")) || PAR_REF[0];
  host.innerHTML = `<div class="cdx"><div class="cdx-hd"><div><h1>${s.title || s.label}</h1></div></div>${s.body()}</div>`;
}
function openParRef(k) { state.parRef = k; renderParRefList(); renderParRef(); document.getElementById("ringBody").scrollTop = 0; }

// ── Saving a Paragon: the three Devotions, which one burns, and the resonances chosen
function parSnapshot() {
  const P = state.par;
  if (!P.devotions.length) return null;
  return { devotions: [...P.devotions], paragon: P.paragon, builds: { ...P.builds }, season: P.season };
}
