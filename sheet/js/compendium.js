// The 5e catalogue: what the sheet knows about races, classes, backgrounds, feats, spells and items.
//
// Two sources, merged. `data/srd-*.json` ships with the repo because the SRD is openly licensed;
// anything else is content the DM imported, which lives in the database and arrives over the API.
// A DM-imported entry wins over an SRD one of the same name, so a campaign variant of a class can
// replace the standard definition without the standard one being edited.
//
// The spell and item catalogues are only fetched when someone actually searches them — together
// they are half a megabyte, and most evenings nobody opens them at all.

import { api, state, mutate, emit } from "./store.js";
import * as rules from "./rules.js";
import { esc, dialog, closeDialog, toast } from "./pop.js";

const CACHE = {};
const load = (key, url) => (CACHE[key] ||= api("GET", url).catch(err => {
  delete CACHE[key];                       // a failed fetch must not poison the cache forever
  throw err;
}));

export const core = () => load("core", "data/srd-core.json?v=2026-10-27a");
export const spells = () => load("spells", "data/srd-spells.json?v=2026-10-27a");
export const items = () => load("items", "data/srd-items.json?v=2026-10-27a");
// What the DM imported, ONE KIND AT A TIME. It was the whole library in one request until a DM
// imported their books and it became megabytes: opening the spell list downloaded two thousand
// items as well. An empty list is the normal answer here and must never be an error — a deployment
// with nothing imported is the usual case.
export const custom = kind =>
  load(`custom:${kind}`, `../api/compendium?kind=${encodeURIComponent(kind)}`)
    .catch(() => ({ entries: [] }));

const PLURAL = { race: "races", class: "classes", background: "backgrounds", feat: "feats",
  spell: "spells", item: "items" };
export const KIND_LABEL = { race: "Ancestries", class: "Classes", background: "Backgrounds",
  feat: "Feats", spell: "Spells", item: "Items" };

// One kind, SRD and imported together, imported winning on a name collision.
export async function catalogue(kind) {
  const base = kind === "spell" ? (await spells()).spells
    : kind === "item" ? (await items()).items
    : (await core())[PLURAL[kind]] || [];
  const mine = ((await custom(kind)).entries || []).map(e => ({ ...e.data, source: e.source }));
  const byName = new Map(base.map(e => [e.name.toLowerCase(), e]));
  for (const e of mine) byName.set(String(e.name).toLowerCase(), e);
  return [...byName.values()].sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

export const find = async (kind, name) =>
  (await catalogue(kind)).find(e => String(e.name).toLowerCase() === String(name).toLowerCase()) || null;

// Every class the sheet can read, keyed by lower-cased name — the shape rules.js wants so its
// derivation can stay pure and never fetch anything itself.
export async function classDefs() {
  return Object.fromEntries((await catalogue("class")).map(c => [String(c.name).toLowerCase(), c]));
}

// The ONE place a derived feature is ever written. Everything that changes the classes themselves —
// taking a class, choosing a subclass, picking from a menu, moving a level between classes, a
// LEVEL UP — hands the new class list to this, and everything the classes imply follows: features,
// resources, saving throws, the hit-dice pool and the spell slots. `write` is anything the caller
// wants saved in the same breath, so a level and its ability score improvement are one save.
export async function syncClasses(nextClasses, write) {
  const defs = await classDefs();
  const classes = (nextClasses || []).filter(c => c && c.name).map(c => ({
    name: String(c.name), level: Math.max(0, Number(c.level) || 0),
    subclass: c.subclass || "", picks: c.picks || {},
  }));
  const plan = rules.featurePlan(classes, defs);
  const primary = classes[0] ? rules.classDef(defs, classes[0].name) : null;
  const prof = primary ? classProficiencies(primary) : { saves: [], skills: [] };

  mutate(s => {
    s.classes = classes;
    s.features = rules.reconcileFeatures(s.features || [], plan.granted).features;
    const pool = rules.hitDicePool(classes, defs);
    if (pool) s.hitDice = pool;
    // Saving throws come from the FIRST class only: 2014 multiclassing grants armour, weapons and
    // tools, never a second set of saves. Nothing on the sheet sets them by hand, so they are
    // derived outright rather than merged with something a player might have typed.
    if (primary) {
      s.saves = s.saves || {};
      for (const id of Object.keys(s.saves)) delete s.saves[id];
      for (const id of prof.saves) s.saves[id] = true;
      s.skillChoices = prof.skills.length ? { from: prof.skills, pick: primary.numSkills || 0 } : null;
    }
    // Slots are written only where they are known exactly. With two casting classes the 2014
    // multiclass table is a progression of its own, so the player's own numbers are left alone and
    // the sheet says so instead of overwriting them with one class's column.
    if (plan.slots) {
      const slots = {};
      plan.slots.forEach((n, i) => {
        if (n) slots[i + 1] = { max: n, used: Math.min(Number(s.spells?.slots?.[i + 1]?.used) || 0, n) };
      });
      s.spells = { ...(s.spells || {}), slots, cantripsKnown: plan.cantripsKnown };
    }
    if (typeof write === "function") write(s);
  }, { now: true });

  return { plan, defs, classes };
}

// What the classes currently imply, kept on `state` so the view — which is synchronous and must
// never fetch — can read it. Recomputed when the character or its class list changes, and null
// until the catalogue has answered, which is why every reader treats null as "not yet".
export async function refreshClassPlan() {
  const c = state.current;
  if (!c) { state.classPlan = null; return emit(); }
  try {
    state.classPlan = rules.featurePlan(c.sheet.classes || [], await classDefs());
  } catch {
    state.classPlan = null;            // offline, or the catalogue is unreachable; the sheet still works
  }
  emit();
}

// ── the searchable drawer ───────────────────────────────────────────────
// Everything in one dialog with a kind switcher, because the alternative is six dialogs that each
// need finding. The search is on the name and, for spells, the classes that get them.
let openKind = "spell", openQuery = "", chosen = null;

export async function openCompendium(kind = openKind) {
  openKind = kind; chosen = null;
  dialog("Compendium", `<p class="hint">Loading…</p>`, { wide: true });
  await drawCompendium();
}

async function drawCompendium() {
  const d = document.getElementById("dlg");
  if (!d?.open) return;
  let list = [];
  try { list = await catalogue(openKind); }
  catch (err) {
    d.querySelector(".dlg-b").innerHTML = `<p class="hint hot">${esc(err.message)}</p>`;
    return;
  }
  const q = openQuery.trim().toLowerCase();
  const hits = (q ? list.filter(e => matches(e, q)) : list).slice(0, 300);

  d.querySelector(".dlg-b").innerHTML = `
    <div class="tabs cmp-tabs">${Object.keys(KIND_LABEL).map(k =>
      `<button class="tab ${k === openKind ? "on" : ""}" data-act="cmp-kind" data-id="${k}">${KIND_LABEL[k]}</button>`).join("")}</div>
    <input class="txt" id="cmpQ" placeholder="Search ${esc(KIND_LABEL[openKind].toLowerCase())}"
      value="${esc(openQuery)}" autocomplete="off" aria-label="Search the compendium">
    <div class="cmp">
      <div class="cmp-list">${hits.length ? hits.map(e => `
        <button class="listrow ${chosen === e.name ? "on" : ""}" data-act="cmp-pick" data-id="${esc(e.name)}">
          <b>${esc(e.name)}</b><span>${esc(subtitle(openKind, e))}</span></button>`).join("")
        : `<p class="hint">Nothing matches.</p>`}</div>
      <div class="cmp-read">${chosen ? entryHtml(openKind, hits.find(e => e.name === chosen) || list.find(e => e.name === chosen))
        : `<p class="hint">${list.length} entr${list.length === 1 ? "y" : "ies"}. Pick one to read it.
             ${openKind === "background" || openKind === "feat"
               ? "The SRD carries only one of these — your DM can import the rest."
               : ""}</p>`}</div>
    </div>`;

  const input = d.querySelector("#cmpQ");
  input.oninput = () => { openQuery = input.value; drawCompendium().then(() => {
    const el = document.getElementById("cmpQ");
    if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
  }); };
  if (!chosen) input.focus();
}

function matches(e, q) {
  if (String(e.name).toLowerCase().includes(q)) return true;
  if (e.classes && String(e.classes).toLowerCase().includes(q)) return true;
  if (e.type && String(e.type).toLowerCase().includes(q)) return true;
  return false;
}

function subtitle(kind, e) {
  if (kind === "spell") return `${e.level ? `Level ${e.level}` : "Cantrip"} · ${e.school || ""}`;
  if (kind === "item") return [e.type, e.magic ? "magic" : ""].filter(Boolean).join(" · ");
  if (kind === "class") {
    const { saves } = classProficiencies(e);
    return `d${e.hd || "?"}${saves.length ? ` · ${saves.map(s => s.toUpperCase()).join(" ")} saves` : ""}`;
  }
  if (kind === "race") return e.ability || e.size || "";
  if (kind === "feat") return e.prerequisite || "";
  return e.proficiency || "";
}

function entryHtml(kind, e) {
  if (!e) return `<p class="hint">Gone.</p>`;
  const rows = [];
  const add = (k, v) => { if (v !== undefined && v !== null && v !== "") rows.push([k, v]); };
  if (kind === "spell") {
    add("Level", e.level ? e.level : "Cantrip"); add("School", e.school);
    add("Casting time", e.time); add("Range", e.range); add("Components", e.components);
    add("Duration", e.duration); add("Classes", e.classes); add("Ritual", e.ritual ? "yes" : "");
  } else if (kind === "item") {
    add("Type", e.type); add("Detail", e.detail);
    add("Damage", [e.dmg1, e.dmg2 && `(${e.dmg2})`, e.dmgType].filter(Boolean).join(" "));
    add("Properties", e.property); add("AC", e.ac); add("Weight", e.weight && `${e.weight} lb`);
    add("Value", e.value && `${e.value} gp`); add("Range", e.range); add("Stealth", e.stealth);
  } else if (kind === "class") {
    const { saves, skills } = classProficiencies(e);
    add("Hit die", e.hd && `d${e.hd}`);
    add("Saving throws", saves.map(s => ({ str: "Strength", dex: "Dexterity", con: "Constitution",
      int: "Intelligence", wis: "Wisdom", cha: "Charisma" }[s])).join(", "));
    add("Skills", skills.length ? `choose ${e.numSkills || 0} of ${skills.join(", ")}` : e.numSkills);
    add("Armour", e.armor); add("Weapons", e.weapons); add("Tools", e.tools); add("Wealth", e.wealth);
  } else if (kind === "race") {
    add("Size", e.size); add("Speed", e.speed); add("Ability", e.ability); add("Proficiency", e.proficiency);
  } else {
    add("Prerequisite", e.prerequisite); add("Proficiency", e.proficiency);
  }

  const levels = kind === "class" && e.levels
    ? Object.entries(e.levels).sort((a, b) => a[0] - b[0]).map(([lv, row]) => `
        <div class="cmp-lv"><b>Level ${lv}</b>${row.scoreImprovement ? `<span class="tag">ability score improvement</span>` : ""}
          ${(row.features || []).map(f => `<span class="chip">${esc(f.name)}</span>`).join("")}
          ${row.slots ? `<span class="hint">slots ${row.slots.slice(1).filter(Boolean).join("/") || "—"}</span>` : ""}</div>`).join("")
    : "";

  return `<h4>${esc(e.name)}${e.source ? ` <span class="tag">${esc(e.source)}</span>` : ""}</h4>
    ${rows.length ? `<ul class="why">${rows.map(([k, v]) => `<li><span>${esc(k)}</span><b>${esc(v)}</b></li>`).join("")}</ul>` : ""}
    ${(e.traits || []).map(t => `<p class="cmp-t"><b>${esc(t.name)}</b> ${esc(t.text)}</p>`).join("")}
    ${e.text ? `<p class="cmp-body">${esc(e.text)}</p>` : ""}
    ${levels}
    ${ADDABLE[kind] ? `<div class="cmp-do"><button class="btn sm pri" data-act="cmp-apply" data-id="${esc(e.name)}">${ADDABLE[kind]}</button></div>` : ""}`;
}

const ADDABLE = { race: "Make this my ancestry", background: "Make this my background",
  class: "Take this class", feat: "Add as a feature", item: "Add to my attacks", spell: "" };

export function setKind(k) { openKind = k; chosen = null; openQuery = ""; return drawCompendium(); }
export function pick(name) { chosen = name; return drawCompendium(); }
export const currentKind = () => openKind;

// ── applying a choice to the sheet ──────────────────────────────────────
// A racial bonus is recorded as a permanent named modifier rather than written into the base score.
// That way the sheet can always say WHY Strength is 16 when 14 was typed, and swapping ancestry
// removes the old one cleanly instead of leaving two points nobody can account for.
const ABILITY_KEY = { str: "str", strength: "str", dex: "dex", dexterity: "dex", con: "con",
  constitution: "con", int: "int", intelligence: "int", wis: "wis", wisdom: "wis",
  cha: "cha", charisma: "cha" };

export function parseAbilityLine(line) {
  const out = [];
  for (const m of String(line || "").matchAll(/([A-Za-z]+)\s*([+-]\s*\d+)/g)) {
    const id = ABILITY_KEY[m[1].toLowerCase()];
    if (id) out.push({ id, amount: Number(m[2].replace(/\s+/g, "")) });
  }
  return out;
}

const tagged = (tag, name) => `${tag}: ${name}`;

// A class's <proficiency> is one comma-separated list holding two different things: the saving
// throws it grants outright ("Dexterity Saving Throws") and the skills it may CHOOSE from. Reading
// it as a flat list of abilities is how a Rogue ends up with no proficient saves at all.
export function classProficiencies(e) {
  const saves = [], skills = [];
  for (const part of String(e.proficiency || "").split(",")) {
    const t = part.trim();
    if (!t) continue;
    const m = /^(.*?)\s+saving\s+throws?$/i.exec(t);
    if (m) { const id = ABILITY_KEY[m[1].trim().toLowerCase()]; if (id) saves.push(id); }
    else skills.push(t);
  }
  return { saves, skills };
}

export async function applyEntry(kind, name) {
  const e = await find(kind, name);
  if (!e) return toast("That entry is gone.");

  if (kind === "race") {
    const bumps = parseAbilityLine(e.ability);
    mutate(s => {
      s.ancestry = e.name;
      if (e.speed) s.speed = e.speed;
      // Out with the previous ancestry's bonuses and traits, in with this one's.
      s.modifiers = (s.modifiers || []).filter(m => !String(m.reason || "").startsWith("Ancestry:"));
      for (const b of bumps)
        s.modifiers.push({ id: `anc-${b.id}`, target: `ability:${b.id}`, amount: b.amount,
          reason: tagged("Ancestry", e.name), rounds: null, active: true });
      s.features = (s.features || []).filter(f => f.source !== "ancestry");
      for (const t of e.traits || [])
        s.features.push({ id: `anc-${t.name}`, name: t.name, source: "ancestry", text: t.text });
    });
    return toast(`${e.name} — ${bumps.length ? bumps.map(b => `${b.id.toUpperCase()} ${b.amount > 0 ? "+" : ""}${b.amount}`).join(", ") : "no ability bonus"}`);
  }

  if (kind === "background") {
    mutate(s => {
      s.background = e.name;
      s.features = (s.features || []).filter(f => f.source !== "background");
      for (const t of e.traits || [])
        s.features.push({ id: `bg-${t.name}`, name: t.name, source: "background", text: t.text });
    });
    return toast(`${e.name} — ${e.proficiency || "no listed proficiencies"}`);
  }

  if (kind === "class") {
    const have = (state.current.sheet.classes || []).filter(c => c && c.name);
    if (have.some(c => c.name.toLowerCase() === e.name.toLowerCase()))
      return toast(`${e.name} is already yours. Its levels are on the Character tab.`);
    // The first class takes every level the DM has granted. A second one starts at nothing, because
    // a multiclass character's levels are split rather than added — the total has to keep matching
    // the level the DM set, and only the player knows how they want it split (CS-014).
    const next = have.length
      ? [...have, { name: e.name, level: 0, subclass: "", picks: {} }]
      : [{ name: e.name, level: state.current.level, subclass: "", picks: {} }];
    const { plan } = await syncClasses(next);
    const open = plan.choices.length;
    return toast(have.length
      ? `${e.name} added. Move levels to it on the Character tab.`
      : `${e.name} at level ${state.current.level}.${open ? ` ${open} choice${open > 1 ? "s" : ""} to make.` : ""}`);
  }

  if (kind === "feat") {
    mutate(s => {
      s.features = [...(s.features || []), { id: `feat-${e.name}`, name: e.name, source: "feat", text: e.text }];
    });
    return toast(`${e.name} added to your features.`);
  }

  if (kind === "item") {
    // Only a weapon becomes an attack; everything else would be an attack with nothing to roll.
    if (!e.dmg1) return toast(`${e.name} has no damage — keep it in your notes for now.`);
    mutate(s => {
      s.attacks = [...(s.attacks || []), {
        id: `it-${e.name}`, name: e.name, bonus: 0,
        damage: e.dmg1, type: e.dmgType || "",
      }];
    });
    return toast(`${e.name} added — set its to-hit bonus on the card.`);
  }
}

export { closeDialog };
