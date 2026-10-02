// Arcanum Veritas Builder — The Actions tab
//
// The action economy in one place: 5e's own actions as this table plays them, and the ones this
// campaign added — Quick Action, Quick Attack, Grand Action, Pair Action, and the Vinculum Grimm
// Actions two bonded users throw together. Built the same way as the Conditions tab: two groups in
// one rail, a search box, cross-links between entries, and the questions each one always raises.
//
// Unlike Conditions, none of this is read from the Cognition files — the action economy is the
// vault's, not the Cognitions'. It is transcribed from Homebrew/Rulesets/Actions/ and
// Grimms/Vinculum Grimm Actions.md; edit those and this together.

const ACT_KIND = {
  common:   { label: "5e", cls: "ak-common" },
  homebrew: { label: "Homebrew", cls: "ak-home" },
};

const ACTIONS = [
  // ═══ 5e's own ═══
  { name: "Attack", kind: "common", cost: "Action", sum: "One melee or ranged attack — more once a feature says so.",
    bullets: [
      "You may move between attacks: split your movement around each swing as you like.",
      "Extra Attack and similar features raise the number of attacks this one action makes — they never apply to an attack granted by something else.",
      "Grapple and Shove replace one of the attacks this action gives you, not the whole action.",
    ], qa: [
      ["Can I move between my attacks?", "Yes. Movement is spent foot by foot and can be broken up around every attack in the action — attack, step five feet, attack again."],
      ["Does Extra Attack apply to a Quick Attack or an opportunity attack?", "<strong>No.</strong> Extra Attack enlarges <em>the Attack action</em>. An attack granted by a reaction, a Quick Action or another creature's feature is one attack, full stop."],
      ["Can I replace an attack with a Grapple or Shove?", "Yes, one for one. A fighter with three attacks could shove, then attack twice."],
    ] },
  { name: "Cast a Spell", kind: "common", cost: "Action · or whatever the spell says", sum: "Casting time varies — action, bonus action, reaction, or minutes.",
    bullets: [
      "A spell's casting time is whatever the spell says; most are an action.",
      "Casting a spell as a Bonus Action restricts the rest of your turn — see the question below.",
      "Concentration ends if you cast another concentration spell, become Incapacitated, or fail a Constitution save after damage.",
    ], qa: [
      ["Can I cast two spells in a turn?", "Only under the bonus-action rule, and it's narrower than people play it: if you cast a spell as a <strong>Bonus Action</strong>, the only other spell you may cast that turn is a <strong>cantrip with a casting time of 1 action</strong>. Two levelled spells in one turn is not possible this way."],
      ["Does that stop a levelled spell cast as a reaction later in the round?", "No — the restriction covers your own turn. A <em>Shield</em> or <em>Counterspell</em> on someone else's turn is untouched."],
      ["What breaks concentration?", "Casting another concentration spell, becoming <strong>Incapacitated</strong> (or anything that includes it), dying, or failing a Constitution save when you take damage — DC 10 or half the damage, whichever is higher."],
    ] },
  { name: "Dash", kind: "common", cost: "Action", sum: "Gain extra movement equal to your Speed for this turn.",
    qa: [["Does Dash double my movement?", "It <em>adds</em> your Speed to your remaining movement, which only equals doubling if you haven't moved yet. Bonuses and penalties to Speed apply to both halves."]] },
  { name: "Disengage", kind: "common", cost: "Action", sum: "Your movement provokes no opportunity attacks for the rest of the turn.",
    qa: [["Does it protect me from everyone, or just the creature I'm next to?", "Everyone, for the whole turn — it isn't aimed at a particular enemy."]] },
  { name: "Dodge", kind: "common", cost: "Action", sum: "Attacks against you have disadvantage; your Dexterity saves have advantage.",
    bullets: [
      "Lasts until the start of your next turn.",
      "You lose the benefit if you are Incapacitated or your Speed drops to 0.",
    ], qa: [["Does Dodge work against attackers I can't see?", "No. The disadvantage only applies to attackers you can see — an unseen attacker rolls normally, and their own advantage for being unseen would cancel it anyway."]] },
  { name: "Help", kind: "common", cost: "Action", sum: "Give an ally advantage on one ability check, or on their next attack against a creature within 5 feet of you.",
    bullets: ["The attack version must be used before the start of your next turn."],
    qa: [["Can I Help an attack from across the room?", "No — the target has to be within <strong>5 feet of you</strong>, since you are the distraction. Helping with an ability check has no such limit."],
      ["Is Help what guards a Grand Action?", "Yes, and it's a different use: spending Help to guard a charging creature raises its Damage Threshold by half, and costs both of you your reactions."]] },
  { name: "Hide", kind: "common", cost: "Action", sum: "A Stealth check to become unseen and unheard.",
    qa: [["Can I hide from a creature that can see me?", "Not normally — you need cover or heavy obscurement. The <strong>Invisible</strong> condition is the common exception: it lets you attempt to hide even while observed."],
      ["Is hiding the same as being invisible?", "No. Hidden means <em>unlocated</em>; invisible means <em>unseen</em>. You can be invisible and perfectly well located by the noise you're making."]] },
  { name: "Ready", kind: "common", cost: "Action", sum: "Pick a trigger and a response now; the response costs your Reaction when it fires.",
    bullets: [
      "You decide the perceivable circumstance and the action — or a movement up to your Speed.",
      "A readied spell is cast as the trigger fires, and you must hold concentration on it until then.",
      "The reaction is spent when it triggers, and you can't take another until the start of your next turn.",
    ], qa: [["Why does readying a spell cost so much?", "You spend the action to cast it, hold <strong>concentration</strong> until the trigger (so anything that breaks concentration loses the spell and the slot), and then spend your <strong>reaction</strong> to release it. Readying is a genuine sacrifice, not a free delay."],
      ["Can I ready an action and still take a reaction?", "No — if the readied action fires, that was your reaction for the round."]] },
  { name: "Search", kind: "common", cost: "Action", sum: "Devote your attention to finding something — Perception or Investigation.",
    qa: [["Is Search one of the Quick Action options?", "Yes. It's one of the six things a <strong>Quick Action</strong> can buy you."]] },
  { name: "Use an Object", kind: "common", cost: "Action", sum: "Interact with a second object, or use one that needs an action.",
    bullets: ["You already get one free object interaction on your turn — drawing a weapon, opening a door, drinking from an open flask. This action buys a second."],
    qa: [["Drawing a weapon — free or an action?", "The first interaction on your turn is free, so drawing one weapon costs nothing. Drawing a <em>second</em> in the same turn needs this action."]] },
  { name: "Grapple", kind: "common", cost: "Replaces one attack", sum: "A Strength (Athletics) check against the target's Athletics or Acrobatics.",
    bullets: ["The target must be no more than one size larger, and you need a free hand."],
    qa: [["What does a successful grapple actually do?", "It applies the <strong>Grappled</strong> condition — Speed 0, and nothing else. No advantage for you, no disadvantage for them. Grappled is not Restrained."],
      ["How do they get out?", "An action to make an Athletics or Acrobatics check against your Athletics. Teleporting out works too, and costs nothing."]] },
  { name: "Shove", kind: "common", cost: "Replaces one attack", sum: "Push a creature 5 feet, or knock it Prone.",
    bullets: ["Same contest as Grapple; the target must be no more than one size larger."],
    qa: [["Prone or pushed — who chooses?", "You do, when you shove."]] },
  { name: "Opportunity Attack", kind: "common", cost: "Reaction", sum: "One melee attack when a creature you can see leaves your reach.",
    bullets: ["It triggers on leaving your reach — not on moving within it, and not on standing up."],
    qa: [["What doesn't provoke?", "Teleporting, being moved against your will, moving within reach, and anything after a <strong>Disengage</strong>. Standing up from Prone doesn't provoke either."],
      ["Do I get Extra Attack on it?", "No — one attack."]] },
  { name: "Two-Weapon Fighting", kind: "common", cost: "Bonus Action", sum: "One attack with a light weapon in your other hand.",
    bullets: ["Only after you take the Attack action with a light melee weapon. No ability modifier to the damage unless a feature grants it."],
    qa: [["Can I do it after a Quick Attack or an opportunity attack?", "No — it keys off <em>the Attack action</em> specifically."]] },

  // ═══ This campaign's own ═══
  { name: "Quick Action", kind: "homebrew", cost: "None — outside the action economy", vault: "Homebrew/Rulesets/Actions/Quick Action.md",
    sum: "A condensed effort granted by a trigger, costing none of your action economy.",
    lead: "A focused, limited effort a creature takes in response to a trigger outside its normal turn. It is <strong>not</strong> an Action, Bonus Action or Reaction, and consumes none of them.",
    bullets: [
      "Choose <strong>one</strong>: a Quick Attack · Dash · Dodge · Search · Disengage and move 10 feet · or regain hit points by spending 1 Hit Die.",
      "One Quick Action per triggering effect, unless the effect says otherwise.",
      "It does not interfere with your Reaction or your Bonus Action in the same round.",
    ], qa: [
      ["So it's free?", "In action-economy terms, yes — that is the whole point. It costs nothing you had; it is something a feature hands you. What limits it is that <strong>only a feature can grant one</strong>."],
      ["Can I take two if two features grant them at once?", "No. One per triggering effect, and if several fire together the DM rules which takes precedence."],
      ["Does it use up my reaction?", "No, and it isn't one — you can take a Quick Action and still have your Reaction and Bonus Action for the round."],
      ["Who hands these out?", "Grimms, mostly. <strong>Rage of the Tiger</strong>'s Labor of Heroism gives one to every ally within 30 feet; <strong>White Rabbit</strong> gives one with advantage to allies in a radius; <strong>Gate of Caelum</strong>'s Graveyard's Wrath gives one to every Servant. Richard's Ignition <em>Stand With Me</em> grants one at Rank IV."],
    ] },
  { name: "Quick Attack", kind: "homebrew", cost: "The offensive option inside a Quick Action", vault: "Homebrew/Rulesets/Actions/Quick Attack.md",
    sum: "One attack, or one narrow cantrip, taken outside the usual economy.",
    bullets: [
      "<strong>One melee weapon attack</strong> with a weapon you're wielding, with all your normal modifiers.",
      "<strong>One ranged weapon attack</strong>, subject to range, line of sight and ammunition.",
      "<strong>One cantrip</strong> — but only one with a casting time of 1 action, a single target, and no concentration.",
    ], qa: [
      ["Which cantrips don't qualify?", "Anything with multiple targets, an area, a lingering zone or concentration — <em>Word of Radiance</em> and <em>Thunderclap</em> are the usual rejects. <em>Fire Bolt</em> and <em>Toll the Dead</em> are fine."],
      ["Does Extra Attack apply?", "<strong>No.</strong> One attack only — Extra Attack, War Magic and Twinned Spell don't apply unless the ability granting the Quick Attack says so."],
      ["Does it use my reaction?", "No. It is not a reaction and can't be substituted for the Attack action."],
    ] },
  { name: "Grand Action", kind: "homebrew", cost: "Action — and the whole turn", vault: "Homebrew/Rulesets/Actions/Grand Action.md",
    sum: "Declared at the start of your turn, charged for a full round, resolved at the start of the next.",
    lead: "Mythical strikes, divine rituals, apocalyptic spells. A category of its own — not Attack, not Cast a Spell — and the only action in the game that takes a round to arrive.",
    bullets: [
      "<strong>Declared</strong> at the start of your turn, using your Action to begin charging. It <strong>resolves</strong> at the start of your next turn.",
      "You must <strong>end any concentration</strong> to begin one.",
      "While charging you may take <strong>no reactions</strong> and no other actions, and you may not ready or hold.",
      "Movement and your Bonus Action are yours again on the turn it <em>completes</em>.",
      "Spell-casting Grand Actions need <strong>no verbal, somatic or material components</strong> unless stated.",
      "The target or area is chosen <strong>when it resolves</strong>, not when it is declared.",
    ], table: { cols: ["Recovery attempt", "DC"], rows: [["First", "15"], ["Second", "20"], ["Third", "25"]] },
    qa: [
      ["How is one interrupted?", "Each Grand Action lists a <strong>Damage Threshold</strong>. Take that much damage before it resolves and it breaks — and if it isn't retried, every resource it spent is still gone. <strong>Temporary hit points count toward the threshold.</strong>"],
      ["What if I'm grappled while charging?", "At the start of your turn, a <strong>DC 15 Constitution save</strong>. Fail and it breaks; succeed and it resolves normally."],
      ["Can it be counterspelled?", "Only with a slot of <strong>equal or higher level</strong> than the Grand Action — and a lower slot <em>automatically fails</em> with no ability check. This overrides the normal Counterspell rules entirely."],
      ["Can I recover a broken one?", "As a Bonus Action on your next turn, a Constitution save: <strong>DC 15, then 20, then 25</strong>, to a maximum of three recovery attempts per long rest. Succeed and you may attempt the Grand Action again next turn."],
      ["Can someone protect me while I charge?", "Yes — the <strong>Guarded Grand Action</strong>. An ally within 5 feet spends <strong>Help</strong> to raise your Damage Threshold by half its original amount. Both of you lose your reactions until the start of your turn."],
    ] },
  { name: "Pair Action", kind: "homebrew", cost: "Both creatures' Actions", vault: "Homebrew/Rulesets/Actions/Pair Action.md",
    sum: "Two creatures on a shared initiative spend both Actions on one manoeuvre.",
    bullets: [
      "Both must act on the <strong>same initiative count</strong> as a pair — see Paired Combat.",
      "Both must <strong>willingly</strong> give up their Action; bonus actions, movement and reactions are untouched unless stated.",
      "Each distinct Pair Action may be used <strong>once per encounter across the whole party</strong>.",
      "Many require a hit, a save, or positioning such as adjacency or line of sight.",
    ],
    types: [["Aggressive", "Increases offensive potential"], ["Defensive", "Reduces harm and protects allies"],
            ["Support", "Heals, inspires or assists"], ["Tactical", "Controls the battlefield or debilitates"]],
    qa: [
      ["What's the save DC?", "<strong>8 + both creatures' proficiency bonuses + the highest spellcasting ability modifier</strong> between them. A creature with no spellcasting ability uses its highest of Strength, Dexterity or Constitution instead. <span style=\"color:#E0B050\">Note: the ruleset's own worked example computes <em>10</em> + 4 + 3 = 17 and omits the ability modifier — the formula and the example disagree. Flagged for the DM.</span>"],
      ["Once per encounter — each, or between us?", "Across the whole party. Two different pairs can't both use the same Pair Action in one fight."],
    ] },
  { name: "Vinculum Action", kind: "homebrew", cost: "1 Grimm Slot each", vault: "Grimms/Vinculum Grimm Actions.md",
    sum: "Two bonded Grimm Users acting as one — the Pair Grimm Actions.",
    lead: "A <strong>Vinculum</strong> is the tether between a Grimm User and their Grimm. When <em>two</em> users form a <strong>Synced Vinculum</strong>, their Grimms act not in sequence but as one.",
    bullets: [
      "Both users must be in <strong>Paired Combat</strong> — within 30 feet of each other, and synced.",
      "Each expends <strong>1 Grimm Slot</strong>.",
      "Usable <strong>once per turn</strong>.",
    ], qa: [
      ["Which pair gets which action?", "Every pairing has its own, from the matrix in the vault — Grizzly and Khaled have <em>FTL</em>, Rory and Zariel have <em>Death Scythe Parade</em>, Zeke and Richard have <em>Valiant Aegis</em>. It is a property of the two Grimms, not a list anyone chooses from."],
      ["Is this the same as a Pair Action?", "It's the Grimm version, and the costs differ: a Pair Action spends both <strong>Actions</strong> and fires once per encounter; a Vinculum Action spends a <strong>Grimm Slot</strong> each and fires once per turn."],
      ["Are they all written?", "Not yet — several in the matrix have no text. <em>Cursed Brothers</em>, <em>Heaven Piercer</em> and <em>Oblivion</em> are named but empty."],
    ] },
];
const ACT_BY_NAME = new Map(ACTIONS.map(a => [a.name.toLowerCase(), a]));

// ═══════════════════════════════════════════════════════════
//  THE PAGES
// ═══════════════════════════════════════════════════════════
const RX_ESC_A = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Actions quote each other — Quick Action offers a Quick Attack, a Grand Action is guarded with
// Help. Same linking rule as the Conditions tab: capitalised matches only, never inside a tag.
function actLinks(html, selfName) {
  const names = ACTIONS.map(a => a.name).filter(n => n !== selfName).sort((a, b) => b.length - a.length);
  if (!html) return html;
  const rx = new RegExp(`(?<![\\w-])(${names.map(RX_ESC_A).join("|")})(?![\\w-])`, "g");
  return String(html).split(/(<[^>]*>)/).map(p => p.startsWith("<") ? p
    : p.replace(rx, m => `<button class="cnd-link" onclick="openAction('a:${escAttr(m)}')" title="Open ${escQ(m)}">${m}</button>`)).join("");
}

function openAction(ref) {
  state.actRef = ref;
  renderActionList(); renderAction();
  const b = document.getElementById("actionBody"); if (b) b.scrollTop = 0;
}

function renderActionList() {
  const box = document.getElementById("actionList"); if (!box) return;
  const on = state.actRef || "overview";
  const q = (document.getElementById("actSearch")?.value || "").trim().toLowerCase();
  const btn = (key, label, badge) => `<button class="cog${key === on ? " core" : ""}" onclick="openAction('${escAttr(key)}')">
      <span class="nm">${esc(label)}</span>${badge || ""}</button>`;

  let h = "";
  if (!q) h += `<div class="rail-grp">The rules</div>` + btn("overview", "The action economy");
  const rows = ACTIONS.filter(a => !q || a.name.toLowerCase().includes(q) || (a.sum || "").toLowerCase().includes(q));
  const group = (title, kind) => {
    const list = rows.filter(a => a.kind === kind);
    if (!list.length) return "";
    return `<div class="rail-grp">${title} · ${list.length}</div>` + list.map(a =>
      btn("a:" + a.name, a.name, `<span class="rl act-rl">${esc(a.cost.split(" ")[0])}</span>`)).join("");
  };
  h += group("Common actions", "common") + group("Homebrew actions", "homebrew");
  box.innerHTML = rows.length || !q ? h : `<div class="empty" style="padding:22px 8px">Nothing matches “${esc(q)}”.</div>`;
}

function renderAction() {
  const host = document.getElementById("actionBody"); if (!host) return;
  const ref = state.actRef || "overview";
  if (ref === "overview") return void (host.innerHTML = actOverview());
  const a = ACT_BY_NAME.get(String(ref).slice(2).toLowerCase());
  host.innerHTML = a ? actOne(a) : `<div class="empty">Pick an action from the left.</div>`;
}

function actOverview() {
  return `<div class="cdx"><div class="cdx-hd"><div><h1>The action economy</h1>
      <p class="cdx-desc">What you get on a turn, and where this campaign's own actions sit inside it.</p></div></div>

    <div class="cdx-sec"><h2>On your turn</h2><div class="cdx-defs">
      <div class="cdx-def"><b>Movement</b><span>Up to your Speed, spent foot by foot and splittable around everything else you do.</span></div>
      <div class="cdx-def"><b>One Action</b><span>Attack, Cast a Spell, Dash, Disengage, Dodge, Help, Hide, Ready, Search, Use an Object — or a <strong>Grand Action</strong>, which takes the turn and the next one's opening.</span></div>
      <div class="cdx-def"><b>One Bonus Action</b><span>Only when something grants one. You never simply <em>have</em> a bonus action to spend.</span></div>
      <div class="cdx-def"><b>One free object interaction</b><span>Draw a weapon, open a door, pick something up. A second costs <strong>Use an Object</strong>.</span></div>
    </div></div>

    <div class="cdx-sec"><h2>Not on your turn</h2><div class="cdx-defs">
      <div class="cdx-def"><b>One Reaction</b><span>Per round, refreshed at the start of your turn. An <strong>Opportunity Attack</strong>, a readied action, <em>Shield</em>, <em>Counterspell</em>.</span></div>
      <div class="cdx-def"><b>A Quick Action</b><span>This campaign's own, and the reason it exists: a feature hands you one, and it costs <strong>none</strong> of the three above. You can take a Quick Action and still have your Reaction.</span></div>
    </div></div>

    <div class="cdx-sec"><h2>What this campaign added</h2><div class="cdx-defs">
      <div class="cdx-def"><b>Quick Action</b><span>Outside the economy entirely — granted by a trigger, one per effect. Choose one of six small things.</span></div>
      <div class="cdx-def"><b>Quick Attack</b><span>The offensive option inside a Quick Action: one attack, or one narrow cantrip.</span></div>
      <div class="cdx-def"><b>Grand Action</b><span>The opposite end: an Action that charges for a full round before it lands, and can be broken by damage.</span></div>
      <div class="cdx-def"><b>Pair Action</b><span>Two creatures on a shared initiative spending both Actions at once.</span></div>
      <div class="cdx-def"><b>Vinculum Action</b><span>The Grimm version of a pair move — a Grimm Slot each, once per turn.</span></div>
    </div></div>

    <div class="cdx-sec"><h2>The distinctions worth holding on to</h2><div class="cdx-note">
      <p><strong>A Quick Action is not a Reaction.</strong> It doesn't spend one, doesn't block one, and can't be used where a reaction is called for.</p>
      <p><strong>A Quick Attack is not the Attack action.</strong> Extra Attack never applies to it — nor to an opportunity attack, nor to anything another creature hands you.</p>
      <p><strong>A bonus action is not a resource you own.</strong> You have one only when a feature gives you something to spend it on.</p>
      <p><strong>A Grand Action is not a spell</strong>, even when it casts one — which is why it needs no components and answers to its own counterspell rule.</p>
    </div></div></div>`;
}

function actOne(a) {
  const k = ACT_KIND[a.kind], L = t => actLinks(t, a.name);
  let h = `<div class="cdx"><div class="cdx-hd"><div>
      <h1>${esc(a.name)}</h1>
      <div class="c-tags" style="margin-top:9px">
        <span class="t cnd-tag ${k.cls}">${k.label}</span>
        <span class="t">${esc(a.cost)}</span>
      </div>
      <p class="cdx-desc" style="margin-top:11px">${L(esc(a.sum))}</p></div></div>`;

  if (a.lead) h += `<div class="cdx-sec"><div class="cdx-note"><p>${L(a.lead)}</p></div></div>`;

  if (a.bullets) h += `<div class="cdx-sec"><h2>Rules</h2><div class="cdx-note"><ul class="cnd-ul">` +
    a.bullets.map(b => `<li>${L(b)}</li>`).join("") + `</ul></div></div>`;

  if (a.types) h += `<div class="cdx-sec"><h2>Types</h2><div class="cdx-defs">` +
    a.types.map(([n, t]) => `<div class="cdx-def"><b>${esc(n)}</b><span>${esc(t)}</span></div>`).join("") + `</div></div>`;

  if (a.table) h += `<div class="cdx-sec"><h2>Recovering a broken one</h2><div class="tbl-wrap"><table class="tbl"><thead><tr>` +
    a.table.cols.map(c => `<th>${esc(c)}</th>`).join("") + `</tr></thead><tbody>` +
    a.table.rows.map(r => `<tr>` + r.map(c => `<td>${esc(c)}</td>`).join("") + `</tr>`).join("") + `</tbody></table></div></div>`;

  if (a.qa) h += `<div class="cdx-sec"><h2>Questions it always raises</h2><div class="cnd-qa">` +
    a.qa.map(([q, ans]) => `<div class="cnd-q"><b>${L(q)}</b><p>${L(ans)}</p></div>`).join("") + `</div></div>`;

  if (a.vault) h += `<div class="cdx-sec"><p class="cdx-rings">Written in the vault at <code>${esc(a.vault)}</code> — edit that and this together.</p></div>`;
  return h + `</div>`;
}
