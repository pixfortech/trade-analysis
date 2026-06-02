import { test } from "node:test";
import assert from "node:assert/strict";
import { envFlag } from "./env";

// Robust parsing of KITE_ENABLE_LIVE_DATA-style flags (the Cloud Run env was
// passed space-separated and never created the var; once it IS set, parsing
// must tolerate whitespace/casing).

test("plain 'true' / 'false'", () => {
  assert.equal(envFlag("true"), true);
  assert.equal(envFlag("false"), false);
});

test("case-insensitive and whitespace-tolerant", () => {
  assert.equal(envFlag("TRUE"), true);
  assert.equal(envFlag(" True "), true);
  assert.equal(envFlag("\tTRUE\n"), true);
});

test("undefined → fallback (default false)", () => {
  assert.equal(envFlag(undefined), false);
  assert.equal(envFlag(undefined, true), true);
});

test("anything not 'true' is false", () => {
  assert.equal(envFlag("1"), false);
  assert.equal(envFlag("yes"), false);
  assert.equal(envFlag(""), false);
});
