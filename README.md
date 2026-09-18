# Arcanum Veritas Builder
### Once Upon a Star ★ — Magic System Reference Tool

---

## Overview

The **Arcanum Veritas Builder** is a single-file HTML tool for drawing seals — spells composed in the moment through the Arcanum Veritas system. A seal is a **Core Cognition** (what it is), a **Composition / Ring** (what shape it takes), and **Complement Cognitions** (how it's modified). The tool calculates every Ring's numbers from slot level, shows the Core's Verum Effect tiers from character level, and produces a copyable summary.

The tool runs entirely in the browser — no server, no install, no internet required.

---

## File Structure

```
arcanum_veritas_builder.html   ← The tool (open this in any browser)
cognitions/
  index.json                   ← Master list of all cognitions + ready status
  fire.json
  ice.json
  soul.json
  ... (one .json per cognition)
README.md                      ← This file
```

The HTML file and the `cognitions/` folder must stay in the same directory.

---

## How to Use

### Step 0 — Set your numbers
Enter **Verum Mod** (your highest ability score modifier) and **Dream Mod** under the Character Level slider. The builder derives the rest — proficiency bonus from level, **Seal attack** = Prof + Verum Mod, **Verum DC** = 8 + Prof + Verum Mod + Dream Mod — and resolves them into the summary card so there is no math left at the table.

### Step 1 — Set Slot Level
Use the **Slot Level** slider (1–9). This determines:
- How many cognitions you can select (1 Core + Slot−1 Complements; **Coven Drawing** adds up to 3 more)
- Every Ring's numbers — damage, healing, absorb, size, CR, duration

### Step 2 — Set Character Level
Use the **Character Level** slider (1–20). This determines your **Tier**:

| Tier | Character Level |
|------|----------------|
| Tier 1 | Lv 1–4 |
| Tier 2 | Lv 5–10 |
| Tier 3 | Lv 11–16 |
| Tier 4 | Lv 17+ |

The Core Cognition's Verum Effect will display **all tiers up to and including your current tier**. Verum Effects scale by **character level, never by slot** — the slot sets the Ring, your level sets the Core.

### Step 3 — Select a Core Cognition
Click any ready cognition from the sidebar list. This becomes the spell's **Core** — it defines the damage type, saving throw, and the Verum Effect pool.

Use the **search bar** to filter cognitions by name.

### Step 4 — Choose Composition, Subtype, Shape, Manner & Verum Effect
Only the Rings the Core can actually fill are offered. A Ring is shown when the Core has that Verum pool, or when the pool it falls back to is written — so a Cognition with no Control pool shows no Control Ring, and Creation may offer only *Construct* (which borrows Offensive) while *Structure* and *Object* (which borrow Control) stay hidden. Nothing is greyed out; it simply isn't there.

- **Composition** (Offensive / Supportive / Control / Creation / Utility) — the Ring's family
- **Subtype** — the Ring itself (Direct Attack, Area, Field, Infusion, Self, Ally, Aura, Ward, Targeted, Control Area, Structure, Construct, Object, Utility)
- **Shape** — for any Ring with a radius: Sphere (at a point in range), Cone (2× radius, from your hand), Line (4× radius, 5 ft wide, from your hand)
- **Manner of Drawing** — Standard, Rite (10 min; double duration or size), Inscribed (1 min; fires on a trigger later), Coven (up to 3 allies each add a Sigil)
- **Verum Effect** — the Core's effect from the Ring's pool. If the Cognition defines a `creation` / `utility` pool it is used; until then Structures and Objects fall back to the Core's **Control** pool, Constructs to **Offensive**, Utility to **Supportive**

### Step 5 — Add Complement Cognitions (Sigils)
If your slot level is 2 or higher, you may add Complement Cognitions (one per slot level above 1). Each contributes a **Complement Effect** from the Ring's pool. With **Coven** selected, up to three extra slots open and are labelled **COVEN SIGIL**.

### Step 6 — Review the Spell Card
The card shows:
- Full stat block (damage/healing/range/duration by slot)
- Core Verum Effect tiers (all tiers unlocked at your character level)
- Complement Effects for each added cognition
- A copyable **Summary** block for notes or session use

---

## Domains

Every Cognition carries a `category` in `index.json`, and both rails group and filter by it. Eight domains, sized 3–9, no dumping ground:

| Domain | | What it is |
|---|---|---|
| **Elemental** | 9 | Acid · Air · Earth · Fire · Ice · Lightning · Metal · Toxin · Water — matter and force |
| **Cosmical** | 3 | Gravity · Space · Time — the shape of creation itself |
| **Corporeal** | 5 | Beast · Blood · Bones · Flesh · Pain — blood, bone and beast |
| **Vital** | 5 | Corruption · Death · Growth · Life · Soul — the living and the unliving |
| **Psychic** | 4 | Apathy · Hate · Heroism · Isolation — feeling turned outward |
| **Umbral** | 5 | Nightmare · Nullity · Shadow · Silence · Void — absence, erasure, the unmade |
| **Fate** | 4 | Balance · Disaster · Fortune · Misfortune — what happens to you |
| **Dominion** | 7 | Carnage · Civilization · Control · Craft · Power · Protection · Speed — will imposed on the world |

Domain is not the same question as how strong a Cognition should be, so it isn't the same field. **`"favorite": true`** marks the players' favourites — **Death · Nightmare · Nullity · Soul** — which are held to a higher power bar wherever they sit by domain. They show a ★ in the rail and a *★ player favourite* tag in the Codex.

A **domain picker** sits above the search box in both the Composer and Codex rails, showing each domain with its count (`Corporeal · 6`) and taking the domain's colour once chosen. The two rails share one filter, so narrowing in the Composer narrows the Codex too. `All domains` clears it. Filter and search compose: *Corporeal* + `o` gives Blood and Bones.

Category lives in `index.json` rather than the individual Cognition files on purpose. The rail draws from the one file loaded at boot; per-Cognition JSON is fetched only when you click something. Storing it per-file would mean fetching all 36 up front just to draw a sorted sidebar.

## Cognition Status

In `index.json`, each cognition has a `ready` flag:
- `true` — JSON file exists, cognition is fully playable
- `false` — Placeholder only; shown as **SOON** in the sidebar and cannot be selected

### Ready Cognitions (35)
Air · Apathy · Beast · Blood · Bones · Civilization · Control · Corruption · **Craft** · Death · **Earth** · Fire · Flesh · Fortune · **Gravity** · Growth · Hate · Heroism · Ice · Isolation · Life · Lightning · Metal · Misfortune · **Nightmare** · Nullity · Pain · Power · Protection · Shadow · Soul · **Space** · **Time** · **Void** · **Water**

### Held Back (7) — JSON written, `ready: false`
Acid · Balance · Carnage · Disaster · Silence · Speed · Toxin

Every one of these has a complete `.json` file on disk; they are flagged off in the index, not missing. Flip `"ready": true` to bring one in.

### Not Yet Written
Light · Darkness · Mind · Storm · Entropy · Binding · Calm — no index entry and no file.

---

## Adding a New Cognition

### 1. Create the JSON file
Place a new `.json` file in `cognitions/` following this structure:

```json
{
  "id": "lowercase-id",
  "name": "Display Name",
  "icon": "🔥",
  "opposing": "opposing-cognition-id",
  "description": "Comma-separated themes.",
  "savingThrow": "Constitution",
  "damageType": "Fire",

  "verumEffects": {
    "offensive": [
      {
        "name": "Effect Name",
        "description": "One evocative sentence.",
        "tiers": [
          "Tier 1 (Lv 1–4) effect text.",
          "Tier 2 (Lv 5–10) effect text.",
          "Tier 3 (Lv 11–16) effect text.",
          "Tier 4 (Lv 17+) effect text."
        ]
      }
    ],
    "supportive": [],
    "control": []
  },

  "complementEffects": [
    {
      "name": "Complement Name",
      "type": "Offensive",
      "description": "One sentence.",
      "effect": "Base effect text.",
      "upgrades": [
        "Level 5+: upgraded effect.",
        "Level 11+: further upgraded effect."
      ]
    }
  ]
}
```

**Rules:**
- Only include `verumEffects` categories that have at least one effect. Optional `creation` and `utility` arrays are supported: when present, Creation and Utility Rings use them; when absent, they fall back to the mapping in Step 4
- `complementEffects` `type` may also be `"Creation"` or `"Utility"`; those win for their Ring, otherwise the fallback pool's complements are offered
- `tiers` must always be an array of exactly 4 strings
- **`cost`** (optional) is for a Cognition that charges for its use — Nightmare's Dream save, for instance. Give it `text` (the full rule) and `card` (the short version). It prints as a warning box on the PLAY card, a `COST` line in the copyable text, its own block in FULL, and a *Cost of use* section at the top of the Codex entry, since it's a roll the player makes every time.
- `complementEffects` `type` must match exactly: `"Offensive"`, `"Supportive"`, `"Control"`, `"Creation"`, or `"Utility"`

**Offensive Verums — read this before writing one.**

- **Offense is optional.** Nine Cognitions have no Offensive pool — Apathy, Civilization, Control, Growth, Heroism, Isolation, Life, Misfortune, Silence — and the builder simply doesn't offer them an Offensive Ring. Only write one if the Cognition's own description says it hurts things. Note the side effect: a Cognition with neither an Offensive nor a Creation pool can't make **Constructs**, since Constructs borrow the Offensive pool.
- **An offensive Verum changes what the attack *is*, not how big it is.** Pick a shape: **escalation** (Power's Rampage, Carnage's Bloodfrenzy), **propagation** (Lightning's Chain Spark, Fire's Wildfire, Water's The Flood), **denial** (Air's Razoredge, Power's Overwhelming Force, Nullity's Erasure), **conversion** (Blood-Surge, Protection's Answering Blow), or **payoff** against a set-up target (Ice's Shatterpoint).
- **A bonus-dice ladder is the exception, and it's paid for.** Only three Cognitions use one, because for them raw output *is* the fantasy: **Fire** +2/4/6/8 (the furnace — the biggest ladder, so its riders are only burn ticks), **Earth** +1/2/4/5 (weight — lighter, because it buries), **Ice** +1/2/3/4 (payoff — the real damage comes from Frost Stacks and Restrained targets). Every tier spends roughly **3 / 6 / 9 / 12 dice' worth** of value; a Verum that adds riders adds fewer dice.
- **One Seal, One Roll applies to Verum text too.** Never write "must succeed on a Wisdom save" inside a tier — riders land on the seal's own hit or failed save. The only extra d20s allowed are *later* ones on the Core's ability: escaping, or a repeat save to end an ongoing effect.
- **`mech.conditions` is for what you inflict.** An immunity goes in `deny` (it renders as `no fear`); a condition the target must *already have* for a payoff belongs in the text only — listing it under `conditions` shows it on the card as something the seal imposes.

### 2. Register it in index.json
Add an entry to the `cognitions` array in `index.json`:

```json
{
  "id": "your-id",
  "name": "Your Name",
  "icon": "✨",
  "fa": "wand-sparkles",
  "category": "elemental",
  "tier": "III",
  "requires": [ "Growth", "Flesh" ],
  "opposing": "opposing-id",
  "ready": true
}
```

`fa` is a **Font Awesome 6 Free (solid)** icon name — the part after `fa-`, e.g. `skull` for `fa-skull`. Browse them at fontawesome.com/icons with the *Free* and *Solid* filters on; a Pro-only or misspelled name renders as a blank square. The icon is tinted in its domain's colour automatically. `icon` (an emoji) is still required: it's what the rail shows if Font Awesome can't load — offline, or with the CDN blocked. Keep every `fa` unique, so no two Cognitions share a glyph.

`category` must be one of `elemental`, `cosmical`, `corporeal`, `vital`, `psychic`, `umbral`, `fate`, `dominion` — anything else (or a missing field) drops the entry into an **Uncategorised** group at the bottom of the rail rather than hiding it. Add `"favorite": true` only for the players' favourites — it means the Cognition is expected to be strong.

**Tier** comes from the vault's *Cognition Index* — how hard the Cognition is to learn and how much it can bend a scene: `I` Basic · `II` Advanced · `III` Profound · `IV` Absolute · `V` Primordial. Keep it in Roman numerals: the builder already uses *Tier 1–4* for the character-level Verum bands, and the numerals are how the two stay apart. Every Tier III or higher Cognition must also list `requires` — the prerequisite Cognitions, by name, as the Index gives them. A Cognition that embodies one of the Thirteen Divine Laws adds `"divineLaw": "The Universal Law of Time"` (the Law's full name). All three are data only — the builder stores them but does not display them.

Set `"ready": false` if you want it to appear as a placeholder before the JSON is finished.

---

## Prompt for AI-Assisted Cognition Creation

Paste this into any Claude chat to convert an Obsidian markdown cognition file into a ready-to-use JSON:

> Convert the following Obsidian markdown file into a JSON cognition for the Arcanum Veritas Builder. Follow this exact structure: `id`, `name`, `icon`, `opposing`, `description`, `savingThrow`, `damageType`, `verumEffects` (with `supportive` and `control` sub-arrays, plus `offensive`, `creation` and `utility` only where the Cognition genuinely does those things — each effect having `name`, `description`, and `tiers` as an array of exactly 4 strings scaling weakest to strongest), and `complementEffects` (each with `name`, `type`, `description`, `effect`, and `upgrades` as an array of 2 strings for Level 5+ and Level 11+). Tiers should scale in scope and qualitative power, not just numbers. Do not give an offensive Verum a flat "+2/+4/+6/+8 dice" ladder — make it change what the attack does (escalate, spread, deny, convert, or pay off a set-up), and never ask the target for a saving throw inside a tier. Tone: mythic but mechanically precise.
>
> **[PASTE MARKDOWN FILE HERE]**

---

## The Codex

The **Codex** tab reads one Cognition end to end, at rest, away from any particular seal.

Pick a Cognition from the rail and the reader shows its themes, saving throw, damage type and Opposed entry, then every Verum pool it defines — **all four tiers of every effect**, not just the ones your character has reached, with your current tier lit. Each pool is labelled with the Rings that actually draw on it for *that* Cognition, so the fallback map (Creation → Control for Structures and Objects, → Offensive for Constructs; Utility → Supportive) is visible rather than inferred. Below that, every Complement Effect it contributes as somebody else's Sigil, grouped by type, with both upgrade lines.

Formulas resolve against the Verum mod and Dream mod in the command bar, same as the composer. **Print entry** prints the open Cognition on its own.

## The Rings Tab

The **Rings** tab reads one Composition subtype end to end, away from any particular seal — the same tables as the Composition Reference below, but live.

Pick a Ring from the rail (grouped by family: Offensive, Supportive, Control, Creation, Utility) and the reader shows:

- **What it asks for** — the seal attack roll, a saving throw, your weapon attack, or nothing at all, stated per Ring rather than inferred. Plus reaction, concentration and shape flags.
- **Verum pool** — which pool fills this Ring, and what it falls back to when the Cognition has none written. If a Core is selected in the composer, it also says what that Core resolves to.
- **Scaling, all nine slots** — the full table, not just your current row, with formulas resolved against your Verum mod and the live slot lit. Click any row to set the whole tool to that slot.
- **How it resolves** — the Ring's complete rules note, every paragraph, not the one-line excerpt the composer shows.
- **Shape** (where a radius exists to shape) and **Manner of drawing**, with the Manners this Ring forbids struck out and labelled — Rite is not available to Ward or Direct Attack, Inscribed is not available to Ward.

Opening the tab lands on whatever Ring the composer is currently building, so the three tabs stay in step. **Print ring** prints the open Ring on its own.

## Layout

The builder is a three-column workbench, sized for a laptop or tablet.

- **Command bar** (pinned): the Composer / Codex / Rings tabs, slot and level steppers, Verum mod and Dream mod, and the live numbers — to-hit, Verum DC, and how many cognitions you've used of your budget. These never scroll away. Arrow keys nudge the slot; shift+arrows nudge the level.
- **Left rail**: every cognition, grouped under its domain, narrowed by the domain picker above the search box. A selected Keystone is marked `core`, complements `sigil`. Entries grey out when you hit your budget or the cognition isn't written yet.
- **Centre**: the composer — Ring, subtype, shape, manner, Verum effect with its tier ladder, the scaling strip (click any slot to jump to it), and each sigil with its chosen effect.
- **Right**: the seal card. Play or Full, copy, print.

Below 1100px the three columns stack, rail first.

## The Summary Card

The card at the bottom of the build has two modes:

- **PLAY** — a designed card, not a text dump. A hero block leads with the numbers you actually roll (to-hit or save DC, damage, range/radius/duration) as chips. **Sigil dice are counted.** A Complement whose live line reads *"+N dice"* is adding to the roll you are about to make, so the card adds it: dice of the Core's own damage type fold into the headline total (the sub-label shows the working — `14d6 +6d6 +3d6`), and dice of any other type get their own chip labelled with the type and the Sigil that brought it, because resistance cares which is which. Anything a Complement does on its own clock — bleed ticks, terrain, per-turn ramps, riders that land next turn — is *not* folded in; it stays in the rider rows below. Then auto-derived tags for every condition, denial and resource the build can impose — read off the `mech` layer, so they update as you change Sigils. Then the Core Verum with **every tier you have reached, oldest first**, the current one highlighted — tiers accumulate, so all of them apply. Where a later tier gives a bigger number for the same thing (a longer push, a bigger burn), it replaces the smaller one; where a tier restates a dice ladder, the earlier "+N dice" is dropped so it isn't read as extra. Then each Sigil as its own row with its source labelled. Collapses to the seal's single roll: **ON HIT** for a Direct Attack, or **ON A FAILED \<ability\> SAVE** for everything else, with every Complement listed beneath it. Shows only the tiers your character has actually reached, resolves every formula into real numbers (attack bonus, DC, `1d8` instead of "one damage die of the primary effect's type"), drops boilerplate the header already states, and groups riders by how they resolve: **ON HIT** (no save) first, then **SAVES** grouped by ability. Roughly two-thirds shorter than the full text.
- **FULL** — the complete reference: every tier up to your level, full effect prose, a **SIGIL DICE** block listing each Complement's contribution separately, and the Ring's rules note. Use it when building or levelling.

Both copy and print. Note that the PLAY card's compression is text-pattern based — it strips known lead-in phrases and pure-flavour trailing clauses. If an effect ever reads oddly there, check it against FULL, which is never altered.

## Rules of the Seal

**Global numbers**

| | |
|---|---|
| Verum Modifier | your highest ability score modifier |
| Seal attack bonus | Proficiency Bonus + Verum Modifier |
| Verum DC | 8 + Proficiency Bonus + Verum Modifier + Dream Score modifier |
| Saving throw type | set by the Core (its Main Saving Throw) |

**The Premium Rule.** A seal of slot *N* should perform like the best spell of slot *N+1* — before its Verum Effect and Sigils. It costs a slot **and** a use; you get Proficiency Bonus uses per long rest; there are no cantrips.

**One Seal, One Roll.** A seal asks each target for at most one d20 — your seal attack roll, or one saving throw whose ability is set by the **Core**. Every Complement resolves off that single result; a Complement's own saving throw is ignored while it is a Complement. A condition imposed by a Complement lasts only **until the end of the target's next turn**; only the Core's condition runs its full tabled duration.

**Limits.** One Core + (slot − 1) Complements (Coven adds up to 3). Your action, once per turn, never a bonus action — Ward is a reaction. Aura, Field, Control zones, and Constructs concentrate. A seal is immune to *Counterspell* and *Dispel Magic*, suppressed by *Antimagic Field*, and unmade early only by an opposing seal.

**Countering.** Core to Core only (see the Cognition's Opposed entry); the countering slot must be equal or higher; a reaction counter spends a use and a slot; casting as an action and a reaction in the same round costs one level of exhaustion (Dual Use).

---

## Composition Reference

*The **Rings** tab in the tool covers all of this with the full nine-slot tables — this is the paper copy.*

### Offensive
| Ring | Delivery |
|------|----------|
| Direct Attack | One target · seal attack roll · hit = full damage + Verum · crits · Touch variant (5 ft, +1 die) |
| Area | Save · fail = full + Verum · success = half, no Verum · Shape: sphere / cone / line |
| Field | Lingering zone · save on appearance and start of each turn inside · concentration |
| Infusion | Weapon Die on every hit · Core & Complement bonus dice on first hit per turn · riders every hit, one save per rider per turn · Bestowed on an ally's weapon |

### Supportive
| Ring | Delivery |
|------|----------|
| Self | No roll · caster only · the only Ring for internal effects · heals ~1.5× Ally's per-target number, buff runs two slots longer |
| Ally | Willing creatures in range · full healing each · you may be a target, but you heal as a target of Ally, not as a Self · out-totals Self from the 3rd slot up |
| Aura | Creatures of your choice within radius · concentration |
| Ward | **Reaction** · absorb damage · Verum on the attacker (or the protected creature) · never both absorb and Verum temp HP |

### Control
| Ring | Delivery |
|------|----------|
| Targeted | Each target saves vs Verum DC **at disadvantage on that first save** · success = no effect · no concentration · longest reach in the system · repeat saves are rolled normally |
| Area | Zone · save on appearance and start of turn inside · success = nothing this turn · re-asks every turn · denies ground · concentration · Shape |

**Targeted vs Area.** Targeted buys reliability against named creatures — disadvantage on the save, no concentration, and reach a step beyond what a zone can be thrown. Area buys persistence and space — it never rolls at disadvantage, but it asks the question again every turn and does not care how many bodies walk in. Bind a creature, or deny a room.

### Creation
| Ring | Delivery |
|------|----------|
| Structure | Wall / bridge / barrier · HP per 10-ft segment · total cover · Verum on touch |
| Construct | Servant of CR = slot · Core's damage type + Verum on attacks · concentration |
| Object | Tool / weapon / vessel · mundane; +1 at 5th, +2 at 8th · never a magic item |

### Utility
| Tier | Slots | Scope |
|------|-------|-------|
| Minor | 1st–3rd | up to a 3rd-level utility effect |
| Moderate | 4th–6th | up to a 6th-level utility effect |
| Major | 7th–9th | up to a 9th-level utility effect |

### Manners of Drawing
| Manner | Effect |
|--------|--------|
| Rite | 10-minute drawing · double duration **or** double radius/size · not Ward or Direct Attack |
| Inscribed | 1-minute drawing on a surface/object/skin · fires on a trigger within (slot) hours · hold Prof Bonus inscriptions · not Ward |
| Coven | Up to 3 allies who know a Cognition spend a reaction to add a Sigil beyond your budget |

---

## Notes

- The tool has no save state — selections reset on page refresh
- Complement Effects filter to match the Ring's Verum pool automatically (Creation → Control / Offensive for Constructs; Utility → Supportive)
- The **Clear Selection** button at the bottom of the sidebar resets everything
- Print layout is supported — use browser print to export a spell card, **Print entry** in the Codex for a Cognition, or **Print ring** in the Rings tab for a Composition
- No build step, no framework, no bundler. Serve the folder over HTTP — GitHub Pages, Live Server, `python -m http.server` — and it runs. `file://` will not work, because browsers block `fetch()` there

---

*Arcanum Veritas Builder · Once Upon a Star ★ Campaign · Ephemer Worldbuilding Project*
