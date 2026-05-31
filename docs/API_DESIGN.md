# API Design

This documents the planned HTTP APIs for the **backend** (Node/Express) and the
**AI engine** (Python/FastAPI).

> **Phase 2 status:** All endpoints exist and return **mock/demo** data. The
> backend's `/api/analysis/*` routes now **proxy to the AI engine** and fall back
> to local mock data if it is unavailable. Nothing connects to live market data
> or real AI yet.

Conventions:
- All payloads are JSON (`Content-Type: application/json`), keys are **camelCase**.
- Money/levels are numbers in INR. Timestamps are ISO-8601 (UTC).
- `segment` ∈ `equity | stock_future | index_future | stock_option | index_option`.
- Every analysis response carries:
  - `disclaimer` — risk/educational notice.
  - `demo` — `true` while data is mock/demo (Phase 2).
  - `source` — one of `ai-engine` (from the engine), `mock` (engine's own mock
    logic), or `mock-fallback` (engine unreachable; backend served local mock).

---

## Backend API — base `http://localhost:4000`

### `GET /api/health`
Health/liveness check.
```jsonc
// 200 OK
{ "status": "ok", "service": "backend", "uptime": 12.34, "timestamp": "2026-01-01T00:00:00.000Z" }
```

### `GET /api/market/quote`
Placeholder latest quote for a symbol.
- **Query:** `symbol` (e.g. `RELIANCE`), optional `segment`.
```jsonc
// 200 OK
{
  "source": "mock",
  "data": {
    "symbol": "RELIANCE", "segment": "equity",
    "ltp": 2945.5, "change": 18.2, "changePercent": 0.62,
    "open": 2930.0, "high": 2958.0, "low": 2921.4, "prevClose": 2927.3,
    "volume": 5123000, "timestamp": "2026-01-01T00:00:00.000Z"
  }
}
```

### `GET /api/market/history`
Placeholder historical candles (OHLCV).
- **Query:** `symbol`, `interval` (`1m|5m|15m|1d`, default `1d`), `limit` (default `50`).
```jsonc
// 200 OK
{
  "source": "mock",
  "symbol": "RELIANCE", "interval": "1d",
  "candles": [
    { "t": "2025-12-01T00:00:00.000Z", "o": 2900, "h": 2950, "l": 2890, "c": 2945, "v": 4800000 }
  ]
}
```

### `POST /api/analysis/technical`
Proxies to the AI engine `POST /analyse/equity`; mock-fallback on failure.
```jsonc
// Request
{ "symbol": "NIFTY", "segment": "index_future", "interval": "15m" }
// 200 OK
{
  "source": "ai-engine",
  "demo": true,
  "symbol": "NIFTY",
  "segment": "equity",
  "signal": "bullish",
  "score": 0.42,
  "notes": ["DEMO equity analysis from deterministic mock data — not live analysis."],
  "metrics": { "rsi": 58.3, "macd": "bullish_crossover", "ema20": 21450, "ema50": 21320 },
  "disclaimer": "Educational use only. Not investment advice. ..."
}
```

### `POST /api/analysis/futures`
Placeholder futures analysis (basis, rollover, OI build-up).
```jsonc
// Request
{ "symbol": "BANKNIFTY", "expiry": "2026-01-29" }
// 200 OK
{
  "source": "mock",
  "symbol": "BANKNIFTY",
  "signal": "bearish",
  "futures": { "basis": -12.5, "oiChangePercent": 4.2, "interpretation": "short_buildup" },
  "disclaimer": "Educational use only. Not investment advice."
}
```

### `POST /api/analysis/options`
Placeholder options-chain / OI analysis.
```jsonc
// Request
{ "symbol": "NIFTY", "expiry": "2026-01-29" }
// 200 OK
{
  "source": "mock",
  "symbol": "NIFTY",
  "pcr": 0.92, "maxPain": 21500,
  "support": [21300, 21000], "resistance": [21700, 22000],
  "signal": "neutral",
  "disclaimer": "Educational use only. Not investment advice."
}
```

### `POST /api/analysis/trade-plan`
Proxies to the AI engine `POST /analyse/trade-plan`; mock-fallback on failure.
A trade plan **always** includes entry, stop-loss, target and risk-reward.
```jsonc
// Request
{ "symbol": "RELIANCE", "segment": "equity", "capital": 100000, "riskPercent": 1 }
// 200 OK
{
  "source": "ai-engine",
  "demo": true,
  "symbol": "RELIANCE", "segment": "equity",
  "action": "BUY", "signal": "bullish", "confidence": 63,
  "entry": 2945, "stopLoss": 2905.83, "target": 3033.35,
  "riskReward": 2.26,
  "rationale": ["DEMO trade plan from deterministic mock data — no live market data is used."],
  "disclaimer": "Educational use only. Not investment advice. Trading involves risk of loss. ..."
}
```

---

## AI Engine API — base `http://localhost:8000`

Interactive docs auto-generated at **`/docs`** (Swagger) and **`/redoc`**.

### `GET /health`
```jsonc
{ "status": "ok", "service": "ai-engine", "version": "0.1.0" }
```

### `POST /analyse/equity`
```jsonc
// Request
{ "symbol": "TCS", "interval": "1d" }
// 200 OK
{
  "source": "mock", "demo": true,
  "symbol": "TCS", "segment": "equity", "signal": "neutral",
  "score": 0.33, "metrics": { "rsi": 52.0, "macd": "flat" },
  "notes": ["DEMO equity analysis from deterministic mock data — not live analysis."],
  "disclaimer": "Educational use only. Not investment advice. ..."
}
```

### `POST /analyse/futures`
```jsonc
// Request
{ "symbol": "NIFTY", "expiry": "2026-01-29" }
// 200 OK
{ "symbol": "NIFTY", "segment": "index_future", "signal": "bullish", "score": 0.0,
  "metrics": {}, "notes": ["placeholder"], "disclaimer": "Educational use only. Not investment advice." }
```

### `POST /analyse/options`
```jsonc
// Request
{ "symbol": "BANKNIFTY", "expiry": "2026-01-29" }
// 200 OK
{ "symbol": "BANKNIFTY", "segment": "index_option", "signal": "neutral", "score": 0.0,
  "chainSummary": {}, "notes": ["placeholder"], "disclaimer": "Educational use only. Not investment advice." }
```

### `POST /analyse/trade-plan`
```jsonc
// Request
{ "symbol": "NIFTY", "segment": "index_option", "capital": 100000, "riskPercent": 1 }
// 200 OK  (demo plan still includes full risk controls)
{
  "source": "mock", "demo": true,
  "symbol": "NIFTY", "segment": "index_option",
  "action": "BUY", "signal": "bullish", "confidence": 63,
  "entry": 1893.5, "stopLoss": 1865.1, "target": 1950.31, "riskReward": 2.0,
  "rationale": ["DEMO trade plan from deterministic mock data — no live market data is used."],
  "disclaimer": "Educational use only. Not investment advice. Trading involves risk of loss. ..."
}
```

---

## Error Format (both services)

```jsonc
// 4xx / 5xx
{ "error": { "message": "Human-readable message", "code": "OPTIONAL_CODE" } }
```

## Backend → AI engine mapping (Phase 2)

| Backend route | AI engine route |
|---|---|
| `POST /api/analysis/technical` | `POST /analyse/equity` |
| `POST /api/analysis/futures` | `POST /analyse/futures` |
| `POST /api/analysis/options` | `POST /analyse/options` |
| `POST /api/analysis/trade-plan` | `POST /analyse/trade-plan` |

The backend calls the engine via a service layer with a bounded timeout
(`AI_ENGINE_TIMEOUT_MS`). On timeout/error it returns the same contract shape
with `source: "mock-fallback"`, so clients always get a valid response.

## Versioning & Auth (future)
- Versioning via path prefix (e.g. `/api/v1/...`) once contracts stabilise.
- Auth (API key / JWT) and rate-limiting to be added in a later phase — keep all
  provider/AI secrets server-side.
