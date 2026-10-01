// Arcanum Veritas Builder — The Conditions tab
//
// Two kinds of condition meet here, and the tab exists because nothing else in the vault holds
// both at once:
//   · the STANDARD conditions, 5e's with this campaign's two house changes — Stunned no longer
//     takes the turn away, and Paralyzed can be resisted or forced through
//   · the conditions the Cognitions themselves make: every Cognition's own minor / major / severe
//     Eidon ladder, and the named states its Verum text applies, each written out as a real rule
//
// Like the Damage tab, the cross-references are READ FROM THE COGNITION FILES rather than typed
// here, so "who inflicts Frightened" can never drift out of date.

// ═══════════════════════════════════════════════════════════
//  THE STANDARD CONDITIONS
// ═══════════════════════════════════════════════════════════
// `status`: same (5e as written) · changed (house rule on top) · fresh (new to this campaign)
// · retired (no longer a standard condition). `note` is the design voice, shown under the rules.
const COND_STATUS = {
  same:    { label: "Unchanged from 5e", cls: "cs-same" },
  changed: { label: "Changed",           cls: "cs-changed" },
  fresh:   { label: "New",               cls: "cs-fresh" },
  retired: { label: "Retired",           cls: "cs-retired" },
};

const CONDITIONS = [
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
const COND_BY_NAME = new Map(CONDITIONS.map(c => [c.name.toLowerCase(), c]));

// ═══════════════════════════════════════════════════════════
//  WHAT THE COGNITIONS DO WITH THEM — read from the files
// ═══════════════════════════════════════════════════════════
// Three harvests from one pass:
//   `inflict` — which Cognitions can apply each standard condition, from a Verum's declared
//               mech.conditions and from an Eidon condition whose card names it
//   `eidon`   — every Cognition's minor / major / severe ladder, in full
//   `named`   — the states the Verum text invents, and who uses each
//
// Some mech.conditions entries are prose standing in for a condition the effect chooses at the
// table ("the named Core Emotion"). They are not conditions, and they are dropped.
const COND_NOT_A_NAME = /^(a |the )/i;
// The harvest is cached, but keyed on the Cognitions it was built from: signing out and back in as
// someone else replaces INDEX without reloading the page, and a cache that ignored that would serve
// one account's counts to the next.
let COND_USE = null, COND_USE_KEY = null;

async function conditionUse() {
  const ready = INDEX.filter(c => c.ready);
  const key = ready.map(c => c.id).join(",");
  if (COND_USE && COND_USE_KEY === key) return COND_USE;
  COND_USE_KEY = key;
  await Promise.all(ready.map(c => loadCognition(c.id)));
  const inflict = {}, named = new Map(), eidon = [];
  const add = (map, key, c) => ((map[key] ||= []).some(x => x.id === c.id) || map[key].push(c));

  ready.forEach(c => {
    const cog = LOADED[c.id]; if (!cog) return;
    const ladder = cog.eidon?.conditions || {};
    const rung = k => ladder[k] ? { name: ladder[k].name, card: ladder[k].card || "" } : null;
    if (ladder.minor || ladder.major || ladder.severe)
      eidon.push({ c, minor: rung("minor"), major: rung("major"), severe: rung("severe") });

    // An Eidon condition's card is where it says which standard condition it really is
    ["minor", "major", "severe"].forEach(k => {
      const card = (ladder[k]?.card || "").toLowerCase();
      CONDITIONS.forEach(s => { if (card.includes(s.name.toLowerCase())) add(inflict, s.name.toLowerCase(), c); });
    });

    const walk = o => {
      if (!o || typeof o !== "object") return;
      if (Array.isArray(o)) return o.forEach(walk);
      if (Array.isArray(o.conditions)) for (const x of o.conditions) {
        const n = String(x?.name || "").trim();
        if (!n || COND_NOT_A_NAME.test(n)) continue;
        if (COND_BY_NAME.has(n.toLowerCase())) add(inflict, n.toLowerCase(), c);
        else {
          if (!named.has(n)) named.set(n, []);
          if (!named.get(n).some(x => x.id === c.id)) named.get(n).push(c);
        }
      }
      Object.values(o).forEach(walk);
    };
    walk(cog.verumEffects); walk(cog.complementEffects);
  });

  eidon.sort((a, b) => a.c.name.localeCompare(b.c.name));
  // One list. A condition is a condition, whether 5e wrote it or a Cognition did, so the rail holds
  // them together and alphabetically — you look up Hollowed exactly the way you look up Prone.
  // Built from what this account's Cognitions actually name, not from the whole table: a player
  // who hasn't been granted Nightmare has no business seeing Nightling in a rail.
  const all = CONDITIONS.map(c => ({ ...c, kind: "std" }))
    .concat([...named.keys()].map(n => ({ name: n, kind: "named", ...(NAMED_STATES[n] || {}), cogs: named.get(n) })))
    .sort((a, b) => a.name.localeCompare(b.name));
  return (COND_USE = { inflict, eidon, named, all });
}
const condFind = name => (COND_USE?.all || []).find(c => c.name.toLowerCase() === String(name).toLowerCase());

// ═══════════════════════════════════════════════════════════
//  THE PAGES
// ═══════════════════════════════════════════════════════════
function openCondition(ref) {
  state.condRef = ref;
  renderConditionList(); renderCondition();
  const b = document.getElementById("conditionBody"); if (b) b.scrollTop = 0;
}
// The tab's entry point: the rail can't be drawn until the harvest knows which states exist
async function openConditionsView() {
  try { await conditionUse(); } catch (e) { console.warn("Conditions tab:", e); }
  renderConditionList(); renderCondition();
}

function renderConditionList() {
  const box = document.getElementById("conditionList"); if (!box) return;
  const on = state.condRef || "overview";
  const q = (document.getElementById("condSearch")?.value || "").trim().toLowerCase();
  const hit = s => !q || s.toLowerCase().includes(q);
  const btn = (key, label, badge) => `<button class="cog${key === on ? " core" : ""}" onclick="openCondition('${escAttr(key)}')">
      <span class="nm">${esc(label)}</span>${badge || ""}</button>`;

  let h = "";
  if (!q) h += `<div class="rail-grp">The rules</div>` + btn("overview", "Overview")
    + `<div class="rail-grp">From the Cognitions</div>` + btn("eidon", "Eidon conditions");

  // Two groups, one list: 5e's own, then the ones this system made. Alphabetical within each, so
  // a name is still easy to find, but you always know which half of the game you are reading.
  const rows = (COND_USE?.all || CONDITIONS.map(c => ({ ...c, kind: "std" }))).filter(c => hit(c.name));
  const group = (title, kind) => {
    const list = rows.filter(c => c.kind === kind);
    if (!list.length) return "";
    return `<div class="rail-grp">${title} · ${list.length}</div>` + list.map(c => btn("c:" + c.name, c.name,
      c.status && c.status !== "same" ? `<span class="rl cnd-rl ${COND_STATUS[c.status].cls}">${COND_STATUS[c.status].label}</span>` : "")).join("");
  };
  h += group("Base conditions", "std") + group("Homebrew conditions", "named");

  box.innerHTML = rows.length || !q ? h : `<div class="empty" style="padding:22px 8px">Nothing matches “${esc(q)}”.</div>`;
}

// Cognition chips, the Damage tab's own — one click opens that Cognition in the Codex
const condChips = list => (list || []).length
  ? `<div class="dmg-cogs">${list.map(c => cogChip(c, false)).join("")}</div>`
  : `<span class="cdx-soon" style="padding:0">No Cognition applies it yet.</span>`;

// Conditions quote each other constantly — Buried is "Restrained", Ravenous is "a Starving
// creature", Dread-frozen is "Paralyzed with dread". Every mention becomes a link to that entry.
// Only tag text, never inside a tag, and only Capitalised matches, so the prose "bound to a
// prohibition" doesn't turn into a link to Bound while "is Bound" does.
const RX_ESC = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function condLinks(html, selfName) {
  const names = (COND_USE?.all || []).map(c => c.name)
    .filter(n => n !== selfName).sort((a, b) => b.length - a.length);
  if (!names.length || !html) return html;
  const rx = new RegExp(`(?<![\\w-])(${names.map(RX_ESC).join("|")})(?![\\w-])`, "g");
  return String(html).split(/(<[^>]*>)/).map(part => part.startsWith("<") ? part
    : part.replace(rx, m => `<button class="cnd-link" onclick="openCondition('c:${escAttr(m)}')" title="Open ${escQ(m)}">${m}</button>`)).join("");
}

async function renderCondition() {
  const host = document.getElementById("conditionBody"); if (!host) return;
  const use = await conditionUse();
  const ref = state.condRef || "overview";

  if (ref === "overview")  return void (host.innerHTML = condOverview(use));
  if (ref === "eidon")     return void (host.innerHTML = condEidon(use));
  const c = condFind(String(ref).slice(2));
  host.innerHTML = !c ? `<div class="empty">Pick a condition from the left.</div>`
    : c.kind === "named" ? condNamedOne(c, use) : condOne(c, use);
}

function condOverview(use) {
  const changed = CONDITIONS.filter(c => c.status !== "same");
  const BLURB = {
    Stunned: "Rewritten rather than retired. Halved Speed, no Reactions, an Action <em>or</em> a Bonus Action, and never more than one attack — it takes a turn apart without taking it away. <strong>Nothing in the system needs rewriting</strong>: every effect that says <em>Stunned</em> already means this.",
    Paralyzed: "Still brutal, but at the start of your turn you may <strong>Resist</strong> (repeat the save) or <strong>Force Through</strong> (a level of Exhaustion to act anyway). It reaches no other condition.",
  };
  return `<div class="cdx"><div class="cdx-hd"><div><h1>Conditions</h1>
      <p class="cdx-desc">5e's conditions as this table plays them, and the ones the Cognitions make for themselves.</p></div></div>

    <div class="cdx-sec"><h2>What changed</h2><div class="cdx-defs">` +
      changed.map(c => `<div class="cdx-def"><b>${esc(c.name)} <span class="cnd-tag ${COND_STATUS[c.status].cls}">${COND_STATUS[c.status].label}</span></b>
        <span>${BLURB[c.name] || ""}</span></div>`).join("") +
    `</div><p class="cdx-rings">Everything else is <strong>5e as written</strong> — the two above are the whole of the house rule, and they point the same way: <strong>a condition should ruin your turn, not delete it.</strong></p></div>

    <div class="cdx-sec"><h2>The rules behind all of them</h2>
      <p class="cdx-rings">The handful that settle most condition arguments before they start. Each base condition's own page carries the questions it raises in particular.</p>
      <div class="cdx-defs">
      <div class="cdx-def"><b>Advantage and disadvantage never stack</b><span>Any number of sources of each <strong>cancel to a single straight roll</strong>. A blinded creature attacking an unseen target rolls one die, not two of anything.</span></div>
      <div class="cdx-def"><b>Conditions don't stack either</b><span>Having a condition twice is having it once. Durations run independently, so the longest one governs when it ends.</span></div>
      <div class="cdx-def"><b>Saving throws are not ability checks</b><span>A condition that hits "ability checks" — <strong>Poisoned</strong>, <strong>Frightened</strong> — leaves saving throws alone. This is the most misplayed line in the whole system.</span></div>
      <div class="cdx-def"><b>Auto-failing Dex saves means full damage</b><span><strong>Paralyzed</strong>, <strong>Petrified</strong> and <strong>Unconscious</strong> auto-fail Strength and Dexterity saves, so every area effect lands in full. Combined with the melee auto-crit, this is what makes them lethal rather than merely bad.</span></div>
      <div class="cdx-def"><b>Incapacitated breaks concentration</b><span>And so does everything that includes it. It is the quickest way to end an enemy's spell.</span></div>
      <div class="cdx-def"><b>A condition is not its spell</b><span>The <em>Invisibility spell</em> ends when you attack; the <strong>Invisible</strong> condition doesn't. Read the effect that applied it before you read the condition.</span></div>
    </div></div>

    <div class="cdx-sec"><h2>Where conditions come from</h2><div class="cdx-defs">
      <div class="cdx-def"><b>A seal</b><span>A Control Ring, or a Verum Effect that names one. The Cognition's own <strong>Main Saving Throw</strong> resists it, against your <strong>Verum DC</strong>.</span></div>
      <div class="cdx-def"><b>An Eidon or Ignition</b><span>The <strong>Status</strong> Template inflicts its primary Cognition's own condition free at Rank I, and power dice raise it from minor to major to severe. <strong>Zone</strong> can buy the minor one for 1d12.</span></div>
      <div class="cdx-def"><b>A Paragon</b><span>A Devotion's abilities name their own, and they are written per character.</span></div>
    </div></div>

    <div class="cdx-sec"><h2>One list</h2><div class="cdx-defs">
      <div class="cdx-def"><b>${CONDITIONS.length} standard · ${use.named.size} from the Cognitions</b><span>They sit together in the rail, alphabetically — a condition is a condition, and you look up <em>Hollowed</em> the way you look up <em>Prone</em>. The ones a Cognition made are marked <em>From the Cognitions</em> on their own page. <strong>Use the search box</strong> at the top of the rail.</span></div>
      <div class="cdx-def"><b>Eidon ladders</b><span>Separately, <strong>${use.eidon.length}</strong> Cognitions carry a <strong>minor / major / severe</strong> condition of their own — ${use.eidon.length * 3} in all. See <em>Eidon conditions</em>.</span></div>
      <div class="cdx-def"><b>Where the definitions come from</b><span>Which states exist and who inflicts them is read from the Cognition files, so it can't drift. The rules written on each are drawn from the effect text that applies it, stated once instead of leaving you to hunt the tier that said it.</span></div>
    </div></div></div>`;
}

function condOne(c, use) {
  const st = COND_STATUS[c.status];
  const who = use.inflict[c.name.toLowerCase()] || [];
  let h = `<div class="cdx"><div class="cdx-hd"><div>
      <h1>${esc(c.name)}</h1>
      <div class="c-tags" style="margin-top:9px"><span class="t cnd-tag ${st.cls}">${st.label}</span>${
        c.sub ? `<span class="t">${esc(c.sub)}</span>` : ""}</div></div></div>`;

  const L = t => condLinks(t, c.name);

  if (c.bullets) h += `<div class="cdx-sec"><h2>Rules</h2><div class="cdx-note"><ul class="cnd-ul">` +
    c.bullets.map(b => `<li>${L(esc(b))}</li>`).join("") + `</ul></div></div>`;

  if (c.extra) h += `<div class="cdx-sec"><h2>Resist, or Force Through</h2>
    <p class="cdx-rings">${esc(c.extra.lead)}</p><div class="cdx-defs">` +
    c.extra.defs.map(([n, t]) => `<div class="cdx-def"><b>${esc(n)}</b><span>${L(esc(t))}</span></div>`).join("") +
    `</div><p class="cdx-rings">${esc(c.extra.tail)}</p></div>`;

  if (c.reach) h += `<div class="cdx-sec"><h2>How far it reaches</h2><div class="cdx-defs">` +
    c.reach.map(([n, t]) => `<div class="cdx-def"><b>${esc(n)}</b><span>${L(t)}</span></div>`).join("") + `</div></div>`;

  if (c.note) h += `<div class="cdx-sec"><h2>Why</h2><div class="cdx-note"><p>${L(c.note)}</p></div></div>`;

  // The arguments this condition actually starts — the ones that come up at every table and all
  // over the internet, answered once so they don't have to be answered again mid-combat.
  if (c.qa) h += `<div class="cdx-sec"><h2>Questions it always raises</h2><div class="cnd-qa">` +
    c.qa.map(([q, a]) => `<div class="cnd-q"><b>${L(q)}</b><p>${L(a)}</p></div>`).join("") + `</div></div>`;

  h += `<div class="cdx-sec"><h2>Applied by</h2>
    <p class="cdx-rings">Cognitions with a Verum, Sigil or Eidon condition that applies ${esc(c.name)}.</p>
    ${condChips(who)}</div>`;
  return h + `</div>`;
}

function condEidon(use) {
  const row = r => `<tr>
    <td>${cogIcon(r.c)} ${esc(r.c.name)}</td>
    <td class="wrap"><b>${esc(r.minor?.name || "—")}</b>${r.minor?.card ? `<em>${esc(r.minor.card)}</em>` : ""}</td>
    <td class="wrap"><b>${esc(r.major?.name || "—")}</b>${r.major?.card ? `<em>${esc(r.major.card)}</em>` : ""}</td>
    <td class="wrap"><b>${esc(r.severe?.name || "—")}</b>${r.severe?.card ? `<em>${esc(r.severe.card)}</em>` : ""}</td></tr>`;

  return `<div class="cdx"><div class="cdx-hd"><div><h1>Eidon conditions</h1>
      <p class="cdx-desc">Every Cognition's own three — what it does to a body when it is the Core of the blow.</p></div></div>

    <div class="cdx-sec"><h2>How they are used</h2><div class="cdx-defs">
      <div class="cdx-def"><b>Status Template</b><span>Inflicts the <strong>minor</strong> one free at Rank I. <strong>2d12</strong> raises it to major, <strong>3d12</strong> to severe, and once raised <strong>1d12</strong> stacks the minor back on top.</span></div>
      <div class="cdx-def"><b>Zone Template</b><span><strong>1d12</strong> applies the minor one to everything that fails.</span></div>
      <div class="cdx-def"><b>Which Cognition's</b><span>Always the <strong>primary</strong> Burning Cognition's. Sigils lend their Verum, never their conditions.</span></div>
      <div class="cdx-def"><b>The save</b><span>The primary Cognition's Main Saving Throw, against your <strong>Verum DC</strong>.</span></div>
    </div></div>

    <div class="cdx-sec"><h2>All ${use.eidon.length}</h2>
      <p class="cdx-rings">Several of the severe ones read <em>Stunned</em>; under the retirement rule they are <strong>Dazed</strong>.</p>
      <div class="tbl-wrap"><table class="tbl cnd-tbl"><thead><tr>
        <th>Cognition</th><th>Minor</th><th>Major</th><th>Severe</th></tr></thead><tbody>` +
      use.eidon.map(row).join("") + `</tbody></table></div></div></div>`;
}

// ═══════════════════════════════════════════════════════════
//  NAMED STATES — defined, not just listed
// ═══════════════════════════════════════════════════════════
// Every state a Verum applies by name, written out as a real condition. Each definition is drawn
// from the effect text that applies it, so the rules here are the rules the Cognitions already
// carry — this page states them once instead of making you hunt the tier that said it.
//   `dur` — how long it normally runs, where the effects agree on one
//   `see` — a state with a ruleset of its own; that ruleset governs, this is the summary
const NAMED_STATES = {
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

// A condition a Cognition made. Same page shape as a standard one — rules, duration, who applies it
// — so that moving between the two reads as one reference rather than two.
function condNamedOne(c, use) {
  if (!c.def) console.warn(`Conditions tab: no definition written for “${c.name}”`);
  const cogs = c.cogs || [];
  return `<div class="cdx"><div class="cdx-hd"><div>
      <h1>${esc(c.name)}</h1>
      <div class="c-tags" style="margin-top:9px">
        <span class="t cnd-tag cs-cog">Homebrew — from the Cognitions</span>
        ${c.dur ? `<span class="t">${esc(c.dur)}</span>` : ""}
        ${cogs.length > 1 ? `<span class="t">named by ${cogs.length}</span>` : ""}
      </div></div></div>

    <div class="cdx-sec"><h2>Rules</h2><div class="cdx-note">
      <p>${condLinks(c.def, c.name) || `<span style="opacity:.6">No definition written yet — the effect that applies it defines it.</span>`}</p>
      ${c.dur ? `<p class="cdx-rings" style="margin:7px 0 0">Normally lasts <strong>${esc(c.dur)}</strong>, where the effects agree on one.</p>` : ""}
    </div></div>` +

    (c.see ? `<div class="cdx-sec"><h2>It has its own rules</h2><div class="cdx-note cnd-see-note">
      <p>This state has <strong>rules of its own</strong> in the vault — see <strong>${c.see}</strong>. Those govern; the line above is the summary.</p></div></div>` : "") +

    `<div class="cdx-sec"><h2>Applied by</h2>
      <p class="cdx-rings">Cognitions with a Verum or Sigil that applies ${esc(c.name)} by name.</p>
      ${condChips(cogs)}</div></div>`;
}
