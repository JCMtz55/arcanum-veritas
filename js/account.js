// Arcanum Veritas Builder — Sign-in and the account menu.
// Administration is its own page now (admin.html), so none of it is shipped to players.
// All of it is inert on a static host: nothing here runs unless boot() found the server's api/.

async function api(method, url, body) {
  const r = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Request failed (${r.status})`);
  return data;
}
function escQ(t) { return esc(t).replace(/"/g, "&quot;"); }
function showErr(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg || ""; el.hidden = !msg;
}

// ═══════════════════════════════════════════════════════════
//  SIGN-IN
// ═══════════════════════════════════════════════════════════
function showGate() {
  setStatus("", "");
  document.getElementById("gate").hidden = false;
  document.getElementById("gateUser").focus();
}
function signIn(e) {
  e.preventDefault();
  showErr("gateErr");
  api("POST", "api/login", {
    username: document.getElementById("gateUser").value,
    password: document.getElementById("gatePass").value,
  }).then(() => {
    document.getElementById("gate").hidden = true;
    document.getElementById("gatePass").value = "";
    boot();
  }).catch(err => showErr("gateErr", err.message));
  return false;
}
function showAccount() {
  document.getElementById("whoBtn").textContent = ME.displayName;
  document.getElementById("who").hidden = false;
  document.getElementById("tabLearn").hidden = ME.role === "dm";   // the DM has no character to track
  document.getElementById("saveBtn").hidden = document.getElementById("savedItem").hidden = false;
  loadSaves().catch(() => {});                                     // fills the composer's opening screen
}
// ── The character's numbers — level, Verum mod, Dream mod — are remembered with the account.
// The slot is not: it belongs to the seal being drawn.
function applySheet(s) {
  if (!s) return;
  state.charLevel = s.charLevel; state.verumMod = s.verumMod; state.dreamMod = s.dreamMod;
  document.getElementById("vmInput").value = s.verumMod;
  document.getElementById("dsInput").value = s.dreamMod;
}
// Saved a moment after the last change, reading the bar as it stands then
let sheetTimer = null;
function saveSheet() {
  if (!API || !ME) return;
  clearTimeout(sheetTimer);
  sheetTimer = setTimeout(() => {
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v | 0));
    api("PUT", "api/sheet", { charLevel: state.charLevel, verumMod: clamp(state.verumMod, -2, 12), dreamMod: clamp(state.dreamMod, -2, 12) })
      .catch(err => toast(`Couldn't save your numbers — ${err.message}`));
  }, 700);
}

function openAccount() {
  document.getElementById("acctName").textContent = ME.displayName;
  showErr("acctErr");
  document.getElementById("acct").showModal();
}
function changePassword(e) {
  e.preventDefault();
  const cur = document.getElementById("acctCur"), next = document.getElementById("acctNew");
  api("POST", "api/password", { current: cur.value, next: next.value }).then(() => {
    cur.value = next.value = "";
    document.getElementById("acct").close();
    toast("Password changed");
  }).catch(err => showErr("acctErr", err.message));
  return false;
}
function signOut() {
  api("POST", "api/logout").finally(() => location.reload());
}
