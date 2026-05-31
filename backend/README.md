# Backend — AI Share Market Analysis Tool

**Node.js + Express + TypeScript** API gateway. In Phase 1 every route returns
**placeholder/mock** JSON — there is no live market data or AI wired up.

## Run

```bash
npm install                 # first time only
cp .env.example .env        # first time only
npm run dev                 # http://localhost:4000
```

Build & run compiled:

```bash
npm run build && npm start
```

## Endpoints (base `/api`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Server health check |
| GET | `/api/market/quote?symbol=RELIANCE` | Placeholder quote |
| GET | `/api/market/history?symbol=NIFTY&interval=1d` | Placeholder candles |
| POST | `/api/analysis/technical` | Placeholder technical analysis |
| POST | `/api/analysis/futures` | Placeholder futures analysis |
| POST | `/api/analysis/options` | Placeholder options analysis |
| POST | `/api/analysis/trade-plan` | Placeholder entry/SL/target plan |

Quick test:

```bash
curl http://localhost:4000/api/health
curl "http://localhost:4000/api/market/quote?symbol=RELIANCE"
curl -X POST http://localhost:4000/api/analysis/trade-plan \
  -H "Content-Type: application/json" \
  -d '{"symbol":"RELIANCE","segment":"equity","capital":100000,"riskPercent":1}'
```

## Structure

```
src/
├── index.ts            # bootstrap
├── app.ts              # express app + middleware
├── config/env.ts       # typed env config
├── routes/             # health, market, analysis
├── controllers/        # placeholder handlers
├── middleware/         # error handler, 404
└── utils/              # mock data + async wrapper
```
