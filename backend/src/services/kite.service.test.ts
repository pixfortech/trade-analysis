import { test } from "node:test";
import assert from "node:assert/strict";

// Configure a known Kite env BEFORE importing the service (env is read at load).
process.env.KITE_API_KEY = "test_api_key";
process.env.KITE_API_SECRET = "super_secret_value";
process.env.KITE_ACCESS_TOKEN = "";
process.env.KITE_ENABLE_LIVE_DATA = "false";

// Use require (CommonJS) to import after env is set, avoiding top-level await.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const kite = require("./kite.service") as typeof import("./kite.service");

test("status never leaks the API secret or access token", () => {
  const status = kite.getPublicStatus();
  const serialized = JSON.stringify(status);
  assert.ok(!serialized.includes("super_secret_value"), "secret must not appear in status");
  assert.ok(!("apiSecret" in status), "status must not expose apiSecret");
  assert.ok(!("accessToken" in status), "status must not expose accessToken");
  // Only boolean/string flags are exposed.
  assert.equal(status.readOnly, true);
  assert.equal(typeof status.liveDataEnabled, "boolean");
  assert.equal(typeof status.authenticated, "boolean");
});

test("when live data disabled, status mode is 'disabled' with a clear message", () => {
  const status = kite.getPublicStatus();
  assert.equal(status.liveDataEnabled, false);
  assert.equal(status.mode, "disabled");
  assert.match(status.message, /disabled/i);
});

test("status exposes secret-free env diagnostics (booleans only, no values)", () => {
  const status = kite.getPublicStatus();
  // apiKey/apiSecret were set in this test's env → present booleans true.
  assert.equal(status.env.apiKeyPresent, true);
  assert.equal(status.env.apiSecretPresent, true);
  assert.equal(typeof status.env.liveDataEnvPresent, "boolean");
  assert.equal(typeof status.env.redirectUrlPresent, "boolean");
  // The diagnostics must be booleans, never the secret value itself.
  assert.ok(!JSON.stringify(status.env).includes("super_secret_value"));
});

test("buildLoginUrl is blocked while live data is disabled", () => {
  assert.throws(() => kite.buildLoginUrl(), /disabled/i);
});

test("read endpoints refuse to call Kite while disabled (no network)", async () => {
  await assert.rejects(() => kite.getQuote("NSE:RELIANCE"), /disabled/i);
  await assert.rejects(
    () => kite.getHistorical({ instrumentToken: "738561", interval: "day", from: "x", to: "y" }),
    /disabled/i,
  );
});

test("helpers reflect configuration without exposing secrets", () => {
  assert.equal(kite.isConfigured(), true); // key + secret present
  assert.equal(kite.isLiveDataEnabled(), false);
  assert.equal(kite.hasAccessToken(), false);
});
