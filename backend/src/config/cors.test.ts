import { test } from "node:test";
import assert from "node:assert/strict";
import { isOriginAllowed } from "./cors";

const allowed = ["http://localhost:3000"];

test("allows explicitly configured origins", () => {
  assert.equal(isOriginAllowed("http://localhost:3000", allowed, false), true);
});

test("rejects unknown origins", () => {
  assert.equal(isOriginAllowed("https://evil.example.com", allowed, false), false);
});

test("allows GitHub Codespaces origins when dev wildcards are on", () => {
  assert.equal(
    isOriginAllowed("https://glorious-train-abc123-3000.app.github.dev", allowed, true),
    true,
  );
  // The backend's own forwarded origin should also pass.
  assert.equal(
    isOriginAllowed("https://glorious-train-abc123-4000.app.github.dev", allowed, true),
    true,
  );
});

test("blocks Codespaces origins when dev wildcards are off (production)", () => {
  assert.equal(
    isOriginAllowed("https://glorious-train-abc123-3000.app.github.dev", allowed, false),
    false,
  );
});

test("does not allow look-alike domains", () => {
  assert.equal(isOriginAllowed("https://app.github.dev.evil.com", allowed, true), false);
  assert.equal(isOriginAllowed("not-a-url", allowed, true), false);
});
