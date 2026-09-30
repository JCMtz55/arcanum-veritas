// Arcanum Veritas server — passwords (scrypt) and session tokens

import { scrypt, randomBytes, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";

const derive = promisify(scrypt);
const KEYLEN = 64;

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await derive(password, salt, KEYLEN);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

// A missing or locked ("!") hash still costs one derivation, so a wrong name and a wrong
// password take the same time to refuse.
export async function verifyPassword(password, stored) {
  const [kind, salt, key] = String(stored || "").split("$");
  const usable = kind === "scrypt" && salt && key;
  const got = await derive(password, usable ? Buffer.from(salt, "hex") : Buffer.alloc(16), KEYLEN);
  return !!usable && timingSafeEqual(got, Buffer.from(key, "hex"));
}

// The cookie carries the token; the database only ever holds its hash.
export function newToken() { return randomBytes(32).toString("base64url"); }
export function tokenHash(token) { return createHash("sha256").update(token).digest("hex"); }
