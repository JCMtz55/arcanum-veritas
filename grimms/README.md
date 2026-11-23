# Grimm Companion
### Once Upon a Star ★ — a player's tracker and reference for their Grimm

A sibling of the seal composer: open `grimms/index.html` (or `/grimms/` on GitHub Pages). It covers **player Grimms only**: Gate of Caelum, Ouroboros Vigil, Víðarr, White Rabbit, Makoa, Thanatos, Rage of the Tiger and Peco Peco.

No install and no build step to use it. Unlike the composer it doesn't `fetch()` anything, so it also works when you double-click the file.

If `js/data.js` does not arrive — a connection that dropped, a session that ran out — the page says **"The Grimm book did not load"** and offers to try again, rather than going blank. Nothing tracked is lost: it is in this browser and, for the shared parts, on the server.

## Views

| View | What it does |
|---|---|
| **Sheet** | Your Grimm, in one column — its own tracker, then the abilities — with **Grimm Slots** and the **Round tracker** in a side bar that stays in view while the rest scrolls (they move above the sheet on a narrow screen). Grimm Slots as pips (spend, restore, Long Rest), forcing the Grimm for a temporary slot (+1 Exhaustion), Dream Exhaustion, Familiar form. The Three Chains as icons beside the Grimm's name — shown, not edited. The ability loadout sized by stage (Passive / Active / Special), where swapping mid-combat counts as an Exhausting Exchange. Each ability's full text, with your PB and level pinned next to the words, and a **Use** button that spends its slots and starts its duration. A round tracker. |
| **Reality Shift** *(sheet, when revealed)* | Runs the Shift, not just the page. **Activate** (refused while you carry Dream Exhaustion) starts a 10-round clock in the round tracker and puts *On Activation* in front of you; while it holds, a strip gives the rounds left, the **Escape DC** (20 + Dream mod + PB, −2 per crit you take, with a stepper), the bonus to your save DCs, a **+2 Grimm Slots** button for the start of your turn and a **Lair Action** that re-arms each round. The page is laid out as *On Activation · Passive Effects · Reality Actions · Lair Action · On Collapse* — the last only while it runs — with Actions and the Lair Action open by default, and the domain's description, any appendix and the shared rules kept under **Reference**. The tenth round, or **End the Shift**, collapses it: *On Collapse* is shown and **+3 Exhaustion / +5 Dream Exhaustion** applied. Hidden until the DM reveals it: the text isn't in the copy of the data a player is served. |

The Companion holds nothing the DM sets. The **Three Chains**, each Grimm's **Reality Shift** (revealed or hidden) and which of its **abilities** may be composed live in **Admin › Grimms** — the `admin/` section, reached from the Ephemer front page or the ★ tool strip when the DM is signed in — and are only read here. Denying an ability takes it out of that player's loadout and pool at once; revealing a Shift puts it on their sheet and in the Compendium. Served from a folder instead of the Ephemer server, nothing is fetched: every ability is open, the chains are whatever the data file says, and no Reality Shift is shown.
| **Compendium** | Every player Grimm's full ability pool, stances, soul stones, servants and — for White Rabbit — the Umbra Platoon's five troop types with their numbers at your level. |
| **Party** | Grimm Tokens (max set by table size), the Vinculum pair-action matrix with each action's text, and a Grimm Sight roller. |
| **Rules** | Rules of the Grimm, stages, slots, abilities, the Three Chains, Fate, Vinculum, soul shards and the adventurer CR table. *(Harmony is deliberately left out — the table doesn't use it. Add `Lore/Grimm Harmony.md` back to `RULES` in the builder to bring it back.)* |

Each Grimm's sheet also has its own tracker:

- **Gate of Caelum**: two cards. **Recruited souls** (below the abilities) is the roster: the vault's servants (Silence) plus every soul the player **recruits** by adding its statblock — written in the app, or pasted from a 5e source (*Read the numbers from the text* lifts AC, HP, Speed, CR and the ability scores out of the paste). Each recruited soul holds one servant slot until it is released. **Commander of Souls** is the field: **Summon** picks a recruited soul (optionally as the Elite), tracks its HP and attuned items and opens its statblock; **Dismiss** sends it back to Limbo with its HP, **Fell** sends it back to answer again at full HP (and prompts Arcane Repose). Summon spends the Grimm Slots (1, Elite 2). The Elite picks its Armament and gets Servant's Will and Passive Regeneration buttons. Also: an **Arise** helper (DC, Max CR with slots, extra attempts), **Relinquish Command** (ally, health pool, return), a **Harvest** calculator (one Int check against CR + 10 each, shards by the drop table), Shadow Exchange's d6 slot refund, the summon limit, soul shards and Fake Death.
- **Ouroboros Vigil**: carried soul stones against the 2 × Int limit, Soul Resonance, Spirit Strike cooldowns, Soul Chimera DC, Soul Artifice items.
- **Víðarr**: Ash Curses and stacks per target, detonation rolls, the Blood of the Damned counter, Shackle Break upgrades.
- **White Rabbit**: troops, jobs and job charges, with the traits they add up to. Each job is a vault note of its own (`White Rabbit/Troops/`), so it carries its **card art**, its actions and its corporeal numbers. While **Hollownest** holds — or when the DM ticks **Corporeal** — the tiles become cards: **HP** against the job's own `base + per × level` maximum with a bar, **AC** and **Speed**, the round's **Action** and **Reaction** ticks (two for a Bulwark's *Unbroken Guard*), charge pips, the job's dice, and **Last Stand**, which keeps a troop at 0 HP standing until the end of your next turn and then kills it if nobody healed it. *Platoon acts* marks them all at once for the Umbra Platoon Bonus Action; *Let them act again* is the Lair Action's **Vorpal Ambush Strike**. A Short Rest re-forms the fallen. White Rabbit's Shackle Break puts a **sixth, secret troop** on the field — one the DM reveals, listed in `TROOP_SECRET` in the builder and cut out of a player's `data.js` until the `shackle` toggle is on — and while it stands every job trait, action and charge is **suspended** in exchange for one flat banner.
- **Makoa**: Defiant Aegis resistances, Snapback and wave numbers.
- **Thanatos**: Hysteria and Lovely Death max-HP math.
- **Rage of the Tiger**: active stances and the Fury of Conquest stripes.
- **Peco Peco**: speed, teleport and tempest numbers.

When a Shackle Break's 3 rounds run out, the sheet applies its Exhaustion and rolls the Dream save.

Everything a player tracks lives in their own browser (`localStorage`). **Export backup** / **Import** on the Sheet move it between devices.

## Whose sheet it is

The DM says who holds which Grimm, in **Admin › Players › Grimm**, and the Companion asks the server (`/api/me`) rather than the browser. A player the DM has assigned opens on their own Grimm and has no switcher: the bar carries its name, the eight-card chooser never appears, and `pickGrimm()` refuses anything else. The same answer drives the character sheet's Grimm card, so the two can no longer disagree.

Two cases keep the old chooser, because the server has not actually been told anything:

- **The DM**, who holds no Grimm and may be running any of them at the table.
- **A player with no assignment.** The server falls back to matching the account name against the Grimm's `short` and hands that down as a *guess* (`grimmAssigned: false`) — the page opens there but still lets them move, so a guess cannot lock anyone out of their own Grimm before the DM has been round the party. A Grimm already assigned to someone else is never guessed for a second account.

The remembered choice now travels with the account that made it, so a shared laptop no longer opens on whoever used it last. A saved state from before this existed is adopted once rather than thrown away.

Served from a folder instead of the Ephemer server, nothing is fetched and the chooser behaves exactly as it always did.

This is about clarity at the table, not secrecy: a player's Servants have always been stored per account, and the book itself (minus unrevealed Shifts and Breaks) is served to everyone. What it ends is a player opening someone else's sheet and spending their slots.

The **character sheet** reads the same answer and now lists the Grimm's **abilities** on its own Grimm panel — the pool, grouped and with the DM's denials and the Shackle Break reveal obeyed, using this app's `js/md.js` to render the text.

## The Grimm Slots are shared

The slots are **one tracker on two screens**. The stage, the slots spent, the temporary ones bought by forcing the Grimm and Familiar form are kept in a row (`grimm_live`, one per player per Grimm); everything else this page holds — the round tracker, the loadout, the effects, the Servants' charges — is still only here.

A slot spent on either screen is spent on the other. Each page re-reads the row when you come back to it, on **both** `visibilitychange` and `focus` — the second because the arrangement this is for is the two pages open side by side, where neither is ever hidden and `visibilitychange` never fires. Last write wins, which is the right promise for numbers one player changes from one screen or the other.

The sheet has the pips and nothing else: **Force the Grimm** and the round are here. Served from a folder with no server behind it, none of this is fetched and the slots are this browser's alone, exactly as they always were.

**Both rests work from either screen.** A **Long Rest** taken on the character sheet gives back every slot — the forced ones too — and stamps the row with when it happened; everything else a long rest does is this page's own rules, so the Companion reads that stamp when it next syncs and finishes its half: the effects, the round, the Grimm's own hook and the Servants' charges, with a line saying where the rest came from. A **Short Rest** gives back no slots at all, so its stamp *is* the whole of it — the Companion reads it and refills the charges whose rule says a short rest refills them. Taken here, each does the same and stamps the row itself, so the sheet knows the rest has been had.

A stamp is acted on **once** and only while it is fresh, so a browser opening a Grimm it has not seen for a week does not replay a rest over a fight in progress.

## The round is the table's

While the table is in combat, a strip across the top of **every** tool says so and says which round — it comes with `js/tools.js`, so the front page, the composer, this page, the sheet, the map, the Library, Initiative and Admin all carry it.

This page no longer counts its own rounds. The DM's board writes the round onto every character sheet at the table, and the Companion **replays** the rounds that went by: one `nextRound()` each, so durations tick down and a **Shackle Break ends on the round it should** rather than on the round somebody remembered to press a button. A new fight ends the one this page was holding and starts again at one — except on a browser's very first sight of any fight, where what it is holding is real and is left alone.

**Next round** is still here. A DM who forgets theirs should not leave seven people unable to count.

## The level and the Dream mod are the character's

The bar's **Level** and **Dream mod** used to be a stepper and a text box, kept in whichever browser the player was holding. They are read from the character now and cannot be typed here, because neither is the player's to set and both decide what the Grimm can do:

- the **level** sets the proficiency bonus, and so every DC the Grimm has; it is substituted into the ability text wherever it reads *"Grimm User's Level"*; and it fixes **Gate of Caelum's** roster size and Max CR and **Víðarr's** Blood threshold
- the **Dream mod** sets the save that closes a **Shackle Break** and a **Reality Shift's** escape DC

The level is the DM's own column, written only through the Admin page; the Dream mod is the character's **DRE** score through the sheet's engine, modifiers included. Change either and the Companion follows when you come back to it. With no character on the account — or served from a folder — the dials come back and work as they always did.

## Exhaustion belongs to the character

**Exhaustion** and **Dream Exhaustion** are not this page's numbers. They are the two tracks on the player's **character sheet** — the same pair, kept once. The sheet is the home because it is where the rules are: the 0–6 ladder, the 0–8 Dream ladder with its roll penalties, the rest rules and the level-8 save. This page had two steppers and no rules at all.

So forcing the Grimm, an Exhausting Exchange and a Shackle Break closing write the **character's** sheet, and the card names whose it is. The ceilings are the sheet's: a Break that adds 2 and 3 past the top is clamped there and the answer comes back, so the number shown is always the number the character actually carries. Recovery is the sheet's too — a Long Rest here restores the **slots** and nothing else.

With no character on the account yet, or served from a folder, the steppers keep working on this browser's own numbers and the card says so.

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
