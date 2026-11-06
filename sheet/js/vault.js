// Reading an item out of the Obsidian vault.
//
// Every magic item in this campaign already has a note — Dreammaker has 11 kilobytes of it — and
// retyping its weight, its charges and its four features into the sheet by hand is both tedious and
// the reason a sheet drifts from canon. So an item on the sheet can carry the LINK to its note, and
// the note can carry a hidden block the sheet reads back: one place to write an item, two places to
// read it.
//
// WHY THIS WORKS AT ALL, in two parts, both verified against the live site on 2026-11-03:
//
//  1. Obsidian Publish serves the RAW markdown of every published note from its access endpoint,
//     with `Access-Control-Allow-Origin: *` on it. So the sheet can read a note straight from the
//     browser — no proxy on our server, nothing to keep in step, and it works the same on Railway
//     and on a file:// copy.
//  2. An Obsidian comment — `%% … %%` — is never rendered, in the app or on the published site, but
//     it IS in the raw markdown the endpoint hands back. That is the whole trick: the block is
//     invisible to a player reading the page and plain text to the tool reading the file. HTML
//     comments behave the same way and are accepted too, for anyone who prefers them.
//
// THE FORMAT, `av-item`, is JSON rather than XML. Juan asked for "xml/json"; JSON is what the rest
// of this repo already speaks (every Cognition, both compendium bundles), it is one line to parse
// and impossible to half-parse, and the error a typo produces says which character broke it. An XML
// reader here would be a second hand-written parser earning nothing.
//
//     %%av-item
//     { "name": "Dreammaker", "slot": "mainHand", "weight": 2.25, ... }
//     %%
//
// NOTHING FROM A NOTE IS TRUSTED AS WRITTEN. It is Juan's own vault, so this is not a defence
// against an attacker — it is a defence against a typo quietly corrupting a sheet that then saves
// itself to the server. Every number is clamped, every id is checked against the engine's own
// lists, every string is cut to the length its field holds, and anything that does not survive
// comes back as a WARNING the import dialog shows, rather than being dropped in silence.

// `rules.js` and nothing else: this file has to be importable without a DOM, both because
// `node --test sheet/test/` runs it and because a data layer that needs the view in order to
// validate a number is a data layer in the wrong place. The targets an effect may point at are
// `rules.MOD_TARGET_IDS` — the same list the item dialog builds its menu from, so a note can never
// ask for something the sheet has no row for.
import * as rules from "./rules.js";

// The published site. `uid` is the one in `window.siteInfo` on any page of the site; it identifies
// the site rather than guarding it, and it only changes if the site is torn down and republished.
// If the sheet ever starts answering "that note is not on the published site" for every note, this
// is the line to check first — view-source on publish.obsidian.md/once-upon-a-star has the current
// value.
export const SITE = {
  slug: "once-upon-a-star",
  uid: "2e45ee005233c0cf5c4ff399bd570619",
  pageBase: "https://publish.obsidian.md",
  accessBase: "https://publish-01.obsidian.md/access",
};

// A note is markdown. Dreammaker, the longest item in the vault, is 12 KB; a megabyte means
// something has gone wrong and is not worth parsing.
const MAX_NOTE = 1_000_000;
const MAX_FEATURES = 24;
const MAX_EFFECTS = 12;
const MAX_DEFENCES = 16;                               // one per damage type is the honest ceiling
const MAX_ATTACKS = 6;

// ── the link ────────────────────────────────────────────────────────────
// Obsidian writes a space in a publish URL as `+`, and a literal plus as `%2B` — so the swap below
// is safe in both directions, and it is the reason `decodeURIComponent` alone is not enough.
const decodeSeg = s => {
  try { return decodeURIComponent(String(s).replace(/\+/g, "%20")); } catch { return String(s); }
};

// Accepts what a player will actually paste: the page link out of their browser, the raw access
// link, or the vault path on its own. Anything pointing anywhere other than our own site is
// refused by name — this field reads a URL and must not become a way to pull arbitrary pages into
// a character sheet.
export function parseVaultLink(input) {
  const s = String(input || "").trim();
  if (!s) throw new Error("Paste the note's link first.");

  let path = s;
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) {
    let u;
    try { u = new URL(s); } catch { throw new Error("That is not a link."); }
    if (u.protocol !== "https:" && u.protocol !== "http:")
      throw new Error("Paste the note's link from publish.obsidian.md.");
    const host = u.hostname.toLowerCase();
    const segs = u.pathname.split("/").filter(Boolean).map(decodeSeg);
    if (host === "publish.obsidian.md") {
      if (segs.shift() !== SITE.slug) throw new Error("That link is to a different Obsidian site.");
    } else if (/^publish-\d+\.obsidian\.md$/.test(host)) {
      if (segs.shift() !== "access" || segs.shift() !== SITE.uid)
        throw new Error("That link is to a different Obsidian site.");
    } else {
      throw new Error("Only links to our own Obsidian vault can be read.");
    }
    path = segs.join("/");
  }

  path = path.replace(/^\/+|\/+$/g, "").replace(/\.md$/i, "");
  if (!path) throw new Error("That link does not point at a note.");
  // `..` cannot escape anything here — the endpoint is flat — but a path containing one is a
  // mistake rather than a note, and saying so beats a confusing 404.
  if (path.split("/").some(p => !p || p === "." || p === ".."))
    throw new Error("That link does not point at a note.");

  const enc = path.split("/").map(encodeURIComponent).join("/");
  return {
    path,
    title: path.split("/").pop(),
    page: `${SITE.pageBase}/${SITE.slug}/${enc}`,
    raw: `${SITE.accessBase}/${SITE.uid}/${enc}.md`,
  };
}

// ── the note ────────────────────────────────────────────────────────────
export async function fetchNote(link) {
  const ref = parseVaultLink(link);
  let r;
  try {
    r = await fetch(ref.raw, { credentials: "omit", cache: "no-cache" });
  } catch {
    throw new Error("Couldn't reach the published vault — check you are online.");
  }
  if (!r.ok) throw new Error(`The published vault answered ${r.status}.`);
  const text = await r.text();
  // The access endpoint answers 200 for a note that is not there and says so in the body, which is
  // why this is a string check rather than a status check.
  if (/^#*\s*Not Found\s*$/m.test(text.slice(0, 300)))
    throw new Error("That note is not on the published site — check the path, or publish it.");
  if (text.length > MAX_NOTE) throw new Error("That note is too long to read.");
  return { ...ref, text };
}

// ── the hidden block ────────────────────────────────────────────────────
// Two forms, because both are invisible in Obsidian and on the published site: the native comment
// and the HTML one. The tag is matched case-insensitively and may be followed by anything on its
// own line, so `%%av-item v1` reads the same as `%%av-item`.
const BLOCK_PATTERNS = [
  /%%[ \t]*av-item\b[^\n]*([\s\S]*?)%%/gi,
  /<!--[ \t]*av-item\b[^\n]*([\s\S]*?)-->/gi,
];

// A fence inside the comment is for Obsidian's benefit — it makes the JSON readable in source mode
// — and means nothing here, so it comes off before parsing.
const unfence = s => String(s)
  .replace(/^\s*```+[a-z0-9-]*[ \t]*\r?\n?/i, "")
  .replace(/\r?\n?[ \t]*```+\s*$/, "")
  .trim();

export function hasBlock(text) {
  return BLOCK_PATTERNS.some(re => { re.lastIndex = 0; return re.test(String(text || "")); });
}

// Every item the note declares, in the order it declares them. A block may hold one object, an
// array, or `{ "items": [...] }` — a note that covers a set (the four Knight's Standards) should
// not need four blocks.
export function readBlocks(text) {
  const out = [];
  for (const re of BLOCK_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(String(text || "")))) {
      const body = unfence(m[1]);
      if (!body) continue;
      let data;
      try {
        data = JSON.parse(body);
      } catch (err) {
        throw new Error(`The note's hidden block is not valid JSON — ${err.message}`);
      }
      const list = Array.isArray(data) ? data
        : (data && Array.isArray(data.items)) ? data.items
        : [data];
      for (const one of list) if (one && typeof one === "object" && !Array.isArray(one)) out.push(one);
    }
  }
  return out;
}

// ── turning a block into sheet records ──────────────────────────────────
const TARGETS = new Set(rules.MOD_TARGET_IDS);
const DERIVABLE = new Set(rules.DERIVE_FROM.map(d => d.id));
const TIMES = rules.DERIVE_TIMES.map(t => t.value);

const line = (v, max) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const body = (v, max) => String(v ?? "").replace(/\r\n/g, "\n").trim().slice(0, max);
const bool = v => v === true || v === "true" || v === 1;
const dec = (v, lo, hi, dflt = 0) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(hi, Math.max(lo, n));
};
const int = (v, lo, hi, dflt = 0) => Math.round(dec(v, lo, hi, dflt));

const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "").slice(0, 40) || "item";

// Which features on a sheet came from which imported item. A second import of the same note
// replaces its own features instead of adding a second copy of each — keyed on the item's NAME,
// because that is the one thing a player will not change behind the importer's back, and because a
// re-import onto a second character has to behave the same way as the first.
export const featurePrefix = name => `item:${slug(name)}:`;
export const attackPrefix = name => `item:${slug(name)}:atk:`;

// The closest multiplier the engine actually has. A note asking for ×1.5 gets ×1 and says so,
// rather than being silently rounded into a number nobody chose.
const nearestTimes = v => {
  const n = Number(v);
  if (!Number.isFinite(n)) return { times: 1, exact: true };
  const best = TIMES.reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a), TIMES[0]);
  return { times: best, exact: best === n };
};

// A condition in words, off an effect. It is never read as a rule — the sheet cannot check "under
// the sun" — so all this does is carry the sentence through and leave the effect DISARMED. The
// block is deliberately given no way to say `on`: whether a condition holds right now is a fact
// about this moment at the table, not about the item, so a read must never arm one. (CS-092)
const when = e => {
  const w = line(e?.when ?? e?.only ?? e?.condition, 120);
  return w ? { when: w } : {};
};

export function normalizeBlock(raw, { page = "" } = {}) {
  const warn = [];
  const name = line(raw.name ?? raw.item ?? raw.title, 80);
  if (!name) throw new Error("The hidden block has no `name`, so there is no item to add.");

  // The slot the note asks for, if it asks for one — the whole point of naming it is that an
  // imported ring can go straight onto a finger rather than into the pack.
  let slot = null;
  const wanted = line(raw.slot, 20);
  if (wanted) {
    const hit = Object.keys(rules.SLOT_BY_ID).find(id => id.toLowerCase() === wanted.toLowerCase());
    if (hit) slot = hit;
    else warn.push(`"${wanted}" is not a slot on this sheet, so it goes to the pack.`);
  }

  // Where it stands on the dream axis. `dreamlike` and `lucidlike` are different items with
  // different costs, so the note has to say WHICH — the retired `insomniaOnly: true` is still read,
  // and still means Dreamlike, for blocks written before the axis had three values.
  let dream = line(raw.dream, 12).toLowerCase();
  if (dream === "none" || dream === "ephemer") dream = "";
  if (dream && !rules.DREAM_BY_ID[dream]) {
    warn.push(`"${dream}" is not a dream kind — write "dreamlike" or "lucidlike". Treated as neither.`);
    dream = "";
  }
  if (!dream && bool(raw.insomniaOnly ?? raw.dreamlike)) dream = "dreamlike";

  // Charges. `max` of nothing means an item with no charges, which the engine tells apart from one
  // with none left, so the field is left null rather than zeroed.
  let charges = null;
  const cRaw = raw.charges && typeof raw.charges === "object" ? raw.charges : null;
  const cMax = int(cRaw ? cRaw.max : raw.charges, 0, 99, 0);
  if (cMax > 0) {
    let recharge = line(cRaw?.recharge ?? raw.recharge, 12).toLowerCase() || "manual";
    if (!rules.RECHARGE_BY_ID[recharge]) {
      warn.push(`"${recharge}" is not a recharge this sheet knows, so it is set to manual.`);
      recharge = "manual";
    }
    charges = {
      max: cMax,
      used: int(cRaw?.used, 0, cMax, 0),
      recharge,
      regain: line(cRaw?.regain ?? raw.regain, 12) || "all",
    };
  }

  // Effects, the same `{ target, amount }` or `{ target, from, times }` pairs a hand-written one
  // uses, so an imported item shows up in the breakdown with the item's own name on it.
  const effects = [];
  for (const e of (Array.isArray(raw.effects) ? raw.effects : []).slice(0, MAX_EFFECTS)) {
    if (!e || typeof e !== "object") continue;
    const target = line(e.target, 40);
    if (!TARGETS.has(target)) {
      warn.push(`"${target || "(blank)"}" is not something the sheet can change, so that effect is left out.`);
      continue;
    }
    const from = line(e.from, 12).toLowerCase();
    if (from) {
      if (!DERIVABLE.has(from)) {
        warn.push(`"${from}" is not a score an effect can be derived from, so that effect is left out.`);
        continue;
      }
      const { times, exact } = nearestTimes(e.times ?? 1);
      if (!exact) warn.push(`${target} can be derived at half, once, twice or three times — ${e.times} became ${times}.`);
      effects.push({ target, amount: 0, from, times, ...when(e) });
    } else {
      const amount = int(e.amount, -20, 20, 0);
      if (!amount) {
        warn.push(`${target} has no amount, so that effect is left out.`);
        continue;
      }
      effects.push({ target, amount, ...when(e) });
    }
  }

  // Features. These land under "Items" on the Character tab, which is where a player hunting
  // "what does Dawnbreak do" already looks.
  const prefix = featurePrefix(name);
  const features = [];
  for (const f of (Array.isArray(raw.features) ? raw.features : []).slice(0, MAX_FEATURES)) {
    if (!f || typeof f !== "object") continue;
    const fName = line(f.name, 80);
    if (!fName) continue;
    // How it recharges, in the engine's own vocabulary. A note that does not say is left saying
    // nothing, and the rest preview then leaves that feature alone rather than guessing (CS-089).
    let reset = line(f.reset ?? f.recharge, 12).toLowerCase();
    if (reset === "short") reset = "s";
    if (reset === "long") reset = "l";
    if (reset === "day" || reset === "daily") reset = "dawn";
    // CS-096, built 2026-11-04: the vocabulary the Item Vault actually uses. Six entries say
    // "once per week", one "per session", one "per Cycle", two carry a Recharge 5–6, and nine
    // name a stretch of real time. Each is now a value rather than a shrug.
    if (reset === "weekly" || reset === "week") reset = "week";
    if (reset === "per session" || reset === "session") reset = "session";
    if (reset === "per cycle" || reset === "cycle") reset = "cycle";
    if (reset === "recharge" || reset === "d6") reset = "d6";
    if (reset === "hours" || reset === "time") reset = "after";
    if (reset && !rules.FEATURE_RESET_BY_ID[reset]) {
      warn.push(`"${f.reset ?? f.recharge}" is not a recharge for ${fName}, so it comes back by hand.`);
      reset = "";
    }
    // What it costs to use. Optional, and refused loudly rather than guessed at: a cost the engine
    // has no row for would put the feature on the Combat tab wearing a label nothing understands.
    let cost = line(f.cost ?? f.action, 12).toLowerCase();
    if (cost === "bonus action") cost = "bonus";
    if (cost === "an action" || cost === "full") cost = "action";
    if (cost && !rules.COST_IDS.includes(cost)) {
      warn.push(`"${f.cost ?? f.action}" is not an action cost for ${fName}, so its own words are read instead.`);
      cost = "";
    }
    // Uses: a plain number, or DERIVED the way an effect's amount is — `"uses": { "from": "prof" }`
    // — because "a number of times equal to your proficiency bonus" is how nineteen entries in the
    // Item Vault word it (CS-088), and a count written out once goes stale at the next level.
    let uses = int(f.uses, 0, 12, 0);
    const uRaw = f.uses && typeof f.uses === "object" ? f.uses : null;
    if (uRaw) {
      const uFrom = line(uRaw.from, 12).toLowerCase();
      if (!DERIVABLE.has(uFrom)) {
        warn.push(`"${uRaw.from ?? "(blank)"}" is not a score ${fName}'s uses can come from, so it has none.`);
      } else {
        const { times, exact } = nearestTimes(uRaw.times ?? 1);
        if (!exact) warn.push(`${fName}'s uses can be derived at half, once, twice or three times — ${uRaw.times} became ${times}.`);
        uses = { from: uFrom, times };
      }
    }
    features.push({
      id: `${prefix}${slug(fName)}`,
      name: fName,
      source: "item",
      text: body(f.text ?? f.description, 2000),
      uses,
      used: 0,
      reset,
      // The words for a recharge the sheet has no clock for — "12 hours", "7 days". Carried only
      // where it means something, so an ordinary rest feature stays clean.
      ...(reset === "after" ? { after: line(f.after ?? f.time, 40) } : {}),
      // Which face a Recharge 5–6 needs. 5 unless the note says otherwise, since that is what
      // nearly every published one asks for.
      ...(reset === "d6" ? { rechargeOn: int(f.rechargeOn ?? f.on, 2, 6, 5) } : {}),
      // The feature's OWN save DC, which is never the character's (CS-093). Carried so it can be
      // shown on the pip row instead of being buried in prose — nineteen items state one.
      dc: int(f.dc ?? f.saveDc, 0, 40, 0),
      // What it costs to use, which puts it on the Combat tab beside the attacks. Optional: 173 of
      // the vault's 550 features already say it in their own prose and `rules.featureCost` reads
      // that, so a note only needs this where the words are ambiguous — or where it is "Passive."
      // and the reader should not go looking.
      ...(cost ? { cost } : {}),
    });
  }

  // Defences the item GRANTS (CS-104). Sixteen entries in the Item Vault hand one out — the
  // Steeldoor Harness alone grants four — and until this existed every one had to be typed into the
  // Defences bar by hand and then remembered when the armour came off, which is the half nobody
  // ever does. Read from a slot like any other effect, so it leaves with the item.
  //
  // A note writes the standing the way a rulebook does — "resistance", "immunity" — and the three
  // the engine actually holds are `resistant` / `immune` / `vulnerable`, so both are accepted.
  const defences = [];
  for (const d of (Array.isArray(raw.defences) ? raw.defences : []).slice(0, MAX_DEFENCES)) {
    if (!d || typeof d !== "object") continue;
    const type = line(d.type ?? d.damage, 24).toLowerCase();
    let standing = line(d.standing ?? d.as, 16).toLowerCase();
    if (standing === "resistance") standing = "resistant";
    if (standing === "immunity") standing = "immune";
    if (standing === "vulnerability") standing = "vulnerable";
    if (!rules.DAMAGE_BY_ID[type]) {
      warn.push(`"${type || "(blank)"}" is not a damage type this sheet knows, so that defence is left out.`);
      continue;
    }
    if (!rules.STANDING_BY_ID[standing]) {
      warn.push(`"${standing || "(blank)"}" is not a standing — write resistant, immune or vulnerable. ${
        rules.DAMAGE_BY_ID[type].name} is left out.`);
      continue;
    }
    defences.push({ type, standing });
  }

  // Armour that SETS the base AC rather than adding to it (CS-108). Ten of the twenty-nine
  // entries in `Item Vault/Armor` do this — "your AC is 13 + your Dexterity modifier", "+2 Plate
  // (base AC 20)" — and `ac` could never say it, because `ac` ADDS to the number already typed.
  //
  // `{ base, from, cap, from2 }`: a number, an ability to add, a ceiling on that ability (medium
  // armour caps Dexterity at +2, and Ferracortex says so), and a second ability for Merigold's,
  // which reads both Intelligence and Wisdom.
  let baseAc = null;
  const bRaw = raw.baseAc ?? raw.baseAC ?? raw.armorClass;
  if (bRaw && typeof bRaw === "object") {
    const base = int(bRaw.base ?? bRaw.ac, 0, 30, 0);
    if (!base) {
      warn.push("The base AC has no number, so the item sets none and your own stands.");
    } else {
      const pick = (k, capK) => {
        const id = line(bRaw[k], 12).toLowerCase();
        if (!id) return {};
        if (!DERIVABLE.has(id)) {
          warn.push(`"${bRaw[k]}" is not a score a base AC can read, so it is left out of the total.`);
          return {};
        }
        const cap = bRaw[capK];
        return { [k]: id, ...(cap == null || cap === "" ? {} : { [capK]: int(cap, 0, 10, 0) }) };
      };
      baseAc = { base, ...pick("from", "cap"), ...pick("from2", "cap2") };
    }
  }

  // Attacks, for the reason the example link Juan sent is a weapon: an imported Flagship blade that
  // lands with nothing to roll has not really been added to the sheet. Damage is a dice expression
  // the sheet already knows how to roll; the bonus is whatever the note says and the player's to
  // correct.
  const atkPrefix = attackPrefix(name);
  const attacks = [];
  for (const a of (Array.isArray(raw.attacks) ? raw.attacks : []).slice(0, MAX_ATTACKS)) {
    if (!a || typeof a !== "object") continue;
    const damage = line(a.damage ?? a.dmg, 40);
    if (!damage) continue;
    const aName = line(a.name, 60) || name;
    // A weapon whose dice grow with the character (CS-087). "1d8, 2d8 at 11th, 3d8 at 17th" is
    // nine entries' wording, and the row used to be frozen at the first step with the rest in
    // prose — authoritative and wrong for most of the party.
    const steps = [];
    for (const s of (Array.isArray(a.steps) ? a.steps : []).slice(0, 8)) {
      if (!s || typeof s !== "object") continue;
      const at = int(s.at ?? s.level, 1, 20, 0);
      if (!at) {
        warn.push(`A step on ${aName} names no level, so it is left out.`);
        continue;
      }
      const dmg = line(s.damage ?? s.dmg, 40);
      const bonus = s.bonus == null ? null : int(s.bonus, -20, 30, 0);
      if (!dmg && bonus == null) continue;
      steps.push({ at, ...(dmg ? { damage: dmg } : {}), ...(bonus == null ? {} : { bonus }) });
    }
    attacks.push({
      id: `${atkPrefix}${slug(aName)}`,
      name: aName,
      bonus: int(a.bonus, -20, 30, 0),
      damage,
      type: line(a.type ?? a.damageType, 24),
      ...(steps.length ? { steps: steps.sort((x, y) => x.at - y.at) } : {}),
    });
  }

  const item = {
    name,
    qty: int(raw.qty ?? raw.quantity, 1, 999, 1),
    weight: Math.round(dec(raw.weight, 0, 9999, 0) * 100) / 100,
    value: Math.round(dec(raw.value ?? raw.cost, 0, 9_999_999, 0) * 100) / 100,
    notes: line(raw.notes ?? raw.subtitle, 160),
    magical: bool(raw.magical ?? raw.magic),
    requiresAttunement: bool(raw.requiresAttunement ?? raw.attunement),
    attuned: bool(raw.attuned),
    dream,
    charges,
    effects,
    defences,
    ...(baseAc ? { baseAc } : {}),
    // The link travels WITH the item, so the row on the Gear tab can open the note it came from and
    // a later re-read needs nothing typed again.
    vault: page || line(raw.vault ?? raw.link, 500),
  };

  return { item, slot, features, attacks, warnings: warn };
}

// Everything the note declares, ready for the import dialog: one entry per hidden block item.
export async function readItemsFromNote(link) {
  const note = await fetchNote(link);
  const blocks = readBlocks(note.text);
  if (!blocks.length) {
    throw new Error(hasBlock(note.text)
      ? "That note's hidden block is empty."
      : "That note has no hidden av-item block — add one and publish it again.");
  }
  return {
    note,
    entries: blocks.map(b => normalizeBlock(b, { page: note.page })),
  };
}
