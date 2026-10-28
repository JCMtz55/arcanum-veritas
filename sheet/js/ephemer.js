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

// Everything at once, because the three answers are small and meaningless apart: which Cognitions
// you have, which you are working toward, and the names you may pick from (which is the set
// difference the server computes so the browser never sees the ones you have not been granted).
export async function ensure(force = false) {
  if (!force && (state.cognitions || loading)) return loading;
  loading = (async () => {
    try {
      const [mine, learning, names] = await Promise.all([
        api("GET", "../api/cognitions"),
        api("GET", "../api/learning"),
        api("GET", "../api/learning/names"),
      ]);
      state.cognitions = mine.cognitions || [];
      state.learning = learning.learning || [];
      state.learnNames = names.names || [];
      state.ephemerError = "";
    } catch (err) {
      // An account with none of this, or a deployment without the API, is a normal answer and not
      // an error the player should be shouted at about — but a real failure has to say so.
      state.cognitions = state.cognitions || [];
      state.learning = state.learning || [];
      state.learnNames = state.learnNames || [];
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
