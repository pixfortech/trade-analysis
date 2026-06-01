import { test } from "node:test";
import assert from "node:assert/strict";

// Force a small, predictable TTL before importing the service (env read at load).
process.env.KITE_INSTRUMENTS_TTL_HOURS = "24";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const instruments = require("./instruments.service") as typeof import("./instruments.service");

const sample = [
  {
    instrumentToken: 1,
    exchangeToken: 1,
    tradingsymbol: "RELIANCE",
    name: "RELIANCE",
    lastPrice: 0,
    expiry: "",
    strike: 0,
    tickSize: 0.05,
    lotSize: 1,
    instrumentType: "EQ",
    segment: "NSE",
    exchange: "NSE",
  },
];

test("fresh cache is not expired; status reports counts & ttl", () => {
  instruments.setCache(sample, "kite", new Date().toISOString());
  assert.equal(instruments.isExpired(), false);
  const s = instruments.getCacheStatus();
  assert.equal(s.ready, true);
  assert.equal(s.count, 1);
  assert.equal(s.ttlHours, 24);
  assert.ok(s.expiresAt && Date.parse(s.expiresAt) > Date.now());
});

test("cache older than TTL is expired", () => {
  const old = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
  instruments.setCache(sample, "disk", old);
  assert.equal(instruments.isExpired(), true);
  const s = instruments.getCacheStatus();
  assert.equal(s.expired, true);
  assert.equal(s.source, "disk");
});

test("empty cache is treated as expired / not ready", () => {
  instruments._resetCache();
  assert.equal(instruments.isExpired(), true);
  assert.equal(instruments.isLoaded(), false);
  assert.equal(instruments.getCacheStatus().ready, false);
});

test("expiresAt is null when nothing is loaded", () => {
  instruments._resetCache();
  assert.equal(instruments.expiresAt(), null);
});
