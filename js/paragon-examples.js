// Arcanum Veritas Builder — RETIRED
//
// The worked Paragon Ability sets from the rules used to live here as a JavaScript constant,
// because there was nowhere else to put them: a player's own sets were rows in the database and
// these three were shipped in the page.
//
// Both now live in the same place, beside the Cognitions:
//
//     cognitions/devotions/<player>_<cognition>_devotion.json
//
// A set with `"example": true` and no `player` is one of the rules' three worked examples — The
// Kindled Heart, The Hearth-Keeper, The Unbroken Oath — and is readable by anyone. Everything
// else belongs to the player named in `player`, and the server hands it to nobody else.
//
// Nothing loads this file. It is left here so the history of the change is readable from the
// folder, and can be deleted whenever that stops being useful.
