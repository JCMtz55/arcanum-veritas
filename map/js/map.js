// ═══════════════════════════════════════════════════════════════════════════
//  The World Map of Ephemer
// ═══════════════════════════════════════════════════════════════════════════
//
// Leaflet on CRS.Simple: no projection, no tiles, no latitude — a flat plane
// where one unit is one unit. The world is the gazetteer's 100 x 48 frame and
// the map image is a single overlay stretched across it.
//
// The one wrinkle is that Leaflet counts Y upward from the bottom and the
// gazetteer counts it downward from the top, so every coordinate crossing that
// line goes through toLL / fromLL and nowhere else.

(() => {
  "use strict";

  const C = window.MAP_CONFIG;
  const W = C.image.width, H = C.image.height;
  const $ = id => document.getElementById(id);

  // ── State ───────────────────────────────────────────────────────────────
  let LOCS = [];                 // every location this account may see
  let ROLE = "player";
  let sel = null;                // the selected location's id
  let legFrom = null, legTo = null;
  let placing = false;
  // Which category's list is open: a nation id, or "@poi" / "@party" for the cross-cutting ones
  // that gather a group from every kingdom at once.
  let openCat = null;
  let adding = false;            // waiting for a map click to site a new place
  let formFor = null;            // id being edited, or null when creating
  const markers = new Map();     // id -> L.Marker

  const byId = id => LOCS.find(l => l.id === id);
  // Put a location into the list by id rather than appending blind: an id freed by a delete can be
  // handed straight back to the next place of the same name, and two entries sharing an id would
  // leave byId() answering with whichever happened to be first.
  function upsertLoc(loc) {
    const i = LOCS.findIndex(l => l.id === loc.id);
    if (i < 0) LOCS.push(loc); else LOCS[i] = loc;
  }
  const nationOf = l => C.nations[l.nation] || C.nations.free;
  const colourOf = l => nationOf(l).colour;
  const kindOf = l => C.kinds.find(k => k.id === l.kind) || { name: l.kind, shape: "dot", group: "poi" };
  const groupOf = l => kindOf(l).group || "poi";
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  // Descriptions are written in the vault and carry its light markdown. Escape everything first,
  // then let exactly two things back through — **bold** and *italic* — so a description can style
  // itself without ever being able to put markup into the page.
  const lightMd = s => esc(s)
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");

  let toastT;
  function toast(msg) {
    const t = $("toast");
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 2600);
  }

  async function api(method, url, body) {
    const r = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
    return r.status === 204 ? null : r.json();
  }

  // ── Coordinates ─────────────────────────────────────────────────────────
  // Gazetteer (x east, y south from the NW corner)  <->  Leaflet (lat up, lng east)
  const toLL   = (x, y) => L.latLng(H - y, x);
  const fromLL = ll => ({ x: +ll.lng.toFixed(2), y: +(H - ll.lat).toFixed(2) });

  // ── The map ─────────────────────────────────────────────────────────────
  const bounds = L.latLngBounds([0, 0], [H, W]);
  const map = L.map("map", {
    crs: L.CRS.Simple,
    zoomSnap: 0.25,
    zoomDelta: 0.5,
    maxBoundsViscosity: 0.85,
  });
  L.imageOverlay(C.image.src, bounds).addTo(map);
  map.setMaxBounds(bounds.pad(0.2));
  // One world unit is `pixelWidth / W` image pixels, so 1:1 sits at that log2 —
  // past it the render is being magnified and the art goes soft. `overzoom` is
  // how much softness we allow. Swapping in a bigger render only moves pixelWidth.
  map.setMaxZoom(Math.log2(C.image.pixelWidth / W) + (C.image.overzoom ?? 1));

  // The container can have no width when this runs — the pane hidden, a layout that has not
  // settled, a tab restored in the background. fitBounds on no width yields a nonsense zoom, and
  // deriving minZoom from it freezes that nonsense in: the map then opens as a pinprick of pins
  // with no image and cannot be panned out of it, for the rest of the session. So the zoom is
  // only ever taken when it is a real number, and it is taken again whenever the pane resizes.
  function fitWorld() {
    map.invalidateSize(false);
    map.fitBounds(bounds);
    const z = map.getZoom();
    if (Number.isFinite(z)) map.setMinZoom(z - 1);
  }
  fitWorld();
  map.on("resize", () => {
    const z = map.getBoundsZoom(bounds);
    if (Number.isFinite(z)) map.setMinZoom(z - 1);
  });

  map.attributionControl.setPrefix("");
  map.attributionControl.addAttribution("Ephemer ★ Once Upon a Star");

  // ── The gazetteer grid, for placing against ─────────────────────────────
  const grid = L.layerGroup();
  const gridLine = (pts, major) => L.polyline(pts, {
    color: major ? "#C0553F" : "#E8E3D7",
    weight: major ? 1.2 : 0.6,
    opacity: major ? 0.55 : 0.25,
    interactive: false,
  }).addTo(grid);
  for (let x = 0; x <= W; x += 5) gridLine([[0, x], [H, x]], x % 10 === 0);
  for (let y = 0; y <= H; y += 4) gridLine([[H - y, 0], [H - y, W]], y % 8 === 0);
  const gridNum = (x, y, n) => L.marker(toLL(x, y), { interactive: false, icon: L.divIcon({
    className: "pin-wrap", iconSize: [0, 0], html: `<span class="grid-num">${n}</span>`,
  }) }).addTo(grid);
  for (let x = 0; x <= W; x += 10) gridNum(x, 1.2, x);
  for (let y = 8; y <= H; y += 8) gridNum(0.5, y, y);

  // ── Pins ────────────────────────────────────────────────────────────────
  function iconFor(l) {
    const cls = ["pin", "shape-" + kindOf(l).shape,
                 l.placed ? "" : "unplaced", l.id === sel ? "sel" : ""].filter(Boolean).join(" ");
    const lock = l.secret && !l.revealed ? " \u{1F512}" : "";
    return L.divIcon({
      className: "pin-wrap",
      iconSize: [20, 20],
      iconAnchor: [10, 10],
      html: `<div class="${cls}" style="--c:${colourOf(l)}"></div>` +
            `<span class="pin-label">${esc(l.name)}${lock}</span>`,
    });
  }

  function drawPins() {
    for (const m of markers.values()) m.remove();
    markers.clear();
    for (const l of LOCS) {
      const m = L.marker(toLL(l.x, l.y), {
        icon: iconFor(l),
        draggable: placing && ROLE === "dm",
        autoPan: true,
        keyboard: false,
      });
      // A marker swallows the click rather than passing it to the map, so siting a new place on
      // top of an existing pin has to be handled here too — otherwise arming "add" and clicking a
      // crowded spot silently does nothing.
      m.on("click", e => { if (adding) return siteNewPlace(e.latlng); select(l.id); });
      m.on("dragend", async e => {
        const { x, y } = fromLL(e.target.getLatLng());
        const was = { x: l.x, y: l.y, placed: l.placed };
        l.x = x; l.y = y; l.placed = true;
        try {
          await api("PUT", `../api/map/locations/${l.id}`, { x, y });
          refreshPin(l.id); renderAll();
          toast(`${l.name} set at (${x}, ${y})`);
        } catch (err) {
          Object.assign(l, was);
          m.setLatLng(toLL(l.x, l.y));
          toast(`Could not save: ${err.message}`);
        }
      });
      m.addTo(map);
      markers.set(l.id, m);
    }
  }
  function refreshPin(id) {
    const m = markers.get(id), l = byId(id);
    if (m && l) { m.setIcon(iconFor(l)); m.setLatLng(toLL(l.x, l.y)); }
  }

  // ── Which top pane is showing ───────────────────────────────────────────
  // paneList, paneDetail and paneForm share the top of the sidebar; Travel and
  // the DM tools sit below and are always there.
  function topPane(name) {
    for (const id of ["paneList", "paneDetail", "paneForm"])
      $(id).classList.toggle("hid", id !== name);
  }

  // ── The categories ──────────────────────────────────────────────────────
  // Kingdoms first, then the two that cut across them: a point of interest is not a kingdom's
  // business the way a city is, and the party belongs to no kingdom at all.
  function renderNations() {
    const stat = {};
    const cross = {};
    for (const l of LOCS) {
      const s = stat[l.nation] || (stat[l.nation] = { all: 0, unset: 0 });
      const g = groupOf(l);
      s.all++; s[g] = (s[g] || 0) + 1;
      if (!l.placed) s.unset++;
      cross[g] = (cross[g] || 0) + 1;
    }
    // Config order first, then any kingdom a custom place invented. An empty kingdom is shown to
    // the DM so a newly added one can be found and filled; players are not shown the shape of a
    // kingdom that holds nothing yet.
    const ids = [...Object.keys(C.nations), ...Object.keys(stat).filter(n => !C.nations[n])]
      .filter(n => stat[n] || (ROLE === "dm" && C.nations[n]));

    const tile = (key, name, colour, sub, badge, extra) =>
      `<button class="nation${extra || ""}" data-cat="${esc(key)}" style="--c:${colour}">` +
      `<b>${esc(name)}</b><s>${sub}</s>` + (badge ? `<em>${badge}</em>` : "") + `</button>`;

    const plural = (g, n) => `${n} ${n === 1 ? g.unit : g.units}`;

    let html = ids.map(n => {
      const nat = C.nations[n] || { name: n, colour: C.nations.free.colour };
      const s = stat[n] || { all: 0, unset: 0 };
      const bits = C.groups.filter(g => s[g.id]).map(g => plural(g, s[g.id]));
      return tile(n, nat.name, nat.colour, bits.join(" · ") || "empty",
                  s.unset ? `${s.unset} to set` : "");
    }).join("");

    // Every group but Settlements also gets a category of its own, spanning the kingdoms. These
    // are small squares rather than kingdom-sized tiles: they are shortcuts, not territory, and
    // three of them at full width pushed everything else off the screen.
    // Shown to the DM even at zero, for the same reason an empty kingdom is: a category nobody
    // can see is a category nobody fills. Players only see the ones that hold something.
    const chips = C.groups.filter(g => g.cross && (cross[g.id] || ROLE === "dm")).map(g =>
      `<button class="xcat" data-cat="@${g.id}" style="--c:${g.colour || "#B08842"}" ` +
      `title="${esc(g.name)} — ${esc(plural(g, cross[g.id] || 0))}">` +
      `<i>${g.icon}</i><b>${esc(g.short || g.name)}</b><s>${cross[g.id] || 0}</s></button>`);
    if (chips.length) html += `<div class="xcats">${chips.join("")}</div>`;

    $("nationGrid").innerHTML = html || `<p class="hint">No places yet.</p>`;
    // The small squares live inside their own row, so walk everything that carries a category.
    for (const b of $("nationGrid").querySelectorAll("[data-cat]"))
      b.onclick = () => { openCat = b.dataset.cat; renderList(); };
  }

  // ── The place list ──────────────────────────────────────────────────────
  // One row's right-hand label: inside a kingdom it says what the place IS, and inside a
  // cross-cutting category it says which kingdom it belongs to, since that is the thing you
  // cannot see from where you are standing.
  const row = (l, label) =>
    `<li data-id="${esc(l.id)}" class="${l.placed ? "" : "unplaced"}${l.secret && !l.revealed ? " secret" : ""}" style="--c:${colourOf(l)}">` +
    `<i></i><b>${esc(l.name)}</b><s>${esc(label)}</s></li>`;

  function renderList() {
    const q = $("search").value.trim().toLowerCase();
    const searching = !!q;
    const showGrid = !searching && !openCat;

    $("nationGrid").classList.toggle("hid", !showGrid);
    $("listHead").classList.toggle("hid", showGrid);
    if (showGrid) { $("places").innerHTML = ""; renderNations(); return; }

    const byName = (a, b) => a.name.localeCompare(b.name);
    let html = "";

    if (searching) {
      const rows = LOCS.filter(l => l.name.toLowerCase().includes(q) || (l.note || "").toLowerCase().includes(q)).sort(byName);
      $("btnAllNations").classList.add("hid");
      $("listTitle").textContent = "Search";
      $("listSub").textContent = `${rows.length} place${rows.length === 1 ? "" : "s"} matching "${q}"`;
      html = rows.map(l => row(l, nationOf(l).name)).join("");

    } else if (openCat.startsWith("@")) {
      const g = openCat.slice(1);
      const rows = LOCS.filter(l => groupOf(l) === g).sort(byName);
      $("btnAllNations").classList.remove("hid");
      const grp = C.groups.find(x => x.id === g) || { name: g, unit: "place", units: "places" };
      $("listTitle").textContent = grp.name;
      $("listSub").textContent =
        `${rows.length} ${rows.length === 1 ? grp.unit : grp.units} across every kingdom`;
      html = rows.map(l => row(l, nationOf(l).name)).join("");

    } else {
      const mine = LOCS.filter(l => l.nation === openCat);
      const nat = C.nations[openCat] || { name: openCat, vault: "" };
      $("btnAllNations").classList.remove("hid");
      $("listTitle").textContent = nat.name;
      const todo = mine.filter(l => !l.placed).length;
      $("listSub").textContent = `${mine.length} place${mine.length === 1 ? "" : "s"}` +
        (todo ? ` · ${todo} still on an estimate` : "") +
        (nat.vault ? ` · ${nat.vault}` : "");
      // Settlements and points of interest never share a heading.
      for (const grp of C.groups) {
        const rows = mine.filter(l => groupOf(l) === grp.id).sort(byName);
        if (!rows.length) continue;
        html += `<li class="sec-head">${esc(grp.name)}</li>` +
                rows.map(l => row(l, l.placed ? kindOf(l).name : "estimate")).join("");
      }
    }

    $("places").innerHTML = html || `<li class="hint" style="cursor:default">Nothing here.</li>`;
    for (const li of $("places").children)
      if (li.dataset.id) li.onclick = () => { select(li.dataset.id); flyTo(li.dataset.id); };
  }

  function flyTo(id) {
    const l = byId(id); if (!l) return;
    const close = map.getMaxZoom() - 1.5;
    const z = Math.max(map.getZoom(), close);
    // Never hand Leaflet a NaN: it throws "Invalid LatLng object" from deep inside the projection
    // and the click looks like it simply did nothing.
    map.flyTo(toLL(l.x, l.y), Number.isFinite(z) ? z : close, { duration: 0.6 });
  }

  // ── The selected place ──────────────────────────────────────────────────
  function select(id) {
    const prev = sel; sel = id;
    if (prev) refreshPin(prev);
    refreshPin(id);
    renderDetail();
    topPane("paneDetail");
  }
  function deselect() {
    const prev = sel; sel = null;
    if (prev) refreshPin(prev);
    topPane("paneList");
    renderList();
  }

  function renderDetail() {
    const l = byId(sel); if (!l) return deselect();
    const nat = nationOf(l);
    $("dName").textContent = l.name;
    $("dSub").textContent = `${nat.name} · ${kindOf(l).name}`;
    $("dSub").style.setProperty("--c", nat.colour);
    $("dNote").innerHTML = lightMd(l.note || "");
    if (l.vault) { $("dVault").innerHTML = `In the vault: <b>${esc(l.vault)}</b>`; $("dVault").classList.remove("hid"); }
    else $("dVault").classList.add("hid");
    $("dCoord").innerHTML = `(${l.x}, ${l.y}) · ${l.terrain} · ` +
      (l.custom ? "added by you" : l.placed ? "placed" : `<em>gazetteer estimate — not yet set on this map</em>`);
    $("dDm").classList.toggle("hid", ROLE !== "dm");
    $("dRevealed").checked = !l.secret || !!l.revealed;
    $("dRevealed").disabled = !l.secret;
    // Only a seeded place has a file behind it to fall back to.
    $("btnReset").classList.toggle("hid", !!l.custom);
  }

  // ── Adding and editing ──────────────────────────────────────────────────
  function fillFormSelects() {
    $("fKind").innerHTML = C.kinds.map(k => `<option value="${k.id}">${esc(k.name)}</option>`).join("");
    $("fNation").innerHTML = Object.entries(C.nations)
      .map(([id, n]) => `<option value="${id}">${esc(n.name)}</option>`).join("");
  }

  // Where a new place is going lives on the form itself rather than in a variable, so nothing
  // else in the file can quietly clear it between opening the form and saving it.
  function openForm(l, xy) {
    formFor = l ? l.id : null;
    xy = l ? { x: l.x, y: l.y } : xy;
    $("paneForm").dataset.x = xy.x;
    $("paneForm").dataset.y = xy.y;
    $("fTitle").textContent = l ? `Edit ${l.name}` : "New place";
    $("fWhere").innerHTML = `At <b>(${xy.x}, ${xy.y})</b>` +
      (l ? "" : " — drag the pin afterwards to nudge it.");
    $("fName").value = l ? l.name : "";
    $("fKind").value = l ? l.kind : "poi";
    $("fNation").value = l && C.nations[l.nation] ? l.nation : "free";
    $("fTerrain").value = l ? l.terrain : "open";
    $("fNote").value = l ? (l.note || "") : "";
    // A new place starts hidden (Juan, 2026-10-21). Somewhere the DM adds mid-session is usually
    // somewhere the table has not earned yet, and a place revealed a beat early cannot be taken
    // back. Editing an existing one keeps whatever it already is.
    $("fSecret").checked = l ? !!l.secret : true;
    topPane("paneForm");
    $("fName").focus();
  }

  async function saveForm() {
    const name = $("fName").value.trim();
    if (!name) return toast("It needs a name.");
    const body = {
      name,
      kind:    $("fKind").value,
      nation:  $("fNation").value,
      terrain: $("fTerrain").value,
      note:    $("fNote").value.trim(),
      secret:  $("fSecret").checked,
    };
    try {
      let loc;
      if (formFor) {
        ({ location: loc } = await api("PUT", `../api/map/locations/${formFor}`, body));
        Object.assign(byId(formFor), loc);
      } else {
        // No coordinates means the form was never sited. Bail rather than post: JSON.stringify
        // turns NaN into null and the server reads null as 0, which would quietly drop the new
        // place on the map's northwest corner.
        const d = $("paneForm").dataset;
        const x = Number(d.x), y = Number(d.y);
        if (!d.x || !d.y || !Number.isFinite(x) || !Number.isFinite(y))
          return toast("Pick a spot on the map first — press “+ Add a place”, then click.");
        ({ location: loc } = await api("POST", "../api/map/locations", { ...body, x, y }));
        upsertLoc(loc);
      }
      drawPins(); renderAll();
      select(loc.id);
      toast(formFor ? `${loc.name} updated.` : `${loc.name} added.`);
    } catch (err) { toast(err.message); }
  }

  function cancelForm() {
    if (formFor && byId(formFor)) select(formFor); else deselect();
  }

  function armAdd() {
    adding = !adding;
    $("btnAdd").classList.toggle("on", !adding);
    $("map").style.cursor = adding ? "crosshair" : "";
    toast(adding ? "Click the map where the place goes." : "Adding cancelled.");
  }

  function siteNewPlace(latlng) {
    adding = false;
    $("btnAdd").classList.add("on");
    $("map").style.cursor = "";
    openForm(null, fromLL(latlng));
  }

  // ── Travel ──────────────────────────────────────────────────────────────
  const line = L.polyline([], { color: "#B08842", weight: 2, dashArray: "6 5", interactive: false }).addTo(map);

  function renderSlots() {
    for (const [slot, id] of [["slotFrom", legFrom], ["slotTo", legTo]]) {
      const el = $(slot), l = id && byId(id);
      el.querySelector("span").textContent = l ? l.name : "pick a place";
      el.classList.toggle("set", !!l);
    }
    renderResult();
  }

  function renderResult() {
    const a = legFrom && byId(legFrom), b = legTo && byId(legTo);
    const out = $("result");
    if (!a || !b || a.id === b.id) {
      out.innerHTML = `<p class="hint">Pick two places to measure a leg.</p>`;
      line.setLatLngs([]);
      return;
    }
    line.setLatLngs([toLL(a.x, a.y), toLL(b.x, b.y)]);

    const T = C.travel;
    const route = T.routeFactors.find(r => r.id === $("selRoute").value) || T.routeFactors[0];
    const pace  = T.paces.find(p => p.id === $("selPace").value) || T.paces[0];
    const S     = Math.max(1, +$("inpScale").value || T.milesPerUnit);

    const d = Math.hypot(b.x - a.x, b.y - a.y);
    const path = d * route.factor;
    const miles = path * S;

    // "From the ends" takes the mean of the two endpoints' brackets, which is honest but blunt:
    // a leg between two difficult places is scored difficult the whole way even when the middle is
    // plain road. "Mixed country" is the gazetteer's own fudge — it averages open against difficult
    // and is what the note's worked example (Tryad to Jägenberg) assumes.
    const mode = $("selTerrain").value;
    const perDay = mode === "auto"  ? Math.round((pace[a.terrain] + pace[b.terrain]) / 2)
                 : mode === "mixed" ? Math.round((pace.open + pace.difficult) / 2)
                 : pace[mode];

    // Days come off the ROUNDED mileage, and with a hair of slack on the ceiling. The anchor leg
    // is the reason: Vesper Gulch to Tryad measures 36.02 miles at 12 mi/day, and a naive
    // ceil(36.02 / 12) reports four days for a journey the table shows as 36 / 12 = three. Any
    // leg that divided evenly would have read a day long, and the printed arithmetic would have
    // contradicted its own answer.
    const shown = Math.round(miles);
    const days = Math.max(1, Math.ceil(shown / perDay - 1e-9));

    const estimate = !a.placed || !b.placed;
    out.innerHTML =
      `<div class="big">${days} day${days === 1 ? "" : "s"}</div>` +
      `<table>` +
      `<tr><td>Straight line</td><td>${d.toFixed(1)} gu</td></tr>` +
      `<tr><td>${esc(route.name)}</td><td>&times; ${route.factor} = ${path.toFixed(1)} gu</td></tr>` +
      `<tr><td>At ${S} mi/gu</td><td>${shown} mi</td></tr>` +
      `<tr><td>${esc(pace.name)}${mode === "auto" ? " (mean of the ends)" : ""}</td><td>${perDay} mi/day</td></tr>` +
      `</table>` +
      `<p class="cav">Scale is <b>${T.milesPerUnit} mi/gu</b>, ruled 2026-10-21 from the Vesper Gulch &rarr; Tryad ` +
      `anchor &mdash; three days on foot through difficult desert. Change the box above to price a leg at some ` +
      `other scale; it does not change the ruling.` +
      (estimate ? ` <b>One end is still on its gazetteer estimate</b>, so this distance is a guess about a guess.` : ``) +
      `</p>`;
  }

  // ── DM: placing and the archive ─────────────────────────────────────────
  function renderProgress() {
    const total = LOCS.length, done = LOCS.filter(l => l.placed).length;
    $("progFill").style.width = total ? `${(done / total) * 100}%` : "0";
    $("progTxt").textContent = `${done} of ${total} placed` +
      (total - done ? ` · ${total - done} still on the old estimate` : " · all set");
  }

  async function renderArchive() {
    if (ROLE !== "dm") return;
    let rows = [];
    try { ({ locations: rows } = await api("GET", "../api/map/archived")); } catch (e) { return; }
    $("archSum").textContent = `Archived (${rows.length})`;
    $("archList").innerHTML = rows.map(l =>
      `<li data-id="${esc(l.id)}" style="--c:${colourOf(l)}"><i></i><b>${esc(l.name)}</b>` +
      `<s>restore</s>` +
      // Only a place the DM added can be destroyed, and only from in here — a seeded one always
      // has the file to fall back to, so it is reset rather than deleted.
      (l.custom ? `<u class="drop" title="Delete for good">&times;</u>` : ``) +
      `</li>`).join("")
      || `<li class="hint" style="cursor:default">Nothing archived.</li>`;
    for (const li of $("archList").children) {
      if (!li.dataset.id) continue;
      const id = li.dataset.id;
      li.onclick = async e => {
        if (e.target.classList.contains("drop")) {
          const name = li.querySelector("b").textContent;
          if (!confirm(`Delete "${name}" for good? This one cannot come back.`)) return;
          try { await api("DELETE", `../api/map/locations/${id}`); renderArchive(); toast(`${name} deleted.`); }
          catch (err) { toast(err.message); }
          return;
        }
        try {
          const { location } = await api("PUT", `../api/map/locations/${id}`, { archived: false });
          upsertLoc(location);
          drawPins(); renderAll(); renderArchive();
          toast(`${location.name} is back on the map.`);
        } catch (err) { toast(err.message); }
      };
    }
  }

  function coordTable() {
    const rows = [...LOCS].sort((a, b) =>
      a.nation.localeCompare(b.nation) || a.name.localeCompare(b.name));
    return "| Settlement | (X, Y) | Kingdom | Kind |\n|---|---|---|---|\n" + rows.map(l =>
      `| **${l.name}** | (${l.x}, ${l.y}) | ${nationOf(l).name} | ${kindOf(l).name}${l.placed ? "" : " — estimate"} |`
    ).join("\n") + "\n";
  }

  // Everything that depends on the location list, in one call.
  function renderAll() { renderList(); renderProgress(); renderSlots(); }

  // ── Wiring ──────────────────────────────────────────────────────────────
  $("search").oninput = () => { openCat = null; renderList(); };
  $("btnAllNations").onclick = () => { openCat = null; $("search").value = ""; renderList(); };
  $("btnBack").onclick = deselect;
  // Travel is folded away by default, so asking for a leg has to open it — otherwise the answer
  // appears somewhere the person who asked cannot see.
  const useTravel = fn => () => { $("travelBox").open = true; fn(); };
  $("btnFrom").onclick = useTravel(() => { legFrom = sel; renderSlots(); toast("Leg starts here."); });
  $("btnTo").onclick   = useTravel(() => { legTo   = sel; renderSlots(); toast("Leg ends here."); });
  $("btnSwap").onclick = () => { [legFrom, legTo] = [legTo, legFrom]; renderSlots(); };
  $("slotFrom").onclick = () => { legFrom = null; renderSlots(); };
  $("slotTo").onclick   = () => { legTo   = null; renderSlots(); };
  for (const id of ["selRoute", "selPace", "selTerrain", "inpScale"]) $(id).onchange = renderResult;
  $("inpScale").oninput = renderResult;

  $("btnFit").onclick = fitWorld;
  $("btnGrid").onclick = e => {
    const on = map.hasLayer(grid);
    on ? map.removeLayer(grid) : map.addLayer(grid);
    e.currentTarget.classList.toggle("on", !on);
  };
  $("btnLabels").onclick = e => {
    const on = document.body.classList.toggle("show-labels");
    e.currentTarget.classList.toggle("on", on);
  };

  $("dmPlace").onchange = e => {
    placing = e.target.checked;
    drawPins();
    toast(placing ? "Placing on — drag a pin to set it." : "Placing off.");
  };
  $("dRevealed").onchange = async e => {
    const l = byId(sel); if (!l) return;
    try {
      await api("PUT", `../api/map/locations/${l.id}`, { revealed: e.target.checked });
      l.revealed = e.target.checked;
      refreshPin(l.id);
      toast(e.target.checked ? `${l.name} is now visible to players.` : `${l.name} hidden again.`);
    } catch (err) { e.target.checked = !e.target.checked; toast(err.message); }
  };
  $("btnEdit").onclick = () => { const l = byId(sel); if (l) openForm(l); };
  $("btnFormSave").onclick = saveForm;
  $("btnFormCancel").onclick = cancelForm;
  $("btnFormCancel2").onclick = cancelForm;
  $("btnAdd").onclick = armAdd;

  $("btnArchive").onclick = async () => {
    const l = byId(sel); if (!l) return;
    try {
      await api("PUT", `../api/map/locations/${l.id}`, { archived: true });
      LOCS = LOCS.filter(x => x.id !== l.id);
      sel = null;
      drawPins(); renderAll(); renderArchive();
      topPane("paneList");
      toast(`${l.name} archived — bring it back from the DM pane.`);
    } catch (err) { toast(err.message); }
  };

  $("btnReset").onclick = async () => {
    const l = byId(sel); if (!l) return;
    try {
      const { location } = await api("DELETE", `../api/map/locations/${l.id}`);
      Object.assign(l, location);
      refreshPin(l.id); renderDetail(); renderAll();
      toast(`${l.name} is back to what the gazetteer says.`);
    } catch (err) { toast(err.message); }
  };
  $("btnCopy").onclick = async () => {
    try { await navigator.clipboard.writeText(coordTable()); toast("Coordinates copied as a Markdown table."); }
    catch { toast("The browser would not let me reach the clipboard."); }
  };
  $("btnUnplaced").onclick = () => {
    const l = LOCS.find(x => !x.placed);
    if (!l) return toast("Every pin is set.");
    select(l.id); flyTo(l.id);
  };
  $("archBox").addEventListener("toggle", () => { if ($("archBox").open) renderArchive(); });

  map.on("click", e => {
    if (adding) return siteNewPlace(e.latlng);
    if (!e.originalEvent.target.closest(".pin")) deselect();
  });

  // ── Boot ────────────────────────────────────────────────────────────────
  function fillSelects() {
    const T = C.travel;
    $("selRoute").innerHTML = T.routeFactors.map(r => `<option value="${r.id}">${esc(r.name)}</option>`).join("");
    $("selPace").innerHTML  = T.paces.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join("");
    $("inpScale").value = T.milesPerUnit;
    fillFormSelects();
  }

  (async function boot() {
    fillSelects();
    document.body.classList.add("show-labels");
    $("btnLabels").classList.add("on");

    let me = null;
    try { me = (await api("GET", "../api/me")).user; } catch (e) {}
    if (me) {
      ROLE = me.role;
      $("live").innerHTML = `<b>${esc(me.displayName || me.username)}</b>${me.role === "dm" ? " · DM" : ""}`;
    }
    if (ROLE === "dm") for (const el of document.querySelectorAll(".dm-only")) el.classList.remove("hid");
    $("dDm").classList.add("hid");   // shown per selection, not here

    try {
      const d = await api("GET", "locations.json");
      LOCS = d.locations;
    } catch (e) {
      $("result").innerHTML = `<p class="hint">The locations would not load: ${esc(e.message)}</p>`;
      return;
    }

    drawPins(); renderAll();
    if (ROLE === "dm") renderArchive();
  })();
})();
