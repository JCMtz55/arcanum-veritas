// The party's plates — the one catalogue of them, read by three places.
//
// It lives on its own because the DM's table board needs it too, and `view.js` cannot be imported
// outside a browser: it reaches for `document` the moment it loads. This file is data and four
// pure functions, so `server.js` can import it the same way it already imports `rules.js`, and the
// board and the sheet can never disagree about which painting belongs to which plate.
//
// Every URL here is relative to `sheet/`. A page that is not the sheet prefixes it — admin uses
// `../sheet/` — rather than this file guessing where it is being read from.

// `art` is the same plate uncropped, in `sheet/img/fullart/`, which is what a portrait opens when
// it is clicked. It is named rather than derived from `file`, so a plate without a full version
// simply has no `art` and opens the crop it already has — no guessed URL, no 404. The placeholders
// this list replaced are exactly that case: still on disk, so an old sheet still resolves, but no
// longer offered and with nothing behind them.
export const PORTRAITS = [
  { file: "grissly.jpg", name: "Grizzly", art: "grissly.jpg" },
  { file: "khaled.jpg", name: "Khaled Guile", art: "khaled.jpg" },
  { file: "rory.jpg", name: "Rory Mercury", art: "rory.jpg" },
  { file: "richard.jpg", name: "Richard Aquitaine", art: "richard.jpg" },
  { file: "levnali.jpg", name: "Lev'nali", art: "levnali.jpg" },
  { file: "sal-and-sol.jpg", name: "Salomon & Solomon", art: "sal-and-sol.jpg" },
  { file: "zeke.jpg", name: "Zeke Greyhawk", art: "zeke.jpg" },
  { file: "zariel.jpg", name: "Zariel Necroshade", art: "zariel.jpg" },
];

export const portraitUrl = f => `img/portraits/${f}`;
export const fullArtUrl = f => `img/fullart/${f}`;

// What a character is currently wearing, found back from the URL on the sheet — the stored value is
// the portrait's URL, not an id, so that a plate retired from the list still resolves.
export const portraitOf = ch => PORTRAITS.find(p => portraitUrl(p.file) === ch?.portrait) || null;

// The picture to open for a character: the full plate where there is one, the crop where there is
// not, and nothing at all for a character with no portrait — which the caller shows as initials.
export function artUrl(ch) {
  if (!ch?.portrait) return "";
  const p = portraitOf(ch);
  return p?.art ? fullArtUrl(p.art) : ch.portrait;
}
