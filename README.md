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

## Cognition Status

In `index.json`, each cognition has a `ready` flag:
- `true` — JSON file exists, cognition is fully playable
- `false` — Placeholder only; shown as **SOON** in the sidebar and cannot be selected

### Ready Cognitions (33)
Acid · Air · Apathy · Balance · Beast · Blood · Bones · Civilization · Control · Corruption · Creation · Death · Disaster · Dream · Fire · Flesh · Fortune · Growth · Hate · Heroism · Ice · Isolation · Life · Lightning · Metal · Misfortune · Nightmare · Nullity · Pain · Power · Protection · Shadow · Soul

### Pending Cognitions (in index, no JSON yet)
Light · Darkness · Time · Space · Mind · Storm · Earth · Entropy · Binding · Void · Calm

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
- `complementEffects` `type` must match exactly: `"Offensive"`, `"Supportive"`, `"Control"`, `"Creation"`, or `"Utility"`

### 2. Register it in index.json
Add an entry to the `cognitions` array in `index.json`:

```json
{
  "id": "your-id",
  "name": "Your Name",
  "icon": "✨",
  "opposing": "opposing-id",
  "ready": true
}
```

Set `"ready": false` if you want it to appear as a placeholder before the JSON is finished.

---

## Prompt for AI-Assisted Cognition Creation

Paste this into any Claude chat to convert an Obsidian markdown cognition file into a ready-to-use JSON:

> Convert the following Obsidian markdown file into a JSON cognition for the Arcanum Veritas Builder. Follow this exact structure: `id`, `name`, `icon`, `opposing`, `description`, `savingThrow`, `damageType`, `verumEffects` (with `offensive`, `supportive`, `control` sub-arrays, each effect having `name`, `description`, and `tiers` as an array of exactly 4 strings scaling weakest to strongest), and `complementEffects` (each with `name`, `type`, `description`, `effect`, and `upgrades` as an array of 2 strings for Level 5+ and Level 11+). Tiers should scale in scope and qualitative power, not just numbers. Tone: mythic but mechanically precise.
>
> **[PASTE MARKDOWN FILE HERE]**

---

## The Summary Card

The card at the bottom of the build has two modes:

- **PLAY** — a designed card, not a text dump. A hero block leads with the numbers you actually roll (to-hit or save DC, damage, range/radius/duration) as chips, followed by auto-derived tags for every condition, denial and resource the build can impose — read off the `mech` layer, so they update as you change Sigils. Then the Core Verum at your live tier, then each Sigil as its own row with its source labelled. Collapses to the seal's single roll: **ON HIT** for a Direct Attack, or **ON A FAILED \<ability\> SAVE** for everything else, with every Complement listed beneath it. Shows only the tiers your character has actually reached, resolves every formula into real numbers (attack bonus, DC, `1d8` instead of "one damage die of the primary effect's type"), drops boilerplate the header already states, and groups riders by how they resolve: **ON HIT** (no save) first, then **SAVES** grouped by ability. Roughly two-thirds shorter than the full text.
- **FULL** — the complete reference: every tier up to your level, full effect prose, the Ring's rules note. Use it when building or levelling.

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
| Self | No roll · caster only · the only Ring for internal effects |
| Ally | Willing creatures in range · full healing each |
| Aura | Creatures of your choice within radius · concentration |
| Ward | **Reaction** · absorb damage · Verum on the attacker (or the protected creature) · never both absorb and Verum temp HP |

### Control
| Ring | Delivery |
|------|----------|
| Targeted | Each target saves vs Verum DC · **success = no effect** |
| Area | Zone · save on appearance and start of turn inside · **success = nothing this turn** · concentration · Shape |

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
- Print layout is supported — use browser print to export a spell card

---

*Arcanum Veritas Builder · Once Upon a Star ★ Campaign · Ephemer Worldbuilding Project*
