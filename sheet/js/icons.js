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
