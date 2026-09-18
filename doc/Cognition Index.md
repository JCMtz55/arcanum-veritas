---
title: Cognition Index
aliases:
  - Cognitions
updated: 2026-09-17
created: 2024-01-22
---

# Cognition Index

**Cognitions** are the pure conceptual essences — ideas, emotions, and forces of nature — that power [[Arcanum Veritas]] and the deeper forms of [[Magic]] in Ephemer. They are drawn from the [[Collective Consciousness|Collective]] and learned by confronting their raw essence in dream. For the metaphysics see [[Cognition]]; for the rules of acquiring one see [[Learning Cognitions]].

This document is the **central index** of every Cognition. It reconciles three things:
- **The roster** — every Cognition that *exists* as a concept.
- **Documentation status** — which Cognitions have a **full Verum Effects write-up** in the vault.
- **Build status** — whether a Cognition covers all five Compositions, and whether it exists in the [[Arcanum Veritas Builder]].

### Legend
- **✅** — Fully documented (complete entry with Verum Effects in `Magic System/Cognitions/`). Name is linked.
- **🔧** — Stubbed. A partial entry exists (lore established) but Verum Effects are still to be designed.
- *(unmarked)* — **Concept only.** Exists in the roster but has no file yet.
- **Tier** — practical wielding power (see [[#Cognition Tiers|Tier Framework]] below).
- **⚖️** — This Cognition embodies one of the [[The Thirteen Divine Laws|Thirteen Divine Laws]]. The marker denotes **cosmic significance independent of Tier** — a mortal wielding a facet of a Law is rated by practical power, not by the weight of the Law itself.
- **Requires** — prerequisite Cognitions that must be learned first. **All Tier III+ Cognitions have requirements.**

#### Complete
Whether the entry covers all five [[Arcanum Veritas Composition|Compositions]] — **O**ffensive, **S**upportive, **C**ontrol, **Cr**eation, **U**tility — *or* states in the entry that it is **not compatible** with one.
- **✅** — All five present (or a documented incompatibility covers the gap).
- **⚠ O·Cr** — Missing those Compositions, with no incompatibility noted. These are the open to-dos.
- **⛔** — Legacy format: written before Compositions existed, so its effects are not typed at all. Needs a rework pass.
- **—** — Not applicable (stub or concept-only).

#### JSON
Whether the Cognition exists in the [[Arcanum Veritas Builder]]'s `cognitions/` folder.
- **✅** — Present and valid; selectable in the builder.
- **⚠** — Present but faulty (see Maintenance Notes).
- **❌** — Documented in the vault but **not yet in the builder**.
- **—** — Not applicable (stub or concept-only).

**Documented: 40 · Stubbed: 8 · Concept-only: ~71.** The reference standard for all write-ups is [[Fire]].
**Complete: 22 · In the builder: 35.**

---

## Master Table

| Cognition          | Doc | Complete   | JSON | Tier | Requires               |
| ------------------ | :-: | :--------- | :--: | :--: | ---------------------- |
| [[Acid]]           |  ✅  | ⚠ S·Cr·U   |  ✅   |  I   |                        |
| [[Air]]            |  ✅  | ⚠ Cr·U     |  ✅   |  II  |                        |
| [[Animality]]      | 🔧  | —          |  —   |  II  |                        |
| [[Apathy]]         |  ✅  | ✅          |  ✅   |  II  |                        |
| [[Balance]]        |  ✅  | ⚠ Cr·U     |  ✅   | III  | Law, Freedom           |
| [[Beast]]          |  ✅  | ✅          |  ✅   |  II  |                        |
| Betrayal           |     | —          |  —   |  I   |                        |
| [[Blood]]          |  ✅  | ✅          |  ✅   |  II  |                        |
| [[Bones]]          |  ✅  | ✅          |  ✅   |  II  |                        |
| [[Carnage]]        |  ✅  | ⚠ Cr·U     |  ✅   | III  | Blood, Hate, Pain      |
| Chaos ⚖️           |     | —          |  —   |  V   | *Cannot be learned*    |
| Change             |     | —          |  —   | III  | Growth, Decay          |
| [[Civilization]]   |  ✅  | ✅          |  ✅   |  I   |                        |
| Clarity            |     | —          |  —   |  I   |                        |
| Commerce           |     | —          |  —   |  I   |                        |
| Confinement        |     | —          |  —   |  I   |                        |
| [[Control]]        |  ✅  | ⚠ O·Cr·U   |  ✅   |  I   |                        |
| [[Corruption]]     |  ✅  | ✅          |  ✅   | III  | Vileness, Decay        |
| Craft              |     | —          |  —   |  I   |                        |
| [[Creation]]       |  ✅  | ⛔          |  ❌   | III  | Craft, Emotion         |
| [[Crystal]]        | 🔧  | —          |  —   |  II  |                        |
| Darkness           |     | —          |  —   |  I   |                        |
| [[Death]]          |  ✅  | ✅          |  ✅   | III  | Decay, Flesh           |
| Decay              |     | —          |  —   |  I   |                        |
| [[Despair]]        | 🔧  | —          |  —   | III  | Grief, Apathy          |
| Destiny            |     | —          |  —   | III  | Travel, Faith          |
| Destruction        |     | —          |  —   |  I   |                        |
| [[Disaster]]       |  ✅  | ⚠ Cr·U     |  ✅   |  I   |                        |
| Disorientation     |     | —          |  —   |  I   |                        |
| [[Dream]]          |  ✅  | ⛔          |  ❌   |  IV  | Emotion, Fear, Hope    |
| Earth              |     | —          |  —   |  II  |                        |
| Emotion ⚖️         |     | —          |  —   | III  | Joy, Fear              |
| Energy             |     | —          |  —   |  I   |                        |
| Faith              |     | —          |  —   | III  | Hope, Will             |
| Fate               |     | —          |  —   | III  | Fortune, Misfortune    |
| Fear               |     | —          |  —   |  II  |                        |
| [[Fire]]           |  ✅  | ✅          |  ✅   |  II  |                        |
| [[Flesh]]          |  ✅  | ✅          |  ✅   |  II  |                        |
| [[Fortune]]        |  ✅  | ✅          |  ✅   |  I   |                        |
| Freedom            |     | —          |  —   |  I   |                        |
| Games              |     | —          |  —   |  I   |                        |
| Gravity            |     | —          |  —   |  II  |                        |
| Grief              |     | —          |  —   | III  | Love, Death            |
| [[Growth]]         |  ✅  | ✅          |  ✅   |  I   |                        |
| Harmony            |     | —          |  —   | III  | Balance, Peace         |
| [[Hate]]           |  ✅  | ⚠ Cr·U     |  ✅   |  II  |                        |
| Healing            |     | —          |  —   |  II  |                        |
| [[Heroism]]        |  ✅  | ✅          |  ✅   |  II  |                        |
| History            |     | —          |  —   |  II  |                        |
| [[Hollowing]]      |  ✅  | ⚠ Cr·U     |  ❌   |  IV  | Soul, Void             |
| Honor ⚖️           |     | —          |  —   | III  | Loyalty, Law           |
| Hope               |     | —          |  —   | III  | Joy, Will              |
| [[Hunger]]         | 🔧  | —          |  —   | III  | Beast, Void            |
| [[Ice]]            |  ✅  | ✅          |  ✅   |  II  |                        |
| Identity           |     | —          |  —   |  IV  | History, Clarity       |
| Ignorance          |     | —          |  —   |  II  |                        |
| [[Imagination]] ⚖️ | 🔧  | —          |  —   |  V   | All other Divine Laws  |
| Infinity           |     | —          |  —   |  IV  | Energy, Knowledge      |
| Insanity           |     | —          |  —   |  II  |                        |
| Insects            |     | —          |  —   |  II  |                        |
| [[Isolation]]      |  ✅  | ✅          |  ✅   |  I   |                        |
| Joy                |     | —          |  —   |  II  |                        |
| Justice            |     | —          |  —   | III  | Law, Truth             |
| Knowledge          |     | —          |  —   | III  | Clarity, History       |
| Law                |     | —          |  —   |  I   |                        |
| Lies               |     | —          |  —   |  II  |                        |
| [[Life]] ⚖️        |  ✅  | ✅          |  ✅   | III  | Growth, Flesh          |
| Light              |     | —          |  —   |  I   |                        |
| [[Lightning]]      |  ✅  | ✅          |  ✅   |  II  |                        |
| Love               |     | —          |  —   |  II  |                        |
| Loyalty            |     | —          |  —   |  I   |                        |
| Luck               |     | —          |  —   |  I   |                        |
| [[Lunar]]          | 🔧  | —          |  —   | III  | Night, Water           |
| Magic ⚖️           |     | —          |  —   |  IV  | Emotion, Craft         |
| Memory             |     | —          |  —   | III  | History, Clarity       |
| Mercy              |     | —          |  —   |  I   |                        |
| [[Metal]]          |  ✅  | ✅          |  ✅   |  II  |                        |
| [[Misfortune]]     |  ✅  | ✅          |  ✅   |  I   |                        |
| Mortality ⚖️       |     | —          |  —   | III  | Decay, Fate            |
| [[Naming]] ⚖️      | 🔧  | —          |  —   |  IV  | Truth, Soul            |
| Nature             |     | —          |  —   |  I   |                        |
| [[Night]]          |  ✅  | ⚠ Cr·U     |  ❌   | III  | Darkness, Fear         |
| [[Nightmare]]      |  ✅  | ⚠ S·Cr·U   |  ✅   |  IV  | Fear, Shadow, Insanity |
| [[Nullity]]        |  ✅  | ✅          |  ✅   |  IV  | Isolation, Magic       |
| Obsession          |     | —          |  —   |  II  |                        |
| Order ⚖️           |     | —          |  —   |  V   | *Cannot be learned*    |
| [[Pain]]           |  ✅  | ✅          |  ✅   |  I   |                        |
| Passion            |     | —          |  —   | III  | Fire, Love             |
| Peace              |     | —          |  —   |  II  |                        |
| [[Power]]          |  ✅  | ✅          |  ✅   |  I   |                        |
| [[Promises]] ⚖️    | 🔧  | —          |  —   |  IV  | Vinculum, Truth        |
| Prophecy           |     | —          |  —   | III  | Fate, Clarity          |
| [[Protection]]     |  ✅  | ✅          |  ✅   |  I   |                        |
| Psychic            |     | —          |  —   |  II  |                        |
| Reality            |     | —          |  —   | III  | Control, Order         |
| Rebellion          |     | —          |  —   |  II  |                        |
| Revenge            |     | —          |  —   |  II  |                        |
| Rot                |     | —          |  —   |  II  |                        |
| Sanity             |     | —          |  —   |  II  |                        |
| Secrets            |     | —          |  —   |  II  |                        |
| [[Shadow]]         |  ✅  | ⚠ Cr·U     |  ✅   |  I   |                        |
| [[Silence]]        |  ✅  | ⚠ O·S·Cr·U |  ✅   |  I   |                        |
| [[Soul]]           |  ✅  | ⚠ Cr·U     |  ✅   |  IV  | Life, Death            |
| Sound              |     | —          |  —   |  I   |                        |
| Space              |     | —          |  —   |  IV  | Gravity, Travel        |
| [[Speed]]          |  ✅  | ⚠ C·Cr·U   |  ✅   |  I   |                        |
| Stagnation         |     | —          |  —   |  I   |                        |
| Storm              |     | —          |  —   |  II  |                        |
| [[Sun]]            |  ✅  | ⚠ Cr·U     |  ❌   | III  | Fire, Life             |
| Thievery           |     | —          |  —   |  II  |                        |
| Time ⚖️            |     | —          |  —   |  IV  | Memory, Travel         |
| [[Toxin]]          |  ✅  | ⚠ S·Cr·U   |  ✅   |  II  |                        |
| Travel             |     | —          |  —   |  I   |                        |
| Trickery           |     | —          |  —   |  II  |                        |
| Truth              |     | —          |  —   | III  | Clarity, Light         |
| Victory            |     | —          |  —   |  I   |                        |
| Vileness           |     | —          |  —   |  II  |                        |
| Vinculum ⚖️        |     | —          |  —   |  IV  | Emotion                |
| Void               |     | —          |  —   |  IV  | Darkness, Silence      |
| Vulnerability      |     | —          |  —   |  I   |                        |
| War                |     | —          |  —   |  II  |                        |
| Water              |     | —          |  —   |  II  |                        |
| Wilderness         |     | —          |  —   |  II  |                        |
| Will               |     | —          |  —   |  I   |                        |
| Wisdom             |     | —          |  —   | III  | Knowledge, Clarity     |

### Completion at a glance

- **Complete (22).** Every Cognition that has been through the Creation/Utility pass is now complete and in sync with the builder: [[Apathy]], [[Beast]], [[Blood]], [[Bones]], [[Civilization]], [[Corruption]], [[Death]], [[Fire]], [[Flesh]], [[Fortune]], [[Growth]], [[Heroism]], [[Ice]], [[Isolation]], [[Life]], [[Lightning]], [[Metal]], [[Misfortune]], [[Nullity]], [[Pain]], [[Power]], [[Protection]].
- **Declared Creation-incompatible (11):** [[Apathy]], [[Beast]], [[Blood]], [[Corruption]], [[Fortune]], [[Heroism]], [[Isolation]], [[Misfortune]], [[Nullity]], [[Pain]], [[Power]]. *Each states the incompatibility in its entry — these concepts do not build things.*
- **Still incomplete (18 documented):** [[Acid]], [[Air]], [[Balance]], [[Carnage]], [[Control]], [[Disaster]], [[Hate]], [[Hollowing]], [[Night]], [[Nightmare]], [[Shadow]], [[Silence]], [[Soul]], [[Speed]], [[Sun]], [[Toxin]] — none have been through the Creation/Utility pass yet. Plus the two legacy documents below.
- **Legacy format (2):** [[Creation]] and [[Dream]] pre-date Compositions entirely — their effects are untyped and need a full rework pass.
- **Not in the builder (5 documented):** [[Creation]], [[Dream]], [[Hollowing]], [[Night]], [[Sun]]. Every other documented Cognition now loads.

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
- **Learnability:** Chaos & Order — impossible by ordinary means. Imagination — theoretically learnable, practically divine-only.
- **Requirements:** Chaos & Order — none learnable. Imagination — all other Divine Law Cognitions.
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
- **Roster typo:** the learn table lists both "Lighting" and "Lightning." Only [[Lightning]] is real; the "Lighting" row should be deleted from [[Learning Cognitions]].
- **Opposing Cognitions** are intentionally *not* in this index — legacy data conflicts (e.g. Fire opposed Water in old lore but [[Ice]] in the current file). Reconcile per-document, not here.
- **Tier III+ requirements** were assigned by concept and may be tuned freely; they are balance scaffolding, not locked canon.
