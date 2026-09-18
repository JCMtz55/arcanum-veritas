// Arcanum Veritas Builder — Copy/toast, keyboard (arrows, the Konami code), and start-up — loads last

function copySum() {
  const el = document.getElementById("sumBody");
  if (!el) return;
  const txt = el.dataset.text ? el.dataset.text.replace(/&quot;/g, '"') : el.textContent;
  navigator.clipboard.writeText(txt).then(() => toast("Copied to clipboard"));
}

// ── Save the card as an image — for players who keep pictures, not text.
// html2canvas is only fetched the first time someone asks for an image.
const H2C_SRC = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
function loadScriptOnce(src, global) {
  if (window[global]) return Promise.resolve();
  return new Promise((ok, fail) => {
    const s = document.createElement("script");
    s.src = src; s.onload = ok; s.onerror = () => fail(new Error("couldn't load the image renderer — check the connection"));
    document.head.appendChild(s);
  });
}
// Render whatever the seal panel is showing (the PLAY card, or FULL's text) to a canvas
async function cardCanvas() {
  const target = document.querySelector("#sumBody .card") || document.querySelector("#sumBody .raw");
  if (!target) throw new Error(state.mode === "ign" ? "build an Eidon first" : "draw a seal first");
  await loadScriptOnce(H2C_SRC, "html2canvas");
  if (document.fonts?.ready) await document.fonts.ready;
  const bg = getComputedStyle(document.querySelector(".seal")).backgroundColor || "#1B1F26";
  return html2canvas(target, {
    backgroundColor: bg, scale: 2, useCORS: true, logging: false,
    onclone: doc => {   // sign the copy, not the page — and give it layouts html2canvas can draw
      doc.body.classList.add("exporting");
      const t = doc.querySelector("#sumBody .card") || doc.querySelector("#sumBody .raw");
      const f = doc.createElement("div");
      f.className = "c-export";
      f.textContent = `Once Upon a Star ★ · ${state.mode === "ign" ? "Ignition" : "Arcanum Veritas"} · ${new Date().toLocaleDateString()}`;
      t.appendChild(f);
    },
  });
}
function imageName() {
  const n = (document.querySelector("#sumBody .c-name")?.textContent || (state.mode === "ign" ? "eidon" : "seal")).trim();
  return n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + ".png";
}
async function saveImage() {
  try {
    toast("Making the image…");
    const canvas = await cardCanvas();
    const blob = await new Promise(r => canvas.toBlob(r, "image/png"));
    const name = imageName(), file = new File([blob], name, { type: "image/png" });
    // On a phone, the share sheet is how you get it into Photos; everywhere else, download it
    if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: name.replace(/\.png$/, "") });
    } else {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }
    toast(`Saved ${name}`);
  } catch (e) {
    if (e?.name === "AbortError") return;   // they closed the share sheet
    console.error(e);
    toast(`Couldn't make the image — ${e.message || e}`);
  }
}

function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2200);
}

// ═══════════════════════════════════════════════════════════
//  EVENTS
// ═══════════════════════════════════════════════════════════
// ── Bar inputs ─────────────────────────────────────────────
["vmInput","dsInput"].forEach(id => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener("input", e => {
    const v = parseInt(e.target.value, 10);
    state[id === "vmInput" ? "verumMod" : "dreamMod"] = isNaN(v) ? 0 : v;
    syncBar(); renderMain();
  });
});
// Keyboard: arrows nudge slot, shift+arrows nudge level
document.addEventListener("keydown", e => {
  if (/^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
  if (state.mode === "ign" && !e.shiftKey) return;   // no slots in Ignition mode — shift+arrows still move the level
  if (e.key === "ArrowRight") { e.shiftKey ? bumpLvl(1)  : bumpSlot(1);  }
  else if (e.key === "ArrowLeft") { e.shiftKey ? bumpLvl(-1) : bumpSlot(-1); }
});

// ── DM view: the Konami code (↑ ↑ ↓ ↓ ← → ← → B A) unlocks every Cognition, held-back ones
// included; the same code turns it off. Remembered in this browser only.
const KONAMI = ["ArrowUp","ArrowUp","ArrowDown","ArrowDown","ArrowLeft","ArrowRight","ArrowLeft","ArrowRight","b","a"];
let konamiAt = 0, konamiSnap = null;
function setDmView(on, quiet) {
  state.dm = on;
  DMG_USE = null;   // the Damage tab's who-deals-what depends on which Cognitions are open
  INDEX.forEach(c => { if (c.written === undefined) c.written = !!c.ready; c.ready = on || c.written; });
  if (!on) {   // leaving DM view drops anything that was only reachable through it
    state.complements = state.complements.filter(x => INDEX.find(c => c.id === x.id)?.ready);
    if (state.core && !INDEX.find(c => c.id === state.core)?.ready) {
      state.core = null; state.coreVerum = null; state.compType = null; state.compSub = null; state.complements = [];
    }
    if (state.codexId && !INDEX.find(c => c.id === state.codexId)?.ready) state.codexId = null;
  }
  try { on ? localStorage.setItem("av-dm", "1") : localStorage.removeItem("av-dm"); } catch (e) {}
  document.body.classList.toggle("dm", on);
  setStatus("ok", `✓ ${INDEX.filter(c => c.ready).length} cognitions ready${on ? " · DM view" : ""}`);
  renderCogList(); renderCodexList(); renderMain();
  if (!quiet) toast(on ? "DM view — every Cognition unlocked" : "DM view off");
}
document.addEventListener("keydown", e => {
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (k === "ArrowUp" && konamiAt === 2) return;   // an extra ↑ at the start doesn't break it
  if (k !== KONAMI[konamiAt]) konamiAt = 0;
  if (k !== KONAMI[konamiAt]) return;
  // The arrows in the code also nudge slot and level — remember where they were, put them back after
  if (konamiAt === 0) konamiSnap = { slot: state.slotLevel, lvl: state.charLevel };
  if (++konamiAt < KONAMI.length) return;
  konamiAt = 0;
  if (konamiSnap) { state.slotLevel = konamiSnap.slot; state.charLevel = konamiSnap.lvl; }
  setDmView(!state.dm);
});

// ═══════════════════════════════════════════════════════════
//  BOOT
// ═══════════════════════════════════════════════════════════
boot();
