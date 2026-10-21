# World Map — Ephemer

> **DM-only for now** (Juan, 2026-10-21). The hub card is hidden from players, the server turns
> them away from every `/map/` path, and `locations.json` answers them 403 — the card being hidden
> is a convenience, the server is the boundary. Opening it to the table is **two lines**: the role
> check in the `/map` gate and the one in the locations route. The per-place `secret` / `revealed`
> machinery underneath is already built and working, so the day those come out, players get
> exactly what they should and nothing more.

The third section of the app, beside the Arcanum Veritas builder and the Grimm Companion.
Leaflet on `CRS.Simple`: no projection, no tile server, no latitude — a flat plane where the
world is the gazetteer's **100 × 48 frame** and the map is a single image stretched across it.

## The frame

`X` runs 0–100 west to east, `Y` runs 0–48 north to south, origin at the image's **northwest
corner**. That is the grid defined in `Worldbuilding/Ephemer/World Map Reference.md`, so the
distance and travel-time arithmetic in that note applies here unchanged.

Leaflet counts Y upward and the gazetteer counts it downward. Everything crossing that line goes
through `toLL` / `fromLL` in `js/map.js` and nowhere else.

Coordinates are **fractions of the image**, which is the point — see *Replacing the map* below.

## Why every pin starts hollow

`server/map-locations.json` carries the gazetteer's coordinates, and **they are wrong for this
art**. They were transcribed from an older render (`Ephemer_2024.png`) that drew Vestur about a
third narrower and set Austur further east. Checked against the current image:

| Place | Seeded | Actually | Off by |
|---|---|---|---|
| Aurus | (7, 12) | NW peninsula | right |
| Anerolt | (15, 10) | the mountain ring sits near (22, 7) | ~7 gu |
| Lionhearth | (26, 21) | eastern lobe centre near (37, 21) | ~11 gu |
| Tivan | (37, 16) | lands on the mainland; the island is near (52, 15) | ~15 gu |
| Rusted Justicar | (80, 22) | the sword sits near (75, 22) | ~5 gu |

No single rescale fixes it: Vestur wants roughly ×1.5 while Austur wants to move *west*, so the
two continents were laid out independently between renders.

So a pin keeps its seeded coordinate and draws **hollow** until the DM drags it where it belongs.
Dropping it writes a row to `map_locations` and that row is the truth from then on. The seed file
is never edited — it stays the fallback that *Reset to estimate* returns to.

**When the pins are set**, use *Copy coordinates* in the DM pane and paste the table back into
`World Map Reference.md`, replacing the v0 estimates. That note has been waiting for exactly this
since it was written: *"coordinates are v0 eyeball estimates (±1 gu); pixel-refinable if the PNG
is added to the vault."*

## What the DM can do

**Add a place.** *+ Add a place* in the DM pane, then click the map — on empty ground or straight
on top of an existing pin, both work. The form asks for a name, a kind, a kingdom, a terrain
bracket and a description. Kinds come from `kinds[]` in `js/data.js`; adding one there needs at
most a new `.pin.shape-*` rule in `css/map.css`.

**A new place starts hidden from players** (Juan's call, 2026-10-21) — somewhere added mid-session
is usually somewhere the table has not earned yet, and a place revealed a beat early cannot be
un-revealed. Untick the box to make it public, or reveal it later from the detail pane. The
default holds for the API too: a `POST` that omits `secret` gets a hidden place. **Editing an
existing place never changes its visibility**, whichever way it is already set.

**The party is a kind.** `party` draws as a breathing ring rather than a settlement dot, because it
is the one pin that moves every session. Make one, then drag it as they travel.

**Edit anything.** Select a place and press *Edit*. For a seeded place the row written is a
**delta** — change one word of a description and the other fields still come from
`map-locations.json`, so a later re-seed flows through everything untouched. *Reset to seed* drops
the row and the place goes back to exactly what the file says; it only appears for seeded places,
because a place the DM added has no file behind it.

**Archive, and only then delete.** *Archive* puts a place away without destroying it; archived
places are listed at the foot of the DM pane and one click brings them back. A place the DM added
can be deleted outright with the `×` beside it there — but only from the archive, so it takes two
deliberate steps. A seeded place can never be deleted, only reset.

## The sidebar

Places are reached through their **kingdom**, not as one long list: a grid of squares, each with
the kingdom's colour down its edge, its name, what it holds (*"6 settlements · 1 point"*) and how
many are still on a gazetteer estimate. Click one for its places; the search box cuts across all of
them at once. **No Man's Land** is a kingdom like any other here — the Freetides, the Scorched
Lands, Austur. **Kingdom of Xornas** is the monster city in the Underworld; almost none of it is
drawn on a surface map, so expect its places to sit on their entrances.

Below a rule sit the two categories that **cut across** kingdoms, drawn as dashed outlines rather
than territorial bars because they are not territory:

- **Points of Interest** — every place that is not somewhere people live, from every kingdom at
  once, each labelled with the kingdom it falls in.
- **The Party** — where they stand.

- **Subterranean** — the Underworld. What a surface map can show of Xornas, Styx, Lethe, Zeros or
  Villie is a **way down**, not the place, so these draw as a **triangle pointing down** and never
  sit under Settlements however large the city at the bottom of the stairs turns out to be.

Inside a kingdom the same split applies as headings: **Settlements** never share a heading with
**Points of Interest** or **Subterranean**. Which is which comes from `group` on each entry in
`kinds[]` (`js/data.js`) — `capital` through `village` are settlements; `site`, `landmark`,
`island`, `poi` and `ruin` are points; `subterranean` is its own. Move a kind between groups there
and the headings, the kingdom tile's wording and the cross-cutting category all follow; `groups[]`
holds the names and the `cross: true` flag that decides which get a category of their own.

The down-triangle is built from CSS borders, so it has **no box** — every box property the base
`.pin` sets has to be unset for it, and `.pin.sel`'s selection ring is replaced by a `drop-shadow`
glow that follows the silhouette. Those overrides have to come *after* `.pin.sel` in the
stylesheet to win on order.

An **empty kingdom is shown to the DM only**, so a newly added one can be found and filled without
showing the table the shape of a kingdom that holds nothing yet.

## Replacing the map

Drop the new render over `img/ephemer.jpg` and set `image.pixelWidth` in `js/data.js` to its
width. Nothing else moves — **no pin shifts**, because coordinates are fractions of the image, not
pixels. `pixelWidth` only decides how far past 1:1 the viewer may zoom before the art goes soft
(`overzoom` is the allowance, in zoom levels).

This only holds for a **re-render of the same composition**. A map that moves a coastline is a new
map, and the pins on it would have to be set again.

### The master is not the served file

Juan's master is **15500 × 7500, 48.6 MB PNG**, and it must not be served. A single
`imageOverlay` that size decodes to roughly **465 MB of pixels** — it would stall a laptop and
kill a phone outright. What ships is a downscale: **6000 × 2903 JPEG, 1.96 MB on the wire,
~70 MB decoded**, which every device can carry and which still resolves individual settlement
icons at full zoom.

Aspect is preserved to within 0.1% (2.0667 against the frame's 2.0833), so the fractional
coordinates are unaffected.

If deeper zoom is ever wanted, the answer is **tiling, not a bigger single file** — slice the
master into a 256px pyramid and swap `L.imageOverlay` for `L.tileLayer` with the same
`CRS.Simple` bounds. Capped at an 8192px top level that is roughly 680 tiles. Everything else in
this section, the coordinates included, would carry over untouched.

## Files

| Path | What it is |
|---|---|
| `index.html` | The page. |
| `vendor/` | **Leaflet 1.9.4, vendored** — `leaflet.js`, `leaflet.css` and the five PNGs the CSS refers to. 165 KB in all. |
| `js/data.js` | `window.MAP_CONFIG` — image, the political colour key, the travel table. No secrets, so it is a plain static file. |
| `js/map.js` | All of the behaviour. |
| `css/map.css` | Restates the tokens from `css/app.css`; pulls in nothing. |
| `img/ephemer.jpg` | The map, 6000 × 2903, 1.96 MB. A **serving copy** — see below. |
| `../server/map-locations.json` | The 45 seeded places. **Not in this folder on purpose** — see below. |

Everything the DM changes or adds lives in the `map_locations` table, never in the JSON:

| Column | Means |
|---|---|
| `x`, `y`, `placed` | Where the pin actually sits, and whether anyone has set it |
| `name`, `nation`, `kind`, `terrain`, `note` | **NULL = take the seed's answer.** Set = override just that field |
| `secret`, `revealed` | Hidden from players unless not secret, or secret and revealed |
| `custom` | No seed behind this row — the row is the whole truth |
| `archived` | Put away. Nothing is deleted by archiving |

## Why the seed file lives in `server/`

An exact route plus a static mount over the same folder is the shape of the hole already logged
against the Grimm book: `/grimms//js/data.js` and eight other spellings miss the exact route and
reach the folder handler, which returns the unfiltered file to any signed-in account. Keeping the
seed outside every served directory closes that off **by construction** rather than by
out-guessing the URL parser. `/map//locations.json`, `/map/%2Flocations.json` and
`/map/locations%2Ejson` all 404.

`/map/locations.json` is served by one route that filters per account: a location marked `secret`
is withheld outright from players until the DM reveals it, never sent and hidden in the page.
Right now only **Vesper Gulch** is marked secret, because its position is a guess awaiting a
ruling — the guess is the secret, not the place.

## Leaflet is vendored, not fetched

`vendor/leaflet.js` and `vendor/leaflet.css` are the published unpkg bundle for **1.9.4**,
verified byte for byte against Leaflet's own SRI hashes:

```
leaflet.js   sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=
leaflet.css  sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=
```

`vendor/images/` holds the five PNGs `leaflet.css` refers to by relative path (the layers-control
and default-marker icons). Nothing here uses the default marker — pins are `divIcon`s — but they
are vendored anyway so the stylesheet is never left pointing at a missing file.

Upgrading means replacing those files and bumping the `?v=` in `index.html`. Nothing else knows
the version.

**The one external request left on this page is Google Fonts**, shared with the rest of the app.
The map itself is fully offline; without a network the typography falls back to `system-ui` and
Georgia, which the tokens in `css/map.css` already specify. Vendoring the two woff2 families
would close that too, and would want doing for all three sections at once rather than here alone.

## The travel calculator

**It is folded shut by default** (Juan, 2026-10-21) — measuring a leg is an occasional thing and
it was taking a third of the sidebar on every visit. Asking for a leg from a place's detail pane
opens it, so the answer never lands somewhere the person who asked cannot see.

Straight-line distance in grid units, times a route factor, times the scale constant, divided by
the pace. It reproduces the note's worked example exactly — Tryad → Jägenberg, 10.3 gu, ×1.3 =
13.4 gu, 134 mi.

**Terrain = Mixed country** is what that example actually assumed (18 mi/day → 8 days). *From the
ends* takes the mean of the two endpoints' brackets, which scores a leg between two difficult
places as difficult the whole way — blunt, and 12 days for the same journey.

The scale constant is **`S = 12.6` mi/gu, ruled 2026-10-21** and no longer provisional. It is
derived rather than chosen: the canon anchor is Vesper Gulch → Tryad in three days, Juan placed
Vesper Gulch at (9.48, 29.34) and ruled the party walked it through difficult desert, and
36 miles over 2.86 gu of path gives 12.6. Feed it back and the leg reads 12.0 mi/day — exactly
the pace ruled.

It lives in `js/data.js → travel.milesPerUnit` and is mirrored in `World Map Reference.md`.
**Change both together.** The box in the Travel pane overrides it for one calculation without
touching the ruling.
