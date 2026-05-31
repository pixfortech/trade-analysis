# Market Data Integration (Future Phases)

How the tool will (later) connect to **authorised** Indian market-data sources.

> ⚠️ **Not implemented in Phase 1.** No provider is connected and no keys exist.
> This is a planning document. When implemented, integration must comply with
> each provider's API terms, exchange (NSE/BSE) rules, and SEBI regulations.
> Do **not** scrape websites or use unauthorised/leaked feeds.

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
