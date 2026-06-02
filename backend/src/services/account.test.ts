import { test } from "node:test";
import assert from "node:assert/strict";

// Kite disabled (default) → account calls must fail safely, never fake data.
process.env.KITE_ENABLE_LIVE_DATA = "false";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const account = require("./account.service") as typeof import("./account.service");

test("portfolio summary returns source 'unavailable' when Kite is disabled", async () => {
  const s = await account.getPortfolioSummary();
  assert.equal(s.source, "unavailable");
  assert.equal(s.availableCapital, 0);
  assert.ok(s.message.length > 0);
  assert.match(s.message, /unavailable|manually/i);
});

test("safe wrappers return ok:false (not a throw) when disabled", async () => {
  const funds = await account.getFundsAndMargins();
  assert.equal(funds.ok, false);
  const holdings = await account.getHoldings();
  assert.equal(holdings.ok, false);
});
