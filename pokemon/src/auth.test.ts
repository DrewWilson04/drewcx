import { test } from "node:test";
import assert from "node:assert/strict";
import { checkPassword, createSession, verifySession } from "./auth.ts";

test("password check", () => {
  assert.equal(checkPassword("KHFan"), true);
  assert.equal(checkPassword("khfan"), false);
  assert.equal(checkPassword(""), false);
});

test("session cookie verifies, expires, and dies with a password change", async () => {
  const now = Date.UTC(2026, 0, 1);
  const cookie = await createSession(30, now);
  assert.equal(await verifySession(cookie, now), true);
  assert.equal(await verifySession(cookie, now, "new-password"), false);
  assert.equal(await verifySession(cookie, now + 31 * 86400_000), false);
  assert.equal(await verifySession("123.!!!", now), false);
  assert.equal(await verifySession(undefined, now), false);
});
