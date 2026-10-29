// The sheet's iconography.
//
// Font Awesome, because this app already speaks it: every Cognition in `cognitions/index.json`
// carries an `fa` name, and arcanum.html already loads 6.5.2 from cdnjs. A second icon system on
// the fifth page would be a second thing to keep in step for no gain.
//
// Names are mapped here rather than written into the markup, so "the Wounds icon" is one decision in
// one place — and a glyph can be changed without hunting through four render functions.

export const ICONS = {
  // vitals
  hp: "heart",
  maxHp: "heart-circle-plus",
  tempHp: "shield-heart",
  // The two things that happen to hit points at a table, on the vitals panel itself. Plain minus
  // and plus rather than a cracked heart: `wounds` already wears that glyph on the same screen,
  // and these two sit beside the words anyway.
  damage: "minus",
  heal: "plus",
  more: "ellipsis",
  ac: "shield-halved",
  speed: "shoe-prints",
  initiative: "bolt",
  hitDice: "dice-d6",
  deathDC: "skull",
  // The two halves of a death save, so the pips are not colour alone
  dsOk: "check",
  dsNo: "xmark",
  concentration: "brain",
  passive: "eye",
  saveDC: "bullseye",
  attack: "hand-fist",
  condition: "circle-exclamation",
  // What the world's harm is worth against you, and what you can see with. `ac` already wears the
  // half shield, so the whole one is the defences and the three standings are told apart by their
  // own glyph as well as their colour — a chip that said "Fire" in red and "Fire" in green would be
  // one glance away from being read backwards at a table.
  defence: "shield",
  resistant: "shield-halved",
  immune: "shield",
  vulnerable: "triangle-exclamation",
  senses: "eye-low-vision",
  // Inspiration is a star on a sheet in a campaign called Once Upon a Star.
  inspiration: "star",

  // the campaign's own tracks
  wounds: "heart-crack",
  injuries: "kit-medical",
  exhaustion: "battery-quarter",
  dreamExhaustion: "moon",
  dream: "moon",
  honor: "scale-balanced",
  fate: "dice-d20",
  round: "hourglass-half",
  rest: "bed",
  effect: "wand-magic-sparkles",
  // The two states every effect is in, and the one distinction the sheet repeats everywhere: a
  // thing that is simply true of you, and a thing that runs out.
  lasting: "infinity",
  timed: "hourglass-half",
  // Flags that used to be tickboxes. Each is a square that lights up, named in its tooltip.
  needsAttunement: "lock",
  dreamWalk: "cloud-moon",
  dawn: "sun",
  dusk: "mountain-sun",
  crit: "burst",
  action: "bolt-lightning",
  levelUp: "arrow-up-right-dots",
  subclass: "sitemap",
  choice: "list-check",

  // panels
  spells: "wand-sparkles",
  gear: "shirt",
  character: "user",
  // the portrait's two doors: open the plate whole, or go and pick a different one
  seeWhole: "expand",
  pickPlate: "images",
  compendium: "book",
  dice: "dice",
  cognition: "circle-nodes",
  grimm: "diamond",
  ignition: "fire",
  paragon: "certificate",
  attunement: "link",

  // equipment slots
  "slot.head": "hat-wizard",
  "slot.face": "glasses",
  "slot.neck": "gem",
  "slot.shoulders": "feather",
  "slot.back": "wind",
  "slot.chest": "shirt",
  "slot.arms": "hand-fist",
  "slot.hands": "mitten",
  "slot.ring1": "ring",
  "slot.ring2": "ring",
  "slot.ring3": "ring",
  "slot.ring4": "ring",
  "slot.waist": "link",
  "slot.legs": "socks",
  "slot.feet": "shoe-prints",
  "slot.tail": "wave-square",
  "slot.wings": "dove",
  "slot.horn": "crown",
  "slot.mainHand": "khanda",
  "slot.offHand": "shield-halved",
  "slot.ammunition": "box-archive",
};

// `aria-hidden` on every one of them: the icon always sits beside a word, so a screen reader that
// announced it as well would read every number twice.
//
// A <span>, not Font Awesome's customary <i>, because this sheet got there first: `.tile i`,
// `.stat i`, `.trk i` and a dozen more already style <i> as the small uppercase caption beside a
// number, and those selectors beat `.fa-solid` on specificity — an <i> icon inside a tile came out
// as a blank box in Space Grotesk. Font Awesome does not care which element carries the class.
export const icon = (name, cls = "") =>
  `<span class="fa-solid fa-${ICONS[name] || name} ic${cls ? " " + cls : ""}" aria-hidden="true"></span>`;

// ── the six dice, as shapes ─────────────────────────────────────────────
// The one place Font Awesome cannot carry this sheet: the free set has `dice-d6` and `dice-d20` and
// nothing else, so a row of six die buttons would be four d6es wearing different numbers. These are
// polygons instead — point-up triangle, square, diamond, pentagon, and two hexagons told apart by
// their rotation — with the die's own name inside, which is what actually identifies it. The shape
// is recognition at a glance; the label is the answer.
const DIE_SHAPE = {
  d4: "12,2 21.5,19 2.5,19",
  d6: "3.5,3.5 20.5,3.5 20.5,20.5 3.5,20.5",
  d8: "12,1.5 22,12 12,22.5 2,12",
  d10: "12,1 22,8.6 18.5,20.9 5.5,20.9 1.5,8.6",
  d12: "23,12 17.5,21.5 6.5,21.5 1,12 6.5,2.5 17.5,2.5",
  d20: "12,1 21.5,6.5 21.5,17.5 12,23 2.5,17.5 2.5,6.5",
};
export const dieShape = die => DIE_SHAPE[die] || DIE_SHAPE.d6;

// `currentColor` throughout, so a die inherits whatever the button around it is doing — held, empty,
// hovered, or the accent when it is the character's own.
// `dieg`, not `die`: `.die` is already the box a ROLLED face is printed in (pop.js's rollHtml), and
// two unrelated things wearing one class is a bug waiting for whoever restyles either of them.
export const dieIcon = (die, cls = "") =>
  `<svg class="dieg ${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <polygon points="${dieShape(die)}" fill="none" stroke="currentColor" stroke-width="1.6"
      stroke-linejoin="round"></polygon>
    <text x="12" y="${die === "d4" ? 17 : 12}" text-anchor="middle" dominant-baseline="middle"
      font-size="${die.length > 2 ? 7.5 : 9}" fill="currentColor">${die.slice(1)}</text>
  </svg>`;
