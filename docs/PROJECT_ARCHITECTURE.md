# Project Architecture

This document describes the architecture of the **AI Share Market Analysis Tool**
as established in **Phase 1**, and how it is designed to grow.

---

## 1. High-Level Overview

The system is a **monorepo** composed of three independently runnable services
that communicate over HTTP. This keeps concerns separated and lets each service
scale, deploy, and evolve on its own.

```
                         ┌───────────────────────────────────────────┐
                         │                Browser (User)             │
                         └───────────────────────────────────────────┘
                                            │  HTTPS
                                            ▼
┌───────────────────────────────────────────────────────────────────────────┐
│  FRONTEND  (Next.js + React + TS + Tailwind)            :3000               │
│  • Premium dark-mode trading dashboard                                      │
│  • Card-based, responsive (desktop / tablet / mobile)                       │
│  • Reads from BACKEND only (never the AI engine directly, in prod)          │
└───────────────────────────────────────────────────────────────────────────┘
                                            │  REST (JSON)
                                            ▼
┌───────────────────────────────────────────────────────────────────────────┐
│  BACKEND  (Node.js + Express + TS)                       :4000              │
│  • API gateway / orchestration / validation / auth (future)                │
│  • Talks to market-data providers (future) and the AI engine               │
│  • CORS, error handling, request logging                                    │
└───────────────────────────────────────────────────────────────────────────┘
            │                                              │
            │ (future) market data                         │ REST (JSON)
            ▼                                              ▼
┌───────────────────────────┐         ┌────────────────────────────────────────┐
│  MARKET DATA PROVIDERS     │         │  AI ENGINE  (Python + FastAPI)   :8000 │
│  (future, authorised)      │         │  • Technical / futures / options logic │
│  Zerodha · Upstox · Dhan · │         │  • AI scoring & trade-plan generation  │
│  Angel One · TrueData ...  │         │  • Placeholder logic in Phase 1        │
└───────────────────────────┘         └────────────────────────────────────────┘
```

---

## 2. Services

### 2.1 Frontend (`frontend/`)
- **Stack:** Next.js (App Router), React, TypeScript, Tailwind CSS.
- **Responsibilities:** Presentation only. Renders the dashboard, formats data,
  and (later) calls the backend. In Phase 1 it renders **mock data**.
- **Key structure:**
  ```
  frontend/src/
  ├── app/                 # App Router entry (layout, page, global styles)
  ├── components/
  │   ├── layout/          # Sidebar, Header
  │   ├── ui/              # Reusable primitives (Card, Badge, Stat, ...)
  │   └── dashboard/       # The 10 dashboard sections
  ├── lib/                 # mock data + formatting helpers
  └── types/               # shared TypeScript types
  ```
- **Design system:** dark, professional, minimal clutter, colour-coded
  bullish (green) / bearish (red) / neutral (amber) signals, card-based grid.

### 2.2 Backend (`backend/`)
- **Stack:** Node.js, Express, TypeScript.
- **Responsibilities:** The single entry point for the frontend. Validates
  requests, orchestrates calls to the AI engine and (future) data providers,
  normalises responses, handles errors and CORS. Keeps provider keys server-side.
- **Key structure:**
  ```
  backend/src/
  ├── index.ts             # server bootstrap
  ├── app.ts               # express app + middleware wiring
  ├── config/env.ts        # typed environment config
  ├── routes/              # route definitions (health, market, analysis)
  ├── controllers/         # request handlers (placeholder responses)
  ├── middleware/          # error handler, 404, (future) auth/rate-limit
  └── utils/               # mock data, async wrapper
  ```

### 2.3 AI Engine (`ai-engine/`)
- **Stack:** Python, FastAPI, Pydantic, Uvicorn.
- **Responsibilities:** Heavy/analytical work — technical indicators, futures
  and options analytics, open-interest interpretation, and AI scoring that
  produces a structured trade plan. Isolated in Python so the data-science
  ecosystem (pandas, numpy, TA libraries, ML) can be used later.
- **Key structure:**
  ```
  ai-engine/app/
  ├── main.py              # FastAPI app + router registration + CORS
  ├── config.py            # settings from environment
  ├── routers/             # health, equity, futures, options, trade_plan
  ├── models/schemas.py    # Pydantic request/response models
  └── services/analysis.py # placeholder analysis logic (extend later)
  ```

---

## 3. Data Flow (target design)

A typical "analyse this symbol" request will flow like this:

1. **User** selects a symbol/segment in the dashboard.
2. **Frontend** → `POST /api/analysis/trade-plan` on the **backend**.
3. **Backend** validates input, fetches required **market data** (future:
   from an authorised provider), and forwards a normalised payload to the
   **AI engine** (`POST /analyse/trade-plan`).
4. **AI engine** computes indicators / OI / scoring and returns a structured
   trade plan (action, entry, stop-loss, target, risk-reward, rationale,
   confidence, disclaimer).
5. **Backend** post-processes/normalises and returns JSON to the frontend.
6. **Frontend** renders it in the relevant card with colour-coded signals.

> In **Phase 1**, steps 3–4 return **placeholder** data; no real market or AI
> calls are made.

---

## 4. Why this separation?

- **Language fit:** Python is best for analytics/ML; Node/TS is great for an I/O
  API gateway and shares types with the React frontend.
- **Security:** Provider/AI keys live only in the backend (and engine), never in
  the browser.
- **Scalability:** The AI engine can be scaled or deployed separately (e.g. GPU
  hosts) without touching the web tier.
- **Testability:** Each service can be developed and mocked independently.

---

## 5. Configuration & Secrets

All configuration is via **environment variables** (see `.env.example` files).
No secrets are committed. Provider selection is by name (e.g.
`MARKET_DATA_PROVIDER=zerodha`) so providers can be swapped without code changes.

---

## 6. Phase 1 Scope (what exists now)

- ✅ Three runnable services with health checks.
- ✅ Full dashboard UI with all 10 sections (mock data).
- ✅ Placeholder REST endpoints on backend and AI engine.
- ✅ Documentation, env templates, and branch workflow.
- ❌ No live data, no broker APIs, no real AI, no persistence, no auth.

See [`DEVELOPMENT_ROADMAP.md`](DEVELOPMENT_ROADMAP.md) for what comes next.
