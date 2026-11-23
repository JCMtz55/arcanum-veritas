// ═══════════════════════════════════════════════════════════
//  THE GALLERY — one pool of pictures, four slots per character
// ═══════════════════════════════════════════════════════════
// Before this, a character's splash could only be set from a row on the initiative board, which
// means they had to be standing in a fight to be given a picture. Their portrait could only be set
// from their own sheet, out of a fixed catalogue of eight. The full painting could not be set at
// all — it was derived from whichever plate the portrait came from.
//
// So: upload once, into a pool, and point any of the four slots at anything in it. The plates stay
// in the picker beside the uploads, because seven characters are wearing them today and a picker
// that cannot offer what somebody is already wearing is a picker that can only take things away.
//
// The server owns every rule here. This file chooses a picture and says which slot it goes in.

const GAL = {
  images: [],      // the pool, newest first
  loaded: false,
  err: "",
  open: null,      // { charId, slot } while the picker is up
  busy: false,
};

// The eight that ship with the app. Named here rather than imported because admin is classic
// scripts and `plates.js` is a module — but the PATHS are the same strings the sheet writes, so a
// portrait chosen here and one chosen there are the same value in the same field.
const GAL_PLATES = [
  { file: "grissly.jpg", name: "Grizzly" },
  { file: "khaled.jpg", name: "Khaled Guile" },
  { file: "rory.jpg", name: "Rory Mercury" },
  { file: "richard.jpg", name: "Richard Aquitaine" },
  { file: "levnali.jpg", name: "Lev'nali" },
  { file: "sal-and-sol.jpg", name: "Salomon & Solomon" },
  { file: "zeke.jpg", name: "Zeke Greyhawk" },
  { file: "zariel.jpg", name: "Zariel Necroshade" },
];

const GAL_SLOTS = [
  { key: "portrait", label: "Portrait",  hint: "the face on every row and on their sheet" },
  { key: "fullArt",  label: "Painting",  hint: "what the portrait opens into" },
  { key: "splash",   label: "Splash",    hint: "their turn, on the room's screen" },
  { key: "hurt",     label: "Bloodied",  hint: "from a tenth of their hit points down" },
];

// ⚠️ Every class name in this file is prefixed `gal-`, and that is not tidiness. `app.css` is
// loaded by every page in this app, and the picker spent its first hour showing one squashed strip
// instead of the pictures because the grid was marked `class="gal-grid pick"` — and app.css styles
// a bare `.pick` as a 30px-tall select, which clamped the grid to 30px and left the buttons
// overflowing on top of each other.

// A plate's path is relative to `sheet/`; a gallery picture is an absolute path the API serves.
// Prefixing the second would make `../sheet//api/gallery/7`, which is why this asks first.
const galSrc = u => (!u ? "" : /^(data:|https?:|\/)/.test(u) ? u : `../sheet/${u}`);
const galUrlAttr = u => escQ(encodeURI(String(u || "")).replace(/'/g, "%27"));

// `draw()` can run many times before a fetch comes back, and the block below asks for the gallery
// the first time it is drawn — so the flag goes up BEFORE the await, or every redraw starts
// another request for the same list.
async function galLoad(force) {
  if ((GAL.loaded || GAL.loading) && !force) return;
  GAL.loading = true;
  try {
    const d = await api("GET", "api/gallery");
    GAL.images = d.images || [];
    GAL.max = d.max || 48;
    GAL.err = "";
  } catch (err) { GAL.err = err.message; }
  GAL.loaded = true;
  GAL.loading = false;
  draw();
}

// ── The block on a player's Character tab ──────────────────
function galPictures(chars) {
  if (!GAL.loaded) { galLoad(); return `<div class="cdx-sec"><h2>Pictures</h2>
    <p class="cdx-rings">Reading the gallery…</p></div>`; }

  return `<div class="cdx-sec"><h2>Pictures</h2>
    <p class="cdx-rings">Four slots per character, all of them out of the one pool below. The
      portrait and the painting are stored as references, so changing the picture changes it
      everywhere at once; the two splashes are <strong>copied</strong> when you set them, so
      deleting a picture from the gallery can never blank a splash mid-fight.</p>
    ${GAL.err ? `<p class="cdx-rings hot">${esc(GAL.err)}</p>` : ""}
    ${chars.map(galCharSlots).join("")}
    </div>${galPool()}`;
}

function galCharSlots(c) {
  return `<div class="gal-char">
    <h3>${esc(c.name)}</h3>
    <div class="gal-slots">${GAL_SLOTS.map(s => galSlot(c, s)).join("")}</div>
  </div>`;
}

// What a slot is currently showing. The portrait and the painting carry their URL on the card; the
// splashes do not — the card says only WHETHER there is one, because the board polls that card
// every four seconds and the pictures are hundreds of kilobytes.
function galSlot(c, s) {
  const set = s.key === "portrait" ? c.portrait
            : s.key === "fullArt" ? c.fullArt
            : s.key === "splash" ? (c.art?.normal ? `api/characters/${c.id}/art/normal` : "")
            : (c.art?.hurt ? `api/characters/${c.id}/art/hurt` : "");
  // A painting inherited from the plate is shown, but greyed and not clearable: there is nothing
  // of the DM's to clear, and pretending otherwise is the kind of button that does nothing.
  const inherited = s.key === "fullArt" && !c.fullArt && c.portraitArt;
  const shown = set || (inherited ? c.portraitArt : "");
  const src = s.key === "splash" || s.key === "hurt"
    ? (set ? `${API_BASE}${set}?t=${GAL.bust || 0}` : "")
    : galSrc(shown);

  return `<div class="gal-slot${set ? " on" : ""}${inherited ? " inherit" : ""}">
    <div class="gal-shot" ${src ? `style="background-image:url('${galUrlAttr(src)}')"` : ""}>
      ${src ? "" : `<span>empty</span>`}
      ${inherited ? `<em>from the plate</em>` : ""}
    </div>
    <b>${esc(s.label)}</b>
    <span>${esc(s.hint)}</span>
    <div class="gal-acts">
      <button class="mini" onclick="galOpen(${c.id}, '${s.key}')">Choose…</button>
      ${set ? `<button class="mini warn" onclick="galClear(${c.id}, '${s.key}')">Clear</button>` : ""}
    </div>
  </div>`;
}

// ── The pool ───────────────────────────────────────────────
function galPool() {
  const n = GAL.images.length;
  return `<div class="cdx-sec"><h2>Gallery <span class="a-n">${n}</span></h2>
    <p class="cdx-rings">Uploaded once and usable by anyone. Pictures are shrunk to 1200px on their
      longest side in the browser before they are sent, and a cut-out keeps its transparency.
      ${n >= (GAL.max || 48) ? `<strong class="hot">Full — delete one to add another.</strong>` : ""}</p>
    <div class="adm-line">
      <label class="mini" style="cursor:pointer">Upload a picture…
        <input type="file" accept="image/*" hidden onchange="galUpload(this)"></label>
      ${GAL.busy ? `<span class="cdx-rings">working…</span>` : ""}
    </div>
    <div class="gal-grid">
      ${GAL.images.map(im => `<figure class="gal-im">
        <div class="gal-shot" style="background-image:url('${galUrlAttr(im.url)}')"></div>
        <figcaption>${esc(im.name || "untitled")}<br><span>${im.width}×${im.height}</span></figcaption>
        <button class="mini warn" onclick="galDelete(${im.id})">Delete</button>
      </figure>`).join("")}
      ${n ? "" : `<p class="cdx-rings">Nothing uploaded yet.</p>`}
    </div>
    <div class="cdx-sec"><div class="cdx-note"><p>The eight <strong>plates</strong> that ship with
      the app are offered in the picker too, under the uploads — seven characters are wearing one
      today, and they stay choosable.</p></div></div>
    </div>`;
}

// ── Choosing ───────────────────────────────────────────────
function galOpen(charId, slot) {
  GAL.open = { charId, slot };
  const s = GAL_SLOTS.find(x => x.key === slot);
  const c = (PARTY.cards || []).find(x => x.id === charId);
  const splashOnly = slot === "splash" || slot === "hurt";

  document.getElementById("galTitle").textContent =
    `${c ? c.name : "Character"} — ${s ? s.label.toLowerCase() : slot}`;
  document.getElementById("galBody").innerHTML = `
    <p class="cdx-rings">${esc(s?.hint || "")}</p>
    <div class="gal-grid gal-choose">
      ${GAL.images.map(im => `<button class="gal-pick" onclick="galPick('${im.url}')"
          title="${escQ(im.name || "untitled")}">
        <span class="gal-shot" style="background-image:url('${galUrlAttr(im.url)}')"></span>
        <i>${esc(im.name || "untitled")}</i></button>`).join("")}
      ${GAL.images.length ? "" : `<p class="cdx-rings">Nothing uploaded yet.</p>`}
    </div>
    ${splashOnly ? `<div class="cdx-note"><p>A splash has to come from the gallery — the plates are
      crops, and a crop blown up to fill a television is a smudge.</p></div>`
    : `<h3>Plates</h3>
    <div class="gal-grid gal-choose">
      ${GAL_PLATES.map(p => {
        const url = slot === "fullArt" ? `img/fullart/${p.file}` : `img/portraits/${p.file}`;
        return `<button class="gal-pick" onclick="galPick('${escQ(url)}')" title="${escQ(p.name)}">
          <span class="gal-shot" style="background-image:url('${galUrlAttr(galSrc(url))}')"></span>
          <i>${esc(p.name)}</i></button>`;
      }).join("")}
    </div>`}`;
  document.getElementById("galDlg").showModal();
}

function galCloseDlg() { document.getElementById("galDlg").close(); GAL.open = null; }

async function galPick(url) {
  if (!GAL.open) return;
  await galSet(GAL.open.charId, GAL.open.slot, url);
  galCloseDlg();
}

const galClear = (charId, slot) => galSet(charId, slot, "");

async function galSet(charId, slot, url) {
  GAL.busy = true; draw();
  try {
    await api("PUT", `api/characters/${charId}/pictures`, { [slot]: url });
    // The splashes are served by a route that caches on the character and the moment it changed, so
    // a reassignment needs a fresh query string or the old one stays on screen.
    GAL.bust = Date.now();
    await loadParty();
    toast(url ? "Set." : "Cleared.");
  } catch (err) { toast(err.message); }
  GAL.busy = false;
  draw();
}

// ── Uploading ──────────────────────────────────────────────
async function galUpload(input) {
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  GAL.busy = true; draw();
  toast("Reading the picture…");
  try {
    const { data, width, height } = await galShrink(file, 1200);
    await api("POST", "api/gallery", { name: file.name.replace(/\.[^.]+$/, "").slice(0, 80), data, width, height });
    await galLoad(true);
    toast("In the gallery.");
  } catch (err) { toast(err.message || "That file is not a picture this browser can read."); }
  GAL.busy = false;
  draw();
}

async function galDelete(id) {
  if (!confirm("Delete this picture from the gallery? Splashes already assigned from it keep working.")) return;
  GAL.busy = true; draw();
  try {
    const d = await api("DELETE", `api/gallery/${id}`);
    await galLoad(true);
    await loadParty();
    toast((d.wasWornBy || []).length
      ? `Deleted — ${d.wasWornBy.join(", ")} had it set and now show initials.`
      : "Deleted.");
  } catch (err) { toast(err.message); }
  GAL.busy = false;
  draw();
}

// The same bargain the initiative board strikes, and for the same reasons: longest side to 1200,
// which is what the room's panel wants on a 1080p television, and a format chosen by looking at
// the picture — a cut-out keeps its alpha, a flat one is smaller as a JPEG.
const GAL_BUDGET = 880_000;

function galShrink(file, side) {
  return new Promise((ok, no) => {
    const fr = new FileReader();
    fr.onerror = no;
    fr.onload = () => {
      const img = new Image();
      img.onerror = no;
      img.onload = () => {
        const s = Math.min(1, side / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        const ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0, c.width, c.height);

        let alpha = true;
        try {
          const px = ctx.getImageData(0, 0, c.width, c.height).data;
          alpha = false;
          for (let i = 3; i < px.length; i += 16) if (px[i] < 255) { alpha = true; break; }
        } catch { alpha = true; }

        const type = alpha ? "image/webp" : "image/jpeg";
        for (const q of [0.9, 0.8, 0.7, 0.6]) {
          const url = c.toDataURL(type, q);
          if (url.length <= GAL_BUDGET) return ok({ data: url, width: c.width, height: c.height });
        }
        const half = document.createElement("canvas");
        half.width = Math.max(1, Math.round(c.width / 2));
        half.height = Math.max(1, Math.round(c.height / 2));
        half.getContext("2d").drawImage(c, 0, 0, half.width, half.height);
        ok({ data: half.toDataURL(type, 0.8), width: half.width, height: half.height });
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}
