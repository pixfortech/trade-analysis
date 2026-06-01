# Market Data Integration (Future Phases)

How the tool will (later) connect to **authorised** Indian market-data sources.

> ⚠️ **Mostly a planning document.** Phase 3A adds an **optional, read-only**
> Zerodha Kite Connect integration (see section 7); everything else below
> remains future work. Integration must comply with each provider's API terms,
> exchange (NSE/BSE) rules, and SEBI regulations. Do **not** scrape websites or
> use unauthorised/leaked feeds.

---

## 7. Phase 3A — Zerodha Kite Connect (READ-ONLY) ✅ scaffolded

A first, **read-only** provider integration lives in the backend. It is
**disabled by default** and makes no external calls until you opt in with your
own authorised Kite developer credentials.

**Scope (intentionally limited):**
- ✅ Connection status, hosted login (session token), live **quotes**, **historical** candles.
- ❌ **No** order placement / modification / cancellation, **no** GTT, **no**
  baskets, **no** trade execution. This app is analysis-only.

**Security model:**
- `KITE_API_SECRET` and the access token are **server-side only** — never sent
  to the frontend and never logged. The login checksum
  (`SHA-256(api_key + request_token + api_secret)`) is computed in the backend.
- The frontend status endpoint returns **booleans only** (`liveDataEnabled`,
  `configured`, `authenticated`) plus a human message — no secrets.
- The access token is held **in memory** in the backend process (not persisted
  to the repo). Restarting the backend requires logging in again.

**Master switch:** `KITE_ENABLE_LIVE_DATA=false` (default). While false, all Kite
endpoints return a clear "disabled" message and **no network call is made**.

**Backend endpoints (all under `/api/kite`):**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/kite/status` | Secret-free status for the UI |
| GET | `/api/kite/login-url` | Hosted Kite login URL (public `api_key` only) |
| GET | `/api/kite/callback?request_token=…` | Exchanges request token → access token (server-side) |
| POST | `/api/kite/logout` | Clears the in-memory session (not a trade action) |
| GET | `/api/kite/quote?instrument=NSE:RELIANCE` | Live read-only quote |
| GET | `/api/kite/historical?instrumentToken=…&interval=day&from=…&to=…` | Read-only candles |

**Local setup:** see the README "Live Data (Zerodha Kite, read-only)" section.
Get credentials from your own account at <https://developers.kite.trade/>.
Register the redirect URL (e.g. `http://localhost:4000/api/kite/callback`) in
your Kite app. Respect Kite's API terms and SEBI regulations.

> When the full **provider abstraction** (section 1) is built, this Kite service
> becomes the first concrete `MarketDataProvider` implementation.

### 7a. Live Trade Plan analysis (Phase 3B) ✅

`GET /api/analysis/live-trade-plan?instrument=NSE:RELIANCE&interval=5minute&riskProfile=balanced`

Combines a **live Kite quote** with **historical candles** (when an
`instrument_token` is available) and runs a pure, dependency-free technical
engine (`services/technicalAnalysis.ts`) to produce:

- Trend (direction + strength) from EMA9/EMA20/VWAP/RSI/MACD vs. previous close.
- Support/resistance via floor pivots from recent swing extremes.
- **Long** plan (entry above resistance/breakout) and **short** plan (entry below
  support/breakdown), each with stop-loss (ATR- or range-based, scaled by
  `riskProfile`), Target 1/2/3 and a risk-reward ratio.
- A final decision: `LONG | SHORT | WAIT | AVOID | RANGE-BOUND`.

**Graceful degradation:** if candles are unavailable, the engine uses the quote
OHLC only, marks `dataQuality: "live-quote-only"`, caps confidence (never
"high"), and prefers `WAIT`/`AVOID`. `riskProfile` ∈
`conservative | balanced | aggressive` (wider→tighter stops).

**Still read-only:** this endpoint computes levels for information only. It does
**not** place, modify or cancel orders, and every response carries the risk
disclaimer. No profit is guaranteed.

### 7b. Instruments resolver for F&O (Phase 3C) ✅

Kite requires the **exact** `exchange:tradingsymbol`. Equity is simple
(`NSE:RELIANCE`), but futures/options use the **NFO** exchange with contract
symbols like `MIDCPNIFTY26JUNFUT` or `NIFTY26JUN24500CE` — these must come from
Kite's **instruments dump**, never be guessed. This phase downloads, caches and
searches that dump, and resolves friendly inputs to exact symbols + tokens.

**Cache:** the instruments CSV is parsed into memory (instrument_token,
exchange_token, tradingsymbol, name, last_price, expiry, strike, tick_size,
lot_size, instrument_type, segment, exchange). It is loaded on first use and can
be refreshed. It contains only the **live** contracts Kite returns.

**Endpoints (all under `/api/kite/instruments`, read-only):**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/kite/instruments/status` | Cache status + per-exchange counts (no secrets) |
| POST | `/api/kite/instruments/refresh` | (Re)download & parse the dump |
| GET | `/api/kite/instruments/search?q=MIDCPNIFTY&segment=NFO&instrumentType=FUT` | Search contracts |
| GET | `/api/kite/instruments/resolve?underlying=…&instrumentType=FUT&expiry=…&strike=…&optionType=CE` | Resolve to one exact contract or sorted candidates |

**Resolution rules:**
- **Futures:** `underlying` + `instrumentType=FUT` (+ optional `expiry`; blank → nearest).
- **Options:** `underlying` + `optionType` (CE/PE) + `strike` (+ optional `expiry`).
- **No guessing:** on multiple/ambiguous matches it returns **sorted candidates**
  (nearest expiry, then strike); on no match it returns a helpful message.

**Quote & live-trade-plan integration:** both `GET /api/kite/quote` and
`GET /api/analysis/live-trade-plan` accept **either** `instrument=EXCHANGE:TRADINGSYMBOL`
**or** the resolver params above. Invalid inputs such as
`NSE:MIDCPNIFTY FUT JUN` (spaces — not a real Kite symbol) are rejected with
guidance to use the resolver. For F&O historical candles, the resolved
`instrument_token` is used.

Still **read-only**: no order/trade execution anywhere.

### 7c. Cache hardening, grouped search & batch quotes (Phase 3D) ✅

**Cache hardening:**
- **TTL** (`KITE_INSTRUMENTS_TTL_HOURS`, default **24h**). `ensureLoaded()`
  auto-refreshes on first use or when expired.
- **Disk persistence** to `backend/.cache/kite-instruments.json` so the dump
  survives restarts. `.cache/` is **gitignored** — never commit it.
- **Graceful fallback:** if a refresh download fails but a (possibly stale)
  cache exists in memory or on disk, it is kept and used; only a totally empty
  cache + failed refresh raises an error.
- `GET /api/kite/instruments/status` now reports `ready`, `loadedAt`,
  `expiresAt`, `expired`, `ttlHours`, `source` (`kite`|`disk`) and counts.

**Zerodha-like grouped search** — `GET /api/kite/instruments/search`:
- Free-text queries: `RELIANCE`, `MIDCPNIFTY FUT`, `NIFTY 24500 CE`,
  `BANKNIFTY PE`. The query is parsed for strike / CE-PE / FUT hints.
- Results are **grouped** as `{ equity, indices, futures, options }` and ranked
  (exact/prefix match first; equity & index before derivatives; nearest expiry
  next). Each result includes `displayName`, `uiSegment`, `instrumentType`
  (`EQ|INDEX|FUT|CE|PE`), `expiry`, `strike`, `optionType`, `lotSize`,
  `instrumentToken`. Filters: `segment` (equity|indices|futures|options|all),
  `underlying`, `instrumentType`, `expiry`, `strike`, `optionType`, `limit`.
- Indices use the **exact** exchange/symbol from the dump (e.g. `NSE:NIFTY 50`),
  never a guessed key.

**Batch quotes** — `GET /api/kite/quotes?instruments=NSE:RELIANCE,NFO:MIDCPNIFTY26JUNFUT`:
returns live quotes for many instruments at once; unknown instruments are listed
in `missing` rather than failing the call. Used by the watchlist & dashboard.

**Frontend UX:** a reusable **InstrumentSearch** (debounced, grouped, keyboard
navigable) is used in the Live Trade Plan and Watchlist. The dashboard is
**customisable** (show/hide + reorder cards, reset) with layout and watchlist
persisted in `localStorage`. Text sizes were increased for readability. The app
remains **read-only** — there is no order placement or trade execution.

---

## 1. Design Principle: a Provider Abstraction

The backend will expose a single internal interface and select a concrete
implementation by environment variable, so providers can be swapped without
changing app logic:

```
MARKET_DATA_PROVIDER = zerodha | upstox | dhan | angelone | truedata | mock
```

Conceptual interface (illustrative):

```ts
interface MarketDataProvider {
  getQuote(symbol: string, segment: Segment): Promise<Quote>;
  getHistory(symbol: string, interval: Interval, limit: number): Promise<Candle[]>;
  getOptionChain(symbol: string, expiry: string): Promise<OptionChain>;
  subscribe(symbols: string[], onTick: (t: Tick) => void): Unsubscribe; // live ticks
}
```

All credentials stay **server-side** (backend / engine). The browser never sees a
provider key or token.

---

## 2. Candidate Providers (India)

| Provider | Product | Typical auth | Notable for |
|---|---|---|---|
| **Zerodha** | Kite Connect | API key + secret → daily `access_token` (login flow) | Widely used; REST + WebSocket ticks; historical data add-on |
| **Upstox** | Upstox API | OAuth2 (authorization code → access token) | REST + WebSocket; instruments master |
| **Dhan** | DhanHQ API | API access token | REST + live feed; options data |
| **Angel One** | SmartAPI | API key + TOTP-based login → JWT | Free tier; REST + WebSocket |
| **TrueData** | Market data feed | Username/password + API key | Real-time & historical data vendor |
| *(others)* | Authorised NSE/BSE vendors / redistributors | Varies | Use only licensed redistribution |

> Capabilities, pricing, rate limits, and data licensing change over time —
> always confirm against the provider's **current** official documentation
> before integrating, and ensure you hold the right data subscription
> (e.g. F&O, historical, depth).

---

## 3. Typical Auth Models

- **Login + daily token (e.g. Zerodha):** exchange API key/secret for a
  short-lived `access_token` via a login redirect; refresh daily.
- **OAuth2 (e.g. Upstox):** redirect → authorization code → access/refresh token.
- **TOTP-based (e.g. Angel One SmartAPI):** key + TOTP → session/JWT.
- **Static token (e.g. Dhan):** long-lived access token from the dashboard.

Store secrets in env vars / a secrets manager. Persist short-lived tokens
securely server-side (never in the repo, never in the browser).

Relevant env placeholders (already in `.env.example`):
```
MARKET_DATA_PROVIDER=
MARKET_DATA_API_KEY=
MARKET_DATA_API_SECRET=
MARKET_DATA_ACCESS_TOKEN=
```

---

## 4. Data We Will Consume

- **Quotes / LTP** per symbol & segment.
- **Historical OHLCV** candles (multiple intervals) for technical analysis.
- **Instruments master** (symbol ↔ token mapping, lot sizes, expiries).
- **Option chains** (strikes, OI, IV, bid/ask) for options analytics.
- **Live ticks** via WebSocket for the live chart and intraday signals.

---

## 5. Reliability & Compliance Checklist

- [ ] Respect **rate limits**; add backoff and caching.
- [ ] Cache instrument masters; refresh on schedule.
- [ ] Handle market **session hours**, holidays, and expiries.
- [ ] Reconnect/resubscribe logic for WebSockets.
- [ ] Normalise every provider's payload into our internal schema.
- [ ] Keep an audit log of data sources used per response (`source` field).
- [ ] Honour **data licensing / redistribution** terms — display data only as permitted.
- [ ] Comply with **SEBI** regulations and broker/exchange API agreements.
- [ ] Surface the **risk disclaimer** wherever data drives a recommendation.

---

## 6. Migration Path (mock → live)

1. Implement the `MarketDataProvider` interface with a `mock` provider (Phase 1/2).
2. Add one real provider behind the same interface (Phase 3).
3. Flip `MARKET_DATA_PROVIDER` via env — no UI/logic changes required.
4. Add caching, WebSocket ticks, and multi-provider fallback as needed.
