import { test } from "node:test";
import assert from "node:assert/strict";
import { getMarketStatus } from "./marketStatus";

// Build a UTC instant that maps to a given IST wall-clock on a given weekday.
// IST = UTC+5:30, so subtract 5h30m from the desired IST time.
function istInstant(year: number, month: number, day: number, istHour: number, istMin: number): Date {
  return new Date(Date.UTC(year, month - 1, day, istHour, istMin) - (5 * 60 + 30) * 60 * 1000);
}

// 2026-06-01 is a Monday.
test("open during regular session (Mon 11:00 IST)", () => {
  const s = getMarketStatus(istInstant(2026, 6, 1, 11, 0));
  assert.equal(s.status, "open");
  assert.equal(s.market, "NSE");
  assert.equal(s.timezone, "Asia/Kolkata");
  assert.ok(s.nextCloseTime?.includes("15:30"));
});

test("pre-open (Mon 09:05 IST)", () => {
  const s = getMarketStatus(istInstant(2026, 6, 1, 9, 5));
  assert.equal(s.status, "pre-open");
});

test("closed before pre-open (Mon 08:00 IST)", () => {
  const s = getMarketStatus(istInstant(2026, 6, 1, 8, 0));
  assert.equal(s.status, "closed");
  assert.ok(s.nextOpenTime?.includes("09:15"));
});

test("post-close window (Mon 15:45 IST)", () => {
  const s = getMarketStatus(istInstant(2026, 6, 1, 15, 45));
  assert.equal(s.status, "post-close");
});

test("closed after 16:00 (Mon 18:00 IST)", () => {
  const s = getMarketStatus(istInstant(2026, 6, 1, 18, 0));
  assert.equal(s.status, "closed");
});

test("weekend (Sat 11:00 IST)", () => {
  // 2026-06-06 is a Saturday.
  const s = getMarketStatus(istInstant(2026, 6, 6, 11, 0));
  assert.equal(s.status, "weekend");
});

test("holidayStatus is unknown (calendar not implemented)", () => {
  const s = getMarketStatus(istInstant(2026, 6, 1, 11, 0));
  assert.equal(s.holidayStatus, "unknown");
  assert.ok(s.currentIstTime.includes("IST"));
});
