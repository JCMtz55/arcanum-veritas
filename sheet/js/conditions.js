// THE CONDITION CATALOGUE — every state a creature in Ephemer can be in, and what each one does.
//
// This is campaign canon as DATA, in the same way `rules.js` is the engine as data: no DOM, no
// fetch, importable by the server. It was the top and bottom of the Builder's Conditions tab
// (`js/conditions.js`) until the initiative board needed the same list — the board applies these to
// a monster, the Builder explains them, and the server seeds the DM's condition library from them.
// THREE COPIES OF A LIST THIS LONG IS THREE LISTS, so there is one, here, and `/api/conditions`
// serves it to the pages that cannot import.
//
// `js/conditions.js` is now only the Builder's RENDERING of this; the prose below is the prose it
// used to hold, moved verbatim.
//
// ── Three layers, because they answer different questions ───────────────
//   STANDARD  5e's fourteen, with this table's two house rewrites, and the arguments each one
//             starts answered once. What the Builder's pages are built from.
//   NAMED     the states the Cognitions invent, defined rather than merely listed, with the
//             duration the effects agree on where they agree on one.
//   BOARD     what a condition DOES, typed — so the initiative board can put a number on it.
//             Keyed by name, and deliberately incomplete: see the note above it.

import * as rules from "./rules.js";

// ═══════════════════════════════════════════════════════════
//  THE STANDARD CONDITIONS
// ═══════════════════════════════════════════════════════════
// `status`: same (5e as written) · changed (house rule on top) · fresh (new to this campaign)
// · retired (no longer a standard condition). `note` is the design voice, shown under the rules.
export const STANDARD = [
  { name: "Blinded", status: "same", bullets: [
    "A blinded creature can't see and automatically fails any ability check that requires sight.",
    "Attack rolls against the creature have advantage.",
    "The creature's attack rolls have disadvantage.",
  ], qa: [
    ["Can a blinded creature still attack?", "Yes, at disadvantage — but it has to pick a space. Blindness doesn't tell you where anyone is: the attacker guesses, and if nothing is there the attack simply misses."],
    ["Blind creature attacking an unseen target — advantage and disadvantage both?", "They <strong>cancel</strong>, and you roll one die. Advantage and disadvantage never stack: any number of each cancels down to a straight roll. This is the most-missed interaction at any table."],
    ["Does Blinded affect saving throws?", "No. It touches <em>ability checks that require sight</em> and attack rolls, nothing else. A blinded creature saves against a Fireball exactly as well as a sighted one."],
    ["Can a blinded caster still cast?", "Yes — but not a spell that requires seeing its target (\"a creature you can see\"). Spells aimed at a point in space, or delivered by touch, still work."],
    ["Does blindsight or tremorsense cancel it?", "It solves the <em>targeting</em> problem — you perceive without sight — but the advantage and disadvantage still apply unless the feature says otherwise."],
  ] },
  { name: "Charmed", status: "same", bullets: [
    "A charmed creature can't attack the charmer or target the charmer with harmful abilities or magical effects.",
    "The charmer has advantage on ability checks made to interact socially with the creature.",
  ], qa: [
    ["Does Charmed mean the charmer controls them?", "<strong>No</strong> — and this is the most common misreading of any condition. Charmed is a <em>restriction</em>, not mind control: the creature can't attack you and finds you agreeable. It takes no orders. Only an effect that says it grants control (<em>Dominate Person</em>) does that."],
    ["Can a charmed creature attack the charmer's allies?", "Freely. The protection covers the charmer alone."],
    ["Can they catch the charmer in an area effect?", "Yes. They can't <em>target</em> you, but an area spell targets a point in space rather than a creature — so a Fireball centred where you happen to stand is legal. Expect a DM to push back if the placement is obviously a dodge of the rule."],
    ["Can they work against the charmer indirectly?", "Yes — warning allies, shutting a door, refusing to help. It restricts attacks and harmful targeting; it does not buy loyalty."],
  ] },
  { name: "Deafened", status: "same", bullets: [
    "A deafened creature can't hear and automatically fails any ability check that requires hearing.",
  ], qa: [
    ["Can a deafened caster use verbal components?", "Yes. Deafened stops you <em>hearing</em>, not speaking — verbal components work normally. It's <em>Silenced</em> and its kin that stop those."],
    ["Does it impose disadvantage on anything?", "Only by auto-failing hearing-based checks. There's no blanket penalty: attacks and saves are untouched."],
    ["Does it protect against thunder damage or sonic effects?", "No. It defeats effects that specifically require <em>hearing</em> — a spoken command, a song, a scream that must be heard. Damage lands regardless."],
  ] },
  { name: "Frightened", status: "same", bullets: [
    "A frightened creature has disadvantage on ability checks and attack rolls while the source of its fear is within line of sight.",
    "The creature can't willingly move closer to the source of its fear.",
  ], qa: [
    ["If I break line of sight, does Frightened end?", "No — but the <strong>disadvantage stops</strong> while the source is out of sight. The movement restriction has no line-of-sight clause and applies throughout. Ducking behind a wall is a real tactic, not a loophole."],
    ["Does Frightened make a creature run away?", "No. It can hold its ground, attack at range and act normally — it just can't close the distance. Fleeing comes from effects that say so."],
    ["Can a frightened creature be pushed or teleported closer?", "Yes. The rule bars <em>willing</em> movement only; anything that moves it against its will works."],
    ["Does it affect saving throws?", "No — ability checks and attack rolls only."],
  ] },
  { name: "Grappled", status: "same", bullets: [
    "A grappled creature's Speed becomes 0, and it can't benefit from bonuses to its Speed.",
    "The condition ends if the grappler is Incapacitated.",
    "The condition also ends if an effect removes the grappled creature from the reach of the grappler or grappling effect.",
  ], qa: [
    ["Is a grappled creature at any attack penalty?", "<strong>None.</strong> Grappled is <em>not</em> Restrained — no disadvantage on its attacks, no advantage for its attackers, no penalty to Dexterity saves. It loses its movement and nothing else. Tables play it as Restrained constantly; it isn't."],
    ["Can it still cast, attack and use its hands?", "All of it, normally."],
    ["Does teleporting escape a grapple?", "Yes — teleportation takes you out of the grappler's reach, so the condition ends on its own. No contest, no action spent."],
    ["Can two creatures grapple the same target?", "Yes, and each grapple is tracked separately — escaping one doesn't end the other."],
    ["Does the grappler's own speed suffer?", "Only if it drags the target along: moving a grappled creature halves your speed, unless the target is two or more sizes smaller than you."],
  ] },
  { name: "Incapacitated", status: "same", bullets: [
    "An incapacitated creature can't take Actions or Reactions.",
  ], qa: [
    ["Can an incapacitated creature still move?", "By the letter, <strong>yes</strong> — the condition names actions and reactions, not movement. It rarely comes up because the conditions that grant it (Paralyzed, Unconscious) separately say you can't move."],
    ["What about bonus actions?", "The famous gap. The wording lists only actions and reactions, so a bonus action slips through by the letter — and the 2024 rules closed it by naming bonus actions too. <strong>Rule it closed here:</strong> no action means no bonus action."],
    ["Does it break concentration?", "<strong>Yes</strong>, immediately. Making an enemy caster incapacitated for even an instant is the fastest way to drop their spell."],
    ["Does it end a grapple?", "Yes — a grapple ends the moment the grappler is incapacitated, along with anything else they were actively maintaining."],
    ["Do attackers get advantage?", "No. Incapacitated on its own gives attackers nothing. The advantage people expect comes from Paralyzed, Unconscious or Restrained."],
  ], note: "Vanilla, and deliberately so. <strong>Turn-Denial does not reach it</strong> — there is no Resist, no Force Through, and no start-of-turn choice. Only <em>Paralyzed</em> can be bought back." },
  { name: "Invisible", status: "same", bullets: [
    "An invisible creature is impossible to see without the aid of magic or a special sense.",
    "For the purpose of hiding, the creature is heavily obscured.",
    "The creature's location can still be detected by noise it makes or tracks it leaves.",
    "Attack rolls against the creature have disadvantage.",
    "The creature's attack rolls have advantage.",
  ], qa: [
    ["Is invisible the same as hidden?", "<strong>No</strong>, and the difference matters. Invisible means unseen; <em>hidden</em> means unlocated. A creature that knows roughly where you are can still attack you — at disadvantage — and you can still be heard, tracked and bumped into."],
    ["Do I have to find them to attack an invisible creature?", "No. You pick a space and attack at disadvantage; if they aren't there, you miss. You don't learn where they are by missing."],
    ["Invisible creature attacking a blinded one?", "Advantage and disadvantage <strong>cancel</strong> — a straight roll. The same cancellation as the Blinded case, from the other side."],
    ["Does attacking end invisibility?", "Not the <em>condition</em>. The <em>Invisibility spell</em> ends when you attack or cast, because the spell says so — the condition itself has no such clause. Conflating the two is a common error."],
    ["Does invisibility let you hide whenever you like?", "It lets you <em>attempt</em> to hide even while observed, which you normally can't. It isn't automatic: you still roll, and noise still gives you away."],
  ] },
  { name: "Paralyzed", status: "changed", bullets: [
    "A paralyzed creature is Incapacitated and can't move or speak.",
    "The creature automatically fails Strength and Dexterity saving throws.",
    "Attack rolls against the creature have advantage.",
    "Any attack that hits the creature is a critical hit if the attacker is within 5 feet.",
  ], extra: {
    lead: "At the start of your turn, choose one:",
    defs: [
      ["Resist", "Repeat the saving throw against the effect causing the paralysis. On a success, Paralyzed ends immediately and you take your turn normally. On a failure, you remain Paralyzed."],
      ["Force Through", "You gain 1 level of Exhaustion and suppress Paralyzed until the end of your turn. You take your turn normally, but don't make a saving throw against the paralysis that turn."],
    ],
    tail: "At the end of your turn, the paralysis returns if its underlying effect is still active.",
  }, qa: [
    ["Does every hit on a paralyzed creature crit?", "Only from <strong>within 5 feet</strong>. An archer across the room hits with advantage, but not automatically critically. The melee rule is what makes paralysis lethal."],
    ["What does auto-failing Dexterity saves mean in practice?", "A Fireball on a paralyzed creature deals <strong>full</strong> damage, always. Combined with the melee auto-crit, a paralyzed PC can die in one round — which is the whole reason this table gave it Resist and Force Through."],
    ["Is a paralyzed creature prone?", "No. It stays upright unless something else knocks it down."],
    ["Does it break concentration?", "Yes — Paralyzed includes Incapacitated, so concentration drops the instant it lands."],
    ["Can it speak, or cast with verbal components?", "No to both; it can't speak at all. It couldn't take the action to cast anyway."],
    ["Force Through says it <em>suppresses</em> Paralyzed — how much does that turn off?", "Unsettled, and worth deciding before it comes up. Read strictly, <em>suppress</em> lifts the whole condition until the end of your turn: no advantage for attackers, no auto-failed Dexterity saves. Read narrowly, it buys you only the ability to act and you stay just as easy to hit. The strict reading matters less than it sounds — it is <em>your</em> turn, so the only attacks it covers are reactions. <span style=\"color:#E0B050\">DM's call, not written.</span>"],
  ], reach: [
    ["Paralyzed only", "No other condition works this way. <strong>Unconscious</strong> and <strong>Petrified</strong> cannot be Resisted or Forced Through, and <strong>Incapacitated</strong> is vanilla — no start-of-turn choice at all."],
    ["No limit", "You may Force Through <strong>as often as you like</strong> — every fight, every turn of one. <strong>Exhaustion is the limiter</strong>, and a hard one: the levels stack, they don't come off before a long rest, and the fifth and sixth end you. Buying three turns back in one fight is a decision about the rest of the day."],
  ], note: "This makes paralysis terrifying without automatically turning it into “skip your turn.” The line is between <em>held</em> and <em>gone</em>: paralysis holds a body that is still in there, and that one you may tear yourself out of, at a price. Unconsciousness and petrification are not holds — there is nobody left at the controls to pay." },
  { name: "Petrified", status: "same", bullets: [
    "The creature and its nonmagical worn/carried objects transform into a solid inanimate substance.",
    "Its weight increases tenfold and it ceases aging.",
    "The creature is Incapacitated, can't move or speak, and is unaware of its surroundings.",
    "Attacks against it have advantage.",
    "It automatically fails Strength and Dexterity saves.",
    "It has resistance to all damage.",
    "It is immune to poison and disease, though existing poison/disease is suspended rather than removed.",
  ], qa: [
    ["Resistance to all damage — even from the thing that petrified it?", "Yes, all of it, with no exception for the source. A statue is a remarkably durable way to survive a fight you were losing."],
    ["Does a petrified creature fall prone?", "No — it becomes a statue, standing as it stood. Nothing says it topples."],
    ["If the statue is shattered, does the creature die?", "The rules <strong>don't say</strong>, which is a famous gap. Most tables rule that breaking the statue kills or maims; <em>Greater Restoration</em> ends petrification but says nothing about reassembling a creature from gravel. Decide before a player swings at one."],
    ["Does the suspended poison come back?", "Yes. Poison and disease are paused, not cured — they resume where they left off when the petrification ends."],
    ["Can it hear or see what happens while petrified?", "No. It is unaware of its surroundings entirely, so it learns nothing and can't be targeted by anything requiring its perception."],
  ], note: "Petrification represents a genuine transformation rather than ordinary combat disablement, so it doesn't need the same treatment as Stunned." },
  { name: "Poisoned", status: "same", bullets: [
    "A poisoned creature has disadvantage on attack rolls and ability checks.",
  ], qa: [
    ["Does Poisoned give disadvantage on saving throws?", "<strong>No</strong> — attack rolls and ability checks only. This is the single most commonly misplayed condition in 5e: saving throws are <em>not</em> ability checks, and Poisoned never touches them."],
    ["Does being Poisoned deal damage?", "Not by itself. The condition is the penalty; any damage comes from the poison that applied it."],
    ["Does resistance to poison damage help against the condition?", "No. Resistance reduces poison <em>damage</em>; only <strong>immunity to the poisoned condition</strong> stops the condition. They're separate lines on a stat block for a reason."],
  ] },
  { name: "Prone", status: "same", bullets: [
    "A prone creature's only movement option is to crawl unless it stands up.",
    "Standing costs movement equal to half its Speed.",
    "The creature has disadvantage on attack rolls.",
    "Attacks against it have advantage if the attacker is within 5 feet.",
    "Otherwise, attacks against it have disadvantage.",
  ], qa: [
    ["Standing costs half my movement or half my speed?", "Half your <strong>Speed</strong>, which is a fixed number — 15 feet for most characters, whatever movement you have left. If you've already moved 25 of 30 feet, standing still costs 15 and you can't afford it."],
    ["Can a creature with Speed 0 stand up?", "No. Half of zero is zero, but the rule needs movement to spend and there is none — a Grappled or Restrained creature stays down."],
    ["Is dropping prone an action?", "No, it's free, any time on your turn. Standing is what costs. That asymmetry is the whole tactic behind dropping prone against archers."],
    ["Can a prone creature attack?", "Yes, at disadvantage. Prone restricts movement and skews attack rolls; it doesn't stop you acting."],
    ["What does crawling cost?", "Each foot of crawling costs an extra foot — so moving 10 feet prone eats 20 feet of movement, and doubles again in difficult terrain."],
    ["Does Prone affect saving throws?", "No."],
  ] },
  { name: "Restrained", status: "same", bullets: [
    "A restrained creature's Speed becomes 0, and it can't benefit from bonuses to Speed.",
    "Attack rolls against the creature have advantage.",
    "The creature's attack rolls have disadvantage.",
    "The creature has disadvantage on Dexterity saving throws.",
  ], qa: [
    ["Can a restrained creature still act?", "Completely normally — attack, cast, use items, take reactions. Restrained is <em>not</em> Incapacitated. It is a severe penalty, not a lost turn, which is exactly why this table left it alone."],
    ["Restrained vs Grappled — what's the difference?", "Grappled takes only your movement. Restrained takes your movement <em>and</em> hands attackers advantage, your attacks disadvantage, and your Dexterity saves disadvantage. Many effects say Grappled when the table plays Restrained."],
    ["Can a restrained creature teleport away?", "Yes, unless the effect says otherwise. Restrained sets Speed to 0; teleportation isn't movement at a speed."],
    ["Does it stop somatic components or using hands?", "No. Nothing about Restrained ties your hands unless the specific effect says it does."],
  ], note: "Restrained already does what we want: you're heavily disadvantaged, but you still have your entire turn to figure out what to do about it." },
  { name: "Stunned", status: "changed", sub: "Rewritten — it no longer takes the turn away.", bullets: [
    "The creature's Speed is halved.",
    "The creature can't take Reactions.",
    "On its turn, it can take an Action or Bonus Action, but not both.",
    "Regardless of its abilities or magic items, it can't make more than one attack during its turn.",
  ], qa: [
    ["How is this different from 5e's Stunned?", "Enormously, and anyone with outside 5e knowledge will expect the old one. <strong>Standard Stunned is Incapacitated</strong> — no actions, no reactions, can't speak, auto-fails Strength and Dexterity saves, attackers have advantage. <strong>None of that applies here.</strong> Ours halves your speed and narrows your turn; it doesn't take it, and it grants attackers nothing."],
    ["Does it stop Extra Attack?", "Yes — explicitly, and regardless of any ability or magic item. One attack is the hard cap, so a fighter with three loses two of them."],
    ["Can a stunned creature make opportunity attacks?", "No — no reactions at all. That also means no <em>Shield</em>, no Counterspell, no Absorb Elements."],
    ["Action <em>or</em> bonus action — which do I give up?", "Your choice, each turn. A rogue can Dash as a bonus action and nothing else, or attack and nothing else."],
    ["Does it auto-fail Strength and Dexterity saves?", "<strong>No.</strong> That's standard Stunned, not this one. It is the first thing to correct when a player quotes the rule from memory."],
    ["Does it break concentration?", "No — it isn't Incapacitated, so concentration survives."],
  ], note: "Stunned severely disrupts a turn without removing it. Nothing that inflicts Stunned needs rewriting — the condition itself changed, so every effect in the system already means this." },
  { name: "Unconscious", status: "same", bullets: [
    "An unconscious creature is Incapacitated, can't move or speak, and is unaware of its surroundings.",
    "It drops whatever it's holding and falls Prone.",
    "It automatically fails Strength and Dexterity saving throws.",
    "Attack rolls against it have advantage.",
    "Any attack that hits is a critical hit if the attacker is within 5 feet.",
  ], qa: [
    ["What happens when someone hits a PC who is down at 0 HP?", "The hit costs them a <strong>death saving throw failure</strong> — and because any melee hit from within 5 feet is automatically a critical, it costs <strong>two</strong>. Two melee hits on a downed character kill them outright. This is why downed allies get picked up immediately."],
    ["Does healing end it?", "A single hit point ends the unconscious-at-0 state and wipes your accumulated death save failures. <em>Spare the Dying</em> stabilises without waking them — a stable creature is still unconscious until it regains a hit point or someone spends ten minutes on it."],
    ["Does an unconscious creature know what happened around it?", "No — it is unaware of its surroundings. Players routinely act on things their character heard while down; they didn't hear them."],
    ["Is it prone as well?", "Yes, automatically, and it drops whatever it was holding. Standing back up after being healed costs the usual half your Speed."],
    ["Auto-fail Strength and Dexterity saves — so a Fireball?", "Full damage, every time. An area effect on a downed PC is two death save failures and full damage at once."],
  ], note: "Being genuinely unconscious is one of the situations where losing your ability to act makes sense." },
];

// ═══════════════════════════════════════════════════════════
//  NAMED STATES — defined, not just listed
// ═══════════════════════════════════════════════════════════
// Every state a Verum applies by name, written out as a real condition. Each definition is drawn
// from the effect text that applies it, so the rules here are the rules the Cognitions already
// carry — this states them once instead of making you hunt the tier that said it.
//   `dur` — how long it normally runs, where the effects agree on one
//   `see` — a state with a ruleset of its own; that ruleset governs, this is the summary
export const NAMED = {
  "Exhaustion":        { def: "The standard exhaustion track. Levels stack, don't come off before a long rest, and the fifth and sixth end you. It is also the price of <strong>Forcing Through</strong> a paralysis." },
  "Dream Exhaustion":  { def: "Exhaustion of the dreaming mind rather than the body — its own track, separate from the standard one, gained from Nightmare, Dream and Lunar effects and from overspending in Insomnia.", see: "the Dream Exhaustion rules" },
  "Cursed":            { def: "Carrying one or more active curses. A great many effects key off the state rather than the curse: Corruption's Curse Catalyst hits a cursed target harder, and can make every curse on it fire again. The curse that applied it says what it does." },
  "Injury":            { def: "Lasting structural harm — a broken limb, shattered ribs — taken when two or more Wounds land from one effect.", see: "the Wounds &amp; Injuries ruleset" },
  "Corruption Point":  { def: "A point of soul-rot on the Corruption track. It raises your susceptibility to Corruption effects and carries the threshold consequences of its score.", see: "the Corruption Ruleset" },
  "Silenced":          { def: "Cannot speak: no verbal components, no calls for help, no signals, no spoken command words.", dur: "1 minute" },
  "Banished":          { def: "Removed from the field entirely — into a Dream Pocket or a fold of space — repeating its save at the end of each turn to return where it left.", dur: "1 minute" },
  "Bound":             { def: "Held to something. <strong>Law</strong> and <strong>Games</strong> bind it to a <em>term declared over the area</em> — a prohibition, a house rule — and the moment it breaks the term, its turn ends. <strong>Promises</strong> binds it to <em>you</em>: it can't move farther from you or teleport, repeating the save each turn. <span style=\"color:#E0B050\">The same word for two different holds — flagged for the DM.</span>", dur: "until the end of its next turn, or 1 minute" },
  "Doomed":            { def: "A death-blow already thrown. At the end of its third turn the Doom arrives — the damage again, plus more, as Necrotic.", dur: "until its third turn ends" },
  "Shaken":            { def: "Disadvantage on its next attack roll." },
  "Swallowed":         { def: "Gone from the field inside the dark: Blinded and Restrained, taking damage each turn, and not spat out until it saves.", dur: "until the end of its next turn" },

  "Ablaze":            { def: "On fire. Takes damage at the start of each of its turns until it is put out — the amount set by the effect that lit it. <em>Fire</em> lights it by blow or by scorched ground; <em>Anger</em> lights it and it burns until the creature Dodges or Disengages.", dur: "1 minute, or until put out" },
  "Airborne":          { def: "Held up by the wind, falling no faster than a feather and unable to close the distance.", dur: "until the start of your next turn" },
  "Aloft":             { def: "Down is inverted. It falls upward and hangs there, unable to move but by climbing or flying, then drops.", dur: "until the end of its next turn" },
  "Blanked":           { def: "One ability, spell or feature forgotten. It knows something is missing.", dur: "1 minute" },
  "Bleeding":          { def: "Sanguine damage at the start of each of its turns until it or an ally spends an action to staunch it." },
  "Brittle":           { def: "The next attack to hit it deals extra piercing damage as the fracture spreads.", dur: "until the end of your next turn" },
  "Buried":            { def: "Restrained in the earth — to the waist, or whole and Blinded. Rising costs its movement and a Strength check." },
  "Caged":             { def: "Enclosed in a cell of conjured matter it has to break out of.", dur: "1 minute" },
  "Catalogued":        { def: "Its position, remaining strength and intentions are known to you and your allies.", dur: "1 minute" },
  "Compelled":         { def: "Obeys one simple command — drop that, stay there, stop talking — unless obeying would obviously harm it.", dur: "until the end of its next turn" },
  "Compelled to answer": { def: "Must answer one question truthfully when directly asked, once per round, though it chooses how much to say." },
  "Confused":          { def: "As the <em>Confusion</em> spell.", dur: "until the end of its next turn" },
  "Deceived":          { def: "Believes the dreamscape around it is real, and is bound by whatever it believes.", dur: "1 minute" },
  "Demi-Nightmare":    { def: "Transformed into a Demi-Nightmare — CR one higher than before, and hostile to every creature.", dur: "1 minute" },
  "Devoiced":          { def: "Cannot be heard at any volume, and cannot be remembered when it speaks: listeners keep the impression someone said something, but not what or who." },
  "Discordant":        { def: "Comes apart from itself — it may take an action, a bonus action <em>or</em> a reaction on its turn, one of the three.", dur: "1 minute" },
  "Dominated":         { def: "Spends its turn as you direct — move, act, speak. It will not harm itself, and may save again if told to harm someone it loves.", dur: "one turn" },
  "Drowning":          { def: "Water in the lungs: cold damage at the start of each turn and disadvantage on Charisma saves.", dur: "1 minute" },
  "Erasure Mark":      { def: "Marked for erasure. The first spell or Cognition effect it uses is sealed — the resource is spent and nothing happens.", dur: "1 minute" },
  "Fated":             { def: "One roll it is about to make may be declared a failure, before it is rolled. It happens as you said.", dur: "1 minute" },
  "Frenzied":          { def: "Cannot tell friend from foe: on each of its turns it attacks the nearest creature, whoever that is. The Cognitions reach it by different roads — <em>Anger</em> through rage, <em>Carnage</em> through bloodlust, <em>Hunger</em> through starvation, <em>Identity</em> by taking away who it is, <em>Nightmare</em> by turning a summoned thing feral — and all of them end here.", dur: "1 minute, or until the end of its next turn" },
  "Folded":            { def: "Lost in a fold of the world: each time it moves, you choose where along its path it actually ends up." },
  "Fooled":            { def: "Believes one simple false thing — a door is locked, its weapon is broken, you are behind it.", dur: "until the end of its next turn" },
  "Forlorn":           { def: "Disadvantage on attack rolls and saving throws.", dur: "1 minute" },
  "Forsaken":          { def: "Abandoned by its own side — and catching: the first ally to come within 10 feet must save or be caught by it too.", dur: "1 minute" },
  "Fractured":         { def: "A Cognition is unusable until mended.", dur: "until mended" },
  "Geas":              { def: "Bound to a command or prohibition, and it knows exactly what the Law will do if it breaks it.", dur: "1 hour" },
  "Glyph":             { def: "A dormant, invisible stored sigil that fires a chosen condition — Slowed, Frightened, Silenced or Blinded — when triggered." },
  "Haunted":           { def: "A psychic echo in the mind: disadvantage on Dream saving throws, and it cannot willingly move closer to you.", dur: "1 minute" },
  "Held to Word":      { def: "Any bargain it offers or accepts while held is binding as a geas.", dur: "1 minute" },
  "Hesitant":          { def: "Must spend its bonus action each turn doing nothing but reconsidering.", dur: "1 minute" },
  "Hexed":             { def: "Once per turn, when it takes damage from you or an ally, it takes extra sanguine damage.", dur: "1 minute" },
  "Hollowed":          { def: "Colorless. No reactions or bonus actions, and on its turn it may only take an action it has already taken this fight.", dur: "1 minute" },
  "Hollowing Insomnia": { def: "Its Greatest Wish is sealed, and the sealing advances at each dawn it fails to throw off.", dur: "1 week" },
  "Hopeless":          { def: "Rolls a d6 at the start of each turn; on a 1–3 it spends the turn doing nothing.", dur: "1 minute" },
  "Lost":              { def: "Cannot find you, its allies, or any exit, and moves each turn in a direction you choose.", dur: "1 minute" },
  "Luckless":          { def: "A small thing goes wrong every round — a strap, a footing, a catch. The DM names it.", dur: "1 minute" },
  "Lunacy":            { def: "It cannot choose what it does: roll a d8 each turn for the phase that holds it.", dur: "its next turn" },
  "Marked":            { def: "Marked for death. Dropped to 0 HP before the mark fades, it can't be stabilized nonmagically and makes death saves at disadvantage.", dur: "1 minute" },
  "Marked by Fear":    { def: "Your allies attack it with advantage, and each turn it saves or spends that turn Incapacitated by hallucinations." },
  "Misled":            { def: "Attacks a target of your choice within reach instead of the one it meant to, once — and isn't sure afterwards why." },
  "Muddled":           { def: "Rolls a d6 each turn; on a 1–2 its action is spent on something useless.", dur: "1 minute" },
  "Nightling":         { def: "Permanently a masterless Nightling — a summoned creature breaks free of whoever called it.", dur: "until purified" },
  "Pinned":            { def: "Knocked Prone and unable to stand while the weight holds — rising costs its action and a Strength check." },
  "Primal Nightmare":  { def: "Overwritten into a Primal Nightmare with corruption auras, tethered to your Node and summoned or banished at will.", dur: "permanent" },
  "Resonance":         { def: "Stacks of ringing force, up to your Verum Modifier, that fall off a minute after the last one landed.", dur: "1 minute from the last stack" },
  "Senseless":         { def: "Senses nothing at all — it cannot tell where anything is, and must name a space and guess to target anyone." },
  "Severed":           { def: "A psychic, telepathic or pact link permanently cut — a familiar bond, a warlock's pact, a hive-mind.", dur: "permanent" },
  "Shattered":         { def: "A Cognition broken past ordinary mending; nothing short of a divine miracle restores it quickly.", dur: "until restored" },
  "Slowed":            { def: "Speed halved, and it loses its reaction.", dur: "until the end of its next turn" },
  "Starved":           { def: "Void damage at the start of each of its turns, and it cannot take a short rest." },
  "Starving":          { def: "Cannot regain hit points, and has disadvantage on Constitution saves, Concentration included.", dur: "until the end of its next turn" },
  "Stasis":            { def: "Frozen out of time: Incapacitated and unmoving — and untouchable, since nothing can damage, move or target it either.", dur: "until the end of its next turn" },
  "Sundered":          { def: "Broken until repaired.", dur: "until repaired" },
  "Sunstruck":         { def: "Burning in Cognitive Sunlight — holy damage at the start of each of its turns." },
  "Truced":            { def: "Cannot attack while the truce holds. Taking damage from a creature ends it with respect to that creature only.", dur: "1 minute" },
  "Ungovernable":      { def: "Will not follow an order for the duration — not from a commander, not from a spell, not from a contract, and not from you.", dur: "1 minute" },
  "Unnamed":           { def: "Loses its name: no class features, Grimm abilities or Cognitions, no benefit from allies' spells or Help, and Incapacitated on any turn it starts without one.", dur: "1 minute" },
  "Unremembering":     { def: "Forgets who stands with it — it cannot aid allies and its first attack each turn goes to the nearest creature; deeper, it forgets everything it learned rather than was born with." },
  "Unstable Soul":     { def: "The soul comes loose — open to banishment, soul theft, or full dream severance." },
};

// ═══════════════════════════════════════════════════════════
//  WHAT A CONDITION DOES, TYPED
// ═══════════════════════════════════════════════════════════
// The prose above is for a person. This is for the board: an effect it can put a number on, in the
// SAME vocabulary the character sheet's own effects use (`rules.MOD_TARGET_IDS`), so a condition
// that lands on a player can become a real row on their sheet rather than a word.
//
// ── WHAT IS DELIBERATELY NOT HERE ──────────────────────────────────────
// The sheet's vocabulary is SELF-CENTRED: it names the rolls a creature makes. Half of what a
// condition does is to everybody ELSE — "attack rolls against the creature have advantage" — and
// there is no target for that, on a sheet or anywhere. The same goes for anything that HALVES
// rather than adds (Speed halved, Stunned's narrowed turn, Slowed) and for anything that takes an
// action away: a flat number cannot say any of it.
//
// None of that is typed, and none of it is restated here either — the RULES TEXT already says it,
// in full, and a second shorter copy beside it is a second copy to go stale. So this map is honest
// rather than complete: a typed effect is one the engine could put on a character sheet today, and
// everything else is in the prose above, which the chip's tooltip and the dialog both print.
//
//   effects  {kind:"modifier", target, amount} · {kind:"advantage"|"disadvantage", target}
//   tick     damage at the start or end of its turns. `dice:""` means the effect that applied it
//            says how much — which is most of them, so the board asks rather than inventing.
//   save     the throw to shake it off. `ability:""` / `dc:0` means "the effect's own", again
//            because the condition does not know which Cognition threw it.
//   rounds   the duration in ROUNDS where the prose gives one. null is "until somebody says so".
const CHECKS = rules.CHECK_ALL, SAVES = rules.SAVE_ALL;
const dis = target => ({ kind: "disadvantage", target });
const adv = target => ({ kind: "advantage", target });

export const BOARD = {
  // ── 5e's own. `rounds` is left out of every one of them on purpose: nothing in 5e's text says
  // how long Blinded lasts, because the effect that applied it does. ──
  Blinded:       { effects: [dis("attack")] },
  Frightened:    { effects: [dis("attack"), dis(CHECKS)] },
  Invisible:     { effects: [adv("attack")] },
  Paralyzed:     { effects: [dis("attack")] },
  Poisoned:      { effects: [dis("attack"), dis(CHECKS)] },
  Prone:         { effects: [dis("attack")] },
  Restrained:    { effects: [dis("attack"), dis("save:dex")] },
  Unconscious:   { effects: [dis("attack")] },

  // ── The Cognitions' own. `rounds` here comes from `dur` unless the prose means something a
  // reading of the words would get wrong. ──
  Ablaze:        { tick: { dice: "", dtype: "fire", when: "start" } },
  Bleeding:      { tick: { dice: "", dtype: "sanguine", when: "start" } },
  Starved:       { tick: { dice: "", dtype: "void", when: "start" } },
  Sunstruck:     { tick: { dice: "", dtype: "radiant", when: "start" } },
  Drowning:      { tick: { dice: "", dtype: "cold", when: "start" }, effects: [dis("save:cha")] },
  Forlorn:       { effects: [dis("attack"), dis(SAVES)] },
  // "its next attack roll" — one roll, so one round, which `dur` does not say at all.
  Shaken:        { effects: [dis("attack")], rounds: 1 },
  Starving:      { effects: [dis("save:con")] },
  Haunted:       { effects: [dis("save:dream")] },
  Buried:        { effects: [dis("attack"), dis("save:dex")] },
  // Blinded and Restrained at once, inside the dark, and taking damage the effect sets.
  Swallowed:     { effects: [dis("attack"), dis("save:dex")],
                   tick: { dice: "", dtype: "", when: "start" },
                   save: { ability: "", dc: 0, when: "endOfTurn" } },
  // The ones that are shaken off rather than waited out. Which throw and against what DC belongs
  // to the Cognition that threw it, so the board asks for both when it is applied.
  Banished:      { save: { ability: "", dc: 0, when: "endOfTurn" } },
  Dominated:     { save: { ability: "", dc: 0, when: "endOfTurn" } },
  Bound:         { save: { ability: "", dc: 0, when: "endOfTurn" } },
  "Marked by Fear": { save: { ability: "", dc: 0, when: "startOfTurn" } },
  // Three turns, which "until its third turn ends" means and no regex should be trusted to read.
  Doomed:        { rounds: 3 },
};

// ═══════════════════════════════════════════════════════════
//  THE BOARD'S OWN SHAPE
// ═══════════════════════════════════════════════════════════
// How long the prose means in ROUNDS, where it means anything countable. A round is six seconds, so
// a minute is ten; an hour, a week and "permanent" are not a countdown a fight needs, so they are
// null — "until somebody says otherwise", which is what the DM's nod already was.
const ROUNDS_FROM_DUR = [
  [/^1 minute/i, 10],
  [/end of (its|your) next turn/i, 1],
  [/start of (its|your) next turn/i, 1],
  [/^(one turn|its next turn)$/i, 1],
  [/third turn/i, 3],
];
export function roundsFromDur(dur) {
  const t = String(dur || "");
  if (!t) return null;
  for (const [rx, n] of ROUNDS_FROM_DUR) if (rx.test(t)) return n;
  return null;
}

// Strip the emphasis out of a definition. The prose carries <strong>, <em> and the odd span because
// the Builder renders it as HTML; the board prints it as text in a chip's tooltip and a dialog, and
// an escaped "<strong>" in a tooltip is worse than no emphasis at all.
export const plain = html => String(html || "")
  .replace(/<[^>]*>/g, "")
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/\s+/g, " ").trim();

// One condition in the shape the initiative board stores and the library seeds from.
//
// `kind` is where it came from and nothing more: "std" is 5e's, "named" is a Cognition's, "custom"
// is one the DM wrote. The board treats all three alike — which is the point of a library.
export function boardShape(name, { kind, text, dur }) {
  const b = BOARD[name] || {};
  return {
    name, kind,
    text: plain(text),
    dur: dur || "",
    rounds: b.rounds !== undefined ? b.rounds : roundsFromDur(dur),
    effects: (b.effects || []).map(e => ({ ...e })),
    tick: b.tick ? { ...b.tick } : null,
    save: b.save ? { ...b.save } : null,
  };
}

// The whole catalogue, in the board's shape, alphabetically — what the library is seeded with on
// first boot. A condition is a condition whether 5e wrote it or a Cognition did, so they are one
// list; `kind` is all that remembers the difference.
export function seedConditions() {
  const std = STANDARD.map(c => boardShape(c.name, {
    kind: "std",
    // The bullets ARE the rules, so they are the text — joined, because a chip's tooltip is one
    // string and the dialog wants the whole of it rather than the first line.
    text: c.bullets.join(" "),
    dur: "",
  }));
  const named = Object.entries(NAMED).map(([name, n]) =>
    boardShape(name, { kind: "named", text: n.def, dur: n.dur || "" }));
  return [...std, ...named].sort((a, b) => a.name.localeCompare(b.name));
}

// A typo in a target above would be a condition that silently grants nothing, found weeks later by
// a player whose disadvantage never arrived. Checked once, at import, against the engine's own list.
{
  const ok = new Set(rules.MOD_TARGET_IDS);
  for (const [name, b] of Object.entries(BOARD))
    for (const e of b.effects || [])
      if (!ok.has(e.target)) console.warn(`conditions.js: ${name} points at "${e.target}", which is not a modifier target.`);
  for (const [name, b] of Object.entries(BOARD))
    if (b.tick?.dtype && !rules.DAMAGE_BY_ID[b.tick.dtype])
      console.warn(`conditions.js: ${name} ticks "${b.tick.dtype}", which is not a damage type.`);
}
