// Ephemer — Admin · THE COMPENDIUM
//
// The 5e content the Character Sheet offers. The sheet ships with the SRD because the SRD is
// openly licensed; everything else is imported here and kept in the database, never in the
// repository — which is both the licence answer and the practical one: this deployment is yours,
// and what you own can live in it without being published.
//
// No rail. It is one page about one thing, and a list of one is not a list.

const CMP = { entries: [], preview: null, busy: false, bundle: null, progress: null };
const CMP_LABEL = { race: "ancestries", class: "classes", background: "backgrounds",
  feat: "feats", spell: "spells", item: "items" };

onData(d => { CMP.entries = d.compendium || []; });

section("compendium", {
  mark: "◈", label: "Compendium", title: "The 5e content the Character Sheet offers",
  count: () => CMP.entries.length,
  rail: () => null,
  body: () => renderCompendium(),
});

async function loadCompendium() {
  // The summary, not the library: once a DM imports their books this is thousands of rows, and a
  // listing needs names and counts rather than every spell's text.
  try { CMP.entries = (await api("GET", "api/compendium?summary=1")).entries; } catch (e) { CMP.entries = []; }
}

function renderCompendium() {
  const byKind = {};
  for (const e of CMP.entries) byKind[e.kind] = (byKind[e.kind] || 0) + 1;
  const LABEL = CMP_LABEL;

  return `<div class="cdx"><div class="cdx-hd"><div><h1>Compendium</h1>
      <p class="cdx-desc">What the Character Sheet offers when a player picks an ancestry, a class or
        a spell. The <strong>SRD ships with the app</strong>; anything else you own goes in here.</p></div></div>

    <div class="cdx-sec"><h2>Imported into this deployment</h2>
      ${CMP.entries.length
        ? `<div class="chips">` + Object.entries(byKind).map(([k, n]) =>
            `<span class="chip on">${n} ${esc(LABEL[k] || k)}</span>`).join("") + `</div>`
        : `<div class="cdx-note"><p>Nothing imported yet. Players see the SRD: 9 ancestries, 12 classes,
             317 spells and 432 items — and one background and one feat, which is all the SRD carries.</p></div>`}
    </div>

    <div class="cdx-sec"><h2>Upload a collection</h2>
      <p class="cdx-rings">A whole set of books at once, built from a Fight Club <strong>collection</strong>
        — the manifest that lists which book files belong together. Build the bundle on your own machine:</p>
      <pre class="cdx-pre">node sheet/tools/build-compendium.mjs &lt;collection.xml&gt; &lt;FightClub5eXML folder&gt;</pre>
      <p class="cdx-rings">then pick the <code>compendium-bundle.json</code> it writes. It arrives in batches,
        so a slow connection cannot lose the lot, and uploading the same bundle twice rewrites the same
        rows rather than doubling them. <strong>A class spread across several books is merged into one
        before it gets here</strong> — otherwise the Player's Handbook Fighter and the Xanathar's Fighter
        would land as two classes, one of them without a hit die.</p>
      <div class="adm-form">
        <label for="cmpFile">The bundle</label>
        <input class="search" id="cmpFile" type="file" accept="application/json,.json"
          onchange="cmpPickBundle(this)" ${CMP.busy ? "disabled" : ""}>
        ${CMP.bundle ? `<div class="cdx-defs">` + Object.entries(CMP.bundle.counts || {})
            .filter(([, n]) => n).map(([k, n]) =>
              `<div class="cdx-def"><b>${n}</b><span>${esc(LABEL[k] || k)}</span></div>`).join("") + `</div>
          <p class="cdx-rings">${esc(CMP.bundle.collection || "collection")} · built ${esc(CMP.bundle.builtAt || "")}
            · ${CMP.bundle.entries.length} entries${CMP.bundle.files
              ? ` from ${CMP.bundle.files.read} files` : ""}</p>` : ""}
        <div class="adm-line">
          ${CMP.bundle ? `<button class="mini on" onclick="cmpUploadBundle()" ${CMP.busy ? "disabled" : ""}>
            Upload ${CMP.bundle.entries.length} entries</button>` : ""}
          ${CMP.progress ? `<span class="cdx-rings">${esc(CMP.progress)}</span>` : ""}
        </div>
      </div>
    </div>

    <div class="cdx-sec"><h2>Import a Fight Club compendium</h2>
      <p class="cdx-rings">Paste a Fight Club 5e XML file. It is read first and shows you what it found;
        nothing is saved until you say so. An entry with the same name and source replaces the one
        already here, so re-importing a corrected file is safe. Monsters are ignored — a character
        sheet has no use for stat blocks.</p>
      <div class="adm-form">
        <label for="cmpSource">Where it came from — shown beside every entry it brings</label>
        <input class="search" id="cmpSource" maxlength="80" placeholder="Player's Handbook, our homebrew, ...">
        <label for="cmpXml">The XML</label>
        <textarea class="search par-ta" id="cmpXml" rows="7" spellcheck="false"
          placeholder="&lt;compendium version=&quot;5&quot;&gt; ..."></textarea>
        <div class="adm-line">
          <button class="mini" onclick="cmpPreview()" ${CMP.busy ? "disabled" : ""}>Read it</button>
          ${CMP.preview ? `<button class="mini on" onclick="cmpImport()" ${CMP.busy ? "disabled" : ""}>
            Import ${CMP.preview.total} entries</button>` : ""}
        </div>
      </div>
      ${CMP.preview ? `<div class="cdx-defs">` + Object.entries(CMP.preview.counts)
          .filter(([, n]) => n).map(([k, n]) =>
            `<div class="cdx-def"><b>${n}</b><span>${esc(LABEL[k] || k)}</span></div>`).join("") + `</div>
        <p class="cdx-rings">${CMP.preview.sample.map(s => esc(s)).join(" · ")}</p>` : ""}
      <p class="cdx-rings"><strong>A word on what you paste.</strong> The SRD is open; the books are not.
        Content from a book you own is fine in your own deployment, but it must not be committed to the
        repository, which is why this keeps it in the database instead.</p>
    </div></div>`;
}

// ── a whole collection, in batches ──────────────────────────────────────
// The file is read here and never uploaded whole: the request body is capped, and a single statement
// writing three thousand rows is a bad bet against a hosted database. It goes up in slices with the
// count moving, so a stall is visible rather than a spinner that may or may not be doing anything.
const CMP_BATCH = 400;

async function cmpPickBundle(input) {
  const file = input.files && input.files[0];
  CMP.bundle = null; CMP.progress = null;
  if (!file) return cmpRedraw();
  try {
    const bundle = JSON.parse(await file.text());
    if (!Array.isArray(bundle.entries) || !bundle.entries.length)
      throw new Error("That file holds no entries — is it the bundle the tool wrote?");
    CMP.bundle = bundle;
    toast(`${bundle.entries.length} entries read. Nothing uploaded yet.`);
  } catch (err) {
    toast(err.message.slice(0, 120));
  }
  cmpRedraw();
}

async function cmpUploadBundle() {
  const bundle = CMP.bundle;
  if (!bundle) return;
  CMP.busy = true;
  let written = 0, skipped = 0;
  const total = bundle.entries.length;
  try {
    for (let i = 0; i < total; i += CMP_BATCH) {
      const batch = bundle.entries.slice(i, i + CMP_BATCH);
      CMP.progress = `Uploading ${Math.min(i + batch.length, total)} of ${total}…`;
      cmpRedraw();
      const out = await api("POST", "api/compendium/import-bundle",
        { entries: batch, source: bundle.collection || "Imported" });
      written += out.written || 0;
      skipped += out.skipped || 0;
    }
    const counts = await api("GET", "api/compendium/counts");
    CMP.progress = `${written} written${skipped ? `, ${skipped} skipped` : ""} — this deployment now holds ${counts.total}.`;
    CMP.bundle = null;
    toast(`${written} entries imported.`);
    await loadCompendium();
  } catch (err) {
    CMP.progress = `Stopped after ${written} of ${total}: ${err.message}`;
    toast(err.message);
  }
  CMP.busy = false;
  drawSecs();                      // the tab's count moved
  cmpRedraw();
}

function cmpRedraw() {
  if (UI.sec === "compendium") drawBody();
}

function cmpXmlBody() {
  const xml = document.getElementById("cmpXml")?.value || "";
  const source = (document.getElementById("cmpSource")?.value || "").trim() || "Imported";
  return { xml, source };
}

async function cmpPreview() {
  const { xml, source } = cmpXmlBody();
  if (xml.trim().length < 20) return toast("Paste the XML first.");
  CMP.busy = true;
  try {
    CMP.preview = await api("POST", "api/compendium/import", { xml, source });
    toast(`Read ${CMP.preview.total} entries. Nothing saved yet.`);
  } catch (err) { CMP.preview = null; toast(err.message); }
  CMP.busy = false;
  // Keep what was pasted: re-rendering the section would otherwise empty the textarea under them.
  cmpRedraw();
  document.getElementById("cmpXml").value = xml;
  document.getElementById("cmpSource").value = source === "Imported" ? "" : source;
}

async function cmpImport() {
  const { xml, source } = cmpXmlBody();
  CMP.busy = true;
  try {
    const out = await api("POST", "api/compendium/import", { xml, source, commit: true });
    toast(`${out.imported} entries imported from ${out.source}.`);
    CMP.preview = null;
    await loadCompendium();
  } catch (err) { toast(err.message); }
  CMP.busy = false;
  drawSecs();
  cmpRedraw();
}
