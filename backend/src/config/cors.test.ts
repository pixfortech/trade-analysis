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

test("allows the deployed Firebase frontend (production)", () => {
  // Production (allowDevWildcards=false), explicit allowed list empty → must
  // still pass via the Firebase suffix rule.
  assert.equal(isOriginAllowed("https://trade-analysis-ai-engine.web.app", [], false), true);
  assert.equal(isOriginAllowed("https://trade-analysis-ai-engine.firebaseapp.com", [], false), true);
});

test("allows any Firebase Hosting domain (preview channels) in production", () => {
  assert.equal(isOriginAllowed("https://some-preview--abc.web.app", [], false), true);
  assert.equal(isOriginAllowed("https://other-site.firebaseapp.com", [], false), true);
});

test("default allow-list (no args) covers Firebase + localhost", () => {
  // Using the real defaults (DEFAULT_ALLOWED_ORIGINS + env.corsOrigin).
  assert.equal(isOriginAllowed("https://trade-analysis-ai-engine.web.app"), true);
  assert.equal(isOriginAllowed("http://localhost:3000"), true);
});

test("rejects Firebase look-alike domains", () => {
  assert.equal(isOriginAllowed("https://web.app.evil.com", [], false), false);
  assert.equal(isOriginAllowed("https://firebaseapp.com.evil.com", [], false), false);
});
