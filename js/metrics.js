// Arcanum Veritas Builder — "Drew it": the one thing the composer writes down for the DM.
//
// Everything else in this app answers what a seal COULD do. After a session the question is the
// other one — what the party actually spent, and what it came to — and nothing could answer it.
// The saved builds can't: a save is a recipe that grows with the character, so the DC it shows
// today is not the DC that was rolled against in Session 77. Only a record taken at the moment of
// drawing can be evidence, and that is what this is.
//
// WHY A BUTTON AND NOT AUTOMATIC (Juan, 2026-11-19). The composer re-renders on every click: a
// passive log would fill the night with seals nobody cast — slots dialled up and down, Rings tried
// on, a Cognition read in the Codex. A press means "this one went off", which is the only thing the
// numbers are worth anything as. The cost is that an unpressed seal is invisible, and that is the
// right cost: a thin honest record beats a fat one that has to be argued with.
//
// CASTING ONE COUNTS AS DRAWING IT (Juan, 2026-11-19). A Supportive seal sent through *Cast To
// Ally* writes rows the server owns and the party's sheets read — it unambiguously went off — so it
// logs its own draw and nobody has to press anything afterwards. That is the one exception to the
// button, and it is not a second kind of trigger: the record cannot tell a cast seal from a pressed
// one apart from `detail.via`, which is there so the DM can see how much of a night logged itself.
//
// It is write-only from here. Nothing is read back into the builder and nothing in the composer
// changes because a row exists — the moment a log gates something, people stop pressing it
// honestly. The DM reads it in Admin → Metrics.
//
// Seals only. Ignition and the Paragon path have their own economies (Burn rounds, Blaze Points,
// one Devotion all the way down) and averaging them beside a slot would say nothing about either.

// A draw is remembered for a minute so a double tap — or a phone that fires twice — doesn't land
// as two draws. The signature is the seal itself, so genuinely drawing the same seal twice in a
// round is still one row; that is the trade a dedupe makes, and under-counting a repeat is safer
// than inventing one. ⭐ It is what keeps the two ways in from doubling each other: press Drew it
// and then cast the same seal, or cast it and then press, and the second one is the same seal in
// the same minute either way.
const DREW_DEDUPE_MS = 60000;
let DREW = { busy: false, tonight: 0, last: null, lastAt: 0 };

function drewVisible() {
  return !!API && !!ME && ME.role !== "dm" && state.mode === "av";
}
// Called when the account arrives and whenever the Art changes — those are the only two things
// that decide whether there is anything to log.
function syncDrewBtn() {
  const b = document.getElementById("drewBtn");
  if (!b) return;
  b.hidden = !drewVisible();
  b.disabled = DREW.busy;
  b.textContent = DREW.tonight ? `Drew it · ${DREW.tonight}` : "Drew it";
  b.title = DREW.tonight
    ? `Log this seal as drawn — ${DREW.tonight} logged tonight`
    : "Log this seal as drawn at the table — it goes into the DM's after-session metrics";
}

// The seal as it stands, frozen: the recipe, and every number the card is showing.
//
// The Ring's scaling row is read here the way the card reads it. That cell lookup exists in
// buildPlayCard and buildPlayCardHTML as well, and this is deliberately a third copy rather than a
// shared helper: those two are mid-render closures over their own `sub`, and threading a fourth
// caller through them to save six lines would put a render path at risk for nothing.
function drawRecord() {
  const coreCog = LOADED[state.core], sub = currentSub();
  if (!coreCog || !sub || !state.compType || !state.compSub) return null;
  const tier = getTier(state.charLevel);
  const row  = sub.rows.find(r => r[0] === ORDINALS[state.slotLevel]);
  const cell = col => {
    const i = sub.columns.indexOf(col);
    const v = i >= 0 && row ? resolve(row[i]) : null;
    return col === "Targets" ? withSigilTargets(v, tier) : v;
  };

  const heal    = cell("Healing") || cell("Healing / Target");
  const dmgCell = cell("Damage") || cell("Damage / turn") || heal || cell("Absorb");
  const kind    = heal ? "healing" : cell("Absorb") ? "absorbed"
                : liveType(coreCog.damageType || "damage", coreCog, tier);
  const led     = dmgCell ? damageLedger(dmgCell, coreCog, tier, kind) : null;
  const roll    = sealRoll();
  const tags    = collectTags(coreCog, tier);
  const doom    = doomOf(coreCog, tier);
  const trk     = trackerOf(coreCog);

  return {
    name: (state.sealName || "").trim(),
    core: state.core,
    verum: state.coreVerum || coreVerumOf(coreCog)?.name || "",
    ring: state.compType, subtype: state.compSub,
    shape: sub.shape ? state.shape : "", manner: state.manner,
    slot: state.slotLevel, charLevel: state.charLevel, tier,
    verumMod: state.verumMod, dreamMod: state.dreamMod,
    // The DC is the caster's own number and worth recording whether or not this Ring asks for a
    // save; `save` says whether anybody actually rolled against it, and which ability.
    dc: verumDC(),
    attack: roll === "attack" ? sealAttack() : null,
    damage: led ? String(led.head) : "", damageKind: dmgCell ? kind : "",
    absolute: !!(dmgCell && kind !== "healing" && kind !== "absorbed" && isAbsolute(coreCog, tier)),
    save: roll === "save" ? (coreCog.savingThrow || "") : "",
    sigils: state.complements.length, sigilCap: maxComps(),
    benefits: (state.benefits || []).length,
    // Read whole afterwards rather than averaged: the Sigils by name, the Ring's own cells, and the
    // tags the mech layer put on the card. The notes a player writes on a benefit are left out —
    // they are their words to their table, not a number anybody balances against.
    detail: {
      roll: roll || "none",
      targets: cell("Targets") || null, range: cell("Range") || null, radius: cell("Radius") || null,
      duration: cell("Duration") || cell("Buff Duration") || null,
      zone: cell("Zone Duration") || null, weaponDie: cell("Weapon Die") || null,
      sigils: state.complements.map(c => ({ id: c.id, effect: c.compEffect || null })),
      sigilDice: sigilDamage(tier).map(s => ({ source: s.source, dice: `${s.count}${s.die}`, type: s.type || null })),
      doom: doom ? doomRoll(led?.head, doom) : null,
      conditions: tags.conds, denies: tags.denies, resource: tags.resource || null,
      concentration: !!sub.concentration, reaction: !!sub.reaction,
      phase: phaseOf(coreCog)?.now?.name || null,
      tracker: trk ? { n: trk.n, window: trk.win, now: trk.now, reckoning: trk.last } : null,
      grants: (state.benefits || []).map(b => ({
        kind: b.kind || "modifier", target: b.target || null, standing: b.standing || null,
        dtype: b.dtype || null, turnKind: b.turnKind || null,
        amount: b.amount ?? null, from: b.from || null, times: b.times ?? null,
        dice: b.dice || null, n: b.n ?? null, rounds: b.rounds ?? null,
      })),
      // The card's own first lines — the title, the chips and the one line of math. What the table
      // was looking at, in the app's own words, so a row can be read a month later without
      // reconstructing it from columns.
      card: buildPlayCard(coreCog, tier).slice(0, 3),
    },
  };
}

// The signature of a draw, for the dedupe: the seal, not the moment.
function drewKey(r) {
  return [r.core, r.verum, r.ring, r.subtype, r.shape, r.manner, r.slot, r.charLevel,
          r.sigils, r.damage, r.dc].join("|");
}

// `via` is how this one came in — "drew" is the button, "cast" is a Supportive seal that was just
// sent to the party. The cast path is `quiet`: doCast() has already said what landed on whom, and a
// second toast over the top of it would replace the one sentence the player actually needed.
async function logDraw({ via = "drew", quiet = false } = {}) {
  if (!drewVisible() || DREW.busy) return;
  const rec = drawRecord();
  if (!rec) return quiet || toast(mode().needCard);
  rec.detail.via = via;
  const key = drewKey(rec);
  if (DREW.last === key && Date.now() - DREW.lastAt < DREW_DEDUPE_MS)
    return quiet || toast("Already logged a moment ago");
  DREW.busy = true; syncDrewBtn();
  try {
    const out = await api("POST", "api/seal-draws", rec);
    DREW.tonight = out.n || DREW.tonight + 1;
    DREW.last = key; DREW.lastAt = Date.now();
    const what = rec.name || INDEX.find(c => c.id === rec.core)?.name || "the seal";
    if (!quiet) toast(`${what} — logged, ${DREW.tonight} tonight`);
  } catch (err) {
    // A draw that cannot be sent is a draw that didn't happen as far as the record goes. Say so
    // plainly: nothing is queued, because a seal logged at the wrong hour is worse than a gap.
    // ⚠️ Not on the cast path, though — the cast itself succeeded, and telling somebody their seal
    // failed to be written down, over the toast that says who it landed on, would read as the cast
    // having failed. The console keeps it; the record simply misses one.
    if (quiet) console.warn("seal draw not logged:", err.message);
    else toast(`Couldn't log it — ${err.message}`);
  }
  DREW.busy = false; syncDrewBtn();
}
