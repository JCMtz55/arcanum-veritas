# Arcanum Veritas Builder
### Once Upon a Star ★ — Magic System Reference Tool

---

## Overview

The **Arcanum Veritas Builder** is a single-file HTML tool for constructing and referencing spells cast through the Arcanum Veritas system. It calculates damage, healing, and control values based on slot level and character level, then displays the full Verum Effect chain for the selected Core Cognition.

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

### Step 1 — Set Slot Level
Use the **Slot Level** slider (1–9). This determines:
- How many cognitions you can select (1 Core + Slot−1 Complements)
- The damage, healing, and duration values shown on the spell card

### Step 2 — Set Character Level
Use the **Character Level** slider (1–20). This determines your **Tier**:

| Tier | Character Level |
|------|----------------|
| Tier 1 | Lv 1–4 |
| Tier 2 | Lv 5–10 |
| Tier 3 | Lv 11–16 |
| Tier 4 | Lv 17+ |

The Core Cognition's Verum Effect will display **all tiers up to and including your current tier**, so you can see the full power progression your character has access to. The current tier is highlighted.

### Step 3 — Select a Core Cognition
Click any ready cognition from the sidebar list. This becomes the spell's **Core** — it defines the damage type, saving throw, and the Verum Effect pool.

Use the **search bar** to filter cognitions by name.

### Step 4 — Choose Composition, Subtype & Verum Effect
- **Composition** (Offensive / Supportive / Control) — the spell's intent
- **Subtype** — delivery method (e.g. Direct Attack, Area of Effect, Aura)
- **Verum Effect** — the Core Cognition's special effect applied on hit/fail

### Step 5 — Add Complement Cognitions
If your slot level is 2 or higher, you may add Complement Cognitions (one per slot level above 1). Each complement contributes a **Complement Effect** chosen by composition type.

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
- Only include `verumEffects` categories that have at least one effect
- `tiers` must always be an array of exactly 4 strings
- `complementEffects` `type` must match exactly: `"Offensive"`, `"Supportive"`, or `"Control"`

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

## Composition Reference

### Offensive
| Subtype | Delivery |
|---------|----------|
| Direct Attack | Spell attack roll · hit = full damage + Verum Effect |
| Area of Effect | Save · fail = full damage + Verum Effect · success = half, no Verum |

### Supportive
| Subtype | Delivery |
|---------|----------|
| Self | No roll · caster only |
| Targeted | Willing creatures in range · full healing each |
| Aura | All allies within radius centered on caster |

### Control
| Subtype | Delivery |
|---------|----------|
| Targeted | Each target saves independently · DC = 8 + Prof + Mod |
| Area | Persistent zone · creatures save on entry and start of turn |

---

## Notes

- The tool has no save state — selections reset on page refresh
- Complement Effects filter to match the chosen Composition type automatically
- The **Clear Selection** button at the bottom of the sidebar resets everything
- Print layout is supported — use browser print to export a spell card

---

*Arcanum Veritas Builder · Once Upon a Star ★ Campaign · Ephemer Worldbuilding Project*
