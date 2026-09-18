// Arcanum Veritas Builder — the Ignition system: the mode switch, Blaze Points and Burning,
// the Eidon Forge (an improvised martial manifestation shaped by a Template and paid for in
// power dice, borrowing the Burned Cognition's Verum), and the Ignition reference that takes
// over the Rings tab in this mode.

// ═══════════════════════════════════════════════════════════
//  IGNITION — rules data
// ═══════════════════════════════════════════════════════════
// The power dice an Eidon has to spend, by character tier (Lv 1–4, 5–10, 11–16, 17+)
const EIDON_POOL = [4, 6, 8, 10];
// Anything a borrowed Verum writes "× slot level" reads an Eidon as this slot, by tier —
// always a step below the seals a character of that level could draw
const EIDON_SLOT = [1, 2, 4, 6];
// The Eidon Check is d20 + Dream mod against DC 6, +1 for every die spent shaping it and +3 for
// every Cognition beyond the first. No Proficiency, so the gamble is the same at every level:
// a plain Eidon lands 80% of the time at Dream +1, three Cognitions with ~4 dice of shaping 30%.
const EIDON_BASE_DC = 6, EIDON_COG_DC = 3, EIDON_DIE_DC = 1;
const BURN_ROUNDS = 10;   // 1 minute
// Forging an Ignition in downtime — Rank by character tier; the recipe adds weeks and DC.
// Tuned so a one-Cognition recipe succeeds ~70% of weeks at every tier (the Forge roll is d20 + Dream + PB)
// (see the vault's "Forging Ignitions")
const FORGE_RANK = [
  { rank: "I",   weeks: 2, dc: 10, catalyst: "50 gp",     item: "uncommon" },
  { rank: "II",  weeks: 4, dc: 12, catalyst: "500 gp",    item: "rare" },
  { rank: "III", weeks: 6, dc: 14, catalyst: "5,000 gp",  item: "very rare" },
  { rank: "IV",  weeks: 8, dc: 16, catalyst: "50,000 gp", item: "legendary" },
];
function forgePlan(e) {
  const r = FORGE_RANK[Math.min(3, e.tier)];
  const near = Math.min(2, Math.max(0, e.cogs.length - 1)), far = Math.max(0, e.cogs.length - 3);   // 2nd–3rd, and beyond the third
  const weeks = r.weeks + near + 2 * far;
  return { ...r, weeks, dc: r.dc + 2 * near + 2 * far + Math.floor(e.spent / 2), catalysts: 1 + far,
    roll: state.dreamMod + e.pb, field: far ? 0 : Math.floor(weeks / 2) };
}
// An improvised Eidon holds three Cognitions; a forged recipe up to 3 + Dream mod
function eidonCap() { return state.ign.forge ? 3 + Math.max(0, state.dreamMod) : 3; }
function setForgeRecipe(on) {
  const I = state.ign;
  I.forge = on;
  if (!on) { let n = 0; I.burning.forEach((b, i) => { if (i === 0 || b.inEidon) { n++; if (n > 3) b.inEidon = false; } }); }
  renderCogList(); renderMain();
}
const EIDON_ACTS = { action: "Action", bonus: "Bonus Action", reaction: "Reaction" };
// Any Template but Reversal can be manifested as a Bonus Action instead — at half its output
// (damage, temp HP, damage reduced) and, for Mobility, half its distance.
const EIDON_CONDITIONS = [
  { v: 2, key: "minor",  label: "Minor",  eg: "prone, frightened, slowed" },
  { v: 3, key: "major",  label: "Major",  eg: "restrained, blinded, charmed" },
  { v: 4, key: "severe", label: "Severe", eg: "stunned, paralyzed, incapacitated" },
];
// The primary Cognition's own condition at each severity (its JSON's eidon.conditions), or a generic stand-in
function eidonCondition(cog, v) {
  const c = EIDON_CONDITIONS.find(x => x.v === v);
  const own = cog?.eidon?.conditions?.[c.key];
  return own ? { name: own.name, card: own.card, sev: c.label, own: true } : { name: `${c.label} condition`, card: c.eg, sev: c.label, own: false };
}

// ── The seven Templates. Each is the Eidon's Ring: its own roll, what its unspent dice become,
//    numbers that grow with tier, four cumulative tier features, and a menu to spend dice on.
//    `pools` — the primary Cognition's Verum it borrows (first it has); other Cognitions lend that Sigil.
const EIDON_TEMPLATES = {
  strike: {
    label: "Strike", epithet: "the empowered blow", roll: "attack", acts: ["action", "bonus"], out: "damage",
    pools: ["offensive"],
    use: "A weapon attack carrying the Cognition — the power dice land on a hit.",
    scale: t => t >= 2 ? "one weapon attack, or two against different targets" : "one weapon attack",
    tiers: [
      "One weapon attack. On a hit it deals your weapon's damage plus the unspent power dice.",
      "Follow-through — on a miss, half the unspent dice still land.",
      "Split — divide the unspent dice between two weapon attacks against different targets.",
      "It crits on 19–20, and a critical hit rolls the power dice twice.",
    ],
    spends: [
      { key: "reach",  label: "+10 ft reach",                   dice: 1, max: 3 },
      { key: "shove",  label: "Push 10 ft or knock Prone",      dice: 1 },
      { key: "pierce", label: "Ignore resistance to your type", dice: 2 },
      { key: "sure",   label: "Automatic hit — at half dice",   dice: 2, halves: true },
    ],
  },
  mobility: {
    label: "Mobility", epithet: "the dream-step", roll: "path", acts: ["action", "bonus"], out: "damage",
    pools: ["utility", "supportive"],
    use: "Move the way a dream moves — and whatever you pass through takes what's left.",
    dist: [15, 20, 30, 40],
    scale: (t, sp, act) => { const d = [15, 20, 30, 40][t] + 10 * (sp.far || 0); return `${act === "bonus" ? Math.floor(d / 2) : d} ft${t >= 1 ? " by teleport" : ""}`; },
    tiers: [
      "Move up to 15 ft without provoking opportunity attacks. Every creature you pass beside takes the unspent dice (Dexterity save for half).",
      "Teleport instead, to a space you can see — 20 ft.",
      "Pass straight through creatures and their spaces — 30 ft.",
      "Afterimage — the next attack against you before your next turn misses. 40 ft.",
    ],
    spends: [
      { key: "far",   label: "+10 ft",                             dice: 1, max: 4 },
      { key: "ally",  label: "Take a willing ally with you",       dice: 1 },
      { key: "phase", label: "Through walls and barriers",         dice: 2 },
      { key: "aloft", label: "Stay airborne until your next turn", dice: 1 },
    ],
  },
  defense: {
    label: "Defense", epithet: "the manifested guard", roll: "none", acts: ["action", "reaction", "bonus"], out: "temp",
    pools: ["supportive"],
    use: "Power made into guard — the unspent dice become temporary hit points.",
    scale: (t, sp) => sp.minute ? "lasts 1 minute" : "lasts until the start of your next turn",
    tiers: [
      "Temporary hit points equal to the unspent dice, until the start of your next turn.",
      "Resistance to one damage type of your choice while the temporary hit points last.",
      "Share — split the temporary hit points with an ally within 30 ft.",
      "Retaliate — anything that hits you while they last takes one power die of your type.",
    ],
    spends: [
      { key: "all",     label: "Resistance to all damage",        dice: 2 },
      { key: "minute",  label: "Lasts 1 minute",                  dice: 1 },
      { key: "cover",   label: "Cover an ally within 30 ft",      dice: 1 },
      { key: "reflect", label: "Reflect the first hit's damage",  dice: 2 },
    ],
  },
  status: {
    label: "Status", epithet: "the breaking touch", roll: "save", acts: ["action", "bonus"], out: "damage",
    pools: ["control"], cond: 2,
    use: "Break the target's footing, nerve or senses with the Cognition's own condition.",
    scale: t => t >= 3 ? "two targets" : "one target",
    tiers: [
      "The Cognition's minor condition, free, until the end of its next turn — plus the unspent dice as damage (half on a save).",
      "A target you've damaged this turn saves at disadvantage.",
      "It lasts 1 minute, saving again at the end of each of its turns — for free.",
      "Two targets.",
    ],
    spends: [
      { key: "major",  label: "Raise it to major",      dice: 2, group: "cond", cond: 3 },
      { key: "severe", label: "Raise it to severe",     dice: 3, group: "cond", cond: 4 },
      { key: "stack",  label: "Stack the minor on top", dice: 1, needs: "cond" },
      { key: "crit",   label: "No save on a crit",      dice: 1 },
    ],
  },
  zone: {
    label: "Zone", epithet: "the claimed ground", roll: "save", acts: ["action", "bonus"], out: "damage",
    pools: ["control", "offensive"],
    use: "Claim an area — everything in it saves, and takes the unspent dice (half on a save).",
    scale: (t, sp) => `${[10, 15, 20, 30][t] + 10 * (sp.wide || 0)}-ft radius${t >= 2 ? " (or a cone or line)" : ""}`,
    tiers: [
      "A burst — every creature in it saves, taking the unspent dice (half on a save).",
      "It lingers 1 round: difficult terrain, and a quarter of the dice to anything starting its turn there.",
      "Shape it — cone, line or sphere — and leave your allies out of it.",
      "It holds 1 minute with no concentration, pulsing a quarter of the dice at the start of each of your turns.",
    ],
    spends: [
      { key: "wide",   label: "+10 ft radius",                     dice: 1, max: 3 },
      { key: "linger", label: "Linger another round",              dice: 1, max: 3, minTier: 1 },
      { key: "zcond",  label: "Minor condition to those who fail", dice: 1, cond: 2 },
    ],
  },
  bind: {
    label: "Bind", epithet: "the seal on the body", roll: "save", acts: ["action", "bonus"], out: "damage",
    pools: ["control"],
    use: "Seize a body and hold it — escape is a check against your Eidon DC.",
    scale: (t, sp) => `${t >= 1 ? 30 + 30 * (sp.range || 0) + " ft" : sp.range ? 30 * sp.range + " ft" : "reach"}` + ` · ${t >= 3 ? "up to your Proficiency Bonus in creatures" : 1 + (sp.extra || 0) + " creature" + ((sp.extra || 0) ? "s" : "")}`,
    tiers: [
      "Restrain one creature within reach; it takes the unspent dice (half on a save) and escapes with a check against your Eidon DC.",
      "Tether — bind it from 30 ft away.",
      "Crush — half the dice every time it tries to break free and fails.",
      "Bind up to your Proficiency Bonus in creatures.",
    ],
    spends: [
      { key: "range", label: "+30 ft range",                     dice: 1, max: 2 },
      { key: "extra", label: "An extra target",                  dice: 2, max: 2 },
      { key: "lock",  label: "No teleporting or going ethereal", dice: 1 },
      { key: "drag",  label: "Drag it 15 ft toward you",         dice: 1 },
    ],
  },
  reversal: {
    label: "Reversal", epithet: "the answer", roll: "none", acts: ["reaction"], out: "reduce",
    pools: ["supportive", "offensive"],
    use: "When the blow lands, answer it — the unspent dice come off the damage.",
    scale: t => t >= 2 ? "reduce, return, or redirect" : t >= 1 ? "reduce and return" : "reduce",
    tiers: [
      "When you're hit, reduce the damage by the unspent dice.",
      "What you reduce goes back at the attacker as damage of your type.",
      "Redirect — send the attack at another creature within 30 ft instead (it rolls again).",
      "Once per long rest, turn a failed save into a success.",
    ],
    spends: [
      { key: "ally",    label: "Protect an ally within 30 ft",               dice: 1 },
      { key: "cleanse", label: "End one condition the hit carried",          dice: 2 },
      { key: "spell",   label: "Answer a spell (level ≤ your Proficiency)",  dice: 2 },
    ],
  },
};

state.mode    = "av";      // "av" — Arcanum Veritas · "ign" — Ignition
state.physMod = 3;         // highest physical ability modifier, for the Eidon save DC
state.ign = {
  burning: [],             // [{ id, rounds, inEidon }] — the first is the primary
  template: null, act: null, spend: {},
  name: "", verums: {},
  blaze: null,             // Blaze Points left; null = full
  burnedRound: false, eidonRound: false,
  successes: 0, last: null,
  forge: false,            // planning a forged recipe — lifts the three-Cognition cap
};

// ═══════════════════════════════════════════════════════════
//  MODE SWITCH
// ═══════════════════════════════════════════════════════════
function setMode(m, quiet) {
  state.mode = m === "ign" ? "ign" : "av";
  try { localStorage.setItem("av-mode", state.mode); } catch (e) {}
  applyMode();
  renderCogList(); renderMain();
  if (state.view === "rings") { renderRingList(); renderRing(); }
  if (!quiet) toast(state.mode === "ign" ? "Ignition — the Eidon Forge" : "Arcanum Veritas — the seal composer");
}
function toggleMode() { setMode(state.mode === "ign" ? "av" : "ign"); }
function applyMode() {
  const ign = state.mode === "ign";
  document.body.classList.toggle("ign", ign);
  const set = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
  document.querySelector(".brand").innerHTML = ign ? `Ignition<em>eidon forge</em>` : `Arcanum Veritas<em>seal composer</em>`;
  set("modeBtn", ign ? "⇄ Arcanum Veritas" : "⇄ Ignition");
  set("tabComposer", ign ? "Forge" : "Composer");
  set("tabRings", ign ? "Ignitions" : "Rings");
  set("sealTitle", ign ? "The Eidon" : "The seal");
  document.querySelector(".lv.atk i").textContent = ign ? "Eidon check" : "to hit";
  document.querySelector(".lv.dc i").textContent  = ign ? "Eidon DC" : "Verum DC";
  ["slotDial", "vmDial"].forEach(id => { const el = document.getElementById(id); if (el) el.hidden = ign; });
  const pd = document.getElementById("physDial"); if (pd) pd.hidden = !ign;
  document.title = ign ? "Ignition — Eidon Forge" : "Arcanum Veritas — Seal Composer";
  syncBar();
}
// Called at the end of syncBar
function syncIgnBar() {
  document.getElementById("atkOut").textContent = sgn(state.dreamMod);
  document.getElementById("dcOut").textContent  = eidonSaveDC();
  document.getElementById("capOut").textContent = `${blazeNow()}/${blazeMax()}`;
  document.getElementById("capLbl").textContent = "Blaze";
}
document.getElementById("pmInput")?.addEventListener("input", e => {
  const v = parseInt(e.target.value, 10);
  state.physMod = isNaN(v) ? 0 : v;
  syncBar(); renderMain();
});

// ═══════════════════════════════════════════════════════════
//  BLAZE & BURNING
// ═══════════════════════════════════════════════════════════
function blazeMax() { return profBonus(); }
function blazeNow() { const I = state.ign; return I.blaze === null ? blazeMax() : Math.min(I.blaze, blazeMax()); }
function spendBlaze(n) { state.ign.blaze = Math.max(0, blazeNow() - n); }
function eidonSaveDC() { return 8 + state.physMod + profBonus() + state.dreamMod; }

// Clicking a Cognition in the rail Burns it (or puts it out)
async function toggleBurn(id) {
  const I = state.ign, entry = INDEX.find(c => c.id === id);
  if (!entry || !entry.ready) return;
  const at = I.burning.findIndex(b => b.id === id);
  if (at >= 0) { I.burning.splice(at, 1); if (I.burning[0]) I.burning[0].inEidon = true; toast(`${entry.name} stops Burning`); }
  else {
    await loadCognition(id);
    if (I.burnedRound) toast("You've already Burned this turn — it's one Burn per turn (Next round when it turns)");
    I.burning.push({ id, rounds: BURN_ROUNDS, inEidon: eidonPicks().length < eidonCap() });   // joins the Eidon if there's room
    I.burnedRound = true;
  }
  renderCogList(); syncBar(); renderMain();
}
// The Burning Cognitions an Eidon draws on: always the primary, then up to two you've chosen
function eidonPicks() { return state.ign.burning.filter((b, i) => i === 0 || b.inEidon).slice(0, eidonCap()); }
function toggleInEidon(id) {
  const b = state.ign.burning.find(x => x.id === id); if (!b) return;
  if (!b.inEidon && eidonPicks().length >= eidonCap()) {
    toast(state.ign.forge ? `A forged recipe holds at most ${eidonCap()} Cognitions (3 + your Dream mod)` : "An Eidon draws on at most three Cognitions — a forged recipe can hold more");
    return;
  }
  b.inEidon = !b.inEidon;
  renderCogList(); renderMain();
}
function setPrimary(id) {
  const I = state.ign, at = I.burning.findIndex(b => b.id === id);
  if (at > 0) {
    const was = I.burning[0];
    I.burning.unshift(...I.burning.splice(at, 1));
    I.burning[0].inEidon = true;
    if (was) was.inEidon = eidonPicks().length < eidonCap();   // the old primary stays in if there's room
  }
  renderCogList(); renderMain();
}
function nextRound() {
  const I = state.ign, out = [];
  I.burning.forEach(b => b.rounds--);
  I.burning = I.burning.filter(b => { if (b.rounds > 0) return true; out.push(INDEX.find(c => c.id === b.id)?.name || b.id); return false; });
  if (I.burning[0]) I.burning[0].inEidon = true;
  I.burnedRound = false; I.eidonRound = false;
  toast(out.length ? `${out.join(" and ")} burned out` : "Next round");
  renderCogList(); syncBar(); renderMain();
}
function shortRest() { state.ign.blaze = Math.min(blazeMax(), blazeNow() + 1); toast("Short rest — a Hit Die spent for 1 Blaze Point"); syncBar(); renderMain(); }
function longRest() {
  Object.assign(state.ign, { blaze: null, burning: [], burnedRound: false, eidonRound: false, last: null });
  toast("Long rest — Blaze restored, every Burn is out"); renderCogList(); syncBar(); renderMain();
}

// ═══════════════════════════════════════════════════════════
//  THE EIDON — everything the forge and the card read
// ═══════════════════════════════════════════════════════════
function setTemplate(k) {
  const I = state.ign;
  I.template = I.template === k ? null : k;
  I.spend = {};
  I.act = I.template ? EIDON_TEMPLATES[I.template].acts[0] : null;
  renderMain();
}
function setEidonAct(a) { state.ign.act = a; renderMain(); }
// Spend or take back a die on one of the Template's options
function ignSpend(key, d) {
  const I = state.ign, t = EIDON_TEMPLATES[I.template]; if (!t) return;
  const o = t.spends.find(s => s.key === key); if (!o) return;
  const now = I.spend[key] || 0, next = Math.max(0, Math.min(o.max || 1, now + d));
  if (next === now) return;
  if (d > 0) {
    const tier = getTier(state.charLevel), pool = EIDON_POOL[Math.min(3, tier)];
    if (o.minTier && tier < o.minTier) { toast(`${o.label} opens at ${TIERS[o.minTier].label}`); return; }
    if (o.needs && !t.spends.some(s => s.group === o.needs && I.spend[s.key])) { toast(`${o.label} needs the condition raised first`); return; }
    // one option per group — a sibling already taken gives its dice back before the budget is checked
    const without = { ...I.spend };
    if (o.group) t.spends.filter(s => s.group === o.group && s.key !== key).forEach(s => delete without[s.key]);
    if (spentDice(t, without) + o.dice > pool) { toast(`Not enough power dice — ${o.label} costs ${o.dice}d12`); return; }
    I.spend = without;
  }
  if (next) I.spend[key] = next; else delete I.spend[key];
  if (!next && o.group) t.spends.filter(s => s.needs === o.group).forEach(s => delete I.spend[s.key]);         // its dependants go too
  renderMain();
}
function spentDice(t, sp) { return t.spends.reduce((s, o) => s + o.dice * (sp[o.key] || 0), 0); }
function ignVerum(tpl, name) { state.ign.verums[tpl] = name; renderMain(); }
function ignName(v) {   // typing the name shouldn't rebuild the input you're typing in
  state.ign.name = v;
  asEidonSlot(() => {
    const e = eidon(), seal = document.getElementById("sumBody");
    if (e.ok) { seal.innerHTML = eidonCardHTML(e); seal.dataset.text = eidonCardText(e).join("\n"); }
  });
}
function resetSuccesses() { state.ign.successes = 0; renderMain(); }
// Build anything that resolves text as the slot this Eidon counts as, then give the composer its slot back
function asEidonSlot(fn) {
  const keep = state.slotLevel;
  state.slotLevel = EIDON_SLOT[Math.min(3, getTier(state.charLevel))];
  try { return fn(); } finally { state.slotLevel = keep; }
}

function eidon() {
  const I = state.ign, tier = getTier(state.charLevel), pb = profBonus();
  const cogs = eidonPicks().map(b => ({ ...b, cog: LOADED[b.id], entry: INDEX.find(c => c.id === b.id) })).filter(x => x.cog && x.entry);
  const prim = cogs[0] || null;
  const t = I.template ? { key: I.template, ...EIDON_TEMPLATES[I.template] } : null;
  const sp = I.spend || {};
  const pool = EIDON_POOL[Math.min(3, tier)];

  // The spends taken, and the condition they (or the Template) carry
  const taken = t ? t.spends.filter(o => sp[o.key]).map(o => ({ ...o, n: sp[o.key] })) : [];
  const spent = t ? spentDice(t, sp) : 0;
  let condV = t?.cond || 0;
  taken.forEach(o => { if (o.cond) condV = Math.max(condV, o.cond); });
  const cond = condV && prim ? eidonCondition(prim.cog, condV) : null;
  const stacked = cond && condV > 2 && sp.stack ? eidonCondition(prim.cog, 2) : null;

  // The Eidon Check: base, +3 per extra Cognition, +1 per die spent shaping it
  const mods = [];
  if (cogs.length > 1) mods.push([cogs.length === 2 ? "Second Cognition" : "Second and third Cognitions", EIDON_COG_DC * (cogs.length - 1)]);
  if (spent) mods.push([`${spent} ${spent === 1 ? "die" : "dice"} spent shaping it`, EIDON_DIE_DC * spent]);
  const dc = EIDON_BASE_DC + mods.reduce((s, m) => s + m[1], 0);
  const bonus = state.dreamMod, need = dc - bonus;
  const chance = Math.max(0, Math.min(20, 21 - need)) / 20;

  // What the primary Cognition lends — its Verum at your level — and what the others add as Sigils
  let borrowed = null;
  if (t && prim) {
    const pool2 = t.pools.find(p => prim.cog.verumEffects?.[p]?.length && !prim.cog.incompatible?.includes(p)) || null;
    const verums = pool2 ? prim.cog.verumEffects[pool2] : [];
    const av = verums.find(v => v.name === I.verums[t.key]) || verums[0] || null;
    const sigils = cogs.slice(1).map(x => {
      const fx = (x.cog.complementEffects || []).find(f => t.pools.some(p => String(f.type).toLowerCase() === COMP_DATA[p].label.toLowerCase()));
      return fx ? { x, fx } : null;
    }).filter(Boolean);
    borrowed = { pool: pool2, verums, av, ladder: av ? coreLadder(av, tier) : [], sigils, bonus: av ? verumBonusDice(av, tier) : 0 };
  }

  // What's left of the pool is the Template's output; borrowed Verum dice always join it
  const left = Math.max(0, pool - spent);
  const bonusDice = borrowed?.bonus || 0;
  let out = left + bonusDice;
  if (taken.some(o => o.halves)) out = Math.floor(out / 2);
  const act = I.act || t?.acts[0];
  if (act === "bonus") out = Math.floor(out / 2);   // a Bonus Action Eidon lands at half

  const type = prim ? liveType(prim.cog.damageType || "force", prim.cog, tier) : null;
  const warn = [];
  if (state.dreamMod < 1) warn.push("Eidons need a Dream Score of 13 or higher (Dream mod +1).");
  if (I.eidonRound) warn.push("You've already manifested an Eidon this round.");
  if (blazeNow() < 1) warn.push("No Blaze Point left to manifest it.");
  if (cogs.length > 3) warn.push(`${cogs.length} Cognitions — only as a forged Ignition; it can't be manifested as an improvised Eidon.`);

  return {
    ok: !!prim && !!t, prim, cogs, t, tier, pb, pool, sp, taken, spent, left, bonusDice, out, cond, condV, stacked,
    mods, dc, bonus, need, chance, borrowed, slot: EIDON_SLOT[Math.min(3, tier)],
    fuel: borrowed?.av?.fuel || 0, coronas: borrowed?.av?.corona ? [{ av: borrowed.av }] : [],
    type, abs: prim ? isAbsolute(prim.cog, tier) : false,
    save: prim?.cog?.savingThrow || "—", saveDC: eidonSaveDC(), warn,
    act,
    name: I.name.trim() || (prim && t ? `${prim.entry.name} ${t.label}` : "Eidon"),
  };
}

// The Verum's bonus dice at this tier — later tiers restate the total rather than stack, as on a seal
function verumBonusDice(av, tier) {
  let n = 0;
  for (let i = 0; i <= Math.min(tier, (av.tiers?.length || 1) - 1); i++) {
    const b = (partMech(av.tiers[i]) || {}).damage?.bonusDice;
    if (typeof b === "number") n = b;
  }
  return n;
}
// What the unspent dice become, in words
function outLabel(e) {
  return e.t.out === "temp" ? "temp HP" : e.t.out === "reduce" ? "damage reduced" : `${e.type}${e.abs ? " · absolute" : ""}`;
}
function diceBits(e) {
  return `${e.pool}d12 pool${e.spent ? ` − ${e.spent} spent` : ""}${e.bonusDice ? ` + ${e.bonusDice} ${e.borrowed.av.name}` : ""}${e.taken.some(o => o.halves) ? ", halved" : ""}${e.act === "bonus" ? ", halved (bonus action)" : ""}`;
}
function rollLabel(e) {
  return e.t.roll === "attack" ? "your weapon attack" : e.t.roll === "save" ? `a ${e.save} save (DC ${e.saveDC})`
       : e.t.roll === "path" ? `a Dexterity save (DC ${e.saveDC}) for those in the path` : "no roll";
}

function rollEidon() {
  const e = eidon(), I = state.ign;
  if (!e.ok) return;
  if (e.cogs.length > 3) { toast("Four or more Cognitions can only be forged — this recipe can't be manifested improvised"); return; }
  const d20 = 1 + Math.floor(Math.random() * 20), total = d20 + e.bonus, ok = total >= e.dc;
  spendBlaze(1); I.eidonRound = true;
  I.last = { d20, total, dc: e.dc, ok };
  if (ok) I.successes++;
  toast(ok ? `Manifested — ${total} vs DC ${e.dc}` : `Failed — ${total} vs DC ${e.dc}. The Blaze Point is lost`);
  syncBar(); renderMain();
}

// ═══════════════════════════════════════════════════════════
//  THE FORGE — composer and card in Ignition mode
// ═══════════════════════════════════════════════════════════
function renderForge() { asEidonSlot(renderForgeNow); }
function renderForgeNow() {
  const comp = document.getElementById("composer"), seal = document.getElementById("sumBody");
  comp.innerHTML = ignRules() + buildForge();
  const e = eidon();
  if (!e.prim)      { seal.innerHTML = `<div class="empty">Burn a Cognition from the left to begin an Eidon.</div>`; seal.dataset.text = ""; }
  else if (!e.ok)   { seal.innerHTML = `<div class="empty">Choose a Template — what shape the Eidon takes.</div>`; seal.dataset.text = ""; }
  else              { seal.innerHTML = eidonCardHTML(e); seal.dataset.text = eidonCardText(e).join("\n"); }
  document.getElementById("mPlay").className = "mini on";
}

// ── The primary Cognition's own rules apply to the Eidon exactly as to a seal's Core:
//    its cost, its engine (Sun's Solar Tracker, Lunar's phase), and its mastery.
function ignLogTrack() {
  const trk = trackerOf(eidon().prim?.cog); if (!trk) return;
  state.track.marks = trk.last ? [] : [...trk.marks, trk.now];
  state.track.now = "gold";
  renderMain();
}
function primaryRules(e) {
  const cog = e.prim.cog;
  let b = "";
  if (cog.cost) b += `<div class="c-cost" style="margin-top:0">${esc(cardLine(cog.cost))}</div>`;
  const trk = trackerOf(cog);
  if (trk) {
    b += `<div class="chips" style="margin-top:8px">` + Array.from({ length: trk.win }, (_, i) => {
      if (i < trk.marks.length) return `<button class="chip pip ${trk.marks[i]}" onclick="markTrack(${i})">${i + 1} · ${trk.marks[i] === "gold" ? "Gold" : "Black"}</button>`;
      if (i === trk.marks.length) return `<button class="chip pip now on">${i + 1} · now</button>`;
      return `<button class="chip pip dis">${i + 1}</button>`;
    }).join("") + `</div><div class="chips" style="margin-top:6px">
      <button class="chip${trk.now === "gold" ? " on" : ""}" onclick="setTrackNow('gold')">${esc(trk.tr.gold?.label || "Gold")}${e.fuel ? ` — spend ${e.fuel}` : ""}</button>
      <button class="chip${trk.now === "black" ? " on" : ""}" onclick="setTrackNow('black')">${esc(trk.tr.black?.label || "Black")} — can't pay</button>
      <button class="chip" onclick="ignLogTrack()">Log it ›</button><button class="chip" onclick="resetTrack()">Reset</button></div>
      <p class="hint">${esc(trk.tr.name)}: activation ${trk.n} of ${trk.win}${trk.last && trk.reck ? ` — <strong>${esc(trk.reck.name)}</strong>: ${esc(resolve(trk.reck.card))}` : ""}. An Eidon counts as a Sun activation; its cost is the borrowed Verum's.</p>`;
  }
  const ph = phaseOf(cog);
  if (ph) b += `<div class="chips" style="margin-top:8px">` + ph.all.map((p, i) =>
      `<button class="chip${i === ph.index ? " on" : ""}" onclick="selectPhase(${i})">${esc(p.name)}</button>`).join("") +
    `</div><p class="hint"><strong>${esc(ph.now.epithet || ph.now.name)}</strong> — ${esc(resolve(ph.now.card))}. Then turn it to ${esc(ph.next.name)} or ${esc(ph.prev.name)}.</p>`;
  const ms = masteryOf(cog);
  if (ms.length) b += `<div class="c-mastery">` + ms.map(tr => `<div><b>${esc(tr.name)}</b>${esc(resolve(tr.card))}</div>`).join("") + `</div>`;
  return b ? block(`${esc(e.prim.entry.name)}'s own rules — they bind the Eidon too`, b) : "";
}
function primaryCard(e) {
  const cog = e.prim.cog;
  let h = "";
  if (cog.cost) h += `<div class="c-cost">${esc(cardLine(cog.cost))}</div>`;
  const ms = masteryOf(cog);
  if (ms.length) h += `<div class="c-mastery">` + ms.map(tr => `<div><b>${esc(tr.name)}</b>${esc(resolve(tr.card))}</div>`).join("") + `</div>`;
  const k = trackerOf(cog);
  if (k) {
    h += `<div class="c-engine track ${k.now}"><b>${k.now === "gold" ? "☀ Gold Sun" : "● Black Sun"} · ${k.n} of ${k.win}</b>` +
      esc(k.now === "gold" ? `Spend ${e.fuel || "its"} Corruption Point${e.fuel === 1 ? "" : "s"}` : "Gain 1d4 Corruption Points (no save) — spend nothing") +
      (k.last && k.reck ? `<span><strong>Reckoning — ${esc(k.reck.name)}.</strong> ${esc(resolve(k.reck.card))}</span>` : `<span>${k.win - k.n} more before the Reckoning.</span>`) + `</div>`;
    if (k.last && k.reck?.corona) e.coronas.forEach(x => h += `<div class="c-corona"><b>☀ Corona — ${esc(x.av.corona.name)}</b>${esc(resolve(x.av.corona.card))}</div>`);
  }
  const ph = phaseOf(cog);
  if (ph) h += `<div class="c-engine"><b>${esc(ph.now.name)}</b> ${esc(resolve(ph.now.card))}<span>Then turn it to ${esc(ph.next.name)} or ${esc(ph.prev.name)} — or hold it for 1 Dream Exhaustion.</span></div>`;
  return h;
}
function primaryText(e) {
  const cog = e.prim.cog, L = [];
  if (cog.cost) L.push(`COST — ${cardLine(cog.cost)}`);
  masteryOf(cog).forEach(tr => L.push(`${tr.name.toUpperCase()} — ${resolve(tr.card)}`));
  const k = trackerOf(cog);
  if (k) {
    L.push(`${k.tr.name.toUpperCase()} — activation ${k.n}/${k.win}, ${k.now === "gold" ? `GOLD: spend ${e.fuel} Corruption` : "BLACK: gain 1d4 Corruption, spend nothing"}`);
    if (k.last && k.reck) L.push(`RECKONING — ${k.reck.name}: ${resolve(k.reck.card)}`);
    if (k.last && k.reck?.corona) e.coronas.forEach(x => L.push(`CORONA — ${resolve(x.av.corona.card)}`));
  }
  const ph = phaseOf(cog);
  if (ph) L.push(`PHASE — ${ph.now.name}: ${resolve(ph.now.card)} (then ${ph.next.name} or ${ph.prev.name}, or hold it for 1 Dream Exhaustion)`);
  return L;
}

function ignRules() {
  return `<details class="rules"><summary>Rules of Ignition</summary><div class="rules-b">
    <h3>Numbers</h3><ul>
      <li><strong>Blaze Points</strong> — equal to your Proficiency Bonus. A long rest restores them; on a short rest you may spend a Hit Die for 1.</li>
      <li><strong>Burning a Cognition</strong> — free action, once per turn, no Blaze; it Burns for 1 minute. Burn as many as you like; an Eidon draws on the primary and up to two more.</li>
      <li><strong>Power dice</strong> — 4d12 / 6d12 / 8d12 / 10d12 by character tier. Spend them on the Template's options; what's left is its output.</li>
      <li><strong>Eidon Check</strong> — d20 + Dream mod against DC 6, +1 per die you spend, +3 per extra Cognition. The same odds at every level.</li>
      <li><strong>Eidon save DC</strong> — 8 + your highest physical modifier + Proficiency Bonus + Dream mod.</li>
      <li><strong>Ignitions you can know</strong> — equal to your Dream mod (minimum 1).</li>
      <li><strong>Arcanum Veritas</strong> — a creature that knows Arcanum Veritas can't learn Ignitions or manifest Eidons.</li>
    </ul>
    <h3>Eidons</h3><ul>
      <li>Need a Dream Score of 13+, at least one Burning Cognition, the Template's activation, and 1 Blaze Point to manifest.</li>
      <li>Any Template but Reversal can be a <strong>Bonus Action</strong> instead — at half its output, and half Mobility's distance.</li>
      <li>One Template and one Eidon per round. They can't be stored or planned ahead; a failed check still spends the Blaze Point.</li>
      <li>They ignore magical countering, though an opposing Eidon or Arcanum Veritas may disrupt one (DM's call).</li>
      <li>Manifest the same Eidon successfully 3 times and it can become a permanent Ignition at your next long rest.</li>
    </ul>
  </div></details>`;
}

function buildForge() {
  const I = state.ign, e = eidon();
  let h = "";

  // ── Blaze & Burning
  const bmax = blazeMax(), bnow = blazeNow();
  let b = `<div class="blaze">${Array.from({ length: bmax }, (_, i) => `<span class="bp${i < bnow ? " on" : ""}"></span>`).join("")}
    <b>${bnow} / ${bmax}</b><i>Blaze Points</i></div>`;
  b += I.burning.length ? `<div class="burns">` + I.burning.map((x, i) => {
      const c = INDEX.find(k => k.id === x.id) || { name: x.id };
      const inE = i === 0 || x.inEidon;
      return `<div class="burn${i === 0 ? " prim" : inE ? " in" : ""}"><span class="ico">${cogIcon(c)}</span><b>${esc(c.name)}</b>
        <i>${i === 0 ? "primary" : inE ? "in the Eidon" : "burning"}</i>
        ${i > 0 ? `<button class="mini" onclick="toggleInEidon('${escAttr(x.id)}')" title="${inE ? "Leave it out of the Eidon (−3 DC)" : "Draw on it in the Eidon (+3 DC)"}">${inE ? "leave out" : "add to Eidon"}</button>` : ""}
        <span class="rnd" title="Rounds of Burning left">${x.rounds}/${BURN_ROUNDS} rounds</span>
        ${i > 0 ? `<button class="mini" onclick="setPrimary('${escAttr(x.id)}')">make primary</button>` : ""}
        <button class="mini" onclick="toggleBurn('${escAttr(x.id)}')" title="Put it out">✕</button></div>`;
    }).join("") + `</div>` : `<p class="hint">Nothing is Burning. Click a Cognition on the left to Burn it — free action, once per turn, 1 minute. Burning costs no Blaze.</p>`;
  b += `<div class="chips" style="margin-top:8px">
    <button class="chip" onclick="nextRound()" title="Burns tick down; you may Burn and manifest again">Next round ›</button>
    <button class="chip" onclick="shortRest()">Short rest (+1, spend a Hit Die)</button>
    <button class="chip" onclick="longRest()">Long rest</button></div>`;
  if (I.burnedRound) b += `<p class="hint">You've Burned this turn.</p>`;
  h += block("Blaze &amp; Burning", b);

  if (!e.prim) return h;
  h += primaryRules(e);

  // ── Name + Template
  let t = `<input class="search eidon-name" type="text" placeholder="Name your Eidon — ${esc(e.name)}" value="${esc(I.name).replace(/"/g, "&quot;")}" oninput="ignName(this.value)">`;
  t += `<div class="tpls">` + Object.entries(EIDON_TEMPLATES).map(([k, d]) =>
      `<button class="tpl${I.template === k ? " on" : ""}" onclick="setTemplate('${k}')"><b>${d.label}</b><em class="tpl-ep">${d.epithet}</em><span>${d.use}</span>
        <i>${d.acts.map(a => EIDON_ACTS[a]).join(" or ")} · borrows ${d.pools.map(p => COMP_DATA[p].label).join(" or ")}</i></button>`).join("") +
    `</div><p class="hint">One Template per Eidon — it's the Eidon's shape, the way a Ring is a seal's.</p>`;
  h += block("Eidon — template", t);
  if (!e.t) return h;

  // ── The Template itself: activation, scaling, tier features, and what to spend dice on
  let m = "";
  if (e.t.acts.length > 1) m += `<div class="chips" style="margin-bottom:6px"><span class="chip-lbl">Activation</span>` +
    e.t.acts.map(a => `<button class="chip${e.act === a ? " on" : ""}" onclick="setEidonAct('${a}')">${EIDON_ACTS[a]}${a === "bonus" ? " — half output" : ""}</button>`).join("") + `</div>`;
  m += `<p class="scale-note">Roll: <strong>${esc(rollLabel(e))}</strong> · Reach: <strong>${esc(e.t.scale(e.tier, e.sp, e.act))}</strong> · Output: <strong>${e.out}d12 ${esc(outLabel(e))}</strong></p>`;
  m += `<div class="ladder">` + e.t.tiers.map((tx, i) =>
    `<div class="rung ${i === e.tier ? "now" : i < e.tier ? "past" : "later"}"><span class="lv">${TIERS[i].label}</span><span>${esc(tx)}</span></div>`).join("") + `</div>`;
  m += `<div class="spends">` + e.t.spends.map(o => {
      const n = e.sp[o.key] || 0, locked = (o.minTier && e.tier < o.minTier) || (o.needs && !e.taken.some(x => x.group === o.needs));
      const cc = o.cond ? eidonCondition(e.prim.cog, o.cond) : null;
      return `<div class="spend${n ? " on" : ""}${locked ? " dis" : ""}">
        <button class="mini" onclick="ignSpend('${o.key}', -1)" ${n ? "" : "disabled"}>−</button>
        <b>${n > 1 ? n + " × " : ""}${esc(o.label)}${cc ? ` — ${esc(cc.name)}` : ""}</b>
        <i>${o.dice}d12${o.max > 1 ? ` each (up to ${o.max})` : ""}${locked ? (o.minTier ? ` · from ${TIERS[o.minTier].label}` : " · raise the condition first") : ""}</i>
        <button class="mini" onclick="ignSpend('${o.key}', 1)" ${locked || n >= (o.max || 1) ? "disabled" : ""}>+</button></div>`;
    }).join("") + `</div>`;
  m += `<p class="hint" style="font-style:normal">${e.pool}d12 power dice at ${TIERS[e.tier].label} · <strong>${e.spent}d12</strong> spent (+${e.spent} to the check) · <strong>${e.left}d12</strong> left` +
    `${e.bonusDice ? ` + ${e.bonusDice}d12 borrowed` : ""}${e.taken.some(o => o.halves) ? ", halved" : ""}${e.act === "bonus" ? ", halved for the Bonus Action" : ""} → <strong>${e.out}d12 ${esc(outLabel(e))}</strong>. It counts as a ${ORDINALS[e.slot]}-level slot for anything a borrowed Verum scales by slot.</p>`;
  if (e.cond) m += `<p class="hint" style="font-style:normal"><strong>${esc(e.cond.name)}</strong> (${e.cond.sev.toLowerCase()}) — ${esc(e.cond.card)}${e.stacked ? `, and <strong>${esc(e.stacked.name)}</strong> — ${esc(e.stacked.card)}` : ""}.</p>`;
  h += block(`${e.t.label} — ${e.t.epithet}`, m);

  // ── Borrowed Verum
  const x = e.borrowed;
  let v = `<div class="vname">${x.pool ? `${esc(e.prim.entry.name)}'s ${COMP_DATA[x.pool].label} Verum` : "Nothing to borrow"}</div>`;
  if (!x.av) v += `<p class="hint">${esc(e.prim.entry.name)} has no ${e.t.pools.map(p => COMP_DATA[p].label).join(" or ")} Verum — this Template runs on its power dice alone.</p>`;
  else {
    if (x.verums.length > 1) v += `<div class="chips" style="margin-bottom:6px">` + x.verums.map(vv =>
      `<button class="chip${vv.name === x.av.name ? " on" : ""}" onclick="ignVerum('${e.t.key}','${escAttr(vv.name)}')">${esc(vv.name)}</button>`).join("") + `</div>`;
    v += `<div class="ladder">` + x.ladder.map(r => `<div class="rung ${r.now ? "now" : "past"}"><span class="lv">${esc(r.label)}</span><span>${esc(r.line)}</span></div>`).join("") + `</div>`;
  }
  x.sigils.forEach(s => v += `<p class="hint" style="font-style:normal">＋ <strong>${esc(s.x.entry.name)}</strong> · ${esc(s.fx.name)}: ${esc(cardLine(s.fx.effect))}</p>`);
  h += block("Borrowed Verum", v);

  // ── The check
  let c = `<div class="dc-rows"><div><span>Base</span><b>${EIDON_BASE_DC}</b></div>` + e.mods.map(([l, n]) => `<div><span>${esc(l)}</span><b>+${n}</b></div>`).join("") +
    `<div class="tot"><span>Eidon Check DC</span><b>${e.dc}</b></div></div>`;
  c += `<p class="hint" style="font-style:normal">You roll d20 ${sgn(e.bonus)} (your Dream mod) — you need <strong>${Math.max(1, e.need)}+</strong> on the die, about <strong>${Math.round(e.chance * 100)}%</strong>.</p>`;
  c += `<div class="chips"><button class="chip roll" onclick="rollEidon()">Roll the Eidon Check</button>
    <button class="chip" onclick="resetSuccesses()">Reset count</button></div>`;
  if (I.last) c += `<p class="hint" style="font-style:normal">Last: d20 = ${I.last.d20} → ${I.last.total} vs DC ${I.last.dc} — <strong class="${I.last.ok ? "ok" : "bad"}">${I.last.ok ? "manifested" : "failed — the Blaze Point is lost"}</strong>.</p>`;
  c += `<p class="hint">Manifested ${"●".repeat(Math.min(3, I.successes))}${"○".repeat(Math.max(0, 3 - I.successes))} — at 3, it can become a permanent Ignition.</p>`;
  h += block("Eidon Check", c);

  // ── What forging this exact recipe into an Ignition would take in downtime
  const fp = forgePlan(e);
  const fchance = Math.max(0, Math.min(20, 21 - (fp.dc - fp.roll))) * 5;
  let f = `<div class="chips" style="margin-bottom:8px"><button class="chip${I.forge ? " on" : ""}" onclick="setForgeRecipe(${!I.forge})"
      title="An improvised Eidon holds three Cognitions; a forged Ignition can hold up to 3 + your Dream mod">Forged recipe — up to ${3 + Math.max(0, state.dreamMod)} Cognitions</button></div>`;
  f += `<div class="dc-rows">
      <div><span>Rank</span><b>${fp.rank}</b></div>
      <div><span>Workweeks</span><b>${fp.weeks}</b></div>
      <div><span>Forge DC</span><b>${fp.dc}</b></div>
      <div><span>Dream Catalyst${fp.catalysts > 1 ? "s" : ""}</span><b>${fp.catalysts > 1 ? fp.catalysts + " × " : ""}${fp.catalyst}</b></div>
      <div class="tot"><span>Forge roll d20 ${sgn(fp.roll)} (Dream + Proficiency)</span><b>${fchance}%</b></div></div>
    <p class="hint">Each workweek: a success is a week of progress; fail by 5+ (or roll a 1) and it's Backlash. Each time you land this Eidon in a real fight counts as a week, up to ${fp.field}${e.cogs.length > 3 ? " (not for a recipe beyond three Cognitions — it can't be manifested improvised)" : ""}. A mentor gives advantage; a Node of ${esc(e.prim.entry.name)} lowers the DC by 2. Imprinting it into a ${fp.item} Dream Item takes ${fp.weeks * 2} workweeks.</p>`;
  h += block("Forge it in downtime", f);
  return h;
}

function eidonCardHTML(e) {
  const I = state.ign;
  let nums = `<span class="n atk"><b>DC ${e.dc}</b><i>Eidon Check</i><u>d20 ${sgn(e.bonus)} · need ${Math.max(1, e.need)}+ · ${Math.round(e.chance * 100)}%</u></span>`;
  if (e.t.roll === "save" || e.t.roll === "path") nums += `<span class="n dc"><b>${e.saveDC}</b><i>${esc(e.t.roll === "path" ? "Dexterity" : e.save)} save</i></span>`;
  if (e.t.roll === "attack") nums += `<span class="n dc"><b>weapon</b><i>attack roll</i></span>`;
  nums += `<span class="n dmg${e.abs && e.t.out === "damage" ? " abs" : ""}"><b>${e.out}d12</b><i>${esc(outLabel(e))}</i><u>${esc(diceBits(e))}</u></span>`;
  let h = `<div class="card eidon">
    <div class="c-name">${esc(e.name)}</div>
    <div class="c-sub">Eidon · ${esc(e.t.label)}, ${esc(e.t.epithet)} · ${EIDON_ACTS[e.act]} · level ${state.charLevel} (as a ${ORDINALS[e.slot]} slot)</div>
    <div class="c-nums">${nums}</div>
    <div class="c-tags">${e.cogs.map((x, i) => `<span class="t${i === 0 ? " hot" : ""}">${esc(x.entry.name)} · ${x.rounds}/${BURN_ROUNDS}</span>`).join("")}
      <span class="t">${esc(e.t.scale(e.tier, e.sp, e.act))}</span></div>
    <div class="c-cost">Blaze — 1 to manifest · a failed check still spends it</div>
    ${primaryCard(e)}`;
  // The Template's own ladder, and what the dice were spent on
  h += `<div class="c-sec"><div class="c-lbl">${esc(e.t.label)} · ${TIERS[e.tier].label}</div><div class="c-core"><b>${esc(e.t.label)} — ${esc(e.t.epithet)}</b>` +
    e.t.tiers.slice(0, e.tier + 1).map((tx, i) => `<div class="c-tier${i === e.tier ? " now" : ""}"><span class="c-tl">${TIERS[i].label}</span><span>${esc(tx)}</span></div>`).join("") + `</div>`;
  if (e.taken.length) h += `<div class="c-row"><div class="c-src">Spent</div><div class="c-txt">` +
    e.taken.map(o => `${o.n > 1 ? o.n + " × " : ""}${esc(o.label)}${o.cond ? ` (${esc(eidonCondition(e.prim.cog, o.cond).name)})` : ""} — ${o.dice * o.n}d12`).join(" · ") + `</div></div>`;
  h += `</div>`;
  if (e.cond) h += `<div class="c-engine cond"><b>${esc(e.cond.name)}</b>On a failed ${esc(e.save)} save (DC ${e.saveDC}): ${esc(e.cond.card)}${e.stacked ? `, and ${esc(e.stacked.name)} — ${esc(e.stacked.card)}` : ""}, until the end of its next turn.</div>`;
  const x = e.borrowed;
  if (x.av) {
    h += `<div class="c-sec"><div class="c-lbl">${COMP_DATA[x.pool].label} Verum · borrowed</div><div class="c-core"><b>${esc(x.av.name)}</b>` +
      x.ladder.map(r => `<div class="c-tier${r.now ? " now" : ""}"><span class="c-tl">${esc(r.label)}</span><span>${esc(r.line)}</span></div>`).join("") + `</div>`;
    x.sigils.forEach(s => h += `<div class="c-row"><div class="c-src">${esc(s.x.entry.name)}</div><div class="c-txt">${esc(cardLine(s.fx.effect))}` +
      liveUpgrades(s.fx.upgrades, e.tier).map(u => `<span class="c-up">${esc(cardLine(u))}</span>`).join("") + `</div></div>`);
    h += `</div>`;
  }
  if (e.warn.length) h += `<div class="c-foot">${e.warn.map(w => `⚠ ${esc(w)}`).join("<br>")}</div>`;
  const fpC = forgePlan(e);
  h += `<div class="c-foot">${e.cogs.length > 3 ? "A forged recipe" : `Manifested ${Math.min(3, I.successes)}/3 — at 3 it can be reforged into a permanent Ignition · or forge it in downtime`}: Rank ${fpC.rank}, ${fpC.weeks} workweeks, Forge DC ${fpC.dc}, ${fpC.catalysts > 1 ? fpC.catalysts + " × " : "a "}${fpC.catalyst} Dream Catalyst${fpC.catalysts > 1 ? "s" : ""}.</div>`;
  return h + `</div>`;
}

function eidonCardText(e) {
  const L = [];
  L.push(`${e.name.toUpperCase()} · Eidon — ${e.t.label}, ${e.t.epithet}`);
  L.push(`${EIDON_ACTS[e.act]} · Char Lv ${state.charLevel} (as a ${ORDINALS[e.slot]} slot) · ${e.t.scale(e.tier, e.sp, e.act)}`);
  L.push(`Eidon Check DC ${e.dc} (d20 ${sgn(e.bonus)}, need ${Math.max(1, e.need)}+) · ${rollLabel(e)} · ${e.out}d12 ${outLabel(e)} (${diceBits(e)})`);
  L.push(`BURNING — ${e.cogs.map(x => `${x.entry.name} (${x.rounds}/${BURN_ROUNDS})`).join(", ")}`);
  L.push(`BLAZE — 1 to manifest · a failed check still spends it`);
  primaryText(e).forEach(x => L.push(x));
  if (e.cond) L.push(`CONDITION — ${e.cond.name}: on a failed ${e.save} save (DC ${e.saveDC}), ${e.cond.card}${e.stacked ? `, and ${e.stacked.name}: ${e.stacked.card}` : ""}, until the end of its next turn`);
  L.push(`DC — ${EIDON_BASE_DC} ${e.mods.map(([l, n]) => `+${n} ${l.toLowerCase()}`).join(" ")}`.trim());
  L.push("");
  L.push(`${e.t.label.toUpperCase()} — ${TIERS[e.tier].label}`);
  e.t.tiers.slice(0, e.tier + 1).forEach((tx, i) => L.push(`  ${i === e.tier ? "▸" : "·"} ${TIERS[i].label}: ${tx}`));
  if (e.taken.length) L.push(`  SPENT — ${e.taken.map(o => `${o.n > 1 ? o.n + " × " : ""}${o.label} (${o.dice * o.n}d12)`).join(", ")}`);
  const x = e.borrowed;
  if (x.av) {
    L.push(`${COMP_DATA[x.pool].label.toUpperCase()} VERUM — ${x.av.name} (borrowed)`);
    x.ladder.forEach(r => L.push(`  ${r.now ? "▸" : "·"} ${r.label}: ${r.line}`));
  }
  x.sigils.forEach(s => L.push(`  + ${s.x.entry.name}: ${cardLine(s.fx.effect)}`));
  const fpT = forgePlan(e);
  L.push(`FORGE — Rank ${fpT.rank} Ignition in downtime: ${fpT.weeks} workweeks, Forge DC ${fpT.dc}, ${fpT.catalysts > 1 ? fpT.catalysts + " × " : ""}${fpT.catalyst} Dream Catalyst${fpT.catalysts > 1 ? "s" : ""}`);
  e.warn.forEach(w => L.push(`⚠ ${w}`));
  return L;
}

// Ignition mode's rail: every ready Cognition, lit by whether it's Burning
function renderBurnRail(box, q) {
  const I = state.ign;
  const { shown, h } = groupedRail(q, c => {
    const at = I.burning.findIndex(b => b.id === c.id);
    const off = !c.ready;
    const cls = at === 0 ? "core" : at > 0 ? "comp" : off ? "off" : "";
    const role = at === 0 ? "primary" : at > 0 ? (I.burning[at].inEidon ? "in eidon" : "burning") : "";
    return `<button class="cog ${cls}" ${off && at < 0 ? "disabled" : ""} onclick="toggleCog('${escAttr(c.id)}')"
      title="${!c.ready ? c.name + " — not written yet" : at >= 0 ? c.name + " — Burning, click to put it out" : "Burn " + c.name}">
      <span class="ico">${cogIcon(c)}</span><span class="nm">${c.name}</span>
      ${c.favorite ? `<span class="cos" title="Player favourite">★</span>` : ""}
      ${role ? `<span class="rl">${role}</span>` : state.dm && c.written === false ? `<span class="rl dm">DM</span>` : ""}</button>`;
  });
  box.innerHTML = shown ? h : `<div class="empty" style="padding:22px 8px">${emptyRail(q)}</div>`;
}

// ═══════════════════════════════════════════════════════════
//  IGNITION REFERENCE — the Rings tab, in Ignition mode
// ═══════════════════════════════════════════════════════════
// One reference page per Template, read the way the Rings tab reads a Ring
function templateRef(k) {
  const t = EIDON_TEMPLATES[k];
  const rollTxt = t.roll === "attack" ? "Your weapon attack roll." : t.roll === "save" ? "A save against your Eidon save DC — the primary Cognition's save."
    : t.roll === "path" ? "None for you; creatures in your path make a Dexterity save against your Eidon save DC." : "None.";
  const outTxt = t.out === "temp" ? "The unspent dice become temporary hit points." : t.out === "reduce" ? "The unspent dice come off the damage you take."
    : "The unspent dice deal the primary Cognition's damage type.";
  return `<p class="cdx-desc">${t.use}</p>
    <div class="cdx-sec"><div class="cdx-defs">
      <div class="cdx-def"><b>Roll</b><span>${rollTxt}</span></div>
      <div class="cdx-def"><b>Activation</b><span>${t.acts.map(a => EIDON_ACTS[a] + (a === "bonus" ? " (at half output" + (k === "mobility" ? " and half the distance" : "") + ")" : "")).join(", ")}.</span></div>
      <div class="cdx-def"><b>Output</b><span>${outTxt}</span></div>
      <div class="cdx-def"><b>Borrows</b><span>The primary Cognition's ${t.pools.map(p => COMP_DATA[p].label).join(" Verum, falling back to ")}${t.pools.length ? " Verum" : ""}; each other Cognition in the Eidon lends that Sigil.</span></div>
    </div></div>
    <div class="cdx-sec"><h2>By tier</h2><div class="tbl-wrap"><table class="tbl"><thead><tr><th></th>${TIERS.map(x => `<th>${x.label}</th>`).join("")}</tr></thead><tbody>
      <tr><td>Power dice</td>${TIERS.map((_, i) => `<td>${EIDON_POOL[i]}d12</td>`).join("")}</tr>
      <tr><td>Reach</td>${TIERS.map((_, i) => `<td class="wrap">${t.scale(i, {})}</td>`).join("")}</tr>
      <tr><td>Counts as slot</td>${TIERS.map((_, i) => `<td>${ORDINALS[EIDON_SLOT[i]]}</td>`).join("")}</tr>
    </tbody></table></div></div>
    <div class="cdx-sec"><h2>Tier features — every tier reached applies</h2><div class="ladder">` +
      t.tiers.map((tx, i) => `<div class="rung"><span class="lv">${TIERS[i].label}</span><span>${tx}</span></div>`).join("") + `</div></div>
    <div class="cdx-sec"><h2>Spend power dice on</h2><div class="cdx-defs">` +
      t.spends.map(o => `<div class="cdx-def"><b>${o.dice}d12${o.max > 1 ? ` · ×${o.max}` : ""}</b><span>${o.label}${o.cond ? ` — the Cognition's ${EIDON_CONDITIONS.find(c => c.v === o.cond).label.toLowerCase()} condition` : ""}${o.minTier ? ` (from ${TIERS[o.minTier].label})` : ""}${o.needs ? " (only once the condition has been raised)" : ""}${o.halves ? " — the output is halved" : ""}.</span></div>`).join("") +
    `</div><p class="cdx-rings">Every die spent adds +1 to the Eidon Check.</p></div>`;
}

const IGN_REF = [
  { key: "overview", label: "Ignitions", grp: "The system", body: () => `
    <p class="cdx-desc">The way non-spellcasters get a piece of the magic: not spells thrown from a distance, but a Cognition's power driven through the body — faster, stronger, hitting harder.</p>
    <div class="cdx-sec"><h2>Quick reference</h2><div class="cdx-defs">
      <div class="cdx-def"><b>Learned from</b><span>Dream Items, Dream-Touched Creatures, Dream Realm Epiphanies.</span></div>
      <div class="cdx-def"><b>Learn limit</b><span>Equal to your Dream Score modifier (minimum 1).</span></div>
      <div class="cdx-def"><b>Activation cost</b><span>The Cognitions it needs must be Burning.</span></div>
      <div class="cdx-def"><b>Burning</b><span>Free action, once per turn, lasts 1 minute. It costs no Blaze.</span></div>
      <div class="cdx-def"><b>Blaze Points</b><span>Equal to your Proficiency Bonus — spent only to activate Eidons.</span></div>
      <div class="cdx-def"><b>Multiple Cognitions</b><span>Every Cognition a multi-Cognition Ignition names must be Burning.</span></div>
      <div class="cdx-def"><b>Ignition actions</b><span>Set by each Ignition: Action, Bonus Action, Reaction, or triggered.</span></div>
      <div class="cdx-def"><b>Arcanum Veritas</b><span>A creature that knows Arcanum Veritas can't learn Ignitions or manifest Eidons — the two ways of channelling a Cognition don't share a body.</span></div>
      <div class="cdx-def"><b>Other spellcasters</b><span>Can learn them — rarely optimal unless they fight up close.</span></div>
    </div></div>` },
  { key: "blaze", label: "Blaze &amp; Burning", grp: "The system", body: () => `
    <div class="cdx-sec"><h2>Blaze Points</h2><div class="cdx-note"><p>You have Blaze Points equal to your Proficiency Bonus — your capacity to turn channelled power into an Eidon. Activating an Eidon is the only thing that spends them. A long rest restores them; on a short rest you may spend a Hit Die to regain 1 (up to your maximum).</p></div></div>
    <div class="cdx-sec"><h2>Burning a Cognition</h2><div class="cdx-note">
      <p>To use an Ignition you channel a Cognition you know into your body — you <strong>Burn</strong> it. Burning is a free action you can take once per turn, costs nothing, and the Cognition stays channelled for the next minute. Burn as many as you like; an Eidon draws on the primary and up to two more you choose.</p>
      <p>Each Ignition says what activates it and which Cognition must be Burning. The strongest need several Burning at once.</p></div></div>
    <div class="cdx-sec"><h2>In the forge</h2><div class="cdx-note"><p>Click a Cognition in the rail to Burn it and again to put it out — Burning is free. <strong>Next round</strong> ticks every Burn down and lets you Burn and manifest again; the rest buttons restore Blaze.</p></div></div>` },
  { key: "inherit", label: "Inheriting", grp: "The system", body: () => `
    <div class="cdx-note"><p>Ignitions aren't learned like spells — they're earned, by proving yourself worthy of a Cognition's power through contact with its source.</p></div>
    <div class="cdx-sec"><h2>Sources</h2><div class="cdx-defs">
      <div class="cdx-def"><b>Dream Items</b><span>Weapons, armour or relics imprinted with an Ignition. Attune to one and know its core Cognitions, and the Ignition can pass from the item to you.</span></div>
      <div class="cdx-def"><b>Dream-Touched Creatures</b><span>Beings born of the dream realm or infused with a Cognition. Defeat or bond with one and its Ignition can transfer to you.</span></div>
      <div class="cdx-def"><b>Epiphanies</b><span>Venture into the dream realm — ritual, projection, or powerful magic — and an Epiphany may grant a brand new Ignition.</span></div>
    </div></div>` },
  { key: "eidons", label: "Eidons", grp: "Eidons", body: () => `
    <p class="cdx-desc">Improvised martial manifestations of conceptual power — forged on the spot through pure imagination, fuelled by Blaze and a Burning Cognition.</p>
    <div class="cdx-sec"><h2>Manifesting</h2><div class="cdx-defs">
      <div class="cdx-def"><b>Requirement</b><span>A Dream Score of 13 or higher, and not knowing Arcanum Veritas.</span></div>
      <div class="cdx-def"><b>Template</b><span>One per Eidon — its shape, the way a Ring is a seal's. Each has its own roll, reach, tier features and dice options.</span></div>
      <div class="cdx-def"><b>Power dice</b><span>4d12 / 6d12 / 8d12 / 10d12 by character tier. Spend them on the Template's options; what's left is its output. Dice a borrowed Verum adds always join the output.</span></div>
      <div class="cdx-def"><b>Its Cognition</b><span>The primary Burning Cognition's own rules bind the Eidon as they would a seal's Core — Blood's toll, Sun's Corruption and Reckoning, Nightmare's Dream save, Lunar's phase — and its conditions are the ones the Eidon inflicts. The others lend Sigils and don't pay.</span></div>
      <div class="cdx-def"><b>As a slot</b><span>For anything a borrowed Verum scales by slot level, an Eidon counts as a ${EIDON_SLOT.map(s => ORDINALS[s]).join(" / ")}-level slot by character tier — always a step below a seal.</span></div>
      <div class="cdx-def"><b>Cognitions</b><span>Burn as many as you like, once per turn. An Eidon draws on the primary and up to two more you choose — each one +3 to the check.</span></div>
      <div class="cdx-def"><b>Bonus Action</b><span>Any Template but Reversal can be manifested as a Bonus Action instead — at half its output (damage, temp HP, damage reduced), and half Mobility's distance.</span></div>
      <div class="cdx-def"><b>Cost</b><span>The Template's activation and 1 Blaze Point to manifest. Burning the Cognition beforehand is free.</span></div>
      <div class="cdx-def"><b>Limit</b><span>One Eidon per round.</span></div>
    </div></div>
    <div class="cdx-sec"><h2>Limitations</h2><div class="cdx-defs">
      <div class="cdx-def"><b>Burning</b><span>At least one Cognition must be Burning.</span></div>
      <div class="cdx-def"><b>No storing</b><span>Eidons can't be stored or planned ahead.</span></div>
      <div class="cdx-def"><b>Countering</b><span>They ignore magical countering — an opposing Eidon or Arcanum Veritas may disrupt one, at the DM's discretion.</span></div>
    </div></div>` },
  ...Object.keys(EIDON_TEMPLATES).map(k => ({ key: "tpl-" + k, label: EIDON_TEMPLATES[k].label, grp: "Templates", title: `${EIDON_TEMPLATES[k].label} — ${EIDON_TEMPLATES[k].epithet}`, body: () => templateRef(k) })),
  { key: "check", label: "Eidon Check", grp: "The roll", body: () => `
    <div class="cdx-sec"><h2>The roll</h2><div class="cdx-note"><p><strong>d20 + Dream mod</strong> against <strong>DC 6</strong>, raised by everything you put into it. Proficiency doesn't enter it, so the gamble is the same at level 1 and level 20 — only your Dream Score shifts it. On a success the Eidon manifests; on a failure the Blaze Point is spent and nothing happens.</p></div></div>
    <div class="cdx-sec"><h2>What raises the DC</h2><div class="cdx-defs">
      <div class="cdx-def"><b>+1</b><span>Every power die you spend on the Template's options.</span></div>
      <div class="cdx-def"><b>+3</b><span>Every Cognition beyond the first.</span></div>
    </div></div>
    <div class="cdx-sec"><h2>The odds</h2><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Eidon</th><th>DC</th>` +
      [1,2,3,4,5].map(m => `<th>Dream +${m}</th>`).join("") + `</tr></thead><tbody>` +
      [["Plain, 1 Cognition", 6], ["1 Cognition, 2 dice spent", 8], ["2 Cognitions", 9], ["2 Cognitions, 2 dice spent", 11],
       ["3 Cognitions, 4 dice spent", 16], ["3 Cognitions, 8 dice spent", 20]].map(([l, dc]) =>
        `<tr><td class="wrap">${l}</td><td>${dc}</td>` + [1,2,3,4,5].map(m => `<td>${Math.round(Math.max(0, Math.min(20, 21 - (dc - m))) * 5)}%</td>`).join("") + `</tr>`).join("") +
    `</tbody></table></div></div>
    <div class="cdx-sec"><h2>Eidon save DC</h2><div class="cdx-note"><p>When an Eidon makes a creature save: <strong>8 + your highest physical modifier + Proficiency Bonus + Dream mod</strong>. The save it asks for is the primary Cognition's (Dexterity for a Mobility path).</p></div></div>` },
  { key: "convert", label: "Becoming an Ignition", grp: "The roll", body: () => `
    <div class="cdx-note"><p>In the forge of repetition, inspiration becomes technique. Manifest the <strong>same Eidon successfully 3 times</strong> and meet the Ignition requirements (Dream Score, a Burning Cognition, and a narrative trigger), and you may learn it as a permanent Ignition at your next long rest.</p>
      <p>It costs 1 Ignition slot. The DM may ask for a related dream epiphany, a bond with (or the defeat of) a Cognition-linked creature, or a climactic event to finish the change. Once converted it needs no Eidon Check — it becomes a standard ability with its own activation.</p></div>` },
  { key: "forging", label: "Forging (downtime)", grp: "The roll", title: "Forging an Ignition", body: () => `
    <p class="cdx-desc">Drill a single Eidon week after week until it stops being imagination and becomes reflex — a permanent Ignition, no Eidon Check needed.</p>
    <div class="cdx-sec"><h2>Requirements</h2><div class="cdx-defs">
      <div class="cdx-def"><b>Who</b><span>Anyone who can manifest Eidons — Dream Score 13+, not knowing Arcanum Veritas — and knows every Cognition it calls on.</span></div>
      <div class="cdx-def"><b>Slot</b><span>A free Ignition slot (Dream mod, minimum 1).</span></div>
      <div class="cdx-def"><b>Catalyst</b><span>A Dream Catalyst tied to the primary Cognition — a Sun Stone, Moon Silver, a trophy from a Cognition-linked creature — of the Rank's value. Consumed on completion.</span></div>
      <div class="cdx-def"><b>Recipe</b><span>The Eidon written down: Cognitions, Template, activation and the dice spent. Fixed forever — but it always uses your current power dice and tier features, so it grows with you.</span></div>
    </div></div>
    <div class="cdx-sec"><h2>Rank</h2><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Rank</th><th>Level</th><th>Workweeks</th><th>Forge DC</th><th>Dream Catalyst</th><th>Imprint item</th></tr></thead><tbody>` +
      FORGE_RANK.map((r, i) => `<tr><td>${r.rank}</td><td>${TIERS[i].label.replace("Lv ", "")}</td><td>${r.weeks}</td><td>${r.dc}</td><td>${r.catalyst}</td><td>${r.item}</td></tr>`).join("") +
    `</tbody></table></div><p class="cdx-rings">The second and third Cognitions: +1 workweek and +2 DC each. Every 2 power dice spent in the recipe: +1 DC.</p></div>
    <div class="cdx-sec"><h2>Beyond three Cognitions</h2><div class="cdx-note"><p>An improvised Eidon holds three Cognitions at most. A <strong>forged</strong> Ignition can hold more — up to <strong>3 + your Dream mod</strong> — because the drilling does what imagination can't in the heat of a fight. Each Cognition beyond the third costs <strong>+2 workweeks, +2 to the Forge DC, and a Dream Catalyst of its own</strong>. Such a recipe can't be manifested as an improvised Eidon, so field practice doesn't count toward it. In the forge, turn on <strong>Forged recipe</strong> to plan one.</p></div></div>
    <div class="cdx-sec"><h2>Each workweek</h2><div class="cdx-defs">
      <div class="cdx-def"><b>Forge roll</b><span>d20 + Dream mod + Proficiency Bonus against the Forge DC.</span></div>
      <div class="cdx-def"><b>Success</b><span>A week of progress; when progress equals the workweeks, the Ignition is yours.</span></div>
      <div class="cdx-def"><b>Fail by 1–4</b><span>The week is lost.</span></div>
      <div class="cdx-def"><b>Fail by 5+ or a 1</b><span><strong>Backlash</strong> (d4): 1 — gain 1 Dream Exhaustion · 2 — the Catalyst cracks, losing a quarter of its value · 3 — Scorched, you can't Burn the primary Cognition for a week · 4 — lose a week of progress.</span></div>
      <div class="cdx-def"><b>Help</b><span>A mentor who knows it: advantage. Landing the recipe as an Eidon in a real fight: a week of progress each, up to half the total. A Node of the primary Cognition's nature: −2 DC.</span></div>
    </div></div>
    <div class="cdx-sec"><h2>The finished Ignition</h2><div class="cdx-note"><p>No Eidon Check: with its Cognitions Burning, use it for its activation and 1 Blaze Point. It counts as your Eidon for the round, keeps everything the Eidon had — borrowed Verum, Sigils, conditions, the primary Cognition's costs — and fills an Ignition slot (unlearn one on a long rest to free it).</p></div></div>
    <div class="cdx-sec"><h2>Imprinting a Dream Item</h2><div class="cdx-note"><p>Set an Ignition you know into a weapon, armour or relic of the Rank's rarity so someone else can inherit it: twice the workweeks, a Forge roll each week, and a second Catalyst. The imprint holds one Ignition.</p></div></div>
    <div class="cdx-sec"><h2>In the forge</h2><div class="cdx-note"><p>Build the Eidon you want to keep — the <strong>Forge it in downtime</strong> block under the Eidon Check shows its Rank, workweeks, Forge DC, Catalyst and your odds per week.</p></div></div>` },
  { key: "examples", label: "Examples", grp: "The roll", body: () => `
    <div class="cdx-sec"><div class="cdx-defs">
      <div class="cdx-def"><b>Flame Spiral Kick</b><span><em>Fire · Strike.</em> A spinning, flaming kick: on a hit, +8d6 fire, and the target makes a Dexterity save or takes 4d6 more fire at the start of its next turn.</span></div>
      <div class="cdx-def"><b>Heartstopper Jab</b><span><em>Emotion · Status.</em> Rejection channelled into a strike: Charisma save or Frightened until the end of its next turn.</span></div>
      <div class="cdx-def"><b>Echo Step</b><span><em>Sound · Mobility.</em> Teleport 30 feet in a shimmer of sound; the first attack against you before your next turn has disadvantage.</span></div>
      <div class="cdx-def"><b>Rest</b><span><em>Life · Zone.</em> Lay to rest undead of CR up to your character level in an area of Proficiency × 5.</span></div>
    </div></div>` },
];

function renderIgnRefList() {
  const box = document.getElementById("ringList"); if (!box) return;
  const on = state.ignRef || "overview";
  let grp = "", h = "";
  IGN_REF.forEach(s => {
    if (s.grp !== grp) { grp = s.grp; h += `<div class="rail-grp">${grp}</div>`; }
    h += `<button class="cog${s.key === on ? " core" : ""}" onclick="openIgnRef('${s.key}')"><span class="nm">${s.label}</span></button>`;
  });
  box.innerHTML = h;
}
function renderIgnRef() {
  const host = document.getElementById("ringBody"); if (!host) return;
  const s = IGN_REF.find(x => x.key === (state.ignRef || "overview")) || IGN_REF[0];
  host.innerHTML = `<div class="cdx"><div class="cdx-hd"><div><h1>${s.title || s.label}</h1></div></div>${s.body()}</div>`;
}
function openIgnRef(k) { state.ignRef = k; renderIgnRefList(); renderIgnRef(); document.getElementById("ringBody").scrollTop = 0; }
