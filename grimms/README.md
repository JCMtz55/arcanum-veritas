# Grimm Companion
### Once Upon a Star ★ — a player's tracker and reference for their Grimm

A sibling of the seal composer: open `grimms/index.html` (or `/grimms/` on GitHub Pages). It covers **player Grimms only**: Gate of Caelum, Ouroboros Vigil, Víðarr, White Rabbit, Makoa, Thanatos, Rage of the Tiger and Peco Peco.

No install and no build step to use it. Unlike the composer it doesn't `fetch()` anything, so it also works when you double-click the file.

## Views

| View | What it does |
|---|---|
| **Sheet** | Your Grimm. Grimm Slots as pips (spend, restore, Long Rest), forcing the Grimm for a temporary slot (+1 Exhaustion), Dream Exhaustion, Familiar form. The Three Chains, with a break log (Grievance / ⟨Molt⟩ / ⟨Scar⟩) and a Dream Saving Throw roller that applies the rules' modifiers. The ability loadout sized by stage (Passive / Active / Special), where swapping mid-combat counts as an Exhausting Exchange. Each ability's full text, with your PB and level pinned next to the words, and a **Use** button that spends its slots and starts its duration. A round tracker. Harmony (optional). The Revive ledger. |
| **Compendium** | Every player Grimm's full ability pool, stances, soul stones and servants. |
| **Party** | Grimm Tokens (max set by table size), the Vinculum pair-action matrix with each action's text, and a Grimm Sight roller. |
| **Rules** | Rules of the Grimm, stages, slots, abilities, the Three Chains, Harmony, Fate, Vinculum, soul shards and the adventurer CR table. |

Each Grimm's sheet also has its own tracker:

- **Gate of Caelum**: servant roster (slots, summon limit, HP, attuned items, elite), soul shards, Fake Death.
- **Ouroboros Vigil**: carried soul stones against the 2 × Int limit, Soul Resonance, Spirit Strike cooldowns, Soul Chimera DC, Soul Artifice items.
- **Víðarr**: Ash Curses and stacks per target, detonation rolls, the Blood of the Damned counter, Shackle Break upgrades.
- **White Rabbit**: troops, jobs and job charges, with the traits they add up to.
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

This rewrites `grimms/js/data.js`. By default it reads `OneDrive/Documents/Once Upon a Star/Once Upon a Star ★`. To use another vault, pass its path as the first argument. The party list (who owns which Grimm, and their starting chain count) is at the top of the script.

The builder only opens player-facing pages. It never reads the DM Chain Tracker, NPC or Aeon Grimms, the Reality Shifts, or the separate *Parted Gates* Shackle Break (and its servant forms). To reveal one, add its file to the script. Víðarr's *Arm of the Blood Keeper* is included because it's written on Víðarr's own page.

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
