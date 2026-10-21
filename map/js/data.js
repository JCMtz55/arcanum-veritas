// ═══════════════════════════════════════════════════════════════════════════
//  The World Map of Ephemer — configuration
// ═══════════════════════════════════════════════════════════════════════════
//
// Nothing here is a secret, which is why it can be a plain static file. The
// locations themselves live in map/locations.json, because some of them are the
// DM's to reveal and a file the browser can fetch is a file the table can read —
// the server filters that one before it serves it, exactly as it filters the
// Grimm book's unrevealed Reality Shifts.
//
// THE FRAME. X runs 0..100 west to east, Y runs 0..48 north to south, origin at
// the image's northwest corner. That is the gazetteer's own grid, from
// `Worldbuilding/Ephemer/World Map Reference.md`, so the distance and travel
// arithmetic in that note applies here unchanged.
//
// Coordinates are FRACTIONS of the image, which is the point: swapping
// ephemer.webp for a higher-resolution render of the same composition moves no
// pin at all. Only a recomposed map would. When the upscale lands, raise
// `pixelWidth` below and nothing else changes.

window.MAP_CONFIG = {

  image: {
    src: "img/ephemer.jpg",
    // The painted map fills the file, parchment border and all. Pins are placed
    // against the file, so the border needs no inset — a pin the DM has set is
    // correct by construction, whatever the frame does.
    width: 100,
    height: 48,
    // Native pixel width of the file above. Together with `overzoom` this sets
    // how far past 1:1 the viewer may go before the art turns to mush.
    //
    // This is a serving copy, not the master. Juan's master is 15500 x 7500 and
    // 48.6 MB, which no browser should be asked to hold: a single overlay that
    // size decodes to roughly 465 MB of pixels and would take a phone down. At
    // 6000 it is 1.96 MB on the wire and ~70 MB decoded, which every device can
    // carry, and it still reads individual settlement icons at full zoom.
    // Going further means tiling rather than a bigger single file.
    pixelWidth: 6000,
    overzoom: 1.5,
  },

  // What a place can be. The order is the order the DM's picker shows them in:
  // settlements largest first, then the things that are not settlements at all.
  // `shape` is the pin's silhouette — see .pin in css/map.css.
  //
  // `group` is what the sidebar sorts by. A place where people live is not the
  // same kind of thing as a standing stone or a battlefield, and the list says
  // so: settlements and points of interest never share a heading.
  kinds: [
    { id: "capital",     name: "Capital",           shape: "capital", group: "settlement" },
    { id: "grand-city",  name: "Grand City",        shape: "big",     group: "settlement" },
    { id: "city",        name: "City",              shape: "dot",     group: "settlement" },
    { id: "town",        name: "Town",              shape: "dot",     group: "settlement" },
    { id: "village",     name: "Village",           shape: "small",   group: "settlement" },
    { id: "site",        name: "Site",              shape: "square",  group: "poi" },
    { id: "landmark",    name: "Landmark",          shape: "square",  group: "poi" },
    { id: "island",      name: "Island",            shape: "square",  group: "poi" },
    { id: "poi",         name: "Point of Interest", shape: "poi",     group: "poi" },
    { id: "ruin",        name: "Ruin",              shape: "poi",     group: "poi" },
    // Underworld. What the map can show of Xornas, Styx, Lethe, Zeros or Villie is a way DOWN,
    // not the place itself — so the pin is a triangle pointing down, and these never sit under
    // Settlements however big the city at the bottom of the stairs turns out to be.
    { id: "subterranean", name: "Subterranean",     shape: "down",    group: "subterranean" },
    // The party is a place that moves. It gets its own silhouette so it never reads
    // as geography, and it is the one pin the DM expects to drag every session.
    { id: "party",       name: "The Party",         shape: "party",   group: "party" },
  ],

  // The groups above, as the sidebar names them. `unit` / `units` is the wording on a kingdom's
  // tile; `cross` marks the groups that also get a category of their own spanning every kingdom.
  // `icon` is the glyph on the small square a cross-group gets in the sidebar; `short` is the
  // word under it. Each one echoes that group's pin silhouette, so the square and the map agree.
  groups: [
    { id: "settlement",   name: "Settlements",        unit: "settlement",   units: "settlements" },
    { id: "poi",          name: "Points of Interest", unit: "point",        units: "points",
      cross: true, icon: "◆", short: "Points",       colour: "#B08842" },
    { id: "subterranean", name: "Subterranean",       unit: "way down",     units: "ways down",
      cross: true, icon: "▼", short: "Below",        colour: "#8E4B6E" },
    { id: "party",        name: "The Party",          unit: "party marker", units: "party markers",
      cross: true, icon: "◉", short: "Party",        colour: "#C0553F" },
  ],

  // The political colour key, straight off the gazetteer's table.
  nations: {
    aurus:     { name: "Aurus Government",       colour: "#C9A227", vault: "The Aurus Government" },
    anerolt:   { name: "Council of Anerolt",     colour: "#7A6EA8", vault: "The Council of Anerolt" },
    valentis:  { name: "Kingdom of Valentis",    colour: "#C0553F", vault: "The Kingdom of Valentis" },
    talon:     { name: "Lands of Talon",         colour: "#CC7A33", vault: "The Lands of Talon" },
    temple:    { name: "Grand Temple of Vestur", colour: "#E8E3D7", vault: "" },
    jagenberg: { name: "Clanlands of Jägenberg", colour: "#6E8B97", vault: "The Clanlands of Jägenberg" },
    wollniege: { name: "Wollniege Republic",     colour: "#5FAE4E", vault: "" },
    faenys:    { name: "Faenys Dynasty",         colour: "#4E8C6A", vault: "The Faenys Dynasty" },
    // The Secret Kingdom of Xornas: the monster city Yor Acheron founded in the Underworld,
    // with Styx and Lethe under it. Almost none of it is drawn on a surface map — only a gate
    // here and there — so expect its places to sit on their entrances rather than themselves.
    xornas:    { name: "Kingdom of Xornas",      colour: "#8E4B6E", vault: "Xornas The Hidden Monster City" },
    // Everything that belongs to nobody: the Freetides, the Scorched Lands, Austur, open water.
    // The gazetteer's political key calls this "unclaimed"; at the table it is No Man's Land.
    free:      { name: "No Man's Land",          colour: "#7E8791", vault: "" },
  },

  // The gazetteer's travel arithmetic, kept here so the calculator and the note
  // cannot drift apart. `milesPerUnit` is the single tunable constant the whole
  // scale hangs on.
  //
  // RULED 2026-10-21, and no longer provisional. It is derived, not picked: the
  // canon anchor is Vesper Gulch -> Tryad in 3 days (Ch. 2, Dreams of Violet
  // Sand), and Juan ruled the party walked it through difficult desert. Once he
  // placed Vesper Gulch at (9.48, 29.34) that leg measured 2.20 gu straight,
  // 2.86 gu of path at the 1.3 route factor. Foot through difficult terrain is
  // 12 mi/day, so 36 miles over 2.86 gu gives 12.6 — and the arithmetic closes
  // on itself: at 12.6 the leg reads back as exactly 12.0 mi/day.
  //
  // The old provisional 10 was not merely loose, it was impossible: it made that
  // same leg 9.5 mi/day, slower than the slowest pace on the table below.
  travel: {
    milesPerUnit: 12.6,
    routeFactors: [
      { id: "road",     name: "Roads wind",                  factor: 1.3 },
      { id: "wild",     name: "Trackless wilderness",        factor: 1.5 },
      { id: "straight", name: "Straight line (flight · Aeon Crystal)", factor: 1.0 },
    ],
    paces: [
      { id: "foot",    name: "Foot (normal)",        open: 24, difficult: 12 },
      { id: "forced",  name: "Foot (fast · forced)", open: 30, difficult: 15 },
      { id: "chocobo", name: "Chocobo · mount",      open: 36, difficult: 18 },
      { id: "ship",    name: "Ship (water legs)",    open: 60, difficult: 60 },
    ],
  },
};
