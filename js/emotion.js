// Arcanum Veritas Builder — The Emotion tab
//
// Emotional Alchemy is a whole subsystem of its own: five Primals, forty-eight Complex
// Emotions, four checks and a purification procedure. This tab is the table-side reference
// for it. The numbers here are the vault's (Magic System/Emotion), not the builder's — the
// Cognitions that use them live in the Codex.

const EMO_CORE = [
  { name: "Joy",     key: "joy",     dot: "🟡", cls: "joy",
    desc: "The warmth of connection, creation and contentment. A positive feedback from the world and self.",
    seal: "A creature that fails lowers its guard — attacks against it have advantage." },
  { name: "Sadness", key: "sadness", dot: "🔵", cls: "sad",
    desc: "The ache of loss and empathy. It deepens connection by reminding us of what matters.",
    seal: "A creature that fails has its speed halved and can't take reactions." },
  { name: "Anger",   key: "anger",   dot: "🔴", cls: "ang",
    desc: "The soul's flare when boundaries are violated. It demands action and correction.",
    seal: "A creature that fails attacks the nearest creature." },
  { name: "Fear",    key: "fear",    dot: "⚫", cls: "fea",
    desc: "The pulse of preservation. A response to uncertainty and potential danger.",
    seal: "A creature that fails is Frightened of you." },
  { name: "Disgust", key: "disgust", dot: "🟢", cls: "dis",
    desc: "The internal rejection of corruption, falsehood, or violation of self-concept.",
    seal: "A creature that fails can't willingly come within 10 feet of you." },
];
const CORE_OF = Object.fromEntries(EMO_CORE.map(c => [c.name, c]));

// name, recipe (Core Emotions), what it is, and the Vile emotion it answers
const EMO_VIRTUOUS = [
  ["Acceptance",   ["Anger", "Sadness", "Joy"],       "Embracing others and oneself without judgment.", "Prejudice"],
  ["Balance",      ["Fear", "Disgust"],               "Healthy moderation and harmony in all things.", "Obsession"],
  ["Belonging",    ["Sadness", "Disgust", "Joy"],     "Being accepted and connected to a group or place.", "Loneliness"],
  ["Clarity",      ["Joy", "Joy"],                    "Seeing truth and meaning in chaos or confusion.", "Absurdity"],
  ["Courage",      ["Fear", "Anger", "Joy"],          "Facing fear, danger or uncertainty with resolve.", "Anxiety"],
  ["Determination",["Fear", "Anger"],                 "Unshakable willpower to continue despite obstacles.", "Doubt"],
  ["Forgiveness",  ["Sadness", "Disgust"],            "Letting go of resentment and offering compassion.", "Regret"],
  ["Friendship",   ["Sadness", "Joy"],                "Mutual affection, trust and companionship.", "Hate"],
  ["Generosity",   ["Anger", "Disgust", "Joy"],       "Giving without expecting anything in return.", "Greed"],
  ["Gratitude",    ["Fear", "Sadness", "Joy"],        "A thankful appreciation for what one has.", "Jealousy"],
  ["Hope",         ["Fear", "Fear", "Joy"],           "Belief in the possibility of better outcomes.", "Despair"],
  ["Humility",     ["Disgust", "Disgust", "Sadness"], "Recognition of one's limits and flaws.", "Scorn"],
  ["Integrity",    ["Fear", "Anger", "Disgust"],      "Living truthfully and consistently with one's values.", "Hypocrisy"],
  ["Justice",      ["Anger", "Sadness"],              "The pursuit of fairness and moral accountability.", "Revenge"],
  ["Love",         ["Joy", "Joy", "Sadness"],         "Deep emotional connection and care for others.", "Apathy"],
  ["Reliability",  ["Fear", "Fear", "Disgust"],       "Being dependable and accountable.", "Evasion"],
  ["Sagacity",     ["Fear", "Disgust", "Disgust"],    "Keen wisdom and sound judgment born from experience.", "Rashness"],
  ["Self-Respect", ["Anger", "Anger", "Joy"],         "Treating oneself with honour and dignity.", "Shame"],
  ["Self-Worth",   ["Fear", "Sadness", "Sadness"],    "Belief in one's own value.", "Inferiority"],
  ["Sincerity",    ["Disgust", "Disgust", "Joy"],     "Honest, heartfelt expression free from deceit.", "Deceit"],
  ["Spirituality", ["Fear", "Sadness", "Anger"],      "Faith in something greater, bringing inner peace.", "Desperation"],
  ["Truthfulness", ["Anger", "Anger"],                "Telling and living by the truth, unsoftened.", "Slander"],
  ["Understanding",["Sadness", "Sadness", "Joy"],     "Deep empathy and comprehension of others.", "Zealotry"],
  ["Wonder",       ["Fear", "Disgust", "Joy"],        "Awe and reverence toward the unknown or beautiful.", "Vanity"],
].map(([name, recipe, desc, counters]) => ({ name, recipe, desc, counters, good: true }));

const EMO_VILE = [
  ["Absurdity",   ["Disgust", "Joy"],                "Chaos, illogic, broken narratives", "Clarity"],
  ["Anxiety",     ["Fear"],                          "Anticipation, panic, fear of the unknown", "Courage"],
  ["Apathy",      ["Disgust", "Sadness"],            "Detachment, numbness, loss of care", "Love"],
  ["Deceit",      ["Fear", "Joy"],                   "Lies, illusions, double meanings", "Sincerity"],
  ["Despair",     ["Sadness", "Sadness"],            "Hopelessness, emotional void, collapse", "Hope"],
  ["Desperation", ["Anger", "Fear", "Sadness"],      "Frantic will to survive, irrational sacrifice", "Spirituality"],
  ["Doubt",       ["Fear", "Fear", "Disgust"],       "Disbelief, hesitation, unmade truths", "Determination"],
  ["Evasion",     ["Sadness", "Sadness", "Fear"],    "Cowardice, flight, denial of responsibility", "Reliability"],
  ["Greed",       ["Anger", "Joy"],                  "Hoarding, entitlement, consumption", "Generosity"],
  ["Hate",        ["Anger", "Disgust"],              "Destruction, wrath, dehumanization", "Friendship"],
  ["Hypocrisy",   ["Disgust", "Sadness", "Joy"],     "Contradiction, betrayal of belief", "Integrity"],
  ["Inferiority", ["Fear", "Sadness"],               "Inadequacy, comparison, dependence", "Self-Worth"],
  ["Jealousy",    ["Anger", "Sadness"],              "Destructive longing, comparison turned malice", "Gratitude"],
  ["Loneliness",  ["Sadness"],                       "Abandonment, isolation, forgotten identity", "Belonging"],
  ["Obsession",   ["Anger", "Fear", "Joy"],          "Compulsion, perfectionism, cyclical fixation", "Balance"],
  ["Prejudice",   ["Fear", "Disgust"],               "Fear of the Other, rejection of difference", "Acceptance"],
  ["Rashness",    ["Anger", "Joy", "Joy"],           "Impulsiveness, lack of foresight", "Sagacity"],
  ["Regret",      ["Sadness", "Sadness", "Disgust"], "Past failure, irredeemable choices", "Forgiveness"],
  ["Revenge",     ["Anger", "Disgust", "Sadness"],   "Cyclical pain, blood justice", "Justice"],
  ["Scorn",       ["Anger", "Anger", "Joy"],         "Contempt, prideful rejection", "Humility"],
  ["Shame",       ["Fear", "Disgust", "Sadness"],    "Internalized judgment, unworthiness", "Self-Respect"],
  ["Slander",     ["Anger", "Disgust", "Joy"],       "False words, weaponized truth", "Truthfulness"],
  ["Vanity",      ["Joy"],                           "Narcissism, identity worship", "Wonder"],
  ["Zealotry",    ["Anger", "Fear", "Fear"],         "Fanaticism, blinding belief, sacred cruelty", "Understanding"],
].map(([name, recipe, desc, counters]) => ({ name, recipe, desc, counters, good: false }));

// What a Vile Emotion does when Emotion's Vile Infusion spends it (Tier II and up)
const VILE_GRIP = {
  "Anxiety": "Frightened", "Despair": "no temporary hit points and no Inspiration",
  "Apathy": "no reactions", "Hate": "its attacks turn on whoever wounded it last",
  "Loneliness": "cut off from its allies' Help and auras",
};

// A recipe is only half the answer — intent decides which side of the ledger it lands on
const RECIPE_KEY = e => e.recipe.slice().sort().join("+");
const TWINS = (() => {
  const by = {};
  [...EMO_VIRTUOUS, ...EMO_VILE].forEach(e => (by[RECIPE_KEY(e)] = by[RECIPE_KEY(e)] || []).push(e));
  return by;
})();
function twinOf(e) { return (TWINS[RECIPE_KEY(e)] || []).find(o => o.good !== e.good); }

// The Extraction DC guideline, reused as the crafting DC — a recipe's depth is its difficulty
const emoDC = e => e.recipe.length >= 3 ? 30 : 25;

const EMO_PAGES = [
  { key: "overview",     label: "Overview",      sub: "What Emotion is" },
  { key: "primals",      label: "The Primals",   sub: "The five of the Heart" },
  { key: "alchemy",      label: "Alchemy",       sub: "The five actions" },
  { key: "vessels",      label: "Vessels",       sub: "Gold and obsidian" },
  { key: "virtuous",     label: "Virtuous",      sub: "24 emotions" },
  { key: "vile",         label: "Vile",          sub: "24 emotions" },
  { key: "counters",     label: "Counters",      sub: "What answers what" },
  { key: "purification", label: "Purification",  sub: "Curing Nightmares" },
];

function openEmo(ref) {
  state.emoRef = ref;
  renderEmoList(); renderEmo();
  const b = document.getElementById("emoBody"); if (b) b.scrollTop = 0;
}
function renderEmoList() {
  const box = document.getElementById("emoList"); if (!box) return;
  const on = state.emoRef || "overview";
  box.innerHTML = EMO_PAGES.map(p => `<button class="cog${on === p.key ? " core" : ""}" onclick="openEmo('${escAttr(p.key)}')">
      <span class="nm">${esc(p.label)}</span><span class="dmg-arrow">${esc(p.sub)}</span></button>`).join("");
}

// A Cognition chip that opens the Codex, for the Cognitions this system belongs to
function emoCogChip(id) {
  const c = INDEX.find(x => x.id === id);
  if (!c) return "";
  return `<button class="dmg-cog" onclick="setView('codex'); openCodex('${escAttr(id)}')" title="Open ${esc(c.name)} in the Codex">
    <span class="ico">${cogIcon(c)}</span>${esc(c.name)}</button>`;
}
const coreChips = recipe => recipe.map(n => {
  const c = CORE_OF[n];
  return `<span class="emo-core ${c.cls}" title="${esc(n)}">${c.dot} ${esc(n)}</span>`;
}).join("");

function emoTable(list) {
  return `<div class="tbl-wrap"><table class="tbl emo-tbl">
    <thead><tr><th>Emotion</th><th>Made of</th><th>DC</th><th>Answers</th><th>What it is</th></tr></thead><tbody>` +
    list.map(e => {
      const tw = twinOf(e);
      return `<tr><td><strong>${esc(e.name)}</strong>${tw ? `<i class="emo-twin" title="Same recipe — intent decides which you get">shares ${esc(tw.name)}'s recipe</i>` : ""}</td>
        <td class="wrap">${coreChips(e.recipe)}</td><td>${emoDC(e)}</td>
        <td class="${e.good ? "emo-vile-t" : "emo-good-t"}">${esc(e.counters)}</td>
        <td class="wrap">${esc(e.desc)}${!e.good && VILE_GRIP[e.name] ? ` <span class="t">seal: ${esc(VILE_GRIP[e.name])}</span>` : ""}</td></tr>`;
    }).join("") + `</tbody></table></div>`;
}

function renderEmo() {
  const host = document.getElementById("emoBody"); if (!host) return;
  const ref = state.emoRef || "overview";
  const hd = (title, desc) => `<div class="cdx"><div class="cdx-hd"><div><h1>${title}</h1><p class="cdx-desc">${desc}</p></div></div>`;
  let h = "";

  if (ref === "overview") {
    h = hd("Emotion", "One of the primordial threads from which all sentient life is woven — the soul's language, and the first sign of sentience.") +
      `<div class="cdx-sec"><div class="cdx-note"><p>Every creature that bears a soul can feel, and feeling is what lifts instinct into will. To feel is to be; to deny emotion is to hollow oneself. Emotion governs not only how mortals perceive the world, but how the world perceives them.</p></div></div>
      <div class="cdx-sec"><h2>How the system fits together</h2><div class="cdx-defs">
        <div class="cdx-def"><b>Five Primals</b><span>Joy, Sadness, Anger, Fear and Disgust are irreducible and universal. Every other feeling is a blend of them, the way every colour is a blend of a few.</span></div>
        <div class="cdx-def"><b>Complex Emotions</b><span>Two or three Primals combined with intent. <strong>Good intent makes a Virtuous emotion, evil intent a Vile one</strong> — and several recipes make one of each, so intent is the whole difference.</span></div>
        <div class="cdx-def"><b>Vile Emotions are fuel</b><span>They are the psychic fuel of curses, soul degradation and the Nightmare creature type. Every Nightmare has a <strong>Root Vile Emotion</strong> that decides its powers and its prey.</span></div>
        <div class="cdx-def"><b>Emotional Alchemy</b><span>Extraction, Dissect, Craft and Infuse — the four workings that move emotion between creatures, vessels, weapons and spells. Identification is the fifth, and the only one open to everyone.</span></div>
        <div class="cdx-def"><b>The gate</b><span><strong>Only a creature attuned to the Emotion Cognition can Extract, Dissect, Craft or Infuse.</strong> Emotion Identification is trained perception, not magic, and stays open to anyone.</span></div>
        <div class="cdx-def"><b>Vessels</b><span>An emotion out of a creature must go into gold or obsidian at once, or it fades — or lashes out.</span></div>
      </div></div>
      <div class="cdx-sec"><h2>The Cognitions that work it</h2><p class="cdx-rings">Emotion holds the Alchemy; each Primal harvests its own feeling into a vessel once per seal, without the check.</p>
        <div class="dmg-cogs">${["emotion", "joy", "sadness", "anger", "fear", "disgust"].map(emoCogChip).join("")}</div></div>`;
  }

  if (ref === "primals") {
    h = hd("The Primals of the Heart", "Five raw archetypes, irreducible and universal across every sentient creature.") +
      `<div class="cdx-sec"><div class="emo-primals">` + EMO_CORE.map(c =>
        `<div class="emo-primal ${c.cls}"><b>${c.dot} ${esc(c.name)}</b><p>${esc(c.desc)}</p>
          <span>In a seal — ${esc(c.seal)}</span>${emoCogChip(c.key)}</div>`).join("") + `</div></div>
      <div class="cdx-sec"><h2>Reading a recipe</h2><div class="cdx-defs">
        <div class="cdx-def"><b>Two or three</b><span>A Complex Emotion is two or three Primals, and a Primal may repeat — Despair is Sadness twice, Hope is Fear twice lit by Joy.</span></div>
        <div class="cdx-def"><b>Intent decides</b><span>Balance and Prejudice are both Fear + Disgust. Justice and Jealousy are both Anger + Sadness. The Crafting check's <strong>Alignment Modifier</strong> is what separates them.</span></div>
        <div class="cdx-def"><b>Depth is difficulty</b><span>Two Primals: DC 25. Three: DC 30. A Pure Virtuous or Vile essence is DC 35 or higher, and only a level 17 Emotion wielder can hold one.</span></div>
      </div></div>`;
  }

  if (ref === "alchemy") {
    h = hd("Emotional Alchemy", "Five actions. Four of them need the Emotion Cognition; the fifth is just paying attention.") +
      `<div class="cdx-sec"><h2>The check</h2><div class="cdx-note">
        <p><strong>1d20 + Alignment Modifier + ability modifier</strong> — your Good Modifier for Virtuous work, your Evil Modifier for Vile. Wisdom for empathic shaping, Charisma for expressive channelling, Intelligence for precise or ritual work. <em>A wielder of the Emotion Cognition may use their Verum Modifier in place of the whole bonus.</em></p></div></div>
      <div class="cdx-sec"><h2>The five actions</h2><div class="tbl-wrap"><table class="tbl emo-tbl">
        <thead><tr><th>Action</th><th>What it does</th><th>DC</th><th>Time</th></tr></thead><tbody>
        <tr><td><strong>Identification</strong><i class="emo-twin">open to all</i></td><td class="wrap">Read a creature within 30 ft. <strong>10+</strong> its dominant Primal · <strong>15+</strong> two layered, or an emerging Complex · <strong>20+</strong> names the Complex Emotion and senses its cause · <strong>25+</strong> spots dissonance, a lie, a concealed feeling · <strong>nat 20</strong> a glimpse of its Greatest Wish.</td><td>—</td><td>Action</td></tr>
        <tr><td><strong>Extraction</strong></td><td class="wrap">Draw an emotion out of a creature, dream, soul remnant or cursed object within touch, into a vessel.</td><td>Core 20 · Dual 25 · Triple 30 · Pure 35+</td><td>10 min</td></tr>
        <tr><td><strong>Dissect</strong></td><td class="wrap">Break a stored Complex Emotion back into its Primals. Vessels only — never a living creature.</td><td>The emotion's DC</td><td>5 min</td></tr>
        <tr><td><strong>Craft</strong></td><td class="wrap">Fuse Primals with Good or Evil intent into a Virtuous or Vile emotion.</td><td>The emotion's DC</td><td>5 min</td></tr>
        <tr><td><strong>Infuse</strong><i class="emo-twin">no check — attunement is the gate</i></td><td class="wrap">Pour a stored emotion into a weapon you or a creature within 5 ft holds (<strong>bonus action</strong>), or into a spell as you cast it (<strong>reaction</strong>). Lasts <strong>10 minutes</strong> and is spent only when it <strong>purifies</strong> — ordinary hits don't consume it.</td><td>—</td><td>Bonus action / reaction</td></tr>
      </tbody></table></div>
      <div class="cdx-note" style="margin-top:11px"><p><strong>Infusions per long rest: your Proficiency Bonus</strong>, and you may hold that many at once. An infused weapon counts as magical and deals an extra <strong>1d6</strong> of the emotion's kind — radiant for Virtuous, necrotic for Vile — on top of whatever the emotion itself does.</p></div></div>
      <div class="cdx-sec"><h2>When it goes wrong</h2><div class="cdx-defs">
        <div class="cdx-def"><b>Failure</b><span>The working fails. Extraction can't be retried on that source until after a rest; the emotions themselves survive.</span></div>
        <div class="cdx-def"><b>By 5 or more</b><span>The emotion destabilises and is <strong>lost</strong> — destroyed on a Dissect or a Craft, tainted beyond use on an Extraction.</span></div>
        <div class="cdx-def"><b>Natural 1</b><span>Backlash. A Surge of Emotion: psychic damage, emotional instability, or dream-warping, by the emotion's nature.</span></div>
        <div class="cdx-def"><b>In combat</b><span>Every DC rises by <strong>+5</strong> — emotions are chaotic under stress. A level 5 Emotion wielder ignores this, and extracts as an action.</span></div>
      </div></div>`;
  }

  if (ref === "vessels") {
    h = hd("Emotion Vessels", "An emotion outside a soul must be held at once, or it fades — or lashes out.") +
      `<div class="cdx-sec"><h2>The only two materials</h2><div class="cdx-defs">
        <div class="cdx-def"><b>Gold coins</b><span>One emotion each, no more. Cheap, portable, stable — the common vessel for Primals.</span></div>
        <div class="cdx-def"><b>Obsidian</b><span>Resonates with dreams and emotional weight. It holds by the rarity of the worked object.</span></div>
      </div></div>
      <div class="cdx-sec"><div class="tbl-wrap"><table class="tbl emo-tbl">
        <thead><tr><th>Obsidian item</th><th>Capacity</th></tr></thead><tbody>
        <tr><td>Common</td><td>1 emotion</td></tr><tr><td>Uncommon</td><td>2</td></tr><tr><td>Rare</td><td>3</td></tr>
        <tr><td>Very Rare</td><td>4</td></tr><tr><td>Legendary</td><td>5</td></tr></tbody></table></div>
        <div class="cdx-note" style="margin-top:11px"><p>Nothing else works. Attempting to store emotion in any other material fails immediately, and the emotion is gone.</p></div></div>
      <div class="cdx-sec"><h2>In the builder</h2><p class="cdx-rings">Emotion's <strong>Creation</strong> Ring makes true vessels — one capacity higher than the material allows, spendable by anyone you name, and at its height an <strong>Emotion Shard</strong> that lends Infusion to the unattuned and refills each dawn.</p>
        <div class="dmg-cogs">${emoCogChip("emotion")}</div></div>`;
  }

  if (ref === "virtuous") {
    h = hd("Virtuous Emotions", "Twenty-four. Crafted from the Primals with good intent, and the only thing that cures a Nightmare.") +
      `<div class="cdx-sec">${emoTable(EMO_VIRTUOUS)}</div>`;
  }
  if (ref === "vile") {
    h = hd("Vile Emotions", "Twenty-four. “Each a crack in the soul. Each a seed of the Night.”") +
      `<div class="cdx-sec"><div class="cdx-note"><p>Vile Emotions are corrupted emotional truths strong enough to infect dreams, warp Cognitions and birth Nightmares. They are the fuel of curses and soul degradation: every Nightmare has a <strong>Root Vile Emotion</strong>, and failing a save against an effect that matches it usually costs <strong>Dream Exhaustion or maximum hit points</strong>.</p></div>${emoTable(EMO_VILE)}</div>`;
  }

  if (ref === "counters") {
    h = hd("Emotional Counters", "Every Vile emotion has one Virtuous answer. This table is what purification runs on.") +
      `<div class="cdx-sec"><div class="tbl-wrap"><table class="tbl emo-tbl">
        <thead><tr><th>Vile</th><th></th><th>Virtuous</th><th>Why</th></tr></thead><tbody>` +
        EMO_VILE.slice().sort((a, b) => a.name.localeCompare(b.name)).map(v => {
          const g = EMO_VIRTUOUS.find(x => x.name === v.counters);
          return `<tr onclick="openEmo('vile')"><td class="emo-vile-t"><strong>${esc(v.name)}</strong></td><td>→</td>
            <td class="emo-good-t"><strong>${esc(v.counters)}</strong></td><td class="wrap">${esc(g ? g.desc : "")}</td></tr>`;
        }).join("") + `</tbody></table></div></div>`;
  }

  if (ref === "purification") {
    h = hd("Nightmare Purification", "A Nightmare is made of Vile emotion. Answer all of it, and what is left is not a corpse — it is a survivor.") +
      `<div class="cdx-sec"><div class="cdx-note"><p>Purification is the <strong>hard</strong> way to win a fight, never the fast one. It runs in rounds beside the ordinary business of combat, it cannot be rushed by bringing more friends, and it only pays out at the end.</p></div></div>
      <div class="cdx-sec"><h2>The procedure</h2><div class="cdx-defs">
        <div class="cdx-def"><b>Roots</b><span>Every Nightmare has <strong>one to three Root Vile Emotions</strong>, which decide its powers and its prey. Each Root holds <strong>Charges</strong> by the Nightmare's standing — see the table below.</span></div>
        <div class="cdx-def"><b>Strip a charge</b><span>Hit it with a weapon or spell infused with the <strong>Virtuous Emotion that counters that Root</strong>: one charge falls away, the infusion is spent, and a soft Virtuous light marks the impact. A <strong>critical hit</strong>, or a strike carrying a <strong>Pure</strong> Virtuous Emotion, strips <strong>two</strong>.</span></div>
        <div class="cdx-def"><b>Two limits</b><span>At most <strong>one charge per creature per round</strong>, and at most <strong>one charge per Root per round</strong>. A large party can work several Roots at once, but no Root can be burst down.</span></div>
        <div class="cdx-def"><b>Lash Out</b><span>The first time each round a Root loses a charge, the Nightmare immediately makes one attack, or uses one reaction ability, against whoever stripped it. <strong>Once per round per Nightmare</strong>, not once per Root.</span></div>
        <div class="cdx-def"><b>It will resist</b><span>A Nightmare with Legendary Resistance may spend one to negate a charge — <strong>once per Root</strong>, no more. A negated charge still <strong>uses that Root's slot for the round</strong>.</span></div>
        <div class="cdx-def"><b>What carries it</b><span>An infusion rides one delivery: a <strong>weapon</strong> (bonus action), a <strong>spell or seal</strong> (reaction as you cast — an Area seal still strips only one charge), or an <strong>Eidon</strong> as it is forged. A creature only needs attunement to Emotion to <em>create</em> an infusion, never to swing one — which is how Ignition users take a full part.</span></div>
        <div class="cdx-def"><b>Don't know the Root?</b><span><strong>Emotion Identification</strong> as an action: <strong>20+</strong> names one Root, <strong>25+</strong> names two. No preparation required — but it costs you the turn.</span></div>
      </div></div>
      <div class="cdx-sec"><h2>Charges per Root</h2><div class="tbl-wrap"><table class="tbl emo-tbl">
        <thead><tr><th>Nightmare</th><th>Charges each Root</th><th>Counter-hits to unroot it</th></tr></thead><tbody>
        <tr><td>Demi Nightmare</td><td>1</td><td class="wrap">1–3</td></tr>
        <tr><td>Nightmare</td><td>2</td><td class="wrap">2–6 · about 3 rounds</td></tr>
        <tr><td>Greater or Named</td><td>3</td><td class="wrap">3–9 · about 4 rounds</td></tr>
        <tr><td><strong>Primal Nightmare</strong> <span class="t">Pure Roots</span></td><td>5</td><td class="wrap">5–15 · five rounds at the very least, with the whole party infused</td></tr>
      </tbody></table></div></div>
      <div class="cdx-sec"><h2>Unrooted</h2><div class="cdx-defs">
        <div class="cdx-def"><b>When the last Root falls</b><span>The Nightmare is <strong>Unrooted</strong>: it loses every ability tied to its Vile Emotions and any Legendary Resistances it has left, it can't regain hit points, and its <strong>current hit points are halved, once</strong>. Then it takes its turn — to flee, to beg, or to spend everything it has left.</span></div>
        <div class="cdx-def"><b>Cured, not slain</b><span>While it is Unrooted, dropping it to <strong>0 hit points cures it</strong> — freed from torment. But <em>freed</em> is not <em>restored</em>: see The Waking.</span></div>
        <div class="cdx-def"><b>Finish the work</b><span>If the fight ends while it still lives and Unrooted, <strong>its Roots grow back after a long rest</strong> — the same emotions, and it remembers who tried.</span></div>
      </div></div>
      <div class="cdx-sec"><h2>The Waking</h2><p class="cdx-rings">What a cured Nightmare becomes. Most of the time it is one of the first two.</p><div class="cdx-defs">
        <div class="cdx-def"><b>It vanishes peacefully</b><span>The default. The torment ends, the shape unmakes itself, and what was borrowed goes back to the Night.</span></div>
        <div class="cdx-def"><b>It remains as a dream guardian</b><span>If it was born of the dream rather than made from a person — or if someone offers it a purpose in the moment of the cure — it may stay as it is, no longer owned by the emotion that made it.</span></div>
        <div class="cdx-def"><b>It reclaims who it was</b><span><strong>Possible, never automatic.</strong> Only if all three hold: <strong>(1)</strong> there is something to return to — the person still lives, or their body or soul is recoverable; <strong>(2)</strong> someone present knew them and <strong>names them aloud</strong> as the last charge falls; <strong>(3)</strong> the freeing strike carried the Virtuous Emotion countering their <strong>first</strong> Root — the one that took them. Then the dreamer makes a <strong>Dream save</strong> against the Nightmare's own DC: on a success they wake as themselves, remembering everything the Nightmare did; on a failure they wake alive, but something didn't come back — a memory, a face, a skill, a year. The table decides what is missing, and it doesn't return on its own.</span></div>
        <div class="cdx-def"><b>A Primal was never a person</b><span>It cannot reclaim an identity it never had. It may only vanish, or be bound as a guardian — and binding one is a story in itself.</span></div>
      </div></div>
      <div class="cdx-sec"><h2>In the builder</h2><p class="cdx-rings">Emotion's <strong>Virtuous Infusion</strong> hands infusion to a whole party without spending anyone's own uses; the one-charge-per-creature-per-round limit still applies. Its Tier IV spends a Pure Virtuous Emotion for two charges a hit.</p>
        <div class="dmg-cogs">${emoCogChip("emotion")}${emoCogChip("nightmare")}</div></div>`;
  }

  host.innerHTML = h + `</div>`;
}
