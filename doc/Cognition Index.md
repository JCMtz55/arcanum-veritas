---
title: Cognition Index
aliases:
  - Cognitions
updated: 2026-09-30
created: 2024-01-22
---

# Cognition Index

**Cognitions** are the pure conceptual essences — ideas, emotions, and forces of nature — that power [[Arcanum Veritas]] and the deeper forms of [[Magic]] in Ephemer. They are drawn from the [[Collective Consciousness|Collective]] and learned by confronting their raw essence in dream. For the metaphysics see [[Cognition]]; for the rules of acquiring one see [[Learning Cognitions]].

This document is the **central index** of every Cognition. It reconciles two things:
- **The roster** — every Cognition that *exists* as a concept.
- **Build status** — whether a Cognition is written, covers all five Compositions, and is switched on in the [[Arcanum Veritas Builder]].

> [!note] Cognitions live in JSON
> There are no per-Cognition notes in the vault any more. A Cognition's one and only write-up is its file in `Arcanum Veritas/cognitions/<id>.json`, and this index is read from those files. Refer to a Cognition by its **bold name**, not a wikilink.

### Legend
- **Bold name** — the Cognition is written: it has a JSON with Verum Effects.
- *(plain name)* — **Concept only.** Exists in the roster but has no JSON yet.
- **Tier** — practical wielding power (see [[#Cognition Tiers|Tier Framework]] below).
- **⚖️** — This Cognition embodies one of the [[The Thirteen Divine Laws|Thirteen Divine Laws]]. The marker denotes **cosmic significance independent of Tier** — a mortal wielding a facet of a Law is rated by practical power, not by the weight of the Law itself.
- **Requires** — prerequisite Cognitions that must be learned first. **All Tier III+ Cognitions have requirements.**

#### Complete
Whether the JSON covers all five [[Arcanum Veritas Composition|Compositions]] — **O**ffensive, **S**upportive, **C**ontrol, **Cr**eation, **U**tility — *or* is declared **not compatible** with one.
- **✅** — All five present (or a declared incompatibility covers the gap).
- **⚠ O·Cr** — Missing those Compositions, with no incompatibility noted. These are the open to-dos.
- **—** — Not applicable (stub or concept-only).

#### JSON
The state of the Cognition's file in the [[Arcanum Veritas Builder]]'s `cognitions/` folder.
- **✅** — Written and selectable in the builder (`"ready": true` in `index.json`).
- **⚠** — Written, but **not yet switched on** in the builder (`"ready": false`).
- **🔧** — Stub: lore is established, but there is no JSON and no Verum Effects yet.
- **❌** — Listed in `index.json` with no file.
- **—** — Concept only.

**Written: 87 · Stubbed: 3 · Concept-only: 39 · Roster: 129.** The reference standard for all write-ups is **Fire**.
**Complete: 71 · In the builder: 87 (46 selectable, 41 waiting to be switched on).** *Synced from the JSONs on 2026-09-30.*

---

## Master Table

| Cognition          | Complete   | JSON | Tier | Requires               |
| ------------------ | :--------- | :--: | :--: | ---------------------- |
| **Acid**           | ⚠ S·Cr·U   |  ⚠   |  I   |                        |
| **Air**            | ✅          |  ✅   |  II  |                        |
| **Anger**          | ✅          |  ⚠   |  II  |                        |
| [[Animality]]      | —          |  🔧  |  II  |                        |
| **Apathy**         | ⚠ O        |  ✅   |  II  |                        |
| **Balance**        | ⚠ Cr·U     |  ⚠   | III  | Law, Freedom           |
| **Beast**          | ✅          |  ✅   |  II  |                        |
| Betrayal           | —          |  —   |  I   |                        |
| **Blood**          | ✅          |  ✅   |  II  |                        |
| **Bones**          | ✅          |  ✅   |  II  |                        |
| **Carnage**        | ⚠ Cr·U     |  ⚠   | III  | Blood, Hate, Pain      |
| Change             | —          |  —   | III  | Growth, Decay          |
| Chaos ⚖️           | —          |  —   |  V   | *Cannot be learned*    |
| **Civilization**   | ⚠ O        |  ✅   |  I   |                        |
| **Clarity**        | ✅          |  ✅   |  I   |                        |
| Commerce           | —          |  —   |  I   |                        |
| Confinement        | —          |  —   |  I   |                        |
| **Control**        | ⚠ O·Cr·U   |  ✅   |  I   |                        |
| **Corruption**     | ✅          |  ✅   | III  | Vileness, Decay        |
| **Craft**          | ✅          |  ✅   |  I   |                        |
| **Creation**       | ✅          |  ⚠   | III  | Craft, Emotion         |
| **Crystal**        | ✅          |  ✅   |  II  |                        |
| Darkness           | —          |  —   |  I   |                        |
| **Death**          | ✅          |  ✅   | III  | Decay, Flesh           |
| Decay              | —          |  —   |  I   |                        |
| **Despair**        | ✅          |  ⚠   | III  | Grief, Apathy          |
| Destiny            | —          |  —   | III  | Travel, Faith          |
| **Destruction**    | ✅          |  ✅   |  IV  | Carnage, Disaster      |
| **Disaster**       | ⚠ Cr·U     |  ⚠   |  I   |                        |
| **Disgust**        | ✅          |  ⚠   |  II  |                        |
| Disorientation     | —          |  —   |  I   |                        |
| **Dream**          | ✅          |  ⚠   |  IV  | Emotion, Fear, Hope    |
| **Earth**          | ✅          |  ✅   |  II  |                        |
| **Emotion** ⚖️     | ✅          |  ✅   | III  | Joy, Fear              |
| Energy             | —          |  —   |  I   |                        |
| **Faith**          | ✅          |  ⚠   | III  | Hope, Will             |
| **Fate**           | ✅          |  ⚠   | III  | Fortune, Misfortune    |
| **Fear**           | ✅          |  ⚠   |  II  |                        |
| **Fire**           | ✅          |  ✅   |  II  |                        |
| **Flesh**          | ✅          |  ✅   |  II  |                        |
| **Fortune**        | ✅          |  ✅   |  I   |                        |
| **Freedom**        | ✅          |  ✅   |  I   |                        |
| **Games**          | ✅          |  ⚠   |  I   |                        |
| **Gravity**        | ✅          |  ⚠   |  II  |                        |
| Grief              | —          |  —   | III  | Love, Death            |
| **Growth**         | ⚠ O        |  ✅   |  I   |                        |
| **Harmony**        | ✅          |  ⚠   | III  | Balance, Peace         |
| **Hate**           | ⚠ Cr·U     |  ⚠   |  II  |                        |
| **Healing**        | ✅          |  ⚠   |  II  |                        |
| **Heroism**        | ⚠ O        |  ✅   |  II  |                        |
| **History**        | ✅          |  ✅   |  II  |                        |
| **Hollowing**      | ✅          |  ⚠   |  V   | Soul, Void             |
| Honor ⚖️           | —          |  —   | III  | Loyalty, Law           |
| **Hope**           | ✅          |  ⚠   | III  | Joy, Will              |
| **Hunger**         | ✅          |  ⚠   | III  | Beast, Void            |
| **Ice**            | ✅          |  ✅   |  II  |                        |
| **Identity**       | ✅          |  ⚠   |  IV  | History, Clarity       |
| Ignorance          | —          |  —   |  II  |                        |
| [[Imagination]] ⚖️ | —          |  🔧  |  V   | All other Divine Laws  |
| Infinity           | —          |  —   |  IV  | Energy, Knowledge      |
| Insanity           | —          |  —   |  II  |                        |
| Insects            | —          |  —   |  II  |                        |
| **Isolation**      | ⚠ O        |  ✅   |  I   |                        |
| **Joy**            | ✅          |  ⚠   |  II  |                        |
| **Justice**        | ✅          |  ⚠   | III  | Law, Truth             |
| **Knowledge**      | ✅          |  ⚠   | III  | Clarity, History       |
| **Law**            | ✅          |  ⚠   |  I   |                        |
| Lies               | —          |  —   |  II  |                        |
| **Life** ⚖️        | ✅          |  ✅   | III  | Growth, Flesh          |
| **Light**          | ✅          |  ✅   |  I   |                        |
| **Lightning**      | ✅          |  ✅   |  II  |                        |
| **Love**           | ✅          |  ⚠   |  II  |                        |
| **Loyalty**        | ✅          |  ⚠   |  I   |                        |
| **Luck**           | ✅          |  ⚠   |  I   |                        |
| **Lunar**          | ✅          |  ⚠   | III  | Night, Water           |
| Magic ⚖️           | —          |  —   |  IV  | Emotion, Craft         |
| **Melancholy**     | ✅          |  ✅   |  IV  | Sadness, Soul          |
| Memory             | —          |  —   | III  | History, Clarity       |
| Mercy              | —          |  —   |  I   |                        |
| **Metal**          | ✅          |  ✅   |  II  |                        |
| **Misfortune**     | ⚠ O        |  ✅   |  I   |                        |
| Mortality ⚖️       | —          |  —   | III  | Decay, Fate            |
| [[Naming]] ⚖️      | —          |  🔧  |  IV  | Truth, Soul            |
| **Nature**         | ✅          |  ✅   |  I   |                        |
| **Night**          | ✅          |  ⚠   | III  | Darkness, Fear         |
| **Nightmare**      | ✅          |  ⚠   |  IV  | Fear, Shadow, Insanity |
| **Nullity**        | ✅          |  ✅   |  IV  | Isolation, Magic       |
| Obsession          | —          |  —   |  II  |                        |
| Order ⚖️           | —          |  —   |  V   | *Cannot be learned*    |
| **Pain**           | ✅          |  ✅   |  I   |                        |
| Passion            | —          |  —   | III  | Fire, Love             |
| **Peace**          | ✅          |  ✅   |  II  |                        |
| **Power**          | ✅          |  ✅   |  I   |                        |
| **Promises** ⚖️    | ✅          |  ⚠   |  IV  | Vinculum, Truth        |
| Prophecy           | —          |  —   | III  | Fate, Clarity          |
| **Protection**     | ✅          |  ✅   |  I   |                        |
| Psychic            | —          |  —   |  II  |                        |
| Reality            | —          |  —   | III  | Control, Order         |
| Rebellion          | —          |  —   |  II  |                        |
| Revenge            | —          |  —   |  II  |                        |
| Rot                | —          |  —   |  II  |                        |
| **Sadness**        | ✅          |  ⚠   |  II  |                        |
| Sanity             | —          |  —   |  II  |                        |
| **Secrets**        | ✅          |  ✅   |  II  |                        |
| **Shadow**         | ⚠ Cr·U     |  ✅   |  I   |                        |
| **Silence**        | ⚠ O·S·Cr·U |  ✅   |  I   |                        |
| **Soul**           | ✅          |  ✅   |  IV  | Life, Death            |
| Sound              | —          |  —   |  I   |                        |
| **Space**          | ✅          |  ⚠   |  IV  | Gravity, Travel        |
| **Speed**          | ⚠ C·Cr·U   |  ⚠   |  I   |                        |
| Stagnation         | —          |  —   |  I   |                        |
| Storm              | —          |  —   |  II  |                        |
| **Sun**            | ✅          |  ✅   | III  | Fire, Life             |
| **Thievery**       | ✅          |  ✅   |  II  |                        |
| **Time** ⚖️        | ✅          |  ⚠   |  IV  | Memory, Travel         |
| **Toxin**          | ⚠ S·Cr·U   |  ⚠   |  II  |                        |
| **Travel**         | ✅          |  ✅   |  I   |                        |
| **Trickery**       | ✅          |  ⚠   |  II  |                        |
| **Truth**          | ✅          |  ⚠   | III  | Clarity, Light         |
| Victory            | —          |  —   |  I   |                        |
| Vileness           | —          |  —   |  II  |                        |
| Vinculum ⚖️        | —          |  —   |  IV  | Emotion                |
| **Void**           | ✅          |  ⚠   |  IV  | Darkness, Silence      |
| Vulnerability      | —          |  —   |  I   |                        |
| War                | —          |  —   |  II  |                        |
| **Water**          | ✅          |  ✅   |  II  |                        |
| **Wilderness**     | ✅          |  ✅   |  II  |                        |
| **Will**           | ✅          |  ✅   |  I   |                        |
| **Wisdom**         | ✅          |  ⚠   | III  | Knowledge, Clarity     |

### Completion at a glance

*Read from the JSONs on 2026-09-30.*

- **Complete (71).** All five Compositions present, or the gap is a declared incompatibility: **Air**, **Anger**, **Beast**, **Blood**, **Bones**, **Clarity**, **Corruption**, **Craft**, **Creation**, **Crystal**, **Death**, **Despair**, **Destruction**, **Disgust**, **Dream**, **Earth**, **Emotion**, **Faith**, **Fate**, **Fear**, **Fire**, **Flesh**, **Fortune**, **Freedom**, **Games**, **Gravity**, **Harmony**, **Healing**, **History**, **Hollowing**, **Hope**, **Hunger**, **Ice**, **Identity**, **Joy**, **Justice**, **Knowledge**, **Law**, **Life**, **Light**, **Lightning**, **Love**, **Loyalty**, **Luck**, **Lunar**, **Melancholy**, **Metal**, **Nature**, **Night**, **Nightmare**, **Nullity**, **Pain**, **Peace**, **Power**, **Promises**, **Protection**, **Sadness**, **Secrets**, **Soul**, **Space**, **Sun**, **Thievery**, **Time**, **Travel**, **Trickery**, **Truth**, **Void**, **Water**, **Wilderness**, **Will**, **Wisdom**.
- **Still incomplete (16)** — the missing Compositions in brackets: **Acid** (S·Cr·U), **Apathy** (O), **Balance** (Cr·U), **Carnage** (Cr·U), **Civilization** (O), **Control** (O·Cr·U), **Disaster** (Cr·U), **Growth** (O), **Hate** (Cr·U), **Heroism** (O), **Isolation** (O), **Misfortune** (O), **Shadow** (Cr·U), **Silence** (O·S·Cr·U), **Speed** (C·Cr·U), **Toxin** (S·Cr·U).
- **Creation-incompatible, flagged in the JSON (7):** **Corruption**, **Despair**, **Destruction**, **Disgust**, **Hollowing**, **Hunger**, **Sun**. The builder never offers these a Creation Ring.
- **Creation-incompatible, declared here only (10):** **Apathy**, **Beast**, **Blood**, **Fortune**, **Heroism**, **Isolation**, **Misfortune**, **Nullity**, **Pain**, **Power**. *These concepts do not build things.* The table counts the gap as covered, but their JSONs lack `"incompatible": ["creation"]`, so the builder still offers them a fallback Creation Ring.
- **Waiting to be switched on (41):** **Acid**, **Anger**, **Balance**, **Carnage**, **Creation**, **Despair**, **Disaster**, **Disgust**, **Dream**, **Faith**, **Fate**, **Fear**, **Games**, **Gravity**, **Harmony**, **Hate**, **Healing**, **Hollowing**, **Hope**, **Hunger**, **Identity**, **Joy**, **Justice**, **Knowledge**, **Law**, **Love**, **Loyalty**, **Luck**, **Lunar**, **Night**, **Nightmare**, **Promises**, **Sadness**, **Space**, **Speed**, **Time**, **Toxin**, **Trickery**, **Truth**, **Void**, **Wisdom**. Each has a valid JSON with `"ready": false`.
- **Players' favourites (9):** **Blood**, **Death**, **Life**, **Lunar**, **Melancholy**, **Nightmare**, **Nullity**, **Soul**, **Sun** — held to a higher power bar.

---

## Cognition Tiers

A Cognition's **Tier** rates the practical wielding power of the concept — how hard it is to learn, how much it can bend a scene, and how cautiously its Verum Effects should be balanced. Higher tiers are rarer, demand prerequisite Cognitions, and carry proportionally greater narrative and mechanical stakes. Tier is **not** a measure of cosmic significance — for that, see the [[#⚖️ Divine Law Cognitions|Divine Law marker]] below.

### Tier I — Basic
*Foundational forces and simple concepts.* Single elements, mundane states, and uncomplicated emotions or actions. The entry points to Arcanum Veritas — freely learnable, low-risk, and the building blocks of higher Cognitions.
- **Learnability:** Freely learnable; the common vocabulary of magic.
- **Requirements:** None.
- **Balancing target:** Reliable, low-variance effects. A single element or effect with clean scaling. No reality-bending, no hard control at low levels.

### Tier II — Advanced
*Complex forces and states.* Bodily, emotional, and environmental Cognitions that combine or specialize the basics. More situational power and more moving parts, still grounded in the physical and personal.
- **Learnability:** Learnable with effort.
- **Requirements:** None, though many benefit from a related Tier I foundation.
- **Balancing target:** Meaningful battlefield impact — status effects, terrain, sustained damage. May reward setup, but should not warp encounters alone.

### Tier III — Profound
*Metaphysical and existential concepts.* Death, spirit, deep emotion, fate, and law made manifest. These touch the meaning of things rather than their surface, and always demand prerequisites.
- **Learnability:** Difficult; gated behind understanding.
- **Requirements:** **Mandatory** — two or more prerequisite Cognitions.
- **Balancing target:** Scene-shaping power. May rewrite the terms of a fight (frenzy, resurrection-adjacent effects, fate manipulation) but should carry cost, risk, or a hard ceiling.

### Tier IV — Absolute
*Cosmic, reality-defining concepts.* Dream, Time, Space, Soul, Magic itself. To wield these is to touch the architecture of existence. Nearly impossible to grasp, and always compound.
- **Learnability:** Extraordinary; the work of a lifetime or a divine gift.
- **Requirements:** **Mandatory** — high-tier prerequisites, often themselves Tier III.
- **Balancing target:** Campaign-defining. Effects should be rare, resource-hungry, and narratively momentous. Treat any at-will reality manipulation as a design red flag.

### Tier V — Primordial
*The root forces of reality: [[Chaos]], [[Order]], and — at their apex — [[Imagination]].* These are not concepts the mind can hold; they are the substrate from which all other concepts are cut.

[[Chaos]] and [[Order]] **cannot be learned through dream.** The only path to them is to harness them directly from ancient, powerful beings who embody them, at grave risk of madness, annihilation, or rigid unmaking.

[[Imagination]] is the sole exception — it *can* be learned, but only by one who has first mastered **every other Divine Law**, Chaos and Order included. Since those two can never be learned by ordinary means, Imagination remains in practice beyond mortal reach: the capstone of the entire system, achievable only by gods or those granted what mortals cannot earn.

[[Hollowing]] is the fourth root force — the anti-Imagination, the design the world was cut from before Rhea's wound. It is not taught and cannot be studied or dreamed: it appears, fully formed, in those who can bear it, and it answers its wielder as readily as it answers the world (**Hollow Marks**, which end in [[Hollowing Insomnia]]). Soul and Void are not steps toward it; they are what a mind must already hold to survive it.
- **Learnability:** Chaos & Order — impossible by ordinary means. Imagination — theoretically learnable, practically divine-only. Hollowing — never learned; it arrives.
- **Requirements:** Chaos & Order — none learnable. Imagination — all other Divine Law Cognitions. Hollowing — Soul and Void held in full.
- **Balancing target:** Not player-facing by default. Reserved for gods, cosmic entities, and endgame stakes. Any mortal access is a story event, not a build option.

### ⚖️ Divine Law Cognitions

Some Cognitions embody one of the [[The Thirteen Divine Laws|Thirteen Divine Laws]] — the pillars of reality upheld by the Forerunners. These are marked **⚖️** in the table. The marker is deliberately **separate from Tier**: a mortal can learn to wield a *facet* of a Law (and is rated by the practical power of that facet), but this is not the same as *being* the Law, which is the province of its Representant. A Cognition can therefore be low-Tier yet cosmically weighted — [[Vinculum]] (bonds) is mechanically modest but is one of the thirteen pillars of existence.

| Divine Law | Cognition | Representant | Tier |
| --- | --- | --- | :-: |
| The Primal Law of Chaos | [[Chaos]] | ISIN | V |
| The Rigid Law of Order | [[Order]] | SAGN | V |
| The Amusing Law of Imagination | [[Imagination]] | [[Rhea]] | V |
| The Intimate Law of Life | [[Life]] | Faye | III |
| The Abrupt Law of Mortality | Mortality | Lucian | III |
| The Universal Law of Time | Time | Vernon | IV |
| The Fundamental Law of Magic | Magic | Architect | IV |
| The Definitive Law of Naming | [[Naming]] | [[Nevi]] | IV |
| The Upholding Law of Promises | [[Promises]] | [[Atticus\|Magistrate]] | IV |
| The Chaining Law of Vinculums | Vinculum | Soltis | I |
| The Dueling Law of Honor | Honor | Devil & Nero | III |
| The Honest Law of Emotions | Emotion | Nero | III |

*(The Abstract Law of Cognition — Ephemer — is the meta-law describing the whole system, not a single Cognition.)*

All thirteen Divine Laws now have either a Cognition or a documented reason for having none.

---

## Maintenance Notes

### 2026-09-30 — synced with the builder's JSONs
- **The table is now read from `Arcanum Veritas/cognitions/`.** Complete, JSON, Tier and Requires for the 87 Cognitions with a file come from `index.json` and each `<id>.json`. The 42 rows with no file (3 stubs, 39 concepts) are unchanged.
- **The Doc column is gone.** Juan: Cognitions no longer have a note each — the JSON is the only write-up. A stub's 🔧 now sits in the JSON column.
- **Four Cognitions were missing from the roster and are now listed:** **Anger**, **Disgust**, **Melancholy**, **Sadness**.
- **Destruction** moved from Tier I with no requirements to **Tier IV, requires Carnage and Disaster**, as its JSON has it.
- **Hollowing** is Tier V (see the Tier V section).
- **The old 🔧 stubs Crystal, Despair, Hunger, Lunar and Promises are written** and now show ✅. Only **Animality**, **Imagination** and **Naming** remain stubs.
- **Creation** and **Dream** are no longer legacy format: both JSONs are typed by Composition and complete.
- The notes below this one predate the sync. Where they disagree with the table, the table is right.

### Completion backlog
- **The 22-Cognition pass is done.** Every Cognition that received Creation/Utility effects is now complete across all five Compositions (or states its incompatibility), and its JSON matches the vault entry exactly.
- **The next pass is the 16 untouched documented Cognitions** — [[Acid]], [[Air]], [[Balance]], [[Carnage]], [[Control]], [[Disaster]], [[Hate]], [[Hollowing]], [[Night]], [[Nightmare]], [[Shadow]], [[Silence]], [[Soul]], [[Speed]], [[Sun]], [[Toxin]]. Most need Creation and Utility; several also lack an Offensive or Supportive Core effect.
- **[[Creation]] and [[Dream]] are pre-Composition legacy documents.** Their effects use the old "Verum Sub-Effect" format with no Offensive/Supportive/Control typing at all. They need a full rework before either column can be assessed.
- **[[Sun]] deliberately has no Creation or Utility.** Its Two Suns engine gives it exactly three abilities, one per Composition, each with a fixed Corruption cost and a Corona — adding more means designing new costs and Coronas, not just new text.

### File and data problems
- **[[Animality]] is marked 🔧 because its vault file is empty.** It was previously listed as fully documented; the marker now reflects what is actually on disk. Write the entry to restore it to ✅.
- **[[Hate]] is genuinely complete** — an earlier audit misread a stray empty duplicate (`Hate..md`) as the real entry. The duplicate has been deleted and the note verified against its JSON.
- **[[Sun]] was missing from this table entirely** despite having a complete vault entry. Now listed as ✅, Tier III.
- **A full vault–JSON audit was run: 35 of 35 Cognition files now match**, effect for effect, across names and Composition types. Every entry in the builder's `index.json` resolves to a valid file.
- **Resolved:** `carnage.json` had been **truncated mid-write** — it ended partway through *Monument of Slaughter* and had lost **Butcher's Vigor** entirely. Rebuilt in full from [[Carnage]] and registered in the builder's `index.json`, which had never listed it.
- **Resolved:** a stray `Hate..md` (double dot, empty) sat beside the real [[Hate]] entry and was deleted; its JSON counterpart `hate..json` was renamed to `hate.json` so the index's `hate` id resolves.
- **The builder now reads native `creation` and `utility` pools.** When a Cognition JSON lacks them, it falls back to the Control pool (Structure/Object), Offensive (Construct), and Supportive (Utility). **Note:** the builder has no field for a declared incompatibility — the eleven Creation-incompatible Cognitions will still offer a fallback Creation option there until the schema gains one.

### Standing notes
- **Stubs awaiting Verum Effects (🔧):** [[Animality]], [[Imagination]], [[Naming]], [[Promises]], [[Crystal]], [[Despair]], [[Lunar]], [[Hunger]]. Provisional saves/opposing Cognitions are flagged inside each stub.
- **Learning DCs** now derive from Tier via [[Learning Cognitions]] — there are no per-Cognition rows to maintain, so a new Cognition needs only a Tier set here.
- **Harmony** is still a concept-only stub-link (created as [[Carnage]]'s opposing Cognition) — no file yet.
- **Resolved — roster typo.** The misspelled roster lived in [[Cognition]] (`Lore/Laws/`), not [[Learning Cognitions]], and held **no** `Lightning` row at all — so deleting `Lighting` would have dropped the Cognition entirely. Renamed instead: the row is now **[[Lightning]]**, and the opposing-Cognition cells for **Earth** and **Metal** were corrected to match.
- **Opposing Cognitions** are intentionally *not* in this index — legacy data conflicts (e.g. Fire opposed Water in old lore but [[Ice]] in the current file). Reconcile per-document, not here.
- **Tier III+ requirements** were assigned by concept and may be tuned freely; they are balance scaffolding, not locked canon.
