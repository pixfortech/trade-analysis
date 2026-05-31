# Development Roadmap

A phased plan from the current foundation to a live, deployed product. Each phase
is shippable and builds on the previous one. **Work one phase at a time.**

> ⚠️ Live market data and trading features depend on **authorised** API providers
> and compliance with broker/exchange (NSE/BSE) and SEBI rules. See
> [`MARKET_DATA_INTEGRATION.md`](MARKET_DATA_INTEGRATION.md).

---

## ✅ Phase 1 — Initial Repository Setup  *(current)*
**Goal:** Clean, scalable, runnable monorepo foundation.
- [x] Monorepo layout: `frontend`, `backend`, `ai-engine`, `docs`.
- [x] Frontend dark-mode dashboard with all 10 sections (mock data).
- [x] Backend Express API with placeholder routes, CORS, error handling.
- [x] FastAPI AI engine with placeholder analysis routes.
- [x] Env templates, `.gitignore`, README, CLAUDE.md, docs.
- [x] Branch workflow (`setup-branch` → PR → `main`).

**Out of scope:** live data, broker APIs, real AI, persistence, auth.

---

## 🔜 Phase 2 — Wire the services together
**Goal:** Real request/response flow end-to-end (still mock data underneath).
- [ ] Frontend data layer (typed API client) → backend.
- [ ] Backend → AI engine calls for each analysis endpoint.
- [ ] Shared, validated request/response contracts (Zod on Node, Pydantic on Python).
- [ ] Loading / error / empty states in the UI.
- [ ] Basic unit tests per service + CI (lint, typecheck, test).

## 📊 Phase 3 — Market data integration (authorised)
**Goal:** Replace mock quotes/candles with real (authorised) data.
- [ ] Provider abstraction layer (`MARKET_DATA_PROVIDER`): Zerodha Kite Connect / Upstox / Dhan / Angel One SmartAPI / TrueData.
- [ ] Auth flows + secure server-side token storage.
- [ ] Real quotes, historical candles, instrument master.
- [ ] Caching + rate-limit handling to respect provider terms.
- [ ] WebSocket/live ticks for the chart placeholder.

## 📈 Phase 4 — Analytics & AI engine
**Goal:** Turn placeholders into real analysis.
- [ ] Technical indicators (RSI, MACD, EMAs, VWAP, Bollinger, ATR, etc.).
- [ ] Futures analytics (basis, rollover, OI build-up classification).
- [ ] Options chain analytics (PCR, max pain, support/resistance, IV, Greeks).
- [ ] AI scoring layer (`AI_PROVIDER`) producing structured signals.
- [ ] Trade-plan generator: entry, **stop-loss**, **target**, **risk-reward**, confidence, rationale.

## 🛡️ Phase 5 — Risk, positions, scanner, alerts
- [ ] Position-size & risk calculators (capital %, per-trade risk).
- [ ] Position tracking & P&L (paper trading first).
- [ ] Market scanner (filters across segments).
- [ ] Alerts (price/indicator/OI) and notifications.

## 👤 Phase 6 — Accounts, persistence, hardening
- [ ] Database (watchlists, plans, settings, audit log).
- [ ] Auth (JWT/OAuth), rate-limiting, input validation, audit trails.
- [ ] Observability: logging, metrics, error tracking.

## 🚀 Phase 7 — Deployment
- [ ] Containerise services (Docker) + compose for local.
- [ ] Frontend (e.g. Vercel) · Backend & AI engine (container host).
- [ ] CI/CD pipelines, environment promotion, secrets management.
- [ ] Compliance review and production disclaimers.

---

## Guiding Principles
- **Phase discipline:** finish and verify a phase before starting the next.
- **No secrets in code.** Everything via env vars.
- **Risk-first output:** no trade plan without stop-loss, target, and R:R.
- **Respect provider/exchange terms** and regulations at every step.
