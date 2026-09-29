import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword, createSession, verifySession } from "./auth.ts";

test("password hash round-trips and rejects wrong passwords", async () => {
  const stored = await hashPassword("pikachu");
  assert.match(stored, /^pbkdf2-sha256\$100000\$/);
  assert.equal(await verifyPassword("pikachu", stored), true);
  assert.equal(await verifyPassword("raichu", stored), false);
  assert.equal(await verifyPassword("pikachu", "garbage"), false);
});

test("session cookie verifies, expires, and dies with a password change", async () => {
  const now = Date.UTC(2026, 0, 1);
  const cookie = await createSession("secret", "hashA", 30, now);
  assert.equal(await verifySession(cookie, "secret", "hashA", now), true);
  assert.equal(await verifySession(cookie, "other-secret", "hashA", now), false);
  assert.equal(await verifySession(cookie, "secret", "hashB", now), false);
  assert.equal(await verifySession(cookie, "secret", "hashA", now + 31 * 86400_000), false);
  assert.equal(await verifySession("123.!!!", "secret", "hashA", now), false);
  assert.equal(await verifySession(undefined, "secret", "hashA", now), false);
});
