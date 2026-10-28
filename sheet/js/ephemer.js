// The join to Ephemer's own systems.
//
// A Cognition belongs to the ACCOUNT, not to the character: the DM grants it to a player, and that
// player may have two characters or none. So none of this lives in the sheet's JSON — it is read
// from the same routes the Arcanum Veritas builder reads, and written back to the same ones. There
// is one record of what you know and one tracker of what you are learning, and this is a second
// window onto them rather than a second copy.
//
// WHY IT IS HERE AT ALL. The builder has had these since before the sheet existed, and a player has
// been keeping two tabs open to run one character — the Cognitive Saving Throw on one screen and
// the Cognitions it is rolled for on another. The sheet is where the character is.
//
// Loaded on demand, the first time the Dream tab is opened: a player who never opens it never pays
// for the three requests, and a static host with no API behind it simply shows nothing.

import { api, state, emit } from "./store.js";

let loading = null;

// ── the Grimm's own data ────────────────────────────────────────────────
// `grimms/js/data.js` is generated from the vault and sets one global. It is half a megabyte, so it
// is pulled in ONCE and only when the Dream tab is first opened — and at exactly the URL the Admin
// page uses, version query included, so the browser serves both tools from one cache entry.
const GRIMM_DATA_URL = "../grimms/js/data.js?v=2026-10-28a";
let grimmScript = null;

function loadGrimmData() {
  if (window.GRIMM_DATA) return Promise.resolve(window.GRIMM_DATA);
  if (grimmScript) return grimmScript;
  grimmScript = new Promise(resolve => {
    const s = document.createElement("script");
    s.src = GRIMM_DATA_URL;
    // A sheet on a host with no Grimm data is a sheet without this card, not a broken page.
    s.onload = () => resolve(window.GRIMM_DATA || null);
    s.onerror = () => { grimmScript = null; resolve(null); };
    document.head.append(s);
  });
  return grimmScript;
}

// Whose Grimm is whose. The data carries a `short` — "Grizzly", "Salomon" — and the account carries
// a username; matching those two is the join, and it is the same one the Admin page makes. Nothing
// is typed in and nothing is stored on the character, because the Grimm belongs to the player.
export function myGrimm() {
  const me = String(state.me?.username || "").toLowerCase();
  if (!me || !state.grimmData) return null;
  return (state.grimmData.grimms || [])
    .find(g => String(g.short || "").toLowerCase() === me) || null;
}

// Everything at once, because the three answers are small and meaningless apart: which Cognitions
// you have, which you are working toward, and the names you may pick from (which is the set
// difference the server computes so the browser never sees the ones you have not been granted).
export async function ensure(force = false) {
  if (!force && (state.cognitions || loading)) return loading;
  loading = (async () => {
    try {
      const [mine, learning, names, grimms, souls, data, ignitions, paragon] = await Promise.all([
        api("GET", "../api/cognitions"),
        api("GET", "../api/learning"),
        api("GET", "../api/learning/names"),
        api("GET", "../api/grimms/state"),
        api("GET", "../api/grimms/souls"),
        loadGrimmData(),
        api("GET", "../api/ignitions"),
        api("GET", "../api/paragon"),
      ]);
      state.cognitions = mine.cognitions || [];
      state.learning = learning.learning || [];
      state.learnNames = names.names || [];
      state.grimmState = grimms || { chains: {}, toggles: {} };
      state.grimmSouls = souls || { grimms: {}, adopted: [] };
      state.grimmData = data;
      // An account with no Ignitions written for it, and one the Paragon path is not open to, are
      // both ordinary answers — each card simply does not appear.
      state.ignitions = ignitions.ignitions || [];
      state.paragon = paragon || null;
      state.ephemerError = "";
    } catch (err) {
      // An account with none of this, or a deployment without the API, is a normal answer and not
      // an error the player should be shouted at about — but a real failure has to say so.
      state.cognitions = state.cognitions || [];
      state.learning = state.learning || [];
      state.learnNames = state.learnNames || [];
      state.grimmState = state.grimmState || { chains: {}, toggles: {} };
      state.grimmSouls = state.grimmSouls || { grimms: {}, adopted: [] };
      state.grimmData = state.grimmData || null;
      state.ignitions = state.ignitions || [];
      state.paragon = state.paragon || null;
      state.ephemerError = err.offline ? "" : err.message;
    }
    loading = null;
    emit();
  })();
  return loading;
}

// The tracker writes straight through: it is the DM's reminder as much as the player's note, and a
// depth that only existed in one browser would be neither.
export async function setDepth(name, depth) {
  await api("PUT", "../api/learning", { name, depth });
  return ensure(true);
}
export async function dropLearning(name) {
  await api("DELETE", `../api/learning/${encodeURIComponent(name)}`);
  return ensure(true);
}

// A Cognition's own category, for the tint. The builder colours by this and the sheet follows it,
// so the same Cognition is the same colour in both places.
export const CATEGORIES = ["elemental", "mores", "fate", "cosmic", "life", "mind"];
export const categoryOf = c => (CATEGORIES.includes(c?.category) ? c.category : "");
