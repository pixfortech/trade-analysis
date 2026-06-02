// =====================================================================
// Market Status — NSE session state in IST (Phase 3G, pure & testable)
// ---------------------------------------------------------------------
// Computes whether the NSE regular session is open/closed/pre-open/post-close/
// weekend, in Asia/Kolkata, with next open/close times. Holiday calendar is not
// implemented yet → holidayStatus is "unknown" but the structure is ready.
// Pure: takes an explicit `now` (defaults to current time) for deterministic tests.
// =====================================================================

export type MarketState = "open" | "closed" | "pre-open" | "post-close" | "weekend" | "holiday-unknown";

export interface MarketStatus {
  market: "NSE";
  timezone: "Asia/Kolkata";
  status: MarketState;
  currentIstTime: string;
  nextOpenTime: string | null;
  nextCloseTime: string | null;
  holidayStatus: "unknown";
  message: string;
}

// NSE regular session (IST). Pre-open 09:00–09:15; regular 09:15–15:30.
const PRE_OPEN_MIN = 9 * 60; // 09:00
const OPEN_MIN = 9 * 60 + 15; // 09:15
const CLOSE_MIN = 15 * 60 + 30; // 15:30
const POST_CLOSE_MIN = 16 * 60; // 16:00

/** Convert a Date to IST calendar parts (no external tz library). */
function istParts(now: Date): { y: number; mo: number; d: number; h: number; mi: number; dow: number; label: string } {
  // en-GB gives 24h; en-US weekday. Use Intl with Asia/Kolkata.
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const hour = Number(parts.hour) % 24; // en-GB sometimes emits "24" at midnight
  return {
    y: Number(parts.year),
    mo: Number(parts.month),
    d: Number(parts.day),
    h: hour,
    mi: Number(parts.minute),
    dow: weekdayMap[parts.weekday as string] ?? 0,
    label: `${parts.year}-${parts.month}-${parts.day} ${String(hour).padStart(2, "0")}:${parts.minute}:${parts.second} IST`,
  };
}

function hhmm(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} IST`;
}

export function getMarketStatus(now: Date = new Date()): MarketStatus {
  const ist = istParts(now);
  const minutes = ist.h * 60 + ist.mi;
  const isWeekend = ist.dow === 0 || ist.dow === 6;

  let status: MarketState;
  let message: string;
  let nextOpenTime: string | null = null;
  let nextCloseTime: string | null = null;

  if (isWeekend) {
    status = "weekend";
    message = "NSE is closed for the weekend. Live quotes may show last traded values.";
    nextOpenTime = "Monday 09:15 IST";
  } else if (minutes < PRE_OPEN_MIN) {
    status = "closed";
    message = "NSE is closed (before pre-open). Quotes may show last traded values.";
    nextOpenTime = hhmm(OPEN_MIN);
  } else if (minutes < OPEN_MIN) {
    status = "pre-open";
    message = "NSE pre-open session (09:00–09:15 IST).";
    nextOpenTime = hhmm(OPEN_MIN);
  } else if (minutes < CLOSE_MIN) {
    status = "open";
    message = "NSE regular session is open (09:15–15:30 IST).";
    nextCloseTime = hhmm(CLOSE_MIN);
  } else if (minutes < POST_CLOSE_MIN) {
    status = "post-close";
    message = "NSE post-close session (15:40–16:00 IST window). Regular trading has ended.";
    nextOpenTime = "next trading day 09:15 IST";
  } else {
    status = "closed";
    message = "NSE is closed for the day. Quotes may show last traded values.";
    nextOpenTime = "next trading day 09:15 IST";
  }

  return {
    market: "NSE",
    timezone: "Asia/Kolkata",
    status,
    currentIstTime: ist.label,
    nextOpenTime,
    nextCloseTime,
    holidayStatus: "unknown",
    message:
      message +
      (status !== "open"
        ? " (Exchange holidays are not yet in the calendar, so a listed trading day could still be a holiday.)"
        : ""),
  };
}
