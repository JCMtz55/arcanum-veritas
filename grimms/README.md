# Grimm Companion
### Once Upon a Star ★ — a player's tracker and reference for their Grimm

A sibling of the seal composer: open `grimms/index.html` (or `/grimms/` on GitHub Pages). It covers **player Grimms only**: Gate of Caelum, Ouroboros Vigil, Víðarr, White Rabbit, Makoa, Thanatos, Rage of the Tiger and Peco Peco.

No install and no build step to use it. Unlike the composer it doesn't `fetch()` anything, so it also works when you double-click the file.

## Views

| View | What it does |
|---|---|
| **Sheet** | Your Grimm, in one column — its own tracker, then the abilities — with **Grimm Slots** and the **Round tracker** in a side bar that stays in view while the rest scrolls (they move above the sheet on a narrow screen). Grimm Slots as pips (spend, restore, Long Rest), forcing the Grimm for a temporary slot (+1 Exhaustion), Dream Exhaustion, Familiar form. The Three Chains as icons beside the Grimm's name — shown, not edited. The ability loadout sized by stage (Passive / Active / Special), where swapping mid-combat counts as an Exhausting Exchange. Each ability's full text, with your PB and level pinned next to the words, and a **Use** button that spends its slots and starts its duration. A round tracker. |
| **Reality Shift** *(sheet, when revealed)* | Runs the Shift, not just the page. **Activate** (refused while you carry Dream Exhaustion) starts a 10-round clock in the round tracker and puts *On Activation* in front of you; while it holds, a strip gives the rounds left, the **Escape DC** (20 + Dream mod + PB, −2 per crit you take, with a stepper), the bonus to your save DCs, a **+2 Grimm Slots** button for the start of your turn and a **Lair Action** that re-arms each round. The page is laid out as *On Activation · Passive Effects · Reality Actions · Lair Action · On Collapse* — the last only while it runs — with Actions and the Lair Action open by default, and the domain's description, any appendix and the shared rules kept under **Reference**. The tenth round, or **End the Shift**, collapses it: *On Collapse* is shown and **+3 Exhaustion / +5 Dream Exhaustion** applied. Hidden until the DM reveals it: the text isn't in the copy of the data a player is served. |

The Companion holds nothing the DM sets. The **Three Chains**, each Grimm's **Reality Shift** (revealed or hidden) and which of its **abilities** may be composed live on the **Admin page** — `admin.html`, reached from the Ephemer front page when the DM is signed in — and are only read here. Denying an ability takes it out of that player's loadout and pool at once; revealing a Shift puts it on their sheet and in the Compendium. Served from a folder instead of the Ephemer server, nothing is fetched: every ability is open, the chains are whatever the data file says, and no Reality Shift is shown.
| **Compendium** | Every player Grimm's full ability pool, stances, soul stones, servants and — for White Rabbit — the Umbra Platoon's five troop types with their numbers at your level. |
| **Party** | Grimm Tokens (max set by table size), the Vinculum pair-action matrix with each action's text, and a Grimm Sight roller. |
| **Rules** | Rules of the Grimm, stages, slots, abilities, the Three Chains, Fate, Vinculum, soul shards and the adventurer CR table. *(Harmony is deliberately left out — the table doesn't use it. Add `Lore/Grimm Harmony.md` back to `RULES` in the builder to bring it back.)* |

Each Grimm's sheet also has its own tracker:

- **Gate of Caelum**: two cards. **Recruited souls** (below the abilities) is the roster: the vault's servants (Silence) plus every soul the player **recruits** by adding its statblock — written in the app, or pasted from a 5e source (*Read the numbers from the text* lifts AC, HP, Speed, CR and the ability scores out of the paste). Each recruited soul holds one servant slot until it is released. **Commander of Souls** is the field: **Summon** picks a recruited soul (optionally as the Elite), tracks its HP and attuned items and opens its statblock; **Dismiss** sends it back to Limbo with its HP, **Fell** sends it back to answer again at full HP (and prompts Arcane Repose). Summon spends the Grimm Slots (1, Elite 2). The Elite picks its Armament and gets Servant's Will and Passive Regeneration buttons. Also: an **Arise** helper (DC, Max CR with slots, extra attempts), **Relinquish Command** (ally, health pool, return), a **Harvest** calculator (one Int check against CR + 10 each, shards by the drop table), Shadow Exchange's d6 slot refund, the summon limit, soul shards and Fake Death.
- **Ouroboros Vigil**: carried soul stones against the 2 × Int limit, Soul Resonance, Spirit Strike cooldowns, Soul Chimera DC, Soul Artifice items.
- **Víðarr**: Ash Curses and stacks per target, detonation rolls, the Blood of the Damned counter, Shackle Break upgrades.
- **White Rabbit**: troops, jobs and job charges, with the traits they add up to. Each job is a vault note of its own (`White Rabbit/Troops/`), so it carries its **card art**, its actions and its corporeal numbers. While **Hollownest** holds — or when the DM ticks **Corporeal** — the tiles become cards: **HP** against the job's own `base + per × level` maximum with a bar, **AC** and **Speed**, the round's **Action** and **Reaction** ticks (two for a Bulwark's *Unbroken Guard*), charge pips, the job's dice, and **Last Stand**, which keeps a troop at 0 HP standing until the end of your next turn and then kills it if nobody healed it. *Platoon acts* marks them all at once for the Umbra Platoon Bonus Action; *Let them act again* is the Lair Action's **Vorpal Ambush Strike**. A Short Rest re-forms the fallen.
- **Makoa**: Defiant Aegis resistances, Snapback and wave numbers.
- **Thanatos**: Hysteria and Lovely Death max-HP math.
- **Rage of the Tiger**: active stances and the Fury of Conquest stripes.
- **Peco Peco**: speed, teleport and tempest numbers.

When a Shackle Break's 3 rounds run out, the sheet applies its Exhaustion and rolls the Dream save.

Everything a player tracks lives in their own browser (`localStorage`). **Export backup** / **Import** on the Sheet move it between devices.

## Updating from the vault

The rules text is generated from the Obsidian vault, so when a Grimm page changes:

```bash
node grimms/tools/build-data.mjs
```

This rewrites `grimms/js/data.js`. **Restart the Ephemer server afterwards** — it reads that file once at start-up to filter the Reality Shifts per reader. By default it reads `OneDrive/Documents/Once Upon a Star/Once Upon a Star ★`. To use another vault, pass its path as the first argument. The party list (who owns which Grimm, and their starting chain count) is at the top of the script.

**White Rabbit's troop types** are read the same way, from `Player Grimms/White Rabbit/Troops/` — one note per job, listed in `TROOP_ORDER` for the order they parade in, with `Universal Traits.md` held out as the block they all share. A job's note owns its numbers, and the builder reads them off its **Stats table** rather than its prose, because a troop's HP is a formula:

```
| **Sigil**   | INF |
| **Role**    | Front-line striker |
| **HP**      | 50 + (5 × your level) |
| **AC**      | 20 |
| **Speed**   | 40 ft., climb 20 ft. |
| **Charges** | War Cry ×2 |
```

Its **card art** is the first `![[plate]]` on the note, named `troop_<Job>.png` in `resources/`; a missing one is reported at the end of a build and the card falls back to the sigil. Actions come from the `###` headings under `## Actions` and `## Reactions`, and a charge named in the table attaches to the action of the same name. Adding a sixth job is adding a sixth note.

The builder only opens player-facing pages. It never reads the DM Chain Tracker, NPC or Aeon Grimms, or the separate *Parted Gates* Shackle Break (and its servant forms). To reveal one, add its file to the script. Víðarr's *Arm of the Blood Keeper* is included because it's written on Víðarr's own page.

The eight player **Reality Shifts** in `Reality Shifts/Players/` are built in, listed in `SHIFTS` at the top of the script, along with `Lore/Reality Shift.md` for the rules they share. *Solemn Temperance - Mad King Mode* (a secret oath) is not among them.

Each Shift is cut into the beats the sheet's card runs, and all eight pages now follow the same shape:

```
# Name
*Grimm: [[Grimm]] · Owner: [[Player]]*
> epigraph
![[image]]
**Description.** …

## On Activation
**The Beat.** resolved once, as it opens

## While Active
### Passive Effects
**Name.** true throughout
### Reality Actions
**Name** *(Action).* what a turn can be spent on
### Lair Action *(Initiative 20 · solo-Shift only)*
**Name.** lead-in — choose one:
- **Option.** …

## On Collapse
**Name.** what it costs and leaves behind

---
## Appendix: Anything Else
```

Inside a section an entry is a paragraph that starts **`**Name.**`** or **`**Name** *(Action).*`**, a **`- **Name.** `** bullet, or a sub-heading. A bullet whose bold run has no full stop inside it (`- **cannot be turned** by any effect`) stays part of its entry, so lists read normally. Scaling lines are written `*Scaling.* …` in italics so they don't start a new entry. Anything under its own `##` that isn't one of those five beats — an Appendix, a trap library, statblocks — is kept and shown under **Reference** on the card. They are still DM-gated at run time — the server cuts an unrevealed Shift out of the data before sending it to a player — so the gating only holds when the app is served by the Ephemer server, not from a folder.

## Files

```
grimms/
  index.html
  css/app.css
  js/data.js      ← generated — don't edit
  js/md.js        ← small markdown renderer for vault text
  js/core.js      ← state, rules numbers, helpers
  js/sheet.js     ← the Sheet
  js/panels.js    ← per-Grimm trackers
  js/views.js     ← Compendium, Party, Rules
  js/app.js       ← command bar, boot (loads last)
  tools/build-data.mjs
```
