import { test } from "node:test";
import assert from "node:assert/strict";
import { isOnlineDrop } from "./x.ts";

test("flags online drop posts", () => {
  assert.equal(isOnlineDrop("Prismatic ETBs LIVE NOW on Pokemon Center"), true);
  assert.equal(isOnlineDrop("Restocked at target.com, link below"), true);
  assert.equal(isOnlineDrop("Saw a vendor at my local store this morning"), false);
});
