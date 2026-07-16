import { test } from "node:test";
import assert from "node:assert/strict";
import { computeSessionOhlc, parseInstant, tzDateKey, wallClockToMs, intervalToMs } from "./sessionOhlc";
import type { Candle } from "./technicalAnalysis";

const TZ = "Asia/Kolkata";
function istHms(ms: number): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, hourCycle: "h23" }).format(new Date(ms));
}
function c(t: string, o: number, h: number, l: number, cl: number): Candle {
  return { t, o, h, l, c: cl, v: 1000 };
}

test("parseInstant handles ISO-with-offset and epoch s/ms; rejects junk", () => {
  const iso = parseInstant("2024-06-13T09:15:00+05:30");
  assert.ok(iso != null && tzDateKey(iso, TZ) === "2024-06-13");
  assert.equal(parseInstant(1718000000), parseInstant(1718000000000)); // seconds vs ms coalesce
  assert.equal(parseInstant(null), null);
  assert.equal(parseInstant("not-a-date"), null);
});

test("wallClockToMs round-trips IST wall time exactly (no double conversion)", () => {
  const ms = wallClockToMs("2024-06-13 15:29:59", TZ);
  assert.ok(ms != null);
  assert.equal(tzDateKey(ms!, TZ), "2024-06-13");
  assert.equal(istHms(ms!), "15:29:59"); // wall → epoch → wall reproduces exactly
});

test("computeSessionOhlc scans ONLY the current session (not yesterday, not future)", () => {
  const now = wallClockToMs("2024-06-13 10:30:00", TZ)!;
  const candles = [
    c("2024-06-12T09:20:00+05:30", 500, 999, 480, 900), // YESTERDAY high 999 — must be ignored
    c("2024-06-13T09:15:00+05:30", 100, 120, 95, 118), // today open
    c("2024-06-13T09:30:00+05:30", 118, 140, 90, 100), // today low 90
    c("2024-06-13T10:00:00+05:30", 100, 200, 130, 190), // today high 200
    c("2024-06-13T23:00:00+05:30", 190, 800, 180, 800), // FUTURE — must be ignored
  ];
  const s = computeSessionOhlc({ candles, intervalMs: intervalToMs("5minute"), quote: { open: 100, high: 999, low: 90, previousClose: 480, lastPrice: 190 }, cmpMs: null, nowMs: now });

  assert.equal(s.sessionDate, "2024-06-13");
  assert.equal(s.high.value, 200); // NOT 999 (yesterday) or 800 (future)
  assert.equal(s.low.value, 90);
  assert.equal(s.open.value, 100);
  assert.equal(s.high.precision, "candle");
  // Event times are within the current session and never in the future.
  assert.ok(s.high.ms != null && tzDateKey(s.high.ms, TZ) === "2024-06-13" && s.high.ms <= now);
  assert.ok(s.low.ms != null && s.low.ms <= now);
  assert.equal(istHms(s.high.ms!), "10:00:00");
  assert.equal(s.cmp.precision, "receipt"); // no exchange time supplied
  assert.equal(s.prevClose.precision, "session");
});

test("computeSessionOhlc falls back to quote OHLC (no times) when no candles", () => {
  const now = wallClockToMs("2024-06-13 10:30:00", TZ)!;
  const s = computeSessionOhlc({ candles: null, intervalMs: intervalToMs("5minute"), quote: { open: 10, high: 12, low: 9, previousClose: 11, lastPrice: 11.5 }, cmpMs: now, nowMs: now });
  assert.equal(s.high.value, 12);
  assert.equal(s.high.ms, null);
  assert.equal(s.high.precision, "none");
  assert.equal(s.cmp.precision, "tick"); // exchange time supplied
  assert.equal(s.cmp.ms, now);
});
