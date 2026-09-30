// Ephemer — the front page: one sign-in, then a choice of tools.
// Stands alone (the builder's scripts are not loaded here). On a plain static host there is no
// api/ and no accounts: the page just shows the two tools.

let ME = null;

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
function showErr(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg || ""; el.hidden = !msg;
}
function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2200);
}

async function boot() {
  let me = null;
  try { me = await fetch("api/me"); } catch (e) {}
  if (me && me.status !== 404) {
    if (!me.ok) {
      document.getElementById("gate").hidden = false;
      document.getElementById("gateUser").focus();
      return;
    }
    ME = (await me.json()).user;
    const dm = ME.role === "dm";
    document.getElementById("whoBtn").textContent = ME.displayName;
    document.getElementById("who").hidden = false;
    document.getElementById("hubHello").textContent = `Where to, ${ME.displayName}?`;
    document.getElementById("hubLearn").hidden = dm;
    document.getElementById("hubAdmin").hidden = !dm;
    if (dm) reminders();
  }
  document.getElementById("hub").hidden = false;
}

// The DM's Admin card says how many players are waiting to have a Cognition enabled
async function reminders() {
  try {
    const { users } = await api("GET", "api/admin/users");
    const n = users.reduce((sum, u) => sum + u.learning.filter(l => l.depth === 4 && l.cognitionId && !u.cognitions.includes(l.cognitionId)).length, 0);
    if (n) document.getElementById("hubAdminName").textContent = `Admin · ${n}`;
  } catch (e) {}
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

document.addEventListener("click", e => {
  document.querySelectorAll("details.more[open]").forEach(d => { if (!d.contains(e.target)) d.open = false; });
});

boot();
