// Arcanum Veritas Builder — The worked Paragon Ability sets from the rules

// ═══════════════════════════════════════════════════════════
//  WORKED EXAMPLES
// ═══════════════════════════════════════════════════════════
// The three sets the Paragon rules print, kept as reading and as somewhere for a DM to start.
// They are never a player's own resonances — those are written per character and live in the
// database. Both the builder and the Admin page load this file, so it depends on nothing.

// ── The authored ability sets ─────────────────────────────
// `ranks` is the Rank I–IV ladder, read the way a Ring's and an Eidon's are: every Rank is
// shown, the one you're at is lit. A rank line restates its ability rather than adding to it.
// A set the DM writes has exactly this shape, so the same renderers draw both.
const PARAGON_EXAMPLES = [
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

];
